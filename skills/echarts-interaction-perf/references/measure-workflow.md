# Measuring a chart interaction

Fix nothing before you have a recording. Chart slowness usually comes from the code *around* the chart library
(handlers, state updates, option rebuilds), and only a profile tells you which.

## 1. Reproduce one gesture, repeatably

Pick the single interaction users complain about and make it scriptable: "move the pointer across the plot in 120
steps", "wheel-zoom in 10 steps then out", "drag the event marker". Use the same data size as production (or the largest
you support). A repeatable gesture is what makes before/after comparisons honest.

- Manual: Chrome DevTools -> Performance -> record 5-10 s while you do the gesture.
- Scripted: `scripts/profile-interaction.mjs` runs your gesture module in headless Chrome and prints the buckets,
  the hottest functions and their callers (see "Using the script").

## 2. Split the time into buckets

| Bucket in DevTools | What it means for a chart |
|---|---|
| Scripting | Your handlers, ECharts model/option processing, data transforms, `getOption`, `setOption` |
| Rendering (layout, style) | DOM work around the chart: tooltips, legends, resizing containers |
| Painting / compositing | Canvas draw calls and compositing |
| GC (inside Scripting / Idle) | Garbage from allocations in hot handlers |

If Scripting dominates, the problem is not "drawing is slow". Do not tune renderer settings (canvas vs SVG, `large`,
`progressive`) until you have excluded your own JavaScript.

## 3. Find the caller, not just the hot function

In the Bottom-Up view sort by **Self Time**. A library function at the top (for example `clone`) is almost never the
real bug: expand it and walk up to *your* function that calls it on every event. The fix goes there.

## 4. Change one thing, re-measure the same gesture

Re-run the identical gesture after each fix and record the numbers in your PR. Keep a small table:

| change | scripting ms | task ms | notes |
|---|---|---|---|

Use medians over at least three recordings. Say whether the build was development or production: dev builds are
slower and noisier, so quote absolute numbers as reference values only.

## 5. React layer

A chart wrapper can re-run option builders on every parent render. Use the React Profiler to count commits per
gesture, and count how many times your option-builder function runs. Do not store pointer-driven values (cursor x,
hovered value) in React state: a `setState` per pointer event re-renders on every move. Write them to a DOM node or a
ref instead. Reducing how many charts recompute when one group changes often matters as much as any ECharts setting.

## Using the script

```bash
npm i -D playwright-core          # uses your installed Chrome; no browser download
node skills/echarts-interaction-perf/scripts/profile-interaction.mjs \
  --url=http://localhost:5173/ \
  --interaction=skills/echarts-interaction-perf/scripts/example-mousemove.mjs
```

- `--json` prints machine-readable output; `--top=20` shows more rows; `--channel=msedge` uses Edge.
- The report has three parts: main-thread buckets (from CDP `Performance.getMetrics`), top functions by self time and
  by inclusive time (from the CDP CPU profiler, 200 microsecond sampling), and the heaviest `callee <- caller` edges.
- The script opens only the URL you pass, runs only the gesture module you pass, and prints to stdout.
- Sampling adds overhead, so compare reports taken with the same settings.
