import { expect, test } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { LOCAL_NAME, restyle } from './mapStyle';

test('물·건물 색을 바꾸고, 라틴 이름 대신 한국어 우선 이름을 쓰고, 음영 래스터를 뺀다', () => {
  const style = {
    version: 8,
    sources: {},
    layers: [
      { id: 'natural_earth', type: 'raster', source: 'x' },
      { id: 'water', type: 'fill', source: 'x', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
      { id: 'label_city', type: 'symbol', source: 'x', 'source-layer': 'place', layout: { 'text-field': ['get', 'name:latin'] } },
      { id: 'road_motorway', type: 'line', source: 'x', 'source-layer': 'transportation', paint: { 'line-color': '#f00' } },
    ],
  } as unknown as StyleSpecification;
  const out = restyle(style);
  expect(out.layers.map((l) => l.id)).toEqual(['water', 'label_city', 'road_motorway']);
  expect((out.layers[0] as { paint: Record<string, unknown> }).paint['fill-color']).toBe('#7cc3c1');
  expect((out.layers[1] as { layout: Record<string, unknown> }).layout['text-field']).toEqual(LOCAL_NAME);
  expect((out.layers[2] as { paint: Record<string, unknown> }).paint['line-color']).toBe('#ffffff');
});

test('라벨 이름: 한국어 → 한글 원래 이름 → 영어 → 로마자 → 원래 이름', async () => {
  const { expression } = await import('@maplibre/maplibre-gl-style-spec');
  const parsed = expression.createExpression(LOCAL_NAME);
  if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
  const name = (properties: Record<string, string>) => parsed.value.evaluate({ zoom: 14 }, { type: 'Point', properties } as never);
  expect(name({ name: '東京', 'name:ko': '도쿄', 'name:en': 'Tokyo' })).toBe('도쿄');
  expect(name({ name: '竹橋ジャンクション', 'name:latin': 'Takebashi Junction' })).toBe('Takebashi Junction');
  expect(name({ name: 'Bassin de l’Arsenal', 'name:en': 'Arsenal Basin', 'name:latin': 'Bassin de l’Arsenal' })).toBe('Arsenal Basin');
  expect(name({ name: '세란병원', 'name:latin': 'seranbyeong-won' })).toBe('세란병원');
  expect(name({ name: '中之島' })).toBe('中之島');
});
