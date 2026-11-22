import { getBabyInfo } from "@/features/baby/queries";
import { BabyTabs } from "@/features/baby-care/components/baby-tabs";
import { BabyTodoBoard } from "@/features/baby-care/components/baby-todo-board";
import { listBabyTodos } from "@/features/baby-care/queries";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";

/** 아기 할 일: 부부 공용 (가족 누구나 만들고 고치고 완료) */
export default async function BabyTodosPage() {
  const today = todayInSeoul();
  const [{ userId }, baby, todos] = await Promise.all([requireUser(), getBabyInfo(), listBabyTodos(today)]);
  const name = baby.name ?? "아기";
  return (
    <>
      <div className="space-y-2">
        <h1 className="page-title">{name} 할 일</h1>
        <BabyTabs active="todos" />
      </div>
      <BabyTodoBoard initial={todos} today={today} me={userId} name={name} />
    </>
  );
}
