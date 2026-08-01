import {
  IsoTemporalSchema,
  ProductionProviderAdapterDescriptorSchema,
  ProviderResponseFixtureClassificationSchema,
  ProviderReadinessIdentifierSchema,
  ReasoningInvocationRequestSchema,
  findDurableCanonicalJsonIssue,
  type DurableContextDeliveryLedger,
  type ObservabilityReadinessEvidence,
  type ProviderResponseMappingEvidence,
} from "@founderos/knowledge-schema";

import {
  createProviderRequestPlan,
  mapProviderResponseFixture,
  verifyProviderObservabilityBundle,
  verifyProviderRequestPlan,
  verifyProviderResponseFixtureMapping,
  type ProviderObservabilityBundleInput,
  type ProviderRequestPlanConstructionInput,
  type ProviderResponseFixtureClassification,
  type ProviderResponseFixtureMapping,
  type ProviderResponseFixtureMappingInput,
} from "../domain/provider-mapping-observability.js";
import {
  createProviderTransportPlan,
  deriveProviderHealthEvidence,
  enforceAuthorizationDecision,
  evaluateCostAndBudget,
  evaluateProviderRateAndCapacity,
  transitionCircuitState,
  verifyCircuitState,
  verifyCostAndBudgetDecision,
  verifyCredentialReference,
  verifyObservabilityReadinessEvidence,
  verifyProductionProviderAdapterDescriptor,
  verifyProviderHealthEvidence,
  verifyProviderRateAndCapacityDecision,
  verifyProviderTransportPlan,
  verifySecureTransportPolicy,
  verifyInvocationTransportTimeoutCompatibility,
  type AuthorizationAuthority,
  type CircuitTransitionInput,
  type CredentialReferenceExpectation,
  type SecureTransportPolicyInput,
} from "../domain/provider-readiness.js";
import {
  matchReasoningProviderCapabilities,
  verifyReasoningProviderCompatibilityResult,
} from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import {
  createProductionProviderReadinessEvaluator,
  createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest,
  getProductionProviderReadinessObservabilityAppendCountForTest,
  type EvaluateProductionProviderReadinessInput,
  type ProductionProviderReadinessEvaluation,
  type ProductionProviderReadinessEvaluator,
} from "./evaluate-production-provider-readiness.js";
import {
  captureExactOwnEnumerableDataDescriptors,
  findProhibitedProductionProviderReadinessInputMaterial,
} from "./production-provider-readiness-input-safety.js";
import {
  captureProductionProviderTransportPolicyAuthority,
  resolveExpectedProductionProviderTransportPolicy,
  type ProductionProviderTransportPolicyAuthority,
} from "./production-provider-transport-policy-authority.js";
import {
  createAndVerifyRetainedProviderObservabilityBundle,
  type ObservabilityRetentionMode,
} from "./retain-provider-observability-bundle.js";
import { resolveVerifiedGovernedReasoningAuthority } from "./resolve-verified-governed-reasoning-authority.js";

export type DisabledProductionProviderHarnessMode =
  | "contract-validation"
  | "authorization-validation"
  | "credential-reference-validation"
  | "transport-plan-dry-run"
  | "request-mapping-dry-run"
  | "response-mapping-fixture"
  | "rate-and-cost-admission-simulation"
  | "circuit-simulation"
  | "health-evaluation"
  | "observability-redaction-simulation"
  | "full-readiness-evaluation";

const APPROVED_MODES: readonly DisabledProductionProviderHarnessMode[] = [
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
];

export type DisabledProductionProviderHarnessInput =
  | Readonly<{
      mode: Exclude<DisabledProductionProviderHarnessMode, "response-mapping-fixture">;
      readinessInput: EvaluateProductionProviderReadinessInput;
    }>
  | Readonly<{
      mode: "response-mapping-fixture";
      readinessInput: EvaluateProductionProviderReadinessInput;
      fixtureClassification: ProviderResponseFixtureClassification;
      mappingEvidenceId: string;
      resultEnvelopeId: string;
      executionAttemptId: string;
      startedAt: string;
    }>;

type Verification = Readonly<{ status: "valid" | "invalid"; reason: string | null }>;

