import {
  ContextConsumerDescriptorSchema,
  GovernedContextDeliveryResultSchema,
  GovernedContextDeliveryRequestSchema,
  type GovernedContextDeliveryEnvelope,
  type GovernedContextDeliveryRequest,
} from "@founderos/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  BoundedContextDeliveryIdempotencyStore,
  createContextConsumerDescriptor,
  createContextConsumptionEvidence,
  createContextDeliveryPolicyDecisionEvidence,
  createContextDeliveryReplayEvidence,
  createGovernedContextDeliveryRequest,
  createKnowledgeContextFingerprint,
  deliverGovernedKnowledgeContext,
  evaluateContextDeliveryFreshness,
  matchContextConsumerCapabilities,
  serializeGovernedContextDeliveryResult,
  verifyContextConsumerCompatibilityResult,
  verifyContextConsumerDescriptor,
  verifyContextConsumptionEvidence,
  verifyContextDeliveryFreshnessEvidence,
  verifyContextDeliveryPolicyDecisionEvidence,
  verifyContextDeliveryReceipt,
  verifyContextDeliveryReplayEvidence,
  verifyGovernedContextDeliveryEnvelope,
  verifyGovernedContextDeliveryRequest,
  verifyKnowledgeContextPackage,
} from "../src/index.js";
import { createCanonicalSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import { createContextDeliveryFixture, DELIVERY_TIME } from "./context-delivery-fixtures.js";
import {
  MILESTONE_11_CONTEXT_DELIVERY_EVALUATIONS,
  type ContextDeliveryEvaluationFixture,
} from "./fixtures/context-delivery-evaluations.js";

function reason(
  result: Awaited<ReturnType<typeof deliverGovernedKnowledgeContext>>,
): string | null {
  return result.status === "rejected" ? result.evidence.reasonCodes[0]! : null;
}

function envelopeVerificationInput(
  fixture: ReturnType<typeof createContextDeliveryFixture>,
  envelope: GovernedContextDeliveryEnvelope,
) {
  return {
    envelope,
    request: fixture.request,
    policyDecisionEvidence: fixture.policy,
    candidateInputs: fixture.objects,
    bindings: fixture.bindings,
    currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
    currentActivationSequence: fixture.currentActivationSequence,
    expectedDeliverySequence: 1,
    evaluatedAt: DELIVERY_TIME,
  };
}

function policyBoundToRequest(
  fixture: ReturnType<typeof createContextDeliveryFixture>,
  request: GovernedContextDeliveryRequest,
) {
  const { decisionFingerprint: _fingerprint, ...unsigned } = fixture.policy;
  void _fingerprint;
  return createContextDeliveryPolicyDecisionEvidence({
    ...unsigned,
    deliveryRequestId: request.deliveryRequestId,
    deliveryRequestFingerprint: request.requestFingerprint,
  });
}

function resignContextPackage(
  fixture: ReturnType<typeof createContextDeliveryFixture>,
  registryBinding: Record<string, unknown>,
) {
  const {
    contextPackageId: _id,
    contextFingerprint: _fingerprint,
    assembledAt,
    ...identity
  } = fixture.contextPackage;
  void _id;
  void _fingerprint;
  const unsigned = { ...identity, registryBinding };
  const contextFingerprint = createKnowledgeContextFingerprint(unsigned as never);
  return {
    ...unsigned,
    ...(assembledAt === undefined ? {} : { assembledAt }),
    contextPackageId: `context-${contextFingerprint}`,
    contextFingerprint,
  };
}

async function executeEvaluation(entry: ContextDeliveryEvaluationFixture) {
  let fixture = createContextDeliveryFixture();
  let input: Parameters<typeof deliverGovernedKnowledgeContext>[0] = fixture.input;
  let attempts = 1;

  switch (entry.name) {
    case "valid future reasoning Consumer":
      fixture = createContextDeliveryFixture({ consumerType: "reasoning-provider" });
      input = fixture.input;
      break;
    case "valid evaluation-harness Consumer":
    case "evaluation-only replay":
      fixture = createContextDeliveryFixture({ replayMode: "evaluation-only" });
      input = fixture.input;
      attempts = entry.name === "evaluation-only replay" ? 2 : 1;
      break;
    case "unsupported Context Package version":
      input = {
        ...fixture.input,
        contextPackage: { ...fixture.contextPackage, schemaVersion: "2.0" },
      };
      break;
    case "unsupported assembly policy version":
      input = {
        ...fixture.input,
        contextPackage: {
          ...fixture.contextPackage,
          request: { ...fixture.contextPackage.request, assemblyPolicyVersion: "2.0" },
        },
      };
      break;
    case "object-count capability mismatch":
      fixture = createContextDeliveryFixture({ consumerCapabilities: { maxObjectCount: 1 } });
      input = fixture.input;
      break;
    case "character-count capability mismatch":
      fixture = createContextDeliveryFixture({
        consumerCapabilities: { maxCanonicalCharacters: 1 },
      });
      input = fixture.input;
      break;
    case "truncated package rejected":
      fixture = createContextDeliveryFixture({
        packageMode: "truncated",
        consumerCapabilities: { acceptsTruncatedContent: false },
      });
      input = fixture.input;
      break;
    case "empty package rejected":
      fixture = createContextDeliveryFixture({
        packageMode: "empty",
        consumerCapabilities: { acceptsEmptyPackages: false },
      });
      input = fixture.input;
      break;
    case "provenance requirement mismatch":
      fixture = createContextDeliveryFixture({
        consumerCapabilities: { supportsProvenance: false },
      });
      input = fixture.input;
      break;
    case "receipt capability mismatch":
      fixture = createContextDeliveryFixture({ consumerCapabilities: { supportsReceipts: false } });
      input = fixture.input;
      break;
    case "replay capability mismatch":
      fixture = createContextDeliveryFixture({ consumerCapabilities: { supportsReplay: false } });
      input = fixture.input;
      break;
    case "policy denied":
      fixture = createContextDeliveryFixture({ policyOutcome: "denied" });
      input = fixture.input;
      break;
    case "policy review required":
      fixture = createContextDeliveryFixture({ policyOutcome: "review-required" });
      input = fixture.input;
      break;
    case "policy not evaluated":
      fixture = createContextDeliveryFixture({ policyOutcome: "not-evaluated" });
      input = fixture.input;
      break;
    case "missing policy evidence":
      input = { ...fixture.input, policyDecisionEvidence: undefined };
      break;
    case "expired policy evidence":
      fixture = createContextDeliveryFixture({ policyExpiresAt: "2026-07-29T00:30:00.000Z" });
      input = fixture.input;
      break;
    case "request not yet valid":
      fixture = createContextDeliveryFixture({
        freshnessPolicy: { notBefore: "2026-07-29T02:00:00.000Z" },
      });
      input = fixture.input;
      break;
    case "expired delivery request":
      fixture = createContextDeliveryFixture({
        freshnessPolicy: { expiresAt: "2026-07-29T00:30:00.000Z" },
      });
      input = fixture.input;
      break;
    case "maximum package age exceeded":
      fixture = createContextDeliveryFixture({ freshnessPolicy: { maxAgeSeconds: 30 } });
      input = fixture.input;
      break;
    case "new Active Snapshot invalidates delivery":
      fixture = createContextDeliveryFixture({
        activeSnapshotId: "snapshot-newer",
        freshnessPolicy: {
          invalidateOnNewerActiveSnapshot: true,
          allowHistoricalReplay: false,
        },
      });
      input = fixture.input;
      break;
    case "historical replay explicitly allowed":
      fixture = createContextDeliveryFixture({ activeSnapshotId: "snapshot-newer" });
      input = fixture.input;
      break;
    case "historical replay denied":
      fixture = createContextDeliveryFixture({
        activeSnapshotId: "snapshot-newer",
        freshnessPolicy: { allowHistoricalReplay: false },
      });
      input = fixture.input;
      break;
    case "identical idempotent replay":
      attempts = 2;
      break;
    case "conflicting idempotency-key reuse": {
      await deliverGovernedKnowledgeContext(input);
      const { requestFingerprint: _fingerprint, ...unsigned } = fixture.request;
      void _fingerprint;
      const conflicting = createGovernedContextDeliveryRequest({
        ...unsigned,
        deliveryRequestId: "delivery-request-evaluation-conflict",
      });
      input = {
        ...fixture.input,
        request: conflicting,
        policyDecisionEvidence: policyBoundToRequest(fixture, conflicting),
      };
      break;
    }
    case "single-use replay rejection":
      fixture = createContextDeliveryFixture({ replayMode: "single-delivery" });
      input = fixture.input;
      attempts = 2;
      break;
    case "repeatable-until-expiration success":
      fixture = createContextDeliveryFixture({ replayMode: "repeatable-until-expiration" });
      input = fixture.input;
      attempts = 2;
      break;
    case "Context Package tampering": {
      const contextPackage = structuredClone(fixture.contextPackage);
      contextPackage.included[0]!.canonicalContent = "tampered";
      input = { ...fixture.input, contextPackage };
      break;
    }
    case "Consumer Descriptor tampering": {
      const request = structuredClone(fixture.request);
      request.consumer.displayName = "Tampered";
      input = { ...fixture.input, request };
      break;
    }
    case "Delivery Request tampering":
      input = { ...fixture.input, request: { ...fixture.request, purpose: "Tampered" } };
      break;
    case "Policy evidence tampering":
      input = {
        ...fixture.input,
        policyDecisionEvidence: { ...fixture.policy, intendedPurpose: "Tampered" },
      };
      break;
    case "raw Knowledge Object bypass attempt":
      input = { ...fixture.input, contextPackage: fixture.objects[0] };
      break;
    case "full Query Result bypass attempt":
      input = {
        ...fixture.input,
        contextPackage: { schemaVersion: "1.0", queryId: "bypass", objects: fixture.objects },
      };
      break;
    case "hidden context injection attempt":
      input = {
        ...fixture.input,
        contextPackage: { ...fixture.contextPackage, hiddenContext: "bypass" },
      };
      break;
    case "physical-path privacy":
      input = {
        ...fixture.input,
        contextPackage: { ...fixture.contextPackage, diagnosticPath: "/private/founderos/data" },
      };
      break;
    case "Delivery Envelope tampering":
    case "Receipt tampering": {
      const delivered = await deliverGovernedKnowledgeContext(input);
      if (delivered.status !== "delivered") throw new Error("Expected evaluation delivery");
      const verification =
        entry.name === "Delivery Envelope tampering"
          ? verifyGovernedContextDeliveryEnvelope(
              envelopeVerificationInput(fixture, {
                ...delivered.envelope,
                deliveryPurpose: "tampered",
              }),
            )
          : verifyContextDeliveryReceipt({
              receipt: { ...delivered.receipt, receivedAt: "2026-07-29T02:00:00.000Z" },
              envelope: delivered.envelope,
              acknowledgment: delivered.acknowledgment,
              receivedAt: DELIVERY_TIME,
            });
      return {
        status: "integrity-failure" as const,
        reasonCodes: [],
        verification,
        envelopeFingerprint: false,
        receiptFingerprint: false,
        replayEvidence: false,
        stableReplay: false,
      };
    }
    case "stable reason ordering": {
      const compatibility = matchContextConsumerCapabilities(
        createContextDeliveryFixture({
          consumerCapabilities: {
            maxObjectCount: 1,
            maxCanonicalCharacters: 1,
            supportsProvenance: false,
          },
        }).request.consumer,
        fixture.contextPackage,
        fixture.request.capabilityRequirements,
        fixture.request.replayPolicy,
      );
      if (compatibility.reasonCodes.join() !== [...compatibility.reasonCodes].sort().join())
        throw new Error("Reason ordering is unstable");
      break;
    }
    default:
      break;
  }

  const firstResult = await deliverGovernedKnowledgeContext(input);
  let result = firstResult;
  for (let attempt = 1; attempt < attempts; attempt += 1)
    result = await deliverGovernedKnowledgeContext(input);
  const delivered = result.status === "delivered" ? result : null;
  const replayEvidence = fixture.input.idempotencyStore.inspectReplayEvidence(
    fixture.request.idempotencyKey,
  );
  return {
    status: result.status === "delivered" ? ("delivered" as const) : result.evidence.deliveryStatus,
    reasonCodes: result.status === "delivered" ? [] : result.evidence.reasonCodes,
    result,
    envelopeFingerprint:
      delivered !== null &&
      delivered.envelope.deliveryEnvelopeId ===
        `delivery-${delivered.envelope.deliveryFingerprint}`,
    receiptFingerprint:
      delivered !== null &&
      delivered.receipt.receiptId === `receipt-${delivered.receipt.receiptFingerprint}`,
    replayEvidence: replayEvidence !== null,
    stableReplay:
      attempts > 1 &&
      serializeGovernedContextDeliveryResult(firstResult) ===
        serializeGovernedContextDeliveryResult(result),
  };
}

describe("Milestone 11 governed Context Consumer boundary", () => {
  it("defines forty uniquely named executable evaluations", () => {
    expect(MILESTONE_11_CONTEXT_DELIVERY_EVALUATIONS).toHaveLength(40);
    expect(new Set(MILESTONE_11_CONTEXT_DELIVERY_EVALUATIONS.map((entry) => entry.name)).size).toBe(
      40,
    );
  });

  it.each(MILESTONE_11_CONTEXT_DELIVERY_EVALUATIONS)(
    "executes evaluation: $name",
    async (entry) => {
      const observation = await executeEvaluation(entry);
      expect(observation.status).toBe(entry.expectedStatus);
      if (entry.expectedReason !== undefined)
        expect(observation.reasonCodes).toContain(entry.expectedReason);
      expect(observation.envelopeFingerprint).toBe(entry.expectedArtifacts.envelopeFingerprint);
      expect(observation.receiptFingerprint).toBe(entry.expectedArtifacts.receiptFingerprint);
      expect(observation.replayEvidence).toBe(entry.expectedArtifacts.replayEvidence);
      expect(observation.stableReplay).toBe(entry.expectedArtifacts.stableReplay);
      if (observation.verification !== undefined)
        expect(observation.verification.status).toBe("invalid");
      const result = observation.result;
      if (result?.status === "delivered") {
        expect(result.envelope.contextPackage).toBeDefined();
        expect(result.receipt.deliveryStatus).toBe("accepted");
      }
    },
  );

  it.each(["internal-service", "reasoning-provider"] as const)(
    "delivers to a valid provider-neutral %s Consumer",
    async (consumerType) => {
      const fixture = createContextDeliveryFixture({ consumerType });
      const result = await deliverGovernedKnowledgeContext(fixture.input);
      expect(result.status).toBe("delivered");
      if (result.status !== "delivered") throw new Error("Expected delivery");
      expect(result.envelope.consumerId).toBe(fixture.request.consumer.consumerId);
      expect(result.envelope.contextPackage).toEqual(fixture.contextPackage);
      expect(result.receipt.deliveryStatus).toBe("accepted");
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.envelope.contextPackage)).toBe(true);
    },
  );

  it("supports the evaluation-harness boundary without invoking reasoning", async () => {
    const store = new BoundedContextDeliveryIdempotencyStore(4);
    const fixture = createContextDeliveryFixture({
      replayMode: "evaluation-only",
      idempotencyStore: store,
    });
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    expect(result.status).toBe("delivered");
    if (result.status !== "delivered") throw new Error("Expected delivery");
    expect(result.receipt.replayClassification).toBe("initial-delivery");
    expect(await deliverGovernedKnowledgeContext(fixture.input)).toEqual(result);
    expect(store.inspectReplayEvidence(fixture.request.idempotencyKey)?.replayClassification).toBe(
      "evaluation-replay",
    );
    expect(JSON.stringify(result)).not.toMatch(/assistant|chat|completion|modelOutput/iu);
  });

  it("is byte-stable for identical inputs and fresh bounded state", async () => {
    const first = createContextDeliveryFixture();
    const second = createContextDeliveryFixture();
    const left = await deliverGovernedKnowledgeContext(first.input);
    const right = await deliverGovernedKnowledgeContext(second.input);
    expect(right).toEqual(left);
    expect(serializeGovernedContextDeliveryResult(right)).toBe(
      serializeGovernedContextDeliveryResult(left),
    );
  });

  it.each([
    ["denied", "policy_denied"],
    ["review-required", "policy_review_required"],
    ["not-evaluated", "policy_not_evaluated"],
  ] as const)("fails closed for policy outcome %s", async (policyOutcome, expectedReason) => {
    const fixture = createContextDeliveryFixture({ policyOutcome });
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    expect(result).toMatchObject({
      status: "rejected",
      evidence: { deliveryStatus: "policy-denied" },
    });
    expect(reason(result)).toBe(expectedReason);
    expect(JSON.stringify(result)).not.toContain("deliveryEnvelopeId");
  });

  it("rejects missing, forged, and incorrectly bound policy evidence", async () => {
    const fixture = createContextDeliveryFixture();
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          policyDecisionEvidence: undefined,
        }),
      ),
    ).toBe("policy_evidence_invalid");
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          policyDecisionEvidence: { ...fixture.policy, decisionFingerprint: "0".repeat(64) },
        }),
      ),
    ).toBe("policy_evidence_invalid");
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          policyDecisionEvidence: {
            ...fixture.policy,
            contextPackageId: "context-another",
          },
        }),
      ),
    ).toBe("policy_evidence_invalid");
  });

  it.each([
    ["idempotency key", { idempotencyKey: "delivery:key:m11:changed" }],
    [
      "freshness controls",
      {
        freshnessPolicy: {
          schemaVersion: "1.0",
          expiresAt: "2026-07-30T12:00:00.000Z",
          maxAgeSeconds: 86_400,
          invalidateOnNewerActiveSnapshot: false,
          allowHistoricalReplay: false,
        },
      },
    ],
    [
      "capability requirements",
      {
        capabilityRequirements: {
          requireProvenance: false,
          requireReplay: true,
          requireReceipt: true,
        },
      },
    ],
    [
      "replay controls",
      { replayPolicy: { schemaVersion: "1.0", mode: "repeatable-until-expiration" } },
    ],
  ] as const)("rejects policy evidence reused after %s change", async (_name, mutation) => {
    const fixture = createContextDeliveryFixture();
    const { requestFingerprint: _fingerprint, ...unsigned } = fixture.request;
    void _fingerprint;
    const request = createGovernedContextDeliveryRequest({ ...unsigned, ...mutation });
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          request,
          policyDecisionEvidence: fixture.policy,
        }),
      ),
    ).toBe("policy_evidence_invalid");
  });

  it("rejects a policy decision that predates its bound request", async () => {
    const fixture = createContextDeliveryFixture({
      policyDecidedAt: "2026-07-28T23:59:59.000Z",
    });
    expect(reason(await deliverGovernedKnowledgeContext(fixture.input))).toBe(
      "policy_evidence_invalid",
    );
  });

  it.each([
    [
      "not-before",
      { freshnessPolicy: { notBefore: "2026-07-29T02:00:00.000Z" } },
      "request_not_yet_valid",
    ],
    [
      "request expiration",
      { freshnessPolicy: { expiresAt: "2026-07-29T00:30:00.000Z" } },
      "request_expired",
    ],
    ["maximum age", { freshnessPolicy: { maxAgeSeconds: 30 } }, "maximum_age_exceeded"],
    [
      "policy expiration",
      { policyExpiresAt: "2026-07-29T00:30:00.000Z" },
      "policy_evidence_expired",
    ],
    [
      "future policy decision",
      { policyDecidedAt: "2026-07-29T02:00:00.000Z" },
      "policy_decision_not_yet_valid",
    ],
  ] as const)("rejects %s using explicit time evidence", async (_name, options, expectedReason) => {
    const fixture = createContextDeliveryFixture(options);
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    expect(result).toMatchObject({ status: "rejected", evidence: { deliveryStatus: "expired" } });
    expect(reason(result)).toBe(expectedReason);
  });

  it("requires canonical explicit evaluation time", async () => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext({
      ...fixture.input,
      evaluatedAt: "2026-07-29T01:00:00Z",
    });
    expect(reason(result)).toBe("freshness_invalid");
  });

  it("allows approved historical replay while preserving the old package binding", async () => {
    const fixture = createContextDeliveryFixture({ activeSnapshotId: "snapshot-newer" });
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    expect(result.status).toBe("delivered");
    if (result.status !== "delivered") throw new Error("Expected historical delivery");
    expect(result.envelope.freshnessEvidence).toMatchObject({
      status: "fresh",
      historicalReplay: true,
      currentActiveSnapshotId: "snapshot-newer",
    });
    expect(result.envelope.activeSnapshotBinding.activeSnapshotId).toBe(
      fixture.contextPackage.snapshotBinding.activeSnapshotId,
    );
  });

  it("fails closed when historical registry-prefix integrity is unavailable", async () => {
    const fixture = createContextDeliveryFixture({ activeSnapshotId: "snapshot-newer" });
    const invalidPrefix = {
      ...fixture.input.registry,
      verifyIntegrityAtSequence: async () => ({
        ...fixture.bindings.integrity,
        status: "invalid" as const,
        integrityFingerprint: null,
        issues: [
          {
            code: "integrity_sequence_not_committed_boundary",
            message: "Historical prefix unavailable",
            transactionId: null,
            recordId: null,
            sequence: null,
          },
        ],
      }),
    };
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          registry: invalidPrefix,
        }),
      ),
    ).toBe("context_package_integrity_failure");
  });

  it.each([
    ["registry schema version", { registrySchemaVersion: "2.0" }],
    ["integrity fingerprint", { integrityFingerprint: "f".repeat(64) }],
    ["record count", { verifiedRecordCount: 2, verifiedThroughSequence: 2 }],
    ["verified sequence", { verifiedRecordCount: 4, verifiedThroughSequence: 4 }],
    ["recovered snapshot", { recoveredActiveSnapshotId: "snapshot-forged" }],
  ])("rejects re-signed historical package %s substitution", (_name, mutation) => {
    const fixture = createContextDeliveryFixture({ activeSnapshotId: "snapshot-newer" });
    if (fixture.bindings.recovery.status !== "recovered")
      throw new Error("Expected recovered fixture bindings");
    const packageValue = resignContextPackage(fixture, {
      ...fixture.contextPackage.registryBinding,
      ...mutation,
    });
    expect(
      verifyKnowledgeContextPackage({
        package: packageValue,
        candidateInputs: fixture.objects,
        bindings: {
          ...fixture.bindings,
          recovery: {
            ...fixture.bindings.recovery,
            activeSnapshotId: "snapshot-newer",
          },
        },
        historicalRegistryState: {
          integrity: fixture.bindings.integrity,
          recovery: fixture.bindings.recovery,
        },
      }).status,
    ).toBe("invalid");
  });

  it.each([
    [
      { allowHistoricalReplay: false, invalidateOnNewerActiveSnapshot: false },
      "historical_replay_not_allowed",
    ],
    [
      { allowHistoricalReplay: false, invalidateOnNewerActiveSnapshot: true },
      "historical_replay_not_allowed",
    ],
  ] as const)(
    "rejects unapproved or invalidated superseded packages",
    async (freshnessPolicy, expectedReason) => {
      const fixture = createContextDeliveryFixture({
        activeSnapshotId: "snapshot-newer",
        freshnessPolicy,
      });
      const result = await deliverGovernedKnowledgeContext(fixture.input);
      expect(result).toMatchObject({ status: "rejected", evidence: { deliveryStatus: "expired" } });
      expect(result.status === "rejected" ? result.evidence.reasonCodes : []).toContain(
        expectedReason,
      );
    },
  );

  it.each([
    ["object count", { maxObjectCount: 1 }, "object_count_exceeded"],
    ["character count", { maxCanonicalCharacters: 1 }, "character_count_exceeded"],
    ["provenance", { supportsProvenance: false }, "provenance_unsupported"],
    ["receipt", { supportsReceipts: false }, "receipt_unsupported"],
    ["replay", { supportsReplay: false }, "replay_unsupported"],
  ] as const)(
    "rejects %s capability mismatch",
    async (_name, consumerCapabilities, mismatchReason) => {
      const fixture = createContextDeliveryFixture({ consumerCapabilities });
      const compatibility = matchContextConsumerCapabilities(
        fixture.request.consumer,
        fixture.contextPackage,
        fixture.request.capabilityRequirements,
        fixture.request.replayPolicy,
      );
      expect(compatibility.reasonCodes).toContain(mismatchReason);
      expect(
        verifyContextConsumerCompatibilityResult({
          result: compatibility,
          consumer: fixture.request.consumer,
          contextPackage: fixture.contextPackage,
          requirements: fixture.request.capabilityRequirements,
          replayPolicy: fixture.request.replayPolicy,
        }).status,
      ).toBe("valid");
      const result = await deliverGovernedKnowledgeContext(fixture.input);
      expect(result).toMatchObject({
        status: "rejected",
        evidence: { deliveryStatus: "capability-mismatch" },
      });
      expect(reason(result)).toBe("consumer_capability_mismatch");
    },
  );

  it.each([
    ["truncated", "truncated", { acceptsTruncatedContent: false }, "truncated_content_unsupported"],
    ["empty", "empty", { acceptsEmptyPackages: false }, "empty_package_unsupported"],
  ] as const)(
    "rejects a %s package when the Consumer does not accept it",
    async (_name, packageMode, consumerCapabilities, mismatchReason) => {
      const fixture = createContextDeliveryFixture({ packageMode, consumerCapabilities });
      const compatibility = matchContextConsumerCapabilities(
        fixture.request.consumer,
        fixture.contextPackage,
        fixture.request.capabilityRequirements,
        fixture.request.replayPolicy,
      );
      expect(compatibility.reasonCodes).toContain(mismatchReason);
      expect(reason(await deliverGovernedKnowledgeContext(fixture.input))).toBe(
        "consumer_capability_mismatch",
      );
    },
  );

  it("returns the exact original result for an identical permitted replay", async () => {
    const store = new BoundedContextDeliveryIdempotencyStore(4);
    const fixture = createContextDeliveryFixture({ idempotencyStore: store });
    const first = await deliverGovernedKnowledgeContext(fixture.input);
    const replay = await deliverGovernedKnowledgeContext(fixture.input);
    expect(replay).toEqual(first);
    expect(store.size).toBe(1);
    const evidence = store.inspectReplayEvidence(fixture.request.idempotencyKey);
    expect(evidence?.replayClassification).toBe("identical-replay");
    expect(
      verifyContextDeliveryReplayEvidence({
        evidence,
        request: fixture.request,
        originalResult: first,
        policyDecision: fixture.policy,
        freshnessEvidence: first.status === "delivered" ? first.envelope.freshnessEvidence : null,
        currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: fixture.currentActivationSequence,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("valid");
  });

  it("rejects conflicting idempotency reuse", async () => {
    const store = new BoundedContextDeliveryIdempotencyStore(4);
    const fixture = createContextDeliveryFixture({ idempotencyStore: store });
    expect((await deliverGovernedKnowledgeContext(fixture.input)).status).toBe("delivered");
    const { requestFingerprint: _fingerprint, ...unsigned } = fixture.request;
    void _fingerprint;
    const conflicting = createGovernedContextDeliveryRequest({
      ...unsigned,
      deliveryRequestId: "delivery-request-conflicting",
    });
    const result = await deliverGovernedKnowledgeContext({
      ...fixture.input,
      request: conflicting,
      policyDecisionEvidence: policyBoundToRequest(fixture, conflicting),
    });
    expect(result).toMatchObject({ status: "rejected", evidence: { deliveryStatus: "duplicate" } });
    expect(reason(result)).toBe("idempotency_key_conflict");
  });

  it("rejects a second single-delivery attempt", async () => {
    const fixture = createContextDeliveryFixture({ replayMode: "single-delivery" });
    expect((await deliverGovernedKnowledgeContext(fixture.input)).status).toBe("delivered");
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    expect(reason(result)).toBe("single_delivery_replay_rejected");
  });

  it("supports repeatable-until-expiration before expiration", async () => {
    const fixture = createContextDeliveryFixture({ replayMode: "repeatable-until-expiration" });
    const first = await deliverGovernedKnowledgeContext(fixture.input);
    const second = await deliverGovernedKnowledgeContext(fixture.input);
    expect(first.status).toBe("delivered");
    expect(second).toEqual(first);
  });

  it("revalidates policy and freshness before returning an idempotent result", async () => {
    const store = new BoundedContextDeliveryIdempotencyStore(4);
    const fixture = createContextDeliveryFixture({ idempotencyStore: store });
    expect((await deliverGovernedKnowledgeContext(fixture.input)).status).toBe("delivered");
    const expired = await deliverGovernedKnowledgeContext({
      ...fixture.input,
      evaluatedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(expired.status).toBe("rejected");
    expect(expired.status === "rejected" ? expired.evidence.reasonCodes : []).toContain(
      "request_expired",
    );
  });

  it("evicts idempotency entries with deterministic bounded FIFO retention", async () => {
    const store = new BoundedContextDeliveryIdempotencyStore(2);
    for (let index = 1; index <= 3; index += 1) {
      const fixture = createContextDeliveryFixture({ idempotencyStore: store });
      const { requestFingerprint: _fingerprint, ...unsigned } = fixture.request;
      void _fingerprint;
      const request = createGovernedContextDeliveryRequest({
        ...unsigned,
        deliveryRequestId: `delivery-request-${index}`,
        idempotencyKey: `delivery:key:m11:${index.toString().padStart(4, "0")}`,
      });
      expect(
        (
          await deliverGovernedKnowledgeContext({
            ...fixture.input,
            request,
            policyDecisionEvidence: policyBoundToRequest(fixture, request),
          })
        ).status,
      ).toBe("delivered");
    }
    expect(store.size).toBe(2);
    expect(store.inspect("delivery:key:m11:0001")).toBeNull();
    expect(store.inspect("delivery:key:m11:0002")).not.toBeNull();
  });

  it("fails closed for package, request, descriptor, and policy tampering", async () => {
    const fixture = createContextDeliveryFixture();
    const tamperedPackage = structuredClone(fixture.contextPackage);
    tamperedPackage.included[0]!.canonicalContent = "hidden replacement";
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: tamperedPackage,
        }),
      ),
    ).toBe("context_package_integrity_failure");

    const tamperedRequest = { ...fixture.request, purpose: "Hidden different purpose" };
    expect(
      reason(await deliverGovernedKnowledgeContext({ ...fixture.input, request: tamperedRequest })),
    ).toBe("invalid_delivery_request");

    const descriptorTamper = structuredClone(fixture.request);
    descriptorTamper.consumer.displayName = "Forged name";
    expect(
      reason(
        await deliverGovernedKnowledgeContext({ ...fixture.input, request: descriptorTamper }),
      ),
    ).toBe("invalid_delivery_request");

    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          policyDecisionEvidence: { ...fixture.policy, intendedPurpose: "Hidden purpose" },
        }),
      ),
    ).toBe("policy_evidence_invalid");
  });

  it.each([
    ["raw Knowledge Object", () => createContextDeliveryFixture().objects[0]],
    ["full Query Result", () => ({ schemaVersion: "1.0", queryId: "query", objects: [] })],
    [
      "hidden context",
      () => ({ ...createContextDeliveryFixture().contextPackage, hiddenContext: "all objects" }),
    ],
  ])("rejects the %s bypass shape", async (_name, bypass) => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext({
      ...fixture.input,
      contextPackage: bypass(),
    });
    expect(result.status).toBe("rejected");
    expect(reason(result)).toBe("context_package_integrity_failure");
  });

  it("independently verifies every successful artifact and detects tampering", async () => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    if (result.status !== "delivered") throw new Error("Expected delivery");
    expect(verifyContextConsumerDescriptor(fixture.request.consumer).status).toBe("valid");
    expect(verifyGovernedContextDeliveryRequest(fixture.request).status).toBe("valid");
    expect(
      verifyContextDeliveryPolicyDecisionEvidence({
        evidence: fixture.policy,
        request: fixture.request,
      }).status,
    ).toBe("valid");
    expect(
      verifyContextDeliveryFreshnessEvidence({
        evidence: result.envelope.freshnessEvidence,
        request: fixture.request,
        policyDecision: fixture.policy,
        contextPackage: fixture.contextPackage,
        currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: fixture.currentActivationSequence,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("valid");
    expect(
      verifyGovernedContextDeliveryEnvelope(envelopeVerificationInput(fixture, result.envelope))
        .status,
    ).toBe("valid");
    expect(
      verifyContextDeliveryReceipt({
        receipt: result.receipt,
        envelope: result.envelope,
        acknowledgment: result.acknowledgment,
        receivedAt: DELIVERY_TIME,
      }).status,
    ).toBe("valid");
    expect(
      verifyGovernedContextDeliveryEnvelope(
        envelopeVerificationInput(fixture, {
          ...result.envelope,
          deliveryPurpose: "tampered",
        }),
      ).status,
    ).toBe("invalid");
    expect(
      verifyContextDeliveryReceipt({
        receipt: {
          ...result.receipt,
          receivedAt: DELIVERY_TIME.replace("01", "02"),
        },
        envelope: result.envelope,
        acknowledgment: result.acknowledgment,
        receivedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");
    expect(
      GovernedContextDeliveryResultSchema.safeParse({
        ...result,
        receipt: { ...result.receipt, deliverySequence: result.receipt.deliverySequence + 1 },
      }).success,
    ).toBe(false);
  });

  it("rejects locally valid verifier artifacts substituted against different authority", async () => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    if (result.status !== "delivered") throw new Error("Expected delivery");

    const alternate = createContextDeliveryFixture({
      consumerCapabilities: { maxObjectCount: 9 },
    });
    const alternateCompatibility = matchContextConsumerCapabilities(
      alternate.request.consumer,
      alternate.contextPackage,
      alternate.request.capabilityRequirements,
      alternate.request.replayPolicy,
    );
    expect(
      verifyContextConsumerCompatibilityResult({
        result: alternateCompatibility,
        consumer: fixture.request.consumer,
        contextPackage: fixture.contextPackage,
        requirements: fixture.request.capabilityRequirements,
        replayPolicy: fixture.request.replayPolicy,
      }).status,
    ).toBe("invalid");

    const alternateFreshness = evaluateContextDeliveryFreshness({
      request: fixture.request,
      policyDecision: fixture.policy,
      contextPackage: fixture.contextPackage,
      currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
      currentActivationSequence: fixture.currentActivationSequence + 1,
      evaluatedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextDeliveryFreshnessEvidence({
        evidence: alternateFreshness,
        request: fixture.request,
        policyDecision: fixture.policy,
        contextPackage: fixture.contextPackage,
        currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: fixture.currentActivationSequence,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");

    const wrongConsumption = createContextConsumptionEvidence({
      schemaVersion: "1.0",
      receiptId: "receipt-unrelated",
      consumerOperationReference: "consumer/operations/unrelated",
      startedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextConsumptionEvidence({
        evidence: wrongConsumption,
        receipt: result.receipt,
        envelope: result.envelope,
        acknowledgment: result.acknowledgment,
        receivedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");

    const wrongReplay = createContextDeliveryReplayEvidence({
      schemaVersion: "1.0",
      replayClassification: "identical-replay",
      deliveryRequestId: fixture.request.deliveryRequestId,
      deliveryRequestFingerprint: fixture.request.requestFingerprint,
      originalDeliveryEnvelopeId: result.envelope.deliveryEnvelopeId,
      originalDeliveryEnvelopeFingerprint: result.envelope.deliveryFingerprint,
      originalReceiptId: result.receipt.receiptId,
      originalReceiptFingerprint: result.receipt.receiptFingerprint,
      idempotencyKey: fixture.request.idempotencyKey,
      policyDecisionFingerprint: createCanonicalSha256Fingerprint("unrelated-policy"),
      freshnessFingerprint: result.envelope.freshnessEvidence.freshnessFingerprint,
      replayedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextDeliveryReplayEvidence({
        evidence: wrongReplay,
        request: fixture.request,
        originalResult: result,
        policyDecision: fixture.policy,
        freshnessEvidence: result.envelope.freshnessEvidence,
        currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: fixture.currentActivationSequence,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");

    const wrongClassification = createContextDeliveryReplayEvidence({
      schemaVersion: "1.0",
      replayClassification: "evaluation-replay",
      deliveryRequestId: fixture.request.deliveryRequestId,
      deliveryRequestFingerprint: fixture.request.requestFingerprint,
      originalDeliveryEnvelopeId: result.envelope.deliveryEnvelopeId,
      originalDeliveryEnvelopeFingerprint: result.envelope.deliveryFingerprint,
      originalReceiptId: result.receipt.receiptId,
      originalReceiptFingerprint: result.receipt.receiptFingerprint,
      idempotencyKey: fixture.request.idempotencyKey,
      policyDecisionFingerprint: fixture.policy.decisionFingerprint,
      freshnessFingerprint: result.envelope.freshnessEvidence.freshnessFingerprint,
      replayedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextDeliveryReplayEvidence({
        evidence: wrongClassification,
        request: fixture.request,
        originalResult: result,
        policyDecision: fixture.policy,
        freshnessEvidence: result.envelope.freshnessEvidence,
        currentActiveSnapshotId: fixture.contextPackage.snapshotBinding.activeSnapshotId,
        currentActivationSequence: fixture.currentActivationSequence,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");

    const boundReplay = createContextDeliveryReplayEvidence({
      schemaVersion: "1.0",
      replayClassification: "identical-replay",
      deliveryRequestId: fixture.request.deliveryRequestId,
      deliveryRequestFingerprint: fixture.request.requestFingerprint,
      originalDeliveryEnvelopeId: result.envelope.deliveryEnvelopeId,
      originalDeliveryEnvelopeFingerprint: result.envelope.deliveryFingerprint,
      originalReceiptId: result.receipt.receiptId,
      originalReceiptFingerprint: result.receipt.receiptFingerprint,
      idempotencyKey: fixture.request.idempotencyKey,
      policyDecisionFingerprint: fixture.policy.decisionFingerprint,
      freshnessFingerprint: result.envelope.freshnessEvidence.freshnessFingerprint,
      replayedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextDeliveryReplayEvidence({
        evidence: boundReplay,
        request: fixture.request,
        originalResult: result,
        policyDecision: fixture.policy,
        freshnessEvidence: result.envelope.freshnessEvidence,
        currentActiveSnapshotId: "snapshot-newer",
        currentActivationSequence: fixture.currentActivationSequence + 1,
        evaluatedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");

    const {
      deliveryEnvelopeId: _envelopeId,
      deliveryFingerprint: _deliveryFingerprint,
      ...body
    } = result.envelope;
    void _envelopeId;
    void _deliveryFingerprint;
    const sequenceBody = { ...body, deliverySequence: result.envelope.deliverySequence + 1 };
    const sequenceFingerprint = createCanonicalSha256Fingerprint(sequenceBody);
    const reSignedSequenceEnvelope = {
      ...sequenceBody,
      deliveryEnvelopeId: `delivery-${sequenceFingerprint}`,
      deliveryFingerprint: sequenceFingerprint,
    };
    expect(
      verifyGovernedContextDeliveryEnvelope(
        envelopeVerificationInput(fixture, reSignedSequenceEnvelope),
      ).status,
    ).toBe("invalid");

    const { decisionFingerprint: _policyFingerprint, ...policyBody } = fixture.policy;
    void _policyFingerprint;
    const alternatePolicy = createContextDeliveryPolicyDecisionEvidence({
      ...policyBody,
      decisionId: "policy-decision-alternate",
    });
    const policyEnvelopeBody = { ...body, policyDecisionEvidence: alternatePolicy };
    const policyEnvelopeFingerprint = createCanonicalSha256Fingerprint(policyEnvelopeBody);
    const reSignedPolicyEnvelope = {
      ...policyEnvelopeBody,
      deliveryEnvelopeId: `delivery-${policyEnvelopeFingerprint}`,
      deliveryFingerprint: policyEnvelopeFingerprint,
    };
    expect(
      verifyGovernedContextDeliveryEnvelope(
        envelopeVerificationInput(fixture, reSignedPolicyEnvelope),
      ).status,
    ).toBe("invalid");

    const {
      receiptId: _receiptId,
      receiptFingerprint: _receiptFingerprint,
      ...receiptBody
    } = result.receipt;
    void _receiptId;
    void _receiptFingerprint;
    const changedReceiptBody = {
      ...receiptBody,
      receivedAt: "2026-07-29T02:00:00.000Z",
    };
    const changedReceiptFingerprint = createCanonicalSha256Fingerprint(changedReceiptBody);
    const reSignedReceipt = {
      ...changedReceiptBody,
      receiptId: `receipt-${changedReceiptFingerprint}`,
      receiptFingerprint: changedReceiptFingerprint,
    };
    expect(
      verifyContextDeliveryReceipt({
        receipt: reSignedReceipt,
        envelope: result.envelope,
        acknowledgment: result.acknowledgment,
        receivedAt: DELIVERY_TIME,
      }).status,
    ).toBe("invalid");
  });

  it("creates a verifiable provider-neutral Consumption Evidence placeholder", async () => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext(fixture.input);
    if (result.status !== "delivered") throw new Error("Expected delivery");
    const evidence = createContextConsumptionEvidence({
      schemaVersion: "1.0",
      receiptId: result.receipt.receiptId,
      consumerOperationReference: "consumer/operations/m11",
      startedAt: DELIVERY_TIME,
    });
    expect(
      verifyContextConsumptionEvidence({
        evidence,
        receipt: result.receipt,
        envelope: result.envelope,
        acknowledgment: result.acknowledgment,
        receivedAt: DELIVERY_TIME,
      }).status,
    ).toBe("valid");
    expect(JSON.stringify(evidence)).not.toMatch(/reasoning|model|provider|prompt/iu);
  });

  it("rejects physical paths and secret-bearing delivery data", () => {
    const fixture = createContextDeliveryFixture();
    expect(
      ContextConsumerDescriptorSchema.safeParse({
        ...fixture.request.consumer,
        owningSystem: "/Users/adam/private",
      }).success,
    ).toBe(false);
    expect(
      GovernedContextDeliveryRequestSchema.safeParse({
        ...fixture.request,
        providerConfig: { apiKey: "secret" },
      }).success,
    ).toBe(false);
  });

  it.each([
    "/tmp",
    "/private/founderos/context.json",
    "/tmp/founderos/context.json",
    "/etc/founderos/config.json",
    "embedded path /var/founderos/context.json in evidence",
    "C:/FounderOS/private/context.json",
    "\\\\server\\share\\context.json",
    "file:///private/founderos/context.json",
  ])("rejects physical path disclosure %s", async (unsafeValue) => {
    const fixture = createContextDeliveryFixture();
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: { ...fixture.contextPackage, diagnostic: unsafeValue },
        }),
      ),
    ).toBe("unsafe_delivery_content");
  });

  it.each([
    "accessToken",
    "authorization",
    "bearerToken",
    "clientSecret",
    "cookie",
    "refreshToken",
    "sessionToken",
    "signingKey",
    "api_key",
    "client_secret",
    "token",
  ])("rejects secret-bearing field %s", async (secretKey) => {
    const fixture = createContextDeliveryFixture();
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: { ...fixture.contextPackage, [secretKey]: "sensitive" },
        }),
      ),
    ).toBe("unsafe_delivery_content");
  });

  it("rejects credential values even when hidden under a generic field", async () => {
    const fixture = createContextDeliveryFixture();
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: {
            ...fixture.contextPackage,
            diagnostic: "Authorization: Bearer sk-test-secret",
          },
        }),
      ),
    ).toBe("unsafe_delivery_content");
  });

  it("hashes normalized builder output and rejects non-canonical builder inputs", () => {
    const fixture = createContextDeliveryFixture();
    const { descriptorFingerprint: _descriptorFingerprint, ...descriptorInput } =
      fixture.request.consumer;
    void _descriptorFingerprint;
    const normalized = createContextConsumerDescriptor({
      ...descriptorInput,
      displayName: `  ${descriptorInput.displayName}  `,
    });
    expect(normalized).toEqual(fixture.request.consumer);
    expect(
      verifyContextConsumerDescriptor({
        ...fixture.request.consumer,
        displayName: `  ${fixture.request.consumer.displayName}  `,
      }).status,
    ).toBe("invalid");

    expect(() =>
      createContextConsumerDescriptor({
        ...descriptorInput,
        purpose: undefined,
      } as never),
    ).toThrow(/canonical data/u);

    let getterCalls = 0;
    const accessorInput = { ...descriptorInput } as Record<string, unknown>;
    Object.defineProperty(accessorInput, "purpose", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return descriptorInput.purpose;
      },
    });
    expect(() => createContextConsumerDescriptor(accessorInput as never)).toThrow(
      /canonical data/u,
    );
    expect(getterCalls).toBe(0);
  });

  it("derives request, policy, replay, and consumption fingerprints from normalized output", async () => {
    const fixture = createContextDeliveryFixture();
    const { requestFingerprint: _requestFingerprint, ...requestInput } = fixture.request;
    void _requestFingerprint;
    expect(
      createGovernedContextDeliveryRequest({
        ...requestInput,
        reason: `  ${requestInput.reason}  `,
      }),
    ).toEqual(fixture.request);

    const { decisionFingerprint: _decisionFingerprint, ...policyInput } = fixture.policy;
    void _decisionFingerprint;
    expect(
      createContextDeliveryPolicyDecisionEvidence({
        ...policyInput,
        decisionAuthorityReference: `  ${policyInput.decisionAuthorityReference}  `,
      }),
    ).toEqual(fixture.policy);

    const result = await deliverGovernedKnowledgeContext(fixture.input);
    if (result.status !== "delivered") throw new Error("Expected delivery");
    const replayInput = {
      schemaVersion: "1.0" as const,
      replayClassification: "identical-replay" as const,
      deliveryRequestId: fixture.request.deliveryRequestId,
      deliveryRequestFingerprint: fixture.request.requestFingerprint,
      originalDeliveryEnvelopeId: result.envelope.deliveryEnvelopeId,
      originalDeliveryEnvelopeFingerprint: result.envelope.deliveryFingerprint,
      originalReceiptId: result.receipt.receiptId,
      originalReceiptFingerprint: result.receipt.receiptFingerprint,
      idempotencyKey: fixture.request.idempotencyKey,
      policyDecisionFingerprint: fixture.policy.decisionFingerprint,
      freshnessFingerprint: result.envelope.freshnessEvidence.freshnessFingerprint,
      replayedAt: DELIVERY_TIME,
    };
    expect(
      createContextDeliveryReplayEvidence({
        ...replayInput,
        deliveryRequestId: `  ${replayInput.deliveryRequestId}  `,
      }),
    ).toEqual(createContextDeliveryReplayEvidence(replayInput));

    const consumptionInput = {
      schemaVersion: "1.0" as const,
      receiptId: result.receipt.receiptId,
      consumerOperationReference: "consumer/operations/normalized",
      startedAt: DELIVERY_TIME,
    };
    expect(
      createContextConsumptionEvidence({
        ...consumptionInput,
        consumerOperationReference: `  ${consumptionInput.consumerOperationReference}  `,
      }),
    ).toEqual(createContextConsumptionEvidence(consumptionInput));
  });

  it.each([
    "request",
    "contextPackage",
    "policyDecisionEvidence",
    "registry",
    "repository",
    "repositorySnapshot",
    "idempotencyStore",
    "evaluatedAt",
  ] as const)("rejects top-level %s accessors without invoking them", async (field) => {
    const fixture = createContextDeliveryFixture();
    let getterCalls = 0;
    const input = { ...fixture.input } as Record<string, unknown>;
    Object.defineProperty(input, field, {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return fixture.input[field];
      },
    });
    expect(reason(await deliverGovernedKnowledgeContext(input as never))).toBe(
      "invalid_delivery_request",
    );
    expect(getterCalls).toBe(0);
  });

  it("fails closed before parsing accessor-backed, physical-path, or secret-bearing package data", async () => {
    const fixture = createContextDeliveryFixture();
    let getterCalls = 0;
    const accessorPackage = structuredClone(fixture.contextPackage) as Record<string, unknown>;
    Object.defineProperty(accessorPackage, "hidden", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "hidden";
      },
    });
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: accessorPackage,
        }),
      ),
    ).toBe("unsafe_delivery_content");
    expect(getterCalls).toBe(0);

    for (const unsafe of [
      { ...fixture.contextPackage, diagnosticPath: "/Users/adam/private" },
      { ...fixture.contextPackage, apiKey: "secret-value" },
    ]) {
      expect(
        reason(await deliverGovernedKnowledgeContext({ ...fixture.input, contextPackage: unsafe })),
      ).toBe("unsafe_delivery_content");
    }
  });

  it("rejects a forged idempotency store instance", async () => {
    const fixture = createContextDeliveryFixture();
    const result = await deliverGovernedKnowledgeContext({
      ...fixture.input,
      idempotencyStore: {} as BoundedContextDeliveryIdempotencyStore,
    });
    expect(reason(result)).toBe("invalid_delivery_request");
  });

  it.each(["throwing registry", "malformed registry", "throwing repository"])(
    "normalizes %s dependency failures into governed evidence",
    async (failureMode) => {
      const fixture = createContextDeliveryFixture();
      const input =
        failureMode === "throwing repository"
          ? {
              ...fixture.input,
              repository: {
                getCandidates: async () => {
                  throw new Error("repository unavailable");
                },
              },
            }
          : {
              ...fixture.input,
              registry: {
                ...fixture.input.registry,
                verifyIntegrity:
                  failureMode === "throwing registry"
                    ? async () => {
                        throw new Error("registry unavailable");
                      }
                    : async () => ({}),
              },
            };
      await expect(deliverGovernedKnowledgeContext(input as never)).resolves.toMatchObject({
        status: "rejected",
        evidence: {
          deliveryStatus: "integrity-failure",
          deliveryRequestId: fixture.request.deliveryRequestId,
          contextPackageId: fixture.contextPackage.contextPackageId,
          consumerId: fixture.request.consumer.consumerId,
          reasonCodes: ["context_package_integrity_failure"],
        },
      });
    },
  );

  it("sorts compatibility and rejection reasons independently of evaluation order", () => {
    const fixture = createContextDeliveryFixture({
      consumerCapabilities: {
        maxObjectCount: 1,
        maxCanonicalCharacters: 1,
        supportsProvenance: false,
        supportsReplay: false,
        supportsReceipts: false,
      },
    });
    const result = matchContextConsumerCapabilities(
      fixture.request.consumer,
      fixture.contextPackage,
      fixture.request.capabilityRequirements,
      fixture.request.replayPolicy,
    );
    expect(result.reasonCodes).toEqual([...result.reasonCodes].sort());
    expect(result.mismatches.map((entry) => `${entry.field}\0${entry.reason}`)).toEqual(
      result.mismatches.map((entry) => `${entry.field}\0${entry.reason}`).sort(),
    );
  });

  it("rejects unsupported versions and unknown fields before delivery", async () => {
    const fixture = createContextDeliveryFixture();
    expect(
      reason(
        await deliverGovernedKnowledgeContext({
          ...fixture.input,
          contextPackage: { ...fixture.contextPackage, schemaVersion: "2.0" },
        }),
      ),
    ).toBe("context_package_integrity_failure");
    expect(
      verifyGovernedContextDeliveryRequest({ ...fixture.request, prompt: "hidden" }).status,
    ).toBe("invalid");
  });

  it("verifies descriptor and request fingerprints rather than trusting schema shape", () => {
    const fixture = createContextDeliveryFixture();
    expect(
      verifyContextConsumerDescriptor({
        ...fixture.request.consumer,
        descriptorFingerprint: "0".repeat(64),
      }).status,
    ).toBe("invalid");
    expect(
      verifyGovernedContextDeliveryRequest({
        ...fixture.request,
        requestFingerprint: "0".repeat(64),
      }).status,
    ).toBe("invalid");
  });

  it("does not mutate authoritative inputs", async () => {
    const fixture = createContextDeliveryFixture();
    const before = structuredClone({
      request: fixture.request,
      contextPackage: fixture.contextPackage,
      policy: fixture.policy,
    });
    await deliverGovernedKnowledgeContext(fixture.input);
    expect({
      request: fixture.request,
      contextPackage: fixture.contextPackage,
      policy: fixture.policy,
    }).toEqual(before);
  });
});
