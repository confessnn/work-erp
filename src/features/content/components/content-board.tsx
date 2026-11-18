"use client";

import { useMemo, useState, useTransition } from "react";
import { todayInSeoul } from "@/lib/format";
import {
  addSource,
  clearContentToken,
  deleteSource,
  makeDraft,
  runContentNow,
  saveContentSettings,
  saveContentToken,
  saveNotionPage,
  setContentEnabled,
  updateSource,
} from "../actions";
import { DRAFT_FORMATS, type DraftFormat } from "../formats";

export type BoardSettings = {
  enabled: boolean;
  fields: string[];
  daily_budget: number;
  notion_parent: string | null;
  notion_db: string | null;
  reads_day: string | null;
  reads_count: number;
  last_run_at: string | null;
  last_result: string | null;
};
export type BoardSource = { id: string; handle: string; field: string | null; active: boolean; last_fetched_at: string | null; last_error: string | null };
export type BoardPost = {
  id: string;
  handle: string;
  text: string;
  posted_at: string | null;
  likes: number;
  reposts: number;
  views: number | null;
  status: "new" | "analyzed" | "synced" | "error";
  field: string | null;
  summary: string | null;
  translation: string | null;
  idea: string | null;
  idea_score: number | null;
  notion_page: string | null;
};

type Msg = { ok: boolean; message: string } | null;

const when = (at: string | null) =>
  at ? new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "-";

const STATUS_LABEL: Record<BoardPost["status"], string> = { new: "정리 대기", analyzed: "노션 대기", synced: "노션 기록", error: "정리 실패" };

