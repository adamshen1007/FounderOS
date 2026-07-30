import { describe, expect, it } from "vitest";

import {
  AppendReasoningExecutionAttemptRequestSchema,
  DurableReasoningExecutionAttemptRecordSchema,
  DurableReasoningExecutionDerivedIndexSchema,
  DurableReasoningProviderOutcomeRecordSchema,
  FinalizeReasoningInvocationRequestSchema,
  FinalizedReasoningInvocationTransactionSchema,
  ReasoningExecutionLedgerDerivedIndexRebuildResultSchema,
  ReasoningExecutionLedgerEventSchema,
  ReasoningExecutionLedgerHeadExpectationSchema,
  ReasoningExecutionLedgerIntegrityVerificationResultSchema,
  ReasoningExecutionLedgerIssueCodeSchema,
  ReasoningExecutionLedgerIssueSchema,
  ReasoningExecutionLedgerRecoveryResultSchema,
  ReasoningInvocationFinalizationResultSchema,
  ReasoningInvocationOwnershipRecordSchema,
  ReasoningInvocationOwnershipResolutionSchema,
} from "../src/index.js";

const digest = "a".repeat(64);
const timestamp = "2026-07-29T01:00:00.000Z";
const completedAt = "2026-07-29T01:00:00.100Z";

