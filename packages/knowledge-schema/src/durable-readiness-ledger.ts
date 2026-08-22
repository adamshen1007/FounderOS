import { z } from "zod";

import {
  DurableCanonicalJsonObjectSchema,
  DurableCanonicalJsonValueSchema,
} from "./canonical-json.js";
import { Sha256DigestSchema } from "./primitives.js";
import {
  AuthorizationDecisionEvidenceSchema,
  CircuitStateSchema,
  CostAndBudgetDecisionSchema,
  ObservabilityReadinessEvidenceSchema,
  ProductionProviderReadinessDecisionSchema,
  ProviderBoundedMetricSchema,
  ProviderBoundedTraceSchema,
  ProviderHealthEvidenceSchema,
  ProviderObservabilityRetentionEvidenceSchema,
  ProviderPublicErrorSchema,
  ProviderRateAndCapacityDecisionSchema,
  ProviderRequestPlanSchema,
  ProviderStructuredLogSchema,
} from "./provider-readiness.js";
import { ReasoningProviderCompatibilityResultSchema } from "./reasoning.js";

const VERSION = z.literal("1.0");
const IDENTIFIER = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
function isConfinedLogicalReference(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return (
    !/^file:/iu.test(normalized) &&
    !normalized.startsWith("/") &&
    !/^[A-Za-z]:\//u.test(normalized) &&
    !normalized.split("/").some((part) => part === "." || part === "..")
  );
}
const LOGICAL_REFERENCE = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u)
  .refine(isConfinedLogicalReference, "Expected a confined logical reference");
const COUNT = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const POSITIVE_SEQUENCE = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const M15_CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
export const ReadinessCanonicalUtcInstantSchema = z
  .string()
  .regex(
    M15_CANONICAL_UTC_INSTANT_PATTERN,
    "Expected a canonical Milestone 15 UTC instant with millisecond precision",
  )
  .refine((value) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
  }, "Expected a valid canonical Milestone 15 UTC instant");
export const M15_MAX_DERIVED_INDEX_ENTRIES = 10_000;
export const M15_MAX_RESULT_FINDINGS = 256;
export const M15_MAX_REASON_CODES = 64;
export const M15_MAX_DIFFERING_FIELD_PATHS = 64;
export const M15_MAX_GATE_TRACE_ENTRIES = 14;
export const M15_MAX_RETAINED_OBSERVABILITY_ITEMS = 10_000;
export const M15_MAX_LEDGER_EVENTS = 10_000;
export const M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES = 10_000;
export const M15_MAX_STAGING_ENTRIES = 10_000;
export const M15_MAX_QUARANTINE_ENTRIES = 10_000;
export const M15_MAX_CANONICAL_SOURCE_ROOTS = 64;
export const M15_DEFAULT_LIST_PAGE_SIZE = 100;
export const M15_MAX_LIST_PAGE_SIZE = 256;

function canonicalObject<T extends z.ZodRawShape>(
  shape: T,
): z.ZodPipe<typeof DurableCanonicalJsonValueSchema, z.ZodObject<T>> {
  return z
    .unknown()
    .superRefine(enforceM15CanonicalResourceBounds)
    .pipe(DurableCanonicalJsonValueSchema)
    .pipe(z.object(shape).strict() as never) as unknown as z.ZodPipe<
    typeof DurableCanonicalJsonValueSchema,
    z.ZodObject<T>
  >;
}

function enforceM15CanonicalResourceBounds(value: unknown, context: z.RefinementCtx): void {
  const stack: Array<{
    readonly value: unknown;
    readonly path: readonly PropertyKey[];
    readonly depth: number;
  }> = [{ value, path: [], depth: 0 }];
  let visitedNodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    visitedNodes += 1;
    if (visitedNodes > 100_000 || current.depth > 128) {
      context.addIssue({ code: "custom", message: "Milestone 15 canonical value is too complex" });
      return;
    }
    if (current.value !== null && typeof current.value === "object") {
      let keys: readonly PropertyKey[];
      let descriptors: Record<PropertyKey, PropertyDescriptor | undefined>;
      try {
        keys = Reflect.ownKeys(current.value);
        descriptors = Object.getOwnPropertyDescriptors(current.value) as Record<
          PropertyKey,
          PropertyDescriptor | undefined
        >;
      } catch {
        context.addIssue({ code: "custom", message: "Milestone 15 value inspection failed" });
        return;
      }
      if (keys.some((key) => typeof key !== "string")) {
        context.addIssue({ code: "custom", message: "Milestone 15 value contains a symbol key" });
        return;
      }
      const isArray = Array.isArray(current.value);
      const lengthDescriptor = descriptors.length;
      const childKeys = keys.filter((key) => key !== "length");
      const key = current.path.at(-1);
      const maximum =
        isArray &&
        typeof key === "string" &&
        /(?:reasonCodes|blockingReasonCodes|warningReasonCodes)$/u.test(key)
          ? M15_MAX_REASON_CODES
          : M15_MAX_RETAINED_OBSERVABILITY_ITEMS;
      const childCount = isArray ? lengthDescriptor?.value : childKeys.length;
      if (
        !Number.isSafeInteger(childCount) ||
        childCount < 0 ||
        childCount > maximum ||
        childKeys.length !== childCount
      ) {
        context.addIssue({
          code: "custom",
          path: current.path as (string | number)[],
          message: `Milestone 15 nested array exceeds its ${maximum}-item bound`,
        });
        return;
      }
      if (childKeys.length > 10_000) {
        context.addIssue({ code: "custom", message: "Milestone 15 object has too many members" });
        return;
      }
      for (const childKey of childKeys) {
        const descriptor = descriptors[childKey];
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          context.addIssue({ code: "custom", message: "Milestone 15 value has an accessor" });
          return;
        }
        stack.push({
          value: descriptor.value,
          path: [...current.path, isArray ? Number(childKey) : childKey],
          depth: current.depth + 1,
        });
      }
    }
  }
}

const enforceM15NestedArrayBounds = enforceM15CanonicalResourceBounds;

function enforceM15CanonicalUtcInstants(value: unknown, context: z.RefinementCtx): void {
  const stack: Array<{ readonly value: unknown; readonly path: readonly (string | number)[] }> = [
    { value, path: [] },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.value === null || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      const path = [...current.path, key];
      if (
        key.endsWith("At") &&
        typeof child === "string" &&
        !ReadinessCanonicalUtcInstantSchema.safeParse(child).success
      ) {
        context.addIssue({
          code: "custom",
          path,
          message: "Expected a canonical Milestone 15 UTC instant with millisecond precision",
        });
      }
      if (child !== null && typeof child === "object") stack.push({ value: child, path });
    }
  }
}

export const ReadinessLedgerContractVersionSchema = VERSION;
export const ReadinessLedgerIdentifierSchema = IDENTIFIER;
export const ReadinessLedgerLogicalReferenceSchema = LOGICAL_REFERENCE;

