// 사전 데이터 형식. 도시 데이터는 LLM이 지식으로 생성한 것이라 검증되지 않았다.
// 좌표·노선·시간은 대략값으로만 쓰고, 화면에는 "AI 생성 데이터"임을 밝힌다.
// 형식 검사와 상식 검사(범위·역 간격·참조)는 src/data/data.test.ts.
import type { Mode } from '../geo/modes';

export type PlaceCategory = 'sight' | 'culture' | 'food' | 'shopping' | 'nature' | 'night';

export interface Station {
  /** 노선이 달라도 같은 역이면 이름을 똑같이 쓴다 (환승 판단에 쓴다) */
  name: string;
  lat: number;
  lon: number;
}

export interface TransitLine {
  id: string;
  /** 예: "2호선", "山手線 (야마노테선)" */
  name: string;
  /** 노선 고유색 hex */
  color: string;
  /** 순환선이면 마지막 역과 첫 역이 이어진다 */
  loop?: boolean;
  /** 노선 순서대로 */
  stations: Station[];
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: PlaceCategory;
  /** 머무는 시간 어림(분) */
  stayMin: number;
  /** 검색어. 한국어 위주, 현지어·영어 표기도 넣는다 */
  tags: string[];
  /** 한 문장 소개 */
  summary: string;
}

export interface CuratedRoute {
  id: string;
  title: string;
  /** 예: "첫 방문", "야경", "먹거리" */
  theme: string;
  length: 'half' | 'day';
  placeIds: string[];
  /** placeIds 사이 구간 수단. 길이는 placeIds.length - 1. 도시 화면 수단만 쓴다 */
  modes: Exclude<Mode, 'plane'>[];
  summary: string;
}

export interface CityData {
  id: string;
  name: string;
  country: string;
  center: { lat: number; lon: number };
  /** [서, 남, 동, 북] 경위도. 역·명소가 모두 이 안에 있어야 한다 */
  bbox: [number, number, number, number];
  /** 데이터 출처 표기 */
  source: string;
  lines: TransitLine[];
  places: Place[];
  routes: CuratedRoute[];
}

/** 도시 간 이동 참고값 (같은 쌍은 한 번만, 방향 무관) */
export interface IntercityLink {
  from: string;
  to: string;
  /** 비행 시간(분, 이륙~착륙). 직항이 흔하지 않으면 생략 */
  flightMin?: number;
  /** 철도·버스 등 지상 대안 */
  ground?: { mode: 'train' | 'bus' | 'car'; name: string; minutes: number }[];
  note?: string;
}
