"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { fromLocalInput, KINDS, POO_COLORS, SUPPLEMENT_KINDS, SUPPLEMENTS, TIMED_KINDS, type CareKind } from "./care";

type Result = { ok: true } | { ok: false; message: string };

export type CareInput = {
  kind: CareKind;
  started: string; // datetime-local (한국 시간)
  ended?: string | null;
  amount_ml?: number | null;
  value?: number | null;
  height_cm?: number | null;
  side?: string | null;
  diaper?: string | null;
  poo_color?: string | null;
  supplements?: string[] | null;
  label?: string | null;
  note?: string | null;
};

const num = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** 종류에 맞는 칸만 남기고 값을 확인한다 */
function toRow(input: CareInput) {
  const info = KINDS.find((k) => k.key === input.kind);
  if (!info) return { error: "기록 종류가 올바르지 않아요." } as const;
  const started_at = fromLocalInput(input.started);
  if (!started_at) return { error: "시각을 확인해 주세요." } as const;
  const ended_at = input.ended ? fromLocalInput(input.ended) : null;
  if (input.ended && !ended_at) return { error: "끝난 시각을 확인해 주세요." } as const;
  if (ended_at && ended_at < started_at) return { error: "끝난 시각이 시작보다 빨라요." } as const;

  const row = {
    kind: input.kind,
    started_at,
    ended_at: TIMED_KINDS.includes(input.kind) ? ended_at : null,
    amount_ml: ["formula", "pumped", "pump", "water"].includes(input.kind) ? num(input.amount_ml, 5000) : null,
    value: ["weight", "temperature", "solid"].includes(input.kind) ? num(input.value, 999) : null,
    height_cm: input.kind === "weight" ? num(input.height_cm, 200) : null,
    side: ["breast", "pump"].includes(input.kind) && ["left", "right", "both"].includes(String(input.side)) ? input.side : null,
    diaper: input.kind === "diaper" && ["pee", "poo", "both"].includes(String(input.diaper)) ? input.diaper : null,
    // 대변 색은 대변이 있을 때만
    poo_color:
      input.kind === "diaper" && ["poo", "both"].includes(String(input.diaper)) && POO_COLORS.some((c) => c.key === input.poo_color)
        ? input.poo_color
        : null,
    // 철분제·유산균은 분유·유축수유에만
    supplements: SUPPLEMENT_KINDS.includes(input.kind) ? SUPPLEMENTS.map((s) => s.key).filter((k) => input.supplements?.includes(k)) : [],
    label: ["medicine", "solid", "hospital", "other", "bath"].includes(input.kind) ? text(input.label, 100) : null,
    note: text(input.note, 1000),
  };
  if (row.amount_ml !== null) row.amount_ml = Math.round(row.amount_ml);
  if (input.kind === "diaper" && !row.diaper) return { error: "소변·대변을 골라 주세요." } as const;
  if (input.kind === "temperature" && row.value === null) return { error: "체온을 적어 주세요." } as const;
  if (input.kind === "weight" && row.value === null && row.height_cm === null) return { error: "키나 몸무게를 적어 주세요." } as const;
  if (row.height_cm !== null) row.height_cm = Math.round(row.height_cm * 10) / 10;
  return { row } as const;
}

const refresh = () => {
  revalidatePath("/baby/care");
};

export async function saveCareLog(id: string | null, input: CareInput): Promise<Result> {
  const parsed = toRow(input);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? "확인해 주세요." };
  const { supabase } = await requireUser();
  const { error } = id
    ? await supabase.from("baby_logs").update(parsed.row).eq("id", id)
    : await supabase.from("baby_logs").insert(parsed.row);
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  refresh();
  return { ok: true };
}

/** 자는 중인 잠을 지금 끝내기 */
export async function endSleep(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("baby_logs")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kind", "sleep")
    .is("ended_at", null);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}

export async function deleteCareLog(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("baby_logs").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}
