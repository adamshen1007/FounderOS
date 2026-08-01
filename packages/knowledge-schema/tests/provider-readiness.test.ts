import { describe, expect, it } from "vitest";

import {
  AuthorizationDecisionEvidenceSchema,
  CircuitStateSchema,
  CostAndBudgetDecisionSchema,
  CredentialReferenceSchema,
  ObservabilityReadinessEvidenceSchema,
  ProviderObservabilityRetentionEvidenceSchema,
  PricingReferenceSchema,
  ProductionProviderAdapterDescriptorSchema,
  ProductionProviderReadinessDecisionSchema,
  ProviderHealthEvidenceSchema,
  ProviderPublicErrorSchema,
  ProviderRateAndCapacityDecisionSchema,
  ProviderRequestPlanSchema,
  ProviderResponseMappingEvidenceSchema,
  ProviderStructuredLogSchema,
  ProviderTransportPlanSchema,
  ProviderBoundedMetricSchema,
  ProviderBoundedTraceSchema,
  ProviderReadinessArtifactVerificationResultSchema,
  SecureTransportPolicySchema,
} from "../src/index.js";

const digest = "a".repeat(64);
const timestamp = "2026-07-30T01:00:00.000Z";

function adapter() {
  return {
    schemaVersion: "1.0" as const,
    adapterId: "adapter-evaluation-one",
    providerFamilyReference: "provider-family/evaluation",
    providerCapabilityId: "provider-capability-one",
    providerCapabilityFingerprint: digest,
    requestMappingVersion: "1.0" as const,
    responseMappingVersion: "1.0" as const,
    transportPolicyVersion: "1.0" as const,
    observabilityPolicyVersion: "1.0" as const,
    credentialReferenceClass: "evaluation-fixture-reference" as const,
    state: "dry-run-mapping" as const,
    adapterFingerprint: digest,
  };
}

function authorization() {
  return {
    schemaVersion: "1.0" as const,
    authorizationDecisionId: "authorization-one",
    subjectReference: "subject/founder-one",
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: digest,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: digest,
    contextPackageId: "context-package-one",
    contextPackageFingerprint: digest,
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    requestedOperation: "prepare-provider-request" as const,
    decisionAuthorityReference: "authority/provider-readiness",
    decidedAt: timestamp,
    expiresAt: "2026-07-30T02:00:00.000Z",
    outcome: "allowed" as const,
    reasonCodes: ["authorization_allowed" as const],
    decisionFingerprint: digest,
  };
}

function credential() {
  return {
    schemaVersion: "1.0" as const,
    credentialReferenceId: "credential-reference-one",
    providerFamilyReference: "provider-family/evaluation",
    secretStoreClass: "external-secret-store",
    scopeReference: "scope/reasoning-dry-run",
    environmentClass: "evaluation" as const,
    rotationVersion: "rotation-v1",
    availability: "available" as const,
    referenceFingerprint: digest,
  };
}

function policy() {
  return {
    schemaVersion: "1.0" as const,
    transportPolicyId: "transport-policy-one",
    providerFamilyReference: "provider-family/evaluation",
    allowedScheme: "https" as const,
    allowedHostnames: ["api.example-provider.test"],
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
    policyFingerprint: digest,
  };
}

function transportPlan() {
  const value = policy();
  return {
    schemaVersion: "1.0" as const,
    transportPlanId: "transport-plan-one",
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    transportPolicyId: value.transportPolicyId,
    transportPolicyFingerprint: digest,
    providerFamilyReference: value.providerFamilyReference,
    scheme: "https" as const,
    hostname: value.allowedHostnames[0]!,
    port: 443,
    dnsResolutionPolicy: value.dnsResolutionPolicy,
    redirectPolicy: value.redirectPolicy,
    tlsRequired: true as const,
    minimumTlsVersion: value.minimumTlsVersion,
    certificateValidationPolicy: value.certificateValidationPolicy,
    connectionTimeoutMilliseconds: value.connectionTimeoutMilliseconds,
    requestTimeoutMilliseconds: value.requestTimeoutMilliseconds,
    maximumRequestBytes: value.maximumRequestBytes,
    maximumResponseBytes: value.maximumResponseBytes,
    retryTransportPolicy: value.retryTransportPolicy,
    proxyPolicy: value.proxyPolicy,
    egressClassification: value.egressClassification,
    status: "validated-dry-run" as const,
    reasonCodes: ["transport_plan_valid" as const],
    planFingerprint: digest,
  };
}

