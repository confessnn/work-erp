import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · work-erp" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">work-erp</h1>
      <p className="mb-8 text-sm text-muted">강의 일정 · 강의료 관리</p>
      <LoginForm />
    </main>
  );
}
