import {
  AtomicDeliveryTransactionRequestSchema,
  CommittedDeliveryTransactionRecordSchema,
  ContextConsumerAcknowledgmentSchema,
  ContextDeliveryFreshnessEvidenceSchema,
  ContextDeliveryPolicyDecisionEvidenceSchema,
  ContextDeliveryReceiptSchema,
  DeliveryLedgerIntegrityVerificationResultSchema,
  DeliveryLedgerRecoveryResultSchema,
  DurableDeliveryArtifactRecordSchema,
  DurableDeliveryDerivedIndexSchema,
  DurableDeliveryExpirationEvidenceSchema,
  DurableDeliveryLedgerEventSchema,
  DurableDeliveryRequestRegistrationRecordSchema,
  DurableIdempotencyOwnershipRecordSchema,
  DurableReplayAttemptRecordSchema,
  GovernedContextDeliveryEnvelopeSchema,
  GovernedContextDeliveryRequestSchema,
  GovernedContextDeliverySuccessSchema,
  findDurableCanonicalJsonIssue,
  type AtomicDeliveryTransactionRequest,
  type CommittedDeliveryTransactionRecord,
  type DeliveryLedgerIntegrityVerificationResult,
  type DeliveryLedgerRecoveryResult,
  type DurableDeliveryArtifactRecord,
  type DurableDeliveryDerivedIndex,
  type DurableDeliveryLedgerEvent,
  type DurableDeliveryLedgerIssue,
  type DurableDeliveryRequestRegistrationRecord,
  type DurableIdempotencyOwnershipRecord,
  type DurableReplayAttemptRecord,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliverySuccess,
} from "@founderos/knowledge-schema";

import { createCanonicalSha256Fingerprint } from "./canonical-fingerprint.js";
import {
  verifyContextConsumerDescriptor,
  verifyContextDeliveryFreshnessEvidence,
  verifyContextDeliveryPolicyDecisionEvidence,
  verifyContextDeliveryReceipt,
  verifyGovernedContextDeliveryRequest,
  findUnsafeContextDeliveryContent,
} from "./context-delivery.js";
import { serializeCanonicalDurablePayload } from "./durable-registry.js";
import { createKnowledgeContextFingerprint } from "./knowledge-context.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

export class DurableDeliveryLedgerError extends Error {
  public constructor(
    public readonly code: DurableDeliveryLedgerIssue["code"],
    message: string,
  ) {
    super(message);
    this.name = "DurableDeliveryLedgerError";
  }
}

export class DurableDeliveryLedgerConflictError extends DurableDeliveryLedgerError {}
export class DurableDeliveryLedgerIntegrityError extends DurableDeliveryLedgerError {
  public constructor(
    code: DurableDeliveryLedgerIssue["code"],
    message: string,
    public readonly progress: DurableDeliveryLedgerProgress = EMPTY_PROGRESS,
  ) {
    super(code, message);
    this.name = "DurableDeliveryLedgerIntegrityError";
  }
}

export interface DurableDeliveryLedgerProgress {
  readonly eventCount: number;
  readonly originalTransactionCount: number;
  readonly replayAttemptCount: number;
  readonly lastSequence: number;
  readonly lastAuditFingerprint: "genesis" | string;
}

const EMPTY_PROGRESS: DurableDeliveryLedgerProgress = {
  eventCount: 0,
  originalTransactionCount: 0,
  replayAttemptCount: 0,
  lastSequence: 0,
  lastAuditFingerprint: "genesis",
};

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function withoutField(value: object, field: string): Record<string, unknown> {
  const copy = { ...(value as Record<string, unknown>) };
  delete copy[field];
  return copy;
}

function fingerprintWithout(value: object, field: string): string {
  return createCanonicalSha256Fingerprint(withoutField(value, field));
}

function ensureCanonical(input: unknown, label: string): void {
  if (findDurableCanonicalJsonIssue(input) !== null)
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      `${label} must contain only finite accessor-safe canonical data`,
    );
}

function requireFingerprint(value: object, field: string, label: string): void {
  const stored = (value as Record<string, unknown>)[field];
  if (typeof stored !== "string" || fingerprintWithout(value, field) !== stored)
    throw new DurableDeliveryLedgerIntegrityError(
      "fingerprint_mismatch",
      `${label} fingerprint does not verify`,
    );
}

function requireMilestone11ArtifactFingerprint(
  value: object,
  fingerprintField: string,
  label: string,
  idField?: string,
  idPrefix?: string,
): void {
  const record = value as Record<string, unknown>;
  const stored = record[fingerprintField];
  const unsigned = { ...record };
  delete unsigned[fingerprintField];
  if (idField !== undefined) delete unsigned[idField];
  if (
    typeof stored !== "string" ||
    createCanonicalSha256Fingerprint(unsigned) !== stored ||
    (idField !== undefined && record[idField] !== `${idPrefix ?? ""}${stored}`)
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "fingerprint_mismatch",
      `${label} fingerprint does not verify`,
    );
}

function artifactIdentity(record: DurableDeliveryArtifactRecord): {
  readonly id: string;
  readonly fingerprint: string;
} {
  switch (record.artifactType) {
    case "delivery-envelope": {
      const artifact = GovernedContextDeliveryEnvelopeSchema.parse(record.artifact);
      return { id: artifact.deliveryEnvelopeId, fingerprint: artifact.deliveryFingerprint };
    }
    case "consumer-acknowledgment": {
      const artifact = ContextConsumerAcknowledgmentSchema.parse(record.artifact);
      return {
        id: `acknowledgment-${artifact.acknowledgmentFingerprint}`,
        fingerprint: artifact.acknowledgmentFingerprint,
      };
    }
    case "delivery-receipt": {
      const artifact = ContextDeliveryReceiptSchema.parse(record.artifact);
      return { id: artifact.receiptId, fingerprint: artifact.receiptFingerprint };
    }
    case "consumption-evidence": {
      const artifact = record.artifact as { consumptionId: string; consumptionFingerprint: string };
      return { id: artifact.consumptionId, fingerprint: artifact.consumptionFingerprint };
    }
    case "replay-evidence": {
      const artifact = record.artifact as { replayFingerprint: string };
      return {
        id: `replay-evidence-${artifact.replayFingerprint}`,
        fingerprint: artifact.replayFingerprint,
      };
    }
  }
}

