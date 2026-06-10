# Plan app - Feature Roadmap Proposal

A prioritized roadmap for "Plan", the daily board for all of Agustin's projects (tasks,
habits, projects, expenses, meals, shopping). Tauri + React + SQLite, offline-first, synced
to Supabase, used every day.

Grounded in who Agustin is: a robotics / electronics engineering student at Aalborg University
in Esbjerg, recently relocated to Denmark (March 2026), into specialty coffee, currently
job-searching, and juggling several projects at once. Good features make his daily and weekly
flow smoother, not flashier.

Format per feature: name, value, when/why it helps, size (S/M/L), priority.
Buckets: Now / Next / Later.

---

## NOW

The things that pay off every single day, or unblock the immediate life situation
(job hunt, new country).

### Job Hunt Tracker (as a project type)
- Value: One place to track applications, their stage, and next action.
- When/why: He is job-searching right now. Applications scatter across email, tabs, and memory.
  A simple pipeline (Applied / Replied / Interview / Closed) with a "next action + date" per
  entry turns the search into a daily board item instead of background anxiety.
- Size: M
- Priority: High

### Daily Focus / "Top 3 today"
- Value: Pin a tiny set of must-do items above the noise of the full board.
- When/why: With many parallel projects, the board can become a wall. A pinned "Top 3 today"
  (auto-cleared at day rollover) keeps "levanta el dia" honest about what actually matters.
- Size: S
- Priority: High

### Automatizaciones (Automations) screen  [ALREADY PLANNED - MVP]
- Value: Set up templated or scheduled task setups so recurring routines build themselves.
- When/why: He runs the same scaffolding constantly (weekly study blocks, gym/coffee habits,
  expense reviews, a recurring job-hunt check-in). Automations remove the manual re-entry and
  make every other feature here compounding: a Job Hunt "follow up in 5 days" task, a Meal-plan
  "generate shopping list every Sunday", a "weekly review" template all become one-time setups.
  This is the connective tissue for the roadmap, which is why it belongs in Now.
- Size: L (spec already exists)
- Priority: High

### Quick Capture / inbox
- Value: Dump a thought into one box now, sort it into a project later.
- When/why: Ideas (a robotics build idea, a cafe to try, an errand) arrive mid-lecture or
  mid-commute. A frictionless capture that lands in an "inbox" and gets triaged later prevents
  losing them and keeps the main board clean.
- Size: S
- Priority: High

---

## NEXT

High-value once the daily basics are solid; weekly-rhythm and quality-of-life upgrades.

### Weekly Review ritual
- Value: A guided end-of-week pass: what got done, what slipped, what's next week.
- When/why: A student juggling several projects drifts without a checkpoint. A simple weekly
  view that rolls up completed tasks, habit streaks, and spend gives perspective and feeds the
  next week's plan. Pairs naturally with Automations (schedule the review template).
- Size: M
- Priority: Medium

### DKK budgeting + monthly view for expenses
- Value: See where money goes per month in his real currency, with categories.
- When/why: New country, new cost base, no income yet. A monthly category breakdown (rent,
  groceries, coffee, transport) and a simple budget-vs-actual makes the relocation finances
  legible while job-searching. Builds on the existing expenses module.
- Size: M
- Priority: Medium

### Meal plan to shopping list link
- Value: Plan the week's meals, auto-generate the shopping list from them.
- When/why: He already has meals and shopping modules. Linking them removes double entry and
  cuts grocery cost/waste, which matters on a student budget in Denmark. A great Automations
  candidate (regenerate the list every week).
- Size: M
- Priority: Medium

### Calendar / timeline view
- Value: See tasks, habits, and deadlines on a week or month grid, not just a daily list.
- When/why: University deadlines, exams, and job interviews live on dates. A timeline alongside
  the daily board helps him see crunch periods coming and plan around them.
- Size: L
- Priority: Medium

### Habit streaks + light insights
- Value: Visible streaks and simple trends for habits (study, gym, coffee log).
- When/why: Streaks are cheap motivation and fit how he already thinks about routines. Keeps
  consistency through the disruption of settling into a new city.
- Size: S
- Priority: Medium

---

## LATER

Nice once the core loop is humming; specialized or higher-effort.

### Coffee log / brew journal (specialty coffee module)
- Value: Track beans, brew recipes, dial-in notes, and favorite cafes.
- When/why: Specialty coffee is a core identity, not a chore. A dedicated module (or a project
  template) makes the app feel personally his and captures dial-in knowledge he'd otherwise
  re-derive. Build it once the productivity core is rock solid.
- Size: M
- Priority: Low

### Project dashboard / cross-project overview
- Value: A bird's-eye card per project: progress, next milestone, recent activity.
- When/why: With many projects in flight, a portfolio view answers "where does each thing
  stand" without opening each one. Most valuable after there's more per-project structure.
- Size: L
- Priority: Low

### Mobile companion / read + quick-capture on phone
- Value: Check the board and capture items away from the laptop.
- When/why: Capture and "what's next" happen on the move (campus, commute, a cafe). Offline-first
  + Supabase sync makes a lightweight mobile surface feasible later. Larger platform effort, so
  it sits in Later.
- Size: L
- Priority: Low

### Smart reminders / notifications
- Value: Timely nudges for due tasks, habits, and job-hunt follow-ups.
- When/why: Closes the loop on Automations and the Job Hunt tracker (e.g. "follow up on
  application X today"). Depends on those existing first, hence Later.
- Size: M
- Priority: Low

---

## Top 3 I'd build first

1. Automatizaciones (Automations) - It is already specced and it multiplies the value of
   everything else. Recurring study blocks, weekly reviews, meal-to-shopping regeneration, and
   job-hunt follow-ups all become one-time setups. Building it now means later features plug
   into it instead of being hand-maintained.

2. Job Hunt Tracker - It targets the single most pressing thing in Agustin's life right now.
   It is moderate effort, fits the existing "project" model, and immediately reduces real
   stress during the search in a new country.

3. Quick Capture / inbox + Daily Focus "Top 3" - Two small, cheap wins bundled. They protect
   the daily core loop he already relies on: nothing gets lost, and the board stays focused on
   what matters today even with many parallel projects. Low risk, high everyday payoff.

Reasoning: lead with the compounding enabler (Automations), then the one feature that solves
his current life priority (job hunt), then the cheap daily-flow guardrails that make the app he
already opens every day better the moment they ship.
