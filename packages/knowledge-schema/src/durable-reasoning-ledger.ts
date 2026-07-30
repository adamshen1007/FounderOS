import { z } from "zod";

import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";
import {
  FinalizedReasoningConsumptionEvidenceSchema,
  ReasoningExecutionAttemptSchema,
  ReasoningIdentifierSchema as IdentifierSchema,
  ReasoningInvocationIdempotencyKeySchema,
  ReasoningInvocationRequestSchema,
  ReasoningLogicalReferenceSchema,
  ReasoningNonEmptyCanonicalTextSchema,
  ReasoningProviderOutcomeSchema,
  ReasoningResultEnvelopeSchema,
  type FinalizedReasoningConsumptionEvidence,
  type ReasoningExecutionAttempt,
  type ReasoningInvocationRequest,
  type ReasoningProviderOutcome,
  type ReasoningResultEnvelope,
} from "./reasoning.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export const ReasoningExecutionLedgerSequenceSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_SAFE_INTEGER);
export const ReasoningExecutionLedgerCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_INTEGER);
export const ReasoningExecutionPreviousAuditFingerprintSchema = z.union([
  z.literal("genesis"),
  Sha256DigestSchema,
]);

function requireChainPosition(
  value: { ledgerSequence: number; previousAuditFingerprint: string },
  context: z.RefinementCtx,
): void {
  if ((value.ledgerSequence === 1) !== (value.previousAuditFingerprint === "genesis")) {
    context.addIssue({
      code: "custom",
      message: "Only the first Execution Ledger event may link to genesis",
      path: ["previousAuditFingerprint"],
    });
  }
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function requireSortedUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  label: string,
): void {
  if (!isSortedUnique(values)) {
    context.addIssue({
      code: "custom",
      message: `${label} must be unique and sorted`,
      path: [...path],
    });
  }
}

const ReasoningExecutionChainFields = {
  ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
  previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
  committedAt: IsoTemporalSchema,
} as const;

export const ReasoningExecutionLedgerHeadExpectationSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      ledgerSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      auditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.ledgerSequence === 0) !== (value.auditFingerprint === "genesis")) {
        context.addIssue({
          code: "custom",
          message: "Only an empty Execution Ledger head may use genesis",
          path: ["auditFingerprint"],
        });
      }
    }),
);

export const ReasoningInvocationOwnershipStatusSchema = z.enum(["in-progress", "finalized"]);
export const ReasoningInvocationOwnershipRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("invocation-ownership"),
      ownershipId: IdentifierSchema,
      invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
      invocationRequestId: IdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      ownershipStatus: z.literal("in-progress"),
      ownershipSequence: ReasoningExecutionLedgerSequenceSchema,
      createdAt: IsoTemporalSchema,
      ...ReasoningExecutionChainFields,
      ownershipFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (
        value.ownershipSequence !== value.ledgerSequence ||
        value.createdAt !== value.committedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "Invocation ownership sequence and creation evidence must bind its Ledger event",
          path: ["ownershipSequence"],
        });
      }
    }),
);

export const DurableReasoningExecutionAttemptRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("execution-attempt"),
      invocationRequestId: IdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
      attempt: ReasoningExecutionAttemptSchema,
      ...ReasoningExecutionChainFields,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (
        value.invocationRequestId !== value.attempt.invocationRequestId ||
        value.invocationRequestFingerprint !== value.attempt.invocationRequestFingerprint ||
        value.invocationIdempotencyKey !== value.attempt.invocationIdempotencyKey ||
        value.committedAt !== value.attempt.startedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "Durable Attempt record must preserve exact Invocation and start bindings",
          path: ["attempt"],
        });
      }
    }),
);

export const DurableReasoningProviderOutcomeRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("provider-outcome"),
      invocationRequestId: IdentifierSchema,
      executionAttemptId: IdentifierSchema,
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      outcome: ReasoningProviderOutcomeSchema,
      ...ReasoningExecutionChainFields,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (
        value.invocationRequestId !== value.outcome.invocationRequestId ||
        value.executionAttemptId !== value.outcome.executionAttemptId ||
        value.attemptNumber !== value.outcome.attemptNumber ||
        value.committedAt !== value.outcome.completedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "Durable Provider Outcome record must preserve exact Attempt bindings",
          path: ["outcome"],
        });
      }
    }),
);

interface FinalizationBindingInput {
  readonly transactionId: string;
  readonly resultEnvelope: ReasoningResultEnvelope;
  readonly consumptionEvidence: FinalizedReasoningConsumptionEvidence;
  readonly completedAt: string;
  readonly invocationIdempotencyKey?: string;
  readonly invocationRequestId?: string;
  readonly invocationRequestFingerprint?: string;
}

function validateFinalizationBindings(
  value: FinalizationBindingInput,
  context: z.RefinementCtx,
): void {
  const result = value.resultEnvelope;
  const consumption = value.consumptionEvidence;
  const finalAttempt = consumption.attemptHistorySummary.attempts.at(-1)!;
  if (
    result.invocationIdempotencyKey !== consumption.invocationIdempotencyKey ||
    result.invocationRequestId !== consumption.invocationRequestId ||
    result.invocationRequestFingerprint !== consumption.invocationRequestFingerprint ||
    consumption.finalResultEnvelopeId !== result.resultEnvelopeId ||
    consumption.finalResultEnvelopeFingerprint !== result.resultEnvelopeFingerprint ||
    consumption.finalOutcome !== result.outcome ||
    consumption.deliveryReceiptId !== result.deliveryReceiptId ||
    consumption.deliveryReceiptFingerprint !== result.deliveryReceiptFingerprint ||
    consumption.deliveryTransactionId !== result.deliveryTransactionId ||
    consumption.providerCapabilityId !== result.providerCapabilityId ||
    consumption.providerCapabilityFingerprint !== result.providerCapabilityFingerprint ||
    consumption.usageEvidenceFingerprint !== result.usageEvidence.usageFingerprint ||
    consumption.costEvidenceFingerprint !== result.costEvidence.costFingerprint ||
    consumption.executionLedgerTransactionId !== value.transactionId ||
    finalAttempt.executionAttemptId !== result.executionAttemptId ||
    finalAttempt.attemptNumber !== result.attemptNumber ||
    finalAttempt.outcome !== result.outcome ||
    consumption.completedAt !== value.completedAt ||
    (value.invocationIdempotencyKey !== undefined &&
      (value.invocationIdempotencyKey !== result.invocationIdempotencyKey ||
        value.invocationIdempotencyKey !== consumption.invocationIdempotencyKey)) ||
    (value.invocationRequestId !== undefined &&
      (value.invocationRequestId !== result.invocationRequestId ||
        value.invocationRequestId !== consumption.invocationRequestId)) ||
    (value.invocationRequestFingerprint !== undefined &&
      (value.invocationRequestFingerprint !== result.invocationRequestFingerprint ||
        value.invocationRequestFingerprint !== consumption.invocationRequestFingerprint))
  ) {
    context.addIssue({
      code: "custom",
      message: "Finalization must atomically bind its Result and Consumption Evidence",
      path: ["consumptionEvidence"],
    });
  }
  if (
    (result.outcome === "failed" &&
      consumption.finalOutcome === "failed" &&
      consumption.failureEvidenceFingerprint !== result.failureEvidence.failureFingerprint) ||
    (result.outcome === "timed-out" &&
      consumption.finalOutcome === "timed-out" &&
      consumption.timeoutEvidenceFingerprint !== result.timeoutEvidence.timeoutFingerprint) ||
    (result.outcome === "cancelled" &&
      consumption.finalOutcome === "cancelled" &&
      consumption.cancellationEvidenceFingerprint !==
        result.cancellationEvidence.cancellationFingerprint)
  ) {
    context.addIssue({
      code: "custom",
      message: "Finalized Consumption terminal evidence must bind the Result outcome",
      path: ["consumptionEvidence", "finalOutcome"],
    });
  }
}

export const FinalizedReasoningInvocationTransactionSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("finalized-invocation-transaction"),
      transactionId: IdentifierSchema,
      ownershipId: IdentifierSchema,
      invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
      invocationRequestId: IdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      resultEnvelope: ReasoningResultEnvelopeSchema,
      consumptionEvidence: FinalizedReasoningConsumptionEvidenceSchema,
      ...ReasoningExecutionChainFields,
      transactionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      validateFinalizationBindings(
        {
          ...value,
          completedAt: value.committedAt,
        },
        context,
      );
    }),
);

export const ReasoningExecutionIntegrityCheckpointRecordSchema =
  DurableCanonicalJsonValueSchema.pipe(
    z
      .object({
        schemaVersion: z.literal("1.0"),
        recordType: z.literal("integrity-checkpoint"),
        checkpointId: IdentifierSchema,
        verifiedThroughSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
        verifiedAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
        executionEvidenceFingerprint: Sha256DigestSchema,
        ...ReasoningExecutionChainFields,
        checkpointFingerprint: Sha256DigestSchema,
      })
      .strict()
      .superRefine((value, context) => {
        requireChainPosition(value, context);
        if (
          value.verifiedThroughSequence >= value.ledgerSequence ||
          (value.verifiedThroughSequence === 0) !== (value.verifiedAuditFingerprint === "genesis")
        ) {
          context.addIssue({
            code: "custom",
            message: "Integrity checkpoint must verify a coherent prior Ledger head",
            path: ["verifiedThroughSequence"],
          });
        }
      }),
  );

export const ReasoningExecutionLedgerEventSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .discriminatedUnion("eventType", [
      z
        .object({
          schemaVersion: z.literal("1.0"),
          eventType: z.literal("invocation-ownership"),
          ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
          previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
          ownership: ReasoningInvocationOwnershipRecordSchema,
          auditFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          eventType: z.literal("execution-attempt"),
          ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
          previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
          attemptRecord: DurableReasoningExecutionAttemptRecordSchema,
          auditFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          eventType: z.literal("provider-outcome"),
          ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
          previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
          outcomeRecord: DurableReasoningProviderOutcomeRecordSchema,
          auditFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          eventType: z.literal("invocation-finalization"),
          ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
          previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
          finalization: FinalizedReasoningInvocationTransactionSchema,
          auditFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          eventType: z.literal("integrity-checkpoint"),
          ledgerSequence: ReasoningExecutionLedgerSequenceSchema,
          previousAuditFingerprint: ReasoningExecutionPreviousAuditFingerprintSchema,
          checkpoint: ReasoningExecutionIntegrityCheckpointRecordSchema,
          auditFingerprint: Sha256DigestSchema,
        })
        .strict(),
    ])
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      const nested =
        value.eventType === "invocation-ownership"
          ? value.ownership
          : value.eventType === "execution-attempt"
            ? value.attemptRecord
            : value.eventType === "provider-outcome"
              ? value.outcomeRecord
              : value.eventType === "invocation-finalization"
                ? value.finalization
                : value.checkpoint;
      if (
        nested.ledgerSequence !== value.ledgerSequence ||
        nested.previousAuditFingerprint !== value.previousAuditFingerprint
      ) {
        context.addIssue({
          code: "custom",
          message: "Execution Ledger event and authoritative record chain positions must agree",
          path: ["ledgerSequence"],
        });
      }
    }),
);

export const RegisterReasoningInvocationRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      expectedLedgerHead: ReasoningExecutionLedgerHeadExpectationSchema,
      expectedIdempotencyState: z.literal("unowned"),
      invocationRequest: ReasoningInvocationRequestSchema,
      registeredAt: IsoTemporalSchema,
    })
    .strict(),
);

export const AppendReasoningExecutionAttemptRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      expectedLedgerHead: ReasoningExecutionLedgerHeadExpectationSchema,
      ownershipId: IdentifierSchema,
      expectedOwnershipStatus: z.literal("in-progress"),
      expectedPriorAttemptCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      attempt: ReasoningExecutionAttemptSchema,
    })
    .strict()
    .refine((value) => value.attempt.attemptNumber === value.expectedPriorAttemptCount + 1, {
      message: "Attempt number must follow the authoritative prior Attempt count",
      path: ["attempt", "attemptNumber"],
    }),
);

export const AppendReasoningProviderOutcomeRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      expectedLedgerHead: ReasoningExecutionLedgerHeadExpectationSchema,
      ownershipId: IdentifierSchema,
      expectedOwnershipStatus: z.literal("in-progress"),
      attemptFingerprint: Sha256DigestSchema,
      outcome: ReasoningProviderOutcomeSchema,
    })
    .strict(),
);

export const FinalizeReasoningInvocationRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      expectedLedgerHead: ReasoningExecutionLedgerHeadExpectationSchema,
      ownershipId: IdentifierSchema,
      expectedOwnershipStatus: z.literal("in-progress"),
      expectedAttemptCount: z.number().int().positive().max(MAX_SAFE_INTEGER),
      transactionId: IdentifierSchema,
      resultEnvelope: ReasoningResultEnvelopeSchema,
      consumptionEvidence: FinalizedReasoningConsumptionEvidenceSchema,
      finalizedAt: IsoTemporalSchema,
    })
    .strict()
    .superRefine((value, context) => {
      validateFinalizationBindings(
        {
          transactionId: value.transactionId,
          resultEnvelope: value.resultEnvelope,
          consumptionEvidence: value.consumptionEvidence,
          completedAt: value.finalizedAt,
        },
        context,
      );
      if (
        value.expectedAttemptCount !== value.resultEnvelope.attemptNumber ||
        value.expectedAttemptCount !==
          value.consumptionEvidence.attemptHistorySummary.attemptCount ||
        value.transactionId !== value.consumptionEvidence.executionLedgerTransactionId ||
        value.finalizedAt !== value.resultEnvelope.completedAt ||
        value.finalizedAt !== value.consumptionEvidence.completedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "Finalization request must bind its terminal Attempt, transaction, and time",
          path: ["expectedAttemptCount"],
        });
      }
    }),
);

export const ReasoningInvocationOwnershipResolutionStatusSchema = z.enum([
  "conflict",
  "identical-finalized",
  "identical-in-progress",
  "registered",
]);
export const ReasoningInvocationOwnershipReasonCodeSchema = z.enum([
  "idempotency_key_conflict",
  "invocation_already_finalized",
  "invocation_already_in_progress",
  "invocation_registered",
]);
export const ReasoningInvocationOwnershipResolutionSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .discriminatedUnion("status", [
      z
        .object({
          schemaVersion: z.literal("1.0"),
          status: z.literal("registered"),
          reasonCode: z.literal("invocation_registered"),
          ownership: ReasoningInvocationOwnershipRecordSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          status: z.literal("identical-in-progress"),
          reasonCode: z.literal("invocation_already_in_progress"),
          ownership: ReasoningInvocationOwnershipRecordSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          status: z.literal("identical-finalized"),
          reasonCode: z.literal("invocation_already_finalized"),
          ownership: ReasoningInvocationOwnershipRecordSchema,
          finalization: FinalizedReasoningInvocationTransactionSchema,
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          status: z.literal("conflict"),
          reasonCode: z.literal("idempotency_key_conflict"),
          existingInvocationRequestId: IdentifierSchema,
          existingInvocationRequestFingerprint: Sha256DigestSchema,
        })
        .strict(),
    ])
    .superRefine((value, context) => {
      if (
        value.status === "identical-finalized" &&
        (value.ownership.ownershipId !== value.finalization.ownershipId ||
          value.ownership.invocationIdempotencyKey !==
            value.finalization.invocationIdempotencyKey ||
          value.ownership.invocationRequestId !== value.finalization.invocationRequestId ||
          value.ownership.invocationRequestFingerprint !==
            value.finalization.invocationRequestFingerprint)
      ) {
        context.addIssue({
          code: "custom",
          message: "Identical finalized resolution must preserve exact Invocation ownership",
          path: ["finalization"],
        });
      }
    }),
);

