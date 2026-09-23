import {
  M20_FINGERPRINT_DOMAINS,
  M20FaultDeclarationSchema,
  type M20FaultDeclarationV1,
  type M20FaultKind,
  type M20ScenarioCatalogV1,
  type M20ScenarioDescriptorV1,
} from "../../../packages/knowledge-schema/src/index.js";
import {
  createM20ArtifactFingerprint,
  createM20ScenarioCatalog,
  createM20ScenarioDescriptor,
} from "../../../services/knowledge-engine/src/index.js";
function createTestM20FaultDeclaration(
  input: Omit<M20FaultDeclarationV1, "faultFingerprint">,
): M20FaultDeclarationV1 {
  return M20FaultDeclarationSchema.parse({
    ...input,
    faultFingerprint: createM20ArtifactFingerprint(
      M20_FINGERPRINT_DOMAINS.fault,
      input,
      "faultFingerprint",
    ),
  });
}

export const M20_SUCCESS_STAGES = Object.freeze([
  "request-accepted",
  "scenario-authority-verified",
  "authorization-issued",
  "authorization-claimed",
  "preparation-started",
  "preparation-disabled-bound",
  "final-control-rehearsal-complete",
  "no-network-verified",
] as const);

export const M20_ZERO_CALLS = Object.freeze({
  authorizationIssuanceCalls: 0,
  authorizationClaimCalls: 0,
  authorizationVerificationCalls: 0,
  m19PreparationCalls: 0,
  finalControlIssuanceCalls: 0,
  finalControlVerificationCalls: 0,
});

type ReportedReason = Exclude<
  NonNullable<M20ScenarioDescriptorV1["expectedOwnerReasonCode"]>,
  "internal_integrity_failure" | "scenario_non_authoritative"
>;

export interface M20TestScenarioDefinition {
  readonly id: string;
  readonly purpose: M20ScenarioDescriptorV1["purpose"];
  readonly primary?: M20FaultKind;
  readonly precedence?: M20FaultKind;
  readonly expectedReason?: ReportedReason;
}

interface M20CatalogDefinition extends M20TestScenarioDefinition {
  readonly fixtureVariant?: string;
}

