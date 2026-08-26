import { z } from "zod";

import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import { ContextDeliveryDataClassificationSchema } from "./delivery.js";
import {
  CredentialEnvironmentClassSchema,
  ProviderReadinessIdentifierSchema,
  ProviderReadinessLogicalReferenceSchema,
  ProviderReadinessNonEmptySafeTextSchema,
  ProviderReadinessSafeTextSchema,
} from "./provider-readiness.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const PositiveSafeIntegerSchema = z.number().int().positive().max(MAX_SAFE_INTEGER);
const NonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(MAX_SAFE_INTEGER);
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/u, "Expected an ISO 4217 currency code");

function compareTemporal(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function requireSortedUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  path: readonly (number | string)[],
): void {
  const expected = [...new Set(values)].sort();
  if (
    expected.length !== values.length ||
    expected.some((entry, index) => entry !== values[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "Expected sorted unique reason codes",
      path: [...path],
    });
  }
}

export const ExecutionAuthorizationContractVersionSchema = z.literal("1.0");
export const ExecutionAuthorizationOperationSchema = z.literal("founder-decision-memo");
export const ExecutionAuthorizationProcessingTierSchema = z.literal("default");
const EXECUTION_AUTHORIZATION_URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;
const EXECUTION_AUTHORIZATION_KNOWN_CREDENTIAL_VALUE_PATTERN =
  /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|xapp-[A-Za-z0-9-]+)/u;
const EXECUTION_AUTHORIZATION_CREDENTIAL_MATERIAL_PATTERN =
  /(?:^|[._:-])(?:(?:api[._-]?key|access[._-]?token|credential|password|private[._-]?key|secret|token)[._:-]+(?:bytes|content|material|raw|value)|(?:bytes|content|material|raw|value)[._:-]+(?:api[._-]?key|access[._-]?token|credential|password|private[._-]?key|secret|token))(?:$|[._:-])/iu;
export const ExecutionAuthorizationIdentifierSchema = ProviderReadinessIdentifierSchema.pipe(
  ProviderReadinessSafeTextSchema,
)
  .refine(
    (value) => !EXECUTION_AUTHORIZATION_URI_SCHEME_PATTERN.test(value),
    "Execution authorization identifiers cannot use URI-scheme syntax",
  )
  .refine(
    (value) => !EXECUTION_AUTHORIZATION_KNOWN_CREDENTIAL_VALUE_PATTERN.test(value),
    "Execution authorization identifiers cannot contain known credential value formats",
  )
  .refine(
    (value) => !EXECUTION_AUTHORIZATION_CREDENTIAL_MATERIAL_PATTERN.test(value),
    "Execution authorization identifiers cannot describe credential material",
  );
export const ExecutionAuthorizationOutcomeSchema = z.enum(["allowed", "denied", "review-required"]);
export const ExecutionAuthorizationDecisionStateSchema = z.enum([
  "allowed-unclaimed",
  "not-claimable",
]);
export const ExecutionAuthorizationClaimStateSchema = z.literal("claimed-by-exact-attempt");

export const ExecutionAuthorizationLimitsSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      maximumInputBytes: PositiveSafeIntegerSchema,
      maximumOutputBytes: PositiveSafeIntegerSchema,
      maximumInputTokens: PositiveSafeIntegerSchema,
      maximumOutputTokens: PositiveSafeIntegerSchema,
      timeoutMilliseconds: PositiveSafeIntegerSchema,
      maximumAttempts: PositiveSafeIntegerSchema,
      maximumRequestsPerMinute: PositiveSafeIntegerSchema,
      maximumConcurrentRequests: PositiveSafeIntegerSchema,
      maximumCostMinorUnits: PositiveSafeIntegerSchema,
      currencyCode: CurrencyCodeSchema,
    })
    .strict(),
);

