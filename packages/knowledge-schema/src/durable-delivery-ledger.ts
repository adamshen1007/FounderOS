import { z } from "zod";

import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import {
  ContextConsumerAcknowledgmentSchema,
  ContextConsumptionEvidenceSchema,
  ContextDeliveryFreshnessEvidenceSchema,
  ContextDeliveryFreshnessPolicySchema,
  ContextDeliveryPolicyDecisionEvidenceSchema,
  ContextDeliveryReplayEvidenceSchema,
  ContextDeliveryReplayPolicySchema,
  ContextDeliveryReceiptSchema,
  GovernedContextDeliveryEnvelopeSchema,
  GovernedContextDeliveryRequestSchema,
  GovernedContextDeliverySuccessSchema,
} from "./delivery.js";
import {
  IdentifierSchema,
  IsoTemporalSchema,
  NonEmptyStringSchema,
  Sha256DigestSchema,
} from "./primitives.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export const DurableDeliveryLedgerSequenceSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_SAFE_INTEGER);
export const DurableDeliveryLedgerCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_INTEGER);
export const DurableDeliveryPreviousAuditFingerprintSchema = z.union([
  z.literal("genesis"),
  Sha256DigestSchema,
]);

function requireChainPosition(
  value: { ledgerSequence: number; previousAuditFingerprint: string },
  context: z.RefinementCtx,
): void {
  if (value.ledgerSequence === 1 && value.previousAuditFingerprint !== "genesis") {
    context.addIssue({
      code: "custom",
      message: "The first Delivery Ledger event must explicitly link to genesis",
      path: ["previousAuditFingerprint"],
    });
  }
  if (value.ledgerSequence > 1 && value.previousAuditFingerprint === "genesis") {
    context.addIssue({
      code: "custom",
      message: "Only the first Delivery Ledger event may link to genesis",
      path: ["previousAuditFingerprint"],
    });
  }
}

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1]! < value)
  );
}

const DurableDeliveryChainFields = {
  ledgerSequence: DurableDeliveryLedgerSequenceSchema,
  previousAuditFingerprint: DurableDeliveryPreviousAuditFingerprintSchema,
  committedAt: IsoTemporalSchema,
} as const;

export const DurableDeliveryRequestRegistrationRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("delivery_request_registration"),
      registrationId: IdentifierSchema,
      transactionId: IdentifierSchema,
      deliveryRequestId: IdentifierSchema,
      deliveryRequestFingerprint: Sha256DigestSchema,
      request: GovernedContextDeliveryRequestSchema,
      ...DurableDeliveryChainFields,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (
        value.deliveryRequestId !== value.request.deliveryRequestId ||
        value.deliveryRequestFingerprint !== value.request.requestFingerprint
      ) {
        context.addIssue({
          code: "custom",
          message: "Delivery Request registration must preserve the exact Request binding",
          path: ["request"],
        });
      }
    }),
);

export const DurableDeliveryExpirationEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      policyVersion: z.literal("permanent-reservation-v1"),
      status: z.enum(["active", "expired-permanently-reserved"]),
      expiresAt: IsoTemporalSchema.nullable(),
      evaluatedAt: IsoTemporalSchema,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.status === "expired-permanently-reserved" &&
        (value.expiresAt === null || Date.parse(value.evaluatedAt) < Date.parse(value.expiresAt))
      ) {
        context.addIssue({
          code: "custom",
          message: "Expired evidence requires a reached expiration timestamp",
          path: ["evaluatedAt"],
        });
      }
      if (
        value.status === "active" &&
        value.expiresAt !== null &&
        Date.parse(value.evaluatedAt) >= Date.parse(value.expiresAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "Active expiration evidence cannot be evaluated at or after expiration",
          path: ["evaluatedAt"],
        });
      }
    }),
);

export const DurableIdempotencyOwnershipRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("idempotency_ownership"),
      ownershipId: IdentifierSchema,
      transactionId: IdentifierSchema,
      idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u),
      deliveryRequestFingerprint: Sha256DigestSchema,
      deliveryRequestId: IdentifierSchema,
      originalDeliveryTransactionId: IdentifierSchema,
      originalEnvelopeId: IdentifierSchema,
      originalEnvelopeFingerprint: Sha256DigestSchema,
      originalReceiptId: IdentifierSchema,
      originalReceiptFingerprint: Sha256DigestSchema,
      replayPolicy: ContextDeliveryReplayPolicySchema,
      freshnessPolicy: ContextDeliveryFreshnessPolicySchema,
      expirationEvidence: DurableDeliveryExpirationEvidenceSchema,
      ownershipSequence: DurableDeliveryLedgerSequenceSchema,
      createdAt: IsoTemporalSchema,
      ...DurableDeliveryChainFields,
      ownershipFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (
        value.ownershipSequence !== value.ledgerSequence ||
        value.originalDeliveryTransactionId !== value.transactionId ||
        value.createdAt !== value.committedAt ||
        value.expirationEvidence.status !== "active" ||
        value.expirationEvidence.evaluatedAt !== value.createdAt ||
        value.expirationEvidence.expiresAt !== (value.freshnessPolicy.expiresAt ?? null)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Idempotency ownership sequence, creation, expiration, and transaction bindings must agree",
          path: ["ownershipSequence"],
        });
      }
    }),
);

export const DurableDeliveryArtifactTypeSchema = z.enum([
  "delivery-envelope",
  "consumer-acknowledgment",
  "delivery-receipt",
  "consumption-evidence",
  "replay-evidence",
]);

const DurableArtifactPayloadSchema = z.discriminatedUnion("artifactType", [
  z
    .object({
      artifactType: z.literal("delivery-envelope"),
      artifact: GovernedContextDeliveryEnvelopeSchema,
    })
    .strict(),
  z
    .object({
      artifactType: z.literal("consumer-acknowledgment"),
      artifact: ContextConsumerAcknowledgmentSchema,
    })
    .strict(),
  z
    .object({ artifactType: z.literal("delivery-receipt"), artifact: ContextDeliveryReceiptSchema })
    .strict(),
  z
    .object({
      artifactType: z.literal("consumption-evidence"),
      artifact: ContextConsumptionEvidenceSchema,
    })
    .strict(),
  z
    .object({
      artifactType: z.literal("replay-evidence"),
      artifact: ContextDeliveryReplayEvidenceSchema,
    })
    .strict(),
]);

export const DurableDeliveryArtifactRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("delivery_artifact"),
      artifactType: DurableDeliveryArtifactTypeSchema,
      artifactId: IdentifierSchema,
      artifactContractVersion: z.literal("1.0"),
      artifact: DurableCanonicalJsonValueSchema,
      artifactFingerprint: Sha256DigestSchema,
      transactionId: IdentifierSchema,
      ...DurableDeliveryChainFields,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      const parsed = DurableArtifactPayloadSchema.safeParse({
        artifactType: value.artifactType,
        artifact: value.artifact,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            code: "custom",
            message: issue.message,
            path: ["artifact", ...issue.path.slice(1)],
          });
        }
      }
    }),
);

export const DurableDeliveryLedgerHeadExpectationSchema = z
  .object({
    ledgerSequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    auditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.ledgerSequence === 0) !== (value.auditFingerprint === "genesis")) {
      context.addIssue({
        code: "custom",
        message: "Empty Ledger head must use genesis and only an empty head may use genesis",
        path: ["auditFingerprint"],
      });
    }
  });

export const AtomicDeliveryTransactionRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      transactionId: IdentifierSchema,
      expectedLedgerHead: DurableDeliveryLedgerHeadExpectationSchema,
      expectedIdempotencyState: z.literal("unowned"),
      request: GovernedContextDeliveryRequestSchema,
      deliveryResult: GovernedContextDeliverySuccessSchema,
      committedAt: IsoTemporalSchema,
    })
    .strict(),
);

export const CommittedDeliveryTransactionRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("committed_delivery_transaction"),
      transactionId: IdentifierSchema,
      ledgerSequence: DurableDeliveryLedgerSequenceSchema,
      previousAuditFingerprint: DurableDeliveryPreviousAuditFingerprintSchema,
      requestRegistration: DurableDeliveryRequestRegistrationRecordSchema,
      idempotencyOwnership: DurableIdempotencyOwnershipRecordSchema,
      artifacts: z.array(DurableDeliveryArtifactRecordSchema).length(3),
      committedAt: IsoTemporalSchema,
      transactionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      const nested = [value.requestRegistration, value.idempotencyOwnership, ...value.artifacts];
      if (
        nested.some(
          (record) =>
            record.transactionId !== value.transactionId ||
            record.ledgerSequence !== value.ledgerSequence ||
            record.previousAuditFingerprint !== value.previousAuditFingerprint ||
            record.committedAt !== value.committedAt,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Every original Delivery member must bind the same atomic transaction",
          path: ["transactionId"],
        });
      }
      const artifactTypes = value.artifacts.map((record) => record.artifactType).sort();
      if (
        JSON.stringify(artifactTypes) !==
        JSON.stringify(["consumer-acknowledgment", "delivery-envelope", "delivery-receipt"])
      ) {
        context.addIssue({
          code: "custom",
          message:
            "A committed Delivery requires exactly one Envelope, Acknowledgment, and Receipt",
          path: ["artifacts"],
        });
      }
    }),
);

export const DurableReplayOutcomeSchema = z.enum([
  "accepted-original-result",
  "rejected-single-delivery",
  "rejected-expired",
  "rejected-policy",
  "rejected-freshness",
  "rejected-idempotency-conflict",
  "evaluation-only",
  "integrity-failure",
]);

export const DurableReplayReasonCodeSchema = z.enum([
  "original_result_replayed",
  "single_delivery_replay_rejected",
  "delivery_expired",
  "policy_denied",
  "policy_review_required",
  "policy_not_evaluated",
  "freshness_rejected",
  "newer_active_snapshot",
  "historical_replay_not_allowed",
  "idempotency_key_conflict",
  "evaluation_only",
  "integrity_failure",
]);

