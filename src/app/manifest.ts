import type { MetadataRoute } from "next";

/** 휴대폰 홈 화면에 추가했을 때 앱처럼 열리게 하는 설정 (/manifest.webmanifest) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "work-erp",
    short_name: "ERP",
    description: "강의 일정과 강의료 관리",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffaf0",
    theme_color: "#fffaf0",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // 앱 아이콘을 길게 눌러 바로 가는 길. 달력만 여는 아이콘을 따로 두려면
    // /calendar/manifest.webmanifest 를 홈 화면에 추가한다 (id·scope 가 달라 다른 앱으로 잡힌다)
    shortcuts: [
      { name: "달력", short_name: "달력", url: "/calendar/widget", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
