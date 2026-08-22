import { createHash } from "node:crypto";

import {
  CanonicalReadinessEvaluationPackageSchema,
  DurableReadinessEvidenceProjectionSchema,
  CanonicalReadinessEvaluationPackageUnsignedV1Schema,
  CommittedReadinessEvaluationTransactionSchema,
  CommittedReadinessEvaluationTransactionUnsignedV1Schema,
  DurableReadinessAuthorityProjectionSchema,
  DurableReadinessAuthorityProjectionUnsignedV1Schema,
  ReadinessAuditEntrySchema,
  ReadinessAuditEntryUnsignedV1Schema,
  ReadinessCommitMarkerSchema,
  ReadinessCompleteHistoryCommitmentSchema,
  ReadinessCompleteHistoryCommitmentUnsignedV1Schema,
  ReadinessCurrentAdmissibilitySchema,
  ReadinessCurrentAdmissibilityUnsignedV1Schema,
  ReadinessDerivedIndexEntrySchema,
  ReadinessDerivedIndexEntryUnsignedV1Schema,
  ReadinessDerivedIndexSchema,
  ReadinessDerivedIndexUnsignedV1Schema,
  ReadinessEvaluatorConfigurationProjectionSchema,
  ReadinessEvaluatorConfigurationProjectionUnsignedV1Schema,
  ReadinessGenesisCommitMarkerSchema,
  ReadinessGenesisCommitMarkerUnsignedV1Schema,
  ReadinessGenesisCompleteHistorySchema,
  ReadinessGenesisCompleteHistoryUnsignedV1Schema,
  ReadinessHistoricalComparisonSchema,
  ReadinessHistoricalComparisonUnsignedV1Schema,
  ReadinessIdempotencyOwnershipSchema,
  ReadinessIdempotencyOwnershipUnsignedV1Schema,
  ReadinessLedgerEventSchema,
  ReadinessLedgerHeadSchema,
  ReadinessLedgerHeadUnsignedV1Schema,
  ReadinessRegistrationCommitMarkerSchema,
  ReadinessRegistrationCommitMarkerUnsignedV1Schema,
  ReadinessRegistrationRequestSchema,
  ReadinessRegistrationRequestUnsignedV1Schema,
  ReadinessReplayAttemptSchema,
  ReadinessReplayAttemptUnsignedV1Schema,
  ReadinessReplayCommitMarkerSchema,
  ReadinessReplayCommitMarkerUnsignedV1Schema,
  ReadinessReplayRequestSchema,
  ReadinessReplayRequestUnsignedV1Schema,
  ReadinessReplaySemanticEventSchema,
  ReadinessReplaySemanticEventUnsignedV1Schema,
  ReadinessSemanticEventSchema,
  ReadinessSemanticEventUnsignedV1Schema,
  type CanonicalReadinessEvaluationPackage,
  type CommittedReadinessEvaluationTransaction,
  type DurableReadinessAuthorityProjection,
  type ReadinessCommitMarker,
  type ReadinessCurrentAdmissibility,
  type ReadinessDerivedIndex,
  type ReadinessEvaluatorConfigurationProjection,
  type ReadinessGenesisCommitMarker,
  type ReadinessGenesisCompleteHistory,
  type ReadinessHistoricalComparison,
  type ReadinessIdempotencyOwnership,
  type ReadinessLedgerEvent,
  type ReadinessLedgerHead,
  type ReadinessRegistrationLedgerEvent,
  type ReadinessRegistrationRequest,
  type ReadinessReplayAttempt,
  type ReadinessReplayLedgerEvent,
  type ReadinessReplayRequest,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "./canonical-fingerprint.js";
import { fingerprintProviderReadinessArtifact } from "./provider-readiness.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

export const M15_COMMITMENT_DOMAINS = Object.freeze({
  genesisHistory: "founderos.m15.genesis-history.v1",
  genesisHead: "founderos.m15.genesis-head.v1",
  genesisMarker: "founderos.m15.genesis-marker.v1",
  registrationRequest: "founderos.m15.registration-request.v1",
  evaluatorConfiguration: "founderos.m15.evaluator-configuration.v1",
  authorityProjection: "founderos.m15.authority-projection.v1",
  evaluationPackage: "founderos.m15.evaluation-package.v1",
  ownership: "founderos.m15.idempotency-ownership.v1",
  transaction: "founderos.m15.transaction.v1",
  registrationSemanticEvent: "founderos.m15.registration-semantic-event.v1",
  replayRequest: "founderos.m15.replay-request.v1",
  historicalComparison: "founderos.m15.historical-comparison.v1",
  currentAdmissibility: "founderos.m15.current-admissibility.v1",
  replayAttempt: "founderos.m15.replay-attempt.v1",
  replaySemanticEvent: "founderos.m15.replay-semantic-event.v1",
  auditEntry: "founderos.m15.audit-entry.v1",
  completeHistory: "founderos.m15.complete-history.v1",
  ledgerHead: "founderos.m15.ledger-head.v1",
  commitMarker: "founderos.m15.commit-marker.v1",
  derivedIndexEntry: "founderos.m15.derived-index-entry.v1",
  derivedIndex: "founderos.m15.derived-index.v1",
} as const);

export type M15CommitmentDomain =
  (typeof M15_COMMITMENT_DOMAINS)[keyof typeof M15_COMMITMENT_DOMAINS];

export class DurableReadinessLedgerError extends Error {
  public constructor(
    public readonly code: string,
    message = "Durable readiness evidence did not verify",
  ) {
    super(message);
    this.name = "DurableReadinessLedgerError";
  }
}

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function fingerprintReadinessCommitment(
  domain: M15CommitmentDomain,
  unsigned: unknown,
): string {
  return createHash("sha256")
    .update(domain, "utf8")
    .update(Buffer.from([0]))
    .update(serializeDurableCanonicalJsonValue(unsigned), "utf8")
    .digest("hex");
}

function signed<T extends object, K extends string>(
  unsigned: T,
  fingerprintField: K,
  domain: M15CommitmentDomain,
): T & Readonly<Record<K, string>> {
  return immutable({
    ...unsigned,
    [fingerprintField]: fingerprintReadinessCommitment(domain, unsigned),
  }) as T & Readonly<Record<K, string>>;
}

function unsigned<T extends object, K extends keyof T>(value: T, fingerprintField: K): Omit<T, K> {
  const { [fingerprintField]: _fingerprint, ...rest } = value;
  void _fingerprint;
  return rest;
}

function assertFingerprint<T extends object, K extends keyof T>(
  value: T,
  field: K,
  domain: M15CommitmentDomain,
): void {
  if (value[field] !== fingerprintReadinessCommitment(domain, unsigned(value, field))) {
    throw new DurableReadinessLedgerError("fingerprint-invalid");
  }
}

function assertUpstreamCanonicalFingerprint(value: object, field: string): void {
  const record = value as Record<string, unknown>;
  const stored = record[field];
  const unsignedValue = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));
  const expected = createHash("sha256")
    .update(serializeDurableCanonicalJsonValue(unsignedValue), "utf8")
    .digest("hex");
  if (stored !== expected) {
    throw new DurableReadinessLedgerError("evaluation-package-binding-invalid");
  }
}

export function createDurableReadinessAuthorityProjection(
  input: Parameters<typeof DurableReadinessAuthorityProjectionUnsignedV1Schema.parse>[0],
): DurableReadinessAuthorityProjection {
  const value = DurableReadinessAuthorityProjectionUnsignedV1Schema.parse(input);
  return DurableReadinessAuthorityProjectionSchema.parse(
    signed(value, "authorityProjectionFingerprint", M15_COMMITMENT_DOMAINS.authorityProjection),
  );
}

export function verifyDurableReadinessAuthorityProjection(
  input: unknown,
): DurableReadinessAuthorityProjection {
  const value = DurableReadinessAuthorityProjectionSchema.parse(input);
  assertFingerprint(
    value,
    "authorityProjectionFingerprint",
    M15_COMMITMENT_DOMAINS.authorityProjection,
  );
  return immutable(value);
}

export function createReadinessEvaluatorConfigurationProjection(
  input: Parameters<typeof ReadinessEvaluatorConfigurationProjectionUnsignedV1Schema.parse>[0],
): ReadinessEvaluatorConfigurationProjection {
  const value = ReadinessEvaluatorConfigurationProjectionUnsignedV1Schema.parse(input);
  return ReadinessEvaluatorConfigurationProjectionSchema.parse(
    signed(
      value,
      "configurationProjectionFingerprint",
      M15_COMMITMENT_DOMAINS.evaluatorConfiguration,
    ),
  );
}

