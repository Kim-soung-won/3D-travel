// 수단 아이콘(24×24 선 그림). React 밖(지도 마커)에서도 쓰려고 SVG 문자열로 둔다.
import type { Mode } from '../geo/modes';

const wrap = (body: string) =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const MODE_ICON: Record<Mode, string> = {
  plane: wrap('<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4-4"/>'),
  bus: wrap('<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><circle cx="8" cy="20" r="1.5"/><circle cx="16" cy="20" r="1.5"/>'),
  car: wrap('<path d="M5 17v-6l2-5h10l2 5v6z"/><path d="M5 11h14"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>'),
  subway: wrap('<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12"/><circle cx="9.5" cy="13.5" r="1"/><circle cx="14.5" cy="13.5" r="1"/><path d="m8 21 2-4m6 4-2-4"/>'),
  walk: wrap('<circle cx="13" cy="4" r="2"/><path d="m13 7-2 6 3 3v5"/><path d="m11 13-3 2"/><path d="m13 9 3 3h3"/><path d="m11 16-2 5"/>'),
};
