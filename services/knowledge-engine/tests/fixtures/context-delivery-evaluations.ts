import type { ContextDeliveryIssue, ContextDeliveryStatus } from "@founderos/knowledge-schema";

export interface ContextDeliveryEvaluationFixture {
  readonly category:
    "bypass" | "capability" | "consumer" | "freshness" | "integrity" | "policy" | "replay";
  readonly expectedReason?: ContextDeliveryIssue["code"];
  readonly expectedStatus: "delivered" | ContextDeliveryStatus;
  readonly expectedArtifacts: {
    readonly envelopeFingerprint: boolean;
    readonly receiptFingerprint: boolean;
    readonly replayEvidence: boolean;
    readonly stableReplay: boolean;
  };
  readonly name: string;
}

/** Approved deterministic Milestone 11 behavior matrix. */
const MILESTONE_11_CONTEXT_DELIVERY_EVALUATION_BASE: readonly Omit<
  ContextDeliveryEvaluationFixture,
  "expectedArtifacts"
>[] = [
  { name: "valid internal service Consumer", category: "consumer", expectedStatus: "delivered" },
  { name: "valid future reasoning Consumer", category: "consumer", expectedStatus: "delivered" },
  {
    name: "valid evaluation-harness Consumer",
    category: "consumer",
    expectedStatus: "delivered",
  },
  {
    name: "unsupported Context Package version",
    category: "capability",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  {
    name: "unsupported assembly policy version",
    category: "capability",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  {
    name: "object-count capability mismatch",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "character-count capability mismatch",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "truncated package rejected",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "empty package rejected",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "provenance requirement mismatch",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "receipt capability mismatch",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  {
    name: "replay capability mismatch",
    category: "capability",
    expectedStatus: "capability-mismatch",
    expectedReason: "consumer_capability_mismatch",
  },
  { name: "policy allowed", category: "policy", expectedStatus: "delivered" },
  {
    name: "policy denied",
    category: "policy",
    expectedStatus: "policy-denied",
    expectedReason: "policy_denied",
  },
  {
    name: "policy review required",
    category: "policy",
    expectedStatus: "policy-denied",
    expectedReason: "policy_review_required",
  },
  {
    name: "policy not evaluated",
    category: "policy",
    expectedStatus: "policy-denied",
    expectedReason: "policy_not_evaluated",
  },
  {
    name: "missing policy evidence",
    category: "policy",
    expectedStatus: "policy-denied",
    expectedReason: "policy_evidence_invalid",
  },
  {
    name: "expired policy evidence",
    category: "policy",
    expectedStatus: "expired",
    expectedReason: "policy_evidence_expired",
  },
  {
    name: "request not yet valid",
    category: "freshness",
    expectedStatus: "expired",
    expectedReason: "request_not_yet_valid",
  },
  {
    name: "expired delivery request",
    category: "freshness",
    expectedStatus: "expired",
    expectedReason: "request_expired",
  },
  {
    name: "maximum package age exceeded",
    category: "freshness",
    expectedStatus: "expired",
    expectedReason: "maximum_age_exceeded",
  },
  {
    name: "new Active Snapshot invalidates delivery",
    category: "freshness",
    expectedStatus: "expired",
    expectedReason: "newer_active_snapshot",
  },
  {
    name: "historical replay explicitly allowed",
    category: "freshness",
    expectedStatus: "delivered",
  },
  {
    name: "historical replay denied",
    category: "freshness",
    expectedStatus: "expired",
    expectedReason: "historical_replay_not_allowed",
  },
  { name: "identical idempotent replay", category: "replay", expectedStatus: "delivered" },
  {
    name: "conflicting idempotency-key reuse",
    category: "replay",
    expectedStatus: "duplicate",
    expectedReason: "idempotency_key_conflict",
  },
  {
    name: "single-use replay rejection",
    category: "replay",
    expectedStatus: "duplicate",
    expectedReason: "single_delivery_replay_rejected",
  },
  {
    name: "repeatable-until-expiration success",
    category: "replay",
    expectedStatus: "delivered",
  },
  { name: "evaluation-only replay", category: "replay", expectedStatus: "delivered" },
  {
    name: "Context Package tampering",
    category: "integrity",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  {
    name: "Consumer Descriptor tampering",
    category: "integrity",
    expectedStatus: "integrity-failure",
    expectedReason: "invalid_delivery_request",
  },
  {
    name: "Delivery Request tampering",
    category: "integrity",
    expectedStatus: "integrity-failure",
    expectedReason: "invalid_delivery_request",
  },
  {
    name: "Policy evidence tampering",
    category: "integrity",
    expectedStatus: "policy-denied",
    expectedReason: "policy_evidence_invalid",
  },
  {
    name: "Delivery Envelope tampering",
    category: "integrity",
    expectedStatus: "integrity-failure",
  },
  { name: "Receipt tampering", category: "integrity", expectedStatus: "integrity-failure" },
  {
    name: "raw Knowledge Object bypass attempt",
    category: "bypass",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  {
    name: "full Query Result bypass attempt",
    category: "bypass",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  {
    name: "hidden context injection attempt",
    category: "bypass",
    expectedStatus: "integrity-failure",
    expectedReason: "context_package_integrity_failure",
  },
  { name: "physical-path privacy", category: "bypass", expectedStatus: "integrity-failure" },
  { name: "stable reason ordering", category: "integrity", expectedStatus: "delivered" },
];

const REPLAY_EVIDENCE_CASES = new Set([
  "identical idempotent replay",
  "repeatable-until-expiration success",
  "evaluation-only replay",
]);

export const MILESTONE_11_CONTEXT_DELIVERY_EVALUATIONS: readonly ContextDeliveryEvaluationFixture[] =
  MILESTONE_11_CONTEXT_DELIVERY_EVALUATION_BASE.map((entry) => ({
    ...entry,
    expectedArtifacts: {
      envelopeFingerprint: entry.expectedStatus === "delivered",
      receiptFingerprint: entry.expectedStatus === "delivered",
      replayEvidence: REPLAY_EVIDENCE_CASES.has(entry.name),
      stableReplay: REPLAY_EVIDENCE_CASES.has(entry.name),
    },
  }));
