import { describe, expect, it } from "vitest";

import {
  ExecutionAuthorizationClaimResultSchema,
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  ExecutionAuthorizationInspectionResultSchema,
  ExecutionAuthorizationIssuanceResultSchema,
  ExecutionAuthorizationLimitsSchema,
  ExecutionAuthorizationRequestSchema,
  ExecutionAuthorizationRevocationResultSchema,
  ExecutionAuthorizationVerificationResultSchema,
  HumanExecutionApprovalEvidenceSchema,
  VerifiedServiceIdentityEvidenceSchema,
} from "../src/index.js";

const digest = "a".repeat(64);
const secondDigest = "b".repeat(64);

function limits() {
  return {
    maximumInputBytes: 20_000,
    maximumOutputBytes: 40_000,
    maximumInputTokens: 4_000,
    maximumOutputTokens: 2_000,
    timeoutMilliseconds: 5_000,
    maximumAttempts: 1,
    maximumRequestsPerMinute: 10,
    maximumConcurrentRequests: 1,
    maximumCostMinorUnits: 25,
    currencyCode: "USD",
  };
}

function request() {
  return {
    schemaVersion: "1.0" as const,
    authorizationRequestId: "authorization-request-one",
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: digest,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    consumerDescriptorFingerprint: digest,
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: digest,
    contextPackageId: "context-package-one",
    contextPackageFingerprint: digest,
    invocationRequestId: "invocation-one",
    invocationRequestFingerprint: digest,
    adapterId: "adapter-one",
    adapterFingerprint: digest,
    providerFamilyReference: "provider-family/openai",
    operation: "founder-decision-memo" as const,
    processingTier: "default" as const,
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: digest,
    executionInstructionProfileReference: "instruction-profile/founder-memo",
    executionInstructionProfileFingerprint: digest,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    credentialRotationVersion: "rotation-v1",
    environmentClass: "evaluation" as const,
    dataClassification: "internal" as const,
    purpose: "Create the governed founder decision memo",
    limits: limits(),
    requestedAt: "2026-08-23T01:00:00.000Z",
    requestFingerprint: digest,
  };
}

function serviceIdentity() {
  return {
    schemaVersion: "1.0" as const,
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    subjectReference: "subject/founder-service",
    workloadIdentityReference: "workload/founder-memo-service",
    issuerReference: "identity-authority/evaluation",
    assuranceProfileReference: "assurance/workload-verified",
    environmentClass: "evaluation" as const,
    audienceReference: "audience/founderos-authorization",
    issuedAt: "2026-08-23T00:55:00.000Z",
    notBefore: "2026-08-23T00:55:00.000Z",
    expiresAt: "2026-08-23T01:30:00.000Z",
    revocationVersion: 0,
    revocationState: "active" as const,
    issuerProofReference: "proof/service-identity-one",
    evidenceFingerprint: digest,
  };
}

function approval() {
  return {
    schemaVersion: "1.0" as const,
    approvalEvidenceId: "human-approval-one",
    approverReference: "human-approver/founder-one",
    approvalAuthorityReference: "approval-authority/founderos",
    authorizationRequestId: "authorization-request-one",
    authorizationRequestFingerprint: digest,
    purpose: "Create the governed founder decision memo",
    operation: "founder-decision-memo" as const,
    environmentClass: "evaluation" as const,
    maximumDataClassification: "internal" as const,
    approvedLimits: limits(),
    issuedAt: "2026-08-23T00:58:00.000Z",
    expiresAt: "2026-08-23T01:20:00.000Z",
    outcome: "allowed" as const,
    reasonCodes: ["human_approval_allowed" as const],
    proofReference: "proof/human-approval-one",
    evidenceFingerprint: digest,
  };
}

function decision() {
  return {
    schemaVersion: "1.0" as const,
    authorizationDecisionId: "authorization-decision-one",
    decisionAuthorityReference: "authorization-authority/evaluation",
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    serviceIdentityEvidenceFingerprint: digest,
    humanApprovalEvidenceId: "human-approval-one",
    humanApprovalEvidenceFingerprint: digest,
    authorizationRequest: request(),
    outcome: "allowed" as const,
    state: "allowed-unclaimed" as const,
    reasonCodes: ["execution_authorization_allowed" as const],
    issuedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:20:00.000Z",
    revocationVersion: 0,
    issuerProofReference: "proof/authorization-decision-one",
    decisionFingerprint: digest,
  };
}

