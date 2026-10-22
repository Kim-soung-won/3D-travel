// OpenFreeMap "liberty" 스타일(OSM, 키 없음)을 지구본과 같은 그림체로 다시 칠하고, 한국어 이름을 우선 쓴다(없으면 로마자).
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const C = {
  ground: '#efe9d6',
  residential: '#e8e1cb',
  green: '#cfe3a8',
  wood: '#b9d58f',
  water: '#7cc3c1',
  sand: '#f1e4bd',
  building: '#e0d6bf',
  building3d: '#ece3cc',
  roadMajor: '#ffffff',
  roadMinor: '#fbf7ec',
  casing: '#b9ad92',
  rail: '#9d8fb8',
  label: '#1f3437',
  halo: '#fffaf0',
};

const firstChar = ['slice', ['coalesce', ['get', 'name'], ''], 0, 1];
/**
 * 라벨 이름: 한국어 이름 → (원래 이름이 한글이면) 원래 이름 → 영어 → 로마자 → 원래 이름.
 * 해외 지도의 가게·도로는 한국어 이름이 거의 없어(도쿄 가게 6%, 파리 1%) 현지 문자 대신 읽을 수 있는 로마자를 쓴다.
 * 국내는 한국어 이름 칸이 비어 있어도 원래 이름이 한글이라 그대로 둔다(서울 가게의 84%).
 */
export const LOCAL_NAME = [
  'coalesce',
  ['get', 'name:ko'],
  ['case', ['all', ['>=', firstChar, '가'], ['<=', firstChar, '힣']], ['get', 'name'], ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]],
];

function paint(layer: LayerSpecification, key: string, value: unknown) {
  (layer as { paint?: Record<string, unknown> }).paint = { ...(layer as { paint?: Record<string, unknown> }).paint, [key]: value };
}

export function restyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.filter((l) => l.id !== 'natural_earth'); // 음영 래스터는 그림체와 맞지 않아 뺀다
  for (const l of layers) {
    const id = l.id;
    if (l.type === 'background') paint(l, 'background-color', C.ground);
    else if (l.type === 'fill') {
      if (id === 'water') paint(l, 'fill-color', C.water);
      else if (id === 'park' || id === 'landcover_grass' || id === 'landuse_pitch') paint(l, 'fill-color', C.green);
      else if (id === 'landcover_wood') paint(l, 'fill-color', C.wood);
      else if (id === 'landuse_residential') paint(l, 'fill-color', C.residential);
      else if (id === 'landcover_sand') paint(l, 'fill-color', C.sand);
      else if (id === 'building') {
        paint(l, 'fill-color', C.building);
        paint(l, 'fill-outline-color', C.casing);
      }
    } else if (l.type === 'fill-extrusion' && id === 'building-3d') {
      paint(l, 'fill-extrusion-color', C.building3d);
      paint(l, 'fill-extrusion-opacity', 0.85);
    } else if (l.type === 'line') {
      if (id.startsWith('waterway')) paint(l, 'line-color', C.water);
      else if (id.includes('rail')) paint(l, 'line-color', C.rail);
      else if (id.endsWith('_casing')) paint(l, 'line-color', C.casing);
      else if (/(motorway|trunk_primary|secondary_tertiary)$/.test(id)) paint(l, 'line-color', C.roadMajor);
      else if (/(minor|street|link|service_track)$/.test(id)) paint(l, 'line-color', C.roadMinor);
    } else if (l.type === 'symbol') {
      const layout = (l as { layout?: Record<string, unknown> }).layout ?? {};
      if (JSON.stringify(layout['text-field'] ?? '').includes('name:latin')) layout['text-field'] = LOCAL_NAME;
      (l as { layout?: Record<string, unknown> }).layout = layout;
      if (layout['text-field']) {
        paint(l, 'text-color', C.label);
        paint(l, 'text-halo-color', C.halo);
        paint(l, 'text-halo-width', 1.4);
      }
    }
  }
  return { ...style, layers };
}

let cached: Promise<StyleSpecification> | null = null;
export function loadCityStyle(): Promise<StyleSpecification> {
  cached ??= fetch(STYLE_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`지도 스타일 HTTP ${r.status}`))))
    .then((s: StyleSpecification) => restyle(s))
    .catch((e) => {
      cached = null;
      throw e;
    });
  return cached;
}