export const ReasoningInvocationFinalizationStatusSchema = z.enum([
  "conflict",
  "finalized",
  "identical-finalization",
]);
export const ReasoningInvocationFinalizationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        schemaVersion: z.literal("1.0"),
        status: z.literal("finalized"),
        finalization: FinalizedReasoningInvocationTransactionSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal("1.0"),
        status: z.literal("identical-finalization"),
        finalization: FinalizedReasoningInvocationTransactionSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal("1.0"),
        status: z.literal("conflict"),
        reasonCode: z.literal("conflicting_finalization"),
        existingTransactionId: IdentifierSchema,
        existingResultEnvelopeFingerprint: Sha256DigestSchema,
      })
      .strict(),
  ]),
);

export const ReasoningExecutionLedgerIssueCodeSchema = z.enum([
  "attempt_binding_mismatch",
  "attempt_order_invalid",
  "audit_chain_broken",
  "derived_index_invalid",
  "derived_index_mismatch",
  "derived_index_missing",
  "finalization_conflict",
  "finalization_incomplete",
  "fingerprint_mismatch",
  "invalid_raw_record",
  "invocation_binding_mismatch",
  "invocation_idempotency_conflict",
  "orphan_attempt",
  "orphan_outcome",
  "outcome_binding_mismatch",
  "resource_limit_exceeded",
  "sequence_invalid",
  "storage_failure",
  "transaction_conflict",
  "unsafe_content",
  "unsupported_version",
]);
export const ReasoningExecutionLedgerIssueSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      code: ReasoningExecutionLedgerIssueCodeSchema,
      logicalLocation: ReasoningLogicalReferenceSchema,
      message: ReasoningNonEmptyCanonicalTextSchema,
    })
    .strict(),
);

export const DurableReasoningExecutionDerivedIndexSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      retentionPolicyVersion: z.literal("bounded-latest-v1"),
      entryCapacity: z.number().int().positive().max(MAX_SAFE_INTEGER),
      verifiedThroughSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      verifiedAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      invocationEntries: z.array(
        z
          .object({
            invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
            ownershipId: IdentifierSchema,
            invocationRequestId: IdentifierSchema,
            invocationRequestFingerprint: Sha256DigestSchema,
            status: ReasoningInvocationOwnershipStatusSchema,
            finalizationTransactionId: IdentifierSchema.nullable(),
          })
          .strict(),
      ),
      attemptEntries: z.array(
        z
          .object({
            executionAttemptId: IdentifierSchema,
            invocationRequestId: IdentifierSchema,
            attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
            outcomeFingerprint: Sha256DigestSchema.nullable(),
          })
          .strict(),
      ),
      resultEntries: z.array(
        z
          .object({
            invocationRequestId: IdentifierSchema,
            resultEnvelopeId: IdentifierSchema,
            resultEnvelopeFingerprint: Sha256DigestSchema,
            consumptionId: IdentifierSchema,
          })
          .strict(),
      ),
      indexFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      for (const [field, entries] of [
        ["invocationEntries", value.invocationEntries],
        ["attemptEntries", value.attemptEntries],
        ["resultEntries", value.resultEntries],
      ] as const) {
        if (entries.length > value.entryCapacity) {
          context.addIssue({
            code: "custom",
            message: "Derived index entries exceed the declared retention capacity",
            path: [field],
          });
        }
      }
      requireSortedUnique(
        value.invocationEntries.map((entry) => entry.invocationIdempotencyKey),
        context,
        ["invocationEntries"],
        "Invocation index keys",
      );
      requireSortedUnique(
        value.attemptEntries.map(
          (entry) =>
            `${entry.invocationRequestId}\0${String(entry.attemptNumber).padStart(16, "0")}`,
        ),
        context,
        ["attemptEntries"],
        "Attempt index keys",
      );
      requireSortedUnique(
        value.resultEntries.map((entry) => entry.invocationRequestId),
        context,
        ["resultEntries"],
        "Result index keys",
      );
      if (
        (value.verifiedThroughSequence === 0) !==
        (value.verifiedAuditFingerprint === "genesis")
      ) {
        context.addIssue({
          code: "custom",
          message: "Derived index verification head must be coherent",
          path: ["verifiedAuditFingerprint"],
        });
      }
      for (const [index, entry] of value.invocationEntries.entries()) {
        if ((entry.status === "finalized") !== (entry.finalizationTransactionId !== null)) {
          context.addIssue({
            code: "custom",
            message: "Invocation index status and Finalization reference must agree",
            path: ["invocationEntries", index, "status"],
          });
        }
      }
    }),
);

