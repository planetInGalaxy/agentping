#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runtimeCurrentPath } from "./runtime-install.mjs";

const label = "com.agentping.multica-session-watcher";
const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const stateDir = path.join(os.homedir(), ".local", "state", "agentping");
const watcherScript = path.join(runtimeCurrentPath(), "plugins", "agentping", "scripts", "multica-session-watcher.mjs");

function xml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

function plistContents() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(watcherScript)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(path.join(stateDir, "multica-watcher.stdout.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(stateDir, "multica-watcher.stderr.log"))}</string>
</dict></plist>
`;
}

function launchctl(args, allowFailure = false) {
  const result = spawnSync("launchctl", args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `launchctl ${args[0]} failed`).trim());
  }
  return result;
}

export function multicaIntegrationStatus() {
  if (process.platform !== "darwin") {
    return { supported: false, installed: false, running: false, detail: "currently supported on macOS" };
  }
  const target = `gui/${process.getuid()}/${label}`;
  const result = launchctl(["print", target], true);
  return {
    supported: true,
    installed: fs.existsSync(plistPath),
    running: result.status === 0,
    plistPath,
    watcherScript,
    detail: result.status === 0 ? "watcher is loaded" : "watcher is not loaded",
  };
}

export function installMulticaIntegration({ dryRun = false } = {}) {
  if (process.platform !== "darwin") {
    return { installed: false, detail: "Multica watcher auto-install currently supports macOS" };
  }
  if (!fs.existsSync(watcherScript) && !dryRun) {
    throw new Error(`AgentPing runtime watcher is missing: ${watcherScript}`);
  }
  if (dryRun) return { installed: true, detail: `would install ${plistPath}` };
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(plistPath, plistContents(), { mode: 0o600 });
  const domain = `gui/${process.getuid()}`;
  launchctl(["bootout", domain, plistPath], true);
  launchctl(["bootstrap", domain, plistPath]);
  launchctl(["kickstart", "-k", `${domain}/${label}`]);
  return { installed: true, detail: `watcher loaded from ${plistPath}` };
}

export function uninstallMulticaIntegration({ dryRun = false } = {}) {
  if (process.platform !== "darwin") return { removed: false, detail: "not supported on this platform" };
  if (dryRun) return { removed: true, detail: `would remove ${plistPath}` };
  launchctl(["bootout", `gui/${process.getuid()}`, plistPath], true);
  fs.rmSync(plistPath, { force: true });
  return { removed: true, detail: `removed ${plistPath}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] || "status";
  if (command === "install") console.log(JSON.stringify(installMulticaIntegration(), null, 2));
  else if (command === "uninstall") console.log(JSON.stringify(uninstallMulticaIntegration(), null, 2));
  else if (command === "status") console.log(JSON.stringify(multicaIntegrationStatus(), null, 2));
  else {
    console.error("Usage: node scripts/multica-integration.mjs install|status|uninstall");
    process.exitCode = 2;
  }
}
