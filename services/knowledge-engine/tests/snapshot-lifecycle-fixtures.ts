import { createHash } from "node:crypto";

import type {
  KnowledgeObject,
  KnowledgeRepositorySnapshot,
  KnowledgeRepositorySnapshotObject,
} from "@founderos/knowledge-schema";

import {
  createKnowledgeSnapshotLifecycleRecord,
  transitionKnowledgeSnapshotLifecycle,
} from "../src/index.js";
import type { AcceptedMigrationDocumentReport } from "../src/interfaces/migration-report.js";

export const HASH = (value: string): string => createHash("sha256").update(value).digest("hex");
export const CREATED_AT = "2026-07-28T00:00:00.000Z";
export const TRANSITION_TIMES = [
  "2026-07-28T00:01:00.000Z",
  "2026-07-28T00:02:00.000Z",
  "2026-07-28T00:03:00.000Z",
  "2026-07-28T00:04:00.000Z",
  "2026-07-28T00:05:00.000Z",
  "2026-07-28T00:06:00.000Z",
] as const;

export function snapshotObject(
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

export function snapshot(
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

export function validatedLifecycle(proposed: KnowledgeRepositorySnapshot) {
  return transitionKnowledgeSnapshotLifecycle(
    createKnowledgeSnapshotLifecycleRecord(proposed),
    proposed,
    { actorId: "validator", transitionedAt: TRANSITION_TIMES[0] },
  );
}

export function activeLifecycle(active: KnowledgeRepositorySnapshot) {
  return TRANSITION_TIMES.slice(0, 4).reduce(
    (record, transitionedAt, index) =>
      transitionKnowledgeSnapshotLifecycle(record, active, {
        actorId: `active-actor-${index + 1}`,
        transitionedAt,
      }),
    createKnowledgeSnapshotLifecycleRecord(active),
  );
}

export function metadata<T extends KnowledgeObject["metadata"]["objectType"]>(
  id: string,
  objectType: T,
) {
  return {
    id,
    objectType,
    title: `${id} title`,
    domain: "FounderOS",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    status: "active" as const,
    confidence: "high" as const,
    importance: "high" as const,
    tags: [],
    relationships: [],
    source: {
      sourceType: "official_specification",
      sourceReference: `docs/${id}.md`,
      originalCreator: "FounderOS",
    },
  };
}

export function document(object: KnowledgeObject): AcceptedMigrationDocumentReport {
  const { id, objectType } = object.metadata;
  return {
    actualSourceHash: HASH(`source:${id}`),
    byteLength: 1,
    destinationPath: `knowledge/${id}.md`,
    expectedSourceHash: HASH(`source:${id}`),
    id,
    migrationStatus: "ready",
    objectType,
    reviewStatus: "approved",
    sourcePath: `docs/${id}.md`,
    status: "accepted",
    object,
  };
}

export const corpus = {
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