export const DurableReadinessAuthorityProjectionUnsignedV1Schema = canonicalObject({
  authorityProjectionContractVersion: VERSION,
  deliveryTransactionId: IDENTIFIER,
  deliveryTransactionFingerprint: Sha256DigestSchema,
  deliveryRequestId: IDENTIFIER,
  deliveryRequestFingerprint: Sha256DigestSchema,
  deliveryEnvelopeId: IDENTIFIER,
  deliveryEnvelopeFingerprint: Sha256DigestSchema,
  deliveryReceiptId: IDENTIFIER,
  deliveryReceiptFingerprint: Sha256DigestSchema,
  contextPackageId: IDENTIFIER,
  contextPackageFingerprint: Sha256DigestSchema,
  consumerId: IDENTIFIER,
  consumerDescriptorFingerprint: Sha256DigestSchema,
  invocationRequestId: IDENTIFIER,
  invocationRequestFingerprint: Sha256DigestSchema,
});
export const DurableReadinessAuthorityProjectionSchema = canonicalObject({
  ...DurableReadinessAuthorityProjectionUnsignedV1Schema.out.shape,
  authorityProjectionFingerprint: Sha256DigestSchema,
});

export const ReadinessEvaluatorConfigurationProjectionUnsignedV1Schema = canonicalObject({
  configurationBindingVersion: VERSION,
  adapterId: IDENTIFIER,
  adapterFingerprint: Sha256DigestSchema,
  providerFamilyReference: LOGICAL_REFERENCE,
  transportPolicyId: IDENTIFIER,
  transportPolicyFingerprint: Sha256DigestSchema,
  transportPolicyVersion: VERSION,
  observabilityPolicyVersion: VERSION,
  readinessEvaluatorContractVersion: VERSION,
});
export const ReadinessEvaluatorConfigurationProjectionSchema = canonicalObject({
  ...ReadinessEvaluatorConfigurationProjectionUnsignedV1Schema.out.shape,
  configurationProjectionFingerprint: Sha256DigestSchema,
});

export const ReadinessGateSchema = z.enum([
  "durable-delivery-and-invocation",
  "authorization",
  "adapter-descriptor",
  "credential-reference",
  "capability",
  "transport-policy-plan",
  "rate-and-capacity",
  "cost-and-budget",
  "circuit",
  "observability-redaction",
  "health",
  "request-plan",
  "readiness-decision",
  "stop-before-transport",
]);
export const ReadinessGateTraceEntrySchema = canonicalObject({
  order: POSITIVE_SEQUENCE,
  gate: ReadinessGateSchema,
  status: z.enum(["completed", "stopped"]),
  reasonCodes: z.array(LOGICAL_REFERENCE).max(M15_MAX_REASON_CODES),
});

const DurableObservabilityProjectionSchema = canonicalObject({
  projectionContractVersion: VERSION,
  structuredLog: ProviderStructuredLogSchema,
  metrics: z.array(ProviderBoundedMetricSchema).max(M15_MAX_RETAINED_OBSERVABILITY_ITEMS),
  traces: z.array(ProviderBoundedTraceSchema).max(M15_MAX_RETAINED_OBSERVABILITY_ITEMS),
  publicErrors: z.array(ProviderPublicErrorSchema).max(M15_MAX_RETAINED_OBSERVABILITY_ITEMS),
  readiness: ObservabilityReadinessEvidenceSchema,
});
export const DurableRedactedTransportCommitmentSchema = canonicalObject({
  schemaVersion: VERSION,
  adapterId: IDENTIFIER,
  adapterFingerprint: Sha256DigestSchema,
  providerFamilyReference: LOGICAL_REFERENCE,
  providerCapabilityId: IDENTIFIER,
  providerCapabilityFingerprint: Sha256DigestSchema,
  credentialReferenceId: IDENTIFIER,
  credentialReferenceFingerprint: Sha256DigestSchema,
  transportPolicyId: IDENTIFIER,
  transportPolicyFingerprint: Sha256DigestSchema,
  transportPolicyVersion: VERSION,
});
export const DurableReadinessEvidenceProjectionSchema = canonicalObject({
  projectionContractVersion: VERSION,
  authorization: AuthorizationDecisionEvidenceSchema.nullable(),
  compatibility: ReasoningProviderCompatibilityResultSchema.nullable(),
  transportPlan: DurableRedactedTransportCommitmentSchema.nullable(),
  rateAndCapacity: ProviderRateAndCapacityDecisionSchema.nullable(),
  costAndBudget: CostAndBudgetDecisionSchema.nullable(),
  circuit: CircuitStateSchema.nullable(),
  observability: DurableObservabilityProjectionSchema.nullable(),
  observabilityRetention: ProviderObservabilityRetentionEvidenceSchema.nullable(),
  health: ProviderHealthEvidenceSchema.nullable(),
  requestPlan: ProviderRequestPlanSchema.nullable(),
}).superRefine(enforceM15NestedArrayBounds);

export const CanonicalReadinessEvaluationPackageUnsignedV1Schema = canonicalObject({
  evaluationPackageContractVersion: VERSION,
  readinessInputFingerprint: Sha256DigestSchema,
  decision: ProductionProviderReadinessDecisionSchema,
  gateTrace: z.array(ReadinessGateTraceEntrySchema).min(1).max(M15_MAX_GATE_TRACE_ENTRIES),
  retainedEvidence: DurableReadinessEvidenceProjectionSchema,
  observabilityRetentionFingerprint: Sha256DigestSchema.nullable(),
  authorityProjectionFingerprint: Sha256DigestSchema,
  configurationProjectionFingerprint: Sha256DigestSchema,
  originalEvaluationTime: ReadinessCanonicalUtcInstantSchema,
});
export const CanonicalReadinessEvaluationPackageSchema = canonicalObject({
  ...CanonicalReadinessEvaluationPackageUnsignedV1Schema.out.shape,
  evaluationPackageFingerprint: Sha256DigestSchema,
})
  .superRefine(enforceM15NestedArrayBounds)
  .superRefine(enforceM15CanonicalUtcInstants);

export const ReadinessRegistrationRequestUnsignedV1Schema = canonicalObject({
  contractVersion: VERSION,
  registrationRequestId: IDENTIFIER,
  transactionId: IDENTIFIER,
  idempotencyKey: IDENTIFIER,
  requestedOwnershipId: IDENTIFIER,
  requestedRegistrationSemanticEventId: IDENTIFIER,
  requestedRegistrationAuditEntryId: IDENTIFIER,
  requestedRegistrationMarkerId: IDENTIFIER,
  authorityProjection: DurableReadinessAuthorityProjectionSchema,
  evaluatorConfigurationProjection: ReadinessEvaluatorConfigurationProjectionSchema,
  readinessInputFingerprint: Sha256DigestSchema,
  originalEvaluationTime: ReadinessCanonicalUtcInstantSchema,
  expectedEvaluationPackageFingerprint: Sha256DigestSchema.nullable(),
  expectedEvaluationPackage: CanonicalReadinessEvaluationPackageSchema.nullable(),
  submittedAt: ReadinessCanonicalUtcInstantSchema,
  expectedLedgerHeadFingerprint: Sha256DigestSchema,
}).superRefine((value, context) => {
  if (
    (value.expectedEvaluationPackage === null) !==
    (value.expectedEvaluationPackageFingerprint === null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["expectedEvaluationPackage"],
      message: "Expected package and fingerprint must both be present or absent",
    });
  }
  if (
    value.expectedEvaluationPackage !== null &&
    value.expectedEvaluationPackage.evaluationPackageFingerprint !==
      value.expectedEvaluationPackageFingerprint
  ) {
    context.addIssue({
      code: "custom",
      path: ["expectedEvaluationPackageFingerprint"],
      message: "Expected package fingerprint must match the package",
    });
  }
});
export const ReadinessRegistrationRequestSchema = canonicalObject({
  ...ReadinessRegistrationRequestUnsignedV1Schema.out.shape,
  registrationRequestFingerprint: Sha256DigestSchema,
}).superRefine((value, context) => {
  if (
    (value.expectedEvaluationPackage === null) !==
      (value.expectedEvaluationPackageFingerprint === null) ||
    (value.expectedEvaluationPackage !== null &&
      value.expectedEvaluationPackage.evaluationPackageFingerprint !==
        value.expectedEvaluationPackageFingerprint)
  ) {
    context.addIssue({
      code: "custom",
      path: ["expectedEvaluationPackageFingerprint"],
      message: "Expected package and fingerprint must match",
    });
  }
});

