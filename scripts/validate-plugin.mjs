#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agentping");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const marketplacePath = path.join(projectRoot, ".agents", "plugins", "marketplace.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = readJson(manifestPath);
const packageManifest = readJson(path.join(projectRoot, "package.json"));
const openClawManifest = readJson(path.join(projectRoot, "integrations", "openclaw", "package.json"));
assert(manifest.name === "agentping", "Unexpected plugin name.");
assert(/^\d+\.\d+\.\d+/.test(manifest.version), "Plugin version must look semver-like.");
assert(manifest.version === packageManifest.version, "Codex plugin version must match package.json.");
assert(openClawManifest.version === packageManifest.version, "OpenClaw integration version must match package.json.");
assert(manifest.skills === "./skills/", "Manifest skills path should be ./skills/.");
assert(fs.existsSync(path.join(pluginRoot, "skills")), "Missing plugin skills directory.");
assert(fs.existsSync(path.join(pluginRoot, "scripts", "pushdeer-notify-event.mjs")), "Missing notify event script.");
assert(fs.existsSync(path.join(pluginRoot, "scripts", "claude-notify-event.mjs")), "Missing Claude notify event script.");
assert(fs.existsSync(path.join(pluginRoot, "scripts", "claude-notify-launcher.mjs")), "Missing Claude notify launcher.");
assert(fs.existsSync(path.join(pluginRoot, "scripts", "completion-notify.mjs")), "Missing shared completion notifier.");

const marketplace = readJson(marketplacePath);
assert(marketplace.name === "agentping", "Unexpected marketplace name.");
const entry = marketplace.plugins?.find((item) => item.name === manifest.name);
assert(entry, "Marketplace is missing the plugin entry.");
assert(entry.source?.path === "./plugins/agentping", "Marketplace source.path is wrong.");
assert(entry.policy?.installation === "AVAILABLE", "Marketplace installation policy should be AVAILABLE.");
assert(entry.policy?.authentication === "ON_INSTALL", "Marketplace authentication policy should be ON_INSTALL.");

console.log("Plugin structure validation passed.");
