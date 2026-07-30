import {
  FinalizedReasoningConsumptionEvidenceSchema,
  ProviderNeutralReasoningInputSchema,
  ReasoningArtifactVerificationResultSchema,
  ReasoningCancellationEvidenceSchema,
  ReasoningConstraintBlockSchema,
  ReasoningCostEvidenceSchema,
  ReasoningExecutionAttemptSchema,
  ReasoningExecutionPolicySchema,
  ReasoningExecutionReceiptSchema,
  ReasoningFailureEvidenceSchema,
  ReasoningInstructionBlockSchema,
  ReasoningInvocationRequestSchema,
  ReasoningProviderCapabilityDescriptorSchema,
  ReasoningProviderCapabilityRequirementsSchema,
  ReasoningProviderCompatibilityResultSchema,
  ReasoningProviderOutcomeSchema,
  ReasoningResultEnvelopeSchema,
  ReasoningTimeoutEvidenceSchema,
  ReasoningUsageEvidenceSchema,
  findDurableCanonicalJsonIssue,
  type FinalizedReasoningConsumptionEvidence,
  type DurableCanonicalJsonValue,
  type ProviderNeutralReasoningInput,
  type ReasoningArtifactVerificationResult,
  type ReasoningCancellationEvidence,
  type ReasoningConstraintBlock,
  type ReasoningCostEvidence,
  type ReasoningExecutionAttempt,
  type ReasoningExecutionPolicy,
  type ReasoningExecutionReceipt,
  type ReasoningFailureEvidence,
  type ReasoningInstructionBlock,
  type ReasoningInvocationRequest,
  type ReasoningProviderCapabilityDescriptor,
  type ReasoningProviderCapabilityRequirements,
  type ReasoningProviderCompatibilityResult,
  type ReasoningProviderOutcome,
  type ReasoningResultEnvelope,
  type ReasoningTimeoutEvidence,
  type ReasoningUsageEvidence,
} from "@founderos/knowledge-schema";

import {
  createDurableCanonicalJsonSha256Fingerprint,
  serializeDurableCanonicalJsonValue,
} from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

