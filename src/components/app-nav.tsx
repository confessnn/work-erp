"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

/** 상단 메뉴. 기능을 추가하면 여기에 한 줄 추가. */
export const NAV: NavItem[] = [
  { href: "/", label: "대시보드" },
  { href: "/lectures", label: "일정" },
  { href: "/family", label: "가족" },
  { href: "/documents", label: "서류함" },
  { href: "/baby", label: "아기" },
  { href: "/bids", label: "공고" },
  { href: "/share-settings", label: "공유" },
  { href: "/integrations", label: "연동" },
];

/** 초대받은 가족 계정의 메뉴 */
export const MEMBER_NAV: NavItem[] = [{ href: "/family", label: "가족 달력" }];

export function AppNav({ items = NAV }: { items?: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 text-sm whitespace-nowrap [scrollbar-width:none]">
      {items.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-full px-4 py-2 font-medium ${active ? "bg-accent-soft font-semibold" : "text-muted hover:text-fg"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
