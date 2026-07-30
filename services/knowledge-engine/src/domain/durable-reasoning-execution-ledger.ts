import {
  DurableReasoningExecutionAttemptRecordSchema,
  DurableReasoningExecutionDerivedIndexSchema,
  DurableReasoningProviderOutcomeRecordSchema,
  FinalizedReasoningInvocationTransactionSchema,
  ReasoningExecutionLedgerEventSchema,
  ReasoningExecutionLedgerIntegrityVerificationResultSchema,
  ReasoningExecutionLedgerIssueSchema,
  ReasoningExecutionLedgerRecoveryResultSchema,
  ReasoningInvocationOwnershipRecordSchema,
  findDurableCanonicalJsonIssue,
  type DurableReasoningExecutionDerivedIndex,
  type FinalizedReasoningInvocationTransaction,
  type ReasoningExecutionAttempt,
  type ReasoningExecutionLedgerEvent,
  type ReasoningExecutionLedgerIntegrityVerificationResult,
  type ReasoningExecutionLedgerRecoveryResult,
  type ReasoningInvocationOwnershipRecord,
  type ReasoningInvocationRequest,
  type ReasoningProviderCapabilityDescriptor,
  type ReasoningProviderOutcome,
} from "@founderos/knowledge-schema";

import { createDurableCanonicalJsonSha256Fingerprint } from "./canonical-fingerprint.js";
import {
  verifyFinalizedReasoningConsumptionEvidence,
  verifyReasoningExecutionAttempt,
  verifyReasoningAttemptLifecycle,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderOutcome,
  verifyReasoningProviderCapabilityDescriptor,
} from "./reasoning.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

