import { describe, expect, it } from "vitest";

import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotComparisonRequestSchema,
  SnapshotLifecycleStatusSchema,
  parseKnowledgeGovernedChangeSet,
  safeParseKnowledgeSnapshotApprovalWorkflow,
  safeParseKnowledgeSnapshotComparisonRequest,
  safeParseKnowledgeSnapshotLifecycleRecord,
} from "../src/index.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function snapshot(fingerprint: string, corpusVersion: string, objectId = "knowledge-001") {
  return {
    schemaVersion: "1.0",
    snapshotId: `snapshot-${fingerprint}`,
    corpusId: "founderos-priority-1",
    corpusVersion,
    sourceManifestReference: "knowledge/migration-manifest.yaml",
    contentFingerprint: fingerprint,
    objectCount: 1,
    creation: { createdAt: "2026-07-28T00:00:00Z", createdBy: "knowledge-engine" },
    objects: [
      {
        objectId,
        objectType: "knowledge",
        sourcePath: `docs/${objectId}.md`,
        sourceHash: fingerprint,
        contentFingerprint: fingerprint,
        metadataFingerprint: fingerprint,
        objectFingerprint: fingerprint,
      },
    ],
  };
}

function lifecycle(status: string) {
  const states = [
    "created",
    "validated",
    "reviewing",
    "approved",
    "active",
    "superseded",
    "archived",
  ];
  const finalIndex = states.indexOf(status);

  return {
    snapshotId: `snapshot-${A}`,
    status,
    transitions: states.slice(1, finalIndex + 1).map((to, index) => ({
      from: states[index],
      to,
      actorId: "founder",
      transitionedAt: `2026-07-28T00:0${index}:00Z`,
    })),
  };
}

function governedChangeSet() {
  const source = snapshot(A, "1.0");
  const target = snapshot(B, "2.0");

  return {
    schemaVersion: "1.0",
    changeId: `change-${source.snapshotId}-to-${target.snapshotId}`,
    sourceSnapshotId: source.snapshotId,
    targetSnapshotId: target.snapshotId,
    sourceCorpusVersion: source.corpusVersion,
    targetCorpusVersion: target.corpusVersion,
    corpusVersionChanged: true,
    addedObjects: [],
    removedObjects: [],
    modifiedObjects: [
      {
        objectId: "knowledge-001",
        previous: source.objects[0],
        current: target.objects[0],
        changeTypes: ["content", "metadata", "provenance"],
      },
    ],
    reviewStatus: "pending",
    changed: true,
  };
}

describe("SnapshotLifecycleStatusSchema", () => {
  it.each(["created", "validated", "reviewing", "approved", "active", "superseded", "archived"])(
    "accepts %s",
    (status) => {
      expect(SnapshotLifecycleStatusSchema.parse(status)).toBe(status);
    },
  );
});

describe("KnowledgeSnapshotLifecycleRecordSchema", () => {
  it("validates every deterministic lifecycle state", () => {
    for (const status of [
      "created",
      "validated",
      "reviewing",
      "approved",
      "active",
      "superseded",
      "archived",
    ]) {
      expect(safeParseKnowledgeSnapshotLifecycleRecord(lifecycle(status)).success).toBe(true);
    }
  });

  it("requires a created record to have no history", () => {
    const input = lifecycle("created");
    input.transitions.push({
      from: "created",
      to: "validated",
      actorId: "founder",
      transitionedAt: "2026-07-28T00:00:00Z",
    });

    expect(safeParseKnowledgeSnapshotLifecycleRecord(input).success).toBe(false);
  });

  it.each([
    ["skipped lifecycle state", { from: "created", to: "reviewing" }],
    ["broken transition chain", { from: "created", to: "validated" }],
    ["status mismatches final transition", undefined],
  ])("rejects %s", (_label, replacement) => {
    const input = lifecycle("reviewing");
    if (replacement) input.transitions[1] = { ...input.transitions[1]!, ...replacement };
    else input.status = "approved";

    expect(safeParseKnowledgeSnapshotLifecycleRecord(input).success).toBe(false);
  });

  it("rejects temporal evidence that is not strictly ordered", () => {
    const input = lifecycle("reviewing");
    input.transitions[1] = {
      ...input.transitions[1]!,
      transitionedAt: "2026-07-28T00:00:00Z",
    };

    expect(safeParseKnowledgeSnapshotLifecycleRecord(input).success).toBe(false);
  });
});

