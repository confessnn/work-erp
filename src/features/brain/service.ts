import "server-only";
import { after } from "next/server";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { listRecordEntries } from "@/features/records/queries";
import { groupSeries } from "@/features/records/series";
import { todayInSeoul } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { brainContext } from "./context";
import { createFolder, createTextFile, downloadText, folderAlive, FOLDER_MIME, getItem, listChildren, listVaultNotes, mapLimit, updateTextFile } from "./drive";
import { planExport, type ExportPlan } from "./export";
import { MAX_NOTE_CHARS, planSync, syncSummary } from "./sync";
import { planTodoNotes, TODO_FOLDER, type TodoRow } from "./todo-notes";
import { memoNote } from "./memo";
import { EXPORT_FOLDER, PARA_FOLDERS, parseNote, sectionOf } from "./vault";

/** 세컨드브레인 서버 작업 (동기화·내보내기). Server Action 과 다른 기능의 after() 에서 같이 쓴다 */
export type BrainCtx = Awaited<ReturnType<typeof brainContext>>;

/** 드라이브 볼트의 바뀐 노트를 받아 ERP 사본(brain_notes)을 맞춘다 → 요약 한 줄 */
export async function syncVault(ctx: BrainCtx, vaultId: string): Promise<string> {
  const { supabase, userId, token } = ctx;
  const remote = await listVaultNotes(token, vaultId);
  const { data: local, error } = await supabase.from("brain_notes").select("drive_file_id, path, modified_at").limit(10000);
  if (error) throw new Error(error.message);
  const plan = planSync(remote, local ?? []);

  const rows = await mapLimit(plan.download, 6, async (r) =>
    noteRow(userId, r.id, r.path, (await downloadText(token, r.id)).slice(0, MAX_NOTE_CHARS), r.modifiedTime),
  );
  for (let i = 0; i < rows.length; i += 100) {
    const { error: e } = await supabase.from("brain_notes").upsert(rows.slice(i, i + 100), { onConflict: "user_id,drive_file_id" });
    if (e) throw new Error(`노트를 저장하지 못했어요: ${e.message}`);
  }
  // 내용은 같고 이름·폴더만 바뀐 노트
  await mapLimit(plan.moved, 6, async (r) => {
    const p = parseNote(r.path, "");
    await supabase.from("brain_notes").update({ path: r.path, title: p.title, section: p.section }).eq("drive_file_id", r.id);
  });
  for (let i = 0; i < plan.remove.length; i += 200) {
    await supabase.from("brain_notes").delete().in("drive_file_id", plan.remove.slice(i, i + 200));
  }

  const summary = syncSummary({ total: remote.length, downloaded: rows.length, removed: plan.remove.length, remaining: plan.remaining });
  await supabase.from("brain_settings").update({ last_synced_at: new Date().toISOString(), last_sync_result: summary }).eq("user_id", userId);
  return summary;
}

function noteRow(userId: string, fileId: string, path: string, content: string, modifiedTime: string) {
  const p = parseNote(path, content);
  return {
    user_id: userId,
    drive_file_id: fileId,
    path,
    title: p.title,
    section: p.section,
    content,
    links: p.links,
    tags: p.tags,
    modified_at: modifiedTime,
    synced_at: new Date().toISOString(),
  };
}

/**
 * 내보낼 폴더: 저장해 둔 폴더 → 볼트 안에 새로 만들기 → (볼트가 사용자 폴더라 못 만들면) work-erp 아래에 만들기.
 * ERP가 만든 폴더는 사용자가 볼트 안으로 옮겨도 계속 쓸 수 있다.
 * vaultPath: 볼트 안 경로 ('ERP 기록'), 볼트 밖이면 null
 */
export async function ensureExportFolder(ctx: BrainCtx): Promise<{ folderId: string; vaultPath: string | null }> {
  const { supabase, userId, token, settings } = ctx;
  const save = (id: string) => supabase.from("brain_settings").update({ export_folder_id: id }).eq("user_id", userId);
  const vaultId = settings!.vault_folder_id;
  const saved = settings!.export_folder_id;

  if (saved && (await folderAlive(token, saved))) return { folderId: saved, vaultPath: await pathInVault(token, saved, vaultId) };
  try {
    const f = await createFolder(token, EXPORT_FOLDER, vaultId);
    await save(f.id);
    return { folderId: f.id, vaultPath: EXPORT_FOLDER };
  } catch (e) {
    if (!(e instanceof GoogleApiError && (e.status === 403 || e.status === 404))) throw e;
  }
  // 이미 work-erp 아래에 만들어 둔 폴더가 있으면 그것을 쓴다
  const drive = await driveContext();
  const root = (await getItem(drive.token, drive.folders.docs)).parents?.[0];
  if (!root) throw new Error("work-erp 폴더를 찾지 못했어요.");
  const existing = (await listChildren(token, root)).find((i) => i.mimeType === FOLDER_MIME && i.name === EXPORT_FOLDER);
  const id = existing?.id ?? (await createFolder(token, EXPORT_FOLDER, root)).id;
  await save(id);
  return { folderId: id, vaultPath: null };
}

