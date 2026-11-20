# echarts-interaction-perf

[![skills.sh](https://skills.sh/b/junhooo111/echarts-interaction-perf)](https://skills.sh/junhooo111/echarts-interaction-perf)

**Your ECharts chart stutters when users move the mouse or zoom. This skill makes your coding agent find out why, with
a profile instead of a guess.**

It gives the agent a measure-first workflow, a profiler script, and a checklist of the most expensive hot-path mistakes
in interaction handlers. Every item on the checklist is backed by numbers from a benchmark you can re-run.

```bash
npx skills add junhooo111/echarts-interaction-perf
```

## The problem it targets

Interaction lag in chart apps is usually caused by JavaScript inside event handlers, not by canvas drawing. Code that looks
harmless can cost a lot. These are the costs on a single series (ECharts 5.6.0 and 6.1.0, headless Chrome, synthetic data):

| what the handler does | 200k points | 500k points |
|---|---|---|
| `chart.getOption()` to read the zoom range | 18 ms and 20 MB of garbage per call | 44 ms and 49 MB per call |
| `chart.setOption({ ...markLine or graphic only })` to move a line | 30 ms per update | 64 ms per update |
| zrender element `.attr()` plus paint, same visual result | 1.0 ms | 1.3 ms |

A frame at 60 fps lasts 16 ms. If you run either of the first two on every `mousemove`, the chart cannot keep up.

One result worth noting: merging only `graphic` through `setOption` costs the same as changing `markLine`. The saving
comes from not calling `setOption` on every event, not from choosing a different option key.

Full tables, conditions and caveats: [`bench/results/RESULTS.md`](bench/results/RESULTS.md).

## What your agent will do

1. Reproduce one gesture and **record it before touching code**.
2. Split main-thread time into scripting, layout, and everything else, then trace from the hot library function back to
   *your* caller.
3. Check the pitfalls in order ([details and code](skills/echarts-interaction-perf/references/pitfalls.md)):
   `getOption()` in hot handlers, `setOption` used to move overlays, `dataZoom` sync loops, very large series on first
   render.
4. Re-run the same gesture after each change and report a before/after table, keeping measured results separate from
   reasoning.

It does not promise a speed-up factor for your app. It shows you the recording instead.

## Profiler script

```bash
npm i -D playwright-core        # uses your installed Chrome, no browser download
node skills/echarts-interaction-perf/scripts/profile-interaction.mjs \
  --url=http://localhost:5173/ --interaction=./my-gesture.mjs
```

It runs a gesture module that you provide in headless Chrome and prints main-thread buckets, the hottest functions by self
time and inclusive time, and the heaviest `callee <- caller` edges, so you can see which of *your* functions calls the
expensive one.

The same gesture on this repo's demo page (200k points, ECharts 6.1.0). The profiler was attached, so absolute times are
inflated:

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
node run.mjs            # 3 runs per configuration; --quick for a short smoke test
```

There are four scenarios: reading chart state in a hot handler, moving an overlay line, two charts syncing `dataZoom`, and
the first render of one large series. The page uses only synthetic random-walk data, so there is nothing to configure.

## Honest limits

- The numbers come from one machine (see the environment table in `RESULTS.md`). The ratios, and how cost scales with data
  size, should carry over to other machines. The absolute milliseconds will not.
- Only ECharts 5.6.0 and 6.1.0, line series, and the canvas renderer were tested.
- `chart.getModel().option` avoids the clone, but it is an internal object. The skill recommends keeping your own state
  first.
- The built-in `sampling` and `large` options were measured for first render only, not for redraw during zoom or pan.
- This skill grew out of profiling a production dashboard with very large series. It contains no product code or data.

## Feedback

If the skill misses your case, open an issue and attach the profile report from the script (`--json` output works too).
Real recordings are the most useful input for improving the checklist.

## Layout

```
skills/echarts-interaction-perf/   the skill: SKILL.md, references/, scripts/
bench/                             benchmark page, runner and results
examples/                          sample profiler reports
```

## License

MIT
