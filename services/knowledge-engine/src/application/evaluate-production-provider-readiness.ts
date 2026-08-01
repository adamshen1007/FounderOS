import {
  AuthorizationDecisionEvidenceSchema,
  IsoTemporalSchema,
  ProductionProviderReadinessDecisionSchema,
  ProductionProviderAdapterDescriptorSchema,
  ProviderReadinessIdentifierSchema,
  ReasoningInvocationRequestSchema,
  findDurableCanonicalJsonIssue,
  type AuthorizationDecisionEvidence,
  type CircuitState,
  type CredentialReference,
  type DurableContextDeliveryLedger,
  type ObservabilityReadinessEvidence,
  type ProviderObservabilityRetentionEvidence,
  type PricingReference,
  type ProductionProviderAdapterDescriptor,
  type ProductionProviderReadinessDecision,
  type ProviderHealthEvidence,
  type ProviderRateAndCapacityDecision,
  type ProviderRequestPlan,
  type ProviderTransportPlan,
  type ReasoningInvocationRequest,
  type ReasoningProviderCapabilityDescriptor,
  type ReasoningProviderCompatibilityResult,
  type SecureTransportPolicy,
  type CostAndBudgetDecision,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";

import {
  createProviderObservabilityBundle,
  createProviderRequestPlan,
  verifyProviderObservabilityRetentionEvidence,
  verifyProviderObservabilityBundle,
  verifyProviderRequestPlan,
  type ProviderMappingVerifiedAuthority,
  type ProviderObservabilityBundle,
  type ProviderObservabilityPolicyInput,
  type ProviderRequestPlanConstructionInput,
} from "../domain/provider-mapping-observability.js";
import {
  deriveProviderHealthEvidence,
  enforceAuthorizationDecision,
  evaluateCostAndBudget,
  evaluateProviderRateAndCapacity,
  fingerprintProviderReadinessArtifact,
  transitionCircuitState,
  verifyCircuitState,
  verifyCostAndBudgetDecision,
  verifyCredentialReference,
  verifyObservabilityReadinessEvidence,
  verifyPricingReference,
  verifyProductionProviderAdapterDescriptor,
  verifyProviderHealthEvidence,
  verifyProviderRateAndCapacityDecision,
  verifyProviderReadinessArtifactFingerprint,
  verifyProviderTransportPlan,
  verifySecureTransportPolicy,
  verifyInvocationTransportTimeoutCompatibility,
  createProviderTransportPlan,
  type AuthorizationAuthority,
  type AuthorizationDecisionInput,
  type CircuitFailureWindowInput,
  type CircuitThresholdPolicyInput,
  type CircuitTransitionInput,
  type CostAndBudgetPolicy,
  type CredentialReferenceExpectation,
  type RateAndCapacityCounters,
  type RateAndCapacityPolicy,
  type SecureTransportPolicyInput,
} from "../domain/provider-readiness.js";
import {
  matchReasoningProviderCapabilities,
  verifyReasoningProviderCompatibilityResult,
} from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import {
  GovernedReasoningAuthorityVerificationError,
  resolveVerifiedGovernedReasoningAuthority,
  type DurableDeliveryTransactionIdentity,
} from "./resolve-verified-governed-reasoning-authority.js";
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
  INTERNAL_OBSERVABILITY_RETENTION_CONFIG,
  type ObservabilityRetentionMode,
  type ProviderObservabilityAppendAudit,
} from "./retain-provider-observability-bundle.js";

export type ProductionProviderReadinessGate =
  | "durable-delivery-and-invocation"
  | "authorization"
  | "adapter-descriptor"
  | "credential-reference"
  | "capability"
  | "transport-policy-plan"
  | "rate-and-capacity"
  | "cost-and-budget"
  | "circuit"
  | "observability-redaction"
  | "health"
  | "request-plan"
  | "readiness-decision"
  | "stop-before-transport";

export interface ProductionProviderReadinessGateTraceEntry {
  readonly order: number;
  readonly gate: ProductionProviderReadinessGate;
  readonly status: "completed" | "stopped";
  readonly reasonCodes: readonly string[];
}

export interface EvaluateProductionProviderReadinessInput {
  readonly schemaVersion: "1.0";
  readonly readinessDecisionId: string;
  readonly requestPlanId: string;
  readonly transportPlanId: string;
  readonly healthEvidenceId: string;
  readonly observabilityReadinessEvidenceId: string;
  readonly evaluatedAt: string;
  readonly startedAt: string;
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly authorizationEvidence: AuthorizationDecisionEvidence | null;
  readonly expectedAuthorizationDecision: AuthorizationDecisionInput;
  readonly requestedOperation: AuthorizationDecisionEvidence["requestedOperation"];
  readonly decisionAuthorityReference: string;
  readonly adapterDescriptor: ProductionProviderAdapterDescriptor;
  readonly credentialReference: CredentialReference;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly transportPolicy: SecureTransportPolicy;
  readonly ratePolicy: RateAndCapacityPolicy;
  readonly rateCounters: RateAndCapacityCounters;
  readonly priorityClass: ProviderRateAndCapacityDecision["priorityClass"];
  readonly pricingReference: PricingReference;
  readonly costPolicy: CostAndBudgetPolicy;
  readonly circuitStateId: string;
  readonly previousCircuitState: CircuitState | null;
  readonly circuitThresholdPolicy: CircuitThresholdPolicyInput;
  readonly circuitFailureWindow: CircuitFailureWindowInput;
  readonly circuitCommand: CircuitTransitionInput["command"];
  readonly circuitProbeOutcome: CircuitTransitionInput["probeOutcome"];
  readonly circuitProbesAlreadyUsed: number;
  readonly observabilityPolicy: ProviderObservabilityPolicyInput;
}

export interface ProductionProviderReadinessEvidence {
  readonly authorization: AuthorizationDecisionEvidence | null;
  readonly compatibility: ReasoningProviderCompatibilityResult | null;
  readonly transportPlan: ProviderTransportPlan | null;
  readonly rateAndCapacity: ProviderRateAndCapacityDecision | null;
  readonly costAndBudget: CostAndBudgetDecision | null;
  readonly circuit: CircuitState | null;
  readonly observability: ProviderObservabilityBundle | null;
  readonly observabilityRetention: ProviderObservabilityRetentionEvidence | null;
  readonly health: ProviderHealthEvidence | null;
  readonly requestPlan: ProviderRequestPlan | null;
}

