"use client";

import { useActionState } from "react";
import { CopyField } from "@/features/share/components/copy-field";
import { createFamilyInvite, deleteFamilyInvite, removeFamilyMember } from "../actions";
import type { FamilyInvite, FamilyMember } from "../queries";

export function InviteForm() {
  const [state, action, pending] = useActionState(createFamilyInvite, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="field min-w-40 flex-1">
        <span>누구를 초대하나요</span>
        <input name="label" maxLength={30} placeholder="예: 아내" className="input" />
      </label>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "만드는 중…" : "초대 링크 만들기"}
      </button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function InviteList({ invites, origin }: { invites: FamilyInvite[]; origin: string }) {
  if (invites.length === 0) return null;
  return (
    <ul className="space-y-4">
      {invites.map((i) => (
        <li key={i.token} className="space-y-2">
          <CopyField label={`${i.label} 초대 링크 · ${new Date(i.expires_at).toLocaleDateString("ko-KR")}까지`} value={`${origin}/join/${i.token}`} />
          <button type="button" onClick={() => deleteFamilyInvite(i.token)} className="text-sm text-danger hover:underline">
            이 링크 취소
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MemberList({ members }: { members: FamilyMember[] }) {
  if (members.length === 0) return <p className="text-sm text-muted">아직 참여한 가족이 없어요.</p>;
  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.member_id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            <b>{m.label}</b>
            <span className="ml-2 text-muted">{new Date(m.created_at).toLocaleDateString("ko-KR")} 참여</span>
          </span>
          <button
            type="button"
            className="text-danger hover:underline"
            onClick={() => {
              if (confirm(`${m.label}님을 가족에서 내보낼까요? 가족 달력을 더 이상 볼 수 없게 돼요.`)) removeFamilyMember(m.member_id);
            }}
          >
            내보내기
          </button>
        </li>
      ))}
    </ul>
  );
}
