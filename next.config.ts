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
      {
        // 홈 화면 위젯 앱(APK). 안드로이드가 '설치' 로 받도록 종류를 정확히 알려 준다
        source: "/downloads/:file*.apk",
        headers: [{ key: "Content-Type", value: "application/vnd.android.package-archive" }],
      },
    ];
  },
  // kordoc(한글 문서 읽기)은 wasm 파일을 제 위치에서 읽으므로 번들하지 않는다.
  serverExternalPackages: ["kordoc"],
  // kordoc의 OCR·이미지용 선택 패키지는 쓰지 않는다 (ocr: false). 특히 onnxruntime-node(약 300MB)가
  // 함수에 실리면 Vercel 용량 한도(250MB)를 넘는다.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/**",
      "node_modules/onnxruntime-common/**",
      "node_modules/@huggingface/**",
      "node_modules/sharp/**",
      "node_modules/@img/**",
      "node_modules/zxing-wasm/**",
      "node_modules/@hyzyla/**",
    ],
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