export type DisabledProductionProviderHarnessResult =
  | Readonly<{ mode: "contract-validation"; contractValidation: unknown }>
  | Readonly<{ mode: "authorization-validation"; authorizationValidation: unknown }>
  | Readonly<{ mode: "credential-reference-validation"; credentialValidation: unknown }>
  | Readonly<{ mode: "transport-plan-dry-run"; transportDryRun: unknown }>
  | Readonly<{ mode: "request-mapping-dry-run"; requestMappingDryRun: unknown }>
  | Readonly<{
      mode: "response-mapping-fixture";
      responseMappingFixture: Readonly<{
        mapping: ProviderResponseFixtureMapping;
        mappingEvidence: ProviderResponseMappingEvidence;
        verification: Verification;
      }>;
    }>
  | Readonly<{ mode: "rate-and-cost-admission-simulation"; admissionSimulation: unknown }>
  | Readonly<{ mode: "circuit-simulation"; circuitSimulation: unknown }>
  | Readonly<{ mode: "health-evaluation"; healthEvaluation: unknown }>
  | Readonly<{
      mode: "observability-redaction-simulation";
      observabilitySimulation: unknown;
    }>
  | Readonly<{
      mode: "full-readiness-evaluation";
      fullReadinessEvaluation: Readonly<{
        evaluation: ProductionProviderReadinessEvaluation;
        decisionVerification: Verification;
      }>;
    }>;

const READINESS_KEYS = [
  "schemaVersion",
  "readinessDecisionId",
  "requestPlanId",
  "transportPlanId",
  "healthEvidenceId",
  "observabilityReadinessEvidenceId",
  "evaluatedAt",
  "startedAt",
  "deliveryLedger",
  "deliveryIdentity",
  "invocationRequest",
  "authorizationEvidence",
  "expectedAuthorizationDecision",
  "requestedOperation",
  "decisionAuthorityReference",
  "adapterDescriptor",
  "credentialReference",
  "providerCapability",
  "transportPolicy",
  "ratePolicy",
  "rateCounters",
  "priorityClass",
  "pricingReference",
  "costPolicy",
  "circuitStateId",
  "previousCircuitState",
  "circuitThresholdPolicy",
  "circuitFailureWindow",
  "circuitCommand",
  "circuitProbeOutcome",
  "circuitProbesAlreadyUsed",
  "observabilityPolicy",
] as const;

type CapturedReadinessInput = Omit<EvaluateProductionProviderReadinessInput, "deliveryLedger"> & {
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly transportPolicyAuthority: ProductionProviderTransportPolicyAuthority;
};

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function withoutFingerprint<T extends Record<string, unknown>>(
  value: T,
  fingerprintField: keyof T,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== fingerprintField));
}

function captureReadinessInput(
  raw: unknown,
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
): CapturedReadinessInput {
  const descriptors = captureExactOwnEnumerableDataDescriptors(raw, READINESS_KEYS);
  if (descriptors === null) {
    throw new TypeError("Disabled provider harness readiness input is invalid");
  }
  for (const key of READINESS_KEYS) {
    const descriptor = descriptors[key];
    if (key !== "deliveryLedger" && findDurableCanonicalJsonIssue(descriptor.value) !== null) {
      throw new TypeError("Disabled provider harness readiness input is invalid");
    }
  }
  if (
    findProhibitedProductionProviderReadinessInputMaterial(
      READINESS_KEYS.filter((key) => key !== "deliveryLedger").map((key) => [
        key,
        descriptors[key]!.value,
      ]),
    ) !== null
  ) {
    throw new TypeError("Disabled provider harness readiness input is invalid");
  }
  if (
    descriptors.schemaVersion!.value !== "1.0" ||
    !ProviderReadinessIdentifierSchema.safeParse(descriptors.readinessDecisionId!.value).success ||
    !ProductionProviderAdapterDescriptorSchema.safeParse(descriptors.adapterDescriptor!.value)
      .success
  ) {
    throw new TypeError("Disabled provider harness readiness contract is invalid");
  }
  const evaluatedAt = IsoTemporalSchema.safeParse(descriptors.evaluatedAt!.value);
  const startedAt = IsoTemporalSchema.safeParse(descriptors.startedAt!.value);
  const invocation = ReasoningInvocationRequestSchema.safeParse(
    descriptors.invocationRequest!.value,
  );
  if (
    !evaluatedAt.success ||
    !startedAt.success ||
    !invocation.success ||
    Date.parse(evaluatedAt.data) < Date.parse(startedAt.data) ||
    Date.parse(evaluatedAt.data) < Date.parse(invocation.data.requestedAt)
  ) {
    throw new TypeError("Disabled provider harness readiness contract is invalid");
  }
  const canonical = Object.fromEntries(
    READINESS_KEYS.filter((key) => key !== "deliveryLedger").map((key) => [
      key,
      descriptors[key]!.value,
    ]),
  );
  const captured = immutableCopy(canonical) as Omit<
    CapturedReadinessInput,
    "deliveryLedger" | "transportPolicyAuthority"
  >;
  if (captured.circuitCommand === "reset") {
    throw new TypeError("Disabled provider harness Circuit reset is not permitted");
  }
  return Object.freeze({
    ...captured,
    deliveryLedger: descriptors.deliveryLedger!.value as DurableContextDeliveryLedger,
    transportPolicyAuthority,
  });
}

