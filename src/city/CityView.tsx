// 도시 화면: MapLibre로 실제 도로·건물을 그리고, 세부 경유지와 구간(버스·지하철·도보·자동차)을 올린다.
// 지구본 화면과 동시에 떠 있지 않는다. 이 파일은 처음 들어갈 때만 불러온다(lazy).
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl 6은 번들러에서 워커 주소를 스스로 찾지 못한다. Vite가 워커를 따로 묶은 주소를 알려 준다
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { cityDataAt } from '../data';
import type { CityData } from '../data/types';
import { distanceKm, type LatLon } from '../geo/geo';
import { MODES } from '../geo/modes';
import type { LegState } from '../hooks/useLegs';
import type { Stop } from '../state/route';
import { liftLabels } from '../ui/labelLayout';
import { MODE_ICON } from '../ui/modeIcons';
import { loadCityStyle } from './mapStyle';
import { linkLabel, safeLink } from '../state/link';

maplibregl.setWorkerUrl(workerUrl);

interface CityViewProps {
  center: LatLon;
  stops: Stop[];
  legs: LegState[];
  selectedId: string | null;
  playing: boolean;
  onPick: (p: LatLon) => void;
  onSelect: (id: string) => void;
  onReady: () => void;
  onError: (message: string) => void;
  onProgress: (t: number) => void;
  /** 재생 중 지금 달리는 구간 번호. 구간이 바뀔 때만 부른다 */
  onLeg: (i: number) => void;
  onPlayDone: () => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function legsToGeoJSON(legs: LegState[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: legs.map((leg) => ({
      type: 'Feature',
      properties: { mode: leg.mode, color: MODES[leg.mode].color, style: leg.kind === 'fallback' ? 'fallback' : leg.mode },
      geometry: { type: 'LineString', coordinates: leg.coords },
    })),
  };
}

/** 사전 데이터의 지하철 노선과 역 (참고용으로 옅게 깐다) */
function transitToGeoJSON(city: CityData): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const line of city.lines) {
    const coords = line.stations.map((s) => [s.lon, s.lat]);
    if (line.loop) coords.push(coords[0]);
    features.push({ type: 'Feature', properties: { color: line.color, name: line.name }, geometry: { type: 'LineString', coordinates: coords } });
    for (const s of line.stations)
      features.push({ type: 'Feature', properties: { color: line.color, name: s.name }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } });
  }
  return { type: 'FeatureCollection', features };
}

/** 구간 좌표를 따라 0..1 위치의 [경도, 위도] */
function along(coords: [number, number][], t: number): [number, number] {
  if (coords.length < 2) return coords[0];
  const seg: number[] = [0];
  for (let i = 1; i < coords.length; i++)
    seg.push(seg[i - 1] + distanceKm({ lon: coords[i - 1][0], lat: coords[i - 1][1] }, { lon: coords[i][0], lat: coords[i][1] }));
  const target = Math.min(1, Math.max(0, t)) * seg[seg.length - 1];
  let i = 1;
  while (i < seg.length - 1 && seg[i] < target) i++;
  const k = (target - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
  return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * k, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * k];
}

