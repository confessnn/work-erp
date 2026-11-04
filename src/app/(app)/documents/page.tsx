import Link from "next/link";
import { saveDisplayName } from "@/features/documents/actions";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploader } from "@/features/documents/components/document-uploader";
import { driveStatus, getDisplayName, listDocuments, listLectureOptions, listSharedBundles } from "@/features/documents/queries";
import { SubmissionPanel } from "@/features/documents/components/submission-panel";
import { StopShareButton } from "@/features/documents/components/stop-share-button";

export default async function DocumentsPage() {
  const [status, displayName, documents, shared, lectureOptions] = await Promise.all([
    driveStatus(),
    getDisplayName(),
    listDocuments({ includeArchived: true }),
    listSharedBundles(),
    listLectureOptions(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-bold">서류함</h1>
      <p className="text-sm text-muted">
        이력서·증명서를 한 번 올려두면, 여기서 바로(또는 강의 일정 화면의 <b>제출 서류</b>에서) 골라 한 번에 압축해 받거나 공유 링크로 보낼 수
        있습니다. 파일은 구글 드라이브 <b>work-erp/서류함</b> 폴더에 저장됩니다.
      </p>

      {status !== "ready" ? (
        <section className="card text-sm">
          {status === "not_configured" && "구글 연동 설정이 아직 없습니다."}
          {status === "not_connected" && "구글 계정이 연결되어 있지 않습니다."}
          {status === "needs_reconnect" && "구글 드라이브 권한이 아직 없습니다. 구글을 한 번 다시 연결해주세요."}{" "}
          <Link href="/integrations" className="underline">연동 화면으로</Link>
        </section>
      ) : (
        <>
          <section className="card">
            <form action={saveDisplayName} className="flex flex-wrap items-end gap-3">
              <label className="field flex-1">
                <span>파일 이름에 쓸 이름</span>
                <input name="display_name" defaultValue={displayName} placeholder="예: 임승택" className="input" />
              </label>
              <button type="submit" className="btn-primary">저장</button>
            </form>
            <p className="mt-2 text-xs text-muted">
              예: {displayName || "임승택"}_OO대학교_제출서류_20261105.zip 안에 {displayName || "임승택"}_이력서.pdf …
            </p>
          </section>

          {documents.some((d) => !d.archived) && (
            <section className="card space-y-3">
              <h2 className="section-title">제출 · 공유</h2>
              <p className="text-sm text-muted">보낼 서류를 체크하고 제출(압축파일) 또는 공유(링크 / 일정에 공유)를 누르세요.</p>
              <SubmissionPanel
                lecture={null}
                documents={documents.filter((d) => !d.archived)}
                presetTypes={[]}
                lectureOptions={lectureOptions}
                driveReady
              />
            </section>
          )}

          <section className="card space-y-3">
            <h2 className="section-title">서류 올리기</h2>
            <DocumentUploader existing={documents.filter((d) => !d.archived)} />
          </section>

          <DocumentList documents={documents} />

          {shared.length > 0 && (
            <section className="card space-y-2 text-sm">
              <h2 className="section-title">공유 중인 압축파일</h2>
              <p className="text-muted">링크를 아는 사람은 누구나 열 수 있습니다. 상대가 받았으면 공유를 중지하세요.</p>
              <ul className="space-y-1">
                {shared.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2">
                    {s.lecture_id ? (
                      <Link href={`/lectures/${s.lecture_id}`} className="underline">{s.zip_name}</Link>
                    ) : s.share_url ? (
                      <a href={s.share_url} target="_blank" rel="noreferrer" className="underline">{s.zip_name}</a>
                    ) : (
                      <span>{s.zip_name}</span>
                    )}
                    {s.lectures && <span className="text-muted">· {s.lectures.title}</span>}
                    <span className="text-muted">
                      {new Date(s.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </span>
                    <StopShareButton id={s.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
