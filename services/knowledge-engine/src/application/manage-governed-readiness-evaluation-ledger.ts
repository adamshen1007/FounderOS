import {
  M15_DEFAULT_LIST_PAGE_SIZE,
  M15_MAX_DIFFERING_FIELD_PATHS,
  ReadinessCommittedEvaluationPageSchema,
  ReadinessDerivedIndexRebuildResultSchema,
  ReadinessIntegrityResultSchema,
  ReadinessListQuerySchema,
  ReadinessRecoveryResultSchema,
  ReadinessDerivedIndexRebuildFailureReasonSchema,
  ReadinessIntegrityFindingCodeSchema,
  ReadinessRegistrationIntegrityFailedReasonSchema,
  ReadinessRegistrationRejectedReasonSchema,
  ReadinessRegistrationResultSchema,
  ReadinessReplayAttemptPageSchema,
  ReadinessReplayNotRecordedReasonSchema,
  ReadinessReplaySubmissionResultSchema,
  CanonicalReadinessEvaluationPackageSchema,
  ReadinessCanonicalUtcInstantSchema,
  ReadinessLedgerIdentifierSchema,
  Sha256DigestSchema,
  findDurableCanonicalJsonIssue,
  type AuthorizationDecisionEvidence,
  type CanonicalReadinessEvaluationPackage,
  type CommittedReadinessEvaluationTransaction,
  type DurableContextDeliveryLedger,
  type DurableReadinessEvaluationLedger,
  type ReadinessDerivedIndexRebuildResult,
  type ReadinessIntegrityResult,
  type ReadinessListQuery,
  type ReadinessRecoveryResult,
  type ReadinessRegistrationResult,
  type ReadinessReplaySubmissionResult,
} from "@founderos/knowledge-schema";

import {
  createCanonicalReadinessEvaluationPackage,
  createCommittedReadinessTransaction,
  createDurableReadinessAuthorityProjection,
  createReadinessCurrentAdmissibility,
  createReadinessDerivedIndexes,
  createReadinessEvaluatorConfigurationProjection,
  createReadinessHistoricalComparison,
  createReadinessOwnership,
  createReadinessRegistrationRequest,
  createReadinessReplayAttempt,
  createReadinessReplayRequest,
  createRegistrationLedgerEvent,
  createReplayLedgerEvent,
  DurableReadinessLedgerError,
  verifyCanonicalReadinessEvaluationPackage,
  type ReplayedReadinessLedgerState,
} from "../domain/durable-readiness-ledger.js";
import {
  createDurableCanonicalJsonSha256Fingerprint,
  serializeDurableCanonicalJsonValue,
} from "../domain/canonical-fingerprint.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type { ReadinessLedgerStoragePort } from "./durable-readiness-ledger-port.js";
import type {
  EvaluateProductionProviderReadinessInput,
  ProductionProviderReadinessEvaluation,
  ProductionProviderReadinessEvaluator,
} from "./evaluate-production-provider-readiness.js";
import { deriveApprovedProductionProviderReadinessEvaluatorConfiguration } from "./evaluate-production-provider-readiness.js";
import {
  captureExactOwnEnumerableDataDescriptors,
  findProhibitedProductionProviderReadinessInputMaterial,
} from "./production-provider-readiness-input-safety.js";
import {
  resolveVerifiedGovernedReasoningAuthority,
  type DurableDeliveryTransactionIdentity,
} from "./resolve-verified-governed-reasoning-authority.js";

export interface ReadinessEvaluatorConfigurationInput {
  readonly configurationBindingVersion: "1.0";
  readonly adapterId: string;
  readonly adapterFingerprint: string;
  readonly providerFamilyReference: string;
  readonly transportPolicyId: string;
  readonly transportPolicyFingerprint: string;
  readonly transportPolicyVersion: "1.0";
  readonly observabilityPolicyVersion: "1.0";
  readonly readinessEvaluatorContractVersion: "1.0";
}

export interface RegisterVerifiedReadinessEvaluationInput {
  readonly contractVersion: "1.0";
  readonly registrationRequestId: string;
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly requestedOwnershipId: string;
  readonly requestedRegistrationSemanticEventId: string;
  readonly requestedRegistrationAuditEntryId: string;
  readonly requestedRegistrationMarkerId: string;
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly readinessInput: EvaluateProductionProviderReadinessInput;
  readonly evaluator: ProductionProviderReadinessEvaluator;
  readonly evaluatorConfiguration: ReadinessEvaluatorConfigurationInput;
  readonly expectedEvaluationPackage: CanonicalReadinessEvaluationPackage | null;
  readonly originalEvaluationTime: string;
  readonly submittedAt: string;
  readonly committedAt: string;
  readonly expectedLedgerHeadFingerprint: string;
}

export interface SubmitReadinessReplayInput {
  readonly replayContractVersion: "1.0";
  readonly replayIdempotencyKey: string;
  readonly replayRequestId: string;
  readonly requestedReplayAttemptId: string;
  readonly requestedReplaySemanticEventId: string;
  readonly requestedReplayAuditEntryId: string;
  readonly requestedReplayMarkerId: string;
  readonly originalTransactionId: string;
  readonly originalTransactionFingerprint: string;
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly readinessInput: EvaluateProductionProviderReadinessInput;
  readonly evaluator: ProductionProviderReadinessEvaluator;
  readonly evaluatorConfiguration: ReadinessEvaluatorConfigurationInput;
  readonly originalEvaluationTime: string;
  readonly replayEvaluatedAt: string;
  readonly recordedAt: string;
  readonly expectedLedgerHeadFingerprint: string;
}

export interface GovernedReadinessEvaluationLedger extends DurableReadinessEvaluationLedger {
  registerVerifiedReadinessEvaluation(
    input: RegisterVerifiedReadinessEvaluationInput,
  ): Promise<ReadinessRegistrationResult>;
  submitReadinessReplayAttempt(
    input: SubmitReadinessReplayInput,
  ): Promise<ReadinessReplaySubmissionResult>;
}

const REGISTRATION_INPUT_KEYS = [
  "contractVersion",
  "registrationRequestId",
  "transactionId",
  "idempotencyKey",
  "requestedOwnershipId",
  "requestedRegistrationSemanticEventId",
  "requestedRegistrationAuditEntryId",
  "requestedRegistrationMarkerId",
  "deliveryLedger",
  "deliveryIdentity",
  "readinessInput",
  "evaluator",
  "evaluatorConfiguration",
  "expectedEvaluationPackage",
  "originalEvaluationTime",
  "submittedAt",
  "committedAt",
  "expectedLedgerHeadFingerprint",
] as const;

