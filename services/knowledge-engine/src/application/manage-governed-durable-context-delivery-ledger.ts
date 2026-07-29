import {
  ContextDeliveryFreshnessEvidenceSchema,
  ContextDeliveryPolicyDecisionEvidenceSchema,
  DeliveryLedgerDerivedIndexRebuildResultSchema,
  DurableDeliveryLedgerHeadExpectationSchema,
  findDurableCanonicalJsonIssue,
  GovernedContextDeliveryRequestSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type AtomicDeliveryTransactionRequest,
  type CommittedDeliveryTransactionRecord,
  type ContextDeliveryFreshnessEvidence,
  type ContextDeliveryPolicyDecisionEvidence,
  type DeliveryLedgerDerivedIndexRebuildResult,
  type DurableContextDeliveryLedger,
  type DurableIdempotencyOwnershipRecord,
  type DurableReplayAttemptRecord,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliverySuccess,
} from "@founderos/knowledge-schema";

import type { GovernedHistoricalSnapshotRegistry } from "./manage-governed-durable-snapshot-registry.js";
import type {
  DurableDeliveryLedgerStoragePort,
  DurableDeliveryLedgerWriterPort,
} from "./durable-context-delivery-ledger-port.js";
import {
  createCommittedDeliveryTransaction,
  createDurableDeliveryDerivedIndex,
  createDurableReplayAttempt,
  evaluateDurableReplayAttempt,
  createOriginalDeliveryLedgerEvent,
  createReplayAttemptLedgerEvent,
  DurableDeliveryLedgerConflictError,
  DurableDeliveryLedgerIntegrityError,
  originalDeliveryResult,
  recoverDeliveryLedger,
  verifyDeliveryLedgerIntegrity,
  verifyDurableDeliveryDerivedIndex,
} from "../domain/durable-context-delivery-ledger.js";
import {
  verifyGovernedContextDeliveryEnvelope,
  type VerifyGovernedContextDeliveryEnvelopeInput,
} from "../domain/context-delivery.js";
import { serializeCanonicalDurablePayload } from "../domain/durable-registry.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

const REPLAY_INPUT_FIELDS = [
  "replayAttemptId",
  "request",
  "policyDecisionEvidence",
  "freshnessEvidence",
  "currentActiveSnapshotEvidence",
  "registry",
  "expectedLedgerHead",
  "evaluatedAt",
] as const;
const REPLAY_INPUT_FIELD_SET = new Set<string>(REPLAY_INPUT_FIELDS);

function captureCommitInput(
  input: CommitVerifiedOriginalDeliveryInput,
): CommitVerifiedOriginalDeliveryInput {
  if (
    typeof input !== "object" ||
    input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Original Delivery commit input must be a plain record",
    );
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== 2 ||
    keys.some((key) =>
      typeof key === "string" ? !["transaction", "envelopeVerification"].includes(key) : true,
    ) ||
    [descriptors.transaction, descriptors.envelopeVerification].some(
      (descriptor) =>
        descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable,
    ) ||
    findDurableCanonicalJsonIssue(input) !== null
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Original Delivery commit input must contain only accessor-free governed fields",
    );
  return immutableCopy(input);
}

function captureReplayInput(
  input: SubmitDurableReplayAttemptInput,
): SubmitDurableReplayAttemptInput {
  if (typeof input !== "object" || input === null)
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Replay input must be a plain record",
    );
  const prototype = Object.getPrototypeOf(input);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    keys.some((key) => typeof key !== "string" || !REPLAY_INPUT_FIELD_SET.has(key)) ||
    keys.length !== REPLAY_INPUT_FIELDS.length
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Replay input must contain only the governed replay fields",
    );
  for (const field of REPLAY_INPUT_FIELDS) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      throw new DurableDeliveryLedgerIntegrityError(
        "invalid_raw_record",
        "Replay input must contain accessor-free canonical data",
      );
  }
  const data = Object.fromEntries(
    REPLAY_INPUT_FIELDS.filter((field) => field !== "registry").map((field) => [
      field,
      descriptors[field]!.value,
    ]),
  );
  if (findDurableCanonicalJsonIssue(data) !== null)
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Replay input must contain accessor-free canonical data",
    );
  return Object.freeze({
    ...(immutableCopy(data) as Omit<SubmitDurableReplayAttemptInput, "registry">),
    registry: descriptors.registry!.value as GovernedHistoricalSnapshotRegistry,
  });
}

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function envelopeArtifact(transaction: CommittedDeliveryTransactionRecord) {
  return transaction.artifacts.find((record) => record.artifactType === "delivery-envelope")!;
}

