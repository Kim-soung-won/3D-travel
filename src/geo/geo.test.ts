import { describe, expect, test } from 'vitest';
import { distanceKm, formatKm, formatLatLon, greatCircleArc, latLonToVector3, samplePath, vector3ToLatLon } from './geo';
import { TRAIN_MAX_SEA_KM, trainBlockReason } from './routing';
import { longestSeaKm } from './world';

const SEOUL = { lat: 37.5665, lon: 126.978 };
const NEW_YORK = { lat: 40.7128, lon: -74.006 };

describe('좌표 변환', () => {
  test('위경도 → 3D → 위경도가 제자리로 돌아온다', () => {
    for (const p of [SEOUL, NEW_YORK, { lat: -33.87, lon: 151.21 }, { lat: 0, lon: 0 }, { lat: 0, lon: 179.9 }]) {
      const back = vector3ToLatLon(latLonToVector3(p, 2));
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lon).toBeCloseTo(p.lon, 6);
    }
  });

  test('북극은 +y, 경도 0·위도 0은 텍스처 가운데(+x)', () => {
    expect(latLonToVector3({ lat: 90, lon: 0 }).y).toBeCloseTo(1);
    const v = latLonToVector3({ lat: 0, lon: 0 });
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });
});

describe('거리', () => {
  test('서울–뉴욕은 약 11,000 km', () => {
    expect(distanceKm(SEOUL, NEW_YORK)).toBeGreaterThan(10_900);
    expect(distanceKm(SEOUL, NEW_YORK)).toBeLessThan(11_200);
  });
  test('같은 지점은 0', () => {
    expect(distanceKm(SEOUL, SEOUL)).toBe(0);
  });
  test('표기', () => {
    expect(formatKm(11034.6)).toBe('11,035 km');
    expect(formatLatLon(NEW_YORK)).toBe('40.71°N 74.01°W');
  });
});

describe('대권 곡선', () => {
  test('양 끝은 두 지점 위에 있고, 가운데는 지표보다 높다', () => {
    const arc = greatCircleArc(SEOUL, NEW_YORK, 1, 32);
    expect(arc).toHaveLength(33);
    const start = vector3ToLatLon(arc[0]);
    const end = vector3ToLatLon(arc[32]);
    expect(start.lat).toBeCloseTo(SEOUL.lat, 4);
    expect(end.lon).toBeCloseTo(NEW_YORK.lon, 4);
    expect(arc[0].length()).toBeCloseTo(1);
    expect(arc[16].length()).toBeGreaterThan(1.1);
  });
  test('서울–뉴욕 대권은 북쪽(위도 60° 이상)으로 돌아간다', () => {
    const maxLat = Math.max(...greatCircleArc(SEOUL, NEW_YORK).map((p) => vector3ToLatLon(p).lat));
    expect(maxLat).toBeGreaterThan(60);
  });
  test('같은 지점이면 곡선이 퍼지지 않는다', () => {
    const arc = greatCircleArc(SEOUL, SEOUL, 1, 4);
    expect(arc.every((p) => Number.isFinite(p.x))).toBe(true);
  });
  test('경로를 따라 점을 고른다', () => {
    const arc = greatCircleArc(SEOUL, NEW_YORK, 1, 32);
    expect(samplePath(arc, 0).position.distanceTo(arc[0])).toBeCloseTo(0);
    expect(samplePath(arc, 1).position.distanceTo(arc[32])).toBeCloseTo(0);
  });
});

describe('기차로 갈 수 있는 구간 (바다 건너기)', () => {
  const BUSAN = { lat: 35.1796, lon: 129.0756 };
  const TOKYO = { lat: 35.6812, lon: 139.7671 };
  const JEJU = { lat: 33.4996, lon: 126.5312 };
  const HIROSHIMA = { lat: 34.3853, lon: 132.4553 };
  const FUKUOKA = { lat: 33.5902, lon: 130.4017 };
  const LONDON = { lat: 51.5074, lon: -0.1278 };
  const PARIS = { lat: 48.8566, lon: 2.3522 };

  test('가장 긴 바다 구간: 서울–부산은 땅, 서울–도쿄는 대한해협과 동해를 건넌다', () => {
    expect(longestSeaKm(SEOUL, BUSAN)).toBeLessThan(20);
    expect(longestSeaKm(SEOUL, TOKYO)).toBeGreaterThan(300);
    // 간몬 해협(혼슈–규슈)은 1km 남짓이다. 해안선이 거칠어 조금 길게 잡혀도 짧아야 한다
    expect(longestSeaKm(HIROSHIMA, FUKUOKA)).toBeLessThan(TRAIN_MAX_SEA_KM);
  });

  test('바다를 길게 건너면 기차를 막고, 사전 데이터에 기차 시간이 있는 구간(유로스타)은 통과시킨다', () => {
    expect(trainBlockReason(SEOUL, BUSAN)).toBeNull();
    expect(trainBlockReason(SEOUL, TOKYO)).toMatch(/바다를 약 \d+km 건너는 구간/);
    expect(trainBlockReason(SEOUL, JEJU)).not.toBeNull();
    // 런던–파리 직선은 영국 해협을 약 90km 건너지만, 실제로는 해저 터널로 기차가 다닌다
    expect(longestSeaKm(LONDON, PARIS)).toBeGreaterThan(TRAIN_MAX_SEA_KM);
    expect(trainBlockReason(LONDON, PARIS)).toBeNull();
  });
});
