import { describe, expect, it, vi } from "vitest";

import {
  ExecutionAuthorizationClaimResultSchema,
  ExecutionAuthorizationInspectionResultSchema,
  ExecutionAuthorizationIssuanceResultSchema,
  ExecutionAuthorizationRevocationResultSchema,
  ExecutionAuthorizationVerificationResultSchema,
} from "@founderos/knowledge-schema";

import {
  createExecutionAuthorizationRequest,
  createHumanExecutionApprovalEvidence,
  createInMemoryExecutionAuthorizationAuthority,
  createVerifiedServiceIdentityEvidence,
} from "../src/index.js";
import {
  AUTHORIZATION_DIGEST,
  AUTHORIZATION_EVALUATED_AT,
  authorizationAuthorityConfiguration,
  createAuthorizationFixture,
} from "./fixtures/execution-authorization.js";

function issueInput(options: Parameters<typeof createAuthorizationFixture>[0] = {}) {
  const fixture = createAuthorizationFixture(options);
  return {
    schemaVersion: "1.0" as const,
    authorizationDecisionId: "authorization-decision-one",
    authorizationRequest: fixture.request,
    serviceIdentityEvidence: fixture.identity,
    humanApprovalEvidence: fixture.approval,
    evaluatedAt: AUTHORIZATION_EVALUATED_AT,
    expiresAt: "2026-08-23T01:15:00.000Z",
  };
}

function createAuthority() {
  return createInMemoryExecutionAuthorizationAuthority(authorizationAuthorityConfiguration());
}

