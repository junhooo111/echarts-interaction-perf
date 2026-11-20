# Interaction profile (6.71s wall clock)

## Main-thread time (CDP Performance metrics)

| bucket | ms | share of task time |
|---|---|---|
| Scripting (JS) | 821 | 67.3% |
| Layout | 0 | 0.0% |
| Style recalc | 11 | 0.9% |
| Other task work (paint, composite, ...) | 389 | 31.9% |
| **Task total** | 1221 | 100% |

Sampled CPU: 1177.4 ms busy, of which garbage collection 54.1 ms (4.6%).

## Top functions by self time

| function | self ms | share |
|---|---|---|
| PathProxy.rebuildPath assets/echarts-v6-BkvO9nwM.js:9617 | 345.8 | 29.4% |
| containPath assets/echarts-v6-BkvO9nwM.js:10005 | 137.6 | 11.7% |
| (garbage collector) :0 | 54.1 | 4.6% |
| clone$4 assets/echarts-v6-BkvO9nwM.js:226 | 39.2 | 3.3% |
| PathProxy.getBoundingRect assets/echarts-v6-BkvO9nwM.js:9443 | 38.6 | 3.3% |
| containStroke$4 assets/echarts-v6-BkvO9nwM.js:9827 | 30.6 | 2.6% |
| brushText assets/echarts-v6-BkvO9nwM.js:22245 | 24.7 | 2.1% |
| fromLine assets/echarts-v6-BkvO9nwM.js:9124 | 15.5 | 1.3% |

## Top functions by inclusive time (includes callees)

| function | total ms | share |
|---|---|---|
| (root) :0 | 990 | 84.1% |
| ZRender._flush assets/echarts-v6-BkvO9nwM.js:6760 | 466.9 | 39.7% |
| ZRender._refresh assets/echarts-v6-BkvO9nwM.js:6742 | 465.3 | 39.5% |
| CanvasPainter.refresh assets/echarts-v6-BkvO9nwM.js:31959 | 463.9 | 39.4% |
| step assets/echarts-v6-BkvO9nwM.js:5017 | 457.9 | 38.9% |
| Animation.update assets/echarts-v6-BkvO9nwM.js:4996 | 457.4 | 38.8% |
| ZRender.animation.Animation.stage.update assets/echarts-v6-BkvO9nwM.js:6696 | 454 | 38.6% |
| CanvasPainter._paintList assets/echarts-v6-BkvO9nwM.js:32024 | 440.2 | 37.4% |

## Heaviest caller edges (callee <- caller)

| edge | ms |
|---|---|
| PathProxy.rebuildPath assets/echarts-v6-BkvO9nwM.js:9617 <- brushPath assets/echarts-v6-BkvO9nwM.js:22132 | 345.8 |
| containPath assets/echarts-v6-BkvO9nwM.js:10005 <- containStroke assets/echarts-v6-BkvO9nwM.js:10106 | 137.1 |
| (garbage collector) :0 <- (root) :0 | 54.1 |
| PathProxy.getBoundingRect assets/echarts-v6-BkvO9nwM.js:9443 <- Path.getBoundingRect assets/echarts-v6-BkvO9nwM.js:10235 | 38.6 |
| clone$4 assets/echarts-v6-BkvO9nwM.js:226 <- clone$4 assets/echarts-v6-BkvO9nwM.js:226 | 30.7 |
| containStroke$4 assets/echarts-v6-BkvO9nwM.js:9827 <- containPath assets/echarts-v6-BkvO9nwM.js:10005 | 30.6 |
| brushText assets/echarts-v6-BkvO9nwM.js:22245 <- brush$1 assets/echarts-v6-BkvO9nwM.js:22422 | 24.7 |
| fromLine assets/echarts-v6-BkvO9nwM.js:9124 <- PathProxy.getBoundingRect assets/echarts-v6-BkvO9nwM.js:9443 | 15.5 |
