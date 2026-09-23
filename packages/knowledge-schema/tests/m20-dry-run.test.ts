import { describe, expect, it } from "vitest";

type RuntimeSchema = {
  parse(value: unknown): unknown;
  safeParse(value: unknown): { success: boolean };
  options?: readonly string[];
};

const digest = "a".repeat(64);
const digestB = "b".repeat(64);
const evaluatedAt = "2026-09-10T10:00:00.000Z";
const rehearsalEvaluatedAt = "2026-09-10T10:01:00.000Z";

async function contracts(): Promise<Record<string, unknown>> {
  return import("../src/index.js") as Promise<Record<string, unknown>>;
}

function schema(module: Record<string, unknown>, name: string): RuntimeSchema {
  const candidate = module[name] as RuntimeSchema | undefined;
  expect(candidate, `${name} must be exported`).toBeDefined();
  return candidate!;
}

function limits() {
  return {
    maximumInputBytes: 20_000,
    maximumOutputBytes: 40_000,
    maximumInputTokens: 4_000,
    maximumOutputTokens: 2_000,
    timeoutMilliseconds: 5_000,
    maximumAttempts: 1,
    maximumRequestsPerMinute: 10,
    maximumConcurrentRequests: 1,
    maximumCostMinorUnits: 25,
    currencyCode: "USD",
  };
}

function authorizationRequest() {
  return {
    schemaVersion: "1.0",
    authorizationRequestId: "authorization-request-one",
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: digest,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: digest,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: digest,
    contextPackageId: "context-package-one",
    contextPackageFingerprint: digest,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    adapterId: "adapter-one",
    adapterFingerprint: digest,
    providerFamilyReference: "provider-family/openai",
    operation: "founder-decision-memo",
    processingTier: "default",
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: digest,
    executionInstructionProfileReference: "instruction-profile/founder-memo",
    executionInstructionProfileFingerprint: digest,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    credentialRotationVersion: "rotation-v1",
    environmentClass: "evaluation",
    dataClassification: "internal",
    purpose: "Create the governed founder decision memo",
    limits: limits(),
    requestedAt: evaluatedAt,
    requestFingerprint: digest,
  };
}

function serviceIdentityEvidence() {
  return {
    schemaVersion: "1.0",
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    subjectReference: "subject/founder-service",
    workloadIdentityReference: "workload/founder-memo-service",
    issuerReference: "identity-authority/evaluation",
    assuranceProfileReference: "assurance/workload-verified",
    environmentClass: "evaluation",
    audienceReference: "audience/founderos-authorization",
    issuedAt: "2026-09-10T09:55:00.000Z",
    notBefore: "2026-09-10T09:55:00.000Z",
    expiresAt: "2026-09-10T11:00:00.000Z",
    revocationVersion: 0,
    revocationState: "active",
    issuerProofReference: "proof/service-identity-one",
    evidenceFingerprint: digest,
  };
}

function humanApprovalEvidence() {
  return {
    schemaVersion: "1.0",
    approvalEvidenceId: "human-approval-one",
    approverReference: "human-approver/founder-one",
    approvalAuthorityReference: "approval-authority/founderos",
    authorizationRequestId: "authorization-request-one",
    authorizationRequestFingerprint: digest,
    purpose: "Create the governed founder decision memo",
    operation: "founder-decision-memo",
    environmentClass: "evaluation",
    maximumDataClassification: "internal",
    approvedLimits: limits(),
    issuedAt: "2026-09-10T09:58:00.000Z",
    expiresAt: "2026-09-10T10:30:00.000Z",
    outcome: "allowed",
    reasonCodes: ["human_approval_allowed"],
    proofReference: "proof/human-approval-one",
    evidenceFingerprint: digest,
  };
}

function credentialResolutionRequest() {
  return {
    schemaVersion: "1.0",
    resolutionRequestId: "resolution-request-one",
    authorizationDecisionId: "authorization-decision-one",
    authorizationDecisionFingerprint: digest,
    authorizationClaimId: "authorization-claim-one",
    authorizationClaimFingerprint: digestB,
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: digest,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    deliveryTransactionId: "delivery-transaction-one",
    contextPackageId: "context-package-one",
    invocationRequestId: "invocation-one",
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    adapterFingerprint: digest,
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    expectedRotationVersion: "rotation-v1",
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt,
    resolutionDeadline: "2026-09-10T10:05:00.000Z",
    requestFingerprint: digestB,
  };
}

