import {
  ObservabilityReadinessEvidenceSchema,
  ProviderBoundedMetricSchema,
  ProviderBoundedTraceSchema,
  ProviderPublicErrorSchema,
  ProviderObservabilityRetentionEvidenceSchema,
  ProviderRequestPlanSchema,
  ProviderResponseMappingEvidenceSchema,
  ProviderStructuredLogSchema,
  findDurableCanonicalJsonIssue,
  type AuthorizationDecisionEvidence,
  type CircuitState,
  type CommittedDeliveryTransactionRecord,
  type CostAndBudgetDecision,
  type CredentialReference,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliverySuccess,
  type ObservabilityReadinessEvidence,
  type ProductionProviderAdapterDescriptor,
  type ProviderBoundedMetric,
  type ProviderBoundedTrace,
  type ProviderPublicError,
  type ProviderObservabilityRetentionEvidence,
  type ProviderRateAndCapacityDecision,
  type ProviderRequestPlan,
  type ProviderResponseMappingEvidence,
  type ProviderStructuredLog,
  type ProviderTransportPlan,
  type ReasoningCostEvidence,
  type ReasoningExecutionAttempt,
  type ReasoningExecutionReceipt,
  type ReasoningFailureEvidence,
  type ReasoningInvocationRequest,
  type ReasoningProviderCapabilityDescriptor,
  type ReasoningProviderCompatibilityResult,
  type ReasoningProviderOutcome,
  type ReasoningResultEnvelope,
  type ReasoningTimeoutEvidence,
  type ReasoningUsageEvidence,
  type SecureTransportPolicy,
} from "@founderos/knowledge-schema";

import {
  verifyCommittedDeliveryTransaction,
  verifyOriginalDeliveryArtifacts,
} from "./durable-context-delivery-ledger.js";
import {
  type AuthorizationAuthority,
  type AuthorizationDecisionInput,
  type CircuitTransitionInput,
  type CostAndBudgetEvaluationInput,
  type CredentialReferenceExpectation,
  ProviderReadinessIntegrityError,
  type RateAndCapacityEvaluationInput,
  type SecureTransportPolicyInput,
  enforceAuthorizationDecision,
  fingerprintProviderReadinessArtifact,
  verifyAuthorizationDecisionEvidence,
  verifyCircuitState,
  verifyCostAndBudgetDecision,
  verifyCredentialReference,
  verifyProductionProviderAdapterDescriptor,
  verifyProviderRateAndCapacityDecision,
  verifyProviderTransportPlan,
  verifySecureTransportPolicy,
  verifyInvocationTransportTimeoutCompatibility,
} from "./provider-readiness.js";
import {
  countCanonicalCharacters,
  countOutputCharacters,
  createReasoningCostEvidence,
  createReasoningExecutionAttempt,
  createReasoningExecutionReceipt,
  createReasoningFailureEvidence,
  createReasoningProviderOutcome,
  createReasoningResultEnvelope,
  createReasoningTimeoutEvidence,
  createReasoningUsageEvidence,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderCapabilityDescriptor,
  verifyReasoningProviderCompatibilityResult,
  verifyReasoningResultEnvelope,
} from "./reasoning.js";
import { serializeDurableCanonicalJsonValue } from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

type CanonicalRecord = Readonly<Record<string, unknown>>;
type CanonicalValue =
  null | boolean | number | string | readonly CanonicalValue[] | CanonicalRecord;
type Schema<T> = { parse(input: unknown): T };

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function captureRecord(value: unknown, label: string): CanonicalRecord {
  if (findDurableCanonicalJsonIssue(value) !== null || value === null || Array.isArray(value)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      `${label} must contain only accessor-free canonical data`,
    );
  }
  return immutableCopy(value as CanonicalRecord);
}

function requireExactKeys(
  value: CanonicalRecord,
  expected: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      `${label} contains unknown fields`,
    );
  }
}

