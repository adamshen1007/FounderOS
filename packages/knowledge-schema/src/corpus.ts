import { z } from "zod";

import { KnowledgeObjectTypeSchema } from "./enums.js";
import { MigrationPathSchema, MigrationSourcePathSchema } from "./migration.js";
import {
  IdentifierSchema,
  IsoTemporalSchema,
  NonEmptyStringSchema,
  Sha256DigestSchema,
} from "./primitives.js";
import { KnowledgeCandidateSourceDescriptorSchema } from "./repository.js";

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1]! < value)
  );
}

function requireSortedUniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
  context: z.RefinementCtx,
  path: string,
): void {
  if (!isSortedUnique(values.map(key))) {
    context.addIssue({
      code: "custom",
      message: `${path} must be unique and sorted`,
      path: [path],
    });
  }
}

export const KnowledgeCorpusSourceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    corpusId: IdentifierSchema,
    corpusVersion: NonEmptyStringSchema,
    sourceManifestReference: MigrationPathSchema,
    source: KnowledgeCandidateSourceDescriptorSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source.sourceType !== "knowledge_corpus") {
      context.addIssue({
        code: "custom",
        message: "Corpus candidate sources must use sourceType knowledge_corpus",
        path: ["source", "sourceType"],
      });
    }
    if (value.source.provenance.sourceReference !== value.sourceManifestReference) {
      context.addIssue({
        code: "custom",
        message: "Candidate source provenance must reference the source manifest",
        path: ["source", "provenance", "sourceReference"],
      });
    }
  });

export const KnowledgeRepositorySnapshotObjectSchema = z
  .object({
    objectId: IdentifierSchema,
    objectType: KnowledgeObjectTypeSchema,
    sourcePath: MigrationSourcePathSchema,
    sourceHash: Sha256DigestSchema,
    contentFingerprint: Sha256DigestSchema,
    metadataFingerprint: Sha256DigestSchema,
    objectFingerprint: Sha256DigestSchema,
  })
  .strict();

export const KnowledgeRepositorySnapshotCreationSchema = z
  .object({
    createdAt: IsoTemporalSchema,
    createdBy: IdentifierSchema,
  })
  .strict();

export const KnowledgeRepositorySnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    snapshotId: IdentifierSchema,
    corpusId: IdentifierSchema,
    corpusVersion: NonEmptyStringSchema,
    sourceManifestReference: MigrationPathSchema,
    contentFingerprint: Sha256DigestSchema,
    objectCount: z.number().int().nonnegative(),
    creation: KnowledgeRepositorySnapshotCreationSchema,
    objects: z.array(KnowledgeRepositorySnapshotObjectSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.objectCount !== snapshot.objects.length) {
      context.addIssue({
        code: "custom",
        message: "objectCount must equal the number of snapshot object records",
        path: ["objectCount"],
      });
    }
    if (snapshot.snapshotId !== `snapshot-${snapshot.contentFingerprint}`) {
      context.addIssue({
        code: "custom",
        message: "snapshotId must be derived from contentFingerprint",
        path: ["snapshotId"],
      });
    }
    requireSortedUniqueBy(snapshot.objects, (object) => object.objectId, context, "objects");
    const paths = snapshot.objects.map((object) => object.sourcePath);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        message: "Snapshot source paths must be unique",
        path: ["objects"],
      });
    }
  });

export const KnowledgeCorpusIdentityChangeSchema = z
  .object({
    sourcePath: MigrationSourcePathSchema,
    previousObjectId: IdentifierSchema,
    currentObjectId: IdentifierSchema,
  })
  .strict()
  .refine((change) => change.previousObjectId !== change.currentObjectId, {
    message: "Identity changes must contain different object IDs",
    path: ["currentObjectId"],
  });

function fingerprintChangeSchema(fieldName: string) {
  return z
    .object({
      objectId: IdentifierSchema,
      previous: Sha256DigestSchema,
      current: Sha256DigestSchema,
    })
    .strict()
    .refine((change) => change.previous !== change.current, {
      message: `${fieldName} changes must contain different fingerprints`,
      path: ["current"],
    });
}

