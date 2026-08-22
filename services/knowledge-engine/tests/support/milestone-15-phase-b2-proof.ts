import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { M15_DURABLE_READINESS_EVALUATION_SCENARIOS } from "../fixtures/durable-readiness-evaluations.js";
import {
  Milestone15TraceabilityError,
  validateMilestone15Traceability,
} from "./milestone-15-traceability.js";

const EXPECTED_DOCUMENTS = Object.freeze([
  "FounderOS_Durable_Readiness_Evaluation_Ledger_Contract_v1.0.md",
  "FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md",
  "FounderOS_Local_File_Readiness_Ledger_Adapter_Specification_v1.0.md",
  "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md",
  "FounderOS_Milestone_15_Architecture_Specification_v1.0.md",
  "FounderOS_Milestone_15_Codex_Implementation_Prompt_v1.0.md",
  "FounderOS_Milestone_15_Durable_Production_Provider_Readiness_Evaluation_Ledger_and_Replay_Verification_Registry_Foundation_Specification_v1.0.md",
  "FounderOS_Milestone_15_Package_README_v1.0.md",
  "FounderOS_Milestone_15_Verification_Checklist_v1.0.md",
  "FounderOS_Readiness_Evaluation_Registration_and_Idempotency_Contract_v1.0.md",
  "FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md",
  "FounderOS_Readiness_Ledger_Integrity_and_Recovery_Specification_v1.0.md",
  "FounderOS_Readiness_Replay_Verification_Registry_Contract_v1.0.md",
] as const);

const AUTHORITATIVE_DOCUMENT_DIGESTS = Object.freeze({
  "FounderOS_Durable_Readiness_Evaluation_Ledger_Contract_v1.0.md":
    "bf6ed520333be4499fbdf157684c86350084f38e073e07c368e3dab66aec95ef",
  "FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md":
    "5dee9f5927c7c1559dc8914c49782652711b64b593b2ebf1b0912c4c9a9f9623",
  "FounderOS_Local_File_Readiness_Ledger_Adapter_Specification_v1.0.md":
    "3c7fee1f04897eae10541bae860ab0bde9b1f9944f86229aa398a6ed04f3d916",
  "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md":
    "40c67d967e8bb1af0d89e83fe42ef445cbc3fc631d507f1bfdf6194ba0d977c6",
  "FounderOS_Milestone_15_Architecture_Specification_v1.0.md":
    "22ad0875b08909c54f994204b98243eb75f9c008a8b1f11205b0fcca1930b80b",
  "FounderOS_Milestone_15_Codex_Implementation_Prompt_v1.0.md":
    "fa1848154ffea1aad4ffd348be08453a7acb18e791d9b7ce362d17c0003f9026",
  "FounderOS_Milestone_15_Durable_Production_Provider_Readiness_Evaluation_Ledger_and_Replay_Verification_Registry_Foundation_Specification_v1.0.md":
    "cfd3897d66bb439aa79c811da42c8d19316d3c15d04a1988b39a6df7fa6b31f3",
  "FounderOS_Milestone_15_Package_README_v1.0.md":
    "72183c662816729fa29df6c622b1da97410affdf7a0c62baa2dbaa0b646e147b",
  "FounderOS_Milestone_15_Verification_Checklist_v1.0.md":
    "f032b70366effe79c0b48cadb9c5837c360489c4e9ed1954414a956e36687730",
  "FounderOS_Readiness_Evaluation_Registration_and_Idempotency_Contract_v1.0.md":
    "d495ab1c93e42b30960a4306218b4ba757647a7d6f1a284e0473985ec4a81e73",
  "FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md":
    "da722c8452d3951662101fa133167bc9bda6bdb8a78a6954be328df996c71135",
  "FounderOS_Readiness_Ledger_Integrity_and_Recovery_Specification_v1.0.md":
    "46cc8b7f8128d6135df65cb8cc213b758971b415618de7f1b2a9069a58d4f1d9",
  "FounderOS_Readiness_Replay_Verification_Registry_Contract_v1.0.md":
    "e0aaef6aea456dc92068a2d514800b19220251af5606e1a574d1d09c954e1a84",
} satisfies Readonly<Record<(typeof EXPECTED_DOCUMENTS)[number], string>>);

const EXPECTED_PREDECESSOR_LINES = Object.freeze([
  "predecessor-baseline-valid",
  "original-files=42",
  "original-tests=1038",
  "m14-provenance-tests=1",
  "executed-files=42",
  "executed-tests=1039",
] as const);

const VERIFICATION_COMMANDS = Object.freeze([
  "pnpm format:check",
  "pnpm lint",
  "pnpm build",
  "pnpm typecheck",
  "pnpm test",
  "pnpm verify:m15-predecessor-bound",
] as const);
const IMPLEMENTATION_PROMPT = "FounderOS_Milestone_15_Codex_Implementation_Prompt_v1.0.md";
const VERIFICATION_CHECKLIST = "FounderOS_Milestone_15_Verification_Checklist_v1.0.md";
const REQUIRED_COMMAND_BLOCK = Object.freeze([...VERIFICATION_COMMANDS, "git diff --check"]);
const PROHIBITED_PUBLICATION_ACTIONS =
  "commit, push, create or merge a pull request, tag, release, deploy, begin credential work, enable transport, or begin Milestone 16";

export class M15PhaseB2ProofError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "M15PhaseB2ProofError";
  }
}

function fail(code: string): never {
  throw new M15PhaseB2ProofError(code);
}

function parsePredecessorOutput(stdout: string): readonly string[] {
  const observed = stdout
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (observed.join("\0") !== EXPECTED_PREDECESSOR_LINES.join("\0")) {
    fail("phase-b2-predecessor-summary-rejected");
  }
  return Object.freeze(observed);
}

interface PredecessorEvidenceArtifact {
  readonly version: "founderos.m15.predecessor-evidence.v1";
  readonly command: readonly ["pnpm", "verify:m15-predecessor"];
  readonly candidateHead: string;
  readonly candidateProofBefore: string;
  readonly candidateProofAfter: string;
  readonly childProcess: {
    readonly kind: "captured-child-process";
    readonly exitCode: number | null;
    readonly signal: string | null;
    readonly stdoutBase64: string;
    readonly stderrSha256: string;
  };
  readonly signature: string;
}

function gitProof(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) fail("phase-b2-predecessor-evidence-git-rejected");
  return result.stdout;
}

