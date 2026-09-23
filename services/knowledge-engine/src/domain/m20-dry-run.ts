import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  M20DryRunReportSchema,
  M20DryRunRequestSchema,
  M20FaultDeclarationSchema,
  M20FinalControlProfileSchema,
  M20FinalControlRehearsalEvidenceSchema,
  M20FinalControlSnapshotSchema,
  M20ScenarioCatalogSchema,
  M20ScenarioDescriptorSchema,
  M20StageObservationSchema,
  M20_FINGERPRINT_DOMAINS,
  type M20ArtifactVerificationResultV1,
  type M20DryRunReportV1,
  type M20DryRunRequestV1,
  type M20FaultDeclarationV1,
  type M20FinalControlProfileV1,
  type M20FinalControlRehearsalEvidenceV1,
  type M20FinalControlSnapshotV1,
  type M20ScenarioCatalogV1,
  type M20ScenarioDescriptorV1,
  type M20StageObservationV1,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "./canonical-fingerprint.js";

type Without<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      immutable((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function stripField(value: object, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

export function createM20ArtifactFingerprint(domain: string, value: object, field: string): string {
  const artifact = stripField(value, field);
  return createHash("sha256")
    .update(`${domain}\n${serializeDurableCanonicalJsonValue(artifact)}`)
    .digest("hex");
}

function createArtifact<T extends object>(
  schema: { parse(value: unknown): T },
  domain: string,
  field: string,
  input: object,
): T {
  return schema.parse({
    ...stripField(input, field),
    [field]: createM20ArtifactFingerprint(domain, input, field),
  });
}

function fingerprintMatches(value: object, domain: string, field: string): boolean {
  return (
    typeof (value as Record<string, unknown>)[field] === "string" &&
    (value as Record<string, unknown>)[field] === createM20ArtifactFingerprint(domain, value, field)
  );
}

export function createM20DryRunRequest(
  input: Without<M20DryRunRequestV1, "requestFingerprint">,
): M20DryRunRequestV1 {
  return createArtifact(
    M20DryRunRequestSchema,
    M20_FINGERPRINT_DOMAINS.request,
    "requestFingerprint",
    input,
  );
}

export function createM20FaultDeclaration(
  input: Without<M20FaultDeclarationV1, "faultFingerprint">,
): M20FaultDeclarationV1 {
  return createArtifact(
    M20FaultDeclarationSchema,
    M20_FINGERPRINT_DOMAINS.fault,
    "faultFingerprint",
    input,
  );
}

export function createM20ScenarioDescriptor(
  input: Without<M20ScenarioDescriptorV1, "scenarioFingerprint">,
): M20ScenarioDescriptorV1 {
  return createArtifact(
    M20ScenarioDescriptorSchema,
    M20_FINGERPRINT_DOMAINS.scenario,
    "scenarioFingerprint",
    input,
  );
}

export function createM20ScenarioCatalog(
  input: Without<M20ScenarioCatalogV1, "catalogFingerprint">,
): M20ScenarioCatalogV1 {
  return createArtifact(
    M20ScenarioCatalogSchema,
    M20_FINGERPRINT_DOMAINS.catalog,
    "catalogFingerprint",
    input,
  );
}

export function createM20FinalControlProfile(
  input: Without<M20FinalControlProfileV1, "profileFingerprint">,
): M20FinalControlProfileV1 {
  return createArtifact(
    M20FinalControlProfileSchema,
    M20_FINGERPRINT_DOMAINS.finalControlProfile,
    "profileFingerprint",
    input,
  );
}

export function createM20FinalControlSnapshot(
  input: Without<M20FinalControlSnapshotV1, "snapshotFingerprint">,
): M20FinalControlSnapshotV1 {
  return createArtifact(
    M20FinalControlSnapshotSchema,
    M20_FINGERPRINT_DOMAINS.finalControlSnapshot,
    "snapshotFingerprint",
    input,
  );
}

export function createM20StageObservation(
  input: Without<M20StageObservationV1, "observationFingerprint">,
): M20StageObservationV1 {
  return createArtifact(
    M20StageObservationSchema,
    M20_FINGERPRINT_DOMAINS.stageObservation,
    "observationFingerprint",
    input,
  );
}

const SNAPSHOT_EVIDENCE_FIELDS = [
  "authorizationDecisionId",
  "authorizationDecisionFingerprint",
  "authorizationClaimId",
  "authorizationClaimFingerprint",
  "executionAttemptId",
  "executionAttemptFingerprint",
  "adapterId",
  "adapterFingerprint",
  "modelPolicyReference",
  "modelPolicyFingerprint",
  "providerFamilyReference",
  "environmentClass",
  "operation",
  "credentialReferenceId",
  "credentialReferenceFingerprint",
  "credentialRotationVersion",
  "globalKillSwitch",
  "providerKillSwitch",
  "adapterKillSwitch",
  "modelKillSwitch",
  "environmentKillSwitch",
  "operationKillSwitch",
  "incidentState",
  "credentialReferenceState",
  "circuitState",
  "healthState",
  "authorizationRevocationState",
  "authorizationExpiryState",
] as const;

function finalControlDenialReason(snapshot: M20FinalControlSnapshotV1): string | null {
  if (snapshot.globalKillSwitch === "deny") return "global_disabled";
  if (snapshot.providerKillSwitch === "deny") return "provider_disabled";
  if (snapshot.adapterKillSwitch === "deny") return "adapter_disabled";
  if (snapshot.modelKillSwitch === "deny") return "model_disabled";
  if (snapshot.environmentKillSwitch === "deny") return "environment_disabled";
  if (snapshot.operationKillSwitch === "deny") return "operation_disabled";
  if (snapshot.incidentState === "active") return "incident_active";
  if (snapshot.credentialReferenceState === "revoked") return "credential_revoked";
  if (snapshot.credentialReferenceState === "stale") return "credential_stale";
  if (snapshot.circuitState !== "closed") return "circuit_not_closed";
  if (snapshot.healthState !== "healthy") return "health_not_healthy";
  if (snapshot.authorizationRevocationState === "revoked") return "authorization_revoked";
  if (snapshot.authorizationExpiryState === "expired") return "authorization_expired";
  return null;
}

export function createM20FinalControlRehearsalEvidence(input: {
  readonly rehearsalEvidenceId: string;
  readonly snapshot: M20FinalControlSnapshotV1;
}): M20FinalControlRehearsalEvidenceV1 {
  const copied = Object.fromEntries(
    SNAPSHOT_EVIDENCE_FIELDS.map((field) => [field, input.snapshot[field]]),
  );
  const denialReasonCode = finalControlDenialReason(input.snapshot);
  return createArtifact(
    M20FinalControlRehearsalEvidenceSchema,
    M20_FINGERPRINT_DOMAINS.rehearsalEvidence,
    "evidenceFingerprint",
    {
      schemaVersion: "1.0",
      rehearsalEvidenceId: input.rehearsalEvidenceId,
      runId: input.snapshot.runId,
      snapshotId: input.snapshot.snapshotId,
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      rehearsalEvaluatedAt: input.snapshot.rehearsalEvaluatedAt,
      ...copied,
      outcome: denialReasonCode === null ? "would-allow" : "would-deny",
      ...(denialReasonCode === null ? {} : { denialReasonCode }),
      policyVersion: "m20-final-control-policy-v1",
    },
  );
}

export function createM20DryRunReport(
  input: Without<M20DryRunReportV1, "reportFingerprint">,
): M20DryRunReportV1 {
  return createArtifact(
    M20DryRunReportSchema,
    M20_FINGERPRINT_DOMAINS.report,
    "reportFingerprint",
    input,
  );
}

export function verifyM20DryRunRequest(value: unknown): boolean {
  const parsed = M20DryRunRequestSchema.safeParse(value);
  return (
    parsed.success &&
    fingerprintMatches(parsed.data, M20_FINGERPRINT_DOMAINS.request, "requestFingerprint")
  );
}

export function verifyM20ScenarioCatalog(value: unknown): boolean {
  const parsed = M20ScenarioCatalogSchema.safeParse(value);
  return (
    parsed.success &&
    parsed.data.scenarios.every(
      (scenario) =>
        fingerprintMatches(scenario, M20_FINGERPRINT_DOMAINS.scenario, "scenarioFingerprint") &&
        [scenario.primaryFault, scenario.precedenceFault].every(
          (fault) =>
            fault === undefined ||
            fingerprintMatches(fault, M20_FINGERPRINT_DOMAINS.fault, "faultFingerprint"),
        ),
    ) &&
    fingerprintMatches(parsed.data, M20_FINGERPRINT_DOMAINS.catalog, "catalogFingerprint")
  );
}

export function verifyM20FinalControlProfile(value: unknown): boolean {
  const parsed = M20FinalControlProfileSchema.safeParse(value);
  return (
    parsed.success &&
    fingerprintMatches(
      parsed.data,
      M20_FINGERPRINT_DOMAINS.finalControlProfile,
      "profileFingerprint",
    )
  );
}

export function verifyM20FinalControlSnapshot(value: unknown): boolean {
  const parsed = M20FinalControlSnapshotSchema.safeParse(value);
  return (
    parsed.success &&
    fingerprintMatches(
      parsed.data,
      M20_FINGERPRINT_DOMAINS.finalControlSnapshot,
      "snapshotFingerprint",
    )
  );
}

export function verifyM20FinalControlRehearsalEvidence(value: unknown): boolean {
  const parsed = M20FinalControlRehearsalEvidenceSchema.safeParse(value);
  return (
    parsed.success &&
    fingerprintMatches(
      parsed.data,
      M20_FINGERPRINT_DOMAINS.rehearsalEvidence,
      "evidenceFingerprint",
    )
  );
}

type VerificationReason =
  | "invalid_artifact"
  | "fingerprint_mismatch"
  | "scenario_mismatch"
  | "stage_grammar_mismatch"
  | "call_count_mismatch"
  | "assertion_mismatch"
  | "network_count_nonzero"
  | "terminal_discriminant_mismatch";

function invalid(reasonCode: VerificationReason): M20ArtifactVerificationResultV1 {
  return immutable({ status: "invalid", reasonCode } as M20ArtifactVerificationResultV1);
}

const CAPTURE_FAILED = Symbol("M20_CAPTURE_FAILED");
const M20_CAPTURE_MAX_DEPTH = 128;
const M20_CAPTURE_MAX_OWN_KEYS = 257;
// 256 schema-permitted scenarios × a conservative 128 nodes each, plus catalog envelope.
const M20_CAPTURE_MAX_NODES = 256 * 128 + 512;

type CapturedPlainData =
  | null
  | boolean
  | number
  | string
  | CapturedPlainData[]
  | {
      [key: string]: CapturedPlainData;
    };

/**
 * Takes an inert snapshot of public verifier input without invoking an accessor.
 * Reflection against a hostile Proxy can itself throw, so every reflective step
 * is contained and represented by the private failure sentinel.
 */
function capturePlainData(value: unknown): CapturedPlainData | typeof CAPTURE_FAILED {
  const root: { value?: CapturedPlainData } = {};
  type CaptureTarget = typeof root | CapturedPlainData[] | { [key: string]: CapturedPlainData };
  type CaptureWork =
    | {
        readonly kind: "capture";
        readonly source: unknown;
        readonly target: CaptureTarget;
        readonly key: number | string;
        readonly depth: number;
      }
    | { readonly kind: "exit"; readonly source: object };
  const work: CaptureWork[] = [
    { kind: "capture", source: value, target: root, key: "value", depth: 0 },
  ];
  const ancestors = new WeakSet<object>();
  let nodeCount = 0;

  try {
    while (work.length > 0) {
      const frame = work.pop()!;
      if (frame.kind === "exit") {
        ancestors.delete(frame.source);
        continue;
      }

      nodeCount += 1;
      if (nodeCount > M20_CAPTURE_MAX_NODES || frame.depth > M20_CAPTURE_MAX_DEPTH) {
        return CAPTURE_FAILED;
      }
      const source = frame.source;
      if (
        source === null ||
        typeof source === "boolean" ||
        typeof source === "string" ||
        (typeof source === "number" && Number.isFinite(source))
      ) {
        (frame.target as Record<number | string, CapturedPlainData>)[frame.key] = source;
        continue;
      }
      if (typeof source !== "object" || isProxy(source) || ancestors.has(source)) {
        return CAPTURE_FAILED;
      }

      const isArray = Array.isArray(source);
      const prototype = Object.getPrototypeOf(source) as object | null;
      const keys = Reflect.ownKeys(source);
      if (keys.length > M20_CAPTURE_MAX_OWN_KEYS) return CAPTURE_FAILED;
      const descriptors = Object.getOwnPropertyDescriptors(source);
      let captured: CapturedPlainData[] | { [key: string]: CapturedPlainData };
      const children: { readonly key: number | string; readonly value: unknown }[] = [];

      if (isArray) {
        if (prototype !== Array.prototype) return CAPTURE_FAILED;
        const lengthDescriptor = descriptors.length;
        if (
          lengthDescriptor === undefined ||
          !("value" in lengthDescriptor) ||
          lengthDescriptor.enumerable ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0
        ) {
          return CAPTURE_FAILED;
        }
        const length = lengthDescriptor.value as number;
        const indexKeys = keys.filter((key) => key !== "length");
        if (
          indexKeys.length !== length ||
          indexKeys.some(
            (key) =>
              typeof key !== "string" ||
              !/^\d+$/u.test(key) ||
              !Number.isSafeInteger(Number(key)) ||
              Number(key) < 0 ||
              Number(key) >= length ||
              String(Number(key)) !== key,
          )
        ) {
          return CAPTURE_FAILED;
        }
        captured = new Array<CapturedPlainData>(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            return CAPTURE_FAILED;
          }
          children.push({ key: index, value: descriptor.value });
        }
      } else {
        if (prototype !== Object.prototype && prototype !== null) return CAPTURE_FAILED;
        captured = Object.create(null) as { [key: string]: CapturedPlainData };
        for (const key of keys) {
          if (typeof key !== "string") return CAPTURE_FAILED;
          const descriptor = descriptors[key];
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            return CAPTURE_FAILED;
          }
          children.push({ key, value: descriptor.value });
        }
      }

      (frame.target as Record<number | string, CapturedPlainData>)[frame.key] = captured;
      ancestors.add(source);
      work.push({ kind: "exit", source });
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!;
        work.push({
          kind: "capture",
          source: child.value,
          target: captured,
          key: child.key,
          depth: frame.depth + 1,
        });
      }
    }
  } catch {
    return CAPTURE_FAILED;
  }
  return Object.hasOwn(root, "value") ? root.value! : CAPTURE_FAILED;
}

