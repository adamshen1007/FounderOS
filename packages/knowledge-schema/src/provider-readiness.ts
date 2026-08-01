import { z } from "zod";

import {
  DurableCanonicalJsonValueSchema,
  type DurableCanonicalJsonValue,
} from "./canonical-json.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";
import {
  ReasoningCancellationModeSchema,
  ReasoningInputContentTypeSchema,
  ReasoningOutputContentTypeSchema,
} from "./reasoning.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const LOGICAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/u;
const WINDOWS_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\[^\\\s]+)/u;
const POSIX_PHYSICAL_PATH_PATTERN =
  /(?:^|[\s([{'"=:;,])\/(?!\/)[^\s)\]}>'",;\\/]+(?:\/[^\s)\]}>'",;\\/]*)*/u;
const URL_PATTERN = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/iu;
const CREDENTIAL_PAIR_PATTERN =
  /(?:api[_ -]?key|access[_ -]?token|authorization|bearer|password|private[_ -]?key|client[_ -]?secret|credential)\s*[:=]\s*\S+/iu;
const CREDENTIAL_VALUE_PATTERN =
  /(?:\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b|\bgh[pousr]_[A-Za-z0-9]+\b|\bxox[baprs]-[A-Za-z0-9-]+\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+)/u;
const CREDENTIAL_KEY_PATTERN =
  /(?:apikey|accesstoken|bearer|password|privatekey|clientsecret|credentialvalue|secretvalue|rawsecret|secretbytes|environmentdump|envdump)/u;

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
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
    !URL_PATTERN.test(value) &&
    !CREDENTIAL_PAIR_PATTERN.test(value) &&
    !CREDENTIAL_VALUE_PATTERN.test(value)
  );
}

function isSafeLogicalReference(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.trim() &&
    isSafeText(value) &&
    LOGICAL_REFERENCE_PATTERN.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.split("/").some((segment) => segment === "." || segment === "..") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(value)
  );
}

function containsUnsafeMaterial(value: DurableCanonicalJsonValue): boolean {
  if (typeof value === "string") return !isSafeText(value);
  if (Array.isArray(value)) return value.some(containsUnsafeMaterial);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => {
      const normalizedKey = key
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^a-z0-9]/gu, "");
      return (
        !isSafeText(key) ||
        CREDENTIAL_KEY_PATTERN.test(normalizedKey) ||
        containsUnsafeMaterial(nested)
      );
    });
  }
  return false;
}

function isSortedUnique<T extends number | string>(values: readonly T[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function requireSortedUnique<T extends number | string>(
  values: readonly T[],
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

const CanonicalValueSchema = DurableCanonicalJsonValueSchema.refine(
  (value) => !containsUnsafeMaterial(value),
  "Canonical readiness evidence cannot contain URLs, physical paths, or credential-like material",
);

export const ProviderReadinessContractVersionSchema = z.literal("1.0");
export const ProviderReadinessIdentifierSchema = z
  .string()
  .refine((value) => value === value.trim(), "Identifiers cannot contain surrounding whitespace")
  .regex(IDENTIFIER_PATTERN, "Expected a canonical provider-readiness identifier");
export const ProviderReadinessLogicalReferenceSchema = z
  .string()
  .refine(isSafeLogicalReference, "Expected a safe logical reference");
export const ProviderReadinessSafeTextSchema = z
  .string()
  .refine(isSafeText, "Expected canonical credential-private, path-private, URL-private text");
export const ProviderReadinessNonEmptySafeTextSchema = ProviderReadinessSafeTextSchema.refine(
  (value) => value.length > 0 && value === value.trim(),
  "Expected non-empty text without surrounding whitespace",
);

const PositiveIntegerSchema = z.number().int().positive().max(MAX_SAFE_INTEGER);
// Response fixture mapping adds one byte for the deterministic oversized case.
const MaximumResponseBytesSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_SAFE_INTEGER - 1);
const NonNegativeIntegerSchema = z.number().int().nonnegative().max(MAX_SAFE_INTEGER);
const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/u, "Expected an ISO 4217 currency identifier");

export const ProductionProviderAdapterStateSchema = z.enum([
  "disabled",
  "validation-only",
  "dry-run-mapping",
]);
export const ProviderCredentialReferenceClassSchema = z.enum([
  "evaluation-fixture-reference",
  "external-secret-store-reference",
  "unavailable-reference",
]);
export const ProductionProviderAdapterDescriptorSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      providerCapabilityId: ProviderReadinessIdentifierSchema,
      providerCapabilityFingerprint: Sha256DigestSchema,
      requestMappingVersion: ProviderReadinessContractVersionSchema,
      responseMappingVersion: ProviderReadinessContractVersionSchema,
      transportPolicyVersion: ProviderReadinessContractVersionSchema,
      observabilityPolicyVersion: ProviderReadinessContractVersionSchema,
      credentialReferenceClass: ProviderCredentialReferenceClassSchema,
      state: ProductionProviderAdapterStateSchema,
      adapterFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const AuthorizationDecisionOutcomeSchema = z.enum([
  "allowed",
  "denied",
  "review-required",
  "not-evaluated",
  "expired",
  "invalid-evidence",
]);
export const ProviderAuthorizationOperationSchema = z.enum([
  "evaluate-provider-readiness",
  "prepare-provider-request",
  "validate-provider-adapter",
]);
export const AuthorizationReasonCodeSchema = z.enum([
  "authorization_allowed",
  "authorization_denied",
  "authorization_expired",
  "authorization_invalid_evidence",
  "authorization_not_evaluated",
  "authorization_review_required",
]);
const AUTHORIZATION_OUTCOME_REASON = {
  allowed: "authorization_allowed",
  denied: "authorization_denied",
  "review-required": "authorization_review_required",
  "not-evaluated": "authorization_not_evaluated",
  expired: "authorization_expired",
  "invalid-evidence": "authorization_invalid_evidence",
} as const;
export const AuthorizationDecisionEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      authorizationDecisionId: ProviderReadinessIdentifierSchema,
      subjectReference: ProviderReadinessLogicalReferenceSchema,
      consumerId: ProviderReadinessIdentifierSchema,
      consumerDescriptorFingerprint: Sha256DigestSchema,
      invocationRequestId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      deliveryTransactionId: ProviderReadinessIdentifierSchema,
      deliveryTransactionFingerprint: Sha256DigestSchema,
      contextPackageId: ProviderReadinessIdentifierSchema,
      contextPackageFingerprint: Sha256DigestSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      requestedOperation: ProviderAuthorizationOperationSchema,
      decisionAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      decidedAt: IsoTemporalSchema,
      expiresAt: IsoTemporalSchema,
      outcome: AuthorizationDecisionOutcomeSchema,
      reasonCodes: z.array(AuthorizationReasonCodeSchema).min(1),
      decisionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Authorization reasons");
      if (compareTemporal(value.expiresAt, value.decidedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Authorization expiration must follow its decision",
          path: ["expiresAt"],
        });
      }
      if (!value.reasonCodes.includes(AUTHORIZATION_OUTCOME_REASON[value.outcome])) {
        context.addIssue({
          code: "custom",
          message: "Authorization outcome requires its matching reason",
          path: ["reasonCodes"],
        });
      }
    }),
);

