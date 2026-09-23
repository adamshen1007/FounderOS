import { isProxy } from "node:util/types";

import {
  ExecutionAuthorizationIdentifierSchema,
  M20FinalControlProfileSchema,
  M20FinalControlSnapshotIssuanceRequestSchema,
  M20FinalControlSnapshotVerificationRequestSchema,
  M20ScenarioCatalogSchema,
  M20_FINGERPRINT_DOMAINS,
  type M20FinalControlProfileV1,
  type M20FinalControlSnapshotIssuanceRequestV1,
  type M20FinalControlSnapshotV1,
  type M20ScenarioCatalogV1,
} from "../../../packages/knowledge-schema/src/index.js";
import {
  createM20ArtifactFingerprint,
  createM20FinalControlSnapshot,
  verifyM20FinalControlProfile,
  verifyM20ScenarioCatalog,
  type M20FinalControlSnapshotAuthorityPort,
} from "../../../services/knowledge-engine/src/index.js";
import { serializeDurableCanonicalJsonValue } from "../../../services/knowledge-engine/src/domain/canonical-fingerprint.js";

export interface M20TestFinalControlConfiguration {
  readonly schemaVersion: "1.0";
  readonly authorityId: string;
  readonly catalog: M20ScenarioCatalogV1;
  readonly profiles: readonly M20FinalControlProfileV1[];
}

const observations = new WeakMap<
  M20FinalControlSnapshotAuthorityPort,
  ReadonlyMap<string, M20FinalControlSnapshotV1>
>();