function without(value: CanonicalRecord, field: string): CanonicalRecord {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function signed<T>(schema: Schema<T>, unsignedInput: unknown, fingerprintField: string): T {
  const unsigned = captureRecord(unsignedInput, "Signed provider artifact");
  try {
    return immutableCopy(
      schema.parse({
        ...unsigned,
        [fingerprintField]: fingerprintProviderReadinessArtifact(unsigned),
      }),
    );
  } catch (error) {
    if (error instanceof ProviderReadinessIntegrityError) throw error;
    throw new ProviderReadinessIntegrityError("invalid_artifact", "Provider artifact is invalid");
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

function assertSigned<T>(schema: Schema<T>, raw: unknown, fingerprintField: string): T {
  const value = schema.parse(captureRecord(raw, "Provider artifact")) as T & CanonicalRecord;
  if (
    value[fingerprintField] !==
    fingerprintProviderReadinessArtifact(without(value, fingerprintField))
  ) {
    throw new ProviderReadinessIntegrityError(
      "fingerprint_mismatch",
      "Provider artifact fingerprint does not verify",
    );
  }
  return immutableCopy(value as T);
}

export interface ProviderMappingVerifiedAuthority {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly transaction: CommittedDeliveryTransactionRecord;
  readonly deliveryRequest: GovernedContextDeliveryRequest;
  readonly envelope: GovernedContextDeliverySuccess["envelope"];
  readonly acknowledgment: GovernedContextDeliverySuccess["acknowledgment"];
  readonly receipt: GovernedContextDeliverySuccess["receipt"];
}

function assertExactVerifiedAuthority(authority: ProviderMappingVerifiedAuthority): void {
  const captured = captureRecord(
    authority,
    "Verified governed reasoning authority",
  ) as unknown as ProviderMappingVerifiedAuthority;
  requireExactKeys(
    captured as unknown as CanonicalRecord,
    [
      "invocationRequest",
      "transaction",
      "deliveryRequest",
      "envelope",
      "acknowledgment",
      "receipt",
    ],
    "Verified governed reasoning authority",
  );
  const transaction = verifyCommittedDeliveryTransaction(captured.transaction);
  const verified = verifyOriginalDeliveryArtifacts({
    request: captured.deliveryRequest,
    result: {
      schemaVersion: "1.0",
      status: "delivered",
      envelope: captured.envelope,
      acknowledgment: captured.acknowledgment,
      receipt: captured.receipt,
    },
  });
  const request = captured.invocationRequest;
  if (
    verifyReasoningInvocationRequest(request).status !== "valid" ||
    !sameCanonical(transaction.requestRegistration.request, verified.request) ||
    transaction.transactionId !== request.deliveryTransactionId ||
    transaction.requestRegistration.deliveryRequestId !==
      captured.deliveryRequest.deliveryRequestId ||
    transaction.requestRegistration.deliveryRequestFingerprint !==
      captured.deliveryRequest.requestFingerprint ||
    captured.envelope.deliveryEnvelopeId !== request.deliveryEnvelopeId ||
    captured.envelope.deliveryFingerprint !== request.deliveryEnvelopeFingerprint ||
    captured.receipt.receiptId !== request.deliveryReceiptId ||
    captured.receipt.receiptFingerprint !== request.deliveryReceiptFingerprint ||
    captured.envelope.contextPackageId !== request.contextPackageId ||
    captured.envelope.contextPackageFingerprint !== request.contextPackageFingerprint ||
    captured.envelope.consumerId !== request.consumerId ||
    captured.envelope.consumerDescriptorFingerprint !== request.consumerDescriptorFingerprint ||
    captured.envelope.policyDecisionEvidence.decisionFingerprint !==
      request.policyDecisionFingerprint ||
    captured.acknowledgment.status !== "accepted" ||
    captured.receipt.deliveryStatus !== "accepted" ||
    !sameCanonical(captured.envelope.activeSnapshotBinding, request.activeSnapshotBinding) ||
    !sameCanonical(captured.envelope.registryIntegrityBinding, request.registryIntegrityBinding)
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Mapping requires one exact verified Invocation and Durable Delivery projection",
    );
  }
}

export interface ProviderRequestPlanConstructionInput {
  readonly schemaVersion: "1.0";
  readonly requestPlanId: string;
  readonly evaluatedAt: string;
  readonly authority: ProviderMappingVerifiedAuthority;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly compatibility: ReasoningProviderCompatibilityResult;
  readonly authorization: Readonly<{
    evidence: AuthorizationDecisionEvidence;
    authority: AuthorizationAuthority;
    expectedDecision: AuthorizationDecisionInput;
  }>;
  readonly credential: Readonly<{
    reference: CredentialReference;
    expected: CredentialReferenceExpectation;
  }>;
  readonly transport: Readonly<{
    policy: SecureTransportPolicy;
    policyInput: SecureTransportPolicyInput;
    plan: ProviderTransportPlan;
    expectedTransportPlanId: string;
  }>;
  readonly rate: Readonly<{
    decision: ProviderRateAndCapacityDecision;
    evaluation: RateAndCapacityEvaluationInput;
  }>;
  readonly cost: Readonly<{
    decision: CostAndBudgetDecision;
    evaluation: CostAndBudgetEvaluationInput;
  }>;
}

function assertRequestPlanAuthorities(input: ProviderRequestPlanConstructionInput): void {
  assertExactVerifiedAuthority(input.authority);
  const request = input.authority.invocationRequest;
  if (
    input.schemaVersion !== "1.0" ||
    input.adapter.requestMappingVersion !== input.schemaVersion ||
    verifyReasoningProviderCapabilityDescriptor(input.providerCapability).status !== "valid" ||
    verifyProductionProviderAdapterDescriptor({
      descriptor: input.adapter,
      providerCapability: input.providerCapability,
    }).status !== "valid" ||
    verifyReasoningProviderCompatibilityResult({
      compatibility: input.compatibility,
      invocationRequest: request,
      providerCapability: input.providerCapability,
    }).status !== "valid" ||
    input.compatibility.status !== "compatible" ||
    verifyAuthorizationDecisionEvidence(input.authorization).status !== "valid" ||
    enforceAuthorizationDecision({ ...input.authorization, evaluatedAt: input.evaluatedAt })
      .status !== "allowed" ||
    verifyCredentialReference({
      reference: input.credential.reference,
      adapter: input.adapter,
      expected: input.credential.expected,
    }).status !== "valid" ||
    verifySecureTransportPolicy({
      policy: input.transport.policy,
      adapter: input.adapter,
      expectedPolicy: input.transport.policyInput,
    }).status !== "valid" ||
    !verifyInvocationTransportTimeoutCompatibility({
      invocationRequest: request,
      policy: input.transport.policy,
    }) ||
    verifyProviderTransportPlan({
      plan: input.transport.plan,
      adapter: input.adapter,
      policy: input.transport.policy,
      expectedTransportPlanId: input.transport.expectedTransportPlanId,
    }).status !== "valid" ||
    verifyProviderRateAndCapacityDecision(input.rate).status !== "valid" ||
    verifyCostAndBudgetDecision(input.cost).status !== "valid" ||
    input.rate.decision.outcome !== "admitted" ||
    input.cost.decision.outcome !== "within-budget" ||
    input.rate.decision.evaluatedAt !== input.evaluatedAt ||
    input.cost.decision.evaluatedAt !== input.evaluatedAt ||
    input.authorization.authority.deliveryAuthority.invocationRequest.requestFingerprint !==
      request.requestFingerprint ||
    input.authorization.authority.adapter.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.credential.reference.providerFamilyReference !== input.adapter.providerFamilyReference ||
    input.transport.plan.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.transport.plan.transportPolicyFingerprint !== input.transport.policy.policyFingerprint ||
    input.rate.decision.invocationRequestFingerprint !== request.requestFingerprint ||
    input.rate.decision.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.cost.decision.invocationRequestFingerprint !== request.requestFingerprint ||
    input.cost.decision.adapterFingerprint !== input.adapter.adapterFingerprint ||
    Date.parse(input.evaluatedAt) < Date.parse(request.requestedAt)
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Request Plan authorities do not verify exactly",
    );
  }
}

export function createProviderRequestPlan(
  input: ProviderRequestPlanConstructionInput,
): ProviderRequestPlan {
  const captured = captureRecord(
    input,
    "Provider Request Plan construction input",
  ) as unknown as ProviderRequestPlanConstructionInput;
  requireExactKeys(
    captured as unknown as CanonicalRecord,
    [
      "schemaVersion",
      "requestPlanId",
      "evaluatedAt",
      "authority",
      "adapter",
      "providerCapability",
      "compatibility",
      "authorization",
      "credential",
      "transport",
      "rate",
      "cost",
    ],
    "Provider Request Plan construction input",
  );
  assertRequestPlanAuthorities(captured);
  const request = captured.authority.invocationRequest;
  const inputCharacterCount = countCanonicalCharacters(request.reasoningInput);
  const maximumInputCharacters = request.executionPolicy.maxInputCharacters;
  const canonicalInputBytes = new TextEncoder().encode(
    serializeDurableCanonicalJsonValue(request.reasoningInput),
  ).byteLength;
  if (
    inputCharacterCount > maximumInputCharacters ||
    canonicalInputBytes > captured.transport.plan.maximumRequestBytes
  ) {
    throw new ProviderReadinessIntegrityError(
      "unsafe_content",
      "Provider Request input exceeds verified limits",
    );
  }
  const bodyMappingUnsigned = {
    contentType: request.reasoningInput.contentType,
    instructionBlockCount: request.reasoningInput.instructionBlocks.length,
    contextReferenceIncluded: true as const,
    hiddenContextIncluded: false as const,
    toolDefinitionsIncluded: false as const,
    functionCallsIncluded: false as const,
  };
  const bindingCommitment = {
    schemaVersion: captured.schemaVersion,
    evaluatedAt: captured.evaluatedAt,
    adapterFingerprint: captured.adapter.adapterFingerprint,
    invocationRequestFingerprint: request.requestFingerprint,
    authorizationDecisionFingerprint: captured.authorization.evidence.decisionFingerprint,
    credentialReferenceFingerprint: captured.credential.reference.referenceFingerprint,
    providerCapabilityFingerprint: captured.providerCapability.descriptorFingerprint,
    transportPolicyFingerprint: captured.transport.policy.policyFingerprint,
    transportPlanFingerprint: captured.transport.plan.planFingerprint,
    rateAndCapacityDecisionFingerprint: captured.rate.decision.decisionFingerprint,
    costAndBudgetDecisionFingerprint: captured.cost.decision.decisionFingerprint,
    canonicalInputBytes,
    bodyMapping: bodyMappingUnsigned,
  };
  return signed(
    ProviderRequestPlanSchema,
    {
      schemaVersion: captured.schemaVersion,
      requestPlanId: captured.requestPlanId,
      adapterId: captured.adapter.adapterId,
      adapterFingerprint: captured.adapter.adapterFingerprint,
      providerCapabilityId: captured.providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: captured.providerCapability.descriptorFingerprint,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      deliveryTransactionId: request.deliveryTransactionId,
      deliveryTransactionFingerprint: captured.authority.transaction.transactionFingerprint,
      authorizationDecisionFingerprint: captured.authorization.evidence.decisionFingerprint,
      credentialReferenceId: captured.credential.reference.credentialReferenceId,
      credentialReferenceFingerprint: captured.credential.reference.referenceFingerprint,
      transportPolicyId: captured.transport.policy.transportPolicyId,
      transportPolicyFingerprint: captured.transport.policy.policyFingerprint,
      rateAndCapacityDecisionFingerprint: captured.rate.decision.decisionFingerprint,
      costAndBudgetDecisionFingerprint: captured.cost.decision.decisionFingerprint,
      logicalEndpointClassification:
        captured.adapter.state === "dry-run-mapping"
          ? "reasoning-generation"
          : "reasoning-evaluation",
      methodClassification: "provider-request-post",
      redactedHeaderPlan: [
        { headerClassification: "content-type", valueClassification: "canonical-json" },
        {
          headerClassification: "idempotency-reference",
          valueClassification: "opaque-idempotency-reference",
        },
        { headerClassification: "request-correlation", valueClassification: "logical-identifier" },
      ],
      bodyMappingEvidence: {
        ...bodyMappingUnsigned,
        mappingFingerprint: fingerprintProviderReadinessArtifact(bindingCommitment),
      },
      inputSizeEvidence: {
        inputCharacterCount,
        maximumInputCharacters,
        withinLimit: true,
      },
      timeoutAndCancellationPlan: {
        timeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
        cancellationMode: request.executionPolicy.cancellationMode,
      },
      expectedResponseConstraints: {
        contentType: request.reasoningInput.outputRequirements.contentType,
        maximumResponseBytes: captured.transport.plan.maximumResponseBytes,
        maximumOutputCharacters: Math.min(
          request.executionPolicy.maxOutputCharacters,
          request.reasoningInput.outputRequirements.maxCharacters,
        ),
        requireNonEmpty: request.reasoningInput.outputRequirements.requireNonEmpty,
      },
      warnings: ["cost_is_estimated", "dry_run_only"],
    },
    "requestPlanFingerprint",
  );
}

export function verifyProviderRequestPlan(input: {
  readonly plan: unknown;
  readonly construction: ProviderRequestPlanConstructionInput;
}): { readonly status: "valid" | "invalid"; readonly reason: string | null } {
  try {
    const wrapper = captureRecord(input, "Provider Request Plan verification input");
    const plan = assertSigned(ProviderRequestPlanSchema, wrapper.plan, "requestPlanFingerprint");
    const expected = createProviderRequestPlan(
      wrapper.construction as unknown as ProviderRequestPlanConstructionInput,
    );
    return immutableCopy(
      sameCanonical(plan, expected)
        ? { status: "valid" as const, reason: null }
        : { status: "invalid" as const, reason: "request_plan_binding_mismatch" },
    );
  } catch {
    return immutableCopy({ status: "invalid" as const, reason: "request_plan_invalid" });
  }
}

export type ProviderResponseFixtureClassification =
  ProviderResponseMappingEvidence["fixtureClassification"] | "cost-metadata" | "usage-metadata";

export interface ProviderResponseFixtureMappingInput {
  readonly schemaVersion: "1.0";
  readonly mappingEvidenceId: string;
  readonly resultEnvelopeId: string;
  readonly executionAttemptId: string;
  readonly fixtureClassification: ProviderResponseFixtureClassification;
  readonly startedAt: string;
  readonly requestPlan: ProviderRequestPlan;
  readonly requestPlanConstruction: ProviderRequestPlanConstructionInput;
  readonly contextPackageObjectCount: number;
}

export interface ProviderRateLimitFixtureEvidence {
  readonly schemaVersion: "1.0";
  readonly rateLimitEvidenceId: string;
  readonly executionAttemptId: string;
  readonly invocationRequestId: string;
  readonly retryAfterMilliseconds: number;
  readonly reasonCode: "provider_rate_limit";
  readonly rateLimitFingerprint: string;
}

export interface ProviderResponseFixtureMapping {
  readonly fixtureClassification: ProviderResponseFixtureClassification;
  readonly attempt: ReasoningExecutionAttempt;
  readonly outcome: ReasoningProviderOutcome;
  readonly executionReceipt: ReasoningExecutionReceipt;
  readonly usageEvidence: ReasoningUsageEvidence;
  readonly costEvidence: ReasoningCostEvidence;
  readonly failureEvidence?: ReasoningFailureEvidence;
  readonly timeoutEvidence?: ReasoningTimeoutEvidence;
  readonly rateLimitEvidence?: ProviderRateLimitFixtureEvidence;
  readonly resultEnvelope: ReasoningResultEnvelope;
  readonly mappingEvidence: ProviderResponseMappingEvidence;
}

const RESPONSE_FAILURE = {
  "credential-rejection": {
    failureCategory: "input-validation",
    reasonCode: "credential_material_rejected",
    retryable: false,
    detail: "Provider credential reference was rejected",
    errorCategory: "credential-rejection",
  },
  "empty-response": {
    failureCategory: "output-validation",
    reasonCode: "malformed_success_outcome",
    retryable: false,
    detail: "Provider response was empty",
    errorCategory: "empty-response",
  },
  "invalid-provider-response": {
    failureCategory: "output-validation",
    reasonCode: "invalid_provider_outcome",
    retryable: false,
    detail: "Provider response did not satisfy the governed contract",
    errorCategory: "invalid-provider-response",
  },
  "oversized-response": {
    failureCategory: "output-validation",
    reasonCode: "output_budget_exceeded",
    retryable: false,
    detail: "Provider response exceeded the governed size limit",
    errorCategory: "oversized-response",
  },
  "provider-rate-limit": {
    failureCategory: "transient-provider-failure",
    reasonCode: "transient_provider_failure",
    retryable: true,
    detail: "Provider rate limit prevented evaluation",
    errorCategory: "provider-rate-limit",
  },
  "provider-server-failure": {
    failureCategory: "permanent-provider-failure",
    reasonCode: "permanent_provider_failure",
    retryable: false,
    detail: "Provider server failure prevented evaluation",
    errorCategory: "provider-server-failure",
  },
  "redaction-failure": {
    failureCategory: "output-validation",
    reasonCode: "unsafe_output_rejected",
    retryable: false,
    detail: "Provider response failed governed redaction",
    errorCategory: "redaction-failure",
  },
  "transport-security-failure": {
    failureCategory: "policy",
    reasonCode: "policy_rejected",
    retryable: false,
    detail: "Provider transport security policy rejected the response",
    errorCategory: "transport-security-failure",
  },
} as const;

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Response fixture time is invalid",
    );
  }
  return new Date(parsed + milliseconds).toISOString();
}

