"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "./nav-items";

// 메뉴 목록은 nav-items.ts (서버에서 설정 화면의 순서·숨김을 적용한 뒤 넘겨 준다)

export function AppNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 text-sm whitespace-nowrap [scrollbar-width:none]">
      {items.map((n) => {
        // 가족 일정 화면(/family/...)도 '일정' 탭으로 친다
        // 같은 메뉴 안의 다른 화면(예: /baby 사진, /baby/care 기록)에서도 메뉴가 켜지도록 첫 경로 칸으로 비교
        const section = `/${n.href.split("/")[1]}`;
        const active = n.href === "/" ? path === "/" : path.startsWith(section) || (n.href === "/lectures" && path.startsWith("/family"));
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
