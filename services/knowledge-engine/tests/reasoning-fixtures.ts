import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ReasoningInvocationRequest } from "@founderos/knowledge-schema";

import {
  createProviderNeutralReasoningInput,
  createReasoningExecutionPolicy,
  createReasoningInstructionBlock,
  createReasoningInvocationRequest,
  createReasoningProviderCapabilityRequirements,
  openLocalFileDurableContextDeliveryLedger,
  openLocalFileGovernedReasoningExecutionEvidence,
  type DurableDeliveryTransactionIdentity,
  type ReasoningAttemptSchedule,
} from "../src/index.js";
import { DELIVERY_TIME } from "./context-delivery-fixtures.js";
import { createDurableDeliveryFixture } from "./durable-delivery-ledger-fixtures.js";

export async function createReasoningTestRuntime(roots: string[]) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "founderos-m13-"));
  roots.push(repositoryRoot);
  const docs = join(repositoryRoot, "docs");
  const knowledge = join(repositoryRoot, "knowledge");
  await mkdir(docs);
  await mkdir(knowledge);
  const canonicalSourceRoots = [docs, knowledge];
  const deliveryRuntimeRoot = join(repositoryRoot, ".founderos", "runtime", "delivery-ledger");
  const reasoningRuntimeRoot = join(repositoryRoot, ".founderos", "runtime", "reasoning-ledger");
  const fixture = await createDurableDeliveryFixture();
  const deliveryLedger = await openLocalFileDurableContextDeliveryLedger({
    repositoryRoot,
    runtimeRoot: deliveryRuntimeRoot,
    canonicalSourceRoots,
  });
  await deliveryLedger.commitVerifiedOriginalDelivery(fixture.commitInput);
  const executionEvidence = await openLocalFileGovernedReasoningExecutionEvidence({
    repositoryRoot,
    runtimeRoot: reasoningRuntimeRoot,
    canonicalSourceRoots,
  });
  const envelope = fixture.result.envelope;
  const receipt = fixture.result.receipt;
  const deliveryIdentity: DurableDeliveryTransactionIdentity = {
    transactionId: fixture.commitInput.transaction.transactionId,
    deliveryRequestId: fixture.context.request.deliveryRequestId,
    deliveryRequestFingerprint: fixture.context.request.requestFingerprint,
    deliveryEnvelopeId: envelope.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: envelope.deliveryFingerprint,
    deliveryReceiptId: receipt.receiptId,
    deliveryReceiptFingerprint: receipt.receiptFingerprint,
  };
  return {
    repositoryRoot,
    docs,
    knowledge,
    canonicalSourceRoots,
    deliveryRuntimeRoot,
    reasoningRuntimeRoot,
    fixture,
    deliveryLedger,
    executionEvidence,
    deliveryIdentity,
  };
}

