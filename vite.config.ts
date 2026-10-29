/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // 파일 단위 모듈 캐시는 import.meta.glob에 새 파일(도시 데이터)이 생겨도 옛 결과를 써서, 새 도시를 빼고 통과시킨다
    fsModuleCache: false,
  },
});
