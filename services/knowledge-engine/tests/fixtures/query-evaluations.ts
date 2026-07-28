import type { KnowledgeQuery } from "@founderos/knowledge-schema";

export interface KnowledgeQueryEvaluationFixture {
  expectedObjectIds: string[];
  name: string;
  query: KnowledgeQuery;
}

const baseContext = {
  consumerId: "milestone-05-evaluation",
  consumerType: "service" as const,
  constraints: {},
};

export const PRIORITY_ONE_QUERY_EVALUATIONS: KnowledgeQueryEvaluationFixture[] = [
  {
    name: "architecture corpus",
    query: {
      schemaVersion: "1.0",
      queryId: "evaluation-architecture",
      context: baseContext,
      filters: {
        categories: ["architecture"],
        objectTypes: ["knowledge"],
        projects: ["FounderOS"],
        statuses: ["active"],
        tagMatch: "all",
        tags: ["architecture"],
      },
    },
    expectedObjectIds: [
      "founderos-data-architecture-v1",
      "founderos-mcp-architecture-v1",
      "founderos-repository-architecture-v1",
      "founderos-security-governance-architecture-v1",
      "founderos-system-architecture-v1",
    ],
  },
  {
    name: "governance corpus",
    query: {
      schemaVersion: "1.0",
      queryId: "evaluation-governance",
      context: {
        ...baseContext,
        constraints: { sourceTypes: ["official_specification"] },
      },
      filters: {
        categories: ["governance"],
        tagMatch: "all",
        tags: ["FounderOS", "governance"],
      },
    },
    expectedObjectIds: [
      "founderos-constitution-v1",
      "founderos-decision-framework-v1",
      "founderos-design-principles-v1",
    ],
  },
  {
    name: "empty corpus query",
    query: {
      schemaVersion: "1.0",
      queryId: "evaluation-empty",
      context: baseContext,
      filters: { tagMatch: "all", tags: ["not-in-priority-one"] },
    },
    expectedObjectIds: [],
  },
];
