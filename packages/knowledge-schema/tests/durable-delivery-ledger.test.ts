import { describe, expect, it } from "vitest";

import {
  DeliveryLedgerDerivedIndexRebuildResultSchema,
  DeliveryLedgerIntegrityVerificationResultSchema,
  DeliveryLedgerRecoveryResultSchema,
  DurableDeliveryDerivedIndexSchema,
  DurableDeliveryExpirationEvidenceSchema,
  DurableDeliveryLedgerEventSchema,
  DurableDeliveryLedgerHeadExpectationSchema,
  DurableDeliveryLedgerIssueCodeSchema,
  DurableReplayOutcomeSchema,
  DurableReplayReasonCodeSchema,
} from "../src/index.js";

const digest = "a".repeat(64);

describe("Durable Context Delivery Ledger contracts", () => {
  it("accepts the explicit genesis head and rejects contradictory heads", () => {
    expect(
      DurableDeliveryLedgerHeadExpectationSchema.parse({
        ledgerSequence: 0,
        auditFingerprint: "genesis",
      }),
    ).toBeDefined();
    expect(
      DurableDeliveryLedgerHeadExpectationSchema.safeParse({
        ledgerSequence: 1,
        auditFingerprint: "genesis",
      }).success,
    ).toBe(false);
  });

  it("models permanent expired-key reservation explicitly", () => {
    const evidence = {
      schemaVersion: "1.0",
      policyVersion: "permanent-reservation-v1",
      status: "expired-permanently-reserved",
      expiresAt: "2026-07-29T01:00:00.000Z",
      evaluatedAt: "2026-07-29T01:00:00.000Z",
      evidenceFingerprint: digest,
    };
    expect(DurableDeliveryExpirationEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(
      DurableDeliveryExpirationEvidenceSchema.safeParse({
        ...evidence,
        evaluatedAt: "2026-07-29T00:59:59.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown expiration fields and unsupported versions", () => {
    expect(
      DurableDeliveryExpirationEvidenceSchema.safeParse({
        schemaVersion: "2.0",
        policyVersion: "permanent-reservation-v1",
        status: "active",
        expiresAt: null,
        evaluatedAt: "2026-07-29T01:00:00.000Z",
        evidenceFingerprint: digest,
      }).success,
    ).toBe(false);
    expect(
      DurableDeliveryExpirationEvidenceSchema.safeParse({
        schemaVersion: "1.0",
        policyVersion: "permanent-reservation-v1",
        status: "active",
        expiresAt: null,
        evaluatedAt: "2026-07-29T01:00:00.000Z",
        evidenceFingerprint: digest,
        storagePath: "/tmp/ledger",
      }).success,
    ).toBe(false);
  });

  it("rejects accessor-backed Ledger events without executing accessors", () => {
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

  it("exposes only stable Replay outcomes and reason codes", () => {
    expect(DurableReplayOutcomeSchema.parse("accepted-original-result")).toBe(
      "accepted-original-result",
    );
    expect(DurableReplayReasonCodeSchema.parse("single_delivery_replay_rejected")).toBe(
      "single_delivery_replay_rejected",
    );
    expect(DurableReplayOutcomeSchema.safeParse("provider-retry").success).toBe(false);
  });

  it("exposes stable storage-independent integrity issue codes", () => {
    expect(DurableDeliveryLedgerIssueCodeSchema.parse("audit_chain_broken")).toBe(
      "audit_chain_broken",
    );
    expect(DurableDeliveryLedgerIssueCodeSchema.safeParse("sql_failure").success).toBe(false);
  });

  it("accepts strict deterministic successful Recovery evidence", () => {
    const result = {
      schemaVersion: "1.0",
      ledgerContractVersion: "1.0",
      status: "recovered",
      originalDeliveryTransactionCount: 1,
      replayAttemptCount: 2,
      activeIdempotencyOwnershipCount: 0,
      expiredIdempotencyOwnershipCount: 1,
      lastCommittedLedgerSequence: 3,
      lastAuditFingerprint: digest,
      ledgerIntegrityFingerprint: digest,
      derivedIndexStatus: "current",
      errors: [],
    };
    expect(DeliveryLedgerRecoveryResultSchema.parse(result)).toEqual(result);
    expect(
      DeliveryLedgerRecoveryResultSchema.safeParse({ ...result, physicalPath: "/tmp" }).success,
    ).toBe(false);
  });

  it("requires failed Recovery to contain stable errors", () => {
    expect(
      DeliveryLedgerRecoveryResultSchema.safeParse({
        schemaVersion: "1.0",
        ledgerContractVersion: "1.0",
        status: "failed",
        originalDeliveryTransactionCount: 0,
        replayAttemptCount: 0,
        activeIdempotencyOwnershipCount: 0,
        expiredIdempotencyOwnershipCount: 0,
        lastCommittedLedgerSequence: 0,
        lastAuditFingerprint: "genesis",
        ledgerIntegrityFingerprint: null,
        derivedIndexStatus: "invalid",
        errors: [],
      }).success,
    ).toBe(false);
  });

  it("keeps integrity and derived-index results storage independent", () => {
    const integrity = DeliveryLedgerIntegrityVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "valid",
      verifiedEventCount: 0,
      verifiedOriginalTransactionCount: 0,
      verifiedReplayAttemptCount: 0,
      verifiedThroughSequence: 0,
      lastAuditFingerprint: "genesis",
      ledgerIntegrityFingerprint: digest,
      derivedIndexStatus: "missing",
      issues: [],
    });
    const rebuild = DeliveryLedgerDerivedIndexRebuildResultSchema.parse({
      schemaVersion: "1.0",
      status: "rebuilt",
      verifiedThroughSequence: 0,
      indexFingerprint: digest,
      requestEntryCount: 0,
      idempotencyEntryCount: 0,
      replayEntryCount: 0,
      issues: [],
    });
    expect(JSON.stringify({ integrity, rebuild })).not.toMatch(/filesystem|database|sql/iu);
  });

  it("rejects malformed derived indexes", () => {
    expect(
      DurableDeliveryDerivedIndexSchema.safeParse({
        schemaVersion: "1.0",
        retentionPolicyVersion: "bounded-latest-v1",
        entryCapacity: 1024,
        verifiedThroughSequence: 0,
        verifiedAuditFingerprint: "genesis",
        requestEntries: [],
        idempotencyEntries: [],
        replayEntries: [],
        indexFingerprint: digest,
        tableName: "deliveries",
      }).success,
    ).toBe(false);
  });

  it("rejects derived indexes that exceed their declared retention capacity", () => {
    expect(
      DurableDeliveryDerivedIndexSchema.safeParse({
        schemaVersion: "1.0",
        retentionPolicyVersion: "bounded-latest-v1",
        entryCapacity: 1,
        verifiedThroughSequence: 0,
        verifiedAuditFingerprint: "genesis",
        requestEntries: [
          { deliveryRequestId: "request-0001", transactionId: "transaction-0001" },
          { deliveryRequestId: "request-0002", transactionId: "transaction-0002" },
        ],
        idempotencyEntries: [],
        replayEntries: [],
        indexFingerprint: digest,
      }).success,
    ).toBe(false);
  });
});
