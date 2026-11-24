"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { backupNow } from "../actions";
import type { RecentBackups } from "../queries";
import { weekLabelOf } from "../backup";

const when = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const kb = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/** 설정 > 백업: 최근 백업 목록과 '지금 백업하기' */
export function BackupPanel({ recent }: { recent: RecentBackups }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string | null } | null>(null);

  const run = () =>
    start(async () => {
      setMsg(null);
      const r = await backupNow();
      if (r.ok) {
        setMsg({ ok: true, text: `백업했어요: ${r.summary}`, link: r.link });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });

  const latest = recent.ok ? recent.files[0] : undefined;

  return (
    <div className="space-y-3">
      {recent.ok && recent.warning && <p className="text-sm text-danger">⚠️ {recent.warning}</p>}
      {!recent.ok ? (
        <p className="text-sm text-danger">{recent.error}</p>
      ) : latest ? (
        <p className="text-sm">
          마지막 백업: <b>{when(latest.createdTime)}</b>
        </p>
      ) : (
        <p className="text-sm text-warn">아직 백업이 없어요. 아래 버튼으로 첫 백업을 만들어 두세요.</p>
      )}

      <button type="button" onClick={run} disabled={pending} className="btn-primary">
        {pending ? "백업 중…" : "지금 백업하기"}
      </button>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
          {msg.link && (
            <>
              {" "}
              <a href={msg.link} target="_blank" rel="noreferrer" className="underline">
                드라이브에서 보기
              </a>
            </>
          )}
        </p>
      )}

      {recent.ok && recent.files.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {recent.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {when(f.createdTime)}
                {weekLabelOf(f.name) && <span className="ml-2 text-muted">{weekLabelOf(f.name)}</span>}
              </span>
              <span className="flex items-center gap-3 text-muted">
                {kb(f.size)}
                {f.webViewLink && (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="underline">
                    열기
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
