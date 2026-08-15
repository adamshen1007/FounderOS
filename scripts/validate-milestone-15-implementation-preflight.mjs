import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const M15_PREFLIGHT_CONTRACT = Object.freeze({
  contractVersion: "1.0",
  milestone: "15",
  authorizedDocumentationMergeSha: "c9227b28964b166b4f09dc94a1f4a4b70ca54451",
  runtimePredecessorSha: "a93faa29eecc37f2a08c79cda4c3075ffacfea3e",
  requiredImplementationBranch: "codex/milestone-15",
  specificationMergeSha: "60a719439a9b2b325a75ef4c03a30574422629c4",
});

const AUTHORIZATION_KEYS = Object.freeze([
  "authorizedDocumentationMergeSha",
  "contractVersion",
  "milestone",
  "requiredImplementationBranch",
  "runtimePredecessorSha",
]);
const SHA_1_PATTERN = /^[0-9a-f]{40}$/u;
const PROHIBITED_SPECIFICATION_BRANCH = "codex/milestone-15-specification";
const RUNTIME_PATH_PREFIXES = Object.freeze([
  "packages/knowledge-schema/src/durable-readiness-ledger.ts",
  "packages/knowledge-schema/tests/durable-readiness-ledger.test.ts",
  "services/knowledge-engine/src/application/durable-readiness-ledger-port.ts",
  "services/knowledge-engine/src/application/manage-governed-readiness-evaluation-ledger.ts",
  "services/knowledge-engine/src/domain/durable-readiness-ledger.ts",
  "services/knowledge-engine/src/infrastructure/local-file-readiness-ledger.ts",
  "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts",
  "services/knowledge-engine/tests/durable-readiness-ledger.test.ts",
  "services/knowledge-engine/tests/fixtures/durable-readiness-evaluations.ts",
  "services/knowledge-engine/tests/local-file-readiness-ledger.test.ts",
  "services/knowledge-engine/tests/milestone-15-documentation-traceability.test.ts",
  "services/knowledge-engine/tests/support/genesis-clean-process.test.ts",
  "services/knowledge-engine/tests/support/milestone-15-traceability.ts",
]);

export class Milestone15PreflightError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "Milestone15PreflightError";
  }
}

function reject(reasonCode) {
  throw new Milestone15PreflightError(reasonCode);
}

function isExactPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      descriptor.enumerable === true && "value" in descriptor && !("get" in descriptor),
  );
}

function assertExactSha(value, malformedReason, wrongReason, expected) {
  if (typeof value !== "string" || !SHA_1_PATTERN.test(value)) reject(malformedReason);
  if (value !== expected) reject(wrongReason);
}

export function validateMilestone15ImplementationAuthorization(candidate) {
  if (!isExactPlainRecord(candidate)) reject("preflight-authorization-shape-rejected");
  const candidateKeys = Object.keys(candidate).sort();
  const missing = AUTHORIZATION_KEYS.some((key) => !candidateKeys.includes(key));
  if (missing) reject("preflight-authorization-field-missing");
  const unknown = candidateKeys.some((key) => !AUTHORIZATION_KEYS.includes(key));
  if (unknown || candidateKeys.length !== AUTHORIZATION_KEYS.length) {
    reject("preflight-authorization-field-unknown");
  }
  if (candidate.contractVersion !== M15_PREFLIGHT_CONTRACT.contractVersion) {
    reject("preflight-contract-version-rejected");
  }
  if (candidate.milestone !== M15_PREFLIGHT_CONTRACT.milestone) {
    reject("preflight-milestone-rejected");
  }
  assertExactSha(
    candidate.authorizedDocumentationMergeSha,
    "preflight-documentation-merge-sha-malformed",
    "preflight-documentation-merge-sha-rejected",
    M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha,
  );
  assertExactSha(
    candidate.runtimePredecessorSha,
    "preflight-runtime-predecessor-sha-malformed",
    "preflight-runtime-predecessor-sha-rejected",
    M15_PREFLIGHT_CONTRACT.runtimePredecessorSha,
  );
  if (
    candidate.requiredImplementationBranch !== M15_PREFLIGHT_CONTRACT.requiredImplementationBranch
  ) {
    reject("preflight-required-branch-rejected");
  }
  return Object.freeze({ ...candidate });
}

function runGit(repositoryRoot, arguments_, acceptedStatuses = [0]) {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status === null || !acceptedStatuses.includes(result.status)) {
    reject("preflight-git-inspection-failed");
  }
  return Object.freeze({ status: result.status, stdout: result.stdout });
}

function splitNullTerminated(output) {
  return output.split("\0").filter(Boolean).sort();
}

function isRuntimePath(path) {
  return RUNTIME_PATH_PREFIXES.some(
    (runtimePath) => path === runtimePath || path.startsWith(`${runtimePath}/`),
  );
}