export function verifyReadinessEvaluatorConfigurationProjection(
  input: unknown,
): ReadinessEvaluatorConfigurationProjection {
  const value = ReadinessEvaluatorConfigurationProjectionSchema.parse(input);
  assertFingerprint(
    value,
    "configurationProjectionFingerprint",
    M15_COMMITMENT_DOMAINS.evaluatorConfiguration,
  );
  return immutable(value);
}

export function createCanonicalReadinessEvaluationPackage(
  input: Parameters<typeof CanonicalReadinessEvaluationPackageUnsignedV1Schema.parse>[0],
): CanonicalReadinessEvaluationPackage {
  const value = CanonicalReadinessEvaluationPackageUnsignedV1Schema.parse(input);
  return CanonicalReadinessEvaluationPackageSchema.parse(
    signed(value, "evaluationPackageFingerprint", M15_COMMITMENT_DOMAINS.evaluationPackage),
  );
}

export function verifyCanonicalReadinessEvaluationPackage(
  input: unknown,
): CanonicalReadinessEvaluationPackage {
  const value = CanonicalReadinessEvaluationPackageSchema.parse(input);
  const evidence = DurableReadinessEvidenceProjectionSchema.parse(value.retainedEvidence);
  assertUpstreamCanonicalFingerprint(value.decision, "decisionFingerprint");
  if (evidence.authorization !== null)
    assertUpstreamCanonicalFingerprint(evidence.authorization, "decisionFingerprint");
  if (evidence.compatibility !== null)
    assertUpstreamCanonicalFingerprint(evidence.compatibility, "compatibilityFingerprint");
  if (evidence.rateAndCapacity !== null)
    assertUpstreamCanonicalFingerprint(evidence.rateAndCapacity, "decisionFingerprint");
  if (evidence.costAndBudget !== null)
    assertUpstreamCanonicalFingerprint(evidence.costAndBudget, "decisionFingerprint");
  if (evidence.circuit !== null)
    assertUpstreamCanonicalFingerprint(evidence.circuit, "stateFingerprint");
  if (evidence.observability !== null) {
    assertUpstreamCanonicalFingerprint(evidence.observability.structuredLog, "logFingerprint");
    for (const metric of evidence.observability.metrics)
      assertUpstreamCanonicalFingerprint(metric, "metricFingerprint");
    for (const trace of evidence.observability.traces)
      assertUpstreamCanonicalFingerprint(trace, "traceFingerprint");
    for (const publicError of evidence.observability.publicErrors)
      assertUpstreamCanonicalFingerprint(publicError, "errorFingerprint");
    assertUpstreamCanonicalFingerprint(evidence.observability.readiness, "readinessFingerprint");
  }
  if (evidence.observabilityRetention !== null)
    assertUpstreamCanonicalFingerprint(evidence.observabilityRetention, "retentionFingerprint");
  if (evidence.health !== null)
    assertUpstreamCanonicalFingerprint(evidence.health, "healthFingerprint");
  if (evidence.requestPlan !== null)
    assertUpstreamCanonicalFingerprint(evidence.requestPlan, "requestPlanFingerprint");
  const orderedGates = [
    "durable-delivery-and-invocation",
    "authorization",
    "adapter-descriptor",
    "credential-reference",
    "capability",
    "transport-policy-plan",
    "rate-and-capacity",
    "cost-and-budget",
    "circuit",
    "observability-redaction",
    "health",
    "request-plan",
    "readiness-decision",
    "stop-before-transport",
  ] as const;
  const decision = value.decision;
  const observability = evidence.observability;
  const retentionSnapshot =
    observability === null
      ? null
      : {
          logs: [observability.structuredLog],
          metrics: observability.metrics,
          traces: observability.traces,
          publicErrors: observability.publicErrors,
        };
  const retentionBindingInvalid =
    (evidence.observabilityRetention === null) !== (retentionSnapshot === null) ||
    (evidence.observabilityRetention !== null &&
      retentionSnapshot !== null &&
      (evidence.observabilityRetention.retainedLogCount !== retentionSnapshot.logs.length ||
        evidence.observabilityRetention.retainedMetricCount !== retentionSnapshot.metrics.length ||
        evidence.observabilityRetention.retainedTraceCount !== retentionSnapshot.traces.length ||
        evidence.observabilityRetention.retainedPublicErrorCount !==
          retentionSnapshot.publicErrors.length ||
        !sameLedgerValue(
          evidence.observabilityRetention.retainedLogFingerprints,
          retentionSnapshot.logs.map((entry) => entry.logFingerprint),
        ) ||
        !sameLedgerValue(
          evidence.observabilityRetention.retainedMetricFingerprints,
          retentionSnapshot.metrics.map((entry) => entry.metricFingerprint),
        ) ||
        !sameLedgerValue(
          evidence.observabilityRetention.retainedTraceFingerprints,
          retentionSnapshot.traces.map((entry) => entry.traceFingerprint),
        ) ||
        !sameLedgerValue(
          evidence.observabilityRetention.retainedPublicErrorFingerprints,
          retentionSnapshot.publicErrors.map((entry) => entry.errorFingerprint),
        ) ||
        evidence.observabilityRetention.canonicalSnapshotFingerprint !==
          fingerprintProviderReadinessArtifact(retentionSnapshot)));
  const stoppedTraceIndex = value.gateTrace.findIndex((entry) => entry.status === "stopped");
  const stoppedGateByBlocker = {
    adapter_disabled: "adapter-descriptor",
    adapter_invalid: "adapter-descriptor",
    authorization_not_allowed: "authorization",
    capability_incompatible: "capability",
    circuit_not_ready: "circuit",
    cost_budget_rejected: "cost-and-budget",
    credential_unavailable: "credential-reference",
    health_not_ready: "health",
    not_assessed: "readiness-decision",
    observability_not_ready: "observability-redaction",
    rate_capacity_rejected: "rate-and-capacity",
    request_mapping_invalid: "request-plan",
    transport_policy_rejected: "transport-policy-plan",
  } as const;
  const stoppedEntry = stoppedTraceIndex < 0 ? null : value.gateTrace[stoppedTraceIndex]!;
  const traceBindingInvalid =
    (stoppedTraceIndex >= 0 && stoppedTraceIndex !== value.gateTrace.length - 1) ||
    value.gateTrace.slice(0, -1).some((entry) => entry.reasonCodes.length !== 0) ||
    (decision.status === "ready-for-dry-run"
      ? value.gateTrace.length !== orderedGates.length ||
        stoppedTraceIndex !== -1 ||
        !sameLedgerValue(value.gateTrace.at(-1)?.reasonCodes, ["dry_run_only"])
      : stoppedTraceIndex !== value.gateTrace.length - 1 ||
        !sameLedgerValue(value.gateTrace.at(-1)?.reasonCodes, decision.blockingReasonCodes) ||
        decision.blockingReasonCodes.length !== 1 ||
        stoppedEntry?.gate !== stoppedGateByBlocker[decision.blockingReasonCodes[0]!]);
  if (
    retentionBindingInvalid ||
    traceBindingInvalid ||
    value.gateTrace.some(
      (entry, index) => entry.order !== index + 1 || entry.gate !== orderedGates[index],
    ) ||
    (evidence.authorization?.decisionFingerprint ?? null) !==
      decision.authorizationDecisionFingerprint ||
    (evidence.compatibility?.compatibilityFingerprint ?? null) !==
      decision.capabilityResultFingerprint ||
    (evidence.transportPlan?.transportPolicyFingerprint ?? null) !==
      decision.transportPolicyFingerprint ||
    (evidence.rateAndCapacity?.decisionFingerprint ?? null) !==
      decision.rateAndCapacityDecisionFingerprint ||
    (evidence.costAndBudget?.decisionFingerprint ?? null) !==
      decision.costAndBudgetDecisionFingerprint ||
    (evidence.circuit?.stateFingerprint ?? null) !== decision.circuitStateFingerprint ||
    (evidence.observability?.readiness.readinessFingerprint ?? null) !==
      decision.observabilityReadinessFingerprint ||
    (evidence.observabilityRetention?.retentionFingerprint ?? null) !==
      decision.observabilityRetentionFingerprint ||
    (evidence.health?.healthFingerprint ?? null) !== decision.healthEvidenceFingerprint ||
    (evidence.requestPlan?.requestPlanFingerprint ?? null) !== decision.requestPlanFingerprint ||
    !sameLedgerValue(evidence.requestPlan?.warnings ?? [], decision.warningReasonCodes) ||
    value.observabilityRetentionFingerprint !== decision.observabilityRetentionFingerprint
  ) {
    throw new DurableReadinessLedgerError("evaluation-package-binding-invalid");
  }
  assertFingerprint(
    value,
    "evaluationPackageFingerprint",
    M15_COMMITMENT_DOMAINS.evaluationPackage,
  );
  return immutable(value);
}

