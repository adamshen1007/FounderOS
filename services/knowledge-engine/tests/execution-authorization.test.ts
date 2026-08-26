import { describe, expect, it } from "vitest";

import {
  createExecutionAuthorizationClaim,
  createExecutionAuthorizationDecision,
  createExecutionAuthorizationRequest,
  createHumanExecutionApprovalEvidence,
  createVerifiedServiceIdentityEvidence,
  verifyExecutionAuthorizationClaim,
  verifyExecutionAuthorizationDecision,
  verifyExecutionAuthorizationRequest,
  verifyHumanExecutionApprovalEvidence,
  verifyVerifiedServiceIdentityEvidence,
} from "../src/index.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";

const digest = "a".repeat(64);

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

function createRequest() {
  return createExecutionAuthorizationRequest({
    schemaVersion: "1.0",
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
    operation: "founder-decision-memo",
    processingTier: "default",
    modelPolicyReference: "model-policy/founder-memo",
    modelPolicyFingerprint: digest,
    executionInstructionProfileReference: "instruction-profile/founder-memo",
    executionInstructionProfileFingerprint: digest,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    credentialRotationVersion: "rotation-v1",
    environmentClass: "evaluation",
    dataClassification: "internal",
    purpose: "Create the governed founder decision memo",
    limits: limits(),
    requestedAt: "2026-08-23T01:00:00.000Z",
  });
}

function createIdentity() {
  return createVerifiedServiceIdentityEvidence({
    schemaVersion: "1.0",
    serviceIdentityEvidenceId: "service-identity-evidence-one",
    subjectReference: "subject/founder-service",
    workloadIdentityReference: "workload/founder-memo-service",
    issuerReference: "identity-authority/evaluation",
    assuranceProfileReference: "assurance/workload-verified",
    environmentClass: "evaluation",
    audienceReference: "audience/founderos-authorization",
    issuedAt: "2026-08-23T00:55:00.000Z",
    notBefore: "2026-08-23T00:55:00.000Z",
    expiresAt: "2026-08-23T01:30:00.000Z",
    revocationVersion: 0,
    revocationState: "active",
    issuerProofReference: "proof/service-identity-one",
  });
}

function createApproval(request = createRequest()) {
  return createHumanExecutionApprovalEvidence({
    schemaVersion: "1.0",
    approvalEvidenceId: "human-approval-one",
    approverReference: "human-approver/founder-one",
    approvalAuthorityReference: "approval-authority/founderos",
    authorizationRequestId: request.authorizationRequestId,
    authorizationRequestFingerprint: request.requestFingerprint,
    purpose: request.purpose,
    operation: request.operation,
    environmentClass: request.environmentClass,
    maximumDataClassification: "internal",
    approvedLimits: request.limits,
    issuedAt: "2026-08-23T00:58:00.000Z",
    expiresAt: "2026-08-23T01:20:00.000Z",
    outcome: "allowed",
    reasonCodes: ["human_approval_allowed"],
    proofReference: "proof/human-approval-one",
  });
}

function createDecision() {
  const authorizationRequest = createRequest();
  const identity = createIdentity();
  const approval = createApproval(authorizationRequest);
  return createExecutionAuthorizationDecision({
    schemaVersion: "1.0",
    authorizationDecisionId: "authorization-decision-one",
    decisionAuthorityReference: "authorization-authority/evaluation",
    serviceIdentityEvidenceId: identity.serviceIdentityEvidenceId,
    serviceIdentityEvidenceFingerprint: identity.evidenceFingerprint,
    humanApprovalEvidenceId: approval.approvalEvidenceId,
    humanApprovalEvidenceFingerprint: approval.evidenceFingerprint,
    authorizationRequest,
    outcome: "allowed",
    state: "allowed-unclaimed",
    reasonCodes: ["execution_authorization_allowed"],
    issuedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:20:00.000Z",
    revocationVersion: 0,
    issuerProofReference: "proof/authorization-decision-one",
  });
}

