import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ReasoningProviderCapabilityDescriptor } from "@founderos/knowledge-schema";

import {
  BoundedInMemoryProviderObservabilitySink,
  createProviderObservabilityBundle,
  createProviderRequestPlan,
  mapProviderResponseFixture,
  redactProviderObservabilityValue,
  verifyProviderObservabilityBundle,
  verifyProviderRequestPlan,
  verifyProviderResponseFixtureMapping,
  type ProviderMappingVerifiedAuthority,
  type ProviderObservabilityBundleInput,
  type ProviderRequestPlanConstructionInput,
  type ProviderResponseFixtureClassification,
} from "../src/domain/provider-mapping-observability.js";
import {
  createAuthorizationDecisionEvidence,
  createCredentialReference,
  createPricingReference,
  createProductionProviderAdapterDescriptor,
  createProviderTransportPlan,
  createSecureTransportPolicy,
  evaluateCostAndBudget,
  evaluateProviderRateAndCapacity,
  transitionCircuitState,
  type AuthorizationAuthority,
  type CredentialReferenceExpectation,
  verifyObservabilityReadinessEvidence,
} from "../src/domain/provider-readiness.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import {
  createReasoningInvocationRequest,
  createReasoningProviderCapabilityDescriptor,
  createReasoningProviderCapabilityRequirements,
  matchReasoningProviderCapabilities,
  verifyReasoningResultEnvelope,
} from "../src/domain/reasoning.js";
import { resolveVerifiedGovernedReasoningAuthority } from "../src/application/resolve-verified-governed-reasoning-authority.js";
import { createDeterministicFakeReasoningProvider } from "../src/infrastructure/deterministic-fake-reasoning-provider.js";
import { createInvocation, createReasoningTestRuntime } from "./reasoning-fixtures.js";

const EVALUATED_AT = "2026-07-30T01:00:00.000Z";
const capability = createDeterministicFakeReasoningProvider().providerCapability;
let runtime: Awaited<ReturnType<typeof createReasoningTestRuntime>>;
let authority: ProviderMappingVerifiedAuthority;

beforeAll(async () => {
  runtime = await createReasoningTestRuntime([]);
  const invocationRequest = createInvocation(runtime);
  authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest,
  });
});

afterAll(async () => {
  if (runtime !== undefined) await rm(runtime.repositoryRoot, { recursive: true, force: true });
});

function withoutPolicyFingerprint<T extends { readonly policyFingerprint: string }>(
  value: T,
): Omit<T, "policyFingerprint"> {
  const { policyFingerprint, ...unsigned } = value;
  void policyFingerprint;
  return unsigned;
}

