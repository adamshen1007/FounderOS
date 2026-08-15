import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import ts from "typescript";

import {
  CommittedReadinessEvaluationTransactionSchema,
  ReadinessAuditEntrySchema,
  ReadinessCommitMarkerSchema,
  ReadinessCompleteHistoryCommitmentSchema,
  ReadinessCurrentAdmissibilitySchema,
  ReadinessHistoricalComparisonSchema,
  ReadinessIdempotencyOwnershipSchema,
  ReadinessLedgerHeadSchema,
  ReadinessRegistrationRequestSchema,
  ReadinessReplayAttemptSchema,
  ReadinessReplayRequestSchema,
  ReadinessReplaySemanticEventSchema,
  ReadinessSemanticEventSchema,
} from "@founderos/knowledge-schema";

export const M15_TASK_1_ARTIFACT_CLASSES = Object.freeze([
  "authoritative-genesis",
  "authoritative-registration-components",
  "authoritative-replay-components",
  "authoritative-marker-archives",
  "authoritative-current-marker",
  "authoritative-history-and-head-components",
  "transitional-staging",
  "transitional-installed-uncommitted-orphans",
  "transitional-temporary-marker-material",
  "transitional-temporary-derived-material",
  "operational-writer-lock",
  "operational-initialization-lock",
  "operational-quarantine-metadata",
  "operational-quarantine-material",
  "derived-head",
  "derived-index-entries-and-snapshots",
  "ephemeral-registration-result",
  "ephemeral-replay-result",
  "ephemeral-integrity-result",
  "ephemeral-recovery-result",
  "ephemeral-validation-and-preflight-result",
  "ephemeral-writer-lock-inspect-and-cleanup-result",
  "ephemeral-derived-state-status-and-result",
  "ephemeral-pagination-and-list-result",
  "ephemeral-scenario-and-test-evidence",
  "operational-logs",
  "operational-traces",
  "operational-metrics",
  "operational-observability-artifacts",
] as const);

const M15_NORMATIVE_OUTPUT_SPECIFICATION_BINDINGS = Object.freeze([
  ["ReadinessRegistrationResultSchema", "registration"],
  ["ReadinessReplaySubmissionResultSchema", "replay"],
  ["ReadinessReplayAppendStatusSchema", "append status"],
  ["ReadinessIntegrityResultSchema", "integrity"],
  ["ReadinessRecoveryResultSchema", "recovery"],
  ["ReadinessWriterLockInspectionResultSchema", "lock"],
  ["ReadinessWriterLockCleanupResultSchema", "cleanup"],
  ["ReadinessDerivedStateStatusSchema", "derived-state"],
  ["ReadinessDerivedIndexRebuildResultSchema", "rebuild"],
  ["ReadinessListPageMetadataSchema", "list"],
  ["ReadinessCommittedEvaluationListItemSchema", "list"],
  ["ReadinessReplayAttemptListItemSchema", "list"],
  ["ReadinessCommittedEvaluationPageSchema", "list"],
  ["ReadinessReplayAttemptPageSchema", "list"],
  ["LocalFileReadinessEvaluationLedgerOpenFacade", "initialization/open"],
  ["Milestone15ImplementationPreflightValidationResult", "preflight"],
] as const);

export const M15_TASK_1_PUBLIC_OUTPUT_SCHEMAS = Object.freeze(
  M15_NORMATIVE_OUTPUT_SPECIFICATION_BINDINGS.map(([name]) => name),
);

const M15_PUBLIC_FACADE_EXPORT_DISPOSITIONS = Object.freeze({
  openLocalFileReadinessEvaluationLedger: "governed-non-data-facade",
});

const M15_NON_EPHEMERAL_PUBLIC_SCHEMA_SURFACE_DISPOSITIONS = Object.freeze({
  ReadinessCurrentAdmissibilityStatusSchema: "authoritative-durable-status",
  ReadinessHistoricalReconstructionStatusSchema: "authoritative-durable-status",
});

const M15_PREFLIGHT_EXPORT_DISPOSITIONS = Object.freeze({
  M15_PREFLIGHT_CONTRACT: "authorization-input-contract",
  Milestone15PreflightError: "redacted-validation-error",
  inspectMilestone15Repository: "ephemeral-validation-observation",
  validateMilestone15ImplementationAuthorization: "ephemeral-validation-result",
  validateMilestone15ImplementationPreflight: "ephemeral-validation-result",
  validateMilestone15RepositoryObservation: "ephemeral-validation-result",
});

const M15_FACADE_METHOD_OUTPUT_CLASSIFICATIONS = Object.freeze({
  verifyIntegrity: "ReadinessIntegrityResultSchema",
  recover: "ReadinessRecoveryResultSchema",
  registerVerifiedReadinessEvaluation: "ReadinessRegistrationResultSchema",
  readOriginalReadinessEvaluation: "authoritative-record-or-null",
  listCommittedReadinessEvaluations: "ReadinessCommittedEvaluationPageSchema",
  submitReadinessReplayAttempt: "ReadinessReplaySubmissionResultSchema",
  listReadinessReplayAttempts: "ReadinessReplayAttemptPageSchema",
  readHead: "authoritative-record",
  rebuildDerivedIndexes: "ReadinessDerivedIndexRebuildResultSchema",
  inspectWriterLock: "ReadinessWriterLockInspectionResultSchema",
  cleanupInactiveWriterLock: "ReadinessWriterLockCleanupResultSchema",
});

export interface M15IndependentAuthority {
  readonly genesisHead: Readonly<Record<string, unknown>>;
  readonly expectedHead: Readonly<Record<string, unknown>>;
  readonly currentMarker: Readonly<Record<string, unknown>>;
  readonly registrations: readonly Readonly<Record<string, unknown>>[];
  readonly replays: readonly Readonly<Record<string, unknown>>[];
  readonly expectedDerivedIndexes: readonly Readonly<Record<string, unknown>>[];
  readonly lookupMappings: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly persistedFiles: readonly {
    readonly relativePath: string;
    readonly bytes: string;
    readonly value: unknown;
  }[];
  readonly authoritativeFiles: readonly {
    readonly relativePath: string;
    readonly bytes: string;
    readonly value: unknown;
  }[];
  readonly derivedMappingClasses: readonly string[];
  readonly verifiedGraphMutationCases: readonly string[];
  readonly verifiedGraphBindings?: readonly string[];
  readonly publicLookupMappings?: readonly {
    readonly lookupClass: string;
    readonly expectedCount: number;
    readonly key: string;
    readonly expectedValue: unknown;
  }[];
}

export interface M15ArtifactPrivacyInspection {
  readonly inventoriedClasses: readonly string[];
  readonly inspectedDurableFiles: readonly string[];
  readonly absentTransitionalClasses: readonly string[];
  readonly productionObservabilityPersistenceSinkCount: number;
  readonly contractArtifactClasses?: readonly string[];
  readonly discoveredArtifactClasses?: readonly string[];
  readonly instantiatedArtifactClasses?: readonly string[];
  readonly byteInspectedArtifactClasses?: readonly string[];
}

export interface M15PublicOutputInspection {
  readonly inventoriedSchemaNames: readonly string[];
  readonly inspectedVariantCount: number;
  readonly persistedEnvelopeMatchCount: number;
  readonly publicCommitmentDomainCount: number;
  readonly contractOutputNames?: readonly string[];
  readonly discoveredOutputNames?: readonly string[];
  readonly rejectedPathLikeMutationCount?: number;
  readonly requiredPathMatrixValueCount?: number;
  readonly exactPathFieldCoverage?: readonly {
    readonly outputName: string;
    readonly sampleIndex: number;
    readonly fieldPath: string;
    readonly expectedBehavior: "reject" | "redact";
    readonly reachedMutationCount: number;
    readonly rejectedMutationCount: number;
    readonly redactedMutationCount: number;
  }[];
  readonly noPathCapableFieldDispositions?: readonly {
    readonly outputName: string;
    readonly disposition: string;
  }[];
  readonly discoveredFacadeExportNames?: readonly string[];
  readonly discoveredFacadeMethodNames?: readonly string[];
  readonly discoveredPreflightExportNames?: readonly string[];
  readonly commitmentDomainDefinitionCount?: number;
  readonly commitmentCallSiteCount?: number;
  readonly commitmentOutputImportCount?: number;
}

type JsonRecord = Record<string, unknown>;

const DOMAINS = Object.freeze({
  genesisHistory: "founderos.m15.genesis-history.v1",
  genesisHead: "founderos.m15.genesis-head.v1",
  genesisMarker: "founderos.m15.genesis-marker.v1",
  registrationRequest: "founderos.m15.registration-request.v1",
  ownership: "founderos.m15.idempotency-ownership.v1",
  transaction: "founderos.m15.transaction.v1",
  registrationSemanticEvent: "founderos.m15.registration-semantic-event.v1",
  replayRequest: "founderos.m15.replay-request.v1",
  historicalComparison: "founderos.m15.historical-comparison.v1",
  currentAdmissibility: "founderos.m15.current-admissibility.v1",
  replayAttempt: "founderos.m15.replay-attempt.v1",
  replaySemanticEvent: "founderos.m15.replay-semantic-event.v1",
  auditEntry: "founderos.m15.audit-entry.v1",
  completeHistory: "founderos.m15.complete-history.v1",
  ledgerHead: "founderos.m15.ledger-head.v1",
  commitMarker: "founderos.m15.commit-marker.v1",
  derivedIndexEntry: "founderos.m15.derived-index-entry.v1",
  derivedIndex: "founderos.m15.derived-index.v1",
});

