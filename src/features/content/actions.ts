"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { writeDraft } from "./ai";
import type { DraftFormat } from "./formats";
import { addDraftPage, pageTitle, parseNotionId, postUrl, whoAmI } from "./notion";
import { resultText, runContent } from "./run";
import { normalizeHandle } from "./x-api";

type Result = { ok: boolean; message: string };
const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : "알 수 없는 오류" });
const done = (message: string): Result => {
  revalidatePath("/content");
  return { ok: true, message };
};

async function myJob() {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase.rpc("content_job", { p_secret: null, p_user: null });
  if (error) throw new Error(error.message);
  const [job] = (data ?? []) as { x_token: string | null; notion_token: string | null; notion_parent: string | null }[];
  return { supabase, userId, job };
}

/** X Bearer 토큰 / 노션 연결 토큰 저장 (금고). 노션은 저장 전에 맞는지 확인한다 */
export async function saveContentToken(kind: "x" | "notion", raw: string): Promise<Result> {
  const token = raw.trim();
  if (!token) return { ok: false, message: "토큰을 붙여 넣어 주세요." };
  try {
    let name = "";
    if (kind === "notion") name = await whoAmI(token);
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("set_content_token", { p_kind: kind, p_token: token });
    if (error) return { ok: false, message: error.message };
    return done(kind === "x" ? "X 토큰을 저장했어요. '지금 모으기'로 확인해 보세요." : `노션 연결 '${name}'을 확인하고 저장했어요.`);
  } catch (e) {
    return fail(e);
  }
}

export async function clearContentToken(kind: "x" | "notion"): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_content_token", { p_kind: kind, p_token: "" });
  return error ? fail(new Error(error.message)) : done("토큰을 지웠어요.");
}

/** 노션에서 글을 쌓을 페이지 (그 아래에 'X 인사이트' DB를 만든다) */
export async function saveNotionPage(input: string): Promise<Result> {
  const id = parseNotionId(input);
  if (!id) return { ok: false, message: "노션 페이지 주소를 붙여 넣어 주세요 (주소 끝에 32자리 영문·숫자가 있어요)." };
  try {
    const { supabase, userId, job } = await myJob();
    if (!job?.notion_token) return { ok: false, message: "노션 토큰을 먼저 저장해 주세요." };
    const title = await pageTitle(job.notion_token, id);
    const { error } = await supabase.from("content_settings").update({ notion_parent: id, notion_db: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return { ok: false, message: error.message };
    return done(`'${title}' 페이지에 연결했어요. 첫 기록 때 그 아래에 'X 인사이트' 표를 만들어요.`);
  } catch (e) {
    return fail(e);
  }
}

/** 관심 분야 (쉼표·줄바꿈으로 구분) + 하루 예산 */
export async function saveContentSettings(fieldsText: string, budget: number): Promise<Result> {
  const fields = [...new Set(fieldsText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 20).map((s) => s.slice(0, 40));
  const daily = Math.max(0, Math.min(3000, Math.round(budget || 0)));
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("content_settings")
    .upsert({ user_id: userId, fields, daily_budget: daily, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return error ? fail(new Error(error.message)) : done("저장했어요.");
}

export async function setContentEnabled(on: boolean): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("content_settings").upsert({ user_id: userId, enabled: on }, { onConflict: "user_id" });
  return error ? fail(new Error(error.message)) : done(on ? "매일 자동 수집을 켰어요." : "매일 자동 수집을 껐어요.");
}

export async function addSource(handleInput: string, field: string): Promise<Result> {
  const handle = normalizeHandle(handleInput);
  if (!handle) return { ok: false, message: "X 아이디를 확인해 주세요 (@ 뒤 영문·숫자·_ 15자까지)." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("x_sources").insert({ handle, field: field.trim() || null });
  if (error) return fail(new Error(error.code === "23505" ? `@${handle}은 이미 있어요.` : error.message));
  return done(`@${handle}을 추가했어요.`);
}

export async function updateSource(id: string, patch: { active?: boolean; field?: string | null }): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("x_sources").update(patch).eq("id", id);
  return error ? fail(new Error(error.message)) : done("바꿨어요.");
}

export async function deleteSource(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("x_sources").delete().eq("id", id);
  return error ? fail(new Error(error.message)) : done("지웠어요. 모아 둔 글은 그대로 있어요.");
}

/** '지금 모으기': 매일 크론과 같은 일을 지금 한 번 */
export async function runContentNow(): Promise<Result> {
  try {
    const { supabase } = await requireUser();
    const r = await runContent({ db: supabase, secret: null, user: null, deadline: Date.now() + 270_000 });
    revalidatePath("/content");
    return { ok: r.problems.length === 0, message: resultText(r) };
  } catch (e) {
    return fail(e);
  }
}

/** 고른 글로 콘텐츠 초안. 노션이 연결돼 있으면 연결 페이지 아래 새 페이지로도 저장 */
export async function makeDraft(ids: string[], format: DraftFormat, note: string): Promise<{ ok: boolean; message: string; text?: string; url?: string }> {
  if (!ids.length) return { ok: false, message: "참고할 글을 골라 주세요." };
  if (ids.length > 12) return { ok: false, message: "한 번에 12개까지 골라 주세요." };
  try {
    const { supabase, job } = await myJob();
    const { data, error } = await supabase.from("x_posts").select("id, handle, text, summary").in("id", ids);
    if (error) return { ok: false, message: error.message };
    const posts = (data ?? []) as { id: string; handle: string; text: string; summary: string | null }[];
    if (!posts.length) return { ok: false, message: "고른 글을 찾지 못했어요." };
    const text = await writeDraft(posts, format, note);
    let url: string | undefined;
    if (job?.notion_token && job.notion_parent) {
      const [first, ...rest] = text.split("\n");
      url = await addDraftPage(job.notion_token, job.notion_parent, `[초안] ${first.replace(/^#+\s*/, "").slice(0, 100)}`, rest.join("\n"), posts.map((p) => postUrl(p.handle, p.id)));
    }
    return { ok: true, message: url ? "초안을 만들고 노션에 저장했어요." : "초안을 만들었어요 (노션 미연결이라 화면에만).", text, url };
  } catch (e) {
    return fail(e);
  }
}