export function createReadinessRegistrationRequest(
  input: Parameters<typeof ReadinessRegistrationRequestUnsignedV1Schema.parse>[0],
): ReadinessRegistrationRequest {
  const value = ReadinessRegistrationRequestUnsignedV1Schema.parse(input);
  return ReadinessRegistrationRequestSchema.parse(
    signed(value, "registrationRequestFingerprint", M15_COMMITMENT_DOMAINS.registrationRequest),
  );
}

export function verifyReadinessRegistrationRequest(input: unknown): ReadinessRegistrationRequest {
  const value = ReadinessRegistrationRequestSchema.parse(input);
  verifyDurableReadinessAuthorityProjection(value.authorityProjection);
  verifyReadinessEvaluatorConfigurationProjection(value.evaluatorConfigurationProjection);
  if (value.expectedEvaluationPackage !== null) {
    verifyCanonicalReadinessEvaluationPackage(value.expectedEvaluationPackage);
  }
  assertFingerprint(
    value,
    "registrationRequestFingerprint",
    M15_COMMITMENT_DOMAINS.registrationRequest,
  );
  return immutable(value);
}

export function createReadinessOwnership(
  input: Parameters<typeof ReadinessIdempotencyOwnershipUnsignedV1Schema.parse>[0],
): ReadinessIdempotencyOwnership {
  const value = ReadinessIdempotencyOwnershipUnsignedV1Schema.parse(input);
  return ReadinessIdempotencyOwnershipSchema.parse(
    signed(value, "ownershipFingerprint", M15_COMMITMENT_DOMAINS.ownership),
  );
}

export function verifyReadinessOwnership(input: unknown): ReadinessIdempotencyOwnership {
  const value = ReadinessIdempotencyOwnershipSchema.parse(input);
  assertFingerprint(value, "ownershipFingerprint", M15_COMMITMENT_DOMAINS.ownership);
  return immutable(value);
}

export function createCommittedReadinessTransaction(
  input: Parameters<typeof CommittedReadinessEvaluationTransactionUnsignedV1Schema.parse>[0],
): CommittedReadinessEvaluationTransaction {
  const value = CommittedReadinessEvaluationTransactionUnsignedV1Schema.parse(input);
  return CommittedReadinessEvaluationTransactionSchema.parse(
    signed(value, "transactionFingerprint", M15_COMMITMENT_DOMAINS.transaction),
  );
}

export function verifyCommittedReadinessTransaction(
  input: unknown,
): CommittedReadinessEvaluationTransaction {
  const value = CommittedReadinessEvaluationTransactionSchema.parse(input);
  verifyReadinessRegistrationRequest(value.registrationRequest);
  verifyReadinessOwnership(value.ownership);
  verifyDurableReadinessAuthorityProjection(value.authorityProjection);
  verifyReadinessEvaluatorConfigurationProjection(value.evaluatorConfigurationProjection);
  verifyCanonicalReadinessEvaluationPackage(value.evaluationPackage);
  const retainedEvidence = DurableReadinessEvidenceProjectionSchema.parse(
    value.evaluationPackage.retainedEvidence,
  );
  const transportCommitment = retainedEvidence.transportPlan;
  const authorization = retainedEvidence.authorization;
  const compatibility = retainedEvidence.compatibility;
  const rate = retainedEvidence.rateAndCapacity;
  const cost = retainedEvidence.costAndBudget;
  const circuit = retainedEvidence.circuit;
  const retention = retainedEvidence.observabilityRetention;
  const health = retainedEvidence.health;
  const requestPlan = retainedEvidence.requestPlan;
  const retainedBindingsInvalid =
    (compatibility !== null &&
      (compatibility.invocationRequestFingerprint !==
        value.authorityProjection.invocationRequestFingerprint ||
        compatibility.providerCapabilityFingerprint !== value.providerCapabilityFingerprint)) ||
    (rate !== null &&
      (rate.invocationRequestFingerprint !==
        value.authorityProjection.invocationRequestFingerprint ||
        rate.adapterFingerprint !== value.adapterFingerprint)) ||
    (cost !== null &&
      (cost.invocationRequestFingerprint !==
        value.authorityProjection.invocationRequestFingerprint ||
        cost.adapterFingerprint !== value.adapterFingerprint)) ||
    (circuit !== null &&
      (circuit.adapterId !== value.adapterId ||
        circuit.adapterFingerprint !== value.adapterFingerprint)) ||
    (health !== null &&
      (health.adapterId !== value.adapterId ||
        health.adapterFingerprint !== value.adapterFingerprint ||
        health.circuitStateFingerprint !== (circuit?.stateFingerprint ?? null))) ||
    (retention !== null &&
      (retention.adapterId !== value.adapterId ||
        retention.adapterFingerprint !== value.adapterFingerprint ||
        retention.invocationRequestId !== value.authorityProjection.invocationRequestId ||
        retention.invocationRequestFingerprint !==
          value.authorityProjection.invocationRequestFingerprint ||
        retention.observabilityReadinessFingerprint !==
          (retainedEvidence.observability?.readiness.readinessFingerprint ?? null))) ||
    (requestPlan !== null &&
      (requestPlan.adapterId !== value.adapterId ||
        requestPlan.adapterFingerprint !== value.adapterFingerprint ||
        requestPlan.providerCapabilityId !== value.providerCapabilityId ||
        requestPlan.providerCapabilityFingerprint !== value.providerCapabilityFingerprint ||
        requestPlan.invocationRequestId !== value.authorityProjection.invocationRequestId ||
        requestPlan.invocationRequestFingerprint !==
          value.authorityProjection.invocationRequestFingerprint ||
        requestPlan.deliveryTransactionId !== value.authorityProjection.deliveryTransactionId ||
        requestPlan.deliveryTransactionFingerprint !==
          value.authorityProjection.deliveryTransactionFingerprint ||
        requestPlan.authorizationDecisionFingerprint !==
          (authorization?.decisionFingerprint ?? null) ||
        requestPlan.credentialReferenceId !== value.credentialReferenceId ||
        requestPlan.credentialReferenceFingerprint !== value.credentialReferenceFingerprint ||
        requestPlan.transportPolicyId !== value.transportPolicyId ||
        requestPlan.transportPolicyFingerprint !== value.transportPolicyFingerprint ||
        requestPlan.rateAndCapacityDecisionFingerprint !== (rate?.decisionFingerprint ?? null) ||
        requestPlan.costAndBudgetDecisionFingerprint !== (cost?.decisionFingerprint ?? null)));
  assertFingerprint(value, "transactionFingerprint", M15_COMMITMENT_DOMAINS.transaction);
  if (
    retainedBindingsInvalid ||
    value.transactionId !== value.registrationRequest.transactionId ||
    value.transactionId !== value.ownership.transactionId ||
    value.registrationRequestFingerprint !==
      value.registrationRequest.registrationRequestFingerprint ||
    value.ownershipFingerprint !== value.ownership.ownershipFingerprint ||
    !sameLedgerValue(value.authorityProjection, value.registrationRequest.authorityProjection) ||
    !sameLedgerValue(
      value.evaluatorConfigurationProjection,
      value.registrationRequest.evaluatorConfigurationProjection,
    ) ||
    value.registrationRequest.readinessInputFingerprint !==
      value.evaluationPackage.readinessInputFingerprint ||
    value.evaluationPackage.authorityProjectionFingerprint !==
      value.authorityProjection.authorityProjectionFingerprint ||
    value.evaluationPackage.configurationProjectionFingerprint !==
      value.evaluatorConfigurationProjection.configurationProjectionFingerprint ||
    (value.registrationRequest.expectedEvaluationPackageFingerprint !== null &&
      value.registrationRequest.expectedEvaluationPackageFingerprint !==
        value.evaluationPackage.evaluationPackageFingerprint) ||
    value.ownership.idempotencyKey !== value.registrationRequest.idempotencyKey ||
    value.ownership.ownershipId !== value.registrationRequest.requestedOwnershipId ||
    value.ownership.registrationRequestId !== value.registrationRequest.registrationRequestId ||
    value.ownership.registrationRequestFingerprint !== value.registrationRequestFingerprint ||
    value.ownership.registrationSemanticEventId !==
      value.registrationRequest.requestedRegistrationSemanticEventId ||
    value.ownership.registrationAuditEntryId !==
      value.registrationRequest.requestedRegistrationAuditEntryId ||
    value.ownership.registrationMarkerId !==
      value.registrationRequest.requestedRegistrationMarkerId ||
    value.ownership.evaluationPackageFingerprint !==
      value.evaluationPackage.evaluationPackageFingerprint ||
    value.ownership.readinessDecisionId !== value.evaluationPackage.decision.readinessDecisionId ||
    value.ownership.readinessDecisionFingerprint !==
      value.evaluationPackage.decision.decisionFingerprint ||
    value.ownership.deliveryTransactionId !== value.authorityProjection.deliveryTransactionId ||
    value.ownership.deliveryTransactionFingerprint !==
      value.authorityProjection.deliveryTransactionFingerprint ||
    value.ownership.invocationRequestId !== value.authorityProjection.invocationRequestId ||
    value.ownership.invocationRequestFingerprint !==
      value.authorityProjection.invocationRequestFingerprint ||
    value.ownership.adapterId !== value.adapterId ||
    value.ownership.adapterFingerprint !== value.adapterFingerprint ||
    value.ownership.configurationProjectionFingerprint !==
      value.evaluatorConfigurationProjection.configurationProjectionFingerprint ||
    value.ownership.authorityProjectionFingerprint !==
      value.authorityProjection.authorityProjectionFingerprint ||
    (authorization !== null &&
      (authorization.deliveryTransactionId !== value.authorityProjection.deliveryTransactionId ||
        authorization.deliveryTransactionFingerprint !==
          value.authorityProjection.deliveryTransactionFingerprint ||
        authorization.invocationRequestId !== value.authorityProjection.invocationRequestId ||
        authorization.invocationRequestFingerprint !==
          value.authorityProjection.invocationRequestFingerprint ||
        authorization.contextPackageId !== value.authorityProjection.contextPackageId ||
        authorization.contextPackageFingerprint !==
          value.authorityProjection.contextPackageFingerprint ||
        authorization.consumerId !== value.authorityProjection.consumerId ||
        authorization.consumerDescriptorFingerprint !==
          value.authorityProjection.consumerDescriptorFingerprint ||
        authorization.adapterId !== value.adapterId ||
        authorization.adapterFingerprint !== value.adapterFingerprint)) ||
    value.adapterId !== value.evaluatorConfigurationProjection.adapterId ||
    value.adapterFingerprint !== value.evaluatorConfigurationProjection.adapterFingerprint ||
    value.providerFamilyReference !==
      value.evaluatorConfigurationProjection.providerFamilyReference ||
    value.transportPolicyId !== value.evaluatorConfigurationProjection.transportPolicyId ||
    value.transportPolicyFingerprint !==
      value.evaluatorConfigurationProjection.transportPolicyFingerprint ||
    (transportCommitment !== null &&
      (transportCommitment.adapterId !== value.adapterId ||
        transportCommitment.adapterFingerprint !== value.adapterFingerprint ||
        transportCommitment.providerFamilyReference !== value.providerFamilyReference ||
        transportCommitment.providerCapabilityId !== value.providerCapabilityId ||
        transportCommitment.providerCapabilityFingerprint !== value.providerCapabilityFingerprint ||
        transportCommitment.credentialReferenceId !== value.credentialReferenceId ||
        transportCommitment.credentialReferenceFingerprint !==
          value.credentialReferenceFingerprint ||
        transportCommitment.transportPolicyId !== value.transportPolicyId ||
        transportCommitment.transportPolicyFingerprint !== value.transportPolicyFingerprint ||
        transportCommitment.transportPolicyVersion !==
          value.evaluatorConfigurationProjection.transportPolicyVersion)) ||
    value.adapterId !== value.evaluationPackage.decision.adapterId ||
    value.adapterFingerprint !== value.evaluationPackage.decision.adapterFingerprint ||
    value.authorityProjection.invocationRequestId !==
      value.evaluationPackage.decision.invocationRequestId ||
    value.authorityProjection.invocationRequestFingerprint !==
      value.evaluationPackage.decision.invocationRequestFingerprint ||
    (value.evaluationPackage.decision.credentialReferenceFingerprint !== null &&
      value.credentialReferenceFingerprint !==
        value.evaluationPackage.decision.credentialReferenceFingerprint) ||
    (value.evaluationPackage.decision.transportPolicyFingerprint !== null &&
      value.transportPolicyFingerprint !==
        value.evaluationPackage.decision.transportPolicyFingerprint) ||
    value.originalEvaluationTime !== value.evaluationPackage.originalEvaluationTime ||
    value.originalEvaluationTime !== value.registrationRequest.originalEvaluationTime ||
    value.originalEvaluationTime !== value.evaluationPackage.decision.evaluatedAt ||
    value.submittedAt !== value.registrationRequest.submittedAt ||
    value.ownership.ownershipCreatedAt !== value.committedAt
  ) {
    throw new DurableReadinessLedgerError("transaction-binding-invalid");
  }
  return immutable(value);
}

