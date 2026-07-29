import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ActivationAuditRecordSchema,
  BootstrapGovernedChangeSetSchema,
  CommittedRegistryTransactionEnvelopeSchema,
  DerivedRegistryIndexResultSchema,
  DurableGovernedChangeSetRecordSchema,
  DurableLifecycleTransitionRecordSchema,
  DurableReviewDecisionRecordSchema,
  DurableSnapshotRegistrationRecordSchema,
  NonActivationDurableLifecycleTransitionRecordSchema,
  OrderedDurableAuditRecordsSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  SnapshotActivationRequestSchema,
  SnapshotActivationResultSchema,
  StandaloneDurableLifecycleTransitionRecordSchema,
  type DurableSnapshotRegistry,
  parseCommittedRegistryTransactionEnvelope,
  parseDurableSnapshotRegistrationRecord,
  safeParseActivationAuditRecord,
  safeParseBootstrapGovernedChangeSet,
  safeParseCommittedRegistryTransactionEnvelope,
  safeParseDerivedRegistryIndexResult,
  safeParseDecisionTransactionRecords,
  safeParseDurableAuditRecord,
  safeParseDurableGovernedChangeSetRecord,
  safeParseDurableLifecycleTransitionRecord,
  safeParseDurableReviewDecisionRecord,
  safeParseDurableSnapshotManifestEvidence,
  safeParseDurableSnapshotRegistrationRecord,
  safeParseNonActivationDurableLifecycleTransitionRecord,
  safeParseOrderedDurableAuditRecords,
  safeParseRegistryIntegrityResult,
  safeParseRegistryRecoveryResult,
  safeParseRegisterGovernedSnapshotInput,
  safeParseSnapshotActivationRequest,
  safeParseSnapshotActivationResult,
} from "../src/index.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const E = "e".repeat(64);
const F = "f".repeat(64);
const ZERO = "0".repeat(64);
const ONE = "1".repeat(64);
const TWO = "2".repeat(64);
const THREE = "3".repeat(64);
const FOUR = "4".repeat(64);
const FIVE = "5".repeat(64);
const SIX = "6".repeat(64);
const SEVEN = "7".repeat(64);
const EIGHT = "8".repeat(64);
const NOW = "2026-07-28T01:00:00Z";
const SNAPSHOT_ID = `snapshot-${A}`;
const BOOTSTRAP_CHANGE_ID = `change-bootstrap-to-${SNAPSHOT_ID}`;

function snapshot() {
  return {
    schemaVersion: "1.0" as const,
    snapshotId: SNAPSHOT_ID,
    corpusId: "founderos-priority-1",
    corpusVersion: "1.0",
    sourceManifestReference: "knowledge/migration-manifest.yaml",
    contentFingerprint: A,
    objectCount: 0,
    creation: {
      createdAt: "2026-07-28T00:00:00Z",
      createdBy: "knowledge-engine",
    },
    objects: [],
  };
}

function manifestDocument() {
  return {
    id: "manifest-evidence-object",
    objectType: "knowledge" as const,
    sourcePath: "docs/manifest-evidence-object.md",
    destinationPath: "knowledge/manifest-evidence-object.md",
    sourceHash: A,
    migrationStatus: "ready" as const,
    reviewStatus: "approved" as const,
    metadata: {
      title: "Manifest evidence object",
      domain: "FounderOS",
      createdAt: "2026-07-28",
      updatedAt: "2026-07-28",
      status: "active" as const,
      confidence: "high" as const,
      importance: "high" as const,
      tags: [],
      relationships: [],
    },
    objectData: {},
  };
}

function manifestEvidence(documents: readonly unknown[] = []) {
  return {
    manifestReference: "knowledge/migration-manifest.yaml",
    manifest: {
      schemaVersion: "1.0" as const,
      corpusId: "founderos-priority-1",
      documents,
    },
  };
}

function snapshotWithManifestObjects() {
  return {
    ...snapshot(),
    objectCount: 2,
    objects: [
      {
        objectId: "manifest-evidence-object",
        objectType: "knowledge" as const,
        sourcePath: "docs/manifest-evidence-object.md",
        sourceHash: A,
        metadataFingerprint: B,
        objectFingerprint: C,
      },
      {
        objectId: "migrated-evidence-object",
        objectType: "principle" as const,
        sourcePath: "docs/migrated-evidence-object.md",
        sourceHash: D,
        metadataFingerprint: E,
        objectFingerprint: F,
      },
    ],
  };
}

function governedRegistrationInput(
  value: unknown = snapshot(),
  evidence: ReturnType<typeof manifestEvidence> = manifestEvidence(),
) {
  return {
    transactionId: "transaction-register-input",
    snapshot: value,
    manifestEvidence: evidence,
    actorId: "knowledge-engine",
    actorType: "service" as const,
    reason: "Register the validated corpus snapshot.",
    registeredAt: NOW,
  };
}