function responseSizeForFixture(
  classification: ProviderResponseFixtureClassification,
  maximumResponseBytes: number,
): number {
  if (classification === "empty-response") return 0;
  if (classification === "oversized-response") return maximumResponseBytes + 1;
  return classification === "successful-response" ||
    classification === "usage-metadata" ||
    classification === "cost-metadata"
    ? 128
    : 64;
}

function schemaFixtureClassification(
  classification: ProviderResponseFixtureClassification,
): ProviderResponseMappingEvidence["fixtureClassification"] {
  return classification === "usage-metadata" || classification === "cost-metadata"
    ? "successful-response"
    : classification;
}

function responseUsageStatus(
  usageEvidence: ReasoningUsageEvidence,
): ProviderResponseMappingEvidence["sanitizedMetadata"]["usageStatus"] {
  void usageEvidence;
  return "estimated";
}

function responseCostStatus(
  costEvidence: ReasoningCostEvidence,
): ProviderResponseMappingEvidence["sanitizedMetadata"]["costStatus"] {
  return costEvidence.status === "actual"
    ? "provider-reported"
    : costEvidence.status === "estimated"
      ? "estimated"
      : "unavailable";
}

export function mapProviderResponseFixture(
  input: ProviderResponseFixtureMappingInput,
): ProviderResponseFixtureMapping {
  const captured = captureRecord(
    input,
    "Provider response fixture mapping input",
  ) as unknown as ProviderResponseFixtureMappingInput;
  requireExactKeys(
    captured as unknown as CanonicalRecord,
    [
      "schemaVersion",
      "mappingEvidenceId",
      "resultEnvelopeId",
      "executionAttemptId",
      "fixtureClassification",
      "startedAt",
      "requestPlan",
      "requestPlanConstruction",
      "contextPackageObjectCount",
    ],
    "Provider response fixture mapping input",
  );
  if (
    captured.schemaVersion !== "1.0" ||
    verifyProviderRequestPlan({
      plan: captured.requestPlan,
      construction: captured.requestPlanConstruction,
    }).status !== "valid" ||
    !Number.isSafeInteger(captured.contextPackageObjectCount) ||
    captured.contextPackageObjectCount < 0
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Response fixture Request Plan does not verify",
    );
  }
  const request = captured.requestPlanConstruction.authority.invocationRequest;
  const provider = captured.requestPlanConstruction.providerCapability;
  if (Date.parse(captured.startedAt) < Date.parse(request.requestedAt)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Response fixture cannot precede its Invocation",
    );
  }
  const timeoutMilliseconds = request.executionPolicy.timeoutMilliseconds;
  const deadlineAt = addMilliseconds(captured.startedAt, timeoutMilliseconds);
  const completedAt =
    captured.fixtureClassification === "provider-timeout"
      ? deadlineAt
      : addMilliseconds(captured.startedAt, 100);
  const attempt = createReasoningExecutionAttempt({
    schemaVersion: "1.0",
    executionAttemptId: captured.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
    attemptNumber: 1,
    startedAt: captured.startedAt,
    deadlineAt,
    cancellationState: "not-requested",
  });
  let failureEvidence: ReasoningFailureEvidence | undefined;
  let timeoutEvidence: ReasoningTimeoutEvidence | undefined;
  let outcome: ReasoningProviderOutcome;
  if (captured.fixtureClassification === "provider-timeout") {
    timeoutEvidence = createReasoningTimeoutEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      configuredTimeoutMilliseconds: timeoutMilliseconds,
      attemptStartedAt: attempt.startedAt,
      deadlineAt,
      elapsedMilliseconds: timeoutMilliseconds,
      timeoutPhase: "during-execution",
      reasonCode: "execution_deadline_reached",
    });
    outcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt,
      status: "timed-out",
      timeoutEvidence,
    });
  } else if (
    captured.fixtureClassification === "successful-response" ||
    captured.fixtureClassification === "usage-metadata" ||
    captured.fixtureClassification === "cost-metadata"
  ) {
    const outputContent =
      request.reasoningInput.outputRequirements.contentType === "canonical-json"
        ? {
            contentType: "canonical-json" as const,
            value: {
              classification: captured.fixtureClassification,
              status: "fixture-success",
            },
          }
        : {
            contentType: "canonical-text" as const,
            text: "Deterministic provider response fixture.",
          };
    const outputCharacterCount = countOutputCharacters(outputContent);
    outcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt,
      status: "succeeded",
      outputContent,
      outputCharacterCount,
      outputContentFingerprint: fingerprintProviderReadinessArtifact(outputContent),
    });
  } else {
    const failure = RESPONSE_FAILURE[captured.fixtureClassification];
    failureEvidence = createReasoningFailureEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      failureCategory: failure.failureCategory,
      reasonCodes: [failure.reasonCode],
      retryable: failure.retryable,
      sanitizedDetail: failure.detail,
      attemptNumber: 1,
    });
    outcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt,
      status: "failed",
      failureEvidence,
    });
  }
  const executionReceipt = createReasoningExecutionReceipt({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    attemptNumber: 1,
    startedAt: attempt.startedAt,
    completedAt,
    outcome: outcome.status,
  });
  const outputCharacterCount = outcome.status === "succeeded" ? outcome.outputCharacterCount : 0;
  const usageEvidence = createReasoningUsageEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    inputCharacterCount: countCanonicalCharacters(request.reasoningInput),
    outputCharacterCount,
    instructionBlockCount: request.reasoningInput.instructionBlocks.length,
    contextPackageObjectCount: captured.contextPackageObjectCount,
    attemptNumber: 1,
    durationMilliseconds: Date.parse(completedAt) - Date.parse(attempt.startedAt),
  });
  const costEvidence =
    provider.providerClass === "deterministic-fake-provider"
      ? createReasoningCostEvidence({
          schemaVersion: "1.0",
          executionAttemptId: attempt.executionAttemptId,
          status: "not-applicable",
        })
      : captured.fixtureClassification === "cost-metadata"
        ? createReasoningCostEvidence({
            schemaVersion: "1.0",
            executionAttemptId: attempt.executionAttemptId,
            status: "estimated",
            currencyCode: captured.requestPlanConstruction.cost.decision.currencyCode,
            amountMinorUnits:
              captured.requestPlanConstruction.cost.decision.estimatedMaximumCostMinorUnits,
            estimationMethod: "provider-fixture-cost-metadata",
            pricingReferenceVersion:
              captured.requestPlanConstruction.cost.decision.pricingReferenceVersion,
          } as never)
        : createReasoningCostEvidence({
            schemaVersion: "1.0",
            executionAttemptId: attempt.executionAttemptId,
            status: "unavailable",
            reasonCode: "cost_evidence_unavailable",
          } as never);
  const resultBase = {
    schemaVersion: "1.0" as const,
    resultEnvelopeId: captured.resultEnvelopeId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    deliveryTransactionId: request.deliveryTransactionId,
    deliveryEnvelopeId: request.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: request.deliveryEnvelopeFingerprint,
    deliveryReceiptId: request.deliveryReceiptId,
    deliveryReceiptFingerprint: request.deliveryReceiptFingerprint,
    contextPackageId: request.contextPackageId,
    contextPackageFingerprint: request.contextPackageFingerprint,
    consumerId: request.consumerId,
    consumerDescriptorFingerprint: request.consumerDescriptorFingerprint,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
    executionAttemptId: attempt.executionAttemptId,
    attemptNumber: 1,
    executionReceipt,
    usageEvidence,
    costEvidence,
    completedAt,
  };
  const resultEnvelope = createReasoningResultEnvelope(
    outcome.status === "succeeded"
      ? {
          ...resultBase,
          outcome: "succeeded",
          outputContent: outcome.outputContent,
          outputCharacterCount: outcome.outputCharacterCount,
          outputContentFingerprint: outcome.outputContentFingerprint,
        }
      : outcome.status === "timed-out"
        ? { ...resultBase, outcome: "timed-out", timeoutEvidence: outcome.timeoutEvidence }
        : outcome.status === "failed"
          ? { ...resultBase, outcome: "failed", failureEvidence: outcome.failureEvidence }
          : (() => {
              throw new ProviderReadinessIntegrityError(
                "invalid_artifact",
                "Unsupported response fixture outcome",
              );
            })(),
  );
  if (
    verifyReasoningResultEnvelope({
      resultEnvelope,
      invocationRequest: request,
      providerCapability: provider,
      attempt,
      attemptHistory: [attempt],
      providerOutcome: outcome,
      outcomeHistory: [outcome],
      contextPackageObjectCount: captured.contextPackageObjectCount,
    }).status !== "valid"
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Response fixture does not form a valid M13 Result chain",
    );
  }
  const rateLimitEvidence =
    captured.fixtureClassification === "provider-rate-limit"
      ? (signed(
          {
            parse: (raw: unknown) => raw as ProviderRateLimitFixtureEvidence,
          },
          {
            schemaVersion: "1.0",
            rateLimitEvidenceId: `${attempt.executionAttemptId}-rate-limit`,
            executionAttemptId: attempt.executionAttemptId,
            invocationRequestId: request.invocationRequestId,
            retryAfterMilliseconds: 60_000,
            reasonCode: "provider_rate_limit",
          },
          "rateLimitFingerprint",
        ) as ProviderRateLimitFixtureEvidence)
      : undefined;
  const references = [
    {
      evidenceType: "execution-outcome" as const,
      evidenceId: attempt.executionAttemptId,
      fingerprint: outcome.outcomeFingerprint,
    },
    {
      evidenceType: "execution-receipt" as const,
      evidenceId: attempt.executionAttemptId,
      fingerprint: executionReceipt.receiptFingerprint,
    },
    {
      evidenceType: "usage-evidence" as const,
      evidenceId: attempt.executionAttemptId,
      fingerprint: usageEvidence.usageFingerprint,
    },
    {
      evidenceType: "cost-evidence" as const,
      evidenceId: attempt.executionAttemptId,
      fingerprint: costEvidence.costFingerprint,
    },
    ...(failureEvidence === undefined
      ? []
      : [
          {
            evidenceType: "failure-evidence" as const,
            evidenceId: attempt.executionAttemptId,
            fingerprint: failureEvidence.failureFingerprint,
          },
        ]),
    ...(timeoutEvidence === undefined
      ? []
      : [
          {
            evidenceType: "timeout-evidence" as const,
            evidenceId: attempt.executionAttemptId,
            fingerprint: timeoutEvidence.timeoutFingerprint,
          },
        ]),
    ...(rateLimitEvidence === undefined
      ? []
      : [
          {
            evidenceType: "rate-limit-evidence" as const,
            evidenceId: rateLimitEvidence.rateLimitEvidenceId,
            fingerprint: rateLimitEvidence.rateLimitFingerprint,
          },
        ]),
  ].sort((left, right) =>
    `${left.evidenceType}\0${left.evidenceId}`.localeCompare(
      `${right.evidenceType}\0${right.evidenceId}`,
    ),
  );
  const responseSizeBytes = responseSizeForFixture(
    captured.fixtureClassification,
    captured.requestPlan.expectedResponseConstraints.maximumResponseBytes,
  );
  const errorCategory =
    captured.fixtureClassification === "provider-timeout"
      ? "provider-timeout"
      : captured.fixtureClassification in RESPONSE_FAILURE
        ? RESPONSE_FAILURE[captured.fixtureClassification as keyof typeof RESPONSE_FAILURE]
            .errorCategory
        : undefined;
  const providerResponseReferenceFingerprint = fingerprintProviderReadinessArtifact({
    fixtureClassification: captured.fixtureClassification,
    outcome: outcome.status,
    responseSizeBytes,
    durationMilliseconds: Date.parse(completedAt) - Date.parse(attempt.startedAt),
    usageStatus: responseUsageStatus(usageEvidence),
    costStatus: responseCostStatus(costEvidence),
  });
  const mappingEvidence = signed(
    ProviderResponseMappingEvidenceSchema,
    {
      schemaVersion: captured.schemaVersion,
      mappingEvidenceId: captured.mappingEvidenceId,
      adapterId: captured.requestPlanConstruction.adapter.adapterId,
      adapterFingerprint: captured.requestPlanConstruction.adapter.adapterFingerprint,
      requestPlanId: captured.requestPlan.requestPlanId,
      requestPlanFingerprint: captured.requestPlan.requestPlanFingerprint,
      fixtureClassification: schemaFixtureClassification(captured.fixtureClassification),
      outcome: outcome.status,
      evidenceReferences: references,
      sanitizedMetadata: {
        outcomeClassification:
          outcome.status === "succeeded"
            ? "success"
            : outcome.status === "timed-out"
              ? "timeout"
              : "failure",
        durationMilliseconds: Date.parse(completedAt) - Date.parse(attempt.startedAt),
        responseSizeBytes,
        usageStatus: responseUsageStatus(usageEvidence),
        costStatus: responseCostStatus(costEvidence),
        ...(errorCategory === undefined ? {} : { errorCategory }),
      },
      providerResponseReferenceFingerprint,
    },
    "mappingEvidenceFingerprint",
  );
  return immutableCopy({
    fixtureClassification: captured.fixtureClassification,
    attempt,
    outcome,
    executionReceipt,
    usageEvidence,
    costEvidence,
    ...(failureEvidence === undefined ? {} : { failureEvidence }),
    ...(timeoutEvidence === undefined ? {} : { timeoutEvidence }),
    ...(rateLimitEvidence === undefined ? {} : { rateLimitEvidence }),
    resultEnvelope,
    mappingEvidence,
  });
}

