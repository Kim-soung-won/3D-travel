# AGENTS.md

여행 경로를 그리는 WebGL 지구본 앱입니다. 개인 프로젝트이고, 결정은 사용자가 합니다.

## 작업 규칙
- **3D 좌표계:** `src/geo/geo.ts`의 `latLonToVector3`만 쓴다. three.js SphereGeometry UV와 맞춘 것이라, 직접 계산하면 텍스처와 어긋난다.
- **지리 계산을 바꿀 때:** `src/geo/geo.test.ts`를 같이 고친다. 기대값은 실제 지리 사실(도시 간 거리, 대권이 지나는 위도)에서 가져온다.
- **장면 컴포넌트(`src/scene/`):**
  - 매 프레임 일은 `useFrame`에서 하고, React 상태를 매 프레임 바꾸지 않는다. 진행률처럼 화면에 보일 값만 1% 단위로 올린다.
  - 카메라 거리는 `CameraRig`의 `fit`(화면 비율에 맞춘 거리)을 기준으로 정한다. 고정값을 쓰면 세로 화면에서 지구본이 잘린다.
  - 핀 라벨은 drei `Html`을 쓰지 않는다. 지구본을 언마운트할 때 React 경고가 난다. 캔버스 밖 DOM 레이어(`PinLabels`)에 두고 `useFrame`에서 화면 좌표를 쓴다.
- **도시 화면(`src/city/`):**
  - 지도는 스타일을 비동기로 불러온 뒤 생긴다. 지도에 무언가 올리는 effect는 `loaded`를 의존성에 넣는다.
  - MapLibre는 컨테이너에 `position: relative`를 덮어쓴다. 크기는 바깥 div가 정하고, 지도는 안쪽 div(100%)에 붙인다.
  - maplibre-gl 6은 ESM 전용이고 번들러에서 워커 주소를 스스로 찾지 못한다. `CityView.tsx`의 `setWorkerUrl(…?worker&url)`을 지우지 않는다. 지우면 빌드 결과물에서 지도가 그려지지 않는다.
  - `useLegs`의 결과는 같은 입력이면 같은 배열이어야 한다. 재생 effect가 이 배열에 걸려 있다.
- **사전 데이터(`src/data/`):** LLM이 만든 미검증 데이터다.
  - 형식은 `types.ts`를 따른다. 환승역은 노선이 달라도 이름 문자열이 같아야 한다(환승 판단 기준).
  - 고치거나 도시를 추가하면 `data.test.ts`가 통과해야 하고, 확실하지 않은 역·구간은 넣지 않는다.
  - 화면에서 데이터 출처 안내(`DATA_NOTICE`)를 빼지 않는다.
  - 도시 데이터 본문은 도시마다 따로 불러온다(`index.ts`의 `loadCityData`·`useCityData`). 첫 번들에는 범위(`?ref`)만 들어간다. 앱 코드에서 `cities/*.json`을 직접 import하지 않는다. 테스트는 `all.ts`를 쓴다.
  - 도시 범위(bbox)는 서로 겹치지 않아야 한다(`data.test.ts`).
- **나라별 도시 목록(`src/data/places.json`, `places-all.json`):** LLM 데이터가 아니라 Natural Earth(퍼블릭 도메인)에서 `scripts/build-places.mjs`로 만든다. 손으로 고치지 말고 스크립트를 고쳐 다시 만든다. 나라 키는 지구본 클릭 판정에 쓰는 world-atlas 이름이다. 지도에 없는 작은 나라의 도시는 가까운 나라에 붙이고 7번째 칸에 원래 나라 이름을 적는다.
- **공항(`src/data/airports.json`):** OurAirports(퍼블릭 도메인)에서 `scripts/build-airports.mjs`로 만든다. 손으로 고치지 말고 스크립트를 고쳐 다시 만든다. 공항 우선순위·도심 교통(`airport-access.json`)은 AI 생성 참고값이고, 고치면 `airports.test.ts`가 통과해야 한다.
- **시간 계산(`src/state/schedule.ts`):** 시각은 절대 시각(UTC ms)으로 계산하고 보일 때만 현지 시각으로 바꾼다. 시간대는 `src/geo/timezone.ts`(좌표 → IANA 이름)를 쓰고, 시간대 계산은 `Intl`만 쓴다. 고치면 `schedule.test.ts`의 시차·서머타임·날짜 변경선 예시가 통과해야 한다.
- **공유·저장 형식(`src/share/format.ts`):** 링크·파일·자동 저장이 같은 형식(지금 v6, v1~v5도 읽음)을 쓴다.
  - 경유지 링크는 남에게서 받은 값이므로 `src/state/link.ts`의 `safeLink`(http·https만)를 거쳐서만 저장하고 그린다.
  - 필드를 바꾸면 `FORMAT_VERSION`을 올린다. 예전 버전을 읽는 코드는 남긴다. 이미 퍼진 링크가 깨지기 때문이다.
  - 예시 일정 링크 600자 이하는 테스트로 지킨다.
- **화면 원칙:** `../dashboard-design-principles`의 원칙을 따른다.
  - 지우기는 확인 창 대신 즉시 실행 + 되돌리기다.
  - 할 수 없는 동작은 이유를 화면 글로 보인다.
  - 아이콘 버튼에는 `aria-label`을 단다.
- **고친 뒤 확인:**
  - `npm test`와 `npm run build`가 통과해야 한다.
  - 화면이 바뀌었으면 넓은 폭(1440)과 좁은 폭(390)에서 직접 열어 본다.
- **외부 API:** 키를 코드에 넣지 않는다. 공개 서버(OpenFreeMap, OSRM, Nominatim)는 요청 간격과 캐시를 지킨다. 주소 조회는 1초에 한 번 이하다.
- **개발 이력·계획:** 의미 있는 변경을 마치면 함께 갱신한다. 형식은 [docs/history/README.md](docs/history/README.md)에 있다.
  - 상세: `docs/history/details/YYYY-MM-DD-NN-<주제>.md`
  - 일자별 요약: 그날 파일에 한 줄 추가하고 상세로 링크한다.
  - 계획: [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md)에서 항목 상태를 옮긴다.
  - 사용자가 고른 것은 "사용자 결정"에 적는다. 아직 정하지 않은 것은 ROADMAP "결정 필요"에 두고 결론 내지 않는다.