describe("KnowledgeSnapshotComparisonRequestSchema", () => {
  it("accepts distinct immutable snapshots from one corpus", () => {
    const currentSnapshot = snapshot(A, "1.0");
    const proposedSnapshot = snapshot(B, "2.0");

    expect(
      KnowledgeSnapshotComparisonRequestSchema.parse({ currentSnapshot, proposedSnapshot }),
    ).toEqual({ currentSnapshot, proposedSnapshot });
  });

  it.each([
    ["cross-corpus snapshots", { corpusId: "another-corpus" }],
    ["identical snapshots", undefined],
  ])("rejects %s", (_label, proposedReplacement) => {
    const currentSnapshot = snapshot(A, "1.0");
    const proposedSnapshot = proposedReplacement
      ? { ...snapshot(B, "2.0"), ...proposedReplacement }
      : snapshot(A, "1.0");

    expect(
      safeParseKnowledgeSnapshotComparisonRequest({ currentSnapshot, proposedSnapshot }).success,
    ).toBe(false);
  });
});

describe("KnowledgeGovernedChangeSetSchema", () => {
  it("preserves complete object records, provenance, review status, and serialization", () => {
    const parsed = parseKnowledgeGovernedChangeSet(governedChangeSet());

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(governedChangeSet());
    expect(parsed.modifiedObjects[0]?.current.contentFingerprint).toBe(B);
  });

  it("permits a corpus-version-only change", () => {
    const input = governedChangeSet();
    input.modifiedObjects = [];

    expect(KnowledgeGovernedChangeSetSchema.parse(input).changed).toBe(true);
  });

  it.each([
    ["mismatched deterministic change ID", { changeId: "change-arbitrary" }],
    ["identical snapshot identities", { targetSnapshotId: `snapshot-${A}` }],
    ["incorrect version evidence", { corpusVersionChanged: false }],
    [
      "unsorted classifications",
      {
        modifiedObjects: [
          { ...governedChangeSet().modifiedObjects[0]!, changeTypes: ["provenance", "content"] },
        ],
      },
    ],
    [
      "unclassified object changes",
      { modifiedObjects: [{ ...governedChangeSet().modifiedObjects[0]!, changeTypes: [] }] },
    ],
    ["incorrect changed flag", { changed: false }],
  ])("rejects %s", (_label, replacement) => {
    expect(
      KnowledgeGovernedChangeSetSchema.safeParse({ ...governedChangeSet(), ...replacement })
        .success,
    ).toBe(false);
  });
});

describe("KnowledgeSnapshotApprovalWorkflowSchema", () => {
  it("requires a proposed snapshot identity consistent with its lifecycle and change set", () => {
    const activeSnapshot = snapshot(A, "1.0");
    const proposedSnapshot = snapshot(B, "2.0");
    const lifecycleRecord = {
      ...lifecycle("reviewing"),
      snapshotId: proposedSnapshot.snapshotId,
    };
    const changeSet = governedChangeSet();
    changeSet.reviewStatus = "reviewing";

    expect(
      KnowledgeSnapshotApprovalWorkflowSchema.parse({
        activeSnapshot,
        proposedSnapshot,
        changeSet,
        proposedSnapshotLifecycle: lifecycleRecord,
        reviewStatus: "reviewing",
      }),
    ).toMatchObject({ reviewStatus: "reviewing" });
  });

  it.each([
    ["activation without approval", "active", "reviewing"],
    ["reviewing lifecycle without an in-progress review", "reviewing", "pending"],
    ["approved lifecycle without approval", "approved", "reviewing"],
    ["rejected review with an active lifecycle", "active", "rejected"],
  ])("rejects %s", (_label, lifecycleStatus, reviewStatus) => {
    const activeSnapshot = snapshot(A, "1.0");
    const proposedSnapshot = snapshot(B, "2.0");
    const changeSet = governedChangeSet();
    changeSet.reviewStatus = reviewStatus;

    expect(
      safeParseKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot,
        proposedSnapshot,
        changeSet,
        proposedSnapshotLifecycle: {
          ...lifecycle(lifecycleStatus),
          snapshotId: proposedSnapshot.snapshotId,
        },
        reviewStatus,
      }).success,
    ).toBe(false);
  });
});
