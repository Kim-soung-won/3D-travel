// 사전 데이터 묶음: 도시별 지하철·명소·추천 루트와 도시 간 이동 참고값.
// 모두 LLM이 생성한 미검증 데이터다(types.ts 머리말 참고).
import type { LatLon } from '../geo/geo';
import intercity from './intercity.json';
import type { CityData, IntercityLink } from './types';

const modules = import.meta.glob<CityData>('./cities/*.json', { eager: true, import: 'default' });

export const CITIES: CityData[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));

export const DATA_NOTICE = 'AI가 만든 참고 데이터라 실제 노선·위치·시간과 다를 수 있습니다.';

/** 지점이 들어가는 도시 데이터. 범위(bbox)가 겹치면 중심에 더 가까운 쪽 */
export function cityDataAt(p: LatLon): CityData | null {
  let best: CityData | null = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    const [w, s, e, n] = c.bbox;
    if (p.lon < w || p.lon > e || p.lat < s || p.lat > n) continue;
    const d = (p.lat - c.center.lat) ** 2 + (p.lon - c.center.lon) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

const LINKS = intercity.links as IntercityLink[];

/** 두 도시 사이 이동 참고값 (방향 무관) */
export function intercityLink(a: LatLon, b: LatLon): IntercityLink | null {
  const ca = cityDataAt(a)?.id;
  const cb = cityDataAt(b)?.id;
  if (!ca || !cb || ca === cb) return null;
  return LINKS.find((l) => (l.from === ca && l.to === cb) || (l.from === cb && l.to === ca)) ?? null;
}
