import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import { ROOT } from "../lib.mjs";
import { PLATFORM_JOB_DIRECTORY } from "./constants.mjs";
import { buildWorkspaceIndex } from "./indexer.mjs";
import { validatePlatformRecord } from "./model.mjs";
import { safePlatformPath } from "./security.mjs";
import { normalizeJob } from "./jobs.mjs";

function jobFiles(directory = PLATFORM_JOB_DIRECTORY) {
  const safe = safePlatformPath(directory, { mustExist: false });
  if (!existsSync(safe.absolute)) return [];
  return readdirSync(safe.absolute).filter((name) => name.endsWith(".json")).sort().map((name) => resolve(safe.absolute, name));
}

export function sanitizedJobs(directory) {
  return jobFiles(directory).map((file) => {
    const job = validatePlatformRecord("workflow-job", normalizeJob(JSON.parse(readFileSync(file, "utf8"))));
    return { id: job.id, projectId: job.projectId, workflow: job.workflow, status: job.status, createdAt: job.createdAt, completedAt: job.completedAt, durationMs: job.durationMs, terminationReason: job.terminationReason, parentJobId: job.parentJobId ?? null, outputTruncated: job.outputTruncated };
  });
}

export function diagnostics(directory) {
  const index = buildWorkspaceIndex();
  const jobs = sanitizedJobs(directory);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), runtime: { node: process.versions.node, platform: process.platform }, workspace: { name: index.workspace.name, projects: index.projects.map((project) => ({ id: project.id, health: project.health })) }, jobs: { total: jobs.length, byStatus: Object.fromEntries(["queued", "running", "passed", "failed", "cancelled"].map((status) => [status, jobs.filter((job) => job.status === status).length])) }, privacy: "sanitized-no-logs-no-environment" };
}

export function writeJsonOutput(output, value) {
  const file = safePlatformPath(output, { mustExist: false }).absolute;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

export function cleanJobs({ days, dryRun = false, directory, now = Date.now() }) {
  if (!Number.isInteger(days) || days < 1) throw new Error("Retention days must be a positive integer.");
  const threshold = now - days * 86400000;
  const files = jobFiles(directory).filter((file) => {
    const job = JSON.parse(readFileSync(file, "utf8"));
    return !["queued", "running"].includes(job.status) && Date.parse(job.updatedAt) < threshold;
  });
  if (!dryRun) files.forEach((file) => rmSync(file));
  return files;
}

export function validatePilotSessions() {
  const directory = resolve(ROOT, "pilots", "sessions");
  const files = readdirSync(directory).filter((name) => name.endsWith(".yaml")).sort();
  files.forEach((name) => validatePlatformRecord("pilot-session", parse(readFileSync(resolve(directory, name), "utf8")), `pilot session ${name}`));
  return files.length;
}