export const ReadinessIdempotencyOwnershipUnsignedV1Schema = canonicalObject({
  ownershipContractVersion: VERSION,
  ownershipId: IDENTIFIER,
  idempotencyKey: IDENTIFIER,
  registrationRequestId: IDENTIFIER,
  registrationRequestFingerprint: Sha256DigestSchema,
  transactionId: IDENTIFIER,
  readinessDecisionId: IDENTIFIER,
  readinessDecisionFingerprint: Sha256DigestSchema,
  registrationSemanticEventId: IDENTIFIER,
  registrationAuditEntryId: IDENTIFIER,
  registrationMarkerId: IDENTIFIER,
  evaluationPackageFingerprint: Sha256DigestSchema,
  deliveryTransactionId: IDENTIFIER,
  deliveryTransactionFingerprint: Sha256DigestSchema,
  invocationRequestId: IDENTIFIER,
  invocationRequestFingerprint: Sha256DigestSchema,
  adapterId: IDENTIFIER,
  adapterFingerprint: Sha256DigestSchema,
  configurationProjectionFingerprint: Sha256DigestSchema,
  authorityProjectionFingerprint: Sha256DigestSchema,
  ownershipLedgerSequence: POSITIVE_SEQUENCE,
  ownershipCreatedAt: ReadinessCanonicalUtcInstantSchema,
});
export const ReadinessIdempotencyOwnershipSchema = canonicalObject({
  ...ReadinessIdempotencyOwnershipUnsignedV1Schema.out.shape,
  ownershipFingerprint: Sha256DigestSchema,
});

export const CommittedReadinessEvaluationTransactionUnsignedV1Schema = canonicalObject({
  transactionContractVersion: VERSION,
  transactionId: IDENTIFIER,
  registrationRequest: ReadinessRegistrationRequestSchema,
  registrationRequestFingerprint: Sha256DigestSchema,
  ownership: ReadinessIdempotencyOwnershipSchema,
  ownershipFingerprint: Sha256DigestSchema,
  authorityProjection: DurableReadinessAuthorityProjectionSchema,
  evaluatorConfigurationProjection: ReadinessEvaluatorConfigurationProjectionSchema,
  adapterId: IDENTIFIER,
  adapterFingerprint: Sha256DigestSchema,
  providerFamilyReference: LOGICAL_REFERENCE,
  providerCapabilityId: IDENTIFIER,
  providerCapabilityFingerprint: Sha256DigestSchema,
  credentialReferenceId: IDENTIFIER,
  credentialReferenceFingerprint: Sha256DigestSchema,
  transportPolicyId: IDENTIFIER,
  transportPolicyFingerprint: Sha256DigestSchema,
  evaluationPackage: CanonicalReadinessEvaluationPackageSchema,
  originalEvaluationTime: ReadinessCanonicalUtcInstantSchema,
  submittedAt: ReadinessCanonicalUtcInstantSchema,
  committedAt: ReadinessCanonicalUtcInstantSchema,
});
export const CommittedReadinessEvaluationTransactionSchema = canonicalObject({
  ...CommittedReadinessEvaluationTransactionUnsignedV1Schema.out.shape,
  transactionFingerprint: Sha256DigestSchema,
});

export const ReadinessSemanticEventUnsignedV1Schema = canonicalObject({
  eventContractVersion: VERSION,
  semanticEventId: IDENTIFIER,
  eventCategory: z.literal("registration"),
  transactionId: IDENTIFIER,
  transactionFingerprint: Sha256DigestSchema,
  ownershipId: IDENTIFIER,
  ownershipFingerprint: Sha256DigestSchema,
});
export const ReadinessSemanticEventSchema = canonicalObject({
  ...ReadinessSemanticEventUnsignedV1Schema.out.shape,
  semanticEventFingerprint: Sha256DigestSchema,
});

export const ReadinessReplayRequestUnsignedV1Schema = canonicalObject({
  replayContractVersion: VERSION,
  replayIdempotencyKey: IDENTIFIER,
  replayRequestId: IDENTIFIER,
  requestedReplayAttemptId: IDENTIFIER,
  requestedReplaySemanticEventId: IDENTIFIER,
  requestedReplayAuditEntryId: IDENTIFIER,
  requestedReplayMarkerId: IDENTIFIER,
  originalTransactionId: IDENTIFIER,
  originalTransactionFingerprint: Sha256DigestSchema,
  suppliedAuthorityProjection: DurableReadinessAuthorityProjectionSchema,
  suppliedEvaluatorConfigurationProjection: ReadinessEvaluatorConfigurationProjectionSchema,
  readinessInputFingerprint: Sha256DigestSchema,
  originalEvaluationTime: ReadinessCanonicalUtcInstantSchema,
  replayEvaluatedAt: ReadinessCanonicalUtcInstantSchema,
  expectedLedgerHeadFingerprint: Sha256DigestSchema,
});
export const ReadinessReplayRequestSchema = canonicalObject({
  ...ReadinessReplayRequestUnsignedV1Schema.out.shape,
  replayRequestFingerprint: Sha256DigestSchema,
});

export const ReadinessHistoricalReconstructionStatusSchema = z.enum([
  "matched",
  "mismatched",
  "verification-failed",
  "not-assessed",
]);
const DurableReadinessHistoricalReconstructionStatusSchema =
  ReadinessHistoricalReconstructionStatusSchema.exclude(["not-assessed"]);
export const ReadinessHistoricalComparisonUnsignedV1Schema = canonicalObject({
  comparisonContractVersion: VERSION,
  originalEvaluationPackageFingerprint: Sha256DigestSchema,
  reconstructedEvaluationPackageFingerprint: Sha256DigestSchema.nullable(),
  historicalReconstructionStatus: DurableReadinessHistoricalReconstructionStatusSchema,
  differingFieldPaths: z.array(LOGICAL_REFERENCE).max(M15_MAX_DIFFERING_FIELD_PATHS),
  reasonCodes: z.array(LOGICAL_REFERENCE).max(M15_MAX_REASON_CODES),
});
export const ReadinessHistoricalComparisonSchema = canonicalObject({
  ...ReadinessHistoricalComparisonUnsignedV1Schema.out.shape,
  historicalComparisonFingerprint: Sha256DigestSchema,
});

export const ReadinessCurrentAdmissibilityStatusSchema = z.enum([
  "admissible",
  "authorization-expired",
  "authorization-denied",
  "authorization-review-required",
  "authorization-not-evaluated",
  "authorization-invalid-evidence",
  "authority-mismatch",
  "not-assessed",
]);
const DurableReadinessCurrentAdmissibilityStatusSchema =
  ReadinessCurrentAdmissibilityStatusSchema.exclude(["not-assessed"]);
