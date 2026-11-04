import { notFound } from "next/navigation";
import { deleteLecture, updateLecture } from "@/features/lectures/actions";
import { DeleteButton } from "@/features/lectures/components/delete-button";
import { LectureForm } from "@/features/lectures/components/lecture-form";
import { getLecture, listOrganizations } from "@/features/lectures/queries";

export default async function EditLecturePage({ params }: PageProps<"/lectures/[id]">) {
  const { id } = await params;
  const [lecture, organizations] = await Promise.all([getLecture(id), listOrganizations()]);
  if (!lecture) notFound();

  return (
    <>
      <h1 className="text-2xl font-bold">일정 수정</h1>
      <LectureForm
        action={updateLecture.bind(null, id)}
        lecture={lecture}
        organizations={organizations}
        submitLabel="수정 저장"
      />
      <form action={deleteLecture.bind(null, id)} className="border-t border-line pt-6">
        <DeleteButton />
      </form>
    </>
  );
}
