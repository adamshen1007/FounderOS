import {
  ContextDeliveryDataClassificationSchema,
  CredentialEnvironmentClassSchema,
  ExecutionAuthorizationLimitsSchema,
  ExecutionAuthorizationDecisionSchema,
  ExecutionAuthorizationIdentifierSchema,
  ExecutionAuthorizationOperationSchema,
  ExecutionAuthorizationProcessingTierSchema,
  IsoTemporalSchema,
  ProviderReadinessLogicalReferenceSchema,
  Sha256DigestSchema,
  findDurableCanonicalJsonIssue,
  type ExecutionAuthorizationClaim,
  type ExecutionAuthorizationClaimResult,
  type ExecutionAuthorizationDecision,
  type ExecutionAuthorizationInspectionResult,
  type ExecutionAuthorizationIssuanceResult,
  type ExecutionAuthorizationLimits,
  type ExecutionAuthorizationRequest,
  type ExecutionAuthorizationRevocationResult,
  type ExecutionAuthorizationVerificationResult,
  type HumanExecutionApprovalEvidence,
  type VerifiedServiceIdentityEvidence,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import {
  createExecutionAuthorizationClaim,
  createExecutionAuthorizationDecision,
  verifyExecutionAuthorizationClaim,
  verifyExecutionAuthorizationDecision,
  verifyExecutionAuthorizationRequest,
  verifyHumanExecutionApprovalEvidence,
  verifyVerifiedServiceIdentityEvidence,
} from "../domain/execution-authorization.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";

export interface InMemoryExecutionAuthorizationAuthorityConfiguration {
  readonly schemaVersion: "1.0";
  readonly decisionAuthorityReference: string;
  readonly issuerProofReference: string;
  readonly identityIssuerReference: string;
  readonly serviceIdentityEvidenceId: string;
  readonly workloadIdentityReference: string;
  readonly serviceIdentityIssuerProofReference: string;
  readonly assuranceProfileReference: string;
  readonly audienceReference: string;
  readonly approvalAuthorityReference: string;
  readonly revocationAuthorityReference: string;
  readonly subjectReference: string;
  readonly consumerId: string;
  readonly consumerDescriptorFingerprint: string;
  readonly deliveryTransactionId: string;
  readonly deliveryTransactionFingerprint: string;
  readonly contextPackageId: string;
  readonly contextPackageFingerprint: string;
  readonly invocationRequestId: string;
  readonly invocationRequestFingerprint: string;
  readonly executionAttemptId: string;
  readonly executionAttemptFingerprint: string;
  readonly environmentClass: "development" | "evaluation" | "production" | "staging" | "test";
  readonly operation: "founder-decision-memo";
  readonly processingTier: "default";
  readonly providerFamilyReference: string;
  readonly adapterId: string;
  readonly adapterFingerprint: string;
  readonly modelPolicyReference: string;
  readonly modelPolicyFingerprint: string;
  readonly executionInstructionProfileReference: string;
  readonly executionInstructionProfileFingerprint: string;
  readonly credentialReferenceId: string;
  readonly credentialReferenceFingerprint: string;
  readonly credentialRotationVersion: string;
  readonly maximumDataClassification: "public" | "internal" | "confidential" | "restricted";
  readonly maximumLimits: ExecutionAuthorizationLimits;
  readonly maximumDecisionTtlMilliseconds: number;
}

export interface IssueExecutionAuthorizationDecisionInput {
  readonly schemaVersion: "1.0";
  readonly authorizationDecisionId: string;
  readonly authorizationRequest: ExecutionAuthorizationRequest;
  readonly serviceIdentityEvidence: VerifiedServiceIdentityEvidence;
  readonly humanApprovalEvidence: HumanExecutionApprovalEvidence;
  readonly evaluatedAt: string;
  readonly expiresAt: string;
}

export interface ClaimExecutionAuthorizationDecisionInput {
  readonly schemaVersion: "1.0";
  readonly authorizationClaimId: string;
  readonly authorizationDecision: ExecutionAuthorizationDecision;
  readonly executionAttemptId: string;
  readonly executionAttemptFingerprint: string;
  readonly claimedAt: string;
  readonly idempotentRetry: boolean;
}

export interface InspectExecutionAuthorizationDecisionInput {
  readonly schemaVersion: "1.0";
  readonly authorizationDecisionId: string;
}

export interface RevokeExecutionAuthorizationDecisionInput {
  readonly schemaVersion: "1.0";
  readonly authorizationDecisionId: string;
  readonly revocationAuthorityReference: string;
  readonly revocationVersion: number;
  readonly revokedAt: string;
}

export interface VerifyRegisteredExecutionAuthorizationDecisionInput {
  readonly schemaVersion: "1.0";
  readonly authorizationDecision: ExecutionAuthorizationDecision;
  readonly evaluatedAt: string;
}

export interface VerifyRegisteredExecutionAuthorizationClaimInput {
  readonly schemaVersion: "1.0";
  readonly authorizationDecision: ExecutionAuthorizationDecision;
  readonly authorizationClaim: ExecutionAuthorizationClaim;
  readonly evaluatedAt: string;
}

export interface InMemoryExecutionAuthorizationAuthority {
  readonly issueDecision: (
    input: IssueExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationIssuanceResult;
  readonly claimDecision: (
    input: ClaimExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationClaimResult;
  readonly inspectDecision: (
    input: InspectExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationInspectionResult;
  readonly revokeDecision: (
    input: RevokeExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationRevocationResult;
  readonly verifyDecision: (
    input: VerifyRegisteredExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationVerificationResult;
  readonly verifyClaim: (
    input: VerifyRegisteredExecutionAuthorizationClaimInput,
  ) => ExecutionAuthorizationVerificationResult;
}

interface DecisionRegistryEntry {
  readonly issuanceFingerprint: string;
  readonly decision: ExecutionAuthorizationDecision;
  claim: ExecutionAuthorizationClaim | null;
  revocationVersion: number;
  revokedAt: string | null;
}

const CONFIGURATION_KEYS = [
  "schemaVersion",
  "decisionAuthorityReference",
  "issuerProofReference",
  "identityIssuerReference",
  "serviceIdentityEvidenceId",
  "workloadIdentityReference",
  "serviceIdentityIssuerProofReference",
  "assuranceProfileReference",
  "audienceReference",
  "approvalAuthorityReference",
  "revocationAuthorityReference",
  "subjectReference",
  "consumerId",
  "consumerDescriptorFingerprint",
  "deliveryTransactionId",
  "deliveryTransactionFingerprint",
  "contextPackageId",
  "contextPackageFingerprint",
  "invocationRequestId",
  "invocationRequestFingerprint",
  "executionAttemptId",
  "executionAttemptFingerprint",
  "environmentClass",
  "operation",
  "processingTier",
  "providerFamilyReference",
  "adapterId",
  "adapterFingerprint",
  "modelPolicyReference",
  "modelPolicyFingerprint",
  "executionInstructionProfileReference",
  "executionInstructionProfileFingerprint",
  "credentialReferenceId",
  "credentialReferenceFingerprint",
  "credentialRotationVersion",
  "maximumDataClassification",
  "maximumLimits",
  "maximumDecisionTtlMilliseconds",
] as const;
const ISSUE_KEYS = [
  "schemaVersion",
  "authorizationDecisionId",
  "authorizationRequest",
  "serviceIdentityEvidence",
  "humanApprovalEvidence",
  "evaluatedAt",
  "expiresAt",
] as const;
const CLAIM_KEYS = [
  "schemaVersion",
  "authorizationClaimId",
  "authorizationDecision",
  "executionAttemptId",
  "executionAttemptFingerprint",
  "claimedAt",
  "idempotentRetry",
] as const;
const INSPECT_KEYS = ["schemaVersion", "authorizationDecisionId"] as const;
const REVOKE_KEYS = [
  "schemaVersion",
  "authorizationDecisionId",
  "revocationAuthorityReference",
  "revocationVersion",
  "revokedAt",
] as const;
const VERIFY_DECISION_KEYS = ["schemaVersion", "authorizationDecision", "evaluatedAt"] as const;
const VERIFY_CLAIM_KEYS = [
  "schemaVersion",
  "authorizationDecision",
  "authorizationClaim",
  "evaluatedAt",
] as const;
const CLASSIFICATION_RANK = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
});

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

function invalid(
  reasonCode:
    | "authorization_expired"
    | "authorization_not_active"
    | "authorization_revoked"
    | "internal_authority_integrity_failure"
    | "non_authoritative_artifact",
): ExecutionAuthorizationVerificationResult {
  return immutableCopy({ status: "invalid", reasonCodes: [reasonCode] });
}

function rejected<
  ReasonCode extends
    | "already_claimed"
    | "attempt_mismatch"
    | "authorization_expired"
    | "authorization_not_active"
    | "authorization_not_claimable"
    | "authorization_revoked"
    | "conflicting_identity"
    | "internal_authority_integrity_failure"
    | "invalid_input"
    | "non_authoritative_artifact"
    | "not_found"
    | "stale_revocation_version",
>(reasonCode: ReasonCode): { status: "rejected"; reasonCodes: ReasonCode[] } {
  return immutableCopy({ status: "rejected", reasonCodes: [reasonCode] });
}

const INTERNAL_REJECTED_RESULT = deepFreeze({
  status: "rejected" as const,
  reasonCodes: ["internal_authority_integrity_failure" as const],
});
const INTERNAL_INVALID_RESULT = deepFreeze({
  status: "invalid" as const,
  reasonCodes: ["internal_authority_integrity_failure" as const],
});
const INTERNAL_INSPECTION_RESULT = deepFreeze({
  status: "rejected" as const,
  reasonCodes: ["internal_authority_integrity_failure"] as ["internal_authority_integrity_failure"],
});

function internalRejected<Result>(): Result {
  return INTERNAL_REJECTED_RESULT as Result;
}

function internalInvalid(): ExecutionAuthorizationVerificationResult {
  return INTERNAL_INVALID_RESULT;
}

function internalInspection(): ExecutionAuthorizationInspectionResult {
  return INTERNAL_INSPECTION_RESULT;
}

function temporal(value: unknown): value is string {
  return IsoTemporalSchema.safeParse(value).success;
}

function fingerprintIssueInput(input: IssueExecutionAuthorizationDecisionInput): string {
  return serializeDurableCanonicalJsonValue(input);
}

function withinLimits(
  actual: ExecutionAuthorizationLimits,
  maximum: ExecutionAuthorizationLimits,
): boolean {
  return (
    actual.currencyCode === maximum.currencyCode &&
    actual.maximumInputBytes <= maximum.maximumInputBytes &&
    actual.maximumOutputBytes <= maximum.maximumOutputBytes &&
    actual.maximumInputTokens <= maximum.maximumInputTokens &&
    actual.maximumOutputTokens <= maximum.maximumOutputTokens &&
    actual.timeoutMilliseconds <= maximum.timeoutMilliseconds &&
    actual.maximumAttempts <= maximum.maximumAttempts &&
    actual.maximumRequestsPerMinute <= maximum.maximumRequestsPerMinute &&
    actual.maximumConcurrentRequests <= maximum.maximumConcurrentRequests &&
    actual.maximumCostMinorUnits <= maximum.maximumCostMinorUnits
  );
}

function validateConfiguration(
  value: unknown,
): InMemoryExecutionAuthorizationAuthorityConfiguration {
  const descriptors = captureExactOwnEnumerableDataDescriptors(value, CONFIGURATION_KEYS);
  if (descriptors === null || findDurableCanonicalJsonIssue(value) !== null) {
    throw new TypeError("Execution authorization authority configuration is invalid");
  }
  const configuration = Object.fromEntries(
    CONFIGURATION_KEYS.map((key) => [key, descriptors[key].value]),
  ) as unknown as InMemoryExecutionAuthorizationAuthorityConfiguration;
  const valid =
    configuration.schemaVersion === "1.0" &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.decisionAuthorityReference)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.issuerProofReference).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.identityIssuerReference)
      .success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.serviceIdentityEvidenceId)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.workloadIdentityReference)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(
      configuration.serviceIdentityIssuerProofReference,
    ).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.assuranceProfileReference)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.audienceReference).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.approvalAuthorityReference)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.revocationAuthorityReference)
      .success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.subjectReference).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.consumerId).success &&
    Sha256DigestSchema.safeParse(configuration.consumerDescriptorFingerprint).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.deliveryTransactionId).success &&
    Sha256DigestSchema.safeParse(configuration.deliveryTransactionFingerprint).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.contextPackageId).success &&
    Sha256DigestSchema.safeParse(configuration.contextPackageFingerprint).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.invocationRequestId).success &&
    Sha256DigestSchema.safeParse(configuration.invocationRequestFingerprint).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.executionAttemptId).success &&
    Sha256DigestSchema.safeParse(configuration.executionAttemptFingerprint).success &&
    CredentialEnvironmentClassSchema.safeParse(configuration.environmentClass).success &&
    ExecutionAuthorizationOperationSchema.safeParse(configuration.operation).success &&
    ExecutionAuthorizationProcessingTierSchema.safeParse(configuration.processingTier).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.providerFamilyReference)
      .success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.adapterId).success &&
    Sha256DigestSchema.safeParse(configuration.adapterFingerprint).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.modelPolicyReference).success &&
    Sha256DigestSchema.safeParse(configuration.modelPolicyFingerprint).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(
      configuration.executionInstructionProfileReference,
    ).success &&
    Sha256DigestSchema.safeParse(configuration.executionInstructionProfileFingerprint).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(configuration.credentialReferenceId).success &&
    Sha256DigestSchema.safeParse(configuration.credentialReferenceFingerprint).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(configuration.credentialRotationVersion)
      .success &&
    ContextDeliveryDataClassificationSchema.safeParse(configuration.maximumDataClassification)
      .success &&
    Number.isSafeInteger(configuration.maximumDecisionTtlMilliseconds) &&
    configuration.maximumDecisionTtlMilliseconds > 0;
  if (
    !valid ||
    !ExecutionAuthorizationLimitsSchema.safeParse(configuration.maximumLimits).success
  ) {
    throw new TypeError("Execution authorization authority configuration is invalid");
  }
  return immutableCopy(configuration);
}

