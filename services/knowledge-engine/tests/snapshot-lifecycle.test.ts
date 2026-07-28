import { createHash } from "node:crypto";

import type {
  KnowledgeRepositorySnapshot,
  KnowledgeRepositorySnapshotObject,
} from "@founderos/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  activateKnowledgeSnapshotApprovalWorkflow,
  approveKnowledgeSnapshotApprovalWorkflow,
  beginKnowledgeSnapshotApprovalReview,
  createKnowledgeRepositorySnapshot,
  createKnowledgeSnapshotLifecycleRecord,
  generateKnowledgeGovernedChangeSet,
  initializeKnowledgeSnapshotApprovalWorkflow,
  rejectKnowledgeSnapshotApprovalWorkflow,
  transitionKnowledgeSnapshotLifecycle,
} from "../src/index.js";
import type { AcceptedMigrationDocumentReport } from "../src/interfaces/migration-report.js";

const HASH = (value: string): string => createHash("sha256").update(value).digest("hex");
const CREATED_AT = "2026-07-28T00:00:00.000Z";
const TRANSITION_TIMES = [
  "2026-07-28T00:01:00.000Z",
  "2026-07-28T00:02:00.000Z",
  "2026-07-28T00:03:00.000Z",
  "2026-07-28T00:04:00.000Z",
  "2026-07-28T00:05:00.000Z",
  "2026-07-28T00:06:00.000Z",
] as const;

function snapshotObject(
  objectId: string,
  overrides: Partial<KnowledgeRepositorySnapshotObject> = {},
): KnowledgeRepositorySnapshotObject {
  return {
    objectId,
    objectType: "knowledge",
    sourcePath: `docs/${objectId}.md`,
    sourceHash: HASH(`source:${objectId}`),
    contentFingerprint: HASH(`content:${objectId}`),
    metadataFingerprint: HASH(`metadata:${objectId}`),
    objectFingerprint: HASH(`object:${objectId}`),
    ...overrides,
  };
}

function snapshot(
  snapshotIdSuffix: string,
  objects: readonly KnowledgeRepositorySnapshotObject[],
  corpusVersion = "v1",
): KnowledgeRepositorySnapshot {
  const contentFingerprint = HASH(`snapshot:${snapshotIdSuffix}`);
  return {
    schemaVersion: "1.0",
    snapshotId: `snapshot-${contentFingerprint}`,
    corpusId: "founderos-priority-1",
    corpusVersion,
    sourceManifestReference: "knowledge/migration-manifest.yaml",
    contentFingerprint,
    objectCount: objects.length,
    creation: { createdAt: CREATED_AT, createdBy: "founderos-engine" },
    objects: [...objects].sort((left, right) => left.objectId.localeCompare(right.objectId)),
  };
}

function validatedLifecycle(proposed: KnowledgeRepositorySnapshot) {
  return transitionKnowledgeSnapshotLifecycle(
    createKnowledgeSnapshotLifecycleRecord(proposed),
    proposed,
    { actorId: "validator", transitionedAt: TRANSITION_TIMES[0] },
  );
}

