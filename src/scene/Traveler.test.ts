import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import type { Leg3D } from './Arcs';
import { buildTimeline, PLAY, statusAt } from './Traveler';

const leg = (mode: Leg3D['mode']): Leg3D => ({ mode, fallback: false, points: [new Vector3(1, 0, 0), new Vector3(0, 1, 0)] });
const stops = [
  { name: '서울', nights: 2, arrive: 1 },
  { name: '부산', nights: 0, arrive: 3 },
  { name: '도쿄', nights: 1, arrive: 3 },
];
const legs = [leg('plane'), leg('bus')];

test('머물기와 이동이 번갈아 오고, 숙박 길이는 박 수에 비례한다', () => {
  const t = buildTimeline(stops, legs);
  expect(t.map((s) => s.kind)).toEqual(['stay', 'move', 'stay', 'move', 'stay']);
  expect(t[0].duration).toBeCloseTo(2 * PLAY.perNight);
  expect(t[2].duration).toBeCloseTo(PLAY.visit);
  t.slice(1).forEach((s, i) => expect(s.start).toBeCloseTo(t[i].start + t[i].duration));
});

test('상태 글: 몇 일차, 몇 번째 밤, 어떤 수단으로 어디서 어디로', () => {
  const t = buildTimeline(stops, legs);
  expect(statusAt(t[0], 0.1, stops, legs)).toBe('1일차 · 서울에서 1/2박');
  expect(statusAt(t[0], PLAY.perNight + 0.1, stops, legs)).toBe('2일차 · 서울에서 2/2박');
  expect(statusAt(t[1], 0.5, stops, legs)).toBe('3일차 · 비행기로 서울 → 부산');
  expect(statusAt(t[2], 0.1, stops, legs)).toBe('3일차 · 부산 둘러보는 중');
  expect(statusAt(t[3], 0.1, stops, legs)).toBe('3일차 · 버스로 부산 → 도쿄');
});