export function createInMemoryExecutionAuthorizationAuthority(
  input: InMemoryExecutionAuthorizationAuthorityConfiguration,
): InMemoryExecutionAuthorizationAuthority {
  const configuration = validateConfiguration(input);
  const decisions = new Map<string, DecisionRegistryEntry>();
  const requestIdentities = new Map<
    string,
    { readonly fingerprint: string; readonly decisionId: string }
  >();
  const attemptIdentities = new Map<
    string,
    { readonly fingerprint: string; readonly requestId: string }
  >();
  const claimIdentities = new Map<string, string>();
  let claimSequence = 0;

  const unsafeAuthority: InMemoryExecutionAuthorizationAuthority = {
    issueDecision(rawInput: IssueExecutionAuthorizationDecisionInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, ISSUE_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return rejected("invalid_input");
      }
      const issue = Object.fromEntries(
        ISSUE_KEYS.map((key) => [key, descriptors[key].value]),
      ) as unknown as IssueExecutionAuthorizationDecisionInput;
      if (
        issue.schemaVersion !== "1.0" ||
        !ExecutionAuthorizationIdentifierSchema.safeParse(issue.authorizationDecisionId).success ||
        !temporal(issue.evaluatedAt) ||
        !temporal(issue.expiresAt) ||
        verifyExecutionAuthorizationRequest(issue.authorizationRequest).status !== "valid" ||
        verifyVerifiedServiceIdentityEvidence(issue.serviceIdentityEvidence).status !== "valid" ||
        verifyHumanExecutionApprovalEvidence(issue.humanApprovalEvidence).status !== "valid"
      ) {
        return rejected("non_authoritative_artifact");
      }
      const issuanceFingerprint = fingerprintIssueInput(issue);
      const existingDecision = decisions.get(issue.authorizationDecisionId);
      const existingRequest = requestIdentities.get(
        issue.authorizationRequest.authorizationRequestId,
      );
      if (existingDecision !== undefined || existingRequest !== undefined) {
        if (
          existingDecision !== undefined &&
          existingRequest?.decisionId === issue.authorizationDecisionId &&
          existingDecision.issuanceFingerprint === issuanceFingerprint
        ) {
          return immutableCopy({ status: "issued", decision: existingDecision.decision });
        }
        return rejected("conflicting_identity");
      }
      const existingAttempt = attemptIdentities.get(issue.authorizationRequest.executionAttemptId);
      if (
        existingAttempt !== undefined &&
        (existingAttempt.fingerprint !== issue.authorizationRequest.executionAttemptFingerprint ||
          existingAttempt.requestId !== issue.authorizationRequest.authorizationRequestId)
      ) {
        return rejected("conflicting_identity");
      }
      if (
        Date.parse(issue.expiresAt) <= Date.parse(issue.evaluatedAt) ||
        Date.parse(issue.expiresAt) - Date.parse(issue.evaluatedAt) >
          configuration.maximumDecisionTtlMilliseconds
      ) {
        return rejected("invalid_input");
      }

      const reasons = new Set<string>();
      const request = issue.authorizationRequest;
      const identity = issue.serviceIdentityEvidence;
      const approval = issue.humanApprovalEvidence;
      if (
        identity.issuerReference !== configuration.identityIssuerReference ||
        identity.serviceIdentityEvidenceId !== configuration.serviceIdentityEvidenceId ||
        identity.workloadIdentityReference !== configuration.workloadIdentityReference ||
        identity.issuerProofReference !== configuration.serviceIdentityIssuerProofReference ||
        identity.assuranceProfileReference !== configuration.assuranceProfileReference ||
        identity.audienceReference !== configuration.audienceReference ||
        identity.subjectReference !== request.subjectReference ||
        identity.environmentClass !== configuration.environmentClass
      )
        reasons.add("identity_binding_mismatch");
      if (request.subjectReference !== configuration.subjectReference) {
        reasons.add("identity_binding_mismatch");
      }
      if (
        request.consumerId !== configuration.consumerId ||
        request.consumerDescriptorFingerprint !== configuration.consumerDescriptorFingerprint
      ) {
        reasons.add("consumer_binding_mismatch");
      }
      if (
        request.deliveryTransactionId !== configuration.deliveryTransactionId ||
        request.deliveryTransactionFingerprint !== configuration.deliveryTransactionFingerprint
      ) {
        reasons.add("delivery_binding_mismatch");
      }
      if (
        request.contextPackageId !== configuration.contextPackageId ||
        request.contextPackageFingerprint !== configuration.contextPackageFingerprint
      ) {
        reasons.add("context_binding_mismatch");
      }
      if (
        request.invocationRequestId !== configuration.invocationRequestId ||
        request.invocationRequestFingerprint !== configuration.invocationRequestFingerprint
      ) {
        reasons.add("invocation_binding_mismatch");
      }
      if (
        request.executionAttemptId !== configuration.executionAttemptId ||
        request.executionAttemptFingerprint !== configuration.executionAttemptFingerprint
      ) {
        reasons.add("execution_attempt_binding_mismatch");
      }
      if (identity.revocationState === "revoked") reasons.add("service_identity_revoked");
      if (Date.parse(issue.evaluatedAt) < Date.parse(identity.notBefore)) {
        reasons.add("service_identity_not_active");
      }
      if (Date.parse(issue.evaluatedAt) >= Date.parse(identity.expiresAt)) {
        reasons.add("service_identity_expired");
      }
      if (
        approval.approvalAuthorityReference !== configuration.approvalAuthorityReference ||
        approval.authorizationRequestId !== request.authorizationRequestId ||
        approval.authorizationRequestFingerprint !== request.requestFingerprint ||
        approval.purpose !== request.purpose ||
        approval.operation !== request.operation ||
        approval.environmentClass !== request.environmentClass ||
        !sameCanonical(approval.approvedLimits, request.limits) ||
        CLASSIFICATION_RANK[approval.maximumDataClassification] <
          CLASSIFICATION_RANK[request.dataClassification]
      )
        reasons.add("approval_binding_mismatch");
      if (Date.parse(issue.evaluatedAt) >= Date.parse(approval.expiresAt)) {
        reasons.add("human_approval_expired");
      }
      if (Date.parse(issue.evaluatedAt) < Date.parse(approval.issuedAt)) {
        reasons.add("human_approval_invalid");
      }
      if (Date.parse(issue.evaluatedAt) < Date.parse(request.requestedAt)) {
        reasons.add("invocation_binding_mismatch");
      }
      if (request.environmentClass !== configuration.environmentClass) {
        reasons.add("environment_binding_mismatch");
      }
      if (request.operation !== configuration.operation) reasons.add("operation_binding_mismatch");
      if (request.processingTier !== configuration.processingTier) {
        reasons.add("processing_tier_binding_mismatch");
      }
      if (request.providerFamilyReference !== configuration.providerFamilyReference) {
        reasons.add("provider_family_binding_mismatch");
      }
      if (
        request.adapterId !== configuration.adapterId ||
        request.adapterFingerprint !== configuration.adapterFingerprint
      )
        reasons.add("adapter_binding_mismatch");
      if (
        request.modelPolicyReference !== configuration.modelPolicyReference ||
        request.modelPolicyFingerprint !== configuration.modelPolicyFingerprint
      )
        reasons.add("model_policy_binding_mismatch");
      if (
        request.executionInstructionProfileReference !==
          configuration.executionInstructionProfileReference ||
        request.executionInstructionProfileFingerprint !==
          configuration.executionInstructionProfileFingerprint
      )
        reasons.add("execution_instruction_profile_binding_mismatch");
      if (
        request.credentialReferenceId !== configuration.credentialReferenceId ||
        request.credentialReferenceFingerprint !== configuration.credentialReferenceFingerprint ||
        request.credentialRotationVersion !== configuration.credentialRotationVersion
      )
        reasons.add("credential_reference_binding_mismatch");
      if (
        CLASSIFICATION_RANK[request.dataClassification] >
        CLASSIFICATION_RANK[configuration.maximumDataClassification]
      )
        reasons.add("data_classification_rejected");
      if (!withinLimits(request.limits, configuration.maximumLimits)) {
        reasons.add("limit_binding_mismatch");
      }

      let outcome: "allowed" | "denied" | "review-required";
      if (approval.outcome === "review-required") {
        outcome = reasons.size === 0 ? "review-required" : "denied";
        reasons.add("human_approval_review_required");
      } else if (approval.outcome === "denied") {
        outcome = "denied";
        reasons.add("human_approval_denied");
      } else {
        outcome = reasons.size > 0 ? "denied" : "allowed";
      }
      if (
        outcome === "allowed" &&
        (Date.parse(issue.expiresAt) > Date.parse(identity.expiresAt) ||
          Date.parse(issue.expiresAt) > Date.parse(approval.expiresAt))
      ) {
        return rejected("invalid_input");
      }
      reasons.add(
        outcome === "allowed"
          ? "execution_authorization_allowed"
          : outcome === "denied"
            ? "execution_authorization_denied"
            : "execution_authorization_review_required",
      );
      const decision = createExecutionAuthorizationDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issue.authorizationDecisionId,
        decisionAuthorityReference: configuration.decisionAuthorityReference,
        serviceIdentityEvidenceId: identity.serviceIdentityEvidenceId,
        serviceIdentityEvidenceFingerprint: identity.evidenceFingerprint,
        humanApprovalEvidenceId: approval.approvalEvidenceId,
        humanApprovalEvidenceFingerprint: approval.evidenceFingerprint,
        authorizationRequest: request,
        outcome,
        state: outcome === "allowed" ? "allowed-unclaimed" : "not-claimable",
        reasonCodes: [...reasons].sort() as never,
        issuedAt: issue.evaluatedAt,
        expiresAt: issue.expiresAt,
        revocationVersion: 0,
        issuerProofReference: configuration.issuerProofReference,
      });
      const entry: DecisionRegistryEntry = {
        issuanceFingerprint,
        decision,
        claim: null,
        revocationVersion: 0,
        revokedAt: null,
      };
      const result = immutableCopy({ status: "issued" as const, decision });
      decisions.set(decision.authorizationDecisionId, entry);
      requestIdentities.set(request.authorizationRequestId, {
        fingerprint: request.requestFingerprint,
        decisionId: decision.authorizationDecisionId,
      });
      attemptIdentities.set(request.executionAttemptId, {
        fingerprint: request.executionAttemptFingerprint,
        requestId: request.authorizationRequestId,
      });
      return result;
    },

    claimDecision(rawInput: ClaimExecutionAuthorizationDecisionInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, CLAIM_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return rejected("invalid_input");
      }
      const claimInput = Object.fromEntries(
        CLAIM_KEYS.map((key) => [key, descriptors[key].value]),
      ) as unknown as ClaimExecutionAuthorizationDecisionInput;
      if (
        claimInput.schemaVersion !== "1.0" ||
        !ExecutionAuthorizationIdentifierSchema.safeParse(claimInput.authorizationClaimId)
          .success ||
        !ExecutionAuthorizationIdentifierSchema.safeParse(claimInput.executionAttemptId).success ||
        !Sha256DigestSchema.safeParse(claimInput.executionAttemptFingerprint).success ||
        !temporal(claimInput.claimedAt) ||
        typeof claimInput.idempotentRetry !== "boolean" ||
        verifyExecutionAuthorizationDecision(claimInput.authorizationDecision).status !== "valid"
      )
        return rejected("non_authoritative_artifact");
      const decision = claimInput.authorizationDecision;
      const reservedClaimDecisionId = claimIdentities.get(claimInput.authorizationClaimId);
      if (reservedClaimDecisionId !== undefined) {
        const ownerEntry = decisions.get(reservedClaimDecisionId);
        const registeredClaim = ownerEntry?.claim ?? null;
        const exactRegisteredCoordinates =
          ownerEntry !== undefined &&
          registeredClaim !== null &&
          sameCanonical(ownerEntry.decision, decision) &&
          registeredClaim.authorizationClaimId === claimInput.authorizationClaimId &&
          registeredClaim.executionAttemptId === claimInput.executionAttemptId &&
          registeredClaim.executionAttemptFingerprint === claimInput.executionAttemptFingerprint &&
          registeredClaim.claimedAt === claimInput.claimedAt;
        if (exactRegisteredCoordinates && claimInput.idempotentRetry && registeredClaim !== null) {
          return immutableCopy({ status: "claimed", claim: registeredClaim });
        }
        return rejected(exactRegisteredCoordinates ? "already_claimed" : "conflicting_identity");
      }
      const entry = decisions.get(decision.authorizationDecisionId);
      if (entry === undefined || !sameCanonical(entry.decision, decision)) {
        return rejected("non_authoritative_artifact");
      }
      const request = decision.authorizationRequest;
      if (
        claimInput.executionAttemptId !== request.executionAttemptId ||
        claimInput.executionAttemptFingerprint !== request.executionAttemptFingerprint
      )
        return rejected("attempt_mismatch");
      if (entry.claim !== null) return rejected("already_claimed");
      if (decision.outcome !== "allowed" || decision.state !== "allowed-unclaimed") {
        return rejected("authorization_not_claimable");
      }
      if (entry.revocationVersion > 0) return rejected("authorization_revoked");
      if (Date.parse(claimInput.claimedAt) < Date.parse(decision.issuedAt)) {
        return rejected("authorization_not_active");
      }
      if (Date.parse(claimInput.claimedAt) >= Date.parse(decision.expiresAt)) {
        return rejected("authorization_expired");
      }
      const nextClaimSequence = claimSequence + 1;
      const claim = createExecutionAuthorizationClaim({
        schemaVersion: "1.0",
        authorizationClaimId: claimInput.authorizationClaimId,
        authorizationDecisionId: decision.authorizationDecisionId,
        decisionFingerprint: decision.decisionFingerprint,
        executionAttemptId: claimInput.executionAttemptId,
        executionAttemptFingerprint: claimInput.executionAttemptFingerprint,
        state: "claimed-by-exact-attempt",
        claimedAt: claimInput.claimedAt,
        claimSequence: nextClaimSequence,
        decisionAuthorityReference: configuration.decisionAuthorityReference,
      });
      const result = immutableCopy({ status: "claimed" as const, claim });
      claimIdentities.set(claim.authorizationClaimId, decision.authorizationDecisionId);
      claimSequence = nextClaimSequence;
      entry.claim = claim;
      return result;
    },

    inspectDecision(rawInput: InspectExecutionAuthorizationDecisionInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, INSPECT_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return immutableCopy({ status: "not-found", reasonCode: "not_found" });
      }
      const schemaVersion = descriptors.schemaVersion.value;
      const decisionId = descriptors.authorizationDecisionId.value;
      if (
        schemaVersion !== "1.0" ||
        !ExecutionAuthorizationIdentifierSchema.safeParse(decisionId).success
      )
        return immutableCopy({ status: "not-found", reasonCode: "not_found" });
      const entry = decisions.get(decisionId as string);
      if (entry === undefined)
        return immutableCopy({ status: "not-found", reasonCode: "not_found" });
      return immutableCopy({
        status: "found",
        decision: entry.decision,
        claim: entry.claim,
        currentRevocationVersion: entry.revocationVersion,
        revoked: entry.revocationVersion > 0,
      });
    },

    revokeDecision(rawInput: RevokeExecutionAuthorizationDecisionInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, REVOKE_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return rejected("invalid_input");
      }
      const decisionId = descriptors.authorizationDecisionId.value;
      const version = descriptors.revocationVersion.value;
      const revocationAuthorityReference = descriptors.revocationAuthorityReference.value;
      const revokedAt = descriptors.revokedAt.value;
      if (
        descriptors.schemaVersion.value !== "1.0" ||
        !ExecutionAuthorizationIdentifierSchema.safeParse(decisionId).success ||
        !Number.isSafeInteger(version) ||
        (version as number) <= 0 ||
        !temporal(revokedAt)
      )
        return rejected("invalid_input");
      if (revocationAuthorityReference !== configuration.revocationAuthorityReference) {
        return rejected("non_authoritative_artifact");
      }
      const entry = decisions.get(decisionId as string);
      if (entry === undefined) return rejected("not_found");
      if (Date.parse(revokedAt) < Date.parse(entry.decision.issuedAt)) {
        return rejected("invalid_input");
      }
      if ((version as number) <= entry.revocationVersion) {
        return rejected("stale_revocation_version");
      }
      if (
        (entry.revokedAt !== null && Date.parse(revokedAt) < Date.parse(entry.revokedAt)) ||
        (entry.claim !== null && Date.parse(revokedAt) < Date.parse(entry.claim.claimedAt))
      ) {
        return rejected("invalid_input");
      }
      const result = immutableCopy({
        status: "revoked",
        authorizationDecisionId: decisionId,
        revocationVersion: version,
        revokedAt,
      }) as ExecutionAuthorizationRevocationResult;
      entry.revocationVersion = version as number;
      entry.revokedAt = revokedAt;
      return result;
    },

    verifyDecision(rawInput: VerifyRegisteredExecutionAuthorizationDecisionInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, VERIFY_DECISION_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return invalid("non_authoritative_artifact");
      }
      const decision = descriptors.authorizationDecision.value;
      const evaluatedAt = descriptors.evaluatedAt.value;
      if (
        descriptors.schemaVersion.value !== "1.0" ||
        !temporal(evaluatedAt) ||
        verifyExecutionAuthorizationDecision(decision).status !== "valid"
      )
        return invalid("non_authoritative_artifact");
      const parsed = ExecutionAuthorizationDecisionSchema.parse(decision);
      const entry = decisions.get(parsed.authorizationDecisionId);
      if (entry === undefined || !sameCanonical(entry.decision, parsed)) {
        return invalid("non_authoritative_artifact");
      }
      if (entry.revocationVersion > 0) return invalid("authorization_revoked");
      if (Date.parse(evaluatedAt) < Date.parse(parsed.issuedAt)) {
        return invalid("authorization_not_active");
      }
      if (Date.parse(evaluatedAt) >= Date.parse(parsed.expiresAt)) {
        return invalid("authorization_expired");
      }
      return immutableCopy({ status: "valid" });
    },

    verifyClaim(rawInput: VerifyRegisteredExecutionAuthorizationClaimInput) {
      const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, VERIFY_CLAIM_KEYS);
      if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
        return invalid("non_authoritative_artifact");
      }
      const decision = descriptors.authorizationDecision.value;
      const claim = descriptors.authorizationClaim.value;
      const evaluatedAt = descriptors.evaluatedAt.value;
      if (
        descriptors.schemaVersion.value !== "1.0" ||
        !temporal(evaluatedAt) ||
        verifyExecutionAuthorizationDecision(decision).status !== "valid" ||
        verifyExecutionAuthorizationClaim(claim).status !== "valid"
      )
        return invalid("non_authoritative_artifact");
      const parsedDecision = ExecutionAuthorizationDecisionSchema.parse(decision);
      const entry = decisions.get(parsedDecision.authorizationDecisionId);
      if (
        entry === undefined ||
        entry.claim === null ||
        !sameCanonical(entry.decision, parsedDecision) ||
        !sameCanonical(entry.claim, claim)
      )
        return invalid("non_authoritative_artifact");
      if (entry.revocationVersion > 0) return invalid("authorization_revoked");
      if (Date.parse(evaluatedAt) < Date.parse(entry.claim.claimedAt)) {
        return invalid("authorization_not_active");
      }
      if (Date.parse(evaluatedAt) < Date.parse(parsedDecision.issuedAt)) {
        return invalid("authorization_not_active");
      }
      if (Date.parse(evaluatedAt) >= Date.parse(parsedDecision.expiresAt)) {
        return invalid("authorization_expired");
      }
      return immutableCopy({ status: "valid" });
    },
  };

  const authority: InMemoryExecutionAuthorizationAuthority = {
    issueDecision(input) {
      try {
        return unsafeAuthority.issueDecision(input);
      } catch {
        return internalRejected<ExecutionAuthorizationIssuanceResult>();
      }
    },
    claimDecision(input) {
      try {
        return unsafeAuthority.claimDecision(input);
      } catch {
        return internalRejected<ExecutionAuthorizationClaimResult>();
      }
    },
    inspectDecision(input) {
      try {
        return unsafeAuthority.inspectDecision(input);
      } catch {
        return internalInspection();
      }
    },
    revokeDecision(input) {
      try {
        return unsafeAuthority.revokeDecision(input);
      } catch {
        return internalRejected<ExecutionAuthorizationRevocationResult>();
      }
    },
    verifyDecision(input) {
      try {
        return unsafeAuthority.verifyDecision(input);
      } catch {
        return internalInvalid();
      }
    },
    verifyClaim(input) {
      try {
        return unsafeAuthority.verifyClaim(input);
      } catch {
        return internalInvalid();
      }
    },
  };

  return Object.freeze(authority);
}
