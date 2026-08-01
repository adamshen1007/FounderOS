import {
  DeliveryLedgerIntegrityVerificationResultSchema,
  DeliveryLedgerRecoveryResultSchema,
  findDurableCanonicalJsonIssue,
  type CommittedDeliveryTransactionRecord,
  type DurableContextDeliveryLedger,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliverySuccess,
  type ReasoningInvocationRequest,
} from "@founderos/knowledge-schema";

import { verifyOriginalDeliveryArtifacts } from "../domain/durable-context-delivery-ledger.js";
import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import { verifyReasoningInvocationRequest } from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

export interface DurableDeliveryTransactionIdentity {
  readonly transactionId: string;
  readonly deliveryRequestId: string;
  readonly deliveryRequestFingerprint: string;
  readonly deliveryEnvelopeId: string;
  readonly deliveryEnvelopeFingerprint: string;
  readonly deliveryReceiptId: string;
  readonly deliveryReceiptFingerprint: string;
}

export interface VerifiedGovernedReasoningAuthority {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly transaction: CommittedDeliveryTransactionRecord;
  readonly deliveryRequest: GovernedContextDeliveryRequest;
  readonly envelope: GovernedContextDeliverySuccess["envelope"];
  readonly acknowledgment: GovernedContextDeliverySuccess["acknowledgment"];
  readonly receipt: GovernedContextDeliverySuccess["receipt"];
}

export class GovernedReasoningAuthorityVerificationError extends Error {
  public constructor(
    public readonly code: "delivery_integrity_failure" | "invalid_invocation",
    message: string,
  ) {
    super(message);
    this.name = "GovernedReasoningAuthorityVerificationError";
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function same(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

/**
 * Resolves the one durable Delivery transaction that authorizes an Invocation.
 *
 * This is an engine-internal authority boundary. It intentionally accepts only a
 * governed ledger, its exact durable identity, and a fingerprint-verifiable
 * Invocation Request; it is not exported from the package facade.
 */
export async function resolveVerifiedGovernedReasoningAuthority(input: {
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly invocationRequest: ReasoningInvocationRequest;
}): Promise<VerifiedGovernedReasoningAuthority> {
  if (
    findDurableCanonicalJsonIssue(input.invocationRequest) !== null ||
    verifyReasoningInvocationRequest(input.invocationRequest).status !== "valid"
  )
    throw new GovernedReasoningAuthorityVerificationError(
      "invalid_invocation",
      "Reasoning Invocation Request failed independent verification",
    );
  if (findDurableCanonicalJsonIssue(input.deliveryIdentity) !== null)
    throw new GovernedReasoningAuthorityVerificationError(
      "delivery_integrity_failure",
      "Durable Delivery identity is not accessor-safe canonical data",
    );

  const invocationRequest = immutableCopy(input.invocationRequest);
  const identity = immutableCopy(input.deliveryIdentity);
  const integrity = DeliveryLedgerIntegrityVerificationResultSchema.parse(
    await input.deliveryLedger.verifyIntegrity(),
  );
  const recovery = DeliveryLedgerRecoveryResultSchema.parse(await input.deliveryLedger.recover());
  if (integrity.status !== "valid" || recovery.status !== "recovered")
    throw new GovernedReasoningAuthorityVerificationError(
      "delivery_integrity_failure",
      "Durable Delivery Ledger failed integrity verification",
    );
  const transaction = (await input.deliveryLedger.listCommittedOriginalDeliveries()).find(
    (candidate) => candidate.transactionId === identity.transactionId,
  );
  if (transaction === undefined)
    throw new GovernedReasoningAuthorityVerificationError(
      "delivery_integrity_failure",
      "Durable Delivery transaction does not exist",
    );
  const result = await input.deliveryLedger.readOriginalDeliveryResult(identity.transactionId);
  if (result === null)
    throw new GovernedReasoningAuthorityVerificationError(
      "delivery_integrity_failure",
      "Durable Delivery transaction is incomplete",
    );
  const verified = verifyOriginalDeliveryArtifacts({
    request: transaction.requestRegistration.request,
    result,
  });
  const envelope = verified.result.envelope;
  const receipt = verified.result.receipt;
  const exactIdentity =
    transaction.requestRegistration.deliveryRequestId === identity.deliveryRequestId &&
    transaction.requestRegistration.deliveryRequestFingerprint ===
      identity.deliveryRequestFingerprint &&
    envelope.deliveryEnvelopeId === identity.deliveryEnvelopeId &&
    envelope.deliveryFingerprint === identity.deliveryEnvelopeFingerprint &&
    receipt.receiptId === identity.deliveryReceiptId &&
    receipt.receiptFingerprint === identity.deliveryReceiptFingerprint;
  const invocationBinding =
    invocationRequest.deliveryTransactionId === identity.transactionId &&
    invocationRequest.deliveryEnvelopeId === envelope.deliveryEnvelopeId &&
    invocationRequest.deliveryEnvelopeFingerprint === envelope.deliveryFingerprint &&
    invocationRequest.deliveryReceiptId === receipt.receiptId &&
    invocationRequest.deliveryReceiptFingerprint === receipt.receiptFingerprint &&
    invocationRequest.contextPackageId === envelope.contextPackageId &&
    invocationRequest.contextPackageFingerprint === envelope.contextPackageFingerprint &&
    invocationRequest.consumerId === envelope.consumerId &&
    invocationRequest.consumerDescriptorFingerprint === envelope.consumerDescriptorFingerprint &&
    invocationRequest.policyDecisionFingerprint ===
      envelope.policyDecisionEvidence.decisionFingerprint &&
    same(invocationRequest.activeSnapshotBinding, envelope.activeSnapshotBinding) &&
    same(invocationRequest.registryIntegrityBinding, envelope.registryIntegrityBinding);
  const sourceBinding =
    transaction.idempotencyOwnership.deliveryRequestId ===
      transaction.requestRegistration.deliveryRequestId &&
    transaction.idempotencyOwnership.deliveryRequestFingerprint ===
      transaction.requestRegistration.deliveryRequestFingerprint &&
    verified.result.acknowledgment.status === "accepted" &&
    receipt.deliveryStatus === "accepted";
  const requested = Date.parse(invocationRequest.requestedAt);
  const deliveryRequest = verified.request;
  const temporal =
    (deliveryRequest.freshnessPolicy.notBefore === undefined ||
      requested >= Date.parse(deliveryRequest.freshnessPolicy.notBefore)) &&
    (deliveryRequest.freshnessPolicy.expiresAt === undefined ||
      requested < Date.parse(deliveryRequest.freshnessPolicy.expiresAt) ||
      deliveryRequest.freshnessPolicy.allowHistoricalReplay) &&
    (envelope.policyDecisionEvidence.expiresAt === undefined ||
      requested < Date.parse(envelope.policyDecisionEvidence.expiresAt) ||
      deliveryRequest.freshnessPolicy.allowHistoricalReplay);
  if (!exactIdentity || !invocationBinding || !sourceBinding || !temporal)
    throw new GovernedReasoningAuthorityVerificationError(
      "delivery_integrity_failure",
      "Invocation does not bind an acceptable complete Durable Delivery transaction",
    );

  return immutableCopy({
    invocationRequest,
    transaction,
    deliveryRequest,
    envelope,
    acknowledgment: verified.result.acknowledgment,
    receipt,
  });
}
