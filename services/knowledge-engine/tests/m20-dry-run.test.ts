import {
  M20_FINGERPRINT_DOMAINS,
  M20DryRunResultSchema,
  M20FaultDeclarationSchema,
  type M20DryRunRequestV1,
  type M20FaultDeclarationV1,
  type M20FinalControlSnapshotV1,
  type M20ScenarioCatalogV1,
} from "@founderos/knowledge-schema";
import { describe, expect, it, vi } from "vitest";

import * as knowledgeEngineFacade from "../src/index.js";

import {
  createInMemoryExecutionAuthorizationAuthority,
  createCredentialResolutionRequest,
  createM20DryRunConductor,
  createM20ArtifactFingerprint,
  createM20DryRunRequest,
  createM20FinalControlProfile,
  createM20FinalControlRehearsalEvidence,
  createM20FinalControlSnapshot,
  createM20ScenarioCatalog,
  createM20ScenarioDescriptor,
  verifyM20DryRunReport,
  type M20DryRunConductorConfiguration,
} from "../src/index.js";
import {
  AUTHORIZATION_EVALUATED_AT,
  authorizationAuthorityConfiguration,
  createAuthorizationFixture,
} from "./fixtures/execution-authorization.js";

function createTestM20FaultDeclaration(
  input: Omit<M20FaultDeclarationV1, "faultFingerprint">,
): M20FaultDeclarationV1 {
  const candidate = {
    ...input,
    faultFingerprint: createM20ArtifactFingerprint(
      M20_FINGERPRINT_DOMAINS.fault,
      input,
      "faultFingerprint",
    ),
  };
  return M20FaultDeclarationSchema.parse(candidate);
}

function resignReport(report: Record<string, unknown>): Record<string, unknown> {
  report.reportFingerprint = createM20ArtifactFingerprint(
    M20_FINGERPRINT_DOMAINS.report,
    report,
    "reportFingerprint",
  );
  return report;
}

function mutateObservation(
  report: Record<string, unknown>,
  index: number,
  mutate: (observation: Record<string, unknown>, bindings: Record<string, unknown>) => void,
): Record<string, unknown> {
  const observations = report.observations as Record<string, unknown>[];
  const observation = observations[index]!;
  mutate(observation, observation.artifactBindings as Record<string, unknown>);
  observation.observationFingerprint = createM20ArtifactFingerprint(
    M20_FINGERPRINT_DOMAINS.stageObservation,
    observation,
    "observationFingerprint",
  );
  return resignReport(report);
}

function observedProtectedCounts(calls: readonly string[]) {
  return {
    authorizationIssuanceCalls: calls.filter((call) => call === "authorization.issue").length,
    authorizationClaimCalls: calls.filter((call) => call === "authorization.claim").length,
    authorizationVerificationCalls: calls.filter((call) => call.startsWith("authorization.verify"))
      .length,
    m19PreparationCalls: calls.filter((call) => call === "m19.prepare").length,
    finalControlIssuanceCalls: calls.filter((call) => call === "final.issue").length,
    finalControlVerificationCalls: calls.filter((call) => call === "final.verify").length,
  };
}

const REHEARSAL_AT = "2026-08-23T01:00:03.000Z";
const DECISION_EXPIRES_AT = "2026-08-23T01:15:00.000Z";
const SUCCESS_COUNTS = Object.freeze({
  authorizationIssuanceCalls: 1,
  authorizationClaimCalls: 1,
  authorizationVerificationCalls: 2,
  m19PreparationCalls: 1,
  finalControlIssuanceCalls: 1,
  finalControlVerificationCalls: 1,
});
const SUCCESS_STAGES = [
  "request-accepted",
  "scenario-authority-verified",
  "authorization-issued",
  "authorization-claimed",
  "preparation-started",
  "preparation-disabled-bound",
  "final-control-rehearsal-complete",
  "no-network-verified",
] as const;
const SUCCESS_OBSERVATIONS = SUCCESS_STAGES.map((stage) => ({
  stage,
  outcome: "completed" as const,
}));

type ReportedReason =
  | "authorization_issuance_rejected"
  | "authorization_claim_rejected"
  | "preparation_rejected"
  | "preparation_non_authoritative"
  | "final_control_issuance_rejected"
  | "final_control_non_authoritative"
  | "final_control_rehearsal_denied";

type FinalControlOverrides = Partial<
  Pick<
    M20FinalControlSnapshotV1,
    | "globalKillSwitch"
    | "providerKillSwitch"
    | "adapterKillSwitch"
    | "modelKillSwitch"
    | "environmentKillSwitch"
    | "operationKillSwitch"
    | "incidentState"
    | "credentialReferenceState"
    | "circuitState"
    | "healthState"
    | "authorizationRevocationState"
    | "authorizationExpiryState"
  >
>;

function createCatalog(
  reason?: ReportedReason,
  verificationRejected = false,
  faults?: {
    readonly primaryFault: ReturnType<typeof createTestM20FaultDeclaration>;
    readonly precedenceFault: ReturnType<typeof createTestM20FaultDeclaration>;
  },
): M20ScenarioCatalogV1 {
  const grammar = {
    authorization_issuance_rejected: { length: 3, counts: [1, 0, 0, 0, 0, 0] },
    authorization_claim_rejected: { length: 4, counts: [1, 1, 1, 0, 0, 0] },
    preparation_rejected: { length: 6, counts: [1, 1, 2, 1, 0, 0] },
    preparation_non_authoritative: { length: 6, counts: [1, 1, 2, 1, 0, 0] },
    final_control_issuance_rejected: { length: 7, counts: [1, 1, 2, 1, 1, 0] },
    final_control_non_authoritative: { length: 7, counts: [1, 1, 2, 1, 1, 1] },
    final_control_rehearsal_denied: { length: 7, counts: [1, 1, 2, 1, 1, 1] },
  } as const;
  const selected = reason === undefined ? undefined : grammar[reason];
  const expectedObservations = SUCCESS_STAGES.slice(0, selected?.length ?? 8).map(
    (stage, index, entries) => ({
      stage,
      outcome:
        reason !== undefined && index === entries.length - 1
          ? ("rejected" as const)
          : ("completed" as const),
    }),
  );
  const values =
    reason === "authorization_issuance_rejected" && verificationRejected
      ? [1, 0, 1, 0, 0, 0]
      : reason === "authorization_claim_rejected" && verificationRejected
        ? [1, 1, 2, 0, 0, 0]
        : (selected?.counts ?? [1, 1, 2, 1, 1, 1]);
  const expectedOwnerCallCounts = {
    authorizationIssuanceCalls: values[0],
    authorizationClaimCalls: values[1],
    authorizationVerificationCalls: values[2],
    m19PreparationCalls: values[3],
    finalControlIssuanceCalls: values[4],
    finalControlVerificationCalls: values[5],
  };
  const descriptor = createM20ScenarioDescriptor({
    schemaVersion: "1.0",
    scenarioId: "scenario-success",
    scenarioVersion: "scenario-version/v1",
    catalogVersion: "m20-scenario-catalog-v1",
    purpose: faults === undefined ? "success" : "precedence",
    expectedOwnerResult: reason === undefined ? "dry-run-verified" : "dry-run-rejected",
    ...(reason === undefined ? {} : { expectedOwnerReasonCode: reason }),
    expectedObservations,
    expectedOwnerCallCounts,
    finalControlProfileReference: "final-control/success",
    ...faults,
  });
  return createM20ScenarioCatalog({
    schemaVersion: "1.0",
    catalogVersion: "m20-scenario-catalog-v1",
    scenarios: [descriptor],
  });
}

