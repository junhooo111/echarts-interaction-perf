// Micro-benchmarks for ECharts interaction hot paths.
// Everything here is synthetic: random-walk data, no product code.
// The runner (../run.mjs) calls window.__bench.* through Playwright and collects JSON.

const params = new URLSearchParams(location.search)
const version = params.get('v') === 'v6' ? 'v6' : 'v5'
const echarts = version === 'v6' ? await import('echarts-v6') : await import('echarts-v5')

/** Deterministic PRNG so every run sees the same data. */
const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const makeData = (n, seed = 1) => {
  const rand = mulberry32(seed)
  const data = new Array(n)
  let y = 0
  for (let i = 0; i < n; i++) {
    y += rand() - 0.5
    data[i] = [i, y]
  }
  return data
}

/** Min/max bucket summary with a fixed number of output points (app-side downsample). */
const summarize = (data, target = 500) => {
  const bucket = Math.max(1, Math.floor(data.length / (target / 2)))
  const out = []
  for (let i = 0; i < data.length; i += bucket) {
    let min = data[i]
    let max = data[i]
    const end = Math.min(i + bucket, data.length)
    for (let j = i; j < end; j++) {
      if (data[j][1] < min[1]) min = data[j]
      if (data[j][1] > max[1]) max = data[j]
    }
    if (min[0] < max[0]) out.push(min, max)
    else out.push(max, min)
  }
  return out
}

const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { n: samples.length, median: at(0.5), p95: at(0.95), mean, min: sorted[0], max: sorted[sorted.length - 1] }
}

const baseOption = (series) => ({
  animation: false,
  grid: { left: 50, right: 20, top: 20, bottom: 50 },
  xAxis: { type: 'value', min: 'dataMin', max: 'dataMax' },
  yAxis: { type: 'value', scale: true },
  dataZoom: [{ type: 'inside', id: 'dz', xAxisIndex: 0 }],
  series,
})

const makeSeries = (seriesCount, pointsPerSeries, extra = {}) =>
  Array.from({ length: seriesCount }, (_, i) => ({
    id: `s${i}`,
    type: 'line',
    showSymbol: false,
    data: makeData(pointsPerSeries, i + 1),
    ...extra,
  }))

let chart = null
const mount = (option, el = 'stage') => {
  if (chart) chart.dispose()
  chart = echarts.init(document.getElementById(el), null, { renderer: 'canvas', width: 1000, height: 400 })
  chart.setOption(option)
  chart.getZr().refreshImmediately()
  return chart
}

