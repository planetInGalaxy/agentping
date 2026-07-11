#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installHermesIntegration, installOpenClawIntegration } from "./platform-integrations.mjs";
import { rollbackRuntime, runtimeCurrentPath } from "./runtime-install.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "update";
const dryRun = process.argv.includes("--dry-run");

if (command === "rollback") {
  try {
    const result = rollbackRuntime({ dryRun });
    installOpenClawIntegration({ runtimeRoot: runtimeCurrentPath(), dryRun });
    installHermesIntegration({ runtimeRoot: runtimeCurrentPath(), dryRun });
    console.log(`Rolled back AgentPing runtime to ${result.version}.`);
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
} else {
  const installer = path.join(projectRoot, "scripts", "install.mjs");
  if (!fs.existsSync(installer)) {
    console.error("AgentPing installer is missing from this package.");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [
    installer,
    "--yes",
    "--skip-key",
    "--skip-model-check",
    ...(dryRun ? ["--dry-run"] : []),
  ], { stdio: "inherit" });
  process.exit(result.status || 0);
}
