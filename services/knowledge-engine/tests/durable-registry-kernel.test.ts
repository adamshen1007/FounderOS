import { describe, expect, it } from "vitest";

import {
  KnowledgeObjectSchema,
  type ActivationAuditRecord,
  type CommittedRegistryTransactionEnvelope,
  type DurableAuditRecord,
  type DurableGovernedChangeSetRecord,
  type DurableLifecycleTransitionRecord,
  type DurablePreviousRecordFingerprint,
  type DurableReviewDecisionRecord,
  type DurableSnapshotRegistrationRecord,
  type KnowledgeGovernedChangeSet,
  type KnowledgeRepositorySnapshot,
  type RegistryTransactionType,
} from "@founderos/knowledge-schema";

import {
  createKnowledgeRepositorySnapshot,
  createKnowledgeSnapshotComparisonEvidence,
  generateKnowledgeGovernedChangeSet,
} from "../src/index.js";
import { createCanonicalSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import {
  DurableRegistryConflictError,
  DurableRegistryIntegrityError,
  type DurableAuditRecordContent,
  type UnsignedDurableAuditRecord,
  areCommittedRegistryTransactionsIdempotent,
  assertCommittedRegistryTransactionIdempotency,
  createCommittedRegistryTransactionEnvelope,
  createCommittedRegistryTransactionEnvelopeFingerprint,
  createDurableAuditRecord,
  createDurableAuditRecordFingerprint,
  createDurableSnapshotManifestFingerprint,
  recoverCommittedRegistry,
  replayCommittedRegistryTransactions,
  serializeCanonicalDurablePayload,
  verifyCommittedRegistryIntegrity,
  verifyCommittedRegistryTransactionEnvelopeFingerprint,
  verifyDurableAuditRecordFingerprint,
} from "../src/domain/durable-registry.js";
import { createAdapterManifestEvidence } from "./durable-registry-adapter-fixtures.js";
import { document, generalKnowledgeObject, metadata } from "./snapshot-lifecycle-fixtures.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CREATED_AT = "2026-07-28T00:00:00Z";

interface ChainBuilder {
  envelopes: CommittedRegistryTransactionEnvelope[];
  lastRecordFingerprint: DurablePreviousRecordFingerprint;
  lastSequence: number;
}

interface ApprovedCandidate {
  changeSetFingerprint: string;
  changeSetId: string;
  decisionFingerprint: string;
  decisionId: string;
  snapshot: KnowledgeRepositorySnapshot;
}

interface ReviewedCandidate {
  changeSetFingerprint: string;
  changeSetId: string;
  snapshot: KnowledgeRepositorySnapshot;
}

function createChainBuilder(): ChainBuilder {
  return { envelopes: [], lastRecordFingerprint: "genesis", lastSequence: 0 };
}

type MigrationDocument = ReturnType<typeof document>;

function snapshot(
  corpusVersion: string,
  documents: readonly MigrationDocument[] = [],
): KnowledgeRepositorySnapshot {
  return createKnowledgeRepositorySnapshot({
    corpus: {
      schemaVersion: "1.0",
      corpusId: "founderos-priority-1",
      corpusVersion,
      sourceManifestReference: "knowledge/migration-manifest.yaml",
      source: {
        schemaVersion: "1.0",
        sourceId: "founderos-priority-1",
        sourceType: "knowledge_corpus",
        provenance: {
          sourceType: "migration_manifest",
          sourceReference: "knowledge/migration-manifest.yaml",
          originalCreator: "FounderOS",
        },
      },
    },
    creation: { createdAt: CREATED_AT, createdBy: "knowledge-engine" },
    documents,
  });
}

function appendRecord<T extends DurableAuditRecord>(
  chain: ChainBuilder,
  transactionId: string,
  content: DurableAuditRecordContent<T>,
): T {
  const unsigned = {
    ...content,
    transactionId,
    sequence: chain.lastSequence + 1,
    previousRecordFingerprint: chain.lastRecordFingerprint,
  } as UnsignedDurableAuditRecord<T>;
  const record = createDurableAuditRecord<T>(unsigned);
  chain.lastSequence = record.sequence;
  chain.lastRecordFingerprint = record.recordFingerprint;
  return record;
}

function appendEnvelope(
  chain: ChainBuilder,
  transactionType: RegistryTransactionType,
  transactionId: string,
  records: readonly DurableAuditRecord[],
  committedAt: string,
): CommittedRegistryTransactionEnvelope {
  const envelope = createCommittedRegistryTransactionEnvelope({
    transactionType,
    transactionId,
    records,
    committedAt,
  });
  chain.envelopes.push(envelope);
  return envelope;
}

function appendRegistration(
  chain: ChainBuilder,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
): DurableSnapshotRegistrationRecord {
  const transactionId = `transaction-register-${label}`;
  const manifestEvidence = createAdapterManifestEvidence(candidate);
  const record = appendRecord<DurableSnapshotRegistrationRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "snapshot_registration",
    registrationId: `registration-${candidate.snapshotId}`,
    snapshotContractVersion: "1.0",
    snapshot: candidate,
    manifestEvidence,
    manifestFingerprint: createDurableSnapshotManifestFingerprint(manifestEvidence),
    provenanceSummary: {
      corpusId: candidate.corpusId,
      corpusVersion: candidate.corpusVersion,
      sourceManifestReference: candidate.sourceManifestReference,
      snapshotCreatedAt: candidate.creation.createdAt,
      snapshotCreatedBy: candidate.creation.createdBy,
    },
    actorId: "knowledge-engine",
    actorType: "service",
    reason: "Register the immutable snapshot.",
    registeredAt: "2026-07-28T00:01:00Z",
  });
  appendEnvelope(chain, "registration", transactionId, [record], "2026-07-28T00:01:01Z");
  return record;
}

function appendLifecycleReview(
  chain: ChainBuilder,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  changeSetId: string,
  changeSetFingerprint: string,
): ReviewedCandidate {
  const validationTransactionId = `transaction-validate-${label}`;
  const validation = appendRecord<DurableLifecycleTransitionRecord>(
    chain,
    validationTransactionId,
    {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: `transition-validate-${label}`,
      snapshotId: candidate.snapshotId,
      from: "created",
      to: "validated",
      actorId: "validator",
      actorType: "service",
      reason: "Validate the registered snapshot.",
      transitionedAt: "2026-07-28T00:03:00Z",
      evidence: {
        changeSetId: null,
        changeSetFingerprint: null,
        decisionId: null,
        decisionFingerprint: null,
        activationId: null,
      },
    },
  );
  appendEnvelope(chain, "lifecycle", validationTransactionId, [validation], "2026-07-28T00:03:01Z");

  const reviewTransactionId = `transaction-review-${label}`;
  const review = appendRecord<DurableLifecycleTransitionRecord>(chain, reviewTransactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-review-${label}`,
    snapshotId: candidate.snapshotId,
    from: "validated",
    to: "reviewing",
    actorId: "reviewer",
    actorType: "human",
    reason: "Begin governed review.",
    transitionedAt: "2026-07-28T00:04:00Z",
    evidence: {
      changeSetId,
      changeSetFingerprint,
      decisionId: null,
      decisionFingerprint: null,
      activationId: null,
    },
  });
  appendEnvelope(chain, "lifecycle", reviewTransactionId, [review], "2026-07-28T00:04:01Z");

  return { snapshot: candidate, changeSetId, changeSetFingerprint };
}

function appendApprovalDecision(
  chain: ChainBuilder,
  reviewed: ReviewedCandidate,
  label: string,
  overrides: Partial<Pick<ReviewedCandidate, "changeSetFingerprint" | "changeSetId">> = {},
): ApprovedCandidate {
  const changeSetId = overrides.changeSetId ?? reviewed.changeSetId;
  const changeSetFingerprint = overrides.changeSetFingerprint ?? reviewed.changeSetFingerprint;
  const decisionId = `decision-approve-${label}`;
  const decisionTransactionId = `transaction-approve-${label}`;
  const decision = appendRecord<DurableReviewDecisionRecord>(chain, decisionTransactionId, {
    schemaVersion: "1.0",
    recordType: "review_decision",
    decisionId,
    reviewDecision: {
      changeId: changeSetId,
      proposedSnapshotId: reviewed.snapshot.snapshotId,
      decision: "approved",
      actorId: "founder",
      decidedAt: "2026-07-28T00:05:00Z",
      reason: "Approve the governed snapshot.",
    },
    changeSetFingerprint,
    proposedSnapshotFingerprint: reviewed.snapshot.contentFingerprint,
    actorId: "founder",
    actorType: "human",
    reason: "Approve the governed snapshot.",
    decidedAt: "2026-07-28T00:05:00Z",
  });
  const approval = appendRecord<DurableLifecycleTransitionRecord>(chain, decisionTransactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-approve-${label}`,
    snapshotId: reviewed.snapshot.snapshotId,
    from: "reviewing",
    to: "approved",
    actorId: "founder",
    actorType: "human",
    reason: "Approve the governed snapshot.",
    transitionedAt: "2026-07-28T00:05:00Z",
    evidence: {
      changeSetId,
      changeSetFingerprint,
      decisionId,
      decisionFingerprint: decision.recordFingerprint,
      activationId: null,
    },
  });
  appendEnvelope(
    chain,
    "decision",
    decisionTransactionId,
    [decision, approval],
    "2026-07-28T00:05:01Z",
  );

  return {
    snapshot: reviewed.snapshot,
    changeSetId,
    changeSetFingerprint,
    decisionId,
    decisionFingerprint: decision.recordFingerprint,
  };
}

