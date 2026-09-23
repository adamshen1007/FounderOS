import { z } from "zod";

import {
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  ExecutionAuthorizationIdentifierSchema,
  ExecutionAuthorizationRequestSchema,
  HumanExecutionApprovalEvidenceSchema,
  VerifiedServiceIdentityEvidenceSchema,
} from "./authorization.js";
import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import { CredentialResolutionRequestSchema } from "./credential-resolution.js";
import {
  CredentialEnvironmentClassSchema,
  ProviderReadinessLogicalReferenceSchema,
} from "./provider-readiness.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";

const NonNegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const PositionSchema = z.number().int().min(1).max(8);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function canonical<T extends z.ZodType>(contract: T) {
  const pipeline = DurableCanonicalJsonValueSchema.pipe(contract as never) as z.ZodPipe<
    typeof DurableCanonicalJsonValueSchema,
    T
  >;
  return pipeline.transform((value) => deepFreeze(value));
}

function temporal(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function issue(
  context: z.RefinementCtx,
  path: readonly (string | number)[],
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: [...path] });
}

export const M20ContractVersionSchema = z.literal("1.0");
export const M20ScenarioCatalogVersionSchema = z.literal("m20-scenario-catalog-v1");
export const M20DryRunTaxonomyIdSchema = z.literal("M20-dry-run-taxonomy-v1");
export const M20FinalControlPolicyVersionSchema = z.literal("m20-final-control-policy-v1");

export const M20_FINGERPRINT_DOMAINS = Object.freeze({
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
} as const);

export const M20FingerprintDomainSchema = z.enum([
  M20_FINGERPRINT_DOMAINS.request,
  M20_FINGERPRINT_DOMAINS.fault,
  M20_FINGERPRINT_DOMAINS.scenario,
  M20_FINGERPRINT_DOMAINS.catalog,
  M20_FINGERPRINT_DOMAINS.stageObservation,
  M20_FINGERPRINT_DOMAINS.finalControlAuthority,
  M20_FINGERPRINT_DOMAINS.finalControlSnapshot,
  M20_FINGERPRINT_DOMAINS.finalControlProfile,
  M20_FINGERPRINT_DOMAINS.rehearsalEvidence,
  M20_FINGERPRINT_DOMAINS.report,
]);

export const M20FaultKindSchema = z.enum([
  "authorization-issuance-denied",
  "authorization-decision-non-authoritative",
  "authorization-claim-conflict",
  "authorization-claim-non-authoritative",
  "readiness-non-authoritative",
  "model-policy-invalid",
  "instruction-profile-invalid",
  "prompt-cache-policy-invalid",
  "current-control-rejected",
  "credential-unavailable",
  "credential-rotation-stale",
  "credential-revoked",
  "credential-deadline-expired",
  "credential-materialization-fault",
  "credential-release-fault",
  "m19-terminal-malformed-or-known-coordinate-mismatch",
  "final-control-snapshot-issuance-fault",
  "final-control-snapshot-non-authoritative",
  "final-control-global-disabled",
  "final-control-provider-disabled",
  "final-control-adapter-disabled",
  "final-control-model-disabled",
  "final-control-environment-disabled",
  "final-control-operation-disabled",
  "final-control-incident-active",
  "final-control-credential-revoked",
  "final-control-credential-stale",
  "final-control-circuit-not-closed",
  "final-control-health-not-healthy",
  "final-control-authorization-revoked",
  "final-control-authorization-expired",
]);

export const M20StageSchema = z.enum([
  "request-accepted",
  "scenario-authority-verified",
  "authorization-issued",
  "authorization-claimed",
  "preparation-started",
  "preparation-disabled-bound",
  "final-control-rehearsal-complete",
  "no-network-verified",
]);

export const M20AffectedBoundarySchema = z.enum([
  "m17-issuance",
  "m17-claim",
  "m19-readiness",
  "m19-policy",
  "m18-resolution",
  "m19-terminal",
  "m20-final-control-authority",
]);

export const M20ScenarioPurposeSchema = z.enum([
  "success",
  "single-fault",
  "precedence",
  "concurrency",
  "replay",
]);

