// 수단별 작은 3D 모델. 모두 +z가 앞, +y가 지면에서 위.
import type { Mode } from '../geo/modes';

function Plane() {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.18, 1.1, 4, 12]} />
        <meshToonMaterial color="#fffaf0" />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[1.6, 0.06, 0.32]} />
        <meshToonMaterial color="#e4572e" />
      </mesh>
      <mesh position={[0, 0.2, -0.62]}>
        <boxGeometry args={[0.06, 0.4, 0.22]} />
        <meshToonMaterial color="#e4572e" />
      </mesh>
      <mesh position={[0, 0.02, -0.62]}>
        <boxGeometry args={[0.6, 0.05, 0.18]} />
        <meshToonMaterial color="#e4572e" />
      </mesh>
    </group>
  );
}

function Wheels({ z, color = '#2f4b4f' }: { z: number[]; color?: string }) {
  return (
    <>
      {z.flatMap((zz) =>
        [-0.28, 0.28].map((x) => (
          <mesh key={`${zz}${x}`} position={[x, 0.1, zz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.08, 10]} />
            <meshToonMaterial color={color} />
          </mesh>
        )),
      )}
    </>
  );
}

function Bus() {
  return (
    <group>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.6, 0.5, 1.4]} />
        <meshToonMaterial color="#e4572e" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.62, 0.16, 1.2]} />
        <meshToonMaterial color="#fffaf0" />
      </mesh>
      <Wheels z={[-0.45, 0.45]} />
    </group>
  );
}

function Car() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.55, 0.25, 1]} />
        <meshToonMaterial color="#f2a93b" />
      </mesh>
      <mesh position={[0, 0.45, -0.05]}>
        <boxGeometry args={[0.48, 0.2, 0.55]} />
        <meshToonMaterial color="#fffaf0" />
      </mesh>
      <Wheels z={[-0.32, 0.32]} />
    </group>
  );
}

function Subway() {
  return (
    <group>
      {[-0.75, 0.75].map((z) => (
        <mesh key={z} position={[0, 0.3, z]}>
          <boxGeometry args={[0.5, 0.45, 1.4]} />
          <meshToonMaterial color="#d9d3f0" />
        </mesh>
      ))}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.52, 0.12, 2.9]} />
        <meshToonMaterial color="#7b5ea7" />
      </mesh>
    </group>
  );
}

function Train() {
  return (
    <group>
      {[-0.8, 0.8].map((z) => (
        <mesh key={z} position={[0, 0.32, z]}>
          <boxGeometry args={[0.5, 0.48, 1.5]} />
          <meshToonMaterial color="#fffaf0" />
        </mesh>
      ))}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.52, 0.14, 3.1]} />
        <meshToonMaterial color="#3f7cc4" />
      </mesh>
      {/* 앞머리: 고속열차처럼 둥글게 */}
      <mesh position={[0, 0.3, 1.6]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.9]}>
        <sphereGeometry args={[0.25, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial color="#3f7cc4" />
      </mesh>
    </group>
  );
}

function Walker() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]}>
        <capsuleGeometry args={[0.16, 0.45, 4, 10]} />
        <meshToonMaterial color="#2e8b57" />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.15, 12, 10]} />
        <meshToonMaterial color="#fde3c8" />
      </mesh>
    </group>
  );
}

export function Vehicle({ mode }: { mode: Mode }) {
  switch (mode) {
    case 'plane':
      return <Plane />;
    case 'train':
      return <Train />;
    case 'bus':
      return <Bus />;
    case 'car':
      return <Car />;
    case 'subway':
      return <Subway />;
    case 'walk':
      return <Walker />;
  }
}
