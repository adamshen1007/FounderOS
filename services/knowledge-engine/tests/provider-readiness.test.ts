import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AuthorizationDecisionEvidence,
  ObservabilityReadinessEvidence,
  ReasoningInvocationRequest,
} from "@founderos/knowledge-schema";

import { createDeterministicFakeReasoningProvider } from "../src/infrastructure/deterministic-fake-reasoning-provider.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import {
  ProviderReadinessIntegrityError,
  createAuthorizationDecisionEvidence,
  createCredentialReference,
  createPricingReference,
  createProductionProviderAdapterDescriptor,
  createProviderTransportPlan,
  createSecureTransportPolicy,
  deriveProviderHealthEvidence,
  enforceAuthorizationDecision,
  evaluateCostAndBudget,
  evaluateProviderRateAndCapacity,
  fingerprintProviderReadinessArtifact,
  transitionCircuitState,
  verifyAuthorizationDecisionEvidence,
  verifyCircuitState,
  verifyCostAndBudgetDecision,
  verifyCredentialReference,
  verifyPricingReference,
  verifyProductionProviderAdapterDescriptor,
  verifyProviderHealthEvidence,
  verifyProviderRateAndCapacityDecision,
  verifyProviderReadinessArtifactFingerprint,
  verifyProviderTransportPlan,
  verifySecureTransportPolicy,
  verifyObservabilityReadinessEvidence,
  type AuthorizationAuthority,
  type CircuitTransitionInput,
  type CostAndBudgetEvaluationInput,
  type CredentialReferenceExpectation,
  type ObservabilityReadinessExpectation,
  type ProviderHealthDerivationInput,
  type RateAndCapacityEvaluationInput,
  type ResolvedDurableDeliveryAuthorityProjection,
  type SecureTransportPolicyInput,
} from "../src/domain/provider-readiness.js";
import { createInvocation, createReasoningTestRuntime } from "./reasoning-fixtures.js";

const TIME = "2026-07-30T01:00:00.000Z";

let root = "";
let invocation: ReasoningInvocationRequest;
let alternateInvocation: ReasoningInvocationRequest;
let deliveryAuthority: ResolvedDurableDeliveryAuthorityProjection;

beforeAll(async () => {
  const runtime = await createReasoningTestRuntime([]);
  root = runtime.repositoryRoot;
  invocation = createInvocation(runtime);
  alternateInvocation = createInvocation(runtime, { idempotencyKey: "reasoning:key:alternate" });
  const transactions = await runtime.deliveryLedger.listCommittedOriginalDeliveries();
  deliveryAuthority = {
    invocationRequest: invocation,
    transaction: transactions[0]!,
    deliveryRequest: runtime.fixture.context.request,
    envelope: runtime.fixture.result.envelope,
    receipt: runtime.fixture.result.receipt,
  };
});

