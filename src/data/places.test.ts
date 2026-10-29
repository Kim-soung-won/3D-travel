import { describe, expect, it } from 'vitest';
import countriesTopo from 'world-atlas/countries-110m.json';
import { countryCenter, countryKeyAt, countryName } from '../geo/world';
import places from './places.json';
import { loadCountryCities, parseCountry, searchCountryCities } from './places';

const atlasNames = (countriesTopo as unknown as { objects: { countries: { geometries: { properties: { name: string } }[] } } }).objects.countries.geometries.map((g) => g.properties.name);
const all = Object.entries(places.countries as unknown as Record<string, Parameters<typeof parseCountry>[0]>).map(([key, raw]) => ({ key, ...parseCountry(raw) }));

describe('나라별 주요 도시 데이터', () => {
  it('지구본에서 누를 수 있는 나라마다 항목이 있다', () => {
    expect(new Set(all.map((c) => c.key))).toEqual(new Set(atlasNames));
  });

  it('도시는 인구순이고 나라마다 20곳 이하이며 이름이 겹치지 않는다', () => {
    for (const c of all) {
      expect(c.cities.length).toBeLessThanOrEqual(20);
      expect(new Set(c.cities.map((x) => x.name)).size).toBe(c.cities.length);
      c.cities.forEach((x, i) => i > 0 && expect(x.pop).toBeLessThanOrEqual(c.cities[i - 1].pop));
    }
  });

  it('대부분의 나라에 수도가 있고, 수도를 누르면 그 나라가 골라진다', () => {
    const capitals = all.flatMap((c) => c.cities.filter((x) => x.capital).map((x) => ({ key: c.key, ...x })));
    expect(capitals.length).toBeGreaterThan(150);
    // 1:110m 국경이 거칠어 해안 수도 몇 곳은 바다로 잡힌다. 대부분은 맞아야 한다
    const hits = capitals.filter((x) => countryKeyAt(x) === x.key).length;
    expect(hits / capitals.length).toBeGreaterThan(0.85);
  });

  it('잘 알려진 도시가 맞는 나라에 있다', async () => {
    const korea = await loadCountryCities('South Korea');
    expect(korea.cities[0]).toMatchObject({ name: '서울특별시', capital: true });
    expect(korea.cities.map((c) => c.name)).toContain('부산광역시');
    const france = await loadCountryCities('France');
    expect(france.cities.find((c) => c.capital)?.name).toBe('파리');
  });

  it('1:110m 지도에 없는 작은 나라는 가까운 나라 목록에 그 나라 이름과 함께 들어간다', async () => {
    const malaysia = await loadCountryCities('Malaysia');
    expect(malaysia.cities.find((c) => c.en === 'Singapore')).toMatchObject({ area: '싱가포르' });
    const china = await loadCountryCities('China');
    expect(china.cities.find((c) => c.en === 'Hong Kong')).toMatchObject({ area: '홍콩' });
    expect(china.cities.find((c) => c.en === 'Beijing')?.area).toBeUndefined();
  });

  it('검색하면 목록 20곳 밖의 작은 도시도 찾는다 (한국어·영어, 앞부분이 맞으면 먼저)', async () => {
    const top = (await loadCountryCities('South Korea')).cities.map((c) => c.en);
    const gyeongju = await searchCountryCities('South Korea', '경주');
    expect(gyeongju[0].en).toBe('Gyeongju');
    expect(top).not.toContain('Gyeongju');
    expect((await searchCountryCities('Japan', 'kyo'))[0].en).toBe('Kyoto'); // 'Tokyo'는 가운데에 kyo가 들어 있어 뒤로
    expect((await searchCountryCities('France', 'nimes')).map((c) => c.en)).toContain('Nîmes');
    expect(await searchCountryCities('South Korea', '')).toEqual([]);
  });

  it('데이터에 없는 나라 키면 빈 목록이다', async () => {
    expect((await loadCountryCities('Atlantis')).cities).toEqual([]);
  });
});

describe('나라 고르기', () => {
  it('누른 좌표의 나라를 찾고, 바다면 null', () => {
    expect(countryKeyAt({ lat: 37.57, lon: 126.98 })).toBe('South Korea');
    expect(countryKeyAt({ lat: 46.6, lon: 2.4 })).toBe('France');
    expect(countryKeyAt({ lat: 30, lon: -40 })).toBeNull();
  });

  it('한국어 이름은 짧은 이름을 먼저 쓴다', () => {
    expect(countryName('China', '중화인민공화국')).toBe('중국');
    expect(countryName('Fiji', '피지')).toBe('피지');
  });

  it('나라 중심은 해외 영토가 아니라 본토에 있다', () => {
    // 프랑스는 남미의 프랑스령 기아나를 포함한다
    const fr = countryCenter('France')!;
    expect(fr.lat).toBeGreaterThan(42);
    expect(fr.lon).toBeGreaterThan(-5);
    expect(fr.radius).toBeLessThan(0.15); // 본토 반경 약 6°
    const us = countryCenter('United States of America')!;
    expect(us.lat).toBeGreaterThan(30);
    expect(us.lat).toBeLessThan(50);
  });
});