function requestPlan() {
  return {
    schemaVersion: "1.0" as const,
    requestPlanId: "request-plan-one",
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    providerCapabilityId: "provider-capability-one",
    providerCapabilityFingerprint: digest,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: digest,
    authorizationDecisionFingerprint: digest,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    transportPolicyId: "transport-policy-one",
    transportPolicyFingerprint: digest,
    rateAndCapacityDecisionFingerprint: digest,
    costAndBudgetDecisionFingerprint: digest,
    logicalEndpointClassification: "reasoning-evaluation" as const,
    methodClassification: "provider-request-post" as const,
    redactedHeaderPlan: [
      {
        headerClassification: "content-type" as const,
        valueClassification: "canonical-json" as const,
      },
      {
        headerClassification: "request-correlation" as const,
        valueClassification: "logical-identifier" as const,
      },
    ],
    bodyMappingEvidence: {
      contentType: "provider-neutral-instruction-blocks-v1" as const,
      instructionBlockCount: 2,
      contextReferenceIncluded: true as const,
      hiddenContextIncluded: false as const,
      toolDefinitionsIncluded: false as const,
      functionCallsIncluded: false as const,
      mappingFingerprint: digest,
    },
    inputSizeEvidence: {
      inputCharacterCount: 500,
      maximumInputCharacters: 2_000,
      withinLimit: true as const,
    },
    timeoutAndCancellationPlan: {
      timeoutMilliseconds: 5_000,
      cancellationMode: "deadline-cancellation" as const,
    },
    expectedResponseConstraints: {
      contentType: "canonical-text" as const,
      maximumResponseBytes: 40_000,
      maximumOutputCharacters: 2_000,
      requireNonEmpty: true,
    },
    warnings: [],
    requestPlanFingerprint: digest,
  };
}

function responseMapping() {
  return {
    schemaVersion: "1.0" as const,
    mappingEvidenceId: "response-mapping-one",
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    requestPlanId: "request-plan-one",
    requestPlanFingerprint: digest,
    fixtureClassification: "successful-response" as const,
    outcome: "succeeded" as const,
    evidenceReferences: [
      {
        evidenceType: "execution-outcome" as const,
        evidenceId: "outcome-one",
        fingerprint: digest,
      },
      {
        evidenceType: "execution-receipt" as const,
        evidenceId: "receipt-one",
        fingerprint: digest,
      },
    ],
    sanitizedMetadata: {
      outcomeClassification: "success" as const,
      durationMilliseconds: 100,
      responseSizeBytes: 500,
      usageStatus: "provider-reported" as const,
      costStatus: "estimated" as const,
    },
    providerResponseReferenceFingerprint: digest,
    mappingEvidenceFingerprint: digest,
  };
}

function rateDecision() {
  return {
    schemaVersion: "1.0" as const,
    decisionId: "rate-decision-one",
    invocationRequestFingerprint: digest,
    adapterFingerprint: digest,
    capacityPolicyVersion: "1.0" as const,
    evaluatedAt: timestamp,
    windowStartedAt: timestamp,
    windowDurationMilliseconds: 60_000,
    requestsInWindow: 1,
    requestLimit: 10,
    concurrentInFlight: 0,
    concurrentLimit: 2,
    queuedRequests: 0,
    maximumQueuedRequests: 3,
    consumerQuotaUsed: 1,
    consumerQuotaLimit: 20,
    providerCapacityState: "available" as const,
    priorityClass: "normal" as const,
    retryAfterMilliseconds: null,
    outcome: "admitted" as const,
    reasonCodes: ["admitted" as const],
    decisionFingerprint: digest,
  };
}

function pricing() {
  return {
    schemaVersion: "1.0" as const,
    pricingReferenceId: "pricing-reference-one",
    providerFamilyReference: "provider-family/evaluation",
    pricingVersion: "pricing-v1",
    currencyCode: "USD",
    inputUnitSize: 1_000,
    inputUnitPriceMinorUnits: 2,
    outputUnitSize: 1_000,
    outputUnitPriceMinorUnits: 4,
    availability: "available" as const,
    effectiveAt: timestamp,
    pricingFingerprint: digest,
  };
}

