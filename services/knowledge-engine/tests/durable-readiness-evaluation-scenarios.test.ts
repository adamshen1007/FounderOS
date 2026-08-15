import { execFile } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  mkdtemp,
  mkdir,
  readFile as rawReadFile,
  realpath,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import {
  ReadinessLedgerHeadSchema as RawReadinessLedgerHeadSchema,
  ReadinessIntegrityResultSchema as RawReadinessIntegrityResultSchema,
  ReadinessReplayAppendStatusSchema as RawReadinessReplayAppendStatusSchema,
  ReadinessDerivedIndexRebuildResultSchema as RawReadinessDerivedIndexRebuildResultSchema,
  ReadinessDerivedStateStatusSchema as RawReadinessDerivedStateStatusSchema,
  ReadinessCommittedEvaluationPageSchema as RawReadinessCommittedEvaluationPageSchema,
  ReadinessCommittedEvaluationListItemSchema as RawReadinessCommittedEvaluationListItemSchema,
  ReadinessListPageMetadataSchema as RawReadinessListPageMetadataSchema,
  ReadinessRecoveryResultSchema as RawReadinessRecoveryResultSchema,
  ReadinessRegistrationResultSchema as RawReadinessRegistrationResultSchema,
  ReadinessReplayAttemptPageSchema as RawReadinessReplayAttemptPageSchema,
  ReadinessReplayAttemptListItemSchema as RawReadinessReplayAttemptListItemSchema,
  ReadinessReplaySubmissionResultSchema as RawReadinessReplaySubmissionResultSchema,
  ReadinessWriterLockCleanupResultSchema as RawReadinessWriterLockCleanupResultSchema,
  ReadinessWriterLockInspectionResultSchema as RawReadinessWriterLockInspectionResultSchema,
  type DurableContextDeliveryLedger,
} from "@founderos/knowledge-schema";

import {
  createReadinessGenesisCommitment as rawCreateReadinessGenesisCommitment,
  createReadinessHistoricalComparison as rawCreateReadinessHistoricalComparison,
  createCanonicalReadinessEvaluationPackage as rawCreateCanonicalReadinessEvaluationPackage,
  M15_COMMITMENT_DOMAINS,
  verifyReadinessHistoricalComparison as rawVerifyReadinessHistoricalComparison,
  verifyCommittedReadinessTransaction as rawVerifyCommittedReadinessTransaction,
  verifyCanonicalReadinessEvaluationPackage as rawVerifyCanonicalReadinessEvaluationPackage,
} from "../src/domain/durable-readiness-ledger.js";
import { createProductionProviderReadinessEvaluator as rawCreateProductionProviderReadinessEvaluator } from "../src/application/evaluate-production-provider-readiness.js";
import { createAuthorizationDecisionEvidence as rawCreateAuthorizationDecisionEvidence } from "../src/domain/provider-readiness.js";
import type { ReadinessEvaluatorConfigurationInput } from "../src/application/manage-governed-readiness-evaluation-ledger.js";
import { createGovernedReadinessEvaluationLedger as rawCreateGovernedReadinessEvaluationLedger } from "../src/application/manage-governed-readiness-evaluation-ledger.js";
import {
  openLocalFileReadinessEvaluationLedger as rawOpenLocalFileReadinessEvaluationLedger,
  openLocalFileReadinessLedgerStorageForTesting as rawOpenLocalFileReadinessLedgerStorageForTesting,
  readinessInitializationLockPathForTesting,
  type LocalFileReadinessGenesisFaultPoint,
  type LocalFileReadinessLedgerFaultPoint,
} from "../src/infrastructure/local-file-readiness-ledger.js";
import { M15_DURABLE_READINESS_EVALUATION_SCENARIOS } from "./fixtures/durable-readiness-evaluations.js";
import { createCanonicalProviderReadinessEvaluationRuntime } from "./fixtures/provider-readiness-evaluations.js";
import {
  inspectM15ArtifactPrivacy,
  M15_TASK_1_ARTIFACT_CLASSES,
  M15_TASK_1_PUBLIC_OUTPUT_SCHEMAS,
  readIndependentMarkerBoundedAuthority,
  verifyM15IndependentAuthorityGraph,
  verifyM15IndependentCurrentArchiveIdentity,
  verifyM15IndependentDerivedIndexes,
  verifyM15IndependentPublicLookupResults,
  verifyM15PublicOutputInventory,
  writeCoherentlyResignedAuditCategoryContradiction,
} from "./support/milestone-15-task-1-semantic-proof.js";
import {
  createM15RuntimeScenarioRegistry,
  issueM15ScenarioExecutionEvidence,
  M15_GENERIC_FALLBACK_SENTINEL,
  type M15ScenarioBehavior,
  type M15ScenarioExecutionEvidence,
  verifyM15ScenarioExecution,
} from "./support/milestone-15-scenario-registry.js";
import { proveM15ProductionNoExecution } from "./support/milestone-15-production-no-execution-proof.js";
import {
  proveM15PredecessorGateContract,
  proveM15RealGitPreflight,
  proveM15StructuredDocumentation,
} from "./support/milestone-15-phase-b2-proof.js";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const engineIndexPath = join(repositoryRoot, "services", "knowledge-engine", "src", "index.ts");
const fingerprintA = "a".repeat(64);
const fingerprintB = "b".repeat(64);
const execFileAsync = promisify(execFile);

interface BoundaryObservation {
  readonly token: symbol;
  readonly boundaries: Map<string, number>;
}

const boundaryObservationContext = new AsyncLocalStorage<BoundaryObservation>();
let activeBoundaryObservation: BoundaryObservation | null = null;

function observeProductionBoundary<T>(boundary: string, operation: () => T): T {
  const observation = boundaryObservationContext.getStore();
  if (observation !== undefined && activeBoundaryObservation?.token === observation.token) {
    observation.boundaries.set(boundary, (observation.boundaries.get(boundary) ?? 0) + 1);
  }
  return operation();
}

const readFile = ((...arguments_: Parameters<typeof rawReadFile>) =>
  observeProductionBoundary("filesystem.readFile", () =>
    rawReadFile(...arguments_),
  )) as typeof rawReadFile;

function observedSchema<T extends object>(schema: T, boundary: string): T {
  return new Proxy(schema, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "parse" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (...arguments_: readonly unknown[]) =>
        observeProductionBoundary(boundary, () => Reflect.apply(value, target, arguments_));
    },
  });
}

function observedLedger<T extends object>(ledger: T): T {
  return new Proxy(Object.create(null) as T, {
    get(_target, property) {
      const value = Reflect.get(ledger, property);
      if (typeof value !== "function") return value;
      return (...arguments_: readonly unknown[]) =>
        observeProductionBoundary(`LocalFileReadinessEvaluationLedger.${String(property)}`, () =>
          Reflect.apply(value, ledger, arguments_),
        );
    },
    has(_target, property) {
      return property in ledger;
    },
    ownKeys() {
      return Reflect.ownKeys(ledger);
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(ledger, property);
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
    },
  });
}

const ReadinessLedgerHeadSchema = observedSchema(
  RawReadinessLedgerHeadSchema,
  "ReadinessLedgerHeadSchema.parse",
);
const ReadinessDerivedIndexRebuildResultSchema = observedSchema(
  RawReadinessDerivedIndexRebuildResultSchema,
  "ReadinessDerivedIndexRebuildResultSchema.parse",
);
const ReadinessRegistrationResultSchema = observedSchema(
  RawReadinessRegistrationResultSchema,
  "ReadinessRegistrationResultSchema.parse",
);
const ReadinessReplaySubmissionResultSchema = observedSchema(
  RawReadinessReplaySubmissionResultSchema,
  "ReadinessReplaySubmissionResultSchema.parse",
);

function createReadinessGenesisCommitment(
  ...arguments_: Parameters<typeof rawCreateReadinessGenesisCommitment>
) {
  return observeProductionBoundary("createReadinessGenesisCommitment", () =>
    rawCreateReadinessGenesisCommitment(...arguments_),
  );
}

function createReadinessHistoricalComparison(
  ...arguments_: Parameters<typeof rawCreateReadinessHistoricalComparison>
) {
  return observeProductionBoundary("createReadinessHistoricalComparison", () =>
    rawCreateReadinessHistoricalComparison(...arguments_),
  );
}

function createCanonicalReadinessEvaluationPackage(
  ...arguments_: Parameters<typeof rawCreateCanonicalReadinessEvaluationPackage>
) {
  return observeProductionBoundary("createCanonicalReadinessEvaluationPackage", () =>
    rawCreateCanonicalReadinessEvaluationPackage(...arguments_),
  );
}

function verifyReadinessHistoricalComparison(
  ...arguments_: Parameters<typeof rawVerifyReadinessHistoricalComparison>
) {
  return observeProductionBoundary("verifyReadinessHistoricalComparison", () =>
    rawVerifyReadinessHistoricalComparison(...arguments_),
  );
}

function verifyCommittedReadinessTransaction(
  ...arguments_: Parameters<typeof rawVerifyCommittedReadinessTransaction>
) {
  return observeProductionBoundary("verifyCommittedReadinessTransaction", () =>
    rawVerifyCommittedReadinessTransaction(...arguments_),
  );
}

function verifyCanonicalReadinessEvaluationPackage(
  ...arguments_: Parameters<typeof rawVerifyCanonicalReadinessEvaluationPackage>
) {
  return observeProductionBoundary("verifyCanonicalReadinessEvaluationPackage", () =>
    rawVerifyCanonicalReadinessEvaluationPackage(...arguments_),
  );
}

function createAuthorizationDecisionEvidence(
  ...arguments_: Parameters<typeof rawCreateAuthorizationDecisionEvidence>
) {
  return observeProductionBoundary("createAuthorizationDecisionEvidence", () =>
    rawCreateAuthorizationDecisionEvidence(...arguments_),
  );
}

function createProductionProviderReadinessEvaluator(
  ...arguments_: Parameters<typeof rawCreateProductionProviderReadinessEvaluator>
) {
  const evaluator = observeProductionBoundary("createProductionProviderReadinessEvaluator", () =>
    rawCreateProductionProviderReadinessEvaluator(...arguments_),
  );
  return evaluator;
}

function createGovernedReadinessEvaluationLedger(
  ...arguments_: Parameters<typeof rawCreateGovernedReadinessEvaluationLedger>
) {
  return observedLedger(
    observeProductionBoundary("createGovernedReadinessEvaluationLedger", () =>
      rawCreateGovernedReadinessEvaluationLedger(...arguments_),
    ),
  );
}

async function openLocalFileReadinessEvaluationLedger(
  ...arguments_: Parameters<typeof rawOpenLocalFileReadinessEvaluationLedger>
) {
  return observedLedger(
    await observeProductionBoundary("openLocalFileReadinessEvaluationLedger", () =>
      rawOpenLocalFileReadinessEvaluationLedger(...arguments_),
    ),
  );
}

async function openLocalFileReadinessLedgerStorageForTesting(
  ...arguments_: Parameters<typeof rawOpenLocalFileReadinessLedgerStorageForTesting>
) {
  return observeProductionBoundary("openLocalFileReadinessLedgerStorageForTesting", () =>
    rawOpenLocalFileReadinessLedgerStorageForTesting(...arguments_),
  );
}

async function scenarioRoot(label: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), `founderos-m15-scenario-${label}-`)));
}

function scenarioConfiguration(
  runtime: Awaited<ReturnType<typeof createCanonicalProviderReadinessEvaluationRuntime>>,
): ReadinessEvaluatorConfigurationInput {
  return {
    configurationBindingVersion: "1.0",
    adapterId: runtime.input.adapterDescriptor.adapterId,
    adapterFingerprint: runtime.input.adapterDescriptor.adapterFingerprint,
    providerFamilyReference: runtime.input.adapterDescriptor.providerFamilyReference,
    transportPolicyId: runtime.input.transportPolicy.transportPolicyId,
    transportPolicyFingerprint: runtime.input.transportPolicy.policyFingerprint,
    transportPolicyVersion: runtime.input.transportPolicy.schemaVersion,
    observabilityPolicyVersion: runtime.input.adapterDescriptor.observabilityPolicyVersion,
    readinessEvaluatorContractVersion: "1.0",
  };
}

function deliveryLedgerWithAuthorityFailure(
  ledger: DurableContextDeliveryLedger,
  failure: "delivery" | "invocation",
  calls?: { delivery: number; invocation: number },
): DurableContextDeliveryLedger {
  return new Proxy(ledger, {
    get(target, property) {
      if (failure === "delivery" && property === "listCommittedOriginalDeliveries") {
        return async () => {
          if (calls !== undefined) calls.delivery += 1;
          return [];
        };
      }
      if (failure === "invocation" && property === "readOriginalDeliveryResult") {
        return async () => {
          if (calls !== undefined) calls.invocation += 1;
          return null;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function registeredScenario(label: string) {
  const deliveryRoot = await scenarioRoot(`${label}-delivery`);
  const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
  const runtimeRoot = await scenarioRoot(`${label}-ledger`);
  const ledger = await openLocalFileReadinessEvaluationLedger({
    runtimeRoot,
    repositoryRoot,
    canonicalSourceRoots: [join(repositoryRoot, "docs"), join(repositoryRoot, "services")],
    createIfMissing: true,
  });
  const input = {
    contractVersion: "1.0" as const,
    registrationRequestId: `registration-${label}`,
    transactionId: `transaction-${label}`,
    idempotencyKey: `idempotency-${label}`,
    requestedOwnershipId: `ownership-${label}`,
    requestedRegistrationSemanticEventId: `semantic-${label}`,
    requestedRegistrationAuditEntryId: `audit-${label}`,
    requestedRegistrationMarkerId: `marker-${label}`,
    deliveryLedger: runtime.input.deliveryLedger,
    deliveryIdentity: runtime.input.deliveryIdentity,
    readinessInput: runtime.input,
    evaluator: runtime.evaluator,
    evaluatorConfiguration: scenarioConfiguration(runtime),
    expectedEvaluationPackage: null,
    originalEvaluationTime: runtime.input.evaluatedAt,
    submittedAt: runtime.input.evaluatedAt,
    committedAt: runtime.input.evaluatedAt,
    expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
  };
  const registration = await ledger.registerVerifiedReadinessEvaluation(input);
  expect(registration.status).toBe("committed");
  if (registration.transaction === null) throw new Error("scenario registration failed");
  return { ledger, runtime, runtimeRoot, input, transaction: registration.transaction };
}

async function replayScenario(label: string, time = "2026-07-30T01:30:00.000Z") {
  const registered = await registeredScenario(label);
  const input = {
    replayContractVersion: "1.0" as const,
    replayIdempotencyKey: `replay-key-${label}`,
    replayRequestId: `replay-request-${label}`,
    requestedReplayAttemptId: `replay-attempt-${label}`,
    requestedReplaySemanticEventId: `replay-semantic-${label}`,
    requestedReplayAuditEntryId: `replay-audit-${label}`,
    requestedReplayMarkerId: `replay-marker-${label}`,
    originalTransactionId: registered.transaction.transactionId,
    originalTransactionFingerprint: registered.transaction.transactionFingerprint,
    deliveryLedger: registered.runtime.input.deliveryLedger,
    deliveryIdentity: registered.runtime.input.deliveryIdentity,
    readinessInput: registered.runtime.input,
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: registered.runtime.transportPolicyAuthority,
    }),
    evaluatorConfiguration: scenarioConfiguration(registered.runtime),
    originalEvaluationTime: registered.runtime.input.evaluatedAt,
    replayEvaluatedAt: time,
    recordedAt: time,
    expectedLedgerHeadFingerprint: (await registered.ledger.readHead()).ledgerHeadFingerprint,
  };
  const replay = await registered.ledger.submitReadinessReplayAttempt(input);
  expect(replay.status).toBe("recorded");
  return { ...registered, replay, replayInput: input };
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

function storageOptions(runtimeRoot: string) {
  return {
    runtimeRoot,
    repositoryRoot,
    canonicalSourceRoots: [join(repositoryRoot, "docs"), join(repositoryRoot, "services")],
    createIfMissing: true,
  } as const;
}

async function productionTypeScriptSourcePaths(
  root: string,
  directory = "",
): Promise<readonly string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await productionTypeScriptSourcePaths(root, path)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      paths.push(join(root, path));
    }
  }
  return paths.sort();
}

async function registrationArtifactFaultFixture(
  label: string,
  fault: LocalFileReadinessLedgerFaultPoint,
): Promise<string> {
  const deliveryRoot = await scenarioRoot(`${label}-delivery`);
  const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
  const runtimeRoot = await scenarioRoot(`${label}-ledger`);
  const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
  const storage = await openLocalFileReadinessLedgerStorageForTesting(
    { ...storageOptions(runtimeRoot), createIfMissing: false },
    { event: fault },
  );
  await createGovernedReadinessEvaluationLedger(storage).registerVerifiedReadinessEvaluation({
    contractVersion: "1.0",
    registrationRequestId: `registration-${label}`,
    transactionId: `transaction-${label}`,
    idempotencyKey: `idempotency-${label}`,
    requestedOwnershipId: `ownership-${label}`,
    requestedRegistrationSemanticEventId: `semantic-${label}`,
    requestedRegistrationAuditEntryId: `audit-${label}`,
    requestedRegistrationMarkerId: `marker-${label}`,
    deliveryLedger: runtime.input.deliveryLedger,
    deliveryIdentity: runtime.input.deliveryIdentity,
    readinessInput: runtime.input,
    evaluator: runtime.evaluator,
    evaluatorConfiguration: scenarioConfiguration(runtime),
    expectedEvaluationPackage: null,
    originalEvaluationTime: runtime.input.evaluatedAt,
    submittedAt: runtime.input.evaluatedAt,
    committedAt: runtime.input.evaluatedAt,
    expectedLedgerHeadFingerprint: (await base.readHead()).ledgerHeadFingerprint,
  });
  return runtimeRoot;
}

async function realInitializationLockFixture(label: string): Promise<{
  readonly runtimeRoot: string;
  readonly lockPath: string;
}> {
  const runtimeRoot = await scenarioRoot(`${label}-initialization`);
  const lockPath = readinessInitializationLockPathForTesting(runtimeRoot);
  const vitest = join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
  const child = execFile(
    process.execPath,
    [vitest, "run", "tests/support/genesis-clean-process.test.ts", "--maxWorkers=1"],
    {
      cwd: join(repositoryRoot, "services", "knowledge-engine"),
      env: {
        ...process.env,
        FOUNDEROS_M15_INITIALIZATION_LOCK_RUNTIME_ROOT: runtimeRoot,
        FOUNDEROS_M15_INITIALIZATION_LOCK_REPOSITORY_ROOT: repositoryRoot,
      },
    },
  );
  const closed = new Promise<void>((resolveClosed) => child.once("close", () => resolveClosed()));
  let observed = false;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      await rawReadFile(lockPath, "utf8");
      observed = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await delay(10);
    }
  }
  if (!observed) {
    child.kill("SIGTERM");
    await closed;
    throw new Error("initialization-lock-fixture-timeout");
  }
  child.kill("SIGTERM");
  await closed;
  return { runtimeRoot, lockPath };
}

