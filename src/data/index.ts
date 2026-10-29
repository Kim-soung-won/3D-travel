// 사전 데이터 묶음: 도시별 지하철·명소·추천 루트와 도시 간 이동 참고값.
// 모두 LLM이 생성한 미검증 데이터다(types.ts 머리말 참고).
// 도시 데이터 본문은 도시마다 따로 불러온다(도시가 늘어도 첫 화면 번들이 커지지 않게). 처음부터 들고 있는 것은 어느 도시인지 가르는 범위뿐이다.
import { useEffect, useState } from 'react';
import type { LatLon } from '../geo/geo';
import intercity from './intercity.json';
import type { CityData, IntercityLink } from './types';

// 범위만 가져오는 쪽은 ?ref를 붙여 본문과 다른 모듈로 둔다. 같은 모듈이면 본문 전체가 첫 화면 번들에 들어간다.
// JSON의 필드만 가져오면 번들러가 나머지(노선·명소)를 떼어 낸다
const ids = import.meta.glob<string>('./cities/*.json', { eager: true, import: 'id', query: '?ref' });
const centers = import.meta.glob<CityData['center']>('./cities/*.json', { eager: true, import: 'center', query: '?ref' });
const bboxes = import.meta.glob<CityData['bbox']>('./cities/*.json', { eager: true, import: 'bbox', query: '?ref' });
const bodies = import.meta.glob<CityData>('./cities/*.json', { import: 'default' });

export interface CityRef {
  id: string;
  center: LatLon;
  bbox: CityData['bbox'];
  path: string;
}

export const CITY_REFS: CityRef[] = Object.keys(ids)
  .map((path) => ({ id: ids[path], center: centers[path], bbox: bboxes[path], path }))
  .sort((a, b) => a.id.localeCompare(b.id));

export const DATA_NOTICE = 'AI가 만든 참고 데이터라 실제 노선·위치·시간과 다를 수 있습니다.';

/** 지점이 들어가는 도시. 범위(bbox)가 겹치면 중심에 더 가까운 쪽 */
export function cityRefAt(p: LatLon): CityRef | null {
  let best: CityRef | null = null;
  let bestD = Infinity;
  for (const c of CITY_REFS) {
    const [w, s, e, n] = c.bbox;
    if (p.lon < w || p.lon > e || p.lat < s || p.lat > n) continue;
    const d = (p.lat - c.center.lat) ** 2 + (p.lon - c.center.lon) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

const loaded = new Map<string, CityData>();
const loading = new Map<string, Promise<CityData>>();

/** 도시 데이터 본문을 불러온다. 한 번 불러오면 기억한다 */
export function loadCityData(ref: CityRef): Promise<CityData> {
  let job = loading.get(ref.id);
  if (!job) {
    job = bodies[ref.path]().then((d) => (loaded.set(ref.id, d), d));
    loading.set(ref.id, job);
  }
  return job;
}

/** 지점이 들어가는 도시 데이터. 데이터가 없는 곳이면 null */
export async function cityDataAt(p: LatLon): Promise<CityData | null> {
  const ref = cityRefAt(p);
  return ref ? loadCityData(ref) : null;
}

/** 화면에서 쓰는 도시 데이터. 불러오는 동안은 undefined, 데이터가 없는 곳이면 null */
export function useCityData(p: LatLon): CityData | null | undefined {
  const ref = cityRefAt(p);
  const [got, setGot] = useState<CityData | undefined>(undefined);
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    loadCityData(ref).then((d) => alive && setGot(d));
    return () => {
      alive = false;
    };
  }, [ref]);
  if (!ref) return null;
  return loaded.get(ref.id) ?? (got?.id === ref.id ? got : undefined);
}

const LINKS = intercity.links as IntercityLink[];

/** 두 도시 사이 이동 참고값 (방향 무관) */
export function intercityLink(a: LatLon, b: LatLon): IntercityLink | null {
  const ca = cityRefAt(a)?.id;
  const cb = cityRefAt(b)?.id;
  if (!ca || !cb || ca === cb) return null;
  return LINKS.find((l) => (l.from === ca && l.to === cb) || (l.from === cb && l.to === ca)) ?? null;
}