function dryRunRequest() {
  return {
    schemaVersion: "1.0",
    runId: "m20-run-one",
    scenarioId: "scenario-success",
    scenarioFingerprint: digest,
    catalogFingerprint: digestB,
    evaluatedAt,
    rehearsalEvaluatedAt,
    authorizationRequest: authorizationRequest(),
    serviceIdentityEvidence: serviceIdentityEvidence(),
    humanApprovalEvidence: humanApprovalEvidence(),
    authorizationDecisionId: "authorization-decision-one",
    authorizationDecisionExpiresAt: "2026-09-10T10:30:00.000Z",
    authorizationClaimId: "authorization-claim-one",
    preparationId: "preparation-one",
    requestPlanId: "request-plan-one",
    credentialResolutionRequest: credentialResolutionRequest(),
    finalControlSnapshotId: "snapshot-one",
    rehearsalEvidenceId: "rehearsal-one",
    requestFingerprint: digest,
  };
}

function fault(id = "fault-one", fixture = "fixture/fault-one") {
  return {
    schemaVersion: "1.0",
    faultId: id,
    faultKind: "authorization-issuance-denied",
    injectionStage: "authorization-issued",
    affectedBoundary: "m17-issuance",
    fixtureReference: fixture,
    faultFingerprint: digest,
  };
}

function counts(
  authorizationIssuanceCalls = 1,
  authorizationClaimCalls = 1,
  authorizationVerificationCalls = 2,
  m19PreparationCalls = 1,
  finalControlIssuanceCalls = 1,
  finalControlVerificationCalls = 1,
) {
  return {
    authorizationIssuanceCalls,
    authorizationClaimCalls,
    authorizationVerificationCalls,
    m19PreparationCalls,
    finalControlIssuanceCalls,
    finalControlVerificationCalls,
  };
}

const successStages = [
  "request-accepted",
  "scenario-authority-verified",
  "authorization-issued",
  "authorization-claimed",
  "preparation-started",
  "preparation-disabled-bound",
  "final-control-rehearsal-complete",
  "no-network-verified",
] as const;

function scenario() {
  return {
    schemaVersion: "1.0",
    scenarioId: "scenario-success",
    scenarioVersion: "scenario-version-one",
    catalogVersion: "m20-scenario-catalog-v1",
    purpose: "success",
    expectedOwnerResult: "dry-run-verified",
    expectedObservations: successStages.map((stage) => ({ stage, outcome: "completed" })),
    expectedOwnerCallCounts: counts(),
    finalControlProfileReference: "profile/final-control/success",
    scenarioFingerprint: digest,
  };
}

function profile() {
  return {
    schemaVersion: "1.0",
    profileReference: "profile/final-control/success",
    scenarioId: "scenario-success",
    validFrom: evaluatedAt,
    validUntil: "2026-09-10T11:00:00.000Z",
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
    profileFingerprint: digest,
  };
}

function snapshot() {
  return {
    schemaVersion: "1.0",
    snapshotId: "snapshot-one",
    runId: "m20-run-one",
    rehearsalEvaluatedAt,
    validFrom: evaluatedAt,
    validUntil: "2026-09-10T11:00:00.000Z",
    authorityId: "final-control-authority-one",
    authorityFingerprint: digest,
    authorizationDecisionId: "authorization-decision-one",
    authorizationDecisionFingerprint: digest,
    authorizationClaimId: "authorization-claim-one",
    authorizationClaimFingerprint: digestB,
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: digest,
    adapterId: "adapter-one",
    adapterFingerprint: digest,
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: digest,
    providerFamilyReference: "provider-family/openai",
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    credentialRotationVersion: "rotation-v1",
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
    authorizationExpiryState: "current",
    snapshotFingerprint: digest,
  };
}

function rehearsalEvidence() {
  const coordinates: Partial<ReturnType<typeof snapshot>> = { ...snapshot() };
  const snapshotFingerprint = coordinates.snapshotFingerprint!;
  delete coordinates.authorityId;
  delete coordinates.authorityFingerprint;
  delete coordinates.validFrom;
  delete coordinates.validUntil;
  delete coordinates.snapshotFingerprint;
  return {
    ...coordinates,
    rehearsalEvidenceId: "rehearsal-one",
    snapshotFingerprint,
    outcome: "would-allow",
    policyVersion: "m20-final-control-policy-v1",
    evidenceFingerprint: digestB,
  };
}

