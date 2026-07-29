import {
  CommittedRegistryTransactionEnvelopeSchema,
  DurableAuditRecordSchema,
  DurableSnapshotManifestEvidenceSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type ActivationAuditRecord,
  type CommittedRegistryTransactionEnvelope,
  type DurableAuditRecord,
  type DurableGovernedChangeSetRecord,
  type DurableLifecycleTransitionRecord,
  type DurablePreviousRecordFingerprint,
  type DurableReviewDecisionRecord,
  type DurableSnapshotRegistrationRecord,
  type KnowledgeRepositorySnapshot,
  type KnowledgeRepositorySnapshotObject,
  type KnowledgeSnapshotObjectComparisonEvidence,
  type RegistryIntegrityIssue,
  type RegistryDerivedIndexStatus,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
  type RegistryTransactionType,
  type SnapshotLifecycleStatus,
} from "@founderos/knowledge-schema";

import {
  createCanonicalSha256Fingerprint,
  createDurableCanonicalJsonSha256Fingerprint,
  createKnowledgeObjectContentFingerprint,
  serializeCanonicalValue,
} from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

const GENESIS = "genesis" as const;
const DURABLE_RECORD_TYPES = {
  activation_audit: true,
  governed_change_set: true,
  lifecycle_transition: true,
  review_decision: true,
  snapshot_registration: true,
} as const satisfies Readonly<Record<DurableAuditRecord["recordType"], true>>;
const INVALID_RAW_DURABLE_RECORD_MESSAGE =
  "Durable audit record must be a plain object with a valid own enumerable data recordType property";
const PLACEHOLDER_FINGERPRINT = "0".repeat(64);

export type DurableRegistryErrorLocation = Readonly<{
  recordId?: string | null;
  sequence?: number | null;
  transactionId?: string | null;
}>;

export interface DurableRegistryReplayProgress {
  readonly activationCount: number;
  readonly committedRecordCount: number;
  readonly committedTransactionCount: number;
  readonly decisionCount: number;
  readonly lastCommittedAuditSequence: number;
  readonly lastRecordFingerprint: DurablePreviousRecordFingerprint;
  readonly lifecycleTransitionCount: number;
  readonly registeredSnapshotCount: number;
}

const EMPTY_REPLAY_PROGRESS: DurableRegistryReplayProgress = {
  activationCount: 0,
  committedRecordCount: 0,
  committedTransactionCount: 0,
  decisionCount: 0,
  lastCommittedAuditSequence: 0,
  lastRecordFingerprint: GENESIS,
  lifecycleTransitionCount: 0,
  registeredSnapshotCount: 0,
};

export class DurableRegistryError extends Error {
  public readonly code: string;
  public readonly recordId: string | null;
  public readonly sequence: number | null;
  public readonly transactionId: string | null;

  public constructor(code: string, message: string, location: DurableRegistryErrorLocation = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.transactionId = location.transactionId ?? null;
    this.recordId = location.recordId ?? null;
    this.sequence = location.sequence ?? null;
  }
}

export class DurableRegistryValidationError extends DurableRegistryError {}

export class DurableRegistryConflictError extends DurableRegistryError {}

export class DurableRegistryIntegrityError extends DurableRegistryError {
  public readonly progress: DurableRegistryReplayProgress;

  public constructor(
    code: string,
    message: string,
    location: DurableRegistryErrorLocation = {},
    progress: DurableRegistryReplayProgress = EMPTY_REPLAY_PROGRESS,
  ) {
    super(code, message, location);
    this.progress = { ...progress };
  }
}

interface SchemaIssue {
  readonly message: string;
  readonly path: readonly PropertyKey[];
}

function schemaValidationMessage(issues: readonly SchemaIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}

export function serializeCanonicalDurablePayload(value: unknown): string {
  return serializeCanonicalValue(value);
}

function withoutProperty(value: object, property: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== property));
}

function hasCanonicalContainerStructure(
  value: unknown,
  ancestors = new WeakSet<object>(),
): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;

  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  const array = Array.isArray(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  ) {
    return false;
  }

  ancestors.add(value);
  for (const key of keys) {
    if (array && key === "length") continue;
    if (typeof key !== "string") return false;
    if (array) {
      const index = Number(key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= value.length ||
        String(index) !== key
      ) {
        return false;
      }
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return false;
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor) ||
      !hasCanonicalContainerStructure(descriptor.value, ancestors)
    ) {
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

function canonicalRepresentationsMatch(raw: unknown, parsed: unknown): boolean {
  try {
    return serializeCanonicalValue(raw) === serializeCanonicalValue(parsed);
  } catch {
    return false;
  }
}

type BuilderValuePosition = "array" | "object" | "root";

function invalidBuilderCanonicalValue(): never {
  throw new DurableRegistryValidationError(
    "invalid_durable_record",
    "Cannot create durable audit record from non-canonical container properties",
  );
}

function projectBuilderCanonicalValue(
  value: unknown,
  omitUndefinedObjectProperties: boolean,
  position: BuilderValuePosition = "root",
  ancestors = new WeakSet<object>(),
): unknown {
  if (value === undefined) {
    if (position === "object") return undefined;
    return invalidBuilderCanonicalValue();
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : invalidBuilderCanonicalValue();
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return invalidBuilderCanonicalValue();
  }

  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    return invalidBuilderCanonicalValue();
  }
  const array = Array.isArray(value);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  ) {
    return invalidBuilderCanonicalValue();
  }

  ancestors.add(value);
  if (array) {
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string") return invalidBuilderCanonicalValue();
      const index = Number(key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= value.length ||
        String(index) !== key
      ) {
        return invalidBuilderCanonicalValue();
      }
    }
    const projected: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      } catch {
        return invalidBuilderCanonicalValue();
      }
      if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
        return invalidBuilderCanonicalValue();
      }
      projected.push(
        projectBuilderCanonicalValue(
          descriptor.value,
          omitUndefinedObjectProperties,
          "array",
          ancestors,
        ),
      );
    }
    ancestors.delete(value);
    return projected;
  }

  const projected = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string" || key === "__proto__") {
      return invalidBuilderCanonicalValue();
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return invalidBuilderCanonicalValue();
    }
    if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
      return invalidBuilderCanonicalValue();
    }
    if (descriptor.value === undefined && omitUndefinedObjectProperties) continue;
    Object.defineProperty(projected, key, {
      configurable: true,
      enumerable: true,
      value: projectBuilderCanonicalValue(
        descriptor.value,
        omitUndefinedObjectProperties,
        "object",
        ancestors,
      ),
      writable: true,
    });
  }
  ancestors.delete(value);
  return projected;
}

export function createDurableAuditRecordFingerprint(
  record: DurableAuditRecord | Omit<DurableAuditRecord, "recordFingerprint">,
): string {
  return createCanonicalSha256Fingerprint(withoutProperty(record, "recordFingerprint"));
}

/** SHA-256 over the canonical parsed manifest-evidence value, including its reference binding. */
export function createDurableSnapshotManifestFingerprint(
  evidence: DurableSnapshotRegistrationRecord["manifestEvidence"],
): string {
  return createDurableCanonicalJsonSha256Fingerprint(evidence);
}

export function createCommittedRegistryTransactionEnvelopeFingerprint(
  envelope:
    | CommittedRegistryTransactionEnvelope
    | Omit<CommittedRegistryTransactionEnvelope, "envelopeFingerprint">,
): string {
  return createCanonicalSha256Fingerprint(withoutProperty(envelope, "envelopeFingerprint"));
}

export type UnsignedDurableAuditRecord<T extends DurableAuditRecord = DurableAuditRecord> =
  T extends DurableAuditRecord ? Omit<T, "recordFingerprint"> : never;

export type DurableAuditRecordContent<T extends DurableAuditRecord = DurableAuditRecord> =
  T extends DurableAuditRecord
    ? Omit<T, "previousRecordFingerprint" | "recordFingerprint" | "sequence" | "transactionId">
    : never;

