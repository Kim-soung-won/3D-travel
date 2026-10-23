// 여행 경로 상태.
// - 도시(지구본) 단위 경유지 목록. 각 경유지에서 다음 경유지까지의 이동 수단(mode)을 가진다.
// - 각 도시 안의 세부 경유지(정류장·명소) 목록. 이것도 다음 세부 경유지까지의 수단을 가진다.
// 지우기·불러오기는 직전 상태를 하나 남겨 되돌릴 수 있게 한다.
import { useReducer } from 'react';
import type { LatLon } from '../geo/geo';
import type { Mode } from '../geo/modes';
import { cityDayCount, stopDay, type TripStart } from './schedule';

export interface Stop extends LatLon {
  id: string;
  name: string;
  /** 상위 행정구역 등 보조 설명 (예: "중구 · 서울특별시") */
  area?: string;
  /** 이 지점에서 다음 지점까지 타는 수단 */
  mode: Mode;
  /** 사용자가 붙인 바깥 링크(구글 지도 등). http(s)만 (link.ts) */
  link?: string;
  /** 머무는 시간(분). 세부 경유지, 또는 숙박하지 않는 도시 (schedule.ts) */
  stayMin?: number;
  /** 세부 경유지가 속한 도시 안 날(1부터, 없으면 1). 목록은 날 순서로 놓인다 */
  day?: number;
}

export interface Waypoint extends Stop {
  /** 도시 안 세부 경유지 */
  stops: Stop[];
  /** 이 도시에서 묵는 밤 수. 없거나 0이면 당일 들름 (itinerary.ts) */
  nights?: number;
  /** 숙박하는 도시의 출발 시각 'HH:MM' (현지) */
  leaveAt?: string;
  /** 도시 안 날마다 일정 시작 시각 'HH:MM'. 칸이 비면(null) 기본 09:00 */
  dayStarts?: (string | null)[];
}

/** 일정 한 벌: 공유·저장 단위 */
export interface Trip {
  waypoints: Waypoint[];
  /** 첫 도시 도착 날짜·시각 */
  start?: TripStart;
}

export interface RouteState extends Trip {
  undo: ({ label: string } & Trip) | null;
}

/** 세부 경유지 동작은 parentId(도시)를 함께 받는다 */
export type RouteAction =
  | { type: 'add'; waypoint: Waypoint }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; delta: -1 | 1 }
  | { type: 'update'; id: string; patch: Partial<Pick<Waypoint, 'name' | 'area' | 'mode' | 'nights' | 'link' | 'leaveAt' | 'stayMin' | 'dayStarts'>> }
  | { type: 'clear' }
  | { type: 'load'; waypoints: Waypoint[]; start?: TripStart; label: string }
  | { type: 'setStart'; start: TripStart | undefined }
  | { type: 'addStop'; parentId: string; stop: Stop }
  | { type: 'removeStop'; parentId: string; id: string }
  | { type: 'moveStop'; parentId: string; id: string; delta: -1 | 1 }
  | { type: 'updateStop'; parentId: string; id: string; patch: Partial<Pick<Stop, 'name' | 'area' | 'mode' | 'link' | 'stayMin'>> }
  | { type: 'clearStops'; parentId: string }
  /** 세부 경유지를 다른 날로 옮긴다. 그날의 끝에 놓는다 */
  | { type: 'setStopDay'; parentId: string; id: string; day: number }
  /** 추천 루트 불러오기·순서 최적화처럼 목록을 통째로 바꾼다. 되돌리기를 남긴다 */
  | { type: 'setStops'; parentId: string; stops: Stop[]; label: string }
  | { type: 'undo' }
  | { type: 'dismissUndo' };

function moveItem<T extends { id: string }>(list: T[], id: string, delta: -1 | 1): T[] | null {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 날 순서로 놓는다. 같은 날 안의 순서는 그대로 둔다 */
export function sortByDay<T extends Pick<Stop, 'day'>>(stops: T[]): T[] {
  return stops
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.day ?? 1) - (b.s.day ?? 1) || a.i - b.i)
    .map((x) => x.s);
}

/** day가 1이면 칸을 지운다 (저장·공유를 짧게) */
function withDay<T extends Stop>(s: T, day: number): T {
  const { day: _old, ...rest } = s;
  return (day > 1 ? { ...rest, day } : rest) as T;
}