function costDecision() {
  return {
    schemaVersion: "1.0" as const,
    decisionId: "cost-decision-one",
    invocationRequestFingerprint: digest,
    adapterFingerprint: digest,
    pricingReferenceId: "pricing-reference-one",
    pricingReferenceFingerprint: digest,
    pricingReferenceVersion: "pricing-v1",
    budgetPolicyVersion: "1.0" as const,
    budgetReference: "budget/project-one",
    currencyCode: "USD",
    estimatedInputUnits: 1_000,
    maximumInputUnits: 2_000,
    estimatedOutputUnits: 1_000,
    maximumOutputUnits: 2_000,
    estimatedMaximumCostMinorUnits: 6,
    costCeilingMinorUnits: 20,
    maximumAttemptCount: 1,
    timeoutBudgetMilliseconds: 5_000,
    evaluatedAt: timestamp,
    outcome: "within-budget" as const,
    reasonCodes: ["within_budget" as const],
    decisionFingerprint: digest,
  };
}

function circuit() {
  return {
    schemaVersion: "1.0" as const,
    circuitStateId: "circuit-state-one",
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    state: "closed" as const,
    previousState: null,
    transitionReason: "initial_state" as const,
    failureWindowEvidence: {
      windowStartedAt: timestamp,
      evaluatedAt: timestamp,
      totalFailureCount: 0,
      failureCounts: [],
      evidenceFingerprint: digest,
    },
    thresholdPolicy: {
      failureThreshold: 3,
      windowDurationMilliseconds: 60_000,
      openDurationMilliseconds: 30_000,
      halfOpenMaximumProbeCount: 1,
      securityViolationQuarantines: true,
      policyFingerprint: digest,
    },
    openedAt: null,
    nextEvaluationAt: null,
    probeAllowance: {
      maximumProbeCount: 0,
      remainingProbeCount: 0,
      dryRunProbePermitted: false,
    },
    evaluatedAt: timestamp,
    reasonCodes: ["circuit_closed" as const],
    stateFingerprint: digest,
  };
}

function health() {
  return {
    schemaVersion: "1.0" as const,
    healthEvidenceId: "health-evidence-one",
    adapterId: "adapter-evaluation-one",
    adapterFingerprint: digest,
    healthState: "healthy" as const,
    circuitState: "closed" as const,
    circuitStateFingerprint: digest,
    credentialReferenceAvailability: "available" as const,
    authorizationReadiness: "ready" as const,
    transportPolicyReadiness: "ready" as const,
    rateAndCapacityReadiness: "ready" as const,
    costReadiness: "ready" as const,
    observabilityReadiness: "ready" as const,
    lastEvaluatedAt: timestamp,
    reasonCodes: ["healthy" as const],
    healthFingerprint: digest,
  };
}

