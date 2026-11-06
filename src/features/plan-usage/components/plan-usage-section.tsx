import { listPlanUsage } from "../queries";
import { PlanUsageCard } from "./plan-usage-card";

/** 대시보드의 플랜 사용량. 값은 PC 스크립트가 보낸다 (scripts/plan-usage) */
export async function PlanUsageSection() {
  const usage = await listPlanUsage();
  const now = new Date().getTime();
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 items-center">
        <h2 className="section-title">플랜 사용량</h2>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3">
        <PlanUsageCard title="Claude" hint="터미널의 Claude Code를 쓰면 들어옵니다." usage={usage.find((u) => u.provider === "claude")} now={now} />
        <PlanUsageCard title="Codex" hint="PC가 켜져 있으면 15분마다 들어옵니다." usage={usage.find((u) => u.provider === "codex")} now={now} />
      </div>
    </section>
  );
}