async function registrationFaultMatrixScenario(): Promise<void> {
  for (const fault of REGISTRATION_FAULTS) {
    const deliveryRoot = await scenarioRoot(`sc-021-${fault}-delivery`);
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
    const runtimeRoot = await scenarioRoot(`sc-021-${fault}-ledger`);
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const head = await base.readHead();
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
      evaluatorConfiguration: scenarioConfiguration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
    });
    expect(result.status).toBe(POST_COMMIT_FAULTS.has(fault) ? "committed" : "rejected");
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(runtimeRoot),
      createIfMissing: false,
    });
    const recovery = await reopened.recover();
    expect(recovery.committedRegistrationCount).toBe(POST_COMMIT_FAULTS.has(fault) ? 1 : 0);
    expect(recovery.committedReplayAttemptCount).toBe(0);
    expect((await reopened.readHead()).headGeneration).toBe(POST_COMMIT_FAULTS.has(fault) ? 1 : 0);
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
  }
}

async function replayFaultMatrixScenario(): Promise<void> {
  for (const fault of REPLAY_FAULTS) {
    const registered = await registeredScenario(`sc-022-${fault}`);
    const storage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(registered.runtimeRoot), createIfMissing: false },
      { event: fault },
    );
    const ledger = createGovernedReadinessEvaluationLedger(storage);
    const time = "2026-07-30T01:30:00.000Z";
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: `replay-key-${fault}`,
      replayRequestId: `replay-request-${fault}`,
      requestedReplayAttemptId: `replay-attempt-${fault}`,
      requestedReplaySemanticEventId: `replay-semantic-${fault}`,
      requestedReplayAuditEntryId: `replay-audit-${fault}`,
      requestedReplayMarkerId: `replay-marker-${fault}`,
      originalTransactionId: registered.transaction.transactionId,
      originalTransactionFingerprint: registered.transaction.transactionFingerprint,
      deliveryLedger: registered.runtime.input.deliveryLedger,
      deliveryIdentity: registered.runtime.input.deliveryIdentity,
      readinessInput: registered.runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: registered.runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: scenarioConfiguration(registered.runtime),
      originalEvaluationTime: registered.runtime.input.evaluatedAt,
      replayEvaluatedAt: time,
      recordedAt: time,
      expectedLedgerHeadFingerprint: (await registered.ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(result.status).toBe(POST_COMMIT_FAULTS.has(fault) ? "recorded" : "not-recorded");
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(registered.runtimeRoot),
      createIfMissing: false,
    });
    const recovery = await reopened.recover();
    expect(recovery.committedRegistrationCount).toBe(1);
    expect(recovery.committedReplayAttemptCount).toBe(POST_COMMIT_FAULTS.has(fault) ? 1 : 0);
    expect((await reopened.readHead()).headGeneration).toBe(POST_COMMIT_FAULTS.has(fault) ? 2 : 1);
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
  }
}

async function replayAppendFailureScenario(): Promise<void> {
  const registered = await registeredScenario("sc-019-append-failure");
  const storage = await openLocalFileReadinessLedgerStorageForTesting(
    { ...storageOptions(registered.runtimeRoot), createIfMissing: false },
    { event: "after-replay-install" },
  );
  const ledger = createGovernedReadinessEvaluationLedger(storage);
  const time = "2026-07-30T01:30:00.000Z";
  const result = await ledger.submitReadinessReplayAttempt({
    replayContractVersion: "1.0",
    replayIdempotencyKey: "replay-key-sc-019",
    replayRequestId: "replay-request-sc-019",
    requestedReplayAttemptId: "replay-attempt-sc-019",
    requestedReplaySemanticEventId: "replay-semantic-sc-019",
    requestedReplayAuditEntryId: "replay-audit-sc-019",
    requestedReplayMarkerId: "replay-marker-sc-019",
    originalTransactionId: registered.transaction.transactionId,
    originalTransactionFingerprint: registered.transaction.transactionFingerprint,
    deliveryLedger: registered.runtime.input.deliveryLedger,
    deliveryIdentity: registered.runtime.input.deliveryIdentity,
    readinessInput: registered.runtime.input,
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: registered.runtime.transportPolicyAuthority,
    }),
    evaluatorConfiguration: scenarioConfiguration(registered.runtime),
    originalEvaluationTime: registered.runtime.input.evaluatedAt,
    replayEvaluatedAt: time,
    recordedAt: time,
    expectedLedgerHeadFingerprint: (await registered.ledger.readHead()).ledgerHeadFingerprint,
  });
  expect(result).toMatchObject({
    status: "not-recorded",
    replayAppendStatus: "not-appended",
    reason: "append-failure",
  });
  const reopened = await openLocalFileReadinessEvaluationLedger({
    ...storageOptions(registered.runtimeRoot),
    createIfMissing: false,
  });
  expect((await reopened.recover()).committedReplayAttemptCount).toBe(0);
}

async function registrationCoordinateScenario(
  label: string,
  field:
    | "registrationRequestId"
    | "transactionId"
    | "requestedOwnershipId"
    | "requestedRegistrationSemanticEventId"
    | "requestedRegistrationAuditEntryId"
    | "requestedRegistrationMarkerId",
  expectedReason: string,
): Promise<void> {
  const { ledger, runtime, input } = await registeredScenario(label);
  const { deliveryLedger, ...canonicalInput } = runtime.input;
  const candidate = {
    ...input,
    registrationRequestId: `registration-${label}-candidate`,
    transactionId: `transaction-${label}-candidate`,
    idempotencyKey: `idempotency-${label}-candidate`,
    requestedOwnershipId: `ownership-${label}-candidate`,
    requestedRegistrationSemanticEventId: `semantic-${label}-candidate`,
    requestedRegistrationAuditEntryId: `audit-${label}-candidate`,
    requestedRegistrationMarkerId: `marker-${label}-candidate`,
    readinessInput: {
      ...structuredClone(canonicalInput),
      readinessDecisionId: `readiness-${label}-candidate`,
      deliveryLedger,
    },
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: runtime.transportPolicyAuthority,
    }),
    expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
  };
  Object.assign(candidate, { [field]: input[field] });
  expect(await ledger.registerVerifiedReadinessEvaluation(candidate)).toMatchObject({
    status: "rejected",
    reason: expectedReason,
  });
}

async function replayCoordinateScenario(
  label: string,
  field:
    | "replayIdempotencyKey"
    | "replayRequestId"
    | "requestedReplayAttemptId"
    | "requestedReplaySemanticEventId"
    | "requestedReplayAuditEntryId"
    | "requestedReplayMarkerId",
  expectedReason: string,
): Promise<void> {
  const { ledger, runtime, replayInput } = await replayScenario(label);
  const candidate = {
    ...replayInput,
    replayIdempotencyKey: `replay-key-${label}-candidate`,
    replayRequestId: `replay-request-${label}-candidate`,
    requestedReplayAttemptId: `replay-attempt-${label}-candidate`,
    requestedReplaySemanticEventId: `replay-semantic-${label}-candidate`,
    requestedReplayAuditEntryId: `replay-audit-${label}-candidate`,
    requestedReplayMarkerId: `replay-marker-${label}-candidate`,
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: runtime.transportPolicyAuthority,
    }),
    expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
  };
  Object.assign(candidate, { [field]: replayInput[field] });
  expect(await ledger.submitReadinessReplayAttempt(candidate)).toMatchObject({
    status: "not-recorded",
    reason: expectedReason,
  });
}
function assertHistoricalComparison(
  status: "mismatched" | "verification-failed",
  differingFieldPaths: readonly string[],
): void {
  const comparison = createReadinessHistoricalComparison({
    comparisonContractVersion: "1.0",
    originalEvaluationPackageFingerprint: fingerprintA,
    reconstructedEvaluationPackageFingerprint: status === "mismatched" ? fingerprintB : null,
    historicalReconstructionStatus: status,
    differingFieldPaths,
    reasonCodes: [status],
  });
  expect(verifyReadinessHistoricalComparison(comparison)).toEqual(comparison);
}

async function authorizationOutcomeScenario(
  outcome: "denied" | "review-required" | "not-evaluated" | "invalid-evidence",
  expectedStatus:
    | "authorization-denied"
    | "authorization-review-required"
    | "authorization-not-evaluated"
    | "authorization-invalid-evidence",
): Promise<void> {
  const runtime = await createCanonicalProviderReadinessEvaluationRuntime([
    await scenarioRoot(`authorization-${outcome}-delivery`),
  ]);
  const expectedAuthorizationDecision = {
    ...runtime.input.expectedAuthorizationDecision,
    authorizationDecisionId: `authorization-${outcome}-m15`,
    outcome,
  };
  const { deliveryLedger, ...canonicalInput } = runtime.input;
  const readinessInput = {
    ...structuredClone(canonicalInput),
    readinessDecisionId: `readiness-${outcome}-m15`,
    deliveryLedger,
    expectedAuthorizationDecision,
    authorizationEvidence: createAuthorizationDecisionEvidence(expectedAuthorizationDecision, {
      deliveryAuthority: runtime.authority,
      adapter: runtime.input.adapterDescriptor,
      requestedOperation: runtime.input.requestedOperation,
      decisionAuthorityReference: runtime.input.decisionAuthorityReference,
    }),
  };
  const ledger = await openLocalFileReadinessEvaluationLedger(
    storageOptions(await scenarioRoot(`authorization-${outcome}-ledger`)),
  );
  const registration = await ledger.registerVerifiedReadinessEvaluation({
    contractVersion: "1.0",
    registrationRequestId: `registration-authorization-${outcome}`,
    transactionId: `transaction-authorization-${outcome}`,
    idempotencyKey: `idempotency-authorization-${outcome}`,
    requestedOwnershipId: `ownership-authorization-${outcome}`,
    requestedRegistrationSemanticEventId: `semantic-authorization-${outcome}`,
    requestedRegistrationAuditEntryId: `audit-authorization-${outcome}`,
    requestedRegistrationMarkerId: `marker-authorization-${outcome}`,
    deliveryLedger: runtime.input.deliveryLedger,
    deliveryIdentity: runtime.input.deliveryIdentity,
    readinessInput,
    evaluator: runtime.evaluator,
    evaluatorConfiguration: scenarioConfiguration(runtime),
    expectedEvaluationPackage: null,
    originalEvaluationTime: readinessInput.evaluatedAt,
    submittedAt: readinessInput.evaluatedAt,
    committedAt: readinessInput.evaluatedAt,
    expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
  });
  if (registration.status !== "committed" || registration.transaction === null) {
    throw new Error(`authorization scenario registration failed: ${outcome}`);
  }
  const replay = await ledger.submitReadinessReplayAttempt({
    replayContractVersion: "1.0",
    replayIdempotencyKey: `replay-key-authorization-${outcome}`,
    replayRequestId: `replay-request-authorization-${outcome}`,
    requestedReplayAttemptId: `replay-attempt-authorization-${outcome}`,
    requestedReplaySemanticEventId: `replay-semantic-authorization-${outcome}`,
    requestedReplayAuditEntryId: `replay-audit-authorization-${outcome}`,
    requestedReplayMarkerId: `replay-marker-authorization-${outcome}`,
    originalTransactionId: registration.transaction.transactionId,
    originalTransactionFingerprint: registration.transaction.transactionFingerprint,
    deliveryLedger: runtime.input.deliveryLedger,
    deliveryIdentity: runtime.input.deliveryIdentity,
    readinessInput,
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: runtime.transportPolicyAuthority,
    }),
    evaluatorConfiguration: scenarioConfiguration(runtime),
    originalEvaluationTime: readinessInput.evaluatedAt,
    replayEvaluatedAt: readinessInput.evaluatedAt,
    recordedAt: readinessInput.evaluatedAt,
    expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
  });
  expect(replay.status).toBe("recorded");
  expect(replay.replayAttempt?.historicalComparison.historicalReconstructionStatus).toBe("matched");
  expect(replay.replayAttempt?.currentAdmissibility.currentAdmissibilityStatus).toBe(
    expectedStatus,
  );
}

async function historicalVerificationFailureScenario(
  scenarioId: "sc-013" | "sc-014" | "sc-015",
  failure: "configuration" | "delivery" | "invocation",
): Promise<void> {
  const registered = await registeredScenario(scenarioId);
  const calls = { delivery: 0, invocation: 0 };
  const failingDeliveryLedger =
    failure === "configuration"
      ? registered.runtime.input.deliveryLedger
      : deliveryLedgerWithAuthorityFailure(registered.runtime.input.deliveryLedger, failure, calls);
  const { deliveryLedger: _deliveryLedger, ...canonicalInput } = registered.runtime.input;
  void _deliveryLedger;
  const readinessInput = {
    ...structuredClone(canonicalInput),
    deliveryLedger: failingDeliveryLedger,
  };
  const replay = await registered.ledger.submitReadinessReplayAttempt({
    replayContractVersion: "1.0",
    replayIdempotencyKey: `replay-key-${scenarioId}`,
    replayRequestId: `replay-request-${scenarioId}`,
    requestedReplayAttemptId: `replay-attempt-${scenarioId}`,
    requestedReplaySemanticEventId: `replay-semantic-${scenarioId}`,
    requestedReplayAuditEntryId: `replay-audit-${scenarioId}`,
    requestedReplayMarkerId: `replay-marker-${scenarioId}`,
    originalTransactionId: registered.transaction.transactionId,
    originalTransactionFingerprint: registered.transaction.transactionFingerprint,
    deliveryLedger: failingDeliveryLedger,
    deliveryIdentity: registered.runtime.input.deliveryIdentity,
    readinessInput,
    evaluator: createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: registered.runtime.transportPolicyAuthority,
    }),
    evaluatorConfiguration:
      failure === "configuration"
        ? {
            ...scenarioConfiguration(registered.runtime),
            providerFamilyReference: "provider-family/sc-013-substituted",
          }
        : scenarioConfiguration(registered.runtime),
    originalEvaluationTime: registered.runtime.input.evaluatedAt,
    replayEvaluatedAt: registered.runtime.input.evaluatedAt,
    recordedAt: registered.runtime.input.evaluatedAt,
    expectedLedgerHeadFingerprint: (await registered.ledger.readHead()).ledgerHeadFingerprint,
  });
  expect(replay.status).toBe("recorded");
  if (replay.status !== "recorded") throw new Error(`${scenarioId} was not recorded`);
  expect(replay.replayAttempt.historicalComparison.historicalReconstructionStatus).toBe(
    "verification-failed",
  );
  if (failure !== "configuration") {
    expect(replay.replayAttempt.currentAdmissibility.currentAdmissibilityStatus).toBe(
      "authority-mismatch",
    );
    expect(failure === "delivery" ? calls.delivery : calls.invocation).toBeGreaterThan(0);
    expect(failure === "delivery" ? calls.invocation : calls.delivery).toBe(0);
  }
  expect(
    (await registered.ledger.listReadinessReplayAttempts(registered.transaction.transactionId))
      .items,
  ).toHaveLength(1);
}

