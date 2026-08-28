import {
  createCredentialResolutionOrchestrator,
  createCredentialResolutionRequest,
  createCredentialRevocationRecord,
  createCredentialRotationRecord,
  createInMemoryExecutionAuthorizationAuthority,
  verifyCredentialResolutionEvidence,
  verifyCredentialResolutionRequest,
  verifyCredentialRevocationRecord,
  verifyCredentialRotationRecord,
  type CredentialResolutionPort,
} from "../src/index.js";

import { beforeEach, describe, expect, it } from "vitest";

import {
  AUTHORIZATION_FINGERPRINTS,
  authorizationAuthorityConfiguration,
  createAuthorizationFixture,
} from "./fixtures/execution-authorization.js";

function claimedAuthorization() {
  const authority = createInMemoryExecutionAuthorizationAuthority(
    authorizationAuthorityConfiguration(),
  );
  const fixture = createAuthorizationFixture();
  const issuance = authority.issueDecision({
    schemaVersion: "1.0",
    authorizationDecisionId: "authorization-decision-m18",
    authorizationRequest: fixture.request,
    serviceIdentityEvidence: fixture.identity,
    humanApprovalEvidence: fixture.approval,
    evaluatedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:15:00.000Z",
  });
  if (issuance.status !== "issued") throw new Error("fixture issuance failed");
  const claim = authority.claimDecision({
    schemaVersion: "1.0",
    authorizationClaimId: "authorization-claim-m18",
    authorizationDecision: issuance.decision,
    executionAttemptId: fixture.request.executionAttemptId,
    executionAttemptFingerprint: fixture.request.executionAttemptFingerprint,
    claimedAt: "2026-08-23T01:00:01.000Z",
    idempotentRetry: false,
  });
  if (claim.status !== "claimed") throw new Error("fixture claim failed");
  return { authority, decision: issuance.decision, claim: claim.claim };
}

function resolutionRequest(overrides: Record<string, unknown> = {}) {
  return createCredentialResolutionRequest({
    schemaVersion: "1.0",
    resolutionRequestId: "credential-resolution-m18",
    authorizationDecisionId: "authorization-decision-m18",
    authorizationDecisionFingerprint: "decision-fingerprint-replaced",
    authorizationClaimId: "authorization-claim-m18",
    authorizationClaimFingerprint: "claim-fingerprint-replaced",
    executionAttemptId: "execution-attempt-one",
    executionAttemptFingerprint: AUTHORIZATION_FINGERPRINTS.attempt,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    deliveryTransactionId: "delivery-transaction-one",
    contextPackageId: "context-package-one",
    invocationRequestId: "invocation-one",
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    adapterFingerprint: AUTHORIZATION_FINGERPRINTS.adapter,
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: AUTHORIZATION_FINGERPRINTS.credentialReference,
    expectedRotationVersion: "rotation-v1",
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt: "2026-08-23T01:00:02.000Z",
    resolutionDeadline: "2026-08-23T01:10:00.000Z",
    ...overrides,
  });
}

