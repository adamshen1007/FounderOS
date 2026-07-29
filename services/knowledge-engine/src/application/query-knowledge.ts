import {
  KnowledgeObjectSchema,
  KnowledgeQueryResultSchema,
  KnowledgeQuerySchema,
  type KnowledgeObject,
  type KnowledgeQuery,
  type KnowledgeQueryAppliedConstraint,
  type KnowledgeQueryResult,
} from "@founderos/knowledge-schema";

import { DuplicateKnowledgeObjectIdError } from "../domain/knowledge-query.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function matchesValue(actual: string, expected: string[] | undefined): boolean {
  return expected === undefined || expected.includes(actual);
}

export function knowledgeObjectProjectReferences(object: KnowledgeObject): string[] {
  const references = [object.metadata.domain];

  if ("name" in object && object.metadata.objectType === "project") {
    references.push(object.metadata.id, object.name);
  }

  if ("relatedProjectIds" in object && object.metadata.objectType === "decision") {
    references.push(...object.relatedProjectIds);
  }

  return references;
}

function matchesProjects(object: KnowledgeObject, projects: string[] | undefined): boolean {
  return (
    projects === undefined ||
    projects.some((project) => knowledgeObjectProjectReferences(object).includes(project))
  );
}

function matchesTags(object: KnowledgeObject, query: KnowledgeQuery): boolean {
  const tags = query.filters.tags;
  if (tags === undefined) {
    return true;
  }

  return query.filters.tagMatch === "all"
    ? tags.every((tag) => object.metadata.tags.includes(tag))
    : tags.some((tag) => object.metadata.tags.includes(tag));
}

export type KnowledgeQueryMismatchReason =
  | "category_mismatch"
  | "domain_mismatch"
  | "object_type_mismatch"
  | "project_mismatch"
  | "source_reference_mismatch"
  | "source_type_mismatch"
  | "status_mismatch"
  | "tag_mismatch";

export interface KnowledgeQueryCandidateEvaluation {
  readonly filter: KnowledgeQueryAppliedConstraint | null;
  readonly matches: boolean;
  readonly reason: KnowledgeQueryMismatchReason | null;
}

export function evaluateKnowledgeQueryCandidate(
  object: KnowledgeObject,
  query: KnowledgeQuery,
): KnowledgeQueryCandidateEvaluation {
  const { constraints } = query.context;
  const { filters } = query;
  const checks: readonly [
    boolean,
    KnowledgeQueryAppliedConstraint,
    KnowledgeQueryMismatchReason,
  ][] = [
    [
      matchesValue(object.metadata.category ?? "", filters.categories),
      "filters.categories",
      "category_mismatch",
    ],
    [matchesValue(object.metadata.domain, filters.domains), "filters.domains", "domain_mismatch"],
    [
      matchesValue(object.metadata.objectType, filters.objectTypes),
      "filters.objectTypes",
      "object_type_mismatch",
    ],
    [matchesProjects(object, filters.projects), "filters.projects", "project_mismatch"],
    [
      matchesValue(object.metadata.source.sourceReference ?? "", filters.sourceReferences),
      "filters.sourceReferences",
      "source_reference_mismatch",
    ],
    [
      matchesValue(object.metadata.source.sourceType, filters.sourceTypes),
      "filters.sourceTypes",
      "source_type_mismatch",
    ],
    [matchesValue(object.metadata.status, filters.statuses), "filters.statuses", "status_mismatch"],
    [matchesTags(object, query), "filters.tags", "tag_mismatch"],
    [
      matchesValue(object.metadata.domain, constraints.domains),
      "context.domains",
      "domain_mismatch",
    ],
    [
      matchesValue(object.metadata.objectType, constraints.objectTypes),
      "context.objectTypes",
      "object_type_mismatch",
    ],
    [matchesProjects(object, constraints.projects), "context.projects", "project_mismatch"],
    [
      matchesValue(object.metadata.source.sourceType, constraints.sourceTypes),
      "context.sourceTypes",
      "source_type_mismatch",
    ],
  ];
  const mismatch = checks.find(([matches]) => !matches);
  return mismatch === undefined
    ? { filter: null, matches: true, reason: null }
    : { filter: mismatch[1], matches: false, reason: mismatch[2] };
}

export function knowledgeObjectMatchesQuery(
  object: KnowledgeObject,
  query: KnowledgeQuery,
): boolean {
  return evaluateKnowledgeQueryCandidate(object, query).matches;
}

function appliedConstraints(query: KnowledgeQuery): KnowledgeQueryAppliedConstraint[] {
  const applied: KnowledgeQueryAppliedConstraint[] = [];
  const contexts = query.context.constraints;
  const filters = query.filters;

  if (contexts.domains !== undefined) applied.push("context.domains");
  if (contexts.objectTypes !== undefined) applied.push("context.objectTypes");
  if (contexts.projects !== undefined) applied.push("context.projects");
  if (contexts.sourceTypes !== undefined) applied.push("context.sourceTypes");
  if (filters.categories !== undefined) applied.push("filters.categories");
  if (filters.domains !== undefined) applied.push("filters.domains");
  if (filters.objectTypes !== undefined) applied.push("filters.objectTypes");
  if (filters.projects !== undefined) applied.push("filters.projects");
  if (filters.sourceReferences !== undefined) applied.push("filters.sourceReferences");
  if (filters.sourceTypes !== undefined) applied.push("filters.sourceTypes");
  if (filters.statuses !== undefined) applied.push("filters.statuses");
  if (filters.tags !== undefined) applied.push("filters.tags");

  return applied.sort(compareStrings);
}

function parseCandidates(candidateInputs: readonly unknown[]): KnowledgeObject[] {
  const candidates = candidateInputs.map((candidate) => KnowledgeObjectSchema.parse(candidate));
  const ids = new Set<string>();

  for (const candidate of candidates) {
    if (ids.has(candidate.metadata.id)) {
      throw new DuplicateKnowledgeObjectIdError(candidate.metadata.id);
    }
    ids.add(candidate.metadata.id);
  }

  return candidates;
}

export function queryKnowledgeObjects(
  queryInput: unknown,
  candidateInputs: readonly unknown[],
): KnowledgeQueryResult {
  const query = KnowledgeQuerySchema.parse(queryInput);
  const candidates = parseCandidates(candidateInputs);
  const objects = candidates
    .filter((candidate) => knowledgeObjectMatchesQuery(candidate, query))
    .sort((left, right) => compareStrings(left.metadata.id, right.metadata.id));

  return KnowledgeQueryResultSchema.parse({
    schemaVersion: "1.0",
    query,
    objects,
    provenance: objects.map((object) => ({
      objectId: object.metadata.id,
      source: object.metadata.source,
    })),
    evaluation: {
      confidence: "deterministic",
      candidateCount: candidates.length,
      matchedCount: objects.length,
      appliedConstraints: appliedConstraints(query),
    },
  });
}

export function serializeKnowledgeQueryResult(result: KnowledgeQueryResult): string {
  return `${JSON.stringify(KnowledgeQueryResultSchema.parse(result), null, 2)}\n`;
}