export const ReadinessCurrentAdmissibilityUnsignedV1Schema = canonicalObject({
  admissibilityContractVersion: VERSION,
  originalAuthorizationFingerprint: Sha256DigestSchema,
  replayEvaluatedAt: ReadinessCanonicalUtcInstantSchema,
  currentAdmissibilityStatus: DurableReadinessCurrentAdmissibilityStatusSchema,
  reasonCodes: z.array(LOGICAL_REFERENCE).max(M15_MAX_REASON_CODES),
});
export const ReadinessCurrentAdmissibilitySchema = canonicalObject({
  ...ReadinessCurrentAdmissibilityUnsignedV1Schema.out.shape,
  currentAdmissibilityFingerprint: Sha256DigestSchema,
});

export const ReadinessReplayAttemptUnsignedV1Schema = canonicalObject({
  replayAttemptContractVersion: VERSION,
  replayAttemptId: IDENTIFIER,
  replayIdempotencyKey: IDENTIFIER,
  replayRequestId: IDENTIFIER,
  replayRequestFingerprint: Sha256DigestSchema,
  originalTransactionId: IDENTIFIER,
  originalTransactionFingerprint: Sha256DigestSchema,
  originalReadinessDecisionId: IDENTIFIER,
  originalReadinessDecisionFingerprint: Sha256DigestSchema,
  storedConfigurationProjectionFingerprint: Sha256DigestSchema,
  suppliedConfigurationProjectionFingerprint: Sha256DigestSchema,
  storedAuthorityProjectionFingerprint: Sha256DigestSchema,
  suppliedAuthorityProjectionFingerprint: Sha256DigestSchema,
  readinessInputFingerprint: Sha256DigestSchema,
  originalEvaluationTime: ReadinessCanonicalUtcInstantSchema,
  replayEvaluatedAt: ReadinessCanonicalUtcInstantSchema,
  reconstructedEvaluationPackageFingerprint: Sha256DigestSchema.nullable(),
  historicalComparison: ReadinessHistoricalComparisonSchema,
  currentAdmissibility: ReadinessCurrentAdmissibilitySchema,
  evidenceReasonCodes: z.array(LOGICAL_REFERENCE).max(M15_MAX_REASON_CODES),
});
export const ReadinessReplayAttemptSchema = canonicalObject({
  ...ReadinessReplayAttemptUnsignedV1Schema.out.shape,
  replayAttemptFingerprint: Sha256DigestSchema,
});

export const ReadinessReplaySemanticEventUnsignedV1Schema = canonicalObject({
  eventContractVersion: VERSION,
  semanticEventId: IDENTIFIER,
  eventCategory: z.literal("replay"),
  originalTransactionId: IDENTIFIER,
  originalTransactionFingerprint: Sha256DigestSchema,
  replayAttemptId: IDENTIFIER,
  replayAttemptFingerprint: Sha256DigestSchema,
});
export const ReadinessReplaySemanticEventSchema = canonicalObject({
  ...ReadinessReplaySemanticEventUnsignedV1Schema.out.shape,
  semanticEventFingerprint: Sha256DigestSchema,
});

export const ReadinessAuditEntryUnsignedV1Schema = canonicalObject({
  auditContractVersion: VERSION,
  auditEntryId: IDENTIFIER,
  ledgerSequence: POSITIVE_SEQUENCE,
  previousLedgerHeadFingerprint: Sha256DigestSchema,
  semanticEventId: IDENTIFIER,
  semanticEventFingerprint: Sha256DigestSchema,
  eventCategory: z.enum(["registration", "replay"]),
  subjectTransactionId: IDENTIFIER,
  subjectTransactionFingerprint: Sha256DigestSchema,
  recordedAt: ReadinessCanonicalUtcInstantSchema,
});
export const ReadinessAuditEntrySchema = canonicalObject({
  ...ReadinessAuditEntryUnsignedV1Schema.out.shape,
  auditEntryFingerprint: Sha256DigestSchema,
});

export const ReadinessGenesisCompleteHistoryUnsignedV1Schema = canonicalObject({
  historyContractVersion: VERSION,
  historyGeneration: z.literal(0),
  previousCompleteHistoryFingerprint: z.null(),
  totalAuthoritativeEventCount: z.literal(0),
});
export const ReadinessGenesisCompleteHistorySchema = canonicalObject({
  ...ReadinessGenesisCompleteHistoryUnsignedV1Schema.out.shape,
  completeHistoryFingerprint: Sha256DigestSchema,
});
export const ReadinessCompleteHistoryCommitmentUnsignedV1Schema = canonicalObject({
  historyContractVersion: VERSION,
  previousCompleteHistoryFingerprint: Sha256DigestSchema,
  auditSequence: POSITIVE_SEQUENCE,
  auditEntryFingerprint: Sha256DigestSchema,
  semanticEventFingerprint: Sha256DigestSchema,
});
export const ReadinessCompleteHistoryCommitmentSchema = canonicalObject({
  ...ReadinessCompleteHistoryCommitmentUnsignedV1Schema.out.shape,
  completeHistoryFingerprint: Sha256DigestSchema,
});

const LedgerHeadUnsignedShape = {
  headContractVersion: VERSION,
  headGeneration: COUNT,
  committedRegistrationCount: COUNT,
  committedReplayAttemptCount: COUNT,
  totalAuthoritativeEventCount: COUNT,
  lastCommittedLedgerSequence: COUNT,
  latestAuditEntryId: IDENTIFIER.nullable(),
  latestAuditEntryFingerprint: Sha256DigestSchema.nullable(),
  latestSemanticEventId: IDENTIFIER.nullable(),
  latestSemanticEventFingerprint: Sha256DigestSchema.nullable(),
  latestSubjectTransactionId: IDENTIFIER.nullable(),
  latestSubjectTransactionFingerprint: Sha256DigestSchema.nullable(),
  completeHistoryFingerprint: Sha256DigestSchema,
} as const;
function enforceLedgerHeadCoordinates(
  value: z.infer<ReturnType<typeof canonicalObject<typeof LedgerHeadUnsignedShape>>>,
  context: z.RefinementCtx,
): void {
  const latest = [
    value.latestAuditEntryId,
    value.latestAuditEntryFingerprint,
    value.latestSemanticEventId,
    value.latestSemanticEventFingerprint,
    value.latestSubjectTransactionId,
    value.latestSubjectTransactionFingerprint,
  ];
  if (value.headGeneration === 0) {
    if (
      value.committedRegistrationCount !== 0 ||
      value.committedReplayAttemptCount !== 0 ||
      value.totalAuthoritativeEventCount !== 0 ||
      value.lastCommittedLedgerSequence !== 0 ||
      latest.some((entry) => entry !== null)
    ) {
      context.addIssue({ code: "custom", message: "Genesis head coordinates must be zero/null" });
    }
  } else if (
    value.headGeneration !== value.totalAuthoritativeEventCount ||
    value.headGeneration !== value.lastCommittedLedgerSequence ||
    value.committedRegistrationCount + value.committedReplayAttemptCount !==
      value.totalAuthoritativeEventCount ||
    latest.some((entry) => entry === null)
  ) {
    context.addIssue({ code: "custom", message: "Event head coordinates are inconsistent" });
  }
}
export const ReadinessLedgerHeadUnsignedV1Schema = canonicalObject(
  LedgerHeadUnsignedShape,
).superRefine(enforceLedgerHeadCoordinates);
export const ReadinessLedgerHeadSchema = canonicalObject({
  ...LedgerHeadUnsignedShape,
  ledgerHeadFingerprint: Sha256DigestSchema,
}).superRefine(enforceLedgerHeadCoordinates);

