// 여행 재생: 도시에서 머물기(숙박·당일)와 구간 이동을 번갈아 보여 준다.
// - 이동: 구간 수단의 모형이 경로를 따라간다. 시간은 3D 길이에 비례하되, 짧은 지면 구간도 보이도록 최소 시간을 둔다.
// - 머물기: 숙박하면 숙소 모형 위로 해와 달이 박 수만큼 돌고, 당일이면 사진기를 든 여행자가 잠깐 선다.
// 위치는 카메라가 따라올 수 있게 공유 ref에 적고, "n일차 · …" 상태 글은 바뀔 때만 올린다.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Group, Vector3 } from 'three';
import { samplePath } from '../geo/geo';
import { travelLine } from '../geo/modes';
import type { Leg3D } from './Arcs';
import { StayModel, VisitModel } from './Stays';
import { Vehicle } from './Vehicles';

/** 재생 속도(초) */
export const PLAY = { perNight: 1.4, visit: 1.4 };

export interface TripStop {
  id: string;
  position: Vector3;
  name: string;
  nights: number;
  /** 도착한 날 (itinerary.cityDays) */
  arrive: number;
}

type Segment =
  | { kind: 'stay'; stop: number; start: number; duration: number }
  | { kind: 'move'; leg: number; start: number; duration: number };

export function buildTimeline(stops: Pick<TripStop, 'nights'>[], legs: Leg3D[]): Segment[] {
  const segs: Segment[] = [];
  let t = 0;
  stops.forEach((s, i) => {
    const stay = s.nights > 0 ? s.nights * PLAY.perNight : PLAY.visit;
    segs.push({ kind: 'stay', stop: i, start: t, duration: stay });
    t += stay;
    const leg = legs[i];
    if (!leg) return;
    let len = 0;
    for (let k = 1; k < leg.points.length; k++) len += leg.points[k].distanceTo(leg.points[k - 1]);
    const duration = leg.mode === 'plane' ? Math.max(2.5, (len / Math.PI) * 8) : Math.max(2.5, (len / Math.PI) * 30);
    segs.push({ kind: 'move', leg: i, start: t, duration });
    t += duration;
  });
  return segs;
}

/** 지금 상태를 한 줄로: "3일차 · 도쿄도에서 1/2박", "2일차 · 비행기로 서울 → 부산" */
export function statusAt(seg: Segment, local: number, stops: Pick<TripStop, 'name' | 'nights' | 'arrive'>[], legs: Pick<Leg3D, 'mode'>[]): string {
  if (seg.kind === 'stay') {
    const s = stops[seg.stop];
    if (s.nights === 0) return `${s.arrive}일차 · ${s.name} 둘러보는 중`;
    const night = Math.min(s.nights, Math.floor(local / PLAY.perNight) + 1);
    return `${s.arrive + night - 1}일차 · ${s.name}에서 ${night}/${s.nights}박`;
  }
  const from = stops[seg.leg];
  const to = stops[seg.leg + 1];
  return `${from.arrive + from.nights}일차 · ${travelLine(legs[seg.leg].mode, from.name, to.name)}`;
}

interface TravelerProps {
  legs: Leg3D[];
  stops: TripStop[];
  playing: boolean;
  positionRef: MutableRefObject<Vector3>;
  onProgress: (t: number) => void;
  onStatus: (text: string) => void;
  onDone: () => void;
  /** 지금 머무는 도시 id (머물지 않으면 null). 카메라는 다가가고, 그 도시 라벨은 모형을 가리지 않게 숨긴다 */
  stayRef: MutableRefObject<string | null>;
}

export function Traveler({ legs, stops, playing, positionRef, onProgress, onStatus, onDone, stayRef }: TravelerProps) {
  const obj = useRef<Group>(null);
  const elapsed = useRef(0);
  const lastReported = useRef(-1);
  const lastStatus = useRef('');
  const phase = useRef(0);
  const [segIndex, setSegIndex] = useState(0);
  const look = useMemo(() => new Vector3(), []);
  const south = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);

  const timeline = useMemo(() => buildTimeline(stops, legs), [stops, legs]);
  const last = timeline.at(-1);
  const total = last ? last.start + last.duration : 0;

  useFrame((_, dt) => {
    const o = obj.current;
    if (!o || !legs.length || !timeline.length) return;
    if (playing) {
      elapsed.current += Math.min(dt, 0.05);
      if (elapsed.current >= total) {
        elapsed.current = 0;
        lastStatus.current = '';
        onDone();
      }
    }
    let i = timeline.findIndex((x) => elapsed.current < x.start + x.duration);
    if (i < 0) i = timeline.length - 1;
    if (i !== segIndex) setSegIndex(i);
    const seg = timeline[i];
    const local = elapsed.current - seg.start;

    if (seg.kind === 'move') {
      const leg = legs[seg.leg];
      const { position, direction } = samplePath(leg.points, local / seg.duration);
      o.position.copy(position);
      o.up.copy(position).normalize();
      o.lookAt(look.copy(position).add(direction));
      o.scale.setScalar(leg.mode === 'plane' ? 0.045 : 0.018);
      stayRef.current = null;
    } else {
      // 지표에 세우고, 앞(+z)이 남쪽(카메라가 오는 쪽)을 보게 돌린다
      const p = stops[seg.stop].position;
      up.copy(p).normalize();
      o.position.copy(p);
      o.up.copy(up);
      south.set(0, -1, 0).addScaledVector(up, up.y);
      o.lookAt(look.copy(p).add(south));
      o.scale.setScalar(0.04);
      phase.current = (local / PLAY.perNight) % 1;
      stayRef.current = playing ? stops[seg.stop].id : null;
    }
    positionRef.current.copy(o.position);

    if (playing) {
      const text = statusAt(seg, local, stops, legs);
      if (text !== lastStatus.current) {
        lastStatus.current = text;
        onStatus(text);
      }
    }
    const pct = Math.round((elapsed.current / total) * 100);
    if (pct !== lastReported.current) {
      lastReported.current = pct;
      onProgress(elapsed.current / total);
    }
  });

  if (!legs.length || !timeline.length) return null;
  const seg = timeline[Math.min(segIndex, timeline.length - 1)];
  return (
    <group ref={obj} visible={playing}>
      {seg.kind === 'move' ? (
        <Vehicle mode={legs[seg.leg].mode} />
      ) : stops[seg.stop]?.nights > 0 ? (
        <StayModel phase={phase} />
      ) : (
        <VisitModel />
      )}
    </group>
  );
}