export const ServiceIdentityRevocationStateSchema = z.enum(["active", "revoked"]);
export const VerifiedServiceIdentityEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ExecutionAuthorizationContractVersionSchema,
      serviceIdentityEvidenceId: ExecutionAuthorizationIdentifierSchema,
      subjectReference: ProviderReadinessLogicalReferenceSchema,
      workloadIdentityReference: ProviderReadinessLogicalReferenceSchema,
      issuerReference: ProviderReadinessLogicalReferenceSchema,
      assuranceProfileReference: ProviderReadinessLogicalReferenceSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      audienceReference: ProviderReadinessLogicalReferenceSchema,
      issuedAt: IsoTemporalSchema,
      notBefore: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      revocationVersion: NonNegativeSafeIntegerSchema,
      revocationState: ServiceIdentityRevocationStateSchema,
      issuerProofReference: ProviderReadinessLogicalReferenceSchema,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.notBefore, value.issuedAt) < 0) {
        context.addIssue({
          code: "custom",
          message: "Service Identity not-before time cannot precede issuance",
          path: ["notBefore"],
        });
      }
      if (compareTemporal(value.expiresAt, value.notBefore) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Service Identity expiration must follow its not-before time",
          path: ["expiresAt"],
        });
      }
      if (
        (value.revocationState === "active" && value.revocationVersion !== 0) ||
        (value.revocationState === "revoked" && value.revocationVersion === 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Service Identity revocation state and version must agree",
          path: ["revocationVersion"],
        });
      }
    }),
);

export const HumanExecutionApprovalReasonCodeSchema = z.enum([
  "human_approval_allowed",
  "human_approval_denied",
  "human_approval_review_required",
]);
const HUMAN_APPROVAL_REASON = {
  allowed: "human_approval_allowed",
  denied: "human_approval_denied",
  "review-required": "human_approval_review_required",
} as const;

export const HumanExecutionApprovalEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ExecutionAuthorizationContractVersionSchema,
      approvalEvidenceId: ExecutionAuthorizationIdentifierSchema,
      approverReference: ProviderReadinessLogicalReferenceSchema,
      approvalAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      authorizationRequestId: ExecutionAuthorizationIdentifierSchema,
      authorizationRequestFingerprint: Sha256DigestSchema,
      purpose: ProviderReadinessNonEmptySafeTextSchema,
      operation: ExecutionAuthorizationOperationSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      maximumDataClassification: ContextDeliveryDataClassificationSchema,
      approvedLimits: ExecutionAuthorizationLimitsSchema,
      issuedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      outcome: ExecutionAuthorizationOutcomeSchema,
      reasonCodes: z
        .array(HumanExecutionApprovalReasonCodeSchema)
        .min(1)
        .max(HumanExecutionApprovalReasonCodeSchema.options.length),
      proofReference: ProviderReadinessLogicalReferenceSchema,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.expiresAt, value.issuedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Human Approval expiration must follow issuance",
          path: ["expiresAt"],
        });
      }
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]);
      if (
        value.reasonCodes.length !== 1 ||
        value.reasonCodes[0] !== HUMAN_APPROVAL_REASON[value.outcome]
      ) {
        context.addIssue({
          code: "custom",
          message: "Human Approval outcome requires its exact reason code",
          path: ["reasonCodes"],
        });
      }
    }),
);