function acknowledgmentArtifact(transaction: CommittedDeliveryTransactionRecord) {
  return transaction.artifacts.find((record) => record.artifactType === "consumer-acknowledgment")!;
}

function transactionMatchesInput(
  transaction: CommittedDeliveryTransactionRecord,
  input: AtomicDeliveryTransactionRequest,
): boolean {
  return (
    transaction.transactionId === input.transactionId &&
    transaction.committedAt === input.committedAt &&
    transaction.ledgerSequence === input.expectedLedgerHead.ledgerSequence + 1 &&
    transaction.previousAuditFingerprint === input.expectedLedgerHead.auditFingerprint &&
    serializeCanonicalDurablePayload(transaction.requestRegistration.request) ===
      serializeCanonicalDurablePayload(input.request) &&
    serializeCanonicalDurablePayload(originalDeliveryResult(transaction)) ===
      serializeCanonicalDurablePayload(input.deliveryResult)
  );
}

function replayAttemptMatchesInput(
  attempt: DurableReplayAttemptRecord,
  input: SubmitDurableReplayAttemptInput,
): boolean {
  return (
    attempt.replayAttemptId === input.replayAttemptId &&
    attempt.attemptedAt === input.evaluatedAt &&
    attempt.ledgerSequence === input.expectedLedgerHead.ledgerSequence + 1 &&
    attempt.previousAuditFingerprint === input.expectedLedgerHead.auditFingerprint &&
    serializeCanonicalDurablePayload(attempt.replayRequest) ===
      serializeCanonicalDurablePayload(input.request) &&
    serializeCanonicalDurablePayload(attempt.currentPolicyDecisionEvidence) ===
      serializeCanonicalDurablePayload(input.policyDecisionEvidence) &&
    serializeCanonicalDurablePayload(attempt.currentFreshnessEvidence) ===
      serializeCanonicalDurablePayload(input.freshnessEvidence) &&
    serializeCanonicalDurablePayload(attempt.currentActiveSnapshotEvidence) ===
      serializeCanonicalDurablePayload(input.currentActiveSnapshotEvidence)
  );
}

async function verifyCurrentReplayRegistry(input: SubmitDurableReplayAttemptInput): Promise<void> {
  const integrity = RegistryIntegrityResultSchema.parse(await input.registry.verifyIntegrity());
  const recovery = RegistryRecoveryResultSchema.parse(await input.registry.recover());
  if (
    integrity.status !== "valid" ||
    recovery.status !== "recovered" ||
    recovery.activeSnapshotId === null ||
    integrity.integrityFingerprint !==
      input.currentActiveSnapshotEvidence.registryIntegrityFingerprint ||
    recovery.activeSnapshotId !== input.currentActiveSnapshotEvidence.snapshotId
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Replay current Active Snapshot evidence does not match the durable Registry",
    );
  const activationHistory = await input.registry.getActivationHistory();
  if (findDurableCanonicalJsonIssue(activationHistory) !== null)
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Replay activation history must contain accessor-free canonical data",
    );
  const currentActivation = activationHistory
    .filter(
      (record) =>
        record.resultingActiveSnapshotId === input.currentActiveSnapshotEvidence.snapshotId,
    )
    .sort((left, right) => right.sequence - left.sequence)[0];
  if (
    currentActivation === undefined ||
    currentActivation.sequence !== input.currentActiveSnapshotEvidence.activationSequence
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Replay activation evidence does not match durable activation history",
    );
}

export interface CommitVerifiedOriginalDeliveryInput {
  readonly transaction: AtomicDeliveryTransactionRequest;
  readonly envelopeVerification: VerifyGovernedContextDeliveryEnvelopeInput;
}

