// 경유지 핀과 번호 라벨. 라벨은 지구 뒤편으로 넘어가면 흐려지다 사라진다.
// 라벨은 캔버스 밖 DOM 레이어(PinLabels)에 그리고, 캔버스 안 PinLabelProjector가 매 프레임 화면 좌표를 써 넣는다.
// (drei Html은 지구본을 언마운트할 때 렌더 도중 root를 동기 해제해 React 경고를 낸다.)
import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import { Quaternion, Vector3, type Group } from 'three';
import { latLonToVector3 } from '../geo/geo';
import { linkLabel, safeLink } from '../state/link';
import type { Waypoint } from '../state/route';
import { liftLabels, type LabelBox } from '../ui/labelLayout';

const UP = new Vector3(0, 1, 0);
const camDir = new Vector3();

interface PinsProps {
  waypoints: Waypoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 경유지 id → 라벨 DOM 요소 */
export type LabelEls = MutableRefObject<Map<string, HTMLDivElement>>;

function Pin({ w, selected, onSelect, hiddenRef }: { w: Waypoint; selected: boolean; onSelect: (id: string) => void; hiddenRef: MutableRefObject<string | null> }) {
  const pin = useRef<Group>(null);
  // 여행자가 이 도시에 머무는 동안에는 핀을 숨겨 숙소 모형이 보이게 한다
  // 카메라가 가까이 오면(머무는 동안) 핀이 화면을 덮지 않게 줄인다
  useFrame(({ camera }) => {
    if (!pin.current) return;
    pin.current.visible = hiddenRef.current !== w.id;
    pin.current.scale.setScalar(Math.min(1, Math.max(0.2, camera.position.distanceTo(pin.current.position) / 2.2)));
  });
  const pos = latLonToVector3(w, 1);
  const q = new Quaternion().setFromUnitVectors(UP, pos.clone().normalize());

  return (
    <group ref={pin} position={pos} quaternion={q}>
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

export function Pins({ waypoints, selectedId, onSelect, labels, hiddenRef }: PinsProps & { labels: LabelEls; hiddenRef: MutableRefObject<string | null> }) {
  return (
    <>
      {waypoints.map((w) => (
        <Pin key={w.id} w={w} selected={w.id === selectedId} onSelect={onSelect} hiddenRef={hiddenRef} />
      ))}
      <PinLabelProjector waypoints={waypoints} selectedId={selectedId} labels={labels} hiddenRef={hiddenRef} />
    </>
  );
}

const anchor = new Vector3();

/**
 * 핀 머리 위(반지름 1.1)를 화면 좌표로 옮기고, 카메라에서 본 면 방향으로 투명도를 정한다.
 * 가까운 도시끼리 라벨이 겹치면 고른 것·앞 번호를 제자리에 두고 나머지를 위로 띄워 세로줄로 잇는다(labelLayout.ts).
 */
function PinLabelProjector({ waypoints, selectedId, labels, hiddenRef }: { waypoints: Waypoint[]; selectedId: string | null; labels: LabelEls; hiddenRef: MutableRefObject<string | null> }) {
  useFrame(({ camera, size }) => {
    camDir.copy(camera.position).normalize();
    const shown: { el: HTMLDivElement; box: LabelBox }[] = [];
    waypoints.forEach((w, i) => {
      const el = labels.current.get(w.id);
      if (!el) return;
      anchor.copy(latLonToVector3(w, 1.1));
      // 지구 가장자리(0) 근처부터 흐려지고 뒤편(음수)에선 숨긴다
      const facing = anchor.clone().normalize().dot(camDir);
      // 여행자가 머무는 도시의 라벨은 숙소 모형을 가리지 않게 숨긴다
      const opacity = w.id === hiddenRef.current ? 0 : Math.min(1, Math.max(0, (facing - 0.05) / 0.2));
      anchor.project(camera);
      el.style.opacity = String(opacity);
      el.style.visibility = opacity === 0 ? 'hidden' : 'visible';
      if (opacity === 0) return;
      const x = ((anchor.x + 1) / 2) * size.width;
      const y = ((1 - anchor.y) / 2) * size.height;
      // 흐려지는 가장자리 라벨은 뒤로 미룬다
      shown.push({ el, box: { x, y, w: el.offsetWidth, h: el.offsetHeight, priority: (w.id === selectedId ? 0 : 1) + (opacity < 1 ? 2 : 0) + i / 1000 } });
    });
    const lifts = liftLabels(shown.map((s) => s.box));
    shown.forEach(({ el, box }, k) => {
      el.style.transform = `translate(${box.x.toFixed(1)}px, ${(box.y - lifts[k]).toFixed(1)}px) translate(-50%, -100%)`;
      el.style.setProperty('--lift', `${lifts[k].toFixed(1)}px`);
      el.classList.toggle('is-lifted', lifts[k] > 0);
    });
  });
  return null;
}

/** 라벨 안의 링크. 라벨 층은 클릭을 통과시키지만 이 링크만 누를 수 있다 */
function PinLink({ href, name }: { href?: string; name: string }) {
  const link = safeLink(href);
  if (!link) return null;
  return (
    <a className="pin-link" href={link} target="_blank" rel="noopener noreferrer" aria-label={`${name} ${linkLabel(link)} 새 탭에서 열기`} title={linkLabel(link)}>
      ↗
    </a>
  );
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
          <PinLink href={w.link} name={w.name} />
        </div>
      ))}
    </div>
  );
}