const MarkerSharedShape = {
  markerContractVersion: VERSION,
  markerId: IDENTIFIER,
  markerGeneration: COUNT,
  committedRegistrationCount: COUNT,
  committedReplayAttemptCount: COUNT,
  totalAuthoritativeEventCount: COUNT,
  lastCommittedLedgerSequence: COUNT,
  subjectTransactionId: IDENTIFIER.nullable(),
  subjectTransactionFingerprint: Sha256DigestSchema.nullable(),
  semanticEventId: IDENTIFIER.nullable(),
  semanticEventFingerprint: Sha256DigestSchema.nullable(),
  auditEntryId: IDENTIFIER.nullable(),
  auditEntryFingerprint: Sha256DigestSchema.nullable(),
  completeHistoryFingerprint: Sha256DigestSchema,
  resultingLedgerHead: ReadinessLedgerHeadSchema,
  resultingLedgerHeadFingerprint: Sha256DigestSchema,
} as const;

export const ReadinessGenesisCommitMarkerUnsignedV1Schema = canonicalObject({
  ...MarkerSharedShape,
  markerId: z.literal("m15-genesis"),
  markerGeneration: z.literal(0),
  markerCategory: z.literal("genesis"),
  committedRegistrationCount: z.literal(0),
  committedReplayAttemptCount: z.literal(0),
  totalAuthoritativeEventCount: z.literal(0),
  lastCommittedLedgerSequence: z.literal(0),
  subjectTransactionId: z.null(),
  subjectTransactionFingerprint: z.null(),
  semanticEventId: z.null(),
  semanticEventFingerprint: z.null(),
  auditEntryId: z.null(),
  auditEntryFingerprint: z.null(),
});
export const ReadinessGenesisCommitMarkerSchema = canonicalObject({
  ...ReadinessGenesisCommitMarkerUnsignedV1Schema.out.shape,
  commitMarkerFingerprint: Sha256DigestSchema,
});

const EventMarkerSharedShape = {
  ...MarkerSharedShape,
  markerGeneration: POSITIVE_SEQUENCE,
  subjectTransactionId: IDENTIFIER,
  subjectTransactionFingerprint: Sha256DigestSchema,
  semanticEventId: IDENTIFIER,
  semanticEventFingerprint: Sha256DigestSchema,
  auditEntryId: IDENTIFIER,
  auditEntryFingerprint: Sha256DigestSchema,
} as const;
export const ReadinessRegistrationCommitMarkerUnsignedV1Schema = canonicalObject({
  ...EventMarkerSharedShape,
  markerCategory: z.literal("registration"),
  registrationRequestFingerprint: Sha256DigestSchema,
  configurationProjectionFingerprint: Sha256DigestSchema,
  authorityProjectionFingerprint: Sha256DigestSchema,
  evaluationPackageFingerprint: Sha256DigestSchema,
  ownershipFingerprint: Sha256DigestSchema,
  transactionFingerprint: Sha256DigestSchema,
  registrationSemanticEventFingerprint: Sha256DigestSchema,
});
export const ReadinessReplayCommitMarkerUnsignedV1Schema = canonicalObject({
  ...EventMarkerSharedShape,
  markerCategory: z.literal("replay"),
  originalTransactionFingerprint: Sha256DigestSchema,
  replayRequestFingerprint: Sha256DigestSchema,
  historicalComparisonFingerprint: Sha256DigestSchema,
  currentAdmissibilityFingerprint: Sha256DigestSchema,
  replayAttemptFingerprint: Sha256DigestSchema,
  replaySemanticEventFingerprint: Sha256DigestSchema,
});
export const ReadinessRegistrationCommitMarkerSchema = canonicalObject({
  ...ReadinessRegistrationCommitMarkerUnsignedV1Schema.out.shape,
  commitMarkerFingerprint: Sha256DigestSchema,
});
export const ReadinessReplayCommitMarkerSchema = canonicalObject({
  ...ReadinessReplayCommitMarkerUnsignedV1Schema.out.shape,
  commitMarkerFingerprint: Sha256DigestSchema,
});
export const ReadinessCommitMarkerSchema = z.union([
  ReadinessGenesisCommitMarkerSchema,
  ReadinessRegistrationCommitMarkerSchema,
  ReadinessReplayCommitMarkerSchema,
]);

export const ReadinessRegistrationLedgerEventSchema = canonicalObject({
  eventEnvelopeContractVersion: VERSION,
  category: z.literal("registration"),
  sequence: POSITIVE_SEQUENCE,
  registrationRequest: ReadinessRegistrationRequestSchema,
  ownership: ReadinessIdempotencyOwnershipSchema,
  transaction: CommittedReadinessEvaluationTransactionSchema,
  semanticEvent: ReadinessSemanticEventSchema,
  auditEntry: ReadinessAuditEntrySchema,
  completeHistory: ReadinessCompleteHistoryCommitmentSchema,
  commitMarker: ReadinessRegistrationCommitMarkerSchema,
});
export const ReadinessReplayLedgerEventSchema = canonicalObject({
  eventEnvelopeContractVersion: VERSION,
  category: z.literal("replay"),
  sequence: POSITIVE_SEQUENCE,
  replayRequest: ReadinessReplayRequestSchema,
  historicalComparison: ReadinessHistoricalComparisonSchema,
  currentAdmissibility: ReadinessCurrentAdmissibilitySchema,
  replayAttempt: ReadinessReplayAttemptSchema,
  semanticEvent: ReadinessReplaySemanticEventSchema,
  auditEntry: ReadinessAuditEntrySchema,
  completeHistory: ReadinessCompleteHistoryCommitmentSchema,
  commitMarker: ReadinessReplayCommitMarkerSchema,
});
export const ReadinessLedgerEventSchema = z.union([
  ReadinessRegistrationLedgerEventSchema,
  ReadinessReplayLedgerEventSchema,
]);

