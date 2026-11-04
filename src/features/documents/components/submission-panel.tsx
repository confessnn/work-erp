"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zipSync } from "fflate";
import { getDriveSession, recordSubmission, stopBundleSharing } from "../actions";
import { downloadFromDrive, uploadToDrive } from "../drive-browser";
import { bundleFileNames, isStale, zipName } from "../naming";
import { DOC_TYPES, type DocumentRow, type SubmissionRow } from "../types";

type Props = {
  lecture: { id: string; title: string; organization: string | null };
  documents: DocumentRow[];
  presetTypes: string[];
  submissions: SubmissionRow[];
  driveReady: boolean;
};

const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export function SubmissionPanel({ lecture, documents, presetTypes, submissions, driveReady }: Props) {
  const router = useRouter();
  const today = todaySeoul();
  const groups = useMemo(
    () => DOC_TYPES.map((t) => ({ type: t, docs: documents.filter((d) => d.doc_type === t.key) })).filter((g) => g.docs.length),
    [documents],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(documents.filter((d) => presetTypes.includes(d.doc_type)).map((d) => d.id)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // 압축이 끝난 파일. 저장은 사용자가 직접 버튼을 눌러야 한다 (아이폰·앱 내 브라우저는 자동 다운로드를 막음)
  const [ready, setReady] = useState<{ url: string; name: string; file: File } | null>(null);
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);

  const chosen = documents.filter((d) => selected.has(d.id));
  const stale = chosen.filter((d) => isStale(d, today));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  /** 선택한 서류를 드라이브에서 받아 브라우저에서 압축 */
  async function buildZip() {
    const s = await getDriveSession();
    if (!s.ok) throw new Error(s.error);
    const names = bundleFileNames(chosen, s.displayName);
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < chosen.length; i++) {
      setBusy(`서류 받는 중… (${i + 1}/${chosen.length})`);
      files[names[i]] = await downloadFromDrive(s.token, chosen[i].drive_file_id);
    }
    setBusy("압축하는 중…");
    // PDF·사진은 이미 압축돼 있어 다시 압축해도 거의 안 줄어듦 → 빠른 저장 방식
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([n, d]) => [n, [d, { level: 0 }]])));
    const name = zipName(s.displayName, lecture.organization || lecture.title, today);
    return { blob: new Blob([zipped as BlobPart], { type: "application/zip" }), name, names, session: s };
  }

  async function run(kind: "download" | "drive_link") {
    if (!chosen.length) return setMsg({ ok: false, text: "제출할 서류를 선택해주세요." });
    setMsg(null);
    setShareUrl(null);
    setReady(null);
    try {
      const { blob, name, names, session } = await buildZip();
      let bundleFileId: string | undefined;
      if (kind === "download") {
        setReady({ url: URL.createObjectURL(blob), name, file: new File([blob], name, { type: "application/zip" }) });
      } else {
        setBusy("드라이브에 올리는 중…");
        bundleFileId = await uploadToDrive(session.token, session.bundlesFolderId, blob, name, "application/zip");
      }
      setBusy("기록하는 중…");
      const r = await recordSubmission({
        lectureId: lecture.id,
        documentIds: chosen.map((d) => d.id),
        zipName: name,
        fileNames: names,
        method: kind,
        bundleFileId,
      });
      if (!r.ok) throw new Error(r.error);
      if (kind === "drive_link" && r.shareUrl) {
        setShareUrl(r.shareUrl);
        setMsg({ ok: true, text: "공유 링크를 만들었습니다. 복사해서 메일·카톡으로 보내세요." });
      } else {
        setMsg({ ok: true, text: "압축이 끝났습니다. 아래 버튼으로 저장하거나 바로 보내세요." });
      }
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "실패했습니다." });
    } finally {
      setBusy(null);
    }
  }

  async function stop(id: string) {
    if (!confirm("공유를 중지할까요? 링크로 더 이상 열 수 없고, 드라이브의 압축파일은 휴지통으로 이동합니다.")) return;
    setBusy("공유 중지 중…");
    const r = await stopBundleSharing(id);
    setBusy(null);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    router.refresh();
  }

  if (!driveReady) {
    return (
      <p className="text-sm text-muted">
        서류 제출 기능을 쓰려면 <Link href="/integrations" className="underline">연동</Link> 화면에서 구글 드라이브 권한을
        연결해주세요.
      </p>
    );
  }
  if (!documents.length) {
    return (
      <p className="text-sm text-muted">
        서류함이 비어 있습니다. <Link href="/documents" className="underline">서류함</Link>에 이력서·증명서를 먼저 올려주세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {presetTypes.length > 0 && (
        <p className="text-xs text-muted">같은 기관에 지난번 제출했던 서류를 미리 체크해 두었습니다.</p>
      )}
      <ul className="space-y-2">
        {groups.map(({ type, docs }) => {
          const ids = docs.map((d) => d.id);
          const all = ids.every((id) => selected.has(id));
          const some = ids.some((id) => selected.has(id));
          return (
            <li key={type.key}>
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some && !all;
                  }}
                  onChange={(e) => toggle(ids, e.target.checked)}
                />
                {type.label}
              </label>
              {docs.length > 1 && (
                <ul className="mt-1 space-y-1 pl-6 text-sm">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={selected.has(d.id)} onChange={(e) => toggle([d.id], e.target.checked)} />
                        {d.title || d.file_name}
                        {isStale(d, today) && <span className="text-warn">· 발급 3개월 지남</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {docs.length === 1 && isStale(docs[0], today) && (
                <p className="pl-6 text-xs text-warn">발급일 {docs[0].issued_on} · 3개월이 지났습니다. 새로 발급받아야 할 수 있습니다.</p>
              )}
            </li>
          );
        })}
      </ul>

      {stale.length > 0 && (
        <p className="text-sm text-warn">선택한 서류 중 {stale.length}개가 발급 3개월이 지났습니다.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!busy || !chosen.length} onClick={() => run("download")} className="btn-primary">
          압축파일 만들기 ({chosen.length})
        </button>
        <button type="button" disabled={!!busy || !chosen.length} onClick={() => run("drive_link")} className="chip">
          드라이브 공유 링크 만들기
        </button>
      </div>
      {busy && <p className="text-sm text-muted">{busy}</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      {shareUrl && <ShareBox url={shareUrl} />}
      {ready && <SaveBox ready={ready} />}

      {submissions.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">제출 기록 {submissions.length}건</summary>
          <ul className="mt-2 space-y-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-lg bg-bg p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{new Date(s.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-muted">{s.method === "download" ? "다운로드" : "드라이브 링크"}</span>
                  {s.shared && s.share_url && (
                    <>
                      <a href={s.share_url} target="_blank" rel="noreferrer" className="underline">링크</a>
                      <button type="button" onClick={() => stop(s.id)} disabled={!!busy} className="text-danger underline">
                        공유 중지
                      </button>
                    </>
                  )}
                  {s.method === "drive_link" && !s.shared && <span className="text-muted">(공유 중지됨)</span>}
                </div>
                <div className="text-muted">{s.file_names.join(", ")}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ShareBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={url} className="input text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-primary shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            /* 직접 선택해서 복사 */
          }
        }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function SaveBox({ ready }: { ready: { url: string; name: string; file: File } }) {
  const [shareErr, setShareErr] = useState<string | null>(null);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [ready.file] });

  return (
    <div className="space-y-2 rounded-lg border border-accent p-3">
      <p className="text-sm font-medium break-all">{ready.name}</p>
      <div className="flex flex-wrap gap-2">
        {/* 사용자가 직접 누르는 진짜 링크라 아이폰 Safari 에서도 저장된다 */}
        <a href={ready.url} download={ready.name} className="btn-primary">
          파일 저장
        </a>
        {canShare && (
          <button
            type="button"
            className="chip"
            onClick={async () => {
              setShareErr(null);
              try {
                await navigator.share({ files: [ready.file], title: ready.name });
              } catch (e) {
                if (e instanceof Error && e.name !== "AbortError") setShareErr("공유하지 못했습니다. '파일 저장'을 이용하세요.");
              }
            }}
          >
            공유 (카톡·메일로 바로 보내기)
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        아이폰: &apos;파일 저장&apos; → &apos;다운로드&apos;를 누르면 파일 앱의 다운로드 폴더에 저장됩니다. 카카오톡 등 앱 안에서 연 화면이면
        저장이 안 될 수 있으니 Safari·Chrome에서 열어주세요.
      </p>
      {shareErr && <p className="text-sm text-danger">{shareErr}</p>}
    </div>
  );
}