describe("knowledge repository snapshot content fingerprints", () => {
  it("separates content from metadata for every KnowledgeObject payload shape", () => {
    const documents: AcceptedMigrationDocumentReport[] = [
      {
        actualSourceHash: HASH("source"),
        byteLength: 1,
        destinationPath: "knowledge/decisions/decision-object.md",
        expectedSourceHash: HASH("source"),
        id: "decision-object",
        migrationStatus: "ready",
        objectType: "decision",
        reviewStatus: "approved",
        sourcePath: "docs/decision.md",
        status: "accepted",
        object: {
          metadata: {
            id: "decision-object",
            objectType: "decision",
            title: "Decision",
            domain: "FounderOS",
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
            status: "active",
            confidence: "high",
            importance: "high",
            tags: [],
            relationships: [],
            source: {
              sourceType: "official_specification",
              sourceReference: "docs/decision.md",
              originalCreator: "FounderOS",
            },
          },
          context: "Knowledge governance",
          problem: "How snapshots become active",
          options: ["Require approval", "Activate automatically"],
          chosenOption: "Require approval",
          reasoning: "Traceability",
          expectedOutcome: "Human review",
          risks: [],
          relatedProjectIds: [],
          reviewDate: "2026-08-28T00:00:00.000Z",
          lessonsLearned: [],
        },
      },
    ];
    const corpus = {
      schemaVersion: "1.0" as const,
      corpusId: "founderos-priority-1",
      corpusVersion: "v1",
      sourceManifestReference: "knowledge/migration-manifest.yaml",
      source: {
        schemaVersion: "1.0" as const,
        sourceId: "founderos-priority-1",
        sourceType: "knowledge_corpus" as const,
        provenance: {
          sourceType: "migration_manifest" as const,
          sourceReference: "knowledge/migration-manifest.yaml",
          originalCreator: "FounderOS",
        },
      },
    };
    const first = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: CREATED_AT, createdBy: "founderos-engine" },
      documents,
    });
    const metadataChanged = structuredClone(documents);
    metadataChanged[0]!.object.metadata.title = "Renamed decision";
    const contentChanged = structuredClone(documents);
    const changedObject = contentChanged[0]!.object;
    if (!("chosenOption" in changedObject)) {
      throw new Error("Expected decision object");
    }
    changedObject.chosenOption = "Activate automatically";

    const same = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: "2030-01-01T00:00:00.000Z", createdBy: "another-engine" },
      documents,
    });
    const metadata = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: CREATED_AT, createdBy: "founderos-engine" },
      documents: metadataChanged,
    });
    const content = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: CREATED_AT, createdBy: "founderos-engine" },
      documents: contentChanged,
    });

    expect(same.snapshotId).toBe(first.snapshotId);
    expect(metadata.objects[0]!.contentFingerprint).toBe(first.objects[0]!.contentFingerprint);
    expect(content.objects[0]!.contentFingerprint).not.toBe(first.objects[0]!.contentFingerprint);
    expect(Object.isFrozen(first.objects[0])).toBe(true);
  });
});

describe("snapshot lifecycle", () => {
  it("creates and transitions immutable records only in lifecycle order", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const created = createKnowledgeSnapshotLifecycleRecord(proposed);
    const records = TRANSITION_TIMES.reduce(
      (history, transitionedAt, index) => [
        ...history,
        transitionKnowledgeSnapshotLifecycle(history.at(-1)!, proposed, {
          actorId: `actor-${index + 1}`,
          transitionedAt,
        }),
      ],
      [created],
    );
    const archived = records.at(-1)!;

    expect(created).toMatchObject({ status: "created", transitions: [] });
    expect(archived.transitions.map((transition) => [transition.from, transition.to])).toEqual([
      ["created", "validated"],
      ["validated", "reviewing"],
      ["reviewing", "approved"],
      ["approved", "active"],
      ["active", "superseded"],
      ["superseded", "archived"],
    ]);
    expect(created.status).toBe("created");
    expect(Object.isFrozen(archived.transitions)).toBe(true);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(records[1]!, proposed, {
        actorId: "reviewer",
        transitionedAt: TRANSITION_TIMES[0],
      }),
    ).toThrow(/increasing/i);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(created, snapshot("other", [snapshotObject("alpha")]), {
        actorId: "validator",
        transitionedAt: TRANSITION_TIMES[0],
      }),
    ).toThrow(/identity/i);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(archived, proposed, {
        actorId: "archivist",
        transitionedAt: "2026-07-28T00:07:00.000Z",
      }),
    ).toThrow(/archived/i);
  });
});

