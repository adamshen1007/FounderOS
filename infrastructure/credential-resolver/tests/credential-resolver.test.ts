import {
  createSyntheticCredentialResolver,
  runDisabledSyntheticCredentialReleaseHarness,
} from "../src/index.js";

import type { CredentialResolutionCommand } from "@founderos/knowledge-schema";
import { describe, expect, it, vi } from "vitest";

const digest = "a".repeat(64);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(",")}}`;
}

function recordFingerprint(domain: string, artifact: object): string {
  return createHash("sha256").update(canonical({ domain, artifact })).digest("hex");
}

function command(
  overrides: Partial<CredentialResolutionCommand> = {},
): CredentialResolutionCommand {
  return {
    schemaVersion: "1.0",
    resolutionRequestId: "resolution.request.001",
    authorizationDecisionId: "authorization.decision.001",
    authorizationDecisionFingerprint: digest,
    authorizationClaimId: "authorization.claim.001",
    authorizationClaimFingerprint: digest,
    executionAttemptId: "execution.attempt.001",
    executionAttemptFingerprint: digest,
    subjectReference: "subject/founder-service",
    consumerId: "consumer-one",
    deliveryTransactionId: "delivery-transaction-one",
    contextPackageId: "context-package-one",
    invocationRequestId: "invocation-one",
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    adapterFingerprint: digest,
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    expectedRotationVersion: "rotation-v1",
    purposeReference: "purpose/founder-decision-memo",
    evaluatedAt: "2026-08-23T01:00:02.000Z",
    resolutionDeadline: "2026-08-23T01:10:00.000Z",
    resolverId: "resolver.synthetic.primary",
    ...overrides,
  };
}

function configuration() {
  return {
    schemaVersion: "1.0",
    resolverId: "resolver.synthetic.primary",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    initialRotationVersion: "rotation-v1",
    initializedAt: "2026-08-23T00:00:00.000Z",
    environmentClass: "evaluation",
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    rotationAuthorityReference: "authority/credential-rotation",
    revocationAuthorityReference: "authority/credential-revocation",
  } as const;
}

function resolver() {
  return createSyntheticCredentialResolver(configuration());
}

function rotationRecord(overrides: Record<string, unknown> = {}) {
  const artifact = {
    schemaVersion: "1.0" as const,
    rotationRecordId: "rotation-record-two",
    rotationSequence: 2,
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    priorRotationVersion: "rotation-v1",
    nextRotationVersion: "rotation-v2",
    effectiveAt: "2026-08-23T00:05:00.000Z",
    rotationAuthorityReference: "authority/credential-rotation",
    evidenceReference: "evidence/rotation-two",
    environmentClass: "evaluation" as const,
    providerFamilyReference: "provider-family/openai",
    adapterId: "adapter-one",
    ...overrides,
  };
  return {
    ...artifact,
    recordFingerprint: recordFingerprint("founderos.m18.credential-rotation-record.v1", artifact),
  };
}

function revocationRecord(overrides: Record<string, unknown> = {}) {
  const artifact = {
    schemaVersion: "1.0" as const,
    revocationRecordId: "revocation-record-one",
    credentialReferenceId: "credential-reference-one",
    credentialReferenceFingerprint: digest,
    rotationVersion: "rotation-v1",
    revocationVersion: 1,
    revokedAt: "2026-08-23T00:06:00.000Z",
    revocationAuthorityReference: "authority/credential-revocation",
    reasonCode: "credential_rotation_operator_revoked" as const,
    ...overrides,
  };
  return {
    ...artifact,
    recordFingerprint: recordFingerprint("founderos.m18.credential-revocation-record.v1", artifact),
  };
}

describe("Milestone 18 synthetic credential resolver", () => {
  it("rejects accessor-backed configuration without invoking the getter", () => {
    let getterRead = false;
    const candidate = { ...configuration() } as Record<string, unknown>;
    Object.defineProperty(candidate, "resolverId", {
      enumerable: true,
      get() {
        getterRead = true;
        return "resolver.synthetic.primary";
      },
    });
    expect(() =>
      createSyntheticCredentialResolver(candidate as unknown as ReturnType<typeof configuration>),
    ).toThrow(TypeError);
    expect(getterRead).toBe(false);
  });

  it("normalizes hostile configuration inspection failures to a closed TypeError", () => {
    const hostile = new Proxy(configuration(), {
      getPrototypeOf() {
        throw new Error("hostile-inspection-detail");
      },
    });
    expect(() => createSyntheticCredentialResolver(hostile)).toThrow(
      new TypeError("Synthetic credential resolver configuration is invalid"),
    );
  });

  it("materializes one synthetic buffer and returns only after complete release", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must remain unreachable");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const subject = resolver();
    const result = subject.resolveAndRelease(command());
    expect(result.status).toBe("resolved");
    expect(subject.inspect()).toMatchObject({
      activeRotationVersion: "rotation-v1",
      materializationCount: 1,
      releaseCount: 1,
      lastReleaseAllZero: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/bytes|material|secret|token|header/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rotates monotonically and permanently rejects prior versions", () => {
    const subject = resolver();
    expect(subject.rotate(rotationRecord())).toEqual({
      status: "rotated",
      activeRotationVersion: "rotation-v2",
      rotationSequence: 2,
    });
    expect(subject.resolveAndRelease(command()).status).toBe("rejected");
    expect(
      subject.resolveAndRelease(command({ expectedRotationVersion: "rotation-v2" })).status,
    ).toBe("resolved");
  });

  it("revokes the active version monotonically and never reopens it", () => {
    const subject = resolver();
    expect(subject.revoke(revocationRecord())).toEqual({ status: "revoked", revocationVersion: 1 });
    expect(subject.resolveAndRelease(command())).toEqual({
      status: "rejected",
      reasonCodes: ["credential_version_revoked"],
    });
    expect(
      subject.revoke(
        revocationRecord({
          revocationRecordId: "revocation-record-stale",
          revokedAt: "2026-08-23T00:07:00.000Z",
        }),
      ).status,
    ).toBe("rejected");
  });

  it("rejects a tampered transition record before changing active state", () => {
    const subject = resolver();
    const valid = rotationRecord();
    expect(subject.rotate({ ...valid, recordFingerprint: digest })).toEqual({
      status: "rejected",
      reasonCode: "invalid_input",
    });
    expect(subject.inspect()).toMatchObject({
      activeRotationVersion: "rotation-v1",
      rotationSequence: 1,
    });
  });

  it("permanently reserves rejected rotation record and version identities", () => {
    const subject = resolver();
    const rejected = rotationRecord({ rotationSequence: 3 });
    expect(subject.rotate(rejected)).toEqual({
      status: "rejected",
      reasonCode: "invalid_rotation_transition",
    });
    expect(subject.rotate(rejected)).toEqual({
      status: "rejected",
      reasonCode: "invalid_rotation_transition",
    });
    expect(subject.rotate(rotationRecord({ rotationSequence: 2 }))).toEqual({
      status: "rejected",
      reasonCode: "conflicting_identity",
    });
    expect(
      subject.rotate(
        rotationRecord({
          rotationRecordId: "rotation-record-reserved-version",
          rotationSequence: 2,
        }),
      ),
    ).toEqual({ status: "rejected", reasonCode: "invalid_rotation_transition" });
    expect(subject.inspect()).toMatchObject({
      activeRotationVersion: "rotation-v1",
      rotationSequence: 1,
    });
  });

  it("permanently reserves rejected revocation record identities", () => {
    const subject = resolver();
    const rejected = revocationRecord({ rotationVersion: "rotation-v2" });
    expect(subject.revoke(rejected)).toEqual({
      status: "rejected",
      reasonCode: "invalid_revocation_transition",
    });
    expect(subject.revoke(rejected)).toEqual({
      status: "rejected",
      reasonCode: "invalid_revocation_transition",
    });
    expect(subject.revoke(revocationRecord())).toEqual({
      status: "rejected",
      reasonCode: "conflicting_identity",
    });
    expect(subject.inspect()).toMatchObject({
      currentRevocationVersion: 0,
      activeVersionRevoked: false,
    });
  });

  it("overwrites the owned buffer when a fault occurs after materialization", () => {
    const evaluation = runDisabledSyntheticCredentialReleaseHarness({
      configuration: configuration(),
      command: command(),
      faultMode: "after-materialization",
    });
    expect(evaluation.result).toEqual({
      status: "rejected",
      reasonCodes: ["materialization_failure"],
    });
    expect(evaluation.inspection).toMatchObject({
      materializationCount: 1,
      releaseCount: 1,
      lastReleaseAllZero: true,
    });
    expect(evaluation.liveExecutionReady).toBe(false);
  });
});
import { createHash } from "node:crypto";
