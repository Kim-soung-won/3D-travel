// 시간 단위 일정: 첫 도시 도착 시각에서 시작해, 도시마다 머무는 시간과 구간 이동 시간을 더해 도착·출발 시각을 계산한다.
// 시각은 모두 절대 시각(UTC ms)으로 계산하고, 보일 때만 그 도시의 현지 시각으로 바꾼다. 그래서 시차와 날짜 변경선이 반영된다.
// - 숙박하는 도시: 도착한 날 + 숙박 수 날짜의 출발 시각(leaveAt, 기본 10:00)에 떠난다.
// - 당일 들르는 도시: 머무는 시간(stayMin, 기본 3시간) 뒤에 떠난다.
// - 도시 안 세부 경유지: 하루 시작 시각(dayStart, 기본 09:00)부터 장소마다 머무는 시간(stayMin, 기본 1시간)과 이동 시간을 더한다.
import { nightsOf } from './itinerary';
import type { Stop, Waypoint } from './route';

export interface TripStart {
  /** 'YYYY-MM-DD'. 없으면 날짜 대신 "n일차"로 보인다 */
  date?: string;
  /** 'HH:MM', 첫 도시 현지 시각 */
  time: string;
}

export const DEFAULT_START: TripStart = { time: '09:00' };
export const DEFAULT_LEAVE = '10:00';
export const DEFAULT_CITY_STAY_MIN = 180;
export const DEFAULT_PLACE_STAY_MIN = 60;
export const DEFAULT_DAY_START = '09:00';
export const MAX_STAY_MIN = 24 * 60;
/** 머무는 시간 조절 단위 */
export const STAY_STEP_MIN = 30;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isTime = (s: unknown): s is string => typeof s === 'string' && TIME_RE.test(s);
export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const clampStay = (min: number) => Math.max(0, Math.min(MAX_STAY_MIN, Math.round(min / 5) * 5));

// ---- 시간대 계산 (Intl만 쓴다) ----
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}
interface Local {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}
function local(ms: number, tz: string): Local {
  const p = Object.fromEntries(fmt(tz).formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}
/** 그 시각의 UTC 대비 현지 시차(분) */
function offsetMin(ms: number, tz: string): number {
  const l = local(ms, tz);
  return Math.round((Date.UTC(l.y, l.m - 1, l.d, l.h, l.mi) - Math.floor(ms / 60000) * 60000) / 60000);
}
/** 현지 날짜·시각 → 절대 시각. 서머타임으로 없는 시각은 앞으로 민다 */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetMin(guess, tz) * 60000;
  const again = guess - offsetMin(ms, tz) * 60000;
  if (again !== ms) ms = Math.max(ms, again);
  return ms;
}
const pad = (n: number) => String(n).padStart(2, '0');
export function localDate(ms: number, tz: string): string {
  const l = local(ms, tz);
  return `${l.y}-${pad(l.m)}-${pad(l.d)}`;
}
export function localTime(ms: number, tz: string): string {
  const l = local(ms, tz);
  return `${pad(l.h)}:${pad(l.mi)}`;
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** "10/23(목) 14:30" (날짜를 정했을 때) 또는 "3일차 14:30". base는 여행 첫날 */
export function formatWhen(ms: number, tz: string, base: string, withDate: boolean): string {
  const date = localDate(ms, tz);
  const time = localTime(ms, tz);
  if (!withDate) return `${dayNumber(date) - dayNumber(base) + 1}일차 ${time}`;
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}(${WEEKDAY[(dayNumber(date) + 4) % 7]}) ${time}`; // 1970-01-01은 목요일
}

/** "2일 1시간", "3시간 30분", "45분" */
export function formatSpan(min: number): string {
  const total = Math.max(0, Math.round(min));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts = [d && `${d}일`, h && `${h}시간`, m && `${m}분`].filter(Boolean);
  return parts.length ? parts.slice(0, 2).join(' ') : '0분';
}

/** "UTC+9" */
export function formatOffset(ms: number, tz: string): string {
  const off = offsetMin(ms, tz);
  const sign = off < 0 ? '−' : '+';
  const a = Math.abs(off);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ''}`;
}