export interface SubmitDurableReplayAttemptInput {
  readonly replayAttemptId: string;
  readonly request: GovernedContextDeliveryRequest;
  readonly policyDecisionEvidence: ContextDeliveryPolicyDecisionEvidence;
  readonly freshnessEvidence: ContextDeliveryFreshnessEvidence;
  readonly currentActiveSnapshotEvidence: DurableReplayAttemptRecord["currentActiveSnapshotEvidence"];
  readonly registry: GovernedHistoricalSnapshotRegistry;
  readonly expectedLedgerHead: {
    readonly ledgerSequence: number;
    readonly auditFingerprint: string;
  };
  readonly evaluatedAt: string;
}

export interface GovernedDurableContextDeliveryLedger extends DurableContextDeliveryLedger {
  commitVerifiedOriginalDelivery(
    input: CommitVerifiedOriginalDeliveryInput,
  ): Promise<GovernedContextDeliverySuccess>;
  submitReplayAttempt(input: SubmitDurableReplayAttemptInput): Promise<{
    readonly attempt: DurableReplayAttemptRecord;
    readonly originalResult: GovernedContextDeliverySuccess | null;
  }>;
}

class PortGovernedDurableContextDeliveryLedger implements GovernedDurableContextDeliveryLedger {
  public constructor(private readonly storage: DurableDeliveryLedgerStoragePort) {}

