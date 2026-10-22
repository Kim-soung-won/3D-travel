// 좌표 → 시간대(IANA 이름). @photostructure/tz-lookup(CC0)을 처음 쓸 때 별도 청크로 불러온다.
// 시간대 경계를 단순화한 데이터라 국경·시간대 경계 바로 옆에서는 틀릴 수 있다.
import { useEffect, useMemo, useState } from 'react';
import type { LatLon } from './geo';

type Lookup = (lat: number, lon: number) => string;
let lookup: Promise<Lookup> | null = null;

export function loadTzLookup(): Promise<Lookup> {
  lookup ??= import('@photostructure/tz-lookup').then((m) => ((m as { default?: Lookup }).default ?? (m as unknown as Lookup)));
  return lookup;
}

/** 브라우저가 모르는 이름이면 경도로 어림한 고정 시차(Etc/GMT±n, 부호가 반대)를 쓴다 */
export function safeZone(name: string | undefined, lon: number): string {
  if (name) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: name });
      return name;
    } catch {
      /* 아래로 */
    }
  }
  const h = Math.round(lon / 15);
  return h === 0 ? 'Etc/GMT' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

/** 지점마다 시간대. 불러오기 전에는 null */
export function useTimeZones(points: LatLon[]): string[] | null {
  const key = useMemo(() => points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join(';'), [points]);
  const [state, setState] = useState<{ key: string; zones: string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const pts = key ? key.split(';').map((s) => s.split(',').map(Number)) : [];
    loadTzLookup().then((fn) => {
      if (!alive) return;
      const zones = pts.map(([lat, lon]) => {
        try {
          return safeZone(fn(lat, lon), lon);
        } catch {
          return safeZone(undefined, lon);
        }
      });
      setState({ key, zones });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return state?.key === key ? state.zones : null;
}