function appendRejectionDecision(
  chain: ChainBuilder,
  reviewed: ReviewedCandidate,
  label: string,
): DurableReviewDecisionRecord {
  const transactionId = `transaction-reject-${label}`;
  const decision = appendRecord<DurableReviewDecisionRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "review_decision",
    decisionId: `decision-reject-${label}`,
    reviewDecision: {
      changeId: reviewed.changeSetId,
      proposedSnapshotId: reviewed.snapshot.snapshotId,
      decision: "rejected",
      actorId: "founder",
      decidedAt: "2026-07-28T00:05:00Z",
      reason: "Reject the governed snapshot.",
    },
    changeSetFingerprint: reviewed.changeSetFingerprint,
    proposedSnapshotFingerprint: reviewed.snapshot.contentFingerprint,
    actorId: "founder",
    actorType: "human",
    reason: "Reject the governed snapshot.",
    decidedAt: "2026-07-28T00:05:00Z",
  });
  appendEnvelope(chain, "decision", transactionId, [decision], "2026-07-28T00:05:01Z");
  return decision;
}

function appendBootstrapReview(
  chain: ChainBuilder,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  documents: readonly MigrationDocument[] = [],
): ReviewedCandidate {
  appendRegistration(chain, candidate, label);
  const addedObjects = createKnowledgeSnapshotComparisonEvidence({
    snapshot: candidate,
    documents,
  }).objects;

  const changeSetId = `change-bootstrap-to-${candidate.snapshotId}`;
  const changeSetTransactionId = `transaction-change-set-${label}`;
  const changeSet = appendRecord(chain, changeSetTransactionId, {
    schemaVersion: "1.0",
    recordType: "governed_change_set",
    changeSetId,
    evidence: {
      evidenceType: "bootstrap",
      changeSet: {
        schemaVersion: "1.0",
        changeSetType: "bootstrap",
        changeId: changeSetId,
        sourceSnapshotId: null,
        sourceSnapshotFingerprint: null,
        targetSnapshotId: candidate.snapshotId,
        targetSnapshotFingerprint: candidate.contentFingerprint,
        targetManifestReference: candidate.sourceManifestReference,
        targetCorpusVersion: candidate.corpusVersion,
        addedObjects,
        reviewStatus: "pending",
        changed: true,
      },
    },
    actorId: "knowledge-engine",
    actorType: "service",
    reason: "Record the bootstrap change set.",
    recordedAt: "2026-07-28T00:02:00Z",
  });
  appendEnvelope(chain, "change_set", changeSetTransactionId, [changeSet], "2026-07-28T00:02:01Z");
  return appendLifecycleReview(chain, candidate, label, changeSetId, changeSet.recordFingerprint);
}

function appendBootstrapApproval(
  chain: ChainBuilder,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  documents: readonly MigrationDocument[] = [],
): ApprovedCandidate {
  const reviewed = appendBootstrapReview(chain, candidate, label, documents);
  return appendApprovalDecision(chain, reviewed, label);
}

