// 구간 경로: 도로를 따르는 수단은 OSRM(FOSSGIS 공개 서버, 키 없음)으로, 지하철은 사전 노선 데이터로,
// 비행기는 대권 직선 + 사전 비행 시간으로, 기차는 지표 직선 + 사전 지상 이동 시간(KTX 등)으로. 데이터가 없으면 직선과 평균 속도로 어림한다.
// 같은 구간은 다시 요청하지 않도록 메모리에 캐시한다. 공개 서버라 시제품 용도로만 쓴다.
import { cityRefAt, intercityLink, loadCityData } from '../data';
import { distanceKm, type LatLon } from './geo';
import { formatDuration, MODES, type Mode } from './modes';
import { longestSeaKm } from './world';
import { describeRides, transitRoute } from './transit';

export interface LegGeometry {
  /** [경도, 위도] 목록 */
  coords: [number, number][];
  /** road: 실제 도로, transit: 사전 노선 데이터, straight: 직선(의도), fallback: 경로를 못 찾아 직선으로 대신 */
  kind: 'road' | 'transit' | 'straight' | 'fallback';
  distanceKm: number;
  durationS: number;
  estimated: boolean;
  /** 비행기 구간에서 시간을 사전 데이터로 알고 있는가 (모르면 화면에 시간을 보이지 않는다) */
  timeKnown?: boolean;
  note?: string;
}

const OSRM = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

const cache = new Map<string, Promise<LegGeometry>>();

export function legKey(a: LatLon, b: LatLon, mode: Mode) {
  const r = (n: number) => n.toFixed(5);
  return `${mode}:${r(a.lon)},${r(a.lat)};${r(b.lon)},${r(b.lat)}`;
}

/** 도로 없이 그리는 구간(비행기·지하철, 또는 도로를 못 찾았을 때) */
export function straightLeg(a: LatLon, b: LatLon, mode: Mode, kind: 'straight' | 'fallback' = 'straight', note?: string): LegGeometry {
  const km = distanceKm(a, b);
  const info = MODES[mode];
  const speed = info.speedKmh ?? (mode === 'walk' ? 4.5 : 40);
  return { coords: [[a.lon, a.lat], [b.lon, b.lat]], kind, distanceKm: km, durationS: (km / speed) * 3600, estimated: true, note };
}

/** 지하철: 두 지점이 같은 도시 데이터 안이면 노선을 따라, 아니면 직선 */
export async function subwayLeg(a: LatLon, b: LatLon): Promise<LegGeometry> {
  const ref = cityRefAt(a);
  const city = ref && cityRefAt(b) === ref ? await loadCityData(ref) : null;
  if (!city) return straightLeg(a, b, 'subway', 'fallback', '노선 데이터가 없는 곳이라 직선으로 표시');
  const r = transitRoute(city, a, b);
  if (!r) return straightLeg(a, b, 'subway', 'fallback', '가까운 역이 없어 직선으로 표시');
  const walkOnly = ((distanceKm(a, b) * 1.3) / 4.5) * 3600;
  const note = !r.rides.length || walkOnly < r.durationS ? `걸어가면 약 ${formatDuration(walkOnly)}로 더 빠릅니다` : describeRides(r);
  return { coords: r.coords, kind: 'transit', distanceKm: r.distanceKm, durationS: r.durationS, estimated: true, note };
}

/** 비행 구간마다 더하는 공항 수속·대기 시간(분). 출발 공항 도착부터 도착 공항을 나설 때까지를 뭉뚱그린 값 */
export const AIRPORT_MIN = 120;

