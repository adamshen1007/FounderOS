import type { KnowledgeContextRequest } from "@founderos/knowledge-schema";

export interface KnowledgeContextEvaluationFixture {
  readonly expectedIncludedIds: readonly string[];
  readonly name: string;
  readonly request: KnowledgeContextRequest;
}

function request(
  requestId: string,
  filters: KnowledgeContextRequest["query"]["filters"],
  requiredObjectIds: readonly string[] = [],
): KnowledgeContextRequest {
  return {
    schemaVersion: "1.0",
    requestId,
    purpose: "Evaluate governed Priority 1 context assembly",
    consumer: { consumerId: "milestone-10-evaluation", consumerType: "service" },
    query: {
      schemaVersion: "1.0",
      queryId: `query-${requestId}`,
      context: {
        consumerId: "milestone-10-evaluation",
        consumerType: "service",
        constraints: { sourceTypes: ["official_specification"] },
      },
      filters,
    },
    requiredObjectIds: [...requiredObjectIds],
    requiredObjectTypes: [],
    preferredObjectTypes: [],
    scope: { domains: ["FounderOS"] },
    assemblyPolicyVersion: "1.0",
    budget: {
      maxObjectCount: 8,
      maxCanonicalCharacters: 1_000_000,
      allowTruncation: false,
      requiredObjectFailureBehavior: "fail",
      emptyContextBehavior: "fail",
    },
    reason: "Prove deterministic selection over the approved Priority 1 corpus",
  };
}

export const PRIORITY_ONE_CONTEXT_EVALUATIONS: readonly KnowledgeContextEvaluationFixture[] = [
  {
    name: "governance context",
    request: request("evaluation-governance-context", {
      categories: ["governance"],
      tagMatch: "all",
      tags: ["FounderOS", "governance"],
    }),
    expectedIncludedIds: [
      "founderos-constitution-v1",
      "founderos-decision-framework-v1",
      "founderos-design-principles-v1",
    ],
  },
  {
    name: "architecture context",
    request: request("evaluation-architecture-context", {
      categories: ["architecture"],
      objectTypes: ["knowledge"],
      statuses: ["active"],
      tagMatch: "all",
      tags: ["architecture"],
    }),
    expectedIncludedIds: [
      "founderos-data-architecture-v1",
      "founderos-mcp-architecture-v1",
      "founderos-repository-architecture-v1",
      "founderos-security-governance-architecture-v1",
      "founderos-system-architecture-v1",
    ],
  },
  {
    name: "decision-focused context",
    request: request("evaluation-decision-context", { tagMatch: "all", tags: ["decisions"] }, [
      "founderos-decision-framework-v1",
    ]),
    expectedIncludedIds: ["founderos-decision-framework-v1"],
  },
];

export interface KnowledgeContextBehaviorEvaluationFixture {
  readonly bindingMutation?: "active_mismatch" | "corrupt_integrity" | "forged_repository";
  readonly budgetMode?:
    | "exact_character"
    | "exact_object"
    | "omit_optional"
    | "optional_per_object_over"
    | "optional_total_over"
    | "required_over"
    | "truncate";
  readonly candidateMutation?: "conflicting_duplicate" | "equivalent_duplicate" | "reverse";
  readonly expected: {
    readonly includedIds?: readonly string[];
    readonly issueCode?: string;
    readonly omittedReason?: string;
    readonly status: "assembled" | "insufficient_context" | "invalid";
    readonly truncated?: boolean;
  };
  readonly name: string;
  readonly packageMutation?: "content" | "omission" | "timestamp";
  readonly requestMode:
    | "all"
    | "architecture"
    | "decision"
    | "empty_allow"
    | "empty_fail"
    | "governance"
    | "missing_id"
    | "missing_type";
}

/**
 * The complete Milestone 10 behavior matrix. The focused domain and contract
 * tests exercise these cases with synthetic variants of the same approved
 * Priority 1 identities; the three fixtures above execute the canonical corpus.
 */