afterAll(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

const capability = createDeterministicFakeReasoningProvider().providerCapability;

function unsignedAdapterBase() {
  return {
    schemaVersion: "1.0" as const,
    adapterId: "adapter-evaluation-one",
    providerFamilyReference: "provider-family/evaluation",
    requestMappingVersion: "1.0" as const,
    responseMappingVersion: "1.0" as const,
    transportPolicyVersion: "1.0" as const,
    observabilityPolicyVersion: "1.0" as const,
    credentialReferenceClass: "evaluation-fixture-reference" as const,
    state: "dry-run-mapping" as const,
  };
}

function unsignedAdapter(overrides: Partial<ReturnType<typeof unsignedAdapterBase>> = {}) {
  return { ...unsignedAdapterBase(), ...overrides };
}

function adapter(overrides: Partial<ReturnType<typeof unsignedAdapterBase>> = {}) {
  return createProductionProviderAdapterDescriptor(unsignedAdapter(overrides), capability);
}

function authorizationAuthority(currentAdapter = adapter()): AuthorizationAuthority {
  return {
    deliveryAuthority,
    adapter: currentAdapter,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
  };
}

function authorization(
  outcome: AuthorizationDecisionEvidence["outcome"] = "allowed",
  expiresAt = "2026-07-30T02:00:00.000Z",
) {
  return createAuthorizationDecisionEvidence(
    authorizationDecision(outcome, expiresAt),
    authorizationAuthority(),
  );
}

function authorizationDecision(
  outcome: AuthorizationDecisionEvidence["outcome"] = "allowed",
  expiresAt = "2026-07-30T02:00:00.000Z",
) {
  return {
    authorizationDecisionId: "authorization-one",
    decidedAt: TIME,
    expiresAt,
    outcome,
  } as const;
}

const credentialExpectation: CredentialReferenceExpectation = {
  credentialReferenceId: "credential-reference-one",
  providerFamilyReference: "provider-family/evaluation",
  secretStoreClass: "external-secret-store",
  scopeReference: "scope/reasoning-dry-run",
  environmentClass: "evaluation",
  rotationVersion: "rotation-v1",
  availability: "available",
  adapterCredentialReferenceClass: "evaluation-fixture-reference",
  expectedAdapterFingerprint: adapter().adapterFingerprint,
};

function credential() {
  const {
    adapterCredentialReferenceClass: _adapterClass,
    expectedAdapterFingerprint: _expectedAdapterFingerprint,
    ...input
  } = credentialExpectation;
  void _adapterClass;
  void _expectedAdapterFingerprint;
  return createCredentialReference({ schemaVersion: "1.0", ...input });
}

const transportPolicyInput: SecureTransportPolicyInput = {
  schemaVersion: "1.0",
  transportPolicyId: "transport-policy-one",
  providerFamilyReference: "provider-family/evaluation",
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
};

function policy() {
  return createSecureTransportPolicy(transportPolicyInput);
}

const ratePolicy = {
  capacityPolicyVersion: "1.0" as const,
  windowDurationMilliseconds: 60_000,
  requestLimit: 10,
  concurrentLimit: 2,
  maximumQueuedRequests: 3,
  consumerQuotaLimit: 20,
  policyPermitsAdmission: true,
};

const rateCounters = {
  windowStartedAt: TIME,
  requestsInWindow: 1,
  concurrentInFlight: 0,
  queuedRequests: 0,
  consumerQuotaUsed: 1,
  providerCapacityState: "available" as const,
};

function rateInput(
  overrides: Partial<RateAndCapacityEvaluationInput> = {},
): RateAndCapacityEvaluationInput {
  return {
    decisionId: "rate-decision-one",
    invocationRequest: invocation,
    adapter: adapter(),
    policy: ratePolicy,
    counters: rateCounters,
    priorityClass: "normal",
    evaluatedAt: TIME,
    ...overrides,
  };
}

function pricing(availability: "available" | "unavailable" = "available") {
  return createPricingReference({
    schemaVersion: "1.0",
    pricingReferenceId: "pricing-reference-one",
    providerFamilyReference: "provider-family/evaluation",
    pricingVersion: "pricing-v1",
    currencyCode: "USD",
    inputUnitSize: 1_000,
    inputUnitPriceMinorUnits: 2,
    outputUnitSize: 1_000,
    outputUnitPriceMinorUnits: 4,
    availability,
    effectiveAt: TIME,
  });
}

const budgetPolicy = {
  budgetPolicyVersion: "1.0" as const,
  budgetReference: "budget/project-one",
  currencyCode: "USD",
  maximumInputUnits: 20_000,
  maximumOutputUnits: 4_000,
  costCeilingMinorUnits: 100,
  maximumAttemptCount: 1,
  timeoutBudgetMilliseconds: 1_000,
  costCeilingMandatory: true,
  manualReviewRequired: false,
};

function costInput(overrides: Partial<CostAndBudgetEvaluationInput> = {}) {
  return {
    decisionId: "cost-decision-one",
    invocationRequest: invocation,
    providerCapability: capability,
    adapter: adapter(),
    pricingReference: pricing(),
    policy: budgetPolicy,
    evaluatedAt: TIME,
    ...overrides,
  } satisfies CostAndBudgetEvaluationInput;
}

const thresholdPolicy = {
  failureThreshold: 3,
  windowDurationMilliseconds: 60_000,
  openDurationMilliseconds: 30_000,
  halfOpenMaximumProbeCount: 2,
  securityViolationQuarantines: true,
};

function circuitInput(overrides: Partial<CircuitTransitionInput> = {}): CircuitTransitionInput {
  return {
    circuitStateId: "circuit-state-one",
    adapter: adapter(),
    previousState: null,
    thresholdPolicy,
    failureWindow: { windowStartedAt: TIME, failureCounts: [] },
    evaluatedAt: TIME,
    command: "evaluate",
    probeOutcome: "none",
    probesAlreadyUsed: 0,
    ...overrides,
  };
}

function observability(
  currentAdapter = adapter(),
  status: ObservabilityReadinessEvidence["status"] = "ready",
): ProviderHealthDerivationInput["observability"] {
  const logFingerprint = "1".repeat(64);
  const expected = {
    schemaVersion: "1.0",
    readinessEvidenceId: "observability-readiness-one",
    adapterId: currentAdapter.adapterId,
    adapterFingerprint: currentAdapter.adapterFingerprint,
    redactionPolicyVersion: "1.0",
    maximumLogFieldCharacters: 256,
    maximumTraceAttributeCharacters: 128,
    maximumMetricLabelCount: 8,
    structuredLogFingerprint: logFingerprint,
    metricFingerprints: [],
    traceFingerprints: [],
    publicErrorFingerprints: [],
    status,
    reasonCodes: [status === "ready" ? "observability_ready" : "observability_not_ready"],
    evaluatedAt: TIME,
  } as ObservabilityReadinessExpectation;
  const evidence = Object.freeze({
    ...expected,
    readinessFingerprint: fingerprintProviderReadinessArtifact(expected),
  }) as ObservabilityReadinessEvidence;
  return { evidence, expected };
}

function healthInput(): ProviderHealthDerivationInput {
  const currentAdapter = adapter();
  const authAuthority = { ...authorizationAuthority(), adapter: currentAdapter };
  const authEvidence = createAuthorizationDecisionEvidence(
    {
      authorizationDecisionId: "authorization-one",
      decidedAt: TIME,
      expiresAt: "2026-07-30T02:00:00.000Z",
      outcome: "allowed",
    },
    authAuthority,
  );
  const transportPolicy = policy();
  const transportPlan = createProviderTransportPlan({
    transportPlanId: "transport-plan-one",
    adapter: currentAdapter,
    policy: transportPolicy,
  });
  const rateEvaluation = rateInput({ adapter: currentAdapter });
  const rateDecision = evaluateProviderRateAndCapacity(rateEvaluation);
  const costEvaluation = costInput({ adapter: currentAdapter });
  const costDecision = evaluateCostAndBudget(costEvaluation);
  const circuitTransition = circuitInput({ adapter: currentAdapter });
  const circuitState = transitionCircuitState(circuitTransition);
  return {
    healthEvidenceId: "health-evidence-one",
    adapter: currentAdapter,
    invocationRequest: invocation,
    providerCapability: capability,
    authorization: {
      evidence: authEvidence,
      authority: authAuthority,
      expectedDecision: authorizationDecision(),
    },
    credential: { reference: credential(), expected: credentialExpectation },
    transport: {
      plan: transportPlan,
      policy: transportPolicy,
      policyInput: transportPolicyInput,
      expectedTransportPlanId: "transport-plan-one",
    },
    rate: { decision: rateDecision, evaluation: rateEvaluation },
    cost: { decision: costDecision, evaluation: costEvaluation },
    circuit: { state: circuitState, transition: circuitTransition },
    observability: observability(currentAdapter),
    evaluatedAt: TIME,
  };
}

function resign<T extends Record<string, unknown>>(value: T, fingerprintField: string): T {
  const copy = structuredClone(value);
  delete (copy as Record<string, unknown>)[fingerprintField];
  return {
    ...copy,
    [fingerprintField]: createDurableCanonicalJsonSha256Fingerprint(copy),
  } as T;
}

describe("Milestone 14 pure provider-readiness gates", () => {
  it("builds an immutable Adapter and rejects forged or re-signed Capability substitutions", () => {
    const value = adapter();
    expect(Object.isFrozen(value)).toBe(true);
    expect(
      verifyProductionProviderAdapterDescriptor({
        descriptor: value,
        providerCapability: capability,
      }).status,
    ).toBe("valid");
    expect(
      verifyProductionProviderAdapterDescriptor({
        descriptor: { ...value, adapterFingerprint: "0".repeat(64) },
        providerCapability: capability,
      }).status,
    ).toBe("invalid");
    const otherCapability = { ...capability, providerCapabilityId: "substituted-capability" };
    const signedCapability = resign(otherCapability, "descriptorFingerprint");
    expect(
      verifyProductionProviderAdapterDescriptor({
        descriptor: resign(
          {
            ...value,
            providerCapabilityId: signedCapability.providerCapabilityId,
            providerCapabilityFingerprint: signedCapability.descriptorFingerprint,
          },
          "adapterFingerprint",
        ),
        providerCapability: capability,
      }).status,
    ).toBe("invalid");
  });

  it.each(["denied", "review-required", "not-evaluated", "expired", "invalid-evidence"] as const)(
    "fails closed for authorization outcome %s",
    (outcome) => {
      expect(
        enforceAuthorizationDecision({
          evidence: authorization(outcome),
          authority: authorizationAuthority(),
          expectedDecision: authorizationDecision(outcome),
          evaluatedAt: TIME,
        }).status,
      ).toBe("rejected");
    },
  );

  it("enforces exact authorization bindings, chronology, and expiration", () => {
    const allowedEvidence = authorization();
    expect(Object.isFrozen(allowedEvidence)).toBe(true);
    expect(Object.isFrozen(allowedEvidence.reasonCodes)).toBe(true);
    expect(
      enforceAuthorizationDecision({
        evidence: allowedEvidence,
        authority: authorizationAuthority(),
        expectedDecision: authorizationDecision(),
        evaluatedAt: TIME,
      }).status,
    ).toBe("allowed");
    expect(
      enforceAuthorizationDecision({
        evidence: authorization("allowed", "2026-07-30T01:00:00.001Z"),
        authority: authorizationAuthority(),
        expectedDecision: authorizationDecision("allowed", "2026-07-30T01:00:00.001Z"),
        evaluatedAt: "2026-07-30T01:00:00.001Z",
      }).status,
    ).toBe("rejected");
    expect(allowedEvidence.subjectReference).toBe(
      deliveryAuthority.deliveryRequest.policyInput.subjectReference,
    );
    const substitutedOutcome = resign(
      {
        ...authorization(),
        outcome: "denied" as const,
        reasonCodes: ["authorization_denied" as const],
      },
      "decisionFingerprint",
    );
    expect(
      verifyAuthorizationDecisionEvidence({
        evidence: substitutedOutcome,
        authority: authorizationAuthority(),
        expectedDecision: authorizationDecision(),
      }).status,
    ).toBe("invalid");
    const directBindingSubstitutions: readonly Record<string, unknown>[] = [
      { subjectReference: "subject/substituted" },
      { consumerId: "consumer-substituted", consumerDescriptorFingerprint: "1".repeat(64) },
      {
        invocationRequestId: "invocation-substituted",
        invocationRequestFingerprint: "2".repeat(64),
      },
      {
        deliveryTransactionId: "delivery-transaction-substituted",
        deliveryTransactionFingerprint: "3".repeat(64),
      },
      { contextPackageId: "context-substituted", contextPackageFingerprint: "4".repeat(64) },
      { adapterId: "adapter-substituted", adapterFingerprint: "5".repeat(64) },
      { requestedOperation: "validate-provider-adapter" },
    ];
    for (const substitution of directBindingSubstitutions) {
      const substituted = resign({ ...allowedEvidence, ...substitution }, "decisionFingerprint");
      expect(
        verifyAuthorizationDecisionEvidence({
          evidence: substituted,
          authority: authorizationAuthority(),
          expectedDecision: authorizationDecision(),
        }).status,
      ).toBe("invalid");
    }
    const baseAuthority = authorizationAuthority();
    const deliveryProjectionSubstitutions: readonly AuthorizationAuthority[] = [
      {
        ...baseAuthority,
        deliveryAuthority: {
          ...baseAuthority.deliveryAuthority,
          deliveryRequest: {
            ...baseAuthority.deliveryAuthority.deliveryRequest,
            deliveryRequestId: "delivery-request-substituted",
          },
        },
      },
      {
        ...baseAuthority,
        deliveryAuthority: {
          ...baseAuthority.deliveryAuthority,
          envelope: {
            ...baseAuthority.deliveryAuthority.envelope,
            deliveryEnvelopeId: "delivery-envelope-substituted",
          },
        },
      },
      {
        ...baseAuthority,
        deliveryAuthority: {
          ...baseAuthority.deliveryAuthority,
          receipt: {
            ...baseAuthority.deliveryAuthority.receipt,
            receiptId: "delivery-receipt-substituted",
          },
        },
      },
    ];
    for (const substitutedAuthority of deliveryProjectionSubstitutions) {
      expect(
        verifyAuthorizationDecisionEvidence({
          evidence: allowedEvidence,
          authority: substitutedAuthority,
          expectedDecision: authorizationDecision(),
        }).status,
      ).toBe("invalid");
    }
    expect(() =>
      createAuthorizationDecisionEvidence(
        {
          authorizationDecisionId: "authorization-bad-time",
          decidedAt: "2026-07-30T02:00:00.000Z",
          expiresAt: TIME,
          outcome: "allowed",
        },
        authorizationAuthority(),
      ),
    ).toThrow(ProviderReadinessIntegrityError);
  });

  it("validates Credential references exactly and rejects secret-bearing material", () => {
    const value = credential();
    expect(Object.isFrozen(value)).toBe(true);
    expect(
      verifyCredentialReference({
        reference: value,
        adapter: adapter(),
        expected: credentialExpectation,
      }).status,
    ).toBe("valid");
    for (const expected of [
      { ...credentialExpectation, availability: "expired" as const },
      { ...credentialExpectation, providerFamilyReference: "provider-family/other" },
      { ...credentialExpectation, scopeReference: "scope/other" },
      { ...credentialExpectation, rotationVersion: "rotation-v2" },
      {
        ...credentialExpectation,
        adapterCredentialReferenceClass: "unavailable-reference" as const,
      },
    ]) {
      expect(
        verifyCredentialReference({ reference: value, adapter: adapter(), expected }).status,
      ).toBe("invalid");
    }
    for (const [field, unsafe] of [
      ["apiKey", "sk_live_deadbeef"],
      ["token", "Bearer abc"],
      ["authorizationHeader", "Bearer abc"],
      ["environmentDump", "TOKEN=abc"],
      ["credentialPath", "/tmp/provider-key"],
    ] as const) {
      expect(() => createCredentialReference({ ...value, [field]: unsafe } as never)).toThrow();
    }
  });

  it("constructs only an HTTPS allowlisted deterministic Transport Plan and verifies all controls", () => {
    const currentAdapter = adapter();
    const currentPolicy = policy();
    const plan = createProviderTransportPlan({
      transportPlanId: "transport-plan-one",
      adapter: currentAdapter,
      policy: currentPolicy,
    });
    expect(plan.hostname).toBe("api.provider.dev");
    expect(plan.port).toBe(443);
    expect(Object.isFrozen(currentPolicy)).toBe(true);
    expect(Object.isFrozen(currentPolicy.allowedHostnames)).toBe(true);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(
      verifySecureTransportPolicy({
        policy: currentPolicy,
        adapter: currentAdapter,
        expectedPolicy: transportPolicyInput,
      }).status,
    ).toBe("valid");
    expect(
      verifyProviderTransportPlan({
        plan,
        adapter: currentAdapter,
        policy: currentPolicy,
        expectedTransportPlanId: "transport-plan-one",
      }).status,
    ).toBe("valid");
    const alteredControls = [
      { allowedScheme: "http" },
      { allowedHostnames: ["localhost"] },
      { allowedHostnames: ["127.0.0.1"] },
      { allowedHostnames: ["169.254.169.254"] },
      { allowedHostnames: ["api.provider.test"] },
      { allowedHostnames: ["api.provider.example"] },
      { allowedHostnames: ["api.provider.invalid"] },
      { allowedHostnames: ["api.provider.localhost"] },
      { allowedHostnames: ["api.provider.local"] },
      { allowedHostnames: ["example.com"] },
      { allowedHostnames: ["api.example.com"] },
      { allowedHostnames: ["example.net"] },
      { allowedHostnames: ["api.example.net"] },
      { allowedHostnames: ["example.org"] },
      { allowedHostnames: ["api.example.org"] },
      { allowedHostnames: ["api.provider.onion"] },
      { allowedHostnames: ["api.provider.alt"] },
      { allowedHostnames: ["api.provider.arpa"] },
      { allowedHostnames: ["home.arpa"] },
      { allowedHostnames: ["api.home.arpa"] },
      { allowedHostnames: ["metadata.google.internal"] },
      { allowedHostnames: ["metadata.aws.internal"] },
      { allowedHostnames: ["instance-data.ec2.internal"] },
      { allowedHostnames: ["api.provider.internal"] },
      { allowedPorts: [0] },
      { redirectPolicy: "follow" },
      { tlsRequired: false },
      { certificateValidationPolicy: "disabled" },
      { connectionTimeoutMilliseconds: 6_000 },
      { maximumRequestBytes: 0 },
      { maximumResponseBytes: 0 },
      { retryTransportPolicy: "unbounded-retry" },
    ];
    for (const altered of alteredControls) {
      expect(() =>
        createSecureTransportPolicy({ ...transportPolicyInput, ...altered } as never),
      ).toThrow();
    }
    expect(() =>
      createProviderTransportPlan({
        transportPlanId: "transport-plan-url",
        adapter: currentAdapter,
        policy: currentPolicy,
        endpointUrl: "https://api.provider.dev",
      } as never),
    ).toThrow();
  });

  it.each([
    [{ counters: { ...rateCounters, requestsInWindow: 10 } }, "rate-limited"],
    [{ counters: { ...rateCounters, concurrentInFlight: 2 } }, "capacity-exhausted"],
    [{ counters: { ...rateCounters, concurrentInFlight: 2, queuedRequests: 3 } }, "queue-full"],
    [{ counters: { ...rateCounters, consumerQuotaUsed: 20 } }, "policy-denied"],
    [
      { counters: { ...rateCounters, providerCapacityState: "unavailable" } },
      "provider-unavailable",
    ],
    [{ policy: { ...ratePolicy, policyPermitsAdmission: false } }, "policy-denied"],
  ] as const)("derives deterministic Rate and Capacity outcome %s", (overrides, outcome) => {
    const input = rateInput(overrides as Partial<RateAndCapacityEvaluationInput>);
    const decision = evaluateProviderRateAndCapacity(input);
    expect(decision.outcome).toBe(outcome);
    expect(decision.reasonCodes).toEqual([...decision.reasonCodes].sort());
    expect(verifyProviderRateAndCapacityDecision({ decision, evaluation: input }).status).toBe(
      "valid",
    );
  });

  it("handles the exact Rate window boundary, retry-after, tampering, and defensive copies", () => {
    const boundary = rateInput({ evaluatedAt: "2026-07-30T01:01:00.000Z" });
    const decision = evaluateProviderRateAndCapacity(boundary);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasonCodes)).toBe(true);
    expect(decision.requestsInWindow).toBe(0);
    expect(decision.windowStartedAt).toBe(boundary.evaluatedAt);
    const limited = evaluateProviderRateAndCapacity(
      rateInput({ counters: { ...rateCounters, requestsInWindow: 10 } }),
    );
    expect(limited.retryAfterMilliseconds).toBe(60_000);
    expect(
      verifyProviderRateAndCapacityDecision({
        decision: resign({ ...limited, requestsInWindow: 9 }, "decisionFingerprint"),
        evaluation: rateInput({ counters: { ...rateCounters, requestsInWindow: 10 } }),
      }).status,
    ).toBe("invalid");
    const mutable = { ...rateCounters };
    const captured = evaluateProviderRateAndCapacity(rateInput({ counters: mutable }));
    mutable.requestsInWindow = 10;
    expect(captured.requestsInWindow).toBe(1);
  });

  it.each([
    [{}, "within-budget"],
    [{ policy: { ...budgetPolicy, maximumInputUnits: 1 } }, "input-budget-exceeded"],
    [{ policy: { ...budgetPolicy, maximumOutputUnits: 1 } }, "output-budget-exceeded"],
    [{ policy: { ...budgetPolicy, costCeilingMinorUnits: 1 } }, "cost-ceiling-exceeded"],
    [{ pricingReference: pricing("unavailable") }, "pricing-unavailable"],
    [{ policy: { ...budgetPolicy, manualReviewRequired: true } }, "manual-review-required"],
    [{ policy: { ...budgetPolicy, currencyCode: "EUR" } }, "invalid-budget-evidence"],
    [{ policy: { ...budgetPolicy, maximumAttemptCount: 0 } }, "invalid-budget-evidence"],
  ] as const)("derives deterministic Cost outcome %s", (overrides, outcome) => {
    const input = costInput(overrides as Partial<CostAndBudgetEvaluationInput>);
    const decision = evaluateCostAndBudget(input);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(decision.outcome).toBe(outcome);
    expect(verifyCostAndBudgetDecision({ decision, evaluation: input }).status).toBe("valid");
  });

  it("uses integer ceiling arithmetic and fails closed on overflow and authoritative substitution", () => {
    const { pricingFingerprint: _pricingFingerprint, ...unsignedPricing } = pricing();
    void _pricingFingerprint;
    const roundedPricingInput = {
      ...unsignedPricing,
      pricingReferenceId: "pricing-rounding-one",
      inputUnitSize: 3,
      inputUnitPriceMinorUnits: 2,
      outputUnitSize: 3,
      outputUnitPriceMinorUnits: 2,
    };
    const roundedPricing = createPricingReference(roundedPricingInput);
    const input = costInput({ pricingReference: roundedPricing });
    const decision = evaluateCostAndBudget(input);
    const expected =
      (Math.ceil(decision.estimatedInputUnits / 3) + Math.ceil(decision.estimatedOutputUnits / 3)) *
      2;
    expect(decision.estimatedMaximumCostMinorUnits).toBe(expected);
    expect(Object.isFrozen(roundedPricing)).toBe(true);
    expect(
      verifyPricingReference({ pricingReference: roundedPricing, expected: roundedPricingInput })
        .status,
    ).toBe("valid");
    expect(() =>
      evaluateCostAndBudget(
        costInput({
          pricingReference: createPricingReference({
            ...unsignedPricing,
            pricingReferenceId: "pricing-overflow-one",
            inputUnitSize: 1,
            inputUnitPriceMinorUnits: Number.MAX_SAFE_INTEGER,
          }),
        }),
      ),
    ).toThrow(ProviderReadinessIntegrityError);
    expect(
      verifyPricingReference({
        pricingReference: pricing(),
        expected: { ...pricing(), pricingVersion: "pricing-v2" },
      }).status,
    ).toBe("invalid");
  });

  it("derives every Circuit state with deterministic valid transitions", () => {
    const closed = transitionCircuitState(circuitInput());
    expect(Object.isFrozen(closed)).toBe(true);
    expect(Object.isFrozen(closed.failureWindowEvidence)).toBe(true);
    const openInput = circuitInput({
      previousState: closed,
      evaluatedAt: "2026-07-30T01:00:10.000Z",
      failureWindow: {
        windowStartedAt: TIME,
        failureCounts: [{ category: "timeout", count: 3 }],
      },
    });
    const open = transitionCircuitState(openInput);
    const halfOpenInput = circuitInput({
      previousState: open,
      evaluatedAt: open.nextEvaluationAt!,
      failureWindow: { windowStartedAt: TIME, failureCounts: [] },
    });
    const halfOpen = transitionCircuitState(halfOpenInput);
    const recovered = transitionCircuitState(
      circuitInput({
        previousState: halfOpen,
        evaluatedAt: "2026-07-30T01:01:00.000Z",
        probeOutcome: "succeeded",
        probesAlreadyUsed: 1,
      }),
    );
    const disabled = transitionCircuitState(
      circuitInput({ previousState: closed, command: "disable" }),
    );
    const quarantined = transitionCircuitState(
      circuitInput({
        previousState: closed,
        failureWindow: {
          windowStartedAt: TIME,
          failureCounts: [{ category: "security-policy-violation", count: 1 }],
        },
      }),
    );
    expect([closed.state, open.state, halfOpen.state, disabled.state, quarantined.state]).toEqual([
      "closed",
      "open",
      "half-open",
      "disabled",
      "quarantined",
    ]);
    expect(recovered.state).toBe("closed");
    expect(halfOpen.probeAllowance.maximumProbeCount).toBe(2);
    expect(halfOpen.probeAllowance.dryRunProbePermitted).toBe(true);
    expect(verifyCircuitState({ state: open, transition: openInput }).status).toBe("valid");
    expect(
      verifyCircuitState({
        state: resign(
          { ...open, state: "closed", openedAt: null, nextEvaluationAt: null },
          "stateFingerprint",
        ),
        transition: openInput,
      }).status,
    ).toBe("invalid");
  });

  it("rejects invalid Circuit chronology and enforces bounded half-open probes", () => {
    const closed = transitionCircuitState(circuitInput());
    expect(() =>
      transitionCircuitState(
        circuitInput({
          previousState: closed,
          evaluatedAt: "2026-07-30T00:59:59.999Z",
        }),
      ),
    ).toThrow(ProviderReadinessIntegrityError);
    const open = transitionCircuitState(
      circuitInput({
        previousState: closed,
        failureWindow: {
          windowStartedAt: TIME,
          failureCounts: [{ category: "timeout", count: 3 }],
        },
      }),
    );
    const disabled = transitionCircuitState(
      circuitInput({
        previousState: closed,
        evaluatedAt: "2026-07-30T01:00:01.000Z",
        command: "disable",
      }),
    );
    for (const impossible of [
      circuitInput({
        previousState: closed,
        evaluatedAt: "2026-07-30T01:00:01.000Z",
        probeOutcome: "succeeded",
      }),
      circuitInput({
        previousState: open,
        evaluatedAt: "2026-07-30T01:00:01.000Z",
        probesAlreadyUsed: 1,
      }),
      circuitInput({
        previousState: disabled,
        evaluatedAt: "2026-07-30T01:00:02.000Z",
        probeOutcome: "failed",
        probesAlreadyUsed: 1,
      }),
    ]) {
      expect(() => transitionCircuitState(impossible)).toThrow(ProviderReadinessIntegrityError);
    }
    const halfOpen = transitionCircuitState(
      circuitInput({ previousState: open, evaluatedAt: open.nextEvaluationAt! }),
    );
    const oneProbeConsumed = transitionCircuitState(
      circuitInput({
        previousState: halfOpen,
        evaluatedAt: "2026-07-30T01:00:31.000Z",
        probesAlreadyUsed: 1,
      }),
    );
    expect(oneProbeConsumed.probeAllowance.remainingProbeCount).toBe(1);
    expect(() =>
      transitionCircuitState(
        circuitInput({
          previousState: oneProbeConsumed,
          evaluatedAt: "2026-07-30T01:00:32.000Z",
          probesAlreadyUsed: 0,
        }),
      ),
    ).toThrow(ProviderReadinessIntegrityError);
    const reset = transitionCircuitState(
      circuitInput({
        previousState: oneProbeConsumed,
        evaluatedAt: "2026-07-30T01:00:32.000Z",
        command: "reset",
      }),
    );
    expect(reset.state).toBe("closed");
    expect(reset.probeAllowance.maximumProbeCount).toBe(0);
    const quarantined = transitionCircuitState(
      circuitInput({
        failureWindow: {
          windowStartedAt: TIME,
          failureCounts: [{ category: "security-policy-violation", count: 1 }],
        },
      }),
    );
    expect(
      transitionCircuitState(
        circuitInput({
          previousState: disabled,
          evaluatedAt: "2026-07-30T01:00:03.000Z",
          command: "reset",
        }),
      ).state,
    ).toBe("disabled");
    expect(
      transitionCircuitState(
        circuitInput({
          previousState: quarantined,
          evaluatedAt: "2026-07-30T01:00:03.000Z",
          command: "reset",
        }),
      ).state,
    ).toBe("quarantined");
    expect(() =>
      transitionCircuitState(
        circuitInput({
          previousState: halfOpen,
          evaluatedAt: "2026-07-30T01:00:31.000Z",
          probesAlreadyUsed: 3,
        }),
      ),
    ).toThrow(ProviderReadinessIntegrityError);
  });

  it("derives immutable Health states and rejects re-signed substitutions", () => {
    const input = healthInput();
    const healthy = deriveProviderHealthEvidence(input);
    expect(verifyObservabilityReadinessEvidence(input.observability).status).toBe("valid");
    expect(healthy.healthState).toBe("healthy");
    expect(Object.isFrozen(healthy)).toBe(true);
    expect(verifyProviderHealthEvidence({ evidence: healthy, derivation: input }).status).toBe(
      "valid",
    );

    const unavailableInput = healthInput();
    const unavailableRate = evaluateProviderRateAndCapacity(
      rateInput({
        adapter: unavailableInput.adapter,
        counters: { ...rateCounters, providerCapacityState: "unavailable" },
      }),
    );
    const unavailableDerivation = {
      ...unavailableInput,
      rate: {
        decision: unavailableRate,
        evaluation: rateInput({
          adapter: unavailableInput.adapter,
          counters: { ...rateCounters, providerCapacityState: "unavailable" },
        }),
      },
    } satisfies ProviderHealthDerivationInput;
    expect(deriveProviderHealthEvidence(unavailableDerivation).healthState).toBe("unavailable");

    const degradedInput = healthInput();
    const degradedObservability = observability(degradedInput.adapter, "not-ready");
    expect(
      deriveProviderHealthEvidence({
        ...degradedInput,
        observability: degradedObservability,
      }).healthState,
    ).toBe("degraded");

    const substitutedObservability = resign(
      {
        ...degradedInput.observability.evidence,
        status: "not-ready" as const,
        reasonCodes: ["observability_not_ready" as const],
      },
      "readinessFingerprint",
    );
    expect(() =>
      deriveProviderHealthEvidence({
        ...degradedInput,
        observability: {
          ...degradedInput.observability,
          evidence: substitutedObservability,
        },
      }),
    ).toThrow(ProviderReadinessIntegrityError);

    const unknownInput = healthInput();
    const unknownDecision = authorizationDecision("not-evaluated");
    const unknownAuthorization = createAuthorizationDecisionEvidence(
      unknownDecision,
      unknownInput.authorization.authority,
    );
    expect(
      deriveProviderHealthEvidence({
        ...unknownInput,
        authorization: {
          ...unknownInput.authorization,
          evidence: unknownAuthorization,
          expectedDecision: unknownDecision,
        },
      }).healthState,
    ).toBe("unknown");

    for (const [command, expectedState, failures] of [
      ["disable", "disabled", []],
      ["evaluate", "quarantined", [{ category: "security-policy-violation", count: 1 }]],
    ] as const) {
      const containedInput = healthInput();
      const transition = circuitInput({
        adapter: containedInput.adapter,
        previousState: containedInput.circuit.state,
        command,
        failureWindow: { windowStartedAt: TIME, failureCounts: failures },
      });
      const containedState = transitionCircuitState(transition);
      expect(
        deriveProviderHealthEvidence({
          ...containedInput,
          circuit: { state: containedState, transition },
        }).healthState,
      ).toBe(expectedState);
    }

    const tampered = resign(
      { ...healthy, healthState: "degraded", reasonCodes: ["degraded"] },
      "healthFingerprint",
    );
    expect(verifyProviderHealthEvidence({ evidence: tampered, derivation: input }).status).toBe(
      "invalid",
    );
  });

  it("rejects mixed Adapter and Invocation authorities across every Health dependency", () => {
    const base = healthInput();
    const otherAdapter = adapter({ adapterId: "adapter-evaluation-two" });
    const mixedAuthorizationAuthority = authorizationAuthority(otherAdapter);
    const mixedAuthorization = {
      evidence: createAuthorizationDecisionEvidence(
        authorizationDecision(),
        mixedAuthorizationAuthority,
      ),
      authority: mixedAuthorizationAuthority,
      expectedDecision: authorizationDecision(),
    };
    const mixedCredentialExpectation = {
      ...credentialExpectation,
      expectedAdapterFingerprint: otherAdapter.adapterFingerprint,
    };
    expect(
      verifyCredentialReference({
        reference: credential(),
        adapter: otherAdapter,
        expected: mixedCredentialExpectation,
      }).status,
    ).toBe("valid");
    const mixedTransportPlan = createProviderTransportPlan({
      transportPlanId: "transport-plan-two",
      adapter: otherAdapter,
      policy: base.transport.policy,
    });
    const mixedRateEvaluation = rateInput({ adapter: otherAdapter });
    const mixedCostEvaluation = costInput({ adapter: otherAdapter });
    const mixedCircuitTransition = circuitInput({ adapter: otherAdapter });
    const mixedInvocationRateEvaluation = rateInput({ invocationRequest: alternateInvocation });
    const mixedInvocationCostEvaluation = costInput({ invocationRequest: alternateInvocation });
    const mixedInputs: readonly ProviderHealthDerivationInput[] = [
      { ...base, authorization: mixedAuthorization },
      {
        ...base,
        credential: { reference: credential(), expected: mixedCredentialExpectation },
      },
      {
        ...base,
        transport: {
          ...base.transport,
          plan: mixedTransportPlan,
          expectedTransportPlanId: "transport-plan-two",
        },
      },
      {
        ...base,
        rate: {
          evaluation: mixedRateEvaluation,
          decision: evaluateProviderRateAndCapacity(mixedRateEvaluation),
        },
      },
      {
        ...base,
        cost: {
          evaluation: mixedCostEvaluation,
          decision: evaluateCostAndBudget(mixedCostEvaluation),
        },
      },
      {
        ...base,
        circuit: {
          transition: mixedCircuitTransition,
          state: transitionCircuitState(mixedCircuitTransition),
        },
      },
      { ...base, observability: observability(otherAdapter) },
      {
        ...base,
        rate: {
          evaluation: mixedInvocationRateEvaluation,
          decision: evaluateProviderRateAndCapacity(mixedInvocationRateEvaluation),
        },
      },
      {
        ...base,
        cost: {
          evaluation: mixedInvocationCostEvaluation,
          decision: evaluateCostAndBudget(mixedInvocationCostEvaluation),
        },
      },
    ];
    for (const mixed of mixedInputs) {
      expect(() => deriveProviderHealthEvidence(mixed)).toThrow(ProviderReadinessIntegrityError);
    }
  });

  it("rejects accessor-backed top-level inputs without invoking accessors", () => {
    let reads = 0;
    const unsafe = Object.defineProperty({ ...unsignedAdapter() }, "adapterId", {
      enumerable: true,
      get() {
        reads += 1;
        return "adapter-evaluation-one";
      },
    });
    expect(() => createProductionProviderAdapterDescriptor(unsafe as never, capability)).toThrow(
      ProviderReadinessIntegrityError,
    );
    expect(reads).toBe(0);
  });

  it("provides strict generic fingerprint verification without treating it as semantic authority", () => {
    const value = policy();
    expect(
      verifyProviderReadinessArtifactFingerprint("secure-transport-policy", value).status,
    ).toBe("valid");
    expect(
      verifyProviderReadinessArtifactFingerprint("secure-transport-policy", {
        ...value,
        policyFingerprint: "0".repeat(64),
      }).status,
    ).toBe("invalid");
  });

  it("contains no DNS, socket, HTTP, TLS client, environment, random, or secret-resolution dependency", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("../src/domain/provider-readiness.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toMatch(
      /node:(?:dns|net|http|https|tls)|fetch\s*\(|process\.env|Math\.random|resolveSecret|readSecret/u,
    );
  });
});