export interface ProductionProviderReadinessEvaluation {
  readonly decision: ProductionProviderReadinessDecision;
  readonly gateTrace: readonly ProductionProviderReadinessGateTraceEntry[];
  readonly evidence: ProductionProviderReadinessEvidence;
}

export class ProductionProviderReadinessError extends Error {
  public readonly gateTrace: readonly ProductionProviderReadinessGateTraceEntry[];

  public constructor(
    public readonly code: "delivery_authority_invalid" | "invalid_input",
    gateTrace: readonly ProductionProviderReadinessGateTraceEntry[],
  ) {
    super(
      code === "delivery_authority_invalid"
        ? "Governed Delivery and Invocation authority did not verify"
        : "Provider readiness input did not satisfy the public contract",
    );
    this.name = "ProductionProviderReadinessError";
    this.gateTrace = immutableCopy(gateTrace);
  }
}

const INPUT_KEYS = [
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

type CapturedInput = Omit<EvaluateProductionProviderReadinessInput, "deliveryLedger"> & {
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly transportPolicyAuthority: ProductionProviderTransportPolicyAuthority;
};

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function capturePublicInput(
  input: EvaluateProductionProviderReadinessInput,
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
): CapturedInput {
  const descriptors = captureExactOwnEnumerableDataDescriptors(input, INPUT_KEYS);
  if (descriptors === null) {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  for (const key of INPUT_KEYS) {
    const descriptor = descriptors[key];
    if (key !== "deliveryLedger" && findDurableCanonicalJsonIssue(descriptor.value) !== null) {
      throw new ProductionProviderReadinessError("invalid_input", []);
    }
  }
  if (descriptors.schemaVersion!.value !== "1.0") {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  if (descriptors.circuitCommand!.value === "reset") {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  if (
    findProhibitedProductionProviderReadinessInputMaterial(
      INPUT_KEYS.filter((key) => key !== "deliveryLedger").map((key) => [
        key,
        descriptors[key]!.value,
      ]),
    ) !== null
  ) {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  const evaluatedAt = IsoTemporalSchema.safeParse(descriptors.evaluatedAt!.value);
  const startedAt = IsoTemporalSchema.safeParse(descriptors.startedAt!.value);
  const invocation = ReasoningInvocationRequestSchema.safeParse(
    descriptors.invocationRequest!.value,
  );
  if (
    !ProviderReadinessIdentifierSchema.safeParse(descriptors.readinessDecisionId!.value).success ||
    !ProductionProviderAdapterDescriptorSchema.safeParse(descriptors.adapterDescriptor!.value)
      .success ||
    !invocation.success ||
    !evaluatedAt.success ||
    !startedAt.success ||
    Date.parse(evaluatedAt.data) < Date.parse(startedAt.data) ||
    Date.parse(evaluatedAt.data) < Date.parse(invocation.data.requestedAt)
  ) {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  const canonical = Object.fromEntries(
    INPUT_KEYS.filter((key) => key !== "deliveryLedger").map((key) => [
      key,
      descriptors[key]!.value,
    ]),
  );
  const capturedCanonical = immutableCopy(canonical) as Omit<
    CapturedInput,
    "deliveryLedger" | "transportPolicyAuthority"
  >;
  return Object.freeze({
    ...capturedCanonical,
    deliveryLedger: descriptors.deliveryLedger!.value as DurableContextDeliveryLedger,
    transportPolicyAuthority,
  });
}

function unsigned<T extends Record<string, unknown>>(
  value: T,
  fingerprintField: keyof T,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== fingerprintField));
}

function makeTraceEntry(
  order: number,
  gate: ProductionProviderReadinessGate,
  status: "completed" | "stopped",
  reasonCodes: readonly string[] = [],
): ProductionProviderReadinessGateTraceEntry {
  return immutableCopy({ order, gate, status, reasonCodes: [...reasonCodes].sort() });
}

interface DecisionFacts {
  readonly input: CapturedInput;
  readonly authorizationFingerprint: string | null;
  readonly credentialFingerprint: string | null;
  readonly capabilityFingerprint: string | null;
  readonly transportFingerprint: string | null;
  readonly rateFingerprint: string | null;
  readonly costFingerprint: string | null;
  readonly circuitFingerprint: string | null;
  readonly observabilityFingerprint: string | null;
  readonly observabilityRetentionFingerprint: string | null;
  readonly healthFingerprint: string | null;
  readonly requestPlanFingerprint: string | null;
  readonly blocker: ProductionProviderReadinessDecision["blockingReasonCodes"][number] | null;
  readonly warnings?: readonly ProductionProviderReadinessDecision["warningReasonCodes"][number][];
}

function createReadinessDecision(facts: DecisionFacts): ProductionProviderReadinessDecision {
  const blockers = facts.blocker === null ? [] : [facts.blocker];
  const status: ProductionProviderReadinessDecision["status"] =
    facts.blocker === "adapter_disabled"
      ? "disabled-by-policy"
      : facts.blocker === null
        ? "ready-for-dry-run"
        : "not-ready";
  const unsignedDecision = {
    schemaVersion: "1.0" as const,
    readinessDecisionId: facts.input.readinessDecisionId,
    adapterId: facts.input.adapterDescriptor.adapterId,
    adapterFingerprint: facts.input.adapterDescriptor.adapterFingerprint,
    invocationRequestId: facts.input.invocationRequest.invocationRequestId,
    invocationRequestFingerprint: facts.input.invocationRequest.requestFingerprint,
    authorizationDecisionFingerprint: facts.authorizationFingerprint,
    credentialReferenceFingerprint: facts.credentialFingerprint,
    capabilityResultFingerprint: facts.capabilityFingerprint,
    transportPolicyFingerprint: facts.transportFingerprint,
    requestPlanFingerprint: facts.requestPlanFingerprint,
    rateAndCapacityDecisionFingerprint: facts.rateFingerprint,
    costAndBudgetDecisionFingerprint: facts.costFingerprint,
    circuitStateFingerprint: facts.circuitFingerprint,
    healthEvidenceFingerprint: facts.healthFingerprint,
    observabilityReadinessFingerprint: facts.observabilityFingerprint,
    observabilityRetentionFingerprint: facts.observabilityRetentionFingerprint,
    evaluatedAt: facts.input.evaluatedAt,
    status,
    blockingReasonCodes: blockers,
    warningReasonCodes: [...(facts.warnings ?? [])].sort(),
  };
  return immutableCopy(
    ProductionProviderReadinessDecisionSchema.parse({
      ...unsignedDecision,
      decisionFingerprint: fingerprintProviderReadinessArtifact(unsignedDecision),
    }),
  );
}

function verifyAuthoritativeReadinessDecision(
  candidate: unknown,
  authority: DecisionFacts | ProductionProviderReadinessDecision,
): boolean {
  try {
    const expected = "input" in authority ? createReadinessDecision(authority) : authority;
    const parsed = ProductionProviderReadinessDecisionSchema.parse(candidate);
    return (
      verifyProviderReadinessArtifactFingerprint("production-provider-readiness-decision", parsed)
        .status === "valid" &&
      serializeDurableCanonicalJsonValue(parsed) === serializeDurableCanonicalJsonValue(expected)
    );
  } catch {
    return false;
  }
}

function retainVerifiedAuthorizationEvidence(
  candidate: AuthorizationDecisionEvidence | null,
  enforcedFingerprint: string | null,
): AuthorizationDecisionEvidence | null {
  if (candidate === null || enforcedFingerprint === null) return null;
  const parsed = AuthorizationDecisionEvidenceSchema.safeParse(candidate);
  if (
    !parsed.success ||
    parsed.data.decisionFingerprint !== enforcedFingerprint ||
    verifyProviderReadinessArtifactFingerprint("authorization-decision-evidence", parsed.data)
      .status !== "valid"
  ) {
    return null;
  }
  return immutableCopy(parsed.data);
}

function evidence(
  overrides: Partial<ProductionProviderReadinessEvidence> = {},
): ProductionProviderReadinessEvidence {
  return immutableCopy({
    authorization: null,
    compatibility: null,
    transportPlan: null,
    rateAndCapacity: null,
    costAndBudget: null,
    circuit: null,
    observability: null,
    observabilityRetention: null,
    health: null,
    requestPlan: null,
    ...overrides,
  });
}

function stopped(
  input: CapturedInput,
  trace: readonly ProductionProviderReadinessGateTraceEntry[],
  gate: ProductionProviderReadinessGate,
  order: number,
  blocker: DecisionFacts["blocker"],
  facts: Omit<DecisionFacts, "input" | "blocker">,
  currentEvidence: ProductionProviderReadinessEvidence,
): ProductionProviderReadinessEvaluation {
  const decisionFacts = { input, blocker, ...facts };
  const decision = createReadinessDecision(decisionFacts);
  if (!verifyAuthoritativeReadinessDecision(decision, decisionFacts)) {
    throw new ProductionProviderReadinessError("invalid_input", [
      ...trace,
      makeTraceEntry(order, "readiness-decision", "stopped", ["readiness_derivation_invalid"]),
    ]);
  }
  return immutableCopy({
    decision,
    gateTrace: [
      ...trace,
      makeTraceEntry(order, gate, "stopped", blocker === null ? [] : [blocker]),
    ],
    evidence: currentEvidence,
  });
}

/**
 * Evaluates the one non-executing Milestone 14 readiness boundary.
 *
 * Circuit is constructed at gate 9; pre-plan observability is independently
 * verified at gate 10; Health is then derived from that exact evidence at gate
 * 11; mapping follows at gate 12. The final gate deliberately has no transport
 * dependency or execution continuation.
 */
async function evaluateCapturedProductionProviderReadiness(
  input: CapturedInput,
  observabilityRetentionMode: ObservabilityRetentionMode = "normal",
  decisionCandidateForTest?: unknown,
  observabilityRetentionEvidenceForReplay?: ProviderObservabilityRetentionEvidence | null,
  nonEmittingReplay = false,
  appendAudit?: ProviderObservabilityAppendAudit,
): Promise<ProductionProviderReadinessEvaluation> {
  const trace: ProductionProviderReadinessGateTraceEntry[] = [];
  let authority: ProviderMappingVerifiedAuthority;
  try {
    authority = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: input.deliveryLedger,
      deliveryIdentity: input.deliveryIdentity,
      invocationRequest: input.invocationRequest,
    });
  } catch (error) {
    const gateTrace = [
      makeTraceEntry(1, "durable-delivery-and-invocation", "stopped", [
        error instanceof GovernedReasoningAuthorityVerificationError
          ? error.code
          : "delivery_integrity_failure",
      ]),
    ];
    throw new ProductionProviderReadinessError("delivery_authority_invalid", gateTrace);
  }
  trace.push(makeTraceEntry(1, "durable-delivery-and-invocation", "completed"));

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
  const authorizationFingerprint =
    authorizationResult.status === "allowed" || authorizationResult.decisionFingerprint !== null
      ? authorizationResult.decisionFingerprint
      : null;
  const verifiedAuthorizationEvidence = retainVerifiedAuthorizationEvidence(
    input.authorizationEvidence,
    authorizationFingerprint,
  );
  const emptyFacts = {
    authorizationFingerprint,
    credentialFingerprint: null,
    capabilityFingerprint: null,
    transportFingerprint: null,
    rateFingerprint: null,
    costFingerprint: null,
    circuitFingerprint: null,
    observabilityFingerprint: null,
    observabilityRetentionFingerprint: null,
    healthFingerprint: null,
    requestPlanFingerprint: null,
  };
  if (authorizationResult.status !== "allowed") {
    return stopped(
      input,
      trace,
      "authorization",
      2,
      "authorization_not_allowed",
      emptyFacts,
      evidence({ authorization: verifiedAuthorizationEvidence }),
    );
  }
  trace.push(makeTraceEntry(2, "authorization", "completed"));

  const adapterVerification = verifyProductionProviderAdapterDescriptor({
    descriptor: input.adapterDescriptor,
    providerCapability: input.providerCapability,
  });
  if (adapterVerification.status !== "valid") {
    return stopped(
      input,
      trace,
      "adapter-descriptor",
      3,
      "adapter_invalid",
      emptyFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
      }),
    );
  }
  if (input.adapterDescriptor.state === "disabled") {
    return stopped(
      input,
      trace,
      "adapter-descriptor",
      3,
      "adapter_disabled",
      emptyFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
      }),
    );
  }
  trace.push(makeTraceEntry(3, "adapter-descriptor", "completed"));

  const credentialExpected: CredentialReferenceExpectation = {
    ...unsigned(input.credentialReference, "referenceFingerprint"),
    adapterCredentialReferenceClass: input.adapterDescriptor.credentialReferenceClass,
    expectedAdapterFingerprint: input.adapterDescriptor.adapterFingerprint,
  } as unknown as CredentialReferenceExpectation;
  const credentialVerification = verifyCredentialReference({
    reference: input.credentialReference,
    adapter: input.adapterDescriptor,
    expected: credentialExpected,
  });
  const credentialFingerprint =
    credentialVerification.status === "valid"
      ? input.credentialReference.referenceFingerprint
      : null;
  const credentialFacts = { ...emptyFacts, credentialFingerprint };
  if (
    credentialVerification.status !== "valid" ||
    input.credentialReference.availability !== "available"
  ) {
    return stopped(
      input,
      trace,
      "credential-reference",
      4,
      "credential_unavailable",
      credentialFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
      }),
    );
  }
  trace.push(makeTraceEntry(4, "credential-reference", "completed"));

  let compatibility: ReasoningProviderCompatibilityResult;
  try {
    compatibility = matchReasoningProviderCapabilities({
      invocationRequest: input.invocationRequest,
      providerCapability: input.providerCapability,
    });
  } catch {
    return stopped(
      input,
      trace,
      "capability",
      5,
      "capability_incompatible",
      { ...credentialFacts, capabilityFingerprint: null },
      evidence({ authorization: verifiedAuthorizationEvidence }),
    );
  }
  const compatibilityVerification = verifyReasoningProviderCompatibilityResult({
    compatibility,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
  });
  const capabilityFingerprint =
    compatibilityVerification.status === "valid" ? compatibility.compatibilityFingerprint : null;
  const capabilityFacts = { ...credentialFacts, capabilityFingerprint };
  if (compatibilityVerification.status !== "valid" || compatibility.status !== "compatible") {
    return stopped(
      input,
      trace,
      "capability",
      5,
      "capability_incompatible",
      capabilityFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
      }),
    );
  }
  trace.push(makeTraceEntry(5, "capability", "completed"));

  const expectedTransportPolicy = resolveExpectedProductionProviderTransportPolicy({
    authority: input.transportPolicyAuthority,
    adapter: input.adapterDescriptor,
  });
  const transportPolicyInput =
    expectedTransportPolicy === null
      ? null
      : (unsigned(
          expectedTransportPolicy,
          "policyFingerprint",
        ) as unknown as SecureTransportPolicyInput);
  const transportVerification =
    transportPolicyInput === null
      ? null
      : verifySecureTransportPolicy({
          policy: input.transportPolicy,
          adapter: input.adapterDescriptor,
          expectedPolicy: transportPolicyInput,
        });
  let transportPlan: ProviderTransportPlan | null = null;
  if (
    transportPolicyInput !== null &&
    transportVerification?.status === "valid" &&
    verifyInvocationTransportTimeoutCompatibility({
      invocationRequest: input.invocationRequest,
      policy: input.transportPolicy,
    })
  ) {
    try {
      transportPlan = createProviderTransportPlan({
        transportPlanId: input.transportPlanId,
        adapter: input.adapterDescriptor,
        policy: input.transportPolicy,
      });
      if (
        verifyProviderTransportPlan({
          plan: transportPlan,
          adapter: input.adapterDescriptor,
          policy: input.transportPolicy,
          expectedTransportPlanId: input.transportPlanId,
        }).status !== "valid"
      )
        transportPlan = null;
    } catch {
      transportPlan = null;
    }
  }
  const transportFingerprint =
    transportPlan === null ? null : input.transportPolicy.policyFingerprint;
  const transportFacts = { ...capabilityFacts, transportFingerprint };
  if (transportPlan === null) {
    return stopped(
      input,
      trace,
      "transport-policy-plan",
      6,
      "transport_policy_rejected",
      transportFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
      }),
    );
  }
  const verifiedTransportPolicyInput = transportPolicyInput!;
  trace.push(makeTraceEntry(6, "transport-policy-plan", "completed"));

  const rateEvaluation = {
    decisionId: `${input.readinessDecisionId}-rate`,
    invocationRequest: input.invocationRequest,
    adapter: input.adapterDescriptor,
    policy: input.ratePolicy,
    counters: input.rateCounters,
    priorityClass: input.priorityClass,
    evaluatedAt: input.evaluatedAt,
  } as const;
  let rateAndCapacity: ProviderRateAndCapacityDecision;
  try {
    rateAndCapacity = evaluateProviderRateAndCapacity(rateEvaluation);
  } catch {
    return stopped(
      input,
      trace,
      "rate-and-capacity",
      7,
      "rate_capacity_rejected",
      { ...transportFacts, rateFingerprint: null },
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
      }),
    );
  }
  const rateFingerprint =
    verifyProviderRateAndCapacityDecision({ decision: rateAndCapacity, evaluation: rateEvaluation })
      .status === "valid"
      ? rateAndCapacity.decisionFingerprint
      : null;
  const rateFacts = { ...transportFacts, rateFingerprint };
  if (rateFingerprint === null || rateAndCapacity.outcome !== "admitted") {
    return stopped(
      input,
      trace,
      "rate-and-capacity",
      7,
      "rate_capacity_rejected",
      rateFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
      }),
    );
  }
  trace.push(makeTraceEntry(7, "rate-and-capacity", "completed"));

  const pricingInput = unsigned(
    input.pricingReference,
    "pricingFingerprint",
  ) as unknown as Parameters<typeof verifyPricingReference>[0]["expected"];
  const pricingValid =
    verifyPricingReference({ pricingReference: input.pricingReference, expected: pricingInput })
      .status === "valid";
  const costEvaluation = {
    decisionId: `${input.readinessDecisionId}-cost`,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    adapter: input.adapterDescriptor,
    pricingReference: input.pricingReference,
    policy: input.costPolicy,
    evaluatedAt: input.evaluatedAt,
  } as const;
  let costAndBudget: CostAndBudgetDecision;
  try {
    costAndBudget = evaluateCostAndBudget(costEvaluation);
  } catch {
    return stopped(
      input,
      trace,
      "cost-and-budget",
      8,
      "cost_budget_rejected",
      { ...rateFacts, costFingerprint: null },
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
      }),
    );
  }
  const costFingerprint =
    pricingValid &&
    verifyCostAndBudgetDecision({ decision: costAndBudget, evaluation: costEvaluation }).status ===
      "valid"
      ? costAndBudget.decisionFingerprint
      : null;
  const costFacts = { ...rateFacts, costFingerprint };
  if (costFingerprint === null || costAndBudget.outcome !== "within-budget") {
    return stopped(
      input,
      trace,
      "cost-and-budget",
      8,
      "cost_budget_rejected",
      costFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
      }),
    );
  }
  trace.push(makeTraceEntry(8, "cost-and-budget", "completed"));

  const circuitTransition: CircuitTransitionInput = {
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
  let circuit: CircuitState;
  try {
    circuit = transitionCircuitState(circuitTransition);
  } catch {
    return stopped(
      input,
      trace,
      "circuit",
      9,
      "circuit_not_ready",
      { ...costFacts, circuitFingerprint: null },
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
      }),
    );
  }
  const circuitFingerprint =
    verifyCircuitState({ state: circuit, transition: circuitTransition }).status === "valid"
      ? circuit.stateFingerprint
      : null;
  const circuitFacts = { ...costFacts, circuitFingerprint };
  const circuitAllowsDryRun =
    circuit.state === "closed" ||
    (circuit.state === "half-open" && circuit.probeAllowance.dryRunProbePermitted);
  if (circuitFingerprint === null || !circuitAllowsDryRun) {
    return stopped(
      input,
      trace,
      "circuit",
      9,
      "circuit_not_ready",
      circuitFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
        circuit,
      }),
    );
  }
  trace.push(makeTraceEntry(9, "circuit", "completed"));

  const authorization = {
    evidence: verifiedAuthorizationEvidence!,
    authority: authorizationAuthority,
    expectedDecision: input.expectedAuthorizationDecision,
  };
  const observabilityInput = {
    schemaVersion: "1.0" as const,
    readinessEvidenceId: input.observabilityReadinessEvidenceId,
    evaluatedAt: input.evaluatedAt,
    startedAt: input.startedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    policy: input.observabilityPolicy,
  };
  let observability: ProviderObservabilityBundle | null = null;
  let observabilityRetention: ProviderObservabilityRetentionEvidence | null;
  try {
    let candidate: ProviderObservabilityBundle;
    if (nonEmittingReplay) {
      if (observabilityRetentionMode !== "normal") {
        throw new TypeError("Configured observability retention is unavailable");
      }
      candidate = createProviderObservabilityBundle(observabilityInput);
      const retainedSnapshot = immutableCopy({
        logs: [candidate.structuredLog],
        metrics: candidate.metrics,
        traces: candidate.traces,
        publicErrors: candidate.publicErrors,
      });
      if (
        observabilityRetentionEvidenceForReplay === undefined ||
        observabilityRetentionEvidenceForReplay === null ||
        verifyProviderObservabilityRetentionEvidence({
          evidence: observabilityRetentionEvidenceForReplay,
          adapter: input.adapterDescriptor,
          invocationRequest: input.invocationRequest,
          bundle: candidate,
          retainedSnapshot,
          config: INTERNAL_OBSERVABILITY_RETENTION_CONFIG,
        }).status !== "valid"
      ) {
        throw new TypeError("Observability retention evidence did not verify");
      }
      observabilityRetention = immutableCopy(observabilityRetentionEvidenceForReplay);
    } else {
      const retained = createAndVerifyRetainedProviderObservabilityBundle(
        observabilityInput,
        observabilityRetentionMode,
        appendAudit,
      );
      candidate = retained.bundle;
      observabilityRetention = retained.retentionEvidence;
    }
    if (
      verifyProviderObservabilityBundle({ bundle: candidate, input: observabilityInput }).status ===
        "valid" &&
      verifyObservabilityReadinessEvidence({
        evidence: candidate.readiness,
        expected: unsigned(candidate.readiness, "readinessFingerprint") as unknown as Omit<
          ObservabilityReadinessEvidence,
          "readinessFingerprint"
        >,
      }).status === "valid"
    )
      observability = candidate;
  } catch {
    observability = null;
    observabilityRetention = null;
  }
  if (observability === null) observabilityRetention = null;
  const observabilityFingerprint = observability?.readiness.readinessFingerprint ?? null;
  const observabilityRetentionFingerprint = observabilityRetention?.retentionFingerprint ?? null;
  const observabilityFacts = {
    ...circuitFacts,
    observabilityFingerprint,
    observabilityRetentionFingerprint,
  };
  if (
    observability === null ||
    observabilityRetention === null ||
    observability.readiness.status !== "ready"
  ) {
    return stopped(
      input,
      trace,
      "observability-redaction",
      10,
      "observability_not_ready",
      observabilityFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
        circuit,
      }),
    );
  }
  trace.push(makeTraceEntry(10, "observability-redaction", "completed"));

  const healthDerivation = {
    healthEvidenceId: input.healthEvidenceId,
    adapter: input.adapterDescriptor,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      plan: transportPlan,
      policy: input.transportPolicy,
      policyInput: verifiedTransportPolicyInput,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    observability: {
      evidence: observability.readiness,
      expected: unsigned(observability.readiness, "readinessFingerprint") as unknown as Omit<
        ObservabilityReadinessEvidence,
        "readinessFingerprint"
      >,
    },
    evaluatedAt: input.evaluatedAt,
  };
  let health: ProviderHealthEvidence;
  try {
    health = deriveProviderHealthEvidence(healthDerivation);
  } catch {
    return stopped(
      input,
      trace,
      "health",
      11,
      "health_not_ready",
      { ...observabilityFacts, healthFingerprint: null },
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
        circuit,
        observability,
        observabilityRetention,
      }),
    );
  }
  const healthFingerprint =
    verifyProviderHealthEvidence({ evidence: health, derivation: healthDerivation }).status ===
    "valid"
      ? health.healthFingerprint
      : null;
  const healthFacts = { ...observabilityFacts, healthFingerprint };
  const healthAllowsDryRun =
    health.healthState === "healthy" ||
    (health.healthState === "degraded" &&
      circuit.state === "half-open" &&
      circuit.probeAllowance.dryRunProbePermitted);
  if (healthFingerprint === null || !healthAllowsDryRun) {
    return stopped(
      input,
      trace,
      "health",
      11,
      "health_not_ready",
      healthFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
        circuit,
        observability,
        observabilityRetention,
        health,
      }),
    );
  }
  trace.push(makeTraceEntry(11, "health", "completed"));

  const requestPlanConstruction: ProviderRequestPlanConstructionInput = {
    schemaVersion: "1.0",
    requestPlanId: input.requestPlanId,
    evaluatedAt: input.evaluatedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      policy: input.transportPolicy,
      policyInput: verifiedTransportPolicyInput,
      plan: transportPlan,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
  };
  let requestPlan: ProviderRequestPlan | null = null;
  try {
    const candidate = createProviderRequestPlan(requestPlanConstruction);
    if (
      verifyProviderRequestPlan({ plan: candidate, construction: requestPlanConstruction })
        .status === "valid"
    ) {
      requestPlan = candidate;
    }
  } catch {
    requestPlan = null;
  }
  const requestPlanFingerprint = requestPlan?.requestPlanFingerprint ?? null;
  const completeFacts = { ...healthFacts, requestPlanFingerprint };
  if (requestPlan === null) {
    return stopped(
      input,
      trace,
      "request-plan",
      12,
      "request_mapping_invalid",
      completeFacts,
      evidence({
        authorization: verifiedAuthorizationEvidence,
        compatibility,
        transportPlan,
        rateAndCapacity,
        costAndBudget,
        circuit,
        observability,
        observabilityRetention,
        health,
      }),
    );
  }
  trace.push(makeTraceEntry(12, "request-plan", "completed"));

  const finalDecisionFacts: DecisionFacts = {
    input,
    blocker: null,
    ...completeFacts,
    warnings: requestPlan.warnings,
  };
  const decision = createReadinessDecision(finalDecisionFacts);
  const decisionCandidate = decisionCandidateForTest ?? decision;
  if (!verifyAuthoritativeReadinessDecision(decisionCandidate, finalDecisionFacts)) {
    throw new ProductionProviderReadinessError("invalid_input", [
      ...trace,
      makeTraceEntry(13, "readiness-decision", "stopped", ["readiness_derivation_invalid"]),
    ]);
  }
  trace.push(makeTraceEntry(13, "readiness-decision", "completed"));
  trace.push(makeTraceEntry(14, "stop-before-transport", "completed", ["dry_run_only"]));
  return immutableCopy({
    decision,
    gateTrace: trace,
    evidence: evidence({
      authorization: verifiedAuthorizationEvidence,
      compatibility,
      transportPlan,
      rateAndCapacity,
      costAndBudget,
      circuit,
      observability,
      observabilityRetention,
      health,
      requestPlan,
    }),
  });
}

