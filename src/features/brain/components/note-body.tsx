import Link from "next/link";
import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../markdown";
import { linkKey } from "../vault";

/** [[링크]] 대상 → ERP 노트 ID (볼트에 없으면 undefined) */
export type Resolve = (key: string) => string | undefined;

const CALLOUT: Record<string, string> = {
  note: "border-accent/50",
  info: "border-accent/50",
  tip: "border-success/50",
  success: "border-success/50",
  warning: "border-warn/60",
  caution: "border-warn/60",
  danger: "border-danger/60",
  error: "border-danger/60",
  bug: "border-danger/60",
};

function inline(nodes: Inline[], resolve: Resolve, key = ""): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}${i}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "bold":
        return <strong key={k}>{inline(n.c, resolve, `${k}-`)}</strong>;
      case "italic":
        return <em key={k}>{inline(n.c, resolve, `${k}-`)}</em>;
      case "mark":
        return (
          <mark key={k} className="rounded bg-warn/30 px-0.5 text-fg">
            {inline(n.c, resolve, `${k}-`)}
          </mark>
        );
      case "strike":
        return <del key={k}>{inline(n.c, resolve, `${k}-`)}</del>;
      case "code":
        return (
          <code key={k} className="rounded bg-line/60 px-1 text-[0.9em]">
            {n.v}
          </code>
        );
      case "tag":
        return (
          <Link key={k} href={`/brain?tag=${encodeURIComponent(n.v)}`} className="text-accent hover:underline">
            #{n.v}
          </Link>
        );
      case "link":
        return (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
            {n.label}
          </a>
        );
      case "wiki": {
        const id = resolve(linkKey(n.target));
        const label = `${n.embed ? "📎 " : ""}${n.label}`;
        return id ? (
          <Link key={k} href={`/brain/note/${id}`} className="text-accent hover:underline">
            {label}
          </Link>
        ) : (
          <span key={k} className="text-muted" title="볼트에 아직 없는 노트">
            {label}
          </span>
        );
      }
    }
  });
}

function block(b: Block, i: number, resolve: Resolve): ReactNode {
  switch (b.t) {
    case "heading": {
      const size = ["text-xl", "text-lg", "text-base", "text-base", "text-sm", "text-sm"][b.level - 1];
      const H = `h${Math.min(6, b.level + 1)}` as "h2";
      return (
        <H key={i} className={`${size} mt-4 font-semibold first:mt-0`}>
          {inline(b.c, resolve)}
        </H>
      );
    }
    case "para":
      return (
        <p key={i} className="whitespace-pre-wrap break-words">
          {inline(b.c, resolve)}
        </p>
      );
    case "list": {
      const L = b.ordered ? "ol" : "ul";
      return (
        <L key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
          {b.items.map((it, j) => (
            <li
              key={j}
              style={{ marginLeft: `${it.indent * 1.25}rem` }}
              className={it.checked === null ? undefined : "list-none -ml-5"}
            >
              {it.checked !== null && (
                <span aria-hidden className="mr-1.5">
                  {it.checked ? "☑" : "☐"}
                </span>
              )}
              <span className={it.checked ? "text-muted line-through" : undefined}>{inline(it.c, resolve)}</span>
            </li>
          ))}
        </L>
      );
    }
    case "quote":
      return (
        <blockquote key={i} className={`border-l-4 pl-3 ${b.callout ? `${CALLOUT[b.callout] ?? "border-accent/50"} rounded-r-lg bg-bg py-2` : "border-line text-muted"}`}>
          {b.callout && <p className="font-medium">{b.title.length ? inline(b.title, resolve) : b.callout}</p>}
          {b.lines.map((l, j) => (
            <p key={j} className="whitespace-pre-wrap break-words">
              {inline(l, resolve)}
            </p>
          ))}
        </blockquote>
      );
    case "code":
      return (
        <pre key={i} className="overflow-x-auto rounded-xl bg-bg p-3 text-xs">
          <code>{b.v}</code>
        </pre>
      );
    case "table":
      return (
        <div key={i} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {b.rows.map((row, j) => (
                <tr key={j} className="border-b border-line">
                  {row.map((c, k) =>
                    j === 0 ? (
                      <th key={k} className="px-2 py-1 text-left font-semibold">
                        {inline(c, resolve)}
                      </th>
                    ) : (
                      <td key={k} className="px-2 py-1">
                        {inline(c, resolve)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={i} className="border-line" />;
  }
}

/** 옵시디언 노트 본문 (frontmatter 를 뗀 것) */
export function NoteBody({ body, resolve }: { body: string; resolve: Resolve }) {
  const blocks = parseMarkdown(body);
  if (!blocks.length) return <p className="text-sm text-muted">내용이 없는 노트예요.</p>;
  return <div className="space-y-3 text-sm leading-relaxed">{blocks.map((b, i) => block(b, i, resolve))}</div>;
}
