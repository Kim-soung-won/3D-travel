// 고른 나라: 땅을 칠해 보이고, 주요 도시를 점으로 찍는다.
// 지구본 클릭은 나라 고르기만 하므로 점은 누를 수 없다. 포인터를 올리면 패널 목록의 같은 줄을 강조할 뿐이고, 도시는 목록에서 넣는다.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Group, SRGBColorSpace } from 'three';
import type { CityOption } from '../data/places';
import { latLonToVector3 } from '../geo/geo';
import { drawCountryOverlay } from '../geo/world';

function Overlay({ countryKey }: { countryKey: string }) {
  const map = useMemo(() => {
    const t = new CanvasTexture(drawCountryOverlay(countryKey));
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [countryKey]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh scale={1.0015} raycast={() => null}>
      <sphereGeometry args={[1, 128, 64]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} />
    </mesh>
  );
}

function CityDot({ city, index, hovered, onHover }: { city: CityOption; index: number; hovered: boolean; onHover: (i: number | null) => void }) {
  const dot = useRef<Group>(null);
  const pos = useMemo(() => latLonToVector3(city, 1.004), [city]);
  // 가까이 다가가면 점이 땅을 덮지 않게 줄인다
  useFrame(({ camera }) => {
    dot.current?.scale.setScalar(Math.min(1, Math.max(0.15, camera.position.distanceTo(pos) / 2.2)) * (hovered ? 1.5 : 1));
  });
  const r = city.capital ? 0.011 : 0.008;
  return (
    <group ref={dot} position={pos}>
      <mesh>
        <sphereGeometry args={[r, 12, 8]} />
        <meshToonMaterial color={hovered ? '#e4572e' : city.capital ? '#1f3437' : '#2f4b4f'} />
      </mesh>
      {/* 마우스 올림 판정. 클릭은 그대로 지구(나라 고르기)로 넘긴다 */}
      <mesh visible={false} onPointerOver={() => onHover(index)} onPointerOut={() => onHover(null)}>
        <sphereGeometry args={[r * 1.6, 8, 6]} />
      </mesh>
    </group>
  );
}

interface CountryLayerProps {
  countryKey: string | null;
  cities: CityOption[];
  hovered: number | null;
  onHoverCity: (i: number | null) => void;
}

export function CountryLayer({ countryKey, cities, hovered, onHoverCity }: CountryLayerProps) {
  if (!countryKey) return null;
  return (
    <>
      <Overlay countryKey={countryKey} />
      {cities.map((c, i) => (
        <CityDot key={`${c.name}-${i}`} city={c} index={i} hovered={hovered === i} onHover={onHoverCity} />
      ))}
    </>
  );
}
