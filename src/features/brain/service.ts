import "server-only";
import { after } from "next/server";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { listRecordEntries } from "@/features/records/queries";
import { groupSeries } from "@/features/records/series";
import { todayInSeoul } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { brainContext } from "./context";
import { createFolder, createTextFile, downloadText, folderAlive, FOLDER_MIME, getItem, listChildren, listVaultNotes, liveFile, mapLimit, trashFile, updateTextFile, type Uploaded } from "./drive";
import { planExport, type ExportPlan } from "./export";
import { MAX_NOTE_CHARS, planSync, readAllPages, splitDuplicates, syncSummary } from "./sync";
import { planTodoNotes, TODO_FOLDER, type TodoRow } from "./todo-notes";
import { editMemo, isErpMemo, memoNote } from "./memo";
import { EXPORT_FOLDER, PARA_FOLDERS, parseNote, sectionOf } from "./vault";

/** 세컨드브레인 서버 작업 (동기화·내보내기). Server Action 과 다른 기능의 after() 에서 같이 쓴다 */
export type BrainCtx = Awaited<ReturnType<typeof brainContext>>;

/** 드라이브 볼트의 바뀐 노트를 받아 ERP 사본(brain_notes)을 맞춘다 → 요약 한 줄 */
export async function syncVault(ctx: BrainCtx, vaultId: string): Promise<string> {
  const { supabase, userId, token } = ctx;
  const remote = await listVaultNotes(token, vaultId);
  // 노트가 1000개를 넘어도 모두 읽는다 (Supabase API 는 한 번에 1000줄까지만 준다)
  const local = await readAllPages<{ drive_file_id: string; path: string; modified_at: string }>((from, to) =>
    supabase.from("brain_notes").select("drive_file_id, path, modified_at").order("drive_file_id").range(from, to),
  );
  const plan = planSync(remote, local);

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
    const { error: e } = await supabase.from("brain_notes").update({ path: r.path, title: p.title, section: p.section }).eq("drive_file_id", r.id);
    if (e) throw new Error(`옮긴 노트를 고치지 못했어요: ${e.message}`);
  });
  for (let i = 0; i < plan.remove.length; i += 200) {
    const { error: e } = await supabase.from("brain_notes").delete().in("drive_file_id", plan.remove.slice(i, i + 200));
    if (e) throw new Error(`지운 노트를 정리하지 못했어요: ${e.message}`);
  }

  const summary = syncSummary({ total: remote.length, downloaded: rows.length, removed: plan.remove.length, remaining: plan.remaining });
  await supabase.from("brain_settings").update({ last_synced_at: new Date().toISOString(), last_sync_result: summary }).eq("user_id", userId);
  return summary;
}

export function noteRow(userId: string, fileId: string, path: string, content: string, modifiedTime: string) {
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
export async function uploadPlans(
  store: ExportStore,
  plans: ExportPlan[],
  folder: { id: string; children?: { id: string; name: string }[]; vaultPath: string | null },
): Promise<{ created: number; updated: number }> {
  const { userId, token } = store;
  const done = await store.loadExports(plans.map((p) => p.key));
  const prev = new Map(done.map((d) => [d.series_key, d]));
  const byName = new Map((folder.children ?? []).map((c) => [c.name, c.id]));
  let created = 0;
  let updated = 0;

  const results = await mapLimit(plans, 4, async (p) => {
    const old = prev.get(p.key);
    if (old && old.content_digest === p.digest) return null;
    const fileName = (old?.file_name as string | undefined) ?? p.fileName;
    // 기록이 없어도 같은 이름 파일이 이미 있으면 (동시에 두 번 눌렀을 때 등) 그 파일을 덮어쓴다
    let fileId = (old?.drive_file_id as string | undefined) ?? byName.get(fileName);
    let up: Uploaded | undefined;
    if (fileId) {
      try {
        up = await updateTextFile(token, fileId, fileName, p.content);
        if (up.trashed) up = undefined; // 휴지통에 있는 파일 (중복 정리로 버린 것 등) → 새로 만든다
        else updated++;
      } catch (e) {
        if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 403))) throw e;
        fileId = undefined; // 드라이브에서 지웠으면 새로 만든다
      }
    }
    if (!up) {
      up = await keepOneCopy(token, folder.id, fileName, p.content, await createTextFile(token, folder.id, fileName, p.content));
      created++;
    }
    return { plan: p, fileName, up };
  });
  const changed = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (!changed.length) return { created, updated };

  const prefix = folder.vaultPath ? `${folder.vaultPath}/` : "";
  await store.save(
    changed.map((r) => ({ series_key: r.plan.key, drive_file_id: r.up.id, file_name: r.fileName, content_digest: r.plan.digest })),
    folder.vaultPath === null ? [] : changed.map((r) => noteRow(userId, r.up.id, `${prefix}${r.fileName}`, r.plan.content, r.up.modifiedTime)),
  );
  return { created, updated };
}

