import { AppNav } from "@/components/app-nav";
import { signOut } from "@/app/login/actions";

/** 로그인 후 화면 공통 레이아웃. 새 기능 메뉴는 components/app-nav.tsx 의 NAV 에 추가. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <span className="hidden font-bold sm:inline">work-erp</span>
          <AppNav />
          <form action={signOut} className="ml-auto">
            <button type="submit" className="whitespace-nowrap text-sm text-muted hover:underline">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
