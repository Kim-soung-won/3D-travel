// 패널: 지구 화면이면 도시 단위 경유지, 도시 화면이면 그 도시의 세부 경유지를 다룬다.
// 지우기는 확인 창 대신 즉시 실행하고 되돌리기를 준다.
import { useEffect, useRef, type Dispatch } from 'react';
import { PLACES_NOTICE, type CityOption } from '../data/places';
import { distanceKm, formatKm } from '../geo/geo';
import { CITY_MODES, formatDuration, GLOBE_MODES } from '../geo/modes';
import type { LegState } from '../hooks/useLegs';
import { sampleWaypoints, type RouteAction, type RouteState, type Waypoint } from '../state/route';
import { cityDataAt } from '../data';
import { cityDays, type CityDays, formatDayRange, formatTrip, MAX_NIGHTS, nightsOf, totalNights } from '../state/itinerary';
import { CityGuide } from './CityGuide';
import { StopList } from './StopList';

interface CommonProps {
  route: RouteState;
  dispatch: Dispatch<RouteAction>;
  legs: LegState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  playing: boolean;
  progress: number;
  onTogglePlay: () => void;
}

function Undo({ route, dispatch }: Pick<CommonProps, 'route' | 'dispatch'>) {
  if (!route.undo) return null;
  return (
    <div className="undo" role="status">
      <span>{route.undo.label}</span>
      <button type="button" className="link-btn" onClick={() => dispatch({ type: 'undo' })}>되돌리기</button>
      <button type="button" className="link-btn muted" aria-label="알림 닫기" onClick={() => dispatch({ type: 'dismissUndo' })}>닫기</button>
    </div>
  );
}

