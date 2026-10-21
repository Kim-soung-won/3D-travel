import { describe, expect, it } from 'vitest';
import { ATTENTION_IDLE_MS, createAttention, easeMotion, isAttending } from './attention';

describe('사용자가 화면을 보는지', () => {
  it('막 열었거나 최근에 만졌으면 보는 중이고, 한동안 조작이 없으면 아니다', () => {
    const a = createAttention(0);
    expect(isAttending(a, 0)).toBe(true);
    expect(isAttending(a, ATTENTION_IDLE_MS + 1)).toBe(false);
  });

  it('포인터가 지구본 위에 있으면 오래 가만히 있어도 보는 중이다', () => {
    const a = { ...createAttention(0), hover: true };
    expect(isAttending(a, 60_000)).toBe(true);
  });

  it('움직임 줄이기 설정이면 늘 보는 중으로 친다', () => {
    const a = { ...createAttention(0), reducedMotion: true };
    expect(isAttending(a, 60_000)).toBe(true);
  });

  it('보면 1초 안에 완전히 멈추고, 다시 돌 때는 1초 남짓에 걸쳐 빨라진다', () => {
    let m = 1;
    for (let i = 0; i < 60; i++) m = easeMotion(m, true, 1 / 60);
    expect(m).toBe(0);
    for (let i = 0; i < 60; i++) m = easeMotion(m, false, 1 / 60);
    expect(m).toBeGreaterThan(0.9);
  });
});
