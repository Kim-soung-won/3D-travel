// 이미지 카드: 지구본(정사영 2D) + 일정표를 한 장의 PNG로 그린다. 메신저·SNS에 바로 올릴 용도(1080×1350, 4:5).
// WebGL 화면을 캡처하지 않고 다시 그려서, 화면 상태(카메라 각도·재생 중)와 무관하게 늘 같은 모양이 나온다.
import { geoCentroid, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { distanceKm, formatKm } from '../geo/geo';
import { MODES } from '../geo/modes';
import { borders, land, PALETTE } from '../geo/world';
import { cityDays, formatDayRange, formatTrip, nightsOf, totalNights } from '../state/itinerary';
import type { Waypoint } from '../state/route';

export const CARD = { width: 1080, height: 1350 };
const FONT = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif";
const INK = '#1f3437';
const INK_2 = '#4b6266';
const BG = '#f7f3ea';

/** 카드 파일 이름: "여행-11박12일.png" */
export function cardFileName(waypoints: Waypoint[]): string {
  return `여행-${formatTrip(totalNights(waypoints)).replace(/\s/g, '')}.png`;
}

export function drawTripCard(waypoints: Waypoint[]): HTMLCanvasElement {
  const { width, height } = CARD;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // 머리: 제목과 전체 일정
  const km = waypoints.slice(1).reduce((a, w, i) => a + distanceKm(waypoints[i], w), 0);
  ctx.fillStyle = INK;
  ctx.font = `800 56px ${FONT}`;
  ctx.fillText(formatTrip(totalNights(waypoints)), 72, 120);
  ctx.font = `500 30px ${FONT}`;
  ctx.fillStyle = INK_2;
  ctx.fillText(`도시 ${waypoints.length}곳 · 직선 거리 ${formatKm(km)}`, 72, 170);

  // 지구본: 경로의 중심을 바라보는 정사영
  const R = 330;
  const cx = width / 2;
  const cy = 210 + R + 20;
  const line: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: waypoints.map((w) => [w.lon, w.lat]) },
  };
  const center: [number, number] =
    waypoints.length > 1 ? geoCentroid(line) : waypoints.length ? [waypoints[0].lon, waypoints[0].lat] : [127, 37];
  const proj = geoOrthographic().scale(R).translate([cx, cy]).rotate([-center[0], -center[1]]).clipAngle(90);
  const path = geoPath(proj, ctx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy + 10, R, 0, Math.PI * 2);
  ctx.fillStyle = '#2f4b4f';
  ctx.fill(); // 아래로 살짝 밀린 그림자 테두리
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = PALETTE.ocean;
  ctx.fill();
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  path(land);
  ctx.fillStyle = PALETTE.land;
  ctx.fill();
  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  path(land);
  ctx.strokeStyle = PALETTE.coast;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 구간: 수단 색, 비행기는 점선. 대권으로 그려지고 지구 뒤편은 잘린다
  waypoints.slice(1).forEach((b, i) => {
    const a = waypoints[i];
    const seg = { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } as GeoJSON.LineString;
    ctx.beginPath();
    path(seg);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#2f4b4f';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    path(seg);
    ctx.setLineDash(a.mode === 'plane' ? [14, 10] : []);
    ctx.strokeStyle = MODES[a.mode].color;
    ctx.lineWidth = 5;
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // 핀: 보이는 쪽에 있는 도시만
  waypoints.forEach((w, i) => {
    if (geoDistance([w.lon, w.lat], center) > Math.PI / 2 - 0.02) return;
    const p = proj([w.lon, w.lat]);
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 20, 0, Math.PI * 2);
    ctx.fillStyle = '#e4572e';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2f4b4f';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `800 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p[0], p[1] + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
  ctx.restore();

  // 일정표: 넘치면 마지막 줄을 "외 n곳"으로
  const days = cityDays(waypoints);
  const top = cy + R + 70;
  const rowH = 46;
  const maxRows = Math.floor((height - 90 - top) / rowH);
  const rows = waypoints.length > maxRows ? maxRows - 1 : waypoints.length;
  for (let i = 0; i < rows; i++) {
    const w = waypoints[i];
    const y = top + i * rowH;
    ctx.fillStyle = '#e4572e';
    ctx.beginPath();
    ctx.arc(90, y - 10, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 90, y - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(fit(ctx, w.name, 520), 124, y);
    ctx.fillStyle = INK_2;
    ctx.font = `500 26px ${FONT}`;
    const n = nightsOf(w);
    const next = waypoints[i + 1] ? ` · 다음 ${MODES[w.mode].label}` : '';
    ctx.textAlign = 'right';
    ctx.fillText(`${n ? `${n}박` : '당일'} · ${formatDayRange(days[i])}${next}`, width - 72, y);
    ctx.textAlign = 'left';
  }
  if (rows < waypoints.length) {
    ctx.fillStyle = INK_2;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(`외 ${waypoints.length - rows}곳`, 124, top + rows * rowH);
  }

  ctx.fillStyle = '#5f7478';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('여행 지구본으로 만든 일정', 72, height - 48);
  return canvas;
}

/** 폭을 넘으면 말줄임 */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다'))), 'image/png'));
}
