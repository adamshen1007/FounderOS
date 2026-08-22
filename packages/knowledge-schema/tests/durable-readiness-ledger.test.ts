import { describe, expect, it } from "vitest";

import * as knowledgeSchema from "../src/index.js";

import {
  ReadinessGenesisCommitMarkerSchema,
  DurableReadinessEvidenceProjectionSchema,
  M15_MAX_DERIVED_INDEX_ENTRIES,
  M15_MAX_DIFFERING_FIELD_PATHS,
  M15_MAX_LIST_PAGE_SIZE,
  M15_MAX_REASON_CODES,
  M15_MAX_RESULT_FINDINGS,
  READINESS_REGISTRATION_INTEGRITY_FAILED_REASON_CODES,
  READINESS_REGISTRATION_REJECTED_REASON_CODES,
  READINESS_REPLAY_NOT_RECORDED_REASON_CODES,
  READINESS_RESULT_REASON_TAXONOMY_VERSION,
  ReadinessDerivedIndexCollectionSchema,
  ReadinessDerivedIndexRebuildResultSchema,
  ReadinessDerivedIndexSchema,
  ReadinessIntegrityResultSchema,
  ReadinessCanonicalUtcInstantSchema,
  ReadinessHistoricalComparisonSchema,
  ReadinessLedgerHeadSchema,
  ReadinessRecoveryResultSchema,
  ReadinessRegistrationResultSchema,
  ReadinessReplaySubmissionResultSchema,
  ReadinessListQuerySchema,
  ReadinessWriterLockCleanupRequestSchema,
  ReadinessWriterLockCleanupResultSchema,
  ReadinessWriterLockInspectionResultSchema,
} from "../src/index.js";

const fingerprint = "a".repeat(64);

function head() {
  return {
    headContractVersion: "1.0",
    headGeneration: 0,
    committedRegistrationCount: 0,
    committedReplayAttemptCount: 0,
    totalAuthoritativeEventCount: 0,
    lastCommittedLedgerSequence: 0,
    latestAuditEntryId: null,
    latestAuditEntryFingerprint: null,
    latestSemanticEventId: null,
    latestSemanticEventFingerprint: null,
    latestSubjectTransactionId: null,
    latestSubjectTransactionFingerprint: null,
    completeHistoryFingerprint: fingerprint,
    ledgerHeadFingerprint: fingerprint,
  } as const;
}

