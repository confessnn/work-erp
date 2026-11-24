import { redirect } from "next/navigation";
import { applyNavPrefs, NAV } from "@/components/nav-items";
import { getFamilyRole } from "@/features/family/queries";
import { NavEditor } from "@/features/settings/components/nav-editor";
import { getNavPrefs } from "@/features/settings/queries";
import { BackupPanel } from "@/features/backup/components/backup-panel";
import { recentBackups } from "@/features/backup/queries";

/** 설정(관리자) 화면: 상단 메뉴 순서·숨김, 백업. 대표 계정만 */
export default async function SettingsPage() {
  if ((await getFamilyRole()).role !== "owner") redirect("/");
  const [prefs, backups] = await Promise.all([getNavPrefs(), recentBackups()]);
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
      <section className="card mt-4 space-y-3">
        <div>
          <h2 className="section-title">백업</h2>
          <p className="mt-1 text-sm text-muted">
            강의·할 일·가족 일정·육아 기록·서류 목록·공고를 파일 하나로 모아 구글 드라이브 <b>work-erp/백업/월(예: 2026-11)</b> 폴더에
            주차별로 저장해요. 매주 월요일 새벽 3시에 자동으로 하고, 지우지 않고 계속 쌓아요(1년에 약 45MB). 파일 하나에 그 시점의 기록이
            전부 들어 있어요. 사진·서류 파일 자체는 이미 드라이브에 있어서 목록만 담아요.
          </p>
        </div>
        <BackupPanel recent={backups} />
      </section>
    </>
  );
}
