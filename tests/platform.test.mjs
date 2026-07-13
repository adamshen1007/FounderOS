import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import { ROOT } from "../scripts/lib.mjs";
import { buildWorkspaceIndex, WorkspaceIndex } from "../scripts/platform/indexer.mjs";
import { JobManager, workflowCommand } from "../scripts/platform/jobs.mjs";
import { loadWorkspace, validatePlatformRecord } from "../scripts/platform/model.mjs";
import { redactLog, safePlatformPath } from "../scripts/platform/security.mjs";
import { createPlatformServer, startPlatform } from "../scripts/platform/server.mjs";
import { addProject, inspectProject, removeProject } from "../scripts/platform/registry.mjs";
import { cleanJobs, diagnostics, sanitizedJobs } from "../scripts/platform/operations.mjs";

const temporaryRoot = resolve(ROOT, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const waitFor = async (predicate) => { for (let index = 0; index < 50; index += 1) { if (predicate()) return; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10)); } throw new Error("Timed out waiting for test state."); };

test("two-project workspace produces deterministic schema-valid summaries", () => {
  const first = buildWorkspaceIndex();
  const second = buildWorkspaceIndex();
  assert.deepEqual(first, second);
  assert.deepEqual(first.projects.map((project) => project.id), ["founderos-core", "ai-launch-copilot"]);
  assert.equal(first.projects[0].milestone, "M5A.1 pilot");
  first.projects.forEach((project) => validatePlatformRecord("project-summary", project));
});