function fingerprintFieldForArtifact(record: DurableDeliveryArtifactRecord): string {
  switch (record.artifactType) {
    case "delivery-envelope":
      return "deliveryFingerprint";
    case "consumer-acknowledgment":
      return "acknowledgmentFingerprint";
    case "delivery-receipt":
      return "receiptFingerprint";
    case "consumption-evidence":
      return "consumptionFingerprint";
    case "replay-evidence":
      return "replayFingerprint";
  }
}

function verifyContextPackageLocal(
  envelope: ReturnType<typeof GovernedContextDeliveryEnvelopeSchema.parse>,
): void {
  const contextPackage = envelope.contextPackage;
  const {
    contextPackageId: _id,
    contextFingerprint: _fingerprint,
    assembledAt: _assembledAt,
    ...identity
  } = contextPackage;
  void _id;
  void _fingerprint;
  void _assembledAt;
  const expected = createKnowledgeContextFingerprint(identity);
  if (
    expected !== contextPackage.contextFingerprint ||
    contextPackage.contextPackageId !== `context-${expected}`
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Embedded Context Package identity does not verify",
    );
}

function verifyAcknowledgment(
  acknowledgment: ReturnType<typeof ContextConsumerAcknowledgmentSchema.parse>,
): void {
  requireFingerprint(acknowledgment, "acknowledgmentFingerprint", "Consumer Acknowledgment");
}

export function verifyOriginalDeliveryArtifacts(input: {
  readonly request: unknown;
  readonly result: unknown;
}): {
  readonly request: GovernedContextDeliveryRequest;
  readonly result: GovernedContextDeliverySuccess;
} {
  ensureCanonical(input.request, "Delivery Request");
  ensureCanonical(input.result, "Delivery Result");
  if (
    findUnsafeContextDeliveryContent(input.request) !== null ||
    findUnsafeContextDeliveryContent(input.result) !== null
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "unsafe_content",
      "Durable Delivery artifacts cannot contain physical paths or credential-bearing content",
    );
  const request = GovernedContextDeliveryRequestSchema.parse(input.request);
  const result = GovernedContextDeliverySuccessSchema.parse(input.result);
  if (
    verifyGovernedContextDeliveryRequest(request).status !== "valid" ||
    verifyContextConsumerDescriptor(request.consumer).status !== "valid"
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Delivery Request or Consumer Descriptor does not verify",
    );
  const envelope = result.envelope;
  requireMilestone11ArtifactFingerprint(
    envelope,
    "deliveryFingerprint",
    "Delivery Envelope",
    "deliveryEnvelopeId",
    "delivery-",
  );
  verifyContextPackageLocal(envelope);
  if (
    verifyContextDeliveryPolicyDecisionEvidence({
      evidence: envelope.policyDecisionEvidence,
      request,
    }).status !== "valid"
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Policy Decision Evidence does not bind the Delivery Request",
    );
  requireFingerprint(envelope.compatibility, "compatibilityFingerprint", "Compatibility Result");
  requireFingerprint(envelope.freshnessEvidence, "freshnessFingerprint", "Freshness Evidence");
  verifyAcknowledgment(result.acknowledgment);
  if (
    verifyContextDeliveryReceipt({
      receipt: result.receipt,
      envelope,
      acknowledgment: result.acknowledgment,
      receivedAt: result.receipt.receivedAt,
    }).status !== "valid"
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Delivery Receipt does not bind the Envelope and Acknowledgment",
    );
  if (
    envelope.deliveryRequestId !== request.deliveryRequestId ||
    envelope.deliveryRequestFingerprint !== request.requestFingerprint ||
    envelope.contextPackageId !== request.contextPackageId ||
    envelope.contextPackageFingerprint !== request.contextPackageFingerprint ||
    envelope.consumerId !== request.consumer.consumerId ||
    envelope.consumerDescriptorFingerprint !== request.consumerDescriptorFingerprint ||
    envelope.idempotencyKey !== request.idempotencyKey ||
    serializeCanonicalDurablePayload(envelope.replayPolicy) !==
      serializeCanonicalDurablePayload(request.replayPolicy)
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Delivery Envelope does not exactly bind the authoritative Request",
    );
  return immutableCopy({ request, result });
}

function createExpirationEvidence(
  request: GovernedContextDeliveryRequest,
  committedAt: string,
): ReturnType<typeof DurableDeliveryExpirationEvidenceSchema.parse> {
  const unsigned = {
    schemaVersion: "1.0" as const,
    policyVersion: "permanent-reservation-v1" as const,
    status: "active" as const,
    expiresAt: request.freshnessPolicy.expiresAt ?? null,
    evaluatedAt: committedAt,
  };
  return DurableDeliveryExpirationEvidenceSchema.parse({
    ...unsigned,
    evidenceFingerprint: createCanonicalSha256Fingerprint(unsigned),
  });
}

function createRegistration(
  request: GovernedContextDeliveryRequest,
  transactionId: string,
  ledgerSequence: number,
  previousAuditFingerprint: string,
  committedAt: string,
): DurableDeliveryRequestRegistrationRecord {
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "delivery_request_registration" as const,
    registrationId: `request-registration-${request.deliveryRequestId}`,
    transactionId,
    deliveryRequestId: request.deliveryRequestId,
    deliveryRequestFingerprint: request.requestFingerprint,
    request,
    ledgerSequence,
    previousAuditFingerprint,
    committedAt,
  };
  return DurableDeliveryRequestRegistrationRecordSchema.parse({
    ...unsigned,
    recordFingerprint: createCanonicalSha256Fingerprint(unsigned),
  });
}

