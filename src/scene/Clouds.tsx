// 지구 위를 천천히 도는 구름 몇 덩이. 장식이라 클릭을 받지 않는다.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Quaternion, Vector3 } from 'three';
import { latLonToVector3 } from '../geo/geo';

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function Clouds({ count = 14 }: { count?: number }) {
  const group = useRef<Group>(null);
  const puffs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const pos = latLonToVector3({ lat: rand(i + 1) * 140 - 70, lon: rand(i + 50) * 360 - 180 }, 1.07);
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pos.clone().normalize());
        const size = 0.025 + rand(i + 99) * 0.03;
        return { pos, q, size, parts: [0, 1, 2].map((k) => [(k - 1) * size * 1.1, 0, rand(i * 3 + k) * size * 0.6 - size * 0.3] as const) };
      }),
    [count],
  );
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.012;
  });
  return (
    <group ref={group} raycast={() => null}>
      {puffs.map((p, i) => (
        <group key={i} position={p.pos} quaternion={p.q}>
          {p.parts.map(([x, y, z], k) => (
            <mesh key={k} position={[x, y, z]} scale={[1, 0.45, 1]} raycast={() => null}>
              <icosahedronGeometry args={[p.size * (k === 1 ? 1.25 : 1), 1]} />
              <meshToonMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
