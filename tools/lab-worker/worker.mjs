#!/usr/bin/env node
// 연구소 워커 — ERP(/lab)에서 맡긴 일을 가져와 맥에서 Claude 로 처리하고 결과를 돌려준다.
//
// 설정은 저장소가 아니라 ~/.config/lab-worker/config.json 에 둔다 (CRON_SECRET 이 들어가므로).
// 돌리기: node tools/lab-worker/worker.mjs    멈추기: Ctrl+C
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildArgs, folderName, planFor, resultText, TIMEOUT_MS } from "./plan.mjs";

const CONFIG = path.join(os.homedir(), ".config", "lab-worker", "config.json");
const POLL_MS = 3000;
const STALE_MIN = 30;

function loadConfig() {
  if (!fs.existsSync(CONFIG)) {
    console.error(`설정이 없습니다: ${CONFIG}\ntools/lab-worker/config.example.json 을 복사해서 채우세요.`);
    process.exit(1);
  }
  const c = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  for (const k of ["supabaseUrl", "publishableKey", "cronSecret", "userId", "workDir"]) {
    if (!c[k]) {
      console.error(`설정에 ${k} 가 없습니다: ${CONFIG}`);
      process.exit(1);
    }
  }
  c.workDir = c.workDir.replace(/^~/, os.homedir());
  return c;
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/**
 * Claude CLI 가 로그인돼 있는지. 로그인 전에 일을 집어 가면 전부 '실패'로 적혀 버리므로,
 * 로그인될 때까지는 일을 건드리지 않고 기다린다.
 */
function loggedIn() {
  return new Promise((resolve) => {
    const c = spawn("claude", ["auth", "status"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (b) => (out += b));
    c.on("error", () => resolve(false));
    c.on("close", () => {
      try {
        resolve(JSON.parse(out).loggedIn === true);
      } catch {
        resolve(false);
      }
    });
  });
}

/** Supabase RPC 호출 (로그인 세션 없이 CRON_SECRET 으로 잠긴 함수만 부른다) */
async function rpc(cfg, fn, body) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: cfg.publishableKey,
      authorization: `Bearer ${cfg.publishableKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** 일 하나를 Claude 로 처리한다. 실패해도 던지지 않고 적을 글을 돌려준다 */
function runClaude(task, dir) {
  return new Promise((resolve) => {
    const plan = planFor(task.researcher);
    const child = spawn("claude", buildArgs(task, plan), { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);

    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve(`실패: claude 를 실행하지 못했습니다 (${e.message})`);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") return resolve(`실패: 시간이 너무 오래 걸려 끊었습니다 (${TIMEOUT_MS / 60000}분)`);
      if (code !== 0 && !out) return resolve(`실패: claude 가 ${code} 로 끝났습니다\n${err.slice(0, 500)}`);
      resolve(resultText(out));
    });
  });
}

async function tick(cfg) {
  const rows = await rpc(cfg, "cron_lab_next", { p_secret: cfg.cronSecret, p_user: cfg.userId });
  const task = Array.isArray(rows) ? rows[0] : rows;
  if (!task) return false;

  const dir = path.join(cfg.workDir, folderName(task.researcher));
  fs.mkdirSync(dir, { recursive: true });
  log(`맡음 [${task.researcher}] ${task.title.split("\n")[0].slice(0, 60)}`);

  const result = await runClaude(task, dir);
  await rpc(cfg, "cron_lab_finish", {
    p_secret: cfg.cronSecret,
    p_user: cfg.userId,
    p_id: task.id,
    p_result: result,
  });
  log(`끝냄 [${task.researcher}] ${result.split("\n")[0].slice(0, 60)}`);
  return true;
}

async function main() {
  const cfg = loadConfig();
  fs.mkdirSync(cfg.workDir, { recursive: true });
  log(`연구소 워커 시작 · 작업 폴더 ${cfg.workDir}`);

  // 지난번에 켜져 있을 때 '진행 중'으로 남은 일을 되돌린다
  try {
    const n = await rpc(cfg, "cron_lab_requeue_stale", {
      p_secret: cfg.cronSecret,
      p_user: cfg.userId,
      p_minutes: STALE_MIN,
    });
    if (n) log(`밀려 있던 일 ${n}건을 다시 맡긴 일로 돌렸습니다`);
  } catch (e) {
    log("되돌리기 실패:", e.message);
  }

  let warned = false;
  for (;;) {
    try {
      if (!(await loggedIn())) {
        if (!warned) {
          log("Claude CLI 로그인이 안 돼 있습니다. 터미널에서 `claude auth login` 을 한 번 하세요.");
          log("로그인될 때까지 맡긴 일은 건드리지 않고 기다립니다.");
          warned = true;
        }
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      if (warned) {
        log("로그인 확인됐습니다. 일을 가져갑니다.");
        warned = false;
      }
      // 할 일이 있으면 쉬지 않고 이어서 한다
      if (await tick(cfg)) continue;
    } catch (e) {
      log("오류:", e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
