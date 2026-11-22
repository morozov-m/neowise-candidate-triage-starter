import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);
const MODEL_TIMEOUT_MS = 300;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function manualReview(response) {
  return json(response, 200, { status: "manual_review", topic: null, draft: null });
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handleTriage(request, response) {
  let payload;
  try {
    payload = JSON.parse(await readBody(request));
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }

  const text = payload?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return json(response, 400, { status: "invalid_input" });
  }

  let raw;
  try {
    raw = await classify(text, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
  } catch {
    return manualReview(response);
  }

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    return manualReview(response);
  }

  const topic = result?.topic;
  const draft = result?.draft;
  if (
    typeof topic !== "string" ||
    !ALLOWED_TOPICS.has(topic) ||
    typeof draft !== "string" ||
    draft.trim() === ""
  ) {
    return manualReview(response);
  }

  return json(response, 200, { status: "ready", topic, draft });
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }
  try {
    await handleTriage(request, response);
  } catch {
    json(response, 500, { status: "server_error" });
  }
}).listen(Number(process.env.PORT || 3000), "127.0.0.1");