describe("Milestone 17 in-memory execution authorization authority", () => {
  it("issues one exact allowed-unclaimed decision and replays it idempotently", () => {
    const authority = createAuthority();
    const input = issueInput();
    const first = authority.issueDecision(input);
    const second = authority.issueDecision(input);

    expect(first.status).toBe("issued");
    expect(second).toEqual(first);
    if (first.status !== "issued") throw new Error("expected issued decision");
    expect(first.decision.outcome).toBe("allowed");
    expect(first.decision.state).toBe("allowed-unclaimed");
    expect(Object.isFrozen(first.decision.authorizationRequest.limits)).toBe(true);
  });

  it.each([
    ["denied", "denied", "not-claimable", "human_approval_denied"],
    ["review-required", "review-required", "not-claimable", "human_approval_review_required"],
  ] as const)(
    "materializes a %s approval as a non-claimable decision",
    (approval, outcome, state, reason) => {
      const result = createAuthority().issueDecision(issueInput({ approvalOutcome: approval }));
      expect(result.status).toBe("issued");
      if (result.status !== "issued") throw new Error("expected issued decision");
      expect(result.decision.outcome).toBe(outcome);
      expect(result.decision.state).toBe(state);
      expect(result.decision.reasonCodes).toContain(reason);
    },
  );

  it("materializes inactive, expired, and revoked evidence as exact non-claimable decisions", () => {
    const base = issueInput();
    const identityWithoutFingerprint = Object.fromEntries(
      Object.entries(base.serviceIdentityEvidence).filter(([key]) => key !== "evidenceFingerprint"),
    );
    const approvalWithoutFingerprint = Object.fromEntries(
      Object.entries(base.humanApprovalEvidence).filter(([key]) => key !== "evidenceFingerprint"),
    );
    const cases = [
      {
        label: "identity not active",
        serviceIdentityEvidence: createVerifiedServiceIdentityEvidence({
          ...identityWithoutFingerprint,
          notBefore: "2026-08-23T01:05:00.000Z",
        } as never),
        humanApprovalEvidence: base.humanApprovalEvidence,
        expectedReason: "service_identity_not_active",
      },
      {
        label: "identity expired",
        serviceIdentityEvidence: createVerifiedServiceIdentityEvidence({
          ...identityWithoutFingerprint,
          issuedAt: "2026-08-23T00:30:00.000Z",
          notBefore: "2026-08-23T00:30:00.000Z",
          expiresAt: "2026-08-23T00:59:00.000Z",
        } as never),
        humanApprovalEvidence: base.humanApprovalEvidence,
        expectedReason: "service_identity_expired",
      },
      {
        label: "identity revoked",
        serviceIdentityEvidence: createVerifiedServiceIdentityEvidence({
          ...identityWithoutFingerprint,
          revocationVersion: 1,
          revocationState: "revoked",
        } as never),
        humanApprovalEvidence: base.humanApprovalEvidence,
        expectedReason: "service_identity_revoked",
      },
      {
        label: "approval expired",
        serviceIdentityEvidence: base.serviceIdentityEvidence,
        humanApprovalEvidence: createHumanExecutionApprovalEvidence({
          ...approvalWithoutFingerprint,
          issuedAt: "2026-08-23T00:30:00.000Z",
          expiresAt: "2026-08-23T00:59:00.000Z",
        } as never),
        expectedReason: "human_approval_expired",
      },
    ] as const;

    for (const testCase of cases) {
      const result = createAuthority().issueDecision({
        ...base,
        serviceIdentityEvidence: testCase.serviceIdentityEvidence,
        humanApprovalEvidence: testCase.humanApprovalEvidence,
      });
      expect(result.status, testCase.label).toBe("issued");
      if (result.status !== "issued") throw new Error(`expected ${testCase.label} Decision`);
      expect(result.decision.outcome, testCase.label).toBe("denied");
      expect(result.decision.state, testCase.label).toBe("not-claimable");
      expect(result.decision.reasonCodes, testCase.label).toEqual(
        ["execution_authorization_denied", testCase.expectedReason].sort(),
      );
    }
  });

  it("fails closed for tampered evidence and conflicting identity reuse", () => {
    const authority = createAuthority();
    const valid = issueInput();
    expect(authority.issueDecision(valid).status).toBe("issued");

    expect(
      authority.issueDecision({
        ...valid,
        authorizationDecisionId: "authorization-decision-two",
        serviceIdentityEvidence: {
          ...valid.serviceIdentityEvidence,
          subjectReference: "subject/other-service",
        },
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["non_authoritative_artifact"] });

    const conflictingRequest = createExecutionAuthorizationRequest({
      ...Object.fromEntries(
        Object.entries(valid.authorizationRequest).filter(([key]) => key !== "requestFingerprint"),
      ),
      purpose: "Create a conflicting governed memo",
    } as never);
    expect(
      authority.issueDecision({
        ...valid,
        authorizationRequest: conflictingRequest,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["conflicting_identity"] });

    const reusedAttempt = createAuthorizationFixture({ requestId: "authorization-request-two" });
    expect(
      authority.issueDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: "authorization-decision-two",
        authorizationRequest: reusedAttempt.request,
        serviceIdentityEvidence: reusedAttempt.identity,
        humanApprovalEvidence: reusedAttempt.approval,
        evaluatedAt: AUTHORIZATION_EVALUATED_AT,
        expiresAt: "2026-08-23T01:15:00.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["conflicting_identity"] });
  });

  it("denies mismatched identity, approval, and captured policy bindings", () => {
    const authority = createAuthority();
    const input = issueInput();
    const configuration = authorizationAuthorityConfiguration();
    const semanticFingerprints = [
      configuration.consumerDescriptorFingerprint,
      configuration.deliveryTransactionFingerprint,
      configuration.contextPackageFingerprint,
      configuration.invocationRequestFingerprint,
      configuration.executionAttemptFingerprint,
      configuration.adapterFingerprint,
      configuration.modelPolicyFingerprint,
      configuration.executionInstructionProfileFingerprint,
      configuration.credentialReferenceFingerprint,
    ];
    expect(new Set(semanticFingerprints).size).toBe(semanticFingerprints.length);
    const mismatchedRequest = createExecutionAuthorizationRequest({
      ...Object.fromEntries(
        Object.entries(input.authorizationRequest).filter(([key]) => key !== "requestFingerprint"),
      ),
      modelPolicyReference: "model-policy/other",
    } as never);
    const result = authority.issueDecision({
      ...input,
      authorizationRequest: mismatchedRequest,
      humanApprovalEvidence: createAuthorizationFixture().approval,
    });

    expect(result.status).toBe("issued");
    if (result.status !== "issued") throw new Error("expected denied decision");
    expect(result.decision.outcome).toBe("denied");
    expect(result.decision.reasonCodes).toContain("model_policy_binding_mismatch");
    expect(result.decision.reasonCodes).toContain("approval_binding_mismatch");

    for (const [configurationOverride, expectedReason] of [
      [{ subjectReference: "subject/other-service" }, "identity_binding_mismatch"],
      [{ consumerId: "consumer-other" }, "consumer_binding_mismatch"],
      [
        { consumerDescriptorFingerprint: configuration.deliveryTransactionFingerprint },
        "consumer_binding_mismatch",
      ],
      [{ deliveryTransactionId: "delivery-other" }, "delivery_binding_mismatch"],
      [
        { deliveryTransactionFingerprint: configuration.contextPackageFingerprint },
        "delivery_binding_mismatch",
      ],
      [{ contextPackageId: "context-other" }, "context_binding_mismatch"],
      [
        { contextPackageFingerprint: configuration.invocationRequestFingerprint },
        "context_binding_mismatch",
      ],
      [{ invocationRequestId: "invocation-other" }, "invocation_binding_mismatch"],
      [
        { invocationRequestFingerprint: configuration.executionAttemptFingerprint },
        "invocation_binding_mismatch",
      ],
      [{ executionAttemptId: "execution-attempt-other" }, "execution_attempt_binding_mismatch"],
      [
        { executionAttemptFingerprint: configuration.adapterFingerprint },
        "execution_attempt_binding_mismatch",
      ],
      [{ identityIssuerReference: "identity-authority/other" }, "identity_binding_mismatch"],
      [{ assuranceProfileReference: "assurance/other" }, "identity_binding_mismatch"],
      [{ audienceReference: "audience/other" }, "identity_binding_mismatch"],
      [{ approvalAuthorityReference: "approval-authority/other" }, "approval_binding_mismatch"],
      [{ environmentClass: "staging" }, "environment_binding_mismatch"],
      [{ providerFamilyReference: "provider-family/other" }, "provider_family_binding_mismatch"],
      [{ adapterId: "adapter-other" }, "adapter_binding_mismatch"],
      [{ adapterFingerprint: configuration.modelPolicyFingerprint }, "adapter_binding_mismatch"],
      [{ modelPolicyReference: "model-policy/other" }, "model_policy_binding_mismatch"],
      [
        { modelPolicyFingerprint: configuration.executionInstructionProfileFingerprint },
        "model_policy_binding_mismatch",
      ],
      [
        { executionInstructionProfileReference: "instruction-profile/other" },
        "execution_instruction_profile_binding_mismatch",
      ],
      [
        {
          executionInstructionProfileFingerprint: configuration.credentialReferenceFingerprint,
        },
        "execution_instruction_profile_binding_mismatch",
      ],
      [
        { credentialReferenceId: "credential-reference-other" },
        "credential_reference_binding_mismatch",
      ],
      [
        { credentialReferenceFingerprint: configuration.consumerDescriptorFingerprint },
        "credential_reference_binding_mismatch",
      ],
      [{ credentialRotationVersion: "rotation-v2" }, "credential_reference_binding_mismatch"],
      [{ maximumDataClassification: "public" }, "data_classification_rejected"],
      [
        {
          maximumLimits: {
            ...authorizationAuthorityConfiguration().maximumLimits,
            maximumOutputTokens: 100,
          },
        },
        "limit_binding_mismatch",
      ],
    ] as const) {
      const substituted = createInMemoryExecutionAuthorizationAuthority({
        ...authorizationAuthorityConfiguration(),
        ...configurationOverride,
      }).issueDecision(input);
      expect(substituted.status, expectedReason).toBe("issued");
      if (substituted.status === "issued") {
        expect(substituted.decision.outcome, expectedReason).toBe("denied");
        const expectedBindingReasons =
          expectedReason === "environment_binding_mismatch"
            ? ["environment_binding_mismatch", "identity_binding_mismatch"]
            : [expectedReason];
        expect(substituted.decision.reasonCodes, expectedReason).toEqual(
          ["execution_authorization_denied", ...expectedBindingReasons].sort(),
        );
      }
    }
  });

  it("binds the processing tier and exact Service Identity authority coordinates", () => {
    const fixture = createAuthorizationFixture();
    const authority = createInMemoryExecutionAuthorizationAuthority({
      ...authorizationAuthorityConfiguration(),
      processingTier: "default",
      serviceIdentityEvidenceId: fixture.identity.serviceIdentityEvidenceId,
      workloadIdentityReference: fixture.identity.workloadIdentityReference,
      serviceIdentityIssuerProofReference: fixture.identity.issuerProofReference,
    } as never);
    const allowed = authority.issueDecision({
      ...issueInput(),
      authorizationDecisionId: "authorization-decision-authority-bindings",
    });
    expect(allowed.status).toBe("issued");
    if (allowed.status !== "issued") throw new Error("expected issued decision");
    expect(allowed.decision.outcome).toBe("allowed");
    expect(allowed.decision.authorizationRequest.processingTier).toBe("default");

    const substitutedIdentity = createVerifiedServiceIdentityEvidence({
      ...Object.fromEntries(
        Object.entries(fixture.identity).filter(([key]) => key !== "evidenceFingerprint"),
      ),
      serviceIdentityEvidenceId: "substituted-evidence",
      workloadIdentityReference: "workload/substituted",
      issuerProofReference: "proof/substituted",
    } as never);
    const substitutionAuthority = createInMemoryExecutionAuthorizationAuthority({
      ...authorizationAuthorityConfiguration(),
      processingTier: "default",
      serviceIdentityEvidenceId: fixture.identity.serviceIdentityEvidenceId,
      workloadIdentityReference: fixture.identity.workloadIdentityReference,
      serviceIdentityIssuerProofReference: fixture.identity.issuerProofReference,
    } as never);
    const substituted = substitutionAuthority.issueDecision({
      ...issueInput(),
      authorizationDecisionId: "authorization-decision-substituted-identity",
      serviceIdentityEvidence: substitutedIdentity,
    });
    expect(substituted.status).toBe("issued");
    if (substituted.status !== "issued") throw new Error("expected denied decision");
    expect(substituted.decision.outcome).toBe("denied");
    expect(substituted.decision.reasonCodes).toContain("identity_binding_mismatch");
  });

  it("allows exactly one concurrent claim and permanently binds the exact attempt", async () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claimInput = {
      schemaVersion: "1.0" as const,
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, async () => authority.claimDecision(claimInput)),
    );

    expect(results.filter((result) => result.status === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(7);
    expect(authority.claimDecision({ ...claimInput, idempotentRetry: true })).toEqual(
      results.find((result) => result.status === "claimed"),
    );
    expect(
      authority.claimDecision({
        ...claimInput,
        authorizationClaimId: "authorization-claim-other",
        executionAttemptId: "execution-attempt-other",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["attempt_mismatch"] });
  });

  it("keeps claim ownership after modeled downstream failures", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claimed = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    });
    expect(claimed.status).toBe("claimed");

    for (const failure of [
      "cancellation",
      "timeout",
      "credential-failure",
      "final-gate-failure",
      "transport-failure",
      "ambiguous-execution",
    ]) {
      const inspected = authority.inspectDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
      });
      expect(inspected.status, failure).toBe("found");
      if (inspected.status === "found")
        expect(inspected.claim, failure).toEqual(
          claimed.status === "claimed" ? claimed.claim : null,
        );
    }
  });

  it("applies monotonic revocation without reopening a claim", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claim = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    });
    expect(claim.status).toBe("claimed");
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:00:30.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["invalid_input"] });
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:02:00.000Z",
      }).status,
    ).toBe("revoked");
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:03:00.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["stale_revocation_version"] });
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 2,
        revokedAt: "2026-08-23T01:01:30.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["invalid_input"] });

    const inspected = authority.inspectDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issued.decision.authorizationDecisionId,
    });
    expect(inspected.status).toBe("found");
    if (inspected.status === "found") {
      expect(inspected.revoked).toBe(true);
      expect(inspected.claim).toEqual(claim.status === "claimed" ? claim.claim : null);
    }
  });

  it("rejects an unauthorized revocation authority and invalid limit configuration", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/other",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:02:00.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["non_authoritative_artifact"] });
    expect(() =>
      createInMemoryExecutionAuthorizationAuthority({
        ...authorizationAuthorityConfiguration(),
        maximumLimits: {
          ...authorizationAuthorityConfiguration().maximumLimits,
          maximumAttempts: -1,
        },
      }),
    ).toThrow(TypeError);
  });

  it("verifies only registered exact decisions and claims at the supplied time", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claimed = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: AUTHORIZATION_DIGEST,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    });
    if (claimed.status !== "claimed") throw new Error("expected claim");

    expect(
      authority.verifyDecision({
        schemaVersion: "1.0",
        authorizationDecision: issued.decision,
        evaluatedAt: "2026-08-23T01:02:00.000Z",
      }),
    ).toEqual({ status: "valid" });
    expect(
      authority.verifyClaim({
        schemaVersion: "1.0",
        authorizationDecision: issued.decision,
        authorizationClaim: claimed.claim,
        evaluatedAt: "2026-08-23T01:00:30.000Z",
      }),
    ).toEqual({ status: "invalid", reasonCodes: ["authorization_not_active"] });
    expect(
      authority.verifyClaim({
        schemaVersion: "1.0",
        authorizationDecision: issued.decision,
        authorizationClaim: claimed.claim,
        evaluatedAt: "2026-08-23T01:02:00.000Z",
      }),
    ).toEqual({ status: "valid" });
    expect(
      authority.verifyDecision({
        schemaVersion: "1.0",
        authorizationDecision: issued.decision,
        evaluatedAt: "2026-08-23T01:16:00.000Z",
      }),
    ).toEqual({ status: "invalid", reasonCodes: ["authorization_expired"] });
  });

  it("gives permanent claim identity conflicts precedence over mutable authorization state", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const originalClaimInput = {
      schemaVersion: "1.0" as const,
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    };
    expect(authority.claimDecision(originalClaimInput).status).toBe("claimed");

    const conflictingReuse = {
      ...originalClaimInput,
      claimedAt: "2026-08-23T01:02:00.000Z",
    };
    expect(authority.claimDecision(conflictingReuse)).toEqual({
      status: "rejected",
      reasonCodes: ["conflicting_identity"],
    });
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:03:00.000Z",
      }).status,
    ).toBe("revoked");
    expect(authority.claimDecision(conflictingReuse)).toEqual({
      status: "rejected",
      reasonCodes: ["conflicting_identity"],
    });
    expect(
      authority.claimDecision({
        ...conflictingReuse,
        claimedAt: "2026-08-23T01:16:00.000Z",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["conflicting_identity"] });
    expect(
      authority.claimDecision({
        ...originalClaimInput,
        authorizationClaimId: "authorization-claim-two",
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["already_claimed"] });

    for (const targetState of ["active", "expired", "revoked", "non-claimable"] as const) {
      const foreignAuthority = createAuthority();
      const foreignIssued = foreignAuthority.issueDecision({
        ...issueInput({ approvalOutcome: targetState === "non-claimable" ? "denied" : "allowed" }),
        authorizationDecisionId: `authorization-decision-${targetState}`,
      });
      if (foreignIssued.status !== "issued") throw new Error("expected foreign issued decision");
      if (targetState === "revoked") {
        expect(
          foreignAuthority.revokeDecision({
            schemaVersion: "1.0",
            authorizationDecisionId: foreignIssued.decision.authorizationDecisionId,
            revocationAuthorityReference: "revocation-authority/founderos",
            revocationVersion: 1,
            revokedAt: "2026-08-23T01:02:00.000Z",
          }).status,
        ).toBe("revoked");
      }
      expect(
        authority.claimDecision({
          schemaVersion: "1.0",
          authorizationClaimId: "authorization-claim-one",
          authorizationDecision: foreignIssued.decision,
          executionAttemptId: foreignIssued.decision.authorizationRequest.executionAttemptId,
          executionAttemptFingerprint:
            foreignIssued.decision.authorizationRequest.executionAttemptFingerprint,
          claimedAt:
            targetState === "expired" ? "2026-08-23T01:16:00.000Z" : "2026-08-23T01:02:00.000Z",
          idempotentRetry: false,
        }),
        targetState,
      ).toEqual({ status: "rejected", reasonCodes: ["conflicting_identity"] });
    }
  });

  it("fails closed for future approval and pre-issuance claim, revocation, or verification", () => {
    const futureApprovalInput = issueInput();
    const futureApproval = createHumanExecutionApprovalEvidence({
      ...Object.fromEntries(
        Object.entries(futureApprovalInput.humanApprovalEvidence).filter(
          ([key]) => key !== "evidenceFingerprint",
        ),
      ),
      issuedAt: "2026-08-23T01:01:00.000Z",
      expiresAt: "2026-08-23T01:20:00.000Z",
    } as never);
    const denied = createAuthority().issueDecision({
      ...futureApprovalInput,
      humanApprovalEvidence: futureApproval,
    });
    expect(denied.status).toBe("issued");
    if (denied.status === "issued") {
      expect(denied.decision.outcome).toBe("denied");
      expect(denied.decision.reasonCodes).toContain("human_approval_invalid");
    }

    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const beforeIssuance = "2026-08-23T00:59:00.000Z";
    expect(
      authority.claimDecision({
        schemaVersion: "1.0",
        authorizationClaimId: "authorization-claim-early",
        authorizationDecision: issued.decision,
        executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
        executionAttemptFingerprint:
          issued.decision.authorizationRequest.executionAttemptFingerprint,
        claimedAt: beforeIssuance,
        idempotentRetry: false,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["authorization_not_active"] });
    expect(
      authority.verifyDecision({
        schemaVersion: "1.0",
        authorizationDecision: issued.decision,
        evaluatedAt: beforeIssuance,
      }),
    ).toEqual({ status: "invalid", reasonCodes: ["authorization_not_active"] });
    expect(
      authority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: issued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: beforeIssuance,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["invalid_input"] });
  });

  it("rejects every non-claimable, revoked, expired, and foreign Decision claim path", () => {
    for (const approvalOutcome of ["denied", "review-required"] as const) {
      const authority = createAuthority();
      const issued = authority.issueDecision(issueInput({ approvalOutcome }));
      if (issued.status !== "issued") throw new Error("expected non-claimable decision");
      expect(
        authority.claimDecision({
          schemaVersion: "1.0",
          authorizationClaimId: `authorization-claim-${approvalOutcome}`,
          authorizationDecision: issued.decision,
          executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
          executionAttemptFingerprint:
            issued.decision.authorizationRequest.executionAttemptFingerprint,
          claimedAt: "2026-08-23T01:01:00.000Z",
          idempotentRetry: false,
        }),
        approvalOutcome,
      ).toEqual({ status: "rejected", reasonCodes: ["authorization_not_claimable"] });
    }

    const revokedAuthority = createAuthority();
    const revokedIssued = revokedAuthority.issueDecision(issueInput());
    if (revokedIssued.status !== "issued") throw new Error("expected revocable decision");
    expect(
      revokedAuthority.revokeDecision({
        schemaVersion: "1.0",
        authorizationDecisionId: revokedIssued.decision.authorizationDecisionId,
        revocationAuthorityReference: "revocation-authority/founderos",
        revocationVersion: 1,
        revokedAt: "2026-08-23T01:01:00.000Z",
      }).status,
    ).toBe("revoked");
    expect(
      revokedAuthority.claimDecision({
        schemaVersion: "1.0",
        authorizationClaimId: "authorization-claim-revoked",
        authorizationDecision: revokedIssued.decision,
        executionAttemptId: revokedIssued.decision.authorizationRequest.executionAttemptId,
        executionAttemptFingerprint:
          revokedIssued.decision.authorizationRequest.executionAttemptFingerprint,
        claimedAt: "2026-08-23T01:02:00.000Z",
        idempotentRetry: false,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["authorization_revoked"] });

    const expiredAuthority = createAuthority();
    const expiredIssued = expiredAuthority.issueDecision(issueInput());
    if (expiredIssued.status !== "issued") throw new Error("expected expiring decision");
    expect(
      expiredAuthority.claimDecision({
        schemaVersion: "1.0",
        authorizationClaimId: "authorization-claim-expired",
        authorizationDecision: expiredIssued.decision,
        executionAttemptId: expiredIssued.decision.authorizationRequest.executionAttemptId,
        executionAttemptFingerprint:
          expiredIssued.decision.authorizationRequest.executionAttemptFingerprint,
        claimedAt: "2026-08-23T01:15:00.000Z",
        idempotentRetry: false,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["authorization_expired"] });

    const foreignAuthority = createAuthority();
    const foreignIssued = foreignAuthority.issueDecision({
      ...issueInput(),
      authorizationDecisionId: "authorization-decision-foreign",
    });
    if (foreignIssued.status !== "issued") throw new Error("expected foreign decision");
    expect(
      createAuthority().claimDecision({
        schemaVersion: "1.0",
        authorizationClaimId: "authorization-claim-foreign",
        authorizationDecision: foreignIssued.decision,
        executionAttemptId: foreignIssued.decision.authorizationRequest.executionAttemptId,
        executionAttemptFingerprint:
          foreignIssued.decision.authorizationRequest.executionAttemptFingerprint,
        claimedAt: "2026-08-23T01:01:00.000Z",
        idempotentRetry: false,
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["non_authoritative_artifact"] });
  });

  it("normalizes unexpected internal faults without exposing exception details", () => {
    const authority = createAuthority();
    const replayInput = issueInput();
    const issued = authority.issueDecision(replayInput);
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claimed = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: "authorization-claim-one",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    });
    if (claimed.status !== "claimed") throw new Error("expected claim");

    const fault = vi.spyOn(globalThis, "structuredClone").mockImplementation(() => {
      throw new Error("sensitive-provider-error /private/path");
    });
    try {
      const results = [
        [ExecutionAuthorizationIssuanceResultSchema, authority.issueDecision(replayInput)],
        [
          ExecutionAuthorizationClaimResultSchema,
          authority.claimDecision({
            schemaVersion: "1.0",
            authorizationClaimId: "authorization-claim-two",
            authorizationDecision: issued.decision,
            executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
            executionAttemptFingerprint:
              issued.decision.authorizationRequest.executionAttemptFingerprint,
            claimedAt: "2026-08-23T01:02:00.000Z",
            idempotentRetry: false,
          }),
        ],
        [
          ExecutionAuthorizationInspectionResultSchema,
          authority.inspectDecision({
            schemaVersion: "1.0",
            authorizationDecisionId: issued.decision.authorizationDecisionId,
          }),
        ],
        [
          ExecutionAuthorizationRevocationResultSchema,
          authority.revokeDecision({
            schemaVersion: "1.0",
            authorizationDecisionId: issued.decision.authorizationDecisionId,
            revocationAuthorityReference: "revocation-authority/founderos",
            revocationVersion: 1,
            revokedAt: "2026-08-23T01:02:00.000Z",
          }),
        ],
        [
          ExecutionAuthorizationVerificationResultSchema,
          authority.verifyDecision({
            schemaVersion: "1.0",
            authorizationDecision: issued.decision,
            evaluatedAt: "2026-08-23T01:02:00.000Z",
          }),
        ],
        [
          ExecutionAuthorizationVerificationResultSchema,
          authority.verifyClaim({
            schemaVersion: "1.0",
            authorizationDecision: issued.decision,
            authorizationClaim: claimed.claim,
            evaluatedAt: "2026-08-23T01:02:00.000Z",
          }),
        ],
      ] as const;
      for (const [schema, result] of results) {
        expect(schema.safeParse(result).success).toBe(true);
        expect(result).toMatchObject({ reasonCodes: ["internal_authority_integrity_failure"] });
        expect(JSON.stringify(result)).not.toMatch(/sensitive|provider|private|path/iu);
        expect(Object.isFrozen(result)).toBe(true);
      }
    } finally {
      fault.mockRestore();
    }
  });

  it("publishes claim sequence and ownership only after all fallible claim work succeeds", () => {
    const authority = createAuthority();
    const issued = authority.issueDecision(issueInput());
    if (issued.status !== "issued") throw new Error("expected issued decision");
    const claimInput = {
      schemaVersion: "1.0" as const,
      authorizationClaimId: "authorization-claim-late-fault",
      authorizationDecision: issued.decision,
      executionAttemptId: issued.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint: issued.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: "2026-08-23T01:01:00.000Z",
      idempotentRetry: false,
    };

    const originalStructuredClone = globalThis.structuredClone;
    let lateFaultInjected = false;
    const fault = vi.spyOn(globalThis, "structuredClone").mockImplementation((value, options) => {
      if (
        typeof value === "object" &&
        value !== null &&
        Reflect.get(value, "status") === "claimed" &&
        Object.prototype.hasOwnProperty.call(value, "claim")
      ) {
        lateFaultInjected = true;
        throw new Error("late-claim-fault");
      }
      return originalStructuredClone(value, options);
    });
    let rejectedClaim: ReturnType<typeof authority.claimDecision>;
    try {
      rejectedClaim = authority.claimDecision(claimInput);
    } finally {
      fault.mockRestore();
    }
    expect(rejectedClaim).toEqual({
      status: "rejected",
      reasonCodes: ["internal_authority_integrity_failure"],
    });
    expect(lateFaultInjected).toBe(true);

    const inspected = authority.inspectDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issued.decision.authorizationDecisionId,
    });
    expect(inspected.status).toBe("found");
    if (inspected.status !== "found") throw new Error("expected registered decision");
    expect(inspected.claim).toBeNull();

    const retry = authority.claimDecision(claimInput);
    expect(retry.status).toBe("claimed");
    if (retry.status !== "claimed") throw new Error("expected successful retry");
    expect(retry.claim.claimSequence).toBe(1);
  });

  it("rejects unknown authority configuration and freezes its narrow facade", () => {
    const authority = createAuthority();
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.keys(authority).sort()).toEqual([
      "claimDecision",
      "inspectDecision",
      "issueDecision",
      "revokeDecision",
      "verifyClaim",
      "verifyDecision",
    ]);
    expect(() =>
      createInMemoryExecutionAuthorizationAuthority({
        ...authorizationAuthorityConfiguration(),
        callback: () => undefined,
      } as never),
    ).toThrow(TypeError);
  });
});
