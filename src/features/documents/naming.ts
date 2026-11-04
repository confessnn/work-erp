import { DOC_TYPES, docTypeInfo, type DocumentRow } from "./types";

/** 윈도우·맥에서 파일 이름에 쓸 수 없는 문자 제거 */
export function safeName(s: string) {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "application/haansofthwp": "hwp",
  "application/x-hwp": "hwp",
  "application/vnd.hancom.hwpx": "hwpx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function extOf(fileName: string, mime?: string | null) {
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(fileName);
  if (m) return m[1].toLowerCase();
  return (mime && MIME_EXT[mime]) || "pdf";
}

/**
 * 압축파일 안의 파일 이름: 임승택_이력서.pdf / 임승택_자격증_정보처리기사.pdf
 * 같은 이름이 생기면 _2, _3 을 붙인다.
 */
export function bundleFileNames(
  docs: Pick<DocumentRow, "doc_type" | "title" | "file_name" | "mime_type">[],
  displayName: string,
): string[] {
  const used = new Map<string, number>();
  return docs.map((d) => {
    const parts = [safeName(displayName), docTypeInfo(d.doc_type).file, d.title ? safeName(d.title) : ""].filter(Boolean);
    const base = parts.join("_");
    const ext = extOf(d.file_name, d.mime_type);
    const n = (used.get(`${base}.${ext}`) ?? 0) + 1;
    used.set(`${base}.${ext}`, n);
    return n === 1 ? `${base}.${ext}` : `${base}_${n}.${ext}`;
  });
}

/** 압축파일 이름: 임승택_OO대학교_제출서류_20261105.zip */
export function zipName(displayName: string, target: string | null, date: string) {
  const parts = [safeName(displayName), target ? safeName(target) : "", "제출서류", date.replaceAll("-", "")].filter(Boolean);
  return `${parts.join("_")}.zip`;
}

/** 발급일이 오래된 서류 (재직·경력증명서는 보통 3개월 이내 발급분을 요구) */
export function isStale(doc: Pick<DocumentRow, "doc_type" | "issued_on">, today: string) {
  const info = docTypeInfo(doc.doc_type);
  const days = "freshDays" in info ? info.freshDays : undefined;
  if (!days || !doc.issued_on) return false;
  const diff = (Date.parse(today) - Date.parse(doc.issued_on)) / 86_400_000;
  return diff > days;
}

/**
 * 압축파일 안 경로: 서류 종류별 폴더 + 파일 이름.
 *   01_이력서/임승택_이력서.pdf
 *   02_자격증 취득확인서/임승택_자격증_정보처리기사.pdf
 * 폴더 번호는 서류함 순서대로, 선택한 종류만 1번부터 붙인다.
 */
export function bundlePaths(
  docs: Pick<DocumentRow, "doc_type" | "title" | "file_name" | "mime_type">[],
  displayName: string,
): string[] {
  const names = bundleFileNames(docs, displayName);
  const present = DOC_TYPES.filter((t) => docs.some((d) => d.doc_type === t.key));
  const folderOf = new Map(
    present.map((t, i) => [t.key as string, `${String(i + 1).padStart(2, "0")}_${safeName(t.label)}`]),
  );
  return docs.map((d, i) => `${folderOf.get(d.doc_type) ?? "기타"}/${names[i]}`);
}
