// 몇 박 며칠: 도시(경유지)마다 숙박 수를 두고, 도시별 머무는 날짜 범위와 전체 일정을 계산한다.
// 이동은 떠나는 날 안에 끝난다고 본다(밤 비행·시차는 반영하지 않는다). 그래서 전체 일수 = 총 숙박 + 1.
import type { Waypoint } from './route';

export const MAX_NIGHTS = 30;

export interface CityDays {
  /** 도착한 날 (1일차부터) */
  arrive: number;
  /** 떠나는 날. 숙박이 없으면 arrive와 같다 */
  leave: number;
  nights: number;
}

export const nightsOf = (w: Pick<Waypoint, 'nights'>) => Math.max(0, Math.min(MAX_NIGHTS, Math.round(w.nights ?? 0)));

export function cityDays(waypoints: Pick<Waypoint, 'nights'>[]): CityDays[] {
  let day = 1;
  return waypoints.map((w) => {
    const nights = nightsOf(w);
    const item = { arrive: day, leave: day + nights, nights };
    day += nights;
    return item;
  });
}

export function totalNights(waypoints: Pick<Waypoint, 'nights'>[]): number {
  return waypoints.reduce((a, w) => a + nightsOf(w), 0);
}

/** "3박 4일", 숙박이 없으면 "당일 일정" */
export function formatTrip(nights: number): string {
  return nights > 0 ? `${nights}박 ${nights + 1}일` : '당일 일정';
}

/** "1~3일차" 또는 "2일차" */
export function formatDayRange(d: CityDays): string {
  return d.leave > d.arrive ? `${d.arrive}~${d.leave}일차` : `${d.arrive}일차`;
}