test("workspace rejects duplicate projects and missing kit manifests", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "workspace-"));
  try {
    const base = loadWorkspace();
    base.projects[1].id = base.projects[0].id;
    const file = resolve(directory, "workspace.yaml");
    writeFileSync(file, stringify(base));
    assert.throws(() => loadWorkspace(file), /Duplicate workspace project ID/);
    delete base.projects[1].manifest;
    base.projects[1].id = "kit-two";
    writeFileSync(file, stringify(base));
    assert.throws(() => loadWorkspace(file), /must declare a manifest/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("registry add, inspect, dry-run, and remove never delete projects", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "registry-"));
  const project = resolve(directory, "third-project");
  cpSync(resolve(ROOT, "examples", "ai-launch-copilot"), project, { recursive: true });
  const workspaceFile = resolve(directory, "workspace.yaml");
  writeFileSync(workspaceFile, stringify(loadWorkspace()));
  try {
    assert.equal(addProject(project, { id: "third-project", file: workspaceFile }).kind, "kit");
    assert.equal(inspectProject("third-project", workspaceFile).path.startsWith(".tmp/"), true);
    removeProject("third-project", { file: workspaceFile, dryRun: true });
    assert.ok(inspectProject("third-project", workspaceFile));
    removeProject("third-project", { file: workspaceFile, confirm: true });
    assert.throws(() => inspectProject("third-project", workspaceFile), /not registered/);
    assert.equal(existsSync(project), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("live index increments only when canonical state changes", () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "live-index-"));
  const file = resolve(directory, "workspace.yaml");
  const workspace = loadWorkspace();
  writeFileSync(file, stringify(workspace));
  try {
    const index = new WorkspaceIndex({ file, now: () => "2026-07-13T09:00:00Z" });
    assert.equal(index.refresh().index.generation, 1);
    workspace.workspace.name = "Changed Working Studio";
    writeFileSync(file, stringify(workspace));
    const refreshed = index.refresh();
    assert.equal(refreshed.index.generation, 2);
    assert.equal(refreshed.workspace.name, "Changed Working Studio");
    writeFileSync(file, "invalid: true\n");
    const stale = index.refresh();
    assert.equal(stale.index.stale, true);
    assert.equal(stale.workspace.name, "Changed Working Studio");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("pilot template validates without being claimed as a completed session", () => {
  const template = parse(readFileSync(resolve(ROOT, "pilots", "templates", "session.yaml"), "utf8"));
  assert.doesNotThrow(() => validatePlatformRecord("pilot-session", template));
  assert.equal(template.observations[0].startsWith("Replace this template"), true);
});

test("platform paths deny escape, secrets, and symbolic links", () => {
  assert.throws(() => safePlatformPath("../outside"), /inside the repository/);
  assert.throws(() => safePlatformPath(".env"), /denied/);
  const target = mkdtempSync(resolve(temporaryRoot, "platform-target-"));
  const link = resolve(temporaryRoot, "platform-link");
  try { symlinkSync(target, link); assert.throws(() => safePlatformPath(link), /symbolic link/); }
  finally { rmSync(link, { force: true }); rmSync(target, { recursive: true, force: true }); }
});

test("workflow allowlist is fixed and logs redact secrets", () => {
  assert.match(workflowCommand("founderos-core", "research-validate", "JOB-TEST").join(" "), /research validate/);
  assert.throws(() => workflowCommand("founderos-core", "git-push", "JOB-TEST"), /not allowed/);
  assert.equal(redactLog("authorization=Bearer abc123 password=hunter2"), "authorization=[REDACTED] password=[REDACTED]");
});

test("job records persist terminal state and recover interrupted work", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "jobs-"));
  try {
    const manager = new JobManager({ directory, now: () => "2026-07-13T06:00:00Z", executor: async (_command, output) => { output("token=secret-value\ncompleted"); return { exitCode: 0, output: "" }; } });
    const job = manager.create("founderos-core", "research-validate");
    await waitFor(() => manager.get(job.id).status === "passed");
    assert.doesNotMatch(manager.get(job.id).log, /secret-value/);
    const stored = JSON.parse(readFileSync(resolve(directory, `${job.id}.json`), "utf8"));
    stored.status = "running";
    writeFileSync(resolve(directory, `${job.id}.json`), `${JSON.stringify(stored)}\n`);
    const recovered = new JobManager({ directory, now: () => "2026-07-13T06:05:00Z" });
    assert.equal(recovered.get(job.id).status, "failed");
    assert.match(recovered.get(job.id).log, /restart/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("running jobs cancel explicitly and reruns retain lineage", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "job-cancel-"));
  let finish;
  const executor = async (_command, _output, registerCancel) => new Promise((resolvePromise) => { finish = resolvePromise; registerCancel(() => resolvePromise({ exitCode: 143, output: "terminated" })); });
  try {
    const manager = new JobManager({ directory, executor });
    const job = manager.create("founderos-core", "research-validate");
    await waitFor(() => manager.get(job.id).status === "running");
    assert.equal(manager.cancel(job.id).status, "cancelled");
    await waitFor(() => manager.active === false);
    const rerun = manager.rerun(job.id);
    assert.equal(rerun.parentJobId, job.id);
    assert.ok(["queued", "running"].includes(rerun.status));
    finish({ exitCode: 0, output: "" });
    await waitFor(() => manager.get(rerun.id).status === "passed");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("diagnostics and exports omit logs while retention supports dry-run", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "job-retention-"));
  try {
    const manager = new JobManager({ directory, now: () => "2025-01-01T00:00:00Z", executor: async () => ({ exitCode: 0, output: "password=private" }) });
    manager.create("founderos-core", "research-validate");
    await waitFor(() => manager.list()[0].status === "passed");
    assert.equal("log" in sanitizedJobs(directory)[0], false);
    assert.equal(diagnostics(directory).jobs.total, 1);
    assert.equal(cleanJobs({ days: 30, dryRun: true, directory, now: Date.parse("2026-01-01T00:00:00Z") }).length, 1);
    assert.equal(sanitizedJobs(directory).length, 1);
    cleanJobs({ days: 30, directory, now: Date.parse("2026-01-01T00:00:00Z") });
    assert.equal(sanitizedJobs(directory).length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("local API serves state and requires CSRF plus confirmation for jobs", async () => {
  const directory = mkdtempSync(resolve(temporaryRoot, "api-jobs-"));
  const jobs = new JobManager({ directory, executor: async () => ({ exitCode: 0, output: "ok" }) });
  const platform = createPlatformServer({ jobs, csrfToken: "test-csrf" });
  await new Promise((resolvePromise) => platform.server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = platform.server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const workspace = await (await fetch(`${base}/api/workspace`)).json();
    assert.equal(workspace.projects.length, 2);
    const denied = await fetch(`${base}/api/projects/founderos-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
    assert.equal(denied.status, 403);
    const unconfirmed = await fetch(`${base}/api/projects/founderos-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json", "x-founderos-csrf": "test-csrf" }, body: JSON.stringify({ confirm: false }) });
    assert.equal(unconfirmed.status, 400);
    const accepted = await fetch(`${base}/api/projects/founderos-core/workflows/research-validate`, { method: "POST", headers: { "content-type": "application/json", "x-founderos-csrf": "test-csrf" }, body: JSON.stringify({ confirm: true }) });
    assert.equal(accepted.status, 202);
    assert.match((await accepted.json()).id, /^JOB-/);
  } finally { await new Promise((resolvePromise) => platform.server.close(resolvePromise)); rmSync(directory, { recursive: true, force: true }); }
});

test("platform refuses non-loopback hosts", async () => {
  await assert.rejects(() => startPlatform({ host: "0.0.0.0", port: 0 }), /local-only/);
});
