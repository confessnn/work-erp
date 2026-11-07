import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteForm, InviteList, MemberList } from "@/features/family/components/family-admin";
import { getFamilyRole, listFamilyAdmin } from "@/features/family/queries";

export default async function FamilySettingsPage() {
  const role = await getFamilyRole();
  if (role.role !== "owner") redirect("/family");
  const [{ invites, members }, h] = await Promise.all([listFamilyAdmin(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  return (
    <>
      <h1 className="page-title">가족 초대</h1>
      <p className="text-sm text-muted">
        초대받은 가족은 본인 이메일로 가입해 <b>가족 달력</b>만 쓸 수 있어요. 가족 일정은 같이 보고 입력하며, 강의는 제목과
        시간만 보여요. 강의료, 세금, 수령 여부, 메모, 공고, 서류함, 세금계산서는 볼 수 없어요.
      </p>

      <section className="card space-y-4">
        <h2 className="section-title">초대 링크</h2>
        <InviteForm />
        <InviteList invites={invites} origin={origin} />
        <p className="text-xs text-muted">링크는 7일 동안, 한 번만 쓸 수 있어요. 카톡으로 보내 주세요.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">참여한 가족</h2>
        <MemberList members={members} />
      </section>
    </>
  );
}