/** 폴더의 볼트 안 경로 ('ERP 기록', '3 Resources/ERP 기록'). 볼트 밖이면 null */
async function pathInVault(token: string, folderId: string, vaultId: string): Promise<string | null> {
  const names: string[] = [];
  let id = folderId;
  for (let depth = 0; depth < 10; depth++) {
    if (id === vaultId) return names.reverse().join("/");
    let item;
    try {
      item = await getItem(token, id);
    } catch {
      return null; // 못 읽는 상위 폴더 (내 드라이브 맨 위 등)
    }
    if (!item.parents?.length) return null;
    names.push(item.name);
    id = item.parents[0];
  }
  return null;
}

/** 폴더 안 하위 폴더 (없으면 만든다) */
async function ensureSubfolder(token: string, parent: string, name: string): Promise<{ id: string; children: { id: string; name: string }[] }> {
  const existing = (await listChildren(token, parent)).find((i) => i.mimeType === FOLDER_MIME && i.name === name);
  const id = existing?.id ?? (await createFolder(token, name, parent)).id;
  return { id, children: existing ? await listChildren(token, id) : [] };
}

/**
 * 노트들을 폴더에 올린다. 지문이 같으면 건너뛰고, 올린 적 있으면 같은 파일을 덮어쓴다.
 * 이미 올린 노트는 이름을 바꾸지 않는다 (옵시디언 링크가 깨지지 않게).
 * vaultPath 가 있으면 ERP 사본(brain_notes)도 바로 고친다 (동기화를 기다리지 않게).
 */
async function uploadPlans(
  ctx: BrainCtx,
  plans: ExportPlan[],
  folder: { id: string; children?: { id: string; name: string }[]; vaultPath: string | null },
): Promise<{ created: number; updated: number }> {
  const { supabase, userId, token } = ctx;
  const { data: done } = await supabase.from("brain_exports").select("series_key, drive_file_id, file_name, content_digest").in(
    "series_key",
    plans.map((p) => p.key),
  );
  const prev = new Map((done ?? []).map((d) => [d.series_key as string, d]));
  const byName = new Map((folder.children ?? []).map((c) => [c.name, c.id]));
  let created = 0;
  let updated = 0;

  const results = await mapLimit(plans, 4, async (p) => {
    const old = prev.get(p.key);
    if (old && old.content_digest === p.digest) return null;
    const fileName = (old?.file_name as string | undefined) ?? p.fileName;
    // 기록이 없어도 같은 이름 파일이 이미 있으면 (동시에 두 번 눌렀을 때 등) 그 파일을 덮어쓴다
    let fileId = (old?.drive_file_id as string | undefined) ?? byName.get(fileName);
    let up;
    if (fileId) {
      try {
        up = await updateTextFile(token, fileId, fileName, p.content);
        updated++;
      } catch (e) {
        if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 403))) throw e;
        fileId = undefined; // 드라이브에서 지웠으면 새로 만든다
      }
    }
    if (!up) {
      up = await createTextFile(token, folder.id, fileName, p.content);
      created++;
    }
    return { plan: p, fileName, up };
  });
  const changed = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (!changed.length) return { created, updated };

  const now = new Date().toISOString();
  const { error } = await supabase.from("brain_exports").upsert(
    changed.map((r) => ({ user_id: userId, series_key: r.plan.key, drive_file_id: r.up.id, file_name: r.fileName, content_digest: r.plan.digest, exported_at: now })),
    { onConflict: "user_id,series_key" },
  );
  if (error) throw new Error(`내보낸 노트를 저장하지 못했어요: ${error.message}`);
  if (folder.vaultPath !== null) {
    const prefix = folder.vaultPath ? `${folder.vaultPath}/` : "";
    await supabase
      .from("brain_notes")
      .upsert(changed.map((r) => noteRow(userId, r.up.id, `${prefix}${r.fileName}`, r.plan.content, r.up.modifiedTime)), { onConflict: "user_id,drive_file_id" });
  }
  return { created, updated };
}

/** 메모를 넣을 수 없는 볼트(사용자가 만든 폴더)일 때 쓰는 폴더 (ERP 기록 폴더 안) */
export const MEMO_FALLBACK_FOLDER = "메모";

