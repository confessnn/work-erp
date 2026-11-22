import Link from "next/link";

/** 아기 메뉴 안의 탭: 육아 기록 / 패턴 / 성장 / 할 일 / 사진 */
export function BabyTabs({ active }: { active: "care" | "pattern" | "growth" | "todos" | "photos" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`shrink-0 rounded-full px-3 py-1.5 sm:px-4 ${on ? "bg-accent-soft font-semibold" : "text-muted"}`}>
      {label}
    </Link>
  );
  return (
    <nav className="inline-flex max-w-full overflow-x-auto rounded-full border border-line bg-surface p-0.5 text-sm whitespace-nowrap [scrollbar-width:none]">
      {tab("/baby/care", "육아 기록", active === "care")}
      {tab("/baby/pattern", "패턴", active === "pattern")}
      {tab("/baby/growth", "성장", active === "growth")}
      {tab("/baby/todos", "할 일", active === "todos")}
      {tab("/baby", "사진", active === "photos")}
    </nav>
  );
}