export const CredentialEnvironmentClassSchema = z.enum([
  "development",
  "evaluation",
  "production",
  "staging",
  "test",
]);
export const CredentialReferenceAvailabilitySchema = z.enum([
  "available",
  "expired",
  "invalid-scope",
  "unavailable",
  "wrong-provider-family",
]);
export const CredentialReferenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      credentialReferenceId: ProviderReadinessIdentifierSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      secretStoreClass: ProviderReadinessLogicalReferenceSchema,
      scopeReference: ProviderReadinessLogicalReferenceSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      rotationVersion: ProviderReadinessLogicalReferenceSchema,
      availability: CredentialReferenceAvailabilitySchema,
      referenceFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

function isSafePublicHostname(value: string): boolean {
  if (!HOSTNAME_PATTERN.test(value) || value !== value.toLowerCase()) return false;
  const labels = value.split(".");
  if (labels.includes("localhost") || labels.includes("local") || labels.includes("internal"))
    return false;
  return ![
    "metadata.google.internal",
    "metadata.aws.internal",
    "instance-data.ec2.internal",
  ].includes(value);
}

export const ProviderHostnameSchema = z
  .string()
  .refine(isSafePublicHostname, "Expected a lowercase allowlisted public hostname, not an address");
export const ProviderDnsResolutionPolicySchema = z.enum([
  "allowlisted-public-addresses-only",
  "disabled-dry-run",
]);
export const ProviderRedirectPolicySchema = z.literal("deny");
export const ProviderTlsVersionSchema = z.enum(["TLSv1.2", "TLSv1.3"]);
export const ProviderCertificateValidationPolicySchema = z.literal(
  "system-trust-and-hostname-required",
);
export const ProviderTransportRetryPolicySchema = z.enum([
  "governed-idempotent-retry",
  "no-transport-retry",
]);
export const ProviderProxyPolicySchema = z.enum(["allowlisted-managed-proxy", "deny"]);
export const ProviderEgressClassificationSchema = z.enum([
  "approved-internal-provider",
  "public-provider",
]);
export const SecureTransportPolicySchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      transportPolicyId: ProviderReadinessIdentifierSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      allowedScheme: z.literal("https"),
      allowedHostnames: z.array(ProviderHostnameSchema).min(1),
      allowedPorts: z.array(z.number().int().min(1).max(65_535)).min(1),
      dnsResolutionPolicy: ProviderDnsResolutionPolicySchema,
      redirectPolicy: ProviderRedirectPolicySchema,
      tlsRequired: z.literal(true),
      minimumTlsVersion: ProviderTlsVersionSchema,
      certificateValidationPolicy: ProviderCertificateValidationPolicySchema,
      connectionTimeoutMilliseconds: PositiveIntegerSchema,
      requestTimeoutMilliseconds: PositiveIntegerSchema,
      maximumRequestBytes: PositiveIntegerSchema,
      maximumResponseBytes: MaximumResponseBytesSchema,
      retryTransportPolicy: ProviderTransportRetryPolicySchema,
      proxyPolicy: ProviderProxyPolicySchema,
      egressClassification: ProviderEgressClassificationSchema,
      policyFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.allowedHostnames,
        context,
        ["allowedHostnames"],
        "Allowed hostnames",
      );
      requireSortedUnique(value.allowedPorts, context, ["allowedPorts"], "Allowed ports");
      if (value.connectionTimeoutMilliseconds > value.requestTimeoutMilliseconds) {
        context.addIssue({
          code: "custom",
          message: "Connection timeout cannot exceed request timeout",
          path: ["connectionTimeoutMilliseconds"],
        });
      }
    }),
);

export const ProviderTransportPlanStatusSchema = z.enum(["rejected", "validated-dry-run"]);
export const ProviderTransportReasonCodeSchema = z.enum([
  "certificate_policy_invalid",
  "hostname_not_allowed",
  "port_not_allowed",
  "scheme_not_allowed",
  "transport_limits_invalid",
  "transport_plan_valid",
]);
export const ProviderTransportPlanSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      transportPlanId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      transportPolicyId: ProviderReadinessIdentifierSchema,
      transportPolicyFingerprint: Sha256DigestSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      scheme: z.literal("https"),
      hostname: ProviderHostnameSchema,
      port: z.number().int().min(1).max(65_535),
      dnsResolutionPolicy: ProviderDnsResolutionPolicySchema,
      redirectPolicy: ProviderRedirectPolicySchema,
      tlsRequired: z.literal(true),
      minimumTlsVersion: ProviderTlsVersionSchema,
      certificateValidationPolicy: ProviderCertificateValidationPolicySchema,
      connectionTimeoutMilliseconds: PositiveIntegerSchema,
      requestTimeoutMilliseconds: PositiveIntegerSchema,
      maximumRequestBytes: PositiveIntegerSchema,
      maximumResponseBytes: MaximumResponseBytesSchema,
      retryTransportPolicy: ProviderTransportRetryPolicySchema,
      proxyPolicy: ProviderProxyPolicySchema,
      egressClassification: ProviderEgressClassificationSchema,
      status: ProviderTransportPlanStatusSchema,
      reasonCodes: z.array(ProviderTransportReasonCodeSchema).min(1),
      planFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Transport Plan reasons");
      if (value.connectionTimeoutMilliseconds > value.requestTimeoutMilliseconds) {
        context.addIssue({
          code: "custom",
          message: "Connection timeout cannot exceed request timeout",
          path: ["connectionTimeoutMilliseconds"],
        });
      }
      if (
        (value.status === "validated-dry-run") !==
        (value.reasonCodes.length === 1 && value.reasonCodes[0] === "transport_plan_valid")
      ) {
        context.addIssue({
          code: "custom",
          message: "Transport Plan status and reasons must agree",
          path: ["status"],
        });
      }
    }),
);

