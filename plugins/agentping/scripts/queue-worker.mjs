#!/usr/bin/env node
import { completionEventSendId } from "./adapter-sdk.mjs";
import {
  acquireQueueLock,
  claimNextEvent,
  completeClaim,
  failClaim,
  recoverProcessingEvents,
  releaseQueueLock,
} from "./event-queue.mjs";
import { sendCompletionNotification } from "./completion-notify.mjs";
import { logEvent } from "./pushdeer-lib.mjs";

export async function drainCompletionQueue() {
  if (!acquireQueueLock()) return { acquired: false, processed: 0, failed: 0 };
  let processed = 0;
  let failed = 0;
  try {
    const recovered = recoverProcessingEvents();
    if (recovered > 0) logEvent("warn", "Recovered interrupted AgentPing queue events", { recovered });
    while (true) {
      const claim = claimNextEvent();
      if (!claim) break;
      const event = claim.envelope.event;
      try {
        await sendCompletionNotification({
          agentId: event.agentId,
          platform: event.agentType,
          finalText: event.finalText,
          userText: event.userText,
          sendId: completionEventSendId(event),
          turnId: event.sessionId,
          terminalType: event.terminalType,
          durationMs: event.durationMs,
          cwd: event.cwd,
          event,
        });
        completeClaim(claim);
        processed += 1;
      } catch (error) {
        failClaim(claim, error);
        failed += 1;
        logEvent("error", "AgentPing queued event failed", {
          agentId: event.agentId,
          agentType: event.agentType,
          eventId: event.eventId,
          error: error?.message || String(error),
        });
      }
    }
  } finally {
    releaseQueueLock();
  }
  return { acquired: true, processed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  drainCompletionQueue().catch((error) => {
    logEvent("error", "AgentPing queue worker failed", { error: error?.message || String(error) });
    process.exit(0);
  });
}