export const M20TerminalReasonCodeSchema = z.enum([
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

export const M20ReportedReasonCodeSchema = z.enum(
  M20TerminalReasonCodeSchema.options.filter(
    (
      reason,
    ): reason is Exclude<
      z.infer<typeof M20TerminalReasonCodeSchema>,
      "internal_integrity_failure"
    > => reason !== "internal_integrity_failure",
  ) as [
    Exclude<z.infer<typeof M20TerminalReasonCodeSchema>, "internal_integrity_failure">,
    ...Exclude<z.infer<typeof M20TerminalReasonCodeSchema>, "internal_integrity_failure">[],
  ],
);

export const M20ArtifactVerificationReasonCodeSchema = z.enum([
  "invalid_artifact",
  "fingerprint_mismatch",
  "scenario_mismatch",
  "stage_grammar_mismatch",
  "call_count_mismatch",
  "assertion_mismatch",
  "network_count_nonzero",
  "terminal_discriminant_mismatch",
]);

export const M20FaultDeclarationSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      faultId: ExecutionAuthorizationIdentifierSchema,
      faultKind: M20FaultKindSchema,
      injectionStage: M20StageSchema,
      affectedBoundary: M20AffectedBoundarySchema,
      fixtureReference: ProviderReadinessLogicalReferenceSchema,
      faultFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const M20ProtectedCallCountsSchema = canonical(
  z
    .object({
      authorizationIssuanceCalls: NonNegativeSafeIntegerSchema.max(1),
      authorizationClaimCalls: NonNegativeSafeIntegerSchema.max(1),
      authorizationVerificationCalls: NonNegativeSafeIntegerSchema.max(2),
      m19PreparationCalls: NonNegativeSafeIntegerSchema.max(1),
      finalControlIssuanceCalls: NonNegativeSafeIntegerSchema.max(1),
      finalControlVerificationCalls: NonNegativeSafeIntegerSchema.max(1),
    })
    .strict(),
);

export const M20ExpectedObservationSchema = canonical(
  z.object({ stage: M20StageSchema, outcome: z.enum(["completed", "rejected"]) }).strict(),
);

const M20OwnerResultSchema = z.enum(["dry-run-verified", "dry-run-rejected", "integrity-rejected"]);
const M20FollowerResultSchema = z.enum([
  "in-flight",
  "dry-run-verified",
  "dry-run-rejected",
  "integrity-rejected",
]);

const ScenarioDescriptorObjectSchema = z
  .object({
    schemaVersion: M20ContractVersionSchema,
    scenarioId: ExecutionAuthorizationIdentifierSchema,
    scenarioVersion: ProviderReadinessLogicalReferenceSchema,
    catalogVersion: M20ScenarioCatalogVersionSchema,
    purpose: M20ScenarioPurposeSchema,
    expectedOwnerResult: M20OwnerResultSchema,
    expectedOwnerReasonCode: M20TerminalReasonCodeSchema.optional(),
    expectedFollowerResult: M20FollowerResultSchema.optional(),
    expectedObservations: z.array(M20ExpectedObservationSchema).min(1).max(8),
    expectedOwnerCallCounts: M20ProtectedCallCountsSchema,
    expectedFollowerCallDelta: M20ProtectedCallCountsSchema.optional(),
    finalControlProfileReference: ProviderReadinessLogicalReferenceSchema,
    primaryFault: M20FaultDeclarationSchema.optional(),
    precedenceFault: M20FaultDeclarationSchema.optional(),
    scenarioFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const rejected = value.expectedOwnerResult !== "dry-run-verified";
    if (rejected !== (value.expectedOwnerReasonCode !== undefined)) {
      issue(context, ["expectedOwnerReasonCode"], "Owner rejection requires exactly one reason");
    }
    if (
      value.expectedOwnerResult === "integrity-rejected" &&
      value.expectedOwnerReasonCode !== "internal_integrity_failure"
    ) {
      issue(context, ["expectedOwnerReasonCode"], "Integrity rejection requires its exact reason");
    }
    if (
      value.expectedOwnerResult === "dry-run-rejected" &&
      value.expectedOwnerReasonCode === "internal_integrity_failure"
    ) {
      issue(context, ["expectedOwnerReasonCode"], "Reported rejection cannot use integrity reason");
    }

    const followerPurpose = value.purpose === "concurrency" || value.purpose === "replay";
    if (
      followerPurpose
        ? value.expectedFollowerResult === undefined ||
          value.expectedFollowerCallDelta === undefined
        : value.expectedFollowerResult !== undefined ||
          value.expectedFollowerCallDelta !== undefined
    ) {
      issue(
        context,
        ["expectedFollowerResult"],
        "Follower expectations are required only for follower scenarios",
      );
    }
    if (value.purpose === "concurrency" && value.expectedFollowerResult !== "in-flight") {
      issue(context, ["expectedFollowerResult"], "Concurrent follower must be in flight");
    }
    if (value.purpose === "replay" && value.expectedFollowerResult !== value.expectedOwnerResult) {
      issue(
        context,
        ["expectedFollowerResult"],
        "Replay follower must equal owner terminal result",
      );
    }
    if (
      value.expectedFollowerCallDelta !== undefined &&
      Object.values(value.expectedFollowerCallDelta).some((count) => count !== 0)
    ) {
      issue(context, ["expectedFollowerCallDelta"], "Follower protected-call delta must be zero");
    }
  });

export const M20ScenarioDescriptorSchema = canonical(ScenarioDescriptorObjectSchema);

export const M20ScenarioCatalogSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      catalogVersion: M20ScenarioCatalogVersionSchema,
      scenarios: z.array(M20ScenarioDescriptorSchema).min(1).max(256),
      catalogFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const scenarioIds = value.scenarios.map((scenario) => scenario.scenarioId);
      if (scenarioIds.some((id, index) => index > 0 && scenarioIds[index - 1]! >= id)) {
        issue(
          context,
          ["scenarios"],
          "Scenarios must be uniquely ordered by ascending scenario ID",
        );
      }
      if (value.scenarios.some((scenario) => scenario.catalogVersion !== value.catalogVersion)) {
        issue(context, ["scenarios"], "Scenario catalog version must match its catalog");
      }
      const faultIds = new Set<string>();
      const fixtureReferences = new Set<string>();
      const profileReferences = new Set<string>();
      for (const [index, scenario] of value.scenarios.entries()) {
        if (profileReferences.has(scenario.finalControlProfileReference)) {
          issue(context, ["scenarios", index], "Final-control profile references must be unique");
        }
        profileReferences.add(scenario.finalControlProfileReference);
        for (const fault of [scenario.primaryFault, scenario.precedenceFault]) {
          if (fault === undefined) continue;
          if (faultIds.has(fault.faultId))
            issue(context, ["scenarios", index], "Fault IDs must be unique");
          if (fixtureReferences.has(fault.fixtureReference)) {
            issue(context, ["scenarios", index], "Fault fixture references must be unique");
          }
          faultIds.add(fault.faultId);
          fixtureReferences.add(fault.fixtureReference);
        }
      }
    }),
);