export const ExecutionAuthorizationRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ExecutionAuthorizationContractVersionSchema,
      authorizationRequestId: ExecutionAuthorizationIdentifierSchema,
      executionAttemptId: ExecutionAuthorizationIdentifierSchema,
      executionAttemptFingerprint: Sha256DigestSchema,
      subjectReference: ProviderReadinessLogicalReferenceSchema,
      consumerId: ExecutionAuthorizationIdentifierSchema,
      consumerDescriptorFingerprint: Sha256DigestSchema,
      deliveryTransactionId: ExecutionAuthorizationIdentifierSchema,
      deliveryTransactionFingerprint: Sha256DigestSchema,
      contextPackageId: ExecutionAuthorizationIdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      invocationRequestId: ExecutionAuthorizationIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      operation: ExecutionAuthorizationOperationSchema,
      processingTier: ExecutionAuthorizationProcessingTierSchema,
      modelPolicyReference: ProviderReadinessLogicalReferenceSchema,
      modelPolicyFingerprint: Sha256DigestSchema,
      executionInstructionProfileReference: ProviderReadinessLogicalReferenceSchema,
      executionInstructionProfileFingerprint: Sha256DigestSchema,
      credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
      credentialReferenceFingerprint: Sha256DigestSchema,
      credentialRotationVersion: ProviderReadinessLogicalReferenceSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      dataClassification: ContextDeliveryDataClassificationSchema,
      purpose: ProviderReadinessNonEmptySafeTextSchema,
      limits: ExecutionAuthorizationLimitsSchema,
      requestedAt: IsoTemporalSchema,
      requestFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ExecutionAuthorizationDecisionReasonCodeSchema = z.enum([
  "adapter_binding_mismatch",
  "approval_binding_mismatch",
  "consumer_binding_mismatch",
  "context_binding_mismatch",
  "credential_reference_binding_mismatch",
  "data_classification_rejected",
  "delivery_binding_mismatch",
  "environment_binding_mismatch",
  "execution_authorization_allowed",
  "execution_authorization_denied",
  "execution_authorization_review_required",
  "execution_instruction_profile_binding_mismatch",
  "execution_attempt_binding_mismatch",
  "human_approval_expired",
  "human_approval_denied",
  "human_approval_invalid",
  "human_approval_review_required",
  "identity_binding_mismatch",
  "invocation_binding_mismatch",
  "limit_binding_mismatch",
  "model_policy_binding_mismatch",
  "operation_binding_mismatch",
  "processing_tier_binding_mismatch",
  "provider_family_binding_mismatch",
  "service_identity_expired",
  "service_identity_invalid",
  "service_identity_not_active",
  "service_identity_revoked",
]);
const DECISION_OUTCOME_REASON = {
  allowed: "execution_authorization_allowed",
  denied: "execution_authorization_denied",
  "review-required": "execution_authorization_review_required",
} as const;
const DECISION_OUTCOME_REASONS = new Set<string>(Object.values(DECISION_OUTCOME_REASON));

export const ExecutionAuthorizationDecisionSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ExecutionAuthorizationContractVersionSchema,
      authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
      decisionAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      serviceIdentityEvidenceId: ExecutionAuthorizationIdentifierSchema,
      serviceIdentityEvidenceFingerprint: Sha256DigestSchema,
      humanApprovalEvidenceId: ExecutionAuthorizationIdentifierSchema,
      humanApprovalEvidenceFingerprint: Sha256DigestSchema,
      authorizationRequest: ExecutionAuthorizationRequestSchema,
      outcome: ExecutionAuthorizationOutcomeSchema,
      state: ExecutionAuthorizationDecisionStateSchema,
      reasonCodes: z
        .array(ExecutionAuthorizationDecisionReasonCodeSchema)
        .min(1)
        .max(ExecutionAuthorizationDecisionReasonCodeSchema.options.length),
      issuedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      revocationVersion: NonNegativeSafeIntegerSchema,
      issuerProofReference: ProviderReadinessLogicalReferenceSchema,
      decisionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.expiresAt, value.issuedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Authorization Decision expiration must follow issuance",
          path: ["expiresAt"],
        });
      }
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]);
      const outcomeReason = DECISION_OUTCOME_REASON[value.outcome];
      const observedOutcomeReasons = value.reasonCodes.filter((reasonCode) =>
        DECISION_OUTCOME_REASONS.has(reasonCode),
      );
      if (observedOutcomeReasons.length !== 1 || observedOutcomeReasons[0] !== outcomeReason) {
        context.addIssue({
          code: "custom",
          message: "Authorization Decision requires exactly one matching outcome reason code",
          path: ["reasonCodes"],
        });
      }
      if (
        (value.outcome === "allowed") !== (value.state === "allowed-unclaimed") ||
        (value.outcome === "allowed" && value.reasonCodes.length !== 1) ||
        (value.outcome !== "allowed" && value.reasonCodes.length < 2)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Authorization Decision outcome, state, and binding or policy reasons must agree",
          path: ["state"],
        });
      }
    }),
);

export const ExecutionAuthorizationClaimSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ExecutionAuthorizationContractVersionSchema,
      authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
      authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
      decisionFingerprint: Sha256DigestSchema,
      executionAttemptId: ExecutionAuthorizationIdentifierSchema,
      executionAttemptFingerprint: Sha256DigestSchema,
      state: ExecutionAuthorizationClaimStateSchema,
      claimedAt: IsoTemporalSchema,
      claimSequence: PositiveSafeIntegerSchema,
      decisionAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      claimFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ExecutionAuthorizationOperationFailureReasonCodeSchema = z.enum([
  "already_claimed",
  "attempt_mismatch",
  "authorization_expired",
  "authorization_not_active",
  "authorization_not_claimable",
  "authorization_revoked",
  "conflicting_identity",
  "internal_authority_integrity_failure",
  "invalid_input",
  "non_authoritative_artifact",
  "not_found",
  "stale_revocation_version",
]);

export const ExecutionAuthorizationIssuanceFailureReasonCodeSchema = z.enum([
  "conflicting_identity",
  "internal_authority_integrity_failure",
  "invalid_input",
  "non_authoritative_artifact",
]);
export const ExecutionAuthorizationClaimFailureReasonCodeSchema = z.enum([
  "already_claimed",
  "attempt_mismatch",
  "authorization_expired",
  "authorization_not_active",
  "authorization_not_claimable",
  "authorization_revoked",
  "conflicting_identity",
  "internal_authority_integrity_failure",
  "invalid_input",
  "non_authoritative_artifact",
]);
export const ExecutionAuthorizationRevocationFailureReasonCodeSchema = z.enum([
  "internal_authority_integrity_failure",
  "invalid_input",
  "non_authoritative_artifact",
  "not_found",
  "stale_revocation_version",
]);
export const ExecutionAuthorizationVerificationFailureReasonCodeSchema = z.enum([
  "authorization_expired",
  "authorization_not_active",
  "authorization_revoked",
  "internal_authority_integrity_failure",
  "non_authoritative_artifact",
]);

const IssuanceFailureSchema = z
  .object({
    status: z.literal("rejected"),
    reasonCodes: z
      .array(ExecutionAuthorizationIssuanceFailureReasonCodeSchema)
      .min(1)
      .max(ExecutionAuthorizationIssuanceFailureReasonCodeSchema.options.length),
  })
  .strict()
  .superRefine((value, context) =>
    requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
  );
const ClaimFailureSchema = z
  .object({
    status: z.literal("rejected"),
    reasonCodes: z
      .array(ExecutionAuthorizationClaimFailureReasonCodeSchema)
      .min(1)
      .max(ExecutionAuthorizationClaimFailureReasonCodeSchema.options.length),
  })
  .strict()
  .superRefine((value, context) =>
    requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
  );
const RevocationFailureSchema = z
  .object({
    status: z.literal("rejected"),
    reasonCodes: z
      .array(ExecutionAuthorizationRevocationFailureReasonCodeSchema)
      .min(1)
      .max(ExecutionAuthorizationRevocationFailureReasonCodeSchema.options.length),
  })
  .strict()
  .superRefine((value, context) =>
    requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
  );

export const ExecutionAuthorizationIssuanceResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({ status: z.literal("issued"), decision: ExecutionAuthorizationDecisionSchema })
      .strict(),
    IssuanceFailureSchema,
  ]),
);

export const ExecutionAuthorizationClaimResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("claimed"), claim: ExecutionAuthorizationClaimSchema }).strict(),
    ClaimFailureSchema,
  ]),
);

