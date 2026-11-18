// 원가분석 용역 견적서: 총계(부가세 포함)에 맞춰 인건비·경비·일반관리비를 나누고, 한글(hwpx) 양식에 값만 바꿔 넣는다.
// 기존 견적서 관행: 단가는 고정하고 참여율(소수점 5자리)로 금액을 맞춘다. 이윤은 비영리법인이라 0.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type Expense = { unit: number; qty: number; unitLabel: string };
export const EXPENSE_ROWS = [
  { key: "travel", label: "여비", unitLabel: "회" },
  { key: "print", label: "유인물비", unitLabel: "매" },
  { key: "computing", label: "전산처리비", unitLabel: "식" },
  { key: "meeting", label: "회의비", unitLabel: "회" },
  { key: "survey", label: "조사비", unitLabel: "식" },
] as const;
export type ExpenseKey = (typeof EXPENSE_ROWS)[number]["key"];

export const GRADES = ["책임연구원", "연구원", "연구보조원"] as const;

export type QuoteInput = {
  service: string;
  total: number; // 총계 (부가세 포함)
  months: number;
  wages: [number, number, number]; // 월 단가
  shares: [number, number, number]; // 인건비 나눔 비율(%)
  expenses: Record<ExpenseKey, Expense>;
  adminRate: number; // 일반관리비 요율(%)
};

/** 학술연구용역 인건비 기준단가 (지난 견적서 값. 해마다 확인) */
export const DEFAULT_WAGES: [number, number, number] = [7_567_456, 5_802_624, 3_878_858];

export type QuoteLine = { amount: number; remark: string };
export type Quote = {
  labor: QuoteLine[];
  laborSum: number;
  expenses: Record<ExpenseKey, QuoteLine>;
  expenseSum: number;
  admin: number;
  subtotal: number; // 합계 (부가세 전)
  vat: number;
  total: number;
  rates: number[]; // 참여율(%)
};

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
/** 소수점 아래 끝의 0을 지운다 (0.50000 → 0.5) */
const trim = (s: string) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

/** 총계에 맞춰 나눈다. 맞출 수 없으면 이유를 담아 throw */
export function calcQuote(q: QuoteInput): Quote {
  const total = Math.round(q.total);
  if (!(total > 0)) throw new Error("총계 금액을 넣어 주세요.");
  if (!(q.months > 0)) throw new Error("기간(개월)을 넣어 주세요.");
  const subtotal = Math.round(total / 1.1);
  const vat = total - subtotal;
  // 일반관리비 = round(기준×요율). 합계 = 기준 + 일반관리비 가 되는 기준을 찾는다
  const r = q.adminRate / 100;
  let base = Math.round(subtotal / (1 + r));
  for (const d of [0, -1, 1, -2, 2]) {
    if (base + d + Math.round((base + d) * r) === subtotal) {
      base += d;
      break;
    }
  }
  const admin = subtotal - base;

  const expenses = {} as Record<ExpenseKey, QuoteLine>;
  let expenseSum = 0;
  for (const row of EXPENSE_ROWS) {
    const e = q.expenses[row.key];
    const amount = e && e.unit > 0 && e.qty > 0 ? Math.round(e.unit * e.qty) : 0;
    expenseSum += amount;
    expenses[row.key] = { amount, remark: amount ? `${fmt(e.unit)}원×${fmt(e.qty)}${e.unitLabel}` : "" };
  }

  const laborSum = base - expenseSum;
  if (laborSum <= 0) throw new Error("경비가 너무 커서 인건비가 남지 않아요. 경비 수량을 줄여 주세요.");
  const shareSum = q.shares.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(shareSum > 0)) throw new Error("인건비 비율을 넣어 주세요.");

  const amounts = q.shares.map((s) => Math.floor((laborSum * Math.max(0, s)) / shareSum));
  amounts[amounts.length - 1] += laborSum - amounts.reduce((a, b) => a + b, 0);
  const rates = amounts.map((a, i) => (q.wages[i] > 0 ? (a / (q.wages[i] * q.months)) * 100 : 0));
  const labor = amounts.map((a, i) => ({
    amount: a,
    remark: a ? `${fmt(q.wages[i])}원×${trim(String(q.months))}개월×${rates[i].toFixed(5)}%` : "",
  }));

  return { labor, laborSum, expenses, expenseSum, admin, subtotal, vat, total, rates };
}

const DIGIT = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL = ["", "십", "백", "천"];
const BIG = ["", "만", "억", "조"];

/** 1530000 → '일백오십삼만' (끝에 '원'은 붙이지 않는다) */
export function koreanAmount(n: number): string {
  let v = Math.round(n);
  if (v <= 0) return "영";
  let out = "";
  for (let g = 0; v > 0; g++) {
    const part = v % 10_000;
    v = Math.floor(v / 10_000);
    if (!part) continue;
    let s = "";
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(part / 10 ** i) % 10;
      if (d) s += DIGIT[d] + SMALL[i];
    }
    out = s + BIG[g] + out;
  }
  return out;
}

