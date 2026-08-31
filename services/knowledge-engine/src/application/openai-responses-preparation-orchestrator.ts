import {
  CredentialResolutionRequestSchema,
  ExecutionAuthorizationIdentifierSchema,
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  IsoTemporalSchema,
  Sha256DigestSchema,
  type CredentialResolutionRequest,
  type CredentialResolutionResult,
  type ExecutionAuthorizationClaim,
  type ExecutionAuthorizationDecision,
  type FounderDecisionMemoInputProjection,
  type FounderDecisionMemoInstructionProfile,
  type M19CurrentControlSnapshot,
  type M19DisabledAdapterPolicy,
  type M19PreparationFailureReasonCode,
  type M19PreparationResult,
  type M19ReadinessAuthorityEvidence,
  type OpenAIPromptCachePolicy,
  type OpenAIModelPolicy,
  type OpenAIResponsesRequestPlan,
} from "@founderos/knowledge-schema";

import {
  verifyCredentialResolutionEvidence,
  verifyCredentialResolutionRequest,
} from "../domain/credential-resolution.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import {
  verifyFounderDecisionMemoInputProjection,
  verifyFounderDecisionMemoInstructionProfile,
  verifyM19CurrentControlSnapshot,
  verifyM19DisabledAdapterPolicy,
  verifyM19ReadinessAuthorityEvidence,
  verifyOpenAIPromptCachePolicy,
  verifyOpenAIModelPolicy,
  verifyM19TerminalResult,
  verifyOpenAIResponsesRequestPlanAgainstAuthorities,
  type OpenAIResponsesPlanAuthorityInput,
} from "../domain/openai-responses-adapter.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type { CredentialResolutionOrchestrator } from "./credential-resolution-orchestrator.js";
import type { InMemoryExecutionAuthorizationAuthority } from "./in-memory-execution-authorization-authority.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";

export interface M19AuthorityRequest {
  readonly schemaVersion: "1.0";
  readonly preparationId: string;
  readonly evaluatedAt: string;
  readonly decision: ExecutionAuthorizationDecision;
  readonly claim: ExecutionAuthorizationClaim;
}

export class M19AuthorityResolutionError extends Error {
  public readonly reasonCode: "coordinate_mismatch";

  public constructor(reasonCode: "coordinate_mismatch", message: string) {
    super(message);
    this.name = "M19AuthorityResolutionError";
    this.reasonCode = reasonCode;
  }
}

export interface M19ReadinessAuthorityPort {
  readonly resolve: (input: M19AuthorityRequest) => Promise<M19ReadinessAuthorityEvidence>;
}

export interface M19CurrentControlAuthorityPort {
  readonly evaluate: (
    input: M19AuthorityRequest & {
      readonly readiness: M19ReadinessAuthorityEvidence;
      readonly modelPolicy: OpenAIModelPolicy;
    },
  ) => Promise<M19CurrentControlSnapshot>;
}

export interface M19InputProjectionAuthorityPort {
  readonly resolve: (input: M19AuthorityRequest) => Promise<FounderDecisionMemoInputProjection>;
}

export interface OpenAIModelPolicyAuthority {
  readonly resolve: (input: M19AuthorityRequest) => OpenAIModelPolicy;
}

export interface OpenAIPromptCachePolicyAuthority {
  readonly resolve: (
    input: M19AuthorityRequest & { readonly modelPolicy: OpenAIModelPolicy },
  ) => OpenAIPromptCachePolicy;
}

export interface M19DisabledAdapterPolicyAuthority {
  readonly resolve: (
    input: M19AuthorityRequest & {
      readonly readiness: M19ReadinessAuthorityEvidence;
      readonly modelPolicy: OpenAIModelPolicy;
      readonly promptCachePolicy: OpenAIPromptCachePolicy;
      readonly instructionProfile: FounderDecisionMemoInstructionProfile;
    },
  ) => M19DisabledAdapterPolicy;
}