function createOwnership(
  request: GovernedContextDeliveryRequest,
  result: GovernedContextDeliverySuccess,
  transactionId: string,
  ledgerSequence: number,
  previousAuditFingerprint: string,
  committedAt: string,
): DurableIdempotencyOwnershipRecord {
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "idempotency_ownership" as const,
    ownershipId: `idempotency-ownership-${createCanonicalSha256Fingerprint(request.idempotencyKey)}`,
    transactionId,
    idempotencyKey: request.idempotencyKey,
    deliveryRequestFingerprint: request.requestFingerprint,
    deliveryRequestId: request.deliveryRequestId,
    originalDeliveryTransactionId: transactionId,
    originalEnvelopeId: result.envelope.deliveryEnvelopeId,
    originalEnvelopeFingerprint: result.envelope.deliveryFingerprint,
    originalReceiptId: result.receipt.receiptId,
    originalReceiptFingerprint: result.receipt.receiptFingerprint,
    replayPolicy: request.replayPolicy,
    freshnessPolicy: request.freshnessPolicy,
    expirationEvidence: createExpirationEvidence(request, committedAt),
    ownershipSequence: ledgerSequence,
    createdAt: committedAt,
    ledgerSequence,
    previousAuditFingerprint,
    committedAt,
  };
  return DurableIdempotencyOwnershipRecordSchema.parse({
    ...unsigned,
    ownershipFingerprint: createCanonicalSha256Fingerprint(unsigned),
  });
}

function createArtifact(
  artifactType: DurableDeliveryArtifactRecord["artifactType"],
  artifact: unknown,
  artifactId: string,
  artifactFingerprint: string,
  transactionId: string,
  ledgerSequence: number,
  previousAuditFingerprint: string,
  committedAt: string,
): DurableDeliveryArtifactRecord {
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "delivery_artifact" as const,
    artifactType,
    artifactId,
    artifactContractVersion: "1.0" as const,
    artifact,
    artifactFingerprint,
    transactionId,
    ledgerSequence,
    previousAuditFingerprint,
    committedAt,
  };
  return DurableDeliveryArtifactRecordSchema.parse({
    ...unsigned,
    recordFingerprint: createCanonicalSha256Fingerprint(unsigned),
  });
}

