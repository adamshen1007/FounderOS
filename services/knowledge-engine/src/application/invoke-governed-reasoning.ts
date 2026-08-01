import {
  ReasoningProviderOutcomeSchema,
  findDurableCanonicalJsonIssue,
  type DurableContextDeliveryLedger,
  type FinalizedReasoningConsumptionEvidence,
  type ReasoningExecutionAttempt,
  type ReasoningInvocationRequest,
  type ReasoningProviderOutcome,
  type ReasoningResultEnvelope,
} from "@founderos/knowledge-schema";

import type {
  DeterministicFakeReasoningFixtureMode,
  ProviderNeutralReasoningExecutionPort,
  ReasoningCancellationSignal,
} from "./reasoning-execution-port.js";
import {
  resolveInternalReasoningExecutionEvidence,
  type GovernedReasoningExecutionEvidenceReader,
} from "./manage-governed-reasoning-execution-ledger.js";
import {
  GovernedReasoningAuthorityVerificationError,
  resolveVerifiedGovernedReasoningAuthority,
  type DurableDeliveryTransactionIdentity,
} from "./resolve-verified-governed-reasoning-authority.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import {
  countCanonicalCharacters,
  countOutputCharacters,
  createFinalizedReasoningConsumptionEvidence,
  createReasoningCostEvidence,
  createReasoningCancellationEvidence,
  createReasoningExecutionAttempt,
  createReasoningExecutionReceipt,
  createReasoningFailureEvidence,
  createReasoningProviderOutcome,
  createReasoningTimeoutEvidence,
  createReasoningResultEnvelope,
  createReasoningUsageEvidence,
  isReasoningRetryTransitionAuthorized,
  matchReasoningProviderCapabilities,
  verifyFinalizedReasoningConsumptionEvidence,
  verifyReasoningAttemptLifecycle,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderOutcome,
  verifyReasoningResultEnvelope,
} from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import { createDeterministicFakeReasoningProvider } from "../infrastructure/deterministic-fake-reasoning-provider.js";

export type { DurableDeliveryTransactionIdentity } from "./resolve-verified-governed-reasoning-authority.js";

export interface ReasoningAttemptSchedule {
  readonly startedAt: string;
  readonly deadlineAt: string;
  readonly completedAt: string;
  readonly cancellationSignal: ReasoningCancellationSignal;
}

export interface InvokeGovernedReasoningInput {
  readonly deliveryLedger: DurableContextDeliveryLedger;
  readonly executionEvidence: GovernedReasoningExecutionEvidenceReader;
  readonly deliveryIdentity: DurableDeliveryTransactionIdentity;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly fixtureMode: DeterministicFakeReasoningFixtureMode;
  readonly attemptSchedule: readonly ReasoningAttemptSchedule[];
}

export type GovernedReasoningInvocationResult =
  | {
      readonly schemaVersion: "1.0";
      readonly status: "finalized" | "identical-finalized";
      readonly resultEnvelope: ReasoningResultEnvelope;
      readonly consumptionEvidence: FinalizedReasoningConsumptionEvidence;
    }
  | {
      readonly schemaVersion: "1.0";
      readonly status: "identical-in-progress";
      readonly invocationRequestId: string;
      readonly reasonCode: "invocation_already_in_progress";
    };