function observation(stage: (typeof successStages)[number], position: number) {
  const common = {
    schemaVersion: "1.0",
    stage,
    position,
    outcome: "completed",
    observedAt: stage === "final-control-rehearsal-complete" ? rehearsalEvaluatedAt : evaluatedAt,
    observationFingerprint: digest,
  };
  const artifactBindings = {
    "request-accepted": { runId: "m20-run-one", requestFingerprint: digest },
    "scenario-authority-verified": {
      scenarioId: "scenario-success",
      scenarioFingerprint: digest,
      catalogFingerprint: digestB,
    },
    "authorization-issued": {
      authorizationDecisionId: "authorization-decision-one",
      authorizationDecisionFingerprint: digest,
    },
    "authorization-claimed": {
      authorizationClaimId: "authorization-claim-one",
      authorizationClaimFingerprint: digestB,
    },
    "preparation-started": { preparationId: "preparation-one", requestPlanId: "request-plan-one" },
    "preparation-disabled-bound": {
      preparationId: "preparation-one",
      requestPlanId: "request-plan-one",
      requestPlanFingerprint: digest,
      credentialResolutionEvidenceFingerprint: digestB,
      disabledPolicyFingerprint: digest,
      adapterId: "adapter-one",
      adapterFingerprint: digest,
      operation: "founder-decision-memo",
      disabledPolicyVersion: "m19-disabled-policy-v1",
      evaluatedAt,
    },
    "final-control-rehearsal-complete": {
      rehearsalEvidenceId: "rehearsal-one",
      rehearsalEvidenceFingerprint: digestB,
      rehearsalOutcome: "would-allow",
    },
    "no-network-verified": { networkAttemptCount: 0 },
  }[stage];
  return { ...common, artifactBindings };
}

const assertionNames = [
  "request-canonical",
  "scenario-authoritative",
  "authorization-authoritative",
  "preparation-terminal-bound",
  "rehearsal-artifact-authoritative",
  "rehearsal-control-allowed",
  "rehearsal-non-executing",
  "public-output-secret-free",
  "network-attempts-zero",
  "stage-sequence-exact",
] as const;

function successReport() {
  return {
    schemaVersion: "1.0",
    taxonomyId: "M20-dry-run-taxonomy-v1",
    runId: "m20-run-one",
    scenarioId: "scenario-success",
    scenarioFingerprint: digest,
    catalogFingerprint: digestB,
    evaluatedAt,
    rehearsalEvaluatedAt,
    requestFingerprint: digest,
    status: "dry-run-verified",
    observations: successStages.map((stage, index) => observation(stage, index + 1)),
    protectedCallCounts: counts(),
    networkAttemptCount: 0,
    securityAssertions: assertionNames.map((assertion) => ({ assertion, status: "passed" })),
    reportFingerprint: digest,
  };
}

function successReportWithDeniedRehearsal() {
  const report = successReport();
  return {
    ...report,
    observations: report.observations.map((entry) =>
      entry.stage === "final-control-rehearsal-complete"
        ? {
            ...entry,
            artifactBindings: {
              ...entry.artifactBindings,
              rehearsalOutcome: "would-deny",
            },
          }
        : entry,
    ),
  };
}

