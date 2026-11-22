import { describe, expect, it } from "vitest";
import { applyNavPrefs, cleanNavPrefs, visibleNav, type NavItem } from "./nav-items";

const ITEMS: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/a", label: "A" },
  { href: "/b", label: "B" },
  { href: "/c", label: "C" },
];

describe("applyNavPrefs", () => {
  it("저장이 없으면 기본 순서", () => {
    expect(visibleNav(ITEMS, null).map((i) => i.href)).toEqual(["/", "/a", "/b", "/c"]);
  });
  it("저장된 순서대로, 숨긴 것은 빼고", () => {
    const prefs = [
      { href: "/c", hidden: false },
      { href: "/", hidden: false },
      { href: "/a", hidden: true },
      { href: "/b", hidden: false },
    ];
    expect(visibleNav(ITEMS, prefs).map((i) => i.href)).toEqual(["/c", "/", "/b"]);
  });
  it("저장 뒤에 생긴 새 메뉴는 뒤에 붙고, 없어진 메뉴는 무시", () => {
    const prefs = [
      { href: "/b", hidden: false },
      { href: "/gone", hidden: false },
      { href: "/", hidden: false },
    ];
    expect(applyNavPrefs(ITEMS, prefs).map((i) => i.href)).toEqual(["/b", "/", "/a", "/c"]);
  });
  it("전부 숨겨도 맨 앞 하나는 보인다", () => {
    const prefs = ITEMS.map((i) => ({ href: i.href, hidden: true }));
    expect(visibleNav(ITEMS, prefs)).toHaveLength(1);
  });
});

describe("cleanNavPrefs", () => {
  it("모르는 메뉴·중복·이상한 값 제거", () => {
    expect(
      cleanNavPrefs(ITEMS, [
        { href: "/a", hidden: true },
        { href: "/a", hidden: false },
        { href: "https://evil.example", hidden: false },
        { href: "/b", hidden: "yes" },
        null,
      ]),
    ).toEqual([
      { href: "/a", hidden: true },
      { href: "/b", hidden: false },
    ]);
    expect(cleanNavPrefs(ITEMS, "x")).toBeNull();
  });
});
