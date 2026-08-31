import { z } from "zod";

import { ExecutionAuthorizationIdentifierSchema } from "./authorization.js";
import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import {
  CredentialEnvironmentClassSchema,
  ProviderReadinessLogicalReferenceSchema,
} from "./provider-readiness.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";

const PositiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const NonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const BoundedTextSchema = z.string().min(1).max(200_000);

export const M19ContractVersionSchema = z.literal("1.0");
export const M19PreparationTaxonomyIdSchema = z.literal("M19-preparation-taxonomy-v1");
export const M16ErrorTaxonomyIdSchema = z.literal("M16-error-taxonomy-v1");

export const M19PreparationFailureReasonCodeSchema = z.enum([
  "invalid_input",
  "conflicting_preparation_identity",
  "authorization_non_authoritative",
  "readiness_non_authoritative",
  "model_policy_invalid",
  "instruction_profile_invalid",
  "prompt_cache_policy_invalid",
  "coordinate_mismatch",
  "authority_expired",
  "current_control_rejected",
  "request_plan_invalid",
  "credential_resolution_rejected",
  "credential_resolution_non_authoritative",
  "disabled_policy_invalid",
  "internal_integrity_failure",
]);

export const M16ErrorTaxonomyCodeSchema = z.enum([
  "provider-refused",
  "provider-rate-limited",
  "provider-unavailable",
  "request-timeout-not-sent",
  "request-timeout-ambiguous",
  "cancelled-before-send",
  "cancelled-after-send-ambiguous",
  "provider-response-invalid",
  "provider-response-oversized",
  "provider-output-prohibited",
  "provider-usage-invalid",
]);

const AuthorityCoordinates = {
  preparationId: ExecutionAuthorizationIdentifierSchema,
  executionAttemptId: ExecutionAuthorizationIdentifierSchema,
  executionAttemptFingerprint: Sha256DigestSchema,
  authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
  authorizationDecisionFingerprint: Sha256DigestSchema,
  authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
  authorizationClaimFingerprint: Sha256DigestSchema,
  adapterId: ExecutionAuthorizationIdentifierSchema,
  adapterFingerprint: Sha256DigestSchema,
  providerFamilyReference: z.literal("provider-family/openai"),
  environmentClass: CredentialEnvironmentClassSchema,
  operation: z.literal("founder-decision-memo"),
} as const;

export const M19PolicyAuthorityEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      providerFamilyReference: z.literal("provider-family/openai"),
      environmentClass: CredentialEnvironmentClassSchema,
      operation: z.literal("founder-decision-memo"),
      pricingEvidenceId: ExecutionAuthorizationIdentifierSchema,
      pricingEvidenceFingerprint: Sha256DigestSchema,
      pricingReviewedAt: IsoTemporalSchema,
      pricingExpiresAt: IsoTemporalSchema,
      privacyPolicyFingerprint: Sha256DigestSchema,
      privacyReviewedAt: IsoTemporalSchema,
      privacyExpiresAt: IsoTemporalSchema,
      providerRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      providerRetentionEvidenceFingerprint: Sha256DigestSchema,
      providerRetentionReviewedAt: IsoTemporalSchema,
      providerRetentionExpiresAt: IsoTemporalSchema,
      accountRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      accountRetentionEvidenceFingerprint: Sha256DigestSchema,
      accountRetentionReviewedAt: IsoTemporalSchema,
      accountRetentionExpiresAt: IsoTemporalSchema,
      operationFingerprint: Sha256DigestSchema,
      cachePolicyReviewedAt: IsoTemporalSchema,
      cachePolicyExpiresAt: IsoTemporalSchema,
      cacheEvidenceReference: ProviderReadinessLogicalReferenceSchema,
      issuerReference: ProviderReadinessLogicalReferenceSchema,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const temporalPairs = [
        [value.pricingReviewedAt, value.pricingExpiresAt, "pricingExpiresAt"],
        [value.privacyReviewedAt, value.privacyExpiresAt, "privacyExpiresAt"],
        [
          value.providerRetentionReviewedAt,
          value.providerRetentionExpiresAt,
          "providerRetentionExpiresAt",
        ],
        [
          value.accountRetentionReviewedAt,
          value.accountRetentionExpiresAt,
          "accountRetentionExpiresAt",
        ],
        [value.cachePolicyReviewedAt, value.cachePolicyExpiresAt, "cachePolicyExpiresAt"],
      ] as const;
      for (const [reviewedAt, expiresAt, path] of temporalPairs) {
        if (Date.parse(expiresAt) <= Date.parse(reviewedAt)) {
          context.addIssue({
            code: "custom",
            message: "Policy evidence expiration must follow review time",
            path: [path],
          });
        }
      }
    }),
);