export interface ReadinessGenesisCommitment {
  readonly completeHistory: ReadinessGenesisCompleteHistory;
  readonly head: ReadinessLedgerHead;
  readonly marker: ReadinessGenesisCommitMarker;
}

export function createReadinessGenesisCommitment(): ReadinessGenesisCommitment {
  const historyUnsigned = ReadinessGenesisCompleteHistoryUnsignedV1Schema.parse({
    historyContractVersion: "1.0",
    historyGeneration: 0,
    previousCompleteHistoryFingerprint: null,
    totalAuthoritativeEventCount: 0,
  });
  const completeHistory = ReadinessGenesisCompleteHistorySchema.parse(
    signed(historyUnsigned, "completeHistoryFingerprint", M15_COMMITMENT_DOMAINS.genesisHistory),
  );
  const headUnsigned = ReadinessLedgerHeadUnsignedV1Schema.parse({
    headContractVersion: "1.0",
    headGeneration: 0,
    committedRegistrationCount: 0,
    committedReplayAttemptCount: 0,
    totalAuthoritativeEventCount: 0,
    lastCommittedLedgerSequence: 0,
    latestAuditEntryId: null,
    latestAuditEntryFingerprint: null,
    latestSemanticEventId: null,
    latestSemanticEventFingerprint: null,
    latestSubjectTransactionId: null,
    latestSubjectTransactionFingerprint: null,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
  });
  const head = ReadinessLedgerHeadSchema.parse(
    signed(headUnsigned, "ledgerHeadFingerprint", M15_COMMITMENT_DOMAINS.genesisHead),
  );
  const markerUnsigned = ReadinessGenesisCommitMarkerUnsignedV1Schema.parse({
    markerContractVersion: "1.0",
    markerId: "m15-genesis",
    markerGeneration: 0,
    markerCategory: "genesis",
    committedRegistrationCount: 0,
    committedReplayAttemptCount: 0,
    totalAuthoritativeEventCount: 0,
    lastCommittedLedgerSequence: 0,
    subjectTransactionId: null,
    subjectTransactionFingerprint: null,
    semanticEventId: null,
    semanticEventFingerprint: null,
    auditEntryId: null,
    auditEntryFingerprint: null,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
    resultingLedgerHead: head,
    resultingLedgerHeadFingerprint: head.ledgerHeadFingerprint,
  });
  const marker = ReadinessGenesisCommitMarkerSchema.parse(
    signed(markerUnsigned, "commitMarkerFingerprint", M15_COMMITMENT_DOMAINS.genesisMarker),
  );
  return immutable({ completeHistory, head, marker });
}

export function verifyReadinessLedgerHead(input: unknown): ReadinessLedgerHead {
  const value = ReadinessLedgerHeadSchema.parse(input);
  assertFingerprint(
    value,
    "ledgerHeadFingerprint",
    value.headGeneration === 0
      ? M15_COMMITMENT_DOMAINS.genesisHead
      : M15_COMMITMENT_DOMAINS.ledgerHead,
  );
  return immutable(value);
}

