"use client";

import { useState, useTransition } from "react";
import { createVaultAction, exportRecordsAction, linkVaultAction, syncVaultAction, unlinkVaultAction } from "../actions";

type Msg = { ok: boolean; text: string } | null;

function useAction() {
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
    });
  return { msg, pending, run };
}

const Message = ({ msg }: { msg: Msg }) =>
  msg ? <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null;

/** 볼트가 없을 때: 새로 만들기 또는 이미 있는 드라이브 폴더 연결 */
export function VaultSetup() {
  const { msg, pending, run } = useAction();
  const [link, setLink] = useState("");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">처음이라면: 새 볼트 만들기</h3>
        <p className="text-sm text-muted">
          드라이브에 <b>work-erp/세컨드브레인</b> 폴더를 만들고 PARA 폴더(0 Inbox, 1 Projects, 2 Areas, 3 Resources, 4 Archives)와 ERP 기록 폴더를 넣어요.
        </p>
        <button type="button" disabled={pending} onClick={() => run(createVaultAction)} className="btn-primary text-sm">
          {pending ? "만드는 중…" : "새 볼트 만들기"}
        </button>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">이미 옵시디언 볼트가 드라이브에 있다면: 폴더 연결</h3>
        <p className="text-sm text-muted">드라이브에서 볼트 폴더를 열고 주소창의 링크를 붙여 넣어 주세요.</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => linkVaultAction(link));
          }}
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            aria-label="볼트 폴더 링크"
            className="input flex-1"
          />
          <button type="submit" disabled={pending || !link.trim()} className="btn-line shrink-0 text-sm">
            {pending ? "읽는 중…" : "연결"}
          </button>
        </form>
      </div>
      <Message msg={msg} />
    </div>
  );
}

/** 볼트가 있을 때: 동기화 · ERP 기록·할 일 내보내기 */
export function BrainSyncButtons() {
  const { msg, pending, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(syncVaultAction)} className="btn-primary text-sm">
          {pending ? "처리하는 중…" : "동기화"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(exportRecordsAction)} className="btn-line text-sm">
          ERP 기록·할 일 내보내기
        </button>
      </div>
      <Message msg={msg} />
    </div>
  );
}

/** 연결 끊기 (드라이브의 노트는 지우지 않는다) */
export function UnlinkVaultButton() {
  const { msg, pending, run } = useAction();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("볼트 연결을 끊을까요? ERP에 받아 둔 노트 사본만 지우고, 드라이브의 노트는 그대로 둬요.")) run(unlinkVaultAction);
        }}
        className="btn-ghost text-sm text-danger"
      >
        {pending ? "끊는 중…" : "볼트 연결 끊기"}
      </button>
      <Message msg={msg} />
    </div>
  );
}