export const ProviderLogicalEndpointClassificationSchema = z.enum([
  "reasoning-evaluation",
  "reasoning-generation",
]);
export const ProviderMethodClassificationSchema = z.literal("provider-request-post");
export const ProviderHeaderClassificationSchema = z.enum([
  "content-type",
  "idempotency-reference",
  "request-correlation",
]);
export const ProviderHeaderValueClassificationSchema = z.enum([
  "canonical-json",
  "logical-identifier",
  "opaque-idempotency-reference",
]);
export const ProviderRedactedHeaderPlanEntrySchema = CanonicalValueSchema.pipe(
  z
    .object({
      headerClassification: ProviderHeaderClassificationSchema,
      valueClassification: ProviderHeaderValueClassificationSchema,
    })
    .strict(),
);
export const ProviderRequestBodyMappingEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      contentType: ReasoningInputContentTypeSchema,
      instructionBlockCount: NonNegativeIntegerSchema,
      contextReferenceIncluded: z.literal(true),
      hiddenContextIncluded: z.literal(false),
      toolDefinitionsIncluded: z.literal(false),
      functionCallsIncluded: z.literal(false),
      mappingFingerprint: Sha256DigestSchema,
    })
    .strict(),
);
export const ProviderRequestInputSizeEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      inputCharacterCount: NonNegativeIntegerSchema,
      maximumInputCharacters: PositiveIntegerSchema,
      withinLimit: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.withinLimit !== value.inputCharacterCount <= value.maximumInputCharacters) {
        context.addIssue({
          code: "custom",
          message: "Input-size arithmetic must agree",
          path: ["withinLimit"],
        });
      }
    }),
);
export const ProviderTimeoutAndCancellationPlanSchema = CanonicalValueSchema.pipe(
  z
    .object({
      timeoutMilliseconds: PositiveIntegerSchema,
      cancellationMode: ReasoningCancellationModeSchema,
    })
    .strict(),
);
export const ProviderExpectedResponseConstraintsSchema = CanonicalValueSchema.pipe(
  z
    .object({
      contentType: ReasoningOutputContentTypeSchema,
      maximumResponseBytes: MaximumResponseBytesSchema,
      maximumOutputCharacters: PositiveIntegerSchema,
      requireNonEmpty: z.boolean(),
    })
    .strict(),
);
export const ProviderRequestPlanWarningCodeSchema = z.enum([
  "cost_is_estimated",
  "dry_run_only",
  "provider_usage_unavailable",
]);
export const ProviderRequestPlanSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      requestPlanId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      providerCapabilityId: ProviderReadinessIdentifierSchema,
      providerCapabilityFingerprint: Sha256DigestSchema,
      invocationRequestId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      deliveryTransactionId: ProviderReadinessIdentifierSchema,
      deliveryTransactionFingerprint: Sha256DigestSchema,
      authorizationDecisionFingerprint: Sha256DigestSchema,
      credentialReferenceId: ProviderReadinessIdentifierSchema,
      credentialReferenceFingerprint: Sha256DigestSchema,
      transportPolicyId: ProviderReadinessIdentifierSchema,
      transportPolicyFingerprint: Sha256DigestSchema,
      rateAndCapacityDecisionFingerprint: Sha256DigestSchema,
      costAndBudgetDecisionFingerprint: Sha256DigestSchema,
      logicalEndpointClassification: ProviderLogicalEndpointClassificationSchema,
      methodClassification: ProviderMethodClassificationSchema,
      redactedHeaderPlan: z.array(ProviderRedactedHeaderPlanEntrySchema),
      bodyMappingEvidence: ProviderRequestBodyMappingEvidenceSchema,
      inputSizeEvidence: ProviderRequestInputSizeEvidenceSchema,
      timeoutAndCancellationPlan: ProviderTimeoutAndCancellationPlanSchema,
      expectedResponseConstraints: ProviderExpectedResponseConstraintsSchema,
      warnings: z.array(ProviderRequestPlanWarningCodeSchema),
      requestPlanFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.redactedHeaderPlan.map((entry) => entry.headerClassification),
        context,
        ["redactedHeaderPlan"],
        "Redacted header classifications",
      );
      requireSortedUnique(value.warnings, context, ["warnings"], "Request Plan warnings");
    }),
);

export const ProviderResponseFixtureClassificationSchema = z.enum([
  "credential-rejection",
  "empty-response",
  "invalid-provider-response",
  "oversized-response",
  "provider-rate-limit",
  "provider-server-failure",
  "provider-timeout",
  "redaction-failure",
  "successful-response",
  "transport-security-failure",
]);
export const ProviderNeutralMappingOutcomeSchema = z.enum([
  "cancelled",
  "failed",
  "succeeded",
  "timed-out",
]);
export const ProviderResponseEvidenceTypeSchema = z.enum([
  "cancellation-evidence",
  "cost-evidence",
  "execution-outcome",
  "execution-receipt",
  "failure-evidence",
  "rate-limit-evidence",
  "timeout-evidence",
  "usage-evidence",
]);
const RESPONSE_FIXTURE_EXPECTATIONS = {
  "credential-rejection": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "empty-response": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "invalid-provider-response": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "oversized-response": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "provider-rate-limit": {
    outcome: "failed",
    requiredEvidence: [
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "rate-limit-evidence",
    ],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "rate-limit-evidence",
      "usage-evidence",
    ],
  },
  "provider-server-failure": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "provider-timeout": {
    outcome: "timed-out",
    requiredEvidence: ["execution-outcome", "execution-receipt", "timeout-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "timeout-evidence",
      "usage-evidence",
    ],
  },
  "redaction-failure": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
  "successful-response": {
    outcome: "succeeded",
    requiredEvidence: ["execution-outcome", "execution-receipt"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "usage-evidence",
    ],
  },
  "transport-security-failure": {
    outcome: "failed",
    requiredEvidence: ["execution-outcome", "execution-receipt", "failure-evidence"],
    permittedEvidence: [
      "cost-evidence",
      "execution-outcome",
      "execution-receipt",
      "failure-evidence",
      "usage-evidence",
    ],
  },
} as const satisfies Record<
  z.infer<typeof ProviderResponseFixtureClassificationSchema>,
  {
    readonly outcome: z.infer<typeof ProviderNeutralMappingOutcomeSchema>;
    readonly requiredEvidence: readonly z.infer<typeof ProviderResponseEvidenceTypeSchema>[];
    readonly permittedEvidence: readonly z.infer<typeof ProviderResponseEvidenceTypeSchema>[];
  }
>;
export const ProviderResponseEvidenceReferenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      evidenceType: ProviderResponseEvidenceTypeSchema,
      evidenceId: ProviderReadinessIdentifierSchema,
      fingerprint: Sha256DigestSchema,
    })
    .strict(),
);
export const ProviderResponseSanitizedMetadataSchema = CanonicalValueSchema.pipe(
  z
    .object({
      outcomeClassification: z.enum(["cancelled", "failure", "success", "timeout"]),
      durationMilliseconds: NonNegativeIntegerSchema,
      responseSizeBytes: NonNegativeIntegerSchema,
      usageStatus: z.enum(["estimated", "provider-reported", "unavailable"]),
      costStatus: z.enum(["estimated", "provider-reported", "unavailable"]),
      errorCategory: ProviderReadinessLogicalReferenceSchema.optional(),
    })
    .strict(),
);
export const ProviderResponseMappingEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      mappingEvidenceId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      requestPlanId: ProviderReadinessIdentifierSchema,
      requestPlanFingerprint: Sha256DigestSchema,
      fixtureClassification: ProviderResponseFixtureClassificationSchema,
      outcome: ProviderNeutralMappingOutcomeSchema,
      evidenceReferences: z.array(ProviderResponseEvidenceReferenceSchema).min(2),
      sanitizedMetadata: ProviderResponseSanitizedMetadataSchema,
      providerResponseReferenceFingerprint: Sha256DigestSchema,
      mappingEvidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const referenceKeys = value.evidenceReferences.map(
        (reference) => `${reference.evidenceType}\0${reference.evidenceId}`,
      );
      requireSortedUnique(
        referenceKeys,
        context,
        ["evidenceReferences"],
        "Response evidence references",
      );
      const evidenceTypes = value.evidenceReferences.map((reference) => reference.evidenceType);
      if (
        !evidenceTypes.includes("execution-outcome") ||
        !evidenceTypes.includes("execution-receipt")
      ) {
        context.addIssue({
          code: "custom",
          message: "Response Mapping requires outcome and receipt evidence references",
          path: ["evidenceReferences"],
        });
      }
      const outcomeMap = {
        cancelled: "cancelled",
        failed: "failure",
        succeeded: "success",
        "timed-out": "timeout",
      } as const;
      if (value.sanitizedMetadata.outcomeClassification !== outcomeMap[value.outcome]) {
        context.addIssue({
          code: "custom",
          message: "Sanitized outcome classification must match the mapped outcome",
          path: ["sanitizedMetadata", "outcomeClassification"],
        });
      }
      const fixtureExpectation = RESPONSE_FIXTURE_EXPECTATIONS[value.fixtureClassification];
      if (value.outcome !== fixtureExpectation.outcome) {
        context.addIssue({
          code: "custom",
          message: "Response fixture classification and mapped outcome must agree",
          path: ["outcome"],
        });
      }
      if (
        fixtureExpectation.requiredEvidence.some(
          (requiredType) => !evidenceTypes.includes(requiredType),
        ) ||
        evidenceTypes.some(
          (evidenceType) =>
            !(fixtureExpectation.permittedEvidence as readonly string[]).includes(evidenceType),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Response fixture requires its exact permitted evidence classes",
          path: ["evidenceReferences"],
        });
      }
    }),
);

