import { TodoWidget } from "@/features/todos/components/todo-widget";
import { hasFamilyPartner, listSharedTodos, listTodayTodos } from "@/features/todos/queries";
import { todayInSeoul } from "@/lib/format";

/**
 * 오늘 할 일 (초대받은 가족 계정의 메뉴). 각자 자기 할 일을 따로 적고,
 * '공유'를 켠 할 일만 서로의 '공유받은 할 일'에 보인다.
 */
export default async function TodosPage() {
  const today = todayInSeoul();
  const [todos, shared, canShare] = await Promise.all([listTodayTodos(today), listSharedTodos(today), hasFamilyPartner()]);
  return (
    <>
      <h1 className="page-title">할 일</h1>
      <p className="text-sm text-muted">
        내 할 일은 나만 봐요. 같이 알아야 할 일은 <b>공유</b>를 누르면 가족의 &apos;공유받은 할 일&apos;에 보이고, 서로 완료 체크를 할 수
        있어요. 오늘 가족 일정과 그 메모도 할 일로 들어와요.
      </p>
      <TodoWidget key={today} initial={todos} today={today} shared={shared} canShare={canShare} />
    </>
  );
}
