// 좌표 → 사람이 읽는 이름. Nominatim(OSM, 키 없음) 역지오코딩.
// 사용 정책(초당 1회 이하)을 지키려고 요청을 한 줄로 세우고 결과를 캐시한다. 실패하면 null.
import type { LatLon } from './geo';

export interface PlaceName {
  /** 목록에 크게 보일 이름 */
  name: string;
  /** 상위 행정구역 (예: "중구 · 서울특별시 · 대한민국") */
  area: string;
}

interface NominatimResult {
  name?: string;
  address?: Record<string, string>;
}

const cache = new Map<string, Promise<PlaceName | null>>();
let queue: Promise<unknown> = Promise.resolve();
const GAP_MS = 1100;

/** zoom 10: 도시 단위, 18: 건물·정류장 단위 */
export function reverseGeocode(p: LatLon, zoom: 10 | 14 | 18, fetcher: typeof fetch = fetch): Promise<PlaceName | null> {
  const key = `${zoom}:${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lon}&zoom=${zoom}&accept-language=ko`;
      const res = await fetcher(url);
      if (!res.ok) return null;
      return pickPlaceName((await res.json()) as NominatimResult, zoom);
    } catch {
      return null;
    } finally {
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
  });
  queue = job;
  cache.set(key, job);
  return job;
}

const CITY_KEYS = ['city', 'town', 'village', 'municipality', 'county'];
const DISTRICT_KEYS = ['city_district', 'borough', 'suburb', 'district', 'quarter', 'neighbourhood'];
const REGION_KEYS = ['state', 'province', 'region'];

const first = (a: Record<string, string>, keys: string[]) => keys.map((k) => a[k]).find(Boolean);

export function pickPlaceName(r: NominatimResult, zoom: number): PlaceName | null {
  const a = r.address ?? {};
  const country = a.country;
  const region = first(a, REGION_KEYS);
  const city = first(a, CITY_KEYS);
  const district = first(a, DISTRICT_KEYS);
  const unique = (xs: (string | undefined)[]) => xs.filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
  if (zoom <= 10) {
    const name = city ?? region ?? r.name ?? country;
    if (!name) return null;
    return { name, area: unique([region, country]).filter((x) => x !== name).join(' · ') };
  }
  const name = r.name || a.road || district || city;
  if (!name) return null;
  return { name, area: unique([district, city, region]).filter((x) => x !== name).join(' · ') };
}