export const ProviderCapacityStateSchema = z.enum(["available", "degraded", "unavailable"]);
export const ProviderInvocationPriorityClassSchema = z.enum(["critical", "high", "low", "normal"]);
export const ProviderRateAndCapacityOutcomeSchema = z.enum([
  "admitted",
  "capacity-exhausted",
  "policy-denied",
  "provider-unavailable",
  "queue-full",
  "rate-limited",
]);
export const ProviderRateAndCapacityReasonCodeSchema = z.enum([
  "admitted",
  "capacity_exhausted",
  "consumer_quota_exceeded",
  "policy_denied",
  "provider_unavailable",
  "queue_full",
  "rate_limit_exceeded",
]);
export const ProviderRateAndCapacityDecisionSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      decisionId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      adapterFingerprint: Sha256DigestSchema,
      capacityPolicyVersion: ProviderReadinessContractVersionSchema,
      evaluatedAt: IsoTemporalSchema,
      windowStartedAt: IsoTemporalSchema,
      windowDurationMilliseconds: PositiveIntegerSchema,
      requestsInWindow: NonNegativeIntegerSchema,
      requestLimit: PositiveIntegerSchema,
      concurrentInFlight: NonNegativeIntegerSchema,
      concurrentLimit: PositiveIntegerSchema,
      queuedRequests: NonNegativeIntegerSchema,
      maximumQueuedRequests: NonNegativeIntegerSchema,
      consumerQuotaUsed: NonNegativeIntegerSchema,
      consumerQuotaLimit: PositiveIntegerSchema,
      providerCapacityState: ProviderCapacityStateSchema,
      priorityClass: ProviderInvocationPriorityClassSchema,
      retryAfterMilliseconds: PositiveIntegerSchema.nullable(),
      outcome: ProviderRateAndCapacityOutcomeSchema,
      reasonCodes: z.array(ProviderRateAndCapacityReasonCodeSchema).min(1),
      decisionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Rate and Capacity reasons");
      if (compareTemporal(value.evaluatedAt, value.windowStartedAt) < 0) {
        context.addIssue({
          code: "custom",
          message: "Evaluation cannot precede its governed window",
          path: ["evaluatedAt"],
        });
      }
      if (
        value.outcome === "admitted" &&
        (value.reasonCodes.length !== 1 ||
          value.reasonCodes[0] !== "admitted" ||
          value.retryAfterMilliseconds !== null)
      ) {
        context.addIssue({
          code: "custom",
          message: "Admitted decisions require only admitted evidence and no retry-after",
          path: ["outcome"],
        });
      }
      if (value.outcome !== "admitted" && value.reasonCodes.includes("admitted")) {
        context.addIssue({
          code: "custom",
          message: "Rejected decisions cannot carry an admitted reason",
          path: ["reasonCodes"],
        });
      }
    }),
);

export const PricingReferenceAvailabilitySchema = z.enum(["available", "unavailable"]);
export const PricingReferenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      pricingReferenceId: ProviderReadinessIdentifierSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      pricingVersion: ProviderReadinessLogicalReferenceSchema,
      currencyCode: CurrencyCodeSchema,
      inputUnitSize: PositiveIntegerSchema,
      inputUnitPriceMinorUnits: NonNegativeIntegerSchema,
      outputUnitSize: PositiveIntegerSchema,
      outputUnitPriceMinorUnits: NonNegativeIntegerSchema,
      availability: PricingReferenceAvailabilitySchema,
      effectiveAt: IsoTemporalSchema,
      pricingFingerprint: Sha256DigestSchema,
    })
    .strict(),
);
export const CostAndBudgetOutcomeSchema = z.enum([
  "cost-ceiling-exceeded",
  "input-budget-exceeded",
  "invalid-budget-evidence",
  "manual-review-required",
  "output-budget-exceeded",
  "pricing-unavailable",
  "within-budget",
]);
export const CostAndBudgetReasonCodeSchema = z.enum([
  "cost_ceiling_exceeded",
  "input_budget_exceeded",
  "invalid_budget_evidence",
  "manual_review_required",
  "output_budget_exceeded",
  "pricing_unavailable",
  "within_budget",
]);
export const CostAndBudgetDecisionSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      decisionId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      adapterFingerprint: Sha256DigestSchema,
      pricingReferenceId: ProviderReadinessIdentifierSchema,
      pricingReferenceFingerprint: Sha256DigestSchema,
      pricingReferenceVersion: ProviderReadinessLogicalReferenceSchema,
      budgetPolicyVersion: ProviderReadinessContractVersionSchema,
      budgetReference: ProviderReadinessLogicalReferenceSchema,
      currencyCode: CurrencyCodeSchema,
      estimatedInputUnits: NonNegativeIntegerSchema,
      maximumInputUnits: PositiveIntegerSchema,
      estimatedOutputUnits: NonNegativeIntegerSchema,
      maximumOutputUnits: PositiveIntegerSchema,
      estimatedMaximumCostMinorUnits: NonNegativeIntegerSchema,
      costCeilingMinorUnits: NonNegativeIntegerSchema,
      maximumAttemptCount: PositiveIntegerSchema,
      timeoutBudgetMilliseconds: PositiveIntegerSchema,
      evaluatedAt: IsoTemporalSchema,
      outcome: CostAndBudgetOutcomeSchema,
      reasonCodes: z.array(CostAndBudgetReasonCodeSchema).min(1),
      decisionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Cost and Budget reasons");
      const expectedReason = value.outcome.replaceAll("-", "_") as z.infer<
        typeof CostAndBudgetReasonCodeSchema
      >;
      if (!value.reasonCodes.includes(expectedReason)) {
        context.addIssue({
          code: "custom",
          message: "Cost and Budget outcome requires its matching reason",
          path: ["reasonCodes"],
        });
      }
      if (
        value.outcome === "within-budget" &&
        (value.estimatedInputUnits > value.maximumInputUnits ||
          value.estimatedOutputUnits > value.maximumOutputUnits ||
          value.estimatedMaximumCostMinorUnits > value.costCeilingMinorUnits)
      ) {
        context.addIssue({
          code: "custom",
          message: "Within-budget evidence cannot exceed a governed ceiling",
          path: ["outcome"],
        });
      }
    }),
);

