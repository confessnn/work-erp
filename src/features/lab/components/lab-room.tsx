"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTask, deleteTask, setTaskState } from "../actions";
import { bodyOf, iconOf, ROSTER, seatPercent } from "../roster";
import { BOARD, firstLine, groupByState, openCount, STATE_LABEL, type LabTask, type TaskState } from "../tasks";
import type { Researcher } from "../types";

/** 몇 초마다 서버에서 다시 읽어 올지 (연구원이 보드를 고치면 보고 있던 화면도 따라 바뀐다) */
const REFRESH_MS = 5000;

const NEXT: Partial<Record<TaskState, TaskState>> = { queued: "running", running: "review", review: "done" };

/**
 * 연구소 화면.
 * - 넓은 화면: 연구실 그림 위의 연구원을 누른다
 * - 좁은 화면(폰): 같은 연구원을 얼굴 아이콘 목록으로 누른다
 * 누르면 팝업이 열리고, 적어서 보내면 그 연구원 앞으로 일이 쌓인다.
 */
export function LabRoom({ tasks }: { tasks: LabTask[] }) {
  const router = useRouter();
  const [who, setWho] = useState<Researcher | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  // 보고 있는 동안만 조용히 다시 읽는다 (탭을 가려 두면 쉰다)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    if (who) box.current?.focus();
  }, [who]);

  const close = () => {
    setWho(null);
    setText("");
    setError(null);
  };

  const send = () => {
    if (!who || !text.trim()) return;
    start(async () => {
      const r = await assignTask(who.id, text);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      close();
      router.refresh();
    });
  };

  const move = (id: string, state: TaskState) =>
    start(async () => {
      await setTaskState(id, state);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      await deleteTask(id);
      router.refresh();
    });

  const board = groupByState(tasks);

  return (
    <>
      {/* 넓은 화면: 연구실 그림 */}
      <div className="relative hidden overflow-hidden rounded-2xl border border-line sm:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- 도트 그림 한 장이라 최적화가 필요 없다 */}
        <img src="/lab/room.webp" alt="연구소" className="block w-full" />
        {ROSTER.map((r) => {
          const pos = seatPercent(r.id);
          if (!pos) return null;
          const n = openCount(tasks, r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setWho(r)}
              aria-label={`${r.name}에게 일 맡기기`}
              className="absolute -translate-y-1 cursor-pointer transition-transform duration-200 hover:-translate-y-2"
              style={pos}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 위와 같다 */}
              <img src={bodyOf(r.id)} alt="" className="block w-full" />
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium">
                {r.name}
                {n > 0 && <b className="ml-1 text-accent">{n}</b>}
              </span>
            </button>
          );
        })}
      </div>

      {/* 좁은 화면(폰): 같은 연구원을 목록으로 */}
      <ul className="space-y-2 sm:hidden">
        {ROSTER.map((r) => {
          const n = openCount(tasks, r.id);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setWho(r)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 128px 고정 도트 아이콘 */}
                <img src={iconOf(r.id)} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl bg-bg" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.name}</span>
                  <span className="block text-xs text-muted">{r.duty}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{n > 0 ? `${n}건` : "없음"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 작업 보드 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BOARD.map((s) => (
          <section key={s} className="rounded-2xl border border-line bg-surface p-3">
            <h3 className="flex items-baseline justify-between pb-2 text-sm font-bold">
              {STATE_LABEL[s]}
              <span className="text-xs font-normal text-muted">{board[s].length}</span>
            </h3>
            {board[s].length === 0 ? (
              <p className="py-2 text-center text-xs text-muted">없음</p>
            ) : (
              <ul className="space-y-2">
                {board[s].map((t) => {
                  const r = ROSTER.find((x) => x.id === t.researcher);
                  const next = NEXT[t.state];
                  return (
                    <li key={t.id} className="rounded-xl border border-line bg-bg p-2">
                      <p className="flex items-center gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 위와 같다 */}
                        <img src={iconOf(t.researcher)} alt="" width={20} height={20} className="h-5 w-5 rounded" />
                        <span className="text-[11px] text-muted">{r?.name ?? t.researcher}</span>
                      </p>
                      <p className="mt-1 text-sm">{firstLine(t.title)}</p>
                      {t.result && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{t.result}</p>}
                      <p className="mt-1.5 flex gap-1">
                        {next && (
                          <button type="button" disabled={busy} onClick={() => move(t.id, next)} className="chip px-2 py-0.5 text-[11px]">
                            {STATE_LABEL[next]}로
                          </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => remove(t.id)} className="chip px-2 py-0.5 text-[11px] text-muted">
                          지우기
                        </button>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* 일 맡기는 팝업 */}
      {who && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-xl rounded-t-2xl border border-line bg-surface p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 위와 같다 */}
              <img src={iconOf(who.id)} alt="" width={40} height={40} className="h-10 w-10 rounded-xl bg-bg" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{who.name}</p>
                <p className="truncate text-xs text-muted">{who.duty}</p>
              </div>
              <button type="button" onClick={close} aria-label="닫기" className="btn-ghost h-9 w-9 text-base">
                ✕
              </button>
            </div>

            <textarea
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
              }}
              rows={4}
              placeholder={`${who.name}에게 일 시키기… (⌘·Ctrl+Enter 로 보내기)`}
              className="w-full rounded-xl border border-line bg-bg p-3 text-base outline-none focus:border-accent"
            />

            {error && <p className="pt-2 text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-between gap-2 pt-3">
              <p className="text-xs text-muted">맥이 켜져 있으면 연구원이 가져갑니다. 꺼져 있으면 쌓여 있다가 켤 때 처리돼요.</p>
              <button type="button" onClick={send} disabled={busy || !text.trim()} className="btn-primary shrink-0">
                {busy ? "보내는 중…" : "보내기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