export interface ProductionProviderReadinessEvaluator {
  readonly evaluate: (
    input: EvaluateProductionProviderReadinessInput,
  ) => Promise<ProductionProviderReadinessEvaluation>;
  readonly verifyDecision: (input: {
    readonly decision: unknown;
    readonly authoritativeInput: EvaluateProductionProviderReadinessInput;
    readonly observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
  }) => Promise<Readonly<{ status: "valid" | "invalid"; reason: string | null }>>;
}

const evaluatorConfigurations = new WeakMap<
  ProductionProviderReadinessEvaluator,
  Readonly<{
    transportPolicyAuthority: ProductionProviderTransportPolicyAuthority;
    observabilityRetentionMode: ObservabilityRetentionMode;
    appendAudit: ProviderObservabilityAppendAudit;
    retentionIssuanceRegistry: ProviderObservabilityRetentionIssuanceRegistry;
  }>
>();

const OBSERVABILITY_RETENTION_ISSUANCE_CAPACITY = 4;
const OBSERVABILITY_RETENTION_ISSUANCE_EVICTION_POLICY = "first-issued-fifo-v1" as const;

interface IssuedProviderObservabilityRetentionBinding {
  readonly evaluatorIdentity: object;
  readonly decisionFingerprint: string;
  readonly decisionCanonicalBytes: string;
  readonly retentionFingerprint: string;
  readonly retentionCanonicalBytes: string;
  readonly observabilityReadinessFingerprint: string;
  readonly adapterId: string;
  readonly adapterFingerprint: string;
  readonly invocationRequestId: string;
  readonly invocationRequestFingerprint: string;
}

