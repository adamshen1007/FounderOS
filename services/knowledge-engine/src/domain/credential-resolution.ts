import {
  CredentialResolutionEvidenceSchema,
  CredentialResolutionRequestSchema,
  CredentialRevocationRecordSchema,
  CredentialRotationRecordSchema,
  findDurableCanonicalJsonIssue,
  type CredentialResolutionEvidence,
  type CredentialResolutionRequest,
  type CredentialResolutionVerificationResult,
  type CredentialRevocationRecord,
  type CredentialRotationRecord,
} from "@founderos/knowledge-schema";

import { createDurableCanonicalJsonSha256Fingerprint } from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

export type CredentialResolutionRequestInput = Omit<
  CredentialResolutionRequest,
  "requestFingerprint"
>;
export type CredentialResolutionEvidenceInput = Omit<
  CredentialResolutionEvidence,
  "evidenceFingerprint"
>;
export type CredentialRotationRecordInput = Omit<CredentialRotationRecord, "recordFingerprint">;
export type CredentialRevocationRecordInput = Omit<CredentialRevocationRecord, "recordFingerprint">;

const DOMAINS = Object.freeze({
  request: "founderos.m18.credential-resolution-request.v1",
  evidence: "founderos.m18.credential-resolution-evidence.v1",
  rotation: "founderos.m18.credential-rotation-record.v1",
  revocation: "founderos.m18.credential-revocation-record.v1",
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

function createArtifact<T extends object>(
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
    throw new TypeError("Credential resolution artifact input is invalid");
  }
  try {
    const captured = structuredClone(input) as Record<string, unknown>;
    const parsed = schema.safeParse({
      ...captured,
      [fingerprintKey]: fingerprint(domain, captured),
    });
    if (!parsed.success) throw new TypeError("invalid");
    return immutableCopy(parsed.data);
  } catch {
    throw new TypeError("Credential resolution artifact input is invalid");
  }
}

export function createCredentialResolutionRequest(
  input: CredentialResolutionRequestInput,
): CredentialResolutionRequest {
  return createArtifact(
    CredentialResolutionRequestSchema,
    input,
    "requestFingerprint",
    DOMAINS.request,
  );
}

export function verifyCredentialResolutionRequest(
  value: unknown,
): CredentialResolutionVerificationResult {
  return verifyArtifact(
    CredentialResolutionRequestSchema,
    value,
    "requestFingerprint",
    DOMAINS.request,
  );
}

export function createCredentialResolutionEvidence(
  input: CredentialResolutionEvidenceInput,
): CredentialResolutionEvidence {
  return createArtifact(
    CredentialResolutionEvidenceSchema,
    input,
    "evidenceFingerprint",
    DOMAINS.evidence,
  );
}

export function createCredentialRotationRecord(
  input: CredentialRotationRecordInput,
): CredentialRotationRecord {
  return createArtifact(
    CredentialRotationRecordSchema,
    input,
    "recordFingerprint",
    DOMAINS.rotation,
  );
}

export function createCredentialRevocationRecord(
  input: CredentialRevocationRecordInput,
): CredentialRevocationRecord {
  return createArtifact(
    CredentialRevocationRecordSchema,
    input,
    "recordFingerprint",
    DOMAINS.revocation,
  );
}

function verifyArtifact<T extends object>(
  schema: SafeParseSchema<T>,
  value: unknown,
  fingerprintKey: string,
  domain: string,
): CredentialResolutionVerificationResult {
  try {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new TypeError("invalid");
    const artifact = { ...(parsed.data as Record<string, unknown>) };
    const observed = artifact[fingerprintKey];
    delete artifact[fingerprintKey];
    if (observed !== fingerprint(domain, artifact)) throw new TypeError("invalid");
    return immutableCopy({ status: "valid" });
  } catch {
    return immutableCopy({ status: "invalid", reasonCodes: ["non_authoritative_artifact"] });
  }
}

export function verifyCredentialResolutionEvidence(
  value: unknown,
): CredentialResolutionVerificationResult {
  return verifyArtifact(
    CredentialResolutionEvidenceSchema,
    value,
    "evidenceFingerprint",
    DOMAINS.evidence,
  );
}

export function verifyCredentialRotationRecord(
  value: unknown,
): CredentialResolutionVerificationResult {
  return verifyArtifact(
    CredentialRotationRecordSchema,
    value,
    "recordFingerprint",
    DOMAINS.rotation,
  );
}

export function verifyCredentialRevocationRecord(
  value: unknown,
): CredentialResolutionVerificationResult {
  return verifyArtifact(
    CredentialRevocationRecordSchema,
    value,
    "recordFingerprint",
    DOMAINS.revocation,
  );
}