// ---- 도시 단위 일정 ----
export interface CityTime {
  arrive: number;
  leave: number;
  tz: string;
}
export interface Schedule {
  cities: CityTime[];
  /** 여행 첫날(첫 도시 현지 날짜) */
  base: string;
  withDate: boolean;
  /** 이동 시간을 아직 모르는 구간이 있어 뒤쪽 시각이 바뀔 수 있다 */
  pending: boolean;
}

type CityInput = Pick<Waypoint, 'nights' | 'leaveAt' | 'stayMin'>;

/** 날짜를 정하지 않으면 기준 날짜로 오늘(첫 도시 현지)을 쓴다. 서머타임 판단에만 쓰인다 */
export function computeSchedule(cities: CityInput[], tzs: string[], legMin: (number | null)[], start: TripStart, now = Date.now()): Schedule | null {
  if (!cities.length || tzs.length !== cities.length) return null;
  const withDate = isDate(start.date);
  const base = withDate ? start.date! : localDate(now, tzs[0]);
  let arrive = zonedToUtc(base, isTime(start.time) ? start.time : DEFAULT_START.time, tzs[0]);
  let pending = false;
  const out: CityTime[] = [];
  cities.forEach((c, i) => {
    const tz = tzs[i];
    const nights = nightsOf(c);
    // 숙박하면 늘 다음 날 이후에 떠나므로 출발이 도착보다 빠를 수 없다
    const leave =
      nights > 0
        ? zonedToUtc(addDays(localDate(arrive, tz), nights), isTime(c.leaveAt) ? c.leaveAt : DEFAULT_LEAVE, tz)
        : arrive + clampStay(c.stayMin ?? DEFAULT_CITY_STAY_MIN) * 60000;
    out.push({ arrive, leave, tz });
    if (i < cities.length - 1) {
      const m = legMin[i];
      if (m == null) pending = true;
      arrive = leave + (m ?? 0) * 60000;
    }
  });
  return { cities: out, base, withDate, pending };
}

/** 일정에서 도시가 머무는 날 범위 ("1~3일차") */
export function scheduleDayRange(s: Schedule, i: number): string {
  const c = s.cities[i];
  const a = dayNumber(localDate(c.arrive, c.tz)) - dayNumber(s.base) + 1;
  const b = dayNumber(localDate(c.leave, c.tz)) - dayNumber(s.base) + 1;
  return b > a ? `${a}~${b}일차` : `${a}일차`;
}

// ---- 도시 안 하루 일정 ----
export interface PlaceTime {
  /** 하루 시작 0시 기준 분 (하루를 넘기면 1440 이상) */
  arrive: number;
  leave: number;
}

/** 세부 경유지 시간표. legMin[i]는 i → i+1 이동 시간(분), 모르면 null */
export function computeDayPlan(dayStart: string | undefined, stops: Pick<Stop, 'stayMin'>[], legMin: (number | null)[]): { places: PlaceTime[]; pending: boolean } {
  const [h, m] = (isTime(dayStart) ? dayStart : DEFAULT_DAY_START).split(':').map(Number);
  let t = h * 60 + m;
  let pending = false;
  const places = stops.map((s, i) => {
    const arrive = t;
    const leave = arrive + clampStay(s.stayMin ?? DEFAULT_PLACE_STAY_MIN);
    if (i < stops.length - 1) {
      const lm = legMin[i];
      if (lm == null) pending = true;
      t = leave + Math.round(lm ?? 0);
    }
    return { arrive, leave };
  });
  return { places, pending };
}

/** 분 → "14:30", 하루를 넘기면 "다음 날 01:10" */
export function formatClock(min: number): string {
  const day = Math.floor(min / 1440);
  const r = ((Math.round(min) % 1440) + 1440) % 1440;
  const text = `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
  return day > 0 ? `${day === 1 ? '다음 날' : `${day}일 뒤`} ${text}` : text;
}
