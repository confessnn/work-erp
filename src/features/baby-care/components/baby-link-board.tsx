"use client";

import { useState, useTransition } from "react";
import { moveItem, type BabyLink } from "../links";
import { addBabyLink, deleteBabyLink, refreshBabyLink, reorderBabyLinks, updateBabyLink } from "../link-actions";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** 아기 링크 모음: 주소를 넣으면 서버가 사이트를 읽고 짧은 설명을 붙인다. 누르면 그 사이트로 */
export function BabyLinkBoard({ initial }: { initial: BabyLink[] }) {
  const [links, setLinks] = useState(initial);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 읽는 중인 링크 id 또는 "new"
  const [pending, start] = useTransition();
  // 순서 바꾸기: 바꾸는 동안의 목록 (저장하면 links에 반영, 취소하면 버림)
  const [ordering, setOrdering] = useState<BabyLink[] | null>(null);

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string; link?: BabyLink }>, after: (l?: BabyLink) => void) =>
    start(async () => {
      setError(null);
      setBusy(key);
      const r = await fn();
      setBusy(null);
      if (!r.ok) return setError(r.message ?? "저장하지 못했어요.");
      after(r.link);
    });

  const replace = (l?: BabyLink) => l && setLinks((xs) => xs.map((x) => (x.id === l.id ? l : x)));

  return (
    <div className="space-y-5">
      <form
        className="card space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("new", () => addBabyLink(url, note), (l) => {
            if (l) setLinks((xs) => [l, ...xs]);
            setUrl("");
            setNote("");
          });
        }}
      >
        <h2 className="section-title">링크 넣기</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="사이트 주소 (예: nip.kdca.go.kr)"
            className="input min-w-0 flex-1"
            required
          />
          <button type="submit" disabled={pending} className="btn-primary shrink-0">
            {busy === "new" ? "사이트 읽는 중…" : "넣기"}
          </button>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="메모 (선택)" className="input w-full" />
        <p className="text-xs text-muted">넣으면 사이트를 읽어서 어떤 곳인지 짧은 설명을 붙여요(몇 초 걸려요). 새 링크는 맨 위에 붙어요. 아내와 같이 봐요.</p>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {links.length > 1 && !ordering && (
        <div className="flex justify-end">
          <button type="button" onClick={() => (setEditing(null), setOrdering(links))} className="chip text-sm">
            ↕ 순서 바꾸기
          </button>
        </div>
      )}

      {ordering ? (
        <section className="space-y-2">
          <p className="text-sm text-muted">▲▼로 한 칸씩, ⤒로 맨 위로 옮긴 뒤 저장하세요. 아내 화면도 같은 순서로 바뀌어요.</p>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {ordering.map((l, i) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{l.title ?? host(l.url)}</span>
                {[
                  ["⤒", "맨 위로", 0],
                  ["▲", "위로", i - 1],
                  ["▼", "아래로", i + 1],
                ].map(([icon, label, to]) => (
                  <button
                    key={label as string}
                    type="button"
                    aria-label={`${l.title ?? host(l.url)} ${label}`}
                    disabled={to === i || (to as number) < 0 || (to as number) >= ordering.length}
                    onClick={() => setOrdering(moveItem(ordering, i, to as number))}
                    className="chip h-8 w-8 shrink-0 justify-center p-0 disabled:opacity-30"
                  >
                    {icon}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("order", () => reorderBabyLinks(ordering.map((l) => l.id)), () => {
                  setLinks(ordering);
                  setOrdering(null);
                })
              }
              className="btn-primary flex-1"
            >
              {busy === "order" ? "저장 중…" : "순서 저장"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOrdering(null)} className="chip">
              취소
            </button>
          </div>
        </section>
      ) : links.length === 0 ? (
        <p className="card text-center text-sm text-muted">아직 링크가 없어요. 예방접종 안내, 육아 정보, 자주 사는 쇼핑몰 같은 사이트를 넣어 두세요.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) =>
            editing === l.id ? (
              <li key={l.id} className="card">
                <EditForm
                  link={l}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(v) => run(l.id, () => updateBabyLink(l.id, v), (x) => (replace(x), setEditing(null)))}
                  onDelete={() => {
                    if (confirm("이 링크를 지울까요? 아내 화면에서도 지워져요."))
                      run(l.id, () => deleteBabyLink(l.id), () => setLinks((xs) => xs.filter((x) => x.id !== l.id)));
                  }}
                />
              </li>
            ) : (
              <li key={l.id} className="card space-y-1.5 p-0">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="block space-y-1 rounded-t-2xl px-4 pt-3 hover:bg-accent-soft/40">
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 break-words">{l.title ?? host(l.url)}</b>
                    <span className="shrink-0 text-xs text-muted">{host(l.url)} ↗</span>
                  </span>
                  {l.description && <span className="block text-sm text-muted">{busy === l.id ? "사이트 다시 읽는 중…" : l.description}</span>}
                </a>
                {l.note && <p className="mx-4 whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-1.5 text-xs">{l.note}</p>}
                <div className="flex gap-3 px-4 pb-3 text-xs text-muted">
                  <button type="button" disabled={pending} onClick={() => run(l.id, () => refreshBabyLink(l.id), replace)} className="hover:underline">
                    다시 읽기
                  </button>
                  <button type="button" onClick={() => setEditing(l.id)} className="hover:underline">
                    고치기
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function EditForm({
  link,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  link: BabyLink;
  pending: boolean;
  onSave: (v: { title: string; description: string; note: string }) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [v, setV] = useState({ title: link.title ?? "", description: link.description ?? "", note: link.note ?? "" });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <p className="break-all text-xs text-muted">{link.url}</p>
      <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={200} placeholder="제목" className="input w-full" />
      <textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={1000} placeholder="설명" className="input w-full" />
      <textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={1000} placeholder="메모" className="input w-full" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          저장
        </button>
        <button type="button" onClick={onCancel} className="chip">
          취소
        </button>
        <button type="button" disabled={pending} onClick={onDelete} className="ml-auto text-sm text-danger hover:underline">
          삭제
        </button>
      </div>
    </form>
  );
}
