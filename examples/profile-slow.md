# Interaction profile (25.75s wall clock)

## Main-thread time (CDP Performance metrics)

| bucket | ms | share of task time |
|---|---|---|
| Scripting (JS) | 21895 | 94.6% |
| Layout | 0 | 0.0% |
| Style recalc | 31 | 0.1% |
| Other task work (paint, composite, ...) | 1231 | 5.3% |
| **Task total** | 23156 | 100% |

Sampled CPU: 23090.4 ms busy, of which garbage collection 3406.2 ms (14.8%).

## Top functions by self time

| function | self ms | share |
|---|---|---|
| clone$4 assets/echarts-v6-BkvO9nwM.js:226 | 4632.2 | 20.1% |
| (garbage collector) :0 | 3406.2 | 14.8% |
| PathProxy.addData assets/echarts-v6-BkvO9nwM.js:9412 | 3076.3 | 13.3% |
| DataStore._initDataFromProvider assets/echarts-v6-BkvO9nwM.js:18849 | 1524.9 | 6.6% |
| DataStore.get assets/echarts-v6-BkvO9nwM.js:18888 | 1043.5 | 4.5% |
| SeriesData._doInit assets/echarts-v6-BkvO9nwM.js:25407 | 954.7 | 4.1% |
| SeriesData.initData assets/echarts-v6-BkvO9nwM.js:25339 | 723.6 | 3.1% |
| original assets/echarts-v6-BkvO9nwM.js:19389 | 679.5 | 2.9% |

## Top functions by inclusive time (includes callees)

| function | total ms | share |
|---|---|---|
| (root) :0 | 22754.5 | 98.5% |
| Eventful.trigger assets/echarts-v6-BkvO9nwM.js:811 | 19077.4 | 82.6% |
| mousemove assets/echarts-v6-BkvO9nwM.js:5153 | 19066.5 | 82.6% |
| (anonymous) assets/echarts-v6-BkvO9nwM.js:5261 | 19066.5 | 82.6% |
| Handler.mousemove assets/echarts-v6-BkvO9nwM.js:1827 | 19063.7 | 82.6% |
| Handler.dispatchToElement assets/echarts-v6-BkvO9nwM.js:1870 | 18369.6 | 79.6% |
| (anonymous) assets/index-5N6JXIfJ.js:537 | 18325.9 | 79.4% |
| ECharts.setOption assets/echarts-v6-BkvO9nwM.js:23117 | 13544.4 | 58.7% |

## Heaviest caller edges (callee <- caller)

| edge | ms |
|---|---|
| clone$4 assets/echarts-v6-BkvO9nwM.js:226 <- clone$4 assets/echarts-v6-BkvO9nwM.js:226 | 4601 |
| (garbage collector) :0 <- (root) :0 | 3406.2 |
| PathProxy.addData assets/echarts-v6-BkvO9nwM.js:9412 <- PathProxy.lineTo assets/echarts-v6-BkvO9nwM.js:9304 | 3073.2 |
| DataStore._initDataFromProvider assets/echarts-v6-BkvO9nwM.js:18849 <- DataStore.initData assets/echarts-v6-BkvO9nwM.js:18735 | 1524.9 |
| DataStore.get assets/echarts-v6-BkvO9nwM.js:18888 <- progress assets/echarts-v6-BkvO9nwM.js:34472 | 1042 |
| SeriesData._doInit assets/echarts-v6-BkvO9nwM.js:25407 <- SeriesData.initData assets/echarts-v6-BkvO9nwM.js:25339 | 954.7 |
| SeriesData.initData assets/echarts-v6-BkvO9nwM.js:25339 <- createSeriesData assets/echarts-v6-BkvO9nwM.js:26311 | 721.3 |
| original assets/echarts-v6-BkvO9nwM.js:19389 <- DataStore._initDataFromProvider assets/echarts-v6-BkvO9nwM.js:18849 | 618.7 |
