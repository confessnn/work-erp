import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav, BID_VIEWER_NAV, MEMBER_NAV, NAV } from "@/components/app-nav";
import { getBidViewer } from "@/features/bid-viewer/queries";
import { signOut } from "@/app/login/actions";
import { getFamilyRole } from "@/features/family/queries";

/** 로그인 후 화면 공통 레이아웃. 새 기능 메뉴는 components/app-nav.tsx 의 NAV 에 추가. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 초대받은 가족은 가족 달력 메뉴만 본다 (데이터는 DB RLS가 따로 막는다)
  const [role, viewer, h] = await Promise.all([getFamilyRole(), getBidViewer(), headers()]);
  // 공고 열람자(동생)는 공고 화면만. 다른 주소로 들어오면 공고 화면으로 보낸다 (데이터는 DB RLS가 따로 막는다)
  if (viewer && !(h.get("x-pathname") ?? "").startsWith("/bids")) redirect("/bids");
  const items = viewer ? BID_VIEWER_NAV : role.role === "member" ? MEMBER_NAV : NAV;
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center min-h-16 gap-4 px-4 py-3">
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">work-erp</span>
          <AppNav items={items} />
          <form action={signOut} className="ml-auto">
            <button type="submit" className="whitespace-nowrap text-sm text-muted hover:underline">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">{children}</main>
    </>
  );
}
