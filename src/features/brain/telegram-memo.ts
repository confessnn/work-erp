import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_READ_SCOPE, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { escapeTg, type InlineButton } from "@/features/telegram/api";
import { memoNote } from "./memo";
import { savedExportFolder, writeMemoFile } from "./service";
import { parseNote } from "./vault";

const ERP_URL = "https://work-erp-one.vercel.app";

type Target = { user_id: string; refresh_token_enc: string; scopes: string | null; vault_folder_id: string; export_folder_id: string | null };

/**
 * 텔레그램 '메모 …' → 세컨드브레인 볼트 Inbox 노트 + ERP 사본 → 답장.
 * 웹훅에는 로그인 세션이 없어서 비밀값(hook)으로 잠긴 DB 함수(tg_brain_target, tg_save_brain_note)만 쓴다.
 */
export async function saveTelegramMemo(db: SupabaseClient, hook: string, text: string): Promise<{ html: string; buttons: InlineButton[] }> {
  const { data, error } = await db.rpc("tg_brain_target", { p_hook: hook });
  if (error) throw new Error("메모를 저장할 곳을 찾지 못했어요.");
  const target = ((data ?? []) as Target[])[0];
  if (!target) {
    return {
      html: "📝 아직 세컨드브레인 볼트가 없어요. ERP의 '세컨드브레인' 화면에서 볼트를 먼저 만들어 주세요.",
      buttons: [{ text: "세컨드브레인 열기", url: `${ERP_URL}/brain` }],
    };
  }
  if (!hasScope(target.scopes, DRIVE_SCOPE) || !hasScope(target.scopes, DRIVE_READ_SCOPE)) {
    throw new Error("드라이브 권한이 없어요. ERP '연동' 화면에서 구글을 다시 연결해 주세요.");
  }

  const memo = memoNote(text, new Date());
  if (!memo) throw new Error("메모 내용이 비어 있어요.");
  const { token } = await accessToken(decryptSecret(target.refresh_token_enc), [DRIVE_SCOPE, DRIVE_READ_SCOPE]);
  const r = await writeMemoFile(token, target.vault_folder_id, memo, () => savedExportFolder(token, target.vault_folder_id, target.export_folder_id));

  let noteId: string | null = null;
  if (r.path) {
    const p = parseNote(r.path, memo.content);
    const { data: id } = await db.rpc("tg_save_brain_note", {
      p_hook: hook,
      p_drive_file_id: r.up.id,
      p_path: r.path,
      p_title: p.title,
      p_section: p.section,
      p_content: memo.content,
      p_links: p.links,
      p_tags: p.tags,
      p_modified_at: r.up.modifiedTime,
    });
    noteId = (id as string | null) ?? null; // 실패해도 드라이브에는 저장됐다 (다음 동기화 때 들어온다)
  }
  return {
    html: [`📝 <b>메모를 저장했어요</b>`, escapeTg(memo.title), r.path ? `<i>${escapeTg(r.path)}</i>` : "드라이브 work-erp/ERP 기록/메모"].join("\n"),
    buttons: [{ text: "ERP에서 보기", url: noteId ? `${ERP_URL}/brain/note/${noteId}` : `${ERP_URL}/brain` }],
  };
}
