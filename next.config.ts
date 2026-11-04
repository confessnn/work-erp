import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 페이지가 로그인 사용자 데이터를 읽으므로 Cache Components 는 쓰지 않는다 (요청마다 렌더링).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
