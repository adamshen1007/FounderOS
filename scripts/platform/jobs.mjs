import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT } from "../lib.mjs";
import { PLATFORM_JOB_DIRECTORY } from "./constants.mjs";
import { validatePlatformRecord } from "./model.mjs";
import { redactLog, safePlatformPath } from "./security.mjs";

const cli = resolve(ROOT, "bin", "founderos.mjs");
const research = resolve(ROOT, "research", "topics", "customer-validation-before-mvp", "research.yaml");
const kit = resolve(ROOT, "examples", "ai-launch-copilot", "founderos.project.yaml");

export function workflowCommand(projectId, workflow, jobId) {
  const key = `${projectId}:${workflow}`;
  const commands = {
    "founderos-core:quality-check": ["pnpm", "check"],
    "founderos-core:research-validate": [process.execPath, cli, "research", "validate", research],
    "founderos-core:agent-review-fake": [process.execPath, cli, "agent", "run", "research-reviewer", "--subject", research, "--provider", "fake", "--run-id", jobId.replace("JOB-", "RUN-"), "--output", resolve(ROOT, ".founderos", "agent-runs", jobId.replace("JOB-", "RUN-"))],
    "ai-launch-copilot:kit-check": [process.execPath, cli, "generate", kit, "--check"]
  };
  if (!commands[key]) throw new Error(`Workflow ${workflow} is not allowed for ${projectId}.`);
  return commands[key];
}

function defaultExecutor(command, onOutput) {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0], command.slice(1), { cwd: ROOT, shell: false, env: { ...process.env, OPENAI_API_KEY: "" } });
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);
    child.on("error", (error) => resolvePromise({ exitCode: 1, output: error.message }));
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, output: "" }));
  });
}

export class JobManager {
  constructor({ directory = PLATFORM_JOB_DIRECTORY, executor = defaultExecutor, now = () => new Date().toISOString() } = {}) {
    this.directory = safePlatformPath(directory, { mustExist: false }).absolute;
    this.executor = executor;
    this.now = now;
    this.queue = [];
    this.active = false;
    mkdirSync(this.directory, { recursive: true });
    this.jobs = new Map();
    for (const file of readdirSync(this.directory).filter((name) => name.endsWith(".json")).sort()) {
      const job = JSON.parse(readFileSync(resolve(this.directory, file), "utf8"));
      if (["queued", "running"].includes(job.status)) {
        job.status = "failed";
        job.updatedAt = this.now();
        job.exitCode = 1;
        job.log = redactLog(`${job.log}\nInterrupted by platform restart.`);
        this.save(job);
      }
      this.jobs.set(job.id, validatePlatformRecord("workflow-job", job));
    }
  }

  save(job) {
    validatePlatformRecord("workflow-job", job);
    writeFileSync(resolve(this.directory, `${job.id}.json`), `${JSON.stringify(job, null, 2)}\n`);
  }

  create(projectId, workflow) {
    const id = `JOB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const timestamp = this.now();
    const job = { schemaVersion: 1, id, projectId, workflow, status: "queued", createdAt: timestamp, updatedAt: timestamp, command: workflowCommand(projectId, workflow, id).map((part) => part.startsWith(ROOT) ? part.slice(ROOT.length + 1) : part), log: "Queued for local execution.", exitCode: null };
    this.jobs.set(id, job);
    this.save(job);
    this.queue.push({ job, command: workflowCommand(projectId, workflow, id) });
    void this.drain();
    return job;
  }

  async drain() {
    if (this.active) return;
    const entry = this.queue.shift();
    if (!entry) return;
    this.active = true;
    const { job, command } = entry;
    job.status = "running";
    job.updatedAt = this.now();
    job.log = "Started local workflow.\n";
    this.save(job);
    const result = await this.executor(command, (chunk) => {
      job.log = redactLog(job.log + chunk.toString());
      job.updatedAt = this.now();
      this.save(job);
    });
    job.log = redactLog(job.log + (result.output ?? ""));
    job.exitCode = result.exitCode;
    job.status = result.exitCode === 0 ? "passed" : "failed";
    job.updatedAt = this.now();
    this.save(job);
    this.active = false;
    void this.drain();
  }

  list() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  get(id) { return this.jobs.get(id); }
}