function candidateEvidenceProof(repositoryRoot: string): string {
  const trackedPatch = gitProof(repositoryRoot, ["diff", "--binary", "HEAD"]);
  const stagedPatch = gitProof(repositoryRoot, ["diff", "--cached", "--binary", "HEAD"]);
  const untracked = gitProof(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256").update(trackedPatch).update("\0").update(stagedPatch);
  for (const path of untracked) {
    hash
      .update("\0")
      .update(path)
      .update("\0")
      .update(readFileSync(join(repositoryRoot, path)));
  }
  return hash.digest("hex");
}

function unsignedPredecessorEvidence(artifact: PredecessorEvidenceArtifact): unknown {
  return {
    version: artifact.version,
    command: artifact.command,
    candidateHead: artifact.candidateHead,
    candidateProofBefore: artifact.candidateProofBefore,
    candidateProofAfter: artifact.candidateProofAfter,
    childProcess: artifact.childProcess,
  };
}

function signPredecessorEvidence(artifact: PredecessorEvidenceArtifact, keyHex: string): string {
  return createHmac("sha256", Buffer.from(keyHex, "hex"))
    .update(JSON.stringify(unsignedPredecessorEvidence(artifact)))
    .digest("hex");
}

function resignPredecessorEvidence(
  artifact: PredecessorEvidenceArtifact,
  keyHex: string,
): PredecessorEvidenceArtifact {
  return { ...artifact, signature: signPredecessorEvidence(artifact, keyHex) };
}

export function validateM15PredecessorEvidence(
  repositoryRoot: string,
  candidate: unknown,
  keyHex: string,
): { readonly lines: readonly string[]; readonly stdoutSha256: string } {
  if (candidate === null || typeof candidate !== "object") {
    fail("phase-b2-predecessor-evidence-missing");
  }
  const artifact = candidate as PredecessorEvidenceArtifact;
  if (
    artifact.version !== "founderos.m15.predecessor-evidence.v1" ||
    !Array.isArray(artifact.command) ||
    artifact.command.join("\0") !== "pnpm\0verify:m15-predecessor" ||
    typeof artifact.candidateHead !== "string" ||
    typeof artifact.candidateProofBefore !== "string" ||
    typeof artifact.candidateProofAfter !== "string" ||
    artifact.childProcess === null ||
    typeof artifact.childProcess !== "object" ||
    artifact.childProcess.kind !== "captured-child-process" ||
    typeof artifact.childProcess.stdoutBase64 !== "string" ||
    typeof artifact.childProcess.stderrSha256 !== "string" ||
    typeof artifact.signature !== "string" ||
    !/^[a-f0-9]{64}$/u.test(keyHex)
  ) {
    fail("phase-b2-predecessor-evidence-shape-rejected");
  }
  const expectedSignature = signPredecessorEvidence(artifact, keyHex);
  if (
    !/^[a-f0-9]{64}$/u.test(artifact.signature) ||
    !timingSafeEqual(Buffer.from(artifact.signature, "hex"), Buffer.from(expectedSignature, "hex"))
  ) {
    fail("phase-b2-predecessor-evidence-signature-rejected");
  }
  if (artifact.childProcess.exitCode !== 0 || artifact.childProcess.signal !== null) {
    fail("phase-b2-predecessor-evidence-exit-rejected");
  }
  const currentHead = gitProof(repositoryRoot, ["rev-parse", "HEAD"]).trim();
  const currentProof = candidateEvidenceProof(repositoryRoot);
  if (
    artifact.candidateHead !== currentHead ||
    artifact.candidateProofBefore !== currentProof ||
    artifact.candidateProofAfter !== currentProof
  ) {
    fail("phase-b2-predecessor-evidence-candidate-rejected");
  }
  const stdout = Buffer.from(artifact.childProcess.stdoutBase64, "base64").toString("utf8");
  return Object.freeze({
    lines: parsePredecessorOutput(stdout),
    stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
  });
}

export async function proveM15PredecessorGateContract(repositoryRoot: string): Promise<{
  readonly command: string;
  readonly gateMode: "standalone-after-ordinary-tests";
  readonly evidenceMode: "ordinary-contract" | "post-verifier-attestation";
  readonly actualStandaloneEvidenceConsumed: boolean;
  readonly lines: readonly string[];
  readonly mutationErrorCodes: readonly string[];
  readonly stdoutSha256: string | null;
  readonly nestedPredecessorInvocationCount: 0;
  readonly ordinaryTestCommand: string;
  readonly verificationChecklistRequiresSequentialGate: true;
}> {
  const verifier = (await import(
    pathToFileURL(join(repositoryRoot, "scripts", "verify-milestone-15-predecessor-baseline.mjs"))
      .href
  )) as {
    readonly M15_PREDECESSOR_BASELINE: {
      readonly originalFileCount: number;
      readonly originalTestCount: number;
      readonly addedM14ProvenanceTestCount: number;
    };
  };
  const rootPackage = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    readonly scripts?: Readonly<Record<string, string>>;
  };
  const ordinaryTestCommand = rootPackage.scripts?.test;
  const predecessorCommand = rootPackage.scripts?.["verify:m15-predecessor"];
  if (
    ordinaryTestCommand === undefined ||
    ordinaryTestCommand.includes("verify:m15-predecessor") ||
    predecessorCommand !== "node scripts/verify-milestone-15-predecessor-baseline.mjs"
  ) {
    fail("phase-b2-predecessor-gate-contract-rejected");
  }
  const verificationChecklist = await readFile(
    join(
      repositoryRoot,
      "docs/milestones/milestone-15/FounderOS_Milestone_15_Verification_Checklist_v1.0.md",
    ),
    "utf8",
  );
  const verificationChecklistRequiresSequentialGate =
    verificationChecklist.includes(
      "Run `pnpm verify:m15-predecessor-bound` only after the ordinary `pnpm test` command has completed.",
    ) &&
    verificationChecklist.includes(
      "Neither predecessor command may be invoked from a Vitest hook or concurrently with the normal test gate.",
    );
  if (!verificationChecklistRequiresSequentialGate) {
    fail("phase-b2-predecessor-gate-order-rejected");
  }
  void verifier.M15_PREDECESSOR_BASELINE;
  const evidencePath = process.env.FOUNDEROS_M15_PREDECESSOR_EVIDENCE_PATH;
  const evidenceKey = process.env.FOUNDEROS_M15_PREDECESSOR_EVIDENCE_KEY;
  if (evidencePath === undefined && evidenceKey === undefined) {
    return Object.freeze({
      command: "pnpm verify:m15-predecessor",
      gateMode: "standalone-after-ordinary-tests",
      evidenceMode: "ordinary-contract",
      actualStandaloneEvidenceConsumed: false,
      lines: Object.freeze([]),
      mutationErrorCodes: Object.freeze([]),
      stdoutSha256: null,
      nestedPredecessorInvocationCount: 0,
      ordinaryTestCommand,
      verificationChecklistRequiresSequentialGate: true,
    });
  }
  if (evidencePath === undefined || evidenceKey === undefined) {
    fail("phase-b2-predecessor-evidence-binding-rejected");
  }
  const artifact = JSON.parse(await readFile(evidencePath, "utf8")) as PredecessorEvidenceArtifact;
  const verified = validateM15PredecessorEvidence(repositoryRoot, artifact, evidenceKey);
  const mutations: readonly unknown[] = [
    undefined,
    resignPredecessorEvidence(
      { ...artifact, childProcess: { ...artifact.childProcess, exitCode: 1 } },
      evidenceKey,
    ),
    resignPredecessorEvidence(
      {
        ...artifact,
        childProcess: {
          ...artifact.childProcess,
          stdoutBase64: Buffer.from(
            Buffer.from(artifact.childProcess.stdoutBase64, "base64")
              .toString("utf8")
              .replace("executed-tests=1039", "executed-tests=1038"),
          ).toString("base64"),
        },
      },
      evidenceKey,
    ),
    resignPredecessorEvidence(
      { ...artifact, candidateProofBefore: "0".repeat(64), candidateProofAfter: "0".repeat(64) },
      evidenceKey,
    ),
    {
      version: artifact.version,
      command: artifact.command,
      summary: EXPECTED_PREDECESSOR_LINES,
      signature: artifact.signature,
    },
  ];
  const mutationErrorCodes = mutations.map((mutation) => {
    try {
      validateM15PredecessorEvidence(repositoryRoot, mutation, evidenceKey);
      return "mutation-did-not-fail";
    } catch (error) {
      return error instanceof M15PhaseB2ProofError
        ? error.code
        : "phase-b2-predecessor-mutation-error";
    }
  });
  return Object.freeze({
    command: "pnpm verify:m15-predecessor",
    gateMode: "standalone-after-ordinary-tests",
    evidenceMode: "post-verifier-attestation",
    actualStandaloneEvidenceConsumed: true,
    lines: verified.lines,
    mutationErrorCodes: Object.freeze(mutationErrorCodes),
    stdoutSha256: verified.stdoutSha256,
    nestedPredecessorInvocationCount: 0,
    ordinaryTestCommand,
    verificationChecklistRequiresSequentialGate: true,
  });
}

