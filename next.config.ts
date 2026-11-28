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
        // public/ 의 그림은 Next 가 기본으로 "max-age=0, must-revalidate" 를 붙여서,
        // 화면을 열 때마다 파일 수만큼 서버에 다시 물어본다(내용이 같아도 왕복은 든다).
        // 연구소 얼굴 아이콘만 여섯 개라 휴대폰에서 그만큼 느려진다. 자주 바뀌지 않는 그림이니
        // 일주일 캐시하고, 그 뒤에는 있는 걸 먼저 보여 주면서 뒤에서 새로 받는다.
        // 그림을 바꾸면 다음 한 번은 옛것이 보일 수 있다 (그때는 파일 이름이나 ?v= 를 바꾼다).
        source: "/:dir(lab|icons)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
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
