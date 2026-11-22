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

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});

try {
  await waitForServer();

  const reply = await fetch(`${BASE}/api/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Заявка с меткой [timeout]" }),
  });
  const body = await reply.json();

  assert(reply.status === 200, `expected HTTP 200, got ${reply.status}`);
  assert(body.status === "manual_review", `expected manual_review, got ${body.status}`);
  assert(body.topic === null, `expected topic null, got ${body.topic}`);
  assert(body.draft === null, `expected draft null, got ${body.draft}`);

  console.log("ok: timeout failure returns manual_review");
} finally {
  server.kill();
}