function git(cwd: string, arguments_: readonly string[], env?: NodeJS.ProcessEnv): string {
  const result = spawnSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) fail("phase-b2-git-fixture-failed");
  return result.stdout.trim();
}

interface ChildProcessResult {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function runChildProcess(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<ChildProcessResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, [...arguments_], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", () => {
      resolveResult({ status: null, stdout, stderr });
    });
    child.once("close", (status) => {
      resolveResult({ status, stdout, stderr });
    });
  });
}

async function gitAsync(cwd: string, arguments_: readonly string[]): Promise<string> {
  const result = await runChildProcess("git", arguments_, cwd);
  if (result.status !== 0) fail("phase-b2-git-fixture-failed");
  return result.stdout;
}

async function repositoryIdentity(cwd: string): Promise<string> {
  const [status, refs, head, trackedPatch] = await Promise.all([
    gitAsync(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    gitAsync(cwd, ["show-ref"]),
    gitAsync(cwd, ["rev-parse", "HEAD"]),
    gitAsync(cwd, ["diff", "--binary", "HEAD"]),
  ]);
  const untracked = status
    .split("\0")
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3))
    .sort();
  const hash = createHash("sha256").update([status, refs, head, trackedPatch].join("\0"));
  const untrackedContents = await Promise.all(
    untracked.map(async (path) => ({ bytes: await readFile(join(cwd, path)), path })),
  );
  for (const { bytes, path } of untrackedContents) {
    hash.update("\0").update(path).update("\0").update(bytes);
  }
  return hash.digest("hex");
}

interface GitMutation {
  readonly name: string;
  readonly expectedReason: string;
  readonly apply: (repository: string, contract: Readonly<Record<string, string>>) => void;
}

interface AuthorizationMutation {
  readonly name: string;
  readonly expectedReason: string;
  readonly serialize: (candidate: Readonly<Record<string, unknown>>) => string;
}

const AUTHORIZATION_MUTATIONS: readonly AuthorizationMutation[] = Object.freeze([
  {
    name: "authorization-json-malformed",
    expectedReason: "preflight-authorization-json-rejected",
    serialize: () => "{",
  },
  {
    name: "authorization-shape",
    expectedReason: "preflight-authorization-shape-rejected",
    serialize: () => "null",
  },
  {
    name: "authorization-field-missing",
    expectedReason: "preflight-authorization-field-missing",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify(
        Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "milestone")),
      ),
  },
  {
    name: "authorization-field-unknown",
    expectedReason: "preflight-authorization-field-unknown",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, unknownField: "rejected" }),
  },
  {
    name: "authorization-contract-version",
    expectedReason: "preflight-contract-version-rejected",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, contractVersion: "2.0" }),
  },
  {
    name: "authorization-milestone",
    expectedReason: "preflight-milestone-rejected",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, milestone: "16" }),
  },
  {
    name: "authorization-documentation-merge-malformed",
    expectedReason: "preflight-documentation-merge-sha-malformed",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, authorizedDocumentationMergeSha: "not-a-sha" }),
  },
  {
    name: "authorization-documentation-merge-wrong",
    expectedReason: "preflight-documentation-merge-sha-rejected",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, authorizedDocumentationMergeSha: "0".repeat(40) }),
  },
  {
    name: "authorization-runtime-predecessor-malformed",
    expectedReason: "preflight-runtime-predecessor-sha-malformed",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, runtimePredecessorSha: "not-a-sha" }),
  },
  {
    name: "authorization-runtime-predecessor-wrong",
    expectedReason: "preflight-runtime-predecessor-sha-rejected",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, runtimePredecessorSha: "f".repeat(40) }),
  },
  {
    name: "authorization-required-branch",
    expectedReason: "preflight-required-branch-rejected",
    serialize: (candidate: Readonly<Record<string, unknown>>) =>
      JSON.stringify({ ...candidate, requiredImplementationBranch: "main" }),
  },
]);

const GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: "FounderOS Phase B2",
  GIT_AUTHOR_EMAIL: "phase-b2@invalid.local",
  GIT_COMMITTER_NAME: "FounderOS Phase B2",
  GIT_COMMITTER_EMAIL: "phase-b2@invalid.local",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
});

function writeFixture(repository: string, relativePath: string, contents: string): void {
  const script = `const fs=require("node:fs");const p=${JSON.stringify(join(repository, relativePath))};fs.mkdirSync(require("node:path").dirname(p),{recursive:true});fs.writeFileSync(p,${JSON.stringify(contents)});`;
  const result = spawnSync(process.execPath, ["-e", script], { stdio: "ignore" });
  if (result.status !== 0) fail("phase-b2-git-fixture-failed");
}

function commitEmpty(repository: string): void {
  git(repository, ["commit", "--allow-empty", "-m", "phase-b2-fixture"], GIT_IDENTITY);
}

function createCommitObject(repository: string, parent?: string): string {
  const tree = git(repository, ["rev-parse", "HEAD^{tree}"]);
  return git(
    repository,
    parent === undefined ? ["commit-tree", tree] : ["commit-tree", tree, "-p", parent],
    GIT_IDENTITY,
  );
}

function commitRuntimePath(repository: string): void {
  const path = "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts";
  writeFixture(repository, path, "committed-runtime\n");
  git(repository, ["add", path]);
  git(repository, ["commit", "-m", "phase-b2-runtime-fixture"], GIT_IDENTITY);
}