export function createDurableAuditRecord<T extends DurableAuditRecord>(
  input: UnsignedDurableAuditRecord<T>,
): T {
  const captured = projectBuilderCanonicalValue(input, false) as UnsignedDurableAuditRecord<T>;
  const candidate = {
    ...captured,
    recordFingerprint: PLACEHOLDER_FINGERPRINT,
  };
  const normalized = DurableAuditRecordSchema.safeParse(candidate);
  if (!normalized.success) {
    throw new DurableRegistryValidationError(
      "invalid_durable_record",
      `Cannot create durable audit record: ${schemaValidationMessage(normalized.error.issues)}`,
      rawRecordLocation(candidate),
    );
  }
  const projected = projectBuilderCanonicalValue(normalized.data, true) as DurableAuditRecord;
  const { recordFingerprint: _recordFingerprint, ...unsigned } = projected;
  void _recordFingerprint;
  if (
    unsigned.recordType === "snapshot_registration" &&
    createDurableSnapshotManifestFingerprint(unsigned.manifestEvidence) !==
      unsigned.manifestFingerprint
  ) {
    throw new DurableRegistryValidationError(
      "manifest_fingerprint_mismatch",
      "Snapshot registration manifest fingerprint does not match canonical manifest evidence",
      rawRecordLocation(unsigned),
    );
  }
  const finalized = {
    ...unsigned,
    recordFingerprint: createDurableAuditRecordFingerprint(unsigned),
  };
  const result = DurableAuditRecordSchema.safeParse(finalized);
  if (!result.success) {
    throw new DurableRegistryValidationError(
      "invalid_durable_record",
      `Cannot create durable audit record: ${schemaValidationMessage(result.error.issues)}`,
      rawRecordLocation(finalized),
    );
  }
  return deepFreeze(result.data as T);
}

export interface CreateCommittedRegistryTransactionEnvelopeInput {
  readonly committedAt: string;
  readonly records: readonly DurableAuditRecord[];
  readonly transactionId: string;
  readonly transactionType: RegistryTransactionType;
}

export function createCommittedRegistryTransactionEnvelope(
  input: CreateCommittedRegistryTransactionEnvelopeInput,
): CommittedRegistryTransactionEnvelope {
  if (input.records.length === 0) {
    throw new DurableRegistryValidationError(
      "empty_transaction_envelope",
      "A committed registry transaction must contain at least one durable record",
      { transactionId: input.transactionId },
    );
  }

  const records = input.records.map((record) => {
    try {
      return verifyDurableAuditRecordFingerprint(record);
    } catch (error) {
      if (error instanceof DurableRegistryError) {
        throw new DurableRegistryValidationError(error.code, error.message, error);
      }
      throw error;
    }
  });
  const first = records[0]!;
  const last = records.at(-1)!;
  const unsigned = {
    schemaVersion: "1.0" as const,
    status: "committed" as const,
    transactionType: input.transactionType,
    transactionId: input.transactionId,
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    previousRecordFingerprint: first.previousRecordFingerprint,
    lastRecordFingerprint: last.recordFingerprint,
    recordCount: records.length,
    records,
    committedAt: input.committedAt,
  };
  const candidate = {
    ...unsigned,
    envelopeFingerprint: PLACEHOLDER_FINGERPRINT,
  };
  const normalized = CommittedRegistryTransactionEnvelopeSchema.safeParse(candidate);
  if (!normalized.success) {
    throw new DurableRegistryValidationError(
      "invalid_transaction_envelope",
      `Cannot create committed registry transaction: ${schemaValidationMessage(normalized.error.issues)}`,
      { transactionId: input.transactionId },
    );
  }
  const { envelopeFingerprint: _envelopeFingerprint, ...normalizedUnsigned } = normalized.data;
  void _envelopeFingerprint;
  const result = CommittedRegistryTransactionEnvelopeSchema.safeParse({
    ...normalizedUnsigned,
    envelopeFingerprint: createCommittedRegistryTransactionEnvelopeFingerprint(normalizedUnsigned),
  });
  if (!result.success) {
    throw new DurableRegistryValidationError(
      "invalid_transaction_envelope",
      `Cannot create committed registry transaction: ${schemaValidationMessage(result.error.issues)}`,
      { transactionId: input.transactionId },
    );
  }
  return deepFreeze(result.data);
}

function rawRecordLocation(input: unknown): DurableRegistryErrorLocation {
  if (input === null || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  return {
    transactionId: safeOwnString(record, "transactionId"),
    recordId: rawRecordId(record),
    sequence: safeOwnFiniteNumber(record, "sequence"),
  };
}

function safeOwnDataValue(record: object, field: string): unknown {
  const descriptor = ownPropertyDescriptor(record, field);
  if (descriptor === null || descriptor.enumerable !== true || !("value" in descriptor)) {
    return null;
  }
  return descriptor.value;
}

function safeOwnString(record: object, field: string): string | null {
  const value = safeOwnDataValue(record, field);
  return typeof value === "string" ? value : null;
}

function safeOwnFiniteNumber(record: object, field: string): number | null {
  const value = safeOwnDataValue(record, field);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rawRecordId(record: Record<string, unknown>): string | null {
  for (const field of [
    "registrationId",
    "transitionId",
    "decisionId",
    "changeSetId",
    "activationId",
  ] as const) {
    const value = safeOwnString(record, field);
    if (value !== null) return value;
  }
  return null;
}

function durableRecordId(record: DurableAuditRecord): string {
  switch (record.recordType) {
    case "snapshot_registration":
      return record.registrationId;
    case "lifecycle_transition":
      return record.transitionId;
    case "review_decision":
      return record.decisionId;
    case "governed_change_set":
      return record.changeSetId;
    case "activation_audit":
      return record.activationId;
  }
}

function recordLocation(record: DurableAuditRecord): DurableRegistryErrorLocation {
  return {
    transactionId: record.transactionId,
    recordId: durableRecordId(record),
    sequence: record.sequence,
  };
}

function ownPropertyDescriptor(input: object, key: string): PropertyDescriptor | null {
  try {
    return Object.getOwnPropertyDescriptor(input, key) ?? null;
  } catch {
    return null;
  }
}

function invalidRawDurableRecord(): never {
  throw new DurableRegistryIntegrityError(
    "invalid_durable_record",
    INVALID_RAW_DURABLE_RECORD_MESSAGE,
  );
}

function isDurableRecordType(value: unknown): value is DurableAuditRecord["recordType"] {
  return typeof value === "string" && Object.hasOwn(DURABLE_RECORD_TYPES, value);
}

function validateRawDurableRecordDiscriminator(input: unknown): DurableAuditRecord["recordType"] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return invalidRawDurableRecord();
  }
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(input) as object | null;
  } catch {
    return invalidRawDurableRecord();
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidRawDurableRecord();
  }

  const descriptor = ownPropertyDescriptor(input, "recordType");
  if (
    descriptor === null ||
    descriptor.enumerable !== true ||
    !("value" in descriptor) ||
    !isDurableRecordType(descriptor.value)
  ) {
    return invalidRawDurableRecord();
  }
  return descriptor.value;
}

function validateRawSnapshotRegistrationManifestEvidence(input: object): void {
  const evidenceDescriptor = ownPropertyDescriptor(input, "manifestEvidence");
  if (
    evidenceDescriptor === null ||
    evidenceDescriptor.enumerable !== true ||
    !("value" in evidenceDescriptor) ||
    !hasCanonicalContainerStructure(evidenceDescriptor.value)
  ) {
    throw new DurableRegistryIntegrityError(
      "invalid_manifest_evidence",
      "Snapshot registration manifest evidence must be finite canonical JSON",
    );
  }

  let result: ReturnType<typeof DurableSnapshotManifestEvidenceSchema.safeParse>;
  try {
    result = DurableSnapshotManifestEvidenceSchema.safeParse(evidenceDescriptor.value);
  } catch {
    throw new DurableRegistryIntegrityError(
      "invalid_manifest_evidence",
      "Snapshot registration manifest evidence must be finite canonical JSON",
    );
  }
  if (!result.success || !canonicalRepresentationsMatch(evidenceDescriptor.value, result.data)) {
    throw new DurableRegistryIntegrityError(
      "invalid_manifest_evidence",
      "Snapshot registration manifest evidence must be finite canonical JSON",
    );
  }
}

