// 경유지 순서 최적화: 첫 지점은 그대로 두고, 나머지를 들르는 순서 중 총 이동 거리가 짧은 것을 찾는다.
// 가까운 곳부터 고르는 순서로 시작해 2-opt(두 구간을 맞바꿔 꼬임 풀기)로 다듬는다.
// 정확한 최적해는 아니지만 경유지 수십 곳까지는 충분히 가깝고 즉시 끝난다.
import { distanceKm, type LatLon } from './geo';

export function pathKm(points: LatLon[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i]);
  return km;
}

/** 새 순서(입력 배열의 원소를 재배열). 3곳 미만이면 그대로 */
export function optimizeOrder<T extends LatLon>(points: T[]): T[] {
  if (points.length < 3) return points.slice();
  const rest = points.slice(1);
  const order: T[] = [points[0]];
  while (rest.length) {
    const last = order.at(-1)!;
    let k = 0;
    for (let i = 1; i < rest.length; i++) if (distanceKm(last, rest[i]) < distanceKm(last, rest[k])) k = i;
    order.push(rest.splice(k, 1)[0]);
  }
  // 2-opt: i..j 구간을 뒤집어 짧아지면 받아들인다. 끝점은 열린 경로라 j가 마지막이면 뒤 구간이 없다
  const d = (a: LatLon, b: LatLon | undefined) => (b ? distanceKm(a, b) : 0);
  for (let improved = true, guard = 0; improved && guard < 100; guard++) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++)
      for (let j = i + 1; j < order.length; j++) {
        const before = d(order[i - 1], order[i]) + d(order[j], order[j + 1]);
        const after = d(order[i - 1], order[j]) + d(order[i], order[j + 1]);
        if (after < before - 1e-9) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  return order;
}
