# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal strength training PWA (Progressive Web App). Single-user, no auth, offline-first. Designed for mobile/gym use — installed to home screen, works fully offline after first visit.

## Tech Stack

- **Frontend**: Vanilla HTML/JS PWA (no build step, ES modules)
- **Styling**: Custom CSS design system (`css/design-system.css`), no Tailwind
- **Storage**: IndexedDB (local-only, single-user)
- **Offline**: Service worker (`sw.js`) with precache + cache-first strategy
- **Hosting**: Static files — deploy to GitHub Pages or any static host

## Development

```bash
# Serve locally
python3 -m http.server 8080 --bind 0.0.0.0

# Open http://localhost:8080
```

No build step. All JS is ES modules loaded directly by the browser. When adding new files, add them to the `PRECACHE_URLS` array in `sw.js` and bump the `CACHE_NAME` version.

## Architecture

```
js/
├── db.js                  # IndexedDB wrapper (open, get, put, delete, export/import)
├── app.js                 # Entry point: SW registration, DB init, seed, router mount
├── data/                  # Data access layer + seed data
│   ├── muscles.js         # 15 muscle groups with body region
│   ├── landmarks.js       # MEV/MAV/MRV per muscle (RP-based defaults)
│   ├── exercises.js       # 46 exercises with equipment, pattern, muscle contributions
│   ├── sets.js            # Logged sets (weight/reps/RPE), e1RM estimation
│   ├── programs.js        # Mesocycle templates, progression defaults
│   ├── metrics.js         # Bodyweight + body measurements
│   └── seed.js            # First-launch seeding orchestrator
├── engine/                # Pure functions — no DB access, fully testable
│   ├── volume.js          # Weekly fractional volume, MEV/MAV/MRV evaluation, balance checks
│   ├── readiness.js       # Local recovery, acute:chronic ratio, stall detection, readiness scores
│   └── recommend.js       # Muscle scoring, exercise scoring, greedy session builder
└── ui/                    # Page modules (mount/unmount lifecycle)
    ├── router.js          # Hash-based SPA router
    ├── home.js            # Dashboard: body-map heatmap, recommendations, weekly summary
    ├── log.js             # Live logging: exercise picker → set entry (weight/reps/RPE)
    ├── program.js         # Template builder with live volume checker
    ├── stats.js           # Analytics: PRs, e1RM trends, volume trends, training calendar
    ├── more.js            # Body metrics, backup/restore
    ├── bodymap.js         # Front/back SVG muscle silhouettes colored by readiness
    ├── charts.js          # SVG line charts, bar charts, calendar heatmap
    └── toast.js           # Toast notification utility
```

### Layer rules

- **`data/`** modules handle IndexedDB reads/writes. Each exports typed accessor functions.
- **`engine/`** modules are pure: `(data in) → (result out)`. They never import from `data/` or `ui/` (except `sets.js` for the `estimateE1RM` helper). All thresholds are constants at the top of each file.
- **`ui/`** pages follow `{ mount(el, ctx), unmount() }` lifecycle. They read data via `data/` modules and compute via `engine/` modules.

## Key Domain Concepts

- **MEV/MAV/MRV**: Minimum Effective / Maximum Adaptive / Maximum Recoverable Volume — weekly set landmarks per muscle
- **Fractional volume**: One set of bench press = 1.0 chest + 0.5 front delts + 0.5 triceps
- **Readiness**: 0–100 per muscle. Combines local recovery (48/72hr windows by muscle size), systemic acute:chronic ratio (7d/28d, graduated scale), and stall detection (3 flat sessions)
- **Recommendation**: priority = readiness × deficit. Greedy pick to ~20 sets/session, avoids duplicate movement patterns

## Routes

`#/home` · `#/log` · `#/program` · `#/stats` · `#/more`
