import { readFile, rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AuthorizationDecisionEvidence,
  ProviderObservabilityRetentionEvidence,
  ReasoningInvocationRequest,
} from "@founderos/knowledge-schema";

import {
  createProductionProviderReadinessEvaluator,
  createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest,
  deriveApprovedProductionProviderReadinessEvaluatorConfiguration,
  evaluateProductionProviderReadinessWithDecisionCandidateForTest,
  getProductionProviderReadinessObservabilityAppendCountForTest,
  getProductionProviderReadinessRetentionIssuanceStateForTest,
  ProductionProviderReadinessError,
  type EvaluateProductionProviderReadinessInput,
  type ProductionProviderReadinessEvaluator,
} from "../src/application/evaluate-production-provider-readiness.js";
import {
  createDisabledProductionProviderAdapterHarness,
  createDisabledProductionProviderAdapterHarnessWithObservabilityRetentionFailureForTest,
  getDisabledProductionProviderHarnessObservabilityAppendCountForTest,
  type DisabledProductionProviderAdapterHarness,
  type DisabledProductionProviderHarnessMode,
} from "../src/application/disabled-production-provider-adapter-harness.js";
import { resolveVerifiedGovernedReasoningAuthority } from "../src/application/resolve-verified-governed-reasoning-authority.js";
import {
  createStaticProductionProviderTransportPolicyAuthority,
  getProductionProviderTransportPolicyAuthorityLookupCountForTest,
  type ProductionProviderTransportPolicyAuthority,
} from "../src/application/production-provider-transport-policy-authority.js";
import { createDeterministicFakeReasoningProvider } from "../src/infrastructure/deterministic-fake-reasoning-provider.js";
import {
  createAuthorizationDecisionEvidence,
  createCredentialReference,
  createPricingReference,
  createProductionProviderAdapterDescriptor,
  createSecureTransportPolicy,
  fingerprintProviderReadinessArtifact,
  transitionCircuitState,
  type AuthorizationAuthority,
} from "../src/domain/provider-readiness.js";
import { createReasoningProviderCapabilityDescriptor } from "../src/domain/reasoning.js";
import { createInvocation, createReasoningTestRuntime } from "./reasoning-fixtures.js";

const EVALUATED_AT = "2026-07-30T01:00:00.000Z";
const capability = createDeterministicFakeReasoningProvider().providerCapability;
let runtime: Awaited<ReturnType<typeof createReasoningTestRuntime>>;
let invocation: ReasoningInvocationRequest;
let baseInput: EvaluateProductionProviderReadinessInput;
let configuredEvaluator: ProductionProviderReadinessEvaluator;
let configuredHarness: DisabledProductionProviderAdapterHarness;
let configuredTransportPolicyAuthority: ProductionProviderTransportPolicyAuthority;

function evaluateProductionProviderReadiness(input: EvaluateProductionProviderReadinessInput) {
  return configuredEvaluator.evaluate(input);
}

function verifyProductionProviderReadinessDecision(input: {
  readonly decision: unknown;
  readonly authoritativeInput: EvaluateProductionProviderReadinessInput;
  readonly observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
}) {
  return configuredEvaluator.verifyDecision(input);
}

function runDisabledProductionProviderAdapterHarness(
  input: Parameters<DisabledProductionProviderAdapterHarness["run"]>[0],
) {
  return configuredHarness.run(input);
}
const ALL_DISABLED_HARNESS_MODES = [
  "contract-validation",
  "authorization-validation",
  "credential-reference-validation",
  "transport-plan-dry-run",
  "request-mapping-dry-run",
  "response-mapping-fixture",
  "rate-and-cost-admission-simulation",
  "circuit-simulation",
  "health-evaluation",
  "observability-redaction-simulation",
  "full-readiness-evaluation",
] as const satisfies readonly DisabledProductionProviderHarnessMode[];

beforeAll(async () => {
  runtime = await createReasoningTestRuntime([]);
  invocation = createInvocation(runtime);
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: invocation,
  });
  const adapterDescriptor = createProductionProviderAdapterDescriptor(
    {
      schemaVersion: "1.0",
      adapterId: "adapter-readiness-one",
      providerFamilyReference: "provider-family/evaluation",
      requestMappingVersion: "1.0",
      responseMappingVersion: "1.0",
      transportPolicyVersion: "1.0",
      observabilityPolicyVersion: "1.0",
      credentialReferenceClass: "evaluation-fixture-reference",
      state: "dry-run-mapping",
    },
    capability,
  );
  const expectedAuthorizationDecision = {
    authorizationDecisionId: "authorization-readiness-one",
    decidedAt: EVALUATED_AT,
    expiresAt: "2026-07-30T02:00:00.000Z",
    outcome: "allowed" as const,
  };
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: authority,
    adapter: adapterDescriptor,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
  };
  const authorizationEvidence = createAuthorizationDecisionEvidence(
    expectedAuthorizationDecision,
    authorizationAuthority,
  );
  const transportPolicy = createSecureTransportPolicy({
    schemaVersion: "1.0",
    transportPolicyId: "transport-policy-one",
    providerFamilyReference: adapterDescriptor.providerFamilyReference,
    allowedScheme: "https",
    allowedHostnames: ["api.provider.dev"],
    allowedPorts: [443],
    dnsResolutionPolicy: "disabled-dry-run",
    redirectPolicy: "deny",
    tlsRequired: true,
    minimumTlsVersion: "TLSv1.3",
    certificateValidationPolicy: "system-trust-and-hostname-required",
    connectionTimeoutMilliseconds: 1_000,
    requestTimeoutMilliseconds: 5_000,
    maximumRequestBytes: 20_000,
    maximumResponseBytes: 40_000,
    retryTransportPolicy: "no-transport-retry",
    proxyPolicy: "deny",
    egressClassification: "public-provider",
  });
  const transportPolicyAuthority = createStaticProductionProviderTransportPolicyAuthority({
    adapter: adapterDescriptor,
    expectedPolicy: transportPolicy,
  });
  configuredEvaluator = createProductionProviderReadinessEvaluator({
    transportPolicyAuthority,
  });
  configuredHarness = createDisabledProductionProviderAdapterHarness({
    transportPolicyAuthority,
  });
  configuredTransportPolicyAuthority = transportPolicyAuthority;
  baseInput = {
    schemaVersion: "1.0",
    readinessDecisionId: "readiness-one",
    requestPlanId: "request-plan-one",
    transportPlanId: "transport-plan-one",
    healthEvidenceId: "health-one",
    observabilityReadinessEvidenceId: "observability-one",
    evaluatedAt: EVALUATED_AT,
    startedAt: EVALUATED_AT,
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: invocation,
    authorizationEvidence,
    expectedAuthorizationDecision,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
    adapterDescriptor,
    credentialReference: createCredentialReference({
      schemaVersion: "1.0",
      credentialReferenceId: "credential-readiness-one",
      providerFamilyReference: adapterDescriptor.providerFamilyReference,
      secretStoreClass: "external-secret-store",
      scopeReference: "scope/reasoning-dry-run",
      environmentClass: "evaluation",
      rotationVersion: "rotation-v1",
      availability: "available",
    }),
    providerCapability: capability,
    transportPolicy,
    ratePolicy: {
      capacityPolicyVersion: "1.0",
      windowDurationMilliseconds: 60_000,
      requestLimit: 10,
      concurrentLimit: 2,
      maximumQueuedRequests: 3,
      consumerQuotaLimit: 20,
      policyPermitsAdmission: true,
    },
    rateCounters: {
      windowStartedAt: EVALUATED_AT,
      requestsInWindow: 1,
      concurrentInFlight: 0,
      queuedRequests: 0,
      consumerQuotaUsed: 1,
      providerCapacityState: "available",
    },
    priorityClass: "normal",
    pricingReference: createPricingReference({
      schemaVersion: "1.0",
      pricingReferenceId: "pricing-one",
      providerFamilyReference: adapterDescriptor.providerFamilyReference,
      pricingVersion: "pricing-v1",
      currencyCode: "USD",
      inputUnitSize: 1_000,
      inputUnitPriceMinorUnits: 2,
      outputUnitSize: 1_000,
      outputUnitPriceMinorUnits: 4,
      availability: "available",
      effectiveAt: EVALUATED_AT,
    }),
    costPolicy: {
      budgetPolicyVersion: "1.0",
      budgetReference: "budget/project-one",
      currencyCode: "USD",
      maximumInputUnits: 20_000,
      maximumOutputUnits: 4_000,
      costCeilingMinorUnits: 100,
      maximumAttemptCount: 1,
      timeoutBudgetMilliseconds: 1_000,
      costCeilingMandatory: true,
      manualReviewRequired: false,
    },
    circuitStateId: "circuit-one",
    previousCircuitState: null,
    circuitThresholdPolicy: {
      failureThreshold: 3,
      windowDurationMilliseconds: 60_000,
      openDurationMilliseconds: 30_000,
      halfOpenMaximumProbeCount: 2,
      securityViolationQuarantines: true,
    },
    circuitFailureWindow: { windowStartedAt: EVALUATED_AT, failureCounts: [] },
    circuitCommand: "evaluate",
    circuitProbeOutcome: "none",
    circuitProbesAlreadyUsed: 0,
    observabilityPolicy: {
      redactionPolicyVersion: "1.0",
      maximumLogFieldCharacters: 256,
      maximumTraceAttributeCharacters: 128,
      maximumMetricLabelCount: 8,
    },
  };
});

afterAll(async () => {
  if (runtime !== undefined) await rm(runtime.repositoryRoot, { recursive: true, force: true });
});

async function inputWithAuthorizationOutcome(
  outcome: AuthorizationDecisionEvidence["outcome"],
): Promise<EvaluateProductionProviderReadinessInput> {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: invocation,
  });
  const expectedAuthorizationDecision = { ...baseInput.expectedAuthorizationDecision, outcome };
  return {
    ...baseInput,
    expectedAuthorizationDecision,
    authorizationEvidence: createAuthorizationDecisionEvidence(expectedAuthorizationDecision, {
      deliveryAuthority: authority,
      adapter: baseInput.adapterDescriptor,
      requestedOperation: baseInput.requestedOperation,
      decisionAuthorityReference: baseInput.decisionAuthorityReference,
    }),
  };
}

