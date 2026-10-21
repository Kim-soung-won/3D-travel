// 나라별 주요 도시 목록. Natural Earth(퍼블릭 도메인)에서 scripts/build-places.mjs로 만든다.
// 지구본에서 나라를 누를 때 처음 불러오고(별도 청크), 이후에는 메모리에 둔다.
import type { LatLon } from '../geo/geo';

export interface CityOption extends LatLon {
  /** 한국어 이름 (없으면 영어) */
  name: string;
  en: string;
  pop: number;
  capital: boolean;
}

export interface CountryCities {
  /** 한국어 나라 이름 */
  ko: string;
  /** 인구순 */
  cities: CityOption[];
}

type Row = [string, string, number, number, number, 0 | 1];
interface PlacesFile {
  countries: Record<string, { ko: string; cities: Row[] }>;
}

export const PLACES_NOTICE = '도시 목록: Natural Earth (나라마다 인구가 많은 도시 20곳까지)';

export function parseCountry(raw: PlacesFile['countries'][string]): CountryCities {
  return { ko: raw.ko, cities: raw.cities.map(([name, en, lat, lon, pop, capital]) => ({ name, en, lat, lon, pop, capital: capital === 1 })) };
}

let file: Promise<PlacesFile> | null = null;

/** 나라 키(world-atlas 이름)의 도시 목록. 데이터에 없는 나라면 빈 목록 */
export async function loadCountryCities(key: string): Promise<CountryCities> {
  file ??= import('./places.json').then((m) => m.default as unknown as PlacesFile);
  const raw = (await file).countries[key];
  return raw ? parseCountry(raw) : { ko: key, cities: [] };
}