async function authoritativeBytes(root: string): Promise<string> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(await readFile(path, "utf8"));
    }
  };
  await visit(root);
  return files.join("\n");
}

const focusedBehavior: Readonly<Record<string, () => void | Promise<void>>> = {
  "M15-SC-001": async () => {
    const { ledger, transaction } = await registeredScenario("sc-001");
    expect(await ledger.readHead()).toMatchObject({
      headGeneration: 1,
      committedRegistrationCount: 1,
      latestSubjectTransactionId: transaction.transactionId,
    });
  },
  "M15-SC-002": async () => {
    const { ledger, input, transaction } = await registeredScenario("sc-002");
    const head = await ledger.readHead();
    const retry = await ledger.registerVerifiedReadinessEvaluation(input);
    expect(retry).toMatchObject({ status: "idempotent-original-returned", transaction });
    expect(await ledger.readHead()).toEqual(head);
  },
  "M15-SC-003": async () => {
    const { ledger, input } = await registeredScenario("sc-003");
    const conflict = await ledger.registerVerifiedReadinessEvaluation({
      ...input,
      transactionId: "transaction-sc-003-conflict",
    });
    expect(conflict).toMatchObject({ status: "rejected", reason: "idempotency-key-conflict" });
  },
  "M15-SC-004": async () => {
    const { ledger, replay, replayInput } = await replayScenario("sc-004");
    const head = await ledger.readHead();
    expect(await ledger.submitReadinessReplayAttempt(replayInput)).toMatchObject({
      status: "idempotent-replay-returned",
      replayAppendStatus: "not-appended",
      replayAttempt: replay.replayAttempt,
    });
    expect(await ledger.readHead()).toEqual(head);
    expect(
      await ledger.submitReadinessReplayAttempt({
        ...replayInput,
        requestedReplayMarkerId: "replay-marker-sc-004-conflict",
      }),
    ).toMatchObject({ status: "not-recorded", reason: "replay-idempotency-key-conflict" });
    const coordinateCases = [
      ["replayIdempotencyKey", "replay-idempotency-key-conflict"],
      ["replayRequestId", "replay-request-id-conflict"],
      ["requestedReplayAttemptId", "replay-attempt-id-conflict"],
      ["requestedReplaySemanticEventId", "replay-semantic-event-id-conflict"],
      ["requestedReplayAuditEntryId", "replay-audit-entry-id-conflict"],
      ["requestedReplayMarkerId", "replay-marker-id-conflict"],
    ] as const;
    for (const [field, reason] of coordinateCases) {
      await replayCoordinateScenario(`sc-004-${field}`, field, reason);
    }
  },
  "M15-SC-005": async () => {
    const original = await replayScenario("sc-005");
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(original.runtimeRoot),
      createIfMissing: false,
    });
    expect(Object.values(M15_COMMITMENT_DOMAINS)).toHaveLength(21);
    expect(new Set(Object.values(M15_COMMITMENT_DOMAINS)).size).toBe(21);
    expect(await reopened.verifyIntegrity()).toMatchObject({
      status: "valid",
      verifiedRegistrationCount: 1,
      verifiedReplayAttemptCount: 1,
      verifiedTotalEventCount: 2,
      verifiedLastSequence: 2,
    });
  },
  "M15-SC-006": async () => {
    const { replay } = await replayScenario("sc-006", "2026-07-30T03:00:00.000Z");
    expect(replay.replayAttempt?.historicalComparison.historicalReconstructionStatus).toBe(
      "matched",
    );
    expect(replay.replayAttempt?.currentAdmissibility.currentAdmissibilityStatus).toBe(
      "authorization-expired",
    );
  },
  "M15-SC-007": () => authorizationOutcomeScenario("denied", "authorization-denied"),
  "M15-SC-008": () =>
    authorizationOutcomeScenario("review-required", "authorization-review-required"),
  "M15-SC-009": () => authorizationOutcomeScenario("not-evaluated", "authorization-not-evaluated"),
  "M15-SC-010": () =>
    authorizationOutcomeScenario("invalid-evidence", "authorization-invalid-evidence"),
  "M15-SC-011": async () => {
    const { replay, runtime } = await replayScenario("sc-011", "2026-07-30T01:45:00.000Z");
    expect(replay.replayAttempt?.originalEvaluationTime).toBe(runtime.input.evaluatedAt);
    expect(replay.replayAttempt?.replayEvaluatedAt).toBe("2026-07-30T01:45:00.000Z");
  },
  "M15-SC-012": () => {
    assertHistoricalComparison("mismatched", ["retainedEvidence.authorization.outcome"]);
    expect(() =>
      assertHistoricalComparison(
        "mismatched",
        Array.from({ length: 257 }, (_, index) => `field.path-${index}`),
      ),
    ).toThrow();
  },
  "M15-SC-013": () => historicalVerificationFailureScenario("sc-013", "configuration"),
  "M15-SC-014": () => historicalVerificationFailureScenario("sc-014", "delivery"),
  "M15-SC-015": () => historicalVerificationFailureScenario("sc-015", "invocation"),
  "M15-SC-016": async () => {
    const { ledger, runtimeRoot, replayInput } = await replayScenario("sc-016-before-corruption");
    await writeFile(join(runtimeRoot, "commit-head.json"), "{}", "utf8");
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    expect(await ledger.submitReadinessReplayAttempt(replayInput)).toMatchObject({
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      reason: "readiness-ledger-integrity-failure",
    });
  },
  "M15-SC-017": async () => {
    const deliveryRoot = await scenarioRoot("sc-017-delivery");
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
    const runtimeRoot = await scenarioRoot("sc-017-ledger");
    const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const headBefore = await ledger.readHead();
    const indexBefore = await readFile(join(runtimeRoot, "derived", "indexes.json"));
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-sc-017",
      replayRequestId: "replay-request-sc-017",
      requestedReplayAttemptId: "replay-attempt-sc-017",
      requestedReplaySemanticEventId: "replay-semantic-sc-017",
      requestedReplayAuditEntryId: "replay-audit-sc-017",
      requestedReplayMarkerId: "replay-marker-sc-017",
      originalTransactionId: "transaction-sc-017-missing",
      originalTransactionFingerprint: fingerprintA,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: scenarioConfiguration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: headBefore.ledgerHeadFingerprint,
    });
    expect(result).toEqual({
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      replayAttempt: null,
      reason: "original-transaction-not-found",
    });
    expect(ReadinessReplaySubmissionResultSchema.parse(result)).toEqual(result);
    expect(() =>
      ReadinessReplaySubmissionResultSchema.parse({ ...result, reason: "original-not-found" }),
    ).toThrow();
    expect(await ledger.readHead()).toEqual(headBefore);
    expect(await readFile(join(runtimeRoot, "derived", "indexes.json"))).toEqual(indexBefore);
    expect((await ledger.listReadinessReplayAttempts("transaction-sc-017-missing")).items).toEqual(
      [],
    );
  },
  "M15-SC-018": async () => {
    const { ledger, replayInput } = await replayScenario("sc-018-base");
    let accessed = 0;
    const hostile = { ...replayInput } as Record<string, unknown>;
    Object.defineProperty(hostile, "replayRequestId", {
      enumerable: true,
      get: () => {
        accessed += 1;
        return "hostile";
      },
    });
    expect(await ledger.submitReadinessReplayAttempt(hostile as never)).toMatchObject({
      status: "not-recorded",
      reason: "invalid-input",
    });
    expect(accessed).toBe(0);
  },
  "M15-SC-019": replayAppendFailureScenario,
  "M15-SC-020": async () => {
    const first = await replayScenario("sc-020");
    const candidate = {
      ...first.replayInput,
      replayIdempotencyKey: "replay-key-sc-020-candidate",
      replayRequestId: "replay-request-sc-020-candidate",
      requestedReplayAttemptId: "replay-attempt-sc-020-candidate",
      requestedReplaySemanticEventId: "replay-semantic-sc-020-candidate",
      requestedReplayAuditEntryId: "replay-audit-sc-020-candidate",
      requestedReplayMarkerId: "replay-marker-sc-020-candidate",
    };
    expect(await first.ledger.submitReadinessReplayAttempt(candidate)).toMatchObject({
      status: "not-recorded",
      reason: "stale-expected-head",
    });
  },
  "M15-SC-021": registrationFaultMatrixScenario,
  "M15-SC-022": replayFaultMatrixScenario,
  "M15-SC-023": async () => {
    const deliveryRoot = await scenarioRoot("sc-023-delivery");
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
    const runtimeRoot = await scenarioRoot("sc-023-ledger");
    const base = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const input = {
      contractVersion: "1.0" as const,
      registrationRequestId: "registration-sc-023",
      transactionId: "transaction-sc-023",
      idempotencyKey: "idempotency-sc-023",
      requestedOwnershipId: "ownership-sc-023",
      requestedRegistrationSemanticEventId: "semantic-sc-023",
      requestedRegistrationAuditEntryId: "audit-sc-023",
      requestedRegistrationMarkerId: "marker-sc-023",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: scenarioConfiguration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: (await base.readHead()).ledgerHeadFingerprint,
    };
    const faultStorage = await openLocalFileReadinessLedgerStorageForTesting(
      { ...storageOptions(runtimeRoot), createIfMissing: false },
      { event: "before-lock-release" },
    );
    expect(
      await createGovernedReadinessEvaluationLedger(
        faultStorage,
      ).registerVerifiedReadinessEvaluation(input),
    ).toMatchObject({ status: "committed" });
    expect((await base.verifyIntegrity()).status).toBe("valid");
    expect((await base.inspectWriterLock()).status).toBe("active");
    expect(
      await base.registerVerifiedReadinessEvaluation({ ...input, idempotencyKey: "other" }),
    ).toMatchObject({
      status: "rejected",
      reason: "operator-cleanup-required",
    });
    const activeInspection = await base.inspectWriterLock();
    if (activeInspection.lockFingerprint === null || activeInspection.writerProcessId === null) {
      throw new Error("active lock identity missing");
    }
    await expect(
      base.cleanupInactiveWriterLock({
        requestContractVersion: "1.0",
        lockFingerprint: activeInspection.lockFingerprint,
        writerProcessId: activeInspection.writerProcessId,
        writerActive: false,
      }),
    ).rejects.toMatchObject({ code: "operator-cleanup-required" });
    expect((await base.inspectWriterLock()).status).toBe("active");
  },
  "M15-SC-024": async () => {
    const original = await replayScenario("sc-024");
    const authority = await readIndependentMarkerBoundedAuthority(original.runtimeRoot);
    const consumeEveryGovernedLookup = async (ledger: typeof original.ledger) => {
      const results = new Map<string, unknown>();
      for (const mapping of authority.publicLookupMappings ?? []) {
        if (mapping.lookupClass === "readOriginalReadinessEvaluation") {
          results.set(
            mapping.lookupClass,
            await ledger.readOriginalReadinessEvaluation(mapping.key),
          );
        } else if (mapping.lookupClass === "listCommittedReadinessEvaluations") {
          results.set(
            mapping.lookupClass,
            (await ledger.listCommittedReadinessEvaluations()).items,
          );
        } else if (mapping.lookupClass === "listReadinessReplayAttempts") {
          results.set(
            mapping.lookupClass,
            (await ledger.listReadinessReplayAttempts(mapping.key)).items,
          );
        } else if (mapping.lookupClass === "readHead") {
          results.set(mapping.lookupClass, await ledger.readHead());
        } else {
          throw new Error(`unconsumed-public-lookup-class:${mapping.lookupClass}`);
        }
      }
      return results;
    };
    const expandedAuthority = authority as typeof authority & {
      readonly authoritativeFiles: readonly { readonly relativePath: string }[];
      readonly derivedMappingClasses: readonly string[];
      readonly verifiedGraphMutationCases: readonly string[];
    };
    expect(expandedAuthority).toHaveProperty("authoritativeFiles");
    expect(expandedAuthority.authoritativeFiles).toHaveLength(19);
    expect(
      expandedAuthority.authoritativeFiles.every(
        (file) => !file.relativePath.startsWith("derived/"),
      ),
    ).toBe(true);
    expect(expandedAuthority.derivedMappingClasses).toEqual(
      authority.expectedDerivedIndexes.map((index) => String(index.indexKind)).sort(),
    );
    expect(expandedAuthority.verifiedGraphMutationCases).toEqual([
      "component-schema-and-keyset",
      "complete-history-chain",
      "audit-event-subject",
      "ownership-and-transaction",
      "marker-shared-coordinate",
      "marker-category-component",
      "current-archive-identity",
    ]);
    expect(authority.registrations).toHaveLength(1);
    expect(authority.replays).toHaveLength(1);
    expect(Object.keys(authority.lookupMappings).sort()).toEqual([
      "adapter-id",
      "audit-entry-id",
      "decision-id",
      "head-fingerprint",
      "head-generation",
      "invocation-id",
      "marker-id",
      "ownership-id",
      "registration-idempotency-key",
      "registration-request-id",
      "replay-attempt-id",
      "replay-idempotency-key",
      "replay-request-id",
      "semantic-event-id",
      "transaction-id",
      "transaction-replay-sequence",
    ]);
    expect(authority.verifiedGraphBindings).toEqual([
      "component-schemas-and-keysets",
      "complete-history-chain",
      "audit-event-subject",
      "ownership-and-transaction",
      "marker-shared-coordinates",
      "marker-category-components",
      "current-archive-identity",
    ]);
    expect(authority.publicLookupMappings?.map((entry) => entry.lookupClass)).toEqual([
      "readOriginalReadinessEvaluation",
      "listCommittedReadinessEvaluations",
      "listReadinessReplayAttempts",
      "readHead",
    ]);
    const publicLookupResultsBefore = await consumeEveryGovernedLookup(original.ledger);
    expect(() =>
      verifyM15IndependentPublicLookupResults(
        authority.publicLookupMappings,
        publicLookupResultsBefore,
      ),
    ).not.toThrow();
    const authoritativeSnapshotBefore = structuredClone(authority.authoritativeFiles);
    const expectedHeadBefore = structuredClone(authority.expectedHead);
    const expectedCurrentMarkerBefore = structuredClone(authority.currentMarker);
    await unlink(join(original.runtimeRoot, "derived", "HEAD.json"));
    await unlink(join(original.runtimeRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(original.runtimeRoot),
      createIfMissing: false,
    });
    expect((await reopened.verifyIntegrity()).derivedIndexStatus).toBe("missing");
    expect(await reopened.rebuildDerivedIndexes()).toMatchObject({ status: "rebuilt" });
    const rebuiltIndexes = JSON.parse(
      await readFile(join(original.runtimeRoot, "derived", "indexes.json"), "utf8"),
    ) as readonly unknown[];
    expect(() =>
      verifyM15IndependentDerivedIndexes(rebuiltIndexes, authority.expectedDerivedIndexes),
    ).not.toThrow();
    const authorityAfter = await readIndependentMarkerBoundedAuthority(original.runtimeRoot);
    expect(authorityAfter.authoritativeFiles).toEqual(authoritativeSnapshotBefore);
    expect(authorityAfter.expectedHead).toEqual(expectedHeadBefore);
    expect(authorityAfter.currentMarker).toEqual(expectedCurrentMarkerBefore);
    const publicLookupResultsAfter = await consumeEveryGovernedLookup(reopened);
    expect(() =>
      verifyM15IndependentPublicLookupResults(
        authority.publicLookupMappings,
        publicLookupResultsAfter,
      ),
    ).not.toThrow();
    expect(publicLookupResultsAfter).toEqual(publicLookupResultsBefore);

    for (let index = 0; index < authority.expectedDerivedIndexes.length; index += 1) {
      const mutatedIndexes = structuredClone(authority.expectedDerivedIndexes) as Record<
        string,
        unknown
      >[];
      mutatedIndexes[index] = {
        ...mutatedIndexes[index],
        derivedIndexFingerprint: "0".repeat(64),
      };
      expect(
        () => verifyM15IndependentDerivedIndexes(rebuiltIndexes, mutatedIndexes),
        String(mutatedIndexes[index]?.indexKind),
      ).toThrow("derived-index-independent-proof-mismatch");
    }
    for (let index = 0; index < (authority.publicLookupMappings?.length ?? 0); index += 1) {
      const mutatedMappings = structuredClone([...(authority.publicLookupMappings ?? [])]);
      const mapping = mutatedMappings[index]!;
      const expectedValue = mapping.expectedValue;
      const mutatedValue = Array.isArray(expectedValue)
        ? expectedValue.map((entry, entryIndex) =>
            entryIndex === 0 && entry !== null && typeof entry === "object"
              ? { ...(entry as Record<string, unknown>), ledgerSequence: 999 }
              : entry,
          )
        : expectedValue !== null && typeof expectedValue === "object"
          ? { ...(expectedValue as Record<string, unknown>), controlledMutation: true }
          : "controlled-mutation";
      mutatedMappings[index] = { ...mapping, expectedValue: mutatedValue };
      expect(
        () => verifyM15IndependentPublicLookupResults(mutatedMappings, publicLookupResultsAfter),
        mapping.lookupClass,
      ).toThrow("public-lookup-independent-proof-mismatch");
    }

    const registrationEvent = structuredClone(authority.registrations[0]!) as Record<
      string,
      unknown
    >;
    const replayEvent = structuredClone(authority.replays[0]!) as Record<string, unknown>;
    const graphMutationCases = [
      {
        name: "component-schema-and-keyset",
        previousHead: authority.genesisHead,
        event: registrationEvent,
        mutate: (event: Record<string, unknown>) => {
          delete (event.transaction as Record<string, unknown>).registrationRequest;
        },
      },
      {
        name: "complete-history-chain",
        previousHead: authority.registrations[0]!.ledgerHead as Record<string, unknown>,
        event: replayEvent,
        mutate: (event: Record<string, unknown>) => {
          (event.completeHistory as Record<string, unknown>).previousCompleteHistoryFingerprint =
            fingerprintA;
        },
      },
      {
        name: "audit-event-subject",
        previousHead: authority.genesisHead,
        event: registrationEvent,
        mutate: (event: Record<string, unknown>) => {
          (event.auditEntry as Record<string, unknown>).subjectTransactionId = "controlled";
        },
      },
      {
        name: "ownership-and-transaction",
        previousHead: authority.genesisHead,
        event: registrationEvent,
        mutate: (event: Record<string, unknown>) => {
          (event.ownership as Record<string, unknown>).registrationRequestId = "controlled";
        },
      },
      {
        name: "marker-shared-coordinate",
        previousHead: authority.registrations[0]!.ledgerHead as Record<string, unknown>,
        event: replayEvent,
        mutate: (event: Record<string, unknown>) => {
          (event.commitMarker as Record<string, unknown>).auditEntryId = "controlled";
        },
      },
      {
        name: "marker-category-component",
        previousHead: authority.registrations[0]!.ledgerHead as Record<string, unknown>,
        event: replayEvent,
        mutate: (event: Record<string, unknown>) => {
          (event.commitMarker as Record<string, unknown>).replayRequestFingerprint = fingerprintA;
        },
      },
    ] as const;
    for (const mutation of graphMutationCases) {
      const candidate = structuredClone(mutation.event);
      mutation.mutate(candidate);
      expect(
        () => verifyM15IndependentAuthorityGraph(mutation.previousHead, candidate),
        mutation.name,
      ).toThrow();
    }
    const currentMarkerFile = authority.authoritativeFiles.find(
      (file) => file.relativePath === "commit-head.json",
    )!;
    const activeArchiveFile = authority.authoritativeFiles.find(
      (file) =>
        file.relativePath.endsWith("commit-marker.json") &&
        (file.value as Record<string, unknown>).commitMarkerFingerprint ===
          authority.currentMarker.commitMarkerFingerprint,
    )!;
    expect(() =>
      verifyM15IndependentCurrentArchiveIdentity(
        `${currentMarkerFile.bytes} `,
        activeArchiveFile.bytes,
      ),
    ).toThrow("current-marker-archive-mismatch");
    const contradictory = await registeredScenario("sc-024-coherent-contradiction");
    await writeCoherentlyResignedAuditCategoryContradiction(contradictory.runtimeRoot);
    await expect(readIndependentMarkerBoundedAuthority(contradictory.runtimeRoot)).rejects.toThrow(
      "audit-category-binding-invalid",
    );
  },
  "M15-SC-025": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-025");
    await unlink(join(runtimeRoot, "derived", "HEAD.json"));
    expect((await ledger.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect(JSON.parse(await readFile(join(runtimeRoot, "derived", "HEAD.json"), "utf8"))).toEqual(
      await ledger.readHead(),
    );
  },
  "M15-SC-026": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-026");
    const markerPath = join(runtimeRoot, "commit-head.json");
    const original = await readFile(markerPath, "utf8");
    await writeFile(
      markerPath,
      original.replace(/"headGeneration":1/u, '"headGeneration":2'),
      "utf8",
    );
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
  },
  "M15-SC-027": () => {
    expect(() =>
      ReadinessLedgerHeadSchema.parse({
        ...createReadinessGenesisCommitment().head,
        unknown: undefined,
      }),
    ).toThrow();
  },
  "M15-SC-028": () => {
    let invoked = 0;
    const candidate = structuredClone(createReadinessGenesisCommitment().head) as Record<
      string,
      unknown
    >;
    Object.defineProperty(candidate, "headGeneration", {
      enumerable: true,
      get: () => {
        invoked += 1;
        return 0;
      },
    });
    expect(() => ReadinessLedgerHeadSchema.parse(candidate)).toThrow();
    expect(invoked).toBe(0);
  },
  "M15-SC-029": () => {
    const candidate = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(candidate, createReadinessGenesisCommitment().head);
    expect(() => ReadinessLedgerHeadSchema.parse(candidate)).toThrow();
    expect(() => ReadinessLedgerHeadSchema.parse(() => undefined)).toThrow();
  },
  "M15-SC-030": async () => {
    const root = await scenarioRoot("sc-030");
    await expect(
      openLocalFileReadinessEvaluationLedger({
        runtimeRoot: join(repositoryRoot, "docs"),
        repositoryRoot,
        canonicalSourceRoots: [join(repositoryRoot, "docs")],
        createIfMissing: true,
      }),
    ).rejects.toBeTruthy();
    const target = join(root, "target");
    await symlink(target, join(root, "linked-root"));
    await expect(
      openLocalFileReadinessEvaluationLedger({
        runtimeRoot: join(root, "linked-root"),
        repositoryRoot,
        canonicalSourceRoots: [join(repositoryRoot, "docs")],
        createIfMissing: true,
      }),
    ).rejects.toBeTruthy();
  },
  "M15-SC-031": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-031");
    await writeFile(join(runtimeRoot, "commit-head.json"), "{}", "utf8");
    const result = await ledger.verifyIntegrity();
    expect(result.status).toBe("invalid");
    expect(JSON.stringify(result)).not.toContain(runtimeRoot);
  },
  "M15-SC-032": async () => {
    const { runtimeRoot } = await registeredScenario("sc-032");
    const bytes = await authoritativeBytes(runtimeRoot);
    expect(bytes).not.toContain("apiKey");
    expect(bytes).not.toContain("credentialValue");
    expect(bytes).not.toContain("execute:");
  },
  "M15-SC-033": async () => {
    const proof = await proveM15ProductionNoExecution({
      capability: "network",
      repositoryRoot,
      executeProductionScenario: async () =>
        (await registeredScenario("sc-033")).transaction.transactionId,
    });
    expect(proof.productionResult).toBe("transaction-sc-033");
    expect(proof.closure.entrypointRelativePaths).toEqual([
      "services/knowledge-engine/src/readiness-ledger.ts",
    ]);
    expect(proof.closure.moduleRelativePaths).toContain(
      "services/knowledge-engine/src/infrastructure/local-file-readiness-ledger.ts",
    );
    expect(proof.closure.moduleRelativePaths).not.toContain(
      "services/knowledge-engine/src/infrastructure/local-file-durable-snapshot-registry-internal.ts",
    );
    expect(
      proof.closure.moduleRelativePaths.some((path) => path.includes("/node_modules/zod/")),
    ).toBe(true);
    expect(proof.closure.edgeCount).toBeGreaterThan(0);
    expect(proof.closure.allowedCapabilityInventory.length).toBeGreaterThan(0);
    expect(
      proof.closure.allowedCapabilityInventory
        .filter((entry) => entry.startsWith("cryptographic-hashing|"))
        .every((entry) => entry.endsWith("|createHash")),
    ).toBe(true);
    expect(proof.forbiddenFindings).toEqual([]);
    expect(proof.runtime).toMatchObject({ networkCallCount: 0, providerCallCount: 0 });
    expect(proof.mutation.staticFindingKinds).toEqual([
      "network-global-eventsource",
      "network-global-fetch",
      "network-global-websocket",
      "network-module-import",
      "network-qualified-eventsource",
      "network-qualified-fetch",
      "network-qualified-websocket",
      "unapproved-crypto-capability",
    ]);
    expect(proof.mutation.runtimeErrorCode).toBe("m15-network-runtime-call:fetch");
    expect(proof.mutation.runtimeCallCount).toBe(1);
  },
  "M15-SC-034": async () => {
    const proof = await proveM15ProductionNoExecution({
      capability: "credential",
      repositoryRoot,
      executeProductionScenario: async () =>
        (await registeredScenario("sc-034")).transaction.transactionId,
    });
    expect(proof.productionResult).toBe("transaction-sc-034");
    expect(proof.closure.entrypointRelativePaths).toEqual([
      "services/knowledge-engine/src/readiness-ledger.ts",
    ]);
    expect(proof.closure.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      proof.closure.moduleRelativePaths.some((path) => path.includes("/node_modules/zod/")),
    ).toBe(true);
    expect(proof.forbiddenFindings).toEqual([]);
    expect(proof.runtime.environmentSecretReadCount).toBe(0);
    expect(proof.runtime.credentialResolutionCount).toBe(0);
    expect(proof.mutation.staticFindingKinds).toEqual([
      "authorization-header-construction",
      "credential-resolution",
      "environment-secret-read",
    ]);
    expect(proof.mutation.runtimeErrorCode).toBe(
      "m15-credential-runtime-call:authorization-header-construction|m15-credential-runtime-call:credential-resolution|m15-credential-runtime-call:environment-secret-read",
    );
    expect(proof.mutation.runtimeCallCount).toBe(9);
  },
  "M15-SC-035": async () => {
    const proof = await observeProductionBoundary("m15-predecessor.standalone-contract", () =>
      proveM15PredecessorGateContract(repositoryRoot),
    );
    expect(proof.command).toBe("pnpm verify:m15-predecessor");
    expect(proof.gateMode).toBe("standalone-after-ordinary-tests");
    const postVerifier = process.env.FOUNDEROS_M15_PREDECESSOR_EVIDENCE_PATH !== undefined;
    expect(proof.evidenceMode).toBe(
      postVerifier ? "post-verifier-attestation" : "ordinary-contract",
    );
    expect(proof.actualStandaloneEvidenceConsumed).toBe(postVerifier);
    expect(proof.nestedPredecessorInvocationCount).toBe(0);
    expect(proof.lines).toEqual(
      postVerifier
        ? [
            "predecessor-baseline-valid",
            "original-files=42",
            "original-tests=1038",
            "m14-provenance-tests=1",
            "executed-files=42",
            "executed-tests=1039",
          ]
        : [],
    );
    expect(proof.ordinaryTestCommand).not.toContain("verify:m15-predecessor");
    expect(proof.verificationChecklistRequiresSequentialGate).toBe(true);
    expect(proof.mutationErrorCodes).toEqual(
      postVerifier
        ? [
            "phase-b2-predecessor-evidence-missing",
            "phase-b2-predecessor-evidence-exit-rejected",
            "phase-b2-predecessor-summary-rejected",
            "phase-b2-predecessor-evidence-candidate-rejected",
            "phase-b2-predecessor-evidence-shape-rejected",
          ]
        : [],
    );
  },
  "M15-SC-036": async () => {
    const { replay } = await replayScenario("sc-036");
    expect(replay).toMatchObject({ status: "recorded", replayAppendStatus: "appended" });
  },
  "M15-SC-037": () =>
    registrationCoordinateScenario(
      "sc-037",
      "registrationRequestId",
      "registration-request-id-conflict",
    ),
  "M15-SC-038": () =>
    registrationCoordinateScenario("sc-038", "transactionId", "transaction-id-conflict"),
  "M15-SC-039": async () => {
    const { ledger, runtime, input } = await registeredScenario("sc-039");
    const candidate = {
      ...input,
      registrationRequestId: "registration-sc-039-candidate",
      transactionId: "transaction-sc-039-candidate",
      idempotencyKey: "idempotency-sc-039-candidate",
      requestedOwnershipId: "ownership-sc-039-candidate",
      requestedRegistrationSemanticEventId: "semantic-sc-039-candidate",
      requestedRegistrationAuditEntryId: "audit-sc-039-candidate",
      requestedRegistrationMarkerId: "marker-sc-039-candidate",
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    };
    expect(await ledger.registerVerifiedReadinessEvaluation(candidate)).toMatchObject({
      status: "rejected",
      reason: "decision-id-conflict",
    });
  },
  "M15-SC-040": async () => {
    const { transaction } = await registeredScenario("sc-040");
    const mutations: readonly ((candidate: Record<string, unknown>) => void)[] = [
      (candidate) => Object.assign(candidate, { registrationRequestFingerprint: fingerprintA }),
      (candidate) => Object.assign(candidate, { ownershipFingerprint: fingerprintA }),
      (candidate) => Object.assign(candidate, { adapterId: "adapter-substituted" }),
      (candidate) => Object.assign(candidate, { providerCapabilityFingerprint: fingerprintA }),
      (candidate) => Object.assign(candidate, { credentialReferenceFingerprint: fingerprintA }),
      (candidate) => Object.assign(candidate, { transportPolicyFingerprint: fingerprintA }),
      (candidate) =>
        Object.assign(candidate.registrationRequest as object, {
          transactionId: "transaction-substituted",
        }),
      (candidate) =>
        Object.assign(candidate.ownership as object, { transactionId: "transaction-substituted" }),
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(transaction) as unknown as Record<string, unknown>;
      mutate(candidate);
      expect(() => verifyCommittedReadinessTransaction(candidate)).toThrow();
    }
  },
  "M15-SC-041": async () => {
    const { transaction } = await registeredScenario("sc-041");
    for (const member of Object.keys(transaction)) {
      const candidate = structuredClone(transaction) as unknown as Record<string, unknown>;
      delete candidate[member];
      expect(() => verifyCommittedReadinessTransaction(candidate), member).toThrow();
    }
  },
  "M15-SC-042": async () => {
    const { transaction } = await registeredScenario("sc-042");
    const { evaluationPackageFingerprint: _fingerprint, ...unsigned } =
      transaction.evaluationPackage;
    void _fingerprint;
    for (let index = 0; index < unsigned.gateTrace.length - 1; index += 1) {
      const gateTrace = structuredClone(unsigned.gateTrace);
      [gateTrace[index], gateTrace[index + 1]] = [gateTrace[index + 1]!, gateTrace[index]!];
      const candidate = createCanonicalReadinessEvaluationPackage({ ...unsigned, gateTrace });
      expect(() => verifyCanonicalReadinessEvaluationPackage(candidate), `swap-${index}`).toThrow();
    }
  },
  "M15-SC-043": async () => {
    const { transaction } = await registeredScenario("sc-043");
    const unsigned = { ...transaction.evaluationPackage };
    delete (unsigned as Partial<typeof unsigned>).evaluationPackageFingerprint;
    const mutations: readonly ((projection: Record<string, unknown>) => void)[] = [
      (projection) => {
        delete projection.authorization;
      },
      (projection) => Object.assign(projection, { endpoint: "sentinel" }),
      (projection) => Object.assign(projection, { Authorization: null }),
      (projection) => Object.assign(projection, { authorizatiоn: null }),
      (projection) =>
        Object.assign(projection.authorization as object, { authorizationHeader: "sentinel" }),
      (projection) => Object.assign(projection.transportPlan as object, { endpoint: "sentinel" }),
    ];
    for (const mutate of mutations) {
      const retainedEvidence = structuredClone(unsigned.retainedEvidence) as unknown as Record<
        string,
        unknown
      >;
      mutate(retainedEvidence);
      expect(() =>
        createCanonicalReadinessEvaluationPackage({ ...unsigned, retainedEvidence }),
      ).toThrow();
    }
  },
  "M15-SC-044": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-044");
    await writeFile(join(runtimeRoot, "derived", "indexes.json"), "{}", "utf8");
    expect((await ledger.verifyIntegrity()).derivedIndexStatus).toBe("invalid");
    expect((await ledger.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect((await ledger.verifyIntegrity()).derivedIndexStatus).toBe("valid");
  },
  "M15-SC-045": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-045");
    await unlink(join(runtimeRoot, "derived", "indexes.json"));
    expect((await ledger.verifyIntegrity()).derivedIndexStatus).toBe("missing");
    expect((await ledger.rebuildDerivedIndexes()).status).toBe("rebuilt");
  },
  "M15-SC-046": async () => {
    for (const variant of ["missing", "divergent"] as const) {
      const { ledger, runtimeRoot } = await registeredScenario(`sc-046-${variant}`);
      const registrationRoot = join(runtimeRoot, "events", "registrations");
      const [event] = await readdir(registrationRoot);
      if (event === undefined) throw new Error("registration archive missing");
      const archive = join(registrationRoot, event, "commit-marker.json");
      if (variant === "missing") await unlink(archive);
      else await writeFile(archive, "{}", "utf8");
      expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    }
  },
  "M15-SC-047": async () => {
    const first = await replayScenario("sc-047-first");
    const head = await first.ledger.readHead();
    const secondInput = {
      ...first.replayInput,
      replayIdempotencyKey: "replay-key-sc-047-second",
      replayRequestId: "replay-request-sc-047-second",
      requestedReplayAttemptId: "replay-attempt-sc-047-second",
      requestedReplaySemanticEventId: "replay-semantic-sc-047-second",
      requestedReplayAuditEntryId: "replay-audit-sc-047-second",
      requestedReplayMarkerId: "replay-marker-sc-047-second",
      expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
    };
    expect((await first.ledger.submitReadinessReplayAttempt(secondInput)).status).toBe("recorded");
    const after = await first.ledger.readHead();
    expect(await first.ledger.submitReadinessReplayAttempt(first.replayInput)).toMatchObject({
      status: "idempotent-replay-returned",
      replayAttempt: first.replay.replayAttempt,
    });
    expect(await first.ledger.readHead()).toEqual(after);
  },
  "M15-SC-048": async () => {
    const { ledger, runtimeRoot } = await registeredScenario("sc-048");
    const marker = join(runtimeRoot, "commit-head.json");
    const moved = join(runtimeRoot, "commit-head-moved.json");
    const bytes = await readFile(marker, "utf8");
    await unlink(marker);
    await writeFile(moved, bytes, "utf8");
    await symlink(moved, marker);
    const result = await ledger.verifyIntegrity();
    expect(result.status).toBe("invalid");
    expect(JSON.stringify(result)).not.toContain(runtimeRoot);
  },
  "M15-SC-049": async () => {
    const proof = await observeProductionBoundary("m15-preflight.real-git-matrix", () =>
      proveM15RealGitPreflight(repositoryRoot),
    );
    expect(proof.positiveStatus).toBe(0);
    expect(proof.invalidCaseCount).toBe(30);
    expect(proof.exactReasons).toHaveLength(30);
    expect(proof.mutationFreeCount).toBe(31);
    expect(proof.localBareRemoteCount).toBe(1);
    expect(proof.exactReasons).toContain(
      "authorization-runtime-predecessor-malformed:preflight-runtime-predecessor-sha-malformed",
    );
    expect(proof.exactReasons).toContain(
      "unstaged-runtime:preflight-unstaged-runtime-work-rejected",
    );
    expect(proof.exactReasons.every((entry) => !entry.includes("/private/"))).toBe(true);
  },
  "M15-SC-050": async () => {
    const proof = await observeProductionBoundary("m15-documentation.structured-lint", () =>
      proveM15StructuredDocumentation(repositoryRoot),
    );
    expect(proof.documents).toBe(13);
    expect(proof.requirements).toBe(29);
    expect(proof.acceptanceCriteria).toBe(29);
    expect(proof.scenarios).toBe(72);
    expect(proof.indexedDocuments).toBe(13);
    expect(proof.verificationCommands).toBe(6);
    expect(proof.mutationFailures).toHaveLength(52);
    expect(proof.mutationFailures.map((entry) => entry.split(":")[0])).toEqual([
      "inventory",
      "relative-link",
      "adr",
      "candidate-status",
      "version",
      "index",
      "command-missing",
      "command-extra",
      "command-duplicate",
      "command-malformed",
      "requirements",
      "acceptance",
      "scenarios",
      "predecessor-counts-stale",
      "scenario-count-stale",
      "predecessor-fingerprint-stale",
      "document-status-stale",
      "publication-authorized",
      "release-authorized",
      "deployment-complete",
      "push-complete",
      "pr-merged",
      "candidate-committed",
      "candidate-pushed",
      "pull-request-merged",
      "candidate-published",
      "implementation-released",
      "service-deployed",
      "noun-status-colon-commit",
      "noun-status-dash-push",
      "noun-status-colon-pr-merge",
      "noun-status-colon-publication",
      "noun-status-dash-release",
      "noun-status-colon-deployment",
      "perfect-adverb-candidate-committed",
      "perfect-adverb-branch-pushed",
      "got-passive-pr-merged",
      "perfect-adverb-build-published",
      "milestone-subject-released",
      "app-subject-deployed",
      "authority-to-candidate-commit",
      "authority-to-branch-push",
      "authority-to-pr-merge",
      "authority-to-build-publish",
      "authority-for-package-release",
      "authority-to-service-deploy",
      "active-i-committed",
      "active-maintainers-pushed",
      "active-release-engineering-published",
      "active-operators-released",
      "active-maintainer-deployed",
      "ordinary-content-mutation",
    ]);
    expect(new Set(proof.mutationFailures).size).toBe(52);
    const mutationReasons = new Map(
      proof.mutationFailures.map((entry) => {
        const separator = entry.indexOf(":");
        return [entry.slice(0, separator), entry.slice(separator + 1)] as const;
      }),
    );
    const structuralMutationReasons = new Map([
      ["inventory", "phase-b2-document-inventory-rejected"],
      ["relative-link", "phase-b2-relative-link-rejected"],
      ["adr", "phase-b2-adr-status-rejected"],
      ["candidate-status", "phase-b2-candidate-status-rejected"],
      ["version", "phase-b2-document-version-rejected"],
      ["index", "phase-b2-documentation-index-rejected"],
      ["command-missing", "phase-b2-verification-command-inventory-rejected"],
      ["command-extra", "phase-b2-verification-command-inventory-rejected"],
      ["command-duplicate", "phase-b2-verification-command-inventory-rejected"],
      ["command-malformed", "phase-b2-verification-command-inventory-rejected"],
      ["requirements", "phase-b2-traceability-rejected:requirement-cardinality-invalid"],
      ["acceptance", "phase-b2-traceability-rejected:acceptance-missing"],
      ["scenarios", "phase-b2-traceability-rejected:scenario-gap-or-order-invalid"],
      ["predecessor-counts-stale", "phase-b2-verification-count-rejected"],
      ["scenario-count-stale", "phase-b2-scenario-count-rejected"],
      ["predecessor-fingerprint-stale", "phase-b2-runtime-predecessor-evidence-rejected"],
      ["document-status-stale", "phase-b2-document-status-rejected"],
    ]);
    const frozenContentMutations = proof.mutationFailures
      .map((entry) => entry.slice(0, entry.indexOf(":")))
      .filter((name) => !structuralMutationReasons.has(name));
    expect(
      proof.mutationFailures.every((entry) => entry.includes("phase-b2-")) &&
        [...structuralMutationReasons].every(
          ([name, reason]) => mutationReasons.get(name) === reason,
        ) &&
        frozenContentMutations.length === 35 &&
        frozenContentMutations.every(
          (name) => mutationReasons.get(name) === "phase-b2-document-fingerprint-rejected",
        ),
    ).toBe(true);
    expect(proof.mutationFailures.some((entry) => entry.startsWith("relative-link:"))).toBe(true);
    expect(proof.mutationFailures.some((entry) => entry.startsWith("release-authorized:"))).toBe(
      true,
    );
  },
  "M15-SC-051": async () => {
    const registered = await registeredScenario("sc-051");
    const head = await registered.ledger.readHead();
    const make = (suffix: string) => ({
      replayContractVersion: "1.0" as const,
      replayIdempotencyKey: `replay-key-sc-051-${suffix}`,
      replayRequestId: `replay-request-sc-051-${suffix}`,
      requestedReplayAttemptId: `replay-attempt-sc-051-${suffix}`,
      requestedReplaySemanticEventId: `replay-semantic-sc-051-${suffix}`,
      requestedReplayAuditEntryId: `replay-audit-sc-051-${suffix}`,
      requestedReplayMarkerId: `replay-marker-sc-051-${suffix}`,
      originalTransactionId: registered.transaction.transactionId,
      originalTransactionFingerprint: registered.transaction.transactionFingerprint,
      deliveryLedger: registered.runtime.input.deliveryLedger,
      deliveryIdentity: registered.runtime.input.deliveryIdentity,
      readinessInput: registered.runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: registered.runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: scenarioConfiguration(registered.runtime),
      originalEvaluationTime: registered.runtime.input.evaluatedAt,
      replayEvaluatedAt: "2026-07-30T01:30:00.000Z",
      recordedAt: "2026-07-30T01:30:00.000Z",
      expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
    });
    const results = await Promise.all([
      registered.ledger.submitReadinessReplayAttempt(make("a")),
      registered.ledger.submitReadinessReplayAttempt(make("b")),
    ]);
    expect(results.filter((result) => result.status === "recorded")).toHaveLength(1);
    expect(results.filter((result) => result.status === "not-recorded")).toHaveLength(1);
  },
  "M15-SC-052": async () => {
    const schemaPackage = JSON.parse(
      await readFile(join(repositoryRoot, "packages", "knowledge-schema", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const enginePackage = JSON.parse(
      await readFile(join(repositoryRoot, "services", "knowledge-engine", "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      exports?: Record<string, { readonly types?: string; readonly import?: string }>;
    };
    expect(schemaPackage.dependencies?.["@founderos/knowledge-engine"]).toBeUndefined();
    expect(enginePackage.dependencies?.["@founderos/knowledge-schema"]).toBe("workspace:*");
    const publicIndex = await readFile(engineIndexPath, "utf8");
    expect(publicIndex).not.toContain("openLocalFileReadinessEvaluationLedger");
    expect(publicIndex).not.toContain("createGovernedReadinessEvaluationLedger");
    expect(enginePackage).toMatchObject({
      exports: {
        "./readiness-ledger": {
          types: "./dist/readiness-ledger.d.ts",
          import: "./dist/readiness-ledger.js",
        },
      },
    });
    const dedicatedEntrypointSource = await readFile(
      join(repositoryRoot, "services", "knowledge-engine", "src", "readiness-ledger.ts"),
      "utf8",
    );
    expect(dedicatedEntrypointSource).not.toContain('from "./index.js"');
    const dedicatedApi = await import("../src/readiness-ledger.js");
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
  },
  "M15-SC-053": async () => {
    const publicApi = (await observeProductionBoundary(
      "knowledge-engine.public-import",
      () => import("../src/index.js"),
    )) as Record<string, unknown>;
    expect(publicApi).not.toHaveProperty("createGovernedReadinessEvaluationLedger");
    expect(publicApi).not.toHaveProperty("openLocalFileReadinessLedgerStorageForTesting");
  },
  "M15-SC-054": async () => {
    const root = await scenarioRoot("sc-054-processes");
    const firstOutput = join(root, "first-genesis.json");
    const secondOutput = join(root, "second-genesis.json");
    const vitest = join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
    const runCleanProcess = (output: string) =>
      execFileAsync(
        process.execPath,
        [vitest, "run", "tests/support/genesis-clean-process.test.ts", "--maxWorkers=1"],
        {
          cwd: join(repositoryRoot, "services", "knowledge-engine"),
          env: { ...process.env, FOUNDEROS_M15_GENESIS_OUTPUT: output },
        },
      );
    const [firstProcess, secondProcess] = await Promise.all([
      runCleanProcess(firstOutput),
      runCleanProcess(secondOutput),
    ]);
    expect(firstProcess.stderr).toBe("");
    expect(secondProcess.stderr).toBe("");
    const first = await readFile(firstOutput, "utf8");
    const second = await readFile(secondOutput, "utf8");
    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual({
      completeHistory: createReadinessGenesisCommitment().completeHistory,
      head: createReadinessGenesisCommitment().head,
      marker: createReadinessGenesisCommitment().marker,
    });
  },
  "M15-SC-055": async () => {
    for (const fault of GENESIS_FAULTS) {
      const runtimeRoot = await scenarioRoot(`sc-055-${fault}`);
      await expect(
        openLocalFileReadinessLedgerStorageForTesting(storageOptions(runtimeRoot), {
          genesis: fault,
        }),
      ).rejects.toBeTruthy();
      const reopened = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      expect((await reopened.recover()).committedRegistrationCount).toBe(0);
    }
  },
  "M15-SC-056": async () => {
    for (const variant of [
      "missing-archive",
      "missing-current",
      "extra-genesis-entry",
      "invalid-fingerprint",
      "invalid-utf8",
    ] as const) {
      const runtimeRoot = await scenarioRoot(`sc-056-${variant}`);
      const ledger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
      const current = join(runtimeRoot, "commit-head.json");
      const genesisDirectory = join(runtimeRoot, "events", "genesis");
      const archive = join(genesisDirectory, "commit-marker.json");
      if (variant === "missing-archive") await unlink(archive);
      if (variant === "missing-current") await unlink(current);
      if (variant === "extra-genesis-entry") {
        await writeFile(join(genesisDirectory, "duplicate-marker.json"), "{}", "utf8");
      }
      if (variant === "invalid-fingerprint") {
        const mutated = (await readFile(current, "utf8")).replace(
          /"commitMarkerFingerprint":"[a-f0-9]{64}"/u,
          `"commitMarkerFingerprint":"${"0".repeat(64)}"`,
        );
        await writeFile(current, mutated, "utf8");
        await writeFile(archive, mutated, "utf8");
      }
      if (variant === "invalid-utf8") {
        await writeFile(current, Buffer.from([0xff, 0xfe, 0x00]));
      }
      expect((await ledger.recover()).status).toBe("failed");
    }
  },
  "M15-SC-057": async () => {
    const { ledger, input, transaction } = await registeredScenario("sc-057");
    const committedHead = await ledger.readHead();
    expect(committedHead).toMatchObject({
      headGeneration: 1,
      totalAuthoritativeEventCount: 1,
      lastCommittedLedgerSequence: 1,
    });
    expect(await ledger.registerVerifiedReadinessEvaluation(input)).toMatchObject({
      status: "idempotent-original-returned",
      transaction,
    });
    expect(await ledger.readHead()).toEqual(committedHead);
  },
  "M15-SC-058": async () => {
    const runtimeRoot = await scenarioRoot("sc-058");
    await expect(
      openLocalFileReadinessLedgerStorageForTesting(storageOptions(runtimeRoot), {
        genesis: "after-genesis-archive",
      }),
    ).rejects.toBeTruthy();
    const archivePath = join(runtimeRoot, "events", "genesis", "commit-marker.json");
    const currentPath = join(runtimeRoot, "commit-head.json");
    const archiveOnly = await readFile(archivePath, "utf8");
    await expect(readFile(currentPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      openLocalFileReadinessEvaluationLedger({
        ...storageOptions(runtimeRoot),
        createIfMissing: false,
      }),
    ).rejects.toBeTruthy();
    const activated = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    expect((await activated.readHead()).headGeneration).toBe(0);
    expect(await readFile(currentPath, "utf8")).toBe(archiveOnly);
    expect(await readFile(archivePath, "utf8")).toBe(archiveOnly);
  },
  "M15-SC-059": async () => {
    const runtimeRoot = await scenarioRoot("sc-059-genesis");
    const genesisLedger = await openLocalFileReadinessEvaluationLedger(storageOptions(runtimeRoot));
    const genesisAuthority = await readIndependentMarkerBoundedAuthority(runtimeRoot);
    expect(await genesisLedger.readHead()).toEqual(genesisAuthority.genesisHead);
    expect(genesisAuthority.currentMarker.markerCategory).toBe("genesis");
    const registered = await registeredScenario("sc-059");
    const registrationAuthority = await readIndependentMarkerBoundedAuthority(
      registered.runtimeRoot,
    );
    const registrationHead = await registered.ledger.readHead();
    expect(registrationHead).toEqual(registrationAuthority.expectedHead);
    expect(registrationAuthority.currentMarker.markerCategory).toBe("registration");
    const replayed = await replayScenario("sc-059-replay");
    const replayAuthority = await readIndependentMarkerBoundedAuthority(replayed.runtimeRoot);
    const replayHead = await replayed.ledger.readHead();
    expect(replayHead).toEqual(replayAuthority.expectedHead);
    expect(replayAuthority.currentMarker.markerCategory).toBe("replay");
    for (const [field, value] of Object.entries(replayAuthority.expectedHead)) {
      const mutated = {
        ...replayAuthority.expectedHead,
        [field]: typeof value === "number" ? value + 1 : value === null ? "mutated" : fingerprintA,
      };
      expect(replayHead).not.toEqual(mutated);
    }
    expect({ ...replayAuthority.currentMarker, markerCategory: "registration" }).not.toEqual(
      replayAuthority.currentMarker,
    );
    expect(replayAuthority.verifiedGraphBindings).toContain("marker-category-components");
  },
  "M15-SC-060": async () => {
    const genesis = createReadinessGenesisCommitment().head;
    const eventHead = (await registeredScenario("sc-060")).ledger.readHead();
    const invalid = [
      { ...genesis, unknown: true },
      { ...genesis, latestAuditEntryId: undefined },
      { ...genesis, latestAuditEntryId: "audit-invalid" },
      { ...eventHead, latestAuditEntryId: null },
      { ...eventHead, latestSubjectTransactionFingerprint: null },
    ];
    for (const candidate of invalid) {
      expect(() => ReadinessLedgerHeadSchema.parse(candidate)).toThrow();
    }
  },
  "M15-SC-061": async () => {
    for (const field of [
      "latestAuditEntryId",
      "latestAuditEntryFingerprint",
      "latestSemanticEventId",
      "latestSemanticEventFingerprint",
      "latestSubjectTransactionId",
      "latestSubjectTransactionFingerprint",
    ] as const) {
      const { ledger, runtimeRoot } = await registeredScenario(`sc-061-${field}`);
      const markerPath = join(runtimeRoot, "commit-head.json");
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
        resultingLedgerHead: Record<string, unknown>;
      };
      marker.resultingLedgerHead[field] = field.endsWith("Fingerprint")
        ? fingerprintA
        : `${field}-substituted`;
      await writeFile(markerPath, JSON.stringify(marker), "utf8");
      expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    }
  },
  "M15-SC-062": async () => {
    const { ledger, runtimeRoot } = await replayScenario("sc-062");
    const marker = JSON.parse(await readFile(join(runtimeRoot, "commit-head.json"), "utf8")) as {
      resultingLedgerHead: unknown;
    };
    expect(JSON.parse(await readFile(join(runtimeRoot, "derived", "HEAD.json"), "utf8"))).toEqual(
      marker.resultingLedgerHead,
    );
    expect(await ledger.readHead()).toEqual(marker.resultingLedgerHead);
  },
  "M15-SC-063": async () => {
    const original = await registeredScenario("sc-063");
    await unlink(join(original.runtimeRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(original.runtimeRoot),
      createIfMissing: false,
    });
    expect(await reopened.registerVerifiedReadinessEvaluation(original.input)).toMatchObject({
      status: "idempotent-original-returned",
      transaction: original.transaction,
    });
    expect(
      await reopened.registerVerifiedReadinessEvaluation({
        ...original.input,
        registrationRequestId: "registration-sc-063-candidate",
        transactionId: "transaction-sc-063-candidate",
        idempotencyKey: "idempotency-sc-063-candidate",
        requestedOwnershipId: original.input.requestedOwnershipId,
        requestedRegistrationSemanticEventId: "semantic-sc-063-candidate",
        requestedRegistrationAuditEntryId: "audit-sc-063-candidate",
        requestedRegistrationMarkerId: "marker-sc-063-candidate",
        readinessInput: {
          ...original.runtime.input,
          readinessDecisionId: "readiness-sc-063-candidate",
        },
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: original.runtime.transportPolicyAuthority,
        }),
        expectedLedgerHeadFingerprint: (await reopened.readHead()).ledgerHeadFingerprint,
      }),
    ).toMatchObject({ status: "rejected", reason: "ownership-id-conflict" });
  },
  "M15-SC-064": () =>
    registrationCoordinateScenario(
      "sc-064",
      "requestedRegistrationSemanticEventId",
      "registration-semantic-event-id-conflict",
    ),
  "M15-SC-065": () =>
    registrationCoordinateScenario(
      "sc-065",
      "requestedRegistrationAuditEntryId",
      "registration-audit-entry-id-conflict",
    ),
  "M15-SC-066": () =>
    registrationCoordinateScenario(
      "sc-066",
      "requestedRegistrationMarkerId",
      "registration-marker-id-conflict",
    ),
  "M15-SC-067": async () => {
    const cases = [
      ["registrationRequestId", "registration-request-id-conflict"],
      ["transactionId", "transaction-id-conflict"],
      ["requestedOwnershipId", "ownership-id-conflict"],
      ["requestedRegistrationSemanticEventId", "registration-semantic-event-id-conflict"],
      ["requestedRegistrationAuditEntryId", "registration-audit-entry-id-conflict"],
      ["requestedRegistrationMarkerId", "registration-marker-id-conflict"],
    ] as const;
    for (const [field, reason] of cases) {
      await registrationCoordinateScenario(`sc-067-${field}`, field, reason);
    }
    await focusedBehavior["M15-SC-039"]!();
  },
  "M15-SC-068": async () => {
    for (const field of [
      "registrationRequestId",
      "transactionId",
      "requestedOwnershipId",
      "requestedRegistrationSemanticEventId",
      "requestedRegistrationAuditEntryId",
      "requestedRegistrationMarkerId",
    ] as const) {
      const { ledger, input } = await registeredScenario(`sc-068-${field}`);
      expect(
        await ledger.registerVerifiedReadinessEvaluation({
          ...input,
          [field]: `${field}-changed`,
        }),
      ).toMatchObject({ status: "rejected", reason: "idempotency-key-conflict" });
    }
  },
  "M15-SC-069": async () => {
    const original = await registeredScenario("sc-069");
    const expectedHead = await original.ledger.readHead();
    const expectedTransactions = await original.ledger.listCommittedReadinessEvaluations();
    await unlink(join(original.runtimeRoot, "derived", "HEAD.json"));
    await unlink(join(original.runtimeRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...storageOptions(original.runtimeRoot),
      createIfMissing: false,
    });
    expect((await reopened.verifyIntegrity()).derivedIndexStatus).toBe("missing");
    expect(await reopened.registerVerifiedReadinessEvaluation(original.input)).toMatchObject({
      status: "idempotent-original-returned",
      transaction: original.transaction,
    });
    expect(await reopened.readHead()).toEqual(expectedHead);
    expect(await reopened.listCommittedReadinessEvaluations()).toEqual(expectedTransactions);
    expect((await reopened.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect(await reopened.listCommittedReadinessEvaluations()).toEqual(expectedTransactions);
  },
  "M15-SC-070": async () => {
    const original = await replayScenario("sc-070");
    expect(await original.ledger.submitReadinessReplayAttempt(original.replayInput)).toMatchObject({
      status: "idempotent-replay-returned",
      replayAttempt: original.replay.replayAttempt,
    });
    expect(
      await original.ledger.submitReadinessReplayAttempt({
        ...original.replayInput,
        requestedReplayMarkerId: "replay-marker-sc-070-conflict",
      }),
    ).toMatchObject({ status: "not-recorded", reason: "replay-idempotency-key-conflict" });
  },
  "M15-SC-071": async () => {
    const { runtimeRoot } = await replayScenario("sc-071");
    const stagingRuntimeRoot = await registrationArtifactFaultFixture(
      "sc-071-staging",
      "after-ownership-staging",
    );
    const installedUncommittedRuntimeRoot = await registrationArtifactFaultFixture(
      "sc-071-installed-uncommitted",
      "after-transaction-install",
    );
    const temporaryMarkerRuntimeRoot = await registrationArtifactFaultFixture(
      "sc-071-temporary-marker",
      "during-marker-write",
    );
    const temporaryDerivedRuntimeRoot = await registrationArtifactFaultFixture(
      "sc-071-temporary-derived",
      "during-derived-index",
    );
    const writerLockRuntimeRoot = await registrationArtifactFaultFixture(
      "sc-071-writer-lock",
      "before-lock-release",
    );
    const initializationLock = await realInitializationLockFixture("sc-071");
    const stagedEnvelope = (
      await readdir(join(stagingRuntimeRoot, "staging"), { withFileTypes: true })
    ).find((entry) => entry.isDirectory());
    if (stagedEnvelope === undefined) throw new Error("staging-artifact-fixture-missing");
    const quarantineDirectory = join(runtimeRoot, "quarantine", "sc-071-orphan");
    await mkdir(quarantineDirectory, { recursive: true });
    await writeFile(
      join(quarantineDirectory, "metadata.json"),
      JSON.stringify({
        classification: "installed-uncommitted-orphan",
        logicalCoordinate: "sc-071",
      }),
      "utf8",
    );
    await writeFile(
      join(quarantineDirectory, "material.json"),
      await rawReadFile(
        join(stagingRuntimeRoot, "staging", stagedEnvelope.name, "transaction.json"),
        "utf8",
      ),
      "utf8",
    );
    const privacyPolicyPath = join(
      repositoryRoot,
      "docs/milestones/milestone-15/FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md",
    );
    const adapterSpecificationPath = join(
      repositoryRoot,
      "docs/milestones/milestone-15/FounderOS_Local_File_Readiness_Ledger_Adapter_Specification_v1.0.md",
    );
    const runtimeRoots = [
      runtimeRoot,
      stagingRuntimeRoot,
      installedUncommittedRuntimeRoot,
      temporaryMarkerRuntimeRoot,
      temporaryDerivedRuntimeRoot,
      writerLockRuntimeRoot,
    ];
    expect(await readFile(privacyPolicyPath, "utf8")).toContain("Evidence Durability Inventory");
    const inspection = await inspectM15ArtifactPrivacy({
      runtimeRoot,
      runtimeRoots,
      repositoryRoot,
      artifactClasses: M15_TASK_1_ARTIFACT_CLASSES,
      privacyPolicyPath,
      adapterSpecificationPath,
      initializationLockPath: initializationLock.lockPath,
    });
    expect(inspection.inventoriedClasses).toEqual(M15_TASK_1_ARTIFACT_CLASSES);
    expect(inspection.inspectedDurableFiles.length).toBeGreaterThan(20);
    expect(inspection.productionObservabilityPersistenceSinkCount).toBe(0);
    expect(inspection.contractArtifactClasses).toEqual(inspection.discoveredArtifactClasses);
    expect(inspection.instantiatedArtifactClasses).toEqual(inspection.byteInspectedArtifactClasses);
    for (const requiredClass of [
      "transitional-staging",
      "transitional-installed-uncommitted-orphans",
      "transitional-temporary-marker-material",
      "transitional-temporary-derived-material",
      "operational-writer-lock",
      "operational-initialization-lock",
      "operational-quarantine-metadata",
      "operational-quarantine-material",
    ]) {
      expect(inspection.contractArtifactClasses, requiredClass).toContain(requiredClass);
      expect(inspection.instantiatedArtifactClasses, requiredClass).toContain(requiredClass);
      expect(inspection.byteInspectedArtifactClasses, requiredClass).toContain(requiredClass);
    }
    await expect(
      inspectM15ArtifactPrivacy({
        runtimeRoot,
        repositoryRoot,
        artifactClasses: M15_TASK_1_ARTIFACT_CLASSES.slice(1),
      }),
    ).rejects.toThrow("artifact-inventory-incomplete");
    await expect(
      inspectM15ArtifactPrivacy({
        runtimeRoot,
        repositoryRoot,
        artifactClasses: M15_TASK_1_ARTIFACT_CLASSES,
        injectedDurableArtifact: { validationReport: { status: "passed" } },
      }),
    ).rejects.toThrow("prohibited-ephemeral-field-persisted");
    const incompleteAdapterRoot = await scenarioRoot("sc-071-incomplete-adapter");
    const incompleteAdapterPath = join(incompleteAdapterRoot, "adapter.md");
    await writeFile(
      incompleteAdapterPath,
      (await readFile(adapterSpecificationPath, "utf8")).replaceAll(
        "quarantine/",
        "omitted-quarantine-class/",
      ),
      "utf8",
    );
    await expect(
      inspectM15ArtifactPrivacy({
        runtimeRoot,
        runtimeRoots,
        repositoryRoot,
        artifactClasses: M15_TASK_1_ARTIFACT_CLASSES,
        privacyPolicyPath,
        adapterSpecificationPath: incompleteAdapterPath,
        initializationLockPath: initializationLock.lockPath,
      }),
    ).rejects.toThrow("artifact-contract-class-missing:quarantine/");
    await writeFile(join(runtimeRoot, "unknown-artifact.json"), JSON.stringify({}), "utf8");
    await expect(
      inspectM15ArtifactPrivacy({
        runtimeRoot,
        runtimeRoots,
        repositoryRoot,
        artifactClasses: M15_TASK_1_ARTIFACT_CLASSES,
        privacyPolicyPath,
        adapterSpecificationPath,
        initializationLockPath: initializationLock.lockPath,
      }),
    ).rejects.toThrow("artifact-implementation-class-unknown:unknown-artifact.json");
  },
  "M15-SC-072": async () => {
    const replayed = await replayScenario("sc-072");
    const authority = await readIndependentMarkerBoundedAuthority(replayed.runtimeRoot);
    const integrity = await replayed.ledger.verifyIntegrity();
    const recovery = await replayed.ledger.recover();
    const lockInspection = await replayed.ledger.inspectWriterLock();
    const lockCleanup = await replayed.ledger.cleanupInactiveWriterLock({
      requestContractVersion: "1.0",
      lockFingerprint: fingerprintA,
      writerProcessId: Number.MAX_SAFE_INTEGER,
      writerActive: false,
    });
    const rebuild = await replayed.ledger.rebuildDerivedIndexes();
    const registrationPage = await replayed.ledger.listCommittedReadinessEvaluations();
    const replayPage = await replayed.ledger.listReadinessReplayAttempts(
      replayed.transaction.transactionId,
    );
    const facadeNamespace = await import("../src/readiness-ledger.js");
    const preflight = (await import(
      pathToFileURL(
        join(repositoryRoot, "scripts", "validate-milestone-15-implementation-preflight.mjs"),
      ).href
    )) as {
      M15_PREFLIGHT_CONTRACT: Record<string, string>;
      validateMilestone15ImplementationAuthorization(candidate: unknown): unknown;
    };
    const preflightCandidate = {
      authorizedDocumentationMergeSha:
        preflight.M15_PREFLIGHT_CONTRACT.authorizedDocumentationMergeSha,
      contractVersion: preflight.M15_PREFLIGHT_CONTRACT.contractVersion,
      milestone: preflight.M15_PREFLIGHT_CONTRACT.milestone,
      requiredImplementationBranch: preflight.M15_PREFLIGHT_CONTRACT.requiredImplementationBranch,
      runtimePredecessorSha: preflight.M15_PREFLIGHT_CONTRACT.runtimePredecessorSha,
    };
    const outputInventoryInput = {
      inventory: M15_TASK_1_PUBLIC_OUTPUT_SCHEMAS,
      schemaSourcePath: join(
        repositoryRoot,
        "packages/knowledge-schema/src/durable-readiness-ledger.ts",
      ),
      facadeNamespace,
      preflightNamespace: preflight,
      privacyPolicyPath: join(
        repositoryRoot,
        "docs/milestones/milestone-15/FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md",
      ),
      architectureSpecificationPath: join(
        repositoryRoot,
        "docs/milestones/milestone-15/FounderOS_Milestone_15_Architecture_Specification_v1.0.md",
      ),
      acceptanceCriteriaPath: join(
        repositoryRoot,
        "docs/milestones/milestone-15/FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md",
      ),
      commitmentSourcePath: join(
        repositoryRoot,
        "services/knowledge-engine/src/domain/durable-readiness-ledger.ts",
      ),
      productionSourcePaths: await productionTypeScriptSourcePaths(
        join(repositoryRoot, "services/knowledge-engine/src"),
      ),
      commitmentDomains: M15_COMMITMENT_DOMAINS,
      persistedFiles: authority.persistedFiles,
      entries: [
        {
          name: "ReadinessRegistrationResultSchema",
          schema: ReadinessRegistrationResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 2, path: ["reason"], expectedBehavior: "reject" },
            { sampleIndex: 3, path: ["reason"], expectedBehavior: "reject" },
          ],
          samples: [
            { status: "committed", transaction: replayed.transaction, derivedStateStatus: "valid" },
            {
              status: "idempotent-original-returned",
              transaction: replayed.transaction,
              derivedStateStatus: "missing",
            },
            { status: "rejected", transaction: null, reason: "invalid-input" },
            {
              status: "integrity-failed",
              transaction: null,
              reason: "readiness-ledger-integrity-failure",
            },
          ],
        },
        {
          name: "ReadinessReplaySubmissionResultSchema",
          schema: ReadinessReplaySubmissionResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 2, path: ["reason"], expectedBehavior: "reject" },
          ],
          samples: [
            replayed.replay,
            {
              ...replayed.replay,
              status: "idempotent-replay-returned",
              replayAppendStatus: "not-appended",
            },
            {
              status: "not-recorded",
              replayAppendStatus: "not-appended",
              replayAttempt: null,
              reason: "invalid-input",
            },
          ],
        },
        {
          name: "ReadinessReplayAppendStatusSchema",
          schema: RawReadinessReplayAppendStatusSchema,
          noPathCapableFieldDisposition: "closed-enum-primitive-with-no-member-fields",
          samples: ["appended", "not-appended"],
        },
        {
          name: "ReadinessIntegrityResultSchema",
          schema: RawReadinessIntegrityResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 1, path: ["findings", 0], expectedBehavior: "reject" },
          ],
          samples: [
            integrity,
            {
              resultContractVersion: "1.0",
              status: "invalid",
              verifiedMarkerFingerprint: null,
              verifiedRegistrationCount: 0,
              verifiedReplayAttemptCount: 0,
              verifiedTotalEventCount: 0,
              verifiedLastSequence: 0,
              verifiedLatestAuditEntryFingerprint: null,
              verifiedCompleteHistoryFingerprint: null,
              derivedIndexStatus: "invalid",
              findings: ["readiness-ledger-integrity-failure"],
            },
          ],
        },
        {
          name: "ReadinessRecoveryResultSchema",
          schema: RawReadinessRecoveryResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 2, path: ["errors", 0], expectedBehavior: "reject" },
          ],
          samples: [
            recovery,
            {
              resultContractVersion: "1.0",
              status: "empty",
              committedRegistrationCount: 0,
              committedReplayAttemptCount: 0,
              permanentIdempotencyOwnershipCount: 0,
              lastCommittedSequence: 0,
              latestAuditEntryId: null,
              latestAuditEntryFingerprint: null,
              latestSemanticEventId: null,
              latestSemanticEventFingerprint: null,
              latestSubjectTransactionId: null,
              latestSubjectTransactionFingerprint: null,
              completeHistoryFingerprint: authority.genesisHead.completeHistoryFingerprint,
              authoritativeMarkerFingerprint: (
                authority.persistedFiles.find(
                  (file) => file.relativePath === join("events", "genesis", "commit-marker.json"),
                )!.value as Record<string, unknown>
              ).commitMarkerFingerprint,
              derivedIndexStatus: "valid",
              stagingOrphanCount: 0,
              installedUncommittedOrphanCount: 0,
              errors: [],
            },
            {
              resultContractVersion: "1.0",
              status: "failed",
              committedRegistrationCount: 0,
              committedReplayAttemptCount: 0,
              permanentIdempotencyOwnershipCount: 0,
              lastCommittedSequence: 0,
              latestAuditEntryId: null,
              latestAuditEntryFingerprint: null,
              latestSemanticEventId: null,
              latestSemanticEventFingerprint: null,
              latestSubjectTransactionId: null,
              latestSubjectTransactionFingerprint: null,
              completeHistoryFingerprint: null,
              authoritativeMarkerFingerprint: null,
              derivedIndexStatus: "invalid",
              stagingOrphanCount: 0,
              installedUncommittedOrphanCount: 0,
              errors: ["readiness-ledger-integrity-failure"],
            },
          ],
        },
        {
          name: "ReadinessWriterLockInspectionResultSchema",
          schema: RawReadinessWriterLockInspectionResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 3, path: ["reason"], expectedBehavior: "reject" },
          ],
          samples: [
            lockInspection,
            {
              resultContractVersion: "1.0",
              status: "active",
              lockFingerprint: fingerprintA,
              writerProcessId: 1,
              reason: null,
            },
            {
              resultContractVersion: "1.0",
              status: "inactive",
              lockFingerprint: fingerprintA,
              writerProcessId: 1,
              reason: null,
            },
            {
              resultContractVersion: "1.0",
              status: "ambiguous",
              lockFingerprint: null,
              writerProcessId: null,
              reason: "writer-liveness-ambiguous",
            },
          ],
        },
        {
          name: "ReadinessWriterLockCleanupResultSchema",
          schema: RawReadinessWriterLockCleanupResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 0, path: ["reason"], expectedBehavior: "reject" },
          ],
          samples: [
            lockCleanup,
            {
              resultContractVersion: "1.0",
              status: "cleaned",
              lockFingerprint: fingerprintA,
              reason: null,
            },
          ],
        },
        {
          name: "ReadinessDerivedStateStatusSchema",
          schema: RawReadinessDerivedStateStatusSchema,
          noPathCapableFieldDisposition: "closed-enum-primitive-with-no-member-fields",
          samples: ["valid", "missing", "invalid"],
        },
        {
          name: "ReadinessDerivedIndexRebuildResultSchema",
          schema: ReadinessDerivedIndexRebuildResultSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 1, path: ["reason"], expectedBehavior: "reject" },
          ],
          samples: [
            rebuild,
            {
              resultContractVersion: "1.0",
              status: "not-rebuilt",
              sourceLedgerHeadFingerprint: null,
              rebuiltIndexCount: 0,
              reason: "readiness-ledger-integrity-failure",
            },
          ],
        },
        {
          name: "ReadinessListPageMetadataSchema",
          schema: RawReadinessListPageMetadataSchema,
          allowedPathFieldLocations: [
            {
              sampleIndex: 0,
              path: ["sourceLedgerHeadFingerprint"],
              expectedBehavior: "reject",
            },
          ],
          samples: [registrationPage.page, replayPage.page],
        },
        {
          name: "ReadinessCommittedEvaluationListItemSchema",
          schema: RawReadinessCommittedEvaluationListItemSchema,
          allowedPathFieldLocations: [
            { sampleIndex: 0, path: ["transaction", "adapterId"], expectedBehavior: "reject" },
          ],
          samples: [registrationPage.items[0]],
        },
        {
          name: "ReadinessReplayAttemptListItemSchema",
          schema: RawReadinessReplayAttemptListItemSchema,
          allowedPathFieldLocations: [
            {
              sampleIndex: 0,
              path: ["replayAttempt", "replayRequestId"],
              expectedBehavior: "reject",
            },
          ],
          samples: [replayPage.items[0]],
        },
        {
          name: "ReadinessCommittedEvaluationPageSchema",
          schema: RawReadinessCommittedEvaluationPageSchema,
          allowedPathFieldLocations: [
            {
              sampleIndex: 0,
              path: ["items", 0, "transaction", "adapterId"],
              expectedBehavior: "reject",
            },
          ],
          samples: [registrationPage],
        },
        {
          name: "ReadinessReplayAttemptPageSchema",
          schema: RawReadinessReplayAttemptPageSchema,
          allowedPathFieldLocations: [
            {
              sampleIndex: 0,
              path: ["items", 0, "replayAttempt", "replayRequestId"],
              expectedBehavior: "reject",
            },
          ],
          samples: [replayPage],
        },
        {
          name: "LocalFileReadinessEvaluationLedgerOpenFacade",
          documentedException: "governed-non-data-facade",
          noPathCapableFieldDisposition:
            "governed-non-data-facade-exposes-functions-not-public-data-fields",
          samples: [replayed.ledger],
        },
        {
          name: "Milestone15ImplementationPreflightValidationResult",
          schema: { parse: preflight.validateMilestone15ImplementationAuthorization },
          allowedPathFieldLocations: [
            {
              sampleIndex: 0,
              path: ["requiredImplementationBranch"],
              expectedBehavior: "reject",
            },
          ],
          samples: [preflightCandidate],
        },
      ],
    } as const;
    const inspection = verifyM15PublicOutputInventory(outputInventoryInput);
    const relaxedRegistrationReasonSchema = {
      parse(value: unknown): unknown {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          const candidate = value as Record<string, unknown>;
          if (
            candidate.status === "rejected" &&
            typeof candidate.reason === "string" &&
            candidate.reason !== "invalid-input"
          ) {
            ReadinessRegistrationResultSchema.parse({ ...candidate, reason: "invalid-input" });
            return structuredClone(candidate);
          }
        }
        return ReadinessRegistrationResultSchema.parse(value);
      },
    };
    expect(() =>
      verifyM15PublicOutputInventory({
        ...outputInventoryInput,
        entries: outputInventoryInput.entries.map((entry) =>
          entry.name === "ReadinessRegistrationResultSchema"
            ? { ...entry, schema: relaxedRegistrationReasonSchema }
            : entry,
        ),
      }),
    ).toThrow("public-output-path-redaction-failed:ReadinessRegistrationResultSchema:$.reason");
    expect(() =>
      verifyM15PublicOutputInventory({
        ...outputInventoryInput,
        entries: outputInventoryInput.entries.map((entry) => {
          if (entry.name !== "ReadinessRegistrationResultSchema") return entry;
          const candidate: Record<string, unknown> = { ...entry };
          delete candidate.allowedPathFieldLocations;
          return candidate;
        }),
      }),
    ).toThrow("public-output-path-field-declaration-missing:ReadinessRegistrationResultSchema");
    expect(() =>
      verifyM15PublicOutputInventory({
        ...outputInventoryInput,
        entries: outputInventoryInput.entries.map((entry) =>
          entry.name === "ReadinessRegistrationResultSchema"
            ? {
                ...entry,
                allowedPathFieldLocations: [
                  { sampleIndex: 0, path: ["status"], expectedBehavior: "reject" },
                ],
              }
            : entry,
        ),
      }),
    ).toThrow("public-output-path-field-discriminator-forbidden:$.status");
    expect(inspection.inventoriedSchemaNames).toEqual(M15_TASK_1_PUBLIC_OUTPUT_SCHEMAS);
    expect(inspection.inspectedVariantCount).toBe(33);
    expect(inspection.persistedEnvelopeMatchCount).toBe(0);
    expect(inspection.publicCommitmentDomainCount).toBe(0);
    expect(inspection.contractOutputNames).toEqual(inspection.discoveredOutputNames);
    expect(inspection.requiredPathMatrixValueCount).toBe(12);
    expect(
      inspection.exactPathFieldCoverage?.map(
        (coverage) => `${coverage.outputName}#${coverage.sampleIndex}:${coverage.fieldPath}`,
      ),
    ).toEqual([
      "ReadinessRegistrationResultSchema#2:$.reason",
      "ReadinessRegistrationResultSchema#3:$.reason",
      "ReadinessReplaySubmissionResultSchema#2:$.reason",
      "ReadinessIntegrityResultSchema#1:$.findings[0]",
      "ReadinessRecoveryResultSchema#2:$.errors[0]",
      "ReadinessWriterLockInspectionResultSchema#3:$.reason",
      "ReadinessWriterLockCleanupResultSchema#0:$.reason",
      "ReadinessDerivedIndexRebuildResultSchema#1:$.reason",
      "ReadinessListPageMetadataSchema#0:$.sourceLedgerHeadFingerprint",
      "ReadinessCommittedEvaluationListItemSchema#0:$.transaction.adapterId",
      "ReadinessReplayAttemptListItemSchema#0:$.replayAttempt.replayRequestId",
      "ReadinessCommittedEvaluationPageSchema#0:$.items[0].transaction.adapterId",
      "ReadinessReplayAttemptPageSchema#0:$.items[0].replayAttempt.replayRequestId",
      "Milestone15ImplementationPreflightValidationResult#0:$.requiredImplementationBranch",
    ]);
    expect(
      inspection.exactPathFieldCoverage?.every(
        (coverage) =>
          coverage.reachedMutationCount === inspection.requiredPathMatrixValueCount &&
          coverage.rejectedMutationCount === inspection.requiredPathMatrixValueCount &&
          coverage.redactedMutationCount === 0,
      ),
    ).toBe(true);
    expect(inspection.rejectedPathLikeMutationCount).toBe(
      (inspection.exactPathFieldCoverage?.length ?? 0) *
        (inspection.requiredPathMatrixValueCount ?? 0),
    );
    expect(inspection.noPathCapableFieldDispositions?.map((entry) => entry.outputName)).toEqual([
      "ReadinessReplayAppendStatusSchema",
      "ReadinessDerivedStateStatusSchema",
      "LocalFileReadinessEvaluationLedgerOpenFacade",
    ]);
    expect(inspection.discoveredFacadeExportNames).toEqual([
      "openLocalFileReadinessEvaluationLedger",
    ]);
    expect(inspection.discoveredFacadeMethodNames).toHaveLength(11);
    expect(inspection.discoveredPreflightExportNames).toHaveLength(6);
    expect(inspection.commitmentDomainDefinitionCount).toBe(21);
    expect(inspection.commitmentCallSiteCount).toBeGreaterThan(0);
    expect(inspection.commitmentOutputImportCount).toBe(0);
    const extraOutputRoot = await scenarioRoot("sc-072-extra-output");
    const extraOutputSourcePath = join(extraOutputRoot, "durable-readiness-ledger.ts");
    await writeFile(
      extraOutputSourcePath,
      `${await readFile(outputInventoryInput.schemaSourcePath, "utf8")}\nexport const ReadinessControlledNewResultSchema = canonicalObject({ resultContractVersion: VERSION });\n`,
      "utf8",
    );
    expect(() =>
      verifyM15PublicOutputInventory({
        ...outputInventoryInput,
        schemaSourcePath: extraOutputSourcePath,
      }),
    ).toThrow("public-output-inventory-incomplete");
    expect(() =>
      verifyM15PublicOutputInventory({
        ...outputInventoryInput,
        injectedDurableArtifact: { status: "not-recorded", replayAppendStatus: "not-appended" },
      }),
    ).toThrow("ephemeral-public-output-persisted");
  },
};