describe("Milestone 14 sole production-provider readiness facade", () => {
  it("produces a deterministic complete dry-run decision and exact mandatory trace", async () => {
    const first = await evaluateProductionProviderReadiness(baseInput);
    const second = await evaluateProductionProviderReadiness(baseInput);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.decision.status).toBe("ready-for-dry-run");
    expect(first.decision.blockingReasonCodes).toEqual([]);
    expect(Object.values(first.decision).filter((value) => value === null)).toEqual([]);
    expect(first.gateTrace.map((entry) => entry.gate)).toEqual([
      "durable-delivery-and-invocation",
      "authorization",
      "adapter-descriptor",
      "credential-reference",
      "capability",
      "transport-policy-plan",
      "rate-and-capacity",
      "cost-and-budget",
      "circuit",
      "observability-redaction",
      "health",
      "request-plan",
      "readiness-decision",
      "stop-before-transport",
    ]);
    expect(first.gateTrace.every((entry) => entry.status === "completed")).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.decision)).toBe(true);
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: first.decision,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: first.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "valid", reason: null });
  });

  it("rejects unsupported facade, verifier replay, and every harness mode version before awaits", async () => {
    const unsupported = { ...baseInput, schemaVersion: "2.0" as const };
    expect(() => evaluateProductionProviderReadiness(unsupported as never)).toThrow(
      ProductionProviderReadinessError,
    );
    const ready = await evaluateProductionProviderReadiness(baseInput);
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: ready.decision,
        authoritativeInput: unsupported as never,
        observabilityRetentionEvidence: ready.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
    for (const mode of [
      "contract-validation",
      "authorization-validation",
      "credential-reference-validation",
      "transport-plan-dry-run",
      "request-mapping-dry-run",
      "rate-and-cost-admission-simulation",
      "circuit-simulation",
      "health-evaluation",
      "observability-redaction-simulation",
      "full-readiness-evaluation",
    ] as const) {
      expect(() =>
        runDisabledProductionProviderAdapterHarness({
          mode,
          readinessInput: unsupported as never,
        }),
      ).toThrow("readiness contract is invalid");
    }
    expect(() =>
      runDisabledProductionProviderAdapterHarness({
        mode: "response-mapping-fixture",
        readinessInput: unsupported as never,
        fixtureClassification: "successful-response",
        mappingEvidenceId: "mapping-version-two",
        resultEnvelopeId: "result-version-two",
        executionAttemptId: "attempt-version-two",
        startedAt: EVALUATED_AT,
      }),
    ).toThrow("readiness contract is invalid");
  });

  it.each([
    ["fixture classification", { fixtureClassification: "live-provider-response" }],
    ["mapping Evidence ID", { mappingEvidenceId: " invalid-mapping-id " }],
    ["Result Envelope ID URL", { resultEnvelopeId: "https://provider.invalid/result" }],
    ["Execution Attempt secret pattern", { executionAttemptId: "secret-value" }],
    ["start timestamp format", { startedAt: "not-a-timestamp" }],
    ["start timestamp chronology", { startedAt: "2026-07-30T03:00:00.000Z" }],
  ] as const)(
    "rejects malformed response fixture wrapper %s before ledger access",
    async (_name, patch) => {
      let ledgerCalls = 0;
      const readinessInput = inputWithCountingDeliveryLedger(() => {
        ledgerCalls += 1;
      });
      const wrapper = {
        mode: "response-mapping-fixture" as const,
        readinessInput,
        fixtureClassification: "successful-response" as const,
        mappingEvidenceId: "mapping-wrapper-boundary",
        resultEnvelopeId: "result-wrapper-boundary",
        executionAttemptId: "attempt-wrapper-boundary",
        startedAt: EVALUATED_AT,
        ...patch,
      };
      const error = thrownOf(() => runDisabledProductionProviderAdapterHarness(wrapper as never));
      expect(error).toBeInstanceOf(TypeError);
      expect(String(error)).toContain("response fixture input is invalid");
      expect(serializedError(error)).not.toContain(Object.values(patch)[0]);
      expect(ledgerCalls).toBe(0);
    },
  );

  it("rejects response wrapper accessors and functions without invocation or ledger access", async () => {
    let ledgerCalls = 0;
    let getterCalls = 0;
    let functionCalls = 0;
    const readinessInput = inputWithCountingDeliveryLedger(() => {
      ledgerCalls += 1;
    });
    const baseWrapper = {
      mode: "response-mapping-fixture" as const,
      readinessInput,
      fixtureClassification: "successful-response" as const,
      mappingEvidenceId: "mapping-wrapper-accessor",
      resultEnvelopeId: "result-wrapper-accessor",
      executionAttemptId: "attempt-wrapper-accessor",
      startedAt: EVALUATED_AT,
    };
    const accessorWrapper = { ...baseWrapper } as Record<string, unknown>;
    Object.defineProperty(accessorWrapper, "mappingEvidenceId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "mapping-must-not-be-read";
      },
    });
    expect(() => runDisabledProductionProviderAdapterHarness(accessorWrapper as never)).toThrow(
      "harness input is invalid",
    );

    expect(() =>
      runDisabledProductionProviderAdapterHarness({
        ...baseWrapper,
        executionAttemptId: (() => {
          functionCalls += 1;
          return "attempt-must-not-run";
        }) as never,
      }),
    ).toThrow("harness input is invalid");
    expect({ getterCalls, functionCalls, ledgerCalls }).toEqual({
      getterCalls: 0,
      functionCalls: 0,
      ledgerCalls: 0,
    });
  });

  it.each([
    [
      "readiness Decision ID",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        readinessDecisionId: " invalid-decision-id ",
      }),
    ],
    [
      "evaluation timestamp format",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        evaluatedAt: "not-a-timestamp",
      }),
    ],
    [
      "evaluation chronology",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        evaluatedAt: "2026-07-28T00:00:00.000Z",
      }),
    ],
    [
      "Adapter ID projection",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        adapterDescriptor: { ...input.adapterDescriptor, adapterId: " invalid-adapter " },
      }),
    ],
    [
      "Adapter fingerprint projection",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        adapterDescriptor: { ...input.adapterDescriptor, adapterFingerprint: "invalid" },
      }),
    ],
  ] as const)("normalizes malformed %s before every early-stop path", async (_label, mutate) => {
    const malformed = mutate({ ...baseInput, authorizationEvidence: null }) as never;
    try {
      await evaluateProductionProviderReadiness(malformed);
      throw new Error("Expected invalid public input");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionProviderReadinessError);
      expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(Object.isFrozen((error as ProductionProviderReadinessError).gateTrace)).toBe(true);
      expect(error).not.toHaveProperty("issues");
    }
    const ready = await evaluateProductionProviderReadiness(baseInput);
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: ready.decision,
        authoritativeInput: malformed,
        observabilityRetentionEvidence: ready.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
    for (const mode of ALL_DISABLED_HARNESS_MODES) {
      expect(() => runHarnessMode(mode, malformed)).toThrow("readiness contract is invalid");
    }
  });

  it("rejects enabled or live Adapter configuration in every harness mode", async () => {
    const enabled = {
      ...baseInput,
      adapterDescriptor: { ...baseInput.adapterDescriptor, state: "enabled" },
    } as never;
    for (const mode of [
      "contract-validation",
      "authorization-validation",
      "credential-reference-validation",
      "transport-plan-dry-run",
      "request-mapping-dry-run",
      "rate-and-cost-admission-simulation",
      "circuit-simulation",
      "health-evaluation",
      "observability-redaction-simulation",
      "full-readiness-evaluation",
    ] as const) {
      expect(() =>
        runDisabledProductionProviderAdapterHarness({ mode, readinessInput: enabled }),
      ).toThrow("readiness contract is invalid");
    }
    expect(() =>
      runDisabledProductionProviderAdapterHarness({
        mode: "response-mapping-fixture",
        readinessInput: enabled,
        fixtureClassification: "successful-response",
        mappingEvidenceId: "mapping-enabled",
        resultEnvelopeId: "result-enabled",
        executionAttemptId: "attempt-enabled",
        startedAt: EVALUATED_AT,
      }),
    ).toThrow("readiness contract is invalid");
  });

  it("accepts canonically identical reordered durable Delivery bindings", async () => {
    const reorderedInvocation = {
      ...baseInput.invocationRequest,
      activeSnapshotBinding: reverseObjectEntries(
        baseInput.invocationRequest.activeSnapshotBinding,
      ),
      registryIntegrityBinding: reverseObjectEntries(
        baseInput.invocationRequest.registryIntegrityBinding,
      ),
    };
    expect(reorderedInvocation.requestFingerprint).toBe(
      baseInput.invocationRequest.requestFingerprint,
    );
    const resolved = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: runtime.deliveryLedger,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: reorderedInvocation,
    });
    expect(resolved.invocationRequest.requestFingerprint).toBe(
      baseInput.invocationRequest.requestFingerprint,
    );
    const result = await evaluateProductionProviderReadiness({
      ...baseInput,
      invocationRequest: reorderedInvocation,
    });
    expect(result.decision.status).toBe("ready-for-dry-run");
  });

  it.each(["denied", "review-required", "not-evaluated", "expired"] as const)(
    "stops denied authorization outcome %s before credential and transport",
    async (outcome) => {
      const input = await inputWithAuthorizationOutcome(outcome);
      const result = await evaluateProductionProviderReadiness(input);
      expect(result.decision.status).toBe("not-ready");
      expect(result.decision.blockingReasonCodes).toEqual(["authorization_not_allowed"]);
      expect(result.gateTrace.map((entry) => entry.gate)).toEqual([
        "durable-delivery-and-invocation",
        "authorization",
      ]);
      expect(result.decision.credentialReferenceFingerprint).toBeNull();
      expect(result.decision.transportPolicyFingerprint).toBeNull();
    },
  );

  it("fails closed on missing Authorization without inspecting a forged later artifact", async () => {
    const result = await evaluateProductionProviderReadiness({
      ...baseInput,
      authorizationEvidence: null,
      credentialReference: {
        ...baseInput.credentialReference,
        referenceFingerprint: "0".repeat(64),
      },
    });
    expect(result.gateTrace.at(-1)?.gate).toBe("authorization");
    expect(result.decision.authorizationDecisionFingerprint).toBeNull();
    expect(result.decision.credentialReferenceFingerprint).toBeNull();
  });

  it("returns disabled-by-policy and never claims a live readiness state", async () => {
    const disabledAdapter = createProductionProviderAdapterDescriptor(
      {
        schemaVersion: "1.0",
        adapterId: "adapter-readiness-disabled",
        providerFamilyReference: baseInput.adapterDescriptor.providerFamilyReference,
        requestMappingVersion: "1.0",
        responseMappingVersion: "1.0",
        transportPolicyVersion: "1.0",
        observabilityPolicyVersion: "1.0",
        credentialReferenceClass: "evaluation-fixture-reference",
        state: "disabled",
      },
      capability,
    );
    const authority = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: runtime.deliveryLedger,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: invocation,
    });
    const authorizationEvidence = createAuthorizationDecisionEvidence(
      baseInput.expectedAuthorizationDecision,
      {
        deliveryAuthority: authority,
        adapter: disabledAdapter,
        requestedOperation: baseInput.requestedOperation,
        decisionAuthorityReference: baseInput.decisionAuthorityReference,
      },
    );
    const result = await evaluateProductionProviderReadiness({
      ...baseInput,
      adapterDescriptor: disabledAdapter,
      authorizationEvidence,
    });
    expect(result.decision.status).toBe("disabled-by-policy");
    expect(JSON.stringify(result)).not.toMatch(/ready-for-live|live-traffic/u);
  });

  it.each([
    [
      "credential-reference",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        credentialReference: createCredentialReference({
          ...withoutReferenceFingerprint(input.credentialReference),
          availability: "unavailable",
        }),
      }),
      "credential_unavailable",
    ],
    [
      "rate-and-capacity",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        rateCounters: { ...input.rateCounters, requestsInWindow: input.ratePolicy.requestLimit },
      }),
      "rate_capacity_rejected",
    ],
    [
      "cost-and-budget",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        costPolicy: { ...input.costPolicy, costCeilingMinorUnits: 0 },
      }),
      "cost_budget_rejected",
    ],
    [
      "circuit",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitFailureWindow: {
          ...input.circuitFailureWindow,
          failureCounts: [{ category: "transport-failure" as const, count: 3 }],
        },
      }),
      "circuit_not_ready",
    ],
    [
      "observability-redaction",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        observabilityPolicy: { ...input.observabilityPolicy, maximumMetricLabelCount: 1 },
      }),
      "observability_not_ready",
    ],
  ] as const)("stops exactly at the %s blocker", async (gate, mutate, blocker) => {
    const result = await evaluateProductionProviderReadiness(mutate(baseInput));
    expect(result.gateTrace.at(-1)?.gate).toBe(gate);
    expect(result.gateTrace.at(-1)?.status).toBe("stopped");
    expect(result.decision.blockingReasonCodes).toEqual([blocker]);
  });

  it("covers Adapter, Capability, Transport, Request Mapping, and bounded half-open semantics", async () => {
    const alternateCapability = createReasoningProviderCapabilityDescriptor({
      ...withoutCapabilityFingerprint(capability),
      providerCapabilityId: "alternate-capability",
    });
    const mismatchedAdapter = createProductionProviderAdapterDescriptor(
      withoutAdapterFingerprint(baseInput.adapterDescriptor),
      alternateCapability,
    );
    const adapterInvalid = await inputForAdapter(mismatchedAdapter, capability);
    expect((await evaluateProductionProviderReadiness(adapterInvalid)).decision).toMatchObject({
      status: "not-ready",
      blockingReasonCodes: ["adapter_invalid"],
    });

    const incompatibleCapability = createReasoningProviderCapabilityDescriptor({
      ...withoutCapabilityFingerprint(capability),
      providerCapabilityId: "incompatible-capability",
      providerClass: "remote-reasoning-provider",
    });
    const incompatibleAdapter = createProductionProviderAdapterDescriptor(
      withoutAdapterFingerprint(baseInput.adapterDescriptor),
      incompatibleCapability,
    );
    const capabilityInput = await inputForAdapter(incompatibleAdapter, incompatibleCapability);
    expect((await evaluateProductionProviderReadiness(capabilityInput)).decision).toMatchObject({
      status: "not-ready",
      blockingReasonCodes: ["capability_incompatible"],
    });

    const rejectedTransport = createSecureTransportPolicy({
      ...withoutPolicyFingerprint(baseInput.transportPolicy),
      providerFamilyReference: "provider-family/other",
    });
    expect(
      (
        await evaluateProductionProviderReadiness({
          ...baseInput,
          transportPolicy: rejectedTransport,
        })
      ).decision.blockingReasonCodes,
    ).toEqual(["transport_policy_rejected"]);

    const undersizedTransport = createSecureTransportPolicy({
      ...withoutPolicyFingerprint(baseInput.transportPolicy),
      maximumRequestBytes: 1,
    });
    const mappingRejected = await evaluateProductionProviderReadiness({
      ...baseInput,
      transportPolicy: undersizedTransport,
    }).then(async (selfRejected) => {
      expect(selfRejected.gateTrace.at(-1)?.gate).toBe("transport-policy-plan");
      const authority = createStaticProductionProviderTransportPolicyAuthority({
        adapter: baseInput.adapterDescriptor,
        expectedPolicy: undersizedTransport,
      });
      return createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: authority,
      }).evaluate({ ...baseInput, transportPolicy: undersizedTransport });
    });
    expect(mappingRejected.gateTrace.at(-1)?.gate).toBe("request-plan");
    expect(mappingRejected.decision.blockingReasonCodes).toEqual(["request_mapping_invalid"]);

    const openedAt = "2026-07-30T00:59:30.000Z";
    const openTransition = {
      circuitStateId: "circuit-half-open-source",
      adapter: baseInput.adapterDescriptor,
      previousState: null,
      thresholdPolicy: baseInput.circuitThresholdPolicy,
      failureWindow: {
        windowStartedAt: openedAt,
        failureCounts: [{ category: "transport-failure" as const, count: 3 }],
      },
      evaluatedAt: openedAt,
      command: "evaluate" as const,
      probeOutcome: "none" as const,
      probesAlreadyUsed: 0,
    };
    const open = transitionCircuitState(openTransition);
    const halfOpen = await evaluateProductionProviderReadiness({
      ...baseInput,
      previousCircuitState: open,
      circuitFailureWindow: { windowStartedAt: EVALUATED_AT, failureCounts: [] },
    });
    expect(halfOpen.decision.status).toBe("ready-for-dry-run");
    expect(halfOpen.evidence.circuit).toMatchObject({
      state: "half-open",
      probeAllowance: { maximumProbeCount: 2, remainingProbeCount: 2, dryRunProbePermitted: true },
    });
    const invalidProbe = await evaluateProductionProviderReadiness({
      ...baseInput,
      previousCircuitState: open,
      circuitFailureWindow: { windowStartedAt: EVALUATED_AT, failureCounts: [] },
      circuitProbesAlreadyUsed: 1,
    });
    expect(invalidProbe.decision.blockingReasonCodes).toEqual(["circuit_not_ready"]);
  });

  it("uses trusted Transport Policy authority and rejects coherent hostname substitution", async () => {
    const substitutedPolicy = createSecureTransportPolicy({
      ...withoutPolicyFingerprint(baseInput.transportPolicy),
      allowedHostnames: ["alternate.provider.dev"],
    });
    const result = await evaluateProductionProviderReadiness({
      ...baseInput,
      transportPolicy: substitutedPolicy,
    });
    expect(result.gateTrace.at(-1)).toMatchObject({
      gate: "transport-policy-plan",
      status: "stopped",
      reasonCodes: ["transport_policy_rejected"],
    });
    expect(result.evidence.transportPlan).toBeNull();

    let ledgerCalls = 0;
    const injectedAuthority = createStaticProductionProviderTransportPolicyAuthority({
      adapter: baseInput.adapterDescriptor,
      expectedPolicy: substitutedPolicy,
    });
    expect(() =>
      evaluateProductionProviderReadiness({
        ...baseInput,
        deliveryLedger: inputWithCountingDeliveryLedger(() => {
          ledgerCalls += 1;
        }).deliveryLedger,
        transportPolicy: substitutedPolicy,
        transportPolicyAuthority: injectedAuthority,
      } as never),
    ).toThrow(ProductionProviderReadinessError);
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: result.decision,
        authoritativeInput: {
          ...baseInput,
          transportPolicy: substitutedPolicy,
          transportPolicyAuthority: injectedAuthority,
        } as never,
        observabilityRetentionEvidence: result.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
    expect(ledgerCalls).toBe(0);
  });

  it("stops Invocation timeout greater than Transport request timeout", async () => {
    const incompatiblePolicy = createSecureTransportPolicy({
      ...withoutPolicyFingerprint(baseInput.transportPolicy),
      connectionTimeoutMilliseconds: 400,
      requestTimeoutMilliseconds: 500,
    });
    const authority = createStaticProductionProviderTransportPolicyAuthority({
      adapter: baseInput.adapterDescriptor,
      expectedPolicy: incompatiblePolicy,
    });
    const result = await createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: authority,
    }).evaluate({ ...baseInput, transportPolicy: incompatiblePolicy });
    expect(result.gateTrace.at(-1)).toMatchObject({
      gate: "transport-policy-plan",
      status: "stopped",
      reasonCodes: ["transport_policy_rejected"],
    });
    expect(result.evidence.rateAndCapacity).toBeNull();
  });

  it.each(["no-transport-retry", "governed-idempotent-retry"] as const)(
    "governs Transport retry policy %s independently from M13 application Attempts",
    async (retryTransportPolicy) => {
      const policy = createSecureTransportPolicy({
        ...withoutPolicyFingerprint(baseInput.transportPolicy),
        retryTransportPolicy,
      });
      const authority = createStaticProductionProviderTransportPolicyAuthority({
        adapter: baseInput.adapterDescriptor,
        expectedPolicy: policy,
      });
      const result = await createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: authority,
      }).evaluate({ ...baseInput, transportPolicy: policy });
      expect(result.decision.status).toBe("ready-for-dry-run");
    },
  );

  it("accepts two M13 application Attempts with no Transport retry", async () => {
    const retryInvocation = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:readiness-application-retry",
      retryMode: "retry-until-attempt-limit",
      maxAttemptCount: 2,
    });
    const deliveryAuthority = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: runtime.deliveryLedger,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: retryInvocation,
    });
    const authorizationAuthority: AuthorizationAuthority = {
      deliveryAuthority,
      adapter: baseInput.adapterDescriptor,
      requestedOperation: baseInput.requestedOperation,
      decisionAuthorityReference: baseInput.decisionAuthorityReference,
    };
    const input = {
      ...baseInput,
      invocationRequest: retryInvocation,
      authorizationEvidence: createAuthorizationDecisionEvidence(
        baseInput.expectedAuthorizationDecision,
        authorizationAuthority,
      ),
      costPolicy: { ...baseInput.costPolicy, maximumAttemptCount: 2 },
    };
    const result = await evaluateProductionProviderReadiness(input);
    expect(result.decision.status).toBe("ready-for-dry-run");
    expect(result.evidence.requestPlan?.timeoutAndCancellationPlan.timeoutMilliseconds).toBe(
      retryInvocation.executionPolicy.timeoutMilliseconds,
    );
  });

  it("invokes the Transport Policy authority only after Authorization", async () => {
    const callsBefore = getProductionProviderTransportPolicyAuthorityLookupCountForTest(
      configuredTransportPolicyAuthority,
    );
    const result = await evaluateProductionProviderReadiness({
      ...baseInput,
      authorizationEvidence: null,
    });
    expect(result.gateTrace.at(-1)?.gate).toBe("authorization");
    expect(
      getProductionProviderTransportPolicyAuthorityLookupCountForTest(
        configuredTransportPolicyAuthority,
      ),
    ).toBe(callsBefore);
    await expect(
      runDisabledProductionProviderAdapterHarness({
        mode: "transport-plan-dry-run",
        readinessInput: {
          ...baseInput,
          authorizationEvidence: null,
        },
      }),
    ).rejects.toThrow("Authorization is not ready");
    expect(
      getProductionProviderTransportPolicyAuthorityLookupCountForTest(
        configuredTransportPolicyAuthority,
      ),
    ).toBe(callsBefore);
  });

  it("rejects Transport Policy authority configuration accessors without invoking them", () => {
    let getterCalls = 0;
    const config = {};
    Object.defineProperty(config, "transportPolicyAuthority", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return configuredTransportPolicyAuthority;
      },
    });
    expect(() => createProductionProviderReadinessEvaluator(config as never)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });

  it("rejects hidden, symbolic, non-data, and inherited capabilities across every M14 wrapper", async () => {
    let getterCalls = 0;
    let ledgerCalls = 0;
    const countedInput = {
      ...baseInput,
      deliveryLedger: inputWithCountingDeliveryLedger(() => {
        ledgerCalls += 1;
      }).deliveryLedger,
    };
    const authorityCalls = getProductionProviderTransportPolicyAuthorityLookupCountForTest(
      configuredTransportPolicyAuthority,
    );
    const attacks = <T extends Record<string, unknown>>(base: T, allowedKey: keyof T) => {
      const hiddenUnknown = { ...base };
      Object.defineProperty(hiddenUnknown, "networkClient", {
        enumerable: false,
        get() {
          getterCalls += 1;
          return { request: () => undefined };
        },
      });
      const hiddenAllowed = { ...base };
      Object.defineProperty(hiddenAllowed, allowedKey, {
        enumerable: false,
        value: base[allowedKey],
      });
      const symbolic = { ...base, [Symbol("provider-client")]: {} };
      const inheritedProviderClient = Object.assign(
        Object.create({ providerClient: { request: () => undefined } }),
        base,
      ) as T;
      const inheritedCallbackPrototype = {};
      Object.defineProperty(inheritedCallbackPrototype, "callback", {
        enumerable: true,
        get() {
          getterCalls += 1;
          return () => undefined;
        },
      });
      const inheritedCallback = Object.assign(Object.create(inheritedCallbackPrototype), base) as T;
      const customPrototype = Object.assign(Object.create({}), base) as T;
      return [
        hiddenUnknown,
        hiddenAllowed,
        symbolic,
        inheritedProviderClient,
        inheritedCallback,
        customPrototype,
      ] as const;
    };

    for (const attacked of attacks(countedInput, "schemaVersion")) {
      const error = thrownOf(() => evaluateProductionProviderReadiness(attacked as never));
      expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(
        await verifyProductionProviderReadinessDecision({
          decision: {},
          authoritativeInput: attacked as never,
          observabilityRetentionEvidence: null,
        }),
      ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
      for (const mode of ALL_DISABLED_HARNESS_MODES) {
        expect(() => runHarnessMode(mode, attacked as never)).toThrow("readiness input is invalid");
      }
    }

    const verifierWrapper = {
      decision: {},
      authoritativeInput: countedInput,
      observabilityRetentionEvidence: null,
    };
    for (const attacked of attacks(verifierWrapper, "decision")) {
      expect(await verifyProductionProviderReadinessDecision(attacked as never)).toEqual({
        status: "invalid",
        reason: "readiness_decision_invalid",
      });
    }

    for (const mode of ALL_DISABLED_HARNESS_MODES) {
      const wrapper =
        mode === "response-mapping-fixture"
          ? {
              mode,
              readinessInput: countedInput,
              fixtureClassification: "successful-response" as const,
              mappingEvidenceId: "mapping-wrapper-own-shape",
              resultEnvelopeId: "result-wrapper-own-shape",
              executionAttemptId: "attempt-wrapper-own-shape",
              startedAt: EVALUATED_AT,
            }
          : { mode, readinessInput: countedInput };
      for (const attacked of attacks(wrapper, "mode")) {
        expect(() => runDisabledProductionProviderAdapterHarness(attacked as never)).toThrow(
          "harness input is invalid",
        );
      }
    }

    const evaluatorConfig = { transportPolicyAuthority: configuredTransportPolicyAuthority };
    for (const attacked of attacks(evaluatorConfig, "transportPolicyAuthority")) {
      expect(() => createProductionProviderReadinessEvaluator(attacked as never)).toThrow(
        "configuration is invalid",
      );
      expect(() => createDisabledProductionProviderAdapterHarness(attacked as never)).toThrow(
        "configuration is invalid",
      );
    }
    const authorityConfig = {
      adapter: baseInput.adapterDescriptor,
      expectedPolicy: baseInput.transportPolicy,
    };
    for (const attacked of attacks(authorityConfig, "adapter")) {
      expect(() =>
        createStaticProductionProviderTransportPolicyAuthority(attacked as never),
      ).toThrow("configuration is invalid");
    }

    expect({ getterCalls, ledgerCalls }).toEqual({ getterCalls: 0, ledgerCalls: 0 });
    expect(
      getProductionProviderTransportPolicyAuthorityLookupCountForTest(
        configuredTransportPolicyAuthority,
      ),
    ).toBe(authorityCalls);

    const binding = {
      schemaVersion: "1.0" as const,
      adapterId: baseInput.adapterDescriptor.adapterId,
      adapterFingerprint: baseInput.adapterDescriptor.adapterFingerprint,
      providerFamilyReference: baseInput.adapterDescriptor.providerFamilyReference,
      transportPolicyVersion: baseInput.adapterDescriptor.transportPolicyVersion,
    };
    const bindingAttacks = attacks(binding, "schemaVersion");
    for (const attacked of bindingAttacks) {
      expect(
        configuredTransportPolicyAuthority.getExpectedTransportPolicy(attacked as never),
      ).toBeNull();
    }

    expect({ getterCalls, ledgerCalls }).toEqual({ getterCalls: 0, ledgerCalls: 0 });
    expect(
      getProductionProviderTransportPolicyAuthorityLookupCountForTest(
        configuredTransportPolicyAuthority,
      ),
    ).toBe(authorityCalls + bindingAttacks.length);
  });

  it("rejects arbitrary structural Transport Policy authorities at composition", () => {
    const structuralAuthority = {
      getExpectedTransportPolicy: () => baseInput.transportPolicy,
    };
    expect(() =>
      createProductionProviderReadinessEvaluator({
        transportPolicyAuthority: structuralAuthority,
      }),
    ).toThrow("approved factory");
    expect(() =>
      createDisabledProductionProviderAdapterHarness({
        transportPolicyAuthority: structuralAuthority,
      }),
    ).toThrow("approved factory");
  });

  it("exposes only an immutable deterministic Transport Policy lookup method", () => {
    expect(Object.keys(configuredTransportPolicyAuthority)).toEqual(["getExpectedTransportPolicy"]);
    expect(Object.isFrozen(configuredTransportPolicyAuthority)).toBe(true);
    expect(JSON.stringify(Object.keys(configuredTransportPolicyAuthority))).not.toMatch(
      /url|client|network|credential|secret|socket|tls|dns/iu,
    );
  });

  it.each(["disabled", "quarantined"] as const)(
    "categorically rejects reset for a prior %s Circuit in facade and harness",
    async (stateKind) => {
      const evaluatedAt = "2026-07-30T00:59:00.000Z";
      const previousState = transitionCircuitState({
        circuitStateId: `circuit-prior-${stateKind}`,
        adapter: baseInput.adapterDescriptor,
        previousState: null,
        thresholdPolicy: baseInput.circuitThresholdPolicy,
        failureWindow: {
          windowStartedAt: evaluatedAt,
          failureCounts:
            stateKind === "quarantined"
              ? [{ category: "security-policy-violation", count: 1 }]
              : [],
        },
        evaluatedAt,
        command: stateKind === "disabled" ? "disable" : "evaluate",
        probeOutcome: "none",
        probesAlreadyUsed: 0,
      });
      const resetInput = {
        ...baseInput,
        previousCircuitState: previousState,
        circuitCommand: "reset" as const,
      };
      let ledgerCalls = 0;
      const countedResetInput = {
        ...resetInput,
        deliveryLedger: inputWithCountingDeliveryLedger(() => {
          ledgerCalls += 1;
        }).deliveryLedger,
      };
      const authorityCalls = getProductionProviderTransportPolicyAuthorityLookupCountForTest(
        configuredTransportPolicyAuthority,
      );
      const error = thrownOf(() => evaluateProductionProviderReadiness(countedResetInput));
      expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(Object.isFrozen((error as ProductionProviderReadinessError).gateTrace)).toBe(true);
      expect(
        await verifyProductionProviderReadinessDecision({
          decision: {},
          authoritativeInput: countedResetInput,
          observabilityRetentionEvidence: null,
        }),
      ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
      for (const mode of ALL_DISABLED_HARNESS_MODES) {
        expect(() => runHarnessMode(mode, countedResetInput)).toThrow(
          "Circuit reset is not permitted",
        );
      }
      expect(ledgerCalls).toBe(0);
      expect(
        getProductionProviderTransportPolicyAuthorityLookupCountForTest(
          configuredTransportPolicyAuthority,
        ),
      ).toBe(authorityCalls);
    },
  );

  it("rejects accessors, raw bypass fields, functions, URLs, and live Adapter state", async () => {
    let accessed = false;
    const accessor = { ...baseInput } as Record<string, unknown>;
    Object.defineProperty(accessor, "adapterDescriptor", {
      enumerable: true,
      get() {
        accessed = true;
        return baseInput.adapterDescriptor;
      },
    });
    expect(() => evaluateProductionProviderReadiness(accessor as never)).toThrow(
      ProductionProviderReadinessError,
    );
    expect(accessed).toBe(false);
    for (const bypass of [
      { endpointUrl: "https://api.provider.dev" },
      { rawSecret: "super-secret-value" },
      { providerClient: {} },
      { callback: () => undefined },
      { requestPlan: {} },
      { rawKnowledgeObject: {} },
    ]) {
      expect(() =>
        evaluateProductionProviderReadiness({ ...baseInput, ...bypass } as never),
      ).toThrow(ProductionProviderReadinessError);
    }
    expect(() =>
      createProductionProviderAdapterDescriptor(
        {
          ...withoutAdapterFingerprint(baseInput.adapterDescriptor),
          state: "enabled",
        } as never,
        capability,
      ),
    ).toThrow();
  });

  it.each([
    ["Query Result", { queryResult: { schemaVersion: "1.0", items: [] } }],
    ["Context Package override", { contextPackageOverride: { contextPackageId: "bypass" } }],
    ["Delivery override", { deliveryArtifactOverride: { deliveryEnvelopeId: "bypass" } }],
    ["Response Mapping", { responseMappingEvidence: { status: "prebuilt" } }],
    ["Readiness Decision", { readinessDecision: { status: "ready-for-dry-run" } }],
    ["Health evidence", { healthEvidence: { healthState: "healthy" } }],
    ["Observability evidence", { observabilityEvidence: { status: "ready" } }],
    ["low-level gate", { lowLevelGateResult: { status: "allowed" } }],
    ["provider payload", { providerPayload: { model: "provider-specific-model" } }],
    ["tool payload", { toolPayload: { tools: [{ name: "bypass" }] } }],
    ["function payload", { functionPayload: { functionName: "bypass" } }],
    ["DNS hook", { dnsResolver: () => "203.0.113.1" }],
    ["socket hook", { socketFactory: () => ({}) }],
    ["TLS hook", { tlsHook: () => ({ authorized: true }) }],
    ["Agent object", { agentRuntime: { agentId: "agent-bypass" } }],
    ["Hermes object", { hermesMessage: { channel: "external" } }],
    ["MCP object", { mcpPayload: { method: "tools/call" } }],
    ["environment", { environment: { PROVIDER_TOKEN: "must-not-enter" } }],
    ["random source", { randomSource: () => 0.5 }],
    ["implicit clock", { clock: () => EVALUATED_AT }],
    ["Request Plan", { requestPlan: { status: "prebuilt" } }],
    ["Knowledge Object", { rawKnowledgeObject: { objectType: "decision" } }],
    ["URL", { endpointUrl: "https://provider.invalid/live" }],
    ["secret", { rawSecret: "must-not-enter" }],
    ["provider client", { providerClient: { class: "live-client" } }],
    ["callback", { callback: () => undefined }],
  ] as const)(
    "rejects %s bypass through facade and every common harness capture",
    async (_name, bypass) => {
      const bypassed = { ...baseInput, ...bypass } as never;
      expect(() => evaluateProductionProviderReadiness(bypassed)).toThrow(
        ProductionProviderReadinessError,
      );
      for (const mode of [
        "contract-validation",
        "authorization-validation",
        "credential-reference-validation",
        "transport-plan-dry-run",
        "request-mapping-dry-run",
        "rate-and-cost-admission-simulation",
        "circuit-simulation",
        "health-evaluation",
        "observability-redaction-simulation",
        "full-readiness-evaluation",
      ] as const) {
        expect(() =>
          runDisabledProductionProviderAdapterHarness({ mode, readinessInput: bypassed }),
        ).toThrow("readiness input is invalid");
      }
      expect(() =>
        runDisabledProductionProviderAdapterHarness({
          mode: "response-mapping-fixture",
          readinessInput: bypassed,
          fixtureClassification: "successful-response",
          mappingEvidenceId: "mapping-bypass",
          resultEnvelopeId: "result-bypass",
          executionAttemptId: "attempt-bypass",
          startedAt: EVALUATED_AT,
        }),
      ).toThrow("readiness input is invalid");
    },
  );

  it.each([
    [
      "raw secret",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        credentialReference: {
          ...input.credentialReference,
          rawSecret: "acceptance-raw-secret-value",
        },
      }),
      "acceptance-raw-secret-value",
    ],
    [
      "token",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        costPolicy: { ...input.costPolicy, token: "acceptance-token-value" },
      }),
      "acceptance-token-value",
    ],
    [
      "databaseSecret camel-case alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        ratePolicy: { ...input.ratePolicy, databaseSecret: "acceptance-database-material" },
      }),
      "acceptance-database-material",
    ],
    [
      "database-secret kebab-case alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        rateCounters: {
          ...input.rateCounters,
          "database-secret": "acceptance-separated-secret-material",
        },
      }),
      "acceptance-separated-secret-material",
    ],
    [
      "serviceToken compound alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        costPolicy: { ...input.costPolicy, serviceToken: "acceptance-service-material" },
      }),
      "acceptance-service-material",
    ],
    [
      "credential header",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        transportPolicy: {
          ...input.transportPolicy,
          headers: { authorization: "Bearer acceptance-header-credential" },
        },
      }),
      "acceptance-header-credential",
    ],
    [
      "customHeaders compound alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        transportPolicy: {
          ...input.transportPolicy,
          customHeaders: { correlation: "acceptance-custom-header" },
        },
      }),
      "acceptance-custom-header",
    ],
    [
      "environmentConfig compound alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        observabilityPolicy: {
          ...input.observabilityPolicy,
          environmentConfig: { class: "acceptance-environment-override" },
        },
      }),
      "acceptance-environment-override",
    ],
    [
      "systemClock camel-case alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitThresholdPolicy: {
          ...input.circuitThresholdPolicy,
          systemClock: { source: "acceptance-clock-override" },
        },
      }),
      "acceptance-clock-override",
    ],
    [
      "time_source snake-case alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitThresholdPolicy: {
          ...input.circuitThresholdPolicy,
          time_source: { class: "acceptance-time-source" },
        },
      }),
      "acceptance-time-source",
    ],
    [
      "functionDefinition compound alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        providerCapability: {
          ...input.providerCapability,
          functionDefinition: { name: "acceptance-function-definition" },
        },
      }),
      "acceptance-function-definition",
    ],
    [
      "arbitrary URL override",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        transportPolicy: {
          ...input.transportPolicy,
          endpointUrl: "https://acceptance.invalid/live",
        },
      }),
      "acceptance.invalid",
    ],
    [
      "credential-bearing URL",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        ratePolicy: {
          ...input.ratePolicy,
          mirror: "https://acceptance-user:acceptance-password@provider.invalid/live",
        },
      }),
      "acceptance-password",
    ],
    [
      "provider client object",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        providerCapability: {
          ...input.providerCapability,
          providerClient: { clientClass: "acceptance-live-client" },
        },
      }),
      "acceptance-live-client",
    ],
    [
      "custom_network_client mixed separator alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        providerCapability: {
          ...input.providerCapability,
          custom_network_client: { class: "acceptance-network-client" },
        },
      }),
      "acceptance-network-client",
    ],
    [
      "customProvider camel-case alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        adapterDescriptor: {
          ...input.adapterDescriptor,
          customProvider: { class: "acceptance-provider-override" },
        },
      }),
      "acceptance-provider-override",
    ],
    [
      "provider client function",
      (input: EvaluateProductionProviderReadinessInput, onInvoke: () => void) => ({
        ...input,
        adapterDescriptor: { ...input.adapterDescriptor, providerClient: onInvoke },
      }),
      "providerClient",
    ],
    [
      "callback",
      (input: EvaluateProductionProviderReadinessInput, onInvoke: () => void) => ({
        ...input,
        observabilityPolicy: { ...input.observabilityPolicy, callback: onInvoke },
      }),
      "callback",
    ],
    [
      "prebuilt readiness artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        costPolicy: {
          ...input.costPolicy,
          candidate: {
            readinessDecisionId: "acceptance-prebuilt-readiness",
            decisionFingerprint: "a".repeat(64),
          },
        },
      }),
      "acceptance-prebuilt-readiness",
    ],
    [
      "transportPlan prebuilt artifact alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        ratePolicy: {
          ...input.ratePolicy,
          transportPlan: { status: "acceptance-prebuilt-transport" },
        },
      }),
      "acceptance-prebuilt-transport",
    ],
    [
      "capabilityResult prebuilt artifact alias",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        costPolicy: {
          ...input.costPolicy,
          capabilityResult: { status: "acceptance-prebuilt-capability" },
        },
      }),
      "acceptance-prebuilt-capability",
    ],
    [
      "prebuilt request artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        ratePolicy: {
          ...input.ratePolicy,
          candidate: {
            requestPlanId: "acceptance-prebuilt-request",
            requestPlanFingerprint: "b".repeat(64),
          },
        },
      }),
      "acceptance-prebuilt-request",
    ],
    [
      "prebuilt response artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitThresholdPolicy: {
          ...input.circuitThresholdPolicy,
          candidate: {
            mappingEvidenceId: "acceptance-prebuilt-response",
            mappingEvidenceFingerprint: "c".repeat(64),
          },
        },
      }),
      "acceptance-prebuilt-response",
    ],
    [
      "prebuilt health artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitFailureWindow: {
          ...input.circuitFailureWindow,
          candidate: {
            healthEvidenceId: "acceptance-prebuilt-health",
            healthFingerprint: "d".repeat(64),
          },
        },
      }),
      "acceptance-prebuilt-health",
    ],
    [
      "prebuilt observability artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        observabilityPolicy: {
          ...input.observabilityPolicy,
          candidate: {
            readinessEvidenceId: "acceptance-prebuilt-observability",
            readinessFingerprint: "e".repeat(64),
          },
        },
      }),
      "acceptance-prebuilt-observability",
    ],
    [
      "prebuilt low-level gate artifact",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        expectedAuthorizationDecision: {
          ...input.expectedAuthorizationDecision,
          nested: { gateResult: { status: "acceptance-prebuilt-gate" } },
        },
      }),
      "acceptance-prebuilt-gate",
    ],
  ] as const)(
    "rejects nested %s material before facade or any harness mode dispatch",
    async (_name, mutate, marker) => {
      let invocationCount = 0;
      const bypassed = mutate(baseInput, () => {
        invocationCount += 1;
      }) as never;
      const facadeError = thrownOf(() => evaluateProductionProviderReadiness(bypassed));
      expect(facadeError).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(serializedError(facadeError)).not.toContain(marker);

      for (const mode of ALL_DISABLED_HARNESS_MODES) {
        const harnessError = thrownOf(() => runHarnessMode(mode, bypassed));
        expect(harnessError).toBeInstanceOf(TypeError);
        expect(String(harnessError)).toContain("readiness input is invalid");
        expect(serializedError(harnessError)).not.toContain(marker);
      }
      expect(invocationCount).toBe(0);
    },
  );

  it("rejects a nested accessor without invoking it in the facade or any harness mode", async () => {
    let getterCalls = 0;
    const poisonedPolicy = { ...baseInput.costPolicy } as Record<string, unknown>;
    Object.defineProperty(poisonedPolicy, "providerClient", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return { class: "acceptance-live-client" };
      },
    });
    const bypassed = { ...baseInput, costPolicy: poisonedPolicy } as never;
    expect(() => evaluateProductionProviderReadiness(bypassed)).toThrow(
      ProductionProviderReadinessError,
    );
    for (const mode of ALL_DISABLED_HARNESS_MODES) {
      expect(() => runHarnessMode(mode, bypassed)).toThrow("readiness input is invalid");
    }
    expect(getterCalls).toBe(0);
  });

  it("detects nested coherent re-sign substitution in the final Decision", async () => {
    const result = await evaluateProductionProviderReadiness(baseInput);
    const unsignedDecision = {
      ...result.decision,
      readinessDecisionId: "readiness-substituted",
    } as Record<string, unknown>;
    delete unsignedDecision.decisionFingerprint;
    const substituted = {
      ...unsignedDecision,
      decisionFingerprint: fingerprintProviderReadinessArtifact(unsignedDecision),
    };
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: substituted,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: result.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_binding_mismatch" });
  });

  it("stops a coherent re-signed test candidate at gate 13 before structural stop", async () => {
    const ready = await evaluateProductionProviderReadiness(baseInput);
    const evaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(evaluator).count).toBe(0);
    const unsignedCandidate = {
      ...ready.decision,
      healthEvidenceFingerprint: "0".repeat(64),
    } as Record<string, unknown>;
    delete unsignedCandidate.decisionFingerprint;
    const resignedCandidate = {
      ...unsignedCandidate,
      decisionFingerprint: fingerprintProviderReadinessArtifact(unsignedCandidate),
    };
    try {
      await evaluateProductionProviderReadinessWithDecisionCandidateForTest(evaluator, {
        readinessInput: baseInput,
        decisionCandidate: resignedCandidate,
      });
      throw new Error("Expected gate-13 substitution failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionProviderReadinessError);
      const trace = (error as ProductionProviderReadinessError).gateTrace;
      expect(trace.at(-1)).toMatchObject({
        order: 13,
        gate: "readiness-decision",
        status: "stopped",
      });
      expect(trace.some((entry) => entry.order === 14)).toBe(false);
    }
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(evaluator).count).toBe(0);
    const packageFacade = await import("../src/index.js");
    expect(packageFacade).not.toHaveProperty(
      "evaluateProductionProviderReadinessWithDecisionCandidateForTest",
    );
  });

  it("rejects malformed Authorization evidence containing nested secret or path material at capture", async () => {
    for (const injected of [
      { nested: { apiKey: "secret-value-that-must-not-escape" } },
      { nested: { artifactPath: "/Users/adam/private/provider-key" } },
    ]) {
      const malformed = { ...baseInput.authorizationEvidence, ...injected };
      const error = thrownOf(() =>
        evaluateProductionProviderReadiness({
          ...baseInput,
          authorizationEvidence: malformed as never,
        }),
      );
      expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(serializedError(error)).not.toContain(JSON.stringify(injected));
    }
  });

  it("rejects nested URL, client, callback, secret, and path bypass shapes at capture", async () => {
    for (const injected of [
      { nested: { endpointUrl: "https://provider.invalid/live" } },
      { nested: { providerClient: { class: "live-client" } } },
      { nested: { authorizationHeader: "Bearer must-not-escape" } },
      { nested: { artifactPath: "/private/provider/credential" } },
    ]) {
      const error = thrownOf(() =>
        evaluateProductionProviderReadiness({
          ...baseInput,
          authorizationEvidence: { ...baseInput.authorizationEvidence, ...injected } as never,
        }),
      );
      expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
      expect(serializedError(error)).not.toContain(JSON.stringify(injected));
    }
    expect(() =>
      evaluateProductionProviderReadiness({
        ...baseInput,
        authorizationEvidence: {
          ...baseInput.authorizationEvidence,
          nested: { callback: () => undefined },
        } as never,
      }),
    ).toThrow(ProductionProviderReadinessError);
  });

  it.each([
    [
      "rate-and-capacity",
      "rate_capacity_rejected",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        ratePolicy: { ...input.ratePolicy, requestLimit: 0 },
      }),
    ],
    [
      "cost-and-budget",
      "cost_budget_rejected",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        pricingReference: { ...input.pricingReference, inputUnitSize: 0 },
      }),
    ],
    [
      "circuit",
      "circuit_not_ready",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        circuitThresholdPolicy: { ...input.circuitThresholdPolicy, failureThreshold: 0 },
      }),
    ],
    [
      "health",
      "health_not_ready",
      (input: EvaluateProductionProviderReadinessInput) => ({
        ...input,
        healthEvidenceId: " invalid-health-id ",
      }),
    ],
  ] as const)(
    "normalizes malformed %s input into a frozen stopped decision",
    async (gate, blocker, mutate) => {
      const result = await evaluateProductionProviderReadiness(mutate(baseInput) as never);
      expect(result.gateTrace.at(-1)).toMatchObject({ gate, status: "stopped" });
      expect(result.decision.blockingReasonCodes).toEqual([blocker]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.gateTrace)).toBe(true);
      expect(Object.isFrozen(result.gateTrace.at(-1)?.reasonCodes)).toBe(true);
    },
  );

  it("captures the public Decision verifier wrapper without invoking getters", async () => {
    let decisionGetterCalls = 0;
    let authorityGetterCalls = 0;
    const wrapper = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(wrapper, "decision", {
      enumerable: true,
      get() {
        decisionGetterCalls += 1;
        return {};
      },
    });
    Object.defineProperty(wrapper, "authoritativeInput", {
      enumerable: true,
      get() {
        authorityGetterCalls += 1;
        return baseInput;
      },
    });
    expect(await verifyProductionProviderReadinessDecision(wrapper as never)).toEqual({
      status: "invalid",
      reason: "readiness_decision_invalid",
    });
    expect(decisionGetterCalls).toBe(0);
    expect(authorityGetterCalls).toBe(0);
  });

  it("verifies canonical Decision equality independent of object key insertion order", async () => {
    const result = await evaluateProductionProviderReadiness(baseInput);
    const reordered = Object.fromEntries(Object.entries(result.decision).reverse());
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: reordered,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: result.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "valid", reason: null });

    const nestedSubstitution = { ...result.decision, healthEvidenceFingerprint: "0".repeat(64) };
    const unsigned = { ...nestedSubstitution } as Record<string, unknown>;
    delete unsigned.decisionFingerprint;
    const resigned = {
      ...unsigned,
      decisionFingerprint: fingerprintProviderReadinessArtifact(unsigned),
    };
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: resigned,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: result.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_binding_mismatch" });
  });

  it("captures facade and harness caller data before the first await", async () => {
    const facadeGate = deferred<void>();
    const facadeInput = mutableInputWithDelayedLedger(facadeGate.promise);
    const facadePromise = evaluateProductionProviderReadiness(facadeInput);
    facadeInput.rateCounters.requestsInWindow = facadeInput.ratePolicy.requestLimit;
    facadeInput.authorizationEvidence = null;
    facadeGate.resolve();
    const facadeResult = await facadePromise;
    expect(facadeResult.decision.status).toBe("ready-for-dry-run");

    const harnessGate = deferred<void>();
    const harnessInput = mutableInputWithDelayedLedger(harnessGate.promise);
    const harnessPromise = runDisabledProductionProviderAdapterHarness({
      mode: "authorization-validation",
      readinessInput: harnessInput,
    });
    harnessInput.authorizationEvidence = null;
    harnessGate.resolve();
    const harnessResult = await harnessPromise;
    expect(harnessResult.mode).toBe("authorization-validation");
    if (harnessResult.mode !== "authorization-validation") throw new Error("Unexpected mode");
    expect(harnessResult.authorizationValidation).toMatchObject({ status: "allowed" });
  });

  it("keeps the configured opaque Transport Policy authority immutable", async () => {
    expect(
      Reflect.set(configuredTransportPolicyAuthority, "getExpectedTransportPolicy", () => null),
    ).toBe(false);
    expect((await evaluateProductionProviderReadiness(baseInput)).decision.status).toBe(
      "ready-for-dry-run",
    );
  });

  it("captures Decision verifier candidate and authority aliases before awaiting ledger reads", async () => {
    const ready = await evaluateProductionProviderReadiness(baseInput);
    const gate = deferred<void>();
    const authoritativeInput = mutableInputWithDelayedLedger(gate.promise);
    const candidate = structuredClone(ready.decision) as Record<string, unknown>;
    const retentionCandidate = structuredClone(ready.evidence.observabilityRetention);
    if (retentionCandidate === null) throw new Error("Expected retention evidence");
    const verificationPromise = verifyProductionProviderReadinessDecision({
      decision: candidate,
      authoritativeInput,
      observabilityRetentionEvidence: retentionCandidate,
    });
    candidate.status = "not-ready";
    retentionCandidate.retentionFingerprint = "0".repeat(64);
    authoritativeInput.authorizationEvidence = null;
    gate.resolve();
    expect(await verificationPromise).toEqual({ status: "valid", reason: null });
  });

  it("freezes public error traces and never returns an internal exception", async () => {
    try {
      await evaluateProductionProviderReadiness({
        ...baseInput,
        deliveryIdentity: { ...baseInput.deliveryIdentity, transactionId: "missing-transaction" },
      });
      throw new Error("Expected authority failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionProviderReadinessError);
      const readinessError = error as ProductionProviderReadinessError;
      expect(Object.isFrozen(readinessError.gateTrace)).toBe(true);
      expect(Object.isFrozen(readinessError.gateTrace[0])).toBe(true);
    }
    await expect(
      evaluateProductionProviderReadiness({
        ...baseInput,
        invocationRequest: {
          ...baseInput.invocationRequest,
          requestFingerprint: "0".repeat(64),
        },
      }),
    ).rejects.toMatchObject({
      code: "delivery_authority_invalid",
      gateTrace: [{ gate: "durable-delivery-and-invocation", status: "stopped" }],
    });
  });

  it.each([
    ["contract-validation", "contractValidation", { contractValidation: { status: "valid" } }],
    [
      "authorization-validation",
      "authorizationValidation",
      { authorizationValidation: { status: "allowed", outcome: "allowed" } },
    ],
    [
      "credential-reference-validation",
      "credentialValidation",
      { credentialValidation: { status: "valid" } },
    ],
    [
      "transport-plan-dry-run",
      "transportDryRun",
      {
        transportDryRun: {
          policyVerification: { status: "valid" },
          plan: { status: "validated-dry-run" },
          planVerification: { status: "valid" },
        },
      },
    ],
    [
      "request-mapping-dry-run",
      "requestMappingDryRun",
      { requestMappingDryRun: { verification: { status: "valid" } } },
    ],
    [
      "rate-and-cost-admission-simulation",
      "admissionSimulation",
      {
        admissionSimulation: {
          rate: { outcome: "admitted" },
          rateVerification: { status: "valid" },
          cost: { outcome: "within-budget" },
          costVerification: { status: "valid" },
        },
      },
    ],
    [
      "circuit-simulation",
      "circuitSimulation",
      { circuitSimulation: { state: { state: "closed" }, verification: { status: "valid" } } },
    ],
    [
      "health-evaluation",
      "healthEvaluation",
      {
        healthEvaluation: { health: { healthState: "healthy" }, verification: { status: "valid" } },
      },
    ],
    [
      "observability-redaction-simulation",
      "observabilitySimulation",
      {
        observabilitySimulation: {
          bundle: { readiness: { status: "ready" } },
          verification: { status: "valid" },
        },
      },
    ],
    [
      "full-readiness-evaluation",
      "fullReadinessEvaluation",
      {
        fullReadinessEvaluation: {
          evaluation: { decision: { status: "ready-for-dry-run" } },
          decisionVerification: { status: "valid" },
        },
      },
    ],
  ] as const)("supports real disabled harness mode %s", async (mode, resultField, semantics) => {
    const result = await runDisabledProductionProviderAdapterHarness({
      mode,
      readinessInput: baseInput,
    });
    expect(result.mode).toBe(mode);
    expect(result).toHaveProperty(resultField);
    expect(result).toMatchObject(semantics);
    if (mode !== "full-readiness-evaluation") {
      expect(result).not.toHaveProperty("fullReadinessEvaluation");
    }
  });

  it("retains and verifies the exact redacted observability snapshot deterministically", async () => {
    const first = await runDisabledProductionProviderAdapterHarness({
      mode: "observability-redaction-simulation",
      readinessInput: baseInput,
    });
    const second = await runDisabledProductionProviderAdapterHarness({
      mode: "observability-redaction-simulation",
      readinessInput: baseInput,
    });
    if (
      first.mode !== "observability-redaction-simulation" ||
      second.mode !== "observability-redaction-simulation"
    ) {
      throw new Error("Unexpected harness mode");
    }
    const firstSimulation = first.observabilitySimulation as {
      bundle: {
        structuredLog: unknown;
        metrics: readonly unknown[];
        traces: readonly unknown[];
        publicErrors: readonly unknown[];
      };
      retainedSnapshot: {
        logs: readonly unknown[];
        metrics: readonly unknown[];
        traces: readonly unknown[];
        publicErrors: readonly unknown[];
      };
      retentionEvidence: ProviderObservabilityRetentionEvidence;
    };
    expect(firstSimulation.retainedSnapshot).toEqual({
      logs: [firstSimulation.bundle.structuredLog],
      metrics: firstSimulation.bundle.metrics,
      traces: firstSimulation.bundle.traces,
      publicErrors: firstSimulation.bundle.publicErrors,
    });
    expect(Object.isFrozen(firstSimulation.retainedSnapshot)).toBe(true);
    expect(firstSimulation.retentionEvidence).toMatchObject({
      sinkPolicyVersion: "1.0",
      maximumEntriesPerArtifact: 2,
      maximumMetricLabelCardinality: 16,
      retainedLogCount: 1,
      retainedMetricCount: 2,
      retainedTraceCount: 1,
      appendCount: 1,
    });
    expect(firstSimulation.retentionEvidence.retainedPublicErrorCount).toBeLessThanOrEqual(1);
    expect(Object.isFrozen(firstSimulation.retentionEvidence)).toBe(true);
    expect(Object.isFrozen(firstSimulation.retentionEvidence.retainedMetricFingerprints)).toBe(
      true,
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(firstSimulation.retainedSnapshot)).not.toMatch(
      /Use only the exact governed Context Package reference|Produce the deterministic governed evaluation fixture|Bearer|sk_live|\/Users\//u,
    );

    const health = await runDisabledProductionProviderAdapterHarness({
      mode: "health-evaluation",
      readinessInput: baseInput,
    });
    if (health.mode !== "health-evaluation") throw new Error("Unexpected harness mode");
    expect(health.healthEvaluation).toHaveProperty("retainedObservabilitySnapshot");
    expect(
      (
        health.healthEvaluation as {
          observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence;
        }
      ).observabilityRetentionEvidence.appendCount,
    ).toBe(1);
  });

  it("appends exactly once during evaluation and never appends during Decision replay", async () => {
    const evaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(evaluator)).toBe(0);
    const result = await evaluator.evaluate(baseInput);
    expect(result.decision.status).toBe("ready-for-dry-run");
    expect(result.evidence.observabilityRetention?.appendCount).toBe(1);
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(evaluator)).toBe(1);
    expect(
      await evaluator.verifyDecision({
        decision: result.decision,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: result.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "valid", reason: null });
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(evaluator)).toBe(1);

    const earlyEvaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    const early = await earlyEvaluator.evaluate({ ...baseInput, authorizationEvidence: null });
    expect(early.decision.blockingReasonCodes).toEqual(["authorization_not_allowed"]);
    expect(early.evidence.observabilityRetention).toBeNull();
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(earlyEvaluator)).toBe(0);
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(earlyEvaluator).count).toBe(
      0,
    );

    const harness = createDisabledProductionProviderAdapterHarness({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    expect(getDisabledProductionProviderHarnessObservabilityAppendCountForTest(harness)).toBe(0);
    const full = await harness.run({
      mode: "full-readiness-evaluation",
      readinessInput: baseInput,
    });
    if (full.mode !== "full-readiness-evaluation") throw new Error("Unexpected harness mode");
    expect(
      full.fullReadinessEvaluation.evaluation.evidence.observabilityRetention?.appendCount,
    ).toBe(1);
    expect(getDisabledProductionProviderHarnessObservabilityAppendCountForTest(harness)).toBe(1);
  });

  it("requires the exact evaluator-private issued Decision and retention pair", async () => {
    const issuingEvaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    const freshEvaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    const issued = await issuingEvaluator.evaluate(baseInput);
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(issuingEvaluator)).toEqual({
      capacity: 4,
      count: 1,
      evictionPolicy: "first-issued-fifo-v1",
    });
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(freshEvaluator).count).toBe(
      0,
    );
    const freshVerification = await freshEvaluator.verifyDecision({
      decision: structuredClone(issued.decision),
      authoritativeInput: baseInput,
      observabilityRetentionEvidence: structuredClone(issued.evidence.observabilityRetention),
    });
    expect(freshVerification).toEqual({
      status: "invalid",
      reason: "readiness_decision_binding_mismatch",
    });
    expect(JSON.stringify(freshVerification)).not.toMatch(/Bearer|sk_live|\/Users\//iu);
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(freshEvaluator)).toBe(0);
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(freshEvaluator).count).toBe(
      0,
    );
    const earlyInput = { ...baseInput, authorizationEvidence: null };
    const early = await issuingEvaluator.evaluate(earlyInput);
    expect(early.evidence.observabilityRetention).toBeNull();
    expect(
      await freshEvaluator.verifyDecision({
        decision: early.decision,
        authoritativeInput: earlyInput,
        observabilityRetentionEvidence: null,
      }),
    ).toEqual({ status: "valid", reason: null });
    expect(Object.keys(issuingEvaluator).sort()).toEqual(["evaluate", "verifyDecision"]);
    expect(JSON.stringify(issuingEvaluator)).toBe("{}");
  });

  it("deduplicates repeat issuance and deterministically evicts the first issued pair", async () => {
    const evaluator = createProductionProviderReadinessEvaluator({
      transportPolicyAuthority: configuredTransportPolicyAuthority,
    });
    const first = await evaluator.evaluate(baseInput);
    const repeated = await evaluator.evaluate(baseInput);
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first));
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(evaluator).count).toBe(1);
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(evaluator)).toBe(2);

    const issued = [first];
    const inputs = [baseInput];
    for (let index = 2; index <= 5; index += 1) {
      const input = { ...baseInput, readinessDecisionId: `readiness-decision-eviction-${index}` };
      inputs.push(input);
      issued.push(await evaluator.evaluate(input));
    }
    expect(getProductionProviderReadinessRetentionIssuanceStateForTest(evaluator)).toEqual({
      capacity: 4,
      count: 4,
      evictionPolicy: "first-issued-fifo-v1",
    });
    expect(
      await evaluator.verifyDecision({
        decision: first.decision,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: first.evidence.observabilityRetention,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_binding_mismatch" });
    for (let index = 1; index < issued.length; index += 1) {
      expect(
        await evaluator.verifyDecision({
          decision: issued[index]!.decision,
          authoritativeInput: inputs[index]!,
          observabilityRetentionEvidence: issued[index]!.evidence.observabilityRetention,
        }),
      ).toEqual({ status: "valid", reason: null });
    }
    expect(getProductionProviderReadinessObservabilityAppendCountForTest(evaluator)).toBe(6);
  });

  it("derives immutable configuration only for the exact approved evaluator instance", () => {
    const expected = deriveApprovedProductionProviderReadinessEvaluatorConfiguration(
      configuredEvaluator,
      {
        adapterDescriptor: baseInput.adapterDescriptor,
        transportPolicy: baseInput.transportPolicy,
      },
    );
    expect(expected).toEqual({
      configurationBindingVersion: "1.0",
      adapterId: baseInput.adapterDescriptor.adapterId,
      adapterFingerprint: baseInput.adapterDescriptor.adapterFingerprint,
      providerFamilyReference: baseInput.adapterDescriptor.providerFamilyReference,
      transportPolicyId: baseInput.transportPolicy.transportPolicyId,
      transportPolicyFingerprint: baseInput.transportPolicy.policyFingerprint,
      transportPolicyVersion: baseInput.adapterDescriptor.transportPolicyVersion,
      observabilityPolicyVersion: baseInput.adapterDescriptor.observabilityPolicyVersion,
      readinessEvaluatorContractVersion: "1.0",
    });
    expect(Object.isFrozen(expected)).toBe(true);
    for (const candidate of [
      {
        evaluate: configuredEvaluator.evaluate,
        verifyDecision: configuredEvaluator.verifyDecision,
      },
      Object.create(
        Object.getPrototypeOf(configuredEvaluator),
        Object.getOwnPropertyDescriptors(configuredEvaluator),
      ),
      new Proxy(configuredEvaluator, {}),
      Object.freeze({
        evaluate: configuredEvaluator.evaluate.bind(configuredEvaluator),
        verifyDecision: configuredEvaluator.verifyDecision.bind(configuredEvaluator),
      }),
    ]) {
      expect(() =>
        deriveApprovedProductionProviderReadinessEvaluatorConfiguration(candidate, {
          adapterDescriptor: baseInput.adapterDescriptor,
          transportPolicy: baseInput.transportPolicy,
        }),
      ).toThrow("provenance is invalid");
    }
  });

  it.each([
    ["snapshot fingerprint", { canonicalSnapshotFingerprint: "0".repeat(64) }],
    ["sink configuration", { maximumMetricLabelCardinality: 17 }],
    ["retained counts", { retainedLogCount: 0, retainedLogFingerprints: [] }],
    ["append count", { appendCount: 2 }],
  ] as const)("rejects coherent re-signed retention %s substitution", async (_label, mutation) => {
    const result = await evaluateProductionProviderReadiness(baseInput);
    const original = result.evidence.observabilityRetention;
    if (original === null) throw new Error("Expected retention evidence");
    const unsignedRetention = { ...original, ...mutation } as Record<string, unknown>;
    delete unsignedRetention.retentionFingerprint;
    const substitutedRetention = {
      ...unsignedRetention,
      retentionFingerprint: fingerprintProviderReadinessArtifact(unsignedRetention),
    };
    const unsignedDecision = {
      ...result.decision,
      observabilityRetentionFingerprint: substitutedRetention.retentionFingerprint,
    } as Record<string, unknown>;
    delete unsignedDecision.decisionFingerprint;
    const substitutedDecision = {
      ...unsignedDecision,
      decisionFingerprint: fingerprintProviderReadinessArtifact(unsignedDecision),
    };
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: substitutedDecision,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence:
          substitutedRetention as ProviderObservabilityRetentionEvidence,
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_binding_mismatch" });
  });

  it("rejects a substituted retention fingerprint even without coherent re-signing", async () => {
    const result = await evaluateProductionProviderReadiness(baseInput);
    const original = result.evidence.observabilityRetention;
    if (original === null) throw new Error("Expected retention evidence");
    expect(
      await verifyProductionProviderReadinessDecision({
        decision: result.decision,
        authoritativeInput: baseInput,
        observabilityRetentionEvidence: {
          ...original,
          retentionFingerprint: "0".repeat(64),
        },
      }),
    ).toEqual({ status: "invalid", reason: "readiness_decision_invalid" });
  });

  it.each(["fail-append", "insufficient-capacity"] as const)(
    "fails closed when internal observability retention %s cannot verify",
    async (mode) => {
      const evaluator =
        createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest(
          configuredTransportPolicyAuthority,
          mode,
        );
      const result = await evaluator.evaluate(baseInput);
      expect(result.gateTrace.at(-1)).toMatchObject({
        order: 10,
        gate: "observability-redaction",
        status: "stopped",
        reasonCodes: ["observability_not_ready"],
      });
      expect(result.evidence.observability).toBeNull();
      expect(getProductionProviderReadinessRetentionIssuanceStateForTest(evaluator).count).toBe(0);
      expect(
        await evaluator.verifyDecision({
          decision: result.decision,
          authoritativeInput: baseInput,
          observabilityRetentionEvidence: result.evidence.observabilityRetention,
        }),
      ).toEqual({ status: "valid", reason: null });

      const harness =
        createDisabledProductionProviderAdapterHarnessWithObservabilityRetentionFailureForTest(
          configuredTransportPolicyAuthority,
          mode,
        );
      for (const harnessMode of [
        "observability-redaction-simulation",
        "health-evaluation",
      ] as const) {
        let error: unknown;
        try {
          await harness.run({ mode: harnessMode, readinessInput: baseInput });
        } catch (candidate) {
          error = candidate;
        }
        expect(String(error)).toMatch(
          /Observability retention (?:append failed|snapshot did not verify)/u,
        );
        expect(serializedError(error)).not.toMatch(
          /Bearer|sk_live|\/Users\/|provider client|networkClient/iu,
        );
      }
      const full = await harness.run({
        mode: "full-readiness-evaluation",
        readinessInput: baseInput,
      });
      if (full.mode !== "full-readiness-evaluation") throw new Error("Unexpected harness mode");
      expect(full.fullReadinessEvaluation.evaluation.gateTrace.at(-1)?.gate).toBe(
        "observability-redaction",
      );
      expect(full.fullReadinessEvaluation.decisionVerification).toEqual({
        status: "valid",
        reason: null,
      });

      expect(() =>
        createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: configuredTransportPolicyAuthority,
          observabilitySink: {},
        } as never),
      ).toThrow("configuration is invalid");
      expect(() =>
        createProductionProviderReadinessEvaluator({
          transportPolicyAuthority: configuredTransportPolicyAuthority,
          retentionIssuanceRegistry: {},
        } as never),
      ).toThrow("configuration is invalid");
      const packageFacade = await import("../src/index.js");
      expect(packageFacade).not.toHaveProperty(
        "createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest",
      );
      expect(packageFacade).not.toHaveProperty(
        "createDisabledProductionProviderAdapterHarnessWithObservabilityRetentionFailureForTest",
      );
      expect(packageFacade).not.toHaveProperty(
        "getProductionProviderReadinessObservabilityAppendCountForTest",
      );
      expect(packageFacade).not.toHaveProperty(
        "getProductionProviderReadinessRetentionIssuanceStateForTest",
      );
      expect(packageFacade).not.toHaveProperty(
        "getDisabledProductionProviderHarnessObservabilityAppendCountForTest",
      );
      expect(packageFacade).not.toHaveProperty("BoundedInMemoryProviderObservabilitySink");
    },
  );

  it("rejects forbidden nested poison during harness capture before Authorization", async () => {
    const denied = await inputWithAuthorizationOutcome("denied");
    const poisoned = {
      ...denied,
      credentialReference: {
        ...denied.credentialReference,
        rawSecret: "later-secret-must-not-be-inspected",
      },
      transportPolicy: {
        ...denied.transportPolicy,
        allowedScheme: "http",
        endpointUrl: "https://provider.invalid/live",
      },
      ratePolicy: { ...denied.ratePolicy, requestLimit: 0 },
      costPolicy: { ...denied.costPolicy, maximumInputUnits: 0 },
    } as never;
    for (const mode of ALL_DISABLED_HARNESS_MODES) {
      expect(() => runHarnessMode(mode, poisoned)).toThrow("readiness input is invalid");
    }
  });

  it("maps only a fixed response fixture through the harness and exposes no transport method", async () => {
    const result = await runDisabledProductionProviderAdapterHarness({
      mode: "response-mapping-fixture",
      readinessInput: baseInput,
      fixtureClassification: "successful-response",
      mappingEvidenceId: "mapping-harness-one",
      resultEnvelopeId: "result-harness-one",
      executionAttemptId: "attempt-harness-one",
      startedAt: EVALUATED_AT,
    });
    if (result.mode !== "response-mapping-fixture") throw new Error("Unexpected harness mode");
    expect(result.responseMappingFixture.verification).toEqual({ status: "valid", reason: null });
    expect(result.responseMappingFixture.mapping.outcome.status).toBe("succeeded");
    expect(Object.isFrozen(result)).toBe(true);
    const publicNames = Object.getOwnPropertyNames(configuredHarness);
    expect(publicNames).not.toEqual(
      expect.arrayContaining([
        "execute",
        "send",
        "request",
        "connect",
        "resolveCredential",
        "openSocket",
        "networkClient",
      ]),
    );
    const packageFacade = await import("../src/index.js");
    expect(packageFacade).toHaveProperty("createProductionProviderReadinessEvaluator");
    expect(packageFacade).toHaveProperty("createDisabledProductionProviderAdapterHarness");
    expect(packageFacade).not.toHaveProperty("evaluateProductionProviderReadiness");
    expect(packageFacade).not.toHaveProperty("runDisabledProductionProviderAdapterHarness");
    expect(packageFacade).not.toHaveProperty("verifyProductionProviderReadinessDecision");
    expect(packageFacade).not.toHaveProperty("resolveVerifiedGovernedReasoningAuthority");
    expect(packageFacade).not.toHaveProperty("createProviderRequestPlan");
    expect(packageFacade).not.toHaveProperty("createProviderTransportPlan");
  });

  it.each([
    "successful-response",
    "empty-response",
    "provider-timeout",
    "provider-rate-limit",
    "provider-server-failure",
    "invalid-provider-response",
    "usage-metadata",
    "cost-metadata",
    "credential-rejection",
    "transport-security-failure",
    "oversized-response",
    "redaction-failure",
  ] as const)("maps fixed harness response classification %s", async (fixtureClassification) => {
    const result = await runDisabledProductionProviderAdapterHarness({
      mode: "response-mapping-fixture",
      readinessInput: baseInput,
      fixtureClassification,
      mappingEvidenceId: `mapping-harness-${fixtureClassification}`,
      resultEnvelopeId: `result-harness-${fixtureClassification}`,
      executionAttemptId: `attempt-harness-${fixtureClassification}`,
      startedAt: EVALUATED_AT,
    });
    if (result.mode !== "response-mapping-fixture") throw new Error("Unexpected harness mode");
    expect(result.responseMappingFixture.verification).toEqual({ status: "valid", reason: null });
    expect(result.responseMappingFixture.mappingEvidence.fixtureClassification).toBe(
      fixtureClassification === "usage-metadata" || fixtureClassification === "cost-metadata"
        ? "successful-response"
        : fixtureClassification,
    );
    expect(Object.isFrozen(result.responseMappingFixture.mapping)).toBe(true);
  });

  it("does not invoke harness accessors and has no network, DNS, socket, or TLS dependency", async () => {
    let getterCalls = 0;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "mode", {
      enumerable: true,
      value: "contract-validation",
    });
    Object.defineProperty(accessor, "readinessInput", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return baseInput;
      },
    });
    expect(() => runDisabledProductionProviderAdapterHarness(accessor as never)).toThrow();
    expect(getterCalls).toBe(0);

    for (const mode of [
      "contract-validation",
      "credential-reference-validation",
      "transport-plan-dry-run",
      "rate-and-cost-admission-simulation",
      "circuit-simulation",
    ] as const) {
      await runDisabledProductionProviderAdapterHarness({ mode, readinessInput: baseInput });
    }
    const applicationClosure = await readTypeScriptImportClosure([
      new URL("../src/application/evaluate-production-provider-readiness.ts", import.meta.url),
      new URL(
        "../src/application/disabled-production-provider-adapter-harness.ts",
        import.meta.url,
      ),
    ]);
    expect(applicationClosure.size).toBeGreaterThan(8);
    expect([...applicationClosure.values()].join("\n")).not.toMatch(
      /\bfetch\s*\(|process\.env|openSocket|networkClient|resolveCredential/u,
    );
    const moduleSpecifiers = [...applicationClosure.values()].flatMap(
      extractTypeScriptModuleSpecifiers,
    );
    expect(moduleSpecifiers).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(?:(?:node:)?(?:dgram|dns|http2?|https|net|tls|undici)(?:\/|$)|.*(?:openai|anthropic|provider-sdk|network-sdk))/iu,
        ),
      ]),
    );
  });

  it("extracts every supported TypeScript import form for the dependency closure", () => {
    expect(
      extractTypeScriptModuleSpecifiers(`
        import "node:http";
        import type {
          Socket
        } from "node:net";
        export { request } from "node:https";
        export * from "node:tls";
        const dns = await import("node:dns/promises");
        const http = require("node:http2");
        import legacy = require("node:dgram");
      `),
    ).toEqual([
      "node:http",
      "node:net",
      "node:https",
      "node:tls",
      "node:dns/promises",
      "node:http2",
      "node:dgram",
    ]);
  });
});