function buildConstruction(
  currentAuthority = authority,
  currentCapability = capability,
): ProviderRequestPlanConstructionInput {
  const adapter = createProductionProviderAdapterDescriptor(
    {
      schemaVersion: "1.0",
      adapterId: "adapter-mapping-one",
      providerFamilyReference: "provider-family/evaluation",
      requestMappingVersion: "1.0",
      responseMappingVersion: "1.0",
      transportPolicyVersion: "1.0",
      observabilityPolicyVersion: "1.0",
      credentialReferenceClass: "evaluation-fixture-reference",
      state: "dry-run-mapping",
    },
    currentCapability,
  );
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: currentAuthority,
    adapter,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
  };
  const expectedDecision = {
    authorizationDecisionId: "authorization-mapping-one",
    decidedAt: EVALUATED_AT,
    expiresAt: "2026-07-30T02:00:00.000Z",
    outcome: "allowed" as const,
  };
  const authorization = createAuthorizationDecisionEvidence(
    expectedDecision,
    authorizationAuthority,
  );
  const credentialExpected: CredentialReferenceExpectation = {
    credentialReferenceId: "credential-mapping-one",
    providerFamilyReference: adapter.providerFamilyReference,
    secretStoreClass: "external-secret-store",
    scopeReference: "scope/reasoning-dry-run",
    environmentClass: "evaluation",
    rotationVersion: "rotation-v1",
    availability: "available",
    adapterCredentialReferenceClass: adapter.credentialReferenceClass,
    expectedAdapterFingerprint: adapter.adapterFingerprint,
  };
  const credential = createCredentialReference({
    schemaVersion: "1.0",
    credentialReferenceId: credentialExpected.credentialReferenceId,
    providerFamilyReference: credentialExpected.providerFamilyReference,
    secretStoreClass: credentialExpected.secretStoreClass,
    scopeReference: credentialExpected.scopeReference,
    environmentClass: credentialExpected.environmentClass,
    rotationVersion: credentialExpected.rotationVersion,
    availability: credentialExpected.availability,
  });
  const policyInput = {
    schemaVersion: "1.0" as const,
    transportPolicyId: "transport-policy-mapping-one",
    providerFamilyReference: adapter.providerFamilyReference,
    allowedScheme: "https" as const,
    allowedHostnames: ["api.provider.dev"],
    allowedPorts: [443],
    dnsResolutionPolicy: "disabled-dry-run" as const,
    redirectPolicy: "deny" as const,
    tlsRequired: true as const,
    minimumTlsVersion: "TLSv1.3" as const,
    certificateValidationPolicy: "system-trust-and-hostname-required" as const,
    connectionTimeoutMilliseconds: 1_000,
    requestTimeoutMilliseconds: 5_000,
    maximumRequestBytes: 20_000,
    maximumResponseBytes: 40_000,
    retryTransportPolicy: "no-transport-retry" as const,
    proxyPolicy: "deny" as const,
    egressClassification: "public-provider" as const,
  };
  const policy = createSecureTransportPolicy(policyInput);
  const plan = createProviderTransportPlan({
    transportPlanId: "transport-plan-mapping-one",
    adapter,
    policy,
  });
  const rateEvaluation = {
    decisionId: "rate-mapping-one",
    invocationRequest: currentAuthority.invocationRequest,
    adapter,
    policy: {
      capacityPolicyVersion: "1.0" as const,
      windowDurationMilliseconds: 60_000,
      requestLimit: 10,
      concurrentLimit: 2,
      maximumQueuedRequests: 3,
      consumerQuotaLimit: 20,
      policyPermitsAdmission: true,
    },
    counters: {
      windowStartedAt: EVALUATED_AT,
      requestsInWindow: 1,
      concurrentInFlight: 0,
      queuedRequests: 0,
      consumerQuotaUsed: 1,
      providerCapacityState: "available" as const,
    },
    priorityClass: "normal" as const,
    evaluatedAt: EVALUATED_AT,
  };
  const pricingReference = createPricingReference({
    schemaVersion: "1.0",
    pricingReferenceId: "pricing-mapping-one",
    providerFamilyReference: adapter.providerFamilyReference,
    pricingVersion: "pricing-v1",
    currencyCode: "USD",
    inputUnitSize: 1_000,
    inputUnitPriceMinorUnits: 2,
    outputUnitSize: 1_000,
    outputUnitPriceMinorUnits: 4,
    availability: "available",
    effectiveAt: EVALUATED_AT,
  });
  const costEvaluation = {
    decisionId: "cost-mapping-one",
    invocationRequest: currentAuthority.invocationRequest,
    providerCapability: currentCapability,
    adapter,
    pricingReference,
    policy: {
      budgetPolicyVersion: "1.0" as const,
      budgetReference: "budget/project-one",
      currencyCode: "USD",
      maximumInputUnits: 20_000,
      maximumOutputUnits: 4_000,
      costCeilingMinorUnits: 100,
      maximumAttemptCount: currentAuthority.invocationRequest.executionPolicy.maxAttemptCount,
      timeoutBudgetMilliseconds: 1_000,
      costCeilingMandatory: true,
      manualReviewRequired: false,
    },
    evaluatedAt: EVALUATED_AT,
  };
  return {
    schemaVersion: "1.0",
    requestPlanId: "request-plan-mapping-one",
    evaluatedAt: EVALUATED_AT,
    authority: currentAuthority,
    adapter,
    providerCapability: currentCapability,
    compatibility: matchReasoningProviderCapabilities({
      invocationRequest: currentAuthority.invocationRequest,
      providerCapability: currentCapability,
    }),
    authorization: {
      evidence: authorization,
      authority: authorizationAuthority,
      expectedDecision,
    },
    credential: { reference: credential, expected: credentialExpected },
    transport: {
      policy,
      policyInput,
      plan,
      expectedTransportPlanId: plan.transportPlanId,
    },
    rate: {
      decision: evaluateProviderRateAndCapacity(rateEvaluation),
      evaluation: rateEvaluation,
    },
    cost: {
      decision: evaluateCostAndBudget(costEvaluation),
      evaluation: costEvaluation,
    },
  };
}

function buildEvaluationProviderAuthority(): {
  readonly authority: ProviderMappingVerifiedAuthority;
  readonly capability: ReasoningProviderCapabilityDescriptor;
} {
  const { descriptorFingerprint: _descriptorFingerprint, ...capabilityInput } = capability;
  void _descriptorFingerprint;
  const evaluationCapability = createReasoningProviderCapabilityDescriptor({
    ...capabilityInput,
    providerCapabilityId: "evaluation-provider-fixture-one",
    providerClass: "evaluation-provider",
  });
  const invocation = authority.invocationRequest;
  const { requirementsFingerprint: _requirementsFingerprint, ...requirementsInput } =
    invocation.capabilityRequirements;
  void _requirementsFingerprint;
  const requirements = createReasoningProviderCapabilityRequirements({
    ...requirementsInput,
    acceptedProviderClasses: ["evaluation-provider"],
  });
  const { requestFingerprint: _requestFingerprint, ...invocationInput } = invocation;
  void _requestFingerprint;
  const evaluationInvocation = createReasoningInvocationRequest({
    ...invocationInput,
    invocationRequestId: "reasoning-invocation-evaluation-provider",
    idempotencyKey: "reasoning:key:evaluation-provider",
    capabilityRequirements: requirements,
  });
  return {
    authority: { ...authority, invocationRequest: evaluationInvocation },
    capability: evaluationCapability,
  };
}

