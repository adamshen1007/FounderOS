import {
  findDurableCanonicalJsonIssue,
  type ExecutionAuthorizationRequest,
  type HumanExecutionApprovalEvidence,
  type VerifiedServiceIdentityEvidence,
} from "@founderos/knowledge-schema";

import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import {
  createInMemoryExecutionAuthorizationAuthority,
  type InMemoryExecutionAuthorizationAuthorityConfiguration,
} from "./in-memory-execution-authorization-authority.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";

export interface DisabledExecutionAuthorizationHarnessInput {
  readonly schemaVersion: "1.0";
  readonly mode: "disabled-evaluation";
  readonly authorityConfiguration: InMemoryExecutionAuthorizationAuthorityConfiguration;
  readonly authorizationDecisionId: string;
  readonly authorizationClaimId: string;
  readonly authorizationRequest: ExecutionAuthorizationRequest;
  readonly serviceIdentityEvidence: VerifiedServiceIdentityEvidence;
  readonly humanApprovalEvidence: HumanExecutionApprovalEvidence;
  readonly evaluatedAt: string;
  readonly expiresAt: string;
  readonly claimedAt: string;
  readonly verifiedAt: string;
  readonly revocationVersion: number;
  readonly revokedAt: string;
  readonly laterRevocationVersion: number;
  readonly laterRevokedAt: string;
  readonly postRevocationVerifiedAt: string;
}

export type DisabledExecutionAuthorizationHarnessResult =
  | {
      readonly status: "authorization-foundation-verified";
      readonly mode: "disabled-evaluation";
      readonly liveExecutionReady: false;
      readonly decisionFingerprint: string;
      readonly claimFingerprint: string;
      readonly revocationVersion: number;
      readonly claimPreservedAfterRevocation: true;
    }
  | {
      readonly status:
        "authorization-foundation-rejected" | "authorization-foundation-review-required";
      readonly mode: "disabled-evaluation";
      readonly liveExecutionReady: false;
      readonly reasonCode:
        | "decision-denied"
        | "decision-review-required"
        | "evaluation-input-rejected"
        | "evaluation-integrity-rejected";
    };

const INPUT_KEYS = [
  "schemaVersion",
  "mode",
  "authorityConfiguration",
  "authorizationDecisionId",
  "authorizationClaimId",
  "authorizationRequest",
  "serviceIdentityEvidence",
  "humanApprovalEvidence",
  "evaluatedAt",
  "expiresAt",
  "claimedAt",
  "verifiedAt",
  "revocationVersion",
  "revokedAt",
  "laterRevocationVersion",
  "laterRevokedAt",
  "postRevocationVerifiedAt",
] as const;

function immutable<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function rejected(
  reasonCode:
    | "decision-denied"
    | "decision-review-required"
    | "evaluation-input-rejected"
    | "evaluation-integrity-rejected",
): DisabledExecutionAuthorizationHarnessResult {
  return immutable({
    status:
      reasonCode === "decision-review-required"
        ? "authorization-foundation-review-required"
        : "authorization-foundation-rejected",
    mode: "disabled-evaluation",
    liveExecutionReady: false,
    reasonCode,
  });
}

/**
 * Exercises the local authority only. This composition boundary has no credential, provider,
 * transport, filesystem, process, timer, callback, or network capability.
 */
