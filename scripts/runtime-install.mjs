import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function runtimeBaseDir() {
  return process.env.AGENTPING_RUNTIME_DIR || path.join(os.homedir(), ".local", "share", "agentping");
}

export function runtimeCurrentPath() {
  return path.join(runtimeBaseDir(), "current");
}

export function runtimeMetadataPath() {
  return path.join(runtimeBaseDir(), "install.json");
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function currentVersion() {
  try {
    return path.basename(fs.realpathSync(runtimeCurrentPath()));
  } catch {
    return "";
  }
}

function switchCurrent(versionDirectory) {
  const current = runtimeCurrentPath();
  const temporary = `${current}.${process.pid}.tmp`;
  try {
    fs.unlinkSync(temporary);
  } catch {
    // No stale temporary link.
  }
  fs.symlinkSync(versionDirectory, temporary, "dir");
  fs.renameSync(temporary, current);
}

export function installRuntime({ projectRoot, version, dryRun = false } = {}) {
  if (!projectRoot || !version) throw new Error("projectRoot and version are required");
  const base = runtimeBaseDir();
  const versionDirectory = path.join(base, "versions", version);
  const previousVersion = currentVersion();
  if (dryRun) return { currentPath: runtimeCurrentPath(), versionDirectory, previousVersion, changed: true };

  const staging = `${versionDirectory}.${process.pid}.staging`;
  const backup = `${versionDirectory}.${process.pid}.backup`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(backup, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  for (const name of ["plugins", "integrations"]) {
    const source = path.join(projectRoot, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(staging, name), { recursive: true });
  }
  fs.copyFileSync(path.join(projectRoot, "package.json"), path.join(staging, "package.json"));
  fs.mkdirSync(path.dirname(versionDirectory), { recursive: true });
  try {
    if (fs.existsSync(versionDirectory)) fs.renameSync(versionDirectory, backup);
    fs.renameSync(staging, versionDirectory);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(versionDirectory) && fs.existsSync(backup)) {
      fs.renameSync(backup, versionDirectory);
    }
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  fs.mkdirSync(base, { recursive: true });
  switchCurrent(versionDirectory);

  const metadata = readJson(runtimeMetadataPath(), {});
  const history = [previousVersion, ...(Array.isArray(metadata.history) ? metadata.history : [])]
    .filter((item, index, list) => item && item !== version && list.indexOf(item) === index)
    .slice(0, 10);
  atomicWriteJson(runtimeMetadataPath(), {
    schemaVersion: 1,
    currentVersion: version,
    previousVersion: history[0] || "",
    history,
    installedAt: new Date().toISOString(),
  });
  return { currentPath: runtimeCurrentPath(), versionDirectory, previousVersion, changed: true };
}

export function rollbackRuntime({ dryRun = false } = {}) {
  const metadata = readJson(runtimeMetadataPath(), {});
  const targetVersion = metadata.previousVersion || metadata.history?.[0] || "";
  if (!targetVersion) throw new Error("no previous AgentPing runtime is available");
  const targetDirectory = path.join(runtimeBaseDir(), "versions", targetVersion);
  if (!fs.existsSync(targetDirectory)) throw new Error(`runtime version ${targetVersion} is missing`);
  if (dryRun) return { version: targetVersion, currentPath: runtimeCurrentPath() };

  const oldVersion = currentVersion();
  switchCurrent(targetDirectory);
  const history = [oldVersion, ...(metadata.history || [])]
    .filter((item, index, list) => item && item !== targetVersion && list.indexOf(item) === index)
    .slice(0, 10);
  atomicWriteJson(runtimeMetadataPath(), {
    ...metadata,
    currentVersion: targetVersion,
    previousVersion: history[0] || "",
    history,
    rolledBackAt: new Date().toISOString(),
  });
  return { version: targetVersion, currentPath: runtimeCurrentPath() };
}

export function runtimeStatus() {
  const metadata = readJson(runtimeMetadataPath(), {});
  const currentPath = runtimeCurrentPath();
  let resolvedPath = "";
  try {
    resolvedPath = fs.realpathSync(currentPath);
  } catch {
    // Runtime is not installed yet.
  }
  return {
    installed: Boolean(resolvedPath),
    currentPath,
    resolvedPath,
    currentVersion: resolvedPath ? path.basename(resolvedPath) : "",
    previousVersion: metadata.previousVersion || "",
  };
}