function appendBootstrapActivation(
  chain: ChainBuilder,
  candidate: ApprovedCandidate,
  label: string,
  overrides: Partial<
    Pick<
      ApprovedCandidate,
      "changeSetFingerprint" | "changeSetId" | "decisionFingerprint" | "decisionId"
    >
  > = {},
): CommittedRegistryTransactionEnvelope {
  const transactionId = `transaction-activate-${label}`;
  const activationId = `activation-${label}`;
  const changeSetId = overrides.changeSetId ?? candidate.changeSetId;
  const changeSetFingerprint = overrides.changeSetFingerprint ?? candidate.changeSetFingerprint;
  const decisionId = overrides.decisionId ?? candidate.decisionId;
  const decisionFingerprint = overrides.decisionFingerprint ?? candidate.decisionFingerprint;
  const activation = appendRecord<DurableLifecycleTransitionRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-activate-${label}`,
    snapshotId: candidate.snapshot.snapshotId,
    from: "approved",
    to: "active",
    actorId: "founder",
    actorType: "human",
    reason: "Activate the approved snapshot.",
    transitionedAt: "2026-07-28T00:06:00Z",
    evidence: {
      changeSetId,
      changeSetFingerprint,
      decisionId,
      decisionFingerprint,
      activationId,
    },
  });
  const audit = appendRecord<ActivationAuditRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "activation_audit",
    activationId,
    candidateSnapshotId: candidate.snapshot.snapshotId,
    candidateSnapshotFingerprint: candidate.snapshot.contentFingerprint,
    previousActiveSnapshotId: null,
    previousActiveSnapshotFingerprint: null,
    expectedActiveSnapshotId: null,
    changeSetType: "bootstrap",
    changeSetId,
    changeSetFingerprint,
    approvalDecisionId: decisionId,
    approvalDecisionFingerprint: decisionFingerprint,
    candidateActivationTransitionId: activation.transitionId,
    previousActiveSupersessionTransitionId: null,
    resultingActiveSnapshotId: candidate.snapshot.snapshotId,
    actorId: "founder",
    actorType: "human",
    reason: "Activate the approved snapshot.",
    activatedAt: "2026-07-28T00:06:00Z",
  });
  return appendEnvelope(
    chain,
    "activation",
    transactionId,
    [activation, audit],
    "2026-07-28T00:06:01Z",
  );
}

interface ReplacementReviewOptions {
  baselineDocuments?: readonly MigrationDocument[];
  candidateDocuments?: readonly MigrationDocument[];
  mutateChangeSet?: (changeSet: KnowledgeGovernedChangeSet) => void;
}

function appendComparisonChangeSet(
  chain: ChainBuilder,
  baseline: KnowledgeRepositorySnapshot,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  options: ReplacementReviewOptions = {},
): DurableGovernedChangeSetRecord {
  const generatedChangeSet = generateKnowledgeGovernedChangeSet({
    currentSnapshot: baseline,
    currentSnapshotEvidence: createKnowledgeSnapshotComparisonEvidence({
      snapshot: baseline,
      documents: options.baselineDocuments ?? [],
    }),
    proposedSnapshot: candidate,
    proposedSnapshotEvidence: createKnowledgeSnapshotComparisonEvidence({
      snapshot: candidate,
      documents: options.candidateDocuments ?? [],
    }),
  });
  const governedChangeSet = structuredClone(generatedChangeSet);
  options.mutateChangeSet?.(governedChangeSet);
  const transactionId = `transaction-change-set-${label}`;
  const changeSet = appendRecord<DurableGovernedChangeSetRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "governed_change_set",
    changeSetId: governedChangeSet.changeId,
    evidence: { evidenceType: "comparison", changeSet: governedChangeSet },
    actorId: "knowledge-engine",
    actorType: "service",
    reason: "Record the replacement change set.",
    recordedAt: "2026-07-28T00:02:00Z",
  });
  appendEnvelope(chain, "change_set", transactionId, [changeSet], "2026-07-28T00:02:01Z");
  return changeSet;
}

function appendReplacementReview(
  chain: ChainBuilder,
  baseline: KnowledgeRepositorySnapshot,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  options: ReplacementReviewOptions = {},
): ReviewedCandidate {
  appendRegistration(chain, candidate, label);
  const changeSet = appendComparisonChangeSet(chain, baseline, candidate, label, options);
  return appendLifecycleReview(
    chain,
    candidate,
    label,
    changeSet.changeSetId,
    changeSet.recordFingerprint,
  );
}

function appendReplacementApproval(
  chain: ChainBuilder,
  baseline: KnowledgeRepositorySnapshot,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  options: ReplacementReviewOptions = {},
): ApprovedCandidate {
  const reviewed = appendReplacementReview(chain, baseline, candidate, label, options);
  return appendApprovalDecision(chain, reviewed, label);
}

function appendReplacementActivation(
  chain: ChainBuilder,
  baseline: KnowledgeRepositorySnapshot,
  candidate: ApprovedCandidate,
  label: string,
): void {
  const transactionId = `transaction-activate-${label}`;
  const activationId = `activation-${label}`;
  const reason = "Activate the replacement and supersede its baseline.";
  const activatedAt = "2026-07-28T00:07:00Z";
  const candidateTransition = appendRecord<DurableLifecycleTransitionRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-activate-${label}`,
    snapshotId: candidate.snapshot.snapshotId,
    from: "approved",
    to: "active",
    actorId: "founder",
    actorType: "human",
    reason,
    transitionedAt: activatedAt,
    evidence: {
      changeSetId: candidate.changeSetId,
      changeSetFingerprint: candidate.changeSetFingerprint,
      decisionId: candidate.decisionId,
      decisionFingerprint: candidate.decisionFingerprint,
      activationId,
    },
  });
  const supersessionTransition = appendRecord<DurableLifecycleTransitionRecord>(
    chain,
    transactionId,
    {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: `transition-supersede-${label}`,
      snapshotId: baseline.snapshotId,
      from: "active",
      to: "superseded",
      actorId: "founder",
      actorType: "human",
      reason,
      transitionedAt: activatedAt,
      evidence: {
        changeSetId: null,
        changeSetFingerprint: null,
        decisionId: null,
        decisionFingerprint: null,
        activationId,
      },
    },
  );
  const audit = appendRecord<ActivationAuditRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "activation_audit",
    activationId,
    candidateSnapshotId: candidate.snapshot.snapshotId,
    candidateSnapshotFingerprint: candidate.snapshot.contentFingerprint,
    previousActiveSnapshotId: baseline.snapshotId,
    previousActiveSnapshotFingerprint: baseline.contentFingerprint,
    expectedActiveSnapshotId: baseline.snapshotId,
    changeSetType: "comparison",
    changeSetId: candidate.changeSetId,
    changeSetFingerprint: candidate.changeSetFingerprint,
    approvalDecisionId: candidate.decisionId,
    approvalDecisionFingerprint: candidate.decisionFingerprint,
    candidateActivationTransitionId: candidateTransition.transitionId,
    previousActiveSupersessionTransitionId: supersessionTransition.transitionId,
    resultingActiveSnapshotId: candidate.snapshot.snapshotId,
    actorId: "founder",
    actorType: "human",
    reason,
    activatedAt,
  });
  appendEnvelope(
    chain,
    "activation",
    transactionId,
    [candidateTransition, supersessionTransition, audit],
    "2026-07-28T00:07:01Z",
  );
}

function completeBootstrapHistory(corpusVersion = "v1"): ChainBuilder {
  const chain = createChainBuilder();
  const candidate = appendBootstrapApproval(chain, snapshot(corpusVersion), corpusVersion);
  appendBootstrapActivation(chain, candidate, corpusVersion);
  return chain;
}

