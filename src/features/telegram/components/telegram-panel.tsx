"use client";

import { useState, useTransition } from "react";
import { saveTelegramSettings, sendTelegramTest, startTelegramLink, unlinkTelegram } from "../actions";
import type { TelegramLink } from "../queries";

/** 연동 화면: 텔레그램 연결 / 알림 설정 / 시험 알림 / 연결 해제 */
export function TelegramPanel({ link }: { link: TelegramLink | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [opened, setOpened] = useState(false);

  const connect = () =>
    start(async () => {
      setMsg(null);
      const r = await startTelegramLink();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setOpened(true);
      // 텔레그램 앱(또는 웹)이 열리고, '시작'을 누르면 연결된다
      window.location.href = r.url;
    });

  if (!link) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          연결하면 텔레그램 <b>@work_erp_bot</b>이 매일 아침 <b>오늘 할 일·새 공고 요약</b>과 <b>일정 1시간 전 알림</b>을 보내 드려요.
          강의료 같은 금액은 보내지 않아요.
        </p>
        <button type="button" onClick={connect} disabled={pending} className="btn-primary">
          {pending ? "준비 중…" : "텔레그램 연결"}
        </button>
        {opened && (
          <p className="text-muted">
            텔레그램이 열리면 아래 <b>시작(START)</b>을 누르세요. &quot;ERP와 연결했어요&quot;가 오면 이 화면을 새로고침하세요. (10분 안에 눌러야
            해요)
          </p>
        )}
        {msg && <p className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <p>
        <span className="badge badge-paid mr-2">연결됨</span>
        {link.tg_name || "텔레그램"} · {new Date(link.linked_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
      </p>

      <form action={(fd) => start(async () => { await saveTelegramSettings(fd); setMsg({ ok: true, text: "저장했어요." }); })} className="space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="notify_morning" defaultChecked={link.notify_morning} />
          매일 아침 9시 무렵 <b>오늘 할 일 · 새 공고 요약</b>
        </label>
        <fieldset className="space-y-1">
          <legend className="font-medium">일정 알림 (시작 1시간 전, 종일 일정은 오전 8시)</legend>
          {(
            [
              ["all", "내 강의·가족 일정 전부"],
              ["selected", "🔔 켠 일정만"],
              ["off", "받지 않기"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="notify_events" value={v} defaultChecked={link.notify_events === v} />
              {label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={pending} className="btn-primary">
          설정 저장
        </button>
      </form>

      <div className="flex flex-wrap gap-3 border-t border-line pt-3">
        <button
          type="button"
          disabled={pending}
          className="chip"
          onClick={() =>
            start(async () => {
              const r = await sendTelegramTest();
              setMsg(r.ok ? { ok: true, text: "시험 알림을 보냈어요. 텔레그램을 확인하세요." } : { ok: false, text: r.error });
            })
          }
        >
          시험 알림 보내기
        </button>
        <button
          type="button"
          disabled={pending}
          className="text-danger underline"
          onClick={() => {
            if (confirm("텔레그램 연결을 끊을까요?")) start(() => unlinkTelegram());
          }}
        >
          연결 끊기
        </button>
      </div>
      {msg && <p className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</p>}
    </div>
  );
}
