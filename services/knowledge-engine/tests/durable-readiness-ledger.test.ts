import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DurableContextDeliveryLedger } from "@founderos/knowledge-schema";

import {
  createProductionProviderReadinessEvaluator,
  createProductionProviderReadinessEvaluatorWithHistoricalMismatchForTest,
} from "../src/application/evaluate-production-provider-readiness.js";
import {
  createGovernedReadinessEvaluationLedger,
  type ReadinessEvaluatorConfigurationInput,
} from "../src/application/manage-governed-readiness-evaluation-ledger.js";
import { createDurableM19ReadinessAuthority } from "../src/application/m19-source-authorities.js";
import type { M19AuthorityRequest } from "../src/application/openai-responses-preparation-orchestrator.js";
import {
  createCommittedReadinessTransaction,
  createCanonicalReadinessEvaluationPackage,
  createReadinessGenesisCommitment,
  createReadinessOwnership,
  createReadinessRegistrationRequest,
  createRegistrationLedgerEvent,
  DurableReadinessLedgerError,
  M15_COMMITMENT_DOMAINS,
  verifyCommittedReadinessTransaction,
  verifyCanonicalReadinessEvaluationPackage,
} from "../src/domain/durable-readiness-ledger.js";
import { createM19PolicyAuthorityEvidence } from "../src/domain/openai-responses-adapter.js";
import { createAuthorizationDecisionEvidence } from "../src/domain/provider-readiness.js";
import {
  openLocalFileReadinessEvaluationLedger,
  openLocalFileReadinessLedgerStorage,
} from "../src/infrastructure/local-file-readiness-ledger.js";
import { createCanonicalProviderReadinessEvaluationRuntime } from "./fixtures/provider-readiness-evaluations.js";

import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();

async function root(name: string) {
  return realpath(await mkdtemp(join(tmpdir(), `founderos-m15-${name}-`)));
}

function options(runtimeRoot: string, createIfMissing = true) {
  return {
    runtimeRoot,
    repositoryRoot: REPOSITORY_ROOT,
    canonicalSourceRoots: [
      join(REPOSITORY_ROOT, "docs"),
      join(REPOSITORY_ROOT, "packages"),
      join(REPOSITORY_ROOT, "services"),
    ],
    createIfMissing,
  } as const;
}

