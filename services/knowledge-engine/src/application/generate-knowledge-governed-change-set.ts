import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotComparisonRequestSchema,
  type KnowledgeGovernedChangeSet,
  type KnowledgeRepositorySnapshot,
} from "@founderos/knowledge-schema";

import {
  deepFreeze,
  KnowledgeSnapshotComparisonError,
  parseWithSnapshotDomainError,
} from "../domain/snapshot-lifecycle.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function generateKnowledgeGovernedChangeSet(
  requestInput: unknown,
): KnowledgeGovernedChangeSet {
  const request = parseWithSnapshotDomainError<{
    currentSnapshot: KnowledgeRepositorySnapshot;
    proposedSnapshot: KnowledgeRepositorySnapshot;
  }>(
    KnowledgeSnapshotComparisonRequestSchema,
    requestInput,
    KnowledgeSnapshotComparisonError,
    "Cannot compare snapshots",
  );
  const currentById = new Map(
    request.currentSnapshot.objects.map((object) => [object.objectId, object]),
  );
  const proposedById = new Map(
    request.proposedSnapshot.objects.map((object) => [object.objectId, object]),
  );
  const addedObjects = request.proposedSnapshot.objects
    .filter((object) => !currentById.has(object.objectId))
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
  const removedObjects = request.currentSnapshot.objects
    .filter((object) => !proposedById.has(object.objectId))
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
  const modifiedObjects = request.currentSnapshot.objects
    .flatMap((previous) => {
      const current = proposedById.get(previous.objectId);
      if (current === undefined) return [];
      const changeTypes = [
        ...(previous.contentFingerprint !== current.contentFingerprint ? ["content" as const] : []),
        ...(previous.metadataFingerprint !== current.metadataFingerprint
          ? ["metadata" as const]
          : []),
        ...(previous.objectType !== current.objectType ? ["object_type" as const] : []),
        ...(previous.sourcePath !== current.sourcePath || previous.sourceHash !== current.sourceHash
          ? ["provenance" as const]
          : []),
      ].sort(compareStrings);
      return changeTypes.length === 0
        ? []
        : [{ objectId: previous.objectId, previous, current, changeTypes }];
    })
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
  const corpusVersionChanged =
    request.currentSnapshot.corpusVersion !== request.proposedSnapshot.corpusVersion;

  return deepFreeze(
    parseWithSnapshotDomainError(
      KnowledgeGovernedChangeSetSchema,
      {
        schemaVersion: "1.0",
        changeId: `change-${request.currentSnapshot.snapshotId}-to-${request.proposedSnapshot.snapshotId}`,
        sourceSnapshotId: request.currentSnapshot.snapshotId,
        targetSnapshotId: request.proposedSnapshot.snapshotId,
        sourceCorpusVersion: request.currentSnapshot.corpusVersion,
        targetCorpusVersion: request.proposedSnapshot.corpusVersion,
        corpusVersionChanged,
        addedObjects,
        removedObjects,
        modifiedObjects,
        reviewStatus: "pending",
        changed:
          corpusVersionChanged ||
          addedObjects.length > 0 ||
          removedObjects.length > 0 ||
          modifiedObjects.length > 0,
      },
      KnowledgeSnapshotComparisonError,
      "Cannot generate governed change set",
    ),
  );
}