export function runDisabledExecutionAuthorizationHarness(
  rawInput: DisabledExecutionAuthorizationHarnessInput,
): DisabledExecutionAuthorizationHarnessResult {
  const descriptors = captureExactOwnEnumerableDataDescriptors(rawInput, INPUT_KEYS);
  if (descriptors === null || findDurableCanonicalJsonIssue(rawInput) !== null) {
    return rejected("evaluation-input-rejected");
  }
  const input = Object.fromEntries(
    INPUT_KEYS.map((key) => [key, descriptors[key].value]),
  ) as unknown as DisabledExecutionAuthorizationHarnessInput;
  if (
    input.schemaVersion !== "1.0" ||
    input.mode !== "disabled-evaluation" ||
    !Number.isSafeInteger(input.revocationVersion) ||
    !Number.isSafeInteger(input.laterRevocationVersion) ||
    input.laterRevocationVersion !== input.revocationVersion + 1 ||
    Date.parse(input.laterRevokedAt) <= Date.parse(input.revokedAt)
  ) {
    return rejected("evaluation-input-rejected");
  }
  try {
    const authority = createInMemoryExecutionAuthorizationAuthority(input.authorityConfiguration);
    const issuance = authority.issueDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: input.authorizationDecisionId,
      authorizationRequest: input.authorizationRequest,
      serviceIdentityEvidence: input.serviceIdentityEvidence,
      humanApprovalEvidence: input.humanApprovalEvidence,
      evaluatedAt: input.evaluatedAt,
      expiresAt: input.expiresAt,
    });
    if (issuance.status !== "issued") return rejected("evaluation-integrity-rejected");
    if (issuance.decision.outcome === "review-required") {
      return rejected("decision-review-required");
    }
    if (issuance.decision.outcome === "denied") return rejected("decision-denied");
    const claim = authority.claimDecision({
      schemaVersion: "1.0",
      authorizationClaimId: input.authorizationClaimId,
      authorizationDecision: issuance.decision,
      executionAttemptId: issuance.decision.authorizationRequest.executionAttemptId,
      executionAttemptFingerprint:
        issuance.decision.authorizationRequest.executionAttemptFingerprint,
      claimedAt: input.claimedAt,
      idempotentRetry: false,
    });
    if (claim.status !== "claimed") return rejected("evaluation-integrity-rejected");
    const preRevocationInspection = authority.inspectDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
    });
    if (
      preRevocationInspection.status !== "found" ||
      preRevocationInspection.revoked ||
      preRevocationInspection.currentRevocationVersion !== 0 ||
      preRevocationInspection.claim?.claimFingerprint !== claim.claim.claimFingerprint
    ) {
      return rejected("evaluation-integrity-rejected");
    }
    const decisionVerification = authority.verifyDecision({
      schemaVersion: "1.0",
      authorizationDecision: issuance.decision,
      evaluatedAt: input.verifiedAt,
    });
    const claimVerification = authority.verifyClaim({
      schemaVersion: "1.0",
      authorizationDecision: issuance.decision,
      authorizationClaim: claim.claim,
      evaluatedAt: input.verifiedAt,
    });
    if (decisionVerification.status !== "valid" || claimVerification.status !== "valid") {
      return rejected("evaluation-integrity-rejected");
    }
    const revocation = authority.revokeDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
      revocationAuthorityReference: input.authorityConfiguration.revocationAuthorityReference,
      revocationVersion: input.revocationVersion,
      revokedAt: input.revokedAt,
    });
    if (revocation.status !== "revoked") return rejected("evaluation-integrity-rejected");
    const staleRevocation = authority.revokeDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
      revocationAuthorityReference: input.authorityConfiguration.revocationAuthorityReference,
      revocationVersion: input.revocationVersion,
      revokedAt: input.laterRevokedAt,
    });
    if (
      staleRevocation.status !== "rejected" ||
      !staleRevocation.reasonCodes.includes("stale_revocation_version")
    ) {
      return rejected("evaluation-integrity-rejected");
    }
    const laterRevocation = authority.revokeDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
      revocationAuthorityReference: input.authorityConfiguration.revocationAuthorityReference,
      revocationVersion: input.laterRevocationVersion,
      revokedAt: input.laterRevokedAt,
    });
    if (laterRevocation.status !== "revoked") {
      return rejected("evaluation-integrity-rejected");
    }
    const postRevocationInspection = authority.inspectDecision({
      schemaVersion: "1.0",
      authorizationDecisionId: issuance.decision.authorizationDecisionId,
    });
    if (
      postRevocationInspection.status !== "found" ||
      !postRevocationInspection.revoked ||
      postRevocationInspection.currentRevocationVersion !== input.laterRevocationVersion ||
      postRevocationInspection.claim?.claimFingerprint !== claim.claim.claimFingerprint
    ) {
      return rejected("evaluation-integrity-rejected");
    }
    const revokedDecisionVerification = authority.verifyDecision({
      schemaVersion: "1.0",
      authorizationDecision: issuance.decision,
      evaluatedAt: input.postRevocationVerifiedAt,
    });
    const revokedClaimVerification = authority.verifyClaim({
      schemaVersion: "1.0",
      authorizationDecision: issuance.decision,
      authorizationClaim: claim.claim,
      evaluatedAt: input.postRevocationVerifiedAt,
    });
    if (
      revokedDecisionVerification.status !== "invalid" ||
      !revokedDecisionVerification.reasonCodes.includes("authorization_revoked") ||
      revokedClaimVerification.status !== "invalid" ||
      !revokedClaimVerification.reasonCodes.includes("authorization_revoked")
    ) {
      return rejected("evaluation-integrity-rejected");
    }
    return immutable({
      status: "authorization-foundation-verified",
      mode: "disabled-evaluation",
      liveExecutionReady: false,
      decisionFingerprint: issuance.decision.decisionFingerprint,
      claimFingerprint: claim.claim.claimFingerprint,
      revocationVersion: input.laterRevocationVersion,
      claimPreservedAfterRevocation: true,
    });
  } catch {
    return rejected("evaluation-integrity-rejected");
  }
}
