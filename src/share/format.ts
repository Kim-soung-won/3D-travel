// 공유·저장 형식 v4. 공유 링크, 파일 내보내기, 브라우저 자동 저장이 모두 이 형식을 쓴다.
// v1 → v2: 경유지 링크(u)가 생겼다.
// v2 → v3: 시간 단위 일정(첫 도시 도착 st, 출발 시각 lt, 머무는 시간 sm, 하루 시작 ds)이 생겼다.
// v3 → v4: 도시 안 일정이 여러 날로 나뉘었다. 세부 경유지의 날(d), 날마다 시작 시각(ds가 문자열 하나 → 배열).
// 예전 버전은 그대로 읽는다. v3의 ds 문자열은 첫날 시작 시각이 된다.
// 경로선(도로 좌표)은 담지 않는다. 받는 쪽에서 다시 계산한다. 계획: docs/plan/sharing.md
import type { Mode } from '../geo/modes';
import { MAX_NIGHTS } from '../state/itinerary';
import { safeLink } from '../state/link';
import { newId, sortByDay, type Stop, type Trip, type Waypoint } from '../state/route';
import { clampStay, isDate, isTime, type TripStart } from '../state/schedule';

export const FORMAT_VERSION = 4;
/** 읽을 수 있는 버전. 예전 버전을 지우면 이미 퍼진 링크가 깨진다 */
const READABLE_VERSIONS = [1, 2, 3, 4];
const MODES: Mode[] = ['plane', 'bus', 'car', 'subway', 'walk'];
export const LIMITS = { cities: 100, stopsPerCity: 100, name: 80, area: 80 };

/**
 * 짧은 키: n 이름, a 보조 설명, la 위도, lo 경도, m 다음 구간 수단, u 링크(v2), sm 머무는 시간(분, v3),
 * d 도시 안 날(v4, 2 이상만), ni 숙박, lt 출발 시각(v3), ds 날마다 시작 시각(v4 배열, 빈 칸 null. v3은 문자열 하나), s 세부 경유지. 일정: st 첫 도시 도착 'YYYY-MM-DDTHH:MM' 또는 'THH:MM'(v3)
 */
interface SharedStop {
  n: string;
  a?: string;
  la: number;
  lo: number;
  m: Mode;
  u?: string;
  sm?: number;
  d?: number;
}
interface SharedCity extends SharedStop {
  ni?: number;
  lt?: string;
  ds?: string | (string | null)[];
  s?: SharedStop[];
}
export interface SharedTrip {
  v: number;
  st?: string;
  w: SharedCity[];
}

// 좌표는 소수 5자리(약 1m)면 충분하다
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function toStop(s: Stop): SharedStop {
  const link = safeLink(s.link);
  return {
    n: s.name,
    ...(s.area ? { a: s.area } : {}),
    la: r5(s.lat),
    lo: r5(s.lon),
    m: s.mode,
    ...(link ? { u: link } : {}),
    ...(s.stayMin !== undefined ? { sm: clampStay(s.stayMin) } : {}),
    ...(s.day && s.day > 1 ? { d: s.day } : {}),
  };
}

/** 날마다 시작 시각. 뒤쪽 빈 칸은 잘라 낸다 */
function toDayStarts(list: Waypoint['dayStarts']): (string | null)[] | undefined {
  const out = (list ?? []).map((t) => (isTime(t) ? t : null));
  while (out.length && out.at(-1) === null) out.pop();
  return out.length ? out : undefined;
}
function readDayStarts(x: unknown): (string | null)[] | undefined {
  if (isTime(x)) return [x]; // v3
  if (!Array.isArray(x)) return undefined;
  return toDayStarts(x.slice(0, MAX_NIGHTS + 1).map((t) => (isTime(t) ? t : null)));
}

const startToText = (s: TripStart) => `${isDate(s.date) ? s.date : ''}T${s.time}`;
function textToStart(x: unknown): TripStart | undefined {
  if (typeof x !== 'string') return undefined;
  const [date, time] = x.split('T');
  if (!isTime(time)) return undefined;
  return isDate(date) ? { date, time } : { time };
}

export function toShared({ waypoints, start }: Trip): SharedTrip {
  return {
    v: FORMAT_VERSION,
    ...(start && isTime(start.time) ? { st: startToText(start) } : {}),
    w: waypoints.map((w) => {
      const ds = toDayStarts(w.dayStarts);
      return {
        ...toStop(w),
        ...(w.nights ? { ni: w.nights } : {}),
        ...(isTime(w.leaveAt) ? { lt: w.leaveAt } : {}),
        ...(ds ? { ds } : {}),
        ...(w.stops.length ? { s: w.stops.map(toStop) } : {}),
      };
    }),
  };
}

export class TripFormatError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function readStop(x: unknown, where: string): Stop {
  if (!isObj(x)) throw new TripFormatError(`${where}: 형식이 맞지 않습니다`);
  const { n, a, la, lo, m, u, sm, d } = x;
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
    ...(typeof sm === 'number' && Number.isFinite(sm) ? { stayMin: clampStay(sm) } : {}),
    ...(typeof d === 'number' && Number.isFinite(d) && Math.round(d) > 1 ? { day: Math.min(MAX_NIGHTS + 1, Math.round(d)) } : {}),
  };
}

/** 검사하고 새 id를 붙여 일정으로 바꾼다. 틀리면 TripFormatError */
export function fromShared(data: unknown): Trip {
  if (!isObj(data)) throw new TripFormatError('일정 형식이 아닙니다');
  if (!READABLE_VERSIONS.includes(data.v as number)) throw new TripFormatError(`지원하지 않는 형식 버전입니다 (${String(data.v)})`);
  if (!Array.isArray(data.w)) throw new TripFormatError('도시 목록이 없습니다');
  if (data.w.length > LIMITS.cities) throw new TripFormatError(`도시가 너무 많습니다 (최대 ${LIMITS.cities}곳)`);
  const waypoints = data.w.map((c, i): Waypoint => {
    const base = readStop(c, `${i + 1}번 도시`);
    const city = c as Record<string, unknown>;
    const ni = city.ni;
    const nights = typeof ni === 'number' && Number.isFinite(ni) ? Math.max(0, Math.min(MAX_NIGHTS, Math.round(ni))) : 0;
    const rawStops = city.s ?? [];
    if (!Array.isArray(rawStops)) throw new TripFormatError(`${i + 1}번 도시: 세부 경유지 형식이 맞지 않습니다`);
    if (rawStops.length > LIMITS.stopsPerCity) throw new TripFormatError(`${i + 1}번 도시: 세부 경유지가 너무 많습니다`);
    const dayStarts = readDayStarts(city.ds);
    return {
      ...base,
      nights,
      ...(isTime(city.lt) ? { leaveAt: city.lt } : {}),
      ...(dayStarts ? { dayStarts } : {}),
      // 날 순서가 어긋난 목록은 날 순서로 놓는다
      stops: sortByDay(rawStops.map((s, k) => readStop(s, `${i + 1}번 도시의 ${k + 1}번 세부 경유지`))),
    };
  });
  const start = textToStart(data.st);
  return start ? { waypoints, start } : { waypoints };
}
