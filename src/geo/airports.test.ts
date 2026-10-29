import { describe, expect, test } from 'vitest';
import { CITY_REFS } from '../data';
import access from '../data/airport-access.json';
import { airportAccess, chooseAirport, defaultAirport, loadAirports, nearbyAirports } from './airports';

const SEOUL = { lat: 37.5665, lon: 126.978 };
const BUSAN = { lat: 35.1796, lon: 129.0756 };
const TOKYO = { lat: 35.6812, lon: 139.7671 };
const KYOTO = { lat: 35.0116, lon: 135.7681 };
const PARIS = { lat: 48.8566, lon: 2.3522 };
const DAEGU = { lat: 35.8714, lon: 128.6014 };

describe('공항', () => {
  test('도시에서 100km 안의 정기편 공항을 가까운 순으로 찾는다 (서울: 김포 약 15km, 인천 약 50km)', async () => {
    const list = await loadAirports();
    const near = nearbyAirports(list, SEOUL).map((a) => a.iata);
    expect(near.slice(0, 2)).toEqual(['GMP', 'ICN']);
    expect(nearbyAirports(list, { lat: 0, lon: -30 })).toEqual([]); // 대서양 한가운데
  });

  test('사전 데이터 도시는 국제선·국내선 우선순위로 기본 공항을 고른다', async () => {
    const list = await loadAirports();
    expect(defaultAirport(list, SEOUL, TOKYO)?.iata).toBe('ICN');
    expect(defaultAirport(list, SEOUL, BUSAN)?.iata).toBe('GMP');
    expect(defaultAirport(list, TOKYO, SEOUL)?.iata).toBe('NRT');
    expect(defaultAirport(list, KYOTO, SEOUL)?.iata).toBe('KIX'); // 교토에는 공항이 없다
    expect(defaultAirport(list, PARIS, SEOUL)?.iata).toBe('CDG');
    // 데이터가 없는 도시는 가장 가까운 대형 공항, 없으면 가장 가까운 공항
    expect(defaultAirport(list, DAEGU, SEOUL)?.iata).toBe('TAE');
  });

  test('고른 공항이 그 도시 가까이 없으면 기본 공항으로 돌아간다', async () => {
    const list = await loadAirports();
    expect(chooseAirport(list, SEOUL, TOKYO, 'GMP')?.iata).toBe('GMP');
    expect(chooseAirport(list, SEOUL, TOKYO, 'CDG')?.iata).toBe('ICN');
  });

  test('공항 ↔ 도심 교통은 사전 데이터에 있는 도시만', () => {
    expect(airportAccess(SEOUL, 'ICN')).toMatchObject({ minutes: 51 });
    expect(airportAccess(DAEGU, 'TAE')).toBeNull();
  });
});

test('공항 사전 데이터(airport-access.json)는 있는 도시·공항만 가리키고, 공항은 도시에서 100km 안', async () => {
  const list = await loadAirports();
  const centers = new Map(CITY_REFS.map((c) => [c.id, c.center]));
  const check = (city: string, iata: string) => {
    const center = centers.get(city);
    expect(center, city).toBeDefined();
    expect(nearbyAirports(list, center!, 50).map((a) => a.iata), `${city} ${iata}`).toContain(iata);
  };
  for (const [city, p] of Object.entries(access.cities)) for (const iata of [...p.international, ...p.domestic]) check(city, iata);
  for (const x of access.access) check(x.city, x.iata);
});