/**
 * 새로 만든 직후, 같은 이름 파일이 또 생겼는지 본다 (내보내기가 동시에 두 번 돌면 둘 다 만든다).
 * 여러 개면 ID 가 가장 작은 하나만 남기고 나머지는 휴지통으로 → 남긴 파일에 내용을 쓴다.
 * 두 쪽 모두 같은 파일을 고르므로, 늦게 확인한 쪽이 정리한다. 버린 파일을 기록한 쪽은 다음 내보내기 때 trashed 를 보고 바로잡는다.
 */
async function keepOneCopy(token: string, folderId: string, fileName: string, content: string, mine: Uploaded): Promise<Uploaded> {
  const same = (await listChildren(token, folderId)).filter((i) => i.name === fileName && i.mimeType !== FOLDER_MIME);
  if (!same.some((i) => i.id === mine.id)) same.push({ id: mine.id, name: fileName, mimeType: "text/markdown", modifiedTime: mine.modifiedTime });
  const { keep, extra } = splitDuplicates(same);
  if (!keep || !extra.length) return mine;
  let result = mine;
  if (keep.id !== mine.id) {
    try {
      result = await updateTextFile(token, keep.id, fileName, content);
    } catch (e) {
      // 남길 파일을 ERP가 고칠 수 없음 (사용자가 만든 같은 이름 파일) → 내 파일을 그대로 쓰고 아무것도 버리지 않는다
      if (e instanceof GoogleApiError && (e.status === 403 || e.status === 404)) return mine;
      throw e;
    }
  }
  // 사용자가 만든 파일은 drive.file 권한으로 버릴 수 없어서 실패해도 그대로 둔다
  for (const x of extra) await trashFile(token, x.id).catch(() => {});
  return result;
}

export type ExportedRow = { series_key: string; drive_file_id: string; file_name: string; content_digest: string };
export type NoteRow = ReturnType<typeof noteRow>;

/** 내보내기 기록을 읽고 쓰는 곳: 화면(로그인 세션)과 크론(CRON_SECRET 함수)이 다르다 */
export type ExportStore = {
  userId: string;
  token: string;
  loadExports(keys: string[]): Promise<ExportedRow[]>;
  save(exports: ExportedRow[], notes: NoteRow[]): Promise<void>;
};

/** 로그인 세션(RLS)으로 읽고 쓰는 store */
export function sessionStore(ctx: BrainCtx): ExportStore {
  const { supabase, userId, token } = ctx;
  return {
    userId,
    token,
    async loadExports(keys) {
      const { data } = await supabase.from("brain_exports").select("series_key, drive_file_id, file_name, content_digest").in("series_key", keys);
      return (data ?? []) as ExportedRow[];
    },
    async save(exports, notes) {
      if (exports.length) {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("brain_exports")
          .upsert(exports.map((e) => ({ ...e, user_id: userId, exported_at: now })), { onConflict: "user_id,series_key" });
        if (error) throw new Error(`내보낸 노트를 저장하지 못했어요: ${error.message}`);
      }
      if (notes.length) await supabase.from("brain_notes").upsert(notes, { onConflict: "user_id,drive_file_id" });
    },
  };
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
  const r = await writeMemoFile(token, settings!.vault_folder_id, memo, () => ensureExportFolder(ctx));
  if (!r.path) return { id: "", path: "" }; // 볼트 밖: 폴더를 옮기면 동기화로 들어온다

  const { data, error } = await supabase
    .from("brain_notes")
    .upsert(noteRow(userId, r.up.id, r.path, memo.content, r.up.modifiedTime), { onConflict: "user_id,drive_file_id" })
    .select("id")
    .single();
  if (error) throw new Error(`메모는 드라이브에 저장했지만 ERP에 보이게 하지 못했어요. '동기화'를 눌러 주세요. (${error.message})`);
  return { id: data.id as string, path: r.path };
}