function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ("value" in descriptor) immutable(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

function capture(value: unknown, seen = new Set<object>(), depth = 0): unknown {
  if (value === null || typeof value !== "object") {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      return value;
    throw new TypeError("Unsupported final-control value");
  }
  if (isProxy(value) || seen.has(value) || depth > 64)
    throw new TypeError("Unsafe final-control object graph");
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype) && prototype !== null)
    throw new TypeError("Final-control inputs must be plain data");
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string"))
    throw new TypeError("Symbol keys are prohibited");
  if (isArray) {
    const length = descriptors.length;
    if (
      length === undefined ||
      !("value" in length) ||
      length.enumerable ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      length.value > 10_000
    )
      throw new TypeError("Invalid final-control array");
    const expectedKeys = new Set([
      "length",
      ...Array.from({ length: length.value }, (_, index) => String(index)),
    ]);
    if (
      Reflect.ownKeys(descriptors).length !== expectedKeys.size ||
      Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !expectedKeys.has(key))
    )
      throw new TypeError("Extra final-control array properties are prohibited");
    const result: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
        throw new TypeError("Sparse or accessor arrays are prohibited");
      result.push(capture(descriptor.value, seen, depth + 1));
    }
    seen.delete(value);
    return result;
  }
  const result = Object.create(null) as Record<string, unknown>;
  const keys = Object.keys(descriptors);
  if (keys.length > 10_000) throw new TypeError("Final-control object is too large");
  for (const key of keys) {
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable || key === "__proto__")
      throw new TypeError("Final-control properties must be enumerable data");
    result[key] = capture(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function exactConfiguration(value: unknown): M20TestFinalControlConfiguration {
  const captured = capture(value) as Record<string, unknown>;
  if (
    Object.keys(captured).sort().join("\n") !==
    ["authorityId", "catalog", "profiles", "schemaVersion"].sort().join("\n")
  )
    throw new TypeError("Invalid configuration shape");
  const schemaVersion = captured.schemaVersion;
  const authorityId = ExecutionAuthorizationIdentifierSchema.parse(captured.authorityId);
  if (schemaVersion !== "1.0" || !Array.isArray(captured.profiles))
    throw new TypeError("Unsupported configuration");
  return immutable({
    schemaVersion,
    authorityId,
    catalog: M20ScenarioCatalogSchema.parse(captured.catalog),
    profiles: captured.profiles.map((profile) => M20FinalControlProfileSchema.parse(profile)),
  });
}

function scenarioFaults(
  request: M20FinalControlSnapshotIssuanceRequestV1,
  catalog: M20ScenarioCatalogV1,
) {
  const scenario = catalog.scenarios.find(
    (candidate) => candidate.scenarioId === request.scenarioId,
  );
  return new Set([scenario?.primaryFault?.faultKind, scenario?.precedenceFault?.faultKind]);
}

function controlOverrides(
  request: M20FinalControlSnapshotIssuanceRequestV1,
  catalog: M20ScenarioCatalogV1,
) {
  const kinds = scenarioFaults(request, catalog);
  return {
    ...(kinds.has("final-control-global-disabled") ? { globalKillSwitch: "deny" as const } : {}),
    ...(kinds.has("final-control-provider-disabled")
      ? { providerKillSwitch: "deny" as const }
      : {}),
    ...(kinds.has("final-control-adapter-disabled") ? { adapterKillSwitch: "deny" as const } : {}),
    ...(kinds.has("final-control-model-disabled") ? { modelKillSwitch: "deny" as const } : {}),
    ...(kinds.has("final-control-environment-disabled")
      ? { environmentKillSwitch: "deny" as const }
      : {}),
    ...(kinds.has("final-control-operation-disabled")
      ? { operationKillSwitch: "deny" as const }
      : {}),
    ...(kinds.has("final-control-incident-active") ? { incidentState: "active" as const } : {}),
    ...(kinds.has("final-control-credential-revoked")
      ? { credentialReferenceState: "revoked" as const }
      : {}),
    ...(kinds.has("final-control-credential-stale")
      ? { credentialReferenceState: "stale" as const }
      : {}),
    ...(kinds.has("final-control-circuit-not-closed") ? { circuitState: "open" as const } : {}),
    ...(kinds.has("final-control-health-not-healthy") ? { healthState: "unhealthy" as const } : {}),
    ...(kinds.has("final-control-authorization-revoked")
      ? { authorizationRevocationState: "revoked" as const }
      : {}),
  };
}

function coordinatesMatch(input: M20FinalControlSnapshotIssuanceRequestV1): boolean {
  const { decision, claim, credentialResolutionRequest: credential, m19Terminal: terminal } = input;
  const authorization = decision.authorizationRequest;
  return (
    claim.authorizationDecisionId === decision.authorizationDecisionId &&
    claim.decisionFingerprint === decision.decisionFingerprint &&
    claim.executionAttemptId === authorization.executionAttemptId &&
    claim.executionAttemptFingerprint === authorization.executionAttemptFingerprint &&
    credential.authorizationDecisionId === decision.authorizationDecisionId &&
    credential.authorizationDecisionFingerprint === decision.decisionFingerprint &&
    credential.authorizationClaimId === claim.authorizationClaimId &&
    credential.authorizationClaimFingerprint === claim.claimFingerprint &&
    credential.executionAttemptId === authorization.executionAttemptId &&
    credential.executionAttemptFingerprint === authorization.executionAttemptFingerprint &&
    credential.subjectReference === authorization.subjectReference &&
    credential.consumerId === authorization.consumerId &&
    credential.deliveryTransactionId === authorization.deliveryTransactionId &&
    credential.contextPackageId === authorization.contextPackageId &&
    credential.invocationRequestId === authorization.invocationRequestId &&
    credential.providerFamilyReference === authorization.providerFamilyReference &&
    credential.providerFamilyReference === "provider-family/openai" &&
    credential.adapterId === authorization.adapterId &&
    credential.adapterFingerprint === authorization.adapterFingerprint &&
    credential.environmentClass === authorization.environmentClass &&
    credential.operation === authorization.operation &&
    credential.credentialReferenceId === authorization.credentialReferenceId &&
    credential.credentialReferenceFingerprint === authorization.credentialReferenceFingerprint &&
    credential.expectedRotationVersion === authorization.credentialRotationVersion &&
    terminal.adapterId === credential.adapterId &&
    terminal.adapterFingerprint === credential.adapterFingerprint &&
    terminal.operation === credential.operation &&
    terminal.evaluatedAt === credential.evaluatedAt &&
    Date.parse(input.rehearsalEvaluatedAt) >= Date.parse(terminal.evaluatedAt)
  );
}

export function readM20TestFinalControlObservation(
  authority: M20FinalControlSnapshotAuthorityPort,
  runId: string,
): M20FinalControlSnapshotV1 | undefined {
  return observations.get(authority)?.get(runId);
}

export function createM20TestFinalControlAuthority(
  rawConfiguration: M20TestFinalControlConfiguration,
): M20FinalControlSnapshotAuthorityPort {
  let configuration: M20TestFinalControlConfiguration;
  try {
    configuration = exactConfiguration(rawConfiguration);
    if (
      !verifyM20ScenarioCatalog(configuration.catalog) ||
      configuration.profiles.length !== configuration.catalog.scenarios.length ||
      configuration.profiles.some((profile) => !verifyM20FinalControlProfile(profile))
    )
      throw new TypeError();
  } catch {
    throw new TypeError("M20 test final-control configuration is invalid");
  }
  const catalog = configuration.catalog;
  const profiles = new Map(
    configuration.profiles.map((profile) => [profile.profileReference, profile]),
  );
  for (const scenario of catalog.scenarios) {
    const profile = profiles.get(scenario.finalControlProfileReference);
    if (profile === undefined || profile.scenarioId !== scenario.scenarioId)
      throw new TypeError("M20 test final-control profile bijection is invalid");
  }
  const authorityFingerprint = createM20ArtifactFingerprint(
    M20_FINGERPRINT_DOMAINS.finalControlAuthority,
    {
      schemaVersion: "1.0",
      authorityId: configuration.authorityId,
      catalogFingerprint: catalog.catalogFingerprint,
      profileFingerprints: configuration.profiles.map((profile) => profile.profileFingerprint),
    },
    "authorityFingerprint",
  );
  const byRun = new Map<
    string,
    { canonical: string; snapshot: M20FinalControlSnapshotV1; nonAuthoritative: boolean }
  >();
  const bySnapshot = new Map<string, string>();
  const issuedIdentity = new WeakSet<object>();
  const observable = new Map<string, M20FinalControlSnapshotV1>();

  const facade: M20FinalControlSnapshotAuthorityPort = {
    issueSnapshot(rawInput) {
      let input: M20FinalControlSnapshotIssuanceRequestV1;
      try {
        input = immutable(M20FinalControlSnapshotIssuanceRequestSchema.parse(capture(rawInput)));
      } catch {
        return immutable({ status: "rejected", reasonCode: "invalid_snapshot_request" });
      }
      try {
        const scenario = catalog.scenarios.find(
          (candidate) => candidate.scenarioId === input.scenarioId,
        );
        if (
          scenario === undefined ||
          scenario.scenarioFingerprint !== input.scenarioFingerprint ||
          input.catalogFingerprint !== catalog.catalogFingerprint
        )
          return immutable({
            status: "rejected",
            reasonCode: "scenario_profile_non_authoritative",
          });
        const faults = scenarioFaults(input, catalog);
        if (faults.has("final-control-snapshot-issuance-fault"))
          return immutable({
            status: "rejected",
            reasonCode: "internal_snapshot_authority_failure",
          });
        const canonical = serializeDurableCanonicalJsonValue(input);
        const prior = byRun.get(input.runId);
        if (prior !== undefined)
          return prior.canonical === canonical
            ? immutable({ status: "issued", snapshot: prior.snapshot })
            : immutable({ status: "rejected", reasonCode: "conflicting_snapshot_identity" });
        if (bySnapshot.has(input.snapshotId))
          return immutable({ status: "rejected", reasonCode: "conflicting_snapshot_identity" });
        const profile = profiles.get(scenario.finalControlProfileReference);
        if (
          profile === undefined ||
          !coordinatesMatch(input) ||
          Date.parse(input.rehearsalEvaluatedAt) < Date.parse(profile.validFrom)
        )
          return immutable({ status: "rejected", reasonCode: "coordinate_mismatch" });
        if (Date.parse(input.rehearsalEvaluatedAt) >= Date.parse(profile.validUntil))
          return immutable({ status: "rejected", reasonCode: "authority_expired" });
        const authorization = input.decision.authorizationRequest;
        const credential = input.credentialResolutionRequest;
        const snapshot = createM20FinalControlSnapshot({
          schemaVersion: "1.0",
          snapshotId: input.snapshotId,
          runId: input.runId,
          rehearsalEvaluatedAt: input.rehearsalEvaluatedAt,
          validFrom: profile.validFrom,
          validUntil: profile.validUntil,
          authorityId: configuration.authorityId,
          authorityFingerprint,
          authorizationDecisionId: input.decision.authorizationDecisionId,
          authorizationDecisionFingerprint: input.decision.decisionFingerprint,
          authorizationClaimId: input.claim.authorizationClaimId,
          authorizationClaimFingerprint: input.claim.claimFingerprint,
          executionAttemptId: authorization.executionAttemptId,
          executionAttemptFingerprint: authorization.executionAttemptFingerprint,
          adapterId: credential.adapterId,
          adapterFingerprint: credential.adapterFingerprint,
          modelPolicyReference: authorization.modelPolicyReference,
          modelPolicyFingerprint: authorization.modelPolicyFingerprint,
          providerFamilyReference: "provider-family/openai",
          environmentClass: credential.environmentClass,
          operation: credential.operation,
          credentialReferenceId: credential.credentialReferenceId,
          credentialReferenceFingerprint: credential.credentialReferenceFingerprint,
          credentialRotationVersion: credential.expectedRotationVersion,
          globalKillSwitch: profile.globalKillSwitch,
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
          authorizationExpiryState:
            Date.parse(input.rehearsalEvaluatedAt) < Date.parse(input.decision.expiresAt)
              ? "current"
              : "expired",
          ...controlOverrides(input, catalog),
        });
        byRun.set(input.runId, {
          canonical,
          snapshot,
          nonAuthoritative: faults.has("final-control-snapshot-non-authoritative"),
        });
        bySnapshot.set(input.snapshotId, input.runId);
        issuedIdentity.add(snapshot);
        observable.set(input.runId, snapshot);
        return immutable({ status: "issued", snapshot });
      } catch {
        return immutable({ status: "rejected", reasonCode: "internal_snapshot_authority_failure" });
      }
    },
    verifySnapshot(rawInput) {
      try {
        if (rawInput === null || typeof rawInput !== "object" || isProxy(rawInput))
          throw new TypeError();
        const snapshotDescriptor = Object.getOwnPropertyDescriptors(rawInput).snapshot;
        if (snapshotDescriptor === undefined || !("value" in snapshotDescriptor))
          throw new TypeError();
        const rawSnapshot = snapshotDescriptor.value as object;
        const input = immutable(
          M20FinalControlSnapshotVerificationRequestSchema.parse(capture(rawInput)),
        );
        const stored = byRun.get(input.runId);
        return stored !== undefined &&
          stored.snapshot === rawSnapshot &&
          issuedIdentity.has(rawSnapshot) &&
          !stored.nonAuthoritative
          ? immutable({ status: "valid" })
          : immutable({ status: "invalid", reasonCode: "snapshot_non_authoritative" });
      } catch {
        return immutable({ status: "invalid", reasonCode: "snapshot_non_authoritative" });
      }
    },
  };
  observations.set(facade, observable);
  return Object.freeze(facade);
}