export interface OpenAIResponsesRequestMapperPort {
  readonly mapRequest: (input: {
    readonly schemaVersion: "1.0";
    readonly requestPlanId: string;
    readonly readiness: M19ReadinessAuthorityEvidence;
    readonly currentControls: M19CurrentControlSnapshot;
    readonly modelPolicy: OpenAIModelPolicy;
    readonly instructionProfile: FounderDecisionMemoInstructionProfile;
    readonly inputProjection: FounderDecisionMemoInputProjection;
    readonly promptCachePolicy: OpenAIPromptCachePolicy;
    readonly disabledPolicy: M19DisabledAdapterPolicy;
    readonly authorizationLimits: {
      readonly maximumInputBytes: number;
      readonly maximumOutputBytes: number;
      readonly maximumInputTokens: number;
      readonly maximumOutputTokens: number;
    };
  }) =>
    | { readonly status: "mapped"; readonly plan: OpenAIResponsesRequestPlan }
    | { readonly status: "rejected"; readonly reasonCode: "request_plan_invalid" };
}

export interface M19DisabledAdapterPort {
  readonly prepareDisabled: (input: {
    readonly requestPlan: OpenAIResponsesRequestPlan;
    readonly credentialResolutionEvidenceFingerprint: string;
    readonly disabledPolicy: M19DisabledAdapterPolicy;
  }) => M19PreparationResult;
}

export interface OpenAIResponsesPreparationConfiguration {
  readonly schemaVersion: "1.0";
  readonly authorizationAuthority: Pick<
    InMemoryExecutionAuthorizationAuthority,
    "verifyDecision" | "verifyClaim"
  >;
  readonly readinessAuthority: M19ReadinessAuthorityPort;
  readonly currentControlAuthority: M19CurrentControlAuthorityPort;
  readonly inputProjectionAuthority: M19InputProjectionAuthorityPort;
  readonly modelPolicyAuthority: OpenAIModelPolicyAuthority;
  readonly promptCachePolicyAuthority: OpenAIPromptCachePolicyAuthority;
  readonly disabledPolicyAuthority: M19DisabledAdapterPolicyAuthority;
  readonly instructionProfile: FounderDecisionMemoInstructionProfile;
  readonly requestMapper: OpenAIResponsesRequestMapperPort;
  readonly credentialResolutionOrchestrator: Pick<CredentialResolutionOrchestrator, "resolve">;
  readonly credentialResolverId: string;
  readonly requestMappingProfileFingerprint: string;
  readonly responseMappingProfileFingerprint: string;
  readonly disabledAdapter: M19DisabledAdapterPort;
}

export interface PrepareOpenAIResponsesInput {
  readonly schemaVersion: "1.0";
  readonly preparationId: string;
  readonly requestPlanId: string;
  readonly evaluatedAt: string;
  readonly credentialResolutionRequest: CredentialResolutionRequest;
  readonly decision: ExecutionAuthorizationDecision;
  readonly claim: ExecutionAuthorizationClaim;
}

export interface OpenAIResponsesPreparationOrchestrator {
  readonly prepare: (input: PrepareOpenAIResponsesInput) => Promise<M19PreparationResult>;
}

interface Reservation {
  readonly inputFingerprint: string;
  state: "in-flight" | "terminal";
  result?: M19PreparationResult;
}

const CONFIG_KEYS = [
  "schemaVersion",
  "authorizationAuthority",
  "readinessAuthority",
  "currentControlAuthority",
  "inputProjectionAuthority",
  "modelPolicyAuthority",
  "promptCachePolicyAuthority",
  "disabledPolicyAuthority",
  "instructionProfile",
  "requestMapper",
  "credentialResolutionOrchestrator",
  "credentialResolverId",
  "requestMappingProfileFingerprint",
  "responseMappingProfileFingerprint",
  "disabledAdapter",
] as const;
const INPUT_KEYS = [
  "schemaVersion",
  "preparationId",
  "requestPlanId",
  "evaluatedAt",
  "credentialResolutionRequest",
  "decision",
  "claim",
] as const;