export const M19ReadinessAuthorityEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      ...AuthorityCoordinates,
      readinessTransactionId: ExecutionAuthorizationIdentifierSchema,
      readinessTransactionFingerprint: Sha256DigestSchema,
      m14DecisionId: ExecutionAuthorizationIdentifierSchema,
      m14DecisionFingerprint: Sha256DigestSchema,
      m14RequestPlanId: ExecutionAuthorizationIdentifierSchema,
      m14RequestPlanFingerprint: Sha256DigestSchema,
      m14ProviderCapabilityFingerprint: Sha256DigestSchema,
      m14CompatibilityFingerprint: Sha256DigestSchema,
      m14RateCapacityFingerprint: Sha256DigestSchema,
      m14CostBudgetFingerprint: Sha256DigestSchema,
      m14TransportPolicyFingerprint: Sha256DigestSchema,
      privacyPolicyFingerprint: Sha256DigestSchema,
      m14PricingEvidenceId: ExecutionAuthorizationIdentifierSchema,
      m14PricingEvidenceFingerprint: Sha256DigestSchema,
      providerRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      providerRetentionEvidenceFingerprint: Sha256DigestSchema,
      policyAuthorityEvidenceFingerprint: Sha256DigestSchema,
      pricingReviewedAt: IsoTemporalSchema,
      pricingExpiresAt: IsoTemporalSchema,
      privacyReviewedAt: IsoTemporalSchema,
      privacyExpiresAt: IsoTemporalSchema,
      providerRetentionReviewedAt: IsoTemporalSchema,
      providerRetentionExpiresAt: IsoTemporalSchema,
      accountRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      accountRetentionEvidenceFingerprint: Sha256DigestSchema,
      accountRetentionReviewedAt: IsoTemporalSchema,
      accountRetentionExpiresAt: IsoTemporalSchema,
      operationFingerprint: Sha256DigestSchema,
      cachePolicyReviewedAt: IsoTemporalSchema,
      cachePolicyExpiresAt: IsoTemporalSchema,
      cacheEvidenceReference: ProviderReadinessLogicalReferenceSchema,
      m14DecisionStatus: z.literal("ready-for-dry-run"),
      adapterState: z.literal("dry-run-mapping"),
      maximumRequestBytes: PositiveSafeIntegerSchema,
      maximumResponseBytes: PositiveSafeIntegerSchema,
      maximumInputCharacters: PositiveSafeIntegerSchema,
      maximumOutputCharacters: PositiveSafeIntegerSchema,
      evaluatedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      issuerReference: ProviderReadinessLogicalReferenceSchema,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

const AllowedControlSchema = z.literal("allowed");

