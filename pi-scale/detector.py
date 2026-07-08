"""Cold-state brew start/end detector for the Pi.

Start: the scale's OWN timer (packet field timer_ms, bytes 2-4) going from
stopped (0) to running. Agustin brews in the scale's auto-mode, where the
firmware itself tares and starts the timer on pour detection (see
COFFEE_SCALE_SPIKE.md CMD 0x07 "tare + start timer, one-shot brew start") —
so "the timer started" is already the scale's own brew-start decision, not
something the Pi needs to infer independently. We still require a real water
flow reading within a few seconds of that edge (see TIMER_CONFIRM_WINDOW_S)
before committing to BREWING, in case the timer got poked without a pour
(e.g. a stray button press).

End: same heuristic as src/components/mobile/BrewView.tsx lines 322-345 —
weight drop >=50g off the running peak AND below 60% of the peak, sustained
3 consecutive notifications -> dripper/filter was lifted off the scale.
The app has this same debounce (anti-noise) and shows the same dip in its
own charts while it confirms the drop — the fix isn't to skip the
debounce, it's to not save that dip: once confirmed, _finish() trims the
datapoints back to the peak (see _peak_index), so the saved/uploaded graph
ends cleanly at "all the water arrived" instead of showing the removal.

The app has a "user tapped start, picked a recipe" gate before any of this
runs; the Pi has no such gate, so it also adds an abort path for false
starts (nudging a cup, weighing beans) so the state machine can't get stuck
in BREWING forever.
"""

import time
from dataclasses import dataclass

from packet import ScaleData

FLOW_CONFIRM_THRESHOLD = 0.4
TIMER_CONFIRM_WINDOW_S = 3.0

REMOVAL_DROP_G = 50
REMOVAL_PEAK_FRACTION = 0.6
REMOVAL_MIN_PEAK_G = 50
REMOVAL_CONSECUTIVE = 3

ABORT_NO_PEAK_SECONDS = 120.0
HARD_CAP_SECONDS = 15 * 60.0


@dataclass
class Datapoint:
    timer_ms: int
    weight_g: float
    flow_g_s: float
    step_idx: int = 0


@dataclass
class FinishedBrew:
    duration_ms: int
    total_water_grams: float
    datapoints: list[Datapoint]
    end_reason: str


class BrewDetector:
    def __init__(self):
        self.state = "IDLE"
        self._prev_timer_ms = 0
        self._pending = False
        self._pending_deadline = 0.0
        self._pending_buffer: list[ScaleData] = []
        self._baseline = 0.0
        self._no_peak_deadline = 0.0
        self._hard_cap_deadline = 0.0
        self._removal_consecutive = 0
        self.peak_weight = 0.0
        self._peak_index = -1
        self.datapoints: list[Datapoint] = []

    def _reset_to_idle(self):
        self.state = "IDLE"
        self._pending = False
        self._pending_buffer = []
        self._removal_consecutive = 0
        self.peak_weight = 0.0
        self._peak_index = -1
        self.datapoints = []

    def _start_brewing(self, now: float):
        self.state = "BREWING"
        self._removal_consecutive = 0
        # Safety net in case auto-tare left a small residual: baseline off
        # the first buffered sample. Normally ~0 already since auto-mode
        # tares as part of the same tare+start action that started the timer.
        self._baseline = self._pending_buffer[0].weight_g if self._pending_buffer else 0.0
        self.datapoints = []
        self.peak_weight = 0.0
        self._peak_index = -1
        for sample in self._pending_buffer:
            self._append_point(sample)
        self._pending = False
        self._pending_buffer = []
        self._no_peak_deadline = now + ABORT_NO_PEAK_SECONDS
        self._hard_cap_deadline = now + HARD_CAP_SECONDS

    def _append_point(self, sample: ScaleData):
        # timer_ms comes straight from the scale's own packet field — it IS
        # the elapsed brew time, no wall-clock bookkeeping needed on the Pi.
        w = sample.weight_g - self._baseline
        self.datapoints.append(Datapoint(timer_ms=sample.timer_ms, weight_g=w, flow_g_s=sample.flow_g_s))
        if w > self.peak_weight:
            self.peak_weight = w
            self._peak_index = len(self.datapoints) - 1

    def _finish(self, reason: str) -> FinishedBrew:
        # "removed" always has a few trailing points below the peak — that's
        # the drop being confirmed (debounce) or the removal itself. Neither
        # belongs in the saved graph: cut back to where the peak was, so the
        # curve ends at "all the water arrived" instead of dipping down.
        if reason == "removed" and 0 <= self._peak_index < len(self.datapoints) - 1:
            self.datapoints = self.datapoints[: self._peak_index + 1]
        last_ms = self.datapoints[-1].timer_ms if self.datapoints else 0
        brew = FinishedBrew(
            duration_ms=last_ms,
            total_water_grams=round(self.peak_weight, 2),
            datapoints=self.datapoints,
            end_reason=reason,
        )
        self._reset_to_idle()
        return brew

    def feed(self, sample: ScaleData, now: float | None = None) -> FinishedBrew | None:
        """Feed one parsed notification. Returns a FinishedBrew when a brew
        just ended (save it); returns None otherwise (including aborts and
        pending-not-yet-confirmed starts, which are silently discarded)."""
        now = now if now is not None else time.monotonic()

        if self.state == "IDLE":
            prev_timer_ms = self._prev_timer_ms
            self._prev_timer_ms = sample.timer_ms

            if self._pending:
                if sample.timer_ms == 0:
                    # timer stopped again before we saw water: false alarm
                    self._pending = False
                    self._pending_buffer = []
                    return None
                self._pending_buffer.append(sample)
                if abs(sample.flow_g_s) > FLOW_CONFIRM_THRESHOLD:
                    self._start_brewing(now)
                    return None
                if now > self._pending_deadline:
                    self._pending = False
                    self._pending_buffer = []
                return None

            if prev_timer_ms == 0 and sample.timer_ms > 0:
                # edge: scale's own timer just started running
                self._pending = True
                self._pending_deadline = now + TIMER_CONFIRM_WINDOW_S
                self._pending_buffer = [sample]
            return None

        # BREWING
        self._prev_timer_ms = sample.timer_ms
        self._append_point(sample)
        w = self.datapoints[-1].weight_g
        peak = self.peak_weight

        dropped = (
            peak >= REMOVAL_MIN_PEAK_G
            and (peak - w) >= REMOVAL_DROP_G
            and w < peak * REMOVAL_PEAK_FRACTION
        )
        if dropped:
            self._removal_consecutive += 1
            if self._removal_consecutive >= REMOVAL_CONSECUTIVE:
                return self._finish("removed")
        else:
            self._removal_consecutive = 0

        if peak < REMOVAL_MIN_PEAK_G and now > self._no_peak_deadline:
            self._reset_to_idle()
            return None
        if now > self._hard_cap_deadline:
            self._reset_to_idle()
            return None
        return None

    def on_disconnect(self, now: float | None = None) -> FinishedBrew | None:
        """Call when the BLE link drops. Finalizes a brew in progress if it
        already reached a real peak; discards it (no save) otherwise."""
        if self.state != "BREWING":
            return None
        if self.peak_weight >= REMOVAL_MIN_PEAK_G:
            return self._finish("disconnected")
        self._reset_to_idle()
        return None
