import { describe, expect, test } from 'vitest';
import { routeReducer, sampleWaypoints, type RouteState, type Stop, type Waypoint } from './route';

const stop = (id: string): Stop => ({ id, name: id.toUpperCase(), lat: 0, lon: 0, mode: 'walk' });
const wp = (id: string, stops: Stop[] = []): Waypoint => ({ ...stop(id), mode: 'plane', stops });
const start: RouteState = { waypoints: [wp('a', [stop('a1'), stop('a2')]), wp('b'), wp('c')], undo: null };

describe('도시 단위 경유지', () => {
  test('삭제하면 되돌릴 수 있다', () => {
    const removed = routeReducer(start, { type: 'remove', id: 'b' });
    expect(removed.waypoints.map((w) => w.id)).toEqual(['a', 'c']);
    expect(removed.undo?.label).toBe('"B" 삭제됨');
    expect(routeReducer(removed, { type: 'undo' }).waypoints.map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });
  test('모두 지우기도 되돌릴 수 있고, 다음 변경이 생기면 되돌리기가 사라진다', () => {
    const cleared = routeReducer(start, { type: 'clear' });
    expect(cleared.waypoints).toHaveLength(0);
    expect(routeReducer(cleared, { type: 'add', waypoint: wp('d') }).undo).toBeNull();
  });
  test('순서 바꾸기는 양 끝에서 멈춘다', () => {
    expect(routeReducer(start, { type: 'move', id: 'a', delta: -1 })).toBe(start);
    expect(routeReducer(start, { type: 'move', id: 'a', delta: 1 }).waypoints.map((w) => w.id)).toEqual(['b', 'a', 'c']);
  });
  test('수단·이름 바꾸기는 되돌리기를 지우지 않는다', () => {
    const removed = routeReducer(start, { type: 'remove', id: 'c' });
    const next = routeReducer(removed, { type: 'update', id: 'a', patch: { mode: 'bus', name: '집' } });
    expect(next.waypoints[0]).toMatchObject({ mode: 'bus', name: '집' });
    expect(next.undo).not.toBeNull();
  });
});

describe('세부 경유지', () => {
  test('추가·순서·수단 변경은 그 도시에만 적용된다', () => {
    let s = routeReducer(start, { type: 'addStop', parentId: 'b', stop: stop('b1') });
    expect(s.waypoints[1].stops.map((x) => x.id)).toEqual(['b1']);
    s = routeReducer(s, { type: 'moveStop', parentId: 'a', id: 'a2', delta: -1 });
    expect(s.waypoints[0].stops.map((x) => x.id)).toEqual(['a2', 'a1']);
    s = routeReducer(s, { type: 'updateStop', parentId: 'a', id: 'a1', patch: { mode: 'subway' } });
    expect(s.waypoints[0].stops[1].mode).toBe('subway');
    expect(s.waypoints[2].stops).toHaveLength(0);
  });
  test('세부 경유지 삭제·모두 지우기도 되돌릴 수 있다', () => {
    const removed = routeReducer(start, { type: 'removeStop', parentId: 'a', id: 'a1' });
    expect(removed.waypoints[0].stops.map((x) => x.id)).toEqual(['a2']);
    expect(routeReducer(removed, { type: 'undo' }).waypoints[0].stops).toHaveLength(2);
    const cleared = routeReducer(start, { type: 'clearStops', parentId: 'a' });
    expect(cleared.undo?.label).toBe('A의 세부 경유지 2곳을 모두 지움');
  });
});

test('예시 경로: 모든 경유지·세부 경유지가 서로 다른 id를 가진다', () => {
  const list = sampleWaypoints();
  const ids = list.flatMap((w) => [w.id, ...w.stops.map((x) => x.id)]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(list[0].stops.length).toBeGreaterThan(2);
});

test('목록 통째로 바꾸기(추천 루트·순서 최적화)는 되돌릴 수 있다', () => {
  const city: Waypoint = { id: 'c', name: '서울', lat: 0, lon: 0, mode: 'plane', stops: [{ id: 's1', name: '가', lat: 0, lon: 0, mode: 'walk' }] };
  const start = { waypoints: [city], undo: null };
  const next = routeReducer(start, { type: 'setStops', parentId: 'c', stops: [], label: '바꿈' });
  expect(next.waypoints[0].stops).toEqual([]);
  expect(next.undo?.label).toBe('바꿈');
  expect(routeReducer(next, { type: 'undo' }).waypoints[0].stops).toHaveLength(1);
});
