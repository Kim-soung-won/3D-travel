// 브라우저 자동 저장. 같은 브라우저에서 새로고침해도 일정이 남는다.
// 저장소가 막혀 있거나(사생활 보호 모드 등) 내용이 깨져 있으면 조용히 빈 일정으로 시작한다.
import type { Waypoint } from '../state/route';
import { fromShared, toShared } from './format';

export const STORAGE_KEY = 'travel-globe:trip:v1';

export function loadSaved(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Waypoint[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? fromShared(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveTrip(waypoints: Waypoint[], storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): boolean {
  try {
    if (!storage) return false;
    if (waypoints.length) storage.setItem(STORAGE_KEY, JSON.stringify(toShared(waypoints)));
    else storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