export function verifyDurableAuditRecordFingerprint(input: unknown): DurableAuditRecord {
  const rawRecordType = validateRawDurableRecordDiscriminator(input);
  if (rawRecordType === "snapshot_registration") {
    validateRawSnapshotRegistrationManifestEvidence(input as object);
  }
  if (!hasCanonicalContainerStructure(input)) {
    throw new DurableRegistryIntegrityError(
      "invalid_durable_record",
      "Durable audit record must contain only canonical plain data properties",
      rawRecordLocation(input),
    );
  }
  const fingerprintDescriptor = ownPropertyDescriptor(input as object, "recordFingerprint");
  const computedRecordFingerprint = (() => {
    try {
      return createDurableAuditRecordFingerprint(input as DurableAuditRecord);
    } catch {
      throw new DurableRegistryIntegrityError(
        "invalid_durable_record",
        "Durable audit record could not be canonically fingerprinted",
        rawRecordLocation(input),
      );
    }
  })();
  if (
    fingerprintDescriptor === null ||
    fingerprintDescriptor.enumerable !== true ||
    !("value" in fingerprintDescriptor) ||
    typeof fingerprintDescriptor.value !== "string" ||
    computedRecordFingerprint !== fingerprintDescriptor.value
  ) {
    throw new DurableRegistryIntegrityError(
      "record_fingerprint_mismatch",
      "Durable audit record fingerprint does not match its exact canonical payload",
      rawRecordLocation(input),
    );
  }
  let clonedInput: unknown;
  try {
    clonedInput = structuredClone(input);
  } catch {
    throw new DurableRegistryIntegrityError(
      "invalid_durable_record",
      "Durable audit record could not be defensively cloned for verification",
    );
  }
  const result = DurableAuditRecordSchema.safeParse(clonedInput);
  if (!result.success) {
    throw new DurableRegistryIntegrityError(
      "invalid_durable_record",
      `Durable audit record schema validation failed: ${schemaValidationMessage(result.error.issues)}`,
      rawRecordLocation(clonedInput),
    );
  }
  const record = result.data;
  if (!canonicalRepresentationsMatch(clonedInput, record)) {
    throw new DurableRegistryIntegrityError(
      "non_canonical_durable_record",
      "Durable audit record raw representation is not canonical",
      recordLocation(record),
    );
  }
  if (
    record.recordType === "snapshot_registration" &&
    createDurableSnapshotManifestFingerprint(record.manifestEvidence) !== record.manifestFingerprint
  ) {
    throw new DurableRegistryIntegrityError(
      "manifest_fingerprint_mismatch",
      "Snapshot registration manifest fingerprint does not match canonical manifest evidence",
      recordLocation(record),
    );
  }
  return deepFreeze(record);
}

export function verifyCommittedRegistryTransactionEnvelopeFingerprint(
  input: unknown,
): CommittedRegistryTransactionEnvelope {
  if (!hasCanonicalContainerStructure(input) || input === null || Array.isArray(input)) {
    throw new DurableRegistryIntegrityError(
      "invalid_transaction_envelope",
      "Committed transaction envelope must contain only canonical plain data properties",
    );
  }
  const recordsDescriptor = ownPropertyDescriptor(input as object, "records");
  if (
    recordsDescriptor === null ||
    recordsDescriptor.enumerable !== true ||
    !("value" in recordsDescriptor) ||
    !Array.isArray(recordsDescriptor.value)
  ) {
    throw new DurableRegistryIntegrityError(
      "invalid_transaction_envelope",
      "Committed transaction envelope records must be an own enumerable data array",
    );
  }
  for (let index = 0; index < recordsDescriptor.value.length; index += 1) {
    const recordDescriptor = ownPropertyDescriptor(recordsDescriptor.value, String(index));
    if (
      recordDescriptor === null ||
      recordDescriptor.enumerable !== true ||
      !("value" in recordDescriptor)
    ) {
      throw new DurableRegistryIntegrityError(
        "invalid_transaction_envelope",
        "Committed transaction envelope records must be a dense data array",
      );
    }
    try {
      verifyDurableAuditRecordFingerprint(recordDescriptor.value);
    } catch (error) {
      if (
        error instanceof DurableRegistryIntegrityError &&
        error.code === "invalid_durable_record"
      ) {
        throw new DurableRegistryIntegrityError(
          "invalid_transaction_envelope",
          "Committed transaction envelope contains an invalid durable record",
          error,
        );
      }
      throw error;
    }
  }
  const envelopeFingerprintDescriptor = ownPropertyDescriptor(
    input as object,
    "envelopeFingerprint",
  );
  const computedEnvelopeFingerprint = (() => {
    try {
      return createCommittedRegistryTransactionEnvelopeFingerprint(
        input as CommittedRegistryTransactionEnvelope,
      );
    } catch {
      throw new DurableRegistryIntegrityError(
        "invalid_transaction_envelope",
        "Committed transaction envelope could not be canonically fingerprinted",
      );
    }
  })();
  if (
    envelopeFingerprintDescriptor === null ||
    envelopeFingerprintDescriptor.enumerable !== true ||
    !("value" in envelopeFingerprintDescriptor) ||
    typeof envelopeFingerprintDescriptor.value !== "string" ||
    computedEnvelopeFingerprint !== envelopeFingerprintDescriptor.value
  ) {
    throw new DurableRegistryIntegrityError(
      "envelope_fingerprint_mismatch",
      "Committed transaction envelope fingerprint does not match its exact canonical payload",
    );
  }
  let clonedInput: unknown;
  try {
    clonedInput = structuredClone(input);
  } catch {
    throw new DurableRegistryIntegrityError(
      "invalid_transaction_envelope",
      "Committed transaction envelope could not be defensively cloned for verification",
    );
  }
  const result = CommittedRegistryTransactionEnvelopeSchema.safeParse(clonedInput);
  if (!result.success) {
    const transactionId =
      clonedInput !== null &&
      typeof clonedInput === "object" &&
      typeof (clonedInput as Record<string, unknown>).transactionId === "string"
        ? ((clonedInput as Record<string, unknown>).transactionId as string)
        : null;
    throw new DurableRegistryIntegrityError(
      "invalid_transaction_envelope",
      `Committed transaction envelope schema validation failed: ${schemaValidationMessage(result.error.issues)}`,
      { transactionId },
    );
  }
  const envelope = result.data;
  if (!canonicalRepresentationsMatch(clonedInput, envelope)) {
    throw new DurableRegistryIntegrityError(
      "non_canonical_transaction_envelope",
      "Committed transaction envelope raw representation is not canonical",
      { transactionId: envelope.transactionId },
    );
  }
  return deepFreeze(envelope);
}

function transactionIntent(envelope: CommittedRegistryTransactionEnvelope): unknown {
  return {
    schemaVersion: envelope.schemaVersion,
    transactionType: envelope.transactionType,
    transactionId: envelope.transactionId,
    records: envelope.records.map((record, recordIndex) => {
      const {
        previousRecordFingerprint: _previousRecordFingerprint,
        recordFingerprint: _recordFingerprint,
        sequence: _sequence,
        ...payload
      } = record;
      void _previousRecordFingerprint;
      void _recordFingerprint;
      void _sequence;
      if (
        record.recordType === "lifecycle_transition" &&
        record.evidence.decisionId !== null &&
        record.evidence.decisionFingerprint !== null
      ) {
        const referencedDecisionIndex = envelope.records.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex < recordIndex &&
            candidate.recordType === "review_decision" &&
            candidate.decisionId === record.evidence.decisionId &&
            candidate.recordFingerprint === record.evidence.decisionFingerprint,
        );
        if (referencedDecisionIndex >= 0) {
          return {
            ...payload,
            evidence: {
              ...record.evidence,
              decisionFingerprint: `transaction-record-${referencedDecisionIndex}-fingerprint`,
            },
          };
        }
      }
      return payload;
    }),
  };
}

export function createCommittedRegistryTransactionIdempotencyFingerprint(
  envelope: CommittedRegistryTransactionEnvelope,
): string {
  return createCanonicalSha256Fingerprint(transactionIntent(envelope));
}

export function areCommittedRegistryTransactionsIdempotent(
  existing: CommittedRegistryTransactionEnvelope,
  proposed: CommittedRegistryTransactionEnvelope,
): boolean {
  return (
    existing.transactionId === proposed.transactionId &&
    createCommittedRegistryTransactionIdempotencyFingerprint(existing) ===
      createCommittedRegistryTransactionIdempotencyFingerprint(proposed)
  );
}

