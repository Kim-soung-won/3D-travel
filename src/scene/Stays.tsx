// 머무는 동안의 모형: 숙박하면 숙소 + 캐리어를 든 여행자, 해와 달이 숙박 수만큼 돈다.
// 당일 들르면 사진기를 든 여행자. 모두 +y가 지면에서 위, +z가 카메라 쪽.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react';
import { MeshToonMaterial, type Group } from 'three';

/** 하룻밤 안의 진행(0..1). 0~0.45 낮, 그 뒤는 밤 */
export type PhaseRef = MutableRefObject<number>;
const isNight = (phase: number) => phase >= 0.45;

function Traveler({ x = 0, children }: { x?: number; children?: ReactNode }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <capsuleGeometry args={[0.16, 0.45, 4, 10]} />
        <meshToonMaterial color="#2e8b57" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.15, 12, 10]} />
        <meshToonMaterial color="#fde3c8" />
      </mesh>
      {children}
    </group>
  );
}

function Suitcase() {
  return (
    <group position={[0.32, 0, 0.05]}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.3, 0.42, 0.16]} />
        <meshToonMaterial color="#f2a93b" />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.04, 0.14, 0.04]} />
        <meshToonMaterial color="#2f4b4f" />
      </mesh>
    </group>
  );
}

function Hotel({ phase }: { phase: PhaseRef }) {
  // 창 네 개가 같은 재질을 써서, 밤에 한꺼번에 불이 켜진다
  const windows = useMemo(() => new MeshToonMaterial({ color: '#cfe0df' }), []);
  useEffect(() => () => windows.dispose(), [windows]);
  useFrame(() => {
    windows.color.set(isNight(phase.current) ? '#ffd166' : '#cfe0df');
  });
  return (
    <group position={[-0.55, 0, -0.3]}>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.8, 1.2, 0.6]} />
        <meshToonMaterial color="#fffaf0" />
      </mesh>
      <mesh position={[0, 1.32, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.62, 0.42, 4]} />
        <meshToonMaterial color="#e4572e" />
      </mesh>
      {[0.35, 0.75].flatMap((y) =>
        [-0.18, 0.18].map((x) => (
          <mesh key={`${x}${y}`} position={[x, y, 0.305]} material={windows}>
            <planeGeometry args={[0.18, 0.2]} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** 숙소 위로 해와 달이 반대편에서 돈다 */
function SkyCycle({ phase }: { phase: PhaseRef }) {
  const pivot = useRef<Group>(null);
  useFrame(() => {
    if (pivot.current) pivot.current.rotation.z = -phase.current * Math.PI * 2;
  });
  return (
    <group position={[-0.2, 0.6, -0.4]}>
      <group ref={pivot}>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.2, 14, 10]} />
          <meshToonMaterial color="#f2a93b" emissive="#f2a93b" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, -1.5, 0]}>
          <sphereGeometry args={[0.16, 14, 10]} />
          <meshToonMaterial color="#fff6dd" emissive="#fff6dd" emissiveIntensity={0.3} />
        </mesh>
      </group>
    </group>
  );
}

export function StayModel({ phase }: { phase: PhaseRef }) {
  return (
    <group>
      <Hotel phase={phase} />
      <SkyCycle phase={phase} />
      <Traveler x={0.25}>
        <Suitcase />
      </Traveler>
    </group>
  );
}

/** 당일 들름: 사진기를 든 여행자 */
export function VisitModel() {
  return (
    <group>
      <Traveler>
        <mesh position={[0.12, 0.85, 0.2]}>
          <boxGeometry args={[0.26, 0.17, 0.12]} />
          <meshToonMaterial color="#2f4b4f" />
        </mesh>
        <mesh position={[0.12, 0.85, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
          <meshToonMaterial color="#7bbfbd" />
        </mesh>
      </Traveler>
    </group>
  );
}
