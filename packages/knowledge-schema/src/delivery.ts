import { z } from "zod";

import {
  KnowledgeContextPackageSchema,
  KnowledgeContextRegistryBindingSchema,
  KnowledgeContextSnapshotBindingSchema,
} from "./context.js";
import {
  IdentifierSchema,
  IsoTemporalSchema,
  NonEmptyStringSchema,
  Sha256DigestSchema,
} from "./primitives.js";

function uniqueArray<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .refine((values) => new Set(values).size === values.length, "Values must be unique");
}

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1]! < value)
  );
}

function isSafeReference(value: string): boolean {
  return (
    !value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !/^[a-z]:\//iu.test(value) &&
    !/^file:/iu.test(value) &&
    !value.split("/").some((segment) => segment === ".." || segment === ".")
  );
}

function compareTemporal(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export const ContextDeliveryReferenceSchema = NonEmptyStringSchema.refine(
  isSafeReference,
  "Expected a path-private logical reference",
);

export const ContextConsumerTypeSchema = z.enum([
  "human-assisted-service",
  "internal-service",
  "reasoning-provider",
  "agent-runtime",
  "evaluation-harness",
]);

export const ContextConsumerCapabilitiesSchema = z
  .object({
    acceptedContextPackageVersions: uniqueArray(z.literal("1.0")).min(1),
    acceptedAssemblyPolicyVersions: uniqueArray(z.literal("1.0")).min(1),
    maxObjectCount: z.number().int().positive(),
    maxCanonicalCharacters: z.number().int().positive(),
    supportsProvenance: z.boolean(),
    supportsReplay: z.boolean(),
    supportsReceipts: z.boolean(),
    acceptsTruncatedContent: z.boolean(),
    acceptsEmptyPackages: z.boolean(),
  })
  .strict();

export const ContextConsumerDescriptorSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    consumerId: IdentifierSchema,
    consumerType: ContextConsumerTypeSchema,
    displayName: NonEmptyStringSchema,
    owningSystem: ContextDeliveryReferenceSchema,
    purpose: NonEmptyStringSchema,
    capabilities: ContextConsumerCapabilitiesSchema,
    policySubjectReference: ContextDeliveryReferenceSchema,
    descriptorFingerprint: Sha256DigestSchema,
  })
  .strict();

export const ContextDeliveryCapabilityRequirementsSchema = z
  .object({
    requireProvenance: z.boolean(),
    requireReplay: z.boolean(),
    requireReceipt: z.boolean(),
  })
  .strict();

export const ContextDeliveryDataClassificationSchema = z.enum([
  "public",
  "internal",
  "confidential",
  "restricted",
]);

export const ContextDeliveryPolicyInputSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    subjectReference: ContextDeliveryReferenceSchema,
    consumerReference: IdentifierSchema,
    contextPackageReference: z
      .object({
        contextPackageId: IdentifierSchema,
        contextFingerprint: Sha256DigestSchema,
      })
      .strict(),
    activeSnapshotReference: z
      .object({
        snapshotId: IdentifierSchema,
        activationSequence: z.number().int().nonnegative(),
      })
      .strict(),
    intendedPurpose: NonEmptyStringSchema,
    projectScope: uniqueArray(IdentifierSchema).default([]),
    domainScope: uniqueArray(NonEmptyStringSchema).default([]),
    dataClassification: ContextDeliveryDataClassificationSchema,
    requestedOperation: z.literal("context_delivery"),
    requiredGovernanceApprovalReference: ContextDeliveryReferenceSchema.optional(),
    requestTimestamp: IsoTemporalSchema,
  })
  .strict();

export const ContextDeliveryPolicyOutcomeSchema = z.enum([
  "allowed",
  "denied",
  "review-required",
  "not-evaluated",
]);

export const ContextDeliveryPolicyReasonCodeSchema = z.enum([
  "policy_allowed",
  "policy_denied",
  "policy_review_required",
  "policy_not_evaluated",
  "governance_approval_missing",
  "scope_not_approved",
]);

export const ContextDeliveryPolicyDecisionEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    decisionId: IdentifierSchema,
    decisionVersion: z.literal("1.0"),
    inputFingerprint: Sha256DigestSchema,
    deliveryRequestId: IdentifierSchema,
    deliveryRequestFingerprint: Sha256DigestSchema,
    outcome: ContextDeliveryPolicyOutcomeSchema,
    contextPackageId: IdentifierSchema,
    contextPackageFingerprint: Sha256DigestSchema,
    consumerId: IdentifierSchema,
    consumerDescriptorFingerprint: Sha256DigestSchema,
    intendedPurpose: NonEmptyStringSchema,
    decisionAuthorityReference: ContextDeliveryReferenceSchema,
    reasonCodes: z.array(ContextDeliveryPolicyReasonCodeSchema).min(1),
    decidedAt: IsoTemporalSchema,
    expiresAt: IsoTemporalSchema.optional(),
    decisionFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isSortedUnique(value.reasonCodes)) {
      context.addIssue({
        code: "custom",
        message: "Policy reason codes must be unique and sorted",
        path: ["reasonCodes"],
      });
    }
    const requiredReason: Record<z.infer<typeof ContextDeliveryPolicyOutcomeSchema>, string> = {
      allowed: "policy_allowed",
      denied: "policy_denied",
      "review-required": "policy_review_required",
      "not-evaluated": "policy_not_evaluated",
    };
    if (!value.reasonCodes.includes(requiredReason[value.outcome] as never)) {
      context.addIssue({
        code: "custom",
        message: "Policy outcome must carry its matching stable reason code",
        path: ["reasonCodes"],
      });
    }
    const outcomeReasons = Object.values(requiredReason).filter((reason) =>
      value.reasonCodes.includes(reason as never),
    );
    if (outcomeReasons.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Policy evidence must contain exactly one outcome reason code",
        path: ["reasonCodes"],
      });
    }
    if (value.outcome === "allowed" && value.reasonCodes.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Allowed policy evidence cannot carry denial or review reasons",
        path: ["reasonCodes"],
      });
    }
    if (value.expiresAt !== undefined && compareTemporal(value.expiresAt, value.decidedAt) <= 0) {
      context.addIssue({
        code: "custom",
        message: "Policy expiration must be after the decision timestamp",
        path: ["expiresAt"],
      });
    }
  });

export const ContextDeliveryFreshnessPolicySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    notBefore: IsoTemporalSchema.optional(),
    expiresAt: IsoTemporalSchema.optional(),
    maxAgeSeconds: z.number().int().positive().optional(),
    invalidateOnNewerActiveSnapshot: z.boolean(),
    allowHistoricalReplay: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.notBefore !== undefined &&
      value.expiresAt !== undefined &&
      compareTemporal(value.expiresAt, value.notBefore) <= 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Freshness expiration must be after not-before evidence",
        path: ["expiresAt"],
      });
    }
    if (value.invalidateOnNewerActiveSnapshot && value.allowHistoricalReplay) {
      context.addIssue({
        code: "custom",
        message: "A freshness policy cannot both invalidate and allow historical replay",
        path: ["allowHistoricalReplay"],
      });
    }
  });

export const ContextDeliveryReplayModeSchema = z.enum([
  "single-delivery",
  "repeatable-identical",
  "repeatable-until-expiration",
  "evaluation-only",
]);

export const ContextDeliveryReplayPolicySchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    mode: ContextDeliveryReplayModeSchema,
  })
  .strict();

export const ContextDeliveryRequestActorSchema = z
  .object({
    actorId: IdentifierSchema,
    actorType: z.enum(["human", "service", "system"]),
  })
  .strict();

export const GovernedContextDeliveryRequestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    deliveryRequestId: IdentifierSchema,
    contextPackageId: IdentifierSchema,
    contextPackageFingerprint: Sha256DigestSchema,
    consumer: ContextConsumerDescriptorSchema,
    consumerDescriptorFingerprint: Sha256DigestSchema,
    purpose: NonEmptyStringSchema,
    capabilityRequirements: ContextDeliveryCapabilityRequirementsSchema,
    policyInput: ContextDeliveryPolicyInputSchema,
    freshnessPolicy: ContextDeliveryFreshnessPolicySchema,
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u, "Invalid idempotency key"),
    replayPolicy: ContextDeliveryReplayPolicySchema,
    requestActor: ContextDeliveryRequestActorSchema,
    reason: NonEmptyStringSchema,
    requestedAt: IsoTemporalSchema,
    requestFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const policy = value.policyInput;
    if (
      value.consumerDescriptorFingerprint !== value.consumer.descriptorFingerprint ||
      policy.consumerReference !== value.consumer.consumerId
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery request consumer bindings must agree",
        path: ["consumerDescriptorFingerprint"],
      });
    }
    if (
      policy.contextPackageReference.contextPackageId !== value.contextPackageId ||
      policy.contextPackageReference.contextFingerprint !== value.contextPackageFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "Policy input must bind the requested Context Package",
        path: ["policyInput", "contextPackageReference"],
      });
    }
    if (
      policy.subjectReference !== value.consumer.policySubjectReference ||
      policy.intendedPurpose !== value.purpose ||
      policy.requestTimestamp !== value.requestedAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Policy subject, purpose, and timestamp must match the delivery request",
        path: ["policyInput"],
      });
    }
    if (
      value.replayPolicy.mode === "repeatable-until-expiration" &&
      value.freshnessPolicy.expiresAt === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Repeatable-until-expiration requires explicit expiration evidence",
        path: ["freshnessPolicy", "expiresAt"],
      });
    }
    if (
      value.replayPolicy.mode === "evaluation-only" &&
      value.consumer.consumerType !== "evaluation-harness"
    ) {
      context.addIssue({
        code: "custom",
        message: "Evaluation-only replay requires an evaluation-harness consumer",
        path: ["replayPolicy", "mode"],
      });
    }
  });

export const ContextConsumerCompatibilityReasonCodeSchema = z.enum([
  "context_package_version_unsupported",
  "assembly_policy_version_unsupported",
  "object_count_exceeded",
  "character_count_exceeded",
  "truncated_content_unsupported",
  "empty_package_unsupported",
  "provenance_unsupported",
  "replay_unsupported",
  "receipt_unsupported",
]);

const ContextConsumerCompatibilityValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(z.string()),
]);

export const ContextConsumerCompatibilityMismatchSchema = z
  .object({
    field: NonEmptyStringSchema,
    reason: ContextConsumerCompatibilityReasonCodeSchema,
    expected: ContextConsumerCompatibilityValueSchema,
    actual: ContextConsumerCompatibilityValueSchema,
  })
  .strict();

export const ContextConsumerCompatibilityResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.enum(["compatible", "incompatible"]),
    reasonCodes: z.array(ContextConsumerCompatibilityReasonCodeSchema),
    mismatches: z.array(ContextConsumerCompatibilityMismatchSchema),
    consumerDescriptorFingerprint: Sha256DigestSchema,
    contextPackageFingerprint: Sha256DigestSchema,
    compatibilityFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !isSortedUnique(value.reasonCodes) ||
      value.mismatches.some(
        (mismatch, index) =>
          index > 0 &&
          `${value.mismatches[index - 1]!.field}\0${value.mismatches[index - 1]!.reason}` >=
            `${mismatch.field}\0${mismatch.reason}`,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Compatibility reasons and mismatches must be unique and sorted",
        path: ["reasonCodes"],
      });
    }
    if (
      (value.status === "compatible") !==
        (value.reasonCodes.length === 0 && value.mismatches.length === 0) ||
      value.reasonCodes.some(
        (reason) => !value.mismatches.some((mismatch) => mismatch.reason === reason),
      ) ||
      value.mismatches.some((mismatch) => !value.reasonCodes.includes(mismatch.reason))
    ) {
      context.addIssue({
        code: "custom",
        message: "Compatibility status, reasons, and mismatches must agree",
        path: ["status"],
      });
    }
  });

export const ContextDeliveryFreshnessReasonCodeSchema = z.enum([
  "request_not_yet_valid",
  "request_expired",
  "policy_evidence_expired",
  "policy_decision_not_yet_valid",
  "maximum_age_exceeded",
  "newer_active_snapshot",
  "historical_replay_not_allowed",
  "timestamp_evidence_missing",
  "timestamp_evidence_invalid",
]);

export const ContextDeliveryFreshnessEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.enum(["fresh", "stale"]),
    evaluatedAt: IsoTemporalSchema,
    packageSnapshotId: IdentifierSchema,
    packageActivationSequence: z.number().int().nonnegative(),
    currentActiveSnapshotId: IdentifierSchema,
    currentActivationSequence: z.number().int().nonnegative(),
    packageAgeSeconds: z.number().int().nonnegative().nullable(),
    historicalReplay: z.boolean(),
    reasonCodes: z.array(ContextDeliveryFreshnessReasonCodeSchema),
    freshnessFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isSortedUnique(value.reasonCodes)) {
      context.addIssue({
        code: "custom",
        message: "Freshness reason codes must be unique and sorted",
        path: ["reasonCodes"],
      });
    }
    if ((value.status === "fresh") !== (value.reasonCodes.length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Freshness status and reasons must agree",
        path: ["status"],
      });
    }
  });

export const GovernedContextDeliveryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    deliveryEnvelopeId: IdentifierSchema,
    deliveryRequestId: IdentifierSchema,
    deliveryRequestFingerprint: Sha256DigestSchema,
    contextPackageId: IdentifierSchema,
    contextPackageFingerprint: Sha256DigestSchema,
    contextPackage: KnowledgeContextPackageSchema,
    consumerId: IdentifierSchema,
    consumerDescriptorFingerprint: Sha256DigestSchema,
    deliveryPurpose: NonEmptyStringSchema,
    activeSnapshotBinding: KnowledgeContextSnapshotBindingSchema,
    registryIntegrityBinding: KnowledgeContextRegistryBindingSchema,
    compatibility: ContextConsumerCompatibilityResultSchema,
    policyDecisionEvidence: ContextDeliveryPolicyDecisionEvidenceSchema,
    freshnessEvidence: ContextDeliveryFreshnessEvidenceSchema,
    idempotencyKey: z.string().min(8),
    replayPolicy: ContextDeliveryReplayPolicySchema,
    deliverySequence: z.number().int().positive(),
    createdAt: IsoTemporalSchema,
    deliveryFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.deliveryEnvelopeId !== `delivery-${value.deliveryFingerprint}`) {
      context.addIssue({
        code: "custom",
        message: "Delivery Envelope ID must derive from its fingerprint",
        path: ["deliveryEnvelopeId"],
      });
    }
    if (
      value.contextPackageId !== value.contextPackage.contextPackageId ||
      value.contextPackageFingerprint !== value.contextPackage.contextFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery Envelope package and request bindings are invalid",
        path: ["contextPackageId"],
      });
    }
    if (
      JSON.stringify(value.activeSnapshotBinding) !==
        JSON.stringify(value.contextPackage.snapshotBinding) ||
      JSON.stringify(value.registryIntegrityBinding) !==
        JSON.stringify(value.contextPackage.registryBinding)
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery Envelope must preserve exact Context Package governance bindings",
        path: ["activeSnapshotBinding"],
      });
    }
    if (
      value.compatibility.status !== "compatible" ||
      value.compatibility.consumerDescriptorFingerprint !== value.consumerDescriptorFingerprint ||
      value.compatibility.contextPackageFingerprint !== value.contextPackageFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery Envelope requires a matching compatible Consumer result",
        path: ["compatibility"],
      });
    }
    if (
      value.policyDecisionEvidence.outcome !== "allowed" ||
      value.policyDecisionEvidence.deliveryRequestId !== value.deliveryRequestId ||
      value.policyDecisionEvidence.deliveryRequestFingerprint !==
        value.deliveryRequestFingerprint ||
      value.policyDecisionEvidence.contextPackageId !== value.contextPackageId ||
      value.policyDecisionEvidence.contextPackageFingerprint !== value.contextPackageFingerprint ||
      value.policyDecisionEvidence.consumerId !== value.consumerId ||
      value.policyDecisionEvidence.consumerDescriptorFingerprint !==
        value.consumerDescriptorFingerprint ||
      value.freshnessEvidence.status !== "fresh"
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery Envelope requires matching allowed and fresh evidence",
        path: ["policyDecisionEvidence"],
      });
    }
    if (
      value.freshnessEvidence.packageSnapshotId !==
        value.contextPackage.snapshotBinding.activeSnapshotId ||
      value.createdAt !== value.freshnessEvidence.evaluatedAt ||
      compareTemporal(value.policyDecisionEvidence.decidedAt, value.createdAt) > 0 ||
      (value.policyDecisionEvidence.expiresAt !== undefined &&
        compareTemporal(value.policyDecisionEvidence.expiresAt, value.createdAt) <= 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Delivery Envelope freshness and policy time evidence must bind the package and creation evidence",
        path: ["freshnessEvidence"],
      });
    }
  });