function record(value: unknown, message = "canonical-record-required"): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as JsonRecord;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(record(value))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",")}}`;
}

function fingerprint(domain: string, unsigned: unknown): string {
  return createHash("sha256")
    .update(domain, "utf8")
    .update(Buffer.from([0]))
    .update(canonical(unsigned), "utf8")
    .digest("hex");
}

function without(value: JsonRecord, key: string): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

function assertSigned(value: JsonRecord, field: string, domain: string): void {
  if (value[field] !== fingerprint(domain, without(value, field))) {
    throw new Error(`authoritative-fingerprint-invalid:${field}`);
  }
}

async function canonicalFile(
  root: string,
  path: string,
): Promise<{ relativePath: string; bytes: string; value: JsonRecord }> {
  const bytes = await readFile(join(root, path), "utf8");
  const value = record(JSON.parse(bytes), `canonical-record-required:${path}`);
  if (bytes !== canonical(value)) throw new Error(`authoritative-canonical-bytes-invalid:${path}`);
  return { relativePath: path, bytes, value };
}

function expectedGenesis(): {
  completeHistory: JsonRecord;
  head: JsonRecord;
  marker: JsonRecord;
} {
  const historyUnsigned = {
    historyContractVersion: "1.0",
    historyGeneration: 0,
    previousCompleteHistoryFingerprint: null,
    totalAuthoritativeEventCount: 0,
  };
  const completeHistory = {
    ...historyUnsigned,
    completeHistoryFingerprint: fingerprint(DOMAINS.genesisHistory, historyUnsigned),
  };
  const headUnsigned = {
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
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
  };
  const head = {
    ...headUnsigned,
    ledgerHeadFingerprint: fingerprint(DOMAINS.genesisHead, headUnsigned),
  };
  const markerUnsigned = {
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
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
    resultingLedgerHead: head,
    resultingLedgerHeadFingerprint: head.ledgerHeadFingerprint,
  };
  return {
    completeHistory,
    head,
    marker: {
      ...markerUnsigned,
      commitMarkerFingerprint: fingerprint(DOMAINS.genesisMarker, markerUnsigned),
    },
  };
}

const REGISTRATION_COMPONENTS = Object.freeze([
  [
    "registration-request.json",
    "registrationRequest",
    "registrationRequestFingerprint",
    DOMAINS.registrationRequest,
  ],
  ["ownership.json", "ownership", "ownershipFingerprint", DOMAINS.ownership],
  ["transaction.json", "transaction", "transactionFingerprint", DOMAINS.transaction],
  [
    "semantic-event.json",
    "semanticEvent",
    "semanticEventFingerprint",
    DOMAINS.registrationSemanticEvent,
  ],
  ["audit-entry.json", "auditEntry", "auditEntryFingerprint", DOMAINS.auditEntry],
  [
    "complete-history.json",
    "completeHistory",
    "completeHistoryFingerprint",
    DOMAINS.completeHistory,
  ],
  ["ledger-head.json", "ledgerHead", "ledgerHeadFingerprint", DOMAINS.ledgerHead],
  ["commit-marker.json", "commitMarker", "commitMarkerFingerprint", DOMAINS.commitMarker],
] as const);

const REPLAY_COMPONENTS = Object.freeze([
  ["replay-request.json", "replayRequest", "replayRequestFingerprint", DOMAINS.replayRequest],
  [
    "historical-comparison.json",
    "historicalComparison",
    "historicalComparisonFingerprint",
    DOMAINS.historicalComparison,
  ],
  [
    "current-admissibility.json",
    "currentAdmissibility",
    "currentAdmissibilityFingerprint",
    DOMAINS.currentAdmissibility,
  ],
  ["replay-attempt.json", "replayAttempt", "replayAttemptFingerprint", DOMAINS.replayAttempt],
  ["semantic-event.json", "semanticEvent", "semanticEventFingerprint", DOMAINS.replaySemanticEvent],
  ["audit-entry.json", "auditEntry", "auditEntryFingerprint", DOMAINS.auditEntry],
  [
    "complete-history.json",
    "completeHistory",
    "completeHistoryFingerprint",
    DOMAINS.completeHistory,
  ],
  ["ledger-head.json", "ledgerHead", "ledgerHeadFingerprint", DOMAINS.ledgerHead],
  ["commit-marker.json", "commitMarker", "commitMarkerFingerprint", DOMAINS.commitMarker],
] as const);

async function eventDirectories(root: string, category: string): Promise<string[]> {
  const parent = join(root, "events", category);
  return (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("events", category, entry.name));
}

async function readEvent(
  root: string,
  directory: string,
  category: "registration" | "replay",
): Promise<{ event: JsonRecord; files: Awaited<ReturnType<typeof canonicalFile>>[] }> {
  const specification = category === "registration" ? REGISTRATION_COMPONENTS : REPLAY_COMPONENTS;
  const event: JsonRecord = { category };
  const files = [];
  for (const [name, property, fingerprintField, domain] of specification) {
    const file = await canonicalFile(root, join(directory, name));
    assertSigned(file.value, fingerprintField, domain);
    const schema =
      property === "registrationRequest"
        ? ReadinessRegistrationRequestSchema
        : property === "ownership"
          ? ReadinessIdempotencyOwnershipSchema
          : property === "transaction"
            ? CommittedReadinessEvaluationTransactionSchema
            : property === "replayRequest"
              ? ReadinessReplayRequestSchema
              : property === "historicalComparison"
                ? ReadinessHistoricalComparisonSchema
                : property === "currentAdmissibility"
                  ? ReadinessCurrentAdmissibilitySchema
                  : property === "replayAttempt"
                    ? ReadinessReplayAttemptSchema
                    : property === "semanticEvent"
                      ? category === "registration"
                        ? ReadinessSemanticEventSchema
                        : ReadinessReplaySemanticEventSchema
                      : property === "auditEntry"
                        ? ReadinessAuditEntrySchema
                        : property === "completeHistory"
                          ? ReadinessCompleteHistoryCommitmentSchema
                          : property === "ledgerHead"
                            ? ReadinessLedgerHeadSchema
                            : ReadinessCommitMarkerSchema;
    schema.parse(file.value);
    event[property] = file.value;
    files.push(file);
  }
  const audit = record(event.auditEntry);
  event.sequence = audit.ledgerSequence;
  return { event, files };
}

function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function assertEventGraph(previousHead: JsonRecord, event: JsonRecord): void {
  const category = String(event.category);
  const request = category === "registration" ? record(event.registrationRequest) : null;
  const ownership = category === "registration" ? record(event.ownership) : null;
  const transaction = category === "registration" ? record(event.transaction) : null;
  const replayRequest = category === "replay" ? record(event.replayRequest) : null;
  const historical = category === "replay" ? record(event.historicalComparison) : null;
  const admissibility = category === "replay" ? record(event.currentAdmissibility) : null;
  const attempt = category === "replay" ? record(event.replayAttempt) : null;
  const semantic = record(event.semanticEvent);
  const audit = record(event.auditEntry);
  const history = record(event.completeHistory);
  const marker = record(event.commitMarker);
  const head = record(event.ledgerHead);
  const sequence = Number(event.sequence);
  const subjectId = transaction?.transactionId ?? attempt?.originalTransactionId;
  const subjectFingerprint =
    transaction?.transactionFingerprint ?? attempt?.originalTransactionFingerprint;

  if (semantic.eventCategory !== category || audit.eventCategory !== category) {
    throw new Error("audit-category-binding-invalid");
  }
  if (
    audit.ledgerSequence !== sequence ||
    audit.previousLedgerHeadFingerprint !== previousHead.ledgerHeadFingerprint ||
    audit.semanticEventId !== semantic.semanticEventId ||
    audit.semanticEventFingerprint !== semantic.semanticEventFingerprint ||
    audit.subjectTransactionId !== subjectId ||
    audit.subjectTransactionFingerprint !== subjectFingerprint
  ) {
    throw new Error("audit-event-subject-binding-invalid");
  }
  if (
    history.previousCompleteHistoryFingerprint !== previousHead.completeHistoryFingerprint ||
    history.auditSequence !== sequence ||
    history.auditEntryFingerprint !== audit.auditEntryFingerprint ||
    history.semanticEventFingerprint !== semantic.semanticEventFingerprint
  ) {
    throw new Error("complete-history-binding-invalid");
  }
  if (
    marker.markerCategory !== category ||
    marker.markerGeneration !== sequence ||
    marker.lastCommittedLedgerSequence !== sequence ||
    marker.totalAuthoritativeEventCount !== sequence ||
    marker.subjectTransactionId !== subjectId ||
    marker.subjectTransactionFingerprint !== subjectFingerprint ||
    marker.semanticEventId !== semantic.semanticEventId ||
    marker.semanticEventFingerprint !== semantic.semanticEventFingerprint ||
    marker.auditEntryId !== audit.auditEntryId ||
    marker.auditEntryFingerprint !== audit.auditEntryFingerprint ||
    marker.completeHistoryFingerprint !== history.completeHistoryFingerprint ||
    marker.resultingLedgerHeadFingerprint !== head.ledgerHeadFingerprint ||
    !equal(marker.resultingLedgerHead, head)
  ) {
    throw new Error("marker-shared-coordinate-binding-invalid");
  }
  if (category === "registration") {
    if (
      request === null ||
      ownership === null ||
      transaction === null ||
      request.transactionId !== transaction.transactionId ||
      request.requestedOwnershipId !== ownership.ownershipId ||
      request.requestedRegistrationSemanticEventId !== semantic.semanticEventId ||
      request.requestedRegistrationAuditEntryId !== audit.auditEntryId ||
      request.requestedRegistrationMarkerId !== marker.markerId ||
      ownership.registrationRequestId !== request.registrationRequestId ||
      ownership.registrationRequestFingerprint !== request.registrationRequestFingerprint ||
      ownership.transactionId !== transaction.transactionId ||
      ownership.registrationSemanticEventId !== semantic.semanticEventId ||
      ownership.registrationAuditEntryId !== audit.auditEntryId ||
      ownership.registrationMarkerId !== marker.markerId ||
      transaction.registrationRequestFingerprint !== request.registrationRequestFingerprint ||
      transaction.ownershipFingerprint !== ownership.ownershipFingerprint ||
      !equal(transaction.registrationRequest, request) ||
      !equal(transaction.ownership, ownership) ||
      semantic.transactionId !== transaction.transactionId ||
      semantic.transactionFingerprint !== transaction.transactionFingerprint ||
      semantic.ownershipId !== ownership.ownershipId ||
      semantic.ownershipFingerprint !== ownership.ownershipFingerprint ||
      marker.registrationRequestFingerprint !== request.registrationRequestFingerprint ||
      marker.configurationProjectionFingerprint !==
        record(transaction.evaluatorConfigurationProjection).configurationProjectionFingerprint ||
      marker.authorityProjectionFingerprint !==
        record(transaction.authorityProjection).authorityProjectionFingerprint ||
      marker.evaluationPackageFingerprint !==
        record(transaction.evaluationPackage).evaluationPackageFingerprint ||
      marker.ownershipFingerprint !== ownership.ownershipFingerprint ||
      marker.transactionFingerprint !== transaction.transactionFingerprint ||
      marker.registrationSemanticEventFingerprint !== semantic.semanticEventFingerprint
    ) {
      throw new Error("registration-authority-graph-binding-invalid");
    }
  } else if (
    replayRequest === null ||
    historical === null ||
    admissibility === null ||
    attempt === null ||
    replayRequest.requestedReplayAttemptId !== attempt.replayAttemptId ||
    replayRequest.requestedReplaySemanticEventId !== semantic.semanticEventId ||
    replayRequest.requestedReplayAuditEntryId !== audit.auditEntryId ||
    replayRequest.requestedReplayMarkerId !== marker.markerId ||
    attempt.replayRequestId !== replayRequest.replayRequestId ||
    attempt.replayRequestFingerprint !== replayRequest.replayRequestFingerprint ||
    attempt.originalTransactionId !== replayRequest.originalTransactionId ||
    attempt.originalTransactionFingerprint !== replayRequest.originalTransactionFingerprint ||
    !equal(attempt.historicalComparison, historical) ||
    !equal(attempt.currentAdmissibility, admissibility) ||
    semantic.originalTransactionId !== attempt.originalTransactionId ||
    semantic.originalTransactionFingerprint !== attempt.originalTransactionFingerprint ||
    semantic.replayAttemptId !== attempt.replayAttemptId ||
    semantic.replayAttemptFingerprint !== attempt.replayAttemptFingerprint ||
    marker.originalTransactionFingerprint !== attempt.originalTransactionFingerprint ||
    marker.replayRequestFingerprint !== replayRequest.replayRequestFingerprint ||
    marker.historicalComparisonFingerprint !== historical.historicalComparisonFingerprint ||
    marker.currentAdmissibilityFingerprint !== admissibility.currentAdmissibilityFingerprint ||
    marker.replayAttemptFingerprint !== attempt.replayAttemptFingerprint ||
    marker.replaySemanticEventFingerprint !== semantic.semanticEventFingerprint
  ) {
    throw new Error("replay-authority-graph-binding-invalid");
  }
}

export function verifyM15IndependentAuthorityGraph(
  previousHeadRaw: unknown,
  eventRaw: unknown,
): void {
  const previousHead = ReadinessLedgerHeadSchema.parse(previousHeadRaw) as JsonRecord;
  const event = record(eventRaw, "independent-authority-event-invalid");
  const category = event.category;
  if (category === "registration") {
    ReadinessRegistrationRequestSchema.parse(event.registrationRequest);
    ReadinessIdempotencyOwnershipSchema.parse(event.ownership);
    CommittedReadinessEvaluationTransactionSchema.parse(event.transaction);
    ReadinessSemanticEventSchema.parse(event.semanticEvent);
  } else if (category === "replay") {
    ReadinessReplayRequestSchema.parse(event.replayRequest);
    ReadinessHistoricalComparisonSchema.parse(event.historicalComparison);
    ReadinessCurrentAdmissibilitySchema.parse(event.currentAdmissibility);
    ReadinessReplayAttemptSchema.parse(event.replayAttempt);
    ReadinessReplaySemanticEventSchema.parse(event.semanticEvent);
  } else {
    throw new Error("independent-authority-event-category-invalid");
  }
  ReadinessAuditEntrySchema.parse(event.auditEntry);
  ReadinessCompleteHistoryCommitmentSchema.parse(event.completeHistory);
  ReadinessLedgerHeadSchema.parse(event.ledgerHead);
  ReadinessCommitMarkerSchema.parse(event.commitMarker);
  assertEventGraph(previousHead, event);
}

export function verifyM15IndependentCurrentArchiveIdentity(
  currentMarkerBytes: string,
  activeArchiveBytes: string,
): void {
  if (currentMarkerBytes !== activeArchiveBytes) {
    throw new Error("current-marker-archive-mismatch");
  }
}

export function verifyM15IndependentDerivedIndexes(actualRaw: unknown, expectedRaw: unknown): void {
  if (!Array.isArray(actualRaw) || !Array.isArray(expectedRaw)) {
    throw new Error("derived-index-proof-input-invalid");
  }
  const actual = actualRaw.map((entry) => record(entry));
  const expected = expectedRaw.map((entry) => record(entry));
  const actualKinds = actual.map((entry) => String(entry.indexKind));
  const expectedKinds = expected.map((entry) => String(entry.indexKind));
  if (
    new Set(actualKinds).size !== actualKinds.length ||
    new Set(expectedKinds).size !== expectedKinds.length ||
    canonical([...actualKinds].sort()) !== canonical([...expectedKinds].sort())
  ) {
    throw new Error("derived-index-class-inventory-mismatch");
  }
  for (const expectedIndex of expected) {
    const actualIndex = actual.find((entry) => entry.indexKind === expectedIndex.indexKind);
    if (actualIndex === undefined || !equal(actualIndex, expectedIndex)) {
      throw new Error(
        `derived-index-independent-proof-mismatch:${String(expectedIndex.indexKind)}`,
      );
    }
  }
}

export function verifyM15IndependentPublicLookupResults(
  mappingsRaw: unknown,
  actualResults: ReadonlyMap<string, unknown>,
): void {
  if (!Array.isArray(mappingsRaw)) throw new Error("public-lookup-mapping-inventory-invalid");
  const mappings = mappingsRaw.map((entry) => record(entry));
  const lookupClasses = mappings.map((mapping) => String(mapping.lookupClass));
  if (
    new Set(lookupClasses).size !== lookupClasses.length ||
    actualResults.size !== mappings.length ||
    [...actualResults.keys()].some((lookupClass) => !lookupClasses.includes(lookupClass))
  ) {
    throw new Error("public-lookup-class-inventory-mismatch");
  }
  for (const mapping of mappings) {
    const lookupClass = String(mapping.lookupClass);
    if (!actualResults.has(lookupClass)) {
      throw new Error(`public-lookup-not-consumed:${lookupClass}`);
    }
    const actual = actualResults.get(lookupClass);
    if (!equal(actual, mapping.expectedValue)) {
      throw new Error(`public-lookup-independent-proof-mismatch:${lookupClass}`);
    }
    const actualCount = Array.isArray(actual) ? actual.length : actual === null ? 0 : 1;
    if (actualCount !== mapping.expectedCount) {
      throw new Error(`public-lookup-count-mismatch:${lookupClass}`);
    }
  }
}

function createExpectedHead(previous: JsonRecord, event: JsonRecord): JsonRecord {
  const category = event.category;
  const audit = record(event.auditEntry);
  const semantic = record(event.semanticEvent);
  const completeHistory = record(event.completeHistory);
  const subject =
    category === "registration" ? record(event.transaction) : record(event.replayAttempt);
  const subjectTransactionId =
    category === "registration" ? subject.transactionId : subject.originalTransactionId;
  const subjectTransactionFingerprint =
    category === "registration"
      ? subject.transactionFingerprint
      : subject.originalTransactionFingerprint;
  const unsigned = {
    headContractVersion: "1.0",
    headGeneration: Number(previous.headGeneration) + 1,
    committedRegistrationCount:
      Number(previous.committedRegistrationCount) + (category === "registration" ? 1 : 0),
    committedReplayAttemptCount:
      Number(previous.committedReplayAttemptCount) + (category === "replay" ? 1 : 0),
    totalAuthoritativeEventCount: Number(previous.totalAuthoritativeEventCount) + 1,
    lastCommittedLedgerSequence: audit.ledgerSequence,
    latestAuditEntryId: audit.auditEntryId,
    latestAuditEntryFingerprint: audit.auditEntryFingerprint,
    latestSemanticEventId: semantic.semanticEventId,
    latestSemanticEventFingerprint: semantic.semanticEventFingerprint,
    latestSubjectTransactionId: subjectTransactionId,
    latestSubjectTransactionFingerprint: subjectTransactionFingerprint,
    completeHistoryFingerprint: completeHistory.completeHistoryFingerprint,
  };
  return { ...unsigned, ledgerHeadFingerprint: fingerprint(DOMAINS.ledgerHead, unsigned) };
}

function addLookup(
  mappings: Record<string, Record<string, unknown>>,
  kind: string,
  key: unknown,
  value: Record<string, unknown>,
): void {
  if (typeof key !== "string" && typeof key !== "number") throw new Error("lookup-key-invalid");
  const lookup = mappings[kind] ?? {};
  const normalized = String(key);
  if (normalized in lookup) throw new Error(`lookup-coordinate-duplicate:${kind}`);
  lookup[normalized] = value;
  mappings[kind] = lookup;
}

function reconstructMappings(events: readonly JsonRecord[], head: JsonRecord) {
  const mappings: Record<string, Record<string, unknown>> = Object.fromEntries(
    [
      "transaction-id",
      "registration-request-id",
      "registration-idempotency-key",
      "ownership-id",
      "decision-id",
      "invocation-id",
      "adapter-id",
      "replay-idempotency-key",
      "replay-request-id",
      "replay-attempt-id",
      "semantic-event-id",
      "audit-entry-id",
      "marker-id",
      "transaction-replay-sequence",
      "head-generation",
      "head-fingerprint",
    ].map((kind) => [kind, {}]),
  );
  for (const event of events) {
    const marker = record(event.commitMarker);
    const semantic = record(event.semanticEvent);
    const audit = record(event.auditEntry);
    const common = {
      ledgerSequence: event.sequence,
      semanticEventFingerprint: semantic.semanticEventFingerprint,
      auditEntryFingerprint: audit.auditEntryFingerprint,
      markerFingerprint: marker.commitMarkerFingerprint,
    };
    addLookup(mappings, "semantic-event-id", semantic.semanticEventId, common);
    addLookup(mappings, "audit-entry-id", audit.auditEntryId, common);
    addLookup(mappings, "marker-id", marker.markerId, common);
    if (event.category === "registration") {
      const transaction = record(event.transaction);
      const request = record(event.registrationRequest);
      const ownership = record(event.ownership);
      const authority = record(transaction.authorityProjection);
      const value = { ...common, transactionFingerprint: transaction.transactionFingerprint };
      addLookup(mappings, "transaction-id", transaction.transactionId, value);
      addLookup(mappings, "registration-request-id", request.registrationRequestId, value);
      addLookup(mappings, "registration-idempotency-key", ownership.idempotencyKey, value);
      addLookup(mappings, "ownership-id", ownership.ownershipId, value);
      addLookup(mappings, "decision-id", ownership.readinessDecisionId, value);
      addLookup(mappings, "invocation-id", authority.invocationRequestId, value);
      addLookup(mappings, "adapter-id", transaction.adapterId, value);
    } else {
      const attempt = record(event.replayAttempt);
      const value = {
        ...common,
        originalTransactionFingerprint: attempt.originalTransactionFingerprint,
        replayAttemptFingerprint: attempt.replayAttemptFingerprint,
      };
      addLookup(mappings, "replay-idempotency-key", attempt.replayIdempotencyKey, value);
      addLookup(mappings, "replay-request-id", attempt.replayRequestId, value);
      addLookup(mappings, "replay-attempt-id", attempt.replayAttemptId, value);
      addLookup(
        mappings,
        "transaction-replay-sequence",
        `${String(attempt.originalTransactionId)}:${String(event.sequence)}`,
        value,
      );
    }
  }
  addLookup(mappings, "head-generation", head.headGeneration, {
    ledgerHeadFingerprint: head.ledgerHeadFingerprint,
    completeHistoryFingerprint: head.completeHistoryFingerprint,
  });
  addLookup(mappings, "head-fingerprint", head.ledgerHeadFingerprint, {
    headGeneration: head.headGeneration,
    completeHistoryFingerprint: head.completeHistoryFingerprint,
  });
  return mappings;
}

function reconstructDerivedIndexes(
  events: readonly JsonRecord[],
  marker: JsonRecord,
  head: JsonRecord,
): readonly JsonRecord[] {
  const groups = new Map<
    string,
    { key: string; coordinates: JsonRecord; subject: string; marker: string }[]
  >();
  const add = (
    kind: string,
    key: unknown,
    coordinates: JsonRecord,
    subject: unknown,
    markerFingerprint: unknown,
  ) => {
    if (
      typeof key !== "string" ||
      typeof subject !== "string" ||
      typeof markerFingerprint !== "string"
    ) {
      throw new Error("derived-index-coordinate-invalid");
    }
    groups.set(kind, [
      ...(groups.get(kind) ?? []),
      { key, coordinates, subject, marker: markerFingerprint },
    ]);
  };
  for (const event of events) {
    const eventMarker = record(event.commitMarker).commitMarkerFingerprint;
    if (event.category === "registration") {
      const transaction = record(event.transaction);
      const request = record(event.registrationRequest);
      const ownership = record(event.ownership);
      const authority = record(transaction.authorityProjection);
      const coordinates = { transactionId: transaction.transactionId };
      add(
        "transaction-id",
        transaction.transactionId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "registration-request-id",
        request.registrationRequestId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "registration-idempotency-key",
        ownership.idempotencyKey,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "ownership-id",
        ownership.ownershipId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "decision-id",
        ownership.readinessDecisionId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "invocation-id",
        authority.invocationRequestId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
      add(
        "adapter-id",
        transaction.adapterId,
        coordinates,
        transaction.transactionFingerprint,
        eventMarker,
      );
    } else {
      const attempt = record(event.replayAttempt);
      const coordinates = {
        transactionId: attempt.originalTransactionId,
        replayAttemptId: attempt.replayAttemptId,
      };
      add(
        "replay-idempotency-key",
        attempt.replayIdempotencyKey,
        coordinates,
        attempt.originalTransactionFingerprint,
        eventMarker,
      );
      add(
        "replay-request-id",
        attempt.replayRequestId,
        coordinates,
        attempt.originalTransactionFingerprint,
        eventMarker,
      );
      add(
        "replay-attempt-id",
        attempt.replayAttemptId,
        coordinates,
        attempt.originalTransactionFingerprint,
        eventMarker,
      );
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([indexKind, values]) => {
      const entries = values
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((value) => {
          const unsigned = {
            indexKind,
            indexKey: value.key,
            logicalCoordinates: value.coordinates,
            authoritativeSubjectTransactionFingerprint: value.subject,
            authoritativeMarkerFingerprint: value.marker,
          };
          return {
            ...unsigned,
            derivedIndexEntryFingerprint: fingerprint(DOMAINS.derivedIndexEntry, unsigned),
          };
        });
      const unsigned = {
        indexContractVersion: "1.0",
        indexKind,
        sourceMarkerFingerprint: marker.commitMarkerFingerprint,
        sourceLedgerHeadFingerprint: head.ledgerHeadFingerprint,
        entries,
        orderedEntryFingerprints: entries.map((entry) => entry.derivedIndexEntryFingerprint),
        entryCount: entries.length,
      };
      return { ...unsigned, derivedIndexFingerprint: fingerprint(DOMAINS.derivedIndex, unsigned) };
    });
}

export async function readIndependentMarkerBoundedAuthority(
  runtimeRoot: string,
): Promise<M15IndependentAuthority> {
  const genesis = expectedGenesis();
  const persistedFiles: {
    relativePath: string;
    bytes: string;
    value: unknown;
  }[] = [await canonicalFile(runtimeRoot, join("events", "genesis", "commit-marker.json"))];
  if (canonical(persistedFiles[0]!.value) !== canonical(genesis.marker)) {
    throw new Error("genesis-independent-reconstruction-mismatch");
  }
  const current = await canonicalFile(runtimeRoot, "commit-head.json");
  persistedFiles.push(current);
  const eventRows = [
    ...(await Promise.all(
      (await eventDirectories(runtimeRoot, "registrations")).map((directory) =>
        readEvent(runtimeRoot, directory, "registration"),
      ),
    )),
    ...(await Promise.all(
      (await eventDirectories(runtimeRoot, "replay-attempts")).map((directory) =>
        readEvent(runtimeRoot, directory, "replay"),
      ),
    )),
  ].sort((left, right) => Number(left.event.sequence) - Number(right.event.sequence));
  const events = eventRows.map((row) => row.event);
  persistedFiles.push(...eventRows.flatMap((row) => row.files));
  if (events.length !== Number(current.value.lastCommittedLedgerSequence)) {
    throw new Error("marker-bounded-event-count-invalid");
  }
  let expectedHead = genesis.head;
  let previousMarkerBytes = persistedFiles[0]!.bytes;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (Number(event.sequence) !== index + 1) throw new Error("authoritative-sequence-invalid");
    const audit = record(event.auditEntry);
    if (audit.previousLedgerHeadFingerprint !== expectedHead.ledgerHeadFingerprint) {
      throw new Error("authoritative-previous-head-invalid");
    }
    assertEventGraph(expectedHead, event);
    expectedHead = createExpectedHead(expectedHead, event);
    if (canonical(record(event.ledgerHead)) !== canonical(expectedHead)) {
      throw new Error("independent-head-reconstruction-mismatch");
    }
    const marker = record(event.commitMarker);
    if (
      marker.resultingLedgerHeadFingerprint !== expectedHead.ledgerHeadFingerprint ||
      canonical(marker.resultingLedgerHead) !== canonical(expectedHead)
    ) {
      throw new Error("marker-independent-head-binding-invalid");
    }
    previousMarkerBytes = eventRows[index]!.files.at(-1)!.bytes;
  }
  if (current.bytes !== previousMarkerBytes) throw new Error("current-marker-archive-mismatch");
  const derivedHead = await canonicalFile(runtimeRoot, join("derived", "HEAD.json"));
  const derivedIndexes = await readFile(join(runtimeRoot, "derived", "indexes.json"), "utf8");
  const derivedIndexesValue = JSON.parse(derivedIndexes) as unknown;
  if (derivedIndexes !== canonical(derivedIndexesValue)) {
    throw new Error("derived-index-canonical-bytes-invalid");
  }
  persistedFiles.push(derivedHead, {
    relativePath: join("derived", "indexes.json"),
    bytes: derivedIndexes,
    value: derivedIndexesValue,
  });
  return {
    genesisHead: genesis.head,
    expectedHead,
    currentMarker: current.value,
    registrations: events.filter((event) => event.category === "registration"),
    replays: events.filter((event) => event.category === "replay"),
    expectedDerivedIndexes: reconstructDerivedIndexes(events, current.value, expectedHead),
    lookupMappings: reconstructMappings(events, expectedHead),
    verifiedGraphBindings: [
      "component-schemas-and-keysets",
      "complete-history-chain",
      "audit-event-subject",
      "ownership-and-transaction",
      "marker-shared-coordinates",
      "marker-category-components",
      "current-archive-identity",
    ],
    publicLookupMappings: [
      ...(events.some((event) => event.category === "registration")
        ? [
            {
              lookupClass: "readOriginalReadinessEvaluation",
              expectedCount: events.filter((event) => event.category === "registration").length,
              key: String(
                record(events.find((event) => event.category === "registration")?.transaction)
                  .transactionId,
              ),
              expectedValue: events.find((event) => event.category === "registration")?.transaction,
            },
            {
              lookupClass: "listCommittedReadinessEvaluations",
              expectedCount: events.filter((event) => event.category === "registration").length,
              key: "all",
              expectedValue: events
                .filter((event) => event.category === "registration")
                .map((event) => ({
                  ledgerSequence: event.sequence,
                  transaction: event.transaction,
                })),
            },
          ]
        : []),
      ...(events.some((event) => event.category === "replay")
        ? [
            {
              lookupClass: "listReadinessReplayAttempts",
              expectedCount: events.filter((event) => event.category === "replay").length,
              key: String(
                record(events.find((event) => event.category === "replay")?.replayAttempt)
                  .originalTransactionId,
              ),
              expectedValue: events
                .filter((event) => event.category === "replay")
                .map((event) => ({
                  ledgerSequence: event.sequence,
                  replayAttempt: event.replayAttempt,
                })),
            },
          ]
        : []),
      {
        lookupClass: "readHead",
        expectedCount: 1,
        key: String(expectedHead.ledgerHeadFingerprint),
        expectedValue: expectedHead,
      },
    ],
    persistedFiles,
    authoritativeFiles: persistedFiles.filter((file) => !file.relativePath.startsWith(`derived/`)),
    derivedMappingClasses: reconstructDerivedIndexes(events, current.value, expectedHead)
      .map((index) => String(index.indexKind))
      .sort(),
    verifiedGraphMutationCases: [
      "component-schema-and-keyset",
      "complete-history-chain",
      "audit-event-subject",
      "ownership-and-transaction",
      "marker-shared-coordinate",
      "marker-category-component",
      "current-archive-identity",
    ],
  };
}

export async function writeCoherentlyResignedAuditCategoryContradiction(
  runtimeRoot: string,
): Promise<void> {
  const directories = await eventDirectories(runtimeRoot, "registrations");
  if (directories.length !== 1) throw new Error("coherent-contradiction-fixture-invalid");
  const row = await readEvent(runtimeRoot, directories[0]!, "registration");
  const event = structuredClone(row.event);
  const audit = record(event.auditEntry);
  const unsignedAudit = { ...without(audit, "auditEntryFingerprint"), eventCategory: "replay" };
  event.auditEntry = {
    ...unsignedAudit,
    auditEntryFingerprint: fingerprint(DOMAINS.auditEntry, unsignedAudit),
  };
  const history = record(event.completeHistory);
  const unsignedHistory = {
    ...without(history, "completeHistoryFingerprint"),
    auditEntryFingerprint: record(event.auditEntry).auditEntryFingerprint,
  };
  event.completeHistory = {
    ...unsignedHistory,
    completeHistoryFingerprint: fingerprint(DOMAINS.completeHistory, unsignedHistory),
  };
  event.ledgerHead = createExpectedHead(expectedGenesis().head, event);
  const marker = record(event.commitMarker);
  const unsignedMarker = {
    ...without(marker, "commitMarkerFingerprint"),
    auditEntryFingerprint: record(event.auditEntry).auditEntryFingerprint,
    completeHistoryFingerprint: record(event.completeHistory).completeHistoryFingerprint,
    resultingLedgerHead: event.ledgerHead,
    resultingLedgerHeadFingerprint: record(event.ledgerHead).ledgerHeadFingerprint,
  };
  event.commitMarker = {
    ...unsignedMarker,
    commitMarkerFingerprint: fingerprint(DOMAINS.commitMarker, unsignedMarker),
  };
  const files: readonly [string, unknown][] = [
    ["audit-entry.json", event.auditEntry],
    ["complete-history.json", event.completeHistory],
    ["ledger-head.json", event.ledgerHead],
    ["commit-marker.json", event.commitMarker],
  ];
  for (const [name, value] of files) {
    await writeFile(join(runtimeRoot, directories[0]!, name), canonical(value), "utf8");
  }
  await writeFile(join(runtimeRoot, "commit-head.json"), canonical(event.commitMarker), "utf8");
}

const PROHIBITED_EPHEMERAL_KEYS = new Set([
  "derivedStateStatus",
  "replayAppendStatus",
  "validationReport",
  "integrityResult",
  "recoveryResult",
  "resultFingerprint",
  "verifiedMarkerFingerprint",
  "verifiedRegistrationCount",
  "verifiedReplayAttemptCount",
  "verifiedTotalEventCount",
  "verifiedLastSequence",
  "verifiedLatestAuditEntryFingerprint",
  "verifiedCompleteHistoryFingerprint",
  "findings",
  "errors",
  "stagingOrphanCount",
  "installedUncommittedOrphanCount",
  "rebuiltIndexCount",
  "lockFingerprint",
  "writerProcessId",
  "requestedLimit",
  "returnedCount",
  "nextAfterSequence",
  "hasMore",
  "scenarioEvidence",
  "testEvidence",
  "apiKey",
  "api_key",
  "credentialValue",
  "secretValue",
  "endpoint",
  "providerPayload",
  "registrationResult",
  "replayResult",
  "preflightResult",
  "derivedPublicationStatus",
]);

const DURABLE_ARTIFACT_CLASSES = Object.freeze([
  "authoritative-genesis",
  "authoritative-registration-components",
  "authoritative-replay-components",
  "authoritative-marker-archives",
  "authoritative-current-marker",
  "authoritative-history-and-head-components",
  "transitional-staging",
  "transitional-installed-uncommitted-orphans",
  "transitional-temporary-marker-material",
  "transitional-temporary-derived-material",
  "operational-writer-lock",
  "operational-initialization-lock",
  "operational-quarantine-metadata",
  "operational-quarantine-material",
  "derived-head",
  "derived-index-entries-and-snapshots",
] as const);

function inspectProhibited(value: unknown, roots: readonly string[], path = "$"): void {
  if (value === null || typeof value !== "object") {
    if (
      typeof value === "string" &&
      (roots.some((root) => root.length > 0 && value.includes(root)) ||
        value.includes("file://") ||
        value.startsWith("/tmp/") ||
        value.startsWith("/private/tmp/") ||
        value.startsWith("/Users/"))
    ) {
      throw new Error(`prohibited-physical-path-persisted:${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectProhibited(entry, roots, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(record(value))) {
    if (PROHIBITED_EPHEMERAL_KEYS.has(key)) {
      throw new Error(`prohibited-ephemeral-field-persisted:${path}.${key}`);
    }
    if (
      /(?:rawCredential|secretValue|password|accessToken|cookie|certificateBytes|authorizationHeader|rawEndpoint|endpointUrl|providerClient|networkClient|socket|callback|executablePayload|streamHandle|hermesRuntime|mcpRuntime|agentRuntime)/iu.test(
        key,
      )
    ) {
      throw new Error(`prohibited-sensitive-or-executable-field-persisted:${path}.${key}`);
    }
    inspectProhibited(child, roots, `${path}.${key}`);
  }
}

