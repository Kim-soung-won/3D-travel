import { expect, test } from 'vitest';
import { optimizeOrder, pathKm } from './optimize';

const p = (id: string, lon: number) => ({ id, lat: 0, lon });

test('첫 지점은 그대로 두고 오가는 순서를 풀어 총 거리를 줄인다', () => {
  const zigzag = [p('a', 0), p('d', 0.03), p('b', 0.01), p('e', 0.04), p('c', 0.02)];
  const out = optimizeOrder(zigzag);
  expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(pathKm(out)).toBeLessThan(pathKm(zigzag));
});

test('결과는 같은 지점들의 재배열이고, 이미 짧은 순서면 그대로', () => {
  const line = [p('a', 0), p('b', 0.01), p('c', 0.02)];
  expect(optimizeOrder(line)).toEqual(line);
  expect(optimizeOrder(line.slice(0, 2))).toEqual(line.slice(0, 2));
});
