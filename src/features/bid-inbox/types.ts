export type BidCategory = "cost" | "hanil";
export type BidSource = "g2b" | "d2b";
export type BidMatch = "industry" | "keyword";
export type BidVerdict = "possible" | "check" | "impossible" | "na";
export type BidStatus = "new" | "interested" | "dismissed";

/** 공고 저장에 쓰는 값 (수동 수신·예약 수신 공통) */
export type BidNoticeInput = {
  category: BidCategory;
  source: BidSource;
  matched_by: BidMatch;
  bid_no: string;
  bid_ord: string;
  title: string;
  notice_kind: string | null;
  notice_org: string | null;
  demand_org: string | null;
  presumed_price: number | null;
  contract_method: string | null;
  award_method: string | null;
  region_limit: string | null;
  main_industry: string | null;
  site_region: string | null;
  noticed_at: string | null;
  closes_at: string | null;
  opens_at: string | null;
  detail_url: string | null;
  verdict: BidVerdict;
  verdict_reason: string;
};

export type BidFile = { name: string; url: string };

export type BidNotice = BidNoticeInput & {
  id: string;
  status: BidStatus;
  created_at: string;
  summary: string | null;
  summary_files: BidFile[] | null;
  summary_error: string | null;
};

export type BidSettings = {
  auto_fetch: boolean;
  last_fetched_at: string | null;
  last_fetch_result: string | null;
};
