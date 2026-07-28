import { describe, expect, it } from "vitest";

import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotComparisonEvidenceSchema,
  KnowledgeSnapshotComparisonRequestSchema,
  SnapshotLifecycleStatusSchema,
  parseKnowledgeGovernedChangeSet,
  safeParseKnowledgeSnapshotApprovalWorkflow,
  safeParseKnowledgeSnapshotComparisonRequest,
  safeParseKnowledgeSnapshotLifecycleRecord,
} from "../src/index.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const CREATED_AT = "2026-07-28T00:00:00Z";
const STATES = [
  "created",
  "validated",
  "reviewing",
  "approved",
  "active",
  "superseded",
  "archived",
] as const;

function snapshotObject(fingerprint: string, objectId = "knowledge-001") {
  return {
    objectId,
    objectType: "knowledge" as const,
    sourcePath: `docs/${objectId}.md`,
    sourceHash: fingerprint,
    metadataFingerprint: fingerprint,
    objectFingerprint: fingerprint,
  };
}

function comparisonObject(fingerprint: string, objectId = "knowledge-001") {
  return { ...snapshotObject(fingerprint, objectId), contentFingerprint: fingerprint };
}

function snapshotWithObjects(
  fingerprint: string,
  corpusVersion: string,
  objects: ReturnType<typeof snapshotObject>[],
  sourceManifestReference = "knowledge/migration-manifest.yaml",
) {
  return {
    schemaVersion: "1.0" as const,
    snapshotId: `snapshot-${fingerprint}`,
    corpusId: "founderos-priority-1",
    corpusVersion,
    sourceManifestReference,
    contentFingerprint: fingerprint,
    objectCount: objects.length,
    creation: { createdAt: CREATED_AT, createdBy: "knowledge-engine" },
    objects,
  };
}

function snapshot(fingerprint: string, corpusVersion: string, objectId = "knowledge-001") {
  return snapshotWithObjects(fingerprint, corpusVersion, [snapshotObject(fingerprint, objectId)]);
}

function evidence(
  value: ReturnType<typeof snapshotWithObjects>,
  objects = value.objects.map((object) => ({
    ...object,
    contentFingerprint: object.objectFingerprint,
  })),
) {
  return KnowledgeSnapshotComparisonEvidenceSchema.parse({
    schemaVersion: "1.0",
    snapshotId: value.snapshotId,
    objects,
  });
}

function lifecycle(value: ReturnType<typeof snapshot>, status: (typeof STATES)[number]) {
  const finalIndex = STATES.indexOf(status);
  return {
    snapshotId: value.snapshotId,
    snapshotCreatedAt: value.creation.createdAt,
    status,
    transitions: STATES.slice(1, finalIndex + 1).map((to, index) => ({
      from: STATES[index],
      to,
      actorId: `founder-${index}`,
      transitionedAt: `2026-07-28T00:0${index + 1}:00Z`,
    })),
  };
}

function governedChangeSet(reviewStatus = "pending") {
  const source = snapshot(A, "1.0");
  const target = snapshot(B, "2.0");
  return {
    schemaVersion: "1.0" as const,
    changeId: `change-${source.snapshotId}-to-${target.snapshotId}`,
    sourceSnapshotId: source.snapshotId,
    targetSnapshotId: target.snapshotId,
    sourceSnapshotFingerprint: source.contentFingerprint,
    targetSnapshotFingerprint: target.contentFingerprint,
    snapshotFingerprintChanged: true,
    sourceManifestReference: source.sourceManifestReference,
    targetManifestReference: target.sourceManifestReference,
    manifestReferenceChanged: false,
    sourceCorpusVersion: source.corpusVersion,
    targetCorpusVersion: target.corpusVersion,
    corpusVersionChanged: true,
    addedObjects: [],
    removedObjects: [],
    modifiedObjects: [
      {
        objectId: "knowledge-001",
        previous: comparisonObject(A),
        current: comparisonObject(B),
        changeTypes: ["content", "metadata", "provenance"] as const,
      },
    ],
    reviewStatus,
    changed: true,
  };
}