describe("Milestone 14 provider-readiness contracts", () => {
  it("reserves one safe integer byte for deterministic oversized response evidence", () => {
    expect(
      SecureTransportPolicySchema.safeParse({
        ...policy(),
        maximumResponseBytes: Number.MAX_SAFE_INTEGER - 1,
      }).success,
    ).toBe(true);
    expect(
      SecureTransportPolicySchema.safeParse({
        ...policy(),
        maximumResponseBytes: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(false);
  });
  it("accepts strict Adapter, Authorization, Credential, and Transport contracts", () => {
    expect(ProductionProviderAdapterDescriptorSchema.parse(adapter())).toEqual(adapter());
    expect(AuthorizationDecisionEvidenceSchema.parse(authorization())).toEqual(authorization());
    expect(CredentialReferenceSchema.parse(credential())).toEqual(credential());
    expect(SecureTransportPolicySchema.parse(policy())).toEqual(policy());
    expect(ProviderTransportPlanSchema.parse(transportPlan())).toEqual(transportPlan());
  });

  it("accepts strict mapping, admission, Circuit, and Health contracts", () => {
    expect(ProviderRequestPlanSchema.parse(requestPlan())).toEqual(requestPlan());
    expect(ProviderResponseMappingEvidenceSchema.safeParse(responseMapping()).success).toBe(true);
    expect(
      ProviderResponseMappingEvidenceSchema.safeParse({
        schemaVersion: "1.0",
        mappingEvidenceId: "response-mapping-one",
        adapterId: "adapter-evaluation-one",
        adapterFingerprint: digest,
        requestPlanId: "request-plan-one",
        requestPlanFingerprint: digest,
        fixtureClassification: "successful-response",
        outcome: "succeeded",
        evidenceReferences: [],
        sanitizedMetadata: {
          outcomeClassification: "success",
          durationMilliseconds: 100,
          responseSizeBytes: 500,
          usageStatus: "provider-reported",
          costStatus: "estimated",
        },
        providerResponseReferenceFingerprint: digest,
        mappingEvidenceFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(ProviderRateAndCapacityDecisionSchema.parse(rateDecision())).toEqual(rateDecision());
    expect(PricingReferenceSchema.parse(pricing())).toEqual(pricing());
    expect(CostAndBudgetDecisionSchema.parse(costDecision())).toEqual(costDecision());
    expect(CircuitStateSchema.parse(circuit())).toEqual(circuit());
    expect(ProviderHealthEvidenceSchema.parse(health())).toEqual(health());
  });

  it("accepts bounded, redacted Observability contracts", () => {
    const log = {
      schemaVersion: "1.0" as const,
      logEventId: "log-event-one",
      occurredAt: timestamp,
      level: "info" as const,
      eventType: "provider-readiness-evaluated" as const,
      correlationId: "correlation-one",
      deliveryTransactionId: "delivery-transaction-one",
      adapterId: "adapter-evaluation-one",
      requestPlanFingerprint: digest,
      outcomeClassification: "ready-for-dry-run" as const,
      durationMilliseconds: 100,
      rateLimitStatus: "admitted" as const,
      circuitState: "closed" as const,
      retryCount: 0,
      logFingerprint: digest,
    };
    const metric = {
      schemaVersion: "1.0" as const,
      metricId: "metric-one",
      metricName: "provider_readiness_evaluation_total" as const,
      value: 1,
      unit: "count" as const,
      labels: [
        { name: "adapter_class" as const, value: "evaluation" },
        { name: "outcome" as const, value: "ready-for-dry-run" },
      ],
      observedAt: timestamp,
      metricFingerprint: digest,
    };
    const trace = {
      schemaVersion: "1.0" as const,
      traceEvidenceId: "trace-evidence-one",
      traceId: "trace-one",
      spanId: "span-one",
      operation: "evaluate-provider-readiness" as const,
      status: "ok" as const,
      startedAt: timestamp,
      endedAt: "2026-07-30T01:00:00.100Z",
      attributes: [
        { name: "adapter_class" as const, value: "evaluation" },
        { name: "outcome" as const, value: "ready-for-dry-run" },
      ],
      traceFingerprint: digest,
    };
    const publicError = {
      schemaVersion: "1.0" as const,
      errorId: "public-error-one",
      correlationId: "correlation-one",
      category: "policy" as const,
      code: "provider_not_ready" as const,
      message: "Provider readiness requirements were not satisfied",
      retryable: false,
      errorFingerprint: digest,
    };
    expect(ProviderStructuredLogSchema.parse(log)).toEqual(log);
    const { requestPlanFingerprint: _requestPlanFingerprint, ...prePlanLog } = log;
    void _requestPlanFingerprint;
    expect(ProviderStructuredLogSchema.parse(prePlanLog)).toEqual(prePlanLog);
    expect(
      ProviderStructuredLogSchema.safeParse({
        ...prePlanLog,
        requestPlanFingerprint: undefined,
      }).success,
    ).toBe(false);
    expect(
      ProviderStructuredLogSchema.safeParse({ ...log, errorCategory: undefined }).success,
    ).toBe(false);
    expect(ProviderBoundedMetricSchema.parse(metric)).toEqual(metric);
    expect(ProviderBoundedTraceSchema.parse(trace)).toEqual(trace);
    expect(ProviderPublicErrorSchema.parse(publicError)).toEqual(publicError);
    expect(
      ObservabilityReadinessEvidenceSchema.safeParse({
        schemaVersion: "1.0",
        readinessEvidenceId: "observability-readiness-one",
        adapterId: "adapter-evaluation-one",
        adapterFingerprint: digest,
        redactionPolicyVersion: "1.0",
        maximumLogFieldCharacters: 256,
        maximumTraceAttributeCharacters: 128,
        maximumMetricLabelCount: 8,
        structuredLogFingerprint: digest,
        metricFingerprints: [digest],
        traceFingerprints: [digest],
        publicErrorFingerprints: [digest],
        status: "ready",
        reasonCodes: ["observability_ready"],
        evaluatedAt: timestamp,
        readinessFingerprint: digest,
      }).success,
    ).toBe(true);
  });

  it("accepts final Readiness and independent Verification evidence", () => {
    const readiness = {
      schemaVersion: "1.0" as const,
      readinessDecisionId: "readiness-decision-one",
      adapterId: "adapter-evaluation-one",
      adapterFingerprint: digest,
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      authorizationDecisionFingerprint: digest,
      credentialReferenceFingerprint: digest,
      capabilityResultFingerprint: digest,
      transportPolicyFingerprint: digest,
      requestPlanFingerprint: digest,
      rateAndCapacityDecisionFingerprint: digest,
      costAndBudgetDecisionFingerprint: digest,
      circuitStateFingerprint: digest,
      healthEvidenceFingerprint: digest,
      observabilityReadinessFingerprint: digest,
      observabilityRetentionFingerprint: digest,
      evaluatedAt: timestamp,
      status: "ready-for-dry-run" as const,
      blockingReasonCodes: [],
      warningReasonCodes: [],
      decisionFingerprint: digest,
    };
    expect(ProductionProviderReadinessDecisionSchema.parse(readiness)).toEqual(readiness);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...readiness,
        authorizationDecisionFingerprint: digest,
        credentialReferenceFingerprint: null,
        capabilityResultFingerprint: null,
        transportPolicyFingerprint: null,
        requestPlanFingerprint: null,
        rateAndCapacityDecisionFingerprint: null,
        costAndBudgetDecisionFingerprint: null,
        circuitStateFingerprint: null,
        healthEvidenceFingerprint: null,
        observabilityReadinessFingerprint: null,
        observabilityRetentionFingerprint: null,
        status: "not-ready",
        blockingReasonCodes: ["authorization_not_allowed"],
      }).success,
    ).toBe(true);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...readiness,
        credentialReferenceFingerprint: null,
      }).success,
    ).toBe(false);
    expect(
      ProviderReadinessArtifactVerificationResultSchema.safeParse({
        schemaVersion: "1.0",
        artifactType: "production-provider-readiness-decision",
        status: "valid",
        fingerprint: digest,
        issues: [],
      }).success,
    ).toBe(true);
  });

  it("accepts only exact canonical observability retention evidence", () => {
    const retention = {
      schemaVersion: "1.0" as const,
      retentionEvidenceId: "retention-evidence-one",
      adapterId: "adapter-evaluation-one",
      adapterFingerprint: digest,
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      observabilityReadinessEvidenceId: "observability-readiness-one",
      observabilityReadinessFingerprint: digest,
      sinkPolicyVersion: "1.0" as const,
      maximumEntriesPerArtifact: 2,
      maximumMetricLabelCardinality: 16,
      retainedLogCount: 1,
      retainedMetricCount: 2,
      retainedTraceCount: 1,
      retainedPublicErrorCount: 1,
      retainedLogFingerprints: ["b".repeat(64)],
      retainedMetricFingerprints: ["c".repeat(64), "d".repeat(64)],
      retainedTraceFingerprints: ["e".repeat(64)],
      retainedPublicErrorFingerprints: ["f".repeat(64)],
      canonicalSnapshotFingerprint: "1".repeat(64),
      appendCount: 1 as const,
      retentionFingerprint: "2".repeat(64),
    };
    expect(ProviderObservabilityRetentionEvidenceSchema.parse(retention)).toEqual(retention);
    for (const mutation of [
      { ...retention, appendCount: 2 },
      { ...retention, maximumEntriesPerArtifact: 1 },
      { ...retention, retainedMetricCount: 1 },
      { ...retention, retainedMetricFingerprints: ["c".repeat(64), "c".repeat(64)] },
      { ...retention, unknown: true },
      { ...retention, retentionEvidenceId: "/Users/example/retention" },
      { ...retention, retentionEvidenceId: "api_key=sk_live_123456789" },
    ]) {
      expect(ProviderObservabilityRetentionEvidenceSchema.safeParse(mutation).success).toBe(false);
    }

    let accessed = false;
    const accessor = { ...retention };
    Object.defineProperty(accessor, "retentionFingerprint", {
      enumerable: true,
      get() {
        accessed = true;
        return "2".repeat(64);
      },
    });
    expect(ProviderObservabilityRetentionEvidenceSchema.safeParse(accessor).success).toBe(false);
    expect(accessed).toBe(false);
    expect(
      ProviderObservabilityRetentionEvidenceSchema.safeParse(
        Object.assign({ ...retention }, { [Symbol("hidden")]: true }),
      ).success,
    ).toBe(false);
  });

  it("enforces every blocker-specific fingerprint boundary and exact special status", () => {
    const fingerprintFields = [
      "authorizationDecisionFingerprint",
      "credentialReferenceFingerprint",
      "capabilityResultFingerprint",
      "transportPolicyFingerprint",
      "rateAndCapacityDecisionFingerprint",
      "costAndBudgetDecisionFingerprint",
      "circuitStateFingerprint",
      "observabilityReadinessFingerprint",
      "observabilityRetentionFingerprint",
      "healthEvidenceFingerprint",
      "requestPlanFingerprint",
    ] as const;
    const base = {
      schemaVersion: "1.0" as const,
      readinessDecisionId: "readiness-boundary-one",
      adapterId: "adapter-one",
      adapterFingerprint: digest,
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      authorizationDecisionFingerprint: null,
      credentialReferenceFingerprint: null,
      capabilityResultFingerprint: null,
      transportPolicyFingerprint: null,
      requestPlanFingerprint: null,
      rateAndCapacityDecisionFingerprint: null,
      costAndBudgetDecisionFingerprint: null,
      circuitStateFingerprint: null,
      healthEvidenceFingerprint: null,
      observabilityReadinessFingerprint: null,
      observabilityRetentionFingerprint: null,
      evaluatedAt: timestamp,
      status: "not-ready" as const,
      blockingReasonCodes: ["authorization_not_allowed"] as const,
      warningReasonCodes: [],
      decisionFingerprint: digest,
    };
    const cases = [
      ["authorization_not_allowed", 0, 1],
      ["adapter_invalid", 1, 1],
      ["credential_unavailable", 1, 2],
      ["capability_incompatible", 3, 3],
      ["transport_policy_rejected", 3, 3],
      ["rate_capacity_rejected", 4, 5],
      ["cost_budget_rejected", 5, 6],
      ["circuit_not_ready", 6, 7],
      ["observability_not_ready", 7, 7],
      ["health_not_ready", 9, 10],
      ["request_mapping_invalid", 10, 10],
    ] as const;
    for (const [blocker, requiredCount, forbiddenFrom] of cases) {
      const valid = { ...base, blockingReasonCodes: [blocker] } as Record<string, unknown>;
      for (let index = 0; index < requiredCount; index += 1) {
        valid[fingerprintFields[index]!] = digest;
      }
      expect(
        ProductionProviderReadinessDecisionSchema.safeParse(valid).success,
        `${blocker}: exact prefix`,
      ).toBe(true);

      const downstreamPopulated = {
        ...valid,
        [fingerprintFields[forbiddenFrom]!]: digest,
      };
      expect(
        ProductionProviderReadinessDecisionSchema.safeParse(downstreamPopulated).success,
        `${blocker}: downstream populated`,
      ).toBe(false);

      const missingRequiredPrefix = { ...valid };
      if (requiredCount > 0) {
        missingRequiredPrefix[fingerprintFields[requiredCount - 1]!] = null;
      } else {
        missingRequiredPrefix[fingerprintFields[1]!] = digest;
      }
      expect(
        ProductionProviderReadinessDecisionSchema.safeParse(missingRequiredPrefix).success,
        `${blocker}: missing required prefix`,
      ).toBe(false);
    }
    const validDisabled = {
      ...base,
      authorizationDecisionFingerprint: digest,
      status: "disabled-by-policy",
      blockingReasonCodes: ["adapter_disabled"],
    };
    expect(ProductionProviderReadinessDecisionSchema.safeParse(validDisabled).success).toBe(true);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...validDisabled,
        credentialReferenceFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...validDisabled,
        authorizationDecisionFingerprint: null,
      }).success,
    ).toBe(false);

    const validNotAssessed = {
      ...base,
      status: "not-assessed",
      blockingReasonCodes: ["not_assessed"],
    };
    expect(ProductionProviderReadinessDecisionSchema.safeParse(validNotAssessed).success).toBe(
      true,
    );
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...validNotAssessed,
        authorizationDecisionFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...validNotAssessed,
        status: "not-assessed",
        blockingReasonCodes: [],
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported versions, executable states, URLs, unknown fields, and malformed IDs or digests", () => {
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse({ ...adapter(), state: "enabled" })
        .success,
    ).toBe(false);
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse({ ...adapter(), schemaVersion: "2.0" })
        .success,
    ).toBe(false);
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse({
        ...adapter(),
        endpoint: "https://provider.example",
      }).success,
    ).toBe(false);
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse({ ...adapter(), adapterId: " adapter " })
        .success,
    ).toBe(false);
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse({
        ...adapter(),
        adapterFingerprint: "forged",
      }).success,
    ).toBe(false);
    expect(
      ProductionProviderReadinessDecisionSchema.safeParse({
        ...ProductionProviderReadinessDecisionSchema.parse({
          schemaVersion: "1.0",
          readinessDecisionId: "decision-one",
          adapterId: "adapter-one",
          adapterFingerprint: digest,
          invocationRequestId: "invocation-one",
          invocationRequestFingerprint: digest,
          authorizationDecisionFingerprint: digest,
          credentialReferenceFingerprint: digest,
          capabilityResultFingerprint: digest,
          transportPolicyFingerprint: digest,
          requestPlanFingerprint: digest,
          rateAndCapacityDecisionFingerprint: digest,
          costAndBudgetDecisionFingerprint: digest,
          circuitStateFingerprint: digest,
          healthEvidenceFingerprint: digest,
          observabilityReadinessFingerprint: digest,
          observabilityRetentionFingerprint: digest,
          evaluatedAt: timestamp,
          status: "ready-for-dry-run",
          blockingReasonCodes: [],
          warningReasonCodes: [],
          decisionFingerprint: digest,
        }),
        status: "ready-for-live-traffic",
      }).success,
    ).toBe(false);
  });

  it("rejects explicit undefined, accessors without execution, physical paths, and secret material recursively", () => {
    expect(
      CredentialReferenceSchema.safeParse({ ...credential(), rawSecret: undefined }).success,
    ).toBe(false);
    let accessed = false;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "schemaVersion", {
      enumerable: true,
      get() {
        accessed = true;
        return "1.0";
      },
    });
    expect(AuthorizationDecisionEvidenceSchema.safeParse(accessor).success).toBe(false);
    expect(accessed).toBe(false);
    expect(
      ProductionProviderAdapterDescriptorSchema.safeParse(
        Object.assign(Object.create({ inherited: true }), adapter()),
      ).success,
    ).toBe(false);
    expect(
      CredentialReferenceSchema.safeParse({
        ...credential(),
        scopeReference: "/Users/example/.secrets",
      }).success,
    ).toBe(false);
    expect(
      CredentialReferenceSchema.safeParse({
        ...credential(),
        rotationVersion: "api_key=sk_live_123456789",
      }).success,
    ).toBe(false);
    expect(
      ProviderResponseMappingEvidenceSchema.safeParse({
        schemaVersion: "1.0",
        mappingEvidenceId: "mapping-one",
        adapterId: "adapter-one",
        adapterFingerprint: digest,
        requestPlanId: "plan-one",
        requestPlanFingerprint: digest,
        fixtureClassification: "successful-response",
        outcome: "succeeded",
        evidenceReferences: [],
        sanitizedMetadata: {
          outcomeClassification: "success",
          durationMilliseconds: 1,
          responseSizeBytes: 1,
          usageStatus: "unavailable",
          costStatus: "unavailable",
          authorization: "Bearer sk_live_123456",
        },
        providerResponseReferenceFingerprint: digest,
        mappingEvidenceFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      ProviderPublicErrorSchema.safeParse({
        schemaVersion: "1.0",
        errorId: "public-error-one",
        correlationId: "correlation-one",
        category: "credential",
        code: "provider_policy_rejected",
        message: "Bearer sk_live_123456789",
        retryable: false,
        errorFingerprint: digest,
      }).success,
    ).toBe(false);
  });

  it("rejects executable endpoint or payload shapes and unstable arrays", () => {
    expect(
      SecureTransportPolicySchema.safeParse({ ...policy(), allowedHostnames: ["127.0.0.1"] })
        .success,
    ).toBe(false);
    expect(
      SecureTransportPolicySchema.safeParse({ ...policy(), allowedScheme: "http" }).success,
    ).toBe(false);
    expect(
      SecureTransportPolicySchema.safeParse({
        ...policy(),
        allowedHostnames: ["z.example.test", "a.example.test"],
      }).success,
    ).toBe(false);
    expect(
      SecureTransportPolicySchema.safeParse({ ...policy(), allowedPorts: [443, 443] }).success,
    ).toBe(false);
    expect(
      ProviderRequestPlanSchema.safeParse({ ...requestPlan(), url: "https://provider.example" })
        .success,
    ).toBe(false);
    expect(ProviderRequestPlanSchema.safeParse({ ...requestPlan(), tools: [] }).success).toBe(
      false,
    );
    expect(
      ProviderRequestPlanSchema.safeParse({
        ...requestPlan(),
        redactedHeaderPlan: [...requestPlan().redactedHeaderPlan].reverse(),
      }).success,
    ).toBe(false);
  });

  it.each(["provider-rate-limit", "credential-rejection", "transport-security-failure"] as const)(
    "rejects %s fixtures that claim a successful outcome",
    (fixtureClassification) => {
      expect(
        ProviderResponseMappingEvidenceSchema.safeParse({
          ...responseMapping(),
          fixtureClassification,
        }).success,
      ).toBe(false);
    },
  );

  it("enforces fixture-specific Response Mapping evidence", () => {
    expect(
      ProviderResponseMappingEvidenceSchema.safeParse({
        ...responseMapping(),
        fixtureClassification: "provider-timeout",
        outcome: "timed-out",
        sanitizedMetadata: {
          ...responseMapping().sanitizedMetadata,
          outcomeClassification: "timeout",
        },
      }).success,
    ).toBe(false);
    expect(
      ProviderResponseMappingEvidenceSchema.safeParse({
        ...responseMapping(),
        fixtureClassification: "provider-rate-limit",
        outcome: "failed",
        sanitizedMetadata: {
          ...responseMapping().sanitizedMetadata,
          outcomeClassification: "failure",
        },
        evidenceReferences: [
          ...responseMapping().evidenceReferences,
          { evidenceType: "failure-evidence", evidenceId: "failure-one", fingerprint: digest },
        ],
      }).success,
    ).toBe(false);
  });

  it("bounds Circuit probe allowances by policy and enforces open-state chronology", () => {
    const halfOpen = {
      ...circuit(),
      state: "half-open" as const,
      previousState: "open" as const,
      transitionReason: "open_period_elapsed" as const,
      openedAt: timestamp,
      nextEvaluationAt: "2026-07-30T01:02:00.000Z",
      probeAllowance: {
        maximumProbeCount: 1,
        remainingProbeCount: 1,
        dryRunProbePermitted: true,
      },
      evaluatedAt: "2026-07-30T01:01:00.000Z",
      reasonCodes: ["circuit_half_open" as const],
    };
    expect(CircuitStateSchema.safeParse(halfOpen).success).toBe(true);
    expect(
      CircuitStateSchema.safeParse({
        ...halfOpen,
        probeAllowance: { ...halfOpen.probeAllowance, maximumProbeCount: 2 },
      }).success,
    ).toBe(false);
    expect(
      CircuitStateSchema.safeParse({
        ...halfOpen,
        openedAt: "2026-07-30T01:03:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      CircuitStateSchema.safeParse({
        ...halfOpen,
        nextEvaluationAt: "2026-07-30T00:59:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      CircuitStateSchema.safeParse({
        ...halfOpen,
        evaluatedAt: "2026-07-30T01:03:00.000Z",
      }).success,
    ).toBe(false);
  });
});
