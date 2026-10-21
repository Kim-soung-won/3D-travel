// 위경도 ↔ 3D 좌표, 거리, 대권(great circle) 경로 계산.
// 좌표계는 three.js SphereGeometry의 UV와 맞춘다: 등장방형(equirectangular) 텍스처의 왼쪽 끝이 경도 −180°.
import { Vector3 } from 'three';

export const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export function latLonToVector3({ lat, lon }: LatLon, radius = 1, target = new Vector3()): Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return target.set(-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
}

export function vector3ToLatLon(v: Vector3): LatLon {
  const r = v.length();
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, v.y / r))) / DEG;
  let lon = Math.atan2(v.z, -v.x) / DEG - 180;
  if (lon < -180) lon += 360;
  if (lon >= 180) lon -= 360;
  return { lat, lon };
}

/** 두 지점 사이 대권 거리(km). 하버사인 공식 */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 지구 표면 위로 떠오른 대권 곡선의 점들.
 * 구면 선형 보간(slerp)으로 대권을 따라가고, 거리에 비례해 가운데가 높게 솟는다.
 */
export function greatCircleArc(a: LatLon, b: LatLon, radius = 1, segments = 64): Vector3[] {
  const va = latLonToVector3(a, 1);
  const vb = latLonToVector3(b, 1);
  const angle = va.angleTo(vb);
  const lift = Math.min(0.35, 0.05 + angle * 0.12);
  const sinAngle = Math.sin(angle);
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p =
      angle < 1e-6
        ? va.clone()
        : va
            .clone()
            .multiplyScalar(Math.sin((1 - t) * angle) / sinAngle)
            .add(vb.clone().multiplyScalar(Math.sin(t * angle) / sinAngle));
    points.push(p.normalize().multiplyScalar(radius * (1 + lift * Math.sin(Math.PI * t))));
  }
  return points;
}

/** 점 배열을 따라 0..1 위치의 점과 진행 방향을 구한다 */
export function samplePath(points: Vector3[], t: number): { position: Vector3; direction: Vector3 } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths[lengths.length - 1];
  const target = Math.min(1, Math.max(0, t)) * total;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < target) i++;
  const segment = lengths[i] - lengths[i - 1] || 1;
  const local = (target - lengths[i - 1]) / segment;
  const position = points[i - 1].clone().lerp(points[i], local);
  const direction = points[i].clone().sub(points[i - 1]).normalize();
  return { position, direction };
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('ko-KR')} km`;
}

export function formatLatLon({ lat, lon }: LatLon): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}
