// 도시 단위 일정(도착·출발 시각). 시간대를 찾고, 구간 이동 시간(경로를 찾는 중이면 모름)을 더한다.
// 지구 패널과 도시 패널(첫날 도착·마지막 날 출발)이 함께 쓴다.
import { useMemo } from 'react';
import { useTimeZones } from '../geo/timezone';
import type { RouteState } from '../state/route';
import { computeSchedule, DEFAULT_START, type Schedule } from '../state/schedule';
import type { LegState } from './useLegs';

export function useSchedule(route: Pick<RouteState, 'waypoints' | 'start'>, legs: LegState[]): Schedule | null {
  const zones = useTimeZones(route.waypoints);
  return useMemo(
    () => (zones ? computeSchedule(route.waypoints, zones, legs.map((l) => (l.loading ? null : l.durationS / 60)), route.start ?? DEFAULT_START) : null),
    [route.waypoints, zones, legs, route.start],
  );
}
