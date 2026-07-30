import { readFile } from "node:fs/promises";

import { expect } from "vitest";

import {
  createFinalizedReasoningConsumptionEvidence,
  createProviderNeutralReasoningInput,
  createReasoningCancellationEvidence,
  createReasoningExecutionAttempt,
  createReasoningInvocationRequest,
  createReasoningProviderCapabilityDescriptor,
  createReasoningResultEnvelope,
  createReasoningTimeoutEvidence,
  invokeGovernedReasoning,
  matchReasoningProviderCapabilities,
  openLocalFileGovernedReasoningExecutionEvidence,
  verifyFinalizedReasoningConsumptionEvidence,
  verifyReasoningCancellationEvidence,
  verifyReasoningCostEvidence,
  verifyReasoningExecutionAttempt,
  verifyReasoningExecutionReceipt,
  verifyReasoningFailureEvidence,
  verifyReasoningProviderOutcome,
  verifyReasoningResultEnvelope,
  verifyReasoningResultEnvelopeArtifact,
  verifyReasoningTimeoutEvidence,
  verifyReasoningUsageEvidence,
  type InvokeGovernedReasoningInput,
} from "../src/index.js";
import { resolveInternalReasoningExecutionEvidence } from "../src/application/manage-governed-reasoning-execution-ledger.js";
import { createDeterministicFakeReasoningProvider } from "../src/infrastructure/deterministic-fake-reasoning-provider.js";
import type {
  ReasoningEvaluation,
  ReasoningEvaluationExpected,
  ReasoningEvaluationScenarioId,
} from "./fixtures/reasoning-evaluations.js";
import { createInvocation, createReasoningTestRuntime, schedule } from "./reasoning-fixtures.js";

type Runtime = Awaited<ReturnType<typeof createReasoningTestRuntime>>;
type ScenarioObservation = ReasoningEvaluationExpected;