interface ProviderObservabilityRetentionIssuanceRegistry {
  readonly issue: (evaluation: ProductionProviderReadinessEvaluation) => void;
  readonly containsExact: (
    decision: ProductionProviderReadinessDecision,
    retentionEvidence: ProviderObservabilityRetentionEvidence,
  ) => boolean;
  readonly count: () => number;
}

function createProviderObservabilityRetentionIssuanceRegistry(): ProviderObservabilityRetentionIssuanceRegistry {
  const evaluatorIdentity = Object.freeze({});
  const issuedByDecisionFingerprint = new Map<
    string,
    IssuedProviderObservabilityRetentionBinding
  >();

  const bindingFrom = (
    decision: ProductionProviderReadinessDecision,
    retentionEvidence: ProviderObservabilityRetentionEvidence,
  ): IssuedProviderObservabilityRetentionBinding =>
    Object.freeze({
      evaluatorIdentity,
      decisionFingerprint: decision.decisionFingerprint,
      decisionCanonicalBytes: serializeDurableCanonicalJsonValue(decision),
      retentionFingerprint: retentionEvidence.retentionFingerprint,
      retentionCanonicalBytes: serializeDurableCanonicalJsonValue(retentionEvidence),
      observabilityReadinessFingerprint: retentionEvidence.observabilityReadinessFingerprint,
      adapterId: decision.adapterId,
      adapterFingerprint: decision.adapterFingerprint,
      invocationRequestId: decision.invocationRequestId,
      invocationRequestFingerprint: decision.invocationRequestFingerprint,
    });

  return Object.freeze({
    issue(evaluation: ProductionProviderReadinessEvaluation): void {
      const retentionEvidence = evaluation.evidence.observabilityRetention;
      if (retentionEvidence === null) return;
      const observability = evaluation.evidence.observability;
      if (
        observability === null ||
        evaluation.decision.observabilityRetentionFingerprint !==
          retentionEvidence.retentionFingerprint ||
        evaluation.decision.observabilityReadinessFingerprint !==
          retentionEvidence.observabilityReadinessFingerprint ||
        observability.readiness.readinessFingerprint !==
          retentionEvidence.observabilityReadinessFingerprint ||
        evaluation.decision.adapterId !== retentionEvidence.adapterId ||
        evaluation.decision.adapterFingerprint !== retentionEvidence.adapterFingerprint ||
        evaluation.decision.invocationRequestId !== retentionEvidence.invocationRequestId ||
        evaluation.decision.invocationRequestFingerprint !==
          retentionEvidence.invocationRequestFingerprint ||
        !verifyAuthoritativeReadinessDecision(evaluation.decision, evaluation.decision)
      ) {
        throw new ProductionProviderReadinessError("invalid_input", []);
      }
      const binding = bindingFrom(evaluation.decision, retentionEvidence);
      const existing = issuedByDecisionFingerprint.get(binding.decisionFingerprint);
      if (existing !== undefined) {
        if (
          existing.evaluatorIdentity !== evaluatorIdentity ||
          serializeDurableCanonicalJsonValue(existing) !==
            serializeDurableCanonicalJsonValue(binding)
        ) {
          throw new ProductionProviderReadinessError("invalid_input", []);
        }
        return;
      }
      issuedByDecisionFingerprint.set(binding.decisionFingerprint, binding);
      if (issuedByDecisionFingerprint.size > OBSERVABILITY_RETENTION_ISSUANCE_CAPACITY) {
        const oldestDecisionFingerprint = issuedByDecisionFingerprint.keys().next().value;
        if (oldestDecisionFingerprint !== undefined) {
          issuedByDecisionFingerprint.delete(oldestDecisionFingerprint);
        }
      }
    },
    containsExact(
      decision: ProductionProviderReadinessDecision,
      retentionEvidence: ProviderObservabilityRetentionEvidence,
    ): boolean {
      const issued = issuedByDecisionFingerprint.get(decision.decisionFingerprint);
      if (issued === undefined || issued.evaluatorIdentity !== evaluatorIdentity) return false;
      try {
        const candidate = bindingFrom(decision, retentionEvidence);
        return (
          candidate.evaluatorIdentity === evaluatorIdentity &&
          serializeDurableCanonicalJsonValue(candidate) ===
            serializeDurableCanonicalJsonValue(issued)
        );
      } catch {
        return false;
      }
    },
    count: () => issuedByDecisionFingerprint.size,
  });
}