export function assertCommittedRegistryTransactionIdempotency(
  existing: CommittedRegistryTransactionEnvelope,
  proposed: CommittedRegistryTransactionEnvelope,
): void {
  if (!areCommittedRegistryTransactionsIdempotent(existing, proposed)) {
    throw new DurableRegistryConflictError(
      "transaction_id_conflict",
      `Transaction identity ${proposed.transactionId} was reused with a different canonical payload`,
      { transactionId: proposed.transactionId },
    );
  }
}

export interface ReplayedDurableSnapshotState {
  readonly snapshotId: string;
  readonly status: SnapshotLifecycleStatus;
}

export interface DurableRegistryReplayResult {
  readonly schemaVersion: "1.0";
  readonly activeSnapshotId: string | null;
  readonly activationHistory: readonly ActivationAuditRecord[];
  readonly committedRecordCount: number;
  readonly committedTransactionCount: number;
  readonly governedChangeSetHistory: readonly DurableGovernedChangeSetRecord[];
  readonly integrityFingerprint: string;
  readonly lastCommittedAuditSequence: number;
  readonly lastRecordFingerprint: DurablePreviousRecordFingerprint;
  readonly lifecycleHistory: readonly DurableLifecycleTransitionRecord[];
  readonly reviewDecisionHistory: readonly DurableReviewDecisionRecord[];
  readonly snapshotRegistrations: readonly DurableSnapshotRegistrationRecord[];
  readonly snapshotStates: readonly ReplayedDurableSnapshotState[];
}

interface MutableSnapshotState {
  decision: DurableReviewDecisionRecord | null;
  lastTemporalEvidence: string;
  registration: DurableSnapshotRegistrationRecord;
  reviewChangeSetFingerprint: string | null;
  reviewChangeSetId: string | null;
  status: SnapshotLifecycleStatus;
}

interface MutableReplayState {
  activationHistory: ActivationAuditRecord[];
  activationsById: Map<string, ActivationAuditRecord>;
  activeSnapshotId: string | null;
  committedRecordCount: number;
  committedTransactionCount: number;
  envelopeFingerprints: string[];
  governedChangeSetHistory: DurableGovernedChangeSetRecord[];
  governedChangeSetsById: Map<string, DurableGovernedChangeSetRecord>;
  lastCommittedAuditSequence: number;
  lastRecordFingerprint: DurablePreviousRecordFingerprint;
  lifecycleHistory: DurableLifecycleTransitionRecord[];
  recordIds: Set<string>;
  reviewDecisionHistory: DurableReviewDecisionRecord[];
  reviewDecisionsById: Map<string, DurableReviewDecisionRecord>;
  snapshotRegistrations: DurableSnapshotRegistrationRecord[];
  snapshotStates: Map<string, MutableSnapshotState>;
  transactionIds: Set<string>;
}

function createEmptyReplayState(): MutableReplayState {
  return {
    activationHistory: [],
    activationsById: new Map(),
    activeSnapshotId: null,
    committedRecordCount: 0,
    committedTransactionCount: 0,
    envelopeFingerprints: [],
    governedChangeSetHistory: [],
    governedChangeSetsById: new Map(),
    lastCommittedAuditSequence: 0,
    lastRecordFingerprint: GENESIS,
    lifecycleHistory: [],
    recordIds: new Set(),
    reviewDecisionHistory: [],
    reviewDecisionsById: new Map(),
    snapshotRegistrations: [],
    snapshotStates: new Map(),
    transactionIds: new Set(),
  };
}

function cloneReplayState(state: MutableReplayState): MutableReplayState {
  return {
    activationHistory: [...state.activationHistory],
    activationsById: new Map(state.activationsById),
    activeSnapshotId: state.activeSnapshotId,
    committedRecordCount: state.committedRecordCount,
    committedTransactionCount: state.committedTransactionCount,
    envelopeFingerprints: [...state.envelopeFingerprints],
    governedChangeSetHistory: [...state.governedChangeSetHistory],
    governedChangeSetsById: new Map(state.governedChangeSetsById),
    lastCommittedAuditSequence: state.lastCommittedAuditSequence,
    lastRecordFingerprint: state.lastRecordFingerprint,
    lifecycleHistory: [...state.lifecycleHistory],
    recordIds: new Set(state.recordIds),
    reviewDecisionHistory: [...state.reviewDecisionHistory],
    reviewDecisionsById: new Map(state.reviewDecisionsById),
    snapshotRegistrations: [...state.snapshotRegistrations],
    snapshotStates: new Map(
      [...state.snapshotStates].map(([snapshotId, snapshotState]) => [
        snapshotId,
        { ...snapshotState },
      ]),
    ),
    transactionIds: new Set(state.transactionIds),
  };
}

function replayProgress(state: MutableReplayState): DurableRegistryReplayProgress {
  return {
    activationCount: state.activationHistory.length,
    committedRecordCount: state.committedRecordCount,
    committedTransactionCount: state.committedTransactionCount,
    decisionCount: state.reviewDecisionHistory.length,
    lastCommittedAuditSequence: state.lastCommittedAuditSequence,
    lastRecordFingerprint: state.lastRecordFingerprint,
    lifecycleTransitionCount: state.lifecycleHistory.length,
    registeredSnapshotCount: state.snapshotRegistrations.length,
  };
}

