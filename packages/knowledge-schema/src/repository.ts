import { z } from "zod";

import { SourceMetadataSchema } from "./metadata.js";
import { KnowledgeObjectSchema, type KnowledgeObject } from "./objects.js";
import { IdentifierSchema, NonEmptyStringSchema } from "./primitives.js";

export const KnowledgeCandidateSourceDescriptorSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    sourceId: IdentifierSchema,
    sourceType: NonEmptyStringSchema,
    provenance: SourceMetadataSchema,
  })
  .strict();

export const KnowledgeCandidateBatchSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    source: KnowledgeCandidateSourceDescriptorSchema,
    candidates: z.array(KnowledgeObjectSchema),
  })
  .strict()
  .superRefine((batch, context) => {
    const indexesById = new Map<string, number[]>();

    batch.candidates.forEach((candidate, index) => {
      indexesById.set(candidate.metadata.id, [
        ...(indexesById.get(candidate.metadata.id) ?? []),
        index,
      ]);
    });

    for (const [id, indexes] of indexesById) {
      if (indexes.length > 1) {
        for (const index of indexes) {
          context.addIssue({
            code: "custom",
            message: `Knowledge object ID ${id} is duplicated by the candidate source`,
            path: ["candidates", index, "metadata", "id"],
          });
        }
      }
    }
  });

export const KnowledgeRepositoryFindRequestSchema = z
  .object({
    ids: z
      .array(IdentifierSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, "Knowledge object IDs must be unique"),
  })
  .strict();

export type KnowledgeCandidateSourceDescriptor = z.infer<
  typeof KnowledgeCandidateSourceDescriptorSchema
>;
export type KnowledgeCandidateBatch = z.infer<typeof KnowledgeCandidateBatchSchema>;
export type KnowledgeRepositoryFindRequest = z.infer<typeof KnowledgeRepositoryFindRequestSchema>;

export interface KnowledgeCandidateSource {
  loadCandidates(): Promise<KnowledgeCandidateBatch>;
}

export interface KnowledgeRepository {
  find(request: KnowledgeRepositoryFindRequest): Promise<readonly KnowledgeObject[]>;
  getById(id: string): Promise<KnowledgeObject | null>;
  getCandidates(): Promise<readonly KnowledgeObject[]>;
  getSources(): Promise<readonly KnowledgeCandidateSourceDescriptor[]>;
}
