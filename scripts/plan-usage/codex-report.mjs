// Codex의 플랜 한도를 읽어 ERP로 보낸다. 모델을 호출하지 않으므로 한도를 쓰지 않는다.
// Codex app-server 프로토콜은 안정 버전이 아니라 업데이트 때 항목 이름이 바뀔 수 있다.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCodex, shouldReadCodex } from "./parse.mjs";
import { DATA_DIR, report, takeRefreshRequest } from "./report.mjs";

const TIMEOUT_MS = 20_000;
const INTERVAL_MS = 15 * 60_000;
const STATE_FILE = join(DATA_DIR, "codex-last.json");

function readLimits() {
  return new Promise((resolve, reject) => {
    const child = spawn("codex app-server", { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    const timer = setTimeout(() => finish(reject, new Error("Codex 응답 시간 초과")), TIMEOUT_MS);
    function finish(settle, value) {
      clearTimeout(timer);
      child.kill();
      settle(value);
    }
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

    child.on("error", (e) => finish(reject, e));
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1) {
          send({ method: "initialized" });
          send({ method: "account/rateLimits/read", id: 2 });
        } else if (message.id === 2) {
          if (message.error) finish(reject, new Error(message.error.message));
          else finish(resolve, message.result);
        }
      }
    });
    send({ method: "initialize", id: 1, params: { clientInfo: { name: "work_erp_plan_usage", title: "work-erp plan usage", version: "1.0.0" } } });
  });
}

function lastRun() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")).at;
  } catch {
    return null;
  }
}

try {
  // 요청 확인이 실패해도 정기 갱신은 계속한다
  const requested = await takeRefreshRequest(10_000).catch(() => false);
  const now = Date.now();
  if (!shouldReadCodex(lastRun(), requested, now, INTERVAL_MS)) process.exit(0);

  const usage = parseCodex(await readLimits());
  if (!usage) throw new Error("Codex 한도 항목을 찾지 못했습니다.");
  await report("codex", usage, 10_000);
  writeFileSync(STATE_FILE, JSON.stringify({ at: now }));
  process.exit(0);
} catch (e) {
  console.error(e instanceof Error ? e.message : "알 수 없는 오류");
  process.exit(1);
}
