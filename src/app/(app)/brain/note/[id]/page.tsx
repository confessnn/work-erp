import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteBody } from "@/features/brain/components/note-body";
import { brainStatus, getNote, listNoteMeta } from "@/features/brain/queries";
import { backlinksOf, linkResolver, noteFolder, obsidianUrl, SECTION_LABEL, splitFrontmatter } from "@/features/brain/vault";

export const metadata: Metadata = { title: "노트 · 세컨드브레인" };

/** 노트 하나: 본문, 나가는 링크, 백링크(이 노트를 가리키는 노트), 옵시디언·드라이브에서 열기 */
export default async function BrainNotePage({ params }: PageProps<"/brain/note/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [note, all, status] = await Promise.all([getNote(id), listNoteMeta(), brainStatus()]);
  if (!note) notFound();

  const resolveNote = linkResolver(all);
  const resolve = (key: string) => resolveNote(key)?.id;
  const out = [...new Map(note.links.map((k) => resolveNote(k)).filter((n) => n && n.id !== note.id).map((n) => [n!.id, n!])).values()];
  const missing = note.links.filter((k) => !resolveNote(k));
  const back = backlinksOf(note, all);
  const { meta, body } = splitFrontmatter(note.content);
  const vault = status.kind === "ready" ? status.settings.vault_name : null;
  const folder = noteFolder(note.path);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">{note.title}</h1>
        <div className="flex flex-wrap gap-2">
          {vault && (
            <a href={obsidianUrl(vault, note.path)} className="chip text-sm">
              옵시디언에서 열기
            </a>
          )}
          <a href={`https://drive.google.com/file/d/${note.drive_file_id}/view`} target="_blank" rel="noopener noreferrer" className="chip text-sm">
            드라이브
          </a>
          <Link href="/brain" className="chip text-sm">
            세컨드브레인
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted">
        {SECTION_LABEL[note.section]}
        {folder && ` · ${folder}`} · {note.modified_at.slice(0, 10)} 고침
        {note.tags.length > 0 && (
          <>
            {" · "}
            {note.tags.map((t) => (
              <Link key={t} href={`/brain?tag=${encodeURIComponent(t)}`} className="mr-1 text-accent hover:underline">
                #{t}
              </Link>
            ))}
          </>
        )}
      </p>

      {Object.keys(meta).length > 0 && (
        <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {Object.entries(meta).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{Array.isArray(v) ? v.join(", ") : v}</dd>
            </div>
          ))}
        </dl>
      )}

      <article className="card">
        <NoteBody body={body} resolve={resolve} />
      </article>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="section-title">
            백링크 <span className="text-sm font-normal text-muted">{back.length}</span>
          </h2>
          {back.length ? (
            <ul className="space-y-1 text-sm">
              {back.map((n) => (
                <li key={n.id}>
                  <Link href={`/brain/note/${n.id}`} className="hover:underline">
                    {n.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">이 노트를 가리키는 노트가 없어요.</p>
          )}
        </section>
        <section className="card space-y-2">
          <h2 className="section-title">
            나가는 링크 <span className="text-sm font-normal text-muted">{out.length + missing.length}</span>
          </h2>
          {out.length + missing.length ? (
            <ul className="space-y-1 text-sm">
              {out.map((n) => (
                <li key={n.id}>
                  <Link href={`/brain/note/${n.id}`} className="hover:underline">
                    {n.title}
                  </Link>
                </li>
              ))}
              {missing.map((k) => (
                <li key={k} className="text-muted" title="볼트에 아직 없는 노트">
                  {k} (아직 없음)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">[[링크]]가 없어요.</p>
          )}
        </section>
      </div>
    </>
  );
}
