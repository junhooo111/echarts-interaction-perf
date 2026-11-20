# echarts-interaction-perf

[![skills.sh](https://skills.sh/b/junhooo111/echarts-interaction-perf)](https://skills.sh/junhooo111/echarts-interaction-perf)

An agent skill for **Apache ECharts charts that lag while the user interacts** (pointer move, zoom, drag, marker edits,
synced charts, 10k-500k point series). It gives the agent a measure-first workflow, a profiler script, and a checklist of
hot-path pitfalls backed by numbers from a reproducible benchmark.

한국어: [README.ko.md](README.ko.md)

```bash
npx skills add junhooo111/echarts-interaction-perf
```

## Why

Interaction lag in chart apps is usually JavaScript in event handlers, not canvas drawing. Two common culprits in
ECharts code (measured here on ECharts 5.6.0 and 6.1.0, synthetic data, headless Chrome):

| what the handler does | cost at 200k points | cost at 500k points |
|---|---|---|
| `chart.getOption()` (deep-clones all series data) | 18 ms, 20 MB garbage per call | 44 ms, 49 MB per call |
| `chart.setOption({ ...markLine or graphic only })` to move a line | 30 ms | 64 ms |
| zrender element `.attr()` + paint (same visual result) | 1.0 ms | 1.3 ms |

Full tables, conditions and caveats: [`bench/results/RESULTS.md`](bench/results/RESULTS.md). One result worth knowing:
merging only `graphic` through `setOption` costs the same as changing `markLine`; the saving comes from not calling
`setOption` per event at all.

## What the skill does

1. Makes the agent reproduce one gesture and **record it before changing code**.
2. Buckets main-thread time (scripting / layout / other) and walks from the hot library function up to *your* caller.
3. Checks four pitfalls in order: `getOption()` in hot handlers, `setOption` used to move overlays, `dataZoom` sync loops,
   very large series on first render ([details](skills/echarts-interaction-perf/references/pitfalls.md)).
4. Requires a before/after table from the same gesture and keeps measured facts separate from guesses.

## Profiler script

```bash
npm i -D playwright-core        # uses your installed Chrome
node skills/echarts-interaction-perf/scripts/profile-interaction.mjs \
  --url=http://localhost:5173/ --interaction=./my-gesture.mjs
```

It runs a gesture module you provide in headless Chrome and prints main-thread buckets, top functions by self and
inclusive time, and the heaviest `callee <- caller` edges. Example on the demo page in this repo (same gesture, 200k
points, ECharts 6.1.0, profiler attached so absolute times are inflated):

| | slow handler (`getOption` + `setOption`) | fast handler (own state + zrender element) |
|---|---|---|
| main-thread task time | 23.2 s | 1.2 s |
| scripting share | 94.6% | 67.3% |
| garbage collection | 14.8% | 4.6% |
| inclusive time | `ECharts.setOption` ~59%, `ECharts.getOption` ~21% | zrender refresh ~39% |

Raw reports: [`examples/profile-slow.md`](examples/profile-slow.md), [`examples/profile-fast.md`](examples/profile-fast.md).

## Reproduce the benchmarks

```bash
cd bench
npm install
npm run build
node run.mjs            # --runs=3 by default, --quick for a short smoke run
```

Scenarios: (A) reading chart state in a hot handler, (B) moving an overlay line, (C) two charts syncing `dataZoom`,
(D) first render of one large series. The page uses synthetic random-walk data only.

## Limits

- Numbers are from one machine (see the environment table in `RESULTS.md`). Ratios and scaling with data size transfer;
  absolute milliseconds do not.
- Only ECharts 5.6.0 and 6.1.0 were tested, and only line series on the canvas renderer.
- `chart.getModel().option` avoids the clone but is an internal object; the skill recommends keeping your own state first.
- The skill grew out of profiling a production dashboard with very large series. No product code or data is included here.

## Layout

```
skills/echarts-interaction-perf/   the skill (SKILL.md, references/, scripts/)
bench/                             benchmark page, runner and results
examples/                          sample profiler reports
```

## License

MIT