export function ContentBoard({ settings, hasX, hasNotion, sources, posts }: { settings: BoardSettings | null; hasX: boolean; hasNotion: boolean; sources: BoardSource[]; posts: BoardPost[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r.ok) after?.();
    });

  const readsToday = settings?.reads_day === todayInSeoul() ? settings.reads_count : 0;
  const ready = hasX && sources.length > 0;

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="space-y-1">
          <p>
            매일 자동 수집 (08:30쯤){" "}
            {settings?.enabled === false ? <span className="text-muted">꺼짐</span> : <b className="text-success">켜짐</b>} · 오늘 읽은 글 {readsToday}/{settings?.daily_budget ?? 200}개
          </p>
          <p className="text-muted">
            마지막 실행 {when(settings?.last_run_at ?? null)}
            {settings?.last_result ? ` · ${settings.last_result}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending || !ready} onClick={() => run(runContentNow)}>
            {pending ? "처리 중… (최대 몇 분)" : "지금 모으기"}
          </button>
          <button type="button" className="chip" disabled={pending} onClick={() => run(() => setContentEnabled(settings?.enabled === false))}>
            {settings?.enabled === false ? "자동 수집 켜기" : "자동 수집 끄기"}
          </button>
        </div>
        {msg && <p className={`w-full ${msg.ok ? "text-success" : "text-danger"}`}>{msg.message}</p>}
      </section>

      <Setup settings={settings} hasX={hasX} hasNotion={hasNotion} pending={pending} run={run} />
      <Sources sources={sources} fields={settings?.fields ?? []} pending={pending} run={run} />
      <Posts posts={posts} fields={settings?.fields ?? []} />
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => void;

function Setup({ settings, hasX, hasNotion, pending, run }: { settings: BoardSettings | null; hasX: boolean; hasNotion: boolean; pending: boolean; run: RunFn }) {
  const [xToken, setXToken] = useState("");
  const [nToken, setNToken] = useState("");
  const [page, setPage] = useState("");
  const [fields, setFields] = useState((settings?.fields ?? []).join(", "));
  const [budget, setBudget] = useState(String(settings?.daily_budget ?? 200));
  const allSet = hasX && hasNotion && !!settings?.notion_parent;

  return (
    <details className="card text-sm" open={!allSet}>
      <summary className="cursor-pointer font-semibold">
        연결·설정 {allSet ? <span className="text-success">(완료)</span> : <span className="text-danger">(준비가 남았어요)</span>}
      </summary>
      <div className="mt-3 space-y-4">
        <div className="space-y-1">
          <p className="font-medium">1. X API 토큰 {hasX ? <b className="text-success">저장됨</b> : <span className="text-muted">없음</span>}</p>
          <p className="text-muted">
            X 계정으로 <a className="underline" href="https://console.x.com" target="_blank" rel="noreferrer">X 개발자 콘솔</a>에 들어가 앱을 만들고 크레딧을 조금 충전한 뒤,
            앱의 <b>Bearer Token</b>을 복사해 넣어요. 글 1개 읽기에 약 $0.005가 들어요(콘솔의 가격표 확인).
          </p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="off" className="input min-w-0 flex-1" placeholder="AAAAAAAAAAAAAAAAAAAAA..." value={xToken} onChange={(e) => setXToken(e.target.value)} />
            <button type="button" className="btn-primary" disabled={pending || !xToken.trim()} onClick={() => run(() => saveContentToken("x", xToken), () => setXToken(""))}>
              저장
            </button>
            {hasX && (
              <button type="button" className="chip" disabled={pending} onClick={() => run(() => clearContentToken("x"))}>
                지우기
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-medium">2. 노션 연결 토큰 {hasNotion ? <b className="text-success">저장됨</b> : <span className="text-muted">없음</span>}</p>
          <p className="text-muted">
            <a className="underline" href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">노션 연결(Integration) 화면</a>에서 &lsquo;새 연결&rsquo;(내부용)을 만들고
            <b> 내부 연결 토큰</b>(ntn_로 시작)을 복사해 넣어요.
          </p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="off" className="input min-w-0 flex-1" placeholder="ntn_..." value={nToken} onChange={(e) => setNToken(e.target.value)} />
            <button type="button" className="btn-primary" disabled={pending || !nToken.trim()} onClick={() => run(() => saveContentToken("notion", nToken), () => setNToken(""))}>
              저장
            </button>
            {hasNotion && (
              <button type="button" className="chip" disabled={pending} onClick={() => run(() => clearContentToken("notion"))}>
                지우기
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-medium">3. 노션 페이지 {settings?.notion_parent ? <b className="text-success">연결됨{settings.notion_db ? " · X 인사이트 표 있음" : ""}</b> : <span className="text-muted">없음</span>}</p>
          <p className="text-muted">노션에 &lsquo;콘텐츠 창고&rsquo; 같은 빈 페이지를 만들고, 페이지 오른쪽 위 ⋯ → <b>연결</b>에서 방금 만든 연결을 추가한 뒤 페이지 주소를 붙여 넣어요.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" placeholder="https://www.notion.so/..." value={page} onChange={(e) => setPage(e.target.value)} />
            <button type="button" className="btn-primary" disabled={pending || !page.trim() || !hasNotion} onClick={() => run(() => saveNotionPage(page), () => setPage(""))}>
              연결
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-medium">4. 관심 분야와 하루 예산</p>
          <p className="text-muted">분야는 쉼표로 나눠요 (예: AI, 마케팅, 1인 사업). AI가 글마다 이 중 하나를 붙여요. 하루 예산은 하루에 읽을 최대 글 수예요.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" placeholder="AI, 마케팅, 1인 사업" value={fields} onChange={(e) => setFields(e.target.value)} />
            <input className="input w-24 tabular-nums" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <span className="self-center text-muted">개/일</span>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveContentSettings(fields, Number(budget)))}>
              저장
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

function Sources({ sources, fields, pending, run }: { sources: BoardSource[]; fields: string[]; pending: boolean; run: RunFn }) {
  const [handle, setHandle] = useState("");
  const [field, setField] = useState("");
  return (
    <section className="card space-y-3 text-sm">
      <h2 className="section-title">인플루언서 ({sources.length}명)</h2>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder="@아이디 또는 x.com 주소" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <input className="input w-36" list="content-fields" placeholder="분야 (선택)" value={field} onChange={(e) => setField(e.target.value)} />
        <datalist id="content-fields">
          {fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <button type="button" className="btn-primary" disabled={pending || !handle.trim()} onClick={() => run(() => addSource(handle, field), () => setHandle(""))}>
          추가
        </button>
      </div>
      {sources.length === 0 ? (
        <p className="text-muted">아직 없어요. 관심 분야 인플루언서의 X 아이디를 추가해 주세요. 처음 받을 때는 사람마다 최근 글 5개만 받아요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <a className={`font-medium underline ${s.active ? "" : "text-muted line-through"}`} href={`https://x.com/${s.handle}`} target="_blank" rel="noreferrer">
                @{s.handle}
              </a>
              {s.field && <span className="chip text-xs">{s.field}</span>}
              <span className="text-xs text-muted">마지막 수집 {when(s.last_fetched_at)}</span>
              {s.last_error && <span className="text-xs text-danger">{s.last_error}</span>}
              <span className="ml-auto flex gap-1">
                <button type="button" className="chip text-xs" disabled={pending} onClick={() => run(() => updateSource(s.id, { active: !s.active }))}>
                  {s.active ? "쉬기" : "다시 받기"}
                </button>
                <button type="button" className="chip text-xs" disabled={pending} onClick={() => confirm(`@${s.handle}을 목록에서 지울까요? 모은 글은 남아요.`) && run(() => deleteSource(s.id))}>
                  지우기
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Posts({ posts, fields }: { posts: BoardPost[]; fields: string[] }) {
  const [filter, setFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(
    () => posts.filter((p) => (!filter || p.field === filter) && (p.idea_score ?? 0) >= minScore),
    [posts, filter, minScore],
  );
  const allFields = useMemo(() => [...new Set([...fields, ...posts.map((p) => p.field).filter((f): f is string => !!f)])], [fields, posts]);
  const toggle = (id: string) => setPicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 12 ? v : [...v, id]));

  return (
    <section className="card space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="section-title mr-auto">모은 글 ({shown.length}/{posts.length})</h2>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">모든 분야</option>
          {allFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value={0}>모든 점수</option>
          <option value={3}>★3 이상</option>
          <option value={4}>★4 이상</option>
        </select>
      </div>

      <DraftMaker picked={picked} clear={() => setPicked([])} />

      {shown.length === 0 ? (
        <p className="text-muted">아직 모은 글이 없어요. 준비가 끝나면 &lsquo;지금 모으기&rsquo;를 눌러 보세요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id} className="space-y-1 py-2">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} aria-label="초안 재료로 고르기" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p>
                    <span className="text-accent">{"★".repeat(p.idea_score ?? 0)}</span> {p.field && <span className="chip text-xs">{p.field}</span>}{" "}
                    <b>{p.summary ?? p.text.slice(0, 80)}</b>
                  </p>
                  {p.idea && <p className="text-muted">💡 {p.idea}</p>}
                  <p className="text-xs text-muted">
                    <a className="underline" href={`https://x.com/${p.handle}/status/${p.id}`} target="_blank" rel="noreferrer">
                      @{p.handle}
                    </a>{" "}
                    · {when(p.posted_at)} · ♥ {p.likes.toLocaleString("ko-KR")} · ↻ {p.reposts.toLocaleString("ko-KR")}
                    {p.views !== null ? ` · 조회 ${Number(p.views).toLocaleString("ko-KR")}` : ""} · {STATUS_LABEL[p.status]}
                    {p.notion_page && (
                      <>
                        {" · "}
                        <a className="underline" href={`https://www.notion.so/${p.notion_page.replace(/-/g, "")}`} target="_blank" rel="noreferrer">
                          노션
                        </a>
                      </>
                    )}{" "}
                    ·{" "}
                    <button type="button" className="underline" onClick={() => setOpen(open === p.id ? null : p.id)}>
                      {open === p.id ? "접기" : "원문 보기"}
                    </button>
                  </p>
                  {open === p.id && (
                    <div className="space-y-2 rounded-lg border border-line p-2 whitespace-pre-wrap">
                      <p>{p.text}</p>
                      {p.translation && <p className="text-muted">번역: {p.translation}</p>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DraftMaker({ picked, clear }: { picked: string[]; clear: () => void }) {
  const [pending, start] = useTransition();
  const [format, setFormat] = useState<DraftFormat>("blog");
  const [note, setNote] = useState("");
  const [out, setOut] = useState<{ ok: boolean; message: string; text?: string; url?: string } | null>(null);

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <p className="font-medium">고른 글로 초안 만들기 ({picked.length}/12개 골랐어요)</p>
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={format} onChange={(e) => setFormat(e.target.value as DraftFormat)}>
          {DRAFT_FORMATS.map((f) => (
            <option key={f.v} value={f.v}>
              {f.label}
            </option>
          ))}
        </select>
        <input className="input min-w-0 flex-1" placeholder="내 요청 (선택): 예) 강사 입장에서, 초보자용으로" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          type="button"
          className="btn-primary"
          disabled={pending || picked.length === 0}
          onClick={() =>
            start(async () => {
              setOut(null);
              const r = await makeDraft(picked, format, note);
              setOut(r);
              if (r.ok) clear();
            })
          }
        >
          {pending ? "쓰는 중…" : "초안 만들기"}
        </button>
      </div>
      {out && (
        <div className="space-y-1">
          <p className={out.ok ? "text-success" : "text-danger"}>
            {out.message}{" "}
            {out.url && (
              <a className="underline" href={out.url} target="_blank" rel="noreferrer">
                노션에서 열기
              </a>
            )}
          </p>
          {out.text && <pre className="max-h-96 overflow-auto rounded-lg bg-bg p-3 text-sm whitespace-pre-wrap">{out.text}</pre>}
        </div>
      )}
    </div>
  );
}
