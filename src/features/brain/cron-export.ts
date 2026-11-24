import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_READ_SCOPE, DRIVE_SCOPE, GoogleApiError, hasScope } from "@/features/google-calendar/google-api";
import { groupSeries, type RecordEntry } from "@/features/records/series";
import { todayInSeoul } from "@/lib/format";
import { createFolder } from "./drive";
import { planExport } from "./export";
import { savedExportFolder, uploadPlans, uploadTodoPlans, type ExportedRow, type ExportStore } from "./service";
import { planTodoNotes, type TodoRow } from "./todo-notes";
import { EXPORT_FOLDER } from "./vault";

export type BrainJob = { user_id: string; refresh_token_enc: string; scopes: string | null; vault_folder_id: string; export_folder_id: string | null };

type Data = {
  lectures: { id: string; title: string; organization: string | null; lecture_date: string; start_time: string | null; record: string }[];
  family: { id: string; title: string; event_date: string; start_time: string | null; record: string }[];
  todos: TodoRow[];
  exports: ExportedRow[];
};

/** cron_brain_data 의 일정 기록 → 기록 묶기용 (records/queries.ts 의 listRecordEntries 와 같은 모양) */
export function recordEntries(d: Pick<Data, "lectures" | "family">): RecordEntry[] {
  return [
    ...d.lectures.map((l) => ({ kind: "lecture" as const, id: l.id, title: l.title, organization: l.organization ?? null, date: l.lecture_date, start_time: l.start_time ?? null, record: l.record })),
    ...d.family.map((f) => ({ kind: "family" as const, id: f.id, title: f.title, organization: null, date: f.event_date, start_time: f.start_time ?? null, record: f.record })),
  ].filter((e) => e.record.trim() !== "");
}

/**
 * 한 사람의 일정 기록·할 일을 볼트 'ERP 기록' 폴더에 내보낸다 (화면의 'ERP 기록·할 일 내보내기'와 같은 결과).
 * 내보낼 폴더가 없어졌으면 볼트 안에 다시 만들고, 그것도 안 되면 실패로 알린다 (화면에서 한 번 눌러야 함).
 */
export async function exportForJob(db: SupabaseClient, secret: string, job: BrainJob) {
  if (!hasScope(job.scopes, DRIVE_SCOPE) || !hasScope(job.scopes, DRIVE_READ_SCOPE)) throw new Error("드라이브 권한이 없습니다.");
  const { token } = await accessToken(decryptSecret(job.refresh_token_enc), [DRIVE_SCOPE, DRIVE_READ_SCOPE]);

  const { data, error } = await db.rpc("cron_brain_data", { p_secret: secret, p_user: job.user_id });
  if (error) throw new Error(error.message);
  const d = data as Data;

  let folder = await savedExportFolder(token, job.vault_folder_id, job.export_folder_id);
  let newFolderId: string | null = null;
  if (!folder) {
    try {
      newFolderId = (await createFolder(token, EXPORT_FOLDER, job.vault_folder_id)).id;
      folder = { folderId: newFolderId, vaultPath: EXPORT_FOLDER };
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 403 || e.status === 404)) {
        throw new Error("내보낼 폴더가 없어요. ERP 세컨드브레인 화면에서 'ERP 기록·할 일 내보내기'를 한 번 눌러 주세요.");
      }
      throw e;
    }
  }

  // 올린 결과는 모아 두었다가 마지막에 한 번에 저장한다
  const exports: ExportedRow[] = [];
  const notes: Parameters<ExportStore["save"]>[1] = [];
  const store: ExportStore = {
    userId: job.user_id,
    token,
    loadExports: async (keys) => d.exports.filter((e) => keys.includes(e.series_key)),
    save: async (e, n) => {
      exports.push(...e);
      notes.push(...n);
    },
  };

  const records = await uploadPlans(store, planExport(groupSeries(recordEntries(d))), { id: folder.folderId, vaultPath: folder.vaultPath });
  const todoPlans = planTodoNotes(d.todos, d.exports.map((e) => e.series_key), todayInSeoul());
  const todos = await uploadTodoPlans(store, todoPlans, folder);

  const { error: e2 } = await db.rpc("cron_brain_save", {
    p_secret: secret,
    p_user: job.user_id,
    p_exports: exports,
    p_notes: notes,
    p_export_folder_id: newFolderId,
  });
  if (e2) throw new Error(`올린 결과를 저장하지 못했어요: ${e2.message}`);
  return { records, todos };
}
