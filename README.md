# Parallelism Lab

A complete, browser-based Computer Organization and Architecture mini-project exploring **hardware parallelism**, **software parallelism**, and task dependencies. Built with React, TypeScript, Vite, Tailwind CSS, and Recharts directly in this repository root.

All execution is **simulated**, not a real CPU benchmark. No backend, accounts, database, paid APIs, or API keys are required.

## Requirements and installation

- Node.js 22.12+ with npm (Node.js 24 is supported).
- A modern browser such as Chrome, Edge, Firefox, or Safari.

From the repository root:

```sh
npm install
npm run dev
```

Open the URL printed by Vite, normally **http://127.0.0.1:5173**.

```sh
npm run build       # Type-check and produce dist/
npm run preview     # Serve the production build locally
npm test           # Deterministic simulation tests
npm run test:watch  # Tests during development
npm run test:e2e    # Production desktop and mobile browser tests
npm run check      # Formatting + unit tests + build + browser tests
npm run format     # Format source and configuration files
```

Browser tests use installed Microsoft Edge on Windows and Playwright Chromium on other platforms. If Edge is unavailable on Windows, run `npx playwright install chromium`, then set `channel: undefined` in both projects in `playwright.config.ts`. On Linux/macOS, install the test browser with `npx playwright install --with-deps chromium`. Build before running browser tests independently. Playwright manages its preview server automatically.

## Features

- Light/dark mode toggle available on desktop and mobile. The selected theme is saved locally and restored before the app renders; switching themes preserves playback and workload state.

- Editable task table with add/remove, durations, comma-separated prerequisites, and default restoration.
- Validation of empty/malformed inputs, duplicate IDs, nonpositive/nonfinite durations, unknown dependencies, self-dependencies, duplicate prerequisites, and cycles. Invalid graphs cannot run.
- Four standard scenarios and independent 1–8 core/worker controls with a selectable custom comparison.
- Run, pause, resume, next-event stepping, reset, and 0.25×–4× playback speed. Input/configuration changes reset playback; hiding the tab pauses it.
- SVG Gantt chart with stable core lanes, start/end times, idle intervals, task labels, and a playhead. Very short blocks expose exact data through SVG titles and the accessible timeline description.
- Directional dependency DAG highlighting one deterministic longest weighted critical path.
- CPU state cards, complete/ready/blocked task lists, and a filterable chronological event log.
- Makespan, baseline, total work, speedup, efficiency, core utilization, critical-path metrics, Recharts comparisons, accessible results table, and CSV export.
- Educational explanations, responsive layouts, keyboard controls, skip link, visible focus, chart text alternatives, and reduced-motion support.

## Comparison, presets, and preview

The **Execution Model Comparison** replaces the single timeline with sequential baseline versus the selected standard or custom configuration. Both reuse the Gantt component, a shared time axis, and one playback clock. Models stack on mobile; diagrams scroll without page overflow. A completed model stops its playhead at its own finish. Metrics use each model's own execution interval. Stepping visits the sorted union of completion events from both models.

Before Run or Step, the schedule is a preview, cores and workers show Preview, and no execution events are displayed. Reset/input changes restore this state. Worker cards show the same assignments as core cards: a task holds both resources simultaneously. No actual threads are created.

The compact **Workload preset** selector provides:

- **Independent Tasks:** original durations, no prerequisites; exposes available parallel work.
- **Fully Dependent Tasks:** the same durations in one A-to-F chain; extra resources cannot shorten it.
- **Mixed Dependencies:** the original graph.
- **Experiment: scheduling order:** independent A=2, B=2, C=10. Alphabetical scheduling takes 12 tu on two cores/two workers; starting C immediately permits 10 tu. No optimizer is implemented.

Presets remain editable. Editing marks the workload Custom; loading a preset resets playback. The experiment stays in the existing selector instead of adding another dashboard.

## Default workload and acceptance results

| Task | Duration (tu) | Prerequisites |
| ---- | ------------: | ------------- |
| A    |             4 | —             |
| B    |             3 | —             |
| C    |             2 | —             |
| D    |             4 | A, B          |
| E    |             3 | C             |
| F    |             2 | D, E          |

