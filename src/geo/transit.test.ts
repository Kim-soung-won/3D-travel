import { describe, expect, test } from 'vitest';
import type { CityData } from '../data/types';
import { TRANSIT, transitRoute } from './transit';

// 가짜 도시: A선(가-나-다)과 B선(다-라)이 "다"에서 갈아탄다. 역 간격 약 1.1km
const city: CityData = {
  id: 't', name: '테스트', country: '-', center: { lat: 0, lon: 0.02 }, bbox: [-1, -1, 1, 1], source: '-',
  lines: [
    { id: 'a', name: 'A선', color: '#000000', stations: [{ name: '가', lat: 0, lon: 0 }, { name: '나', lat: 0, lon: 0.01 }, { name: '다', lat: 0, lon: 0.02 }] },
    { id: 'b', name: 'B선', color: '#000000', stations: [{ name: '다', lat: 0, lon: 0.02 }, { name: '라', lat: 0.01, lon: 0.02 }] },
  ],
  places: [], routes: [],
};

describe('지하철 경로', () => {
  test('환승을 포함해 역을 따라가고, 탑승 구간을 노선별로 묶는다', () => {
    const r = transitRoute(city, { lat: 0, lon: -0.001 }, { lat: 0.0105, lon: 0.02 })!;
    expect(r.rides).toEqual([
      { lineName: 'A선', from: '가', to: '다', stops: 2 },
      { lineName: 'B선', from: '다', to: '라', stops: 1 },
    ]);
    // 시간 = 걷기 + 첫 대기 + 운행(정차 포함) + 환승
    expect(r.durationS / 60).toBeGreaterThan(TRANSIT.firstWaitMin + TRANSIT.transferMin + 3 * TRANSIT.dwellMin);
    expect(r.coords[0]).toEqual([-0.001, 0]);
    expect(r.coords.at(-1)).toEqual([0.02, 0.0105]);
  });
  test('양 끝 가까이에 역이 없으면 null', () => {
    expect(transitRoute(city, { lat: 0.5, lon: 0.5 }, { lat: 0, lon: 0 })).toBeNull();
  });
});
