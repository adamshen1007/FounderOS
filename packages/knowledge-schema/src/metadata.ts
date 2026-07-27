import { z } from "zod";

import {
  ConfidenceSchema,
  FreshnessSchema,
  ImportanceSchema,
  KnowledgeObjectTypeSchema,
  KnowledgeStatusSchema,
  RelationshipConfidenceSchema,
  RelationshipStrengthSchema,
  RelationshipTypeSchema,
} from "./enums.js";
import { IdentifierSchema, IsoTemporalSchema, NonEmptyStringSchema } from "./primitives.js";

export const SourceMetadataSchema = z
  .object({
    sourceType: NonEmptyStringSchema,
    sourceReference: NonEmptyStringSchema.optional(),
    author: NonEmptyStringSchema.optional(),
    originalCreator: NonEmptyStringSchema.optional(),
  })
  .strict();

export const RelationshipReferenceSchema = z
  .object({
    relationshipId: IdentifierSchema.optional(),
    targetObjectId: IdentifierSchema,
    type: RelationshipTypeSchema,
    strength: RelationshipStrengthSchema.optional(),
    confidence: RelationshipConfidenceSchema.optional(),
  })
  .strict();

export const KnowledgeMetadataShape = {
  id: IdentifierSchema,
  title: NonEmptyStringSchema,
  objectType: KnowledgeObjectTypeSchema,
  domain: NonEmptyStringSchema,
  category: NonEmptyStringSchema.optional(),
  subCategory: NonEmptyStringSchema.optional(),
  source: SourceMetadataSchema,
  createdAt: IsoTemporalSchema,
  updatedAt: IsoTemporalSchema,
  status: KnowledgeStatusSchema,
  confidence: ConfidenceSchema,
  importance: ImportanceSchema,
  freshness: FreshnessSchema.optional(),
  validationStatus: NonEmptyStringSchema.optional(),
  tags: z.array(NonEmptyStringSchema).default([]),
  relationships: z.array(RelationshipReferenceSchema).default([]),
} as const;

export function validateMetadataDates(
  metadata: {
    id: string;
    createdAt: string;
    updatedAt: string;
    relationships: Array<{ targetObjectId: string }>;
  },
  context: z.RefinementCtx,
): void {
  if (Date.parse(metadata.updatedAt) < Date.parse(metadata.createdAt)) {
    context.addIssue({
      code: "custom",
      message: "updatedAt cannot be earlier than createdAt",
      path: ["updatedAt"],
    });
  }

  metadata.relationships.forEach((relationship, index) => {
    if (relationship.targetObjectId === metadata.id) {
      context.addIssue({
        code: "custom",
        message: "Metadata cannot reference its own object as a relationship target",
        path: ["relationships", index, "targetObjectId"],
      });
    }
  });
}

export const KnowledgeMetadataSchema = z
  .object(KnowledgeMetadataShape)
  .strict()
  .superRefine(validateMetadataDates);

export type KnowledgeMetadata = z.infer<typeof KnowledgeMetadataSchema>;
export type RelationshipReference = z.infer<typeof RelationshipReferenceSchema>;
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;
