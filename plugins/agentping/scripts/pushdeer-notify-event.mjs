#!/usr/bin/env node
import {
  envValue,
  extractTurnId,
  findLatestFinalMessage,
  hashText,
  loadConfig,
  logEvent,
  safeJsonParse,
} from "./pushdeer-lib.mjs";
import {
  isInternalSummaryText,
  sendCompletionNotification,
} from "./completion-notify.mjs";

function loadNotificationArg() {
  return safeJsonParse(process.argv[2] || "") || {};
}

function inputMessagesText(notification) {
  const messages = notification["input-messages"] || notification.inputMessages || [];
  if (!Array.isArray(messages)) return String(messages || "");
  return messages
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      return item.text || item.content || item.message || "";
    })
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const notification = loadNotificationArg();
  if (notification.type !== "agent-turn-complete") return;
  if (envValue("AGENTPING_SUPPRESS_NOTIFY", "CODEX_PUSHDEER_SUPPRESS_NOTIFY") === "1") return;

  const notificationInput = inputMessagesText(notification);
  if (isInternalSummaryText(notificationInput)) {
    logEvent("info", "Skipping internal PushDeer summary notify event", { platform: "codex" });
    return;
  }

  const turnId = notification["turn-id"] || notification.turnId || extractTurnId(notification);
  const config = loadConfig();
  const sessionFinal = await findLatestFinalMessage({
    cwd: process.cwd(),
    turnId,
    timeoutMs: config.finalWaitMs,
    requireTaskComplete: config.notifyMode !== "errors_only",
  });
  if (!sessionFinal?.finalText) {
    logEvent("info", "Skipping non-final PushDeer notify event", {
      platform: "codex",
      turnId,
      finalWaitMs: config.finalWaitMs,
    });
    return;
  }
  if (isInternalSummaryText(sessionFinal.userText)) {
    logEvent("info", "Skipping internal PushDeer summary session", {
      platform: "codex",
      turnId: sessionFinal.turnId || turnId,
    });
    return;
  }

  const resolvedTurnId = sessionFinal.turnId || turnId;
  const sendId = `codex:${resolvedTurnId || hashText(JSON.stringify(notification)).slice(0, 24)}`;
  await sendCompletionNotification({
    platform: "codex",
    finalText: sessionFinal.finalText,
    userText: sessionFinal.userText || notificationInput,
    sendId,
    turnId: resolvedTurnId,
    terminalType: sessionFinal.terminalType,
    durationMs: sessionFinal.durationMs,
    cwd: process.cwd(),
  });
}

main().catch((error) => {
  logEvent("error", "PushDeer notify event failed", {
    platform: "codex",
    error: error?.message || String(error),
  });
  process.exit(0);
});
