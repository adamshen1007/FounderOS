import {
  AppendReasoningExecutionAttemptRequestSchema,
  AppendReasoningProviderOutcomeRequestSchema,
  FinalizeReasoningInvocationRequestSchema,
  ReasoningExecutionLedgerDerivedIndexRebuildResultSchema,
  ReasoningExecutionLedgerHeadExpectationSchema,
  ReasoningInvocationFinalizationResultSchema,
  ReasoningInvocationOwnershipResolutionSchema,
  RegisterReasoningInvocationRequestSchema,
  type DurableReasoningExecutionLedger,
  type FinalizedReasoningConsumptionEvidence,
  type ReasoningExecutionAttempt,
  type ReasoningInvocationOwnershipRecord,
  type ReasoningInvocationRequest,
  type ReasoningProviderOutcome,
  type ReasoningProviderCapabilityDescriptor,
  type ReasoningResultEnvelope,
} from "@founderos/knowledge-schema";

import type {
  ReasoningExecutionLedgerStoragePort,
  ReasoningExecutionLedgerWriterPort,
} from "./reasoning-execution-ledger-port.js";
import {
  createExecutionAttemptRecord,
  createFinalizationRecord,
  createInvocationOwnershipRecord,
  createProviderOutcomeRecord,
  createReasoningExecutionDerivedIndex,
  createReasoningExecutionLedgerEvent,
  ReasoningExecutionLedgerConflictError,
  ReasoningExecutionLedgerIntegrityError,
  recoverReasoningExecutionLedger,
  verifyReasoningExecutionLedgerIntegrity,
} from "../domain/durable-reasoning-execution-ledger.js";
import { serializeCanonicalDurablePayload } from "../domain/durable-registry.js";
import {
  verifyFinalizedReasoningConsumptionEvidence,
  verifyReasoningExecutionAttempt,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderOutcome,
  verifyReasoningProviderCapabilityDescriptor,
  verifyReasoningAttemptLifecycle,
} from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
function same(left: unknown, right: unknown): boolean {
  return serializeCanonicalDurablePayload(left) === serializeCanonicalDurablePayload(right);
}

export interface GovernedReasoningExecutionEvidence extends DurableReasoningExecutionLedger {
  registerGovernedInvocation(
    raw: unknown,
    authority: {
      readonly providerCapability: ReasoningProviderCapabilityDescriptor;
      readonly contextPackageObjectCount: number;
    },
  ): ReturnType<DurableReasoningExecutionLedger["registerInvocation"]>;
}

export interface GovernedReasoningExecutionEvidenceReader {
  readInvocationRequest(invocationRequestId: string): Promise<ReasoningInvocationRequest | null>;
  readAttemptHistory(invocationRequestId: string): Promise<readonly ReasoningExecutionAttempt[]>;
  readProviderOutcome(executionAttemptId: string): Promise<ReasoningProviderOutcome | null>;
  readFinalizedResult(invocationRequestId: string): Promise<ReasoningResultEnvelope | null>;
  readFinalizedConsumptionEvidence(
    invocationRequestId: string,
  ): Promise<FinalizedReasoningConsumptionEvidence | null>;
  recover(): ReturnType<DurableReasoningExecutionLedger["recover"]>;
  verifyIntegrity(): ReturnType<DurableReasoningExecutionLedger["verifyIntegrity"]>;
  rebuildDerivedIndexes(): ReturnType<DurableReasoningExecutionLedger["rebuildDerivedIndexes"]>;
}

const INTERNAL_LEDGER = new WeakMap<object, GovernedReasoningExecutionEvidence>();

export function createSafeReasoningExecutionEvidenceReader(
  ledger: GovernedReasoningExecutionEvidence,
): GovernedReasoningExecutionEvidenceReader {
  const reader = Object.freeze({
    readInvocationRequest: (id: string) => ledger.readInvocationRequest(id),
    readAttemptHistory: (id: string) => ledger.readAttemptHistory(id),
    readProviderOutcome: (id: string) => ledger.readProviderOutcome(id),
    readFinalizedResult: (id: string) => ledger.readFinalizedResult(id),
    readFinalizedConsumptionEvidence: (id: string) => ledger.readFinalizedConsumptionEvidence(id),
    recover: () => ledger.recover(),
    verifyIntegrity: () => ledger.verifyIntegrity(),
    rebuildDerivedIndexes: () => ledger.rebuildDerivedIndexes(),
  });
  INTERNAL_LEDGER.set(reader, ledger);
  return reader;
}