export function verifyReadinessCommitMarker(input: unknown): ReadinessCommitMarker {
  const value = ReadinessCommitMarkerSchema.parse(input);
  verifyReadinessLedgerHead(value.resultingLedgerHead);
  assertFingerprint(
    value,
    "commitMarkerFingerprint",
    value.markerCategory === "genesis"
      ? M15_COMMITMENT_DOMAINS.genesisMarker
      : M15_COMMITMENT_DOMAINS.commitMarker,
  );
  if (
    value.resultingLedgerHeadFingerprint !== value.resultingLedgerHead.ledgerHeadFingerprint ||
    value.markerGeneration !== value.resultingLedgerHead.headGeneration ||
    value.completeHistoryFingerprint !== value.resultingLedgerHead.completeHistoryFingerprint ||
    value.committedRegistrationCount !== value.resultingLedgerHead.committedRegistrationCount ||
    value.committedReplayAttemptCount !== value.resultingLedgerHead.committedReplayAttemptCount ||
    value.totalAuthoritativeEventCount !== value.resultingLedgerHead.totalAuthoritativeEventCount ||
    value.lastCommittedLedgerSequence !== value.resultingLedgerHead.lastCommittedLedgerSequence ||
    value.subjectTransactionId !== value.resultingLedgerHead.latestSubjectTransactionId ||
    value.subjectTransactionFingerprint !==
      value.resultingLedgerHead.latestSubjectTransactionFingerprint ||
    value.semanticEventId !== value.resultingLedgerHead.latestSemanticEventId ||
    value.semanticEventFingerprint !== value.resultingLedgerHead.latestSemanticEventFingerprint ||
    value.auditEntryId !== value.resultingLedgerHead.latestAuditEntryId ||
    value.auditEntryFingerprint !== value.resultingLedgerHead.latestAuditEntryFingerprint
  ) {
    throw new DurableReadinessLedgerError("marker-head-binding-invalid");
  }
  return immutable(value);
}

export function createRegistrationLedgerEvent(input: {
  readonly request: ReadinessRegistrationRequest;
  readonly ownership: ReadinessIdempotencyOwnership;
  readonly transaction: CommittedReadinessEvaluationTransaction;
  readonly previousHead: ReadinessLedgerHead;
  readonly recordedAt: string;
}): ReadinessRegistrationLedgerEvent {
  const sequence = input.previousHead.lastCommittedLedgerSequence + 1;
  const semanticUnsigned = ReadinessSemanticEventUnsignedV1Schema.parse({
    eventContractVersion: "1.0",
    semanticEventId: input.request.requestedRegistrationSemanticEventId,
    eventCategory: "registration",
    transactionId: input.transaction.transactionId,
    transactionFingerprint: input.transaction.transactionFingerprint,
    ownershipId: input.ownership.ownershipId,
    ownershipFingerprint: input.ownership.ownershipFingerprint,
  });
  const semanticEvent = ReadinessSemanticEventSchema.parse(
    signed(
      semanticUnsigned,
      "semanticEventFingerprint",
      M15_COMMITMENT_DOMAINS.registrationSemanticEvent,
    ),
  );
  const auditUnsigned = ReadinessAuditEntryUnsignedV1Schema.parse({
    auditContractVersion: "1.0",
    auditEntryId: input.request.requestedRegistrationAuditEntryId,
    ledgerSequence: sequence,
    previousLedgerHeadFingerprint: input.previousHead.ledgerHeadFingerprint,
    semanticEventId: semanticEvent.semanticEventId,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
    eventCategory: "registration",
    subjectTransactionId: input.transaction.transactionId,
    subjectTransactionFingerprint: input.transaction.transactionFingerprint,
    recordedAt: input.recordedAt,
  });
  const auditEntry = ReadinessAuditEntrySchema.parse(
    signed(auditUnsigned, "auditEntryFingerprint", M15_COMMITMENT_DOMAINS.auditEntry),
  );
  const historyUnsigned = ReadinessCompleteHistoryCommitmentUnsignedV1Schema.parse({
    historyContractVersion: "1.0",
    previousCompleteHistoryFingerprint: input.previousHead.completeHistoryFingerprint,
    auditSequence: sequence,
    auditEntryFingerprint: auditEntry.auditEntryFingerprint,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
  });
  const completeHistory = ReadinessCompleteHistoryCommitmentSchema.parse(
    signed(historyUnsigned, "completeHistoryFingerprint", M15_COMMITMENT_DOMAINS.completeHistory),
  );
  const headUnsigned = ReadinessLedgerHeadUnsignedV1Schema.parse({
    headContractVersion: "1.0",
    headGeneration: sequence,
    committedRegistrationCount: input.previousHead.committedRegistrationCount + 1,
    committedReplayAttemptCount: input.previousHead.committedReplayAttemptCount,
    totalAuthoritativeEventCount: sequence,
    lastCommittedLedgerSequence: sequence,
    latestAuditEntryId: auditEntry.auditEntryId,
    latestAuditEntryFingerprint: auditEntry.auditEntryFingerprint,
    latestSemanticEventId: semanticEvent.semanticEventId,
    latestSemanticEventFingerprint: semanticEvent.semanticEventFingerprint,
    latestSubjectTransactionId: input.transaction.transactionId,
    latestSubjectTransactionFingerprint: input.transaction.transactionFingerprint,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
  });
  const resultingLedgerHead = ReadinessLedgerHeadSchema.parse(
    signed(headUnsigned, "ledgerHeadFingerprint", M15_COMMITMENT_DOMAINS.ledgerHead),
  );
  const markerUnsigned = ReadinessRegistrationCommitMarkerUnsignedV1Schema.parse({
    markerContractVersion: "1.0",
    markerId: input.request.requestedRegistrationMarkerId,
    markerGeneration: sequence,
    markerCategory: "registration",
    committedRegistrationCount: resultingLedgerHead.committedRegistrationCount,
    committedReplayAttemptCount: resultingLedgerHead.committedReplayAttemptCount,
    totalAuthoritativeEventCount: sequence,
    lastCommittedLedgerSequence: sequence,
    subjectTransactionId: input.transaction.transactionId,
    subjectTransactionFingerprint: input.transaction.transactionFingerprint,
    semanticEventId: semanticEvent.semanticEventId,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
    auditEntryId: auditEntry.auditEntryId,
    auditEntryFingerprint: auditEntry.auditEntryFingerprint,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
    resultingLedgerHead,
    resultingLedgerHeadFingerprint: resultingLedgerHead.ledgerHeadFingerprint,
    registrationRequestFingerprint: input.request.registrationRequestFingerprint,
    configurationProjectionFingerprint:
      input.request.evaluatorConfigurationProjection.configurationProjectionFingerprint,
    authorityProjectionFingerprint:
      input.request.authorityProjection.authorityProjectionFingerprint,
    evaluationPackageFingerprint: input.transaction.evaluationPackage.evaluationPackageFingerprint,
    ownershipFingerprint: input.ownership.ownershipFingerprint,
    transactionFingerprint: input.transaction.transactionFingerprint,
    registrationSemanticEventFingerprint: semanticEvent.semanticEventFingerprint,
  });
  const commitMarker = ReadinessRegistrationCommitMarkerSchema.parse(
    signed(markerUnsigned, "commitMarkerFingerprint", M15_COMMITMENT_DOMAINS.commitMarker),
  );
  return ReadinessLedgerEventSchema.parse({
    eventEnvelopeContractVersion: "1.0",
    category: "registration",
    sequence,
    registrationRequest: input.request,
    ownership: input.ownership,
    transaction: input.transaction,
    semanticEvent,
    auditEntry,
    completeHistory,
    commitMarker,
  }) as ReadinessRegistrationLedgerEvent;
}

export function createReadinessReplayRequest(
  input: Parameters<typeof ReadinessReplayRequestUnsignedV1Schema.parse>[0],
): ReadinessReplayRequest {
  const value = ReadinessReplayRequestUnsignedV1Schema.parse(input);
  return ReadinessReplayRequestSchema.parse(
    signed(value, "replayRequestFingerprint", M15_COMMITMENT_DOMAINS.replayRequest),
  );
}

export function verifyReadinessReplayRequest(input: unknown): ReadinessReplayRequest {
  const value = ReadinessReplayRequestSchema.parse(input);
  verifyDurableReadinessAuthorityProjection(value.suppliedAuthorityProjection);
  verifyReadinessEvaluatorConfigurationProjection(value.suppliedEvaluatorConfigurationProjection);
  assertFingerprint(value, "replayRequestFingerprint", M15_COMMITMENT_DOMAINS.replayRequest);
  return immutable(value);
}

