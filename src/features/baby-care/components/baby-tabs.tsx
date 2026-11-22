import Link from "next/link";

/** 아기 메뉴 안의 탭: 육아 기록 / 사진 */
export function BabyTabs({ active }: { active: "care" | "photos" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-full px-4 py-1.5 ${on ? "bg-accent-soft font-semibold" : "text-muted"}`}>
      {label}
    </Link>
  );
  return (
    <nav className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm">
      {tab("/baby/care", "육아 기록", active === "care")}
      {tab("/baby", "사진", active === "photos")}
    </nav>
  );
}