export class GovernedReasoningInvocationError extends Error {
  public constructor(
    public readonly code:
      | "capability_mismatch"
      | "delivery_integrity_failure"
      | "idempotency_conflict"
      | "invalid_invocation"
      | "invalid_schedule"
      | "result_integrity_failure",
    message: string,
  ) {
    super(message);
    this.name = "GovernedReasoningInvocationError";
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
function head(sequence: number, fingerprint: string) {
  return { ledgerSequence: sequence, auditFingerprint: fingerprint };
}
function addMillisecondsIsExact(
  startedAt: string,
  deadlineAt: string,
  milliseconds: number,
): boolean {
  return Date.parse(deadlineAt) - Date.parse(startedAt) === milliseconds;
}
function safeSchedule(
  schedule: readonly ReasoningAttemptSchedule[],
): readonly ReasoningAttemptSchedule[] {
  if (findDurableCanonicalJsonIssue(schedule) !== null || schedule.length === 0)
    throw new GovernedReasoningInvocationError(
      "invalid_schedule",
      "Invocation requires accessor-free explicit Attempt timing evidence",
    );
  return immutableCopy(schedule);
}

function validateCompleteSchedule(
  request: ReasoningInvocationRequest,
  fixtureMode: DeterministicFakeReasoningFixtureMode,
  schedule: readonly ReasoningAttemptSchedule[],
): void {
  if (schedule.length !== request.executionPolicy.maxAttemptCount)
    throw new GovernedReasoningInvocationError(
      "invalid_schedule",
      "Attempt schedule must cover the complete authorized Attempt budget",
    );
  if (
    fixtureMode === "transient-failure-then-success" &&
    request.executionPolicy.maxAttemptCount < 2
  )
    throw new GovernedReasoningInvocationError(
      "invalid_schedule",
      "Transient-then-success fixture requires at least two authorized Attempts",
    );
  const fixtureCancellationState = {
    "cancellation-before-execution": "requested-before-execution",
    "cooperative-cancellation": "requested-cooperatively",
    "deadline-cancellation": "requested-at-deadline",
  } as const;
  let priorCompletedAt = Date.parse(request.requestedAt);
  for (const timing of schedule) {
    const startedAt = Date.parse(timing.startedAt);
    const deadlineAt = Date.parse(timing.deadlineAt);
    const completedAt = Date.parse(timing.completedAt);
    const requestedAt = Date.parse(timing.cancellationSignal.requestedAt);
    const observedAt = Date.parse(timing.cancellationSignal.observedAt);
    if (
      [startedAt, deadlineAt, completedAt, requestedAt, observedAt].some(
        (value) => !Number.isFinite(value),
      ) ||
      !addMillisecondsIsExact(
        timing.startedAt,
        timing.deadlineAt,
        request.executionPolicy.timeoutMilliseconds,
      ) ||
      startedAt < priorCompletedAt ||
      completedAt < startedAt
    )
      throw new GovernedReasoningInvocationError(
        "invalid_schedule",
        "Attempt timing evidence does not match the complete verified timeout schedule",
      );
    const state = timing.cancellationSignal.state;
    const expectedMode = {
      "requested-before-execution": "cancel-before-execution",
      "requested-cooperatively": "cooperative-cancellation",
      "requested-at-deadline": "deadline-cancellation",
    } as const;
    if (
      (state !== "not-requested" &&
        request.executionPolicy.cancellationMode !== expectedMode[state]) ||
      requestedAt > observedAt ||
      (state === "requested-before-execution" &&
        (requestedAt > startedAt || observedAt > startedAt)) ||
      (state === "requested-cooperatively" &&
        (requestedAt < startedAt || observedAt > completedAt)) ||
      (state === "requested-at-deadline" &&
        (requestedAt !== deadlineAt ||
          observedAt < deadlineAt ||
          observedAt > completedAt ||
          completedAt < deadlineAt))
    )
      throw new GovernedReasoningInvocationError(
        "invalid_schedule",
        "Cancellation timing evidence contradicts its governed phase",
      );
    const fixtureState =
      fixtureMode in fixtureCancellationState
        ? fixtureCancellationState[fixtureMode as keyof typeof fixtureCancellationState]
        : undefined;
    if (
      (fixtureMode === "timeout" && completedAt < deadlineAt) ||
      (fixtureState !== undefined && state !== fixtureState)
    )
      throw new GovernedReasoningInvocationError(
        "invalid_schedule",
        "Fixture schedule does not supply its required terminal control evidence",
      );
    priorCompletedAt = completedAt;
  }
}

export async function invokeGovernedReasoning(
  input: InvokeGovernedReasoningInput,
): Promise<GovernedReasoningInvocationResult> {
  return invokeGovernedReasoningWithProvider(input, createDeterministicFakeReasoningProvider());
}

/** Test seam kept out of the package facade; production callers always use the governed fake. */
export async function invokeGovernedReasoningWithProvider(
  input: InvokeGovernedReasoningInput,
  provider: ProviderNeutralReasoningExecutionPort,
): Promise<GovernedReasoningInvocationResult> {
  input = captureFacadeInput(input);
  const executionEvidence = resolveInternalReasoningExecutionEvidence(input.executionEvidence);
  const schedule = safeSchedule(input.attemptSchedule);
  const request = immutableCopy(input.invocationRequest);
  if (verifyReasoningInvocationRequest(request).status !== "valid")
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Reasoning Invocation Request failed independent verification",
    );
  validateCompleteSchedule(request, input.fixtureMode, schedule);

  let delivery;
  try {
    delivery = await resolveVerifiedGovernedReasoningAuthority({
      deliveryLedger: input.deliveryLedger,
      deliveryIdentity: input.deliveryIdentity,
      invocationRequest: request,
    });
  } catch (error) {
    if (error instanceof GovernedReasoningAuthorityVerificationError)
      throw new GovernedReasoningInvocationError(error.code, error.message);
    throw error;
  }
  const executionIntegrity = await executionEvidence.verifyIntegrity();
  const executionRecovery = await executionEvidence.recover();
  if (executionIntegrity.status !== "valid" || executionRecovery.status !== "recovered")
    throw new GovernedReasoningInvocationError(
      "result_integrity_failure",
      "Reasoning Execution Ledger failed integrity verification",
    );
  let currentHead = head(
    executionIntegrity.verifiedThroughSequence,
    executionIntegrity.lastAuditFingerprint,
  );

  const compatibility = matchReasoningProviderCapabilities({
    invocationRequest: request,
    providerCapability: provider.providerCapability,
  });
  if (compatibility.status !== "compatible")
    throw new GovernedReasoningInvocationError(
      "capability_mismatch",
      `Provider capability mismatch: ${compatibility.reasonCodes.join(",")}`,
    );
  if (countCanonicalCharacters(request.reasoningInput) > request.executionPolicy.maxInputCharacters)
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Reasoning input exceeds the verified Execution Policy budget",
    );

