// 구간 경로: 도로를 따르는 수단은 OSRM(FOSSGIS 공개 서버, 키 없음)으로, 지하철은 사전 노선 데이터로,
// 비행기는 대권 직선 + 사전 비행 시간으로. 데이터가 없으면 직선과 평균 속도로 어림한다.
// 같은 구간은 다시 요청하지 않도록 메모리에 캐시한다. 공개 서버라 시제품 용도로만 쓴다.
import { cityDataAt, intercityLink } from '../data';
import { distanceKm, type LatLon } from './geo';
import { formatDuration, MODES, type Mode } from './modes';
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
export function subwayLeg(a: LatLon, b: LatLon): LegGeometry {
  const city = cityDataAt(a);
  if (!city || cityDataAt(b) !== city) return straightLeg(a, b, 'subway', 'fallback', '노선 데이터가 없는 곳이라 직선으로 표시');
  const r = transitRoute(city, a, b);
  if (!r) return straightLeg(a, b, 'subway', 'fallback', '가까운 역이 없어 직선으로 표시');
  const walkOnly = ((distanceKm(a, b) * 1.3) / 4.5) * 3600;
  const note = !r.rides.length || walkOnly < r.durationS ? `걸어가면 약 ${formatDuration(walkOnly)}로 더 빠릅니다` : describeRides(r);
  return { coords: r.coords, kind: 'transit', distanceKm: r.distanceKm, durationS: r.durationS, estimated: true, note };
}

/** 비행기: 대권 직선. 두 도시 사이 비행 시간을 알면 그 값을 쓴다 */
export function planeLeg(a: LatLon, b: LatLon): LegGeometry {
  const leg = straightLeg(a, b, 'plane');
  const link = intercityLink(a, b);
  if (!link?.flightMin) return leg;
  const ground = link.ground?.map((g) => `${g.name} ${formatDuration(g.minutes * 60)}`).join(' · ');
  return { ...leg, durationS: link.flightMin * 60, timeKnown: true, note: ground ? `지상 대안: ${ground}` : undefined };
}

export function fetchLeg(a: LatLon, b: LatLon, mode: Mode, fetcher: typeof fetch = fetch): Promise<LegGeometry> {
  const key = legKey(a, b, mode);
  const hit = cache.get(key);
  if (hit) return hit;
  const info = MODES[mode];
  const job: Promise<LegGeometry> = !info.road
    ? Promise.resolve(mode === 'subway' ? subwayLeg(a, b) : mode === 'plane' ? planeLeg(a, b) : straightLeg(a, b, mode))
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