/**
 * 메모 파일 올리기 (로그인 세션이 없는 텔레그램 웹훅도 쓴다).
 * Inbox → (없으면) '0 Inbox' 만들기 → (ERP가 못 쓰는 볼트면) fallback 폴더 안 '메모'.
 * path: 볼트 안 경로, 볼트 밖에 저장했으면 null
 */
export async function writeMemoFile(
  token: string,
  vaultId: string,
  memo: { fileName: string; content: string },
  fallback: () => Promise<{ folderId: string; vaultPath: string | null } | null>,
): Promise<{ up: { id: string; modifiedTime: string }; path: string | null }> {
  const cannotWrite = (e: unknown) => e instanceof GoogleApiError && (e.status === 403 || e.status === 404);
  const children = await listChildren(token, vaultId);
  const inbox = children.find((c) => c.mimeType === FOLDER_MIME && sectionOf(`${c.name}/x.md`) === "inbox");
  try {
    const folder = inbox ?? { ...(await createFolder(token, PARA_FOLDERS[0], vaultId)), name: PARA_FOLDERS[0] };
    const up = await createTextFile(token, folder.id, memo.fileName, memo.content);
    return { up, path: `${folder.name}/${memo.fileName}` };
  } catch (e) {
    if (!cannotWrite(e)) throw e;
  }
  const exp = await fallback();
  if (!exp) throw new Error("볼트에 메모를 넣을 수 없어요. ERP 세컨드브레인 화면에서 메모를 한 번 저장해 주세요.");
  const sub = await ensureSubfolder(token, exp.folderId, MEMO_FALLBACK_FOLDER);
  const up = await createTextFile(token, sub.id, memo.fileName, memo.content);
  return { up, path: exp.vaultPath === null ? null : [exp.vaultPath, MEMO_FALLBACK_FOLDER, memo.fileName].filter(Boolean).join("/") };
}

/** 텔레그램용 대체 폴더: 저장해 둔 'ERP 기록' 폴더가 살아 있으면 (새로 만들지는 않는다) */
export async function savedExportFolder(token: string, vaultId: string, exportFolderId: string | null) {
  if (!exportFolderId || !(await folderAlive(token, exportFolderId))) return null;
  return { folderId: exportFolderId, vaultPath: await pathInVault(token, exportFolderId, vaultId) };
}

const NOT_ERP_FILE = "ERP가 만든 파일이 아니라서 여기서 고치거나 지울 수 없어요. 옵시디언에서 고쳐 주세요.";
const cannotWrite = (e: unknown) => e instanceof GoogleApiError && (e.status === 403 || e.status === 404);

/** 메모 고치기: 드라이브 파일 내용을 바꾸고 ERP 사본도 고친다. ERP가 만든 메모만 */
export async function editMemoNote(ctx: BrainCtx, noteId: string, body: string): Promise<void> {
  const { supabase, userId, token } = ctx;
  const note = await memoRow(ctx, noteId);
  const content = editMemo(note.content, body, new Date());
  if (!content) throw new Error("내용을 적어 주세요. 메모를 없애려면 '지우기'를 눌러 주세요.");
  // 마지막 동기화 뒤에 옵시디언에서 고쳤으면 덮어쓰지 않는다 (ERP 사본은 옛 내용이라 고친 내용이 사라진다)
  const live = await liveFile(token, note.drive_file_id);
  if (!live) {
    await supabase.from("brain_notes").delete().eq("id", noteId);
    throw new Error("드라이브에서 이미 지워진 메모예요. 목록에서 뺐어요.");
  }
  if (live.modifiedTime && new Date(live.modifiedTime).getTime() > new Date(note.modified_at).getTime()) {
    throw new Error("드라이브(옵시디언)에서 더 최근에 고친 메모예요. '동기화'를 누른 뒤 다시 고쳐 주세요.");
  }
  const fileName = note.path.split("/").pop()!;
  let up;
  try {
    up = await updateTextFile(token, note.drive_file_id, fileName, content);
  } catch (e) {
    if (cannotWrite(e)) throw new Error(NOT_ERP_FILE);
    throw e;
  }
  const { error } = await supabase.from("brain_notes").update(noteRow(userId, note.drive_file_id, note.path, content, up.modifiedTime)).eq("id", noteId);
  if (error) throw new Error(error.message);
}

