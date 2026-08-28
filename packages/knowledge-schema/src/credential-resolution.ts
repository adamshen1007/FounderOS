import { z } from "zod";

import { DurableCanonicalJsonValueSchema } from "./canonical-json.js";
import {
  ExecutionAuthorizationIdentifierSchema,
  ExecutionAuthorizationOperationSchema,
} from "./authorization.js";
import {
  CredentialEnvironmentClassSchema,
  ProviderReadinessLogicalReferenceSchema,
} from "./provider-readiness.js";
import { IsoTemporalSchema, Sha256DigestSchema } from "./primitives.js";

const PositiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

function compareTemporal(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function requireSortedUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  const expected = [...new Set(values)].sort();
  if (expected.length !== values.length || JSON.stringify(expected) !== JSON.stringify(values)) {
    context.addIssue({
      code: "custom",
      message: "Expected sorted unique reason codes",
      path: [...path],
    });
  }
}

export const CredentialResolutionContractVersionSchema = z.literal("1.0");
export const CredentialResolutionSourceClassSchema = z.literal("deterministic-synthetic");
export const CredentialReleaseStatusSchema = z.literal("released");

const CredentialResolutionRequestFields = {
  schemaVersion: CredentialResolutionContractVersionSchema,
  resolutionRequestId: ExecutionAuthorizationIdentifierSchema,
  authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
  authorizationDecisionFingerprint: Sha256DigestSchema,
  authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
  authorizationClaimFingerprint: Sha256DigestSchema,
  executionAttemptId: ExecutionAuthorizationIdentifierSchema,
  executionAttemptFingerprint: Sha256DigestSchema,
  subjectReference: ProviderReadinessLogicalReferenceSchema,
  consumerId: ExecutionAuthorizationIdentifierSchema,
  deliveryTransactionId: ExecutionAuthorizationIdentifierSchema,
  contextPackageId: ExecutionAuthorizationIdentifierSchema,
  invocationRequestId: ExecutionAuthorizationIdentifierSchema,
  providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
  adapterId: ExecutionAuthorizationIdentifierSchema,
  adapterFingerprint: Sha256DigestSchema,
  environmentClass: CredentialEnvironmentClassSchema,
  operation: ExecutionAuthorizationOperationSchema,
  credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
  credentialReferenceFingerprint: Sha256DigestSchema,
  expectedRotationVersion: ProviderReadinessLogicalReferenceSchema,
  purposeReference: ProviderReadinessLogicalReferenceSchema,
  evaluatedAt: IsoTemporalSchema,
  resolutionDeadline: IsoTemporalSchema,
} as const;

export const CredentialResolutionRequestSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      ...CredentialResolutionRequestFields,
      requestFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.resolutionDeadline, value.evaluatedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Resolution deadline must follow evaluation time",
          path: ["resolutionDeadline"],
        });
      }
    }),
);

export const CredentialResolutionCommandSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      ...CredentialResolutionRequestFields,
      resolverId: ExecutionAuthorizationIdentifierSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (compareTemporal(value.resolutionDeadline, value.evaluatedAt) <= 0) {
        context.addIssue({
          code: "custom",
          message: "Resolution deadline must follow evaluation time",
          path: ["resolutionDeadline"],
        });
      }
    }),
);

export const CredentialRotationRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: CredentialResolutionContractVersionSchema,
      rotationRecordId: ExecutionAuthorizationIdentifierSchema,
      rotationSequence: PositiveSafeIntegerSchema,
      credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
      credentialReferenceFingerprint: Sha256DigestSchema,
      priorRotationVersion: ProviderReadinessLogicalReferenceSchema,
      nextRotationVersion: ProviderReadinessLogicalReferenceSchema,
      effectiveAt: IsoTemporalSchema,
      rotationAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      evidenceReference: ProviderReadinessLogicalReferenceSchema,
      environmentClass: CredentialEnvironmentClassSchema,
      providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
      adapterId: ExecutionAuthorizationIdentifierSchema,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((value, context) => {
      if (value.priorRotationVersion === value.nextRotationVersion) {
        context.addIssue({
          code: "custom",
          message: "Rotation must change the version",
          path: ["nextRotationVersion"],
        });
      }
    }),
);

export const CredentialRevocationReasonCodeSchema = z.enum([
  "credential_rotation_compromised",
  "credential_rotation_expired",
  "credential_rotation_operator_revoked",
  "credential_rotation_policy_revoked",
]);

export const CredentialRevocationRecordSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      schemaVersion: CredentialResolutionContractVersionSchema,
      revocationRecordId: ExecutionAuthorizationIdentifierSchema,
      credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
      credentialReferenceFingerprint: Sha256DigestSchema,
      rotationVersion: ProviderReadinessLogicalReferenceSchema,
      revocationVersion: PositiveSafeIntegerSchema,
      revokedAt: IsoTemporalSchema,
      revocationAuthorityReference: ProviderReadinessLogicalReferenceSchema,
      reasonCode: CredentialRevocationReasonCodeSchema,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

