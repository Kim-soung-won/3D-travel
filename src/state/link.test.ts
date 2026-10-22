import { describe, expect, it } from 'vitest';
import { linkLabel, mapsSearchUrl, safeLink } from './link';

describe('경유지 링크', () => {
  it('http(s) 주소만 받는다', () => {
    expect(safeLink(' https://maps.app.goo.gl/abc ')).toBe('https://maps.app.goo.gl/abc');
    expect(safeLink('http://example.com')).toBe('http://example.com/');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('data:text/html,hi')).toBeNull();
    expect(safeLink('구글 지도')).toBeNull();
    expect(safeLink('')).toBeNull();
    expect(safeLink(42)).toBeNull();
    expect(safeLink(`https://a.com/${'x'.repeat(600)}`)).toBeNull();
  });

  it('지도 서비스는 알아보기 쉬운 이름으로 보인다', () => {
    expect(linkLabel('https://maps.app.goo.gl/abc')).toBe('구글 지도');
    expect(linkLabel('https://www.google.com/maps/place/x')).toBe('구글 지도');
    expect(linkLabel('https://www.google.co.kr/maps/place/x')).toBe('구글 지도');
    expect(linkLabel('https://naver.me/x')).toBe('네이버 지도');
    expect(linkLabel('https://www.booking.com/hotel')).toBe('booking.com');
  });

  it('구글 지도 검색 주소는 이름으로 찾는다', () => {
    expect(mapsSearchUrl({ name: '파리', area: '프랑스', lat: 1, lon: 2 })).toBe('https://www.google.com/maps/search/?api=1&query=%ED%8C%8C%EB%A6%AC%20%ED%94%84%EB%9E%91%EC%8A%A4');
  });
});
