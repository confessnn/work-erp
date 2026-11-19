"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { MAX_SERIES, MIN_SERIES } from "./graph";
import { listRecordEntries } from "./queries";
import { findRelations } from "./relations";
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

/** 오래된 관계도는 이만큼만 남긴다 */
const KEEP_GRAPHS = 5;

/** '관계 찾기' 버튼: AI가 모든 일의 기록을 읽고 관계를 찾아 저장한다 */
export async function buildGraphAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { supabase } = await requireUser();
    const entries = await listRecordEntries(supabase);
    const series = groupSeries(entries).slice(0, MAX_SERIES);
    if (series.length < MIN_SERIES) return { ok: false, message: `기록이 있는 일이 ${MIN_SERIES}가지 이상 있어야 관계를 찾을 수 있어요.` };

    const relations = await findRelations(series);
    const nodes = series.map((s) => ({ key: s.key, name: s.name, count: s.entries.length }));
    const { error } = await supabase.from("record_graphs").insert({ nodes, relations, entry_count: entries.length });
    if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };

    // 최근 몇 개만 남긴다 (지우기 실패는 관계도에 영향이 없다)
    const { data: old } = await supabase.from("record_graphs").select("id").order("created_at", { ascending: false }).range(KEEP_GRAPHS, 100);
    if (old?.length) await supabase.from("record_graphs").delete().in("id", old.map((r) => r.id));

    revalidatePath("/records/graph");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "관계를 찾지 못했어요." };
  }
}
