import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ContextConsumerDescriptorSchema,
  ContextConsumptionEvidenceSchema,
  ContextDeliveryFreshnessPolicySchema,
  ContextDeliveryPolicyDecisionEvidenceSchema,
  ContextDeliveryPolicyInputSchema,
  ContextDeliveryReplayPolicySchema,
  GovernedContextDeliveryRequestSchema,
  type ContextConsumerDescriptor,
} from "../src/index.js";

const HASH = (value: string): string => createHash("sha256").update(value).digest("hex");

function descriptor(): ContextConsumerDescriptor {
  return {
    schemaVersion: "1.0",
    consumerId: "consumer-evaluation",
    consumerType: "evaluation-harness",
    displayName: "Milestone 11 evaluation consumer",
    owningSystem: "knowledge/evaluation",
    purpose: "Evaluate governed context delivery",
    capabilities: {
      acceptedContextPackageVersions: ["1.0"],
      acceptedAssemblyPolicyVersions: ["1.0"],
      maxObjectCount: 10,
      maxCanonicalCharacters: 100_000,
      supportsProvenance: true,
      supportsReplay: true,
      supportsReceipts: true,
      acceptsTruncatedContent: true,
      acceptsEmptyPackages: false,
    },
    policySubjectReference: "policy/subjects/evaluation",
    descriptorFingerprint: HASH("descriptor"),
  };
}

function policyInput() {
  return {
    schemaVersion: "1.0" as const,
    subjectReference: "policy/subjects/evaluation",
    consumerReference: "consumer-evaluation",
    contextPackageReference: {
      contextPackageId: "context-package",
      contextFingerprint: HASH("package"),
    },
    activeSnapshotReference: { snapshotId: "snapshot-one", activationSequence: 3 },
    intendedPurpose: "Evaluate governed context delivery",
    projectScope: ["FounderOS"],
    domainScope: ["FounderOS"],
    dataClassification: "internal" as const,
    requestedOperation: "context_delivery" as const,
    requestTimestamp: "2026-07-29T00:00:00.000Z",
  };
}

function request() {
  return {
    schemaVersion: "1.0" as const,
    deliveryRequestId: "delivery-request-one",
    contextPackageId: "context-package",
    contextPackageFingerprint: HASH("package"),
    consumer: descriptor(),
    consumerDescriptorFingerprint: descriptor().descriptorFingerprint,
    purpose: "Evaluate governed context delivery",
    capabilityRequirements: {
      requireProvenance: true,
      requireReplay: true,
      requireReceipt: true,
    },
    policyInput: policyInput(),
    freshnessPolicy: {
      schemaVersion: "1.0" as const,
      expiresAt: "2026-07-30T00:00:00.000Z",
      invalidateOnNewerActiveSnapshot: false,
      allowHistoricalReplay: true,
    },
    idempotencyKey: "delivery:key:0001",
    replayPolicy: { schemaVersion: "1.0" as const, mode: "evaluation-only" as const },
    requestActor: { actorId: "evaluation-runner", actorType: "service" as const },
    reason: "Verify the governed boundary",
    requestedAt: "2026-07-29T00:00:00.000Z",
    requestFingerprint: HASH("request"),
  };
}

