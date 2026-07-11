import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function commandAvailable(command, args = ["--version"]) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

function run(command, args, { dryRun = false } = {}) {
  if (dryRun) return { status: 0, stdout: "", stderr: "" };
  return spawnSync(command, args, { encoding: "utf8", stdio: "pipe", timeout: 30_000 });
}

export function hermesPluginPath() {
  return process.env.HERMES_PLUGIN_DIR || path.join(os.homedir(), ".hermes", "plugins", "agentping");
}

export function installHermesIntegration({ runtimeRoot, dryRun = false } = {}) {
  if (!commandAvailable("hermes")) return { available: false, installed: false, detail: "Hermes is not installed" };
  const source = path.join(runtimeRoot, "integrations", "hermes");
  const target = hermesPluginPath();
  const existingManifest = path.join(target, "plugin.yaml");
  if (fs.existsSync(target) && (
    !fs.existsSync(existingManifest) ||
    !/^name:\s*agentping\s*$/mu.test(fs.readFileSync(existingManifest, "utf8"))
  )) {
    return { available: true, installed: false, detail: `${target} exists and is not owned by AgentPing` };
  }
  if (!dryRun) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  return { available: true, installed: true, detail: target };
}

export function removeHermesIntegration({ dryRun = false } = {}) {
  const target = hermesPluginPath();
  if (!fs.existsSync(path.join(target, "plugin.yaml"))) return { changed: false, detail: "not installed" };
  const manifest = fs.readFileSync(path.join(target, "plugin.yaml"), "utf8");
  if (!/^name:\s*agentping\s*$/mu.test(manifest)) {
    return { changed: false, detail: "plugin directory is not owned by AgentPing" };
  }
  if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
  return { changed: true, detail: target };
}

export function hermesIntegrationStatus() {
  const target = hermesPluginPath();
  const manifest = path.join(target, "plugin.yaml");
  const installed = fs.existsSync(manifest) && /^name:\s*agentping\s*$/mu.test(fs.readFileSync(manifest, "utf8"));
  return { available: commandAvailable("hermes"), installed, detail: installed ? target : "not installed" };
}

export function installOpenClawIntegration({ runtimeRoot, dryRun = false } = {}) {
  if (!commandAvailable("openclaw")) return { available: false, installed: false, detail: "OpenClaw is not installed" };
  const source = path.join(runtimeRoot, "integrations", "openclaw");
  const installed = run("openclaw", ["plugins", "install", source], { dryRun });
  const output = `${installed.stdout || ""}\n${installed.stderr || ""}`;
  if (installed.status !== 0 && !/already|exists|installed/iu.test(output)) {
    return { available: true, installed: false, detail: output.trim() || "plugin install failed" };
  }
  const permission = run(
    "openclaw",
    ["config", "set", "plugins.entries.agentping.hooks.allowConversationAccess", "true"],
    { dryRun },
  );
  if (permission.status !== 0) {
    return {
      available: true,
      installed: false,
      detail: `plugin installed, but conversation access could not be enabled: ${(permission.stderr || permission.stdout || "unknown error").trim()}`,
    };
  }
  return { available: true, installed: true, detail: source };
}

export function removeOpenClawIntegration({ dryRun = false } = {}) {
  if (!commandAvailable("openclaw")) return { changed: false, detail: "OpenClaw is not installed" };
  const result = run("openclaw", ["plugins", "uninstall", "agentping"], { dryRun });
  return {
    changed: result.status === 0,
    detail: result.status === 0 ? "agentping" : (result.stderr || result.stdout || "not installed").trim(),
  };
}

export function openClawIntegrationStatus() {
  if (!commandAvailable("openclaw")) return { available: false, installed: false, detail: "OpenClaw is not installed" };
  const result = run("openclaw", ["plugins", "list"]);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const installed = result.status === 0 && /\bagentping\b/iu.test(output);
  return { available: true, installed, detail: installed ? "installed" : "not installed" };
}
