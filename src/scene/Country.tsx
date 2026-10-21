// 고른 나라: 땅을 칠해 보이고, 주요 도시를 점으로 찍는다. 점을 누르면 그 도시를 경유지로 넣는다.
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

function CityDot({ city, index, hovered, onAdd, onHover }: { city: CityOption; index: number; hovered: boolean; onAdd: (c: CityOption) => void; onHover: (i: number | null) => void }) {
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
      {/* 누르기 쉬운 넉넉한 판정 영역 */}
      <mesh
        visible={false}
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          onAdd(city);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover(index);
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          onHover(null);
        }}
      >
        <sphereGeometry args={[0.022, 8, 6]} />
      </mesh>
    </group>
  );
}

interface CountryLayerProps {
  countryKey: string | null;
  cities: CityOption[];
  hovered: number | null;
  onAddCity: (c: CityOption) => void;
  onHoverCity: (i: number | null) => void;
}

export function CountryLayer({ countryKey, cities, hovered, onAddCity, onHoverCity }: CountryLayerProps) {
  if (!countryKey) return null;
  return (
    <>
      <Overlay countryKey={countryKey} />
      {cities.map((c, i) => (
        <CityDot key={`${c.name}-${i}`} city={c} index={i} hovered={hovered === i} onAdd={onAddCity} onHover={onHoverCity} />
      ))}
    </>
  );
}
