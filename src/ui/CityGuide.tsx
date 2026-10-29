// 도시 화면의 찾기·추천: 사전 데이터(명소·추천 루트)에서 고르고, 경유지 순서를 최적화한다.
// AI를 실시간으로 부르지 않는다. 데이터는 LLM이 미리 만든 것이라 출처 안내를 함께 보인다.
import { useMemo, useState, type Dispatch } from 'react';
import { DATA_NOTICE } from '../data';
import type { CityData, Place, PlaceCategory } from '../data/types';
import { distanceKm, formatKm } from '../geo/geo';
import type { Mode } from '../geo/modes';
import { optimizeOrder, pathKm } from '../geo/optimize';
import { newId, type RouteAction, type Stop, type Waypoint } from '../state/route';
import { cityDayCount, stopDay } from '../state/schedule';

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  sight: '명소',
  culture: '문화',
  food: '먹거리',
  shopping: '쇼핑',
  nature: '자연',
  night: '야경',
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 이름·검색어·소개·분류에서 찾는다. 이름이 맞으면 앞에 둔다 */
export function searchPlaces(places: Place[], query: string): Place[] {
  const q = norm(query);
  if (!q) return [];
  const score = (p: Place) =>
    norm(p.name).includes(q) ? 0 : p.tags.some((t) => norm(t).includes(q)) || norm(CATEGORY_LABEL[p.category]).includes(q) ? 1 : norm(p.summary).includes(q) ? 2 : 3;
  return places
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 3)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.p);
}

/** 다음 지점까지 수단 어림: 가까우면 도보, 노선 데이터가 있으면 지하철, 없으면 버스 */
export function suggestMode(a: { lat: number; lon: number }, b: { lat: number; lon: number }, hasTransit: boolean): Mode {
  if (distanceKm(a, b) <= 1.2) return 'walk';
  return hasTransit ? 'subway' : 'bus';
}

const placeStop = (p: Place, mode: Mode): Stop => ({ id: newId(), name: p.name, lat: p.lat, lon: p.lon, area: CATEGORY_LABEL[p.category], mode });

interface Props {
  city: Waypoint;
  /** 불러오는 중이면 undefined, 데이터가 없는 도시면 null */
  data: CityData | null | undefined;
  dispatch: Dispatch<RouteAction>;
  onSelect: (id: string) => void;
}

export function CityGuide({ city, data, dispatch, onSelect }: Props) {
  const [query, setQuery] = useState('');
  // 이미 가장 짧은 순서일 때 보일 안내. 그때의 경유지 배열을 기억해 두고, 경유지가 바뀌면 저절로 사라진다
  const [shortestFor, setShortestFor] = useState<Stop[] | null>(null);
  const results = useMemo(() => (data ? searchPlaces(data.places, query).slice(0, 6) : []), [data, query]);

  if (data === undefined) return <p className="guide-none">명소·추천 루트를 불러오는 중…</p>;
  if (!data)
    return <p className="guide-none">이 도시는 사전 데이터가 없어 검색·추천을 쓸 수 없습니다. 지도를 클릭해 추가하세요.</p>;

  const hasTransit = data.lines.length > 0;

  const addPlace = (p: Place) => {
    const last = city.stops.at(-1);
    // 새 지점이 생기면 직전 지점의 "다음 구간" 수단을 거리에 맞춰 정한다
    if (last) dispatch({ type: 'updateStop', parentId: city.id, id: last.id, patch: { mode: suggestMode(last, p, hasTransit) } });
    const stop = placeStop(p, 'walk');
    dispatch({ type: 'addStop', parentId: city.id, stop });
    onSelect(stop.id);
    setQuery('');
  };

  const loadRoute = (routeId: string) => {
    const r = data.routes.find((x) => x.id === routeId);
    if (!r) return;
    const byId = new Map(data.places.map((p) => [p.id, p]));
    const stops = r.placeIds.flatMap((id, i) => {
      const p = byId.get(id);
      return p ? [placeStop(p, r.modes[i] ?? 'walk')] : [];
    });
    dispatch({ type: 'setStops', parentId: city.id, stops, label: `추천 루트 "${r.title}"를 불러옴` });
  };

  const optimize = () => {
    const before = pathKm(city.stops);
    // 여러 날이면 날마다 따로 다듬는다 (각 날의 첫 장소는 그대로)
    const count = cityDayCount(city);
    const order = Array.from({ length: count }, (_, k) => optimizeOrder(city.stops.filter((s) => stopDay(s, count) === k + 1))).flat();
    // 구간 수단은 새 이웃 사이 거리로 다시 어림한다 (마지막 지점의 수단은 쓰이지 않는다)
    const stops = order.map((s, i) => (order[i + 1] ? { ...s, mode: suggestMode(s, order[i + 1], hasTransit) } : s));
    const after = pathKm(stops);
    const same = stops.every((s, i) => s.id === city.stops[i].id);
    if (same) {
      // 아무것도 바뀌지 않으면 되돌릴 것도 없으니 안내만 한다. 수단만 바뀌었으면 되돌릴 수 있게 둔다
      if (stops.every((s, i) => s.mode === city.stops[i].mode)) setShortestFor(city.stops);
      else dispatch({ type: 'setStops', parentId: city.id, stops, label: '순서는 이미 가장 짧아, 구간 수단만 거리에 맞춰 다시 정함' });
      return;
    }
    dispatch({ type: 'setStops', parentId: city.id, stops, label: `순서를 바꿈: 직선 거리 ${formatKm(before)} → ${formatKm(after)}` });
  };

  return (
    <section className="guide" aria-label="찾기와 추천">
      <label className="guide-search">
        <span className="sr-only">장소 검색</span>
        <input
          type="search"
          value={query}
          placeholder="장소·분류 검색 (예: 야경, 시장, 궁)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) addPlace(results[0]);
          }}
        />
      </label>
      {query && (
        <ul className="guide-results">
          {results.length === 0 && <li className="guide-empty">"{query}"에 맞는 장소가 없습니다.</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => addPlace(p)}>
                <span className="guide-name">{p.name}</span>
                <span className="guide-cat">{CATEGORY_LABEL[p.category]}</span>
                <span className="guide-summary">{p.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!query && (
        <details className="guide-routes" open={city.stops.length === 0}>
          <summary>추천 루트 {data.routes.length}개</summary>
          <ul>
            {data.routes.map((r) => (
              <li key={r.id}>
                <div>
                  <span className="guide-name">{r.title}</span>
                  <span className="guide-cat">{r.length === 'day' ? '하루' : '반나절'} · {r.placeIds.length}곳</span>
                  <span className="guide-summary">{r.summary}</span>
                </div>
                <button type="button" className="text-btn" onClick={() => loadRoute(r.id)} aria-label={`추천 루트 ${r.title} 불러오기`}>
                  불러오기
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="guide-foot">
        {city.stops.length >= 3 ? (
          <>
            <button type="button" className="text-btn" onClick={optimize}>순서 최적화</button>
            {shortestFor === city.stops && <span className="guide-reason" role="status">이미 가장 짧은 순서입니다</span>}
          </>
        ) : (
          <span className="guide-reason">경유지가 3곳 이상이면 순서를 최적화할 수 있습니다.</span>
        )}
        <span className="guide-notice">{DATA_NOTICE}</span>
      </div>
    </section>
  );
}