type CanonicalRecord = Readonly<Record<string, unknown>>;
type VerificationArtifact = Parameters<typeof ReasoningArtifactVerificationResultSchema.parse>[0];
type Schema<T> = { parse(input: unknown): T };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class ReasoningIntegrityError extends Error {
  public constructor(
    public readonly code:
      | "binding_mismatch"
      | "budget_exceeded"
      | "capability_mismatch"
      | "fingerprint_mismatch"
      | "invalid_artifact"
      | "unsafe_content",
    message: string,
  ) {
    super(message);
    this.name = "ReasoningIntegrityError";
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function without(value: CanonicalRecord, field: string): CanonicalRecord {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function captureCanonical(value: unknown, label: string): CanonicalRecord {
  if (findDurableCanonicalJsonIssue(value) !== null || value === null || Array.isArray(value)) {
    throw new ReasoningIntegrityError(
      "invalid_artifact",
      `${label} must contain only accessor-free canonical data`,
    );
  }
  return immutableCopy(value as CanonicalRecord);
}

function signed<T>(schema: Schema<T>, unsignedInput: unknown, fingerprintField: string): T {
  const unsigned = captureCanonical(unsignedInput, "Reasoning artifact");
  return immutableCopy(
    schema.parse({
      ...unsigned,
      [fingerprintField]: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

function verifySigned<T>(
  artifactType: ReasoningArtifactVerificationResult["artifactType"],
  schema: Schema<T>,
  raw: unknown,
  fingerprintField: string,
): ReasoningArtifactVerificationResult {
  try {
    const canonical = captureCanonical(raw, artifactType);
    const parsed = schema.parse(canonical) as T & CanonicalRecord;
    const stored = parsed[fingerprintField];
    const expected = createDurableCanonicalJsonSha256Fingerprint(without(parsed, fingerprintField));
    if (stored !== expected) {
      return invalidVerification(artifactType, "fingerprint_mismatch", fingerprintField);
    }
    return ReasoningArtifactVerificationResultSchema.parse({
      schemaVersion: "1.0",
      artifactType,
      status: "valid",
      fingerprint: stored,
      issues: [],
    });
  } catch (error) {
    const code =
      error instanceof ReasoningIntegrityError ? "noncanonical_value" : "invalid_artifact";
    return invalidVerification(artifactType, code, "artifact");
  }
}

function invalidVerification(
  artifactType: ReasoningArtifactVerificationResult["artifactType"],
  code: "budget_exceeded" | "fingerprint_mismatch" | "invalid_artifact" | "noncanonical_value",
  path: string,
): ReasoningArtifactVerificationResult {
  return ReasoningArtifactVerificationResultSchema.parse({
    schemaVersion: "1.0",
    artifactType,
    status: "invalid",
    fingerprint: null,
    issues: [{ code, path, message: "Reasoning artifact verification failed" }],
  } satisfies VerificationArtifact);
}

export function countCanonicalCharacters(value: unknown): number {
  return [...serializeDurableCanonicalJsonValue(value)].length;
}

export type ReasoningInstructionBlockInput = Omit<ReasoningInstructionBlock, "blockFingerprint">;
export function createReasoningInstructionBlock(
  input: ReasoningInstructionBlockInput,
): ReasoningInstructionBlock {
  return signed(ReasoningInstructionBlockSchema, input, "blockFingerprint");
}

export type ReasoningConstraintBlockInput = Omit<ReasoningConstraintBlock, "constraintFingerprint">;
export function createReasoningConstraintBlock(
  input: ReasoningConstraintBlockInput,
): ReasoningConstraintBlock {
  return signed(ReasoningConstraintBlockSchema, input, "constraintFingerprint");
}

export type ProviderNeutralReasoningInputInput = Omit<
  ProviderNeutralReasoningInput,
  "inputFingerprint"
>;
export function createProviderNeutralReasoningInput(
  input: ProviderNeutralReasoningInputInput,
): ProviderNeutralReasoningInput {
  for (const block of input.instructionBlocks) {
    if (
      verifySigned("reasoning-input", ReasoningInstructionBlockSchema, block, "blockFingerprint")
        .status !== "valid"
    )
      throw new ReasoningIntegrityError(
        "fingerprint_mismatch",
        "Instruction Block does not verify",
      );
  }
  for (const block of input.constraintBlocks) {
    if (
      verifySigned(
        "reasoning-input",
        ReasoningConstraintBlockSchema,
        block,
        "constraintFingerprint",
      ).status !== "valid"
    )
      throw new ReasoningIntegrityError("fingerprint_mismatch", "Constraint Block does not verify");
  }
  return signed(ProviderNeutralReasoningInputSchema, input, "inputFingerprint");
}

export type ReasoningExecutionPolicyInput = Omit<ReasoningExecutionPolicy, "policyFingerprint">;
export function createReasoningExecutionPolicy(
  input: ReasoningExecutionPolicyInput,
): ReasoningExecutionPolicy {
  return signed(ReasoningExecutionPolicySchema, input, "policyFingerprint");
}

export type ReasoningProviderCapabilityRequirementsInput = Omit<
  ReasoningProviderCapabilityRequirements,
  "requirementsFingerprint"
>;
export function createReasoningProviderCapabilityRequirements(
  input: ReasoningProviderCapabilityRequirementsInput,
): ReasoningProviderCapabilityRequirements {
  return signed(ReasoningProviderCapabilityRequirementsSchema, input, "requirementsFingerprint");
}

export type ReasoningProviderCapabilityDescriptorInput = Omit<
  ReasoningProviderCapabilityDescriptor,
  "descriptorFingerprint"
>;
export function createReasoningProviderCapabilityDescriptor(
  input: ReasoningProviderCapabilityDescriptorInput,
): ReasoningProviderCapabilityDescriptor {
  return signed(ReasoningProviderCapabilityDescriptorSchema, input, "descriptorFingerprint");
}

export function verifyProviderNeutralReasoningInput(raw: unknown) {
  return verifySigned(
    "reasoning-input",
    ProviderNeutralReasoningInputSchema,
    raw,
    "inputFingerprint",
  );
}
export function verifyReasoningExecutionPolicy(raw: unknown) {
  return verifySigned("execution-policy", ReasoningExecutionPolicySchema, raw, "policyFingerprint");
}
export function verifyReasoningProviderCapabilityDescriptor(raw: unknown) {
  return verifySigned(
    "provider-capability-descriptor",
    ReasoningProviderCapabilityDescriptorSchema,
    raw,
    "descriptorFingerprint",
  );
}

const REASON_FIELD = {
  cancellation_mode_unsupported: "cancellationMode",
  cost_evidence_unsupported: "costEvidenceRequired",
  delivery_envelope_version_unsupported: "deliveryEnvelopeVersion",
  deterministic_mode_unsupported: "deterministicModeRequired",
  failure_evidence_unsupported: "failureEvidenceRequired",
  input_budget_exceeded: "inputCharacters",
  input_content_type_unsupported: "inputContentType",
  invocation_version_unsupported: "invocationRequestVersion",
  output_budget_exceeded: "maxOutputCharacters",
  output_content_type_unsupported: "outputContentType",
  provider_class_unsupported: "providerClass",
  result_envelope_version_unsupported: "resultEnvelopeVersion",
  retry_mode_unsupported: "retryMode",
  timeout_out_of_range: "timeoutMilliseconds",
  usage_evidence_unsupported: "usageEvidenceRequired",
} as const;

type MismatchReason = keyof typeof REASON_FIELD;

export function matchReasoningProviderCapabilities(input: {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
}): ReasoningProviderCompatibilityResult {
  const request = ReasoningInvocationRequestSchema.parse(
    captureCanonical(input.invocationRequest, "Invocation Request"),
  );
  const provider = ReasoningProviderCapabilityDescriptorSchema.parse(
    captureCanonical(input.providerCapability, "Provider Capability"),
  );
  if (verifyReasoningInvocationRequest(request).status !== "valid")
    throw new ReasoningIntegrityError("fingerprint_mismatch", "Invocation Request does not verify");
  if (verifyReasoningProviderCapabilityDescriptor(provider).status !== "valid")
    throw new ReasoningIntegrityError(
      "fingerprint_mismatch",
      "Provider Capability does not verify",
    );

  const policy = request.executionPolicy;
  const requirements = request.capabilityRequirements;
  const reasons: MismatchReason[] = [];
  const add = (condition: boolean, reason: MismatchReason) => {
    if (condition) reasons.push(reason);
  };
  const inputCharacters = countCanonicalCharacters(request.reasoningInput);
  add(
    !provider.acceptedInvocationRequestVersions.includes(request.schemaVersion),
    "invocation_version_unsupported",
  );
  add(
    !provider.acceptedDeliveryEnvelopeVersions.includes(request.deliveryEnvelopeVersion),
    "delivery_envelope_version_unsupported",
  );
  add(
    !provider.acceptedInputContentTypes.includes(request.reasoningInput.contentType),
    "input_content_type_unsupported",
  );
  add(
    inputCharacters > provider.maxInputCharacters || inputCharacters > policy.maxInputCharacters,
    "input_budget_exceeded",
  );
  add(policy.maxOutputCharacters > provider.maxOutputCharacters, "output_budget_exceeded");
  add(
    !provider.acceptedOutputContentTypes.includes(
      request.reasoningInput.outputRequirements.contentType,
    ),
    "output_content_type_unsupported",
  );
  add(
    !requirements.acceptedProviderClasses.includes(provider.providerClass),
    "provider_class_unsupported",
  );
  add(
    policy.timeoutMilliseconds < provider.minTimeoutMilliseconds ||
      policy.timeoutMilliseconds > provider.maxTimeoutMilliseconds,
    "timeout_out_of_range",
  );
  add(
    !provider.supportedCancellationModes.includes(policy.cancellationMode),
    "cancellation_mode_unsupported",
  );
  add(!provider.supportedRetryModes.includes(policy.retryMode), "retry_mode_unsupported");
  add(
    requirements.deterministicModeRequired && !provider.supportsDeterministicExecution,
    "deterministic_mode_unsupported",
  );
  add(
    requirements.usageEvidenceRequired && !provider.supportsUsageEvidence,
    "usage_evidence_unsupported",
  );
  add(
    requirements.costEvidenceRequired && !provider.supportsCostEvidence,
    "cost_evidence_unsupported",
  );
  add(
    requirements.failureEvidenceRequired && !provider.supportsFailureEvidence,
    "failure_evidence_unsupported",
  );
  add(
    !provider.supportedResultEnvelopeVersions.includes(requirements.resultEnvelopeVersion),
    "result_envelope_version_unsupported",
  );
  const orderedReasons = [...new Set(reasons)].sort();
  const unsigned = {
    schemaVersion: "1.0" as const,
    status: orderedReasons.length === 0 ? ("compatible" as const) : ("incompatible" as const),
    reasonCodes: orderedReasons.length === 0 ? (["compatible"] as const) : orderedReasons,
    mismatchedFields:
      orderedReasons.length === 0
        ? []
        : [...new Set(orderedReasons.map((reason) => REASON_FIELD[reason]))].sort(),
    invocationRequestFingerprint: request.requestFingerprint,
    reasoningInputFingerprint: request.reasoningInput.inputFingerprint,
    executionPolicyFingerprint: policy.policyFingerprint,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
  };
  return signed(ReasoningProviderCompatibilityResultSchema, unsigned, "compatibilityFingerprint");
}

export function verifyReasoningProviderCompatibilityResult(input: {
  readonly compatibility: unknown;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
}): ReasoningArtifactVerificationResult {
  let wrapper: CanonicalRecord;
  try {
    wrapper = captureCanonical(input, "Compatibility verification input");
  } catch {
    return invalidVerification("compatibility-result", "invalid_artifact", "compatibility");
  }
  const basic = verifySigned(
    "compatibility-result",
    ReasoningProviderCompatibilityResultSchema,
    wrapper.compatibility,
    "compatibilityFingerprint",
  );
  if (basic.status !== "valid") return basic;
  try {
    const invocationRequest = ReasoningInvocationRequestSchema.parse(wrapper.invocationRequest);
    const providerCapability = ReasoningProviderCapabilityDescriptorSchema.parse(
      wrapper.providerCapability,
    );
    const expected = matchReasoningProviderCapabilities({
      invocationRequest,
      providerCapability,
    });
    const actual = captureCanonical(wrapper.compatibility, "Compatibility Result");
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      return invalidVerification("compatibility-result", "fingerprint_mismatch", "compatibility");
    return basic;
  } catch {
    return invalidVerification("compatibility-result", "invalid_artifact", "compatibility");
  }
}

export type ReasoningInvocationRequestInput = Omit<
  ReasoningInvocationRequest,
  "requestFingerprint"
>;
export function createReasoningInvocationRequest(
  input: ReasoningInvocationRequestInput,
): ReasoningInvocationRequest {
  if (
    verifyProviderNeutralReasoningInput(input.reasoningInput).status !== "valid" ||
    verifyReasoningExecutionPolicy(input.executionPolicy).status !== "valid"
  )
    throw new ReasoningIntegrityError(
      "fingerprint_mismatch",
      "Invocation nested artifacts do not verify",
    );
  const requirements = verifySigned(
    "invocation-request",
    ReasoningProviderCapabilityRequirementsSchema,
    input.capabilityRequirements,
    "requirementsFingerprint",
  );
  if (requirements.status !== "valid")
    throw new ReasoningIntegrityError(
      "fingerprint_mismatch",
      "Capability Requirements do not verify",
    );
  return signed(ReasoningInvocationRequestSchema, input, "requestFingerprint");
}

export function verifyReasoningInvocationRequest(raw: unknown) {
  const basic = verifySigned(
    "invocation-request",
    ReasoningInvocationRequestSchema,
    raw,
    "requestFingerprint",
  );
  if (basic.status !== "valid") return basic;
  const request = raw as ReasoningInvocationRequest;
  if (
    verifyProviderNeutralReasoningInput(request.reasoningInput).status !== "valid" ||
    verifyReasoningExecutionPolicy(request.executionPolicy).status !== "valid" ||
    verifySigned(
      "invocation-request",
      ReasoningProviderCapabilityRequirementsSchema,
      request.capabilityRequirements,
      "requirementsFingerprint",
    ).status !== "valid"
  )
    return invalidVerification("invocation-request", "fingerprint_mismatch", "nested-artifact");
  return basic;
}

export type ReasoningExecutionAttemptInput = Omit<ReasoningExecutionAttempt, "attemptFingerprint">;
export function createReasoningExecutionAttempt(input: ReasoningExecutionAttemptInput) {
  return signed(ReasoningExecutionAttemptSchema, input, "attemptFingerprint");
}
export function verifyReasoningExecutionAttempt(raw: unknown) {
  return verifySigned(
    "execution-attempt",
    ReasoningExecutionAttemptSchema,
    raw,
    "attemptFingerprint",
  );
}

export type ReasoningFailureEvidenceInput = Omit<ReasoningFailureEvidence, "failureFingerprint">;
export function createReasoningFailureEvidence(input: ReasoningFailureEvidenceInput) {
  return signed(ReasoningFailureEvidenceSchema, input, "failureFingerprint");
}
export function verifyReasoningFailureEvidence(raw: unknown) {
  return verifySigned(
    "failure-evidence",
    ReasoningFailureEvidenceSchema,
    raw,
    "failureFingerprint",
  );
}
export type ReasoningTimeoutEvidenceInput = Omit<ReasoningTimeoutEvidence, "timeoutFingerprint">;
export function createReasoningTimeoutEvidence(input: ReasoningTimeoutEvidenceInput) {
  return signed(ReasoningTimeoutEvidenceSchema, input, "timeoutFingerprint");
}
export function verifyReasoningTimeoutEvidence(raw: unknown) {
  return verifySigned(
    "timeout-evidence",
    ReasoningTimeoutEvidenceSchema,
    raw,
    "timeoutFingerprint",
  );
}
export type ReasoningCancellationEvidenceInput = Omit<
  ReasoningCancellationEvidence,
  "cancellationFingerprint"
>;
export function createReasoningCancellationEvidence(input: ReasoningCancellationEvidenceInput) {
  return signed(ReasoningCancellationEvidenceSchema, input, "cancellationFingerprint");
}
export function verifyReasoningCancellationEvidence(raw: unknown) {
  return verifySigned(
    "cancellation-evidence",
    ReasoningCancellationEvidenceSchema,
    raw,
    "cancellationFingerprint",
  );
}
export type ReasoningExecutionReceiptInput = Omit<ReasoningExecutionReceipt, "receiptFingerprint">;
export function createReasoningExecutionReceipt(input: ReasoningExecutionReceiptInput) {
  return signed(ReasoningExecutionReceiptSchema, input, "receiptFingerprint");
}
export function verifyReasoningExecutionReceipt(raw: unknown) {
  return verifySigned(
    "execution-receipt",
    ReasoningExecutionReceiptSchema,
    raw,
    "receiptFingerprint",
  );
}
export type ReasoningUsageEvidenceInput = Omit<ReasoningUsageEvidence, "usageFingerprint">;
export function createReasoningUsageEvidence(input: ReasoningUsageEvidenceInput) {
  return signed(ReasoningUsageEvidenceSchema, input, "usageFingerprint");
}
export function verifyReasoningUsageEvidence(raw: unknown) {
  return verifySigned("usage-evidence", ReasoningUsageEvidenceSchema, raw, "usageFingerprint");
}
export type ReasoningCostEvidenceInput = Omit<ReasoningCostEvidence, "costFingerprint">;
export function createReasoningCostEvidence(input: ReasoningCostEvidenceInput) {
  return signed(ReasoningCostEvidenceSchema, input, "costFingerprint");
}
export function verifyReasoningCostEvidence(raw: unknown) {
  return verifySigned("cost-evidence", ReasoningCostEvidenceSchema, raw, "costFingerprint");
}

export type ReasoningProviderOutcomeInput = DistributiveOmit<
  ReasoningProviderOutcome,
  "outcomeFingerprint"
>;
export function createReasoningProviderOutcome(input: ReasoningProviderOutcomeInput) {
  if ("outputContentFingerprint" in input) {
    const expected = createDurableCanonicalJsonSha256Fingerprint(input.outputContent);
    if (input.outputContentFingerprint !== expected)
      throw new ReasoningIntegrityError(
        "fingerprint_mismatch",
        "Provider output fingerprint does not verify",
      );
  }
  return signed(ReasoningProviderOutcomeSchema, input, "outcomeFingerprint");
}
export function verifyReasoningProviderOutcome(raw: unknown) {
  const basic = verifySigned(
    "provider-outcome",
    ReasoningProviderOutcomeSchema,
    raw,
    "outcomeFingerprint",
  );
  if (basic.status !== "valid") return basic;
  const outcome = raw as ReasoningProviderOutcome;
  if (outcome.status === "succeeded") {
    if (
      outcome.outputContentFingerprint !==
      createDurableCanonicalJsonSha256Fingerprint(outcome.outputContent)
    )
      return invalidVerification(
        "provider-outcome",
        "fingerprint_mismatch",
        "outputContentFingerprint",
      );
  } else {
    const verification =
      outcome.status === "failed"
        ? verifyReasoningFailureEvidence(outcome.failureEvidence)
        : outcome.status === "timed-out"
          ? verifyReasoningTimeoutEvidence(outcome.timeoutEvidence)
          : verifyReasoningCancellationEvidence(outcome.cancellationEvidence);
    if (verification.status !== "valid")
      return invalidVerification("provider-outcome", "fingerprint_mismatch", "terminal-evidence");
  }
  return basic;
}

export function isReasoningRetryTransitionAuthorized(
  outcome: ReasoningProviderOutcome,
  policy: ReasoningExecutionPolicy,
  completedAttemptCount: number,
): boolean {
  if (
    completedAttemptCount >= policy.maxAttemptCount ||
    outcome.status === "succeeded" ||
    outcome.status === "cancelled" ||
    policy.retryMode === "no-retry"
  )
    return false;
  if (policy.retryMode === "evaluation-only-retry")
    return outcome.status === "failed" || outcome.status === "timed-out";
  if (policy.retryMode === "retry-until-attempt-limit")
    return outcome.status === "failed" || outcome.status === "timed-out";
  return outcome.status === "failed" && outcome.failureEvidence.retryable;
}

export function verifyReasoningAttemptLifecycle(input: {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly attempts: readonly ReasoningExecutionAttempt[];
  readonly outcomes: readonly ReasoningProviderOutcome[];
}): boolean {
  const { invocationRequest: request, providerCapability: provider, attempts, outcomes } = input;
  if (
    attempts.length === 0 ||
    attempts.length > request.executionPolicy.maxAttemptCount ||
    outcomes.length > attempts.length ||
    outcomes.length < attempts.length - 1
  )
    return false;
  for (const [index, attempt] of attempts.entries()) {
    const deadlineAt = attempt.deadlineAt;
    const started = Date.parse(attempt.startedAt);
    const deadline = deadlineAt === undefined ? Number.NaN : Date.parse(deadlineAt);
    const priorOutcome = index === 0 ? undefined : outcomes[index - 1];
    const expectedCancellationState = {
      "not-cancellable": "not-requested",
      "cancel-before-execution": "requested-before-execution",
      "cooperative-cancellation": "requested-cooperatively",
      "deadline-cancellation": "requested-at-deadline",
    } as const;
    if (
      verifyReasoningExecutionAttempt(attempt).status !== "valid" ||
      attempt.attemptNumber !== index + 1 ||
      attempt.invocationRequestId !== request.invocationRequestId ||
      attempt.invocationRequestFingerprint !== request.requestFingerprint ||
      attempt.invocationIdempotencyKey !== request.idempotencyKey ||
      attempt.providerCapabilityId !== provider.providerCapabilityId ||
      attempt.providerCapabilityFingerprint !== provider.descriptorFingerprint ||
      attempt.executionPolicyFingerprint !== request.executionPolicy.policyFingerprint ||
      deadlineAt === undefined ||
      deadline - started !== request.executionPolicy.timeoutMilliseconds ||
      (attempt.cancellationState !== "not-requested" &&
        attempt.cancellationState !==
          expectedCancellationState[request.executionPolicy.cancellationMode]) ||
      (index === 0
        ? started < Date.parse(request.requestedAt)
        : priorOutcome === undefined || started < Date.parse(priorOutcome.completedAt)) ||
      (index === 0
        ? attempt.previousExecutionAttemptId !== undefined
        : attempt.previousExecutionAttemptId !== attempts[index - 1]!.executionAttemptId)
    )
      return false;
    if (attempt.cancellationState !== "not-requested") {
      const requested = Date.parse(attempt.cancellationRequestedAt!);
      const observed = Date.parse(attempt.cancellationObservedAt!);
      const cancellationPhaseIsValid =
        attempt.cancellationState === "requested-before-execution"
          ? requested <= observed && observed <= started
          : attempt.cancellationState === "requested-cooperatively"
            ? requested >= started && requested <= observed
            : requested === deadline && observed >= deadline;
      if (!cancellationPhaseIsValid) return false;
    }
    const outcome = outcomes[index];
    if (
      outcome !== undefined &&
      (verifyReasoningProviderOutcome(outcome).status !== "valid" ||
        outcome.executionAttemptId !== attempt.executionAttemptId ||
        outcome.invocationRequestId !== request.invocationRequestId ||
        outcome.attemptNumber !== attempt.attemptNumber)
    )
      return false;
    if (outcome !== undefined) {
      const completed = Date.parse(outcome.completedAt);
      if (completed < started) return false;
      if (outcome.status === "succeeded" || outcome.status === "failed") {
        if (completed >= deadline || attempt.cancellationState !== "not-requested") return false;
      } else if (outcome.status === "timed-out") {
        const evidence = outcome.timeoutEvidence;
        if (
          completed < deadline ||
          (attempt.cancellationState !== "not-requested" &&
            attempt.cancellationState !== "requested-cooperatively") ||
          (attempt.cancellationState === "requested-cooperatively" &&
            (Date.parse(attempt.cancellationObservedAt!) < deadline ||
              Date.parse(attempt.cancellationObservedAt!) > completed)) ||
          evidence.configuredTimeoutMilliseconds !== request.executionPolicy.timeoutMilliseconds ||
          evidence.attemptStartedAt !== attempt.startedAt ||
          evidence.deadlineAt !== deadlineAt ||
          evidence.elapsedMilliseconds !== completed - started ||
          evidence.timeoutPhase !== "during-execution" ||
          evidence.reasonCode !== "execution_deadline_reached"
        )
          return false;
      } else {
        const evidence = outcome.cancellationEvidence;
        const state = attempt.cancellationState;
        const observed = Date.parse(evidence.observedAt);
        const exactCancellationBinding =
          state !== "not-requested" &&
          evidence.cancellationMode === request.executionPolicy.cancellationMode &&
          evidence.cancellationAuthorityReference === attempt.cancellationAuthorityReference &&
          evidence.requestedAt === attempt.cancellationRequestedAt &&
          evidence.observedAt === attempt.cancellationObservedAt &&
          observed <= completed;
        const phaseTiming =
          state === "requested-before-execution"
            ? true
            : state === "requested-cooperatively"
              ? observed < deadline
              : state === "requested-at-deadline"
                ? completed >= deadline
                : false;
        if (!exactCancellationBinding || !phaseTiming) return false;
      }
    }
    if (
      index > 0 &&
      !isReasoningRetryTransitionAuthorized(outcomes[index - 1]!, request.executionPolicy, index)
    )
      return false;
  }
  return true;
}

export type ReasoningResultEnvelopeInput = DistributiveOmit<
  ReasoningResultEnvelope,
  "resultEnvelopeFingerprint"
>;
export function createReasoningResultEnvelope(input: ReasoningResultEnvelopeInput) {
  if (
    verifyReasoningExecutionReceipt(input.executionReceipt).status !== "valid" ||
    verifyReasoningUsageEvidence(input.usageEvidence).status !== "valid" ||
    verifyReasoningCostEvidence(input.costEvidence).status !== "valid"
  )
    throw new ReasoningIntegrityError(
      "fingerprint_mismatch",
      "Result operational evidence does not verify",
    );
  if (input.outcome === "succeeded") {
    if (input.outputCharacterCount !== countOutputCharacters(input.outputContent))
      throw new ReasoningIntegrityError(
        "budget_exceeded",
        "Result output character evidence is invalid",
      );
    if (
      input.outputContentFingerprint !==
      createDurableCanonicalJsonSha256Fingerprint(input.outputContent)
    )
      throw new ReasoningIntegrityError(
        "fingerprint_mismatch",
        "Result output fingerprint does not verify",
      );
  }
  return signed(ReasoningResultEnvelopeSchema, input, "resultEnvelopeFingerprint");
}

export function verifyReasoningResultEnvelopeArtifact(raw: unknown) {
  const basic = verifySigned(
    "result-envelope",
    ReasoningResultEnvelopeSchema,
    raw,
    "resultEnvelopeFingerprint",
  );
  if (basic.status !== "valid") return basic;
  const result = raw as ReasoningResultEnvelope;
  if (
    verifyReasoningExecutionReceipt(result.executionReceipt).status !== "valid" ||
    verifyReasoningUsageEvidence(result.usageEvidence).status !== "valid" ||
    verifyReasoningCostEvidence(result.costEvidence).status !== "valid"
  )
    return invalidVerification("result-envelope", "fingerprint_mismatch", "operational-evidence");
  if (result.outcome === "succeeded") {
    if (
      result.outputCharacterCount !== countOutputCharacters(result.outputContent) ||
      result.outputContentFingerprint !==
        createDurableCanonicalJsonSha256Fingerprint(result.outputContent)
    )
      return invalidVerification("result-envelope", "fingerprint_mismatch", "outputContent");
  } else {
    const verification =
      result.outcome === "failed"
        ? verifyReasoningFailureEvidence(result.failureEvidence)
        : result.outcome === "timed-out"
          ? verifyReasoningTimeoutEvidence(result.timeoutEvidence)
          : verifyReasoningCancellationEvidence(result.cancellationEvidence);
    if (verification.status !== "valid")
      return invalidVerification("result-envelope", "fingerprint_mismatch", "terminal-evidence");
  }
  return basic;
}

export function countOutputCharacters(
  output:
    | { readonly contentType: "canonical-text"; readonly text: string }
    | { readonly contentType: "canonical-json"; readonly value: DurableCanonicalJsonValue },
): number {
  return output.contentType === "canonical-text"
    ? [...output.text].length
    : [...serializeDurableCanonicalJsonValue(output.value)].length;
}

export function verifyReasoningResultEnvelope(input: {
  readonly resultEnvelope: unknown;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly attempt: ReasoningExecutionAttempt;
  readonly attemptHistory: readonly ReasoningExecutionAttempt[];
  readonly providerOutcome: ReasoningProviderOutcome;
  readonly outcomeHistory: readonly ReasoningProviderOutcome[];
  readonly contextPackageObjectCount: number;
}): ReasoningArtifactVerificationResult {
  let wrapper: CanonicalRecord;
  try {
    wrapper = captureCanonical(input, "Result verification input");
  } catch {
    return invalidVerification("result-envelope", "invalid_artifact", "binding");
  }
  const basic = verifySigned(
    "result-envelope",
    ReasoningResultEnvelopeSchema,
    wrapper.resultEnvelope,
    "resultEnvelopeFingerprint",
  );
  if (basic.status !== "valid") return basic;
  try {
    const result = ReasoningResultEnvelopeSchema.parse(wrapper.resultEnvelope);
    const request = ReasoningInvocationRequestSchema.parse(wrapper.invocationRequest);
    const provider = ReasoningProviderCapabilityDescriptorSchema.parse(wrapper.providerCapability);
    const attempt = ReasoningExecutionAttemptSchema.parse(wrapper.attempt);
    if (!Array.isArray(wrapper.attemptHistory)) throw new Error("Attempt history must be an array");
    const attemptHistory = wrapper.attemptHistory.map((entry) =>
      ReasoningExecutionAttemptSchema.parse(entry),
    );
    const outcome = ReasoningProviderOutcomeSchema.parse(wrapper.providerOutcome);
    if (!Array.isArray(wrapper.outcomeHistory)) throw new Error("Outcome history must be an array");
    const outcomeHistory = wrapper.outcomeHistory.map((entry) =>
      ReasoningProviderOutcomeSchema.parse(entry),
    );
    const contextPackageObjectCount = wrapper.contextPackageObjectCount;
    if (!Number.isSafeInteger(contextPackageObjectCount) || Number(contextPackageObjectCount) < 0)
      throw new Error("context object count is invalid");
    const orderedHistoryVerifies =
      outcomeHistory.length === attemptHistory.length &&
      verifyReasoningAttemptLifecycle({
        invocationRequest: request,
        providerCapability: provider,
        attempts: attemptHistory,
        outcomes: outcomeHistory,
      }) &&
      serializeDurableCanonicalJsonValue(attemptHistory.at(-1)!) ===
        serializeDurableCanonicalJsonValue(attempt) &&
      serializeDurableCanonicalJsonValue(outcomeHistory.at(-1)!) ===
        serializeDurableCanonicalJsonValue(outcome);
    const contextualArtifactsVerify =
      verifyReasoningInvocationRequest(request).status === "valid" &&
      verifyReasoningProviderCapabilityDescriptor(provider).status === "valid" &&
      verifyReasoningExecutionAttempt(attempt).status === "valid" &&
      orderedHistoryVerifies;
    const deliveryMatches =
      result.deliveryTransactionId === request.deliveryTransactionId &&
      result.deliveryEnvelopeId === request.deliveryEnvelopeId &&
      result.deliveryEnvelopeFingerprint === request.deliveryEnvelopeFingerprint &&
      result.deliveryReceiptId === request.deliveryReceiptId &&
      result.deliveryReceiptFingerprint === request.deliveryReceiptFingerprint &&
      result.contextPackageId === request.contextPackageId &&
      result.contextPackageFingerprint === request.contextPackageFingerprint &&
      result.consumerId === request.consumerId &&
      result.consumerDescriptorFingerprint === request.consumerDescriptorFingerprint;
    const executionMatches =
      result.invocationRequestId === request.invocationRequestId &&
      result.invocationRequestFingerprint === request.requestFingerprint &&
      result.invocationIdempotencyKey === request.idempotencyKey &&
      result.executionPolicyFingerprint === request.executionPolicy.policyFingerprint &&
      result.providerCapabilityId === provider.providerCapabilityId &&
      result.providerCapabilityFingerprint === provider.descriptorFingerprint &&
      result.executionAttemptId === attempt.executionAttemptId &&
      result.attemptNumber === attempt.attemptNumber &&
      attempt.invocationRequestId === request.invocationRequestId &&
      attempt.invocationRequestFingerprint === request.requestFingerprint &&
      attempt.invocationIdempotencyKey === request.idempotencyKey &&
      attempt.providerCapabilityId === provider.providerCapabilityId &&
      attempt.providerCapabilityFingerprint === provider.descriptorFingerprint &&
      attempt.executionPolicyFingerprint === request.executionPolicy.policyFingerprint &&
      (attempt.attemptNumber === 1) === (attempt.previousExecutionAttemptId === undefined) &&
      outcome.invocationRequestId === request.invocationRequestId &&
      outcome.executionAttemptId === attempt.executionAttemptId &&
      outcome.attemptNumber === attempt.attemptNumber &&
      result.outcome === outcome.status &&
      result.completedAt === outcome.completedAt;
    if (
      !contextualArtifactsVerify ||
      !deliveryMatches ||
      !executionMatches ||
      verifyReasoningProviderOutcome(outcome).status !== "valid"
    )
      return invalidVerification("result-envelope", "fingerprint_mismatch", "binding");
    const expectedReceiptUnsigned = {
      schemaVersion: "1.0" as const,
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      providerCapabilityId: provider.providerCapabilityId,
      providerCapabilityFingerprint: provider.descriptorFingerprint,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      completedAt: outcome.completedAt,
      outcome: outcome.status,
    };
    const expectedReceipt = createReasoningExecutionReceipt(expectedReceiptUnsigned);
    const outputCharacterCount =
      outcome.status === "succeeded" ? countOutputCharacters(outcome.outputContent) : 0;
    const expectedUsage = createReasoningUsageEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      inputCharacterCount: countCanonicalCharacters(request.reasoningInput),
      outputCharacterCount,
      instructionBlockCount: request.reasoningInput.instructionBlocks.length,
      contextPackageObjectCount: Number(contextPackageObjectCount),
      attemptNumber: attempt.attemptNumber,
      durationMilliseconds: Date.parse(outcome.completedAt) - Date.parse(attempt.startedAt),
    });
    const expectedCost =
      provider.providerClass === "deterministic-fake-provider"
        ? createReasoningCostEvidence({
            schemaVersion: "1.0",
            executionAttemptId: attempt.executionAttemptId,
            status: "not-applicable",
          })
        : result.costEvidence;
    if (
      verifyReasoningExecutionReceipt(result.executionReceipt).status !== "valid" ||
      verifyReasoningUsageEvidence(result.usageEvidence).status !== "valid" ||
      verifyReasoningCostEvidence(result.costEvidence).status !== "valid" ||
      serializeDurableCanonicalJsonValue(result.executionReceipt) !==
        serializeDurableCanonicalJsonValue(expectedReceipt) ||
      serializeDurableCanonicalJsonValue(result.usageEvidence) !==
        serializeDurableCanonicalJsonValue(expectedUsage) ||
      serializeDurableCanonicalJsonValue(result.costEvidence) !==
        serializeDurableCanonicalJsonValue(expectedCost)
    )
      return invalidVerification("result-envelope", "fingerprint_mismatch", "operational-evidence");
    if (result.outcome === "succeeded") {
      const characters = countOutputCharacters(result.outputContent);
      const outputRequirements = request.reasoningInput.outputRequirements;
      if (
        result.outputContent.contentType !== outputRequirements.contentType ||
        (outputRequirements.requireNonEmpty && characters === 0)
      )
        return invalidVerification("result-envelope", "fingerprint_mismatch", "outputRequirements");
      if (
        characters !== result.outputCharacterCount ||
        characters > request.executionPolicy.maxOutputCharacters ||
        characters > request.reasoningInput.outputRequirements.maxCharacters
      )
        return invalidVerification("result-envelope", "budget_exceeded", "outputCharacterCount");
      if (
        outcome.status !== "succeeded" ||
        JSON.stringify(result.outputContent) !== JSON.stringify(outcome.outputContent)
      )
        return invalidVerification("result-envelope", "fingerprint_mismatch", "outputContent");
    } else {
      const resultEvidence =
        result.outcome === "failed"
          ? result.failureEvidence
          : result.outcome === "timed-out"
            ? result.timeoutEvidence
            : result.cancellationEvidence;
      const outcomeEvidence =
        outcome.status === "failed"
          ? outcome.failureEvidence
          : outcome.status === "timed-out"
            ? outcome.timeoutEvidence
            : outcome.status === "cancelled"
              ? outcome.cancellationEvidence
              : null;
      if (
        outcomeEvidence === null ||
        JSON.stringify(resultEvidence) !== JSON.stringify(outcomeEvidence)
      )
        return invalidVerification("result-envelope", "fingerprint_mismatch", "terminal-evidence");
    }
    return basic;
  } catch {
    return invalidVerification("result-envelope", "invalid_artifact", "binding");
  }
}

export type FinalizedReasoningConsumptionEvidenceInput = DistributiveOmit<
  FinalizedReasoningConsumptionEvidence,
  "consumptionFingerprint"
>;
export function createFinalizedReasoningConsumptionEvidence(
  input: FinalizedReasoningConsumptionEvidenceInput,
) {
  const attempts = input.attemptHistorySummary.attempts;
  const historyUnsigned = {
    attemptCount: input.attemptHistorySummary.attemptCount,
    finalAttemptNumber: input.attemptHistorySummary.finalAttemptNumber,
    finalOutcome: input.attemptHistorySummary.finalOutcome,
    attempts,
  };
  if (
    input.attemptHistorySummary.historyFingerprint !==
    createDurableCanonicalJsonSha256Fingerprint(historyUnsigned)
  )
    throw new ReasoningIntegrityError(
      "fingerprint_mismatch",
      "Attempt history fingerprint does not verify",
    );
  return signed(FinalizedReasoningConsumptionEvidenceSchema, input, "consumptionFingerprint");
}

export function verifyFinalizedReasoningConsumptionEvidence(input: {
  readonly consumptionEvidence: unknown;
  readonly resultEnvelope: ReasoningResultEnvelope;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly attempts: readonly ReasoningExecutionAttempt[];
  readonly outcomes: readonly ReasoningProviderOutcome[];
  readonly contextPackageObjectCount: number;
  readonly executionLedgerTransactionId: string;
}): ReasoningArtifactVerificationResult {
  let wrapper: CanonicalRecord;
  try {
    wrapper = captureCanonical(input, "Consumption verification input");
  } catch {
    return invalidVerification("finalized-consumption-evidence", "invalid_artifact", "binding");
  }
  const basic = verifySigned(
    "finalized-consumption-evidence",
    FinalizedReasoningConsumptionEvidenceSchema,
    wrapper.consumptionEvidence,
    "consumptionFingerprint",
  );
  if (basic.status !== "valid") return basic;
  try {
    const evidence = FinalizedReasoningConsumptionEvidenceSchema.parse(wrapper.consumptionEvidence);
    const result = ReasoningResultEnvelopeSchema.parse(wrapper.resultEnvelope);
    const request = ReasoningInvocationRequestSchema.parse(wrapper.invocationRequest);
    const provider = ReasoningProviderCapabilityDescriptorSchema.parse(wrapper.providerCapability);
    if (
      verifyReasoningInvocationRequest(request).status !== "valid" ||
      verifyReasoningProviderCapabilityDescriptor(provider).status !== "valid"
    )
      throw new Error("verification authority does not verify");
    if (!Array.isArray(wrapper.attempts) || !Array.isArray(wrapper.outcomes))
      throw new Error("attempt history must use arrays");
    const attempts = wrapper.attempts.map((attempt) =>
      ReasoningExecutionAttemptSchema.parse(attempt),
    );
    const outcomes = wrapper.outcomes.map((outcome) =>
      ReasoningProviderOutcomeSchema.parse(outcome),
    );
    const contextPackageObjectCount = wrapper.contextPackageObjectCount;
    const executionLedgerTransactionId = wrapper.executionLedgerTransactionId;
    if (
      !Number.isSafeInteger(contextPackageObjectCount) ||
      Number(contextPackageObjectCount) < 0 ||
      typeof executionLedgerTransactionId !== "string"
    )
      throw new Error("verification context is invalid");
    if (attempts.length === 0 || attempts.length !== outcomes.length)
      throw new Error("attempt history is incomplete");
    if (
      !verifyReasoningAttemptLifecycle({
        invocationRequest: request,
        providerCapability: provider,
        attempts,
        outcomes,
      })
    )
      throw new Error("attempt lifecycle is invalid");
    const expectedEntries = attempts.map((attempt, index) => {
      const outcome = outcomes[index];
      if (
        outcome === undefined ||
        outcome.executionAttemptId !== attempt.executionAttemptId ||
        outcome.invocationRequestId !== request.invocationRequestId ||
        outcome.attemptNumber !== attempt.attemptNumber ||
        attempt.attemptNumber !== index + 1 ||
        attempt.invocationRequestId !== request.invocationRequestId ||
        attempt.invocationRequestFingerprint !== request.requestFingerprint ||
        attempt.invocationIdempotencyKey !== request.idempotencyKey ||
        attempt.providerCapabilityId !== provider.providerCapabilityId ||
        attempt.providerCapabilityFingerprint !== provider.descriptorFingerprint ||
        attempt.executionPolicyFingerprint !== request.executionPolicy.policyFingerprint
      )
        throw new Error("attempt outcome mismatch");
      return {
        executionAttemptId: attempt.executionAttemptId,
        attemptNumber: attempt.attemptNumber,
        outcome: outcome.status,
        attemptFingerprint: attempt.attemptFingerprint,
        outcomeFingerprint: outcome.outcomeFingerprint,
      };
    });
    const historyUnsigned = {
      attemptCount: expectedEntries.length,
      finalAttemptNumber: expectedEntries.at(-1)?.attemptNumber,
      finalOutcome: expectedEntries.at(-1)?.outcome,
      attempts: expectedEntries,
    };
    const finalAttempt = attempts.at(-1)!;
    const finalOutcome = outcomes.at(-1)!;
    if (
      verifyReasoningResultEnvelope({
        resultEnvelope: result,
        invocationRequest: request,
        providerCapability: provider,
        attempt: finalAttempt,
        attemptHistory: attempts,
        providerOutcome: finalOutcome,
        outcomeHistory: outcomes,
        contextPackageObjectCount: Number(contextPackageObjectCount),
      }).status !== "valid"
    )
      throw new Error("result does not verify");
    const binding =
      evidence.deliveryReceiptId === result.deliveryReceiptId &&
      evidence.deliveryReceiptFingerprint === result.deliveryReceiptFingerprint &&
      evidence.deliveryTransactionId === result.deliveryTransactionId &&
      evidence.invocationRequestId === result.invocationRequestId &&
      evidence.invocationRequestFingerprint === result.invocationRequestFingerprint &&
      evidence.invocationIdempotencyKey === result.invocationIdempotencyKey &&
      evidence.providerCapabilityId === result.providerCapabilityId &&
      evidence.providerCapabilityFingerprint === result.providerCapabilityFingerprint &&
      evidence.finalResultEnvelopeId === result.resultEnvelopeId &&
      evidence.finalResultEnvelopeFingerprint === result.resultEnvelopeFingerprint &&
      evidence.finalOutcome === result.outcome &&
      evidence.usageEvidenceFingerprint === result.usageEvidence.usageFingerprint &&
      evidence.costEvidenceFingerprint === result.costEvidence.costFingerprint &&
      evidence.startedAt === attempts[0]!.startedAt &&
      evidence.completedAt === finalOutcome.completedAt &&
      evidence.executionLedgerTransactionId === executionLedgerTransactionId &&
      JSON.stringify(evidence.attemptHistorySummary.attempts) === JSON.stringify(expectedEntries) &&
      evidence.attemptHistorySummary.historyFingerprint ===
        createDurableCanonicalJsonSha256Fingerprint(historyUnsigned);
    const terminalBinding =
      (evidence.finalOutcome === "succeeded" && result.outcome === "succeeded") ||
      (evidence.finalOutcome === "failed" &&
        result.outcome === "failed" &&
        evidence.failureEvidenceFingerprint === result.failureEvidence.failureFingerprint) ||
      (evidence.finalOutcome === "timed-out" &&
        result.outcome === "timed-out" &&
        evidence.timeoutEvidenceFingerprint === result.timeoutEvidence.timeoutFingerprint) ||
      (evidence.finalOutcome === "cancelled" &&
        result.outcome === "cancelled" &&
        evidence.cancellationEvidenceFingerprint ===
          result.cancellationEvidence.cancellationFingerprint);
    if (!binding || !terminalBinding)
      return invalidVerification(
        "finalized-consumption-evidence",
        "fingerprint_mismatch",
        "binding",
      );
    return basic;
  } catch {
    return invalidVerification("finalized-consumption-evidence", "invalid_artifact", "binding");
  }
}
