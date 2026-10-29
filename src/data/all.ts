// 테스트 전용: 모든 도시 데이터를 한꺼번에. 앱 코드에서는 index.ts의 loadCityData로 도시마다 불러온다.
import type { CityData } from './types';

const modules = import.meta.glob<CityData>('./cities/*.json', { eager: true, import: 'default' });

export const CITIES: CityData[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id));