const GIT_MUTATIONS: readonly GitMutation[] = Object.freeze([
  {
    name: "main-branch",
    expectedReason: "preflight-current-branch-main-rejected",
    apply: (r) => void git(r, ["switch", "main"]),
  },
  {
    name: "specification-branch",
    expectedReason: "preflight-current-branch-specification-rejected",
    apply: (r) => void git(r, ["branch", "-m", "codex/milestone-15-specification"]),
  },
  {
    name: "wrong-branch",
    expectedReason: "preflight-current-branch-rejected",
    apply: (r) => void git(r, ["branch", "-m", "codex/wrong"]),
  },
  {
    name: "ahead",
    expectedReason: "preflight-ahead-rejected",
    apply: (r) => commitEmpty(r),
  },
  {
    name: "behind",
    expectedReason: "preflight-behind-rejected",
    apply: (r, c) => void git(r, ["reset", "--hard", c.runtimePredecessorSha!]),
  },
  {
    name: "wrong-head",
    expectedReason: "preflight-head-rejected",
    apply: (r) => {
      commitEmpty(r);
      git(r, ["update-ref", "refs/remotes/origin/main", git(r, ["rev-parse", "HEAD"])]);
    },
  },
  {
    name: "wrong-main",
    expectedReason: "preflight-main-rejected",
    apply: (r, c) =>
      void git(r, [
        "branch",
        "-f",
        "main",
        createCommitObject(r, c.authorizedDocumentationMergeSha!),
      ]),
  },
  {
    name: "wrong-origin-main",
    expectedReason: "preflight-origin-main-rejected",
    apply: (r, c) =>
      void git(r, [
        "update-ref",
        "refs/remotes/origin/main",
        createCommitObject(r, c.authorizedDocumentationMergeSha!),
      ]),
  },
  {
    name: "wrong-merge-base",
    expectedReason: "preflight-merge-base-rejected",
    apply: (r, c) => {
      const head = createCommitObject(r, c.runtimePredecessorSha!);
      const main = createCommitObject(r, c.runtimePredecessorSha!);
      git(r, ["reset", "--hard", head]);
      git(r, ["branch", "-f", "main", main]);
      git(r, ["update-ref", "refs/remotes/origin/main", head]);
    },
  },
  {
    name: "remote-implementation-ref",
    expectedReason: "preflight-remote-implementation-branch-rejected",
    apply: (r, c) =>
      void git(r, [
        "update-ref",
        "refs/remotes/origin/codex/milestone-15",
        c.authorizedDocumentationMergeSha!,
      ]),
  },
  {
    name: "staged-nonruntime",
    expectedReason: "preflight-staging-rejected",
    apply: (r) => {
      writeFixture(r, "phase-b2.txt", "staged\n");
      git(r, ["add", "phase-b2.txt"]);
    },
  },
  {
    name: "staged-runtime",
    expectedReason: "preflight-staged-runtime-work-rejected",
    apply: (r) => {
      const p = "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts";
      writeFixture(r, p, "runtime\n");
      git(r, ["add", p]);
    },
  },
  {
    name: "unstaged-tracked",
    expectedReason: "preflight-unstaged-tracked-changes-rejected",
    apply: (r) => writeFixture(r, "README.md", "changed\n"),
  },
  {
    name: "unstaged-runtime",
    expectedReason: "preflight-unstaged-runtime-work-rejected",
    apply: (r) => {
      commitRuntimePath(r);
      writeFixture(
        r,
        "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts",
        "unstaged-runtime\n",
      );
    },
  },
  {
    name: "untracked-nonruntime",
    expectedReason: "preflight-untracked-work-rejected",
    apply: (r) => writeFixture(r, "phase-b2.txt", "untracked\n"),
  },
  {
    name: "untracked-runtime",
    expectedReason: "preflight-untracked-runtime-work-rejected",
    apply: (r) =>
      writeFixture(
        r,
        "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts",
        "runtime\n",
      ),
  },
  {
    name: "committed-runtime",
    expectedReason: "preflight-existing-runtime-work-rejected",
    apply: (r) => commitRuntimePath(r),
  },
  {
    name: "runtime-ancestry-missing",
    expectedReason: "preflight-runtime-predecessor-ancestor-rejected",
    apply: (r, c) => {
      const tree = git(r, ["rev-parse", "HEAD^{tree}"]);
      const replacement = git(r, ["commit-tree", tree], GIT_IDENTITY);
      git(r, ["replace", c.authorizedDocumentationMergeSha!, replacement]);
    },
  },
  {
    name: "specification-ancestry-missing",
    expectedReason: "preflight-specification-merge-ancestor-rejected",
    apply: (r, c) => {
      const tree = git(r, ["rev-parse", "HEAD^{tree}"]);
      const replacement = git(
        r,
        ["commit-tree", tree, "-p", c.runtimePredecessorSha!],
        GIT_IDENTITY,
      );
      git(r, ["replace", c.authorizedDocumentationMergeSha!, replacement]);
    },
  },
]);