function registrationRecord() {
  const value = snapshot();

  return {
    schemaVersion: "1.0" as const,
    recordType: "snapshot_registration" as const,
    registrationId: `registration-${value.snapshotId}`,
    transactionId: "transaction-register-001",
    sequence: 1,
    previousRecordFingerprint: "genesis" as const,
    snapshotContractVersion: value.schemaVersion,
    snapshot: value,
    manifestEvidence: manifestEvidence(),
    manifestFingerprint: B,
    provenanceSummary: {
      corpusId: value.corpusId,
      corpusVersion: value.corpusVersion,
      sourceManifestReference: value.sourceManifestReference,
      snapshotCreatedAt: value.creation.createdAt,
      snapshotCreatedBy: value.creation.createdBy,
    },
    actorId: "knowledge-engine",
    actorType: "service" as const,
    reason: "Register the validated corpus snapshot.",
    registeredAt: NOW,
    recordFingerprint: C,
  };
}

function bootstrapChangeSet() {
  return {
    schemaVersion: "1.0" as const,
    changeSetType: "bootstrap" as const,
    changeId: BOOTSTRAP_CHANGE_ID,
    sourceSnapshotId: null,
    sourceSnapshotFingerprint: null,
    targetSnapshotId: SNAPSHOT_ID,
    targetSnapshotFingerprint: A,
    targetManifestReference: "knowledge/migration-manifest.yaml",
    targetCorpusVersion: "1.0",
    addedObjects: [],
    reviewStatus: "approved" as const,
    changed: true as const,
  };
}

function changeSetRecord() {
  return {
    schemaVersion: "1.0" as const,
    recordType: "governed_change_set" as const,
    changeSetId: BOOTSTRAP_CHANGE_ID,
    transactionId: "transaction-change-set-001",
    sequence: 2,
    previousRecordFingerprint: C,
    evidence: {
      evidenceType: "bootstrap" as const,
      changeSet: bootstrapChangeSet(),
    },
    actorId: "knowledge-engine",
    actorType: "service" as const,
    reason: "Record the reviewed first-activation change set.",
    recordedAt: "2026-07-28T01:01:00Z",
    recordFingerprint: D,
  };
}

function comparisonChangeSetRecord() {
  const sourceSnapshotId = `snapshot-${B}`;
  const changeId = `change-${sourceSnapshotId}-to-${SNAPSHOT_ID}`;

  return {
    schemaVersion: "1.0" as const,
    recordType: "governed_change_set" as const,
    changeSetId: changeId,
    transactionId: "transaction-change-set-replacement",
    sequence: 2,
    previousRecordFingerprint: C,
    evidence: {
      evidenceType: "comparison" as const,
      changeSet: {
        schemaVersion: "1.0" as const,
        changeId,
        sourceSnapshotId,
        targetSnapshotId: SNAPSHOT_ID,
        sourceSnapshotFingerprint: B,
        targetSnapshotFingerprint: A,
        snapshotFingerprintChanged: true,
        sourceManifestReference: "knowledge/migration-manifest.yaml",
        targetManifestReference: "knowledge/migration-manifest.yaml",
        manifestReferenceChanged: false,
        sourceCorpusVersion: "0.9",
        targetCorpusVersion: "1.0",
        corpusVersionChanged: true,
        addedObjects: [],
        removedObjects: [],
        modifiedObjects: [],
        reviewStatus: "approved" as const,
        changed: true,
      },
    },
    actorId: "knowledge-engine",
    actorType: "service" as const,
    reason: "Record the approved replacement change set.",
    recordedAt: "2026-07-28T01:01:00Z",
    recordFingerprint: D,
  };
}

function decisionRecord(decision: "approved" | "rejected" = "approved") {
  const actorId = "founder-001";
  const reason = decision === "approved" ? "Approved for activation." : "Needs revision.";
  const decidedAt = "2026-07-28T01:02:00Z";

  return {
    schemaVersion: "1.0" as const,
    recordType: "review_decision" as const,
    decisionId: `decision-${decision}-001`,
    transactionId: `transaction-decision-${decision}-001`,
    sequence: 3,
    previousRecordFingerprint: D,
    reviewDecision: {
      changeId: BOOTSTRAP_CHANGE_ID,
      proposedSnapshotId: SNAPSHOT_ID,
      decision,
      actorId,
      decidedAt,
      reason,
    },
    changeSetFingerprint: D,
    proposedSnapshotFingerprint: A,
    actorId,
    actorType: "human" as const,
    reason,
    decidedAt,
    recordFingerprint: E,
  };
}

function approvalTransition() {
  const decision = decisionRecord();

  return {
    schemaVersion: "1.0" as const,
    recordType: "lifecycle_transition" as const,
    transitionId: "transition-candidate-approved-001",
    transactionId: decision.transactionId,
    sequence: 4,
    previousRecordFingerprint: decision.recordFingerprint,
    snapshotId: SNAPSHOT_ID,
    from: "reviewing" as const,
    to: "approved" as const,
    actorId: decision.actorId,
    actorType: decision.actorType,
    reason: decision.reason,
    transitionedAt: decision.decidedAt,
    evidence: {
      changeSetId: BOOTSTRAP_CHANGE_ID,
      changeSetFingerprint: D,
      decisionId: decision.decisionId,
      decisionFingerprint: decision.recordFingerprint,
      activationId: null,
    },
    recordFingerprint: F,
  };
}