const REPLAY_INPUT_KEYS = [
  "replayContractVersion",
  "replayIdempotencyKey",
  "replayRequestId",
  "requestedReplayAttemptId",
  "requestedReplaySemanticEventId",
  "requestedReplayAuditEntryId",
  "requestedReplayMarkerId",
  "originalTransactionId",
  "originalTransactionFingerprint",
  "deliveryLedger",
  "deliveryIdentity",
  "readinessInput",
  "evaluator",
  "evaluatorConfiguration",
  "originalEvaluationTime",
  "replayEvaluatedAt",
  "recordedAt",
  "expectedLedgerHeadFingerprint",
] as const;

const DELIVERY_IDENTITY_KEYS = [
  "transactionId",
  "deliveryRequestId",
  "deliveryRequestFingerprint",
  "deliveryEnvelopeId",
  "deliveryEnvelopeFingerprint",
  "deliveryReceiptId",
  "deliveryReceiptFingerprint",
] as const;

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function normalizedListQuery(raw: ReadinessListQuery | undefined): {
  readonly limit: number;
  readonly afterSequence: number | null;
} {
  const parsed = ReadinessListQuerySchema.parse(raw === undefined ? {} : raw);
  return {
    limit: parsed.limit ?? M15_DEFAULT_LIST_PAGE_SIZE,
    afterSequence: parsed.afterSequence ?? null,
  };
}

function canonicalDataCopy<T>(value: T): T {
  if (findDurableCanonicalJsonIssue(value) !== null) {
    throw new DurableReadinessLedgerError("invalid-input");
  }
  return immutable(value);
}

function same(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

function captureReadinessInput(input: EvaluateProductionProviderReadinessInput): {
  readonly input: EvaluateProductionProviderReadinessInput;
  readonly canonical: unknown;
} {
  const descriptors = captureExactOwnEnumerableDataDescriptors(input, [
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
  ] as const);
  if (descriptors === null) throw new DurableReadinessLedgerError("invalid-input");
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== "deliveryLedger") result[key] = descriptor.value;
  }
  if (
    findDurableCanonicalJsonIssue(result) !== null ||
    findProhibitedProductionProviderReadinessInputMaterial(
      Object.entries(result).map(([key, value]) => [key, value] as const),
    ) !== null
  ) {
    throw new DurableReadinessLedgerError("invalid-input");
  }
  serializeDurableCanonicalJsonValue(result);
  const canonical = immutable(result);
  return {
    canonical,
    input: Object.freeze({
      ...(canonical as Omit<EvaluateProductionProviderReadinessInput, "deliveryLedger">),
      deliveryLedger: descriptors.deliveryLedger.value,
    }),
  };
}

function capturedInput<T extends object, K extends readonly string[]>(input: T, keys: K): T {
  const descriptors = captureExactOwnEnumerableDataDescriptors(input, keys);
  if (descriptors === null) throw new DurableReadinessLedgerError("invalid-input");
  return Object.fromEntries(
    keys.map((key) => [key, descriptors[key as keyof typeof descriptors]!.value]),
  ) as T;
}

async function authorityProjection(input: {
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly readinessInput: EvaluateProductionProviderReadinessInput;
}) {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: input.deliveryLedger,
    deliveryIdentity: input.deliveryIdentity,
    invocationRequest: input.readinessInput.invocationRequest,
  });
  return createDurableReadinessAuthorityProjection({
    authorityProjectionContractVersion: "1.0",
    deliveryTransactionId: authority.transaction.transactionId,
    deliveryTransactionFingerprint: authority.transaction.transactionFingerprint,
    deliveryRequestId: authority.deliveryRequest.deliveryRequestId,
    deliveryRequestFingerprint: authority.deliveryRequest.requestFingerprint,
    deliveryEnvelopeId: authority.envelope.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: authority.envelope.deliveryFingerprint,
    deliveryReceiptId: authority.receipt.receiptId,
    deliveryReceiptFingerprint: authority.receipt.receiptFingerprint,
    contextPackageId: authority.envelope.contextPackageId,
    contextPackageFingerprint: authority.envelope.contextPackageFingerprint,
    consumerId: authority.envelope.consumerId,
    consumerDescriptorFingerprint: authority.envelope.consumerDescriptorFingerprint,
    invocationRequestId: authority.invocationRequest.invocationRequestId,
    invocationRequestFingerprint: authority.invocationRequest.requestFingerprint,
  });
}

function configProjection(input: ReadinessEvaluatorConfigurationInput) {
  return createReadinessEvaluatorConfigurationProjection(input);
}

function approvedConfigProjection(
  evaluator: ProductionProviderReadinessEvaluator,
  expected: ReadinessEvaluatorConfigurationInput,
  readinessInput: EvaluateProductionProviderReadinessInput,
) {
  const expectedProjection = configProjection(expected);
  const derived = deriveApprovedProductionProviderReadinessEvaluatorConfiguration(evaluator, {
    adapterDescriptor: readinessInput.adapterDescriptor,
    transportPolicy: readinessInput.transportPolicy,
  });
  const derivedProjection = configProjection(derived);
  if (!same(derivedProjection, expectedProjection)) {
    throw new DurableReadinessLedgerError("configuration-mismatch");
  }
  return derivedProjection;
}

function requireIdentifier(value: unknown): void {
  if (!ReadinessLedgerIdentifierSchema.safeParse(value).success) {
    throw new DurableReadinessLedgerError("invalid-input");
  }
}

function validateDeliveryIdentity(identity: DurableDeliveryTransactionIdentity): void {
  const captured = captureExactOwnEnumerableDataDescriptors(identity, DELIVERY_IDENTITY_KEYS);
  if (captured === null) throw new DurableReadinessLedgerError("invalid-input");
  for (const key of [
    "transactionId",
    "deliveryRequestId",
    "deliveryEnvelopeId",
    "deliveryReceiptId",
  ] as const) {
    requireIdentifier(captured[key].value);
  }
  for (const key of [
    "deliveryRequestFingerprint",
    "deliveryEnvelopeFingerprint",
    "deliveryReceiptFingerprint",
  ] as const) {
    if (!Sha256DigestSchema.safeParse(captured[key].value).success) {
      throw new DurableReadinessLedgerError("invalid-input");
    }
  }
}

function validateRegistrationPlainData(input: RegisterVerifiedReadinessEvaluationInput): void {
  validateDeliveryIdentity(input.deliveryIdentity);
  for (const value of [
    input.registrationRequestId,
    input.transactionId,
    input.idempotencyKey,
    input.requestedOwnershipId,
    input.requestedRegistrationSemanticEventId,
    input.requestedRegistrationAuditEntryId,
    input.requestedRegistrationMarkerId,
  ])
    requireIdentifier(value);
  if (
    input.contractVersion !== "1.0" ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.originalEvaluationTime).success ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.submittedAt).success ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.committedAt).success ||
    !Sha256DigestSchema.safeParse(input.expectedLedgerHeadFingerprint).success ||
    (input.expectedEvaluationPackage !== null &&
      !CanonicalReadinessEvaluationPackageSchema.safeParse(input.expectedEvaluationPackage).success)
  ) {
    throw new DurableReadinessLedgerError("invalid-registration-input");
  }
  if (input.expectedEvaluationPackage !== null) {
    verifyCanonicalReadinessEvaluationPackage(input.expectedEvaluationPackage);
  }
}