describe("Milestone 15 durable readiness schemas", () => {
  it("owns a closed canonical integrity finding inventory", () => {
    const exported = knowledgeSchema as unknown as Record<string, unknown>;
    expect(exported.READINESS_INTEGRITY_FINDING_CODES).toEqual([
      "genesis-corrupt",
      "genesis-initialization-incomplete",
      "ledger-uninitialized",
      "readiness-ledger-integrity-failure",
      "unsafe-filesystem-state",
    ]);
  });

  it.each([
    "file:///private/tmp/task-1",
    "/private/tmp/task-1",
    "../../private/tmp/task-1",
    "../task-1",
    String.raw`C:\Users\adam\task-1`,
    "C:/Users/adam/task-1",
    String.raw`\\server\share\task-1`,
    "file://server/share/task-1",
    "%2Fprivate%2Ftmp%2Ftask-1",
    "..%2F..%2Fprivate%2Ftmp",
    "file%3A%2F%2F%2Fprivate%2Ftmp%2Ftask-1",
    String.raw`..%2f..\private%2ftmp\task-1`,
    String.raw`C:%2fUsers\adam%2ftask-1`,
  ])("rejects path-like public logical material %s", (pathLike) => {
    const invalidIntegrity = {
      resultContractVersion: "1.0",
      status: "invalid",
      verifiedMarkerFingerprint: null,
      verifiedRegistrationCount: 0,
      verifiedReplayAttemptCount: 0,
      verifiedTotalEventCount: 0,
      verifiedLastSequence: 0,
      verifiedLatestAuditEntryFingerprint: null,
      verifiedCompleteHistoryFingerprint: null,
      derivedIndexStatus: "invalid",
      findings: [pathLike],
    } as const;
    const failedRecovery = {
      resultContractVersion: "1.0",
      status: "failed",
      committedRegistrationCount: 0,
      committedReplayAttemptCount: 0,
      permanentIdempotencyOwnershipCount: 0,
      lastCommittedSequence: 0,
      latestAuditEntryId: null,
      latestAuditEntryFingerprint: null,
      latestSemanticEventId: null,
      latestSemanticEventFingerprint: null,
      latestSubjectTransactionId: null,
      latestSubjectTransactionFingerprint: null,
      completeHistoryFingerprint: null,
      authoritativeMarkerFingerprint: null,
      derivedIndexStatus: "invalid",
      stagingOrphanCount: 0,
      installedUncommittedOrphanCount: 0,
      errors: [pathLike],
    } as const;

    expect(ReadinessIntegrityResultSchema.safeParse(invalidIntegrity).success).toBe(false);
    expect(ReadinessRecoveryResultSchema.safeParse(failedRecovery).success).toBe(false);
    expect(
      ReadinessDerivedIndexRebuildResultSchema.safeParse({
        resultContractVersion: "1.0",
        status: "not-rebuilt",
        sourceLedgerHeadFingerprint: null,
        rebuiltIndexCount: 0,
        reason: pathLike,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown public integrity and recovery diagnostics", () => {
    const unknown = "future-integrity-finding";
    expect(
      ReadinessIntegrityResultSchema.safeParse({
        resultContractVersion: "1.0",
        status: "invalid",
        verifiedMarkerFingerprint: null,
        verifiedRegistrationCount: 0,
        verifiedReplayAttemptCount: 0,
        verifiedTotalEventCount: 0,
        verifiedLastSequence: 0,
        verifiedLatestAuditEntryFingerprint: null,
        verifiedCompleteHistoryFingerprint: null,
        derivedIndexStatus: "invalid",
        findings: [unknown],
      }).success,
    ).toBe(false);
    expect(
      ReadinessRecoveryResultSchema.safeParse({
        resultContractVersion: "1.0",
        status: "failed",
        committedRegistrationCount: 0,
        committedReplayAttemptCount: 0,
        permanentIdempotencyOwnershipCount: 0,
        lastCommittedSequence: 0,
        latestAuditEntryId: null,
        latestAuditEntryFingerprint: null,
        latestSemanticEventId: null,
        latestSemanticEventFingerprint: null,
        latestSubjectTransactionId: null,
        latestSubjectTransactionFingerprint: null,
        completeHistoryFingerprint: null,
        authoritativeMarkerFingerprint: null,
        derivedIndexStatus: "invalid",
        stagingOrphanCount: 0,
        installedUncommittedOrphanCount: 0,
        errors: [unknown],
      }).success,
    ).toBe(false);
  });

  it("accepts only canonical UTC instants with exact millisecond precision", () => {
    expect(ReadinessCanonicalUtcInstantSchema.parse("2026-07-30T01:02:03.004Z")).toBe(
      "2026-07-30T01:02:03.004Z",
    );
    for (const value of [
      "2026-07-30",
      "2026-07-30T01:02:03Z",
      "2026-07-30T01:02:03.004+00:00",
      "2026-07-30T09:02:03.004+08:00",
      "2026-07-30T01:02:03.0Z",
      "2026-07-30T01:02:03.00Z",
      "2026-07-30T01:02:03.0040Z",
      "2026-07-30T01:02:03.004z",
      " 2026-07-30T01:02:03.004Z",
      "2026-07-30T01:02:03.004Z ",
      "2026-02-29T01:02:03.004Z",
      "2026-13-01T01:02:03.004Z",
      "2026-07-30T24:02:03.004Z",
    ]) {
      expect(ReadinessCanonicalUtcInstantSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it("accepts the exact initialized-empty head field set", () => {
    expect(ReadinessLedgerHeadSchema.parse(head())).toEqual(head());
    expect(Object.keys(ReadinessLedgerHeadSchema.parse(head()))).toEqual([
      "headContractVersion",
      "headGeneration",
      "committedRegistrationCount",
      "committedReplayAttemptCount",
      "totalAuthoritativeEventCount",
      "lastCommittedLedgerSequence",
      "latestAuditEntryId",
      "latestAuditEntryFingerprint",
      "latestSemanticEventId",
      "latestSemanticEventFingerprint",
      "latestSubjectTransactionId",
      "latestSubjectTransactionFingerprint",
      "completeHistoryFingerprint",
      "ledgerHeadFingerprint",
    ]);
  });

  it.each([
    [
      "missing",
      (input: Record<string, unknown>) => {
        const value = { ...input };
        delete value.latestAuditEntryId;
        return value;
      },
    ],
    ["extra", (value: Record<string, unknown>) => ({ ...value, lastCommittedEvent: null })],
    [
      "aliased",
      ({ latestSubjectTransactionId: value, ...rest }) => ({ ...rest, latestTransactionId: value }),
    ],
  ])("rejects %s ledger-head keys", (_label, mutate) => {
    expect(() => ReadinessLedgerHeadSchema.parse(mutate(head() as never))).toThrow();
  });

  it("rejects non-null genesis latest coordinates", () => {
    expect(() =>
      ReadinessLedgerHeadSchema.parse({
        ...head(),
        latestAuditEntryId: "audit-one",
        latestAuditEntryFingerprint: fingerprint,
      }),
    ).toThrow();
  });

  it("rejects event heads with null latest coordinates", () => {
    expect(() =>
      ReadinessLedgerHeadSchema.parse({
        ...head(),
        headGeneration: 1,
        committedRegistrationCount: 1,
        totalAuthoritativeEventCount: 1,
        lastCommittedLedgerSequence: 1,
      }),
    ).toThrow();
  });

  it("accepts only the reserved canonical genesis marker coordinates", () => {
    const marker = {
      markerContractVersion: "1.0",
      markerId: "m15-genesis",
      markerGeneration: 0,
      markerCategory: "genesis",
      committedRegistrationCount: 0,
      committedReplayAttemptCount: 0,
      totalAuthoritativeEventCount: 0,
      lastCommittedLedgerSequence: 0,
      subjectTransactionId: null,
      subjectTransactionFingerprint: null,
      semanticEventId: null,
      semanticEventFingerprint: null,
      auditEntryId: null,
      auditEntryFingerprint: null,
      completeHistoryFingerprint: fingerprint,
      resultingLedgerHead: head(),
      resultingLedgerHeadFingerprint: fingerprint,
      commitMarkerFingerprint: fingerprint,
    } as const;
    expect(ReadinessGenesisCommitMarkerSchema.parse(marker)).toEqual(marker);
    expect(() =>
      ReadinessGenesisCommitMarkerSchema.parse({ ...marker, markerId: "other" }),
    ).toThrow();
    expect(() =>
      ReadinessGenesisCommitMarkerSchema.parse({ ...marker, transactionFingerprint: fingerprint }),
    ).toThrow();
  });

  it("rejects explicit undefined before object parsing", () => {
    expect(() => ReadinessLedgerHeadSchema.parse({ ...head(), unknown: undefined })).toThrow();
  });

  it("rejects symbols, non-enumerable properties, and custom prototypes", () => {
    const symbolic = { ...head(), [Symbol("hidden")]: true };
    expect(() => ReadinessLedgerHeadSchema.parse(symbolic)).toThrow();
    const hidden = { ...head() };
    Object.defineProperty(hidden, "hidden", { enumerable: false, value: true });
    expect(() => ReadinessLedgerHeadSchema.parse(hidden)).toThrow();
    expect(() =>
      ReadinessLedgerHeadSchema.parse(Object.assign(Object.create({ inherited: true }), head())),
    ).toThrow();
  });

  it("rejects accessors without invoking them", () => {
    let invoked = 0;
    const value = { ...head() };
    Object.defineProperty(value, "headGeneration", {
      enumerable: true,
      get() {
        invoked += 1;
        return 0;
      },
    });
    expect(() => ReadinessLedgerHeadSchema.parse(value)).toThrow();
    expect(invoked).toBe(0);
  });

  it("keeps registration results strict and non-fingerprinted", () => {
    const result = { status: "rejected", transaction: null, reason: "invalid-input" } as const;
    expect(ReadinessRegistrationResultSchema.parse(result)).toEqual(result);
    expect(() =>
      ReadinessRegistrationResultSchema.parse({ ...result, resultFingerprint: fingerprint }),
    ).toThrow();
  });

  it("keeps replay append status ephemeral and non-fingerprinted", () => {
    const result = {
      status: "not-recorded",
      replayAppendStatus: "not-appended",
      replayAttempt: null,
      reason: "invalid-replay-input",
    } as const;
    expect(ReadinessReplaySubmissionResultSchema.parse(result)).toEqual(result);
    expect(() =>
      ReadinessReplaySubmissionResultSchema.parse({ ...result, appendFingerprint: fingerprint }),
    ).toThrow();
  });

  it("enforces closed status-specific registration and replay reason taxonomies", () => {
    expect(READINESS_RESULT_REASON_TAXONOMY_VERSION).toBe("1.0");
    for (const reason of READINESS_REGISTRATION_REJECTED_REASON_CODES) {
      expect(
        ReadinessRegistrationResultSchema.parse({ status: "rejected", transaction: null, reason }),
      ).toEqual({ status: "rejected", transaction: null, reason });
    }
    for (const reason of READINESS_REGISTRATION_INTEGRITY_FAILED_REASON_CODES) {
      expect(
        ReadinessRegistrationResultSchema.parse({
          status: "integrity-failed",
          transaction: null,
          reason,
        }),
      ).toEqual({ status: "integrity-failed", transaction: null, reason });
    }
    for (const reason of READINESS_REPLAY_NOT_RECORDED_REASON_CODES) {
      expect(
        ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason,
        }),
      ).toEqual({
        status: "not-recorded",
        replayAppendStatus: "not-appended",
        replayAttempt: null,
        reason,
      });
    }

    const rejectedAliases = [
      "original-not-found",
      "Original-Transaction-Not-Found",
      "original-transaction-not-foun",
      "unrelated-logical-reference",
      "future-reason",
      "",
    ];
    for (const reason of rejectedAliases) {
      expect(() =>
        ReadinessReplaySubmissionResultSchema.parse({
          status: "not-recorded",
          replayAppendStatus: "not-appended",
          replayAttempt: null,
          reason,
        }),
      ).toThrow();
    }
    expect(() =>
      ReadinessRegistrationResultSchema.parse({
        status: "rejected",
        transaction: null,
        reason: "readiness-ledger-integrity-failure",
      }),
    ).toThrow();
    expect(() =>
      ReadinessRegistrationResultSchema.parse({
        status: "integrity-failed",
        transaction: null,
        reason: "invalid-registration-input",
      }),
    ).toThrow();
    expect(() =>
      ReadinessReplaySubmissionResultSchema.parse({
        status: "not-recorded",
        replayAppendStatus: "not-appended",
        replayAttempt: null,
        reason: "ownership-id-conflict",
      }),
    ).toThrow();
    expect(() =>
      ReadinessReplaySubmissionResultSchema.parse({
        status: "not-recorded",
        replayAppendStatus: "not-appended",
        replayAttempt: null,
      }),
    ).toThrow();
  });

  it("keeps integrity and recovery results strict and non-fingerprinted", () => {
    const integrity = {
      resultContractVersion: "1.0",
      status: "invalid",
      verifiedMarkerFingerprint: null,
      verifiedRegistrationCount: 0,
      verifiedReplayAttemptCount: 0,
      verifiedTotalEventCount: 0,
      verifiedLastSequence: 0,
      verifiedLatestAuditEntryFingerprint: null,
      verifiedCompleteHistoryFingerprint: null,
      derivedIndexStatus: "missing",
      findings: ["ledger-uninitialized"],
    } as const;
    expect(ReadinessIntegrityResultSchema.parse(integrity)).toEqual(integrity);
    expect(() => ReadinessIntegrityResultSchema.parse({ ...integrity, fingerprint })).toThrow();
    const recovery = {
      resultContractVersion: "1.0",
      status: "failed",
      committedRegistrationCount: 0,
      committedReplayAttemptCount: 0,
      permanentIdempotencyOwnershipCount: 0,
      lastCommittedSequence: 0,
      latestAuditEntryId: null,
      latestAuditEntryFingerprint: null,
      latestSemanticEventId: null,
      latestSemanticEventFingerprint: null,
      latestSubjectTransactionId: null,
      latestSubjectTransactionFingerprint: null,
      completeHistoryFingerprint: null,
      authoritativeMarkerFingerprint: null,
      derivedIndexStatus: "missing",
      stagingOrphanCount: 0,
      installedUncommittedOrphanCount: 0,
      errors: ["ledger-uninitialized"],
    } as const;
    expect(ReadinessRecoveryResultSchema.parse(recovery)).toEqual(recovery);
    expect(() =>
      ReadinessRecoveryResultSchema.parse({ ...recovery, recoveryFingerprint: fingerprint }),
    ).toThrow();
  });

  it("cross-binds recovery and integrity counts to latest-evidence nullability", () => {
    const recovered = {
      resultContractVersion: "1.0",
      status: "recovered",
      committedRegistrationCount: 1,
      committedReplayAttemptCount: 1,
      permanentIdempotencyOwnershipCount: 2,
      lastCommittedSequence: 2,
      latestAuditEntryId: "audit-2",
      latestAuditEntryFingerprint: fingerprint,
      latestSemanticEventId: "semantic-2",
      latestSemanticEventFingerprint: fingerprint,
      latestSubjectTransactionId: "transaction-1",
      latestSubjectTransactionFingerprint: fingerprint,
      completeHistoryFingerprint: fingerprint,
      authoritativeMarkerFingerprint: fingerprint,
      derivedIndexStatus: "valid",
      stagingOrphanCount: 0,
      installedUncommittedOrphanCount: 0,
      errors: [],
    } as const;
    expect(ReadinessRecoveryResultSchema.parse(recovered)).toEqual(recovered);
    expect(() =>
      ReadinessRecoveryResultSchema.parse({ ...recovered, lastCommittedSequence: 1 }),
    ).toThrow();
    expect(() =>
      ReadinessRecoveryResultSchema.parse({ ...recovered, latestAuditEntryId: null }),
    ).toThrow();

    const integrity = {
      resultContractVersion: "1.0",
      status: "valid",
      verifiedMarkerFingerprint: fingerprint,
      verifiedRegistrationCount: 1,
      verifiedReplayAttemptCount: 1,
      verifiedTotalEventCount: 2,
      verifiedLastSequence: 2,
      verifiedLatestAuditEntryFingerprint: fingerprint,
      verifiedCompleteHistoryFingerprint: fingerprint,
      derivedIndexStatus: "valid",
      findings: [],
    } as const;
    expect(ReadinessIntegrityResultSchema.parse(integrity)).toEqual(integrity);
    expect(() =>
      ReadinessIntegrityResultSchema.parse({ ...integrity, verifiedTotalEventCount: 1 }),
    ).toThrow();
    expect(() =>
      ReadinessIntegrityResultSchema.parse({
        ...integrity,
        verifiedLatestAuditEntryFingerprint: null,
      }),
    ).toThrow();
  });

  it.each([
    "apiKey",
    "api_key",
    "credentialValue",
    "secretValue",
    "accessToken",
    "password",
    "cookie",
    "certificate",
    "authorizationHeader",
    "apiHost",
    "host",
    "hostname",
    "endpoint",
    "baseUrl",
    "url",
    "uri",
    "query",
    "providerRequest",
    "providerResponse",
    "rawContext",
  ])("rejects unapproved retained-evidence field %s structurally", (field) => {
    const projection = {
      projectionContractVersion: "1.0",
      authorization: null,
      compatibility: null,
      transportPlan: null,
      rateAndCapacity: null,
      costAndBudget: null,
      circuit: null,
      observability: null,
      observabilityRetention: null,
      health: null,
      requestPlan: null,
    } as const;
    expect(DurableReadinessEvidenceProjectionSchema.parse(projection)).toEqual(projection);
    expect(() =>
      DurableReadinessEvidenceProjectionSchema.parse({ ...projection, [field]: "sentinel" }),
    ).toThrow();
    expect(() =>
      DurableReadinessEvidenceProjectionSchema.parse({
        ...projection,
        transportPlan: {
          schemaVersion: "1.0",
          adapterId: "adapter-one",
          adapterFingerprint: fingerprint,
          providerFamilyReference: "provider/family",
          providerCapabilityId: "capability-one",
          providerCapabilityFingerprint: fingerprint,
          credentialReferenceId: "credential-reference-one",
          credentialReferenceFingerprint: fingerprint,
          transportPolicyId: "transport-policy-one",
          transportPolicyFingerprint: fingerprint,
          transportPolicyVersion: "1.0",
          [field]: "sentinel",
        },
      }),
    ).toThrow();
  });

  it("enforces the shared public result finding bound", () => {
    const findings = Array.from(
      { length: M15_MAX_RESULT_FINDINGS + 1 },
      (_, index) => `finding-${index}`,
    );
    expect(() =>
      ReadinessIntegrityResultSchema.parse({
        resultContractVersion: "1.0",
        status: "invalid",
        verifiedMarkerFingerprint: null,
        verifiedRegistrationCount: 0,
        verifiedReplayAttemptCount: 0,
        verifiedTotalEventCount: 0,
        verifiedLastSequence: 0,
        verifiedLatestAuditEntryFingerprint: null,
        verifiedCompleteHistoryFingerprint: null,
        derivedIndexStatus: "missing",
        findings,
      }),
    ).toThrow();
  });

  it("enforces mismatch-path and reason-code boundaries with one-over rejection", () => {
    const paths = Array.from(
      { length: M15_MAX_DIFFERING_FIELD_PATHS },
      (_, index) => `field-${index}`,
    );
    const reasons = Array.from({ length: M15_MAX_REASON_CODES }, (_, index) => `reason-${index}`);
    const comparison = {
      comparisonContractVersion: "1.0",
      originalEvaluationPackageFingerprint: fingerprint,
      reconstructedEvaluationPackageFingerprint: fingerprint,
      historicalReconstructionStatus: "mismatched",
      differingFieldPaths: paths,
      reasonCodes: reasons,
      historicalComparisonFingerprint: fingerprint,
    } as const;
    expect(ReadinessHistoricalComparisonSchema.parse(comparison)).toEqual(comparison);
    expect(() =>
      ReadinessHistoricalComparisonSchema.parse({
        ...comparison,
        differingFieldPaths: [...paths, "field-over"],
      }),
    ).toThrow();
    expect(() =>
      ReadinessHistoricalComparisonSchema.parse({
        ...comparison,
        reasonCodes: [...reasons, "reason-over"],
      }),
    ).toThrow();
  });

  it("enforces derived-index boundary, paired lengths, order, and uniqueness", () => {
    const entries = Array.from({ length: M15_MAX_DERIVED_INDEX_ENTRIES }, (_, index) => ({
      indexKind: "transaction-id" as const,
      indexKey: `entry-${index}`,
      logicalCoordinates: { sequence: index },
      authoritativeSubjectTransactionFingerprint: fingerprint,
      authoritativeMarkerFingerprint: fingerprint,
      derivedIndexEntryFingerprint: index.toString(16).padStart(64, "0"),
    }));
    const index = {
      indexContractVersion: "1.0" as const,
      indexKind: "transaction-id" as const,
      sourceMarkerFingerprint: fingerprint,
      sourceLedgerHeadFingerprint: fingerprint,
      entries,
      orderedEntryFingerprints: entries.map((entry) => entry.derivedIndexEntryFingerprint),
      entryCount: entries.length,
      derivedIndexFingerprint: fingerprint,
    };
    expect(ReadinessDerivedIndexSchema.parse(index).entryCount).toBe(M15_MAX_DERIVED_INDEX_ENTRIES);
    expect(() =>
      ReadinessDerivedIndexSchema.parse({
        ...index,
        entries: [...entries, entries[0]],
        orderedEntryFingerprints: [
          ...index.orderedEntryFingerprints,
          entries[0]!.derivedIndexEntryFingerprint,
        ],
        entryCount: entries.length + 1,
      }),
    ).toThrow();
    expect(() =>
      ReadinessDerivedIndexSchema.parse({
        ...index,
        orderedEntryFingerprints: index.orderedEntryFingerprints.slice(1),
      }),
    ).toThrow();
    expect(() =>
      ReadinessDerivedIndexSchema.parse({
        ...index,
        orderedEntryFingerprints: [
          index.orderedEntryFingerprints[1],
          index.orderedEntryFingerprints[0],
          ...index.orderedEntryFingerprints.slice(2),
        ],
      }),
    ).toThrow();
    expect(() => ReadinessDerivedIndexCollectionSchema.parse([index, index])).toThrow();
  });

  it("accepts only strict bounded public list queries", () => {
    expect(ReadinessListQuerySchema.parse({})).toEqual({});
    expect(ReadinessListQuerySchema.parse({ limit: M15_MAX_LIST_PAGE_SIZE })).toEqual({
      limit: M15_MAX_LIST_PAGE_SIZE,
    });
    for (const query of [
      { limit: M15_MAX_LIST_PAGE_SIZE + 1 },
      { limit: 0 },
      { afterSequence: 0 },
      { limit: 1, extra: true },
      { limit: undefined },
    ]) {
      expect(() => ReadinessListQuerySchema.parse(query)).toThrow();
    }
  });

  it("owns strict public writer-lock inspection and cleanup contracts", () => {
    const inactive = {
      resultContractVersion: "1.0",
      status: "inactive",
      lockFingerprint: fingerprint,
      writerProcessId: 999_999,
      reason: null,
    } as const;
    expect(ReadinessWriterLockInspectionResultSchema.parse(inactive)).toEqual(inactive);
    expect(
      ReadinessWriterLockCleanupRequestSchema.parse({
        requestContractVersion: "1.0",
        lockFingerprint: fingerprint,
        writerProcessId: 999_999,
        writerActive: false,
      }),
    ).toBeDefined();
    expect(
      ReadinessWriterLockCleanupResultSchema.parse({
        resultContractVersion: "1.0",
        status: "cleaned",
        lockFingerprint: fingerprint,
        reason: null,
      }),
    ).toBeDefined();
    for (const invalid of [
      { ...inactive, extra: true },
      { ...inactive, status: "none" },
      { ...inactive, status: "active", writerProcessId: 0 },
      { ...inactive, status: "inactive", reason: "writer-lock-invalid" },
    ]) {
      expect(ReadinessWriterLockInspectionResultSchema.safeParse(invalid).success).toBe(false);
    }
    expect(
      ReadinessWriterLockCleanupRequestSchema.safeParse({
        requestContractVersion: "1.0",
        lockFingerprint: fingerprint,
        writerProcessId: 999_999,
        writerActive: true,
      }).success,
    ).toBe(false);
  });
});