export async function proveM15RealGitPreflight(repositoryRoot: string): Promise<{
  readonly positiveStatus: number;
  readonly invalidCaseCount: number;
  readonly exactReasons: readonly string[];
  readonly mutationFreeCount: number;
  readonly localBareRemoteCount: number;
}> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "founderos-m15-phase-b2-git-"));
  try {
    const preflightPath = join(
      repositoryRoot,
      "scripts",
      "validate-milestone-15-implementation-preflight.mjs",
    );
    const preflight = (await import(pathToFileURL(preflightPath).href)) as {
      M15_PREFLIGHT_CONTRACT: Readonly<Record<string, string>>;
    };
    const contract = preflight.M15_PREFLIGHT_CONTRACT;
    const candidate = Object.fromEntries(
      [
        "contractVersion",
        "milestone",
        "authorizedDocumentationMergeSha",
        "runtimePredecessorSha",
        "requiredImplementationBranch",
      ].map((key) => [key, contract[key]]),
    );
    const remote = join(fixtureRoot, "origin.git");
    git(fixtureRoot, ["init", "--bare", "--initial-branch=main", remote]);
    git(repositoryRoot, [
      "push",
      "--quiet",
      remote,
      `${contract.authorizedDocumentationMergeSha!}:refs/heads/main`,
    ]);
    const createRepository = (name: string): string => {
      const path = join(fixtureRoot, name);
      git(fixtureRoot, ["clone", remote, path]);
      git(path, ["switch", "-c", contract.requiredImplementationBranch!]);
      return path;
    };
    const run = (repository: string, serializedCandidate = JSON.stringify(candidate)) =>
      runChildProcess(process.execPath, [preflightPath, serializedCandidate], repository);
    const positiveRepository = createRepository("positive");
    const positiveBefore = await repositoryIdentity(positiveRepository);
    const positive = await run(positiveRepository);
    if (
      positive.status !== 0 ||
      positive.stdout !== "preflight-valid\n" ||
      positive.stderr !== ""
    ) {
      fail("phase-b2-preflight-positive-rejected");
    }
    if ((await repositoryIdentity(positiveRepository)) !== positiveBefore)
      fail("phase-b2-preflight-mutated-repository");
    const exactReasons: string[] = [];
    let mutationFreeCount = 1;
    const authorizationMutationRepositories = AUTHORIZATION_MUTATIONS.map((mutation, index) => ({
      mutation,
      repository: createRepository(`authorization-${String(index).padStart(2, "0")}`),
    }));
    const preparedAuthorizationMutations = await Promise.all(
      authorizationMutationRepositories.map(async (prepared) => ({
        ...prepared,
        before: await repositoryIdentity(prepared.repository),
      })),
    );
    // Each authorization mutation owns an isolated clone; parallel CLI execution
    // preserves an independently fingerprinted worktree, index, and ref state per case.
    const completedAuthorizationMutations = await Promise.all(
      preparedAuthorizationMutations.map(async (prepared) => ({
        ...prepared,
        result: await run(prepared.repository, prepared.mutation.serialize(candidate)),
      })),
    );
    const verifiedAuthorizationMutations = await Promise.all(
      completedAuthorizationMutations.map(async (completed) => ({
        ...completed,
        after: await repositoryIdentity(completed.repository),
      })),
    );
    for (const { after, before, mutation, repository, result } of verifiedAuthorizationMutations) {
      if (
        result.status === 0 ||
        result.stdout !== "" ||
        result.stderr !== `${mutation.expectedReason}\n`
      ) {
        fail(`phase-b2-preflight-case-rejected:${mutation.name}`);
      }
      if (result.stderr.includes(repository) || after !== before) {
        fail(`phase-b2-preflight-case-mutated-or-leaked:${mutation.name}`);
      }
      exactReasons.push(`${mutation.name}:${mutation.expectedReason}`);
      mutationFreeCount += 1;
    }
    const gitMutationRepositories = GIT_MUTATIONS.map((mutation, index) => {
      const repository = createRepository(`negative-${String(index).padStart(2, "0")}`);
      mutation.apply(repository, contract);
      return { mutation, repository };
    });
    const preparedGitMutations = await Promise.all(
      gitMutationRepositories.map(async (prepared) => ({
        ...prepared,
        before: await repositoryIdentity(prepared.repository),
      })),
    );
    // Each Git mutation owns an isolated clone; parallel CLI inspection cannot share
    // worktree, index, or ref state across cases.
    const completedGitMutations = await Promise.all(
      preparedGitMutations.map(async (prepared) => ({
        ...prepared,
        result: await run(prepared.repository),
      })),
    );
    const verifiedGitMutations = await Promise.all(
      completedGitMutations.map(async (completed) => ({
        ...completed,
        after: await repositoryIdentity(completed.repository),
      })),
    );
    for (const { after, before, mutation, repository, result } of verifiedGitMutations) {
      if (
        result.status === 0 ||
        result.stdout !== "" ||
        result.stderr !== `${mutation.expectedReason}\n`
      ) {
        fail(`phase-b2-preflight-case-rejected:${mutation.name}`);
      }
      if (result.stderr.includes(repository) || after !== before) {
        fail(`phase-b2-preflight-case-mutated-or-leaked:${mutation.name}`);
      }
      exactReasons.push(`${mutation.name}:${mutation.expectedReason}`);
      mutationFreeCount += 1;
    }
    return Object.freeze({
      positiveStatus: positive.status,
      invalidCaseCount: AUTHORIZATION_MUTATIONS.length + GIT_MUTATIONS.length,
      exactReasons: Object.freeze(exactReasons),
      mutationFreeCount,
      localBareRemoteCount: 1,
    });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

interface DocumentationSnapshot {
  readonly files: readonly string[];
  readonly documents: ReadonlyMap<string, string>;
  readonly architectureDecisions: string;
  readonly documentationIndex: string;
}

async function documentationSnapshot(repositoryRoot: string): Promise<DocumentationSnapshot> {
  const milestoneRoot = join(repositoryRoot, "docs", "milestones", "milestone-15");
  const files = (await readdir(milestoneRoot)).filter((file) => file.endsWith(".md")).sort();
  return {
    files,
    documents: new Map(
      await Promise.all(
        files.map(
          async (file) => [file, await readFile(join(milestoneRoot, file), "utf8")] as const,
        ),
      ),
    ),
    architectureDecisions: await readFile(
      join(repositoryRoot, "ARCHITECTURE_DECISIONS.md"),
      "utf8",
    ),
    documentationIndex: await readFile(join(repositoryRoot, "DOCUMENTATION_INDEX.md"), "utf8"),
  };
}

type DocumentDigestInventory = Readonly<Record<(typeof EXPECTED_DOCUMENTS)[number], string>>;

function documentDigest(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function validateDocumentDigestContract(
  snapshot: DocumentationSnapshot,
  expectedDigests: DocumentDigestInventory,
): void {
  if (!exactSet(Object.keys(expectedDigests).sort(), EXPECTED_DOCUMENTS)) {
    fail("phase-b2-document-fingerprint-inventory-rejected");
  }
  for (const file of EXPECTED_DOCUMENTS) {
    const source = snapshot.documents.get(file);
    if (source === undefined || documentDigest(source) !== expectedDigests[file]) {
      fail("phase-b2-document-fingerprint-rejected");
    }
  }
}

function structuralFixtureDigestOverride(
  snapshot: DocumentationSnapshot,
  mutatedFile: (typeof EXPECTED_DOCUMENTS)[number],
): DocumentDigestInventory {
  const source = snapshot.documents.get(mutatedFile);
  if (source === undefined) fail("phase-b2-structural-fixture-invalid");
  return Object.freeze({
    ...AUTHORITATIVE_DOCUMENT_DIGESTS,
    [mutatedFile]: documentDigest(source),
  });
}

function exactSet(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

function markdownSection(source: string, heading: string): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const starts = lines
    .map((line, index) => (line === `## ${heading}` ? index : -1))
    .filter((index) => index >= 0);
  if (starts.length !== 1) fail("phase-b2-document-section-rejected");
  const start = starts[0]!;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

function parseVerificationCommandInventory(checklist: string): readonly string[] {
  const section = markdownSection(checklist, "Required Commands");
  const fences = [...section.matchAll(/^```bash\n([\s\S]*?)\n```$/gmu)];
  if (fences.length !== 1) fail("phase-b2-verification-command-malformed");
  const commands = fences[0]![1]!.split("\n").filter((line) => line !== "");
  if (!exactSet(commands, REQUIRED_COMMAND_BLOCK)) {
    fail("phase-b2-verification-command-inventory-rejected");
  }
  return Object.freeze(commands.filter((command) => command.startsWith("pnpm ")));
}

function exactMatches(source: string, pattern: RegExp, code: string): readonly RegExpMatchArray[] {
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) fail(code);
  return matches;
}

const NEGATED_PUBLICATION_STATE =
  /(?:\b(?:no|not|never|neither|nor|without|unless|pending|prohibited|forbidden|unauthorized|unapproved|incomplete|uncommitted|unpushed|unmerged|unpublished|unreleased|undeployed)\b|n['’]t\b)/iu;
const ACTION_NOUN = "(?:publication|commit|push|pull request|pr|merge|release|deployment|deploy)";
const ACTION_STATE = "(?:committed|pushed|merged|published|released|deployed)";
const AUTHORITY_STATE =
  "(?:authorized|approved|complete|completed|performed|published|released|deployed|merged|committed|pushed)";
const STATUS_AUXILIARY =
  "(?:(?:is|are|was|were)|(?:has|have|had) been|will be|(?:is|are|was|were) being)";
const STATUS_ADVERB = "(?:(?:now|already|successfully|fully) )*";
const PUBLICATION_SUBJECT =
  "(?:candidate|implementation|service|package|build|branch|code|changes?|work|artifacts?|pull request|pr)";

const ACTION_NOUN_STATUS = new RegExp(
  `^(?:the )?${ACTION_NOUN}(?: (?:status|state))? (?:(?:${STATUS_AUXILIARY}) )?${STATUS_ADVERB}${AUTHORITY_STATE}$`,
  "iu",
);
const SUBJECT_PASSIVE_STATUS = new RegExp(
  `^(?:the )?${PUBLICATION_SUBJECT} (?:${STATUS_AUXILIARY}) ${STATUS_ADVERB}${ACTION_STATE}$`,
  "iu",
);
const SUBJECT_BARE_STATUS = new RegExp(
  `^(?:the )?${PUBLICATION_SUBJECT} ${STATUS_ADVERB}${ACTION_STATE}$`,
  "iu",
);
const SUBJECT_AUTHORITY_FOR_ACTION = new RegExp(
  `^(?:the )?${PUBLICATION_SUBJECT} (?:${STATUS_AUXILIARY}) ${STATUS_ADVERB}(?:authorized|approved) for (?:the )?${ACTION_NOUN}$`,
  "iu",
);
const ACTIVE_ACTION_STATUS = new RegExp(
  `^(?:we|the (?:team|maintainer|operator)) (?:(?:has|have|had) )?${STATUS_ADVERB}${ACTION_STATE}(?: (?:the )?${PUBLICATION_SUBJECT})?$`,
  "iu",
);

function normalizedAuthorityClauses(source: string): readonly string[] {
  return source
    .split(/\r?\n/u)
    .flatMap((line) => line.split(/[.!?;]+/u))
    .map((clause) =>
      clause
        .replace(/^\s*(?:(?:[-*+>]+|\d+[.)])\s*)+/u, "")
        .replace(/[*_`~]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase(),
    )
    .filter((clause) => clause.length > 0);
}

function hasAffirmativePublicationState(source: string): boolean {
  return normalizedAuthorityClauses(source).some((clause) => {
    if (NEGATED_PUBLICATION_STATE.test(clause)) return false;
    return (
      ACTION_NOUN_STATUS.test(clause) ||
      SUBJECT_PASSIVE_STATUS.test(clause) ||
      SUBJECT_BARE_STATUS.test(clause) ||
      SUBJECT_AUTHORITY_FOR_ACTION.test(clause) ||
      ACTIVE_ACTION_STATUS.test(clause)
    );
  });
}

function validateEvidenceCoordinates(
  snapshot: DocumentationSnapshot,
  preflightContract: Readonly<Record<string, string>>,
): void {
  const prompt = snapshot.documents.get(IMPLEMENTATION_PROMPT)!;
  const checklist = snapshot.documents.get(VERIFICATION_CHECKLIST)!;
  const runtimeShas = [
    ...exactMatches(
      prompt,
      /^MILESTONE_14_RUNTIME_BASE_SHA = ([0-9a-f]{40})$/gmu,
      "phase-b2-runtime-predecessor-evidence-rejected",
    ).map((match) => match[1]!),
    ...exactMatches(
      checklist,
      /`MILESTONE_14_RUNTIME_BASE_SHA` is exactly `([0-9a-f]{40})`/gu,
      "phase-b2-runtime-predecessor-evidence-rejected",
    ).map((match) => match[1]!),
  ];
  if (
    runtimeShas.length !== 2 ||
    runtimeShas.some((sha) => sha !== preflightContract.runtimePredecessorSha)
  ) {
    fail("phase-b2-runtime-predecessor-evidence-rejected");
  }
  const predecessorCounts = exactMatches(
    checklist,
    /(?:at least |preserves at least )(\d+) (?:test )?files and ([\d,]+)(?: passing)? tests/gu,
    "phase-b2-verification-count-rejected",
  );
  if (
    predecessorCounts.length !== 2 ||
    predecessorCounts.some(
      (match) => Number(match[1]) !== 42 || Number(match[2]!.replaceAll(",", "")) !== 1_038,
    )
  ) {
    fail("phase-b2-verification-count-rejected");
  }
  const scenarioRange = exactMatches(
    checklist,
    /All scenarios `M15-SC-(\d{3})` through `M15-SC-(\d{3})` execute/gu,
    "phase-b2-scenario-count-rejected",
  );
  const registryCount = exactMatches(
    checklist,
    /runtime scenario registry contains (\d+) title-specific callable helpers/gu,
    "phase-b2-scenario-count-rejected",
  );
  if (
    scenarioRange.length !== 1 ||
    scenarioRange[0]![1] !== "001" ||
    scenarioRange[0]![2] !== "072" ||
    registryCount.length !== 1 ||
    Number(registryCount[0]![1]) !== 72
  ) {
    fail("phase-b2-scenario-count-rejected");
  }
  const branchMentions = exactMatches(
    prompt,
    /^codex\/milestone-15$/gmu,
    "phase-b2-required-branch-evidence-rejected",
  );
  if (
    branchMentions.length !== 1 ||
    branchMentions[0]![0] !== preflightContract.requiredImplementationBranch
  ) {
    fail("phase-b2-required-branch-evidence-rejected");
  }
  const stop = markdownSection(prompt, "Stop Condition");
  const stopMatches = [
    ...stop.matchAll(/(?:^|[.!?]\s+)Do not (.+?) unless separately authorized\./gmu),
  ];
  if (
    stopMatches.length !== 1 ||
    stopMatches[0]![1] !== PROHIBITED_PUBLICATION_ACTIONS ||
    !prompt.includes("Stop before publication unless separately authorized.")
  ) {
    fail("phase-b2-publication-authority-rejected");
  }
  const allSource = [
    ...snapshot.documents.values(),
    snapshot.documentationIndex,
    snapshot.architectureDecisions,
  ].join("\n");
  if (hasAffirmativePublicationState(allSource)) {
    fail("phase-b2-publication-authority-rejected");
  }
}

async function validateDocumentationSnapshotAgainstDigestContract(
  repositoryRoot: string,
  snapshot: DocumentationSnapshot,
  expectedDigests: DocumentDigestInventory,
) {
  if (!exactSet(snapshot.files, EXPECTED_DOCUMENTS)) fail("phase-b2-document-inventory-rejected");
  validateDocumentDigestContract(snapshot, expectedDigests);
  const acceptanceFile = "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md";
  const acceptanceSource = snapshot.documents.get(acceptanceFile);
  if (acceptanceSource === undefined) fail("phase-b2-document-inventory-rejected");
  const executable = new Map<string, Set<string>>();
  for (const mapping of M15_DURABLE_READINESS_EVALUATION_SCENARIOS) {
    const cases = executable.get(mapping.executableTestFile) ?? new Set<string>();
    cases.add(mapping.executableTestName);
    executable.set(mapping.executableTestFile, cases);
  }
  let traceability;
  try {
    traceability = validateMilestone15Traceability({
      acceptanceSource,
      documents: snapshot.documents,
      scenarioMappings: M15_DURABLE_READINESS_EVALUATION_SCENARIOS,
      executableTestCases: executable,
    });
  } catch (error) {
    const code = error instanceof Milestone15TraceabilityError ? error.code : "unknown";
    fail(`phase-b2-traceability-rejected:${code}`);
  }
  for (const [file, source] of snapshot.documents) {
    if (!file.endsWith("_v1.0.md") || !source.split("\n")[0]?.endsWith(" v1.0")) {
      fail("phase-b2-document-version-rejected");
    }
    if (
      !source.startsWith(
        `${source.split("\n")[0]}\n\n## Status\n\n**Specified — not implemented**\n`,
      )
    ) {
      fail("phase-b2-document-status-rejected");
    }
    for (const match of source.matchAll(
      /\[[^\]]*\]\((?!https?:|#|mailto:)([^)#]+)(?:#[^)]*)?\)/gu,
    )) {
      const target = match[1]!;
      const absolute = resolve(
        dirname(join(repositoryRoot, "docs", "milestones", "milestone-15", file)),
        decodeURIComponent(target),
      );
      const result = spawnSync(
        process.execPath,
        ["-e", `require("node:fs").accessSync(${JSON.stringify(absolute)})`],
        { stdio: "ignore" },
      );
      if (result.status !== 0) fail("phase-b2-relative-link-rejected");
    }
  }
  const adrSection = snapshot.architectureDecisions.slice(
    snapshot.architectureDecisions.indexOf("## ADR-0019"),
  );
  if (!/^## ADR-0019:[^\n]+\n\n- \*\*Status:\*\* Accepted$/mu.test(adrSection))
    fail("phase-b2-adr-status-rejected");
  if (
    !snapshot.documentationIndex.includes("**Implemented and merged.**") ||
    !snapshot.documentationIndex.includes(
      "credential resolution, provider transport, real-provider integration, and live-execution authority are not authorized",
    )
  ) {
    fail("phase-b2-candidate-status-rejected");
  }
  const indexed = [
    ...snapshot.documentationIndex.matchAll(
      /\]\(\.\/docs\/milestones\/milestone-15\/([^)#]+\.md)\)/gu,
    ),
  ]
    .map((match) => match[1]!)
    .sort();
  if (!exactSet(indexed, EXPECTED_DOCUMENTS)) fail("phase-b2-documentation-index-rejected");
  const checklist = snapshot.documents.get(VERIFICATION_CHECKLIST)!;
  const verificationCommands = parseVerificationCommandInventory(checklist);
  const preflight = (await import(
    pathToFileURL(
      join(repositoryRoot, "scripts", "validate-milestone-15-implementation-preflight.mjs"),
    ).href
  )) as { M15_PREFLIGHT_CONTRACT: Readonly<Record<string, string>> };
  validateEvidenceCoordinates(snapshot, preflight.M15_PREFLIGHT_CONTRACT);
  return { traceability, indexed, verificationCommands };
}

async function validateDocumentationSnapshot(
  repositoryRoot: string,
  snapshot: DocumentationSnapshot,
) {
  return validateDocumentationSnapshotAgainstDigestContract(
    repositoryRoot,
    snapshot,
    AUTHORITATIVE_DOCUMENT_DIGESTS,
  );
}

function mutateDocument(
  snapshot: DocumentationSnapshot,
  file: string,
  mutate: (source: string) => string,
): DocumentationSnapshot {
  const documents = new Map(snapshot.documents);
  documents.set(file, mutate(documents.get(file)!));
  return { ...snapshot, documents };
}

export async function proveM15StructuredDocumentation(repositoryRoot: string): Promise<{
  readonly documents: number;
  readonly requirements: number;
  readonly acceptanceCriteria: number;
  readonly scenarios: number;
  readonly indexedDocuments: number;
  readonly verificationCommands: number;
  readonly negativeAuthorityControls: number;
  readonly mutationFailures: readonly string[];
}> {
  const snapshot = await documentationSnapshot(repositoryRoot);
  const valid = await validateDocumentationSnapshot(repositoryRoot, snapshot);
  const acceptance = "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md";
  const checklist = "FounderOS_Milestone_15_Verification_Checklist_v1.0.md";
  const first = EXPECTED_DOCUMENTS[0];
  const mutations: readonly [string, DocumentationSnapshot][] = [
    ["inventory", { ...snapshot, files: snapshot.files.slice(1) }],
    [
      "relative-link",
      mutateDocument(snapshot, first, (source) => `${source}\n[missing](./missing.md)\n`),
    ],
    [
      "adr",
      {
        ...snapshot,
        architectureDecisions: snapshot.architectureDecisions.replace(
          "## ADR-0019: Persist verified provider-readiness evaluations without enabling provider execution\n\n- **Status:** Accepted",
          "## ADR-0019: Persist verified provider-readiness evaluations without enabling provider execution\n\n- **Status:** Proposed",
        ),
      },
    ],
    [
      "candidate-status",
      {
        ...snapshot,
        documentationIndex: snapshot.documentationIndex.replace(
          "**Implemented and merged.**",
          "**Published.**",
        ),
      },
    ],
    ["version", mutateDocument(snapshot, first, (source) => source.replace(" v1.0\n", " v2.0\n"))],
    [
      "index",
      {
        ...snapshot,
        documentationIndex: snapshot.documentationIndex.replace(
          new RegExp(`^.*${first.replaceAll(".", "\\.")}.*\\n`, "mu"),
          "",
        ),
      },
    ],
    [
      "command-missing",
      mutateDocument(snapshot, checklist, (source) => source.replace("pnpm lint\n", "")),
    ],
    [
      "command-extra",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace("git diff --check\n", "pnpm bogus\ngit diff --check\n"),
      ),
    ],
    [
      "command-duplicate",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace("pnpm lint\n", "pnpm lint\npnpm lint\n"),
      ),
    ],
    [
      "command-malformed",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace("pnpm lint\n", "pnpm  lint\n"),
      ),
    ],
    [
      "requirements",
      mutateDocument(snapshot, acceptance, (source) =>
        source.replace(/^\| `M15-ARCH-001` \|[^\n]+\n/mu, ""),
      ),
    ],
    [
      "acceptance",
      mutateDocument(snapshot, acceptance, (source) =>
        source.replace(/^- \[ \] `M15-AC-ARCH-001`:[^\n]+\n/mu, ""),
      ),
    ],
    [
      "scenarios",
      mutateDocument(snapshot, acceptance, (source) =>
        source.replace("`M15-SC-072` |", "`M15-SC-073` |"),
      ),
    ],
    [
      "predecessor-counts-stale",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace("42 test files and 1,038 tests", "40 test files and 1,036 tests"),
      ),
    ],
    [
      "scenario-count-stale",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace("`M15-SC-001` through `M15-SC-072`", "`M15-SC-001` through `M15-SC-070`"),
      ),
    ],
    [
      "predecessor-fingerprint-stale",
      mutateDocument(snapshot, checklist, (source) =>
        source.replace(
          "a93faa29eecc37f2a08c79cda4c3075ffacfea3e",
          "ffffffffffffffffffffffffffffffffffffffff",
        ),
      ),
    ],
    [
      "document-status-stale",
      mutateDocument(snapshot, first, (source) =>
        source.replace("**Specified — not implemented**", "**Draft — not implemented**"),
      ),
    ],
    [
      "publication-authorized",
      mutateDocument(snapshot, checklist, (source) => `${source}\nPublication is authorized.\n`),
    ],
    [
      "release-authorized",
      mutateDocument(snapshot, checklist, (source) => `${source}\nRelease is authorized.\n`),
    ],
    [
      "deployment-complete",
      mutateDocument(snapshot, checklist, (source) => `${source}\nDeployment complete.\n`),
    ],
    [
      "push-complete",
      mutateDocument(snapshot, checklist, (source) => `${source}\nPush completed.\n`),
    ],
    ["pr-merged", mutateDocument(snapshot, checklist, (source) => `${source}\nPR merged.\n`)],
    [
      "candidate-committed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe candidate has been committed.\n`,
      ),
    ],
    [
      "candidate-pushed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe candidate has been pushed.\n`,
      ),
    ],
    [
      "pull-request-merged",
      mutateDocument(snapshot, checklist, (source) => `${source}\nThe pull request was merged.\n`),
    ],
    [
      "candidate-published",
      mutateDocument(snapshot, checklist, (source) => `${source}\nThe candidate was published.\n`),
    ],
    [
      "implementation-released",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe implementation has been released.\n`,
      ),
    ],
    [
      "service-deployed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe service has been deployed.\n`,
      ),
    ],
    [
      "noun-status-colon-commit",
      mutateDocument(snapshot, checklist, (source) => `${source}\nCommit status: complete.\n`),
    ],
    [
      "noun-status-dash-push",
      mutateDocument(snapshot, checklist, (source) => `${source}\nPush — completed.\n`),
    ],
    [
      "noun-status-colon-pr-merge",
      mutateDocument(snapshot, checklist, (source) => `${source}\nPR merge: complete.\n`),
    ],
    [
      "noun-status-colon-publication",
      mutateDocument(snapshot, checklist, (source) => `${source}\nPublication status: approved.\n`),
    ],
    [
      "noun-status-dash-release",
      mutateDocument(snapshot, checklist, (source) => `${source}\nRelease status — complete.\n`),
    ],
    [
      "noun-status-colon-deployment",
      mutateDocument(snapshot, checklist, (source) => `${source}\nDeployment: complete.\n`),
    ],
    [
      "perfect-adverb-candidate-committed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe candidate has already been committed.\n`,
      ),
    ],
    [
      "perfect-adverb-branch-pushed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe branch has successfully been pushed.\n`,
      ),
    ],
    [
      "got-passive-pr-merged",
      mutateDocument(snapshot, checklist, (source) => `${source}\nThe pull request got merged.\n`),
    ],
    [
      "perfect-adverb-build-published",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe build has now been published.\n`,
      ),
    ],
    [
      "milestone-subject-released",
      mutateDocument(snapshot, checklist, (source) => `${source}\nMilestone 15 was released.\n`),
    ],
    [
      "app-subject-deployed",
      mutateDocument(snapshot, checklist, (source) => `${source}\nThe app was deployed.\n`),
    ],
    [
      "authority-to-candidate-commit",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe candidate has approval to commit.\n`,
      ),
    ],
    [
      "authority-to-branch-push",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe branch is approved to push.\n`,
      ),
    ],
    [
      "authority-to-pr-merge",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe pull request has authorization to merge.\n`,
      ),
    ],
    [
      "authority-to-build-publish",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe build is approved to publish.\n`,
      ),
    ],
    [
      "authority-for-package-release",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe package has authorization for release.\n`,
      ),
    ],
    [
      "authority-to-service-deploy",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nThe service is approved to deploy.\n`,
      ),
    ],
    [
      "active-i-committed",
      mutateDocument(snapshot, checklist, (source) => `${source}\nI committed the code.\n`),
    ],
    [
      "active-maintainers-pushed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nMaintainers pushed the branch.\n`,
      ),
    ],
    [
      "active-release-engineering-published",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nRelease engineering published the build.\n`,
      ),
    ],
    [
      "active-operators-released",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nOperators released the package.\n`,
      ),
    ],
    [
      "active-maintainer-deployed",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nA maintainer deployed the service.\n`,
      ),
    ],
    [
      "ordinary-content-mutation",
      mutateDocument(
        snapshot,
        checklist,
        (source) => `${source}\nEditorial note: this content is not part of the frozen contract.\n`,
      ),
    ],
  ];
  const structuralDigestOverrideFiles = new Map<string, (typeof EXPECTED_DOCUMENTS)[number]>([
    ["relative-link", first],
    ["version", first],
    ["command-missing", checklist],
    ["command-extra", checklist],
    ["command-duplicate", checklist],
    ["command-malformed", checklist],
    ["requirements", acceptance],
    ["acceptance", acceptance],
    ["scenarios", acceptance],
    ["predecessor-counts-stale", checklist],
    ["scenario-count-stale", checklist],
    ["predecessor-fingerprint-stale", checklist],
    ["document-status-stale", first],
  ]);
  const negativeAuthorityControls = [
    "The candidate has not been committed.",
    "The candidate has not been pushed.",
    "The pull request was not merged.",
    "The candidate remains unpublished.",
    "The implementation release is unauthorized.",
    "The service deployment was not performed.",
  ];
  for (const control of negativeAuthorityControls) {
    const controlled = mutateDocument(snapshot, checklist, (source) => `${source}\n${control}\n`);
    await validateDocumentationSnapshotAgainstDigestContract(
      repositoryRoot,
      controlled,
      structuralFixtureDigestOverride(controlled, checklist),
    );
  }
  const mutationFailures: string[] = [];
  for (const [name, mutated] of mutations) {
    try {
      const overrideFile = structuralDigestOverrideFiles.get(name);
      if (overrideFile === undefined) {
        await validateDocumentationSnapshot(repositoryRoot, mutated);
      } else {
        await validateDocumentationSnapshotAgainstDigestContract(
          repositoryRoot,
          mutated,
          structuralFixtureDigestOverride(mutated, overrideFile),
        );
      }
      fail(`phase-b2-document-mutation-survived:${name}`);
    } catch (error) {
      if (
        error instanceof M15PhaseB2ProofError &&
        error.code.startsWith("phase-b2-document-mutation-survived:")
      )
        throw error;
      mutationFailures.push(`${name}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return Object.freeze({
    documents: snapshot.files.length,
    requirements: valid.traceability.requirements.length,
    acceptanceCriteria: valid.traceability.acceptanceCriteria.length,
    scenarios: valid.traceability.scenarios.length,
    indexedDocuments: valid.indexed.length,
    verificationCommands: valid.verificationCommands.length,
    negativeAuthorityControls: negativeAuthorityControls.length,
    mutationFailures: Object.freeze(mutationFailures),
  });
}