export function createReadinessHistoricalComparison(
  input: Parameters<typeof ReadinessHistoricalComparisonUnsignedV1Schema.parse>[0],
): ReadinessHistoricalComparison {
  const value = ReadinessHistoricalComparisonUnsignedV1Schema.parse(input);
  return ReadinessHistoricalComparisonSchema.parse(
    signed(value, "historicalComparisonFingerprint", M15_COMMITMENT_DOMAINS.historicalComparison),
  );
}

export function verifyReadinessHistoricalComparison(input: unknown): ReadinessHistoricalComparison {
  const value = ReadinessHistoricalComparisonSchema.parse(input);
  assertFingerprint(
    value,
    "historicalComparisonFingerprint",
    M15_COMMITMENT_DOMAINS.historicalComparison,
  );
  const hasReconstruction = value.reconstructedEvaluationPackageFingerprint !== null;
  if (
    value.reasonCodes.length !== 1 ||
    value.reasonCodes[0] !== value.historicalReconstructionStatus ||
    (value.historicalReconstructionStatus === "matched" &&
      (!hasReconstruction ||
        value.reconstructedEvaluationPackageFingerprint !==
          value.originalEvaluationPackageFingerprint ||
        value.differingFieldPaths.length !== 0)) ||
    (value.historicalReconstructionStatus === "mismatched" &&
      (!hasReconstruction ||
        value.reconstructedEvaluationPackageFingerprint ===
          value.originalEvaluationPackageFingerprint ||
        value.differingFieldPaths.length === 0)) ||
    (value.historicalReconstructionStatus === "verification-failed" &&
      (hasReconstruction || value.differingFieldPaths.length !== 0))
  ) {
    throw new DurableReadinessLedgerError("historical-comparison-binding-invalid");
  }
  return immutable(value);
}

export function createReadinessCurrentAdmissibility(
  input: Parameters<typeof ReadinessCurrentAdmissibilityUnsignedV1Schema.parse>[0],
): ReadinessCurrentAdmissibility {
  const value = ReadinessCurrentAdmissibilityUnsignedV1Schema.parse(input);
  return ReadinessCurrentAdmissibilitySchema.parse(
    signed(value, "currentAdmissibilityFingerprint", M15_COMMITMENT_DOMAINS.currentAdmissibility),
  );
}

export function verifyReadinessCurrentAdmissibility(input: unknown): ReadinessCurrentAdmissibility {
  const value = ReadinessCurrentAdmissibilitySchema.parse(input);
  assertFingerprint(
    value,
    "currentAdmissibilityFingerprint",
    M15_COMMITMENT_DOMAINS.currentAdmissibility,
  );
  if (value.reasonCodes.length !== 1 || value.reasonCodes[0] !== value.currentAdmissibilityStatus) {
    throw new DurableReadinessLedgerError("current-admissibility-binding-invalid");
  }
  return immutable(value);
}

function expectedPersistedCurrentAdmissibilityStatus(
  original: CommittedReadinessEvaluationTransaction,
  suppliedAuthorityFingerprint: string,
  replayEvaluatedAt: string,
): ReadinessCurrentAdmissibility["currentAdmissibilityStatus"] {
  if (
    suppliedAuthorityFingerprint !== original.authorityProjection.authorityProjectionFingerprint
  ) {
    return "authority-mismatch";
  }
  const authorization = original.evaluationPackage.retainedEvidence.authorization;
  if (authorization === null) return "authorization-invalid-evidence";
  if (authorization.outcome === "allowed") {
    return Date.parse(replayEvaluatedAt) >= Date.parse(authorization.expiresAt)
      ? "authorization-expired"
      : "admissible";
  }
  return (
    {
      denied: "authorization-denied",
      "review-required": "authorization-review-required",
      "not-evaluated": "authorization-not-evaluated",
      expired: "authorization-expired",
      "invalid-evidence": "authorization-invalid-evidence",
    } as const
  )[authorization.outcome];
}

export function createReadinessReplayAttempt(
  input: Parameters<typeof ReadinessReplayAttemptUnsignedV1Schema.parse>[0],
): ReadinessReplayAttempt {
  const value = ReadinessReplayAttemptUnsignedV1Schema.parse(input);
  return ReadinessReplayAttemptSchema.parse(
    signed(value, "replayAttemptFingerprint", M15_COMMITMENT_DOMAINS.replayAttempt),
  );
}

export function verifyReadinessReplayAttempt(input: unknown): ReadinessReplayAttempt {
  const value = ReadinessReplayAttemptSchema.parse(input);
  verifyReadinessHistoricalComparison(value.historicalComparison);
  verifyReadinessCurrentAdmissibility(value.currentAdmissibility);
  assertFingerprint(value, "replayAttemptFingerprint", M15_COMMITMENT_DOMAINS.replayAttempt);
  if (
    value.reconstructedEvaluationPackageFingerprint !==
      value.historicalComparison.reconstructedEvaluationPackageFingerprint ||
    value.replayEvaluatedAt !== value.currentAdmissibility.replayEvaluatedAt ||
    value.evidenceReasonCodes.length !== 2 ||
    !value.evidenceReasonCodes.includes(
      value.historicalComparison.historicalReconstructionStatus,
    ) ||
    !value.evidenceReasonCodes.includes(value.currentAdmissibility.currentAdmissibilityStatus)
  ) {
    throw new DurableReadinessLedgerError("replay-attempt-binding-invalid");
  }
  return immutable(value);
}

export function createReplayLedgerEvent(input: {
  readonly request: ReadinessReplayRequest;
  readonly historicalComparison: ReadinessHistoricalComparison;
  readonly currentAdmissibility: ReadinessCurrentAdmissibility;
  readonly replayAttempt: ReadinessReplayAttempt;
  readonly originalTransaction: CommittedReadinessEvaluationTransaction;
  readonly previousHead: ReadinessLedgerHead;
  readonly recordedAt: string;
}): ReadinessReplayLedgerEvent {
  const sequence = input.previousHead.lastCommittedLedgerSequence + 1;
  const semanticUnsigned = ReadinessReplaySemanticEventUnsignedV1Schema.parse({
    eventContractVersion: "1.0",
    semanticEventId: input.request.requestedReplaySemanticEventId,
    eventCategory: "replay",
    originalTransactionId: input.originalTransaction.transactionId,
    originalTransactionFingerprint: input.originalTransaction.transactionFingerprint,
    replayAttemptId: input.replayAttempt.replayAttemptId,
    replayAttemptFingerprint: input.replayAttempt.replayAttemptFingerprint,
  });
  const semanticEvent = ReadinessReplaySemanticEventSchema.parse(
    signed(
      semanticUnsigned,
      "semanticEventFingerprint",
      M15_COMMITMENT_DOMAINS.replaySemanticEvent,
    ),
  );
  const auditUnsigned = ReadinessAuditEntryUnsignedV1Schema.parse({
    auditContractVersion: "1.0",
    auditEntryId: input.request.requestedReplayAuditEntryId,
    ledgerSequence: sequence,
    previousLedgerHeadFingerprint: input.previousHead.ledgerHeadFingerprint,
    semanticEventId: semanticEvent.semanticEventId,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
    eventCategory: "replay",
    subjectTransactionId: input.originalTransaction.transactionId,
    subjectTransactionFingerprint: input.originalTransaction.transactionFingerprint,
    recordedAt: input.recordedAt,
  });
  const auditEntry = ReadinessAuditEntrySchema.parse(
    signed(auditUnsigned, "auditEntryFingerprint", M15_COMMITMENT_DOMAINS.auditEntry),
  );
  const historyUnsigned = ReadinessCompleteHistoryCommitmentUnsignedV1Schema.parse({
    historyContractVersion: "1.0",
    previousCompleteHistoryFingerprint: input.previousHead.completeHistoryFingerprint,
    auditSequence: sequence,
    auditEntryFingerprint: auditEntry.auditEntryFingerprint,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
  });
  const completeHistory = ReadinessCompleteHistoryCommitmentSchema.parse(
    signed(historyUnsigned, "completeHistoryFingerprint", M15_COMMITMENT_DOMAINS.completeHistory),
  );
  const resultingLedgerHead = ReadinessLedgerHeadSchema.parse(
    signed(
      ReadinessLedgerHeadUnsignedV1Schema.parse({
        headContractVersion: "1.0",
        headGeneration: sequence,
        committedRegistrationCount: input.previousHead.committedRegistrationCount,
        committedReplayAttemptCount: input.previousHead.committedReplayAttemptCount + 1,
        totalAuthoritativeEventCount: sequence,
        lastCommittedLedgerSequence: sequence,
        latestAuditEntryId: auditEntry.auditEntryId,
        latestAuditEntryFingerprint: auditEntry.auditEntryFingerprint,
        latestSemanticEventId: semanticEvent.semanticEventId,
        latestSemanticEventFingerprint: semanticEvent.semanticEventFingerprint,
        latestSubjectTransactionId: input.originalTransaction.transactionId,
        latestSubjectTransactionFingerprint: input.originalTransaction.transactionFingerprint,
        completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
      }),
      "ledgerHeadFingerprint",
      M15_COMMITMENT_DOMAINS.ledgerHead,
    ),
  );
  const markerUnsigned = ReadinessReplayCommitMarkerUnsignedV1Schema.parse({
    markerContractVersion: "1.0",
    markerId: input.request.requestedReplayMarkerId,
    markerGeneration: sequence,
    markerCategory: "replay",
    committedRegistrationCount: resultingLedgerHead.committedRegistrationCount,
    committedReplayAttemptCount: resultingLedgerHead.committedReplayAttemptCount,
    totalAuthoritativeEventCount: sequence,
    lastCommittedLedgerSequence: sequence,
    subjectTransactionId: input.originalTransaction.transactionId,
    subjectTransactionFingerprint: input.originalTransaction.transactionFingerprint,
    semanticEventId: semanticEvent.semanticEventId,
    semanticEventFingerprint: semanticEvent.semanticEventFingerprint,
    auditEntryId: auditEntry.auditEntryId,
    auditEntryFingerprint: auditEntry.auditEntryFingerprint,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
    resultingLedgerHead,
    resultingLedgerHeadFingerprint: resultingLedgerHead.ledgerHeadFingerprint,
    originalTransactionFingerprint: input.originalTransaction.transactionFingerprint,
    replayRequestFingerprint: input.request.replayRequestFingerprint,
    historicalComparisonFingerprint: input.historicalComparison.historicalComparisonFingerprint,
    currentAdmissibilityFingerprint: input.currentAdmissibility.currentAdmissibilityFingerprint,
    replayAttemptFingerprint: input.replayAttempt.replayAttemptFingerprint,
    replaySemanticEventFingerprint: semanticEvent.semanticEventFingerprint,
  });
  const commitMarker = ReadinessReplayCommitMarkerSchema.parse(
    signed(markerUnsigned, "commitMarkerFingerprint", M15_COMMITMENT_DOMAINS.commitMarker),
  );
  return ReadinessLedgerEventSchema.parse({
    eventEnvelopeContractVersion: "1.0",
    category: "replay",
    sequence,
    replayRequest: input.request,
    historicalComparison: input.historicalComparison,
    currentAdmissibility: input.currentAdmissibility,
    replayAttempt: input.replayAttempt,
    semanticEvent,
    auditEntry,
    completeHistory,
    commitMarker,
  }) as ReadinessReplayLedgerEvent;
}