export function verifyProviderResponseFixtureMapping(input: {
  readonly mapping: unknown;
  readonly input: ProviderResponseFixtureMappingInput;
}): { readonly status: "valid" | "invalid"; readonly reason: string | null } {
  try {
    const wrapper = captureRecord(input, "Provider response fixture verification input");
    const expected = mapProviderResponseFixture(
      wrapper.input as unknown as ProviderResponseFixtureMappingInput,
    );
    const actual = wrapper.mapping as unknown as ProviderResponseFixtureMapping;
    assertSigned(
      ProviderResponseMappingEvidenceSchema,
      actual.mappingEvidence,
      "mappingEvidenceFingerprint",
    );
    return immutableCopy(
      sameCanonical(actual, expected)
        ? { status: "valid" as const, reason: null }
        : { status: "invalid" as const, reason: "response_mapping_binding_mismatch" },
    );
  } catch {
    return immutableCopy({ status: "invalid" as const, reason: "response_mapping_invalid" });
  }
}

export interface ProviderObservabilityRedactionPolicy {
  readonly maximumDepth: number;
  readonly maximumFieldCount: number;
  readonly maximumValueCharacters: number;
  readonly unknownSensitiveFieldPolicy?: "omit" | "reject";
}

const SENSITIVE_KEY =
  /(?:authorization|credential|secret|token|api.?key|password|cookie|request.?body|response.?body|context(?:package)?|environment(?:dump)?|env(?:iron)?|headers?|physical.?path|file.?path|url)/iu;