function createMaximumScenarioCatalog(seed: M20ScenarioCatalogV1): M20ScenarioCatalogV1 {
  const seedScenario = seed.scenarios[0]!;
  const createMaximumScenario = (scenarioId: string, suffix: string) => {
    return createM20ScenarioDescriptor({
      ...seedScenario,
      scenarioId,
      purpose: "replay",
      expectedFollowerResult: "dry-run-verified",
      expectedFollowerCallDelta: {
        authorizationIssuanceCalls: 0,
        authorizationClaimCalls: 0,
        authorizationVerificationCalls: 0,
        m19PreparationCalls: 0,
        finalControlIssuanceCalls: 0,
        finalControlVerificationCalls: 0,
      },
      finalControlProfileReference: `final-control/zz-scenario-${suffix}`,
      primaryFault: createTestM20FaultDeclaration({
        schemaVersion: "1.0",
        faultId: `fault-primary-${suffix}`,
        faultKind: "current-control-rejected",
        injectionStage: "preparation-started",
        affectedBoundary: "m19-policy",
        fixtureReference: `fixture/m20/primary-${suffix}`,
      }),
      precedenceFault: createTestM20FaultDeclaration({
        schemaVersion: "1.0",
        faultId: `fault-precedence-${suffix}`,
        faultKind: "m19-terminal-malformed-or-known-coordinate-mismatch",
        injectionStage: "preparation-disabled-bound",
        affectedBoundary: "m19-terminal",
        fixtureReference: `fixture/m20/precedence-${suffix}`,
      }),
    });
  };
  const maximumSeed = createMaximumScenario(seedScenario.scenarioId, "seed");
  const additional = Array.from({ length: 255 }, (_entry, index) => {
    const suffix = String(index).padStart(3, "0");
    return createMaximumScenario(`zz-scenario-${suffix}`, suffix);
  });
  return createM20ScenarioCatalog({
    schemaVersion: "1.0",
    catalogVersion: "m20-scenario-catalog-v1",
    scenarios: [maximumSeed, ...additional],
  });
}