/** 메모 지우기: 드라이브 휴지통으로 옮기고(30일 안에 되살릴 수 있음) ERP 사본을 지운다. ERP가 만든 메모만 */
export async function deleteMemoNote(ctx: BrainCtx, noteId: string): Promise<void> {
  const note = await memoRow(ctx, noteId);
  if (await liveFile(ctx.token, note.drive_file_id)) {
    try {
      await trashFile(ctx.token, note.drive_file_id);
    } catch (e) {
      // 읽을 수는 있는데 휴지통으로 못 옮김 = ERP가 만든 파일이 아님 (drive.file 권한)
      if (cannotWrite(e)) throw new Error(NOT_ERP_FILE);
      throw e;
    }
  }
  const { error } = await ctx.supabase.from("brain_notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
}

async function memoRow(ctx: BrainCtx, noteId: string) {
  const { data, error } = await ctx.supabase.from("brain_notes").select("drive_file_id, path, content, modified_at").eq("id", noteId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("메모를 찾지 못했어요.");
  if (!isErpMemo(data.content as string)) throw new Error("ERP에서 만든 메모만 여기서 고치거나 지울 수 있어요.");
  return data as { drive_file_id: string; path: string; content: string; modified_at: string };
}

/** 일정 기록 → 'ERP 기록/<일 이름>.md' */
export async function exportRecords(ctx: BrainCtx, folder: { folderId: string; vaultPath: string | null }) {
  const series = groupSeries(await listRecordEntries(ctx.supabase));
  return uploadPlans(sessionStore(ctx), planExport(series), { id: folder.folderId, vaultPath: folder.vaultPath });
}

/** 대시보드 할 일 → 'ERP 기록/할 일/<날짜>.md' (내가 적은 할 일만, 지운 것 제외) */
export async function exportTodos(ctx: BrainCtx, folder: { folderId: string; vaultPath: string | null }) {
  const { supabase, userId } = ctx;
  // 1000줄이 넘어도 모두 읽는다 (Supabase API 는 한 번에 1000줄까지만 준다)
  const [todos, exported] = await Promise.all([
    readAllPages<TodoRow>(
      (from, to) =>
        supabase
          .from("todos")
          .select("id, title, due_date, done_at, created_at, note")
          .eq("user_id", userId)
          .is("dismissed_at", null)
          .order("due_date", { ascending: false })
          .order("id")
          .range(from, to),
      3000,
    ),
    readAllPages<{ series_key: string }>((from, to) =>
      supabase.from("brain_exports").select("series_key").like("series_key", "todo:%").order("series_key").range(from, to),
    ),
  ]);
  const plans = planTodoNotes(todos, exported.map((e) => e.series_key), todayInSeoul());
  if (!plans.length) return { created: 0, updated: 0 };
  return uploadTodoPlans(sessionStore(ctx), plans, folder);
}

/** 할 일 노트들을 'ERP 기록/할 일' 폴더에 올린다 */
export async function uploadTodoPlans(store: ExportStore, plans: ExportPlan[], folder: { folderId: string; vaultPath: string | null }) {
  if (!plans.length) return { created: 0, updated: 0 };
  const sub = await ensureSubfolder(store.token, folder.folderId, TODO_FOLDER);
  return uploadPlans(store, plans, { id: sub.id, children: sub.children, vaultPath: folder.vaultPath === null ? null : `${folder.vaultPath}/${TODO_FOLDER}`.replace(/^\//, "") });
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
