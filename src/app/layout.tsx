import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "work-erp",
  description: "강의 일정과 강의료 관리",
  // 아이폰 '홈 화면에 추가' 후 주소창 없이 앱처럼 열기
  appleWebApp: { capable: true, title: "ERP", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f2f3",
  // 이 앱은 밝은 화면만 쓴다. 이걸 알려 주지 않으면 다크 모드 폰에서 CSS 가 올 때까지
  // 브라우저가 바탕을 검게 칠해, 열자마자 검은 화면이 잠깐 보인다.
  colorScheme: "light",
};

/** 폰트는 외부 CDN 이라 연결에만 한참 걸린다. 받는 동안 화면을 막지 않게 media="print" 로 받아 두고
 *  다 받으면 켠다. 받는 동안에는 애플 SD 고딕(아이폰)·맑은 고딕(윈도우)으로 먼저 보인다. */
const FONT_CSS = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const ENABLE_FONT = `(function(){var l=document.getElementById('font-pretendard');if(!l)return;` +
  `if(l.sheet){l.media='all';}else{l.addEventListener('load',function(){l.media='all';});}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased" style={{ backgroundColor: "#f2f2f3" }}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link id="font-pretendard" rel="stylesheet" href={FONT_CSS} media="print" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: ENABLE_FONT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