async function recursiveFiles(root: string, directory = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await recursiveFiles(root, path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

interface ArtifactEntry {
  readonly path: string;
  readonly kind: "directory" | "file";
}

async function recursiveArtifactEntries(root: string, directory = ""): Promise<ArtifactEntry[]> {
  const result: ArtifactEntry[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push({ path, kind: "directory" });
      result.push(...(await recursiveArtifactEntries(root, path)));
    } else if (entry.isFile()) {
      result.push({ path, kind: "file" });
    } else {
      throw new Error(`artifact-implementation-entry-unsafe:${path}`);
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

const LAYOUT_DIRECTORIES = new Set([
  "events",
  join("events", "genesis"),
  join("events", "registrations"),
  join("events", "replay-attempts"),
  "staging",
  "quarantine",
  "derived",
]);

function artifactClassForPath(
  path: string,
  kind: ArtifactEntry["kind"],
  currentSequence: number,
): string | "layout-directory" | null {
  if (kind === "directory") {
    if (LAYOUT_DIRECTORIES.has(path)) return "layout-directory";
    if (/^events\/(?:registrations|replay-attempts)\/\d{12}-/u.test(path)) {
      const sequence = Number(path.split("/").at(-1)!.slice(0, 12));
      return sequence > currentSequence
        ? "transitional-installed-uncommitted-orphans"
        : "layout-directory";
    }
    if (/^staging\/\d{12}-/u.test(path)) return "transitional-staging";
    if (/^quarantine\/[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(path)) {
      return "layout-directory";
    }
    return null;
  }
  if (path === "commit-head.json") return "authoritative-current-marker";
  if (path === "writer.lock") return "operational-writer-lock";
  if (path === join("derived", "HEAD.json")) return "derived-head";
  if (path === join("derived", ".HEAD.tmp") || path === join("derived", ".indexes.tmp")) {
    return "transitional-temporary-derived-material";
  }
  if (path.startsWith(`derived/`)) return "derived-index-entries-and-snapshots";
  if (/^staging\/current-\d+\.json$/u.test(path)) {
    return "transitional-temporary-marker-material";
  }
  if (path.startsWith(`staging/`)) return "transitional-staging";
  if (/^quarantine\/.+\/metadata\.json$/u.test(path)) {
    return "operational-quarantine-metadata";
  }
  if (path.startsWith(`quarantine/`)) return "operational-quarantine-material";
  if (path.startsWith(`events/genesis/`)) return "authoritative-genesis";
  if (path.endsWith("commit-marker.json")) return "authoritative-marker-archives";
  if (path.startsWith(`events/registrations/`)) {
    const sequence = Number(path.split("/")[2]?.slice(0, 12));
    if (sequence > currentSequence) return "transitional-installed-uncommitted-orphans";
    return /(?:complete-history|ledger-head)\.json$/u.test(path)
      ? "authoritative-history-and-head-components"
      : "authoritative-registration-components";
  }
  if (path.startsWith(`events/replay-attempts/`)) {
    const sequence = Number(path.split("/")[2]?.slice(0, 12));
    if (sequence > currentSequence) return "transitional-installed-uncommitted-orphans";
    return /(?:complete-history|ledger-head)\.json$/u.test(path)
      ? "authoritative-history-and-head-components"
      : "authoritative-replay-components";
  }
  return null;
}

async function normativeArtifactClasses(
  privacyPolicyPath: string,
  adapterSpecificationPath: string,
): Promise<readonly string[]> {
  const privacy = await readFile(privacyPolicyPath, "utf8");
  const adapter = await readFile(adapterSpecificationPath, "utf8");
  for (const required of [
    "Authoritative durable",
    "Derived durable",
    "Ephemeral and non-persisted",
    "installable staging envelopes",
    "logs, traces, metrics, or observability artifacts",
    "validation reports",
  ]) {
    if (!privacy.includes(required)) throw new Error("artifact-policy-inventory-incomplete");
  }
  for (const required of [
    "staging/",
    "quarantine/",
    "writer.lock",
    "temporary fixed current-marker copy",
    "installed-uncommitted orphan",
    "temporary/stale index",
  ]) {
    if (!adapter.includes(required)) throw new Error(`artifact-contract-class-missing:${required}`);
  }
  return [...DURABLE_ARTIFACT_CLASSES].sort();
}

function inspectRawBytes(bytes: string, roots: readonly string[], path: string): void {
  for (const root of roots) {
    if (root.length > 0 && bytes.includes(root)) {
      throw new Error(`prohibited-physical-path-persisted:${path}`);
    }
  }
  if (
    /(?:file:\/\/\/|[A-Za-z]:[\\/](?:Users|Windows)[\\/]|\\\\[^\\]+\\[^\\]+|api[_-]?key|credentialValue|secretValue|authorizationHeader|endpointUrl|providerPayload|validationReport|scenarioEvidence|testEvidence)/iu.test(
      bytes,
    )
  ) {
    throw new Error(`prohibited-raw-material-persisted:${path}`);
  }
}

function inspectOperationalLock(value: unknown, expectedKind: "initialization" | "writer"): void {
  const lock = record(value, "operational-lock-invalid");
  if (
    Object.keys(lock).sort().join("\0") !==
    ["acquiredAt", "lockContractVersion", "lockFingerprint", "lockKind", "processId"]
      .sort()
      .join("\0")
  ) {
    throw new Error("operational-lock-invalid");
  }
  const acquiredAt = String(lock.acquiredAt ?? "");
  const processId = Number(lock.processId);
  if (
    lock.lockContractVersion !== "1.0" ||
    lock.lockKind !== expectedKind ||
    !Number.isSafeInteger(processId) ||
    processId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(acquiredAt) ||
    new Date(acquiredAt).toISOString() !== acquiredAt
  ) {
    throw new Error("operational-lock-invalid");
  }
  const unsigned = {
    lockContractVersion: "1.0",
    lockKind: expectedKind,
    processId,
    acquiredAt,
  };
  const expectedFingerprint = createHash("sha256")
    .update("founderos.m15.local-lock.v1")
    .update("\0")
    .update(JSON.stringify(unsigned))
    .digest("hex");
  if (lock.lockFingerprint !== expectedFingerprint) {
    throw new Error("operational-lock-invalid");
  }
}

export async function inspectM15ArtifactPrivacy(
  rawInput: unknown,
): Promise<M15ArtifactPrivacyInspection> {
  const input = record(rawInput, "artifact-inspection-input-invalid");
  const classes = input.artifactClasses;
  if (!Array.isArray(classes) || canonical(classes) !== canonical(M15_TASK_1_ARTIFACT_CLASSES)) {
    throw new Error("artifact-inventory-incomplete");
  }
  const runtimeRoot = String(input.runtimeRoot ?? "");
  const repositoryRoot = String(input.repositoryRoot ?? "");
  if (input.injectedDurableArtifact !== undefined) {
    inspectProhibited(input.injectedDurableArtifact, [runtimeRoot, repositoryRoot]);
  }
  const runtimeRoots = Array.isArray(input.runtimeRoots)
    ? input.runtimeRoots.map((value) => String(value))
    : [runtimeRoot];
  if (runtimeRoots.length === 0 || runtimeRoots.some((root) => root.length === 0)) {
    throw new Error("artifact-runtime-root-inventory-invalid");
  }
  const instantiatedClasses = new Set<string>();
  const byteInspectedClasses = new Set<string>();
  const inspectedFiles: string[] = [];
  for (const [rootIndex, root] of runtimeRoots.entries()) {
    const current = JSON.parse(
      await readFile(join(root, "commit-head.json"), "utf8"),
    ) as JsonRecord;
    const currentSequence = Number(current.lastCommittedLedgerSequence);
    for (const entry of await recursiveArtifactEntries(root)) {
      const artifactClass = artifactClassForPath(entry.path, entry.kind, currentSequence);
      if (artifactClass === null) {
        throw new Error(`artifact-implementation-class-unknown:${entry.path}`);
      }
      if (artifactClass !== "layout-directory") instantiatedClasses.add(artifactClass);
      if (entry.kind === "directory") continue;
      const bytes = await readFile(join(root, entry.path), "utf8");
      inspectedFiles.push(`${rootIndex}:${entry.path}`);
      inspectRawBytes(bytes, [...runtimeRoots, repositoryRoot], entry.path);
      if (entry.path.endsWith(".json") || entry.path.endsWith(".lock")) {
        const parsed = JSON.parse(bytes);
        if (artifactClass === "operational-writer-lock") {
          inspectOperationalLock(parsed, "writer");
        } else {
          inspectProhibited(parsed, [...runtimeRoots, repositoryRoot]);
        }
      }
      if (artifactClass !== "layout-directory") byteInspectedClasses.add(artifactClass);
    }
  }
  const policyPath = String(input.privacyPolicyPath ?? "");
  const adapterSpecificationPath = String(input.adapterSpecificationPath ?? "");
  if (policyPath.length === 0 || adapterSpecificationPath.length === 0) {
    throw new Error("artifact-contract-source-inventory-incomplete");
  }
  const contractArtifactClasses = await normativeArtifactClasses(
    policyPath,
    adapterSpecificationPath,
  );
  const initializationLockPath = String(input.initializationLockPath ?? "");
  if (initializationLockPath.length > 0) {
    const bytes = await readFile(initializationLockPath, "utf8");
    inspectRawBytes(bytes, [...runtimeRoots, repositoryRoot], "initialization.lock");
    inspectOperationalLock(JSON.parse(bytes), "initialization");
    instantiatedClasses.add("operational-initialization-lock");
    byteInspectedClasses.add("operational-initialization-lock");
    inspectedFiles.push("external:initialization.lock");
  }
  const productionRoot = join(repositoryRoot, "services", "knowledge-engine", "src");
  const productionPaths = (await recursiveFiles(productionRoot)).filter((path) =>
    path.endsWith(".ts"),
  );
  let sinkCount = 0;
  for (const path of productionPaths) {
    const source = await readFile(join(productionRoot, path), "utf8");
    sinkCount += (
      source.match(
        /\b(?:console\.(?:log|info|warn|error)|logger\.|(?:writeFile|appendFile|createWriteStream)\s*\([^)]*(?:log|trace|metric|observability))\b/gu,
      ) ?? []
    ).length;
  }
  const discoveredArtifactClasses = new Set<string>(instantiatedClasses);
  const missingImplementationClasses = contractArtifactClasses.filter(
    (artifactClass) => !discoveredArtifactClasses.has(artifactClass),
  );
  if (missingImplementationClasses.length > 0) {
    throw new Error(`artifact-contract-class-not-instantiated:${missingImplementationClasses[0]}`);
  }
  const unknownImplementationClasses = [...discoveredArtifactClasses].filter(
    (artifactClass) => !contractArtifactClasses.includes(artifactClass),
  );
  if (unknownImplementationClasses.length > 0) {
    throw new Error(`artifact-implementation-class-unknown:${unknownImplementationClasses[0]}`);
  }
  return {
    inventoriedClasses: [...M15_TASK_1_ARTIFACT_CLASSES],
    inspectedDurableFiles: inspectedFiles,
    absentTransitionalClasses: [],
    productionObservabilityPersistenceSinkCount: sinkCount,
    contractArtifactClasses: [...contractArtifactClasses].sort(),
    discoveredArtifactClasses: [...discoveredArtifactClasses].sort(),
    instantiatedArtifactClasses: [...instantiatedClasses].sort(),
    byteInspectedArtifactClasses: [...byteInspectedClasses].sort(),
  };
}

interface StrictSchema {
  parse(value: unknown): unknown;
}

function rejects(schema: StrictSchema, value: unknown): boolean {
  try {
    schema.parse(value);
    return false;
  } catch {
    return true;
  }
}

const PUBLIC_PATH_LIKE_VALUES = Object.freeze([
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
]);

type PublicOutputPathSegment = string | number;

interface PublicOutputAllowedPathFieldLocation {
  readonly sampleIndex: number;
  readonly path: readonly PublicOutputPathSegment[];
  readonly expectedBehavior: "reject" | "redact";
}

function publicOutputFieldPath(path: readonly PublicOutputPathSegment[]): string {
  return path.reduce<string>(
    (label, segment) =>
      typeof segment === "number" ? `${label}[${segment}]` : `${label}.${segment}`,
    "$",
  );
}

function publicOutputPathParent(
  value: unknown,
  path: readonly PublicOutputPathSegment[],
): { parent: JsonRecord | unknown[]; segment: PublicOutputPathSegment } {
  if (path.length === 0) throw new Error("public-output-path-field-location-invalid");
  let current = value;
  for (const segment of path.slice(0, -1)) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || !Number.isInteger(segment) || !(segment in current)) {
        throw new Error("public-output-path-field-location-missing");
      }
      current = current[segment];
    } else {
      const currentRecord = record(current, "public-output-path-field-location-missing");
      if (!Object.hasOwn(currentRecord, segment)) {
        throw new Error("public-output-path-field-location-missing");
      }
      current = currentRecord[segment];
    }
  }
  const last = path.at(-1)!;
  if (typeof last === "number") {
    if (!Array.isArray(current) || !Number.isInteger(last) || !(last in current)) {
      throw new Error("public-output-path-field-location-missing");
    }
    return { parent: current, segment: last };
  }
  const parent = record(current, "public-output-path-field-location-missing");
  if (!Object.hasOwn(parent, last)) {
    throw new Error("public-output-path-field-location-missing");
  }
  return { parent, segment: last };
}

function publicOutputPathValue(value: unknown, path: readonly PublicOutputPathSegment[]): unknown {
  const { parent, segment } = publicOutputPathParent(value, path);
  return parent[segment as never];
}

function setPublicOutputPathValue(
  parent: JsonRecord | unknown[],
  segment: PublicOutputPathSegment,
  value: unknown,
): void {
  if (Array.isArray(parent)) {
    if (typeof segment !== "number") throw new Error("public-output-path-field-location-invalid");
    parent[segment] = value;
    return;
  }
  if (typeof segment !== "string") throw new Error("public-output-path-field-location-invalid");
  parent[segment] = value;
}

function mutateDeclaredPublicOutputField(
  sample: unknown,
  path: readonly PublicOutputPathSegment[],
  pathLike: string,
): unknown {
  const forbiddenTarget = path.at(-1);
  if (
    typeof forbiddenTarget === "string" &&
    ["status", "replayAppendStatus", "derivedStateStatus", "resultContractVersion"].includes(
      forbiddenTarget,
    )
  ) {
    throw new Error(
      `public-output-path-field-discriminator-forbidden:${publicOutputFieldPath(path)}`,
    );
  }
  const originalValue = publicOutputPathValue(sample, path);
  if (typeof originalValue !== "string") {
    throw new Error(`public-output-path-field-not-text:${publicOutputFieldPath(path)}`);
  }
  const mutation = structuredClone(sample);
  const target = publicOutputPathParent(mutation, path);
  setPublicOutputPathValue(target.parent, target.segment, pathLike);
  if (publicOutputPathValue(mutation, path) !== pathLike) {
    throw new Error(`public-output-path-field-not-reached:${publicOutputFieldPath(path)}`);
  }
  const restored = structuredClone(mutation);
  const restoredTarget = publicOutputPathParent(restored, path);
  setPublicOutputPathValue(restoredTarget.parent, restoredTarget.segment, originalValue);
  if (canonical(restored) !== canonical(sample)) {
    throw new Error(
      `public-output-path-mutation-changed-unrelated-field:${publicOutputFieldPath(path)}`,
    );
  }
  return mutation;
}

function declaredAllowedPathFieldLocations(
  entry: JsonRecord,
): readonly PublicOutputAllowedPathFieldLocation[] {
  const rawLocations = entry.allowedPathFieldLocations;
  const disposition = entry.noPathCapableFieldDisposition;
  const outputName = String(entry.name);
  if (rawLocations !== undefined && disposition !== undefined) {
    throw new Error(`public-output-path-field-declaration-ambiguous:${outputName}`);
  }
  if (rawLocations === undefined) {
    if (typeof disposition !== "string" || disposition.length < 20) {
      throw new Error(`public-output-path-field-declaration-missing:${outputName}`);
    }
    return [];
  }
  if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
    throw new Error(`public-output-path-field-declaration-missing:${outputName}`);
  }
  const locations = rawLocations.map((rawLocation) => {
    const location = record(rawLocation, "public-output-path-field-location-invalid");
    if (
      !Number.isInteger(location.sampleIndex) ||
      Number(location.sampleIndex) < 0 ||
      !Array.isArray(location.path) ||
      location.path.length === 0 ||
      location.path.some(
        (segment) =>
          (typeof segment !== "string" || segment.length === 0) &&
          (typeof segment !== "number" || !Number.isInteger(segment) || segment < 0),
      ) ||
      !["reject", "redact"].includes(String(location.expectedBehavior)) ||
      Object.keys(location).sort().join("\0") !==
        ["expectedBehavior", "path", "sampleIndex"].sort().join("\0")
    ) {
      throw new Error(`public-output-path-field-location-invalid:${outputName}`);
    }
    return {
      sampleIndex: Number(location.sampleIndex),
      path: location.path as PublicOutputPathSegment[],
      expectedBehavior: location.expectedBehavior as "reject" | "redact",
    };
  });
  const keys = locations.map(
    (location) => `${location.sampleIndex}:${publicOutputFieldPath(location.path)}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error(`public-output-path-field-location-duplicate:${outputName}`);
  }
  return locations;
}

function parsedTypeScriptSource(path: string): ts.SourceFile {
  const source = requireSource(path);
  const diagnostics = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: path,
    reportDiagnostics: true,
  }).diagnostics;
  if (diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error(`public-output-typescript-parse-failed:${path}`);
  }
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  return parsed;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
        false)
    : false;
}

function discoverExportedOutputSchemas(schemaSourcePath: string): readonly string[] {
  const source = parsedTypeScriptSource(schemaSourcePath);
  const outputSurface =
    /(?:Result|Status|Report|Page|PageMetadata|ListItem|Output|Initialization|Validation)Schema$/u;
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && outputSurface.test(declaration.name.text)) {
        names.push(declaration.name.text);
      }
    }
  }
  return names.sort();
}

function deriveNormativeOutputInventory(input: JsonRecord): readonly string[] {
  const sourcePaths = [
    String(input.privacyPolicyPath ?? ""),
    String(input.architectureSpecificationPath ?? ""),
    String(input.acceptanceCriteriaPath ?? ""),
  ];
  if (sourcePaths.some((path) => path.length === 0)) {
    throw new Error("public-output-contract-source-inventory-incomplete");
  }
  const specification = sourcePaths
    .map((path) => requireSource(path))
    .join("\n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ");
  for (const [, phrase] of M15_NORMATIVE_OUTPUT_SPECIFICATION_BINDINGS) {
    const normalizedPhrase = phrase.toLowerCase().replace(/[^a-z0-9]+/gu, " ");
    if (!specification.includes(normalizedPhrase)) {
      throw new Error(`public-output-contract-class-missing:${phrase}`);
    }
  }
  return M15_NORMATIVE_OUTPUT_SPECIFICATION_BINDINGS.map(([name]) => name).sort();
}

function sortedFunctionKeys(value: unknown): readonly string[] {
  const namespace = record(value, "public-output-runtime-namespace-invalid");
  return Object.entries(namespace)
    .filter(([, member]) => typeof member === "function")
    .map(([name]) => name)
    .sort();
}

function verifyRuntimeSurfaceDiscovery(input: JsonRecord): {
  readonly facadeExports: readonly string[];
  readonly facadeMethods: readonly string[];
  readonly preflightExports: readonly string[];
} {
  const facadeNamespace = record(
    input.facadeNamespace,
    "public-output-facade-namespace-incomplete",
  );
  const facadeExports = Object.entries(facadeNamespace)
    .filter(
      ([name, member]) =>
        typeof member === "function" &&
        /Readiness/u.test(name) &&
        /(?:open|initializ|result|status|report|page|validation)/iu.test(name),
    )
    .map(([name]) => name)
    .sort();
  if (
    canonical(facadeExports) !==
    canonical(Object.keys(M15_PUBLIC_FACADE_EXPORT_DISPOSITIONS).sort())
  ) {
    throw new Error("public-output-facade-export-unclassified");
  }

  const entries = input.entries;
  if (!Array.isArray(entries)) throw new Error("public-output-entry-inventory-incomplete");
  const facadeEntry = entries
    .map((entry) => record(entry))
    .find((entry) => entry.documentedException === "governed-non-data-facade");
  if (!Array.isArray(facadeEntry?.samples) || facadeEntry.samples.length !== 1) {
    throw new Error("public-output-facade-exception-invalid");
  }
  const facadeMethods = sortedFunctionKeys(facadeEntry.samples[0]);
  if (
    canonical(facadeMethods) !==
    canonical(Object.keys(M15_FACADE_METHOD_OUTPUT_CLASSIFICATIONS).sort())
  ) {
    throw new Error("public-output-facade-method-unclassified");
  }

  const preflightNamespace = record(
    input.preflightNamespace,
    "public-output-preflight-namespace-incomplete",
  );
  const preflightExports = Object.keys(preflightNamespace).sort();
  if (
    canonical(preflightExports) !== canonical(Object.keys(M15_PREFLIGHT_EXPORT_DISPOSITIONS).sort())
  ) {
    throw new Error("public-output-preflight-export-unclassified");
  }
  return { facadeExports, facadeMethods, preflightExports };
}

function structuralCommitmentInspection(
  input: JsonRecord,
  outputSchemaNames: readonly string[],
): {
  readonly domainDefinitionCount: number;
  readonly callSiteCount: number;
  readonly outputImportCount: number;
} {
  const commitmentSourcePath = String(input.commitmentSourcePath ?? "");
  const source = parsedTypeScriptSource(commitmentSourcePath);
  let domainDefinitions: Readonly<Record<string, string>> | null = null;
  const importedSchemaNames = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "@founderos/knowledge-schema" &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        importedSchemaNames.add((element.propertyName ?? element.name).text);
      }
    }
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "M15_COMMITMENT_DOMAINS" ||
        declaration.initializer === undefined ||
        !ts.isCallExpression(declaration.initializer) ||
        declaration.initializer.arguments.length !== 1
      ) {
        continue;
      }
      let candidate = declaration.initializer.arguments[0];
      while (
        candidate !== undefined &&
        (ts.isAsExpression(candidate) || ts.isParenthesizedExpression(candidate))
      ) {
        candidate = candidate.expression;
      }
      if (candidate === undefined || !ts.isObjectLiteralExpression(candidate)) {
        throw new Error("public-output-commitment-domain-definition-invalid");
      }
      domainDefinitions = Object.fromEntries(
        candidate.properties.map((property) => {
          if (
            !ts.isPropertyAssignment(property) ||
            !ts.isIdentifier(property.name) ||
            !ts.isStringLiteral(property.initializer)
          ) {
            throw new Error("public-output-commitment-domain-definition-invalid");
          }
          return [property.name.text, property.initializer.text];
        }),
      );
    }
  }
  if (domainDefinitions === null) {
    throw new Error("public-output-commitment-domain-definition-missing");
  }
  if (canonical(domainDefinitions) !== canonical(record(input.commitmentDomains ?? {}))) {
    throw new Error("public-output-commitment-domain-runtime-mismatch");
  }

  const outputTypeNames = new Set(
    outputSchemaNames.flatMap((name) => [name, name.endsWith("Schema") ? name.slice(0, -6) : name]),
  );
  const outputImportCount = [...importedSchemaNames].filter((name) =>
    outputTypeNames.has(name),
  ).length;
  if (outputImportCount > 0) throw new Error("public-output-commitment-imported");

  const domainReferences = new Set<string>();
  const commitmentEnclosingFunctions = new Set<string>();
  const directFingerprintCallers = new Set<string>();
  let callSiteCount = 0;
  const visit = (node: ts.Node, enclosingFunction: string | null): void => {
    let nextEnclosingFunction = enclosingFunction;
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      nextEnclosingFunction = node.name.text;
    }
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : null;
      if (callee === "fingerprintReadinessCommitment") {
        if (nextEnclosingFunction === null) {
          throw new Error("public-output-commitment-call-site-unbounded");
        }
        directFingerprintCallers.add(nextEnclosingFunction);
      }
      if (callee === "signed" || callee === "assertFingerprint") {
        callSiteCount += 1;
        if (nextEnclosingFunction !== null) commitmentEnclosingFunctions.add(nextEnclosingFunction);
        const findDomainReferences = (candidate: ts.Node): void => {
          if (
            ts.isPropertyAccessExpression(candidate) &&
            ts.isIdentifier(candidate.expression) &&
            candidate.expression.text === "M15_COMMITMENT_DOMAINS"
          ) {
            domainReferences.add(candidate.name.text);
          }
          candidate.forEachChild(findDomainReferences);
        };
        node.arguments.forEach(findDomainReferences);
      }
    }
    node.forEachChild((child) => visit(child, nextEnclosingFunction));
  };
  visit(source, null);
  if (callSiteCount === 0) throw new Error("public-output-commitment-call-sites-missing");
  const unknownDomains = [...domainReferences].filter((name) => !(name in domainDefinitions!));
  if (unknownDomains.length > 0) throw new Error("public-output-commitment-domain-unknown");
  const unusedDomains = Object.keys(domainDefinitions).filter(
    (name) => !domainReferences.has(name),
  );
  if (unusedDomains.length > 0) throw new Error("public-output-commitment-domain-untraced");
  if (
    canonical([...directFingerprintCallers].sort()) !== canonical(["assertFingerprint", "signed"])
  ) {
    throw new Error("public-output-commitment-direct-call-site-unclassified");
  }
  const outputConstructors = new Set(outputSchemaNames.map((name) => name.replace(/Schema$/u, "")));
  if ([...commitmentEnclosingFunctions].some((name) => outputConstructors.has(name))) {
    throw new Error("public-output-commitment-call-site-found");
  }
  const productionSourcePaths = input.productionSourcePaths;
  if (!Array.isArray(productionSourcePaths) || productionSourcePaths.length === 0) {
    throw new Error("public-output-production-source-inventory-incomplete");
  }
  for (const rawPath of productionSourcePaths) {
    const path = String(rawPath);
    if (path === commitmentSourcePath) continue;
    const candidate = parsedTypeScriptSource(path);
    const inspectExternalUse = (node: ts.Node): void => {
      if (
        ts.isImportSpecifier(node) &&
        (node.propertyName ?? node.name).text === "fingerprintReadinessCommitment"
      ) {
        throw new Error("public-output-commitment-call-site-outside-domain");
      }
      node.forEachChild(inspectExternalUse);
    };
    inspectExternalUse(candidate);
  }
  return {
    domainDefinitionCount: Object.keys(domainDefinitions).length,
    callSiteCount,
    outputImportCount,
  };
}

export function verifyM15PublicOutputInventory(rawInput: unknown): M15PublicOutputInspection {
  const input = record(rawInput, "public-output-inspection-input-invalid");
  const contractOutputNames = deriveNormativeOutputInventory(input);
  if (
    !Array.isArray(input.inventory) ||
    canonical([...input.inventory].sort()) !== canonical(contractOutputNames)
  ) {
    throw new Error("public-output-inventory-incomplete");
  }
  if (input.injectedDurableArtifact !== undefined) {
    const injected = record(input.injectedDurableArtifact);
    if (
      "derivedStateStatus" in injected ||
      "replayAppendStatus" in injected ||
      "validationReport" in injected ||
      ("status" in injected &&
        ["committed", "rejected", "recorded", "not-recorded", "rebuilt", "not-rebuilt"].includes(
          String(injected.status),
        ))
    ) {
      throw new Error("ephemeral-public-output-persisted");
    }
  }
  const entries = input.entries;
  if (!Array.isArray(entries)) throw new Error("public-output-entry-inventory-incomplete");
  const names = entries.map((entry) => String(record(entry).name));
  if (canonical([...names].sort()) !== canonical(contractOutputNames)) {
    throw new Error("public-output-entry-inventory-incomplete");
  }
  const schemaSourcePath = String(input.schemaSourcePath ?? "");
  if (schemaSourcePath.length === 0) throw new Error("public-output-schema-source-missing");
  const discoveredSchemaSurfaceNames = discoverExportedOutputSchemas(schemaSourcePath);
  const contractSchemaOutputNames = contractOutputNames.filter((name) => name.endsWith("Schema"));
  const classifiedSchemaSurfaceNames = new Set([
    ...contractSchemaOutputNames,
    ...Object.keys(M15_NON_EPHEMERAL_PUBLIC_SCHEMA_SURFACE_DISPOSITIONS),
  ]);
  if (
    discoveredSchemaSurfaceNames.some((name) => !classifiedSchemaSurfaceNames.has(name)) ||
    contractSchemaOutputNames.some((name) => !discoveredSchemaSurfaceNames.includes(name))
  ) {
    throw new Error(`public-output-inventory-incomplete:${discoveredSchemaSurfaceNames.join(",")}`);
  }
  const discoveredOutputNames = discoveredSchemaSurfaceNames.filter((name) =>
    contractSchemaOutputNames.includes(name),
  );
  const runtimeSurfaces = verifyRuntimeSurfaceDiscovery(input);
  discoveredOutputNames.push(
    "LocalFileReadinessEvaluationLedgerOpenFacade",
    "Milestone15ImplementationPreflightValidationResult",
  );
  discoveredOutputNames.sort();
  if (canonical(discoveredOutputNames) !== canonical(contractOutputNames)) {
    throw new Error(`public-output-inventory-incomplete:${discoveredOutputNames.join(",")}`);
  }
  const commitmentInspection = structuralCommitmentInspection(input, contractSchemaOutputNames);
  const persisted = Array.isArray(input.persistedFiles)
    ? input.persistedFiles.map((file) => String(record(file).bytes)).join("\n")
    : "";
  let variantCount = 0;
  let persistedMatches = 0;
  let rejectedPathLikeMutationCount = 0;
  const exactPathFieldCoverage: NonNullable<
    M15PublicOutputInspection["exactPathFieldCoverage"]
  >[number][] = [];
  const noPathCapableFieldDispositions: NonNullable<
    M15PublicOutputInspection["noPathCapableFieldDispositions"]
  >[number][] = [];
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const outputName = String(entry.name);
    const allowedPathFieldLocations = declaredAllowedPathFieldLocations(entry);
    if (allowedPathFieldLocations.length === 0) {
      noPathCapableFieldDispositions.push({
        outputName,
        disposition: String(entry.noPathCapableFieldDisposition),
      });
    }
    if (entry.documentedException === "governed-non-data-facade") {
      if (!Array.isArray(entry.samples) || entry.samples.length !== 1) {
        throw new Error("public-output-facade-exception-invalid");
      }
      variantCount += 1;
      continue;
    }
    const schema = record(entry.schema) as unknown as StrictSchema;
    if (
      typeof schema.parse !== "function" ||
      !Array.isArray(entry.samples) ||
      entry.samples.length === 0
    ) {
      throw new Error(`public-output-variant-inventory-incomplete:${String(entry.name)}`);
    }
    for (const location of allowedPathFieldLocations) {
      const sample = entry.samples[location.sampleIndex];
      if (sample === undefined) {
        throw new Error(
          `public-output-path-field-sample-missing:${outputName}:${location.sampleIndex}`,
        );
      }
      const fieldPath = publicOutputFieldPath(location.path);
      let reachedMutationCount = 0;
      let rejectedMutationCount = 0;
      let redactedMutationCount = 0;
      for (const pathLike of PUBLIC_PATH_LIKE_VALUES) {
        const mutation = mutateDeclaredPublicOutputField(sample, location.path, pathLike);
        reachedMutationCount += 1;
        let parsedMutation: unknown;
        let rejected = false;
        try {
          parsedMutation = schema.parse(mutation);
        } catch {
          rejected = true;
        }
        if (location.expectedBehavior === "reject") {
          if (!rejected) {
            throw new Error(`public-output-path-redaction-failed:${outputName}:${fieldPath}`);
          }
          rejectedMutationCount += 1;
          rejectedPathLikeMutationCount += 1;
          continue;
        }
        if (rejected) {
          throw new Error(`public-output-path-redaction-rejected:${outputName}:${fieldPath}`);
        }
        let retainedPathLike = false;
        try {
          retainedPathLike = publicOutputPathValue(parsedMutation, location.path) === pathLike;
        } catch {
          // An unreadable mutated path is not retained in the public output.
        }
        if (retainedPathLike) {
          throw new Error(`public-output-path-redaction-failed:${outputName}:${fieldPath}`);
        }
        redactedMutationCount += 1;
      }
      exactPathFieldCoverage.push({
        outputName,
        sampleIndex: location.sampleIndex,
        fieldPath,
        expectedBehavior: location.expectedBehavior,
        reachedMutationCount,
        rejectedMutationCount,
        redactedMutationCount,
      });
    }
    for (const sample of entry.samples) {
      const parsed = schema.parse(sample);
      if (canonical(parsed) !== canonical(sample)) {
        throw new Error(`public-output-valid-variant-changed:${String(entry.name)}`);
      }
      variantCount += 1;
      const mutations =
        sample !== null && typeof sample === "object" && !Array.isArray(sample)
          ? [
              { ...record(sample), unknownTask1Field: true },
              { ...record(sample), physicalPath: "/private/tmp/task-1" },
              { ...record(sample), resultFingerprint: "a".repeat(64) },
            ]
          : [
              { value: sample, unknownTask1Field: true },
              { value: sample, physicalPath: "/private/tmp/task-1" },
              { value: sample, resultFingerprint: "a".repeat(64) },
            ];
      if (mutations.some((mutation) => !rejects(schema, mutation))) {
        throw new Error(`public-output-strictness-failed:${String(entry.name)}`);
      }
      if (sample !== null && typeof sample === "object" && !Array.isArray(sample)) {
        const sampleRecord = record(sample);
        for (const [key, value] of Object.entries(sampleRecord)) {
          if (Array.isArray(value)) {
            const boundedMutation = {
              ...sampleRecord,
              [key]: Array.from({ length: 10_001 }, () => null),
            };
            if (!rejects(schema, boundedMutation)) {
              throw new Error(`public-output-bound-missing:${String(entry.name)}:${key}`);
            }
          }
        }
        if (persisted.includes(canonical(sample))) persistedMatches += 1;
      } else if (
        (entry.name === "ReadinessReplayAppendStatusSchema" &&
          persisted.includes('"replayAppendStatus"')) ||
        (entry.name === "ReadinessDerivedStateStatusSchema" &&
          persisted.includes('"derivedStateStatus"'))
      ) {
        persistedMatches += 1;
      }
    }
  }
  return {
    inventoriedSchemaNames: [...M15_TASK_1_PUBLIC_OUTPUT_SCHEMAS],
    inspectedVariantCount: variantCount,
    persistedEnvelopeMatchCount: persistedMatches,
    publicCommitmentDomainCount: commitmentInspection.outputImportCount,
    contractOutputNames,
    discoveredOutputNames,
    rejectedPathLikeMutationCount,
    requiredPathMatrixValueCount: PUBLIC_PATH_LIKE_VALUES.length,
    exactPathFieldCoverage,
    noPathCapableFieldDispositions,
    discoveredFacadeExportNames: runtimeSurfaces.facadeExports,
    discoveredFacadeMethodNames: runtimeSurfaces.facadeMethods,
    discoveredPreflightExportNames: runtimeSurfaces.preflightExports,
    commitmentDomainDefinitionCount: commitmentInspection.domainDefinitionCount,
    commitmentCallSiteCount: commitmentInspection.callSiteCount,
    commitmentOutputImportCount: commitmentInspection.outputImportCount,
  };
}

function requireSource(path: string): string {
  // The output inventory verifier is synchronous so scenario execution can use
  // it as one atomic mutation-sensitive assertion boundary.
  return readFileSync(path, "utf8");
}
