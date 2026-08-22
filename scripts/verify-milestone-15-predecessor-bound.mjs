import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const evidenceDirectory = mkdtempSync(join(tmpdir(), "founderos-m15-predecessor-evidence-"));
const evidencePath = join(evidenceDirectory, "evidence.json");
const evidenceKey = randomBytes(32).toString("hex");

function runGit(arguments_) {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error("predecessor-binding-git-failed");
  return result.stdout;
}

function candidateProof() {
  const trackedPatch = runGit(["diff", "--binary", "HEAD"]);
  const stagedPatch = runGit(["diff", "--cached", "--binary", "HEAD"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "-z"])
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

function sign(evidence) {
  return createHmac("sha256", Buffer.from(evidenceKey, "hex"))
    .update(JSON.stringify(evidence))
    .digest("hex");
}

try {
  const candidateHead = runGit(["rev-parse", "HEAD"]).trim();
  const candidateProofBefore = candidateProof();
  const verifier = spawnSync("pnpm", ["verify:m15-predecessor"], {
    cwd: repositoryRoot,
    encoding: null,
    env: { ...process.env, CI: "true" },
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const candidateProofAfter = candidateProof();
  const stdout = Buffer.isBuffer(verifier.stdout) ? verifier.stdout : Buffer.alloc(0);
  const stderr = Buffer.isBuffer(verifier.stderr) ? verifier.stderr : Buffer.alloc(0);
  const unsignedEvidence = {
    version: "founderos.m15.predecessor-evidence.v1",
    command: ["pnpm", "verify:m15-predecessor"],
    candidateHead,
    candidateProofBefore,
    candidateProofAfter,
    childProcess: {
      kind: "captured-child-process",
      exitCode: verifier.status,
      signal: verifier.signal,
      stdoutBase64: stdout.toString("base64"),
      stderrSha256: createHash("sha256").update(stderr).digest("hex"),
    },
  };
  writeFileSync(
    evidencePath,
    `${JSON.stringify({ ...unsignedEvidence, signature: sign(unsignedEvidence) })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  const postGate = spawnSync(
    "pnpm",
    [
      "--filter",
      "@founderos/knowledge-engine",
      "exec",
      "vitest",
      "run",
      "tests/durable-readiness-evaluation-scenarios.test.ts",
      "--maxWorkers=1",
      "--reporter=dot",
      "-t",
      "M15-SC-035",
    ],
    {
      cwd: repositoryRoot,
      encoding: null,
      env: {
        ...process.env,
        CI: "true",
        FOUNDEROS_M15_PREDECESSOR_EVIDENCE_KEY: evidenceKey,
        FOUNDEROS_M15_PREDECESSOR_EVIDENCE_PATH: evidencePath,
      },
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  process.stdout.write(stdout);
  if (Buffer.isBuffer(postGate.stdout)) process.stdout.write(postGate.stdout);
  process.stderr.write(stderr);
  if (Buffer.isBuffer(postGate.stderr)) process.stderr.write(postGate.stderr);
  if (verifier.error || verifier.status !== 0 || postGate.error || postGate.status !== 0) {
    process.exitCode = 1;
  }
} finally {
  rmSync(evidenceDirectory, { force: true, recursive: true });
}
