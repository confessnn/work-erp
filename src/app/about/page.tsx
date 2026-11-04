import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "work-erp 소개" };

/** 공개 소개 페이지 (구글 OAuth 브랜딩의 '앱 홈페이지') */
export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-bold">work-erp</h1>
      <p>
        work-erp는 강사 개인이 자신의 강의 일정과 강의료(원천징수, 수령 여부)를 관리하기 위해 만든 개인용 웹 앱입니다.
        가입한 본인만 사용하며, 일반에 서비스하지 않습니다.
      </p>
      <h2 className="section-title">구글 캘린더 연동</h2>
      <p>
        사용자가 직접 연결한 경우에만, work-erp에 입력한 강의 일정을 사용자의 구글 계정에 새로 만든
        &lsquo;강의 일정(ERP)&rsquo; 캘린더에 기록합니다. 이 앱은 자신이 만든 캘린더에만 접근하며
        (권한: calendar.app.created), 사용자의 다른 캘린더나 일정은 읽거나 수정하지 않습니다.
      </p>
      <p className="flex gap-4 text-sm">
        <Link href="/privacy" className="underline">개인정보처리방침</Link>
        <Link href="/login" className="underline">로그인</Link>
      </p>
    </main>
  );
}