export const M15_DERIVED_INDEX_KINDS = [
  "transaction-id",
  "registration-request-id",
  "registration-idempotency-key",
  "ownership-id",
  "decision-id",
  "semantic-event-id",
  "audit-entry-id",
  "marker-id",
  "replay-idempotency-key",
  "replay-request-id",
  "replay-attempt-id",
  "invocation-id",
  "adapter-id",
  "transaction-replay-sequence",
] as const;
export const M15_MAX_DERIVED_INDEXES = M15_DERIVED_INDEX_KINDS.length;
export const ReadinessDerivedIndexKindSchema = z.enum(M15_DERIVED_INDEX_KINDS);
export const ReadinessDerivedIndexEntryUnsignedV1Schema = canonicalObject({
  indexKind: ReadinessDerivedIndexKindSchema,
  indexKey: IDENTIFIER,
  logicalCoordinates: DurableCanonicalJsonObjectSchema,
  authoritativeSubjectTransactionFingerprint: Sha256DigestSchema,
  authoritativeMarkerFingerprint: Sha256DigestSchema,
});
export const ReadinessDerivedIndexEntrySchema = canonicalObject({
  ...ReadinessDerivedIndexEntryUnsignedV1Schema.out.shape,
  derivedIndexEntryFingerprint: Sha256DigestSchema,
});
function enforceDerivedIndexCoordinates(
  value: {
    readonly entries: readonly { readonly derivedIndexEntryFingerprint: string }[];
    readonly orderedEntryFingerprints: readonly string[];
    readonly entryCount: number;
  },
  context: z.RefinementCtx,
): void {
  const expected = value.entries.map((entry) => entry.derivedIndexEntryFingerprint);
  if (
    value.entryCount !== value.entries.length ||
    value.orderedEntryFingerprints.length !== value.entries.length ||
    expected.some((fingerprint, index) => fingerprint !== value.orderedEntryFingerprints[index]) ||
    new Set(value.orderedEntryFingerprints).size !== value.orderedEntryFingerprints.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["orderedEntryFingerprints"],
      message: "Derived index counts and ordered fingerprints must exactly match entries",
    });
  }
}
export const ReadinessDerivedIndexUnsignedV1Schema = canonicalObject({
  indexContractVersion: VERSION,
  indexKind: ReadinessDerivedIndexKindSchema,
  sourceMarkerFingerprint: Sha256DigestSchema,
  sourceLedgerHeadFingerprint: Sha256DigestSchema,
  entries: z.array(ReadinessDerivedIndexEntrySchema).max(M15_MAX_DERIVED_INDEX_ENTRIES),
  orderedEntryFingerprints: z.array(Sha256DigestSchema).max(M15_MAX_DERIVED_INDEX_ENTRIES),
  entryCount: COUNT,
}).superRefine(enforceDerivedIndexCoordinates);
export const ReadinessDerivedIndexSchema = canonicalObject({
  ...ReadinessDerivedIndexUnsignedV1Schema.out.shape,
  derivedIndexFingerprint: Sha256DigestSchema,
}).superRefine(enforceDerivedIndexCoordinates);
export const ReadinessDerivedIndexCollectionSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .array(ReadinessDerivedIndexSchema)
    .max(M15_MAX_DERIVED_INDEXES)
    .superRefine((value, context) => {
      const kinds = value.map((index) => index.indexKind);
      if (
        new Set(kinds).size !== kinds.length ||
        kinds.some((kind, index) => index > 0 && kinds[index - 1]!.localeCompare(kind) >= 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Derived index snapshots must be unique and lexically ordered",
        });
      }
    }),
);

export const ReadinessDerivedStateStatusSchema = z.enum(["valid", "missing", "invalid"]);
export const ReadinessWriterLockInspectionResultSchema = canonicalObject({
  resultContractVersion: VERSION,
  status: z.enum(["none", "active", "inactive", "ambiguous"]),
  lockFingerprint: Sha256DigestSchema.nullable(),
  writerProcessId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  reason: z.enum(["writer-liveness-ambiguous", "writer-lock-invalid"]).nullable(),
}).superRefine((value, context) => {
  const lockExists = value.status !== "none";
  if (lockExists !== (value.lockFingerprint !== null) && value.status !== "ambiguous") {
    context.addIssue({ code: "custom", message: "Writer-lock identity does not match status" });
  }
  if (lockExists !== (value.writerProcessId !== null) && value.status !== "ambiguous") {
    context.addIssue({ code: "custom", message: "Writer process does not match status" });
  }
  if (value.status === "ambiguous" && value.reason === null) {
    context.addIssue({ code: "custom", message: "Ambiguous writer lock requires a reason" });
  }
  if (value.status !== "ambiguous" && value.reason !== null) {
    context.addIssue({ code: "custom", message: "Non-ambiguous writer lock cannot have a reason" });
  }
});

export const ReadinessWriterLockCleanupRequestSchema = canonicalObject({
  requestContractVersion: VERSION,
  lockFingerprint: Sha256DigestSchema,
  writerProcessId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  writerActive: z.literal(false),
});

export const ReadinessWriterLockCleanupResultSchema = canonicalObject({
  resultContractVersion: VERSION,
  status: z.enum(["cleaned", "not-cleaned"]),
  lockFingerprint: Sha256DigestSchema.nullable(),
  reason: z.enum(["writer-lock-not-found"]).nullable(),
}).superRefine((value, context) => {
  if (value.status === "cleaned" && (value.lockFingerprint === null || value.reason !== null)) {
    context.addIssue({ code: "custom", message: "Cleaned writer lock requires its fingerprint" });
  }
  if (value.status === "not-cleaned" && value.reason === null) {
    context.addIssue({ code: "custom", message: "Unchanged writer lock requires a reason" });
  }
});

export const READINESS_RESULT_REASON_TAXONOMY_VERSION = "1.0" as const;

export const READINESS_INTEGRITY_FINDING_CODES = [
  "genesis-corrupt",
  "genesis-initialization-incomplete",
  "ledger-uninitialized",
  "readiness-ledger-integrity-failure",
  "unsafe-filesystem-state",
] as const;

export const ReadinessIntegrityFindingCodeSchema = z.enum(READINESS_INTEGRITY_FINDING_CODES);

export const READINESS_REGISTRATION_REJECTED_REASON_CODES = [
  "append-failure",
  "concurrent-writer-conflict",
  "configuration-mismatch",
  "decision-id-conflict",
  "evaluation-package-mismatch",
  "evaluation-verification-failed",
  "idempotency-key-conflict",
  "invalid-input",
  "invalid-registration-input",
  "lock-unavailable",
  "operator-cleanup-required",
  "ownership-id-conflict",
  "registration-audit-entry-id-conflict",
  "registration-marker-id-conflict",
  "registration-request-id-conflict",
  "registration-semantic-event-id-conflict",
  "stale-expected-head",
  "transaction-id-conflict",
] as const;

export const READINESS_REGISTRATION_INTEGRITY_FAILED_REASON_CODES =
  READINESS_INTEGRITY_FINDING_CODES;

export const READINESS_REPLAY_NOT_RECORDED_REASON_CODES = [
  "append-failure",
  "genesis-corrupt",
  "genesis-initialization-incomplete",
  "invalid-input",
  "invalid-replay-input",
  "ledger-uninitialized",
  "lock-unavailable",
  "operator-cleanup-required",
  "original-transaction-not-found",
  "readiness-ledger-integrity-failure",
  "replay-attempt-id-conflict",
  "replay-audit-entry-id-conflict",
  "replay-idempotency-key-conflict",
  "replay-input-mismatch",
  "replay-marker-id-conflict",
  "replay-request-id-conflict",
  "replay-semantic-event-id-conflict",
  "stale-expected-head",
  "unsafe-filesystem-state",
] as const;

export const ReadinessRegistrationRejectedReasonSchema = z.enum(
  READINESS_REGISTRATION_REJECTED_REASON_CODES,
);
export const ReadinessRegistrationIntegrityFailedReasonSchema = z.enum(
  READINESS_REGISTRATION_INTEGRITY_FAILED_REASON_CODES,
);
export const ReadinessReplayNotRecordedReasonSchema = z.enum(
  READINESS_REPLAY_NOT_RECORDED_REASON_CODES,
);

export const READINESS_DERIVED_INDEX_REBUILD_FAILURE_REASON_CODES = [
  "derived-publication-failure",
  "genesis-corrupt",
  "genesis-initialization-incomplete",
  "ledger-uninitialized",
  "lock-unavailable",
  "operator-cleanup-required",
  "readiness-ledger-integrity-failure",
  "stale-expected-head",
  "unsafe-filesystem-state",
] as const;
export const ReadinessDerivedIndexRebuildFailureReasonSchema = z.enum(
  READINESS_DERIVED_INDEX_REBUILD_FAILURE_REASON_CODES,
);

