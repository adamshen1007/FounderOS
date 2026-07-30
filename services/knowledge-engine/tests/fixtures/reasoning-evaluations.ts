const EVALUATION_CASES = [
  ["success-structured", "successful-execution"],
  ["success-empty", "successful-execution"],
  ["repeat-deterministic", "successful-execution"],
  ["restart-lookup", "successful-execution"],
  ["missing-transaction", "delivery-binding"],
  ["envelope-substitution", "delivery-binding"],
  ["receipt-substitution", "delivery-binding"],
  ["context-substitution", "delivery-binding"],
  ["consumer-substitution", "delivery-binding"],
  ["registry-substitution", "delivery-binding"],
  ["invocation-version", "capability"],
  ["delivery-version", "capability"],
  ["input-type", "capability"],
  ["input-budget", "capability"],
  ["output-budget", "capability"],
  ["timeout-range", "capability"],
  ["cancellation-mode", "capability"],
  ["retry-mode", "capability"],
  ["usage-capability", "capability"],
  ["cost-capability", "capability"],
  ["failure-capability", "capability"],
  ["first-ownership", "idempotency"],
  ["identical-finalized", "idempotency"],
  ["conflicting-key", "idempotency"],
  ["in-progress", "idempotency"],
  ["conflicting-finalization", "idempotency"],
  ["transient-success", "retry"],
  ["permanent-no-retry", "retry"],
  ["attempt-exhaustion", "retry"],
  ["identical-attempt", "retry"],
  ["conflicting-attempt", "retry"],
  ["timeout-no-retry", "timeout"],
  ["timeout-retry", "timeout"],
  ["timeout-contradiction", "timeout"],
  ["deadline-expired", "timeout"],
  ["cancel-before", "cancellation"],
  ["cancel-cooperative", "cancellation"],
  ["cancel-deadline", "cancellation"],
  ["cancel-contradiction", "cancellation"],
  ["output-mutation", "evidence-integrity"],
  ["usage-mutation", "evidence-integrity"],
  ["cost-mutation", "evidence-integrity"],
  ["failure-mutation", "evidence-integrity"],
  ["timeout-mutation", "evidence-integrity"],
  ["cancellation-mutation", "evidence-integrity"],
  ["receipt-mutation", "evidence-integrity"],
  ["result-mutation", "evidence-integrity"],
  ["consumption-mutation", "evidence-integrity"],
  ["resigned-substitution", "evidence-integrity"],
  ["network-free", "fake-provider-safety"],
  ["environment-free", "fake-provider-safety"],
  ["randomness-free", "fake-provider-safety"],
  ["wall-clock-free", "fake-provider-safety"],
  ["physical-path", "fake-provider-safety"],
  ["credential", "fake-provider-safety"],
  ["malformed", "fake-provider-safety"],
  ["contradictory", "fake-provider-safety"],
  ["raw-object", "no-provider-bypass"],
  ["query-result", "no-provider-bypass"],
  ["hidden-context", "no-provider-bypass"],
  ["provider-payload", "no-provider-bypass"],
  ["preconstructed-result", "no-provider-bypass"],
  ["low-level-finalization", "no-provider-bypass"],
] as const;

export type ReasoningEvaluationCategory = (typeof EVALUATION_CASES)[number][1];
export type ReasoningEvaluationScenarioId = (typeof EVALUATION_CASES)[number][0];

const RETAINED_MUTATION_TARGETS = {
  "invocation-version": "invocationRequestVersion",
  "delivery-version": "deliveryEnvelopeVersion",
  "input-type": "inputContentType",
  "input-budget": "inputCharacters",
  "output-budget": "maxOutputCharacters",
  "timeout-range": "timeoutMilliseconds",
  "cancellation-mode": "cancellationMode",
  "retry-mode": "retryMode",
  "usage-capability": "usageEvidenceRequired",
  "cost-capability": "costEvidenceRequired",
  "failure-capability": "failureEvidenceRequired",
  "timeout-contradiction": "providerOutcome.timeoutEvidence",
  "cancel-contradiction": "providerOutcome.cancellationEvidence",
  "network-free": "provider.source.network",
  "environment-free": "provider.source.environment",
  "randomness-free": "provider.source.randomness",
  "wall-clock-free": "provider.source.wallClock",
  "raw-object": "facade.rawKnowledgeObjects",
  "query-result": "facade.queryResult",
  "hidden-context": "facade.hiddenContext",
  "provider-payload": "facade.providerPayload",
  "preconstructed-result": "facade.preconstructedResult",
} as const satisfies Partial<Record<ReasoningEvaluationScenarioId, string>>;

