#!/usr/bin/env node
import {
  findFinalizedMulticaAborts,
  logEvent,
} from "./pushdeer-lib.mjs";
import { submitCompletionEvent } from "./submit-completion-event.mjs";

const pollMs = Math.max(250, Number.parseInt(process.env.AGENTPING_MULTICA_POLL_MS || "1000", 10) || 1000);
const lookbackMs = Math.max(0, Number.parseInt(process.env.AGENTPING_MULTICA_LOOKBACK_MS || "5000", 10) || 5000);
const explicitSinceMs = process.env.AGENTPING_MULTICA_SINCE_MS;
let cursorMs = explicitSinceMs === undefined
  ? Date.now() - lookbackMs
  : Math.max(0, Number.parseInt(explicitSinceMs, 10) || 0);
const observed = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scan() {
  const completions = findFinalizedMulticaAborts({ sinceMs: cursorMs });
  for (const completion of completions) {
    cursorMs = Math.max(cursorMs, completion.terminalAtMs + 1);
    if (!completion.turnId || observed.has(completion.turnId)) continue;
    observed.add(completion.turnId);
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
}

async function main() {
  logEvent("info", "Multica session watcher started", { pollMs, lookbackMs });
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