  const registration = await executionEvidence.registerGovernedInvocation(
    {
      schemaVersion: "1.0",
      expectedLedgerHead: currentHead,
      expectedIdempotencyState: "unowned",
      invocationRequest: request,
      registeredAt: request.requestedAt,
    },
    {
      providerCapability: provider.providerCapability,
      contextPackageObjectCount: delivery.envelope.contextPackage.included.length,
    },
  );
  if (registration.status === "conflict")
    throw new GovernedReasoningInvocationError(
      "idempotency_conflict",
      "Invocation idempotency key is owned by different canonical content",
    );
  if (registration.status === "identical-in-progress")
    return immutableCopy({
      schemaVersion: "1.0",
      status: "identical-in-progress",
      invocationRequestId: registration.ownership.invocationRequestId,
      reasonCode: registration.reasonCode,
    });
  if (registration.status === "identical-finalized")
    return immutableCopy({
      schemaVersion: "1.0",
      status: "identical-finalized",
      resultEnvelope: registration.finalization.resultEnvelope,
      consumptionEvidence: registration.finalization.consumptionEvidence,
    });
  const attempts: ReasoningExecutionAttempt[] = [];
  const outcomes: ReasoningProviderOutcome[] = [];
  let terminalOutcome: ReasoningProviderOutcome | undefined;
  for (let index = 0; index < request.executionPolicy.maxAttemptCount; index += 1) {
    const timing = schedule[index];
    if (timing === undefined) throw new Error("Complete schedule validation invariant failed");
    const cancellationState = timing.cancellationSignal.state;
    const attemptUnsigned = {
      schemaVersion: "1.0" as const,
      executionAttemptId: `reasoning-attempt-${createDurableCanonicalJsonSha256Fingerprint({ invocationRequestFingerprint: request.requestFingerprint, attemptNumber: index + 1 })}`,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      invocationIdempotencyKey: request.idempotencyKey,
      providerCapabilityId: provider.providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: provider.providerCapability.descriptorFingerprint,
      executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
      attemptNumber: index + 1,
      ...(index === 0
        ? {}
        : { previousExecutionAttemptId: attempts[index - 1]!.executionAttemptId }),
      startedAt: timing.startedAt,
      deadlineAt: timing.deadlineAt,
      cancellationState,
      ...(cancellationState === "not-requested"
        ? {}
        : {
            cancellationAuthorityReference: timing.cancellationSignal.authorityReference,
            cancellationRequestedAt: timing.cancellationSignal.requestedAt,
            cancellationObservedAt: timing.cancellationSignal.observedAt,
          }),
    };
    const attempt = createReasoningExecutionAttempt(attemptUnsigned);
    const integrityBeforeAttempt = await executionEvidence.verifyIntegrity();
    currentHead = head(
      integrityBeforeAttempt.verifiedThroughSequence,
      integrityBeforeAttempt.lastAuditFingerprint,
    );
    await executionEvidence.appendExecutionAttempt({
      schemaVersion: "1.0",
      expectedLedgerHead: currentHead,
      ownershipId: registration.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      expectedPriorAttemptCount: attempts.length,
      attempt,
    });
    attempts.push(attempt);

    const controlled = controlledTerminalOutcome(request, attempt, timing);
    const rawOutcome =
      controlled ??
      (await provider.execute({
        invocationRequest: request,
        providerCapability: provider.providerCapability,
        compatibility,
        attempt,
        completedAt: timing.completedAt,
        evaluationTime: request.requestedAt,
        cancellationSignal: timing.cancellationSignal,
        fixtureMode: input.fixtureMode,
      }));
    let outcome = normalizeProviderOutcome(
      rawOutcome,
      request,
      attempt,
      timing.completedAt,
      input.fixtureMode,
      index + 1 === request.executionPolicy.maxAttemptCount,
    );
    // Timing and cancellation are execution controls. A provider label can never override them.
    outcome = controlledTerminalOutcome(request, attempt, timing) ?? outcome;
    if (
      !verifyReasoningAttemptLifecycle({
        invocationRequest: request,
        providerCapability: provider.providerCapability,
        attempts,
        outcomes: [...outcomes, outcome],
      })
    )
      throw new GovernedReasoningInvocationError(
        "result_integrity_failure",
        "Attempt terminal controls failed authoritative lifecycle verification",
      );
    const integrityBeforeOutcome = await executionEvidence.verifyIntegrity();
    currentHead = head(
      integrityBeforeOutcome.verifiedThroughSequence,
      integrityBeforeOutcome.lastAuditFingerprint,
    );
    await executionEvidence.appendProviderOutcome({
      schemaVersion: "1.0",
      expectedLedgerHead: currentHead,
      ownershipId: registration.ownership.ownershipId,
      expectedOwnershipStatus: "in-progress",
      attemptFingerprint: attempt.attemptFingerprint,
      outcome,
    });
    outcomes.push(outcome);
    terminalOutcome = outcome;
    if (!isReasoningRetryTransitionAuthorized(outcome, request.executionPolicy, index + 1)) break;
  }
  if (terminalOutcome === undefined)
    throw new GovernedReasoningInvocationError(
      "result_integrity_failure",
      "Invocation produced no terminal Attempt outcome",
    );