export const DurableReplayAttemptRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("replay_attempt"),
      replayAttemptId: IdentifierSchema,
      originalDeliveryTransactionId: IdentifierSchema,
      idempotencyKey: z.string().min(8),
      replayRequest: GovernedContextDeliveryRequestSchema,
      replayRequestFingerprint: Sha256DigestSchema,
      originalEnvelopeId: IdentifierSchema,
      originalEnvelopeFingerprint: Sha256DigestSchema,
      originalReceiptId: IdentifierSchema,
      originalReceiptFingerprint: Sha256DigestSchema,
      currentPolicyDecisionEvidence: ContextDeliveryPolicyDecisionEvidenceSchema,
      currentPolicyDecisionFingerprint: Sha256DigestSchema,
      currentFreshnessEvidence: ContextDeliveryFreshnessEvidenceSchema,
      currentFreshnessFingerprint: Sha256DigestSchema,
      currentActiveSnapshotEvidence: z
        .object({
          snapshotId: IdentifierSchema,
          activationSequence: z.number().int().nonnegative(),
          registryIntegrityFingerprint: Sha256DigestSchema,
        })
        .strict(),
      replayPolicy: ContextDeliveryReplayPolicySchema,
      replayClassification: z.enum(["identical-replay", "evaluation-replay", "rejected-replay"]),
      outcome: DurableReplayOutcomeSchema,
      reasonCodes: z.array(DurableReplayReasonCodeSchema).min(1),
      expirationEvidence: DurableDeliveryExpirationEvidenceSchema.nullable(),
      attemptedAt: IsoTemporalSchema,
      ...DurableDeliveryChainFields,
      replayAttemptFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireChainPosition(value, context);
      if (!isSortedUnique(value.reasonCodes)) {
        context.addIssue({
          code: "custom",
          message: "Replay reason codes must be unique and sorted",
          path: ["reasonCodes"],
        });
      }
      if (
        value.replayRequestFingerprint !== value.replayRequest.requestFingerprint ||
        value.currentPolicyDecisionFingerprint !==
          value.currentPolicyDecisionEvidence.decisionFingerprint ||
        value.currentFreshnessFingerprint !== value.currentFreshnessEvidence.freshnessFingerprint ||
        value.idempotencyKey !== value.replayRequest.idempotencyKey ||
        value.replayPolicy.mode !== value.replayRequest.replayPolicy.mode ||
        value.attemptedAt !== value.committedAt
      ) {
        context.addIssue({
          code: "custom",
          message: "Replay Attempt evidence bindings must agree",
          path: ["replayRequest"],
        });
      }
      if (
        (value.outcome === "rejected-expired") !==
        (value.expirationEvidence?.status === "expired-permanently-reserved")
      ) {
        context.addIssue({
          code: "custom",
          message: "Expired Replay outcomes require explicit permanent-reservation evidence",
          path: ["expirationEvidence"],
        });
      }
      const expected = {
        "accepted-original-result": {
          classification: "identical-replay",
          reasons: ["original_result_replayed"],
        },
        "rejected-single-delivery": {
          classification: "rejected-replay",
          reasons: ["single_delivery_replay_rejected"],
        },
        "rejected-expired": {
          classification: "rejected-replay",
          reasons: ["delivery_expired"],
        },
        "rejected-policy": {
          classification: "rejected-replay",
          reasons: ["policy_denied", "policy_not_evaluated", "policy_review_required"],
        },
        "rejected-freshness": {
          classification: "rejected-replay",
          reasons: ["freshness_rejected", "historical_replay_not_allowed", "newer_active_snapshot"],
        },
        "rejected-idempotency-conflict": {
          classification: "rejected-replay",
          reasons: ["idempotency_key_conflict"],
        },
        "evaluation-only": {
          classification: "evaluation-replay",
          reasons: ["evaluation_only"],
        },
        "integrity-failure": {
          classification: "rejected-replay",
          reasons: ["integrity_failure"],
        },
      } as const;
      const outcome = expected[value.outcome];
      if (
        value.replayClassification !== outcome.classification ||
        value.reasonCodes.length !== 1 ||
        !(outcome.reasons as readonly string[]).includes(value.reasonCodes[0]!)
      ) {
        context.addIssue({
          code: "custom",
          message: "Replay outcome, classification, and reason evidence must agree",
          path: ["outcome"],
        });
      }
    }),
);

export const DurableDeliveryLedgerEventSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("eventType", [
    z
      .object({
        schemaVersion: z.literal("1.0"),
        eventType: z.literal("original-delivery"),
        ledgerSequence: DurableDeliveryLedgerSequenceSchema,
        previousAuditFingerprint: DurableDeliveryPreviousAuditFingerprintSchema,
        transaction: CommittedDeliveryTransactionRecordSchema,
        auditFingerprint: Sha256DigestSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal("1.0"),
        eventType: z.literal("replay-attempt"),
        ledgerSequence: DurableDeliveryLedgerSequenceSchema,
        previousAuditFingerprint: DurableDeliveryPreviousAuditFingerprintSchema,
        replayAttempt: DurableReplayAttemptRecordSchema,
        auditFingerprint: Sha256DigestSchema,
      })
      .strict(),
  ]),
);

export const DurableDeliveryLedgerIssueCodeSchema = z.enum([
  "invalid_raw_record",
  "unsupported_version",
  "fingerprint_mismatch",
  "audit_chain_broken",
  "sequence_invalid",
  "transaction_incomplete",
  "transaction_conflict",
  "request_conflict",
  "artifact_conflict",
  "artifact_binding_mismatch",
  "idempotency_conflict",
  "orphan_replay_attempt",
  "contradictory_replay",
  "expiration_inconsistent",
  "derived_index_missing",
  "derived_index_invalid",
  "derived_index_mismatch",
  "unsafe_content",
  "resource_limit_exceeded",
  "storage_failure",
]);

export const DurableDeliveryLedgerIssueSchema = z
  .object({
    code: DurableDeliveryLedgerIssueCodeSchema,
    logicalLocation: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  })
  .strict();

export const DurableDeliveryDerivedIndexSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: z.literal("1.0"),
      retentionPolicyVersion: z.literal("bounded-latest-v1"),
      entryCapacity: z.number().int().positive(),
      verifiedThroughSequence: z.number().int().nonnegative(),
      verifiedAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      requestEntries: z.array(
        z.object({ deliveryRequestId: IdentifierSchema, transactionId: IdentifierSchema }).strict(),
      ),
      idempotencyEntries: z.array(
        z
          .object({
            idempotencyKey: z.string().min(8),
            transactionId: IdentifierSchema,
            requestFingerprint: Sha256DigestSchema,
            status: z.enum(["active", "expired-permanently-reserved"]),
          })
          .strict(),
      ),
      replayEntries: z.array(
        z
          .object({ replayAttemptId: IdentifierSchema, originalTransactionId: IdentifierSchema })
          .strict(),
      ),
      indexFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      for (const [field, entries] of [
        ["requestEntries", value.requestEntries],
        ["idempotencyEntries", value.idempotencyEntries],
        ["replayEntries", value.replayEntries],
      ] as const) {
        if (entries.length > value.entryCapacity)
          context.addIssue({
            code: "custom",
            message: "Derived index entries exceed the declared retention capacity",
            path: [field],
          });
      }
    }),
);

export const DurableDeliveryDerivedIndexStatusSchema = z.enum([
  "current",
  "missing",
  "invalid",
  "stale",
  "rebuilt",
]);

export const DeliveryLedgerRecoveryResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      schemaVersion: z.literal("1.0"),
      ledgerContractVersion: z.literal("1.0"),
      status: z.literal("recovered"),
      originalDeliveryTransactionCount: DurableDeliveryLedgerCountSchema,
      replayAttemptCount: DurableDeliveryLedgerCountSchema,
      activeIdempotencyOwnershipCount: DurableDeliveryLedgerCountSchema,
      expiredIdempotencyOwnershipCount: DurableDeliveryLedgerCountSchema,
      lastCommittedLedgerSequence: z.number().int().nonnegative(),
      lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      ledgerIntegrityFingerprint: Sha256DigestSchema,
      derivedIndexStatus: DurableDeliveryDerivedIndexStatusSchema,
      errors: z.tuple([]),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("1.0"),
      ledgerContractVersion: z.literal("1.0"),
      status: z.literal("failed"),
      originalDeliveryTransactionCount: DurableDeliveryLedgerCountSchema,
      replayAttemptCount: DurableDeliveryLedgerCountSchema,
      activeIdempotencyOwnershipCount: DurableDeliveryLedgerCountSchema,
      expiredIdempotencyOwnershipCount: DurableDeliveryLedgerCountSchema,
      lastCommittedLedgerSequence: z.number().int().nonnegative(),
      lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      ledgerIntegrityFingerprint: z.null(),
      derivedIndexStatus: DurableDeliveryDerivedIndexStatusSchema,
      errors: z.array(DurableDeliveryLedgerIssueSchema).min(1),
    })
    .strict(),
]);

export const DeliveryLedgerIntegrityVerificationResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      schemaVersion: z.literal("1.0"),
      status: z.literal("valid"),
      verifiedEventCount: DurableDeliveryLedgerCountSchema,
      verifiedOriginalTransactionCount: DurableDeliveryLedgerCountSchema,
      verifiedReplayAttemptCount: DurableDeliveryLedgerCountSchema,
      verifiedThroughSequence: z.number().int().nonnegative(),
      lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      ledgerIntegrityFingerprint: Sha256DigestSchema,
      derivedIndexStatus: DurableDeliveryDerivedIndexStatusSchema,
      issues: z.tuple([]),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("1.0"),
      status: z.literal("invalid"),
      verifiedEventCount: DurableDeliveryLedgerCountSchema,
      verifiedOriginalTransactionCount: DurableDeliveryLedgerCountSchema,
      verifiedReplayAttemptCount: DurableDeliveryLedgerCountSchema,
      verifiedThroughSequence: z.number().int().nonnegative(),
      lastAuditFingerprint: z.union([z.literal("genesis"), Sha256DigestSchema]),
      ledgerIntegrityFingerprint: z.null(),
      derivedIndexStatus: DurableDeliveryDerivedIndexStatusSchema,
      issues: z.array(DurableDeliveryLedgerIssueSchema).min(1),
    })
    .strict(),
]);

