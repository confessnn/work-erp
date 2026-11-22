"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { dateLabel } from "@/lib/format";
import { deleteCareLog, endSleep, saveCareLog, type CareInput } from "../actions";
import {
  agoLabel,
  daySummary,
  describe,
  durationLabel,
  KINDS,
  kindInfo,
  seoulDate,
  seoulTime,
  toLocalInput,
  type BabyLog,
  type CareKind,
} from "../care";

type Latest = { diaper: BabyLog | null; feed: BabyLog | null; sleep: BabyLog | null };
type Editing = { id: string | null; input: CareInput };

const ML_CHIPS = [40, 60, 80, 100, 120, 150, 180];

function shiftDay(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * 육아 기록 화면: 마지막 기저귀·수유·잠, 기록 버튼, 하루 요약, 그날 기록 목록.
 * 가족(나·아내)이 같은 기록을 함께 쓴다.
 */
export function CareBoard({ day, today, logs, latest }: { day: string; today: string; logs: BabyLog[]; latest: Latest }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const s = daySummary(logs, day, now);
  const list = logs.filter((l) => seoulDate(l.started_at) === day);
  const sleeping = latest.sleep && !latest.sleep.ended_at ? latest.sleep : null;

  /** 새 기록: 오늘이면 지금, 다른 날이면 그날 낮 12시로 시작 */
  function open(kind: CareKind) {
    setError(null);
    const started = day === today ? toLocalInput(new Date(now).toISOString()) : `${day}T12:00`;
    const input: CareInput = { kind, started };
    if (kind === "breast") {
      input.started = day === today ? toLocalInput(new Date(now - 15 * 60_000).toISOString()) : `${day}T12:00`;
      input.ended = day === today ? toLocalInput(new Date(now).toISOString()) : `${day}T12:15`;
      input.side = "left";
    }
    setEditing({ id: null, input });
  }

  function edit(l: BabyLog) {
    setError(null);
    setEditing({
      id: l.id,
      input: {
        kind: l.kind,
        started: toLocalInput(l.started_at),
        ended: l.ended_at ? toLocalInput(l.ended_at) : null,
        amount_ml: l.amount_ml,
        value: l.value,
        side: l.side,
        diaper: l.diaper,
        label: l.label,
        note: l.note,
      },
    });
  }

  function save(input: CareInput) {
    start(async () => {
      const r = await saveCareLog(editing?.id ?? null, input);
      if (!r.ok) return setError(r.message);
      setEditing(null);
      router.refresh();
    });
  }
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.message ?? "저장하지 못했어요.");
      setEditing(null);
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {/* 마지막 기록 */}
      <section className="grid grid-cols-3 gap-2">
        <LastCard icon="🧷" title="마지막 기저귀" log={latest.diaper} now={now} />
        <LastCard icon="🍼" title="마지막 수유" log={latest.feed} now={now} />
        <LastCard icon="😴" title={sleeping ? "자는 중" : "마지막 잠"} log={latest.sleep} now={now} sleep />
      </section>
      {sleeping && (
        <button type="button" disabled={pending} onClick={() => act(() => endSleep(sleeping.id))} className="btn-primary w-full">
          ☀️ 깼어요 ({seoulTime(sleeping.started_at)}부터 {durationLabel((now - Date.parse(sleeping.started_at)) / 60_000)})
        </button>
      )}

      {/* 기록 버튼 */}
      <section className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => open(k.key)}
            className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface px-1 py-3 text-xs hover:bg-accent-soft"
          >
            <span className="text-2xl" aria-hidden>
              {k.icon}
            </span>
            {k.label}
          </button>
        ))}
      </section>
      {error && !editing && <p className="text-sm text-danger">{error}</p>}

      {/* 날짜 + 하루 요약 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Link href={`/baby/care?d=${shiftDay(day, -1)}`} className="btn-ghost" aria-label="전날">
            ‹
          </Link>
          <h2 className="section-title min-w-28 text-center">{day === today ? "오늘" : dateLabel(day)}</h2>
          <Link href={`/baby/care?d=${shiftDay(day, 1)}`} className="btn-ghost" aria-label="다음 날">
            ›
          </Link>
          {day !== today && (
            <Link href="/baby/care" className="chip text-sm">
              오늘로
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="총 수유량" value={`${s.feedMl}ml`} sub={`수유 ${s.feeds}회${s.breastCount ? ` · 모유 ${s.breastCount}회 ${durationLabel(s.breastMin)}` : ""}`} />
          <Tile label="기저귀" value={`${s.diapers}번`} sub={`소변 ${s.pee} · 대변 ${s.poo}`} />
          <Tile label="수면" value={durationLabel(s.sleepMin)} />
          <Tile
            label="분유 · 유축"
            value={`${s.formulaMl} · ${s.pumpedMl}ml`}
            sub={[s.waterMl && `물 ${s.waterMl}ml`, s.solidG && `이유식 ${s.solidG}g`].filter(Boolean).join(" · ") || undefined}
          />
        </div>
      </section>

      {/* 그날 기록 */}
      <section className="space-y-2">
        {list.length === 0 ? (
          <p className="card text-center text-sm text-muted">이날 기록이 없어요. 위 버튼으로 기록하세요.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.map((l) => {
              const k = kindInfo(l.kind);
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => edit(l)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent-soft/50">
                    <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-muted">{seoulTime(l.started_at)}</span>
                    <span className="text-lg" aria-hidden>
                      {k.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <b>{k.label}</b> {describe(l, now)}
                      {l.note && <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-muted">{l.note}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && (
        <CareForm
          key={editing.id ?? editing.input.kind}
          editing={editing}
          pending={pending}
          error={error}
          onSave={save}
          onDelete={editing.id ? () => act(() => deleteCareLog(editing.id!)) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LastCard({ icon, title, log, now, sleep }: { icon: string; title: string; log: BabyLog | null; now: number; sleep?: boolean }) {
  let main = "기록 없음";
  let sub = "";
  if (log) {
    if (sleep && !log.ended_at) {
      main = durationLabel((now - Date.parse(log.started_at)) / 60_000) + "째";
      sub = `${seoulTime(log.started_at)}에 잠듦`;
    } else {
      const at = sleep && log.ended_at ? log.ended_at : log.started_at;
      main = agoLabel(at, now);
      sub = `${seoulTime(at)}${sleep ? " 깸" : ""} · ${describe(log, now) || kindInfo(log.kind).label}`;
    }
  }
  return (
    <div className="card space-y-1 p-3">
      <div className="text-xs text-muted">
        {icon} {title}
      </div>
      <div className="text-base font-semibold leading-tight">{main}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** 기록 입력·수정 창 (종류마다 필요한 칸만) */
function CareForm({
  editing,
  pending,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  editing: Editing;
  pending: boolean;
  error: string | null;
  onSave: (input: CareInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<CareInput>(editing.input);
  const set = (patch: Partial<CareInput>) => setV((x) => ({ ...x, ...patch }));
  const k = kindInfo(v.kind);
  const field = k.field;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <form
        className="card max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <h3 className="section-title">
          {k.icon} {k.label} {editing.id ? "기록 고치기" : "기록"}
        </h3>

        <label className="field">
          <span>{field === "sleep" ? "잠든 시각" : field === "breast" ? "시작" : "시각"}</span>
          <input type="datetime-local" value={v.started} onChange={(e) => set({ started: e.target.value })} className="input" required />
        </label>

        {(field === "sleep" || field === "breast") && (
          <label className="field">
            <span>{field === "sleep" ? "깬 시각 (자는 중이면 비워 두세요)" : "끝"}</span>
            <input type="datetime-local" value={v.ended ?? ""} onChange={(e) => set({ ended: e.target.value || null })} className="input" />
          </label>
        )}

        {field === "breast" && (
          <Choice
            value={v.side ?? ""}
            options={[
              ["left", "왼쪽"],
              ["right", "오른쪽"],
              ["both", "양쪽"],
            ]}
            onChange={(side) => set({ side })}
          />
        )}

        {field === "diaper" && (
          <Choice
            value={v.diaper ?? ""}
            options={[
              ["pee", "💧 소변"],
              ["poo", "💩 대변"],
              ["both", "둘 다"],
            ]}
            onChange={(diaper) => set({ diaper })}
          />
        )}

        {field === "ml" && (
          <div className="space-y-2">
            <label className="field">
              <span>양 (ml)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={5000}
                value={v.amount_ml ?? ""}
                onChange={(e) => set({ amount_ml: e.target.value === "" ? null : Number(e.target.value) })}
                className="input"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ML_CHIPS.map((ml) => (
                <button key={ml} type="button" onClick={() => set({ amount_ml: ml })} className={`chip text-sm ${v.amount_ml === ml ? "chip-on" : ""}`}>
                  {ml}
                </button>
              ))}
            </div>
          </div>
        )}

        {(field === "kg" || field === "temp") && (
          <label className="field">
            <span>{field === "kg" ? "몸무게 (kg)" : "체온 (℃)"}</span>
            <input
              type="number"
              inputMode="decimal"
              step={field === "kg" ? 0.01 : 0.1}
              min={0}
              max={field === "kg" ? 99 : 45}
              value={v.value ?? ""}
              onChange={(e) => set({ value: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder={field === "kg" ? "예: 4.25" : "예: 36.8"}
              className="input"
              required
            />
          </label>
        )}

        {field === "solid" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>메뉴</span>
              <input value={v.label ?? ""} onChange={(e) => set({ label: e.target.value })} maxLength={100} placeholder="예: 쌀미음" className="input" />
            </label>
            <label className="field">
              <span>양 (g)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={v.value ?? ""}
                onChange={(e) => set({ value: e.target.value === "" ? null : Number(e.target.value) })}
                className="input"
              />
            </label>
          </div>
        )}

        {(field === "medicine" || field === "text") && (
          <label className="field">
            <span>{field === "medicine" ? "약 이름·양" : v.kind === "hospital" ? "병원·진료 내용" : "내용"}</span>
            <input
              value={v.label ?? ""}
              onChange={(e) => set({ label: e.target.value })}
              maxLength={100}
              placeholder={field === "medicine" ? "예: 해열제 2.5ml" : v.kind === "hospital" ? "예: OO소아과 예방접종" : ""}
              className="input"
            />
          </label>
        )}

        <label className="field">
          <span>메모 (선택)</span>
          <textarea rows={2} maxLength={1000} value={v.note ?? ""} onChange={(e) => set({ note: e.target.value })} className="input" />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="btn-primary flex-1">
            {pending ? "저장 중…" : "저장"}
          </button>
          <button type="button" onClick={onClose} className="chip">
            닫기
          </button>
          {onDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("이 기록을 지울까요?")) onDelete();
              }}
              className="ml-auto text-sm text-danger hover:underline"
            >
              삭제
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Choice({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`choice ${value === v ? "choice-on" : ""}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