const SENSITIVE_VALUE =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]+|\b[A-Z][A-Z0-9_]{1,}\s*=|\bsk[-_][A-Za-z0-9_-]+|\bgh[pousr]_[A-Za-z0-9_]+|\bxox[A-Za-z0-9_-]+|\bpk_(?:live|test)_[A-Za-z0-9_]+|-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|file:\/\/|https?:\/\/|(?:^|\s)\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\|\\\\[^\\]+\\)/u;

const METRIC_LABEL_VALUES = {
  adapter_class: ["disabled", "dry-run-mapping", "validation-only"],
  circuit_state: ["closed", "disabled", "half-open", "open", "quarantined"],
  environment_class: ["development", "evaluation", "production", "staging", "test"],
  error_category: [
    "authorization",
    "capacity",
    "circuit",
    "cost",
    "credential",
    "mapping",
    "policy",
    "redaction",
    "transport",
  ],
  outcome: [
    "disabled-by-policy",
    "failed",
    "not-ready",
    "ready-for-dry-run",
    "rejected",
    "succeeded",
    "timed-out",
  ],
  priority_class: ["critical", "high", "low", "normal"],
} as const;

const TRACE_ATTRIBUTE_VALUES = {
  adapter_class: METRIC_LABEL_VALUES.adapter_class,
  circuit_state: METRIC_LABEL_VALUES.circuit_state,
  error_category: METRIC_LABEL_VALUES.error_category,
  outcome: METRIC_LABEL_VALUES.outcome,
  rate_limit_status: [
    "admitted",
    "capacity-exhausted",
    "policy-denied",
    "provider-unavailable",
    "queue-full",
    "rate-limited",
  ],
} as const;

export function redactProviderObservabilityValue(
  value: unknown,
  policy: ProviderObservabilityRedactionPolicy,
): CanonicalValue {
  const capturedIssue = findDurableCanonicalJsonIssue(value);
  if (capturedIssue !== null) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Observability input is not accessor-safe canonical data",
    );
  }
  const capturedPolicy = captureRecord(
    policy,
    "Observability redaction policy",
  ) as unknown as ProviderObservabilityRedactionPolicy;
  requireExactKeys(
    capturedPolicy as unknown as CanonicalRecord,
    capturedPolicy.unknownSensitiveFieldPolicy === undefined
      ? ["maximumDepth", "maximumFieldCount", "maximumValueCharacters"]
      : [
          "maximumDepth",
          "maximumFieldCount",
          "maximumValueCharacters",
          "unknownSensitiveFieldPolicy",
        ],
    "Observability redaction policy",
  );
  if (
    !Number.isSafeInteger(capturedPolicy.maximumDepth) ||
    capturedPolicy.maximumDepth < 1 ||
    capturedPolicy.maximumDepth > 32 ||
    !Number.isSafeInteger(capturedPolicy.maximumFieldCount) ||
    capturedPolicy.maximumFieldCount < 1 ||
    capturedPolicy.maximumFieldCount > 1_024 ||
    !Number.isSafeInteger(capturedPolicy.maximumValueCharacters) ||
    capturedPolicy.maximumValueCharacters < 1 ||
    capturedPolicy.maximumValueCharacters > 1_024
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Observability redaction bounds are invalid",
    );
  }
  let fieldCount = 0;
  const consumeFieldBudget = (): void => {
    fieldCount += 1;
    if (fieldCount > capturedPolicy.maximumFieldCount) {
      throw new ProviderReadinessIntegrityError(
        "unsafe_content",
        "Observability input exceeds the field bound",
      );
    }
  };
  const visit = (current: unknown, depth: number): CanonicalValue => {
    if (depth > capturedPolicy.maximumDepth) {
      throw new ProviderReadinessIntegrityError(
        "unsafe_content",
        "Observability input exceeds the depth bound",
      );
    }
    if (typeof current === "string") {
      if (SENSITIVE_VALUE.test(current)) return "[REDACTED]";
      return [...current].slice(0, capturedPolicy.maximumValueCharacters).join("");
    }
    if (current === null || typeof current === "boolean" || typeof current === "number")
      return current;
    if (Array.isArray(current)) {
      if (current.length > capturedPolicy.maximumFieldCount - fieldCount) {
        throw new ProviderReadinessIntegrityError(
          "unsafe_content",
          "Observability array exceeds the field bound",
        );
      }
      return current.map((entry) => {
        consumeFieldBudget();
        return visit(entry, depth + 1);
      });
    }
    const output: Record<string, CanonicalValue> = {};
    for (const [key, entry] of Object.entries(current as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      consumeFieldBudget();
      if (SENSITIVE_KEY.test(key)) {
        if (capturedPolicy.unknownSensitiveFieldPolicy === "reject") {
          throw new ProviderReadinessIntegrityError(
            "unsafe_content",
            "Sensitive observability field was rejected",
          );
        }
        continue;
      }
      const redacted = visit(entry, depth + 1);
      if (typeof redacted === "string" && redacted === "[REDACTED]") continue;
      output[key] = redacted;
    }
    return output;
  };
  return immutableCopy(visit(structuredClone(value), 0));
}

export interface ProviderObservabilitySnapshot {
  readonly logs: readonly ProviderStructuredLog[];
  readonly metrics: readonly ProviderBoundedMetric[];
  readonly traces: readonly ProviderBoundedTrace[];
  readonly publicErrors: readonly ProviderPublicError[];
}

export interface ProviderObservabilityRetentionConfig {
  readonly sinkPolicyVersion: "1.0";
  readonly maximumEntriesPerArtifact: number;
  readonly maximumMetricLabelCardinality: number;
}

export class BoundedInMemoryProviderObservabilitySink {
  readonly #maximumEntries: number;
  readonly #maximumMetricLabelCardinality: number;
  readonly #logs: ProviderStructuredLog[] = [];
  readonly #metrics: ProviderBoundedMetric[] = [];
  readonly #traces: ProviderBoundedTrace[] = [];
  readonly #publicErrors: ProviderPublicError[] = [];

  public constructor(input: {
    readonly maximumEntriesPerArtifact: number;
    readonly maximumMetricLabelCardinality: number;
  }) {
    const captured = captureRecord(input, "In-memory observability sink options");
    requireExactKeys(
      captured,
      ["maximumEntriesPerArtifact", "maximumMetricLabelCardinality"],
      "In-memory observability sink options",
    );
    const maximumEntries = Number(captured.maximumEntriesPerArtifact);
    const maximumCardinality = Number(captured.maximumMetricLabelCardinality);
    if (
      !Number.isSafeInteger(maximumEntries) ||
      maximumEntries < 1 ||
      maximumEntries > 10_000 ||
      !Number.isSafeInteger(maximumCardinality) ||
      maximumCardinality < 1 ||
      maximumCardinality > 1_000
    ) {
      throw new ProviderReadinessIntegrityError(
        "invalid_artifact",
        "In-memory observability sink bounds are invalid",
      );
    }
    this.#maximumEntries = maximumEntries;
    this.#maximumMetricLabelCardinality = maximumCardinality;
  }

  #append<T>(target: T[], value: T): void {
    target.push(immutableCopy(value));
    if (target.length > this.#maximumEntries) target.shift();
  }

  public appendLog(value: unknown): void {
    this.#append(this.#logs, assertSigned(ProviderStructuredLogSchema, value, "logFingerprint"));
  }