  const finalAttempt = attempts.at(-1)!;
  const result = buildResult({
    request,
    provider,
    attempt: finalAttempt,
    outcome: terminalOutcome,
    deliveryObjectCount: delivery.envelope.contextPackage.included.length,
  });
  if (
    verifyReasoningResultEnvelope({
      resultEnvelope: result,
      invocationRequest: request,
      providerCapability: provider.providerCapability,
      attempt: finalAttempt,
      attemptHistory: attempts,
      providerOutcome: terminalOutcome,
      outcomeHistory: outcomes,
      contextPackageObjectCount: delivery.envelope.contextPackage.included.length,
    }).status !== "valid"
  )
    throw new GovernedReasoningInvocationError(
      "result_integrity_failure",
      "Terminal Result Envelope failed independent verification",
    );
  const transactionId = `reasoning-finalization-${createDurableCanonicalJsonSha256Fingerprint({ invocationRequestFingerprint: request.requestFingerprint, resultEnvelopeFingerprint: result.resultEnvelopeFingerprint })}`;
  const historyEntries = attempts.map((attempt, index) => ({
    executionAttemptId: attempt.executionAttemptId,
    attemptNumber: attempt.attemptNumber,
    outcome: outcomes[index]!.status,
    attemptFingerprint: attempt.attemptFingerprint,
    outcomeFingerprint: outcomes[index]!.outcomeFingerprint,
  }));
  const historyUnsigned = {
    attemptCount: historyEntries.length,
    finalAttemptNumber: finalAttempt.attemptNumber,
    finalOutcome: terminalOutcome.status,
    attempts: historyEntries,
  };
  const consumptionBase = {
    schemaVersion: "1.0" as const,
    consumptionId: `reasoning-consumption-${createDurableCanonicalJsonSha256Fingerprint({ invocationRequestFingerprint: request.requestFingerprint, resultEnvelopeFingerprint: result.resultEnvelopeFingerprint })}`,
    deliveryReceiptId: request.deliveryReceiptId,
    deliveryReceiptFingerprint: request.deliveryReceiptFingerprint,
    deliveryTransactionId: request.deliveryTransactionId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    invocationIdempotencyKey: request.idempotencyKey,
    providerCapabilityId: provider.providerCapability.providerCapabilityId,
    providerCapabilityFingerprint: provider.providerCapability.descriptorFingerprint,
    finalResultEnvelopeId: result.resultEnvelopeId,
    finalResultEnvelopeFingerprint: result.resultEnvelopeFingerprint,
    finalOutcome: terminalOutcome.status,
    attemptHistorySummary: {
      ...historyUnsigned,
      historyFingerprint: createDurableCanonicalJsonSha256Fingerprint(historyUnsigned),
    },
    startedAt: attempts[0]!.startedAt,
    completedAt: terminalOutcome.completedAt,
    usageEvidenceFingerprint: result.usageEvidence.usageFingerprint,
    costEvidenceFingerprint: result.costEvidence.costFingerprint,
    executionLedgerTransactionId: transactionId,
  };
  const consumption = createFinalizedReasoningConsumptionEvidence({
    ...consumptionBase,
    ...terminalEvidenceFingerprint(terminalOutcome),
  } as Parameters<typeof createFinalizedReasoningConsumptionEvidence>[0]);
  if (
    verifyFinalizedReasoningConsumptionEvidence({
      consumptionEvidence: consumption,
      resultEnvelope: result,
      invocationRequest: request,
      providerCapability: provider.providerCapability,
      attempts,
      outcomes,
      contextPackageObjectCount: delivery.envelope.contextPackage.included.length,
      executionLedgerTransactionId: transactionId,
    }).status !== "valid"
  )
    throw new GovernedReasoningInvocationError(
      "result_integrity_failure",
      "Finalized Consumption Evidence failed independent verification",
    );
  const finalHead = await executionEvidence.verifyIntegrity();
  const finalized = await executionEvidence.finalizeInvocation({
    schemaVersion: "1.0",
    expectedLedgerHead: head(finalHead.verifiedThroughSequence, finalHead.lastAuditFingerprint),
    ownershipId: registration.ownership.ownershipId,
    expectedOwnershipStatus: "in-progress",
    expectedAttemptCount: attempts.length,
    transactionId,
    resultEnvelope: result,
    consumptionEvidence: consumption,
    finalizedAt: terminalOutcome.completedAt,
  });
  if (finalized.status === "conflict")
    throw new GovernedReasoningInvocationError(
      "idempotency_conflict",
      "Invocation finalization conflicts with durable evidence",
    );
  return immutableCopy({
    schemaVersion: "1.0",
    status: "finalized",
    resultEnvelope: finalized.finalization.resultEnvelope,
    consumptionEvidence: finalized.finalization.consumptionEvidence,
  });
}