describe("Milestone 17 authorization domain artifacts", () => {
  it("creates deterministic domain-separated fingerprints", () => {
    const first = createRequest();
    const second = createRequest();
    const identity = createIdentity();
    const approval = createApproval(first);
    const decision = createDecision();
    const claim = createExecutionAuthorizationClaim({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-one",
      authorizationDecisionId: decision.authorizationDecisionId,
      decisionFingerprint: decision.decisionFingerprint,
      executionAttemptId: first.executionAttemptId,
      executionAttemptFingerprint: first.executionAttemptFingerprint,
      state: "claimed-by-exact-attempt",
      claimedAt: "2026-08-23T01:01:00.000Z",
      claimSequence: 1,
      decisionAuthorityReference: decision.decisionAuthorityReference,
    });

    expect(second).toEqual(first);
    expect(
      new Set([
        first.requestFingerprint,
        identity.evidenceFingerprint,
        approval.evidenceFingerprint,
        decision.decisionFingerprint,
        claim.claimFingerprint,
      ]).size,
    ).toBe(5);
    expect(verifyExecutionAuthorizationRequest(first)).toEqual({ status: "valid" });
    expect(verifyVerifiedServiceIdentityEvidence(identity)).toEqual({ status: "valid" });
    expect(verifyHumanExecutionApprovalEvidence(approval)).toEqual({ status: "valid" });
    expect(verifyExecutionAuthorizationDecision(decision)).toEqual({ status: "valid" });
    expect(verifyExecutionAuthorizationClaim(claim)).toEqual({ status: "valid" });
  });

  it("rejects tampering with a sanitized result", () => {
    const request = createRequest();
    const tampered = { ...request, purpose: "Create another governed memo" };

    expect(verifyExecutionAuthorizationRequest(tampered)).toEqual({
      status: "invalid",
      reasonCodes: ["non_authoritative_artifact"],
    });
  });

  it("returns deeply immutable defensive artifacts", () => {
    const request = createRequest();

    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.limits)).toBe(true);
    expect(() => {
      (request.limits as { maximumAttempts: number }).maximumAttempts = 2;
    }).toThrow(TypeError);
    expect(createRequest().limits.maximumAttempts).toBe(1);
  });

  it("rejects an accessor before reading it", () => {
    let getterRead = false;
    const input = { ...createRequest() } as Record<string, unknown>;
    delete input.requestFingerprint;
    Object.defineProperty(input, "purpose", {
      enumerable: true,
      get() {
        getterRead = true;
        return "unsafe";
      },
    });

    expect(() => createExecutionAuthorizationRequest(input as never)).toThrow(TypeError);
    expect(getterRead).toBe(false);
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
    "rejects construction and verification for %s with a foreign outcome marker",
    (outcome, state, reasonCodes) => {
      const valid = createDecision();
      const unsignedValid: Omit<typeof valid, "decisionFingerprint"> & {
        decisionFingerprint?: string;
      } = { ...valid };
      delete unsignedValid.decisionFingerprint;
      const contradictory = { ...unsignedValid, outcome, state, reasonCodes };

      expect(() => createExecutionAuthorizationDecision(contradictory as never)).toThrow(TypeError);
      expect(
        verifyExecutionAuthorizationDecision({
          ...contradictory,
          decisionFingerprint: createDurableCanonicalJsonSha256Fingerprint({
            domain: "founderos.m17.execution-authorization-decision.v1",
            artifact: contradictory,
          }),
        }),
      ).toEqual({ status: "invalid", reasonCodes: ["non_authoritative_artifact"] });
    },
  );

  it.each([
    ["denied", "execution_authorization_denied"],
    ["review-required", "execution_authorization_review_required"],
  ] as const)("rejects a reasonless %s Decision", (outcome, outcomeReason) => {
    const valid = createDecision();
    const unsigned: Omit<typeof valid, "decisionFingerprint"> & {
      decisionFingerprint?: string;
    } = { ...valid };
    delete unsigned.decisionFingerprint;
    const reasonless = {
      ...unsigned,
      outcome,
      state: "not-claimable" as const,
      reasonCodes: [outcomeReason],
    };

    expect(() => createExecutionAuthorizationDecision(reasonless as never)).toThrow(TypeError);
    expect(
      verifyExecutionAuthorizationDecision({
        ...reasonless,
        decisionFingerprint: createDurableCanonicalJsonSha256Fingerprint({
          domain: "founderos.m17.execution-authorization-decision.v1",
          artifact: reasonless,
        }),
      }),
    ).toEqual({ status: "invalid", reasonCodes: ["non_authoritative_artifact"] });
  });
});