export const ProviderCircuitStatusSchema = z.enum([
  "closed",
  "disabled",
  "half-open",
  "open",
  "quarantined",
]);
export const ProviderCircuitTransitionReasonSchema = z.enum([
  "failure_threshold_reached",
  "half_open_probe_failed",
  "half_open_probe_succeeded",
  "initial_state",
  "manual_disable",
  "open_period_elapsed",
  "policy_reset",
  "security_policy_violation",
]);
export const ProviderFailureCategorySchema = z.enum([
  "authorization-failure",
  "capacity-rejection",
  "cost-rejection",
  "credential-unavailable",
  "invalid-response",
  "rate-limit",
  "response-mapping-failure",
  "security-policy-violation",
  "timeout",
  "transport-failure",
]);
export const ProviderFailureCountSchema = CanonicalValueSchema.pipe(
  z
    .object({
      category: ProviderFailureCategorySchema,
      count: PositiveIntegerSchema,
    })
    .strict(),
);
export const ProviderFailureWindowEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      windowStartedAt: IsoTemporalSchema,
      evaluatedAt: IsoTemporalSchema,
      totalFailureCount: NonNegativeIntegerSchema,
      failureCounts: z.array(ProviderFailureCountSchema),
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.failureCounts.map((entry) => entry.category),
        context,
        ["failureCounts"],
        "Failure categories",
      );
      if (
        value.failureCounts.reduce((total, entry) => total + entry.count, 0) !==
        value.totalFailureCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Failure counts must add to the total",
          path: ["totalFailureCount"],
        });
      }
      if (compareTemporal(value.evaluatedAt, value.windowStartedAt) < 0) {
        context.addIssue({
          code: "custom",
          message: "Failure-window evaluation cannot precede its start",
          path: ["evaluatedAt"],
        });
      }
    }),
);
export const ProviderCircuitThresholdPolicySchema = CanonicalValueSchema.pipe(
  z
    .object({
      failureThreshold: PositiveIntegerSchema,
      windowDurationMilliseconds: PositiveIntegerSchema,
      openDurationMilliseconds: PositiveIntegerSchema,
      halfOpenMaximumProbeCount: PositiveIntegerSchema,
      securityViolationQuarantines: z.boolean(),
      policyFingerprint: Sha256DigestSchema,
    })
    .strict(),
);
export const ProviderCircuitProbeAllowanceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      maximumProbeCount: NonNegativeIntegerSchema,
      remainingProbeCount: NonNegativeIntegerSchema,
      dryRunProbePermitted: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.remainingProbeCount > value.maximumProbeCount) {
        context.addIssue({
          code: "custom",
          message: "Remaining probes cannot exceed the maximum",
          path: ["remainingProbeCount"],
        });
      }
      if (value.dryRunProbePermitted !== value.remainingProbeCount > 0) {
        context.addIssue({
          code: "custom",
          message: "Dry-run probe permission must agree with the remaining allowance",
          path: ["dryRunProbePermitted"],
        });
      }
    }),
);
export const ProviderCircuitReasonCodeSchema = z.enum([
  "circuit_closed",
  "circuit_disabled",
  "circuit_half_open",
  "circuit_open",
  "circuit_quarantined",
]);
export const CircuitStateSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      circuitStateId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      state: ProviderCircuitStatusSchema,
      previousState: ProviderCircuitStatusSchema.nullable(),
      transitionReason: ProviderCircuitTransitionReasonSchema,
      failureWindowEvidence: ProviderFailureWindowEvidenceSchema,
      thresholdPolicy: ProviderCircuitThresholdPolicySchema,
      openedAt: IsoTemporalSchema.nullable(),
      nextEvaluationAt: IsoTemporalSchema.nullable(),
      probeAllowance: ProviderCircuitProbeAllowanceSchema,
      evaluatedAt: IsoTemporalSchema,
      reasonCodes: z.array(ProviderCircuitReasonCodeSchema).min(1),
      stateFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Circuit reasons");
      const expectedReason = `circuit_${value.state.replace("-", "_")}` as z.infer<
        typeof ProviderCircuitReasonCodeSchema
      >;
      if (!value.reasonCodes.includes(expectedReason)) {
        context.addIssue({
          code: "custom",
          message: "Circuit state requires its matching reason",
          path: ["reasonCodes"],
        });
      }
      const isOpenLike = value.state === "open" || value.state === "half-open";
      if (isOpenLike !== (value.openedAt !== null && value.nextEvaluationAt !== null)) {
        context.addIssue({
          code: "custom",
          message: "Open and half-open states require opening and reevaluation timestamps",
          path: ["openedAt"],
        });
      }
      if ((value.state === "half-open") !== value.probeAllowance.dryRunProbePermitted) {
        context.addIssue({
          code: "custom",
          message: "Only half-open state may permit bounded dry-run probes",
          path: ["probeAllowance"],
        });
      }
      if (
        value.probeAllowance.maximumProbeCount > value.thresholdPolicy.halfOpenMaximumProbeCount ||
        value.probeAllowance.remainingProbeCount > value.thresholdPolicy.halfOpenMaximumProbeCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Circuit probe allowance cannot exceed its threshold policy",
          path: ["probeAllowance"],
        });
      }
      if (
        isOpenLike &&
        value.openedAt !== null &&
        value.nextEvaluationAt !== null &&
        (compareTemporal(value.openedAt, value.evaluatedAt) > 0 ||
          compareTemporal(value.evaluatedAt, value.nextEvaluationAt) > 0 ||
          compareTemporal(value.openedAt, value.nextEvaluationAt) > 0)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Open and half-open Circuit chronology requires openedAt through evaluatedAt through nextEvaluationAt",
          path: ["evaluatedAt"],
        });
      }
      if (compareTemporal(value.failureWindowEvidence.evaluatedAt, value.evaluatedAt) > 0) {
        context.addIssue({
          code: "custom",
          message: "Circuit evaluation cannot precede its failure-window evidence",
          path: ["failureWindowEvidence", "evaluatedAt"],
        });
      }
      if (value.transitionReason === "initial_state" && value.previousState !== null) {
        context.addIssue({
          code: "custom",
          message: "Initial Circuit state cannot have a previous state",
          path: ["previousState"],
        });
      }
    }),
);

export const ProviderHealthStateSchema = z.enum([
  "degraded",
  "disabled",
  "healthy",
  "quarantined",
  "unavailable",
  "unknown",
]);
export const ProviderGateReadinessSchema = z.enum(["not-assessed", "not-ready", "ready"]);
export const ProviderHealthReasonCodeSchema = z.enum([
  "authorization_not_ready",
  "circuit_not_ready",
  "cost_not_ready",
  "credential_not_available",
  "degraded",
  "disabled",
  "healthy",
  "observability_not_ready",
  "quarantined",
  "rate_capacity_not_ready",
  "transport_not_ready",
  "unknown",
  "unavailable",
]);
export const ProviderHealthEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      healthEvidenceId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      healthState: ProviderHealthStateSchema,
      circuitState: ProviderCircuitStatusSchema,
      circuitStateFingerprint: Sha256DigestSchema,
      credentialReferenceAvailability: CredentialReferenceAvailabilitySchema,
      authorizationReadiness: ProviderGateReadinessSchema,
      transportPolicyReadiness: ProviderGateReadinessSchema,
      rateAndCapacityReadiness: ProviderGateReadinessSchema,
      costReadiness: ProviderGateReadinessSchema,
      observabilityReadiness: ProviderGateReadinessSchema,
      lastEvaluatedAt: IsoTemporalSchema,
      reasonCodes: z.array(ProviderHealthReasonCodeSchema).min(1),
      healthFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Health reasons");
      if (value.healthState === "healthy") {
        const allReady =
          value.circuitState === "closed" &&
          value.credentialReferenceAvailability === "available" &&
          value.authorizationReadiness === "ready" &&
          value.transportPolicyReadiness === "ready" &&
          value.rateAndCapacityReadiness === "ready" &&
          value.costReadiness === "ready" &&
          value.observabilityReadiness === "ready";
        if (!allReady || value.reasonCodes.length !== 1 || value.reasonCodes[0] !== "healthy") {
          context.addIssue({
            code: "custom",
            message: "Healthy evidence requires every bound gate to be ready",
            path: ["healthState"],
          });
        }
      }
      if (value.healthState === "disabled" && value.circuitState !== "disabled") {
        context.addIssue({
          code: "custom",
          message: "Disabled Health requires a disabled Circuit",
          path: ["circuitState"],
        });
      }
      if (value.healthState === "quarantined" && value.circuitState !== "quarantined") {
        context.addIssue({
          code: "custom",
          message: "Quarantined Health requires a quarantined Circuit",
          path: ["circuitState"],
        });
      }
    }),
);