describe("Milestone 20 shared dry-run contracts", () => {
  it("exports every required request, catalog, final-control, result, report, and fingerprint contract", async () => {
    const module = await contracts();
    for (const name of [
      "M20DryRunRequestSchema",
      "M20FaultDeclarationSchema",
      "M20ScenarioDescriptorSchema",
      "M20ScenarioCatalogSchema",
      "M20ProtectedCallCountsSchema",
      "M20StageObservationSchema",
      "M20FinalControlProfileSchema",
      "M20FinalControlSnapshotSchema",
      "M20FinalControlSnapshotIssuanceRequestSchema",
      "M20FinalControlSnapshotIssuanceResultSchema",
      "M20FinalControlSnapshotVerificationRequestSchema",
      "M20FinalControlSnapshotVerificationResultSchema",
      "M20FinalControlRehearsalEvidenceSchema",
      "M20DryRunReportSchema",
      "M20DryRunResultSchema",
      "M20ArtifactVerificationResultSchema",
      "M20FingerprintDomainSchema",
    ]) {
      expect(module[name], name).toBeDefined();
    }
    expect(module.M20_FINGERPRINT_DOMAINS).toEqual({
      request: "founderos/m20/dry-run-request/v1",
      fault: "founderos/m20/fault/v1",
      scenario: "founderos/m20/scenario/v1",
      catalog: "founderos/m20/scenario-catalog/v1",
      stageObservation: "founderos/m20/stage-observation/v1",
      finalControlAuthority: "founderos/m20/final-control-authority/v1",
      finalControlSnapshot: "founderos/m20/final-control-snapshot/v1",
      finalControlProfile: "founderos/m20/final-control-profile/v1",
      rehearsalEvidence: "founderos/m20/final-control-rehearsal/v1",
      report: "founderos/m20/dry-run-report/v1",
    });
  });

  it("owns exact closed fault, stage, boundary, terminal taxonomy, and verifier taxonomies", async () => {
    const module = await contracts();
    expect(schema(module, "M20FaultKindSchema").options).toHaveLength(31);
    expect(schema(module, "M20StageSchema").options).toEqual(successStages);
    expect(schema(module, "M20AffectedBoundarySchema").options).toEqual([
      "m17-issuance",
      "m17-claim",
      "m19-readiness",
      "m19-policy",
      "m18-resolution",
      "m19-terminal",
      "m20-final-control-authority",
    ]);
    expect(schema(module, "M20TerminalReasonCodeSchema").options).toEqual([
      "scenario_non_authoritative",
      "authorization_issuance_rejected",
      "authorization_claim_rejected",
      "preparation_rejected",
      "preparation_non_authoritative",
      "final_control_issuance_rejected",
      "final_control_non_authoritative",
      "final_control_rehearsal_denied",
      "internal_integrity_failure",
    ]);
    expect(schema(module, "M20ArtifactVerificationReasonCodeSchema").options).toEqual([
      "invalid_artifact",
      "fingerprint_mismatch",
      "scenario_mismatch",
      "stage_grammar_mismatch",
      "call_count_mismatch",
      "assertion_mismatch",
      "network_count_nonzero",
      "terminal_discriminant_mismatch",
    ]);
  });

  it("accepts and deeply freezes the exact request while enforcing chronology and strict canonical shape", async () => {
    const module = await contracts();
    const requestSchema = schema(module, "M20DryRunRequestSchema");
    const parsed = requestSchema.parse(dryRunRequest()) as ReturnType<typeof dryRunRequest>;
    expect(parsed).toEqual(dryRunRequest());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.authorizationRequest)).toBe(true);
    expect(Object.isFrozen(parsed.authorizationRequest.limits)).toBe(true);
    expect(
      requestSchema.safeParse({ ...dryRunRequest(), endpoint: "https://example.invalid" }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...dryRunRequest(), rehearsalEvaluatedAt: evaluatedAt }).success,
    ).toBe(true);
    expect(
      requestSchema.safeParse({
        ...dryRunRequest(),
        rehearsalEvaluatedAt: "2026-09-10T09:59:59.000Z",
      }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...dryRunRequest(), authorizationDecisionExpiresAt: evaluatedAt })
        .success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...dryRunRequest(), requestFingerprint: digest.toUpperCase() })
        .success,
    ).toBe(false);

    let getterRead = false;
    const accessor = { ...dryRunRequest() };
    Object.defineProperty(accessor, "runId", {
      enumerable: true,
      get() {
        getterRead = true;
        return "m20-run-one";
      },
    });
    expect(requestSchema.safeParse(accessor).success).toBe(false);
    expect(getterRead).toBe(false);
  });

  it("validates inert fault declarations and protected call-count bounds", async () => {
    const module = await contracts();
    expect(schema(module, "M20FaultDeclarationSchema").parse(fault())).toEqual(fault());
    expect(
      schema(module, "M20FaultDeclarationSchema").safeParse({ ...fault(), callback: "run" })
        .success,
    ).toBe(false);
    expect(
      schema(module, "M20FaultDeclarationSchema").safeParse({
        ...fault(),
        fixtureReference: "/tmp/fault",
      }).success,
    ).toBe(false);
    expect(schema(module, "M20ProtectedCallCountsSchema").parse(counts())).toEqual(counts());
    expect(schema(module, "M20ProtectedCallCountsSchema").safeParse(counts(2)).success).toBe(false);
    expect(schema(module, "M20ProtectedCallCountsSchema").safeParse(counts(1, 1, 3)).success).toBe(
      false,
    );
  });

  it("enforces scenario discriminants, follower zero deltas, and expected-observation bounds", async () => {
    const module = await contracts();
    const scenarioSchema = schema(module, "M20ScenarioDescriptorSchema");
    expect(scenarioSchema.parse(scenario())).toEqual(scenario());
    expect(
      scenarioSchema.safeParse({ ...scenario(), expectedOwnerReasonCode: "preparation_rejected" })
        .success,
    ).toBe(false);
    expect(scenarioSchema.safeParse({ ...scenario(), expectedObservations: [] }).success).toBe(
      false,
    );
    expect(
      scenarioSchema.safeParse({
        ...scenario(),
        expectedObservations: [
          ...scenario().expectedObservations,
          { stage: "no-network-verified", outcome: "completed" },
        ],
      }).success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...scenario(),
        purpose: "concurrency",
        expectedFollowerResult: "in-flight",
        expectedFollowerCallDelta: counts(0, 0, 0, 0, 0, 0),
      }).success,
    ).toBe(true);
    expect(scenarioSchema.safeParse({ ...scenario(), purpose: "concurrency" }).success).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...scenario(),
        purpose: "replay",
        expectedFollowerResult: "dry-run-verified",
        expectedFollowerCallDelta: counts(0, 0, 0, 0, 0, 0),
      }).success,
    ).toBe(true);
    expect(
      scenarioSchema.safeParse({
        ...scenario(),
        purpose: "success",
        expectedFollowerResult: "in-flight",
      }).success,
    ).toBe(false);
  });

  it("requires an ordered bounded catalog with unique scenarios, faults, and fixtures", async () => {
    const module = await contracts();
    const catalogSchema = schema(module, "M20ScenarioCatalogSchema");
    const catalog = {
      schemaVersion: "1.0",
      catalogVersion: "m20-scenario-catalog-v1",
      scenarios: [scenario()],
      catalogFingerprint: digestB,
    };
    expect(catalogSchema.parse(catalog)).toEqual(catalog);
    expect(catalogSchema.safeParse({ ...catalog, scenarios: [] }).success).toBe(false);
    const scenarios = Array.from({ length: 257 }, (_, index) => ({
      ...scenario(),
      scenarioId: `scenario-${String(index).padStart(3, "0")}`,
    }));
    expect(catalogSchema.safeParse({ ...catalog, scenarios }).success).toBe(false);
    const second = {
      ...scenario(),
      scenarioId: "scenario-two",
      purpose: "single-fault",
      expectedOwnerResult: "dry-run-rejected",
      expectedOwnerReasonCode: "authorization_issuance_rejected",
      primaryFault: fault("fault-two", "fixture/shared"),
      scenarioFingerprint: digestB,
    };
    const first = {
      ...second,
      scenarioId: "scenario-one",
      primaryFault: fault("fault-one", "fixture/shared"),
      scenarioFingerprint: digest,
    };
    expect(catalogSchema.safeParse({ ...catalog, scenarios: [second, first] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...catalog, scenarios: [first, second] }).success).toBe(false);
    const duplicateProfile = {
      ...scenario(),
      scenarioId: "scenario-two",
      scenarioFingerprint: digestB,
    };
    expect(
      catalogSchema.safeParse({ ...catalog, scenarios: [scenario(), duplicateProfile] }).success,
    ).toBe(false);
  });

  it("enforces stage-specific exact artifact bindings and rejected-observation reasons", async () => {
    const module = await contracts();
    const observationSchema = schema(module, "M20StageObservationSchema");
    for (const [index, stage] of successStages.entries()) {
      expect(observationSchema.parse(observation(stage, index + 1))).toEqual(
        observation(stage, index + 1),
      );
    }
    expect(
      observationSchema.safeParse({
        ...observation("authorization-issued", 3),
        artifactBindings: { authorizationDecisionId: "authorization-decision-one" },
      }).success,
    ).toBe(false);
    const rejected = {
      ...observation("authorization-issued", 3),
      outcome: "rejected",
      reasonCode: "authorization_issuance_rejected",
      artifactBindings: { authorizationDecisionId: "authorization-decision-one" },
    };
    expect(observationSchema.parse(rejected)).toEqual(rejected);
    expect(observationSchema.safeParse({ ...rejected, reasonCode: undefined }).success).toBe(false);
    expect(
      observationSchema.safeParse({
        ...observation("no-network-verified", 8),
        artifactBindings: { networkAttemptCount: 1 },
      }).success,
    ).toBe(false);
  });

  it("validates final-control profiles, snapshots, authority request/results, and snapshot windows", async () => {
    const module = await contracts();
    expect(schema(module, "M20FinalControlProfileSchema").parse(profile())).toEqual(profile());
    expect(schema(module, "M20FinalControlSnapshotSchema").parse(snapshot())).toEqual(snapshot());
    expect(
      schema(module, "M20FinalControlSnapshotSchema").safeParse({
        ...snapshot(),
        validUntil: rehearsalEvaluatedAt,
      }).success,
    ).toBe(false);
    expect(
      schema(module, "M20FinalControlProfileSchema").safeParse({
        ...profile(),
        authorizationExpiryState: "current",
      }).success,
    ).toBe(false);

    const issuanceRequest = {
      schemaVersion: "1.0",
      snapshotId: "snapshot-one",
      runId: "m20-run-one",
      scenarioId: "scenario-success",
      scenarioFingerprint: digest,
      catalogFingerprint: digestB,
      rehearsalEvaluatedAt,
      decision: {
        schemaVersion: "1.0",
        authorizationDecisionId: "authorization-decision-one",
        decisionAuthorityReference: "authorization-authority/evaluation",
        serviceIdentityEvidenceId: "service-identity-evidence-one",
        serviceIdentityEvidenceFingerprint: digest,
        humanApprovalEvidenceId: "human-approval-one",
        humanApprovalEvidenceFingerprint: digest,
        authorizationRequest: authorizationRequest(),
        outcome: "allowed",
        state: "allowed-unclaimed",
        reasonCodes: ["execution_authorization_allowed"],
        issuedAt: evaluatedAt,
        expiresAt: "2026-09-10T10:30:00.000Z",
        revocationVersion: 0,
        issuerProofReference: "proof/authorization-decision-one",
        decisionFingerprint: digest,
      },
      claim: {
        schemaVersion: "1.0",
        authorizationClaimId: "authorization-claim-one",
        authorizationDecisionId: "authorization-decision-one",
        decisionFingerprint: digest,
        executionAttemptId: "execution-attempt-one",
        executionAttemptFingerprint: digest,
        state: "claimed-by-exact-attempt",
        claimedAt: rehearsalEvaluatedAt,
        claimSequence: 1,
        decisionAuthorityReference: "authorization-authority/evaluation",
        claimFingerprint: digestB,
      },
      credentialResolutionRequest: credentialResolutionRequest(),
      m19Terminal: {
        status: "disabled-by-policy",
        preparationId: "preparation-one",
        requestPlanId: "request-plan-one",
        requestPlanFingerprint: digest,
        credentialResolutionEvidenceFingerprint: digestB,
        disabledPolicyFingerprint: digest,
        adapterId: "adapter-one",
        adapterFingerprint: digest,
        operation: "founder-decision-memo",
        disabledPolicyVersion: "m19-disabled-policy-v1",
        evaluatedAt,
      },
    };
    expect(
      schema(module, "M20FinalControlSnapshotIssuanceRequestSchema").parse(issuanceRequest),
    ).toEqual(issuanceRequest);
    expect(
      (
        schema(module, "M20FinalControlSnapshotIssuanceResultSchema").parse({
          status: "issued",
          snapshot: snapshot(),
        }) as { status: string }
      ).status,
    ).toBe("issued");
    expect(
      schema(module, "M20FinalControlSnapshotIssuanceResultSchema").safeParse({
        status: "rejected",
        reasonCode: "unknown",
      }).success,
    ).toBe(false);
    expect(
      (
        schema(module, "M20FinalControlSnapshotVerificationRequestSchema").parse({
          schemaVersion: "1.0",
          runId: "m20-run-one",
          snapshot: snapshot(),
        }) as { runId: string }
      ).runId,
    ).toBe("m20-run-one");
    expect(
      (
        schema(module, "M20FinalControlSnapshotVerificationResultSchema").parse({
          status: "invalid",
          reasonCode: "snapshot_non_authoritative",
        }) as { status: string }
      ).status,
    ).toBe("invalid");
  });

  it("enforces rehearsal allow/deny discriminants and the restrictive-state denial precedence", async () => {
    const module = await contracts();
    const rehearsalSchema = schema(module, "M20FinalControlRehearsalEvidenceSchema");
    expect(rehearsalSchema.parse(rehearsalEvidence())).toEqual(rehearsalEvidence());
    expect(
      rehearsalSchema.safeParse({ ...rehearsalEvidence(), denialReasonCode: "global_disabled" })
        .success,
    ).toBe(false);
    const denied = {
      ...rehearsalEvidence(),
      globalKillSwitch: "deny",
      authorizationExpiryState: "expired",
      outcome: "would-deny",
      denialReasonCode: "global_disabled",
    };
    expect(rehearsalSchema.parse(denied)).toEqual(denied);
    expect(
      rehearsalSchema.safeParse({ ...denied, denialReasonCode: "authorization_expired" }).success,
    ).toBe(false);
    expect(
      rehearsalSchema.safeParse({ ...denied, outcome: "would-allow", denialReasonCode: undefined })
        .success,
    ).toBe(false);
  });

  it("accepts exact success report grammar and rejects stage, position, count, assertion, network, and fingerprint violations", async () => {
    const module = await contracts();
    const reportSchema = schema(module, "M20DryRunReportSchema");
    expect(reportSchema.parse(successReport())).toEqual(successReport());
    expect(
      reportSchema.safeParse({ ...successReport(), reasonCode: "preparation_rejected" }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({
        ...successReport(),
        observations: successReport().observations.slice(0, 7),
      }).success,
    ).toBe(false);
    const moved = [...successReport().observations];
    [moved[2], moved[3]] = [moved[3]!, moved[2]!];
    expect(reportSchema.safeParse({ ...successReport(), observations: moved }).success).toBe(false);
    expect(
      reportSchema.safeParse({ ...successReport(), protectedCallCounts: counts(1, 1, 1) }).success,
    ).toBe(false);
    expect(reportSchema.safeParse({ ...successReport(), networkAttemptCount: 1 }).success).toBe(
      false,
    );
    expect(
      reportSchema.safeParse({
        ...successReport(),
        securityAssertions: successReport().securityAssertions.map((entry, index) =>
          index === 0 ? { ...entry, status: "failed" } : entry,
        ),
      }).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse({ ...successReport(), reportFingerprint: digest.toUpperCase() })
        .success,
    ).toBe(false);
    expect(reportSchema.safeParse(successReportWithDeniedRehearsal()).success).toBe(false);
  });

  it("enforces every rejection terminal prefix, call-count tuple, and security-assertion tuple", async () => {
    const module = await contracts();
    const reportSchema = schema(module, "M20DryRunReportSchema");
    const cases = [
      ["scenario_non_authoritative", 2, counts(0, 0, 0, 0, 0, 0), "PFNNNNNPPP"],
      ["authorization_issuance_rejected", 3, counts(1, 0, 0, 0, 0, 0), "PPFNNNNPPP"],
      ["authorization_claim_rejected", 4, counts(1, 1, 1, 0, 0, 0), "PPFNNNNPPP"],
      ["preparation_rejected", 6, counts(1, 1, 2, 1, 0, 0), "PPPFNNNPPP"],
      ["preparation_non_authoritative", 6, counts(1, 1, 2, 1, 0, 0), "PPPFNNNPPP"],
      ["final_control_issuance_rejected", 7, counts(1, 1, 2, 1, 1, 0), "PPPPFNNPPP"],
      ["final_control_non_authoritative", 7, counts(), "PPPPFNNPPP"],
      ["final_control_rehearsal_denied", 7, counts(), "PPPPPFPPPP"],
    ] as const;
    for (const [reasonCode, length, protectedCallCounts, tuple] of cases) {
      const report = terminalRejectionReport(reasonCode, length, protectedCallCounts, tuple);
      expect(reportSchema.safeParse(report).success, reasonCode).toBe(true);
      const wrongCounts =
        reasonCode === "scenario_non_authoritative"
          ? counts(1, 0, 0, 0, 0, 0)
          : counts(0, 0, 0, 0, 0, 0);
      expect(
        reportSchema.safeParse({ ...report, protectedCallCounts: wrongCounts }).success,
        `${reasonCode} bad counts`,
      ).toBe(false);
    }
  });

  it.each([
    ["authorization_issuance_rejected", 3, counts(1, 0, 1, 0, 0, 0), counts(1, 0, 2, 0, 0, 0)],
    ["authorization_claim_rejected", 4, counts(1, 1, 2, 0, 0, 0), counts(1, 1, 0, 0, 0, 0)],
  ] as const)(
    "allows the amended %s verification tuple and rejects a nearby tuple",
    async (reasonCode, length, validCounts, invalidCounts) => {
      const module = await contracts();
      const reportSchema = schema(module, "M20DryRunReportSchema");
      const tuple = "PPFNNNNPPP";
      const report = terminalRejectionReport(reasonCode, length, validCounts, tuple);

      expect(reportSchema.safeParse(report).success).toBe(true);
      expect(
        reportSchema.safeParse({ ...report, protectedCallCounts: invalidCounts }).success,
      ).toBe(false);
    },
  );

  it("keeps dry-run and verification result variants strict and uniquely discriminated", async () => {
    const module = await contracts();
    const resultSchema = schema(module, "M20DryRunResultSchema");
    for (const value of [
      { status: "preflight-rejected", reasonCode: "invalid_input" },
      { status: "in-flight", reason: "dry_run_in_progress" },
      { status: "dry-run-verified", report: successReport() },
      { status: "dry-run-rejected", report: rejectionReport() },
      { status: "integrity-rejected", reasonCode: "internal_integrity_failure" },
    ])
      expect(resultSchema.safeParse(value).success, value.status).toBe(true);
    expect(
      resultSchema.safeParse({
        status: "integrity-rejected",
        reasonCode: "internal_integrity_failure",
        report: successReport(),
      }).success,
    ).toBe(false);
    expect(
      resultSchema.safeParse({ status: "dry-run-verified", report: rejectionReport() }).success,
    ).toBe(false);
    expect(
      resultSchema.safeParse({
        status: "dry-run-verified",
        report: successReportWithDeniedRehearsal(),
      }).success,
    ).toBe(false);
    expect(
      schema(module, "M20ArtifactVerificationResultSchema").parse({ status: "valid" }),
    ).toEqual({ status: "valid" });
    expect(
      schema(module, "M20ArtifactVerificationResultSchema").safeParse({
        status: "invalid",
        reasonCode: "unknown",
      }).success,
    ).toBe(false);
  });
});

