import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteFamilyEvent, saveFamilyEvent } from "@/features/family/actions";
import { FamilyEventForm } from "@/features/family/components/event-form";
import { getFamilyEvent } from "@/features/family/queries";
import { personOf } from "@/features/family/types";
import { DeleteButton } from "@/features/lectures/components/delete-button";
import { ReminderBell } from "@/features/reminders/components/reminder-bell";
import { familyEventTarget, reminderKey } from "@/features/reminders/keys";
import { listMyReminderKeys } from "@/features/reminders/queries";
import { dateLabel, timeLabel, todayInSeoul } from "@/lib/format";

export default async function EditFamilyEventPage({ params }: PageProps<"/family/[id]">) {
  const { id } = await params;
  const [event, keys] = await Promise.all([getFamilyEvent(id), listMyReminderKeys()]);
  if (!event) notFound();

  const target = familyEventTarget(event);
  const bell =
    event.event_date >= todayInSeoul() ? (
      <ReminderBell target={target} on={keys.includes(reminderKey(target.kind, target.ref))} allDay={!event.start_time} withLabel />
    ) : null;

  // 구글 캘린더에서 가져온 일정은 다음 가져오기 때 덮어쓰이므로 여기서는 보기만
  if (event.source_id) {
    const p = personOf(event.person);
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">가족 일정</h1>
          {bell}
        </div>
        <section className="card space-y-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.cls}`}>{p.label}</span>
          <p className="text-lg font-semibold">{event.title}</p>
          <p className="text-sm text-muted">
            {dateLabel(event.event_date)}{" "}
            {event.start_time ? `${timeLabel(event.start_time)}${event.end_time ? `–${timeLabel(event.end_time)}` : ""}` : "종일"}
          </p>
        </section>
        <p className="text-sm text-muted">구글 캘린더에서 가져온 일정이에요. 고치거나 지우려면 구글 캘린더에서 해 주세요.</p>
        <Link href={`/family?y=${Number(event.event_date.slice(0, 4))}&m=${Number(event.event_date.slice(5, 7))}`} className="chip inline-block">
          가족 달력으로
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">가족 일정 수정</h1>
        {bell}
      </div>
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
