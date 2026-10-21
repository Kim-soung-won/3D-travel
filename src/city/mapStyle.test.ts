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
