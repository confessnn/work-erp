import { createLecture } from "@/features/lectures/actions";
import { LectureForm } from "@/features/lectures/components/lecture-form";
import { listOrganizations } from "@/features/lectures/queries";
import { todayInSeoul } from "@/lib/format";

export default async function NewLecturePage() {
  const organizations = await listOrganizations();
  return (
    <>
      <h1 className="page-title">일정 추가</h1>
      <LectureForm
        action={createLecture}
        organizations={organizations}
        defaultDate={todayInSeoul()}
        submitLabel="저장"
      />
    </>
  );
}
