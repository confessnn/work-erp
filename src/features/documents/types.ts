/** 서류 종류. 순서 = 화면 표시 순서 */
export const DOC_TYPES = [
  { key: "resume", label: "이력서", file: "이력서" },
  { key: "profile", label: "강사 프로필", file: "강사프로필" },
  { key: "certificate", label: "자격증 취득확인서", file: "자격증" },
  { key: "career", label: "경력증명서", file: "경력증명서", freshDays: 90 },
  { key: "employment", label: "재직증명서", file: "재직증명서", freshDays: 90 },
  { key: "degree", label: "학위증명서", file: "학위증명서" },
  { key: "final_education", label: "최종학력증명서", file: "최종학력증명서" },
  { key: "id_card", label: "신분증 사본", file: "신분증사본", sensitive: true },
  { key: "bankbook", label: "통장 사본", file: "통장사본", sensitive: true },
  { key: "privacy_consent", label: "개인정보 수집·이용 동의서", file: "개인정보동의서" },
  { key: "other", label: "기타", file: "기타" },
] as const satisfies readonly { key: string; label: string; file: string; freshDays?: number; sensitive?: boolean }[];

export type DocType = (typeof DOC_TYPES)[number]["key"];

export const docTypeInfo = (key: string) => DOC_TYPES.find((t) => t.key === key) ?? DOC_TYPES[DOC_TYPES.length - 1];

export const isDocType = (v: unknown): v is DocType => DOC_TYPES.some((t) => t.key === v);

/** public.documents 한 행 */
export type DocumentRow = {
  id: string;
  doc_type: DocType;
  title: string | null;
  issued_on: string | null;
  drive_file_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  archived: boolean;
  created_at: string;
};

/** public.document_submissions 한 행 */
export type SubmissionRow = {
  id: string;
  lecture_id: string;
  doc_types: string[];
  document_ids: string[];
  file_names: string[];
  zip_name: string;
  method: "download" | "drive_link";
  share_url: string | null;
  shared: boolean;
  created_at: string;
};
