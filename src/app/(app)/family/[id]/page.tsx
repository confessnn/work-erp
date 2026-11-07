import { notFound } from "next/navigation";
import { deleteFamilyEvent, saveFamilyEvent } from "@/features/family/actions";
import { FamilyEventForm } from "@/features/family/components/event-form";
import { getFamilyEvent } from "@/features/family/queries";
import { DeleteButton } from "@/features/lectures/components/delete-button";

export default async function EditFamilyEventPage({ params }: PageProps<"/family/[id]">) {
  const { id } = await params;
  const event = await getFamilyEvent(id);
  if (!event) notFound();
  return (
    <>
      <h1 className="page-title">가족 일정 수정</h1>
      <FamilyEventForm
        action={saveFamilyEvent.bind(null, id)}
        event={event}
        defaultDate={event.event_date}
        defaultPerson={event.person}
        submitLabel="수정 저장"
      />
      <form action={deleteFamilyEvent.bind(null, id)}>
        <DeleteButton />
      </form>
    </>
  );
}