type TargetedReasoningEvaluationScenarioId = keyof typeof RETAINED_MUTATION_TARGETS;
type ReasoningEvaluationMutation =
  | {
      readonly operation: TargetedReasoningEvaluationScenarioId;
      readonly target: string;
    }
  | {
      readonly operation: Exclude<
        ReasoningEvaluationScenarioId,
        TargetedReasoningEvaluationScenarioId
      >;
      readonly target?: never;
    };

export interface ReasoningEvaluationExpected {
  readonly disposition: "accept" | "reject" | "resolve";
  readonly errorCode: string | null;
  readonly status: string | null;
  readonly outcome: string | null;
  readonly reasonCodes: readonly string[];
  readonly attemptCount: number;
  readonly durable: boolean | "not-applicable";
  readonly fingerprintStatus: "invalid" | "not-applicable" | "valid";
  readonly attemptIdentity: "content-derived" | "none" | "stable-replay";
  readonly resultExpectation: "finalized" | "none" | "rejected";
  readonly evidenceExpectation: "none" | "rejected" | "sanitized" | "verified";
  readonly finalizationExpectation: "committed" | "conflict" | "none";
}

export interface ReasoningEvaluation {
  readonly scenarioId: ReasoningEvaluationScenarioId;
  readonly category: ReasoningEvaluationCategory;
  readonly setup: {
    readonly source: "canonical-artifacts" | "governed-runtime" | "provider-source";
  };
  readonly mutation: ReasoningEvaluationMutation;
  readonly expected: ReasoningEvaluationExpected;
}

const CAPABILITY_REASONS: Partial<Record<ReasoningEvaluationScenarioId, string>> = {
  "invocation-version": "invocation_version_unsupported",
  "delivery-version": "delivery_envelope_version_unsupported",
  "input-type": "input_content_type_unsupported",
  "input-budget": "input_budget_exceeded",
  "output-budget": "output_budget_exceeded",
  "timeout-range": "timeout_out_of_range",
  "cancellation-mode": "cancellation_mode_unsupported",
  "retry-mode": "retry_mode_unsupported",
  "usage-capability": "usage_evidence_unsupported",
  "cost-capability": "cost_evidence_unsupported",
  "failure-capability": "failure_evidence_unsupported",
};