const timeIt = (fn) => {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * performance.now() has ~0.1 ms resolution, so calls that are much cheaper than that must be timed in batches.
 * Returns per-call samples; batches are used automatically when a single call is below `threshold` ms.
 */
const timePerCall = (fn, iterations, { threshold = 0.3, batch = 1000 } = {}) => {
  const single = []
  for (let i = 0; i < iterations; i++) single.push(timeIt(fn))
  if (stats(single).median >= threshold) return { ...stats(single), batched: false }
  const perCall = []
  for (let i = 0; i < Math.max(20, Math.floor(iterations / 5)); i++) {
    const t0 = performance.now()
    for (let j = 0; j < batch; j++) fn()
    perCall.push((performance.now() - t0) / batch)
  }
  return { ...stats(perCall), batched: true }
}

const heapUsed = () => performance.memory?.usedJSHeapSize ?? null
const forceGc = () => {
  if (typeof window.gc === 'function') {
    window.gc()
    window.gc()
  }
}

/** Approximate bytes allocated per call: heap growth over `calls` calls right after a forced GC. */
const allocationPerCall = (fn, calls = 8) => {
  forceGc()
  const before = heapUsed()
  if (before == null) return null
  for (let i = 0; i < calls; i++) fn()
  const after = heapUsed()
  const delta = after - before
  return delta > 0 ? Math.round(delta / calls) : null
}

/** Scenario A: reading chart state inside a hot event handler (mousemove / dataZoom). */
const readInHotPath = ({ seriesCount, points, iterations }) => {
  mount(baseOption(makeSeries(seriesCount, points)))
  const ownState = { dz: { start: 0, end: 100 } }
  chart.on('dataZoom', (e) => {
    const range = e.batch ? e.batch[0] : e
    ownState.dz = { start: range.start ?? ownState.dz.start, end: range.end ?? ownState.dz.end }
  })

  const variants = {
    'getOption() [public, deep clone]': () => chart.getOption().dataZoom[0].start,
    'getModel().option [internal, no clone]': () => chart.getModel().option.dataZoom[0].start,
    'own state from dataZoom events': () => ownState.dz.start,
  }

  const result = {}
  for (const [name, fn] of Object.entries(variants)) {
    for (let i = 0; i < 5; i++) fn() // warm-up
    result[name] = { ...timePerCall(fn, iterations), allocBytesPerCall: allocationPerCall(fn) }
  }
  return result
}

/** Scenario B: moving an overlay line (crosshair / event marker) on every mousemove. */
const overlayUpdate = ({ seriesCount, points, iterations }) => {
  mount(baseOption(makeSeries(seriesCount, points)))
  const zr = chart.getZr()
  const width = 1000
  const xAt = (i) => 60 + ((i * 7) % (width - 100))

  // zrender direct (the element is created once, then only its shape changes)
  const lineEl = new echarts.graphic.Line({
    shape: { x1: 60, y1: 20, x2: 60, y2: 350 },
    style: { stroke: '#d33', lineWidth: 1 },
    silent: true,
    z: 100,
  })
  zr.add(lineEl)

  // DOM overlay baseline (no canvas work at all)
  const dom = document.createElement('div')
  dom.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:400px;background:#d33'
  document.body.appendChild(dom)

  const variants = {
    'setOption markLine (merge)': (k) =>
      chart.setOption({
        series: [{ id: 's0', markLine: { silent: true, symbol: 'none', animation: false, data: [{ xAxis: (k * 7919) % points }] } }],
      }),
    'setOption graphic (merge)': (k) =>
      chart.setOption({
        graphic: [
          {
            id: 'cursor',
            type: 'line',
            silent: true,
            z: 100,
            shape: { x1: xAt(k), y1: 20, x2: xAt(k), y2: 350 },
            style: { stroke: '#d33', lineWidth: 1 },
          },
        ],
      }),
    'zrender element .attr(shape)': (k) => lineEl.attr('shape', { x1: xAt(k), x2: xAt(k) }),
    'DOM overlay transform': (k) => {
      dom.style.transform = `translateX(${xAt(k)}px)`
    },
  }

  const result = {}
  for (const [name, fn] of Object.entries(variants)) {
    for (let k = 0; k < 5; k++) fn(k) // warm-up
    zr.refreshImmediately()
    let counter = 10
    const updateOnly = timePerCall(() => fn(counter++), iterations)
    zr.refreshImmediately()
    const updateAndPaint = []
    for (let k = 0; k < iterations; k++) {
      const t0 = performance.now()
      fn(counter++)
      zr.refreshImmediately()
      updateAndPaint.push(performance.now() - t0)
    }
    result[name] = { updateOnly, updateAndPaint: stats(updateAndPaint) }
  }
  document.body.removeChild(dom)
  return result
}

/** Scenario C: two charts keeping dataZoom in sync - how many events does one user zoom cause? */
const syncLoop = () => {
  const make = (el) => {
    const inst = echarts.init(document.getElementById(el), null, { renderer: 'canvas', width: 1000, height: 200 })
    inst.setOption(baseOption(makeSeries(1, 2000)))
    return inst
  }
  if (chart) chart.dispose()
  chart = null
  const a = make('stage')
  const b = make('stage2')
  const CAP = 400
  const EPS = 1e-9

  const run = (guard) => {
    let events = 0
    let capped = false
    const onZoom = (self, other, label) => (e) => {
      events++
      if (events >= CAP) {
        capped = true
        return
      }
      const range = e.batch ? e.batch[0] : e
      if (guard === 'flag' && e.$fromSync) return
      // mimic a conversion between two coordinate systems: tiny float drift on every hop
      const drift = label === 'a' ? 1.0000000000001 : 0.9999999999999
      const start = (range.start ?? 0) * drift
      const end = Math.min(100, (range.end ?? 100) * drift)
      if (guard === 'epsilon' && Math.abs(start - (range.start ?? 0)) < EPS && Math.abs(end - (range.end ?? 100)) < EPS) return
      other.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start, end, $fromSync: true })
    }
    a.off('dataZoom')
    b.off('dataZoom')
    a.on('dataZoom', onZoom(a, b, 'a'))
    b.on('dataZoom', onZoom(b, a, 'b'))
    a.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 10, end: 60 })
    return { events, capped }
  }

  const result = {
    'mutual dispatch, no guard': run('none'),
    'mutual dispatch + $fromSync flag': run('flag'),
    'mutual dispatch + epsilon compare': run('epsilon'),
  }
  a.dispose()
  b.dispose()
  return result
}

