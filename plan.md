Phase 0 — Foundation (get it on your phone, lock the look)

PWA shell. Why first: you want the "it installs on my phone and works offline" win immediately, before any features exist.


"Scaffold an installable PWA: index.html, manifest.json, service worker, Tailwind via CDN, and an IndexedDB wrapper module. It must install to an iPhone home screen, open full-screen, and load fully offline after first visit. Single-user, no auth. Give me a bare 'Hello' screen for now so I can confirm it installs and runs offline."


Design system. Why second: defining tokens once keeps every later screen consistent instead of drifting.


"Define a friendly visual language for a personal strength app: a warm but focused color palette with semantic tokens (ready / recovering / overworked / neutral), rounded card components, large legible numbers for gym use, big tap targets, and a reusable component kit (cards, buttons, pills, progress bars, bottom nav). Show me a styleguide page rendering every component. Mobile-first."

Phase 1 — Data spine

Schema. Why: everything reads off this; building it wrong is the expensive mistake.


"Design the IndexedDB schema and object stores for: exercises (with per-muscle contribution fractions, equipment, movement pattern), the muscle list, the published MEV/MAV/MRV landmark table, programs/mesocycles with progression + deload, logged sets (weight/reps/RPE/timestamp), and body metrics. Give me typed accessor functions for each store. Include CSV/JSON export + import."


Seed data. Why: separate from schema because it's bulk data, not logic — keeps both prompts clean.


"Seed the exercise library: ~40 common barbell/dumbbell/machine/bodyweight exercises, each with sensible default muscle-contribution fractions (primary full, secondary partial) and movement pattern. Seed the muscle list and published MEV/MAV/MRV ranges per muscle. Make contributions editable later."

Phase 2 — The engine (pure functions, no UI yet)

Volume engine. Why pure + testable: you can verify the math against hand calcs before trusting any screen.


"Write pure functions that compute fractional weekly sets per muscle from logged sets, compare each against MEV/MAV/MRV, return per-muscle status (under / in-zone / over) and a deficit number, plus antagonist/pattern balance checks. Include unit tests with worked examples."


Fatigue / readiness engine. Why: same — isolate the model so you can sanity-check it.


"Write pure functions for objective readiness: per-muscle local recovery (recent volume vs. a recovery window), systemic acute:chronic load ratio (7d vs 28d), and per-lift stall detection from estimated-1RM trend. Output a 0–100 readiness score per muscle and a systemic fatigue flag. A day with no logged sets is just recovery — no check-in required. Include tests."


Recommendation engine. Why last in this phase: it consumes both engines above.


"Write the exercise recommender: score each muscle by readiness × weekly deficit (zeroed if over MRV or still fatigued), score exercises by contribution-weighted muscle priority filtered to available equipment, then greedily pick, subtract covered volume, re-score, and repeat to a target session size. Avoid near-duplicate movements, respect antagonist balance, and return each pick with a human-readable reason. Tests included."

Phase 3 — Core UI loop

Live logging screen. Why first among screens: it's the daily driver and generates the data everything else needs.


"Build the live logging screen using the design system: pick exercise, fast set entry (weight/reps/RPE/done), prefilled targets from the active program, last session's numbers shown for reference, per-set notes. Thumb-fast, no rest timer."


Program builder + live volume warnings. Why now: needs the volume engine, gives logging something to prefill from.


"Build the program/mesocycle builder UI: day splits, set/rep/load targets, progression rule, scheduled deload. As I build a week, show live per-muscle volume totals against landmarks and flag anything under- or over-cooked before I train it."


Home dashboard + the body-map heatmap. Why now: the payoff screen that ties the engines and graphics together.


"Build the home dashboard: a front/back body-map heatmap colored by readiness, a 'recommended session today' card (from the recommender, each pick showing its reason), and a 'this week' panel flagging neglected/overworked muscles. This is the screen I'll open most — make it glanceable and friendly."

Phase 4 — Analytics + polish

Analytics. Why here: nice-to-have that depends on accumulated logged data.


"Build analytics screens with clean charts: PRs (1RM/rep/volume), estimated-1RM trend per lift, weekly volume-per-muscle over time, and a training-frequency calendar. Friendly, readable graphics consistent with the design system."


Body tracking + backup. Why: small, self-contained.


"Add bodyweight + measurements logging with trend charts, and wire up the CSV/JSON export/import as a one-tap backup/restore."


Polish pass. Why last: only worth doing once the app is feature-complete.


"Polish pass: empty states, subtle animations/transitions, the body-map and chart graphics, offline edge cases, and the iOS install prompt/instructions. Make the whole thing feel finished and friendly."