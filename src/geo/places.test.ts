import { describe, expect, test, vi } from 'vitest';
import { pickPlaceName } from './geocode';
import { MODES, formatDuration } from './modes';
import { fetchLeg, straightLeg } from './routing';

const SEOUL = { lat: 37.5665, lon: 126.978 };
const GANGNAM = { lat: 37.4979, lon: 127.0276 };

describe('장소 이름', () => {
  test('도시 단위(zoom 10)는 도시 이름과 상위 행정구역', () => {
    expect(pickPlaceName({ name: '명동', address: { city: '서울특별시', country: '대한민국' } }, 10)).toEqual({ name: '서울특별시', area: '대한민국' });
    expect(pickPlaceName({ address: { state: '경기도', city: '수원시', country: '대한민국' } }, 10)).toEqual({ name: '수원시', area: '경기도 · 대한민국' });
  });
  test('세부 단위(zoom 18)는 장소 이름과 구·시', () => {
    expect(pickPlaceName({ name: '명동역', address: { city_district: '중구', city: '서울특별시', country: '대한민국' } }, 18)).toEqual({
      name: '명동역',
      area: '중구 · 서울특별시',
    });
  });
  test('이름을 만들 수 없으면 null', () => {
    expect(pickPlaceName({}, 10)).toBeNull();
  });
});

describe('구간 경로', () => {
  test('지하철은 서버에 묻지 않고, 노선 데이터가 있는 도시면 노선을 따른다', async () => {
    const fetcher = vi.fn();
    const leg = await fetchLeg(SEOUL, GANGNAM, 'subway', fetcher as never);
    expect(fetcher).not.toHaveBeenCalled();
    expect(leg.kind).toBe('transit');
    expect(leg.coords.length).toBeGreaterThan(3);
    expect(leg.note).toMatch(/2호선/);
  });
  test('노선 데이터가 없는 곳의 지하철은 평균 속도로 어림한 직선', async () => {
    const a = { lat: 35.8714, lon: 128.6014 }; // 대구 (데이터 없음)
    const b = { lat: 35.8562, lon: 128.5949 };
    const leg = await fetchLeg(a, b, 'subway');
    expect(leg.kind).toBe('fallback');
    expect(leg.durationS).toBeCloseTo((leg.distanceKm / MODES.subway.speedKmh!) * 3600);
  });
  test('비행기는 두 도시의 비행 시간을 알면 그 값을 쓰고, 지상 대안을 적는다', async () => {
    const busan = { lat: 35.1796, lon: 129.0756 };
    const leg = await fetchLeg(SEOUL, busan, 'plane');
    expect(leg.timeKnown).toBe(true);
    expect(leg.durationS).toBe(55 * 60);
    expect(leg.note).toMatch(/KTX/);
    const unknown = await fetchLeg(SEOUL, { lat: 35.8714, lon: 128.6014 }, 'plane');
    expect(unknown.timeKnown).toBeFalsy();
  });
  test('도로 수단은 OSRM 결과를 쓰고, 버스 시간은 자동차의 1.5배로 어림', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 9935, duration: 730, geometry: { coordinates: [[126.978, 37.5665], [127.0276, 37.4979]] } }] }),
    }));
    const leg = await fetchLeg(SEOUL, GANGNAM, 'bus', fetcher as never);
    expect(leg.kind).toBe('road');
    expect(leg.distanceKm).toBeCloseTo(9.935);
    expect(leg.durationS).toBe(1095);
    expect(leg.estimated).toBe(true);
  });
  test('도로가 없거나 서버에 닿지 못하면 직선으로 대신하고 이유를 남긴다', async () => {
    const none = await fetchLeg({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, 'car', (async () => ({ ok: true, json: async () => ({ code: 'NoRoute' }) })) as never);
    expect(none.kind).toBe('fallback');
    expect(none.note).toContain('도로로 이어지지 않아');
    const down = await fetchLeg({ lat: 2, lon: 2 }, { lat: 3, lon: 3 }, 'walk', (async () => { throw new Error('offline'); }) as never);
    expect(down.note).toContain('서버에 닿지 못해');
  });
  test('시간 표기', () => {
    expect(formatDuration(30)).toBe('1분');
    expect(formatDuration(1095)).toBe('18분');
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3시간 20분');
    expect(straightLeg(SEOUL, SEOUL, 'plane').distanceKm).toBe(0);
  });
});
