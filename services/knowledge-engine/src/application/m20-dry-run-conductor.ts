import {
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  M19PreparationResultSchema,
  M20DryRunRequestSchema,
  M20FinalControlSnapshotIssuanceResultSchema,
  M20FinalControlSnapshotVerificationResultSchema,
  M20ScenarioCatalogSchema,
  type ExecutionAuthorizationClaimResult,
  type ExecutionAuthorizationIssuanceResult,
  type ExecutionAuthorizationVerificationResult,
  type M19PreparationResult,
  type M20DryRunRequestV1,
  type M20DryRunResultV1,
  type M20FinalControlSnapshotIssuanceRequestV1,
  type M20FinalControlSnapshotIssuanceResultV1,
  type M20FinalControlSnapshotVerificationRequestV1,
  type M20FinalControlSnapshotVerificationResultV1,
  type M20FinalControlSnapshotV1,
  type M20ProtectedCallCountsV1,
  type M20ScenarioCatalogV1,
  type M20ScenarioDescriptorV1,
  type M20SecurityAssertionV1,
  type M20StageObservationV1,
} from "@founderos/knowledge-schema";
import { isProxy } from "node:util/types";

import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import {
  createM20DryRunReport,
  createM20FinalControlRehearsalEvidence,
  createM20StageObservation,
  verifyM20DryRunReport,
  verifyM20DryRunRequest,
  verifyM20FinalControlRehearsalEvidence,
  verifyM20FinalControlSnapshot,
  verifyM20ScenarioCatalog,
} from "../domain/m20-dry-run.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";
import type {
  ClaimExecutionAuthorizationDecisionInput,
  IssueExecutionAuthorizationDecisionInput,
  VerifyRegisteredExecutionAuthorizationClaimInput,
  VerifyRegisteredExecutionAuthorizationDecisionInput,
} from "./in-memory-execution-authorization-authority.js";
import type { PrepareOpenAIResponsesInput } from "./openai-responses-preparation-orchestrator.js";

