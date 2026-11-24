import "server-only";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_READ_SCOPE, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { requireUser } from "@/lib/supabase/server";
import type { BrainSettings } from "./types";

/** 세컨드브레인 서버 작업용: 드라이브 읽기+ERP 파일 쓰기 토큰, 볼트 설정 (없으면 null) */
export async function brainContext() {
  const { supabase, userId } = await requireUser();
  const [{ data: conn }, { data: settings }] = await Promise.all([
    supabase.from("google_connections").select("refresh_token_enc, scopes, drive_docs_folder_id").maybeSingle(),
    supabase.from("brain_settings").select("*").maybeSingle(),
  ]);
  if (!conn) throw new Error("구글이 연결되어 있지 않습니다. '연동' 화면에서 연결해주세요.");
  if (!hasScope(conn.scopes, DRIVE_SCOPE) || !hasScope(conn.scopes, DRIVE_READ_SCOPE)) {
    throw new Error("드라이브 읽기 권한이 없습니다. '연동' 화면에서 구글을 다시 연결해주세요.");
  }
  const { token } = await accessToken(decryptSecret(conn.refresh_token_enc), [DRIVE_SCOPE, DRIVE_READ_SCOPE]);
  return {
    supabase,
    userId,
    token,
    docsFolderId: (conn.drive_docs_folder_id as string | null) ?? null,
    settings: (settings as BrainSettings | null) ?? null,
  };
}