type MutableFacadeInput = Omit<
  {
    -readonly [
      Key in keyof EvaluateProductionProviderReadinessInput
    ]: EvaluateProductionProviderReadinessInput[Key];
  },
  "rateCounters"
> & {
  rateCounters: {
    -readonly [
      Key in keyof EvaluateProductionProviderReadinessInput["rateCounters"]
    ]: EvaluateProductionProviderReadinessInput["rateCounters"][Key];
  };
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((currentResolve) => {
    resolve = currentResolve;
  });
  return { promise, resolve };
}

function mutableInputWithDelayedLedger(gate: Promise<void>): MutableFacadeInput {
  const { deliveryLedger, ...canonical } = baseInput;
  const delayedLedger = new Proxy(deliveryLedger, {
    get(target, property, receiver) {
      if (property === "verifyIntegrity") {
        return async () => {
          await gate;
          return target.verifyIntegrity();
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    ...structuredClone(canonical),
    deliveryLedger: delayedLedger,
  } as MutableFacadeInput;
}

function inputWithCountingDeliveryLedger(
  onCall: () => void,
): EvaluateProductionProviderReadinessInput {
  const deliveryLedger = new Proxy(baseInput.deliveryLedger, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        onCall();
        return Reflect.apply(value as (...currentArgs: unknown[]) => unknown, target, args);
      };
    },
  });
  return { ...baseInput, deliveryLedger };
}

function reverseObjectEntries<T extends Readonly<Record<string, unknown>>>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T;
}

