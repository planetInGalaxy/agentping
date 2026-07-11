#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const command = process.argv[2] || "help";
const passthrough = process.argv.slice(3);

const scripts = {
  install: "scripts/install.mjs",
  setup: "scripts/install.mjs",
  uninstall: "scripts/uninstall.mjs",
  update: "scripts/update.mjs",
  rollback: "scripts/update.mjs",
  doctor: "scripts/doctor.mjs",
  config: "scripts/config.mjs",
  logs: "scripts/logs.mjs",
  queue: "scripts/queue.mjs",
  test: "scripts/test-notifier.mjs",
  "check-models": "scripts/check-models.mjs",
  models: "scripts/check-models.mjs",
  validate: "scripts/validate-plugin.mjs",
};

if (command === "help" || command === "--help" || command === "-h") {
  console.log([
    "Usage: agentping <command> [options]",
    "",
    "Commands:",
    "  install       Configure supported agent completion notifications",
    "  update        Install this package version and preserve configuration",
    "  rollback      Switch back to the previously installed runtime",
    "  uninstall     Remove plugin and optional local config",
    "  doctor        Diagnose local AgentPing setup",
    "  config        Show or change PushDeer notifier config",
    "  logs          Show, tail, rotate, or clear notifier logs",
    "  queue         Inspect, retry, or clear queued completion events",
    "  test          Run local notifier self-tests",
    "  check-models  Detect Codex summary model and optionally write config",
    "  validate      Validate plugin structure",
  ].join("\n"));
  process.exit(0);
}

const script = scripts[command];
if (!script) {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

const scriptArgs = command === "rollback" ? ["rollback", ...passthrough] : passthrough;
const result = spawnSync(process.execPath, [path.join(root, script), ...scriptArgs], {
  stdio: "inherit",
});
process.exit(result.status || 0);
