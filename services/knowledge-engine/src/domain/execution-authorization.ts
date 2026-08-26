import {
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  ExecutionAuthorizationRequestSchema,
  HumanExecutionApprovalEvidenceSchema,
  VerifiedServiceIdentityEvidenceSchema,
  findDurableCanonicalJsonIssue,
  type ExecutionAuthorizationClaim,
  type ExecutionAuthorizationDecision,
  type ExecutionAuthorizationRequest,
  type ExecutionAuthorizationVerificationResult,
  type HumanExecutionApprovalEvidence,
  type VerifiedServiceIdentityEvidence,
} from "@founderos/knowledge-schema";

import { createDurableCanonicalJsonSha256Fingerprint } from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

export type ExecutionAuthorizationRequestInput = Omit<
  ExecutionAuthorizationRequest,
  "requestFingerprint"
>;
export type VerifiedServiceIdentityEvidenceInput = Omit<
  VerifiedServiceIdentityEvidence,
  "evidenceFingerprint"
>;
export type HumanExecutionApprovalEvidenceInput = Omit<
  HumanExecutionApprovalEvidence,
  "evidenceFingerprint"
>;
export type ExecutionAuthorizationDecisionInput = Omit<
  ExecutionAuthorizationDecision,
  "decisionFingerprint"
>;
export type ExecutionAuthorizationClaimInput = Omit<
  ExecutionAuthorizationClaim,
  "claimFingerprint"
>;

const DOMAINS = Object.freeze({
  request: "founderos.m17.execution-authorization-request.v1",
  serviceIdentity: "founderos.m17.verified-service-identity-evidence.v1",
  approval: "founderos.m17.human-execution-approval-evidence.v1",
  decision: "founderos.m17.execution-authorization-decision.v1",
  claim: "founderos.m17.execution-authorization-claim.v1",
});

interface SafeParseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function fingerprint(domain: string, artifact: unknown): string {
  return createDurableCanonicalJsonSha256Fingerprint({ domain, artifact });
}

function createFingerprintedArtifact<T extends object>(
  schema: SafeParseSchema<T>,
  input: unknown,
  fingerprintKey: string,
  domain: string,
): T {
  if (
    findDurableCanonicalJsonIssue(input) !== null ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Reflect.ownKeys(input).includes(fingerprintKey)
  ) {
    throw new TypeError("Execution authorization artifact input is invalid");
  }
  try {
    const captured = structuredClone(input) as Record<string, unknown>;
    const candidate = {
      ...captured,
      [fingerprintKey]: fingerprint(domain, captured),
    };
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) throw new TypeError("invalid");
    return immutableCopy(parsed.data);
  } catch {
    throw new TypeError("Execution authorization artifact input is invalid");
  }
}

function verifyFingerprintedArtifact<T extends object>(
  schema: SafeParseSchema<T>,
  value: unknown,
  fingerprintKey: keyof T & string,
  domain: string,
): ExecutionAuthorizationVerificationResult {
  try {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return immutableCopy({
        status: "invalid",
        reasonCodes: ["non_authoritative_artifact"],
      });
    }
    const artifactRecord = parsed.data as Record<string, unknown>;
    const { [fingerprintKey]: observed, ...artifact } = artifactRecord;
    if (typeof observed !== "string" || observed !== fingerprint(domain, artifact)) {
      return immutableCopy({
        status: "invalid",
        reasonCodes: ["non_authoritative_artifact"],
      });
    }
    return immutableCopy({ status: "valid" });
  } catch {
    return immutableCopy({
      status: "invalid",
      reasonCodes: ["non_authoritative_artifact"],
    });
  }
}

export function createExecutionAuthorizationRequest(
  input: ExecutionAuthorizationRequestInput,
): ExecutionAuthorizationRequest {
  return createFingerprintedArtifact(
    ExecutionAuthorizationRequestSchema,
    input,
    "requestFingerprint",
    DOMAINS.request,
  );
}

export function createVerifiedServiceIdentityEvidence(
  input: VerifiedServiceIdentityEvidenceInput,
): VerifiedServiceIdentityEvidence {
  return createFingerprintedArtifact(
    VerifiedServiceIdentityEvidenceSchema,
    input,
    "evidenceFingerprint",
    DOMAINS.serviceIdentity,
  );
}

export function createHumanExecutionApprovalEvidence(
  input: HumanExecutionApprovalEvidenceInput,
): HumanExecutionApprovalEvidence {
  return createFingerprintedArtifact(
    HumanExecutionApprovalEvidenceSchema,
    input,
    "evidenceFingerprint",
    DOMAINS.approval,
  );
}

export function createExecutionAuthorizationDecision(
  input: ExecutionAuthorizationDecisionInput,
): ExecutionAuthorizationDecision {
  return createFingerprintedArtifact(
    ExecutionAuthorizationDecisionSchema,
    input,
    "decisionFingerprint",
    DOMAINS.decision,
  );
}

export function createExecutionAuthorizationClaim(
  input: ExecutionAuthorizationClaimInput,
): ExecutionAuthorizationClaim {
  return createFingerprintedArtifact(
    ExecutionAuthorizationClaimSchema,
    input,
    "claimFingerprint",
    DOMAINS.claim,
  );
}

export function verifyExecutionAuthorizationRequest(
  value: unknown,
): ExecutionAuthorizationVerificationResult {
  return verifyFingerprintedArtifact(
    ExecutionAuthorizationRequestSchema,
    value,
    "requestFingerprint",
    DOMAINS.request,
  );
}

export function verifyVerifiedServiceIdentityEvidence(
  value: unknown,
): ExecutionAuthorizationVerificationResult {
  return verifyFingerprintedArtifact(
    VerifiedServiceIdentityEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.serviceIdentity,
  );
}

export function verifyHumanExecutionApprovalEvidence(
  value: unknown,
): ExecutionAuthorizationVerificationResult {
  return verifyFingerprintedArtifact(
    HumanExecutionApprovalEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.approval,
  );
}

export function verifyExecutionAuthorizationDecision(
  value: unknown,
): ExecutionAuthorizationVerificationResult {
  return verifyFingerprintedArtifact(
    ExecutionAuthorizationDecisionSchema,
    value,
    "decisionFingerprint",
    DOMAINS.decision,
  );
}

export function verifyExecutionAuthorizationClaim(
  value: unknown,
): ExecutionAuthorizationVerificationResult {
  return verifyFingerprintedArtifact(
    ExecutionAuthorizationClaimSchema,
    value,
    "claimFingerprint",
    DOMAINS.claim,
  );
}