export const ReadinessRegistrationResultSchema = z.union([
  canonicalObject({
    status: z.literal("committed"),
    transaction: CommittedReadinessEvaluationTransactionSchema,
    derivedStateStatus: ReadinessDerivedStateStatusSchema,
  }),
  canonicalObject({
    status: z.literal("idempotent-original-returned"),
    transaction: CommittedReadinessEvaluationTransactionSchema,
    derivedStateStatus: ReadinessDerivedStateStatusSchema,
  }),
  canonicalObject({
    status: z.literal("rejected"),
    transaction: z.null(),
    reason: ReadinessRegistrationRejectedReasonSchema,
  }),
  canonicalObject({
    status: z.literal("integrity-failed"),
    transaction: z.null(),
    reason: ReadinessRegistrationIntegrityFailedReasonSchema,
  }),
]);
export const ReadinessReplayAppendStatusSchema = z.enum(["appended", "not-appended"]);
export const ReadinessReplaySubmissionResultSchema = z.union([
  canonicalObject({
    status: z.literal("recorded"),
    replayAppendStatus: z.literal("appended"),
    replayAttempt: ReadinessReplayAttemptSchema,
    derivedStateStatus: ReadinessDerivedStateStatusSchema,
  }),
  canonicalObject({
    status: z.literal("idempotent-replay-returned"),
    replayAppendStatus: z.literal("not-appended"),
    replayAttempt: ReadinessReplayAttemptSchema,
    derivedStateStatus: ReadinessDerivedStateStatusSchema,
  }),
  canonicalObject({
    status: z.literal("not-recorded"),
    replayAppendStatus: z.literal("not-appended"),
    replayAttempt: z.null(),
    reason: ReadinessReplayNotRecordedReasonSchema,
  }),
]);
export const ReadinessRecoveryResultSchema = canonicalObject({
  resultContractVersion: VERSION,
  status: z.enum(["recovered", "empty", "failed"]),
  committedRegistrationCount: COUNT,
  committedReplayAttemptCount: COUNT,
  permanentIdempotencyOwnershipCount: COUNT,
  lastCommittedSequence: COUNT,
  latestAuditEntryId: IDENTIFIER.nullable(),
  latestAuditEntryFingerprint: Sha256DigestSchema.nullable(),
  latestSemanticEventId: IDENTIFIER.nullable(),
  latestSemanticEventFingerprint: Sha256DigestSchema.nullable(),
  latestSubjectTransactionId: IDENTIFIER.nullable(),
  latestSubjectTransactionFingerprint: Sha256DigestSchema.nullable(),
  completeHistoryFingerprint: Sha256DigestSchema.nullable(),
  authoritativeMarkerFingerprint: Sha256DigestSchema.nullable(),
  derivedIndexStatus: ReadinessDerivedStateStatusSchema,
  stagingOrphanCount: COUNT,
  installedUncommittedOrphanCount: COUNT,
  errors: z.array(ReadinessIntegrityFindingCodeSchema).max(M15_MAX_RESULT_FINDINGS),
}).superRefine((value, context) => {
  const success = value.status !== "failed";
  const totalEventCount = value.committedRegistrationCount + value.committedReplayAttemptCount;
  const latestEvidence = [
    value.latestAuditEntryId,
    value.latestAuditEntryFingerprint,
    value.latestSemanticEventId,
    value.latestSemanticEventFingerprint,
    value.latestSubjectTransactionId,
    value.latestSubjectTransactionFingerprint,
  ];
  if (
    success !== (value.errors.length === 0) ||
    success !== (value.completeHistoryFingerprint !== null) ||
    success !== (value.authoritativeMarkerFingerprint !== null) ||
    (success &&
      (value.permanentIdempotencyOwnershipCount !== totalEventCount ||
        value.lastCommittedSequence !== totalEventCount ||
        latestEvidence.some((item) => (totalEventCount === 0 ? item !== null : item === null)))) ||
    (value.status === "empty" &&
      (value.committedRegistrationCount !== 0 ||
        value.committedReplayAttemptCount !== 0 ||
        value.permanentIdempotencyOwnershipCount !== 0 ||
        value.lastCommittedSequence !== 0)) ||
    (value.status === "failed" &&
      (value.committedRegistrationCount !== 0 ||
        value.committedReplayAttemptCount !== 0 ||
        value.permanentIdempotencyOwnershipCount !== 0 ||
        value.lastCommittedSequence !== 0 ||
        latestEvidence.some((item) => item !== null)))
  ) {
    context.addIssue({
      code: "custom",
      message: "Recovery result status evidence is inconsistent",
    });
  }
});
export const ReadinessIntegrityResultSchema = canonicalObject({
  resultContractVersion: VERSION,
  status: z.enum(["valid", "invalid"]),
  verifiedMarkerFingerprint: Sha256DigestSchema.nullable(),
  verifiedRegistrationCount: COUNT,
  verifiedReplayAttemptCount: COUNT,
  verifiedTotalEventCount: COUNT,
  verifiedLastSequence: COUNT,
  verifiedLatestAuditEntryFingerprint: Sha256DigestSchema.nullable(),
  verifiedCompleteHistoryFingerprint: Sha256DigestSchema.nullable(),
  derivedIndexStatus: ReadinessDerivedStateStatusSchema,
  findings: z.array(ReadinessIntegrityFindingCodeSchema).max(M15_MAX_RESULT_FINDINGS),
}).superRefine((value, context) => {
  const valid = value.status === "valid";
  const totalEventCount = value.verifiedRegistrationCount + value.verifiedReplayAttemptCount;
  if (
    valid !== (value.findings.length === 0) ||
    valid !== (value.verifiedMarkerFingerprint !== null) ||
    valid !== (value.verifiedCompleteHistoryFingerprint !== null) ||
    (valid &&
      (value.verifiedTotalEventCount !== totalEventCount ||
        value.verifiedLastSequence !== totalEventCount ||
        (totalEventCount === 0) !== (value.verifiedLatestAuditEntryFingerprint === null))) ||
    (!valid &&
      (value.verifiedRegistrationCount !== 0 ||
        value.verifiedReplayAttemptCount !== 0 ||
        value.verifiedTotalEventCount !== 0 ||
        value.verifiedLastSequence !== 0 ||
        value.verifiedLatestAuditEntryFingerprint !== null))
  ) {
    context.addIssue({
      code: "custom",
      message: "Integrity result status evidence is inconsistent",
    });
  }
});
export const ReadinessDerivedIndexRebuildResultSchema = canonicalObject({
  resultContractVersion: VERSION,
  status: z.enum(["rebuilt", "not-rebuilt"]),
  sourceLedgerHeadFingerprint: Sha256DigestSchema.nullable(),
  rebuiltIndexCount: COUNT,
  reason: ReadinessDerivedIndexRebuildFailureReasonSchema.nullable(),
}).superRefine((value, context) => {
  if (
    (value.status === "rebuilt" &&
      (value.sourceLedgerHeadFingerprint === null || value.reason !== null)) ||
    (value.status === "not-rebuilt" &&
      (value.sourceLedgerHeadFingerprint !== null ||
        value.reason === null ||
        value.rebuiltIndexCount !== 0))
  ) {
    context.addIssue({
      code: "custom",
      message: "Derived-index rebuild result status evidence is inconsistent",
    });
  }
});

