import {
  AtomicDeliveryTransactionRequestSchema,
  CommittedDeliveryTransactionRecordSchema,
  DeliveryLedgerIntegrityVerificationResultSchema,
  DeliveryLedgerRecoveryResultSchema,
  DurableDeliveryArtifactRecordSchema,
  DurableDeliveryDerivedIndexSchema,
  DurableDeliveryLedgerEventSchema,
  DurableReplayAttemptRecordSchema,
} from "@founderos/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  createCommittedDeliveryTransaction,
  createDurableDeliveryDerivedIndex,
  createDurableReplayAttempt,
  createOriginalDeliveryLedgerEvent,
  createReplayAttemptLedgerEvent,
  originalDeliveryResult,
  recoverDeliveryLedger,
  replayDurableDeliveryLedger,
  verifyCommittedDeliveryTransaction,
  verifyDeliveryLedgerIntegrity,
  verifyDurableDeliveryDerivedIndex,
  verifyDurableDeliveryLedgerEvent,
} from "../src/domain/durable-context-delivery-ledger.js";
import { createCanonicalSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import { serializeCanonicalDurablePayload } from "../src/domain/durable-registry.js";
import { createDurableDeliveryFixture, replayInput } from "./durable-delivery-ledger-fixtures.js";
import { DURABLE_CONTEXT_DELIVERY_EVALUATIONS } from "./fixtures/durable-context-delivery-evaluations.js";

async function committedFixture(options: Parameters<typeof createDurableDeliveryFixture>[0] = {}) {
  const fixture = await createDurableDeliveryFixture(options);
  const transaction = createCommittedDeliveryTransaction(fixture.commitInput.transaction);
  const event = createOriginalDeliveryLedgerEvent(transaction);
  return { fixture, transaction, event };
}

describe("Milestone 12 durable Delivery contracts and kernel", () => {
  it("defines a deterministic executable evaluation matrix", () => {
    const ids = DURABLE_CONTEXT_DELIVERY_EVALUATIONS.map((entry) => entry.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...ids].sort());
    expect(new Set(DURABLE_CONTEXT_DELIVERY_EVALUATIONS.map((entry) => entry.category))).toEqual(
      new Set([
        "original-delivery",
        "idempotency",
        "replay",
        "crash-safety",
        "integrity",
        "derived-state",
        "filesystem-safety",
      ]),
    );
  });
  it("constructs and verifies one complete atomic original Delivery", async () => {
    const { fixture, transaction, event } = await committedFixture();
    expect(CommittedDeliveryTransactionRecordSchema.parse(transaction)).toEqual(transaction);
    expect(DurableDeliveryLedgerEventSchema.parse(event)).toEqual(event);
    expect(verifyCommittedDeliveryTransaction(transaction)).toEqual(transaction);
    expect(originalDeliveryResult(transaction)).toEqual(fixture.result);
    expect(transaction.artifacts.map((artifact) => artifact.artifactType).sort()).toEqual([
      "consumer-acknowledgment",
      "delivery-envelope",
      "delivery-receipt",
    ]);
  });

  it("rejects unknown fields and unsupported versions", async () => {
    const { transaction, event } = await committedFixture();
    expect(
      CommittedDeliveryTransactionRecordSchema.safeParse({ ...transaction, unknown: true }).success,
    ).toBe(false);
    expect(
      DurableDeliveryLedgerEventSchema.safeParse({ ...event, schemaVersion: "2.0" }).success,
    ).toBe(false);
    expect(AtomicDeliveryTransactionRequestSchema.safeParse({ schemaVersion: "2.0" }).success).toBe(
      false,
    );
  });

  it("rejects accessor-backed raw records without invoking the accessor", () => {
    let accessed = false;
    const raw = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(raw, "eventType", {
      enumerable: true,
      get() {
        accessed = true;
        return "original-delivery";
      },
    });
    expect(DurableDeliveryLedgerEventSchema.safeParse(raw).success).toBe(false);
    expect(accessed).toBe(false);
  });

  it("rejects forged transaction, wrapper, and embedded artifact fingerprints", async () => {
    const { transaction, event } = await committedFixture();
    expect(() =>
      verifyCommittedDeliveryTransaction({
        ...transaction,
        committedAt: "2026-07-29T01:00:01.000Z",
      }),
    ).toThrow();
    expect(() =>
      verifyDurableDeliveryLedgerEvent({ ...event, auditFingerprint: "0".repeat(64) }),
    ).toThrow(/fingerprint/u);
    const envelope = transaction.artifacts.find(
      (artifact) => artifact.artifactType === "delivery-envelope",
    )!;
    expect(() =>
      verifyCommittedDeliveryTransaction({
        ...transaction,
        artifacts: transaction.artifacts.map((artifact) =>
          artifact === envelope
            ? {
                ...artifact,
                artifact: {
                  ...(artifact.artifact as object),
                  deliveryPurpose: "substituted",
                },
              }
            : artifact,
        ),
      }),
    ).toThrow(/fingerprint/u);
  });

  it("rejects incomplete original transactions", async () => {
    const { transaction } = await committedFixture();
    expect(
      CommittedDeliveryTransactionRecordSchema.safeParse({
        ...transaction,
        artifacts: transaction.artifacts.slice(0, 2),
      }).success,
    ).toBe(false);
  });

  it("recovers deterministic original state and exact result identity", async () => {
    const { fixture, transaction, event } = await committedFixture();
    const first = replayDurableDeliveryLedger([event]);
    const second = replayDurableDeliveryLedger(structuredClone([event]));
    expect(first.ledgerIntegrityFingerprint).toBe(second.ledgerIntegrityFingerprint);
    expect(serializeCanonicalDurablePayload(first.events)).toBe(
      serializeCanonicalDurablePayload(second.events),
    );
    expect(originalDeliveryResult(first.transactionsById.get(transaction.transactionId)!)).toEqual(
      fixture.result,
    );
  });

  it("fails on duplicate sequence and broken previous-audit links", async () => {
    const { event } = await committedFixture();
    expect(() => replayDurableDeliveryLedger([event, event])).toThrow(/sequence|previous-audit/u);
    expect(() =>
      replayDurableDeliveryLedger([
        event,
        { ...event, ledgerSequence: 2, previousAuditFingerprint: "1".repeat(64) },
      ]),
    ).toThrow();
  });

  it("builds, verifies, and deterministically rebuilds derived indexes", async () => {
    const { event } = await committedFixture();
    const state = replayDurableDeliveryLedger([event]);
    const first = createDurableDeliveryDerivedIndex(state);
    const second = createDurableDeliveryDerivedIndex(state);
    expect(DurableDeliveryDerivedIndexSchema.parse(first)).toEqual(first);
    expect(first).toEqual(second);
    expect(verifyDurableDeliveryDerivedIndex(first, state)).toBe("current");
    expect(verifyDurableDeliveryDerivedIndex(null, state)).toBe("missing");
    expect(verifyDurableDeliveryDerivedIndex({ broken: true }, state)).toBe("invalid");
  });

  it("reports valid integrity independently from derived-index health", async () => {
    const { event } = await committedFixture();
    const result = verifyDeliveryLedgerIntegrity([event], { broken: true });
    expect(DeliveryLedgerIntegrityVerificationResultSchema.parse(result).status).toBe("valid");
    expect(result.derivedIndexStatus).toBe("invalid");
  });

  it("returns deterministic recovery evidence without physical paths", async () => {
    const { event } = await committedFixture();
    const state = replayDurableDeliveryLedger([event]);
    const index = createDurableDeliveryDerivedIndex(state);
    const first = recoverDeliveryLedger([event], index);
    const second = recoverDeliveryLedger([event], index);
    expect(DeliveryLedgerRecoveryResultSchema.parse(first).status).toBe("recovered");
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/\/Users\/|\/private\/|credential|token/iu);
  });

  it("fails closed with verified-prefix evidence on authoritative corruption", async () => {
    const { event } = await committedFixture();
    const result = recoverDeliveryLedger([event, { ...event, ledgerSequence: 2 }], null);
    expect(result.status).toBe("failed");
    expect(result.originalDeliveryTransactionCount).toBe(1);
    expect(result.lastCommittedLedgerSequence).toBe(1);
  });

  it("creates a separate accepted Replay Attempt bound to the original result", async () => {
    const { fixture, transaction, event } = await committedFixture();
    const input = replayInput(fixture, {
      ledgerSequence: event.ledgerSequence,
      auditFingerprint: event.auditFingerprint,
    });
    const attempt = createDurableReplayAttempt({
      replayAttemptId: input.replayAttemptId,
      originalTransaction: transaction,
      request: input.request,
      policyDecisionEvidence: input.policyDecisionEvidence,
      freshnessEvidence: input.freshnessEvidence,
      currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
      replayClassification: "identical-replay",
      outcome: "accepted-original-result",
      reasonCodes: ["original_result_replayed"],
      attemptedAt: input.evaluatedAt,
      expectedLedgerHead: input.expectedLedgerHead,
    });
    const replayEvent = createReplayAttemptLedgerEvent(attempt);
    const state = replayDurableDeliveryLedger([event, replayEvent]);
    expect(DurableReplayAttemptRecordSchema.parse(attempt)).toEqual(attempt);
    expect(state.replayAttempts).toHaveLength(1);
    expect(originalDeliveryResult(state.transactions[0]!)).toEqual(fixture.result);
  });

  it("rejects orphan and contradictory accepted Replay Attempts", async () => {
    const { fixture, transaction, event } = await committedFixture();
    const input = replayInput(fixture, {
      ledgerSequence: event.ledgerSequence,
      auditFingerprint: event.auditFingerprint,
    });
    const attempt = createDurableReplayAttempt({
      replayAttemptId: input.replayAttemptId,
      originalTransaction: transaction,
      request: input.request,
      policyDecisionEvidence: input.policyDecisionEvidence,
      freshnessEvidence: input.freshnessEvidence,
      currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
      replayClassification: "identical-replay",
      outcome: "accepted-original-result",
      reasonCodes: ["original_result_replayed"],
      attemptedAt: input.evaluatedAt,
      expectedLedgerHead: input.expectedLedgerHead,
    });
    const replayEvent = createReplayAttemptLedgerEvent(attempt);
    expect(() => replayDurableDeliveryLedger([replayEvent])).toThrow();
    const single = await committedFixture({ replayMode: "single-delivery" });
    expect(() =>
      replayDurableDeliveryLedger([
        single.event,
        {
          ...replayEvent,
          replayAttempt: {
            ...attempt,
            originalDeliveryTransactionId: single.transaction.transactionId,
          },
        },
      ]),
    ).toThrow();
  });

  it("rejects a fully re-signed Replay outcome that contradicts durable policy", async () => {
    const { fixture, transaction, event } = await committedFixture();
    const input = replayInput(fixture, {
      ledgerSequence: event.ledgerSequence,
      auditFingerprint: event.auditFingerprint,
    });
    const valid = createDurableReplayAttempt({
      replayAttemptId: input.replayAttemptId,
      originalTransaction: transaction,
      request: input.request,
      policyDecisionEvidence: input.policyDecisionEvidence,
      freshnessEvidence: input.freshnessEvidence,
      currentActiveSnapshotEvidence: input.currentActiveSnapshotEvidence,
      replayClassification: "identical-replay",
      outcome: "accepted-original-result",
      reasonCodes: ["original_result_replayed"],
      attemptedAt: input.evaluatedAt,
      expectedLedgerHead: input.expectedLedgerHead,
    });
    const { replayAttemptFingerprint: _fingerprint, ...validUnsigned } = valid;
    void _fingerprint;
    const contradictoryUnsigned = {
      ...validUnsigned,
      replayClassification: "evaluation-replay" as const,
      outcome: "evaluation-only" as const,
      reasonCodes: ["evaluation_only" as const],
    };
    const contradictory = {
      ...contradictoryUnsigned,
      replayAttemptFingerprint: createCanonicalSha256Fingerprint(contradictoryUnsigned),
    };
    const replayEventUnsigned = {
      schemaVersion: "1.0" as const,
      eventType: "replay-attempt" as const,
      ledgerSequence: contradictory.ledgerSequence,
      previousAuditFingerprint: contradictory.previousAuditFingerprint,
      replayAttempt: contradictory,
    };
    const replayEvent = {
      ...replayEventUnsigned,
      auditFingerprint: createCanonicalSha256Fingerprint(replayEventUnsigned),
    };
    expect(() => replayDurableDeliveryLedger([event, replayEvent])).toThrow(
      /contradicts its durable Policy/u,
    );
  });

  it("returns defensive immutable results", async () => {
    const { transaction } = await committedFixture();
    const result = originalDeliveryResult(transaction);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.envelope)).toBe(true);
    expect(() => {
      (result.envelope as { deliveryPurpose: string }).deliveryPurpose = "mutated";
    }).toThrow();
  });

  it("never accepts physical paths or credential-bearing durable artifacts", async () => {
    const fixture = await createDurableDeliveryFixture();
    const request = {
      ...fixture.commitInput.transaction.request,
      reason: "/Users/adam/secret/token=abc",
    };
    expect(() =>
      createCommittedDeliveryTransaction({
        ...fixture.commitInput.transaction,
        request,
      } as never),
    ).toThrow(/physical paths|credential/u);
  });

  it("keeps artifact schemas strict", async () => {
    const { transaction } = await committedFixture();
    const artifact = transaction.artifacts[0]!;
    expect(
      DurableDeliveryArtifactRecordSchema.safeParse({ ...artifact, filesystemPath: "/tmp/x" })
        .success,
    ).toBe(false);
  });
});