type CapturedHarnessInput =
  | Readonly<{
      mode: Exclude<DisabledProductionProviderHarnessMode, "response-mapping-fixture">;
      readinessInput: CapturedReadinessInput;
    }>
  | Readonly<{
      mode: "response-mapping-fixture";
      readinessInput: CapturedReadinessInput;
      fixtureClassification: ProviderResponseFixtureClassification;
      mappingEvidenceId: string;
      resultEnvelopeId: string;
      executionAttemptId: string;
      startedAt: string;
    }>;

function captureHarnessInput(
  input: DisabledProductionProviderHarnessInput,
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
): CapturedHarnessInput {
  const preliminaryDescriptors = captureExactOwnEnumerableDataDescriptors(input, [
    "mode",
    "readinessInput",
  ] as const);
  const responseDescriptors = captureExactOwnEnumerableDataDescriptors(input, [
    "mode",
    "readinessInput",
    "fixtureClassification",
    "mappingEvidenceId",
    "resultEnvelopeId",
    "executionAttemptId",
    "startedAt",
  ] as const);
  const capturedDescriptors = preliminaryDescriptors ?? responseDescriptors;
  if (capturedDescriptors === null) {
    throw new TypeError("Disabled provider harness input is invalid");
  }
  const descriptors = capturedDescriptors as Readonly<Record<string, PropertyDescriptor>>;
  const modeDescriptor = descriptors.mode;
  const readinessDescriptor = descriptors.readinessInput;
  const mode = modeDescriptor!.value as DisabledProductionProviderHarnessMode;
  if (!APPROVED_MODES.includes(mode)) {
    throw new TypeError("Disabled provider harness mode is not approved");
  }
  const expectedKeys =
    mode === "response-mapping-fixture"
      ? [
          "mode",
          "readinessInput",
          "fixtureClassification",
          "mappingEvidenceId",
          "resultEnvelopeId",
          "executionAttemptId",
          "startedAt",
        ]
      : ["mode", "readinessInput"];
  if (
    (mode === "response-mapping-fixture" && responseDescriptors === null) ||
    (mode !== "response-mapping-fixture" && preliminaryDescriptors === null)
  ) {
    throw new TypeError("Disabled provider harness input contains unsupported fields");
  }
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (key !== "readinessInput" && findDurableCanonicalJsonIssue(descriptor!.value) !== null) {
      throw new TypeError("Disabled provider harness input is invalid");
    }
  }
  if (mode === "response-mapping-fixture") {
    const fixtureClassification = ProviderResponseFixtureClassificationSchema.safeParse(
      descriptors.fixtureClassification!.value,
    );
    const mappingEvidenceId = ProviderReadinessIdentifierSchema.safeParse(
      descriptors.mappingEvidenceId!.value,
    );
    const resultEnvelopeId = ProviderReadinessIdentifierSchema.safeParse(
      descriptors.resultEnvelopeId!.value,
    );
    const executionAttemptId = ProviderReadinessIdentifierSchema.safeParse(
      descriptors.executionAttemptId!.value,
    );
    const startedAt = IsoTemporalSchema.safeParse(descriptors.startedAt!.value);
    const extendedFixtureClassification = ["cost-metadata", "usage-metadata"].includes(
      descriptors.fixtureClassification!.value as string,
    );
    if (
      (!fixtureClassification.success && !extendedFixtureClassification) ||
      !mappingEvidenceId.success ||
      !resultEnvelopeId.success ||
      !executionAttemptId.success ||
      !startedAt.success ||
      findProhibitedProductionProviderReadinessInputMaterial([
        ["mode", descriptors.mode!.value],
        ["fixtureClassification", descriptors.fixtureClassification!.value],
        ["mappingEvidenceId", descriptors.mappingEvidenceId!.value],
        ["resultEnvelopeId", descriptors.resultEnvelopeId!.value],
        ["executionAttemptId", descriptors.executionAttemptId!.value],
        ["startedAt", descriptors.startedAt!.value],
      ] as const) !== null
    ) {
      throw new TypeError("Disabled provider harness response fixture input is invalid");
    }
  }
  const readinessInput = captureReadinessInput(
    readinessDescriptor!.value,
    transportPolicyAuthority,
  );
  if (mode !== "response-mapping-fixture") return Object.freeze({ mode, readinessInput });
  if (
    Date.parse(descriptors.startedAt!.value as string) <
      Date.parse(readinessInput.invocationRequest.requestedAt) ||
    Date.parse(descriptors.startedAt!.value as string) > Date.parse(readinessInput.evaluatedAt)
  ) {
    throw new TypeError("Disabled provider harness response fixture input is invalid");
  }
  const fixtureInput = immutableCopy({
    mode,
    fixtureClassification: descriptors.fixtureClassification!.value,
    mappingEvidenceId: descriptors.mappingEvidenceId!.value,
    resultEnvelopeId: descriptors.resultEnvelopeId!.value,
    executionAttemptId: descriptors.executionAttemptId!.value,
    startedAt: descriptors.startedAt!.value,
  });
  return Object.freeze({ ...fixtureInput, readinessInput }) as CapturedHarnessInput;
}