function approvalDecisionEnvelope() {
  const decision = decisionRecord();
  const transition = approvalTransition();

  return {
    schemaVersion: "1.0" as const,
    status: "committed" as const,
    transactionType: "decision" as const,
    transactionId: decision.transactionId,
    firstSequence: 3,
    lastSequence: 4,
    previousRecordFingerprint: D,
    lastRecordFingerprint: F,
    recordCount: 2,
    records: [decision, transition] as const,
    committedAt: "2026-07-28T01:02:01Z",
    envelopeFingerprint: ONE,
  };
}

function rejectionDecisionEnvelope() {
  const decision = decisionRecord("rejected");

  return {
    schemaVersion: "1.0" as const,
    status: "committed" as const,
    transactionType: "decision" as const,
    transactionId: decision.transactionId,
    firstSequence: 3,
    lastSequence: 3,
    previousRecordFingerprint: D,
    lastRecordFingerprint: E,
    recordCount: 1,
    records: [decision] as const,
    committedAt: "2026-07-28T01:02:01Z",
    envelopeFingerprint: ONE,
  };
}

function activationTransition() {
  return {
    schemaVersion: "1.0" as const,
    recordType: "lifecycle_transition" as const,
    transitionId: "transition-candidate-active-001",
    transactionId: "transaction-activate-001",
    sequence: 5,
    previousRecordFingerprint: F,
    snapshotId: SNAPSHOT_ID,
    from: "approved" as const,
    to: "active" as const,
    actorId: "founder-001",
    actorType: "human" as const,
    reason: "Activate the approved first snapshot.",
    transitionedAt: "2026-07-28T01:03:00Z",
    evidence: {
      changeSetId: BOOTSTRAP_CHANGE_ID,
      changeSetFingerprint: D,
      decisionId: "decision-approved-001",
      decisionFingerprint: E,
      activationId: "activation-001",
    },
    recordFingerprint: SIX,
  };
}

function activationAuditRecord() {
  return {
    schemaVersion: "1.0" as const,
    recordType: "activation_audit" as const,
    activationId: "activation-001",
    transactionId: "transaction-activate-001",
    sequence: 6,
    previousRecordFingerprint: SIX,
    candidateSnapshotId: SNAPSHOT_ID,
    candidateSnapshotFingerprint: A,
    previousActiveSnapshotId: null,
    previousActiveSnapshotFingerprint: null,
    expectedActiveSnapshotId: null,
    changeSetType: "bootstrap" as const,
    changeSetId: BOOTSTRAP_CHANGE_ID,
    changeSetFingerprint: D,
    approvalDecisionId: "decision-approved-001",
    approvalDecisionFingerprint: E,
    candidateActivationTransitionId: "transition-candidate-active-001",
    previousActiveSupersessionTransitionId: null,
    resultingActiveSnapshotId: SNAPSHOT_ID,
    actorId: "founder-001",
    actorType: "human" as const,
    reason: "Activate the approved first snapshot.",
    activatedAt: "2026-07-28T01:03:00Z",
    recordFingerprint: SEVEN,
  };
}

function activationEnvelope() {
  return {
    schemaVersion: "1.0" as const,
    status: "committed" as const,
    transactionType: "activation" as const,
    transactionId: "transaction-activate-001",
    firstSequence: 5,
    lastSequence: 6,
    previousRecordFingerprint: F,
    lastRecordFingerprint: SEVEN,
    recordCount: 2,
    records: [activationTransition(), activationAuditRecord()] as const,
    committedAt: "2026-07-28T01:03:01Z",
    envelopeFingerprint: EIGHT,
  };
}

function replacementActivationEnvelope() {
  const previousActiveSnapshotId = `snapshot-${B}`;
  const changeSetId = `change-${previousActiveSnapshotId}-to-${SNAPSHOT_ID}`;
  const transactionId = "transaction-activate-replacement";
  const activationId = "activation-replacement";
  const reason = "Replace the active snapshot with its approved successor.";
  const activatedAt = "2026-07-28T02:00:00Z";
  const candidateTransition = {
    ...activationTransition(),
    transactionId,
    transitionId: "transition-candidate-active-replacement",
    evidence: {
      ...activationTransition().evidence,
      changeSetId,
      activationId,
    },
    reason,
    transitionedAt: activatedAt,
  };
  const supersessionTransition = {
    schemaVersion: "1.0" as const,
    recordType: "lifecycle_transition" as const,
    transitionId: "transition-previous-superseded-replacement",
    transactionId,
    sequence: 6,
    previousRecordFingerprint: SIX,
    snapshotId: previousActiveSnapshotId,
    from: "active" as const,
    to: "superseded" as const,
    actorId: "founder-001",
    actorType: "human" as const,
    reason,
    transitionedAt: activatedAt,
    evidence: {
      changeSetId: null,
      changeSetFingerprint: null,
      decisionId: null,
      decisionFingerprint: null,
      activationId,
    },
    recordFingerprint: FIVE,
  };
  const audit = {
    ...activationAuditRecord(),
    activationId,
    transactionId,
    sequence: 7,
    previousRecordFingerprint: FIVE,
    previousActiveSnapshotId,
    previousActiveSnapshotFingerprint: B,
    expectedActiveSnapshotId: previousActiveSnapshotId,
    changeSetType: "comparison" as const,
    changeSetId,
    candidateActivationTransitionId: candidateTransition.transitionId,
    previousActiveSupersessionTransitionId: supersessionTransition.transitionId,
    reason,
    activatedAt,
  };

  return {
    ...activationEnvelope(),
    transactionId,
    lastSequence: 7,
    recordCount: 3,
    records: [candidateTransition, supersessionTransition, audit] as const,
  };
}

