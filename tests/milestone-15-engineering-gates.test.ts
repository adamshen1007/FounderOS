import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

interface PreflightModule {
  readonly validateMilestone15ImplementationAuthorization: (candidate: unknown) => unknown;
  readonly validateMilestone15RepositoryObservation: (observation: unknown) => unknown;
}

interface PredecessorModule {
  readonly M15_PREDECESSOR_BASELINE: {
    readonly addedM14ProvenanceTestTitle: string;
    readonly allowlistedM14ProvenancePath: string;
  };
  readonly runBoundedChild: (
    command: string,
    arguments_: readonly string[],
    options?: { readonly cwd?: string; readonly timeout?: number },
  ) => Promise<unknown>;
  readonly summarizePredecessorReports: (
    expectedFiles: readonly string[],
    reports: readonly unknown[],
  ) => unknown;
  readonly validatePredecessorFileInventory: (
    baseFiles: readonly string[],
    currentFiles: readonly string[],
  ) => unknown;
  readonly validatePredecessorSourceBytes: (
    repositoryRoot: string,
    originalFiles: readonly string[],
  ) => void;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const preflightScript = resolve(
  repositoryRoot,
  "scripts",
  "validate-milestone-15-implementation-preflight.mjs",
);
const preflightTestHelper = resolve(
  repositoryRoot,
  "tests",
  "support",
  "run-milestone-15-preflight-validation.mjs",
);
const predecessorScript = resolve(
  repositoryRoot,
  "scripts",
  "verify-milestone-15-predecessor-baseline.mjs",
);
const preflight = (await import(pathToFileURL(preflightScript).href)) as PreflightModule;
const predecessor = (await import(pathToFileURL(predecessorScript).href)) as PredecessorModule;

const authorizedDocumentationMergeSha = "c9227b28964b166b4f09dc94a1f4a4b70ca54451";
const runtimePredecessorSha = "a93faa29eecc37f2a08c79cda4c3075ffacfea3e";
const exactAuthorization = {
  contractVersion: "1.0",
  milestone: "15",
  authorizedDocumentationMergeSha,
  runtimePredecessorSha,
  requiredImplementationBranch: "codex/milestone-15",
};
const exactObservation = {
  branch: "codex/milestone-15",
  head: authorizedDocumentationMergeSha,
  main: authorizedDocumentationMergeSha,
  originMain: authorizedDocumentationMergeSha,
  mergeBase: authorizedDocumentationMergeSha,
  ahead: 0,
  behind: 0,
  stagingPaths: [],
  unstagedTrackedPaths: [],
  untrackedPaths: [],
  committedRuntimePaths: [],
  remoteImplementationBranchPresent: false,
  runtimePredecessorIsAncestor: true,
  specificationMergeIsAncestor: true,
};

function git(arguments_: readonly string[], cwd = repositoryRoot): string {
  return execFileSync("git", [...arguments_], { cwd, encoding: "utf8" });
}

function repositoryMutationProof(cwd = repositoryRoot): string {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd);
  const refs = git(["show-ref"], cwd);
  const trackedPatch = git(["diff", "--binary", "HEAD"], cwd);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"], cwd)
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256").update(status).update(refs).update(trackedPatch);
  for (const path of untracked) hash.update(path).update(readFileSync(resolve(cwd, path)));
  return hash.digest("hex");
}

