import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "개인정보처리방침 · work-erp" };

/** 공개 개인정보처리방침 (구글 OAuth 브랜딩 필수 항목) */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-10 leading-relaxed">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="text-sm text-muted">시행일: 2026년 11월 5일</p>

      <h2 className="section-title">1. 운영 목적</h2>
      <p>work-erp는 운영자 본인의 강의 일정과 강의료를 관리하기 위한 개인용 앱입니다.</p>

      <h2 className="section-title">2. 처리하는 정보</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>로그인 정보: 이메일 주소, 비밀번호(암호화되어 인증 서비스에 저장)</li>
        <li>사용자가 입력한 강의 일정, 강의료, 수령 기록, 메모</li>
        <li>사용자가 연결한 경우: 구글 계정 이메일, 구글 캘린더 접근용 토큰(암호화하여 저장)</li>
      </ul>

      <h2 className="section-title">3. 구글 사용자 데이터 이용</h2>
      <p>
        구글 캘린더 연동은 사용자가 직접 연결한 경우에만 동작합니다. 앱은
        <code className="mx-1">calendar.app.created</code> 권한만 요청하며, 앱이 만든 &lsquo;강의 일정(ERP)&rsquo; 캘린더에
        사용자의 강의 일정을 생성·수정·삭제하는 용도로만 사용합니다. 사용자의 다른 캘린더나 일정은 읽지 않습니다.
        구글에서 받은 정보는 이 목적 외에 사용하지 않으며, 제3자에게 제공·판매하지 않고, 광고에 사용하지 않습니다.
        work-erp의 구글 API 데이터 사용은 Google API 서비스 사용자 데이터 정책(제한적 사용 요구사항 포함)을 따릅니다.
      </p>

      <h2 className="section-title">4. 보관과 삭제</h2>
      <p>
        정보는 Supabase(데이터베이스)와 Vercel(웹 호스팅)에 저장·처리됩니다. 사용자는 앱의 &lsquo;연동&rsquo; 화면에서 언제든
        구글 연결을 해제할 수 있으며, 해제 시 저장된 구글 토큰을 삭제하고 구글 권한을 취소합니다. 구글 계정 설정
        (myaccount.google.com/permissions)에서도 직접 권한을 취소할 수 있습니다.
      </p>

      <h2 className="section-title">5. 문의</h2>
      <p>운영자에게 직접 문의해주세요.</p>

      <p className="text-sm">
        <Link href="/about" className="underline">← work-erp 소개</Link>
      </p>
    </main>
  );
}
