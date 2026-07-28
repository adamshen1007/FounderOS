import { describe, expect, it } from "vitest";

import {
  KnowledgeCorpusChangeSetSchema,
  KnowledgeCorpusSourceSchema,
  KnowledgeRepositorySnapshotSchema,
  safeParseKnowledgeCorpusChangeSet,
  safeParseKnowledgeRepositorySnapshot,
} from "../src/index.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function source() {
  return {
    schemaVersion: "1.0",
    corpusId: "founderos-priority-1",
    corpusVersion: "1.0",
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
  };
}

function snapshot() {
  return {
    schemaVersion: "1.0",
    snapshotId: `snapshot-${A}`,
    corpusId: "founderos-priority-1",
    corpusVersion: "1.0",
    sourceManifestReference: "knowledge/migration-manifest.yaml",
    contentFingerprint: A,
    objectCount: 2,
    creation: { createdAt: "2026-07-28T00:00:00Z", createdBy: "knowledge-engine" },
    objects: [
      {
        objectId: "a",
        objectType: "knowledge",
        sourcePath: "docs/a.md",
        sourceHash: A,
        metadataFingerprint: A,
        objectFingerprint: A,
      },
      {
        objectId: "b",
        objectType: "principle",
        sourcePath: "docs/b.md",
        sourceHash: B,
        metadataFingerprint: B,
        objectFingerprint: B,
      },
    ],
  };
}

function unchanged() {
  return {
    schemaVersion: "1.0",
    previousSnapshotId: `snapshot-${A}`,
    currentSnapshotId: `snapshot-${A}`,
    previousCorpusVersion: "1.0",
    currentCorpusVersion: "1.0",
    corpusVersionChanged: false,
    previousContentFingerprint: A,
    currentContentFingerprint: A,
    contentFingerprintChanged: false,
    addedObjectIds: [],
    removedObjectIds: [],
    identityChanges: [],
    sourceHashChanges: [],
    metadataChanges: [],
    objectChanges: [],
    changed: false,
  };
}

describe("Milestone 07 corpus contracts", () => {
  it("validates corpus source identity, version, and manifest provenance", () => {
    expect(KnowledgeCorpusSourceSchema.parse(source())).toEqual(source());
    expect(
      KnowledgeCorpusSourceSchema.safeParse({ ...source(), storageUrl: "private" }).success,
    ).toBe(false);
    expect(
      KnowledgeCorpusSourceSchema.safeParse({
        ...source(),
        source: { ...source().source, sourceType: "in_memory" },
      }).success,
    ).toBe(false);
  });

  it("validates deterministic snapshot records", () => {
    expect(KnowledgeRepositorySnapshotSchema.parse(snapshot())).toEqual(snapshot());
    expect(safeParseKnowledgeRepositorySnapshot({ ...snapshot(), objectCount: 1 }).success).toBe(
      false,
    );
    expect(
      safeParseKnowledgeRepositorySnapshot({ ...snapshot(), contentFingerprint: "bad" }).success,
    ).toBe(false);
    expect(
      safeParseKnowledgeRepositorySnapshot({ ...snapshot(), snapshotId: "snapshot-arbitrary" })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate IDs, duplicate paths, and unsorted snapshot records", () => {
    const duplicateId = snapshot();
    duplicateId.objects[1]!.objectId = "a";
    expect(safeParseKnowledgeRepositorySnapshot(duplicateId).success).toBe(false);
    const duplicatePath = snapshot();
    duplicatePath.objects[1]!.sourcePath = "docs/a.md";
    expect(safeParseKnowledgeRepositorySnapshot(duplicatePath).success).toBe(false);
    const unsorted = snapshot();
    unsorted.objects.reverse();
    expect(safeParseKnowledgeRepositorySnapshot(unsorted).success).toBe(false);
  });

  it("validates unchanged and changed result consistency", () => {
    expect(KnowledgeCorpusChangeSetSchema.parse(unchanged()).changed).toBe(false);
    expect(safeParseKnowledgeCorpusChangeSet({ ...unchanged(), changed: true }).success).toBe(
      false,
    );
    expect(
      safeParseKnowledgeCorpusChangeSet({ ...unchanged(), corpusVersionChanged: true }).success,
    ).toBe(false);
    expect(
      safeParseKnowledgeCorpusChangeSet({ ...unchanged(), contentFingerprintChanged: true })
        .success,
    ).toBe(false);
    expect(safeParseKnowledgeCorpusChangeSet({ ...unchanged(), databaseRevision: 1 }).success).toBe(
      false,
    );
  });

  it.each([
    ["addedObjectIds", { addedObjectIds: ["b", "a"], changed: true }],
    ["removedObjectIds", { removedObjectIds: ["a", "a"], changed: true }],
    [
      "identityChanges",
      {
        identityChanges: [
          { sourcePath: "docs/a.md", previousObjectId: "a", currentObjectId: "b" },
          { sourcePath: "docs/a.md", previousObjectId: "c", currentObjectId: "d" },
        ],
        changed: true,
      },
    ],
    [
      "sourceHashChanges",
      {
        sourceHashChanges: [
          { objectId: "a", previous: A, current: B },
          { objectId: "a", previous: B, current: A },
        ],
        changed: true,
      },
    ],
    [
      "metadataChanges",
      {
        metadataChanges: [
          { objectId: "z", previous: A, current: B },
          { objectId: "a", previous: A, current: B },
        ],
        changed: true,
      },
    ],
    [
      "objectChanges",
      {
        objectChanges: [
          { objectId: "a", previous: A, current: B },
          { objectId: "a", previous: B, current: A },
        ],
        changed: true,
      },
    ],
  ])("rejects invalid deterministic ordering in %s", (_label, replacement) => {
    expect(safeParseKnowledgeCorpusChangeSet({ ...unchanged(), ...replacement }).success).toBe(
      false,
    );
  });

  it("rejects unchanged fingerprint entries", () => {
    expect(
      safeParseKnowledgeCorpusChangeSet({
        ...unchanged(),
        sourceHashChanges: [{ objectId: "a", previous: A, current: A }],
        changed: true,
      }).success,
    ).toBe(false);
  });
});
