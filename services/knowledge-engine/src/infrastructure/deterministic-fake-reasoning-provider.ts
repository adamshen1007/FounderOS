import {
  ReasoningExecutionAttemptSchema,
  ReasoningInvocationRequestSchema,
  ReasoningProviderCapabilityDescriptorSchema,
  ReasoningProviderCompatibilityResultSchema,
} from "@founderos/knowledge-schema";

import type {
  ProviderNeutralReasoningExecutionPort,
  ReasoningExecutionPortInput,
} from "../application/reasoning-execution-port.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import {
  createReasoningCancellationEvidence,
  createReasoningFailureEvidence,
  createReasoningProviderCapabilityDescriptor,
  createReasoningProviderOutcome,
  createReasoningTimeoutEvidence,
  countOutputCharacters,
  verifyReasoningExecutionAttempt,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderCapabilityDescriptor,
  verifyReasoningProviderCompatibilityResult,
} from "../domain/reasoning.js";

export const DETERMINISTIC_FAKE_REASONING_CAPABILITY_ID =
  "founderos-deterministic-fake-reasoning-v1";

export function createDeterministicFakeReasoningProvider(): ProviderNeutralReasoningExecutionPort {
  const providerCapability = createReasoningProviderCapabilityDescriptor({
    schemaVersion: "1.0",
    providerCapabilityId: DETERMINISTIC_FAKE_REASONING_CAPABILITY_ID,
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
  });

  return Object.freeze({
    providerCapability,
    async execute(input: ReasoningExecutionPortInput): Promise<unknown> {
      const request = ReasoningInvocationRequestSchema.parse(input.invocationRequest);
      const provider = ReasoningProviderCapabilityDescriptorSchema.parse(input.providerCapability);
      const compatibility = ReasoningProviderCompatibilityResultSchema.parse(input.compatibility);
      const attempt = ReasoningExecutionAttemptSchema.parse(input.attempt);
      if (
        verifyReasoningInvocationRequest(request).status !== "valid" ||
        verifyReasoningProviderCapabilityDescriptor(provider).status !== "valid" ||
        verifyReasoningExecutionAttempt(attempt).status !== "valid" ||
        verifyReasoningProviderCompatibilityResult({
          compatibility,
          invocationRequest: request,
          providerCapability: provider,
        }).status !== "valid" ||
        compatibility.status !== "compatible" ||
        provider.descriptorFingerprint !== providerCapability.descriptorFingerprint ||
        provider.providerCapabilityId !== providerCapability.providerCapabilityId ||
        input.evaluationTime !== request.requestedAt
      ) {
        throw new Error("Deterministic fake provider rejected unverified governed input");
      }

      const base = {
        schemaVersion: "1.0" as const,
        executionAttemptId: attempt.executionAttemptId,
        invocationRequestId: request.invocationRequestId,
        attemptNumber: attempt.attemptNumber,
        completedAt: input.completedAt,
      };
      const success = (empty = false) => {
        const outputContent =
          request.reasoningInput.outputRequirements.contentType === "canonical-json"
            ? {
                contentType: "canonical-json" as const,
                value: empty
                  ? null
                  : {
                      attemptNumber: attempt.attemptNumber,
                      contextPackageFingerprint: request.contextPackageFingerprint,
                      fixtureMode: input.fixtureMode,
                      instructionFingerprints: request.reasoningInput.instructionBlocks.map(
                        (block) => block.blockFingerprint,
                      ),
                      invocationRequestFingerprint: request.requestFingerprint,
                    },
              }
            : {
                contentType: "canonical-text" as const,
                text: empty
                  ? ""
                  : `governed-result:${request.requestFingerprint}:${request.contextPackageFingerprint}:attempt-${attempt.attemptNumber}`,
              };
        return createReasoningProviderOutcome({
          ...base,
          status: "succeeded",
          outputContent,
          outputCharacterCount: countOutputCharacters(outputContent),
          outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(outputContent),
        });
      };
      const failure = (transient: boolean) => {
        const evidence = createReasoningFailureEvidence({
          schemaVersion: "1.0",
          executionAttemptId: attempt.executionAttemptId,
          invocationRequestId: request.invocationRequestId,
          failureCategory: transient ? "transient-provider-failure" : "permanent-provider-failure",
          reasonCodes: [transient ? "transient_provider_failure" : "permanent_provider_failure"],
          retryable: transient,
          sanitizedDetail: transient
            ? "Deterministic transient failure fixture"
            : "Deterministic permanent failure fixture",
          attemptNumber: attempt.attemptNumber,
        });
        return createReasoningProviderOutcome({
          ...base,
          status: "failed",
          failureEvidence: evidence,
        });
      };

      switch (input.fixtureMode) {
        case "successful-structured-response":
          return success();
        case "successful-empty-response":
          return success(true);
        case "deterministic-transient-failure":
          return failure(true);
        case "transient-failure-then-success":
          return attempt.attemptNumber === 1 ? failure(true) : success();
        case "deterministic-permanent-failure":
          return failure(false);
        case "timeout": {
          const deadlineAt = attempt.deadlineAt;
          if (deadlineAt === undefined) throw new Error("Timeout fixture requires a deadline");
          const evidence = createReasoningTimeoutEvidence({
            schemaVersion: "1.0",
            executionAttemptId: attempt.executionAttemptId,
            invocationRequestId: request.invocationRequestId,
            configuredTimeoutMilliseconds: request.executionPolicy.timeoutMilliseconds,
            attemptStartedAt: attempt.startedAt,
            deadlineAt,
            elapsedMilliseconds: Date.parse(input.completedAt) - Date.parse(attempt.startedAt),
            timeoutPhase: "during-execution",
            reasonCode: "execution_timeout",
          });
          return createReasoningProviderOutcome({
            ...base,
            status: "timed-out",
            timeoutEvidence: evidence,
          });
        }
        case "cooperative-cancellation": {
          const signal = input.cancellationSignal;
          if (
            signal.state !== "requested-cooperatively" ||
            request.executionPolicy.cancellationMode !== "cooperative-cancellation"
          )
            throw new Error("Cooperative cancellation fixture requires a matching signal");
          const evidence = createReasoningCancellationEvidence({
            schemaVersion: "1.0",
            invocationRequestId: request.invocationRequestId,
            executionAttemptId: attempt.executionAttemptId,
            cancellationMode: "cooperative-cancellation",
            cancellationPhase: "cooperative-execution",
            cancellationAuthorityReference: signal.authorityReference,
            requestedAt: signal.requestedAt,
            observedAt: signal.observedAt,
            reasonCode: "cancelled_cooperatively",
          });
          return createReasoningProviderOutcome({
            ...base,
            status: "cancelled",
            cancellationEvidence: evidence,
          });
        }
        case "cancellation-before-execution":
        case "deadline-cancellation": {
          const before = input.fixtureMode === "cancellation-before-execution";
          const signal = input.cancellationSignal;
          const expectedState = before ? "requested-before-execution" : "requested-at-deadline";
          const expectedMode = before ? "cancel-before-execution" : "deadline-cancellation";
          if (
            signal.state !== expectedState ||
            request.executionPolicy.cancellationMode !== expectedMode
          )
            throw new Error("Cancellation fixture requires a matching explicit signal");
          const evidence = createReasoningCancellationEvidence({
            schemaVersion: "1.0",
            invocationRequestId: request.invocationRequestId,
            executionAttemptId: attempt.executionAttemptId,
            cancellationMode: expectedMode,
            cancellationPhase: before ? "before-execution" : "deadline",
            cancellationAuthorityReference: signal.authorityReference,
            requestedAt: signal.requestedAt,
            observedAt: signal.observedAt,
            reasonCode: before ? "cancelled_before_execution" : "cancelled_at_deadline",
          });
          return createReasoningProviderOutcome({
            ...base,
            status: "cancelled",
            cancellationEvidence: evidence,
          });
        }
        case "output-budget-overflow": {
          const outputContent = {
            contentType: "canonical-text" as const,
            text: "x".repeat(request.executionPolicy.maxOutputCharacters + 1),
          };
          return createReasoningProviderOutcome({
            ...base,
            status: "succeeded",
            outputContent,
            outputCharacterCount: countOutputCharacters(outputContent),
            outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(outputContent),
          });
        }
        case "malformed-success-outcome":
          return {
            ...base,
            status: "succeeded",
            outputContent: { contentType: "canonical-text", text: "malformed" },
          };
        case "malformed-failure-outcome":
          return { ...base, status: "failed", failureEvidence: { retryable: "yes" } };
        case "contradictory-outcome":
          return { ...success(), status: "timed-out" };
        case "physical-path-bearing-outcome":
          return unsafeSuccess(base, "provider output at /private/runtime/secret.txt");
        case "credential-bearing-outcome":
          return unsafeSuccess(base, "api_key=fixture-secret-value");
      }
    },
  });
}

function unsafeSuccess(
  base: Readonly<{
    schemaVersion: "1.0";
    executionAttemptId: string;
    invocationRequestId: string;
    attemptNumber: number;
    completedAt: string;
  }>,
  text: string,
): unknown {
  const outputContent = { contentType: "canonical-text" as const, text };
  const unsigned = {
    ...base,
    status: "succeeded" as const,
    outputContent,
    outputCharacterCount: [...text].length,
    outputContentFingerprint: createDurableCanonicalJsonSha256Fingerprint(outputContent),
  };
  return {
    ...unsigned,
    outcomeFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned),
  };
}
