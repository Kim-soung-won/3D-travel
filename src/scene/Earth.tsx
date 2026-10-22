// 툰 셰이딩 지구 + 외곽선(뒤집은 껍질) + 대기 테두리. Messenger처럼 "작은 세계" 느낌을 내는 부분.
import { forwardRef, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { AdditiveBlending, BackSide, CanvasTexture, DataTexture, Mesh, NearestFilter, RedFormat, SRGBColorSpace } from 'three';
import { drawEarthTexture, PALETTE } from '../geo/world';

export const EARTH_RADIUS = 1;

/** 3단계 명암 램프: 밝은 면·중간·그늘만 있는 셀 셰이딩 */
function toonRamp() {
  const t = new DataTexture(new Uint8Array([120, 200, 255]), 3, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
    gl_FragColor = vec4(vec3(0.85, 0.97, 1.0), rim * 0.4);
  }`;

interface EarthProps {
  onPick: (e: ThreeEvent<MouseEvent>) => void;
}

export const Earth = forwardRef<Mesh, EarthProps>(function Earth({ onPick }, ref) {
  const map = useMemo(() => {
    const texture = new CanvasTexture(drawEarthTexture(4096));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, []);
  const ramp = useMemo(toonRamp, []);
  useEffect(() => () => { map.dispose(); ramp.dispose(); }, [map, ramp]);

  return (
    <group>
      <mesh
        ref={ref}
        name="earth"
        onClick={(e) => {
          // 드래그로 돌린 뒤 손을 뗀 것은 클릭이 아니다
          if (e.delta > 5) return;
          e.stopPropagation();
          onPick(e);
        }}
        // 지구 뒤편에 가려진 핀이 마우스 올림을 받지 않게 여기서 멈춘다
        onPointerMove={(e) => e.stopPropagation()}
        onPointerOver={() => (document.body.style.cursor = 'crosshair')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <sphereGeometry args={[EARTH_RADIUS, 128, 64]} />
        <meshToonMaterial map={map} gradientMap={ramp} />
      </mesh>
      {/* 외곽선: 조금 큰 구의 안쪽 면만 그린다 */}
      <mesh scale={1.012}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
        <meshBasicMaterial color={PALETTE.coast} side={BackSide} />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          side={BackSide}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
});
