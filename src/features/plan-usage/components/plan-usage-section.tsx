import { listPlanUsage } from "../queries";
import { PlanUsageCard } from "./plan-usage-card";

/** 대시보드의 플랜 사용량. 값은 PC 스크립트가 보낸다 (scripts/plan-usage) */
export async function PlanUsageSection() {
  const usage = await listPlanUsage();
  const now = new Date().getTime();
  return (
    <section className="space-y-3">
      <h2 className="section-title">플랜 사용량</h2>
      <div className="flex flex-wrap gap-3">
        <PlanUsageCard title="Claude" hint="터미널의 Claude Code를 쓰면 들어옵니다." usage={usage.find((u) => u.provider === "claude")} now={now} />
        <PlanUsageCard title="Codex" hint="PC가 켜져 있으면 15분마다 들어옵니다." usage={usage.find((u) => u.provider === "codex")} now={now} />
      </div>
      <p className="text-xs text-muted">이 PC에서 받은 마지막 값입니다. Codex 값은 ChatGPT 채팅 한도가 아니라 Codex 한도입니다.</p>
    </section>
  );
}
