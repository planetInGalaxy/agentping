#!/usr/bin/env node
import { logEvent, readStdin, safeJsonParse } from "./pushdeer-lib.mjs";
import { submitCompletionEvent } from "./submit-completion-event.mjs";

async function main() {
  const raw = process.argv[2] || await readStdin();
  const input = safeJsonParse(raw);
  if (!input) throw new Error("AgentPing ingest expected one JSON completion event");
  return submitCompletionEvent(input);
}

main().catch((error) => {
  logEvent("error", "AgentPing ingest failed", { error: error?.message || String(error) });
  process.exit(0);
});