export const M20DryRunRequestSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      runId: ExecutionAuthorizationIdentifierSchema,
      scenarioId: ExecutionAuthorizationIdentifierSchema,
      scenarioFingerprint: Sha256DigestSchema,
      catalogFingerprint: Sha256DigestSchema,
      evaluatedAt: IsoTemporalSchema,
      rehearsalEvaluatedAt: IsoTemporalSchema,
      authorizationRequest: ExecutionAuthorizationRequestSchema,
      serviceIdentityEvidence: VerifiedServiceIdentityEvidenceSchema,
      humanApprovalEvidence: HumanExecutionApprovalEvidenceSchema,
      authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
      authorizationDecisionExpiresAt: IsoTemporalSchema,
      authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
      preparationId: ExecutionAuthorizationIdentifierSchema,
      requestPlanId: ExecutionAuthorizationIdentifierSchema,
      credentialResolutionRequest: CredentialResolutionRequestSchema,
      finalControlSnapshotId: ExecutionAuthorizationIdentifierSchema,
      rehearsalEvidenceId: ExecutionAuthorizationIdentifierSchema,
      requestFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (temporal(value.rehearsalEvaluatedAt, value.evaluatedAt) < 0) {
        issue(context, ["rehearsalEvaluatedAt"], "Rehearsal time cannot precede evaluation time");
      }
      if (temporal(value.authorizationDecisionExpiresAt, value.evaluatedAt) <= 0) {
        issue(
          context,
          ["authorizationDecisionExpiresAt"],
          "Decision expiration must follow evaluation time",
        );
      }
    }),
);

const ControlFields = {
  globalKillSwitch: z.enum(["allow", "deny"]),
  providerKillSwitch: z.enum(["allow", "deny"]),
  adapterKillSwitch: z.enum(["allow", "deny"]),
  modelKillSwitch: z.enum(["allow", "deny"]),
  environmentKillSwitch: z.enum(["allow", "deny"]),
  operationKillSwitch: z.enum(["allow", "deny"]),
  incidentState: z.enum(["clear", "active"]),
  credentialReferenceState: z.enum(["current", "revoked", "stale"]),
  circuitState: z.enum(["closed", "open", "half-open"]),
  healthState: z.enum(["healthy", "unhealthy", "unavailable", "quarantined"]),
  authorizationRevocationState: z.enum(["active", "revoked"]),
} as const;

const SnapshotCoordinateFields = {
  authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
  authorizationDecisionFingerprint: Sha256DigestSchema,
  authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
  authorizationClaimFingerprint: Sha256DigestSchema,
  executionAttemptId: ExecutionAuthorizationIdentifierSchema,
  executionAttemptFingerprint: Sha256DigestSchema,
  adapterId: ExecutionAuthorizationIdentifierSchema,
  adapterFingerprint: Sha256DigestSchema,
  modelPolicyReference: ProviderReadinessLogicalReferenceSchema,
  modelPolicyFingerprint: Sha256DigestSchema,
  providerFamilyReference: z.literal("provider-family/openai"),
  environmentClass: CredentialEnvironmentClassSchema,
  operation: z.literal("founder-decision-memo"),
  credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
  credentialReferenceFingerprint: Sha256DigestSchema,
  credentialRotationVersion: ProviderReadinessLogicalReferenceSchema,
} as const;

