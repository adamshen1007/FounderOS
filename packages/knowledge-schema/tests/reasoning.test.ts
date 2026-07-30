import { describe, expect, it } from "vitest";

import {
  FinalizedReasoningConsumptionEvidenceSchema,
  ProviderNeutralReasoningInputSchema,
  ReasoningArtifactVerificationResultSchema,
  ReasoningCanonicalTextSchema,
  ReasoningCancellationEvidenceSchema,
  ReasoningCostEvidenceSchema,
  ReasoningExecutionAttemptSchema,
  ReasoningExecutionPolicySchema,
  ReasoningFailureEvidenceSchema,
  ReasoningInvocationRequestSchema,
  ReasoningProviderCapabilityDescriptorSchema,
  ReasoningProviderCompatibilityResultSchema,
  ReasoningProviderOutcomeSchema,
  ReasoningResultEnvelopeSchema,
  ReasoningTimeoutEvidenceSchema,
  ReasoningUsageEvidenceSchema,
  ReasoningVerificationIssueSchema,
} from "../src/index.js";

const digest = "a".repeat(64);
const timestamp = "2026-07-29T01:00:00.000Z";

function reasoningInput() {
  return {
    schemaVersion: "1.0" as const,
    contentType: "provider-neutral-instruction-blocks-v1" as const,
    instructionBlocks: [
      {
        schemaVersion: "1.0" as const,
        blockId: "context-reference",
        blockType: "context-reference" as const,
        contentType: "canonical-text" as const,
        text: "Use only the governed Context Package referenced by this Invocation.",
        priority: 0,
        sourceClassification: "delivered-context" as const,
        blockFingerprint: digest,
      },
      {
        schemaVersion: "1.0" as const,
        blockId: "task-instruction",
        blockType: "task-instruction" as const,
        contentType: "canonical-text" as const,
        text: "Produce a concise governed evaluation.",
        priority: 1,
        sourceClassification: "request-author" as const,
        blockFingerprint: digest,
      },
    ],
    contextReference: {
      contextPackageId: "context-package",
      contextPackageFingerprint: digest,
      deliveryEnvelopeId: "delivery-envelope",
      deliveryEnvelopeFingerprint: digest,
    },
    outputRequirements: {
      contentType: "canonical-text" as const,
      maxCharacters: 2_000,
      requireNonEmpty: true,
    },
    constraintBlocks: [],
    inputFingerprint: digest,
  };
}

function executionPolicy() {
  return {
    schemaVersion: "1.0" as const,
    maxInputCharacters: 10_000,
    maxOutputCharacters: 2_000,
    timeoutMilliseconds: 5_000,
    cancellationMode: "cooperative-cancellation" as const,
    retryMode: "retry-deterministic-transient-failure" as const,
    maxAttemptCount: 2,
    deterministicModeRequired: true,
    usageEvidenceRequired: true,
    costEvidenceRequired: true,
    failureEvidenceRequired: true,
    resultPersistenceRequired: true,
    evaluatedAt: timestamp,
    policyFingerprint: digest,
  };
}

function capabilityRequirements() {
  return {
    schemaVersion: "1.0" as const,
    acceptedProviderClasses: ["deterministic-fake-provider" as const],
    requiredInputContentTypes: ["provider-neutral-instruction-blocks-v1" as const],
    requiredOutputContentType: "canonical-text" as const,
    deterministicModeRequired: true,
    usageEvidenceRequired: true,
    costEvidenceRequired: true,
    failureEvidenceRequired: true,
    resultEnvelopeVersion: "1.0" as const,
    requirementsFingerprint: digest,
  };
}

