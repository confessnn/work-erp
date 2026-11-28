import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 서버 전용 모듈도 순수 함수는 테스트하므로, 테스트에서만 server-only 를 빈 모듈로
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    // tools/ 에 있는 순수 모듈(연구소 워커 설정 등)도 같이 검사한다
    include: ["src/**/*.test.ts", "tools/**/*.test.mjs"],
  },
});