const IMPLEMENTATION_BOUNDARIES: Readonly<Record<string, string>> = {
  "M15-SC-001": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-002": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-003": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-004": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-005": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-006": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-007": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-008": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-009": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-010": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-011": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-012": "createReadinessHistoricalComparison",
  "M15-SC-013": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-014": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-015": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-016": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-017": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-018": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-019": "createGovernedReadinessEvaluationLedger",
  "M15-SC-020": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-021": "openLocalFileReadinessLedgerStorageForTesting",
  "M15-SC-022": "openLocalFileReadinessLedgerStorageForTesting",
  "M15-SC-023": "LocalFileReadinessEvaluationLedger.inspectWriterLock",
  "M15-SC-024": "LocalFileReadinessEvaluationLedger.rebuildDerivedIndexes",
  "M15-SC-025": "LocalFileReadinessEvaluationLedger.rebuildDerivedIndexes",
  "M15-SC-026": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-027": "ReadinessLedgerHeadSchema.parse",
  "M15-SC-028": "ReadinessLedgerHeadSchema.parse",
  "M15-SC-029": "ReadinessLedgerHeadSchema.parse",
  "M15-SC-030": "openLocalFileReadinessEvaluationLedger",
  "M15-SC-031": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-032": "filesystem.readFile",
  "M15-SC-033": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-034": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-035": "m15-predecessor.standalone-contract",
  "M15-SC-036": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-037": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-038": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-039": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-040": "verifyCommittedReadinessTransaction",
  "M15-SC-041": "verifyCommittedReadinessTransaction",
  "M15-SC-042": "createCanonicalReadinessEvaluationPackage",
  "M15-SC-043": "createCanonicalReadinessEvaluationPackage",
  "M15-SC-044": "LocalFileReadinessEvaluationLedger.rebuildDerivedIndexes",
  "M15-SC-045": "LocalFileReadinessEvaluationLedger.rebuildDerivedIndexes",
  "M15-SC-046": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-047": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-048": "openLocalFileReadinessEvaluationLedger",
  "M15-SC-049": "m15-preflight.real-git-matrix",
  "M15-SC-050": "m15-documentation.structured-lint",
  "M15-SC-051": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-052": "filesystem.readFile",
  "M15-SC-053": "knowledge-engine.public-import",
  "M15-SC-054": "createReadinessGenesisCommitment",
  "M15-SC-055": "openLocalFileReadinessLedgerStorageForTesting",
  "M15-SC-056": "LocalFileReadinessEvaluationLedger.recover",
  "M15-SC-057": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-058": "openLocalFileReadinessLedgerStorageForTesting",
  "M15-SC-059": "LocalFileReadinessEvaluationLedger.readHead",
  "M15-SC-060": "ReadinessLedgerHeadSchema.parse",
  "M15-SC-061": "LocalFileReadinessEvaluationLedger.verifyIntegrity",
  "M15-SC-062": "LocalFileReadinessEvaluationLedger.readHead",
  "M15-SC-063": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-064": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-065": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-066": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-067": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-068": "LocalFileReadinessEvaluationLedger.registerVerifiedReadinessEvaluation",
  "M15-SC-069": "LocalFileReadinessEvaluationLedger.rebuildDerivedIndexes",
  "M15-SC-070": "LocalFileReadinessEvaluationLedger.submitReadinessReplayAttempt",
  "M15-SC-071": "filesystem.readFile",
  "M15-SC-072": "ReadinessRegistrationResultSchema.parse",
};

