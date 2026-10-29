// 비행 구간의 출발·도착 공항 고르기. 도시에서 100km 안의 정기편 공항 중에서 고르고, 고르지 않으면 기본 공항(airports.ts)을 쓴다.
import { nearbyAirports, useAirports } from '../geo/airports';
import type { LegState } from '../hooks/useLegs';
import type { Waypoint } from '../state/route';

export function AirportPicker({ from, to, leg, onChange }: {
  from: Waypoint;
  to: Waypoint;
  leg: LegState;
  onChange: (airports: [string | null, string | null] | undefined) => void;
}) {
  const list = useAirports();
  if (!list) return null;
  const choices = [nearbyAirports(list, from), nearbyAirports(list, to)];
  if (!choices[0].length || !choices[1].length) return null; // 이유는 구간 설명(note)에 있다
  const current = [leg.airports?.from.iata ?? '', leg.airports?.to.iata ?? ''];
  const set = (k: 0 | 1, iata: string) => {
    const next: [string | null, string | null] = [from.airports?.[0] ?? null, from.airports?.[1] ?? null];
    next[k] = iata;
    onChange(next);
  };
  return (
    <div className="airports" onClick={(e) => e.stopPropagation()}>
      <span className="airports-label">공항</span>
      {([0, 1] as const).map((k) => (
        <select
          key={k}
          aria-label={`${k ? to.name : from.name} ${k ? '도착' : '출발'} 공항`}
          value={current[k]}
          disabled={leg.loading && !current[k]}
          onChange={(e) => set(k, e.target.value)}
        >
          {!current[k] && <option value="">찾는 중…</option>}
          {choices[k].map((a) => (
            <option key={a.iata} value={a.iata}>
              {a.iata} {a.name} · {Math.round(a.km)}km
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
