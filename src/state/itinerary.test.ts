import { expect, test } from 'vitest';
import { cityDays, formatDayRange, formatTrip, nightsOf, totalNights } from './itinerary';

test('도시마다 도착·출발 날짜: 숙박 수만큼 다음 도시 도착이 늦어진다', () => {
  const days = cityDays([{ nights: 2 }, { nights: 0 }, { nights: 3 }]);
  expect(days).toEqual([
    { arrive: 1, leave: 3, nights: 2 },
    { arrive: 3, leave: 3, nights: 0 },
    { arrive: 3, leave: 6, nights: 3 },
  ]);
  expect(formatDayRange(days[0])).toBe('1~3일차');
  expect(formatDayRange(days[1])).toBe('3일차');
});

test('전체 일정은 총 숙박 + 1일, 숙박이 없으면 당일', () => {
  expect(formatTrip(totalNights([{ nights: 2 }, { nights: 1 }]))).toBe('3박 4일');
  expect(formatTrip(totalNights([{}, { nights: 0 }]))).toBe('당일 일정');
});

test('숙박 수는 0~30 정수로 다룬다', () => {
  expect(nightsOf({ nights: -2 })).toBe(0);
  expect(nightsOf({ nights: 99 })).toBe(30);
  expect(nightsOf({ nights: 1.6 })).toBe(2);
  expect(nightsOf({})).toBe(0);
});
