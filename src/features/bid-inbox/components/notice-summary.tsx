"use client";

import { useTransition } from "react";
import { summarizeBid } from "../actions";
import type { BidNotice } from "../types";

/** 첨부(공고문·과업지시서)를 읽은 AI 요약. 원문 확인을 위해 첨부 링크를 함께 보여 준다 */
export function NoticeSummary({ notice }: { notice: BidNotice }) {
  const [pending, start] = useTransition();
  const summarize = () => start(() => summarizeBid(notice.id));

  if (notice.summary) {
    return (
      <details className="rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">공고문 요약 보기</summary>
        <p className="mt-2 whitespace-pre-line">{notice.summary}</p>
        {notice.summary_files && notice.summary_files.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-2">
            {notice.summary_files.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">AI가 쓴 요약이라 틀릴 수 있습니다. 투찰 전에 원문을 확인하세요.</p>
      </details>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" disabled={pending} onClick={summarize} className={`chip ${pending ? "opacity-50" : ""}`}>
        {pending ? "첨부를 읽는 중… (1~2분)" : notice.summary_error ? "요약 다시 시도" : "요약 만들기"}
      </button>
      {notice.summary_error && !pending && <span className="text-red-600">{notice.summary_error}</span>}
    </div>
  );
}
