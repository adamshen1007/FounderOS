import {
  CredentialResolutionCommandSchema,
  CredentialResolutionEvidenceSchema,
  CredentialResolutionRequestSchema,
  CredentialResolutionResultSchema,
  CredentialRotationRecordSchema,
  CredentialRevocationRecordSchema,
} from "../src/index.js";

import { describe, expect, it } from "vitest";

const digest = "a".repeat(64);
const laterDigest = "b".repeat(64);

function request() {
  return {
    schemaVersion: "1.0" as const,
    resolutionRequestId: "resolution.request.001",
    authorizationDecisionId: "authorization.decision.001",
    authorizationDecisionFingerprint: digest,
    authorizationClaimId: "authorization.claim.001",
    authorizationClaimFingerprint: laterDigest,
    executionAttemptId: "execution.attempt.001",
    executionAttemptFingerprint: digest,
    subjectReference: "subject.founder",
    consumerId: "consumer.knowledge-engine",
    deliveryTransactionId: "delivery.transaction.001",
    contextPackageId: "context.package.001",
    invocationRequestId: "invocation.request.001",
    providerFamilyReference: "provider.openai",
    adapterId: "adapter.openai.responses",
    adapterFingerprint: laterDigest,
    environmentClass: "evaluation" as const,
    operation: "founder-decision-memo" as const,
    credentialReferenceId: "credential.reference.synthetic",
    credentialReferenceFingerprint: digest,
    expectedRotationVersion: "rotation.version.001",
    purposeReference: "purpose.founder-decision-memo",
    evaluatedAt: "2026-08-28T00:00:00.000Z",
    resolutionDeadline: "2026-08-28T00:01:00.000Z",
    requestFingerprint: laterDigest,
  };
}

describe("Milestone 18 credential resolution contracts", () => {
  it("accepts the strict secret-free request and command projections", () => {
    const value = request();
    expect(CredentialResolutionRequestSchema.parse(value)).toEqual(value);
    const { requestFingerprint, ...command } = value;
    expect(requestFingerprint).toHaveLength(64);
    expect(
      CredentialResolutionCommandSchema.parse({
        ...command,
        resolverId: "resolver.synthetic.primary",
      }),
    ).toEqual({ ...command, resolverId: "resolver.synthetic.primary" });
  });

  it("rejects unknown fields, URLs, and credential-shaped identifiers", () => {
    expect(
      CredentialResolutionRequestSchema.safeParse({ ...request(), unknown: true }).success,
    ).toBe(false);
    expect(
      CredentialResolutionRequestSchema.safeParse({
        ...request(),
        purposeReference: "https://provider.invalid/path",
      }).success,
    ).toBe(false);
    expect(
      CredentialResolutionRequestSchema.safeParse({
        ...request(),
        credentialReferenceId: ["sk", "proj", "contiguousfixturematerial"].join("-"),
      }).success,
    ).toBe(false);
  });

  it("requires request chronology and exact release-only evidence", () => {
    expect(
      CredentialResolutionRequestSchema.safeParse({
        ...request(),
        resolutionDeadline: request().evaluatedAt,
      }).success,
    ).toBe(false);
    const value = {
      schemaVersion: "1.0" as const,
      resolutionRequestId: request().resolutionRequestId,
      requestFingerprint: request().requestFingerprint,
      authorizationDecisionId: request().authorizationDecisionId,
      authorizationDecisionFingerprint: request().authorizationDecisionFingerprint,
      authorizationClaimId: request().authorizationClaimId,
      authorizationClaimFingerprint: request().authorizationClaimFingerprint,
      executionAttemptId: request().executionAttemptId,
      executionAttemptFingerprint: request().executionAttemptFingerprint,
      credentialReferenceId: request().credentialReferenceId,
      credentialReferenceFingerprint: request().credentialReferenceFingerprint,
      rotationVersion: request().expectedRotationVersion,
      providerFamilyReference: request().providerFamilyReference,
      adapterId: request().adapterId,
      adapterFingerprint: request().adapterFingerprint,
      environmentClass: request().environmentClass,
      operation: request().operation,
      evaluatedAt: request().evaluatedAt,
      resolutionDeadline: request().resolutionDeadline,
      resolverId: "resolver.synthetic.primary",
      sourceClass: "deterministic-synthetic" as const,
      releaseStatus: "released" as const,
      evidenceFingerprint: digest,
    };
    expect(CredentialResolutionEvidenceSchema.parse(value)).toEqual(value);
    expect(
      CredentialResolutionEvidenceSchema.safeParse({ ...value, materialLength: 32 }).success,
    ).toBe(false);
  });

  it("accepts exact monotonic rotation and revocation records", () => {
    expect(
      CredentialRotationRecordSchema.parse({
        schemaVersion: "1.0",
        rotationRecordId: "rotation.record.002",
        rotationSequence: 2,
        credentialReferenceId: request().credentialReferenceId,
        credentialReferenceFingerprint: request().credentialReferenceFingerprint,
        priorRotationVersion: "rotation.version.001",
        nextRotationVersion: "rotation.version.002",
        effectiveAt: "2026-08-28T00:02:00.000Z",
        rotationAuthorityReference: "authority.credential.rotation",
        evidenceReference: "evidence.rotation.change.002",
        environmentClass: request().environmentClass,
        providerFamilyReference: request().providerFamilyReference,
        adapterId: request().adapterId,
        recordFingerprint: digest,
      }).rotationSequence,
    ).toBe(2);
    expect(
      CredentialRevocationRecordSchema.parse({
        schemaVersion: "1.0",
        revocationRecordId: "revocation.record.001",
        credentialReferenceId: request().credentialReferenceId,
        credentialReferenceFingerprint: request().credentialReferenceFingerprint,
        rotationVersion: "rotation.version.002",
        revocationVersion: 1,
        revokedAt: "2026-08-28T00:03:00.000Z",
        revocationAuthorityReference: "authority.credential.revocation",
        reasonCode: "credential_rotation_compromised",
        recordFingerprint: laterDigest,
      }).revocationVersion,
    ).toBe(1);
  });

  it("enforces sorted unique closed rejection reasons", () => {
    expect(
      CredentialResolutionResultSchema.parse({
        status: "rejected",
        reasonCodes: ["authorization_non_authoritative", "coordinate_mismatch"],
      }).status,
    ).toBe("rejected");
    expect(
      CredentialResolutionResultSchema.safeParse({
        status: "rejected",
        reasonCodes: ["coordinate_mismatch", "authorization_non_authoritative"],
      }).success,
    ).toBe(false);
  });
});
