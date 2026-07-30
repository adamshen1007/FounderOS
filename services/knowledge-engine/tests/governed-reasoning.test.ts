import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ReasoningExecutionAttempt,
  ReasoningInvocationRequest,
  ReasoningProviderCapabilityDescriptor,
  ReasoningProviderOutcome,
} from "@founderos/knowledge-schema";

import * as PublicKnowledgeEngine from "../src/index.js";
import {
  countOutputCharacters,
  countCanonicalCharacters,
  createReasoningCancellationEvidence,
  createReasoningExecutionAttempt,
  createReasoningCostEvidence,
  createReasoningExecutionReceipt,
  createReasoningFailureEvidence,
  createFinalizedReasoningConsumptionEvidence,
  createReasoningInvocationRequest,
  createReasoningProviderOutcome,
  createReasoningProviderCapabilityDescriptor,
  createReasoningResultEnvelope,
  createReasoningTimeoutEvidence,
  createReasoningUsageEvidence,
  invokeGovernedReasoning,
  matchReasoningProviderCapabilities,
  openLocalFileGovernedReasoningExecutionEvidence,
  verifyFinalizedReasoningConsumptionEvidence,
  verifyReasoningProviderCompatibilityResult,
  verifyReasoningResultEnvelope,
} from "../src/index.js";
import { invokeGovernedReasoningWithProvider } from "../src/application/invoke-governed-reasoning.js";
import { resolveInternalReasoningExecutionEvidence } from "../src/application/manage-governed-reasoning-execution-ledger.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import { verifyReasoningAttemptLifecycle } from "../src/domain/reasoning.js";
import {
  createExecutionAttemptRecord,
  createProviderOutcomeRecord,
  createReasoningExecutionLedgerEvent,
  ReasoningExecutionLedgerConflictError,
  replayReasoningExecutionLedger,
} from "../src/domain/durable-reasoning-execution-ledger.js";
import { createDeterministicFakeReasoningProvider } from "../src/infrastructure/deterministic-fake-reasoning-provider.js";
import { runReasoningWriterSession } from "../src/infrastructure/local-file-governed-reasoning-execution-evidence.js";
import { EXECUTABLE_REASONING_EVALUATIONS } from "./fixtures/reasoning-evaluations.js";
import { executeReasoningEvaluation } from "./reasoning-evaluation-runner.js";
import { createInvocation, createReasoningTestRuntime, schedule } from "./reasoning-fixtures.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createSuccessfulFinalizationArtifacts(input: {
  readonly request: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly attempt: ReasoningExecutionAttempt;
  readonly outcome: Extract<ReasoningProviderOutcome, { readonly status: "succeeded" }>;
  readonly contextPackageObjectCount: number;
  readonly transactionId: string;
}) {
  const { request, providerCapability: provider, attempt, outcome } = input;
  const executionReceipt = createReasoningExecutionReceipt({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    completedAt: outcome.completedAt,
    outcome: "succeeded",
  });
  const usageEvidence = createReasoningUsageEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    inputCharacterCount: countCanonicalCharacters(request.reasoningInput),
    outputCharacterCount: outcome.outputCharacterCount,
    instructionBlockCount: request.reasoningInput.instructionBlocks.length,
    contextPackageObjectCount: input.contextPackageObjectCount,
    attemptNumber: attempt.attemptNumber,
    durationMilliseconds: Date.parse(outcome.completedAt) - Date.parse(attempt.startedAt),
  });
  const costEvidence = createReasoningCostEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    status: "not-applicable",
  });
  const resultEnvelope = createReasoningResultEnvelope({
    schemaVersion: "1.0",
    resultEnvelopeId: `reasoning-result-${createDurableCanonicalJsonSha256Fingerprint({ invocationRequestFingerprint: request.requestFingerprint, executionAttemptId: attempt.executionAttemptId, outcomeFingerprint: outcome.outcomeFingerprint })}`,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    deliveryTransactionId: request.deliveryTransactionId,
    deliveryEnvelopeId: request.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: request.deliveryEnvelopeFingerprint,
    deliveryReceiptId: request.deliveryReceiptId,
    deliveryReceiptFingerprint: request.deliveryReceiptFingerprint,
    contextPackageId: request.contextPackageId,
    contextPackageFingerprint: request.contextPackageFingerprint,
    consumerId: request.consumerId,
    consumerDescriptorFingerprint: request.consumerDescriptorFingerprint,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
    executionAttemptId: attempt.executionAttemptId,
    attemptNumber: attempt.attemptNumber,
    executionReceipt,
    usageEvidence,
    costEvidence,
    completedAt: outcome.completedAt,
    outcome: "succeeded",
    outputContent: outcome.outputContent,
    outputCharacterCount: outcome.outputCharacterCount,
    outputContentFingerprint: outcome.outputContentFingerprint,
  });
  const historyEntry = {
    executionAttemptId: attempt.executionAttemptId,
    attemptNumber: attempt.attemptNumber,
    outcome: outcome.status,
    attemptFingerprint: attempt.attemptFingerprint,
    outcomeFingerprint: outcome.outcomeFingerprint,
  };
  const historyUnsigned = {
    attemptCount: 1,
    finalAttemptNumber: 1,
    finalOutcome: outcome.status,
    attempts: [historyEntry],
  };
  const consumptionEvidence = createFinalizedReasoningConsumptionEvidence({
    schemaVersion: "1.0",
    consumptionId: `reasoning-consumption-${createDurableCanonicalJsonSha256Fingerprint({ resultEnvelopeFingerprint: resultEnvelope.resultEnvelopeFingerprint })}`,
    deliveryReceiptId: request.deliveryReceiptId,
    deliveryReceiptFingerprint: request.deliveryReceiptFingerprint,
    deliveryTransactionId: request.deliveryTransactionId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    providerCapabilityId: provider.providerCapabilityId,
    providerCapabilityFingerprint: provider.descriptorFingerprint,
    finalResultEnvelopeId: resultEnvelope.resultEnvelopeId,
    finalResultEnvelopeFingerprint: resultEnvelope.resultEnvelopeFingerprint,
    finalOutcome: "succeeded",
    attemptHistorySummary: {
      ...historyUnsigned,
      historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(historyUnsigned),
    },
    startedAt: attempt.startedAt,
    completedAt: outcome.completedAt,
    usageEvidenceFingerprint: usageEvidence.usageFingerprint,
    costEvidenceFingerprint: costEvidence.costFingerprint,
    executionLedgerTransactionId: input.transactionId,
  });
  return { resultEnvelope, consumptionEvidence };
}

