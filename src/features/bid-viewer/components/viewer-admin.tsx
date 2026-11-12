"use client";

import { useActionState, useState, useTransition } from "react";
import { createBidViewerInvite, deleteBidViewerInvite, removeBidViewer } from "../actions";
import type { BidViewerInvite, BidViewerMember } from "../queries";

/** 공고함 주인 화면: 동생 초대 링크 만들기 · 참여한 사람 관리 */
export function ViewerAdmin({ origin, invites, members }: { origin: string; invites: BidViewerInvite[]; members: BidViewerMember[] }) {
  const [state, action, pending] = useActionState(createBidViewerInvite, {});
  const [busy, start] = useTransition();

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        초대받은 사람은 자기 이메일로 가입한 뒤 <b>나라장터 한일ENG 공고만</b> 봅니다(불가 판정 포함). 강의·금액·서류·사진·원가계산·국방부
        공고는 보이지 않고, 관심·제외 표시는 그 사람 것만 따로 저장돼 내 공고함에는 영향이 없습니다.
      </p>

      {members.length > 0 && (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.member_id} className="flex flex-wrap items-center gap-2">
              <span className="badge badge-paid">참여 중</span>
              <span className="font-medium">{m.label}</span>
              <span className="text-muted">{new Date(m.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}부터</span>
              <button
                type="button"
                disabled={busy}
                className="ml-auto text-danger underline"
                onClick={() => {
                  if (confirm(`${m.label}님과 공고 공유를 끊을까요? 바로 볼 수 없게 됩니다.`)) start(() => removeBidViewer(m.member_id));
                }}
              >
                공유 끊기
              </button>
            </li>
          ))}
        </ul>
      )}

      {invites.map((i) => (
        <InviteRow key={i.token} url={`${origin}/join/bids/${i.token}`} label={i.label} expires={i.expires_at} onDelete={() => start(() => deleteBidViewerInvite(i.token))} />
      ))}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <label className="field flex-1">
          <span>초대할 사람 이름</span>
          <input name="label" defaultValue="동생" className="input" />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "만드는 중…" : "초대 링크 만들기"}
        </button>
      </form>
      {state.error && <p className="text-danger">{state.error}</p>}
    </div>
  );
}

function InviteRow({ url, label, expires, onDelete }: { url: string; label: string; expires: string; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}님 초대 링크</span>
        <span className="text-muted">
          {new Date(expires).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}까지 · 한 번만 사용
        </span>
        <button type="button" onClick={onDelete} className="ml-auto text-danger underline">
          삭제
        </button>
      </div>
      <div className="flex gap-2">
        <input readOnly value={url} className="input text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              /* 직접 선택해서 복사 */
            }
          }}
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <p className="text-xs text-muted">카톡으로 보내 주세요. 동생이 링크를 열어 가입(또는 로그인)한 뒤 &apos;참여하기&apos;를 누르면 됩니다.</p>
    </div>
  );
}