export const M20FinalControlProfileSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      profileReference: ProviderReadinessLogicalReferenceSchema,
      scenarioId: ExecutionAuthorizationIdentifierSchema,
      validFrom: IsoTemporalSchema,
      validUntil: IsoTemporalSchema,
      ...ControlFields,
      profileFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (temporal(value.validUntil, value.validFrom) <= 0) {
        issue(context, ["validUntil"], "Profile validity end must follow start");
      }
    }),
);

export const M20FinalControlSnapshotSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      snapshotId: ExecutionAuthorizationIdentifierSchema,
      runId: ExecutionAuthorizationIdentifierSchema,
      rehearsalEvaluatedAt: IsoTemporalSchema,
      validFrom: IsoTemporalSchema,
      validUntil: IsoTemporalSchema,
      authorityId: ExecutionAuthorizationIdentifierSchema,
      authorityFingerprint: Sha256DigestSchema,
      ...SnapshotCoordinateFields,
      ...ControlFields,
      authorizationExpiryState: z.enum(["current", "expired"]),
      snapshotFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (temporal(value.rehearsalEvaluatedAt, value.validFrom) < 0) {
        issue(context, ["rehearsalEvaluatedAt"], "Snapshot cannot precede its validity window");
      }
      if (temporal(value.rehearsalEvaluatedAt, value.validUntil) >= 0) {
        issue(context, ["validUntil"], "Snapshot validity end must follow rehearsal time");
      }
    }),
);

const M19DisabledTerminalSchema = canonical(
  z
    .object({
      status: z.literal("disabled-by-policy"),
      preparationId: ExecutionAuthorizationIdentifierSchema,
      requestPlanId: ExecutionAuthorizationIdentifierSchema,
      requestPlanFingerprint: Sha256DigestSchema,
      credentialResolutionEvidenceFingerprint: Sha256DigestSchema,
      disabledPolicyFingerprint: Sha256DigestSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      operation: z.literal("founder-decision-memo"),
      disabledPolicyVersion: ProviderReadinessLogicalReferenceSchema,
      evaluatedAt: IsoTemporalSchema,
    })
    .strict(),
);

export const M20FinalControlSnapshotIssuanceRequestSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      snapshotId: ExecutionAuthorizationIdentifierSchema,
      runId: ExecutionAuthorizationIdentifierSchema,
      scenarioId: ExecutionAuthorizationIdentifierSchema,
      scenarioFingerprint: Sha256DigestSchema,
      catalogFingerprint: Sha256DigestSchema,
      rehearsalEvaluatedAt: IsoTemporalSchema,
      decision: ExecutionAuthorizationDecisionSchema,
      claim: ExecutionAuthorizationClaimSchema,
      credentialResolutionRequest: CredentialResolutionRequestSchema,
      m19Terminal: M19DisabledTerminalSchema,
    })
    .strict(),
);

export const M20FinalControlSnapshotIssuanceReasonCodeSchema = z.enum([
  "invalid_snapshot_request",
  "conflicting_snapshot_identity",
  "scenario_profile_non_authoritative",
  "coordinate_mismatch",
  "authority_expired",
  "internal_snapshot_authority_failure",
]);

export const M20FinalControlSnapshotIssuanceResultSchema = canonical(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("issued"), snapshot: M20FinalControlSnapshotSchema }).strict(),
    z
      .object({
        status: z.literal("rejected"),
        reasonCode: M20FinalControlSnapshotIssuanceReasonCodeSchema,
      })
      .strict(),
  ]),
);

export const M20FinalControlSnapshotVerificationRequestSchema = canonical(
  z
    .object({
      schemaVersion: M20ContractVersionSchema,
      runId: ExecutionAuthorizationIdentifierSchema,
      snapshot: M20FinalControlSnapshotSchema,
    })
    .strict(),
);

export const M20FinalControlSnapshotVerificationResultSchema = canonical(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("valid") }).strict(),
    z
      .object({
        status: z.literal("invalid"),
        reasonCode: z.literal("snapshot_non_authoritative"),
      })
      .strict(),
  ]),
);

export const M20FinalControlDenialReasonCodeSchema = z.enum([
  "global_disabled",
  "provider_disabled",
  "adapter_disabled",
  "model_disabled",
  "environment_disabled",
  "operation_disabled",
  "incident_active",
  "credential_revoked",
  "credential_stale",
  "circuit_not_closed",
  "health_not_healthy",
  "authorization_revoked",
  "authorization_expired",
]);

