// Natural Earth 1:110m(world-atlas, 퍼블릭 도메인)으로 대륙 텍스처를 그리고, 좌표가 속한 나라를 찾는다.
import { geoContains, geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
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

/** 좌표가 속한 나라 이름. 바다면 null */
export function countryAt({ lat, lon }: LatLon): string | null {
  const hit = countries.features.find((f) => geoContains(f, [lon, lat]));
  if (!hit) return null;
  return KOREAN_NAMES[hit.properties.name] ?? hit.properties.name;
}
