"use server";

import { revalidatePath } from "next/cache";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { listRecordEntries } from "@/features/records/queries";
import { groupSeries } from "@/features/records/series";
import { brainContext } from "./context";
import { createFolder, createTextFile, downloadText, folderAlive, getItem, listChildren, listVaultNotes, mapLimit, updateTextFile, FOLDER_MIME } from "./drive";
import { planExport } from "./export";
import { MAX_NOTE_CHARS, planSync, syncSummary } from "./sync";
import { EXPORT_FOLDER, PARA_FOLDERS, parseFolderId, parseNote } from "./vault";

type Result = { ok: true; message: string } | { ok: false; message: string };
type Ctx = Awaited<ReturnType<typeof brainContext>>;

const fail = (e: unknown, fallback: string): Result => ({ ok: false, message: e instanceof Error ? e.message : fallback });

const WELCOME = `# 세컨드브레인 시작하기

ERP가 만든 옵시디언 볼트예요. 폴더는 PARA 방식으로 나눴어요.

- **0 Inbox**: 떠오른 생각·메모를 일단 여기에
- **1 Projects**: 마감이 있는 일 (예: ○○기관 원가계산 용역)
- **2 Areas**: 계속 돌보는 영역 (강의, 육아, 재무)
- **3 Resources**: 참고 자료 (세법, 입찰 노하우)
- **4 Archives**: 끝난 것
- **ERP 기록**: ERP의 일정 기록을 내보낸 노트 (ERP가 덮어써요)

노트끼리는 [[링크]]로 잇고, #태그를 붙이면 ERP에서도 찾을 수 있어요.
`;

/** '새 볼트 만들기': 드라이브 work-erp/세컨드브레인 + PARA 폴더 + ERP 기록 폴더 */
export async function createVaultAction(): Promise<Result> {
  try {
    const drive = await driveContext(); // work-erp 폴더를 확인·생성
    const root = (await getItem(drive.token, drive.folders.docs)).parents?.[0];
    if (!root) return { ok: false, message: "work-erp 폴더를 찾지 못했어요." };
    const ctx = await brainContext();
    if (ctx.settings) return { ok: false, message: "이미 볼트가 연결되어 있어요." };

    const vault = await createFolder(ctx.token, "세컨드브레인", root);
    const folders = await Promise.all(PARA_FOLDERS.map((name) => createFolder(ctx.token, name, vault.id)));
    const exportFolder = await createFolder(ctx.token, EXPORT_FOLDER, vault.id);
    await createTextFile(ctx.token, folders[0].id, "세컨드브레인 시작하기.md", WELCOME);

    const { error } = await ctx.supabase.from("brain_settings").insert({
      user_id: ctx.userId,
      vault_folder_id: vault.id,
      vault_name: "세컨드브레인",
      export_folder_id: exportFolder.id,
    });
    if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
    await syncVault({ ...ctx, settings: null }, vault.id);
    revalidatePath("/brain");
    return { ok: true, message: "드라이브 work-erp/세컨드브레인 볼트를 만들었어요." };
  } catch (e) {
    return fail(e, "볼트를 만들지 못했어요.");
  }
}

/** '이미 있는 볼트 연결': 드라이브 폴더 링크를 받아 그 폴더를 볼트로 */
export async function linkVaultAction(link: string): Promise<Result> {
  try {
    const id = parseFolderId(link);
    if (!id) return { ok: false, message: "드라이브 폴더 링크를 붙여 넣어 주세요. (drive.google.com/drive/folders/…)" };
    const ctx = await brainContext();
    if (ctx.settings) return { ok: false, message: "이미 볼트가 연결되어 있어요. 먼저 연결을 끊어 주세요." };
    let folder;
    try {
      folder = await getItem(ctx.token, id);
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 403)) {
        return { ok: false, message: "폴더를 찾지 못했어요. 같은 구글 계정의 드라이브 폴더인지 확인해 주세요." };
      }
      throw e;
    }
    if (folder.mimeType !== FOLDER_MIME || folder.trashed) return { ok: false, message: "폴더가 아니거나 휴지통에 있어요." };

    const { error } = await ctx.supabase
      .from("brain_settings")
      .insert({ user_id: ctx.userId, vault_folder_id: folder.id, vault_name: folder.name });
    if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
    const r = await syncVault({ ...ctx, settings: null }, folder.id);
    revalidatePath("/brain");
    return { ok: true, message: `'${folder.name}' 볼트를 연결했어요. ${r}` };
  } catch (e) {
    return fail(e, "볼트를 연결하지 못했어요.");
  }
}