describe("Milestone 11 governed delivery contracts", () => {
  it("accepts strict provider-neutral Consumer descriptors", () => {
    expect(ContextConsumerDescriptorSchema.parse(descriptor())).toEqual(descriptor());
    expect(JSON.stringify(descriptor())).not.toMatch(/model|prompt|providerConfig|apiKey/iu);
  });

  it.each([
    ["unknown field", { hiddenPrompt: "do not allow" }],
    ["unsupported version", { schemaVersion: "2.0" }],
    ["empty purpose", { purpose: "" }],
    ["physical owning path", { owningSystem: "/Users/adam/private" }],
    ["secret-bearing subject path", { policySubjectReference: "file://private/policy" }],
  ])("rejects Consumer descriptor %s", (_name, mutation) => {
    expect(
      ContextConsumerDescriptorSchema.safeParse({ ...descriptor(), ...mutation }).success,
    ).toBe(false);
  });

  it("rejects duplicate versions and non-positive capability limits", () => {
    expect(
      ContextConsumerDescriptorSchema.safeParse({
        ...descriptor(),
        capabilities: {
          ...descriptor().capabilities,
          acceptedContextPackageVersions: ["1.0", "1.0"],
        },
      }).success,
    ).toBe(false);
    expect(
      ContextConsumerDescriptorSchema.safeParse({
        ...descriptor(),
        capabilities: { ...descriptor().capabilities, maxObjectCount: 0 },
      }).success,
    ).toBe(false);
  });

  it("accepts exact policy input and rejects physical references", () => {
    expect(ContextDeliveryPolicyInputSchema.parse(policyInput())).toEqual(policyInput());
    expect(
      ContextDeliveryPolicyInputSchema.safeParse({
        ...policyInput(),
        subjectReference: "C:\\private\\subject",
      }).success,
    ).toBe(false);
  });

  it.each(["allowed", "denied", "review-required", "not-evaluated"] as const)(
    "accepts explicit policy outcome %s with matching reason evidence",
    (outcome) => {
      const matchingReason = {
        allowed: "policy_allowed",
        denied: "policy_denied",
        "review-required": "policy_review_required",
        "not-evaluated": "policy_not_evaluated",
      } as const;
      expect(
        ContextDeliveryPolicyDecisionEvidenceSchema.safeParse({
          schemaVersion: "1.0",
          decisionId: `decision-${outcome}`,
          decisionVersion: "1.0",
          inputFingerprint: HASH("input"),
          deliveryRequestId: "delivery-request-one",
          deliveryRequestFingerprint: HASH("request"),
          outcome,
          contextPackageId: "context-package",
          contextPackageFingerprint: HASH("package"),
          consumerId: "consumer-evaluation",
          consumerDescriptorFingerprint: HASH("descriptor"),
          intendedPurpose: "Evaluate governed context delivery",
          decisionAuthorityReference: "policy/decisions/m11",
          reasonCodes: [matchingReason[outcome]],
          decidedAt: "2026-07-29T00:00:00.000Z",
          decisionFingerprint: HASH("decision"),
        }).success,
      ).toBe(true);
    },
  );

  it("rejects contradictory and unsorted policy evidence", () => {
    const base = {
      schemaVersion: "1.0",
      decisionId: "decision-denied",
      decisionVersion: "1.0",
      inputFingerprint: HASH("input"),
      deliveryRequestId: "delivery-request-one",
      deliveryRequestFingerprint: HASH("request"),
      outcome: "denied",
      contextPackageId: "context-package",
      contextPackageFingerprint: HASH("package"),
      consumerId: "consumer-evaluation",
      consumerDescriptorFingerprint: HASH("descriptor"),
      intendedPurpose: "Evaluate governed context delivery",
      decisionAuthorityReference: "policy/decisions/m11",
      reasonCodes: ["policy_allowed"],
      decidedAt: "2026-07-29T00:00:00.000Z",
      decisionFingerprint: HASH("decision"),
    };
    expect(ContextDeliveryPolicyDecisionEvidenceSchema.safeParse(base).success).toBe(false);
    expect(
      ContextDeliveryPolicyDecisionEvidenceSchema.safeParse({
        ...base,
        reasonCodes: ["scope_not_approved", "policy_denied"],
      }).success,
    ).toBe(false);
    expect(
      ContextDeliveryPolicyDecisionEvidenceSchema.safeParse({
        ...base,
        outcome: "allowed",
        reasonCodes: ["governance_approval_missing", "policy_allowed"],
      }).success,
    ).toBe(false);
  });

  it("rejects contradictory freshness and replay policy", () => {
    expect(
      ContextDeliveryFreshnessPolicySchema.safeParse({
        schemaVersion: "1.0",
        invalidateOnNewerActiveSnapshot: true,
        allowHistoricalReplay: true,
      }).success,
    ).toBe(false);
    expect(
      ContextDeliveryFreshnessPolicySchema.safeParse({
        schemaVersion: "1.0",
        notBefore: "2026-07-30T00:00:00.000Z",
        expiresAt: "2026-07-29T00:00:00.000Z",
        invalidateOnNewerActiveSnapshot: false,
        allowHistoricalReplay: false,
      }).success,
    ).toBe(false);
    expect(
      ContextDeliveryReplayPolicySchema.safeParse({ schemaVersion: "1.0", mode: "free" }).success,
    ).toBe(false);
  });

  it("accepts a fully bound request and rejects binding contradictions", () => {
    expect(GovernedContextDeliveryRequestSchema.parse(request())).toEqual(request());
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({
        ...request(),
        consumerDescriptorFingerprint: HASH("another-descriptor"),
      }).success,
    ).toBe(false);
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({
        ...request(),
        contextPackageFingerprint: HASH("another-package"),
      }).success,
    ).toBe(false);
  });

  it("requires expiration for repeatable-until-expiration and harness identity for evaluation replay", () => {
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({
        ...request(),
        freshnessPolicy: {
          schemaVersion: "1.0",
          invalidateOnNewerActiveSnapshot: false,
          allowHistoricalReplay: false,
        },
        replayPolicy: { schemaVersion: "1.0", mode: "repeatable-until-expiration" },
      }).success,
    ).toBe(false);
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({
        ...request(),
        consumer: { ...descriptor(), consumerType: "internal-service" },
      }).success,
    ).toBe(false);
  });

  it("rejects malformed idempotency keys and provider-specific request fields", () => {
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({ ...request(), idempotencyKey: "short" })
        .success,
    ).toBe(false);
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({ ...request(), model: "provider-model" })
        .success,
    ).toBe(false);
  });

  it("defines consumption evidence without reasoning or provider output", () => {
    const evidence = {
      schemaVersion: "1.0",
      consumptionId: "consumption-one",
      receiptId: "receipt-one",
      consumerOperationReference: "consumer/operations/one",
      startedAt: "2026-07-29T00:00:00.000Z",
      completedAt: "2026-07-29T00:01:00.000Z",
      resultEvidenceReference: "consumer/results/one",
      consumptionFingerprint: HASH("consumption"),
    };
    expect(ContextConsumptionEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(
      ContextConsumptionEvidenceSchema.safeParse({
        ...evidence,
        failureReason: "cannot coexist with result evidence",
      }).success,
    ).toBe(false);
  });
});
