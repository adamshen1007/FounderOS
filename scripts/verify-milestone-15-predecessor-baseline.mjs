import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

export const M15_PREDECESSOR_BASELINE = Object.freeze({
  committedBaseSha: "c9227b28964b166b4f09dc94a1f4a4b70ca54451",
  originalFileCount: 42,
  originalTestCount: 1_038,
  addedM14ProvenanceTestCount: 1,
  addedM14ProvenanceTestTitle:
    "derives immutable configuration only for the exact approved evaluator instance",
  allowlistedM14ProvenancePath:
    "services/knowledge-engine/tests/production-provider-readiness-facade.test.ts",
  allowlistedM14BaseSha256: "894ba59ded6508359e2efc2c8defa45066c2e912c865f5eb31447c122bd75b1f",
  allowlistedM14CandidateSha256: "e7f7750669f7bb6895d30f63b73d80d83aef43bbd8fe84a7a66ac6df7970339e",
  allowlistedM14PatchSha256: "fd72449345d6a96bd3c766945d885afe171aab03c4745412a74c5ceb6ca89240",
});

const TEST_FILE_PATTERN = /(^|\/)tests\/.*\.test\.ts$/u;
const MAX_CHILD_OUTPUT_BYTES = 32 * 1024 * 1024;
const CHILD_TIMEOUT_MILLISECONDS = 600_000;

export class Milestone15PredecessorBaselineError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "Milestone15PredecessorBaselineError";
  }
}

function reject(reasonCode) {
  throw new Milestone15PredecessorBaselineError(reasonCode);
}

function runGit(repositoryRoot, arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) reject("predecessor-git-inspection-failed");
  return result.stdout;
}

