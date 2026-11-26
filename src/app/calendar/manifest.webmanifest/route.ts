/**
 * 달력만 여는 홈 화면 앱 설정 (/calendar/manifest.webmanifest).
 *
 * 앱 전체 설정(app/manifest.ts, start_url "/" · scope "/")은 그대로 두고 따로 둔다.
 * 이미 홈 화면에 있는 ERP 앱은 start_url 과 id 가 "/" 그대로라 설치가 깨지지 않고,
 * 이 설정은 id·start_url 이 /calendar/widget 이라 안드로이드가 다른 앱으로 보고 아이콘을 따로 만든다.
 * scope 를 /calendar/ 로 좁게 둬서, 앱 전체 설정(scope "/")보다 이 주소에 더 잘 맞는 쪽이 된다.
 */
export const dynamic = "force-static";

const MANIFEST = {
  id: "/calendar/widget",
  name: "ERP 달력",
  short_name: "달력",
  description: "일정만 보는 달력 (금액 없음)",
  start_url: "/calendar/widget",
  scope: "/calendar/",
  // 주소창 없이 꽉 찬 화면으로. fullscreen 을 못 쓰는 기기는 standalone 으로 떨어진다
  display: "fullscreen",
  display_override: ["fullscreen", "standalone"],
  orientation: "any",
  background_color: "#f2f2f3",
  theme_color: "#f2f2f3",
  lang: "ko",
  // 아이콘은 앱과 같은 것을 쓴다
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(MANIFEST), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