function invocationRequest() {
  return {
    schemaVersion: "1.0" as const,
    invocationRequestId: "invocation-one",
    deliveryTransactionId: "delivery-transaction-one",
    deliveryEnvelopeVersion: "1.0" as const,
    deliveryEnvelopeId: "delivery-envelope",
    deliveryEnvelopeFingerprint: digest,
    deliveryReceiptId: "delivery-receipt",
    deliveryReceiptFingerprint: digest,
    contextPackageId: "context-package",
    contextPackageFingerprint: digest,
    activeSnapshotBinding: {
      activeSnapshotId: "snapshot-one",
      activeContentFingerprint: digest,
      activeManifestFingerprint: digest,
      sourceManifestReference: "knowledge/migration-manifest",
      repositorySnapshotId: "snapshot-one",
      repositoryContentFingerprint: digest,
    },
    registryIntegrityBinding: {
      registrySchemaVersion: "1.0" as const,
      integrityFingerprint: digest,
      verifiedRecordCount: 3,
      verifiedThroughSequence: 3,
      recoveredActiveSnapshotId: "snapshot-one",
    },
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: digest,
    policyDecisionFingerprint: digest,
    purpose: "Evaluate the delivered Context Package",
    capabilityRequirements: capabilityRequirements(),
    reasoningInput: reasoningInput(),
    executionPolicy: executionPolicy(),
    idempotencyKey: "reasoning:key:0001",
    requestActor: { actorId: "evaluation-runner", actorType: "service" as const },
    reason: "Verify provider-neutral reasoning contracts",
    requestedAt: timestamp,
    requestFingerprint: digest,
  };
}

function capabilityDescriptor() {
  return {
    schemaVersion: "1.0" as const,
    providerCapabilityId: "deterministic-evaluation-provider",
    providerClass: "deterministic-fake-provider" as const,
    acceptedInvocationRequestVersions: ["1.0" as const],
    acceptedDeliveryEnvelopeVersions: ["1.0" as const],
    acceptedInputContentTypes: ["provider-neutral-instruction-blocks-v1" as const],
    acceptedOutputContentTypes: ["canonical-json" as const, "canonical-text" as const],
    maxInputCharacters: 20_000,
    maxOutputCharacters: 4_000,
    minTimeoutMilliseconds: 100,
    maxTimeoutMilliseconds: 10_000,
    supportedCancellationModes: ["cooperative-cancellation" as const, "not-cancellable" as const],
    supportedRetryModes: ["no-retry" as const, "retry-deterministic-transient-failure" as const],
    supportsDeterministicExecution: true,
    supportsUsageEvidence: true,
    supportsCostEvidence: true,
    supportsFailureEvidence: true,
    supportedResultEnvelopeVersions: ["1.0" as const],
    descriptorFingerprint: digest,
  };
}

function executionAttempt() {
  return {
    schemaVersion: "1.0" as const,
    executionAttemptId: "attempt-one",
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    invocationIdempotencyKey: "reasoning:key:0001",
    providerCapabilityId: "deterministic-evaluation-provider",
    providerCapabilityFingerprint: digest,
    executionPolicyFingerprint: digest,
    attemptNumber: 1,
    startedAt: timestamp,
    deadlineAt: "2026-07-29T01:00:05.000Z",
    cancellationState: "not-requested" as const,
    attemptFingerprint: digest,
  };
}

function usageEvidence() {
  return {
    schemaVersion: "1.0" as const,
    executionAttemptId: "attempt-one",
    inputCharacterCount: 400,
    outputCharacterCount: 20,
    instructionBlockCount: 2,
    contextPackageObjectCount: 3,
    attemptNumber: 1,
    durationMilliseconds: 100,
    usageFingerprint: digest,
  };
}

function costEvidence() {
  return {
    schemaVersion: "1.0" as const,
    executionAttemptId: "attempt-one",
    status: "not-applicable" as const,
    costFingerprint: digest,
  };
}

