// 여행 경로 상태.
// - 도시(지구본) 단위 경유지 목록. 각 경유지에서 다음 경유지까지의 이동 수단(mode)을 가진다.
// - 각 도시 안의 세부 경유지(정류장·명소) 목록. 이것도 다음 세부 경유지까지의 수단을 가진다.
// 지우기·불러오기는 직전 상태를 하나 남겨 되돌릴 수 있게 한다.
import { useReducer } from 'react';
import type { LatLon } from '../geo/geo';
import type { Mode } from '../geo/modes';

export interface Stop extends LatLon {
  id: string;
  name: string;
  /** 상위 행정구역 등 보조 설명 (예: "중구 · 서울특별시") */
  area?: string;
  /** 이 지점에서 다음 지점까지 타는 수단 */
  mode: Mode;
}

export interface Waypoint extends Stop {
  /** 도시 안 세부 경유지 */
  stops: Stop[];
}

export interface RouteState {
  waypoints: Waypoint[];
  undo: { label: string; waypoints: Waypoint[] } | null;
}

/** 세부 경유지 동작은 parentId(도시)를 함께 받는다 */
export type RouteAction =
  | { type: 'add'; waypoint: Waypoint }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; delta: -1 | 1 }
  | { type: 'update'; id: string; patch: Partial<Pick<Stop, 'name' | 'area' | 'mode'>> }
  | { type: 'clear' }
  | { type: 'load'; waypoints: Waypoint[]; label: string }
  | { type: 'addStop'; parentId: string; stop: Stop }
  | { type: 'removeStop'; parentId: string; id: string }
  | { type: 'moveStop'; parentId: string; id: string; delta: -1 | 1 }
  | { type: 'updateStop'; parentId: string; id: string; patch: Partial<Pick<Stop, 'name' | 'area' | 'mode'>> }
  | { type: 'clearStops'; parentId: string }
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

export function routeReducer(state: RouteState, action: RouteAction): RouteState {
  const list = state.waypoints;
  const withParent = (parentId: string, fn: (w: Waypoint) => Waypoint) => list.map((w) => (w.id === parentId ? fn(w) : w));
  const parentOf = (parentId: string) => list.find((w) => w.id === parentId);

  switch (action.type) {
    case 'add':
      return { waypoints: [...list, action.waypoint], undo: null };
    case 'remove': {
      const target = list.find((w) => w.id === action.id);
      if (!target) return state;
      return { waypoints: list.filter((w) => w.id !== action.id), undo: { label: `"${target.name}" 삭제됨`, waypoints: list } };
    }
    case 'move': {
      const next = moveItem(list, action.id, action.delta);
      return next ? { waypoints: next, undo: null } : state;
    }
    case 'update':
      return { ...state, waypoints: list.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)) };
    case 'clear':
      if (!list.length) return state;
      return { waypoints: [], undo: { label: `경유지 ${list.length}곳을 모두 지움`, waypoints: list } };
    case 'load':
      return { waypoints: action.waypoints, undo: list.length ? { label: action.label, waypoints: list } : null };
    case 'addStop':
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: [...w.stops, action.stop] })), undo: null };
    case 'removeStop': {
      const target = parentOf(action.parentId)?.stops.find((s) => s.id === action.id);
      if (!target) return state;
      return {
        waypoints: withParent(action.parentId, (w) => ({ ...w, stops: w.stops.filter((s) => s.id !== action.id) })),
        undo: { label: `"${target.name}" 삭제됨`, waypoints: list },
      };
    }
    case 'moveStop': {
      const parent = parentOf(action.parentId);
      const next = parent && moveItem(parent.stops, action.id, action.delta);
      return next ? { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: next })), undo: null } : state;
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
        undo: { label: `${parent.name}의 세부 경유지 ${parent.stops.length}곳을 모두 지움`, waypoints: list },
      };
    }
    case 'setStops':
      if (!parentOf(action.parentId)) return state;
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: action.stops })), undo: { label: action.label, waypoints: list } };
    case 'undo':
      return state.undo ? { waypoints: state.undo.waypoints, undo: null } : state;
    case 'dismissUndo':
      return { ...state, undo: null };
  }
}

export function useRoute(initial: Waypoint[] = []) {
  return useReducer(routeReducer, { waypoints: initial, undo: null });
}

let seq = 0;
export const newId = () => `wp-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type SampleStop = Omit<Stop, 'id'>;
const s = (name: string, lat: number, lon: number, mode: Stop['mode'], area?: string): SampleStop => ({ name, lat, lon, mode, area });

export const SAMPLE_ROUTE: (SampleStop & { stops: SampleStop[] })[] = [
  {
    ...s('서울특별시', 37.5665, 126.978, 'plane', '대한민국'),
    stops: [
      s('서울역', 37.5547, 126.9707, 'subway', '용산구 · 서울특별시'),
      s('명동', 37.5636, 126.9826, 'walk', '중구 · 서울특별시'),
      s('경복궁', 37.5796, 126.977, 'bus', '종로구 · 서울특별시'),
      s('성수동', 37.5445, 127.0557, 'walk', '성동구 · 서울특별시'),
    ],
  },
  { ...s('부산광역시', 35.1796, 129.0756, 'plane', '대한민국'), stops: [] },
  { ...s('도쿄도', 35.6762, 139.6503, 'plane', '일본'), stops: [] },
  { ...s('샌프란시스코', 37.7749, -122.4194, 'car', '캘리포니아 · 미국'), stops: [] },
  { ...s('로스앤젤레스', 34.0522, -118.2437, 'plane', '캘리포니아 · 미국'), stops: [] },
  { ...s('파리', 48.8566, 2.3522, 'plane', '일드프랑스 · 프랑스'), stops: [] },
];

export function sampleWaypoints(): Waypoint[] {
  return SAMPLE_ROUTE.map((w) => ({ ...w, id: newId(), stops: w.stops.map((x) => ({ ...x, id: newId() })) }));
}