function validateReplayPlainData(input: SubmitReadinessReplayInput): void {
  validateDeliveryIdentity(input.deliveryIdentity);
  for (const value of [
    input.replayIdempotencyKey,
    input.replayRequestId,
    input.requestedReplayAttemptId,
    input.requestedReplaySemanticEventId,
    input.requestedReplayAuditEntryId,
    input.requestedReplayMarkerId,
    input.originalTransactionId,
  ]) {
    requireIdentifier(value);
  }
  if (
    input.replayContractVersion !== "1.0" ||
    !Sha256DigestSchema.safeParse(input.originalTransactionFingerprint).success ||
    !Sha256DigestSchema.safeParse(input.expectedLedgerHeadFingerprint).success ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.originalEvaluationTime).success ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.replayEvaluatedAt).success ||
    !ReadinessCanonicalUtcInstantSchema.safeParse(input.recordedAt).success
  ) {
    throw new DurableReadinessLedgerError("invalid-replay-input");
  }
}

function registrationFailureReason(error: unknown, integrityFailed: boolean): string {
  const candidate = error instanceof DurableReadinessLedgerError ? error.code : undefined;
  if (integrityFailed) {
    const parsed = ReadinessRegistrationIntegrityFailedReasonSchema.safeParse(candidate);
    return parsed.success ? parsed.data : "readiness-ledger-integrity-failure";
  }
  const parsed = ReadinessRegistrationRejectedReasonSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "invalid-registration-input";
}

function replayNotRecordedReason(error: unknown): string {
  const candidate = error instanceof DurableReadinessLedgerError ? error.code : undefined;
  const parsed = ReadinessReplayNotRecordedReasonSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "invalid-replay-input";
}

function integrityFinding(error: unknown): string {
  const candidate = error instanceof DurableReadinessLedgerError ? error.code : undefined;
  const parsed = ReadinessIntegrityFindingCodeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "readiness-ledger-integrity-failure";
}

function derivedIndexRebuildFailureReason(error: unknown): string {
  const candidate = error instanceof DurableReadinessLedgerError ? error.code : undefined;
  const parsed = ReadinessDerivedIndexRebuildFailureReasonSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "readiness-ledger-integrity-failure";
}

function replayCoordinateConflict(
  state: ReplayedReadinessLedgerState,
  input: SubmitReadinessReplayInput,
): string | null {
  if (
    state.replays.some(
      (event) => event.replayAttempt.replayIdempotencyKey === input.replayIdempotencyKey,
    )
  )
    return "replay-idempotency-key-conflict";
  if (state.replays.some((event) => event.replayAttempt.replayRequestId === input.replayRequestId))
    return "replay-request-id-conflict";
  if (
    state.replays.some(
      (event) => event.replayAttempt.replayAttemptId === input.requestedReplayAttemptId,
    )
  )
    return "replay-attempt-id-conflict";
  if (
    state.events.some(
      (event) => event.semanticEvent.semanticEventId === input.requestedReplaySemanticEventId,
    )
  )
    return "replay-semantic-event-id-conflict";
  if (
    state.events.some(
      (event) => event.auditEntry.auditEntryId === input.requestedReplayAuditEntryId,
    )
  )
    return "replay-audit-entry-id-conflict";
  if (state.events.some((event) => event.commitMarker.markerId === input.requestedReplayMarkerId))
    return "replay-marker-id-conflict";
  return null;
}

function exactReplayEvent(
  state: ReplayedReadinessLedgerState,
  request: ReturnType<typeof createReadinessReplayRequest>,
  input: SubmitReadinessReplayInput,
) {
  const event = state.replays.find(
    (candidate) => candidate.replayAttempt.replayIdempotencyKey === request.replayIdempotencyKey,
  );
  return event !== undefined &&
    same(event.replayRequest, request) &&
    event.replayAttempt.replayAttemptId === input.requestedReplayAttemptId &&
    event.semanticEvent.semanticEventId === input.requestedReplaySemanticEventId &&
    event.auditEntry.auditEntryId === input.requestedReplayAuditEntryId &&
    event.commitMarker.markerId === input.requestedReplayMarkerId
    ? event
    : null;
}

function packageFromEvaluation(input: {
  readonly evaluation: ProductionProviderReadinessEvaluation;
  readonly readinessInput: EvaluateProductionProviderReadinessInput;
  readonly readinessInputFingerprint: string;
  readonly authorityProjectionFingerprint: string;
  readonly configurationProjectionFingerprint: string;
  readonly originalEvaluationTime: string;
}): CanonicalReadinessEvaluationPackage {
  const retention = input.evaluation.evidence.observabilityRetention;
  const evidence = input.evaluation.evidence;
  const transportPlan = input.evaluation.evidence.transportPlan;
  const retainedEvidence = {
    projectionContractVersion: "1.0" as const,
    authorization: evidence.authorization,
    compatibility: evidence.compatibility,
    transportPlan:
      transportPlan === null
        ? null
        : {
            schemaVersion: transportPlan.schemaVersion,
            adapterId: transportPlan.adapterId,
            adapterFingerprint: transportPlan.adapterFingerprint,
            providerFamilyReference: transportPlan.providerFamilyReference,
            providerCapabilityId: input.readinessInput.providerCapability.providerCapabilityId,
            providerCapabilityFingerprint:
              input.readinessInput.providerCapability.descriptorFingerprint,
            credentialReferenceId: input.readinessInput.credentialReference.credentialReferenceId,
            credentialReferenceFingerprint:
              input.readinessInput.credentialReference.referenceFingerprint,
            transportPolicyId: transportPlan.transportPolicyId,
            transportPolicyFingerprint: transportPlan.transportPolicyFingerprint,
            transportPolicyVersion: input.readinessInput.transportPolicy.schemaVersion,
          },
    rateAndCapacity: evidence.rateAndCapacity,
    costAndBudget: evidence.costAndBudget,
    circuit: evidence.circuit,
    observability:
      evidence.observability === null
        ? null
        : {
            projectionContractVersion: "1.0" as const,
            structuredLog: evidence.observability.structuredLog,
            metrics: evidence.observability.metrics,
            traces: evidence.observability.traces,
            publicErrors: evidence.observability.publicErrors,
            readiness: evidence.observability.readiness,
          },
    observabilityRetention: retention,
    health: evidence.health,
    requestPlan: evidence.requestPlan,
  };
  return createCanonicalReadinessEvaluationPackage({
    evaluationPackageContractVersion: "1.0",
    readinessInputFingerprint: input.readinessInputFingerprint,
    decision: input.evaluation.decision,
    gateTrace: input.evaluation.gateTrace,
    retainedEvidence,
    observabilityRetentionFingerprint: retention?.retentionFingerprint ?? null,
    authorityProjectionFingerprint: input.authorityProjectionFingerprint,
    configurationProjectionFingerprint: input.configurationProjectionFingerprint,
    originalEvaluationTime: input.originalEvaluationTime,
  });
}

