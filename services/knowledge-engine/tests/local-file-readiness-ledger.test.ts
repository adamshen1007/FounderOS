import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  M15_MAX_CANONICAL_SOURCE_ROOTS,
  M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
  M15_MAX_LEDGER_EVENTS,
  M15_MAX_QUARANTINE_ENTRIES,
  M15_MAX_STAGING_ENTRIES,
} from "@founderos/knowledge-schema";

import { createProductionProviderReadinessEvaluator } from "../src/application/evaluate-production-provider-readiness.js";
import {
  createGovernedReadinessEvaluationLedger,
  type ReadinessEvaluatorConfigurationInput,
} from "../src/application/manage-governed-readiness-evaluation-ledger.js";
import {
  countReadinessFilesystemEntriesForTesting,
  M15_MAX_PATH_COMPONENT_UTF8_BYTES,
  M15_MAX_ROOT_PATH_UTF8_BYTES,
  openLocalFileReadinessEvaluationLedger,
  openLocalFileReadinessLedgerStorageForTesting,
  readinessEventLocationNameForTesting,
  readinessInitializationLockPathForTesting,
  type LocalFileReadinessGenesisFaultPoint,
  type LocalFileReadinessLedgerFaultPoint,
} from "../src/infrastructure/local-file-readiness-ledger.js";
import { createCanonicalProviderReadinessEvaluationRuntime } from "./fixtures/provider-readiness-evaluations.js";
import { waitForChildPath } from "./support/wait-for-child-path.js";

import { beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const execFileAsync = promisify(execFile);

async function temporaryRoot(label: string) {
  return realpath(await mkdtemp(join(tmpdir(), `founderos-m15-fault-${label}-`)));
}

function storageOptions(runtimeRoot: string) {
  return {
    runtimeRoot,
    repositoryRoot,
    canonicalSourceRoots: [join(repositoryRoot, "src"), join(repositoryRoot, "tests")],
    createIfMissing: true,
  } as const;
}

const REGISTRATION_FAULTS: readonly LocalFileReadinessLedgerFaultPoint[] = [
  "before-staging",
  "attempted-staging-before-lock",
  "before-lock-acquisition",
  "after-lock-before-integrity",
  "after-integrity-before-head",
  "after-head-before-ownership",
  "after-ownership-staging",
  "after-transaction-install",
  "after-audit-install",
  "during-marker-write",
  "after-current-marker-install",
  "before-derived-head",
  "during-derived-index",
  "before-lock-release",
  "interruption-with-lock",
  "stale-lock-on-write",
];

const ALL_EVENT_FAULTS: readonly LocalFileReadinessLedgerFaultPoint[] = [
  ...REGISTRATION_FAULTS,
  "during-replay-staging",
  "after-replay-install",
  "after-replay-marker-before-index",
];

const REPLAY_FAULTS: readonly LocalFileReadinessLedgerFaultPoint[] = [
  "before-staging",
  "attempted-staging-before-lock",
  "before-lock-acquisition",
  "after-lock-before-integrity",
  "after-integrity-before-head",
  "after-head-before-ownership",
  "during-replay-staging",
  "after-replay-install",
  "after-audit-install",
  "during-marker-write",
  "after-current-marker-install",
  "before-derived-head",
  "after-replay-marker-before-index",
  "during-derived-index",
  "before-lock-release",
  "interruption-with-lock",
  "stale-lock-on-write",
];

const GENESIS_FAULTS: readonly LocalFileReadinessGenesisFaultPoint[] = [
  "before-genesis-staging",
  "during-genesis-staging",
  "after-genesis-archive",
  "after-genesis-current-marker",
];
const POST_COMMIT_FAULTS = new Set<LocalFileReadinessLedgerFaultPoint>([
  "after-current-marker-install",
  "before-derived-head",
  "during-derived-index",
  "before-lock-release",
  "interruption-with-lock",
  "after-replay-marker-before-index",
]);
const REGISTRATION_COMPONENTS = [
  "audit-entry.json",
  "commit-marker.json",
  "complete-history.json",
  "ledger-head.json",
  "ownership.json",
  "registration-request.json",
  "semantic-event.json",
  "transaction.json",
] as const;
const REGISTRATION_PRE_AUDIT = [
  "ownership.json",
  "registration-request.json",
  "semantic-event.json",
  "transaction.json",
] as const;
const REPLAY_COMPONENTS = [
  "audit-entry.json",
  "commit-marker.json",
  "complete-history.json",
  "current-admissibility.json",
  "historical-comparison.json",
  "ledger-head.json",
  "replay-attempt.json",
  "replay-request.json",
  "semantic-event.json",
] as const;
const REPLAY_PRE_AUDIT = [
  "current-admissibility.json",
  "historical-comparison.json",
  "replay-attempt.json",
  "replay-request.json",
  "semantic-event.json",
] as const;
async function entriesOrEmpty(path: string): Promise<readonly string[]> {
  try {
    return (await readdir(path)).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function inactiveWriterLockBytes(processId: number): {
  readonly bytes: string;
  readonly fingerprint: string;
} {
  const unsigned = {
    lockContractVersion: "1.0",
    lockKind: "writer",
    processId,
    acquiredAt: "2000-01-01T00:00:00.000Z",
  } as const;
  const fingerprint = createHash("sha256")
    .update("founderos.m15.local-lock.v1")
    .update("\0")
    .update(JSON.stringify(unsigned))
    .digest("hex");
  return {
    bytes: JSON.stringify({ ...unsigned, lockFingerprint: fingerprint }),
    fingerprint,
  };
}

async function populateBoundedEntries(
  directory: string,
  count: number,
  kind: "directory" | "file",
  name: (index: number) => string,
): Promise<void> {
  for (let start = 0; start < count; start += 100) {
    await Promise.all(
      Array.from({ length: Math.min(100, count - start) }, (_, offset) => {
        const path = join(directory, name(start + offset));
        return kind === "directory" ? mkdir(path) : writeFile(path, "", "utf8");
      }),
    );
  }
}

function asciiPathAtUtf8Length(container: string, targetBytes: number): string {
  const parts: string[] = [];
  let remaining = targetBytes - Buffer.byteLength(container, "utf8") - 1;
  while (remaining > 200) {
    parts.push("r".repeat(150));
    remaining -= 151;
  }
  if (remaining < 1) throw new Error("target path length is too small for its container");
  parts.push("r".repeat(remaining));
  const result = join(container, ...parts);
  if (Buffer.byteLength(result, "utf8") !== targetBytes) {
    throw new Error("could not construct exact UTF-8 path boundary");
  }
  return result;
}

describe("Milestone 15 local file readiness ledger fault matrix", () => {
  let runtime: Awaited<ReturnType<typeof createCanonicalProviderReadinessEvaluationRuntime>>;
  let configuration: ReadinessEvaluatorConfigurationInput;

  beforeAll(async () => {
    runtime = await createCanonicalProviderReadinessEvaluationRuntime([
      await temporaryRoot("delivery"),
    ]);
    configuration = {
      configurationBindingVersion: "1.0",
      adapterId: runtime.input.adapterDescriptor.adapterId,
      adapterFingerprint: runtime.input.adapterDescriptor.adapterFingerprint,
      providerFamilyReference: runtime.input.adapterDescriptor.providerFamilyReference,
      transportPolicyId: runtime.input.transportPolicy.transportPolicyId,
      transportPolicyFingerprint: runtime.input.transportPolicy.policyFingerprint,
      transportPolicyVersion: "1.0",
      observabilityPolicyVersion: "1.0",
      readinessEvaluatorContractVersion: "1.0",
    };
  });

  it.each(GENESIS_FAULTS)(
    "classifies genesis interruption %s as no or complete authority",
    async (fault) => {
      const runtimeRoot = await temporaryRoot(fault);
      await expect(
        openLocalFileReadinessLedgerStorageForTesting(storageOptions(runtimeRoot), {
          genesis: fault,
        }),
      ).rejects.toBeTruthy();
      const rootEntries = await entriesOrEmpty(runtimeRoot);
      if (fault === "before-genesis-staging") {
        expect(rootEntries).toEqual([]);
      } else {
        expect(rootEntries).toEqual(
          fault === "after-genesis-current-marker"
            ? ["commit-head.json", "derived", "events", "quarantine", "staging"]
            : ["derived", "events", "quarantine", "staging"],
        );
        expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(false);
        expect(await entriesOrEmpty(join(runtimeRoot, "quarantine"))).toEqual([]);
        expect(await entriesOrEmpty(join(runtimeRoot, "derived"))).toEqual([]);
        const staging = await entriesOrEmpty(join(runtimeRoot, "staging"));
        expect(staging).toEqual(
          fault === "during-genesis-staging"
            ? ["genesis-archive.json"]
            : fault === "after-genesis-archive"
              ? ["genesis-current.json"]
              : [],
        );
        expect(await exists(join(runtimeRoot, "events", "genesis", "commit-marker.json"))).toBe(
          fault === "after-genesis-archive" || fault === "after-genesis-current-marker",
        );
        expect(await exists(join(runtimeRoot, "commit-head.json"))).toBe(
          fault === "after-genesis-current-marker",
        );
        if (fault === "after-genesis-current-marker") {
          expect(await readFile(join(runtimeRoot, "commit-head.json"), "utf8")).toBe(
            await readFile(join(runtimeRoot, "events", "genesis", "commit-marker.json"), "utf8"),
          );
        }
      }
      if (fault !== "after-genesis-current-marker") {
        const resumed = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
        expect((await resumed.recover()).status).toBe("empty");
      } else {
        const opened = await openLocalFileReadinessEvaluationLedger({
          ...storageOptions(runtimeRoot),
          createIfMissing: false,
        });
        expect((await opened.recover()).status).toBe("empty");
      }
    },
  );

  it.each(REGISTRATION_FAULTS)(
    "recovers a complete old or new head at matrix point %s",
    async (fault) => {
      const runtimeRoot = await temporaryRoot(fault);
      const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      const genesis = await base.readHead();
      const oldMarkerBytes = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
      const storage = await openLocalFileReadinessLedgerStorageForTesting(
        { ...storageOptions(runtimeRoot), createIfMissing: false },
        { event: fault },
      );
      const ledger = createGovernedReadinessEvaluationLedger(storage);
      const result = await ledger.registerVerifiedReadinessEvaluation({
        contractVersion: "1.0",
        registrationRequestId: `registration-${fault}`,
        transactionId: `transaction-${fault}`,
        idempotencyKey: `idempotency-${fault}`,
        requestedOwnershipId: `ownership-${fault}`,
        requestedRegistrationSemanticEventId: `semantic-${fault}`,
        requestedRegistrationAuditEntryId: `audit-${fault}`,
        requestedRegistrationMarkerId: `marker-${fault}`,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: runtime.evaluator,
        evaluatorConfiguration: configuration,
        expectedEvaluationPackage: null,
        originalEvaluationTime: runtime.input.evaluatedAt,
        submittedAt: runtime.input.evaluatedAt,
        committedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
      });
      const committed = POST_COMMIT_FAULTS.has(fault);
      expect(result.status).toBe(committed ? "committed" : "rejected");
      if (result.status === "committed") {
        expect(result.derivedStateStatus).toBe(
          ["after-current-marker-install", "before-derived-head", "during-derived-index"].includes(
            fault,
          )
            ? "invalid"
            : "valid",
        );
      } else {
        expect("reason" in result ? result.reason : null).toBe(
          fault === "stale-lock-on-write" ? "operator-cleanup-required" : "append-failure",
        );
      }
      const eventLocation = readinessEventLocationNameForTesting(1, `marker-${fault}`);
      const target = join(runtimeRoot, "events", "registrations", eventLocation);
      const targetEntries = await entriesOrEmpty(target);
      if (committed || fault === "during-marker-write") {
        expect(targetEntries).toEqual(REGISTRATION_COMPONENTS);
      } else if (fault === "after-transaction-install") {
        expect(targetEntries).toEqual(REGISTRATION_PRE_AUDIT);
      } else if (fault === "after-audit-install") {
        expect(targetEntries).toEqual([...REGISTRATION_PRE_AUDIT, "audit-entry.json"].sort());
      } else {
        expect(targetEntries).toEqual([]);
      }
      const stagingDirectory = join(runtimeRoot, "staging", eventLocation);
      const expectedStagingEntries = ["after-transaction-install", "after-audit-install"].includes(
        fault,
      )
        ? REGISTRATION_COMPONENTS.filter((name) => !targetEntries.includes(name))
        : fault === "after-ownership-staging"
          ? REGISTRATION_COMPONENTS
          : [];
      expect(await entriesOrEmpty(stagingDirectory)).toEqual([...expectedStagingEntries].sort());
      expect(await entriesOrEmpty(join(runtimeRoot, "staging"))).toEqual(
        ["after-ownership-staging", "after-transaction-install", "after-audit-install"].includes(
          fault,
        )
          ? [eventLocation]
          : fault === "during-marker-write"
            ? ["current-1.json"]
            : [],
      );
      const currentMarkerBytes = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
      if (committed) {
        expect(currentMarkerBytes).toBe(await readFile(join(target, "commit-marker.json"), "utf8"));
        expect(currentMarkerBytes).not.toBe(oldMarkerBytes);
      } else {
        expect(currentMarkerBytes).toBe(oldMarkerBytes);
      }
      const reopened = await openLocalFileReadinessEvaluationLedger({
        ...storageOptions(runtimeRoot),
        createIfMissing: false,
      });
      const recovery = await reopened.recover();
      expect(recovery.status).toBe(committed ? "recovered" : "empty");
      expect(recovery.committedRegistrationCount).toBe(committed ? 1 : 0);
      expect(recovery.committedReplayAttemptCount).toBe(0);
      expect(recovery.installedUncommittedOrphanCount).toBe(
        ["after-transaction-install", "after-audit-install", "during-marker-write"].includes(fault)
          ? 1
          : 0,
      );
      expect(recovery.stagingOrphanCount).toBe(
        ["after-ownership-staging", "after-transaction-install", "after-audit-install"].includes(
          fault,
        )
          ? 1
          : fault === "during-marker-write"
            ? 1
            : 0,
      );
      expect(await entriesOrEmpty(join(runtimeRoot, "quarantine"))).toEqual([]);
      expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(
        ["before-lock-release", "interruption-with-lock", "stale-lock-on-write"].includes(fault),
      );
    },
  );

  it("contains exactly the shared 19 event fault coordinates", () => {
    expect(ALL_EVENT_FAULTS).toHaveLength(19);
    expect(new Set(ALL_EVENT_FAULTS).size).toBe(19);
  });

  it("materializes one byte-identical genesis under a real two-process race", async () => {
    const container = await temporaryRoot("two-process-genesis");
    const runtimeRoot = join(container, "ledger");
    const options = JSON.stringify(storageOptions(runtimeRoot));
    const helper = new URL("./support/open-local-readiness-ledger-process.mjs", import.meta.url);
    const [first, second] = await Promise.all([
      execFileAsync(process.execPath, [helper.pathname, options]),
      execFileAsync(process.execPath, [helper.pathname, options]),
    ]);
    expect(JSON.parse(first.stdout)).toEqual(JSON.parse(second.stdout));
    expect(await entriesOrEmpty(join(runtimeRoot, "events", "genesis"))).toEqual([
      "commit-marker.json",
    ]);
    expect(await entriesOrEmpty(container)).toEqual(["ledger"]);
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
  });

  it("waits for a live child initialization barrier beyond the legacy five-second window", async () => {
    const container = await temporaryRoot("delayed-child-initialization-barrier");
    const barrier = join(container, "barrier");
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import { writeFile } from "node:fs/promises"; const [path, delay] = process.argv.slice(1); await new Promise((resolve) => setTimeout(resolve, Number(delay))); await writeFile(path, "ready", "utf8"); await new Promise((resolve) => setTimeout(resolve, 1_000));',
        barrier,
        "5200",
      ],
      { stdio: "ignore" },
    );
    try {
      await waitForChildPath(child, barrier, {
        timeoutMs: 10_000,
        expectedUtf8Content: "ready",
      });
      expect(await readFile(barrier, "utf8")).toBe("ready");
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => child.once("close", () => resolvePromise()));
    }
  }, 15_000);

  it("never steals parent initialization locks after real process crashes", async () => {
    const cases = [
      {
        fault: "pause-after-initialization-lock",
        barrier: (runtimeRoot: string) => readinessInitializationLockPathForTesting(runtimeRoot),
      },
      {
        fault: "pause-after-root-creation",
        barrier: (runtimeRoot: string) => runtimeRoot,
      },
      {
        fault: "pause-during-genesis-staging",
        barrier: (runtimeRoot: string) => join(runtimeRoot, "staging", "genesis-archive.json"),
      },
    ] as const;
    await Promise.all(
      cases.map(async ({ fault, barrier }) => {
        const container = await temporaryRoot(`crash-${fault}`);
        const runtimeRoot = join(container, "ledger");
        const helper = new URL(
          "./support/open-local-readiness-ledger-process.mjs",
          import.meta.url,
        );
        const child = spawn(
          process.execPath,
          [helper.pathname, JSON.stringify(storageOptions(runtimeRoot)), fault],
          { stdio: "ignore" },
        );
        await waitForChildPath(child, barrier(runtimeRoot));
        child.kill("SIGKILL");
        await new Promise<void>((resolvePromise, rejectPromise) => {
          child.once("close", () => resolvePromise());
          child.once("error", rejectPromise);
        });
        const initializationLock = readinessInitializationLockPathForTesting(runtimeRoot);
        expect(await exists(initializationLock)).toBe(true);
        await expect(
          openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot)),
        ).rejects.toMatchObject({ code: "operator-cleanup-required" });
        expect(await exists(initializationLock)).toBe(true);
        expect(await exists(join(runtimeRoot, "commit-head.json"))).toBe(false);
      }),
    );
  }, 15_000);

  it("keeps an archived candidate invisible until current-marker replacement", async () => {
    const runtimeRoot = await temporaryRoot("archive-only-invisible");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesis = await base.readHead();
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: "during-marker-write" },
    );
    const result = await createGovernedReadinessEvaluationLedger(
      storage,
    ).registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: "registration-archive-only",
      transactionId: "transaction-archive-only",
      idempotencyKey: "idempotency-archive-only",
      requestedOwnershipId: "ownership-archive-only",
      requestedRegistrationSemanticEventId: "semantic-archive-only",
      requestedRegistrationAuditEntryId: "audit-archive-only",
      requestedRegistrationMarkerId: "marker-archive-only",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration,
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({ status: "rejected", reason: "append-failure" });
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    expect(await reopened.readHead()).toEqual(genesis);
    expect((await reopened.listCommittedReadinessEvaluations()).items).toEqual([]);
    expect(await reopened.recover()).toMatchObject({
      status: "empty",
      installedUncommittedOrphanCount: 1,
      stagingOrphanCount: 1,
    });
  });

  it("keeps a marker-installed registration committed when derived publication throws", async () => {
    const runtimeRoot = await temporaryRoot("derived-publication-write-failure");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesis = await base.readHead();
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: "derived-publication-write-failure" },
    );
    const result = await createGovernedReadinessEvaluationLedger(
      storage,
    ).registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: "registration-derived-write-failure",
      transactionId: "transaction-derived-write-failure",
      idempotencyKey: "idempotency-derived-write-failure",
      requestedOwnershipId: "ownership-derived-write-failure",
      requestedRegistrationSemanticEventId: "semantic-derived-write-failure",
      requestedRegistrationAuditEntryId: "audit-derived-write-failure",
      requestedRegistrationMarkerId: "marker-derived-write-failure",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration,
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({ status: "committed", derivedStateStatus: "invalid" });
    expect(await entriesOrEmpty(join(runtimeRoot, "derived"))).toEqual([
      ".indexes.tmp",
      "HEAD.json",
      "indexes.json",
    ]);
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    expect(await reopened.recover()).toMatchObject({
      status: "recovered",
      committedRegistrationCount: 1,
      derivedIndexStatus: "invalid",
    });
  });

  it.each(REPLAY_FAULTS)("recovers a complete old or new head for replay at %s", async (fault) => {
    const runtimeRoot = await temporaryRoot(fault);
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesis = await base.readHead();
    const registration = await base.registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: `registration-${fault}`,
      transactionId: `transaction-${fault}`,
      idempotencyKey: `idempotency-${fault}`,
      requestedOwnershipId: `ownership-${fault}`,
      requestedRegistrationSemanticEventId: `semantic-${fault}`,
      requestedRegistrationAuditEntryId: `audit-${fault}`,
      requestedRegistrationMarkerId: `marker-${fault}`,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration,
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
    });
    expect(registration.status).toBe("committed");
    if (registration.transaction === null) throw new Error("registration did not commit");
    const registeredHead = await base.readHead();
    const oldMarkerBytes = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: fault },
    );
    const ledger = createGovernedReadinessEvaluationLedger(storage);
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: `replay-key-${fault}`,
      replayRequestId: `replay-request-${fault}`,
      requestedReplayAttemptId: `replay-attempt-${fault}`,
      requestedReplaySemanticEventId: `replay-semantic-${fault}`,
      requestedReplayAuditEntryId: `replay-audit-${fault}`,
      requestedReplayMarkerId: `replay-marker-${fault}`,
      originalTransactionId: registration.transaction.transactionId,
      originalTransactionFingerprint: registration.transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration,
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: registeredHead.ledgerHeadFingerprint,
    });
    const committed = POST_COMMIT_FAULTS.has(fault);
    expect(result.status).toBe(committed ? "recorded" : "not-recorded");
    expect(result.replayAppendStatus).toBe(committed ? "appended" : "not-appended");
    if (result.status === "recorded") {
      expect(result.derivedStateStatus).toBe(
        [
          "after-current-marker-install",
          "before-derived-head",
          "during-derived-index",
          "after-replay-marker-before-index",
        ].includes(fault)
          ? "invalid"
          : "valid",
      );
    } else {
      expect("reason" in result ? result.reason : null).toBe(
        fault === "stale-lock-on-write" ? "operator-cleanup-required" : "append-failure",
      );
    }
    const eventLocation = readinessEventLocationNameForTesting(2, `replay-marker-${fault}`);
    const target = join(runtimeRoot, "events", "replay-attempts", eventLocation);
    const targetEntries = await entriesOrEmpty(target);
    if (committed || fault === "during-marker-write") {
      expect(targetEntries).toEqual(REPLAY_COMPONENTS);
    } else if (fault === "after-replay-install") {
      expect(targetEntries).toEqual(REPLAY_PRE_AUDIT);
    } else if (fault === "after-audit-install") {
      expect(targetEntries).toEqual([...REPLAY_PRE_AUDIT, "audit-entry.json"].sort());
    } else {
      expect(targetEntries).toEqual([]);
    }
    const stagingDirectory = join(runtimeRoot, "staging", eventLocation);
    const expectedStagingEntries = ["after-replay-install", "after-audit-install"].includes(fault)
      ? REPLAY_COMPONENTS.filter((name) => !targetEntries.includes(name))
      : fault === "during-replay-staging"
        ? REPLAY_COMPONENTS
        : [];
    expect(await entriesOrEmpty(stagingDirectory)).toEqual([...expectedStagingEntries].sort());
    expect(await entriesOrEmpty(join(runtimeRoot, "staging"))).toEqual(
      ["during-replay-staging", "after-replay-install", "after-audit-install"].includes(fault)
        ? [eventLocation]
        : fault === "during-marker-write"
          ? ["current-2.json"]
          : [],
    );
    const currentMarkerBytes = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
    if (committed) {
      expect(currentMarkerBytes).toBe(await readFile(join(target, "commit-marker.json"), "utf8"));
      expect(currentMarkerBytes).not.toBe(oldMarkerBytes);
    } else {
      expect(currentMarkerBytes).toBe(oldMarkerBytes);
    }
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    const recovery = await reopened.recover();
    expect(recovery.status).toBe("recovered");
    expect(recovery.committedRegistrationCount).toBe(1);
    expect(recovery.committedReplayAttemptCount).toBe(committed ? 1 : 0);
    expect(recovery.installedUncommittedOrphanCount).toBe(
      ["after-replay-install", "after-audit-install", "during-marker-write"].includes(fault)
        ? 1
        : 0,
    );
    expect(recovery.stagingOrphanCount).toBe(
      ["during-replay-staging", "after-replay-install", "after-audit-install"].includes(fault)
        ? 1
        : fault === "during-marker-write"
          ? 1
          : 0,
    );
    expect(await entriesOrEmpty(join(runtimeRoot, "quarantine"))).toEqual([]);
    expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(
      ["before-lock-release", "interruption-with-lock", "stale-lock-on-write"].includes(fault),
    );
  });

  it("allows read-only integrity while a cooperative lock remains", async () => {
    const runtimeRoot = await temporaryRoot("stale-read");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    expect((await base.verifyIntegrity()).status).toBe("valid");
  });

  it("operator cleanup removes only a proven inactive writer lock", async () => {
    const runtimeRoot = await temporaryRoot("operator-lock-cleanup");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesis = await base.readHead();
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: "stale-lock-on-write" },
    );
    const result = await createGovernedReadinessEvaluationLedger(
      storage,
    ).registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: "registration-lock-cleanup",
      transactionId: "transaction-lock-cleanup",
      idempotencyKey: "idempotency-lock-cleanup",
      requestedOwnershipId: "ownership-lock-cleanup",
      requestedRegistrationSemanticEventId: "semantic-lock-cleanup",
      requestedRegistrationAuditEntryId: "audit-lock-cleanup",
      requestedRegistrationMarkerId: "marker-lock-cleanup",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration,
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({ status: "rejected", reason: "operator-cleanup-required" });
    const markerBefore = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
    const registrationsBefore = await entriesOrEmpty(join(runtimeRoot, "events", "registrations"));
    expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(true);
    const operatorLedger = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    const inspection = await operatorLedger.inspectWriterLock();
    expect(inspection).toMatchObject({ status: "inactive", reason: null });
    if (inspection.lockFingerprint === null || inspection.writerProcessId === null) {
      throw new Error("inactive lock inspection omitted its immutable identity");
    }
    const cleanup = await operatorLedger.cleanupInactiveWriterLock({
      requestContractVersion: "1.0",
      lockFingerprint: inspection.lockFingerprint,
      writerProcessId: inspection.writerProcessId,
      writerActive: false,
    });
    expect(cleanup).toEqual({
      resultContractVersion: "1.0",
      status: "cleaned",
      lockFingerprint: inspection.lockFingerprint,
      reason: null,
    });
    expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(false);
    expect(
      await operatorLedger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: inspection.lockFingerprint,
        writerProcessId: inspection.writerProcessId,
        writerActive: false,
      }),
    ).toMatchObject({ status: "not-cleaned", reason: "writer-lock-not-found" });
    expect(await readFile(join(runtimeRoot, "commit-head.json"), "utf8")).toBe(markerBefore);
    expect(await entriesOrEmpty(join(runtimeRoot, "events", "registrations"))).toEqual(
      registrationsBefore,
    );
  });

  it("public cleanup rejects an active writer and preserves its lock", async () => {
    const runtimeRoot = await temporaryRoot("active-lock-cleanup");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesis = await base.readHead();
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: "before-lock-release" },
    );
    const result = await createGovernedReadinessEvaluationLedger(
      storage,
    ).registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: "registration-active-lock",
      transactionId: "transaction-active-lock",
      idempotencyKey: "idempotency-active-lock",
      requestedOwnershipId: "ownership-active-lock",
      requestedRegistrationSemanticEventId: "semantic-active-lock",
      requestedRegistrationAuditEntryId: "audit-active-lock",
      requestedRegistrationMarkerId: "marker-active-lock",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration,
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: genesis.ledgerHeadFingerprint,
    });
    expect(result.status).toBe("committed");
    const operatorLedger = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    const inspection = await operatorLedger.inspectWriterLock();
    expect(inspection.status).toBe("active");
    if (inspection.lockFingerprint === null || inspection.writerProcessId === null) {
      throw new Error("active lock inspection omitted its immutable identity");
    }
    await expect(
      operatorLedger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: inspection.lockFingerprint,
        writerProcessId: inspection.writerProcessId,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    expect(await exists(join(runtimeRoot, "writer.lock"))).toBe(true);
  });

  it("public cleanup reports an absent writer lock without mutation", async () => {
    const runtimeRoot = await temporaryRoot("absent-lock-cleanup");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    expect(typeof ledger.cleanupInactiveWriterLock).toBe("function");
    expect("cleanupPath" in ledger).toBe(false);
    expect("writer" in ledger).toBe(false);
    const markerBefore = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
    expect(await ledger.inspectWriterLock()).toMatchObject({ status: "none" });
    expect(
      await ledger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: "a".repeat(64),
        writerProcessId: 999_999,
        writerActive: false,
      }),
    ).toEqual({
      resultContractVersion: "1.0",
      status: "not-cleaned",
      lockFingerprint: null,
      reason: "writer-lock-not-found",
    });
    expect(await readFile(join(runtimeRoot, "commit-head.json"), "utf8")).toBe(markerBefore);
  });

  it("public cleanup preserves a lock when staging or orphan evidence exists", async () => {
    const runtimeRoot = await temporaryRoot("orphan-lock-cleanup");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const inactive = inactiveWriterLockBytes(999_996);
    await writeFile(join(runtimeRoot, "writer.lock"), inactive.bytes, "utf8");
    await mkdir(
      join(runtimeRoot, "staging", readinessEventLocationNameForTesting(1, "orphan-cleanup")),
    );
    await expect(
      ledger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: inactive.fingerprint,
        writerProcessId: 999_996,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    expect(await readFile(join(runtimeRoot, "writer.lock"), "utf8")).toBe(inactive.bytes);
  });

  it("public cleanup rejects malformed, symlinked, replaced, and mismatched locks", async () => {
    const runtimeRoot = await temporaryRoot("hostile-lock-cleanup");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const lockPath = join(runtimeRoot, "writer.lock");
    await writeFile(lockPath, "{}", "utf8");
    expect(await ledger.inspectWriterLock()).toMatchObject({
      status: "ambiguous",
      reason: "writer-lock-invalid",
    });
    await expect(
      ledger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: "a".repeat(64),
        writerProcessId: 999_999,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    const malformedTarget = `${lockPath}-malformed`;
    await rename(lockPath, malformedTarget);
    await symlink(malformedTarget, lockPath);
    expect(await ledger.inspectWriterLock()).toMatchObject({
      status: "ambiguous",
      reason: "writer-lock-invalid",
    });
    await unlink(lockPath);
    await unlink(malformedTarget);
    const first = inactiveWriterLockBytes(999_998);
    await writeFile(lockPath, first.bytes, "utf8");
    const inspection = await ledger.inspectWriterLock();
    expect(inspection).toMatchObject({ status: "inactive", lockFingerprint: first.fingerprint });
    await expect(
      ledger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: "b".repeat(64),
        writerProcessId: 999_998,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    const replacement = inactiveWriterLockBytes(999_997);
    await writeFile(lockPath, replacement.bytes, "utf8");
    await expect(
      ledger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: first.fingerprint,
        writerProcessId: 999_998,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    expect(await readFile(lockPath, "utf8")).toBe(replacement.bytes);
  });

  it("public cleanup independently checks active and inactive child processes", async () => {
    const activeRoot = await temporaryRoot("active-child-lock-cleanup");
    const activeLedger = await openLocalFileReadinessEvaluationLedger(storageOptions(activeRoot));
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      child.once("spawn", resolvePromise);
      child.once("error", rejectPromise);
    });
    if (child.pid === undefined) throw new Error("child process did not expose a PID");
    const active = inactiveWriterLockBytes(child.pid);
    await writeFile(join(activeRoot, "writer.lock"), active.bytes, "utf8");
    try {
      expect(await activeLedger.inspectWriterLock()).toMatchObject({ status: "active" });
      await expect(
        activeLedger.cleanupInactiveWriterLock({
          requestContractVersion: "1.0",
          lockFingerprint: active.fingerprint,
          writerProcessId: child.pid,
          writerActive: false,
        }),
      ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolvePromise) => child.once("close", () => resolvePromise()));
    }

    const inactiveRoot = await temporaryRoot("inactive-child-lock-cleanup");
    const inactiveLedger = await openLocalFileReadinessEvaluationLedger(
      storageOptions(inactiveRoot),
    );
    const exitedChild = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    if (exitedChild.pid === undefined) throw new Error("child process did not expose a PID");
    const exitedProcessId = exitedChild.pid;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      exitedChild.once("close", () => resolvePromise());
      exitedChild.once("error", rejectPromise);
    });
    const inactive = inactiveWriterLockBytes(exitedProcessId);
    await writeFile(join(inactiveRoot, "writer.lock"), inactive.bytes, "utf8");
    expect(await inactiveLedger.inspectWriterLock()).toMatchObject({ status: "inactive" });
    expect(
      await inactiveLedger.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: inactive.fingerprint,
        writerProcessId: exitedProcessId,
        writerActive: false,
      }),
    ).toMatchObject({ status: "cleaned", reason: null });
    expect(await exists(join(inactiveRoot, "writer.lock"))).toBe(false);
  });

  it("does not expose physical paths in public storage errors", async () => {
    const runtimeRoot = join(repositoryRoot, "src", "unsafe-ledger");
    try {
      await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(runtimeRoot);
      expect((error as Error).message).not.toContain(repositoryRoot);
    }
  });

  it("redacts post-open filesystem damage from readHead", async () => {
    const runtimeRoot = await temporaryRoot("redacted-read-head");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const registrations = join(runtimeRoot, "events", "registrations");
    await rename(registrations, `${registrations}-missing`);
    try {
      await ledger.readHead();
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({ code: "readiness-ledger-integrity-failure" });
      expect((error as Error).message).not.toContain(runtimeRoot);
    }
  });

  it("fails closed on an installed orphan with a non-normative component subset", async () => {
    const runtimeRoot = await temporaryRoot("invalid-installed-orphan");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const orphan = join(
      runtimeRoot,
      "events",
      "registrations",
      readinessEventLocationNameForTesting(1, "orphan-marker"),
    );
    await mkdir(orphan);
    await writeFile(join(orphan, "transaction.json"), "{}", "utf8");
    const recovery = await ledger.recover();
    expect(recovery.status).toBe("failed");
    expect(recovery.errors).toContain("readiness-ledger-integrity-failure");
  });

  it.each([
    [
      "source roots",
      {
        canonicalSourceRoots: Array.from(
          { length: M15_MAX_CANONICAL_SOURCE_ROOTS + 1 },
          (_, index) => join(repositoryRoot, `source-${index}`),
        ),
      },
    ],
    [
      "event entries",
      {
        limits: {
          maxEntries: M15_MAX_LEDGER_EVENTS + 1,
          maxTotalBytes: 1024,
          maxRecordBytes: 1024,
        },
      },
    ],
    [
      "total bytes",
      {
        limits: {
          maxEntries: 1,
          maxTotalBytes: 256 * 1024 * 1024 + 1,
          maxRecordBytes: 1024,
        },
      },
    ],
    [
      "record bytes",
      {
        limits: {
          maxEntries: 1,
          maxTotalBytes: 256 * 1024 * 1024,
          maxRecordBytes: 16 * 1024 * 1024 + 1,
        },
      },
    ],
  ] as const)(
    "rejects a one-over global %s bound before filesystem mutation",
    async (_label, extra) => {
      const runtimeRoot = await temporaryRoot(`global-bound-${_label.replaceAll(" ", "-")}`);
      await expect(
        openLocalFileReadinessEvaluationLedger({ ...storageOptions(runtimeRoot), ...extra }),
      ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
      expect(await entriesOrEmpty(runtimeRoot)).toEqual([]);
    },
  );

  it.each([
    [
      "staging",
      M15_MAX_STAGING_ENTRIES,
      "directory",
      (index: number) => `000000000001-staging-${String(index).padStart(5, "0")}`,
    ],
    [
      "quarantine",
      M15_MAX_QUARANTINE_ENTRIES,
      "file",
      (index: number) => `quarantine-${String(index).padStart(5, "0")}`,
    ],
  ] as const)(
    "accepts exact operational %s population and fails closed one over",
    async (collection, maximum, kind, name) => {
      const runtimeRoot = await temporaryRoot(`bound-${collection}`);
      const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      const markerPath = join(runtimeRoot, "commit-head.json");
      const markerBefore = await readFile(markerPath, "utf8");
      const directory = join(runtimeRoot, collection);
      await populateBoundedEntries(directory, maximum, kind, name);
      expect((await ledger.recover()).status).toBe("empty");
      await populateBoundedEntries(directory, 1, kind, () => name(maximum));
      const over = await ledger.recover();
      expect(over.status).toBe("failed");
      expect(over.errors).toContain("unsafe-filesystem-state");
      expect(await readFile(markerPath, "utf8")).toBe(markerBefore);
    },
    120_000,
  );

  it("accepts the exact discovered-entry traversal bound and rejects one over without mutation", async () => {
    const runtimeRoot = await temporaryRoot("bound-discovered");
    await populateBoundedEntries(
      runtimeRoot,
      M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
      "file",
      (index) => `discovered-${String(index).padStart(5, "0")}`,
    );
    await expect(countReadinessFilesystemEntriesForTesting(runtimeRoot)).resolves.toBe(
      M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
    );
    await populateBoundedEntries(runtimeRoot, 1, "file", () => "discovered-over");
    await expect(countReadinessFilesystemEntriesForTesting(runtimeRoot)).rejects.toMatchObject({
      code: "unsafe-filesystem-state",
    });
    expect(await entriesOrEmpty(runtimeRoot)).toHaveLength(
      M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES + 1,
    );
  }, 120_000);

  it("rejects a no-follow authoritative leaf substitution with a redacted result", async () => {
    const runtimeRoot = await temporaryRoot("leaf-substitution");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const marker = join(runtimeRoot, "commit-head.json");
    const originalMarker = join(runtimeRoot, "original-current-marker.json");
    await rename(marker, originalMarker);
    await symlink(originalMarker, marker);
    const integrity = await ledger.verifyIntegrity();
    expect(integrity.status).toBe("invalid");
    expect(integrity.findings.join(" ")).not.toContain(runtimeRoot);
  });

  it("rejects accessor-backed nested options without invoking them", async () => {
    const runtimeRoot = await temporaryRoot("nested-option-accessor");
    let invoked = 0;
    const limits = {
      maxTotalBytes: 1024,
      maxRecordBytes: 1024,
    } as Record<string, unknown>;
    Object.defineProperty(limits, "maxEntries", {
      enumerable: true,
      get() {
        invoked += 1;
        return 1;
      },
    });
    const roots = [join(repositoryRoot, "src")] as string[];
    Object.defineProperty(roots, "0", {
      enumerable: true,
      get() {
        invoked += 1;
        return join(repositoryRoot, "src");
      },
    });
    await expect(
      openLocalFileReadinessEvaluationLedger({
        ...storageOptions(runtimeRoot),
        limits: limits as never,
      }),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    await expect(
      openLocalFileReadinessEvaluationLedger({
        ...storageOptions(runtimeRoot),
        canonicalSourceRoots: roots,
      }),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    expect(invoked).toBe(0);
    expect(await entriesOrEmpty(runtimeRoot)).toEqual([]);
  });

  it("rejects overlong UTF-8 roots and components before creating partial state", async () => {
    const container = await temporaryRoot("path-bounds");
    const longComponent = "a".repeat(M15_MAX_PATH_COMPONENT_UTF8_BYTES + 1);
    await expect(
      openLocalFileReadinessEvaluationLedger(storageOptions(join(container, longComponent))),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    const multibyteComponent = "界".repeat(
      Math.floor(M15_MAX_PATH_COMPONENT_UTF8_BYTES / Buffer.byteLength("界", "utf8")) + 1,
    );
    await expect(
      openLocalFileReadinessEvaluationLedger(storageOptions(join(container, multibyteComponent))),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    const boundedComponent = "b".repeat(M15_MAX_PATH_COMPONENT_UTF8_BYTES);
    const overlongRoot = join(
      container,
      ...Array.from(
        { length: Math.ceil(M15_MAX_ROOT_PATH_UTF8_BYTES / boundedComponent.length) + 1 },
        (_, index) => `${index}-${boundedComponent.slice(0, -String(index).length - 1)}`,
      ),
    );
    expect(Buffer.byteLength(overlongRoot, "utf8")).toBeGreaterThan(M15_MAX_ROOT_PATH_UTF8_BYTES);
    await expect(
      openLocalFileReadinessEvaluationLedger(storageOptions(overlongRoot)),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    expect(await entriesOrEmpty(container)).toEqual([]);
  });

  it("accepts exact root/component byte bounds and rejects one byte over", async () => {
    const rootContainer = await temporaryRoot("exact-root-bound");
    const exactRoot = asciiPathAtUtf8Length(rootContainer, M15_MAX_ROOT_PATH_UTF8_BYTES);
    await mkdir(join(exactRoot, ".."), { recursive: true });
    const exactLedger = await openLocalFileReadinessEvaluationLedger(storageOptions(exactRoot));
    expect((await exactLedger.verifyIntegrity()).status).toBe("valid");

    const overContainer = await temporaryRoot("over-root-bound");
    const overRoot = asciiPathAtUtf8Length(overContainer, M15_MAX_ROOT_PATH_UTF8_BYTES + 1);
    await mkdir(join(overRoot, ".."), { recursive: true });
    await expect(
      openLocalFileReadinessEvaluationLedger(storageOptions(overRoot)),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    expect(await entriesOrEmpty(join(overRoot, ".."))).toEqual([]);

    const componentContainer = await temporaryRoot("exact-component-bound");
    const exactComponent = "界".repeat(M15_MAX_PATH_COMPONENT_UTF8_BYTES / 3);
    expect(Buffer.byteLength(exactComponent, "utf8")).toBe(M15_MAX_PATH_COMPONENT_UTF8_BYTES);
    const componentLedger = await openLocalFileReadinessEvaluationLedger(
      storageOptions(join(componentContainer, exactComponent)),
    );
    expect((await componentLedger.verifyIntegrity()).status).toBe("valid");
    await expect(
      openLocalFileReadinessEvaluationLedger(
        storageOptions(join(componentContainer, `${exactComponent}a`)),
      ),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    expect(await entriesOrEmpty(componentContainer)).toEqual([exactComponent]);
  });

  it("keeps maximum-length logical identifiers independent from bounded physical names", () => {
    const logicalIdentifier = `m${"a".repeat(255)}`;
    const location = readinessEventLocationNameForTesting(1, logicalIdentifier);
    expect(logicalIdentifier).toHaveLength(256);
    expect(Buffer.byteLength(location, "utf8")).toBeLessThanOrEqual(96);
    expect(location).toMatch(/^000000000001-[a-f0-9]{64}$/u);
    expect(location).not.toContain(logicalIdentifier);
  });

  it("rejects a runtime path whose existing ancestor is a symbolic link", async () => {
    const target = await temporaryRoot("symlink-ancestor-target");
    const container = await temporaryRoot("symlink-ancestor-container");
    const alias = join(container, "alias");
    await symlink(target, alias);
    await expect(
      openLocalFileReadinessEvaluationLedger(storageOptions(join(alias, "ledger"))),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
    expect(await entriesOrEmpty(target)).toEqual([]);
  });

  it("rejects physical root identity substitution on an already-open ledger", async () => {
    const runtimeRoot = await temporaryRoot("root-substitution");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    await rename(runtimeRoot, `${runtimeRoot}-original`);
    await mkdir(runtimeRoot, { mode: 0o700 });
    const integrity = await ledger.verifyIntegrity();
    expect(integrity.status).toBe("invalid");
    expect(integrity.findings).toContain("unsafe-filesystem-state");
    expect(integrity.findings.join(" ")).not.toContain(runtimeRoot);
  });

  it.each([
    ["registrations", ["events", "registrations"]],
    ["replay-attempts", ["events", "replay-attempts"]],
    ["staging", ["staging"]],
    ["genesis-marker", ["events", "genesis"]],
    ["derived", ["derived"]],
    ["quarantine", ["quarantine"]],
  ] as const)(
    "rejects nested canonical directory identity substitution: %s",
    async (_label, parts) => {
      const runtimeRoot = await temporaryRoot(`nested-${_label}`);
      const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      const authoritativeHead = await ledger.readHead();
      const markerBefore = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
      const target = join(runtimeRoot, ...parts);
      await rename(target, `${target}-original`);
      await mkdir(target, { mode: 0o700 });
      const before = await ledger.readHead().catch(() => null);
      expect(before).toBeNull();
      const integrity = await ledger.verifyIntegrity();
      expect(integrity.status).toBe("invalid");
      expect(integrity.findings).toContain("unsafe-filesystem-state");
      expect(integrity.findings.join(" ")).not.toContain(runtimeRoot);
      const append = await ledger.registerVerifiedReadinessEvaluation({
        contractVersion: "1.0",
        registrationRequestId: `registration-nested-${_label}`,
        transactionId: `transaction-nested-${_label}`,
        idempotencyKey: `idempotency-nested-${_label}`,
        requestedOwnershipId: `ownership-nested-${_label}`,
        requestedRegistrationSemanticEventId: `semantic-nested-${_label}`,
        requestedRegistrationAuditEntryId: `audit-nested-${_label}`,
        requestedRegistrationMarkerId: `marker-nested-${_label}`,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: runtime.evaluator,
        evaluatorConfiguration: configuration,
        expectedEvaluationPackage: null,
        originalEvaluationTime: runtime.input.evaluatedAt,
        submittedAt: runtime.input.evaluatedAt,
        committedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: authoritativeHead.ledgerHeadFingerprint,
      });
      expect(append.status).not.toBe("committed");
      expect(append.transaction).toBeNull();
      expect(await readFile(join(runtimeRoot, "commit-head.json"), "utf8")).toBe(markerBefore);
    },
  );

  it("fresh replay evaluators remain transport-disabled", () => {
    const evaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: runtime.transportPolicyAuthority,
    });
    expect(Object.keys(evaluator).sort()).toEqual(["evaluate", "verifyDecision"]);
    expect(Object.keys(evaluator).some((key) => /execute|transport|credential/iu.test(key))).toBe(
      false,
    );
  });
});