  public appendMetric(value: unknown): void {
    const metric = assertSigned(ProviderBoundedMetricSchema, value, "metricFingerprint");
    for (const label of metric.labels) {
      if (!(METRIC_LABEL_VALUES[label.name] as readonly string[]).includes(label.value)) {
        throw new ProviderReadinessIntegrityError(
          "unsafe_content",
          "Metric labels must use bounded policy classifications",
        );
      }
    }
    const prior = [...this.#metrics, metric];
    for (const label of metric.labels) {
      const values = new Set(
        prior
          .filter((candidate) => candidate.metricName === metric.metricName)
          .flatMap((candidate) => candidate.labels)
          .filter((candidate) => candidate.name === label.name)
          .map((candidate) => candidate.value),
      );
      if (values.size > this.#maximumMetricLabelCardinality) {
        throw new ProviderReadinessIntegrityError(
          "unsafe_content",
          "Metric label cardinality is unbounded",
        );
      }
    }
    this.#append(this.#metrics, metric);
  }

  public appendTrace(value: unknown): void {
    const trace = assertSigned(ProviderBoundedTraceSchema, value, "traceFingerprint");
    for (const attribute of trace.attributes) {
      if (
        !(TRACE_ATTRIBUTE_VALUES[attribute.name] as readonly string[]).includes(attribute.value)
      ) {
        throw new ProviderReadinessIntegrityError(
          "unsafe_content",
          "Trace attributes must use bounded policy classifications",
        );
      }
    }
    this.#append(this.#traces, trace);
  }

  public appendPublicError(value: unknown): void {
    this.#append(
      this.#publicErrors,
      assertSigned(ProviderPublicErrorSchema, value, "errorFingerprint"),
    );
  }

  public appendBundle(bundle: ProviderObservabilityBundle): void {
    const captured = captureRecord(
      bundle,
      "Provider observability sink bundle",
    ) as unknown as ProviderObservabilityBundle;
    const log = assertSigned(ProviderStructuredLogSchema, captured.structuredLog, "logFingerprint");
    const metrics = captured.metrics.map((metric) =>
      assertSigned(ProviderBoundedMetricSchema, metric, "metricFingerprint"),
    );
    const traces = captured.traces.map((trace) =>
      assertSigned(ProviderBoundedTraceSchema, trace, "traceFingerprint"),
    );
    const publicErrors = captured.publicErrors.map((publicError) =>
      assertSigned(ProviderPublicErrorSchema, publicError, "errorFingerprint"),
    );
    for (const metric of metrics) {
      for (const label of metric.labels) {
        if (!(METRIC_LABEL_VALUES[label.name] as readonly string[]).includes(label.value)) {
          throw new ProviderReadinessIntegrityError(
            "unsafe_content",
            "Metric labels must use bounded policy classifications",
          );
        }
        const values = new Set(
          [...this.#metrics, ...metrics]
            .filter((candidate) => candidate.metricName === metric.metricName)
            .flatMap((candidate) => candidate.labels)
            .filter((candidate) => candidate.name === label.name)
            .map((candidate) => candidate.value),
        );
        if (values.size > this.#maximumMetricLabelCardinality) {
          throw new ProviderReadinessIntegrityError(
            "unsafe_content",
            "Metric label cardinality is unbounded",
          );
        }
      }
    }
    for (const trace of traces) {
      for (const attribute of trace.attributes) {
        if (
          !(TRACE_ATTRIBUTE_VALUES[attribute.name] as readonly string[]).includes(attribute.value)
        ) {
          throw new ProviderReadinessIntegrityError(
            "unsafe_content",
            "Trace attributes must use bounded policy classifications",
          );
        }
      }
    }
    this.#append(this.#logs, log);
    for (const metric of metrics) this.#append(this.#metrics, metric);
    for (const trace of traces) this.#append(this.#traces, trace);
    for (const publicError of publicErrors) this.#append(this.#publicErrors, publicError);
  }

  public snapshot(): ProviderObservabilitySnapshot {
    return immutableCopy({
      logs: this.#logs,
      metrics: this.#metrics,
      traces: this.#traces,
      publicErrors: this.#publicErrors,
    });
  }
}

export function createProviderObservabilityRetentionEvidence(input: {
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly bundle: ProviderObservabilityBundle;
  readonly retainedSnapshot: ProviderObservabilitySnapshot;
  readonly config: ProviderObservabilityRetentionConfig;
  readonly appendCount: 1;
}): ProviderObservabilityRetentionEvidence {
  const captured = captureRecord(input, "Provider observability retention input");
  requireExactKeys(
    captured,
    ["adapter", "invocationRequest", "bundle", "retainedSnapshot", "config", "appendCount"],
    "Provider observability retention input",
  );
  const adapter = captured.adapter as ProductionProviderAdapterDescriptor;
  const invocationRequest = captured.invocationRequest as ReasoningInvocationRequest;
  const bundle = captured.bundle as ProviderObservabilityBundle;
  const retainedSnapshot = captured.retainedSnapshot as ProviderObservabilitySnapshot;
  const config = captured.config as ProviderObservabilityRetentionConfig;
  requireExactKeys(
    config as unknown as CanonicalRecord,
    ["sinkPolicyVersion", "maximumEntriesPerArtifact", "maximumMetricLabelCardinality"],
    "Provider observability retention config",
  );
  const readiness = assertSigned(
    ObservabilityReadinessEvidenceSchema,
    bundle.readiness,
    "readinessFingerprint",
  );
  const expectedSnapshot: ProviderObservabilitySnapshot = {
    logs: [assertSigned(ProviderStructuredLogSchema, bundle.structuredLog, "logFingerprint")],
    metrics: bundle.metrics.map((metric) =>
      assertSigned(ProviderBoundedMetricSchema, metric, "metricFingerprint"),
    ),
    traces: bundle.traces.map((trace) =>
      assertSigned(ProviderBoundedTraceSchema, trace, "traceFingerprint"),
    ),
    publicErrors: bundle.publicErrors.map((error) =>
      assertSigned(ProviderPublicErrorSchema, error, "errorFingerprint"),
    ),
  };
  if (
    !sameCanonical(retainedSnapshot, expectedSnapshot) ||
    readiness.adapterId !== adapter.adapterId ||
    readiness.adapterFingerprint !== adapter.adapterFingerprint ||
    captured.appendCount !== 1
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Observability retention authority does not match the exact bundle",
    );
  }
  const unsignedEvidence = {
    schemaVersion: "1.0" as const,
    retentionEvidenceId: `${readiness.readinessEvidenceId}-retention`,
    adapterId: adapter.adapterId,
    adapterFingerprint: adapter.adapterFingerprint,
    invocationRequestId: invocationRequest.invocationRequestId,
    invocationRequestFingerprint: invocationRequest.requestFingerprint,
    observabilityReadinessEvidenceId: readiness.readinessEvidenceId,
    observabilityReadinessFingerprint: readiness.readinessFingerprint,
    sinkPolicyVersion: config.sinkPolicyVersion,
    maximumEntriesPerArtifact: config.maximumEntriesPerArtifact,
    maximumMetricLabelCardinality: config.maximumMetricLabelCardinality,
    retainedLogCount: retainedSnapshot.logs.length,
    retainedMetricCount: retainedSnapshot.metrics.length,
    retainedTraceCount: retainedSnapshot.traces.length,
    retainedPublicErrorCount: retainedSnapshot.publicErrors.length,
    retainedLogFingerprints: retainedSnapshot.logs.map((log) => log.logFingerprint),
    retainedMetricFingerprints: retainedSnapshot.metrics.map((metric) => metric.metricFingerprint),
    retainedTraceFingerprints: retainedSnapshot.traces.map((trace) => trace.traceFingerprint),
    retainedPublicErrorFingerprints: retainedSnapshot.publicErrors.map(
      (error) => error.errorFingerprint,
    ),
    canonicalSnapshotFingerprint: fingerprintProviderReadinessArtifact(retainedSnapshot),
    appendCount: 1 as const,
  };
  return immutableCopy(
    ProviderObservabilityRetentionEvidenceSchema.parse({
      ...unsignedEvidence,
      retentionFingerprint: fingerprintProviderReadinessArtifact(unsignedEvidence),
    }),
  );
}

export function verifyProviderObservabilityRetentionEvidence(input: {
  readonly evidence: unknown;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly bundle: ProviderObservabilityBundle;
  readonly retainedSnapshot: ProviderObservabilitySnapshot;
  readonly config: ProviderObservabilityRetentionConfig;
}): { readonly status: "valid" | "invalid"; readonly reason: string | null } {
  try {
    const captured = captureRecord(input, "Provider observability retention verification input");
    requireExactKeys(
      captured,
      ["evidence", "adapter", "invocationRequest", "bundle", "retainedSnapshot", "config"],
      "Provider observability retention verification input",
    );
    const candidate = ProviderObservabilityRetentionEvidenceSchema.parse(captured.evidence);
    const expected = createProviderObservabilityRetentionEvidence({
      adapter: captured.adapter as ProductionProviderAdapterDescriptor,
      invocationRequest: captured.invocationRequest as ReasoningInvocationRequest,
      bundle: captured.bundle as ProviderObservabilityBundle,
      retainedSnapshot: captured.retainedSnapshot as ProviderObservabilitySnapshot,
      config: captured.config as ProviderObservabilityRetentionConfig,
      appendCount: 1,
    });
    return immutableCopy(
      sameCanonical(candidate, expected)
        ? { status: "valid" as const, reason: null }
        : { status: "invalid" as const, reason: "observability_retention_binding_mismatch" },
    );
  } catch {
    return immutableCopy({
      status: "invalid" as const,
      reason: "observability_retention_invalid",
    });
  }
}

