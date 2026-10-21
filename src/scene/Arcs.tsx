// 구간 선: 비행기는 떠오른 대권 곡선, 지면 수단은 지표에 붙은 선(도로 경로가 있으면 도로 모양).
import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Vector3 } from 'three';
import { MODES, type Mode } from '../geo/modes';

export interface Leg3D {
  points: Vector3[];
  mode: Mode;
  fallback: boolean;
}

export function Arcs({ legs }: { legs: Leg3D[] }) {
  const dashed = useRef<Array<{ material: { dashOffset: number } } | null>>([]);
  useFrame((_, dt) => {
    for (const line of dashed.current) if (line) line.material.dashOffset -= dt * 0.25;
  });
  return (
    <>
      {legs.map((leg, i) => {
        const info = MODES[leg.mode];
        const air = leg.mode === 'plane';
        return (
          <group key={i}>
            <Line points={leg.points} color="#2f4b4f" lineWidth={air ? 5 : 6} transparent opacity={0.55} />
            <Line
              ref={(el) => {
                dashed.current[i] = (info.dash || leg.fallback ? el : null) as never;
              }}
              points={leg.points}
              color={info.color}
              lineWidth={air ? 2.5 : 3.5}
              dashed={!!info.dash || leg.fallback}
              dashSize={air ? 0.04 : 0.012}
              gapSize={air ? 0.025 : 0.008}
            />
          </group>
        );
      })}
    </>
  );
}