export interface ReplayedReadinessLedgerState {
  readonly head: ReadinessLedgerHead;
  readonly marker: ReadinessCommitMarker;
  readonly events: readonly ReadinessLedgerEvent[];
  readonly registrations: readonly ReadinessRegistrationLedgerEvent[];
  readonly replays: readonly ReadinessReplayLedgerEvent[];
  readonly transactions: ReadonlyMap<string, CommittedReadinessEvaluationTransaction>;
}

export function replayReadinessLedger(
  marker: ReadinessCommitMarker,
  rawEvents: readonly unknown[],
): ReplayedReadinessLedgerState {
  const genesis = createReadinessGenesisCommitment();
  const verifiedMarker = verifyReadinessCommitMarker(marker);
  if (verifiedMarker.markerCategory === "genesis") {
    if (
      rawEvents.length !== 0 ||
      serializeDurableCanonicalJsonValue(verifiedMarker) !==
        serializeDurableCanonicalJsonValue(genesis.marker)
    ) {
      throw new DurableReadinessLedgerError("genesis-corrupt");
    }
    return immutable({
      head: genesis.head,
      marker: genesis.marker,
      events: [],
      registrations: [],
      replays: [],
      transactions: new Map(),
    });
  }
  if (rawEvents.length !== verifiedMarker.lastCommittedLedgerSequence) {
    throw new DurableReadinessLedgerError("marker-bounded-event-count-invalid");
  }
  let previousHead = genesis.head;
  const events: ReadinessLedgerEvent[] = [];
  const registrations: ReadinessRegistrationLedgerEvent[] = [];
  const replays: ReadinessReplayLedgerEvent[] = [];
  const transactions = new Map<string, CommittedReadinessEvaluationTransaction>();
  const owned = new Map<string, string>();

  const own = (kind: string, id: string, eventId: string) => {
    const key = `${kind}:${id}`;
    if (owned.has(key)) throw new DurableReadinessLedgerError(`${kind}-duplicate`);
    owned.set(key, eventId);
  };

  for (let index = 0; index < rawEvents.length; index += 1) {
    const event = ReadinessLedgerEventSchema.parse(rawEvents[index]);
    if (
      event.sequence !== index + 1 ||
      event.auditEntry.ledgerSequence !== index + 1 ||
      event.auditEntry.previousLedgerHeadFingerprint !== previousHead.ledgerHeadFingerprint
    ) {
      throw new DurableReadinessLedgerError("audit-sequence-invalid");
    }
    verifyReadinessCommitMarker(event.commitMarker);
    if (event.category === "registration") {
      verifyReadinessRegistrationRequest(event.registrationRequest);
      verifyReadinessOwnership(event.ownership);
      verifyCommittedReadinessTransaction(event.transaction);
      const reconstructed = createRegistrationLedgerEvent({
        request: event.registrationRequest,
        ownership: event.ownership,
        transaction: event.transaction,
        previousHead,
        recordedAt: event.auditEntry.recordedAt,
      });
      if (!sameLedgerValue(reconstructed, event)) {
        throw new DurableReadinessLedgerError("registration-event-binding-invalid");
      }
      if (
        event.ownership.ownershipLedgerSequence !== event.sequence ||
        event.transaction.committedAt !== event.auditEntry.recordedAt ||
        event.registrationRequest.expectedLedgerHeadFingerprint !==
          previousHead.ledgerHeadFingerprint
      ) {
        throw new DurableReadinessLedgerError("registration-event-binding-invalid");
      }
      own("idempotency-key", event.ownership.idempotencyKey, event.semanticEvent.semanticEventId);
      own("ownership-id", event.ownership.ownershipId, event.semanticEvent.semanticEventId);
      own(
        "registration-request-id",
        event.registrationRequest.registrationRequestId,
        event.semanticEvent.semanticEventId,
      );
      own("transaction-id", event.transaction.transactionId, event.semanticEvent.semanticEventId);
      own("decision-id", event.ownership.readinessDecisionId, event.semanticEvent.semanticEventId);
      transactions.set(event.transaction.transactionId, event.transaction);
      registrations.push(event);
    } else {
      const original = transactions.get(event.replayAttempt.originalTransactionId);
      if (original === undefined) {
        throw new DurableReadinessLedgerError("replay-original-missing");
      }
      verifyReadinessReplayRequest(event.replayRequest);
      verifyReadinessHistoricalComparison(event.historicalComparison);
      verifyReadinessCurrentAdmissibility(event.currentAdmissibility);
      verifyReadinessReplayAttempt(event.replayAttempt);
      const authorization = original.evaluationPackage.retainedEvidence.authorization as
        { readonly decisionFingerprint?: unknown } | null | undefined;
      const originalAuthorizationFingerprint =
        typeof authorization?.decisionFingerprint === "string"
          ? authorization.decisionFingerprint
          : original.evaluationPackage.decision.decisionFingerprint;
      const historicalProducedPackage =
        event.historicalComparison.historicalReconstructionStatus === "matched" ||
        event.historicalComparison.historicalReconstructionStatus === "mismatched";
      if (
        event.replayRequest.originalTransactionId !== original.transactionId ||
        event.replayRequest.originalTransactionFingerprint !== original.transactionFingerprint ||
        event.replayRequest.expectedLedgerHeadFingerprint !== previousHead.ledgerHeadFingerprint ||
        event.replayRequest.readinessInputFingerprint !==
          original.evaluationPackage.readinessInputFingerprint ||
        event.replayRequest.originalEvaluationTime !== original.originalEvaluationTime ||
        event.replayRequest.originalEvaluationTime !==
          original.evaluationPackage.originalEvaluationTime ||
        event.replayAttempt.replayIdempotencyKey !== event.replayRequest.replayIdempotencyKey ||
        event.replayAttempt.replayRequestId !== event.replayRequest.replayRequestId ||
        event.replayAttempt.replayRequestFingerprint !==
          event.replayRequest.replayRequestFingerprint ||
        event.replayAttempt.replayAttemptId !== event.replayRequest.requestedReplayAttemptId ||
        event.replayAttempt.originalTransactionId !== original.transactionId ||
        event.replayAttempt.originalTransactionFingerprint !== original.transactionFingerprint ||
        event.replayAttempt.originalReadinessDecisionId !==
          original.evaluationPackage.decision.readinessDecisionId ||
        event.replayAttempt.originalReadinessDecisionFingerprint !==
          original.evaluationPackage.decision.decisionFingerprint ||
        event.replayAttempt.storedConfigurationProjectionFingerprint !==
          original.evaluatorConfigurationProjection.configurationProjectionFingerprint ||
        event.replayAttempt.suppliedConfigurationProjectionFingerprint !==
          event.replayRequest.suppliedEvaluatorConfigurationProjection
            .configurationProjectionFingerprint ||
        event.replayAttempt.storedAuthorityProjectionFingerprint !==
          original.authorityProjection.authorityProjectionFingerprint ||
        event.replayAttempt.suppliedAuthorityProjectionFingerprint !==
          event.replayRequest.suppliedAuthorityProjection.authorityProjectionFingerprint ||
        event.replayAttempt.readinessInputFingerprint !==
          event.replayRequest.readinessInputFingerprint ||
        event.replayAttempt.originalEvaluationTime !== event.replayRequest.originalEvaluationTime ||
        event.replayAttempt.replayEvaluatedAt !== event.replayRequest.replayEvaluatedAt ||
        !sameLedgerValue(event.replayAttempt.historicalComparison, event.historicalComparison) ||
        !sameLedgerValue(event.replayAttempt.currentAdmissibility, event.currentAdmissibility) ||
        event.historicalComparison.originalEvaluationPackageFingerprint !==
          original.evaluationPackage.evaluationPackageFingerprint ||
        event.currentAdmissibility.originalAuthorizationFingerprint !==
          originalAuthorizationFingerprint ||
        event.currentAdmissibility.currentAdmissibilityStatus !==
          expectedPersistedCurrentAdmissibilityStatus(
            original,
            event.replayRequest.suppliedAuthorityProjection.authorityProjectionFingerprint,
            event.replayRequest.replayEvaluatedAt,
          ) ||
        (historicalProducedPackage &&
          (event.replayRequest.suppliedAuthorityProjection.authorityProjectionFingerprint !==
            original.authorityProjection.authorityProjectionFingerprint ||
            event.replayRequest.suppliedEvaluatorConfigurationProjection
              .configurationProjectionFingerprint !==
              original.evaluatorConfigurationProjection.configurationProjectionFingerprint))
      ) {
        throw new DurableReadinessLedgerError("replay-event-binding-invalid");
      }
      const reconstructed = createReplayLedgerEvent({
        request: event.replayRequest,
        historicalComparison: event.historicalComparison,
        currentAdmissibility: event.currentAdmissibility,
        replayAttempt: event.replayAttempt,
        originalTransaction: original,
        previousHead,
        recordedAt: event.auditEntry.recordedAt,
      });
      if (!sameLedgerValue(reconstructed, event)) {
        throw new DurableReadinessLedgerError("replay-event-binding-invalid");
      }
      own(
        "replay-idempotency-key",
        event.replayAttempt.replayIdempotencyKey,
        event.semanticEvent.semanticEventId,
      );
      own(
        "replay-request-id",
        event.replayAttempt.replayRequestId,
        event.semanticEvent.semanticEventId,
      );
      own(
        "replay-attempt-id",
        event.replayAttempt.replayAttemptId,
        event.semanticEvent.semanticEventId,
      );
      replays.push(event);
    }
    own(
      "semantic-event-id",
      event.semanticEvent.semanticEventId,
      event.semanticEvent.semanticEventId,
    );
    own("audit-entry-id", event.auditEntry.auditEntryId, event.semanticEvent.semanticEventId);
    own("marker-id", event.commitMarker.markerId, event.semanticEvent.semanticEventId);
    previousHead = event.commitMarker.resultingLedgerHead;
    events.push(event);
  }
  const lastEvent = events.at(-1)!;
  if (
    serializeDurableCanonicalJsonValue(lastEvent.commitMarker) !==
    serializeDurableCanonicalJsonValue(verifiedMarker)
  ) {
    throw new DurableReadinessLedgerError("current-marker-mismatch");
  }
  return immutable({
    head: previousHead,
    marker: verifiedMarker,
    events,
    registrations,
    replays,
    transactions,
  });
}

