---
name: echarts-interaction-perf
description: Diagnose and fix Apache ECharts charts that lag during interaction (pointer move, zoom, drag, marker or crosshair updates, synced charts, 10k-500k point series). Measure first, then check the hot-path pitfalls - getOption() deep clones, setOption used to move overlays, dataZoom sync loops - with benchmark numbers. Use for "chart is laggy", "mousemove is slow", "zoom stutters", "ECharts performance", "차트 버벅임", "ECharts 성능".
---

# ECharts interaction performance

Use this when an existing ECharts chart feels slow **while the user interacts with it**. For setting up charts, theming or
chart-type choice, use a general ECharts skill instead.

The rule: **measure, find which of your own functions calls the expensive library function, fix one thing, measure
again.** Most interaction lag is JavaScript in event handlers, not canvas drawing.

## Workflow

1. **Reproduce one gesture** with realistic data size (pointer sweep, wheel zoom, marker drag). See
   [references/measure-workflow.md](references/measure-workflow.md).
2. **Record and bucket the time**: Chrome DevTools Performance, or run
   `scripts/profile-interaction.mjs` (headless Chrome, prints Scripting / Layout / Other, hottest functions and their
   callers). Profile a build that keeps function names, otherwise the report shows `k`, `e.addData`.
3. **If Scripting dominates, walk up from the hot library function to your own caller.** Check the pitfalls below in
   that order. Do not touch renderer settings (canvas/SVG, `large`, `progressive`) before ruling these out.
4. **Change one thing, re-run the same gesture, keep a before/after table.** Use medians of at least three runs and say
   whether it was a dev or production build.

## Pitfalls to check (details and numbers: [references/pitfalls.md](references/pitfalls.md))

| # | Symptom in the profile | Cause | Fix |
|---|---|---|---|
| 1 | `getOption` / `clone` high in self or inclusive time; heavy GC during mouse moves | `chart.getOption()` deep-clones every series' data on **every call** (roughly 0.5-0.9 ms per 10k points: 18 ms at 200k, 44 ms at 500k) | Do not call it in hot handlers. Keep the values you need (zoom range, selected legend) in your own state, updated from `dataZoom` / `legendselectchanged` events; call `getOption()` only on demand |
| 2 | `setOption` / `GlobalModel.setOption` under a mousemove handler | Any `setOption`, **including a merge that only changes `markLine` or `graphic`**, re-processes the model: about 3 ms at 10k points, 30 ms at 200k, 64 ms at 500k | Move overlays without `setOption`: a zrender element updated with `.attr()` (about 1-1.5 ms including paint at 500k), or a DOM element positioned over the canvas. Coalesce to one update per animation frame |
| 3 | Event count explodes after one zoom; CPU stays busy; zoom may flicker or snap back (confirm in your recording) | Two charts re-dispatch `dataZoom` to each other and float noise keeps the range "changing" | Tag programmatic dispatches (`$fromSync`) and ignore them, or compare ranges with an epsilon, or use the built-in `echarts.connect` when it fits |
| 4 | First render or zoom-out is slow with very large series | ECharts ingests every point; built-in `sampling` / `large` changed first-render time only slightly in the benchmark (about 170 -> 160 ms at 500k; redraw during zoom was not measured) | Hand the chart a summary (min/max buckets, a few hundred to a few thousand points) for the overview and fetch detail for the zoomed range |

Not benchmarked in this skill, but worth checking when the profile points there: option builders re-running for every
chart when one group changes, charts mounted off-screen or hidden by filters, per-sensor requests that could be batched,
linear scans where a binary search works. Count how often your own functions run per gesture (React Profiler, counters).

## Rules for the answer

- Quote numbers from the benchmark only with their conditions (synthetic random-walk data, headless Chrome, one machine;
  `bench/results/RESULTS.md`). Tell the user to re-measure on their data.
- `chart.getModel().option` avoids the clone, but it is an internal, undocumented object: say so, prefer your own
  state, and cover it with a test when you use it.
- Never promise a speed-up factor for the user's app. Show the before/after recording instead.
- Report what was verified (re-measured) separately from what was only reasoned about.

## Files

- [references/measure-workflow.md](references/measure-workflow.md) - recording, bucketing, caller tracing, script usage
- [references/pitfalls.md](references/pitfalls.md) - each pitfall with code, source evidence, benchmark table, caveats
- `scripts/profile-interaction.mjs` - interaction profiler (needs `playwright-core` in the project and a local Chrome)
- `scripts/example-mousemove.mjs` - example gesture module to copy