/** '연결 끊기': ERP의 노트 사본만 지운다 (드라이브의 볼트·노트는 그대로) */
export async function unlinkVaultAction(): Promise<Result> {
  try {
    const ctx = await brainContext();
    await ctx.supabase.from("brain_notes").delete().eq("user_id", ctx.userId);
    await ctx.supabase.from("brain_exports").delete().eq("user_id", ctx.userId);
    await ctx.supabase.from("brain_settings").delete().eq("user_id", ctx.userId);
    revalidatePath("/brain");
    return { ok: true, message: "연결을 끊었어요. 드라이브의 노트는 그대로 있어요." };
  } catch (e) {
    return fail(e, "연결을 끊지 못했어요.");
  }
}

/** '동기화': 드라이브 볼트의 바뀐 노트를 받아 ERP 사본을 맞춘다 */
export async function syncVaultAction(): Promise<Result> {
  try {
    const ctx = await brainContext();
    if (!ctx.settings) return { ok: false, message: "연결된 볼트가 없어요." };
    const message = await syncVault(ctx, ctx.settings.vault_folder_id);
    revalidatePath("/brain", "layout");
    return { ok: true, message };
  } catch (e) {
    return fail(e, "동기화하지 못했어요.");
  }
}

async function syncVault(ctx: Ctx, vaultId: string): Promise<string> {
  const { supabase, userId, token } = ctx;
  const remote = await listVaultNotes(token, vaultId);
  const { data: local, error } = await supabase.from("brain_notes").select("drive_file_id, path, modified_at").limit(10000);
  if (error) throw new Error(error.message);
  const plan = planSync(remote, local ?? []);

  const rows = await mapLimit(plan.download, 6, async (r) => {
    const content = (await downloadText(token, r.id)).slice(0, MAX_NOTE_CHARS);
    const p = parseNote(r.path, content);
    return {
      user_id: userId,
      drive_file_id: r.id,
      path: r.path,
      title: p.title,
      section: p.section,
      content,
      links: p.links,
      tags: p.tags,
      modified_at: r.modifiedTime,
      synced_at: new Date().toISOString(),
    };
  });
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

/**
 * '기록 내보내기': ERP 일정 기록을 같은 일끼리 묶어 볼트의 'ERP 기록' 폴더에 .md 로 올린다.
 * 내용이 같으면 다시 올리지 않고, 바뀌면 같은 파일을 덮어쓴다. 끝나면 동기화해서 바로 보이게 한다.
 */
export async function exportRecordsAction(): Promise<Result> {
  try {
    const ctx = await brainContext();
    const { supabase, userId, token, settings } = ctx;
    if (!settings) return { ok: false, message: "연결된 볼트가 없어요." };

    const series = groupSeries(await listRecordEntries(supabase));
    if (!series.length) return { ok: false, message: "내보낼 기록이 아직 없어요. 일정을 끝내고 기록을 남겨 주세요." };

    const { folderId, outside } = await ensureExportFolder(ctx);
    const { data: done } = await supabase.from("brain_exports").select("series_key, drive_file_id, file_name, content_digest");
    const prev = new Map((done ?? []).map((d) => [d.series_key as string, d]));

    let created = 0;
    let updated = 0;
    const plans = planExport(series);
    const results = await mapLimit(plans, 4, async (p) => {
      const old = prev.get(p.key);
      if (old && old.content_digest === p.digest) return null;
      // 이미 올린 노트는 이름을 바꾸지 않는다 (옵시디언 링크가 깨지지 않게)
      const fileName = (old?.file_name as string | undefined) ?? p.fileName;
      let fileId = old?.drive_file_id as string | undefined;
      if (fileId) {
        try {
          await updateTextFile(token, fileId, fileName, p.content);
          updated++;
        } catch (e) {
          if (!(e instanceof GoogleApiError && (e.status === 404 || e.status === 403))) throw e;
          fileId = undefined; // 드라이브에서 지웠으면 새로 만든다
        }
      }
      if (!fileId) {
        fileId = await createTextFile(token, folderId, fileName, p.content);
        created++;
      }
      return { user_id: userId, series_key: p.key, drive_file_id: fileId, file_name: fileName, content_digest: p.digest, exported_at: new Date().toISOString() };
    });
    const rows = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) {
      const { error } = await supabase.from("brain_exports").upsert(rows, { onConflict: "user_id,series_key" });
      if (error) throw new Error(`내보낸 기록을 저장하지 못했어요: ${error.message}`);
    }
    await supabase.from("brain_settings").update({ last_exported_at: new Date().toISOString() }).eq("user_id", userId);
    const synced = outside ? "" : ` ${await syncVault(ctx, settings.vault_folder_id)}`;
    revalidatePath("/brain", "layout");

    const head = created || updated ? `기록 노트 새로 ${created}개, 고침 ${updated}개.` : "바뀐 기록이 없어요.";
    const where = outside
      ? ` 볼트 폴더 안에는 ERP가 파일을 만들 수 없어서 드라이브 work-erp/'${EXPORT_FOLDER}' 폴더에 올렸어요. 그 폴더를 볼트 안으로 한 번 옮겨 주세요 (옮긴 뒤에도 계속 그 폴더에 올려요).`
      : "";
    return { ok: true, message: `${head}${where}${synced}` };
  } catch (e) {
    return fail(e, "기록을 내보내지 못했어요.");
  }
}

