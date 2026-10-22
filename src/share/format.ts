// 공유·저장 형식 v2. 공유 링크, 파일 내보내기, 브라우저 자동 저장이 모두 이 형식을 쓴다.
// v1 → v2: 경유지 링크(u)가 생겼다. v1은 링크가 없는 v2로 그대로 읽는다.
// 경로선(도로 좌표)은 담지 않는다. 받는 쪽에서 다시 계산한다. 계획: docs/plan/sharing.md
import type { Mode } from '../geo/modes';
import { MAX_NIGHTS } from '../state/itinerary';
import { safeLink } from '../state/link';
import { newId, type Stop, type Waypoint } from '../state/route';

export const FORMAT_VERSION = 2;
/** 읽을 수 있는 버전. 예전 버전을 지우면 이미 퍼진 링크가 깨진다 */
const READABLE_VERSIONS = [1, 2];
const MODES: Mode[] = ['plane', 'bus', 'car', 'subway', 'walk'];
export const LIMITS = { cities: 100, stopsPerCity: 100, name: 80, area: 80 };

/** 짧은 키: n 이름, a 보조 설명, la 위도, lo 경도, m 다음 구간 수단, u 링크(v2), ni 숙박, s 세부 경유지 */
interface SharedStop {
  n: string;
  a?: string;
  la: number;
  lo: number;
  m: Mode;
  u?: string;
}
interface SharedCity extends SharedStop {
  ni?: number;
  s?: SharedStop[];
}
export interface SharedTrip {
  v: number;
  w: SharedCity[];
}

// 좌표는 소수 5자리(약 1m)면 충분하다
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function toStop(s: Stop): SharedStop {
  const link = safeLink(s.link);
  return { n: s.name, ...(s.area ? { a: s.area } : {}), la: r5(s.lat), lo: r5(s.lon), m: s.mode, ...(link ? { u: link } : {}) };
}

export function toShared(waypoints: Waypoint[]): SharedTrip {
  return {
    v: FORMAT_VERSION,
    w: waypoints.map((w) => ({
      ...toStop(w),
      ...(w.nights ? { ni: w.nights } : {}),
      ...(w.stops.length ? { s: w.stops.map(toStop) } : {}),
    })),
  };
}

export class TripFormatError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function readStop(x: unknown, where: string): Stop {
  if (!isObj(x)) throw new TripFormatError(`${where}: 형식이 맞지 않습니다`);
  const { n, a, la, lo, m, u } = x;
  if (typeof n !== 'string' || !n.trim()) throw new TripFormatError(`${where}: 이름이 없습니다`);
  if (typeof la !== 'number' || typeof lo !== 'number' || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180)
    throw new TripFormatError(`${where}: 좌표가 올바르지 않습니다`);
  if (!MODES.includes(m as Mode)) throw new TripFormatError(`${where}: 이동 수단을 알 수 없습니다`);
  // 쓸 수 없는 링크(javascript: 등)는 일정 전체를 거부하지 않고 버린다
  const link = safeLink(u);
  return {
    id: newId(),
    name: n.trim().slice(0, LIMITS.name),
    ...(typeof a === 'string' && a ? { area: a.slice(0, LIMITS.area) } : {}),
    lat: la,
    lon: lo,
    mode: m as Mode,
    ...(link ? { link } : {}),
  };
}

/** 검사하고 새 id를 붙여 일정으로 바꾼다. 틀리면 TripFormatError */
export function fromShared(data: unknown): Waypoint[] {
  if (!isObj(data)) throw new TripFormatError('일정 형식이 아닙니다');
  if (!READABLE_VERSIONS.includes(data.v as number)) throw new TripFormatError(`지원하지 않는 형식 버전입니다 (${String(data.v)})`);
  if (!Array.isArray(data.w)) throw new TripFormatError('도시 목록이 없습니다');
  if (data.w.length > LIMITS.cities) throw new TripFormatError(`도시가 너무 많습니다 (최대 ${LIMITS.cities}곳)`);
  return data.w.map((c, i) => {
    const base = readStop(c, `${i + 1}번 도시`);
    const city = c as Record<string, unknown>;
    const ni = city.ni;
    const nights = typeof ni === 'number' && Number.isFinite(ni) ? Math.max(0, Math.min(MAX_NIGHTS, Math.round(ni))) : 0;
    const rawStops = city.s ?? [];
    if (!Array.isArray(rawStops)) throw new TripFormatError(`${i + 1}번 도시: 세부 경유지 형식이 맞지 않습니다`);
    if (rawStops.length > LIMITS.stopsPerCity) throw new TripFormatError(`${i + 1}번 도시: 세부 경유지가 너무 많습니다`);
    return { ...base, nights, stops: rawStops.map((s, k) => readStop(s, `${i + 1}번 도시의 ${k + 1}번 세부 경유지`)) };
  });
}