describe("Milestone 18 credential resolution orchestration", () => {
  let calls = 0;

  beforeEach(() => {
    calls = 0;
  });

  function port(): CredentialResolutionPort {
    return {
      resolveAndRelease(command) {
        calls += 1;
        return {
          status: "resolved",
          evidence: {
            schemaVersion: "1.0",
            resolutionRequestId: command.resolutionRequestId,
            authorizationDecisionId: command.authorizationDecisionId,
            authorizationDecisionFingerprint: command.authorizationDecisionFingerprint,
            authorizationClaimId: command.authorizationClaimId,
            authorizationClaimFingerprint: command.authorizationClaimFingerprint,
            executionAttemptId: command.executionAttemptId,
            executionAttemptFingerprint: command.executionAttemptFingerprint,
            credentialReferenceId: command.credentialReferenceId,
            credentialReferenceFingerprint: command.credentialReferenceFingerprint,
            rotationVersion: command.expectedRotationVersion,
            providerFamilyReference: command.providerFamilyReference,
            adapterId: command.adapterId,
            adapterFingerprint: command.adapterFingerprint,
            environmentClass: command.environmentClass,
            operation: command.operation,
            evaluatedAt: command.evaluatedAt,
            resolutionDeadline: command.resolutionDeadline,
            resolverId: command.resolverId,
            sourceClass: "deterministic-synthetic",
            releaseStatus: "released",
          },
        };
      },
    };
  }

  it("verifies the exact registered claim before one resolver call and replays without another call", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const request = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
    });
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const first = orchestrator.resolve({ schemaVersion: "1.0", request, decision, claim });
    const replay = orchestrator.resolve({ schemaVersion: "1.0", request, decision, claim });
    expect(first.status).toBe("resolved");
    expect(replay).toEqual(first);
    expect(calls).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects non-authoritative and mismatched artifacts before resolver access", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const mismatched = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
      expectedRotationVersion: "rotation-v2",
    });
    expect(
      orchestrator.resolve({ schemaVersion: "1.0", request: mismatched, decision, claim }),
    ).toEqual({ status: "rejected", reasonCodes: ["coordinate_mismatch"] });
    expect(calls).toBe(0);
  });

  it("gives conflicting identity precedence without a second authority or resolver effect", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const original = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
    });
    expect(
      orchestrator.resolve({ schemaVersion: "1.0", request: original, decision, claim }).status,
    ).toBe("resolved");
    const conflict = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
      purposeReference: "purpose/conflicting-use",
    });
    expect(
      orchestrator.resolve({ schemaVersion: "1.0", request: conflict, decision, claim }),
    ).toEqual({ status: "rejected", reasonCodes: ["conflicting_identity"] });
    expect(calls).toBe(1);
  });

  it("reproduces resolution evidence fingerprints and rejects tampering", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const request = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
    });
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const result = orchestrator.resolve({ schemaVersion: "1.0", request, decision, claim });
    if (result.status !== "resolved") throw new Error("resolution fixture failed");
    expect(verifyCredentialResolutionEvidence(result.evidence)).toEqual({ status: "valid" });
    expect(
      verifyCredentialResolutionEvidence({
        ...result.evidence,
        rotationVersion: "rotation-v2",
      }),
    ).toEqual({ status: "invalid", reasonCodes: ["non_authoritative_artifact"] });
  });

  it("verifies request fingerprints and rejects every coordinate substitution before port access", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const request = resolutionRequest({
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
    });
    expect(verifyCredentialResolutionRequest(request)).toEqual({ status: "valid" });
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const substitutions = {
      authorizationDecisionId: "authorization-decision-substituted",
      authorizationDecisionFingerprint: "c".repeat(64),
      authorizationClaimId: "authorization-claim-substituted",
      authorizationClaimFingerprint: "c".repeat(64),
      executionAttemptId: "execution-attempt-substituted",
      executionAttemptFingerprint: "c".repeat(64),
      subjectReference: "subject/substituted",
      consumerId: "consumer-substituted",
      deliveryTransactionId: "delivery-transaction-substituted",
      contextPackageId: "context-package-substituted",
      invocationRequestId: "invocation-substituted",
      providerFamilyReference: "provider-family/substituted",
      adapterId: "adapter-substituted",
      adapterFingerprint: "c".repeat(64),
      environmentClass: "test",
      operation: "founder-strategy-analysis",
      credentialReferenceId: "credential-reference-substituted",
      credentialReferenceFingerprint: "c".repeat(64),
      expectedRotationVersion: "rotation-v2",
      purposeReference: "purpose/substituted",
      evaluatedAt: "2026-08-23T01:00:03.000Z",
      resolutionDeadline: "2026-08-23T01:09:00.000Z",
    } as const;
    for (const [coordinate, substituted] of Object.entries(substitutions)) {
      const tampered = { ...request, [coordinate]: substituted };
      expect(verifyCredentialResolutionRequest(tampered), coordinate).toEqual({
        status: "invalid",
        reasonCodes: ["non_authoritative_artifact"],
      });
      expect(
        orchestrator.resolve({ schemaVersion: "1.0", request: tampered, decision, claim }),
        coordinate,
      ).toEqual({ status: "rejected", reasonCodes: ["invalid_input"] });
    }
    expect(calls).toBe(0);
  });

  it("rejects freshly fingerprinted purpose and authorization-deadline substitutions", () => {
    const { authority, decision, claim } = claimedAuthorization();
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: port(),
    });
    const foreignPurpose = resolutionRequest({
      resolutionRequestId: "credential-resolution-m18-foreign-purpose",
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
      purposeReference: "purpose/unrelated-operation",
    });
    const postAuthorizationDeadline = resolutionRequest({
      resolutionRequestId: "credential-resolution-m18-post-authorization-deadline",
      authorizationDecisionFingerprint: decision.decisionFingerprint,
      authorizationClaimFingerprint: claim.claimFingerprint,
      resolutionDeadline: "2026-08-23T01:16:00.000Z",
    });

    expect(
      orchestrator.resolve({
        schemaVersion: "1.0",
        request: foreignPurpose,
        decision,
        claim,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["coordinate_mismatch"] });
    expect(
      orchestrator.resolve({
        schemaVersion: "1.0",
        request: postAuthorizationDeadline,
        decision,
        claim,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["deadline_expired"] });
    expect(calls).toBe(0);
  });

  it("rejects hostile orchestrator capabilities without invoking getters or exposing errors", () => {
    const { authority } = claimedAuthorization();
    const expectedError = new TypeError(
      "Credential resolution orchestrator configuration is invalid",
    );
    let getterRead = false;
    const hostileAuthority = { ...authority } as Record<string, unknown>;
    Object.defineProperty(hostileAuthority, "verifyDecision", {
      enumerable: true,
      get() {
        getterRead = true;
        throw new Error("hostile-authority-detail");
      },
    });

    expect(() =>
      createCredentialResolutionOrchestrator({
        schemaVersion: "1.0",
        resolverId: "resolver.synthetic.primary",
        authority: hostileAuthority as never,
        port: port(),
      }),
    ).toThrow(expectedError);
    expect(getterRead).toBe(false);

    const hostileWrapper = new Proxy(
      {
        schemaVersion: "1.0" as const,
        resolverId: "resolver.synthetic.primary",
        authority,
        port: port(),
      },
      {
        getPrototypeOf() {
          throw new Error("hostile-wrapper-detail");
        },
      },
    );
    expect(() => createCredentialResolutionOrchestrator(hostileWrapper)).toThrow(expectedError);
  });

  it("constructs and independently verifies deterministic rotation and revocation records", () => {
    const rotationInput = {
      schemaVersion: "1.0" as const,
      rotationRecordId: "rotation-record-two",
      rotationSequence: 2,
      credentialReferenceId: "credential-reference-one",
      credentialReferenceFingerprint: AUTHORIZATION_FINGERPRINTS.credentialReference,
      priorRotationVersion: "rotation-v1",
      nextRotationVersion: "rotation-v2",
      effectiveAt: "2026-08-23T01:05:00.000Z",
      rotationAuthorityReference: "authority/credential-rotation",
      evidenceReference: "evidence/rotation-two",
      environmentClass: "evaluation" as const,
      providerFamilyReference: "provider-family/openai",
      adapterId: "adapter-one",
    };
    const rotation = createCredentialRotationRecord(rotationInput);
    expect(createCredentialRotationRecord(rotationInput)).toEqual(rotation);
    expect(verifyCredentialRotationRecord(rotation)).toEqual({ status: "valid" });
    expect(
      verifyCredentialRotationRecord({ ...rotation, nextRotationVersion: "rotation-v3" }),
    ).toEqual({ status: "invalid", reasonCodes: ["non_authoritative_artifact"] });

    const revocationInput = {
      schemaVersion: "1.0" as const,
      revocationRecordId: "revocation-record-two",
      credentialReferenceId: "credential-reference-one",
      credentialReferenceFingerprint: AUTHORIZATION_FINGERPRINTS.credentialReference,
      rotationVersion: "rotation-v2",
      revocationVersion: 1,
      revokedAt: "2026-08-23T01:06:00.000Z",
      revocationAuthorityReference: "authority/credential-revocation",
      reasonCode: "credential_rotation_operator_revoked" as const,
    };
    const revocation = createCredentialRevocationRecord(revocationInput);
    expect(createCredentialRevocationRecord(revocationInput)).toEqual(revocation);
    expect(verifyCredentialRevocationRecord(revocation)).toEqual({ status: "valid" });
    expect(verifyCredentialRevocationRecord({ ...revocation, revocationVersion: 2 })).toEqual({
      status: "invalid",
      reasonCodes: ["non_authoritative_artifact"],
    });
  });
});
