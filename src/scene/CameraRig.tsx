// 카메라 동작 세 가지: 자유 조작(OrbitControls), 경유지로 날아가기, 비행기 따라가기.
// 빈 지구본은 저절로 돌지만, 사용자가 화면을 보는 동안(attention.ts)에는 멈춘다.
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { latLonToVector3, type LatLon } from '../geo/geo';
import { easeMotion, isAttending, type Attention } from './attention';

const AUTO_ROTATE_SPEED = 0.35;

/** 카메라를 보낼 곳. radius(라디안)가 있으면 그만한 땅이 화면에 들어오게 다가간다 */
export type Focus = LatLon & { radius?: number };

interface CameraRigProps {
  focus: Focus | null;
  onFocusDone: () => void;
  follow: boolean;
  followRef: MutableRefObject<Vector3>;
  /** 값이 있으면(도시에 머무는 중) 따라가며 더 다가간다 */
  closeRef?: MutableRefObject<string | null>;
  idle: boolean;
  attention: MutableRefObject<Attention>;
}

/** 반경 r(라디안)인 땅이 화면 좁은 쪽의 45%쯤 차는 카메라 거리. 주변 나라도 보이게 너무 다가가지 않고, 지구 전체(fit)보다 멀어지지 않는다 */
function viewDistance(r: number, camera: PerspectiveCamera, fit: number): number {
  const half = Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect) * 0.45;
  return Math.min(fit, Math.max(1.8, Math.cos(r) + Math.sin(Math.min(r, Math.PI / 2)) / half));
}

export function CameraRig({ focus, onFocusDone, follow, followRef, closeRef, idle, attention }: CameraRigProps) {
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
  const origin = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const side = useMemo(() => new Vector3(), []);
  const interacting = useRef(false);
  const spin = useRef(0);

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
    const c = controls.current;
    const close = follow && !!closeRef?.current;
    if (c) {
      spin.current = easeMotion(spin.current, !idle || isAttending(attention.current, performance.now()), dt);
      c.autoRotateSpeed = AUTO_ROTATE_SPEED * spin.current;
      // 머무는 동안에는 회전 중심을 그 도시로 옮겨 숙소를 비스듬히 보고, 아니면 지구 중심으로 돌아온다
      if (!close) c.target.lerp(origin, k);
      c.minDistance = c.target.lengthSq() > 1e-4 ? 0.15 : 1.35;
    }
    if (close && c && !interacting.current) {
      const p = followRef.current;
      up.copy(p).normalize();
      // 도시의 남쪽 위에서 북쪽을 바라본다. 카메라 위(세계 Y)·지표 수직·시선이 한 평면에 있어 모형이 화면에 똑바로 선다
      side.set(0, 1, 0).addScaledVector(up, -up.y);
      if (side.lengthSq() < 1e-6) side.set(0, 0, 1); // 극점
      side.normalize();
      desired.copy(p).addScaledVector(up, 0.24).addScaledVector(side, -0.3);
      camera.position.lerp(desired, k * 0.6);
      c.target.lerp(p, k * 0.6);
    } else if (follow && !interacting.current) {
      // 이동 중에는 조금 뒤로 물러나 다음 구간이 보이게 한다
      desired.copy(followRef.current).normalize().multiplyScalar(Math.max(fit * 0.85, Math.min(distance, fit * 1.05)));
      camera.position.lerp(desired, k * 0.6);
    } else if (focus && !interacting.current) {
      latLonToVector3(focus, focus.radius === undefined ? Math.max(fit * 0.7, Math.min(distance, fit * 1.05)) : viewDistance(focus.radius, camera as PerspectiveCamera, fit), desired);
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
      autoRotate
      autoRotateSpeed={0}
    />
  );
}
