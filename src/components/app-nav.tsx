"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 상단 메뉴. 기능을 추가하면 여기에 한 줄 추가. */
export const NAV = [
  { href: "/", label: "대시보드" },
  { href: "/lectures", label: "일정" },
  { href: "/share-settings", label: "공유" },
] as const;

export function AppNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-md px-3 py-1.5 ${active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:text-fg"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
