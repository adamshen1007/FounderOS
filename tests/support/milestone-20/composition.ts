import { createHash } from "node:crypto";

import type {
  M20DryRunRequestV1,
  M20DryRunResultV1,
  M20FaultKind,
  M20FinalControlProfileV1,
  M20FinalControlSnapshotIssuanceRequestV1,
  M20ScenarioDescriptorV1,
} from "../../../packages/knowledge-schema/src/index.js";
import {
  FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
  OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
  OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
  createDisabledOpenAIResponsesAdapter,
} from "../../../integrations/openai-responses/src/index.js";
import {
  createSyntheticCredentialResolver,
  runDisabledSyntheticCredentialReleaseHarness,
  type SyntheticCredentialResolver,
  type SyntheticCredentialResolverConfiguration,
} from "../../../infrastructure/credential-resolver/src/index.js";
import {
  createCredentialResolutionOrchestrator,
  createCredentialResolutionRequest,
  createCredentialRevocationRecord,
  createExecutionAuthorizationRequest,
  createFounderDecisionMemoInputProjection,
  createFounderDecisionMemoInstructionProfile,
  createHumanExecutionApprovalEvidence,
  createInMemoryExecutionAuthorizationAuthority,
  createM19CurrentControlSnapshot,
  createM19DisabledAdapterPolicy,
  createM19ReadinessAuthorityEvidence,
  createM20DryRunConductor,
  createM20DryRunRequest,
  createM20FinalControlProfile,
  createM20FinalControlRehearsalEvidence,
  createOpenAIPromptCachePolicy,
  createOpenAIModelPolicy,
  createOpenAIResponsesPreparationOrchestrator,
  type CredentialResolutionPort,
  type M20DryRunConductor,
  type M20DryRunConductorConfiguration,
} from "../../../services/knowledge-engine/src/index.js";
import {
  AUTHORIZATION_FINGERPRINTS,
  authorizationAuthorityConfiguration,
  authorizationLimits,
  createAuthorizationFixture,
} from "../../../services/knowledge-engine/tests/fixtures/execution-authorization.js";

import { M20_TEST_SCENARIO_CATALOG } from "./catalog.js";
import {
  createM20TestFinalControlAuthority,
  readM20TestFinalControlObservation,
  type M20TestFinalControlConfiguration,
} from "./final-control-authority.js";
import { installM20AmbientNetworkTrap, type M20AmbientNetworkTrap } from "./network-witness.js";