| Cores | Workers | Makespan | Speedup | Efficiency | Core utilization |
| ----: | ------: | -------: | ------: | ---------: | ---------------: |
|     1 |       1 |    18 tu |      1× |       100% |             100% |
|     2 |       1 |    18 tu |      1× |        50% |              50% |
|     1 |       2 |    18 tu |      1× |       100% |             100% |
|     2 |       2 |    10 tu |    1.8× |        90% |              90% |

The 2-core / 2-worker schedule:

- **Core 1:** A [0,4], D [4,8], F [8,10].
- **Core 2:** B [0,3], C [3,5], E [5,8], idle [8,10].

Total work is **18 tu**. The critical path is **A → D → F = 10 tu**. At time 8, D and E both complete before F starts. An independent task G with duration 1 fits in Core 2's idle gap at time 8, keeping makespan at 10 and raising utilization to 95%.

## Project architecture

```text
src/
  simulation/
    engine.ts               Pure validation, scheduler, critical path, states and events
    engine.test.ts          Acceptance tests and scheduling invariants
    presets.ts              Shared workloads and experiment descriptions
    presets.test.ts         Consistent durations and dependency-limit regressions
  components/
    TaskEditor.tsx          Editable drafts and conversion to task inputs
    Visualizations.tsx      Schedule-derived Gantt, dependency DAG and CPU activity
    PerformanceCharts.tsx   Lazy-loaded Recharts comparisons
  App.tsx                   Configuration, playback, results, log and educational content
  main.tsx                  React entry point
  styles.css                Tailwind, design tokens and responsive styling
e2e/lab.spec.ts              Desktop and mobile production browser tests
```

### Deterministic scheduling

1. Validate the graph and configuration; copy and alphabetically sort IDs with a locale-independent comparison.
2. At the current timestamp, complete **all** tasks finishing now and release both resources.
3. Find pending tasks whose prerequisites are complete, in alphabetical ID order.
4. Start ready tasks using the lowest-numbered free core and worker. Tasks keep both for their full duration.
5. Record dependency waits, resource waits, starts, completions and idle-core intervals.
6. Advance directly to the next completion timestamp and repeat until done.

The engine has no React, timers, randomness, network calls or browser APIs and never mutates inputs. It returns assignments, events, timestamps, metrics and a critical path. `statesAt` derives blocked/ready/running/complete states; `nextEventTime` supplies exact stepping.

The UI precomputes schedules and advances only a playback timestamp. Charts, task states, logs and metrics all consume engine output. Animation speed cannot affect results. Future Gantt blocks preview the full schedule. Logs reveal events through the playhead; an idle event describes the interval starting at its timestamp. Result metrics always describe the **complete** run.

For practical editing and diagrams, the lab supports 1–40 tasks. IDs contain 1–12 uppercase characters (start with A–Z; remaining characters A–Z, 0–9 or underscore). Durations range from 0.001 to 10,000 time units in increments of 0.001. Unsupported precision is rejected explicitly. Scheduling, total work, and critical-path accumulation use integer ticks (1 tick = 0.001 tu); the public API returns time units. Repeated decimal additions no longer split simultaneous events. Metric ratios remain ordinary JavaScript numbers.

### Assumptions and formulas

- Identical cores and CPU-bound tasks, with no preemption or migration.
- Each task occupies exactly one core and one software worker simultaneously.
- At most `min(cores, workers)` tasks run together, subject to readiness.
- Zero synchronization overhead, worker creation cost, context-switch cost and cache/memory-bandwidth effects.
- Cores/workers are abstract resources, not actual Web Workers or operating-system threads.
- Alphabetical list scheduling is deterministic; it need not be optimal for arbitrary graphs.

For total work **W**, sequential time **T₁**, selected makespan **Tₚ**, core count **C**, worker count **S** and critical-path length **L**:

| Metric                          | Formula                                  |
| ------------------------------- | ---------------------------------------- |
| Total work                      | W = sum of all durations                 |
| Sequential baseline             | T₁ = same graph on 1 core / 1 worker = W |
| Critical path                   | L = longest weighted dependency path     |
| Speedup                         | T₁ / Tₚ                                  |
| Core efficiency                 | (T₁ / Tₚ) / C                            |
| Core utilization                | W / (C × Tₚ)                             |
| Makespan lower bound            | Tₚ ≥ max(L, W / min(C, S))               |
| Dependency-only speedup ceiling | T₁ / L                                   |

A valid finite DAG always has ready work until completion. With one core/worker and zero overhead, sequential execution has no internal idle gaps, so its makespan equals total work. Efficiency and utilization coincide numerically because T₁ = W, but their definitions differ. Utilization measures **core capacity**, not thread utilization.

Extra workers alone cannot accelerate idealized CPU-bound work on one core. Extra cores alone do not help when one worker exposes one task at a time. Hardware and software parallelism are complementary. Dependencies and limited resources restrict speedup; real systems introduce further overheads and contention. Concurrency may help I/O-bound programs even on one core.

### Interpreting bounds and the COA connection

The lower bound `max(L, W / min(C,S))` is necessary, not necessarily achievable. Dependencies, resources, task indivisibility and scheduling policy shape the result. A gap above the bound alone does **not** prove suboptimality. The scheduling-order experiment supplies a concrete alternative schedule.

Hardware parallelism also includes pipelining, instruction-level parallelism and SIMD; this project focuses on multicore tasks. Software parallelism exposes independent work and coordinates dependencies. Flynn's SISD, SIMD, MISD and MIMD categories describe instruction/data streams. This lab illustrates tasks on a MIMD-style multicore system, without simulating instruction/data streams or implementing all four architectures.

Viva prompts: Why do extra workers alone not add CPU capacity? Why do extra cores not shorten a chain? Why do efficiency and utilization coincide here? Why is the lower bound not always achievable? Use the paired timelines, worker cards and presets to demonstrate the answers.

## College presentation walkthrough

1. Explain a **core** as hardware capacity and a **worker** as a software execution slot. Both are needed to execute a task.
2. Identify D's prerequisites (A, B) and F's prerequisites (D, E) in the graph.
3. Select **Sequential**. Run or step through the 18-tu timeline.
4. Select **More hardware** and **More software** separately. Each still takes 18 tu because the other resource limits execution.
5. Select **Together**. Step through the union of model events: 3, 4, 5, 7, 8, 9, 10, 13, 16 and 18. D and E finish at 8, enabling F. Selected execution finishes at 10 while the baseline continues to 18. Its 90% utilization remains unchanged.
6. Compare 10 tu against 18 tu: 1.8× speedup, 90% efficiency and 90% core utilization.
7. Increase custom cores and workers to 8. The graph cannot beat its 10-tu critical path; excess cores lower utilization.
8. Make A depend on F to demonstrate cycle validation, then load defaults. Add independent G to fill an idle gap.
9. Export CSV and conclude: software exposes work, hardware executes it, and dependencies set the ultimate limit.

## Verification and deployment

Engine tests cover exact acceptance results, all 64 resource configurations, dependency correctness, non-overlapping core/worker assignments, idle cores, simultaneous completions, fractional durations, critical paths, deterministic behavior, no input mutation, and malformed inputs. Browser tests exercise playback, edits during playback, validation, add/remove/restore, scenarios, custom resources, CSV export, event filters, responsive overflow, reduced motion and automated WCAG accessibility checks. The GitHub Actions workflow runs formatting checks, unit tests, a production build and browser tests on pushes and pull requests.

Local verification on **2 November 2026**: **36 engine/preset tests passed**, **22 desktop/mobile browser tests passed**, production TypeScript/Vite build passed, and desktop/mobile axe WCAG audits reported no violations. Overflow checks include a 375px phone viewport and landscape. Automated accessibility checks complement, but do not replace, manual usability review.

The production artifact is `dist/`, suitable for any static host. Relative asset paths support deployment under a repository subpath. No deployment or automatic merge is performed. Configuration follows the official [Vite guide](https://vite.dev/guide/) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite).

No external fonts, photos, telemetry or third-party runtime APIs are required. Existing Git remote configuration is preserved.