function rejectionBindings(stage: string): Record<string, unknown> {
  if (stage === "scenario-authority-verified")
    return {
      scenarioId: "scenario-success",
      scenarioFingerprint: digest,
      catalogFingerprint: digestB,
    };
  if (stage === "authorization-issued")
    return { authorizationDecisionId: "authorization-decision-one" };
  if (stage === "authorization-claimed") return { authorizationClaimId: "authorization-claim-one" };
  if (stage === "preparation-disabled-bound") return { preparationId: "preparation-one" };
  if (stage === "final-control-rehearsal-complete") return { rehearsalEvidenceId: "rehearsal-one" };
  throw new Error(`Unsupported rejection stage: ${stage}`);
}

function rejectionReport() {
  const base = successReport();
  const observations = base.observations.slice(0, 3).map((entry, index) =>
    index === 2
      ? {
          ...entry,
          outcome: "rejected",
          reasonCode: "authorization_issuance_rejected",
          artifactBindings: rejectionBindings(entry.stage),
        }
      : entry,
  );
  return {
    ...base,
    status: "dry-run-rejected",
    reasonCode: "authorization_issuance_rejected",
    observations,
    protectedCallCounts: counts(1, 0, 0, 0, 0, 0),
    securityAssertions: assertionNames.map((assertion, index) => ({
      assertion,
      status: index < 2 || index > 6 ? "passed" : index === 2 ? "failed" : "not-reached",
    })),
  };
}

function terminalRejectionReport(
  reasonCode: string,
  length: number,
  protectedCallCounts: ReturnType<typeof counts>,
  tuple: string,
) {
  const symbols = { P: "passed", F: "failed", N: "not-reached" } as const;
  const observations = successReport()
    .observations.slice(0, length)
    .map((entry, index) =>
      index === length - 1
        ? {
            ...entry,
            outcome: "rejected",
            reasonCode,
            artifactBindings:
              reasonCode === "final_control_rehearsal_denied"
                ? {
                    rehearsalEvidenceId: "rehearsal-one",
                    rehearsalEvidenceFingerprint: digestB,
                    rehearsalOutcome: "would-deny",
                  }
                : rejectionBindings(entry.stage),
          }
        : entry,
    );
  return {
    ...successReport(),
    status: "dry-run-rejected",
    reasonCode,
    observations,
    protectedCallCounts,
    securityAssertions: assertionNames.map((assertion, index) => ({
      assertion,
      status: symbols[tuple[index] as keyof typeof symbols],
    })),
  };
}