function captureConfiguredTransportPolicyAuthority(
  config: unknown,
): ProductionProviderTransportPolicyAuthority {
  const descriptors = captureExactOwnEnumerableDataDescriptors(config, [
    "transportPolicyAuthority",
  ] as const);
  if (descriptors === null) {
    throw new TypeError("Production provider readiness evaluator configuration is invalid");
  }
  return captureProductionProviderTransportPolicyAuthority(
    descriptors.transportPolicyAuthority.value,
  );
}

async function verifyConfiguredProductionProviderReadinessDecision(
  input: {
    readonly decision: unknown;
    readonly authoritativeInput: EvaluateProductionProviderReadinessInput;
    readonly observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
  },
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
  observabilityRetentionMode: ObservabilityRetentionMode,
  retentionIssuanceRegistry: ProviderObservabilityRetentionIssuanceRegistry,
): Promise<Readonly<{ status: "valid" | "invalid"; reason: string | null }>> {
  let candidate: unknown;
  let authoritativeInput: CapturedInput;
  let observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
  try {
    const descriptors = captureExactOwnEnumerableDataDescriptors(input, [
      "authoritativeInput",
      "decision",
      "observabilityRetentionEvidence",
    ] as const);
    if (
      descriptors === null ||
      findDurableCanonicalJsonIssue(descriptors.decision.value) !== null ||
      findDurableCanonicalJsonIssue(descriptors.observabilityRetentionEvidence.value) !== null
    ) {
      return immutableCopy({ status: "invalid" as const, reason: "readiness_decision_invalid" });
    }
    candidate = immutableCopy(descriptors.decision.value);
    observabilityRetentionEvidence = immutableCopy(
      descriptors.observabilityRetentionEvidence
        .value as ProviderObservabilityRetentionEvidence | null,
    );
    authoritativeInput = capturePublicInput(
      descriptors.authoritativeInput.value as EvaluateProductionProviderReadinessInput,
      transportPolicyAuthority,
    );
    const parsedDecision = ProductionProviderReadinessDecisionSchema.safeParse(candidate);
    if (
      !parsedDecision.success ||
      parsedDecision.data.observabilityRetentionFingerprint !==
        (observabilityRetentionEvidence?.retentionFingerprint ?? null)
    ) {
      return immutableCopy({ status: "invalid" as const, reason: "readiness_decision_invalid" });
    }
    if (
      observabilityRetentionEvidence !== null &&
      !retentionIssuanceRegistry.containsExact(parsedDecision.data, observabilityRetentionEvidence)
    ) {
      return immutableCopy({
        status: "invalid" as const,
        reason: "readiness_decision_binding_mismatch",
      });
    }
  } catch {
    return immutableCopy({ status: "invalid" as const, reason: "readiness_decision_invalid" });
  }
  try {
    const expected = await evaluateCapturedProductionProviderReadiness(
      authoritativeInput,
      observabilityRetentionMode,
      undefined,
      observabilityRetentionEvidence,
      true,
    );
    return immutableCopy(
      verifyAuthoritativeReadinessDecision(candidate, expected.decision)
        ? { status: "valid" as const, reason: null }
        : { status: "invalid" as const, reason: "readiness_decision_binding_mismatch" },
    );
  } catch {
    return immutableCopy({ status: "invalid" as const, reason: "readiness_decision_invalid" });
  }
}