export const DeliveryLedgerDerivedIndexRebuildResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.enum(["rebuilt", "unchanged", "failed"]),
    verifiedThroughSequence: z.number().int().nonnegative(),
    indexFingerprint: Sha256DigestSchema.nullable(),
    requestEntryCount: DurableDeliveryLedgerCountSchema,
    idempotencyEntryCount: DurableDeliveryLedgerCountSchema,
    replayEntryCount: DurableDeliveryLedgerCountSchema,
    issues: z.array(DurableDeliveryLedgerIssueSchema),
  })
  .strict();

export type DurableDeliveryRequestRegistrationRecord = z.infer<
  typeof DurableDeliveryRequestRegistrationRecordSchema
>;
export type DurableDeliveryExpirationEvidence = z.infer<
  typeof DurableDeliveryExpirationEvidenceSchema
>;
export type DurableIdempotencyOwnershipRecord = z.infer<
  typeof DurableIdempotencyOwnershipRecordSchema
>;
export type DurableDeliveryArtifactRecord = z.infer<typeof DurableDeliveryArtifactRecordSchema>;
export type AtomicDeliveryTransactionRequest = z.infer<
  typeof AtomicDeliveryTransactionRequestSchema
>;
export type CommittedDeliveryTransactionRecord = z.infer<
  typeof CommittedDeliveryTransactionRecordSchema
>;
export type DurableReplayAttemptRecord = z.infer<typeof DurableReplayAttemptRecordSchema>;
export type DurableDeliveryLedgerEvent = z.infer<typeof DurableDeliveryLedgerEventSchema>;
export type DurableDeliveryLedgerIssue = z.infer<typeof DurableDeliveryLedgerIssueSchema>;
export type DurableDeliveryDerivedIndex = z.infer<typeof DurableDeliveryDerivedIndexSchema>;
export type GovernedContextDeliverySuccess = z.infer<typeof GovernedContextDeliverySuccessSchema>;
export type DeliveryLedgerRecoveryResult = z.infer<typeof DeliveryLedgerRecoveryResultSchema>;
export type DeliveryLedgerIntegrityVerificationResult = z.infer<
  typeof DeliveryLedgerIntegrityVerificationResultSchema
>;
export type DeliveryLedgerDerivedIndexRebuildResult = z.infer<
  typeof DeliveryLedgerDerivedIndexRebuildResultSchema
>;

export interface DurableContextDeliveryLedger {
  resolveDeliveryRequest(
    deliveryRequestId: string,
  ): Promise<z.infer<typeof GovernedContextDeliveryRequestSchema> | null>;
  resolveIdempotencyOwnership(
    idempotencyKey: string,
  ): Promise<DurableIdempotencyOwnershipRecord | null>;
  readOriginalDeliveryResult(
    transactionId: string,
  ): Promise<z.infer<typeof GovernedContextDeliverySuccessSchema> | null>;
  readDeliveryEnvelope(
    envelopeId: string,
  ): Promise<z.infer<typeof GovernedContextDeliveryEnvelopeSchema> | null>;
  readAcknowledgment(
    envelopeId: string,
  ): Promise<z.infer<typeof ContextConsumerAcknowledgmentSchema> | null>;
  readReceipt(receiptId: string): Promise<z.infer<typeof ContextDeliveryReceiptSchema> | null>;
  readReplayHistory(originalTransactionId: string): Promise<readonly DurableReplayAttemptRecord[]>;
  listCommittedOriginalDeliveries(): Promise<readonly CommittedDeliveryTransactionRecord[]>;
  recover(): Promise<DeliveryLedgerRecoveryResult>;
  verifyIntegrity(): Promise<DeliveryLedgerIntegrityVerificationResult>;
  rebuildDerivedIndexes(): Promise<DeliveryLedgerDerivedIndexRebuildResult>;
}