function workflowInput(
  proposedStatus: (typeof STATES)[number] = "reviewing",
  reviewStatus = "reviewing",
) {
  const activeSnapshot = snapshot(A, "1.0");
  const proposedSnapshot = snapshot(B, "2.0");
  const changeSet = governedChangeSet(reviewStatus);
  const decision =
    reviewStatus === "approved"
      ? {
          changeId: changeSet.changeId,
          proposedSnapshotId: proposedSnapshot.snapshotId,
          decision: "approved",
          actorId: "founder-2",
          decidedAt: "2026-07-28T00:03:00Z",
          reason: "Reviewed and approved.",
        }
      : reviewStatus === "rejected"
        ? {
            changeId: changeSet.changeId,
            proposedSnapshotId: proposedSnapshot.snapshotId,
            decision: "rejected",
            actorId: "founder-reviewer",
            decidedAt: "2026-07-28T00:03:00Z",
            reason: "Rejected after review.",
          }
        : null;

  return {
    activeSnapshot,
    activeSnapshotEvidence: evidence(activeSnapshot),
    activeSnapshotLifecycle: lifecycle(
      activeSnapshot,
      proposedStatus === "active" ? "superseded" : "active",
    ),
    proposedSnapshot,
    proposedSnapshotEvidence: evidence(proposedSnapshot),
    proposedSnapshotLifecycle: lifecycle(proposedSnapshot, proposedStatus),
    changeSet,
    reviewStatus,
    reviewDecision: decision,
  };
}

describe("KnowledgeSnapshotLifecycleRecordSchema", () => {
  it.each(STATES)("validates deterministic %s lifecycle evidence", (status) => {
    expect(
      safeParseKnowledgeSnapshotLifecycleRecord(lifecycle(snapshot(A, "1.0"), status)).success,
    ).toBe(true);
  });

  it("rejects skipped states and evidence at or before snapshot creation", () => {
    const value = snapshot(A, "1.0");
    const skipped = lifecycle(value, "reviewing");
    skipped.transitions[0] = { ...skipped.transitions[0]!, to: "reviewing" };
    expect(safeParseKnowledgeSnapshotLifecycleRecord(skipped).success).toBe(false);

    const tooEarly = lifecycle(value, "validated");
    tooEarly.transitions[0] = {
      ...tooEarly.transitions[0]!,
      transitionedAt: value.creation.createdAt,
    };
    expect(safeParseKnowledgeSnapshotLifecycleRecord(tooEarly).success).toBe(false);
  });
});

describe("KnowledgeSnapshotComparisonRequestSchema", () => {
  it("allows a real same-identity comparison with separate M08 content evidence", () => {
    const currentSnapshot = snapshot(A, "1.0");
    const currentSnapshotEvidence = evidence(currentSnapshot);
    expect(
      KnowledgeSnapshotComparisonRequestSchema.parse({
        currentSnapshot,
        currentSnapshotEvidence,
        proposedSnapshot: currentSnapshot,
        proposedSnapshotEvidence: currentSnapshotEvidence,
      }),
    ).toMatchObject({ currentSnapshot, proposedSnapshot: currentSnapshot });

    const conflictingEvidence = structuredClone(currentSnapshotEvidence);
    conflictingEvidence.objects[0]!.contentFingerprint = B;
    expect(
      safeParseKnowledgeSnapshotComparisonRequest({
        currentSnapshot,
        currentSnapshotEvidence,
        proposedSnapshot: currentSnapshot,
        proposedSnapshotEvidence: conflictingEvidence,
      }).success,
    ).toBe(false);
  });

  it("rejects cross-corpus snapshots and evidence that does not extend its snapshot", () => {
    const currentSnapshot = snapshot(A, "1.0");
    const proposedSnapshot = snapshot(B, "2.0");
    expect(
      safeParseKnowledgeSnapshotComparisonRequest({
        currentSnapshot,
        currentSnapshotEvidence: evidence(currentSnapshot),
        proposedSnapshot: { ...proposedSnapshot, corpusId: "other-corpus" },
        proposedSnapshotEvidence: evidence(proposedSnapshot),
      }).success,
    ).toBe(false);
    expect(
      safeParseKnowledgeSnapshotComparisonRequest({
        currentSnapshot,
        currentSnapshotEvidence: evidence(proposedSnapshot),
        proposedSnapshot,
        proposedSnapshotEvidence: evidence(proposedSnapshot),
      }).success,
    ).toBe(false);
  });
});