function createConfiguredProductionProviderReadinessEvaluator(
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
  observabilityRetentionMode: ObservabilityRetentionMode,
): ProductionProviderReadinessEvaluator {
  const appendAudit: ProviderObservabilityAppendAudit = { appendCount: 0 };
  const retentionIssuanceRegistry = createProviderObservabilityRetentionIssuanceRegistry();
  const evaluator: ProductionProviderReadinessEvaluator = Object.freeze({
    evaluate(input: EvaluateProductionProviderReadinessInput) {
      const capturedInput = capturePublicInput(input, transportPolicyAuthority);
      return evaluateCapturedProductionProviderReadiness(
        capturedInput,
        observabilityRetentionMode,
        undefined,
        undefined,
        false,
        appendAudit,
      ).then((evaluation) => {
        retentionIssuanceRegistry.issue(evaluation);
        return evaluation;
      });
    },
    verifyDecision(input: {
      readonly decision: unknown;
      readonly authoritativeInput: EvaluateProductionProviderReadinessInput;
      readonly observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
    }) {
      return verifyConfiguredProductionProviderReadinessDecision(
        input,
        transportPolicyAuthority,
        observabilityRetentionMode,
        retentionIssuanceRegistry,
      );
    },
  });
  evaluatorConfigurations.set(evaluator, {
    transportPolicyAuthority,
    observabilityRetentionMode,
    appendAudit,
    retentionIssuanceRegistry,
  });
  return evaluator;
}