function configuration(
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

function cloneReadinessInput(
  input: Awaited<ReturnType<typeof createCanonicalProviderReadinessEvaluationRuntime>>["input"],
  readinessDecisionId: string,
) {
  const { deliveryLedger, ...canonical } = input;
  return { ...structuredClone(canonical), readinessDecisionId, deliveryLedger };
}

function deliveryLedgerWithAuthorityFailure(
  ledger: DurableContextDeliveryLedger,
  failure: "delivery" | "invocation",
): DurableContextDeliveryLedger {
  return new Proxy(ledger, {
    get(target, property) {
      if (failure === "delivery" && property === "listCommittedOriginalDeliveries") {
        return async () => [];
      }
      if (failure === "invocation" && property === "readOriginalDeliveryResult") {
        return async () => null;
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function registeredLedger(
  name: string,
  runtimeOptions: Parameters<typeof createCanonicalProviderReadinessEvaluationRuntime>[1] = {},
) {
  const deliveryRoot = await root(`${name}-delivery`);
  const runtime = await createCanonicalProviderReadinessEvaluationRuntime(
    [deliveryRoot],
    runtimeOptions,
  );
  const readinessRoot = await root(`${name}-readiness`);
  const ledger = await openLocalFileReadinessEvaluationLedger(options(readinessRoot));
  const head = await ledger.readHead();
  const registrationInput = {
    contractVersion: "1.0" as const,
    registrationRequestId: `registration-${name}`,
    transactionId: `transaction-${name}`,
    idempotencyKey: `idempotency-${name}`,
    requestedOwnershipId: `ownership-${name}`,
    requestedRegistrationSemanticEventId: `semantic-registration-${name}`,
    requestedRegistrationAuditEntryId: `audit-registration-${name}`,
    requestedRegistrationMarkerId: `marker-registration-${name}`,
    deliveryLedger: runtime.input.deliveryLedger,
    deliveryIdentity: runtime.input.deliveryIdentity,
    readinessInput: runtime.input,
    evaluator: runtime.evaluator,
    evaluatorConfiguration: configuration(runtime),
    expectedEvaluationPackage: null,
    originalEvaluationTime: runtime.input.evaluatedAt,
    submittedAt: runtime.input.evaluatedAt,
    committedAt: runtime.input.evaluatedAt,
    expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
  };
  const result = await ledger.registerVerifiedReadinessEvaluation(registrationInput);
  expect(result.status).toBe("committed");
  if (result.transaction === null) throw new Error(result.reason);
  return { ledger, readinessRoot, runtime, registrationInput, transaction: result.transaction };
}

describe("Milestone 15 durable readiness ledger", () => {
  it("implements every normative commitment domain exactly once", () => {
    expect(Object.values(M15_COMMITMENT_DOMAINS)).toHaveLength(21);
    expect(new Set(Object.values(M15_COMMITMENT_DOMAINS)).size).toBe(21);
    expect(
      Object.values(M15_COMMITMENT_DOMAINS).every((value) => value.startsWith("founderos.m15.")),
    ).toBe(true);
  });

  it("resolves M19 readiness from a real committed OpenAI-family ledger transaction", async () => {
    const { ledger, runtime, transaction } = await registeredLedger("m19-source-authority", {
      adapterId: "adapter-openai-m19",
      providerFamilyReference: "provider-family/openai",
    });
    const retained = transaction.evaluationPackage.retainedEvidence;
    if (retained.costAndBudget === null) throw new Error("Expected retained cost evidence");
    const { policyFingerprint: _policyFingerprint, ...expectedPolicy } =
      runtime.input.transportPolicy;
    void _policyFingerprint;
    const policyAuthorityEvidence = createM19PolicyAuthorityEvidence({
      schemaVersion: "1.0",
      providerFamilyReference: "provider-family/openai",
      environmentClass: "evaluation",
      operation: "founder-decision-memo",
      pricingEvidenceId: retained.costAndBudget.pricingReferenceId,
      pricingEvidenceFingerprint: retained.costAndBudget.pricingReferenceFingerprint,
      pricingReviewedAt: "2026-07-30T00:00:00.000Z",
      pricingExpiresAt: "2026-07-30T03:00:00.000Z",
      privacyPolicyFingerprint: "6".repeat(64),
      privacyReviewedAt: "2026-07-30T00:00:00.000Z",
      privacyExpiresAt: "2026-07-30T03:00:00.000Z",
      providerRetentionEvidenceId: "provider-retention-m19",
      providerRetentionEvidenceFingerprint: "8".repeat(64),
      providerRetentionReviewedAt: "2026-07-30T00:00:00.000Z",
      providerRetentionExpiresAt: "2026-07-30T03:00:00.000Z",
      accountRetentionEvidenceId: "account-retention-m19",
      accountRetentionEvidenceFingerprint: "a".repeat(64),
      accountRetentionReviewedAt: "2026-07-30T00:00:00.000Z",
      accountRetentionExpiresAt: "2026-07-30T03:00:00.000Z",
      operationFingerprint: "9".repeat(64),
      cachePolicyReviewedAt: "2026-07-30T00:00:00.000Z",
      cachePolicyExpiresAt: "2026-07-30T03:00:00.000Z",
      cacheEvidenceReference: "evidence/cache-policy-m19",
      issuerReference: "authority/m19-policy-evidence",
    });
    const authority = createDurableM19ReadinessAuthority({
      schemaVersion: "1.0",
      ledger,
      transactionId: transaction.transactionId,
      adapterState: "dry-run-mapping",
      environmentClass: "evaluation",
      operation: "founder-decision-memo",
      transportPolicy: runtime.input.transportPolicy,
      transportPolicyVerification: {
        adapter: runtime.input.adapterDescriptor,
        expectedPolicy,
      },
      policyAuthorityEvidence,
      expiresAt: "2026-07-30T03:00:00.000Z",
      issuerReference: "authority/m19-durable-readiness",
    });
    const plan = retained.requestPlan;
    if (plan === null) throw new Error("Expected retained request plan");
    const request = {
      schemaVersion: "1.0",
      preparationId: "preparation-real-ledger-m19",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
      decision: {
        authorizationDecisionId: "decision-real-ledger-m19",
        decisionFingerprint: "c".repeat(64),
        authorizationRequest: {
          executionAttemptId: "attempt-real-ledger-m19",
          executionAttemptFingerprint: "1".repeat(64),
          adapterId: transaction.adapterId,
          adapterFingerprint: transaction.adapterFingerprint,
          providerFamilyReference: transaction.providerFamilyReference,
          deliveryTransactionId: plan.deliveryTransactionId,
          deliveryTransactionFingerprint: plan.deliveryTransactionFingerprint,
          invocationRequestId: plan.invocationRequestId,
          invocationRequestFingerprint: plan.invocationRequestFingerprint,
          environmentClass: "evaluation",
          operation: "founder-decision-memo",
        },
      },
      claim: {
        authorizationClaimId: "claim-real-ledger-m19",
        claimFingerprint: "2".repeat(64),
      },
    } as unknown as M19AuthorityRequest;

    let networkCalls = 0;
    const networkGlobals = [
      "fetch",
      "WebSocket",
      "EventSource",
      "XMLHttpRequest",
      "navigator",
    ] as const;
    const originalDescriptors = new Map<string, PropertyDescriptor>();
    for (const name of networkGlobals) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor === undefined || descriptor.configurable !== true) continue;
      originalDescriptors.set(name, descriptor);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          networkCalls += 1;
          throw new Error("network forbidden");
        },
      });
    }
    try {
      const evidence = await authority.resolve(request);
      expect(evidence.readinessTransactionFingerprint).toBe(transaction.transactionFingerprint);
      expect(evidence.m14CompatibilityFingerprint).toBe(
        retained.compatibility?.compatibilityFingerprint,
      );
      expect(evidence.policyAuthorityEvidenceFingerprint).toBe(
        policyAuthorityEvidence.evidenceFingerprint,
      );
      expect(networkCalls).toBe(0);
    } finally {
      for (const [name, descriptor] of originalDescriptors) {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });

  it("produces byte-identical deterministic genesis commitments", () => {
    expect(createReadinessGenesisCommitment()).toEqual(createReadinessGenesisCommitment());
    const genesis = createReadinessGenesisCommitment();
    expect(genesis.marker.markerId).toBe("m15-genesis");
    expect(genesis.head.headGeneration).toBe(0);
    expect(genesis.head.latestAuditEntryId).toBeNull();
  });

  it("initializes one complete empty authority with byte-identical marker copies", async () => {
    const runtimeRoot = await root("genesis");
    const ledger = await openLocalFileReadinessEvaluationLedger(options(runtimeRoot));
    expect((await ledger.recover()).status).toBe("empty");
    expect((await ledger.verifyIntegrity()).status).toBe("valid");
    const archive = await readFile(
      join(runtimeRoot, "events", "genesis", "commit-marker.json"),
      "utf8",
    );
    const current = await readFile(join(runtimeRoot, "commit-head.json"), "utf8");
    expect(current).toBe(archive);
  });

  it.each([
    ["leading whitespace", (bytes: string) => ` ${bytes}`],
    ["trailing whitespace", (bytes: string) => `${bytes} `],
    ["trailing newline", (bytes: string) => `${bytes}\n`],
    ["pretty printing", (bytes: string) => JSON.stringify(JSON.parse(bytes), null, 2)],
    [
      "alternate key order",
      (bytes: string) =>
        JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(bytes)).reverse())),
    ],
    ["duplicate key before", (bytes: string) => bytes.replace("{", '{"markerId":"duplicate",')],
    ["duplicate key after", (bytes: string) => bytes.replace(/\}$/u, ',"markerId":"duplicate"}')],
    ["UTF-8 BOM", (bytes: string) => `\uFEFF${bytes}`],
    [
      "escaped canonical string",
      (bytes: string) => bytes.replace("m15-genesis", "\\u006d15-genesis"),
    ],
    ["alternate number spelling", (bytes: string) => bytes.replace(":0", ":0e0")],
  ] as const)("rejects canonical current-marker mutation: %s", async (_label, mutate) => {
    const runtimeRoot = await root(`canonical-${_label.replaceAll(" ", "-")}`);
    const ledger = await openLocalFileReadinessEvaluationLedger(options(runtimeRoot));
    const markerPath = join(runtimeRoot, "commit-head.json");
    const original = await readFile(markerPath, "utf8");
    const mutated = mutate(original);
    await writeFile(markerPath, mutated, "utf8");
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    expect(await readFile(markerPath, "utf8")).toBe(mutated);
  });

  it("commits a verified original from genesis and advances exact head coordinates", async () => {
    const { ledger, transaction } = await registeredLedger("first");
    const head = await ledger.readHead();
    expect(head.headGeneration).toBe(1);
    expect(head.committedRegistrationCount).toBe(1);
    expect(head.committedReplayAttemptCount).toBe(0);
    expect(head.latestSubjectTransactionId).toBe(transaction.transactionId);
    expect(
      (await ledger.listCommittedReadinessEvaluations()).items.map((item) => item.transaction),
    ).toEqual([transaction]);
  });

  it("recomputes all 21 commitment domains across registration replay and restart", async () => {
    const { ledger, readinessRoot, runtime, transaction } =
      await registeredLedger("all-commitment-domains");
    const replayTime = "2026-07-30T01:30:00.000Z";
    const replay = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-all-domains",
      replayRequestId: "replay-request-all-domains",
      requestedReplayAttemptId: "replay-attempt-all-domains",
      requestedReplaySemanticEventId: "replay-semantic-all-domains",
      requestedReplayAuditEntryId: "replay-audit-all-domains",
      requestedReplayMarkerId: "replay-marker-all-domains",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: replayTime,
      recordedAt: replayTime,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(replay.status).toBe("recorded");
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    expect(Object.values(M15_COMMITMENT_DOMAINS)).toHaveLength(21);
    expect(await reopened.verifyIntegrity()).toMatchObject({
      status: "valid",
      verifiedRegistrationCount: 1,
      verifiedReplayAttemptCount: 1,
      verifiedTotalEventCount: 2,
      verifiedLastSequence: 2,
    });
  });

  it("rejects malformed registration data and evaluator impostors before storage access", async () => {
    const deliveryRoot = await root("prevalidation-delivery");
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([deliveryRoot]);
    const readinessRoot = await root("prevalidation-readiness");
    const storage = await openLocalFileReadinessLedgerStorage(options(readinessRoot));
    let inspections = 0;
    const monitored = Object.freeze({
      inspect() {
        inspections += 1;
        return storage.inspect();
      },
      withWriter: storage.withWriter.bind(storage),
    });
    const ledger = createGovernedReadinessEvaluationLedger(monitored);
    const base = {
      contractVersion: "1.0" as const,
      registrationRequestId: "registration-prevalidation",
      transactionId: "transaction-prevalidation",
      idempotencyKey: "idempotency-prevalidation",
      requestedOwnershipId: "ownership-prevalidation",
      requestedRegistrationSemanticEventId: "semantic-prevalidation",
      requestedRegistrationAuditEntryId: "audit-prevalidation",
      requestedRegistrationMarkerId: "marker-prevalidation",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: (await storage.inspect()).state.head.ledgerHeadFingerprint,
    };
    inspections = 0;
    expect(
      await ledger.registerVerifiedReadinessEvaluation({
        ...base,
        registrationRequestId: " invalid ",
      }),
    ).toMatchObject({ status: "rejected" });
    expect(inspections).toBe(0);
    expect(
      await ledger.registerVerifiedReadinessEvaluation({
        ...base,
        evaluator: Object.freeze({
          evaluate: runtime.evaluator.evaluate,
          verifyDecision: runtime.evaluator.verifyDecision,
        }),
      }),
    ).toMatchObject({ status: "rejected" });
    expect(inspections).toBe(0);
  });

  it("prevalidates the complete registration envelope before inspection or writer acquisition", async () => {
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([
      await root("prevalidation-matrix-delivery"),
    ]);
    const storage = await openLocalFileReadinessLedgerStorage(
      options(await root("prevalidation-matrix-readiness")),
    );
    const expectedLedgerHeadFingerprint = (await storage.inspect()).state.head
      .ledgerHeadFingerprint;
    let inspections = 0;
    let writers = 0;
    const ledger = createGovernedReadinessEvaluationLedger({
      inspect() {
        inspections += 1;
        return storage.inspect();
      },
      withWriter(operation) {
        writers += 1;
        return storage.withWriter(operation);
      },
    });
    const base = {
      contractVersion: "1.0" as const,
      registrationRequestId: "registration-prevalidation-matrix",
      transactionId: "transaction-prevalidation-matrix",
      idempotencyKey: "idempotency-prevalidation-matrix",
      requestedOwnershipId: "ownership-prevalidation-matrix",
      requestedRegistrationSemanticEventId: "semantic-prevalidation-matrix",
      requestedRegistrationAuditEntryId: "audit-prevalidation-matrix",
      requestedRegistrationMarkerId: "marker-prevalidation-matrix",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: runtime.input.evaluatedAt,
      submittedAt: runtime.input.evaluatedAt,
      committedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint,
    };
    const accessor = { ...base } as Record<string, unknown>;
    let accessorInvocations = 0;
    Object.defineProperty(accessor, "transactionId", {
      enumerable: true,
      get() {
        accessorInvocations += 1;
        return base.transactionId;
      },
    });
    const symbol = { ...base } as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = true;
    const nonEnumerable = { ...base };
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true });
    const inherited = Object.assign(Object.create({ hidden: true }), base) as unknown;
    const customPrototype = Object.assign(Object.create({}), base) as unknown;
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const cases: readonly [string, unknown][] = [
      ["contract version", { ...base, contractVersion: "2.0" }],
      ...[
        "registrationRequestId",
        "transactionId",
        "idempotencyKey",
        "requestedOwnershipId",
        "requestedRegistrationSemanticEventId",
        "requestedRegistrationAuditEntryId",
        "requestedRegistrationMarkerId",
      ].map((field) => [field, { ...base, [field]: " invalid " }] as [string, unknown]),
      ["head fingerprint", { ...base, expectedLedgerHeadFingerprint: "x" }],
      ["original time", { ...base, originalEvaluationTime: "2026-07-30" }],
      ["submitted time", { ...base, submittedAt: "2026-13-99T00:00:00Z" }],
      ["committed time", { ...base, committedAt: "not-a-time" }],
      ["readiness shape", { ...base, readinessInput: { unknown: true } }],
      ["delivery identity shape", { ...base, deliveryIdentity: { unknown: true } }],
      ["configuration shape", { ...base, evaluatorConfiguration: { unknown: true } }],
      ["unknown top-level", { ...base, unknown: true }],
      ["explicit undefined", { ...base, transactionId: undefined }],
      ["accessor", accessor],
      ["symbol", symbol],
      ["non-enumerable", nonEnumerable],
      ["inherited", inherited],
      ["custom prototype", customPrototype],
      ["cyclic package", { ...base, expectedEvaluationPackage: cycle }],
      ["executable package", { ...base, expectedEvaluationPackage: { executable: () => true } }],
      ["oversized identity", { ...base, transactionId: `transaction-${"x".repeat(10_001)}` }],
      [
        "evaluator impostor",
        {
          ...base,
          evaluator: {
            evaluate: runtime.evaluator.evaluate,
            verifyDecision: runtime.evaluator.verifyDecision,
          },
        },
      ],
    ];
    const registrationFailureLabels = new Set([
      "contract version",
      "head fingerprint",
      "original time",
      "submitted time",
      "committed time",
      "configuration shape",
      "cyclic package",
      "executable package",
      "evaluator impostor",
    ]);
    for (const [label, input] of cases) {
      inspections = 0;
      writers = 0;
      const result = await ledger.registerVerifiedReadinessEvaluation(input as never);
      expect(result, label).toMatchObject({
        status: "rejected",
        reason: registrationFailureLabels.has(label)
          ? "invalid-registration-input"
          : "invalid-input",
      });
      expect(inspections, label).toBe(0);
      expect(writers, label).toBe(0);
    }
    expect(accessorInvocations).toBe(0);
  });

  it("normalizes undocumented storage failures to closed operation reason codes", async () => {
    const {
      registrationInput,
      runtime,
      transaction,
      ledger: authoritativeLedger,
    } = await registeredLedger("closed-result-reasons");
    const failingStorage = {
      async inspect(): Promise<never> {
        throw new DurableReadinessLedgerError("undocumented-storage-reason");
      },
      async withWriter(): Promise<never> {
        throw new DurableReadinessLedgerError("undocumented-storage-reason");
      },
    };
    const ledger = createGovernedReadinessEvaluationLedger(failingStorage);
    expect(await ledger.verifyIntegrity()).toMatchObject({
      status: "invalid",
      findings: ["readiness-ledger-integrity-failure"],
    });
    expect(await ledger.recover()).toMatchObject({
      status: "failed",
      errors: ["readiness-ledger-integrity-failure"],
    });
    expect(await ledger.rebuildDerivedIndexes()).toEqual({
      resultContractVersion: "1.0",
      status: "not-rebuilt",
      sourceLedgerHeadFingerprint: null,
      rebuiltIndexCount: 0,
      reason: "readiness-ledger-integrity-failure",
    });
    expect(await ledger.registerVerifiedReadinessEvaluation(registrationInput)).toEqual({
      status: "integrity-failed",
      transaction: null,
      reason: "readiness-ledger-integrity-failure",
    });
    const head = await authoritativeLedger.readHead();
    expect(
      await ledger.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: "replay-key-closed-result-reasons",
        replayRequestId: "replay-request-closed-result-reasons",
        requestedReplayAttemptId: "replay-attempt-closed-result-reasons",
        requestedReplaySemanticEventId: "replay-semantic-closed-result-reasons",
        requestedReplayAuditEntryId: "replay-audit-closed-result-reasons",
        requestedReplayMarkerId: "replay-marker-closed-result-reasons",
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: runtime.input.evaluatedAt,
        recordedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
      }),
    ).toEqual({
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      replayAttempt: null,
      reason: "readiness-ledger-integrity-failure",
    });
  });

  it("uses one immutable readiness snapshot when the caller mutates its object during an await", async () => {
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([
      await root("snapshot-mutation-delivery"),
    ]);
    const storage = await openLocalFileReadinessLedgerStorage(
      options(await root("snapshot-mutation-readiness")),
    );
    const expectedLedgerHeadFingerprint = (await storage.inspect()).state.head
      .ledgerHeadFingerprint;
    let signalInspection!: () => void;
    const inspectionStarted = new Promise<void>((resolve) => {
      signalInspection = resolve;
    });
    let releaseInspection!: () => void;
    const inspectionGate = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    const ledger = createGovernedReadinessEvaluationLedger({
      async inspect() {
        signalInspection();
        await inspectionGate;
        return storage.inspect();
      },
      withWriter: storage.withWriter.bind(storage),
    });
    const readinessInput = cloneReadinessInput(runtime.input, "readiness-snapshot-mutation");
    const operation = ledger.registerVerifiedReadinessEvaluation({
      contractVersion: "1.0",
      registrationRequestId: "registration-snapshot-mutation",
      transactionId: "transaction-snapshot-mutation",
      idempotencyKey: "idempotency-snapshot-mutation",
      requestedOwnershipId: "ownership-snapshot-mutation",
      requestedRegistrationSemanticEventId: "semantic-snapshot-mutation",
      requestedRegistrationAuditEntryId: "audit-snapshot-mutation",
      requestedRegistrationMarkerId: "marker-snapshot-mutation",
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: readinessInput.evaluatedAt,
      submittedAt: readinessInput.evaluatedAt,
      committedAt: readinessInput.evaluatedAt,
      expectedLedgerHeadFingerprint,
    });
    await inspectionStarted;
    (readinessInput.adapterDescriptor as { adapterId: string }).adapterId = "mutated-after-capture";
    releaseInspection();
    const result = await operation;
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("snapshot registration did not commit");
    expect(result.transaction.adapterId).toBe(runtime.input.adapterDescriptor.adapterId);
  });

  it("persists only the redacted transport commitment and no operation envelope", async () => {
    const { readinessRoot } = await registeredLedger("stored-privacy");
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    const eventDirectory = join(readinessRoot, "events", "registrations", directory!);
    const bytes = (
      await Promise.all(
        (await readdir(eventDirectory)).map((file) => readFile(join(eventDirectory, file), "utf8")),
      )
    ).join("\n");
    expect(bytes).not.toMatch(/"(?:hostname|scheme|port|url|endpoint)"/u);
    expect(bytes).not.toMatch(/https?:\/\//u);
    expect(bytes).not.toContain('"replayAppendStatus"');
    expect(bytes).not.toContain('"integrityResult"');
    expect(bytes).not.toContain('"recoveryResult"');
    expect(bytes).not.toContain('"operationFingerprint"');
  });

  it("rejects a coherently re-signed transaction with substituted cross-bindings", async () => {
    const { transaction } = await registeredLedger("coherent-substitution");
    const { transactionFingerprint: _fingerprint, ...unsigned } = transaction;
    void _fingerprint;
    const variants: readonly [string, () => typeof unsigned][] = [
      [
        "registration request",
        () => ({ ...unsigned, registrationRequestFingerprint: "0".repeat(64) }),
      ],
      ["ownership", () => ({ ...unsigned, ownershipFingerprint: "0".repeat(64) })],
      ["adapter", () => ({ ...unsigned, adapterId: "coherently-substituted-adapter" })],
      ["capability", () => ({ ...unsigned, providerCapabilityFingerprint: "0".repeat(64) })],
      ["credential", () => ({ ...unsigned, credentialReferenceFingerprint: "0".repeat(64) })],
      ["transport policy", () => ({ ...unsigned, transportPolicyFingerprint: "0".repeat(64) })],
      [
        "authority",
        () => ({
          ...unsigned,
          authorityProjection: {
            ...unsigned.authorityProjection,
            authorityProjectionFingerprint: "0".repeat(64),
          },
        }),
      ],
      [
        "configuration",
        () => ({
          ...unsigned,
          evaluatorConfigurationProjection: {
            ...unsigned.evaluatorConfigurationProjection,
            configurationProjectionFingerprint: "0".repeat(64),
          },
        }),
      ],
      [
        "evaluation package",
        () => ({
          ...unsigned,
          evaluationPackage: {
            ...unsigned.evaluationPackage,
            evaluationPackageFingerprint: "0".repeat(64),
          },
        }),
      ],
      [
        "decision fingerprint",
        () => ({
          ...unsigned,
          evaluationPackage: {
            ...unsigned.evaluationPackage,
            decision: {
              ...unsigned.evaluationPackage.decision,
              decisionFingerprint: "0".repeat(64),
            },
          },
        }),
      ],
      [
        "retained evidence fingerprint",
        () => ({
          ...unsigned,
          evaluationPackage: {
            ...unsigned.evaluationPackage,
            retainedEvidence: {
              ...unsigned.evaluationPackage.retainedEvidence,
              observabilityRetention:
                unsigned.evaluationPackage.retainedEvidence.observabilityRetention === null
                  ? null
                  : {
                      ...unsigned.evaluationPackage.retainedEvidence.observabilityRetention,
                      retentionFingerprint: "0".repeat(64),
                    },
            },
          },
        }),
      ],
    ];
    for (const [label, mutate] of variants) {
      const substituted = createCommittedReadinessTransaction(mutate());
      expect(() => verifyCommittedReadinessTransaction(substituted), label).toThrowError(
        /Durable readiness evidence did not verify/u,
      );
    }
    const staleTransactionFingerprint = structuredClone(transaction);
    staleTransactionFingerprint.transactionFingerprint = "0".repeat(64);
    expect(() => verifyCommittedReadinessTransaction(staleTransactionFingerprint)).toThrow();
  });

  it("rejects every coherently re-signed registration identity contradiction", async () => {
    const { transaction } = await registeredLedger("registration-identity-cross-bindings");
    const { transactionFingerprint: _transactionFingerprint, ...unsignedTransaction } = transaction;
    const { registrationRequestFingerprint: _registrationRequestFingerprint, ...unsignedRequest } =
      transaction.registrationRequest;
    const { ownershipFingerprint: _ownershipFingerprint, ...unsignedOwnership } =
      transaction.ownership;
    void _transactionFingerprint;
    void _registrationRequestFingerprint;
    void _ownershipFingerprint;

    const resign = (
      requestUpdates: Record<string, string>,
      ownershipUpdates: Record<string, string>,
    ) => {
      const registrationRequest = createReadinessRegistrationRequest({
        ...unsignedRequest,
        ...requestUpdates,
      });
      const ownership = createReadinessOwnership({
        ...unsignedOwnership,
        registrationRequestFingerprint: registrationRequest.registrationRequestFingerprint,
        ...ownershipUpdates,
      });
      return createCommittedReadinessTransaction({
        ...unsignedTransaction,
        registrationRequest,
        registrationRequestFingerprint: registrationRequest.registrationRequestFingerprint,
        ownership,
        ownershipFingerprint: ownership.ownershipFingerprint,
      });
    };

    const cases: readonly [string, Record<string, string>, Record<string, string>][] = [
      ["requested ownership", { requestedOwnershipId: "ownership-contradictory" }, {}],
      [
        "requested semantic event",
        { requestedRegistrationSemanticEventId: "semantic-contradictory" },
        {},
      ],
      ["requested audit entry", { requestedRegistrationAuditEntryId: "audit-contradictory" }, {}],
      ["requested marker", { requestedRegistrationMarkerId: "marker-contradictory" }, {}],
      ["ownership request", {}, { registrationRequestId: "registration-contradictory" }],
      ["ownership transaction", {}, { transactionId: "transaction-contradictory" }],
      [
        "request versus repeated semantic coordinate",
        { requestedRegistrationSemanticEventId: "semantic-request-contradictory" },
        { registrationSemanticEventId: "semantic-components-agree" },
      ],
      [
        "request versus repeated audit coordinate",
        { requestedRegistrationAuditEntryId: "audit-request-contradictory" },
        { registrationAuditEntryId: "audit-components-agree" },
      ],
      [
        "request versus repeated marker coordinate",
        { requestedRegistrationMarkerId: "marker-request-contradictory" },
        { registrationMarkerId: "marker-components-agree" },
      ],
    ];

    for (const [label, requestUpdates, ownershipUpdates] of cases) {
      expect(
        () => verifyCommittedReadinessTransaction(resign(requestUpdates, ownershipUpdates)),
        label,
      ).toThrowError("Durable readiness evidence did not verify");
    }
  });

  it("fails closed after restart on a coherently re-signed contradictory registration graph", async () => {
    const { ledger, readinessRoot, registrationInput, transaction } = await registeredLedger(
      "contradictory-registration-graph",
    );
    const { registrationRequestFingerprint: _requestFingerprint, ...unsignedRequest } =
      transaction.registrationRequest;
    const { ownershipFingerprint: _ownershipFingerprint, ...unsignedOwnership } =
      transaction.ownership;
    const { transactionFingerprint: _transactionFingerprint, ...unsignedTransaction } = transaction;
    void _requestFingerprint;
    void _ownershipFingerprint;
    void _transactionFingerprint;
    const registrationRequest = createReadinessRegistrationRequest({
      ...unsignedRequest,
      requestedOwnershipId: "ownership-contradictory-request",
    });
    const ownership = createReadinessOwnership({
      ...unsignedOwnership,
      registrationRequestFingerprint: registrationRequest.registrationRequestFingerprint,
    });
    const contradictoryTransaction = createCommittedReadinessTransaction({
      ...unsignedTransaction,
      registrationRequest,
      registrationRequestFingerprint: registrationRequest.registrationRequestFingerprint,
      ownership,
      ownershipFingerprint: ownership.ownershipFingerprint,
    });
    const contradictoryEvent = createRegistrationLedgerEvent({
      request: registrationRequest,
      ownership,
      transaction: contradictoryTransaction,
      previousHead: createReadinessGenesisCommitment().head,
      recordedAt: transaction.committedAt,
    });
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    const eventDirectory = join(readinessRoot, "events", "registrations", directory!);
    const components = {
      "registration-request.json": contradictoryEvent.registrationRequest,
      "ownership.json": contradictoryEvent.ownership,
      "transaction.json": contradictoryEvent.transaction,
      "semantic-event.json": contradictoryEvent.semanticEvent,
      "audit-entry.json": contradictoryEvent.auditEntry,
      "complete-history.json": contradictoryEvent.completeHistory,
      "commit-marker.json": contradictoryEvent.commitMarker,
    } as const;
    const expectedBytes = new Map<string, string>();
    for (const [file, component] of Object.entries(components)) {
      const bytes = JSON.stringify(component);
      expectedBytes.set(file, bytes);
      await writeFile(join(eventDirectory, file), bytes, "utf8");
    }
    await writeFile(
      join(readinessRoot, "commit-head.json"),
      JSON.stringify(contradictoryEvent.commitMarker),
      "utf8",
    );

    await expect(
      openLocalFileReadinessEvaluationLedger({
        ...options(readinessRoot),
        createIfMissing: false,
      }),
    ).rejects.toThrow("Readiness ledger storage operation failed");
    expect(await ledger.verifyIntegrity()).toMatchObject({
      status: "invalid",
      findings: ["readiness-ledger-integrity-failure"],
    });
    expect(await ledger.recover()).toMatchObject({
      status: "failed",
      errors: ["readiness-ledger-integrity-failure"],
    });
    await expect(ledger.readOriginalReadinessEvaluation(transaction.transactionId)).rejects.toThrow(
      "Readiness ledger storage operation failed",
    );
    expect(
      await ledger.registerVerifiedReadinessEvaluation({
        ...registrationInput,
        expectedLedgerHeadFingerprint:
          contradictoryEvent.commitMarker.resultingLedgerHeadFingerprint,
      }),
    ).toMatchObject({ status: "integrity-failed", transaction: null });
    for (const [file, bytes] of expectedBytes) {
      expect(await readFile(join(eventDirectory, file), "utf8"), file).toBe(bytes);
    }
  });

  it("rejects every missing required committed-transaction member", async () => {
    const { transaction } = await registeredLedger("missing-transaction-member");
    for (const member of Object.keys(transaction)) {
      const candidate = structuredClone(transaction) as Record<string, unknown>;
      delete candidate[member];
      expect(() => verifyCommittedReadinessTransaction(candidate), member).toThrow();
    }
  });

  it("rejects every adjacent gate-order permutation after coherent package re-signing", async () => {
    const { transaction } = await registeredLedger("gate-order-permutations");
    const { evaluationPackageFingerprint: _fingerprint, ...unsigned } =
      transaction.evaluationPackage;
    void _fingerprint;
    for (let index = 0; index < unsigned.gateTrace.length - 1; index += 1) {
      const gateTrace = structuredClone(unsigned.gateTrace);
      [gateTrace[index], gateTrace[index + 1]] = [gateTrace[index + 1]!, gateTrace[index]!];
      const candidate = createCanonicalReadinessEvaluationPackage({ ...unsigned, gateTrace });
      expect(() => verifyCanonicalReadinessEvaluationPackage(candidate), `swap-${index}`).toThrow();
    }
  });

  it("rejects equivalent noncanonical UTC representations before package commitment", async () => {
    const { transaction } = await registeredLedger("canonical-upstream-times");
    const { evaluationPackageFingerprint: _fingerprint, ...unsigned } =
      transaction.evaluationPackage;
    void _fingerprint;
    const equivalentOffset = (value: string) => value.replace(/Z$/u, "+00:00");

    expect(() =>
      createCanonicalReadinessEvaluationPackage({
        ...unsigned,
        decision: {
          ...unsigned.decision,
          evaluatedAt: equivalentOffset(unsigned.decision.evaluatedAt),
        },
      }),
    ).toThrow(/canonical Milestone 15 UTC instant/u);

    const authorization = unsigned.retainedEvidence.authorization;
    if (authorization === null) throw new Error("authorization evidence missing");
    expect(() =>
      createCanonicalReadinessEvaluationPackage({
        ...unsigned,
        retainedEvidence: {
          ...unsigned.retainedEvidence,
          authorization: {
            ...authorization,
            decidedAt: equivalentOffset(authorization.decidedAt),
          },
        },
      }),
    ).toThrow(/canonical Milestone 15 UTC instant/u);
  });

  it("runs exact registration retry and returns the original without head advancement", async () => {
    const { ledger, readinessRoot, registrationInput, runtime, transaction } =
      await registeredLedger("retry");
    const before = await ledger.readHead();
    await unlink(join(readinessRoot, "derived", "HEAD.json"));
    await unlink(join(readinessRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    const retry = await reopened.registerVerifiedReadinessEvaluation({
      ...registrationInput,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
    });
    expect(retry.status).toBe("idempotent-original-returned");
    if (retry.status === "idempotent-original-returned")
      expect(retry.transaction).toEqual(transaction);
    expect(await reopened.readHead()).toEqual(before);
    const conflict = await reopened.registerVerifiedReadinessEvaluation({
      ...registrationInput,
      transactionId: "transaction-restart-index-loss-conflict",
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
    });
    expect(conflict).toMatchObject({ status: "rejected", reason: "idempotency-key-conflict" });
    const ownershipConflict = await reopened.registerVerifiedReadinessEvaluation({
      ...registrationInput,
      registrationRequestId: "registration-restart-index-loss-ownership-conflict",
      transactionId: "transaction-restart-index-loss-ownership-conflict",
      idempotencyKey: "idempotency-restart-index-loss-ownership-conflict",
      requestedRegistrationSemanticEventId: "semantic-restart-index-loss-ownership-conflict",
      requestedRegistrationAuditEntryId: "audit-restart-index-loss-ownership-conflict",
      requestedRegistrationMarkerId: "marker-restart-index-loss-ownership-conflict",
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
    });
    expect(ownershipConflict).toMatchObject({
      status: "rejected",
      reason: "ownership-id-conflict",
    });
  });

  it("permanently rejects registration idempotency-key conflicts", async () => {
    const { ledger, registrationInput } = await registeredLedger("conflict");
    for (const field of [
      "registrationRequestId",
      "transactionId",
      "requestedOwnershipId",
      "requestedRegistrationSemanticEventId",
      "requestedRegistrationAuditEntryId",
      "requestedRegistrationMarkerId",
    ] as const) {
      const result = await ledger.registerVerifiedReadinessEvaluation({
        ...registrationInput,
        [field]: `${field}-conflicting`,
      });
      expect(result, field).toMatchObject({
        status: "rejected",
        reason: "idempotency-key-conflict",
      });
    }
    expect((await ledger.listCommittedReadinessEvaluations()).items).toHaveLength(1);
  });

  it("returns coordinate-specific conflicts for every permanently owned original identity", async () => {
    const { ledger, registrationInput, runtime } = await registeredLedger("coordinates");
    const currentHead = await ledger.readHead();
    const cases = [
      [
        "requestedOwnershipId",
        registrationInput.requestedOwnershipId,
        "ownership-id-conflict",
        false,
      ],
      [
        "registrationRequestId",
        registrationInput.registrationRequestId,
        "registration-request-id-conflict",
        false,
      ],
      ["transactionId", registrationInput.transactionId, "transaction-id-conflict", false],
      ["decision", "same", "decision-id-conflict", false],
      [
        "requestedRegistrationSemanticEventId",
        registrationInput.requestedRegistrationSemanticEventId,
        "registration-semantic-event-id-conflict",
        true,
      ],
      [
        "requestedRegistrationAuditEntryId",
        registrationInput.requestedRegistrationAuditEntryId,
        "registration-audit-entry-id-conflict",
        true,
      ],
      [
        "requestedRegistrationMarkerId",
        registrationInput.requestedRegistrationMarkerId,
        "registration-marker-id-conflict",
        true,
      ],
    ] as const;
    for (const [field, reused, reason, distinctDecision] of cases) {
      const suffix = reason.replace(/-conflict$/u, "");
      const candidate = {
        ...registrationInput,
        registrationRequestId: `registration-${suffix}-candidate`,
        transactionId: `transaction-${suffix}-candidate`,
        idempotencyKey: `idempotency-${suffix}-candidate`,
        requestedOwnershipId: `ownership-${suffix}-candidate`,
        requestedRegistrationSemanticEventId: `semantic-${suffix}-candidate`,
        requestedRegistrationAuditEntryId: `audit-${suffix}-candidate`,
        requestedRegistrationMarkerId: `marker-${suffix}-candidate`,
        readinessInput: distinctDecision
          ? cloneReadinessInput(runtime.input, `readiness-${suffix}-candidate`)
          : runtime.input,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        expectedLedgerHeadFingerprint: currentHead.ledgerHeadFingerprint,
      };
      if (field !== "decision") Object.assign(candidate, { [field]: reused });
      const result = await ledger.registerVerifiedReadinessEvaluation(candidate);
      expect(result).toMatchObject({ status: "rejected", reason });
    }
    expect((await ledger.listCommittedReadinessEvaluations()).items).toHaveLength(1);
  });

  it.each([
    ["admissible", "2026-07-30T01:30:00.000Z", "admissible"],
    ["expired", "2026-07-30T03:00:00.000Z", "authorization-expired"],
  ] as const)(
    "records matched history with independently %s current authorization",
    async (label, replayTime, expectedStatus) => {
      const { ledger, readinessRoot, runtime, transaction } = await registeredLedger(
        `replay-${label}`,
      );
      const head = await ledger.readHead();
      const freshEvaluator = createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      });
      const result = await ledger.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: `replay-key-${label}`,
        replayRequestId: `replay-request-${label}`,
        requestedReplayAttemptId: `replay-attempt-${label}`,
        requestedReplaySemanticEventId: `replay-semantic-${label}`,
        requestedReplayAuditEntryId: `replay-audit-${label}`,
        requestedReplayMarkerId: `replay-marker-${label}`,
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: freshEvaluator,
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: replayTime,
        recordedAt: replayTime,
        expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
      });
      expect(result.status, JSON.stringify(result)).toBe("recorded");
      if (result.status === "recorded") {
        expect(result.replayAttempt.historicalComparison.historicalReconstructionStatus).toBe(
          "matched",
        );
        expect(result.replayAttempt.currentAdmissibility.currentAdmissibilityStatus).toBe(
          expectedStatus,
        );
      }
      const replayHead = await ledger.readHead();
      expect(replayHead).toMatchObject({
        headGeneration: 2,
        committedRegistrationCount: 1,
        committedReplayAttemptCount: 1,
        totalAuthoritativeEventCount: 2,
        lastCommittedLedgerSequence: 2,
        latestAuditEntryId: `replay-audit-${label}`,
        latestSemanticEventId: `replay-semantic-${label}`,
        latestSubjectTransactionId: transaction.transactionId,
        latestSubjectTransactionFingerprint: transaction.transactionFingerprint,
      });
      const markerBytes = await readFile(join(readinessRoot, "commit-head.json"), "utf8");
      const marker = JSON.parse(markerBytes) as { resultingLedgerHead: unknown };
      expect(replayHead).toEqual(marker.resultingLedgerHead);
      expect(await readFile(join(readinessRoot, "derived", "HEAD.json"), "utf8")).toBe(
        JSON.stringify(marker.resultingLedgerHead),
      );
    },
  );

  it("rejects invalid UTF-8 authoritative bytes without repair", async () => {
    const runtimeRoot = await root("canonical-invalid-utf8");
    const ledger = await openLocalFileReadinessEvaluationLedger(options(runtimeRoot));
    const markerPath = join(runtimeRoot, "commit-head.json");
    const mutated = Buffer.from([0xff, 0xfe, 0x00]);
    await writeFile(markerPath, mutated);
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    expect(await readFile(markerPath)).toEqual(mutated);
  });

  it.each([
    "missing-archive",
    "missing-current",
    "extra-genesis-entry",
    "invalid-fingerprint",
  ] as const)("fails closed for every invalid genesis material class: %s", async (variant) => {
    const runtimeRoot = await root(`invalid-genesis-${variant}`);
    const ledger = await openLocalFileReadinessEvaluationLedger(options(runtimeRoot));
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
    expect((await ledger.recover()).status).toBe("failed");
  });

  it.each([
    ["denied", "authorization-denied"],
    ["review-required", "authorization-review-required"],
    ["not-evaluated", "authorization-not-evaluated"],
    ["invalid-evidence", "authorization-invalid-evidence"],
  ] as const)("records original %s Authorization as %s", async (outcome, expectedStatus) => {
    const runtime = await createCanonicalProviderReadinessEvaluationRuntime([
      await root(`authorization-${outcome}-delivery`),
    ]);
    const expectedAuthorizationDecision = {
      ...runtime.input.expectedAuthorizationDecision,
      authorizationDecisionId: `authorization-${outcome}-m15`,
      outcome,
    };
    const readinessInput = {
      ...cloneReadinessInput(runtime.input, `readiness-${outcome}-m15`),
      expectedAuthorizationDecision,
      authorizationEvidence: createAuthorizationDecisionEvidence(expectedAuthorizationDecision, {
        deliveryAuthority: runtime.authority,
        adapter: runtime.input.adapterDescriptor,
        requestedOperation: runtime.input.requestedOperation,
        decisionAuthorityReference: runtime.input.decisionAuthorityReference,
      }),
    };
    const ledger = await openLocalFileReadinessEvaluationLedger(
      options(await root(`authorization-${outcome}-readiness`)),
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
      evaluatorConfiguration: configuration(runtime),
      expectedEvaluationPackage: null,
      originalEvaluationTime: readinessInput.evaluatedAt,
      submittedAt: readinessInput.evaluatedAt,
      committedAt: readinessInput.evaluatedAt,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    if (registration.status !== "committed" || registration.transaction === null) {
      throw new Error(`registration did not commit: ${JSON.stringify(registration)}`);
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
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: readinessInput.evaluatedAt,
      replayEvaluatedAt: readinessInput.evaluatedAt,
      recordedAt: readinessInput.evaluatedAt,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(replay.status).toBe("recorded");
    if (replay.status === "recorded") {
      expect(replay.replayAttempt.historicalComparison.historicalReconstructionStatus).toBe(
        "matched",
      );
      expect(replay.replayAttempt.currentAdmissibility.currentAdmissibilityStatus).toBe(
        expectedStatus,
      );
    }
  });

  it("returns exact replay retry without reassessment or append", async () => {
    const { ledger, runtime, transaction } = await registeredLedger("replay-retry");
    const expected = (await ledger.readHead()).ledgerHeadFingerprint;
    const replay = {
      replayContractVersion: "1.0" as const,
      replayIdempotencyKey: "replay-key-retry",
      replayRequestId: "replay-request-retry",
      requestedReplayAttemptId: "replay-attempt-retry",
      requestedReplaySemanticEventId: "replay-semantic-retry",
      requestedReplayAuditEntryId: "replay-audit-retry",
      requestedReplayMarkerId: "replay-marker-retry",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: expected,
    };
    const first = await ledger.submitReadinessReplayAttempt(replay);
    expect(first.status).toBe("recorded");
    const afterFirst = await ledger.readHead();
    const later = await ledger.submitReadinessReplayAttempt({
      ...replay,
      replayIdempotencyKey: "replay-key-retry-later",
      replayRequestId: "replay-request-retry-later",
      requestedReplayAttemptId: "replay-attempt-retry-later",
      requestedReplaySemanticEventId: "replay-semantic-retry-later",
      requestedReplayAuditEntryId: "replay-audit-retry-later",
      requestedReplayMarkerId: "replay-marker-retry-later",
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      expectedLedgerHeadFingerprint: afterFirst.ledgerHeadFingerprint,
    });
    expect(later.status).toBe("recorded");
    const after = await ledger.readHead();
    const retry = await ledger.submitReadinessReplayAttempt({
      ...replay,
      evaluator: {
        evaluate: async () => {
          throw new Error("exact retry must not evaluate");
        },
        verifyDecision: async () => {
          throw new Error("exact retry must not verify");
        },
      },
    });
    expect(retry.status).toBe("idempotent-replay-returned");
    expect(retry.replayAppendStatus).toBe("not-appended");
    expect(await ledger.readHead()).toEqual(after);
    expect(
      (await ledger.listReadinessReplayAttempts(transaction.transactionId)).items,
    ).toHaveLength(2);
  });

  it("paginates authoritative replay attempts across three stable pages and ignores derived state", async () => {
    const { ledger, readinessRoot, runtime, transaction } = await registeredLedger("pagination");
    for (const suffix of ["a", "b", "c"] as const) {
      const head = await ledger.readHead();
      const result = await ledger.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: `replay-key-page-${suffix}`,
        replayRequestId: `replay-request-page-${suffix}`,
        requestedReplayAttemptId: `replay-attempt-page-${suffix}`,
        requestedReplaySemanticEventId: `replay-semantic-page-${suffix}`,
        requestedReplayAuditEntryId: `replay-audit-page-${suffix}`,
        requestedReplayMarkerId: `replay-marker-page-${suffix}`,
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: runtime.input.evaluatedAt,
        recordedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
      });
      expect(result.status).toBe("recorded");
    }
    const collect = async (target: typeof ledger) => {
      const ids: string[] = [];
      const sequences: number[] = [];
      let afterSequence: number | undefined;
      for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
        const page = await target.listReadinessReplayAttempts(transaction.transactionId, {
          limit: 1,
          ...(afterSequence === undefined ? {} : { afterSequence }),
        });
        expect(page.items).toHaveLength(1);
        expect(page.page.returnedCount).toBe(1);
        expect(page.page.hasMore).toBe(pageNumber < 2);
        ids.push(page.items[0]!.replayAttempt.replayAttemptId);
        sequences.push(page.items[0]!.ledgerSequence);
        afterSequence = page.page.nextAfterSequence ?? undefined;
      }
      const terminal = await target.listReadinessReplayAttempts(transaction.transactionId, {
        limit: 1,
        afterSequence: sequences[2]!,
      });
      expect(terminal.items).toEqual([]);
      expect(terminal.page).toMatchObject({ returnedCount: 0, hasMore: false });
      return { ids, sequences };
    };
    const expected = await collect(ledger);
    expect(expected.sequences).toEqual([2, 3, 4]);
    expect(new Set(expected.ids).size).toBe(3);
    await unlink(join(readinessRoot, "derived", "HEAD.json"));
    await unlink(join(readinessRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    expect(await collect(reopened)).toEqual(expected);
    await writeFile(join(readinessRoot, "derived", "indexes.json"), "{}", "utf8");
    expect(await collect(reopened)).toEqual(expected);
  });

  it("paginates committed registrations stably across restart and derived-state loss", async () => {
    const { ledger, readinessRoot, runtime, registrationInput } =
      await registeredLedger("registration-pagination");
    for (const suffix of ["b", "c"] as const) {
      const readinessInput = cloneReadinessInput(
        runtime.input,
        `readiness-registration-page-${suffix}`,
      );
      const result = await ledger.registerVerifiedReadinessEvaluation({
        ...registrationInput,
        registrationRequestId: `registration-page-${suffix}`,
        transactionId: `transaction-page-${suffix}`,
        idempotencyKey: `idempotency-page-${suffix}`,
        requestedOwnershipId: `ownership-page-${suffix}`,
        requestedRegistrationSemanticEventId: `semantic-page-${suffix}`,
        requestedRegistrationAuditEntryId: `audit-page-${suffix}`,
        requestedRegistrationMarkerId: `marker-page-${suffix}`,
        readinessInput,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        originalEvaluationTime: readinessInput.evaluatedAt,
        submittedAt: readinessInput.evaluatedAt,
        committedAt: readinessInput.evaluatedAt,
        expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
      });
      expect(result.status).toBe("committed");
    }
    const collect = async (target: typeof ledger) => {
      const ids: string[] = [];
      let afterSequence: number | undefined;
      for (let pageNumber = 0; pageNumber < 3; pageNumber += 1) {
        const page = await target.listCommittedReadinessEvaluations({
          limit: 1,
          ...(afterSequence === undefined ? {} : { afterSequence }),
        });
        expect(page.items).toHaveLength(1);
        expect(page.page.hasMore).toBe(pageNumber < 2);
        ids.push(page.items[0]!.transaction.transactionId);
        afterSequence = page.page.nextAfterSequence ?? undefined;
      }
      const terminal = await target.listCommittedReadinessEvaluations({
        limit: 1,
        afterSequence: 3,
      });
      expect(terminal.items).toEqual([]);
      expect(terminal.page).toMatchObject({ returnedCount: 0, hasMore: false });
      return ids;
    };
    const expected = await collect(ledger);
    await unlink(join(readinessRoot, "derived", "HEAD.json"));
    await unlink(join(readinessRoot, "derived", "indexes.json"));
    const reopened = await openLocalFileReadinessEvaluationLedger({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    expect(await collect(reopened)).toEqual(expected);
    await writeFile(join(readinessRoot, "derived", "indexes.json"), "{}", "utf8");
    expect(await collect(reopened)).toEqual(expected);
  });

  it.each([
    ["zero-limit", { limit: 0 }],
    ["over-limit", { limit: 257 }],
    ["fractional-limit", { limit: 1.5 }],
    ["zero-cursor", { afterSequence: 0 }],
    ["unknown-field", { unknown: true }],
    ["explicit-undefined", { limit: undefined }],
    ["null-query", null],
    ["inherited-field", Object.create({ limit: 1 }) as object],
  ] as const)("rejects invalid public pagination query %s before storage", async (label, query) => {
    const { ledger } = await registeredLedger(`pagination-invalid-${label}`);
    await expect(ledger.listCommittedReadinessEvaluations(query as never)).rejects.toBeTruthy();
  });

  it.each([["changed-input", "replay-input-mismatch"]] as const)(
    "rejects %s before historical reconstruction with %s",
    async (variant, reason) => {
      const { ledger, runtime, transaction } = await registeredLedger(`replay-${variant}`);
      const readinessInput = cloneReadinessInput(runtime.input, "readiness-replay-changed-input");
      const head = await ledger.readHead();
      const result = await ledger.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: `replay-key-${variant}`,
        replayRequestId: `replay-request-${variant}`,
        requestedReplayAttemptId: `replay-attempt-${variant}`,
        requestedReplaySemanticEventId: `replay-semantic-${variant}`,
        requestedReplayAuditEntryId: `replay-audit-${variant}`,
        requestedReplayMarkerId: `replay-marker-${variant}`,
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: runtime.input.evaluatedAt,
        recordedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
      });
      expect(result).toMatchObject({ status: "not-recorded", reason });
      expect(await ledger.readHead()).toEqual(head);
    },
  );

  it("records evaluator configuration mismatch as historical verification-failed evidence", async () => {
    const { ledger, runtime, transaction } = await registeredLedger(
      "replay-configuration-mismatch",
    );
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-configuration-mismatch",
      replayRequestId: "replay-request-configuration-mismatch",
      requestedReplayAttemptId: "replay-attempt-configuration-mismatch",
      requestedReplaySemanticEventId: "replay-semantic-configuration-mismatch",
      requestedReplayAuditEntryId: "replay-audit-configuration-mismatch",
      requestedReplayMarkerId: "replay-marker-configuration-mismatch",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: {
        ...configuration(runtime),
        providerFamilyReference: "provider-family/substituted",
      },
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("configuration mismatch was not recorded");
    expect(result.replayAttempt.historicalComparison.historicalReconstructionStatus).toBe(
      "verification-failed",
    );
    expect(
      (await ledger.listReadinessReplayAttempts(transaction.transactionId)).items,
    ).toHaveLength(1);
  });

  it("records valid canonical package inequality as mismatched with bounded paths", async () => {
    const { ledger, runtime, transaction } = await registeredLedger("replay-package-mismatch");
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-package-mismatch",
      replayRequestId: "replay-request-package-mismatch",
      requestedReplayAttemptId: "replay-attempt-package-mismatch",
      requestedReplaySemanticEventId: "replay-semantic-package-mismatch",
      requestedReplayAuditEntryId: "replay-audit-package-mismatch",
      requestedReplayMarkerId: "replay-marker-package-mismatch",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluatorWithHistoricalMismatchForTest(
        runtime.transportPolicyAuthority,
      ),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(result.status).toBe("recorded");
    if (result.status !== "recorded") throw new Error("package mismatch was not recorded");
    expect(result.replayAttempt.historicalComparison).toMatchObject({
      historicalReconstructionStatus: "mismatched",
    });
    expect(result.replayAttempt.historicalComparison.differingFieldPaths.length).toBeGreaterThan(0);
    expect(
      result.replayAttempt.historicalComparison.differingFieldPaths.length,
    ).toBeLessThanOrEqual(256);
  });

  it.each(["delivery", "invocation"] as const)(
    "records %s authority mismatch as historical verification-failed evidence",
    async (failure) => {
      const { ledger, runtime, transaction } = await registeredLedger(
        `replay-${failure}-authority-mismatch`,
      );
      const failingDeliveryLedger = deliveryLedgerWithAuthorityFailure(
        runtime.input.deliveryLedger,
        failure,
      );
      const readinessInput = {
        ...cloneReadinessInput(runtime.input, runtime.input.readinessDecisionId),
        deliveryLedger: failingDeliveryLedger,
      };
      const result = await ledger.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: `replay-key-${failure}-authority-mismatch`,
        replayRequestId: `replay-request-${failure}-authority-mismatch`,
        requestedReplayAttemptId: `replay-attempt-${failure}-authority-mismatch`,
        requestedReplaySemanticEventId: `replay-semantic-${failure}-authority-mismatch`,
        requestedReplayAuditEntryId: `replay-audit-${failure}-authority-mismatch`,
        requestedReplayMarkerId: `replay-marker-${failure}-authority-mismatch`,
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: failingDeliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: runtime.input.evaluatedAt,
        recordedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
      });
      expect(result.status).toBe("recorded");
      if (result.status !== "recorded") throw new Error("authority mismatch was not recorded");
      expect(result.replayAttempt.historicalComparison.historicalReconstructionStatus).toBe(
        "verification-failed",
      );
      expect(result.replayAttempt.currentAdmissibility.currentAdmissibilityStatus).toBe(
        "authority-mismatch",
      );
      expect(result.replayAttempt.originalTransactionFingerprint).toBe(
        transaction.transactionFingerprint,
      );
    },
  );

  it("returns not-recorded without append when the original transaction is missing", async () => {
    const { ledger, runtime } = await registeredLedger("replay-missing-original");
    const before = await ledger.readHead();
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-missing-original",
      replayRequestId: "replay-request-missing-original",
      requestedReplayAttemptId: "replay-attempt-missing-original",
      requestedReplaySemanticEventId: "replay-semantic-missing-original",
      requestedReplayAuditEntryId: "replay-audit-missing-original",
      requestedReplayMarkerId: "replay-marker-missing-original",
      originalTransactionId: "transaction-does-not-exist",
      originalTransactionFingerprint: "0".repeat(64),
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: before.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      reason: "original-transaction-not-found",
    });
    expect(await ledger.readHead()).toEqual(before);
  });

  it("rejects accessor-backed replay identity before invocation or evaluator access", async () => {
    const {
      ledger: registered,
      readinessRoot,
      runtime,
      transaction,
    } = await registeredLedger("replay-accessor");
    const head = await registered.readHead();
    const storage = await openLocalFileReadinessLedgerStorage(options(readinessRoot, false));
    let inspections = 0;
    let writers = 0;
    const ledger = createGovernedReadinessEvaluationLedger({
      inspect() {
        inspections += 1;
        return storage.inspect();
      },
      withWriter(operation) {
        writers += 1;
        return storage.withWriter(operation);
      },
    });
    const identity = { ...runtime.input.deliveryIdentity };
    let invoked = 0;
    Object.defineProperty(identity, "transactionId", {
      enumerable: true,
      get() {
        invoked += 1;
        return runtime.input.deliveryIdentity.transactionId;
      },
    });
    const result = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-accessor",
      replayRequestId: "replay-request-accessor",
      requestedReplayAttemptId: "replay-attempt-accessor",
      requestedReplaySemanticEventId: "replay-semantic-accessor",
      requestedReplayAuditEntryId: "replay-audit-accessor",
      requestedReplayMarkerId: "replay-marker-accessor",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: identity,
      readinessInput: runtime.input,
      evaluator: {
        evaluate: async () => {
          throw new Error("invalid input must not evaluate");
        },
        verifyDecision: async () => {
          throw new Error("invalid input must not verify");
        },
      },
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({ status: "not-recorded", reason: "invalid-input" });
    expect(invoked).toBe(0);
    expect(inspections).toBe(0);
    expect(writers).toBe(0);
  });

  it("prevalidates the complete replay envelope before protected work", async () => {
    const {
      ledger: registered,
      readinessRoot,
      runtime,
      transaction,
    } = await registeredLedger("replay-prevalidation-matrix");
    const head = await registered.readHead();
    const storage = await openLocalFileReadinessLedgerStorage(options(readinessRoot, false));
    let inspections = 0;
    let writers = 0;
    let evaluations = 0;
    let verifications = 0;
    const ledger = createGovernedReadinessEvaluationLedger({
      inspect() {
        inspections += 1;
        return storage.inspect();
      },
      withWriter(operation) {
        writers += 1;
        return storage.withWriter(operation);
      },
    });
    const evaluator = {
      async evaluate() {
        evaluations += 1;
        throw new Error("invalid replay must not evaluate");
      },
      async verifyDecision() {
        verifications += 1;
        throw new Error("invalid replay must not verify");
      },
    };
    const base = {
      replayContractVersion: "1.0" as const,
      replayIdempotencyKey: "replay-key-prevalidation",
      replayRequestId: "replay-request-prevalidation",
      requestedReplayAttemptId: "replay-attempt-prevalidation",
      requestedReplaySemanticEventId: "replay-semantic-prevalidation",
      requestedReplayAuditEntryId: "replay-audit-prevalidation",
      requestedReplayMarkerId: "replay-marker-prevalidation",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator,
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: head.ledgerHeadFingerprint,
    };
    const accessor = { ...base } as Record<string, unknown>;
    let accessorInvocations = 0;
    Object.defineProperty(accessor, "replayRequestId", {
      enumerable: true,
      get() {
        accessorInvocations += 1;
        return base.replayRequestId;
      },
    });
    const symbol = { ...base } as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = true;
    const nonEnumerable = { ...base };
    Object.defineProperty(nonEnumerable, "hidden", { enumerable: false, value: true });
    const cycle = { ...runtime.input } as Record<string, unknown>;
    cycle.circuitFailureWindow = cycle;
    const cases: readonly [string, unknown][] = [
      ["version", { ...base, replayContractVersion: "2.0" }],
      ...[
        "replayIdempotencyKey",
        "replayRequestId",
        "requestedReplayAttemptId",
        "requestedReplaySemanticEventId",
        "requestedReplayAuditEntryId",
        "requestedReplayMarkerId",
        "originalTransactionId",
      ].map((field) => [field, { ...base, [field]: " invalid " }] as [string, unknown]),
      ["original fingerprint", { ...base, originalTransactionFingerprint: "x" }],
      ["head fingerprint", { ...base, expectedLedgerHeadFingerprint: "x" }],
      ["original time", { ...base, originalEvaluationTime: "not-a-time" }],
      ["replay time", { ...base, replayEvaluatedAt: "not-a-time" }],
      ["recorded time", { ...base, recordedAt: "not-a-time" }],
      ["unknown", { ...base, unknown: true }],
      ["undefined", { ...base, replayRequestId: undefined }],
      ["accessor", accessor],
      ["symbol", symbol],
      ["non-enumerable", nonEnumerable],
      ["inherited", Object.assign(Object.create({ hidden: true }), base)],
      ["custom prototype", Object.assign(Object.create({}), base)],
      ["cycle", { ...base, readinessInput: cycle }],
      ["executable", { ...base, readinessInput: { ...runtime.input, executable: () => true } }],
      ["oversized", { ...base, replayRequestId: `replay-${"x".repeat(10_001)}` }],
    ];
    for (const [label, input] of cases) {
      inspections = 0;
      writers = 0;
      evaluations = 0;
      verifications = 0;
      const result = await ledger.submitReadinessReplayAttempt(input as never);
      expect(result.status, label).toBe("not-recorded");
      expect(inspections, label).toBe(0);
      expect(writers, label).toBe(0);
      expect(evaluations, label).toBe(0);
      expect(verifications, label).toBe(0);
    }
    expect(accessorInvocations).toBe(0);
  });

  it("returns coordinate-specific replay ownership conflicts", async () => {
    const { ledger, readinessRoot, runtime, transaction } =
      await registeredLedger("replay-coordinates");
    const firstHead = await ledger.readHead();
    const base = {
      replayContractVersion: "1.0" as const,
      replayIdempotencyKey: "replay-key-owned",
      replayRequestId: "replay-request-owned",
      requestedReplayAttemptId: "replay-attempt-owned",
      requestedReplaySemanticEventId: "replay-semantic-owned",
      requestedReplayAuditEntryId: "replay-audit-owned",
      requestedReplayMarkerId: "replay-marker-owned",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: firstHead.ledgerHeadFingerprint,
    };
    expect((await ledger.submitReadinessReplayAttempt(base)).status).toBe("recorded");
    const current = await ledger.readHead();
    const storage = await openLocalFileReadinessLedgerStorage({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    let writerCalls = 0;
    const monitoredLedger = createGovernedReadinessEvaluationLedger({
      inspect: storage.inspect.bind(storage),
      withWriter(operation) {
        writerCalls += 1;
        return storage.withWriter(operation);
      },
    });
    const cases = [
      ["replayIdempotencyKey", base.replayIdempotencyKey, "replay-idempotency-key-conflict"],
      ["replayRequestId", base.replayRequestId, "replay-request-id-conflict"],
      ["requestedReplayAttemptId", base.requestedReplayAttemptId, "replay-attempt-id-conflict"],
      [
        "requestedReplaySemanticEventId",
        base.requestedReplaySemanticEventId,
        "replay-semantic-event-id-conflict",
      ],
      [
        "requestedReplayAuditEntryId",
        base.requestedReplayAuditEntryId,
        "replay-audit-entry-id-conflict",
      ],
      ["requestedReplayMarkerId", base.requestedReplayMarkerId, "replay-marker-id-conflict"],
    ] as const;
    for (const [field, reused, reason] of cases) {
      let deliveryRecoveryCalls = 0;
      let evaluateCalls = 0;
      let verifyDecisionCalls = 0;
      writerCalls = 0;
      const suffix = reason.replace(/-conflict$/u, "");
      const monitoredDeliveryLedger = new Proxy(runtime.input.deliveryLedger, {
        get(target, property) {
          const value = Reflect.get(target, property);
          if (typeof value !== "function") return value;
          return (...arguments_: readonly unknown[]) => {
            deliveryRecoveryCalls += 1;
            return Reflect.apply(value, target, arguments_);
          };
        },
      });
      const candidate = {
        ...base,
        replayIdempotencyKey: `replay-key-${suffix}`,
        replayRequestId: `replay-request-${suffix}`,
        requestedReplayAttemptId: `replay-attempt-${suffix}`,
        requestedReplaySemanticEventId: `replay-semantic-${suffix}`,
        requestedReplayAuditEntryId: `replay-audit-${suffix}`,
        requestedReplayMarkerId: `replay-marker-${suffix}`,
        deliveryLedger: monitoredDeliveryLedger,
        readinessInput: {
          ...cloneReadinessInput(runtime.input, `readiness-${suffix}-changed`),
          deliveryLedger: monitoredDeliveryLedger,
        },
        evaluator: Object.freeze({
          async evaluate() {
            evaluateCalls += 1;
            throw new Error("coordinate conflict must not evaluate");
          },
          async verifyDecision() {
            verifyDecisionCalls += 1;
            throw new Error("coordinate conflict must not verify");
          },
        }),
        evaluatorConfiguration: {
          ...configuration(runtime),
          providerFamilyReference: `provider/${suffix}-changed`,
        },
        originalEvaluationTime: "2026-07-31T00:00:00.000Z",
        replayEvaluatedAt: "2026-07-31T00:00:01.000Z",
        recordedAt: "2026-07-31T00:00:02.000Z",
        expectedLedgerHeadFingerprint: current.ledgerHeadFingerprint,
      };
      Object.assign(candidate, { [field]: reused });
      const result = await monitoredLedger.submitReadinessReplayAttempt(candidate);
      expect(result).toMatchObject({ status: "not-recorded", reason });
      expect(deliveryRecoveryCalls, `${reason}: delivery recovery`).toBe(0);
      expect(evaluateCalls, `${reason}: evaluate`).toBe(0);
      expect(verifyDecisionCalls, `${reason}: verifyDecision`).toBe(0);
      expect(writerCalls, `${reason}: writer`).toBe(0);
      expect(await monitoredLedger.readHead()).toEqual(current);
    }
    expect(
      (await ledger.listReadinessReplayAttempts(transaction.transactionId)).items,
    ).toHaveLength(1);
  });

  it("revalidates replay coordinate ownership against the writer-locked inspection", async () => {
    const { ledger, readinessRoot, runtime, transaction } = await registeredLedger(
      "replay-locked-coordinate",
    );
    const storage = await openLocalFileReadinessLedgerStorage({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    const beforeConflict = await storage.inspect();
    const ownedReplayRequestId = "replay-request-locked-owned";
    const competitor = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-locked-owner",
      replayRequestId: ownedReplayRequestId,
      requestedReplayAttemptId: "replay-attempt-locked-owner",
      requestedReplaySemanticEventId: "replay-semantic-locked-owner",
      requestedReplayAuditEntryId: "replay-audit-locked-owner",
      requestedReplayMarkerId: "replay-marker-locked-owner",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: beforeConflict.state.head.ledgerHeadFingerprint,
    });
    expect(competitor.status).toBe("recorded");
    const afterConflict = await storage.inspect();
    let writerCalls = 0;
    let appendCalls = 0;
    const fencedLedger = createGovernedReadinessEvaluationLedger({
      async inspect() {
        return beforeConflict;
      },
      async withWriter(operation) {
        writerCalls += 1;
        return operation({
          inspection: afterConflict,
          async commitEvent() {
            appendCalls += 1;
            throw new Error("locked replay conflict must not append");
          },
          async replaceDerivedState() {
            throw new Error("locked replay conflict must not replace derived state");
          },
        });
      },
    });
    const result = await fencedLedger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-locked-candidate",
      replayRequestId: ownedReplayRequestId,
      requestedReplayAttemptId: "replay-attempt-locked-candidate",
      requestedReplaySemanticEventId: "replay-semantic-locked-candidate",
      requestedReplayAuditEntryId: "replay-audit-locked-candidate",
      requestedReplayMarkerId: "replay-marker-locked-candidate",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: runtime.evaluator,
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: beforeConflict.state.head.ledgerHeadFingerprint,
    });
    expect(result).toMatchObject({
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      reason: "replay-request-id-conflict",
    });
    expect(writerCalls).toBe(1);
    expect(appendCalls).toBe(0);
    expect((await ledger.readHead()).ledgerHeadFingerprint).toBe(
      afterConflict.state.head.ledgerHeadFingerprint,
    );
  });

  it("allows at most one concurrent replay writer from one observed head", async () => {
    const { ledger, readinessRoot, runtime, transaction } = await registeredLedger("concurrent");
    const second = await openLocalFileReadinessEvaluationLedger({
      ...options(readinessRoot),
      createIfMissing: false,
    });
    const expected = (await ledger.readHead()).ledgerHeadFingerprint;
    const submit = (target: typeof ledger, suffix: string) =>
      target.submitReadinessReplayAttempt({
        replayContractVersion: "1.0",
        replayIdempotencyKey: `replay-key-${suffix}`,
        replayRequestId: `replay-request-${suffix}`,
        requestedReplayAttemptId: `replay-attempt-${suffix}`,
        requestedReplaySemanticEventId: `replay-semantic-${suffix}`,
        requestedReplayAuditEntryId: `replay-audit-${suffix}`,
        requestedReplayMarkerId: `replay-marker-${suffix}`,
        originalTransactionId: transaction.transactionId,
        originalTransactionFingerprint: transaction.transactionFingerprint,
        deliveryLedger: runtime.input.deliveryLedger,
        deliveryIdentity: runtime.input.deliveryIdentity,
        readinessInput: runtime.input,
        evaluator: createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: runtime.transportPolicyAuthority,
        }),
        evaluatorConfiguration: configuration(runtime),
        originalEvaluationTime: runtime.input.evaluatedAt,
        replayEvaluatedAt: runtime.input.evaluatedAt,
        recordedAt: runtime.input.evaluatedAt,
        expectedLedgerHeadFingerprint: expected,
      });
    const results = await Promise.all([
      submit(ledger, "concurrent-a"),
      submit(second, "concurrent-b"),
    ]);
    expect(results.filter((result) => result.status === "recorded")).toHaveLength(1);
    expect(results.filter((result) => result.status === "not-recorded")).toEqual([
      expect.objectContaining({
        replayAppendStatus: "not-appended",
        reason: "operator-cleanup-required",
      }),
    ]);
    expect((await ledger.readHead()).committedReplayAttemptCount).toBe(1);
  });

  it("rebuilds derived state only from verified marker-bounded history", async () => {
    const { ledger, readinessRoot, transaction } = await registeredLedger("rebuild");
    const expectedLookup = await ledger.readOriginalReadinessEvaluation(transaction.transactionId);
    await writeFile(join(readinessRoot, "derived", "indexes.json"), "{}", "utf8");
    const result = await ledger.rebuildDerivedIndexes();
    expect(result.status).toBe("rebuilt");
    expect((await ledger.verifyIntegrity()).derivedIndexStatus).toBe("valid");
    expect(await ledger.readOriginalReadinessEvaluation(transaction.transactionId)).toEqual(
      expectedLookup,
    );
    const marker = JSON.parse(await readFile(join(readinessRoot, "commit-head.json"), "utf8")) as {
      resultingLedgerHead: unknown;
    };
    expect(await readFile(join(readinessRoot, "derived", "HEAD.json"), "utf8")).toBe(
      JSON.stringify(marker.resultingLedgerHead),
    );
  });

  it("reports missing derived state separately without invalidating authority", async () => {
    const { ledger, readinessRoot } = await registeredLedger("missing-derived");
    await unlink(join(readinessRoot, "derived", "indexes.json"));
    const integrity = await ledger.verifyIntegrity();
    expect(integrity.status).toBe("valid");
    expect(integrity.derivedIndexStatus).toBe("missing");
    expect((await ledger.rebuildDerivedIndexes()).status).toBe("rebuilt");
  });

  it("bypasses and deterministically rebuilds corrupt derived state", async () => {
    const { ledger, readinessRoot, transaction } = await registeredLedger("corrupt-derived");
    await writeFile(join(readinessRoot, "derived", "indexes.json"), "{}", "utf8");
    const integrity = await ledger.verifyIntegrity();
    expect(integrity.status).toBe("valid");
    expect(integrity.derivedIndexStatus).toBe("invalid");
    expect(await ledger.readOriginalReadinessEvaluation(transaction.transactionId)).toEqual(
      transaction,
    );
    expect((await ledger.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect((await ledger.verifyIntegrity()).derivedIndexStatus).toBe("valid");
  });

  it("fails closed when a marker-bounded transaction is tampered", async () => {
    const { ledger, readinessRoot } = await registeredLedger("tamper");
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    const eventPath = join(
      readinessRoot,
      "events",
      "registrations",
      directory!,
      "transaction.json",
    );
    const raw = JSON.parse(await readFile(eventPath, "utf8")) as {
      adapterId: string;
    };
    raw.adapterId = "adapter-substituted";
    await writeFile(eventPath, JSON.stringify(raw), "utf8");
    const integrity = await ledger.verifyIntegrity();
    expect(integrity.status).toBe("invalid");
    expect(integrity.findings).toHaveLength(1);
  });

  it.each([
    "latestAuditEntryId",
    "latestAuditEntryFingerprint",
    "latestSemanticEventId",
    "latestSemanticEventFingerprint",
    "latestSubjectTransactionId",
    "latestSubjectTransactionFingerprint",
  ] as const)("rejects substitution of latest authoritative head coordinate %s", async (field) => {
    const { ledger, readinessRoot } = await registeredLedger(`latest-${field}`);
    const registrations = join(readinessRoot, "events", "registrations");
    const [directory] = await readdir(registrations);
    const archive = join(registrations, directory!, "commit-marker.json");
    const current = join(readinessRoot, "commit-head.json");
    const marker = JSON.parse(await readFile(current, "utf8")) as {
      resultingLedgerHead: Record<string, unknown>;
    };
    marker.resultingLedgerHead[field] = field.endsWith("Fingerprint")
      ? "0".repeat(64)
      : `substituted-${field}`;
    const mutated = JSON.stringify(marker);
    await writeFile(current, mutated, "utf8");
    await writeFile(archive, mutated, "utf8");
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
  });

  it("rejects a semantically equal noncanonical authoritative event without repair", async () => {
    const { ledger, readinessRoot } = await registeredLedger("noncanonical-event");
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    const eventPath = join(
      readinessRoot,
      "events",
      "registrations",
      directory!,
      "transaction.json",
    );
    const original = await readFile(eventPath, "utf8");
    const mutated = ` ${original}`;
    await writeFile(eventPath, mutated, "utf8");
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
    expect(await readFile(eventPath, "utf8")).toBe(mutated);
  });

  it("rejects outer re-signing after retained upstream evidence alteration", async () => {
    const { transaction } = await registeredLedger("retained-evidence-resign");
    const unsignedPackage = { ...transaction.evaluationPackage };
    delete (unsignedPackage as Partial<typeof unsignedPackage>).evaluationPackageFingerprint;
    const retainedEvidence = structuredClone(unsignedPackage.retainedEvidence);
    if (retainedEvidence.authorization === null) throw new Error("authorization evidence missing");
    retainedEvidence.authorization.decisionAuthorityReference = "authority/substituted";
    const outerResigned = createCanonicalReadinessEvaluationPackage({
      ...unsignedPackage,
      retainedEvidence,
    });
    expect(() => verifyCanonicalReadinessEvaluationPackage(outerResigned)).toThrow(
      "Durable readiness evidence did not verify",
    );
  });

  it("rejects retained-evidence omission, nested additions, and case or Unicode lookalikes", async () => {
    const { transaction } = await registeredLedger("retained-evidence-structural-matrix");
    const unsigned = { ...transaction.evaluationPackage };
    delete (unsigned as Partial<typeof unsigned>).evaluationPackageFingerprint;
    const variants: readonly [string, (projection: Record<string, unknown>) => void][] = [
      ["required omission", (projection) => delete projection.authorization],
      ["root addition", (projection) => Object.assign(projection, { endpoint: "sentinel" })],
      ["case lookalike", (projection) => Object.assign(projection, { Authorization: null })],
      ["Unicode lookalike", (projection) => Object.assign(projection, { authorizatiоn: null })],
      [
        "nested authorization addition",
        (projection) =>
          Object.assign(projection.authorization as object, { authorizationHeader: "sentinel" }),
      ],
      [
        "nested transport addition",
        (projection) => Object.assign(projection.transportPlan as object, { endpoint: "sentinel" }),
      ],
      [
        "nested observability array addition",
        (projection) => {
          const observability = projection.observability as { metrics?: unknown[] };
          if (observability.metrics?.[0] === undefined) throw new Error("fixture metric missing");
          Object.assign(observability.metrics[0] as object, { providerResponse: "sentinel" });
        },
      ],
    ];
    for (const [label, mutate] of variants) {
      const projection = structuredClone(unsigned.retainedEvidence) as unknown as Record<
        string,
        unknown
      >;
      mutate(projection);
      expect(
        () =>
          createCanonicalReadinessEvaluationPackage({ ...unsigned, retainedEvidence: projection }),
        label,
      ).toThrow();
    }
  });

  it("accepts the exact nested evidence-array bound and rejects one over", async () => {
    const { transaction } = await registeredLedger("retained-evidence-nested-bound");
    const unsigned = { ...transaction.evaluationPackage };
    delete (unsigned as Partial<typeof unsigned>).evaluationPackageFingerprint;
    const retainedEvidence = structuredClone(unsigned.retainedEvidence);
    if (retainedEvidence.observability === null) throw new Error("observability fixture missing");
    const fingerprints = Array.from({ length: 10_000 }, (_, index) =>
      index.toString(16).padStart(64, "0"),
    );
    retainedEvidence.observability.readiness.metricFingerprints = fingerprints;
    expect(
      createCanonicalReadinessEvaluationPackage({ ...unsigned, retainedEvidence }).retainedEvidence
        .observability?.readiness.metricFingerprints,
    ).toHaveLength(10_000);
    const overBoundEvidence = structuredClone(unsigned.retainedEvidence);
    if (overBoundEvidence.observability === null) throw new Error("observability fixture missing");
    overBoundEvidence.observability.readiness.metricFingerprints = [
      ...fingerprints,
      "f".repeat(64),
    ];
    expect(() =>
      createCanonicalReadinessEvaluationPackage({
        ...unsigned,
        retainedEvidence: overBoundEvidence,
      }),
    ).toThrow();
  });

  it("accepts the exact 14-entry gate-trace bound and rejects one over", async () => {
    const { transaction } = await registeredLedger("gate-trace-bound");
    const { evaluationPackageFingerprint: _fingerprint, ...unsigned } =
      transaction.evaluationPackage;
    void _fingerprint;
    expect(unsigned.gateTrace).toHaveLength(14);
    expect(createCanonicalReadinessEvaluationPackage(unsigned).gateTrace).toHaveLength(14);
    expect(() =>
      createCanonicalReadinessEvaluationPackage({
        ...unsigned,
        gateTrace: [...unsigned.gateTrace, unsigned.gateTrace[0]!],
      }),
    ).toThrow();
  });

  it.each([
    "sequence-rename",
    "marker-rename",
    "cross-category",
    "duplicate-location",
    "unexpected-current-location",
    "directory-content-mismatch",
  ] as const)("rejects authoritative event physical-location mutation: %s", async (variant) => {
    const { ledger, readinessRoot } = await registeredLedger(`location-${variant}`);
    const registrations = join(readinessRoot, "events", "registrations");
    const replays = join(readinessRoot, "events", "replay-attempts");
    const [directory] = await readdir(registrations);
    const source = join(registrations, directory!);
    if (variant === "sequence-rename") {
      await rename(
        source,
        join(registrations, `000000000999-${directory!.split("-").slice(1).join("-")}`),
      );
    } else if (variant === "marker-rename") {
      await rename(source, join(registrations, "000000000001-marker-renamed"));
    } else if (variant === "unexpected-current-location") {
      await copyFile(
        join(readinessRoot, "commit-head.json"),
        join(registrations, "commit-head.json"),
      );
    } else if (variant === "directory-content-mismatch") {
      const transactionPath = join(source, "transaction.json");
      const bytes = await readFile(transactionPath, "utf8");
      await writeFile(
        transactionPath,
        bytes.replace(`transaction-location-${variant}`, `transaction-location-substitute`),
        "utf8",
      );
    } else {
      const target = join(replays, directory!);
      if (variant === "cross-category") {
        await rename(source, target);
      } else {
        await mkdir(target);
        for (const file of await readdir(source)) {
          await copyFile(join(source, file), join(target, file));
        }
      }
    }
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
  });

  it("rejects a replay event moved into the registration category", async () => {
    const { ledger, readinessRoot, runtime, transaction } = await registeredLedger(
      "location-replay-as-registration",
    );
    const replay = await ledger.submitReadinessReplayAttempt({
      replayContractVersion: "1.0",
      replayIdempotencyKey: "replay-key-location-category",
      replayRequestId: "replay-request-location-category",
      requestedReplayAttemptId: "replay-attempt-location-category",
      requestedReplaySemanticEventId: "replay-semantic-location-category",
      requestedReplayAuditEntryId: "replay-audit-location-category",
      requestedReplayMarkerId: "replay-marker-location-category",
      originalTransactionId: transaction.transactionId,
      originalTransactionFingerprint: transaction.transactionFingerprint,
      deliveryLedger: runtime.input.deliveryLedger,
      deliveryIdentity: runtime.input.deliveryIdentity,
      readinessInput: runtime.input,
      evaluator: createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: runtime.transportPolicyAuthority,
      }),
      evaluatorConfiguration: configuration(runtime),
      originalEvaluationTime: runtime.input.evaluatedAt,
      replayEvaluatedAt: runtime.input.evaluatedAt,
      recordedAt: runtime.input.evaluatedAt,
      expectedLedgerHeadFingerprint: (await ledger.readHead()).ledgerHeadFingerprint,
    });
    expect(replay.status).toBe("recorded");
    const replayRoot = join(readinessRoot, "events", "replay-attempts");
    const [replayDirectory] = await readdir(replayRoot);
    await rename(
      join(replayRoot, replayDirectory!),
      join(readinessRoot, "events", "registrations", replayDirectory!),
    );
    expect((await ledger.verifyIntegrity()).status).toBe("invalid");
  });

  it("fails closed when archived and current marker bytes differ", async () => {
    const { ledger, readinessRoot } = await registeredLedger("marker-mismatch");
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    const markerPath = join(
      readinessRoot,
      "events",
      "registrations",
      directory!,
      "commit-marker.json",
    );
    await writeFile(markerPath, "{}", "utf8");
    expect((await ledger.recover()).status).toBe("failed");
  });

  it("fails closed when a marker-bounded committed archive is missing", async () => {
    const { ledger, readinessRoot } = await registeredLedger("missing-committed-archive");
    const [directory] = await readdir(join(readinessRoot, "events", "registrations"));
    await unlink(join(readinessRoot, "events", "registrations", directory!, "commit-marker.json"));
    expect((await ledger.recover()).status).toBe("failed");
  });

  it("rejects runtime/source overlap before mutation", async () => {
    await expect(
      openLocalFileReadinessLedgerStorage({
        ...options(join(REPOSITORY_ROOT, "docs", "unsafe-ledger")),
      }),
    ).rejects.toMatchObject({ code: "unsafe-filesystem-state" });
  });

  it("keeps the storage port separate from the governed public facade", async () => {
    const runtimeRoot = await root("port");
    const storage = await openLocalFileReadinessLedgerStorage(options(runtimeRoot));
    const facade = createGovernedReadinessEvaluationLedger(storage);
    expect(Object.keys(facade).some((key) => /commit|marker|append|writer/iu.test(key))).toBe(
      false,
    );
    expect((await facade.verifyIntegrity()).status).toBe("valid");
  });
});
