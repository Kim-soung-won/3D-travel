// 사용자가 화면을 보고 있는지. 포인터가 지구본 위에 있거나 최근에 무언가를 만졌으면 "보는 중"으로 보고,
// 지구본 자동 회전·구름 흐름 같은 저절로 움직이는 장식을 멈춘다. 클릭하려는 곳이 움직이지 않게 하기 위해서다.
import { useThree } from '@react-three/fiber';
import { useEffect, type MutableRefObject } from 'react';

/** 마지막 조작 뒤 이만큼 지나야 다시 움직인다 */
export const ATTENTION_IDLE_MS = 4000;

export interface Attention {
  /** 포인터가 지구본(캔버스) 위에 있다 */
  hover: boolean;
  /** 마지막 조작 시각 (performance.now 기준). 처음 열 때도 조작으로 본다 */
  lastInput: number;
  /** 움직임 줄이기 설정이면 늘 멈춘다 */
  reducedMotion: boolean;
}

export const createAttention = (now: number): Attention => ({ hover: false, lastInput: now, reducedMotion: false });

export function isAttending(a: Attention, now: number): boolean {
  return a.reducedMotion || a.hover || now - a.lastInput < ATTENTION_IDLE_MS;
}

/** 저절로 움직이는 장식의 속도 배율(0~1). 보는 중이면 곧바로(약 0.3초) 멈추고, 다시 움직일 때는 1초 남짓에 걸쳐 천천히 돈다 */
export function easeMotion(current: number, attending: boolean, dt: number): number {
  if (attending) {
    const next = current * Math.pow(0.001, dt);
    return next < 0.01 ? 0 : next;
  }
  return current + (1 - current) * (1 - Math.pow(0.05, dt));
}

/** Canvas 안에서 한 번 부른다. 창 전체의 조작과 캔버스 위 포인터 위치를 ref에 적는다 */
export function AttentionTracker({ target }: { target: MutableRefObject<Attention> }) {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const a = target.current;
    const touch = () => (a.lastInput = performance.now());
    // 핀 라벨 같은 DOM 층이 캔버스를 덮고 있어 pointerenter 대신 좌표로 판단한다
    const move = (e: PointerEvent) => {
      touch();
      const r = canvas.getBoundingClientRect();
      a.hover = e.pointerType === 'mouse' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    const out = (e: MouseEvent) => {
      if (!e.relatedTarget) a.hover = false; // 포인터가 창 밖으로 나감
    };
    const blur = () => (a.hover = false);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => (a.reducedMotion = motion.matches);
    syncMotion();
    const opts = { passive: true } as const;
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerdown', move, opts);
    window.addEventListener('wheel', touch, opts);
    window.addEventListener('keydown', touch);
    window.addEventListener('mouseout', out);
    window.addEventListener('blur', blur);
    motion.addEventListener('change', syncMotion);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('wheel', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('mouseout', out);
      window.removeEventListener('blur', blur);
      motion.removeEventListener('change', syncMotion);
    };
  }, [canvas, target]);
  return null;
}