export const ContextConsumerAcknowledgmentStatusSchema = z.enum(["accepted", "rejected"]);
export const ContextConsumerAcknowledgmentSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    consumerId: IdentifierSchema,
    deliveryEnvelopeId: IdentifierSchema,
    deliveryEnvelopeFingerprint: Sha256DigestSchema,
    status: ContextConsumerAcknowledgmentStatusSchema,
    acknowledgedAt: IsoTemporalSchema,
    reasonCodes: z.array(NonEmptyStringSchema),
    acknowledgmentFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isSortedUnique(value.reasonCodes)) {
      context.addIssue({
        code: "custom",
        message: "Acknowledgment reason codes must be unique and sorted",
        path: ["reasonCodes"],
      });
    }
    if (
      (value.status === "accepted" && value.reasonCodes.length > 0) ||
      (value.status === "rejected" && value.reasonCodes.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Acknowledgment status and reason evidence must agree",
        path: ["reasonCodes"],
      });
    }
  });

export const ContextDeliveryStatusSchema = z.enum([
  "accepted",
  "rejected",
  "expired",
  "duplicate",
  "policy-denied",
  "capability-mismatch",
  "integrity-failure",
]);

export const ContextDeliveryReplayClassificationSchema = z.enum([
  "initial-delivery",
  "identical-replay",
  "evaluation-replay",
]);

export const ContextDeliveryReceiptSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    receiptId: IdentifierSchema,
    deliveryEnvelopeId: IdentifierSchema,
    deliveryEnvelopeFingerprint: Sha256DigestSchema,
    contextPackageId: IdentifierSchema,
    contextPackageFingerprint: Sha256DigestSchema,
    consumerId: IdentifierSchema,
    consumerDescriptorFingerprint: Sha256DigestSchema,
    deliveryStatus: ContextDeliveryStatusSchema,
    deliverySequence: z.number().int().positive(),
    receivedAt: IsoTemporalSchema,
    idempotencyKey: z.string().min(8),
    replayClassification: z.literal("initial-delivery"),
    consumerAcknowledgmentFingerprint: Sha256DigestSchema,
    receiptFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.receiptId !== `receipt-${value.receiptFingerprint}`) {
      context.addIssue({
        code: "custom",
        message: "Receipt ID must derive from its fingerprint",
        path: ["receiptId"],
      });
    }
  });

export const ContextDeliveryReplayEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    replayClassification: z.enum(["identical-replay", "evaluation-replay"]),
    deliveryRequestId: IdentifierSchema,
    deliveryRequestFingerprint: Sha256DigestSchema,
    originalDeliveryEnvelopeId: IdentifierSchema,
    originalDeliveryEnvelopeFingerprint: Sha256DigestSchema,
    originalReceiptId: IdentifierSchema,
    originalReceiptFingerprint: Sha256DigestSchema,
    idempotencyKey: z.string().min(8),
    policyDecisionFingerprint: Sha256DigestSchema,
    freshnessFingerprint: Sha256DigestSchema,
    replayedAt: IsoTemporalSchema,
    replayFingerprint: Sha256DigestSchema,
  })
  .strict();

export const ContextConsumptionEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    consumptionId: IdentifierSchema,
    receiptId: IdentifierSchema,
    consumerOperationReference: ContextDeliveryReferenceSchema,
    startedAt: IsoTemporalSchema,
    completedAt: IsoTemporalSchema.optional(),
    resultEvidenceReference: ContextDeliveryReferenceSchema.optional(),
    failureReason: NonEmptyStringSchema.optional(),
    consumptionFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.completedAt !== undefined &&
      compareTemporal(value.completedAt, value.startedAt) < 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Consumption completion cannot precede its start",
        path: ["completedAt"],
      });
    }
    if (value.resultEvidenceReference !== undefined && value.failureReason !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Consumption evidence cannot contain both result and failure evidence",
        path: ["failureReason"],
      });
    }
  });