function repositoryProof(repositoryRoot) {
  const trackedPatch = runGit(repositoryRoot, ["diff", "--binary", "HEAD"]);
  const stagedPatch = runGit(repositoryRoot, ["diff", "--cached", "--binary", "HEAD"]);
  const untracked = runGit(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256").update(trackedPatch).update("\0").update(stagedPatch);
  for (const path of untracked) {
    hash
      .update("\0")
      .update(path)
      .update("\0")
      .update(readFileSync(resolve(repositoryRoot, path)));
  }
  return hash.digest("hex");
}

export function validatePredecessorFileInventory(baseFiles, currentFiles) {
  const expected = [...baseFiles].sort();
  const actual = [...currentFiles].sort();
  if (expected.length !== M15_PREDECESSOR_BASELINE.originalFileCount) {
    reject("predecessor-base-file-count-rejected");
  }
  if (actual.length !== expected.length) reject("predecessor-file-inventory-rejected");
  if (expected.some((path, index) => path !== actual[index])) {
    reject("predecessor-file-inventory-rejected");
  }
  return Object.freeze(expected);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readBaseBytes(repositoryRoot, path) {
  const result = spawnSync(
    "git",
    ["show", `${M15_PREDECESSOR_BASELINE.committedBaseSha}:${path}`],
    { cwd: repositoryRoot, encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    reject("predecessor-git-inspection-failed");
  }
  return result.stdout;
}

function readCanonicalPatch(repositoryRoot, path) {
  const result = spawnSync(
    "git",
    [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--unified=3",
      M15_PREDECESSOR_BASELINE.committedBaseSha,
      "--",
      path,
    ],
    { cwd: repositoryRoot, encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    reject("predecessor-git-inspection-failed");
  }
  return result.stdout;
}

export function validatePredecessorSourceBytes(repositoryRoot, originalFiles) {
  for (const path of originalFiles) {
    const baseBytes = readBaseBytes(repositoryRoot, path);
    const currentBytes = readFileSync(resolve(repositoryRoot, path));
    if (path !== M15_PREDECESSOR_BASELINE.allowlistedM14ProvenancePath) {
      if (!baseBytes.equals(currentBytes)) reject("predecessor-source-bytes-rejected");
      continue;
    }
    if (
      sha256(baseBytes) !== M15_PREDECESSOR_BASELINE.allowlistedM14BaseSha256 ||
      sha256(currentBytes) !== M15_PREDECESSOR_BASELINE.allowlistedM14CandidateSha256 ||
      sha256(readCanonicalPatch(repositoryRoot, path)) !==
        M15_PREDECESSOR_BASELINE.allowlistedM14PatchSha256
    ) {
      reject("predecessor-m14-provenance-patch-rejected");
    }
  }
}

function normalizeReportFileName(name) {
  return resolve(name);
}

export function summarizePredecessorReports(expectedAbsoluteFiles, reports) {
  const expected = new Set(expectedAbsoluteFiles.map((path) => resolve(path)));
  const observedFiles = new Set();
  const assertions = [];
  for (const report of reports) {
    if (report === null || typeof report !== "object" || report.success !== true) {
      reject("predecessor-test-report-rejected");
    }
    if (!Array.isArray(report.testResults)) reject("predecessor-test-report-rejected");
    for (const result of report.testResults) {
      if (typeof result.name !== "string" || !Array.isArray(result.assertionResults)) {
        reject("predecessor-test-report-rejected");
      }
      observedFiles.add(normalizeReportFileName(result.name));
      assertions.push(...result.assertionResults);
    }
  }
  if (
    observedFiles.size !== expected.size ||
    [...expected].some((path) => !observedFiles.has(path))
  ) {
    reject("predecessor-executed-file-inventory-rejected");
  }
  if (
    assertions.some(
      (assertion) =>
        assertion === null ||
        typeof assertion !== "object" ||
        assertion.status !== "passed" ||
        typeof assertion.title !== "string",
    )
  ) {
    reject("predecessor-skipped-or-failed-test-rejected");
  }
  const addedM14ProvenanceTests = assertions.filter(
    (assertion) => assertion.title === M15_PREDECESSOR_BASELINE.addedM14ProvenanceTestTitle,
  ).length;
  if (addedM14ProvenanceTests !== M15_PREDECESSOR_BASELINE.addedM14ProvenanceTestCount) {
    reject("predecessor-m14-provenance-test-count-rejected");
  }
  const originalTests = assertions.length - addedM14ProvenanceTests;
  if (originalTests !== M15_PREDECESSOR_BASELINE.originalTestCount) {
    reject("predecessor-original-test-count-rejected");
  }
  return Object.freeze({
    executedFiles: observedFiles.size,
    executedTests: assertions.length,
    originalFiles: expected.size,
    originalTests,
    addedM14ProvenanceTests,
  });
}

function terminateChildGroup(child, signal) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The child group may already have exited.
  }
}

export function runBoundedChild(
  command,
  arguments_,
  { cwd = process.cwd(), timeout = CHILD_TIMEOUT_MILLISECONDS } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd,
      detached: process.platform !== "win32",
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      callback();
    };
    const fail = () => {
      terminateChildGroup(child, "SIGTERM");
      const forceKillHandle = setTimeout(() => terminateChildGroup(child, "SIGKILL"), 1_000);
      forceKillHandle.unref();
      finish(() =>
        rejectPromise(new Milestone15PredecessorBaselineError("predecessor-child-process-failed")),
      );
    };
    const timeoutHandle = setTimeout(fail, timeout);
    timeoutHandle.unref();
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_CHILD_OUTPUT_BYTES) {
        fail();
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", fail);
    child.once("close", (code, signal) => {
      finish(() => {
        if (code !== 0 || signal !== null) {
          rejectPromise(
            new Milestone15PredecessorBaselineError("predecessor-child-process-failed"),
          );
          return;
        }
        resolvePromise({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
  });
}

async function runVitestGroup(repositoryRoot, cwd, files) {
  const vitest = resolve(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
  const result = await runBoundedChild(
    process.execPath,
    [vitest, "run", ...files, "--maxWorkers=4", "--reporter=json"],
    { cwd },
  );
  try {
    const report = JSON.parse(result.stdout);
    return {
      ...report,
      testResults: Array.isArray(report.testResults)
        ? report.testResults.map((testResult) => ({
            ...testResult,
            name:
              typeof testResult.name === "string" ? resolve(cwd, testResult.name) : testResult.name,
          }))
        : report.testResults,
    };
  } catch {
    reject("predecessor-test-report-rejected");
  }
}

export async function verifyMilestone15PredecessorBaseline(repositoryRoot = process.cwd()) {
  const beforeProof = repositoryProof(repositoryRoot);
  const baseFiles = runGit(repositoryRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    M15_PREDECESSOR_BASELINE.committedBaseSha,
  ])
    .split("\n")
    .filter((path) => TEST_FILE_PATTERN.test(path))
    .sort();
  const currentTrackedFiles = runGit(repositoryRoot, ["ls-files"])
    .split("\n")
    .filter((path) => TEST_FILE_PATTERN.test(path));
  const currentOriginalFiles = currentTrackedFiles.filter((path) => baseFiles.includes(path));
  const originalFiles = validatePredecessorFileInventory(baseFiles, currentOriginalFiles);
  validatePredecessorSourceBytes(repositoryRoot, originalFiles);

  const groups = [
    {
      cwd: resolve(repositoryRoot, "packages", "knowledge-schema"),
      prefix: "packages/knowledge-schema/",
    },
    {
      cwd: resolve(repositoryRoot, "services", "knowledge-engine"),
      prefix: "services/knowledge-engine/",
    },
    { cwd: repositoryRoot, prefix: "tests/", preservePrefix: true },
  ];
  const reports = [];
  for (const group of groups) {
    const files = originalFiles
      .filter((path) => path.startsWith(group.prefix))
      .map((path) => (group.preservePrefix ? path : path.slice(group.prefix.length)));
    reports.push(await runVitestGroup(repositoryRoot, group.cwd, files));
  }
  const summary = summarizePredecessorReports(
    originalFiles.map((path) => resolve(repositoryRoot, path)),
    reports,
  );
  if (repositoryProof(repositoryRoot) !== beforeProof) reject("predecessor-repository-mutated");
  return summary;
}

function cliReason(error) {
  return error instanceof Milestone15PredecessorBaselineError
    ? error.message
    : "predecessor-internal-failure";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const summary = await verifyMilestone15PredecessorBaseline();
    process.stdout.write("predecessor-baseline-valid\n");
    process.stdout.write(`original-files=${summary.originalFiles}\n`);
    process.stdout.write(`original-tests=${summary.originalTests}\n`);
    process.stdout.write(`m14-provenance-tests=${summary.addedM14ProvenanceTests}\n`);
    process.stdout.write(`executed-files=${summary.executedFiles}\n`);
    process.stdout.write(`executed-tests=${summary.executedTests}\n`);
  } catch (error) {
    process.stderr.write(`${cliReason(error)}\n`);
    process.exitCode = 1;
  }
}
