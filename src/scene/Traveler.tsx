// 구간마다 해당 수단의 모델로 경로를 따라 이동한다. 위치는 카메라가 따라올 수 있게 공유 ref에 적는다.
// 구간 시간은 3D 길이에 비례하되, 짧은 지면 구간도 보이도록 최소 시간을 둔다.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Group, Vector3 } from 'three';
import { samplePath } from '../geo/geo';
import type { Leg3D } from './Arcs';
import { Vehicle } from './Vehicles';

interface TravelerProps {
  legs: Leg3D[];
  playing: boolean;
  positionRef: MutableRefObject<Vector3>;
  onProgress: (t: number) => void;
  onDone: () => void;
}

export function Traveler({ legs, playing, positionRef, onProgress, onDone }: TravelerProps) {
  const obj = useRef<Group>(null);
  const elapsed = useRef(0);
  const lastReported = useRef(-1);
  const [legIndex, setLegIndex] = useState(0);
  const look = useMemo(() => new Vector3(), []);

  const timeline = useMemo(() => {
    let start = 0;
    return legs.map((leg) => {
      let len = 0;
      for (let i = 1; i < leg.points.length; i++) len += leg.points[i].distanceTo(leg.points[i - 1]);
      const duration = leg.mode === 'plane' ? Math.max(2.5, (len / Math.PI) * 8) : Math.max(2.5, (len / Math.PI) * 30);
      const item = { start, duration };
      start += duration;
      return item;
    });
  }, [legs]);
  const total = timeline.length ? timeline[timeline.length - 1].start + timeline[timeline.length - 1].duration : 0;

  useFrame((_, dt) => {
    const o = obj.current;
    if (!o || !legs.length) return;
    if (playing) {
      elapsed.current += Math.min(dt, 0.05);
      if (elapsed.current >= total) {
        elapsed.current = 0;
        onDone();
      }
    }
    let i = timeline.findIndex((x) => elapsed.current < x.start + x.duration);
    if (i < 0) i = timeline.length - 1;
    if (i !== legIndex) setLegIndex(i);
    const leg = legs[i];
    const { position, direction } = samplePath(leg.points, (elapsed.current - timeline[i].start) / timeline[i].duration);
    o.position.copy(position);
    o.up.copy(position).normalize();
    o.lookAt(look.copy(position).add(direction));
    o.scale.setScalar(leg.mode === 'plane' ? 0.045 : 0.018);
    positionRef.current.copy(position);
    const pct = Math.round((elapsed.current / total) * 100);
    if (pct !== lastReported.current) {
      lastReported.current = pct;
      onProgress(elapsed.current / total);
    }
  });

  if (!legs.length) return null;
  return (
    <group ref={obj} visible={playing}>
      <Vehicle mode={legs[Math.min(legIndex, legs.length - 1)].mode} />
    </group>
  );
}
