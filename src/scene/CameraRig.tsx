// 카메라 동작 세 가지: 자유 조작(OrbitControls), 경유지로 날아가기, 비행기 따라가기.
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { latLonToVector3, type LatLon } from '../geo/geo';

interface CameraRigProps {
  focus: LatLon | null;
  onFocusDone: () => void;
  follow: boolean;
  followRef: MutableRefObject<Vector3>;
  idle: boolean;
}

export function CameraRig({ focus, onFocusDone, follow, followRef, idle }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  // 지구본(대기 포함 반지름 약 1.15)이 화면의 좁은 쪽에 들어오는 카메라 거리
  const fit = useMemo(() => {
    const vfov = ((camera as PerspectiveCamera).fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / size.height));
    return 1.18 / Math.sin(Math.min(vfov, hfov) / 2);
  }, [camera, size.width, size.height]);
  // 창 크기가 바뀌어 지구본이 넘치면 뒤로 물러난다
  useEffect(() => {
    if (camera.position.length() < fit) camera.position.setLength(fit);
  }, [camera, fit]);
  const desired = useMemo(() => new Vector3(), []);
  const interacting = useRef(false);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const start = () => (interacting.current = true);
    c.addEventListener('start', start);
    return () => c.removeEventListener('start', start);
  }, []);
  // 새 목표가 생기면 사용자가 돌리던 상태를 풀어 카메라가 움직일 수 있게 한다
  useEffect(() => {
    interacting.current = false;
  }, [focus, follow]);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.02, dt); // 프레임률과 무관한 부드러운 접근
    const distance = camera.position.length();
    if (follow && !interacting.current) {
      // 비행기 위에서 조금 뒤로 물러나 다음 구간이 보이게 한다
      desired.copy(followRef.current).normalize().multiplyScalar(Math.max(fit * 0.85, Math.min(distance, fit * 1.05)));
      camera.position.lerp(desired, k * 0.6);
    } else if (focus && !interacting.current) {
      latLonToVector3(focus, Math.max(fit * 0.7, Math.min(distance, fit * 1.05)), desired);
      camera.position.lerp(desired, k);
      if (camera.position.distanceTo(desired) < 0.01) onFocusDone();
    }
    controls.current?.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      minDistance={1.35}
      maxDistance={6}
      autoRotate={idle}
      autoRotateSpeed={0.35}
    />
  );
}