export interface M20AuthorizationAuthorityPort {
  readonly issueDecision: (
    input: IssueExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationIssuanceResult;
  readonly claimDecision: (
    input: ClaimExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationClaimResult;
  readonly verifyDecision: (
    input: VerifyRegisteredExecutionAuthorizationDecisionInput,
  ) => ExecutionAuthorizationVerificationResult;
  readonly verifyClaim: (
    input: VerifyRegisteredExecutionAuthorizationClaimInput,
  ) => ExecutionAuthorizationVerificationResult;
}

export interface M20PreparationPort {
  readonly prepare: (input: PrepareOpenAIResponsesInput) => Promise<M19PreparationResult>;
}

export interface M20FinalControlSnapshotAuthorityPort {
  readonly issueSnapshot: (
    input: M20FinalControlSnapshotIssuanceRequestV1,
  ) => M20FinalControlSnapshotIssuanceResultV1;
  readonly verifySnapshot: (
    input: M20FinalControlSnapshotVerificationRequestV1,
  ) => M20FinalControlSnapshotVerificationResultV1;
}

export interface M20NetworkAttemptWitnessPort {
  readonly readAttemptCount: () => number;
}

export interface M20DryRunConductorConfiguration {
  readonly schemaVersion: "1.0";
  readonly catalog: M20ScenarioCatalogV1;
  readonly authorizationAuthority: M20AuthorizationAuthorityPort;
  readonly m19PreparationPort: M20PreparationPort;
  readonly finalControlAuthority: M20FinalControlSnapshotAuthorityPort;
  readonly networkAttemptWitness: M20NetworkAttemptWitnessPort;
}

export interface M20DryRunConductor {
  readonly run: (input: unknown) => Promise<M20DryRunResultV1>;
}

interface Reservation {
  readonly canonicalInput: string;
  state: "in-flight" | "terminal";
  result?: M20DryRunResultV1;
}

type ReportedReason = Exclude<
  NonNullable<M20ScenarioDescriptorV1["expectedOwnerReasonCode"]>,
  "internal_integrity_failure"
>;

const CONFIGURATION_KEYS = [
  "schemaVersion",
  "catalog",
  "authorizationAuthority",
  "m19PreparationPort",
  "finalControlAuthority",
  "networkAttemptWitness",
] as const;
const REQUEST_KEYS = [
  "schemaVersion",
  "runId",
  "scenarioId",
  "scenarioFingerprint",
  "catalogFingerprint",
  "evaluatedAt",
  "rehearsalEvaluatedAt",
  "authorizationRequest",
  "serviceIdentityEvidence",
  "humanApprovalEvidence",
  "authorizationDecisionId",
  "authorizationDecisionExpiresAt",
  "authorizationClaimId",
  "preparationId",
  "requestPlanId",
  "credentialResolutionRequest",
  "finalControlSnapshotId",
  "rehearsalEvidenceId",
  "requestFingerprint",
] as const;
const COUNT_KEYS = [
  "authorizationIssuanceCalls",
  "authorizationClaimCalls",
  "authorizationVerificationCalls",
  "m19PreparationCalls",
  "finalControlIssuanceCalls",
  "finalControlVerificationCalls",
] as const;
const ASSERTIONS = [
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
const ASSERTION_TUPLES: Record<ReportedReason | "dry-run-verified", string> = {
  scenario_non_authoritative: "PFNNNNNPPP",
  authorization_issuance_rejected: "PPFNNNNPPP",
  authorization_claim_rejected: "PPFNNNNPPP",
  preparation_rejected: "PPPFNNNPPP",
  preparation_non_authoritative: "PPPFNNNPPP",
  final_control_issuance_rejected: "PPPPFNNPPP",
  final_control_non_authoritative: "PPPPFNNPPP",
  final_control_rehearsal_denied: "PPPPPFPPPP",
  "dry-run-verified": "PPPPPPPPPP",
};

const UNSAFE_PUBLIC_STRING =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|(?:^|[\s([{"'=])\/(?!\/)|(?:api[_ -]?key|access[_ -]?token|authorization|bearer|password|private[_ -]?key|client[_ -]?secret)\s*[:=]\s*\S+|\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b|\bgh[pousr]_[A-Za-z0-9]+\b|\bxox[baprs]-[A-Za-z0-9-]+\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+)/i;

const REQUEST_CAPTURE_FAILED = Symbol("M20_REQUEST_CAPTURE_FAILED");
const M20_REQUEST_CAPTURE_MAX_DEPTH = 128;
const M20_REQUEST_CAPTURE_MAX_OWN_KEYS = 257;
const M20_REQUEST_CAPTURE_MAX_NODES = 256 * 128 + 512;

type RequestPlainData =
  null | boolean | number | string | RequestPlainData[] | { [key: string]: RequestPlainData };

function captureRequestPlainData(value: unknown): RequestPlainData | typeof REQUEST_CAPTURE_FAILED {
  const root: { value?: RequestPlainData } = {};
  type Target = typeof root | RequestPlainData[] | { [key: string]: RequestPlainData };
  type Work =
    | {
        readonly kind: "capture";
        readonly source: unknown;
        readonly target: Target;
        readonly key: number | string;
        readonly depth: number;
      }
    | { readonly kind: "exit"; readonly source: object };
  const work: Work[] = [{ kind: "capture", source: value, target: root, key: "value", depth: 0 }];
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
      if (
        nodeCount > M20_REQUEST_CAPTURE_MAX_NODES ||
        frame.depth > M20_REQUEST_CAPTURE_MAX_DEPTH
      ) {
        return REQUEST_CAPTURE_FAILED;
      }
      const source = frame.source;
      if (
        source === null ||
        typeof source === "boolean" ||
        typeof source === "string" ||
        (typeof source === "number" && Number.isFinite(source))
      ) {
        (frame.target as Record<number | string, RequestPlainData>)[frame.key] = source;
        continue;
      }
      if (typeof source !== "object" || isProxy(source) || ancestors.has(source)) {
        return REQUEST_CAPTURE_FAILED;
      }

      const array = Array.isArray(source);
      const prototype = Object.getPrototypeOf(source) as object | null;
      const keys = Reflect.ownKeys(source);
      if (keys.length > M20_REQUEST_CAPTURE_MAX_OWN_KEYS) return REQUEST_CAPTURE_FAILED;
      const descriptors = Object.getOwnPropertyDescriptors(source);
      let captured: RequestPlainData[] | { [key: string]: RequestPlainData };
      const children: { readonly key: number | string; readonly value: unknown }[] = [];
      if (array) {
        if (prototype !== Array.prototype) return REQUEST_CAPTURE_FAILED;
        const lengthDescriptor = descriptors.length;
        if (
          lengthDescriptor === undefined ||
          !("value" in lengthDescriptor) ||
          lengthDescriptor.enumerable ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0
        ) {
          return REQUEST_CAPTURE_FAILED;
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
          return REQUEST_CAPTURE_FAILED;
        }
        captured = new Array<RequestPlainData>(length);
        for (let index = 0; index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            return REQUEST_CAPTURE_FAILED;
          }
          children.push({ key: index, value: descriptor.value });
        }
      } else {
        if (prototype !== Object.prototype && prototype !== null) return REQUEST_CAPTURE_FAILED;
        captured = Object.create(null) as { [key: string]: RequestPlainData };
        for (const key of keys) {
          if (typeof key !== "string") return REQUEST_CAPTURE_FAILED;
          const descriptor = descriptors[key];
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
            return REQUEST_CAPTURE_FAILED;
          }
          children.push({ key, value: descriptor.value });
        }
      }

      (frame.target as Record<number | string, RequestPlainData>)[frame.key] = captured;
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
    return REQUEST_CAPTURE_FAILED;
  }
  return Object.hasOwn(root, "value") ? root.value! : REQUEST_CAPTURE_FAILED;
}

function containsUnsafePublicString(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") return UNSAFE_PUBLIC_STRING.test(value);
  if (typeof value === "function") return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
  ) {
    return true;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    if (typeof key !== "string") return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return true;
    if (containsUnsafePublicString(descriptor.value, seen)) return true;
  }
  return false;
}

function captureValidM20Request(
  input: unknown,
): { readonly request: M20DryRunRequestV1; readonly canonicalInput: string } | null {
  try {
    const capturedInput = captureRequestPlainData(input);
    if (
      capturedInput === REQUEST_CAPTURE_FAILED ||
      capturedInput === null ||
      typeof capturedInput !== "object" ||
      Array.isArray(capturedInput)
    ) {
      return null;
    }
    const inputDescriptors = captureExactOwnEnumerableDataDescriptors(capturedInput, REQUEST_KEYS);
    if (inputDescriptors === null) return null;
    const capturedObject = Object.fromEntries(
      REQUEST_KEYS.map((key) => [key, inputDescriptors[key].value]),
    );
    if (containsUnsafePublicString(capturedObject) || !verifyM20DryRunRequest(capturedObject)) {
      return null;
    }
    const request = M20DryRunRequestSchema.parse(capturedObject);
    return { request, canonicalInput: serializeDurableCanonicalJsonValue(request) };
  } catch {
    return null;
  }
}

function integrityRejected(): M20DryRunResultV1 {
  return Object.freeze({ status: "integrity-rejected", reasonCode: "internal_integrity_failure" });
}

function preflight(reasonCode: "invalid_input" | "conflicting_run_identity"): M20DryRunResultV1 {
  return Object.freeze({ status: "preflight-rejected", reasonCode });
}

function counts(): M20ProtectedCallCountsV1 {
  return {
    authorizationIssuanceCalls: 0,
    authorizationClaimCalls: 0,
    authorizationVerificationCalls: 0,
    m19PreparationCalls: 0,
    finalControlIssuanceCalls: 0,
    finalControlVerificationCalls: 0,
  };
}

function countEqual(left: M20ProtectedCallCountsV1, right: M20ProtectedCallCountsV1): boolean {
  return COUNT_KEYS.every((key) => left[key] === right[key]);
}

function assertions(terminal: ReportedReason | "dry-run-verified"): M20SecurityAssertionV1[] {
  const map = { P: "passed", F: "failed", N: "not-reached" } as const;
  return ASSERTIONS.map((assertion, index) => ({
    assertion,
    status: map[ASSERTION_TUPLES[terminal][index] as keyof typeof map],
  }));
}

function observation(
  request: M20DryRunRequestV1,
  position: number,
  stage: M20StageObservationV1["stage"],
  outcome: "completed" | "rejected",
  artifactBindings: object,
  reasonCode?: ReportedReason,
): M20StageObservationV1 {
  return createM20StageObservation({
    schemaVersion: "1.0",
    position,
    stage,
    outcome,
    observedAt:
      stage === "final-control-rehearsal-complete"
        ? request.rehearsalEvaluatedAt
        : request.evaluatedAt,
    artifactBindings,
    ...(reasonCode === undefined ? {} : { reasonCode }),
  } as never);
}

function snapshotMatchesRequest(
  snapshot: M20FinalControlSnapshotV1,
  request: M20DryRunRequestV1,
  decisionFingerprint: string,
  claimFingerprint: string,
): boolean {
  const authorization = request.authorizationRequest;
  const credential = request.credentialResolutionRequest;
  return (
    snapshot.snapshotId === request.finalControlSnapshotId &&
    snapshot.runId === request.runId &&
    snapshot.rehearsalEvaluatedAt === request.rehearsalEvaluatedAt &&
    snapshot.authorizationDecisionId === request.authorizationDecisionId &&
    snapshot.authorizationDecisionFingerprint === decisionFingerprint &&
    snapshot.authorizationClaimId === request.authorizationClaimId &&
    snapshot.authorizationClaimFingerprint === claimFingerprint &&
    snapshot.executionAttemptId === authorization.executionAttemptId &&
    snapshot.executionAttemptFingerprint === authorization.executionAttemptFingerprint &&
    snapshot.adapterId === authorization.adapterId &&
    snapshot.adapterFingerprint === authorization.adapterFingerprint &&
    snapshot.modelPolicyReference === authorization.modelPolicyReference &&
    snapshot.modelPolicyFingerprint === authorization.modelPolicyFingerprint &&
    snapshot.providerFamilyReference === authorization.providerFamilyReference &&
    snapshot.environmentClass === authorization.environmentClass &&
    snapshot.operation === authorization.operation &&
    snapshot.credentialReferenceId === credential.credentialReferenceId &&
    snapshot.credentialReferenceFingerprint === credential.credentialReferenceFingerprint &&
    snapshot.credentialRotationVersion === credential.expectedRotationVersion &&
    Date.parse(snapshot.rehearsalEvaluatedAt) >= Date.parse(request.evaluatedAt)
  );
}

export function createM20DryRunConductor(
  configuration: M20DryRunConductorConfiguration,
): M20DryRunConductor {
  const descriptors = captureExactOwnEnumerableDataDescriptors(configuration, CONFIGURATION_KEYS);
  if (descriptors === null || descriptors.schemaVersion.value !== "1.0") {
    throw new TypeError("M20 conductor configuration is invalid");
  }
  const catalogValue = descriptors.catalog.value;
  if (!verifyM20ScenarioCatalog(catalogValue)) {
    throw new TypeError("M20 conductor catalog is invalid");
  }
  const catalog = M20ScenarioCatalogSchema.parse(catalogValue);
  const authorizationAuthority = descriptors.authorizationAuthority.value;
  const m19PreparationPort = descriptors.m19PreparationPort.value;
  const finalControlAuthority = descriptors.finalControlAuthority.value;
  const networkAttemptWitness = descriptors.networkAttemptWitness.value;
  const authorizationDescriptors = captureExactOwnEnumerableDataDescriptors(
    authorizationAuthority,
    ["issueDecision", "claimDecision", "verifyDecision", "verifyClaim"],
  );
  const preparationDescriptors = captureExactOwnEnumerableDataDescriptors(m19PreparationPort, [
    "prepare",
  ]);
  const finalControlDescriptors = captureExactOwnEnumerableDataDescriptors(finalControlAuthority, [
    "issueSnapshot",
    "verifySnapshot",
  ]);
  const witnessDescriptors = captureExactOwnEnumerableDataDescriptors(networkAttemptWitness, [
    "readAttemptCount",
  ]);
  const issueDecision = authorizationDescriptors?.issueDecision.value;
  const claimDecision = authorizationDescriptors?.claimDecision.value;
  const verifyDecision = authorizationDescriptors?.verifyDecision.value;
  const verifyClaim = authorizationDescriptors?.verifyClaim.value;
  const prepare = preparationDescriptors?.prepare.value;
  const issueSnapshot = finalControlDescriptors?.issueSnapshot.value;
  const verifySnapshot = finalControlDescriptors?.verifySnapshot.value;
  const readAttemptCount = witnessDescriptors?.readAttemptCount.value;
  if (
    typeof issueDecision !== "function" ||
    typeof claimDecision !== "function" ||
    typeof verifyDecision !== "function" ||
    typeof verifyClaim !== "function" ||
    typeof prepare !== "function" ||
    typeof issueSnapshot !== "function" ||
    typeof verifySnapshot !== "function" ||
    typeof readAttemptCount !== "function"
  ) {
    throw new TypeError("M20 conductor configuration is invalid");
  }
  const issueDecisionMethod = issueDecision as M20AuthorizationAuthorityPort["issueDecision"];
  const claimDecisionMethod = claimDecision as M20AuthorizationAuthorityPort["claimDecision"];
  const verifyDecisionMethod = verifyDecision as M20AuthorizationAuthorityPort["verifyDecision"];
  const verifyClaimMethod = verifyClaim as M20AuthorizationAuthorityPort["verifyClaim"];
  const prepareMethod = prepare as M20PreparationPort["prepare"];
  const issueSnapshotMethod =
    issueSnapshot as M20FinalControlSnapshotAuthorityPort["issueSnapshot"];
  const verifySnapshotMethod =
    verifySnapshot as M20FinalControlSnapshotAuthorityPort["verifySnapshot"];
  const readAttemptCountMethod =
    readAttemptCount as M20NetworkAttemptWitnessPort["readAttemptCount"];
  const reservations = new Map<string, Reservation>();

  const reserveIntegrityForRecoverableInput = (input: unknown): M20DryRunResultV1 => {
    const result = integrityRejected();
    const captured = captureValidM20Request(input);
    if (captured === null) return result;
    const existing = reservations.get(captured.request.runId);
    if (existing === undefined) {
      reservations.set(captured.request.runId, {
        canonicalInput: captured.canonicalInput,
        state: "terminal",
        result,
      });
      return result;
    }
    if (
      existing.canonicalInput === captured.canonicalInput &&
      existing.state === "terminal" &&
      existing.result?.status === "integrity-rejected"
    ) {
      return existing.result;
    }
    return result;
  };

  async function run(input: unknown): Promise<M20DryRunResultV1> {
    let firstWitness: number;
    try {
      firstWitness = readAttemptCountMethod.call(networkAttemptWitness);
    } catch {
      try {
        readAttemptCountMethod.call(networkAttemptWitness);
      } catch {
        // The closed integrity result intentionally carries no witness error detail.
      }
      return reserveIntegrityForRecoverableInput(input);
    }
    if (!Number.isSafeInteger(firstWitness) || firstWitness < 0) {
      try {
        readAttemptCountMethod.call(networkAttemptWitness);
      } catch {
        // The closed integrity result intentionally carries no witness error detail.
      }
      return reserveIntegrityForRecoverableInput(input);
    }
    const finishTransient = (result: M20DryRunResultV1): M20DryRunResultV1 => {
      try {
        const second = readAttemptCountMethod.call(networkAttemptWitness);
        return Number.isSafeInteger(firstWitness) &&
          firstWitness >= 0 &&
          Number.isSafeInteger(second) &&
          second >= 0 &&
          second === firstWitness
          ? result
          : integrityRejected();
      } catch {
        return integrityRejected();
      }
    };
    const captured = captureValidM20Request(input);
    if (captured === null) return finishTransient(preflight("invalid_input"));
    const { request, canonicalInput } = captured;
    const existing = reservations.get(request.runId);
    if (existing !== undefined) {
      if (existing.canonicalInput !== canonicalInput) {
        return finishTransient(preflight("conflicting_run_identity"));
      }
      if (existing.state === "in-flight") {
        return finishTransient(
          Object.freeze({ status: "in-flight", reason: "dry_run_in_progress" }),
        );
      }
      return finishTransient(existing.result!);
    }
    const reservation: Reservation = { canonicalInput, state: "in-flight" };
    reservations.set(request.runId, reservation);
    const callCounts = counts();
    const observations: M20StageObservationV1[] = [
      observation(request, 1, "request-accepted", "completed", {
        runId: request.runId,
        requestFingerprint: request.requestFingerprint,
      }),
    ];

    const storeIntegrity = (): M20DryRunResultV1 => {
      const result = integrityRejected();
      reservation.result = result;
      reservation.state = "terminal";
      return result;
    };
    const finishOwnerIntegrity = (): M20DryRunResultV1 => {
      try {
        readAttemptCountMethod.call(networkAttemptWitness);
      } catch {
        // The closed result intentionally carries no witness error detail.
      }
      return storeIntegrity();
    };
    const finishOwner = (
      reasonCode: ReportedReason | null,
      scenario: M20ScenarioDescriptorV1 | undefined,
    ): M20DryRunResultV1 => {
      let secondWitness: number;
      try {
        secondWitness = readAttemptCountMethod.call(networkAttemptWitness);
      } catch {
        return storeIntegrity();
      }
      if (
        !Number.isSafeInteger(firstWitness) ||
        firstWitness < 0 ||
        !Number.isSafeInteger(secondWitness) ||
        secondWitness !== firstWitness
      ) {
        return storeIntegrity();
      }
      const status = reasonCode === null ? "dry-run-verified" : "dry-run-rejected";
      if (scenario !== undefined) {
        const expectedReason = scenario.expectedOwnerReasonCode;
        const expectedObservations = scenario.expectedObservations;
        if (
          scenario.expectedOwnerResult !== status ||
          expectedReason !== (reasonCode ?? undefined) ||
          !countEqual(scenario.expectedOwnerCallCounts, callCounts) ||
          expectedObservations.length !== observations.length ||
          expectedObservations.some(
            (expected, index) =>
              observations[index]?.stage !== expected.stage ||
              observations[index]?.outcome !== expected.outcome,
          )
        ) {
          return storeIntegrity();
        }
      }
      try {
        const terminal = reasonCode ?? "dry-run-verified";
        const report = createM20DryRunReport({
          schemaVersion: "1.0",
          taxonomyId: "M20-dry-run-taxonomy-v1",
          runId: request.runId,
          scenarioId: request.scenarioId,
          scenarioFingerprint: request.scenarioFingerprint,
          catalogFingerprint: request.catalogFingerprint,
          evaluatedAt: request.evaluatedAt,
          rehearsalEvaluatedAt: request.rehearsalEvaluatedAt,
          requestFingerprint: request.requestFingerprint,
          status,
          ...(reasonCode === null ? {} : { reasonCode }),
          observations,
          protectedCallCounts: callCounts,
          networkAttemptCount: 0,
          securityAssertions: assertions(terminal),
        } as never);
        if (verifyM20DryRunReport(report, request, catalog).status !== "valid") {
          return storeIntegrity();
        }
        const result = Object.freeze({ status, report }) as M20DryRunResultV1;
        reservation.result = result;
        reservation.state = "terminal";
        return result;
      } catch {
        return storeIntegrity();
      }
    };
    const reject = (
      reasonCode: ReportedReason,
      stage: M20StageObservationV1["stage"],
      bindings: object,
      scenario?: M20ScenarioDescriptorV1,
    ): M20DryRunResultV1 => {
      observations.push(
        observation(request, observations.length + 1, stage, "rejected", bindings, reasonCode),
      );
      return finishOwner(reasonCode, scenario);
    };

    try {
      const scenario = catalog.scenarios.find((entry) => entry.scenarioId === request.scenarioId);
      if (
        scenario === undefined ||
        request.catalogFingerprint !== catalog.catalogFingerprint ||
        request.scenarioFingerprint !== scenario.scenarioFingerprint
      ) {
        return reject("scenario_non_authoritative", "scenario-authority-verified", {
          scenarioId: request.scenarioId,
          scenarioFingerprint: request.scenarioFingerprint,
          catalogFingerprint: request.catalogFingerprint,
        });
      }
      observations.push(
        observation(request, 2, "scenario-authority-verified", "completed", {
          scenarioId: request.scenarioId,
          scenarioFingerprint: request.scenarioFingerprint,
          catalogFingerprint: request.catalogFingerprint,
        }),
      );

      callCounts.authorizationIssuanceCalls += 1;
      const issuance = issueDecisionMethod.call(authorizationAuthority, {
        schemaVersion: "1.0",
        authorizationDecisionId: request.authorizationDecisionId,
        authorizationRequest: request.authorizationRequest,
        serviceIdentityEvidence: request.serviceIdentityEvidence,
        humanApprovalEvidence: request.humanApprovalEvidence,
        evaluatedAt: request.evaluatedAt,
        expiresAt: request.authorizationDecisionExpiresAt,
      }) as ExecutionAuthorizationIssuanceResult;
      if (
        issuance.status !== "issued" ||
        !ExecutionAuthorizationDecisionSchema.safeParse(issuance.decision).success
      ) {
        return reject(
          "authorization_issuance_rejected",
          "authorization-issued",
          {
            authorizationDecisionId: request.authorizationDecisionId,
          },
          scenario,
        );
      }
      callCounts.authorizationVerificationCalls += 1;
      const decisionVerification = verifyDecisionMethod.call(authorizationAuthority, {
        schemaVersion: "1.0",
        authorizationDecision: issuance.decision,
        evaluatedAt: request.evaluatedAt,
      }) as ExecutionAuthorizationVerificationResult;
      if (
        decisionVerification.status !== "valid" ||
        issuance.decision.authorizationDecisionId !== request.authorizationDecisionId ||
        issuance.decision.expiresAt !== request.authorizationDecisionExpiresAt ||
        serializeDurableCanonicalJsonValue(issuance.decision.authorizationRequest) !==
          serializeDurableCanonicalJsonValue(request.authorizationRequest)
      ) {
        return reject(
          "authorization_issuance_rejected",
          "authorization-issued",
          {
            authorizationDecisionId: request.authorizationDecisionId,
          },
          scenario,
        );
      }
      observations.push(
        observation(request, 3, "authorization-issued", "completed", {
          authorizationDecisionId: issuance.decision.authorizationDecisionId,
          authorizationDecisionFingerprint: issuance.decision.decisionFingerprint,
        }),
      );

      callCounts.authorizationClaimCalls += 1;
      const claimResult = claimDecisionMethod.call(authorizationAuthority, {
        schemaVersion: "1.0",
        authorizationClaimId: request.authorizationClaimId,
        authorizationDecision: issuance.decision,
        executionAttemptId: request.authorizationRequest.executionAttemptId,
        executionAttemptFingerprint: request.authorizationRequest.executionAttemptFingerprint,
        claimedAt: request.evaluatedAt,
        idempotentRetry: false,
      }) as ExecutionAuthorizationClaimResult;
      if (
        claimResult.status !== "claimed" ||
        !ExecutionAuthorizationClaimSchema.safeParse(claimResult.claim).success
      ) {
        return reject(
          "authorization_claim_rejected",
          "authorization-claimed",
          {
            authorizationClaimId: request.authorizationClaimId,
          },
          scenario,
        );
      }
      callCounts.authorizationVerificationCalls += 1;
      const claimVerification = verifyClaimMethod.call(authorizationAuthority, {
        schemaVersion: "1.0",
        authorizationDecision: issuance.decision,
        authorizationClaim: claimResult.claim,
        evaluatedAt: request.evaluatedAt,
      }) as ExecutionAuthorizationVerificationResult;
      if (
        claimVerification.status !== "valid" ||
        claimResult.claim.authorizationClaimId !== request.authorizationClaimId ||
        claimResult.claim.authorizationDecisionId !== issuance.decision.authorizationDecisionId ||
        claimResult.claim.decisionFingerprint !== issuance.decision.decisionFingerprint ||
        claimResult.claim.executionAttemptId !== request.authorizationRequest.executionAttemptId ||
        claimResult.claim.executionAttemptFingerprint !==
          request.authorizationRequest.executionAttemptFingerprint
      ) {
        return reject(
          "authorization_claim_rejected",
          "authorization-claimed",
          {
            authorizationClaimId: request.authorizationClaimId,
          },
          scenario,
        );
      }
      observations.push(
        observation(request, 4, "authorization-claimed", "completed", {
          authorizationClaimId: claimResult.claim.authorizationClaimId,
          authorizationClaimFingerprint: claimResult.claim.claimFingerprint,
        }),
      );
      observations.push(
        observation(request, 5, "preparation-started", "completed", {
          preparationId: request.preparationId,
          requestPlanId: request.requestPlanId,
        }),
      );
      callCounts.m19PreparationCalls += 1;
      const preparation = await prepareMethod.call(m19PreparationPort, {
        schemaVersion: "1.0",
        preparationId: request.preparationId,
        requestPlanId: request.requestPlanId,
        evaluatedAt: request.evaluatedAt,
        credentialResolutionRequest: request.credentialResolutionRequest,
        decision: issuance.decision,
        claim: claimResult.claim,
      });
      const parsedPreparation = M19PreparationResultSchema.safeParse(preparation);
      if (parsedPreparation.success && parsedPreparation.data.status === "rejected") {
        return reject(
          "preparation_rejected",
          "preparation-disabled-bound",
          {
            preparationId: request.preparationId,
          },
          scenario,
        );
      }
      if (!parsedPreparation.success || parsedPreparation.data.status !== "disabled-by-policy") {
        return reject(
          "preparation_non_authoritative",
          "preparation-disabled-bound",
          {
            preparationId: request.preparationId,
          },
          scenario,
        );
      }
      const terminal = parsedPreparation.data;
      if (
        terminal.preparationId !== request.preparationId ||
        terminal.requestPlanId !== request.requestPlanId ||
        terminal.adapterId !== request.authorizationRequest.adapterId ||
        terminal.adapterFingerprint !== request.authorizationRequest.adapterFingerprint ||
        terminal.operation !== request.authorizationRequest.operation ||
        terminal.evaluatedAt !== request.evaluatedAt
      ) {
        return reject(
          "preparation_non_authoritative",
          "preparation-disabled-bound",
          {
            preparationId: request.preparationId,
          },
          scenario,
        );
      }
      observations.push(
        observation(request, 6, "preparation-disabled-bound", "completed", {
          preparationId: terminal.preparationId,
          requestPlanId: terminal.requestPlanId,
          requestPlanFingerprint: terminal.requestPlanFingerprint,
          credentialResolutionEvidenceFingerprint: terminal.credentialResolutionEvidenceFingerprint,
          disabledPolicyFingerprint: terminal.disabledPolicyFingerprint,
          adapterId: terminal.adapterId,
          adapterFingerprint: terminal.adapterFingerprint,
          operation: terminal.operation,
          disabledPolicyVersion: terminal.disabledPolicyVersion,
          evaluatedAt: terminal.evaluatedAt,
        }),
      );

      callCounts.finalControlIssuanceCalls += 1;
      const rawSnapshotResult = issueSnapshotMethod.call(finalControlAuthority, {
        schemaVersion: "1.0",
        snapshotId: request.finalControlSnapshotId,
        runId: request.runId,
        scenarioId: request.scenarioId,
        scenarioFingerprint: request.scenarioFingerprint,
        catalogFingerprint: request.catalogFingerprint,
        rehearsalEvaluatedAt: request.rehearsalEvaluatedAt,
        decision: issuance.decision,
        claim: claimResult.claim,
        credentialResolutionRequest: request.credentialResolutionRequest,
        m19Terminal: terminal,
      }) as unknown;
      if (
        rawSnapshotResult === null ||
        typeof rawSnapshotResult !== "object" ||
        (rawSnapshotResult as { status?: unknown }).status !== "issued"
      ) {
        return reject(
          "final_control_issuance_rejected",
          "final-control-rehearsal-complete",
          {
            rehearsalEvidenceId: request.rehearsalEvidenceId,
          },
          scenario,
        );
      }
      const rawSnapshot = (rawSnapshotResult as { snapshot?: unknown }).snapshot;
      callCounts.finalControlVerificationCalls += 1;
      const rawVerification = verifySnapshotMethod.call(finalControlAuthority, {
        schemaVersion: "1.0",
        runId: request.runId,
        snapshot: rawSnapshot,
      } as never);
      const parsedSnapshotResult =
        M20FinalControlSnapshotIssuanceResultSchema.safeParse(rawSnapshotResult);
      const parsedVerification =
        M20FinalControlSnapshotVerificationResultSchema.safeParse(rawVerification);
      if (
        !parsedSnapshotResult.success ||
        parsedSnapshotResult.data.status !== "issued" ||
        !parsedVerification.success ||
        parsedVerification.data.status !== "valid" ||
        !verifyM20FinalControlSnapshot(parsedSnapshotResult.data.snapshot) ||
        !snapshotMatchesRequest(
          parsedSnapshotResult.data.snapshot,
          request,
          issuance.decision.decisionFingerprint,
          claimResult.claim.claimFingerprint,
        )
      ) {
        return reject(
          "final_control_non_authoritative",
          "final-control-rehearsal-complete",
          {
            rehearsalEvidenceId: request.rehearsalEvidenceId,
          },
          scenario,
        );
      }
      const rehearsal = createM20FinalControlRehearsalEvidence({
        rehearsalEvidenceId: request.rehearsalEvidenceId,
        snapshot: parsedSnapshotResult.data.snapshot,
      });
      if (!verifyM20FinalControlRehearsalEvidence(rehearsal)) {
        return reject(
          "final_control_non_authoritative",
          "final-control-rehearsal-complete",
          {
            rehearsalEvidenceId: request.rehearsalEvidenceId,
          },
          scenario,
        );
      }
      if (rehearsal.outcome === "would-deny") {
        return reject(
          "final_control_rehearsal_denied",
          "final-control-rehearsal-complete",
          {
            rehearsalEvidenceId: rehearsal.rehearsalEvidenceId,
            rehearsalEvidenceFingerprint: rehearsal.evidenceFingerprint,
            rehearsalOutcome: rehearsal.outcome,
          },
          scenario,
        );
      }
      observations.push(
        observation(request, 7, "final-control-rehearsal-complete", "completed", {
          rehearsalEvidenceId: rehearsal.rehearsalEvidenceId,
          rehearsalEvidenceFingerprint: rehearsal.evidenceFingerprint,
          rehearsalOutcome: rehearsal.outcome,
        }),
      );
      observations.push(
        observation(request, 8, "no-network-verified", "completed", {
          networkAttemptCount: 0,
        }),
      );
      return finishOwner(null, scenario);
    } catch {
      return finishOwnerIntegrity();
    }
  }

  return Object.freeze({ run });
}
