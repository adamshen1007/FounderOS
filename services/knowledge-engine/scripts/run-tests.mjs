import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const engineRoot = resolve(repositoryRoot, "services", "knowledge-engine");
const vitest = resolve(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
const scenarioFile = "tests/durable-readiness-evaluation-scenarios.test.ts";

function processGroupExists(pid) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcessGroup(pid) {
  if (process.platform === "win32" || !processGroupExists(pid)) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(25);
    if (!processGroupExists(pid)) return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(25);
    if (!processGroupExists(pid)) return;
  }
  throw new Error("knowledge-engine-test-process-group-remained");
}

export async function runContainedCommand(command, arguments_, options = {}) {
  const child = spawn(command, arguments_, {
    cwd: options.cwd ?? engineRoot,
    detached: process.platform !== "win32",
    env: { ...process.env, ...options.env, CI: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => {
    stdout.push(chunk);
    if (options.forwardOutput !== false) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
    if (options.forwardOutput !== false) process.stderr.write(chunk);
  });
  const result = await new Promise((resolveResult, rejectResult) => {
    child.once("error", rejectResult);
    child.once("close", (exitCode, signal) => resolveResult({ exitCode, signal }));
  });
  if (child.pid !== undefined) await terminateProcessGroup(child.pid);
  return Object.freeze({
    ...result,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    processGroupTerminated: child.pid === undefined || !processGroupExists(child.pid),
  });
}

function stripAnsi(value) {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "gu"), "");
}

function requireInventory(result, expectedFiles, expectedTests) {
  const output = stripAnsi(`${result.stdout}\n${result.stderr}`);
  if (
    result.exitCode !== 0 ||
    result.signal !== null ||
    !result.processGroupTerminated ||
    !new RegExp(`Test Files\\s+${expectedFiles} passed \\(${expectedFiles}\\)`, "u").test(output) ||
    !new RegExp(`Tests\\s+${expectedTests} passed \\(${expectedTests}\\)`, "u").test(output) ||
    /skipped/u.test(output)
  ) {
    throw new Error("knowledge-engine-test-inventory-rejected");
  }
}

export async function runKnowledgeEngineTests() {
  const processA = await runContainedCommand(
    process.execPath,
    [vitest, "run", "--maxWorkers=1", `--exclude=${scenarioFile}`],
    { cwd: engineRoot },
  );
  requireInventory(processA, 38, 1_173);

  const processB = await runContainedCommand(
    process.execPath,
    [vitest, "run", scenarioFile, "--maxWorkers=1", "--bail=1"],
    { cwd: engineRoot },
  );
  requireInventory(processB, 1, 73);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runKnowledgeEngineTests();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "knowledge-engine-test-failed"}\n`,
    );
    process.exitCode = 1;
  }
}