async function evaluateAndPackage(input: {
  readonly evaluator: ProductionProviderReadinessEvaluator;
  readonly readinessInput: EvaluateProductionProviderReadinessInput;
  readonly readinessInputFingerprint: string;
  readonly authorityProjectionFingerprint: string;
  readonly configurationProjectionFingerprint: string;
  readonly originalEvaluationTime: string;
}): Promise<CanonicalReadinessEvaluationPackage> {
  const evaluation = await input.evaluator.evaluate(input.readinessInput);
  const verification = await input.evaluator.verifyDecision({
    decision: evaluation.decision,
    authoritativeInput: input.readinessInput,
    observabilityRetentionEvidence: evaluation.evidence.observabilityRetention,
  });
  if (verification.status !== "valid") {
    throw new DurableReadinessLedgerError("evaluation-verification-failed");
  }
  return packageFromEvaluation({ ...input, evaluation });
}

function registrationConflict(
  state: ReplayedReadinessLedgerState,
  request: ReturnType<typeof createReadinessRegistrationRequest>,
  decisionId: string,
): string | null {
  for (const event of state.registrations) {
    const existing = event.transaction;
    const ownership = event.ownership;
    if (
      ownership.idempotencyKey === request.idempotencyKey &&
      existing.registrationRequest.registrationRequestFingerprint !==
        request.registrationRequestFingerprint
    )
      return "idempotency-key-conflict";
    if (ownership.ownershipId === request.requestedOwnershipId) return "ownership-id-conflict";
    if (existing.registrationRequest.registrationRequestId === request.registrationRequestId)
      return "registration-request-id-conflict";
    if (existing.transactionId === request.transactionId) return "transaction-id-conflict";
    if (ownership.readinessDecisionId === decisionId) return "decision-id-conflict";
  }
  if (
    state.events.some(
      (event) =>
        event.semanticEvent.semanticEventId === request.requestedRegistrationSemanticEventId,
    )
  )
    return "registration-semantic-event-id-conflict";
  if (
    state.events.some(
      (event) => event.auditEntry.auditEntryId === request.requestedRegistrationAuditEntryId,
    )
  )
    return "registration-audit-entry-id-conflict";
  if (
    state.events.some(
      (event) => event.commitMarker.markerId === request.requestedRegistrationMarkerId,
    )
  )
    return "registration-marker-id-conflict";
  return null;
}

function exactRegistration(
  state: ReplayedReadinessLedgerState,
  request: ReturnType<typeof createReadinessRegistrationRequest>,
  evaluationPackage: CanonicalReadinessEvaluationPackage,
): CommittedReadinessEvaluationTransaction | null {
  const event = state.registrations.find(
    (candidate) => candidate.ownership.idempotencyKey === request.idempotencyKey,
  );
  if (
    event !== undefined &&
    same(event.registrationRequest, request) &&
    same(event.transaction.evaluationPackage, evaluationPackage) &&
    event.ownership.ownershipId === request.requestedOwnershipId &&
    event.ownership.registrationSemanticEventId === request.requestedRegistrationSemanticEventId &&
    event.ownership.registrationAuditEntryId === request.requestedRegistrationAuditEntryId &&
    event.ownership.registrationMarkerId === request.requestedRegistrationMarkerId
  ) {
    return event.transaction;
  }
  return null;
}

async function replayRequestProjection(input: SubmitReadinessReplayInput) {
  try {
    return { projection: await authorityProjection(input), verified: true as const };
  } catch {
    // Preserve deterministic supplied mismatch evidence below without treating
    // failed authority verification as a pre-append rejection.
  }
  const identity = input.deliveryIdentity;
  const invocation = input.readinessInput.invocationRequest;
  const suppliedDeliveryTransactionFingerprint = createDurableCanonicalJsonSha256Fingerprint({
    unverifiedDeliveryTransactionId: identity.transactionId,
  });
  return {
    projection: createDurableReadinessAuthorityProjection({
      authorityProjectionContractVersion: "1.0",
      deliveryTransactionId: identity.transactionId,
      deliveryTransactionFingerprint: suppliedDeliveryTransactionFingerprint,
      deliveryRequestId: identity.deliveryRequestId,
      deliveryRequestFingerprint: identity.deliveryRequestFingerprint,
      deliveryEnvelopeId: identity.deliveryEnvelopeId,
      deliveryEnvelopeFingerprint: identity.deliveryEnvelopeFingerprint,
      deliveryReceiptId: identity.deliveryReceiptId,
      deliveryReceiptFingerprint: identity.deliveryReceiptFingerprint,
      contextPackageId: invocation.contextPackageId,
      contextPackageFingerprint: invocation.contextPackageFingerprint,
      consumerId: invocation.consumerId,
      consumerDescriptorFingerprint: invocation.consumerDescriptorFingerprint,
      invocationRequestId: invocation.invocationRequestId,
      invocationRequestFingerprint: invocation.requestFingerprint,
    }),
    verified: false as const,
  };
}

function currentAdmissibility(
  original: CommittedReadinessEvaluationTransaction,
  suppliedAuthorityFingerprint: string,
  suppliedAuthorityVerified: boolean,
  replayEvaluatedAt: string,
) {
  const evidence = original.evaluationPackage.retainedEvidence as {
    readonly authorization?: Pick<
      AuthorizationDecisionEvidence,
      "decisionFingerprint" | "outcome" | "expiresAt"
    > | null;
  };
  const authorization = evidence.authorization;
  const originalAuthorizationFingerprint =
    authorization?.decisionFingerprint ?? original.evaluationPackage.decision.decisionFingerprint;
  let status:
    | "admissible"
    | "authorization-expired"
    | "authorization-denied"
    | "authorization-review-required"
    | "authorization-not-evaluated"
    | "authorization-invalid-evidence"
    | "authority-mismatch";
  if (
    !suppliedAuthorityVerified ||
    suppliedAuthorityFingerprint !== original.authorityProjection.authorityProjectionFingerprint
  ) {
    status = "authority-mismatch";
  } else if (authorization === null || authorization === undefined) {
    status = "authorization-invalid-evidence";
  } else if (authorization.outcome === "allowed") {
    status =
      Date.parse(replayEvaluatedAt) >= Date.parse(authorization.expiresAt)
        ? "authorization-expired"
        : "admissible";
  } else {
    status = (
      {
        denied: "authorization-denied",
        "review-required": "authorization-review-required",
        "not-evaluated": "authorization-not-evaluated",
        expired: "authorization-expired",
        "invalid-evidence": "authorization-invalid-evidence",
      } as const
    )[authorization.outcome];
  }
  return createReadinessCurrentAdmissibility({
    admissibilityContractVersion: "1.0",
    originalAuthorizationFingerprint,
    replayEvaluatedAt,
    currentAdmissibilityStatus: status,
    reasonCodes: [status],
  });
}

