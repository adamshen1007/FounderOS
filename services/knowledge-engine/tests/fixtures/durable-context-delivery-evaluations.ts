import type { DurableReplayAttemptRecord } from "@founderos/knowledge-schema";

export interface DurableContextDeliveryEvaluationFixture {
  readonly scenarioId: string;
  readonly category:
    | "original-delivery"
    | "idempotency"
    | "replay"
    | "crash-safety"
    | "integrity"
    | "derived-state"
    | "filesystem-safety";
  readonly expectedStatus: "accepted" | "rejected" | "recovered" | "failed";
  readonly expectedReplayOutcome: DurableReplayAttemptRecord["outcome"] | null;
  readonly expectedReasonCode: DurableReplayAttemptRecord["reasonCodes"][number] | null;
}

export const DURABLE_CONTEXT_DELIVERY_EVALUATIONS: readonly DurableContextDeliveryEvaluationFixture[] =
  [
    {
      scenarioId: "original-first-commit",
      category: "original-delivery",
      expectedStatus: "accepted",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "original-restart-lookup",
      category: "original-delivery",
      expectedStatus: "recovered",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "transaction-identical-retry",
      category: "idempotency",
      expectedStatus: "accepted",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "transaction-conflicting-reuse",
      category: "idempotency",
      expectedStatus: "rejected",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "idempotency-conflict-after-restart",
      category: "idempotency",
      expectedStatus: "rejected",
      expectedReplayOutcome: "rejected-idempotency-conflict",
      expectedReasonCode: "idempotency_key_conflict",
    },
    {
      scenarioId: "single-delivery-after-restart",
      category: "replay",
      expectedStatus: "rejected",
      expectedReplayOutcome: "rejected-single-delivery",
      expectedReasonCode: "single_delivery_replay_rejected",
    },
    {
      scenarioId: "repeatable-identical-after-restart",
      category: "replay",
      expectedStatus: "accepted",
      expectedReplayOutcome: "accepted-original-result",
      expectedReasonCode: "original_result_replayed",
    },
    {
      scenarioId: "repeatable-expired-reservation",
      category: "replay",
      expectedStatus: "rejected",
      expectedReplayOutcome: "rejected-expired",
      expectedReasonCode: "delivery_expired",
    },
    {
      scenarioId: "evaluation-only-replay",
      category: "replay",
      expectedStatus: "accepted",
      expectedReplayOutcome: "evaluation-only",
      expectedReasonCode: "evaluation_only",
    },
    {
      scenarioId: "current-policy-denial",
      category: "replay",
      expectedStatus: "rejected",
      expectedReplayOutcome: "rejected-policy",
      expectedReasonCode: "policy_denied",
    },
    {
      scenarioId: "new-active-snapshot-freshness-denial",
      category: "replay",
      expectedStatus: "rejected",
      expectedReplayOutcome: "rejected-freshness",
      expectedReasonCode: "newer_active_snapshot",
    },
    {
      scenarioId: "failure-before-commit-head",
      category: "crash-safety",
      expectedStatus: "failed",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "failure-after-commit-head",
      category: "crash-safety",
      expectedStatus: "recovered",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "abandoned-staging-data",
      category: "crash-safety",
      expectedStatus: "recovered",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "authoritative-artifact-tampering",
      category: "integrity",
      expectedStatus: "failed",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "missing-transaction-member",
      category: "integrity",
      expectedStatus: "failed",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "derived-index-missing",
      category: "derived-state",
      expectedStatus: "recovered",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "derived-index-corrupt-rebuild",
      category: "derived-state",
      expectedStatus: "recovered",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "lexical-traversal",
      category: "filesystem-safety",
      expectedStatus: "rejected",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "symlink-escape",
      category: "filesystem-safety",
      expectedStatus: "rejected",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "runtime-source-overlap",
      category: "filesystem-safety",
      expectedStatus: "rejected",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
    {
      scenarioId: "resource-limit-preflight",
      category: "filesystem-safety",
      expectedStatus: "rejected",
      expectedReplayOutcome: null,
      expectedReasonCode: null,
    },
  ] as const;
