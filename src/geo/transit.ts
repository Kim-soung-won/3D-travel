// 지하철 경로: 도시 데이터의 노선·역으로 그래프를 만들고, 출발지→역(도보)→노선(환승 포함)→역→도착지(도보)를
// 가장 짧은 시간으로 찾는다. 시간은 시간표가 아니라 평균값으로 어림한다.
import type { CityData } from '../data/types';
import { distanceKm, type LatLon } from './geo';

/** 어림 상수 (분) */
export const TRANSIT = {
  /** 역까지 걷는 길은 직선보다 이만큼 길다 */
  walkDetour: 1.3,
  walkKmh: 4.5,
  /** 역 사이 운행: 역마다 정차 시간 + 거리 / 평균 운행 속도 */
  dwellMin: 0.4,
  rideKmh: 40,
  /** 처음 탈 때 기다리는 시간, 환승마다 걷고 기다리는 시간 */
  firstWaitMin: 4,
  transferMin: 5,
  /** 출발·도착지에서 이 거리 안의 역만 후보로 본다 */
  accessKm: 1.5,
  accessCandidates: 3,
};

interface Node {
  line: string;
  lineName: string;
  station: string;
  at: LatLon;
}

interface Graph {
  nodes: Node[];
  edges: { to: number; min: number; transfer: boolean }[][];
}

const graphs = new WeakMap<CityData, Graph>();

function buildGraph(city: CityData): Graph {
  const cached = graphs.get(city);
  if (cached) return cached;
  const nodes: Node[] = [];
  const edges: Graph['edges'] = [];
  const link = (a: number, b: number, min: number, transfer: boolean) => {
    edges[a].push({ to: b, min, transfer });
    edges[b].push({ to: a, min, transfer });
  };
  const ride = (a: LatLon, b: LatLon) => TRANSIT.dwellMin + (distanceKm(a, b) / TRANSIT.rideKmh) * 60;
  for (const line of city.lines) {
    const first = nodes.length;
    line.stations.forEach((s, i) => {
      nodes.push({ line: line.id, lineName: line.name, station: s.name, at: s });
      edges.push([]);
      if (i > 0) link(first + i - 1, first + i, ride(line.stations[i - 1], s), false);
    });
    if (line.loop && line.stations.length > 2) link(nodes.length - 1, first, ride(line.stations.at(-1)!, line.stations[0]), false);
  }
  // 이름이 같은 역은 노선끼리 환승으로 잇는다
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++)
      if (nodes[a].station === nodes[b].station && nodes[a].line !== nodes[b].line) link(a, b, TRANSIT.transferMin, true);
  const g = { nodes, edges };
  graphs.set(city, g);
  return g;
}

const walkMin = (a: LatLon, b: LatLon) => ((distanceKm(a, b) * TRANSIT.walkDetour) / TRANSIT.walkKmh) * 60;

function nearest(g: Graph, p: LatLon): number[] {
  return g.nodes
    .map((n, i) => ({ i, d: distanceKm(p, n.at) }))
    .filter((x) => x.d <= TRANSIT.accessKm)
    .sort((x, y) => x.d - y.d)
    .slice(0, TRANSIT.accessCandidates * 2) // 환승역은 노선마다 노드가 있어 넉넉히 본다
    .map((x) => x.i);
}

export interface TransitRide {
  lineName: string;
  from: string;
  to: string;
  stops: number;
}

export interface TransitRoute {
  /** [경도, 위도]: 출발지 → 탄 역들 → 도착지 */
  coords: [number, number][];
  distanceKm: number;
  durationS: number;
  rides: TransitRide[];
  walkMin: number;
}

/** 지하철 경로. 양쪽 끝 가까이에 역이 없으면 null */
export function transitRoute(city: CityData, a: LatLon, b: LatLon): TransitRoute | null {
  const g = buildGraph(city);
  const starts = nearest(g, a);
  const ends = new Set(nearest(g, b));
  if (!starts.length || !ends.size) return null;

  // 다익스트라. 노드 수가 수백 개라 단순 배열로 충분하다
  const dist = new Array<number>(g.nodes.length).fill(Infinity);
  const prev = new Array<number>(g.nodes.length).fill(-1);
  const done = new Array<boolean>(g.nodes.length).fill(false);
  for (const s of starts) dist[s] = walkMin(a, g.nodes[s].at) + TRANSIT.firstWaitMin;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const e of g.edges[u])
      if (dist[u] + e.min < dist[e.to]) {
        dist[e.to] = dist[u] + e.min;
        prev[e.to] = u;
      }
  }
  let end = -1;
  let best = Infinity;
  for (const t of ends) {
    const total = dist[t] + walkMin(g.nodes[t].at, b);
    if (total < best) [end, best] = [t, total];
  }
  if (end < 0 || best === Infinity) return null;

  const path: number[] = [];
  for (let u = end; u >= 0; u = prev[u]) path.unshift(u);

  // 같은 노선으로 이어 탄 구간을 하나의 탑승으로 묶는다
  const rides: TransitRide[] = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [g.nodes[path[i - 1]], g.nodes[path[i]]];
    if (p.line !== q.line) continue; // 환승
    const last = rides.at(-1);
    if (last && last.lineName === q.lineName && last.to === p.station) {
      last.to = q.station;
      last.stops += 1;
    } else rides.push({ lineName: q.lineName, from: p.station, to: q.station, stops: 1 });
  }

  const points: LatLon[] = [a];
  for (const i of path) {
    const at = g.nodes[i].at;
    const last = points.at(-1)!;
    if (last.lat !== at.lat || last.lon !== at.lon) points.push(at);
  }
  points.push(b);
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i]);
  const walk = walkMin(a, g.nodes[path[0]].at) + walkMin(g.nodes[end].at, b);
  return { coords: points.map((p) => [p.lon, p.lat]), distanceKm: km, durationS: best * 60, rides, walkMin: walk };
}

/** "2호선 시청→강남 (8정거장)" 식 요약 */
export function describeRides(r: TransitRoute): string {
  if (!r.rides.length) return '걸어서 가는 편이 낫습니다';
  return r.rides.map((x) => `${x.lineName} ${x.from}→${x.to}`).join(', 환승 ');
}
