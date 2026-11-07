import { AppNav, MEMBER_NAV, NAV } from "@/components/app-nav";
import { signOut } from "@/app/login/actions";
import { getFamilyRole } from "@/features/family/queries";

/** 로그인 후 화면 공통 레이아웃. 새 기능 메뉴는 components/app-nav.tsx 의 NAV 에 추가. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 초대받은 가족은 가족 달력 메뉴만 본다 (데이터는 DB RLS가 따로 막는다)
  const role = await getFamilyRole();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center min-h-16 gap-4 px-4 py-3">
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">work-erp</span>
          <AppNav items={role.role === "member" ? MEMBER_NAV : NAV} />
          <form action={signOut} className="ml-auto">
            <button type="submit" className="whitespace-nowrap text-sm text-muted hover:underline">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">{children}</main>
    </>
  );
}