function createScenarioExecute(
  scenarioId: string,
  scenarioHelper: string,
  expectedBehavior: () => void | Promise<void>,
  behavior: () => void | Promise<void>,
  options: { readonly timeoutMs?: number } = {},
): () => Promise<M15ScenarioExecutionEvidence> {
  return async () => {
    if (behavior !== expectedBehavior) throw new Error("scenario-execution-mapping-invalid");
    if (activeBoundaryObservation !== null) throw new Error("scenario-observation-already-active");
    const observedProductionBoundaries = new Map<string, number>();
    const observation: BoundaryObservation = {
      token: Symbol(scenarioId),
      boundaries: observedProductionBoundaries,
    };
    const assertionsBefore = expect.getState().assertionCalls;
    activeBoundaryObservation = observation;
    try {
      await boundaryObservationContext.run(observation, async () => {
        if (options.timeoutMs === undefined) {
          await behavior();
        } else {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              Promise.resolve().then(behavior),
              new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(
                  () => reject(new Error(`scenario-execution-timeout:${scenarioId}`)),
                  options.timeoutMs,
                );
              }),
            ]);
          } finally {
            if (timeout !== undefined) clearTimeout(timeout);
          }
        }
      });
      return issueM15ScenarioExecutionEvidence({
        scenarioId,
        scenarioHelper,
        observedProductionBoundaries: Object.fromEntries(observedProductionBoundaries),
        assertionCount: expect.getState().assertionCalls - assertionsBefore,
      });
    } finally {
      if (activeBoundaryObservation?.token === observation.token) {
        activeBoundaryObservation = null;
      }
    }
  };
}