export function createInvocation(
  runtime: Awaited<ReturnType<typeof createReasoningTestRuntime>>,
  options: {
    readonly idempotencyKey?: string;
    readonly retryMode?: ReasoningInvocationRequest["executionPolicy"]["retryMode"];
    readonly cancellationMode?: ReasoningInvocationRequest["executionPolicy"]["cancellationMode"];
    readonly maxAttemptCount?: number;
    readonly maxOutputCharacters?: number;
    readonly outputContentType?: "canonical-json" | "canonical-text";
    readonly requireNonEmpty?: boolean;
    readonly taskSourceClassification?: "evaluation-fixture" | "request-author";
    readonly taskText?: string;
    readonly duplicateRequestAuthorTask?: boolean;
  } = {},
): ReasoningInvocationRequest {
  const envelope = runtime.fixture.result.envelope;
  const contextBlock = createReasoningInstructionBlock({
    schemaVersion: "1.0",
    blockId: "context-reference",
    blockType: "context-reference",
    contentType: "canonical-text",
    text: "Use only the exact governed Context Package reference.",
    priority: 0,
    sourceClassification: "delivered-context",
  });
  const taskBlock = createReasoningInstructionBlock({
    schemaVersion: "1.0",
    blockId: "task-instruction",
    blockType: "task-instruction",
    contentType: "canonical-text",
    text: options.taskText ?? "Produce the deterministic governed evaluation fixture.",
    priority: 1,
    sourceClassification: options.taskSourceClassification ?? "evaluation-fixture",
  });
  const duplicateTaskBlock = options.duplicateRequestAuthorTask
    ? createReasoningInstructionBlock({
        schemaVersion: "1.0",
        blockId: "task-instruction-duplicate",
        blockType: "task-instruction",
        contentType: "canonical-text",
        text: "A second founder question must reject.",
        priority: 2,
        sourceClassification: "request-author",
      })
    : null;
  const outputContentType = options.outputContentType ?? "canonical-json";
  const maxOutputCharacters = options.maxOutputCharacters ?? 4_000;
  const reasoningInput = createProviderNeutralReasoningInput({
    schemaVersion: "1.0",
    contentType: "provider-neutral-instruction-blocks-v1",
    instructionBlocks:
      duplicateTaskBlock === null
        ? [contextBlock, taskBlock]
        : [contextBlock, taskBlock, duplicateTaskBlock],
    contextReference: {
      contextPackageId: envelope.contextPackageId,
      contextPackageFingerprint: envelope.contextPackageFingerprint,
      deliveryEnvelopeId: envelope.deliveryEnvelopeId,
      deliveryEnvelopeFingerprint: envelope.deliveryFingerprint,
    },
    outputRequirements: {
      contentType: outputContentType,
      maxCharacters: maxOutputCharacters,
      requireNonEmpty: options.requireNonEmpty ?? true,
    },
    constraintBlocks: [],
  });
  const retryMode = options.retryMode ?? "no-retry";
  const maxAttemptCount = options.maxAttemptCount ?? (retryMode === "no-retry" ? 1 : 2);
  const executionPolicy = createReasoningExecutionPolicy({
    schemaVersion: "1.0",
    maxInputCharacters: 20_000,
    maxOutputCharacters,
    timeoutMilliseconds: 1_000,
    cancellationMode: options.cancellationMode ?? "not-cancellable",
    retryMode,
    maxAttemptCount,
    deterministicModeRequired: true,
    usageEvidenceRequired: true,
    costEvidenceRequired: true,
    failureEvidenceRequired: true,
    resultPersistenceRequired: true,
    evaluatedAt: DELIVERY_TIME,
  });
  const requirements = createReasoningProviderCapabilityRequirements({
    schemaVersion: "1.0",
    acceptedProviderClasses: ["deterministic-fake-provider"],
    requiredInputContentTypes: ["provider-neutral-instruction-blocks-v1"],
    requiredOutputContentType: outputContentType,
    deterministicModeRequired: true,
    usageEvidenceRequired: true,
    costEvidenceRequired: true,
    failureEvidenceRequired: true,
    resultEnvelopeVersion: "1.0",
  });
  return createReasoningInvocationRequest({
    schemaVersion: "1.0",
    invocationRequestId: `reasoning-invocation-${options.idempotencyKey?.replaceAll(":", "-") ?? "0001"}`,
    deliveryTransactionId: runtime.deliveryIdentity.transactionId,
    deliveryEnvelopeVersion: "1.0",
    deliveryEnvelopeId: envelope.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: envelope.deliveryFingerprint,
    deliveryReceiptId: runtime.fixture.result.receipt.receiptId,
    deliveryReceiptFingerprint: runtime.fixture.result.receipt.receiptFingerprint,
    contextPackageId: envelope.contextPackageId,
    contextPackageFingerprint: envelope.contextPackageFingerprint,
    activeSnapshotBinding: envelope.activeSnapshotBinding,
    registryIntegrityBinding: envelope.registryIntegrityBinding,
    consumerId: envelope.consumerId,
    consumerDescriptorFingerprint: envelope.consumerDescriptorFingerprint,
    policyDecisionFingerprint: envelope.policyDecisionEvidence.decisionFingerprint,
    purpose: "Evaluate the exact governed delivery",
    capabilityRequirements: requirements,
    reasoningInput,
    executionPolicy,
    idempotencyKey: options.idempotencyKey ?? "reasoning:key:0001",
    requestActor: { actorId: "milestone-13-evaluation", actorType: "service" },
    reason: "Verify governed provider-neutral reasoning",
    requestedAt: DELIVERY_TIME,
  });
}

export function schedule(
  count = 1,
  cancellation: ReasoningAttemptSchedule["cancellationSignal"] = {
    state: "not-requested",
    authorityReference: "authority/evaluation",
    requestedAt: "2026-07-29T01:00:00.000Z",
    observedAt: "2026-07-29T01:00:00.000Z",
  },
): readonly ReasoningAttemptSchedule[] {
  return Array.from({ length: count }, (_, index) => ({
    startedAt: `2026-07-29T01:00:0${index + 1}.000Z`,
    deadlineAt: `2026-07-29T01:00:0${index + 2}.000Z`,
    completedAt: `2026-07-29T01:00:0${index + 1}.100Z`,
    cancellationSignal: cancellation,
  }));
}
