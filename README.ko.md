# echarts-interaction-perf

**사용자가 조작할 때 버벅이는 Apache ECharts 차트**(마우스 이동, 확대·축소, 드래그, 마커 편집, 동기화된 차트, 1만~50만 점 시리즈)를 진단하고 고치는 에이전트 스킬입니다. 측정을 먼저 하는 절차, 프로파일 스크립트, 재현 가능한 벤치마크 수치를 근거로 한 "잦은 이벤트 경로" 함정 목록을 제공합니다.

English: [README.md](README.md)

```bash
npx skills add junhooo111/echarts-interaction-perf
```

## 왜 필요한가

차트 조작 지연은 보통 캔버스 그리기가 아니라 **이벤트 핸들러 안의 JavaScript**에서 생깁니다. ECharts 5.6.0과 6.1.0에서 합성 데이터와 헤드리스 Chrome으로 측정한 대표 사례입니다.

| 핸들러가 하는 일 | 20만 점 | 50만 점 |
|---|---|---|
| `chart.getOption()` (모든 시리즈 데이터 깊은 복사) | 18 ms, 호출당 20 MB 쓰레기 | 44 ms, 49 MB |
| `chart.setOption({ markLine 또는 graphic만 변경 })`으로 선 이동 | 30 ms | 64 ms |
| zrender 요소 `.attr()` + 그리기 (같은 결과) | 1.0 ms | 1.3 ms |

전체 표와 조건: [`bench/results/RESULTS.md`](bench/results/RESULTS.md). 알아둘 결과 하나: `setOption`으로 `graphic`만 병합해도 `markLine`을 바꾸는 것과 비용이 같습니다. 이벤트마다 `setOption`을 부르지 않는 것이 해결책입니다.

## 스킬이 하는 일

1. 문제 조작 하나를 재현하고 **코드를 고치기 전에 녹화**하게 합니다.
2. 메인 스레드 시간을 분류하고, 느린 라이브러리 함수에서 **내 코드의 호출 지점**까지 거슬러 올라갑니다.
3. 네 가지 함정을 순서대로 점검합니다: 잦은 핸들러의 `getOption()`, 오버레이를 `setOption`으로 이동, `dataZoom` 동기화 되먹임, 매우 큰 시리즈의 첫 렌더 ([상세](skills/echarts-interaction-perf/references/pitfalls.md)).
4. 같은 조작으로 잰 전후 표를 요구하고, 측정한 사실과 추측을 구분해서 보고합니다.

## 프로파일 스크립트

```bash
npm i -D playwright-core        # 설치된 Chrome 사용
node skills/echarts-interaction-perf/scripts/profile-interaction.mjs \
  --url=http://localhost:5173/ --interaction=./my-gesture.mjs
```

제공한 조작 모듈을 헤드리스 Chrome에서 실행하고, 메인 스레드 구간별 시간, 자체 시간·포함 시간 상위 함수, 가장 무거운 호출 관계를 출력합니다. 이 저장소의 데모 페이지에서 같은 조작(20만 점, 프로파일러 연결 상태라 절대 시간은 부풀려져 있습니다)을 비교한 결과입니다.

| | 느린 핸들러 (`getOption` + `setOption`) | 빠른 핸들러 (자체 상태 + zrender 요소) |
|---|---|---|
| 메인 스레드 작업 시간 | 23.2 s | 1.2 s |
| 스크립트 비중 | 94.6% | 67.3% |
| 가비지 컬렉션 | 14.8% | 4.6% |

원본 보고서: [`examples/profile-slow.md`](examples/profile-slow.md), [`examples/profile-fast.md`](examples/profile-fast.md)

## 벤치마크 재현

```bash
cd bench
npm install
npm run build
node run.mjs            # 기본 3회, --quick은 짧은 확인용
```

시나리오: (A) 잦은 핸들러에서 차트 상태 읽기, (B) 오버레이 선 이동, (C) 두 차트의 `dataZoom` 동기화, (D) 큰 시리즈 첫 렌더. 합성 데이터만 사용합니다.

## 한계

- 수치는 한 대의 PC에서 잰 값입니다(환경은 `RESULTS.md` 참고). 비율과 데이터 크기에 따른 증가 양상은 참고할 수 있지만 절대 ms는 환경마다 다릅니다.
- ECharts 5.6.0과 6.1.0, 캔버스 렌더러의 선 차트만 확인했습니다.
- `chart.getModel().option`은 복사를 피하지만 내부 객체입니다. 스킬은 자체 상태 보관을 먼저 권합니다.
- 이 스킬은 대용량 차트를 쓰는 실제 대시보드를 프로파일링한 경험에서 나왔습니다. 제품 코드나 데이터는 들어 있지 않습니다.

## 라이선스

MIT
