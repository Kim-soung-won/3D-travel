import { describe, expect, test } from 'vitest';
import { sampleWaypoints, type Waypoint } from '../state/route';
import { codeFromHash, decodeTrip, encodeTrip, shareUrl } from './codec';
import { fromShared, toShared, TripFormatError } from './format';
import { loadSaved, saveTrip, STORAGE_KEY } from './storage';

// id는 새로 붙으므로 비교에서 뺀다
const T = (waypoints: Waypoint[]) => ({ waypoints });
const strip = (t: { waypoints: Waypoint[] }) =>
  t.waypoints.map(({ id: _id, stops, ...rest }) => ({ ...rest, nights: rest.nights ?? 0, stops: stops.map(({ id: _sid, ...s }) => s) }));

describe('공유 링크', () => {
  test('일정 → 링크 → 일정 왕복이 같고, 예시 일정 링크는 600자 이하', async () => {
    const trip = T(sampleWaypoints());
    const code = await encodeTrip(trip);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThanOrEqual(600);
    expect(strip(await decodeTrip(code))).toEqual(strip(trip));
  });
  test('특수문자·이모지 이름과 빈 일정도 왕복', async () => {
    const trip = T([{ id: 'x', name: '카페 "달&별" ☕️ / #1', lat: -33.86882, lon: 151.20929, mode: 'walk' as const, nights: 0, stops: [] }]);
    expect(strip(await decodeTrip(await encodeTrip(trip)))).toEqual(strip(trip));
    expect(await decodeTrip(await encodeTrip(T([])))).toEqual({ waypoints: [] });
  });
  test('잘리거나 손상된 링크는 TripFormatError', async () => {
    const code = await encodeTrip(T(sampleWaypoints()));
    await expect(decodeTrip(code.slice(0, 40))).rejects.toBeInstanceOf(TripFormatError);
    await expect(decodeTrip('잘못된!')).rejects.toBeInstanceOf(TripFormatError);
  });
  test('주소 # 뒤에서 코드를 꺼낸다', () => {
    expect(shareUrl('abc', 'https://ex.com/')).toBe('https://ex.com/#trip=abc');
    expect(codeFromHash('#trip=abc-_1')).toBe('abc-_1');
    expect(codeFromHash('#other=1')).toBeNull();
  });
});

describe('경유지 링크 (v2)', () => {
  test('링크는 왕복하고, 링크 없는 v1 일정도 읽는다', async () => {
    const trip = T([{ id: 'x', name: '파리', lat: 48.85, lon: 2.35, mode: 'plane' as const, nights: 2, link: 'https://maps.app.goo.gl/abc', stops: [{ id: 'y', name: '루브르', lat: 48.86, lon: 2.34, mode: 'walk' as const, link: 'https://www.louvre.fr/' }] }]);
    expect(strip(await decodeTrip(await encodeTrip(trip)))).toEqual(strip(trip));
    expect(fromShared({ v: 1, w: [{ n: '가', la: 0, lo: 0, m: 'walk' }] }).waypoints[0].link).toBeUndefined();
  });
  test('받은 일정의 위험한 링크는 버리고 나머지는 살린다', () => {
    const [w] = fromShared({ v: 2, w: [{ n: '가', la: 0, lo: 0, m: 'walk', u: 'javascript:alert(1)', s: [{ n: '나', la: 0, lo: 0, m: 'walk', u: 'https://ok.example/' }] }] }).waypoints;
    expect(w.link).toBeUndefined();
    expect(w.stops[0].link).toBe('https://ok.example/');
  });
});