export default function CityView(props: CityViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const vehicle = useRef<maplibregl.Marker | null>(null);
  const latest = useRef(props);
  // 스타일을 비동기로 불러온 뒤에 지도가 생기므로, 마커·구간 effect는 load 뒤에 다시 돌아야 한다
  const [loaded, setLoaded] = useState(false);
  latest.current = props;

  // 지도 만들기 (한 번)
  useEffect(() => {
    let disposed = false;
    loadCityStyle()
      .then((style) => {
        if (disposed || !container.current) return;
        const m = new maplibregl.Map({
          container: container.current,
          style,
          center: [props.center.lon, props.center.lat],
          zoom: 12.5,
          pitch: 45,
          bearing: -12,
          attributionControl: { compact: true },
        });
        map.current = m;
        m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        m.on('load', () => {
          const data = cityDataAt(latest.current.center);
          if (data) {
            m.addSource('transit', { type: 'geojson', data: transitToGeoJSON(data) });
            m.addLayer({ id: 'transit-lines', type: 'line', source: 'transit', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.45 } });
            m.addLayer({
              id: 'transit-stations',
              type: 'circle',
              source: 'transit',
              minzoom: 12.5,
              filter: ['==', ['geometry-type'], 'Point'],
              paint: { 'circle-radius': 3, 'circle-color': '#fff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-opacity': 0.8 },
            });
          }
          m.addSource('legs', { type: 'geojson', data: legsToGeoJSON(latest.current.legs) });
          m.addLayer({ id: 'legs-casing', type: 'line', source: 'legs', paint: { 'line-color': '#2f4b4f', 'line-width': 8, 'line-opacity': 0.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
          const styles: [string, number[] | null][] = [['bus', null], ['car', null], ['subway', [2, 1.2]], ['walk', [0.2, 1.6]], ['fallback', [1, 1]]];
          for (const [key, dash] of styles)
            m.addLayer({
              id: `legs-${key}`,
              type: 'line',
              source: 'legs',
              filter: ['==', ['get', 'style'], key],
              paint: { 'line-color': ['get', 'color'], 'line-width': 4.5, ...(dash ? { 'line-dasharray': dash } : {}) },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
          setLoaded(true);
          m.once('idle', () => latest.current.onReady());
        });
        m.on('click', (e) => latest.current.onPick({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
        m.on('error', (e) => {
          // 타일 하나가 실패해도 지도는 쓸 수 있으니, 스타일을 못 불러온 경우만 알린다
          if (!m.isStyleLoaded()) latest.current.onError(`지도를 불러오지 못했습니다 (${e.error?.message ?? '알 수 없는 오류'})`);
        });
      })
      .catch((e: Error) => props.onError(`지도 스타일을 불러오지 못했습니다: ${e.message}`));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // 지도는 화면에 들어올 때 한 번만 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 구간 선 갱신
  useEffect(() => {
    const src = map.current?.getSource('legs') as GeoJSONSource | undefined;
    src?.setData(props.legs.length ? legsToGeoJSON(props.legs) : EMPTY);
  }, [props.legs, loaded]);

  // 경유지 마커 갱신
  useEffect(() => {
    const m = map.current;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    if (!m || !loaded) return;
    props.stops.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'city-pin-wrap';
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = `city-pin${s.id === props.selectedId ? ' is-selected' : ''}`;
      pin.setAttribute('aria-label', `${i + 1}번 세부 경유지 ${s.name}`);
      pin.innerHTML = `<span class="pin-num">${i + 1}</span><span class="city-pin-name"></span>`;
      (pin.querySelector('.city-pin-name') as HTMLElement).textContent = s.name;
      pin.addEventListener('click', (ev) => {
        ev.stopPropagation();
        latest.current.onSelect(s.id);
      });
      el.append(pin);
      // 사용자가 붙인 링크는 마커 옆 작은 단추로 연다 (button 안에 a를 넣을 수 없다)
      const link = safeLink(s.link);
      if (link) {
        const a = document.createElement('a');
        a.className = 'pin-link';
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '↗';
        a.title = linkLabel(link);
        a.setAttribute('aria-label', `${s.name} ${linkLabel(link)} 새 탭에서 열기`);
        a.addEventListener('click', (ev) => ev.stopPropagation());
        el.append(a);
      }
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lon, s.lat]).addTo(m));
    });
    // 가까운 마커끼리 겹치면 고른 것·앞 번호를 제자리에 두고 나머지를 위로 띄운다. 가려진 링크 단추도 누를 수 있게 된다
    const selected = props.selectedId;
    const stops = props.stops;
    const relayout = () => {
      const boxes = markers.current.map((mk, i) => {
        const p = m.project([stops[i].lon, stops[i].lat]);
        const el = mk.getElement();
        return { x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight, priority: (stops[i].id === selected ? 0 : 1) + i / 1000 };
      });
      liftLabels(boxes).forEach((lift, i) => {
        const mk = markers.current[i];
        mk.setOffset([0, -lift]);
        mk.getElement().style.setProperty('--lift', `${lift.toFixed(1)}px`);
        mk.getElement().classList.toggle('is-lifted', lift > 0);
      });
    };
    relayout();
    m.on('move', relayout);
    return () => {
      m.off('move', relayout);
    };
  }, [props.stops, props.selectedId, loaded]);

  // 목록이 통째로 바뀌면(추천 루트·되돌리기 등 두 곳 이상 달라짐) 전체가 보이게 맞춘다. 한 곳 추가는 그대로 둔다
  const shownIds = useRef<string[] | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    const ids = props.stops.map((s) => s.id);
    const prev = shownIds.current;
    shownIds.current = ids;
    const changed = prev === null ? ids.length : ids.filter((id) => !prev.includes(id)).length + prev.filter((id) => !ids.includes(id)).length;
    if (changed < 2 || props.stops.length < 2 || props.playing) return;
    const lons = props.stops.map((s) => s.lon);
    const lats = props.stops.map((s) => s.lat);
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 15, duration: prev === null ? 0 : 800 });
  }, [props.stops, props.playing, loaded]);

  // 고른 경유지로 이동
  useEffect(() => {
    const s = props.stops.find((x) => x.id === props.selectedId);
    if (s && map.current && !props.playing) map.current.easeTo({ center: [s.lon, s.lat], duration: 600 });
    // 고른 경유지가 바뀔 때만 움직인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId]);

  // 재생: 구간마다 수단 아이콘이 도로를 따라 움직이고 지도가 따라간다
  useEffect(() => {
    const m = map.current;
    if (!props.playing || !m || !props.legs.length) return;
    const legs = props.legs;
    const durations = legs.map((l) => Math.min(9, Math.max(3, l.durationS / 240))); // 실제 4분 ≈ 1초, 구간당 3~9초
    const total = durations.reduce((a, b) => a + b, 0);
    const el = document.createElement('div');
    el.className = 'city-vehicle';
    vehicle.current = new maplibregl.Marker({ element: el }).setLngLat(legs[0].coords[0]).addTo(m);
    let start: number | null = null;
    let frame = 0;
    let shownMode = '';
    let shownLeg = -1;
    const tick = (now: number) => {
      start ??= now;
      const t = (now - start) / 1000;
      if (t >= total) {
        latest.current.onProgress(1);
        latest.current.onPlayDone();
        return;
      }
      let i = 0;
      let acc = 0;
      while (i < durations.length - 1 && t >= acc + durations[i]) acc += durations[i++];
      const pos = along(legs[i].coords, (t - acc) / durations[i]);
      if (i !== shownLeg) {
        shownLeg = i;
        latest.current.onLeg(i);
      }
      if (shownMode !== legs[i].mode) {
        shownMode = legs[i].mode;
        el.style.setProperty('--mode-color', MODES[legs[i].mode].color);
        el.innerHTML = `${MODE_ICON[legs[i].mode]}<span>${MODES[legs[i].mode].label}</span>`;
      }
      vehicle.current?.setLngLat(pos);
      m.jumpTo({ center: pos });
      latest.current.onProgress(t / total);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      vehicle.current?.remove();
      vehicle.current = null;
    };
  }, [props.playing, props.legs]);

  return (
    <div className="city-map">
      <div ref={container} className="city-map-canvas" />
    </div>
  );
}