const CredentialResolutionEvidenceFields = {
  schemaVersion: CredentialResolutionContractVersionSchema,
  resolutionRequestId: ExecutionAuthorizationIdentifierSchema,
  requestFingerprint: Sha256DigestSchema,
  authorizationDecisionId: ExecutionAuthorizationIdentifierSchema,
  authorizationDecisionFingerprint: Sha256DigestSchema,
  authorizationClaimId: ExecutionAuthorizationIdentifierSchema,
  authorizationClaimFingerprint: Sha256DigestSchema,
  executionAttemptId: ExecutionAuthorizationIdentifierSchema,
  executionAttemptFingerprint: Sha256DigestSchema,
  credentialReferenceId: ExecutionAuthorizationIdentifierSchema,
  credentialReferenceFingerprint: Sha256DigestSchema,
  rotationVersion: ProviderReadinessLogicalReferenceSchema,
  providerFamilyReference: ProviderReadinessLogicalReferenceSchema,
  adapterId: ExecutionAuthorizationIdentifierSchema,
  adapterFingerprint: Sha256DigestSchema,
  environmentClass: CredentialEnvironmentClassSchema,
  operation: ExecutionAuthorizationOperationSchema,
  evaluatedAt: IsoTemporalSchema,
  resolutionDeadline: IsoTemporalSchema,
  resolverId: ExecutionAuthorizationIdentifierSchema,
  sourceClass: CredentialResolutionSourceClassSchema,
  releaseStatus: CredentialReleaseStatusSchema,
} as const;

export const CredentialResolutionPortSuccessSchema = DurableCanonicalJsonValueSchema.pipe(
  z.object(CredentialResolutionEvidenceFields).omit({ requestFingerprint: true }).strict(),
);

export const CredentialResolutionPortFailureReasonCodeSchema = z.enum([
  "credential_reference_not_found",
  "credential_version_revoked",
  "credential_version_stale",
  "credential_version_unavailable",
  "deadline_expired",
  "internal_integrity_failure",
  "materialization_failure",
  "release_integrity_failure",
]);

const CredentialResolutionPortFailureSchema = z
  .object({
    status: z.literal("rejected"),
    reasonCodes: z
      .array(CredentialResolutionPortFailureReasonCodeSchema)
      .min(1)
      .max(CredentialResolutionPortFailureReasonCodeSchema.options.length),
  })
  .strict()
  .superRefine((value, context) =>
    requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
  );

export const CredentialResolutionPortResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("resolved"),
        evidence: z
          .object(CredentialResolutionEvidenceFields)
          .omit({ requestFingerprint: true })
          .strict(),
      })
      .strict(),
    CredentialResolutionPortFailureSchema,
  ]),
);

export const CredentialResolutionEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  z
    .object({
      ...CredentialResolutionEvidenceFields,
      evidenceFingerprint: Sha256DigestSchema,
    })
    .strict(),
);

export const CredentialResolutionFailureReasonCodeSchema = z.enum([
  "authorization_non_authoritative",
  "conflicting_identity",
  "coordinate_mismatch",
  "credential_reference_not_found",
  "credential_version_revoked",
  "credential_version_stale",
  "credential_version_unavailable",
  "deadline_expired",
  "internal_integrity_failure",
  "invalid_input",
  "materialization_failure",
  "release_integrity_failure",
]);

export const CredentialResolutionResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("resolved"),
        evidence: CredentialResolutionEvidenceSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("rejected"),
        reasonCodes: z
          .array(CredentialResolutionFailureReasonCodeSchema)
          .min(1)
          .max(CredentialResolutionFailureReasonCodeSchema.options.length),
      })
      .strict()
      .superRefine((value, context) =>
        requireSortedUnique(value.reasonCodes, context, ["reasonCodes"]),
      ),
  ]),
);

export const CredentialResolutionVerificationResultSchema = DurableCanonicalJsonValueSchema.pipe(
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("valid") }).strict(),
    z
      .object({
        status: z.literal("invalid"),
        reasonCodes: z.tuple([z.literal("non_authoritative_artifact")]),
      })
      .strict(),
  ]),
);

export type CredentialResolutionRequest = z.infer<typeof CredentialResolutionRequestSchema>;
export type CredentialResolutionCommand = z.infer<typeof CredentialResolutionCommandSchema>;
export type CredentialRotationRecord = z.infer<typeof CredentialRotationRecordSchema>;
export type CredentialRevocationRecord = z.infer<typeof CredentialRevocationRecordSchema>;
export type CredentialResolutionPortResult = z.infer<typeof CredentialResolutionPortResultSchema>;
export type CredentialResolutionEvidence = z.infer<typeof CredentialResolutionEvidenceSchema>;
export type CredentialResolutionResult = z.infer<typeof CredentialResolutionResultSchema>;
export type CredentialResolutionVerificationResult = z.infer<
  typeof CredentialResolutionVerificationResultSchema
>;