/**
 * 빠른 메모: 볼트의 Inbox 폴더('0 Inbox', 'Inbox' 등)에 .md 로 저장하고 ERP 사본도 바로 만든다 → 노트 ID.
 * Inbox 가 없으면 '0 Inbox'를 만들고, ERP가 쓸 수 없는 폴더면 'ERP 기록/메모'에 넣는다.
 */
export async function saveMemo(ctx: BrainCtx, text: string, title?: string): Promise<{ id: string; path: string }> {
  const { supabase, userId, token, settings } = ctx;
  const memo = memoNote(text, new Date(), title);
  if (!memo) throw new Error("메모를 적어 주세요.");
  const vaultId = settings!.vault_folder_id;
  const writable = (e: unknown) => !(e instanceof GoogleApiError && (e.status === 403 || e.status === 404));

  let up: { id: string; modifiedTime: string } | null = null;
  let path = "";
  const children = await listChildren(token, vaultId);
  const inbox = children.find((c) => c.mimeType === FOLDER_MIME && sectionOf(`${c.name}/x.md`) === "inbox");
  try {
    const folder = inbox ?? { ...(await createFolder(token, PARA_FOLDERS[0], vaultId)), name: PARA_FOLDERS[0] };
    up = await createTextFile(token, folder.id, memo.fileName, memo.content);
    path = `${folder.name}/${memo.fileName}`;
  } catch (e) {
    if (writable(e)) throw e;
  }
  if (!up) {
    const exp = await ensureExportFolder(ctx);
    const sub = await ensureSubfolder(token, exp.folderId, MEMO_FALLBACK_FOLDER);
    up = await createTextFile(token, sub.id, memo.fileName, memo.content);
    if (exp.vaultPath === null) return { id: "", path: "" }; // 볼트 밖: 폴더를 옮기면 동기화로 들어온다
    path = [exp.vaultPath, MEMO_FALLBACK_FOLDER, memo.fileName].filter(Boolean).join("/");
  }

  const { data, error } = await supabase
    .from("brain_notes")
    .upsert(noteRow(userId, up.id, path, memo.content, up.modifiedTime), { onConflict: "user_id,drive_file_id" })
    .select("id")
    .single();
  if (error) throw new Error(`메모는 드라이브에 저장했지만 ERP에 보이게 하지 못했어요. '동기화'를 눌러 주세요. (${error.message})`);
  return { id: data.id as string, path };
}

/** 일정 기록 → 'ERP 기록/<일 이름>.md' */
export async function exportRecords(ctx: BrainCtx, folder: { folderId: string; vaultPath: string | null }) {
  const series = groupSeries(await listRecordEntries(ctx.supabase));
  return uploadPlans(ctx, planExport(series), { id: folder.folderId, vaultPath: folder.vaultPath });
}

/** 대시보드 할 일 → 'ERP 기록/할 일/<날짜>.md' (내가 적은 할 일만, 지운 것 제외) */
export async function exportTodos(ctx: BrainCtx, folder: { folderId: string; vaultPath: string | null }) {
  const { supabase, userId } = ctx;
  const [{ data: todos, error }, { data: exported }] = await Promise.all([
    supabase
      .from("todos")
      .select("id, title, due_date, done_at, created_at, note")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("due_date", { ascending: false })
      .limit(3000),
    supabase.from("brain_exports").select("series_key").like("series_key", "todo:%"),
  ]);
  if (error) throw new Error(error.message);
  const plans = planTodoNotes((todos ?? []) as TodoRow[], (exported ?? []).map((e) => e.series_key as string), todayInSeoul());
  if (!plans.length) return { created: 0, updated: 0 };
  const sub = await ensureSubfolder(ctx.token, folder.folderId, TODO_FOLDER);
  return uploadPlans(ctx, plans, { id: sub.id, children: sub.children, vaultPath: folder.vaultPath === null ? null : `${folder.vaultPath}/${TODO_FOLDER}`.replace(/^\//, "") });
}

/**
 * 할 일을 바꾼 Server Action 끝에서 부른다: 응답을 보낸 뒤 볼트의 할 일 노트를 고친다.
 * 세컨드브레인을 안 쓰거나(볼트·권한 없음) 실패해도 할 일 저장에는 영향이 없다.
 */
export function scheduleTodoExport() {
  after(async () => {
    try {
      // 볼트가 없으면 구글 토큰도 받지 않고 끝낸다
      const { supabase } = await requireUser();
      const { data } = await supabase.from("brain_settings").select("user_id").maybeSingle();
      if (!data) return;
      const ctx = await brainContext();
      if (!ctx.settings) return;
      await exportTodos(ctx, await ensureExportFolder(ctx));
    } catch (e) {
      console.error("세컨드브레인 할 일 반영 실패:", e instanceof Error ? e.message : e);
    }
  });
}