function differingPaths(left: unknown, right: unknown): readonly string[] {
  const paths: string[] = [];
  const visit = (a: unknown, b: unknown, path: string) => {
    if (paths.length >= M15_MAX_DIFFERING_FIELD_PATHS || same(a, b)) return;
    if (
      a === null ||
      b === null ||
      typeof a !== "object" ||
      typeof b !== "object" ||
      Array.isArray(a) !== Array.isArray(b)
    ) {
      paths.push(path || "root");
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      visit(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path === "" ? key : `${path}.${key}`,
      );
    }
  };
  visit(left, right, "");
  return paths;
}

class GovernedReadinessLedger implements GovernedReadinessEvaluationLedger {
  public constructor(private readonly storage: ReadinessLedgerStoragePort) {}

  public async registerVerifiedReadinessEvaluation(
    raw: RegisterVerifiedReadinessEvaluationInput,
  ): Promise<ReadinessRegistrationResult> {
    let authoritativeInspectionFailed = false;
    try {
      const captured = capturedInput(raw, REGISTRATION_INPUT_KEYS);
      const initialInput = {
        ...captured,
        deliveryIdentity: canonicalDataCopy(captured.deliveryIdentity),
        evaluatorConfiguration: canonicalDataCopy(captured.evaluatorConfiguration),
        expectedEvaluationPackage:
          captured.expectedEvaluationPackage === null
            ? null
            : immutable(
                verifyCanonicalReadinessEvaluationPackage(captured.expectedEvaluationPackage),
              ),
      };
      const readiness = captureReadinessInput(initialInput.readinessInput);
      const input = { ...initialInput, readinessInput: readiness.input };
      validateRegistrationPlainData(input);
      if (
        initialInput.deliveryLedger !== input.readinessInput.deliveryLedger ||
        !same(initialInput.deliveryIdentity, input.readinessInput.deliveryIdentity)
      ) {
        throw new DurableReadinessLedgerError("invalid-registration-input");
      }
      const canonicalInput = readiness.canonical;
      if (
        input.contractVersion !== "1.0" ||
        input.originalEvaluationTime !== input.readinessInput.evaluatedAt
      ) {
        throw new DurableReadinessLedgerError("invalid-registration-input");
      }
      const configuration = approvedConfigProjection(
        input.evaluator,
        input.evaluatorConfiguration,
        input.readinessInput,
      );
      const inspection = await this.storage.inspect().catch((error: unknown) => {
        authoritativeInspectionFailed = true;
        throw error;
      });
      const authority = await authorityProjection(input);
      const readinessInputFingerprint = createDurableCanonicalJsonSha256Fingerprint(canonicalInput);
      const evaluationPackage = await evaluateAndPackage({
        evaluator: input.evaluator,
        readinessInput: input.readinessInput,
        readinessInputFingerprint,
        authorityProjectionFingerprint: authority.authorityProjectionFingerprint,
        configurationProjectionFingerprint: configuration.configurationProjectionFingerprint,
        originalEvaluationTime: input.originalEvaluationTime,
      });
      if (
        input.expectedEvaluationPackage !== null &&
        !same(input.expectedEvaluationPackage, evaluationPackage)
      ) {
        return ReadinessRegistrationResultSchema.parse({
          status: "rejected",
          transaction: null,
          reason: "evaluation-package-mismatch",
        });
      }
      const request = createReadinessRegistrationRequest({
        contractVersion: "1.0",
        registrationRequestId: input.registrationRequestId,
        transactionId: input.transactionId,
        idempotencyKey: input.idempotencyKey,
        requestedOwnershipId: input.requestedOwnershipId,
        requestedRegistrationSemanticEventId: input.requestedRegistrationSemanticEventId,
        requestedRegistrationAuditEntryId: input.requestedRegistrationAuditEntryId,
        requestedRegistrationMarkerId: input.requestedRegistrationMarkerId,
        authorityProjection: authority,
        evaluatorConfigurationProjection: configuration,
        readinessInputFingerprint,
        originalEvaluationTime: input.originalEvaluationTime,
        expectedEvaluationPackageFingerprint:
          input.expectedEvaluationPackage?.evaluationPackageFingerprint ?? null,
        expectedEvaluationPackage: input.expectedEvaluationPackage,
        submittedAt: input.submittedAt,
        expectedLedgerHeadFingerprint: input.expectedLedgerHeadFingerprint,
      });
      const preexisting = exactRegistration(inspection.state, request, evaluationPackage);
      let writerEntered = false;
      return await this.storage
        .withWriter(async (writer) => {
          writerEntered = true;
          const exact = exactRegistration(writer.inspection.state, request, evaluationPackage);
          if (exact !== null) {
            return ReadinessRegistrationResultSchema.parse({
              status: "idempotent-original-returned",
              transaction: exact,
              derivedStateStatus: writer.inspection.derivedIndexStatus,
            });
          }
          if (preexisting !== null)
            throw new DurableReadinessLedgerError("concurrent-writer-conflict");
          const conflict = registrationConflict(
            writer.inspection.state,
            request,
            evaluationPackage.decision.readinessDecisionId,
          );
          if (conflict !== null) {
            return ReadinessRegistrationResultSchema.parse({
              status: "rejected",
              transaction: null,
              reason: conflict,
            });
          }
          if (
            writer.inspection.state.head.ledgerHeadFingerprint !==
            input.expectedLedgerHeadFingerprint
          ) {
            return ReadinessRegistrationResultSchema.parse({
              status: "rejected",
              transaction: null,
              reason: "stale-expected-head",
            });
          }
          const sequence = writer.inspection.state.head.lastCommittedLedgerSequence + 1;
          const ownership = createReadinessOwnership({
            ownershipContractVersion: "1.0",
            ownershipId: input.requestedOwnershipId,
            idempotencyKey: input.idempotencyKey,
            registrationRequestId: input.registrationRequestId,
            registrationRequestFingerprint: request.registrationRequestFingerprint,
            transactionId: input.transactionId,
            readinessDecisionId: evaluationPackage.decision.readinessDecisionId,
            readinessDecisionFingerprint: evaluationPackage.decision.decisionFingerprint,
            registrationSemanticEventId: input.requestedRegistrationSemanticEventId,
            registrationAuditEntryId: input.requestedRegistrationAuditEntryId,
            registrationMarkerId: input.requestedRegistrationMarkerId,
            evaluationPackageFingerprint: evaluationPackage.evaluationPackageFingerprint,
            deliveryTransactionId: authority.deliveryTransactionId,
            deliveryTransactionFingerprint: authority.deliveryTransactionFingerprint,
            invocationRequestId: authority.invocationRequestId,
            invocationRequestFingerprint: authority.invocationRequestFingerprint,
            adapterId: configuration.adapterId,
            adapterFingerprint: configuration.adapterFingerprint,
            configurationProjectionFingerprint: configuration.configurationProjectionFingerprint,
            authorityProjectionFingerprint: authority.authorityProjectionFingerprint,
            ownershipLedgerSequence: sequence,
            ownershipCreatedAt: input.committedAt,
          });
          const transaction = createCommittedReadinessTransaction({
            transactionContractVersion: "1.0",
            transactionId: input.transactionId,
            registrationRequest: request,
            registrationRequestFingerprint: request.registrationRequestFingerprint,
            ownership,
            ownershipFingerprint: ownership.ownershipFingerprint,
            authorityProjection: authority,
            evaluatorConfigurationProjection: configuration,
            adapterId: input.readinessInput.adapterDescriptor.adapterId,
            adapterFingerprint: input.readinessInput.adapterDescriptor.adapterFingerprint,
            providerFamilyReference: input.readinessInput.adapterDescriptor.providerFamilyReference,
            providerCapabilityId: input.readinessInput.providerCapability.providerCapabilityId,
            providerCapabilityFingerprint:
              input.readinessInput.providerCapability.descriptorFingerprint,
            credentialReferenceId: input.readinessInput.credentialReference.credentialReferenceId,
            credentialReferenceFingerprint:
              input.readinessInput.credentialReference.referenceFingerprint,
            transportPolicyId: input.readinessInput.transportPolicy.transportPolicyId,
            transportPolicyFingerprint: input.readinessInput.transportPolicy.policyFingerprint,
            evaluationPackage,
            originalEvaluationTime: input.originalEvaluationTime,
            submittedAt: input.submittedAt,
            committedAt: input.committedAt,
          });
          const event = createRegistrationLedgerEvent({
            request,
            ownership,
            transaction,
            previousHead: writer.inspection.state.head,
            recordedAt: input.committedAt,
          });
          const derivedStateStatus = await writer.commitEvent(event);
          return ReadinessRegistrationResultSchema.parse({
            status: "committed",
            transaction,
            derivedStateStatus,
          });
        })
        .catch((error: unknown) => {
          if (
            !writerEntered &&
            !(
              error instanceof DurableReadinessLedgerError &&
              ["append-failure", "lock-unavailable", "operator-cleanup-required"].includes(
                error.code,
              )
            )
          ) {
            authoritativeInspectionFailed = true;
          }
          throw error;
        });
    } catch (error) {
      const reason = registrationFailureReason(error, authoritativeInspectionFailed);
      return ReadinessRegistrationResultSchema.parse({
        status: authoritativeInspectionFailed ? "integrity-failed" : "rejected",
        transaction: null,
        reason,
      });
    }
  }

