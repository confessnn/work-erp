// ERP 기록 → 옵시디언 노트(.md). 같은 일(회차 표시를 뗀 제목) 하나가 노트 하나 (순수 함수)
import type { Series } from "@/features/records/series";

/** 파일 이름에 못 쓰는 글자(드라이브·윈도·옵시디언 링크)를 빼고 너무 길면 자른다 */
export function safeFileName(name: string): string {
  const s = name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return s || "이름 없음";
}

/** 이름이 겹치면 '이름 (2)' 처럼 번호를 붙인다. 순서가 같으면 결과도 같다 */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return count === 1 ? n : `${n} (${count})`;
  });
}

const yamlText = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * 노트 내용. 기관은 [[기관]] 링크로 걸어서 옵시디언 그래프에서 같은 기관의 일끼리 모이게 한다.
 * 금액은 넣지 않는다 (기록만).
 */
export function seriesNote(series: Series): string {
  const orgs = [...new Set(series.entries.map((e) => e.organization?.trim()).filter((o): o is string => !!o))];
  const dates = series.entries.map((e) => e.date).sort();
  const kind = series.entries.every((e) => e.kind === "family") ? "가족 일정" : "강의·업무";
  const lines = [
    "---",
    "source: work-erp",
    `type: ${kind === "가족 일정" ? "family" : "lecture"}`,
    `title: ${yamlText(series.name)}`,
    `first: ${dates[0]}`,
    `last: ${dates[dates.length - 1]}`,
    `count: ${series.entries.length}`,
    "tags:",
    "  - erp/기록",
    "---",
    `# ${series.name}`,
    "",
    `- 구분: ${kind}`,
    ...(orgs.length ? [`- 기관: ${orgs.map((o) => `[[${safeFileName(o)}]]`).join(", ")}`] : []),
    `- 기록 ${series.entries.length}개 · ${dates[0]} ~ ${dates[dates.length - 1]}`,
    "",
    "> [!info] ERP에서 자동으로 만든 노트예요",
    "> 다음 내보내기 때 덮어써요. 내 생각은 다른 노트에 쓰고 [[링크]]로 이어 주세요.",
    "",
  ];
  for (const e of series.entries) {
    const head = [e.date, e.start_time?.slice(0, 5), e.title !== series.name ? e.title : null].filter(Boolean).join(" · ");
    lines.push(`## ${head}`, "", e.record.trim(), "");
  }
  return lines.join("\n");
}

/** 내용이 바뀌었는지 보는 짧은 지문 (FNV-1a 32비트, 보안용 아님) */
export function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${text.length}`;
}

export type ExportPlan = { key: string; fileName: string; content: string; digest: string };

/** 일 묶음들 → 올릴 파일 목록 (이름 겹침 처리 포함) */
export function planExport(series: Series[]): ExportPlan[] {
  const names = uniqueNames(series.map((s) => safeFileName(s.name)));
  return series.map((s, i) => {
    const content = seriesNote(s);
    return { key: s.key, fileName: `${names[i]}.md`, content, digest: digest(content) };
  });
}
