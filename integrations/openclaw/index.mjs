import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openClawCompletionEvent } from "./adapter.mjs";

function ingestScript() {
  return process.env.AGENTPING_INGEST_SCRIPT || path.join(
    os.homedir(), ".local", "share", "agentping", "current",
    "plugins", "agentping", "scripts", "agentping-ingest.mjs",
  );
}

function submit(event) {
  if (process.env.AGENTPING_SUPPRESS_NOTIFY === "1" || process.env.CODEX_PUSHDEER_SUPPRESS_NOTIFY === "1") return;
  const script = ingestScript();
  if (!event || !fs.existsSync(script)) return;
  const child = spawn(process.execPath, [script, JSON.stringify(event)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export default {
  id: "agentping",
  name: "AgentPing",
  register(api) {
    api.on("agent_end", (event, context) => submit(openClawCompletionEvent(event, context)));
  },
};
