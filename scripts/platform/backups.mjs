import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PLATFORM_BACKUP_DIRECTORY, PLATFORM_LOCAL_FILE } from "./constants.mjs";
import { loadLocalWorkspace, saveLocalWorkspace } from "./local-state.mjs";
import { validatePlatformRecord } from "./model.mjs";
import { safePlatformPath, safeExternalPath, validateExternalRoot } from "./security.mjs";

function defaultBackupPath(now) {
  return resolve(PLATFORM_BACKUP_DIRECTORY, `workspace-${now.replace(/[:.]/g, "-")}.json`);
}

export function createWorkspaceBackup({ output, localFile = PLATFORM_LOCAL_FILE, now = new Date().toISOString(), dryRun = false } = {}) {
  const backup = { schemaVersion: 1, createdAt: now, scope: "local-registry-only", localWorkspace: loadLocalWorkspace(localFile) };
  validatePlatformRecord("platform-backup", backup, "platform backup");
  const file = safePlatformPath(output ?? defaultBackupPath(now), { mustExist: false }).absolute;
  if (!dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(backup, null, 2)}\n`);
  }
  return { file, backup };
}

export function inspectWorkspaceBackup(path) {
  const file = safePlatformPath(path).absolute;
  const backup = JSON.parse(readFileSync(file, "utf8"));
  return validatePlatformRecord("platform-backup", backup, "platform backup");
}

export function restoreWorkspaceBackup(path, { localFile = PLATFORM_LOCAL_FILE, dryRun = false, confirm = false } = {}) {
  if (!dryRun && !confirm) throw new Error("Restoring the local workspace requires --confirm.");
  const backup = inspectWorkspaceBackup(path);
  const local = backup.localWorkspace;
  const roots = local.allowedRoots.map(validateExternalRoot);
  local.projects.forEach((project) => safeExternalPath(project.path, roots));
  saveLocalWorkspace(local, { file: localFile, dryRun });
  return { projects: local.projects.length, roots: local.allowedRoots.length, scope: backup.scope };
}
