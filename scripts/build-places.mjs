// Natural Earth(퍼블릭 도메인) 원본에서 나라별 주요 도시 목록 src/data/places.json을 만든다.
// 원본은 저장소에 넣지 않는다. 받는 곳: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//   node scripts/build-places.mjs <ne_10m_populated_places.geojson> <ne_110m_admin_0_countries.geojson>
// 나라 키는 지구본 클릭 판정에 쓰는 world-atlas countries-110m의 이름이다.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const PER_COUNTRY = 20;
const [placesPath, adminPath] = process.argv.slice(2);
if (!placesPath || !adminPath) throw new Error('사용법: node scripts/build-places.mjs <populated_places> <admin_0_countries>');

const require = createRequire(import.meta.url);
const atlas = require('world-atlas/countries-110m.json');
const atlasNames = new Set(atlas.objects.countries.geometries.map((g) => g.properties.name));

// world-atlas가 만들어진 뒤 Natural Earth에서 바뀐 이름
const RENAMED = { Macedonia: 'North Macedonia' };
const admin = JSON.parse(readFileSync(adminPath, 'utf8')).features.map((f) => f.properties);
for (const a of admin) for (const [old, now] of Object.entries(RENAMED)) if (a.NAME === now) a.NAME = old;
// 도시의 ADM0_A3가 나라 쪽 ISO_A3와 같은 경우도 있다 (남수단: SSD ↔ SDS)
const byA3 = new Map(admin.flatMap((a) => [[a.ISO_A3, a], [a.ADM0_A3, a]]));
const missing = [...atlasNames].filter((n) => !admin.some((a) => a.NAME === n));
if (missing.length) throw new Error(`world-atlas 이름이 Natural Earth에 없음: ${missing.join(', ')}`);

const round = (x) => Math.round(x * 1e4) / 1e4;
const groups = new Map([...atlasNames].map((n) => [n, []]));
for (const { properties: p, geometry } of JSON.parse(readFileSync(placesPath, 'utf8')).features) {
  const country = byA3.get(p.ADM0_A3)?.NAME;
  if (!country || !groups.has(country)) continue; // 1:110m 지도에 없는 작은 나라·속령
  const [lon, lat] = geometry.coordinates;
  const capital = p.FEATURECLA === 'Admin-0 capital' ? 1 : 0;
  groups.get(country).push({ ko: (p.NAME_KO || p.NAME_EN || p.NAME).trim(), en: (p.NAME_EN || p.NAME).trim(), lat: round(lat), lon: round(lon), pop: p.POP_MAX, capital });
}

const countries = {};
let total = 0;
for (const [name, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const seen = new Set();
  // 인구순으로 고르되 수도는 늘 넣는다
  const sorted = list.sort((a, b) => b.capital - a.capital || b.pop - a.pop);
  const picked = sorted.filter((c) => !seen.has(c.ko) && seen.add(c.ko)).slice(0, PER_COUNTRY).sort((a, b) => b.pop - a.pop);
  total += picked.length;
  const ko = admin.find((a) => a.NAME === name).NAME_KO || name;
  countries[name] = { ko, cities: picked.map((c) => [c.ko, c.en, c.lat, c.lon, c.pop, c.capital]) };
}

const out = new URL('../src/data/places.json', import.meta.url);
writeFileSync(out, JSON.stringify({ source: 'Natural Earth 1:10m populated places, 1:110m admin 0 countries (public domain)', fields: ['ko', 'en', 'lat', 'lon', 'pop', 'capital'], countries }) + '\n');
console.log(`나라 ${Object.keys(countries).length}곳, 도시 ${total}곳, 도시 없는 나라: ${Object.entries(countries).filter(([, c]) => !c.cities.length).map(([n]) => n).join(', ') || '없음'}`);