export class ReasoningExecutionLedgerError extends Error {
  public constructor(
    public readonly code: ReturnType<typeof ReasoningExecutionLedgerIssueSchema.parse>["code"],
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class ReasoningExecutionLedgerConflictError extends ReasoningExecutionLedgerError {}
export class ReasoningExecutionLedgerIntegrityError extends ReasoningExecutionLedgerError {}

export interface ReasoningExecutionLedgerReplayState {
  readonly events: readonly ReasoningExecutionLedgerEvent[];
  readonly ownershipByKey: ReadonlyMap<string, ReasoningInvocationOwnershipRecord>;
  readonly requestsById: ReadonlyMap<string, ReasoningInvocationRequest>;
  readonly authorityByInvocation: ReadonlyMap<string, ReasoningInvocationAuthority>;
  readonly attemptsByInvocation: ReadonlyMap<string, readonly ReasoningExecutionAttempt[]>;
  readonly attemptsById: ReadonlyMap<string, ReasoningExecutionAttempt>;
  readonly outcomesByAttemptId: ReadonlyMap<string, ReasoningProviderOutcome>;
  readonly finalizationsByInvocation: ReadonlyMap<string, FinalizedReasoningInvocationTransaction>;
  readonly lastSequence: number;
  readonly lastAuditFingerprint: "genesis" | string;
  readonly executionEvidenceFingerprint: string;
}

export interface ReasoningInvocationAuthority {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly contextPackageObjectCount: number;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
function without(value: object, field: string) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}
function requireFingerprint(value: object, field: string, label: string): void {
  const record = value as Record<string, unknown>;
  if (
    typeof record[field] !== "string" ||
    record[field] !== createDurableCanonicalJsonSha256Fingerprint(without(value, field))
  )
    throw new ReasoningExecutionLedgerIntegrityError(
      "fingerprint_mismatch",
      `${label} fingerprint does not verify`,
    );
}

export function createInvocationOwnershipRecord(input: {
  readonly request: ReasoningInvocationRequest;
  readonly ledgerSequence: number;
  readonly previousAuditFingerprint: string;
  readonly registeredAt: string;
}): ReasoningInvocationOwnershipRecord {
  if (verifyReasoningInvocationRequest(input.request).status !== "valid")
    throw new ReasoningExecutionLedgerIntegrityError(
      "fingerprint_mismatch",
      "Invocation Request does not verify",
    );
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "invocation-ownership" as const,
    ownershipId: `reasoning-ownership-${createDurableCanonicalJsonSha256Fingerprint(input.request.idempotencyKey)}`,
    invocationIdempotencyKey: input.request.idempotencyKey,
    invocationRequestId: input.request.invocationRequestId,
    invocationRequestFingerprint: input.request.requestFingerprint,
    ownershipStatus: "in-progress" as const,
    ownershipSequence: input.ledgerSequence,
    createdAt: input.registeredAt,
    ledgerSequence: input.ledgerSequence,
    previousAuditFingerprint: input.previousAuditFingerprint,
    committedAt: input.registeredAt,
  };
  return immutableCopy(
    ReasoningInvocationOwnershipRecordSchema.parse({
      ...unsigned,
      ownershipFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

export function createExecutionAttemptRecord(input: {
  readonly attempt: ReasoningExecutionAttempt;
  readonly ledgerSequence: number;
  readonly previousAuditFingerprint: string;
}) {
  if (verifyReasoningExecutionAttempt(input.attempt).status !== "valid")
    throw new ReasoningExecutionLedgerIntegrityError(
      "fingerprint_mismatch",
      "Execution Attempt does not verify",
    );
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "execution-attempt" as const,
    invocationRequestId: input.attempt.invocationRequestId,
    invocationRequestFingerprint: input.attempt.invocationRequestFingerprint,
    invocationIdempotencyKey: input.attempt.invocationIdempotencyKey,
    attempt: input.attempt,
    ledgerSequence: input.ledgerSequence,
    previousAuditFingerprint: input.previousAuditFingerprint,
    committedAt: input.attempt.startedAt,
  };
  return immutableCopy(
    DurableReasoningExecutionAttemptRecordSchema.parse({
      ...unsigned,
      recordFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

export function createProviderOutcomeRecord(input: {
  readonly outcome: ReasoningProviderOutcome;
  readonly ledgerSequence: number;
  readonly previousAuditFingerprint: string;
}) {
  if (verifyReasoningProviderOutcome(input.outcome).status !== "valid")
    throw new ReasoningExecutionLedgerIntegrityError(
      "fingerprint_mismatch",
      "Provider Outcome does not verify",
    );
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "provider-outcome" as const,
    invocationRequestId: input.outcome.invocationRequestId,
    executionAttemptId: input.outcome.executionAttemptId,
    attemptNumber: input.outcome.attemptNumber,
    outcome: input.outcome,
    ledgerSequence: input.ledgerSequence,
    previousAuditFingerprint: input.previousAuditFingerprint,
    committedAt: input.outcome.completedAt,
  };
  return immutableCopy(
    DurableReasoningProviderOutcomeRecordSchema.parse({
      ...unsigned,
      recordFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

export function createFinalizationRecord(input: {
  readonly transactionId: string;
  readonly ownership: ReasoningInvocationOwnershipRecord;
  readonly resultEnvelope: FinalizedReasoningInvocationTransaction["resultEnvelope"];
  readonly consumptionEvidence: FinalizedReasoningInvocationTransaction["consumptionEvidence"];
  readonly ledgerSequence: number;
  readonly previousAuditFingerprint: string;
  readonly finalizedAt: string;
}) {
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "finalized-invocation-transaction" as const,
    transactionId: input.transactionId,
    ownershipId: input.ownership.ownershipId,
    invocationIdempotencyKey: input.ownership.invocationIdempotencyKey,
    invocationRequestId: input.ownership.invocationRequestId,
    invocationRequestFingerprint: input.ownership.invocationRequestFingerprint,
    resultEnvelope: input.resultEnvelope,
    consumptionEvidence: input.consumptionEvidence,
    ledgerSequence: input.ledgerSequence,
    previousAuditFingerprint: input.previousAuditFingerprint,
    committedAt: input.finalizedAt,
  };
  return immutableCopy(
    FinalizedReasoningInvocationTransactionSchema.parse({
      ...unsigned,
      transactionFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

export function createReasoningExecutionLedgerEvent(
  event:
    | {
        readonly eventType: "invocation-ownership";
        readonly ownership: ReasoningInvocationOwnershipRecord;
      }
    | {
        readonly eventType: "execution-attempt";
        readonly attemptRecord: ReturnType<typeof createExecutionAttemptRecord>;
      }
    | {
        readonly eventType: "provider-outcome";
        readonly outcomeRecord: ReturnType<typeof createProviderOutcomeRecord>;
      }
    | {
        readonly eventType: "invocation-finalization";
        readonly finalization: FinalizedReasoningInvocationTransaction;
      },
): ReasoningExecutionLedgerEvent {
  const nested =
    event.eventType === "invocation-ownership"
      ? event.ownership
      : event.eventType === "execution-attempt"
        ? event.attemptRecord
        : event.eventType === "provider-outcome"
          ? event.outcomeRecord
          : event.finalization;
  const unsigned = {
    schemaVersion: "1.0" as const,
    ...event,
    ledgerSequence: nested.ledgerSequence,
    previousAuditFingerprint: nested.previousAuditFingerprint,
  };
  return immutableCopy(
    ReasoningExecutionLedgerEventSchema.parse({
      ...unsigned,
      auditFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

export function verifyReasoningExecutionLedgerEvent(raw: unknown): ReasoningExecutionLedgerEvent {
  if (findDurableCanonicalJsonIssue(raw) !== null)
    throw new ReasoningExecutionLedgerIntegrityError(
      "invalid_raw_record",
      "Execution Ledger event is not accessor-safe canonical data",
    );
  const event = ReasoningExecutionLedgerEventSchema.parse(raw);
  requireFingerprint(event, "auditFingerprint", "Execution Ledger event");
  if (event.eventType === "invocation-ownership")
    requireFingerprint(event.ownership, "ownershipFingerprint", "Invocation ownership");
  else if (event.eventType === "execution-attempt") {
    requireFingerprint(event.attemptRecord, "recordFingerprint", "Attempt record");
    if (verifyReasoningExecutionAttempt(event.attemptRecord.attempt).status !== "valid")
      throw new ReasoningExecutionLedgerIntegrityError(
        "fingerprint_mismatch",
        "Attempt fingerprint does not verify",
      );
  } else if (event.eventType === "provider-outcome") {
    requireFingerprint(event.outcomeRecord, "recordFingerprint", "Provider Outcome record");
    if (verifyReasoningProviderOutcome(event.outcomeRecord.outcome).status !== "valid")
      throw new ReasoningExecutionLedgerIntegrityError(
        "fingerprint_mismatch",
        "Provider Outcome fingerprint does not verify",
      );
  } else if (event.eventType === "invocation-finalization")
    requireFingerprint(event.finalization, "transactionFingerprint", "Finalization transaction");
  return immutableCopy(event);
}

export function replayReasoningExecutionLedger(
  rawEvents: readonly unknown[],
  rawAuthorities: readonly ReasoningInvocationAuthority[],
): ReasoningExecutionLedgerReplayState {
  const events: ReasoningExecutionLedgerEvent[] = [];
  const ownershipByKey = new Map<string, ReasoningInvocationOwnershipRecord>();
  const requestsById = new Map<string, ReasoningInvocationRequest>();
  const authorityByInvocation = new Map<string, ReasoningInvocationAuthority>();
  const attemptsByInvocation = new Map<string, ReasoningExecutionAttempt[]>();
  const attemptsById = new Map<string, ReasoningExecutionAttempt>();
  const outcomesByAttemptId = new Map<string, ReasoningProviderOutcome>();
  const finalizationsByInvocation = new Map<string, FinalizedReasoningInvocationTransaction>();
  for (const rawAuthority of rawAuthorities) {
    if (
      findDurableCanonicalJsonIssue(rawAuthority) !== null ||
      !Number.isSafeInteger(rawAuthority.contextPackageObjectCount) ||
      rawAuthority.contextPackageObjectCount < 0 ||
      verifyReasoningInvocationRequest(rawAuthority.invocationRequest).status !== "valid" ||
      verifyReasoningProviderCapabilityDescriptor(rawAuthority.providerCapability).status !==
        "valid" ||
      authorityByInvocation.has(rawAuthority.invocationRequest.invocationRequestId)
    )
      throw new ReasoningExecutionLedgerIntegrityError(
        "invocation_binding_mismatch",
        "Invocation authority commitment is invalid or duplicated",
      );
    const authority = immutableCopy(rawAuthority);
    authorityByInvocation.set(authority.invocationRequest.invocationRequestId, authority);
    requestsById.set(authority.invocationRequest.invocationRequestId, authority.invocationRequest);
  }
  let previous: string = "genesis";
  for (const [index, raw] of rawEvents.entries()) {
    const event = verifyReasoningExecutionLedgerEvent(raw);
    if (event.ledgerSequence !== index + 1 || event.previousAuditFingerprint !== previous)
      throw new ReasoningExecutionLedgerIntegrityError(
        "audit_chain_broken",
        "Execution Ledger sequence or audit chain is invalid",
      );
    if (event.eventType === "invocation-ownership") {
      const owner = event.ownership;
      const authority = authorityByInvocation.get(owner.invocationRequestId);
      if (
        ownershipByKey.has(owner.invocationIdempotencyKey) ||
        authority === undefined ||
        authority.invocationRequest.requestFingerprint !== owner.invocationRequestFingerprint ||
        authority.invocationRequest.idempotencyKey !== owner.invocationIdempotencyKey
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "invocation_idempotency_conflict",
          "Invocation ownership is duplicated",
        );
      ownershipByKey.set(owner.invocationIdempotencyKey, owner);
    } else if (event.eventType === "execution-attempt") {
      const attempt = event.attemptRecord.attempt;
      const owner = ownershipByKey.get(attempt.invocationIdempotencyKey);
      const authority = authorityByInvocation.get(attempt.invocationRequestId);
      const attempts = attemptsByInvocation.get(attempt.invocationRequestId) ?? [];
      const priorOutcomes = attempts.map((entry) =>
        outcomesByAttemptId.get(entry.executionAttemptId),
      );
      if (
        owner === undefined ||
        authority === undefined ||
        attempt.providerCapabilityId !== authority.providerCapability.providerCapabilityId ||
        attempt.providerCapabilityFingerprint !==
          authority.providerCapability.descriptorFingerprint ||
        owner.invocationRequestId !== attempt.invocationRequestId ||
        owner.invocationRequestFingerprint !== attempt.invocationRequestFingerprint ||
        finalizationsByInvocation.has(attempt.invocationRequestId) ||
        attemptsById.has(attempt.executionAttemptId) ||
        priorOutcomes.some((outcome) => outcome === undefined) ||
        !verifyReasoningAttemptLifecycle({
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts: [...attempts, attempt],
          outcomes: priorOutcomes as ReasoningProviderOutcome[],
        })
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "attempt_order_invalid",
          "Execution Attempt ordering or ownership is invalid",
        );
      attempts.push(attempt);
      attemptsByInvocation.set(attempt.invocationRequestId, attempts);
      attemptsById.set(attempt.executionAttemptId, attempt);
    } else if (event.eventType === "provider-outcome") {
      const outcome = event.outcomeRecord.outcome;
      const attempt = attemptsById.get(outcome.executionAttemptId);
      const authority = authorityByInvocation.get(outcome.invocationRequestId);
      const attempts = attemptsByInvocation.get(outcome.invocationRequestId) ?? [];
      const candidateOutcomes = attempts.map((entry) =>
        entry.executionAttemptId === outcome.executionAttemptId
          ? outcome
          : outcomesByAttemptId.get(entry.executionAttemptId),
      );
      if (
        attempt === undefined ||
        authority === undefined ||
        outcomesByAttemptId.has(outcome.executionAttemptId) ||
        attempt.invocationRequestId !== outcome.invocationRequestId ||
        attempt.attemptNumber !== outcome.attemptNumber ||
        candidateOutcomes.some((entry) => entry === undefined) ||
        !verifyReasoningAttemptLifecycle({
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts,
          outcomes: candidateOutcomes as ReasoningProviderOutcome[],
        })
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "outcome_binding_mismatch",
          "Provider Outcome does not bind one open Attempt",
        );
      outcomesByAttemptId.set(outcome.executionAttemptId, outcome);
    } else if (event.eventType === "invocation-finalization") {
      const finalization = event.finalization;
      if (finalizationsByInvocation.has(finalization.invocationRequestId))
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_conflict",
          "Invocation has multiple finalizations",
        );
      const owner = ownershipByKey.get(finalization.invocationIdempotencyKey);
      const attempts = attemptsByInvocation.get(finalization.invocationRequestId) ?? [];
      const outcomes = attempts.map((attempt) =>
        outcomesByAttemptId.get(attempt.executionAttemptId),
      );
      if (
        owner === undefined ||
        owner.ownershipId !== finalization.ownershipId ||
        outcomes.some((outcome) => outcome === undefined)
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_incomplete",
          "Finalization lacks complete ownership or Attempt outcomes",
        );
      const authority = authorityByInvocation.get(finalization.invocationRequestId);
      const finalAttempt = attempts.at(-1)!;
      const finalOutcome = outcomes.at(-1)!;
      if (
        authority === undefined ||
        finalization.resultEnvelope.executionAttemptId !== finalAttempt.executionAttemptId ||
        finalization.resultEnvelope.resultEnvelopeFingerprint !==
          finalization.consumptionEvidence.finalResultEnvelopeFingerprint ||
        finalization.resultEnvelope.outcome !== finalOutcome!.status ||
        finalization.resultEnvelope.invocationRequestFingerprint !==
          authority.invocationRequest.requestFingerprint ||
        finalization.resultEnvelope.deliveryTransactionId !==
          authority.invocationRequest.deliveryTransactionId ||
        finalization.resultEnvelope.executionPolicyFingerprint !==
          authority.invocationRequest.executionPolicy.policyFingerprint
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_incomplete",
          "Final Result Envelope does not verify against recorded execution",
        );
      if (
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: finalization.consumptionEvidence,
          resultEnvelope: finalization.resultEnvelope,
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts,
          outcomes: outcomes as ReasoningProviderOutcome[],
          contextPackageObjectCount: authority.contextPackageObjectCount,
          executionLedgerTransactionId: finalization.transactionId,
        }).status !== "valid"
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_incomplete",
          "Finalized Consumption Evidence does not verify",
        );
      finalizationsByInvocation.set(finalization.invocationRequestId, finalization);
    } else {
      // Checkpoints are verified by their schema and audit chain and carry no replay authority.
    }
    previous = event.auditFingerprint;
    events.push(event);
  }
  if (authorityByInvocation.size !== ownershipByKey.size)
    throw new ReasoningExecutionLedgerIntegrityError(
      "invocation_binding_mismatch",
      "Invocation authority commitment has no matching ownership event",
    );
  return immutableCopy({
    events,
    ownershipByKey,
    requestsById,
    authorityByInvocation,
    attemptsByInvocation,
    attemptsById,
    outcomesByAttemptId,
    finalizationsByInvocation,
    lastSequence: events.length,
    lastAuditFingerprint: previous,
    executionEvidenceFingerprint: createDurableCanonicalJsonSha256Fingerprint(events),
  });
}

export function createReasoningExecutionDerivedIndex(
  state: ReasoningExecutionLedgerReplayState,
  entryCapacity = 10_000,
): DurableReasoningExecutionDerivedIndex {
  const invocationEntries = [...state.ownershipByKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-entryCapacity)
    .map(([key, owner]) => {
      const finalization = state.finalizationsByInvocation.get(owner.invocationRequestId);
      return {
        invocationIdempotencyKey: key,
        ownershipId: owner.ownershipId,
        invocationRequestId: owner.invocationRequestId,
        invocationRequestFingerprint: owner.invocationRequestFingerprint,
        status: finalization === undefined ? ("in-progress" as const) : ("finalized" as const),
        finalizationTransactionId: finalization?.transactionId ?? null,
      };
    });
  const attemptEntries = [...state.attemptsById.values()]
    .sort((a, b) =>
      a.invocationRequestId === b.invocationRequestId
        ? a.attemptNumber - b.attemptNumber
        : a.invocationRequestId < b.invocationRequestId
          ? -1
          : 1,
    )
    .slice(-entryCapacity)
    .map((attempt) => ({
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: attempt.invocationRequestId,
      attemptNumber: attempt.attemptNumber,
      outcomeFingerprint:
        state.outcomesByAttemptId.get(attempt.executionAttemptId)?.outcomeFingerprint ?? null,
    }));
  const resultEntries = [...state.finalizationsByInvocation.values()]
    .sort((a, b) => (a.invocationRequestId < b.invocationRequestId ? -1 : 1))
    .slice(-entryCapacity)
    .map((finalization) => ({
      invocationRequestId: finalization.invocationRequestId,
      resultEnvelopeId: finalization.resultEnvelope.resultEnvelopeId,
      resultEnvelopeFingerprint: finalization.resultEnvelope.resultEnvelopeFingerprint,
      consumptionId: finalization.consumptionEvidence.consumptionId,
    }));
  const unsigned = {
    schemaVersion: "1.0" as const,
    retentionPolicyVersion: "bounded-latest-v1" as const,
    entryCapacity,
    verifiedThroughSequence: state.lastSequence,
    verifiedAuditFingerprint: state.lastAuditFingerprint,
    invocationEntries,
    attemptEntries,
    resultEntries,
  };
  return immutableCopy(
    DurableReasoningExecutionDerivedIndexSchema.parse({
      ...unsigned,
      indexFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
    }),
  );
}

function indexStatus(
  raw: unknown,
  state: ReasoningExecutionLedgerReplayState,
): "current" | "invalid" | "missing" | "stale" {
  if (raw === null || raw === undefined) return "missing";
  const parsed = DurableReasoningExecutionDerivedIndexSchema.safeParse(raw);
  if (!parsed.success) return "invalid";
  try {
    requireFingerprint(parsed.data, "indexFingerprint", "Execution derived index");
  } catch {
    return "invalid";
  }
  if (
    parsed.data.verifiedThroughSequence !== state.lastSequence ||
    parsed.data.verifiedAuditFingerprint !== state.lastAuditFingerprint
  )
    return "stale";
  const expected = createReasoningExecutionDerivedIndex(state, parsed.data.entryCapacity);
  return expected.indexFingerprint === parsed.data.indexFingerprint ? "current" : "invalid";
}

export function recoverReasoningExecutionLedger(
  events: readonly unknown[],
  authorities: readonly ReasoningInvocationAuthority[],
  derivedIndex: unknown,
): ReasoningExecutionLedgerRecoveryResult {
  try {
    const state = replayReasoningExecutionLedger(events, authorities);
    const status = indexStatus(derivedIndex, state);
    const counts = countState(state);
    return ReasoningExecutionLedgerRecoveryResultSchema.parse({
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "recovered",
      ...counts,
      derivedIndexStatus: status === "current" ? "current" : "rebuilt",
      executionEvidenceFingerprint: state.executionEvidenceFingerprint,
      errors: [],
    });
  } catch {
    return ReasoningExecutionLedgerRecoveryResultSchema.parse({
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "failed",
      invocationOwnershipCount: 0,
      executionAttemptCount: 0,
      providerOutcomeCount: 0,
      finalizedInvocationCount: 0,
      finalizedConsumptionCount: 0,
      integrityCheckpointCount: 0,
      lastCommittedLedgerSequence: 0,
      lastAuditFingerprint: "genesis",
      derivedIndexStatus: "invalid",
      executionEvidenceFingerprint: null,
      errors: [
        {
          code: "invalid_raw_record",
          logicalLocation: "authoritative-ledger",
          message: "Reasoning Execution Ledger recovery failed",
        },
      ],
    });
  }
}

export function verifyReasoningExecutionLedgerIntegrity(
  events: readonly unknown[],
  authorities: readonly ReasoningInvocationAuthority[],
  derivedIndex: unknown,
): ReasoningExecutionLedgerIntegrityVerificationResult {
  try {
    const state = replayReasoningExecutionLedger(events, authorities);
    const counts = countState(state);
    return ReasoningExecutionLedgerIntegrityVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "valid",
      verifiedEventCount: state.lastSequence,
      verifiedInvocationCount: counts.invocationOwnershipCount,
      verifiedAttemptCount: counts.executionAttemptCount,
      verifiedOutcomeCount: counts.providerOutcomeCount,
      verifiedFinalizationCount: counts.finalizedInvocationCount,
      verifiedThroughSequence: state.lastSequence,
      lastAuditFingerprint: state.lastAuditFingerprint,
      executionEvidenceFingerprint: state.executionEvidenceFingerprint,
      derivedIndexStatus: indexStatus(derivedIndex, state),
      issues: [],
    });
  } catch {
    return ReasoningExecutionLedgerIntegrityVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "invalid",
      verifiedEventCount: 0,
      verifiedInvocationCount: 0,
      verifiedAttemptCount: 0,
      verifiedOutcomeCount: 0,
      verifiedFinalizationCount: 0,
      verifiedThroughSequence: 0,
      lastAuditFingerprint: "genesis",
      executionEvidenceFingerprint: null,
      derivedIndexStatus: "invalid",
      issues: [
        {
          code: "invalid_raw_record",
          logicalLocation: "authoritative-ledger",
          message: "Reasoning Execution Ledger integrity verification failed",
        },
      ],
    });
  }
}

function countState(state: ReasoningExecutionLedgerReplayState) {
  const integrityCheckpointCount = state.events.filter(
    (event) => event.eventType === "integrity-checkpoint",
  ).length;
  return {
    invocationOwnershipCount: state.ownershipByKey.size,
    executionAttemptCount: state.attemptsById.size,
    providerOutcomeCount: state.outcomesByAttemptId.size,
    finalizedInvocationCount: state.finalizationsByInvocation.size,
    finalizedConsumptionCount: state.finalizationsByInvocation.size,
    integrityCheckpointCount,
    lastCommittedLedgerSequence: state.lastSequence,
    lastAuditFingerprint: state.lastAuditFingerprint,
  };
}