function credentialExpectation(input: CapturedReadinessInput): CredentialReferenceExpectation {
  return {
    ...withoutFingerprint(input.credentialReference, "referenceFingerprint"),
    adapterCredentialReferenceClass: input.adapterDescriptor.credentialReferenceClass,
    expectedAdapterFingerprint: input.adapterDescriptor.adapterFingerprint,
  } as unknown as CredentialReferenceExpectation;
}

function transportPolicyInput(input: CapturedReadinessInput): SecureTransportPolicyInput | null {
  const expectedPolicy = resolveExpectedProductionProviderTransportPolicy({
    authority: input.transportPolicyAuthority,
    adapter: input.adapterDescriptor,
  });
  return expectedPolicy === null
    ? null
    : (withoutFingerprint(
        expectedPolicy,
        "policyFingerprint",
      ) as unknown as SecureTransportPolicyInput);
}

function rateEvaluation(input: CapturedReadinessInput) {
  return {
    decisionId: `${input.readinessDecisionId}-rate`,
    invocationRequest: input.invocationRequest,
    adapter: input.adapterDescriptor,
    policy: input.ratePolicy,
    counters: input.rateCounters,
    priorityClass: input.priorityClass,
    evaluatedAt: input.evaluatedAt,
  } as const;
}

function costEvaluation(input: CapturedReadinessInput) {
  return {
    decisionId: `${input.readinessDecisionId}-cost`,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    adapter: input.adapterDescriptor,
    pricingReference: input.pricingReference,
    policy: input.costPolicy,
    evaluatedAt: input.evaluatedAt,
  } as const;
}

function circuitTransition(input: CapturedReadinessInput): CircuitTransitionInput {
  return {
    circuitStateId: input.circuitStateId,
    adapter: input.adapterDescriptor,
    previousState: input.previousCircuitState,
    thresholdPolicy: input.circuitThresholdPolicy,
    failureWindow: input.circuitFailureWindow,
    evaluatedAt: input.evaluatedAt,
    command: input.circuitCommand,
    probeOutcome: input.circuitProbeOutcome,
    probesAlreadyUsed: input.circuitProbesAlreadyUsed,
  };
}