export const ProviderObservabilityOutcomeClassificationSchema = z.enum([
  "disabled-by-policy",
  "failed",
  "not-ready",
  "ready-for-dry-run",
  "rejected",
  "succeeded",
  "timed-out",
]);
export const ProviderStableErrorCategorySchema = z.enum([
  "authorization",
  "capacity",
  "circuit",
  "cost",
  "credential",
  "mapping",
  "policy",
  "redaction",
  "transport",
]);
export const ProviderStructuredLogSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      logEventId: ProviderReadinessIdentifierSchema,
      occurredAt: IsoTemporalSchema,
      level: z.enum(["error", "info", "warn"]),
      eventType: z.enum([
        "provider-admission-evaluated",
        "provider-mapping-evaluated",
        "provider-readiness-evaluated",
      ]),
      correlationId: ProviderReadinessIdentifierSchema,
      deliveryTransactionId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      requestPlanFingerprint: Sha256DigestSchema.optional(),
      outcomeClassification: ProviderObservabilityOutcomeClassificationSchema,
      durationMilliseconds: NonNegativeIntegerSchema,
      usageUnitCount: NonNegativeIntegerSchema.optional(),
      costMinorUnits: NonNegativeIntegerSchema.optional(),
      currencyCode: CurrencyCodeSchema.optional(),
      rateLimitStatus: ProviderRateAndCapacityOutcomeSchema,
      circuitState: ProviderCircuitStatusSchema,
      retryCount: NonNegativeIntegerSchema,
      errorCategory: ProviderStableErrorCategorySchema.optional(),
      logFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if ((value.costMinorUnits !== undefined) !== (value.currencyCode !== undefined)) {
        context.addIssue({
          code: "custom",
          message: "Cost summaries require an ISO currency",
          path: ["currencyCode"],
        });
      }
    }),
);

export const ProviderMetricNameSchema = z.enum([
  "provider_admission_duration_milliseconds",
  "provider_mapping_duration_milliseconds",
  "provider_readiness_evaluation_total",
  "provider_request_size_bytes",
  "provider_response_size_bytes",
]);
export const ProviderMetricLabelNameSchema = z.enum([
  "adapter_class",
  "circuit_state",
  "environment_class",
  "error_category",
  "outcome",
  "priority_class",
]);
const BoundedAttributeValueSchema = ProviderReadinessNonEmptySafeTextSchema.max(128);
export const ProviderMetricLabelSchema = CanonicalValueSchema.pipe(
  z.object({ name: ProviderMetricLabelNameSchema, value: BoundedAttributeValueSchema }).strict(),
);
export const ProviderBoundedMetricSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      metricId: ProviderReadinessIdentifierSchema,
      metricName: ProviderMetricNameSchema,
      value: z.number().finite().nonnegative(),
      unit: z.enum(["bytes", "count", "milliseconds", "minor-units"]),
      labels: z.array(ProviderMetricLabelSchema).max(16),
      observedAt: IsoTemporalSchema,
      metricFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.labels.map((label) => label.name),
        context,
        ["labels"],
        "Metric label names",
      );
    }),
);

export const ProviderTraceAttributeNameSchema = z.enum([
  "adapter_class",
  "circuit_state",
  "error_category",
  "outcome",
  "rate_limit_status",
]);
export const ProviderTraceAttributeSchema = CanonicalValueSchema.pipe(
  z.object({ name: ProviderTraceAttributeNameSchema, value: BoundedAttributeValueSchema }).strict(),
);
export const ProviderBoundedTraceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      traceEvidenceId: ProviderReadinessIdentifierSchema,
      traceId: ProviderReadinessIdentifierSchema,
      spanId: ProviderReadinessIdentifierSchema,
      operation: z.enum([
        "evaluate-provider-admission",
        "evaluate-provider-readiness",
        "map-provider-request-dry-run",
      ]),
      status: z.enum(["error", "ok"]),
      startedAt: IsoTemporalSchema,
      endedAt: IsoTemporalSchema,
      attributes: z.array(ProviderTraceAttributeSchema).max(16),
      traceFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.attributes.map((attribute) => attribute.name),
        context,
        ["attributes"],
        "Trace attribute names",
      );
      if (compareTemporal(value.endedAt, value.startedAt) < 0) {
        context.addIssue({
          code: "custom",
          message: "Trace end cannot precede its start",
          path: ["endedAt"],
        });
      }
    }),
);

export const ProviderPublicErrorCodeSchema = z.enum([
  "provider_authorization_failed",
  "provider_budget_rejected",
  "provider_capacity_rejected",
  "provider_mapping_failed",
  "provider_not_ready",
  "provider_policy_rejected",
]);
export const ProviderPublicErrorSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      errorId: ProviderReadinessIdentifierSchema,
      correlationId: ProviderReadinessIdentifierSchema,
      category: ProviderStableErrorCategorySchema,
      code: ProviderPublicErrorCodeSchema,
      message: ProviderReadinessNonEmptySafeTextSchema.max(256),
      retryable: z.boolean(),
      errorFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const ObservabilityReadinessStatusSchema = z.enum(["not-ready", "ready"]);
export const ObservabilityReadinessReasonCodeSchema = z.enum([
  "metric_cardinality_unbounded",
  "observability_not_ready",
  "observability_ready",
  "redaction_failed",
  "unsafe_log_field",
  "unsafe_trace_attribute",
]);
export const ObservabilityReadinessEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      readinessEvidenceId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      redactionPolicyVersion: ProviderReadinessContractVersionSchema,
      maximumLogFieldCharacters: PositiveIntegerSchema.max(1_024),
      maximumTraceAttributeCharacters: PositiveIntegerSchema.max(256),
      maximumMetricLabelCount: PositiveIntegerSchema.max(16),
      structuredLogFingerprint: Sha256DigestSchema,
      metricFingerprints: z.array(Sha256DigestSchema),
      traceFingerprints: z.array(Sha256DigestSchema),
      publicErrorFingerprints: z.array(Sha256DigestSchema),
      status: ObservabilityReadinessStatusSchema,
      reasonCodes: z.array(ObservabilityReadinessReasonCodeSchema).min(1),
      evaluatedAt: IsoTemporalSchema,
      readinessFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      for (const field of [
        "metricFingerprints",
        "traceFingerprints",
        "publicErrorFingerprints",
      ] as const) {
        requireSortedUnique(value[field], context, [field], field);
      }
      requireSortedUnique(value.reasonCodes, context, ["reasonCodes"], "Observability reasons");
      if (
        (value.status === "ready") !==
        (value.reasonCodes.length === 1 && value.reasonCodes[0] === "observability_ready")
      ) {
        context.addIssue({
          code: "custom",
          message: "Observability readiness status and reasons must agree",
          path: ["status"],
        });
      }
    }),
);

export const ProviderObservabilityRetentionEvidenceSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      retentionEvidenceId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      invocationRequestId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      observabilityReadinessEvidenceId: ProviderReadinessIdentifierSchema,
      observabilityReadinessFingerprint: Sha256DigestSchema,
      sinkPolicyVersion: ProviderReadinessContractVersionSchema,
      maximumEntriesPerArtifact: PositiveIntegerSchema.max(10_000),
      maximumMetricLabelCardinality: PositiveIntegerSchema.max(1_000),
      retainedLogCount: z.number().int().min(0).max(10_000),
      retainedMetricCount: z.number().int().min(0).max(10_000),
      retainedTraceCount: z.number().int().min(0).max(10_000),
      retainedPublicErrorCount: z.number().int().min(0).max(10_000),
      retainedLogFingerprints: z.array(Sha256DigestSchema),
      retainedMetricFingerprints: z.array(Sha256DigestSchema),
      retainedTraceFingerprints: z.array(Sha256DigestSchema),
      retainedPublicErrorFingerprints: z.array(Sha256DigestSchema),
      canonicalSnapshotFingerprint: Sha256DigestSchema,
      appendCount: z.literal(1),
      retentionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      const bindings = [
        [value.retainedLogCount, value.retainedLogFingerprints, "retainedLogFingerprints"],
        [value.retainedMetricCount, value.retainedMetricFingerprints, "retainedMetricFingerprints"],
        [value.retainedTraceCount, value.retainedTraceFingerprints, "retainedTraceFingerprints"],
        [
          value.retainedPublicErrorCount,
          value.retainedPublicErrorFingerprints,
          "retainedPublicErrorFingerprints",
        ],
      ] as const;
      for (const [count, fingerprints, field] of bindings) {
        if (count !== fingerprints.length) {
          context.addIssue({
            code: "custom",
            message: "Retention counts must match ordered fingerprint evidence",
            path: [field],
          });
        }
        if (new Set(fingerprints).size !== fingerprints.length) {
          context.addIssue({
            code: "custom",
            message: "Retention fingerprint evidence must be unique",
            path: [field],
          });
        }
      }
      if (
        value.retainedLogCount !== 1 ||
        value.retainedMetricCount !== 2 ||
        value.retainedTraceCount !== 1 ||
        value.retainedPublicErrorCount > 1 ||
        value.maximumEntriesPerArtifact < 2
      ) {
        context.addIssue({
          code: "custom",
          message: "Retention evidence does not preserve the exact observability bundle",
          path: ["maximumEntriesPerArtifact"],
        });
      }
    }),
);

export const ProductionProviderReadinessStatusSchema = z.enum([
  "disabled-by-policy",
  "not-assessed",
  "not-ready",
  "ready-for-dry-run",
]);
export const ProviderReadinessBlockingReasonCodeSchema = z.enum([
  "adapter_disabled",
  "adapter_invalid",
  "authorization_not_allowed",
  "capability_incompatible",
  "circuit_not_ready",
  "cost_budget_rejected",
  "credential_unavailable",
  "health_not_ready",
  "not_assessed",
  "observability_not_ready",
  "rate_capacity_rejected",
  "request_mapping_invalid",
  "transport_policy_rejected",
]);
export const ProviderReadinessWarningReasonCodeSchema = z.enum([
  "cost_is_estimated",
  "dry_run_only",
  "provider_usage_unavailable",
]);
export const ProductionProviderReadinessDecisionSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      readinessDecisionId: ProviderReadinessIdentifierSchema,
      adapterId: ProviderReadinessIdentifierSchema,
      adapterFingerprint: Sha256DigestSchema,
      invocationRequestId: ProviderReadinessIdentifierSchema,
      invocationRequestFingerprint: Sha256DigestSchema,
      authorizationDecisionFingerprint: Sha256DigestSchema.nullable(),
      credentialReferenceFingerprint: Sha256DigestSchema.nullable(),
      capabilityResultFingerprint: Sha256DigestSchema.nullable(),
      transportPolicyFingerprint: Sha256DigestSchema.nullable(),
      requestPlanFingerprint: Sha256DigestSchema.nullable(),
      rateAndCapacityDecisionFingerprint: Sha256DigestSchema.nullable(),
      costAndBudgetDecisionFingerprint: Sha256DigestSchema.nullable(),
      circuitStateFingerprint: Sha256DigestSchema.nullable(),
      healthEvidenceFingerprint: Sha256DigestSchema.nullable(),
      observabilityReadinessFingerprint: Sha256DigestSchema.nullable(),
      observabilityRetentionFingerprint: Sha256DigestSchema.nullable(),
      evaluatedAt: IsoTemporalSchema,
      status: ProductionProviderReadinessStatusSchema,
      blockingReasonCodes: z.array(ProviderReadinessBlockingReasonCodeSchema),
      warningReasonCodes: z.array(ProviderReadinessWarningReasonCodeSchema),
      decisionFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      requireSortedUnique(
        value.blockingReasonCodes,
        context,
        ["blockingReasonCodes"],
        "Readiness blockers",
      );
      requireSortedUnique(
        value.warningReasonCodes,
        context,
        ["warningReasonCodes"],
        "Readiness warnings",
      );
      const orderedGateFingerprints = [
        value.authorizationDecisionFingerprint,
        value.credentialReferenceFingerprint,
        value.capabilityResultFingerprint,
        value.transportPolicyFingerprint,
        value.rateAndCapacityDecisionFingerprint,
        value.costAndBudgetDecisionFingerprint,
        value.circuitStateFingerprint,
        value.observabilityReadinessFingerprint,
        value.observabilityRetentionFingerprint,
        value.healthEvidenceFingerprint,
        value.requestPlanFingerprint,
      ];
      const addBoundaryIssue = (message: string) =>
        context.addIssue({
          code: "custom",
          message,
          path: ["blockingReasonCodes"],
        });
      let encounteredMissingGate = false;
      for (const [index, fingerprint] of orderedGateFingerprints.entries()) {
        if (fingerprint === null) encounteredMissingGate = true;
        else if (encounteredMissingGate) {
          context.addIssue({
            code: "custom",
            message: "Readiness fingerprints must form an exact completed-gate prefix",
            path: ["requestPlanFingerprint", index],
          });
        }
      }
      if (
        value.status === "ready-for-dry-run" &&
        orderedGateFingerprints.some((fingerprint) => fingerprint === null)
      ) {
        context.addIssue({
          code: "custom",
          message: "Ready-for-dry-run decisions require every gate fingerprint",
          path: ["status"],
        });
      }
      if (value.status === "ready-for-dry-run" && value.blockingReasonCodes.length !== 0) {
        context.addIssue({
          code: "custom",
          message: "Ready-for-dry-run decisions cannot have blockers",
          path: ["blockingReasonCodes"],
        });
      }
      if (value.status === "not-ready" && value.blockingReasonCodes.length !== 1) {
        context.addIssue({
          code: "custom",
          message: "Not-ready decisions require exactly one first-blocking gate",
          path: ["blockingReasonCodes"],
        });
      }
      if (
        value.status === "disabled-by-policy" &&
        (value.blockingReasonCodes.length !== 1 ||
          value.blockingReasonCodes[0] !== "adapter_disabled")
      ) {
        context.addIssue({
          code: "custom",
          message: "Disabled-by-policy decisions require an Adapter-disabled blocker",
          path: ["blockingReasonCodes"],
        });
      }
      if (
        value.status === "not-assessed" &&
        (value.blockingReasonCodes.length !== 1 || value.blockingReasonCodes[0] !== "not_assessed")
      ) {
        context.addIssue({
          code: "custom",
          message: "Not-assessed decisions require only the not-assessed blocker",
          path: ["blockingReasonCodes"],
        });
      }
      if (value.status !== "ready-for-dry-run" && value.warningReasonCodes.length !== 0) {
        addBoundaryIssue("Only ready-for-dry-run decisions may contain warnings");
      }
      if (
        value.status === "disabled-by-policy" &&
        !(
          orderedGateFingerprints[0] !== null &&
          orderedGateFingerprints.slice(1).every((fingerprint) => fingerprint === null)
        )
      ) {
        addBoundaryIssue("Disabled decisions must stop exactly after Authorization");
      }
      if (
        value.status === "not-assessed" &&
        !orderedGateFingerprints.every((fingerprint) => fingerprint === null)
      ) {
        addBoundaryIssue("Not-assessed decisions cannot bind assessed gates");
      }
      if (
        value.status === "not-ready" &&
        (value.blockingReasonCodes[0] === "adapter_disabled" ||
          value.blockingReasonCodes[0] === "not_assessed")
      ) {
        addBoundaryIssue("Disabled and not-assessed blockers require their exact status");
      }
      const blockerBoundary = {
        adapter_invalid: { requiredThrough: 0, nullableAt: -1, nullFrom: 1 },
        authorization_not_allowed: { requiredThrough: -1, nullableAt: 0, nullFrom: 1 },
        credential_unavailable: { requiredThrough: 0, nullableAt: 1, nullFrom: 2 },
        capability_incompatible: { requiredThrough: 2, nullableAt: -1, nullFrom: 3 },
        transport_policy_rejected: { requiredThrough: 2, nullableAt: -1, nullFrom: 3 },
        rate_capacity_rejected: { requiredThrough: 3, nullableAt: 4, nullFrom: 5 },
        cost_budget_rejected: { requiredThrough: 4, nullableAt: 5, nullFrom: 6 },
        circuit_not_ready: { requiredThrough: 5, nullableAt: 6, nullFrom: 7 },
        observability_not_ready: { requiredThrough: 6, nullableAt: -1, nullFrom: 7 },
        health_not_ready: { requiredThrough: 8, nullableAt: 9, nullFrom: 10 },
        request_mapping_invalid: { requiredThrough: 9, nullableAt: -1, nullFrom: 10 },
      } as const;
      const soleBlocker = value.blockingReasonCodes[0];
      if (
        value.status === "not-ready" &&
        soleBlocker !== undefined &&
        soleBlocker in blockerBoundary
      ) {
        const boundary = blockerBoundary[soleBlocker as keyof typeof blockerBoundary];
        const requiredPresent = orderedGateFingerprints
          .slice(0, boundary.requiredThrough + 1)
          .every((fingerprint) => fingerprint !== null);
        const downstreamAbsent = orderedGateFingerprints
          .slice(boundary.nullFrom)
          .every((fingerprint) => fingerprint === null);
        if (!requiredPresent || !downstreamAbsent) {
          addBoundaryIssue("Readiness blocker does not match its exact completed-gate boundary");
        }
      }
    }),
);

