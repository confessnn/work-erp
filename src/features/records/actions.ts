"use server";

import { listRecordEntries } from "./queries";
import { reviewSeries } from "./review";
import { groupSeries } from "./series";

/** '개선점 정리' 버튼: 같은 일의 지난 기록들을 AI가 돌아본다 (저장하지 않고 화면에만 보여 준다) */
export async function reviewSeriesAction(key: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  try {
    const series = groupSeries(await listRecordEntries()).find((s) => s.key === key);
    if (!series) return { ok: false, message: "이 일의 기록을 찾지 못했어요." };
    return { ok: true, text: await reviewSeries(series) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "정리하지 못했어요." };
  }
}
