// 구간 경로: 도로를 따르는 수단은 OSRM(FOSSGIS 공개 서버, 키 없음)으로, 지하철은 사전 노선 데이터로,
// 비행기는 대권 직선 + 사전 비행 시간으로, 기차는 지표 직선 + 사전 지상 이동 시간(KTX 등)으로. 데이터가 없으면 직선과 평균 속도로 어림한다.
// 같은 구간은 다시 요청하지 않도록 메모리에 캐시한다. 공개 서버라 시제품 용도로만 쓴다.
import { cityRefAt, intercityLink, loadCityData } from '../data';
import { distanceKm, type LatLon } from './geo';
import { AIRPORT_RADIUS_KM, airportAccess, chooseAirport, loadAirports, type Airport } from './airports';
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
  /** 비행 구간: 실제로 쓴 출발·도착 공항. coords는 [도시, 출발 공항, 도착 공항, 도시] */
  airports?: { from: AirportRef; to: AirportRef };
}

export type AirportRef = Pick<Airport, 'iata' | 'name' | 'lat' | 'lon'>;

/** 비행 구간 출발 지점: 고른 공항 [출발, 도착] IATA (Waypoint.airports) */
type LegStart = LatLon & { airports?: [string | null, string | null] };

const OSRM = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

const cache = new Map<string, Promise<LegGeometry>>();

export function legKey(a: LegStart, b: LatLon, mode: Mode) {
  const r = (n: number) => n.toFixed(5);
  const ap = mode === 'plane' && a.airports ? `@${a.airports.map((x) => x ?? '').join('-')}` : '';
  return `${mode}:${r(a.lon)},${r(a.lat)};${r(b.lon)},${r(b.lat)}${ap}`;
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

/** 도시 중심 ↔ 공항: 사전 데이터의 대표 교통편이 있으면 그 시간, 없으면 도로 경로(자동차)로 어림 */
async function airportTransfer(city: LatLon, ap: Airport, fetcher: typeof fetch): Promise<{ by: string; s: number }> {
  const known = airportAccess(city, ap.iata);
  if (known) return { by: known.name, s: known.minutes * 60 };
  const road = await fetchLeg(city, ap, 'car', fetcher);
  return { by: road.kind === 'road' ? '자동차' : '자동차(직선 어림)', s: road.durationS };
}

/**
 * 비행기: 출발 공항 → 도착 공항 대권 직선. 시간은 도심→공항 + 비행 + 공항 수속·대기 + 공항→도심.
 * 공항은 고른 것이 있으면 그것, 없으면 기본 공항(airports.ts). 두 도시 사이 비행 시간을 알면 그 값을 쓴다.
 */
export async function planeLeg(a: LegStart, b: LatLon, fetcher: typeof fetch = fetch): Promise<LegGeometry> {
  const list = await loadAirports();
  const from = chooseAirport(list, a, b, a.airports?.[0]);
  const to = chooseAirport(list, b, a, a.airports?.[1]);
  const airport = AIRPORT_MIN * 60;
  const link = intercityLink(a, b);
  const ground = link?.ground?.map((g) => `${g.name} ${formatDuration(g.minutes * 60)}`).join(' · ');
  const alt = ground ? `지상 대안: ${ground}` : undefined;
  if (!from || !to || from.iata === to.iata) {
    // 가까운 공항이 없으면 도시에서 바로 나는 것으로 계산한다
    const leg = straightLeg(a, b, 'plane');
    const why = !from || !to ? `${AIRPORT_RADIUS_KM}km 안에 정기편 공항이 없어 도시 사이로 계산` : '두 도시가 같은 공항을 써서 도시 사이로 계산';
    const flightS = link?.flightMin ? link.flightMin * 60 : leg.durationS;
    return { ...leg, durationS: flightS + airport, timeKnown: !!link?.flightMin, note: [why, alt].filter(Boolean).join(' · ') };
  }
  const flight = straightLeg(from, to, 'plane');
  const flightS = link?.flightMin ? link.flightMin * 60 : flight.durationS;
  const [out, back] = await Promise.all([airportTransfer(a, from, fetcher), airportTransfer(b, to, fetcher)]);
  const note = [
    `${from.iata}→${to.iata} · 공항까지 ${out.by} ${formatDuration(out.s)} + 비행 ${link?.flightMin ? '' : '약 '}${formatDuration(flightS)} + 공항 수속·대기 ${formatDuration(airport)} + 시내까지 ${back.by} ${formatDuration(back.s)}`,
    alt,
  ];
  const ref = ({ iata, name, lat, lon }: Airport): AirportRef => ({ iata, name, lat, lon });
  return {
    ...flight,
    coords: [[a.lon, a.lat], [from.lon, from.lat], [to.lon, to.lat], [b.lon, b.lat]],
    durationS: out.s + flightS + airport + back.s,
    timeKnown: !!link?.flightMin,
    note: note.filter(Boolean).join(' · '),
    airports: { from: ref(from), to: ref(to) },
  };
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

export function fetchLeg(a: LegStart, b: LatLon, mode: Mode, fetcher: typeof fetch = fetch): Promise<LegGeometry> {
  const key = legKey(a, b, mode);
  const hit = cache.get(key);
  if (hit) return hit;
  const info = MODES[mode];
  const job: Promise<LegGeometry> = !info.road
    ? mode === 'subway' ? subwayLeg(a, b) : mode === 'plane' ? planeLeg(a, b, fetcher) : Promise.resolve(mode === 'train' ? trainLeg(a, b) : straightLeg(a, b, mode))
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
