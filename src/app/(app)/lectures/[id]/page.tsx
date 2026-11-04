import { notFound } from "next/navigation";
import { deleteLecture, updateLecture } from "@/features/lectures/actions";
import { DeleteButton } from "@/features/lectures/components/delete-button";
import { LectureForm } from "@/features/lectures/components/lecture-form";
import { getLecture, listOrganizations } from "@/features/lectures/queries";
import { SubmissionPanel } from "@/features/documents/components/submission-panel";
import { driveStatus, lastDocTypesForOrganization, listDocuments, listSubmissions } from "@/features/documents/queries";

export default async function EditLecturePage({ params }: PageProps<"/lectures/[id]">) {
  const { id } = await params;
  const [lecture, organizations] = await Promise.all([getLecture(id), listOrganizations()]);
  if (!lecture) notFound();
  const [status, documents, submissions, lastTypes] = await Promise.all([
    driveStatus(),
    listDocuments(),
    listSubmissions(id),
    lastDocTypesForOrganization(lecture.organization, id),
  ]);
  // 이 강의에서 이미 제출한 적이 있으면 그 서류를, 없으면 같은 기관에 냈던 서류 종류를 미리 체크
  const presetTypes = submissions[0]?.doc_types ?? lastTypes;

  return (
    <>
      <h1 className="text-2xl font-bold">일정 수정</h1>
      <LectureForm
        action={updateLecture.bind(null, id)}
        lecture={lecture}
        organizations={organizations}
        submitLabel="수정 저장"
      />
      <section id="documents" className="card space-y-3">
        <h2 className="section-title">제출 서류</h2>
        <SubmissionPanel
          lecture={{ id: lecture.id, title: lecture.title, organization: lecture.organization }}
          documents={documents}
          presetTypes={presetTypes}
          submissions={submissions}
          driveReady={status === "ready"}
        />
      </section>
      <form action={deleteLecture.bind(null, id)} className="border-t border-line pt-6">
        <DeleteButton />
      </form>
    </>
  );
}