export const KnowledgeCorpusSourceHashChangeSchema = fingerprintChangeSchema("sourceHash");
export const KnowledgeCorpusMetadataChangeSchema = fingerprintChangeSchema("metadataFingerprint");
export const KnowledgeCorpusObjectChangeSchema = fingerprintChangeSchema("objectFingerprint");

export const KnowledgeCorpusChangeSetSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    previousSnapshotId: IdentifierSchema,
    currentSnapshotId: IdentifierSchema,
    previousCorpusVersion: NonEmptyStringSchema,
    currentCorpusVersion: NonEmptyStringSchema,
    corpusVersionChanged: z.boolean(),
    previousContentFingerprint: Sha256DigestSchema,
    currentContentFingerprint: Sha256DigestSchema,
    contentFingerprintChanged: z.boolean(),
    addedObjectIds: z.array(IdentifierSchema),
    removedObjectIds: z.array(IdentifierSchema),
    identityChanges: z.array(KnowledgeCorpusIdentityChangeSchema),
    sourceHashChanges: z.array(KnowledgeCorpusSourceHashChangeSchema),
    metadataChanges: z.array(KnowledgeCorpusMetadataChangeSchema),
    objectChanges: z.array(KnowledgeCorpusObjectChangeSchema),
    changed: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.corpusVersionChanged !==
      (value.previousCorpusVersion !== value.currentCorpusVersion)
    ) {
      context.addIssue({
        code: "custom",
        message: "corpusVersionChanged must match the compared corpus versions",
        path: ["corpusVersionChanged"],
      });
    }
    if (
      value.contentFingerprintChanged !==
      (value.previousContentFingerprint !== value.currentContentFingerprint)
    ) {
      context.addIssue({
        code: "custom",
        message: "contentFingerprintChanged must match the compared content fingerprints",
        path: ["contentFingerprintChanged"],
      });
    }
    if (!isSortedUnique(value.addedObjectIds))
      context.addIssue({
        code: "custom",
        message: "addedObjectIds must be unique and sorted",
        path: ["addedObjectIds"],
      });
    if (!isSortedUnique(value.removedObjectIds))
      context.addIssue({
        code: "custom",
        message: "removedObjectIds must be unique and sorted",
        path: ["removedObjectIds"],
      });
    requireSortedUniqueBy(
      value.identityChanges,
      (change) => change.sourcePath,
      context,
      "identityChanges",
    );
    requireSortedUniqueBy(
      value.sourceHashChanges,
      (change) => change.objectId,
      context,
      "sourceHashChanges",
    );
    requireSortedUniqueBy(
      value.metadataChanges,
      (change) => change.objectId,
      context,
      "metadataChanges",
    );
    requireSortedUniqueBy(
      value.objectChanges,
      (change) => change.objectId,
      context,
      "objectChanges",
    );
    const detected =
      value.corpusVersionChanged ||
      value.contentFingerprintChanged ||
      value.addedObjectIds.length > 0 ||
      value.removedObjectIds.length > 0 ||
      value.identityChanges.length > 0 ||
      value.sourceHashChanges.length > 0 ||
      value.metadataChanges.length > 0 ||
      value.objectChanges.length > 0;
    if (value.changed !== detected)
      context.addIssue({
        code: "custom",
        message: "changed must reflect whether the comparison contains any change",
        path: ["changed"],
      });
  });

export type KnowledgeCorpusSource = z.infer<typeof KnowledgeCorpusSourceSchema>;
export type KnowledgeRepositorySnapshotObject = z.infer<
  typeof KnowledgeRepositorySnapshotObjectSchema
>;
export type KnowledgeRepositorySnapshot = z.infer<typeof KnowledgeRepositorySnapshotSchema>;
export type KnowledgeCorpusChangeSet = z.infer<typeof KnowledgeCorpusChangeSetSchema>;
