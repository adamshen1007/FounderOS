import {
  KnowledgeCorpusChangeSetSchema,
  KnowledgeRepositorySnapshotSchema,
  type KnowledgeCorpusChangeSet,
  type KnowledgeRepositorySnapshot,
  type KnowledgeRepositorySnapshotObject,
} from "@founderos/knowledge-schema";

export class KnowledgeCorpusComparisonError extends Error {
  public constructor(previousCorpusId: string, currentCorpusId: string) {
    super(
      `Cannot compare repository snapshots from different corpora: ${previousCorpusId} and ${currentCorpusId}`,
    );
    this.name = "KnowledgeCorpusComparisonError";
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function indexById(
  objects: readonly KnowledgeRepositorySnapshotObject[],
): Map<string, KnowledgeRepositorySnapshotObject> {
  return new Map(objects.map((object) => [object.objectId, object]));
}

export function compareKnowledgeRepositorySnapshots(
  previousInput: KnowledgeRepositorySnapshot,
  currentInput: KnowledgeRepositorySnapshot,
): KnowledgeCorpusChangeSet {
  const previous = KnowledgeRepositorySnapshotSchema.parse(previousInput);
  const current = KnowledgeRepositorySnapshotSchema.parse(currentInput);

  if (previous.corpusId !== current.corpusId) {
    throw new KnowledgeCorpusComparisonError(previous.corpusId, current.corpusId);
  }

  const previousById = indexById(previous.objects);
  const currentById = indexById(current.objects);
  const previousByPath = new Map(previous.objects.map((object) => [object.sourcePath, object]));
  const currentByPath = new Map(current.objects.map((object) => [object.sourcePath, object]));
  const addedObjectIds = current.objects
    .filter((object) => !previousById.has(object.objectId))
    .map((object) => object.objectId)
    .sort(compareStrings);
  const removedObjectIds = previous.objects
    .filter((object) => !currentById.has(object.objectId))
    .map((object) => object.objectId)
    .sort(compareStrings);
  const identityChanges = [...previousByPath.entries()]
    .flatMap(([sourcePath, previousObject]) => {
      const currentObject = currentByPath.get(sourcePath);
      return currentObject !== undefined && currentObject.objectId !== previousObject.objectId
        ? [
            {
              sourcePath,
              previousObjectId: previousObject.objectId,
              currentObjectId: currentObject.objectId,
            },
          ]
        : [];
    })
    .sort((left, right) => compareStrings(left.sourcePath, right.sourcePath));
  const sharedObjectIds = previous.objects
    .map((object) => object.objectId)
    .filter((objectId) => currentById.has(objectId))
    .sort(compareStrings);
  const sourceHashChanges = sharedObjectIds.flatMap((objectId) => {
    const previousObject = previousById.get(objectId)!;
    const currentObject = currentById.get(objectId)!;
    return previousObject.sourceHash !== currentObject.sourceHash
      ? [{ objectId, previous: previousObject.sourceHash, current: currentObject.sourceHash }]
      : [];
  });
  const metadataChanges = sharedObjectIds.flatMap((objectId) => {
    const previousObject = previousById.get(objectId)!;
    const currentObject = currentById.get(objectId)!;
    return previousObject.metadataFingerprint !== currentObject.metadataFingerprint
      ? [
          {
            objectId,
            previous: previousObject.metadataFingerprint,
            current: currentObject.metadataFingerprint,
          },
        ]
      : [];
  });
  const objectChanges = sharedObjectIds.flatMap((objectId) => {
    const previousObject = previousById.get(objectId)!;
    const currentObject = currentById.get(objectId)!;
    return previousObject.objectFingerprint !== currentObject.objectFingerprint
      ? [
          {
            objectId,
            previous: previousObject.objectFingerprint,
            current: currentObject.objectFingerprint,
          },
        ]
      : [];
  });
  const corpusVersionChanged = previous.corpusVersion !== current.corpusVersion;
  const contentFingerprintChanged = previous.contentFingerprint !== current.contentFingerprint;
  const changed =
    corpusVersionChanged ||
    contentFingerprintChanged ||
    addedObjectIds.length > 0 ||
    removedObjectIds.length > 0 ||
    identityChanges.length > 0 ||
    sourceHashChanges.length > 0 ||
    metadataChanges.length > 0 ||
    objectChanges.length > 0;

  return KnowledgeCorpusChangeSetSchema.parse({
    schemaVersion: "1.0",
    previousSnapshotId: previous.snapshotId,
    currentSnapshotId: current.snapshotId,
    previousCorpusVersion: previous.corpusVersion,
    currentCorpusVersion: current.corpusVersion,
    corpusVersionChanged,
    previousContentFingerprint: previous.contentFingerprint,
    currentContentFingerprint: current.contentFingerprint,
    contentFingerprintChanged,
    addedObjectIds,
    removedObjectIds,
    identityChanges,
    sourceHashChanges,
    metadataChanges,
    objectChanges,
    changed,
  });
}
