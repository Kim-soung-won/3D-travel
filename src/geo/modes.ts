// 이동 수단. 경로를 어떻게 그리고 시간을 어떻게 어림하는지가 수단마다 다르다.
export type Mode = 'plane' | 'train' | 'bus' | 'car' | 'subway' | 'walk';

export interface ModeInfo {
  label: string;
  /** 경로선 색 */
  color: string;
  /** 점선 모양 [선, 틈] (픽셀 기준). 실선이면 null */
  dash: [number, number] | null;
  /** 실제 도로를 따라가는가 (OSRM 프로필) */
  road: 'car' | 'foot' | null;
  /** 시간 어림: 도로 경로 시간에 곱하는 배수, 또는 직선 거리 기준 평균 속도(km/h) */
  timeFactor?: number;
  speedKmh?: number;
  /** 시간 어림이 실제 값이 아니라 추정인가 */
  estimated: boolean;
}

export const MODES: Record<Mode, ModeInfo> = {
  plane: { label: '비행기', color: '#fff6dd', dash: [6, 4], road: null, speedKmh: 800, estimated: true },
  // 기차: 철도 경로 서버가 없어 지표 직선으로 그린다. 시간은 사전 데이터(KTX 등)가 있으면 그 값, 없으면 직선 거리와 평균 속도
  train: { label: '기차', color: '#3f7cc4', dash: [10, 3], road: null, speedKmh: 90, estimated: true },
  bus: { label: '버스', color: '#e4572e', dash: null, road: 'car', timeFactor: 1.5, estimated: true },
  car: { label: '자동차', color: '#f2a93b', dash: null, road: 'car', timeFactor: 1, estimated: false },
  subway: { label: '지하철', color: '#7b5ea7', dash: [8, 5], road: null, speedKmh: 32, estimated: true },
  walk: { label: '도보', color: '#2e8b57', dash: [2, 4], road: 'foot', timeFactor: 1, estimated: false },
};

export const GLOBE_MODES: Mode[] = ['plane', 'train', 'bus', 'car', 'subway', 'walk'];
export const CITY_MODES: Mode[] = ['walk', 'bus', 'subway', 'car'];

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${Math.max(1, m)}분`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
}