function expectRejectedWithoutMutation(
  mode: "authorization" | "observation",
  input: unknown,
  reason: string,
): void {
  withIsolatedRepository((fixtureRoot) => {
    const before = repositoryMutationProof(fixtureRoot);
    const result = spawnSync(process.execPath, [preflightTestHelper, mode, JSON.stringify(input)], {
      cwd: fixtureRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${reason}\n`);
    expect(result.stderr).not.toMatch(/[\\/]/u);
    expect(repositoryMutationProof(fixtureRoot)).toBe(before);
  });
}

function createIsolatedRepository(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "founderos-m15-git-state-"));
  execFileSync("git", [
    "clone",
    "--shared",
    "--quiet",
    "--no-checkout",
    repositoryRoot,
    fixtureRoot,
  ]);
  git(
    ["checkout", "--quiet", "-B", "codex/milestone-15", authorizedDocumentationMergeSha],
    fixtureRoot,
  );
  git(["update-ref", "refs/heads/main", authorizedDocumentationMergeSha], fixtureRoot);
  git(["update-ref", "refs/remotes/origin/main", authorizedDocumentationMergeSha], fixtureRoot);
  git(["update-ref", "-d", "refs/remotes/origin/codex/milestone-15"], fixtureRoot);
  git(["config", "user.email", "m15-test@founderos.invalid"], fixtureRoot);
  git(["config", "user.name", "FounderOS M15 Test"], fixtureRoot);
  return fixtureRoot;
}

function runPreflightInRepository(
  cwd: string,
  reason?: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const before = repositoryMutationProof(cwd);
  const result = spawnSync(
    process.execPath,
    [preflightScript, JSON.stringify(exactAuthorization)],
    {
      cwd,
      env: environment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (reason === undefined) {
    expect(result).toMatchObject({ status: 0, stdout: "preflight-valid\n", stderr: "" });
  } else {
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${reason}\n`);
    expect(result.stderr).not.toMatch(/[\\/]/u);
  }
  expect(repositoryMutationProof(cwd)).toBe(before);
}

function withGitInspectionInterception(
  mode: string,
  run: (environment: NodeJS.ProcessEnv) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), "founderos-m15-git-command-seam-"));
  const executable = join(directory, "git");
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(
    executable,
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const mode = process.env.M15_GIT_INTERCEPT;
const exact = (...expected) => args.length === expected.length && args.every((value, index) => value === expected[index]);
if (mode === "merge-base" && exact("merge-base", "HEAD", "refs/heads/main")) process.stdout.write("${"0".repeat(40)}\\n");
else if (mode === "ahead" && exact("rev-list", "--left-right", "--count", "refs/remotes/origin/main...HEAD")) process.stdout.write("0 1\\n");
else if (mode === "behind" && exact("rev-list", "--left-right", "--count", "refs/remotes/origin/main...HEAD")) process.stdout.write("1 0\\n");
else if (mode === "runtime-ancestor" && args[0] === "merge-base" && args[1] === "--is-ancestor" && args[2] === "${runtimePredecessorSha}") process.exit(1);
else if (mode === "specification-ancestor" && args[0] === "merge-base" && args[1] === "--is-ancestor" && args[2] === "60a719439a9b2b325a75ef4c03a30574422629c4") process.exit(1);
else { const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" }); process.exit(result.status ?? 2); }
`,
    "utf8",
  );
  chmodSync(executable, 0o755);
  try {
    run({
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      M15_GIT_INTERCEPT: mode,
    });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function withIsolatedRepository(run: (fixtureRoot: string) => void): void {
  const fixtureRoot = createIsolatedRepository();
  try {
    run(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

describe("Milestone 15 strict implementation preflight", () => {
  it("accepts only the exact authorization and observed clean repository coordinates", () => {
    expect(preflight.validateMilestone15ImplementationAuthorization(exactAuthorization)).toEqual(
      exactAuthorization,
    );
    expect(preflight.validateMilestone15RepositoryObservation(exactObservation)).toEqual(
      exactObservation,
    );
  });

  it.each([
    [
      "missing field",
      Object.fromEntries(Object.entries(exactAuthorization).filter(([key]) => key !== "milestone")),
      "preflight-authorization-field-missing",
    ],
    [
      "unknown field",
      { ...exactAuthorization, worktreeClean: true },
      "preflight-authorization-field-unknown",
    ],
    [
      "wrong contract version",
      { ...exactAuthorization, contractVersion: "2.0" },
      "preflight-contract-version-rejected",
    ],
    ["wrong milestone", { ...exactAuthorization, milestone: "14" }, "preflight-milestone-rejected"],
    [
      "malformed documentation merge SHA",
      { ...exactAuthorization, authorizedDocumentationMergeSha: "invalid" },
      "preflight-documentation-merge-sha-malformed",
    ],
    [
      "wrong documentation merge SHA",
      { ...exactAuthorization, authorizedDocumentationMergeSha: "0".repeat(40) },
      "preflight-documentation-merge-sha-rejected",
    ],
    [
      "malformed runtime predecessor SHA",
      { ...exactAuthorization, runtimePredecessorSha: "invalid" },
      "preflight-runtime-predecessor-sha-malformed",
    ],
    [
      "wrong runtime predecessor SHA",
      { ...exactAuthorization, runtimePredecessorSha: "0".repeat(40) },
      "preflight-runtime-predecessor-sha-rejected",
    ],
    [
      "wrong required branch",
      { ...exactAuthorization, requiredImplementationBranch: "main" },
      "preflight-required-branch-rejected",
    ],
  ])("rejects %s with an exact redacted reason and no mutation", (_label, input, reason) => {
    expectRejectedWithoutMutation("authorization", input, reason);
  });

  it.each([
    ["main", "main", "preflight-current-branch-main-rejected"],
    [
      "specification branch",
      "codex/milestone-15-specification",
      "preflight-current-branch-specification-rejected",
    ],
    ["other branch", "codex/other", "preflight-current-branch-rejected"],
  ])("rejects a real %s checkout without mutation", (_label, branch, reason) => {
    withIsolatedRepository((fixtureRoot) => {
      git(["checkout", "--quiet", "-B", branch, authorizedDocumentationMergeSha], fixtureRoot);
      runPreflightInRepository(fixtureRoot, reason);
    });
  });

  it.each([
    ["staged documentation change", "README.md", true, "preflight-staging-rejected"],
    [
      "staged runtime change",
      "services/knowledge-engine/src/domain/durable-readiness-ledger.ts",
      true,
      "preflight-staged-runtime-work-rejected",
    ],
    [
      "unstaged documentation change",
      "README.md",
      false,
      "preflight-unstaged-tracked-changes-rejected",
    ],
  ])("rejects a real %s without mutation", (_label, path, staged, reason) => {
    withIsolatedRepository((fixtureRoot) => {
      const absolutePath = resolve(fixtureRoot, path);
      writeFileSync(
        absolutePath,
        `${existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : ""}\nM15 fixture mutation\n`,
      );
      if (staged) git(["add", path], fixtureRoot);
      runPreflightInRepository(fixtureRoot, reason);
    });
  });

  it("rejects a real untracked runtime path without mutation", () => {
    withIsolatedRepository((fixtureRoot) => {
      const path = "packages/knowledge-schema/src/durable-readiness-ledger.ts";
      writeFileSync(resolve(fixtureRoot, path), "export {};\n");
      runPreflightInRepository(fixtureRoot, "preflight-untracked-runtime-work-rejected");
    });
  });

  it("rejects a real prohibited remote-tracking implementation ref without fetching or mutation", () => {
    withIsolatedRepository((fixtureRoot) => {
      git(
        ["update-ref", "refs/remotes/origin/codex/milestone-15", authorizedDocumentationMergeSha],
        fixtureRoot,
      );
      runPreflightInRepository(fixtureRoot, "preflight-remote-implementation-branch-rejected");
    });
  });

  it("rejects a real HEAD ahead of origin/main without mutation", () => {
    withIsolatedRepository((fixtureRoot) => {
      writeFileSync(resolve(fixtureRoot, "head-mismatch.txt"), "mismatch\n");
      git(["add", "head-mismatch.txt"], fixtureRoot);
      git(["commit", "--quiet", "-m", "test: create wrong head"], fixtureRoot);
      runPreflightInRepository(fixtureRoot, "preflight-ahead-rejected");
    });
  });

  it("rejects a real merge-base mismatch caused by local main without mutation", () => {
    withIsolatedRepository((fixtureRoot) => {
      git(["update-ref", "refs/heads/main", runtimePredecessorSha], fixtureRoot);
      runPreflightInRepository(fixtureRoot, "preflight-merge-base-rejected");
    });
  });

  it("rejects a real origin/main mismatch without fetching or mutation", () => {
    withIsolatedRepository((fixtureRoot) => {
      git(["update-ref", "refs/remotes/origin/main", runtimePredecessorSha], fixtureRoot);
      runPreflightInRepository(fixtureRoot, "preflight-origin-main-rejected");
    });
  });

  it.each([
    ["merge-base", "preflight-merge-base-rejected"],
    ["ahead", "preflight-ahead-rejected"],
    ["behind", "preflight-behind-rejected"],
    ["runtime-ancestor", "preflight-runtime-predecessor-ancestor-rejected"],
    ["specification-ancestor", "preflight-specification-merge-ancestor-rejected"],
  ])(
    "maps the real Git %s command through an isolated CLI seam without mutation",
    (mode, reason) => {
      withIsolatedRepository((fixtureRoot) => {
        withGitInspectionInterception(mode, (environment) =>
          runPreflightInRepository(fixtureRoot, reason, environment),
        );
      });
    },
  );

  it("inspects Git itself and accepts an exact isolated clean clone without mutation", () => {
    withIsolatedRepository((fixtureRoot) => runPreflightInRepository(fixtureRoot));
  });
});

function syntheticPredecessorReport(status = "passed") {
  const expectedFiles = Array.from({ length: 42 }, (_, index) =>
    resolve(repositoryRoot, "synthetic", `predecessor-${index}.test.ts`),
  );
  const assertionCountInFirstFile = 998;
  const testResults = expectedFiles.map((name, fileIndex) => ({
    name,
    assertionResults: Array.from(
      { length: fileIndex === 0 ? assertionCountInFirstFile : 1 },
      (_, testIndex) => ({
        title:
          fileIndex === 0 && testIndex === 0
            ? predecessor.M15_PREDECESSOR_BASELINE.addedM14ProvenanceTestTitle
            : `original-${fileIndex}-${testIndex}`,
        status: fileIndex === 0 && testIndex === 1 ? status : "passed",
      }),
    ),
  }));
  return { expectedFiles, reports: [{ success: true, testResults }] };
}

describe("Milestone 15 standalone predecessor proof", () => {
  it("checks out complete Git history for real preflight fixtures in CI", () => {
    const workflow = readFileSync(
      resolve(repositoryRoot, ".github", "workflows", "ci.yml"),
      "utf8",
    );
    expect(workflow).toContain(
      "uses: actions/checkout@v4\n        with:\n          fetch-depth: 0",
    );
  });

  it("accepts the exact 42-file, 1,038-original-test plus one M14 provenance inventory", () => {
    const baseFiles = Array.from({ length: 42 }, (_, index) => `tests/base-${index}.test.ts`);
    expect(predecessor.validatePredecessorFileInventory(baseFiles, baseFiles)).toEqual(
      [...baseFiles].sort(),
    );
    const fixture = syntheticPredecessorReport();
    expect(predecessor.summarizePredecessorReports(fixture.expectedFiles, fixture.reports)).toEqual(
      {
        executedFiles: 42,
        executedTests: 1_039,
        originalFiles: 42,
        originalTests: 1_038,
        addedM14ProvenanceTests: 1,
      },
    );
  });

  it("rejects an omitted predecessor file", () => {
    const baseFiles = Array.from({ length: 42 }, (_, index) => `tests/base-${index}.test.ts`);
    expect(() =>
      predecessor.validatePredecessorFileInventory(baseFiles, baseFiles.slice(1)),
    ).toThrow("predecessor-file-inventory-rejected");
  });

  it.each([
    ["early return", "\nreturn;\n"],
    ["mock insertion", "\nconst mock = () => undefined;\n"],
    ["assertion weakening", "\nexpect(true).toBe(true);\n"],
    ["skip modifier", "\nit.skip('bypass', () => {});\n"],
    ["renamed test", "\n// renamed test\n"],
    ["arbitrary comment", "\n// bypass\n"],
  ])("rejects %s in an original predecessor file by exact bytes", (_label, mutation) => {
    withIsolatedRepository((fixtureRoot) => {
      const baseFiles = git(
        ["ls-tree", "-r", "--name-only", authorizedDocumentationMergeSha],
        fixtureRoot,
      )
        .split("\n")
        .filter((path) => /(^|\/)tests\/.*\.test\.ts$/u.test(path));
      const target = "packages/knowledge-schema/tests/context.test.ts";
      writeFileSync(
        resolve(fixtureRoot, target),
        `${readFileSync(resolve(fixtureRoot, target), "utf8")}${mutation}`,
      );
      expect(() => predecessor.validatePredecessorSourceBytes(fixtureRoot, baseFiles)).toThrow(
        "predecessor-source-bytes-rejected",
      );
    });
  });

  it("accepts only the exact reviewed M14 provenance patch", () => {
    withIsolatedRepository((fixtureRoot) => {
      const baseFiles = git(
        ["ls-tree", "-r", "--name-only", authorizedDocumentationMergeSha],
        fixtureRoot,
      )
        .split("\n")
        .filter((path) => /(^|\/)tests\/.*\.test\.ts$/u.test(path));
      const allowed = predecessor.M15_PREDECESSOR_BASELINE.allowlistedM14ProvenancePath;
      cpSync(resolve(repositoryRoot, allowed), resolve(fixtureRoot, allowed));
      expect(() =>
        predecessor.validatePredecessorSourceBytes(fixtureRoot, baseFiles),
      ).not.toThrow();
      writeFileSync(
        resolve(fixtureRoot, allowed),
        `${readFileSync(resolve(fixtureRoot, allowed), "utf8")}\n// appended bypass\n`,
      );
      expect(() => predecessor.validatePredecessorSourceBytes(fixtureRoot, baseFiles)).toThrow(
        "predecessor-m14-provenance-patch-rejected",
      );
    });
  });

  it("rejects skipped original-test execution", () => {
    const fixture = syntheticPredecessorReport("skipped");
    expect(() =>
      predecessor.summarizePredecessorReports(fixture.expectedFiles, fixture.reports),
    ).toThrow("predecessor-skipped-or-failed-test-rejected");
  });

  it("propagates a bounded child-process failure", async () => {
    await expect(
      predecessor.runBoundedChild(process.execPath, ["-e", "process.exit(7)"], {
        cwd: repositoryRoot,
        timeout: 10_000,
      }),
    ).rejects.toThrow("predecessor-child-process-failed");
  });

  it("keeps predecessor execution outside the ordinary Vitest import graph", () => {
    const scenarioSource = readFileSync(
      resolve(
        repositoryRoot,
        "services/knowledge-engine/tests/durable-readiness-evaluation-scenarios.test.ts",
      ),
      "utf8",
    );
    const phaseB2ProofSource = readFileSync(
      resolve(
        repositoryRoot,
        "services/knowledge-engine/tests/support/milestone-15-phase-b2-proof.ts",
      ),
      "utf8",
    );
    expect(scenarioSource).not.toContain("proveM15PredecessorExecution");
    expect(phaseB2ProofSource).not.toContain('runBoundedChild("pnpm", ["verify:m15-predecessor"]');
    const rootPackage = JSON.parse(
      readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as { readonly scripts?: Readonly<Record<string, string>> };
    expect(rootPackage.scripts?.["verify:m15-predecessor-bound"]).toBe(
      "node scripts/verify-milestone-15-predecessor-bound.mjs",
    );
    expect(
      readFileSync(
        resolve(repositoryRoot, "scripts/verify-milestone-15-predecessor-bound.mjs"),
        "utf8",
      ),
    ).toContain("FOUNDEROS_M15_PREDECESSOR_EVIDENCE_PATH");
  });

  it("contains a timed-out final scenario process before any later process starts", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "founderos-m15-process-containment-"));
    const timedOutSentinel = join(temporaryRoot, "timed-out-sentinel");
    const cleanSentinel = join(temporaryRoot, "clean-sentinel");
    const timeoutFixture = join(temporaryRoot, "timeout.test.ts");
    const cleanFixture = join(temporaryRoot, "clean.test.ts");
    writeFileSync(
      timeoutFixture,
      `import { writeFileSync } from "node:fs";\n` +
        `test("times out", async () => new Promise(() => {}), 25);\n` +
        `test("sentinel must not start", () => writeFileSync(${JSON.stringify(timedOutSentinel)}, "started"));\n`,
    );
    writeFileSync(
      cleanFixture,
      `import { writeFileSync } from "node:fs";\n` +
        `test("clean child", () => writeFileSync(${JSON.stringify(cleanSentinel)}, "started"));\n`,
    );
    const runner = (await import(
      pathToFileURL(resolve(repositoryRoot, "services/knowledge-engine/scripts/run-tests.mjs")).href
    )) as {
      readonly runContainedCommand: (
        command: string,
        arguments_: readonly string[],
        options: Readonly<Record<string, unknown>>,
      ) => Promise<{
        readonly exitCode: number | null;
        readonly processGroupTerminated: boolean;
      }>;
    };
    const vitest = resolve(repositoryRoot, "node_modules/vitest/vitest.mjs");
    try {
      const timedOut = await runner.runContainedCommand(
        process.execPath,
        [
          vitest,
          "run",
          timeoutFixture,
          "--root",
          temporaryRoot,
          "--globals",
          "--maxWorkers=1",
          "--bail=1",
        ],
        { cwd: repositoryRoot, forwardOutput: false },
      );
      expect(timedOut.exitCode).not.toBe(0);
      expect(timedOut.processGroupTerminated).toBe(true);
      expect(existsSync(timedOutSentinel)).toBe(false);
      const clean = await runner.runContainedCommand(
        process.execPath,
        [
          vitest,
          "run",
          cleanFixture,
          "--root",
          temporaryRoot,
          "--globals",
          "--maxWorkers=1",
          "--bail=1",
        ],
        { cwd: repositoryRoot, forwardOutput: false },
      );
      expect(clean.exitCode).toBe(0);
      expect(clean.processGroupTerminated).toBe(true);
      expect(readFileSync(cleanSentinel, "utf8")).toBe("started");
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it("keeps volatile final-suite totals out of candidate documentation", () => {
    const changedDocumentation = [
      readFileSync(resolve(repositoryRoot, "CHANGELOG.md"), "utf8"),
      readFileSync(resolve(repositoryRoot, "services/knowledge-engine/README.md"), "utf8"),
    ].join("\n");
    expect(changedDocumentation).not.toMatch(/1[,.]377|1[,.]392/u);
  });

  it("exposes the exact built M15 API only from the dedicated package subpath", async () => {
    const rootApi = (await import(
      pathToFileURL(resolve(repositoryRoot, "services/knowledge-engine/dist/index.js")).href
    )) as Record<string, unknown>;
    const dedicatedApi = (await import(
      pathToFileURL(resolve(repositoryRoot, "services/knowledge-engine/dist/readiness-ledger.js"))
        .href
    )) as Record<string, unknown>;
    expect(rootApi).not.toHaveProperty("openLocalFileReadinessEvaluationLedger");
    expect(Object.keys(dedicatedApi).sort()).toEqual([
      "M15_MAX_DERIVED_PATH_UTF8_BYTES",
      "M15_MAX_EVENT_BASENAME_UTF8_BYTES",
      "M15_MAX_PATH_COMPONENT_UTF8_BYTES",
      "M15_MAX_ROOT_PATH_UTF8_BYTES",
      "ProductionProviderReadinessError",
      "createProductionProviderReadinessEvaluator",
      "createStaticProductionProviderTransportPolicyAuthority",
      "openLocalFileReadinessEvaluationLedger",
    ]);
  });
});
