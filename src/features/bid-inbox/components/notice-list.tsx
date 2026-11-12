"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { won } from "@/lib/format";
import { setBidStatus } from "../actions";
import { setViewerMark } from "@/features/bid-viewer/actions";
import { CATEGORY_LABEL } from "../categories";
import { VERDICT_LABEL } from "../judge";
import { SubmissionBadge } from "./submission-badge";
import type { BidNotice, BidStatus, BidVerdict } from "../types";
import { NoticeSummary } from "./notice-summary";

const VERDICT_CLASS: Record<BidVerdict, string> = {
  possible: "badge-paid",
  check: "badge-unpaid",
  impossible: "bg-danger/10 text-danger",
  na: "text-muted",
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** 마감까지 남은 날짜 (한국 날짜 기준) */
function dDay(iso: string, now: number) {
  const day = (t: number) => Date.parse(new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const diff = Math.round((day(Date.parse(iso)) - day(now)) / 86_400_000);
  if (Date.parse(iso) < now) return "마감";
  return diff === 0 ? "오늘 마감" : `D-${diff}`;
}

function StatusButton({ id, status, to, label, viewer }: { id: string; status: BidStatus; to: BidStatus; label: string; viewer?: boolean }) {
  const [pending, start] = useTransition();
  const on = status === to;
  // 공고 열람자(동생)의 표시는 본인 것만 따로 저장 → 공고함 주인의 상태는 바뀌지 않는다
  const save = viewer ? setViewerMark : setBidStatus;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => save(id, on ? "new" : to))}
      className={`chip ${on ? "chip-on" : ""} ${pending ? "opacity-50" : ""}`}
    >
      {label}
    </button>
  );
}

/** viewer: 초대받은 공고 열람자 화면 (관심·제외는 본인 표시, '새 공고' 표시 없음) */
export function NoticeList({ notices, viewer = false }: { notices: BidNotice[]; viewer?: boolean }) {
  const [now] = useState(() => Date.now());

  if (notices.length === 0) {
    return <p className="card text-center text-muted">표시할 공고가 없습니다.</p>;
  }

  return (
    <ul className="space-y-2">
      {notices.map((n) => (
        <li key={n.id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-accent">{CATEGORY_LABEL[n.category]}</span>
            <span className={`badge ${VERDICT_CLASS[n.verdict]}`} title={n.verdict_reason ?? undefined}>
              {VERDICT_LABEL[n.verdict]}
            </span>
            <SubmissionBadge awardMethod={n.award_method} />
            {n.source === "d2b" && <span className="text-muted">국방부</span>}
            {!viewer && n.status === "new" && <span className="badge badge-unpaid">새 공고</span>}
            {n.notice_kind && n.notice_kind !== "등록공고" && <span className="text-muted">{n.notice_kind}</span>}
            {n.closes_at && <span className="ml-auto font-semibold tabular-nums">{dDay(n.closes_at, now)}</span>}
          </div>

          <div className="font-medium">
            {n.detail_url ? (
              <a href={n.detail_url} target="_blank" rel="noreferrer" className="hover:underline">
                {n.title}
              </a>
            ) : (
              n.title
            )}
          </div>

          <div className="text-sm text-muted">
            {[n.notice_org, n.demand_org !== n.notice_org ? n.demand_org : null, n.contract_method, n.award_method, n.region_limit, n.main_industry, n.site_region]
              .filter(Boolean)
              .join(" · ")}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="tabular-nums">추정가격 {n.presumed_price !== null ? won(n.presumed_price) : "미공개"}</span>
            {n.closes_at && <span className="tabular-nums text-muted">마감 {dateTime(n.closes_at)}</span>}
            <span className="text-muted tabular-nums">{n.bid_no}-{n.bid_ord}</span>
            <div className="ml-auto flex gap-2">
              {n.category === "cost" && (
                <Link href={`/bids/calculator?notice=${n.id}`} className="chip">
                  입찰가 계산
                </Link>
              )}
              <StatusButton id={n.id} status={n.status} to="interested" label="관심" viewer={viewer} />
              <StatusButton id={n.id} status={n.status} to="dismissed" label="제외" viewer={viewer} />
            </div>
          </div>

          {n.verdict_reason && <p className="text-xs text-muted">1차 판정 근거: {n.verdict_reason}</p>}

          {n.category === "cost" && n.verdict !== "na" && <NoticeSummary notice={n} />}
        </li>
      ))}
    </ul>
  );
}