function successResult() {
  return {
    schemaVersion: "1.0" as const,
    resultEnvelopeId: "result-one",
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    invocationIdempotencyKey: "reasoning:key:0001",
    deliveryTransactionId: "delivery-transaction-one",
    deliveryEnvelopeId: "delivery-envelope",
    deliveryEnvelopeFingerprint: digest,
    deliveryReceiptId: "delivery-receipt",
    deliveryReceiptFingerprint: digest,
    contextPackageId: "context-package",
    contextPackageFingerprint: digest,
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: digest,
    providerCapabilityId: "deterministic-evaluation-provider",
    providerCapabilityFingerprint: digest,
    executionPolicyFingerprint: digest,
    executionAttemptId: "attempt-one",
    attemptNumber: 1,
    outcome: "succeeded" as const,
    outputContent: { contentType: "canonical-text" as const, text: "Governed evaluation." },
    outputCharacterCount: 20,
    outputContentFingerprint: digest,
    executionReceipt: {
      schemaVersion: "1.0" as const,
      executionAttemptId: "attempt-one",
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      providerCapabilityId: "deterministic-evaluation-provider",
      providerCapabilityFingerprint: digest,
      attemptNumber: 1,
      startedAt: timestamp,
      completedAt: "2026-07-29T01:00:00.100Z",
      outcome: "succeeded" as const,
      receiptFingerprint: digest,
    },
    usageEvidence: usageEvidence(),
    costEvidence: costEvidence(),
    completedAt: "2026-07-29T01:00:00.100Z",
    resultEnvelopeFingerprint: digest,
  };
}

function failureResult() {
  const success = successResult();
  const { outputCharacterCount, outputContent, outputContentFingerprint, ...base } = success;
  void outputCharacterCount;
  void outputContent;
  void outputContentFingerprint;
  return {
    ...base,
    outcome: "failed" as const,
    executionReceipt: { ...base.executionReceipt, outcome: "failed" as const },
    failureEvidence: {
      schemaVersion: "1.0" as const,
      executionAttemptId: "attempt-one",
      invocationRequestId: "invocation-one",
      failureCategory: "permanent-provider-failure" as const,
      reasonCodes: ["permanent_provider_failure" as const],
      retryable: false,
      sanitizedDetail: "Deterministic permanent failure fixture",
      attemptNumber: 1,
      failureFingerprint: digest,
    },
  };
}

