import {
  FounderDecisionMemoInputProjectionSchema,
  FounderDecisionMemoInstructionProfileSchema,
  M19CurrentControlSnapshotSchema,
  M19DisabledAdapterPolicySchema,
  M19PolicyAuthorityEvidenceSchema,
  M19PreparationResultSchema,
  M19ReadinessAuthorityEvidenceSchema,
  OpenAIPromptCachePolicySchema,
  OpenAIModelPolicySchema,
  OpenAIResponsesMappingEvidenceSchema,
  OpenAIResponsesRequestPlanSchema,
  findDurableCanonicalJsonIssue,
  type FounderDecisionMemoInputProjection,
  type FounderDecisionMemoInstructionProfile,
  type M19ArtifactVerificationResult,
  type M19CurrentControlSnapshot,
  type M19DisabledAdapterPolicy,
  type M19PolicyAuthorityEvidence,
  type M19ReadinessAuthorityEvidence,
  type OpenAIPromptCachePolicy,
  type OpenAIModelPolicy,
  type OpenAIResponsesRequestPlan,
} from "@founderos/knowledge-schema";

import {
  createDurableCanonicalJsonSha256Fingerprint,
  serializeDurableCanonicalJsonValue,
} from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

interface SafeParseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

type ReadinessInput = Omit<M19ReadinessAuthorityEvidence, "evidenceFingerprint">;
type PolicyAuthorityEvidenceInput = Omit<M19PolicyAuthorityEvidence, "evidenceFingerprint">;
type CurrentControlInput = Omit<M19CurrentControlSnapshot, "snapshotFingerprint">;
type ModelPolicyInput = Omit<OpenAIModelPolicy, "policyFingerprint">;
type CachePolicyInput = Omit<OpenAIPromptCachePolicy, "policyFingerprint">;
type InstructionProfileInput = Omit<
  FounderDecisionMemoInstructionProfile,
  "profileFingerprint" | "instructionBlocks" | "sectionNames"
> & {
  readonly instructionBlocks: readonly [string, string, string];
  readonly sectionNames: readonly [
    "Decision question",
    "Executive summary",
    "Options considered",
    "Recommendation",
    "Evidence references",
    "Assumptions and uncertainties",
    "Risks",
    "Proposed next action",
  ];
};
type InputProjectionInput = Omit<FounderDecisionMemoInputProjection, "projectionFingerprint">;
type DisabledPolicyInput = Omit<M19DisabledAdapterPolicy, "policyFingerprint">;

const DOMAINS = Object.freeze({
  readiness: "founderos.m19.readiness-authority-evidence.v1",
  policyAuthority: "founderos.m19.policy-authority-evidence.v1",
  currentControls: "founderos.m19.current-control-snapshot.v1",
  modelPolicy: "founderos.m19.openai-model-policy.v1",
  cachePolicy: "founderos.m19.openai-prompt-cache-policy.v1",
  instructionProfile: "founderos.m19.instruction-profile.v1",
  inputProjection: "founderos.m19.input-projection.v1",
  disabledPolicy: "founderos.m19.disabled-adapter-policy.v1",
  requestPlan: "founderos.m19.openai-responses-request-plan.v1",
  mappingEvidence: "founderos.m19.openai-responses-mapping-evidence.v1",
});

function fingerprint(domain: string, artifact: unknown): string {
  return createDurableCanonicalJsonSha256Fingerprint({ domain, artifact });
}

function createArtifact<T extends object>(
  schema: SafeParseSchema<T>,
  input: unknown,
  fingerprintKey: string,
  domain: string,
): T {
  if (
    findDurableCanonicalJsonIssue(input) !== null ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Reflect.ownKeys(input).includes(fingerprintKey)
  ) {
    throw new TypeError("M19 artifact input is invalid");
  }
  try {
    const captured = structuredClone(input) as Record<string, unknown>;
    const parsed = schema.safeParse({
      ...captured,
      [fingerprintKey]: fingerprint(domain, captured),
    });
    if (!parsed.success) throw new TypeError("invalid");
    return deepFreeze(structuredClone(parsed.data));
  } catch {
    throw new TypeError("M19 artifact input is invalid");
  }
}

