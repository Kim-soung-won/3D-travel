// 경유지 핀과 번호 라벨. 라벨은 지구 뒤편으로 넘어가면 흐려지다 사라진다.
// 라벨은 캔버스 밖 DOM 레이어(PinLabels)에 그리고, 캔버스 안 PinLabelProjector가 매 프레임 화면 좌표를 써 넣는다.
// (drei Html은 지구본을 언마운트할 때 렌더 도중 root를 동기 해제해 React 경고를 낸다.)
import { useFrame } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import { Quaternion, Vector3 } from 'three';
import { latLonToVector3 } from '../geo/geo';
import type { Waypoint } from '../state/route';

const UP = new Vector3(0, 1, 0);
const camDir = new Vector3();

interface PinsProps {
  waypoints: Waypoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 경유지 id → 라벨 DOM 요소 */
export type LabelEls = MutableRefObject<Map<string, HTMLDivElement>>;

function Pin({ w, selected, onSelect }: { w: Waypoint; selected: boolean; onSelect: (id: string) => void }) {
  const pos = latLonToVector3(w, 1);
  const q = new Quaternion().setFromUnitVectors(UP, pos.clone().normalize());

  return (
    <group position={pos} quaternion={q}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect(w.id);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.06, 8]} />
          <meshToonMaterial color="#2f4b4f" />
        </mesh>
        <mesh position={[0, 0.065, 0]} scale={selected ? 1.35 : 1}>
          <sphereGeometry args={[0.02, 16, 12]} />
          <meshToonMaterial color={selected ? '#f2a93b' : '#e4572e'} />
        </mesh>
      </group>
    </group>
  );
}

export function Pins({ waypoints, selectedId, onSelect, labels }: PinsProps & { labels: LabelEls }) {
  return (
    <>
      {waypoints.map((w) => (
        <Pin key={w.id} w={w} selected={w.id === selectedId} onSelect={onSelect} />
      ))}
      <PinLabelProjector waypoints={waypoints} labels={labels} />
    </>
  );
}

const anchor = new Vector3();

/** 핀 머리 위(반지름 1.1)를 화면 좌표로 옮기고, 카메라에서 본 면 방향으로 투명도를 정한다 */
function PinLabelProjector({ waypoints, labels }: { waypoints: Waypoint[]; labels: LabelEls }) {
  useFrame(({ camera, size }) => {
    camDir.copy(camera.position).normalize();
    for (const w of waypoints) {
      const el = labels.current.get(w.id);
      if (!el) continue;
      anchor.copy(latLonToVector3(w, 1.1));
      // 지구 가장자리(0) 근처부터 흐려지고 뒤편(음수)에선 숨긴다
      const facing = anchor.clone().normalize().dot(camDir);
      const opacity = Math.min(1, Math.max(0, (facing - 0.05) / 0.2));
      anchor.project(camera);
      const x = ((anchor.x + 1) / 2) * size.width;
      const y = ((1 - anchor.y) / 2) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.opacity = String(opacity);
      el.style.visibility = opacity === 0 ? 'hidden' : 'visible';
    }
  });
  return null;
}

/** 캔버스 위에 겹치는 라벨 DOM 레이어. 위치는 PinLabelProjector가 정한다 */
export function PinLabels({ waypoints, selectedId, labels }: { waypoints: Waypoint[]; selectedId: string | null; labels: LabelEls }) {
  return (
    <div className="pin-labels" aria-hidden="true">
      {waypoints.map((w, i) => (
        <div
          key={w.id}
          ref={(el) => {
            if (el) labels.current.set(w.id, el);
            else labels.current.delete(w.id);
          }}
          className={`pin-label${w.id === selectedId ? ' is-selected' : ''}`}
          style={{ visibility: 'hidden' }}
        >
          <span className="pin-num">{i + 1}</span>
          {w.name}
        </div>
      ))}
    </div>
  );
}