const EXPECTED_ASSERTION_COUNTS: Readonly<Record<string, number>> = Object.freeze({
  "M15-SC-001": 2,
  "M15-SC-002": 3,
  "M15-SC-003": 2,
  "M15-SC-004": 23,
  "M15-SC-005": 5,
  "M15-SC-006": 4,
  "M15-SC-007": 3,
  "M15-SC-008": 3,
  "M15-SC-009": 3,
  "M15-SC-010": 3,
  "M15-SC-011": 4,
  "M15-SC-012": 2,
  "M15-SC-013": 4,
  "M15-SC-014": 7,
  "M15-SC-015": 7,
  "M15-SC-016": 4,
  "M15-SC-017": 6,
  "M15-SC-018": 4,
  "M15-SC-019": 3,
  "M15-SC-020": 3,
  "M15-SC-021": 80,
  "M15-SC-022": 102,
  "M15-SC-023": 6,
  "M15-SC-024": 44,
  "M15-SC-025": 3,
  "M15-SC-026": 2,
  "M15-SC-027": 1,
  "M15-SC-028": 2,
  "M15-SC-029": 2,
  "M15-SC-030": 2,
  "M15-SC-031": 3,
  "M15-SC-032": 4,
  "M15-SC-033": 14,
  "M15-SC-034": 11,
  "M15-SC-035": 9,
  "M15-SC-036": 3,
  "M15-SC-037": 2,
  "M15-SC-038": 2,
  "M15-SC-039": 2,
  "M15-SC-040": 9,
  "M15-SC-041": 23,
  "M15-SC-042": 14,
  "M15-SC-043": 7,
  "M15-SC-044": 4,
  "M15-SC-045": 3,
  "M15-SC-046": 4,
  "M15-SC-047": 5,
  "M15-SC-048": 3,
  "M15-SC-049": 8,
  "M15-SC-050": 12,
  "M15-SC-051": 3,
  "M15-SC-052": 7,
  "M15-SC-053": 2,
  "M15-SC-054": 4,
  "M15-SC-055": 8,
  "M15-SC-056": 5,
  "M15-SC-057": 4,
  "M15-SC-058": 6,
  "M15-SC-059": 25,
  "M15-SC-060": 6,
  "M15-SC-061": 12,
  "M15-SC-062": 4,
  "M15-SC-063": 3,
  "M15-SC-064": 2,
  "M15-SC-065": 2,
  "M15-SC-066": 2,
  "M15-SC-067": 14,
  "M15-SC-068": 12,
  "M15-SC-069": 7,
  "M15-SC-070": 4,
  "M15-SC-071": 36,
  "M15-SC-072": 23,
});

