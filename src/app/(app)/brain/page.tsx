import type { Metadata } from "next";
import Link from "next/link";
import { BrainSyncButtons, UnlinkVaultButton, VaultSetup } from "@/features/brain/components/brain-buttons";
import { brainStatus, listNoteMeta, notesWithTag, searchNotes } from "@/features/brain/queries";
import type { BrainNoteMeta } from "@/features/brain/types";
import { TODO_FOLDER } from "@/features/brain/todo-notes";
import { EXPORT_FOLDER, noteFolder, SECTION_LABEL, SECTIONS, snippet } from "@/features/brain/vault";
import { todayInSeoul } from "@/lib/format";

export const metadata: Metadata = { title: "세컨드브레인 · work-erp" };
// 동기화·내보내기(Server Action)가 노트를 많이 받을 수 있어 넉넉히
export const maxDuration = 60;

const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

/** 옵시디언 볼트(구글 드라이브)를 ERP에서: PARA 구역별 노트, 찾기, 태그, 그래프, ERP 기록 내보내기 */
export default async function BrainPage({ searchParams }: PageProps<"/brain">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tag = typeof sp.tag === "string" ? sp.tag.trim() : "";
  const status = await brainStatus();

  if (status.kind !== "ready") {
    return (
      <>
        <h1 className="page-title">세컨드브레인</h1>
        <Intro />
        <section className="card space-y-3">
          {status.kind === "no_google" ? (
            <>
              <p className="text-sm">볼트를 구글 드라이브에서 읽어 와요. 먼저 구글을 연결해 주세요.</p>
              <Link href="/integrations" className="btn-primary text-sm">
                연동 화면으로
              </Link>
            </>
          ) : status.kind === "needs_reconnect" ? (
            <>
              <p className="text-sm">
                옵시디언 노트를 읽으려면 <b>드라이브 파일 보기</b> 권한이 더 필요해요. 한 번 다시 연결하고 구글 권한 화면에서 모든 항목에 체크해 주세요.
                기존 일정·서류는 그대로예요.
              </p>
              <a href="/api/google/connect" className="btn-primary text-sm">
                구글 다시 연결 (드라이브 읽기 권한 추가)
              </a>
            </>
          ) : (
            <VaultSetup />
          )}
        </section>
        <HowTo />
      </>
    );
  }

  const { settings } = status;
  const [all, found, tagged] = await Promise.all([listNoteMeta(), q ? searchNotes(q) : null, tag ? notesWithTag(tag) : null]);
  const bySection = new Map(SECTIONS.map((s) => [s, all.filter((n) => n.section === s)]));
  const tagCounts = new Map<string, number>();
  for (const n of all) for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const today = todayInSeoul();
  const todayTodos = all.find((n) => n.title === today && n.path.split("/").slice(-2, -1)[0] === TODO_FOLDER);
  const topTags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">세컨드브레인</h1>
        <div className="flex gap-2">
          <Link href="/brain/graph" className="chip text-sm">
            그래프
          </Link>
          <Link href="/records" className="chip text-sm">
            ERP 기록
          </Link>
        </div>
      </div>

      <section className="card space-y-2">
        <p className="text-sm">
          볼트 <b>{settings.vault_name}</b> · 노트 {all.length}개
          {settings.last_synced_at && <span className="text-muted"> · {when(settings.last_synced_at)} 동기화 ({settings.last_sync_result})</span>}
        </p>
        {todayTodos && (
          <Link href={`/brain/note/${todayTodos.id}`} className="chip text-sm">
            오늘 할 일 노트
          </Link>
        )}
        <BrainSyncButtons />
        <p className="text-xs text-muted">
          옵시디언에서 고친 노트는 &apos;동기화&apos;를 누르면 들어와요. &apos;ERP 기록·할 일 내보내기&apos;는 일정 기록(같은 일끼리)과 대시보드 할 일(날짜별 체크리스트)을 볼트의 &apos;{EXPORT_FOLDER}&apos; 폴더에 노트로 넣어요 (금액은 넣지 않아요). 할 일은 추가·체크·미루기·메모를 할 때마다 자동으로도 반영돼요.
        </p>
      </section>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="노트 제목·내용으로 찾기" aria-label="노트 찾기" className="input flex-1" />
        <button type="submit" className="btn-primary shrink-0">
          찾기
        </button>
      </form>

      {found && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title">&apos;{q}&apos; 찾은 노트 {found.length}개</h2>
            <Link href="/brain" className="text-xs text-muted hover:underline">
              지우기
            </Link>
          </div>
          {found.length === 0 ? (
            <p className="card text-center text-sm text-muted">찾는 노트가 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {found.map((n) => (
                <li key={n.id}>
                  <Link href={`/brain/note/${n.id}`} className="card block space-y-1 hover:bg-line/30">
                    <NoteHead n={n} />
                    <p className="line-clamp-2 break-words text-sm text-muted">{snippet(n.content, q)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tagged && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title">#{tag} 노트 {tagged.length}개</h2>
            <Link href="/brain" className="text-xs text-muted hover:underline">
              지우기
            </Link>
          </div>
          <NoteList notes={tagged} />
        </section>
      )}

      {!found && !tagged && (
        <>
          {topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([t, c]) => (
                <Link key={t} href={`/brain?tag=${encodeURIComponent(t)}`} className="chip text-xs">
                  #{t} <span className="text-muted">{c}</span>
                </Link>
              ))}
            </div>
          )}

          {all.length === 0 ? (
            <p className="card text-center text-sm text-muted">아직 받은 노트가 없어요. 옵시디언에서 노트를 쓰고 &apos;동기화&apos;를 눌러 주세요.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {SECTIONS.map((s) => {
                const list = bySection.get(s)!;
                if (!list.length) return null;
                return (
                  <section key={s} className="card space-y-2">
                    <h2 className="section-title">
                      {SECTION_LABEL[s]} <span className="text-sm font-normal text-muted">{list.length}</span>
                    </h2>
                    <ul className="space-y-1">
                      {list.slice(0, 8).map((n) => (
                        <li key={n.id} className="flex items-baseline gap-2 text-sm">
                          <Link href={`/brain/note/${n.id}`} className="truncate hover:underline">
                            {n.title}
                          </Link>
                          <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{n.modified_at.slice(5, 10).replace("-", ".")}</span>
                        </li>
                      ))}
                    </ul>
                    {list.length > 8 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted">나머지 {list.length - 8}개</summary>
                        <ul className="mt-1 space-y-1">
                          {list.slice(8, 300).map((n) => (
                            <li key={n.id} className="truncate">
                              <Link href={`/brain/note/${n.id}`} className="hover:underline">
                                {n.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end">
        <UnlinkVaultButton />
      </div>
    </>
  );
}

function NoteHead({ n }: { n: BrainNoteMeta }) {
  const folder = noteFolder(n.path);
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-medium">{n.title}</span>
      {folder && <span className="text-xs text-muted">{folder}</span>}
      <span className="ml-auto text-xs text-muted tabular-nums">{n.modified_at.slice(0, 10)}</span>
    </div>
  );
}

function NoteList({ notes }: { notes: BrainNoteMeta[] }) {
  if (!notes.length) return <p className="card text-center text-sm text-muted">노트가 없어요.</p>;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/brain/note/${n.id}`} className="card block hover:bg-line/30">
            <NoteHead n={n} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Intro() {
  return (
    <p className="text-sm text-muted">
      옵시디언 볼트를 구글 드라이브에 두면 ERP에서 노트를 PARA(Projects·Areas·Resources·Archives)별로 보고, 찾고, [[링크]] 그래프로 볼 수 있어요. ERP의 일정 기록도 노트로 내보내요.
    </p>
  );
}

function HowTo() {
  return (
    <section className="card space-y-2 text-sm">
      <h2 className="section-title">옵시디언과 이어 쓰는 방법</h2>
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>PC에 &apos;Google Drive 데스크톱&apos;을 설치하고 같은 구글 계정으로 로그인해요.</li>
        <li>
          옵시디언에서 <b>폴더를 볼트로 열기</b> → 드라이브의 <b>work-erp/세컨드브레인</b> 폴더(또는 연결한 폴더)를 골라요.
        </li>
        <li>옵시디언에서 쓴 노트는 드라이브로 올라가고, ERP에서 &apos;동기화&apos;를 누르면 보여요.</li>
      </ol>
    </section>
  );
}
