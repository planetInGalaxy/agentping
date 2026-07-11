import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCompletionEvent } from "./adapter-sdk.mjs";
import { ensureDir, hashText, logEvent, readJsonIfExists, redactText, stateDir, writeJson0600 } from "./pushdeer-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const workerScript = path.join(path.dirname(__filename), "queue-worker.mjs");
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1000;

export function queuePaths() {
  const root = path.join(stateDir(), "spool");
  return {
    root,
    ready: path.join(root, "ready"),
    processing: path.join(root, "processing"),
    failed: path.join(root, "failed"),
    lock: path.join(root, "worker.lock"),
  };
}

export function ensureQueueDirs() {
  const paths = queuePaths();
  ensureDir(paths.ready);
  ensureDir(paths.processing);
  ensureDir(paths.failed);
  return paths;
}

function eventFileName(event) {
  const time = String(event.completedAt || Date.now()).padStart(13, "0");
  const suffix = hashText(`${event.agentId}:${event.eventId}`).slice(0, 20);
  return `${time}-${event.agentId}-${suffix}.json`;
}

export function enqueueCompletionEvent(input) {
  const event = normalizeCompletionEvent(input);
  const paths = ensureQueueDirs();
  const fileName = eventFileName(event);
  const target = path.join(paths.ready, fileName);
  if (!fs.existsSync(target) && !fs.existsSync(path.join(paths.processing, fileName))) {
    writeJson0600(target, {
      queuedAt: Date.now(),
      attempts: 0,
      event,
    });
  }
  logEvent("info", "AgentPing completion event queued", {
    agentId: event.agentId,
    agentType: event.agentType,
    eventId: event.eventId,
    durationMs: event.durationMs,
    terminalType: event.terminalType,
  });
  return { event, fileName, path: target };
}

export function launchQueueWorker() {
  if (process.env.AGENTPING_QUEUE_SYNC === "1") return null;
  const child = spawn(process.execPath, [workerScript], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return child.pid;
}

export function acquireQueueLock({ staleMs = DEFAULT_LOCK_STALE_MS } = {}) {
  const paths = ensureQueueDirs();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.mkdirSync(paths.lock, { mode: 0o700 });
      writeJson0600(path.join(paths.lock, "owner.json"), {
        pid: process.pid,
        acquiredAt: Date.now(),
      });
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const stat = fs.statSync(paths.lock);
        if (Date.now() - stat.mtimeMs <= staleMs) return false;
        fs.rmSync(paths.lock, { recursive: true, force: true });
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function releaseQueueLock() {
  fs.rmSync(queuePaths().lock, { recursive: true, force: true });
}

export function recoverProcessingEvents() {
  const paths = ensureQueueDirs();
  let recovered = 0;
  for (const fileName of fs.readdirSync(paths.processing).filter((name) => name.endsWith(".json"))) {
    const from = path.join(paths.processing, fileName);
    const to = path.join(paths.ready, fileName);
    try {
      fs.renameSync(from, to);
      recovered += 1;
    } catch {
      // Another recovery attempt may already have moved it.
    }
  }
  return recovered;
}

export function claimNextEvent() {
  const paths = ensureQueueDirs();
  const fileName = fs.readdirSync(paths.ready)
    .filter((name) => name.endsWith(".json"))
    .sort()[0];
  if (!fileName) return null;
  const from = path.join(paths.ready, fileName);
  const to = path.join(paths.processing, fileName);
  try {
    fs.renameSync(from, to);
  } catch {
    return null;
  }
  const envelope = readJsonIfExists(to, null);
  if (!envelope?.event) {
    fs.rmSync(to, { force: true });
    return null;
  }
  return { fileName, path: to, envelope };
}

export function completeClaim(claim) {
  fs.rmSync(claim.path, { force: true });
}

export function failClaim(claim, error) {
  const paths = ensureQueueDirs();
  const event = claim.envelope.event || {};
  const failedPath = path.join(paths.failed, claim.fileName);
  writeJson0600(failedPath, {
    failedAt: Date.now(),
    attempts: Number(claim.envelope.attempts || 0) + 1,
    error: redactText(error?.message || String(error)),
    event,
  });
  fs.rmSync(claim.path, { force: true });
}

export function requeueFailedEvents() {
  const paths = ensureQueueDirs();
  let requeued = 0;
  for (const fileName of fs.readdirSync(paths.failed).filter((name) => name.endsWith(".json"))) {
    const from = path.join(paths.failed, fileName);
    const envelope = readJsonIfExists(from, null);
    if (!envelope?.event?.finalText) continue;
    const to = path.join(paths.ready, fileName);
    writeJson0600(to, {
      queuedAt: Date.now(),
      attempts: Number(envelope.attempts || 0),
      event: envelope.event,
    });
    fs.rmSync(from, { force: true });
    requeued += 1;
  }
  return requeued;
}

export function clearFailedEvents() {
  const paths = ensureQueueDirs();
  let cleared = 0;
  for (const fileName of fs.readdirSync(paths.failed).filter((name) => name.endsWith(".json"))) {
    fs.rmSync(path.join(paths.failed, fileName), { force: true });
    cleared += 1;
  }
  return cleared;
}

export function queueStatus() {
  const paths = ensureQueueDirs();
  const count = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith(".json")).length;
  return {
    ready: count(paths.ready),
    processing: count(paths.processing),
    failed: count(paths.failed),
    locked: fs.existsSync(paths.lock),
  };
}