export function verifyM20DryRunReport(
  value: unknown,
  requestValue: unknown,
  catalogValue: unknown,
): M20ArtifactVerificationResultV1 {
  const capturedValue = capturePlainData(value);
  const capturedRequest = capturePlainData(requestValue);
  const capturedCatalog = capturePlainData(catalogValue);
  if (
    capturedValue === CAPTURE_FAILED ||
    capturedRequest === CAPTURE_FAILED ||
    capturedCatalog === CAPTURE_FAILED
  ) {
    return invalid("invalid_artifact");
  }
  if (!verifyM20DryRunRequest(capturedRequest) || !verifyM20ScenarioCatalog(capturedCatalog)) {
    return invalid("invalid_artifact");
  }
  if (capturedValue === null || typeof capturedValue !== "object" || Array.isArray(capturedValue)) {
    return invalid("invalid_artifact");
  }
  const candidate = capturedValue as Record<string, unknown>;
  if (candidate.networkAttemptCount !== 0) return invalid("network_count_nonzero");
  const request = M20DryRunRequestSchema.parse(capturedRequest);
  const catalog = M20ScenarioCatalogSchema.parse(capturedCatalog);
  const scenario = catalog.scenarios.find((entry) => entry.scenarioId === request.scenarioId);
  const requestScenarioAuthoritative =
    scenario !== undefined &&
    request.catalogFingerprint === catalog.catalogFingerprint &&
    request.scenarioFingerprint === scenario.scenarioFingerprint;
  const scenarioAuthorityRejected =
    !requestScenarioAuthoritative &&
    candidate.status === "dry-run-rejected" &&
    candidate.reasonCode === "scenario_non_authoritative";
  if (!scenarioAuthorityRejected && !requestScenarioAuthoritative) {
    return invalid("scenario_mismatch");
  }
  const observations = candidate.observations;
  if (Array.isArray(observations)) {
    for (const observation of observations) {
      if (
        observation !== null &&
        typeof observation === "object" &&
        !fingerprintMatches(
          observation,
          M20_FINGERPRINT_DOMAINS.stageObservation,
          "observationFingerprint",
        )
      ) {
        return invalid("fingerprint_mismatch");
      }
    }
  }
  if (
    typeof candidate.reportFingerprint === "string" &&
    !fingerprintMatches(candidate, M20_FINGERPRINT_DOMAINS.report, "reportFingerprint")
  ) {
    return invalid("fingerprint_mismatch");
  }
  if (!scenarioAuthorityRejected && scenario !== undefined) {
    const rawCounts = candidate.protectedCallCounts;
    if (
      rawCounts === null ||
      typeof rawCounts !== "object" ||
      !Object.entries(scenario.expectedOwnerCallCounts).every(
        ([key, count]) => (rawCounts as Record<string, unknown>)[key] === count,
      )
    ) {
      return invalid("call_count_mismatch");
    }
    if (
      !Array.isArray(observations) ||
      scenario.expectedObservations.length !== observations.length ||
      scenario.expectedObservations.some((expected, index) => {
        const actual = observations[index];
        return (
          actual === null ||
          typeof actual !== "object" ||
          (actual as Record<string, unknown>).stage !== expected.stage ||
          (actual as Record<string, unknown>).outcome !== expected.outcome
        );
      })
    ) {
      return invalid("stage_grammar_mismatch");
    }
    if (
      scenario.expectedOwnerResult !== candidate.status ||
      scenario.expectedOwnerReasonCode !==
        (candidate.status === "dry-run-rejected" ? candidate.reasonCode : undefined) ||
      (candidate.status === "dry-run-verified" && Object.hasOwn(candidate, "reasonCode"))
    ) {
      return invalid("terminal_discriminant_mismatch");
    }
  }
  const parsed = M20DryRunReportSchema.safeParse(capturedValue);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join("."));
    if (paths.some((path) => path.startsWith("protectedCallCounts")))
      return invalid("call_count_mismatch");
    if (paths.some((path) => path.startsWith("securityAssertions")))
      return invalid("assertion_mismatch");
    if (paths.some((path) => path === "status" || path === "reasonCode")) {
      return invalid("terminal_discriminant_mismatch");
    }
    if (paths.some((path) => path.startsWith("observations")))
      return invalid("stage_grammar_mismatch");
    return invalid("invalid_artifact");
  }
  if (
    candidate.runId !== request.runId ||
    candidate.requestFingerprint !== request.requestFingerprint ||
    candidate.scenarioId !== request.scenarioId ||
    candidate.scenarioFingerprint !== request.scenarioFingerprint ||
    candidate.catalogFingerprint !== request.catalogFingerprint
  ) {
    return invalid("scenario_mismatch");
  }
  const report = parsed.data;
  if (
    report.evaluatedAt !== request.evaluatedAt ||
    report.rehearsalEvaluatedAt !== request.rehearsalEvaluatedAt
  ) {
    return invalid("scenario_mismatch");
  }
  const requestObservation = report.observations[0];
  const scenarioObservation = report.observations[1];
  if (
    requestObservation?.stage !== "request-accepted" ||
    requestObservation.artifactBindings.runId !== request.runId ||
    requestObservation.artifactBindings.requestFingerprint !== request.requestFingerprint ||
    scenarioObservation?.stage !== "scenario-authority-verified" ||
    scenarioObservation.artifactBindings.scenarioId !== request.scenarioId ||
    scenarioObservation.artifactBindings.scenarioFingerprint !== request.scenarioFingerprint ||
    scenarioObservation.artifactBindings.catalogFingerprint !== request.catalogFingerprint
  ) {
    return invalid("scenario_mismatch");
  }
  for (const entry of report.observations) {
    const binding = entry.artifactBindings as Readonly<Record<string, unknown>>;
    if (
      (entry.stage === "authorization-issued" &&
        (binding.authorizationDecisionId !== request.authorizationDecisionId ||
          (entry.outcome === "completed" &&
            binding.authorizationDecisionFingerprint !==
              request.credentialResolutionRequest.authorizationDecisionFingerprint))) ||
      (entry.stage === "authorization-claimed" &&
        (binding.authorizationClaimId !== request.authorizationClaimId ||
          (entry.outcome === "completed" &&
            binding.authorizationClaimFingerprint !==
              request.credentialResolutionRequest.authorizationClaimFingerprint))) ||
      (entry.stage === "preparation-started" &&
        (binding.preparationId !== request.preparationId ||
          binding.requestPlanId !== request.requestPlanId)) ||
      (entry.stage === "preparation-disabled-bound" &&
        (binding.preparationId !== request.preparationId ||
          (entry.outcome === "completed" &&
            (binding.requestPlanId !== request.requestPlanId ||
              binding.adapterId !== request.authorizationRequest.adapterId ||
              binding.adapterFingerprint !== request.authorizationRequest.adapterFingerprint ||
              binding.operation !== request.authorizationRequest.operation ||
              binding.evaluatedAt !== request.evaluatedAt)))) ||
      (entry.stage === "final-control-rehearsal-complete" &&
        binding.rehearsalEvidenceId !== request.rehearsalEvidenceId) ||
      (entry.stage === "no-network-verified" && binding.networkAttemptCount !== 0)
    ) {
      return invalid("scenario_mismatch");
    }
  }
  return immutable({ status: "valid" });
}