describe("durable registry record contracts", () => {
  it("validates a versioned genesis snapshot registration with bound provenance", () => {
    expect(DurableSnapshotRegistrationRecordSchema.parse(registrationRecord())).toEqual(
      registrationRecord(),
    );
    expect(parseDurableSnapshotRegistrationRecord(registrationRecord())).toEqual(
      registrationRecord(),
    );
  });

  it("binds the exact sorted approved ready-or-migrated manifest subset to snapshot descriptors", () => {
    const ready = manifestDocument();
    const migrated = {
      ...manifestDocument(),
      id: "migrated-evidence-object",
      objectType: "principle" as const,
      sourcePath: "docs/migrated-evidence-object.md",
      destinationPath: "knowledge/migrated-evidence-object.md",
      sourceHash: D,
      migrationStatus: "migrated" as const,
    };
    const ineligiblePending = {
      ...manifestDocument(),
      id: "pending-evidence-object",
      sourcePath: "docs/pending-evidence-object.md",
      destinationPath: "knowledge/pending-evidence-object.md",
      migrationStatus: "pending" as const,
    };
    const ineligibleRejected = {
      ...manifestDocument(),
      id: "rejected-evidence-object",
      sourcePath: "docs/rejected-evidence-object.md",
      destinationPath: "knowledge/rejected-evidence-object.md",
      reviewStatus: "rejected" as const,
    };
    const value = snapshotWithManifestObjects();
    const matching = manifestEvidence([ineligibleRejected, migrated, ineligiblePending, ready]);

    expect(
      safeParseRegisterGovernedSnapshotInput(governedRegistrationInput(value, matching)).success,
    ).toBe(true);

    const invalidEligibleDocuments = [
      [migrated],
      [
        ready,
        migrated,
        {
          ...manifestDocument(),
          id: "extra-object",
          sourcePath: "docs/extra.md",
          destinationPath: "knowledge/extra.md",
        },
      ],
      [{ ...ready, id: "different-object" }, migrated],
      [{ ...ready, objectType: "research" as const }, migrated],
      [{ ...ready, sourcePath: "docs/different.md" }, migrated],
      [{ ...ready, sourceHash: B }, migrated],
    ];
    for (const documents of invalidEligibleDocuments) {
      expect(
        safeParseRegisterGovernedSnapshotInput(
          governedRegistrationInput(value, manifestEvidence(documents)),
        ).success,
      ).toBe(false);
    }

    expect(
      safeParseRegisterGovernedSnapshotInput(
        governedRegistrationInput(snapshot(), manifestEvidence([])),
      ).success,
    ).toBe(true);
    expect(
      safeParseRegisterGovernedSnapshotInput(
        governedRegistrationInput(snapshot(), manifestEvidence([ready])),
      ).success,
    ).toBe(false);
  });

  it("restricts durable manifest evidence to finite, plain, acyclic canonical JSON", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = new Array<unknown>(2);
    sparse[1] = "present";
    class UnsupportedClass {
      public readonly value = "class-instance";
    }
    const unsupportedValues: unknown[] = [
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

    expect(safeParseDurableSnapshotManifestEvidence(manifestEvidence([])).success).toBe(true);
    expect(
      safeParseDurableSnapshotManifestEvidence(
        manifestEvidence([{ ...manifestDocument(), objectData: { finite: 1.25 } }]),
      ).success,
    ).toBe(true);

    for (const unsupported of unsupportedValues) {
      expect(
        safeParseDurableSnapshotManifestEvidence(
          manifestEvidence([{ ...manifestDocument(), objectData: { unsupported } }]),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects unsupported versions, invalid identities, unknown fields, and forged provenance", () => {
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        schemaVersion: "2.0",
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        manifestEvidence: {
          ...manifestEvidence(),
          manifestReference: "knowledge/another-manifest.yaml",
        },
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        manifestEvidence: {
          ...manifestEvidence(),
          manifest: { ...manifestEvidence().manifest, corpusId: "another-corpus" },
        },
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        registrationId: " ",
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        provenanceSummary: {
          ...registrationRecord().provenanceSummary,
          corpusVersion: "forged",
        },
      }).success,
    ).toBe(false);
  });

  it("requires explicit genesis only at sequence one", () => {
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        sequence: 2,
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        previousRecordFingerprint: B,
      }).success,
    ).toBe(false);
  });

  it("leaves canonical record-fingerprint recomputation to the engine boundary", () => {
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        recordFingerprint: TWO,
      }).success,
    ).toBe(true);
    expect(
      safeParseDurableSnapshotRegistrationRecord({
        ...registrationRecord(),
        recordFingerprint: "not-a-sha-256-digest",
      }).success,
    ).toBe(false);
  });

  it("validates direct durable lifecycle transitions and their state-specific bindings", () => {
    expect(DurableLifecycleTransitionRecordSchema.parse(activationTransition())).toEqual(
      activationTransition(),
    );

    expect(
      safeParseDurableLifecycleTransitionRecord({
        ...activationTransition(),
        from: "validated",
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableLifecycleTransitionRecord({
        ...activationTransition(),
        evidence: { ...activationTransition().evidence, decisionId: null },
      }).success,
    ).toBe(false);
  });

  it("excludes activation-owned edges from standalone lifecycle persistence", () => {
    expect(NonActivationDurableLifecycleTransitionRecordSchema.parse(approvalTransition())).toEqual(
      approvalTransition(),
    );
    expect(
      safeParseNonActivationDurableLifecycleTransitionRecord(activationTransition()).success,
    ).toBe(false);
    expect(
      safeParseNonActivationDurableLifecycleTransitionRecord(
        replacementActivationEnvelope().records[1],
      ).success,
    ).toBe(false);
    expect(
      StandaloneDurableLifecycleTransitionRecordSchema.safeParse(approvalTransition()).success,
    ).toBe(false);
    expectTypeOf<DurableSnapshotRegistry>().not.toHaveProperty("recordLifecycleTransition");
    expectTypeOf<DurableSnapshotRegistry>().not.toHaveProperty("recordReviewDecision");
    expectTypeOf<DurableSnapshotRegistry>().not.toHaveProperty("recordGovernedChangeSet");
    expectTypeOf<DurableSnapshotRegistry>().not.toHaveProperty("registerSnapshot");
  });

  it("reuses and binds immutable Milestone 08 human decision evidence", () => {
    expect(DurableReviewDecisionRecordSchema.parse(decisionRecord())).toEqual(decisionRecord());
    expect(DurableReviewDecisionRecordSchema.parse(decisionRecord("rejected"))).toEqual(
      decisionRecord("rejected"),
    );

    expect(
      safeParseDurableReviewDecisionRecord({
        ...decisionRecord(),
        actorType: "service",
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableReviewDecisionRecord({
        ...decisionRecord(),
        reason: "A different durable reason.",
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableReviewDecisionRecord({
        ...decisionRecord(),
        proposedSnapshotFingerprint: B,
      }).success,
    ).toBe(false);
  });

  it("models an explicit, versioned no-baseline bootstrap change set", () => {
    expect(BootstrapGovernedChangeSetSchema.parse(bootstrapChangeSet())).toEqual(
      bootstrapChangeSet(),
    );
    expect(DurableGovernedChangeSetRecordSchema.parse(changeSetRecord())).toEqual(
      changeSetRecord(),
    );

    expect(
      safeParseBootstrapGovernedChangeSet({
        ...bootstrapChangeSet(),
        sourceSnapshotId: SNAPSHOT_ID,
      }).success,
    ).toBe(false);
    expect(
      safeParseBootstrapGovernedChangeSet({
        ...bootstrapChangeSet(),
        targetSnapshotId: `snapshot-${B}`,
      }).success,
    ).toBe(false);
    expect(
      safeParseDurableGovernedChangeSetRecord({
        ...changeSetRecord(),
        changeSetId: "different-change-id",
      }).success,
    ).toBe(false);
  });

  it("retains the Milestone 08 governed comparison contract for replacements", () => {
    expect(DurableGovernedChangeSetRecordSchema.parse(comparisonChangeSetRecord())).toEqual(
      comparisonChangeSetRecord(),
    );
  });

  it("validates successful activation evidence and rejects forged structural bindings", () => {
    expect(ActivationAuditRecordSchema.parse(activationAuditRecord())).toEqual(
      activationAuditRecord(),
    );
    expect(safeParseDurableAuditRecord(activationAuditRecord()).success).toBe(true);

    expect(
      safeParseActivationAuditRecord({
        ...activationAuditRecord(),
        expectedActiveSnapshotId: "snapshot-stale",
      }).success,
    ).toBe(false);
    expect(
      safeParseActivationAuditRecord({
        ...activationAuditRecord(),
        resultingActiveSnapshotId: "snapshot-forged",
      }).success,
    ).toBe(false);
    expect(
      safeParseActivationAuditRecord({
        ...activationAuditRecord(),
        previousActiveSupersessionTransitionId: "unexpected-transition",
      }).success,
    ).toBe(false);
  });
});

describe("committed transaction envelopes", () => {
  it("validates one complete first-activation commit with contiguous internal links", () => {
    expect(CommittedRegistryTransactionEnvelopeSchema.parse(activationEnvelope())).toEqual(
      activationEnvelope(),
    );
    expect(parseCommittedRegistryTransactionEnvelope(activationEnvelope())).toEqual(
      activationEnvelope(),
    );
  });

  it("validates atomic candidate activation and prior-baseline supersession", () => {
    expect(
      CommittedRegistryTransactionEnvelopeSchema.parse(replacementActivationEnvelope()),
    ).toEqual(replacementActivationEnvelope());
  });

  it("accepts only exact rejection and atomic approval decision variants", () => {
    expect(CommittedRegistryTransactionEnvelopeSchema.parse(rejectionDecisionEnvelope())).toEqual(
      rejectionDecisionEnvelope(),
    );
    expect(CommittedRegistryTransactionEnvelopeSchema.parse(approvalDecisionEnvelope())).toEqual(
      approvalDecisionEnvelope(),
    );
  });

  it("exposes an ordered audit-record contract independently of an envelope", () => {
    const records = activationEnvelope().records;
    expect(safeParseOrderedDurableAuditRecords(records).success).toBe(true);
    expect(safeParseOrderedDurableAuditRecords([...records].reverse()).success).toBe(false);
  });

  it("composes registration, approval, and first activation into one ordered history", () => {
    const fullHistory = [
      registrationRecord(),
      changeSetRecord(),
      ...approvalDecisionEnvelope().records,
      ...activationEnvelope().records,
    ];

    expect(OrderedDurableAuditRecordsSchema.parse(fullHistory)).toEqual(fullHistory);
  });

  it("rejects gaps, reordering, broken links, transaction mismatches, and wrong counts", () => {
    const envelope = activationEnvelope();
    const malformedEnvelopes = [
      { ...envelope, firstSequence: 3 },
      { ...envelope, lastSequence: 7 },
      { ...envelope, recordCount: 3 },
      { ...envelope, records: [...envelope.records].reverse() },
      {
        ...envelope,
        records: [envelope.records[0], { ...envelope.records[1], previousRecordFingerprint: TWO }],
      },
      {
        ...envelope,
        records: [envelope.records[0], { ...envelope.records[1], transactionId: "other" }],
      },
      { ...envelope, lastRecordFingerprint: THREE },
    ];

    for (const malformed of malformedEnvelopes) {
      expect(safeParseCommittedRegistryTransactionEnvelope(malformed).success).toBe(false);
    }
  });

  it("rejects an activation envelope missing or misbinding an atomic effect", () => {
    const envelope = activationEnvelope();
    expect(
      safeParseCommittedRegistryTransactionEnvelope({
        ...envelope,
        firstSequence: 6,
        previousRecordFingerprint: SIX,
        recordCount: 1,
        records: [envelope.records[1]],
      }).success,
    ).toBe(false);
    expect(
      safeParseCommittedRegistryTransactionEnvelope({
        ...envelope,
        records: [
          { ...envelope.records[0], transitionId: "wrong-transition" },
          envelope.records[1],
        ],
      }).success,
    ).toBe(false);
    expect(
      safeParseCommittedRegistryTransactionEnvelope({
        ...envelope,
        transactionType: "lifecycle",
      }).success,
    ).toBe(false);
  });

  it("rejects activation-owned edges in lifecycle and decision envelopes", () => {
    const activation = activationTransition();
    const lifecycleEnvelope = {
      ...activationEnvelope(),
      transactionType: "lifecycle" as const,
      firstSequence: activation.sequence,
      lastSequence: activation.sequence,
      previousRecordFingerprint: activation.previousRecordFingerprint,
      lastRecordFingerprint: activation.recordFingerprint,
      recordCount: 1,
      records: [activation],
    };
    const approval = approvalDecisionEnvelope();
    const activationInDecisionEnvelope = {
      ...approval,
      records: [
        approval.records[0],
        {
          ...activation,
          transactionId: approval.transactionId,
          sequence: 4,
          previousRecordFingerprint: E,
          recordFingerprint: F,
        },
      ],
    };
    const approvalLifecycle = approvalTransition();
    const approvalInLifecycleEnvelope = {
      ...lifecycleEnvelope,
      transactionId: approvalLifecycle.transactionId,
      firstSequence: 4,
      lastSequence: 4,
      previousRecordFingerprint: E,
      lastRecordFingerprint: F,
      records: [approvalLifecycle],
    };

    expect(safeParseCommittedRegistryTransactionEnvelope(lifecycleEnvelope).success).toBe(false);
    expect(safeParseCommittedRegistryTransactionEnvelope(approvalInLifecycleEnvelope).success).toBe(
      false,
    );
    expect(
      safeParseCommittedRegistryTransactionEnvelope(activationInDecisionEnvelope).success,
    ).toBe(false);
  });

  it("rejects partial, unbound, or overfilled decision envelopes", () => {
    const approval = approvalDecisionEnvelope();
    const rejection = rejectionDecisionEnvelope();
    const partialApproval = {
      ...approval,
      lastSequence: 3,
      lastRecordFingerprint: E,
      recordCount: 1,
      records: [approval.records[0]],
    };
    const unboundApproval = {
      ...approval,
      records: [
        approval.records[0],
        {
          ...approval.records[1],
          evidence: {
            ...approval.records[1].evidence,
            decisionFingerprint: ZERO,
          },
        },
      ],
    };
    const overfilledRejection = {
      ...rejection,
      lastSequence: 4,
      lastRecordFingerprint: F,
      recordCount: 2,
      records: [
        rejection.records[0],
        {
          ...approvalTransition(),
          transactionId: rejection.transactionId,
          previousRecordFingerprint: E,
        },
      ],
    };
    const transactionMismatchedApproval = [
      approval.records[0],
      { ...approval.records[1], transactionId: "different-transaction" },
    ];

    expect(safeParseCommittedRegistryTransactionEnvelope(partialApproval).success).toBe(false);
    expect(safeParseCommittedRegistryTransactionEnvelope(unboundApproval).success).toBe(false);
    expect(safeParseCommittedRegistryTransactionEnvelope(overfilledRejection).success).toBe(false);
    expect(safeParseDecisionTransactionRecords(transactionMismatchedApproval).success).toBe(false);
  });

  it("rejects duplicate record identities and duplicate activation transition IDs", () => {
    const replacement = replacementActivationEnvelope();
    const duplicateTransitionId = replacement.records[0].transitionId;
    const duplicateIdentityEnvelope = {
      ...replacement,
      records: [
        replacement.records[0],
        { ...replacement.records[1], transitionId: duplicateTransitionId },
        {
          ...replacement.records[2],
          previousActiveSupersessionTransitionId: duplicateTransitionId,
        },
      ],
    };

    expect(safeParseCommittedRegistryTransactionEnvelope(duplicateIdentityEnvelope).success).toBe(
      false,
    );
  });
});

describe("activation and recovery boundary contracts", () => {
  it("validates first-activation requests and committed or replayed results", () => {
    const request = {
      schemaVersion: "1.0" as const,
      transactionId: "transaction-activate-001",
      activationId: "activation-001",
      candidateSnapshotId: SNAPSHOT_ID,
      candidateSnapshotFingerprint: A,
      baselineSnapshotId: null,
      baselineSnapshotFingerprint: null,
      expectedActiveSnapshotId: null,
      changeSetType: "bootstrap" as const,
      changeSetId: BOOTSTRAP_CHANGE_ID,
      changeSetFingerprint: D,
      approvalDecisionId: "decision-approved-001",
      approvalDecisionFingerprint: E,
      actorId: "founder-001",
      actorType: "human" as const,
      reason: "Activate the approved first snapshot.",
      requestedAt: "2026-07-28T01:03:00Z",
    };
    const result = {
      schemaVersion: "1.0" as const,
      status: "committed" as const,
      transactionId: request.transactionId,
      activationId: request.activationId,
      candidateSnapshotId: request.candidateSnapshotId,
      previousActiveSnapshotId: null,
      activeSnapshotId: request.candidateSnapshotId,
      firstSequence: 5,
      lastSequence: 6,
      activationRecordFingerprint: SEVEN,
      transactionEnvelopeFingerprint: EIGHT,
      committedAt: "2026-07-28T01:03:01Z",
    };

    expect(SnapshotActivationRequestSchema.parse(request)).toEqual(request);
    expect(SnapshotActivationResultSchema.parse(result)).toEqual(result);
    expect(SnapshotActivationResultSchema.parse({ ...result, status: "replayed" })).toEqual({
      ...result,
      status: "replayed",
    });
    expect(
      safeParseSnapshotActivationRequest({
        ...request,
        changeSetType: "comparison",
      }).success,
    ).toBe(false);
    expect(
      safeParseSnapshotActivationRequest({
        ...request,
        candidateSnapshotFingerprint: B,
      }).success,
    ).toBe(false);
    expect(
      safeParseSnapshotActivationResult({ ...result, activeSnapshotId: "forged" }).success,
    ).toBe(false);
    expect(safeParseSnapshotActivationResult({ ...result, lastSequence: 7 }).success).toBe(false);
  });

  it("models rejected activation without pretending that an audit record committed", () => {
    const rejected = {
      schemaVersion: "1.0" as const,
      status: "rejected" as const,
      transactionId: "transaction-activate-stale",
      candidateSnapshotId: SNAPSHOT_ID,
      currentActiveSnapshotId: `snapshot-${B}`,
      failureCode: "stale_active_snapshot",
      message: "The expected active snapshot does not match recovered state.",
      rejectedAt: NOW,
    };

    expect(SnapshotActivationResultSchema.parse(rejected)).toEqual(rejected);
  });

  it("validates integrity and fail-closed recovery summaries", () => {
    const validIntegrity = {
      schemaVersion: "1.0" as const,
      status: "valid" as const,
      verifiedTransactionCount: 4,
      verifiedRecordCount: 6,
      verifiedThroughSequence: 6,
      lastRecordFingerprint: SEVEN,
      derivedIndexStatus: "current" as const,
      derivedIndexIssues: [],
      integrityFingerprint: TWO,
      issues: [],
    };
    const recovered = {
      schemaVersion: "1.0" as const,
      status: "recovered" as const,
      activeSnapshotId: SNAPSHOT_ID,
      registeredSnapshotCount: 1,
      lifecycleTransitionCount: 3,
      decisionCount: 1,
      activationCount: 1,
      committedTransactionCount: 4,
      committedRecordCount: 6,
      lastCommittedAuditSequence: 6,
      lastRecordFingerprint: SEVEN,
      derivedIndexStatus: "current" as const,
      derivedIndexIssues: [],
      integrityFingerprint: TWO,
      errors: [],
    };
    const failed = {
      schemaVersion: "1.0" as const,
      status: "failed" as const,
      activeSnapshotId: null,
      registeredSnapshotCount: 1,
      lifecycleTransitionCount: 2,
      decisionCount: 1,
      activationCount: 0,
      committedTransactionCount: 4,
      committedRecordCount: 6,
      lastCommittedAuditSequence: 6,
      lastRecordFingerprint: SEVEN,
      derivedIndexStatus: "not_checked" as const,
      derivedIndexIssues: [],
      integrityFingerprint: null,
      errors: [
        {
          code: "record_fingerprint_mismatch",
          message: "Record fingerprint verification failed.",
          transactionId: "transaction-activate-001",
          recordId: "activation-001",
          sequence: 6,
        },
      ],
    };

    expect(RegistryIntegrityResultSchema.parse(validIntegrity)).toEqual(validIntegrity);
    expect(RegistryRecoveryResultSchema.parse(recovered)).toEqual(recovered);
    expect(RegistryRecoveryResultSchema.parse(failed)).toEqual(failed);
    expect(
      RegistryRecoveryResultSchema.parse({
        ...failed,
        committedRecordCount: 4,
      }),
    ).toEqual({ ...failed, committedRecordCount: 4 });
    expect(
      safeParseRegistryIntegrityResult({
        ...validIntegrity,
        verifiedThroughSequence: 4,
      }).success,
    ).toBe(false);
    expect(
      safeParseRegistryRecoveryResult({
        ...recovered,
        integrityFingerprint: null,
      }).success,
    ).toBe(false);
    expect(
      safeParseRegistryRecoveryResult({
        ...failed,
        lifecycleTransitionCount: 5,
      }).success,
    ).toBe(false);
    expect(
      safeParseRegistryIntegrityResult({
        ...validIntegrity,
        derivedIndexStatus: "stale",
        derivedIndexIssues: [],
      }).success,
    ).toBe(false);
    expect(
      safeParseRegistryRecoveryResult({
        ...failed,
        activeSnapshotId: SNAPSHOT_ID,
      }).success,
    ).toBe(false);
    expect(
      safeParseRegistryRecoveryResult({
        ...recovered,
        activeSnapshotId: SNAPSHOT_ID,
        registeredSnapshotCount: 0,
      }).success,
    ).toBe(false);
  });

  it("keeps derived-index state explicitly non-authoritative and rebuildable", () => {
    const current = {
      schemaVersion: "1.0" as const,
      status: "current" as const,
      index: {
        schemaVersion: "1.0" as const,
        activeSnapshotId: SNAPSHOT_ID,
        indexedThroughSequence: 6,
        authoritativeIntegrityFingerprint: TWO,
        indexFingerprint: THREE,
      },
      authoritativeThroughSequence: 6,
      authoritativeIntegrityFingerprint: TWO,
      issues: [],
    };
    const missing = {
      schemaVersion: "1.0" as const,
      status: "missing" as const,
      index: null,
      authoritativeThroughSequence: 6,
      authoritativeIntegrityFingerprint: TWO,
      issues: [],
    };

    expect(DerivedRegistryIndexResultSchema.parse(current)).toEqual(current);
    expect(DerivedRegistryIndexResultSchema.parse({ ...current, status: "rebuilt" })).toEqual({
      ...current,
      status: "rebuilt",
    });
    expect(DerivedRegistryIndexResultSchema.parse(missing)).toEqual(missing);
    expect(
      safeParseDerivedRegistryIndexResult({
        ...current,
        authoritativeThroughSequence: 7,
      }).success,
    ).toBe(false);
    expect(
      safeParseDerivedRegistryIndexResult({
        ...current,
        authoritativeIntegrityFingerprint: FOUR,
      }).success,
    ).toBe(false);
    expect(
      safeParseDerivedRegistryIndexResult({
        ...missing,
        index: current.index,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields throughout result contracts", () => {
    const invalid = {
      schemaVersion: "1.0",
      status: "rejected",
      transactionId: "transaction-activate-stale",
      candidateSnapshotId: SNAPSHOT_ID,
      currentActiveSnapshotId: null,
      failureCode: "stale_active_snapshot",
      message: "Stale activation.",
      rejectedAt: NOW,
      physicalPath: "/tmp/registry",
    };

    expect(safeParseSnapshotActivationResult(invalid).success).toBe(false);
  });
});