export function createProductionProviderReadinessEvaluator(config: {
  readonly transportPolicyAuthority: ProductionProviderTransportPolicyAuthority;
}): ProductionProviderReadinessEvaluator {
  return createConfiguredProductionProviderReadinessEvaluator(
    captureConfiguredTransportPolicyAuthority(config),
    "normal",
  );
}

/** Direct-module deterministic failure seam. Intentionally absent from the package facade. */
export function createProductionProviderReadinessEvaluatorWithObservabilityRetentionFailureForTest(
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
  mode: Exclude<ObservabilityRetentionMode, "normal">,
): ProductionProviderReadinessEvaluator {
  if (mode !== "fail-append" && mode !== "insufficient-capacity") {
    throw new TypeError("Observability retention failure mode is invalid");
  }
  return createConfiguredProductionProviderReadinessEvaluator(
    captureProductionProviderTransportPolicyAuthority(transportPolicyAuthority),
    mode,
  );
}

/** Direct-module append audit seam. Intentionally absent from the package facade. */
export function getProductionProviderReadinessObservabilityAppendCountForTest(
  evaluator: ProductionProviderReadinessEvaluator,
): number {
  const configuration = evaluatorConfigurations.get(evaluator);
  if (configuration === undefined) {
    throw new TypeError("Production provider readiness evaluator is not configured");
  }
  return configuration.appendAudit.appendCount;
}

