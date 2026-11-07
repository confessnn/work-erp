import { AddSourceForm, SourceList } from "@/features/family/components/source-panel";
import { getFamilyRole, listMyFamilySources } from "@/features/family/queries";

export default async function FamilyCalendarsPage() {
  const [role, sources] = await Promise.all([getFamilyRole(), listMyFamilySources()]);
  return (
    <>
      <h1 className="page-title">구글 캘린더 연결</h1>
      <p className="text-sm text-muted">
        내 구글 캘린더 일정을 가족 달력으로 가져와요. 구글 → ERP 한 방향이라, 가져온 일정은 구글 캘린더에서 고치면 다음 가져오기 때
        반영돼요. 가족 달력을 열 때(30분마다)와 매일 아침에 자동으로 가져와요.
      </p>

      <section className="card space-y-3">
        <h2 className="section-title">내가 연결한 캘린더</h2>
        <SourceList sources={sources} />
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">새로 연결</h2>
        <details className="rounded-xl bg-accent-soft/60 p-3 text-sm">
          <summary className="cursor-pointer font-medium">iCal 비공개 주소 찾는 법</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>휴대폰 앱에서는 안 보여요. 인터넷(크롬)에서 <b>calendar.google.com</b>을 열고, 휴대폰이면 메뉴에서 <b>데스크톱 버전</b>으로 바꿔요.</li>
            <li>오른쪽 위 톱니바퀴 → <b>설정</b>으로 들어가요.</li>
            <li>왼쪽 <b>내 캘린더의 설정</b>에서 가져올 캘린더(보통 내 이름)를 눌러요.</li>
            <li>아래쪽 <b>캘린더 통합</b>의 <b>iCal 형식의 비공개 주소</b>를 복사해서 아래에 붙여 넣어요.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            이 주소를 아는 사람은 그 캘린더 전체를 볼 수 있어요. 다른 곳에 올리지 마세요. ERP에서는 등록한 본인만 볼 수 있고 화면에 다시
            보여 주지 않아요.
          </p>
        </details>
        <AddSourceForm defaultPerson={role.role === "member" ? "mom" : "dad"} />
      </section>
    </>
  );
}
