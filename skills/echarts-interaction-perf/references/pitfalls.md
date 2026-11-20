# Interaction hot-path pitfalls

All numbers below come from `bench/` in this repository: synthetic random-walk line series, one chart, headless Chrome
157 on an AMD Ryzen 5 5600 (Windows 11), ECharts 5.6.0 and 6.1.0, 3 fresh page loads per configuration, median of
medians. The two ECharts versions behaved the same, so one table is shown. Treat them as reference values; re-run
`bench/` or profile your own chart for decisions. Full tables: [`bench/results/RESULTS.md`](../../../bench/results/RESULTS.md).

## 1. `getOption()` in a hot handler

```ts
// slow: runs on every mousemove / dataZoom event
chart.getZr().on('mousemove', () => {
  const zoom = chart.getOption().dataZoom[0]
  label.textContent = `${zoom.start}-${zoom.end}`
})
```

**Why.** `ECharts.getOption()` returns `GlobalModel.getOption()`, which starts with `clone(this.option)`
(`echarts/lib/model/Global.js`, present in 5.6.0 and 6.1.0). The clone includes every series' `data`, so cost and garbage
grow with the number of points, and the garbage shows up as GC pauses (p95 can be several times the median).

| points per series | ms per call (median / p95) | allocated per call |
|---|---|---|
| 10k | 0.50 / 0.80 | 1.1 MB |
| 50k | 2.4 / 12 | 5.3 MB |
| 200k | 18 / 33-37 | 20 MB |
| 500k | 44 / 77-82 | 49 MB |
| 4 series x 50k | 19 / 30 | 20 MB |

At 200k points one call already costs more than a 16 ms frame.

**Fix.**

```ts
const view = { start: 0, end: 100 }
chart.on('dataZoom', (e) => {
  const range = e.batch ? e.batch[0] : e
  view.start = range.start ?? view.start
  view.end = range.end ?? view.end
})
chart.getZr().on('mousemove', () => {
  label.textContent = `${view.start}-${view.end}` // plain object read, no clone
})
```

Reading the zoom range from the `dataZoom` event (or from the `dataZoom` option you passed in) is a public-API way to
avoid the clone. `chart.getModel().option` also returns the live object without cloning (measured below 0.001 ms), but
it is an internal object: do not mutate it, expect it to change between versions, and test it if you rely on it.

**When `getOption()` is fine.** Once per user action (save, export, restore state), never per pointer event.

## 2. Moving an overlay with `setOption`

```ts
// slow: crosshair or event marker follows the pointer via setOption
chart.setOption({ series: [{ id: 's0', markLine: { data: [{ xAxis }] } }] })   // merge, markLine only
chart.setOption({ graphic: [{ id: 'cursor', type: 'line', shape: { x1, x2 } }] }) // merge, graphic only
```

**Measured.** Both forms cost the same, and the cost scales with the data in the chart, even though the change is tiny:

| variant (ms per update, median) | 10k | 200k | 500k |
|---|---|---|---|
| `setOption` markLine (merge) | 3.1 | 30 | 64 |
| `setOption` graphic (merge) | 2.9 | 30 | 64 |
| zrender element `.attr('shape')`, update only | < 0.001 | < 0.001 | < 0.001 |
| zrender element, update + synchronous paint | 0.3 | 1.0 | 1.3 |
| DOM overlay `transform` | < 0.001 | < 0.001 | < 0.001 |

So "use `graphic` instead of `markLine`" is **not** the fix if both go through `setOption`; the fix is to not call
`setOption` for per-event movement.

**Fix.** Create the overlay once, then only change its position, at most once per animation frame:

```ts
import * as echarts from 'echarts'

const cursor = new echarts.graphic.Line({
  shape: { x1: 0, y1: 20, x2: 0, y2: 350 },
  style: { stroke: '#d33' },
  silent: true,
  z: 100,
})
chart.getZr().add(cursor)

let pendingX: number | null = null
const flush = () => {
  if (pendingX == null) return
  cursor.attr('shape', { x1: pendingX, x2: pendingX })
  pendingX = null
}
const onMove = (e: { offsetX: number }) => {
  if (pendingX == null) requestAnimationFrame(flush)
  pendingX = e.offsetX
}
chart.getZr().on('mousemove', onMove)

// cleanup (React effect return, component unmount, or before rebuilding the chart)
const dispose = () => {
  chart.getZr().off('mousemove', onMove)
  chart.getZr().remove(cursor)
}
```

