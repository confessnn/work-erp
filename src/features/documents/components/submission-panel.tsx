"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zipSync } from "fflate";
import { getDriveSession, recordSubmission, stopBundleSharing } from "../actions";
import { downloadFromDrive, uploadToDrive } from "../drive-browser";
import { bundlePaths, isStale, zipName } from "../naming";
import type { LectureOption } from "../queries";
import { DOC_TYPES, type DocumentRow, type SubmissionRow } from "../types";

type Props = {
  /** 강의 일정 화면에서 열었으면 그 일정. 서류함에서 열었으면 null */
  lecture: { id: string; title: string; organization: string | null } | null;
  documents: DocumentRow[];
  presetTypes: string[];
  submissions?: SubmissionRow[];
  lectureOptions: LectureOption[];
  driveReady: boolean;
};

const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function SubmissionPanel({ lecture, documents, presetTypes, submissions = [], lectureOptions, driveReady }: Props) {
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

  // 공유 옵션
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<"link" | "lecture">(lecture ? "lecture" : "link");
  const [targetLectureId, setTargetLectureId] = useState(lecture?.id ?? "");

  const chosen = documents.filter((d) => selected.has(d.id));
  const stale = chosen.filter((d) => isStale(d, today));

  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  /** 선택한 서류를 드라이브에서 받아 브라우저에서 압축 */
  async function buildZip(target: { title: string; organization: string | null } | null) {
    const s = await getDriveSession();
    if (!s.ok) throw new Error(s.error);
    const names = bundlePaths(chosen, s.displayName); // 종류별 폴더/파일 이름
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < chosen.length; i++) {
      setBusy(`서류 받는 중… (${i + 1}/${chosen.length})`);
      files[names[i]] = await downloadFromDrive(s.token, chosen[i].drive_file_id);
    }
    setBusy("압축하는 중…");
    // PDF·사진은 이미 압축돼 있어 다시 압축해도 거의 안 줄어듦 → 빠른 저장 방식
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([n, d]) => [n, [d, { level: 0 }]])));
    const name = zipName(s.displayName, target ? target.organization || target.title : null, today);
    return { blob: new Blob([zipped as BlobPart], { type: "application/zip" }), name, names, session: s };
  }

  function reset() {
    setMsg(null);
    setShareUrl(null);
    setReady(null);
  }

  /** 제출: 압축파일을 만들어 저장/휴대폰 공유 */
  async function submit() {
    if (!chosen.length) return setMsg({ ok: false, text: "제출할 서류를 선택해주세요." });
    reset();
    try {
      const { blob, name, names } = await buildZip(lecture);
      setReady({ url: URL.createObjectURL(blob), name, file: new File([blob], name, { type: "application/zip" }) });
      setBusy("기록하는 중…");
      const r = await recordSubmission({
        lectureId: lecture?.id ?? null,
        documentIds: chosen.map((d) => d.id),
        zipName: name,
        fileNames: names,
        method: "download",
      });
      if (!r.ok) throw new Error(r.error);
      setMsg({ ok: true, text: "압축이 끝났습니다. 아래 버튼으로 저장하거나 바로 보내세요." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "실패했습니다." });
    } finally {
      setBusy(null);
    }
  }

  /** 공유: 드라이브에 압축파일을 올리고 링크 생성 (+ 일정에 붙이기) */
  async function share() {
    if (!chosen.length) return setMsg({ ok: false, text: "공유할 서류를 선택해주세요." });
    const target = shareMode === "lecture" ? lectureOptions.find((l) => l.id === targetLectureId) ?? (lecture?.id === targetLectureId ? lecture : null) : null;
    if (shareMode === "lecture" && !target) return setMsg({ ok: false, text: "링크를 넣을 일정을 선택해주세요." });
    reset();
    try {
      const { blob, name, names, session } = await buildZip(target ?? lecture);
      setBusy("드라이브에 올리는 중…");
      const bundleFileId = await uploadToDrive(session.token, session.bundlesFolderId, blob, name, "application/zip");
      setBusy("공유 링크 만드는 중…");
      const r = await recordSubmission({
        lectureId: target?.id ?? lecture?.id ?? null,
        documentIds: chosen.map((d) => d.id),
        zipName: name,
        fileNames: names,
        method: "drive_link",
        bundleFileId,
        attachToLecture: shareMode === "lecture",
      });
      if (!r.ok) throw new Error(r.error);
      setShareUrl(r.shareUrl ?? null);
      setMsg({
        ok: true,
        text: r.attachedTitle
          ? `'${r.attachedTitle}' 일정 메모에 공유 링크를 넣었습니다. 구글 캘린더 일정에도 반영됩니다.`
          : "공유 링크를 만들었습니다. 복사하거나 바로 보내세요.",
      });
      setShareOpen(false);
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
      <div className="flex gap-3 text-sm">
        <button type="button" className="underline" onClick={() => setSelected(new Set(documents.map((d) => d.id)))}>
          전체 선택
        </button>
        <button type="button" className="underline" onClick={() => setSelected(new Set())}>
          선택 해제
        </button>
      </div>
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
                {docs.length > 1 && <span className="text-xs font-normal text-muted">{docs.length}개</span>}
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

      {stale.length > 0 && <p className="text-sm text-warn">선택한 서류 중 {stale.length}개가 발급 3개월이 지났습니다.</p>}

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl bg-surface/95 py-2 backdrop-blur">
        <button type="button" disabled={!!busy || !chosen.length} onClick={submit} className="btn-primary">
          제출 (압축파일 만들기 · {chosen.length})
        </button>
        <button
          type="button"
          disabled={!!busy || !chosen.length}
          onClick={() => setShareOpen((v) => !v)}
          className={`chip ${shareOpen ? "chip-on" : ""}`}
        >
          공유
        </button>
      </div>

      {shareOpen && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={`choice ${shareMode === "link" ? "choice-on" : ""}`}>
              <input type="radio" className="sr-only" checked={shareMode === "link"} onChange={() => setShareMode("link")} />
              링크로 공유
            </label>
            <label className={`choice ${shareMode === "lecture" ? "choice-on" : ""}`}>
              <input type="radio" className="sr-only" checked={shareMode === "lecture"} onChange={() => setShareMode("lecture")} />
              일정에 공유
            </label>
          </div>
          {shareMode === "link" ? (
            <p className="text-xs text-muted">
              압축파일을 구글 드라이브에 올리고 &apos;링크가 있는 사람은 보기 가능&apos; 링크를 만듭니다. 복사해서 메일·카톡으로 보내세요.
            </p>
          ) : (
            <>
              <label className="field">
                <span>링크를 넣을 일정</span>
                <select value={targetLectureId} onChange={(e) => setTargetLectureId(e.target.value)} className="input">
                  <option value="">일정을 선택하세요</option>
                  {lecture && !lectureOptions.some((l) => l.id === lecture.id) && <option value={lecture.id}>{lecture.title}</option>}
                  {lectureOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {shortDate(l.lecture_date)} {l.title}
                      {l.organization ? ` · ${l.organization}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted">
                공유 링크를 만들어 그 일정의 메모와 제출 기록에 넣습니다. 구글 캘린더의 &apos;강의 일정(ERP)&apos; 일정 메모에도 반영되어
                휴대폰 캘린더에서 바로 열 수 있습니다.
              </p>
            </>
          )}
          <button type="button" disabled={!!busy} onClick={share} className="btn-primary">
            공유 링크 만들기
          </button>
        </div>
      )}

      {busy && <p className="text-sm text-muted">{busy}</p>}
      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      {ready && <SaveBox ready={ready} />}
      {shareUrl && <ShareBox url={shareUrl} />}

      {submissions.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">제출 기록 {submissions.length}건</summary>
          <ul className="mt-2 space-y-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-xl bg-bg p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {new Date(s.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-muted">
                    {s.method === "download" ? "압축파일" : s.attached_to_lecture ? "일정에 공유" : "링크 공유"}
                  </span>
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

function SaveBox({ ready }: { ready: { url: string; name: string; file: File } }) {
  const [shareErr, setShareErr] = useState<string | null>(null);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [ready.file] });

  return (
    <div className="space-y-2 rounded-xl border border-accent p-3">
      <p className="break-all text-sm font-medium">{ready.name}</p>
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
                if (e instanceof Error && e.name !== "AbortError") setShareErr("보내지 못했습니다. '파일 저장'을 이용하세요.");
              }
            }}
          >
            카톡·메일로 바로 보내기
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

function ShareBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="space-y-2 rounded-xl border border-accent p-3">
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
      {canShare && (
        <button
          type="button"
          className="chip"
          onClick={() => navigator.share({ url, title: "제출 서류" }).catch(() => undefined)}
        >
          카톡·메일로 링크 보내기
        </button>
      )}
      <p className="text-xs text-muted">링크를 아는 사람은 누구나 열 수 있습니다. 상대가 받은 뒤에는 &apos;공유 중지&apos;를 눌러주세요.</p>
    </div>
  );
}
