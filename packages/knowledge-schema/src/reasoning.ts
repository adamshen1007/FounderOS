import { z } from "zod";

import {
  DurableCanonicalJsonValueSchema,
  type DurableCanonicalJsonValue,
} from "./canonical-json.js";
import {
  KnowledgeContextRegistryBindingSchema,
  KnowledgeContextSnapshotBindingSchema,
} from "./context.js";
import { ContextDeliveryRequestActorSchema } from "./delivery.js";
import {
  IdentifierSchema as BaseIdentifierSchema,
  IsoTemporalSchema,
  Sha256DigestSchema,
} from "./primitives.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const LOGICAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const WINDOWS_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+)/u;
const POSIX_PHYSICAL_PATH_PATTERN =
  /(?:^|[\s([{'"=:;,])\/(?!\/)[^\s)\]}>'",;\\/]+(?:\/[^\s)\]}>'",;\\/]*)*/u;
const FILE_URI_PATTERN = /file:\/\//iu;
const CREDENTIAL_PATTERN =
  /(?:api[_ -]?key|access[_ -]?token|authorization|bearer|password|private[_ -]?key|client[_ -]?secret)\s*[:=]\s*\S+/iu;
const CREDENTIAL_VALUE_PATTERN =
  /(?:\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b|\bgh[pousr]_[A-Za-z0-9]+\b|\bxox[baprs]-[A-Za-z0-9-]+\b|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u;
const CREDENTIAL_KEY_PATTERN =
  /(?:apikey|accesstoken|authorization|bearer|password|privatekey|clientsecret|credential|secret)/u;

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isCanonicalText(value: string): boolean {
  return (
    value === value.normalize("NFC") &&
    !value.includes("\r") &&
    !value.includes("\0") &&
    !hasLoneSurrogate(value)
  );
}

function isSafeText(value: string): boolean {
  return (
    isCanonicalText(value) &&
    !WINDOWS_PATH_PATTERN.test(value) &&
    !POSIX_PHYSICAL_PATH_PATTERN.test(value) &&
    !FILE_URI_PATTERN.test(value) &&
    !CREDENTIAL_PATTERN.test(value) &&
    !CREDENTIAL_VALUE_PATTERN.test(value)
  );
}

function isSafeLogicalReference(value: string): boolean {
  return (
    isCanonicalText(value) &&
    LOGICAL_REFERENCE_PATTERN.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.split("/").some((segment) => segment === "." || segment === "..") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(value) &&
    !FILE_URI_PATTERN.test(value)
  );
}

function containsUnsafeString(value: DurableCanonicalJsonValue): boolean {
  if (typeof value === "string") return !isSafeText(value);
  if (Array.isArray(value)) return value.some(containsUnsafeString);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      const normalizedKey = key
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^a-z0-9]/gu, "");
      return (
        !isSafeText(key) ||
        CREDENTIAL_KEY_PATTERN.test(normalizedKey) ||
        containsUnsafeString(nested)
      );
    });
  }
  return false;
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

function compareTemporal(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export const ReasoningContractVersionSchema = z.literal("1.0");
export const ReasoningIdentifierSchema = z
  .string()
  .refine((value) => value === value.trim(), "Identifiers cannot contain surrounding whitespace")
  .pipe(BaseIdentifierSchema)
  .refine(
    (value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value),
    "Expected a canonical provider-neutral identifier",
  );
const IdentifierSchema = ReasoningIdentifierSchema;
export const ReasoningInvocationIdempotencyKeySchema = z
  .string()
  .regex(IDEMPOTENCY_KEY_PATTERN, "Invalid Reasoning Invocation idempotency key");
export const ReasoningCanonicalTextSchema = z
  .string()
  .refine(isSafeText, "Expected canonical path-private and credential-private text");
export const ReasoningNonEmptyCanonicalTextSchema = ReasoningCanonicalTextSchema.refine(
  (value) => value.length > 0 && value.trim() === value,
  "Expected non-empty canonical text without surrounding whitespace",
);
export const ReasoningLogicalReferenceSchema = z
  .string()
  .min(1)
  .refine(isSafeLogicalReference, "Expected a path-private logical reference");
export const ReasoningSafeCanonicalJsonValueSchema = DurableCanonicalJsonValueSchema.refine(
  (value) => !containsUnsafeString(value),
  "Canonical JSON cannot contain physical paths or credential-like material",
);

export const ReasoningInstructionBlockTypeSchema = z.enum([
  "system-constraint",
  "task-instruction",
  "context-reference",
  "output-requirement",
  "evaluation-directive",
]);
export const ReasoningInstructionSourceClassificationSchema = z.enum([
  "governance-policy",
  "request-author",
  "delivered-context",
  "evaluation-fixture",
]);
export const ReasoningInputContentTypeSchema = z.literal("provider-neutral-instruction-blocks-v1");
export const ReasoningCapabilityInputContentTypeSchema = z.enum([
  "provider-neutral-instruction-blocks-v1",
  "provider-neutral-instruction-blocks-v2",
]);
export const ReasoningCapabilityVersionSchema = z.enum(["1.0", "2.0"]);
export const ReasoningOutputContentTypeSchema = z.enum(["canonical-json", "canonical-text"]);

export const ReasoningInstructionBlockSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      blockId: IdentifierSchema,
      blockType: ReasoningInstructionBlockTypeSchema,
      contentType: z.literal("canonical-text"),
      text: ReasoningNonEmptyCanonicalTextSchema,
      priority: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      sourceClassification: ReasoningInstructionSourceClassificationSchema,
      blockFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ReasoningConstraintBlockSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      constraintId: IdentifierSchema,
      text: ReasoningNonEmptyCanonicalTextSchema,
      constraintFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ReasoningContextReferenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      contextPackageId: IdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      deliveryEnvelopeId: IdentifierSchema,
      deliveryEnvelopeFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ReasoningOutputRequirementsSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      contentType: ReasoningOutputContentTypeSchema,
      maxCharacters: z.number().int().positive().max(MAX_SAFE_INTEGER),
      requireNonEmpty: z.boolean(),
    })
    .strict(),
);

export const ReasoningEvaluationMetadataSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      evaluationId: IdentifierSchema,
      evaluationReference: ReasoningLogicalReferenceSchema,
      evaluatedAt: IsoTemporalSchema,
    })
    .strict(),
);

export const ProviderNeutralReasoningInputSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      contentType: ReasoningInputContentTypeSchema,
      instructionBlocks: z.array(ReasoningInstructionBlockSchema).min(1),
      contextReference: ReasoningContextReferenceSchema,
      outputRequirements: ReasoningOutputRequirementsSchema,
      constraintBlocks: z.array(ReasoningConstraintBlockSchema),
      evaluationMetadata: ReasoningEvaluationMetadataSchema.optional(),
      inputFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.instructionBlocks.map((block) => block.blockId),
        context,
        ["instructionBlocks"],
        "Instruction Block IDs",
      );
      requireSortedUnique(
        value.constraintBlocks.map((block) => block.constraintId),
        context,
        ["constraintBlocks"],
        "Constraint Block IDs",
      );
      const contextBlocks = value.instructionBlocks.filter(
        (block) => block.blockType === "context-reference",
      );
      if (contextBlocks.length !== 1) {
        context.addIssue({
          code: "custom",
          message: "Reasoning input requires exactly one Context Reference Instruction Block",
          path: ["instructionBlocks"],
        });
      }
      if (!value.instructionBlocks.some((block) => block.blockType === "task-instruction")) {
        context.addIssue({
          code: "custom",
          message: "Reasoning input requires at least one Task Instruction Block",
          path: ["instructionBlocks"],
        });
      }
      if (
        value.instructionBlocks.some((block) => block.blockType === "evaluation-directive") !==
        (value.evaluationMetadata !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          message: "Evaluation directives and Evaluation Metadata must be present together",
          path: ["evaluationMetadata"],
        });
      }
    }),
);

export const ReasoningRetryModeSchema = z.enum([
  "no-retry",
  "retry-deterministic-transient-failure",
  "retry-until-attempt-limit",
  "evaluation-only-retry",
]);
export const ReasoningCancellationModeSchema = z.enum([
  "not-cancellable",
  "cancel-before-execution",
  "cooperative-cancellation",
  "deadline-cancellation",
]);

export const ReasoningExecutionPolicySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      maxInputCharacters: z.number().int().positive().max(MAX_SAFE_INTEGER),
      maxOutputCharacters: z.number().int().positive().max(MAX_SAFE_INTEGER),
      timeoutMilliseconds: z.number().int().positive().max(MAX_SAFE_INTEGER),
      cancellationMode: ReasoningCancellationModeSchema,
      retryMode: ReasoningRetryModeSchema,
      maxAttemptCount: z.number().int().positive().max(MAX_SAFE_INTEGER),
      deterministicModeRequired: z.boolean(),
      usageEvidenceRequired: z.boolean(),
      costEvidenceRequired: z.boolean(),
      failureEvidenceRequired: z.boolean(),
      resultPersistenceRequired: z.boolean(),
      evaluatedAt: IsoTemporalSchema,
      policyFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.retryMode === "no-retry") !== (value.maxAttemptCount === 1)) {
        context.addIssue({
          code: "custom",
          message:
            "No-retry requires exactly one Attempt and multiple Attempts require a retry mode",
          path: ["maxAttemptCount"],
        });
      }
      if (
        (value.retryMode === "retry-deterministic-transient-failure" ||
          value.retryMode === "evaluation-only-retry") &&
        !value.deterministicModeRequired
      ) {
        context.addIssue({
          code: "custom",
          message: "Deterministic and evaluation retry modes require deterministic execution",
          path: ["deterministicModeRequired"],
        });
      }
      if (!value.resultPersistenceRequired) {
        context.addIssue({
          code: "custom",
          message: "Milestone 13 requires finalized Result persistence",
          path: ["resultPersistenceRequired"],
        });
      }
    }),
);

export const ReasoningProviderClassSchema = z.enum([
  "deterministic-fake-provider",
  "evaluation-provider",
  "local-reasoning-provider",
  "remote-reasoning-provider",
]);

export const ReasoningProviderCapabilityRequirementsSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      acceptedProviderClasses: z.array(ReasoningProviderClassSchema).min(1),
      requiredInputContentTypes: z.array(ReasoningInputContentTypeSchema).min(1),
      requiredOutputContentType: ReasoningOutputContentTypeSchema,
      deterministicModeRequired: z.boolean(),
      usageEvidenceRequired: z.boolean(),
      costEvidenceRequired: z.boolean(),
      failureEvidenceRequired: z.boolean(),
      resultEnvelopeVersion: ReasoningContractVersionSchema,
      requirementsFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.acceptedProviderClasses,
        context,
        ["acceptedProviderClasses"],
        "Accepted Provider classes",
      );
      requireSortedUnique(
        value.requiredInputContentTypes,
        context,
        ["requiredInputContentTypes"],
        "Required input content types",
      );
    }),
);

export const ReasoningProviderCapabilityDescriptorSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      providerCapabilityId: IdentifierSchema,
      providerClass: ReasoningProviderClassSchema,
      acceptedInvocationRequestVersions: z.array(ReasoningCapabilityVersionSchema).min(1),
      acceptedDeliveryEnvelopeVersions: z.array(ReasoningCapabilityVersionSchema).min(1),
      acceptedInputContentTypes: z.array(ReasoningCapabilityInputContentTypeSchema).min(1),
      acceptedOutputContentTypes: z.array(ReasoningOutputContentTypeSchema).min(1),
      maxInputCharacters: z.number().int().positive().max(MAX_SAFE_INTEGER),
      maxOutputCharacters: z.number().int().positive().max(MAX_SAFE_INTEGER),
      minTimeoutMilliseconds: z.number().int().positive().max(MAX_SAFE_INTEGER),
      maxTimeoutMilliseconds: z.number().int().positive().max(MAX_SAFE_INTEGER),
      supportedCancellationModes: z.array(ReasoningCancellationModeSchema).min(1),
      supportedRetryModes: z.array(ReasoningRetryModeSchema).min(1),
      supportsDeterministicExecution: z.boolean(),
      supportsUsageEvidence: z.boolean(),
      supportsCostEvidence: z.boolean(),
      supportsFailureEvidence: z.boolean(),
      supportedResultEnvelopeVersions: z.array(ReasoningContractVersionSchema).min(1),
      descriptorFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      for (const [field, values] of [
        ["acceptedInvocationRequestVersions", value.acceptedInvocationRequestVersions],
        ["acceptedDeliveryEnvelopeVersions", value.acceptedDeliveryEnvelopeVersions],
        ["acceptedInputContentTypes", value.acceptedInputContentTypes],
        ["acceptedOutputContentTypes", value.acceptedOutputContentTypes],
        ["supportedCancellationModes", value.supportedCancellationModes],
        ["supportedRetryModes", value.supportedRetryModes],
        ["supportedResultEnvelopeVersions", value.supportedResultEnvelopeVersions],
      ] as const) {
        requireSortedUnique(values, context, [field], field);
      }
      if (value.minTimeoutMilliseconds > value.maxTimeoutMilliseconds) {
        context.addIssue({
          code: "custom",
          message: "Supported timeout minimum cannot exceed the maximum",
          path: ["minTimeoutMilliseconds"],
        });
      }
      if (
        (value.supportedRetryModes.includes("retry-deterministic-transient-failure") ||
          value.supportedRetryModes.includes("evaluation-only-retry")) &&
        !value.supportsDeterministicExecution
      ) {
        context.addIssue({
          code: "custom",
          message: "Deterministic and evaluation retry support requires deterministic execution",
          path: ["supportedRetryModes"],
        });
      }
    }),
);

export const ReasoningCompatibilityStatusSchema = z.enum(["compatible", "incompatible"]);
export const ReasoningCompatibilityReasonCodeSchema = z.enum([
  "compatible",
  "cancellation_mode_unsupported",
  "cost_evidence_unsupported",
  "delivery_envelope_version_unsupported",
  "deterministic_mode_unsupported",
  "failure_evidence_unsupported",
  "input_budget_exceeded",
  "input_content_type_unsupported",
  "invocation_version_unsupported",
  "output_budget_exceeded",
  "output_content_type_unsupported",
  "provider_class_unsupported",
  "result_envelope_version_unsupported",
  "retry_mode_unsupported",
  "timeout_out_of_range",
  "usage_evidence_unsupported",
]);
export const ReasoningCompatibilityMismatchFieldSchema = z.enum([
  "cancellationMode",
  "costEvidenceRequired",
  "deliveryEnvelopeVersion",
  "deterministicModeRequired",
  "failureEvidenceRequired",
  "inputCharacters",
  "inputContentType",
  "invocationRequestVersion",
  "maxOutputCharacters",
  "outputContentType",
  "providerClass",
  "resultEnvelopeVersion",
  "retryMode",
  "timeoutMilliseconds",
  "usageEvidenceRequired",
]);

const COMPATIBILITY_REASON_FIELD = {
  cancellation_mode_unsupported: "cancellationMode",
  cost_evidence_unsupported: "costEvidenceRequired",
  delivery_envelope_version_unsupported: "deliveryEnvelopeVersion",
  deterministic_mode_unsupported: "deterministicModeRequired",
  failure_evidence_unsupported: "failureEvidenceRequired",
  input_budget_exceeded: "inputCharacters",
  input_content_type_unsupported: "inputContentType",
  invocation_version_unsupported: "invocationRequestVersion",
  output_budget_exceeded: "maxOutputCharacters",
  output_content_type_unsupported: "outputContentType",
  provider_class_unsupported: "providerClass",
  result_envelope_version_unsupported: "resultEnvelopeVersion",
  retry_mode_unsupported: "retryMode",
  timeout_out_of_range: "timeoutMilliseconds",
  usage_evidence_unsupported: "usageEvidenceRequired",
} as const;

export const ReasoningProviderCompatibilityResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      status: ReasoningCompatibilityStatusSchema,
      reasonCodes: z.array(ReasoningCompatibilityReasonCodeSchema).min(1),
      mismatchedFields: z.array(ReasoningCompatibilityMismatchFieldSchema),
      invocationRequestFingerprint: Sha256DigestSchema,
      reasoningInputFingerprint: Sha256DigestSchema,
      executionPolicyFingerprint: Sha256DigestSchema,
      providerCapabilityFingerprint: Sha256DigestSchema,
      compatibilityFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Compatibility reasons");
      requireSortedUnique(
        value.mismatchedFields,
        context,
        ["mismatchedFields"],
        "Compatibility mismatch fields",
      );
      if (
        value.status === "compatible" &&
        (value.reasonCodes.length !== 1 ||
          value.reasonCodes[0] !== "compatible" ||
          value.mismatchedFields.length !== 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Compatible results require only the compatible reason and no mismatches",
          path: ["status"],
        });
      }
      if (
        value.status === "incompatible" &&
        (value.reasonCodes.includes("compatible") || value.mismatchedFields.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Incompatible results require mismatch evidence and cannot be compatible",
          path: ["status"],
        });
      }
      const expectedFields = value.reasonCodes
        .filter((reason) => reason !== "compatible")
        .map((reason) => COMPATIBILITY_REASON_FIELD[reason])
        .sort();
      if (JSON.stringify(expectedFields) !== JSON.stringify(value.mismatchedFields)) {
        context.addIssue({
          code: "custom",
          message: "Every Compatibility reason must bind its exact mismatched field",
          path: ["mismatchedFields"],
        });
      }
    }),
);

