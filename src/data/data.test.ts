// 사전 데이터(LLM 생성) 상식 검사. 사실 여부는 확인하지 못하지만, 명백히 지어낸 값을 거른다.
import { describe, expect, test } from 'vitest';
import { distanceKm } from '../geo/geo';
import { CITIES } from './all';
import { cityRefAt } from './index';
import intercity from './intercity.json';

const CATEGORIES = ['sight', 'culture', 'food', 'shopping', 'nature', 'night'];
const inBox = (bbox: number[], p: { lat: number; lon: number }) => p.lon >= bbox[0] && p.lon <= bbox[2] && p.lat >= bbox[1] && p.lat <= bbox[3];

test('사전 데이터 도시 14곳이 모두 있다', () => {
  expect(CITIES.map((c) => c.id).sort()).toEqual([
    'bangkok', 'busan', 'jeju', 'kyoto', 'london', 'los-angeles', 'new-york', 'osaka', 'paris', 'san-francisco', 'seoul', 'singapore', 'taipei', 'tokyo',
  ]);
});

describe.each(CITIES.map((c) => [c.id, c] as const))('%s', (_, city) => {
  test('중심과 모든 역·명소가 도시 범위 안', () => {
    expect(inBox(city.bbox, city.center)).toBe(true);
    for (const l of city.lines) for (const s of l.stations) expect(inBox(city.bbox, s), `${l.name} ${s.name}`).toBe(true);
    for (const p of city.places) expect(inBox(city.bbox, p), p.name).toBe(true);
  });
  test('이웃한 역 사이는 0.2~8km (지어낸 역·순서가 틀린 역을 거른다)', () => {
    for (const l of city.lines)
      l.stations.slice(1).forEach((s, i) => {
        const km = distanceKm(l.stations[i], s);
        expect(km, `${l.name} ${l.stations[i].name}→${s.name}`).toBeGreaterThanOrEqual(0.2);
        expect(km, `${l.name} ${l.stations[i].name}→${s.name}`).toBeLessThanOrEqual(8);
      });
  });
  test('같은 이름의 역(환승역)은 노선이 달라도 0.6km 안', () => {
    const byName = new Map<string, { lat: number; lon: number }[]>();
    for (const l of city.lines) for (const s of l.stations) byName.set(s.name, [...(byName.get(s.name) ?? []), s]);
    for (const [name, list] of byName) for (const s of list) expect(distanceKm(s, list[0]), name).toBeLessThanOrEqual(0.6);
  });
  test('명소 id는 겹치지 않고, 분류는 정해진 값', () => {
    expect(new Set(city.places.map((p) => p.id)).size).toBe(city.places.length);
    for (const p of city.places) expect(CATEGORIES).toContain(p.category);
  });
  test('추천 루트는 있는 명소만 가리키고, 구간 수단 수가 맞다', () => {
    const ids = new Set(city.places.map((p) => p.id));
    for (const r of city.routes) {
      for (const id of r.placeIds) expect(ids.has(id), `${r.id} ${id}`).toBe(true);
      expect(r.modes).toHaveLength(r.placeIds.length - 1);
    }
  });
  test('도시 중심으로 그 도시 데이터를 찾는다', () => {
    expect(cityRefAt(city.center)?.id).toBe(city.id);
  });
});

test('도시 간 참고값은 있는 도시만 가리키고, 같은 쌍은 한 번만 있다', () => {
  const ids = new Set(CITIES.map((c) => c.id));
  const pairs = new Set<string>();
  for (const l of intercity.links) {
    expect(ids.has(l.from), l.from).toBe(true);
    expect(ids.has(l.to), l.to).toBe(true);
    const pair = [l.from, l.to].sort().join('–');
    expect(pairs.has(pair), pair).toBe(false);
    pairs.add(pair);
  }
});

test('도시 범위는 서로 겹치지 않는다 (겹치면 지점이 엉뚱한 도시 데이터로 간다)', () => {
  const overlap = (a: number[], b: number[]) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const a of CITIES) for (const b of CITIES) if (a.id < b.id) expect(overlap(a.bbox, b.bbox), `${a.id} ↔ ${b.id}`).toBe(false);
});