export const M20_EVALUATED_AT = "2026-08-23T01:00:02.000Z";
export const M20_REHEARSAL_AT = "2026-08-23T01:00:03.000Z";
const NORMAL_DECISION_EXPIRY = "2026-08-23T01:15:00.000Z";
const M20_EXPIRED_REHEARSAL_AT = "2026-08-23T01:16:00.000Z";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(",")}}`;
}

export function m20TestFingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function scenarioFaults(scenario: M20ScenarioDescriptorV1): ReadonlySet<M20FaultKind> {
  return new Set(
    [scenario.primaryFault?.faultKind, scenario.precedenceFault?.faultKind].filter(
      (kind): kind is M20FaultKind => kind !== undefined,
    ),
  );
}

function scenarioVariant(scenario: M20ScenarioDescriptorV1): string | undefined {
  const reference = scenario.primaryFault?.fixtureReference;
  const prefix = "fixture/m20/variant/";
  return reference?.startsWith(prefix) ? reference.slice(prefix.length) : undefined;
}

function createPolicies() {
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
    pricingReviewedAt: "2026-08-23T00:00:00.000Z",
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
  return { instructionProfile, modelPolicy, promptCachePolicy };
}

function issueSeed(scenario: M20ScenarioDescriptorV1) {
  const policies = createPolicies();
  const base = createAuthorizationFixture();
  const { requestFingerprint: _requestFingerprint, ...baseRequest } = base.request;
  void _requestFingerprint;
  const authorizationRequest = createExecutionAuthorizationRequest({
    ...baseRequest,
    modelPolicyReference: policies.modelPolicy.policyId,
    modelPolicyFingerprint: policies.modelPolicy.policyFingerprint,
    executionInstructionProfileFingerprint: policies.instructionProfile.profileFingerprint,
  });
  const { evidenceFingerprint: _approvalFingerprint, ...baseApproval } = base.approval;
  void _approvalFingerprint;
  const approval = createHumanExecutionApprovalEvidence({
    ...baseApproval,
    authorizationRequestId: authorizationRequest.authorizationRequestId,
    authorizationRequestFingerprint: authorizationRequest.requestFingerprint,
    approvedLimits: authorizationRequest.limits,
  });
  const authorityConfiguration = {
    ...authorizationAuthorityConfiguration(),
    modelPolicyReference: policies.modelPolicy.policyId,
    modelPolicyFingerprint: policies.modelPolicy.policyFingerprint,
    executionInstructionProfileFingerprint: policies.instructionProfile.profileFingerprint,
  };
  const seedAuthority = createInMemoryExecutionAuthorizationAuthority(authorityConfiguration);
  const expiry = NORMAL_DECISION_EXPIRY;
  const issued = seedAuthority.issueDecision({
    schemaVersion: "1.0",
    authorizationDecisionId: `decision-${scenario.scenarioId}`,
    authorizationRequest,
    serviceIdentityEvidence: base.identity,
    humanApprovalEvidence: approval,
    evaluatedAt: M20_EVALUATED_AT,
    expiresAt: expiry,
  });
  if (issued.status !== "issued") throw new Error("M20 seed Decision issuance failed");
  const claimed = seedAuthority.claimDecision({
    schemaVersion: "1.0",
    authorizationClaimId: `claim-${scenario.scenarioId}`,
    authorizationDecision: issued.decision,
    executionAttemptId: authorizationRequest.executionAttemptId,
    executionAttemptFingerprint: authorizationRequest.executionAttemptFingerprint,
    claimedAt: M20_EVALUATED_AT,
    idempotentRetry: false,
  });
  if (claimed.status !== "claimed") throw new Error("M20 seed claim failed");
  return {
    ...policies,
    authorityConfiguration,
    authorizationRequest,
    identity: base.identity,
    approval,
    decision: issued.decision,
    claim: claimed.claim,
    expiry,
  };
}

function createProjection(seed: ReturnType<typeof issueSeed>) {
  const content = {
    schemaVersion: "1.0" as const,
    question: "Which governed option should the founder choose?",
    deliveryTransactionId: seed.authorizationRequest.deliveryTransactionId,
    deliveryTransactionFingerprint: seed.authorizationRequest.deliveryTransactionFingerprint,
    invocationRequestId: seed.authorizationRequest.invocationRequestId,
    invocationRequestFingerprint: seed.authorizationRequest.invocationRequestFingerprint,
    contextPackageId: seed.authorizationRequest.contextPackageId,
    contextPackageFingerprint: seed.authorizationRequest.contextPackageFingerprint,
    contextEntries: [
      {
        objectId: "knowledge-one",
        objectType: "decision" as const,
        canonicalContent: "Deterministic M20 evidence",
        includedContentFingerprint: "e".repeat(64),
        evidenceReference: "knowledge/one",
      },
    ],
  };
  const instructionArtifact = {
    schemaVersion: seed.instructionProfile.schemaVersion,
    profileId: seed.instructionProfile.profileId,
    serialization: seed.instructionProfile.serialization,
    instructionBlocks: seed.instructionProfile.instructionBlocks,
    sectionNames: seed.instructionProfile.sectionNames,
  };
  const instructionBytes = Buffer.byteLength(canonical(instructionArtifact), "utf8");
  const input = canonical(content);
  return createFounderDecisionMemoInputProjection({
    ...content,
    instructionCharacterCount: [...canonical(instructionArtifact)].length,
    instructionUtf8ByteCount: instructionBytes,
    inputCharacterCount: [...input].length,
    inputUtf8ByteCount: Buffer.byteLength(input, "utf8"),
    authorizedInputUtf8ByteCount: instructionBytes + Buffer.byteLength(input, "utf8"),
  });
}

function credentialRequest(seed: ReturnType<typeof issueSeed>, scenario: M20ScenarioDescriptorV1) {
  return createCredentialResolutionRequest({
    schemaVersion: "1.0",
    resolutionRequestId: `resolution-${scenario.scenarioId}`,
    authorizationDecisionId: seed.decision.authorizationDecisionId,
    authorizationDecisionFingerprint: seed.decision.decisionFingerprint,
    authorizationClaimId: seed.claim.authorizationClaimId,
    authorizationClaimFingerprint: seed.claim.claimFingerprint,
    executionAttemptId: seed.authorizationRequest.executionAttemptId,
    executionAttemptFingerprint: seed.authorizationRequest.executionAttemptFingerprint,
    subjectReference: seed.authorizationRequest.subjectReference,
    consumerId: seed.authorizationRequest.consumerId,
    deliveryTransactionId: seed.authorizationRequest.deliveryTransactionId,
    contextPackageId: seed.authorizationRequest.contextPackageId,
    invocationRequestId: seed.authorizationRequest.invocationRequestId,
    providerFamilyReference: seed.authorizationRequest.providerFamilyReference,
    adapterId: seed.authorizationRequest.adapterId,
    adapterFingerprint: seed.authorizationRequest.adapterFingerprint,
    environmentClass: seed.authorizationRequest.environmentClass,
    operation: seed.authorizationRequest.operation,
    credentialReferenceId: seed.authorizationRequest.credentialReferenceId,
    credentialReferenceFingerprint: seed.authorizationRequest.credentialReferenceFingerprint,
    expectedRotationVersion: seed.authorizationRequest.credentialRotationVersion,
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt: M20_EVALUATED_AT,
    resolutionDeadline: "2026-08-23T01:10:00.000Z",
  });
}

function resolverConfiguration(
  seed: ReturnType<typeof issueSeed>,
  faults: ReadonlySet<M20FaultKind>,
): SyntheticCredentialResolverConfiguration {
  return {
    schemaVersion: "1.0",
    resolverId: "resolver.synthetic.m20",
    credentialReferenceId: faults.has("credential-unavailable")
      ? "credential-reference-unavailable"
      : seed.authorizationRequest.credentialReferenceId,
    credentialReferenceFingerprint: seed.authorizationRequest.credentialReferenceFingerprint,
    initialRotationVersion: faults.has("credential-rotation-stale")
      ? "rotation-v2"
      : seed.authorizationRequest.credentialRotationVersion,
    initializedAt: "2026-08-23T00:00:00.000Z",
    environmentClass: seed.authorizationRequest.environmentClass,
    providerFamilyReference: seed.authorizationRequest.providerFamilyReference,
    adapterId: seed.authorizationRequest.adapterId,
    rotationAuthorityReference: "authority/credential-rotation",
    revocationAuthorityReference: "authority/credential-revocation",
  };
}

function createCredentialPort(
  seed: ReturnType<typeof issueSeed>,
  request: ReturnType<typeof credentialRequest>,
  faults: ReadonlySet<M20FaultKind>,
): { port: CredentialResolutionPort; resolver?: SyntheticCredentialResolver } {
  const configuration = resolverConfiguration(seed, faults);
  if (faults.has("credential-materialization-fault")) {
    return {
      port: {
        resolveAndRelease(command) {
          return runDisabledSyntheticCredentialReleaseHarness({
            configuration,
            command,
            faultMode: "after-materialization",
          }).result;
        },
      },
    };
  }
  const resolver = createSyntheticCredentialResolver(configuration);
  if (faults.has("credential-revoked")) {
    resolver.revoke(
      createCredentialRevocationRecord({
        schemaVersion: "1.0",
        revocationRecordId: `revocation-${request.resolutionRequestId}`,
        credentialReferenceId: seed.authorizationRequest.credentialReferenceId,
        credentialReferenceFingerprint: seed.authorizationRequest.credentialReferenceFingerprint,
        rotationVersion: seed.authorizationRequest.credentialRotationVersion,
        revocationVersion: 1,
        revokedAt: "2026-08-23T00:30:00.000Z",
        revocationAuthorityReference: configuration.revocationAuthorityReference,
        reasonCode: "credential_rotation_policy_revoked",
      }),
    );
  }
  if (faults.has("credential-deadline-expired")) {
    return {
      port: {
        resolveAndRelease: () => ({ status: "rejected", reasonCodes: ["deadline_expired"] }),
      },
      resolver,
    };
  }
  if (faults.has("credential-release-fault")) {
    return {
      port: {
        resolveAndRelease: () => ({
          status: "rejected",
          reasonCodes: ["release_integrity_failure"],
        }),
      },
      resolver,
    };
  }
  return { port: resolver, resolver };
}

function currentControlMutation(
  variant: string | undefined,
  base: ReturnType<typeof createM19CurrentControlSnapshot>,
) {
  if (!variant?.startsWith("m19-control-")) return { ...base, rateCapacity: "denied" } as never;
  if (variant.endsWith("privacy-denied")) return { ...base, privacy: "denied" } as never;
  if (variant.endsWith("retention-denied")) return { ...base, retention: "denied" } as never;
  if (variant.endsWith("circuit-open")) return { ...base, circuit: "open" } as never;
  if (variant.endsWith("health-unavailable")) return { ...base, health: "unavailable" } as never;
  if (variant.endsWith("incident-active")) return { ...base, incident: "active" } as never;
  if (variant.endsWith("kill-switch-denied")) {
    return { ...base, killSwitches: { ...base.killSwitches, global: "denied" } } as never;
  }
  return { ...base, rateCapacity: "denied" } as never;
}

function terminalMutation(
  variant: string | undefined,
  terminal: Readonly<Record<string, unknown>>,
) {
  if (!variant?.startsWith("m19-terminal-"))
    return { ...terminal, requestPlanId: "request-plan-substituted" };
  if (variant.endsWith("malformed")) {
    const { requestPlanFingerprint: _omitted, ...malformed } = terminal;
    void _omitted;
    return malformed;
  }
  if (variant.endsWith("preparation-id-mismatch"))
    return { ...terminal, preparationId: "preparation-substituted" };
  if (variant.endsWith("request-plan-id-mismatch"))
    return { ...terminal, requestPlanId: "request-plan-substituted" };
  if (variant.endsWith("adapter-id-mismatch"))
    return { ...terminal, adapterId: "adapter-substituted" };
  if (variant.endsWith("adapter-fingerprint-mismatch"))
    return { ...terminal, adapterFingerprint: "0".repeat(64) };
  if (variant.endsWith("operation-mismatch"))
    return { ...terminal, operation: "substituted-operation" };
  if (variant.endsWith("evaluation-time-mismatch"))
    return { ...terminal, evaluatedAt: "2026-08-23T01:00:01.000Z" };
  return { ...terminal, requestPlanId: "request-plan-substituted" };
}

function createM19Port(
  seed: ReturnType<typeof issueSeed>,
  scenario: M20ScenarioDescriptorV1,
  authority: ReturnType<typeof createInMemoryExecutionAuthorizationAuthority>,
  credential: ReturnType<typeof credentialRequest>,
  hold: Promise<void> | undefined,
) {
  const faults = scenarioFaults(scenario);
  const variant = scenarioVariant(scenario);
  let variantEvidence: string | undefined;
  const adapter = createDisabledOpenAIResponsesAdapter();
  const projection = createProjection(seed);
  const credentialPort = createCredentialPort(seed, credential, faults);
  const credentialOrchestrator = createCredentialResolutionOrchestrator({
    schemaVersion: "1.0",
    resolverId: "resolver.synthetic.m20",
    authority,
    port: credentialPort.port,
  });
  const readiness = () =>
    createM19ReadinessAuthorityEvidence({
      schemaVersion: "1.0",
      preparationId: `preparation-${scenario.scenarioId}`,
      executionAttemptId: seed.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: seed.authorizationRequest.executionAttemptFingerprint,
      authorizationDecisionId: seed.decision.authorizationDecisionId,
      authorizationDecisionFingerprint: seed.decision.decisionFingerprint,
      authorizationClaimId: seed.claim.authorizationClaimId,
      authorizationClaimFingerprint: seed.claim.claimFingerprint,
      adapterId: seed.authorizationRequest.adapterId,
      adapterFingerprint: seed.authorizationRequest.adapterFingerprint,
      providerFamilyReference: "provider-family/openai",
      environmentClass: seed.authorizationRequest.environmentClass,
      operation: "founder-decision-memo",
      readinessTransactionId: "readiness-transaction-m20",
      readinessTransactionFingerprint: "b".repeat(64),
      m14DecisionId: "m14-decision-m20",
      m14DecisionFingerprint: seed.modelPolicy.m14ReadinessDecisionFingerprint,
      m14RequestPlanId: "m14-plan-m20",
      m14RequestPlanFingerprint: "d".repeat(64),
      m14ProviderCapabilityFingerprint: seed.modelPolicy.m14ProviderCapabilityFingerprint,
      m14CompatibilityFingerprint: seed.modelPolicy.m14CompatibilityFingerprint,
      m14RateCapacityFingerprint: seed.modelPolicy.m14RateCapacityFingerprint,
      m14CostBudgetFingerprint: seed.modelPolicy.m14CostBudgetFingerprint,
      m14TransportPolicyFingerprint: seed.modelPolicy.m14TransportPolicyFingerprint,
      privacyPolicyFingerprint: seed.modelPolicy.privacyPolicyFingerprint,
      m14PricingEvidenceId: seed.modelPolicy.pricingEvidenceId,
      m14PricingEvidenceFingerprint: seed.modelPolicy.pricingEvidenceFingerprint,
      providerRetentionEvidenceId: seed.modelPolicy.providerRetentionEvidenceId,
      providerRetentionEvidenceFingerprint: seed.modelPolicy.providerRetentionEvidenceFingerprint,
      policyAuthorityEvidenceFingerprint: "e".repeat(64),
      pricingReviewedAt: seed.modelPolicy.pricingReviewedAt,
      pricingExpiresAt: seed.modelPolicy.pricingExpiresAt,
      privacyReviewedAt: seed.promptCachePolicy.privacyReviewedAt,
      privacyExpiresAt: seed.promptCachePolicy.privacyExpiresAt,
      providerRetentionReviewedAt: seed.modelPolicy.providerRetentionReviewedAt,
      providerRetentionExpiresAt: seed.modelPolicy.providerRetentionExpiresAt,
      accountRetentionEvidenceId: seed.modelPolicy.accountRetentionEvidenceId,
      accountRetentionEvidenceFingerprint: seed.modelPolicy.accountRetentionEvidenceFingerprint,
      accountRetentionReviewedAt: seed.modelPolicy.accountRetentionReviewedAt,
      accountRetentionExpiresAt: seed.modelPolicy.accountRetentionExpiresAt,
      operationFingerprint: seed.promptCachePolicy.operationFingerprint,
      cachePolicyReviewedAt: seed.promptCachePolicy.reviewedAt,
      cachePolicyExpiresAt: seed.promptCachePolicy.expiresAt,
      cacheEvidenceReference: seed.promptCachePolicy.evidenceReference,
      m14DecisionStatus: "ready-for-dry-run",
      adapterState: "dry-run-mapping",
      maximumRequestBytes: 50_000,
      maximumResponseBytes: 30_000,
      maximumInputCharacters: 20_000,
      maximumOutputCharacters: 10_000,
      evaluatedAt: M20_EVALUATED_AT,
      expiresAt: "2026-08-23T01:10:00.000Z",
      issuerReference: "authority/readiness",
    });
  const alternateInstruction = faults.has("instruction-profile-invalid")
    ? createFounderDecisionMemoInstructionProfile({
        ...FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
        instructionBlocks: [
          `${FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[0]} altered`,
          FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[1],
          FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks[2],
        ],
      })
    : seed.instructionProfile;
  const createCurrentControls = (input: {
    readonly preparationId: string;
    readonly readiness: ReturnType<typeof readiness>;
  }) =>
    createM19CurrentControlSnapshot({
      schemaVersion: "1.0",
      preparationId: input.preparationId,
      executionAttemptId: seed.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: seed.authorizationRequest.executionAttemptFingerprint,
      authorizationDecisionId: seed.decision.authorizationDecisionId,
      authorizationDecisionFingerprint: seed.decision.decisionFingerprint,
      authorizationClaimId: seed.claim.authorizationClaimId,
      authorizationClaimFingerprint: seed.claim.claimFingerprint,
      adapterId: seed.authorizationRequest.adapterId,
      adapterFingerprint: seed.authorizationRequest.adapterFingerprint,
      providerFamilyReference: "provider-family/openai",
      environmentClass: "evaluation",
      operation: "founder-decision-memo",
      readinessTransactionId: input.readiness.readinessTransactionId,
      readinessTransactionFingerprint: input.readiness.readinessTransactionFingerprint,
      m14DecisionId: input.readiness.m14DecisionId,
      m14DecisionFingerprint: input.readiness.m14DecisionFingerprint,
      modelId: seed.modelPolicy.modelId,
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
      evaluatedAt: M20_EVALUATED_AT,
      expiresAt: "2026-08-23T01:05:00.000Z",
      issuerReference: "authority/current-controls",
    });
  const createDisabledPolicy = (input: {
    readonly readiness: ReturnType<typeof readiness>;
    readonly modelPolicy: typeof seed.modelPolicy;
    readonly promptCachePolicy: typeof seed.promptCachePolicy;
    readonly instructionProfile: typeof seed.instructionProfile;
  }) =>
    createM19DisabledAdapterPolicy({
      schemaVersion: "1.0",
      policyId: "disabled-policy-one",
      policyVersion: "v1",
      state: "disabled",
      terminalResult: "disabled-by-policy",
      adapterId: seed.authorizationRequest.adapterId,
      adapterFingerprint: seed.authorizationRequest.adapterFingerprint,
      readinessTransactionFingerprint: input.readiness.readinessTransactionFingerprint,
      m14DecisionFingerprint: input.readiness.m14DecisionFingerprint,
      modelPolicyFingerprint: input.modelPolicy.policyFingerprint,
      instructionProfileFingerprint: input.instructionProfile.profileFingerprint,
      promptCachePolicyFingerprint: input.promptCachePolicy.policyFingerprint,
      requestMappingProfileFingerprint: OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
      responseMappingProfileFingerprint: OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
      environmentClass: "evaluation",
      operation: "founder-decision-memo",
    });
  const readinessArtifact = readiness();
  const suppliedReadiness = (() => {
    if (variant === "m14-m15-readiness-stale") {
      const { evidenceFingerprint: _fingerprint, ...unsigned } = readinessArtifact;
      void _fingerprint;
      return createM19ReadinessAuthorityEvidence({ ...unsigned, expiresAt: M20_EVALUATED_AT });
    }
    return faults.has("readiness-non-authoritative")
      ? (Object.freeze({
          ...readinessArtifact,
          issuerReference: "authority/readiness-substituted",
        }) as typeof readinessArtifact)
      : readinessArtifact;
  })();
  const currentControlSnapshot = createCurrentControls({
    preparationId: `preparation-${scenario.scenarioId}`,
    readiness: readinessArtifact,
  });
  const suppliedCurrentControl = faults.has("current-control-rejected")
    ? Object.freeze(currentControlMutation(variant, currentControlSnapshot))
    : currentControlSnapshot;
  const suppliedModelPolicy = (() => {
    if (!faults.has("model-policy-invalid")) return seed.modelPolicy;
    const { policyFingerprint: _fingerprint, ...policy } = seed.modelPolicy;
    void _fingerprint;
    return createOpenAIModelPolicy({ ...policy, m14CompatibilityFingerprint: "f".repeat(64) });
  })();
  const suppliedPromptCachePolicy = (() => {
    if (!faults.has("prompt-cache-policy-invalid")) return seed.promptCachePolicy;
    const { policyFingerprint: _fingerprint, ...policy } = seed.promptCachePolicy;
    void _fingerprint;
    return createOpenAIPromptCachePolicy({ ...policy, operationFingerprint: "f".repeat(64) });
  })();
  const suppliedDisabledPolicy = createDisabledPolicy({
    readiness: readinessArtifact,
    modelPolicy: suppliedModelPolicy,
    promptCachePolicy: suppliedPromptCachePolicy,
    instructionProfile: alternateInstruction,
  });
  let terminalObservation:
    | {
        readonly variant: string;
        readonly before: Readonly<Record<string, unknown>>;
        readonly after: Readonly<Record<string, unknown>>;
        readonly changedFields: readonly string[];
      }
    | undefined;
  const orchestrator = createOpenAIResponsesPreparationOrchestrator({
    schemaVersion: "1.0",
    authorizationAuthority: authority,
    readinessAuthority: {
      async resolve() {
        await hold;
        if (faults.has("readiness-non-authoritative")) {
          variantEvidence =
            variant === "m14-m15-readiness-stale"
              ? "readiness-authority-stale"
              : variant === "m14-m15-readiness-non-authoritative"
                ? "readiness-authority-non-authoritative"
                : undefined;
        }
        return suppliedReadiness;
      },
    },
    currentControlAuthority: {
      async evaluate() {
        return suppliedCurrentControl;
      },
    },
    inputProjectionAuthority: {
      async resolve() {
        return projection;
      },
    },
    modelPolicyAuthority: {
      resolve() {
        return suppliedModelPolicy;
      },
    },
    promptCachePolicyAuthority: {
      resolve() {
        return suppliedPromptCachePolicy;
      },
    },
    disabledPolicyAuthority: {
      resolve() {
        return suppliedDisabledPolicy;
      },
    },
    instructionProfile: alternateInstruction,
    requestMapper: {
      mapRequest(input) {
        return adapter.mapRequest(input);
      },
    },
    credentialResolutionOrchestrator: credentialOrchestrator,
    credentialResolverId: "resolver.synthetic.m20",
    requestMappingProfileFingerprint: OPENAI_RESPONSES_REQUEST_MAPPING_PROFILE_FINGERPRINT,
    responseMappingProfileFingerprint: OPENAI_RESPONSES_RESPONSE_MAPPING_PROFILE_FINGERPRINT,
    disabledAdapter: adapter,
  });
  return {
    async prepare(input: Parameters<typeof orchestrator.prepare>[0]) {
      const result = await orchestrator.prepare(input);
      if (result.status === "disabled-by-policy" && variant?.startsWith("m19-terminal-")) {
        variantEvidence = variant;
      }
      if (
        faults.has("m19-terminal-malformed-or-known-coordinate-mismatch") &&
        result.status === "disabled-by-policy"
      ) {
        const mutated = terminalMutation(variant, result);
        if (variant?.startsWith("m19-terminal-")) {
          const keys = new Set([...Object.keys(result), ...Object.keys(mutated)]);
          terminalObservation = Object.freeze({
            variant,
            before: result,
            after: Object.freeze(mutated),
            changedFields: Object.freeze(
              [...keys].filter((key) => result[key as keyof typeof result] !== mutated[key]),
            ),
          });
        }
        return mutated as never;
      }
      return result;
    },
    adapter,
    resolver: credentialPort.resolver,
    sources: Object.freeze({
      readiness: readinessArtifact,
      suppliedReadiness,
      inputProjection: projection,
      currentControlSnapshot,
      suppliedCurrentControl,
      suppliedModelPolicy,
      suppliedPromptCachePolicy,
      suppliedInstructionProfile: alternateInstruction,
      suppliedDisabledPolicy,
      disabledAdapterState: "disabled",
    }),
    readVariantEvidence: () => variantEvidence,
    readTerminalMutation: () => terminalObservation,
    createIsolatedPlan() {
      const readinessValue = readiness();
      const currentControls = createCurrentControls({
        preparationId: `preparation-${scenario.scenarioId}`,
        readiness: readinessValue,
      });
      const disabledPolicy = createDisabledPolicy({
        readiness: readinessValue,
        modelPolicy: seed.modelPolicy,
        promptCachePolicy: seed.promptCachePolicy,
        instructionProfile: seed.instructionProfile,
      });
      const mapped = adapter.mapRequest({
        schemaVersion: "1.0",
        requestPlanId: `isolated-plan-${scenario.scenarioId}`,
        readiness: readinessValue,
        currentControls,
        modelPolicy: seed.modelPolicy,
        instructionProfile: seed.instructionProfile,
        inputProjection: projection,
        promptCachePolicy: seed.promptCachePolicy,
        disabledPolicy,
        authorizationLimits: {
          maximumInputBytes: seed.authorizationRequest.limits.maximumInputBytes,
          maximumOutputBytes: seed.authorizationRequest.limits.maximumOutputBytes,
          maximumInputTokens: seed.authorizationRequest.limits.maximumInputTokens,
          maximumOutputTokens: seed.authorizationRequest.limits.maximumOutputTokens,
        },
      });
      if (mapped.status !== "mapped") throw new Error("Isolated M19 mapping failed");
      return mapped.plan;
    },
  };
}

export function createM20TestFinalControlProfiles(): readonly M20FinalControlProfileV1[] {
  return M20_TEST_SCENARIO_CATALOG.scenarios.map((scenario) =>
    createM20FinalControlProfile({
      schemaVersion: "1.0",
      profileReference: scenario.finalControlProfileReference,
      scenarioId: scenario.scenarioId,
      validFrom: M20_EVALUATED_AT,
      validUntil: "2026-08-23T02:00:00.000Z",
      globalKillSwitch: "allow",
      providerKillSwitch: "allow",
      adapterKillSwitch: "allow",
      modelKillSwitch: "allow",
      environmentKillSwitch: "allow",
      operationKillSwitch: "allow",
      incidentState: "clear",
      credentialReferenceState: "current",
      circuitState: "closed",
      healthState: "healthy",
      authorizationRevocationState: "active",
    }),
  );
}

export function createM20TestFinalControlConfiguration(): M20TestFinalControlConfiguration {
  return {
    schemaVersion: "1.0",
    authorityId: "final-control-authority-m20",
    catalog: M20_TEST_SCENARIO_CATALOG,
    profiles: createM20TestFinalControlProfiles(),
  };
}

export interface M20TestComposition {
  readonly scenario: M20ScenarioDescriptorV1;
  readonly request: M20DryRunRequestV1;
  readonly conductor: M20DryRunConductor;
  readonly trap: M20AmbientNetworkTrap;
  readonly sourceSnapshot: string;
  readonly sourceFingerprint: string;
  readonly sourceInventory: Readonly<Record<string, unknown>>;
  readonly readSourceInventory: () => Readonly<Record<string, unknown>>;
  readonly readSourceSnapshot: () => string;
  readonly readFinalControlDenialReason: () => string | undefined;
  readonly protectedCounts: () => Record<string, number>;
  readonly releaseConcurrency: () => void;
  readonly run: () => Promise<M20DryRunResultV1>;
  readonly restore: () => void;
  readonly variant: string | undefined;
  readonly readVariantEvidence: () => string | undefined;
  readonly readM19TerminalMutation: () =>
    | {
        readonly variant: string;
        readonly before: Readonly<Record<string, unknown>>;
        readonly after: Readonly<Record<string, unknown>>;
        readonly changedFields: readonly string[];
      }
    | undefined;
  readonly readFinalControlRequest: () => M20FinalControlSnapshotIssuanceRequestV1 | undefined;
}

export function createM20IsolatedFixtureMapping() {
  const scenario = M20_TEST_SCENARIO_CATALOG.scenarios.find(
    (entry) => entry.scenarioId === "00-success",
  );
  if (scenario === undefined) throw new Error("M20 success scenario is unavailable");
  const seed = issueSeed(scenario);
  const request = credentialRequest(seed, scenario);
  const authority = createInMemoryExecutionAuthorizationAuthority(seed.authorityConfiguration);
  const m19 = createM19Port(seed, scenario, authority, request, undefined);
  return Object.freeze({ adapter: m19.adapter, plan: m19.createIsolatedPlan() });
}

export function createM20TestComposition(scenarioId = "00-success"): M20TestComposition {
  const scenario = M20_TEST_SCENARIO_CATALOG.scenarios.find(
    (entry) => entry.scenarioId === scenarioId,
  );
  if (scenario === undefined) throw new TypeError("Unknown M20 scenario");
  const variant = scenarioVariant(scenario);
  const trap = installM20AmbientNetworkTrap();
  try {
    const seed = issueSeed(scenario);
    const faults = scenarioFaults(scenario);
    const credential = credentialRequest(seed, scenario);
    const authority = createInMemoryExecutionAuthorizationAuthority(seed.authorityConfiguration);
    let variantEvidence: string | undefined;
    let capturedFinalControlRequest: M20FinalControlSnapshotIssuanceRequestV1 | undefined;
    const protectedCalls = {
      authorizationIssuanceCalls: 0,
      authorizationClaimCalls: 0,
      authorizationVerificationCalls: 0,
      m19PreparationCalls: 0,
      finalControlIssuanceCalls: 0,
      finalControlVerificationCalls: 0,
    };
    let release: (() => void) | undefined;
    const hold =
      scenario.purpose === "concurrency"
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : undefined;
    const m19 = createM19Port(seed, scenario, authority, credential, hold);
    const final = createM20TestFinalControlAuthority(createM20TestFinalControlConfiguration());
    const authorizationPort: M20DryRunConductorConfiguration["authorizationAuthority"] = {
      issueDecision(input) {
        protectedCalls.authorizationIssuanceCalls += 1;
        if (variant === "m17-denied") {
          const denied = authority.issueDecision({
            ...input,
            evaluatedAt: "2026-08-23T01:16:00.000Z",
            expiresAt: "2026-08-23T01:15:00.000Z",
          });
          variantEvidence =
            denied.status === "rejected" ? denied.reasonCodes[0] : "unexpected-issued";
          return denied;
        }
        if (variant === "m17-mismatched") {
          const alternateAuthority = createInMemoryExecutionAuthorizationAuthority(
            seed.authorityConfiguration,
          );
          const substituted = alternateAuthority.issueDecision({
            ...input,
            authorizationDecisionId: `decision-substituted-${scenario.scenarioId}`,
          });
          variantEvidence =
            substituted.status === "issued"
              ? "substituted-decision-coordinate"
              : "unexpected-rejected";
          return substituted;
        }
        if (faults.has("authorization-issuance-denied"))
          return { status: "rejected", reasonCodes: ["policy_denied"] } as never;
        const issued = authority.issueDecision(input);
        if (issued.status === "issued" && variant === "m17-revoked") {
          const revoked = authority.revokeDecision({
            schemaVersion: "1.0",
            authorizationDecisionId: issued.decision.authorizationDecisionId,
            revocationAuthorityReference: seed.authorityConfiguration.revocationAuthorityReference,
            revocationVersion: 1,
            revokedAt: "2026-08-23T01:00:03.000Z",
          });
          variantEvidence = revoked.status;
        }
        if (issued.status === "issued" && variant === "m17-already-claimed") {
          const seededClaim = authority.claimDecision({
            schemaVersion: "1.0",
            authorizationClaimId: seed.claim.authorizationClaimId,
            authorizationDecision: issued.decision,
            executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
            executionAttemptFingerprint:
              issued.decision.authorizationRequest.executionAttemptFingerprint,
            claimedAt: M20_EVALUATED_AT,
            idempotentRetry: false,
          });
          variantEvidence = seededClaim.status;
        }
        return issued;
      },
      verifyDecision(input) {
        protectedCalls.authorizationVerificationCalls += 1;
        if (variant === "m17-expired") {
          const result = authority.verifyDecision({
            ...input,
            evaluatedAt: "2026-08-23T01:16:00.000Z",
          });
          variantEvidence =
            result.status === "invalid" ? result.reasonCodes[0] : "unexpected-valid";
          return result;
        }
        if (variant === "m17-revoked" || variant === "m17-mismatched") {
          const result = authority.verifyDecision(input);
          variantEvidence = result.status === "invalid" ? result.reasonCodes[0] : variantEvidence;
          return result;
        }
        if (faults.has("authorization-decision-non-authoritative")) {
          return { status: "invalid", reasonCodes: ["non_authoritative_artifact"] } as never;
        }
        return authority.verifyDecision(input);
      },
      claimDecision(input) {
        protectedCalls.authorizationClaimCalls += 1;
        if (variant === "m17-already-claimed") {
          const result = authority.claimDecision(input);
          variantEvidence =
            result.status === "rejected" ? result.reasonCodes[0] : "unexpected-claimed";
          return result;
        }
        if (faults.has("authorization-claim-conflict"))
          return { status: "rejected", reasonCodes: ["conflicting_identity"] } as never;
        const claimed = authority.claimDecision(input);
        return claimed;
      },
      verifyClaim(input) {
        protectedCalls.authorizationVerificationCalls += 1;
        if (faults.has("authorization-claim-non-authoritative")) {
          return { status: "invalid", reasonCodes: ["non_authoritative_artifact"] } as never;
        }
        return authority.verifyClaim(input);
      },
    };
    const finalPort: M20DryRunConductorConfiguration["finalControlAuthority"] = {
      issueSnapshot(input) {
        protectedCalls.finalControlIssuanceCalls += 1;
        capturedFinalControlRequest = input;
        return final.issueSnapshot(input);
      },
      verifySnapshot(input) {
        protectedCalls.finalControlVerificationCalls += 1;
        return final.verifySnapshot(input);
      },
    };
    const m19Port: M20DryRunConductorConfiguration["m19PreparationPort"] = {
      async prepare(input) {
        protectedCalls.m19PreparationCalls += 1;
        return m19.prepare(input);
      },
    };
    const request = createM20DryRunRequest({
      schemaVersion: "1.0",
      runId: `run-${scenario.scenarioId}`,
      scenarioId: scenario.scenarioId,
      scenarioFingerprint: scenario.scenarioFingerprint,
      catalogFingerprint: M20_TEST_SCENARIO_CATALOG.catalogFingerprint,
      evaluatedAt: M20_EVALUATED_AT,
      rehearsalEvaluatedAt: faults.has("final-control-authorization-expired")
        ? M20_EXPIRED_REHEARSAL_AT
        : M20_REHEARSAL_AT,
      authorizationRequest: seed.authorizationRequest,
      serviceIdentityEvidence: seed.identity,
      humanApprovalEvidence: seed.approval,
      authorizationDecisionId: seed.decision.authorizationDecisionId,
      authorizationDecisionExpiresAt: seed.expiry,
      authorizationClaimId: seed.claim.authorizationClaimId,
      preparationId: `preparation-${scenario.scenarioId}`,
      requestPlanId: `request-plan-${scenario.scenarioId}`,
      credentialResolutionRequest: credential,
      finalControlSnapshotId: `snapshot-${scenario.scenarioId}`,
      rehearsalEvidenceId: `rehearsal-${scenario.scenarioId}`,
    });
    const resolverState = m19.resolver?.inspect();
    const sourceInventory = Object.freeze({
      m12Delivery: Object.freeze({
        deliveryTransactionId: seed.authorizationRequest.deliveryTransactionId,
        deliveryTransactionFingerprint: seed.authorizationRequest.deliveryTransactionFingerprint,
        contextPackageId: seed.authorizationRequest.contextPackageId,
        contextPackageFingerprint: seed.authorizationRequest.contextPackageFingerprint,
      }),
      m13Invocation: Object.freeze({
        deliveryTransactionId: seed.authorizationRequest.deliveryTransactionId,
        contextPackageId: seed.authorizationRequest.contextPackageId,
        invocationRequestId: seed.authorizationRequest.invocationRequestId,
      }),
      m14Readiness: Object.freeze({
        decisionId: m19.sources.readiness.m14DecisionId,
        decisionFingerprint: m19.sources.readiness.m14DecisionFingerprint,
        requestPlanId: m19.sources.readiness.m14RequestPlanId,
        requestPlanFingerprint: m19.sources.readiness.m14RequestPlanFingerprint,
      }),
      m15ReadinessAuthority: Object.freeze(m19.sources.readiness),
      m16Policy: Object.freeze({
        instructionProfile: seed.instructionProfile,
        modelPolicy: seed.modelPolicy,
        promptCachePolicy: seed.promptCachePolicy,
      }),
      m17Authorization: Object.freeze({
        identity: seed.identity,
        approval: seed.approval,
        decision: seed.decision,
        claim: seed.claim,
      }),
      m18CredentialResolution: Object.freeze({
        request: credential,
        resolverAuthorityState:
          resolverState === undefined
            ? "synthetic-harness-without-observable-registry"
            : {
                resolverId: resolverState.resolverId,
                activeRotationVersion: resolverState.activeRotationVersion,
                rotationSequence: resolverState.rotationSequence,
                currentRevocationVersion: resolverState.currentRevocationVersion,
                activeVersionRevoked: resolverState.activeVersionRevoked,
              },
      }),
      m19Preparation: Object.freeze(m19.sources),
      canonicalSourcesAndLedgers: Object.freeze({
        canonicalSourceDocuments: "preconstructed-authoritative-fixtures-no-filesystem-capability",
        durableLedgers: "not-used-by-m20-test-composition",
      }),
    });
    const sourceSnapshot = canonical(sourceInventory);
    const conductor = createM20DryRunConductor({
      schemaVersion: "1.0",
      catalog: M20_TEST_SCENARIO_CATALOG,
      authorizationAuthority: authorizationPort,
      m19PreparationPort: m19Port,
      finalControlAuthority: finalPort,
      networkAttemptWitness: trap.witness,
    });
    return Object.freeze({
      scenario,
      request,
      conductor,
      trap,
      sourceSnapshot,
      sourceInventory,
      sourceFingerprint: m20TestFingerprint(sourceInventory),
      readSourceSnapshot: () => canonical(sourceInventory),
      readSourceInventory: () => sourceInventory,
      readFinalControlDenialReason: () => {
        const snapshot = readM20TestFinalControlObservation(final, request.runId);
        if (snapshot === undefined) return undefined;
        const evidence = createM20FinalControlRehearsalEvidence({
          rehearsalEvidenceId: request.rehearsalEvidenceId,
          snapshot,
        });
        return evidence.outcome === "would-deny" ? evidence.denialReasonCode : undefined;
      },
      protectedCounts: () => ({ ...protectedCalls }),
      releaseConcurrency: () => release?.(),
      run: () => conductor.run(request),
      restore: trap.restore,
      variant,
      readVariantEvidence: () => variantEvidence ?? m19.readVariantEvidence(),
      readM19TerminalMutation: () => m19.readTerminalMutation(),
      readFinalControlRequest: () => capturedFinalControlRequest,
    });
  } catch (error) {
    trap.restore();
    throw error;
  }
}