function verifyArtifact<T extends object>(
  schema: SafeParseSchema<T>,
  value: unknown,
  fingerprintKey: string,
  domain: string,
): M19ArtifactVerificationResult {
  try {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new TypeError("invalid");
    const artifact = { ...(parsed.data as Record<string, unknown>) };
    const observed = artifact[fingerprintKey];
    delete artifact[fingerprintKey];
    if (observed !== fingerprint(domain, artifact)) throw new TypeError("invalid");
    return deepFreeze({ status: "valid" });
  } catch {
    return deepFreeze({ status: "invalid", reasonCode: "non_authoritative_artifact" });
  }
}

export const createM19ReadinessAuthorityEvidence = (input: ReadinessInput) =>
  createArtifact(
    M19ReadinessAuthorityEvidenceSchema,
    input,
    "evidenceFingerprint",
    DOMAINS.readiness,
  );
export const verifyM19ReadinessAuthorityEvidence = (value: unknown) =>
  verifyArtifact(
    M19ReadinessAuthorityEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.readiness,
  );
export const createM19PolicyAuthorityEvidence = (input: PolicyAuthorityEvidenceInput) =>
  createArtifact(
    M19PolicyAuthorityEvidenceSchema,
    input,
    "evidenceFingerprint",
    DOMAINS.policyAuthority,
  );
export const verifyM19PolicyAuthorityEvidence = (value: unknown) =>
  verifyArtifact(
    M19PolicyAuthorityEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.policyAuthority,
  );
export const createM19CurrentControlSnapshot = (input: CurrentControlInput) =>
  createArtifact(
    M19CurrentControlSnapshotSchema,
    input,
    "snapshotFingerprint",
    DOMAINS.currentControls,
  );
export const verifyM19CurrentControlSnapshot = (value: unknown) =>
  verifyArtifact(
    M19CurrentControlSnapshotSchema,
    value,
    "snapshotFingerprint",
    DOMAINS.currentControls,
  );
export const createOpenAIModelPolicy = (input: ModelPolicyInput) =>
  createArtifact(OpenAIModelPolicySchema, input, "policyFingerprint", DOMAINS.modelPolicy);
export const verifyOpenAIModelPolicy = (value: unknown) =>
  verifyArtifact(OpenAIModelPolicySchema, value, "policyFingerprint", DOMAINS.modelPolicy);
export const createOpenAIPromptCachePolicy = (input: CachePolicyInput) =>
  createArtifact(OpenAIPromptCachePolicySchema, input, "policyFingerprint", DOMAINS.cachePolicy);
export const verifyOpenAIPromptCachePolicy = (value: unknown) =>
  verifyArtifact(OpenAIPromptCachePolicySchema, value, "policyFingerprint", DOMAINS.cachePolicy);
export const createFounderDecisionMemoInstructionProfile = (input: InstructionProfileInput) =>
  createArtifact(
    FounderDecisionMemoInstructionProfileSchema,
    input,
    "profileFingerprint",
    DOMAINS.instructionProfile,
  );
export const verifyFounderDecisionMemoInstructionProfile = (value: unknown) =>
  verifyArtifact(
    FounderDecisionMemoInstructionProfileSchema,
    value,
    "profileFingerprint",
    DOMAINS.instructionProfile,
  );
export const createFounderDecisionMemoInputProjection = (input: InputProjectionInput) =>
  createArtifact(
    FounderDecisionMemoInputProjectionSchema,
    input,
    "projectionFingerprint",
    DOMAINS.inputProjection,
  );
export const verifyFounderDecisionMemoInputProjection = (value: unknown) =>
  verifyArtifact(
    FounderDecisionMemoInputProjectionSchema,
    value,
    "projectionFingerprint",
    DOMAINS.inputProjection,
  );