function claim() {
  return {
    schemaVersion: "1.0" as const,
    authorizationClaimId: "authorization-claim-one",
    authorizationDecisionId: "authorization-decision-one",
    decisionFingerprint: digest,
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: digest,
    state: "claimed-by-exact-attempt" as const,
    claimedAt: "2026-08-23T01:01:00.000Z",
    claimSequence: 1,
    decisionAuthorityReference: "authorization-authority/evaluation",
    claimFingerprint: secondDigest,
  };
}

describe("Milestone 17 authorization contracts", () => {
  it("accepts the complete canonical contract family", () => {
    expect(ExecutionAuthorizationLimitsSchema.parse(limits())).toEqual(limits());
    expect(ExecutionAuthorizationRequestSchema.parse(request())).toEqual(request());
    expect(VerifiedServiceIdentityEvidenceSchema.parse(serviceIdentity())).toEqual(
      serviceIdentity(),
    );
    expect(HumanExecutionApprovalEvidenceSchema.parse(approval())).toEqual(approval());
    expect(ExecutionAuthorizationDecisionSchema.parse(decision())).toEqual(decision());
    expect(ExecutionAuthorizationClaimSchema.parse(claim())).toEqual(claim());
  });

  it("accepts strict issuance, claim, inspection, revocation, and verification results", () => {
    expect(
      ExecutionAuthorizationIssuanceResultSchema.parse({
        status: "issued",
        decision: decision(),
      }).status,
    ).toBe("issued");
    expect(
      ExecutionAuthorizationClaimResultSchema.parse({ status: "claimed", claim: claim() }).status,
    ).toBe("claimed");
    expect(
      ExecutionAuthorizationInspectionResultSchema.parse({
        status: "found",
        decision: decision(),
        claim: claim(),
        currentRevocationVersion: 0,
        revoked: false,
      }).status,
    ).toBe("found");
    expect(
      ExecutionAuthorizationInspectionResultSchema.parse({
        status: "rejected",
        reasonCodes: ["internal_authority_integrity_failure"],
      }).status,
    ).toBe("rejected");
    expect(
      ExecutionAuthorizationRevocationResultSchema.parse({
        status: "revoked",
        authorizationDecisionId: decision().authorizationDecisionId,
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:02:00.000Z",
      }).status,
    ).toBe("revoked");
    expect(ExecutionAuthorizationVerificationResultSchema.parse({ status: "valid" }).status).toBe(
      "valid",
    );
    expect(
      ExecutionAuthorizationIssuanceResultSchema.safeParse({
        status: "rejected",
        reasonCodes: ["already_claimed"],
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationClaimResultSchema.safeParse({
        status: "rejected",
        reasonCodes: ["stale_revocation_version"],
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationRevocationResultSchema.safeParse({
        status: "rejected",
        reasonCodes: ["attempt_mismatch"],
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationVerificationResultSchema.safeParse({
        status: "invalid",
        reasonCodes: ["not_found"],
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationInspectionResultSchema.safeParse({
        status: "found",
        decision: decision(),
        claim: claim(),
        currentRevocationVersion: 1,
        revoked: false,
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationInspectionResultSchema.safeParse({
        status: "found",
        decision: decision(),
        claim: { ...claim(), authorizationDecisionId: "authorization-decision-other" },
        currentRevocationVersion: 0,
        revoked: false,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown, symbolic, inherited, accessor-backed, and unsafe data", () => {
    expect(
      ExecutionAuthorizationRequestSchema.safeParse({ ...request(), extra: true }).success,
    ).toBe(false);

    const symbolic = request() as Record<PropertyKey, unknown>;
    symbolic[Symbol("hidden")] = "hidden";
    expect(ExecutionAuthorizationRequestSchema.safeParse(symbolic).success).toBe(false);

    expect(
      ExecutionAuthorizationRequestSchema.safeParse(
        Object.assign(Object.create({ inherited: true }), request()),
      ).success,
    ).toBe(false);

    let getterRead = false;
    const accessor = { ...request() };
    Object.defineProperty(accessor, "purpose", {
      enumerable: true,
      get() {
        getterRead = true;
        return "unsafe";
      },
    });
    expect(ExecutionAuthorizationRequestSchema.safeParse(accessor).success).toBe(false);
    expect(getterRead).toBe(false);

    expect(
      ExecutionAuthorizationRequestSchema.safeParse({
        ...request(),
        purpose: "https://secret-store.invalid/path",
      }).success,
    ).toBe(false);

    for (const unsafeIdentifier of [
      "sk_live_SUPERSECRETVALUE",
      "ghp_ABCDEFGHIJKLMNOP",
      "api_key:SUPERSECRETVALUE",
      "www.example.com",
      "secret-value",
      "credential-value",
      "token-material",
      "https:example.com",
      "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "authorization-sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-authorization",
      "prefixsk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789suffix",
      "prefixsk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789suffix",
      "prefixsk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZsuffix",
      ["rk", "live", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"].join("_"),
      "whsec_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "prefixghp_ABCDEFGHIJKLMNOPQRSTUVWXYZsuffix",
      "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "prefixxoxb-1234567890-abcdefghijklmnsuffix",
      "xapp-1-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ]) {
      expect(
        ExecutionAuthorizationRequestSchema.safeParse({
          ...request(),
          authorizationRequestId: unsafeIdentifier,
        }).success,
        unsafeIdentifier,
      ).toBe(false);
    }

    expect(
      ExecutionAuthorizationRequestSchema.safeParse({
        ...request(),
        processingTier: "auto",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid chronology and incoherent outcome state or reasons", () => {
    expect(
      VerifiedServiceIdentityEvidenceSchema.safeParse({
        ...serviceIdentity(),
        expiresAt: serviceIdentity().issuedAt,
      }).success,
    ).toBe(false);
    expect(
      HumanExecutionApprovalEvidenceSchema.safeParse({
        ...approval(),
        reasonCodes: ["human_approval_denied"],
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationDecisionSchema.safeParse({
        ...decision(),
        outcome: "denied",
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationDecisionSchema.safeParse({
        ...decision(),
        reasonCodes: ["execution_authorization_allowed", "execution_authorization_allowed"],
      }).success,
    ).toBe(false);
    for (const [outcome, marker] of [
      ["denied", "execution_authorization_denied"],
      ["review-required", "execution_authorization_review_required"],
    ] as const) {
      expect(
        ExecutionAuthorizationDecisionSchema.safeParse({
          ...decision(),
          outcome,
          state: "not-claimable",
          reasonCodes: [marker],
        }).success,
        outcome,
      ).toBe(false);
    }
  });

  it.each([
    [
      "allowed",
      "allowed-unclaimed",
      ["execution_authorization_allowed", "execution_authorization_denied"],
    ],
    [
      "allowed",
      "allowed-unclaimed",
      ["execution_authorization_allowed", "execution_authorization_review_required"],
    ],
    [
      "denied",
      "not-claimable",
      ["execution_authorization_allowed", "execution_authorization_denied"],
    ],
    [
      "denied",
      "not-claimable",
      ["execution_authorization_denied", "execution_authorization_review_required"],
    ],
    [
      "review-required",
      "not-claimable",
      ["execution_authorization_allowed", "execution_authorization_review_required"],
    ],
    [
      "review-required",
      "not-claimable",
      ["execution_authorization_denied", "execution_authorization_review_required"],
    ],
  ] as const)(
    "rejects %s decisions containing a foreign outcome marker",
    (outcome, state, reasonCodes) => {
      expect(
        ExecutionAuthorizationDecisionSchema.safeParse({
          ...decision(),
          outcome,
          state,
          reasonCodes,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects non-positive limits and invalid claim chronology or bindings", () => {
    expect(
      ExecutionAuthorizationLimitsSchema.safeParse({
        ...limits(),
        maximumOutputTokens: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationClaimSchema.safeParse({ ...claim(), claimSequence: 0 }).success,
    ).toBe(false);
    expect(
      ExecutionAuthorizationClaimSchema.safeParse({
        ...claim(),
        executionAttemptId: "execution-attempt-other",
      }).success,
    ).toBe(true);
  });
});