export function routeReducer(state: RouteState, action: RouteAction): RouteState {
  const list = state.waypoints;
  const start = state.start;
  /** 지우기·불러오기 전 상태를 되돌리기로 남긴다 */
  const snapshot = (label: string) => ({ label, waypoints: list, start });
  const withParent = (parentId: string, fn: (w: Waypoint) => Waypoint) => list.map((w) => (w.id === parentId ? fn(w) : w));
  const parentOf = (parentId: string) => list.find((w) => w.id === parentId);

  switch (action.type) {
    case 'add':
      return { waypoints: [...list, action.waypoint], start, undo: null };
    case 'remove': {
      const target = list.find((w) => w.id === action.id);
      if (!target) return state;
      return { waypoints: list.filter((w) => w.id !== action.id), start, undo: snapshot(`"${target.name}" 삭제됨`) };
    }
    case 'move': {
      const next = moveItem(list, action.id, action.delta);
      return next ? { waypoints: next, start, undo: null } : state;
    }
    case 'update':
      return { ...state, waypoints: list.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)) };
    case 'clear':
      if (!list.length) return state;
      return { waypoints: [], start, undo: snapshot(`경유지 ${list.length}곳을 모두 지움`) };
    case 'load':
      return { waypoints: action.waypoints, start: action.start, undo: list.length ? snapshot(action.label) : null };
    case 'setStart':
      return { ...state, start: action.start };
    case 'addStop':
      // 새 장소는 목록 끝(마지막 장소와 같은 날)에 놓는다
      return {
        waypoints: withParent(action.parentId, (w) => {
          const last = w.stops.at(-1);
          const day = action.stop.day ?? (last ? stopDay(last, cityDayCount(w)) : 1);
          return { ...w, stops: [...w.stops, withDay(action.stop, day)] };
        }),
        start,
        undo: null,
      };
    case 'removeStop': {
      const target = parentOf(action.parentId)?.stops.find((s) => s.id === action.id);
      if (!target) return state;
      return {
        waypoints: withParent(action.parentId, (w) => ({ ...w, stops: w.stops.filter((s) => s.id !== action.id) })),
        start,
        undo: snapshot(`"${target.name}" 삭제됨`),
      };
    }
    case 'moveStop': {
      const parent = parentOf(action.parentId);
      if (!parent) return state;
      // 날의 첫(끝) 장소를 위(아래)로 옮기면 자리를 바꾸지 않고 앞(뒤) 날의 끝(처음)으로 넘어간다
      const count = cityDayCount(parent);
      const i = parent.stops.findIndex((s) => s.id === action.id);
      const other = parent.stops[i + action.delta];
      if (i >= 0 && other && stopDay(other, count) !== stopDay(parent.stops[i], count)) {
        const stops = parent.stops.map((s, k) => (k === i ? withDay(s, stopDay(other, count)) : s));
        return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops })), start, undo: null };
      }
      const next = moveItem(parent.stops, action.id, action.delta);
      return next ? { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: next })), start, undo: null } : state;
    }
    case 'setStopDay': {
      const parent = parentOf(action.parentId);
      const target = parent?.stops.find((s) => s.id === action.id);
      if (!parent || !target) return state;
      const count = cityDayCount(parent);
      const day = Math.max(1, Math.min(count, Math.round(action.day)));
      const rest = parent.stops.filter((s) => s.id !== action.id);
      // 그날(또는 그 앞 날)의 마지막 장소 뒤에 넣는다
      let at = 0;
      rest.forEach((s, k) => {
        if (stopDay(s, count) <= day) at = k + 1;
      });
      const stops = [...rest.slice(0, at), withDay(target, day), ...rest.slice(at)];
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops })), start, undo: null };
    }
    case 'updateStop':
      return {
        ...state,
        waypoints: withParent(action.parentId, (w) => ({ ...w, stops: w.stops.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) })),
      };
    case 'clearStops': {
      const parent = parentOf(action.parentId);
      if (!parent?.stops.length) return state;
      return {
        waypoints: withParent(action.parentId, (w) => ({ ...w, stops: [] })),
        start,
        undo: snapshot(`${parent.name}의 세부 경유지 ${parent.stops.length}곳을 모두 지움`),
      };
    }
    case 'setStops':
      if (!parentOf(action.parentId)) return state;
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: sortByDay(action.stops) })), start, undo: snapshot(action.label) };
    case 'undo':
      return state.undo ? { waypoints: state.undo.waypoints, start: state.undo.start, undo: null } : state;
    case 'dismissUndo':
      return { ...state, undo: null };
  }
}

export function useRoute(initial: Trip = { waypoints: [] }) {
  return useReducer(routeReducer, { ...initial, undo: null });
}

let seq = 0;
export const newId = () => `wp-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type SampleStop = Omit<Stop, 'id'>;
const s = (name: string, lat: number, lon: number, mode: Stop['mode'], area?: string): SampleStop => ({ name, lat, lon, mode, area });

export const SAMPLE_ROUTE: (SampleStop & { stops: SampleStop[]; nights: number })[] = [
  {
    ...s('서울특별시', 37.5665, 126.978, 'plane', '대한민국'),
    nights: 2,
    stops: [
      s('서울역', 37.5547, 126.9707, 'subway', '용산구 · 서울특별시'),
      s('명동', 37.5636, 126.9826, 'walk', '중구 · 서울특별시'),
      s('경복궁', 37.5796, 126.977, 'bus', '종로구 · 서울특별시'),
      s('성수동', 37.5445, 127.0557, 'walk', '성동구 · 서울특별시'),
    ],
  },
  { ...s('부산광역시', 35.1796, 129.0756, 'plane', '대한민국'), nights: 1, stops: [] },
  { ...s('도쿄도', 35.6762, 139.6503, 'plane', '일본'), nights: 2, stops: [] },
  { ...s('샌프란시스코', 37.7749, -122.4194, 'car', '캘리포니아 · 미국'), nights: 1, stops: [] },
  { ...s('로스앤젤레스', 34.0522, -118.2437, 'plane', '캘리포니아 · 미국'), nights: 2, stops: [] },
  { ...s('파리', 48.8566, 2.3522, 'plane', '일드프랑스 · 프랑스'), nights: 3, stops: [] },
];

export function sampleWaypoints(): Waypoint[] {
  return SAMPLE_ROUTE.map((w) => ({ ...w, id: newId(), stops: w.stops.map((x) => ({ ...x, id: newId() })) }));
}
