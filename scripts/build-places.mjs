// Natural Earth(퍼블릭 도메인) 원본에서 나라별 주요 도시 목록 src/data/places.json을 만든다.
// 원본은 저장소에 넣지 않는다. 받는 곳: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//   node scripts/build-places.mjs <ne_10m_populated_places.geojson> <ne_110m_admin_0_countries.geojson>
// 나라 키는 지구본 클릭 판정에 쓰는 world-atlas countries-110m의 이름이다.
// 만드는 것:
//   places.json      나라마다 인구순 20곳 (지구본에서 나라를 누르면 보이는 목록)
//   places-all.json  나라마다 모든 도시 (목록 위 검색 칸에서 찾을 때만 불러온다)
// 1:110m 지도에 없는 작은 나라·속령(싱가포르, 홍콩 등)의 도시는 가장 가까운 지도 속 나라에 붙이고, 원래 나라 이름을 함께 적는다.
import { geoDistance } from 'd3-geo';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const PER_COUNTRY = 20;
/** 작은 나라 도시를 붙일 때, 지도 속 나라 해안선 꼭짓점까지 이보다 멀면 버린다 (먼 섬나라) */
const ATTACH_MAX_KM = 300;
const EARTH_KM = 6371;
// 지도에 없는 나라·속령의 한국어 이름 (없으면 영어 이름을 쓴다)
const SMALL_KO = {
  Singapore: '싱가포르', 'Hong Kong S.A.R.': '홍콩', 'Macau S.A.R': '마카오', Vatican: '바티칸', Monaco: '모나코', 'San Marino': '산마리노',
  Andorra: '안도라', Liechtenstein: '리히텐슈타인', Malta: '몰타', Bahrain: '바레인', 'North Macedonia': '북마케도니아', Gibraltar: '지브롤터',
  'Isle of Man': '맨섬', Aland: '올란드 제도', 'Faroe Islands': '페로 제도', Mauritius: '모리셔스', Maldives: '몰디브', Seychelles: '세이셸',
  Guam: '괌', 'Northern Mariana Islands': '북마리아나 제도', Palau: '팔라우', Barbados: '바베이도스', Bermuda: '버뮤다',
};
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

// 지도 속 나라마다 해안선·국경 꼭짓점 (작은 나라 도시를 가장 가까운 나라에 붙일 때 쓴다)
const shapes = feature(atlas, atlas.objects.countries).features.map((f) => ({
  name: f.properties.name,
  points: (f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.coordinates ?? []).flat(2),
}));
function nearestCountry(lon, lat) {
  let best = null;
  let bestKm = Infinity;
  for (const s of shapes)
    for (const p of s.points) {
      const km = geoDistance([lon, lat], p) * EARTH_KM;
      if (km < bestKm) [best, bestKm] = [s.name, km];
    }
  return bestKm <= ATTACH_MAX_KM ? best : null;
}

const round = (x) => Math.round(x * 1e4) / 1e4;
const groups = new Map([...atlasNames].map((n) => [n, []]));
const attached = new Map();
for (const { properties: p, geometry } of JSON.parse(readFileSync(placesPath, 'utf8')).features) {
  const [lon, lat] = geometry.coordinates;
  let country = byA3.get(p.ADM0_A3)?.NAME;
  let area = null;
  if (!country || !groups.has(country)) {
    // 1:110m 지도에 없는 작은 나라·속령: 가까운 지도 속 나라에 붙인다
    country = nearestCountry(lon, lat);
    if (!country) continue;
    area = SMALL_KO[p.ADM0NAME] ?? p.ADM0NAME;
    attached.set(`${p.ADM0NAME} → ${country}`, (attached.get(`${p.ADM0NAME} → ${country}`) ?? 0) + 1);
  }
  const capital = p.FEATURECLA === 'Admin-0 capital' ? 1 : 0;
  groups.get(country).push({ ko: (p.NAME_KO || p.NAME_EN || p.NAME).trim(), en: (p.NAME_EN || p.NAME).trim(), lat: round(lat), lon: round(lon), pop: p.POP_MAX, capital, area });
}

// 줄: [한국어, 영어, 위도, 경도, 인구, 수도] (+ 지도에 없는 나라면 그 나라 이름)
const row = (c) => (c.area ? [c.ko, c.en, c.lat, c.lon, c.pop, c.capital, c.area] : [c.ko, c.en, c.lat, c.lon, c.pop, c.capital]);
const countries = {};
const all = {};
let total = 0;
let totalAll = 0;
for (const [name, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const seen = new Set();
  // 인구순으로 고르되, 지도 속 나라의 수도는 늘 넣는다. 붙인 작은 나라의 수도는 인구로만 겨룬다
  const sorted = list.sort((a, b) => (b.capital && !b.area) - (a.capital && !a.area) || b.pop - a.pop);
  const unique = sorted.filter((c) => !seen.has(`${c.ko}|${c.area}`) && seen.add(`${c.ko}|${c.area}`));
  const picked = unique.slice(0, PER_COUNTRY).sort((a, b) => b.pop - a.pop);
  total += picked.length;
  totalAll += unique.length;
  const ko = admin.find((a) => a.NAME === name).NAME_KO || name;
  countries[name] = { ko, cities: picked.map(row) };
  all[name] = unique.sort((a, b) => b.pop - a.pop).map(row);
}

const source = 'Natural Earth 1:10m populated places, 1:110m admin 0 countries (public domain)';
const fields = ['ko', 'en', 'lat', 'lon', 'pop', 'capital', 'area?'];
writeFileSync(new URL('../src/data/places.json', import.meta.url), JSON.stringify({ source, fields, countries }) + '\n');
writeFileSync(new URL('../src/data/places-all.json', import.meta.url), JSON.stringify({ source, fields, countries: all }) + '\n');
console.log(`나라 ${Object.keys(countries).length}곳, 목록 도시 ${total}곳, 검색 도시 ${totalAll}곳, 도시 없는 나라: ${Object.entries(countries).filter(([, c]) => !c.cities.length).map(([n]) => n).join(', ') || '없음'}`);
console.log(`지도에 없어 가까운 나라에 붙인 곳: ${[...attached].map(([k, n]) => `${k} (${n})`).join(', ')}`);