async function buildPrePlanAuthorities(input: CapturedReadinessInput) {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: input.deliveryLedger,
    deliveryIdentity: input.deliveryIdentity,
    invocationRequest: input.invocationRequest,
  });
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: authority,
    adapter: input.adapterDescriptor,
    requestedOperation: input.requestedOperation,
    decisionAuthorityReference: input.decisionAuthorityReference,
  };
  const authorizationResult = enforceAuthorizationDecision({
    evidence: input.authorizationEvidence,
    authority: authorizationAuthority,
    expectedDecision: input.expectedAuthorizationDecision,
    evaluatedAt: input.evaluatedAt,
  });
  if (authorizationResult.status !== "allowed" || input.authorizationEvidence === null) {
    throw new TypeError("Disabled provider harness Authorization is not ready");
  }
  const adapterVerification = verifyProductionProviderAdapterDescriptor({
    descriptor: input.adapterDescriptor,
    providerCapability: input.providerCapability,
  });
  if (adapterVerification.status !== "valid" || input.adapterDescriptor.state === "disabled") {
    throw new TypeError("Disabled provider harness Adapter is not ready");
  }
  const credentialExpected = credentialExpectation(input);
  const credentialVerification = verifyCredentialReference({
    reference: input.credentialReference,
    adapter: input.adapterDescriptor,
    expected: credentialExpected,
  });
  if (
    credentialVerification.status !== "valid" ||
    input.credentialReference.availability !== "available"
  ) {
    throw new TypeError("Disabled provider harness Credential Reference is not ready");
  }
  const compatibility = matchReasoningProviderCapabilities({
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
  });
  const compatibilityVerification = verifyReasoningProviderCompatibilityResult({
    compatibility,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
  });
  if (compatibilityVerification.status !== "valid" || compatibility.status !== "compatible") {
    throw new TypeError("Disabled provider harness Capability is not ready");
  }
  const policyInput = transportPolicyInput(input);
  if (policyInput === null) {
    throw new TypeError("Disabled provider harness Transport Policy authority is not ready");
  }
  const policyVerification = verifySecureTransportPolicy({
    policy: input.transportPolicy,
    adapter: input.adapterDescriptor,
    expectedPolicy: policyInput,
  });
  if (
    policyVerification.status !== "valid" ||
    !verifyInvocationTransportTimeoutCompatibility({
      invocationRequest: input.invocationRequest,
      policy: input.transportPolicy,
    })
  ) {
    throw new TypeError("Disabled provider harness Transport Policy is not ready");
  }
  const transportPlan = createProviderTransportPlan({
    transportPlanId: input.transportPlanId,
    adapter: input.adapterDescriptor,
    policy: input.transportPolicy,
  });
  const transportVerification = verifyProviderTransportPlan({
    plan: transportPlan,
    adapter: input.adapterDescriptor,
    policy: input.transportPolicy,
    expectedTransportPlanId: input.transportPlanId,
  });
  if (transportVerification.status !== "valid") {
    throw new TypeError("Disabled provider harness Transport Plan is not ready");
  }
  const rateInput = rateEvaluation(input);
  const rateDecision = evaluateProviderRateAndCapacity(rateInput);
  const rateVerification = verifyProviderRateAndCapacityDecision({
    decision: rateDecision,
    evaluation: rateInput,
  });
  if (rateVerification.status !== "valid" || rateDecision.outcome !== "admitted") {
    throw new TypeError("Disabled provider harness Rate and Capacity is not ready");
  }
  const costInput = costEvaluation(input);
  const costDecision = evaluateCostAndBudget(costInput);
  const costVerification = verifyCostAndBudgetDecision({
    decision: costDecision,
    evaluation: costInput,
  });
  if (costVerification.status !== "valid" || costDecision.outcome !== "within-budget") {
    throw new TypeError("Disabled provider harness Cost and Budget is not ready");
  }
  return immutableCopy({
    authority,
    authorizationResult,
    authorization: {
      evidence: input.authorizationEvidence,
      authority: authorizationAuthority,
      expectedDecision: input.expectedAuthorizationDecision,
    },
    credentialExpected,
    compatibility,
    policyInput,
    transportPlan,
    rate: { decision: rateDecision, evaluation: rateInput },
    cost: { decision: costDecision, evaluation: costInput },
  });
}