export const MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS: readonly KnowledgeContextBehaviorEvaluationFixture[] =
  [
    {
      name: "governance context",
      requestMode: "governance",
      expected: {
        status: "assembled",
        includedIds: PRIORITY_ONE_CONTEXT_EVALUATIONS[0]!.expectedIncludedIds,
      },
    },
    {
      name: "architecture context",
      requestMode: "architecture",
      expected: {
        status: "assembled",
        includedIds: PRIORITY_ONE_CONTEXT_EVALUATIONS[1]!.expectedIncludedIds,
      },
    },
    {
      name: "decision-focused context",
      requestMode: "decision",
      expected: {
        status: "assembled",
        includedIds: PRIORITY_ONE_CONTEXT_EVALUATIONS[2]!.expectedIncludedIds,
      },
    },
    {
      name: "empty matching set allowed",
      requestMode: "empty_allow",
      expected: { status: "assembled", includedIds: [] },
    },
    {
      name: "empty matching set disallowed",
      requestMode: "empty_fail",
      expected: { status: "insufficient_context", issueCode: "empty_context_disallowed" },
    },
    {
      name: "missing required object",
      requestMode: "missing_id",
      expected: { status: "insufficient_context", issueCode: "missing_required_object" },
    },
    {
      name: "missing required type",
      requestMode: "missing_type",
      expected: { status: "insufficient_context", issueCode: "missing_required_type" },
    },
    {
      name: "equivalent duplicate",
      requestMode: "all",
      candidateMutation: "equivalent_duplicate",
      expected: { status: "assembled", omittedReason: "equivalent_duplicate" },
    },
    {
      name: "conflicting duplicate",
      requestMode: "all",
      candidateMutation: "conflicting_duplicate",
      expected: { status: "insufficient_context", issueCode: "conflicting_duplicate" },
    },
    {
      name: "exact object boundary",
      requestMode: "all",
      budgetMode: "exact_object",
      expected: { status: "assembled" },
    },
    {
      name: "exact character boundary",
      requestMode: "all",
      budgetMode: "exact_character",
      expected: { status: "assembled" },
    },
    {
      name: "optional total over budget",
      requestMode: "all",
      budgetMode: "optional_total_over",
      expected: { status: "insufficient_context", issueCode: "context_over_budget" },
    },
    {
      name: "optional per-object over budget",
      requestMode: "all",
      budgetMode: "optional_per_object_over",
      expected: { status: "insufficient_context", issueCode: "context_over_budget" },
    },
    {
      name: "required over budget",
      requestMode: "all",
      budgetMode: "required_over",
      expected: { status: "insufficient_context", issueCode: "required_object_over_budget" },
    },
    {
      name: "over budget with truncation",
      requestMode: "all",
      budgetMode: "truncate",
      expected: { status: "assembled", truncated: true },
    },
    {
      name: "active snapshot mismatch",
      requestMode: "all",
      bindingMutation: "active_mismatch",
      expected: { status: "insufficient_context", issueCode: "active_snapshot_mismatch" },
    },
    {
      name: "corrupt registry integrity",
      requestMode: "all",
      bindingMutation: "corrupt_integrity",
      expected: { status: "insufficient_context", issueCode: "registry_integrity_invalid" },
    },
    {
      name: "forged repository binding",
      requestMode: "all",
      bindingMutation: "forged_repository",
      expected: { status: "insufficient_context", issueCode: "repository_content_mismatch" },
    },
    {
      name: "candidate permutation",
      requestMode: "all",
      candidateMutation: "reverse",
      expected: { status: "assembled" },
    },
    {
      name: "included content tampering",
      requestMode: "all",
      packageMutation: "content",
      expected: { status: "invalid" },
    },
    {
      name: "omission evidence tampering",
      requestMode: "all",
      budgetMode: "omit_optional",
      packageMutation: "omission",
      expected: { status: "invalid" },
    },
    {
      name: "timestamp tampering",
      requestMode: "all",
      packageMutation: "timestamp",
      expected: { status: "invalid" },
    },
  ];
