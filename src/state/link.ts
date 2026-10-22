// 경유지에 붙이는 바깥 링크(구글 지도 등). 공유 링크·파일로 남에게서 받은 값도 그대로 화면에 그리므로,
// http(s) 주소만 받는다. javascript: 같은 주소가 들어오면 누르는 순간 스크립트가 돌기 때문이다.
import type { Stop } from './route';

export const LINK_MAX = 500;

/** 쓸 수 있는 주소면 정리한 문자열, 아니면 null */
export function safeLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > LINK_MAX) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** 링크에 붙일 짧은 이름: "구글 지도", "네이버 지도", 아니면 사이트 주소 */
export function linkLabel(href: string): string {
  const host = new URL(href).hostname.replace(/^www\./, '');
  if (host === 'maps.app.goo.gl' || host === 'goo.gl' || /(^|\.)google\.[a-z.]+$/.test(host)) return '구글 지도';
  if (host === 'naver.me' || host.endsWith('map.naver.com')) return '네이버 지도';
  if (host.endsWith('map.kakao.com') || host === 'kko.to') return '카카오맵';
  return host;
}

/** 링크를 찾으러 갈 구글 지도 검색 주소. 이름과 보조 설명으로 찾는다 */
export function mapsSearchUrl(s: Pick<Stop, 'name' | 'area' | 'lat' | 'lon'>): string {
  const query = [s.name, s.area].filter(Boolean).join(' ').trim() || `${s.lat},${s.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
