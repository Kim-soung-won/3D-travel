// 여행 경로 상태.
// - 도시(지구본) 단위 경유지 목록. 각 경유지에서 다음 경유지까지의 이동 수단(mode)을 가진다.
// - 각 도시 안의 세부 경유지(정류장·명소) 목록. 이것도 다음 세부 경유지까지의 수단을 가진다.
// 지우기·불러오기는 직전 상태를 하나 남겨 되돌릴 수 있게 한다.
import { useReducer } from 'react';
import type { LatLon } from '../geo/geo';
import type { Mode } from '../geo/modes';
import type { TripStart } from './schedule';

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
}

export interface Waypoint extends Stop {
  /** 도시 안 세부 경유지 */
  stops: Stop[];
  /** 이 도시에서 묵는 밤 수. 없거나 0이면 당일 들름 (itinerary.ts) */
  nights?: number;
  /** 숙박하는 도시의 출발 시각 'HH:MM' (현지) */
  leaveAt?: string;
  /** 도시 안 하루 일정의 시작 시각 'HH:MM' */
  dayStart?: string;
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
  | { type: 'update'; id: string; patch: Partial<Pick<Waypoint, 'name' | 'area' | 'mode' | 'nights' | 'link' | 'leaveAt' | 'stayMin' | 'dayStart'>> }
  | { type: 'clear' }
  | { type: 'load'; waypoints: Waypoint[]; start?: TripStart; label: string }
  | { type: 'setStart'; start: TripStart | undefined }
  | { type: 'addStop'; parentId: string; stop: Stop }
  | { type: 'removeStop'; parentId: string; id: string }
  | { type: 'moveStop'; parentId: string; id: string; delta: -1 | 1 }
  | { type: 'updateStop'; parentId: string; id: string; patch: Partial<Pick<Stop, 'name' | 'area' | 'mode' | 'link' | 'stayMin'>> }
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
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: [...w.stops, action.stop] })), start, undo: null };
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
      const next = parent && moveItem(parent.stops, action.id, action.delta);
      return next ? { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: next })), start, undo: null } : state;
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
      return { waypoints: withParent(action.parentId, (w) => ({ ...w, stops: action.stops })), start, undo: snapshot(action.label) };
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
