import { useEffect, useState } from "react";

// The whole Plan "Home" UI was designed in a 1280×720 frame that is meant to
// render at 2× on a 2560×1440 screen (see the design handoff). On the user's
// maximized 2K window the frame therefore has to be scaled up uniformly so the
// rail, the topbar and the Home content all grow together — otherwise the fixed
// 64px rail / 48px topbar look tiny and incoherent next to the scaled-up content.
// This hook returns the single factor that fits that frame into the current
// window (letterbox-free: the flex/grid layout stretches to fill the extra
// width), clamped so it stays sane on tiny or huge windows.
const FRAME_W = 1280;
const FRAME_H = 720;

function computeScale(): number {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) return 2;
  const raw = Math.min(w / FRAME_W, h / FRAME_H);
  return Math.max(1, Math.min(2.4, raw));
}

export function useFrameScale(): number {
  const [s, setS] = useState(computeScale);
  useEffect(() => {
    const onResize = () => setS(computeScale());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return s;
}
