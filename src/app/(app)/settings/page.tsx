import { redirect } from "next/navigation";
import { applyNavPrefs, NAV } from "@/components/nav-items";
import { getFamilyRole } from "@/features/family/queries";
import { NavEditor } from "@/features/settings/components/nav-editor";
import { getNavPrefs } from "@/features/settings/queries";

/** 설정(관리자) 화면: 상단 메뉴 순서·숨김. 대표 계정만 */
export default async function SettingsPage() {
  if ((await getFamilyRole()).role !== "owner") redirect("/");
  const prefs = await getNavPrefs();
  return (
    <>
      <h1 className="page-title">설정</h1>
      <section className="card space-y-3">
        <div>
          <h2 className="section-title">상단 메뉴</h2>
          <p className="mt-1 text-sm text-muted">▲▼로 순서를 바꾸고, 잘 안 쓰는 메뉴는 &apos;보이기&apos;를 꺼서 숨기세요.</p>
        </div>
        <NavEditor initial={applyNavPrefs(NAV, prefs)} />
      </section>
    </>
  );
}