export const ReasoningInvocationRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      invocationRequestId: IdentifierSchema,
      deliveryTransactionId: IdentifierSchema,
      deliveryEnvelopeVersion: z.literal("1.0"),
      deliveryEnvelopeId: IdentifierSchema,
      deliveryEnvelopeFingerprint: Sha256DigestSchema,
      deliveryReceiptId: IdentifierSchema,
      deliveryReceiptFingerprint: Sha256DigestSchema,
      contextPackageId: IdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      activeSnapshotBinding: KnowledgeContextSnapshotBindingSchema,
      registryIntegrityBinding: KnowledgeContextRegistryBindingSchema,
      consumerId: IdentifierSchema,
      consumerDescriptorFingerprint: Sha256DigestSchema,
      policyDecisionFingerprint: Sha256DigestSchema,
      purpose: ReasoningNonEmptyCanonicalTextSchema,
      capabilityRequirements: ReasoningProviderCapabilityRequirementsSchema,
      reasoningInput: ProviderNeutralReasoningInputSchema,
      executionPolicy: ReasoningExecutionPolicySchema,
      idempotencyKey: ReasoningInvocationIdempotencyKeySchema,
      requestActor: ContextDeliveryRequestActorSchema,
      reason: ReasoningNonEmptyCanonicalTextSchema,
      requestedAt: IsoTemporalSchema,
      requestFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const reference = value.reasoningInput.contextReference;
      if (
        reference.contextPackageId !== value.contextPackageId ||
        reference.contextPackageFingerprint !== value.contextPackageFingerprint ||
        reference.deliveryEnvelopeId !== value.deliveryEnvelopeId ||
        reference.deliveryEnvelopeFingerprint !== value.deliveryEnvelopeFingerprint
      ) {
        context.addIssue({
          code: "custom",
          message: "Reasoning Input must preserve the exact Delivery and Context Package bindings",
          path: ["reasoningInput", "contextReference"],
        });
      }
      if (
        value.registryIntegrityBinding.recoveredActiveSnapshotId !==
        value.activeSnapshotBinding.activeSnapshotId
      ) {
        context.addIssue({
          code: "custom",
          message: "Registry and Active Snapshot bindings must agree",
          path: ["registryIntegrityBinding", "recoveredActiveSnapshotId"],
        });
      }
      if (
        value.reasoningInput.outputRequirements.maxCharacters >
        value.executionPolicy.maxOutputCharacters
      ) {
        context.addIssue({
          code: "custom",
          message: "Input output requirements cannot exceed the Execution Policy budget",
          path: ["reasoningInput", "outputRequirements", "maxCharacters"],
        });
      }
      const requirements = value.capabilityRequirements;
      const policy = value.executionPolicy;
      if (
        requirements.deterministicModeRequired !== policy.deterministicModeRequired ||
        requirements.usageEvidenceRequired !== policy.usageEvidenceRequired ||
        requirements.costEvidenceRequired !== policy.costEvidenceRequired ||
        requirements.failureEvidenceRequired !== policy.failureEvidenceRequired ||
        requirements.requiredOutputContentType !==
          value.reasoningInput.outputRequirements.contentType
      ) {
        context.addIssue({
          code: "custom",
          message: "Capability requirements, Reasoning Input, and Execution Policy must agree",
          path: ["capabilityRequirements"],
        });
      }
      if (
        value.executionPolicy.evaluatedAt !== value.requestedAt ||
        (value.reasoningInput.evaluationMetadata !== undefined &&
          value.reasoningInput.evaluationMetadata.evaluatedAt !== value.requestedAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "Policy and evaluation timestamps must bind the Invocation timestamp",
          path: ["requestedAt"],
        });
      }
    }),
);

export const ReasoningCancellationStateSchema = z.enum([
  "not-requested",
  "requested-before-execution",
  "requested-cooperatively",
  "requested-at-deadline",
]);
export const ReasoningOutcomeStatusSchema = z.enum([
  "succeeded",
  "failed",
  "timed-out",
  "cancelled",
]);

export const ReasoningExecutionAttemptSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      executionAttemptId: IdentifierSchema,
      invocationRequestId: IdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
      providerCapabilityId: IdentifierSchema,
      providerCapabilityFingerprint: Sha256DigestSchema,
      executionPolicyFingerprint: Sha256DigestSchema,
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      previousExecutionAttemptId: IdentifierSchema.optional(),
      startedAt: IsoTemporalSchema,
      deadlineAt: IsoTemporalSchema.optional(),
      cancellationState: ReasoningCancellationStateSchema,
      cancellationAuthorityReference: ReasoningLogicalReferenceSchema.optional(),
      cancellationRequestedAt: IsoTemporalSchema.optional(),
      cancellationObservedAt: IsoTemporalSchema.optional(),
      attemptFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.attemptNumber === 1) !== (value.previousExecutionAttemptId === undefined)) {
        context.addIssue({
          code: "custom",
          message: "Only the first Attempt may omit its previous Attempt binding",
          path: ["previousExecutionAttemptId"],
        });
      }
      if (
        value.deadlineAt !== undefined &&
        compareTemporal(value.deadlineAt, value.startedAt) <= 0
      ) {
        context.addIssue({
          code: "custom",
          message: "Attempt deadline must be after its start",
          path: ["deadlineAt"],
        });
      }
      const cancellationFields = [
        value.cancellationAuthorityReference,
        value.cancellationRequestedAt,
        value.cancellationObservedAt,
      ];
      if (
        cancellationFields.every((field) => field === undefined) !==
        (value.cancellationState === "not-requested")
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Requested cancellation requires complete authority, request, and observation evidence",
          path: ["cancellationAuthorityReference"],
        });
      }
      if (
        value.cancellationRequestedAt !== undefined &&
        value.cancellationObservedAt !== undefined &&
        compareTemporal(value.cancellationObservedAt, value.cancellationRequestedAt) < 0
      ) {
        context.addIssue({
          code: "custom",
          message: "Cancellation observation cannot precede its request",
          path: ["cancellationObservedAt"],
        });
      }
    }),
);