const ExecutionAuthorizationInspectionFoundSchema = z
  .object({
    status: z.literal("found"),
    decision: ExecutionAuthorizationDecisionSchema,
    claim: ExecutionAuthorizationClaimSchema.nullable(),
    currentRevocationVersion: NonNegativeSafeIntegerSchema,
    revoked: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.revoked !== value.currentRevocationVersion > 0) {
      context.addIssue({
        code: "custom",
        message: "Inspection revocation flag and version must agree",
        path: ["revoked"],
      });
    }
    if (value.currentRevocationVersion < value.decision.revocationVersion) {
      context.addIssue({
        code: "custom",
        message: "Inspection cannot precede the Decision revocation version",
        path: ["currentRevocationVersion"],
      });
    }
    const claim = value.claim;
    const request = value.decision.authorizationRequest;
    if (
      claim !== null &&
      (value.decision.outcome !== "allowed" ||
        claim.authorizationDecisionId !== value.decision.authorizationDecisionId ||
        claim.decisionFingerprint !== value.decision.decisionFingerprint ||
        claim.executionAttemptId !== request.executionAttemptId ||
        claim.executionAttemptFingerprint !== request.executionAttemptFingerprint ||
        claim.decisionAuthorityReference !== value.decision.decisionAuthorityReference ||
        compareTemporal(claim.claimedAt, value.decision.issuedAt) < 0 ||
        compareTemporal(claim.claimedAt, value.decision.expiresAt) >= 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Inspection claim must bind the exact active Decision and Attempt",
        path: ["claim"],
      });
    }
  });

export const ExecutionAuthorizationInspectionResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    ExecutionAuthorizationInspectionFoundSchema,
    z.object({ status: z.literal("not-found"), reasonCode: z.literal("not_found") }).strict(),
    z
      .object({
        status: z.literal("rejected"),
        reasonCodes: z.tuple([z.literal("internal_authority_integrity_failure")]),
      })
      .strict(),
  ]),
);

export const ExecutionAuthorizationRevocationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("revoked"),
        authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
        revocationVersion: PositiveSafeIntegerSchema,
        revokedAt: IsoTemporalSchema,
      })
      .strict(),
    RevocationFailureSchema,
  ]),
);

export const ExecutionAuthorizationVerificationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("valid") }).strict(),
    z
      .object({
        status: z.literal("invalid"),
        reasonCodes: z
          .array(ExecutionAuthorizationVerificationFailureReasonCodeSchema)
          .min(1)
          .max(ExecutionAuthorizationVerificationFailureReasonCodeSchema.options.length),
      })
      .strict()
      .superRefine((value, context) =>
        requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
      ),
  ]),
);

export type ExecutionAuthorizationLimits = z.infer<typeof ExecutionAuthorizationLimitsSchema>;
export type VerifiedServiceIdentityEvidence = z.infer<typeof VerifiedServiceIdentityEvidenceSchema>;
export type HumanExecutionApprovalEvidence = z.infer<typeof HumanExecutionApprovalEvidenceSchema>;
export type ExecutionAuthorizationRequest = z.infer<typeof ExecutionAuthorizationRequestSchema>;
export type ExecutionAuthorizationDecision = z.infer<typeof ExecutionAuthorizationDecisionSchema>;
export type ExecutionAuthorizationClaim = z.infer<typeof ExecutionAuthorizationClaimSchema>;
export type ExecutionAuthorizationIssuanceResult = z.infer<
  typeof ExecutionAuthorizationIssuanceResultSchema
>;
export type ExecutionAuthorizationClaimResult = z.infer<
  typeof ExecutionAuthorizationClaimResultSchema
>;
export type ExecutionAuthorizationInspectionResult = z.infer<
  typeof ExecutionAuthorizationInspectionResultSchema
>;
export type ExecutionAuthorizationRevocationResult = z.infer<
  typeof ExecutionAuthorizationRevocationResultSchema
>;
export type ExecutionAuthorizationVerificationResult = z.infer<
  typeof ExecutionAuthorizationVerificationResultSchema
>;