describe("durable registry canonical records", () => {
  it("omits schema-valid explicit undefined object properties before durable fingerprinting", () => {
    const decisionMetadata = metadata("durable-optional", "decision");
    const explicitObject = KnowledgeObjectSchema.parse({
      metadata: {
        ...decisionMetadata,
        category: undefined,
        source: { ...decisionMetadata.source, author: undefined },
      },
      context: "Context",
      problem: "Problem",
      options: ["A", "B"],
      chosenOption: "A",
      reasoning: "Reason",
      expectedOutcome: "Outcome",
      risks: [],
      relatedProjectIds: [],
      reviewDate: "2026-08-28T00:00:00.000Z",
      result: undefined,
      lessonsLearned: [],
    });
    const explicitDocument = document(explicitObject);
    const baseline = snapshot("durable-optional-baseline");
    const candidate = snapshot("durable-optional-candidate", [explicitDocument]);
    const record = appendComparisonChangeSet(
      createChainBuilder(),
      baseline,
      candidate,
      "durable-optional",
      { baselineDocuments: [], candidateDocuments: [explicitDocument] },
    );
    if (record.evidence.evidenceType !== "comparison") {
      throw new Error("Expected comparison evidence");
    }
    const addedObject = record.evidence.changeSet.addedObjects[0]?.object;
    if (addedObject === undefined || !("result" in explicitObject)) {
      throw new Error("Expected decision evidence");
    }

    expect(Object.hasOwn(explicitObject, "result")).toBe(true);
    expect(Object.hasOwn(addedObject, "result")).toBe(false);
    expect(Object.hasOwn(addedObject.metadata, "category")).toBe(false);
    expect(Object.hasOwn(addedObject.metadata.source, "author")).toBe(false);
    expect(verifyDurableAuditRecordFingerprint(record)).toEqual(record);
  });

  it.each([
    [
      "accessor",
      (): unknown => {
        const value: Record<string, unknown> = {};
        Object.defineProperty(value, "value", { enumerable: true, get: () => "unsafe" });
        return value;
      },
    ],
    [
      "class instance",
      (): unknown =>
        new (class Unsupported {
          public value = "unsafe";
        })(),
    ],
    ["non-finite number", (): unknown => Number.NaN],
    [
      "sparse array",
      (): unknown => {
        const value = new Array<unknown>(2);
        value[1] = "unsafe";
        return value;
      },
    ],
    ["undefined array element", (): unknown => [undefined]],
    ["function", (): unknown => (): void => undefined],
    ["symbol", (): unknown => Symbol("unsafe")],
    ["bigint", (): unknown => 1n],
    [
      "cycle",
      (): unknown => {
        const value: Record<string, unknown> = {};
        value.self = value;
        return value;
      },
    ],
    [
      "unsafe key",
      (): unknown => {
        const value: Record<string, unknown> = {};
        Object.defineProperty(value, "__proto__", { enumerable: true, value: "unsafe" });
        return value;
      },
    ],
  ])("rejects builder-only unsafe %s values", (_label, createValue) => {
    const historical = completeBootstrapHistory().envelopes[0]!.records[0]!;
    const { recordFingerprint: _recordFingerprint, ...unsigned } = structuredClone(historical);
    void _recordFingerprint;
    (unsigned as unknown as Record<string, unknown>).reason = createValue();
    expect(() => createDurableAuditRecord(unsigned)).toThrowError(
      expect.objectContaining({ code: "invalid_durable_record" }),
    );
  });

  it("serializes canonical payloads without insertion-order or machine-path influence", () => {
    const first = {
      zeta: [3, { beta: true, alpha: null }],
      alpha: "portable",
      omitted: undefined,
    };
    const reordered = {
      omitted: undefined,
      alpha: "portable",
      zeta: [3, { alpha: null, beta: true }],
    };

    expect(serializeCanonicalDurablePayload(first)).toBe(
      '{"alpha":"portable","zeta":[3,{"alpha":null,"beta":true}]}',
    );
    expect(serializeCanonicalDurablePayload(reordered)).toBe(
      serializeCanonicalDurablePayload(first),
    );
    expect(serializeCanonicalDurablePayload(first)).not.toContain(process.cwd());
  });

  it("preserves the historical serializer treatment of undefined properties and arrays", () => {
    const sparse = new Array<unknown>(3);
    sparse[0] = undefined;
    sparse[2] = 3;
    const historicalPayload = {
      zeta: sparse,
      alpha: "portable",
      omitted: undefined,
    };

    expect(serializeCanonicalDurablePayload(historicalPayload)).toBe(
      '{"alpha":"portable","zeta":[null,,3]}',
    );
    expect(createCanonicalSha256Fingerprint(historicalPayload)).toBe(
      "f1fe9618fc0cd25c5ceb3eec60bf0173b83f73a0cebe520be21ef4f5f85aebc5",
    );
  });

  it("rejects non-canonical JSON values only from durable manifest commitments", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = new Array<unknown>(2);
    sparse[1] = "present";
    class UnsupportedClass {
      public readonly value = "class-instance";
    }
    const unsupported: unknown[] = [
      new Date("2026-07-28T00:00:00Z"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      new UnsupportedClass(),
      undefined,
      (): void => undefined,
      Symbol("unsupported"),
      cyclic,
      sparse,
    ];

    const candidate = snapshot("canonical-manifest", [
      document(generalKnowledgeObject("canonical-manifest")),
    ]);
    const finiteEvidence = createAdapterManifestEvidence(candidate);
    (
      finiteEvidence.manifest.documents[0] as unknown as {
        objectData: Record<string, unknown>;
      }
    ).objectData = { finite: -42.5 };
    expect(createDurableSnapshotManifestFingerprint(finiteEvidence)).toMatch(/^[a-f0-9]{64}$/u);

    for (const value of unsupported) {
      const evidence = createAdapterManifestEvidence(candidate);
      (
        evidence.manifest.documents[0] as unknown as {
          objectData: Record<string, unknown>;
        }
      ).objectData = { unsupported: value };
      expect(() => createDurableSnapshotManifestFingerprint(evidence)).toThrowError(
        expect.objectContaining({
          name: "CanonicalSerializationError",
          code: "unsupported_canonical_value",
          message: "Canonical serialization supports only finite canonical JSON values",
        }),
      );
    }
  });

  it("builds and independently recomputes immutable record and envelope fingerprints", () => {
    const chain = completeBootstrapHistory();
    const envelope = chain.envelopes[0]!;
    const record = envelope.records[0]!;

    expect(createDurableAuditRecordFingerprint(record)).toBe(record.recordFingerprint);
    expect(createCommittedRegistryTransactionEnvelopeFingerprint(envelope)).toBe(
      envelope.envelopeFingerprint,
    );
    expect(verifyDurableAuditRecordFingerprint(record)).toEqual(record);
    expect(verifyCommittedRegistryTransactionEnvelopeFingerprint(envelope)).toEqual(envelope);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(envelope.records)).toBe(true);
  });

  it("rejects raw record prototypes and discriminator descriptors before cloning", () => {
    const record = completeBootstrapHistory().envelopes[0]!.records[0]!;
    const stableError = expect.objectContaining({
      name: "DurableRegistryIntegrityError",
      code: "invalid_durable_record",
      message:
        "Durable audit record must be a plain object with a valid own enumerable data recordType property",
    });

    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(record, "recordType")).toMatchObject({
      enumerable: true,
      value: "snapshot_registration",
    });
    expect(verifyDurableAuditRecordFingerprint(record)).toEqual(record);

    let discriminatorReadCount = 0;
    const accessorRecord = structuredClone(record) as unknown as Record<string, unknown>;
    Object.defineProperty(accessorRecord, "recordType", {
      configurable: true,
      enumerable: true,
      get: () => {
        discriminatorReadCount += 1;
        return "snapshot_registration";
      },
    });
    expect(() => verifyDurableAuditRecordFingerprint(accessorRecord)).toThrowError(stableError);
    expect(discriminatorReadCount).toBe(0);

    class UnsupportedRecord {}
    const nonPlainRecord = Object.assign(new UnsupportedRecord(), structuredClone(record));
    expect(() => verifyDurableAuditRecordFingerprint(nonPlainRecord)).toThrowError(stableError);

    const nonEnumerableRecord = structuredClone(record) as unknown as Record<string, unknown>;
    Object.defineProperty(nonEnumerableRecord, "recordType", {
      configurable: true,
      enumerable: false,
      value: "snapshot_registration",
      writable: true,
    });
    expect(() => verifyDurableAuditRecordFingerprint(nonEnumerableRecord)).toThrowError(
      stableError,
    );

    const invalidLiteralRecord = structuredClone(record) as unknown as Record<string, unknown>;
    invalidLiteralRecord.recordType = "unsupported_record";
    expect(() => verifyDurableAuditRecordFingerprint(invalidLiteralRecord)).toThrowError(
      stableError,
    );
  });

  it.each([
    "transactionId",
    "sequence",
    "registrationId",
    "transitionId",
    "decisionId",
    "changeSetId",
    "activationId",
  ])("does not invoke a throwing %s accessor while locating raw record errors", (field) => {
    const record = structuredClone(
      completeBootstrapHistory().envelopes[0]!.records[0]!,
    ) as unknown as Record<string, unknown>;
    if (field.endsWith("Id") && field !== "transactionId") {
      for (const recordId of [
        "registrationId",
        "transitionId",
        "decisionId",
        "changeSetId",
        "activationId",
      ]) {
        delete record[recordId];
      }
    }
    let getterReadCount = 0;
    Object.defineProperty(record, field, {
      configurable: true,
      enumerable: true,
      get: () => {
        getterReadCount += 1;
        throw new Error(`Unexpected ${field} getter read`);
      },
    });

    expect(() => verifyDurableAuditRecordFingerprint(record)).toThrowError(
      expect.objectContaining({
        name: "DurableRegistryIntegrityError",
        code: "invalid_durable_record",
      }),
    );
    expect(getterReadCount).toBe(0);
  });

  it("rejects raw normalization changes and preserves explicit builder canonicalization", () => {
    const historical = completeBootstrapHistory().envelopes[0]!;
    const historicalRecord = historical.records[0]!;
    if (historicalRecord.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    const whitespaceRecord = structuredClone(historicalRecord);
    whitespaceRecord.reason = `  ${whitespaceRecord.reason}  `;
    expect(() => verifyDurableAuditRecordFingerprint(whitespaceRecord)).toThrowError(
      expect.objectContaining({ code: "record_fingerprint_mismatch" }),
    );

    const defaultChain = createChainBuilder();
    const defaultCandidate = snapshot("raw-default-field", [
      document(generalKnowledgeObject("raw-default-field")),
    ]);
    const defaultRecord = structuredClone(
      appendRegistration(defaultChain, defaultCandidate, "raw-default-field"),
    );
    delete (defaultRecord.manifestEvidence.manifest.documents[0] as Record<string, unknown>)
      .objectData;
    expect(() => verifyDurableAuditRecordFingerprint(defaultRecord)).toThrowError(
      expect.objectContaining({
        code: expect.stringMatching(/fingerprint|canonical|manifest/u),
      }),
    );

    const { recordFingerprint: _recordFingerprint, ...unsignedRecord } =
      structuredClone(historicalRecord);
    void _recordFingerprint;
    const normalizedRecord = createDurableAuditRecord<DurableSnapshotRegistrationRecord>({
      ...unsignedRecord,
      reason: `  ${unsignedRecord.reason}  `,
    });
    expect(normalizedRecord.reason).toBe(unsignedRecord.reason);
    expect(verifyDurableAuditRecordFingerprint(normalizedRecord)).toEqual(normalizedRecord);

    const normalizedEnvelope = createCommittedRegistryTransactionEnvelope({
      transactionType: "registration",
      transactionId: `  ${normalizedRecord.transactionId}  `,
      records: [normalizedRecord],
      committedAt: historical.committedAt,
    });
    expect(normalizedEnvelope.transactionId).toBe(normalizedRecord.transactionId);
    expect(verifyCommittedRegistryTransactionEnvelopeFingerprint(normalizedEnvelope)).toEqual(
      normalizedEnvelope,
    );
  });

  it("verifies original nested envelope records without invoking manifest accessors", () => {
    const envelope = structuredClone(completeBootstrapHistory().envelopes[0]!);
    const registration = envelope.records[0];
    if (registration?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    const plainEvidence = registration.manifestEvidence;
    let manifestReferenceReadCount = 0;
    class UnsupportedManifestEvidence {
      public readonly manifest = plainEvidence.manifest;

      public constructor() {
        Object.defineProperty(this, "manifestReference", {
          enumerable: true,
          get: () => {
            manifestReferenceReadCount += 1;
            return plainEvidence.manifestReference;
          },
        });
      }
    }
    registration.manifestEvidence = new UnsupportedManifestEvidence() as typeof plainEvidence;

    expect(() => verifyCommittedRegistryTransactionEnvelopeFingerprint(envelope)).toThrowError(
      expect.objectContaining({ code: "invalid_transaction_envelope" }),
    );
    expect(manifestReferenceReadCount).toBe(0);
  });

  it.each([
    ["bigint", 1n],
    ["function", (): void => undefined],
    ["symbol", Symbol("unsupported")],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("normalizes unsupported raw %s leaves before canonical hashing", (_label, value) => {
    const envelope = structuredClone(completeBootstrapHistory().envelopes[0]!);
    const record = envelope.records[0]! as unknown as Record<string, unknown>;
    record.reason = value;

    let recordError: unknown;
    try {
      verifyDurableAuditRecordFingerprint(record);
    } catch (error) {
      recordError = error;
    }
    expect(recordError).toMatchObject({
      name: "DurableRegistryIntegrityError",
      code: "invalid_durable_record",
    });
    expect(recordError).not.toBeInstanceOf(TypeError);

    let envelopeError: unknown;
    try {
      verifyCommittedRegistryTransactionEnvelopeFingerprint(envelope);
    } catch (error) {
      envelopeError = error;
    }
    expect(envelopeError).toMatchObject({
      name: "DurableRegistryIntegrityError",
      code: "invalid_transaction_envelope",
    });
    expect(envelopeError).not.toBeInstanceOf(TypeError);
  });

  it("normalizes uncloneable verifier inputs to stable integrity errors", () => {
    expect(() =>
      verifyDurableAuditRecordFingerprint({ uncloneable: (): void => undefined }),
    ).toThrowError(
      expect.objectContaining({
        name: "DurableRegistryIntegrityError",
        code: "invalid_durable_record",
      }),
    );
    expect(() =>
      verifyCommittedRegistryTransactionEnvelopeFingerprint({
        uncloneable: (): void => undefined,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "DurableRegistryIntegrityError",
        code: "invalid_transaction_envelope",
      }),
    );
  });

  it("compares transaction intent independently of chain placement and rejects conflicts", () => {
    const chain = completeBootstrapHistory();
    const existing = chain.envelopes[0]!;
    const relocated = structuredClone(existing);
    relocated.firstSequence = 22;
    relocated.lastSequence = 22;
    relocated.previousRecordFingerprint = HASH_B;
    relocated.lastRecordFingerprint = HASH_A;
    relocated.committedAt = "2030-01-01T00:00:00Z";
    relocated.envelopeFingerprint = HASH_A;
    relocated.records[0]!.sequence = 22;
    relocated.records[0]!.previousRecordFingerprint = HASH_B;
    relocated.records[0]!.recordFingerprint = HASH_A;

    expect(areCommittedRegistryTransactionsIdempotent(existing, relocated)).toBe(true);
    expect(() => assertCommittedRegistryTransactionIdempotency(existing, relocated)).not.toThrow();

    const conflicting = structuredClone(relocated);
    const registration = conflicting.records[0];
    if (registration?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    registration.reason = "Conflicting transaction reuse.";
    expect(areCommittedRegistryTransactionsIdempotent(existing, conflicting)).toBe(false);
    expect(() => assertCommittedRegistryTransactionIdempotency(existing, conflicting)).toThrow(
      DurableRegistryConflictError,
    );
  });

  it("normalizes an approval transition's intra-envelope decision fingerprint by record position", () => {
    const chain = createChainBuilder();
    appendBootstrapApproval(chain, snapshot("approval-intent"), "approval-intent");
    const existing = chain.envelopes.at(-1)!;
    expect(existing.transactionType).toBe("decision");
    const relocated = structuredClone(existing);
    const decision = relocated.records[0];
    const transition = relocated.records[1];
    if (
      decision?.recordType !== "review_decision" ||
      transition?.recordType !== "lifecycle_transition"
    ) {
      throw new Error("Expected one approval decision and its lifecycle transition");
    }
    relocated.firstSequence = 41;
    relocated.lastSequence = 42;
    relocated.previousRecordFingerprint = HASH_B;
    relocated.lastRecordFingerprint = HASH_B;
    relocated.committedAt = "2030-01-01T00:00:00Z";
    relocated.envelopeFingerprint = HASH_A;
    decision.sequence = 41;
    decision.previousRecordFingerprint = HASH_B;
    decision.recordFingerprint = HASH_A;
    transition.sequence = 42;
    transition.previousRecordFingerprint = HASH_A;
    transition.evidence.decisionFingerprint = HASH_A;
    transition.recordFingerprint = HASH_B;

    expect(areCommittedRegistryTransactionsIdempotent(existing, relocated)).toBe(true);
    expect(() => assertCommittedRegistryTransactionIdempotency(existing, relocated)).not.toThrow();

    for (const conflict of [
      { actorId: "another-founder" },
      { reason: "Changed approval reason." },
      { decidedAt: "2030-01-02T00:00:00Z" },
      { decisionId: "decision-changed" },
    ] as const) {
      const changed = structuredClone(relocated);
      const changedDecision = changed.records[0];
      if (changedDecision?.recordType !== "review_decision") {
        throw new Error("Expected approval decision");
      }
      Object.assign(changedDecision, conflict);
      expect(areCommittedRegistryTransactionsIdempotent(existing, changed)).toBe(false);
    }
  });
});

describe("durable registry replay and integrity", () => {
  it("recovers deterministic genesis state from empty committed history", () => {
    const replay = replayCommittedRegistryTransactions([]);

    expect(replay).toMatchObject({
      activeSnapshotId: null,
      committedTransactionCount: 0,
      committedRecordCount: 0,
      lastCommittedAuditSequence: 0,
      lastRecordFingerprint: "genesis",
      snapshotRegistrations: [],
      snapshotStates: [],
    });
    expect(verifyCommittedRegistryIntegrity([])).toMatchObject({
      status: "valid",
      verifiedTransactionCount: 0,
      verifiedRecordCount: 0,
    });
    expect(recoverCommittedRegistry([])).toMatchObject({
      status: "recovered",
      activeSnapshotId: null,
      registeredSnapshotCount: 0,
    });
  });

  it("deterministically recovers complete histories and one active snapshot", () => {
    const chain = completeBootstrapHistory();
    const first = replayCommittedRegistryTransactions(chain.envelopes);
    const repeated = replayCommittedRegistryTransactions(structuredClone(chain.envelopes));
    const recovery = recoverCommittedRegistry(chain.envelopes);
    const integrity = verifyCommittedRegistryIntegrity(chain.envelopes);

    expect(first).toMatchObject({
      schemaVersion: "1.0",
      activeSnapshotId: first.snapshotRegistrations[0]!.snapshot.snapshotId,
      committedTransactionCount: 6,
      committedRecordCount: 8,
      lastCommittedAuditSequence: 8,
      snapshotStates: [
        {
          snapshotId: first.snapshotRegistrations[0]!.snapshot.snapshotId,
          status: "active",
        },
      ],
    });
    expect(first.lifecycleHistory).toHaveLength(4);
    expect(first.reviewDecisionHistory).toHaveLength(1);
    expect(first.activationHistory).toHaveLength(1);
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first));
    expect(recovery).toMatchObject({
      status: "recovered",
      activeSnapshotId: first.activeSnapshotId,
      integrityFingerprint: first.integrityFingerprint,
      errors: [],
    });
    expect(integrity).toMatchObject({
      status: "valid",
      integrityFingerprint: first.integrityFingerprint,
      issues: [],
    });
  });

  it("atomically recovers replacement activation and matching baseline supersession", () => {
    const chain = createChainBuilder();
    const baseline = appendBootstrapApproval(chain, snapshot("baseline"), "baseline");
    appendBootstrapActivation(chain, baseline, "baseline");
    const replacement = appendReplacementApproval(
      chain,
      baseline.snapshot,
      snapshot("replacement"),
      "replacement",
    );
    appendReplacementActivation(chain, baseline.snapshot, replacement, "replacement");

    const replay = replayCommittedRegistryTransactions(chain.envelopes);
    expect(replay.activeSnapshotId).toBe(replacement.snapshot.snapshotId);
    expect(replay.snapshotStates).toEqual(
      [
        { snapshotId: baseline.snapshot.snapshotId, status: "superseded" },
        { snapshotId: replacement.snapshot.snapshotId, status: "active" },
      ].sort((left, right) =>
        left.snapshotId < right.snapshotId ? -1 : left.snapshotId > right.snapshotId ? 1 : 0,
      ),
    );
    expect(replay.activationHistory).toHaveLength(2);
    expect(replay.lifecycleHistory.slice(-2).map((transition) => transition.to)).toEqual([
      "active",
      "superseded",
    ]);
  });

  it("verifies non-empty added, removed, and modified canonical change evidence", () => {
    const baselineDocuments = [
      document(generalKnowledgeObject("modified", "before")),
      document(generalKnowledgeObject("removed")),
    ];
    const candidateDocuments = [
      document(generalKnowledgeObject("added")),
      document(generalKnowledgeObject("modified", "after")),
    ];
    const baselineSnapshot = snapshot("nonempty-baseline", baselineDocuments);
    const candidateSnapshot = snapshot("nonempty-candidate", candidateDocuments);
    const chain = createChainBuilder();
    const baseline = appendBootstrapApproval(
      chain,
      baselineSnapshot,
      "nonempty-baseline",
      baselineDocuments,
    );
    appendBootstrapActivation(chain, baseline, "nonempty-baseline");
    const candidate = appendReplacementApproval(
      chain,
      baselineSnapshot,
      candidateSnapshot,
      "nonempty-candidate",
      { baselineDocuments, candidateDocuments },
    );
    appendReplacementActivation(chain, baselineSnapshot, candidate, "nonempty-candidate");

    const replay = replayCommittedRegistryTransactions(chain.envelopes);
    const replacement = replay.governedChangeSetHistory.at(-1);
    expect(replacement?.evidence.evidenceType).toBe("comparison");
    if (replacement?.evidence.evidenceType !== "comparison") {
      throw new Error("Expected comparison change-set fixture");
    }
    expect(replacement.evidence.changeSet.addedObjects.map((object) => object.objectId)).toEqual([
      "added",
    ]);
    expect(replacement.evidence.changeSet.removedObjects.map((object) => object.objectId)).toEqual([
      "removed",
    ]);
    expect(replacement.evidence.changeSet.modifiedObjects.map((object) => object.objectId)).toEqual(
      ["modified"],
    );
    expect(replay.activeSnapshotId).toBe(candidateSnapshot.snapshotId);
  });

  it("rejects canonically signed but tampered non-empty comparison evidence", () => {
    const baselineDocuments = [document(generalKnowledgeObject("retained"))];
    const candidateDocuments = [
      document(generalKnowledgeObject("added", "untampered content")),
      ...baselineDocuments,
    ];
    const baselineSnapshot = snapshot("evidence-baseline", baselineDocuments);
    const candidateSnapshot = snapshot("evidence-candidate", candidateDocuments);
    const chain = createChainBuilder();
    const baseline = appendBootstrapApproval(
      chain,
      baselineSnapshot,
      "evidence-baseline",
      baselineDocuments,
    );
    appendBootstrapActivation(chain, baseline, "evidence-baseline");
    appendReplacementApproval(chain, baselineSnapshot, candidateSnapshot, "evidence-candidate", {
      baselineDocuments,
      candidateDocuments,
      mutateChangeSet(changeSet) {
        const added = changeSet.addedObjects[0];
        if (added === undefined || !("content" in added.object)) {
          throw new Error("Expected added general-knowledge evidence");
        }
        added.object.content = "tampered after evidence fingerprints were computed";
      },
    });

    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "change_set_evidence_fingerprint_mismatch" }],
    });
  });

  it("returns defensive deeply immutable recovery state", () => {
    const chain = completeBootstrapHistory();
    const inputs = structuredClone(chain.envelopes);
    const replay = replayCommittedRegistryTransactions(inputs);
    const recoveredVersion = replay.snapshotRegistrations[0]!.snapshot.corpusVersion;
    const inputRegistration = inputs[0]!.records[0];
    if (inputRegistration?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    inputRegistration.snapshot.corpusVersion = "caller-mutated";

    expect(replay.snapshotRegistrations[0]!.snapshot.corpusVersion).toBe(recoveredVersion);
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.snapshotRegistrations)).toBe(true);
    expect(Object.isFrozen(replay.snapshotRegistrations[0]!.snapshot)).toBe(true);
  });

  it("fails closed on record or envelope fingerprint tampering", () => {
    const recordTampering = structuredClone(completeBootstrapHistory().envelopes);
    const record = recordTampering[0]!.records[0];
    if (record?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    record.reason = "Tampered after commit.";

    expect(() => replayCommittedRegistryTransactions(recordTampering)).toThrow(
      DurableRegistryIntegrityError,
    );
    expect(verifyCommittedRegistryIntegrity(recordTampering)).toMatchObject({
      status: "invalid",
      issues: [{ code: "record_fingerprint_mismatch" }],
    });
    expect(recoverCommittedRegistry(recordTampering)).toMatchObject({
      status: "failed",
      activeSnapshotId: null,
      errors: [{ code: "record_fingerprint_mismatch" }],
    });

    const envelopeTampering = structuredClone(completeBootstrapHistory().envelopes);
    envelopeTampering[0]!.envelopeFingerprint = HASH_B;
    expect(verifyCommittedRegistryIntegrity(envelopeTampering)).toMatchObject({
      status: "invalid",
      issues: [{ code: "envelope_fingerprint_mismatch" }],
    });
  });

  it("rejects a validly re-fingerprinted snapshot whose Milestone 07 identity is forged", () => {
    const chain = createChainBuilder();
    const candidate = snapshot("v1");
    const transactionId = "transaction-forged-registration";
    const forgedSnapshot = structuredClone(candidate);
    forgedSnapshot.corpusVersion = "forged-version";
    const manifestEvidence = createAdapterManifestEvidence(forgedSnapshot);
    const record = appendRecord<DurableSnapshotRegistrationRecord>(chain, transactionId, {
      schemaVersion: "1.0",
      recordType: "snapshot_registration",
      registrationId: `registration-${forgedSnapshot.snapshotId}`,
      snapshotContractVersion: "1.0",
      snapshot: forgedSnapshot,
      manifestEvidence,
      manifestFingerprint: createDurableSnapshotManifestFingerprint(manifestEvidence),
      provenanceSummary: {
        corpusId: forgedSnapshot.corpusId,
        corpusVersion: forgedSnapshot.corpusVersion,
        sourceManifestReference: forgedSnapshot.sourceManifestReference,
        snapshotCreatedAt: forgedSnapshot.creation.createdAt,
        snapshotCreatedBy: forgedSnapshot.creation.createdBy,
      },
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Attempt to register forged snapshot identity.",
      registeredAt: "2026-07-28T00:01:00Z",
    });
    appendEnvelope(chain, "registration", transactionId, [record], "2026-07-28T00:01:01Z");

    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "snapshot_fingerprint_mismatch" }],
    });
  });

  it("rejects a structurally valid, fully re-signed false manifest commitment", () => {
    const inputs = structuredClone(completeBootstrapHistory().envelopes);
    const registrationEnvelope = inputs[0]!;
    const registration = registrationEnvelope.records[0];
    if (registration?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    registration.manifestFingerprint = HASH_B;
    registration.recordFingerprint = createDurableAuditRecordFingerprint(registration);
    registrationEnvelope.lastRecordFingerprint = registration.recordFingerprint;
    registrationEnvelope.envelopeFingerprint =
      createCommittedRegistryTransactionEnvelopeFingerprint(registrationEnvelope);

    expect(verifyCommittedRegistryIntegrity(inputs)).toMatchObject({
      status: "invalid",
      verifiedTransactionCount: 0,
      verifiedRecordCount: 0,
      issues: [{ code: "manifest_fingerprint_mismatch" }],
    });
    expect(recoverCommittedRegistry(inputs)).toMatchObject({
      status: "failed",
      errors: [{ code: "manifest_fingerprint_mismatch" }],
    });
  });

  it("rejects fully re-signed manifest evidence substituted for the snapshot object set", () => {
    const inputs = structuredClone(completeBootstrapHistory().envelopes);
    const registrationEnvelope = inputs[0]!;
    const registration = registrationEnvelope.records[0];
    if (registration?.recordType !== "snapshot_registration") {
      throw new Error("Expected registration fixture");
    }
    registration.manifestEvidence.manifest.documents.push({
      id: "substituted-manifest-object",
      objectType: "knowledge",
      sourcePath: "docs/substituted-manifest-object.md",
      destinationPath: "knowledge/substituted-manifest-object.md",
      sourceHash: HASH_A,
      migrationStatus: "ready",
      reviewStatus: "approved",
      metadata: {
        title: "Substituted manifest object",
        domain: "FounderOS",
        createdAt: "2026-07-28",
        updatedAt: "2026-07-28",
        status: "active",
        confidence: "high",
        importance: "high",
        tags: [],
        relationships: [],
      },
      objectData: {},
    });
    registration.manifestFingerprint = createDurableSnapshotManifestFingerprint(
      registration.manifestEvidence,
    );
    registration.recordFingerprint = createDurableAuditRecordFingerprint(registration);
    registrationEnvelope.lastRecordFingerprint = registration.recordFingerprint;
    registrationEnvelope.envelopeFingerprint =
      createCommittedRegistryTransactionEnvelopeFingerprint(registrationEnvelope);

    expect(() => verifyDurableAuditRecordFingerprint(registration)).toThrowError(
      expect.objectContaining({ code: "invalid_durable_record" }),
    );
    expect(verifyCommittedRegistryIntegrity(inputs)).toMatchObject({
      status: "invalid",
      verifiedTransactionCount: 0,
      verifiedRecordCount: 0,
      issues: [{ code: "invalid_transaction_envelope" }],
    });
    expect(recoverCommittedRegistry(inputs)).toMatchObject({
      status: "failed",
      errors: [{ code: "invalid_transaction_envelope" }],
    });
  });

  it("reports exact lifecycle, decision, and activation counts for a verified failure prefix", () => {
    const inputs = structuredClone(completeBootstrapHistory().envelopes);
    const activationEnvelope = inputs.at(-1)!;
    activationEnvelope.envelopeFingerprint = HASH_B;

    expect(recoverCommittedRegistry(inputs)).toMatchObject({
      status: "failed",
      registeredSnapshotCount: 1,
      lifecycleTransitionCount: 3,
      decisionCount: 1,
      activationCount: 0,
      committedTransactionCount: 5,
      committedRecordCount: 6,
      lastCommittedAuditSequence: 6,
      errors: [{ code: "envelope_fingerprint_mismatch" }],
    });
  });

  it("rejects missing, reordered, or broken audit-chain history", () => {
    const reordered = completeBootstrapHistory().envelopes;
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(verifyCommittedRegistryIntegrity(reordered)).toMatchObject({ status: "invalid" });

    const missing = completeBootstrapHistory().envelopes;
    missing.splice(1, 1);
    expect(verifyCommittedRegistryIntegrity(missing)).toMatchObject({ status: "invalid" });

    const broken = createChainBuilder();
    const candidate = snapshot("broken-link");
    appendRegistration(broken, candidate, "broken-link");
    broken.lastRecordFingerprint = HASH_B;
    const transactionId = "transaction-broken-link-validation";
    const transition = appendRecord(broken, transactionId, {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: "transition-broken-link-validation",
      snapshotId: candidate.snapshotId,
      from: "created",
      to: "validated",
      actorId: "validator",
      actorType: "service",
      reason: "Internally valid but linked to the wrong predecessor.",
      transitionedAt: "2026-07-28T00:03:00Z",
      evidence: {
        changeSetId: null,
        changeSetFingerprint: null,
        decisionId: null,
        decisionFingerprint: null,
        activationId: null,
      },
    });
    appendEnvelope(broken, "lifecycle", transactionId, [transition], "2026-07-28T00:03:01Z");
    expect(verifyCommittedRegistryIntegrity(broken.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "audit_chain_mismatch" }],
    });
  });

  it("rejects missing evidence references and divergent lifecycle transitions", () => {
    const missingEvidence = createChainBuilder();
    const candidate = snapshot("missing-evidence");
    appendRegistration(missingEvidence, candidate, "missing-evidence");
    const validationTransactionId = "transaction-missing-evidence-validation";
    const validation = appendRecord<DurableLifecycleTransitionRecord>(
      missingEvidence,
      validationTransactionId,
      {
        schemaVersion: "1.0",
        recordType: "lifecycle_transition",
        transitionId: "transition-missing-evidence-validation",
        snapshotId: candidate.snapshotId,
        from: "created",
        to: "validated",
        actorId: "validator",
        actorType: "service",
        reason: "Validate before the forged review transition.",
        transitionedAt: "2026-07-28T00:03:00Z",
        evidence: {
          changeSetId: null,
          changeSetFingerprint: null,
          decisionId: null,
          decisionFingerprint: null,
          activationId: null,
        },
      },
    );
    appendEnvelope(
      missingEvidence,
      "lifecycle",
      validationTransactionId,
      [validation],
      "2026-07-28T00:03:01Z",
    );
    const transactionId = "transaction-review-with-missing-change-set";
    const transition = appendRecord(missingEvidence, transactionId, {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: "transition-review-with-missing-change-set",
      snapshotId: candidate.snapshotId,
      from: "validated",
      to: "reviewing",
      actorId: "reviewer",
      actorType: "human",
      reason: "Reference evidence that was never committed.",
      transitionedAt: "2026-07-28T00:04:00Z",
      evidence: {
        changeSetId: `change-bootstrap-to-${candidate.snapshotId}`,
        changeSetFingerprint: HASH_A,
        decisionId: null,
        decisionFingerprint: null,
        activationId: null,
      },
    });
    appendEnvelope(
      missingEvidence,
      "lifecycle",
      transactionId,
      [transition],
      "2026-07-28T00:04:01Z",
    );
    expect(verifyCommittedRegistryIntegrity(missingEvidence.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "missing_change_set_reference" }],
    });

    const divergent = createChainBuilder();
    const divergentCandidate = snapshot("divergent");
    appendRegistration(divergent, divergentCandidate, "divergent");
    const divergentTransactionId = "transaction-divergent-validation";
    const first = appendRecord<DurableLifecycleTransitionRecord>(
      divergent,
      divergentTransactionId,
      {
        schemaVersion: "1.0",
        recordType: "lifecycle_transition",
        transitionId: "transition-divergent-validation",
        snapshotId: divergentCandidate.snapshotId,
        from: "created",
        to: "validated",
        actorId: "validator",
        actorType: "service",
        reason: "First validation.",
        transitionedAt: "2026-07-28T00:03:00Z",
        evidence: {
          changeSetId: null,
          changeSetFingerprint: null,
          decisionId: null,
          decisionFingerprint: null,
          activationId: null,
        },
      },
    );
    const {
      previousRecordFingerprint: _previousRecordFingerprint,
      recordFingerprint: _recordFingerprint,
      sequence: _sequence,
      transactionId: _transactionId,
      ...firstContent
    } = first;
    void _previousRecordFingerprint;
    void _recordFingerprint;
    void _sequence;
    void _transactionId;
    const second = appendRecord<DurableLifecycleTransitionRecord>(
      divergent,
      divergentTransactionId,
      {
        ...firstContent,
        transitionId: "transition-divergent-validation-again",
        reason: "Contradictory repeated validation.",
        transitionedAt: "2026-07-28T00:03:30Z",
      },
    );
    appendEnvelope(
      divergent,
      "lifecycle",
      divergentTransactionId,
      [first, second],
      "2026-07-28T00:03:31Z",
    );
    expect(verifyCommittedRegistryIntegrity(divergent.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "lifecycle_transition_mismatch" }],
    });
  });

  it("rejects change-set substitution after review has selected immutable evidence", () => {
    const chain = createChainBuilder();
    const active = appendBootstrapApproval(
      chain,
      snapshot("substitution-active"),
      "substitution-active",
    );
    appendBootstrapActivation(chain, active, "substitution-active");
    const inactiveBaseline = snapshot("substitution-inactive");
    appendRegistration(chain, inactiveBaseline, "substitution-inactive");
    const candidate = snapshot("substitution-candidate");
    const reviewed = appendReplacementReview(
      chain,
      active.snapshot,
      candidate,
      "substitution-candidate",
    );
    const substituted = appendComparisonChangeSet(
      chain,
      inactiveBaseline,
      candidate,
      "substitution-alternative",
    );
    appendApprovalDecision(chain, reviewed, "substitution-candidate", {
      changeSetId: substituted.changeSetId,
      changeSetFingerprint: substituted.recordFingerprint,
    });

    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "review_change_set_mismatch" }],
    });
  });

  it("rejects off-baseline review and bootstrap review while an active snapshot exists", () => {
    const offBaseline = createChainBuilder();
    const active = appendBootstrapApproval(
      offBaseline,
      snapshot("off-baseline-active"),
      "off-baseline-active",
    );
    appendBootstrapActivation(offBaseline, active, "off-baseline-active");
    const inactive = snapshot("off-baseline-inactive");
    appendRegistration(offBaseline, inactive, "off-baseline-inactive");
    appendReplacementReview(
      offBaseline,
      inactive,
      snapshot("off-baseline-candidate"),
      "off-baseline-candidate",
    );
    expect(verifyCommittedRegistryIntegrity(offBaseline.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "review_baseline_mismatch" }],
    });

    const bootstrapWithActive = completeBootstrapHistory("bootstrap-active");
    appendBootstrapReview(
      bootstrapWithActive,
      snapshot("late-bootstrap-candidate"),
      "late-bootstrap-candidate",
    );
    expect(verifyCommittedRegistryIntegrity(bootstrapWithActive.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "review_baseline_mismatch" }],
    });
  });

  it("rejects approval when the reviewed baseline has since been superseded", () => {
    const chain = createChainBuilder();
    const baseline = appendBootstrapApproval(chain, snapshot("stale-baseline"), "stale-baseline");
    appendBootstrapActivation(chain, baseline, "stale-baseline");
    const staleCandidate = appendReplacementReview(
      chain,
      baseline.snapshot,
      snapshot("stale-candidate"),
      "stale-candidate",
    );
    const intervening = appendReplacementApproval(
      chain,
      baseline.snapshot,
      snapshot("intervening-active"),
      "intervening-active",
    );
    appendReplacementActivation(chain, baseline.snapshot, intervening, "intervening-active");
    appendApprovalDecision(chain, staleCandidate, "stale-candidate");

    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "review_baseline_mismatch" }],
    });
  });

  it("recovers rejection evidence and treats rejection as terminal", () => {
    const chain = createChainBuilder();
    const reviewed = appendBootstrapReview(
      chain,
      snapshot("rejected-candidate"),
      "rejected-candidate",
    );
    appendRejectionDecision(chain, reviewed, "rejected-candidate");

    const replay = replayCommittedRegistryTransactions(chain.envelopes);
    expect(replay.activeSnapshotId).toBeNull();
    expect(replay.snapshotStates).toEqual([
      { snapshotId: reviewed.snapshot.snapshotId, status: "reviewing" },
    ]);
    expect(replay.reviewDecisionHistory).toMatchObject([
      { reviewDecision: { decision: "rejected" } },
    ]);

    appendApprovalDecision(chain, reviewed, "after-rejection");
    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "contradictory_review_decision" }],
    });
  });

  it("rejects missing and wrong approval-decision references during activation", () => {
    const missing = createChainBuilder();
    const missingCandidate = appendBootstrapApproval(
      missing,
      snapshot("missing-activation-decision"),
      "missing-activation-decision",
    );
    appendBootstrapActivation(missing, missingCandidate, "missing-activation-decision", {
      decisionId: "decision-never-committed",
      decisionFingerprint: HASH_B,
    });
    expect(verifyCommittedRegistryIntegrity(missing.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "missing_decision_reference" }],
    });

    const wrong = createChainBuilder();
    const first = appendBootstrapApproval(
      wrong,
      snapshot("wrong-decision-first"),
      "wrong-decision-first",
    );
    const second = appendBootstrapApproval(
      wrong,
      snapshot("wrong-decision-second"),
      "wrong-decision-second",
    );
    appendBootstrapActivation(wrong, first, "wrong-decision-first", {
      decisionId: second.decisionId,
      decisionFingerprint: second.decisionFingerprint,
    });
    expect(verifyCommittedRegistryIntegrity(wrong.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "decision_binding_mismatch" }],
    });
  });

  it("rejects a re-signed approval envelope with malformed decision references", () => {
    const chain = createChainBuilder();
    appendBootstrapApproval(chain, snapshot("malformed-decision"), "malformed-decision");
    const inputs = structuredClone(chain.envelopes);
    const decisionEnvelope = inputs.at(-1);
    const approval = decisionEnvelope?.records[1];
    if (
      decisionEnvelope?.transactionType !== "decision" ||
      approval?.recordType !== "lifecycle_transition"
    ) {
      throw new Error("Expected approval decision envelope fixture");
    }
    approval.evidence.decisionFingerprint = HASH_B;
    approval.recordFingerprint = createDurableAuditRecordFingerprint(approval);
    decisionEnvelope.lastRecordFingerprint = approval.recordFingerprint;
    decisionEnvelope.envelopeFingerprint =
      createCommittedRegistryTransactionEnvelopeFingerprint(decisionEnvelope);

    expect(verifyCommittedRegistryIntegrity(inputs)).toMatchObject({
      status: "invalid",
      issues: [{ code: "invalid_transaction_envelope" }],
    });
  });

  it("rejects contradictory bootstrap activations that would recover two active snapshots", () => {
    const chain = createChainBuilder();
    const first = appendBootstrapApproval(chain, snapshot("first"), "first");
    const second = appendBootstrapApproval(chain, snapshot("second"), "second");
    appendBootstrapActivation(chain, first, "first");
    appendBootstrapActivation(chain, second, "second");

    expect(verifyCommittedRegistryIntegrity(chain.envelopes)).toMatchObject({
      status: "invalid",
      issues: [{ code: "activation_state_mismatch" }],
    });
    expect(recoverCommittedRegistry(chain.envelopes)).toMatchObject({
      status: "failed",
      activeSnapshotId: null,
    });
  });
});
