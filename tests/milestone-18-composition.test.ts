import { createSyntheticCredentialResolver } from "../infrastructure/credential-resolver/src/index.js";
import {
  createCredentialResolutionOrchestrator,
  createCredentialResolutionRequest,
  createInMemoryExecutionAuthorizationAuthority,
} from "../services/knowledge-engine/src/index.js";
import {
  AUTHORIZATION_FINGERPRINTS,
  authorizationAuthorityConfiguration,
  createAuthorizationFixture,
} from "../services/knowledge-engine/tests/fixtures/execution-authorization.js";

import { describe, expect, it } from "vitest";

describe("Milestone 18 structural composition", () => {
  it("composes the engine port with the infrastructure facade without exposing material", () => {
    const authority = createInMemoryExecutionAuthorizationAuthority(
      authorizationAuthorityConfiguration(),
    );
    const fixture = createAuthorizationFixture();
    const issuance = authority.issueDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: "authorization-decision-m18-composition",
      authorizationRequest: fixture.request,
      serviceIdentityEvidence: fixture.identity,
      humanApprovalEvidence: fixture.approval,
      evaluatedAt: "2026-08-23T01:00:00.000Z",
      expiresAt: "2026-08-23T01:15:00.000Z",
    });
    if (issuance.status !== "issued") throw new Error("fixture issuance failed");
    const claim = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-m18-composition",
      authorizationDecision: issuance.decision,
      executionAttemptId: fixture.request.executionAttemptId,
      executionAttemptFingerprint: fixture.request.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:00:01.000Z",
      idempotentRetry: false,
    });
    if (claim.status !== "claimed") throw new Error("fixture claim failed");
    const resolver = createSyntheticCredentialResolver({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      credentialReferenceId: fixture.request.credentialReferenceId,
      credentialReferenceFingerprint: fixture.request.credentialReferenceFingerprint,
      initialRotationVersion: fixture.request.credentialRotationVersion,
      initializedAt: "2026-08-23T00:00:00.000Z",
      environmentClass: fixture.request.environmentClass,
      providerFamilyReference: fixture.request.providerFamilyReference,
      adapterId: fixture.request.adapterId,
      rotationAuthorityReference: "authority/credential-rotation",
      revocationAuthorityReference: "authority/credential-revocation",
    });
    const orchestrator = createCredentialResolutionOrchestrator({
      schemaVersion: "1.0",
      resolverId: "resolver.synthetic.primary",
      authority,
      port: resolver,
    });
    const request = createCredentialResolutionRequest({
      schemaVersion: "1.0",
      resolutionRequestId: "resolution-request-m18-composition",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
      authorizationDecisionFingerprint: issuance.decision.decisionFingerprint,
      authorizationClaimId: claim.claim.authorizationClaimId,
      authorizationClaimFingerprint: claim.claim.claimFingerprint,
      executionAttemptId: fixture.request.executionAttemptId,
      executionAttemptFingerprint: AUTHORIZATION_FINGERPRINTS.attempt,
      subjectReference: fixture.request.subjectReference,
      consumerId: fixture.request.consumerId,
      deliveryTransactionId: fixture.request.deliveryTransactionId,
      contextPackageId: fixture.request.contextPackageId,
      invocationRequestId: fixture.request.invocationRequestId,
      providerFamilyReference: fixture.request.providerFamilyReference,
      adapterId: fixture.request.adapterId,
      adapterFingerprint: fixture.request.adapterFingerprint,
      environmentClass: fixture.request.environmentClass,
      operation: fixture.request.operation,
      credentialReferenceId: fixture.request.credentialReferenceId,
      credentialReferenceFingerprint: fixture.request.credentialReferenceFingerprint,
      expectedRotationVersion: fixture.request.credentialRotationVersion,
      purposeReference: "purpose/founder-decision-memo",
      evaluatedAt: "2026-08-23T01:00:02.000Z",
      resolutionDeadline: "2026-08-23T01:10:00.000Z",
    });
    const result = orchestrator.resolve({
      schemaVersion: "1.0",
      request,
      decision: issuance.decision,
      claim: claim.claim,
    });
    expect(result.status).toBe("resolved");
    expect(JSON.stringify(result)).not.toMatch(/bytes|material|secret|token|header/iu);
    expect(resolver.inspect()).toMatchObject({
      materializationCount: 1,
      releaseCount: 1,
      lastReleaseAllZero: true,
    });
  });
});
