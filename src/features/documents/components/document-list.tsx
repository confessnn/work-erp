"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument, setArchived, updateDocumentInfo } from "../actions";
import { isStale } from "../naming";
import { DOC_TYPES, type DocumentRow } from "../types";

const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const size = (b: number | null) => (b ? (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(b / 1024)}KB`) : "");

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const today = todaySeoul();
  const visible = documents.filter((d) => showArchived || !d.archived);
  const archivedCount = documents.filter((d) => d.archived).length;

  if (!documents.length) return <p className="card text-center text-muted">아직 올린 서류가 없습니다.</p>;

  return (
    <div className="space-y-4">
      {DOC_TYPES.map((t) => {
        const docs = visible.filter((d) => d.doc_type === t.key);
        if (!docs.length) return null;
        return (
          <section key={t.key} className="card space-y-2">
            <h3 className="section-title">{t.label}</h3>
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className={`text-sm ${d.archived ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a
                      href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      {d.title || d.file_name}
                    </a>
                    <span className="text-muted">
                      {[d.issued_on && `발급 ${d.issued_on}`, size(d.size_bytes), d.archived && "이전 버전"].filter(Boolean).join(" · ")}
                    </span>
                    {!d.archived && isStale(d, today) && <span className="text-warn">발급 3개월 지남</span>}
                    <span className="ml-auto flex gap-3">
                      <button type="button" className="underline" onClick={() => setEditing(editing === d.id ? null : d.id)}>
                        수정
                      </button>
                      <button
                        type="button"
                        className="underline"
                        disabled={pending}
                        onClick={() => start(() => setArchived(d.id, !d.archived))}
                      >
                        {d.archived ? "다시 사용" : "보관"}
                      </button>
                      <button
                        type="button"
                        className="text-danger underline"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm("이 서류를 삭제할까요? 드라이브 파일은 휴지통으로 이동합니다(30일 안에 복구 가능).")) return;
                          start(async () => {
                            const r = await deleteDocument(d.id);
                            if (!r.ok) alert(r.error);
                            router.refresh();
                          });
                        }}
                      >
                        삭제
                      </button>
                    </span>
                  </div>
                  {editing === d.id && (
                    <form
                      action={async (fd) => {
                        await updateDocumentInfo(d.id, fd);
                        setEditing(null);
                      }}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <label className="field">
                        <span>구분 이름</span>
                        <input name="title" defaultValue={d.title ?? ""} className="input" />
                      </label>
                      <label className="field">
                        <span>발급일</span>
                        <input name="issued_on" type="date" defaultValue={d.issued_on ?? ""} className="input" />
                      </label>
                      <button type="submit" className="btn-primary">저장</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {archivedCount > 0 && (
        <button type="button" className="text-sm text-muted underline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "이전 버전 숨기기" : `이전 버전 ${archivedCount}개 보기`}
        </button>
      )}
    </div>
  );
}