function expectedFor(
  scenarioId: ReasoningEvaluationScenarioId,
  category: ReasoningEvaluationCategory,
): ReasoningEvaluationExpected {
  if (category === "successful-execution")
    return {
      disposition: "accept",
      errorCode: null,
      status: scenarioId === "repeat-deterministic" ? "identical-finalized" : "finalized",
      outcome: "succeeded",
      reasonCodes: [],
      attemptCount: 1,
      durable: true,
      fingerprintStatus: "valid",
      attemptIdentity: scenarioId === "repeat-deterministic" ? "stable-replay" : "content-derived",
      resultExpectation: "finalized",
      evidenceExpectation: "verified",
      finalizationExpectation: "committed",
    };
  if (category === "delivery-binding")
    return {
      disposition: "reject",
      errorCode: "delivery_integrity_failure",
      status: null,
      outcome: null,
      reasonCodes: [],
      attemptCount: 0,
      durable: true,
      fingerprintStatus: "not-applicable",
      attemptIdentity: "none",
      resultExpectation: "rejected",
      evidenceExpectation: "none",
      finalizationExpectation: "none",
    };
  if (category === "capability")
    return {
      disposition: "reject",
      errorCode: null,
      status: "incompatible",
      reasonCodes: [CAPABILITY_REASONS[scenarioId]!],
      outcome: null,
      attemptCount: 0,
      durable: "not-applicable",
      fingerprintStatus: "valid",
      attemptIdentity: "none",
      resultExpectation: "none",
      evidenceExpectation: "verified",
      finalizationExpectation: "none",
    };
  if (category === "idempotency")
    return {
      disposition: "resolve",
      errorCode: scenarioId === "conflicting-key" ? "idempotency_conflict" : null,
      status:
        scenarioId === "conflicting-key" || scenarioId === "conflicting-finalization"
          ? "conflict"
          : scenarioId === "in-progress"
            ? "identical-in-progress"
            : scenarioId === "identical-finalized"
              ? "identical-finalized"
              : "registered",
      attemptCount: scenarioId === "first-ownership" || scenarioId === "in-progress" ? 0 : 1,
      outcome:
        scenarioId === "first-ownership" || scenarioId === "in-progress" ? null : "succeeded",
      reasonCodes: [],
      durable: true,
      fingerprintStatus: "valid",
      attemptIdentity:
        scenarioId === "identical-finalized"
          ? "stable-replay"
          : scenarioId === "first-ownership" || scenarioId === "in-progress"
            ? "none"
            : "content-derived",
      resultExpectation:
        scenarioId === "first-ownership" || scenarioId === "in-progress" ? "none" : "finalized",
      evidenceExpectation: "verified",
      finalizationExpectation:
        scenarioId === "conflicting-finalization"
          ? "conflict"
          : scenarioId === "first-ownership" || scenarioId === "in-progress"
            ? "none"
            : "committed",
    };
  if (category === "retry")
    return {
      disposition: "resolve",
      errorCode: null,
      status:
        scenarioId === "identical-attempt" || scenarioId === "conflicting-attempt"
          ? "in-progress"
          : "finalized",
      outcome:
        scenarioId === "transient-success"
          ? "succeeded"
          : scenarioId === "permanent-no-retry" || scenarioId === "attempt-exhaustion"
            ? "failed"
            : null,
      reasonCodes:
        scenarioId === "attempt-exhaustion"
          ? ["attempt_limit_exhausted"]
          : scenarioId === "permanent-no-retry"
            ? ["permanent_provider_failure"]
            : [],
      attemptCount:
        scenarioId === "transient-success" || scenarioId === "attempt-exhaustion" ? 2 : 1,
      durable: true,
      fingerprintStatus: "valid",
      attemptIdentity: scenarioId === "identical-attempt" ? "stable-replay" : "content-derived",
      resultExpectation:
        scenarioId === "identical-attempt" || scenarioId === "conflicting-attempt"
          ? "none"
          : "finalized",
      evidenceExpectation: "verified",
      finalizationExpectation:
        scenarioId === "identical-attempt" || scenarioId === "conflicting-attempt"
          ? "none"
          : "committed",
    };
  if (category === "timeout") {
    if (scenarioId === "timeout-contradiction")
      return {
        disposition: "reject",
        errorCode: null,
        status: "invalid",
        outcome: null,
        reasonCodes: ["invalid_artifact"],
        attemptCount: 1,
        durable: "not-applicable",
        fingerprintStatus: "invalid",
        attemptIdentity: "content-derived",
        resultExpectation: "rejected",
        evidenceExpectation: "rejected",
        finalizationExpectation: "none",
      };
    return {
      disposition: "resolve",
      errorCode: null,
      status: "finalized",
      outcome: "timed-out",
      attemptCount: scenarioId === "timeout-retry" ? 2 : 1,
      reasonCodes: ["execution_deadline_reached"],
      durable: true,
      fingerprintStatus: "valid",
      attemptIdentity: "content-derived",
      resultExpectation: "finalized",
      evidenceExpectation: "verified",
      finalizationExpectation: "committed",
    };
  }
  if (category === "cancellation") {
    if (scenarioId === "cancel-contradiction")
      return {
        disposition: "reject",
        errorCode: null,
        status: "invalid",
        outcome: null,
        reasonCodes: ["invalid_artifact"],
        attemptCount: 1,
        durable: "not-applicable",
        fingerprintStatus: "invalid",
        attemptIdentity: "content-derived",
        resultExpectation: "rejected",
        evidenceExpectation: "rejected",
        finalizationExpectation: "none",
      };
    return {
      disposition: "resolve",
      errorCode: null,
      status: "finalized",
      outcome: "cancelled",
      attemptCount: 1,
      reasonCodes: [
        scenarioId === "cancel-before"
          ? "cancelled_before_execution"
          : scenarioId === "cancel-deadline"
            ? "cancelled_at_deadline"
            : "cancelled_cooperatively",
      ],
      durable: true,
      fingerprintStatus: "valid",
      attemptIdentity: "content-derived",
      resultExpectation: "finalized",
      evidenceExpectation: "verified",
      finalizationExpectation: "committed",
    };
  }
  if (category === "evidence-integrity")
    return {
      disposition: "reject",
      errorCode: null,
      status: "invalid",
      outcome: null,
      reasonCodes: ["fingerprint_mismatch"],
      fingerprintStatus: "invalid",
      durable: true,
      attemptCount: 1,
      attemptIdentity: "content-derived",
      resultExpectation: "finalized",
      evidenceExpectation: "rejected",
      finalizationExpectation: "committed",
    };
  if (category === "fake-provider-safety")
    return {
      disposition: "reject",
      errorCode: null,
      status: ["physical-path", "credential", "malformed", "contradictory"].includes(scenarioId)
        ? "finalized"
        : "safe",
      outcome: ["physical-path", "credential", "malformed", "contradictory"].includes(scenarioId)
        ? "failed"
        : null,
      reasonCodes:
        scenarioId === "physical-path"
          ? ["physical_path_rejected"]
          : scenarioId === "credential"
            ? ["credential_material_rejected"]
            : scenarioId === "malformed"
              ? ["malformed_success_outcome"]
              : scenarioId === "contradictory"
                ? ["invalid_provider_outcome"]
                : [],
      attemptCount: ["physical-path", "credential", "malformed", "contradictory"].includes(
        scenarioId,
      )
        ? 1
        : 0,
      durable: ["physical-path", "credential", "malformed", "contradictory"].includes(scenarioId)
        ? true
        : "not-applicable",
      fingerprintStatus: ["physical-path", "credential", "malformed", "contradictory"].includes(
        scenarioId,
      )
        ? "valid"
        : "not-applicable",
      attemptIdentity: ["physical-path", "credential", "malformed", "contradictory"].includes(
        scenarioId,
      )
        ? "content-derived"
        : "none",
      resultExpectation: ["physical-path", "credential", "malformed", "contradictory"].includes(
        scenarioId,
      )
        ? "finalized"
        : "none",
      evidenceExpectation: "sanitized",
      finalizationExpectation: [
        "physical-path",
        "credential",
        "malformed",
        "contradictory",
      ].includes(scenarioId)
        ? "committed"
        : "none",
    };
  if (scenarioId === "low-level-finalization")
    return {
      disposition: "reject",
      errorCode: null,
      status: "absent",
      outcome: null,
      reasonCodes: [],
      attemptCount: 0,
      durable: true,
      fingerprintStatus: "not-applicable",
      attemptIdentity: "none",
      resultExpectation: "rejected",
      evidenceExpectation: "none",
      finalizationExpectation: "none",
    };
  return {
    disposition: "reject",
    errorCode: "invalid_invocation",
    status: "invalid",
    outcome: null,
    reasonCodes: [],
    attemptCount: 0,
    durable: true,
    fingerprintStatus: "not-applicable",
    attemptIdentity: "none",
    resultExpectation: "rejected",
    evidenceExpectation: "none",
    finalizationExpectation: "none",
  };
}

function isTargetedScenario(
  scenarioId: ReasoningEvaluationScenarioId,
): scenarioId is TargetedReasoningEvaluationScenarioId {
  return scenarioId in RETAINED_MUTATION_TARGETS;
}

function mutationFor(scenarioId: ReasoningEvaluationScenarioId): ReasoningEvaluationMutation {
  return isTargetedScenario(scenarioId)
    ? { operation: scenarioId, target: RETAINED_MUTATION_TARGETS[scenarioId] }
    : { operation: scenarioId };
}

export const EXECUTABLE_REASONING_EVALUATIONS: readonly ReasoningEvaluation[] =
  EVALUATION_CASES.map(([scenarioId, category]) => ({
    scenarioId,
    category,
    setup: {
      source:
        category === "fake-provider-safety" &&
        ["network-free", "environment-free", "randomness-free", "wall-clock-free"].includes(
          scenarioId,
        )
          ? "provider-source"
          : category === "capability" || category === "evidence-integrity"
            ? "canonical-artifacts"
            : "governed-runtime",
    },
    mutation: mutationFor(scenarioId),
    expected: expectedFor(scenarioId, category),
  }));
