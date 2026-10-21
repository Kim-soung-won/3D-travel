// 두 화면(지구본 ↔ 도시 지도)을 로딩 화면으로 전환한다. 두 화면은 동시에 떠 있지 않아 가볍다.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { LatLon } from './geo/geo';
import { reverseGeocode } from './geo/geocode';
import { countryAt } from './geo/world';
import { useLegs } from './hooks/useLegs';
import { Scene } from './scene/Scene';
import { newId, useRoute, type Stop } from './state/route';
import { LoadingScreen, type Curtain } from './ui/LoadingScreen';
import { CitySidebar, GlobeSidebar } from './ui/Sidebar';

const CityView = lazy(() => import('./city/CityView'));

type View = { kind: 'globe' } | { kind: 'city'; id: string };
const NO_STOPS: Stop[] = [];
const FADE_MS = 350;
const MIN_COVER_MS = 500;

export function App() {
  const [route, dispatch] = useRoute();
  const [view, setView] = useState<View>({ kind: 'globe' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [citySelectedId, setCitySelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<LatLon | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // 로딩 화면
  const [curtain, setCurtain] = useState<Curtain>('hidden');
  const [curtainText, setCurtainText] = useState({ title: '', subtitle: '' });
  const [curtainError, setCurtainError] = useState<string | null>(null);
  const coveredAt = useRef(0);
  const pendingReveal = useRef(false);

  const city = view.kind === 'city' ? route.waypoints.find((w) => w.id === view.id) ?? null : null;
  const globeLegs = useLegs(route.waypoints);
  const cityLegs = useLegs(city?.stops ?? NO_STOPS);

  /** 로딩 화면으로 덮고, 덮인 뒤 화면을 바꾼다 */
  const transition = useCallback((next: View, title: string, subtitle: string) => {
    setPlaying(false);
    setCurtainError(null);
    setCurtainText({ title, subtitle });
    setCurtain('covering');
    pendingReveal.current = false;
    window.setTimeout(() => {
      coveredAt.current = performance.now();
      setCurtain('covered');
      setView(next);
    }, FADE_MS);
  }, []);

  /** 새 화면이 준비되면 최소 노출 시간을 채운 뒤 걷는다 */
  const reveal = useCallback(() => {
    if (pendingReveal.current) return;
    pendingReveal.current = true;
    const wait = Math.max(0, MIN_COVER_MS - (performance.now() - coveredAt.current));
    window.setTimeout(() => {
      setCurtain((c) => (c === 'covered' ? 'revealing' : c));
      window.setTimeout(() => setCurtain((c) => (c === 'revealing' ? 'hidden' : c)), FADE_MS);
    }, wait);
  }, []);

  const enterCity = (id: string) => {
    const w = route.waypoints.find((x) => x.id === id);
    if (!w) return;
    setCitySelectedId(null);
    transition({ kind: 'city', id }, w.name, '거리와 길을 불러오는 중…');
  };
  const backToGlobe = useCallback(() => {
    const w = city;
    transition({ kind: 'globe' }, '지구로', '지구본을 다시 그리는 중…');
    if (w) {
      setSelectedId(w.id);
      setFocus({ lat: w.lat, lon: w.lon });
    }
  }, [city, transition]);

  // 보고 있던 도시가 지워지면 지구로 돌아간다
  useEffect(() => {
    if (view.kind === 'city' && !city && curtain === 'hidden') backToGlobe();
  }, [view, city, curtain, backToGlobe]);

  const selectGlobe = useCallback(
    (id: string) => {
      setSelectedId(id);
      const w = route.waypoints.find((x) => x.id === id);
      if (w) setFocus({ lat: w.lat, lon: w.lon });
    },
    [route.waypoints],
  );

  // 이름은 먼저 오프라인(나라 이름)으로 붙이고, 역지오코딩 결과가 오면 사용자가 고치지 않은 경우에만 바꾼다
  const provisional = useRef(new Map<string, string>());
  const pickGlobe = useCallback(
    (p: LatLon) => {
      const id = newId();
      const name = countryAt(p) ?? '바다 위 지점';
      provisional.current.set(id, name);
      dispatch({ type: 'add', waypoint: { id, name, ...p, mode: 'plane', stops: [] } });
      setSelectedId(id);
      reverseGeocode(p, 10).then((r) => {
        if (r && provisional.current.get(id) !== undefined) dispatch({ type: 'update', id, patch: { name: r.name, area: r.area } });
      });
    },
    [dispatch],
  );
  const pickCity = useCallback(
    (p: LatLon) => {
      if (!city) return;
      const id = newId();
      const name = `세부 경유지 ${city.stops.length + 1}`;
      provisional.current.set(id, name);
      dispatch({ type: 'addStop', parentId: city.id, stop: { id, name, ...p, mode: 'walk' } });
      setCitySelectedId(id);
      reverseGeocode(p, 18).then((r) => {
        if (r && provisional.current.get(id) !== undefined)
          dispatch({ type: 'updateStop', parentId: city.id, id, patch: { name: r.name, area: r.area } });
      });
    },
    [city, dispatch],
  );
  // 사용자가 이름을 고치면 자동 이름으로 덮어쓰지 않는다
  const guardedDispatch: typeof dispatch = useCallback(
    (a) => {
      if ((a.type === 'update' || a.type === 'updateStop') && a.patch.name !== undefined) provisional.current.delete(a.id);
      dispatch(a);
    },
    [dispatch],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlaying(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const common = {
    route,
    dispatch: guardedDispatch,
    playing,
    progress,
    onTogglePlay: () => {
      setFocus(null);
      setProgress(0);
      setPlaying((p) => !p);
    },
  };

  return (
    <div className="app">
      <div className="stage">
        {view.kind === 'globe' ? (
          <Scene
            waypoints={route.waypoints}
            legs={globeLegs}
            selectedId={selectedId}
            focus={focus}
            playing={playing}
            onPick={pickGlobe}
            onSelect={selectGlobe}
            onFocusDone={() => setFocus(null)}
            onProgress={setProgress}
            onPlayDone={() => setPlaying(false)}
            onReady={reveal}
          />
        ) : (
          city && (
            <Suspense fallback={null}>
              <CityView
                key={city.id}
                center={city}
                stops={city.stops}
                legs={cityLegs}
                selectedId={citySelectedId}
                playing={playing}
                onPick={pickCity}
                onSelect={setCitySelectedId}
                onReady={reveal}
                onError={setCurtainError}
                onProgress={setProgress}
                onPlayDone={() => setPlaying(false)}
              />
            </Suspense>
          )
        )}
      </div>
      {view.kind === 'globe' || !city ? (
        <GlobeSidebar {...common} legs={globeLegs} selectedId={selectedId} onSelect={selectGlobe} onEnterCity={enterCity} />
      ) : (
        <CitySidebar {...common} legs={cityLegs} city={city} selectedId={citySelectedId} onSelect={setCitySelectedId} onBack={backToGlobe} />
      )}
      <LoadingScreen
        state={curtain}
        title={curtainText.title}
        subtitle={curtainText.subtitle}
        error={curtainError}
        onRetry={city ? () => enterCity(city.id) : undefined}
        onBack={backToGlobe}
      />
    </div>
  );
}
