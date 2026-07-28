import { z } from "zod";

import { SourceMetadataSchema } from "./metadata.js";
import { KnowledgeObjectSchema } from "./objects.js";
import { IdentifierSchema } from "./primitives.js";
import { KnowledgeQuerySchema } from "./query.js";

function sourcesMatch(
  left: z.infer<typeof SourceMetadataSchema>,
  right: z.infer<typeof SourceMetadataSchema>,
): boolean {
  return (
    left.sourceType === right.sourceType &&
    left.sourceReference === right.sourceReference &&
    left.author === right.author &&
    left.originalCreator === right.originalCreator
  );
}

export const KnowledgeQueryAppliedConstraintSchema = z.enum([
  "context.domains",
  "context.objectTypes",
  "context.projects",
  "context.sourceTypes",
  "filters.categories",
  "filters.domains",
  "filters.objectTypes",
  "filters.projects",
  "filters.sourceReferences",
  "filters.sourceTypes",
  "filters.statuses",
  "filters.tags",
]);

export const KnowledgeQueryProvenanceSchema = z
  .object({
    objectId: IdentifierSchema,
    source: SourceMetadataSchema,
  })
  .strict();

export const KnowledgeQueryEvaluationSchema = z
  .object({
    confidence: z.literal("deterministic"),
    candidateCount: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative(),
    appliedConstraints: z.array(KnowledgeQueryAppliedConstraintSchema),
  })
  .strict()
  .superRefine((evaluation, context) => {
    if (evaluation.matchedCount > evaluation.candidateCount) {
      context.addIssue({
        code: "custom",
        message: "matchedCount cannot exceed candidateCount",
        path: ["matchedCount"],
      });
    }

    const sorted = [...evaluation.appliedConstraints].sort();
    if (
      new Set(evaluation.appliedConstraints).size !== evaluation.appliedConstraints.length ||
      sorted.some((value, index) => value !== evaluation.appliedConstraints[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "appliedConstraints must be unique and sorted",
        path: ["appliedConstraints"],
      });
    }
  });

export const KnowledgeQueryResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    query: KnowledgeQuerySchema,
    objects: z.array(KnowledgeObjectSchema),
    provenance: z.array(KnowledgeQueryProvenanceSchema),
    evaluation: KnowledgeQueryEvaluationSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.evaluation.matchedCount !== result.objects.length) {
      context.addIssue({
        code: "custom",
        message: "matchedCount must equal the number of returned objects",
        path: ["evaluation", "matchedCount"],
      });
    }

    if (result.provenance.length !== result.objects.length) {
      context.addIssue({
        code: "custom",
        message: "Every returned object must have one provenance entry",
        path: ["provenance"],
      });
    }

    const objectIds = result.objects.map((object) => object.metadata.id);
    if (new Set(objectIds).size !== objectIds.length) {
      context.addIssue({
        code: "custom",
        message: "Returned object IDs must be unique",
        path: ["objects"],
      });
    }

    const sortedObjectIds = [...objectIds].sort();
    if (sortedObjectIds.some((id, index) => id !== objectIds[index])) {
      context.addIssue({
        code: "custom",
        message: "Returned objects must be sorted by metadata.id",
        path: ["objects"],
      });
    }

    result.objects.forEach((object, index) => {
      const provenance = result.provenance[index];
      if (
        provenance === undefined ||
        provenance.objectId !== object.metadata.id ||
        !sourcesMatch(provenance.source, object.metadata.source)
      ) {
        context.addIssue({
          code: "custom",
          message: "Provenance must match the returned object's identity and source metadata",
          path: ["provenance", index],
        });
      }
    });
  });

export type KnowledgeQueryAppliedConstraint = z.infer<typeof KnowledgeQueryAppliedConstraintSchema>;
export type KnowledgeQueryEvaluation = z.infer<typeof KnowledgeQueryEvaluationSchema>;
export type KnowledgeQueryProvenance = z.infer<typeof KnowledgeQueryProvenanceSchema>;
export type KnowledgeQueryResult = z.infer<typeof KnowledgeQueryResultSchema>;