function observedErrorCode(error: unknown): string | null {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function requiredMutationTarget(evaluation: ReasoningEvaluation): string {
  const { target } = evaluation.mutation;
  if (target === undefined)
    throw new Error(`Evaluation ${evaluation.mutation.operation} requires a mutation target`);
  return target;
}

export async function executeReasoningEvaluation(
  evaluation: ReasoningEvaluation,
  roots: string[],
): Promise<void> {
  let actual: ScenarioObservation;
  if (evaluation.setup.source === "provider-source")
    actual = await executeProviderSafety(evaluation, roots);
  else if (evaluation.setup.source === "canonical-artifacts")
    actual =
      evaluation.category === "capability"
        ? await executeCapability(evaluation, roots)
        : await executeEvidenceMutation(evaluation, roots);
  else if (evaluation.category === "successful-execution")
    actual = await executeSuccess(evaluation, roots);
  else if (evaluation.category === "delivery-binding")
    actual = await executeDeliveryBinding(evaluation, roots);
  else if (evaluation.category === "idempotency")
    actual = await executeIdempotency(evaluation, roots);
  else if (evaluation.category === "retry") actual = await executeRetry(evaluation, roots);
  else if (evaluation.category === "timeout") actual = await executeTimeout(evaluation, roots);
  else if (evaluation.category === "cancellation")
    actual = await executeCancellation(evaluation, roots);
  else if (evaluation.category === "fake-provider-safety")
    actual = await executeProviderSafety(evaluation, roots);
  else actual = await executeFacadeBypass(evaluation, roots);
  expect(actual).toEqual(evaluation.expected);
}

async function invoke(
  runtime: Runtime,
  scenarioId: ReasoningEvaluationScenarioId,
  overrides: Partial<InvokeGovernedReasoningInput> = {},
) {
  return invokeGovernedReasoning({
    deliveryLedger: runtime.deliveryLedger,
    executionEvidence: runtime.executionEvidence,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: createInvocation(runtime, {
      idempotencyKey: `reasoning:key:evaluation:${scenarioId}`,
    }),
    fixtureMode: "successful-structured-response",
    attemptSchedule: schedule(),
    ...overrides,
  });
}

async function executeSuccess(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${evaluation.mutation.operation}`,
    ...(evaluation.mutation.operation === "success-empty"
      ? { outputContentType: "canonical-text" as const, requireNonEmpty: false }
      : {}),
  });
  const input = {
    deliveryLedger: runtime.deliveryLedger,
    executionEvidence: runtime.executionEvidence,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: request,
    fixtureMode:
      evaluation.mutation.operation === "success-empty"
        ? ("successful-empty-response" as const)
        : ("successful-structured-response" as const),
    attemptSchedule: schedule(),
  };
  const first = await invokeGovernedReasoning(input);
  if (first.status === "identical-in-progress") throw new Error("unexpected in-progress");
  expect(first.resultEnvelope.outcome).toBe(evaluation.expected.outcome);
  expect(first.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(
    evaluation.expected.attemptCount,
  );
  expect(first.resultEnvelope.resultEnvelopeFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  const integrity = await runtime.executionEvidence.verifyIntegrity();
  expect(integrity.status).toBe("valid");
  let observedStatus: string = first.status;
  let stableReplay = false;
  if (evaluation.mutation.operation === "success-empty") {
    expect(first.resultEnvelope.outcome).toBe("succeeded");
    if (first.resultEnvelope.outcome === "succeeded")
      expect(first.resultEnvelope.outputCharacterCount).toBe(0);
  }
  if (evaluation.mutation.operation === "repeat-deterministic") {
    const repeat = await invokeGovernedReasoning(input);
    expect(repeat.status).toBe("identical-finalized");
    if (repeat.status !== "identical-in-progress")
      expect(repeat.resultEnvelope.resultEnvelopeFingerprint).toBe(
        first.resultEnvelope.resultEnvelopeFingerprint,
      );
    observedStatus = repeat.status;
    stableReplay =
      repeat.status !== "identical-in-progress" &&
      repeat.resultEnvelope.resultEnvelopeFingerprint ===
        first.resultEnvelope.resultEnvelopeFingerprint;
  }
  if (evaluation.mutation.operation === "restart-lookup") {
    const reopened = await openLocalFileGovernedReasoningExecutionEvidence({
      repositoryRoot: runtime.repositoryRoot,
      runtimeRoot: runtime.reasoningRuntimeRoot,
      canonicalSourceRoots: runtime.canonicalSourceRoots,
    });
    expect(await reopened.readFinalizedResult(request.invocationRequestId)).toEqual(
      first.resultEnvelope,
    );
  }
  const attempts = await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId);
  const outcome = await runtime.executionEvidence.readProviderOutcome(
    first.resultEnvelope.executionAttemptId,
  );
  const resultVerified =
    outcome !== null &&
    verifyReasoningResultEnvelope({
      resultEnvelope: first.resultEnvelope,
      invocationRequest: request,
      providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
      attempt: attempts[0]!,
      attemptHistory: attempts,
      providerOutcome: outcome,
      outcomeHistory: [outcome],
      contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
    }).status === "valid";
  return {
    disposition: "accept" as const,
    errorCode: null,
    status: observedStatus,
    outcome: first.resultEnvelope.outcome,
    reasonCodes: [],
    attemptCount: attempts.length,
    durable: integrity.status === "valid",
    fingerprintStatus: resultVerified ? ("valid" as const) : ("invalid" as const),
    attemptIdentity: observedAttemptIdentity(attempts, stableReplay),
    resultExpectation:
      (await runtime.executionEvidence.readFinalizedResult(request.invocationRequestId)) === null
        ? ("none" as const)
        : ("finalized" as const),
    evidenceExpectation: resultVerified ? ("verified" as const) : ("rejected" as const),
    finalizationExpectation:
      (await runtime.executionEvidence.readFinalizedConsumptionEvidence(
        request.invocationRequestId,
      )) === null
        ? ("none" as const)
        : ("committed" as const),
  };
}

function resignRequest(
  request: ReturnType<typeof createInvocation>,
  changes: Partial<Omit<ReturnType<typeof createInvocation>, "requestFingerprint">>,
) {
  const { requestFingerprint: _fingerprint, ...unsigned } = request;
  void _fingerprint;
  return createReasoningInvocationRequest({ ...unsigned, ...changes });
}

async function executeDeliveryBinding(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  let request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${evaluation.mutation.operation}`,
  });
  let deliveryIdentity = { ...runtime.deliveryIdentity };
  if (evaluation.mutation.operation === "missing-transaction")
    deliveryIdentity = { ...deliveryIdentity, transactionId: "missing-delivery-transaction" };
  else if (evaluation.mutation.operation === "envelope-substitution")
    deliveryIdentity = { ...deliveryIdentity, deliveryEnvelopeFingerprint: "0".repeat(64) };
  else if (evaluation.mutation.operation === "receipt-substitution")
    deliveryIdentity = { ...deliveryIdentity, deliveryReceiptFingerprint: "0".repeat(64) };
  else if (evaluation.mutation.operation === "context-substitution") {
    const { inputFingerprint: _inputFingerprint, ...inputUnsigned } = request.reasoningInput;
    void _inputFingerprint;
    const contextPackageId = "substituted-context-package";
    const contextPackageFingerprint = "0".repeat(64);
    const reasoningInput = createProviderNeutralReasoningInput({
      ...inputUnsigned,
      contextReference: {
        ...inputUnsigned.contextReference,
        contextPackageId,
        contextPackageFingerprint,
      },
    });
    request = resignRequest(request, {
      contextPackageId,
      contextPackageFingerprint,
      reasoningInput,
    });
  } else if (evaluation.mutation.operation === "consumer-substitution")
    request = resignRequest(request, { consumerId: "substituted-consumer" });
  else if (evaluation.mutation.operation === "registry-substitution")
    request = resignRequest(request, {
      registryIntegrityBinding: {
        ...request.registryIntegrityBinding,
        integrityFingerprint: "0".repeat(64),
      },
    });
  let error: unknown;
  try {
    await invoke(runtime, evaluation.mutation.operation, {
      invocationRequest: request,
      deliveryIdentity,
    });
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({ code: evaluation.expected.errorCode });
  const integrity = await runtime.executionEvidence.verifyIntegrity();
  expect(integrity.verifiedInvocationCount).toBe(0);
  return {
    disposition: error === undefined ? ("accept" as const) : ("reject" as const),
    errorCode: observedErrorCode(error),
    status: null,
    outcome: null,
    reasonCodes: [],
    attemptCount: 0,
    durable: integrity.status === "valid",
    fingerprintStatus: "not-applicable" as const,
    attemptIdentity: "none" as const,
    resultExpectation: "rejected" as const,
    evidenceExpectation: "none" as const,
    finalizationExpectation: "none" as const,
  };
}

