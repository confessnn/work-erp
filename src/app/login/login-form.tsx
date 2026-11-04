"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <form action={mode === "in" ? inAction : upAction} className="card space-y-4">
      <label className="field">
        <span>이메일</span>
        <input name="email" type="email" required autoComplete="email" className="input" />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "up" ? 8 : undefined}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          className="input"
        />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.message && <p className="text-sm text-success">{state.message}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "처리 중…" : mode === "in" ? "로그인" : "가입하기"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="w-full text-sm text-muted underline"
      >
        {mode === "in" ? "처음이신가요? 가입하기" : "이미 계정이 있어요. 로그인"}
      </button>
    </form>
  );
}
