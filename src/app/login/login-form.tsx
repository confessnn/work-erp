"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "./actions";

/**
 * 로그인만 한다. 새 가입은 Supabase 설정에서 막아 두었고, 계정은 대표가 Supabase 대시보드에서 만들어 준다.
 * next: 로그인 후 돌아갈 주소 (초대 화면에서만 씀)
 */
export function LoginForm({ next }: { next?: string } = {}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="card space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="field">
        <span>이메일</span>
        <input name="email" type="email" required autoComplete="email" className="input" />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "처리 중…" : "로그인"}
      </button>
      <p className="text-center text-sm text-muted">계정이 없으면 ERP 관리자에게 만들어 달라고 해 주세요.</p>
    </form>
  );
}
