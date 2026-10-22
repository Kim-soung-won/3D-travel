import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import { Mesh, Vector3 } from 'three';
import type { CityOption } from '../data/places';
import { greatCircleArc, latLonToVector3, vector3ToLatLon, type LatLon } from '../geo/geo';
import type { LegState } from '../hooks/useLegs';
import type { Waypoint } from '../state/route';
import { Arcs, type Leg3D } from './Arcs';
import { AttentionTracker, createAttention, type Attention } from './attention';
import { CameraRig, type Focus } from './CameraRig';
import { Clouds } from './Clouds';
import { CountryLayer } from './Country';
import { Earth } from './Earth';
import { PinLabels, Pins } from './Pins';
import { cityDays, nightsOf } from '../state/itinerary';
import { Traveler, type TripStop } from './Traveler';

interface SceneProps {
  waypoints: Waypoint[];
  legs: LegState[];
  selectedId: string | null;
  focus: Focus | null;
  playing: boolean;
  /** 지구본을 누른 곳. 나라를 고르는 데 쓴다 */
  onPick: (p: LatLon) => void;
  /** 고른 나라(world-atlas 이름)와 그 나라의 주요 도시 */
  country: string | null;
  countryCities: CityOption[];
  hoveredCity: number | null;
  onHoverCity: (i: number | null) => void;
  onSelect: (id: string) => void;
  /** 핀을 두 번 눌러 그 도시 화면으로 들어간다 */
  onEnterCity: (id: string) => void;
  onFocusDone: () => void;
  onProgress: (t: number) => void;
  /** 재생 중 지금 상태 한 줄 ("3일차 · 도쿄도에서 1/2박") */
  onStatus: (text: string) => void;
  onPlayDone: () => void;
  /** 첫 프레임을 그린 뒤 한 번 (로딩 화면을 걷는 신호) */
  onReady: () => void;
}

const DOUBLE_CLICK_MS = 450;

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
  const stayRef = useRef<string | null>(null);
  const attention = useRef<Attention>(createAttention(performance.now()));

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

  const tripStops = useMemo<TripStop[]>(() => {
    const days = cityDays(waypoints);
    return waypoints.map((w, i) => ({ id: w.id, position: latLonToVector3(w, 1.002), name: w.name, nights: nightsOf(w), arrive: days[i].arrive }));
  }, [waypoints]);

  // 두 번 누르기는 클릭 두 번의 간격으로 판단한다. 첫 클릭에 카메라가 핀으로 날아가기 시작해
  // 두 번째 클릭이 핀을 벗어나 지구 표면에 닿을 수 있으므로, 그때도 같은 핀을 두 번 누른 것으로 본다
  const lastPin = useRef<{ id: string; t: number } | null>(null);
  const takeDouble = (id?: string) => {
    const last = lastPin.current;
    const hit = last && performance.now() - last.t < DOUBLE_CLICK_MS && (id === undefined || id === last.id);
    lastPin.current = null;
    if (hit) props.onEnterCity(last.id);
    return hit;
  };
  const selectPin = (id: string) => {
    if (takeDouble(id)) return;
    lastPin.current = { id, t: performance.now() };
    props.onSelect(id);
  };
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (takeDouble()) return;
    props.onPick(vector3ToLatLon(e.point));
  };

  return (
    <>
      <Canvas camera={{ position: [0.45, 1.0, 3.45], fov: 40, near: 0.01, far: 100 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#7bbfbd']} />
        <ReadySignal onReady={props.onReady} />
        <AttentionTracker target={attention} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 3, 5]} intensity={2.2} />
        <Earth ref={earthRef} onPick={pick} />
        <Clouds attention={attention} />
        <Arcs legs={legs3d} />
        <CountryLayer
          countryKey={playing ? null : props.country}
          cities={props.countryCities}
          hovered={props.hoveredCity}
          onHoverCity={props.onHoverCity}
        />
        <Pins waypoints={waypoints} selectedId={props.selectedId} onSelect={selectPin} labels={labels} hiddenRef={stayRef} />
        <Traveler
          legs={legs3d}
          stops={tripStops}
          stayRef={stayRef}
          onStatus={props.onStatus}
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
          closeRef={stayRef}
          idle={!waypoints.length && !playing}
          attention={attention}
        />
      </Canvas>
      <PinLabels waypoints={waypoints} selectedId={props.selectedId} labels={labels} />
    </>
  );
}
