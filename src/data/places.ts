// 나라별 주요 도시 목록. Natural Earth(퍼블릭 도메인)에서 scripts/build-places.mjs로 만든다.
// 지구본에서 나라를 누를 때 처음 불러오고(별도 청크), 이후에는 메모리에 둔다.
// 목록(places.json)은 나라마다 20곳이고, 검색 칸에 쓰면 그 나라의 모든 도시(places-all.json, 더 큰 청크)에서 찾는다.
import type { LatLon } from '../geo/geo';

export interface CityOption extends LatLon {
  /** 한국어 이름 (없으면 영어) */
  name: string;
  en: string;
  pop: number;
  capital: boolean;
  /** 1:110m 지도에 없어 가까운 나라에 붙인 작은 나라·속령의 이름 (예: 싱가포르 → 말레이시아 목록) */
  area?: string;
}

export interface CountryCities {
  /** 한국어 나라 이름 */
  ko: string;
  /** 인구순 */
  cities: CityOption[];
}

type Row = [string, string, number, number, number, 0 | 1, string?];
interface PlacesFile {
  countries: Record<string, { ko: string; cities: Row[] }>;
}

export const PLACES_NOTICE = '도시 목록: Natural Earth (목록은 인구가 많은 20곳, 검색하면 더 작은 도시까지)';

const parseRow = ([name, en, lat, lon, pop, capital, area]: Row): CityOption => ({ name, en, lat, lon, pop, capital: capital === 1, ...(area ? { area } : {}) });

export function parseCountry(raw: PlacesFile['countries'][string]): CountryCities {
  return { ko: raw.ko, cities: raw.cities.map(parseRow) };
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\s'’.-]/g, '');

/** 이름(한국어·영어)에 검색어가 든 도시. 이름이 검색어로 시작하면 앞에, 그다음 인구순 */
export function searchCities(cities: CityOption[], query: string, limit = 30): CityOption[] {
  const q = norm(query);
  if (!q) return [];
  const score = (c: CityOption) => (norm(c.name).startsWith(q) || norm(c.en).startsWith(q) ? 0 : norm(c.name).includes(q) || norm(c.en).includes(q) ? 1 : 2);
  return cities
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s < 2)
    .sort((a, b) => a.s - b.s || b.c.pop - a.c.pop)
    .slice(0, limit)
    .map((x) => x.c);
}

let allFile: Promise<Record<string, Row[]>> | null = null;

/** 나라 안의 모든 도시에서 이름으로 찾는다. 처음 찾을 때 전체 목록을 불러온다 */
export async function searchCountryCities(key: string, query: string): Promise<CityOption[]> {
  allFile ??= import('./places-all.json').then((m) => (m.default as unknown as { countries: Record<string, Row[]> }).countries);
  return searchCities(((await allFile)[key] ?? []).map(parseRow), query);
}

let file: Promise<PlacesFile> | null = null;

/** 나라 키(world-atlas 이름)의 도시 목록. 데이터에 없는 나라면 빈 목록 */
export async function loadCountryCities(key: string): Promise<CountryCities> {
  file ??= import('./places.json').then((m) => m.default as unknown as PlacesFile);
  const raw = (await file).countries[key];
  return raw ? parseCountry(raw) : { ko: key, cities: [] };
}
