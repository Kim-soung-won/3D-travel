import { describe, expect, test } from 'vitest';
import { sampleWaypoints } from '../state/route';
import { codeFromHash, decodeTrip, encodeTrip, shareUrl } from './codec';
import { fromShared, toShared, TripFormatError } from './format';
import { loadSaved, saveTrip, STORAGE_KEY } from './storage';

// id는 새로 붙으므로 비교에서 뺀다
const strip = (w: ReturnType<typeof sampleWaypoints>) =>
  w.map(({ id: _id, stops, ...rest }) => ({ ...rest, nights: rest.nights ?? 0, stops: stops.map(({ id: _sid, ...s }) => s) }));

describe('공유 링크', () => {
  test('일정 → 링크 → 일정 왕복이 같고, 예시 일정 링크는 600자 이하', async () => {
    const trip = sampleWaypoints();
    const code = await encodeTrip(trip);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThanOrEqual(600);
    expect(strip(await decodeTrip(code))).toEqual(strip(trip));
  });
  test('특수문자·이모지 이름과 빈 일정도 왕복', async () => {
    const trip = [{ id: 'x', name: '카페 "달&별" ☕️ / #1', lat: -33.86882, lon: 151.20929, mode: 'walk' as const, nights: 0, stops: [] }];
    expect(strip(await decodeTrip(await encodeTrip(trip)))).toEqual(strip(trip));
    expect(await decodeTrip(await encodeTrip([]))).toEqual([]);
  });
  test('잘리거나 손상된 링크는 TripFormatError', async () => {
    const code = await encodeTrip(sampleWaypoints());
    await expect(decodeTrip(code.slice(0, 40))).rejects.toBeInstanceOf(TripFormatError);
    await expect(decodeTrip('잘못된!')).rejects.toBeInstanceOf(TripFormatError);
  });
  test('주소 # 뒤에서 코드를 꺼낸다', () => {
    expect(shareUrl('abc', 'https://ex.com/')).toBe('https://ex.com/#trip=abc');
    expect(codeFromHash('#trip=abc-_1')).toBe('abc-_1');
    expect(codeFromHash('#other=1')).toBeNull();
  });
});

describe('형식 검사', () => {
  test('버전·좌표·수단이 틀리면 거부하고, 숙박은 0~30으로 자른다', () => {
    const ok = toShared(sampleWaypoints());
    expect(() => fromShared({ ...ok, v: 2 })).toThrow(/버전/);
    expect(() => fromShared({ v: 1, w: [{ n: '가', la: 91, lo: 0, m: 'walk' }] })).toThrow(/좌표/);
    expect(() => fromShared({ v: 1, w: [{ n: '가', la: 0, lo: 0, m: 'rocket' }] })).toThrow(/수단/);
    expect(fromShared({ v: 1, w: [{ n: '가', la: 0, lo: 0, m: 'walk', ni: 99 }] })[0].nights).toBe(30);
  });
});

describe('자동 저장', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  test('저장한 일정을 다시 읽고, 빈 일정이면 지운다', () => {
    const s = mem();
    expect(saveTrip(sampleWaypoints(), s)).toBe(true);
    expect(loadSaved(s)).toHaveLength(6);
    saveTrip([], s);
    expect(s.m.has(STORAGE_KEY)).toBe(false);
  });
  test('저장소가 막혔거나 내용이 깨지면 빈 일정', () => {
    expect(loadSaved({ getItem: () => '{깨짐' })).toEqual([]);
    expect(loadSaved({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    expect(saveTrip(sampleWaypoints(), { setItem: () => { throw new Error('quota'); }, removeItem: () => {} })).toBe(false);
  });
});