export function inspectMilestone15Repository(repositoryRoot = process.cwd()) {
  const branch = runGit(repositoryRoot, ["branch", "--show-current"]).stdout.trim();
  const head = runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const main = runGit(repositoryRoot, ["rev-parse", "refs/heads/main"]).stdout.trim();
  const originMain = runGit(repositoryRoot, [
    "rev-parse",
    "refs/remotes/origin/main",
  ]).stdout.trim();
  const mergeBase = runGit(repositoryRoot, ["merge-base", "HEAD", "refs/heads/main"]).stdout.trim();
  const aheadBehind = runGit(repositoryRoot, [
    "rev-list",
    "--left-right",
    "--count",
    "refs/remotes/origin/main...HEAD",
  ])
    .stdout.trim()
    .split(/\s+/u)
    .map(Number);
  if (aheadBehind.length !== 2 || aheadBehind.some((value) => !Number.isSafeInteger(value))) {
    reject("preflight-git-inspection-failed");
  }
  const remoteBranch = runGit(
    repositoryRoot,
    ["show-ref", "--verify", "--quiet", "refs/remotes/origin/codex/milestone-15"],
    [0, 1],
  );
  const runtimeAncestor = runGit(
    repositoryRoot,
    ["merge-base", "--is-ancestor", M15_PREFLIGHT_CONTRACT.runtimePredecessorSha, head],
    [0, 1],
  );
  const specificationAncestor = runGit(
    repositoryRoot,
    ["merge-base", "--is-ancestor", M15_PREFLIGHT_CONTRACT.specificationMergeSha, head],
    [0, 1],
  );
  const stagedPaths = splitNullTerminated(
    runGit(repositoryRoot, ["diff", "--cached", "--name-only", "-z"]).stdout,
  );
  const unstagedTrackedPaths = splitNullTerminated(
    runGit(repositoryRoot, ["diff", "--name-only", "-z"]).stdout,
  );
  const untrackedPaths = splitNullTerminated(
    runGit(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]).stdout,
  );
  const committedRuntimePaths = splitNullTerminated(
    runGit(repositoryRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      "-z",
      "HEAD",
      "--",
      ...RUNTIME_PATH_PREFIXES,
    ]).stdout,
  );

  return Object.freeze({
    branch,
    head,
    main,
    originMain,
    mergeBase,
    ahead: aheadBehind[1],
    behind: aheadBehind[0],
    stagingPaths: Object.freeze(stagedPaths),
    unstagedTrackedPaths: Object.freeze(unstagedTrackedPaths),
    untrackedPaths: Object.freeze(untrackedPaths),
    committedRuntimePaths: Object.freeze(committedRuntimePaths),
    remoteImplementationBranchPresent: remoteBranch.status === 0,
    runtimePredecessorIsAncestor: runtimeAncestor.status === 0,
    specificationMergeIsAncestor: specificationAncestor.status === 0,
  });
}

export function validateMilestone15RepositoryObservation(observation) {
  if (observation.branch === "main") reject("preflight-current-branch-main-rejected");
  if (observation.branch === PROHIBITED_SPECIFICATION_BRANCH) {
    reject("preflight-current-branch-specification-rejected");
  }
  if (observation.branch !== M15_PREFLIGHT_CONTRACT.requiredImplementationBranch) {
    reject("preflight-current-branch-rejected");
  }
  if (observation.stagingPaths.length !== 0) {
    reject(
      observation.stagingPaths.some(isRuntimePath)
        ? "preflight-staged-runtime-work-rejected"
        : "preflight-staging-rejected",
    );
  }
  if (observation.unstagedTrackedPaths.length !== 0) {
    reject(
      observation.unstagedTrackedPaths.some(isRuntimePath)
        ? "preflight-unstaged-runtime-work-rejected"
        : "preflight-unstaged-tracked-changes-rejected",
    );
  }
  if (observation.untrackedPaths.length !== 0) {
    reject(
      observation.untrackedPaths.some(isRuntimePath)
        ? "preflight-untracked-runtime-work-rejected"
        : "preflight-untracked-work-rejected",
    );
  }
  if (observation.committedRuntimePaths.length !== 0) {
    reject("preflight-existing-runtime-work-rejected");
  }
  if (observation.remoteImplementationBranchPresent) {
    reject("preflight-remote-implementation-branch-rejected");
  }
  if (
    observation.head === M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha &&
    observation.originMain !== M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha
  ) {
    reject("preflight-origin-main-rejected");
  }
  if (observation.ahead !== 0) reject("preflight-ahead-rejected");
  if (observation.behind !== 0) reject("preflight-behind-rejected");
  if (observation.mergeBase !== M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha) {
    reject("preflight-merge-base-rejected");
  }
  if (observation.head !== M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha) {
    reject("preflight-head-rejected");
  }
  if (observation.main !== M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha) {
    reject("preflight-main-rejected");
  }
  if (observation.originMain !== M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha) {
    reject("preflight-origin-main-rejected");
  }
  if (!observation.runtimePredecessorIsAncestor) {
    reject("preflight-runtime-predecessor-ancestor-rejected");
  }
  if (!observation.specificationMergeIsAncestor) {
    reject("preflight-specification-merge-ancestor-rejected");
  }
  return Object.freeze({ ...observation });
}

export function validateMilestone15ImplementationPreflight(candidate, repositoryRoot) {
  validateMilestone15ImplementationAuthorization(candidate);
  return validateMilestone15RepositoryObservation(
    inspectMilestone15Repository(repositoryRoot ?? process.cwd()),
  );
}

function cliReason(error) {
  return error instanceof Milestone15PreflightError ? error.message : "preflight-internal-failure";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let candidate;
    try {
      candidate = JSON.parse(process.argv[2] ?? "");
    } catch {
      reject("preflight-authorization-json-rejected");
    }
    validateMilestone15ImplementationPreflight(candidate);
    process.stdout.write("preflight-valid\n");
  } catch (error) {
    process.stderr.write(`${cliReason(error)}\n`);
    process.exitCode = 1;
  }
}