async function buildRequestMappingDryRun(input: CapturedReadinessInput) {
  const prerequisites = await buildPrePlanAuthorities(input);
  const construction: ProviderRequestPlanConstructionInput = {
    schemaVersion: "1.0",
    requestPlanId: input.requestPlanId,
    evaluatedAt: input.evaluatedAt,
    authority: prerequisites.authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility: prerequisites.compatibility,
    authorization: prerequisites.authorization,
    credential: {
      reference: input.credentialReference,
      expected: prerequisites.credentialExpected,
    },
    transport: {
      policy: input.transportPolicy,
      policyInput: prerequisites.policyInput,
      plan: prerequisites.transportPlan,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: prerequisites.rate,
    cost: prerequisites.cost,
  };
  const requestPlan = createProviderRequestPlan(construction);
  const verification = verifyProviderRequestPlan({ plan: requestPlan, construction });
  return immutableCopy({
    requestPlan,
    verification,
    construction,
    authorizationResult: prerequisites.authorizationResult,
  });
}

async function buildObservabilitySimulation(
  input: CapturedReadinessInput,
  observabilityRetentionMode: ObservabilityRetentionMode,
) {
  const prerequisites = await buildPrePlanAuthorities(input);
  const transition = circuitTransition(input);
  const circuit = transitionCircuitState(transition);
  const circuitVerification = verifyCircuitState({ state: circuit, transition });
  const observabilityInput: ProviderObservabilityBundleInput = {
    schemaVersion: "1.0",
    readinessEvidenceId: input.observabilityReadinessEvidenceId,
    evaluatedAt: input.evaluatedAt,
    startedAt: input.startedAt,
    authority: prerequisites.authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility: prerequisites.compatibility,
    authorization: prerequisites.authorization,
    rate: prerequisites.rate,
    cost: prerequisites.cost,
    circuit: { state: circuit, transition },
    policy: input.observabilityPolicy,
  };
  const { bundle, retainedSnapshot, retentionEvidence } =
    createAndVerifyRetainedProviderObservabilityBundle(
      observabilityInput,
      observabilityRetentionMode,
    );
  const verification = verifyProviderObservabilityBundle({ bundle, input: observabilityInput });
  const readinessVerification = verifyObservabilityReadinessEvidence({
    evidence: bundle.readiness,
    expected: withoutFingerprint(bundle.readiness, "readinessFingerprint") as unknown as Omit<
      ObservabilityReadinessEvidence,
      "readinessFingerprint"
    >,
  });
  return immutableCopy({
    bundle,
    retainedSnapshot,
    retentionEvidence,
    verification,
    readinessVerification,
    circuit,
    circuitVerification,
    transition,
    prerequisites,
    observabilityInput,
  });
}

async function buildHealthEvaluation(
  input: CapturedReadinessInput,
  observabilityRetentionMode: ObservabilityRetentionMode,
) {
  const observability = await buildObservabilitySimulation(input, observabilityRetentionMode);
  const expectedObservability = withoutFingerprint(
    observability.bundle.readiness,
    "readinessFingerprint",
  ) as unknown as Omit<ObservabilityReadinessEvidence, "readinessFingerprint">;
  const derivation = {
    healthEvidenceId: input.healthEvidenceId,
    adapter: input.adapterDescriptor,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    authorization: observability.prerequisites.authorization,
    credential: {
      reference: input.credentialReference,
      expected: credentialExpectation(input),
    },
    transport: {
      policy: input.transportPolicy,
      policyInput: observability.prerequisites.policyInput,
      plan: observability.prerequisites.transportPlan,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: observability.prerequisites.rate,
    cost: observability.prerequisites.cost,
    circuit: { state: observability.circuit, transition: observability.transition },
    observability: {
      evidence: observability.bundle.readiness,
      expected: expectedObservability,
    },
    evaluatedAt: input.evaluatedAt,
  };
  const health = deriveProviderHealthEvidence(derivation);
  const verification = verifyProviderHealthEvidence({ evidence: health, derivation });
  return immutableCopy({
    health,
    verification,
    retainedObservabilitySnapshot: observability.retainedSnapshot,
    observabilityRetentionEvidence: observability.retentionEvidence,
  });
}

function simulateContract(input: CapturedReadinessInput) {
  return immutableCopy(
    verifyProductionProviderAdapterDescriptor({
      descriptor: input.adapterDescriptor,
      providerCapability: input.providerCapability,
    }),
  );
}

async function simulateAuthorization(input: CapturedReadinessInput) {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: input.deliveryLedger,
    deliveryIdentity: input.deliveryIdentity,
    invocationRequest: input.invocationRequest,
  });
  return immutableCopy(
    enforceAuthorizationDecision({
      evidence: input.authorizationEvidence,
      authority: {
        deliveryAuthority: authority,
        adapter: input.adapterDescriptor,
        requestedOperation: input.requestedOperation,
        decisionAuthorityReference: input.decisionAuthorityReference,
      },
      expectedDecision: input.expectedAuthorizationDecision,
      evaluatedAt: input.evaluatedAt,
    }),
  );
}

function simulateCredential(input: CapturedReadinessInput) {
  return immutableCopy(
    verifyCredentialReference({
      reference: input.credentialReference,
      adapter: input.adapterDescriptor,
      expected: credentialExpectation(input),
    }),
  );
}