async function inputForAdapter(
  adapterDescriptor: EvaluateProductionProviderReadinessInput["adapterDescriptor"],
  providerCapability: EvaluateProductionProviderReadinessInput["providerCapability"],
): Promise<EvaluateProductionProviderReadinessInput> {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: invocation,
  });
  return {
    ...baseInput,
    adapterDescriptor,
    providerCapability,
    authorizationEvidence: createAuthorizationDecisionEvidence(
      baseInput.expectedAuthorizationDecision,
      {
        deliveryAuthority: authority,
        adapter: adapterDescriptor,
        requestedOperation: baseInput.requestedOperation,
        decisionAuthorityReference: baseInput.decisionAuthorityReference,
      },
    ),
  };
}

function withoutCapabilityFingerprint(
  descriptor: EvaluateProductionProviderReadinessInput["providerCapability"],
) {
  const { descriptorFingerprint: _fingerprint, ...input } = descriptor;
  void _fingerprint;
  return input;
}

function withoutPolicyFingerprint(
  policy: EvaluateProductionProviderReadinessInput["transportPolicy"],
) {
  const { policyFingerprint: _fingerprint, ...input } = policy;
  void _fingerprint;
  return input;
}

function withoutReferenceFingerprint(
  reference: EvaluateProductionProviderReadinessInput["credentialReference"],
) {
  const { referenceFingerprint: _fingerprint, ...input } = reference;
  void _fingerprint;
  return input;
}