function captureFacadeInput(raw: InvokeGovernedReasoningInput): InvokeGovernedReasoningInput {
  if (raw === null || typeof raw !== "object" || Object.getPrototypeOf(raw) !== Object.prototype)
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Invocation input must be a plain governed record",
    );
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const fields = [
    "deliveryLedger",
    "executionEvidence",
    "deliveryIdentity",
    "invocationRequest",
    "fixtureMode",
    "attemptSchedule",
  ] as const;
  if (
    Reflect.ownKeys(descriptors).length !== fields.length ||
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key !== "string" || !fields.includes(key as (typeof fields)[number]),
    )
  )
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Invocation input contains unsupported public fields",
    );
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      throw new GovernedReasoningInvocationError(
        "invalid_invocation",
        "Invocation input must be accessor-free",
      );
    values[field] = descriptor.value;
  }
  if (
    findDurableCanonicalJsonIssue({
      deliveryIdentity: values.deliveryIdentity,
      invocationRequest: values.invocationRequest,
      fixtureMode: values.fixtureMode,
      attemptSchedule: values.attemptSchedule,
    }) !== null
  )
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Invocation canonical fields must be accessor-free",
    );
  if (
    typeof values.fixtureMode !== "string" ||
    !DETERMINISTIC_FIXTURE_MODES.has(values.fixtureMode as DeterministicFakeReasoningFixtureMode)
  )
    throw new GovernedReasoningInvocationError(
      "invalid_invocation",
      "Invocation fixture mode is not a supported deterministic evaluation mode",
    );
  return Object.freeze(values) as unknown as InvokeGovernedReasoningInput;
}