export const ReasoningExecutionDerivedIndexStatusSchema = z.enum([
  "current",
  "invalid",
  "missing",
  "rebuilt",
  "stale",
]);

const RecoveryCounts = {
  invocationOwnershipCount: ReasoningExecutionLedgerCountSchema,
  executionAttemptCount: ReasoningExecutionLedgerCountSchema,
  providerOutcomeCount: ReasoningExecutionLedgerCountSchema,
  finalizedInvocationCount: ReasoningExecutionLedgerCountSchema,
  finalizedConsumptionCount: ReasoningExecutionLedgerCountSchema,
  integrityCheckpointCount: ReasoningExecutionLedgerCountSchema,
  lastCommittedLedgerSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
  lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
  derivedIndexStatus: ReasoningExecutionDerivedIndexStatusSchema,
} as const;

export const ReasoningExecutionLedgerRecoveryResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .discriminatedUnion("status", [
      z
        .object({
          schemaVersion: z.literal("1.0"),
          ledgerContractVersion: z.literal("1.0"),
          status: z.literal("recovered"),
          ...RecoveryCounts,
          executionEvidenceFingerprint: Sha256DigestSchema,
          errors: z.tuple([]),
        })
        .strict(),
      z
        .object({
          schemaVersion: z.literal("1.0"),
          ledgerContractVersion: z.literal("1.0"),
          status: z.literal("failed"),
          ...RecoveryCounts,
          executionEvidenceFingerprint: z.null(),
          errors: z.array(ReasoningExecutionLedgerIssueSchema).min(1),
        })
        .strict(),
    ])
    .superRefine((value, context) => {
      if (
        (value.lastCommittedLedgerSequence === 0) !==
        (value.lastAuditFingerprint === "genesis")
      ) {
        context.addIssue({
          code: "custom",
          message: "Recovery Ledger sequence and audit head must agree",
          path: ["lastAuditFingerprint"],
        });
      }
      const authoritativeEventCount =
        value.invocationOwnershipCount +
        value.executionAttemptCount +
        value.providerOutcomeCount +
        value.finalizedInvocationCount +
        value.integrityCheckpointCount;
      if (
        authoritativeEventCount !== value.lastCommittedLedgerSequence ||
        value.invocationOwnershipCount > value.lastCommittedLedgerSequence ||
        value.executionAttemptCount > value.lastCommittedLedgerSequence ||
        value.providerOutcomeCount > value.lastCommittedLedgerSequence ||
        value.finalizedInvocationCount > value.lastCommittedLedgerSequence ||
        value.finalizedConsumptionCount > value.lastCommittedLedgerSequence ||
        value.integrityCheckpointCount > value.lastCommittedLedgerSequence ||
        value.providerOutcomeCount > value.executionAttemptCount ||
        value.finalizedInvocationCount > value.invocationOwnershipCount ||
        value.finalizedInvocationCount > value.providerOutcomeCount ||
        value.finalizedInvocationCount !== value.finalizedConsumptionCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Recovery authoritative record counts are contradictory",
          path: ["finalizedInvocationCount"],
        });
      }
    }),
);

