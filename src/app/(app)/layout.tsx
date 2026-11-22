import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { BID_VIEWER_NAV, MEMBER_NAV, NAV, visibleNav } from "@/components/nav-items";
import { getNavPrefs } from "@/features/settings/queries";
import { getBidViewer } from "@/features/bid-viewer/queries";
import { signOut } from "@/app/login/actions";
import { getFamilyRole } from "@/features/family/queries";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SiteHeader } from "@/components/site-header";

/** 로그인 후 화면 공통 레이아웃. 새 기능 메뉴는 components/app-nav.tsx 의 NAV 에 추가. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // 초대받은 가족은 가족 달력 메뉴만 본다 (데이터는 DB RLS가 따로 막는다)
  const [role, viewer, h] = await Promise.all([getFamilyRole(), getBidViewer(), headers()]);
  // 공고 열람자(동생)는 공고 화면만. 다른 주소로 들어오면 공고 화면으로 보낸다 (데이터는 DB RLS가 따로 막는다)
  if (viewer && !(h.get("x-pathname") ?? "").startsWith("/bids")) redirect("/bids");
  const owner = !viewer && role.role === "owner";
  // 대표 계정은 설정 화면에서 정한 순서·숨김을 적용한다
  const items = viewer ? BID_VIEWER_NAV : role.role === "member" ? MEMBER_NAV : visibleNav(NAV, await getNavPrefs());
  return (
    <>
      <SiteHeader>
        <span className="hidden text-[17px] font-extrabold tracking-wide text-fg sm:inline">WORK ERP</span>
        <AppNav items={items} />
        {owner && (
          <Link href="/settings" prefetch={false} aria-label="설정" title="설정" className="ml-auto shrink-0 rounded-full px-2 py-1 text-lg text-muted hover:bg-fg/5 hover:text-fg">
            ⚙
          </Link>
        )}
        <form action={signOut} className={owner ? "" : "ml-auto"}>
          <button type="submit" className="whitespace-nowrap text-sm text-muted hover:underline">로그아웃</button>
        </form>
      </SiteHeader>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">{children}</main>
      <ScrollReveal />
    </>
  );
}
