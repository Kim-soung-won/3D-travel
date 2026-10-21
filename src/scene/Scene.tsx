import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import { Mesh, Vector3 } from 'three';
import { greatCircleArc, latLonToVector3, vector3ToLatLon, type LatLon } from '../geo/geo';
import type { LegState } from '../hooks/useLegs';
import type { Waypoint } from '../state/route';
import { Arcs, type Leg3D } from './Arcs';
import { CameraRig } from './CameraRig';
import { Clouds } from './Clouds';
import { Earth } from './Earth';
import { PinLabels, Pins } from './Pins';
import { Traveler } from './Traveler';

interface SceneProps {
  waypoints: Waypoint[];
  legs: LegState[];
  selectedId: string | null;
  focus: LatLon | null;
  playing: boolean;
  onPick: (p: LatLon) => void;
  onSelect: (id: string) => void;
  onFocusDone: () => void;
  onProgress: (t: number) => void;
  onPlayDone: () => void;
  /** 첫 프레임을 그린 뒤 한 번 (로딩 화면을 걷는 신호) */
  onReady: () => void;
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 2) onReady();
  });
  return null;
}

export function Scene(props: SceneProps) {
  const { waypoints, playing } = props;
  const earthRef = useRef<Mesh>(null);
  const travelerPos = useRef(new Vector3()) as MutableRefObject<Vector3>;
  const labels = useRef(new Map<string, HTMLDivElement>());

  // 비행기는 떠오른 대권 곡선, 지면 수단은 지표 바로 위(도로 경로가 있으면 그 모양, 없으면 지표 대권)
  const legs3d = useMemo<Leg3D[]>(
    () =>
      props.legs.map((leg, i) => {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        if (leg.mode === 'plane')
          return {
            points: greatCircleArc(a, b, 1.004, 96),
            mode: leg.mode,
            fallback: false,
          };
        const points =
          leg.kind === 'road' || leg.kind === 'transit'
            ? leg.coords.map(([lon, lat]) => latLonToVector3({ lat, lon }, 1.003))
            : greatCircleArc(a, b, 1, 64).map((p) => p.normalize().multiplyScalar(1.003));
        return { points, mode: leg.mode, fallback: leg.kind === 'fallback' };
      }),
    [props.legs, waypoints],
  );

  const pick = (e: ThreeEvent<MouseEvent>) => props.onPick(vector3ToLatLon(e.point));

  return (
    <>
      <Canvas camera={{ position: [0.45, 1.0, 3.45], fov: 40, near: 0.01, far: 100 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#7bbfbd']} />
        <ReadySignal onReady={props.onReady} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 3, 5]} intensity={2.2} />
        <Earth ref={earthRef} onPick={pick} />
        <Clouds />
        <Arcs legs={legs3d} />
        <Pins waypoints={waypoints} selectedId={props.selectedId} onSelect={props.onSelect} labels={labels} />
        <Traveler
          legs={legs3d}
          playing={playing}
          positionRef={travelerPos}
          onProgress={props.onProgress}
          onDone={props.onPlayDone}
        />
        <CameraRig
          focus={props.focus}
          onFocusDone={props.onFocusDone}
          follow={playing}
          followRef={travelerPos}
          idle={!waypoints.length && !playing}
        />
      </Canvas>
      <PinLabels waypoints={waypoints} selectedId={props.selectedId} labels={labels} />
    </>
  );
}