async function executeCapability(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${evaluation.mutation.operation}`,
  });
  const capability = createDeterministicFakeReasoningProvider().providerCapability;
  const { descriptorFingerprint: _fingerprint, ...unsigned } = capability;
  void _fingerprint;
  const changes =
    evaluation.mutation.operation === "invocation-version"
      ? { acceptedInvocationRequestVersions: ["2.0" as const] }
      : evaluation.mutation.operation === "delivery-version"
        ? { acceptedDeliveryEnvelopeVersions: ["2.0" as const] }
        : evaluation.mutation.operation === "input-type"
          ? { acceptedInputContentTypes: ["provider-neutral-instruction-blocks-v2" as const] }
          : evaluation.mutation.operation === "input-budget"
            ? { maxInputCharacters: 1 }
            : evaluation.mutation.operation === "output-budget"
              ? { maxOutputCharacters: 1 }
              : evaluation.mutation.operation === "timeout-range"
                ? { maxTimeoutMilliseconds: 500 }
                : evaluation.mutation.operation === "cancellation-mode"
                  ? { supportedCancellationModes: ["cooperative-cancellation" as const] }
                  : evaluation.mutation.operation === "retry-mode"
                    ? { supportedRetryModes: ["retry-until-attempt-limit" as const] }
                    : evaluation.mutation.operation === "usage-capability"
                      ? { supportsUsageEvidence: false }
                      : evaluation.mutation.operation === "cost-capability"
                        ? { supportsCostEvidence: false }
                        : { supportsFailureEvidence: false };
  const provider = createReasoningProviderCapabilityDescriptor({ ...unsigned, ...changes });
  const result = matchReasoningProviderCapabilities({
    invocationRequest: request,
    providerCapability: provider,
  });
  expect(result.status).toBe(evaluation.expected.status);
  expect(result.reasonCodes).toContain(evaluation.expected.reasonCodes![0]);
  expect(result.mismatchedFields).toEqual([requiredMutationTarget(evaluation)]);
  expect(result.compatibilityFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  return {
    disposition: result.status === "incompatible" ? ("reject" as const) : ("accept" as const),
    errorCode: null,
    status: result.status,
    outcome: null,
    reasonCodes: result.reasonCodes,
    attemptCount: 0,
    durable: "not-applicable" as const,
    fingerprintStatus: /^[a-f0-9]{64}$/u.test(result.compatibilityFingerprint)
      ? ("valid" as const)
      : ("invalid" as const),
    attemptIdentity: "none" as const,
    resultExpectation: "none" as const,
    evidenceExpectation: "verified" as const,
    finalizationExpectation: "none" as const,
  };
}

async function registerOnly(runtime: Runtime, request: ReturnType<typeof createInvocation>) {
  const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
  const provider = createDeterministicFakeReasoningProvider();
  const registration = await internal.registerGovernedInvocation(
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
  return { internal, provider, registration };
}

async function readObservedLedgerState(
  runtime: Runtime,
  request: ReturnType<typeof createInvocation>,
) {
  const integrity = await runtime.executionEvidence.verifyIntegrity();
  const attempts = await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId);
  const result = await runtime.executionEvidence.readFinalizedResult(request.invocationRequestId);
  const consumption = await runtime.executionEvidence.readFinalizedConsumptionEvidence(
    request.invocationRequestId,
  );
  return { attempts, consumption, integrity, result };
}

function resultReasonCodes(
  result: NonNullable<Awaited<ReturnType<Runtime["executionEvidence"]["readFinalizedResult"]>>>,
) {
  if (result.outcome === "failed") return result.failureEvidence.reasonCodes;
  if (result.outcome === "timed-out") return [result.timeoutEvidence.reasonCode];
  if (result.outcome === "cancelled") return [result.cancellationEvidence.reasonCode];
  return [];
}

function observedAttemptIdentity(
  attempts: readonly unknown[],
  stableReplay = false,
): ReasoningEvaluationExpected["attemptIdentity"] {
  if (stableReplay) return "stable-replay";
  if (attempts.length === 0) return "none";
  return attempts.every((attempt) => verifyReasoningExecutionAttempt(attempt).status === "valid")
    ? "content-derived"
    : "none";
}

async function executeIdempotency(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
  });
  if (operation === "first-ownership" || operation === "in-progress") {
    const { registration } = await registerOnly(runtime, request);
    let status: string = registration.status;
    if (operation === "in-progress")
      status = (await invoke(runtime, operation, { invocationRequest: request })).status;
    const state = await readObservedLedgerState(runtime, request);
    return {
      disposition: "resolve" as const,
      errorCode: null,
      status,
      outcome: state.result?.outcome ?? null,
      reasonCodes: state.result === null ? [] : resultReasonCodes(state.result),
      attemptCount: state.attempts.length,
      durable: state.integrity.status === "valid",
      fingerprintStatus:
        state.integrity.status === "valid" ? ("valid" as const) : ("invalid" as const),
      attemptIdentity: observedAttemptIdentity(state.attempts),
      resultExpectation: state.result === null ? ("none" as const) : ("finalized" as const),
      evidenceExpectation:
        state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
      finalizationExpectation:
        state.consumption === null ? ("none" as const) : ("committed" as const),
    };
  }
  const finalized = await invoke(runtime, operation, { invocationRequest: request });
  if (finalized.status === "identical-in-progress") throw new Error("unexpected in-progress");
  let status: string = finalized.status;
  let errorCode: string | null = null;
  let finalizationExpectation: ReasoningEvaluationExpected["finalizationExpectation"] = "committed";
  if (operation === "identical-finalized") {
    const replay = await invoke(runtime, operation, { invocationRequest: request });
    status = replay.status;
    if (replay.status !== "identical-in-progress")
      expect(replay.resultEnvelope).toEqual(finalized.resultEnvelope);
  } else if (operation === "conflicting-key") {
    const conflicting = resignRequest(request, { reason: "Conflicting evaluation content" });
    try {
      await invoke(runtime, operation, { invocationRequest: conflicting });
    } catch (error) {
      errorCode = observedErrorCode(error);
      status = "conflict";
    }
  } else {
    const internal = resolveInternalReasoningExecutionEvidence(runtime.executionEvidence);
    const ownership = await internal.resolveInvocationOwnership(request.idempotencyKey);
    if (ownership === null) throw new Error("missing ownership");
    const { consumptionFingerprint: _fingerprint, ...unsigned } = finalized.consumptionEvidence;
    void _fingerprint;
    const transactionId = "reasoning-finalization-evaluation-conflict";
    const consumption = createFinalizedReasoningConsumptionEvidence({
      ...unsigned,
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
      expectedAttemptCount: 1,
      transactionId,
      resultEnvelope: finalized.resultEnvelope,
      consumptionEvidence: consumption,
      finalizedAt: finalized.resultEnvelope.completedAt,
    });
    status = conflict.status;
    finalizationExpectation = conflict.status === "conflict" ? "conflict" : "committed";
  }
  const state = await readObservedLedgerState(runtime, request);
  return {
    disposition: "resolve" as const,
    errorCode,
    status,
    outcome: state.result?.outcome ?? null,
    reasonCodes: state.result === null ? [] : resultReasonCodes(state.result),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verifyReasoningResultEnvelopeArtifact(state.result).status,
    attemptIdentity: observedAttemptIdentity(state.attempts, operation === "identical-finalized"),
    resultExpectation: state.result === null ? ("none" as const) : ("finalized" as const),
    evidenceExpectation:
      state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
    finalizationExpectation,
  };
}

async function executeRetry(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  if (operation === "identical-attempt" || operation === "conflicting-attempt") {
    const request = createInvocation(runtime, {
      idempotencyKey: `reasoning:key:evaluation:${operation}`,
    });
    const { internal, provider, registration } = await registerOnly(runtime, request);
    if (registration.status !== "registered") throw new Error("registration failed");
    const timing = schedule()[0]!;
    const attempt = createReasoningExecutionAttempt({
      schemaVersion: "1.0",
      executionAttemptId: `evaluation-${operation}`,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: provider.providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: provider.providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: 1,
      startedAt: timing.startedAt,
      deadlineAt: timing.deadlineAt,
      cancellationState: "not-requested",
    });
    const head = await internal.verifyIntegrity();
    const append = {
      schemaVersion: "1.0" as const,
      expectedLedgerHead: {
        ledgerSequence: head.verifiedThroughSequence,
        auditFingerprint: head.lastAuditFingerprint,
      },
      ownershipId: registration.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress" as const,
      expectedPriorAttemptCount: 0,
      attempt,
    };
    expect(await internal.appendExecutionAttempt(append)).toEqual(attempt);
    let stableReplay = false;
    if (operation === "identical-attempt") {
      expect(await internal.appendExecutionAttempt(append)).toEqual(attempt);
      stableReplay = true;
    } else {
      const { attemptFingerprint: _fingerprint, ...attemptUnsigned } = attempt;
      void _fingerprint;
      const conflicting = createReasoningExecutionAttempt({
        ...attemptUnsigned,
        startedAt: "2026-07-29T01:00:01.010Z",
        deadlineAt: "2026-07-29T01:00:02.010Z",
      });
      await expect(
        internal.appendExecutionAttempt({ ...append, attempt: conflicting }),
      ).rejects.toMatchObject({ code: "transaction_conflict" });
    }
    const state = await readObservedLedgerState(runtime, request);
    return {
      disposition: "resolve" as const,
      errorCode: null,
      status: "in-progress",
      outcome: null,
      reasonCodes: [],
      attemptCount: state.attempts.length,
      durable: state.integrity.status === "valid",
      fingerprintStatus:
        state.integrity.status === "valid" ? ("valid" as const) : ("invalid" as const),
      attemptIdentity: observedAttemptIdentity(state.attempts, stableReplay),
      resultExpectation: "none" as const,
      evidenceExpectation:
        state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
      finalizationExpectation: "none" as const,
    };
  }
  const transient = operation === "transient-success";
  const exhaustion = operation === "attempt-exhaustion";
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
    retryMode: transient || exhaustion ? "retry-deterministic-transient-failure" : "no-retry",
    maxAttemptCount: transient || exhaustion ? 2 : 1,
  });
  const result = await invoke(runtime, operation, {
    invocationRequest: request,
    fixtureMode: transient
      ? "transient-failure-then-success"
      : exhaustion
        ? "deterministic-transient-failure"
        : "deterministic-permanent-failure",
    attemptSchedule: schedule(transient || exhaustion ? 2 : 1),
  });
  if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
  expect(result.resultEnvelope.outcome).toBe(evaluation.expected.outcome);
  expect(result.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(
    evaluation.expected.attemptCount,
  );
  const attempts = await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId);
  expect(new Set(attempts.map((attempt) => attempt.executionAttemptId)).size).toBe(attempts.length);
  if (attempts.length === 2)
    expect(attempts[1]!.previousExecutionAttemptId).toBe(attempts[0]!.executionAttemptId);
  if (exhaustion && result.resultEnvelope.outcome === "failed")
    expect(result.resultEnvelope.failureEvidence.reasonCodes).toEqual(["attempt_limit_exhausted"]);
  const state = await readObservedLedgerState(runtime, request);
  if (state.result === null) throw new Error("missing finalized retry result");
  return {
    disposition: "resolve" as const,
    errorCode: null,
    status: result.status,
    outcome: state.result.outcome,
    reasonCodes: resultReasonCodes(state.result),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verifyReasoningResultEnvelopeArtifact(state.result).status,
    attemptIdentity: observedAttemptIdentity(state.attempts),
    resultExpectation: "finalized" as const,
    evidenceExpectation:
      state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
    finalizationExpectation:
      state.consumption === null ? ("none" as const) : ("committed" as const),
  };
}

async function createSuccessfulProviderArtifact(
  runtime: Runtime,
  request: ReturnType<typeof createInvocation>,
  cancellationState: "not-requested" | "requested-cooperatively" = "not-requested",
) {
  const provider = createDeterministicFakeReasoningProvider();
  const compatibility = matchReasoningProviderCapabilities({
    invocationRequest: request,
    providerCapability: provider.providerCapability,
  });
  const timing = schedule()[0]!;
  const attempt = createReasoningExecutionAttempt({
    schemaVersion: "1.0",
    executionAttemptId: `evaluation-contradiction-${evaluationArtifactSuffix(request)}`,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    providerCapabilityId: provider.providerCapability.providerCapabilityId,
    providerCapabilityFingerprint: provider.providerCapability.descriptorFingerprint,
    executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
    attemptNumber: 1,
    startedAt: timing.startedAt,
    deadlineAt: timing.deadlineAt,
    cancellationState,
    ...(cancellationState === "not-requested"
      ? {}
      : {
          cancellationAuthorityReference: "authority/evaluation-contradiction",
          cancellationRequestedAt: "2026-07-29T01:00:01.010Z",
          cancellationObservedAt: "2026-07-29T01:00:01.050Z",
        }),
  });
  const outcome = await provider.execute({
    invocationRequest: request,
    providerCapability: provider.providerCapability,
    compatibility,
    attempt,
    completedAt: timing.completedAt,
    evaluationTime: request.requestedAt,
    cancellationSignal: {
      state: cancellationState,
      authorityReference: "authority/evaluation-contradiction",
      requestedAt: "2026-07-29T01:00:01.010Z",
      observedAt: "2026-07-29T01:00:01.050Z",
    },
    fixtureMode: "successful-structured-response",
  });
  if (verifyReasoningProviderOutcome(outcome).status !== "valid")
    throw new Error("successful provider baseline did not verify");
  return { attempt, outcome };
}

function evaluationArtifactSuffix(request: ReturnType<typeof createInvocation>) {
  return request.invocationRequestId.replace(/[^a-z0-9-]/giu, "-");
}

async function executeTimeout(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  const retry = operation === "timeout-retry";
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
    retryMode: retry ? "retry-until-attempt-limit" : "no-retry",
    maxAttemptCount: retry ? 2 : 1,
  });
  if (operation === "timeout-contradiction") {
    const { attempt, outcome } = await createSuccessfulProviderArtifact(runtime, request);
    if (typeof outcome !== "object" || outcome === null) throw new Error("missing outcome object");
    const timeoutEvidence = createReasoningTimeoutEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      configuredTimeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
      attemptStartedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt!,
      elapsedMilliseconds: request.executionPolicy.timeoutMilliseconds,
      timeoutPhase: "during-execution",
      reasonCode: "execution_timeout",
    });
    expect(verifyReasoningTimeoutEvidence(timeoutEvidence).status).toBe("valid");
    const target = requiredMutationTarget(evaluation);
    if (target !== "providerOutcome.timeoutEvidence")
      throw new Error(`Unsupported timeout contradiction target: ${target}`);
    const contradictory = {
      ...outcome,
      timeoutEvidence,
    };
    const verification = verifyReasoningProviderOutcome(contradictory);
    expect(verification.status).toBe("invalid");
    return {
      disposition: "reject" as const,
      errorCode: null,
      status: verification.status,
      outcome: null,
      reasonCodes: verification.issues.map((issue) => issue.code),
      attemptCount: attempt.attemptNumber,
      durable: "not-applicable" as const,
      fingerprintStatus: verification.status,
      attemptIdentity: observedAttemptIdentity([attempt]),
      resultExpectation: "rejected" as const,
      evidenceExpectation: "rejected" as const,
      finalizationExpectation: "none" as const,
    };
  }
  const timings = schedule(retry ? 2 : 1).map((timing) => ({
    ...timing,
    completedAt:
      operation === "deadline-expired"
        ? new Date(Date.parse(timing.deadlineAt) + 100).toISOString()
        : timing.deadlineAt,
  }));
  const result = await invoke(runtime, operation, {
    invocationRequest: request,
    fixtureMode:
      operation === "timeout-no-retry" || retry ? "timeout" : "successful-structured-response",
    attemptSchedule: timings,
  });
  if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
  expect(result.resultEnvelope.outcome).toBe("timed-out");
  expect(result.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(
    evaluation.expected.attemptCount,
  );
  const attempts = await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId);
  expect(new Set(attempts.map((attempt) => attempt.executionAttemptId)).size).toBe(attempts.length);
  if (attempts.length === 2)
    expect(attempts[1]!.previousExecutionAttemptId).toBe(attempts[0]!.executionAttemptId);
  if (result.resultEnvelope.outcome === "timed-out")
    expect(result.resultEnvelope.timeoutEvidence.reasonCode).toBe(
      evaluation.expected.reasonCodes![0],
    );
  const state = await readObservedLedgerState(runtime, request);
  if (state.result === null) throw new Error("missing finalized timeout result");
  return {
    disposition: "resolve" as const,
    errorCode: null,
    status: result.status,
    outcome: state.result.outcome,
    reasonCodes: resultReasonCodes(state.result),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verifyReasoningResultEnvelopeArtifact(state.result).status,
    attemptIdentity: observedAttemptIdentity(state.attempts),
    resultExpectation: "finalized" as const,
    evidenceExpectation:
      state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
    finalizationExpectation:
      state.consumption === null ? ("none" as const) : ("committed" as const),
  };
}

function cancellationSetup(scenarioId: ReasoningEvaluationScenarioId) {
  if (scenarioId === "cancel-before")
    return {
      mode: "cancel-before-execution" as const,
      fixture: "cancellation-before-execution" as const,
      signal: {
        state: "requested-before-execution" as const,
        authorityReference: "authority/evaluation-cancel-before",
        requestedAt: "2026-07-29T01:00:00.900Z",
        observedAt: "2026-07-29T01:00:00.950Z",
      },
    };
  if (scenarioId === "cancel-deadline")
    return {
      mode: "deadline-cancellation" as const,
      fixture: "deadline-cancellation" as const,
      signal: {
        state: "requested-at-deadline" as const,
        authorityReference: "authority/evaluation-cancel-deadline",
        requestedAt: "2026-07-29T01:00:02.000Z",
        observedAt: "2026-07-29T01:00:02.000Z",
      },
    };
  return {
    mode: "cooperative-cancellation" as const,
    fixture:
      scenarioId === "cancel-contradiction"
        ? ("successful-structured-response" as const)
        : ("cooperative-cancellation" as const),
    signal: {
      state: "requested-cooperatively" as const,
      authorityReference: "authority/evaluation-cancel-cooperative",
      requestedAt: "2026-07-29T01:00:01.010Z",
      observedAt: "2026-07-29T01:00:01.050Z",
    },
  };
}

async function executeCancellation(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  const setup = cancellationSetup(operation);
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
    cancellationMode: setup.mode,
  });
  if (operation === "cancel-contradiction") {
    const { attempt, outcome } = await createSuccessfulProviderArtifact(
      runtime,
      request,
      "requested-cooperatively",
    );
    if (typeof outcome !== "object" || outcome === null) throw new Error("missing outcome object");
    const cancellationEvidence = createReasoningCancellationEvidence({
      schemaVersion: "1.0",
      invocationRequestId: request.invocationRequestId,
      executionAttemptId: attempt.executionAttemptId,
      cancellationMode: "cooperative-cancellation",
      cancellationPhase: "cooperative-execution",
      cancellationAuthorityReference: setup.signal.authorityReference,
      requestedAt: setup.signal.requestedAt,
      observedAt: setup.signal.observedAt,
      reasonCode: "cancelled_cooperatively",
    });
    expect(verifyReasoningCancellationEvidence(cancellationEvidence).status).toBe("valid");
    const target = requiredMutationTarget(evaluation);
    if (target !== "providerOutcome.cancellationEvidence")
      throw new Error(`Unsupported cancellation contradiction target: ${target}`);
    const contradictory = {
      ...outcome,
      cancellationEvidence,
    };
    const verification = verifyReasoningProviderOutcome(contradictory);
    expect(verification.status).toBe("invalid");
    return {
      disposition: "reject" as const,
      errorCode: null,
      status: verification.status,
      outcome: null,
      reasonCodes: verification.issues.map((issue) => issue.code),
      attemptCount: attempt.attemptNumber,
      durable: "not-applicable" as const,
      fingerprintStatus: verification.status,
      attemptIdentity: observedAttemptIdentity([attempt]),
      resultExpectation: "rejected" as const,
      evidenceExpectation: "rejected" as const,
      finalizationExpectation: "none" as const,
    };
  }
  const timings = schedule(1, setup.signal).map((timing) => ({
    ...timing,
    completedAt: operation === "cancel-deadline" ? timing.deadlineAt : timing.completedAt,
  }));
  const result = await invoke(runtime, operation, {
    invocationRequest: request,
    fixtureMode: setup.fixture,
    attemptSchedule: timings,
  });
  if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
  expect(result.resultEnvelope.outcome).toBe("cancelled");
  if (result.resultEnvelope.outcome === "cancelled")
    expect(result.resultEnvelope.cancellationEvidence.reasonCode).toBe(
      evaluation.expected.reasonCodes![0],
    );
  expect(result.consumptionEvidence.attemptHistorySummary.attemptCount).toBe(1);
  const state = await readObservedLedgerState(runtime, request);
  if (state.result === null) throw new Error("missing finalized cancellation result");
  return {
    disposition: "resolve" as const,
    errorCode: null,
    status: result.status,
    outcome: state.result.outcome,
    reasonCodes: resultReasonCodes(state.result),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verifyReasoningResultEnvelopeArtifact(state.result).status,
    attemptIdentity: observedAttemptIdentity(state.attempts),
    resultExpectation: "finalized" as const,
    evidenceExpectation:
      state.integrity.status === "valid" ? ("verified" as const) : ("rejected" as const),
    finalizationExpectation:
      state.consumption === null ? ("none" as const) : ("committed" as const),
  };
}

async function executeEvidenceMutation(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  const isFailure = operation === "failure-mutation";
  const isTimeout = operation === "timeout-mutation";
  const isCancellation = operation === "cancellation-mutation";
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
    ...(isCancellation ? { cancellationMode: "cancel-before-execution" as const } : {}),
  });
  const cancellationSignal = {
    state: "requested-before-execution" as const,
    authorityReference: "authority/evaluation-evidence-cancel",
    requestedAt: "2026-07-29T01:00:00.900Z",
    observedAt: "2026-07-29T01:00:00.950Z",
  };
  const result = await invoke(runtime, operation, {
    invocationRequest: request,
    fixtureMode: isFailure
      ? "deterministic-permanent-failure"
      : isTimeout
        ? "timeout"
        : isCancellation
          ? "cancellation-before-execution"
          : "successful-structured-response",
    attemptSchedule: isTimeout
      ? [{ ...schedule()[0]!, completedAt: schedule()[0]!.deadlineAt }]
      : isCancellation
        ? schedule(1, cancellationSignal)
        : schedule(),
  });
  if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
  const attempt = (
    await runtime.executionEvidence.readAttemptHistory(request.invocationRequestId)
  )[0]!;
  const outcome = await runtime.executionEvidence.readProviderOutcome(attempt.executionAttemptId);
  if (outcome === null) throw new Error("missing outcome");
  const envelope = result.resultEnvelope;
  if (operation === "output-mutation") {
    const verification = verifyReasoningResultEnvelopeArtifact({
      ...envelope,
      outputContent: { contentType: "canonical-json", value: null },
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "usage-mutation") {
    const verification = verifyReasoningUsageEvidence({
      ...envelope.usageEvidence,
      durationMilliseconds: envelope.usageEvidence.durationMilliseconds + 1,
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "cost-mutation") {
    const verification = verifyReasoningCostEvidence({
      ...envelope.costEvidence,
      costFingerprint: "0".repeat(64),
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "failure-mutation") {
    if (envelope.outcome !== "failed") throw new Error("expected failure");
    const verification = verifyReasoningFailureEvidence({
      ...envelope.failureEvidence,
      failureFingerprint: "0".repeat(64),
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "timeout-mutation") {
    if (envelope.outcome !== "timed-out") throw new Error("expected timeout");
    const verification = verifyReasoningTimeoutEvidence({
      ...envelope.timeoutEvidence,
      timeoutFingerprint: "0".repeat(64),
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "cancellation-mutation") {
    if (envelope.outcome !== "cancelled") throw new Error("expected cancellation");
    const verification = verifyReasoningCancellationEvidence({
      ...envelope.cancellationEvidence,
      cancellationFingerprint: "0".repeat(64),
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "receipt-mutation") {
    const verification = verifyReasoningExecutionReceipt({
      ...envelope.executionReceipt,
      startedAt: request.requestedAt,
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "result-mutation") {
    const verification = verifyReasoningResultEnvelopeArtifact({
      ...envelope,
      consumerId: "mutated-evaluation-consumer",
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  if (operation === "consumption-mutation") {
    const verification = verifyFinalizedReasoningConsumptionEvidence({
      consumptionEvidence: {
        ...result.consumptionEvidence,
        executionLedgerTransactionId: "mutated-evaluation-transaction",
      },
      resultEnvelope: envelope,
      invocationRequest: request,
      providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
      attempts: [attempt],
      outcomes: [outcome],
      contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
      executionLedgerTransactionId: result.consumptionEvidence.executionLedgerTransactionId,
    });
    return rejectedEvidenceObservation(runtime, request, verification);
  }
  const { resultEnvelopeFingerprint: _fingerprint, ...unsigned } = envelope;
  void _fingerprint;
  const resigned = createReasoningResultEnvelope({
    ...unsigned,
    consumerId: "resigned-evaluation-consumer",
  });
  const verification = verifyReasoningResultEnvelope({
    resultEnvelope: resigned,
    invocationRequest: request,
    providerCapability: createDeterministicFakeReasoningProvider().providerCapability,
    attempt,
    attemptHistory: [attempt],
    providerOutcome: outcome,
    outcomeHistory: [outcome],
    contextPackageObjectCount: runtime.fixture.result.envelope.contextPackage.included.length,
  });
  return rejectedEvidenceObservation(runtime, request, verification);
}

async function rejectedEvidenceObservation(
  runtime: Runtime,
  request: ReturnType<typeof createInvocation>,
  verification: ReturnType<typeof verifyReasoningResultEnvelopeArtifact>,
) {
  expect(verification.status).toBe("invalid");
  const state = await readObservedLedgerState(runtime, request);
  return {
    disposition: "reject" as const,
    errorCode: null,
    status: verification.status,
    outcome: null,
    reasonCodes: verification.issues.map((issue) => issue.code),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verification.status,
    attemptIdentity: observedAttemptIdentity(state.attempts),
    resultExpectation: state.result === null ? ("none" as const) : ("finalized" as const),
    evidenceExpectation: "rejected" as const,
    finalizationExpectation:
      state.consumption === null ? ("none" as const) : ("committed" as const),
  };
}

async function executeProviderSafety(evaluation: ReasoningEvaluation, roots: string[]) {
  const operation = evaluation.mutation.operation;
  if (
    ["network-free", "environment-free", "randomness-free", "wall-clock-free"].includes(operation)
  ) {
    const source = await readFile(
      new URL("../src/infrastructure/deterministic-fake-reasoning-provider.ts", import.meta.url),
      "utf8",
    );
    const target = requiredMutationTarget(evaluation);
    const forbiddenByTarget: Readonly<Record<string, RegExp>> = {
      "provider.source.network": /\bfetch\b|https?:\/\//u,
      "provider.source.environment": /process\.env|credential store|keychain/iu,
      "provider.source.randomness": /Math\.random|randomUUID|randomBytes/u,
      "provider.source.wallClock": /Date\.now|new Date\s*\(/u,
    };
    const forbidden = forbiddenByTarget[target];
    if (forbidden === undefined) throw new Error(`Unsupported provider source target: ${target}`);
    expect(source).not.toMatch(forbidden);
    return {
      disposition: "reject" as const,
      errorCode: null,
      status: "safe",
      outcome: null,
      reasonCodes: [],
      attemptCount: 0,
      durable: "not-applicable" as const,
      fingerprintStatus: "not-applicable" as const,
      attemptIdentity: "none" as const,
      resultExpectation: "none" as const,
      evidenceExpectation: "sanitized" as const,
      finalizationExpectation: "none" as const,
    };
  }
  const runtime = await createReasoningTestRuntime(roots);
  const fixtureMode =
    operation === "physical-path"
      ? "physical-path-bearing-outcome"
      : operation === "credential"
        ? "credential-bearing-outcome"
        : operation === "malformed"
          ? "malformed-success-outcome"
          : "contradictory-outcome";
  const request = createInvocation(runtime, {
    idempotencyKey: `reasoning:key:evaluation:${operation}`,
  });
  const result = await invoke(runtime, operation, { fixtureMode, invocationRequest: request });
  if (result.status === "identical-in-progress") throw new Error("unexpected in-progress");
  expect(result.resultEnvelope.outcome).toBe("failed");
  const serialized = JSON.stringify(result);
  if (operation === "physical-path") expect(serialized).not.toContain("/private/");
  if (operation === "credential") expect(serialized).not.toContain("fixture-secret");
  if (result.resultEnvelope.outcome === "failed")
    expect(result.resultEnvelope.failureEvidence.reasonCodes[0]).toBe(
      operation === "physical-path"
        ? "physical_path_rejected"
        : operation === "credential"
          ? "credential_material_rejected"
          : operation === "malformed"
            ? "malformed_success_outcome"
            : "invalid_provider_outcome",
    );
  const state = await readObservedLedgerState(runtime, request);
  if (state.result === null) throw new Error("missing sanitized provider result");
  return {
    disposition: "reject" as const,
    errorCode: null,
    status: result.status,
    outcome: state.result.outcome,
    reasonCodes: resultReasonCodes(state.result),
    attemptCount: state.attempts.length,
    durable: state.integrity.status === "valid",
    fingerprintStatus: verifyReasoningResultEnvelopeArtifact(state.result).status,
    attemptIdentity: observedAttemptIdentity(state.attempts),
    resultExpectation: "finalized" as const,
    evidenceExpectation: "sanitized" as const,
    finalizationExpectation:
      state.consumption === null ? ("none" as const) : ("committed" as const),
  };
}

async function executeFacadeBypass(evaluation: ReasoningEvaluation, roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const operation = evaluation.mutation.operation;
  if (operation === "low-level-finalization") {
    expect("finalizeInvocation" in runtime.executionEvidence).toBe(false);
    expect("appendProviderOutcome" in runtime.executionEvidence).toBe(false);
    const integrity = await runtime.executionEvidence.verifyIntegrity();
    return {
      disposition: "reject" as const,
      errorCode: null,
      status: "absent",
      outcome: null,
      reasonCodes: [],
      attemptCount: 0,
      durable: integrity.status === "valid",
      fingerprintStatus: "not-applicable" as const,
      attemptIdentity: "none" as const,
      resultExpectation: "rejected" as const,
      evidenceExpectation: "none" as const,
      finalizationExpectation: "none" as const,
    };
  }
  const target = requiredMutationTarget(evaluation);
  const fieldByTarget: Readonly<Record<string, string>> = {
    "facade.rawKnowledgeObjects": "rawKnowledgeObjects",
    "facade.queryResult": "queryResult",
    "facade.hiddenContext": "hiddenContext",
    "facade.providerPayload": "providerPayload",
    "facade.preconstructedResult": "preconstructedResult",
  };
  const field = fieldByTarget[target];
  if (field === undefined) throw new Error(`Unsupported facade target: ${target}`);
  const base = {
    deliveryLedger: runtime.deliveryLedger,
    executionEvidence: runtime.executionEvidence,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest: createInvocation(runtime, {
      idempotencyKey: `reasoning:key:evaluation:${operation}`,
    }),
    fixtureMode: "successful-structured-response" as const,
    attemptSchedule: schedule(),
  };
  let error: unknown;
  try {
    await invokeGovernedReasoning({ ...base, [field]: {} } as never);
  } catch (caught) {
    error = caught;
  }
  const integrity = await runtime.executionEvidence.verifyIntegrity();
  expect(integrity.verifiedInvocationCount).toBe(0);
  return {
    disposition: error === undefined ? ("accept" as const) : ("reject" as const),
    errorCode: observedErrorCode(error),
    status: error === undefined ? "accepted" : "invalid",
    outcome: null,
    reasonCodes: [],
    attemptCount: 0,
    durable: integrity.status === "valid",
    fingerprintStatus: "not-applicable" as const,
    attemptIdentity: "none" as const,
    resultExpectation: "rejected" as const,
    evidenceExpectation: "none" as const,
    finalizationExpectation: "none" as const,
  };
}
