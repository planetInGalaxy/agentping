import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLAUDE_HOOK_EVENTS = ["Stop", "StopFailure"];

export function claudeSettingsPath() {
  return process.env.CLAUDE_SETTINGS_PATH || path.join(os.homedir(), ".claude", "settings.json");
}

function normalized(value) {
  return value ? path.resolve(String(value)) : "";
}

function handlerTargetsAgentPing(handler, notifyScript) {
  if (!handler || handler.type !== "command") return false;
  if (Array.isArray(handler.args) && handler.args.some((value) =>
    normalized(value) === normalized(notifyScript) ||
    /claude-notify-(?:event|launcher)\.mjs$/u.test(String(value)))) {
    return true;
  }
  return /claude-notify-(?:event|launcher)\.mjs/u.test(String(handler.command || ""));
}

function desiredGroup(notifyScript, nodePath = process.execPath) {
  return {
    hooks: [
      {
        type: "command",
        command: nodePath,
        args: [notifyScript],
        timeout: 5,
      },
    ],
  };
}

function withoutManagedHandlers(groups, notifyScript) {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) return [group];
    const hooks = group.hooks.filter((handler) => !handlerTargetsAgentPing(handler, notifyScript));
    return hooks.length > 0 ? [{ ...group, hooks }] : [];
  });
}

export function installClaudeHooks(settings, { notifyScript, nodePath = process.execPath } = {}) {
  const current = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const hooks = current.hooks && typeof current.hooks === "object" && !Array.isArray(current.hooks)
    ? { ...current.hooks }
    : {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event] = [
      ...withoutManagedHandlers(hooks[event], notifyScript),
      desiredGroup(notifyScript, nodePath),
    ];
  }
  const next = { ...current, hooks };
  return {
    settings: next,
    changed: JSON.stringify(next) !== JSON.stringify(current),
  };
}

export function removeClaudeHooks(settings, { notifyScript } = {}) {
  const current = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const hooks = current.hooks && typeof current.hooks === "object" && !Array.isArray(current.hooks)
    ? { ...current.hooks }
    : {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = withoutManagedHandlers(hooks[event], notifyScript);
    if (groups.length > 0) hooks[event] = groups;
    else delete hooks[event];
  }
  const next = { ...current };
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else delete next.hooks;
  return {
    settings: next,
    changed: JSON.stringify(next) !== JSON.stringify(current),
  };
}

export function claudeHookStatus(settings, { notifyScript } = {}) {
  const hooks = settings?.hooks;
  const details = {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    const handlers = Array.isArray(hooks?.[event])
      ? hooks[event].flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : [])
      : [];
    const matches = handlers.filter((handler) => handlerTargetsAgentPing(handler, notifyScript));
    details[event] = matches.length;
  }
  const ok = CLAUDE_HOOK_EVENTS.every((event) => details[event] === 1);
  return {
    ok,
    detail: ok
      ? "Stop and StopFailure hooks point at the configured AgentPing runtime"
      : `managed hook counts ${CLAUDE_HOOK_EVENTS.map((event) => `${event}:${details[event]}`).join(", ")}`,
  };
}

export function readClaudeSettings(filePath = claudeSettingsPath()) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeClaudeSettings(filePath, settings) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort for filesystems without chmod support.
  }
}
