#!/usr/bin/env node
import {
  findFinalizedMulticaAborts,
  logEvent,
} from "./pushdeer-lib.mjs";
import { submitCompletionEvent } from "./submit-completion-event.mjs";

const pollMs = Math.max(250, Number.parseInt(process.env.AGENTPING_MULTICA_POLL_MS || "1000", 10) || 1000);
const lookbackMs = Math.max(0, Number.parseInt(process.env.AGENTPING_MULTICA_LOOKBACK_MS || "5000", 10) || 5000);
const maxFileBytes = Math.max(
  1024 * 1024,
  Math.min(
    32 * 1024 * 1024,
    Number.parseInt(process.env.AGENTPING_MULTICA_MAX_FILE_BYTES || "", 10) || 8 * 1024 * 1024,
  ),
);
const explicitSinceMs = process.env.AGENTPING_MULTICA_SINCE_MS;
let cursorMs = explicitSinceMs === undefined
  ? Date.now() - lookbackMs
  : Math.max(0, Number.parseInt(explicitSinceMs, 10) || 0);
let modifiedSinceMs = cursorMs;
const observed = new Set();
const maxObserved = 512;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scan() {
  const scanBoundaryMs = Date.now();
  const completions = findFinalizedMulticaAborts({
    sinceMs: cursorMs,
    modifiedSinceMs,
    maxFileBytes,
  });
  for (const completion of completions) {
    cursorMs = Math.max(cursorMs, completion.terminalAtMs + 1);
    if (!completion.turnId || observed.has(completion.turnId)) continue;
    observed.add(completion.turnId);
    while (observed.size > maxObserved) {
      observed.delete(observed.values().next().value);
    }
    await submitCompletionEvent({
      agentId: "codex",
      agentType: "codex",
      eventId: `codex-${completion.turnId}`,
      sessionId: completion.turnId,
      status: "success",
      terminalType: "task_complete",
      finalText: completion.finalText,
      userText: completion.userText,
      startedAt: completion.startedTimestamp,
      completedAt: completion.terminalTimestamp,
      durationMs: completion.durationMs,
      model: completion.model,
      provider: completion.provider,
      usage: completion.usage,
      cwd: completion.cwd || process.cwd(),
      metadata: {
        source: "multica-session-watcher",
        sourceTerminalType: completion.sourceTerminalType,
        originator: completion.originator,
      },
    });
    logEvent("info", "Multica finalized turn queued", {
      platform: "codex",
      turnId: completion.turnId,
      durationMs: completion.durationMs,
      sourceTerminalType: completion.sourceTerminalType,
    });
  }
  modifiedSinceMs = scanBoundaryMs;
}

async function main() {
  logEvent("info", "Multica session watcher started", {
    pollMs,
    lookbackMs,
    maxFileBytes,
    maxObserved,
  });
  do {
    await scan();
    if (process.env.AGENTPING_MULTICA_WATCH_ONCE === "1") break;
    await sleep(pollMs);
  } while (true);
}

main().catch((error) => {
  logEvent("error", "Multica session watcher failed", {
    error: error?.message || String(error),
  });
  process.exitCode = 1;
});
