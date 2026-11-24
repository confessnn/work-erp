import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 기본 보안 헤더. CSP 는 여기 넣지 않는다 (아기 사진 원본 경로가 자체 CSP sandbox 를 보내므로 덮어쓰지 않게).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // 다른 사이트가 ERP 를 프레임에 넣어 클릭을 속이지 못하게
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, // 외부 링크로 ERP 주소·토큰이 새지 않게
        ],
      },
    ];
  },
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