/** Scenario D: first render cost for large series, plain vs built-in options vs app-side summary. */
const initialRender = ({ points, iterations }) => {
  const raw = makeData(points)
  const summary = summarize(raw, 500)
  const build = {
    'plain (all points)': () => baseOption([{ id: 's0', type: 'line', showSymbol: false, data: raw }]),
    "sampling: 'lttb'": () => baseOption([{ id: 's0', type: 'line', showSymbol: false, data: raw, sampling: 'lttb' }]),
    'large: true (+ sampling lttb)': () =>
      baseOption([{ id: 's0', type: 'line', showSymbol: false, data: raw, large: true, sampling: 'lttb' }]),
    'app-side 500-point summary': () => baseOption([{ id: 's0', type: 'line', showSymbol: false, data: summary }]),
  }
  const result = {}
  for (const [name, optionFn] of Object.entries(build)) {
    const samples = []
    for (let i = 0; i < iterations + 1; i++) {
      const option = optionFn()
      const t0 = performance.now()
      mount(option)
      const t = performance.now() - t0
      if (i > 0) samples.push(t) // first run is warm-up
    }
    result[name] = stats(samples)
  }
  return result
}

window.__bench = {
  version,
  echartsVersion: echarts.version,
  readInHotPath,
  overlayUpdate,
  syncLoop,
  initialRender,
}
/**
 * Demo page for scripts/profile-interaction.mjs: ?demo=slow | fast
 * Both variants follow the pointer with a vertical line and show the visible x-range somewhere.
 * - slow: getOption() + setOption({markLine}) on every mousemove (the pattern this skill warns about)
 * - fast: own state + a zrender element moved once per animation frame
 */
const demo = params.get('demo')
if (demo === 'slow' || demo === 'fast') {
  const points = Number(params.get('points') ?? 200000)
  mount(baseOption(makeSeries(1, points)))
  const zr = chart.getZr()
  const ownState = { start: 0, end: 100 }
  chart.on('dataZoom', (e) => {
    const range = e.batch ? e.batch[0] : e
    ownState.start = range.start ?? ownState.start
    ownState.end = range.end ?? ownState.end
  })
  const cursor = new echarts.graphic.Line({ shape: { x1: 0, y1: 20, x2: 0, y2: 350 }, style: { stroke: '#d33' }, silent: true, z: 100 })
  let pendingX = null
  const frame = () => {
    if (pendingX == null) return
    cursor.attr('shape', { x1: pendingX, x2: pendingX })
    pendingX = null
  }
  if (demo === 'fast') zr.add(cursor)
  window.__demoLabel = ''
  zr.on('mousemove', (e) => {
    if (demo === 'slow') {
      const zoom = chart.getOption().dataZoom[0] // deep clone of every series on each event
      window.__demoLabel = `${zoom.start.toFixed(1)}-${zoom.end.toFixed(1)}`
      chart.setOption({
        series: [{ id: 's0', markLine: { silent: true, symbol: 'none', animation: false, data: [{ xAxis: Math.round((e.offsetX / 1000) * points) }] } }],
      })
    } else {
      window.__demoLabel = `${ownState.start.toFixed(1)}-${ownState.end.toFixed(1)}`
      if (pendingX == null) requestAnimationFrame(frame)
      pendingX = e.offsetX
    }
  })
}

window.__ready = true