export const ReasoningFailureCategorySchema = z.enum([
  "attempt-limit-exhausted",
  "capability",
  "input-validation",
  "output-validation",
  "permanent-provider-failure",
  "policy",
  "transient-provider-failure",
]);
export const ReasoningFailureReasonCodeSchema = z.enum([
  "attempt_limit_exhausted",
  "capability_mismatch",
  "credential_material_rejected",
  "invalid_provider_outcome",
  "malformed_failure_outcome",
  "malformed_success_outcome",
  "output_budget_exceeded",
  "permanent_provider_failure",
  "physical_path_rejected",
  "policy_rejected",
  "transient_provider_failure",
  "unsafe_output_rejected",
]);

const FAILURE_CATEGORY_REASON_CODES = {
  "attempt-limit-exhausted": ["attempt_limit_exhausted"],
  capability: ["capability_mismatch"],
  "input-validation": ["credential_material_rejected", "physical_path_rejected"],
  "output-validation": [
    "credential_material_rejected",
    "invalid_provider_outcome",
    "malformed_failure_outcome",
    "malformed_success_outcome",
    "output_budget_exceeded",
    "physical_path_rejected",
    "unsafe_output_rejected",
  ],
  "permanent-provider-failure": ["permanent_provider_failure"],
  policy: ["policy_rejected"],
  "transient-provider-failure": ["transient_provider_failure"],
} as const;

export const ReasoningFailureEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      executionAttemptId: IdentifierSchema,
      invocationRequestId: IdentifierSchema,
      failureCategory: ReasoningFailureCategorySchema,
      reasonCodes: z.array(ReasoningFailureReasonCodeSchema).min(1),
      retryable: z.boolean(),
      sanitizedDetail: ReasoningNonEmptyCanonicalTextSchema,
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      failureFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Failure reasons");
      const allowedReasons: readonly string[] =
        FAILURE_CATEGORY_REASON_CODES[value.failureCategory];
      if (value.reasonCodes.some((reason) => !allowedReasons.includes(reason))) {
        context.addIssue({
          code: "custom",
          message: "Failure reason codes must be compatible with the Failure category",
          path: ["reasonCodes"],
        });
      }
      if (value.retryable !== (value.failureCategory === "transient-provider-failure")) {
        context.addIssue({
          code: "custom",
          message: "Only transient Provider failures may be classified as retryable",
          path: ["retryable"],
        });
      }
    }),
);

export const ReasoningTimeoutPhaseSchema = z.enum([
  "before-execution",
  "during-execution",
  "provider-outcome-validation",
]);
export const ReasoningTimeoutReasonCodeSchema = z.enum([
  "execution_deadline_reached",
  "execution_timeout",
]);
export const ReasoningTimeoutEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      executionAttemptId: IdentifierSchema,
      invocationRequestId: IdentifierSchema,
      configuredTimeoutMilliseconds: z.number().int().positive().max(MAX_SAFE_INTEGER),
      attemptStartedAt: IsoTemporalSchema,
      deadlineAt: IsoTemporalSchema,
      elapsedMilliseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      timeoutPhase: ReasoningTimeoutPhaseSchema,
      reasonCode: ReasoningTimeoutReasonCodeSchema,
      timeoutFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.deadlineAt, value.attemptStartedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Timeout deadline must be after Attempt start",
          path: ["deadlineAt"],
        });
      }
      if (
        compareTemporal(value.deadlineAt, value.attemptStartedAt) !==
        value.configuredTimeoutMilliseconds
      ) {
        context.addIssue({
          code: "custom",
          message: "Timeout deadline must derive from the configured timeout",
          path: ["deadlineAt"],
        });
      }
      if (value.elapsedMilliseconds < value.configuredTimeoutMilliseconds) {
        context.addIssue({
          code: "custom",
          message: "Timeout elapsed evidence must reach the configured timeout",
          path: ["elapsedMilliseconds"],
        });
      }
    }),
);

export const ReasoningCancellationPhaseSchema = z.enum([
  "before-execution",
  "cooperative-execution",
  "deadline",
]);
export const ReasoningCancellationReasonCodeSchema = z.enum([
  "cancelled_at_deadline",
  "cancelled_before_execution",
  "cancelled_cooperatively",
]);
export const ReasoningCancellationEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      invocationRequestId: IdentifierSchema,
      executionAttemptId: IdentifierSchema,
      cancellationMode: ReasoningCancellationModeSchema,
      cancellationPhase: ReasoningCancellationPhaseSchema,
      cancellationAuthorityReference: ReasoningLogicalReferenceSchema,
      requestedAt: IsoTemporalSchema,
      observedAt: IsoTemporalSchema,
      reasonCode: ReasoningCancellationReasonCodeSchema,
      cancellationFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const expected = {
        "cancel-before-execution": {
          phase: "before-execution",
          reason: "cancelled_before_execution",
        },
        "cooperative-cancellation": {
          phase: "cooperative-execution",
          reason: "cancelled_cooperatively",
        },
        "deadline-cancellation": { phase: "deadline", reason: "cancelled_at_deadline" },
      } as const;
      if (value.cancellationMode === "not-cancellable") {
        context.addIssue({
          code: "custom",
          message: "Not-cancellable policy cannot produce Cancellation Evidence",
          path: ["cancellationMode"],
        });
      } else {
        const required = expected[value.cancellationMode];
        if (value.cancellationPhase !== required.phase || value.reasonCode !== required.reason) {
          context.addIssue({
            code: "custom",
            message: "Cancellation mode, phase, and reason must agree",
            path: ["cancellationPhase"],
          });
        }
      }
      if (compareTemporal(value.observedAt, value.requestedAt) < 0) {
        context.addIssue({
          code: "custom",
          message: "Cancellation observation cannot precede its request",
          path: ["observedAt"],
        });
      }
    }),
);

