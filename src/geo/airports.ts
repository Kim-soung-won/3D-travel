// 공항: 정기편 공항 목록(OurAirports, data/airports.json — 처음 쓸 때 따로 불러온다)과
// 사전 데이터 도시의 공항 우선순위·도심 교통(data/airport-access.json, AI 생성 참고값).
import { useEffect, useState } from 'react';
import { cityRefAt } from '../data';
import access from '../data/airport-access.json';
import { distanceKm, type LatLon } from './geo';
import { countryKeyAt } from './world';

export interface Airport extends LatLon {
  iata: string;
  /** 한국어 이름이 있으면 한국어, 없으면 영어 */
  name: string;
  en: string;
  /** 나라 ISO 코드 */
  country: string;
  large: boolean;
}

/** 도시에서 이만큼 안의 공항만 그 도시 공항으로 본다 (교토–간사이 약 80km) */
export const AIRPORT_RADIUS_KM = 100;

type Row = [string, string, string, number, number, string, 0 | 1];
let file: Promise<Airport[]> | null = null;

export function loadAirports(): Promise<Airport[]> {
  file ??= import('../data/airports.json').then((m) =>
    (m.default as unknown as { airports: Row[] }).airports.map(([iata, name, en, lat, lon, country, large]) => ({ iata, name, en, lat, lon, country, large: large === 1 })),
  );
  return file;
}

/** 화면용: 공항 목록. 불러오는 동안은 null */
export function useAirports(): Airport[] | null {
  const [list, setList] = useState<Airport[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadAirports().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** 도시 가까운 공항. 가까운 순. 대형 공항이 하나라도 있으면 대형만 (공군 기지를 겸한 지방 공항·소형 비행장은 뺀다) */
export function nearbyAirports(list: Airport[], p: LatLon, limit = 5): (Airport & { km: number })[] {
  const near = list
    .map((a) => ({ ...a, km: distanceKm(p, a) }))
    .filter((a) => a.km <= AIRPORT_RADIUS_KM)
    .sort((a, b) => a.km - b.km);
  return (near.some((a) => a.large) ? near.filter((a) => a.large) : near).slice(0, limit);
}

type CityPrefs = Record<string, { international: string[]; domestic: string[] }>;
const PREFS = access.cities as CityPrefs;

/**
 * 비행 구간에서 이 도시가 쓸 기본 공항.
 * 사전 데이터 도시면 국제선·국내선 우선순위(서울 국제선은 인천, 국내선은 김포)를, 아니면 가장 가까운 대형 공항, 그도 없으면 가장 가까운 공항.
 */
export function defaultAirport(list: Airport[], p: LatLon, other: LatLon): Airport | null {
  const near = nearbyAirports(list, p, 20);
  const prefs = PREFS[cityRefAt(p)?.id ?? ''];
  if (prefs) {
    const domestic = countryKeyAt(p) !== null && countryKeyAt(p) === countryKeyAt(other);
    for (const iata of domestic ? prefs.domestic : prefs.international) {
      const hit = near.find((a) => a.iata === iata);
      if (hit) return hit;
    }
  }
  return near.find((a) => a.large) ?? near[0] ?? null;
}

/** 고른 공항(IATA)이 그 도시 가까이 있으면 그 공항, 아니면 기본 공항 */
export function chooseAirport(list: Airport[], p: LatLon, other: LatLon, iata: string | null | undefined): Airport | null {
  const chosen = iata ? nearbyAirports(list, p, 50).find((a) => a.iata === iata) : undefined;
  return chosen ?? defaultAirport(list, p, other);
}

/** 사전 데이터에 있는 공항 ↔ 도심 대표 교통편 */
export function airportAccess(p: LatLon, iata: string): { name: string; minutes: number } | null {
  const city = cityRefAt(p)?.id;
  return (city && access.access.find((x) => x.city === city && x.iata === iata)) || null;
}