function withoutAdapterFingerprint(
  descriptor: EvaluateProductionProviderReadinessInput["adapterDescriptor"],
) {
  const {
    adapterFingerprint: _adapterFingerprint,
    providerCapabilityFingerprint: _providerCapabilityFingerprint,
    providerCapabilityId: _providerCapabilityId,
    ...input
  } = descriptor;
  void _adapterFingerprint;
  void _providerCapabilityFingerprint;
  void _providerCapabilityId;
  return input;
}

function runHarnessMode(
  mode: DisabledProductionProviderHarnessMode,
  readinessInput: EvaluateProductionProviderReadinessInput,
) {
  return mode === "response-mapping-fixture"
    ? runDisabledProductionProviderAdapterHarness({
        mode,
        readinessInput,
        fixtureClassification: "successful-response",
        mappingEvidenceId: "mapping-nested-boundary",
        resultEnvelopeId: "result-nested-boundary",
        executionAttemptId: "attempt-nested-boundary",
        startedAt: EVALUATED_AT,
      })
    : runDisabledProductionProviderAdapterHarness({ mode, readinessInput });
}

function thrownOf(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw");
}

function serializedError(error: unknown): string {
  return `${String(error)} ${JSON.stringify(error)}`;
}

async function readTypeScriptImportClosure(entries: readonly URL[]): Promise<Map<string, string>> {
  const closure = new Map<string, string>();
  const pending = [...entries];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || closure.has(current.href)) continue;
    const source = await readFile(current, "utf8");
    closure.set(current.href, source);

    const relativeImports = extractTypeScriptModuleSpecifiers(source).filter((specifier) =>
      specifier.startsWith("."),
    );
    for (const relativeImport of relativeImports) {
      if (!relativeImport) continue;
      pending.push(new URL(relativeImport.replace(/\.js$/u, ".ts"), current));
    }
  }

  return closure;
}

function extractTypeScriptModuleSpecifiers(source: string): string[] {
  const matches: Array<{ index: number; specifier: string }> = [];
  for (const pattern of [
    /\b(?:import|export)\s+(?:(?:type\s+)?[^"'();]*?\bfrom\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) matches.push({ index: match.index, specifier });
    }
  }
  return matches.sort((left, right) => left.index - right.index).map(({ specifier }) => specifier);
}
