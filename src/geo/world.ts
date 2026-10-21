// Natural Earth 1:110m(world-atlas, 퍼블릭 도메인)으로 대륙 텍스처를 그리고, 좌표가 속한 나라를 찾는다.
import { geoArea, geoCentroid, geoContains, geoDistance, geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countriesTopo from 'world-atlas/countries-110m.json';
import landTopo from 'world-atlas/land-110m.json';
import type { LatLon } from './geo';

const countriesTopology = countriesTopo as unknown as Topology;
const landTopology = landTopo as unknown as Topology;

const countries = feature(countriesTopology, countriesTopology.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
export const land = feature(landTopology, landTopology.objects.land) as Feature<Geometry>;
export const borders = mesh(countriesTopology, countriesTopology.objects.countries as never, (a, b) => a !== b);

export const PALETTE = {
  ocean: '#6fb8b6',
  oceanDeep: '#5aa5a6',
  land: '#cfe3a8',
  landShade: '#b6d48e',
  coast: '#2f4b4f',
  border: 'rgba(47, 75, 79, 0.35)',
  grid: 'rgba(255, 255, 255, 0.12)',
};

/** 등장방형 캔버스에 바다·대륙·국경을 그린다. 크기는 2:1 */
export function drawEarthTexture(width = 4096): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2]);
  const path = geoPath(projection, ctx);

  const sea = ctx.createLinearGradient(0, 0, 0, height);
  sea.addColorStop(0, PALETTE.oceanDeep);
  sea.addColorStop(0.5, PALETTE.ocean);
  sea.addColorStop(1, PALETTE.oceanDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = width / 2048;
  ctx.stroke();

  // 얕은 바다: 해안선을 두껍게 그려 대륙 둘레에 띠를 만든다
  ctx.beginPath();
  path(land);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = width / 160;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  path(land);
  ctx.fillStyle = PALETTE.land;
  ctx.fill();

  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = width / 2048;
  ctx.stroke();

  ctx.beginPath();
  path(land);
  ctx.strokeStyle = PALETTE.coast;
  ctx.lineWidth = width / 1200;
  ctx.stroke();
  return canvas;
}

const KOREAN_NAMES: Record<string, string> = {
  'South Korea': '대한민국', 'North Korea': '북한', Japan: '일본', China: '중국', Taiwan: '대만', Mongolia: '몽골',
  Vietnam: '베트남', Thailand: '태국', Philippines: '필리핀', Indonesia: '인도네시아', Malaysia: '말레이시아', India: '인도',
  Russia: '러시아', 'United States of America': '미국', Canada: '캐나다', Mexico: '멕시코', Brazil: '브라질', Argentina: '아르헨티나',
  Chile: '칠레', Peru: '페루', 'United Kingdom': '영국', France: '프랑스', Germany: '독일', Italy: '이탈리아', Spain: '스페인',
  Portugal: '포르투갈', Switzerland: '스위스', Austria: '오스트리아', Netherlands: '네덜란드', Norway: '노르웨이', Sweden: '스웨덴',
  Finland: '핀란드', Iceland: '아이슬란드', Greece: '그리스', Turkey: '튀르키예', Egypt: '이집트', Morocco: '모로코',
  'South Africa': '남아프리카공화국', Kenya: '케냐', Australia: '오스트레일리아', 'New Zealand': '뉴질랜드', Greenland: '그린란드',
};

/** 좌표가 속한 나라의 키(world-atlas 영어 이름). 바다면 null */
export function countryKeyAt({ lat, lon }: LatLon): string | null {
  return countries.features.find((f) => geoContains(f, [lon, lat]))?.properties.name ?? null;
}

/** 나라 키의 한국어 이름. 짧게 부르는 이름(중국, 미국)을 먼저 쓰고, 없으면 도시 데이터의 이름(fallback) */
export function countryName(key: string, fallback?: string): string {
  return KOREAN_NAMES[key] ?? fallback ?? key;
}

export function countryFeature(key: string): Feature<Polygon | MultiPolygon, { name: string }> | null {
  return countries.features.find((f) => f.properties.name === key) ?? null;
}

/** 카메라를 보낼 나라 중심과 반경(라디안, 중심에서 가장 먼 국경까지). 해외 영토에 끌려가지 않게 가장 넓은 땅덩이를 쓴다 */
export function countryCenter(key: string): (LatLon & { radius: number }) | null {
  const f = countryFeature(key);
  if (!f) return null;
  const parts: Polygon[] = f.geometry.type === 'Polygon' ? [f.geometry] : f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
  const main = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const c = geoCentroid(main);
  const radius = Math.max(...main.coordinates[0].map((p) => geoDistance(c, p as [number, number])));
  return { lat: c[1], lon: c[0], radius };
}

/** 고른 나라만 칠한 투명 텍스처(지구 텍스처와 같은 등장방형). 지구 위에 겹쳐 그린다 */
export function drawCountryOverlay(key: string, width = 2048): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const f = countryFeature(key);
  if (!f) return canvas;
  const ctx = canvas.getContext('2d')!;
  const path = geoPath(geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]), ctx);
  ctx.beginPath();
  path(f);
  ctx.fillStyle = 'rgba(242, 169, 59, 0.55)';
  ctx.fill();
  ctx.strokeStyle = '#b8421f';
  ctx.lineWidth = width / 1024;
  ctx.lineJoin = 'round';
  ctx.stroke();
  return canvas;
}