describe("Milestone 13 provider-neutral Reasoning contracts", () => {
  it("accepts the strict canonical Input, Policy, Capability, and Invocation shapes", () => {
    expect(ProviderNeutralReasoningInputSchema.parse(reasoningInput())).toEqual(reasoningInput());
    expect(ReasoningExecutionPolicySchema.parse(executionPolicy())).toEqual(executionPolicy());
    expect(ReasoningProviderCapabilityDescriptorSchema.parse(capabilityDescriptor())).toEqual(
      capabilityDescriptor(),
    );
    expect(ReasoningInvocationRequestSchema.parse(invocationRequest())).toEqual(
      invocationRequest(),
    );
  });

  it("rejects unsupported versions, unknown fields, explicit undefined, and unsorted blocks", () => {
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({ ...reasoningInput(), schemaVersion: "2.0" })
        .success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({ ...reasoningInput(), model: "production" })
        .success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...reasoningInput(),
        evaluationMetadata: undefined,
      }).success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...reasoningInput(),
        instructionBlocks: [...reasoningInput().instructionBlocks].reverse(),
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationRequestSchema.safeParse({
        ...invocationRequest(),
        invocationRequestId: " invocation-one ",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate governed arrays and missing structural Instruction Blocks", () => {
    const input = reasoningInput();
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...input,
        instructionBlocks: [input.instructionBlocks[0], input.instructionBlocks[0]],
      }).success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...input,
        instructionBlocks: [input.instructionBlocks[1]],
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderCapabilityDescriptorSchema.safeParse({
        ...capabilityDescriptor(),
        acceptedInvocationRequestVersions: ["1.0", "1.0"],
      }).success,
    ).toBe(false);
  });

  it("rejects noncanonical text, physical paths, and credential-like material", () => {
    const input = reasoningInput();
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...input,
        instructionBlocks: [
          input.instructionBlocks[0],
          { ...input.instructionBlocks[1], text: "Use /Users/example/private/data" },
        ],
      }).success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...input,
        instructionBlocks: [
          input.instructionBlocks[0],
          { ...input.instructionBlocks[1], text: "api_key=super-secret-value" },
        ],
      }).success,
    ).toBe(false);
    expect(
      ProviderNeutralReasoningInputSchema.safeParse({
        ...input,
        instructionBlocks: [
          input.instructionBlocks[0],
          { ...input.instructionBlocks[1], text: "noncanonical\r\ntext" },
        ],
      }).success,
    ).toBe(false);
    for (const unsafeText of [
      "Inspect (/Users/example/private/data).",
      "Inspect /srv/founderos/runtime.",
      "Inspect /usr/local/bin/runtime.",
      "Inspect /workspace/private/data.",
      "Inspect C:\\private\\runtime.",
      "Inspect C:/private/runtime.",
      "Inspect \\\\server\\share\\runtime.",
      "Inspect file:///private/runtime.",
    ]) {
      expect(ReasoningCanonicalTextSchema.safeParse(unsafeText).success).toBe(false);
    }
    expect(
      ReasoningCanonicalTextSchema.safeParse("Compare revenue/cost ratios using logical evidence.")
        .success,
    ).toBe(true);
  });

  it("rejects accessor-backed artifacts without executing accessors", () => {
    let accessed = false;
    const raw = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(raw, "schemaVersion", {
      enumerable: true,
      get() {
        accessed = true;
        return "1.0";
      },
    });
    expect(ReasoningInvocationRequestSchema.safeParse(raw).success).toBe(false);
    expect(accessed).toBe(false);
  });

  it.each([
    ["no-retry with two Attempts", { retryMode: "no-retry", maxAttemptCount: 2 }],
    ["retry with one Attempt", { retryMode: "retry-until-attempt-limit", maxAttemptCount: 1 }],
    [
      "deterministic retry without deterministic execution",
      { retryMode: "retry-deterministic-transient-failure", deterministicModeRequired: false },
    ],
    ["unpersisted Result", { resultPersistenceRequired: false }],
  ])("rejects contradictory Execution Policy: %s", (_name, mutation) => {
    expect(
      ReasoningExecutionPolicySchema.safeParse({ ...executionPolicy(), ...mutation }).success,
    ).toBe(false);
  });

  it("accepts every stable Policy mode in a consistent shape", () => {
    expect(
      ReasoningExecutionPolicySchema.safeParse({
        ...executionPolicy(),
        cancellationMode: "not-cancellable",
        retryMode: "no-retry",
        maxAttemptCount: 1,
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionPolicySchema.safeParse({
        ...executionPolicy(),
        cancellationMode: "cancel-before-execution",
        retryMode: "retry-until-attempt-limit",
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionPolicySchema.safeParse({
        ...executionPolicy(),
        cancellationMode: "deadline-cancellation",
        retryMode: "evaluation-only-retry",
      }).success,
    ).toBe(true);
  });

  it("rejects contradictory Provider Capability limits and deterministic claims", () => {
    expect(
      ReasoningProviderCapabilityDescriptorSchema.safeParse({
        ...capabilityDescriptor(),
        minTimeoutMilliseconds: 20_000,
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderCapabilityDescriptorSchema.safeParse({
        ...capabilityDescriptor(),
        supportsDeterministicExecution: false,
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderCapabilityDescriptorSchema.safeParse({
        ...capabilityDescriptor(),
        supportedRetryModes: ["evaluation-only-retry", "no-retry"],
        supportsDeterministicExecution: false,
      }).success,
    ).toBe(false);
  });

  it("requires exact Request Input, Policy, and Capability-requirement bindings", () => {
    expect(
      ReasoningInvocationRequestSchema.safeParse({
        ...invocationRequest(),
        contextPackageFingerprint: "b".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationRequestSchema.safeParse({
        ...invocationRequest(),
        capabilityRequirements: {
          ...capabilityRequirements(),
          costEvidenceRequired: false,
        },
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationRequestSchema.safeParse({
        ...invocationRequest(),
        providerConfig: { endpoint: "https://provider.example" },
      }).success,
    ).toBe(false);
  });

  it("enforces stable compatibility status, ordered reasons, and mismatch evidence", () => {
    const compatible = {
      schemaVersion: "1.0",
      status: "compatible",
      reasonCodes: ["compatible"],
      mismatchedFields: [],
      invocationRequestFingerprint: digest,
      reasoningInputFingerprint: digest,
      executionPolicyFingerprint: digest,
      providerCapabilityFingerprint: digest,
      compatibilityFingerprint: digest,
    };
    expect(ReasoningProviderCompatibilityResultSchema.safeParse(compatible).success).toBe(true);
    expect(
      ReasoningProviderCompatibilityResultSchema.safeParse({
        ...compatible,
        status: "incompatible",
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderCompatibilityResultSchema.safeParse({
        ...compatible,
        status: "incompatible",
        reasonCodes: ["timeout_out_of_range", "input_budget_exceeded"],
        mismatchedFields: ["timeoutMilliseconds", "inputCharacters"],
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderCompatibilityResultSchema.safeParse({
        ...compatible,
        status: "incompatible",
        reasonCodes: ["input_budget_exceeded", "timeout_out_of_range"],
        mismatchedFields: ["inputCharacters", "timeoutMilliseconds"],
      }).success,
    ).toBe(true);
    expect(
      ReasoningProviderCompatibilityResultSchema.safeParse({
        ...compatible,
        status: "incompatible",
        reasonCodes: ["input_budget_exceeded"],
        mismatchedFields: ["timeoutMilliseconds"],
      }).success,
    ).toBe(false);
  });

  it("enforces first and later immutable Attempt structure", () => {
    expect(ReasoningExecutionAttemptSchema.parse(executionAttempt())).toEqual(executionAttempt());
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        previousExecutionAttemptId: "attempt-zero",
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        executionAttemptId: "attempt-two",
        attemptNumber: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        deadlineAt: timestamp,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        cancellationState: "requested-cooperatively",
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        cancellationState: "requested-cooperatively",
        cancellationAuthorityReference: "authority/schema-cancellation",
        cancellationRequestedAt: "2026-07-29T01:00:00.010Z",
        cancellationObservedAt: "2026-07-29T01:00:00.050Z",
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionAttemptSchema.safeParse({
        ...executionAttempt(),
        cancellationAuthorityReference: "authority/unrequested-cancellation",
        cancellationRequestedAt: "2026-07-29T01:00:00.010Z",
        cancellationObservedAt: "2026-07-29T01:00:00.050Z",
      }).success,
    ).toBe(false);
  });

  it("accepts strict usage and cost evidence and rejects forged combinations", () => {
    expect(ReasoningUsageEvidenceSchema.parse(usageEvidence())).toEqual(usageEvidence());
    expect(ReasoningCostEvidenceSchema.parse(costEvidence())).toEqual(costEvidence());
    expect(
      ReasoningUsageEvidenceSchema.safeParse({
        ...usageEvidence(),
        estimatedInputUnits: 100,
      }).success,
    ).toBe(false);
    expect(
      ReasoningCostEvidenceSchema.safeParse({
        ...costEvidence(),
        currencyCode: "USD",
        amountMinorUnits: 0,
      }).success,
    ).toBe(false);
  });

  it("validates stable Failure, Timeout, and Cancellation evidence semantics", () => {
    const failure = {
      schemaVersion: "1.0",
      executionAttemptId: "attempt-one",
      invocationRequestId: "invocation-one",
      failureCategory: "transient-provider-failure",
      reasonCodes: ["transient_provider_failure"],
      retryable: true,
      sanitizedDetail: "Deterministic transient failure fixture",
      attemptNumber: 1,
      failureFingerprint: digest,
    };
    const timeout = {
      schemaVersion: "1.0",
      executionAttemptId: "attempt-one",
      invocationRequestId: "invocation-one",
      configuredTimeoutMilliseconds: 5_000,
      attemptStartedAt: timestamp,
      deadlineAt: "2026-07-29T01:00:05.000Z",
      elapsedMilliseconds: 5_000,
      timeoutPhase: "during-execution",
      reasonCode: "execution_timeout",
      timeoutFingerprint: digest,
    };
    const cancellation = {
      schemaVersion: "1.0",
      invocationRequestId: "invocation-one",
      executionAttemptId: "attempt-one",
      cancellationMode: "cooperative-cancellation",
      cancellationPhase: "cooperative-execution",
      cancellationAuthorityReference: "governance/cancellation/evaluation",
      requestedAt: timestamp,
      observedAt: timestamp,
      reasonCode: "cancelled_cooperatively",
      cancellationFingerprint: digest,
    };
    expect(ReasoningFailureEvidenceSchema.safeParse(failure).success).toBe(true);
    expect(ReasoningTimeoutEvidenceSchema.safeParse(timeout).success).toBe(true);
    expect(ReasoningCancellationEvidenceSchema.safeParse(cancellation).success).toBe(true);
    expect(ReasoningFailureEvidenceSchema.safeParse({ ...failure, retryable: false }).success).toBe(
      false,
    );
    expect(
      ReasoningFailureEvidenceSchema.safeParse({
        ...failure,
        failureCategory: "permanent-provider-failure",
        retryable: false,
      }).success,
    ).toBe(false);
    expect(
      ReasoningTimeoutEvidenceSchema.safeParse({ ...timeout, elapsedMilliseconds: 4_999 }).success,
    ).toBe(false);
    expect(
      ReasoningCancellationEvidenceSchema.safeParse({
        ...cancellation,
        cancellationPhase: "deadline",
      }).success,
    ).toBe(false);
  });

  it("uses discriminated Provider Outcomes to reject contradictory structures", () => {
    const outcome = {
      schemaVersion: "1.0",
      executionAttemptId: "attempt-one",
      invocationRequestId: "invocation-one",
      attemptNumber: 1,
      completedAt: "2026-07-29T01:00:00.100Z",
      status: "succeeded",
      outputContent: { contentType: "canonical-text", text: "Governed evaluation." },
      outputCharacterCount: 20,
      outputContentFingerprint: digest,
      outcomeFingerprint: digest,
    };
    expect(ReasoningProviderOutcomeSchema.safeParse(outcome).success).toBe(true);
    expect(ReasoningProviderOutcomeSchema.safeParse({ ...outcome, status: "failed" }).success).toBe(
      false,
    );
    expect(
      ReasoningProviderOutcomeSchema.safeParse({
        schemaVersion: "1.0",
        executionAttemptId: "attempt-one",
        invocationRequestId: "invocation-one",
        attemptNumber: 1,
        completedAt: "2026-07-29T01:00:00.100Z",
        status: "failed",
        failureEvidence: {
          schemaVersion: "1.0",
          executionAttemptId: "attempt-two",
          invocationRequestId: "invocation-one",
          failureCategory: "transient-provider-failure",
          reasonCodes: ["transient_provider_failure"],
          retryable: true,
          sanitizedDetail: "Deterministic transient failure fixture",
          attemptNumber: 1,
          failureFingerprint: digest,
        },
        outcomeFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      ReasoningProviderOutcomeSchema.safeParse({
        ...outcome,
        outputContent: {
          contentType: "canonical-json",
          value: { nested: "password=exposed-value" },
        },
      }).success,
    ).toBe(false);
    for (const credentialKey of ["apiKey", "api_key", "api-key", "Api_kEy"]) {
      expect(
        ReasoningProviderOutcomeSchema.safeParse({
          ...outcome,
          outputContent: {
            contentType: "canonical-json",
            value: { nested: { [credentialKey]: "fixture-secret-value" } },
          },
        }).success,
      ).toBe(false);
    }
    for (const credentialValue of [
      "sk_live_0123456789",
      "ghp_0123456789abcdef",
      "xoxb-0123456789-secret",
      "-----BEGIN PRIVATE KEY-----",
    ]) {
      expect(
        ReasoningProviderOutcomeSchema.safeParse({
          ...outcome,
          outputContent: {
            contentType: "canonical-json",
            value: { nested: { opaqueValue: credentialValue } },
          },
        }).success,
      ).toBe(false);
    }
  });

  it("accepts exact success Results and rejects outcome or binding contradictions", () => {
    expect(ReasoningResultEnvelopeSchema.parse(successResult())).toEqual(successResult());
    expect(ReasoningResultEnvelopeSchema.parse(failureResult())).toEqual(failureResult());
    expect(
      ReasoningResultEnvelopeSchema.safeParse({
        ...successResult(),
        failureEvidence: {
          schemaVersion: "1.0",
          executionAttemptId: "attempt-one",
        },
      }).success,
    ).toBe(false);
    expect(
      ReasoningResultEnvelopeSchema.safeParse({
        ...successResult(),
        executionReceipt: { ...successResult().executionReceipt, outcome: "failed" },
      }).success,
    ).toBe(false);
    expect(
      ReasoningResultEnvelopeSchema.safeParse({
        ...successResult(),
        usageEvidence: { ...usageEvidence(), executionAttemptId: "attempt-two" },
      }).success,
    ).toBe(false);
    expect(
      ReasoningResultEnvelopeSchema.safeParse({
        ...failureResult(),
        failureEvidence: { ...failureResult().failureEvidence, attemptNumber: 2 },
      }).success,
    ).toBe(false);
  });

  it("accepts canonical finalized Consumption evidence and enforces final Attempt binding", () => {
    const consumption = {
      schemaVersion: "1.0",
      consumptionId: "consumption-one",
      deliveryReceiptId: "delivery-receipt",
      deliveryReceiptFingerprint: digest,
      deliveryTransactionId: "delivery-transaction-one",
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      invocationIdempotencyKey: "reasoning:key:0001",
      providerCapabilityId: "deterministic-evaluation-provider",
      providerCapabilityFingerprint: digest,
      finalResultEnvelopeId: "result-one",
      finalResultEnvelopeFingerprint: digest,
      finalOutcome: "succeeded",
      attemptHistorySummary: {
        attemptCount: 1,
        finalAttemptNumber: 1,
        finalOutcome: "succeeded",
        attempts: [
          {
            executionAttemptId: "attempt-one",
            attemptNumber: 1,
            outcome: "succeeded",
            attemptFingerprint: digest,
            outcomeFingerprint: digest,
          },
        ],
        historyFingerprint: digest,
      },
      startedAt: timestamp,
      completedAt: "2026-07-29T01:00:00.100Z",
      usageEvidenceFingerprint: digest,
      costEvidenceFingerprint: digest,
      executionLedgerTransactionId: "finalization-one",
      consumptionFingerprint: digest,
    };
    expect(FinalizedReasoningConsumptionEvidenceSchema.safeParse(consumption).success).toBe(true);
    expect(
      FinalizedReasoningConsumptionEvidenceSchema.safeParse({
        ...consumption,
        finalOutcome: "failed",
      }).success,
    ).toBe(false);
    expect(
      FinalizedReasoningConsumptionEvidenceSchema.safeParse({
        ...consumption,
        attemptHistorySummary: {
          ...consumption.attemptHistorySummary,
          attemptCount: 2,
        },
      }).success,
    ).toBe(false);
  });

  it("enforces canonical verification result status and sorted issues", () => {
    expect(
      ReasoningArtifactVerificationResultSchema.safeParse({
        schemaVersion: "1.0",
        artifactType: "result-envelope",
        status: "valid",
        fingerprint: digest,
        issues: [],
      }).success,
    ).toBe(true);
    expect(
      ReasoningArtifactVerificationResultSchema.safeParse({
        schemaVersion: "1.0",
        artifactType: "result-envelope",
        status: "invalid",
        fingerprint: digest,
        issues: [],
      }).success,
    ).toBe(false);
  });

  it("rejects accessor-backed exported Verification Issues without executing accessors", () => {
    let accessed = false;
    const raw = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(raw, "code", {
      enumerable: true,
      get() {
        accessed = true;
        return "invalid_artifact";
      },
    });
    expect(ReasoningVerificationIssueSchema.safeParse(raw).success).toBe(false);
    expect(accessed).toBe(false);
  });
});
