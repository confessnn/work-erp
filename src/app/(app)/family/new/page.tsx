import { saveFamilyEvent } from "@/features/family/actions";
import { FamilyEventForm } from "@/features/family/components/event-form";
import { getFamilyRole } from "@/features/family/queries";
import { todayInSeoul } from "@/lib/format";

export default async function NewFamilyEventPage({ searchParams }: PageProps<"/family/new">) {
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayInSeoul();
  const role = await getFamilyRole();
  return (
    <>
      <h1 className="page-title">가족 일정 추가</h1>
      <FamilyEventForm
        action={saveFamilyEvent.bind(null, null)}
        defaultDate={date}
        defaultPerson={role.role === "member" ? "mom" : "dad"}
        submitLabel="저장"
      />
    </>
  );
}