function Footer({ legs, count, playing, progress, onTogglePlay, onClear, minReason, status }: {
  legs: LegState[]; count: number; playing: boolean; progress: number; onTogglePlay: () => void; onClear: () => void; minReason: string;
  /** 재생 중 지금 상태 한 줄 */
  status?: string;
}) {
  const totalKm = legs.reduce((a, l) => a + l.distanceKm, 0);
  const groundS = legs.filter((l) => l.mode !== 'plane').reduce((a, l) => a + l.durationS, 0);
  const flights = legs.filter((l) => l.mode === 'plane');
  const flightS = flights.filter((l) => l.timeKnown).reduce((a, l) => a + l.durationS, 0);
  const flightAll = flights.every((l) => l.timeKnown);
  const canPlay = count >= 2 && !legs.some((l) => l.loading);
  return (
    <footer className="panel-foot">
      <div className="total">
        <span>총 거리</span>
        <strong>{formatKm(totalKm)}</strong>
        <span className="muted">구간 {legs.length}개{groundS > 0 && ` · 지상 이동 약 ${formatDuration(groundS)}`}
          {flightS > 0 && ` · 비행${flightAll ? '' : '(아는 구간만)'} 약 ${formatDuration(flightS)}`}</span>
      </div>
      {playing && status && <p className="trip-status" role="status">{status}</p>}
      {playing && (
        <div className="progress" role="progressbar" aria-label="여행 진행" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <div className="actions">
        <button type="button" className="btn primary" disabled={!canPlay && !playing} onClick={onTogglePlay}>
          {playing ? '■ 정지' : '▶ 여행 재생'}
        </button>
        {count > 0 && <button type="button" className="btn ghost danger-text" onClick={onClear}>모두 지우기</button>}
      </div>
      {count < 2 && <p className="reason">{minReason}</p>}
      {count >= 2 && legs.some((l) => l.loading) && <p className="reason">경로를 찾는 중이라 잠시 뒤 재생할 수 있습니다.</p>}
    </footer>
  );
}

/** 도시별 숙박 수 조절. 날짜 범위(n일차)를 함께 보인다 */
function NightsStepper({ waypoint, days, onChange }: { waypoint: Waypoint; days: CityDays; onChange: (nights: number) => void }) {
  const n = nightsOf(waypoint);
  return (
    <div className="nights" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icon-btn" aria-label={`${waypoint.name} 숙박 하루 줄이기`} disabled={n <= 0} onClick={() => onChange(n - 1)}>−</button>
      <span className="nights-value" aria-live="polite">{n > 0 ? `${n}박` : '당일'}</span>
      <button type="button" className="icon-btn" aria-label={`${waypoint.name} 숙박 하루 늘리기`} disabled={n >= MAX_NIGHTS} onClick={() => onChange(n + 1)}>+</button>
      <span className="nights-days">{formatDayRange(days)}</span>
    </div>
  );
}

/** 인구를 "980만" 식으로 */
function formatPop(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
}

export interface CountryPanel {
  name: string;
  /** 불러오는 중이면 null */
  cities: CityOption[] | null;
}

/** 지구본에서 고른 나라의 주요 도시. 누르면 경유지 끝에 넣는다. 지구본의 점과 마우스 올림을 함께 보인다 */
function CountryPicker({ country, waypoints, hovered, onHover, onAdd, onClose }: {
  country: CountryPanel; waypoints: Waypoint[]; hovered: number | null; onHover: (i: number | null) => void; onAdd: (c: CityOption) => void; onClose: () => void;
}) {
  const rows = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    if (hovered !== null) rows.current.get(hovered)?.scrollIntoView({ block: 'nearest' });
  }, [hovered]);
  const inTrip = (c: CityOption) => waypoints.some((w) => distanceKm(w, c) < 15);
  const { cities } = country;
  return (
    <section className="country" aria-label={`${country.name}의 도시`}>
      <div className="country-head">
        <h2>{country.name}</h2>
        {cities && cities.length > 0 && <span className="country-count">도시 {cities.length}곳</span>}
        <button type="button" className="icon-btn" aria-label="나라 선택 닫기" onClick={onClose}>×</button>
      </div>
      {cities === null ? (
        <p className="reason">도시 목록을 불러오는 중…</p>
      ) : cities.length === 0 ? (
        <p className="reason">이 지역은 도시 데이터가 없습니다. 다른 나라를 고르세요.</p>
      ) : (
        <ul className="country-cities" onMouseLeave={() => onHover(null)}>
          {cities.map((c, i) => (
            <li key={`${c.name}-${i}`}>
              <button
                type="button"
                ref={(el) => {
                  if (el) rows.current.set(i, el);
                  else rows.current.delete(i);
                }}
                className={hovered === i ? 'is-hovered' : undefined}
                onClick={() => onAdd(c)}
                onMouseEnter={() => onHover(i)}
                onFocus={() => onHover(i)}
                aria-label={`${c.name} 경유지에 추가`}
              >
                <span className="guide-name">{c.name}</span>
                {c.capital && <span className="capital">수도</span>}
                <span className="city-en">{c.en !== c.name ? c.en : ''}</span>
                <span className="city-meta">{inTrip(c) ? '일정에 있음 · ' : ''}인구 {formatPop(c.pop)}</span>
                <span className="city-add" aria-hidden="true">+ 추가</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="country-notice">{PLACES_NOTICE}</p>
    </section>
  );
}

export function GlobeSidebar(props: CommonProps & {
  onEnterCity: (id: string) => void; status?: string; onShare: () => void;
  country: CountryPanel | null; hoveredCity: number | null; onHoverCity: (i: number | null) => void; onAddCity: (c: CityOption) => void; onCloseCountry: () => void;
}) {
  const { route, dispatch } = props;
  const list = route.waypoints;
  const days = cityDays(list);
  return (
    <aside className="panel" aria-label="여행 경로">
      <header className="panel-head">
        <div className="panel-title">
          <h1>
            여행 지구본{list.length > 0 && <span className="trip-badge">{formatTrip(totalNights(list))}</span>}
          </h1>
          <button type="button" className="btn share-btn" onClick={props.onShare}>공유</button>
        </div>
        <p className="hint">지구본에서 나라를 누른 뒤 도시를 고르세요. 도시마다 묵을 밤 수를, 구간마다 이동 수단을 고르고, 도시에 들어가 세부 경로를 짤 수 있습니다.</p>
      </header>
      {props.country && (
        <CountryPicker country={props.country} waypoints={list} hovered={props.hoveredCity} onHover={props.onHoverCity} onAdd={props.onAddCity} onClose={props.onCloseCountry} />
      )}
      {list.length === 0 ? (
        <div className="empty">
          <p>아직 경유지가 없습니다. 지구본에서 나라를 눌러 시작하세요.</p>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'load', label: '예시 경로를 불러옴', waypoints: sampleWaypoints() })}>
            예시 경로 불러오기
          </button>
        </div>
      ) : (
        <StopList
          items={list}
          legs={props.legs}
          modes={GLOBE_MODES}
          selectedId={props.selectedId}
          noun="경유지"
          onSelect={props.onSelect}
          onRename={(id, name) => dispatch({ type: 'update', id, patch: { name } })}
          onMove={(id, delta) => dispatch({ type: 'move', id, delta })}
          onRemove={(id) => dispatch({ type: 'remove', id })}
          onMode={(id, mode) => dispatch({ type: 'update', id, patch: { mode } })}
          extra={(w) => (
            <>
              <NightsStepper
                waypoint={w as Waypoint}
                days={days[list.findIndex((x) => x.id === w.id)]}
                onChange={(nights) => dispatch({ type: 'update', id: w.id, patch: { nights } })}
              />
              <button type="button" className="enter-btn" onClick={() => props.onEnterCity(w.id)}>
                {(w as Waypoint).stops.length ? `도시 경로 ${(w as Waypoint).stops.length}곳 보기` : '도시 안 경로 짜기'} →
              </button>
            </>
          )}
        />
      )}
      <Undo route={route} dispatch={dispatch} />
      <Footer status={props.status} legs={props.legs} count={list.length} playing={props.playing} progress={props.progress} onTogglePlay={props.onTogglePlay}
        onClear={() => dispatch({ type: 'clear' })} minReason="경유지가 2곳 이상이어야 재생할 수 있습니다." />
    </aside>
  );
}

export function CitySidebar(props: CommonProps & { city: Waypoint; onBack: () => void }) {
  const { route, dispatch, city } = props;
  return (
    <aside className="panel" aria-label={`${city.name} 세부 경로`}>
      <header className="panel-head">
        <button type="button" className="back-btn" onClick={props.onBack}>← 지구로 돌아가기</button>
        <h1>{city.name}</h1>
        <p className="hint">장소를 검색하거나 지도를 클릭해 추가하세요. 버스·자동차·도보는 실제 도로를, 지하철은 노선을 따라갑니다.</p>
      </header>
      <div className="panel-body">
      <CityGuide city={city} data={cityDataAt(city)} dispatch={dispatch} onSelect={props.onSelect} />
      {city.stops.length === 0 ? (
        <div className="empty"><p>아직 세부 경유지가 없습니다. 추천 루트를 불러오거나 장소를 검색해 보세요.</p></div>
      ) : (
        <StopList
          items={city.stops}
          legs={props.legs}
          modes={CITY_MODES}
          selectedId={props.selectedId}
          noun="세부 경유지"
          onSelect={props.onSelect}
          onRename={(id, name) => dispatch({ type: 'updateStop', parentId: city.id, id, patch: { name } })}
          onMove={(id, delta) => dispatch({ type: 'moveStop', parentId: city.id, id, delta })}
          onRemove={(id) => dispatch({ type: 'removeStop', parentId: city.id, id })}
          onMode={(id, mode) => dispatch({ type: 'updateStop', parentId: city.id, id, patch: { mode } })}
        />
      )}
      </div>
      <Undo route={route} dispatch={dispatch} />
      <Footer legs={props.legs} count={city.stops.length} playing={props.playing} progress={props.progress} onTogglePlay={props.onTogglePlay}
        onClear={() => dispatch({ type: 'clearStops', parentId: city.id })} minReason="세부 경유지가 2곳 이상이어야 재생할 수 있습니다." />
    </aside>
  );
}