/**
 * 내보낼 폴더: 저장해 둔 폴더 → 볼트 안에 새로 만들기 → (볼트가 사용자 폴더라 못 만들면) work-erp 아래에 만들기.
 * ERP가 만든 폴더는 사용자가 볼트 안으로 옮겨도 계속 쓸 수 있다.
 */
async function ensureExportFolder(ctx: Ctx): Promise<{ folderId: string; outside: boolean }> {
  const { supabase, userId, token, settings } = ctx;
  const save = (id: string) => supabase.from("brain_settings").update({ export_folder_id: id }).eq("user_id", userId);
  const vaultId = settings!.vault_folder_id;

  if (await folderAlive(token, settings!.export_folder_id)) {
    const parents = (await getItem(token, settings!.export_folder_id!)).parents ?? [];
    return { folderId: settings!.export_folder_id!, outside: !parents.includes(vaultId) && !(await insideVault(token, parents, vaultId)) };
  }
  try {
    const f = await createFolder(token, EXPORT_FOLDER, vaultId);
    await save(f.id);
    return { folderId: f.id, outside: false };
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
  return { folderId: id, outside: true };
}

/** 폴더가 볼트 안(몇 단계 아래라도)에 있는지 */
async function insideVault(token: string, parents: string[], vaultId: string, depth = 0): Promise<boolean> {
  if (depth > 8) return false;
  for (const p of parents) {
    if (p === vaultId) return true;
    try {
      const up = (await getItem(token, p)).parents ?? [];
      if (await insideVault(token, up, vaultId, depth + 1)) return true;
    } catch {
      /* 못 읽는 상위 폴더 (내 드라이브 루트 등) */
    }
  }
  return false;
}