const SCENARIO_ASSERTION_SUMMARY_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  "M15-SC-033":
    "tests/support/milestone-15-production-no-execution-proof.ts#published entrypoint closure, exact network classification, runtime zero-call guard, and reachable mutation failure",
  "M15-SC-034":
    "tests/support/milestone-15-production-no-execution-proof.ts#same published entrypoint closure, exact credential classification, runtime zero-access guard, and reachable mutation failure",
  "M15-SC-049":
    "tests/support/milestone-15-phase-b2-proof.ts#real isolated Git repositories and local bare remote cover the clean path and exact invalid-state matrix without mutation or path leakage",
  "M15-SC-035":
    "tests/support/milestone-15-phase-b2-proof.ts#ordinary execution proves the single-level standalone gate contract; the post-verifier execution consumes a same-candidate signed capture of the real child exit and stdout and rejects missing, nonzero, altered, stale, and synthetic evidence",
  "M15-SC-050":
    "tests/support/milestone-15-phase-b2-proof.ts#structured 13-document inventory, traceability, links, versions, status, index, commands, counts, stale-evidence and publication-claim lint with independent mutations",
  "M15-SC-052":
    "services/knowledge-engine/package.json#requires knowledge-engine to depend on knowledge-schema and forbids the reverse dependency while preserving the governed public facade",
});