export const createM19DisabledAdapterPolicy = (input: DisabledPolicyInput) =>
  createArtifact(
    M19DisabledAdapterPolicySchema,
    input,
    "policyFingerprint",
    DOMAINS.disabledPolicy,
  );
export const verifyM19DisabledAdapterPolicy = (value: unknown) =>
  verifyArtifact(
    M19DisabledAdapterPolicySchema,
    value,
    "policyFingerprint",
    DOMAINS.disabledPolicy,
  );
export const verifyOpenAIResponsesRequestPlan = (value: unknown) =>
  verifyArtifact(
    OpenAIResponsesRequestPlanSchema,
    value,
    "requestPlanFingerprint",
    DOMAINS.requestPlan,
  );
export const verifyOpenAIResponsesMappingEvidence = (value: unknown) =>
  verifyArtifact(
    OpenAIResponsesMappingEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.mappingEvidence,
  );

export interface OpenAIResponsesPlanAuthorityInput {
  readonly requestPlanId: string;
  readonly readiness: M19ReadinessAuthorityEvidence;
  readonly currentControls: M19CurrentControlSnapshot;
  readonly modelPolicy: OpenAIModelPolicy;
  readonly instructionProfile: FounderDecisionMemoInstructionProfile;
  readonly inputProjection: FounderDecisionMemoInputProjection;
  readonly promptCachePolicy: OpenAIPromptCachePolicy;
  readonly disabledPolicy: M19DisabledAdapterPolicy;
  readonly requestMappingProfileFingerprint: string;
  readonly responseMappingProfileFingerprint: string;
  readonly authorizationLimits: {
    readonly maximumInputBytes: number;
    readonly maximumOutputBytes: number;
    readonly maximumInputTokens: number;
    readonly maximumOutputTokens: number;
  };
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function characters(value: string): number {
  return [...value].length;
}

export function reproduceOpenAIResponsesRequestPlan(
  input: OpenAIResponsesPlanAuthorityInput,
): OpenAIResponsesRequestPlan {
  if (
    input.disabledPolicy.readinessTransactionFingerprint !==
      input.readiness.readinessTransactionFingerprint ||
    input.disabledPolicy.m14DecisionFingerprint !== input.readiness.m14DecisionFingerprint ||
    input.disabledPolicy.modelPolicyFingerprint !== input.modelPolicy.policyFingerprint ||
    input.disabledPolicy.instructionProfileFingerprint !==
      input.instructionProfile.profileFingerprint ||
    input.disabledPolicy.promptCachePolicyFingerprint !==
      input.promptCachePolicy.policyFingerprint ||
    input.disabledPolicy.requestMappingProfileFingerprint !==
      input.requestMappingProfileFingerprint ||
    input.disabledPolicy.responseMappingProfileFingerprint !==
      input.responseMappingProfileFingerprint
  ) {
    throw new TypeError("OpenAI Responses disabled policy authority bindings are invalid");
  }
  const instructionArtifact = omit(input.instructionProfile, "profileFingerprint");
  const {
    authorizedInputUtf8ByteCount: _authorizedInputUtf8ByteCount,
    inputCharacterCount: _inputCharacterCount,
    inputUtf8ByteCount: _inputUtf8ByteCount,
    instructionCharacterCount: _instructionCharacterCount,
    instructionUtf8ByteCount: _instructionUtf8ByteCount,
    projectionFingerprint: _projectionFingerprint,
    ...projectionArtifact
  } = input.inputProjection;
  void _authorizedInputUtf8ByteCount;
  void _inputCharacterCount;
  void _inputUtf8ByteCount;
  void _instructionCharacterCount;
  void _instructionUtf8ByteCount;
  void _projectionFingerprint;
  const instructions = serializeDurableCanonicalJsonValue(instructionArtifact);
  const projectedInput = serializeDurableCanonicalJsonValue(projectionArtifact);
  const providerProjection = {
    background: false as const,
    input: projectedInput,
    instructions,
    max_output_tokens: input.modelPolicy.maxOutputTokens,
    model: input.modelPolicy.modelId,
    service_tier: "default" as const,
    store: false as const,
    stream: false as const,
    tools: [] as [],
    truncation: "disabled" as const,
  };
  const instructionCharacterCount = characters(instructions);
  const instructionUtf8ByteCount = utf8Bytes(instructions);
  const inputCharacterCount = characters(projectedInput);
  const inputUtf8ByteCount = utf8Bytes(projectedInput);
  const authorizedInputUtf8ByteCount = instructionUtf8ByteCount + inputUtf8ByteCount;
  const providerBodyUtf8ByteCount = utf8Bytes(
    serializeDurableCanonicalJsonValue(providerProjection),
  );
  if (
    input.inputProjection.instructionCharacterCount !== instructionCharacterCount ||
    input.inputProjection.instructionUtf8ByteCount !== instructionUtf8ByteCount ||
    input.inputProjection.inputCharacterCount !== inputCharacterCount ||
    input.inputProjection.inputUtf8ByteCount !== inputUtf8ByteCount ||
    input.inputProjection.authorizedInputUtf8ByteCount !== authorizedInputUtf8ByteCount ||
    inputCharacterCount > input.readiness.maximumInputCharacters ||
    authorizedInputUtf8ByteCount > input.authorizationLimits.maximumInputBytes ||
    providerBodyUtf8ByteCount > input.readiness.maximumRequestBytes ||
    input.modelPolicy.maxOutputTokens !== input.authorizationLimits.maximumOutputTokens
  ) {
    throw new TypeError("OpenAI Responses plan authority limits are invalid");
  }
  const artifact = {
    schemaVersion: "1.0" as const,
    requestPlanId: input.requestPlanId,
    preparationId: input.readiness.preparationId,
    executionAttemptId: input.readiness.executionAttemptId,
    executionAttemptFingerprint: input.readiness.executionAttemptFingerprint,
    authorizationDecisionId: input.readiness.authorizationDecisionId,
    authorizationDecisionFingerprint: input.readiness.authorizationDecisionFingerprint,
    authorizationClaimId: input.readiness.authorizationClaimId,
    authorizationClaimFingerprint: input.readiness.authorizationClaimFingerprint,
    deliveryTransactionId: input.inputProjection.deliveryTransactionId,
    deliveryTransactionFingerprint: input.inputProjection.deliveryTransactionFingerprint,
    contextPackageId: input.inputProjection.contextPackageId,
    contextPackageFingerprint: input.inputProjection.contextPackageFingerprint,
    invocationRequestId: input.inputProjection.invocationRequestId,
    invocationRequestFingerprint: input.inputProjection.invocationRequestFingerprint,
    adapterId: input.readiness.adapterId,
    adapterFingerprint: input.readiness.adapterFingerprint,
    providerFamilyReference: input.readiness.providerFamilyReference,
    environmentClass: input.readiness.environmentClass,
    operation: input.readiness.operation,
    m14RequestPlanId: input.readiness.m14RequestPlanId,
    m14RequestPlanFingerprint: input.readiness.m14RequestPlanFingerprint,
    readinessEvidenceFingerprint: input.readiness.evidenceFingerprint,
    currentControlSnapshotFingerprint: input.currentControls.snapshotFingerprint,
    modelPolicyFingerprint: input.modelPolicy.policyFingerprint,
    modelPolicyId: input.modelPolicy.policyId,
    modelPolicyVersion: input.modelPolicy.policyVersion,
    instructionProfileFingerprint: input.instructionProfile.profileFingerprint,
    instructionProfileId: input.instructionProfile.profileId,
    inputProjectionFingerprint: input.inputProjection.projectionFingerprint,
    promptCachePolicyFingerprint: input.promptCachePolicy.policyFingerprint,
    promptCachePolicyId: input.promptCachePolicy.policyId,
    promptCachePolicyVersion: input.promptCachePolicy.policyVersion,
    disabledPolicyFingerprint: input.disabledPolicy.policyFingerprint,
    disabledPolicyId: input.disabledPolicy.policyId,
    disabledPolicyVersion: input.disabledPolicy.policyVersion,
    evaluatedAt: input.currentControls.evaluatedAt,
    method: "POST" as const,
    scheme: "https" as const,
    hostname: "api.openai.com" as const,
    port: 443 as const,
    path: "/v1/responses" as const,
    providerProjection,
    maximumInputCharacters: input.readiness.maximumInputCharacters,
    maximumOutputCharacters: input.readiness.maximumOutputCharacters,
    maximumInputBytes: input.authorizationLimits.maximumInputBytes,
    maximumRequestBytes: input.readiness.maximumRequestBytes,
    maximumResponseBytesM14: input.readiness.maximumResponseBytes,
    maximumOutputBytesM17: input.authorizationLimits.maximumOutputBytes,
    effectiveMaximumOutputBytes: Math.min(
      input.readiness.maximumResponseBytes,
      input.authorizationLimits.maximumOutputBytes,
    ),
    maximumInputTokens: input.authorizationLimits.maximumInputTokens,
    maximumOutputTokens: input.authorizationLimits.maximumOutputTokens,
    instructionCharacterCount,
    instructionUtf8ByteCount,
    inputCharacterCount,
    inputUtf8ByteCount,
    authorizedInputUtf8ByteCount,
    providerBodyUtf8ByteCount,
    promptCachePosture: "provider-managed-no-caller-controls" as const,
  };
  return OpenAIResponsesRequestPlanSchema.parse({
    ...artifact,
    requestPlanFingerprint: fingerprint(DOMAINS.requestPlan, artifact),
  });
}

export function verifyOpenAIResponsesRequestPlanAgainstAuthorities(
  value: unknown,
  input: OpenAIResponsesPlanAuthorityInput,
): M19ArtifactVerificationResult {
  try {
    const actual = OpenAIResponsesRequestPlanSchema.parse(value);
    const expected = reproduceOpenAIResponsesRequestPlan(input);
    if (
      serializeDurableCanonicalJsonValue(actual) !== serializeDurableCanonicalJsonValue(expected)
    ) {
      throw new TypeError("mismatch");
    }
    return deepFreeze({ status: "valid" });
  } catch {
    return deepFreeze({ status: "invalid", reasonCode: "non_authoritative_artifact" });
  }
}

export function verifyM19TerminalResult(input: {
  readonly result: unknown;
  readonly plan: OpenAIResponsesRequestPlan;
  readonly policy: M19DisabledAdapterPolicy;
  readonly credentialResolutionEvidenceFingerprint: string;
}): M19ArtifactVerificationResult {
  try {
    const result = M19PreparationResultSchema.parse(input.result);
    if (
      result.status !== "disabled-by-policy" ||
      result.preparationId !== input.plan.preparationId ||
      result.requestPlanId !== input.plan.requestPlanId ||
      result.requestPlanFingerprint !== input.plan.requestPlanFingerprint ||
      result.credentialResolutionEvidenceFingerprint !==
        input.credentialResolutionEvidenceFingerprint ||
      result.disabledPolicyFingerprint !== input.policy.policyFingerprint ||
      result.adapterId !== input.plan.adapterId ||
      result.adapterFingerprint !== input.plan.adapterFingerprint ||
      result.operation !== input.plan.operation ||
      result.disabledPolicyVersion !== input.policy.policyVersion ||
      result.evaluatedAt !== input.plan.evaluatedAt
    ) {
      throw new TypeError("mismatch");
    }
    return deepFreeze({ status: "valid" });
  } catch {
    return deepFreeze({ status: "invalid", reasonCode: "non_authoritative_artifact" });
  }
}