- `y1` / `y2` are pixel positions: use the grid margins you configured (`top` and `height - bottom`).
- If a label must follow the pointer, update a DOM node (`textContent` or `transform`) inside the same `flush` instead of
  React state, otherwise every pointer event re-renders the component.

- Convert data values to pixels with `chart.convertToPixel({ xAxisIndex: 0 }, xValue)`.
- Elements added with `getZr().add()` are not managed by ECharts: remove them yourself when you unmount or rebuild.
- Persist the *meaning* of a marker (its x value) in your own state; write it into the option only when the user commits
  the change (drop, release), where one `setOption` per gesture is fine.
- A DOM element absolutely positioned over the canvas is the cheapest option when you do not need the canvas to export
  the overlay.

## 3. Synced charts re-dispatching to each other

```ts
a.on('dataZoom', (e) => b.dispatchAction({ type: 'dataZoom', start: e.start, end: e.end }))
b.on('dataZoom', (e) => a.dispatchAction({ type: 'dataZoom', start: e.start, end: e.end }))
```

Note: for wheel or slider zoom the event usually carries the range in `e.batch[0]`, so `e.start` / `e.end` can be
`undefined`. Dispatching `undefined` ranges is a separate bug you can hit with this snippet.

**Measured (synthetic).** With a tiny float drift introduced on every hop (as happens when ranges are converted between
two coordinate systems), one user zoom produced 400 events (the benchmark's cap) without a guard. With a payload flag
(`$fromSync: true`, ignored by the receiving handler) it produced 2 events; with an epsilon comparison, 1. Whether your
setup loops depends on how you convert ranges: the benchmark shows the failure mode, not a claim about every app.

**Fix.** Pick one: ignore events you dispatched yourself (flag in the payload), skip dispatching when the new range is
within an epsilon of the current one, or use `echarts.connect` for plain synchronisation (not benchmarked here).

```ts
const link = (from: echarts.ECharts, to: echarts.ECharts) =>
  from.on('dataZoom', (e: any) => {
    if (e.$fromSync) return // echo of our own dispatch
    const range = e.batch ? e.batch[0] : e
    if (range.start == null || range.end == null) return
    to.dispatchAction({ type: 'dataZoom', start: range.start, end: range.end, $fromSync: true })
  })
link(a, b)
link(b, a)
```

In the benchmark the extra `$fromSync` field passed to `dispatchAction` did reach the receiving chart's `dataZoom`
handler (ECharts 5.6.0 and 6.1.0), which is why the flag worked there. Re-check this on your version. The benchmark
demonstrates the event explosion; whether a visible "snap back" in your app comes from this loop, from `undefined`
ranges, or from something else has to be confirmed in your own recording.

## 4. Very large series on first render

First render of one series, ms (median):

| variant | 50k | 200k | 500k |
|---|---|---|---|
| all points | 25 | 72-74 | 168-181 |
| `sampling: 'lttb'` | 14-15 | 64-65 | 159 |
| `large: true` + `sampling: 'lttb'` | 14-21 | 63-64 | 153-169 |
| app-side 500-point min/max summary | 1.7-2.0 | 1.7-2.0 | 2.1-2.4 |

In this setup the built-in options saved little at first render because ECharts still ingests every point. (Redraw
cost during zoom or pan with `sampling` / `large` was not measured here, so do not generalise beyond first render.) Passing the chart a small
summary removed almost all of the cost. For zoomable time series: show a summary for the overview, then fetch or slice
the raw points for the visible range when the user zooms in. Use min/max buckets (not every n-th point) so spikes
survive.

## Measurement caveats

- Synthetic data, headless Chrome, one machine: absolute numbers differ on yours. Ratios and the way cost scales with
  data size are the transferable part.
- `performance.now()` has about 0.1 ms resolution, so calls cheaper than that are timed in batches and shown as
  `< 0.001`.
- Allocation per call is the heap growth right after a forced GC and is approximate.
- ECharts 5.6.0 and 6.1.0 were tested. Check other versions before relying on these results.
