// OurAirports(퍼블릭 도메인) 원본에서 정기편 공항 목록 src/data/airports.json을 만든다.
// 원본은 저장소에 넣지 않는다. 받는 곳: https://davidmegginson.github.io/ourairports-data/airports.csv
//   node scripts/build-airports.mjs <airports.csv>
// 대형 공항과, 정기편이 있고 IATA 코드가 있는 중형 공항만 넣는다.
import { readFileSync, writeFileSync } from 'node:fs';

const [csvPath] = process.argv.slice(2);
if (!csvPath) throw new Error('사용법: node scripts/build-airports.mjs <airports.csv>');

// 자주 쓰는 공항의 한국어 이름 (없으면 영어 이름)
const KO = {
  ICN: '인천국제공항', GMP: '김포국제공항', PUS: '김해국제공항', CJU: '제주국제공항', TAE: '대구국제공항', CJJ: '청주국제공항', KWJ: '광주공항', RSU: '여수공항', USN: '울산공항', YNY: '양양국제공항', MWX: '무안국제공항',
  NRT: '나리타국제공항', HND: '하네다공항', KIX: '간사이국제공항', ITM: '이타미공항', UKB: '고베공항', NGO: '주부국제공항', FUK: '후쿠오카공항', CTS: '신치토세공항', OKA: '나하공항',
  TPE: '타오위안국제공항', TSA: '쑹산공항', KHH: '가오슝국제공항', HKG: '홍콩국제공항', MFM: '마카오국제공항',
  PEK: '베이징 서우두국제공항', PKX: '베이징 다싱국제공항', PVG: '상하이 푸둥국제공항', SHA: '상하이 훙차오국제공항',
  BKK: '수완나품국제공항', DMK: '돈므앙국제공항', SIN: '창이공항', KUL: '쿠알라룸푸르국제공항', SGN: '떤선녓국제공항', HAN: '노이바이국제공항', DAD: '다낭국제공항', MNL: '니노이 아키노국제공항', CEB: '막탄 세부국제공항', CGK: '수카르노하타국제공항', DPS: '응우라라이국제공항',
  LHR: '히스로공항', LGW: '개트윅공항', STN: '스탠스테드공항', LCY: '런던시티공항', CDG: '샤를드골공항', ORY: '오를리공항', FRA: '프랑크푸르트공항', AMS: '스히폴공항', FCO: '피우미치노공항', MAD: '바라하스공항', BCN: '엘프라트공항', IST: '이스탄불공항',
  JFK: 'JFK국제공항', EWR: '뉴어크 리버티국제공항', LGA: '라과디아공항', SFO: '샌프란시스코국제공항', OAK: '오클랜드국제공항', SJC: '산호세국제공항', LAX: '로스앤젤레스국제공항', BUR: '버뱅크공항', SEA: '시애틀 터코마국제공항', ORD: '오헤어국제공항', HNL: '대니얼 K. 이노우에국제공항', YVR: '밴쿠버국제공항',
  SYD: '시드니공항', DXB: '두바이국제공항',
};

// 따옴표 안의 쉼표를 지키는 CSV 한 줄 나누기
function splitCsv(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const [head, ...lines] = readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
const col = Object.fromEntries(splitCsv(head).map((h, i) => [h, i]));
const round = (x) => Math.round(x * 1e4) / 1e4;
const airports = [];
for (const line of lines) {
  const c = splitCsv(line);
  const type = c[col.type];
  const iata = c[col.iata_code];
  if (!/^[A-Z]{3}$/.test(iata) || c[col.scheduled_service] !== 'yes') continue;
  if (type !== 'large_airport' && type !== 'medium_airport') continue;
  const name = c[col.name].trim();
  // 줄: [IATA, 이름(한국어가 있으면 한국어), 영어 이름, 위도, 경도, 나라 ISO, 대형 1/0]
  airports.push([iata, KO[iata] ?? name, name, round(+c[col.latitude_deg]), round(+c[col.longitude_deg]), c[col.iso_country], type === 'large_airport' ? 1 : 0]);
}
airports.sort((a, b) => a[0].localeCompare(b[0]));
const missingKo = Object.keys(KO).filter((k) => !airports.some((a) => a[0] === k));
writeFileSync(
  new URL('../src/data/airports.json', import.meta.url),
  JSON.stringify({ source: 'OurAirports (public domain), 정기편이 있는 대형·중형 공항', fields: ['iata', 'name', 'en', 'lat', 'lon', 'country', 'large'], airports }) + '\n',
);
console.log(`공항 ${airports.length}곳 (대형 ${airports.filter((a) => a[6]).length}), 한국어 이름 ${Object.keys(KO).length - missingKo.length}곳${missingKo.length ? `, 목록에 없는 한국어 이름: ${missingKo.join(', ')}` : ''}`);
