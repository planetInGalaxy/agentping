#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logEvent, readStdin } from "./pushdeer-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const workerScript = path.join(path.dirname(__filename), "claude-notify-event.mjs");

try {
  const input = await readStdin();
  if (!input.trim()) process.exit(0);
  const child = spawn(process.execPath, [workerScript], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
    env: process.env,
  });
  child.stdin.end(input);
  child.unref();
} catch (error) {
  logEvent("error", "Claude notify launcher failed", {
    platform: "claude",
    error: error?.message || String(error),
  });
}