export const M19CurrentControlSnapshotSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      ...AuthorityCoordinates,
      readinessTransactionId: ExecutionAuthorizationIdentifierSchema,
      readinessTransactionFingerprint: Sha256DigestSchema,
      m14DecisionId: ExecutionAuthorizationIdentifierSchema,
      m14DecisionFingerprint: Sha256DigestSchema,
      modelId: ProviderReadinessLogicalReferenceSchema,
      rateCapacity: AllowedControlSchema,
      costBudget: AllowedControlSchema,
      privacy: AllowedControlSchema,
      retention: AllowedControlSchema,
      observability: AllowedControlSchema,
      circuit: z.literal("closed"),
      health: z.literal("available"),
      incident: z.literal("inactive"),
      killSwitches: z
        .object({
          global: AllowedControlSchema,
          provider: AllowedControlSchema,
          adapter: AllowedControlSchema,
          model: AllowedControlSchema,
          environment: AllowedControlSchema,
          operation: AllowedControlSchema,
        })
        .strict(),
      evaluatedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      issuerReference: ProviderReadinessLogicalReferenceSchema,
      snapshotFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const OpenAIModelPolicySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      policyId: ExecutionAuthorizationIdentifierSchema,
      policyVersion: ProviderReadinessLogicalReferenceSchema,
      issuerReference: ProviderReadinessLogicalReferenceSchema,
      issuedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      providerFamilyReference: z.literal("provider-family/openai"),
      apiFamily: z.literal("responses"),
      operation: z.literal("founder-decision-memo"),
      modelId: ProviderReadinessLogicalReferenceSchema,
      serviceTier: z.literal("default"),
      maxOutputTokens: PositiveSafeIntegerSchema,
      m14ProviderCapabilityFingerprint: Sha256DigestSchema,
      m14CompatibilityFingerprint: Sha256DigestSchema,
      m14RateCapacityFingerprint: Sha256DigestSchema,
      m14CostBudgetFingerprint: Sha256DigestSchema,
      m14TransportPolicyFingerprint: Sha256DigestSchema,
      privacyPolicyFingerprint: Sha256DigestSchema,
      m14ReadinessDecisionFingerprint: Sha256DigestSchema,
      pricingEvidenceId: ExecutionAuthorizationIdentifierSchema,
      pricingEvidenceFingerprint: Sha256DigestSchema,
      pricingReviewedAt: IsoTemporalSchema,
      pricingExpiresAt: IsoTemporalSchema,
      providerRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      providerRetentionEvidenceFingerprint: Sha256DigestSchema,
      providerRetentionReviewedAt: IsoTemporalSchema,
      providerRetentionExpiresAt: IsoTemporalSchema,
      accountRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      accountRetentionEvidenceFingerprint: Sha256DigestSchema,
      accountRetentionReviewedAt: IsoTemporalSchema,
      accountRetentionExpiresAt: IsoTemporalSchema,
      promptCachePolicyId: ExecutionAuthorizationIdentifierSchema,
      state: z.literal("approved-for-disabled-mapping"),
      policyFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const temporalPairs = [
        [value.issuedAt, value.expiresAt, "expiresAt"],
        [value.pricingReviewedAt, value.pricingExpiresAt, "pricingExpiresAt"],
        [
          value.providerRetentionReviewedAt,
          value.providerRetentionExpiresAt,
          "providerRetentionExpiresAt",
        ],
        [
          value.accountRetentionReviewedAt,
          value.accountRetentionExpiresAt,
          "accountRetentionExpiresAt",
        ],
      ] as const;
      for (const [reviewedAt, expiresAt, path] of temporalPairs) {
        if (Date.parse(expiresAt) <= Date.parse(reviewedAt)) {
          context.addIssue({
            code: "custom",
            message: "Authority expiration must follow issuance or review time",
            path: [path],
          });
        }
      }
    }),
);

export const OpenAIPromptCachePolicySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      policyId: ExecutionAuthorizationIdentifierSchema,
      policyVersion: ProviderReadinessLogicalReferenceSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      modelPolicyId: ExecutionAuthorizationIdentifierSchema,
      modelPolicyFingerprint: Sha256DigestSchema,
      transportPolicyFingerprint: Sha256DigestSchema,
      privacyPolicyFingerprint: Sha256DigestSchema,
      operationFingerprint: Sha256DigestSchema,
      providerRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      providerRetentionEvidenceFingerprint: Sha256DigestSchema,
      accountRetentionEvidenceId: ExecutionAuthorizationIdentifierSchema,
      accountRetentionEvidenceFingerprint: Sha256DigestSchema,
      privacyReviewedAt: IsoTemporalSchema,
      privacyExpiresAt: IsoTemporalSchema,
      providerRetentionReviewedAt: IsoTemporalSchema,
      providerRetentionExpiresAt: IsoTemporalSchema,
      accountRetentionReviewedAt: IsoTemporalSchema,
      accountRetentionExpiresAt: IsoTemporalSchema,
      operation: z.literal("founder-decision-memo"),
      posture: z.literal("provider-managed-no-caller-controls"),
      reviewedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      evidenceReference: ProviderReadinessLogicalReferenceSchema,
      policyFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const temporalPairs = [
        [value.reviewedAt, value.expiresAt, "expiresAt"],
        [value.privacyReviewedAt, value.privacyExpiresAt, "privacyExpiresAt"],
        [
          value.providerRetentionReviewedAt,
          value.providerRetentionExpiresAt,
          "providerRetentionExpiresAt",
        ],
        [
          value.accountRetentionReviewedAt,
          value.accountRetentionExpiresAt,
          "accountRetentionExpiresAt",
        ],
      ] as const;
      for (const [reviewedAt, expiresAt, path] of temporalPairs) {
        if (Date.parse(expiresAt) <= Date.parse(reviewedAt)) {
          context.addIssue({
            code: "custom",
            message: "Cache-policy expiration must follow review time",
            path: [path],
          });
        }
      }
    }),
);

export const FounderDecisionMemoInstructionProfileSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      profileId: z.literal("founder-decision-memo-instructions-v1"),
      serialization: z.literal("founderos-canonical-json-v1"),
      instructionBlocks: z.tuple([BoundedTextSchema, BoundedTextSchema, BoundedTextSchema]),
      sectionNames: z.tuple([
        z.literal("Decision question"),
        z.literal("Executive summary"),
        z.literal("Options considered"),
        z.literal("Recommendation"),
        z.literal("Evidence references"),
        z.literal("Assumptions and uncertainties"),
        z.literal("Risks"),
        z.literal("Proposed next action"),
      ]),
      profileFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const FounderDecisionMemoContextEntrySchema = z
  .object({
    objectId: ExecutionAuthorizationIdentifierSchema,
    objectType: ProviderReadinessLogicalReferenceSchema,
    canonicalContent: BoundedTextSchema,
    includedContentFingerprint: Sha256DigestSchema,
    evidenceReference: ProviderReadinessLogicalReferenceSchema,
  })
  .strict();

export const FounderDecisionMemoInputProjectionSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      question: BoundedTextSchema,
      deliveryTransactionId: ExecutionAuthorizationIdentifierSchema,
      deliveryTransactionFingerprint: Sha256DigestSchema,
      invocationRequestId: ExecutionAuthorizationIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      contextPackageId: ExecutionAuthorizationIdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      contextEntries: z.array(FounderDecisionMemoContextEntrySchema).min(1).max(1_000),
      instructionCharacterCount: NonNegativeSafeIntegerSchema,
      instructionUtf8ByteCount: NonNegativeSafeIntegerSchema,
      inputCharacterCount: PositiveSafeIntegerSchema,
      inputUtf8ByteCount: PositiveSafeIntegerSchema,
      authorizedInputUtf8ByteCount: PositiveSafeIntegerSchema,
      projectionFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const M19DisabledAdapterPolicySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      policyId: ExecutionAuthorizationIdentifierSchema,
      policyVersion: ProviderReadinessLogicalReferenceSchema,
      state: z.literal("disabled"),
      terminalResult: z.literal("disabled-by-policy"),
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      readinessTransactionFingerprint: Sha256DigestSchema,
      m14DecisionFingerprint: Sha256DigestSchema,
      modelPolicyFingerprint: Sha256DigestSchema,
      instructionProfileFingerprint: Sha256DigestSchema,
      promptCachePolicyFingerprint: Sha256DigestSchema,
      requestMappingProfileFingerprint: Sha256DigestSchema,
      responseMappingProfileFingerprint: Sha256DigestSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      operation: z.literal("founder-decision-memo"),
      policyFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const OpenAIResponsesProviderProjectionSchema = z
  .object({
    background: z.literal(false),
    input: BoundedTextSchema,
    instructions: BoundedTextSchema,
    max_output_tokens: PositiveSafeIntegerSchema,
    model: ProviderReadinessLogicalReferenceSchema,
    service_tier: z.literal("default"),
    store: z.literal(false),
    stream: z.literal(false),
    tools: z.tuple([]),
    truncation: z.literal("disabled"),
  })
  .strict();

export const OpenAIResponsesRequestPlanSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      requestPlanId: ExecutionAuthorizationIdentifierSchema,
      preparationId: ExecutionAuthorizationIdentifierSchema,
      executionAttemptId: ExecutionAuthorizationIdentifierSchema,
      executionAttemptFingerprint: Sha256DigestSchema,
      authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
      authorizationDecisionFingerprint: Sha256DigestSchema,
      authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
      authorizationClaimFingerprint: Sha256DigestSchema,
      deliveryTransactionId: ExecutionAuthorizationIdentifierSchema,
      deliveryTransactionFingerprint: Sha256DigestSchema,
      contextPackageId: ExecutionAuthorizationIdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      invocationRequestId: ExecutionAuthorizationIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      providerFamilyReference: z.literal("provider-family/openai"),
      environmentClass: CredentialEnvironmentClassSchema,
      operation: z.literal("founder-decision-memo"),
      m14RequestPlanId: ExecutionAuthorizationIdentifierSchema,
      m14RequestPlanFingerprint: Sha256DigestSchema,
      readinessEvidenceFingerprint: Sha256DigestSchema,
      currentControlSnapshotFingerprint: Sha256DigestSchema,
      modelPolicyFingerprint: Sha256DigestSchema,
      modelPolicyId: ExecutionAuthorizationIdentifierSchema,
      modelPolicyVersion: ProviderReadinessLogicalReferenceSchema,
      instructionProfileFingerprint: Sha256DigestSchema,
      instructionProfileId: z.literal("founder-decision-memo-instructions-v1"),
      inputProjectionFingerprint: Sha256DigestSchema,
      promptCachePolicyFingerprint: Sha256DigestSchema,
      promptCachePolicyId: ExecutionAuthorizationIdentifierSchema,
      promptCachePolicyVersion: ProviderReadinessLogicalReferenceSchema,
      disabledPolicyFingerprint: Sha256DigestSchema,
      disabledPolicyId: ExecutionAuthorizationIdentifierSchema,
      disabledPolicyVersion: ProviderReadinessLogicalReferenceSchema,
      evaluatedAt: IsoTemporalSchema,
      method: z.literal("POST"),
      scheme: z.literal("https"),
      hostname: z.literal("api.openai.com"),
      port: z.literal(443),
      path: z.literal("/v1/responses"),
      providerProjection: OpenAIResponsesProviderProjectionSchema,
      maximumInputCharacters: PositiveSafeIntegerSchema,
      maximumOutputCharacters: PositiveSafeIntegerSchema,
      maximumInputBytes: PositiveSafeIntegerSchema,
      maximumRequestBytes: PositiveSafeIntegerSchema,
      maximumResponseBytesM14: PositiveSafeIntegerSchema,
      maximumOutputBytesM17: PositiveSafeIntegerSchema,
      effectiveMaximumOutputBytes: PositiveSafeIntegerSchema,
      maximumInputTokens: PositiveSafeIntegerSchema,
      maximumOutputTokens: PositiveSafeIntegerSchema,
      instructionCharacterCount: NonNegativeSafeIntegerSchema,
      instructionUtf8ByteCount: NonNegativeSafeIntegerSchema,
      inputCharacterCount: PositiveSafeIntegerSchema,
      inputUtf8ByteCount: PositiveSafeIntegerSchema,
      authorizedInputUtf8ByteCount: PositiveSafeIntegerSchema,
      providerBodyUtf8ByteCount: PositiveSafeIntegerSchema,
      promptCachePosture: z.literal("provider-managed-no-caller-controls"),
      requestPlanFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const OpenAIResponsesFixtureEventSchema = z.enum([
  "completed",
  "refused",
  "rate-limited",
  "unavailable",
  "timeout-before-acceptance",
  "timeout-ambiguous",
  "cancelled-before-send",
  "cancelled-ambiguous",
  "partial",
]);

export const OpenAIResponsesFixtureOutputItemSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      role: z.literal("assistant"),
      text: z.string().max(200_000),
    })
    .strict(),
  z.object({ type: z.literal("refusal"), text: z.string().max(20_000) }).strict(),
  z
    .object({
      type: z.enum(["tool", "function", "reasoning", "file", "image", "audio", "unknown"]),
    })
    .strict(),
]);

export const OpenAIResponsesFixtureEnvelopeSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      fixtureId: ExecutionAuthorizationIdentifierSchema,
      fixtureFingerprint: Sha256DigestSchema,
      event: OpenAIResponsesFixtureEventSchema,
      model: ProviderReadinessLogicalReferenceSchema,
      serviceTier: z.literal("default"),
      outputItems: z.array(OpenAIResponsesFixtureOutputItemSchema).max(16),
      inputTokens: z.number().int().max(Number.MAX_SAFE_INTEGER),
      outputTokens: z.number().int().max(Number.MAX_SAFE_INTEGER),
      providerRequestReference: ProviderReadinessLogicalReferenceSchema.optional(),
    })
    .strict(),
);

export const OpenAIResponsesMappingEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: M19ContractVersionSchema,
      fixtureId: ExecutionAuthorizationIdentifierSchema,
      fixtureFingerprint: Sha256DigestSchema,
      requestPlanId: ExecutionAuthorizationIdentifierSchema,
      requestPlanFingerprint: Sha256DigestSchema,
      executionAttemptId: ExecutionAuthorizationIdentifierSchema,
      model: ProviderReadinessLogicalReferenceSchema,
      serviceTier: z.literal("default"),
      category: z.union([z.literal("mapped-success"), M16ErrorTaxonomyCodeSchema]),
      inputTokens: NonNegativeSafeIntegerSchema,
      outputTokens: NonNegativeSafeIntegerSchema,
      advisoryMemoFingerprint: Sha256DigestSchema.optional(),
      mappingProfileVersion: z.literal("openai-responses-fixture-mapping-v1"),
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const M19PreparationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("in-flight"),
        reason: z.literal("preparation_in_progress"),
      })
      .strict(),
    z
      .object({
        status: z.literal("rejected"),
        taxonomyId: M19PreparationTaxonomyIdSchema,
        reasonCode: M19PreparationFailureReasonCodeSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("disabled-by-policy"),
        preparationId: ExecutionAuthorizationIdentifierSchema,
        requestPlanId: ExecutionAuthorizationIdentifierSchema,
        requestPlanFingerprint: Sha256DigestSchema,
        credentialResolutionEvidenceFingerprint: Sha256DigestSchema,
        disabledPolicyFingerprint: Sha256DigestSchema,
        adapterId: ExecutionAuthorizationIdentifierSchema,
        adapterFingerprint: Sha256DigestSchema,
        operation: z.literal("founder-decision-memo"),
        disabledPolicyVersion: ProviderReadinessLogicalReferenceSchema,
        evaluatedAt: IsoTemporalSchema,
      })
      .strict(),
  ]),
);

export const M19ArtifactVerificationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("valid") }).strict(),
  z
    .object({
      status: z.literal("invalid"),
      reasonCode: z.literal("non_authoritative_artifact"),
    })
    .strict(),
]);

export type M19PreparationFailureReasonCode = z.infer<typeof M19PreparationFailureReasonCodeSchema>;
export type M16ErrorTaxonomyCode = z.infer<typeof M16ErrorTaxonomyCodeSchema>;
export type M19ReadinessAuthorityEvidence = z.infer<typeof M19ReadinessAuthorityEvidenceSchema>;
export type M19PolicyAuthorityEvidence = z.infer<typeof M19PolicyAuthorityEvidenceSchema>;
export type M19CurrentControlSnapshot = z.infer<typeof M19CurrentControlSnapshotSchema>;
export type OpenAIModelPolicy = z.infer<typeof OpenAIModelPolicySchema>;
export type OpenAIPromptCachePolicy = z.infer<typeof OpenAIPromptCachePolicySchema>;
export type FounderDecisionMemoInstructionProfile = z.infer<
  typeof FounderDecisionMemoInstructionProfileSchema
>;
export type FounderDecisionMemoInputProjection = z.infer<
  typeof FounderDecisionMemoInputProjectionSchema
>;
export type M19DisabledAdapterPolicy = z.infer<typeof M19DisabledAdapterPolicySchema>;
export type OpenAIResponsesProviderProjection = z.infer<
  typeof OpenAIResponsesProviderProjectionSchema
>;
export type OpenAIResponsesRequestPlan = z.infer<typeof OpenAIResponsesRequestPlanSchema>;
export type OpenAIResponsesFixtureEnvelope = z.infer<typeof OpenAIResponsesFixtureEnvelopeSchema>;
export type OpenAIResponsesFixtureOutputItem = z.infer<
  typeof OpenAIResponsesFixtureOutputItemSchema
>;
export type OpenAIResponsesMappingEvidence = z.infer<typeof OpenAIResponsesMappingEvidenceSchema>;
export type M19PreparationResult = z.infer<typeof M19PreparationResultSchema>;
export type M19ArtifactVerificationResult = z.infer<typeof M19ArtifactVerificationResultSchema>;
