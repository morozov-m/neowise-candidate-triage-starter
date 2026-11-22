import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const root = dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const reply = await fetch(BASE);
      if (reply.ok) return;
    } catch {
      // server not ready yet
    }
    await delay(50);
  }
  throw new Error("Server did not start in time");
}

async function postTriage(text) {
  const reply = await fetch(`${BASE}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { status: reply.status, body: await reply.json() };
}

async function testTimeoutManualReview() {
  const { status, body } = await postTriage("Заявка с меткой [timeout]");
  assert(status === 200, `expected HTTP 200, got ${status}`);
  assert(body.status === "manual_review", `expected manual_review, got ${body.status}`);
  assert(body.topic === null, `expected topic null, got ${body.topic}`);
  assert(body.draft === null, `expected draft null, got ${body.draft}`);
  console.log("ok: timeout failure returns manual_review");
}

async function testInvalidInput() {
  const reply = await fetch(`${BASE}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  });
  const body = await reply.json();
  assert(reply.status === 400, `expected HTTP 400, got ${reply.status}`);
  assert(body.status === "invalid_input", `expected invalid_input, got ${body.status}`);
  console.log("ok: blank text returns invalid_input");
}

async function testReadyDelivery() {
  const { status, body } = await postTriage("Нужна помощь с доставкой заказа");
  assert(status === 200, `expected HTTP 200, got ${status}`);
  assert(body.status === "ready", `expected ready, got ${body.status}`);
  assert(body.topic === "delivery", `expected delivery, got ${body.topic}`);
  assert(typeof body.draft === "string" && body.draft.trim() !== "", "expected non-empty draft");
  console.log("ok: delivery request returns ready");
}

async function testBadTopicManualReview() {
  const { status, body } = await postTriage("Заявка с меткой [bad-topic]");
  assert(status === 200, `expected HTTP 200, got ${status}`);
  assert(body.status === "manual_review", `expected manual_review, got ${body.status}`);
  assert(body.topic === null, `expected topic null, got ${body.topic}`);
  assert(body.draft === null, `expected draft null, got ${body.draft}`);
  console.log("ok: bad topic returns manual_review");
}

const tests = {
  timeout: testTimeoutManualReview,
  invalid: testInvalidInput,
  ready: testReadyDelivery,
  "bad-topic": testBadTopicManualReview,
};

async function runAll() {
  for (const run of Object.values(tests)) await run();
  console.log("ok: all triage tests passed");
}

const name = process.argv[2];
if (name && name !== "all" && !tests[name]) {
  console.error(`Unknown test "${name}". Use: all | ${Object.keys(tests).join(" | ")}`);
  process.exit(1);
}

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

try {
  await waitForServer();
  if (!name || name === "all") await runAll();
  else await tests[name]();
} finally {
  server.kill();
}

