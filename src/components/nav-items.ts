// 상단 메뉴 목록. 기능을 추가하면 NAV 에 한 줄 추가 (설정 화면의 순서·숨김은 사용자가 따로 정한다).
// 화면 부품(app-nav.tsx, 'use client')과 나눠 둬야 서버(레이아웃)에서 순서를 바꿀 수 있다.

export type NavItem = { href: string; label: string };

/** 대표 계정의 기본 메뉴 (기본 순서) */
export const NAV: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/lectures", label: "일정" },
  { href: "/records", label: "기록" },
  { href: "/documents", label: "서류함" },
  { href: "/baby/care", label: "임채현" },
  { href: "/bids", label: "공고" },
  { href: "/content", label: "콘텐츠" },
  { href: "/tools", label: "수업도구" },
  { href: "/share-settings", label: "공유" },
  { href: "/integrations", label: "연동" },
  { href: "/brain", label: "세컨드브레인" },
  { href: "/lab", label: "연구소" },
];

/** 초대받은 가족 계정의 메뉴 */
export const MEMBER_NAV: NavItem[] = [
  { href: "/todos", label: "할 일" },
  { href: "/family", label: "가족 달력" },
  { href: "/baby/care", label: "임채현" },
];

/** 초대받은 공고 열람자(동생) 계정의 메뉴 */
export const BID_VIEWER_NAV: NavItem[] = [{ href: "/bids", label: "한일ENG 공고" }];

/** 설정 화면에서 저장하는 메뉴 설정 (순서대로) */
export type NavPref = { href: string; hidden: boolean };

/**
 * 저장된 순서·숨김을 메뉴에 적용한다.
 * - 저장된 순서대로 놓고, 저장 뒤에 새로 생긴 메뉴는 기본 순서대로 뒤에 붙인다 (새 기능이 숨어 버리지 않게)
 * - 없어진 메뉴의 설정은 무시한다
 * - 전부 숨겨도 대시보드는 남긴다 (메뉴가 비지 않게)
 */
export function applyNavPrefs(items: NavItem[], prefs: NavPref[] | null | undefined): (NavItem & { hidden: boolean })[] {
  const byHref = new Map(items.map((i) => [i.href, i]));
  const seen = new Set<string>();
  const out: (NavItem & { hidden: boolean })[] = [];
  for (const p of prefs ?? []) {
    const item = byHref.get(p.href);
    if (!item || seen.has(p.href)) continue;
    seen.add(p.href);
    out.push({ ...item, hidden: !!p.hidden });
  }
  for (const item of items) if (!seen.has(item.href)) out.push({ ...item, hidden: false });
  if (out.length && out.every((i) => i.hidden)) out[0] = { ...out[0], hidden: false };
  return out;
}

/** 화면에 보일 메뉴 (숨긴 것 제외) */
export const visibleNav = (items: NavItem[], prefs: NavPref[] | null | undefined): NavItem[] =>
  applyNavPrefs(items, prefs)
    .filter((i) => !i.hidden)
    .map(({ href, label }) => ({ href, label }));

/** 저장 전에 확인: 아는 메뉴만, 중복 없이 */
export function cleanNavPrefs(items: NavItem[], raw: unknown): NavPref[] | null {
  if (!Array.isArray(raw)) return null;
  const known = new Set(items.map((i) => i.href));
  const seen = new Set<string>();
  const out: NavPref[] = [];
  for (const r of raw) {
    const href = typeof r?.href === "string" ? r.href : "";
    if (!known.has(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, hidden: r.hidden === true });
  }
  return out;
}
