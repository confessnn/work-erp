"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

/** 상단 메뉴. 기능을 추가하면 여기에 한 줄 추가. */
export const NAV: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/lectures", label: "일정" },
  { href: "/records", label: "기록" },
  { href: "/documents", label: "서류함" },
  { href: "/baby", label: "아기" },
  { href: "/bids", label: "공고" },
  { href: "/content", label: "콘텐츠" },
  { href: "/tools", label: "수업도구" },
  { href: "/share-settings", label: "공유" },
  { href: "/integrations", label: "연동" },
];

/** 초대받은 가족 계정의 메뉴 */
export const MEMBER_NAV: NavItem[] = [{ href: "/family", label: "가족 달력" }];

/** 초대받은 공고 열람자(동생) 계정의 메뉴 */
export const BID_VIEWER_NAV: NavItem[] = [{ href: "/bids", label: "한일ENG 공고" }];

export function AppNav({ items = NAV }: { items?: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 text-sm whitespace-nowrap [scrollbar-width:none]">
      {items.map((n) => {
        // 가족 일정 화면(/family/...)도 '일정' 탭으로 친다
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href) || (n.href === "/lectures" && path.startsWith("/family"));
        return (
          <Link
            key={n.href}
            href={n.href}
            // 메뉴 화면을 미리 만들지 않는다: 첫 화면을 열 때 서버가 메뉴 수만큼 화면을 더 만들어 휴대폰에서 느려진다
            prefetch={false}
            className={`rounded-full px-4 py-2 font-medium transition-colors duration-250 ${active ? "bg-accent font-semibold text-white" : "text-muted hover:bg-fg/5 hover:text-fg"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