export function createCommittedDeliveryTransaction(
  rawInput: AtomicDeliveryTransactionRequest,
): CommittedDeliveryTransactionRecord {
  ensureCanonical(rawInput, "Atomic Delivery transaction request");
  const input = AtomicDeliveryTransactionRequestSchema.parse(rawInput);
  const verified = verifyOriginalDeliveryArtifacts({
    request: input.request,
    result: input.deliveryResult,
  });
  const ledgerSequence = input.expectedLedgerHead.ledgerSequence + 1;
  if (!Number.isSafeInteger(ledgerSequence))
    throw new DurableDeliveryLedgerConflictError(
      "sequence_invalid",
      "Delivery Ledger sequence is exhausted",
    );
  const previousAuditFingerprint = input.expectedLedgerHead.auditFingerprint;
  const envelope = verified.result.envelope;
  const acknowledgment = verified.result.acknowledgment;
  const receipt = verified.result.receipt;
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "committed_delivery_transaction" as const,
    transactionId: input.transactionId,
    ledgerSequence,
    previousAuditFingerprint,
    requestRegistration: createRegistration(
      verified.request,
      input.transactionId,
      ledgerSequence,
      previousAuditFingerprint,
      input.committedAt,
    ),
    idempotencyOwnership: createOwnership(
      verified.request,
      verified.result,
      input.transactionId,
      ledgerSequence,
      previousAuditFingerprint,
      input.committedAt,
    ),
    artifacts: [
      createArtifact(
        "delivery-envelope",
        envelope,
        envelope.deliveryEnvelopeId,
        envelope.deliveryFingerprint,
        input.transactionId,
        ledgerSequence,
        previousAuditFingerprint,
        input.committedAt,
      ),
      createArtifact(
        "consumer-acknowledgment",
        acknowledgment,
        `acknowledgment-${acknowledgment.acknowledgmentFingerprint}`,
        acknowledgment.acknowledgmentFingerprint,
        input.transactionId,
        ledgerSequence,
        previousAuditFingerprint,
        input.committedAt,
      ),
      createArtifact(
        "delivery-receipt",
        receipt,
        receipt.receiptId,
        receipt.receiptFingerprint,
        input.transactionId,
        ledgerSequence,
        previousAuditFingerprint,
        input.committedAt,
      ),
    ],
    committedAt: input.committedAt,
  };
  return immutableCopy(
    CommittedDeliveryTransactionRecordSchema.parse({
      ...unsigned,
      transactionFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export function createOriginalDeliveryLedgerEvent(
  transaction: CommittedDeliveryTransactionRecord,
): DurableDeliveryLedgerEvent {
  const parsed = CommittedDeliveryTransactionRecordSchema.parse(transaction);
  const unsigned = {
    schemaVersion: "1.0" as const,
    eventType: "original-delivery" as const,
    ledgerSequence: parsed.ledgerSequence,
    previousAuditFingerprint: parsed.previousAuditFingerprint,
    transaction: parsed,
  };
  return immutableCopy(
    DurableDeliveryLedgerEventSchema.parse({
      ...unsigned,
      auditFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export interface CreateDurableReplayAttemptInput {
  readonly replayAttemptId: string;
  readonly originalTransaction: CommittedDeliveryTransactionRecord;
  readonly request: GovernedContextDeliveryRequest;
  readonly policyDecisionEvidence: ReturnType<
    typeof ContextDeliveryPolicyDecisionEvidenceSchema.parse
  >;
  readonly freshnessEvidence: ReturnType<typeof ContextDeliveryFreshnessEvidenceSchema.parse>;
  readonly currentActiveSnapshotEvidence: DurableReplayAttemptRecord["currentActiveSnapshotEvidence"];
  readonly replayClassification: DurableReplayAttemptRecord["replayClassification"];
  readonly outcome: DurableReplayAttemptRecord["outcome"];
  readonly reasonCodes: DurableReplayAttemptRecord["reasonCodes"];
  readonly attemptedAt: string;
  readonly expectedLedgerHead: {
    readonly ledgerSequence: number;
    readonly auditFingerprint: string;
  };
}

export interface DurableReplayEvaluation {
  readonly replayClassification: DurableReplayAttemptRecord["replayClassification"];
  readonly outcome: DurableReplayAttemptRecord["outcome"];
  readonly reasonCodes: DurableReplayAttemptRecord["reasonCodes"];
}

export function evaluateDurableReplayAttempt(input: {
  readonly originalTransaction: CommittedDeliveryTransactionRecord;
  readonly request: GovernedContextDeliveryRequest;
  readonly policyDecisionEvidence: ReturnType<
    typeof ContextDeliveryPolicyDecisionEvidenceSchema.parse
  >;
  readonly freshnessEvidence: ReturnType<typeof ContextDeliveryFreshnessEvidenceSchema.parse>;
  readonly currentActiveSnapshotEvidence: DurableReplayAttemptRecord["currentActiveSnapshotEvidence"];
  readonly evaluatedAt: string;
}): DurableReplayEvaluation {
  const ownership = input.originalTransaction.idempotencyOwnership;
  const requestConflict = ownership.deliveryRequestFingerprint !== input.request.requestFingerprint;
  const policyValid =
    verifyContextDeliveryPolicyDecisionEvidence({
      evidence: input.policyDecisionEvidence,
      request: input.request,
    }).status === "valid";
  const freshnessValid =
    verifyContextDeliveryFreshnessEvidence({
      evidence: input.freshnessEvidence,
      request: input.request,
      policyDecision: input.policyDecisionEvidence,
      contextPackage: originalDeliveryResult(input.originalTransaction).envelope.contextPackage,
      currentActiveSnapshotId: input.currentActiveSnapshotEvidence.snapshotId,
      currentActivationSequence: input.currentActiveSnapshotEvidence.activationSequence,
      evaluatedAt: input.evaluatedAt,
    }).status === "valid";
  if (requestConflict)
    return {
      outcome: "rejected-idempotency-conflict",
      replayClassification: "rejected-replay",
      reasonCodes: ["idempotency_key_conflict"],
    };
  if (!policyValid || input.policyDecisionEvidence.outcome !== "allowed")
    return {
      outcome: "rejected-policy",
      replayClassification: "rejected-replay",
      reasonCodes: [
        input.policyDecisionEvidence.outcome === "review-required"
          ? "policy_review_required"
          : input.policyDecisionEvidence.outcome === "not-evaluated"
            ? "policy_not_evaluated"
            : "policy_denied",
      ],
    };
  if (
    ownership.freshnessPolicy.expiresAt !== undefined &&
    Date.parse(input.evaluatedAt) >= Date.parse(ownership.freshnessPolicy.expiresAt)
  )
    return {
      outcome: "rejected-expired",
      replayClassification: "rejected-replay",
      reasonCodes: ["delivery_expired"],
    };
  if (!freshnessValid || input.freshnessEvidence.status !== "fresh")
    return {
      outcome: "rejected-freshness",
      replayClassification: "rejected-replay",
      reasonCodes: input.freshnessEvidence.reasonCodes.includes("newer_active_snapshot")
        ? ["newer_active_snapshot"]
        : input.freshnessEvidence.reasonCodes.includes("historical_replay_not_allowed")
          ? ["historical_replay_not_allowed"]
          : ["freshness_rejected"],
    };
  if (ownership.replayPolicy.mode === "single-delivery")
    return {
      outcome: "rejected-single-delivery",
      replayClassification: "rejected-replay",
      reasonCodes: ["single_delivery_replay_rejected"],
    };
  if (ownership.replayPolicy.mode === "evaluation-only")
    return {
      outcome: "evaluation-only",
      replayClassification: "evaluation-replay",
      reasonCodes: ["evaluation_only"],
    };
  return {
    outcome: "accepted-original-result",
    replayClassification: "identical-replay",
    reasonCodes: ["original_result_replayed"],
  };
}

export function createDurableReplayAttempt(
  input: CreateDurableReplayAttemptInput,
): DurableReplayAttemptRecord {
  const original = verifyCommittedDeliveryTransaction(input.originalTransaction);
  const request = GovernedContextDeliveryRequestSchema.parse(input.request);
  if (verifyGovernedContextDeliveryRequest(request).status !== "valid")
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Replay Delivery Request does not verify",
    );
  const policy = ContextDeliveryPolicyDecisionEvidenceSchema.parse(input.policyDecisionEvidence);
  if (verifyContextDeliveryPolicyDecisionEvidence({ evidence: policy, request }).status !== "valid")
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Replay Policy Decision Evidence does not verify",
    );
  const evaluation = evaluateDurableReplayAttempt({
    originalTransaction: original,
    request,
    policyDecisionEvidence: policy,
    freshnessEvidence: input.freshnessEvidence,
    currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
    evaluatedAt: input.attemptedAt,
  });
  if (
    evaluation.outcome !== input.outcome ||
    evaluation.replayClassification !== input.replayClassification ||
    serializeCanonicalDurablePayload(evaluation.reasonCodes) !==
      serializeCanonicalDurablePayload([...input.reasonCodes].sort())
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "contradictory_replay",
      "Replay outcome does not match its current Policy, Freshness, and ownership evidence",
    );
  const envelope = original.artifacts.find(
    (record) => record.artifactType === "delivery-envelope",
  )!;
  const receipt = original.artifacts.find((record) => record.artifactType === "delivery-receipt")!;
  const ledgerSequence = input.expectedLedgerHead.ledgerSequence + 1;
  const unsigned = {
    schemaVersion: "1.0" as const,
    recordType: "replay_attempt" as const,
    replayAttemptId: input.replayAttemptId,
    originalDeliveryTransactionId: original.transactionId,
    idempotencyKey: request.idempotencyKey,
    replayRequest: request,
    replayRequestFingerprint: request.requestFingerprint,
    originalEnvelopeId: envelope.artifactId,
    originalEnvelopeFingerprint: envelope.artifactFingerprint,
    originalReceiptId: receipt.artifactId,
    originalReceiptFingerprint: receipt.artifactFingerprint,
    currentPolicyDecisionEvidence: policy,
    currentPolicyDecisionFingerprint: policy.decisionFingerprint,
    currentFreshnessEvidence: input.freshnessEvidence,
    currentFreshnessFingerprint: input.freshnessEvidence.freshnessFingerprint,
    currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
    replayPolicy: request.replayPolicy,
    replayClassification: input.replayClassification,
    outcome: input.outcome,
    reasonCodes: [...input.reasonCodes].sort(),
    expirationEvidence:
      input.outcome === "rejected-expired"
        ? (() => {
            const expiresAt = original.idempotencyOwnership.freshnessPolicy.expiresAt;
            if (expiresAt === undefined)
              throw new DurableDeliveryLedgerIntegrityError(
                "expiration_inconsistent",
                "Expired Replay requires original expiration evidence",
              );
            const expirationUnsigned = {
              schemaVersion: "1.0" as const,
              policyVersion: "permanent-reservation-v1" as const,
              status: "expired-permanently-reserved" as const,
              expiresAt,
              evaluatedAt: input.attemptedAt,
            };
            return DurableDeliveryExpirationEvidenceSchema.parse({
              ...expirationUnsigned,
              evidenceFingerprint: createCanonicalSha256Fingerprint(expirationUnsigned),
            });
          })()
        : null,
    attemptedAt: input.attemptedAt,
    ledgerSequence,
    previousAuditFingerprint: input.expectedLedgerHead.auditFingerprint,
    committedAt: input.attemptedAt,
  };
  return immutableCopy(
    DurableReplayAttemptRecordSchema.parse({
      ...unsigned,
      replayAttemptFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export function createReplayAttemptLedgerEvent(
  replayAttempt: DurableReplayAttemptRecord,
): DurableDeliveryLedgerEvent {
  const parsed = DurableReplayAttemptRecordSchema.parse(replayAttempt);
  const unsigned = {
    schemaVersion: "1.0" as const,
    eventType: "replay-attempt" as const,
    ledgerSequence: parsed.ledgerSequence,
    previousAuditFingerprint: parsed.previousAuditFingerprint,
    replayAttempt: parsed,
  };
  return immutableCopy(
    DurableDeliveryLedgerEventSchema.parse({
      ...unsigned,
      auditFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

function verifyArtifactRecord(raw: unknown): DurableDeliveryArtifactRecord {
  ensureCanonical(raw, "Durable Delivery Artifact record");
  const record = DurableDeliveryArtifactRecordSchema.parse(raw);
  requireFingerprint(record, "recordFingerprint", "Durable Delivery Artifact record");
  const identity = artifactIdentity(record);
  if (identity.id !== record.artifactId || identity.fingerprint !== record.artifactFingerprint)
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Durable Artifact wrapper does not bind its embedded artifact",
    );
  if (record.artifactType === "delivery-envelope")
    requireMilestone11ArtifactFingerprint(
      record.artifact as object,
      "deliveryFingerprint",
      "Embedded delivery-envelope",
      "deliveryEnvelopeId",
      "delivery-",
    );
  else if (record.artifactType === "delivery-receipt")
    requireMilestone11ArtifactFingerprint(
      record.artifact as object,
      "receiptFingerprint",
      "Embedded delivery-receipt",
      "receiptId",
      "receipt-",
    );
  else
    requireFingerprint(
      record.artifact as object,
      fingerprintFieldForArtifact(record),
      `Embedded ${record.artifactType}`,
    );
  return record;
}

export function verifyCommittedDeliveryTransaction(
  raw: unknown,
): CommittedDeliveryTransactionRecord {
  ensureCanonical(raw, "Committed Delivery transaction");
  const transaction = CommittedDeliveryTransactionRecordSchema.parse(raw);
  requireFingerprint(transaction, "transactionFingerprint", "Committed Delivery transaction");
  requireFingerprint(
    transaction.requestRegistration,
    "recordFingerprint",
    "Delivery Request registration",
  );
  requireFingerprint(
    transaction.idempotencyOwnership,
    "ownershipFingerprint",
    "Idempotency ownership",
  );
  const artifacts = transaction.artifacts.map(verifyArtifactRecord);
  const envelope = GovernedContextDeliveryEnvelopeSchema.parse(
    artifacts.find((record) => record.artifactType === "delivery-envelope")!.artifact,
  );
  const acknowledgment = ContextConsumerAcknowledgmentSchema.parse(
    artifacts.find((record) => record.artifactType === "consumer-acknowledgment")!.artifact,
  );
  const receipt = ContextDeliveryReceiptSchema.parse(
    artifacts.find((record) => record.artifactType === "delivery-receipt")!.artifact,
  );
  const result = GovernedContextDeliverySuccessSchema.parse({
    schemaVersion: "1.0",
    status: "delivered",
    envelope,
    acknowledgment,
    receipt,
  });
  verifyOriginalDeliveryArtifacts({ request: transaction.requestRegistration.request, result });
  const ownership = transaction.idempotencyOwnership;
  const request = transaction.requestRegistration.request;
  if (
    ownership.deliveryRequestId !== transaction.requestRegistration.deliveryRequestId ||
    ownership.deliveryRequestFingerprint !==
      transaction.requestRegistration.deliveryRequestFingerprint ||
    ownership.originalEnvelopeId !== envelope.deliveryEnvelopeId ||
    ownership.originalEnvelopeFingerprint !== envelope.deliveryFingerprint ||
    ownership.originalReceiptId !== receipt.receiptId ||
    ownership.originalReceiptFingerprint !== receipt.receiptFingerprint ||
    ownership.idempotencyKey !== request.idempotencyKey ||
    serializeCanonicalDurablePayload(ownership.replayPolicy) !==
      serializeCanonicalDurablePayload(request.replayPolicy) ||
    serializeCanonicalDurablePayload(ownership.freshnessPolicy) !==
      serializeCanonicalDurablePayload(request.freshnessPolicy)
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Idempotency ownership does not bind the original Delivery artifacts",
    );
  requireFingerprint(ownership.expirationEvidence, "evidenceFingerprint", "Expiration evidence");
  return immutableCopy(transaction);
}

export function verifyDurableReplayAttempt(raw: unknown): DurableReplayAttemptRecord {
  ensureCanonical(raw, "Replay Attempt record");
  const attempt = DurableReplayAttemptRecordSchema.parse(raw);
  requireFingerprint(attempt, "replayAttemptFingerprint", "Replay Attempt record");
  if (
    verifyGovernedContextDeliveryRequest(attempt.replayRequest).status !== "valid" ||
    verifyContextDeliveryPolicyDecisionEvidence({
      evidence: attempt.currentPolicyDecisionEvidence,
      request: attempt.replayRequest,
    }).status !== "valid"
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "artifact_binding_mismatch",
      "Replay Request or current Policy evidence does not verify",
    );
  requireFingerprint(
    attempt.currentFreshnessEvidence,
    "freshnessFingerprint",
    "Replay Freshness evidence",
  );
  if (attempt.expirationEvidence !== null)
    requireFingerprint(
      attempt.expirationEvidence,
      "evidenceFingerprint",
      "Replay expiration evidence",
    );
  return immutableCopy(attempt);
}

export function verifyDurableDeliveryLedgerEvent(raw: unknown): DurableDeliveryLedgerEvent {
  ensureCanonical(raw, "Delivery Ledger event");
  const event = DurableDeliveryLedgerEventSchema.parse(raw);
  requireFingerprint(event, "auditFingerprint", "Delivery Ledger event");
  const nested =
    event.eventType === "original-delivery"
      ? verifyCommittedDeliveryTransaction(event.transaction)
      : verifyDurableReplayAttempt(event.replayAttempt);
  if (
    nested.ledgerSequence !== event.ledgerSequence ||
    nested.previousAuditFingerprint !== event.previousAuditFingerprint
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "audit_chain_broken",
      "Delivery Ledger event and nested record chain positions differ",
    );
  return immutableCopy(event);
}

export interface DurableDeliveryLedgerReplayState {
  readonly events: readonly DurableDeliveryLedgerEvent[];
  readonly transactions: readonly CommittedDeliveryTransactionRecord[];
  readonly replayAttempts: readonly DurableReplayAttemptRecord[];
  readonly transactionsById: ReadonlyMap<string, CommittedDeliveryTransactionRecord>;
  readonly requestsById: ReadonlyMap<string, DurableDeliveryRequestRegistrationRecord>;
  readonly ownershipByKey: ReadonlyMap<string, DurableIdempotencyOwnershipRecord>;
  readonly artifactsById: ReadonlyMap<string, DurableDeliveryArtifactRecord>;
  readonly replayAttemptsById: ReadonlyMap<string, DurableReplayAttemptRecord>;
  readonly lastSequence: number;
  readonly lastAuditFingerprint: "genesis" | string;
  readonly ledgerIntegrityFingerprint: string;
}

export const DURABLE_DELIVERY_DERIVED_INDEX_CAPACITY = 1_024;

function progress(state: {
  events: readonly DurableDeliveryLedgerEvent[];
  transactions: readonly CommittedDeliveryTransactionRecord[];
  replayAttempts: readonly DurableReplayAttemptRecord[];
  lastSequence: number;
  lastAuditFingerprint: string;
}): DurableDeliveryLedgerProgress {
  return {
    eventCount: state.events.length,
    originalTransactionCount: state.transactions.length,
    replayAttemptCount: state.replayAttempts.length,
    lastSequence: state.lastSequence,
    lastAuditFingerprint: state.lastAuditFingerprint,
  };
}

export function replayDurableDeliveryLedger(
  rawEvents: readonly unknown[],
): DurableDeliveryLedgerReplayState {
  const events: DurableDeliveryLedgerEvent[] = [];
  const transactions: CommittedDeliveryTransactionRecord[] = [];
  const replayAttempts: DurableReplayAttemptRecord[] = [];
  const transactionsById = new Map<string, CommittedDeliveryTransactionRecord>();
  const requestsById = new Map<string, DurableDeliveryRequestRegistrationRecord>();
  const ownershipByKey = new Map<string, DurableIdempotencyOwnershipRecord>();
  const artifactsById = new Map<string, DurableDeliveryArtifactRecord>();
  const replayAttemptsById = new Map<string, DurableReplayAttemptRecord>();
  let lastSequence = 0;
  let lastAuditFingerprint: string = "genesis";
  for (const raw of rawEvents) {
    let event: DurableDeliveryLedgerEvent;
    try {
      event = verifyDurableDeliveryLedgerEvent(raw);
    } catch (error) {
      if (error instanceof DurableDeliveryLedgerIntegrityError)
        throw new DurableDeliveryLedgerIntegrityError(
          error.code,
          error.message,
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      throw error;
    }
    if (
      event.ledgerSequence !== lastSequence + 1 ||
      event.previousAuditFingerprint !== lastAuditFingerprint
    )
      throw new DurableDeliveryLedgerIntegrityError(
        event.ledgerSequence <= lastSequence ? "sequence_invalid" : "audit_chain_broken",
        "Delivery Ledger sequence or previous-audit link is invalid",
        progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
      );
    if (event.eventType === "original-delivery") {
      const transaction = event.transaction;
      const existingTransaction = transactionsById.get(transaction.transactionId);
      if (existingTransaction !== undefined)
        throw new DurableDeliveryLedgerIntegrityError(
          "transaction_conflict",
          "A committed transaction ID appears more than once",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      const registration = transaction.requestRegistration;
      if (requestsById.has(registration.deliveryRequestId))
        throw new DurableDeliveryLedgerIntegrityError(
          "request_conflict",
          "A Delivery Request ID appears more than once",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      if (ownershipByKey.has(transaction.idempotencyOwnership.idempotencyKey))
        throw new DurableDeliveryLedgerIntegrityError(
          "idempotency_conflict",
          "An idempotency key has conflicting durable ownership",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      for (const artifact of transaction.artifacts) {
        if (artifactsById.has(artifact.artifactId))
          throw new DurableDeliveryLedgerIntegrityError(
            "artifact_conflict",
            "A durable Delivery artifact ID appears more than once",
            progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
          );
        artifactsById.set(artifact.artifactId, artifact);
      }
      transactions.push(transaction);
      transactionsById.set(transaction.transactionId, transaction);
      requestsById.set(registration.deliveryRequestId, registration);
      ownershipByKey.set(
        transaction.idempotencyOwnership.idempotencyKey,
        transaction.idempotencyOwnership,
      );
    } else {
      const attempt = event.replayAttempt;
      const original = transactionsById.get(attempt.originalDeliveryTransactionId);
      if (original === undefined)
        throw new DurableDeliveryLedgerIntegrityError(
          "orphan_replay_attempt",
          "Replay Attempt references no committed original Delivery",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      if (replayAttemptsById.has(attempt.replayAttemptId))
        throw new DurableDeliveryLedgerIntegrityError(
          "artifact_conflict",
          "A Replay Attempt ID appears more than once",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      const ownership = original.idempotencyOwnership;
      if (
        attempt.idempotencyKey !== ownership.idempotencyKey ||
        attempt.originalEnvelopeId !== ownership.originalEnvelopeId ||
        attempt.originalEnvelopeFingerprint !== ownership.originalEnvelopeFingerprint ||
        attempt.originalReceiptId !== ownership.originalReceiptId ||
        attempt.originalReceiptFingerprint !== ownership.originalReceiptFingerprint
      )
        throw new DurableDeliveryLedgerIntegrityError(
          "contradictory_replay",
          "Replay Attempt does not bind the original durable Delivery",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      const expectedReplay = evaluateDurableReplayAttempt({
        originalTransaction: original,
        request: attempt.replayRequest,
        policyDecisionEvidence: attempt.currentPolicyDecisionEvidence,
        freshnessEvidence: attempt.currentFreshnessEvidence,
        currentActiveSnapshotEvidence: attempt.currentActiveSnapshotEvidence,
        evaluatedAt: attempt.attemptedAt,
      });
      if (
        expectedReplay.outcome !== attempt.outcome ||
        expectedReplay.replayClassification !== attempt.replayClassification ||
        serializeCanonicalDurablePayload(expectedReplay.reasonCodes) !==
          serializeCanonicalDurablePayload(attempt.reasonCodes)
      )
        throw new DurableDeliveryLedgerIntegrityError(
          "contradictory_replay",
          "Replay Attempt outcome contradicts its durable Policy, Freshness, or ownership evidence",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      if (
        attempt.outcome === "accepted-original-result" &&
        (ownership.replayPolicy.mode === "single-delivery" ||
          attempt.replayClassification !== "identical-replay")
      )
        throw new DurableDeliveryLedgerIntegrityError(
          "contradictory_replay",
          "Accepted Replay contradicts the original replay policy",
          progress({ events, transactions, replayAttempts, lastSequence, lastAuditFingerprint }),
        );
      replayAttempts.push(attempt);
      replayAttemptsById.set(attempt.replayAttemptId, attempt);
    }
    events.push(event);
    lastSequence = event.ledgerSequence;
    lastAuditFingerprint = event.auditFingerprint;
  }
  const ledgerIntegrityFingerprint = createCanonicalSha256Fingerprint(
    events.map((event) => event.auditFingerprint),
  );
  return {
    events: immutableCopy(events),
    transactions: immutableCopy(transactions),
    replayAttempts: immutableCopy(replayAttempts),
    transactionsById,
    requestsById,
    ownershipByKey,
    artifactsById,
    replayAttemptsById,
    lastSequence,
    lastAuditFingerprint,
    ledgerIntegrityFingerprint,
  };
}

export function createDurableDeliveryDerivedIndex(
  state: DurableDeliveryLedgerReplayState,
): DurableDeliveryDerivedIndex {
  const retainedTransactions = [...state.transactions]
    .sort((left, right) => right.ledgerSequence - left.ledgerSequence)
    .slice(0, DURABLE_DELIVERY_DERIVED_INDEX_CAPACITY);
  const retainedReplayAttempts = [...state.replayAttempts]
    .sort((left, right) => right.ledgerSequence - left.ledgerSequence)
    .slice(0, DURABLE_DELIVERY_DERIVED_INDEX_CAPACITY);
  const unsigned = {
    schemaVersion: "1.0" as const,
    retentionPolicyVersion: "bounded-latest-v1" as const,
    entryCapacity: DURABLE_DELIVERY_DERIVED_INDEX_CAPACITY,
    verifiedThroughSequence: state.lastSequence,
    verifiedAuditFingerprint: state.lastAuditFingerprint,
    requestEntries: retainedTransactions
      .map((transaction) => ({
        deliveryRequestId: transaction.requestRegistration.deliveryRequestId,
        transactionId: transaction.transactionId,
      }))
      .sort((left, right) =>
        left.deliveryRequestId < right.deliveryRequestId
          ? -1
          : left.deliveryRequestId > right.deliveryRequestId
            ? 1
            : 0,
      ),
    idempotencyEntries: retainedTransactions
      .map((transaction) => transaction.idempotencyOwnership)
      .map((record) => ({
        idempotencyKey: record.idempotencyKey,
        transactionId: record.transactionId,
        requestFingerprint: record.deliveryRequestFingerprint,
        status: state.replayAttempts.some(
          (attempt) =>
            attempt.idempotencyKey === record.idempotencyKey &&
            attempt.expirationEvidence?.status === "expired-permanently-reserved",
        )
          ? ("expired-permanently-reserved" as const)
          : record.expirationEvidence.status,
      }))
      .sort((left, right) =>
        left.idempotencyKey < right.idempotencyKey
          ? -1
          : left.idempotencyKey > right.idempotencyKey
            ? 1
            : 0,
      ),
    replayEntries: retainedReplayAttempts
      .map((record) => ({
        replayAttemptId: record.replayAttemptId,
        originalTransactionId: record.originalDeliveryTransactionId,
      }))
      .sort((left, right) =>
        left.replayAttemptId < right.replayAttemptId
          ? -1
          : left.replayAttemptId > right.replayAttemptId
            ? 1
            : 0,
      ),
  };
  return immutableCopy(
    DurableDeliveryDerivedIndexSchema.parse({
      ...unsigned,
      indexFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export function verifyDurableDeliveryDerivedIndex(
  raw: unknown,
  state: DurableDeliveryLedgerReplayState,
): "current" | "missing" | "invalid" | "stale" {
  if (raw === null || raw === undefined) return "missing";
  try {
    ensureCanonical(raw, "Derived Delivery Ledger index");
    const index = DurableDeliveryDerivedIndexSchema.parse(raw);
    requireFingerprint(index, "indexFingerprint", "Derived Delivery Ledger index");
    const expected = createDurableDeliveryDerivedIndex(state);
    return serializeCanonicalDurablePayload(index) === serializeCanonicalDurablePayload(expected)
      ? "current"
      : "stale";
  } catch {
    return "invalid";
  }
}

function ledgerIssue(error: unknown): DurableDeliveryLedgerIssue {
  if (error instanceof DurableDeliveryLedgerError)
    return {
      code: error.code,
      logicalLocation: "delivery-ledger",
      message: error.message,
    };
  return {
    code: "storage_failure",
    logicalLocation: "delivery-ledger",
    message: "Delivery Ledger verification failed",
  };
}

export function verifyDeliveryLedgerIntegrity(
  events: readonly unknown[],
  derivedIndex: unknown,
): DeliveryLedgerIntegrityVerificationResult {
  try {
    const state = replayDurableDeliveryLedger(events);
    return DeliveryLedgerIntegrityVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "valid",
      verifiedEventCount: state.events.length,
      verifiedOriginalTransactionCount: state.transactions.length,
      verifiedReplayAttemptCount: state.replayAttempts.length,
      verifiedThroughSequence: state.lastSequence,
      lastAuditFingerprint: state.lastAuditFingerprint,
      ledgerIntegrityFingerprint: state.ledgerIntegrityFingerprint,
      derivedIndexStatus: verifyDurableDeliveryDerivedIndex(derivedIndex, state),
      issues: [],
    });
  } catch (error) {
    const progress =
      error instanceof DurableDeliveryLedgerIntegrityError ? error.progress : EMPTY_PROGRESS;
    return DeliveryLedgerIntegrityVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "invalid",
      verifiedEventCount: progress.eventCount,
      verifiedOriginalTransactionCount: progress.originalTransactionCount,
      verifiedReplayAttemptCount: progress.replayAttemptCount,
      verifiedThroughSequence: progress.lastSequence,
      lastAuditFingerprint: progress.lastAuditFingerprint,
      ledgerIntegrityFingerprint: null,
      derivedIndexStatus: "invalid",
      issues: [ledgerIssue(error)],
    });
  }
}

export function recoverDeliveryLedger(
  events: readonly unknown[],
  derivedIndex: unknown,
): DeliveryLedgerRecoveryResult {
  try {
    const state = replayDurableDeliveryLedger(events);
    const expiredKeys = new Set(
      state.replayAttempts
        .filter((attempt) => attempt.expirationEvidence?.status === "expired-permanently-reserved")
        .map((attempt) => attempt.idempotencyKey),
    );
    const active = [...state.ownershipByKey.keys()].filter((key) => !expiredKeys.has(key)).length;
    return DeliveryLedgerRecoveryResultSchema.parse({
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "recovered",
      originalDeliveryTransactionCount: state.transactions.length,
      replayAttemptCount: state.replayAttempts.length,
      activeIdempotencyOwnershipCount: active,
      expiredIdempotencyOwnershipCount: state.ownershipByKey.size - active,
      lastCommittedLedgerSequence: state.lastSequence,
      lastAuditFingerprint: state.lastAuditFingerprint,
      ledgerIntegrityFingerprint: state.ledgerIntegrityFingerprint,
      derivedIndexStatus: verifyDurableDeliveryDerivedIndex(derivedIndex, state),
      errors: [],
    });
  } catch (error) {
    const progress =
      error instanceof DurableDeliveryLedgerIntegrityError ? error.progress : EMPTY_PROGRESS;
    return DeliveryLedgerRecoveryResultSchema.parse({
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "failed",
      originalDeliveryTransactionCount: progress.originalTransactionCount,
      replayAttemptCount: progress.replayAttemptCount,
      activeIdempotencyOwnershipCount: 0,
      expiredIdempotencyOwnershipCount: 0,
      lastCommittedLedgerSequence: progress.lastSequence,
      lastAuditFingerprint: progress.lastAuditFingerprint,
      ledgerIntegrityFingerprint: null,
      derivedIndexStatus: "invalid",
      errors: [ledgerIssue(error)],
    });
  }
}

export function originalDeliveryResult(
  transaction: CommittedDeliveryTransactionRecord,
): GovernedContextDeliverySuccess {
  const verified = verifyCommittedDeliveryTransaction(transaction);
  const envelope = verified.artifacts.find(
    (record) => record.artifactType === "delivery-envelope",
  )!;
  const acknowledgment = verified.artifacts.find(
    (record) => record.artifactType === "consumer-acknowledgment",
  )!;
  const receipt = verified.artifacts.find((record) => record.artifactType === "delivery-receipt")!;
  return immutableCopy(
    GovernedContextDeliverySuccessSchema.parse({
      schemaVersion: "1.0",
      status: "delivered",
      envelope: envelope.artifact,
      acknowledgment: acknowledgment.artifact,
      receipt: receipt.artifact,
    }),
  );
}