describe('시간 단위 일정 (v3·v4)', () => {
  test('첫 도시 도착·출발 시각·머무는 시간·하루 시작이 왕복한다', async () => {
    const trip = {
      start: { date: '2026-10-23', time: '09:30' },
      waypoints: [
        { id: 'a', name: '서울', lat: 37.5, lon: 127, mode: 'plane' as const, nights: 2, leaveAt: '11:00', dayStarts: ['08:00'], stops: [{ id: 'b', name: '경복궁', lat: 37.58, lon: 126.98, mode: 'walk' as const, stayMin: 90 }] },
        { id: 'c', name: '부산', lat: 35.1, lon: 129, mode: 'plane' as const, nights: 0, stayMin: 300, stops: [] },
      ],
    };
    const back = await decodeTrip(await encodeTrip(trip));
    expect(back.start).toEqual(trip.start);
    expect(strip(back)).toEqual(strip(trip));
  });
  test('날짜 없이 시각만 있어도 되고, 틀린 시각은 버린다', () => {
    expect(fromShared({ v: 3, st: 'T07:15', w: [] }).start).toEqual({ time: '07:15' });
    const t = fromShared({ v: 3, st: '2026-02-30T25:00', w: [{ n: '가', la: 0, lo: 0, m: 'walk', lt: '9시', sm: 99999 }] });
    expect(t.start).toBeUndefined();
    expect(t.waypoints[0].leaveAt).toBeUndefined();
    expect(t.waypoints[0].stayMin).toBe(24 * 60);
  });
  test('도시 안 날과 날마다 시작 시각이 왕복하고, v3의 하루 시작은 첫날 시작이 된다', async () => {
    const trip = {
      waypoints: [
        {
          id: 'a', name: '서울', lat: 37.5, lon: 127, mode: 'plane' as const, nights: 2, dayStarts: [null, '10:00'],
          stops: [{ id: 'b', name: '경복궁', lat: 37.58, lon: 126.98, mode: 'walk' as const }, { id: 'c', name: '성수동', lat: 37.54, lon: 127.06, mode: 'walk' as const, day: 3 }],
        },
      ],
    };
    expect(strip(await decodeTrip(await encodeTrip(trip)))).toEqual(strip(trip));
    expect(fromShared({ v: 3, w: [{ n: '가', la: 0, lo: 0, m: 'walk', ds: '08:00' }] }).waypoints[0].dayStarts).toEqual(['08:00']);
    // 날 순서가 어긋난 목록은 날 순서로 놓는다
    const t = fromShared({ v: 4, w: [{ n: '가', la: 0, lo: 0, m: 'walk', ni: 2, s: [{ n: '나', la: 0, lo: 0, m: 'walk', d: 2 }, { n: '다', la: 0, lo: 0, m: 'walk' }] }] });
    expect(t.waypoints[0].stops.map((x) => x.name)).toEqual(['다', '나']);
  });
  test('v2 일정은 시간 필드 없이 읽는다', () => {
    const t = fromShared({ v: 2, w: [{ n: '가', la: 0, lo: 0, m: 'walk', ni: 1 }] });
    expect(t.start).toBeUndefined();
    expect(t.waypoints[0]).not.toHaveProperty('leaveAt');
  });
});

describe('형식 검사', () => {
  test('버전·좌표·수단이 틀리면 거부하고, 숙박은 0~30으로 자른다', () => {
    const ok = toShared(T(sampleWaypoints()));
    expect(() => fromShared({ ...ok, v: 6 })).toThrow(/버전/);
    expect(fromShared({ v: 5, w: [{ n: '가', la: 0, lo: 0, m: 'train' }] }).waypoints[0].mode).toBe('train');
    expect(() => fromShared({ v: 1, w: [{ n: '가', la: 91, lo: 0, m: 'walk' }] })).toThrow(/좌표/);
    expect(() => fromShared({ v: 1, w: [{ n: '가', la: 0, lo: 0, m: 'rocket' }] })).toThrow(/수단/);
    expect(fromShared({ v: 1, w: [{ n: '가', la: 0, lo: 0, m: 'walk', ni: 99 }] }).waypoints[0].nights).toBe(30);
  });
});

describe('자동 저장', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  test('저장한 일정을 다시 읽고, 빈 일정이면 지운다', () => {
    const s = mem();
    expect(saveTrip(T(sampleWaypoints()), s)).toBe(true);
    expect(loadSaved(s).waypoints).toHaveLength(6);
    saveTrip(T([]), s);
    expect(s.m.has(STORAGE_KEY)).toBe(false);
  });
  test('저장소가 막혔거나 내용이 깨지면 빈 일정', () => {
    expect(loadSaved({ getItem: () => '{깨짐' })).toEqual({ waypoints: [] });
    expect(loadSaved({ getItem: () => { throw new Error('blocked'); } })).toEqual({ waypoints: [] });
    expect(saveTrip(T(sampleWaypoints()), { setItem: () => { throw new Error('quota'); }, removeItem: () => {} })).toBe(false);
  });
});