  public async commitVerifiedOriginalDelivery(
    input: CommitVerifiedOriginalDeliveryInput,
  ): Promise<GovernedContextDeliverySuccess> {
    input = captureCommitInput(input);
    const transactionInput = input.transaction;
    const verification = input.envelopeVerification;
    if (
      verifyGovernedContextDeliveryEnvelope(verification).status !== "valid" ||
      serializeCanonicalDurablePayload(verification.request) !==
        serializeCanonicalDurablePayload(transactionInput.request) ||
      serializeCanonicalDurablePayload(verification.envelope) !==
        serializeCanonicalDurablePayload(transactionInput.deliveryResult.envelope) ||
      verification.evaluatedAt !== transactionInput.deliveryResult.envelope.createdAt
    )
      throw new DurableDeliveryLedgerIntegrityError(
        "artifact_binding_mismatch",
        "Original Delivery failed independent Milestone 11 verification",
      );
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const existingTransaction = state.replay.transactionsById.get(transactionInput.transactionId);
      if (existingTransaction !== undefined) {
        if (!transactionMatchesInput(existingTransaction, transactionInput))
          throw new DurableDeliveryLedgerConflictError(
            "transaction_conflict",
            "Transaction ID is already committed with different canonical content",
          );
        return originalDeliveryResult(existingTransaction);
      }
      const existingOwnership = state.replay.ownershipByKey.get(
        transactionInput.request.idempotencyKey,
      );
      if (existingOwnership !== undefined) {
        if (
          existingOwnership.deliveryRequestFingerprint !==
          transactionInput.request.requestFingerprint
        )
          throw new DurableDeliveryLedgerConflictError(
            "idempotency_conflict",
            "Idempotency key is permanently owned by a different canonical Request",
          );
        const original = state.replay.transactionsById.get(
          existingOwnership.originalDeliveryTransactionId,
        );
        if (original === undefined)
          throw new DurableDeliveryLedgerIntegrityError(
            "transaction_incomplete",
            "Idempotency ownership references no complete original Delivery",
          );
        return originalDeliveryResult(original);
      }
      if (
        transactionInput.expectedLedgerHead.ledgerSequence !== state.replay.lastSequence ||
        transactionInput.expectedLedgerHead.auditFingerprint !== state.replay.lastAuditFingerprint
      )
        throw new DurableDeliveryLedgerConflictError(
          "audit_chain_broken",
          "Expected Delivery Ledger head is stale",
        );
      const transaction = createCommittedDeliveryTransaction(transactionInput);
      const event = createOriginalDeliveryLedgerEvent(transaction);
      await writer.appendAuthoritativeEvent(event, transactionInput.expectedLedgerHead);
      const nextState = await writer.readVerifiedState();
      try {
        await writer.replaceDerivedIndex(createDurableDeliveryDerivedIndex(nextState.replay));
      } catch {
        // The authoritative commit is already durable. Recovery reports and rebuilds derived state.
      }
      return originalDeliveryResult(transaction);
    });
  }

  public async submitReplayAttempt(input: SubmitDurableReplayAttemptInput): Promise<{
    readonly attempt: DurableReplayAttemptRecord;
    readonly originalResult: GovernedContextDeliverySuccess | null;
  }> {
    input = captureReplayInput(input);
    return this.storage.withWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const request = GovernedContextDeliveryRequestSchema.parse(input.request);
      const policy = ContextDeliveryPolicyDecisionEvidenceSchema.parse(
        input.policyDecisionEvidence,
      );
      const freshness = ContextDeliveryFreshnessEvidenceSchema.parse(input.freshnessEvidence);
      const ownership = state.replay.ownershipByKey.get(request.idempotencyKey);
      if (ownership === undefined)
        throw new DurableDeliveryLedgerConflictError(
          "idempotency_conflict",
          "Replay requires an existing durable idempotency owner",
        );
      const original = state.replay.transactionsById.get(ownership.originalDeliveryTransactionId);
      if (original === undefined)
        throw new DurableDeliveryLedgerIntegrityError(
          "transaction_incomplete",
          "Replay ownership references no complete original Delivery",
        );
      const existingAttempt = state.replay.replayAttemptsById.get(input.replayAttemptId);
      if (existingAttempt !== undefined) {
        if (!replayAttemptMatchesInput(existingAttempt, input))
          throw new DurableDeliveryLedgerConflictError(
            "artifact_conflict",
            "Replay Attempt ID is already committed with different canonical content",
          );
        return immutableCopy({
          attempt: existingAttempt,
          originalResult:
            existingAttempt.outcome === "accepted-original-result"
              ? originalDeliveryResult(original)
              : null,
        });
      }
      await verifyCurrentReplayRegistry(input);
      const { outcome, replayClassification, reasonCodes } = evaluateDurableReplayAttempt({
        originalTransaction: original,
        request,
        policyDecisionEvidence: policy,
        freshnessEvidence: freshness,
        currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
        evaluatedAt: input.evaluatedAt,
      });
      const attempt = createDurableReplayAttempt({
        replayAttemptId: input.replayAttemptId,
        originalTransaction: original,
        request,
        policyDecisionEvidence: policy,
        freshnessEvidence: freshness,
        currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
        replayClassification,
        outcome,
        reasonCodes,
        attemptedAt: input.evaluatedAt,
        expectedLedgerHead: input.expectedLedgerHead,
      });
      if (
        input.expectedLedgerHead.ledgerSequence !== state.replay.lastSequence ||
        input.expectedLedgerHead.auditFingerprint !== state.replay.lastAuditFingerprint
      )
        throw new DurableDeliveryLedgerConflictError(
          "audit_chain_broken",
          "Expected Delivery Ledger head is stale",
        );
      const event = createReplayAttemptLedgerEvent(attempt);
      await writer.appendAuthoritativeEvent(event, input.expectedLedgerHead);
      const nextState = await writer.readVerifiedState();
      try {
        await writer.replaceDerivedIndex(createDurableDeliveryDerivedIndex(nextState.replay));
      } catch {
        // Authoritative replay evidence is committed independently of its derived lookup.
      }
      return immutableCopy({
        attempt,
        originalResult:
          outcome === "accepted-original-result" ? originalDeliveryResult(original) : null,
      });
    });
  }

  public async resolveDeliveryRequest(deliveryRequestId: string) {
    const state = await this.storage.readVerifiedState();
    return immutableCopy(state.replay.requestsById.get(deliveryRequestId)?.request ?? null);
  }

  public async resolveIdempotencyOwnership(
    idempotencyKey: string,
  ): Promise<DurableIdempotencyOwnershipRecord | null> {
    const state = await this.storage.readVerifiedState();
    return immutableCopy(state.replay.ownershipByKey.get(idempotencyKey) ?? null);
  }

  public async readOriginalDeliveryResult(transactionId: string) {
    const state = await this.storage.readVerifiedState();
    const transaction = state.replay.transactionsById.get(transactionId);
    return transaction === undefined ? null : originalDeliveryResult(transaction);
  }

  public async readDeliveryEnvelope(envelopeId: string) {
    const state = await this.storage.readVerifiedState();
    const artifact = state.replay.artifactsById.get(envelopeId);
    return artifact?.artifactType === "delivery-envelope"
      ? (immutableCopy(artifact.artifact) as ReturnType<
          typeof import("@founderos/knowledge-schema").GovernedContextDeliveryEnvelopeSchema.parse
        >)
      : null;
  }

  public async readAcknowledgment(envelopeId: string) {
    const state = await this.storage.readVerifiedState();
    const transaction = state.replay.transactions.find(
      (candidate) => envelopeArtifact(candidate).artifactId === envelopeId,
    );
    return transaction === undefined
      ? null
      : (immutableCopy(acknowledgmentArtifact(transaction).artifact) as ReturnType<
          typeof import("@founderos/knowledge-schema").ContextConsumerAcknowledgmentSchema.parse
        >);
  }

  public async readReceipt(receiptId: string) {
    const state = await this.storage.readVerifiedState();
    const artifact = state.replay.artifactsById.get(receiptId);
    return artifact?.artifactType === "delivery-receipt"
      ? (immutableCopy(artifact.artifact) as ReturnType<
          typeof import("@founderos/knowledge-schema").ContextDeliveryReceiptSchema.parse
        >)
      : null;
  }

  public async readReplayHistory(originalTransactionId: string) {
    const state = await this.storage.readVerifiedState();
    return immutableCopy(
      state.replay.replayAttempts
        .filter((attempt) => attempt.originalDeliveryTransactionId === originalTransactionId)
        .sort((left, right) => left.ledgerSequence - right.ledgerSequence),
    );
  }

  public async listCommittedOriginalDeliveries() {
    const state = await this.storage.readVerifiedState();
    return immutableCopy(
      [...state.replay.transactions].sort((left, right) =>
        binaryCompare(left.transactionId, right.transactionId),
      ),
    );
  }

  public async recover() {
    try {
      const state = await this.storage.readVerifiedState();
      return recoverDeliveryLedger(state.replay.events, state.derivedIndex);
    } catch (error) {
      return recoverDeliveryLedger([error], null);
    }
  }

  public async verifyIntegrity() {
    try {
      const state = await this.storage.readVerifiedState();
      return verifyDeliveryLedgerIntegrity(state.replay.events, state.derivedIndex);
    } catch (error) {
      return verifyDeliveryLedgerIntegrity([error], null);
    }
  }

  public async rebuildDerivedIndexes(): Promise<DeliveryLedgerDerivedIndexRebuildResult> {
    return this.storage.withWriter(async (writer: DurableDeliveryLedgerWriterPort) => {
      try {
        const state = await writer.readVerifiedState();
        const index = createDurableDeliveryDerivedIndex(state.replay);
        const current = verifyDurableDeliveryDerivedIndex(state.derivedIndex, state.replay);
        if (current !== "current") await writer.replaceDerivedIndex(index);
        return DeliveryLedgerDerivedIndexRebuildResultSchema.parse({
          schemaVersion: "1.0",
          status: current === "current" ? "unchanged" : "rebuilt",
          verifiedThroughSequence: state.replay.lastSequence,
          indexFingerprint: index.indexFingerprint,
          requestEntryCount: index.requestEntries.length,
          idempotencyEntryCount: index.idempotencyEntries.length,
          replayEntryCount: index.replayEntries.length,
          issues: [],
        });
      } catch {
        return DeliveryLedgerDerivedIndexRebuildResultSchema.parse({
          schemaVersion: "1.0",
          status: "failed",
          verifiedThroughSequence: 0,
          indexFingerprint: null,
          requestEntryCount: 0,
          idempotencyEntryCount: 0,
          replayEntryCount: 0,
          issues: [
            {
              code: "storage_failure",
              logicalLocation: "derived-index",
              message: "Delivery Ledger derived-index rebuild failed",
            },
          ],
        });
      }
    });
  }
}

export function createGovernedDurableContextDeliveryLedger(
  storage: DurableDeliveryLedgerStoragePort,
): GovernedDurableContextDeliveryLedger {
  return new PortGovernedDurableContextDeliveryLedger(storage);
}

export function emptyDeliveryLedgerHead() {
  return DurableDeliveryLedgerHeadExpectationSchema.parse({
    ledgerSequence: 0,
    auditFingerprint: "genesis",
  });
}