export function resolveInternalReasoningExecutionEvidence(
  reader: GovernedReasoningExecutionEvidenceReader,
): GovernedReasoningExecutionEvidence {
  const ledger = INTERNAL_LEDGER.get(reader as object);
  if (ledger === undefined)
    throw new ReasoningExecutionLedgerIntegrityError(
      "unsafe_content",
      "Reasoning Execution Evidence runtime is not governed by FounderOS",
    );
  return ledger;
}

class PortGovernedReasoningExecutionEvidence implements GovernedReasoningExecutionEvidence {
  public constructor(private readonly storage: ReasoningExecutionLedgerStoragePort) {}

  public async registerInvocation(): Promise<never> {
    throw new ReasoningExecutionLedgerIntegrityError(
      "invocation_binding_mismatch",
      "Invocation registration requires governed Delivery authority",
    );
  }

  public async registerGovernedInvocation(
    raw: unknown,
    authorityInput: {
      readonly providerCapability: ReasoningProviderCapabilityDescriptor;
      readonly contextPackageObjectCount: number;
    },
  ) {
    const request = RegisterReasoningInvocationRequestSchema.parse(raw);
    if (
      verifyReasoningInvocationRequest(request.invocationRequest).status !== "valid" ||
      verifyReasoningProviderCapabilityDescriptor(authorityInput.providerCapability).status !==
        "valid" ||
      !Number.isSafeInteger(authorityInput.contextPackageObjectCount) ||
      authorityInput.contextPackageObjectCount < 0
    )
      throw new ReasoningExecutionLedgerIntegrityError(
        "fingerprint_mismatch",
        "Invocation Request does not verify",
      );
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const existing = state.replay.ownershipByKey.get(request.invocationRequest.idempotencyKey);
      if (existing !== undefined) {
        const existingAuthority = state.replay.authorityByInvocation.get(
          existing.invocationRequestId,
        );
        if (
          existing.invocationRequestFingerprint !== request.invocationRequest.requestFingerprint ||
          existingAuthority === undefined ||
          !same(existingAuthority.invocationRequest, request.invocationRequest) ||
          !same(existingAuthority.providerCapability, authorityInput.providerCapability) ||
          existingAuthority.contextPackageObjectCount !== authorityInput.contextPackageObjectCount
        )
          return ReasoningInvocationOwnershipResolutionSchema.parse({
            schemaVersion: "1.0",
            status: "conflict",
            reasonCode: "idempotency_key_conflict",
            existingInvocationRequestId: existing.invocationRequestId,
            existingInvocationRequestFingerprint: existing.invocationRequestFingerprint,
          });
        const finalization = state.replay.finalizationsByInvocation.get(
          existing.invocationRequestId,
        );
        return finalization === undefined
          ? ReasoningInvocationOwnershipResolutionSchema.parse({
              schemaVersion: "1.0",
              status: "identical-in-progress",
              reasonCode: "invocation_already_in_progress",
              ownership: existing,
            })
          : ReasoningInvocationOwnershipResolutionSchema.parse({
              schemaVersion: "1.0",
              status: "identical-finalized",
              reasonCode: "invocation_already_finalized",
              ownership: existing,
              finalization,
            });
      }
      requireHead(request.expectedLedgerHead, state.replay);
      const ownership = createInvocationOwnershipRecord({
        request: request.invocationRequest,
        ledgerSequence: state.replay.lastSequence + 1,
        previousAuditFingerprint: state.replay.lastAuditFingerprint,
        registeredAt: request.registeredAt,
      });
      const event = createReasoningExecutionLedgerEvent({
        eventType: "invocation-ownership",
        ownership,
      });
      await writer.appendAuthoritativeEvent(event, request.expectedLedgerHead, {
        invocationRequest: request.invocationRequest,
        providerCapability: authorityInput.providerCapability,
        contextPackageObjectCount: authorityInput.contextPackageObjectCount,
      });
      await replaceIndexBestEffort(writer);
      return ReasoningInvocationOwnershipResolutionSchema.parse({
        schemaVersion: "1.0",
        status: "registered",
        reasonCode: "invocation_registered",
        ownership,
      });
    });
  }

  public async appendExecutionAttempt(raw: unknown): Promise<ReasoningExecutionAttempt> {
    const request = AppendReasoningExecutionAttemptRequestSchema.parse(raw);
    if (verifyReasoningExecutionAttempt(request.attempt).status !== "valid")
      throw new ReasoningExecutionLedgerIntegrityError(
        "fingerprint_mismatch",
        "Execution Attempt does not verify",
      );
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const duplicate = state.replay.attemptsById.get(request.attempt.executionAttemptId);
      if (duplicate !== undefined) {
        if (!same(duplicate, request.attempt))
          throw new ReasoningExecutionLedgerConflictError(
            "transaction_conflict",
            "Attempt ID is already owned by different content",
          );
        return immutableCopy(duplicate);
      }
      const ownership = [...state.replay.ownershipByKey.values()].find(
        (candidate) => candidate.ownershipId === request.ownershipId,
      );
      const attempts =
        state.replay.attemptsByInvocation.get(request.attempt.invocationRequestId) ?? [];
      const authority = state.replay.authorityByInvocation.get(request.attempt.invocationRequestId);
      const priorOutcomes = attempts.map((attempt) =>
        state.replay.outcomesByAttemptId.get(attempt.executionAttemptId),
      );
      if (
        ownership === undefined ||
        authority === undefined ||
        state.replay.finalizationsByInvocation.has(ownership.invocationRequestId) ||
        ownership.invocationRequestId !== request.attempt.invocationRequestId ||
        ownership.invocationRequestFingerprint !== request.attempt.invocationRequestFingerprint ||
        ownership.invocationIdempotencyKey !== request.attempt.invocationIdempotencyKey ||
        attempts.length !== request.expectedPriorAttemptCount ||
        priorOutcomes.some((outcome) => outcome === undefined) ||
        !verifyReasoningAttemptLifecycle({
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts: [...attempts, request.attempt],
          outcomes: priorOutcomes as ReasoningProviderOutcome[],
        })
      )
        throw new ReasoningExecutionLedgerConflictError(
          "attempt_binding_mismatch",
          "Attempt does not bind the authoritative open Invocation",
        );
      requireHead(request.expectedLedgerHead, state.replay);
      const record = createExecutionAttemptRecord({
        attempt: request.attempt,
        ledgerSequence: state.replay.lastSequence + 1,
        previousAuditFingerprint: state.replay.lastAuditFingerprint,
      });
      await writer.appendAuthoritativeEvent(
        createReasoningExecutionLedgerEvent({
          eventType: "execution-attempt",
          attemptRecord: record,
        }),
        request.expectedLedgerHead,
      );
      await replaceIndexBestEffort(writer);
      return immutableCopy(request.attempt);
    });
  }

  public async appendProviderOutcome(raw: unknown): Promise<ReasoningProviderOutcome> {
    const request = AppendReasoningProviderOutcomeRequestSchema.parse(raw);
    if (verifyReasoningProviderOutcome(request.outcome).status !== "valid")
      throw new ReasoningExecutionLedgerIntegrityError(
        "fingerprint_mismatch",
        "Provider Outcome does not verify",
      );
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const duplicate = state.replay.outcomesByAttemptId.get(request.outcome.executionAttemptId);
      if (duplicate !== undefined) {
        if (!same(duplicate, request.outcome))
          throw new ReasoningExecutionLedgerConflictError(
            "transaction_conflict",
            "Attempt outcome is already finalized differently",
          );
        return immutableCopy(duplicate);
      }
      const ownership = [...state.replay.ownershipByKey.values()].find(
        (candidate) => candidate.ownershipId === request.ownershipId,
      );
      const attempt = state.replay.attemptsById.get(request.outcome.executionAttemptId);
      const authority =
        attempt === undefined
          ? undefined
          : state.replay.authorityByInvocation.get(attempt.invocationRequestId);
      const attempts =
        attempt === undefined
          ? []
          : (state.replay.attemptsByInvocation.get(attempt.invocationRequestId) ?? []);
      const candidateOutcomes = attempts.map((entry) =>
        entry.executionAttemptId === request.outcome.executionAttemptId
          ? request.outcome
          : state.replay.outcomesByAttemptId.get(entry.executionAttemptId),
      );
      if (
        ownership === undefined ||
        attempt === undefined ||
        authority === undefined ||
        state.replay.finalizationsByInvocation.has(ownership.invocationRequestId) ||
        attempt.attemptFingerprint !== request.attemptFingerprint ||
        attempt.invocationRequestId !== ownership.invocationRequestId ||
        attempt.attemptNumber !== request.outcome.attemptNumber ||
        candidateOutcomes.some((outcome) => outcome === undefined) ||
        !verifyReasoningAttemptLifecycle({
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts,
          outcomes: candidateOutcomes as ReasoningProviderOutcome[],
        })
      )
        throw new ReasoningExecutionLedgerConflictError(
          "outcome_binding_mismatch",
          "Provider Outcome does not bind the authoritative open Attempt",
        );
      requireHead(request.expectedLedgerHead, state.replay);
      const record = createProviderOutcomeRecord({
        outcome: request.outcome,
        ledgerSequence: state.replay.lastSequence + 1,
        previousAuditFingerprint: state.replay.lastAuditFingerprint,
      });
      await writer.appendAuthoritativeEvent(
        createReasoningExecutionLedgerEvent({
          eventType: "provider-outcome",
          outcomeRecord: record,
        }),
        request.expectedLedgerHead,
      );
      await replaceIndexBestEffort(writer);
      return immutableCopy(request.outcome);
    });
  }

  public async finalizeInvocation(raw: unknown) {
    const request = FinalizeReasoningInvocationRequestSchema.parse(raw);
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const ownership = [...state.replay.ownershipByKey.values()].find(
        (candidate) => candidate.ownershipId === request.ownershipId,
      );
      if (ownership === undefined)
        throw new ReasoningExecutionLedgerConflictError(
          "invocation_binding_mismatch",
          "Finalization has no Invocation owner",
        );
      const existing = state.replay.finalizationsByInvocation.get(ownership.invocationRequestId);
      if (existing !== undefined) {
        if (
          existing.transactionId === request.transactionId &&
          same(existing.resultEnvelope, request.resultEnvelope) &&
          same(existing.consumptionEvidence, request.consumptionEvidence)
        )
          return ReasoningInvocationFinalizationResultSchema.parse({
            schemaVersion: "1.0",
            status: "identical-finalization",
            finalization: existing,
          });
        return ReasoningInvocationFinalizationResultSchema.parse({
          schemaVersion: "1.0",
          status: "conflict",
          reasonCode: "conflicting_finalization",
          existingTransactionId: existing.transactionId,
          existingResultEnvelopeFingerprint: existing.resultEnvelope.resultEnvelopeFingerprint,
        });
      }
      const attempts = state.replay.attemptsByInvocation.get(ownership.invocationRequestId) ?? [];
      const authority = state.replay.authorityByInvocation.get(ownership.invocationRequestId);
      const outcomes = attempts.map((attempt) =>
        state.replay.outcomesByAttemptId.get(attempt.executionAttemptId),
      );
      if (
        attempts.length !== request.expectedAttemptCount ||
        authority === undefined ||
        outcomes.some((outcome) => outcome === undefined) ||
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: request.consumptionEvidence,
          resultEnvelope: request.resultEnvelope,
          invocationRequest: authority.invocationRequest,
          providerCapability: authority.providerCapability,
          attempts,
          outcomes: outcomes as ReasoningProviderOutcome[],
          contextPackageObjectCount: authority.contextPackageObjectCount,
          executionLedgerTransactionId: request.transactionId,
        }).status !== "valid"
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_incomplete",
          "Finalization evidence does not verify against authoritative Attempts",
        );
      const finalAttempt = attempts.at(-1)!;
      const finalOutcome = outcomes.at(-1)!;
      if (
        request.resultEnvelope.invocationRequestFingerprint !==
          ownership.invocationRequestFingerprint ||
        request.resultEnvelope.executionAttemptId !== finalAttempt.executionAttemptId ||
        request.resultEnvelope.outcome !== finalOutcome!.status
      )
        throw new ReasoningExecutionLedgerIntegrityError(
          "finalization_incomplete",
          "Final Result does not bind the terminal Attempt",
        );
      requireHead(request.expectedLedgerHead, state.replay);
      const finalization = createFinalizationRecord({
        transactionId: request.transactionId,
        ownership,
        resultEnvelope: request.resultEnvelope,
        consumptionEvidence: request.consumptionEvidence,
        ledgerSequence: state.replay.lastSequence + 1,
        previousAuditFingerprint: state.replay.lastAuditFingerprint,
        finalizedAt: request.finalizedAt,
      });
      await writer.appendAuthoritativeEvent(
        createReasoningExecutionLedgerEvent({ eventType: "invocation-finalization", finalization }),
        request.expectedLedgerHead,
      );
      await replaceIndexBestEffort(writer);
      return ReasoningInvocationFinalizationResultSchema.parse({
        schemaVersion: "1.0",
        status: "finalized",
        finalization,
      });
    });
  }

  public async resolveInvocationOwnership(
    key: string,
  ): Promise<ReasoningInvocationOwnershipRecord | null> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.ownershipByKey.get(key) ?? null,
    );
  }
  public async readInvocationRequest(id: string): Promise<ReasoningInvocationRequest | null> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.requestsById.get(id) ?? null,
    );
  }
  public async readAttemptHistory(id: string): Promise<readonly ReasoningExecutionAttempt[]> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.attemptsByInvocation.get(id) ?? [],
    );
  }
  public async readProviderOutcome(id: string): Promise<ReasoningProviderOutcome | null> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.outcomesByAttemptId.get(id) ?? null,
    );
  }
  public async readFinalizedResult(id: string): Promise<ReasoningResultEnvelope | null> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.finalizationsByInvocation.get(id)
        ?.resultEnvelope ?? null,
    );
  }
  public async readFinalizedConsumptionEvidence(
    id: string,
  ): Promise<FinalizedReasoningConsumptionEvidence | null> {
    return immutableCopy(
      (await this.storage.readVerifiedState()).replay.finalizationsByInvocation.get(id)
        ?.consumptionEvidence ?? null,
    );
  }
  public async recover() {
    const state = await this.storage.readVerifiedState();
    return recoverReasoningExecutionLedger(
      state.replay.events,
      [...state.replay.authorityByInvocation.values()],
      state.derivedIndex,
    );
  }
  public async verifyIntegrity() {
    const state = await this.storage.readVerifiedState();
    return verifyReasoningExecutionLedgerIntegrity(
      state.replay.events,
      [...state.replay.authorityByInvocation.values()],
      state.derivedIndex,
    );
  }
  public async rebuildDerivedIndexes() {
    return this.storage.withWriter(async (writer) => {
      try {
        const state = await writer.readVerifiedState();
        const index = createReasoningExecutionDerivedIndex(state.replay);
        await writer.replaceDerivedIndex(index);
        return ReasoningExecutionLedgerDerivedIndexRebuildResultSchema.parse({
          schemaVersion: "1.0",
          status: "rebuilt",
          verifiedThroughSequence: state.replay.lastSequence,
          indexFingerprint: index.indexFingerprint,
          invocationEntryCount: index.invocationEntries.length,
          attemptEntryCount: index.attemptEntries.length,
          resultEntryCount: index.resultEntries.length,
          issues: [],
        });
      } catch {
        return ReasoningExecutionLedgerDerivedIndexRebuildResultSchema.parse({
          schemaVersion: "1.0",
          status: "failed",
          verifiedThroughSequence: 0,
          indexFingerprint: null,
          invocationEntryCount: 0,
          attemptEntryCount: 0,
          resultEntryCount: 0,
          issues: [
            {
              code: "storage_failure",
              logicalLocation: "derived-index",
              message: "Execution Ledger index rebuild failed",
            },
          ],
        });
      }
    });
  }
}

function requireHead(
  expected: { readonly ledgerSequence: number; readonly auditFingerprint: string },
  state: { readonly lastSequence: number; readonly lastAuditFingerprint: string },
): void {
  if (
    expected.ledgerSequence !== state.lastSequence ||
    expected.auditFingerprint !== state.lastAuditFingerprint
  )
    throw new ReasoningExecutionLedgerConflictError(
      "audit_chain_broken",
      "Expected Execution Ledger head is stale",
    );
}
async function replaceIndexBestEffort(writer: ReasoningExecutionLedgerWriterPort): Promise<void> {
  try {
    const next = await writer.readVerifiedState();
    await writer.replaceDerivedIndex(createReasoningExecutionDerivedIndex(next.replay));
  } catch {
    /* authoritative append remains committed */
  }
}
export function createGovernedReasoningExecutionEvidence(
  storage: ReasoningExecutionLedgerStoragePort,
): GovernedReasoningExecutionEvidence {
  return new PortGovernedReasoningExecutionEvidence(storage);
}
export function emptyReasoningExecutionLedgerHead() {
  return ReasoningExecutionLedgerHeadExpectationSchema.parse({
    ledgerSequence: 0,
    auditFingerprint: "genesis",
  });
}