describe("governed snapshot comparison", () => {
  it("classifies complete, stable object evidence and version-only changes", () => {
    const previous = snapshot("previous", [
      snapshotObject("alpha"),
      snapshotObject("removed"),
      snapshotObject("modified"),
    ]);
    const proposed = snapshot(
      "proposed",
      [
        snapshotObject("added"),
        snapshotObject("alpha"),
        snapshotObject("modified", {
          objectType: "decision",
          sourcePath: "docs/moved-modified.md",
          sourceHash: HASH("source:changed"),
          contentFingerprint: HASH("content:changed"),
          metadataFingerprint: HASH("metadata:changed"),
          objectFingerprint: HASH("object:changed"),
        }),
      ],
      "v2",
    );
    const changeSet = generateKnowledgeGovernedChangeSet({
      currentSnapshot: previous,
      proposedSnapshot: proposed,
    });

    expect(changeSet).toMatchObject({
      changeId: `change-${previous.snapshotId}-to-${proposed.snapshotId}`,
      corpusVersionChanged: true,
      reviewStatus: "pending",
      changed: true,
    });
    expect(changeSet.addedObjects.map((object) => object.objectId)).toEqual(["added"]);
    expect(changeSet.removedObjects.map((object) => object.objectId)).toEqual(["removed"]);
    expect(changeSet.modifiedObjects).toMatchObject([
      {
        objectId: "modified",
        changeTypes: ["content", "metadata", "object_type", "provenance"],
      },
    ]);
    expect(JSON.stringify(changeSet)).toBe(
      JSON.stringify(
        generateKnowledgeGovernedChangeSet({
          currentSnapshot: previous,
          proposedSnapshot: proposed,
        }),
      ),
    );
    expect(
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: previous,
        proposedSnapshot: snapshot("version-only", previous.objects, "v2"),
      }),
    ).toMatchObject({ changed: true, corpusVersionChanged: true, modifiedObjects: [] });
  });
});

describe("snapshot approval workflow", () => {
  it("requires review approval before immutable activation", () => {
    const active = snapshot("active", [snapshotObject("alpha")]);
    const proposed = snapshot("proposed", [
      snapshotObject("alpha", { contentFingerprint: HASH("new") }),
    ]);
    const initialized = initializeKnowledgeSnapshotApprovalWorkflow({
      activeSnapshot: active,
      proposedSnapshot: proposed,
      proposedSnapshotLifecycle: validatedLifecycle(proposed),
    });
    const reviewing = beginKnowledgeSnapshotApprovalReview(initialized, {
      actorId: "reviewer",
      transitionedAt: TRANSITION_TIMES[1],
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(reviewing, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[2],
      }),
    ).toThrow(/approved/i);
    const approved = approveKnowledgeSnapshotApprovalWorkflow(reviewing, {
      actorId: "approver",
      transitionedAt: TRANSITION_TIMES[2],
    });
    const activated = activateKnowledgeSnapshotApprovalWorkflow(approved, {
      actorId: "activator",
      transitionedAt: TRANSITION_TIMES[3],
    });

    expect(initialized).toMatchObject({
      reviewStatus: "pending",
      proposedSnapshotLifecycle: { status: "validated" },
    });
    expect(reviewing).toMatchObject({
      reviewStatus: "reviewing",
      proposedSnapshotLifecycle: { status: "reviewing" },
    });
    expect(activated).toMatchObject({
      reviewStatus: "approved",
      proposedSnapshotLifecycle: { status: "active" },
    });
    expect(initialized).toMatchObject({
      reviewStatus: "pending",
      proposedSnapshotLifecycle: { status: "validated" },
    });
    expect(Object.isFrozen(activated)).toBe(true);
  });

  it("keeps rejected proposals in reviewing and cannot activate them", () => {
    const active = snapshot("active", [snapshotObject("alpha")]);
    const proposed = snapshot("proposed", [snapshotObject("beta")]);
    const reviewing = beginKnowledgeSnapshotApprovalReview(
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: active,
        proposedSnapshot: proposed,
        proposedSnapshotLifecycle: validatedLifecycle(proposed),
      }),
      { actorId: "reviewer", transitionedAt: TRANSITION_TIMES[1] },
    );
    const rejected = rejectKnowledgeSnapshotApprovalWorkflow(reviewing);

    expect(rejected).toMatchObject({
      reviewStatus: "rejected",
      changeSet: { reviewStatus: "rejected" },
      proposedSnapshotLifecycle: { status: "reviewing" },
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(rejected, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[2],
      }),
    ).toThrow(/approved/i);
  });
});