export const ContextDeliveryIssueCodeSchema = z.enum([
  "invalid_consumer_descriptor",
  "invalid_delivery_request",
  "context_package_integrity_failure",
  "context_package_binding_mismatch",
  "consumer_capability_mismatch",
  "missing_policy_evidence",
  "policy_evidence_invalid",
  "policy_denied",
  "policy_review_required",
  "policy_not_evaluated",
  "freshness_invalid",
  "request_not_yet_valid",
  "request_expired",
  "policy_evidence_expired",
  "policy_decision_not_yet_valid",
  "maximum_age_exceeded",
  "newer_active_snapshot",
  "historical_replay_not_allowed",
  "timestamp_evidence_missing",
  "timestamp_evidence_invalid",
  "idempotency_key_conflict",
  "single_delivery_replay_rejected",
  "replay_not_supported",
  "unsafe_delivery_content",
  "consumer_acknowledgment_invalid",
]);

export const ContextDeliveryIssueSchema = z
  .object({
    code: ContextDeliveryIssueCodeSchema,
    path: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  })
  .strict();

export const ContextDeliveryAttemptEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    deliveryRequestId: IdentifierSchema.nullable(),
    contextPackageId: IdentifierSchema.nullable(),
    consumerId: IdentifierSchema.nullable(),
    evaluatedAt: IsoTemporalSchema,
    deliveryStatus: ContextDeliveryStatusSchema,
    reasonCodes: z.array(ContextDeliveryIssueCodeSchema).min(1),
    issues: z.array(ContextDeliveryIssueSchema).min(1),
    attemptFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isSortedUnique(value.reasonCodes)) {
      context.addIssue({
        code: "custom",
        message: "Attempt reason codes must be unique and sorted",
        path: ["reasonCodes"],
      });
    }
    const issueReasons = [...new Set(value.issues.map((issue) => issue.code))].sort();
    if (
      JSON.stringify(issueReasons) !== JSON.stringify(value.reasonCodes) ||
      value.issues.some(
        (issue, index) =>
          index > 0 &&
          `${value.issues[index - 1]!.code}\0${value.issues[index - 1]!.path}\0${value.issues[index - 1]!.message}` >=
            `${issue.code}\0${issue.path}\0${issue.message}`,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Attempt issues and reason codes must be complete, unique, and sorted",
        path: ["issues"],
      });
    }
  });

export const GovernedContextDeliverySuccessSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("delivered"),
    envelope: GovernedContextDeliveryEnvelopeSchema,
    acknowledgment: ContextConsumerAcknowledgmentSchema,
    receipt: ContextDeliveryReceiptSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const envelope = value.envelope;
    const acknowledgment = value.acknowledgment;
    const receipt = value.receipt;
    if (
      acknowledgment.consumerId !== envelope.consumerId ||
      acknowledgment.deliveryEnvelopeId !== envelope.deliveryEnvelopeId ||
      acknowledgment.deliveryEnvelopeFingerprint !== envelope.deliveryFingerprint ||
      acknowledgment.status !== "accepted" ||
      receipt.deliveryEnvelopeId !== envelope.deliveryEnvelopeId ||
      receipt.deliveryEnvelopeFingerprint !== envelope.deliveryFingerprint ||
      receipt.contextPackageId !== envelope.contextPackageId ||
      receipt.contextPackageFingerprint !== envelope.contextPackageFingerprint ||
      receipt.consumerId !== envelope.consumerId ||
      receipt.consumerDescriptorFingerprint !== envelope.consumerDescriptorFingerprint ||
      receipt.deliverySequence !== envelope.deliverySequence ||
      receipt.idempotencyKey !== envelope.idempotencyKey ||
      receipt.consumerAcknowledgmentFingerprint !== acknowledgment.acknowledgmentFingerprint ||
      receipt.deliveryStatus !== "accepted"
    ) {
      context.addIssue({
        code: "custom",
        message: "Successful delivery Receipt must exactly bind its Envelope",
        path: ["receipt"],
      });
    }
  });

export const GovernedContextDeliveryRejectedSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("rejected"),
    evidence: ContextDeliveryAttemptEvidenceSchema,
  })
  .strict();

