import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { ROOT } from "../scripts/lib.mjs";
import { buildWorkspaceIndex } from "../scripts/platform/indexer.mjs";
import { JobManager, workflowCommand } from "../scripts/platform/jobs.mjs";
import { loadWorkspace, validatePlatformRecord } from "../scripts/platform/model.mjs";
import { redactLog, safePlatformPath } from "../scripts/platform/security.mjs";
import { createPlatformServer, startPlatform } from "../scripts/platform/server.mjs";

const temporaryRoot = resolve(ROOT, ".tmp");
mkdirSync(temporaryRoot, { recursive: true });
const waitFor = async (predicate) => { for (let index = 0; index < 50; index += 1) { if (predicate()) return; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10)); } throw new Error("Timed out waiting for test state."); };

test("two-project workspace produces deterministic schema-valid summaries", () => {
  const first = buildWorkspaceIndex();
  const second = buildWorkspaceIndex();
  assert.deepEqual(first, second);
  assert.deepEqual(first.projects.map((project) => project.id), ["founderos-core", "ai-launch-copilot"]);
  assert.equal(first.projects[0].milestone, "M5A pilot");
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