describe("Milestone 13 governed provider-neutral reasoning", () => {
  it("defines a complete executable evaluation matrix", () => {
    const ids = EXECUTABLE_REASONING_EVALUATIONS.map((entry) => entry.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(EXECUTABLE_REASONING_EVALUATIONS.map((entry) => entry.category))).toEqual(
      new Set([
        "successful-execution",
        "delivery-binding",
        "capability",
        "idempotency",
        "retry",
        "timeout",
        "cancellation",
        "evidence-integrity",
        "fake-provider-safety",
        "no-provider-bypass",
      ]),
    );
  });

  it("fails every retained semantic target when the definition changes it", async () => {
    let targetedCount = 0;
    for (const evaluation of EXECUTABLE_REASONING_EVALUATIONS) {
      if (evaluation.mutation.target === undefined) continue;
      targetedCount += 1;
      const changed = {
        ...evaluation,
        mutation: {
          ...evaluation.mutation,
          target: `changed.${evaluation.mutation.target}`,
        },
      };
      await expect(executeReasoningEvaluation(changed, roots)).rejects.toBeDefined();
    }
    expect(targetedCount).toBe(22);
  });

  it.each(EXECUTABLE_REASONING_EVALUATIONS)(
    "executes evaluation $scenarioId",
    async (evaluation) => {
      await executeReasoningEvaluation(evaluation, roots);
    },
  );

  it("executes one exact durable Delivery and returns byte-identical finalized replay after restart", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime);
    const sourceBefore = JSON.stringify(
      await runtime.deliveryLedger.listCommittedOriginalDeliveries(),
    );
    await writeFile(
      join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json"),
      "uncommitted suffix ignored by the atomic head\n",
    );
    const first = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    expect(first.status).toBe("finalized");
    if (first.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    expect(first.resultEnvelope.outcome).toBe("succeeded");
    expect(first.resultEnvelope.costEvidence.status).toBe("not-applicable");
    expect(first.consumptionEvidence.finalResultEnvelopeFingerprint).toBe(
      first.resultEnvelope.resultEnvelopeFingerprint,
    );
    const reopened = await openLocalFileGovernedReasoningExecutionEvidence({
      repositoryRoot: runtime.repositoryRoot,
      runtimeRoot: runtime.reasoningRuntimeRoot,
      canonicalSourceRoots: runtime.canonicalSourceRoots,
    });
    const replay = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: reopened,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    expect(replay.status).toBe("identical-finalized");
    expect(
      JSON.stringify(replay.status === "identical-in-progress" ? replay : replay.resultEnvelope),
    ).toBe(JSON.stringify(first.resultEnvelope));
    expect(await reopened.readAttemptHistory(invocationRequest.invocationRequestId)).toHaveLength(
      1,
    );
    expect(JSON.stringify(await runtime.deliveryLedger.listCommittedOriginalDeliveries())).toBe(
      sourceBefore,
    );
    expect((await reopened.recover()).status).toBe("recovered");
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
  });

  it("retries deterministic transient failure once and preserves both immutable Attempts", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:retry",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const result = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode: "transient-failure-then-success",
      attemptSchedule: schedule(2),
    });
    expect(result.status).toBe("finalized");
    if (result.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    expect(result.resultEnvelope.outcome).toBe("succeeded");
    expect(result.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(2);
    const attempts = await runtime.executionEvidence.readAttemptHistory(
      invocationRequest.invocationRequestId,
    );
    expect(result.consumptionEvidence.startedAt).toBe(attempts[0]!.startedAt);
    expect(result.consumptionEvidence.completedAt).toBe(result.resultEnvelope.completedAt);
    expect(attempts[1]?.previousExecutionAttemptId).toBe(attempts[0]?.executionAttemptId);
    expect(
      (await runtime.executionEvidence.readProviderOutcome(attempts[0]!.executionAttemptId))
        ?.status,
    ).toBe("failed");
  });

  it("finalizes stable attempt-exhaustion evidence and permits timeout retry only by policy", async () => {
    const exhaustedRuntime = await createReasoningTestRuntime(roots);
    const exhaustedRequest = createInvocation(exhaustedRuntime, {
      idempotencyKey: "reasoning:key:exhausted",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const exhausted = await invokeGovernedReasoning({
      deliveryLedger: exhaustedRuntime.deliveryLedger,
      executionEvidence: exhaustedRuntime.executionEvidence,
      deliveryIdentity: exhaustedRuntime.deliveryIdentity,
      invocationRequest: exhaustedRequest,
      fixtureMode: "deterministic-transient-failure",
      attemptSchedule: schedule(2),
    });
    if (exhausted.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(exhausted.resultEnvelope.outcome).toBe("failed");
    if (exhausted.resultEnvelope.outcome === "failed")
      expect(exhausted.resultEnvelope.failureEvidence.reasonCodes).toEqual([
        "attempt_limit_exhausted",
      ]);
    expect(exhausted.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(2);

    const timeoutRuntime = await createReasoningTestRuntime(roots);
    const timeoutRequest = createInvocation(timeoutRuntime, {
      idempotencyKey: "reasoning:key:timeout-retry",
      retryMode: "retry-until-attempt-limit",
      maxAttemptCount: 2,
    });
    const timeout = await invokeGovernedReasoning({
      deliveryLedger: timeoutRuntime.deliveryLedger,
      executionEvidence: timeoutRuntime.executionEvidence,
      deliveryIdentity: timeoutRuntime.deliveryIdentity,
      invocationRequest: timeoutRequest,
      fixtureMode: "timeout",
      attemptSchedule: schedule(2).map((entry) => ({
        ...entry,
        completedAt: entry.deadlineAt,
      })),
    });
    if (timeout.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(timeout.resultEnvelope.outcome).toBe("timed-out");
    expect(timeout.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(2);
  });

  it.each([
    ["deterministic-permanent-failure", "failed"],
    ["timeout", "timed-out"],
    ["output-budget-overflow", "failed"],
    ["malformed-success-outcome", "failed"],
    ["malformed-failure-outcome", "failed"],
    ["contradictory-outcome", "failed"],
    ["physical-path-bearing-outcome", "failed"],
    ["credential-bearing-outcome", "failed"],
  ] as const)("fails closed for deterministic fixture %s", async (fixtureMode, expected) => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime, {
      idempotencyKey: `reasoning:key:${fixtureMode}`,
      maxOutputCharacters: fixtureMode === "output-budget-overflow" ? 64 : 4_000,
    });
    const result = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode,
      attemptSchedule:
        fixtureMode === "timeout"
          ? [{ ...schedule()[0]!, completedAt: "2026-07-29T01:00:02.000Z" }]
          : schedule(),
    });
    if (result.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    expect(result.resultEnvelope.outcome).toBe(expected);
    expect(JSON.stringify(result)).not.toMatch(/\/private\/|api_key|fixture-secret-value/u);
  });

  it.each([
    ["cancellation-before-execution", "cancel-before-execution", "requested-before-execution"],
    ["cooperative-cancellation", "cooperative-cancellation", "requested-cooperatively"],
    ["deadline-cancellation", "deadline-cancellation", "requested-at-deadline"],
  ] as const)("records explicit %s evidence", async (fixtureMode, cancellationMode, state) => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime, {
      idempotencyKey: `reasoning:key:${fixtureMode}`,
      cancellationMode,
    });
    const cancellationSignal = {
      state,
      authorityReference: "authority/evaluation",
      requestedAt:
        state === "requested-before-execution"
          ? "2026-07-29T01:00:00.900Z"
          : state === "requested-at-deadline"
            ? "2026-07-29T01:00:02.000Z"
            : "2026-07-29T01:00:01.010Z",
      observedAt:
        state === "requested-before-execution"
          ? "2026-07-29T01:00:00.950Z"
          : state === "requested-at-deadline"
            ? "2026-07-29T01:00:02.000Z"
            : "2026-07-29T01:00:01.050Z",
    } as const;
    const result = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode,
      attemptSchedule:
        state === "requested-at-deadline"
          ? [
              {
                ...schedule(1, cancellationSignal)[0]!,
                completedAt: "2026-07-29T01:00:02.000Z",
              },
            ]
          : schedule(1, cancellationSignal),
    });
    if (result.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    expect(result.resultEnvelope.outcome).toBe("cancelled");
  });

  it("enforces deadline and cancellation controls independently of provider fixture labels", async () => {
    const deadlineRuntime = await createReasoningTestRuntime(roots);
    const deadlineRequest = createInvocation(deadlineRuntime, {
      idempotencyKey: "reasoning:key:controlled-deadline",
    });
    const deadline = await invokeGovernedReasoning({
      deliveryLedger: deadlineRuntime.deliveryLedger,
      executionEvidence: deadlineRuntime.executionEvidence,
      deliveryIdentity: deadlineRuntime.deliveryIdentity,
      invocationRequest: deadlineRequest,
      fixtureMode: "successful-structured-response",
      attemptSchedule: [{ ...schedule()[0]!, completedAt: schedule()[0]!.deadlineAt }],
    });
    if (deadline.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(deadline.resultEnvelope.outcome).toBe("timed-out");

    const cancelledRuntime = await createReasoningTestRuntime(roots);
    const cancelledRequest = createInvocation(cancelledRuntime, {
      idempotencyKey: "reasoning:key:controlled-cancel",
      cancellationMode: "cancel-before-execution",
    });
    const underlying = createDeterministicFakeReasoningProvider();
    let providerCalls = 0;
    const provider = Object.freeze({
      providerCapability: underlying.providerCapability,
      async execute(input: Parameters<typeof underlying.execute>[0]) {
        providerCalls += 1;
        return underlying.execute(input);
      },
    });
    const cancellationSignal = {
      state: "requested-before-execution" as const,
      authorityReference: "authority/independent-control",
      requestedAt: "2026-07-29T01:00:00.900Z",
      observedAt: "2026-07-29T01:00:00.950Z",
    };
    const cancelled = await invokeGovernedReasoningWithProvider(
      {
        deliveryLedger: cancelledRuntime.deliveryLedger,
        executionEvidence: cancelledRuntime.executionEvidence,
        deliveryIdentity: cancelledRuntime.deliveryIdentity,
        invocationRequest: cancelledRequest,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(1, cancellationSignal),
      },
      provider,
    );
    if (cancelled.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(cancelled.resultEnvelope.outcome).toBe("cancelled");
    expect(providerCalls).toBe(0);
  });

  it("cross-binds adversarial provider outcomes to the authorized Attempt and schedule before persistence", async () => {
    const mutations = [
      { field: "invocationRequestId", value: "substituted-invocation" },
      { field: "executionAttemptId", value: "substituted-attempt" },
      { field: "attemptNumber", value: 2 },
      { field: "completedAt", value: "2026-07-29T01:00:02.100Z" },
    ] as const;
    for (const mutation of mutations) {
      const runtime = await createReasoningTestRuntime(roots);
      const request = createInvocation(runtime, {
        idempotencyKey: `reasoning:key:provider-${mutation.field}`,
      });
      const underlying = createDeterministicFakeReasoningProvider();
      const provider = Object.freeze({
        providerCapability: underlying.providerCapability,
        async execute(input: Parameters<typeof underlying.execute>[0]) {
          const baseline = await underlying.execute(input);
          const { outcomeFingerprint: _fingerprint, ...unsigned } = baseline as ReturnType<
            typeof createReasoningProviderOutcome
          >;
          void _fingerprint;
          return createReasoningProviderOutcome({ ...unsigned, [mutation.field]: mutation.value });
        },
      });
      const authorizedTiming = schedule()[0]!;
      const result = await invokeGovernedReasoningWithProvider(
        {
          deliveryLedger: runtime.deliveryLedger,
          executionEvidence: runtime.executionEvidence,
          deliveryIdentity: runtime.deliveryIdentity,
          invocationRequest: request,
          fixtureMode: "successful-structured-response",
          attemptSchedule: [authorizedTiming],
        },
        provider,
      );
      if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
      expect(result.resultEnvelope.outcome).toBe("failed");
      if (result.resultEnvelope.outcome === "failed")
        expect(result.resultEnvelope.failureEvidence.reasonCodes).toEqual([
          "invalid_provider_outcome",
        ]);
      const attempts = await runtime.executionEvidence.readAttemptHistory(
        request.invocationRequestId,
      );
      const stored = await runtime.executionEvidence.readProviderOutcome(
        attempts[0]!.executionAttemptId,
      );
      expect(stored).toMatchObject({
        invocationRequestId: request.invocationRequestId,
        executionAttemptId: attempts[0]!.executionAttemptId,
        attemptNumber: 1,
        completedAt: authorizedTiming.completedAt,
        status: "failed",
      });
      expect((await runtime.executionEvidence.verifyIntegrity()).status).toBe("valid");
    }

    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:provider-accessor",
    });
    const underlying = createDeterministicFakeReasoningProvider();
    let accessorReads = 0;
    const provider = Object.freeze({
      providerCapability: underlying.providerCapability,
      async execute() {
        const raw = {};
        Object.defineProperty(raw, "completedAt", {
          enumerable: true,
          get() {
            accessorReads += 1;
            return "2026-07-29T01:00:02.100Z";
          },
        });
        return raw;
      },
    });
    const authorizedTiming = schedule()[0]!;
    const result = await invokeGovernedReasoningWithProvider(
      {
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: runtime.deliveryIdentity,
        invocationRequest: request,
        fixtureMode: "successful-structured-response",
        attemptSchedule: [authorizedTiming],
      },
      provider,
    );
    if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(accessorReads).toBe(0);
    expect(result.resultEnvelope.completedAt).toBe(authorizedTiming.completedAt);
    expect((await runtime.executionEvidence.verifyIntegrity()).status).toBe("valid");
    expect("invokeGovernedReasoningWithProvider" in PublicKnowledgeEngine).toBe(false);
  });

  it("enforces exact successful output type and non-empty requirements at the provider seam and independent verifier", async () => {
    const cases = [
      {
        name: "text-to-json",
        outputContentType: "canonical-text" as const,
        requireNonEmpty: true,
        outputContent: { contentType: "canonical-json" as const, value: null },
      },
      {
        name: "json-to-text",
        outputContentType: "canonical-json" as const,
        requireNonEmpty: true,
        outputContent: { contentType: "canonical-text" as const, text: "unexpected" },
      },
      {
        name: "required-empty",
        outputContentType: "canonical-text" as const,
        requireNonEmpty: true,
        outputContent: { contentType: "canonical-text" as const, text: "" },
      },
    ];
    for (const testCase of cases) {
      const seamRuntime = await createReasoningTestRuntime(roots);
      const seamRequest = createInvocation(seamRuntime, {
        idempotencyKey: `reasoning:key:output-${testCase.name}`,
        outputContentType: testCase.outputContentType,
        requireNonEmpty: testCase.requireNonEmpty,
      });
      const underlying = createDeterministicFakeReasoningProvider();
      const seamProvider = Object.freeze({
        providerCapability: underlying.providerCapability,
        async execute(input: Parameters<typeof underlying.execute>[0]) {
          const outputCharacterCount = countOutputCharacters(testCase.outputContent);
          return createReasoningProviderOutcome({
            schemaVersion: "1.0",
            executionAttemptId: input.attempt.executionAttemptId,
            invocationRequestId: input.invocationRequest.invocationRequestId,
            attemptNumber: input.attempt.attemptNumber,
            completedAt: input.completedAt,
            status: "succeeded",
            outputContent: testCase.outputContent,
            outputCharacterCount,
            outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(
              testCase.outputContent,
            ),
          });
        },
      });
      const seamResult = await invokeGovernedReasoningWithProvider(
        {
          deliveryLedger: seamRuntime.deliveryLedger,
          executionEvidence: seamRuntime.executionEvidence,
          deliveryIdentity: seamRuntime.deliveryIdentity,
          invocationRequest: seamRequest,
          fixtureMode: "successful-structured-response",
          attemptSchedule: schedule(),
        },
        seamProvider,
      );
      if (seamResult.status === "identical-in-progress") throw new Error("unexpected in-progress");
      expect(seamResult.resultEnvelope.outcome).toBe("failed");
      if (seamResult.resultEnvelope.outcome === "failed")
        expect(seamResult.resultEnvelope.failureEvidence.reasonCodes).toEqual([
          "malformed_success_outcome",
        ]);

      const verifierRuntime = await createReasoningTestRuntime(roots);
      const verifierRequest = createInvocation(verifierRuntime, {
        idempotencyKey: `reasoning:key:verify-output-${testCase.name}`,
        outputContentType: testCase.outputContentType,
        requireNonEmpty: testCase.requireNonEmpty,
      });
      const baseline = await invokeGovernedReasoning({
        deliveryLedger: verifierRuntime.deliveryLedger,
        executionEvidence: verifierRuntime.executionEvidence,
        deliveryIdentity: verifierRuntime.deliveryIdentity,
        invocationRequest: verifierRequest,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(),
      });
      if (baseline.status === "identical-in-progress") throw new Error("unexpected in-progress");
      if (baseline.resultEnvelope.outcome !== "succeeded")
        throw new Error("expected successful verifier baseline");
      const attempt = (
        await verifierRuntime.executionEvidence.readAttemptHistory(
          verifierRequest.invocationRequestId,
        )
      )[0]!;
      const outputCharacterCount = countOutputCharacters(testCase.outputContent);
      const substitutedOutcome = createReasoningProviderOutcome({
        schemaVersion: "1.0",
        executionAttemptId: attempt.executionAttemptId,
        invocationRequestId: verifierRequest.invocationRequestId,
        attemptNumber: attempt.attemptNumber,
        completedAt: baseline.resultEnvelope.completedAt,
        status: "succeeded",
        outputContent: testCase.outputContent,
        outputCharacterCount,
        outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(
          testCase.outputContent,
        ),
      });
      if (substitutedOutcome.status !== "succeeded")
        throw new Error("expected substituted success outcome");
      const { usageFingerprint: _usageFingerprint, ...usageUnsigned } =
        baseline.resultEnvelope.usageEvidence;
      const { resultEnvelopeFingerprint: _resultFingerprint, ...resultUnsigned } =
        baseline.resultEnvelope;
      void _usageFingerprint;
      void _resultFingerprint;
      const substitutedResult = createReasoningResultEnvelope({
        ...resultUnsigned,
        outputContent: testCase.outputContent,
        outputCharacterCount,
        outputContentFingerprint: substitutedOutcome.outputContentFingerprint,
        usageEvidence: createReasoningUsageEvidence({
          ...usageUnsigned,
          outputCharacterCount,
        }),
      });
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: substitutedResult,
          invocationRequest: verifierRequest,
          providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
          attempt,
          attemptHistory: [attempt],
          providerOutcome: substitutedOutcome,
          outcomeHistory: [substitutedOutcome],
          contextPackageObjectCount:
            verifierRuntime.fixture.result.envelope.contextPackage.included.length,
        }).status,
      ).toBe("invalid");
    }
  });

  it("rejects pre-deadline timeout fixtures and gives cooperative observation exact deadline precedence", async () => {
    const invalidRuntime = await createReasoningTestRuntime(roots);
    const invalidRequest = createInvocation(invalidRuntime, {
      idempotencyKey: "reasoning:key:predeadline-timeout",
    });
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: invalidRuntime.deliveryLedger,
        executionEvidence: invalidRuntime.executionEvidence,
        deliveryIdentity: invalidRuntime.deliveryIdentity,
        invocationRequest: invalidRequest,
        fixtureMode: "timeout",
        attemptSchedule: schedule(),
      }),
    ).rejects.toMatchObject({ code: "invalid_schedule" });
    expect((await invalidRuntime.executionEvidence.verifyIntegrity()).verifiedInvocationCount).toBe(
      0,
    );

    const precedenceRuntime = await createReasoningTestRuntime(roots);
    const precedenceRequest = createInvocation(precedenceRuntime, {
      idempotencyKey: "reasoning:key:deadline-precedence",
      cancellationMode: "cooperative-cancellation",
    });
    const lateCancellation = {
      state: "requested-cooperatively" as const,
      authorityReference: "authority/late-cooperative-cancel",
      requestedAt: "2026-07-29T01:00:01.900Z",
      observedAt: "2026-07-29T01:00:02.050Z",
    };
    const precedence = await invokeGovernedReasoning({
      deliveryLedger: precedenceRuntime.deliveryLedger,
      executionEvidence: precedenceRuntime.executionEvidence,
      deliveryIdentity: precedenceRuntime.deliveryIdentity,
      invocationRequest: precedenceRequest,
      fixtureMode: "successful-structured-response",
      attemptSchedule: [
        {
          ...schedule(1, lateCancellation)[0]!,
          completedAt: "2026-07-29T01:00:02.100Z",
        },
      ],
    });
    if (precedence.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(precedence.resultEnvelope.outcome).toBe("timed-out");

    const observedRuntime = await createReasoningTestRuntime(roots);
    const observedRequest = createInvocation(observedRuntime, {
      idempotencyKey: "reasoning:key:cooperative-observation-precedence",
      cancellationMode: "cooperative-cancellation",
    });
    const earlyObservedCancellation = {
      state: "requested-cooperatively" as const,
      authorityReference: "authority/early-observed-cooperative-cancel",
      requestedAt: "2026-07-29T01:00:01.900Z",
      observedAt: "2026-07-29T01:00:01.950Z",
    };
    const observed = await invokeGovernedReasoning({
      deliveryLedger: observedRuntime.deliveryLedger,
      executionEvidence: observedRuntime.executionEvidence,
      deliveryIdentity: observedRuntime.deliveryIdentity,
      invocationRequest: observedRequest,
      fixtureMode: "successful-structured-response",
      attemptSchedule: [
        {
          ...schedule(1, earlyObservedCancellation)[0]!,
          completedAt: "2026-07-29T01:00:02.100Z",
        },
      ],
    });
    if (observed.status === "identical-in-progress") throw new Error("unexpected in-progress");
    expect(observed.resultEnvelope.outcome).toBe("cancelled");
    if (observed.resultEnvelope.outcome !== "cancelled") throw new Error("expected cancellation");
    expect(observed.resultEnvelope.cancellationEvidence.observedAt).toBe(
      earlyObservedCancellation.observedAt,
    );
  });

  it("validates the complete Attempt schedule before durable ownership", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:invalid-complete-schedule",
      retryMode: "retry-until-attempt-limit",
      maxAttemptCount: 2,
    });
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: runtime.deliveryIdentity,
        invocationRequest: request,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(1),
      }),
    ).rejects.toMatchObject({ code: "invalid_schedule" });
    expect((await runtime.executionEvidence.verifyIntegrity()).verifiedInvocationCount).toBe(0);
    expect(await runtime.executionEvidence.readInvocationRequest(request.invocationRequestId)).toBe(
      null,
    );
  });

  it("rejects unsupported fixture modes before claiming Invocation ownership", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: runtime.deliveryIdentity,
        invocationRequest: createInvocation(runtime),
        fixtureMode: "unknown-fixture" as never,
        attemptSchedule: schedule(),
      }),
    ).rejects.toMatchObject({ code: "invalid_invocation" });
    expect(await runtime.executionEvidence.readAttemptHistory("reasoning-invocation-0001")).toEqual(
      [],
    );
    expect((await runtime.executionEvidence.verifyIntegrity()).verifiedInvocationCount).toBe(0);
  });

  it("supports an empty success only when the output requirement permits it", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:empty",
      outputContentType: "canonical-text",
      requireNonEmpty: false,
    });
    const result = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest,
      fixtureMode: "successful-empty-response",
      attemptSchedule: schedule(),
    });
    if (result.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    expect(result.resultEnvelope.outcome).toBe("succeeded");
    if (result.resultEnvelope.outcome === "succeeded")
      expect(result.resultEnvelope.outputCharacterCount).toBe(0);
  });

  it("returns stable ordered capability mismatches without mutating either artifact", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    const before = JSON.stringify(request);
    const provider = createReasoningProviderCapabilityDescriptor({
      schemaVersion: "1.0",
      providerCapabilityId: "incompatible-evaluation",
      providerClass: "evaluation-provider",
      acceptedInvocationRequestVersions: ["1.0"],
      acceptedDeliveryEnvelopeVersions: ["1.0"],
      acceptedInputContentTypes: ["provider-neutral-instruction-blocks-v1"],
      acceptedOutputContentTypes: ["canonical-text"],
      maxInputCharacters: 1,
      maxOutputCharacters: 1,
      minTimeoutMilliseconds: 2_000,
      maxTimeoutMilliseconds: 3_000,
      supportedCancellationModes: ["cooperative-cancellation"],
      supportedRetryModes: ["retry-until-attempt-limit"],
      supportsDeterministicExecution: false,
      supportsUsageEvidence: false,
      supportsCostEvidence: false,
      supportsFailureEvidence: false,
      supportedResultEnvelopeVersions: ["1.0"],
    });
    const result = matchReasoningProviderCapabilities({
      invocationRequest: request,
      providerCapability: provider,
    });
    expect(result.status).toBe("incompatible");
    expect(result.reasonCodes).toEqual([...result.reasonCodes].sort());
    expect(result.reasonCodes.length).toBeGreaterThan(6);
    expect(JSON.stringify(request)).toBe(before);
  });

  it("rejects a compatibility-verifier wrapper accessor without invoking it", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const invocationRequest = createInvocation(runtime);
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const compatibility = matchReasoningProviderCapabilities({
      invocationRequest,
      providerCapability,
    });
    let accessorReads = 0;
    const wrapper = { compatibility, invocationRequest, providerCapability };
    Object.defineProperty(wrapper, "compatibility", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return compatibility;
      },
    });
    expect(verifyReasoningProviderCompatibilityResult(wrapper as never).status).toBe("invalid");
    expect(accessorReads).toBe(0);
  });

  it("rejects Delivery substitutions, conflicting idempotency, accessors, and public low-level persistence bypass", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: {
          ...runtime.deliveryIdentity,
          deliveryReceiptFingerprint: "0".repeat(64),
        },
        invocationRequest: request,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(),
      }),
    ).rejects.toMatchObject({ code: "delivery_integrity_failure" });
    const input = {
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    };
    let accesses = 0;
    Object.defineProperty(input, "invocationRequest", {
      enumerable: true,
      get() {
        accesses += 1;
        return request;
      },
    });
    await expect(invokeGovernedReasoning(input as never)).rejects.toMatchObject({
      code: "invalid_invocation",
    });
    expect(accesses).toBe(0);
    expect("registerInvocation" in runtime.executionEvidence).toBe(false);
    expect("finalizeInvocation" in runtime.executionEvidence).toBe(false);
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: runtime.deliveryIdentity,
        invocationRequest: request,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(),
        queryResult: { rawKnowledgeObjects: [] },
      } as never),
    ).rejects.toMatchObject({ code: "invalid_invocation" });
    expect("createDeterministicFakeReasoningProvider" in PublicKnowledgeEngine).toBe(false);
    expect("createGovernedReasoningExecutionEvidence" in PublicKnowledgeEngine).toBe(false);
  });

  it("keeps the sole fake-provider adapter free of network, credentials, randomness, implicit time, repository reads, and agents", async () => {
    const source = await readFile(
      new URL("../src/infrastructure/deterministic-fake-reasoning-provider.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /\b(?:fetch|Date\.now|Math\.random|process\.env|readFile|readdir|Repository|Hermes|MCP|agent)\b/u,
    );
  });

  it("classifies in-progress duplication, conflicting keys, and Attempt ID replay without rewriting evidence", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
    const provider = createDeterministicFakeReasoningProvider();
    const registered = await internal.registerGovernedInvocation(
      {
        schemaVersion: "1.0",
        expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
        expectedIdempotencyState: "unowned",
        invocationRequest: request,
        registeredAt: request.requestedAt,
      },
      {
        providerCapability: provider.providerCapability,
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
      },
    );
    if (registered.status !== "registered") throw new Error("registration failed");
    const duplicate = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    expect(duplicate.status).toBe("identical-in-progress");

    const { requestFingerprint: _fingerprint, ...unsigned } = request;
    void _fingerprint;
    const conflicting = createReasoningInvocationRequest({
      ...unsigned,
      reason: "Conflicting canonical Invocation content",
    });
    await expect(
      invokeGovernedReasoning({
        deliveryLedger: runtime.deliveryLedger,
        executionEvidence: runtime.executionEvidence,
        deliveryIdentity: runtime.deliveryIdentity,
        invocationRequest: conflicting,
        fixtureMode: "successful-structured-response",
        attemptSchedule: schedule(),
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });

    const ledgerHead = await internal.verifyIntegrity();
    const attempt = createReasoningExecutionAttempt({
      schemaVersion: "1.0",
      executionAttemptId: "attempt-replay-evaluation",
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: provider.providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: provider.providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: 1,
      startedAt: schedule()[0]!.startedAt,
      deadlineAt: schedule()[0]!.deadlineAt,
      cancellationState: "not-requested",
    });
    const append = {
      schemaVersion: "1.0" as const,
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress" as const,
      expectedPriorAttemptCount: 0,
      attempt,
    };
    expect(await internal.appendExecutionAttempt(append)).toEqual(attempt);
    expect(await internal.appendExecutionAttempt(append)).toEqual(attempt);
    const { attemptFingerprint: _attemptFingerprint, ...attemptUnsigned } = attempt;
    void _attemptFingerprint;
    const conflictingAttempt = createReasoningExecutionAttempt({
      ...attemptUnsigned,
      startedAt: "2026-07-29T01:00:03.000Z",
      deadlineAt: "2026-07-29T01:00:04.000Z",
    });
    await expect(
      internal.appendExecutionAttempt({ ...append, attempt: conflictingAttempt }),
    ).rejects.toThrow(/different content/u);
    expect(await internal.readAttemptHistory(request.invocationRequestId)).toEqual([attempt]);
  });

  it("enforces authoritative policy and prior-Outcome retry transitions during append and replay", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:append-lifecycle",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const registered = await internal.registerGovernedInvocation(
      {
        schemaVersion: "1.0",
        expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
        expectedIdempotencyState: "unowned",
        invocationRequest: request,
        registeredAt: request.requestedAt,
      },
      {
        providerCapability,
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
      },
    );
    if (registered.status !== "registered") throw new Error("registration failed");
    const firstTiming = schedule(2)[0]!;
    const firstAttempt = createReasoningExecutionAttempt({
      schemaVersion: "1.0",
      executionAttemptId: "reasoning-attempt-append-lifecycle-1",
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: 1,
      startedAt: firstTiming.startedAt,
      deadlineAt: firstTiming.deadlineAt,
      cancellationState: "not-requested",
    });
    const firstHead = await internal.verifyIntegrity();
    const firstAppend = {
      schemaVersion: "1.0" as const,
      expectedLedgerHead: {
        ledgerSequence: firstHead.verifiedThroughSequence,
        auditFingerprint: firstHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress" as const,
      expectedPriorAttemptCount: 0,
      attempt: firstAttempt,
    };
    const { attemptFingerprint: _firstFingerprint, ...firstUnsigned } = firstAttempt;
    void _firstFingerprint;
    const substitutedPolicyAttempt = createReasoningExecutionAttempt({
      ...firstUnsigned,
      executionPolicyFingerprint: "0".repeat(64),
    });
    await expect(
      internal.appendExecutionAttempt({ ...firstAppend, attempt: substitutedPolicyAttempt }),
    ).rejects.toThrow(/authoritative open Invocation/u);
    await internal.appendExecutionAttempt(firstAppend);

    const secondTiming = schedule(2)[1]!;
    const secondAttempt = createReasoningExecutionAttempt({
      ...firstUnsigned,
      executionAttemptId: "reasoning-attempt-append-lifecycle-2",
      attemptNumber: 2,
      previousExecutionAttemptId: firstAttempt.executionAttemptId,
      startedAt: secondTiming.startedAt,
      deadlineAt: secondTiming.deadlineAt,
    });
    const secondHead = await internal.verifyIntegrity();
    const secondAppend = {
      ...firstAppend,
      expectedLedgerHead: {
        ledgerSequence: secondHead.verifiedThroughSequence,
        auditFingerprint: secondHead.lastAuditFingerprint,
      },
      expectedPriorAttemptCount: 1,
      attempt: secondAttempt,
    };
    await expect(internal.appendExecutionAttempt(secondAppend)).rejects.toThrow(
      /authoritative open Invocation/u,
    );

    const ownershipEnvelope = JSON.parse(
      await readFile(join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json"), "utf8"),
    ) as { readonly event: unknown; readonly invocationAuthority: unknown };
    const firstAttemptEnvelope = JSON.parse(
      await readFile(join(runtime.reasoningRuntimeRoot, "events", "0000000000000002.json"), "utf8"),
    ) as { readonly event: { readonly auditFingerprint: string } };
    const secondRecord = createExecutionAttemptRecord({
      attempt: secondAttempt,
      ledgerSequence: 3,
      previousAuditFingerprint: firstAttemptEnvelope.event.auditFingerprint,
    });
    const prematureSecondEvent = createReasoningExecutionLedgerEvent({
      eventType: "execution-attempt",
      attemptRecord: secondRecord,
    });
    expect(() =>
      replayReasoningExecutionLedger(
        [ownershipEnvelope.event, firstAttemptEnvelope.event, prematureSecondEvent],
        [ownershipEnvelope.invocationAuthority] as never,
      ),
    ).toThrow(/ordering or ownership/u);

    const permanentFailure = createReasoningFailureEvidence({
      schemaVersion: "1.0",
      executionAttemptId: firstAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      failureCategory: "permanent-provider-failure",
      reasonCodes: ["permanent_provider_failure"],
      retryable: false,
      sanitizedDetail: "Permanent append transition failure",
      attemptNumber: 1,
    });
    const permanentOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: firstAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: firstTiming.completedAt,
      status: "failed",
      failureEvidence: permanentFailure,
    });
    await internal.appendProviderOutcome({
      schemaVersion: "1.0",
      expectedLedgerHead: secondAppend.expectedLedgerHead,
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      attemptFingerprint: firstAttempt.attemptFingerprint,
      outcome: permanentOutcome,
    });
    const outcomeHead = await internal.verifyIntegrity();
    await expect(
      internal.appendExecutionAttempt({
        ...secondAppend,
        expectedLedgerHead: {
          ledgerSequence: outcomeHead.verifiedThroughSequence,
          auditFingerprint: outcomeHead.lastAuditFingerprint,
        },
      }),
    ).rejects.toThrow(/authoritative open Invocation/u);
  });

  it("rejects coherent open-Attempt chronology and cancellation poison during append and replay", async () => {
    const cases = [
      {
        name: "first-before-request",
        cancellationMode: "not-cancellable" as const,
        startedAt: "2026-07-28T23:59:59.000Z",
        deadlineAt: "2026-07-29T00:00:00.000Z",
        cancellationState: "not-requested" as const,
      },
      {
        name: "before-observed-after-start",
        cancellationMode: "cancel-before-execution" as const,
        startedAt: "2026-07-29T01:00:01.000Z",
        deadlineAt: "2026-07-29T01:00:02.000Z",
        cancellationState: "requested-before-execution" as const,
        cancellationRequestedAt: "2026-07-29T01:00:00.900Z",
        cancellationObservedAt: "2026-07-29T01:00:01.050Z",
      },
      {
        name: "cooperative-request-before-start",
        cancellationMode: "cooperative-cancellation" as const,
        startedAt: "2026-07-29T01:00:01.000Z",
        deadlineAt: "2026-07-29T01:00:02.000Z",
        cancellationState: "requested-cooperatively" as const,
        cancellationRequestedAt: "2026-07-29T01:00:00.900Z",
        cancellationObservedAt: "2026-07-29T01:00:01.050Z",
      },
      {
        name: "deadline-request-before-deadline",
        cancellationMode: "deadline-cancellation" as const,
        startedAt: "2026-07-29T01:00:01.000Z",
        deadlineAt: "2026-07-29T01:00:02.000Z",
        cancellationState: "requested-at-deadline" as const,
        cancellationRequestedAt: "2026-07-29T01:00:01.900Z",
        cancellationObservedAt: "2026-07-29T01:00:02.000Z",
      },
      {
        name: "policy-mode-substitution",
        cancellationMode: "cancel-before-execution" as const,
        startedAt: "2026-07-29T01:00:01.000Z",
        deadlineAt: "2026-07-29T01:00:02.000Z",
        cancellationState: "requested-cooperatively" as const,
        cancellationRequestedAt: "2026-07-29T01:00:01.010Z",
        cancellationObservedAt: "2026-07-29T01:00:01.050Z",
      },
    ] as const;
    for (const poison of cases) {
      const runtime = await createReasoningTestRuntime(roots);
      const request = createInvocation(runtime, {
        idempotencyKey: `reasoning:key:open-attempt-poison:${poison.name}`,
        cancellationMode: poison.cancellationMode,
      });
      const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
      const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
      const registered = await internal.registerGovernedInvocation(
        {
          schemaVersion: "1.0",
          expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
          expectedIdempotencyState: "unowned",
          invocationRequest: request,
          registeredAt: request.requestedAt,
        },
        {
          providerCapability,
          contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
        },
      );
      if (registered.status !== "registered") throw new Error("registration failed");
      const attempt = createReasoningExecutionAttempt({
        schemaVersion: "1.0",
        executionAttemptId: `reasoning-attempt-open-poison-${poison.name}`,
        invocationRequestId: request.invocationRequestId,
        invocationRequestFingerprint: request.requestFingerprint,
        invocationIdempotencyKey: request.idempotencyKey,
        providerCapabilityId: providerCapability.providerCapabilityId,
        providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
        executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
        attemptNumber: 1,
        startedAt: poison.startedAt,
        deadlineAt: poison.deadlineAt,
        cancellationState: poison.cancellationState,
        ...(poison.cancellationState === "not-requested"
          ? {}
          : {
              cancellationAuthorityReference: `authority/open-poison-${poison.name}`,
              cancellationRequestedAt: poison.cancellationRequestedAt,
              cancellationObservedAt: poison.cancellationObservedAt,
            }),
      });
      const ownershipHead = await internal.verifyIntegrity();
      await expect(
        internal.appendExecutionAttempt({
          schemaVersion: "1.0",
          expectedLedgerHead: {
            ledgerSequence: ownershipHead.verifiedThroughSequence,
            auditFingerprint: ownershipHead.lastAuditFingerprint,
          },
          ownershipId: registered.ownership.ownershipId,
          expectedOwnershipStatus: "in-progress",
          expectedPriorAttemptCount: 0,
          attempt,
        }),
      ).rejects.toThrow(/authoritative open Invocation/u);

      const ownershipEnvelope = JSON.parse(
        await readFile(
          join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json"),
          "utf8",
        ),
      ) as {
        readonly event: { readonly auditFingerprint: string };
        readonly invocationAuthority: unknown;
      };
      const poisonRecord = createExecutionAttemptRecord({
        attempt,
        ledgerSequence: 2,
        previousAuditFingerprint: ownershipEnvelope.event.auditFingerprint,
      });
      expect(() =>
        replayReasoningExecutionLedger(
          [
            ownershipEnvelope.event,
            createReasoningExecutionLedgerEvent({
              eventType: "execution-attempt",
              attemptRecord: poisonRecord,
            }),
          ],
          [ownershipEnvelope.invocationAuthority] as never,
        ),
      ).toThrow(/ordering or ownership/u);
    }
  });

  it("rejects a coherent retry Attempt that starts before its predecessor Outcome completes", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:retry-predecessor-chronology",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const registered = await internal.registerGovernedInvocation(
      {
        schemaVersion: "1.0",
        expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
        expectedIdempotencyState: "unowned",
        invocationRequest: request,
        registeredAt: request.requestedAt,
      },
      {
        providerCapability,
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
      },
    );
    if (registered.status !== "registered") throw new Error("registration failed");
    const firstTiming = schedule(2)[0]!;
    const firstAttempt = createReasoningExecutionAttempt({
      schemaVersion: "1.0",
      executionAttemptId: "reasoning-attempt-retry-chronology-1",
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: 1,
      startedAt: firstTiming.startedAt,
      deadlineAt: firstTiming.deadlineAt,
      cancellationState: "not-requested",
    });
    let ledgerHead = await internal.verifyIntegrity();
    await internal.appendExecutionAttempt({
      schemaVersion: "1.0",
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      expectedPriorAttemptCount: 0,
      attempt: firstAttempt,
    });
    const failureEvidence = createReasoningFailureEvidence({
      schemaVersion: "1.0",
      executionAttemptId: firstAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      failureCategory: "transient-provider-failure",
      reasonCodes: ["transient_provider_failure"],
      retryable: true,
      sanitizedDetail: "Retry chronology baseline",
      attemptNumber: 1,
    });
    const firstOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: firstAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: "2026-07-29T01:00:01.500Z",
      status: "failed",
      failureEvidence,
    });
    ledgerHead = await internal.verifyIntegrity();
    await internal.appendProviderOutcome({
      schemaVersion: "1.0",
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      attemptFingerprint: firstAttempt.attemptFingerprint,
      outcome: firstOutcome,
    });
    const secondAttempt = createReasoningExecutionAttempt({
      schemaVersion: "1.0",
      executionAttemptId: "reasoning-attempt-retry-chronology-2",
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: 2,
      previousExecutionAttemptId: firstAttempt.executionAttemptId,
      startedAt: "2026-07-29T01:00:01.400Z",
      deadlineAt: "2026-07-29T01:00:02.400Z",
      cancellationState: "not-requested",
    });
    ledgerHead = await internal.verifyIntegrity();
    const secondAppend = {
      schemaVersion: "1.0" as const,
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress" as const,
      expectedPriorAttemptCount: 1,
      attempt: secondAttempt,
    };
    await expect(internal.appendExecutionAttempt(secondAppend)).rejects.toThrow(
      /authoritative open Invocation/u,
    );

    const envelopes = await Promise.all(
      [1, 2, 3].map(async (sequence) =>
        JSON.parse(
          await readFile(
            join(
              runtime.reasoningRuntimeRoot,
              "events",
              sequence.toString().padStart(16, "0") + ".json",
            ),
            "utf8",
          ),
        ),
      ),
    );
    const secondRecord = createExecutionAttemptRecord({
      attempt: secondAttempt,
      ledgerSequence: 4,
      previousAuditFingerprint: envelopes[2].event.auditFingerprint,
    });
    expect(() =>
      replayReasoningExecutionLedger(
        [
          ...envelopes.map((envelope) => envelope.event),
          createReasoningExecutionLedgerEvent({
            eventType: "execution-attempt",
            attemptRecord: secondRecord,
          }),
        ],
        [envelopes[0].invocationAuthority] as never,
      ),
    ).toThrow(/ordering or ownership/u);
  });

  it("rejects post-deadline and cancelled-state successes during append, finalization, and replay", async () => {
    const exercise = async (kind: "post-deadline" | "cancelled-state") => {
      const runtime = await createReasoningTestRuntime(roots);
      const cancellationMode =
        kind === "cancelled-state" ? "cooperative-cancellation" : "not-cancellable";
      const request = createInvocation(runtime, {
        idempotencyKey: `reasoning:key:persistence-${kind}`,
        cancellationMode,
      });
      const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
      const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
      const registered = await internal.registerGovernedInvocation(
        {
          schemaVersion: "1.0",
          expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
          expectedIdempotencyState: "unowned",
          invocationRequest: request,
          registeredAt: request.requestedAt,
        },
        {
          providerCapability,
          contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
        },
      );
      if (registered.status !== "registered") throw new Error("registration failed");
      const timing = schedule()[0]!;
      const attempt = createReasoningExecutionAttempt({
        schemaVersion: "1.0",
        executionAttemptId: `reasoning-attempt-persistence-${kind}`,
        invocationRequestId: request.invocationRequestId,
        invocationRequestFingerprint: request.requestFingerprint,
        invocationIdempotencyKey: request.idempotencyKey,
        providerCapabilityId: providerCapability.providerCapabilityId,
        providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
        executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
        attemptNumber: 1,
        startedAt: timing.startedAt,
        deadlineAt: timing.deadlineAt,
        cancellationState: kind === "cancelled-state" ? "requested-cooperatively" : "not-requested",
        ...(kind === "cancelled-state"
          ? {
              cancellationAuthorityReference: "authority/persistence-terminal-control",
              cancellationRequestedAt: "2026-07-29T01:00:01.010Z",
              cancellationObservedAt: "2026-07-29T01:00:01.050Z",
            }
          : {}),
      });
      const ownershipHead = await internal.verifyIntegrity();
      await internal.appendExecutionAttempt({
        schemaVersion: "1.0",
        expectedLedgerHead: {
          ledgerSequence: ownershipHead.verifiedThroughSequence,
          auditFingerprint: ownershipHead.lastAuditFingerprint,
        },
        ownershipId: registered.ownership.ownershipId,
        expectedOwnershipStatus: "in-progress",
        expectedPriorAttemptCount: 0,
        attempt,
      });
      const outputContent = {
        contentType: "canonical-json" as const,
        value: { status: "coherent-signed-success" },
      };
      const badOutcome = createReasoningProviderOutcome({
        schemaVersion: "1.0",
        executionAttemptId: attempt.executionAttemptId,
        invocationRequestId: request.invocationRequestId,
        attemptNumber: 1,
        completedAt: kind === "post-deadline" ? timing.deadlineAt : timing.completedAt,
        status: "succeeded",
        outputContent,
        outputCharacterCount: countOutputCharacters(outputContent),
        outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(outputContent),
      });
      if (badOutcome.status !== "succeeded") throw new Error("expected signed success attack");
      const attemptHead = await internal.verifyIntegrity();
      const badAppend = {
        schemaVersion: "1.0" as const,
        expectedLedgerHead: {
          ledgerSequence: attemptHead.verifiedThroughSequence,
          auditFingerprint: attemptHead.lastAuditFingerprint,
        },
        ownershipId: registered.ownership.ownershipId,
        expectedOwnershipStatus: "in-progress" as const,
        attemptFingerprint: attempt.attemptFingerprint,
        outcome: badOutcome,
      };
      await expect(internal.appendProviderOutcome(badAppend)).rejects.toThrow(
        /authoritative open Attempt/u,
      );

      const ownershipEnvelope = JSON.parse(
        await readFile(
          join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json"),
          "utf8",
        ),
      ) as { readonly event: unknown; readonly invocationAuthority: unknown };
      const attemptEnvelope = JSON.parse(
        await readFile(
          join(runtime.reasoningRuntimeRoot, "events", "0000000000000002.json"),
          "utf8",
        ),
      ) as { readonly event: { readonly auditFingerprint: string } };
      const badOutcomeRecord = createProviderOutcomeRecord({
        outcome: badOutcome,
        ledgerSequence: 3,
        previousAuditFingerprint: attemptEnvelope.event.auditFingerprint,
      });
      const badOutcomeEvent = createReasoningExecutionLedgerEvent({
        eventType: "provider-outcome",
        outcomeRecord: badOutcomeRecord,
      });
      expect(() =>
        replayReasoningExecutionLedger(
          [ownershipEnvelope.event, attemptEnvelope.event, badOutcomeEvent],
          [ownershipEnvelope.invocationAuthority] as never,
        ),
      ).toThrow(/does not bind one open Attempt/u);

      const { outcomeFingerprint: _badOutcomeFingerprint, ...badOutcomeUnsigned } = badOutcome;
      void _badOutcomeFingerprint;
      const validOutcome =
        kind === "post-deadline"
          ? createReasoningProviderOutcome({
              ...badOutcomeUnsigned,
              completedAt: timing.completedAt,
            })
          : createReasoningProviderOutcome({
              schemaVersion: "1.0",
              executionAttemptId: attempt.executionAttemptId,
              invocationRequestId: request.invocationRequestId,
              attemptNumber: 1,
              completedAt: timing.completedAt,
              status: "cancelled",
              cancellationEvidence: createReasoningCancellationEvidence({
                schemaVersion: "1.0",
                invocationRequestId: request.invocationRequestId,
                executionAttemptId: attempt.executionAttemptId,
                cancellationMode: "cooperative-cancellation",
                cancellationPhase: "cooperative-execution",
                cancellationAuthorityReference: "authority/persistence-terminal-control",
                requestedAt: "2026-07-29T01:00:01.010Z",
                observedAt: "2026-07-29T01:00:01.050Z",
                reasonCode: "cancelled_cooperatively",
              }),
            });
      await internal.appendProviderOutcome({ ...badAppend, outcome: validOutcome });

      const transactionId = `reasoning-finalization-persistence-${kind}`;
      const badArtifacts = createSuccessfulFinalizationArtifacts({
        request,
        providerCapability,
        attempt,
        outcome: badOutcome,
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
        transactionId,
      });
      const outcomeHead = await internal.verifyIntegrity();
      await expect(
        internal.finalizeInvocation({
          schemaVersion: "1.0",
          expectedLedgerHead: {
            ledgerSequence: outcomeHead.verifiedThroughSequence,
            auditFingerprint: outcomeHead.lastAuditFingerprint,
          },
          ownershipId: registered.ownership.ownershipId,
          expectedOwnershipStatus: "in-progress",
          expectedAttemptCount: 1,
          transactionId,
          resultEnvelope: badArtifacts.resultEnvelope,
          consumptionEvidence: badArtifacts.consumptionEvidence,
          finalizedAt: badOutcome.completedAt,
        }),
      ).rejects.toThrow(/does not verify against authoritative Attempts/u);
    };
    await exercise("post-deadline");
    await exercise("cancelled-state");
  });

  it("rejects a conflicting finalization without rewriting the committed result", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, { idempotencyKey: "reasoning:key:final-conflict" });
    const finalized = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    if (finalized.status === "identical-in-progress") throw new Error("unexpected in-progress");
    const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
    const ownership = await internal.resolveInvocationOwnership(request.idempotencyKey);
    if (ownership === null) throw new Error("missing ownership");
    const { consumptionFingerprint: _fingerprint, ...consumptionUnsigned } =
      finalized.consumptionEvidence;
    void _fingerprint;
    const transactionId = "reasoning-finalization-conflicting-evaluation";
    const consumption = createFinalizedReasoningConsumptionEvidence({
      ...consumptionUnsigned,
      executionLedgerTransactionId: transactionId,
    });
    const ledgerHead = await internal.verifyIntegrity();
    const conflict = await internal.finalizeInvocation({
      schemaVersion: "1.0",
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      expectedAttemptCount: consumption.attemptHistorySummary.attemptCount,
      transactionId,
      resultEnvelope: finalized.resultEnvelope,
      consumptionEvidence: consumption,
      finalizedAt: finalized.resultEnvelope.completedAt,
    });
    expect(conflict.status).toBe("conflict");
    expect(await internal.readFinalizedResult(request.invocationRequestId)).toEqual(
      finalized.resultEnvelope,
    );
  });

  it("detects Result and Consumption tampering, including re-signed semantic substitutions", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    const final = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    if (final.status === "identical-in-progress") throw new Error("unexpected in-progress result");
    const attempts = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    const outcome = await runtime.executionEvidence.readProviderOutcome(
      attempts[0]!.executionAttemptId,
    );
    if (outcome === null) throw new Error("missing outcome");
    const { resultEnvelopeFingerprint: _resultFingerprint, ...resultUnsigned } =
      final.resultEnvelope;
    void _resultFingerprint;
    const tampered = createReasoningResultEnvelope({
      ...resultUnsigned,
      consumerId: "substituted-consumer",
    });
    expect(
      verifyReasoningResultEnvelope({
        resultEnvelope: tampered,
        invocationRequest: request,
        providerCapability: {
          schemaVersion: "1.0",
          providerCapabilityId: final.resultEnvelope.providerCapabilityId,
          providerClass: "deterministic-fake-provider",
          acceptedInvocationRequestVersions: ["1.0"],
          acceptedDeliveryEnvelopeVersions: ["1.0"],
          acceptedInputContentTypes: ["provider-neutral-instruction-blocks-v1"],
          acceptedOutputContentTypes: ["canonical-json", "canonical-text"],
          maxInputCharacters: 1_000_000,
          maxOutputCharacters: 1_000_000,
          minTimeoutMilliseconds: 1,
          maxTimeoutMilliseconds: 86_400_000,
          supportedCancellationModes: [
            "cancel-before-execution",
            "cooperative-cancellation",
            "deadline-cancellation",
            "not-cancellable",
          ],
          supportedRetryModes: [
            "evaluation-only-retry",
            "no-retry",
            "retry-deterministic-transient-failure",
            "retry-until-attempt-limit",
          ],
          supportsDeterministicExecution: true,
          supportsUsageEvidence: true,
          supportsCostEvidence: true,
          supportsFailureEvidence: true,
          supportedResultEnvelopeVersions: ["1.0"],
          descriptorFingerprint: final.resultEnvelope.providerCapabilityFingerprint,
        },
        attempt: attempts[0]!,
        attemptHistory: attempts,
        providerOutcome: outcome,
        outcomeHistory: [outcome],
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
      }).status,
    ).toBe("invalid");
    const provider = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    const { receiptFingerprint: _receiptFingerprint, ...receiptUnsigned } =
      resultUnsigned.executionReceipt;
    const { usageFingerprint: _usageFingerprint, ...usageUnsigned } = resultUnsigned.usageEvidence;
    void _receiptFingerprint;
    void _usageFingerprint;
    const alteredOperationalEvidence = [
      createReasoningResultEnvelope({
        ...resultUnsigned,
        executionReceipt: createReasoningExecutionReceipt({
          ...receiptUnsigned,
          startedAt: request.requestedAt,
        }),
      }),
      createReasoningResultEnvelope({
        ...resultUnsigned,
        usageEvidence: createReasoningUsageEvidence({
          ...usageUnsigned,
          durationMilliseconds: resultUnsigned.usageEvidence.durationMilliseconds + 1,
          contextPackageObjectCount: contextPackageObjectCount + 1,
        }),
      }),
      createReasoningResultEnvelope({
        ...resultUnsigned,
        costEvidence: createReasoningCostEvidence({
          schemaVersion: "1.0",
          executionAttemptId: attempts[0]!.executionAttemptId,
          status: "unavailable",
          reasonCode: "cost_evidence_unavailable",
        } as never),
      }),
    ];
    for (const candidate of alteredOperationalEvidence)
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: candidate,
          invocationRequest: request,
          providerCapability: provider,
          attempt: attempts[0]!,
          attemptHistory: attempts,
          providerOutcome: outcome,
          outcomeHistory: [outcome],
          contextPackageObjectCount,
        }).status,
      ).toBe("invalid");
    const { consumptionFingerprint: _consumptionFingerprint, ...consumptionUnsigned } =
      final.consumptionEvidence;
    void _consumptionFingerprint;
    const resignedConsumption = createFinalizedReasoningConsumptionEvidence({
      ...consumptionUnsigned,
      executionLedgerTransactionId: "reasoning-finalization-substituted",
    });
    expect(
      verifyFinalizedReasoningConsumptionEvidence({
        consumptionEvidence: resignedConsumption,
        resultEnvelope: final.resultEnvelope,
        invocationRequest: request,
        providerCapability: provider,
        attempts,
        outcomes: [outcome],
        contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
        executionLedgerTransactionId: final.consumptionEvidence.executionLedgerTransactionId,
      }).status,
    ).toBe("invalid");
  });

  it("rejects public verifier wrapper and history accessors without invoking them", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:verifier-accessors",
    });
    const final = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    if (final.status === "identical-in-progress") throw new Error("unexpected in-progress");
    const attempts = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    const outcome = await runtime.executionEvidence.readProviderOutcome(
      attempts[0]!.executionAttemptId,
    );
    if (outcome === null) throw new Error("missing outcome");
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    let accessorReads = 0;
    const resultWrapper = {
      resultEnvelope: final.resultEnvelope,
      invocationRequest: request,
      providerCapability,
      attempt: attempts[0]!,
      attemptHistory: attempts,
      providerOutcome: outcome,
      outcomeHistory: [outcome],
      contextPackageObjectCount,
    };
    Object.defineProperty(resultWrapper, "providerOutcome", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return outcome;
      },
    });
    expect(verifyReasoningResultEnvelope(resultWrapper as never).status).toBe("invalid");
    expect(accessorReads).toBe(0);

    const consumptionBase = {
      consumptionEvidence: final.consumptionEvidence,
      resultEnvelope: final.resultEnvelope,
      invocationRequest: request,
      providerCapability,
      attempts,
      outcomes: [outcome],
      contextPackageObjectCount,
      executionLedgerTransactionId: final.consumptionEvidence.executionLedgerTransactionId,
    };
    const consumptionWrapper = { ...consumptionBase };
    Object.defineProperty(consumptionWrapper, "attempts", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return attempts;
      },
    });
    expect(verifyFinalizedReasoningConsumptionEvidence(consumptionWrapper as never).status).toBe(
      "invalid",
    );
    expect(accessorReads).toBe(0);

    for (const arrayField of ["attempts", "outcomes"] as const) {
      const accessorArray = [...consumptionBase[arrayField]];
      Object.defineProperty(accessorArray, "0", {
        enumerable: true,
        get() {
          accessorReads += 1;
          return consumptionBase[arrayField][0];
        },
      });
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          ...consumptionBase,
          [arrayField]: accessorArray,
        } as never).status,
      ).toBe("invalid");
      expect(accessorReads).toBe(0);
    }
  });

  it("independently verifies and exactly cross-binds every Result and Consumption context artifact", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:context-artifacts",
    });
    const final = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    if (final.status === "identical-in-progress") throw new Error("unexpected in-progress");
    const attempt = (
      await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId)
    )[0]!;
    const outcome = await runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId);
    if (outcome === null) throw new Error("missing outcome");
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    const assertInvalid = (context: {
      readonly invocationRequest: unknown;
      readonly providerCapability: unknown;
      readonly attempt: unknown;
    }) => {
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: final.resultEnvelope,
          invocationRequest: context.invocationRequest,
          providerCapability: context.providerCapability,
          attempt: context.attempt,
          attemptHistory: [context.attempt],
          providerOutcome: outcome,
          outcomeHistory: [outcome],
          contextPackageObjectCount,
        } as never).status,
      ).toBe("invalid");
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: final.consumptionEvidence,
          resultEnvelope: final.resultEnvelope,
          invocationRequest: context.invocationRequest,
          providerCapability: context.providerCapability,
          attempts: [context.attempt],
          outcomes: [outcome],
          contextPackageObjectCount,
          executionLedgerTransactionId: final.consumptionEvidence.executionLedgerTransactionId,
        } as never).status,
      ).toBe("invalid");
    };

    const { requestFingerprint: _requestFingerprint, ...requestUnsigned } = request;
    const { descriptorFingerprint: _descriptorFingerprint, ...providerUnsigned } =
      providerCapability;
    const { attemptFingerprint: _attemptFingerprint, ...attemptUnsigned } = attempt;
    void _requestFingerprint;
    void _descriptorFingerprint;
    void _attemptFingerprint;
    assertInvalid({
      invocationRequest: { ...request, reason: "Raw stale Request substitution" },
      providerCapability,
      attempt,
    });
    assertInvalid({
      invocationRequest: createReasoningInvocationRequest({
        ...requestUnsigned,
        reason: "Re-signed Request substitution",
      }),
      providerCapability,
      attempt,
    });
    assertInvalid({
      invocationRequest: request,
      providerCapability: {
        ...providerCapability,
        maxInputCharacters: providerCapability.maxInputCharacters + 1,
      },
      attempt,
    });
    assertInvalid({
      invocationRequest: request,
      providerCapability: createReasoningProviderCapabilityDescriptor({
        ...providerUnsigned,
        maxInputCharacters: providerCapability.maxInputCharacters + 1,
      }),
      attempt,
    });
    assertInvalid({
      invocationRequest: request,
      providerCapability,
      attempt: { ...attempt, cancellationState: "requested-cooperatively" },
    });
    assertInvalid({
      invocationRequest: request,
      providerCapability,
      attempt: createReasoningExecutionAttempt({
        ...attemptUnsigned,
        providerCapabilityId: "substituted-provider-capability",
      }),
    });

    const retryRuntime = await createReasoningTestRuntime(roots);
    const retryRequest = createInvocation(retryRuntime, {
      idempotencyKey: "reasoning:key:context-attempt-chain",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const retryFinal = await invokeGovernedReasoning({
      deliveryLedger: retryRuntime.deliveryLedger,
      executionEvidence: retryRuntime.executionEvidence,
      deliveryIdentity: retryRuntime.deliveryIdentity,
      invocationRequest: retryRequest,
      fixtureMode: "transient-failure-then-success",
      attemptSchedule: schedule(2),
    });
    if (retryFinal.status === "identical-in-progress") throw new Error("unexpected in-progress");
    const retryAttempts = await retryRuntime.executionEvidence.readAttemptHistory(
      retryRequest.invocationRequestId,
    );
    const retryOutcomes = await Promise.all(
      retryAttempts.map((entry) =>
        retryRuntime.executionEvidence.readProviderOutcome(entry.executionAttemptId),
      ),
    );
    if (retryOutcomes.some((entry) => entry === null)) throw new Error("missing retry outcome");
    const finalRetryOutcome = retryOutcomes[1];
    if (finalRetryOutcome === null || finalRetryOutcome === undefined)
      throw new Error("missing final retry outcome");
    const { attemptFingerprint: _secondFingerprint, ...secondUnsigned } = retryAttempts[1]!;
    void _secondFingerprint;
    for (const changedSecond of [
      createReasoningExecutionAttempt({
        ...secondUnsigned,
        previousExecutionAttemptId: "substituted-predecessor",
      }),
      createReasoningExecutionAttempt({ ...secondUnsigned, attemptNumber: 3 }),
    ]) {
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: retryFinal.resultEnvelope,
          invocationRequest: retryRequest,
          providerCapability,
          attempt: changedSecond,
          attemptHistory: [retryAttempts[0]!, changedSecond],
          providerOutcome: finalRetryOutcome,
          outcomeHistory: retryOutcomes as never,
          contextPackageObjectCount:
            retryRuntime.fixture.result.envelope.contextPackage.included.length,
        }).status,
      ).toBe("invalid");
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: retryFinal.consumptionEvidence,
          resultEnvelope: retryFinal.resultEnvelope,
          invocationRequest: retryRequest,
          providerCapability,
          attempts: [retryAttempts[0]!, changedSecond],
          outcomes: retryOutcomes,
          contextPackageObjectCount:
            retryRuntime.fixture.result.envelope.contextPackage.included.length,
          executionLedgerTransactionId: retryFinal.consumptionEvidence.executionLedgerTransactionId,
        } as never).status,
      ).toBe("invalid");
    }
  });

  it("rejects coherent re-signed over-limit, retry-transition, and policy substitutions", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:lifecycle-verification",
      retryMode: "retry-deterministic-transient-failure",
      maxAttemptCount: 2,
    });
    const final = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "transient-failure-then-success",
      attemptSchedule: schedule(2),
    });
    if (final.status === "identical-in-progress") throw new Error("unexpected in-progress");
    const attempts = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    const outcomes = await Promise.all(
      attempts.map((attempt) =>
        runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId),
      ),
    );
    if (outcomes.some((outcome) => outcome === null)) throw new Error("missing lifecycle outcome");
    const completeOutcomes = outcomes as Exclude<(typeof outcomes)[number], null>[];
    if (
      completeOutcomes[1]?.status !== "succeeded" ||
      final.resultEnvelope.outcome !== "succeeded" ||
      final.consumptionEvidence.finalOutcome !== "succeeded"
    )
      throw new Error("expected successful lifecycle baseline");
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    const assertPublicVerificationInvalid = (
      candidateAttempts: readonly (typeof attempts)[number][],
      candidateOutcomes: readonly (typeof completeOutcomes)[number][],
      resultEnvelope = final.resultEnvelope,
      consumptionEvidence = final.consumptionEvidence,
    ) => {
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope,
          invocationRequest: request,
          providerCapability,
          attempt: candidateAttempts.at(-1)!,
          attemptHistory: candidateAttempts,
          providerOutcome: candidateOutcomes.at(-1)!,
          outcomeHistory: candidateOutcomes,
          contextPackageObjectCount,
        }).status,
      ).toBe("invalid");
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence,
          resultEnvelope,
          invocationRequest: request,
          providerCapability,
          attempts: candidateAttempts,
          outcomes: candidateOutcomes,
          contextPackageObjectCount,
          executionLedgerTransactionId: consumptionEvidence.executionLedgerTransactionId,
        }).status,
      ).toBe("invalid");
    };

    const permanentFailure = createReasoningFailureEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempts[0]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      failureCategory: "permanent-provider-failure",
      reasonCodes: ["permanent_provider_failure"],
      retryable: false,
      sanitizedDetail: "Coherent permanent failure substitution",
      attemptNumber: 1,
    });
    const permanentOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempts[0]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: completeOutcomes[0]!.completedAt,
      status: "failed",
      failureEvidence: permanentFailure,
    });
    const timeoutEvidence = createReasoningTimeoutEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempts[0]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      configuredTimeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
      attemptStartedAt: attempts[0]!.startedAt,
      deadlineAt: attempts[0]!.deadlineAt!,
      elapsedMilliseconds: request.executionPolicy.timeoutMilliseconds,
      timeoutPhase: "during-execution",
      reasonCode: "execution_timeout",
    });
    const timeoutOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempts[0]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: completeOutcomes[0]!.completedAt,
      status: "timed-out",
      timeoutEvidence,
    });
    const cancellationEvidence = createReasoningCancellationEvidence({
      schemaVersion: "1.0",
      invocationRequestId: request.invocationRequestId,
      executionAttemptId: attempts[0]!.executionAttemptId,
      cancellationMode: "cooperative-cancellation",
      cancellationPhase: "cooperative-execution",
      cancellationAuthorityReference: "authority/coherent-cancellation-substitution",
      requestedAt: attempts[0]!.startedAt,
      observedAt: completeOutcomes[0]!.completedAt,
      reasonCode: "cancelled_cooperatively",
    });
    const cancellationOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempts[0]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: completeOutcomes[0]!.completedAt,
      status: "cancelled",
      cancellationEvidence,
    });
    const { outcomeFingerprint: _successfulFingerprint, ...successfulUnsigned } =
      completeOutcomes[1]!;
    void _successfulFingerprint;
    const successfulOutcome = createReasoningProviderOutcome({
      ...successfulUnsigned,
      executionAttemptId: attempts[0]!.executionAttemptId,
      attemptNumber: 1,
      completedAt: completeOutcomes[0]!.completedAt,
    });
    for (const unauthorizedPriorOutcome of [
      permanentOutcome,
      timeoutOutcome,
      cancellationOutcome,
      successfulOutcome,
    ])
      assertPublicVerificationInvalid(attempts, [unauthorizedPriorOutcome, completeOutcomes[1]!]);

    const { attemptFingerprint: _attemptFingerprint, ...secondAttemptUnsigned } = attempts[1]!;
    void _attemptFingerprint;
    const substitutedPolicyAttempt = createReasoningExecutionAttempt({
      ...secondAttemptUnsigned,
      executionPolicyFingerprint: "0".repeat(64),
    });
    assertPublicVerificationInvalid([attempts[0]!, substitutedPolicyAttempt], completeOutcomes);

    const secondTransientFailure = createReasoningFailureEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempts[1]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      failureCategory: "transient-provider-failure",
      reasonCodes: ["transient_provider_failure"],
      retryable: true,
      sanitizedDetail: "Coherent second transient failure",
      attemptNumber: 2,
    });
    const secondTransientOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempts[1]!.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 2,
      completedAt: completeOutcomes[1]!.completedAt,
      status: "failed",
      failureEvidence: secondTransientFailure,
    });
    const thirdAttempt = createReasoningExecutionAttempt({
      ...secondAttemptUnsigned,
      executionAttemptId: "reasoning-attempt-coherent-over-limit",
      attemptNumber: 3,
      previousExecutionAttemptId: attempts[1]!.executionAttemptId,
      startedAt: "2026-07-29T01:00:04.000Z",
      deadlineAt: "2026-07-29T01:00:05.000Z",
    });
    const { outcomeFingerprint: _outcomeFingerprint, ...thirdOutcomeUnsigned } =
      completeOutcomes[1]!;
    void _outcomeFingerprint;
    const thirdOutcome = createReasoningProviderOutcome({
      ...thirdOutcomeUnsigned,
      executionAttemptId: thirdAttempt.executionAttemptId,
      attemptNumber: 3,
      completedAt: "2026-07-29T01:00:04.500Z",
    });
    if (thirdOutcome.status !== "succeeded") throw new Error("expected successful third outcome");
    const thirdReceipt = createReasoningExecutionReceipt({
      schemaVersion: "1.0",
      executionAttemptId: thirdAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      providerCapabilityId: providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
      attemptNumber: 3,
      startedAt: thirdAttempt.startedAt,
      completedAt: thirdOutcome.completedAt,
      outcome: thirdOutcome.status,
    });
    const { usageFingerprint: _usageFingerprint, ...usageUnsigned } =
      final.resultEnvelope.usageEvidence;
    void _usageFingerprint;
    const thirdUsage = createReasoningUsageEvidence({
      ...usageUnsigned,
      executionAttemptId: thirdAttempt.executionAttemptId,
      attemptNumber: 3,
      durationMilliseconds: 500,
    });
    const { costFingerprint: _costFingerprint, ...costUnsigned } =
      final.resultEnvelope.costEvidence;
    void _costFingerprint;
    const thirdCost = createReasoningCostEvidence({
      ...costUnsigned,
      executionAttemptId: thirdAttempt.executionAttemptId,
    });
    const { resultEnvelopeFingerprint: _resultFingerprint, ...resultUnsigned } =
      final.resultEnvelope;
    void _resultFingerprint;
    const thirdResult = createReasoningResultEnvelope({
      ...resultUnsigned,
      executionAttemptId: thirdAttempt.executionAttemptId,
      attemptNumber: 3,
      completedAt: thirdOutcome.completedAt,
      executionReceipt: thirdReceipt,
      usageEvidence: thirdUsage,
      costEvidence: thirdCost,
    });
    if (thirdResult.outcome !== "succeeded") throw new Error("expected successful third result");
    const overLimitAttempts = [...attempts, thirdAttempt];
    const overLimitOutcomes = [completeOutcomes[0]!, secondTransientOutcome, thirdOutcome];
    const historyEntries = overLimitAttempts.map((attempt, index) => ({
      executionAttemptId: attempt.executionAttemptId,
      attemptNumber: attempt.attemptNumber,
      outcome: overLimitOutcomes[index]!.status,
      attemptFingerprint: attempt.attemptFingerprint,
      outcomeFingerprint: overLimitOutcomes[index]!.outcomeFingerprint,
    }));
    const historyUnsigned = {
      attemptCount: 3,
      finalAttemptNumber: 3,
      finalOutcome: thirdOutcome.status,
      attempts: historyEntries,
    };
    const { consumptionFingerprint: _consumptionFingerprint, ...consumptionUnsigned } =
      final.consumptionEvidence;
    void _consumptionFingerprint;
    const thirdConsumption = createFinalizedReasoningConsumptionEvidence({
      ...consumptionUnsigned,
      finalResultEnvelopeId: thirdResult.resultEnvelopeId,
      finalResultEnvelopeFingerprint: thirdResult.resultEnvelopeFingerprint,
      finalOutcome: thirdResult.outcome,
      attemptHistorySummary: {
        ...historyUnsigned,
        historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(historyUnsigned),
      },
      usageEvidenceFingerprint: thirdUsage.usageFingerprint,
      costEvidenceFingerprint: thirdCost.costFingerprint,
      completedAt: thirdOutcome.completedAt,
    });
    assertPublicVerificationInvalid(
      overLimitAttempts,
      overLimitOutcomes,
      thirdResult,
      thirdConsumption,
    );
  });

  it("rejects coherent re-signed post-deadline and cancelled-state successes", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:terminal-control-verification",
      cancellationMode: "cooperative-cancellation",
    });
    const finalized = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    if (
      finalized.status === "identical-in-progress" ||
      finalized.resultEnvelope.outcome !== "succeeded"
    )
      throw new Error("expected successful baseline");
    const [attempt] = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    if (attempt === undefined) throw new Error("missing baseline Attempt");
    const outcome = await runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId);
    if (outcome?.status !== "succeeded") throw new Error("missing successful baseline Outcome");
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    const assertRejected = (
      candidateAttempt: ReasoningExecutionAttempt,
      candidateOutcome: Extract<ReasoningProviderOutcome, { readonly status: "succeeded" }>,
      suffix: string,
    ) => {
      const artifacts = createSuccessfulFinalizationArtifacts({
        request,
        providerCapability,
        attempt: candidateAttempt,
        outcome: candidateOutcome,
        contextPackageObjectCount,
        transactionId: `reasoning-finalization-${suffix}`,
      });
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: artifacts.resultEnvelope,
          invocationRequest: request,
          providerCapability,
          attempt: candidateAttempt,
          attemptHistory: [candidateAttempt],
          providerOutcome: candidateOutcome,
          outcomeHistory: [candidateOutcome],
          contextPackageObjectCount,
        }).status,
      ).toBe("invalid");
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: artifacts.consumptionEvidence,
          resultEnvelope: artifacts.resultEnvelope,
          invocationRequest: request,
          providerCapability,
          attempts: [candidateAttempt],
          outcomes: [candidateOutcome],
          contextPackageObjectCount,
          executionLedgerTransactionId: `reasoning-finalization-${suffix}`,
        }).status,
      ).toBe("invalid");
    };
    const { outcomeFingerprint: _outcomeFingerprint, ...outcomeUnsigned } = outcome;
    void _outcomeFingerprint;
    const postDeadlineOutcome = createReasoningProviderOutcome({
      ...outcomeUnsigned,
      completedAt: attempt.deadlineAt!,
    });
    if (postDeadlineOutcome.status !== "succeeded")
      throw new Error("expected post-deadline success");
    assertRejected(attempt, postDeadlineOutcome, "post-deadline-success");
    const { attemptFingerprint: _attemptFingerprint, ...attemptUnsigned } = attempt;
    void _attemptFingerprint;
    const cancelledAttempt = createReasoningExecutionAttempt({
      ...attemptUnsigned,
      cancellationState: "requested-cooperatively",
      cancellationAuthorityReference: "authority/coherent-cancelled-state-success",
      cancellationRequestedAt: "2026-07-29T01:00:01.010Z",
      cancellationObservedAt: "2026-07-29T01:00:01.050Z",
    });
    assertRejected(cancelledAttempt, outcome, "cancelled-state-success");
  });

  it("rejects coherent re-signed timeout and cancellation evidence mismatches", async () => {
    const assertTerminalVerificationInvalid = (input: {
      readonly request: ReasoningInvocationRequest;
      readonly providerCapability: ReasoningProviderCapabilityDescriptor;
      readonly attempt: ReasoningExecutionAttempt;
      readonly outcome: ReasoningProviderOutcome;
      readonly resultEnvelope: Parameters<
        typeof verifyReasoningResultEnvelope
      >[0]["resultEnvelope"];
      readonly consumptionEvidence: Parameters<
        typeof verifyFinalizedReasoningConsumptionEvidence
      >[0]["consumptionEvidence"];
      readonly contextPackageObjectCount: number;
      readonly transactionId: string;
    }) => {
      expect(
        verifyReasoningResultEnvelope({
          resultEnvelope: input.resultEnvelope,
          invocationRequest: input.request,
          providerCapability: input.providerCapability,
          attempt: input.attempt,
          attemptHistory: [input.attempt],
          providerOutcome: input.outcome,
          outcomeHistory: [input.outcome],
          contextPackageObjectCount: input.contextPackageObjectCount,
        }).status,
      ).toBe("invalid");
      expect(
        verifyFinalizedReasoningConsumptionEvidence({
          consumptionEvidence: input.consumptionEvidence,
          resultEnvelope: input.resultEnvelope as never,
          invocationRequest: input.request,
          providerCapability: input.providerCapability,
          attempts: [input.attempt],
          outcomes: [input.outcome],
          contextPackageObjectCount: input.contextPackageObjectCount,
          executionLedgerTransactionId: input.transactionId,
        }).status,
      ).toBe("invalid");
    };

    const timeoutRuntime = await createReasoningTestRuntime(roots);
    const timeoutRequest = createInvocation(timeoutRuntime, {
      idempotencyKey: "reasoning:key:timeout-evidence-mismatch",
    });
    const timeoutFinal = await invokeGovernedReasoning({
      deliveryLedger: timeoutRuntime.deliveryLedger,
      executionEvidence: timeoutRuntime.executionEvidence,
      deliveryIdentity: timeoutRuntime.deliveryIdentity,
      invocationRequest: timeoutRequest,
      fixtureMode: "timeout",
      attemptSchedule: [{ ...schedule()[0]!, completedAt: schedule()[0]!.deadlineAt }],
    });
    if (
      timeoutFinal.status === "identical-in-progress" ||
      timeoutFinal.resultEnvelope.outcome !== "timed-out" ||
      timeoutFinal.consumptionEvidence.finalOutcome !== "timed-out"
    )
      throw new Error("expected timeout baseline");
    const [timeoutAttempt] = await timeoutRuntime.executionEvidence.readAttemptHistory(
      timeoutRequest.invocationRequestId,
    );
    const timeoutOutcome = await timeoutRuntime.executionEvidence.readProviderOutcome(
      timeoutAttempt!.executionAttemptId,
    );
    if (timeoutOutcome?.status !== "timed-out") throw new Error("missing timeout Outcome");
    const { timeoutFingerprint: _timeoutFingerprint, ...timeoutEvidenceUnsigned } =
      timeoutOutcome.timeoutEvidence;
    void _timeoutFingerprint;
    const changedTimeoutEvidence = createReasoningTimeoutEvidence({
      ...timeoutEvidenceUnsigned,
      elapsedMilliseconds: timeoutEvidenceUnsigned.elapsedMilliseconds + 1,
    });
    const { outcomeFingerprint: _timeoutOutcomeFingerprint, ...timeoutOutcomeUnsigned } =
      timeoutOutcome;
    void _timeoutOutcomeFingerprint;
    const changedTimeoutOutcome = createReasoningProviderOutcome({
      ...timeoutOutcomeUnsigned,
      timeoutEvidence: changedTimeoutEvidence,
    });
    const { resultEnvelopeFingerprint: _timeoutResultFingerprint, ...timeoutResultUnsigned } =
      timeoutFinal.resultEnvelope;
    void _timeoutResultFingerprint;
    const changedTimeoutResult = createReasoningResultEnvelope({
      ...timeoutResultUnsigned,
      timeoutEvidence: changedTimeoutEvidence,
    });
    const timeoutHistoryUnsigned = {
      attemptCount: 1,
      finalAttemptNumber: 1,
      finalOutcome: "timed-out" as const,
      attempts: [
        {
          executionAttemptId: timeoutAttempt!.executionAttemptId,
          attemptNumber: 1,
          outcome: "timed-out" as const,
          attemptFingerprint: timeoutAttempt!.attemptFingerprint,
          outcomeFingerprint: changedTimeoutOutcome.outcomeFingerprint,
        },
      ],
    };
    const {
      consumptionFingerprint: _timeoutConsumptionFingerprint,
      ...timeoutConsumptionUnsigned
    } = timeoutFinal.consumptionEvidence;
    void _timeoutConsumptionFingerprint;
    const timeoutTransactionId = "reasoning-finalization-timeout-evidence-mismatch";
    const changedTimeoutConsumption = createFinalizedReasoningConsumptionEvidence({
      ...timeoutConsumptionUnsigned,
      finalResultEnvelopeFingerprint: changedTimeoutResult.resultEnvelopeFingerprint,
      attemptHistorySummary: {
        ...timeoutHistoryUnsigned,
        historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(timeoutHistoryUnsigned),
      },
      timeoutEvidenceFingerprint: changedTimeoutEvidence.timeoutFingerprint,
      executionLedgerTransactionId: timeoutTransactionId,
    });
    assertTerminalVerificationInvalid({
      request: timeoutRequest,
      providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
      attempt: timeoutAttempt!,
      outcome: changedTimeoutOutcome,
      resultEnvelope: changedTimeoutResult,
      consumptionEvidence: changedTimeoutConsumption,
      contextPackageObjectCount:
        timeoutRuntime.fixture.result.envelope.contextPackage.included.length,
      transactionId: timeoutTransactionId,
    });

    const cancellationRuntime = await createReasoningTestRuntime(roots);
    const cancellationRequest = createInvocation(cancellationRuntime, {
      idempotencyKey: "reasoning:key:cancellation-evidence-mismatch",
      cancellationMode: "cooperative-cancellation",
    });
    const cancellationSignal = {
      state: "requested-cooperatively" as const,
      authorityReference: "authority/cancellation-evidence-mismatch",
      requestedAt: "2026-07-29T01:00:01.010Z",
      observedAt: "2026-07-29T01:00:01.050Z",
    };
    const cancellationFinal = await invokeGovernedReasoning({
      deliveryLedger: cancellationRuntime.deliveryLedger,
      executionEvidence: cancellationRuntime.executionEvidence,
      deliveryIdentity: cancellationRuntime.deliveryIdentity,
      invocationRequest: cancellationRequest,
      fixtureMode: "cooperative-cancellation",
      attemptSchedule: schedule(1, cancellationSignal),
    });
    if (
      cancellationFinal.status === "identical-in-progress" ||
      cancellationFinal.resultEnvelope.outcome !== "cancelled" ||
      cancellationFinal.consumptionEvidence.finalOutcome !== "cancelled"
    )
      throw new Error("expected cancellation baseline");
    const [cancellationAttempt] = await cancellationRuntime.executionEvidence.readAttemptHistory(
      cancellationRequest.invocationRequestId,
    );
    const cancellationOutcome = await cancellationRuntime.executionEvidence.readProviderOutcome(
      cancellationAttempt!.executionAttemptId,
    );
    if (cancellationOutcome?.status !== "cancelled")
      throw new Error("missing cancellation Outcome");
    const { cancellationFingerprint: _cancellationFingerprint, ...cancellationUnsigned } =
      cancellationOutcome.cancellationEvidence;
    void _cancellationFingerprint;
    const changedCancellationEvidence = createReasoningCancellationEvidence({
      ...cancellationUnsigned,
      cancellationAuthorityReference: "authority/re-signed-substitution",
      observedAt: "2026-07-29T01:00:01.200Z",
    });
    const { outcomeFingerprint: _cancelOutcomeFingerprint, ...cancelOutcomeUnsigned } =
      cancellationOutcome;
    void _cancelOutcomeFingerprint;
    const changedCancellationOutcome = createReasoningProviderOutcome({
      ...cancelOutcomeUnsigned,
      cancellationEvidence: changedCancellationEvidence,
    });
    const { resultEnvelopeFingerprint: _cancelResultFingerprint, ...cancelResultUnsigned } =
      cancellationFinal.resultEnvelope;
    void _cancelResultFingerprint;
    const changedCancellationResult = createReasoningResultEnvelope({
      ...cancelResultUnsigned,
      cancellationEvidence: changedCancellationEvidence,
    });
    const cancellationHistoryUnsigned = {
      attemptCount: 1,
      finalAttemptNumber: 1,
      finalOutcome: "cancelled" as const,
      attempts: [
        {
          executionAttemptId: cancellationAttempt!.executionAttemptId,
          attemptNumber: 1,
          outcome: "cancelled" as const,
          attemptFingerprint: cancellationAttempt!.attemptFingerprint,
          outcomeFingerprint: changedCancellationOutcome.outcomeFingerprint,
        },
      ],
    };
    const { consumptionFingerprint: _cancelConsumptionFingerprint, ...cancelConsumptionUnsigned } =
      cancellationFinal.consumptionEvidence;
    void _cancelConsumptionFingerprint;
    const cancellationTransactionId = "reasoning-finalization-cancellation-evidence-mismatch";
    const changedCancellationConsumption = createFinalizedReasoningConsumptionEvidence({
      ...cancelConsumptionUnsigned,
      finalResultEnvelopeFingerprint: changedCancellationResult.resultEnvelopeFingerprint,
      attemptHistorySummary: {
        ...cancellationHistoryUnsigned,
        historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(
          cancellationHistoryUnsigned,
        ),
      },
      cancellationEvidenceFingerprint: changedCancellationEvidence.cancellationFingerprint,
      executionLedgerTransactionId: cancellationTransactionId,
    });
    assertTerminalVerificationInvalid({
      request: cancellationRequest,
      providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
      attempt: cancellationAttempt!,
      outcome: changedCancellationOutcome,
      resultEnvelope: changedCancellationResult,
      consumptionEvidence: changedCancellationConsumption,
      contextPackageObjectCount:
        cancellationRuntime.fixture.result.envelope.contextPackage.included.length,
      transactionId: cancellationTransactionId,
    });
  });

  it("rejects a coherent re-signed non-canonical runtime timeout reason", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:timeout-reason-substitution",
    });
    const finalized = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "timeout",
      attemptSchedule: [{ ...schedule()[0]!, completedAt: schedule()[0]!.deadlineAt }],
    });
    if (
      finalized.status === "identical-in-progress" ||
      finalized.resultEnvelope.outcome !== "timed-out" ||
      finalized.consumptionEvidence.finalOutcome !== "timed-out"
    )
      throw new Error("expected timeout baseline");
    const [attempt] = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    if (attempt === undefined) throw new Error("missing timeout Attempt");
    const outcome = await runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId);
    if (outcome?.status !== "timed-out") throw new Error("missing timeout Outcome");
    const { timeoutFingerprint: _timeoutFingerprint, ...timeoutUnsigned } = outcome.timeoutEvidence;
    void _timeoutFingerprint;
    const substitutedEvidence = createReasoningTimeoutEvidence({
      ...timeoutUnsigned,
      reasonCode: "execution_timeout",
    });
    const { outcomeFingerprint: _outcomeFingerprint, ...outcomeUnsigned } = outcome;
    void _outcomeFingerprint;
    const substitutedOutcome = createReasoningProviderOutcome({
      ...outcomeUnsigned,
      timeoutEvidence: substitutedEvidence,
    });
    const { resultEnvelopeFingerprint: _resultFingerprint, ...resultUnsigned } =
      finalized.resultEnvelope;
    void _resultFingerprint;
    const substitutedResult = createReasoningResultEnvelope({
      ...resultUnsigned,
      timeoutEvidence: substitutedEvidence,
    });
    const historyUnsigned = {
      attemptCount: 1,
      finalAttemptNumber: 1,
      finalOutcome: "timed-out" as const,
      attempts: [
        {
          executionAttemptId: attempt.executionAttemptId,
          attemptNumber: 1,
          outcome: "timed-out" as const,
          attemptFingerprint: attempt.attemptFingerprint,
          outcomeFingerprint: substitutedOutcome.outcomeFingerprint,
        },
      ],
    };
    const { consumptionFingerprint: _consumptionFingerprint, ...consumptionUnsigned } =
      finalized.consumptionEvidence;
    void _consumptionFingerprint;
    const transactionId = "reasoning-finalization-timeout-reason-substitution";
    const substitutedConsumption = createFinalizedReasoningConsumptionEvidence({
      ...consumptionUnsigned,
      finalResultEnvelopeFingerprint: substitutedResult.resultEnvelopeFingerprint,
      attemptHistorySummary: {
        ...historyUnsigned,
        historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(historyUnsigned),
      },
      timeoutEvidenceFingerprint: substitutedEvidence.timeoutFingerprint,
      executionLedgerTransactionId: transactionId,
    });
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    expect(
      verifyReasoningResultEnvelope({
        resultEnvelope: substitutedResult,
        invocationRequest: request,
        providerCapability,
        attempt,
        attemptHistory: [attempt],
        providerOutcome: substitutedOutcome,
        outcomeHistory: [substitutedOutcome],
        contextPackageObjectCount,
      }).status,
    ).toBe("invalid");
    expect(
      verifyFinalizedReasoningConsumptionEvidence({
        consumptionEvidence: substitutedConsumption,
        resultEnvelope: substitutedResult,
        invocationRequest: request,
        providerCapability,
        attempts: [attempt],
        outcomes: [substitutedOutcome],
        contextPackageObjectCount,
        executionLedgerTransactionId: transactionId,
      }).status,
    ).toBe("invalid");
  });

  it("rejects coherent cooperative timeout observation after completion across every lifecycle path", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime, {
      idempotencyKey: "reasoning:key:cooperative-timeout-observation-after-completion",
      cancellationMode: "cooperative-cancellation",
    });
    const cancellationSignal = {
      state: "requested-cooperatively" as const,
      authorityReference: "authority/cooperative-timeout-observation",
      requestedAt: "2026-07-29T01:00:01.900Z",
      observedAt: "2026-07-29T01:00:02.050Z",
    };
    const finalized = await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: [
        {
          ...schedule(1, cancellationSignal)[0]!,
          completedAt: "2026-07-29T01:00:02.100Z",
        },
      ],
    });
    if (
      finalized.status === "identical-in-progress" ||
      finalized.resultEnvelope.outcome !== "timed-out" ||
      finalized.consumptionEvidence.finalOutcome !== "timed-out"
    )
      throw new Error("expected cooperative timeout baseline");
    const [attempt] = await runtime.executionEvidence.readAttemptHistory(
      request.invocationRequestId,
    );
    if (attempt === undefined) throw new Error("missing cooperative timeout Attempt");
    const outcome = await runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId);
    if (outcome?.status !== "timed-out") throw new Error("missing cooperative timeout Outcome");
    const { attemptFingerprint: _attemptFingerprint, ...attemptUnsigned } = attempt;
    void _attemptFingerprint;
    const poisonedAttempt = createReasoningExecutionAttempt({
      ...attemptUnsigned,
      cancellationObservedAt: "2026-07-29T01:00:02.200Z",
    });
    const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
    const contextPackageObjectCount =
      runtime.fixture.result.envelope.contextPackage.included.length;
    expect(
      verifyReasoningAttemptLifecycle({
        invocationRequest: request,
        providerCapability,
        attempts: [poisonedAttempt],
        outcomes: [outcome],
      }),
    ).toBe(false);
    expect(
      verifyReasoningResultEnvelope({
        resultEnvelope: finalized.resultEnvelope,
        invocationRequest: request,
        providerCapability,
        attempt: poisonedAttempt,
        attemptHistory: [poisonedAttempt],
        providerOutcome: outcome,
        outcomeHistory: [outcome],
        contextPackageObjectCount,
      }).status,
    ).toBe("invalid");
    const historyUnsigned = {
      attemptCount: 1,
      finalAttemptNumber: 1,
      finalOutcome: "timed-out" as const,
      attempts: [
        {
          executionAttemptId: poisonedAttempt.executionAttemptId,
          attemptNumber: 1,
          outcome: "timed-out" as const,
          attemptFingerprint: poisonedAttempt.attemptFingerprint,
          outcomeFingerprint: outcome.outcomeFingerprint,
        },
      ],
    };
    const { consumptionFingerprint: _consumptionFingerprint, ...consumptionUnsigned } =
      finalized.consumptionEvidence;
    void _consumptionFingerprint;
    const transactionId = "reasoning-finalization-cooperative-observation-after-completion";
    const poisonedConsumption = createFinalizedReasoningConsumptionEvidence({
      ...consumptionUnsigned,
      attemptHistorySummary: {
        ...historyUnsigned,
        historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(historyUnsigned),
      },
      executionLedgerTransactionId: transactionId,
    });
    expect(
      verifyFinalizedReasoningConsumptionEvidence({
        consumptionEvidence: poisonedConsumption,
        resultEnvelope: finalized.resultEnvelope,
        invocationRequest: request,
        providerCapability,
        attempts: [poisonedAttempt],
        outcomes: [outcome],
        contextPackageObjectCount,
        executionLedgerTransactionId: transactionId,
      }).status,
    ).toBe("invalid");

    const persistenceRuntime = await createReasoningTestRuntime(roots);
    const internal = resolveInternalReasoningExecutionEvidence(
      persistenceRuntime.executionEvidence,
    );
    const registered = await internal.registerGovernedInvocation(
      {
        schemaVersion: "1.0",
        expectedLedgerHead: { ledgerSequence: 0, auditFingerprint: "genesis" },
        expectedIdempotencyState: "unowned",
        invocationRequest: request,
        registeredAt: request.requestedAt,
      },
      { providerCapability, contextPackageObjectCount },
    );
    if (registered.status !== "registered") throw new Error("registration failed");
    let ledgerHead = await internal.verifyIntegrity();
    await internal.appendExecutionAttempt({
      schemaVersion: "1.0",
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      expectedPriorAttemptCount: 0,
      attempt: poisonedAttempt,
    });
    ledgerHead = await internal.verifyIntegrity();
    const poisonedOutcomeAppend = {
      schemaVersion: "1.0" as const,
      expectedLedgerHead: {
        ledgerSequence: ledgerHead.verifiedThroughSequence,
        auditFingerprint: ledgerHead.lastAuditFingerprint,
      },
      ownershipId: registered.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress" as const,
      attemptFingerprint: poisonedAttempt.attemptFingerprint,
      outcome,
    };
    await expect(internal.appendProviderOutcome(poisonedOutcomeAppend)).rejects.toThrow(
      /authoritative open Attempt/u,
    );

    const ownershipEnvelope = JSON.parse(
      await readFile(
        join(persistenceRuntime.reasoningRuntimeRoot, "events", "0000000000000001.json"),
        "utf8",
      ),
    ) as { readonly event: unknown; readonly invocationAuthority: unknown };
    const attemptEnvelope = JSON.parse(
      await readFile(
        join(persistenceRuntime.reasoningRuntimeRoot, "events", "0000000000000002.json"),
        "utf8",
      ),
    ) as { readonly event: { readonly auditFingerprint: string } };
    const poisonedOutcomeRecord = createProviderOutcomeRecord({
      outcome,
      ledgerSequence: 3,
      previousAuditFingerprint: attemptEnvelope.event.auditFingerprint,
    });
    expect(() =>
      replayReasoningExecutionLedger(
        [
          ownershipEnvelope.event,
          attemptEnvelope.event,
          createReasoningExecutionLedgerEvent({
            eventType: "provider-outcome",
            outcomeRecord: poisonedOutcomeRecord,
          }),
        ],
        [ownershipEnvelope.invocationAuthority] as never,
      ),
    ).toThrow(/does not bind one open Attempt/u);

    const validCompletedAt = poisonedAttempt.cancellationObservedAt!;
    const validTimeoutEvidence = createReasoningTimeoutEvidence({
      schemaVersion: "1.0",
      executionAttemptId: poisonedAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      configuredTimeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
      attemptStartedAt: poisonedAttempt.startedAt,
      deadlineAt: poisonedAttempt.deadlineAt!,
      elapsedMilliseconds: Date.parse(validCompletedAt) - Date.parse(poisonedAttempt.startedAt),
      timeoutPhase: "during-execution",
      reasonCode: "execution_deadline_reached",
    });
    const validOutcome = createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: poisonedAttempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: 1,
      completedAt: validCompletedAt,
      status: "timed-out",
      timeoutEvidence: validTimeoutEvidence,
    });
    await internal.appendProviderOutcome({ ...poisonedOutcomeAppend, outcome: validOutcome });
    ledgerHead = await internal.verifyIntegrity();
    await expect(
      internal.finalizeInvocation({
        schemaVersion: "1.0",
        expectedLedgerHead: {
          ledgerSequence: ledgerHead.verifiedThroughSequence,
          auditFingerprint: ledgerHead.lastAuditFingerprint,
        },
        ownershipId: registered.ownership.ownershipId,
        expectedOwnershipStatus: "in-progress",
        expectedAttemptCount: 1,
        transactionId,
        resultEnvelope: finalized.resultEnvelope,
        consumptionEvidence: poisonedConsumption,
        finalizedAt: finalized.resultEnvelope.completedAt,
      }),
    ).rejects.toThrow(/does not verify against authoritative Attempts/u);
  });

  it("fails closed after authoritative corruption while ignoring staging and a corrupt derived index", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    await writeFile(join(runtime.reasoningRuntimeRoot, "staging", "ignored.partial"), "not-json");
    await writeFile(join(runtime.reasoningRuntimeRoot, "derived", "execution-index.json"), "{}\n");
    const derivedReopen = await openLocalFileGovernedReasoningExecutionEvidence({
      repositoryRoot: runtime.repositoryRoot,
      runtimeRoot: runtime.reasoningRuntimeRoot,
      canonicalSourceRoots: runtime.canonicalSourceRoots,
    });
    expect((await derivedReopen.recover()).status).toBe("recovered");
    await writeFile(
      join(runtime.reasoningRuntimeRoot, "derived", "execution-index.json"),
      "x".repeat(65_537),
    );
    const oversizedIndexReopen = await openLocalFileGovernedReasoningExecutionEvidence({
      repositoryRoot: runtime.repositoryRoot,
      runtimeRoot: runtime.reasoningRuntimeRoot,
      canonicalSourceRoots: runtime.canonicalSourceRoots,
      limits: { maxEntries: 10_000, maxTotalBytes: 10_000_000, maxRecordBytes: 65_536 },
    });
    expect((await oversizedIndexReopen.recover()).status).toBe("recovered");
    const eventPath = join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json");
    const event = JSON.parse(await readFile(eventPath, "utf8")) as Record<string, unknown>;
    await writeFile(
      eventPath,
      `${JSON.stringify({ ...event, commitFingerprint: "0".repeat(64) })}\n`,
    );
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot: runtime.repositoryRoot,
        runtimeRoot: runtime.reasoningRuntimeRoot,
        canonicalSourceRoots: runtime.canonicalSourceRoots,
      }),
    ).rejects.toThrow(/does not verify|invalid/u);
  });

  it("binds re-signed Invocation authority to the authoritative commit head", async () => {
    const runtime = await createReasoningTestRuntime(roots);
    const request = createInvocation(runtime);
    await invokeGovernedReasoning({
      deliveryLedger: runtime.deliveryLedger,
      executionEvidence: runtime.executionEvidence,
      deliveryIdentity: runtime.deliveryIdentity,
      invocationRequest: request,
      fixtureMode: "successful-structured-response",
      attemptSchedule: schedule(),
    });
    const eventPath = join(runtime.reasoningRuntimeRoot, "events", "0000000000000001.json");
    const envelope = JSON.parse(await readFile(eventPath, "utf8")) as {
      readonly schemaVersion: "1.0";
      readonly event: unknown;
      readonly invocationAuthority: {
        readonly invocationRequest: ReturnType<typeof createReasoningInvocationRequest>;
        readonly providerCapability: unknown;
        readonly contextPackageObjectCount: number;
      };
      readonly commitFingerprint: string;
    };
    const { requestFingerprint: _requestFingerprint, ...requestUnsigned } =
      envelope.invocationAuthority.invocationRequest;
    void _requestFingerprint;
    const substituted = createReasoningInvocationRequest({
      ...requestUnsigned,
      reason: "Re-signed but unauthorized request substitution",
    });
    const { commitFingerprint: _commitFingerprint, ...commitUnsigned } = envelope;
    void _commitFingerprint;
    const changedUnsigned = {
      ...commitUnsigned,
      invocationAuthority: {
        ...commitUnsigned.invocationAuthority,
        invocationRequest: substituted,
      },
    };
    await writeFile(
      eventPath,
      `${JSON.stringify({
        ...changedUnsigned,
        commitFingerprint: createDurableCanonicalJsonSha256Fingerprint(changedUnsigned),
      })}\n`,
    );
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot: runtime.repositoryRoot,
        runtimeRoot: runtime.reasoningRuntimeRoot,
        canonicalSourceRoots: runtime.canonicalSourceRoots,
      }),
    ).rejects.toMatchObject({ code: "fingerprint_mismatch" });
  });

  it("rejects a symlinked commit head and re-signed unknown or unsafe head metadata", async () => {
    const symlinkRuntime = await createReasoningTestRuntime(roots);
    const headPath = join(symlinkRuntime.reasoningRuntimeRoot, "commit-head.json");
    const outsideHead = join(symlinkRuntime.repositoryRoot, "outside-commit-head.json");
    await writeFile(outsideHead, await readFile(headPath, "utf8"));
    await rm(headPath);
    await symlink(outsideHead, headPath);
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot: symlinkRuntime.repositoryRoot,
        runtimeRoot: symlinkRuntime.reasoningRuntimeRoot,
        canonicalSourceRoots: symlinkRuntime.canonicalSourceRoots,
      }),
    ).rejects.toMatchObject({ code: "unsafe_content" });

    const metadataRuntime = await createReasoningTestRuntime(roots);
    const metadataHeadPath = join(metadataRuntime.reasoningRuntimeRoot, "commit-head.json");
    const original = JSON.parse(await readFile(metadataHeadPath, "utf8")) as Record<
      string,
      unknown
    >;
    const { headFingerprint: _headFingerprint, ...unsigned } = original;
    void _headFingerprint;
    for (const metadata of [
      { unknownMetadata: "unexpected" },
      { apiKey: "fixture-secret-value" },
      { physicalPath: "/private/runtime/commit-head" },
    ]) {
      const changed = { ...unsigned, ...metadata };
      await writeFile(
        metadataHeadPath,
        `${JSON.stringify({
          ...changed,
          headFingerprint: createDurableCanonicalJsonSha256Fingerprint(changed),
        })}\n`,
      );
      await expect(
        openLocalFileGovernedReasoningExecutionEvidence({
          repositoryRoot: metadataRuntime.repositoryRoot,
          runtimeRoot: metadataRuntime.reasoningRuntimeRoot,
          canonicalSourceRoots: metadataRuntime.canonicalSourceRoots,
        }),
      ).rejects.toMatchObject({ code: "fingerprint_mismatch" });
    }
  });

  it.each(["runtime-parent", "runtime-root", "events", "staging", "derived"] as const)(
    "rejects symlinked local adapter %s confinement",
    async (target) => {
      const repositoryRoot = await mkdtemp(join(tmpdir(), "founderos-m13-symlink-"));
      roots.push(repositoryRoot);
      const docs = join(repositoryRoot, "docs");
      const outside = await mkdtemp(join(tmpdir(), "founderos-m13-outside-"));
      roots.push(outside);
      await mkdir(docs);
      const runtimeRoot = join(repositoryRoot, ".founderos", "runtime", "reasoning-ledger");
      if (target === "runtime-parent") {
        await mkdir(join(repositoryRoot, ".founderos"), { recursive: true });
        await symlink(outside, join(repositoryRoot, ".founderos", "runtime"));
      } else if (target === "runtime-root") {
        await mkdir(join(repositoryRoot, ".founderos", "runtime"), { recursive: true });
        await symlink(outside, runtimeRoot);
      } else {
        const reader = await openLocalFileGovernedReasoningExecutionEvidence({
          repositoryRoot,
          runtimeRoot,
          canonicalSourceRoots: [docs],
        });
        expect((await reader.verifyIntegrity()).status).toBe("valid");
        const managed = join(runtimeRoot, target);
        await rm(managed, { recursive: true });
        await symlink(outside, managed);
      }
      await expect(
        openLocalFileGovernedReasoningExecutionEvidence({
          repositoryRoot,
          runtimeRoot,
          canonicalSourceRoots: [docs],
        }),
      ).rejects.toMatchObject({ code: "unsafe_content" });
    },
  );

  it("captures nested local adapter accessors without invoking them and sanitizes fs errors", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "founderos-m13-accessor-"));
    roots.push(repositoryRoot);
    const docs = join(repositoryRoot, "docs");
    await mkdir(docs);
    let accesses = 0;
    const limits = { maxEntries: 1, maxTotalBytes: 1, maxRecordBytes: 1 };
    Object.defineProperty(limits, "maxEntries", {
      enumerable: true,
      get() {
        accesses += 1;
        return 10;
      },
    });
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot,
        runtimeRoot: join(repositoryRoot, ".founderos", "runtime", "reasoning-ledger"),
        canonicalSourceRoots: [docs],
        limits,
      }),
    ).rejects.toMatchObject({ code: "resource_limit_exceeded" });
    expect(accesses).toBe(0);
    const topLevelAccessorOptions = {
      repositoryRoot,
      runtimeRoot: join(repositoryRoot, ".founderos", "runtime", "top-accessor"),
      canonicalSourceRoots: [docs],
    };
    Object.defineProperty(topLevelAccessorOptions, "runtimeRoot", {
      enumerable: true,
      get() {
        accesses += 1;
        return join(repositoryRoot, ".founderos", "runtime", "top-accessor");
      },
    });
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence(topLevelAccessorOptions),
    ).rejects.toMatchObject({ code: "unsafe_content" });
    expect(accesses).toBe(0);
    const rootsWithAccessor = [docs];
    Object.defineProperty(rootsWithAccessor, "0", {
      enumerable: true,
      get() {
        accesses += 1;
        return docs;
      },
    });
    await expect(
      openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot,
        runtimeRoot: join(repositoryRoot, ".founderos", "runtime", "second-ledger"),
        canonicalSourceRoots: rootsWithAccessor,
      }),
    ).rejects.toMatchObject({ code: "unsafe_content" });
    expect(accesses).toBe(0);

    const secretPath = join(repositoryRoot, "private-physical-secret", "missing-repository");
    let caught: unknown;
    try {
      await openLocalFileGovernedReasoningExecutionEvidence({
        repositoryRoot: secretPath,
        runtimeRoot: join(secretPath, ".founderos", "runtime", "reasoning-ledger"),
        canonicalSourceRoots: [docs],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "storage_failure" });
    expect(String(caught)).not.toContain(secretPath);
  });

  it("sanitizes writer cleanup failures and preserves primary-operation precedence", async () => {
    const physicalSecret = "/private/runtime/cleanup-secret.lock";
    let cleanupFailure: unknown;
    try {
      await runReasoningWriterSession(
        async () => "completed",
        async () => {
          throw new Error(`close failed at ${physicalSecret}`);
        },
        async () => {
          throw new Error(`remove failed at ${physicalSecret}`);
        },
      );
    } catch (error) {
      cleanupFailure = error;
    }
    expect(cleanupFailure).toMatchObject({ code: "storage_failure" });
    expect(String(cleanupFailure)).not.toContain(physicalSecret);
    expect(String(cleanupFailure)).toContain("storage operation failed");
    let primaryFailure: unknown;
    try {
      await runReasoningWriterSession(
        async () => {
          throw new ReasoningExecutionLedgerConflictError(
            "audit_chain_broken",
            "Primary governed operation failed",
          );
        },
        async () => {
          throw new Error(`close failed at ${physicalSecret}`);
        },
        async () => {
          throw new Error(`remove failed at ${physicalSecret}`);
        },
      );
    } catch (error) {
      primaryFailure = error;
    }
    expect(primaryFailure).toMatchObject({ code: "audit_chain_broken" });
    expect(String(primaryFailure)).not.toContain(physicalSecret);
    expect(String(primaryFailure)).toContain("Primary governed operation failed");
  });
});
