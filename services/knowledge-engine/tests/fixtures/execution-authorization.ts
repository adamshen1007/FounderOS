import {
  createExecutionAuthorizationRequest,
  createHumanExecutionApprovalEvidence,
  createVerifiedServiceIdentityEvidence,
} from "../../src/index.js";
import type { ExecutionAuthorizationLimits } from "@founderos/knowledge-schema";

export const AUTHORIZATION_FINGERPRINTS = Object.freeze({
  consumer: "1".repeat(64),
  delivery: "2".repeat(64),
  context: "3".repeat(64),
  invocation: "4".repeat(64),
  attempt: "5".repeat(64),
  adapter: "6".repeat(64),
  modelPolicy: "7".repeat(64),
  instructionProfile: "8".repeat(64),
  credentialReference: "9".repeat(64),
});
export const AUTHORIZATION_DIGEST = AUTHORIZATION_FINGERPRINTS.attempt;
export const AUTHORIZATION_EVALUATED_AT = "2026-08-23T01:00:00.000Z";

export function authorizationLimits(): ExecutionAuthorizationLimits {
  return {
    maximumInputBytes: 20_000,
    maximumOutputBytes: 40_000,
    maximumInputTokens: 4_000,
    maximumOutputTokens: 2_000,
    timeoutMilliseconds: 5_000,
    maximumAttempts: 1,
    maximumRequestsPerMinute: 10,
    maximumConcurrentRequests: 1,
    maximumCostMinorUnits: 25,
    currencyCode: "USD",
  };
}

export function authorizationAuthorityConfiguration() {
  return {
    schemaVersion: "1.0" as const,
    decisionAuthorityReference: "authorization-authority/evaluation",
    issuerProofReference: "proof/authorization-authority",
    identityIssuerReference: "identity-authority/evaluation",
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    workloadIdentityReference: "workload/founder-memo-service",
    serviceIdentityIssuerProofReference: "proof/service-identity-one",
    assuranceProfileReference: "assurance/workload-verified",
    audienceReference: "audience/founderos-authorization",
    approvalAuthorityReference: "approval-authority/founderos",
    revocationAuthorityReference: "revocation-authority/founderos",
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: AUTHORIZATION_FINGERPRINTS.consumer,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: AUTHORIZATION_FINGERPRINTS.delivery,
    contextPackageId: "context-package-one",
    contextPackageFingerprint: AUTHORIZATION_FINGERPRINTS.context,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: AUTHORIZATION_FINGERPRINTS.invocation,
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: AUTHORIZATION_FINGERPRINTS.attempt,
    environmentClass: "evaluation" as const,
    operation: "founder-decision-memo" as const,
    processingTier: "default" as const,
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    adapterFingerprint: AUTHORIZATION_FINGERPRINTS.adapter,
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: AUTHORIZATION_FINGERPRINTS.modelPolicy,
    executionInstructionProfileReference: "instruction-profile/founder-memo",
    executionInstructionProfileFingerprint: AUTHORIZATION_FINGERPRINTS.instructionProfile,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: AUTHORIZATION_FINGERPRINTS.credentialReference,
    credentialRotationVersion: "rotation-v1",
    maximumDataClassification: "internal" as const,
    maximumLimits: authorizationLimits(),
    maximumDecisionTtlMilliseconds: 20 * 60 * 1_000,
  };
}

export function createAuthorizationFixture(
  options: {
    readonly approvalOutcome?: "allowed" | "denied" | "review-required";
    readonly requestId?: string;
    readonly attemptId?: string;
  } = {},
) {
  const request = createExecutionAuthorizationRequest({
    schemaVersion: "1.0",
    authorizationRequestId: options.requestId ?? "authorization-request-one",
    executionAttemptId: options.attemptId ?? "execution-attempt-one",
    executionAttemptFingerprint: AUTHORIZATION_FINGERPRINTS.attempt,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: AUTHORIZATION_FINGERPRINTS.consumer,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: AUTHORIZATION_FINGERPRINTS.delivery,
    contextPackageId: "context-package-one",
    contextPackageFingerprint: AUTHORIZATION_FINGERPRINTS.context,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: AUTHORIZATION_FINGERPRINTS.invocation,
    adapterId: "adapter-one",
    adapterFingerprint: AUTHORIZATION_FINGERPRINTS.adapter,
    providerFamilyReference: "provider-family/openai",
    operation: "founder-decision-memo",
    processingTier: "default",
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: AUTHORIZATION_FINGERPRINTS.modelPolicy,
    executionInstructionProfileReference: "instruction-profile/founder-memo",
    executionInstructionProfileFingerprint: AUTHORIZATION_FINGERPRINTS.instructionProfile,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: AUTHORIZATION_FINGERPRINTS.credentialReference,
    credentialRotationVersion: "rotation-v1",
    environmentClass: "evaluation",
    dataClassification: "internal",
    purpose: "Create the governed founder decision memo",
    limits: authorizationLimits(),
    requestedAt: AUTHORIZATION_EVALUATED_AT,
  });
  const identity = createVerifiedServiceIdentityEvidence({
    schemaVersion: "1.0",
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    subjectReference: request.subjectReference,
    workloadIdentityReference: "workload/founder-memo-service",
    issuerReference: "identity-authority/evaluation",
    assuranceProfileReference: "assurance/workload-verified",
    environmentClass: "evaluation",
    audienceReference: "audience/founderos-authorization",
    issuedAt: "2026-08-23T00:55:00.000Z",
    notBefore: "2026-08-23T00:55:00.000Z",
    expiresAt: "2026-08-23T01:30:00.000Z",
    revocationVersion: 0,
    revocationState: "active",
    issuerProofReference: "proof/service-identity-one",
  });
  const approvalOutcome = options.approvalOutcome ?? "allowed";
  const approvalReason = {
    allowed: "human_approval_allowed",
    denied: "human_approval_denied",
    "review-required": "human_approval_review_required",
  } as const;
  const approval = createHumanExecutionApprovalEvidence({
    schemaVersion: "1.0",
    approvalEvidenceId: "human-approval-one",
    approverReference: "human-approver/founder-one",
    approvalAuthorityReference: "approval-authority/founderos",
    authorizationRequestId: request.authorizationRequestId,
    authorizationRequestFingerprint: request.requestFingerprint,
    purpose: request.purpose,
    operation: request.operation,
    environmentClass: request.environmentClass,
    maximumDataClassification: "internal",
    approvedLimits: request.limits,
    issuedAt: "2026-08-23T00:58:00.000Z",
    expiresAt: "2026-08-23T01:20:00.000Z",
    outcome: approvalOutcome,
    reasonCodes: [approvalReason[approvalOutcome]],
    proofReference: "proof/human-approval-one",
  });
  return { request, identity, approval };
}