const DETERMINISTIC_FIXTURE_MODES = new Set<DeterministicFakeReasoningFixtureMode>([
  "cancellation-before-execution",
  "cooperative-cancellation",
  "contradictory-outcome",
  "credential-bearing-outcome",
  "deterministic-permanent-failure",
  "deterministic-transient-failure",
  "deadline-cancellation",
  "malformed-failure-outcome",
  "malformed-success-outcome",
  "output-budget-overflow",
  "physical-path-bearing-outcome",
  "successful-empty-response",
  "successful-structured-response",
  "timeout",
  "transient-failure-then-success",
]);

function controlledTerminalOutcome(
  request: ReasoningInvocationRequest,
  attempt: ReasoningExecutionAttempt,
  timing: ReasoningAttemptSchedule,
): ReasoningProviderOutcome | null {
  const signal = timing.cancellationSignal;
  // Deterministic precedence: pre-execution cancellation; deadline cancellation;
  // cooperative cancellation observed before the deadline; expired deadline/timeout.
  if (
    signal.state === "requested-before-execution" ||
    signal.state === "requested-at-deadline" ||
    (signal.state === "requested-cooperatively" &&
      Date.parse(signal.observedAt) < Date.parse(timing.deadlineAt))
  ) {
    const detail =
      signal.state === "requested-before-execution"
        ? {
            cancellationMode: "cancel-before-execution" as const,
            cancellationPhase: "before-execution" as const,
            reasonCode: "cancelled_before_execution" as const,
          }
        : signal.state === "requested-cooperatively"
          ? {
              cancellationMode: "cooperative-cancellation" as const,
              cancellationPhase: "cooperative-execution" as const,
              reasonCode: "cancelled_cooperatively" as const,
            }
          : {
              cancellationMode: "deadline-cancellation" as const,
              cancellationPhase: "deadline" as const,
              reasonCode: "cancelled_at_deadline" as const,
            };
    const evidence = createReasoningCancellationEvidence({
      schemaVersion: "1.0",
      invocationRequestId: request.invocationRequestId,
      executionAttemptId: attempt.executionAttemptId,
      ...detail,
      cancellationAuthorityReference: signal.authorityReference,
      requestedAt: signal.requestedAt,
      observedAt: signal.observedAt,
    });
    return createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: attempt.attemptNumber,
      completedAt: timing.completedAt,
      status: "cancelled",
      cancellationEvidence: evidence,
    });
  }
  if (Date.parse(timing.completedAt) >= Date.parse(timing.deadlineAt)) {
    const evidence = createReasoningTimeoutEvidence({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      configuredTimeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
      attemptStartedAt: attempt.startedAt,
      deadlineAt: timing.deadlineAt,
      elapsedMilliseconds: Date.parse(timing.completedAt) - Date.parse(attempt.startedAt),
      timeoutPhase: "during-execution",
      reasonCode: "execution_deadline_reached",
    });
    return createReasoningProviderOutcome({
      schemaVersion: "1.0",
      executionAttemptId: attempt.executionAttemptId,
      invocationRequestId: request.invocationRequestId,
      attemptNumber: attempt.attemptNumber,
      completedAt: timing.completedAt,
      status: "timed-out",
      timeoutEvidence: evidence,
    });
  }
  return null;
}

