import { z } from "zod";

import {
  ConfidenceSchema,
  FreshnessSchema,
  ImportanceSchema,
  KnowledgeObjectTypeSchema,
  KnowledgeStatusSchema,
} from "./enums.js";
import { RelationshipReferenceSchema } from "./metadata.js";
import { IdentifierSchema, IsoTemporalSchema, NonEmptyStringSchema } from "./primitives.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function isSafeRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return false;
  }

  const segments = value.split("/");
  return (
    segments.length > 0 &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

export const MigrationStatusSchema = z.enum(["pending", "ready", "migrated", "failed"]);
export const ReviewStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const MigrationPathSchema = NonEmptyStringSchema.refine(
  isSafeRelativePath,
  "Expected a normalized relative path without traversal or backslashes",
);

export const MigrationSourcePathSchema = MigrationPathSchema.refine(
  (value) => value.toLowerCase().endsWith(".md"),
  "Migration sources must be Markdown files",
);

export const MigrationDestinationPathSchema = MigrationPathSchema.refine(
  (value) => value.startsWith("knowledge/") && value.toLowerCase().endsWith(".md"),
  "Migration destinations must be Markdown paths below knowledge/",
);

export const MigrationMetadataSchema = z
  .object({
    title: NonEmptyStringSchema,
    domain: NonEmptyStringSchema,
    category: NonEmptyStringSchema.optional(),
    subCategory: NonEmptyStringSchema.optional(),
    createdAt: IsoTemporalSchema,
    updatedAt: IsoTemporalSchema,
    status: KnowledgeStatusSchema,
    confidence: ConfidenceSchema,
    importance: ImportanceSchema,
    freshness: FreshnessSchema.optional(),
    validationStatus: NonEmptyStringSchema.optional(),
    tags: z.array(NonEmptyStringSchema).default([]),
    relationships: z.array(RelationshipReferenceSchema).default([]),
  })
  .strict();

export const KnowledgeMigrationManifestEntrySchema = z
  .object({
    id: IdentifierSchema,
    objectType: KnowledgeObjectTypeSchema,
    sourcePath: MigrationSourcePathSchema,
    destinationPath: MigrationDestinationPathSchema,
    sourceHash: z.string().regex(SHA256_PATTERN, "Expected a lowercase SHA-256 digest"),
    migrationStatus: MigrationStatusSchema,
    reviewStatus: ReviewStatusSchema,
    metadata: MigrationMetadataSchema,
    objectData: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const KnowledgeMigrationManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    corpusId: IdentifierSchema,
    documents: z.array(KnowledgeMigrationManifestEntrySchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const idIndexes = new Map<string, number[]>();
    const destinationIndexes = new Map<string, number[]>();

    manifest.documents.forEach((document, index) => {
      idIndexes.set(document.id, [...(idIndexes.get(document.id) ?? []), index]);
      destinationIndexes.set(document.destinationPath, [
        ...(destinationIndexes.get(document.destinationPath) ?? []),
        index,
      ]);
    });

    for (const [id, indexes] of idIndexes) {
      if (indexes.length > 1) {
        for (const index of indexes) {
          context.addIssue({
            code: "custom",
            message: `Knowledge object ID ${id} is duplicated in the manifest`,
            path: ["documents", index, "id"],
          });
        }
      }
    }

    for (const [destinationPath, indexes] of destinationIndexes) {
      if (indexes.length > 1) {
        for (const index of indexes) {
          context.addIssue({
            code: "custom",
            message: `Destination path ${destinationPath} is duplicated in the manifest`,
            path: ["documents", index, "destinationPath"],
          });
        }
      }
    }
  });

export type KnowledgeMigrationManifest = z.infer<typeof KnowledgeMigrationManifestSchema>;
export type KnowledgeMigrationManifestEntry = z.infer<typeof KnowledgeMigrationManifestEntrySchema>;
export type MigrationMetadata = z.infer<typeof MigrationMetadataSchema>;
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