const pct = (a: number, total: number) => (a ? `${((a / total) * 100).toFixed(2)}%` : "");

/** 양식 표의 칸(열, 행) → 넣을 글자 */
export function quoteCells(q: Quote, adminRate: number): Map<string, string> {
  const m = new Map<string, string>();
  const put = (row: number, amount: number, remark?: string) => {
    m.set(`2,${row}`, amount ? fmt(amount) : "");
    m.set(`3,${row}`, pct(amount, q.total));
    if (remark !== undefined) m.set(`4,${row}`, remark);
  };
  q.labor.forEach((l, i) => put(1 + i, l.amount, l.remark));
  put(4, q.laborSum);
  EXPENSE_ROWS.forEach((r, i) => put(5 + i, q.expenses[r.key].amount, q.expenses[r.key].remark));
  put(10, q.expenseSum);
  put(11, q.admin, `(인건비+경비)의 ${trim(String(adminRate))}% 이내`);
  put(13, q.subtotal);
  put(15, q.vat);
  m.set("2,19", fmt(q.total));
  m.set("3,19", "100.0%");
  return m;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 표의 한 칸 글자를 바꾼다. 첫 문단의 글자 모양을 유지하고 줄 배치 정보는 지워 한글이 다시 계산하게 한다 */
export function setCell(xml: string, col: number, row: number, text: string): string {
  const addr = xml.indexOf(`<hp:cellAddr colAddr="${col}" rowAddr="${row}"/>`);
  if (addr < 0) throw new Error(`양식에서 (${col}, ${row}) 칸을 찾지 못했어요.`);
  const tcStart = xml.lastIndexOf("<hp:tc ", addr);
  const pStart = xml.indexOf("<hp:p ", tcStart);
  const pEnd = xml.indexOf("</hp:p>", pStart);
  if (pStart < 0 || pEnd < 0 || pEnd > addr) throw new Error(`양식의 (${col}, ${row}) 칸 모양이 예상과 달라요.`);
  const para = xml.slice(pStart, pEnd);
  const open = para.slice(0, para.indexOf(">") + 1);
  const charPr = /<hp:run charPrIDRef="(\d+)"/.exec(para)?.[1] ?? "0";
  const run = text ? `<hp:run charPrIDRef="${charPr}"><hp:t>${esc(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charPr}"/>`;
  return xml.slice(0, pStart) + open + run + xml.slice(pEnd);
}

/** 양식(hwpx 바이트)에 값을 넣어 새 hwpx 바이트를 만든다 */
export function fillQuoteHwpx(template: Uint8Array, service: string, q: Quote, adminRate: number): Uint8Array {
  const files = unzipSync(template);
  const path = "Contents/section0.xml";
  if (!files[path]) throw new Error("양식 파일이 올바르지 않아요.");
  let xml = strFromU8(files[path]);

  const title = /(<hp:t>용역명: )[^<]*(<\/hp:t>)/;
  const money = /(액: 금 )[^<]*(<\/hp:t>)/;
  if (!title.test(xml) || !money.test(xml)) throw new Error("양식의 용역명·금액 줄을 찾지 못했어요.");
  xml = xml.replace(title, (_, a: string, b: string) => `${a}${esc(service)}${b}`);
  xml = xml.replace(money, (_, a: string, b: string) => `${a}${koreanAmount(q.total)}원(￦${fmt(q.total)})${b}`);
  for (const [key, text] of quoteCells(q, adminRate)) {
    const [c, r] = key.split(",").map(Number);
    xml = setCell(xml, c, r, text);
  }

  // mimetype 은 맨 앞에 압축 없이 둔다 (hwpx 규칙)
  const out: Zippable = { mimetype: [files.mimetype, { level: 0 }] };
  for (const [name, data] of Object.entries(files)) {
    if (name === "mimetype") continue;
    if (name === path) out[name] = strToU8(xml);
    else if (name === "Preview/PrvText.txt") out[name] = strToU8(`견 적 서\r\n용역명: ${service}\r\n금 액: 금 ${koreanAmount(q.total)}원(￦${fmt(q.total)})\r\n`);
    else out[name] = data;
  }
  return zipSync(out);
}

/** 화면에서 쓰는 기본 경비: 유인물비만 40원 단가로 경비가 대략 20%가 되게 */
export function defaultExpenses(total: number): Record<ExpenseKey, Expense> {
  const base = total / 1.1 / 1.06;
  const qty = Math.max(0, Math.round((base * 0.2) / 40 / 100) * 100);
  return {
    travel: { unit: 0, qty: 0, unitLabel: "회" },
    print: { unit: 40, qty, unitLabel: "매" },
    computing: { unit: 0, qty: 0, unitLabel: "식" },
    meeting: { unit: 0, qty: 0, unitLabel: "회" },
    survey: { unit: 0, qty: 0, unitLabel: "식" },
  };
}