function callable<T extends (...args: never[]) => unknown>(value: unknown, key: string): T | null {
  if (value === null || typeof value !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    typeof descriptor.value === "function"
    ? (descriptor.value as T)
    : null;
}

function rejected(reasonCode: M19PreparationFailureReasonCode): M19PreparationResult {
  return deepFreeze({
    status: "rejected",
    taxonomyId: "M19-preparation-taxonomy-v1",
    reasonCode,
  });
}

function inFlight(): M19PreparationResult {
  return deepFreeze({ status: "in-flight", reason: "preparation_in_progress" });
}

function authorityCoordinatesMatch(
  evidence: M19ReadinessAuthorityEvidence,
  input: PrepareOpenAIResponsesInput,
): boolean {
  const authorization = input.decision.authorizationRequest;
  return (
    evidence.preparationId === input.preparationId &&
    evidence.executionAttemptId === authorization.executionAttemptId &&
    evidence.executionAttemptFingerprint === authorization.executionAttemptFingerprint &&
    evidence.authorizationDecisionId === input.decision.authorizationDecisionId &&
    evidence.authorizationDecisionFingerprint === input.decision.decisionFingerprint &&
    evidence.authorizationClaimId === input.claim.authorizationClaimId &&
    evidence.authorizationClaimFingerprint === input.claim.claimFingerprint &&
    evidence.adapterId === authorization.adapterId &&
    evidence.adapterFingerprint === authorization.adapterFingerprint &&
    evidence.providerFamilyReference === authorization.providerFamilyReference &&
    evidence.environmentClass === authorization.environmentClass &&
    evidence.operation === authorization.operation &&
    evidence.evaluatedAt === input.evaluatedAt
  );
}

function controlsMatch(
  controls: M19CurrentControlSnapshot,
  readiness: M19ReadinessAuthorityEvidence,
  modelPolicy: OpenAIModelPolicy,
): boolean {
  return (
    controls.preparationId === readiness.preparationId &&
    controls.executionAttemptId === readiness.executionAttemptId &&
    controls.executionAttemptFingerprint === readiness.executionAttemptFingerprint &&
    controls.authorizationDecisionId === readiness.authorizationDecisionId &&
    controls.authorizationDecisionFingerprint === readiness.authorizationDecisionFingerprint &&
    controls.authorizationClaimId === readiness.authorizationClaimId &&
    controls.authorizationClaimFingerprint === readiness.authorizationClaimFingerprint &&
    controls.adapterId === readiness.adapterId &&
    controls.adapterFingerprint === readiness.adapterFingerprint &&
    controls.providerFamilyReference === readiness.providerFamilyReference &&
    controls.environmentClass === readiness.environmentClass &&
    controls.operation === readiness.operation &&
    controls.readinessTransactionId === readiness.readinessTransactionId &&
    controls.readinessTransactionFingerprint === readiness.readinessTransactionFingerprint &&
    controls.m14DecisionId === readiness.m14DecisionId &&
    controls.m14DecisionFingerprint === readiness.m14DecisionFingerprint &&
    controls.modelId === modelPolicy.modelId &&
    controls.evaluatedAt === readiness.evaluatedAt
  );
}

function m18EvidenceMatches(
  result: Extract<CredentialResolutionResult, { status: "resolved" }>,
  request: CredentialResolutionRequest,
  expectedResolverId: string,
  evaluatedAt: string,
): boolean {
  const evidence = result.evidence;
  return (
    evidence.resolutionRequestId === request.resolutionRequestId &&
    evidence.requestFingerprint === request.requestFingerprint &&
    evidence.authorizationDecisionId === request.authorizationDecisionId &&
    evidence.authorizationDecisionFingerprint === request.authorizationDecisionFingerprint &&
    evidence.authorizationClaimId === request.authorizationClaimId &&
    evidence.authorizationClaimFingerprint === request.authorizationClaimFingerprint &&
    evidence.executionAttemptId === request.executionAttemptId &&
    evidence.executionAttemptFingerprint === request.executionAttemptFingerprint &&
    evidence.credentialReferenceId === request.credentialReferenceId &&
    evidence.credentialReferenceFingerprint === request.credentialReferenceFingerprint &&
    evidence.rotationVersion === request.expectedRotationVersion &&
    evidence.adapterId === request.adapterId &&
    evidence.adapterFingerprint === request.adapterFingerprint &&
    evidence.providerFamilyReference === request.providerFamilyReference &&
    evidence.environmentClass === request.environmentClass &&
    evidence.operation === request.operation &&
    evidence.evaluatedAt === request.evaluatedAt &&
    evidence.evaluatedAt === evaluatedAt &&
    evidence.resolutionDeadline === request.resolutionDeadline &&
    evidence.sourceClass === "deterministic-synthetic" &&
    evidence.resolverId === expectedResolverId &&
    evidence.releaseStatus === "released"
  );
}

export function createOpenAIResponsesPreparationOrchestrator(
  configuration: OpenAIResponsesPreparationConfiguration,
): OpenAIResponsesPreparationOrchestrator {
  const descriptors = captureExactOwnEnumerableDataDescriptors(configuration, CONFIG_KEYS);
  if (descriptors === null || descriptors.schemaVersion.value !== "1.0") {
    throw new TypeError("M19 preparation configuration is invalid");
  }
  const authorizationAuthority = descriptors.authorizationAuthority.value;
  const readinessAuthority = descriptors.readinessAuthority.value;
  const currentControlAuthority = descriptors.currentControlAuthority.value;
  const inputProjectionAuthority = descriptors.inputProjectionAuthority.value;
  const modelPolicyAuthority = descriptors.modelPolicyAuthority.value;
  const promptCachePolicyAuthority = descriptors.promptCachePolicyAuthority.value;
  const disabledPolicyAuthority = descriptors.disabledPolicyAuthority.value;
  const requestMapper = descriptors.requestMapper.value;
  const credentialResolutionOrchestrator = descriptors.credentialResolutionOrchestrator.value;
  const credentialResolverId = descriptors.credentialResolverId.value;
  const requestMappingProfileFingerprint = descriptors.requestMappingProfileFingerprint.value;
  const responseMappingProfileFingerprint = descriptors.responseMappingProfileFingerprint.value;
  const disabledAdapter = descriptors.disabledAdapter.value;
  const verifyDecision = callable<
    OpenAIResponsesPreparationConfiguration["authorizationAuthority"]["verifyDecision"]
  >(authorizationAuthority, "verifyDecision");
  const verifyClaim = callable<
    OpenAIResponsesPreparationConfiguration["authorizationAuthority"]["verifyClaim"]
  >(authorizationAuthority, "verifyClaim");
  const resolveReadiness = callable<M19ReadinessAuthorityPort["resolve"]>(
    readinessAuthority,
    "resolve",
  );
  const evaluateControls = callable<M19CurrentControlAuthorityPort["evaluate"]>(
    currentControlAuthority,
    "evaluate",
  );
  const resolveProjection = callable<M19InputProjectionAuthorityPort["resolve"]>(
    inputProjectionAuthority,
    "resolve",
  );
  const resolveModel = callable<OpenAIModelPolicyAuthority["resolve"]>(
    modelPolicyAuthority,
    "resolve",
  );
  const resolveCache = callable<OpenAIPromptCachePolicyAuthority["resolve"]>(
    promptCachePolicyAuthority,
    "resolve",
  );
  const resolveDisabled = callable<M19DisabledAdapterPolicyAuthority["resolve"]>(
    disabledPolicyAuthority,
    "resolve",
  );
  const mapRequest = callable<OpenAIResponsesRequestMapperPort["mapRequest"]>(
    requestMapper,
    "mapRequest",
  );
  const resolveCredential = callable<CredentialResolutionOrchestrator["resolve"]>(
    credentialResolutionOrchestrator,
    "resolve",
  );
  const prepareDisabled = callable<M19DisabledAdapterPort["prepareDisabled"]>(
    disabledAdapter,
    "prepareDisabled",
  );
  const instructionProfile = descriptors.instructionProfile.value;
  if (
    verifyDecision === null ||
    verifyClaim === null ||
    resolveReadiness === null ||
    evaluateControls === null ||
    resolveProjection === null ||
    resolveModel === null ||
    resolveCache === null ||
    resolveDisabled === null ||
    mapRequest === null ||
    resolveCredential === null ||
    prepareDisabled === null ||
    typeof credentialResolverId !== "string" ||
    credentialResolverId.length === 0 ||
    !Sha256DigestSchema.safeParse(requestMappingProfileFingerprint).success ||
    !Sha256DigestSchema.safeParse(responseMappingProfileFingerprint).success ||
    verifyFounderDecisionMemoInstructionProfile(instructionProfile).status !== "valid"
  ) {
    throw new TypeError("M19 preparation configuration is invalid");
  }
  const capturedInstructionProfile = deepFreeze(
    structuredClone(instructionProfile) as FounderDecisionMemoInstructionProfile,
  );
  const reservations = new Map<string, Reservation>();

  return Object.freeze({
    async prepare(input: PrepareOpenAIResponsesInput): Promise<M19PreparationResult> {
      let ownerReservation: Reservation | undefined;
      try {
        const inputDescriptors = captureExactOwnEnumerableDataDescriptors(input, INPUT_KEYS);
        if (
          inputDescriptors === null ||
          inputDescriptors.schemaVersion.value !== "1.0" ||
          !ExecutionAuthorizationIdentifierSchema.safeParse(inputDescriptors.preparationId.value)
            .success ||
          !ExecutionAuthorizationIdentifierSchema.safeParse(inputDescriptors.requestPlanId.value)
            .success ||
          !IsoTemporalSchema.safeParse(inputDescriptors.evaluatedAt.value).success ||
          !CredentialResolutionRequestSchema.safeParse(
            inputDescriptors.credentialResolutionRequest.value,
          ).success ||
          !ExecutionAuthorizationDecisionSchema.safeParse(inputDescriptors.decision.value)
            .success ||
          !ExecutionAuthorizationClaimSchema.safeParse(inputDescriptors.claim.value).success
        ) {
          return rejected("invalid_input");
        }
        const captured = deepFreeze(structuredClone(input));
        if (
          verifyCredentialResolutionRequest(captured.credentialResolutionRequest).status !== "valid"
        ) {
          return rejected("invalid_input");
        }
        const inputFingerprint = createDurableCanonicalJsonSha256Fingerprint({
          domain: "founderos.m19.preparation-input.v1",
          artifact: captured,
        });
        const existing = reservations.get(captured.preparationId);
        if (existing !== undefined) {
          if (existing.inputFingerprint !== inputFingerprint) {
            return rejected("conflicting_preparation_identity");
          }
          return existing.state === "in-flight" ? inFlight() : existing.result!;
        }
        ownerReservation = { inputFingerprint, state: "in-flight" };
        reservations.set(captured.preparationId, ownerReservation);

        const decisionVerification = verifyDecision.call(authorizationAuthority, {
          schemaVersion: "1.0",
          authorizationDecision: captured.decision,
          evaluatedAt: captured.evaluatedAt,
        });
        const claimVerification = verifyClaim.call(authorizationAuthority, {
          schemaVersion: "1.0",
          authorizationDecision: captured.decision,
          authorizationClaim: captured.claim,
          evaluatedAt: captured.evaluatedAt,
        });
        if (decisionVerification.status !== "valid" || claimVerification.status !== "valid") {
          ownerReservation.result = rejected("authorization_non_authoritative");
        } else {
          const credentialCoordinatesMismatch =
            captured.credentialResolutionRequest.evaluatedAt !== captured.evaluatedAt ||
            captured.credentialResolutionRequest.deliveryTransactionId !==
              captured.decision.authorizationRequest.deliveryTransactionId ||
            captured.credentialResolutionRequest.contextPackageId !==
              captured.decision.authorizationRequest.contextPackageId ||
            captured.credentialResolutionRequest.invocationRequestId !==
              captured.decision.authorizationRequest.invocationRequestId;
          const authorityRequest: M19AuthorityRequest = deepFreeze({
            schemaVersion: "1.0",
            preparationId: captured.preparationId,
            evaluatedAt: captured.evaluatedAt,
            decision: captured.decision,
            claim: captured.claim,
          });
          let readiness: M19ReadinessAuthorityEvidence | null = null;
          try {
            readiness = await resolveReadiness.call(readinessAuthority, authorityRequest);
          } catch {
            // Durable authority unavailability and reconstruction mismatches are normative
            // fail-closed readiness outcomes, not unclassified implementation faults.
          }
          if (
            readiness === null ||
            verifyM19ReadinessAuthorityEvidence(readiness).status !== "valid"
          ) {
            ownerReservation.result = rejected("readiness_non_authoritative");
          } else {
            const readinessCoordinatesMismatch = !authorityCoordinatesMatch(readiness, captured);
            const readinessExpired =
              [
                readiness.pricingReviewedAt,
                readiness.privacyReviewedAt,
                readiness.providerRetentionReviewedAt,
                readiness.accountRetentionReviewedAt,
                readiness.cachePolicyReviewedAt,
              ].some((reviewedAt) => Date.parse(reviewedAt) > Date.parse(captured.evaluatedAt)) ||
              [
                readiness.expiresAt,
                readiness.pricingExpiresAt,
                readiness.privacyExpiresAt,
                readiness.providerRetentionExpiresAt,
                readiness.accountRetentionExpiresAt,
                readiness.cachePolicyExpiresAt,
              ].some((expiresAt) => Date.parse(expiresAt) <= Date.parse(captured.evaluatedAt));
            const modelPolicy = resolveModel.call(modelPolicyAuthority, authorityRequest);
            if (
              verifyOpenAIModelPolicy(modelPolicy).status !== "valid" ||
              modelPolicy.policyFingerprint !==
                captured.decision.authorizationRequest.modelPolicyFingerprint ||
              modelPolicy.policyId !==
                captured.decision.authorizationRequest.modelPolicyReference ||
              modelPolicy.maxOutputTokens !==
                captured.decision.authorizationRequest.limits.maximumOutputTokens ||
              modelPolicy.m14ProviderCapabilityFingerprint !==
                readiness.m14ProviderCapabilityFingerprint ||
              modelPolicy.m14CompatibilityFingerprint !== readiness.m14CompatibilityFingerprint ||
              modelPolicy.m14RateCapacityFingerprint !== readiness.m14RateCapacityFingerprint ||
              modelPolicy.m14CostBudgetFingerprint !== readiness.m14CostBudgetFingerprint ||
              modelPolicy.m14TransportPolicyFingerprint !==
                readiness.m14TransportPolicyFingerprint ||
              modelPolicy.privacyPolicyFingerprint !== readiness.privacyPolicyFingerprint ||
              modelPolicy.m14ReadinessDecisionFingerprint !== readiness.m14DecisionFingerprint ||
              modelPolicy.pricingEvidenceId !== readiness.m14PricingEvidenceId ||
              modelPolicy.pricingEvidenceFingerprint !== readiness.m14PricingEvidenceFingerprint ||
              modelPolicy.pricingReviewedAt !== readiness.pricingReviewedAt ||
              modelPolicy.pricingExpiresAt !== readiness.pricingExpiresAt ||
              modelPolicy.providerRetentionEvidenceId !== readiness.providerRetentionEvidenceId ||
              modelPolicy.providerRetentionEvidenceFingerprint !==
                readiness.providerRetentionEvidenceFingerprint ||
              modelPolicy.providerRetentionReviewedAt !== readiness.providerRetentionReviewedAt ||
              modelPolicy.providerRetentionExpiresAt !== readiness.providerRetentionExpiresAt ||
              modelPolicy.accountRetentionEvidenceId !== readiness.accountRetentionEvidenceId ||
              modelPolicy.accountRetentionEvidenceFingerprint !==
                readiness.accountRetentionEvidenceFingerprint ||
              modelPolicy.accountRetentionReviewedAt !== readiness.accountRetentionReviewedAt ||
              modelPolicy.accountRetentionExpiresAt !== readiness.accountRetentionExpiresAt
            ) {
              ownerReservation.result = rejected("model_policy_invalid");
            } else if (
              capturedInstructionProfile.profileFingerprint !==
              captured.decision.authorizationRequest.executionInstructionProfileFingerprint
            ) {
              ownerReservation.result = rejected("instruction_profile_invalid");
            } else {
              const promptCachePolicy = resolveCache.call(promptCachePolicyAuthority, {
                ...authorityRequest,
                modelPolicy,
              });
              if (
                verifyOpenAIPromptCachePolicy(promptCachePolicy).status !== "valid" ||
                promptCachePolicy.modelPolicyFingerprint !== modelPolicy.policyFingerprint ||
                promptCachePolicy.policyId !== modelPolicy.promptCachePolicyId ||
                promptCachePolicy.transportPolicyFingerprint !==
                  modelPolicy.m14TransportPolicyFingerprint ||
                promptCachePolicy.privacyPolicyFingerprint !==
                  modelPolicy.privacyPolicyFingerprint ||
                promptCachePolicy.providerRetentionEvidenceId !==
                  modelPolicy.providerRetentionEvidenceId ||
                promptCachePolicy.providerRetentionEvidenceFingerprint !==
                  modelPolicy.providerRetentionEvidenceFingerprint ||
                promptCachePolicy.operationFingerprint !== readiness.operationFingerprint ||
                promptCachePolicy.accountRetentionEvidenceId !==
                  modelPolicy.accountRetentionEvidenceId ||
                promptCachePolicy.accountRetentionEvidenceFingerprint !==
                  modelPolicy.accountRetentionEvidenceFingerprint ||
                promptCachePolicy.privacyReviewedAt !== readiness.privacyReviewedAt ||
                promptCachePolicy.privacyExpiresAt !== readiness.privacyExpiresAt ||
                promptCachePolicy.providerRetentionReviewedAt !==
                  readiness.providerRetentionReviewedAt ||
                promptCachePolicy.providerRetentionExpiresAt !==
                  readiness.providerRetentionExpiresAt ||
                promptCachePolicy.accountRetentionReviewedAt !==
                  readiness.accountRetentionReviewedAt ||
                promptCachePolicy.accountRetentionExpiresAt !==
                  readiness.accountRetentionExpiresAt ||
                promptCachePolicy.reviewedAt !== readiness.cachePolicyReviewedAt ||
                promptCachePolicy.expiresAt !== readiness.cachePolicyExpiresAt ||
                promptCachePolicy.evidenceReference !== readiness.cacheEvidenceReference
              ) {
                ownerReservation.result = rejected("prompt_cache_policy_invalid");
              } else if (
                credentialCoordinatesMismatch ||
                readinessCoordinatesMismatch ||
                modelPolicy.providerFamilyReference !== readiness.providerFamilyReference ||
                modelPolicy.environmentClass !== readiness.environmentClass ||
                modelPolicy.operation !== readiness.operation ||
                modelPolicy.adapterId !== readiness.adapterId ||
                modelPolicy.adapterFingerprint !== readiness.adapterFingerprint ||
                promptCachePolicy.adapterId !== readiness.adapterId ||
                promptCachePolicy.adapterFingerprint !== readiness.adapterFingerprint ||
                promptCachePolicy.operation !== readiness.operation
              ) {
                ownerReservation.result = rejected("coordinate_mismatch");
              } else if (
                readinessExpired ||
                Date.parse(modelPolicy.issuedAt) > Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.pricingReviewedAt) > Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.providerRetentionReviewedAt) >
                  Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.accountRetentionReviewedAt) >
                  Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.expiresAt) <= Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.pricingExpiresAt) <= Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.providerRetentionExpiresAt) <=
                  Date.parse(captured.evaluatedAt) ||
                Date.parse(modelPolicy.accountRetentionExpiresAt) <=
                  Date.parse(captured.evaluatedAt) ||
                Date.parse(promptCachePolicy.reviewedAt) > Date.parse(captured.evaluatedAt) ||
                Date.parse(promptCachePolicy.expiresAt) <= Date.parse(captured.evaluatedAt)
              ) {
                ownerReservation.result = rejected("authority_expired");
              } else {
                const currentControls = await evaluateControls.call(currentControlAuthority, {
                  ...authorityRequest,
                  readiness,
                  modelPolicy,
                });
                if (verifyM19CurrentControlSnapshot(currentControls).status !== "valid") {
                  ownerReservation.result = rejected("current_control_rejected");
                } else if (!controlsMatch(currentControls, readiness, modelPolicy)) {
                  ownerReservation.result = rejected("coordinate_mismatch");
                } else if (
                  Date.parse(currentControls.expiresAt) <= Date.parse(captured.evaluatedAt)
                ) {
                  ownerReservation.result = rejected("authority_expired");
                } else {
                  const inputProjection = await resolveProjection.call(
                    inputProjectionAuthority,
                    authorityRequest,
                  );
                  if (
                    verifyFounderDecisionMemoInputProjection(inputProjection).status !== "valid"
                  ) {
                    ownerReservation.result = rejected("request_plan_invalid");
                  } else if (
                    inputProjection.deliveryTransactionId !==
                      captured.decision.authorizationRequest.deliveryTransactionId ||
                    inputProjection.deliveryTransactionFingerprint !==
                      captured.decision.authorizationRequest.deliveryTransactionFingerprint ||
                    inputProjection.contextPackageId !==
                      captured.decision.authorizationRequest.contextPackageId ||
                    inputProjection.contextPackageFingerprint !==
                      captured.decision.authorizationRequest.contextPackageFingerprint ||
                    inputProjection.invocationRequestId !==
                      captured.decision.authorizationRequest.invocationRequestId ||
                    inputProjection.invocationRequestFingerprint !==
                      captured.decision.authorizationRequest.invocationRequestFingerprint
                  ) {
                    ownerReservation.result = rejected("coordinate_mismatch");
                  } else {
                    const disabledPolicy = resolveDisabled.call(disabledPolicyAuthority, {
                      ...authorityRequest,
                      readiness,
                      modelPolicy,
                      promptCachePolicy,
                      instructionProfile: capturedInstructionProfile,
                    });
                    if (verifyM19DisabledAdapterPolicy(disabledPolicy).status !== "valid") {
                      ownerReservation.result = rejected("disabled_policy_invalid");
                    } else if (
                      disabledPolicy.adapterId !== readiness.adapterId ||
                      disabledPolicy.adapterFingerprint !== readiness.adapterFingerprint ||
                      disabledPolicy.environmentClass !== readiness.environmentClass ||
                      disabledPolicy.operation !== readiness.operation
                    ) {
                      ownerReservation.result = rejected("coordinate_mismatch");
                    } else if (
                      disabledPolicy.readinessTransactionFingerprint !==
                        readiness.readinessTransactionFingerprint ||
                      disabledPolicy.m14DecisionFingerprint !== readiness.m14DecisionFingerprint ||
                      disabledPolicy.modelPolicyFingerprint !== modelPolicy.policyFingerprint ||
                      disabledPolicy.instructionProfileFingerprint !==
                        capturedInstructionProfile.profileFingerprint ||
                      disabledPolicy.promptCachePolicyFingerprint !==
                        promptCachePolicy.policyFingerprint ||
                      disabledPolicy.requestMappingProfileFingerprint !==
                        requestMappingProfileFingerprint ||
                      disabledPolicy.responseMappingProfileFingerprint !==
                        responseMappingProfileFingerprint
                    ) {
                      ownerReservation.result = rejected("disabled_policy_invalid");
                    } else {
                      const planAuthorities: OpenAIResponsesPlanAuthorityInput = {
                        requestPlanId: captured.requestPlanId,
                        readiness,
                        currentControls,
                        modelPolicy,
                        instructionProfile: capturedInstructionProfile,
                        inputProjection,
                        promptCachePolicy,
                        disabledPolicy,
                        requestMappingProfileFingerprint,
                        responseMappingProfileFingerprint,
                        authorizationLimits: {
                          maximumInputBytes:
                            captured.decision.authorizationRequest.limits.maximumInputBytes,
                          maximumOutputBytes:
                            captured.decision.authorizationRequest.limits.maximumOutputBytes,
                          maximumInputTokens:
                            captured.decision.authorizationRequest.limits.maximumInputTokens,
                          maximumOutputTokens:
                            captured.decision.authorizationRequest.limits.maximumOutputTokens,
                        },
                      };
                      const mapped = mapRequest.call(requestMapper, {
                        ...planAuthorities,
                        schemaVersion: "1.0",
                      });
                      if (
                        mapped.status !== "mapped" ||
                        verifyOpenAIResponsesRequestPlanAgainstAuthorities(
                          mapped.plan,
                          planAuthorities,
                        ).status !== "valid"
                      ) {
                        ownerReservation.result = rejected("request_plan_invalid");
                      } else {
                        const credentialResult = resolveCredential.call(
                          credentialResolutionOrchestrator,
                          {
                            schemaVersion: "1.0",
                            request: captured.credentialResolutionRequest,
                            decision: captured.decision,
                            claim: captured.claim,
                          },
                        );
                        if (credentialResult.status !== "resolved") {
                          ownerReservation.result = rejected("credential_resolution_rejected");
                        } else if (
                          verifyCredentialResolutionEvidence(credentialResult.evidence).status !==
                            "valid" ||
                          !m18EvidenceMatches(
                            credentialResult,
                            captured.credentialResolutionRequest,
                            credentialResolverId,
                            captured.evaluatedAt,
                          )
                        ) {
                          ownerReservation.result = rejected(
                            "credential_resolution_non_authoritative",
                          );
                        } else {
                          const terminal = prepareDisabled.call(disabledAdapter, {
                            requestPlan: mapped.plan,
                            credentialResolutionEvidenceFingerprint:
                              credentialResult.evidence.evidenceFingerprint,
                            disabledPolicy,
                          });
                          ownerReservation.result =
                            verifyM19TerminalResult({
                              result: terminal,
                              plan: mapped.plan,
                              policy: disabledPolicy,
                              credentialResolutionEvidenceFingerprint:
                                credentialResult.evidence.evidenceFingerprint,
                            }).status === "valid"
                              ? deepFreeze(structuredClone(terminal))
                              : rejected("disabled_policy_invalid");
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        if (ownerReservation !== undefined) {
          ownerReservation.result = rejected(
            error instanceof M19AuthorityResolutionError
              ? error.reasonCode
              : "internal_integrity_failure",
          );
        } else {
          return rejected("invalid_input");
        }
      }
      ownerReservation!.state = "terminal";
      return ownerReservation!.result!;
    },
  });
}