function buildObservabilityInput(
  construction = buildConstruction(),
): ProviderObservabilityBundleInput {
  const transition = {
    circuitStateId: "circuit-observability-one",
    adapter: construction.adapter,
    previousState: null,
    thresholdPolicy: {
      failureThreshold: 3,
      windowDurationMilliseconds: 60_000,
      openDurationMilliseconds: 30_000,
      halfOpenMaximumProbeCount: 2,
      securityViolationQuarantines: true,
    },
    failureWindow: { windowStartedAt: EVALUATED_AT, failureCounts: [] },
    evaluatedAt: EVALUATED_AT,
    command: "evaluate" as const,
    probeOutcome: "none" as const,
    probesAlreadyUsed: 0,
  };
  return {
    schemaVersion: "1.0",
    readinessEvidenceId: "observability-pre-plan-one",
    evaluatedAt: EVALUATED_AT,
    startedAt: EVALUATED_AT,
    authority: construction.authority,
    adapter: construction.adapter,
    providerCapability: construction.providerCapability,
    compatibility: construction.compatibility,
    authorization: construction.authorization,
    rate: construction.rate,
    cost: construction.cost,
    circuit: { state: transitionCircuitState(transition), transition },
    policy: {
      redactionPolicyVersion: "1.0",
      maximumLogFieldCharacters: 256,
      maximumTraceAttributeCharacters: 128,
      maximumMetricLabelCount: 8,
    },
  };
}

function resign<T extends Record<string, unknown>>(value: T, field: string): T {
  const unsigned = structuredClone(value);
  delete unsigned[field];
  return { ...unsigned, [field]: createDurableCanonicalJsonSha256Fingerprint(unsigned) } as T;
}