export const ReasoningExecutionLedgerIntegrityVerificationResultSchema =
  DurableCanonicalJsonValueSchema.pipe(
    z
      .discriminatedUnion("status", [
        z
          .object({
            schemaVersion: z.literal("1.0"),
            status: z.literal("valid"),
            verifiedEventCount: ReasoningExecutionLedgerCountSchema,
            verifiedInvocationCount: ReasoningExecutionLedgerCountSchema,
            verifiedAttemptCount: ReasoningExecutionLedgerCountSchema,
            verifiedOutcomeCount: ReasoningExecutionLedgerCountSchema,
            verifiedFinalizationCount: ReasoningExecutionLedgerCountSchema,
            verifiedThroughSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
            lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
            executionEvidenceFingerprint: Sha256DigestSchema,
            derivedIndexStatus: ReasoningExecutionDerivedIndexStatusSchema,
            issues: z.tuple([]),
          })
          .strict(),
        z
          .object({
            schemaVersion: z.literal("1.0"),
            status: z.literal("invalid"),
            verifiedEventCount: ReasoningExecutionLedgerCountSchema,
            verifiedInvocationCount: ReasoningExecutionLedgerCountSchema,
            verifiedAttemptCount: ReasoningExecutionLedgerCountSchema,
            verifiedOutcomeCount: ReasoningExecutionLedgerCountSchema,
            verifiedFinalizationCount: ReasoningExecutionLedgerCountSchema,
            verifiedThroughSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
            lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
            executionEvidenceFingerprint: z.null(),
            derivedIndexStatus: ReasoningExecutionDerivedIndexStatusSchema,
            issues: z.array(ReasoningExecutionLedgerIssueSchema).min(1),
          })
          .strict(),
      ])
      .superRefine((value, context) => {
        const trackedEventCount =
          value.verifiedInvocationCount +
          value.verifiedAttemptCount +
          value.verifiedOutcomeCount +
          value.verifiedFinalizationCount;
        if (
          value.verifiedEventCount !== value.verifiedThroughSequence ||
          trackedEventCount > value.verifiedEventCount ||
          (value.verifiedThroughSequence === 0) !== (value.lastAuditFingerprint === "genesis") ||
          value.verifiedInvocationCount > value.verifiedEventCount ||
          value.verifiedAttemptCount > value.verifiedEventCount ||
          value.verifiedOutcomeCount > value.verifiedEventCount ||
          value.verifiedFinalizationCount > value.verifiedEventCount ||
          value.verifiedOutcomeCount > value.verifiedAttemptCount ||
          value.verifiedFinalizationCount > value.verifiedInvocationCount ||
          value.verifiedFinalizationCount > value.verifiedOutcomeCount
        ) {
          context.addIssue({
            code: "custom",
            message: "Integrity verification counts and verified Ledger head must agree",
            path: ["verifiedThroughSequence"],
          });
        }
      }),
  );

export const ReasoningExecutionLedgerDerivedIndexRebuildResultSchema =
  DurableCanonicalJsonValueSchema.pipe(
    z
      .object({
        schemaVersion: z.literal("1.0"),
        status: z.enum(["failed", "rebuilt", "unchanged"]),
        verifiedThroughSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
        indexFingerprint: Sha256DigestSchema.nullable(),
        invocationEntryCount: ReasoningExecutionLedgerCountSchema,
        attemptEntryCount: ReasoningExecutionLedgerCountSchema,
        resultEntryCount: ReasoningExecutionLedgerCountSchema,
        issues: z.array(ReasoningExecutionLedgerIssueSchema),
      })
      .strict()
      .superRefine((value, context) => {
        if (
          (value.status === "failed" &&
            (value.indexFingerprint !== null || value.issues.length === 0)) ||
          (value.status !== "failed" &&
            (value.indexFingerprint === null || value.issues.length > 0))
        ) {
          context.addIssue({
            code: "custom",
            message: "Derived-index rebuild status, fingerprint, and issues must agree",
            path: ["status"],
          });
        }
      }),
  );