export const GovernedContextDeliveryResultSchema = z.discriminatedUnion("status", [
  GovernedContextDeliverySuccessSchema,
  GovernedContextDeliveryRejectedSchema,
]);

export const ContextDeliveryArtifactVerificationIssueCodeSchema = z.enum([
  "invalid_artifact",
  "fingerprint_mismatch",
  "context_package_binding_mismatch",
  "consumer_binding_mismatch",
  "request_binding_mismatch",
  "policy_binding_mismatch",
  "freshness_binding_mismatch",
  "replay_binding_mismatch",
  "receipt_binding_mismatch",
  "reason_order_mismatch",
  "unsafe_content",
]);

export const ContextDeliveryArtifactVerificationResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    artifactType: z.enum([
      "consumer-descriptor",
      "delivery-request",
      "policy-decision",
      "compatibility-result",
      "freshness-evidence",
      "delivery-envelope",
      "delivery-receipt",
      "replay-evidence",
      "consumption-evidence",
    ]),
    status: z.enum(["valid", "invalid"]),
    fingerprint: Sha256DigestSchema.nullable(),
    issues: z.array(
      z
        .object({
          code: ContextDeliveryArtifactVerificationIssueCodeSchema,
          path: NonEmptyStringSchema,
          message: NonEmptyStringSchema,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === "valid") !== (value.issues.length === 0) ||
      (value.status === "valid") !== (value.fingerprint !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Verification status, fingerprint, and issues must agree",
        path: ["status"],
      });
    }
  });

export type ContextConsumerCapabilities = z.infer<typeof ContextConsumerCapabilitiesSchema>;
export type ContextConsumerDescriptor = z.infer<typeof ContextConsumerDescriptorSchema>;
export type ContextDeliveryCapabilityRequirements = z.infer<
  typeof ContextDeliveryCapabilityRequirementsSchema
>;
export type ContextDeliveryPolicyInput = z.infer<typeof ContextDeliveryPolicyInputSchema>;
export type ContextDeliveryPolicyDecisionEvidence = z.infer<
  typeof ContextDeliveryPolicyDecisionEvidenceSchema
>;
export type ContextDeliveryFreshnessPolicy = z.infer<typeof ContextDeliveryFreshnessPolicySchema>;
export type ContextDeliveryReplayPolicy = z.infer<typeof ContextDeliveryReplayPolicySchema>;
export type GovernedContextDeliveryRequest = z.infer<typeof GovernedContextDeliveryRequestSchema>;
export type ContextConsumerCompatibilityResult = z.infer<
  typeof ContextConsumerCompatibilityResultSchema
>;
export type ContextDeliveryFreshnessEvidence = z.infer<
  typeof ContextDeliveryFreshnessEvidenceSchema
>;
export type GovernedContextDeliveryEnvelope = z.infer<typeof GovernedContextDeliveryEnvelopeSchema>;
export type ContextConsumerAcknowledgment = z.infer<typeof ContextConsumerAcknowledgmentSchema>;
export type ContextDeliveryReceipt = z.infer<typeof ContextDeliveryReceiptSchema>;
export type ContextDeliveryReplayEvidence = z.infer<typeof ContextDeliveryReplayEvidenceSchema>;
export type ContextDeliveryStatus = z.infer<typeof ContextDeliveryStatusSchema>;
export type ContextConsumptionEvidence = z.infer<typeof ContextConsumptionEvidenceSchema>;
export type ContextDeliveryAttemptEvidence = z.infer<typeof ContextDeliveryAttemptEvidenceSchema>;
export type ContextDeliveryIssue = z.infer<typeof ContextDeliveryIssueSchema>;
export type GovernedContextDeliveryResult = z.infer<typeof GovernedContextDeliveryResultSchema>;
export type ContextDeliveryArtifactVerificationResult = z.infer<
  typeof ContextDeliveryArtifactVerificationResultSchema
>;

export interface ProviderNeutralContextConsumerBoundary {
  readonly descriptor: ContextConsumerDescriptor;
  acceptEnvelope(envelope: GovernedContextDeliveryEnvelope): Promise<ContextConsumerAcknowledgment>;
}
