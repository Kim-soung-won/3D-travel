import { describe, expect, it } from 'vitest';
import { loadTzLookup, safeZone } from './timezone';

describe('시간대 찾기', () => {
  it('도시 좌표로 현지 시간대를 찾는다', async () => {
    const tz = await loadTzLookup();
    expect(tz(37.57, 126.98)).toBe('Asia/Seoul');
    expect(tz(37.77, -122.42)).toBe('America/Los_Angeles');
    expect(tz(48.86, 2.35)).toBe('Europe/Paris');
  });
  it('모르는 이름이면 경도로 어림한다 (Etc/GMT는 부호가 반대)', () => {
    expect(safeZone('Asia/Seoul', 127)).toBe('Asia/Seoul');
    expect(safeZone('Not/AZone', 127)).toBe('Etc/GMT-8');
    expect(safeZone(undefined, -40)).toBe('Etc/GMT+3');
  });
});
