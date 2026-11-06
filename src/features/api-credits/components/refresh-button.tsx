"use client";

import { useTransition } from "react";
import { refreshCredits } from "../actions";

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => refreshCredits())} className={`chip text-sm ${pending ? "opacity-50" : ""}`}>
      {pending ? "갱신 중…" : "지금 갱신"}
    </button>
  );
}