describe("Milestone 14 mapping and observability", () => {
  it("constructs deterministic byte-stable request plans from every exact verified authority", () => {
    const construction = buildConstruction();
    const first = createProviderRequestPlan(construction);
    const second = createProviderRequestPlan(construction);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.inputSizeEvidence.inputCharacterCount).toBeGreaterThan(0);
    expect(first.inputSizeEvidence.withinLimit).toBe(true);
    expect(first.timeoutAndCancellationPlan).toEqual({
      timeoutMilliseconds:
        construction.authority.invocationRequest.executionPolicy.timeoutMilliseconds,
      cancellationMode: construction.authority.invocationRequest.executionPolicy.cancellationMode,
    });
    expect(first.expectedResponseConstraints.maximumResponseBytes).toBe(
      construction.transport.plan.maximumResponseBytes,
    );
    expect(first.adapterFingerprint).toBe(construction.adapter.adapterFingerprint);
    expect(first.invocationRequestFingerprint).toBe(
      construction.authority.invocationRequest.requestFingerprint,
    );
    expect(first.credentialReferenceFingerprint).toBe(
      construction.credential.reference.referenceFingerprint,
    );
    expect(first.rateAndCapacityDecisionFingerprint).toBe(
      construction.rate.decision.decisionFingerprint,
    );
    expect(first.costAndBudgetDecisionFingerprint).toBe(
      construction.cost.decision.decisionFingerprint,
    );
    expect(first.redactedHeaderPlan.map((entry) => entry.headerClassification)).not.toContain(
      "authorization",
    );
    expect(JSON.stringify(first)).not.toMatch(
      /api\.provider|Bearer|Use only|fixture-success|https?:\/\//u,
    );
    expect(verifyProviderRequestPlan({ plan: first, construction }).status).toBe("valid");
  });

  it("rejects request mutation, coherent re-sign substitution, unknown payloads, and altered Delivery authority", () => {
    const construction = buildConstruction();
    const plan = createProviderRequestPlan(construction);
    expect(
      verifyProviderRequestPlan({
        plan: { ...plan, requestPlanFingerprint: "0".repeat(64) },
        construction,
      }).status,
    ).toBe("invalid");
    expect(
      verifyProviderRequestPlan({
        plan: resign(
          { ...plan, logicalEndpointClassification: "reasoning-evaluation" },
          "requestPlanFingerprint",
        ),
        construction,
      }).status,
    ).toBe("invalid");
    for (const bypass of [
      { endpointUrl: "https://api.provider.dev" },
      { authorizationHeader: "Bearer secret" },
      { hiddenContext: "hidden" },
      { tools: [{ name: "bypass" }] },
      { providerPayload: { model: "real-model-id" } },
    ]) {
      expect(() => createProviderRequestPlan({ ...construction, ...bypass } as never)).toThrow();
    }
    expect(() =>
      createProviderRequestPlan({
        ...construction,
        authority: {
          ...construction.authority,
          receipt: { ...construction.authority.receipt, receiptId: "receipt-substituted" },
        },
      }),
    ).toThrow();
    const substitutedTransportPlan = createProviderTransportPlan({
      transportPlanId: "transport-plan-substituted",
      adapter: construction.adapter,
      policy: construction.transport.policy,
    });
    expect(
      verifyProviderRequestPlan({
        plan,
        construction: {
          ...construction,
          transport: {
            ...construction.transport,
            plan: substitutedTransportPlan,
            expectedTransportPlanId: substitutedTransportPlan.transportPlanId,
          },
        },
      }).status,
    ).toBe("invalid");
  });

  it.each([
    ["successful-response", "succeeded"],
    ["empty-response", "failed"],
    ["provider-timeout", "timed-out"],
    ["provider-rate-limit", "failed"],
    ["provider-server-failure", "failed"],
    ["invalid-provider-response", "failed"],
    ["usage-metadata", "succeeded"],
    ["cost-metadata", "succeeded"],
    ["credential-rejection", "failed"],
    ["transport-security-failure", "failed"],
    ["oversized-response", "failed"],
    ["redaction-failure", "failed"],
  ] as const)(
    "maps fixed response fixture %s into an independently verified M13 chain",
    (classification, outcome) => {
      const construction = buildConstruction();
      const requestPlan = createProviderRequestPlan(construction);
      const input = {
        schemaVersion: "1.0" as const,
        mappingEvidenceId: `mapping-${classification}`,
        resultEnvelopeId: `result-${classification}`,
        executionAttemptId: `attempt-${classification}`,
        fixtureClassification: classification as ProviderResponseFixtureClassification,
        startedAt: EVALUATED_AT,
        requestPlan,
        requestPlanConstruction: construction,
        contextPackageObjectCount: construction.authority.envelope.contextPackage.included.length,
      };
      const mapped = mapProviderResponseFixture(input);

      expect(mapped.outcome.status).toBe(outcome);
      expect(mapped.mappingEvidence.sanitizedMetadata.usageStatus).toBe("estimated");
      expect(mapped.mappingEvidence.sanitizedMetadata.costStatus).toBe("unavailable");
      expect(mapped.costEvidence.status).toBe("not-applicable");
      expect(mapped.usageEvidence.inputCharacterCount).toBe(
        requestPlan.inputSizeEvidence.inputCharacterCount,
      );
      expect(mapped.usageEvidence.outputCharacterCount).toBe(
        mapped.outcome.status === "succeeded" ? mapped.outcome.outputCharacterCount : 0,
      );
      expect(JSON.stringify(mapped.mappingEvidence.sanitizedMetadata)).not.toMatch(
        /Bearer|header|body|Users|\\\\/u,
      );
      expect(verifyProviderResponseFixtureMapping({ mapping: mapped, input }).status).toBe("valid");
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: mapped.resultEnvelope,
          invocationRequest: construction.authority.invocationRequest,
          providerCapability: construction.providerCapability,
          attempt: mapped.attempt,
          attemptHistory: [mapped.attempt],
          providerOutcome: mapped.outcome,
          outcomeHistory: [mapped.outcome],
          contextPackageObjectCount: input.contextPackageObjectCount,
        }).status,
      ).toBe("valid");
      expect(JSON.stringify(mapped)).not.toMatch(/Bearer|api\.provider|raw error|Authorization/u);
    },
  );

  it("rejects re-signed timeout substitution during Request Plan reconstruction", () => {
    const construction = buildConstruction();
    const validPlan = createProviderRequestPlan(construction);
    const { policyFingerprint: _fingerprint, ...unsignedPolicy } = construction.transport.policy;
    void _fingerprint;
    const policy = createSecureTransportPolicy({
      ...unsignedPolicy,
      connectionTimeoutMilliseconds: 400,
      requestTimeoutMilliseconds: 500,
    });
    const substitutedConstruction: ProviderRequestPlanConstructionInput = {
      ...construction,
      transport: {
        policy,
        policyInput: withoutPolicyFingerprint(policy),
        plan: createProviderTransportPlan({
          transportPlanId: construction.transport.expectedTransportPlanId,
          adapter: construction.adapter,
          policy,
        }),
        expectedTransportPlanId: construction.transport.expectedTransportPlanId,
      },
    };
    expect(() => createProviderRequestPlan(substitutedConstruction)).toThrow();
    expect(
      verifyProviderRequestPlan({ plan: validPlan, construction: substitutedConstruction }).status,
    ).toBe("invalid");
  });

  it.each(["no-transport-retry", "governed-idempotent-retry"] as const)(
    "accepts independently governed Transport retry policy %s",
    (retryTransportPolicy) => {
      const construction = buildConstruction();
      const policy = createSecureTransportPolicy({
        ...withoutPolicyFingerprint(construction.transport.policy),
        retryTransportPolicy,
      });
      const candidate: ProviderRequestPlanConstructionInput = {
        ...construction,
        transport: {
          ...construction.transport,
          policy,
          policyInput: withoutPolicyFingerprint(policy),
          plan: createProviderTransportPlan({
            transportPlanId: construction.transport.expectedTransportPlanId,
            adapter: construction.adapter,
            policy,
          }),
        },
      };
      const plan = createProviderRequestPlan(candidate);
      expect(verifyProviderRequestPlan({ plan, construction: candidate })).toEqual({
        status: "valid",
        reason: null,
      });
    },
  );

  it("accepts two M13 application Attempts with no Transport retry", async () => {
    const retryInvocation = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:mapping-application-retry",
      retryMode: "retry-until-attempt-limit",
      maxAttemptCount: 2,
    });
    const retryAuthority = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: runtime.deliveryLedger,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: retryInvocation,
    });
    const construction = buildConstruction(retryAuthority);
    expect(construction.transport.policy.retryTransportPolicy).toBe("no-transport-retry");
    expect(construction.cost.evaluation.policy.maximumAttemptCount).toBe(2);
    const plan = createProviderRequestPlan(construction);
    expect(verifyProviderRequestPlan({ plan, construction })).toEqual({
      status: "valid",
      reason: null,
    });
  });

  it("keeps oversized-response evidence valid at the maximum supported boundary", () => {
    const construction = buildConstruction();
    const { policyFingerprint: _fingerprint, ...unsignedPolicy } = construction.transport.policy;
    void _fingerprint;
    const policy = createSecureTransportPolicy({
      ...unsignedPolicy,
      maximumResponseBytes: Number.MAX_SAFE_INTEGER - 1,
    });
    const boundaryConstruction: ProviderRequestPlanConstructionInput = {
      ...construction,
      transport: {
        policy,
        policyInput: withoutPolicyFingerprint(policy),
        plan: createProviderTransportPlan({
          transportPlanId: construction.transport.expectedTransportPlanId,
          adapter: construction.adapter,
          policy,
        }),
        expectedTransportPlanId: construction.transport.expectedTransportPlanId,
      },
    };
    const requestPlan = createProviderRequestPlan(boundaryConstruction);
    const mappingInput = {
      schemaVersion: "1.0" as const,
      mappingEvidenceId: "mapping-oversized-safe-boundary",
      resultEnvelopeId: "result-oversized-safe-boundary",
      executionAttemptId: "attempt-oversized-safe-boundary",
      fixtureClassification: "oversized-response" as const,
      startedAt: EVALUATED_AT,
      requestPlan,
      requestPlanConstruction: boundaryConstruction,
      contextPackageObjectCount:
        boundaryConstruction.authority.envelope.contextPackage.included.length,
    };
    const mapped = mapProviderResponseFixture(mappingInput);
    expect(mapped.mappingEvidence.sanitizedMetadata.responseSizeBytes).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(mapped.outcome.status).toBe("failed");
    expect(verifyProviderResponseFixtureMapping({ mapping: mapped, input: mappingInput })).toEqual({
      status: "valid",
      reason: null,
    });
  });

  it("maps evaluation-provider cost metadata as deterministic estimated evidence without false provider claims", () => {
    const evaluation = buildEvaluationProviderAuthority();
    const construction = buildConstruction(evaluation.authority, evaluation.capability);
    const requestPlan = createProviderRequestPlan(construction);
    const input = {
      schemaVersion: "1.0" as const,
      mappingEvidenceId: "mapping-evaluation-cost-metadata",
      resultEnvelopeId: "result-evaluation-cost-metadata",
      executionAttemptId: "attempt-evaluation-cost-metadata",
      fixtureClassification: "cost-metadata" as const,
      startedAt: EVALUATED_AT,
      requestPlan,
      requestPlanConstruction: construction,
      contextPackageObjectCount: construction.authority.envelope.contextPackage.included.length,
    };
    const mapped = mapProviderResponseFixture(input);

    expect(mapped.mappingEvidence.sanitizedMetadata.usageStatus).toBe("estimated");
    expect(mapped.mappingEvidence.sanitizedMetadata.costStatus).toBe("estimated");
    expect(mapped.costEvidence.status).toBe("estimated");
    if (mapped.costEvidence.status === "estimated") {
      expect(mapped.costEvidence.amountMinorUnits).toBe(
        construction.cost.decision.estimatedMaximumCostMinorUnits,
      );
    }
    expect(verifyProviderResponseFixtureMapping({ mapping: mapped, input }).status).toBe("valid");
    expect(
      verifyReasoningResultEnvelope({
        resultEnvelope: mapped.resultEnvelope,
        invocationRequest: construction.authority.invocationRequest,
        providerCapability: construction.providerCapability,
        attempt: mapped.attempt,
        attemptHistory: [mapped.attempt],
        providerOutcome: mapped.outcome,
        outcomeHistory: [mapped.outcome],
        contextPackageObjectCount: input.contextPackageObjectCount,
      }).status,
    ).toBe("valid");
  });

  it("rejects response evidence mutation and coherent re-sign substitution", () => {
    const construction = buildConstruction();
    const requestPlan = createProviderRequestPlan(construction);
    const input = {
      schemaVersion: "1.0" as const,
      mappingEvidenceId: "mapping-success",
      resultEnvelopeId: "result-success",
      executionAttemptId: "attempt-success",
      fixtureClassification: "successful-response" as const,
      startedAt: EVALUATED_AT,
      requestPlan,
      requestPlanConstruction: construction,
      contextPackageObjectCount: construction.authority.envelope.contextPackage.included.length,
    };
    const mapped = mapProviderResponseFixture(input);
    const substitutedEvidence = resign(
      { ...mapped.mappingEvidence, providerResponseReferenceFingerprint: "2".repeat(64) },
      "mappingEvidenceFingerprint",
    );
    expect(
      verifyProviderResponseFixtureMapping({
        mapping: { ...mapped, mappingEvidence: substitutedEvidence },
        input,
      }).status,
    ).toBe("invalid");
    for (const bypass of [
      { rawErrorBody: "raw error" },
      { providerHeaders: { authorization: "Bearer secret" } },
      { credential: "sk-secret" },
      { rawResponseBody: { arbitrary: true } },
    ]) {
      expect(() => mapProviderResponseFixture({ ...input, ...bypass } as never)).toThrow();
    }
  });

  it("redacts credential, authorization, body, environment, and path material recursively", () => {
    const redacted = redactProviderObservabilityValue(
      {
        safe: "kept",
        authorization: "Bearer abcdefghijklmnop",
        nested: {
          requestBody: "raw user content",
          location: "C:\\Users\\founder\\secret.txt",
          diagnostic: "TOKEN=secret-value",
        },
      },
      { maximumDepth: 6, maximumFieldCount: 16, maximumValueCharacters: 64 },
    );

    expect(redacted).toEqual({ safe: "kept", nested: {} });
    expect(JSON.stringify(redacted)).not.toMatch(/Bearer|secret|Users|TOKEN|raw user/u);
  });

  it("rejects accessor input and redacts POSIX, Windows, UNC, file URI, URL, and environment values", () => {
    const accessor = Object.defineProperty({}, "token", { enumerable: true, get: () => "secret" });
    expect(() =>
      redactProviderObservabilityValue(accessor, {
        maximumDepth: 4,
        maximumFieldCount: 8,
        maximumValueCharacters: 64,
      }),
    ).toThrow();
    for (const unsafe of [
      "/Users/founder/private.txt",
      "C:\\Users\\founder\\private.txt",
      "\\\\server\\share\\private.txt",
      "file:///tmp/private.txt",
      "https://user:secret@example.invalid/path",
      "API_KEY=secret",
      "ghp_1234567890abcdef",
      "gho_1234567890abcdef",
      "xoxb-1234567890-secret",
      "pk_live_1234567890secret",
      "pk_test_1234567890secret",
      "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    ]) {
      expect(
        redactProviderObservabilityValue(
          { diagnostic: unsafe },
          { maximumDepth: 4, maximumFieldCount: 8, maximumValueCharacters: 64 },
        ),
      ).toEqual({});
    }
    expect(
      redactProviderObservabilityValue(
        { diagnosticGitHubToken: "otherwise-safe" },
        { maximumDepth: 4, maximumFieldCount: 8, maximumValueCharacters: 64 },
      ),
    ).toEqual({});
    expect(() =>
      redactProviderObservabilityValue(
        { first: "safe", second: "safe" },
        { maximumDepth: 4, maximumFieldCount: 1, maximumValueCharacters: 64 },
      ),
    ).toThrow();
    expect(() =>
      redactProviderObservabilityValue(["one", "two", "three"], {
        maximumDepth: 4,
        maximumFieldCount: 2,
        maximumValueCharacters: 64,
      }),
    ).toThrow();
    expect(() =>
      redactProviderObservabilityValue(
        { values: ["one", "two"] },
        { maximumDepth: 4, maximumFieldCount: 2, maximumValueCharacters: 64 },
      ),
    ).toThrow();
    expect(() =>
      redactProviderObservabilityValue([{ a: "x", b: "y" }, "z"], {
        maximumDepth: 4,
        maximumFieldCount: 3,
        maximumValueCharacters: 64,
      }),
    ).toThrow();
    expect(
      redactProviderObservabilityValue(["one", "two"], {
        maximumDepth: 4,
        maximumFieldCount: 2,
        maximumValueCharacters: 64,
      }),
    ).toEqual(["one", "two"]);
  });

  it("keeps a deterministic bounded immutable in-memory sink", () => {
    const sink = new BoundedInMemoryProviderObservabilitySink({
      maximumEntriesPerArtifact: 1,
      maximumMetricLabelCardinality: 2,
    });

    expect(sink.snapshot()).toEqual({ logs: [], metrics: [], traces: [], publicErrors: [] });
    expect(Object.isFrozen(sink.snapshot())).toBe(true);
  });

  it("evicts deterministically at the per-artifact sink bound without cross-artifact corruption", () => {
    const input = buildObservabilityInput();
    const sink = new BoundedInMemoryProviderObservabilitySink({
      maximumEntriesPerArtifact: 1,
      maximumMetricLabelCardinality: 2,
    });
    createProviderObservabilityBundle(input, sink);
    const limitedEvaluation = {
      ...input.rate.evaluation,
      counters: {
        ...input.rate.evaluation.counters,
        requestsInWindow: input.rate.evaluation.policy.requestLimit,
      },
    };
    const retainedBundle = createProviderObservabilityBundle(
      {
        ...input,
        readinessEvidenceId: "observability-retained-bundle",
        rate: {
          decision: evaluateProviderRateAndCapacity(limitedEvaluation),
          evaluation: limitedEvaluation,
        },
      },
      sink,
    );
    const snapshot = sink.snapshot();

    expect(snapshot.logs).toEqual([retainedBundle.structuredLog]);
    expect(snapshot.metrics).toEqual([retainedBundle.metrics.at(-1)]);
    expect(snapshot.traces).toEqual([retainedBundle.traces.at(-1)]);
    expect(snapshot.publicErrors).toEqual([retainedBundle.publicErrors.at(-1)]);
    expect(sink.snapshot()).toEqual(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.logs)).toBe(true);
    expect(Object.isFrozen(snapshot.logs[0])).toBe(true);
    expect(() => (snapshot.metrics as unknown[]).push({})).toThrow();
    expect("metricFingerprint" in snapshot.logs[0]!).toBe(false);
    expect("logFingerprint" in snapshot.metrics[0]!).toBe(false);
    expect("errorFingerprint" in snapshot.traces[0]!).toBe(false);
    expect("traceFingerprint" in snapshot.publicErrors[0]!).toBe(false);
  });

  it("constructs artifact-bound observability readiness and rejects re-signed status or artifact substitution", () => {
    const construction = buildConstruction();
    const sink = new BoundedInMemoryProviderObservabilitySink({
      maximumEntriesPerArtifact: 4,
      maximumMetricLabelCardinality: 4,
    });
    const input = buildObservabilityInput(construction);

    expect("requestPlan" in input).toBe(false);
    expect("requestPlanConstruction" in input).toBe(false);
    const bundle = createProviderObservabilityBundle(input, sink);
    expect(bundle.readiness.status).toBe("ready");
    expect(bundle.structuredLog.requestPlanFingerprint).toBeUndefined();
    expect(bundle.structuredLog.eventType).toBe("provider-readiness-evaluated");
    expect(bundle.structuredLog.outcomeClassification).toBe("ready-for-dry-run");
    expect(bundle.structuredLog.rateLimitStatus).toBe(construction.rate.decision.outcome);
    expect(bundle.structuredLog.circuitState).toBe(input.circuit.state.state);
    expect(bundle.structuredLog.usageUnitCount).toBe(
      construction.cost.decision.estimatedInputUnits +
        construction.cost.decision.estimatedOutputUnits,
    );
    expect(bundle.structuredLog.costMinorUnits).toBe(
      construction.cost.decision.estimatedMaximumCostMinorUnits,
    );
    expect(sink.snapshot().logs).toHaveLength(1);
    expect(Object.isFrozen(sink.snapshot().metrics[0])).toBe(true);
    expect(() => (sink.snapshot().logs as unknown[]).push({})).toThrow();
    expect(verifyProviderObservabilityBundle({ bundle, input }).status).toBe("valid");
    const { readinessFingerprint: _readinessFingerprint, ...readinessExpectation } =
      bundle.readiness;
    void _readinessFingerprint;
    expect(
      verifyObservabilityReadinessEvidence({
        evidence: bundle.readiness,
        expected: readinessExpectation,
      }).status,
    ).toBe("valid");
    const substitutedReadiness = resign(
      {
        ...bundle.readiness,
        status: "not-ready" as const,
        reasonCodes: ["observability_not_ready" as const],
      },
      "readinessFingerprint",
    );
    expect(
      verifyProviderObservabilityBundle({
        bundle: { ...bundle, readiness: substitutedReadiness },
        input,
      }).status,
    ).toBe("invalid");
    expect(
      verifyProviderObservabilityBundle({
        bundle: {
          ...bundle,
          structuredLog: resign({ ...bundle.structuredLog, retryCount: 1 }, "logFingerprint"),
        },
        input,
      }).status,
    ).toBe("invalid");

    const limitedEvaluation = {
      ...input.rate.evaluation,
      counters: {
        ...input.rate.evaluation.counters,
        requestsInWindow: input.rate.evaluation.policy.requestLimit,
      },
    };
    const failedInput: ProviderObservabilityBundleInput = {
      ...input,
      readinessEvidenceId: "observability-pre-plan-failed",
      rate: {
        decision: evaluateProviderRateAndCapacity(limitedEvaluation),
        evaluation: limitedEvaluation,
      },
    };
    const failed = createProviderObservabilityBundle(failedInput);
    expect(failed.publicErrors).toHaveLength(1);
    expect(failed.publicErrors[0]?.message).toBe(
      "Provider capacity requirements were not satisfied",
    );
    expect(failed.structuredLog.outcomeClassification).toBe("rejected");
    expect(failed.structuredLog.rateLimitStatus).toBe("rate-limited");
    expect(JSON.stringify(failed.publicErrors)).not.toMatch(
      /Users|\\\\|provider body|https?:\/\//u,
    );

    const rawInvocationLabel = resign(
      {
        ...bundle.metrics[0]!,
        labels: bundle.metrics[0]!.labels.map((label) =>
          label.name === "outcome"
            ? { ...label, value: construction.authority.invocationRequest.invocationRequestId }
            : label,
        ),
      },
      "metricFingerprint",
    );
    expect(() => sink.appendMetric(rawInvocationLabel)).toThrow();

    const cardinalitySink = new BoundedInMemoryProviderObservabilitySink({
      maximumEntriesPerArtifact: 4,
      maximumMetricLabelCardinality: 1,
    });
    createProviderObservabilityBundle(input, cardinalitySink);
    const beforeRejectedBundle = cardinalitySink.snapshot();
    expect(() => createProviderObservabilityBundle(failedInput, cardinalitySink)).toThrow();
    expect(cardinalitySink.snapshot()).toEqual(beforeRejectedBundle);
    expect(() =>
      createProviderObservabilityBundle({
        ...input,
        policy: { ...input.policy, maximumLogFieldCharacters: 5 },
      }),
    ).toThrow();
    expect(() =>
      createProviderObservabilityBundle({
        ...input,
        policy: { ...input.policy, maximumMetricLabelCount: 2 },
      }),
    ).toThrow();

    const noSinkTraceBoundInput = {
      ...input,
      policy: { ...input.policy, maximumTraceAttributeCharacters: 5 },
    };
    expect(() => createProviderObservabilityBundle(noSinkTraceBoundInput)).toThrow();
    const paritySink = new BoundedInMemoryProviderObservabilitySink({
      maximumEntriesPerArtifact: 2,
      maximumMetricLabelCardinality: 2,
    });
    expect(() => createProviderObservabilityBundle(noSinkTraceBoundInput, paritySink)).toThrow();
    expect(paritySink.snapshot()).toEqual({ logs: [], metrics: [], traces: [], publicErrors: [] });

    const resignedRate = resign(
      { ...input.rate.decision, requestsInWindow: 2 },
      "decisionFingerprint",
    );
    expect(() =>
      createProviderObservabilityBundle({
        ...input,
        rate: { ...input.rate, decision: resignedRate },
      }),
    ).toThrow();

    const alternateAdapter = createProductionProviderAdapterDescriptor(
      {
        schemaVersion: "1.0",
        adapterId: "adapter-observability-substituted",
        providerFamilyReference: construction.adapter.providerFamilyReference,
        requestMappingVersion: "1.0",
        responseMappingVersion: "1.0",
        transportPolicyVersion: "1.0",
        observabilityPolicyVersion: "1.0",
        credentialReferenceClass: construction.adapter.credentialReferenceClass,
        state: construction.adapter.state,
      },
      construction.providerCapability,
    );
    const mixedRateEvaluation = { ...input.rate.evaluation, adapter: alternateAdapter };
    expect(() =>
      createProviderObservabilityBundle({
        ...input,
        rate: {
          evaluation: mixedRateEvaluation,
          decision: evaluateProviderRateAndCapacity(mixedRateEvaluation),
        },
      }),
    ).toThrow();
  });
});