export const ReasoningOutputContentSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("contentType", [
    z
      .object({
        contentType: z.literal("canonical-text"),
        text: ReasoningCanonicalTextSchema,
      })
      .strict(),
    z
      .object({
        contentType: z.literal("canonical-json"),
        value: ReasoningSafeCanonicalJsonValueSchema,
      })
      .strict(),
  ]),
);

export const ReasoningExecutionReceiptSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      executionAttemptId: IdentifierSchema,
      invocationRequestId: IdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      providerCapabilityId: IdentifierSchema,
      providerCapabilityFingerprint: Sha256DigestSchema,
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      startedAt: IsoTemporalSchema,
      completedAt: IsoTemporalSchema,
      outcome: ReasoningOutcomeStatusSchema,
      receiptFingerprint: Sha256DigestSchema,
    })
    .strict()
    .refine((value) => compareTemporal(value.completedAt, value.startedAt) >= 0, {
      message: "Execution Receipt completion cannot precede its start",
      path: ["completedAt"],
    }),
);

export const ReasoningUsageEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      executionAttemptId: IdentifierSchema,
      inputCharacterCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      outputCharacterCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      instructionBlockCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      contextPackageObjectCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      durationMilliseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      estimatedInputUnits: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).optional(),
      estimatedOutputUnits: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).optional(),
      estimationMethod: ReasoningLogicalReferenceSchema.optional(),
      usageFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const hasEstimates =
        value.estimatedInputUnits !== undefined || value.estimatedOutputUnits !== undefined;
      if (hasEstimates !== (value.estimationMethod !== undefined)) {
        context.addIssue({
          code: "custom",
          message: "Estimated units require an explicit deterministic estimation method",
          path: ["estimationMethod"],
        });
      }
    }),
);

export const ReasoningCostStatusSchema = z.enum([
  "actual",
  "estimated",
  "not-applicable",
  "unavailable",
]);
export const ReasoningCostEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        schemaVersion: ReasoningContractVersionSchema,
        executionAttemptId: IdentifierSchema,
        status: z.enum(["actual", "estimated"]),
        currencyCode: z.string().regex(/^[A-Z]{3}$/u),
        amountMinorUnits: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
        estimationMethod: ReasoningLogicalReferenceSchema,
        pricingReferenceVersion: ReasoningLogicalReferenceSchema,
        costFingerprint: Sha256DigestSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: ReasoningContractVersionSchema,
        executionAttemptId: IdentifierSchema,
        status: z.literal("unavailable"),
        reasonCode: z.literal("cost_evidence_unavailable"),
        costFingerprint: Sha256DigestSchema,
      })
      .strict(),
    z
      .object({
        schemaVersion: ReasoningContractVersionSchema,
        executionAttemptId: IdentifierSchema,
        status: z.literal("not-applicable"),
        costFingerprint: Sha256DigestSchema,
      })
      .strict(),
  ]),
);

const ProviderOutcomeBase = {
  schemaVersion: ReasoningContractVersionSchema,
  executionAttemptId: IdentifierSchema,
  invocationRequestId: IdentifierSchema,
  attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
  completedAt: IsoTemporalSchema,
} as const;

export const ReasoningProviderOutcomeSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .discriminatedUnion("status", [
      z
        .object({
          ...ProviderOutcomeBase,
          status: z.literal("succeeded"),
          outputContent: ReasoningOutputContentSchema,
          outputCharacterCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
          outputContentFingerprint: Sha256DigestSchema,
          outcomeFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          ...ProviderOutcomeBase,
          status: z.literal("failed"),
          failureEvidence: ReasoningFailureEvidenceSchema,
          outcomeFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          ...ProviderOutcomeBase,
          status: z.literal("timed-out"),
          timeoutEvidence: ReasoningTimeoutEvidenceSchema,
          outcomeFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          ...ProviderOutcomeBase,
          status: z.literal("cancelled"),
          cancellationEvidence: ReasoningCancellationEvidenceSchema,
          outcomeFingerprint: Sha256DigestSchema,
        })
        .strict(),
    ])
    .superRefine((value, context) => {
      const evidence =
        value.status === "failed"
          ? value.failureEvidence
          : value.status === "timed-out"
            ? value.timeoutEvidence
            : value.status === "cancelled"
              ? value.cancellationEvidence
              : null;
      if (
        evidence !== null &&
        (evidence.executionAttemptId !== value.executionAttemptId ||
          evidence.invocationRequestId !== value.invocationRequestId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Provider Outcome evidence must bind its Invocation and Attempt",
          path: ["status"],
        });
      }
      if (
        value.status === "failed" &&
        value.failureEvidence.attemptNumber !== value.attemptNumber
      ) {
        context.addIssue({
          code: "custom",
          message: "Failure Evidence must bind the Provider Outcome Attempt number",
          path: ["failureEvidence", "attemptNumber"],
        });
      }
    }),
);

