"use server";

import { revalidatePath } from "next/cache";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { driveContext } from "@/features/google-drive/context";
import { brainContext } from "./context";
import { createFolder, createTextFile, FOLDER_MIME, getItem } from "./drive";
import { MEMO_MAX } from "./memo";
import { ensureExportFolder, exportRecords, exportTodos, saveMemo, syncVault } from "./service";
import { EXPORT_FOLDER, PARA_FOLDERS, parseFolderId } from "./vault";

type Result = { ok: true; message: string } | { ok: false; message: string };

const fail = (e: unknown, fallback: string): Result => ({ ok: false, message: e instanceof Error ? e.message : fallback });

const WELCOME = `# 세컨드브레인 시작하기

ERP가 만든 옵시디언 볼트예요. 폴더는 PARA 방식으로 나눴어요.

- **0 Inbox**: 떠오른 생각·메모를 일단 여기에
- **1 Projects**: 마감이 있는 일 (예: ○○기관 원가계산 용역)
- **2 Areas**: 계속 돌보는 영역 (강의, 육아, 재무)
- **3 Resources**: 참고 자료 (세법, 입찰 노하우)
- **4 Archives**: 끝난 것
- **ERP 기록**: ERP의 일정 기록과 대시보드 할 일(할 일 폴더, 날짜별)을 옮긴 노트 (ERP가 덮어써요)

노트끼리는 \`[[노트 이름]]\`처럼 링크로 잇고, \`#태그\`를 붙이면 ERP에서도 찾을 수 있어요.
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

/**
 * 'ERP 내보내기': 일정 기록(같은 일끼리 묶음)과 대시보드 할 일(날짜별)을 볼트의 'ERP 기록' 폴더에 .md 로 올린다.
 * 내용이 같으면 다시 올리지 않고, 바뀌면 같은 파일을 덮어쓴다. 할 일은 바꿀 때마다 자동으로도 반영된다.
 */
export async function exportRecordsAction(): Promise<Result> {
  try {
    const ctx = await brainContext();
    if (!ctx.settings) return { ok: false, message: "연결된 볼트가 없어요." };

    const folder = await ensureExportFolder(ctx);
    const [records, todos] = await Promise.all([exportRecords(ctx, folder), exportTodos(ctx, folder)]);
    await ctx.supabase.from("brain_settings").update({ last_exported_at: new Date().toISOString() }).eq("user_id", ctx.userId);
    revalidatePath("/brain", "layout");

    const part = (name: string, r: { created: number; updated: number }) =>
      r.created || r.updated ? `${name} 새로 ${r.created}개·고침 ${r.updated}개` : `${name} 바뀐 것 없음`;
    const where =
      folder.vaultPath === null
        ? ` 볼트 폴더 안에는 ERP가 파일을 만들 수 없어서 드라이브 work-erp/'${EXPORT_FOLDER}' 폴더에 올렸어요. 그 폴더를 볼트 안으로 한 번 옮겨 주세요 (옮긴 뒤에도 계속 그 폴더에 올려요).`
        : "";
    return { ok: true, message: `${part("기록 노트", records)} · ${part("할 일 노트", todos)}.${where}` };
  } catch (e) {
    return fail(e, "내보내지 못했어요.");
  }
}

/** '빠른 메모': 볼트 Inbox 에 노트로 저장 → 새 노트 ID (볼트 밖에 저장했으면 null) */
export async function saveMemoAction(
  text: string,
  title?: string,
): Promise<{ ok: true; message: string; noteId: string | null } | { ok: false; message: string }> {
  try {
    if (!text.trim()) return { ok: false, message: "메모를 적어 주세요." };
    if (text.length > MEMO_MAX) return { ok: false, message: `메모는 ${MEMO_MAX.toLocaleString("ko-KR")}자까지 적을 수 있어요.` };
    const ctx = await brainContext();
    if (!ctx.settings) return { ok: false, message: "연결된 볼트가 없어요." };
    const r = await saveMemo(ctx, text, title);
    revalidatePath("/brain", "layout");
    return r.id
      ? { ok: true, message: `'${r.path}'에 저장했어요.`, noteId: r.id }
      : { ok: true, message: "드라이브 work-erp/ERP 기록/메모 폴더에 저장했어요. ERP 기록 폴더를 볼트 안으로 옮기면 여기서도 보여요.", noteId: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "메모를 저장하지 못했어요." };
  }
}