function sameLedgerValue(left: unknown, right: unknown): boolean {
  return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
}

export function createReadinessDerivedIndexes(
  state: ReplayedReadinessLedgerState,
): readonly ReadinessDerivedIndex[] {
  const grouped = new Map<
    string,
    Array<{ key: string; coordinates: Record<string, string>; subject: string; marker: string }>
  >();
  const add = (
    kind: string,
    key: string,
    coordinates: Record<string, string>,
    subject: string,
    marker: string,
  ) => {
    const entries = grouped.get(kind) ?? [];
    entries.push({ key, coordinates, subject, marker });
    grouped.set(kind, entries);
  };
  for (const event of state.registrations) {
    const transaction = event.transaction;
    const marker = event.commitMarker.commitMarkerFingerprint;
    const coordinates = { transactionId: transaction.transactionId };
    add(
      "transaction-id",
      transaction.transactionId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "registration-request-id",
      transaction.registrationRequest.registrationRequestId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "registration-idempotency-key",
      transaction.ownership.idempotencyKey,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "ownership-id",
      transaction.ownership.ownershipId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "decision-id",
      transaction.ownership.readinessDecisionId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "invocation-id",
      transaction.authorityProjection.invocationRequestId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
    add(
      "adapter-id",
      transaction.adapterId,
      coordinates,
      transaction.transactionFingerprint,
      marker,
    );
  }
  for (const event of state.replays) {
    const coordinates = {
      transactionId: event.replayAttempt.originalTransactionId,
      replayAttemptId: event.replayAttempt.replayAttemptId,
    };
    add(
      "replay-idempotency-key",
      event.replayAttempt.replayIdempotencyKey,
      coordinates,
      event.replayAttempt.originalTransactionFingerprint,
      event.commitMarker.commitMarkerFingerprint,
    );
    add(
      "replay-request-id",
      event.replayAttempt.replayRequestId,
      coordinates,
      event.replayAttempt.originalTransactionFingerprint,
      event.commitMarker.commitMarkerFingerprint,
    );
    add(
      "replay-attempt-id",
      event.replayAttempt.replayAttemptId,
      coordinates,
      event.replayAttempt.originalTransactionFingerprint,
      event.commitMarker.commitMarkerFingerprint,
    );
  }
  return immutable(
    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, values]) => {
        const entries = values
          .sort((left, right) => left.key.localeCompare(right.key))
          .map((entry) => {
            const unsignedEntry = ReadinessDerivedIndexEntryUnsignedV1Schema.parse({
              indexKind: kind,
              indexKey: entry.key,
              logicalCoordinates: entry.coordinates,
              authoritativeSubjectTransactionFingerprint: entry.subject,
              authoritativeMarkerFingerprint: entry.marker,
            });
            return ReadinessDerivedIndexEntrySchema.parse(
              signed(
                unsignedEntry,
                "derivedIndexEntryFingerprint",
                M15_COMMITMENT_DOMAINS.derivedIndexEntry,
              ),
            );
          });
        const unsignedIndex = ReadinessDerivedIndexUnsignedV1Schema.parse({
          indexContractVersion: "1.0",
          indexKind: kind,
          sourceMarkerFingerprint: state.marker.commitMarkerFingerprint,
          sourceLedgerHeadFingerprint: state.head.ledgerHeadFingerprint,
          entries,
          orderedEntryFingerprints: entries.map((entry) => entry.derivedIndexEntryFingerprint),
          entryCount: entries.length,
        });
        return ReadinessDerivedIndexSchema.parse(
          signed(unsignedIndex, "derivedIndexFingerprint", M15_COMMITMENT_DOMAINS.derivedIndex),
        );
      }),
  );
}