const ReasoningResultBase = {
  schemaVersion: ReasoningContractVersionSchema,
  resultEnvelopeId: IdentifierSchema,
  invocationRequestId: IdentifierSchema,
  invocationRequestFingerprint: Sha256DigestSchema,
  invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
  deliveryTransactionId: IdentifierSchema,
  deliveryEnvelopeId: IdentifierSchema,
  deliveryEnvelopeFingerprint: Sha256DigestSchema,
  deliveryReceiptId: IdentifierSchema,
  deliveryReceiptFingerprint: Sha256DigestSchema,
  contextPackageId: IdentifierSchema,
  contextPackageFingerprint: Sha256DigestSchema,
  consumerId: IdentifierSchema,
  consumerDescriptorFingerprint: Sha256DigestSchema,
  providerCapabilityId: IdentifierSchema,
  providerCapabilityFingerprint: Sha256DigestSchema,
  executionPolicyFingerprint: Sha256DigestSchema,
  executionAttemptId: IdentifierSchema,
  attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
  executionReceipt: ReasoningExecutionReceiptSchema,
  usageEvidence: ReasoningUsageEvidenceSchema,
  costEvidence: ReasoningCostEvidenceSchema,
  completedAt: IsoTemporalSchema,
  resultEnvelopeFingerprint: Sha256DigestSchema,
} as const;

function validateResultBindings(
  value: z.infer<typeof ReasoningResultEnvelopeVariantSchema>,
  context: z.RefinementCtx,
): void {
  if (
    value.executionReceipt.executionAttemptId !== value.executionAttemptId ||
    value.executionReceipt.invocationRequestId !== value.invocationRequestId ||
    value.executionReceipt.invocationRequestFingerprint !== value.invocationRequestFingerprint ||
    value.executionReceipt.providerCapabilityId !== value.providerCapabilityId ||
    value.executionReceipt.providerCapabilityFingerprint !== value.providerCapabilityFingerprint ||
    value.executionReceipt.attemptNumber !== value.attemptNumber ||
    value.executionReceipt.outcome !== value.outcome ||
    value.executionReceipt.completedAt !== value.completedAt ||
    value.usageEvidence.executionAttemptId !== value.executionAttemptId ||
    value.usageEvidence.attemptNumber !== value.attemptNumber ||
    value.costEvidence.executionAttemptId !== value.executionAttemptId
  ) {
    context.addIssue({
      code: "custom",
      message: "Result Envelope operational evidence must preserve exact execution bindings",
      path: ["executionReceipt"],
    });
  }
  const outcomeEvidence =
    value.outcome === "failed"
      ? value.failureEvidence
      : value.outcome === "timed-out"
        ? value.timeoutEvidence
        : value.outcome === "cancelled"
          ? value.cancellationEvidence
          : null;
  if (
    outcomeEvidence !== null &&
    (outcomeEvidence.executionAttemptId !== value.executionAttemptId ||
      outcomeEvidence.invocationRequestId !== value.invocationRequestId)
  ) {
    context.addIssue({
      code: "custom",
      message: "Terminal outcome evidence must bind the Result Invocation and Attempt",
      path: ["outcome"],
    });
  }
  if (value.outcome === "failed" && value.failureEvidence.attemptNumber !== value.attemptNumber) {
    context.addIssue({
      code: "custom",
      message: "Result Failure Evidence must bind the Result Attempt number",
      path: ["failureEvidence", "attemptNumber"],
    });
  }
}

const ReasoningResultEnvelopeVariantSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      ...ReasoningResultBase,
      outcome: z.literal("succeeded"),
      outputContent: ReasoningOutputContentSchema,
      outputCharacterCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
      outputContentFingerprint: Sha256DigestSchema,
    })
    .strict(),
  z
    .object({
      ...ReasoningResultBase,
      outcome: z.literal("failed"),
      failureEvidence: ReasoningFailureEvidenceSchema,
    })
    .strict(),
  z
    .object({
      ...ReasoningResultBase,
      outcome: z.literal("timed-out"),
      timeoutEvidence: ReasoningTimeoutEvidenceSchema,
    })
    .strict(),
  z
    .object({
      ...ReasoningResultBase,
      outcome: z.literal("cancelled"),
      cancellationEvidence: ReasoningCancellationEvidenceSchema,
    })
    .strict(),
]);

export const ReasoningResultEnvelopeSchema = DurableCanonicalJsonValueSchema.pipe(
  ReasoningResultEnvelopeVariantSchema.superRefine(validateResultBindings),
);

export const ReasoningAttemptHistoryEntrySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      executionAttemptId: IdentifierSchema,
      attemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      outcome: ReasoningOutcomeStatusSchema,
      attemptFingerprint: Sha256DigestSchema,
      outcomeFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ReasoningAttemptHistorySummarySchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      attemptCount: z.number().int().positive().max(MAX_SAFE_INTEGER),
      finalAttemptNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
      finalOutcome: ReasoningOutcomeStatusSchema,
      attempts: z.array(ReasoningAttemptHistoryEntrySchema).min(1),
      historyFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const sequential = value.attempts.every(
        (attempt, index) => attempt.attemptNumber === index + 1,
      );
      const finalAttempt = value.attempts.at(-1)!;
      if (
        !sequential ||
        new Set(value.attempts.map((attempt) => attempt.executionAttemptId)).size !==
          value.attempts.length ||
        value.attemptCount !== value.attempts.length ||
        value.finalAttemptNumber !== finalAttempt.attemptNumber ||
        value.finalOutcome !== finalAttempt.outcome
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Attempt history must be unique, sequential, complete, and bind its final outcome",
          path: ["attempts"],
        });
      }
    }),
);

const FinalizedConsumptionBase = {
  schemaVersion: ReasoningContractVersionSchema,
  consumptionId: IdentifierSchema,
  deliveryReceiptId: IdentifierSchema,
  deliveryReceiptFingerprint: Sha256DigestSchema,
  deliveryTransactionId: IdentifierSchema,
  invocationRequestId: IdentifierSchema,
  invocationRequestFingerprint: Sha256DigestSchema,
  invocationIdempotencyKey: ReasoningInvocationIdempotencyKeySchema,
  providerCapabilityId: IdentifierSchema,
  providerCapabilityFingerprint: Sha256DigestSchema,
  finalResultEnvelopeId: IdentifierSchema,
  finalResultEnvelopeFingerprint: Sha256DigestSchema,
  attemptHistorySummary: ReasoningAttemptHistorySummarySchema,
  startedAt: IsoTemporalSchema,
  completedAt: IsoTemporalSchema,
  usageEvidenceFingerprint: Sha256DigestSchema,
  costEvidenceFingerprint: Sha256DigestSchema,
  executionLedgerTransactionId: IdentifierSchema,
  consumptionFingerprint: Sha256DigestSchema,
} as const;

export const FinalizedReasoningConsumptionEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .discriminatedUnion("finalOutcome", [
      z.object({ ...FinalizedConsumptionBase, finalOutcome: z.literal("succeeded") }).strict(),
      z
        .object({
          ...FinalizedConsumptionBase,
          finalOutcome: z.literal("failed"),
          failureEvidenceFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          ...FinalizedConsumptionBase,
          finalOutcome: z.literal("timed-out"),
          timeoutEvidenceFingerprint: Sha256DigestSchema,
        })
        .strict(),
      z
        .object({
          ...FinalizedConsumptionBase,
          finalOutcome: z.literal("cancelled"),
          cancellationEvidenceFingerprint: Sha256DigestSchema,
        })
        .strict(),
    ])
    .superRefine((value, context) => {
      if (
        compareTemporal(value.completedAt, value.startedAt) < 0 ||
        value.attemptHistorySummary.finalOutcome !== value.finalOutcome
      ) {
        context.addIssue({
          code: "custom",
          message: "Finalized Consumption timing and final Attempt outcome must agree",
          path: ["finalOutcome"],
        });
      }
    }),
);

export const ReasoningVerificationArtifactTypeSchema = z.enum([
  "cancellation-evidence",
  "compatibility-result",
  "cost-evidence",
  "execution-attempt",
  "execution-policy",
  "execution-receipt",
  "failure-evidence",
  "finalized-consumption-evidence",
  "invocation-request",
  "provider-capability-descriptor",
  "provider-outcome",
  "reasoning-input",
  "result-envelope",
  "timeout-evidence",
  "usage-evidence",
]);
export const ReasoningVerificationIssueCodeSchema = z.enum([
  "attempt_binding_mismatch",
  "attempt_order_invalid",
  "budget_exceeded",
  "consumer_binding_mismatch",
  "context_package_binding_mismatch",
  "credential_material_detected",
  "delivery_binding_mismatch",
  "execution_policy_binding_mismatch",
  "fingerprint_mismatch",
  "invalid_artifact",
  "noncanonical_value",
  "outcome_contradiction",
  "physical_path_detected",
  "provider_capability_binding_mismatch",
  "receipt_binding_mismatch",
  "unsafe_content",
]);
export const ReasoningVerificationIssueSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      code: ReasoningVerificationIssueCodeSchema,
      path: ReasoningLogicalReferenceSchema,
      message: ReasoningNonEmptyCanonicalTextSchema,
    })
    .strict(),
);
export const ReasoningArtifactVerificationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: ReasoningContractVersionSchema,
      artifactType: ReasoningVerificationArtifactTypeSchema,
      status: z.enum(["invalid", "valid"]),
      fingerprint: Sha256DigestSchema.nullable(),
      issues: z.array(ReasoningVerificationIssueSchema),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        (value.status === "valid") !==
        (value.fingerprint !== null && value.issues.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          message: "Verification status, fingerprint, and issues must agree",
          path: ["status"],
        });
      }
      const keys = value.issues.map((issue) => `${issue.code}\0${issue.path}\0${issue.message}`);
      requireSortedUnique(keys, context, ["issues"], "Verification issues");
    }),
);

export type ReasoningInstructionBlock = z.infer<typeof ReasoningInstructionBlockSchema>;
export type ReasoningConstraintBlock = z.infer<typeof ReasoningConstraintBlockSchema>;
export type ProviderNeutralReasoningInput = z.infer<typeof ProviderNeutralReasoningInputSchema>;
export type ReasoningExecutionPolicy = z.infer<typeof ReasoningExecutionPolicySchema>;
export type ReasoningProviderCapabilityRequirements = z.infer<
  typeof ReasoningProviderCapabilityRequirementsSchema
>;
export type ReasoningProviderCapabilityDescriptor = z.infer<
  typeof ReasoningProviderCapabilityDescriptorSchema
>;
export type ReasoningProviderCompatibilityResult = z.infer<
  typeof ReasoningProviderCompatibilityResultSchema
>;
export type ReasoningInvocationRequest = z.infer<typeof ReasoningInvocationRequestSchema>;
export type ReasoningExecutionAttempt = z.infer<typeof ReasoningExecutionAttemptSchema>;
export type ReasoningProviderOutcome = z.infer<typeof ReasoningProviderOutcomeSchema>;
export type ReasoningExecutionReceipt = z.infer<typeof ReasoningExecutionReceiptSchema>;
export type ReasoningUsageEvidence = z.infer<typeof ReasoningUsageEvidenceSchema>;
export type ReasoningCostEvidence = z.infer<typeof ReasoningCostEvidenceSchema>;
export type ReasoningFailureEvidence = z.infer<typeof ReasoningFailureEvidenceSchema>;
export type ReasoningTimeoutEvidence = z.infer<typeof ReasoningTimeoutEvidenceSchema>;
export type ReasoningCancellationEvidence = z.infer<typeof ReasoningCancellationEvidenceSchema>;
export type ReasoningResultEnvelope = z.infer<typeof ReasoningResultEnvelopeSchema>;
export type ReasoningAttemptHistorySummary = z.infer<typeof ReasoningAttemptHistorySummarySchema>;
export type FinalizedReasoningConsumptionEvidence = z.infer<
  typeof FinalizedReasoningConsumptionEvidenceSchema
>;
export type ReasoningArtifactVerificationResult = z.infer<
  typeof ReasoningArtifactVerificationResultSchema
>;
