import { z } from "zod";

import {
  ProjectStatusSchema,
  RelationshipConfidenceSchema,
  RelationshipStrengthSchema,
  RelationshipTypeSchema,
} from "./enums.js";
import { KnowledgeMetadataShape, SourceMetadataSchema, validateMetadataDates } from "./metadata.js";
import { IdentifierSchema, IsoTemporalSchema, NonEmptyStringSchema } from "./primitives.js";

function metadataSchemaFor<T extends keyof typeof objectTypeLiterals>(objectType: T) {
  return z
    .object({
      ...KnowledgeMetadataShape,
      objectType: objectTypeLiterals[objectType],
    })
    .strict()
    .superRefine(validateMetadataDates);
}

const objectTypeLiterals = {
  knowledge: z.literal("knowledge"),
  decision: z.literal("decision"),
  project: z.literal("project"),
  research: z.literal("research"),
  principle: z.literal("principle"),
  experiment: z.literal("experiment"),
  relationship: z.literal("relationship"),
} as const;

export const GeneralKnowledgeObjectSchema = z
  .object({
    metadata: metadataSchemaFor("knowledge"),
    content: NonEmptyStringSchema,
  })
  .strict();

export const DecisionObjectSchema = z
  .object({
    metadata: metadataSchemaFor("decision"),
    context: NonEmptyStringSchema,
    problem: NonEmptyStringSchema,
    options: z.array(NonEmptyStringSchema).min(2),
    chosenOption: NonEmptyStringSchema,
    reasoning: NonEmptyStringSchema,
    expectedOutcome: NonEmptyStringSchema,
    risks: z.array(NonEmptyStringSchema).default([]),
    relatedProjectIds: z.array(IdentifierSchema).default([]),
    reviewDate: IsoTemporalSchema,
    result: NonEmptyStringSchema.optional(),
    lessonsLearned: z.array(NonEmptyStringSchema).default([]),
  })
  .strict()
  .superRefine((decision, context) => {
    if (!decision.options.includes(decision.chosenOption)) {
      context.addIssue({
        code: "custom",
        message: "chosenOption must match one of the documented options",
        path: ["chosenOption"],
      });
    }
  });

export const ProjectObjectSchema = z
  .object({
    metadata: metadataSchemaFor("project"),
    name: NonEmptyStringSchema,
    vision: NonEmptyStringSchema,
    mission: NonEmptyStringSchema.optional(),
    objectives: z.array(NonEmptyStringSchema).min(1),
    projectStatus: ProjectStatusSchema,
    architecture: z.array(NonEmptyStringSchema).default([]),
    decisionIds: z.array(IdentifierSchema).default([]),
    risks: z.array(NonEmptyStringSchema).default([]),
    milestones: z.array(NonEmptyStringSchema).min(1),
    team: z.array(NonEmptyStringSchema).default([]),
    relatedKnowledgeIds: z.array(IdentifierSchema).default([]),
  })
  .strict();

export const ResearchObjectSchema = z
  .object({
    metadata: metadataSchemaFor("research"),
    question: NonEmptyStringSchema,
    sources: z.array(SourceMetadataSchema).min(1),
    findings: z.array(NonEmptyStringSchema).min(1),
    insights: z.array(NonEmptyStringSchema).default([]),
    implications: z.array(NonEmptyStringSchema).default([]),
    relatedDecisionIds: z.array(IdentifierSchema).default([]),
  })
  .strict();

export const PrincipleObjectSchema = z
  .object({
    metadata: metadataSchemaFor("principle"),
    name: NonEmptyStringSchema,
    statement: NonEmptyStringSchema,
    reasoning: NonEmptyStringSchema,
    examples: z.array(NonEmptyStringSchema).default([]),
    exceptions: z.array(NonEmptyStringSchema).default([]),
    createdFromIds: z.array(IdentifierSchema).default([]),
  })
  .strict();

export const ExperimentMetricSchema = z
  .object({
    name: NonEmptyStringSchema,
    target: NonEmptyStringSchema.optional(),
    actual: NonEmptyStringSchema.optional(),
  })
  .strict();

export const ExperimentObjectSchema = z
  .object({
    metadata: metadataSchemaFor("experiment"),
    hypothesis: NonEmptyStringSchema,
    objective: NonEmptyStringSchema,
    method: NonEmptyStringSchema,
    metrics: z.array(ExperimentMetricSchema).min(1),
    result: NonEmptyStringSchema.optional(),
    learning: NonEmptyStringSchema.optional(),
    nextAction: NonEmptyStringSchema.optional(),
  })
  .strict();

export const RelationshipObjectSchema = z
  .object({
    metadata: metadataSchemaFor("relationship"),
    sourceObjectId: IdentifierSchema,
    targetObjectId: IdentifierSchema,
    relationshipType: RelationshipTypeSchema,
    strength: RelationshipStrengthSchema,
    relationshipConfidence: RelationshipConfidenceSchema,
    evidenceSource: SourceMetadataSchema.optional(),
  })
  .strict()
  .superRefine((relationship, context) => {
    if (relationship.sourceObjectId === relationship.targetObjectId) {
      context.addIssue({
        code: "custom",
        message: "A relationship must connect two different objects",
        path: ["targetObjectId"],
      });
    }
  });

export const KnowledgeObjectSchema = z.union([
  GeneralKnowledgeObjectSchema,
  DecisionObjectSchema,
  ProjectObjectSchema,
  ResearchObjectSchema,
  PrincipleObjectSchema,
  ExperimentObjectSchema,
  RelationshipObjectSchema,
]);

export type DecisionObject = z.infer<typeof DecisionObjectSchema>;
export type ExperimentMetric = z.infer<typeof ExperimentMetricSchema>;
export type ExperimentObject = z.infer<typeof ExperimentObjectSchema>;
export type GeneralKnowledgeObject = z.infer<typeof GeneralKnowledgeObjectSchema>;
export type KnowledgeObject = z.infer<typeof KnowledgeObjectSchema>;
export type PrincipleObject = z.infer<typeof PrincipleObjectSchema>;
export type ProjectObject = z.infer<typeof ProjectObjectSchema>;
export type RelationshipObject = z.infer<typeof RelationshipObjectSchema>;
export type ResearchObject = z.infer<typeof ResearchObjectSchema>;
