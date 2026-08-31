import {
  FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
  OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
  OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
  createDisabledOpenAIResponsesAdapter,
} from "../../../integrations/openai-responses/src/index.js";
import {
  createCredentialResolutionOrchestrator,
  createCredentialResolutionEvidence,
  createCredentialResolutionRequest,
  createExecutionAuthorizationRequest,
  createFounderDecisionMemoInputProjection,
  createFounderDecisionMemoInstructionProfile,
  createHumanExecutionApprovalEvidence,
  createInMemoryExecutionAuthorizationAuthority,
  createM19CurrentControlSnapshot,
  createM19DisabledAdapterPolicy,
  createM19ReadinessAuthorityEvidence,
  createOpenAIPromptCachePolicy,
  createOpenAIModelPolicy,
  createOpenAIResponsesPreparationOrchestrator,
  createSourceBoundFounderDecisionMemoInputProjectionAuthority,
  type CredentialResolutionPort,
  type OpenAIResponsesPreparationConfiguration,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

import { createDurableCanonicalJsonSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import { createInvocation, createReasoningTestRuntime } from "./reasoning-fixtures.js";

import {
  AUTHORIZATION_FINGERPRINTS,
  authorizationAuthorityConfiguration,
  authorizationLimits,
  createAuthorizationFixture,
} from "./fixtures/execution-authorization.js";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

function setup(setupOptions: { readonly futureModelReview?: boolean } = {}) {
  const instructionProfile = createFounderDecisionMemoInstructionProfile(
    FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
  );
  const modelPolicy = createOpenAIModelPolicy({
    schemaVersion: "1.0",
    policyId: "model-policy-one",
    policyVersion: "v1",
    issuerReference: "authority/model-policy",
    issuedAt: "2026-08-23T00:00:00.000Z",
    expiresAt: "2026-08-23T02:00:00.000Z",
    adapterId: "adapter-one",
    adapterFingerprint: AUTHORIZATION_FINGERPRINTS.adapter,
    environmentClass: "evaluation",
    providerFamilyReference: "provider-family/openai",
    apiFamily: "responses",
    operation: "founder-decision-memo",
    modelId: "fixture-model-2026-08-23",
    serviceTier: "default",
    maxOutputTokens: authorizationLimits().maximumOutputTokens,
    m14ProviderCapabilityFingerprint: "1".repeat(64),
    m14CompatibilityFingerprint: "2".repeat(64),
    m14RateCapacityFingerprint: "3".repeat(64),
    m14CostBudgetFingerprint: "4".repeat(64),
    m14TransportPolicyFingerprint: "5".repeat(64),
    privacyPolicyFingerprint: "6".repeat(64),
    m14ReadinessDecisionFingerprint: "c".repeat(64),
    pricingEvidenceId: "pricing-evidence-one",
    pricingEvidenceFingerprint: "7".repeat(64),
    pricingReviewedAt: setupOptions.futureModelReview
      ? "2026-08-23T01:00:03.000Z"
      : "2026-08-23T00:00:00.000Z",
    pricingExpiresAt: "2026-08-23T02:00:00.000Z",
    providerRetentionEvidenceId: "retention-evidence-one",
    providerRetentionEvidenceFingerprint: "8".repeat(64),
    providerRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
    providerRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
    accountRetentionEvidenceId: "account-retention-evidence-one",
    accountRetentionEvidenceFingerprint: "a".repeat(64),
    accountRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
    accountRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
    promptCachePolicyId: "cache-policy-one",
    state: "approved-for-disabled-mapping",
  });
  const promptCachePolicy = createOpenAIPromptCachePolicy({
    schemaVersion: "1.0",
    policyId: "cache-policy-one",
    policyVersion: "v1",
    adapterId: "adapter-one",
    adapterFingerprint: AUTHORIZATION_FINGERPRINTS.adapter,
    modelPolicyId: modelPolicy.policyId,
    modelPolicyFingerprint: modelPolicy.policyFingerprint,
    transportPolicyFingerprint: modelPolicy.m14TransportPolicyFingerprint,
    privacyPolicyFingerprint: modelPolicy.privacyPolicyFingerprint,
    operationFingerprint: "9".repeat(64),
    providerRetentionEvidenceId: modelPolicy.providerRetentionEvidenceId,
    providerRetentionEvidenceFingerprint: modelPolicy.providerRetentionEvidenceFingerprint,
    accountRetentionEvidenceId: modelPolicy.accountRetentionEvidenceId,
    accountRetentionEvidenceFingerprint: modelPolicy.accountRetentionEvidenceFingerprint,
    privacyReviewedAt: "2026-08-23T00:00:00.000Z",
    privacyExpiresAt: "2026-08-23T02:00:00.000Z",
    providerRetentionReviewedAt: modelPolicy.providerRetentionReviewedAt,
    providerRetentionExpiresAt: modelPolicy.providerRetentionExpiresAt,
    accountRetentionReviewedAt: modelPolicy.accountRetentionReviewedAt,
    accountRetentionExpiresAt: modelPolicy.accountRetentionExpiresAt,
    operation: "founder-decision-memo",
    posture: "provider-managed-no-caller-controls",
    reviewedAt: "2026-08-23T00:00:00.000Z",
    expiresAt: "2026-08-23T02:00:00.000Z",
    evidenceReference: "evidence/cache-policy",
  });
  const baseFixture = createAuthorizationFixture();
  const { requestFingerprint: _oldRequestFingerprint, ...requestInput } = baseFixture.request;
  void _oldRequestFingerprint;
  const authorizationRequest = createExecutionAuthorizationRequest({
    ...requestInput,
    modelPolicyReference: modelPolicy.policyId,
    modelPolicyFingerprint: modelPolicy.policyFingerprint,
    executionInstructionProfileFingerprint: instructionProfile.profileFingerprint,
  });
  const { evidenceFingerprint: _oldApprovalFingerprint, ...approvalInput } = baseFixture.approval;
  void _oldApprovalFingerprint;
  const approval = createHumanExecutionApprovalEvidence({
    ...approvalInput,
    authorizationRequestId: authorizationRequest.authorizationRequestId,
    authorizationRequestFingerprint: authorizationRequest.requestFingerprint,
    approvedLimits: authorizationRequest.limits,
  });
  const authority = createInMemoryExecutionAuthorizationAuthority({
    ...authorizationAuthorityConfiguration(),
    modelPolicyReference: modelPolicy.policyId,
    modelPolicyFingerprint: modelPolicy.policyFingerprint,
    executionInstructionProfileFingerprint: instructionProfile.profileFingerprint,
  });
  const issuance = authority.issueDecision({
    schemaVersion: "1.0",
    authorizationDecisionId: "authorization-decision-m19",
    authorizationRequest,
    serviceIdentityEvidence: baseFixture.identity,
    humanApprovalEvidence: approval,
    evaluatedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:15:00.000Z",
  });
  if (issuance.status !== "issued") throw new Error("authorization issuance fixture failed");
  const claimed = authority.claimDecision({
    schemaVersion: "1.0",
    authorizationClaimId: "authorization-claim-m19",
    authorizationDecision: issuance.decision,
    executionAttemptId: authorizationRequest.executionAttemptId,
    executionAttemptFingerprint: authorizationRequest.executionAttemptFingerprint,
    claimedAt: "2026-08-23T01:00:01.000Z",
    idempotentRetry: false,
  });
  if (claimed.status !== "claimed") throw new Error("authorization claim fixture failed");
  const decision = issuance.decision;
  const claim = claimed.claim;
  const credentialResolutionRequest = createCredentialResolutionRequest({
    schemaVersion: "1.0",
    resolutionRequestId: "credential-resolution-m19",
    authorizationDecisionId: decision.authorizationDecisionId,
    authorizationDecisionFingerprint: decision.decisionFingerprint,
    authorizationClaimId: claim.authorizationClaimId,
    authorizationClaimFingerprint: claim.claimFingerprint,
    executionAttemptId: authorizationRequest.executionAttemptId,
    executionAttemptFingerprint: authorizationRequest.executionAttemptFingerprint,
    subjectReference: authorizationRequest.subjectReference,
    consumerId: authorizationRequest.consumerId,
    deliveryTransactionId: authorizationRequest.deliveryTransactionId,
    contextPackageId: authorizationRequest.contextPackageId,
    invocationRequestId: authorizationRequest.invocationRequestId,
    providerFamilyReference: authorizationRequest.providerFamilyReference,
    adapterId: authorizationRequest.adapterId,
    adapterFingerprint: authorizationRequest.adapterFingerprint,
    environmentClass: authorizationRequest.environmentClass,
    operation: authorizationRequest.operation,
    credentialReferenceId: authorizationRequest.credentialReferenceId,
    credentialReferenceFingerprint: authorizationRequest.credentialReferenceFingerprint,
    expectedRotationVersion: authorizationRequest.credentialRotationVersion,
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt: "2026-08-23T01:00:02.000Z",
    resolutionDeadline: "2026-08-23T01:10:00.000Z",
  });
  let resolverCalls = 0;
  const credentialPort: CredentialResolutionPort = {
    resolveAndRelease(command) {
      resolverCalls += 1;
      return {
        status: "resolved",
        evidence: {
          schemaVersion: "1.0",
          resolutionRequestId: command.resolutionRequestId,
          authorizationDecisionId: command.authorizationDecisionId,
          authorizationDecisionFingerprint: command.authorizationDecisionFingerprint,
          authorizationClaimId: command.authorizationClaimId,
          authorizationClaimFingerprint: command.authorizationClaimFingerprint,
          executionAttemptId: command.executionAttemptId,
          executionAttemptFingerprint: command.executionAttemptFingerprint,
          credentialReferenceId: command.credentialReferenceId,
          credentialReferenceFingerprint: command.credentialReferenceFingerprint,
          rotationVersion: command.expectedRotationVersion,
          providerFamilyReference: command.providerFamilyReference,
          adapterId: command.adapterId,
          adapterFingerprint: command.adapterFingerprint,
          environmentClass: command.environmentClass,
          operation: command.operation,
          evaluatedAt: command.evaluatedAt,
          resolutionDeadline: command.resolutionDeadline,
          resolverId: command.resolverId,
          sourceClass: "deterministic-synthetic",
          releaseStatus: "released",
        },
      };
    },
  };
  const credentialOrchestrator = createCredentialResolutionOrchestrator({
    schemaVersion: "1.0",
    resolverId: "resolver.synthetic.primary",
    authority,
    port: credentialPort,
  });
  const projectionContent = {
    schemaVersion: "1.0" as const,
    question: "Which option should the founder choose?",
    deliveryTransactionId: authorizationRequest.deliveryTransactionId,
    deliveryTransactionFingerprint: authorizationRequest.deliveryTransactionFingerprint,
    invocationRequestId: authorizationRequest.invocationRequestId,
    invocationRequestFingerprint: authorizationRequest.invocationRequestFingerprint,
    contextPackageId: authorizationRequest.contextPackageId,
    contextPackageFingerprint: authorizationRequest.contextPackageFingerprint,
    contextEntries: [
      {
        objectId: "knowledge-one",
        objectType: "decision",
        canonicalContent: "Evidence one",
        includedContentFingerprint: "a".repeat(64),
        evidenceReference: "knowledge/one",
      },
    ],
  };
  const instructionArtifact = {
    schemaVersion: instructionProfile.schemaVersion,
    profileId: instructionProfile.profileId,
    serialization: instructionProfile.serialization,
    instructionBlocks: instructionProfile.instructionBlocks,
    sectionNames: instructionProfile.sectionNames,
  };
  const instructions = canonicalize(instructionArtifact);
  const projectedInput = canonicalize(projectionContent);
  const inputProjection = createFounderDecisionMemoInputProjection({
    ...projectionContent,
    instructionCharacterCount: [...instructions].length,
    instructionUtf8ByteCount: Buffer.byteLength(instructions, "utf8"),
    inputCharacterCount: [...projectedInput].length,
    inputUtf8ByteCount: Buffer.byteLength(projectedInput, "utf8"),
    authorizedInputUtf8ByteCount:
      Buffer.byteLength(instructions, "utf8") + Buffer.byteLength(projectedInput, "utf8"),
  });
  function reissueProjection(
    overrides: Partial<{
      question: string;
      invocationRequestId: string;
    }>,
    falseCounts = false,
  ) {
    const {
      projectionFingerprint: _projectionFingerprint,
      instructionCharacterCount,
      instructionUtf8ByteCount,
      inputCharacterCount: _inputCharacterCount,
      inputUtf8ByteCount: _inputUtf8ByteCount,
      authorizedInputUtf8ByteCount: _authorizedInputUtf8ByteCount,
      ...artifact
    } = inputProjection;
    void _projectionFingerprint;
    void _inputCharacterCount;
    void _inputUtf8ByteCount;
    void _authorizedInputUtf8ByteCount;
    const revised = { ...artifact, ...overrides };
    const serialized = canonicalize(revised);
    const inputChars = [...serialized].length;
    const inputBytes = Buffer.byteLength(serialized, "utf8");
    return createFounderDecisionMemoInputProjection({
      ...revised,
      instructionCharacterCount,
      instructionUtf8ByteCount,
      inputCharacterCount: inputChars + (falseCounts ? 1 : 0),
      inputUtf8ByteCount: inputBytes,
      authorizedInputUtf8ByteCount: instructionUtf8ByteCount + inputBytes,
    });
  }
  let mapperCalls = 0;
  let disabledCalls = 0;
  let readinessCalls = 0;
  let currentControlCalls = 0;
  const adapter = createDisabledOpenAIResponsesAdapter();
  const readinessFactory = (
    preparationId: string,
    limits: { maximumInputCharacters?: number; maximumRequestBytes?: number } = {},
  ) =>
    createM19ReadinessAuthorityEvidence({
      schemaVersion: "1.0",
      preparationId,
      executionAttemptId: authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: authorizationRequest.executionAttemptFingerprint,
      authorizationDecisionId: decision.authorizationDecisionId,
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimId: claim.authorizationClaimId,
      authorizationClaimFingerprint: claim.claimFingerprint,
      adapterId: authorizationRequest.adapterId,
      adapterFingerprint: authorizationRequest.adapterFingerprint,
      providerFamilyReference: "provider-family/openai",
      environmentClass: authorizationRequest.environmentClass,
      operation: "founder-decision-memo",
      readinessTransactionId: "readiness-transaction-m19",
      readinessTransactionFingerprint: "b".repeat(64),
      m14DecisionId: "m14-decision-m19",
      m14DecisionFingerprint: "c".repeat(64),
      m14RequestPlanId: "m14-plan-m19",
      m14RequestPlanFingerprint: "d".repeat(64),
      m14ProviderCapabilityFingerprint: modelPolicy.m14ProviderCapabilityFingerprint,
      m14CompatibilityFingerprint: modelPolicy.m14CompatibilityFingerprint,
      m14RateCapacityFingerprint: modelPolicy.m14RateCapacityFingerprint,
      m14CostBudgetFingerprint: modelPolicy.m14CostBudgetFingerprint,
      m14TransportPolicyFingerprint: modelPolicy.m14TransportPolicyFingerprint,
      privacyPolicyFingerprint: modelPolicy.privacyPolicyFingerprint,
      m14PricingEvidenceId: modelPolicy.pricingEvidenceId,
      m14PricingEvidenceFingerprint: modelPolicy.pricingEvidenceFingerprint,
      providerRetentionEvidenceId: modelPolicy.providerRetentionEvidenceId,
      providerRetentionEvidenceFingerprint: modelPolicy.providerRetentionEvidenceFingerprint,
      policyAuthorityEvidenceFingerprint: "e".repeat(64),
      pricingReviewedAt: modelPolicy.pricingReviewedAt,
      pricingExpiresAt: modelPolicy.pricingExpiresAt,
      privacyReviewedAt: "2026-08-23T00:00:00.000Z",
      privacyExpiresAt: "2026-08-23T02:00:00.000Z",
      providerRetentionReviewedAt: modelPolicy.providerRetentionReviewedAt,
      providerRetentionExpiresAt: modelPolicy.providerRetentionExpiresAt,
      accountRetentionEvidenceId: promptCachePolicy.accountRetentionEvidenceId,
      accountRetentionEvidenceFingerprint: promptCachePolicy.accountRetentionEvidenceFingerprint,
      accountRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
      accountRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
      operationFingerprint: promptCachePolicy.operationFingerprint,
      cachePolicyReviewedAt: promptCachePolicy.reviewedAt,
      cachePolicyExpiresAt: promptCachePolicy.expiresAt,
      cacheEvidenceReference: promptCachePolicy.evidenceReference,
      m14DecisionStatus: "ready-for-dry-run",
      adapterState: "dry-run-mapping",
      maximumRequestBytes: limits.maximumRequestBytes ?? 50_000,
      maximumResponseBytes: 30_000,
      maximumInputCharacters: limits.maximumInputCharacters ?? 20_000,
      maximumOutputCharacters: 10_000,
      evaluatedAt: "2026-08-23T01:00:02.000Z",
      expiresAt: "2026-08-23T01:10:00.000Z",
      issuerReference: "authority/readiness",
    });
  const inputFor = (
    preparationId = "preparation-m19",
    options: {
      readonly requestPlanId?: string;
      readonly credentialCoordinateMismatch?: boolean;
    } = {},
  ) => {
    const credentialRequest = options.credentialCoordinateMismatch
      ? (() => {
          const { requestFingerprint: _requestFingerprint, ...request } =
            credentialResolutionRequest;
          void _requestFingerprint;
          return createCredentialResolutionRequest({
            ...request,
            deliveryTransactionId: "delivery-transaction-other",
          });
        })()
      : credentialResolutionRequest;
    return {
      schemaVersion: "1.0" as const,
      preparationId,
      requestPlanId: options.requestPlanId ?? "openai-plan-m19",
      evaluatedAt: "2026-08-23T01:00:02.000Z",
      credentialResolutionRequest: credentialRequest,
      decision,
      claim,
    };
  };
  function orchestrator(
    options: {
      readonly blockReadiness?: Promise<void>;
      readonly tamperCurrentControl?: boolean;
      readonly tamperCredentialResult?: boolean;
      readonly substituteCredentialResolver?: boolean;
      readonly tamperMappedPlan?: boolean;
      readonly rebindMappedPlan?: boolean;
      readonly currentControlEnvironment?: "evaluation" | "production";
      readonly tamperTerminal?: boolean;
      readonly projectionSubstitution?: "coordinate" | "false-counts" | "oversized";
      readonly readinessMaximumInputCharacters?: number;
      readonly readinessMaximumRequestBytes?: number;
      readonly substituteModelM14Binding?: boolean;
      readonly substituteCacheAdapter?: boolean;
      readonly substituteCacheAuthorityBinding?:
        | "operation"
        | "account-retention"
        | "evidence-reference"
        | "privacy-window"
        | "provider-retention-window"
        | "account-retention-window";
      readonly throwReadiness?: boolean;
      readonly substituteDisabledEnvironment?: boolean;
      readonly substituteInstructionProfile?: boolean;
      readonly substituteDisabledBinding?:
        | "readiness"
        | "m14-decision"
        | "model"
        | "instruction"
        | "cache"
        | "request-mapping"
        | "response-mapping";
    } = {},
    inputProjectionAuthorityOverride?: OpenAIResponsesPreparationConfiguration["inputProjectionAuthority"],
  ) {
    return createOpenAIResponsesPreparationOrchestrator({
      schemaVersion: "1.0",
      authorizationAuthority: authority,
      readinessAuthority: {
        async resolve(request) {
          readinessCalls += 1;
          await options.blockReadiness;
          if (options.throwReadiness) throw new TypeError("durable authority unavailable");
          return readinessFactory(request.preparationId, {
            maximumInputCharacters: options.readinessMaximumInputCharacters,
            maximumRequestBytes: options.readinessMaximumRequestBytes,
          });
        },
      },
      currentControlAuthority: {
        async evaluate(request) {
          currentControlCalls += 1;
          const snapshot = createM19CurrentControlSnapshot({
            schemaVersion: "1.0",
            preparationId: request.preparationId,
            executionAttemptId: authorizationRequest.executionAttemptId,
            executionAttemptFingerprint: authorizationRequest.executionAttemptFingerprint,
            authorizationDecisionId: decision.authorizationDecisionId,
            authorizationDecisionFingerprint: decision.decisionFingerprint,
            authorizationClaimId: claim.authorizationClaimId,
            authorizationClaimFingerprint: claim.claimFingerprint,
            adapterId: authorizationRequest.adapterId,
            adapterFingerprint: authorizationRequest.adapterFingerprint,
            providerFamilyReference: "provider-family/openai",
            environmentClass:
              options.currentControlEnvironment ?? authorizationRequest.environmentClass,
            operation: "founder-decision-memo",
            readinessTransactionId: request.readiness.readinessTransactionId,
            readinessTransactionFingerprint: request.readiness.readinessTransactionFingerprint,
            m14DecisionId: request.readiness.m14DecisionId,
            m14DecisionFingerprint: request.readiness.m14DecisionFingerprint,
            modelId: modelPolicy.modelId,
            rateCapacity: "allowed",
            costBudget: "allowed",
            privacy: "allowed",
            retention: "allowed",
            observability: "allowed",
            circuit: "closed",
            health: "available",
            incident: "inactive",
            killSwitches: {
              global: "allowed",
              provider: "allowed",
              adapter: "allowed",
              model: "allowed",
              environment: "allowed",
              operation: "allowed",
            },
            evaluatedAt: request.evaluatedAt,
            expiresAt: "2026-08-23T01:05:00.000Z",
            issuerReference: "authority/current-controls",
          });
          return options.tamperCurrentControl
            ? ({ ...snapshot, rateCapacity: "denied" } as never)
            : snapshot;
        },
      },
      inputProjectionAuthority: inputProjectionAuthorityOverride ?? {
        async resolve() {
          if (options.projectionSubstitution === "coordinate") {
            return reissueProjection({ invocationRequestId: "invocation-other" });
          }
          if (options.projectionSubstitution === "false-counts") {
            return reissueProjection({}, true);
          }
          if (options.projectionSubstitution === "oversized") {
            return reissueProjection({ question: "x".repeat(40_000) });
          }
          return inputProjection;
        },
      },
      modelPolicyAuthority: {
        resolve() {
          if (options.substituteModelM14Binding) {
            const { policyFingerprint: _policyFingerprint, ...policy } = modelPolicy;
            void _policyFingerprint;
            return createOpenAIModelPolicy({
              ...policy,
              ...(options.substituteModelM14Binding
                ? { m14CompatibilityFingerprint: "f".repeat(64) }
                : {}),
            });
          }
          return modelPolicy;
        },
      },
      promptCachePolicyAuthority: {
        resolve() {
          if (options.substituteCacheAdapter) {
            const { policyFingerprint: _policyFingerprint, ...policy } = promptCachePolicy;
            void _policyFingerprint;
            return createOpenAIPromptCachePolicy({ ...policy, adapterId: "adapter-other" });
          }
          if (options.substituteCacheAuthorityBinding) {
            const { policyFingerprint: _policyFingerprint, ...policy } = promptCachePolicy;
            void _policyFingerprint;
            return createOpenAIPromptCachePolicy({
              ...policy,
              ...(options.substituteCacheAuthorityBinding === "operation"
                ? { operationFingerprint: "f".repeat(64) }
                : {}),
              ...(options.substituteCacheAuthorityBinding === "account-retention"
                ? { accountRetentionEvidenceFingerprint: "f".repeat(64) }
                : {}),
              ...(options.substituteCacheAuthorityBinding === "evidence-reference"
                ? { evidenceReference: "evidence/substituted-cache-policy" }
                : {}),
              ...(options.substituteCacheAuthorityBinding === "privacy-window"
                ? { privacyExpiresAt: "2026-08-23T01:59:59.000Z" }
                : {}),
              ...(options.substituteCacheAuthorityBinding === "provider-retention-window"
                ? { providerRetentionExpiresAt: "2026-08-23T01:59:59.000Z" }
                : {}),
              ...(options.substituteCacheAuthorityBinding === "account-retention-window"
                ? { accountRetentionExpiresAt: "2026-08-23T01:59:59.000Z" }
                : {}),
            });
          }
          return promptCachePolicy;
        },
      },
      disabledPolicyAuthority: {
        resolve(request) {
          const substitutedFingerprint = "0".repeat(64);
          return createM19DisabledAdapterPolicy({
            schemaVersion: "1.0",
            policyId: "disabled-policy-one",
            policyVersion: "v1",
            state: "disabled",
            terminalResult: "disabled-by-policy",
            adapterId: authorizationRequest.adapterId,
            adapterFingerprint: authorizationRequest.adapterFingerprint,
            readinessTransactionFingerprint:
              options.substituteDisabledBinding === "readiness"
                ? substitutedFingerprint
                : request.readiness.readinessTransactionFingerprint,
            m14DecisionFingerprint:
              options.substituteDisabledBinding === "m14-decision"
                ? substitutedFingerprint
                : request.readiness.m14DecisionFingerprint,
            modelPolicyFingerprint:
              options.substituteDisabledBinding === "model"
                ? substitutedFingerprint
                : request.modelPolicy.policyFingerprint,
            instructionProfileFingerprint:
              options.substituteDisabledBinding === "instruction"
                ? substitutedFingerprint
                : request.instructionProfile.profileFingerprint,
            promptCachePolicyFingerprint:
              options.substituteDisabledBinding === "cache"
                ? substitutedFingerprint
                : request.promptCachePolicy.policyFingerprint,
            requestMappingProfileFingerprint:
              options.substituteDisabledBinding === "request-mapping"
                ? substitutedFingerprint
                : OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
            responseMappingProfileFingerprint:
              options.substituteDisabledBinding === "response-mapping"
                ? substitutedFingerprint
                : OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
            environmentClass: options.substituteDisabledEnvironment
              ? "production"
              : authorizationRequest.environmentClass,
            operation: "founder-decision-memo",
          });
        },
      },
      instructionProfile: options.substituteInstructionProfile
        ? createFounderDecisionMemoInstructionProfile({
            ...FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
            instructionBlocks: [
              `${FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[0]} altered`,
              FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[1],
              FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[2],
            ],
          })
        : instructionProfile,
      requestMapper: {
        mapRequest(request) {
          mapperCalls += 1;
          const mapped = adapter.mapRequest(request);
          if (options.rebindMappedPlan && mapped.status === "mapped") {
            const { requestPlanFingerprint: _requestPlanFingerprint, ...alteredPlan } = mapped.plan;
            void _requestPlanFingerprint;
            const rebound = {
              ...alteredPlan,
              maximumOutputCharacters: alteredPlan.maximumOutputCharacters - 1,
            };
            return {
              status: "mapped",
              plan: {
                ...rebound,
                requestPlanFingerprint: createDurableCanonicalJsonSha256Fingerprint({
                  domain: "founderos.m19.openai-responses-request-plan.v1",
                  artifact: rebound,
                }),
              },
            } as never;
          }
          return options.tamperMappedPlan && mapped.status === "mapped"
            ? ({
                status: "mapped",
                plan: { ...mapped.plan, maximumOutputCharacters: 1 },
              } as never)
            : mapped;
        },
      },
      credentialResolutionOrchestrator:
        options.tamperCredentialResult || options.substituteCredentialResolver
          ? {
              resolve(command) {
                const result = credentialOrchestrator.resolve(command);
                if (result.status !== "resolved") return result;
                if (options.substituteCredentialResolver) {
                  const { evidenceFingerprint: _evidenceFingerprint, ...evidence } =
                    result.evidence;
                  void _evidenceFingerprint;
                  return {
                    ...result,
                    evidence: createCredentialResolutionEvidence({
                      ...evidence,
                      resolverId: "resolver.synthetic.substituted",
                    }),
                  };
                }
                return {
                  ...result,
                  evidence: { ...result.evidence, rotationVersion: 999 },
                } as never;
              },
            }
          : credentialOrchestrator,
      credentialResolverId: "resolver.synthetic.primary",
      requestMappingProfileFingerprint: OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
      responseMappingProfileFingerprint: OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
      disabledAdapter: {
        prepareDisabled(command) {
          disabledCalls += 1;
          const result = adapter.prepareDisabled(command);
          return options.tamperTerminal && result.status === "disabled-by-policy"
            ? ({ ...result, evaluatedAt: "2026-08-23T01:00:03.000Z" } as never)
            : result;
        },
      },
    });
  }
  return {
    orchestrator,
    inputFor,
    counts: () => ({
      mapperCalls,
      readinessCalls,
      currentControlCalls,
      resolverCalls,
      disabledCalls,
    }),
  };
}

describe("Milestone 19 OpenAI Responses preparation orchestration", () => {
  it("derives the governed projection from the exact M12/M13 sources and rejects source substitutions", async () => {
    const roots: string[] = [];
    try {
      const runtime = await createReasoningTestRuntime(roots);
      const instructionProfile = createFounderDecisionMemoInstructionProfile(
        FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
      );
      const invocation = createInvocation(runtime, {
        taskSourceClassification: "request-author",
        taskText: "Which option should the founder choose?",
      });
      const [deliveryTransaction] = await runtime.deliveryLedger.listCommittedOriginalDeliveries();
      if (deliveryTransaction === undefined) throw new Error("Delivery fixture was not committed");
      const source = {
        schemaVersion: "1.0" as const,
        deliveryTransaction,
        invocationRequest: invocation,
        contextPackage: runtime.fixture.context.contextPackage,
        contextVerification: {
          candidateInputs: runtime.fixture.context.objects,
          bindings: runtime.fixture.context.bindings,
        },
        instructionProfile,
      };
      const authority = createSourceBoundFounderDecisionMemoInputProjectionAuthority(source);
      const projection = await authority.resolve({
        decision: {
          authorizationRequest: {
            deliveryTransactionId: source.deliveryTransaction.transactionId,
            deliveryTransactionFingerprint: source.deliveryTransaction.transactionFingerprint,
            invocationRequestId: invocation.invocationRequestId,
            invocationRequestFingerprint: invocation.requestFingerprint,
            contextPackageId: source.contextPackage.contextPackageId,
            contextPackageFingerprint: source.contextPackage.contextFingerprint,
          },
        },
      } as never);
      expect(projection.question).toBe("Which option should the founder choose?");
      expect(projection.contextEntries).toEqual(
        [...source.contextPackage.included]
          .sort((left, right) => left.selectionPosition - right.selectionPosition)
          .map((entry) => ({
            objectId: entry.objectId,
            objectType: entry.objectType,
            canonicalContent: entry.canonicalContent,
            includedContentFingerprint: entry.includedContentFingerprint,
            evidenceReference: entry.logicalSourceIdentifier,
          })),
      );

      const mismatchedFixture = setup();
      expect(
        await mismatchedFixture
          .orchestrator({}, authority)
          .prepare(mismatchedFixture.inputFor("preparation-concrete-source-mismatch")),
      ).toMatchObject({ status: "rejected", reasonCode: "coordinate_mismatch" });
      expect(mismatchedFixture.counts()).toMatchObject({ mapperCalls: 0, resolverCalls: 0 });

      const duplicateInvocation = createInvocation(runtime, {
        taskSourceClassification: "request-author",
        duplicateRequestAuthorTask: true,
      });
      expect(() =>
        createSourceBoundFounderDecisionMemoInputProjectionAuthority({
          ...source,
          invocationRequest: duplicateInvocation,
        }),
      ).toThrow(TypeError);
      expect(() =>
        createSourceBoundFounderDecisionMemoInputProjectionAuthority({
          ...source,
          contextPackage: {
            ...source.contextPackage,
            included: source.contextPackage.included.map((entry, index) =>
              index === 0
                ? { ...entry, canonicalContent: `${entry.canonicalContent} altered` }
                : entry,
            ),
          },
        }),
      ).toThrow(TypeError);
      expect(() =>
        createSourceBoundFounderDecisionMemoInputProjectionAuthority({
          ...source,
          contextPackage: {
            ...source.contextPackage,
            included: source.contextPackage.included.slice(1),
          },
        }),
      ).toThrow(TypeError);
      expect(() =>
        createSourceBoundFounderDecisionMemoInputProjectionAuthority({
          ...source,
          contextPackage: {
            ...source.contextPackage,
            included: [...source.contextPackage.included].reverse(),
          },
        }),
      ).toThrow(TypeError);
    } finally {
      await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  });

  it("runs authority-first once, terminates disabled, and replays without protected calls", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator();
    const first = await orchestrator.prepare(fixture.inputFor());
    const replay = await orchestrator.prepare(fixture.inputFor());
    expect(first.status).toBe("disabled-by-policy");
    expect(replay).toEqual(first);
    expect(fixture.counts()).toEqual({
      mapperCalls: 1,
      readinessCalls: 1,
      currentControlCalls: 1,
      resolverCalls: 1,
      disabledCalls: 1,
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("keeps valid, rejection, replay, and M18 orchestration paths network-incapable", async () => {
    let networkCalls = 0;
    const networkGlobals = [
      "fetch",
      "WebSocket",
      "EventSource",
      "XMLHttpRequest",
      "navigator",
    ] as const;
    const originalDescriptors = new Map<string, PropertyDescriptor>();
    for (const name of networkGlobals) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor === undefined || descriptor.configurable !== true) continue;
      originalDescriptors.set(name, descriptor);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          networkCalls += 1;
          throw new Error("network forbidden");
        },
      });
    }
    try {
      const validFixture = setup();
      const orchestrator = validFixture.orchestrator();
      const first = await orchestrator.prepare(validFixture.inputFor());
      expect(first.status).toBe("disabled-by-policy");
      expect(await orchestrator.prepare(validFixture.inputFor())).toEqual(first);

      const rejectedFixture = setup();
      expect(
        await rejectedFixture
          .orchestrator({ throwReadiness: true })
          .prepare(rejectedFixture.inputFor()),
      ).toMatchObject({ status: "rejected", reasonCode: "readiness_non_authoritative" });
      expect(networkCalls).toBe(0);
    } finally {
      for (const [name, descriptor] of originalDescriptors) {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });

  it("installs ownership before the first await and keeps concurrent observations non-mutating", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ blockReadiness: blocker });
    const owner = orchestrator.prepare(fixture.inputFor());
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "in-flight",
      reason: "preparation_in_progress",
    });
    expect(
      await orchestrator.prepare({ ...fixture.inputFor(), requestPlanId: "conflicting-plan" }),
    ).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "conflicting_preparation_identity",
    });
    release();
    expect((await owner).status).toBe("disabled-by-policy");
    expect(fixture.counts().readinessCalls).toBe(1);
  });

  it("rejects invalid input before every protected boundary", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator();
    const result = await orchestrator.prepare({ ...fixture.inputFor(), evaluatedAt: "invalid" });
    expect(result).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "invalid_input",
    });
    expect(fixture.counts()).toEqual({
      mapperCalls: 0,
      readinessCalls: 0,
      currentControlCalls: 0,
      resolverCalls: 0,
      disabledCalls: 0,
    });
  });

  it.each([
    { preparationId: "", requestPlanId: "openai-plan-m19" },
    { preparationId: "p".repeat(257), requestPlanId: "openai-plan-m19" },
    { preparationId: "../preparation-m19", requestPlanId: "openai-plan-m19" },
    { preparationId: "preparation-m19", requestPlanId: "r".repeat(257) },
  ])(
    "rejects noncanonical public identifiers without reserving them: $preparationId / $requestPlanId",
    async ({ preparationId, requestPlanId }) => {
      const fixture = setup();
      const orchestrator = fixture.orchestrator();
      const input = fixture.inputFor(preparationId, { requestPlanId });
      expect(await orchestrator.prepare(input)).toMatchObject({
        status: "rejected",
        reasonCode: "invalid_input",
      });
      expect(await orchestrator.prepare(input)).toMatchObject({
        status: "rejected",
        reasonCode: "invalid_input",
      });
      expect(fixture.counts()).toEqual({
        mapperCalls: 0,
        readinessCalls: 0,
        currentControlCalls: 0,
        resolverCalls: 0,
        disabledCalls: 0,
      });
    },
  );

  it("rejects a non-authoritative current-control snapshot before mapping or M18", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ tamperCurrentControl: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "current_control_rejected",
    });
    expect(fixture.counts()).toEqual({
      mapperCalls: 0,
      readinessCalls: 1,
      currentControlCalls: 1,
      resolverCalls: 0,
      disabledCalls: 0,
    });
  });

  it("classifies durable readiness authority failures without invoking later boundaries", async () => {
    const fixture = setup();
    expect(
      await fixture.orchestrator({ throwReadiness: true }).prepare(fixture.inputFor()),
    ).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "readiness_non_authoritative",
    });
    expect(fixture.counts()).toEqual({
      mapperCalls: 0,
      readinessCalls: 1,
      currentControlCalls: 0,
      resolverCalls: 0,
      disabledCalls: 0,
    });
  });

  it("applies readiness, model, instruction, and cache precedence before coordinate mismatch", async () => {
    const readinessFixture = setup();
    expect(
      await readinessFixture.orchestrator({ throwReadiness: true }).prepare(
        readinessFixture.inputFor("precedence-readiness", {
          credentialCoordinateMismatch: true,
        }),
      ),
    ).toMatchObject({ reasonCode: "readiness_non_authoritative" });

    const modelFixture = setup();
    expect(
      await modelFixture
        .orchestrator({ substituteModelM14Binding: true })
        .prepare(modelFixture.inputFor("precedence-model", { credentialCoordinateMismatch: true })),
    ).toMatchObject({ reasonCode: "model_policy_invalid" });

    const instructionFixture = setup();
    expect(
      await instructionFixture.orchestrator({ substituteInstructionProfile: true }).prepare(
        instructionFixture.inputFor("precedence-instruction", {
          credentialCoordinateMismatch: true,
        }),
      ),
    ).toMatchObject({ reasonCode: "instruction_profile_invalid" });

    const cacheFixture = setup();
    expect(
      await cacheFixture
        .orchestrator({ substituteCacheAuthorityBinding: "operation" })
        .prepare(cacheFixture.inputFor("precedence-cache", { credentialCoordinateMismatch: true })),
    ).toMatchObject({ reasonCode: "prompt_cache_policy_invalid" });

    for (const fixture of [readinessFixture, modelFixture, instructionFixture, cacheFixture]) {
      expect(fixture.counts()).toMatchObject({
        mapperCalls: 0,
        resolverCalls: 0,
        disabledCalls: 0,
      });
    }
  });

  it("rejects a validly re-fingerprinted model policy with substituted M14 authority", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ substituteModelM14Binding: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "model_policy_invalid",
    });
    expect(fixture.counts()).toMatchObject({ mapperCalls: 0, resolverCalls: 0 });
  });

  it("rejects future-reviewed model authority at the single evaluation time", async () => {
    const fixture = setup({ futureModelReview: true });
    const orchestrator = fixture.orchestrator();
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "authority_expired",
    });
    expect(fixture.counts().mapperCalls).toBe(0);
  });

  it("classifies valid cache and disabled-policy coordinate substitutions before mapping", async () => {
    const cacheFixture = setup();
    expect(
      await cacheFixture
        .orchestrator({ substituteCacheAdapter: true })
        .prepare(cacheFixture.inputFor()),
    ).toMatchObject({ status: "rejected", reasonCode: "coordinate_mismatch" });
    expect(cacheFixture.counts().mapperCalls).toBe(0);

    const disabledFixture = setup();
    expect(
      await disabledFixture
        .orchestrator({ substituteDisabledEnvironment: true })
        .prepare(disabledFixture.inputFor()),
    ).toMatchObject({ status: "rejected", reasonCode: "coordinate_mismatch" });
    expect(disabledFixture.counts().mapperCalls).toBe(0);
  });

  it.each([
    "readiness",
    "m14-decision",
    "model",
    "instruction",
    "cache",
    "request-mapping",
    "response-mapping",
  ] as const)(
    "rejects a re-fingerprinted disabled-policy %s binding substitution before mapping",
    async (substituteDisabledBinding) => {
      const fixture = setup();
      expect(
        await fixture
          .orchestrator({ substituteDisabledBinding })
          .prepare(fixture.inputFor(`disabled-binding-${substituteDisabledBinding}`)),
      ).toMatchObject({ status: "rejected", reasonCode: "disabled_policy_invalid" });
      expect(fixture.counts()).toMatchObject({
        mapperCalls: 0,
        resolverCalls: 0,
        disabledCalls: 0,
      });
    },
  );

  it.each([
    "operation",
    "account-retention",
    "evidence-reference",
    "privacy-window",
    "provider-retention-window",
    "account-retention-window",
  ] as const)(
    "rejects a re-fingerprinted cache %s substitution against source authority",
    async (substituteCacheAuthorityBinding) => {
      const fixture = setup();
      expect(
        await fixture.orchestrator({ substituteCacheAuthorityBinding }).prepare(fixture.inputFor()),
      ).toMatchObject({ status: "rejected", reasonCode: "prompt_cache_policy_invalid" });
      expect(fixture.counts()).toMatchObject({ mapperCalls: 0, resolverCalls: 0 });
    },
  );

  it("rejects a tampered mapper plan before M18 or disabled-adapter access", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ tamperMappedPlan: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "request_plan_invalid",
    });
    expect(fixture.counts()).toMatchObject({
      mapperCalls: 1,
      resolverCalls: 0,
      disabledCalls: 0,
    });
  });

  it("rejects a self-consistent but authority-substituted mapper plan before M18", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ rebindMappedPlan: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "request_plan_invalid",
    });
    expect(fixture.counts()).toMatchObject({ resolverCalls: 0, disabledCalls: 0 });
  });

  it("classifies a validly fingerprinted cross-environment control as a coordinate mismatch", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ currentControlEnvironment: "production" });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "coordinate_mismatch",
    });
    expect(fixture.counts()).toMatchObject({ mapperCalls: 0, resolverCalls: 0, disabledCalls: 0 });
  });

  it("classifies a validly fingerprinted projection source substitution as a coordinate mismatch", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ projectionSubstitution: "coordinate" });
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "coordinate_mismatch",
    });
    expect(fixture.counts()).toMatchObject({ mapperCalls: 0, resolverCalls: 0 });
  });

  it("rejects false projection counts before M18 even when the projection is re-fingerprinted", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ projectionSubstitution: "false-counts" });
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "request_plan_invalid",
    });
    expect(fixture.counts()).toMatchObject({ resolverCalls: 0, disabledCalls: 0 });
  });

  it("enforces M13 character and M17 input-byte limits during independent plan reproduction", async () => {
    const fixture = setup();
    const characterBound = fixture.orchestrator({ readinessMaximumInputCharacters: 1 });
    expect(
      await characterBound.prepare(fixture.inputFor("preparation-character-bound")),
    ).toMatchObject({ status: "rejected", reasonCode: "request_plan_invalid" });

    const byteFixture = setup();
    const byteBound = byteFixture.orchestrator({ projectionSubstitution: "oversized" });
    expect(await byteBound.prepare(byteFixture.inputFor("preparation-byte-bound"))).toMatchObject({
      status: "rejected",
      reasonCode: "request_plan_invalid",
    });
    expect(byteFixture.counts().resolverCalls).toBe(0);
  });

  it("enforces the recovered M14 request-byte ceiling during independent plan reproduction", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ readinessMaximumRequestBytes: 1 });
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "request_plan_invalid",
    });
    expect(fixture.counts().resolverCalls).toBe(0);
  });

  it("rejects a substituted terminal result after disabled-adapter preparation", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ tamperTerminal: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "disabled_policy_invalid",
    });
    expect(fixture.counts().disabledCalls).toBe(1);
  });

  it("rejects substituted M18 release evidence before disabled-adapter access", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ tamperCredentialResult: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toEqual({
      status: "rejected",
      taxonomyId: "M19-preparation-taxonomy-v1",
      reasonCode: "credential_resolution_non_authoritative",
    });
    expect(fixture.counts()).toMatchObject({
      mapperCalls: 1,
      resolverCalls: 1,
      disabledCalls: 0,
    });
  });

  it("rejects validly re-fingerprinted M18 evidence from another resolver", async () => {
    const fixture = setup();
    const orchestrator = fixture.orchestrator({ substituteCredentialResolver: true });
    expect(await orchestrator.prepare(fixture.inputFor())).toMatchObject({
      status: "rejected",
      reasonCode: "credential_resolution_non_authoritative",
    });
    expect(fixture.counts().disabledCalls).toBe(0);
  });
});
import { rm } from "node:fs/promises";