/** 비행기: 대권 직선. 두 도시 사이 비행 시간을 알면 그 값을 쓴다. 어느 쪽이든 공항 수속·대기 시간을 더한다 */
export function planeLeg(a: LatLon, b: LatLon): LegGeometry {
  const leg = straightLeg(a, b, 'plane');
  const airport = AIRPORT_MIN * 60;
  const link = intercityLink(a, b);
  if (!link?.flightMin) return { ...leg, durationS: leg.durationS + airport };
  const ground = link.ground?.map((g) => `${g.name} ${formatDuration(g.minutes * 60)}`).join(' · ');
  const notes = [`비행 ${formatDuration(link.flightMin * 60)} + 공항 수속·대기 ${formatDuration(airport)}`, ground && `지상 대안: ${ground}`];
  return { ...leg, durationS: link.flightMin * 60 + airport, timeKnown: true, note: notes.filter(Boolean).join(' · ') };
}

/** 이보다 긴 바다를 건너는 구간은 기차로 갈 수 없다고 본다. 도버 해협(약 35km)·간몬 해협은 지나고, 대한해협(약 200km)은 막힌다 */
export const TRAIN_MAX_SEA_KM = 80;
const trainBlocks = new Map<string, string | null>();

/** 기차로 갈 수 없는 구간이면 그 이유. 사전 데이터에 기차 시간이 있는 구간(해저 터널 등)은 통과시킨다 */
export function trainBlockReason(a: LatLon, b: LatLon): string | null {
  const key = legKey(a, b, 'train');
  if (trainBlocks.has(key)) return trainBlocks.get(key)!;
  const sea = intercityLink(a, b)?.ground?.some((g) => g.mode === 'train') ? 0 : longestSeaKm(a, b);
  const reason = sea > TRAIN_MAX_SEA_KM ? `바다를 약 ${Math.round(sea / 10) * 10}km 건너는 구간이라 기차로 갈 수 없습니다` : null;
  trainBlocks.set(key, reason);
  return reason;
}

/** 기차: 지표 직선. 두 도시 사이 기차 시간을 사전 데이터로 알면 그 값을, 모르면 직선 거리와 평균 속도로 어림한다 */
export function trainLeg(a: LatLon, b: LatLon): LegGeometry {
  const leg = straightLeg(a, b, 'train');
  const train = intercityLink(a, b)?.ground?.find((g) => g.mode === 'train');
  if (train) return { ...leg, durationS: train.minutes * 60, note: `${train.name} 기준 (참고 데이터)` };
  // 예전에 저장한 일정 등으로 이미 기차인 바다 구간: 그리기는 하되 다른 수단을 고르라고 알린다
  const blocked = trainBlockReason(a, b);
  if (blocked) return { ...leg, kind: 'fallback', note: `${blocked}. 다른 수단을 고르세요` };
  return { ...leg, note: `기차 노선 데이터가 없어 직선 거리와 평균 시속 ${MODES.train.speedKmh}km로 어림` };
}

export function fetchLeg(a: LatLon, b: LatLon, mode: Mode, fetcher: typeof fetch = fetch): Promise<LegGeometry> {
  const key = legKey(a, b, mode);
  const hit = cache.get(key);
  if (hit) return hit;
  const info = MODES[mode];
  const job: Promise<LegGeometry> = !info.road
    ? mode === 'subway' ? subwayLeg(a, b) : Promise.resolve(mode === 'plane' ? planeLeg(a, b) : mode === 'train' ? trainLeg(a, b) : straightLeg(a, b, mode))
    : fetcher(`${OSRM[info.road]}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data: { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }) => {
          const route = data.code === 'Ok' ? data.routes?.[0] : undefined;
          if (!route) return straightLeg(a, b, mode, 'fallback', '도로로 이어지지 않아 직선으로 표시');
          return {
            coords: route.geometry.coordinates,
            kind: 'road' as const,
            distanceKm: route.distance / 1000,
            durationS: route.duration * (info.timeFactor ?? 1),
            estimated: info.estimated,
          };
        })
        .catch(() => {
          cache.delete(key); // 네트워크 실패는 다음에 다시 시도한다
          return straightLeg(a, b, mode, 'fallback', '경로 서버에 닿지 못해 직선으로 표시');
        });
  cache.set(key, job);
  return job;
}
