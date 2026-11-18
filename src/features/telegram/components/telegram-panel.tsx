"use client";

import { useState, useTransition } from "react";
import { confirmTelegram, disconnectTelegram, saveTelegramToken, testTelegram } from "../actions";

export type TelegramState = {
  bot_username: string | null;
  chat_id: number | null;
  link_code: string | null;
  linked_at: string | null;
  last_sent_at: string | null;
  last_error: string | null;
} | null;

const when = (at: string | null) =>
  at ? new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

export function TelegramPanel({ state }: { state: TelegramState }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setMsg(await fn()));

  const linked = !!state?.chat_id && !editing;
  const waiting = !!state?.link_code && !state?.chat_id && !editing;

  return (
    <div className="space-y-3 text-sm">
      {linked ? (
        <div className="space-y-2">
          <p>
            <b className="text-success">연결됨</b> · {state?.bot_username ? `@${state.bot_username}` : "봇"} · 연결 {when(state?.linked_at ?? null)}
            {state?.last_sent_at && ` · 마지막 발송 ${when(state.last_sent_at)}`}
          </p>
          {state?.last_error && <p className="text-danger">최근 발송 실패: {state.last_error} (실패한 날은 메일로 대신 보냅니다)</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(testTelegram)}>
              시험 메시지 보내기
            </button>
            <button type="button" className="chip" disabled={pending} onClick={() => setEditing(true)}>
              다른 봇으로 바꾸기
            </button>
            <button type="button" className="chip" disabled={pending} onClick={() => run(disconnectTelegram)}>
              연결 끊기
            </button>
          </div>
        </div>
      ) : waiting ? (
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            텔레그램에서 봇 대화방을 열어 <b>시작(START)</b>을 누르세요.{" "}
            {state?.bot_username && (
              <a className="underline" href={`https://t.me/${state.bot_username}?start=${state.link_code}`} target="_blank" rel="noreferrer">
                @{state.bot_username} 열기
              </a>
            )}
            <br />
            <span className="text-muted">
              위 링크로 열면 코드가 자동으로 함께 가요. 직접 열었다면 봇에게 <code className="font-mono">{state?.link_code}</code> 를 보내 주세요.
            </span>
          </li>
          <li>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(confirmTelegram)}>
              {pending ? "확인 중…" : "연결 확인"}
            </button>
          </li>
          <li className="list-none">
            <button type="button" className="chip" disabled={pending} onClick={() => setEditing(true)}>
              토큰 다시 넣기
            </button>
          </li>
        </ol>
      ) : (
        <form
          className="space-y-2"
          action={(form) =>
            start(async () => {
              const r = await saveTelegramToken(form);
              setMsg(r);
              if (r.ok) setEditing(false);
            })
          }
        >
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>텔레그램에서 <b>@BotFather</b>를 찾아 대화를 열고 <code className="font-mono">/newbot</code>을 보내요.</li>
            <li>봇 이름(예: ERP 비서)과 아이디(영문, 끝이 bot, 예: my_erp_bot)를 차례로 보내요.</li>
            <li>BotFather가 주는 <b>토큰</b>(숫자:영문 긴 글자)을 복사해 아래에 붙여 넣어요. 토큰은 비밀번호처럼 다른 곳에 올리지 마세요.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input name="token" type="password" autoComplete="off" className="input min-w-0 flex-1" placeholder="123456789:AA..." />
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "확인 중…" : "토큰 저장"}
            </button>
            {editing && (
              <button type="button" className="chip" onClick={() => setEditing(false)}>
                취소
              </button>
            )}
          </div>
          <p className="text-xs text-muted">토큰은 DB 금고(Vault)에 암호화해 저장하고 화면에 다시 보여 주지 않습니다.</p>
        </form>
      )}
      {msg && <p className={msg.ok ? "text-success" : "text-danger"}>{msg.message}</p>}
    </div>
  );
}