  public async submitReadinessReplayAttempt(
    raw: SubmitReadinessReplayInput,
  ): Promise<ReadinessReplaySubmissionResult> {
    try {
      const captured = capturedInput(raw, REPLAY_INPUT_KEYS);
      const initialInput = {
        ...captured,
        deliveryIdentity: canonicalDataCopy(captured.deliveryIdentity),
        evaluatorConfiguration: canonicalDataCopy(captured.evaluatorConfiguration),
      };
      const readiness = captureReadinessInput(initialInput.readinessInput);
      const input = { ...initialInput, readinessInput: readiness.input };
      if (
        initialInput.deliveryLedger !== input.readinessInput.deliveryLedger ||
        !same(initialInput.deliveryIdentity, input.readinessInput.deliveryIdentity)
      ) {
        throw new DurableReadinessLedgerError("invalid-replay-input");
      }
      validateReplayPlainData(input);
      const canonicalInput = readiness.canonical;
      const readinessInputFingerprint = createDurableCanonicalJsonSha256Fingerprint(canonicalInput);
      const declaredConfiguration = configProjection(input.evaluatorConfiguration);
      const inspection = await this.storage.inspect().catch((error: unknown) => {
        const candidate = error instanceof DurableReadinessLedgerError ? error.code : undefined;
        if (ReadinessReplayNotRecordedReasonSchema.safeParse(candidate).success) throw error;
        throw new DurableReadinessLedgerError("readiness-ledger-integrity-failure");
      });
      const existingByKey = inspection.state.replays.find(
        (event) => event.replayAttempt.replayIdempotencyKey === input.replayIdempotencyKey,
      );
      if (existingByKey !== undefined) {
        const preflightRequest = createReadinessReplayRequest({
          replayContractVersion: "1.0",
          replayIdempotencyKey: input.replayIdempotencyKey,
          replayRequestId: input.replayRequestId,
          requestedReplayAttemptId: input.requestedReplayAttemptId,
          requestedReplaySemanticEventId: input.requestedReplaySemanticEventId,
          requestedReplayAuditEntryId: input.requestedReplayAuditEntryId,
          requestedReplayMarkerId: input.requestedReplayMarkerId,
          originalTransactionId: input.originalTransactionId,
          originalTransactionFingerprint: input.originalTransactionFingerprint,
          suppliedAuthorityProjection: existingByKey.replayRequest.suppliedAuthorityProjection,
          suppliedEvaluatorConfigurationProjection: declaredConfiguration,
          readinessInputFingerprint,
          originalEvaluationTime: input.originalEvaluationTime,
          replayEvaluatedAt: input.replayEvaluatedAt,
          expectedLedgerHeadFingerprint: input.expectedLedgerHeadFingerprint,
        });
        const exact = exactReplayEvent(inspection.state, preflightRequest, input);
        if (exact !== null) {
          return ReadinessReplaySubmissionResultSchema.parse({
            status: "idempotent-replay-returned",
            replayAppendStatus: "not-appended",
            replayAttempt: exact.replayAttempt,
            derivedStateStatus: inspection.derivedIndexStatus,
          });
        }
        return ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason: "replay-idempotency-key-conflict",
        });
      }
      const earlyConflict = replayCoordinateConflict(inspection.state, input);
      if (earlyConflict !== null) {
        return ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason: earlyConflict,
        });
      }
      const original = inspection.state.transactions.get(input.originalTransactionId);
      if (
        original === undefined ||
        original.transactionFingerprint !== input.originalTransactionFingerprint
      ) {
        return ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason: "original-transaction-not-found",
        });
      }
      if (
        readinessInputFingerprint !== original.evaluationPackage.readinessInputFingerprint ||
        input.originalEvaluationTime !== original.originalEvaluationTime ||
        input.originalEvaluationTime !== original.evaluationPackage.originalEvaluationTime
      ) {
        return ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason: "replay-input-mismatch",
        });
      }
      const suppliedAuthority = await replayRequestProjection(input);
      const suppliedProjection = suppliedAuthority.projection;
      const request = createReadinessReplayRequest({
        replayContractVersion: "1.0",
        replayIdempotencyKey: input.replayIdempotencyKey,
        replayRequestId: input.replayRequestId,
        requestedReplayAttemptId: input.requestedReplayAttemptId,
        requestedReplaySemanticEventId: input.requestedReplaySemanticEventId,
        requestedReplayAuditEntryId: input.requestedReplayAuditEntryId,
        requestedReplayMarkerId: input.requestedReplayMarkerId,
        originalTransactionId: input.originalTransactionId,
        originalTransactionFingerprint: input.originalTransactionFingerprint,
        suppliedAuthorityProjection: suppliedProjection,
        suppliedEvaluatorConfigurationProjection: declaredConfiguration,
        readinessInputFingerprint,
        originalEvaluationTime: input.originalEvaluationTime,
        replayEvaluatedAt: input.replayEvaluatedAt,
        expectedLedgerHeadFingerprint: input.expectedLedgerHeadFingerprint,
      });
      const configuration = declaredConfiguration;
      let reconstructed: CanonicalReadinessEvaluationPackage | null = null;
      let reconstructionStatus: "matched" | "mismatched" | "verification-failed" =
        "verification-failed";
      let paths: readonly string[] = [];
      const suppliedAuthorityVerified = suppliedAuthority.verified;
      try {
        const approvedConfiguration = approvedConfigProjection(
          input.evaluator,
          input.evaluatorConfiguration,
          input.readinessInput,
        );
        if (
          !same(approvedConfiguration, configuration) ||
          configuration.configurationProjectionFingerprint !==
            original.evaluatorConfigurationProjection.configurationProjectionFingerprint
        ) {
          throw new DurableReadinessLedgerError("configuration-mismatch");
        }
        if (!suppliedAuthorityVerified || !same(suppliedProjection, original.authorityProjection)) {
          throw new DurableReadinessLedgerError("authority-mismatch");
        }
        reconstructed = await evaluateAndPackage({
          evaluator: input.evaluator,
          readinessInput: input.readinessInput,
          readinessInputFingerprint,
          authorityProjectionFingerprint: suppliedProjection.authorityProjectionFingerprint,
          configurationProjectionFingerprint: configuration.configurationProjectionFingerprint,
          originalEvaluationTime: input.originalEvaluationTime,
        });
        reconstructionStatus = same(reconstructed, original.evaluationPackage)
          ? "matched"
          : "mismatched";
        if (reconstructionStatus === "mismatched")
          paths = differingPaths(original.evaluationPackage, reconstructed);
      } catch {
        reconstructionStatus = "verification-failed";
      }
      const comparison = createReadinessHistoricalComparison({
        comparisonContractVersion: "1.0",
        originalEvaluationPackageFingerprint:
          original.evaluationPackage.evaluationPackageFingerprint,
        reconstructedEvaluationPackageFingerprint:
          reconstructed?.evaluationPackageFingerprint ?? null,
        historicalReconstructionStatus: reconstructionStatus,
        differingFieldPaths: paths,
        reasonCodes: [reconstructionStatus],
      });
      const admissibility = currentAdmissibility(
        original,
        suppliedProjection.authorityProjectionFingerprint,
        suppliedAuthorityVerified,
        input.replayEvaluatedAt,
      );
      const replayAttempt = createReadinessReplayAttempt({
        replayAttemptContractVersion: "1.0",
        replayAttemptId: input.requestedReplayAttemptId,
        replayIdempotencyKey: input.replayIdempotencyKey,
        replayRequestId: input.replayRequestId,
        replayRequestFingerprint: request.replayRequestFingerprint,
        originalTransactionId: original.transactionId,
        originalTransactionFingerprint: original.transactionFingerprint,
        originalReadinessDecisionId: original.evaluationPackage.decision.readinessDecisionId,
        originalReadinessDecisionFingerprint:
          original.evaluationPackage.decision.decisionFingerprint,
        storedConfigurationProjectionFingerprint:
          original.evaluatorConfigurationProjection.configurationProjectionFingerprint,
        suppliedConfigurationProjectionFingerprint:
          configuration.configurationProjectionFingerprint,
        storedAuthorityProjectionFingerprint:
          original.authorityProjection.authorityProjectionFingerprint,
        suppliedAuthorityProjectionFingerprint: suppliedProjection.authorityProjectionFingerprint,
        readinessInputFingerprint,
        originalEvaluationTime: input.originalEvaluationTime,
        replayEvaluatedAt: input.replayEvaluatedAt,
        reconstructedEvaluationPackageFingerprint:
          reconstructed?.evaluationPackageFingerprint ?? null,
        historicalComparison: comparison,
        currentAdmissibility: admissibility,
        evidenceReasonCodes: [
          reconstructionStatus,
          admissibility.currentAdmissibilityStatus,
        ].sort(),
      });
      return await this.storage.withWriter(async (writer) => {
        const exact = exactReplayEvent(writer.inspection.state, request, input);
        if (exact !== null) {
          return ReadinessReplaySubmissionResultSchema.parse({
            status: "idempotent-replay-returned",
            replayAppendStatus: "not-appended",
            replayAttempt: exact.replayAttempt,
            derivedStateStatus: writer.inspection.derivedIndexStatus,
          });
        }
        const conflict = replayCoordinateConflict(writer.inspection.state, input);
        if (conflict !== null)
          return ReadinessReplaySubmissionResultSchema.parse({
            status: "not-recorded",
            replayAppendStatus: "not-appended",
            replayAttempt: null,
            reason: conflict,
          });
        if (
          writer.inspection.state.head.ledgerHeadFingerprint !== input.expectedLedgerHeadFingerprint
        ) {
          return ReadinessReplaySubmissionResultSchema.parse({
            status: "not-recorded",
            replayAppendStatus: "not-appended",
            replayAttempt: null,
            reason: "stale-expected-head",
          });
        }
        const event = createReplayLedgerEvent({
          request,
          historicalComparison: comparison,
          currentAdmissibility: admissibility,
          replayAttempt,
          originalTransaction: original,
          previousHead: writer.inspection.state.head,
          recordedAt: input.recordedAt,
        });
        const derivedStateStatus = await writer.commitEvent(event);
        return ReadinessReplaySubmissionResultSchema.parse({
          status: "recorded",
          replayAppendStatus: "appended",
          replayAttempt,
          derivedStateStatus,
        });
      });
    } catch (error) {
      const reason = replayNotRecordedReason(error);
      return ReadinessReplaySubmissionResultSchema.parse({
        status: "not-recorded",
        replayAppendStatus: "not-appended",
        replayAttempt: null,
        reason,
      });
    }
  }

  public async readOriginalReadinessEvaluation(transactionId: string) {
    const verifiedTransactionId = ReadinessLedgerIdentifierSchema.parse(transactionId);
    return immutable(
      (await this.storage.inspect()).state.transactions.get(verifiedTransactionId) ?? null,
    );
  }

  public async listCommittedReadinessEvaluations(query?: ReadinessListQuery) {
    const normalized = normalizedListQuery(query);
    const state = (await this.storage.inspect()).state;
    const candidates = state.registrations.filter(
      (event) => event.sequence > (normalized.afterSequence ?? 0),
    );
    const selected = candidates.slice(0, normalized.limit);
    return immutable(
      ReadinessCommittedEvaluationPageSchema.parse({
        resultContractVersion: "1.0",
        items: selected.map((event) => ({
          ledgerSequence: event.sequence,
          transaction: event.transaction,
        })),
        page: {
          requestedLimit: normalized.limit,
          returnedCount: selected.length,
          afterSequence: normalized.afterSequence,
          nextAfterSequence:
            candidates.length > selected.length && selected.length > 0
              ? selected[selected.length - 1]!.sequence
              : null,
          hasMore: candidates.length > selected.length,
          sourceLedgerHeadFingerprint: state.head.ledgerHeadFingerprint,
          sourceLastSequence: state.head.lastCommittedLedgerSequence,
        },
      }),
    );
  }

  public async listReadinessReplayAttempts(transactionId: string, query?: ReadinessListQuery) {
    const verifiedTransactionId = ReadinessLedgerIdentifierSchema.parse(transactionId);
    const normalized = normalizedListQuery(query);
    const state = (await this.storage.inspect()).state;
    const candidates = state.replays.filter(
      (event) =>
        event.sequence > (normalized.afterSequence ?? 0) &&
        event.replayAttempt.originalTransactionId === verifiedTransactionId,
    );
    const selected = candidates.slice(0, normalized.limit);
    return immutable(
      ReadinessReplayAttemptPageSchema.parse({
        resultContractVersion: "1.0",
        items: selected.map((event) => ({
          ledgerSequence: event.sequence,
          replayAttempt: event.replayAttempt,
        })),
        page: {
          requestedLimit: normalized.limit,
          returnedCount: selected.length,
          afterSequence: normalized.afterSequence,
          nextAfterSequence:
            candidates.length > selected.length && selected.length > 0
              ? selected[selected.length - 1]!.sequence
              : null,
          hasMore: candidates.length > selected.length,
          sourceLedgerHeadFingerprint: state.head.ledgerHeadFingerprint,
          sourceLastSequence: state.head.lastCommittedLedgerSequence,
        },
      }),
    );
  }

  public async readHead() {
    return immutable((await this.storage.inspect()).state.head);
  }

  public async recover(): Promise<ReadinessRecoveryResult> {
    try {
      const inspection = await this.storage.inspect();
      const state = inspection.state;
      return ReadinessRecoveryResultSchema.parse({
        resultContractVersion: "1.0",
        status: state.events.length === 0 ? "empty" : "recovered",
        committedRegistrationCount: state.registrations.length,
        committedReplayAttemptCount: state.replays.length,
        permanentIdempotencyOwnershipCount: state.registrations.length + state.replays.length,
        lastCommittedSequence: state.head.lastCommittedLedgerSequence,
        latestAuditEntryId: state.head.latestAuditEntryId,
        latestAuditEntryFingerprint: state.head.latestAuditEntryFingerprint,
        latestSemanticEventId: state.head.latestSemanticEventId,
        latestSemanticEventFingerprint: state.head.latestSemanticEventFingerprint,
        latestSubjectTransactionId: state.head.latestSubjectTransactionId,
        latestSubjectTransactionFingerprint: state.head.latestSubjectTransactionFingerprint,
        completeHistoryFingerprint: state.head.completeHistoryFingerprint,
        authoritativeMarkerFingerprint: state.marker.commitMarkerFingerprint,
        derivedIndexStatus: inspection.derivedIndexStatus,
        stagingOrphanCount: inspection.stagingOrphanCount,
        installedUncommittedOrphanCount: inspection.installedUncommittedOrphanCount,
        errors: [],
      });
    } catch (error) {
      return ReadinessRecoveryResultSchema.parse({
        resultContractVersion: "1.0",
        status: "failed",
        committedRegistrationCount: 0,
        committedReplayAttemptCount: 0,
        permanentIdempotencyOwnershipCount: 0,
        lastCommittedSequence: 0,
        latestAuditEntryId: null,
        latestAuditEntryFingerprint: null,
        latestSemanticEventId: null,
        latestSemanticEventFingerprint: null,
        latestSubjectTransactionId: null,
        latestSubjectTransactionFingerprint: null,
        completeHistoryFingerprint: null,
        authoritativeMarkerFingerprint: null,
        derivedIndexStatus: "missing",
        stagingOrphanCount: 0,
        installedUncommittedOrphanCount: 0,
        errors: [integrityFinding(error)],
      });
    }
  }

  public async verifyIntegrity(): Promise<ReadinessIntegrityResult> {
    try {
      const inspection = await this.storage.inspect();
      const state = inspection.state;
      return ReadinessIntegrityResultSchema.parse({
        resultContractVersion: "1.0",
        status: "valid",
        verifiedMarkerFingerprint: state.marker.commitMarkerFingerprint,
        verifiedRegistrationCount: state.registrations.length,
        verifiedReplayAttemptCount: state.replays.length,
        verifiedTotalEventCount: state.events.length,
        verifiedLastSequence: state.head.lastCommittedLedgerSequence,
        verifiedLatestAuditEntryFingerprint: state.head.latestAuditEntryFingerprint,
        verifiedCompleteHistoryFingerprint: state.head.completeHistoryFingerprint,
        derivedIndexStatus: inspection.derivedIndexStatus,
        findings: [],
      });
    } catch (error) {
      return ReadinessIntegrityResultSchema.parse({
        resultContractVersion: "1.0",
        status: "invalid",
        verifiedMarkerFingerprint: null,
        verifiedRegistrationCount: 0,
        verifiedReplayAttemptCount: 0,
        verifiedTotalEventCount: 0,
        verifiedLastSequence: 0,
        verifiedLatestAuditEntryFingerprint: null,
        verifiedCompleteHistoryFingerprint: null,
        derivedIndexStatus: "missing",
        findings: [integrityFinding(error)],
      });
    }
  }

  public async rebuildDerivedIndexes(): Promise<ReadinessDerivedIndexRebuildResult> {
    try {
      return await this.storage.withWriter(async (writer) => {
        const indexes = createReadinessDerivedIndexes(writer.inspection.state);
        await writer.replaceDerivedState(writer.inspection.state.marker, indexes);
        return ReadinessDerivedIndexRebuildResultSchema.parse({
          resultContractVersion: "1.0",
          status: "rebuilt",
          sourceLedgerHeadFingerprint: writer.inspection.state.head.ledgerHeadFingerprint,
          rebuiltIndexCount: indexes.length,
          reason: null,
        });
      });
    } catch (error) {
      return ReadinessDerivedIndexRebuildResultSchema.parse({
        resultContractVersion: "1.0",
        status: "not-rebuilt",
        sourceLedgerHeadFingerprint: null,
        rebuiltIndexCount: 0,
        reason: derivedIndexRebuildFailureReason(error),
      });
    }
  }
}

export function createGovernedReadinessEvaluationLedger(
  storage: ReadinessLedgerStoragePort,
): GovernedReadinessEvaluationLedger {
  return Object.freeze(new GovernedReadinessLedger(storage));
}