export const ReadinessListQuerySchema = canonicalObject({
  limit: z.number().int().positive().max(M15_MAX_LIST_PAGE_SIZE).optional(),
  afterSequence: POSITIVE_SEQUENCE.optional(),
});
export const ReadinessListPageMetadataSchema = canonicalObject({
  requestedLimit: z.number().int().positive().max(M15_MAX_LIST_PAGE_SIZE),
  returnedCount: z.number().int().nonnegative().max(M15_MAX_LIST_PAGE_SIZE),
  afterSequence: POSITIVE_SEQUENCE.nullable(),
  nextAfterSequence: POSITIVE_SEQUENCE.nullable(),
  hasMore: z.boolean(),
  sourceLedgerHeadFingerprint: Sha256DigestSchema,
  sourceLastSequence: COUNT,
});
export const ReadinessCommittedEvaluationListItemSchema = canonicalObject({
  ledgerSequence: POSITIVE_SEQUENCE,
  transaction: CommittedReadinessEvaluationTransactionSchema,
});
export const ReadinessReplayAttemptListItemSchema = canonicalObject({
  ledgerSequence: POSITIVE_SEQUENCE,
  replayAttempt: ReadinessReplayAttemptSchema,
});

function enforceReadinessListPage(
  value: {
    readonly items: readonly { readonly ledgerSequence: number }[];
    readonly page: {
      readonly requestedLimit: number;
      readonly returnedCount: number;
      readonly afterSequence: number | null;
      readonly nextAfterSequence: number | null;
      readonly hasMore: boolean;
      readonly sourceLastSequence: number;
    };
  },
  context: z.RefinementCtx,
): void {
  const sequences = value.items.map((item) => item.ledgerSequence);
  const last = sequences.at(-1) ?? null;
  if (
    value.page.returnedCount !== value.items.length ||
    value.items.length > value.page.requestedLimit ||
    sequences.some(
      (sequence, index) =>
        sequence <= (value.page.afterSequence ?? 0) ||
        sequence > value.page.sourceLastSequence ||
        (index > 0 && sequence <= sequences[index - 1]!),
    ) ||
    value.page.hasMore !== (value.page.nextAfterSequence !== null) ||
    (value.page.hasMore &&
      (value.items.length !== value.page.requestedLimit ||
        last === null ||
        value.page.nextAfterSequence !== last)) ||
    (!value.page.hasMore && value.page.nextAfterSequence !== null)
  ) {
    context.addIssue({ code: "custom", message: "Readiness list page metadata is inconsistent" });
  }
}
export const ReadinessCommittedEvaluationPageSchema = canonicalObject({
  resultContractVersion: VERSION,
  items: z.array(ReadinessCommittedEvaluationListItemSchema).max(M15_MAX_LIST_PAGE_SIZE),
  page: ReadinessListPageMetadataSchema,
}).superRefine(enforceReadinessListPage);
export const ReadinessReplayAttemptPageSchema = canonicalObject({
  resultContractVersion: VERSION,
  items: z.array(ReadinessReplayAttemptListItemSchema).max(M15_MAX_LIST_PAGE_SIZE),
  page: ReadinessListPageMetadataSchema,
}).superRefine(enforceReadinessListPage);

export type DurableReadinessAuthorityProjection = z.infer<
  typeof DurableReadinessAuthorityProjectionSchema
>;
export type ReadinessEvaluatorConfigurationProjection = z.infer<
  typeof ReadinessEvaluatorConfigurationProjectionSchema
>;
export type CanonicalReadinessEvaluationPackage = z.infer<
  typeof CanonicalReadinessEvaluationPackageSchema
>;
export type ReadinessRegistrationRequest = z.infer<typeof ReadinessRegistrationRequestSchema>;
export type ReadinessIdempotencyOwnership = z.infer<typeof ReadinessIdempotencyOwnershipSchema>;
export type CommittedReadinessEvaluationTransaction = z.infer<
  typeof CommittedReadinessEvaluationTransactionSchema
>;
export type ReadinessReplayRequest = z.infer<typeof ReadinessReplayRequestSchema>;
export type ReadinessHistoricalComparison = z.infer<typeof ReadinessHistoricalComparisonSchema>;
export type ReadinessCurrentAdmissibility = z.infer<typeof ReadinessCurrentAdmissibilitySchema>;
export type ReadinessReplayAttempt = z.infer<typeof ReadinessReplayAttemptSchema>;
export type ReadinessAuditEntry = z.infer<typeof ReadinessAuditEntrySchema>;
export type ReadinessGenesisCompleteHistory = z.infer<typeof ReadinessGenesisCompleteHistorySchema>;
export type ReadinessLedgerHead = z.infer<typeof ReadinessLedgerHeadSchema>;
export type ReadinessGenesisCommitMarker = z.infer<typeof ReadinessGenesisCommitMarkerSchema>;
export type ReadinessCommitMarker = z.infer<typeof ReadinessCommitMarkerSchema>;
export type ReadinessRegistrationLedgerEvent = z.infer<
  typeof ReadinessRegistrationLedgerEventSchema
>;
export type ReadinessReplayLedgerEvent = z.infer<typeof ReadinessReplayLedgerEventSchema>;
export type ReadinessLedgerEvent = z.infer<typeof ReadinessLedgerEventSchema>;
export type ReadinessDerivedIndex = z.infer<typeof ReadinessDerivedIndexSchema>;
export type ReadinessRegistrationResult = z.infer<typeof ReadinessRegistrationResultSchema>;
export type ReadinessWriterLockInspectionResult = z.infer<
  typeof ReadinessWriterLockInspectionResultSchema
>;
export type ReadinessWriterLockCleanupRequest = z.infer<
  typeof ReadinessWriterLockCleanupRequestSchema
>;
export type ReadinessWriterLockCleanupResult = z.infer<
  typeof ReadinessWriterLockCleanupResultSchema
>;
export type ReadinessReplaySubmissionResult = z.infer<typeof ReadinessReplaySubmissionResultSchema>;
export type ReadinessRecoveryResult = z.infer<typeof ReadinessRecoveryResultSchema>;
export type ReadinessIntegrityResult = z.infer<typeof ReadinessIntegrityResultSchema>;
export type ReadinessIntegrityFindingCode = z.infer<typeof ReadinessIntegrityFindingCodeSchema>;
export type ReadinessDerivedIndexRebuildResult = z.infer<
  typeof ReadinessDerivedIndexRebuildResultSchema
>;
export type ReadinessListQuery = z.input<typeof ReadinessListQuerySchema>;
export type ReadinessCommittedEvaluationPage = z.infer<
  typeof ReadinessCommittedEvaluationPageSchema
>;
export type ReadinessReplayAttemptPage = z.infer<typeof ReadinessReplayAttemptPageSchema>;

export interface DurableReadinessEvaluationLedger {
  verifyIntegrity(): Promise<ReadinessIntegrityResult>;
  recover(): Promise<ReadinessRecoveryResult>;
  readOriginalReadinessEvaluation(
    transactionId: string,
  ): Promise<CommittedReadinessEvaluationTransaction | null>;
  listCommittedReadinessEvaluations(
    query?: ReadinessListQuery,
  ): Promise<ReadinessCommittedEvaluationPage>;
  listReadinessReplayAttempts(
    transactionId: string,
    query?: ReadinessListQuery,
  ): Promise<ReadinessReplayAttemptPage>;
  readHead(): Promise<ReadinessLedgerHead>;
  rebuildDerivedIndexes(): Promise<ReadinessDerivedIndexRebuildResult>;
}