export const ProviderReadinessVerificationArtifactTypeSchema = z.enum([
  "authorization-decision-evidence",
  "circuit-state",
  "cost-and-budget-decision",
  "credential-reference",
  "observability-readiness-evidence",
  "provider-observability-retention-evidence",
  "pricing-reference",
  "production-provider-adapter-descriptor",
  "production-provider-readiness-decision",
  "provider-health-evidence",
  "provider-request-plan",
  "provider-response-mapping-evidence",
  "rate-and-capacity-decision",
  "secure-transport-policy",
  "transport-plan",
]);
export const ProviderReadinessVerificationIssueCodeSchema = z.enum([
  "adapter_binding_mismatch",
  "authorization_binding_mismatch",
  "authorization_chronology_invalid",
  "capacity_arithmetic_invalid",
  "circuit_transition_invalid",
  "cost_arithmetic_invalid",
  "credential_material_detected",
  "credential_reference_invalid",
  "delivery_binding_mismatch",
  "fingerprint_mismatch",
  "health_derivation_invalid",
  "invocation_binding_mismatch",
  "live_execution_capability_detected",
  "noncanonical_value",
  "physical_path_detected",
  "readiness_derivation_invalid",
  "redaction_invalid",
  "request_mapping_invalid",
  "response_mapping_invalid",
  "transport_policy_invalid",
  "unsafe_content",
]);
export const ProviderReadinessVerificationIssueSchema = CanonicalValueSchema.pipe(
  z
    .object({
      code: ProviderReadinessVerificationIssueCodeSchema,
      path: ProviderReadinessLogicalReferenceSchema,
      message: ProviderReadinessNonEmptySafeTextSchema.max(256),
    })
    .strict(),
);
export const ProviderReadinessArtifactVerificationResultSchema = CanonicalValueSchema.pipe(
  z
    .object({
      schemaVersion: ProviderReadinessContractVersionSchema,
      artifactType: ProviderReadinessVerificationArtifactTypeSchema,
      status: z.enum(["invalid", "valid"]),
      fingerprint: Sha256DigestSchema.nullable(),
      issues: z.array(ProviderReadinessVerificationIssueSchema),
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

export type ProductionProviderAdapterDescriptor = z.infer<
  typeof ProductionProviderAdapterDescriptorSchema
>;
export type AuthorizationDecisionEvidence = z.infer<typeof AuthorizationDecisionEvidenceSchema>;
export type CredentialReference = z.infer<typeof CredentialReferenceSchema>;
export type SecureTransportPolicy = z.infer<typeof SecureTransportPolicySchema>;
export type ProviderTransportPlan = z.infer<typeof ProviderTransportPlanSchema>;
export type ProviderRequestPlan = z.infer<typeof ProviderRequestPlanSchema>;
export type ProviderResponseMappingEvidence = z.infer<typeof ProviderResponseMappingEvidenceSchema>;
export type ProviderRateAndCapacityDecision = z.infer<typeof ProviderRateAndCapacityDecisionSchema>;
export type PricingReference = z.infer<typeof PricingReferenceSchema>;
export type CostAndBudgetDecision = z.infer<typeof CostAndBudgetDecisionSchema>;
export type CircuitState = z.infer<typeof CircuitStateSchema>;
export type ProviderHealthEvidence = z.infer<typeof ProviderHealthEvidenceSchema>;
export type ProviderStructuredLog = z.infer<typeof ProviderStructuredLogSchema>;
export type ProviderBoundedMetric = z.infer<typeof ProviderBoundedMetricSchema>;
export type ProviderBoundedTrace = z.infer<typeof ProviderBoundedTraceSchema>;
export type ProviderPublicError = z.infer<typeof ProviderPublicErrorSchema>;
export type ObservabilityReadinessEvidence = z.infer<typeof ObservabilityReadinessEvidenceSchema>;
export type ProviderObservabilityRetentionEvidence = z.infer<
  typeof ProviderObservabilityRetentionEvidenceSchema
>;
export type ProductionProviderReadinessDecision = z.infer<
  typeof ProductionProviderReadinessDecisionSchema
>;
export type ProviderReadinessArtifactVerificationResult = z.infer<
  typeof ProviderReadinessArtifactVerificationResultSchema
>;
