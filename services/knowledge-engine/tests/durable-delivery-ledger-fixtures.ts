import type {
  AtomicDeliveryTransactionRequest,
  GovernedContextDeliverySuccess,
} from "@founderos/knowledge-schema";

import {
  deliverGovernedKnowledgeContext,
  BoundedContextDeliveryIdempotencyStore,
  createContextDeliveryPolicyDecisionEvidence,
  createGovernedContextDeliveryRequest,
  emptyDeliveryLedgerHead,
  evaluateContextDeliveryFreshness,
  type CommitVerifiedOriginalDeliveryInput,
  type SubmitDurableReplayAttemptInput,
} from "../src/index.js";
import type { VerifyGovernedContextDeliveryEnvelopeInput } from "../src/domain/context-delivery.js";
import { createContextDeliveryFixture, DELIVERY_TIME } from "./context-delivery-fixtures.js";

export interface DurableDeliveryFixture {
  readonly context: ReturnType<typeof createContextDeliveryFixture>;
  readonly result: GovernedContextDeliverySuccess;
  readonly commitInput: CommitVerifiedOriginalDeliveryInput;
}

export async function createDurableDeliveryFixture(
  options: Parameters<typeof createContextDeliveryFixture>[0] = {},
): Promise<DurableDeliveryFixture> {
  const context = createContextDeliveryFixture(options);
  const result = await deliverGovernedKnowledgeContext(context.input);
  if (result.status !== "delivered")
    throw new Error(`Durable fixture delivery failed: ${JSON.stringify(result)}`);
  const transaction: AtomicDeliveryTransactionRequest = {
    schemaVersion: "1.0",
    transactionId: "durable-delivery-transaction-0001",
    expectedLedgerHead: emptyDeliveryLedgerHead(),
    expectedIdempotencyState: "unowned",
    request: context.request,
    deliveryResult: result,
    committedAt: DELIVERY_TIME,
  };
  const envelopeVerification: VerifyGovernedContextDeliveryEnvelopeInput = {
    envelope: result.envelope,
    request: context.request,
    policyDecisionEvidence: context.policy,
    candidateInputs: context.objects,
    bindings: context.bindings,
    currentActiveSnapshotId: context.contextPackage.snapshotBinding.activeSnapshotId,
    currentActivationSequence: context.currentActivationSequence,
    expectedDeliverySequence: 1,
    evaluatedAt: DELIVERY_TIME,
  };
  return { context, result, commitInput: { transaction, envelopeVerification } };
}

async function createRequestVariant(
  idempotencyKey: string,
  suffix: string,
): Promise<DurableDeliveryFixture> {
  const base = createContextDeliveryFixture();
  const { requestFingerprint: _requestFingerprint, ...requestUnsigned } = base.request;
  void _requestFingerprint;
  const request = createGovernedContextDeliveryRequest({
    ...requestUnsigned,
    deliveryRequestId: `delivery-request-m12-${suffix}`,
    idempotencyKey,
    reason: `Exercise durable Delivery variant ${suffix}`,
  });
  const { decisionFingerprint: _decisionFingerprint, ...decisionUnsigned } = base.policy;
  void _decisionFingerprint;
  const policy = createContextDeliveryPolicyDecisionEvidence({
    ...decisionUnsigned,
    decisionId: `policy-decision-m12-${suffix}`,
    deliveryRequestId: request.deliveryRequestId,
    deliveryRequestFingerprint: request.requestFingerprint,
  });
  const input = {
    ...base.input,
    request,
    policyDecisionEvidence: policy,
    idempotencyStore: new BoundedContextDeliveryIdempotencyStore(16),
  };
  const result = await deliverGovernedKnowledgeContext(input);
  if (result.status !== "delivered")
    throw new Error(`Conflicting durable fixture failed: ${JSON.stringify(result)}`);
  const context = { ...base, request, policy, input };
  return {
    context,
    result,
    commitInput: {
      transaction: {
        schemaVersion: "1.0",
        transactionId: `durable-delivery-transaction-${suffix}`,
        expectedLedgerHead: emptyDeliveryLedgerHead(),
        expectedIdempotencyState: "unowned",
        request,
        deliveryResult: result,
        committedAt: DELIVERY_TIME,
      },
      envelopeVerification: {
        envelope: result.envelope,
        request,
        policyDecisionEvidence: policy,
        candidateInputs: base.objects,
        bindings: base.bindings,
        currentActiveSnapshotId: base.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: base.currentActivationSequence,
        expectedDeliverySequence: 1,
        evaluatedAt: DELIVERY_TIME,
      },
    },
  };
}

export function createConflictingIdempotencyFixture(): Promise<DurableDeliveryFixture> {
  return createRequestVariant("delivery:key:m11:0001", "conflicting");
}

export function createDistinctDeliveryFixture(): Promise<DurableDeliveryFixture> {
  return createRequestVariant("delivery:key:m12:distinct", "distinct");
}

export function replayInput(
  fixture: DurableDeliveryFixture,
  head: { readonly ledgerSequence: number; readonly auditFingerprint: string },
  options: {
    readonly replayAttemptId?: string;
    readonly evaluatedAt?: string;
  } = {},
): SubmitDurableReplayAttemptInput {
  const evaluatedAt = options.evaluatedAt ?? DELIVERY_TIME;
  const freshnessEvidence = evaluateContextDeliveryFreshness({
    request: fixture.context.request,
    policyDecision: fixture.context.policy,
    contextPackage: fixture.context.contextPackage,
    currentActiveSnapshotId: fixture.context.contextPackage.snapshotBinding.activeSnapshotId,
    currentActivationSequence: fixture.context.currentActivationSequence,
    evaluatedAt,
  });
  return {
    replayAttemptId: options.replayAttemptId ?? "durable-replay-attempt-0001",
    request: fixture.context.request,
    policyDecisionEvidence: fixture.context.policy,
    freshnessEvidence,
    currentActiveSnapshotEvidence: {
      snapshotId: fixture.context.contextPackage.snapshotBinding.activeSnapshotId,
      activationSequence: fixture.context.currentActivationSequence,
      registryIntegrityFingerprint: fixture.context.bindings.integrity.integrityFingerprint!,
    },
    registry: fixture.context.input.registry,
    expectedLedgerHead: head,
    evaluatedAt,
  };
}
