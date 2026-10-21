// 연속한 지점 목록의 구간 경로를 가져온다. 경로를 받는 동안은 직선을 임시로 쓰고 loading을 켠다.
import { useEffect, useMemo, useState } from 'react';
import type { LatLon } from '../geo/geo';
import type { Mode } from '../geo/modes';
import { fetchLeg, legKey, straightLeg, type LegGeometry } from '../geo/routing';

export interface LegState extends LegGeometry {
  mode: Mode;
  loading: boolean;
}

export function useLegs(points: (LatLon & { mode: Mode })[]): LegState[] {
  const keys = useMemo(() => points.slice(1).map((b, i) => legKey(points[i], b, points[i].mode)), [points]);
  const [done, setDone] = useState<Record<string, LegGeometry>>({});

  useEffect(() => {
    let alive = true;
    points.slice(1).forEach((b, i) => {
      const a = points[i];
      fetchLeg(a, b, a.mode).then((geo) => {
        if (alive) setDone((d) => (d[keys[i]] === geo ? d : { ...d, [keys[i]]: geo }));
      });
    });
    return () => {
      alive = false;
    };
  }, [points, keys]);

  // 같은 입력이면 같은 배열을 돌려준다. 재생 effect가 이 배열에 걸려 있어, 렌더마다 새로 만들면 재생이 처음으로 돌아간다.
  return useMemo(
    () =>
      points.slice(1).map((b, i) => {
        const a = points[i];
        const geo = done[keys[i]];
        return geo ? { ...geo, mode: a.mode, loading: false } : { ...straightLeg(a, b, a.mode), mode: a.mode, loading: true };
      }),
    [points, keys, done],
  );
}
