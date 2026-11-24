import type { Section } from "./vault";

export type BrainSettings = {
  user_id: string;
  vault_folder_id: string;
  vault_name: string;
  export_folder_id: string | null;
  last_synced_at: string | null;
  last_sync_result: string | null;
  last_exported_at: string | null;
};

export type BrainNote = {
  id: string;
  drive_file_id: string;
  path: string;
  title: string;
  section: Section;
  content: string;
  links: string[];
  tags: string[];
  modified_at: string;
};

/** 목록·그래프용 (본문 없이) */
export type BrainNoteMeta = Omit<BrainNote, "content">;

/** 세컨드브레인을 쓸 수 있는 상태 */
export type BrainStatus =
  | { kind: "no_google" }
  | { kind: "needs_reconnect" }
  | { kind: "no_vault" }
  | { kind: "ready"; settings: BrainSettings };
