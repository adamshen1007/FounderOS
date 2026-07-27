import { z } from "zod";

export const KnowledgeObjectTypeSchema = z.enum([
  "knowledge",
  "decision",
  "project",
  "research",
  "principle",
  "experiment",
  "relationship",
]);

export const KnowledgeStatusSchema = z.enum([
  "draft",
  "review",
  "active",
  "archived",
  "deprecated",
]);

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const ImportanceSchema = z.enum(["critical", "high", "medium", "low"]);
export const FreshnessSchema = z.enum(["current", "aging", "historical", "deprecated"]);

export const RelationshipTypeSchema = z.enum([
  "supports",
  "contradicts",
  "derived_from",
  "depends_on",
  "influences",
  "related_to",
  "created_by",
  "validated_by",
  "creates",
  "implemented_by",
]);

export const RelationshipStrengthSchema = z.enum(["high", "medium", "low"]);
export const RelationshipConfidenceSchema = z.enum(["validated", "high", "medium", "low"]);

export const ProjectStatusSchema = z.enum([
  "idea",
  "discovery",
  "validation",
  "building",
  "operating",
  "archived",
]);

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type Importance = z.infer<typeof ImportanceSchema>;
export type KnowledgeObjectType = z.infer<typeof KnowledgeObjectTypeSchema>;
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type RelationshipConfidence = z.infer<typeof RelationshipConfidenceSchema>;
export type RelationshipStrength = z.infer<typeof RelationshipStrengthSchema>;
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;