export interface ProviderObservabilityPolicyInput {
  readonly redactionPolicyVersion: "1.0";
  readonly maximumLogFieldCharacters: number;
  readonly maximumTraceAttributeCharacters: number;
  readonly maximumMetricLabelCount: number;
}

export interface ProviderObservabilityBundleInput {
  readonly schemaVersion: "1.0";
  readonly readinessEvidenceId: string;
  readonly evaluatedAt: string;
  readonly startedAt: string;
  readonly authority: ProviderMappingVerifiedAuthority;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly compatibility: ReasoningProviderCompatibilityResult;
  readonly authorization: Readonly<{
    evidence: AuthorizationDecisionEvidence;
    authority: AuthorizationAuthority;
    expectedDecision: AuthorizationDecisionInput;
  }>;
  readonly rate: Readonly<{
    decision: ProviderRateAndCapacityDecision;
    evaluation: RateAndCapacityEvaluationInput;
  }>;
  readonly cost: Readonly<{
    decision: CostAndBudgetDecision;
    evaluation: CostAndBudgetEvaluationInput;
  }>;
  readonly circuit: Readonly<{
    state: CircuitState;
    transition: CircuitTransitionInput;
  }>;
  readonly policy: ProviderObservabilityPolicyInput;
}

export interface ProviderObservabilityBundle {
  readonly structuredLog: ProviderStructuredLog;
  readonly metrics: readonly ProviderBoundedMetric[];
  readonly traces: readonly ProviderBoundedTrace[];
  readonly publicErrors: readonly ProviderPublicError[];
  readonly readiness: ObservabilityReadinessEvidence;
}

function boundedClassification(value: string, maximumCharacters: number): string {
  if ([...value].length > maximumCharacters) {
    throw new ProviderReadinessIntegrityError(
      "unsafe_content",
      "Observability classification exceeds the configured trace bound",
    );
  }
  const redacted = redactProviderObservabilityValue(value, {
    maximumDepth: 1,
    maximumFieldCount: 1,
    maximumValueCharacters: maximumCharacters,
  });
  if (
    typeof redacted !== "string" ||
    redacted === "[REDACTED]" ||
    redacted.length === 0 ||
    redacted !== value
  ) {
    throw new ProviderReadinessIntegrityError(
      "unsafe_content",
      "Observability attribute is unsafe",
    );
  }
  return redacted;
}

function assertAllStringFieldsBounded(value: unknown, maximumCharacters: number): void {
  if (typeof value === "string") {
    if ([...value].length > maximumCharacters) {
      throw new ProviderReadinessIntegrityError(
        "unsafe_content",
        "Observability log field exceeds policy bounds",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertAllStringFieldsBounded(entry, maximumCharacters);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value))
      assertAllStringFieldsBounded(entry, maximumCharacters);
  }
}

function createMetric(
  input: Omit<ProviderBoundedMetric, "metricFingerprint">,
): ProviderBoundedMetric {
  return signed(ProviderBoundedMetricSchema, input, "metricFingerprint");
}

function createTrace(input: Omit<ProviderBoundedTrace, "traceFingerprint">): ProviderBoundedTrace {
  return signed(ProviderBoundedTraceSchema, input, "traceFingerprint");
}

interface DerivedObservabilitySemantics {
  readonly request: ReasoningInvocationRequest;
  readonly outcomeClassification: ProviderStructuredLog["outcomeClassification"];
  readonly rateLimitStatus: ProviderStructuredLog["rateLimitStatus"];
  readonly circuitState: ProviderStructuredLog["circuitState"];
  readonly durationMilliseconds: number;
  readonly usageUnitCount: number;
  readonly costMinorUnits: number;
  readonly currencyCode: string;
  readonly errorCategory?: ProviderStructuredLog["errorCategory"];
  readonly publicError?: Readonly<{
    category: ProviderPublicError["category"];
    code: ProviderPublicError["code"];
    message: string;
  }>;
}

function deriveObservabilitySemantics(
  input: ProviderObservabilityBundleInput,
): DerivedObservabilitySemantics {
  assertExactVerifiedAuthority(input.authority);
  const request = input.authority.invocationRequest;
  if (
    verifyProductionProviderAdapterDescriptor({
      descriptor: input.adapter,
      providerCapability: input.providerCapability,
    }).status !== "valid" ||
    verifyReasoningProviderCompatibilityResult({
      compatibility: input.compatibility,
      invocationRequest: request,
      providerCapability: input.providerCapability,
    }).status !== "valid" ||
    input.compatibility.status !== "compatible" ||
    verifyAuthorizationDecisionEvidence(input.authorization).status !== "valid" ||
    verifyProviderRateAndCapacityDecision(input.rate).status !== "valid" ||
    verifyCostAndBudgetDecision(input.cost).status !== "valid" ||
    verifyCircuitState(input.circuit).status !== "valid" ||
    !sameCanonical(input.authorization.authority.deliveryAuthority, input.authority) ||
    input.authorization.authority.adapter.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.rate.decision.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.rate.decision.invocationRequestFingerprint !== request.requestFingerprint ||
    input.rate.evaluation.adapter.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.rate.evaluation.invocationRequest.requestFingerprint !== request.requestFingerprint ||
    input.cost.decision.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.cost.decision.invocationRequestFingerprint !== request.requestFingerprint ||
    input.cost.evaluation.adapter.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.cost.evaluation.invocationRequest.requestFingerprint !== request.requestFingerprint ||
    input.cost.evaluation.providerCapability.descriptorFingerprint !==
      input.providerCapability.descriptorFingerprint ||
    input.circuit.state.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.circuit.transition.adapter.adapterFingerprint !== input.adapter.adapterFingerprint ||
    input.rate.decision.evaluatedAt !== input.evaluatedAt ||
    input.cost.decision.evaluatedAt !== input.evaluatedAt ||
    input.circuit.state.evaluatedAt !== input.evaluatedAt ||
    (input.adapter.state === "disabled" && input.circuit.state.state !== "disabled")
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Observability authorities do not verify exact shared Adapter and Invocation bindings",
    );
  }
  const authorization = enforceAuthorizationDecision({
    ...input.authorization,
    evaluatedAt: input.evaluatedAt,
  });
  let outcomeClassification: ProviderStructuredLog["outcomeClassification"] = "ready-for-dry-run";
  let errorCategory: ProviderStructuredLog["errorCategory"];
  let publicError: DerivedObservabilitySemantics["publicError"];
  if (authorization.status !== "allowed") {
    outcomeClassification = "rejected";
    errorCategory = "authorization";
    publicError = {
      category: "authorization",
      code: "provider_authorization_failed",
      message: "Provider authorization requirements were not satisfied",
    };
  } else if (input.adapter.state === "disabled" || input.circuit.state.state === "disabled") {
    outcomeClassification = "disabled-by-policy";
    errorCategory = "policy";
    publicError = {
      category: "policy",
      code: "provider_policy_rejected",
      message: "Provider readiness is disabled by policy",
    };
  } else if (input.rate.decision.outcome !== "admitted") {
    outcomeClassification = "rejected";
    errorCategory = "capacity";
    publicError = {
      category: "capacity",
      code: "provider_capacity_rejected",
      message: "Provider capacity requirements were not satisfied",
    };
  } else if (input.cost.decision.outcome !== "within-budget") {
    outcomeClassification = "rejected";
    errorCategory = "cost";
    publicError = {
      category: "cost",
      code: "provider_budget_rejected",
      message: "Provider budget requirements were not satisfied",
    };
  } else if (input.circuit.state.state === "open" || input.circuit.state.state === "quarantined") {
    outcomeClassification = "not-ready";
    errorCategory = "circuit";
    publicError = {
      category: "circuit",
      code: "provider_not_ready",
      message: "Provider circuit requirements were not satisfied",
    };
  }
  const durationMilliseconds = Date.parse(input.evaluatedAt) - Date.parse(input.startedAt);
  const usageUnitCount =
    input.cost.decision.estimatedInputUnits + input.cost.decision.estimatedOutputUnits;
  if (
    !Number.isSafeInteger(durationMilliseconds) ||
    durationMilliseconds < 0 ||
    !Number.isSafeInteger(usageUnitCount)
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Observability time or usage summary is invalid",
    );
  }
  return immutableCopy({
    request,
    outcomeClassification,
    rateLimitStatus: input.rate.decision.outcome,
    circuitState: input.circuit.state.state,
    durationMilliseconds,
    usageUnitCount,
    costMinorUnits: input.cost.decision.estimatedMaximumCostMinorUnits,
    currencyCode: input.cost.decision.currencyCode,
    ...(errorCategory === undefined ? {} : { errorCategory }),
    ...(publicError === undefined ? {} : { publicError }),
  });
}

