// Claude Code 상태줄 명령. 입력 JSON에서 플랜 한도를 읽어 글자로 보여 주고 ERP로 보낸다.
// 상태줄을 막으면 안 되므로 어떤 오류도 밖으로 내지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseClaude, shouldReport, statusText } from "./parse.mjs";
import { DATA_DIR, report } from "./report.mjs";

const MIN_INTERVAL_MS = 5 * 60_000;
const STATE_FILE = join(DATA_DIR, "claude-last.json");

const readJson = (read) => {
  try {
    return JSON.parse(read());
  } catch {
    return null;
  }
};

const usage = parseClaude(readJson(() => readFileSync(0, "utf8")));
process.stdout.write(statusText(usage));

const last = readJson(() => readFileSync(STATE_FILE, "utf8"));
const now = Date.now();
if (shouldReport(last, usage, now, MIN_INTERVAL_MS)) {
  try {
    await report("claude", usage, 3000);
    writeFileSync(STATE_FILE, JSON.stringify({ at: now, fiveHourPercent: usage.fiveHourPercent, weeklyPercent: usage.weeklyPercent }));
  } catch {
    // 다음 상태줄 갱신 때 다시 보낸다
  }
}