describe("KnowledgeGovernedChangeSetSchema", () => {
  it("preserves complete deterministic evidence and serialization", () => {
    const parsed = parseKnowledgeGovernedChangeSet(governedChangeSet());
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(governedChangeSet());
    expect(parsed.modifiedObjects[0]?.current.contentFingerprint).toBe(B);
  });

  it("permits a deterministic same-snapshot empty change set", () => {
    const value = snapshot(A, "1.0");
    const input = {
      ...governedChangeSet(),
      changeId: `change-${value.snapshotId}-to-${value.snapshotId}`,
      sourceSnapshotId: value.snapshotId,
      targetSnapshotId: value.snapshotId,
      sourceSnapshotFingerprint: value.contentFingerprint,
      targetSnapshotFingerprint: value.contentFingerprint,
      snapshotFingerprintChanged: false,
      sourceCorpusVersion: value.corpusVersion,
      targetCorpusVersion: value.corpusVersion,
      corpusVersionChanged: false,
      modifiedObjects: [],
      changed: false,
    };
    expect(KnowledgeGovernedChangeSetSchema.parse(input)).toMatchObject({ changed: false });

    expect(
      KnowledgeGovernedChangeSetSchema.safeParse({
        ...input,
        addedObjects: [comparisonObject(B, "added")],
        changed: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["mismatched deterministic change ID", { changeId: "change-arbitrary" }],
    ["incorrect snapshot fingerprint evidence", { snapshotFingerprintChanged: false }],
    ["incorrect version evidence", { corpusVersionChanged: false }],
    ["incorrect changed flag", { changed: false }],
  ])("rejects %s", (_label, replacement) => {
    expect(
      KnowledgeGovernedChangeSetSchema.safeParse({ ...governedChangeSet(), ...replacement })
        .success,
    ).toBe(false);
  });
});

describe("KnowledgeSnapshotApprovalWorkflowSchema", () => {
  it("retains the active baseline and validates reviewing and atomic activation states", () => {
    expect(KnowledgeSnapshotApprovalWorkflowSchema.parse(workflowInput())).toMatchObject({
      reviewStatus: "reviewing",
      activeSnapshotLifecycle: { status: "active" },
      proposedSnapshotLifecycle: { status: "reviewing" },
    });
    expect(
      KnowledgeSnapshotApprovalWorkflowSchema.parse(workflowInput("active", "approved")),
    ).toMatchObject({
      activeSnapshotLifecycle: { status: "superseded" },
      proposedSnapshotLifecycle: { status: "active" },
      reviewDecision: { decision: "approved" },
    });
  });

  it("rejects reduced, misaligned, and incomplete workflows", () => {
    const reduced = workflowInput();
    delete (reduced as Partial<typeof reduced>).activeSnapshotLifecycle;
    expect(safeParseKnowledgeSnapshotApprovalWorkflow(reduced).success).toBe(false);

    expect(
      safeParseKnowledgeSnapshotApprovalWorkflow(workflowInput("active", "reviewing")).success,
    ).toBe(false);

    const omittedModified = workflowInput();
    omittedModified.changeSet.modifiedObjects = [];
    expect(safeParseKnowledgeSnapshotApprovalWorkflow(omittedModified).success).toBe(false);

    const tamperedEvidence = workflowInput();
    tamperedEvidence.activeSnapshotEvidence.objects[0] = comparisonObject(C);
    expect(safeParseKnowledgeSnapshotApprovalWorkflow(tamperedEvidence).success).toBe(false);
  });

  it("requires bound approval and rejection decision evidence", () => {
    expect(
      KnowledgeSnapshotApprovalWorkflowSchema.parse(workflowInput("approved", "approved")),
    ).toMatchObject({ reviewDecision: { decision: "approved" } });
    expect(
      KnowledgeSnapshotApprovalWorkflowSchema.parse(workflowInput("reviewing", "rejected")),
    ).toMatchObject({ reviewDecision: { decision: "rejected" } });

    const unbound = workflowInput("approved", "approved");
    unbound.reviewDecision!.changeId = "another-change";
    expect(safeParseKnowledgeSnapshotApprovalWorkflow(unbound).success).toBe(false);

    const missing = workflowInput("approved", "approved");
    missing.reviewDecision = null;
    expect(safeParseKnowledgeSnapshotApprovalWorkflow(missing).success).toBe(false);
  });
});

describe("SnapshotLifecycleStatusSchema", () => {
  it.each(STATES)("accepts %s", (status) => {
    expect(SnapshotLifecycleStatusSchema.parse(status)).toBe(status);
  });
});