type Controls = z.infer<z.ZodObject<typeof ControlFields>> & {
  readonly authorizationExpiryState: "current" | "expired";
};

function denialReason(
  value: Controls,
): z.infer<typeof M20FinalControlDenialReasonCodeSchema> | null {
  if (value.globalKillSwitch === "deny") return "global_disabled";
  if (value.providerKillSwitch === "deny") return "provider_disabled";
  if (value.adapterKillSwitch === "deny") return "adapter_disabled";
  if (value.modelKillSwitch === "deny") return "model_disabled";
  if (value.environmentKillSwitch === "deny") return "environment_disabled";
  if (value.operationKillSwitch === "deny") return "operation_disabled";
  if (value.incidentState === "active") return "incident_active";
  if (value.credentialReferenceState === "revoked") return "credential_revoked";
  if (value.credentialReferenceState === "stale") return "credential_stale";
  if (value.circuitState !== "closed") return "circuit_not_closed";
  if (value.healthState !== "healthy") return "health_not_healthy";
  if (value.authorizationRevocationState === "revoked") return "authorization_revoked";
  if (value.authorizationExpiryState === "expired") return "authorization_expired";
  return null;
}

const RehearsalCommonFields = {
  schemaVersion: M20ContractVersionSchema,
  rehearsalEvidenceId: ExecutionAuthorizationIdentifierSchema,
  runId: ExecutionAuthorizationIdentifierSchema,
  snapshotId: ExecutionAuthorizationIdentifierSchema,
  snapshotFingerprint: Sha256DigestSchema,
  rehearsalEvaluatedAt: IsoTemporalSchema,
  ...SnapshotCoordinateFields,
  ...ControlFields,
  authorizationExpiryState: z.enum(["current", "expired"]),
  policyVersion: M20FinalControlPolicyVersionSchema,
  evidenceFingerprint: Sha256DigestSchema,
} as const;

