import { escapeTg } from "@/features/telegram/api";
import { postUrl } from "./notion";
import type { RunResult } from "./run";

const ERP_URL = "https://work-erp-one.vercel.app";

/** 매일 수집 뒤 텔레그램 한 통: 받은 수와 아이디어 점수 상위 3개 */
export function contentTelegram(r: RunResult) {
  const lines = [`📚 <b>콘텐츠 창고</b> · 새 글 ${r.added}개 · AI 정리 ${r.analyzed}개`];
  if (r.top.length) {
    lines.push("", "<b>오늘의 재료 Top 3</b>");
    for (const t of r.top) {
      const head = `${"★".repeat(t.idea_score ?? 0)} [${escapeTg(t.field ?? "기타")}] ${escapeTg(t.summary ?? t.text.slice(0, 60))}`;
      lines.push(`• ${head}`, `  💡 ${escapeTg(t.idea ?? "")} · <a href="${postUrl(t.handle, t.id)}">@${escapeTg(t.handle)}</a>`);
    }
  }
  if (r.problems.length) lines.push("", `⚠️ ${escapeTg(r.problems.join(" / ").slice(0, 600))}`);
  return { html: lines.join("\n"), buttons: [{ text: "콘텐츠 창고 열기", url: `${ERP_URL}/content` }] };
}
