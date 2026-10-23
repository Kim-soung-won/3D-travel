import { expect, test } from 'vitest';
import { liftLabels } from './labelLayout';

const box = (x: number, y: number, priority = 0) => ({ x, y, w: 100, h: 24, priority });

test('겹치지 않으면 그대로 둔다', () => {
  expect(liftLabels([box(0, 100), box(200, 100)])).toEqual([0, 0]);
});

test('겹치면 우선순위가 낮은 라벨을 위로 띄운다 (서울·부산을 멀리서 본 경우처럼)', () => {
  // 1번이 먼저 놓이고, 오른쪽 아래 2번은 1번 라벨 위(100 - 24 - 3 = 73)로 올라간다
  const [a, b] = liftLabels([box(0, 100, 0), box(30, 110, 1)]);
  expect(a).toBe(0);
  expect(b).toBe(110 - 73);
});

test('고른 라벨이 먼저 제자리를 차지한다', () => {
  const [a, b] = liftLabels([box(0, 100, 1), box(30, 100, 0)]);
  expect(b).toBe(0);
  expect(a).toBeGreaterThan(0);
});

test('셋이 겹치면 차례로 쌓고, 쌓인 라벨끼리도 겹치지 않는다', () => {
  const boxes = [box(0, 100, 0), box(10, 100, 1), box(20, 100, 2)];
  const lifts = liftLabels(boxes);
  const tops = lifts.map((l, i) => boxes[i].y - l - 24);
  const bottoms = lifts.map((l, i) => boxes[i].y - l);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(bottoms[j] <= tops[i] || bottoms[i] <= tops[j]).toBe(true);
});
