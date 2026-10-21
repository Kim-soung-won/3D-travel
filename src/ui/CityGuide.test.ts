import { expect, test } from 'vitest';
import { CITIES } from '../data';
import { searchPlaces, suggestMode } from './CityGuide';

const seoul = CITIES.find((c) => c.id === 'seoul')!;

test('이름이 맞는 장소를 먼저, 분류·검색어로도 찾는다', () => {
  const r = searchPlaces(seoul.places, '경복');
  expect(r[0].name).toMatch(/경복궁/);
  expect(searchPlaces(seoul.places, '야경').length).toBeGreaterThan(0);
  expect(searchPlaces(seoul.places, '   ')).toEqual([]);
});

test('가까우면 도보, 멀면 노선이 있으면 지하철, 없으면 버스', () => {
  const a = { lat: 37.5665, lon: 126.978 };
  expect(suggestMode(a, { lat: 37.57, lon: 126.98 }, true)).toBe('walk');
  expect(suggestMode(a, { lat: 37.5, lon: 127.03 }, true)).toBe('subway');
  expect(suggestMode(a, { lat: 37.5, lon: 127.03 }, false)).toBe('bus');
});