function setup(
  options: {
    readonly prepareResult?: unknown;
    readonly issueResult?: "issued" | "rejected";
    readonly claimResult?: "claimed" | "rejected";
    readonly verifyDecision?: "valid" | "invalid";
    readonly verifyClaim?: "valid" | "invalid";
    readonly finalIssue?: "issued" | "rejected";
    readonly finalVerify?: "valid" | "invalid";
    readonly finalDeny?: boolean;
    readonly finalControls?: FinalControlOverrides;
    readonly decisionSubstitution?: boolean;
    readonly claimSubstitution?: boolean;
    readonly snapshotSubstitution?: boolean;
    readonly m19PreparationPrecedence?: true;
    readonly holdPreparation?: boolean;
    readonly networkAdvanceDuringPrepare?: boolean;
    readonly firstWitnessValue?: number;
    readonly throwAt?:
      | "issue"
      | "claim"
      | "verify-decision"
      | "verify-claim"
      | "prepare"
      | "final-issue"
      | "final-verify"
      | "witness-first";
  } = {},
) {
  const expectedReason: ReportedReason | undefined =
    options.issueResult === "rejected" ||
    options.verifyDecision === "invalid" ||
    options.decisionSubstitution
      ? "authorization_issuance_rejected"
      : options.claimResult === "rejected" ||
          options.verifyClaim === "invalid" ||
          options.claimSubstitution
        ? "authorization_claim_rejected"
        : options.m19PreparationPrecedence === true
          ? "preparation_rejected"
          : options.prepareResult !== undefined &&
              typeof options.prepareResult === "object" &&
              options.prepareResult !== null &&
              "status" in options.prepareResult &&
              options.prepareResult.status === "rejected"
            ? "preparation_rejected"
            : options.prepareResult !== undefined
              ? "preparation_non_authoritative"
              : options.finalIssue === "rejected"
                ? "final_control_issuance_rejected"
                : options.finalVerify === "invalid" || options.snapshotSubstitution
                  ? "final_control_non_authoritative"
                  : options.finalDeny || options.finalControls !== undefined
                    ? "final_control_rehearsal_denied"
                    : undefined;
  const faults =
    options.m19PreparationPrecedence === true
      ? {
          primaryFault: createTestM20FaultDeclaration({
            schemaVersion: "1.0",
            faultId: "fault-m19-governed-rejection",
            faultKind: "current-control-rejected",
            injectionStage: "preparation-started",
            affectedBoundary: "m19-policy",
            fixtureReference: "fixture/m20/m19-governed-rejection",
          }),
          precedenceFault: createTestM20FaultDeclaration({
            schemaVersion: "1.0",
            faultId: "fault-m19-terminal-non-authoritative",
            faultKind: "m19-terminal-malformed-or-known-coordinate-mismatch",
            injectionStage: "preparation-disabled-bound",
            affectedBoundary: "m19-terminal",
            fixtureReference: "fixture/m20/m19-terminal-non-authoritative",
          }),
        }
      : undefined;
  const catalog = createCatalog(
    expectedReason,
    options.verifyDecision === "invalid" ||
      options.verifyClaim === "invalid" ||
      options.decisionSubstitution ||
      options.claimSubstitution,
    faults,
  );
  const fixture = createAuthorizationFixture();
  const sourceAuthority = createInMemoryExecutionAuthorizationAuthority(
    authorizationAuthorityConfiguration(),
  );
  const issued = sourceAuthority.issueDecision({
    schemaVersion: "1.0",
    authorizationDecisionId: "decision-m20",
    authorizationRequest: fixture.request,
    serviceIdentityEvidence: fixture.identity,
    humanApprovalEvidence: fixture.approval,
    evaluatedAt: AUTHORIZATION_EVALUATED_AT,
    expiresAt: DECISION_EXPIRES_AT,
  });
  if (issued.status !== "issued") throw new Error("fixture issuance failed");
  const claimed = sourceAuthority.claimDecision({
    schemaVersion: "1.0",
    authorizationClaimId: "claim-m20",
    authorizationDecision: issued.decision,
    executionAttemptId: fixture.request.executionAttemptId,
    executionAttemptFingerprint: fixture.request.executionAttemptFingerprint,
    claimedAt: AUTHORIZATION_EVALUATED_AT,
    idempotentRetry: false,
  });
  if (claimed.status !== "claimed") throw new Error("fixture claim failed");
  const credentialResolutionRequest = createCredentialResolutionRequest({
    schemaVersion: "1.0",
    resolutionRequestId: "resolution-m20",
    authorizationDecisionId: issued.decision.authorizationDecisionId,
    authorizationDecisionFingerprint: issued.decision.decisionFingerprint,
    authorizationClaimId: claimed.claim.authorizationClaimId,
    authorizationClaimFingerprint: claimed.claim.claimFingerprint,
    executionAttemptId: fixture.request.executionAttemptId,
    executionAttemptFingerprint: fixture.request.executionAttemptFingerprint,
    subjectReference: fixture.request.subjectReference,
    consumerId: fixture.request.consumerId,
    deliveryTransactionId: fixture.request.deliveryTransactionId,
    contextPackageId: fixture.request.contextPackageId,
    invocationRequestId: fixture.request.invocationRequestId,
    providerFamilyReference: fixture.request.providerFamilyReference,
    adapterId: fixture.request.adapterId,
    adapterFingerprint: fixture.request.adapterFingerprint,
    environmentClass: fixture.request.environmentClass,
    operation: fixture.request.operation,
    credentialReferenceId: fixture.request.credentialReferenceId,
    credentialReferenceFingerprint: fixture.request.credentialReferenceFingerprint,
    expectedRotationVersion: fixture.request.credentialRotationVersion,
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt: AUTHORIZATION_EVALUATED_AT,
    resolutionDeadline: "2026-08-23T01:10:00.000Z",
  });
  const request = createM20DryRunRequest({
    schemaVersion: "1.0",
    runId: "run-m20",
    scenarioId: catalog.scenarios[0]!.scenarioId,
    scenarioFingerprint: catalog.scenarios[0]!.scenarioFingerprint,
    catalogFingerprint: catalog.catalogFingerprint,
    evaluatedAt: AUTHORIZATION_EVALUATED_AT,
    rehearsalEvaluatedAt: REHEARSAL_AT,
    authorizationRequest: fixture.request,
    serviceIdentityEvidence: fixture.identity,
    humanApprovalEvidence: fixture.approval,
    authorizationDecisionId: issued.decision.authorizationDecisionId,
    authorizationDecisionExpiresAt: DECISION_EXPIRES_AT,
    authorizationClaimId: claimed.claim.authorizationClaimId,
    preparationId: "preparation-m20",
    requestPlanId: "request-plan-m20",
    credentialResolutionRequest,
    finalControlSnapshotId: "snapshot-m20",
    rehearsalEvidenceId: "rehearsal-m20",
  });
  const terminal = {
    status: "disabled-by-policy" as const,
    preparationId: request.preparationId,
    requestPlanId: request.requestPlanId,
    requestPlanFingerprint: "a".repeat(64),
    credentialResolutionEvidenceFingerprint: "b".repeat(64),
    disabledPolicyFingerprint: "c".repeat(64),
    adapterId: fixture.request.adapterId,
    adapterFingerprint: fixture.request.adapterFingerprint,
    operation: "founder-decision-memo" as const,
    disabledPolicyVersion: "disabled-policy/v1",
    evaluatedAt: request.evaluatedAt,
  };
  const profile = createM20FinalControlProfile({
    schemaVersion: "1.0",
    profileReference: "final-control/success",
    scenarioId: request.scenarioId,
    validFrom: request.evaluatedAt,
    validUntil: DECISION_EXPIRES_AT,
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
  });
  const snapshot = createM20FinalControlSnapshot({
    schemaVersion: "1.0",
    snapshotId: request.finalControlSnapshotId,
    runId: request.runId,
    rehearsalEvaluatedAt: request.rehearsalEvaluatedAt,
    validFrom: profile.validFrom,
    validUntil: profile.validUntil,
    authorityId: "final-control-authority",
    authorityFingerprint: "d".repeat(64),
    authorizationDecisionId: issued.decision.authorizationDecisionId,
    authorizationDecisionFingerprint: issued.decision.decisionFingerprint,
    authorizationClaimId: claimed.claim.authorizationClaimId,
    authorizationClaimFingerprint: claimed.claim.claimFingerprint,
    executionAttemptId: fixture.request.executionAttemptId,
    executionAttemptFingerprint: fixture.request.executionAttemptFingerprint,
    adapterId: fixture.request.adapterId,
    adapterFingerprint: fixture.request.adapterFingerprint,
    modelPolicyReference: fixture.request.modelPolicyReference,
    modelPolicyFingerprint: fixture.request.modelPolicyFingerprint,
    providerFamilyReference: "provider-family/openai",
    environmentClass: fixture.request.environmentClass,
    operation: "founder-decision-memo",
    credentialReferenceId: fixture.request.credentialReferenceId,
    credentialReferenceFingerprint: fixture.request.credentialReferenceFingerprint,
    credentialRotationVersion: fixture.request.credentialRotationVersion,
    globalKillSwitch: options.finalDeny ? "deny" : profile.globalKillSwitch,
    providerKillSwitch: profile.providerKillSwitch,
    adapterKillSwitch: profile.adapterKillSwitch,
    modelKillSwitch: profile.modelKillSwitch,
    environmentKillSwitch: profile.environmentKillSwitch,
    operationKillSwitch: profile.operationKillSwitch,
    incidentState: profile.incidentState,
    credentialReferenceState: profile.credentialReferenceState,
    circuitState: profile.circuitState,
    healthState: profile.healthState,
    authorizationRevocationState: profile.authorizationRevocationState,
    authorizationExpiryState: "current",
    ...options.finalControls,
  });
  const calls: string[] = [];
  let witnessCount = 0;
  let networkReadCount = 0;
  let advanceOnReadNumber: number | undefined;
  let releasePreparation: (() => void) | undefined;
  const preparationBarrier = new Promise<void>((resolve) => {
    releasePreparation = resolve;
  });
  const configuration: M20DryRunConductorConfiguration = {
    schemaVersion: "1.0",
    catalog,
    authorizationAuthority: {
      issueDecision() {
        calls.push("authorization.issue");
        if (options.throwAt === "issue") throw new Error("private issue failure");
        return options.issueResult === "rejected"
          ? { status: "rejected", reasonCodes: ["invalid_input" as const] }
          : {
              status: "issued",
              decision: options.decisionSubstitution
                ? ({ ...issued.decision, authorizationDecisionId: "decision-substituted" } as never)
                : issued.decision,
            };
      },
      claimDecision() {
        calls.push("authorization.claim");
        if (options.throwAt === "claim") throw new Error("private claim failure");
        return options.claimResult === "rejected"
          ? { status: "rejected", reasonCodes: ["conflicting_identity" as const] }
          : {
              status: "claimed",
              claim: options.claimSubstitution
                ? ({ ...claimed.claim, authorizationClaimId: "claim-substituted" } as never)
                : claimed.claim,
            };
      },
      verifyDecision() {
        calls.push("authorization.verifyDecision");
        if (options.throwAt === "verify-decision") throw new Error("private verification failure");
        return options.verifyDecision === "invalid"
          ? { status: "invalid", reasonCodes: ["non_authoritative_artifact" as const] }
          : { status: "valid" };
      },
      verifyClaim() {
        calls.push("authorization.verifyClaim");
        if (options.throwAt === "verify-claim") throw new Error("private verification failure");
        return options.verifyClaim === "invalid"
          ? { status: "invalid", reasonCodes: ["non_authoritative_artifact" as const] }
          : { status: "valid" };
      },
    },
    m19PreparationPort: {
      async prepare() {
        calls.push("m19.prepare");
        if (options.throwAt === "prepare") throw new Error("private preparation failure");
        if (options.networkAdvanceDuringPrepare) witnessCount += 1;
        if (options.holdPreparation) await preparationBarrier;
        if (options.m19PreparationPrecedence === true) {
          const orderedFaults = [
            catalog.scenarios[0]!.primaryFault,
            catalog.scenarios[0]!.precedenceFault,
          ];
          for (const fault of orderedFaults) calls.push(`m19.fault:${fault!.faultKind}`);
          return {
            status: "rejected",
            taxonomyId: "M19-preparation-taxonomy-v1",
            reasonCode: "current_control_rejected",
          };
        }
        return (options.prepareResult ?? terminal) as never;
      },
    },
    finalControlAuthority: {
      issueSnapshot() {
        calls.push("final.issue");
        if (options.throwAt === "final-issue") throw new Error("private snapshot failure");
        return options.finalIssue === "rejected"
          ? { status: "rejected", reasonCode: "authority_expired" }
          : {
              status: "issued",
              snapshot: options.snapshotSubstitution
                ? ({ ...snapshot, snapshotId: "snapshot-substituted" } as never)
                : snapshot,
            };
      },
      verifySnapshot() {
        calls.push("final.verify");
        if (options.throwAt === "final-verify") throw new Error("private snapshot failure");
        return options.finalVerify === "invalid"
          ? { status: "invalid", reasonCode: "snapshot_non_authoritative" }
          : { status: "valid" };
      },
    },
    networkAttemptWitness: {
      readAttemptCount() {
        calls.push("network.read");
        networkReadCount += 1;
        if (options.throwAt === "witness-first" && networkReadCount === 1) {
          throw new Error("private witness failure");
        }
        if (networkReadCount === advanceOnReadNumber) witnessCount += 1;
        return networkReadCount === 1 && options.firstWitnessValue !== undefined
          ? options.firstWitnessValue
          : witnessCount;
      },
    },
  };
  return {
    calls,
    catalog,
    configuration,
    request,
    snapshot,
    releasePreparation: () => releasePreparation?.(),
    setWitnessCount: (count: number) => {
      witnessCount = count;
    },
    advanceOnNetworkRead: (readNumber: number) => {
      advanceOnReadNumber = readNumber;
    },
  };
}