async function simulateTransport(input: CapturedReadinessInput) {
  const authorization = await simulateAuthorization(input);
  if (authorization.status !== "allowed") {
    throw new TypeError("Disabled provider harness Authorization is not ready");
  }
  const policyInput = transportPolicyInput(input);
  if (policyInput === null) {
    throw new TypeError("Disabled provider harness Transport Policy authority is not ready");
  }
  const policyVerification = verifySecureTransportPolicy({
    policy: input.transportPolicy,
    adapter: input.adapterDescriptor,
    expectedPolicy: policyInput,
  });
  if (
    policyVerification.status !== "valid" ||
    !verifyInvocationTransportTimeoutCompatibility({
      invocationRequest: input.invocationRequest,
      policy: input.transportPolicy,
    })
  ) {
    throw new TypeError("Disabled provider harness Transport Policy is not ready");
  }
  const plan = createProviderTransportPlan({
    transportPlanId: input.transportPlanId,
    adapter: input.adapterDescriptor,
    policy: input.transportPolicy,
  });
  const planVerification = verifyProviderTransportPlan({
    plan,
    adapter: input.adapterDescriptor,
    policy: input.transportPolicy,
    expectedTransportPlanId: input.transportPlanId,
  });
  return immutableCopy({ policyVerification, plan, planVerification });
}

function simulateAdmission(input: CapturedReadinessInput) {
  const rateInput = rateEvaluation(input);
  const rate = evaluateProviderRateAndCapacity(rateInput);
  const costInput = costEvaluation(input);
  const cost = evaluateCostAndBudget(costInput);
  return immutableCopy({
    rate,
    rateVerification: verifyProviderRateAndCapacityDecision({
      decision: rate,
      evaluation: rateInput,
    }),
    cost,
    costVerification: verifyCostAndBudgetDecision({ decision: cost, evaluation: costInput }),
  });
}

function simulateCircuit(input: CapturedReadinessInput) {
  const transition = circuitTransition(input);
  const state = transitionCircuitState(transition);
  return immutableCopy({
    state,
    verification: verifyCircuitState({ state, transition }),
  });
}

/**
 * Runs only the selected deterministic validation/simulation. Only the explicit
 * full-readiness mode enters the public readiness facade. No mode accepts or
 * exposes a provider client, secret resolver, URL, callback, or transport hook.
 */
async function runConfiguredDisabledProductionProviderAdapterHarness(
  input: CapturedHarnessInput,
  evaluator: ProductionProviderReadinessEvaluator,
  observabilityRetentionMode: ObservabilityRetentionMode,
): Promise<DisabledProductionProviderHarnessResult> {
  switch (input.mode) {
    case "contract-validation":
      return immutableCopy({
        mode: input.mode,
        contractValidation: simulateContract(input.readinessInput),
      });
    case "authorization-validation":
      return immutableCopy({
        mode: input.mode,
        authorizationValidation: await simulateAuthorization(input.readinessInput),
      });
    case "credential-reference-validation":
      return immutableCopy({
        mode: input.mode,
        credentialValidation: simulateCredential(input.readinessInput),
      });
    case "transport-plan-dry-run":
      return immutableCopy({
        mode: input.mode,
        transportDryRun: await simulateTransport(input.readinessInput),
      });
    case "request-mapping-dry-run": {
      const request = await buildRequestMappingDryRun(input.readinessInput);
      return immutableCopy({
        mode: input.mode,
        requestMappingDryRun: {
          requestPlan: request.requestPlan,
          verification: request.verification,
        },
      });
    }
    case "response-mapping-fixture": {
      const request = await buildRequestMappingDryRun(input.readinessInput);
      const mappingInput: ProviderResponseFixtureMappingInput = {
        schemaVersion: "1.0",
        mappingEvidenceId: input.mappingEvidenceId,
        resultEnvelopeId: input.resultEnvelopeId,
        executionAttemptId: input.executionAttemptId,
        fixtureClassification: input.fixtureClassification,
        startedAt: input.startedAt,
        requestPlan: request.requestPlan,
        requestPlanConstruction: request.construction,
        contextPackageObjectCount:
          request.construction.authority.envelope.contextPackage.included.length,
      };
      const mapping = mapProviderResponseFixture(mappingInput);
      const verification = verifyProviderResponseFixtureMapping({ mapping, input: mappingInput });
      return immutableCopy({
        mode: input.mode,
        responseMappingFixture: {
          mapping,
          mappingEvidence: mapping.mappingEvidence,
          verification,
        },
      });
    }
    case "rate-and-cost-admission-simulation":
      return immutableCopy({
        mode: input.mode,
        admissionSimulation: simulateAdmission(input.readinessInput),
      });
    case "circuit-simulation":
      return immutableCopy({
        mode: input.mode,
        circuitSimulation: simulateCircuit(input.readinessInput),
      });
    case "health-evaluation":
      return immutableCopy({
        mode: input.mode,
        healthEvaluation: await buildHealthEvaluation(
          input.readinessInput,
          observabilityRetentionMode,
        ),
      });
    case "observability-redaction-simulation": {
      const simulation = await buildObservabilitySimulation(
        input.readinessInput,
        observabilityRetentionMode,
      );
      return immutableCopy({
        mode: input.mode,
        observabilitySimulation: {
          bundle: simulation.bundle,
          retainedSnapshot: simulation.retainedSnapshot,
          retentionEvidence: simulation.retentionEvidence,
          verification: simulation.verification,
        },
      });
    }
    case "full-readiness-evaluation": {
      const {
        transportPolicyAuthority: _capturedTransportPolicyAuthority,
        ...publicReadinessInput
      } = input.readinessInput;
      void _capturedTransportPolicyAuthority;
      const evaluation = await evaluator.evaluate(publicReadinessInput);
      const decisionVerification = await evaluator.verifyDecision({
        decision: evaluation.decision,
        authoritativeInput: publicReadinessInput,
        observabilityRetentionEvidence: evaluation.evidence.observabilityRetention,
      });
      return immutableCopy({
        mode: input.mode,
        fullReadinessEvaluation: { evaluation, decisionVerification },
      });
    }
  }
}