function attempt() {
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

function providerOutcome() {
  return {
    schemaVersion: "1.0" as const,
    executionAttemptId: "attempt-one",
    invocationRequestId: "invocation-one",
    attemptNumber: 1,
    completedAt,
    status: "succeeded" as const,
    outputContent: { contentType: "canonical-text" as const, text: "Governed evaluation." },
    outputCharacterCount: 20,
    outputContentFingerprint: digest,
    outcomeFingerprint: digest,
  };
}

function ownership() {
  return {
    schemaVersion: "1.0" as const,
    recordType: "invocation-ownership" as const,
    ownershipId: "ownership-one",
    invocationIdempotencyKey: "reasoning:key:0001",
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    ownershipStatus: "in-progress" as const,
    ownershipSequence: 1,
    createdAt: timestamp,
    ledgerSequence: 1,
    previousAuditFingerprint: "genesis" as const,
    committedAt: timestamp,
    ownershipFingerprint: digest,
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
      completedAt,
      outcome: "succeeded" as const,
      receiptFingerprint: digest,
    },
    usageEvidence: {
      schemaVersion: "1.0" as const,
      executionAttemptId: "attempt-one",
      inputCharacterCount: 400,
      outputCharacterCount: 20,
      instructionBlockCount: 2,
      contextPackageObjectCount: 3,
      attemptNumber: 1,
      durationMilliseconds: 100,
      usageFingerprint: digest,
    },
    costEvidence: {
      schemaVersion: "1.0" as const,
      executionAttemptId: "attempt-one",
      status: "not-applicable" as const,
      costFingerprint: digest,
    },
    completedAt,
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

function consumption() {
  return {
    schemaVersion: "1.0" as const,
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
    finalOutcome: "succeeded" as const,
    attemptHistorySummary: {
      attemptCount: 1,
      finalAttemptNumber: 1,
      finalOutcome: "succeeded" as const,
      attempts: [
        {
          executionAttemptId: "attempt-one",
          attemptNumber: 1,
          outcome: "succeeded" as const,
          attemptFingerprint: digest,
          outcomeFingerprint: digest,
        },
      ],
      historyFingerprint: digest,
    },
    startedAt: timestamp,
    completedAt,
    usageEvidenceFingerprint: digest,
    costEvidenceFingerprint: digest,
    executionLedgerTransactionId: "finalization-one",
    consumptionFingerprint: digest,
  };
}

function failedConsumption() {
  return {
    ...consumption(),
    finalOutcome: "failed" as const,
    failureEvidenceFingerprint: digest,
    attemptHistorySummary: {
      ...consumption().attemptHistorySummary,
      finalOutcome: "failed" as const,
      attempts: [
        {
          ...consumption().attemptHistorySummary.attempts[0],
          outcome: "failed" as const,
        },
      ],
    },
  };
}

function finalization() {
  return {
    schemaVersion: "1.0" as const,
    recordType: "finalized-invocation-transaction" as const,
    transactionId: "finalization-one",
    ownershipId: "ownership-one",
    invocationIdempotencyKey: "reasoning:key:0001",
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    resultEnvelope: successResult(),
    consumptionEvidence: consumption(),
    ledgerSequence: 4,
    previousAuditFingerprint: digest,
    committedAt: completedAt,
    transactionFingerprint: digest,
  };
}

function finalizationRequest() {
  return {
    schemaVersion: "1.0" as const,
    expectedLedgerHead: { ledgerSequence: 3, auditFingerprint: digest },
    ownershipId: "ownership-one",
    expectedOwnershipStatus: "in-progress" as const,
    expectedAttemptCount: 1,
    transactionId: "finalization-one",
    resultEnvelope: successResult(),
    consumptionEvidence: consumption(),
    finalizedAt: completedAt,
  };
}

describe("Durable Reasoning Execution Evidence Ledger contracts", () => {
  it("accepts only coherent empty and non-empty expected heads", () => {
    expect(
      ReasoningExecutionLedgerHeadExpectationSchema.safeParse({
        ledgerSequence: 0,
        auditFingerprint: "genesis",
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionLedgerHeadExpectationSchema.safeParse({
        ledgerSequence: 1,
        auditFingerprint: "genesis",
      }).success,
    ).toBe(false);
  });

  it("accepts immutable Invocation ownership and rejects forged chain positions", () => {
    expect(ReasoningInvocationOwnershipRecordSchema.parse(ownership())).toEqual(ownership());
    expect(
      ReasoningInvocationOwnershipRecordSchema.safeParse({
        ...ownership(),
        ledgerSequence: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationOwnershipRecordSchema.safeParse({
        ...ownership(),
        ownershipStatus: "finalized",
      }).success,
    ).toBe(false);
  });

  it("binds durable Attempt and Provider Outcome wrappers to exact artifacts", () => {
    const attemptRecord = {
      schemaVersion: "1.0",
      recordType: "execution-attempt",
      invocationRequestId: "invocation-one",
      invocationRequestFingerprint: digest,
      invocationIdempotencyKey: "reasoning:key:0001",
      attempt: attempt(),
      ledgerSequence: 2,
      previousAuditFingerprint: digest,
      committedAt: timestamp,
      recordFingerprint: digest,
    };
    const outcomeRecord = {
      schemaVersion: "1.0",
      recordType: "provider-outcome",
      invocationRequestId: "invocation-one",
      executionAttemptId: "attempt-one",
      attemptNumber: 1,
      outcome: providerOutcome(),
      ledgerSequence: 3,
      previousAuditFingerprint: digest,
      committedAt: completedAt,
      recordFingerprint: digest,
    };
    expect(DurableReasoningExecutionAttemptRecordSchema.safeParse(attemptRecord).success).toBe(
      true,
    );
    expect(DurableReasoningProviderOutcomeRecordSchema.safeParse(outcomeRecord).success).toBe(true);
    expect(
      DurableReasoningExecutionAttemptRecordSchema.safeParse({
        ...attemptRecord,
        invocationRequestId: "invocation-two",
      }).success,
    ).toBe(false);
    expect(
      DurableReasoningProviderOutcomeRecordSchema.safeParse({
        ...outcomeRecord,
        attemptNumber: 2,
      }).success,
    ).toBe(false);
  });

  it("requires deterministic sequential Attempt append requests", () => {
    const request = {
      schemaVersion: "1.0",
      expectedLedgerHead: { ledgerSequence: 1, auditFingerprint: digest },
      ownershipId: "ownership-one",
      expectedOwnershipStatus: "in-progress",
      expectedPriorAttemptCount: 0,
      attempt: attempt(),
    };
    expect(AppendReasoningExecutionAttemptRequestSchema.safeParse(request).success).toBe(true);
    expect(
      AppendReasoningExecutionAttemptRequestSchema.safeParse({
        ...request,
        expectedPriorAttemptCount: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts an atomic finalization and rejects Result or Consumption substitution", () => {
    expect(FinalizedReasoningInvocationTransactionSchema.safeParse(finalization()).success).toBe(
      true,
    );
    expect(
      FinalizedReasoningInvocationTransactionSchema.safeParse({
        ...finalization(),
        consumptionEvidence: {
          ...consumption(),
          finalResultEnvelopeId: "result-two",
        },
      }).success,
    ).toBe(false);
    expect(
      FinalizedReasoningInvocationTransactionSchema.safeParse({
        ...finalization(),
        resultEnvelope: { ...successResult(), deliveryReceiptId: "receipt-two" },
      }).success,
    ).toBe(false);
  });

  it("binds every Finalization Request Result and Consumption coordinate", () => {
    const request = finalizationRequest();
    expect(FinalizeReasoningInvocationRequestSchema.safeParse(request).success).toBe(true);

    const mismatchedOutcomeConsumption = {
      ...consumption(),
      finalOutcome: "failed",
      failureEvidenceFingerprint: digest,
      attemptHistorySummary: {
        ...consumption().attemptHistorySummary,
        finalOutcome: "failed",
        attempts: [
          {
            ...consumption().attemptHistorySummary.attempts[0],
            outcome: "failed",
          },
        ],
      },
    };
    const mutations = [
      { consumptionEvidence: { ...consumption(), invocationRequestId: "invocation-two" } },
      {
        consumptionEvidence: {
          ...consumption(),
          invocationRequestFingerprint: "b".repeat(64),
        },
      },
      { consumptionEvidence: { ...consumption(), invocationIdempotencyKey: "reasoning:key:0002" } },
      { consumptionEvidence: { ...consumption(), finalResultEnvelopeId: "result-two" } },
      {
        consumptionEvidence: {
          ...consumption(),
          finalResultEnvelopeFingerprint: "b".repeat(64),
        },
      },
      { consumptionEvidence: mismatchedOutcomeConsumption },
      { consumptionEvidence: { ...consumption(), deliveryReceiptId: "delivery-receipt-two" } },
      {
        consumptionEvidence: {
          ...consumption(),
          deliveryReceiptFingerprint: "b".repeat(64),
        },
      },
      {
        consumptionEvidence: {
          ...consumption(),
          deliveryTransactionId: "delivery-transaction-two",
        },
      },
      {
        consumptionEvidence: {
          ...consumption(),
          providerCapabilityId: "deterministic-evaluation-provider-two",
        },
      },
      {
        consumptionEvidence: {
          ...consumption(),
          providerCapabilityFingerprint: "b".repeat(64),
        },
      },
      {
        consumptionEvidence: { ...consumption(), usageEvidenceFingerprint: "b".repeat(64) },
      },
      {
        consumptionEvidence: { ...consumption(), costEvidenceFingerprint: "b".repeat(64) },
      },
      {
        consumptionEvidence: {
          ...consumption(),
          attemptHistorySummary: {
            ...consumption().attemptHistorySummary,
            attempts: [
              {
                ...consumption().attemptHistorySummary.attempts[0],
                executionAttemptId: "attempt-two",
              },
            ],
          },
        },
      },
    ];
    for (const mutation of mutations) {
      expect(
        FinalizeReasoningInvocationRequestSchema.safeParse({ ...request, ...mutation }).success,
      ).toBe(false);
    }

    const failedRequest = {
      ...request,
      resultEnvelope: failureResult(),
      consumptionEvidence: failedConsumption(),
    };
    expect(FinalizeReasoningInvocationRequestSchema.safeParse(failedRequest).success).toBe(true);
    expect(
      FinalizeReasoningInvocationRequestSchema.safeParse({
        ...failedRequest,
        consumptionEvidence: {
          ...failedConsumption(),
          failureEvidenceFingerprint: "b".repeat(64),
        },
      }).success,
    ).toBe(false);
  });

  it("models ownership and finalization replay outcomes without reassignment", () => {
    expect(
      ReasoningInvocationOwnershipResolutionSchema.safeParse({
        schemaVersion: "1.0",
        status: "identical-in-progress",
        reasonCode: "invocation_already_in_progress",
        ownership: ownership(),
      }).success,
    ).toBe(true);
    expect(
      ReasoningInvocationOwnershipResolutionSchema.safeParse({
        schemaVersion: "1.0",
        status: "conflict",
        reasonCode: "invocation_already_in_progress",
        existingInvocationRequestId: "invocation-one",
        existingInvocationRequestFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationFinalizationResultSchema.safeParse({
        schemaVersion: "1.0",
        status: "identical-finalization",
        finalization: finalization(),
      }).success,
    ).toBe(true);
    const identicalFinalized = {
      schemaVersion: "1.0",
      status: "identical-finalized",
      reasonCode: "invocation_already_finalized",
      ownership: ownership(),
      finalization: finalization(),
    };
    expect(ReasoningInvocationOwnershipResolutionSchema.safeParse(identicalFinalized).success).toBe(
      true,
    );
    for (const ownershipMutation of [
      { ownershipId: "ownership-two" },
      { invocationIdempotencyKey: "reasoning:key:0002" },
      { invocationRequestId: "invocation-two" },
      { invocationRequestFingerprint: "b".repeat(64) },
    ]) {
      expect(
        ReasoningInvocationOwnershipResolutionSchema.safeParse({
          ...identicalFinalized,
          ownership: { ...ownership(), ...ownershipMutation },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects accessor-backed Ledger events without invoking accessors", () => {
    let accessed = false;
    const raw = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(raw, "eventType", {
      enumerable: true,
      get() {
        accessed = true;
        return "invocation-ownership";
      },
    });
    expect(ReasoningExecutionLedgerEventSchema.safeParse(raw).success).toBe(false);
    expect(accessed).toBe(false);
  });

  it("rejects accessor-backed exported heads and Ledger Issues without invoking accessors", () => {
    let headAccessed = false;
    const rawHead = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(rawHead, "ledgerSequence", {
      enumerable: true,
      get() {
        headAccessed = true;
        return 0;
      },
    });
    expect(ReasoningExecutionLedgerHeadExpectationSchema.safeParse(rawHead).success).toBe(false);
    expect(headAccessed).toBe(false);

    let issueAccessed = false;
    const rawIssue = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(rawIssue, "code", {
      enumerable: true,
      get() {
        issueAccessed = true;
        return "invalid_raw_record";
      },
    });
    expect(ReasoningExecutionLedgerIssueSchema.safeParse(rawIssue).success).toBe(false);
    expect(issueAccessed).toBe(false);
  });

  it("keeps exported Ledger Issue locations and messages path- and credential-private", () => {
    const issue = {
      code: "invalid_raw_record",
      logicalLocation: "reasoning-ledger/events/1",
      message: "The canonical event is invalid",
    };
    expect(ReasoningExecutionLedgerIssueSchema.safeParse(issue).success).toBe(true);
    expect(
      ReasoningExecutionLedgerIssueSchema.safeParse({
        ...issue,
        logicalLocation: "/srv/reasoning-ledger/event",
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerIssueSchema.safeParse({
        ...issue,
        message: "api_key=exposed-value",
      }).success,
    ).toBe(false);
  });

  it("rejects Ledger events whose outer and authoritative chain positions differ", () => {
    expect(
      ReasoningExecutionLedgerEventSchema.safeParse({
        schemaVersion: "1.0",
        eventType: "invocation-ownership",
        ledgerSequence: 2,
        previousAuditFingerprint: digest,
        ownership: ownership(),
        auditFingerprint: digest,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown, storage-specific, Provider-specific, and unsupported Ledger fields", () => {
    expect(
      ReasoningInvocationOwnershipRecordSchema.safeParse({
        ...ownership(),
        storagePath: "/tmp/reasoning-ledger",
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationOwnershipRecordSchema.safeParse({
        ...ownership(),
        providerApiKey: "secret",
      }).success,
    ).toBe(false);
    expect(
      ReasoningInvocationOwnershipRecordSchema.safeParse({
        ...ownership(),
        schemaVersion: "2.0",
      }).success,
    ).toBe(false);
  });

  it("enforces capacity, ordering, head, and status invariants in Derived Indexes", () => {
    const index = {
      schemaVersion: "1.0",
      retentionPolicyVersion: "bounded-latest-v1",
      entryCapacity: 2,
      verifiedThroughSequence: 4,
      verifiedAuditFingerprint: digest,
      invocationEntries: [
        {
          invocationIdempotencyKey: "reasoning:key:0001",
          ownershipId: "ownership-one",
          invocationRequestId: "invocation-one",
          invocationRequestFingerprint: digest,
          status: "finalized",
          finalizationTransactionId: "finalization-one",
        },
      ],
      attemptEntries: [
        {
          executionAttemptId: "attempt-one",
          invocationRequestId: "invocation-one",
          attemptNumber: 1,
          outcomeFingerprint: digest,
        },
      ],
      resultEntries: [
        {
          invocationRequestId: "invocation-one",
          resultEnvelopeId: "result-one",
          resultEnvelopeFingerprint: digest,
          consumptionId: "consumption-one",
        },
      ],
      indexFingerprint: digest,
    };
    expect(DurableReasoningExecutionDerivedIndexSchema.safeParse(index).success).toBe(true);
    expect(
      DurableReasoningExecutionDerivedIndexSchema.safeParse({
        ...index,
        invocationEntries: [
          index.invocationEntries[0],
          {
            ...index.invocationEntries[0],
            invocationIdempotencyKey: "reasoning:key:0000",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      DurableReasoningExecutionDerivedIndexSchema.safeParse({
        ...index,
        invocationEntries: [{ ...index.invocationEntries[0], status: "in-progress" }],
      }).success,
    ).toBe(false);
    expect(
      DurableReasoningExecutionDerivedIndexSchema.safeParse({
        ...index,
        verifiedThroughSequence: 0,
      }).success,
    ).toBe(false);
  });

  it("exposes stable storage-independent issue codes", () => {
    expect(ReasoningExecutionLedgerIssueCodeSchema.parse("attempt_order_invalid")).toBe(
      "attempt_order_invalid",
    );
    expect(
      ReasoningExecutionLedgerIssueCodeSchema.safeParse("sql_constraint_failure").success,
    ).toBe(false);
  });

  it("accepts coherent Recovery and Integrity success results", () => {
    const recovery = {
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "recovered",
      invocationOwnershipCount: 1,
      executionAttemptCount: 1,
      providerOutcomeCount: 1,
      finalizedInvocationCount: 1,
      finalizedConsumptionCount: 1,
      integrityCheckpointCount: 0,
      lastCommittedLedgerSequence: 4,
      lastAuditFingerprint: digest,
      derivedIndexStatus: "current",
      executionEvidenceFingerprint: digest,
      errors: [],
    };
    const integrity = {
      schemaVersion: "1.0",
      status: "valid",
      verifiedEventCount: 4,
      verifiedInvocationCount: 1,
      verifiedAttemptCount: 1,
      verifiedOutcomeCount: 1,
      verifiedFinalizationCount: 1,
      verifiedThroughSequence: 4,
      lastAuditFingerprint: digest,
      executionEvidenceFingerprint: digest,
      derivedIndexStatus: "current",
      issues: [],
    };
    expect(ReasoningExecutionLedgerRecoveryResultSchema.safeParse(recovery).success).toBe(true);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse(integrity).success,
    ).toBe(true);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        status: "failed",
        executionEvidenceFingerprint: null,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        finalizedInvocationCount: 2,
        finalizedConsumptionCount: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        executionAttemptCount: 5,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        executionAttemptCount: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        integrityCheckpointCount: 0,
        finalizedInvocationCount: 0,
        finalizedConsumptionCount: 0,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse({
        ...integrity,
        verifiedFinalizationCount: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse({
        ...integrity,
        verifiedAttemptCount: 5,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse({
        ...integrity,
        verifiedAttemptCount: 2,
      }).success,
    ).toBe(false);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse({
        ...integrity,
        verifiedFinalizationCount: 0,
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionLedgerRecoveryResultSchema.safeParse({
        ...recovery,
        executionAttemptCount: 2,
        providerOutcomeCount: 2,
        lastCommittedLedgerSequence: 6,
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionLedgerIntegrityVerificationResultSchema.safeParse({
        ...integrity,
        verifiedEventCount: 6,
        verifiedAttemptCount: 2,
        verifiedOutcomeCount: 2,
        verifiedThroughSequence: 6,
      }).success,
    ).toBe(true);
  });

  it("requires Derived Index rebuild failures to explain a missing fingerprint", () => {
    expect(
      ReasoningExecutionLedgerDerivedIndexRebuildResultSchema.safeParse({
        schemaVersion: "1.0",
        status: "rebuilt",
        verifiedThroughSequence: 4,
        indexFingerprint: digest,
        invocationEntryCount: 1,
        attemptEntryCount: 1,
        resultEntryCount: 1,
        issues: [],
      }).success,
    ).toBe(true);
    expect(
      ReasoningExecutionLedgerDerivedIndexRebuildResultSchema.safeParse({
        schemaVersion: "1.0",
        status: "failed",
        verifiedThroughSequence: 0,
        indexFingerprint: null,
        invocationEntryCount: 0,
        attemptEntryCount: 0,
        resultEntryCount: 0,
        issues: [],
      }).success,
    ).toBe(false);
  });
});