/** Direct-module bounded issuance audit seam. Intentionally absent from the package facade. */
export function getProductionProviderReadinessRetentionIssuanceStateForTest(
  evaluator: ProductionProviderReadinessEvaluator,
): Readonly<{
  capacity: number;
  count: number;
  evictionPolicy: typeof OBSERVABILITY_RETENTION_ISSUANCE_EVICTION_POLICY;
}> {
  const configuration = evaluatorConfigurations.get(evaluator);
  if (configuration === undefined) {
    throw new TypeError("Production provider readiness evaluator is not configured");
  }
  return immutableCopy({
    capacity: OBSERVABILITY_RETENTION_ISSUANCE_CAPACITY,
    count: configuration.retentionIssuanceRegistry.count(),
    evictionPolicy: OBSERVABILITY_RETENTION_ISSUANCE_EVICTION_POLICY,
  });
}

/** Direct-module test seam. Intentionally absent from the package facade. */
export async function evaluateProductionProviderReadinessWithDecisionCandidateForTest(
  evaluator: ProductionProviderReadinessEvaluator,
  input: {
    readonly readinessInput: EvaluateProductionProviderReadinessInput;
    readonly decisionCandidate: unknown;
  },
): Promise<ProductionProviderReadinessEvaluation> {
  const configuration = evaluatorConfigurations.get(evaluator);
  if (configuration === undefined) {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  const descriptors = captureExactOwnEnumerableDataDescriptors(input, [
    "decisionCandidate",
    "readinessInput",
  ] as const);
  if (
    descriptors === null ||
    findDurableCanonicalJsonIssue(descriptors.decisionCandidate.value) !== null
  ) {
    throw new ProductionProviderReadinessError("invalid_input", []);
  }
  const capturedInput = capturePublicInput(
    descriptors.readinessInput.value as EvaluateProductionProviderReadinessInput,
    configuration.transportPolicyAuthority,
  );
  const candidate = immutableCopy(descriptors.decisionCandidate.value);
  const evaluation = await evaluateCapturedProductionProviderReadiness(
    capturedInput,
    configuration.observabilityRetentionMode,
    candidate,
    undefined,
    false,
    configuration.appendAudit,
  );
  configuration.retentionIssuanceRegistry.issue(evaluation);
  return evaluation;
}