export function createProviderObservabilityBundle(
  input: ProviderObservabilityBundleInput,
  sink?: BoundedInMemoryProviderObservabilitySink,
): ProviderObservabilityBundle {
  const captured = captureRecord(
    input,
    "Provider observability bundle input",
  ) as unknown as ProviderObservabilityBundleInput;
  requireExactKeys(
    captured as unknown as CanonicalRecord,
    [
      "schemaVersion",
      "readinessEvidenceId",
      "evaluatedAt",
      "startedAt",
      "authority",
      "adapter",
      "providerCapability",
      "compatibility",
      "authorization",
      "rate",
      "cost",
      "circuit",
      "policy",
    ],
    "Provider observability bundle input",
  );
  requireExactKeys(
    captured.policy as unknown as CanonicalRecord,
    [
      "redactionPolicyVersion",
      "maximumLogFieldCharacters",
      "maximumTraceAttributeCharacters",
      "maximumMetricLabelCount",
    ],
    "Provider observability policy",
  );
  if (
    captured.schemaVersion !== "1.0" ||
    captured.adapter.observabilityPolicyVersion !== captured.policy.redactionPolicyVersion ||
    !Number.isSafeInteger(captured.policy.maximumLogFieldCharacters) ||
    captured.policy.maximumLogFieldCharacters < 1 ||
    captured.policy.maximumLogFieldCharacters > 1_024 ||
    !Number.isSafeInteger(captured.policy.maximumTraceAttributeCharacters) ||
    captured.policy.maximumTraceAttributeCharacters < 1 ||
    captured.policy.maximumTraceAttributeCharacters > 256 ||
    !Number.isSafeInteger(captured.policy.maximumMetricLabelCount) ||
    captured.policy.maximumMetricLabelCount < 1 ||
    captured.policy.maximumMetricLabelCount > 16
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Observability authorities or bounds are invalid",
    );
  }
  const derived = deriveObservabilitySemantics(captured);
  const request = derived.request;
  const structuredLog = signed(
    ProviderStructuredLogSchema,
    {
      schemaVersion: "1.0",
      logEventId: `${captured.readinessEvidenceId}-log`,
      occurredAt: captured.evaluatedAt,
      level:
        derived.outcomeClassification === "ready-for-dry-run" ||
        derived.outcomeClassification === "succeeded"
          ? "info"
          : "error",
      eventType: "provider-readiness-evaluated",
      correlationId: request.invocationRequestId,
      deliveryTransactionId: request.deliveryTransactionId,
      adapterId: captured.adapter.adapterId,
      outcomeClassification: derived.outcomeClassification,
      durationMilliseconds: derived.durationMilliseconds,
      usageUnitCount: derived.usageUnitCount,
      costMinorUnits: derived.costMinorUnits,
      currencyCode: derived.currencyCode,
      rateLimitStatus: derived.rateLimitStatus,
      circuitState: derived.circuitState,
      retryCount: 0,
      ...(derived.errorCategory === undefined ? {} : { errorCategory: derived.errorCategory }),
    },
    "logFingerprint",
  );
  assertAllStringFieldsBounded(structuredLog, captured.policy.maximumLogFieldCharacters);
  const labelValues = {
    adapter_class: boundedClassification(
      captured.adapter.state,
      captured.policy.maximumTraceAttributeCharacters,
    ),
    circuit_state: boundedClassification(
      derived.circuitState,
      captured.policy.maximumTraceAttributeCharacters,
    ),
    outcome: boundedClassification(
      derived.outcomeClassification,
      captured.policy.maximumTraceAttributeCharacters,
    ),
  };
  const metricLabels = Object.entries(labelValues)
    .map(([name, value]) => ({
      name: name as "adapter_class" | "circuit_state" | "outcome",
      value,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (metricLabels.length > captured.policy.maximumMetricLabelCount) {
    throw new ProviderReadinessIntegrityError(
      "unsafe_content",
      "Metric label count exceeds policy",
    );
  }
  const metrics = [
    createMetric({
      schemaVersion: "1.0",
      metricId: `${captured.readinessEvidenceId}-duration-metric`,
      metricName: "provider_admission_duration_milliseconds",
      value: derived.durationMilliseconds,
      unit: "milliseconds",
      labels: metricLabels,
      observedAt: captured.evaluatedAt,
    }),
    createMetric({
      schemaVersion: "1.0",
      metricId: `${captured.readinessEvidenceId}-total-metric`,
      metricName: "provider_readiness_evaluation_total",
      value: 1,
      unit: "count",
      labels: metricLabels,
      observedAt: captured.evaluatedAt,
    }),
  ] as const;
  const traceAttributes = [
    { name: "adapter_class" as const, value: labelValues.adapter_class },
    { name: "circuit_state" as const, value: labelValues.circuit_state },
    { name: "outcome" as const, value: labelValues.outcome },
    {
      name: "rate_limit_status" as const,
      value: boundedClassification(
        derived.rateLimitStatus,
        captured.policy.maximumTraceAttributeCharacters,
      ),
    },
    ...(derived.errorCategory === undefined
      ? []
      : [
          {
            name: "error_category" as const,
            value: boundedClassification(
              derived.errorCategory,
              captured.policy.maximumTraceAttributeCharacters,
            ),
          },
        ]),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const traces = [
    createTrace({
      schemaVersion: "1.0",
      traceEvidenceId: `${captured.readinessEvidenceId}-trace-evidence`,
      traceId: `${captured.readinessEvidenceId}-trace`,
      spanId: `${captured.readinessEvidenceId}-span`,
      operation: "evaluate-provider-readiness",
      status:
        derived.outcomeClassification === "ready-for-dry-run" ||
        derived.outcomeClassification === "succeeded"
          ? "ok"
          : "error",
      startedAt: captured.startedAt,
      endedAt: captured.evaluatedAt,
      attributes: traceAttributes,
    }),
  ] as const;
  const publicErrors: readonly ProviderPublicError[] =
    derived.publicError === undefined
      ? []
      : [
          signed(
            ProviderPublicErrorSchema,
            {
              schemaVersion: "1.0",
              errorId: `${captured.readinessEvidenceId}-public-error`,
              correlationId: request.invocationRequestId,
              category: derived.publicError.category,
              code: derived.publicError.code,
              message: derived.publicError.message,
              retryable: false,
            },
            "errorFingerprint",
          ),
        ];
  const readiness = signed(
    ObservabilityReadinessEvidenceSchema,
    {
      schemaVersion: "1.0",
      readinessEvidenceId: captured.readinessEvidenceId,
      adapterId: captured.adapter.adapterId,
      adapterFingerprint: captured.adapter.adapterFingerprint,
      redactionPolicyVersion: captured.policy.redactionPolicyVersion,
      maximumLogFieldCharacters: captured.policy.maximumLogFieldCharacters,
      maximumTraceAttributeCharacters: captured.policy.maximumTraceAttributeCharacters,
      maximumMetricLabelCount: captured.policy.maximumMetricLabelCount,
      structuredLogFingerprint: structuredLog.logFingerprint,
      metricFingerprints: metrics.map((metric) => metric.metricFingerprint).sort(),
      traceFingerprints: traces.map((trace) => trace.traceFingerprint).sort(),
      publicErrorFingerprints: publicErrors.map((error) => error.errorFingerprint).sort(),
      status: "ready",
      reasonCodes: ["observability_ready"],
      evaluatedAt: captured.evaluatedAt,
    },
    "readinessFingerprint",
  );
  const bundle = immutableCopy({ structuredLog, metrics, traces, publicErrors, readiness });
  if (sink !== undefined) sink.appendBundle(bundle);
  return bundle;
}

export function verifyProviderObservabilityBundle(input: {
  readonly bundle: unknown;
  readonly input: ProviderObservabilityBundleInput;
}): { readonly status: "valid" | "invalid"; readonly reason: string | null } {
  try {
    const wrapper = captureRecord(input, "Provider observability verification input");
    const actual = wrapper.bundle as unknown as ProviderObservabilityBundle;
    const expected = createProviderObservabilityBundle(
      wrapper.input as unknown as ProviderObservabilityBundleInput,
    );
    assertSigned(ProviderStructuredLogSchema, actual.structuredLog, "logFingerprint");
    for (const metric of actual.metrics)
      assertSigned(ProviderBoundedMetricSchema, metric, "metricFingerprint");
    for (const trace of actual.traces)
      assertSigned(ProviderBoundedTraceSchema, trace, "traceFingerprint");
    for (const publicError of actual.publicErrors)
      assertSigned(ProviderPublicErrorSchema, publicError, "errorFingerprint");
    assertSigned(ObservabilityReadinessEvidenceSchema, actual.readiness, "readinessFingerprint");
    return immutableCopy(
      sameCanonical(actual, expected)
        ? { status: "valid" as const, reason: null }
        : { status: "invalid" as const, reason: "observability_binding_mismatch" },
    );
  } catch {
    return immutableCopy({ status: "invalid" as const, reason: "observability_invalid" });
  }
}
