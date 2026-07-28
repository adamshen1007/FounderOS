import { z } from "zod";

import { KnowledgeObjectTypeSchema, KnowledgeStatusSchema } from "./enums.js";
import { IdentifierSchema, NonEmptyStringSchema } from "./primitives.js";

function uniqueArray<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, "Query values must be unique");
}

export const KnowledgeQueryConsumerTypeSchema = z.enum(["human", "agent", "service"]);
export const KnowledgeQueryTagMatchSchema = z.enum(["all", "any"]);

export const KnowledgeQueryContextConstraintsSchema = z
  .object({
    domains: uniqueArray(NonEmptyStringSchema).optional(),
    objectTypes: uniqueArray(KnowledgeObjectTypeSchema).optional(),
    projects: uniqueArray(IdentifierSchema).optional(),
    sourceTypes: uniqueArray(NonEmptyStringSchema).optional(),
  })
  .strict();

export const KnowledgeQueryContextSchema = z
  .object({
    consumerId: IdentifierSchema,
    consumerType: KnowledgeQueryConsumerTypeSchema,
    purpose: NonEmptyStringSchema.optional(),
    constraints: KnowledgeQueryContextConstraintsSchema.default({}),
  })
  .strict();

export const KnowledgeQueryFiltersSchema = z
  .object({
    categories: uniqueArray(NonEmptyStringSchema).optional(),
    domains: uniqueArray(NonEmptyStringSchema).optional(),
    objectTypes: uniqueArray(KnowledgeObjectTypeSchema).optional(),
    projects: uniqueArray(IdentifierSchema).optional(),
    sourceReferences: uniqueArray(NonEmptyStringSchema).optional(),
    sourceTypes: uniqueArray(NonEmptyStringSchema).optional(),
    statuses: uniqueArray(KnowledgeStatusSchema).optional(),
    tagMatch: KnowledgeQueryTagMatchSchema.default("all"),
    tags: uniqueArray(NonEmptyStringSchema).optional(),
  })
  .strict();

export const KnowledgeQuerySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    queryId: IdentifierSchema,
    context: KnowledgeQueryContextSchema,
    filters: KnowledgeQueryFiltersSchema.default({ tagMatch: "all" }),
  })
  .strict();

export type KnowledgeQuery = z.infer<typeof KnowledgeQuerySchema>;
export type KnowledgeQueryConsumerType = z.infer<typeof KnowledgeQueryConsumerTypeSchema>;
export type KnowledgeQueryContext = z.infer<typeof KnowledgeQueryContextSchema>;
export type KnowledgeQueryContextConstraints = z.infer<
  typeof KnowledgeQueryContextConstraintsSchema
>;
export type KnowledgeQueryFilters = z.infer<typeof KnowledgeQueryFiltersSchema>;
export type KnowledgeQueryTagMatch = z.infer<typeof KnowledgeQueryTagMatchSchema>;
