"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setPaid } from "../actions";

/**
 * 수령 / 미수령 버튼. 받을 강의료를 입력하지 않은 미수령 일정은 누를 수 없고,
 * 대신 강의료를 입력하러 가는 링크를 보여 준다.
 */
export function PaidToggle({ id, paid, hasFee = true }: { id: string; paid: boolean; hasFee?: boolean }) {
  const [pending, start] = useTransition();
  if (!paid && !hasFee) {
    return (
      <Link href={`/lectures/${id}`} className="badge text-muted underline" title="강의료를 입력하면 수령 체크를 할 수 있어요">
        강의료 입력
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setPaid(id, !paid))}
      className={`badge ${paid ? "badge-paid" : "badge-unpaid"} ${pending ? "opacity-50" : ""}`}
      title={paid ? "누르면 미수령으로 되돌립니다" : "누르면 수령 처리합니다"}
    >
      {paid ? "✓ 수령" : "미수령"}
    </button>
  );
}