export interface DisabledProductionProviderAdapterHarness {
  readonly run: (
    input: DisabledProductionProviderHarnessInput,
  ) => Promise<DisabledProductionProviderHarnessResult>;
}

const harnessEvaluators = new WeakMap<
  DisabledProductionProviderAdapterHarness,
  ProductionProviderReadinessEvaluator
>();

function createConfiguredDisabledProductionProviderAdapterHarness(
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
  observabilityRetentionMode: ObservabilityRetentionMode,
): DisabledProductionProviderAdapterHarness {
  const evaluator =
    observabilityRetentionMode === "normal"
      ? createProductionProviderReadinessEvaluator({ transportPolicyAuthority })
      : createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest(
          transportPolicyAuthority,
          observabilityRetentionMode,
        );
  const harness: DisabledProductionProviderAdapterHarness = Object.freeze({
    run(input: DisabledProductionProviderHarnessInput) {
      return runConfiguredDisabledProductionProviderAdapterHarness(
        captureHarnessInput(input, transportPolicyAuthority),
        evaluator,
        observabilityRetentionMode,
      );
    },
  });
  harnessEvaluators.set(harness, evaluator);
  return harness;
}

export function createDisabledProductionProviderAdapterHarness(config: {
  readonly transportPolicyAuthority: ProductionProviderTransportPolicyAuthority;
}): DisabledProductionProviderAdapterHarness {
  const descriptors = captureExactOwnEnumerableDataDescriptors(config, [
    "transportPolicyAuthority",
  ] as const);
  if (descriptors === null) {
    throw new TypeError("Disabled provider harness configuration is invalid");
  }
  return createConfiguredDisabledProductionProviderAdapterHarness(
    captureProductionProviderTransportPolicyAuthority(descriptors.transportPolicyAuthority.value),
    "normal",
  );
}

/** Direct-module deterministic failure seam. Intentionally absent from the package facade. */
export function createDisabledProductionProviderAdapterHarnessWithObservabilityRetentionFailureForTest(
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
  mode: Exclude<ObservabilityRetentionMode, "normal">,
): DisabledProductionProviderAdapterHarness {
  if (mode !== "fail-append" && mode !== "insufficient-capacity") {
    throw new TypeError("Observability retention failure mode is invalid");
  }
  return createConfiguredDisabledProductionProviderAdapterHarness(
    captureProductionProviderTransportPolicyAuthority(transportPolicyAuthority),
    mode,
  );
}

/** Direct-module append audit seam. Intentionally absent from the package facade. */
export function getDisabledProductionProviderHarnessObservabilityAppendCountForTest(
  harness: DisabledProductionProviderAdapterHarness,
): number {
  const evaluator = harnessEvaluators.get(harness);
  if (evaluator === undefined) {
    throw new TypeError("Disabled production provider harness is not configured");
  }
  return getProductionProviderReadinessObservabilityAppendCountForTest(evaluator);
}
