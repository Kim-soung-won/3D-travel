import { describe, expect, it } from 'vitest';
import { computeDayPlan, computeSchedule, formatClock, formatOffset, formatSpan, formatWhen, isDate, localTime, scheduleDayRange, zonedToUtc } from './schedule';

const SEOUL = 'Asia/Seoul';
const LA = 'America/Los_Angeles';
const PARIS = 'Europe/Paris';

describe('시간대', () => {
  it('현지 시각을 절대 시각으로 바꾼다 (시차·서머타임)', () => {
    expect(zonedToUtc('2026-10-23', '09:00', SEOUL)).toBe(Date.UTC(2026, 9, 23, 0, 0));
    expect(zonedToUtc('2026-07-01', '12:00', LA)).toBe(Date.UTC(2026, 6, 1, 19, 0)); // PDT
    expect(zonedToUtc('2026-12-01', '12:00', LA)).toBe(Date.UTC(2026, 11, 1, 20, 0)); // PST
    expect(formatOffset(Date.UTC(2026, 6, 1), LA)).toBe('UTC−7');
    expect(formatOffset(Date.UTC(2026, 6, 1), 'Asia/Kolkata')).toBe('UTC+5:30');
  });

  it('날짜 형식을 검사한다', () => {
    expect(isDate('2026-10-23')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('10/23')).toBe(false);
  });
});

describe('도시 단위 일정', () => {
  const cities = [
    { nights: 2 }, // 서울: 기본 10:00 출발
    { nights: 0, stayMin: 150 }, // LA 당일 2시간 30분
    { nights: 1, leaveAt: '08:30' }, // 파리
  ];
  const tzs = [SEOUL, LA, PARIS];

  it('도착·출발을 현지 시각으로 계산한다. 서울에서 10시간 날아가면 LA에는 같은 날 이른 아침에 닿는다', () => {
    const s = computeSchedule(cities, tzs, [600, 660], { date: '2026-10-23', time: '09:00' })!;
    const [seoul, la, paris] = s.cities;
    expect(formatWhen(seoul.arrive, SEOUL, s.base, true)).toBe('10/23(금) 09:00');
    expect(formatWhen(seoul.leave, SEOUL, s.base, true)).toBe('10/25(일) 10:00');
    // 10/25 10:00 KST + 10시간 = 10/25 20:00 KST = 10/25 04:00 PDT
    expect(formatWhen(la.arrive, LA, s.base, true)).toBe('10/25(일) 04:00');
    expect(localTime(la.leave, LA)).toBe('06:30');
    // LA 06:30 PDT + 11시간 = 10/25 17:30 PDT = 10/26 01:30 CET(파리는 10/25에 서머타임 끝)
    expect(formatWhen(paris.arrive, PARIS, s.base, true)).toBe('10/26(월) 01:30');
    expect(formatWhen(paris.leave, PARIS, s.base, true)).toBe('10/27(화) 08:30');
    expect(scheduleDayRange(s, 0)).toBe('1~3일차');
    expect(s.pending).toBe(false);
  });

  it('날짜가 없으면 n일차로 보이고, 이동 시간을 모르는 구간이 있으면 pending', () => {
    const s = computeSchedule(cities, tzs, [600, null], { time: '09:00' }, Date.UTC(2026, 5, 1))!;
    expect(s.withDate).toBe(false);
    expect(formatWhen(s.cities[0].arrive, SEOUL, s.base, false)).toBe('1일차 09:00');
    expect(s.pending).toBe(true);
  });
});

describe('도시 안 하루 일정', () => {
  it('하루 시작부터 머무는 시간과 이동 시간을 더한다', () => {
    const { places, pending } = computeDayPlan('09:30', [{ stayMin: 90 }, {}, { stayMin: 600 }], [20, 45]);
    expect(places.map((p) => `${formatClock(p.arrive)}–${formatClock(p.leave)}`)).toEqual(['09:30–11:00', '11:20–12:20', '13:05–23:05']);
    expect(pending).toBe(false);
    expect(formatClock(25 * 60 + 10)).toBe('다음 날 01:10');
  });
});

it('기간을 짧게 쓴다', () => {
  expect(formatSpan(45)).toBe('45분');
  expect(formatSpan(210)).toBe('3시간 30분');
  expect(formatSpan(2 * 1440 + 60)).toBe('2일 1시간');
});