function replayFailure(
  verifiedState: MutableReplayState,
  code: string,
  message: string,
  location: DurableRegistryErrorLocation = {},
): never {
  throw new DurableRegistryIntegrityError(code, message, location, replayProgress(verifiedState));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createMilestone07SnapshotContentFingerprint(
  snapshot: KnowledgeRepositorySnapshot,
): string {
  return createCanonicalSha256Fingerprint({
    corpusId: snapshot.corpusId,
    corpusVersion: snapshot.corpusVersion,
    objects: snapshot.objects,
    sourceManifestReference: snapshot.sourceManifestReference,
  });
}

function snapshotDescriptorMatches(
  left: KnowledgeRepositorySnapshotObject,
  right: KnowledgeRepositorySnapshotObject,
): boolean {
  return (
    left.objectId === right.objectId &&
    left.objectType === right.objectType &&
    left.sourcePath === right.sourcePath &&
    left.sourceHash === right.sourceHash &&
    left.metadataFingerprint === right.metadataFingerprint &&
    left.objectFingerprint === right.objectFingerprint
  );
}

function comparisonEvidenceIntegrityIssue(
  evidence: KnowledgeSnapshotObjectComparisonEvidence,
): string | null {
  if (evidence.object.metadata.id !== evidence.objectId) {
    return `Canonical object identity does not match ${evidence.objectId}`;
  }
  if (evidence.object.metadata.objectType !== evidence.objectType) {
    return `Canonical object type does not match ${evidence.objectId}`;
  }
  if (createCanonicalSha256Fingerprint(evidence.object.metadata) !== evidence.metadataFingerprint) {
    return `Metadata fingerprint does not match canonical payload for ${evidence.objectId}`;
  }
  if (createCanonicalSha256Fingerprint(evidence.object) !== evidence.objectFingerprint) {
    return `Object fingerprint does not match canonical payload for ${evidence.objectId}`;
  }
  if (createKnowledgeObjectContentFingerprint(evidence.object) !== evidence.contentFingerprint) {
    return `Content fingerprint does not match canonical payload for ${evidence.objectId}`;
  }
  return null;
}

function requireEvidenceMatchesSnapshotObject(
  verifiedState: MutableReplayState,
  evidence: KnowledgeSnapshotObjectComparisonEvidence,
  snapshot: KnowledgeRepositorySnapshot,
  record: DurableGovernedChangeSetRecord,
): void {
  const descriptor = snapshot.objects.find((object) => object.objectId === evidence.objectId);
  if (descriptor === undefined || !snapshotDescriptorMatches(evidence, descriptor)) {
    replayFailure(
      verifiedState,
      "change_set_binding_mismatch",
      `Governed change-set object evidence does not match snapshot ${snapshot.snapshotId}`,
      recordLocation(record),
    );
  }
  const integrityIssue = comparisonEvidenceIntegrityIssue(evidence);
  if (integrityIssue !== null) {
    replayFailure(
      verifiedState,
      "change_set_evidence_fingerprint_mismatch",
      integrityIssue,
      recordLocation(record),
    );
  }
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireChangeSetSnapshotBindings(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  record: DurableGovernedChangeSetRecord,
): void {
  const evidence = record.evidence;
  const changeSet = evidence.changeSet;
  const targetState = state.snapshotStates.get(changeSet.targetSnapshotId);
  if (targetState === undefined) {
    replayFailure(
      verifiedState,
      "snapshot_not_registered",
      `Governed change set references unregistered target snapshot ${changeSet.targetSnapshotId}`,
      recordLocation(record),
    );
  }
  const target = targetState.registration.snapshot;

  if (
    changeSet.targetSnapshotFingerprint !== target.contentFingerprint ||
    changeSet.targetManifestReference !== target.sourceManifestReference ||
    changeSet.targetCorpusVersion !== target.corpusVersion
  ) {
    replayFailure(
      verifiedState,
      "change_set_binding_mismatch",
      "Governed change set does not match its registered target snapshot",
      recordLocation(record),
    );
  }

  if (evidence.evidenceType === "bootstrap") {
    const expectedAddedIds = target.objects.map((object) => object.objectId);
    const actualAddedIds = changeSet.addedObjects.map((object) => object.objectId);
    if (!sameStringList(actualAddedIds, expectedAddedIds)) {
      replayFailure(
        verifiedState,
        "change_set_binding_mismatch",
        "Bootstrap change set must contain every target snapshot object as added evidence",
        recordLocation(record),
      );
    }
    for (const object of changeSet.addedObjects) {
      requireEvidenceMatchesSnapshotObject(verifiedState, object, target, record);
    }
    return;
  }

  const comparisonChangeSet = evidence.changeSet;
  const sourceState = state.snapshotStates.get(comparisonChangeSet.sourceSnapshotId);
  if (sourceState === undefined) {
    replayFailure(
      verifiedState,
      "snapshot_not_registered",
      `Governed change set references unregistered source snapshot ${comparisonChangeSet.sourceSnapshotId}`,
      recordLocation(record),
    );
  }
  const source = sourceState.registration.snapshot;
  if (
    source.corpusId !== target.corpusId ||
    comparisonChangeSet.sourceSnapshotFingerprint !== source.contentFingerprint ||
    comparisonChangeSet.sourceManifestReference !== source.sourceManifestReference ||
    comparisonChangeSet.sourceCorpusVersion !== source.corpusVersion
  ) {
    replayFailure(
      verifiedState,
      "change_set_binding_mismatch",
      "Governed change set does not match its registered source snapshot",
      recordLocation(record),
    );
  }

  const sourceById = new Map(source.objects.map((object) => [object.objectId, object]));
  const targetById = new Map(target.objects.map((object) => [object.objectId, object]));
  const expectedAddedIds = target.objects
    .filter((object) => !sourceById.has(object.objectId))
    .map((object) => object.objectId);
  const expectedRemovedIds = source.objects
    .filter((object) => !targetById.has(object.objectId))
    .map((object) => object.objectId);
  const expectedModifiedIds = source.objects
    .filter((object) => {
      const current = targetById.get(object.objectId);
      return current !== undefined && !snapshotDescriptorMatches(object, current);
    })
    .map((object) => object.objectId);
  if (
    !sameStringList(
      comparisonChangeSet.addedObjects.map((object) => object.objectId),
      expectedAddedIds,
    ) ||
    !sameStringList(
      comparisonChangeSet.removedObjects.map((object) => object.objectId),
      expectedRemovedIds,
    ) ||
    !sameStringList(
      comparisonChangeSet.modifiedObjects.map((object) => object.objectId),
      expectedModifiedIds,
    )
  ) {
    replayFailure(
      verifiedState,
      "change_set_binding_mismatch",
      "Governed change set does not exactly describe registered snapshot differences",
      recordLocation(record),
    );
  }

  for (const object of comparisonChangeSet.addedObjects) {
    requireEvidenceMatchesSnapshotObject(verifiedState, object, target, record);
  }
  for (const object of comparisonChangeSet.removedObjects) {
    requireEvidenceMatchesSnapshotObject(verifiedState, object, source, record);
  }
  for (const modified of comparisonChangeSet.modifiedObjects) {
    requireEvidenceMatchesSnapshotObject(verifiedState, modified.previous, source, record);
    requireEvidenceMatchesSnapshotObject(verifiedState, modified.current, target, record);
  }
}

function requireRegisteredSnapshotState(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  snapshotId: string,
  record: DurableAuditRecord,
): MutableSnapshotState {
  const snapshotState = state.snapshotStates.get(snapshotId);
  if (snapshotState === undefined) {
    replayFailure(
      verifiedState,
      "snapshot_not_registered",
      `Durable record references unregistered snapshot ${snapshotId}`,
      recordLocation(record),
    );
  }
  return snapshotState;
}

function requireGovernedChangeSetReference(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  changeSetId: string,
  changeSetFingerprint: string,
  targetSnapshotId: string,
  record: DurableAuditRecord,
): DurableGovernedChangeSetRecord {
  const changeSetRecord = state.governedChangeSetsById.get(changeSetId);
  if (changeSetRecord === undefined) {
    replayFailure(
      verifiedState,
      "missing_change_set_reference",
      `Referenced governed change set ${changeSetId} was not committed earlier`,
      recordLocation(record),
    );
  }
  if (
    changeSetRecord.recordFingerprint !== changeSetFingerprint ||
    changeSetRecord.evidence.changeSet.targetSnapshotId !== targetSnapshotId ||
    !changeSetRecord.evidence.changeSet.changed
  ) {
    replayFailure(
      verifiedState,
      "change_set_binding_mismatch",
      "Referenced governed change set fingerprint or target binding does not match",
      recordLocation(record),
    );
  }
  return changeSetRecord;
}

function requireSelectedReviewChangeSet(
  snapshotState: MutableSnapshotState,
  verifiedState: MutableReplayState,
  changeSetId: string,
  changeSetFingerprint: string,
  record: DurableAuditRecord,
): void {
  if (
    snapshotState.reviewChangeSetId !== changeSetId ||
    snapshotState.reviewChangeSetFingerprint !== changeSetFingerprint
  ) {
    replayFailure(
      verifiedState,
      "review_change_set_mismatch",
      "Durable decision or transition substituted different evidence after review began",
      recordLocation(record),
    );
  }
}

function requireReviewBaselineCompatibility(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  changeSetRecord: DurableGovernedChangeSetRecord,
  record: DurableAuditRecord,
): void {
  if (changeSetRecord.evidence.evidenceType === "bootstrap") {
    if (state.activeSnapshotId !== null) {
      replayFailure(
        verifiedState,
        "review_baseline_mismatch",
        "Bootstrap review is valid only while no active snapshot exists",
        recordLocation(record),
      );
    }
    return;
  }

  const sourceSnapshotId = changeSetRecord.evidence.changeSet.sourceSnapshotId;
  const sourceState = state.snapshotStates.get(sourceSnapshotId);
  if (state.activeSnapshotId !== sourceSnapshotId || sourceState?.status !== "active") {
    replayFailure(
      verifiedState,
      "review_baseline_mismatch",
      "Replacement review evidence must bind the currently active snapshot baseline",
      recordLocation(record),
    );
  }
}

function requireApprovalDecisionReference(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  decisionId: string,
  decisionFingerprint: string,
  changeSetId: string,
  snapshotId: string,
  record: DurableAuditRecord,
): DurableReviewDecisionRecord {
  const decision = state.reviewDecisionsById.get(decisionId);
  if (decision === undefined) {
    replayFailure(
      verifiedState,
      "missing_decision_reference",
      `Referenced approval decision ${decisionId} was not committed earlier`,
      recordLocation(record),
    );
  }
  if (
    decision.recordFingerprint !== decisionFingerprint ||
    decision.reviewDecision.decision !== "approved" ||
    decision.reviewDecision.changeId !== changeSetId ||
    decision.reviewDecision.proposedSnapshotId !== snapshotId
  ) {
    replayFailure(
      verifiedState,
      "decision_binding_mismatch",
      "Referenced review decision is not the bound approval evidence",
      recordLocation(record),
    );
  }
  return decision;
}

function requireLaterTemporalEvidence(
  verifiedState: MutableReplayState,
  previous: string,
  current: string,
  record: DurableAuditRecord,
): void {
  if (Date.parse(previous) >= Date.parse(current)) {
    replayFailure(
      verifiedState,
      "lifecycle_timestamp_mismatch",
      "Durable lifecycle evidence timestamps must be strictly increasing",
      recordLocation(record),
    );
  }
}

function processSnapshotRegistration(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  record: DurableSnapshotRegistrationRecord,
): void {
  const snapshot = record.snapshot;
  if (
    createDurableSnapshotManifestFingerprint(record.manifestEvidence) !== record.manifestFingerprint
  ) {
    replayFailure(
      verifiedState,
      "manifest_fingerprint_mismatch",
      "Snapshot registration manifest fingerprint does not match canonical manifest evidence",
      recordLocation(record),
    );
  }
  if (createMilestone07SnapshotContentFingerprint(snapshot) !== snapshot.contentFingerprint) {
    replayFailure(
      verifiedState,
      "snapshot_fingerprint_mismatch",
      `Snapshot ${snapshot.snapshotId} content fingerprint does not match its Milestone 07 payload`,
      recordLocation(record),
    );
  }
  if (state.snapshotStates.has(snapshot.snapshotId)) {
    replayFailure(
      verifiedState,
      "duplicate_snapshot_id",
      `Snapshot identity ${snapshot.snapshotId} was registered more than once`,
      recordLocation(record),
    );
  }

  state.snapshotRegistrations.push(record);
  state.snapshotStates.set(snapshot.snapshotId, {
    decision: null,
    lastTemporalEvidence: snapshot.creation.createdAt,
    registration: record,
    reviewChangeSetFingerprint: null,
    reviewChangeSetId: null,
    status: "created",
  });
}

function processGovernedChangeSet(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  record: DurableGovernedChangeSetRecord,
): void {
  if (state.governedChangeSetsById.has(record.changeSetId)) {
    replayFailure(
      verifiedState,
      "duplicate_change_set_id",
      `Governed change-set identity ${record.changeSetId} was committed more than once`,
      recordLocation(record),
    );
  }
  requireChangeSetSnapshotBindings(state, verifiedState, record);
  state.governedChangeSetsById.set(record.changeSetId, record);
  state.governedChangeSetHistory.push(record);
}

function processReviewDecision(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  record: DurableReviewDecisionRecord,
): void {
  if (state.reviewDecisionsById.has(record.decisionId)) {
    replayFailure(
      verifiedState,
      "duplicate_decision_id",
      `Review-decision identity ${record.decisionId} was committed more than once`,
      recordLocation(record),
    );
  }
  const snapshotId = record.reviewDecision.proposedSnapshotId;
  const snapshotState = requireRegisteredSnapshotState(state, verifiedState, snapshotId, record);
  if (snapshotState.status !== "reviewing" || snapshotState.decision !== null) {
    replayFailure(
      verifiedState,
      "contradictory_review_decision",
      "A review decision requires one undecided snapshot in reviewing lifecycle state",
      recordLocation(record),
    );
  }
  requireSelectedReviewChangeSet(
    snapshotState,
    verifiedState,
    record.reviewDecision.changeId,
    record.changeSetFingerprint,
    record,
  );
  const changeSet = requireGovernedChangeSetReference(
    state,
    verifiedState,
    record.reviewDecision.changeId,
    record.changeSetFingerprint,
    snapshotId,
    record,
  );
  requireReviewBaselineCompatibility(state, verifiedState, changeSet, record);
  const recordedReviewStatus = changeSet.evidence.changeSet.reviewStatus;
  if (
    (record.reviewDecision.decision === "approved" && recordedReviewStatus === "rejected") ||
    (record.reviewDecision.decision === "rejected" && recordedReviewStatus === "approved")
  ) {
    replayFailure(
      verifiedState,
      "decision_binding_mismatch",
      "Review decision contradicts the governed change set's immutable review status",
      recordLocation(record),
    );
  }
  if (
    changeSet.changeSetId !== record.reviewDecision.changeId ||
    snapshotState.registration.snapshot.contentFingerprint !== record.proposedSnapshotFingerprint
  ) {
    replayFailure(
      verifiedState,
      "decision_binding_mismatch",
      "Review decision does not bind its registered snapshot and governed change set",
      recordLocation(record),
    );
  }
  requireLaterTemporalEvidence(
    verifiedState,
    snapshotState.lastTemporalEvidence,
    record.decidedAt,
    record,
  );

  snapshotState.decision = record;
  state.reviewDecisionsById.set(record.decisionId, record);
  state.reviewDecisionHistory.push(record);
}

function processLifecycleTransition(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  record: DurableLifecycleTransitionRecord,
): void {
  const snapshotState = requireRegisteredSnapshotState(
    state,
    verifiedState,
    record.snapshotId,
    record,
  );
  if (record.from !== snapshotState.status) {
    replayFailure(
      verifiedState,
      "lifecycle_transition_mismatch",
      `Lifecycle transition expected ${record.from} but recovered ${snapshotState.status}`,
      recordLocation(record),
    );
  }
  if (snapshotState.decision?.reviewDecision.decision === "rejected") {
    replayFailure(
      verifiedState,
      "contradictory_lifecycle_history",
      "A rejected snapshot cannot advance to another lifecycle state",
      recordLocation(record),
    );
  }
  requireLaterTemporalEvidence(
    verifiedState,
    snapshotState.lastTemporalEvidence,
    record.transitionedAt,
    record,
  );

  if (record.to === "reviewing") {
    const changeSet = requireGovernedChangeSetReference(
      state,
      verifiedState,
      record.evidence.changeSetId!,
      record.evidence.changeSetFingerprint!,
      record.snapshotId,
      record,
    );
    requireReviewBaselineCompatibility(state, verifiedState, changeSet, record);
    snapshotState.reviewChangeSetId = changeSet.changeSetId;
    snapshotState.reviewChangeSetFingerprint = changeSet.recordFingerprint;
  } else if (record.to === "approved") {
    requireSelectedReviewChangeSet(
      snapshotState,
      verifiedState,
      record.evidence.changeSetId!,
      record.evidence.changeSetFingerprint!,
      record,
    );
    const changeSet = requireGovernedChangeSetReference(
      state,
      verifiedState,
      record.evidence.changeSetId!,
      record.evidence.changeSetFingerprint!,
      record.snapshotId,
      record,
    );
    requireReviewBaselineCompatibility(state, verifiedState, changeSet, record);
    const decision = requireApprovalDecisionReference(
      state,
      verifiedState,
      record.evidence.decisionId!,
      record.evidence.decisionFingerprint!,
      changeSet.changeSetId,
      record.snapshotId,
      record,
    );
    if (
      decision.actorId !== record.actorId ||
      decision.reason !== record.reason ||
      decision.decidedAt !== record.transitionedAt ||
      snapshotState.decision?.decisionId !== decision.decisionId
    ) {
      replayFailure(
        verifiedState,
        "decision_binding_mismatch",
        "Approval lifecycle evidence does not exactly match its review decision",
        recordLocation(record),
      );
    }
  } else if (record.to === "active" || record.to === "superseded") {
    replayFailure(
      verifiedState,
      "activation_transition_outside_envelope",
      "Active and superseded transitions are valid only inside a verified activation envelope",
      recordLocation(record),
    );
  }

  snapshotState.status = record.to;
  snapshotState.lastTemporalEvidence = record.transitionedAt;
  state.lifecycleHistory.push(record);
}

function processActivationEnvelope(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  envelope: CommittedRegistryTransactionEnvelope,
): void {
  const auditRecord = envelope.records.at(-1);
  const candidateTransition = envelope.records[0];
  if (
    auditRecord?.recordType !== "activation_audit" ||
    candidateTransition?.recordType !== "lifecycle_transition"
  ) {
    replayFailure(
      verifiedState,
      "incomplete_activation_envelope",
      "Verified activation envelope does not contain its required atomic effects",
      { transactionId: envelope.transactionId },
    );
  }
  const audit = auditRecord;
  if (state.activationsById.has(audit.activationId)) {
    replayFailure(
      verifiedState,
      "duplicate_activation_id",
      `Activation identity ${audit.activationId} was committed more than once`,
      recordLocation(audit),
    );
  }
  if (state.activeSnapshotId !== audit.previousActiveSnapshotId) {
    replayFailure(
      verifiedState,
      "activation_state_mismatch",
      "Activation previous-active evidence does not match recovered active state",
      recordLocation(audit),
    );
  }

  const candidateState = requireRegisteredSnapshotState(
    state,
    verifiedState,
    audit.candidateSnapshotId,
    audit,
  );
  if (
    candidateState.status !== "approved" ||
    candidateState.registration.snapshot.contentFingerprint !== audit.candidateSnapshotFingerprint
  ) {
    replayFailure(
      verifiedState,
      "activation_state_mismatch",
      "Activation candidate must be a registered approved snapshot with matching fingerprint",
      recordLocation(audit),
    );
  }
  requireSelectedReviewChangeSet(
    candidateState,
    verifiedState,
    audit.changeSetId,
    audit.changeSetFingerprint,
    audit,
  );
  const changeSet = requireGovernedChangeSetReference(
    state,
    verifiedState,
    audit.changeSetId,
    audit.changeSetFingerprint,
    audit.candidateSnapshotId,
    audit,
  );
  requireReviewBaselineCompatibility(state, verifiedState, changeSet, audit);
  if (changeSet.evidence.evidenceType !== audit.changeSetType) {
    replayFailure(
      verifiedState,
      "activation_binding_mismatch",
      "Activation change-set type does not match the referenced durable evidence",
      recordLocation(audit),
    );
  }
  const decision = requireApprovalDecisionReference(
    state,
    verifiedState,
    audit.approvalDecisionId,
    audit.approvalDecisionFingerprint,
    audit.changeSetId,
    audit.candidateSnapshotId,
    audit,
  );
  if (candidateState.decision?.decisionId !== decision.decisionId) {
    replayFailure(
      verifiedState,
      "activation_binding_mismatch",
      "Activation approval is not the candidate snapshot's recovered decision",
      recordLocation(audit),
    );
  }
  requireLaterTemporalEvidence(
    verifiedState,
    candidateState.lastTemporalEvidence,
    candidateTransition.transitionedAt,
    candidateTransition,
  );

  let previousActiveState: MutableSnapshotState | null = null;
  let supersessionTransition: DurableLifecycleTransitionRecord | null = null;
  if (audit.previousActiveSnapshotId === null) {
    if (changeSet.evidence.evidenceType !== "bootstrap") {
      replayFailure(
        verifiedState,
        "activation_binding_mismatch",
        "A no-baseline activation requires bootstrap governed evidence",
        recordLocation(audit),
      );
    }
  } else {
    previousActiveState = requireRegisteredSnapshotState(
      state,
      verifiedState,
      audit.previousActiveSnapshotId,
      audit,
    );
    const previousFingerprint = previousActiveState.registration.snapshot.contentFingerprint;
    if (
      previousActiveState.status !== "active" ||
      previousFingerprint !== audit.previousActiveSnapshotFingerprint ||
      changeSet.evidence.evidenceType !== "comparison" ||
      changeSet.evidence.changeSet.sourceSnapshotId !== audit.previousActiveSnapshotId
    ) {
      replayFailure(
        verifiedState,
        "activation_binding_mismatch",
        "Replacement activation does not bind its recovered active baseline",
        recordLocation(audit),
      );
    }
    const possibleSupersession = envelope.records[1];
    if (possibleSupersession?.recordType !== "lifecycle_transition") {
      replayFailure(
        verifiedState,
        "incomplete_activation_envelope",
        "Replacement activation is missing its atomic supersession transition",
        recordLocation(audit),
      );
    }
    supersessionTransition = possibleSupersession;
    requireLaterTemporalEvidence(
      verifiedState,
      previousActiveState.lastTemporalEvidence,
      supersessionTransition.transitionedAt,
      supersessionTransition,
    );
  }

  candidateState.status = "active";
  candidateState.lastTemporalEvidence = candidateTransition.transitionedAt;
  if (previousActiveState !== null && supersessionTransition !== null) {
    previousActiveState.status = "superseded";
    previousActiveState.lastTemporalEvidence = supersessionTransition.transitionedAt;
  }
  state.activeSnapshotId = audit.candidateSnapshotId;
  state.lifecycleHistory.push(candidateTransition);
  if (supersessionTransition !== null) state.lifecycleHistory.push(supersessionTransition);
  state.activationHistory.push(audit);
  state.activationsById.set(audit.activationId, audit);

  const activeSnapshotIds = [...state.snapshotStates]
    .filter(([, snapshotState]) => snapshotState.status === "active")
    .map(([snapshotId]) => snapshotId);
  if (activeSnapshotIds.length !== 1 || activeSnapshotIds[0] !== state.activeSnapshotId) {
    replayFailure(
      verifiedState,
      "multiple_active_snapshots",
      "Committed activation history must recover exactly one active snapshot",
      recordLocation(audit),
    );
  }
}

function applyEnvelopeSemantics(
  state: MutableReplayState,
  verifiedState: MutableReplayState,
  envelope: CommittedRegistryTransactionEnvelope,
): void {
  if (state.transactionIds.has(envelope.transactionId)) {
    replayFailure(
      verifiedState,
      "duplicate_transaction_id",
      `Transaction identity ${envelope.transactionId} appears more than once in committed history`,
      { transactionId: envelope.transactionId },
    );
  }
  state.transactionIds.add(envelope.transactionId);

  for (const record of envelope.records) {
    const identity = durableRecordId(record);
    if (state.recordIds.has(identity)) {
      replayFailure(
        verifiedState,
        "duplicate_record_id",
        `Durable record identity ${identity} appears more than once in committed history`,
        recordLocation(record),
      );
    }
    state.recordIds.add(identity);
  }

  switch (envelope.transactionType) {
    case "registration":
      for (const record of envelope.records) {
        if (record.recordType !== "snapshot_registration") {
          replayFailure(
            verifiedState,
            "invalid_transaction_envelope",
            "Registration transaction contains a non-registration record",
            recordLocation(record),
          );
        }
        processSnapshotRegistration(state, verifiedState, record);
      }
      break;
    case "change_set":
      for (const record of envelope.records) {
        if (record.recordType !== "governed_change_set") {
          replayFailure(
            verifiedState,
            "invalid_transaction_envelope",
            "Change-set transaction contains an unrelated record",
            recordLocation(record),
          );
        }
        processGovernedChangeSet(state, verifiedState, record);
      }
      break;
    case "lifecycle":
      for (const record of envelope.records) {
        if (record.recordType !== "lifecycle_transition") {
          replayFailure(
            verifiedState,
            "invalid_transaction_envelope",
            "Lifecycle transaction contains an unrelated record",
            recordLocation(record),
          );
        }
        processLifecycleTransition(state, verifiedState, record);
      }
      break;
    case "decision":
      for (const record of envelope.records) {
        if (record.recordType === "review_decision") {
          processReviewDecision(state, verifiedState, record);
        } else if (record.recordType === "lifecycle_transition") {
          processLifecycleTransition(state, verifiedState, record);
        } else {
          replayFailure(
            verifiedState,
            "invalid_transaction_envelope",
            "Decision transaction contains an unrelated record",
            recordLocation(record),
          );
        }
      }
      break;
    case "activation":
      processActivationEnvelope(state, verifiedState, envelope);
      break;
  }

  const activeSnapshotIds = [...state.snapshotStates]
    .filter(([, snapshotState]) => snapshotState.status === "active")
    .map(([snapshotId]) => snapshotId);
  if (activeSnapshotIds.length > 1 || (activeSnapshotIds[0] ?? null) !== state.activeSnapshotId) {
    replayFailure(
      verifiedState,
      "multiple_active_snapshots",
      "Recovered lifecycle history disagrees with the single active-snapshot identity",
      { transactionId: envelope.transactionId },
    );
  }
}

function throwWithReplayProgress(error: unknown, state: MutableReplayState): never {
  if (error instanceof DurableRegistryIntegrityError) {
    throw new DurableRegistryIntegrityError(
      error.code,
      error.message,
      error,
      replayProgress(state),
    );
  }
  if (error instanceof DurableRegistryError) {
    throw new DurableRegistryIntegrityError(
      error.code,
      error.message,
      error,
      replayProgress(state),
    );
  }
  throw new DurableRegistryIntegrityError(
    "invalid_transaction_envelope",
    error instanceof Error ? error.message : "Committed registry history could not be verified",
    {},
    replayProgress(state),
  );
}

function createIntegrityFingerprint(state: MutableReplayState): string {
  return createCanonicalSha256Fingerprint({
    schemaVersion: "1.0",
    committedTransactionCount: state.committedTransactionCount,
    committedRecordCount: state.committedRecordCount,
    lastCommittedAuditSequence: state.lastCommittedAuditSequence,
    lastRecordFingerprint: state.lastRecordFingerprint,
    transactionEnvelopeFingerprints: state.envelopeFingerprints,
  });
}

function createReplayResult(state: MutableReplayState): DurableRegistryReplayResult {
  const snapshotRegistrations = [...state.snapshotRegistrations].sort((left, right) =>
    compareStrings(left.snapshot.snapshotId, right.snapshot.snapshotId),
  );
  const snapshotStates = [...state.snapshotStates]
    .map(([snapshotId, snapshotState]) => ({ snapshotId, status: snapshotState.status }))
    .sort((left, right) => compareStrings(left.snapshotId, right.snapshotId));
  return deepFreeze({
    schemaVersion: "1.0",
    activeSnapshotId: state.activeSnapshotId,
    activationHistory: [...state.activationHistory],
    committedRecordCount: state.committedRecordCount,
    committedTransactionCount: state.committedTransactionCount,
    governedChangeSetHistory: [...state.governedChangeSetHistory],
    integrityFingerprint: createIntegrityFingerprint(state),
    lastCommittedAuditSequence: state.lastCommittedAuditSequence,
    lastRecordFingerprint: state.lastRecordFingerprint,
    lifecycleHistory: [...state.lifecycleHistory],
    reviewDecisionHistory: [...state.reviewDecisionHistory],
    snapshotRegistrations,
    snapshotStates,
  });
}

export function replayCommittedRegistryTransactions(
  inputs: readonly unknown[],
): DurableRegistryReplayResult {
  let state = createEmptyReplayState();

  for (const input of inputs) {
    let envelope: CommittedRegistryTransactionEnvelope;
    try {
      envelope = verifyCommittedRegistryTransactionEnvelopeFingerprint(input);
    } catch (error) {
      throwWithReplayProgress(error, state);
    }

    const expectedFirstSequence = state.lastCommittedAuditSequence + 1;
    if (envelope.firstSequence !== expectedFirstSequence) {
      replayFailure(
        state,
        "audit_sequence_mismatch",
        `Expected committed audit sequence ${expectedFirstSequence} but found ${envelope.firstSequence}`,
        { transactionId: envelope.transactionId },
      );
    }
    if (envelope.previousRecordFingerprint !== state.lastRecordFingerprint) {
      replayFailure(
        state,
        "audit_chain_mismatch",
        "Committed transaction predecessor does not match verified audit-chain head",
        { transactionId: envelope.transactionId },
      );
    }

    const candidateState = cloneReplayState(state);
    applyEnvelopeSemantics(candidateState, state, envelope);
    candidateState.committedTransactionCount += 1;
    candidateState.committedRecordCount += envelope.recordCount;
    candidateState.lastCommittedAuditSequence = envelope.lastSequence;
    candidateState.lastRecordFingerprint = envelope.lastRecordFingerprint;
    candidateState.envelopeFingerprints.push(envelope.envelopeFingerprint);
    state = candidateState;
  }

  return createReplayResult(state);
}

function integrityIssueFromError(error: DurableRegistryIntegrityError): RegistryIntegrityIssue {
  return {
    code: error.code,
    message: error.message,
    transactionId: error.transactionId,
    recordId: error.recordId,
    sequence: error.sequence !== null && error.sequence > 0 ? error.sequence : null,
  };
}

function normalizeIntegrityError(error: unknown): DurableRegistryIntegrityError {
  if (error instanceof DurableRegistryIntegrityError) return error;
  if (error instanceof DurableRegistryError) {
    return new DurableRegistryIntegrityError(error.code, error.message, error);
  }
  return new DurableRegistryIntegrityError(
    "invalid_authoritative_history",
    error instanceof Error ? error.message : "Authoritative registry history is invalid",
  );
}

export interface RegistryDerivedIndexObservation {
  readonly derivedIndexStatus: RegistryDerivedIndexStatus;
  readonly derivedIndexIssues: readonly RegistryIntegrityIssue[];
}

const NOT_CHECKED_DERIVED_INDEX: RegistryDerivedIndexObservation = {
  derivedIndexStatus: "not_checked",
  derivedIndexIssues: [],
};

export function verifyCommittedRegistryIntegrity(
  inputs: readonly unknown[],
  derivedIndex: RegistryDerivedIndexObservation = NOT_CHECKED_DERIVED_INDEX,
): RegistryIntegrityResult {
  try {
    const replay = replayCommittedRegistryTransactions(inputs);
    return deepFreeze(
      RegistryIntegrityResultSchema.parse({
        schemaVersion: "1.0",
        status: "valid",
        verifiedTransactionCount: replay.committedTransactionCount,
        verifiedRecordCount: replay.committedRecordCount,
        verifiedThroughSequence: replay.lastCommittedAuditSequence,
        lastRecordFingerprint: replay.lastRecordFingerprint,
        ...derivedIndex,
        integrityFingerprint: replay.integrityFingerprint,
        issues: [],
      }),
    );
  } catch (cause) {
    const error = normalizeIntegrityError(cause);
    return deepFreeze(
      RegistryIntegrityResultSchema.parse({
        schemaVersion: "1.0",
        status: "invalid",
        verifiedTransactionCount: error.progress.committedTransactionCount,
        verifiedRecordCount: error.progress.committedRecordCount,
        verifiedThroughSequence: error.progress.lastCommittedAuditSequence,
        lastRecordFingerprint: error.progress.lastRecordFingerprint,
        derivedIndexStatus: "not_checked",
        derivedIndexIssues: [],
        integrityFingerprint: null,
        issues: [integrityIssueFromError(error)],
      }),
    );
  }
}

export function recoverCommittedRegistry(
  inputs: readonly unknown[],
  derivedIndex: RegistryDerivedIndexObservation = NOT_CHECKED_DERIVED_INDEX,
): RegistryRecoveryResult {
  try {
    const replay = replayCommittedRegistryTransactions(inputs);
    return deepFreeze(
      RegistryRecoveryResultSchema.parse({
        schemaVersion: "1.0",
        status: "recovered",
        activeSnapshotId: replay.activeSnapshotId,
        registeredSnapshotCount: replay.snapshotRegistrations.length,
        lifecycleTransitionCount: replay.lifecycleHistory.length,
        decisionCount: replay.reviewDecisionHistory.length,
        activationCount: replay.activationHistory.length,
        committedTransactionCount: replay.committedTransactionCount,
        committedRecordCount: replay.committedRecordCount,
        lastCommittedAuditSequence: replay.lastCommittedAuditSequence,
        lastRecordFingerprint: replay.lastRecordFingerprint,
        ...derivedIndex,
        integrityFingerprint: replay.integrityFingerprint,
        errors: [],
      }),
    );
  } catch (cause) {
    const error = normalizeIntegrityError(cause);
    return deepFreeze(
      RegistryRecoveryResultSchema.parse({
        schemaVersion: "1.0",
        status: "failed",
        activeSnapshotId: null,
        registeredSnapshotCount: error.progress.registeredSnapshotCount,
        lifecycleTransitionCount: error.progress.lifecycleTransitionCount,
        decisionCount: error.progress.decisionCount,
        activationCount: error.progress.activationCount,
        committedTransactionCount: error.progress.committedTransactionCount,
        committedRecordCount: error.progress.committedRecordCount,
        lastCommittedAuditSequence: error.progress.lastCommittedAuditSequence,
        lastRecordFingerprint: error.progress.lastRecordFingerprint,
        derivedIndexStatus: "not_checked",
        derivedIndexIssues: [],
        integrityFingerprint: null,
        errors: [integrityIssueFromError(error)],
      }),
    );
  }
}