function normalizeProviderOutcome(
  raw: unknown,
  request: ReasoningInvocationRequest,
  attempt: ReasoningExecutionAttempt,
  scheduledCompletedAt: string,
  mode: DeterministicFakeReasoningFixtureMode,
  exhausted: boolean,
): ReasoningProviderOutcome {
  const parsed = ReasoningProviderOutcomeSchema.safeParse(raw);
  if (parsed.success && verifyReasoningProviderOutcome(parsed.data).status === "valid") {
    if (
      parsed.data.invocationRequestId !== request.invocationRequestId ||
      parsed.data.executionAttemptId !== attempt.executionAttemptId ||
      parsed.data.attemptNumber !== attempt.attemptNumber ||
      parsed.data.completedAt !== scheduledCompletedAt
    )
      return validationFailure(request, attempt, scheduledCompletedAt, "invalid_provider_outcome");
    if (parsed.data.status === "succeeded") {
      const count = countOutputCharacters(parsed.data.outputContent);
      const outputRequirements = request.reasoningInput.outputRequirements;
      if (
        parsed.data.outputContent.contentType !== outputRequirements.contentType ||
        count > request.executionPolicy.maxOutputCharacters ||
        count > outputRequirements.maxCharacters ||
        (outputRequirements.requireNonEmpty && count === 0)
      )
        return validationFailure(
          request,
          attempt,
          parsed.data.completedAt,
          count > request.executionPolicy.maxOutputCharacters ||
            count > outputRequirements.maxCharacters
            ? "output_budget_exceeded"
            : "malformed_success_outcome",
        );
    }
    if (parsed.data.status === "failed" && parsed.data.failureEvidence.retryable && exhausted)
      return attemptLimitFailure(request, attempt, parsed.data.completedAt);
    return immutableCopy(parsed.data);
  }
  const reason =
    mode === "physical-path-bearing-outcome"
      ? "physical_path_rejected"
      : mode === "credential-bearing-outcome"
        ? "credential_material_rejected"
        : mode === "malformed-success-outcome"
          ? "malformed_success_outcome"
          : mode === "malformed-failure-outcome"
            ? "malformed_failure_outcome"
            : "invalid_provider_outcome";
  return validationFailure(request, attempt, scheduledCompletedAt, reason);
}
function validationFailure(
  request: ReasoningInvocationRequest,
  attempt: ReasoningExecutionAttempt,
  completedAt: string,
  reason:
    | "credential_material_rejected"
    | "invalid_provider_outcome"
    | "malformed_failure_outcome"
    | "malformed_success_outcome"
    | "output_budget_exceeded"
    | "physical_path_rejected",
): ReasoningProviderOutcome {
  const evidence = createReasoningFailureEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    failureCategory: "output-validation",
    reasonCodes: [reason],
    retryable: false,
    sanitizedDetail: "Provider outcome failed governed output verification",
    attemptNumber: attempt.attemptNumber,
  });
  return createReasoningProviderOutcome({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    attemptNumber: attempt.attemptNumber,
    completedAt,
    status: "failed",
    failureEvidence: evidence,
  });
}
function attemptLimitFailure(
  request: ReasoningInvocationRequest,
  attempt: ReasoningExecutionAttempt,
  completedAt: string,
): ReasoningProviderOutcome {
  const evidence = createReasoningFailureEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    failureCategory: "attempt-limit-exhausted",
    reasonCodes: ["attempt_limit_exhausted"],
    retryable: false,
    sanitizedDetail: "Verified Attempt limit exhausted",
    attemptNumber: attempt.attemptNumber,
  });
  return createReasoningProviderOutcome({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    attemptNumber: attempt.attemptNumber,
    completedAt,
    status: "failed",
    failureEvidence: evidence,
  });
}
function buildResult(input: {
  readonly request: ReasoningInvocationRequest;
  readonly provider: ProviderNeutralReasoningExecutionPort;
  readonly attempt: ReasoningExecutionAttempt;
  readonly outcome: ReasoningProviderOutcome;
  readonly deliveryObjectCount: number;
}): ReasoningResultEnvelope {
  const { request, attempt, outcome } = input;
  const duration = Date.parse(outcome.completedAt) - Date.parse(attempt.startedAt);
  const outputCharacters = outcome.status === "succeeded" ? outcome.outputCharacterCount : 0;
  const receipt = createReasoningExecutionReceipt({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    invocationRequestId: request.invocationRequestId,
    invocationRequestFingerprint: request.requestFingerprint,
    providerCapabilityId: input.provider.providerCapability.providerCapabilityId,
    providerCapabilityFingerprint: input.provider.providerCapability.descriptorFingerprint,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    completedAt: outcome.completedAt,
    outcome: outcome.status,
  });
  const usage = createReasoningUsageEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    inputCharacterCount: countCanonicalCharacters(request.reasoningInput),
    outputCharacterCount: outputCharacters,
    instructionBlockCount: request.reasoningInput.instructionBlocks.length,
    contextPackageObjectCount: input.deliveryObjectCount,
    attemptNumber: attempt.attemptNumber,
    durationMilliseconds: duration,
  });
  const cost = createReasoningCostEvidence({
    schemaVersion: "1.0",
    executionAttemptId: attempt.executionAttemptId,
    status: "not-applicable",
  });
  const base = {
    schemaVersion: "1.0" as const,
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
    providerCapabilityId: input.provider.providerCapability.providerCapabilityId,
    providerCapabilityFingerprint: input.provider.providerCapability.descriptorFingerprint,
    executionPolicyFingerprint: request.executionPolicy.policyFingerprint,
    executionAttemptId: attempt.executionAttemptId,
    attemptNumber: attempt.attemptNumber,
    executionReceipt: receipt,
    usageEvidence: usage,
    costEvidence: cost,
    completedAt: outcome.completedAt,
  };
  if (outcome.status === "succeeded")
    return createReasoningResultEnvelope({
      ...base,
      outcome: "succeeded",
      outputContent: outcome.outputContent,
      outputCharacterCount: outcome.outputCharacterCount,
      outputContentFingerprint: outcome.outputContentFingerprint,
    });
  if (outcome.status === "failed")
    return createReasoningResultEnvelope({
      ...base,
      outcome: "failed",
      failureEvidence: outcome.failureEvidence,
    });
  if (outcome.status === "timed-out")
    return createReasoningResultEnvelope({
      ...base,
      outcome: "timed-out",
      timeoutEvidence: outcome.timeoutEvidence,
    });
  return createReasoningResultEnvelope({
    ...base,
    outcome: "cancelled",
    cancellationEvidence: outcome.cancellationEvidence,
  });
}
function terminalEvidenceFingerprint(outcome: ReasoningProviderOutcome): {
  readonly failureEvidenceFingerprint?: string;
  readonly timeoutEvidenceFingerprint?: string;
  readonly cancellationEvidenceFingerprint?: string;
} {
  if (outcome.status === "failed")
    return { failureEvidenceFingerprint: outcome.failureEvidence.failureFingerprint };
  if (outcome.status === "timed-out")
    return { timeoutEvidenceFingerprint: outcome.timeoutEvidence.timeoutFingerprint };
  if (outcome.status === "cancelled")
    return {
      cancellationEvidenceFingerprint: outcome.cancellationEvidence.cancellationFingerprint,
    };
  return {};
}