export type ReasoningExecutionLedgerHeadExpectation = z.infer<
  typeof ReasoningExecutionLedgerHeadExpectationSchema
>;
export type ReasoningInvocationOwnershipRecord = z.infer<
  typeof ReasoningInvocationOwnershipRecordSchema
>;
export type DurableReasoningExecutionAttemptRecord = z.infer<
  typeof DurableReasoningExecutionAttemptRecordSchema
>;
export type DurableReasoningProviderOutcomeRecord = z.infer<
  typeof DurableReasoningProviderOutcomeRecordSchema
>;
export type FinalizedReasoningInvocationTransaction = z.infer<
  typeof FinalizedReasoningInvocationTransactionSchema
>;
export type ReasoningExecutionLedgerEvent = z.infer<typeof ReasoningExecutionLedgerEventSchema>;
export type RegisterReasoningInvocationRequest = z.infer<
  typeof RegisterReasoningInvocationRequestSchema
>;
export type AppendReasoningExecutionAttemptRequest = z.infer<
  typeof AppendReasoningExecutionAttemptRequestSchema
>;
export type AppendReasoningProviderOutcomeRequest = z.infer<
  typeof AppendReasoningProviderOutcomeRequestSchema
>;
export type FinalizeReasoningInvocationRequest = z.infer<
  typeof FinalizeReasoningInvocationRequestSchema
>;
export type ReasoningInvocationOwnershipResolution = z.infer<
  typeof ReasoningInvocationOwnershipResolutionSchema
>;
export type ReasoningInvocationFinalizationResult = z.infer<
  typeof ReasoningInvocationFinalizationResultSchema
>;
export type DurableReasoningExecutionDerivedIndex = z.infer<
  typeof DurableReasoningExecutionDerivedIndexSchema
>;
export type ReasoningExecutionLedgerRecoveryResult = z.infer<
  typeof ReasoningExecutionLedgerRecoveryResultSchema
>;
export type ReasoningExecutionLedgerIntegrityVerificationResult = z.infer<
  typeof ReasoningExecutionLedgerIntegrityVerificationResultSchema
>;
export type ReasoningExecutionLedgerDerivedIndexRebuildResult = z.infer<
  typeof ReasoningExecutionLedgerDerivedIndexRebuildResultSchema
>;

export interface DurableReasoningExecutionLedger {
  registerInvocation(
    request: RegisterReasoningInvocationRequest,
  ): Promise<ReasoningInvocationOwnershipResolution>;
  appendExecutionAttempt(
    request: AppendReasoningExecutionAttemptRequest,
  ): Promise<ReasoningExecutionAttempt>;
  appendProviderOutcome(
    request: AppendReasoningProviderOutcomeRequest,
  ): Promise<ReasoningProviderOutcome>;
  finalizeInvocation(
    request: FinalizeReasoningInvocationRequest,
  ): Promise<ReasoningInvocationFinalizationResult>;
  resolveInvocationOwnership(
    invocationIdempotencyKey: string,
  ): Promise<ReasoningInvocationOwnershipRecord | null>;
  readInvocationRequest(invocationRequestId: string): Promise<ReasoningInvocationRequest | null>;
  readAttemptHistory(invocationRequestId: string): Promise<readonly ReasoningExecutionAttempt[]>;
  readProviderOutcome(executionAttemptId: string): Promise<ReasoningProviderOutcome | null>;
  readFinalizedResult(invocationRequestId: string): Promise<ReasoningResultEnvelope | null>;
  readFinalizedConsumptionEvidence(
    invocationRequestId: string,
  ): Promise<FinalizedReasoningConsumptionEvidence | null>;
  recover(): Promise<ReasoningExecutionLedgerRecoveryResult>;
  verifyIntegrity(): Promise<ReasoningExecutionLedgerIntegrityVerificationResult>;
  rebuildDerivedIndexes(): Promise<ReasoningExecutionLedgerDerivedIndexRebuildResult>;
}