const RehearsalEvidenceObjectSchema = z
  .discriminatedUnion("outcome", [
    z
      .object({
        ...RehearsalCommonFields,
        outcome: z.literal("would-allow"),
      })
      .strict(),
    z
      .object({
        ...RehearsalCommonFields,
        outcome: z.literal("would-deny"),
        denialReasonCode: M20FinalControlDenialReasonCodeSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const expected = denialReason(value);
    if (value.outcome === "would-allow" && expected !== null) {
      issue(context, ["outcome"], "Allow outcome requires every final control to allow");
    }
    if (value.outcome === "would-deny" && value.denialReasonCode !== expected) {
      issue(context, ["denialReasonCode"], "Denial reason must be the first restrictive control");
    }
  });

export const M20FinalControlRehearsalEvidenceSchema = canonical(RehearsalEvidenceObjectSchema);

const RequestAcceptedBindingsSchema = z
  .object({ runId: ExecutionAuthorizationIdentifierSchema, requestFingerprint: Sha256DigestSchema })
  .strict();
const ScenarioBindingsSchema = z
  .object({
    scenarioId: ExecutionAuthorizationIdentifierSchema,
    scenarioFingerprint: Sha256DigestSchema,
    catalogFingerprint: Sha256DigestSchema,
  })
  .strict();
const AuthorizationIssuedCompleteBindingsSchema = z
  .object({
    authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
    authorizationDecisionFingerprint: Sha256DigestSchema,
  })
  .strict();
const AuthorizationIssuedRejectedBindingsSchema = z
  .object({ authorizationDecisionId: ExecutionAuthorizationIdentifierSchema })
  .strict();
const AuthorizationClaimedCompleteBindingsSchema = z
  .object({
    authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
    authorizationClaimFingerprint: Sha256DigestSchema,
  })
  .strict();
const AuthorizationClaimedRejectedBindingsSchema = z
  .object({ authorizationClaimId: ExecutionAuthorizationIdentifierSchema })
  .strict();
const PreparationStartedBindingsSchema = z
  .object({
    preparationId: ExecutionAuthorizationIdentifierSchema,
    requestPlanId: ExecutionAuthorizationIdentifierSchema,
  })
  .strict();
const PreparationCompleteBindingsSchema = z
  .object({
    preparationId: ExecutionAuthorizationIdentifierSchema,
    requestPlanId: ExecutionAuthorizationIdentifierSchema,
    requestPlanFingerprint: Sha256DigestSchema,
    credentialResolutionEvidenceFingerprint: Sha256DigestSchema,
    disabledPolicyFingerprint: Sha256DigestSchema,
    adapterId: ExecutionAuthorizationIdentifierSchema,
    adapterFingerprint: Sha256DigestSchema,
    operation: z.literal("founder-decision-memo"),
    disabledPolicyVersion: ProviderReadinessLogicalReferenceSchema,
    evaluatedAt: IsoTemporalSchema,
  })
  .strict();
const PreparationRejectedBindingsSchema = z
  .object({ preparationId: ExecutionAuthorizationIdentifierSchema })
  .strict();
const RehearsalEvidenceBindingsSchema = z
  .object({
    rehearsalEvidenceId: ExecutionAuthorizationIdentifierSchema,
    rehearsalEvidenceFingerprint: Sha256DigestSchema,
    rehearsalOutcome: z.enum(["would-allow", "would-deny"]),
  })
  .strict();
const RehearsalRejectedBindingsSchema = z
  .object({ rehearsalEvidenceId: ExecutionAuthorizationIdentifierSchema })
  .strict();
const NetworkBindingsSchema = z.object({ networkAttemptCount: z.literal(0) }).strict();

const ObservationCommonFields = {
  schemaVersion: M20ContractVersionSchema,
  position: PositionSchema,
  observedAt: IsoTemporalSchema,
  observationFingerprint: Sha256DigestSchema,
} as const;

function completedObservation<S extends z.ZodLiteral<string>, B extends z.ZodType>(
  stage: S,
  bindings: B,
) {
  return z
    .object({
      ...ObservationCommonFields,
      stage,
      outcome: z.literal("completed"),
      artifactBindings: bindings,
    })
    .strict();
}

function rejectedObservation<S extends z.ZodLiteral<string>, B extends z.ZodType>(
  stage: S,
  bindings: B,
) {
  return z
    .object({
      ...ObservationCommonFields,
      stage,
      outcome: z.literal("rejected"),
      artifactBindings: bindings,
      reasonCode: M20ReportedReasonCodeSchema,
    })
    .strict();
}

const StageObservationObjectSchema = z.union([
  completedObservation(z.literal("request-accepted"), RequestAcceptedBindingsSchema),
  rejectedObservation(z.literal("request-accepted"), RequestAcceptedBindingsSchema),
  completedObservation(z.literal("scenario-authority-verified"), ScenarioBindingsSchema),
  rejectedObservation(z.literal("scenario-authority-verified"), ScenarioBindingsSchema),
  completedObservation(
    z.literal("authorization-issued"),
    AuthorizationIssuedCompleteBindingsSchema,
  ),
  rejectedObservation(z.literal("authorization-issued"), AuthorizationIssuedRejectedBindingsSchema),
  completedObservation(
    z.literal("authorization-claimed"),
    AuthorizationClaimedCompleteBindingsSchema,
  ),
  rejectedObservation(
    z.literal("authorization-claimed"),
    AuthorizationClaimedRejectedBindingsSchema,
  ),
  completedObservation(z.literal("preparation-started"), PreparationStartedBindingsSchema),
  rejectedObservation(z.literal("preparation-started"), PreparationStartedBindingsSchema),
  completedObservation(z.literal("preparation-disabled-bound"), PreparationCompleteBindingsSchema),
  rejectedObservation(z.literal("preparation-disabled-bound"), PreparationRejectedBindingsSchema),
  completedObservation(
    z.literal("final-control-rehearsal-complete"),
    RehearsalEvidenceBindingsSchema,
  ),
  rejectedObservation(
    z.literal("final-control-rehearsal-complete"),
    z.union([RehearsalRejectedBindingsSchema, RehearsalEvidenceBindingsSchema]),
  ),
  completedObservation(z.literal("no-network-verified"), NetworkBindingsSchema),
]);

export const M20StageObservationSchema = canonical(StageObservationObjectSchema);

export const M20SecurityAssertionNameSchema = z.enum([
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
]);
export const M20SecurityAssertionStatusSchema = z.enum(["passed", "failed", "not-reached"]);
export const M20SecurityAssertionSchema = canonical(
  z
    .object({
      assertion: M20SecurityAssertionNameSchema,
      status: M20SecurityAssertionStatusSchema,
    })
    .strict(),
);

const stageSequence = M20StageSchema.options;
const assertionSequence = M20SecurityAssertionNameSchema.options;
const assertionTuples = {
  scenario_non_authoritative: "PFNNNNNPPP",
  authorization_issuance_rejected: "PPFNNNNPPP",
  authorization_claim_rejected: "PPFNNNNPPP",
  preparation_rejected: "PPPFNNNPPP",
  preparation_non_authoritative: "PPPFNNNPPP",
  final_control_issuance_rejected: "PPPPFNNPPP",
  final_control_non_authoritative: "PPPPFNNPPP",
  final_control_rehearsal_denied: "PPPPPFPPPP",
  "dry-run-verified": "PPPPPPPPPP",
} as const;
const assertionStatus = { P: "passed", F: "failed", N: "not-reached" } as const;
const terminalGrammar = {
  scenario_non_authoritative: { length: 2, counts: [[0, 0, 0, 0, 0, 0]] },
  authorization_issuance_rejected: {
    length: 3,
    counts: [
      [1, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 0],
    ],
  },
  authorization_claim_rejected: {
    length: 4,
    counts: [
      [1, 1, 1, 0, 0, 0],
      [1, 1, 2, 0, 0, 0],
    ],
  },
  preparation_rejected: { length: 6, counts: [[1, 1, 2, 1, 0, 0]] },
  preparation_non_authoritative: { length: 6, counts: [[1, 1, 2, 1, 0, 0]] },
  final_control_issuance_rejected: { length: 7, counts: [[1, 1, 2, 1, 1, 0]] },
  final_control_non_authoritative: { length: 7, counts: [[1, 1, 2, 1, 1, 1]] },
  final_control_rehearsal_denied: { length: 7, counts: [[1, 1, 2, 1, 1, 1]] },
  "dry-run-verified": { length: 8, counts: [[1, 1, 2, 1, 1, 1]] },
} as const;
const countKeys = [
  "authorizationIssuanceCalls",
  "authorizationClaimCalls",
  "authorizationVerificationCalls",
  "m19PreparationCalls",
  "finalControlIssuanceCalls",
  "finalControlVerificationCalls",
] as const;

const ReportIdentityFields = {
  schemaVersion: M20ContractVersionSchema,
  taxonomyId: M20DryRunTaxonomyIdSchema,
  runId: ExecutionAuthorizationIdentifierSchema,
  scenarioId: ExecutionAuthorizationIdentifierSchema,
  scenarioFingerprint: Sha256DigestSchema,
  catalogFingerprint: Sha256DigestSchema,
  evaluatedAt: IsoTemporalSchema,
  rehearsalEvaluatedAt: IsoTemporalSchema,
  requestFingerprint: Sha256DigestSchema,
  observations: z.array(M20StageObservationSchema).min(2).max(8),
  protectedCallCounts: M20ProtectedCallCountsSchema,
  networkAttemptCount: z.literal(0),
  securityAssertions: z.array(M20SecurityAssertionSchema).length(10),
  reportFingerprint: Sha256DigestSchema,
} as const;

const ReportObjectSchema = z
  .discriminatedUnion("status", [
    z.object({ ...ReportIdentityFields, status: z.literal("dry-run-verified") }).strict(),
    z
      .object({
        ...ReportIdentityFields,
        status: z.literal("dry-run-rejected"),
        reasonCode: M20ReportedReasonCodeSchema,
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const terminal = value.status === "dry-run-verified" ? value.status : value.reasonCode;
    const grammar = terminalGrammar[terminal];
    if (value.observations.length !== grammar.length) {
      issue(context, ["observations"], "Observation count must match terminal grammar");
    }
    for (const [index, observation] of value.observations.entries()) {
      if (observation.stage !== stageSequence[index] || observation.position !== index + 1) {
        issue(
          context,
          ["observations", index],
          "Stage order and position must match terminal grammar",
        );
      }
      const expectedOutcome =
        index === grammar.length - 1 && terminal !== "dry-run-verified" ? "rejected" : "completed";
      if (observation.outcome !== expectedOutcome) {
        issue(
          context,
          ["observations", index, "outcome"],
          "Observation outcome must match terminal grammar",
        );
      }
      if (observation.outcome === "rejected" && observation.reasonCode !== terminal) {
        issue(
          context,
          ["observations", index, "reasonCode"],
          "Observation reason must match report reason",
        );
      }
      const expectedTime =
        observation.stage === "final-control-rehearsal-complete"
          ? value.rehearsalEvaluatedAt
          : value.evaluatedAt;
      if (observation.observedAt !== expectedTime) {
        issue(
          context,
          ["observations", index, "observedAt"],
          "Observation time must match its run time",
        );
      }
    }
    const countsMatch = grammar.counts.some((expected) =>
      countKeys.every((key, index) => value.protectedCallCounts[key] === expected[index]),
    );
    if (!countsMatch) {
      issue(context, ["protectedCallCounts"], "Protected call counts must match terminal grammar");
    }
    const tuple = assertionTuples[terminal];
    for (const [index, assertion] of value.securityAssertions.entries()) {
      if (
        assertion.assertion !== assertionSequence[index] ||
        assertion.status !== assertionStatus[tuple[index] as keyof typeof assertionStatus]
      ) {
        issue(
          context,
          ["securityAssertions", index],
          "Security assertions must match terminal grammar",
        );
      }
    }
    if (terminal === "dry-run-verified") {
      const rehearsal = value.observations[6];
      if (
        rehearsal?.stage !== "final-control-rehearsal-complete" ||
        !("rehearsalEvidenceFingerprint" in rehearsal.artifactBindings) ||
        rehearsal.artifactBindings.rehearsalOutcome !== "would-allow"
      ) {
        issue(
          context,
          ["observations", 6],
          "Verified dry run must bind authoritative would-allow rehearsal evidence",
        );
      }
    }
    if (terminal === "final_control_rehearsal_denied") {
      const last = value.observations.at(-1);
      if (
        last?.stage !== "final-control-rehearsal-complete" ||
        !("rehearsalEvidenceFingerprint" in last.artifactBindings) ||
        last.artifactBindings.rehearsalOutcome !== "would-deny"
      ) {
        issue(context, ["observations"], "Authoritative rehearsal denial must bind deny evidence");
      }
    }
    if (
      (terminal === "final_control_issuance_rejected" ||
        terminal === "final_control_non_authoritative") &&
      value.observations.at(-1)?.stage === "final-control-rehearsal-complete" &&
      "rehearsalEvidenceFingerprint" in value.observations.at(-1)!.artifactBindings
    ) {
      issue(
        context,
        ["observations"],
        "Non-authoritative rehearsal rejection cannot bind evidence",
      );
    }
  });

export const M20DryRunReportSchema = canonical(ReportObjectSchema);

export const M20DryRunResultSchema = canonical(
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("preflight-rejected"),
        reasonCode: z.enum(["invalid_input", "conflicting_run_identity"]),
      })
      .strict(),
    z.object({ status: z.literal("in-flight"), reason: z.literal("dry_run_in_progress") }).strict(),
    z
      .object({
        status: z.literal("dry-run-verified"),
        report: M20DryRunReportSchema.refine((report) => report.status === "dry-run-verified"),
      })
      .strict(),
    z
      .object({
        status: z.literal("dry-run-rejected"),
        report: M20DryRunReportSchema.refine((report) => report.status === "dry-run-rejected"),
      })
      .strict(),
    z
      .object({
        status: z.literal("integrity-rejected"),
        reasonCode: z.literal("internal_integrity_failure"),
      })
      .strict(),
  ]),
);