describe("Milestone 20 dry-run conductor", () => {
  it("does not expose test-owned fault construction from the public facade", () => {
    expect("createM20FaultDeclaration" in knowledgeEngineFacade).toBe(false);
  });

  it("normalizes a first witness failure after attempting the mandatory second read", async () => {
    const runtime = setup({ throwAt: "witness-first" });
    const conductor = createM20DryRunConductor(runtime.configuration);
    const first = await conductor.run(runtime.request);
    expect(first).toEqual({
      status: "integrity-rejected",
      reasonCode: "internal_integrity_failure",
    });
    expect(runtime.calls).toEqual(["network.read", "network.read"]);
    const boundary = runtime.calls.length;
    const replay = await conductor.run(runtime.request);
    expect(replay).toBe(first);
    expect(runtime.calls.slice(boundary)).toEqual(["network.read", "network.read"]);
    expect(observedProtectedCounts(runtime.calls.slice(boundary))).toEqual({
      authorizationIssuanceCalls: 0,
      authorizationClaimCalls: 0,
      authorizationVerificationCalls: 0,
      m19PreparationCalls: 0,
      finalControlIssuanceCalls: 0,
      finalControlVerificationCalls: 0,
    });
  });

  it.each(["root", "nested"] as const)(
    "normalizes a throwing %s proxy to invalid input with two witness reads",
    async (position) => {
      const runtime = setup();
      let trapCalls = 0;
      const throwingProxy = new Proxy(runtime.request.authorizationRequest, {
        getPrototypeOf() {
          trapCalls += 1;
          throw new Error("private proxy trap");
        },
        ownKeys() {
          trapCalls += 1;
          throw new Error("private proxy trap");
        },
      });
      const input =
        position === "root"
          ? new Proxy(runtime.request, {
              ownKeys() {
                trapCalls += 1;
                throw new Error("private proxy trap");
              },
            })
          : { ...runtime.request, authorizationRequest: throwingProxy };

      await expect(createM20DryRunConductor(runtime.configuration).run(input)).resolves.toEqual({
        status: "preflight-rejected",
        reasonCode: "invalid_input",
      });
      expect(trapCalls).toBe(0);
      expect(runtime.calls).toEqual(["network.read", "network.read"]);
      expect(observedProtectedCounts(runtime.calls)).toEqual({
        authorizationIssuanceCalls: 0,
        authorizationClaimCalls: 0,
        authorizationVerificationCalls: 0,
        m19PreparationCalls: 0,
        finalControlIssuanceCalls: 0,
        finalControlVerificationCalls: 0,
      });
    },
  );

  it.each([NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid first witness sample %s before protected access",
    async (firstWitnessValue) => {
      const runtime = setup({ firstWitnessValue });
      const conductor = createM20DryRunConductor(runtime.configuration);
      const first = await conductor.run(runtime.request);
      expect(first).toEqual({
        status: "integrity-rejected",
        reasonCode: "internal_integrity_failure",
      });
      expect(runtime.calls).toEqual(["network.read", "network.read"]);
      expect(observedProtectedCounts(runtime.calls)).toEqual({
        authorizationIssuanceCalls: 0,
        authorizationClaimCalls: 0,
        authorizationVerificationCalls: 0,
        m19PreparationCalls: 0,
        finalControlIssuanceCalls: 0,
        finalControlVerificationCalls: 0,
      });
      const boundary = runtime.calls.length;
      const replay = await conductor.run(runtime.request);
      expect(replay).toBe(first);
      expect(runtime.calls.slice(boundary)).toEqual(["network.read", "network.read"]);
      expect(observedProtectedCounts(runtime.calls.slice(boundary))).toEqual({
        authorizationIssuanceCalls: 0,
        authorizationClaimCalls: 0,
        authorizationVerificationCalls: 0,
        m19PreparationCalls: 0,
        finalControlIssuanceCalls: 0,
        finalControlVerificationCalls: 0,
      });
    },
  );

  it.each([
    "issue",
    "claim",
    "verify-decision",
    "verify-claim",
    "prepare",
    "final-issue",
    "final-verify",
  ] as const)(
    "normalizes a throwing %s port and permanently replays integrity",
    async (throwAt) => {
      const runtime = setup({ throwAt });
      const conductor = createM20DryRunConductor(runtime.configuration);
      const result = await conductor.run(runtime.request);
      expect(result).toEqual({
        status: "integrity-rejected",
        reasonCode: "internal_integrity_failure",
      });
      expect(runtime.calls.filter((call) => call === "network.read")).toHaveLength(2);
      const callBoundary = runtime.calls.length;
      const replay = await conductor.run(runtime.request);
      expect(replay).toBe(result);
      expect(runtime.calls.slice(callBoundary)).toEqual(["network.read", "network.read"]);
    },
  );

  it("rejects a nested accessor without invoking it or touching protected ports", async () => {
    const runtime = setup();
    const hostile = structuredClone(runtime.request) as unknown as Record<string, unknown>;
    const authorizationRequest = hostile.authorizationRequest as Record<string, unknown>;
    let accessorCalls = 0;
    Object.defineProperty(authorizationRequest, "purpose", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return "must-not-run";
      },
    });

    await expect(createM20DryRunConductor(runtime.configuration).run(hostile)).resolves.toEqual({
      status: "preflight-rejected",
      reasonCode: "invalid_input",
    });
    expect(accessorCalls).toBe(0);
    expect(runtime.calls).toEqual(["network.read", "network.read"]);
  });

  it("rejects extra structural-port capabilities at factory capture", () => {
    const runtime = setup();
    const configuration = {
      ...runtime.configuration,
      finalControlAuthority: {
        ...runtime.configuration.finalControlAuthority,
        replaceProfile() {
          throw new Error("must not be reachable");
        },
      },
    };

    expect(() => createM20DryRunConductor(configuration)).toThrow(
      "M20 conductor configuration is invalid",
    );
  });

  it("runs the exact owner gate order and returns a self-verifying report", async () => {
    const runtime = setup();
    const conductor = createM20DryRunConductor(runtime.configuration);

    const result = await conductor.run(runtime.request);

    expect(result.status).toBe("dry-run-verified");
    expect(M20DryRunResultSchema.safeParse(result).success).toBe(true);
    if (result.status !== "dry-run-verified") throw new Error("expected verified result");
    expect(result.report.protectedCallCounts).toEqual(SUCCESS_COUNTS);
    expect(result.report.observations.map(({ stage }) => stage)).toEqual(
      SUCCESS_OBSERVATIONS.map(({ stage }) => stage),
    );
    expect(verifyM20DryRunReport(result.report, runtime.request, runtime.catalog)).toEqual({
      status: "valid",
    });
    expect(runtime.calls).toEqual([
      "network.read",
      "authorization.issue",
      "authorization.verifyDecision",
      "authorization.claim",
      "authorization.verifyClaim",
      "m19.prepare",
      "final.issue",
      "final.verify",
      "network.read",
    ]);
  });

  it("installs the owner before the first await and gives exact followers zero protected calls", async () => {
    const runtime = setup({ holdPreparation: true });
    const conductor = createM20DryRunConductor(runtime.configuration);
    const owner = conductor.run(runtime.request);

    const followerBoundary = runtime.calls.length;
    const follower = await conductor.run(runtime.request);
    expect(follower).toEqual({ status: "in-flight", reason: "dry_run_in_progress" });
    expect(runtime.calls.slice(followerBoundary)).toEqual(["network.read", "network.read"]);
    expect(runtime.calls.filter((call) => call === "m19.prepare")).toHaveLength(1);
    runtime.releasePreparation();
    await expect(owner).resolves.toMatchObject({ status: "dry-run-verified" });
  });

  it("permanently replays exact terminal identity and rejects conflicting reuse", async () => {
    const runtime = setup();
    const conductor = createM20DryRunConductor(runtime.configuration);
    const original = await conductor.run(runtime.request);
    const callsAfterOwner = runtime.calls.length;

    const replay = await conductor.run(runtime.request);
    expect(replay).toBe(original);
    expect(runtime.calls.slice(callsAfterOwner)).toEqual(["network.read", "network.read"]);

    const conflict = structuredClone(runtime.request) as M20DryRunRequestV1;
    Object.assign(conflict, { requestFingerprint: "f".repeat(64) });
    expect(await conductor.run(conflict)).toEqual({
      status: "preflight-rejected",
      reasonCode: "invalid_input",
    });

    const validConflict = createM20DryRunRequest({
      ...runtime.request,
      rehearsalEvidenceId: "rehearsal-conflict",
    });
    expect(await conductor.run(validConflict)).toEqual({
      status: "preflight-rejected",
      reasonCode: "conflicting_run_identity",
    });
  });

  it("returns all five unique result discriminants as closed schema-valid results", async () => {
    const successRuntime = setup({ holdPreparation: true });
    const successConductor = createM20DryRunConductor(successRuntime.configuration);
    const owner = successConductor.run(successRuntime.request);
    const inFlight = await successConductor.run(successRuntime.request);
    successRuntime.releasePreparation();
    const verified = await owner;
    const rejectedRuntime = setup({ issueResult: "rejected" });
    const rejected = await createM20DryRunConductor(rejectedRuntime.configuration).run(
      rejectedRuntime.request,
    );
    const integrityRuntime = setup({ throwAt: "issue" });
    const integrity = await createM20DryRunConductor(integrityRuntime.configuration).run(
      integrityRuntime.request,
    );
    const preflightRuntime = setup();
    const preflightResult = await createM20DryRunConductor(preflightRuntime.configuration).run({});
    const results = [preflightResult, inFlight, verified, rejected, integrity];

    expect(results.every((result) => M20DryRunResultSchema.safeParse(result).success)).toBe(true);
    expect(results.map((result) => result.status)).toEqual([
      "preflight-rejected",
      "in-flight",
      "dry-run-verified",
      "dry-run-rejected",
      "integrity-rejected",
    ]);
    expect(new Set(results.map((result) => result.status)).size).toBe(5);
  });

  it("keeps the permanent owner unchanged after a positive-delta replay", async () => {
    const runtime = setup();
    const conductor = createM20DryRunConductor(runtime.configuration);
    const original = await conductor.run(runtime.request);
    runtime.advanceOnNetworkRead(4);

    expect(await conductor.run(runtime.request)).toEqual({
      status: "integrity-rejected",
      reasonCode: "internal_integrity_failure",
    });
    const replayAfterTransientWitnessFailure = await conductor.run(runtime.request);
    expect(replayAfterTransientWitnessFailure).toBe(original);
  });

  it("returns positive-delta follower integrity without replacing the in-flight owner", async () => {
    const runtime = setup({ holdPreparation: true });
    const conductor = createM20DryRunConductor(runtime.configuration);
    const owner = conductor.run(runtime.request);
    runtime.advanceOnNetworkRead(3);
    const followerBoundary = runtime.calls.length;

    expect(await conductor.run(runtime.request)).toEqual({
      status: "integrity-rejected",
      reasonCode: "internal_integrity_failure",
    });
    expect(runtime.calls.slice(followerBoundary)).toEqual(["network.read", "network.read"]);
    runtime.releasePreparation();
    const ownerResult = await owner;
    expect(ownerResult).toEqual({
      status: "integrity-rejected",
      reasonCode: "internal_integrity_failure",
    });
    expect(await conductor.run(runtime.request)).toBe(ownerResult);
  });

  it.each([
    [{ decisionSubstitution: true }, "authorization_issuance_rejected", [1, 0, 1, 0, 0, 0]],
    [{ claimSubstitution: true }, "authorization_claim_rejected", [1, 1, 2, 0, 0, 0]],
    [{ snapshotSubstitution: true }, "final_control_non_authoritative", [1, 1, 2, 1, 1, 1]],
  ] as const)("rejects authority substitution %j", async (options, reasonCode, expectedCounts) => {
    const runtime = setup(options);
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    expect(result.status).toBe("dry-run-rejected");
    if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
    expect(result.report.reasonCode).toBe(reasonCode);
    expect(Object.values(result.report.protectedCallCounts)).toEqual(expectedCounts);
  });

  it("reports a self-verifying scenario authority rejection before protected access", async () => {
    const runtime = setup();
    const substituted = createM20DryRunRequest({
      ...runtime.request,
      scenarioFingerprint: "e".repeat(64),
    });
    const result = await createM20DryRunConductor(runtime.configuration).run(substituted);
    expect(result.status).toBe("dry-run-rejected");
    if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
    expect(result.report.reasonCode).toBe("scenario_non_authoritative");
    expect(result.report.protectedCallCounts).toEqual({
      authorizationIssuanceCalls: 0,
      authorizationClaimCalls: 0,
      authorizationVerificationCalls: 0,
      m19PreparationCalls: 0,
      finalControlIssuanceCalls: 0,
      finalControlVerificationCalls: 0,
    });
    expect(runtime.calls).toEqual(["network.read", "network.read"]);
    expect(verifyM20DryRunReport(result.report, substituted, runtime.catalog)).toEqual({
      status: "valid",
    });
  });

  it.each([
    [{ issueResult: "rejected" as const }, "authorization_issuance_rejected", [1, 0, 0, 0, 0, 0]],
    [{ verifyDecision: "invalid" as const }, "authorization_issuance_rejected", [1, 0, 1, 0, 0, 0]],
    [{ claimResult: "rejected" as const }, "authorization_claim_rejected", [1, 1, 1, 0, 0, 0]],
    [{ verifyClaim: "invalid" as const }, "authorization_claim_rejected", [1, 1, 2, 0, 0, 0]],
    [
      {
        prepareResult: {
          status: "rejected",
          taxonomyId: "M19-preparation-taxonomy-v1",
          reasonCode: "current_control_rejected",
        },
      },
      "preparation_rejected",
      [1, 1, 2, 1, 0, 0],
    ],
    [
      { prepareResult: { status: "disabled-by-policy" } },
      "preparation_non_authoritative",
      [1, 1, 2, 1, 0, 0],
    ],
    [{ finalIssue: "rejected" as const }, "final_control_issuance_rejected", [1, 1, 2, 1, 1, 0]],
    [{ finalVerify: "invalid" as const }, "final_control_non_authoritative", [1, 1, 2, 1, 1, 1]],
    [{ finalDeny: true }, "final_control_rehearsal_denied", [1, 1, 2, 1, 1, 1]],
  ])(
    "applies failure precedence for %j with truthful full call counts",
    async (options, reasonCode, expectedCounts) => {
      const runtime = setup(options);
      const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
      expect(result.status).toBe("dry-run-rejected");
      if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
      expect(result.report.reasonCode).toBe(reasonCode);
      expect(Object.values(result.report.protectedCallCounts)).toEqual(expectedCounts);
      expect(result.report.observations.at(-1)).toMatchObject({ outcome: "rejected", reasonCode });
    },
  );

  it("returns report-free integrity rejection when the network witness advances", async () => {
    const runtime = setup({ networkAdvanceDuringPrepare: true });
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    expect(result).toEqual({
      status: "integrity-rejected",
      reasonCode: "internal_integrity_failure",
    });
  });

  it("constructs denial evidence with fixed final-control precedence", () => {
    const runtime = setup();
    const issued = runtime.configuration.finalControlAuthority.issueSnapshot({} as never);
    if (issued.status !== "issued") throw new Error("expected snapshot");
    const deniedSnapshot = createM20FinalControlSnapshot({
      ...issued.snapshot,
      globalKillSwitch: "deny",
      authorizationExpiryState: "expired",
    });
    const denied = createM20FinalControlRehearsalEvidence({
      rehearsalEvidenceId: "rehearsal-denied",
      snapshot: deniedSnapshot,
    });
    expect(denied).toMatchObject({ outcome: "would-deny", denialReasonCode: "global_disabled" });
  });

  it.each([
    [{ globalKillSwitch: "deny" }, "global_disabled"],
    [{ providerKillSwitch: "deny" }, "provider_disabled"],
    [{ adapterKillSwitch: "deny" }, "adapter_disabled"],
    [{ modelKillSwitch: "deny" }, "model_disabled"],
    [{ environmentKillSwitch: "deny" }, "environment_disabled"],
    [{ operationKillSwitch: "deny" }, "operation_disabled"],
    [{ incidentState: "active" }, "incident_active"],
    [{ credentialReferenceState: "revoked" }, "credential_revoked"],
    [{ credentialReferenceState: "stale" }, "credential_stale"],
    [{ circuitState: "open" }, "circuit_not_closed"],
    [{ healthState: "unhealthy" }, "health_not_healthy"],
    [{ authorizationRevocationState: "revoked" }, "authorization_revoked"],
    [{ authorizationExpiryState: "expired" }, "authorization_expired"],
  ] as const)("applies final-control denial row %j", async (controls, denialReasonCode) => {
    const runtime = setup({ finalControls: controls });
    const evidence = createM20FinalControlRehearsalEvidence({
      rehearsalEvidenceId: runtime.request.rehearsalEvidenceId,
      snapshot: runtime.snapshot,
    });
    expect(evidence).toMatchObject({ outcome: "would-deny", denialReasonCode });
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    expect(result.status).toBe("dry-run-rejected");
    if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
    expect(result.report).toMatchObject({
      reasonCode: "final_control_rehearsal_denied",
      protectedCallCounts: SUCCESS_COUNTS,
    });
  });

  it.each([
    [{ globalKillSwitch: "deny", authorizationExpiryState: "expired" }, "global_disabled"],
    [{ providerKillSwitch: "deny", authorizationExpiryState: "expired" }, "provider_disabled"],
    [{ adapterKillSwitch: "deny", authorizationExpiryState: "expired" }, "adapter_disabled"],
    [{ modelKillSwitch: "deny", authorizationExpiryState: "expired" }, "model_disabled"],
    [
      { environmentKillSwitch: "deny", authorizationExpiryState: "expired" },
      "environment_disabled",
    ],
    [{ operationKillSwitch: "deny", authorizationExpiryState: "expired" }, "operation_disabled"],
    [
      { credentialReferenceState: "revoked", authorizationExpiryState: "expired" },
      "credential_revoked",
    ],
    [{ credentialReferenceState: "revoked", circuitState: "open" }, "credential_revoked"],
    [{ credentialReferenceState: "revoked", healthState: "unhealthy" }, "credential_revoked"],
    [
      { credentialReferenceState: "revoked", authorizationRevocationState: "revoked" },
      "credential_revoked",
    ],
    [
      {
        globalKillSwitch: "deny",
        providerKillSwitch: "deny",
        adapterKillSwitch: "deny",
        modelKillSwitch: "deny",
        environmentKillSwitch: "deny",
        operationKillSwitch: "deny",
      },
      "global_disabled",
    ],
    [{ incidentState: "active", healthState: "unhealthy" }, "incident_active"],
    [{ globalKillSwitch: "deny", providerKillSwitch: "deny" }, "global_disabled"],
    [{ providerKillSwitch: "deny", adapterKillSwitch: "deny" }, "provider_disabled"],
    [{ adapterKillSwitch: "deny", modelKillSwitch: "deny" }, "adapter_disabled"],
    [{ modelKillSwitch: "deny", environmentKillSwitch: "deny" }, "model_disabled"],
    [{ environmentKillSwitch: "deny", operationKillSwitch: "deny" }, "environment_disabled"],
    [{ operationKillSwitch: "deny", incidentState: "active" }, "operation_disabled"],
    [{ incidentState: "active", credentialReferenceState: "revoked" }, "incident_active"],
    [{ credentialReferenceState: "revoked", circuitState: "open" }, "credential_revoked"],
    [{ circuitState: "open", healthState: "unhealthy" }, "circuit_not_closed"],
    [{ healthState: "unhealthy", authorizationRevocationState: "revoked" }, "health_not_healthy"],
    [
      { authorizationRevocationState: "revoked", authorizationExpiryState: "expired" },
      "authorization_revoked",
    ],
  ] as const)(
    "keeps final-control multi-fault precedence for %j",
    async (controls, denialReasonCode) => {
      const runtime = setup({ finalControls: controls });
      const evidence = createM20FinalControlRehearsalEvidence({
        rehearsalEvidenceId: runtime.request.rehearsalEvidenceId,
        snapshot: runtime.snapshot,
      });
      expect(evidence).toMatchObject({ outcome: "would-deny", denialReasonCode });
      const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
      expect(result.status).toBe("dry-run-rejected");
      if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
      expect(result.report).toMatchObject({
        reasonCode: "final_control_rehearsal_denied",
        protectedCallCounts: SUCCESS_COUNTS,
      });
    },
  );

  it("classifies report mutations without invoking external authorities", async () => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const report = structuredClone(result.report) as unknown as Record<string, unknown>;
    report.networkAttemptCount = 1;
    expect(verifyM20DryRunReport(report, runtime.request, runtime.catalog)).toEqual({
      status: "invalid",
      reasonCode: "network_count_nonzero",
    });
  });

  it.each([
    [0, "runId", "run-substituted"],
    [0, "requestFingerprint", "6".repeat(64)],
    [1, "scenarioId", "scenario-substituted"],
    [1, "scenarioFingerprint", "7".repeat(64)],
    [1, "catalogFingerprint", "8".repeat(64)],
    [2, "authorizationDecisionId", "decision-substituted"],
    [2, "authorizationDecisionFingerprint", "1".repeat(64)],
    [3, "authorizationClaimId", "claim-substituted"],
    [3, "authorizationClaimFingerprint", "2".repeat(64)],
    [4, "preparationId", "preparation-substituted"],
    [4, "requestPlanId", "request-plan-substituted"],
    [5, "preparationId", "preparation-substituted"],
    [5, "requestPlanId", "request-plan-substituted"],
    [5, "adapterId", "adapter-substituted"],
    [5, "adapterFingerprint", "3".repeat(64)],
    [5, "evaluatedAt", "2026-08-23T01:00:01.000Z"],
    [6, "rehearsalEvidenceId", "rehearsal-substituted"],
  ] as const)(
    "rejects coordinated re-fingerprinted observation %i field %s",
    async (index, field, replacement) => {
      const runtime = setup();
      const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
      if (result.status !== "dry-run-verified") throw new Error("expected report");
      const mutated = mutateObservation(
        structuredClone(result.report) as unknown as Record<string, unknown>,
        index,
        (_observation, bindings) => {
          bindings[field] = replacement;
        },
      );
      expect(verifyM20DryRunReport(mutated, runtime.request, runtime.catalog)).toEqual({
        status: "invalid",
        reasonCode: "scenario_mismatch",
      });
    },
  );

  it("rejects a coordinated non-literal M19 operation mutation as stage grammar mismatch", async () => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const mutated = mutateObservation(
      structuredClone(result.report) as unknown as Record<string, unknown>,
      5,
      (_observation, bindings) => {
        bindings.operation = "substituted-operation";
      },
    );
    expect(verifyM20DryRunReport(mutated, runtime.request, runtime.catalog)).toEqual({
      status: "invalid",
      reasonCode: "stage_grammar_mismatch",
    });
  });

  it.each([
    ["count", "call_count_mismatch"],
    ["stage", "stage_grammar_mismatch"],
    ["assertion", "assertion_mismatch"],
    ["observation-fingerprint", "fingerprint_mismatch"],
    ["report-fingerprint", "fingerprint_mismatch"],
    ["terminal", "terminal_discriminant_mismatch"],
  ] as const)("classifies a coordinated %s mutation", async (kind, reasonCode) => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const report = structuredClone(result.report) as unknown as Record<string, unknown>;
    const observations = report.observations as Record<string, unknown>[];
    if (kind === "count") {
      (report.protectedCallCounts as Record<string, unknown>).authorizationIssuanceCalls = 0;
      resignReport(report);
    } else if (kind === "stage") {
      [observations[2], observations[3]] = [observations[3]!, observations[2]!];
      resignReport(report);
    } else if (kind === "assertion") {
      (
        (report.securityAssertions as Record<string, unknown>[])[0] as Record<string, unknown>
      ).status = "failed";
      resignReport(report);
    } else if (kind === "observation-fingerprint") {
      observations[0]!.observationFingerprint = "4".repeat(64);
    } else if (kind === "report-fingerprint") {
      report.reportFingerprint = "5".repeat(64);
    } else {
      report.status = "dry-run-rejected";
      report.reasonCode = "scenario_non_authoritative";
      resignReport(report);
    }
    expect(verifyM20DryRunReport(report, runtime.request, runtime.catalog)).toEqual({
      status: "invalid",
      reasonCode,
    });
  });

  it("classifies assertion tampering before a coordinated scenario mismatch", async () => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const report = structuredClone(result.report) as unknown as Record<string, unknown>;
    report.runId = "run-substituted";
    (
      (report.securityAssertions as Record<string, unknown>[])[0] as Record<string, unknown>
    ).status = "failed";
    resignReport(report);
    expect(verifyM20DryRunReport(report, runtime.request, runtime.catalog)).toEqual({
      status: "invalid",
      reasonCode: "assertion_mismatch",
    });
  });

  it.each([
    ["report", "root-proxy"],
    ["request", "root-proxy"],
    ["catalog", "root-proxy"],
    ["report", "property-get-proxy"],
    ["request", "property-get-proxy"],
    ["catalog", "property-get-proxy"],
    ["report", "nested-proxy"],
    ["request", "nested-proxy"],
    ["catalog", "nested-proxy"],
    ["report", "accessor"],
    ["request", "accessor"],
    ["catalog", "accessor"],
    ["report", "nested-accessor"],
    ["request", "nested-accessor"],
    ["catalog", "nested-accessor"],
  ] as const)("closes a hostile %s %s verifier input", async (target, attack) => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const inputs: Record<"report" | "request" | "catalog", unknown> = {
      report: structuredClone(result.report),
      request: structuredClone(runtime.request),
      catalog: structuredClone(runtime.catalog),
    };
    let trapCalls = 0;
    if (attack === "root-proxy") {
      inputs[target] = new Proxy(inputs[target] as object, {
        ownKeys() {
          trapCalls += 1;
          throw new Error(`raw-verifier-proxy:${target}`);
        },
      });
    } else if (attack === "property-get-proxy") {
      inputs[target] = new Proxy(inputs[target] as object, {
        get(_source, key) {
          trapCalls += 1;
          if (target === "report" && key === "networkAttemptCount") {
            throw new Error("raw-verifier-proxy:networkAttemptCount");
          }
          throw new Error(`raw-verifier-property-access:${target}:${String(key)}`);
        },
      });
    } else if (attack === "nested-proxy") {
      const root = inputs[target] as Record<string, unknown>;
      const [container, key] =
        target === "report"
          ? [root, "protectedCallCounts"]
          : target === "request"
            ? [root, "authorizationRequest"]
            : [root, "scenarios"];
      container[key] = new Proxy(container[key] as object, {
        getPrototypeOf() {
          trapCalls += 1;
          throw new Error(`raw-verifier-nested-proxy:${target}`);
        },
      });
    } else if (attack === "accessor") {
      const root = inputs[target] as Record<string, unknown>;
      const key =
        target === "report"
          ? "networkAttemptCount"
          : target === "request"
            ? "runId"
            : "catalogVersion";
      Object.defineProperty(root, key, {
        enumerable: true,
        get() {
          trapCalls += 1;
          throw new Error(`raw-verifier-accessor:${target}`);
        },
      });
    } else {
      const root = inputs[target] as Record<string, unknown>;
      const [container, key] =
        target === "report"
          ? [root.protectedCallCounts as Record<string, unknown>, "authorizationIssuanceCalls"]
          : target === "request"
            ? [root.authorizationRequest as Record<string, unknown>, "purpose"]
            : [
                (root.scenarios as Record<string, unknown>[])[0] as Record<string, unknown>,
                "scenarioId",
              ];
      Object.defineProperty(container, key, {
        enumerable: true,
        get() {
          trapCalls += 1;
          throw new Error(`raw-verifier-nested-accessor:${target}`);
        },
      });
    }

    expect(() =>
      verifyM20DryRunReport(inputs.report, inputs.request, inputs.catalog),
    ).not.toThrow();
    expect(verifyM20DryRunReport(inputs.report, inputs.request, inputs.catalog)).toEqual({
      status: "invalid",
      reasonCode: "invalid_artifact",
    });
    expect(trapCalls).toBe(0);
  });

  it.each(["report", "request", "catalog"] as const)(
    "bounds deeply nested %s verifier input without throwing",
    async (target) => {
      const runtime = setup();
      const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
      if (result.status !== "dry-run-verified") throw new Error("expected report");
      const inputs: Record<"report" | "request" | "catalog", Record<string, unknown>> = {
        report: structuredClone(result.report) as unknown as Record<string, unknown>,
        request: structuredClone(runtime.request) as unknown as Record<string, unknown>,
        catalog: structuredClone(runtime.catalog) as unknown as Record<string, unknown>,
      };
      const deep: Record<string, unknown> = {};
      let cursor = deep;
      for (let depth = 0; depth < 20_000; depth += 1) {
        const next: Record<string, unknown> = {};
        cursor.next = next;
        cursor = next;
      }
      inputs[target].beyondCaptureBound = deep;

      expect(() =>
        verifyM20DryRunReport(inputs.report, inputs.request, inputs.catalog),
      ).not.toThrow();
      expect(verifyM20DryRunReport(inputs.report, inputs.request, inputs.catalog)).toEqual({
        status: "invalid",
        reasonCode: "invalid_artifact",
      });
    },
  );

  it("accepts the schema-maximum 256-scenario catalog at the public verifier boundary", async () => {
    const runtime = setup();
    const catalog = createMaximumScenarioCatalog(runtime.catalog);
    const request = createM20DryRunRequest({
      ...runtime.request,
      scenarioFingerprint: catalog.scenarios[0]!.scenarioFingerprint,
      catalogFingerprint: catalog.catalogFingerprint,
    });
    const conductor = createM20DryRunConductor({ ...runtime.configuration, catalog });
    const result = await conductor.run(request);
    expect(result.status).toBe("dry-run-verified");
    if (result.status !== "dry-run-verified") throw new Error("expected verified report");
    expect(verifyM20DryRunReport(result.report, request, catalog)).toEqual({ status: "valid" });
  });

  it("rejects a 257-scenario catalog before materializing its array descriptors", async () => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const catalog = createMaximumScenarioCatalog(runtime.catalog);
    const finalScenario = createM20ScenarioDescriptor({
      ...catalog.scenarios.at(-1)!,
      scenarioId: "zz-scenario-255",
      finalControlProfileReference: "final-control/zz-scenario-255",
    });
    const scenarios = [...catalog.scenarios, finalScenario];
    const oneOverCatalog = { ...catalog, scenarios };
    const inspectDescriptors = Object.getOwnPropertyDescriptors;
    let wideDescriptorMaterializations = 0;
    const spy = vi.spyOn(Object, "getOwnPropertyDescriptors").mockImplementation(((
      candidate: object,
    ) => {
      if (candidate === scenarios) wideDescriptorMaterializations += 1;
      return inspectDescriptors(candidate);
    }) as typeof Object.getOwnPropertyDescriptors);
    try {
      expect(verifyM20DryRunReport(result.report, runtime.request, oneOverCatalog)).toEqual({
        status: "invalid",
        reasonCode: "invalid_artifact",
      });
      expect(wideDescriptorMaterializations).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects an over-wide plain report before materializing its descriptors", async () => {
    const runtime = setup();
    const wideReport = Object.fromEntries(
      Array.from({ length: 258 }, (_entry, index) => [`field-${index}`, index]),
    );
    const inspectDescriptors = Object.getOwnPropertyDescriptors;
    let wideDescriptorMaterializations = 0;
    const spy = vi.spyOn(Object, "getOwnPropertyDescriptors").mockImplementation(((
      candidate: object,
    ) => {
      if (candidate === wideReport) wideDescriptorMaterializations += 1;
      return inspectDescriptors(candidate);
    }) as typeof Object.getOwnPropertyDescriptors);
    try {
      expect(verifyM20DryRunReport(wideReport, runtime.request, runtime.catalog)).toEqual({
        status: "invalid",
        reasonCode: "invalid_artifact",
      });
      expect(wideDescriptorMaterializations).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("classifies a coordinated reasonCode added to success as terminal discriminant mismatch", async () => {
    const runtime = setup();
    const result = await createM20DryRunConductor(runtime.configuration).run(runtime.request);
    if (result.status !== "dry-run-verified") throw new Error("expected report");
    const report = structuredClone(result.report) as unknown as Record<string, unknown>;
    report.reasonCode = "scenario_non_authoritative";
    resignReport(report);

    expect(verifyM20DryRunReport(report, runtime.request, runtime.catalog)).toEqual({
      status: "invalid",
      reasonCode: "terminal_discriminant_mismatch",
    });
  });

  it.each([
    [
      "scenario before M17",
      { issueResult: "rejected" as const },
      "scenario_non_authoritative",
      ["request-accepted", "scenario-authority-verified"],
      [0, 0, 0, 0, 0, 0],
      "authorization.issue",
    ],
    [
      "M17 issuance before M17 claim",
      { issueResult: "rejected" as const, claimResult: "rejected" as const },
      "authorization_issuance_rejected",
      ["request-accepted", "scenario-authority-verified", "authorization-issued"],
      [1, 0, 0, 0, 0, 0],
      "authorization.claim",
    ],
    [
      "M17 claim before M19",
      {
        claimResult: "rejected" as const,
        prepareResult: {
          status: "rejected",
          taxonomyId: "M19-preparation-taxonomy-v1",
          reasonCode: "current_control_rejected",
        },
      },
      "authorization_claim_rejected",
      [
        "request-accepted",
        "scenario-authority-verified",
        "authorization-issued",
        "authorization-claimed",
      ],
      [1, 1, 1, 0, 0, 0],
      "m19.prepare",
    ],
    [
      "M19 before final control",
      {
        prepareResult: {
          status: "rejected",
          taxonomyId: "M19-preparation-taxonomy-v1",
          reasonCode: "current_control_rejected",
        },
        finalIssue: "rejected" as const,
      },
      "preparation_rejected",
      [
        "request-accepted",
        "scenario-authority-verified",
        "authorization-issued",
        "authorization-claimed",
        "preparation-started",
        "preparation-disabled-bound",
      ],
      [1, 1, 2, 1, 0, 0],
      "final.issue",
    ],
    [
      "M19 governed rejection before a non-authoritative terminal",
      { m19PreparationPrecedence: true as const },
      "preparation_rejected",
      [
        "request-accepted",
        "scenario-authority-verified",
        "authorization-issued",
        "authorization-claimed",
        "preparation-started",
        "preparation-disabled-bound",
      ],
      [1, 1, 2, 1, 0, 0],
      "final.issue",
    ],
    [
      "M19 non-authoritative terminal before final control",
      { prepareResult: { status: "disabled-by-policy" }, finalIssue: "rejected" as const },
      "preparation_non_authoritative",
      [
        "request-accepted",
        "scenario-authority-verified",
        "authorization-issued",
        "authorization-claimed",
        "preparation-started",
        "preparation-disabled-bound",
      ],
      [1, 1, 2, 1, 0, 0],
      "final.issue",
    ],
    [
      "final issuance before final verification",
      { finalIssue: "rejected" as const, finalVerify: "invalid" as const },
      "final_control_issuance_rejected",
      SUCCESS_STAGES.slice(0, 7),
      [1, 1, 2, 1, 1, 0],
      "final.verify",
    ],
    [
      "final verification before rehearsal denial",
      { finalVerify: "invalid" as const, finalDeny: true },
      "final_control_non_authoritative",
      SUCCESS_STAGES.slice(0, 7),
      [1, 1, 2, 1, 1, 1],
      "no-network-verified",
    ],
  ] as const)(
    "keeps adjacent boundary precedence: %s",
    async (_name, options, reasonCode, expectedStages, expectedCounts, forbiddenLaterCall) => {
      const runtime = setup(options);
      const request =
        reasonCode === "scenario_non_authoritative"
          ? createM20DryRunRequest({ ...runtime.request, scenarioFingerprint: "e".repeat(64) })
          : runtime.request;
      const result = await createM20DryRunConductor(runtime.configuration).run(request);
      expect(result.status).toBe("dry-run-rejected");
      if (result.status !== "dry-run-rejected") throw new Error("expected rejection");
      expect(result.report.reasonCode).toBe(reasonCode);
      expect(result.report.observations.map(({ stage }) => stage)).toEqual(expectedStages);
      expect(result.report.observations.map(({ stage, outcome }) => ({ stage, outcome }))).toEqual(
        expectedStages.map((stage, index) => ({
          stage,
          outcome: index === expectedStages.length - 1 ? "rejected" : "completed",
        })),
      );
      expect(Object.values(result.report.protectedCallCounts)).toEqual(expectedCounts);
      expect(observedProtectedCounts(runtime.calls)).toEqual(result.report.protectedCallCounts);
      expect(runtime.calls).not.toContain(forbiddenLaterCall);
      if (_name === "M19 governed rejection before a non-authoritative terminal") {
        expect(runtime.catalog.scenarios[0]).toMatchObject({
          purpose: "precedence",
          primaryFault: { faultKind: "current-control-rejected" },
          precedenceFault: {
            faultKind: "m19-terminal-malformed-or-known-coordinate-mismatch",
          },
        });
        expect(runtime.calls.filter((call) => call.startsWith("m19.fault:"))).toEqual([
          "m19.fault:current-control-rejected",
          "m19.fault:m19-terminal-malformed-or-known-coordinate-mismatch",
        ]);
      }
    },
  );

  it("keeps conflict precedence over a coordinated scenario fault", async () => {
    const runtime = setup();
    const conductor = createM20DryRunConductor(runtime.configuration);
    await conductor.run(runtime.request);
    const boundary = runtime.calls.length;
    const conflict = createM20DryRunRequest({
      ...runtime.request,
      scenarioFingerprint: "e".repeat(64),
      rehearsalEvidenceId: "rehearsal-conflicting-scenario",
    });

    expect(await conductor.run(conflict)).toEqual({
      status: "preflight-rejected",
      reasonCode: "conflicting_run_identity",
    });
    expect(runtime.calls.slice(boundary)).toEqual(["network.read", "network.read"]);
    expect(observedProtectedCounts(runtime.calls.slice(boundary))).toEqual({
      authorizationIssuanceCalls: 0,
      authorizationClaimCalls: 0,
      authorizationVerificationCalls: 0,
      m19PreparationCalls: 0,
      finalControlIssuanceCalls: 0,
      finalControlVerificationCalls: 0,
    });
  });
});
