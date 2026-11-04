"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getDriveSession, registerDocument } from "../actions";
import { uploadToDrive } from "../drive-browser";
import { DOC_TYPES, docTypeInfo, type DocumentRow } from "../types";

const MAX_MB = 50;

export function DocumentUploader({ existing }: { existing: DocumentRow[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("resume");
  const [title, setTitle] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const info = docTypeInfo(docType);
  const sameType = existing.filter((d) => d.doc_type === docType && (d.title ?? "") === title.trim());
  const needsDate = "freshDays" in info;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: "파일을 선택해주세요." });
    if (file.size > MAX_MB * 1024 * 1024) return setMsg({ ok: false, text: `${MAX_MB}MB 이하 파일만 올릴 수 있습니다.` });

    setBusy(true);
    setMsg(null);
    try {
      const s = await getDriveSession();
      if (!s.ok) throw new Error(s.error);
      const fileId = await uploadToDrive(s.token, s.docsFolderId, file, file.name);
      const r = await registerDocument({
        driveFileId: fileId,
        docType,
        title,
        issuedOn,
        replaceIds: replace ? sameType.map((d) => d.id) : [],
      });
      if (!r.ok) throw new Error(r.error);
      setMsg({ ok: true, text: `'${info.label}'을(를) 서류함에 올렸습니다.` });
      if (fileRef.current) fileRef.current.value = "";
      setTitle("");
      setIssuedOn("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "업로드 실패" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="field">
          <span>서류 종류</span>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="input">
            {DOC_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>구분 이름 (선택)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder={docType === "certificate" ? "예: 정보처리기사" : "같은 종류가 여러 개일 때만"}
          />
        </label>
        <label className="field">
          <span>발급일 {needsDate ? "(유효기간 안내에 사용)" : "(선택)"}</span>
          <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className="input" />
        </label>
        <label className="field">
          <span>파일 (PDF·사진·한글 등, {MAX_MB}MB 이하)</span>
          <input ref={fileRef} type="file" className="input" />
        </label>
      </div>
      {sameType.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          기존 &apos;{info.label}{title ? ` ${title}` : ""}&apos;을(를) 이전 버전으로 보관하고 이 파일로 바꾸기
        </label>
      )}
      {"sensitive" in info && (
        <p className="text-xs text-warn">신분증·통장 사본은 꼭 필요할 때만 제출하고, 공유 링크로 보냈다면 받은 뒤 공유를 중지하세요.</p>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      <button type="button" onClick={upload} disabled={busy} className="btn-primary">
        {busy ? "올리는 중…" : "서류함에 올리기"}
      </button>
    </div>
  );
}