const SINGLE_FAULTS: readonly M20FaultKind[] = Object.freeze([
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

const M19_CONTROL_VARIANTS = Object.freeze([
  "model-denied",
  "instruction-denied",
  "cache-denied",
  "privacy-denied",
  "retention-denied",
  "admission-denied",
  "circuit-open",
  "health-unavailable",
  "incident-active",
  "kill-switch-denied",
] as const);

const FINAL_KILL_SWITCH_FAULTS: readonly M20FaultKind[] = Object.freeze([
  "final-control-global-disabled",
  "final-control-provider-disabled",
  "final-control-adapter-disabled",
  "final-control-model-disabled",
  "final-control-environment-disabled",
  "final-control-operation-disabled",
]);

const REQUIRED_PAIRS: readonly (readonly [M20FaultKind, M20FaultKind])[] = Object.freeze([
  ...FINAL_KILL_SWITCH_FAULTS.flatMap((kill) => [
    [kill, "final-control-authorization-expired"] as const,
    [kill, "final-control-authorization-revoked"] as const,
  ]),
  ["final-control-credential-revoked", "final-control-authorization-expired"],
  ["final-control-credential-revoked", "final-control-circuit-not-closed"],
  ["final-control-credential-revoked", "final-control-health-not-healthy"],
  ["final-control-credential-revoked", "final-control-authorization-revoked"],
  ["final-control-global-disabled", "final-control-provider-disabled"],
  ["final-control-global-disabled", "final-control-adapter-disabled"],
  ["final-control-global-disabled", "final-control-model-disabled"],
  ["final-control-global-disabled", "final-control-environment-disabled"],
  ["final-control-global-disabled", "final-control-operation-disabled"],
  ["final-control-circuit-not-closed", "final-control-health-not-healthy"],
  ["final-control-incident-active", "final-control-health-not-healthy"],
  ["authorization-issuance-denied", "authorization-claim-conflict"],
  ["authorization-claim-conflict", "readiness-non-authoritative"],
  ["readiness-non-authoritative", "current-control-rejected"],
  ["current-control-rejected", "m19-terminal-malformed-or-known-coordinate-mismatch"],
  ["m19-terminal-malformed-or-known-coordinate-mismatch", "final-control-snapshot-issuance-fault"],
  ["final-control-snapshot-issuance-fault", "final-control-snapshot-non-authoritative"],
  ["final-control-snapshot-non-authoritative", "final-control-global-disabled"],
]);

function reasonFor(kind: M20FaultKind): ReportedReason {
  if (
    kind === "authorization-issuance-denied" ||
    kind === "authorization-decision-non-authoritative"
  ) {
    return "authorization_issuance_rejected";
  }
  if (kind === "authorization-claim-conflict" || kind === "authorization-claim-non-authoritative") {
    return "authorization_claim_rejected";
  }
  if (kind === "m19-terminal-malformed-or-known-coordinate-mismatch") {
    return "preparation_non_authoritative";
  }
  if (kind === "final-control-snapshot-issuance-fault") {
    return "final_control_issuance_rejected";
  }
  if (kind === "final-control-snapshot-non-authoritative") {
    return "final_control_non_authoritative";
  }
  if (kind.startsWith("final-control-")) return "final_control_rehearsal_denied";
  return "preparation_rejected";
}

function faultCoordinates(kind: M20FaultKind) {
  if (kind.startsWith("authorization-") && kind.includes("claim")) {
    return {
      injectionStage: "authorization-claimed" as const,
      affectedBoundary: "m17-claim" as const,
    };
  }
  if (kind.startsWith("authorization-")) {
    return {
      injectionStage: "authorization-issued" as const,
      affectedBoundary: "m17-issuance" as const,
    };
  }
  if (kind === "readiness-non-authoritative") {
    return {
      injectionStage: "preparation-started" as const,
      affectedBoundary: "m19-readiness" as const,
    };
  }
  if (kind.startsWith("credential-")) {
    return {
      injectionStage: "preparation-started" as const,
      affectedBoundary: "m18-resolution" as const,
    };
  }
  if (kind === "m19-terminal-malformed-or-known-coordinate-mismatch") {
    return {
      injectionStage: "preparation-disabled-bound" as const,
      affectedBoundary: "m19-terminal" as const,
    };
  }
  if (kind.startsWith("final-control-")) {
    return {
      injectionStage: "final-control-rehearsal-complete" as const,
      affectedBoundary: "m20-final-control-authority" as const,
    };
  }
  return {
    injectionStage: "preparation-started" as const,
    affectedBoundary: "m19-policy" as const,
  };
}

function expectedShape(reason?: ReportedReason, fault?: M20FaultKind) {
  const row =
    reason === "authorization_issuance_rejected"
      ? fault === "authorization-decision-non-authoritative"
        ? { length: 3, counts: [1, 0, 1, 0, 0, 0] }
        : { length: 3, counts: [1, 0, 0, 0, 0, 0] }
      : reason === "authorization_claim_rejected"
        ? fault === "authorization-claim-non-authoritative"
          ? { length: 4, counts: [1, 1, 2, 0, 0, 0] }
          : { length: 4, counts: [1, 1, 1, 0, 0, 0] }
        : reason === "preparation_rejected" || reason === "preparation_non_authoritative"
          ? { length: 6, counts: [1, 1, 2, 1, 0, 0] }
          : reason === "final_control_issuance_rejected"
            ? { length: 7, counts: [1, 1, 2, 1, 1, 0] }
            : reason === "final_control_non_authoritative" ||
                reason === "final_control_rehearsal_denied"
              ? { length: 7, counts: [1, 1, 2, 1, 1, 1] }
              : { length: 8, counts: [1, 1, 2, 1, 1, 1] };
  return {
    expectedObservations: M20_SUCCESS_STAGES.slice(0, row.length).map((stage, index, entries) => ({
      stage,
      outcome:
        reason !== undefined && index === entries.length - 1
          ? ("rejected" as const)
          : ("completed" as const),
    })),
    expectedOwnerCallCounts: {
      authorizationIssuanceCalls: row.counts[0]!,
      authorizationClaimCalls: row.counts[1]!,
      authorizationVerificationCalls: row.counts[2]!,
      m19PreparationCalls: row.counts[3]!,
      finalControlIssuanceCalls: row.counts[4]!,
      finalControlVerificationCalls: row.counts[5]!,
    },
  };
}

const definitions: M20CatalogDefinition[] = [
  { id: "00-success", purpose: "success" },
  ...SINGLE_FAULTS.map((primary, index) => ({
    id: `10-single-${String(index).padStart(2, "0")}-${primary}`,
    purpose: "single-fault" as const,
    primary,
    expectedReason: reasonFor(primary),
  })),
  ...M19_CONTROL_VARIANTS.map((variant, index) => ({
    id: `20-m19-control-${String(index).padStart(2, "0")}-${variant}`,
    purpose: "single-fault" as const,
    primary: "current-control-rejected" as const,
    expectedReason: "preparation_rejected" as const,
    fixtureVariant: `m19-control-${variant}`,
  })),
  ...(
    [
      ["m17-denied", "authorization-issuance-denied", "authorization_issuance_rejected"],
      [
        "m17-expired",
        "authorization-decision-non-authoritative",
        "authorization_issuance_rejected",
      ],
      [
        "m17-revoked",
        "authorization-decision-non-authoritative",
        "authorization_issuance_rejected",
      ],
      [
        "m17-mismatched",
        "authorization-decision-non-authoritative",
        "authorization_issuance_rejected",
      ],
      ["m17-already-claimed", "authorization-claim-conflict", "authorization_claim_rejected"],
      [
        "m14-m15-readiness-non-authoritative",
        "readiness-non-authoritative",
        "preparation_rejected",
      ],
      ["m14-m15-readiness-stale", "readiness-non-authoritative", "preparation_rejected"],
      [
        "m19-terminal-malformed",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-preparation-id-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-request-plan-id-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-adapter-id-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-adapter-fingerprint-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-operation-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
      [
        "m19-terminal-evaluation-time-mismatch",
        "m19-terminal-malformed-or-known-coordinate-mismatch",
        "preparation_non_authoritative",
      ],
    ] as const
  ).map(([variant, primary, expectedReason], index) => ({
    id: `25-named-${String(index).padStart(2, "0")}-${variant}`,
    purpose: "single-fault" as const,
    primary,
    expectedReason,
    fixtureVariant: variant,
  })),
  ...REQUIRED_PAIRS.map(([primary, precedence], index) => ({
    id: `30-precedence-${String(index).padStart(2, "0")}`,
    purpose: "precedence" as const,
    primary,
    precedence,
    expectedReason: reasonFor(primary),
  })),
  { id: "90-concurrency", purpose: "concurrency" },
  { id: "91-replay", purpose: "replay" },
];

export const M20_TEST_SCENARIO_DEFINITIONS = Object.freeze(
  definitions.map(({ fixtureVariant: _fixtureVariant, ...entry }) => {
    void _fixtureVariant;
    return Object.freeze(entry);
  }),
);

function declaration(
  definition: M20CatalogDefinition,
  role: "primary" | "precedence",
  kind: M20FaultKind,
) {
  return createTestM20FaultDeclaration({
    schemaVersion: "1.0",
    faultId: `fault-${definition.id}-${role}`,
    faultKind: kind,
    ...faultCoordinates(kind),
    fixtureReference:
      definition.fixtureVariant === undefined
        ? `fixture/m20/${definition.id}/${role}`
        : `fixture/m20/variant/${definition.fixtureVariant}`,
  });
}

const descriptors = definitions.map((definition) => {
  const expectedReason = definition.expectedReason;
  const shape = expectedShape(expectedReason, definition.primary);
  return createM20ScenarioDescriptor({
    schemaVersion: "1.0",
    scenarioId: definition.id,
    scenarioVersion: "scenario-version/v1",
    catalogVersion: "m20-scenario-catalog-v1",
    purpose: definition.purpose,
    expectedOwnerResult: expectedReason === undefined ? "dry-run-verified" : "dry-run-rejected",
    ...(expectedReason === undefined ? {} : { expectedOwnerReasonCode: expectedReason }),
    ...(definition.purpose === "concurrency"
      ? { expectedFollowerResult: "in-flight" as const, expectedFollowerCallDelta: M20_ZERO_CALLS }
      : definition.purpose === "replay"
        ? {
            expectedFollowerResult: "dry-run-verified" as const,
            expectedFollowerCallDelta: M20_ZERO_CALLS,
          }
        : {}),
    ...shape,
    finalControlProfileReference: `final-control/${definition.id}`,
    ...(definition.primary === undefined
      ? {}
      : { primaryFault: declaration(definition, "primary", definition.primary) }),
    ...(definition.precedence === undefined
      ? {}
      : { precedenceFault: declaration(definition, "precedence", definition.precedence) }),
  });
});

export const M20_TEST_SCENARIO_CATALOG: M20ScenarioCatalogV1 = createM20ScenarioCatalog({
  schemaVersion: "1.0",
  catalogVersion: "m20-scenario-catalog-v1",
  scenarios: descriptors,
});

export function getM20TestScenarioDefinition(scenarioId: string): M20TestScenarioDefinition {
  const definition = M20_TEST_SCENARIO_DEFINITIONS.find((entry) => entry.id === scenarioId);
  if (definition === undefined) throw new TypeError("Unknown M20 test scenario");
  return definition;
}