const scenarioBehaviors: readonly M15ScenarioBehavior[] =
  M15_DURABLE_READINESS_EVALUATION_SCENARIOS.map((scenario) => {
    const behavior = focusedBehavior[scenario.scenarioId];
    const implementationBoundary = IMPLEMENTATION_BOUNDARIES[scenario.scenarioId];
    if (behavior === undefined || implementationBoundary === undefined) {
      throw new Error(`scenario-helper-missing:${scenario.scenarioId}`);
    }
    const scenarioHelper = `execute${scenario.scenarioId.replaceAll("-", "")}`;
    const exactAssertionCount = EXPECTED_ASSERTION_COUNTS[scenario.scenarioId];
    if (exactAssertionCount === undefined) {
      throw new Error(`scenario-assertion-contract-missing:${scenario.scenarioId}`);
    }
    const assertionSummary =
      SCENARIO_ASSERTION_SUMMARY_OVERRIDES[scenario.scenarioId] ??
      scenario.behavioralEvidence
        .map((evidence) => `${evidence.testFile}#${evidence.testName}`)
        .join("; ");
    return Object.freeze({
      scenarioId: scenario.scenarioId,
      coverageKind: "behavioral" as const,
      expectedProductionBoundary: implementationBoundary,
      scenarioHelper,
      assertionContract: Object.freeze({
        exactAssertionCount,
        categories: Object.freeze([
          `production-boundary:${implementationBoundary}`,
          ...scenario.requirements.map((requirement) => `requirement:${requirement}`),
          `exact-assertion-count:${exactAssertionCount}`,
        ]),
        summary: assertionSummary,
      }),
      semanticCoverage: Object.freeze({
        scenarioId: scenario.scenarioId,
        catalogTitle: scenario.title,
        requirementIds: scenario.requirements,
        exactSetupMutation: `callable:${scenarioHelper}`,
        actualObservedProductionBoundary: implementationBoundary,
        exactExpectedResult: scenario.title,
        stateAssertions: assertionSummary,
        callCountAssertions: `boundary>=1;assertions=${exactAssertionCount}`,
        restartProcessFilesystemEvidence:
          scenario.behavioralEvidence.map((evidence) => evidence.testFile).join(",") ||
          "scenario-helper-owned",
        scenarioHelper,
      }),
      execute: createScenarioExecute(scenario.scenarioId, scenarioHelper, behavior, behavior),
    });
  });

const runtimeScenarios = createM15RuntimeScenarioRegistry(
  M15_DURABLE_READINESS_EVALUATION_SCENARIOS,
  scenarioBehaviors,
);

describe("Milestone 15 explicit 72-scenario behavioral coverage registry", () => {
  it("is contiguous, unique, behaviorally executable, and mutation-sensitive", async () => {
    expect(M15_DURABLE_READINESS_EVALUATION_SCENARIOS).toHaveLength(72);
    expect(
      new Set(M15_DURABLE_READINESS_EVALUATION_SCENARIOS.map((entry) => entry.scenarioId)).size,
    ).toBe(72);
    expect(M15_DURABLE_READINESS_EVALUATION_SCENARIOS.map((entry) => entry.scenarioId)).toEqual(
      Array.from({ length: 72 }, (_, index) => `M15-SC-${String(index + 1).padStart(3, "0")}`),
    );
    for (const scenario of runtimeScenarios) {
      expect("probe" in scenario).toBe(false);
      expect(scenario.coverageKind).toBe("behavioral");
      expect(scenario.requirementIds).toEqual(scenario.requirements);
      expect(scenario.expectedProductionBoundary.length).toBeGreaterThan(10);
      expect(scenario.scenarioHelper).toBe(`execute${scenario.scenarioId.replaceAll("-", "")}`);
      expect(scenario.assertionContract.exactAssertionCount).toBeGreaterThan(0);
      expect(scenario.assertionContract.categories).toContain(
        `production-boundary:${scenario.expectedProductionBoundary}`,
      );
      expect(scenario.assertionContract.categories).toContain(
        `exact-assertion-count:${scenario.assertionContract.exactAssertionCount}`,
      );
      expect(scenario.assertionContract.summary).toContain("/");
      expect(scenario.semanticCoverage).toMatchObject({
        scenarioId: scenario.scenarioId,
        catalogTitle: scenario.title,
        requirementIds: scenario.requirements,
        actualObservedProductionBoundary: scenario.expectedProductionBoundary,
        scenarioHelper: scenario.scenarioHelper,
      });
      expect(scenario.semanticCoverage.exactSetupMutation).toBe(
        `callable:${scenario.scenarioHelper}`,
      );
      expect(scenario.semanticCoverage.callCountAssertions).toBe(
        `boundary>=1;assertions=${scenario.assertionContract.exactAssertionCount}`,
      );
      expect(scenario.title.length).toBeGreaterThan(10);
      expect(scenario.executableTestName).toBe(`${scenario.scenarioId} — ${scenario.title}`);
    }
    const first = runtimeScenarios[0]!;
    const noOpScenario = { ...first, execute: async () => undefined };
    await expect(noOpScenario.execute()).resolves.toBeUndefined();
    expect(() => verifyM15ScenarioExecution(first, undefined)).toThrow(
      "scenario-execution-mapping-invalid",
    );
    const noOpBehavior = async () => {};
    const noOpEvidence = await createScenarioExecute(
      first.scenarioId,
      first.scenarioHelper,
      noOpBehavior,
      noOpBehavior,
    )();
    expect(() => verifyM15ScenarioExecution(first, noOpEvidence)).toThrow(
      "scenario-production-behavior-not-invoked",
    );
    const timeoutBehavior = async () => {
      await delay(25);
    };
    await expect(
      createScenarioExecute(
        first.scenarioId,
        first.scenarioHelper,
        timeoutBehavior,
        timeoutBehavior,
        { timeoutMs: 1 },
      )(),
    ).rejects.toThrow("scenario-execution-timeout:M15-SC-001");
    const afterTimeoutEvidence = await createScenarioExecute(
      first.scenarioId,
      first.scenarioHelper,
      noOpBehavior,
      noOpBehavior,
    )();
    expect(afterTimeoutEvidence.scenarioId).toBe(first.scenarioId);
    await delay(25);
    expect(() =>
      verifyM15ScenarioExecution(first, {
        scenarioId: first.scenarioId,
        scenarioHelper: first.scenarioHelper,
        observedProductionBoundaries: { [first.expectedProductionBoundary]: 1 },
        assertionCount: first.assertionContract.exactAssertionCount,
      }),
    ).toThrow("scenario-execution-mapping-invalid");
    expect(() =>
      verifyM15ScenarioExecution(first, {
        scenarioId: runtimeScenarios[1]!.scenarioId,
        scenarioHelper: runtimeScenarios[1]!.scenarioHelper,
        observedProductionBoundaries: { [first.expectedProductionBoundary]: 1 },
        assertionCount: 1,
      }),
    ).toThrow("scenario-execution-mapping-invalid");
    expect(() =>
      createM15RuntimeScenarioRegistry(
        M15_DURABLE_READINESS_EVALUATION_SCENARIOS.slice(1),
        scenarioBehaviors,
      ),
    ).toThrow("scenario-registry-count-invalid");
    expect(() =>
      createM15RuntimeScenarioRegistry(
        [
          M15_DURABLE_READINESS_EVALUATION_SCENARIOS[0]!,
          ...M15_DURABLE_READINESS_EVALUATION_SCENARIOS.slice(0, 71),
        ],
        scenarioBehaviors,
      ),
    ).toThrow("scenario-registry-duplicate");
    expect(() =>
      createM15RuntimeScenarioRegistry(
        M15_DURABLE_READINESS_EVALUATION_SCENARIOS,
        scenarioBehaviors.slice(1),
      ),
    ).toThrow("scenario-behavior-registry-count-invalid");
    expect(() =>
      createM15RuntimeScenarioRegistry(M15_DURABLE_READINESS_EVALUATION_SCENARIOS, [
        scenarioBehaviors[0]!,
        ...scenarioBehaviors.slice(0, 71),
      ]),
    ).toThrow("scenario-behavior-registry-duplicate");
    expect(() =>
      createM15RuntimeScenarioRegistry(M15_DURABLE_READINESS_EVALUATION_SCENARIOS, [
        { ...scenarioBehaviors[0]!, scenarioHelper: M15_GENERIC_FALLBACK_SENTINEL },
        ...scenarioBehaviors.slice(1),
      ]),
    ).toThrow("scenario-generic-fallback-forbidden");
    expect(() =>
      createM15RuntimeScenarioRegistry(M15_DURABLE_READINESS_EVALUATION_SCENARIOS, [
        {
          ...scenarioBehaviors[0]!,
          assertionContract: { ...scenarioBehaviors[0]!.assertionContract, summary: "" },
        },
        ...scenarioBehaviors.slice(1),
      ]),
    ).toThrow("scenario-assertion-summary-missing");
    const firstBehavior = focusedBehavior[first.scenarioId]!;
    const secondBehavior = focusedBehavior[runtimeScenarios[1]!.scenarioId]!;
    await expect(
      createScenarioExecute(
        first.scenarioId,
        first.scenarioHelper,
        firstBehavior,
        secondBehavior,
      )(),
    ).rejects.toThrow("scenario-execution-mapping-invalid");
    const missingAssertionEvidence = issueM15ScenarioExecutionEvidence({
      scenarioId: first.scenarioId,
      scenarioHelper: first.scenarioHelper,
      observedProductionBoundaries: { [first.expectedProductionBoundary]: 1 },
      assertionCount: first.assertionContract.exactAssertionCount - 1,
    });
    expect(() => verifyM15ScenarioExecution(first, missingAssertionEvidence)).toThrow(
      "scenario-assertion-contract-unsatisfied",
    );
    const missingBoundaryEvidence = issueM15ScenarioExecutionEvidence({
      scenarioId: first.scenarioId,
      scenarioHelper: first.scenarioHelper,
      observedProductionBoundaries: {},
      assertionCount: first.assertionContract.exactAssertionCount,
    });
    expect(() => verifyM15ScenarioExecution(first, missingBoundaryEvidence)).toThrow(
      "scenario-production-behavior-not-invoked",
    );
    const secondEvidence = await runtimeScenarios[1]!.execute();
    expect(() => verifyM15ScenarioExecution(first, secondEvidence)).toThrow(
      "scenario-execution-mapping-invalid",
    );
  });

  for (const scenario of runtimeScenarios) {
    it(
      scenario.executableTestName,
      async () => {
        expect(scenario.requirements.length).toBeGreaterThan(0);
        expect(
          scenario.requirements.every((requirement) => /^M15-[A-Z]+-\d{3}$/u.test(requirement)),
        ).toBe(true);
        const evidence = await scenario.execute();
        expect(() => verifyM15ScenarioExecution(scenario, evidence)).not.toThrow();
      },
      ["M15-SC-021", "M15-SC-022", "M15-SC-049"].includes(scenario.scenarioId)
        ? 600_000
        : [
              "M15-SC-004",
              "M15-SC-055",
              "M15-SC-056",
              "M15-SC-061",
              "M15-SC-067",
              "M15-SC-068",
              "M15-SC-071",
              "M15-SC-072",
            ].includes(scenario.scenarioId)
          ? 120_000
          : 30_000,
    );
  }
});
