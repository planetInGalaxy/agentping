function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && (part.type === "text" || typeof part.text === "string"))
    .map((part) => String(part.text || ""))
    .join("\n")
    .trim();
}

function messagesByRole(messages, role) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === role)
    .map((message) => textFromContent(message.content ?? message.text))
    .filter(Boolean);
}

export function openClawCompletionEvent(event = {}, context = {}) {
  const messages = event.messages || context.messages || [];
  const assistantTexts = messagesByRole(messages, "assistant");
  const userTexts = messagesByRole(messages, "user");
  const finalText = String(
    event.finalText || event.response || assistantTexts.at(-1) || "",
  ).trim();
  if (!finalText) return null;
  const success = event.success !== false && !event.error;
  const durationMs = Number(event.durationMs ?? event.duration_ms ?? context.durationMs);
  return {
    agentId: "openclaw",
    agentType: "openclaw",
    sessionId: String(event.sessionId || event.session_id || context.sessionId || context.session_id || ""),
    parentSessionId: String(event.parentSessionId || context.parentSessionId || ""),
    isSubagent: Boolean(event.isSubagent || context.isSubagent),
    status: success ? "success" : "failed",
    terminalType: success ? "task_complete" : "task_failed",
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null,
    userText: String(event.userText || userTexts.at(-1) || "").trim(),
    finalText,
    model: String(event.model || context.model || ""),
    provider: String(event.provider || context.provider || ""),
    cwd: String(event.cwd || context.cwd || process.cwd()),
    usage: event.usage || null,
    metadata: { sourceHook: "agent_end" },
  };
}