export const M20ArtifactVerificationResultSchema = canonical(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("valid") }).strict(),
    z
      .object({
        status: z.literal("invalid"),
        reasonCode: M20ArtifactVerificationReasonCodeSchema,
      })
      .strict(),
  ]),
);

export type M20FingerprintDomain = z.infer<typeof M20FingerprintDomainSchema>;
export type M20FaultKind = z.infer<typeof M20FaultKindSchema>;
export type M20Stage = z.infer<typeof M20StageSchema>;
export type M20AffectedBoundary = z.infer<typeof M20AffectedBoundarySchema>;
export type M20TerminalReasonCode = z.infer<typeof M20TerminalReasonCodeSchema>;
export type M20FaultDeclarationV1 = z.infer<typeof M20FaultDeclarationSchema>;
export type M20ProtectedCallCountsV1 = z.infer<typeof M20ProtectedCallCountsSchema>;
export type M20ExpectedObservationV1 = z.infer<typeof M20ExpectedObservationSchema>;
export type M20ScenarioDescriptorV1 = z.infer<typeof M20ScenarioDescriptorSchema>;
export type M20ScenarioCatalogV1 = z.infer<typeof M20ScenarioCatalogSchema>;
export type M20DryRunRequestV1 = z.infer<typeof M20DryRunRequestSchema>;
export type M20FinalControlProfileV1 = z.infer<typeof M20FinalControlProfileSchema>;
export type M20FinalControlSnapshotV1 = z.infer<typeof M20FinalControlSnapshotSchema>;
export type M20FinalControlSnapshotIssuanceRequestV1 = z.infer<
  typeof M20FinalControlSnapshotIssuanceRequestSchema
>;
export type M20FinalControlSnapshotIssuanceResultV1 = z.infer<
  typeof M20FinalControlSnapshotIssuanceResultSchema
>;
export type M20FinalControlSnapshotVerificationRequestV1 = z.infer<
  typeof M20FinalControlSnapshotVerificationRequestSchema
>;
export type M20FinalControlSnapshotVerificationResultV1 = z.infer<
  typeof M20FinalControlSnapshotVerificationResultSchema
>;
export type M20FinalControlRehearsalEvidenceV1 = z.infer<
  typeof M20FinalControlRehearsalEvidenceSchema
>;
export type M20StageObservationV1 = z.infer<typeof M20StageObservationSchema>;
export type M20SecurityAssertionV1 = z.infer<typeof M20SecurityAssertionSchema>;
export type M20DryRunReportV1 = z.infer<typeof M20DryRunReportSchema>;
export type M20DryRunResultV1 = z.infer<typeof M20DryRunResultSchema>;
export type M20ArtifactVerificationResultV1 = z.infer<typeof M20ArtifactVerificationResultSchema>;
