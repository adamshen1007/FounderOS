import {
  ApproveGovernedSnapshotInputSchema,
  ApprovalDecisionTransactionRecordsSchema,
  BeginGovernedSnapshotReviewInputSchema,
  DurableSnapshotManifestEvidenceSchema,
  GovernedLifecycleTransitionInputSchema,
  RecordGovernedChangeSetInputSchema,
  RegisterGovernedSnapshotInputSchema,
  RejectGovernedSnapshotInputSchema,
  RejectionDecisionTransactionRecordsSchema,
  SnapshotActivationRequestSchema,
  SnapshotActivationResultSchema,
  type ActivationAuditRecord,
  type ApprovalDecisionTransactionRecords,
  type DerivedRegistryIndexResult,
  type DurableActorType,
  type DurableApprovalDecisionRecord,
  type DurableAuditRecord,
  type DurableGovernedChangeSetEvidence,
  type DurableGovernedChangeSetRecord,
  type DurableLifecycleTransitionRecord,
  type DurablePreviousRecordFingerprint,
  type DurableRejectionDecisionRecord,
  type DurableReviewDecisionRecord,
  type DurableSnapshotManifestEvidence,
  type DurableSnapshotRegistrationRecord,
  type DurableSnapshotRegistry,
  type KnowledgeRepositorySnapshot,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
  type RegistryTransactionType,
  type SnapshotActivationRequest,
  type SnapshotActivationResult,
  type StandaloneDurableLifecycleTransitionRecord,
} from "@founderos/knowledge-schema";

import {
  DurableRegistryConflictError,
  DurableRegistryValidationError,
  assertCommittedRegistryTransactionIdempotency,
  createCommittedRegistryTransactionEnvelope,
  createDurableAuditRecord,
  createDurableSnapshotManifestFingerprint,
  type DurableAuditRecordContent,
  type DurableRegistryReplayResult,
  type UnsignedDurableAuditRecord,
} from "../domain/durable-registry.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type {
  GovernedDurableSnapshotRegistryStoragePort,
  GovernedDurableSnapshotRegistryVerifiedState,
  GovernedDurableSnapshotRegistryWriterPort,
} from "./governed-durable-snapshot-registry-port.js";
import {
  LocalFileRegistryStorage,
  type LocalFileRegistryFaultHooks,
  type LocalFileRegistryOptions,
} from "../infrastructure/local-file-durable-snapshot-registry-internal.js";

export interface DurableRegistryActorEvidence {
  readonly actorId: string;
  readonly actorType: DurableActorType;
  readonly reason: string;
}

export interface RegisterGovernedSnapshotInput extends DurableRegistryActorEvidence {
  readonly manifestEvidence: DurableSnapshotManifestEvidence;
  readonly registeredAt: string;
  readonly snapshot: KnowledgeRepositorySnapshot;
  readonly transactionId: string;
}

export interface RecordGovernedChangeSetInput extends DurableRegistryActorEvidence {
  readonly evidence: DurableGovernedChangeSetEvidence;
  readonly recordedAt: string;
  readonly transactionId: string;
}

export interface GovernedLifecycleTransitionInput extends DurableRegistryActorEvidence {
  readonly snapshotId: string;
  readonly transitionedAt: string;
  readonly transitionId: string;
  readonly transactionId: string;
}

export interface BeginGovernedSnapshotReviewInput extends GovernedLifecycleTransitionInput {
  readonly changeSetFingerprint: string;
  readonly changeSetId: string;
}

interface GovernedSnapshotDecisionInput extends DurableRegistryActorEvidence {
  readonly actorType: "human";
  readonly changeSetFingerprint: string;
  readonly changeSetId: string;
  readonly decidedAt: string;
  readonly decisionId: string;
  readonly snapshotFingerprint: string;
  readonly snapshotId: string;
  readonly transactionId: string;
}

export interface ApproveGovernedSnapshotInput extends GovernedSnapshotDecisionInput {
  readonly approvalTransitionId: string;
}

export type RejectGovernedSnapshotInput = GovernedSnapshotDecisionInput;

export interface GovernedDurableSnapshotRegistry extends DurableSnapshotRegistry {
  activate(request: SnapshotActivationRequest): Promise<SnapshotActivationResult>;
  activateSnapshot(request: SnapshotActivationRequest): Promise<SnapshotActivationResult>;
  approveSnapshot(input: ApproveGovernedSnapshotInput): Promise<ApprovalDecisionTransactionRecords>;
  archiveSnapshot(
    input: GovernedLifecycleTransitionInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord>;
  beginSnapshotReview(
    input: BeginGovernedSnapshotReviewInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord>;
  getActivationHistory(): Promise<readonly ActivationAuditRecord[]>;
  getCurrentActiveSnapshot(): Promise<DurableSnapshotRegistrationRecord | null>;
  getGovernedChangeSet(changeSetId: string): Promise<DurableGovernedChangeSetRecord | null>;
  getLifecycleHistory(snapshotId: string): Promise<readonly DurableLifecycleTransitionRecord[]>;
  getReviewDecisionHistory(snapshotId: string): Promise<readonly DurableReviewDecisionRecord[]>;
  getSnapshot(snapshotId: string): Promise<DurableSnapshotRegistrationRecord | null>;
  inspectDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  listSnapshots(): Promise<readonly DurableSnapshotRegistrationRecord[]>;
  rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  recordGovernedChangeSet(
    input: RecordGovernedChangeSetInput,
  ): Promise<DurableGovernedChangeSetRecord>;
  recover(): Promise<RegistryRecoveryResult>;
  registerSnapshot(
    input: RegisterGovernedSnapshotInput,
  ): Promise<DurableSnapshotRegistrationRecord>;
  rejectSnapshot(input: RejectGovernedSnapshotInput): Promise<DurableRejectionDecisionRecord>;
  validateSnapshot(
    input: GovernedLifecycleTransitionInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord>;
  verifyIntegrity(): Promise<RegistryIntegrityResult>;
}

export class GovernedDurableRegistryPreconditionError extends DurableRegistryConflictError {}

type TransactionFaultHooks = (transactionId: string) => LocalFileRegistryFaultHooks | undefined;
type BeforeWriterAcquisition = (transactionId: string) => Promise<void> | void;

interface RecordChainPosition {
  readonly previousRecordFingerprint: DurablePreviousRecordFingerprint;
  readonly sequence: number;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validationMessage(error: {
  issues: readonly { message: string; path: PropertyKey[] }[];
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

interface StrictMutationInputSchema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: readonly { message: string; path: PropertyKey[] }[] };
      };
}

function captureRawMutationObject(
  input: unknown,
  code: string,
  label: string,
): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new DurableRegistryValidationError(
      code,
      `${label} must be a plain object with own enumerable data properties`,
    );
  }
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(input) as object | null;
    keys = Reflect.ownKeys(input);
  } catch {
    throw new DurableRegistryValidationError(
      code,
      `${label} could not be safely inspected before capture`,
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DurableRegistryValidationError(
      code,
      `${label} must be a plain object with own enumerable data properties`,
    );
  }

  const captured = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new DurableRegistryValidationError(
        code,
        `${label} could not be safely inspected before capture`,
      );
    }
    if (
      typeof key !== "string" ||
      key === "__proto__" ||
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor)
    ) {
      throw new DurableRegistryValidationError(
        code,
        `${label} must use only own enumerable data properties`,
      );
    }
    Object.defineProperty(captured, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true,
    });
  }
  return captured;
}

function captureMutationInput<T>(
  input: unknown,
  schema: StrictMutationInputSchema<T>,
  code: string,
  label: string,
  validateRaw?: (captured: Readonly<Record<string, unknown>>) => void,
): T {
  const raw = captureRawMutationObject(input, code, label);
  validateRaw?.(raw);
  let clone: unknown;
  try {
    clone = structuredClone(raw);
  } catch {
    throw new DurableRegistryValidationError(code, `${label} could not be defensively cloned`);
  }
  let parsed: ReturnType<StrictMutationInputSchema<T>["safeParse"]>;
  try {
    parsed = schema.safeParse(clone);
  } catch {
    throw new DurableRegistryValidationError(code, `${label} could not be strictly parsed`);
  }
  if (!parsed.success) {
    const transactionId =
      clone !== null &&
      typeof clone === "object" &&
      typeof (clone as Record<string, unknown>).transactionId === "string"
        ? ((clone as Record<string, unknown>).transactionId as string)
        : null;
    throw new DurableRegistryValidationError(
      code,
      `${label} failed validation: ${validationMessage(parsed.error)}`,
      { transactionId },
    );
  }
  return deepFreeze(parsed.data);
}

function validateManifestEvidenceBeforeClone(evidence: unknown): void {
  const parsed = DurableSnapshotManifestEvidenceSchema.safeParse(evidence);
  if (!parsed.success) {
    throw new DurableRegistryValidationError(
      "invalid_registration_input",
      `Snapshot registration manifest evidence failed validation: ${validationMessage(parsed.error)}`,
    );
  }
}

function parseActivationRequest(input: SnapshotActivationRequest): SnapshotActivationRequest {
  return captureMutationInput(
    input,
    SnapshotActivationRequestSchema,
    "invalid_activation_request",
    "Activation request",
  );
}

function recordAt<T extends DurableAuditRecord>(
  transactionId: string,
  position: RecordChainPosition,
  content: DurableAuditRecordContent<T>,
): T {
  return createDurableAuditRecord<T>({
    ...content,
    transactionId,
    sequence: position.sequence,
    previousRecordFingerprint: position.previousRecordFingerprint,
  } as UnsignedDurableAuditRecord<T>);
}

function replayHead(replay: DurableRegistryReplayResult): RecordChainPosition {
  return {
    sequence: replay.lastCommittedAuditSequence + 1,
    previousRecordFingerprint: replay.lastRecordFingerprint,
  };
}

function afterRecord(record: DurableAuditRecord): RecordChainPosition {
  return {
    sequence: record.sequence + 1,
    previousRecordFingerprint: record.recordFingerprint,
  };
}

function singleRecordEnvelope<T extends DurableAuditRecord>(
  replay: DurableRegistryReplayResult,
  transactionType: RegistryTransactionType,
  transactionId: string,
  content: DurableAuditRecordContent<T>,
  committedAt: string,
): { envelope: ReturnType<typeof createCommittedRegistryTransactionEnvelope>; record: T } {
  const record = recordAt<T>(transactionId, replayHead(replay), content);
  const envelope = createCommittedRegistryTransactionEnvelope({
    transactionType,
    transactionId,
    records: [record],
    committedAt,
  });
  return { envelope, record };
}

function existingIdempotentEnvelope(
  state: GovernedDurableSnapshotRegistryVerifiedState,
  proposed: ReturnType<typeof createCommittedRegistryTransactionEnvelope>,
): ReturnType<typeof createCommittedRegistryTransactionEnvelope> | null {
  const existing = state.envelopes.find(
    (envelope) => envelope.transactionId === proposed.transactionId,
  );
  if (existing === undefined) return null;
  try {
    assertCommittedRegistryTransactionIdempotency(existing, proposed);
  } catch (error) {
    if (error instanceof DurableRegistryConflictError) {
      throw new GovernedDurableRegistryPreconditionError(error.code, error.message);
    }
    throw error;
  }
  return existing;
}

function precondition(code: string, message: string): never {
  throw new GovernedDurableRegistryPreconditionError(code, message);
}

function snapshotRegistration(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
): DurableSnapshotRegistrationRecord | null {
  return (
    replay.snapshotRegistrations.find(
      (registration) => registration.snapshot.snapshotId === snapshotId,
    ) ?? null
  );
}

function requireSnapshotRegistration(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
): DurableSnapshotRegistrationRecord {
  const registration = snapshotRegistration(replay, snapshotId);
  if (registration === null) {
    precondition(
      "snapshot_not_registered",
      `Snapshot ${snapshotId} must be registered before this governed operation`,
    );
  }
  return registration;
}

function snapshotStatus(replay: DurableRegistryReplayResult, snapshotId: string): string | null {
  return replay.snapshotStates.find((state) => state.snapshotId === snapshotId)?.status ?? null;
}

function requireSnapshotStatus(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
  expected: string,
  code: string,
): void {
  requireSnapshotRegistration(replay, snapshotId);
  const actual = snapshotStatus(replay, snapshotId);
  if (actual !== expected) {
    precondition(
      code,
      `Snapshot ${snapshotId} must be ${expected}; recovered lifecycle state is ${actual}`,
    );
  }
}

function selectedReviewTransition(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
): DurableLifecycleTransitionRecord | null {
  return (
    replay.lifecycleHistory.find(
      (transition) => transition.snapshotId === snapshotId && transition.to === "reviewing",
    ) ?? null
  );
}

function candidateDecision(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
): DurableReviewDecisionRecord | null {
  return (
    replay.reviewDecisionHistory.find(
      (decision) => decision.reviewDecision.proposedSnapshotId === snapshotId,
    ) ?? null
  );
}

function requireReviewSelection(
  replay: DurableRegistryReplayResult,
  snapshotId: string,
  changeSetId: string,
  changeSetFingerprint: string,
): void {
  const review = selectedReviewTransition(replay, snapshotId);
  if (
    review === null ||
    review.evidence.changeSetId !== changeSetId ||
    review.evidence.changeSetFingerprint !== changeSetFingerprint
  ) {
    precondition(
      "review_change_set_mismatch",
      "The governed operation must use the exact immutable change set selected when review began",
    );
  }
}

function requireCurrentReviewBaseline(
  replay: DurableRegistryReplayResult,
  changeSet: DurableGovernedChangeSetRecord,
): void {
  if (changeSet.evidence.evidenceType === "bootstrap") {
    if (replay.activeSnapshotId !== null) {
      precondition(
        "review_baseline_mismatch",
        "Bootstrap governance is valid only while no active snapshot exists",
      );
    }
    return;
  }
  if (changeSet.evidence.changeSet.sourceSnapshotId !== replay.activeSnapshotId) {
    precondition(
      "review_baseline_mismatch",
      "Replacement governance must bind the currently active snapshot baseline",
    );
  }
}

function exactChangeSet(
  replay: DurableRegistryReplayResult,
  changeSetId: string,
  changeSetFingerprint: string,
  targetSnapshotId: string,
): DurableGovernedChangeSetRecord {
  const changeSet = replay.governedChangeSetHistory.find(
    (record) => record.changeSetId === changeSetId,
  );
  if (changeSet === undefined) {
    precondition("change_set_not_found", `Governed change set ${changeSetId} is not committed`);
  }
  if (changeSet.recordFingerprint !== changeSetFingerprint) {
    precondition(
      "change_set_fingerprint_mismatch",
      `Governed change set ${changeSetId} does not match the requested fingerprint`,
    );
  }
  if (changeSet.evidence.changeSet.targetSnapshotId !== targetSnapshotId) {
    precondition(
      "change_set_binding_mismatch",
      "Governed change-set target does not match the candidate snapshot",
    );
  }
  return changeSet;
}

function activationRejected(
  request: SnapshotActivationRequest,
  currentActiveSnapshotId: string | null,
  failureCode: string,
  message: string,
): SnapshotActivationResult {
  return deepFreeze(
    SnapshotActivationResultSchema.parse({
      schemaVersion: "1.0",
      status: "rejected",
      transactionId: request.transactionId,
      candidateSnapshotId: request.candidateSnapshotId,
      currentActiveSnapshotId,
      failureCode,
      message,
      rejectedAt: request.requestedAt,
    }),
  );
}

function activationCommittedResult(
  envelope: ReturnType<typeof createCommittedRegistryTransactionEnvelope>,
  status: "committed" | "replayed",
): SnapshotActivationResult {
  const audit = envelope.records.at(-1);
  if (envelope.transactionType !== "activation" || audit?.recordType !== "activation_audit") {
    throw new DurableRegistryValidationError(
      "invalid_activation_transaction",
      "Activation result requires a complete committed activation envelope",
      { transactionId: envelope.transactionId },
    );
  }
  return deepFreeze(
    SnapshotActivationResultSchema.parse({
      schemaVersion: "1.0",
      status,
      transactionId: envelope.transactionId,
      activationId: audit.activationId,
      candidateSnapshotId: audit.candidateSnapshotId,
      previousActiveSnapshotId: audit.previousActiveSnapshotId,
      activeSnapshotId: audit.resultingActiveSnapshotId,
      firstSequence: envelope.firstSequence,
      lastSequence: envelope.lastSequence,
      activationRecordFingerprint: audit.recordFingerprint,
      transactionEnvelopeFingerprint: envelope.envelopeFingerprint,
      committedAt: envelope.committedAt,
    }),
  );
}

class PortGovernedDurableSnapshotRegistry implements GovernedDurableSnapshotRegistry {
  readonly #storage: GovernedDurableSnapshotRegistryStoragePort;
  readonly #beforeWriterAcquisition: BeforeWriterAcquisition | undefined;

  public constructor(
    storage: GovernedDurableSnapshotRegistryStoragePort,
    beforeWriterAcquisition?: BeforeWriterAcquisition,
  ) {
    this.#storage = storage;
    this.#beforeWriterAcquisition = beforeWriterAcquisition;
  }

  async #runCapturedMutation<T extends { readonly transactionId: string }, Result>(
    input: T,
    operation: (writer: GovernedDurableSnapshotRegistryWriterPort) => Promise<Result>,
  ): Promise<Result> {
    await this.#beforeWriterAcquisition?.(input.transactionId);
    return this.#storage.withExclusiveWriter(operation);
  }

  public registerSnapshot(
    input: RegisterGovernedSnapshotInput,
  ): Promise<DurableSnapshotRegistrationRecord> {
    const captured = captureMutationInput(
      input,
      RegisterGovernedSnapshotInputSchema,
      "invalid_registration_input",
      "Snapshot registration input",
      (raw) => validateManifestEvidenceBeforeClone(raw.manifestEvidence),
    );
    return this.#commitSnapshotRegistration(captured);
  }

  async #commitSnapshotRegistration(
    input: RegisterGovernedSnapshotInput,
  ): Promise<DurableSnapshotRegistrationRecord> {
    return this.#runCapturedMutation(input, async (writer) => {
      const state = await writer.readVerifiedState();
      const manifestFingerprint = createDurableSnapshotManifestFingerprint(input.manifestEvidence);
      const { envelope, record } = singleRecordEnvelope<DurableSnapshotRegistrationRecord>(
        state.replay,
        "registration",
        input.transactionId,
        {
          schemaVersion: "1.0",
          recordType: "snapshot_registration",
          registrationId: `registration-${input.snapshot.snapshotId}`,
          snapshotContractVersion: "1.0",
          snapshot: input.snapshot,
          manifestEvidence: input.manifestEvidence,
          manifestFingerprint,
          provenanceSummary: {
            corpusId: input.snapshot.corpusId,
            corpusVersion: input.snapshot.corpusVersion,
            sourceManifestReference: input.snapshot.sourceManifestReference,
            snapshotCreatedAt: input.snapshot.creation.createdAt,
            snapshotCreatedBy: input.snapshot.creation.createdBy,
          },
          actorId: input.actorId,
          actorType: input.actorType,
          reason: input.reason,
          registeredAt: input.registeredAt,
        },
        input.registeredAt,
      );
      const existingTransaction = existingIdempotentEnvelope(state, envelope);
      if (existingTransaction !== null) {
        const existingRecord = existingTransaction.records[0];
        if (existingRecord?.recordType !== "snapshot_registration") {
          precondition(
            "transaction_id_conflict",
            "Registration transaction identity belongs to another operation",
          );
        }
        return immutableCopy(existingRecord);
      }
      const existingSnapshot = snapshotRegistration(state.replay, input.snapshot.snapshotId);
      if (existingSnapshot !== null) {
        precondition(
          "snapshot_registration_conflict",
          `Snapshot ${input.snapshot.snapshotId} already has immutable registration evidence`,
        );
      }
      await writer.appendCommittedEnvelope(envelope);
      return immutableCopy(record);
    });
  }

  public recordGovernedChangeSet(
    input: RecordGovernedChangeSetInput,
  ): Promise<DurableGovernedChangeSetRecord> {
    const captured = captureMutationInput(
      input,
      RecordGovernedChangeSetInputSchema,
      "invalid_change_set_input",
      "Governed change-set input",
    );
    return this.#commitGovernedChangeSet(captured);
  }

  async #commitGovernedChangeSet(
    input: RecordGovernedChangeSetInput,
  ): Promise<DurableGovernedChangeSetRecord> {
    return this.#runCapturedMutation(input, async (writer) => {
      const state = await writer.readVerifiedState();
      const { envelope, record } = singleRecordEnvelope<DurableGovernedChangeSetRecord>(
        state.replay,
        "change_set",
        input.transactionId,
        {
          schemaVersion: "1.0",
          recordType: "governed_change_set",
          changeSetId: input.evidence.changeSet.changeId,
          evidence: input.evidence,
          actorId: input.actorId,
          actorType: input.actorType,
          reason: input.reason,
          recordedAt: input.recordedAt,
        },
        input.recordedAt,
      );
      const existingTransaction = existingIdempotentEnvelope(state, envelope);
      if (existingTransaction !== null) {
        const existingRecord = existingTransaction.records[0];
        if (existingRecord?.recordType !== "governed_change_set") {
          precondition(
            "transaction_id_conflict",
            "Change-set transaction identity belongs to another operation",
          );
        }
        return immutableCopy(existingRecord);
      }
      if (
        state.replay.governedChangeSetHistory.some(
          (candidate) => candidate.changeSetId === record.changeSetId,
        )
      ) {
        precondition(
          "change_set_id_conflict",
          `Governed change-set identity ${record.changeSetId} already exists`,
        );
      }
      await writer.appendCommittedEnvelope(envelope);
      return immutableCopy(record);
    });
  }

  async #commitLifecycleTransition(
    input: GovernedLifecycleTransitionInput | BeginGovernedSnapshotReviewInput,
    from: "created" | "validated" | "superseded",
    to: "validated" | "reviewing" | "archived",
    invalidStateCode: string,
  ): Promise<StandaloneDurableLifecycleTransitionRecord> {
    return this.#runCapturedMutation(input, async (writer) => {
      const state = await writer.readVerifiedState();
      const changeSetId = "changeSetId" in input ? input.changeSetId : null;
      const changeSetFingerprint =
        "changeSetFingerprint" in input ? input.changeSetFingerprint : null;
      const { envelope, record } = singleRecordEnvelope<StandaloneDurableLifecycleTransitionRecord>(
        state.replay,
        "lifecycle",
        input.transactionId,
        {
          schemaVersion: "1.0",
          recordType: "lifecycle_transition",
          transitionId: input.transitionId,
          snapshotId: input.snapshotId,
          from,
          to,
          actorId: input.actorId,
          actorType: input.actorType,
          reason: input.reason,
          transitionedAt: input.transitionedAt,
          evidence: {
            changeSetId,
            changeSetFingerprint,
            decisionId: null,
            decisionFingerprint: null,
            activationId: null,
          },
        } as DurableAuditRecordContent<StandaloneDurableLifecycleTransitionRecord>,
        input.transitionedAt,
      );
      const existingTransaction = existingIdempotentEnvelope(state, envelope);
      if (existingTransaction !== null) {
        const existingRecord = existingTransaction.records[0];
        if (existingRecord?.recordType !== "lifecycle_transition") {
          precondition(
            "transaction_id_conflict",
            "Lifecycle transaction identity belongs to another operation",
          );
        }
        return immutableCopy(existingRecord as StandaloneDurableLifecycleTransitionRecord);
      }

      requireSnapshotStatus(state.replay, input.snapshotId, from, invalidStateCode);
      const existingDecision = candidateDecision(state.replay, input.snapshotId);
      if (existingDecision?.reviewDecision.decision === "rejected") {
        precondition(
          "candidate_review_rejected",
          "A rejected snapshot cannot advance to another lifecycle state",
        );
      }
      if (to === "reviewing") {
        const changeSet = exactChangeSet(
          state.replay,
          changeSetId!,
          changeSetFingerprint!,
          input.snapshotId,
        );
        requireCurrentReviewBaseline(state.replay, changeSet);
      }
      await writer.appendCommittedEnvelope(envelope);
      return immutableCopy(record);
    });
  }

  public validateSnapshot(
    input: GovernedLifecycleTransitionInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord> {
    const captured = captureMutationInput(
      input,
      GovernedLifecycleTransitionInputSchema,
      "invalid_validation_input",
      "Snapshot validation input",
    );
    return this.#commitLifecycleTransition(
      captured,
      "created",
      "validated",
      "snapshot_not_created",
    );
  }

  public beginSnapshotReview(
    input: BeginGovernedSnapshotReviewInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord> {
    const captured = captureMutationInput(
      input,
      BeginGovernedSnapshotReviewInputSchema,
      "invalid_review_input",
      "Begin-review input",
    );
    return this.#commitLifecycleTransition(
      captured,
      "validated",
      "reviewing",
      "snapshot_not_validated",
    );
  }

  public archiveSnapshot(
    input: GovernedLifecycleTransitionInput,
  ): Promise<StandaloneDurableLifecycleTransitionRecord> {
    const captured = captureMutationInput(
      input,
      GovernedLifecycleTransitionInputSchema,
      "invalid_archive_input",
      "Snapshot archival input",
    );
    return this.#commitLifecycleTransition(
      captured,
      "superseded",
      "archived",
      "snapshot_not_superseded",
    );
  }

  async #recordDecision(
    input: ApproveGovernedSnapshotInput | RejectGovernedSnapshotInput,
    decision: "approved" | "rejected",
  ): Promise<ApprovalDecisionTransactionRecords | DurableRejectionDecisionRecord> {
    return this.#runCapturedMutation(input, async (writer) => {
      const state = await writer.readVerifiedState();
      const decisionRecord = recordAt<
        DurableApprovalDecisionRecord | DurableRejectionDecisionRecord
      >(input.transactionId, replayHead(state.replay), {
        schemaVersion: "1.0",
        recordType: "review_decision",
        decisionId: input.decisionId,
        reviewDecision: {
          changeId: input.changeSetId,
          proposedSnapshotId: input.snapshotId,
          decision,
          actorId: input.actorId,
          decidedAt: input.decidedAt,
          reason: input.reason,
        },
        changeSetFingerprint: input.changeSetFingerprint,
        proposedSnapshotFingerprint: input.snapshotFingerprint,
        actorId: input.actorId,
        actorType: input.actorType,
        reason: input.reason,
        decidedAt: input.decidedAt,
      } as DurableAuditRecordContent<
        DurableApprovalDecisionRecord | DurableRejectionDecisionRecord
      >);
      const records: DurableAuditRecord[] = [decisionRecord];
      if (decision === "approved") {
        const approvalInput = input as ApproveGovernedSnapshotInput;
        records.push(
          recordAt<DurableLifecycleTransitionRecord>(
            input.transactionId,
            afterRecord(decisionRecord),
            {
              schemaVersion: "1.0",
              recordType: "lifecycle_transition",
              transitionId: approvalInput.approvalTransitionId,
              snapshotId: input.snapshotId,
              from: "reviewing",
              to: "approved",
              actorId: input.actorId,
              actorType: input.actorType,
              reason: input.reason,
              transitionedAt: input.decidedAt,
              evidence: {
                changeSetId: input.changeSetId,
                changeSetFingerprint: input.changeSetFingerprint,
                decisionId: input.decisionId,
                decisionFingerprint: decisionRecord.recordFingerprint,
                activationId: null,
              },
            },
          ),
        );
      }
      const envelope = createCommittedRegistryTransactionEnvelope({
        transactionType: "decision",
        transactionId: input.transactionId,
        records,
        committedAt: input.decidedAt,
      });
      const existingTransaction = existingIdempotentEnvelope(state, envelope);
      if (existingTransaction !== null) {
        if (decision === "approved") {
          return immutableCopy(
            ApprovalDecisionTransactionRecordsSchema.parse(existingTransaction.records),
          );
        }
        return immutableCopy(
          RejectionDecisionTransactionRecordsSchema.parse(existingTransaction.records)[0],
        );
      }

      const registration = requireSnapshotRegistration(state.replay, input.snapshotId);
      if (registration.snapshot.contentFingerprint !== input.snapshotFingerprint) {
        precondition(
          "snapshot_fingerprint_mismatch",
          "Review decision candidate fingerprint does not match immutable registration evidence",
        );
      }
      requireSnapshotStatus(state.replay, input.snapshotId, "reviewing", "snapshot_not_reviewing");
      const existingDecision = candidateDecision(state.replay, input.snapshotId);
      if (existingDecision !== null) {
        precondition(
          existingDecision.reviewDecision.decision === "rejected"
            ? "candidate_review_rejected"
            : "candidate_already_decided",
          "A snapshot review can have only one immutable human decision",
        );
      }
      if (
        state.replay.reviewDecisionHistory.some((record) => record.decisionId === input.decisionId)
      ) {
        precondition(
          "decision_id_conflict",
          `Decision identity ${input.decisionId} is already committed`,
        );
      }
      const changeSet = exactChangeSet(
        state.replay,
        input.changeSetId,
        input.changeSetFingerprint,
        input.snapshotId,
      );
      requireReviewSelection(
        state.replay,
        input.snapshotId,
        input.changeSetId,
        input.changeSetFingerprint,
      );
      requireCurrentReviewBaseline(state.replay, changeSet);
      await writer.appendCommittedEnvelope(envelope);
      if (decision === "approved") {
        return immutableCopy(ApprovalDecisionTransactionRecordsSchema.parse(records));
      }
      return immutableCopy(RejectionDecisionTransactionRecordsSchema.parse(records)[0]);
    });
  }

  public approveSnapshot(
    input: ApproveGovernedSnapshotInput,
  ): Promise<ApprovalDecisionTransactionRecords> {
    const captured = captureMutationInput(
      input,
      ApproveGovernedSnapshotInputSchema,
      "invalid_approval_input",
      "Snapshot approval input",
    );
    return this.#recordDecision(
      captured,
      "approved",
    ) as Promise<ApprovalDecisionTransactionRecords>;
  }

  public rejectSnapshot(
    input: RejectGovernedSnapshotInput,
  ): Promise<DurableRejectionDecisionRecord> {
    const captured = captureMutationInput(
      input,
      RejectGovernedSnapshotInputSchema,
      "invalid_rejection_input",
      "Snapshot rejection input",
    );
    return this.#recordDecision(captured, "rejected") as Promise<DurableRejectionDecisionRecord>;
  }

  #buildActivationEnvelope(
    replay: DurableRegistryReplayResult,
    request: SnapshotActivationRequest,
  ): ReturnType<typeof createCommittedRegistryTransactionEnvelope> {
    const candidateTransition = recordAt<DurableLifecycleTransitionRecord>(
      request.transactionId,
      replayHead(replay),
      {
        schemaVersion: "1.0",
        recordType: "lifecycle_transition",
        transitionId: `transition-activate-${request.activationId}`,
        snapshotId: request.candidateSnapshotId,
        from: "approved",
        to: "active",
        actorId: request.actorId,
        actorType: request.actorType,
        reason: request.reason,
        transitionedAt: request.requestedAt,
        evidence: {
          changeSetId: request.changeSetId,
          changeSetFingerprint: request.changeSetFingerprint,
          decisionId: request.approvalDecisionId,
          decisionFingerprint: request.approvalDecisionFingerprint,
          activationId: request.activationId,
        },
      },
    );
    const records: DurableAuditRecord[] = [candidateTransition];
    let previousActiveSupersessionTransitionId: string | null = null;
    if (request.baselineSnapshotId !== null) {
      previousActiveSupersessionTransitionId = `transition-supersede-${request.activationId}`;
      records.push(
        recordAt<DurableLifecycleTransitionRecord>(
          request.transactionId,
          afterRecord(candidateTransition),
          {
            schemaVersion: "1.0",
            recordType: "lifecycle_transition",
            transitionId: previousActiveSupersessionTransitionId,
            snapshotId: request.baselineSnapshotId,
            from: "active",
            to: "superseded",
            actorId: request.actorId,
            actorType: request.actorType,
            reason: request.reason,
            transitionedAt: request.requestedAt,
            evidence: {
              changeSetId: null,
              changeSetFingerprint: null,
              decisionId: null,
              decisionFingerprint: null,
              activationId: request.activationId,
            },
          },
        ),
      );
    }
    const previous = records.at(-1)!;
    records.push(
      recordAt<ActivationAuditRecord>(request.transactionId, afterRecord(previous), {
        schemaVersion: "1.0",
        recordType: "activation_audit",
        activationId: request.activationId,
        candidateSnapshotId: request.candidateSnapshotId,
        candidateSnapshotFingerprint: request.candidateSnapshotFingerprint,
        previousActiveSnapshotId: request.baselineSnapshotId,
        previousActiveSnapshotFingerprint: request.baselineSnapshotFingerprint,
        expectedActiveSnapshotId: request.expectedActiveSnapshotId,
        changeSetType: request.changeSetType,
        changeSetId: request.changeSetId,
        changeSetFingerprint: request.changeSetFingerprint,
        approvalDecisionId: request.approvalDecisionId,
        approvalDecisionFingerprint: request.approvalDecisionFingerprint,
        candidateActivationTransitionId: candidateTransition.transitionId,
        previousActiveSupersessionTransitionId,
        resultingActiveSnapshotId: request.candidateSnapshotId,
        actorId: request.actorId,
        actorType: request.actorType,
        reason: request.reason,
        activatedAt: request.requestedAt,
      }),
    );
    return createCommittedRegistryTransactionEnvelope({
      transactionType: "activation",
      transactionId: request.transactionId,
      records,
      committedAt: request.requestedAt,
    });
  }

  #activationPreconditionFailure(
    replay: DurableRegistryReplayResult,
    request: SnapshotActivationRequest,
  ): SnapshotActivationResult | null {
    const currentActiveSnapshotId = replay.activeSnapshotId;
    if (request.expectedActiveSnapshotId !== currentActiveSnapshotId) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "stale_active_snapshot",
        "The expected active snapshot does not match complete recovered state",
      );
    }

    const candidate = snapshotRegistration(replay, request.candidateSnapshotId);
    if (candidate === null) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "candidate_not_registered",
        "The activation candidate is not registered",
      );
    }
    if (candidate.snapshot.contentFingerprint !== request.candidateSnapshotFingerprint) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "candidate_fingerprint_mismatch",
        "The activation candidate fingerprint does not match immutable registration evidence",
      );
    }
    const status = snapshotStatus(replay, request.candidateSnapshotId);
    const decisionForCandidate = candidateDecision(replay, request.candidateSnapshotId);
    if (
      status === "superseded" ||
      status === "archived" ||
      decisionForCandidate?.reviewDecision.decision === "rejected"
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "candidate_terminal_state",
        `The activation candidate is terminal in recovered ${status} state`,
      );
    }
    if (status !== "approved") {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "candidate_not_approved",
        `The activation candidate must be approved; recovered lifecycle state is ${status}`,
      );
    }

    if (request.baselineSnapshotId !== null) {
      const baseline = snapshotRegistration(replay, request.baselineSnapshotId);
      if (baseline === null) {
        return activationRejected(
          request,
          currentActiveSnapshotId,
          "baseline_not_registered",
          "The governed activation baseline is not registered",
        );
      }
      if (baseline.snapshot.contentFingerprint !== request.baselineSnapshotFingerprint) {
        return activationRejected(
          request,
          currentActiveSnapshotId,
          "baseline_fingerprint_mismatch",
          "The governed activation baseline fingerprint does not match registration evidence",
        );
      }
      if (snapshotStatus(replay, request.baselineSnapshotId) !== "active") {
        return activationRejected(
          request,
          currentActiveSnapshotId,
          "baseline_not_active",
          "The governed activation baseline is not active in recovered lifecycle state",
        );
      }
    }

    const changeSet = replay.governedChangeSetHistory.find(
      (record) => record.changeSetId === request.changeSetId,
    );
    if (changeSet === undefined) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "change_set_not_found",
        "The approved governed change set is not committed",
      );
    }
    if (changeSet.recordFingerprint !== request.changeSetFingerprint) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "change_set_fingerprint_mismatch",
        "The approved governed change-set fingerprint does not match committed evidence",
      );
    }
    const changeSetEvidence = changeSet.evidence;
    const changeSetPayload = changeSetEvidence.changeSet;
    const expectedBaselineId =
      changeSetEvidence.evidenceType === "bootstrap"
        ? null
        : changeSetEvidence.changeSet.sourceSnapshotId;
    const expectedBaselineFingerprint =
      changeSetEvidence.evidenceType === "bootstrap"
        ? null
        : changeSetEvidence.changeSet.sourceSnapshotFingerprint;
    if (
      changeSetEvidence.evidenceType !== request.changeSetType ||
      changeSetPayload.targetSnapshotId !== request.candidateSnapshotId ||
      changeSetPayload.targetSnapshotFingerprint !== request.candidateSnapshotFingerprint ||
      expectedBaselineId !== request.baselineSnapshotId ||
      expectedBaselineFingerprint !== request.baselineSnapshotFingerprint ||
      !changeSetPayload.changed
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "change_set_binding_mismatch",
        "The governed change set does not bind the requested baseline and candidate fingerprints",
      );
    }
    const review = selectedReviewTransition(replay, request.candidateSnapshotId);
    if (
      review === null ||
      review.evidence.changeSetId !== request.changeSetId ||
      review.evidence.changeSetFingerprint !== request.changeSetFingerprint
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "review_change_set_mismatch",
        "Activation evidence differs from the change set selected when review began",
      );
    }

    const decision = replay.reviewDecisionHistory.find(
      (record) => record.decisionId === request.approvalDecisionId,
    );
    if (decision === undefined) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "approval_decision_not_found",
        "The approval decision is not committed",
      );
    }
    if (
      decision.recordFingerprint !== request.approvalDecisionFingerprint ||
      decision.reviewDecision.decision !== "approved" ||
      decision.reviewDecision.changeId !== request.changeSetId ||
      decision.reviewDecision.proposedSnapshotId !== request.candidateSnapshotId ||
      decision.proposedSnapshotFingerprint !== request.candidateSnapshotFingerprint ||
      decision.changeSetFingerprint !== request.changeSetFingerprint
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "decision_binding_mismatch",
        "The approval decision does not bind the requested candidate and governed change set",
      );
    }
    const approvalTransition = replay.lifecycleHistory.find(
      (transition) =>
        transition.snapshotId === request.candidateSnapshotId &&
        transition.from === "reviewing" &&
        transition.to === "approved",
    );
    if (
      approvalTransition === undefined ||
      approvalTransition.evidence.changeSetId !== request.changeSetId ||
      approvalTransition.evidence.changeSetFingerprint !== request.changeSetFingerprint ||
      approvalTransition.evidence.decisionId !== request.approvalDecisionId ||
      approvalTransition.evidence.decisionFingerprint !== request.approvalDecisionFingerprint ||
      approvalTransition.actorId !== decision.actorId ||
      approvalTransition.actorType !== decision.actorType ||
      approvalTransition.reason !== decision.reason ||
      approvalTransition.transitionedAt !== decision.decidedAt
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "approval_lifecycle_binding_mismatch",
        "The approved lifecycle transition does not exactly match its immutable decision evidence",
      );
    }
    const baselineLastTransition =
      request.baselineSnapshotId === null
        ? null
        : (replay.lifecycleHistory
            .filter((transition) => transition.snapshotId === request.baselineSnapshotId)
            .at(-1) ?? null);
    if (
      Date.parse(approvalTransition.transitionedAt) >= Date.parse(request.requestedAt) ||
      (baselineLastTransition !== null &&
        Date.parse(baselineLastTransition.transitionedAt) >= Date.parse(request.requestedAt))
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "activation_timestamp_mismatch",
        "Activation time must be later than candidate approval and baseline lifecycle evidence",
      );
    }
    if (
      replay.activationHistory.some(
        (activation) => activation.activationId === request.activationId,
      )
    ) {
      return activationRejected(
        request,
        currentActiveSnapshotId,
        "activation_id_conflict",
        `Activation identity ${request.activationId} is already committed by another transaction`,
      );
    }
    return null;
  }

  public activateSnapshot(input: SnapshotActivationRequest): Promise<SnapshotActivationResult> {
    const request = parseActivationRequest(input);
    return this.#commitActivation(request);
  }

  async #commitActivation(request: SnapshotActivationRequest): Promise<SnapshotActivationResult> {
    return this.#runCapturedMutation(request, async (writer) => {
      const state = await writer.readVerifiedState();
      const envelope = this.#buildActivationEnvelope(state.replay, request);
      const existingTransaction = existingIdempotentEnvelope(state, envelope);
      if (existingTransaction !== null) {
        return activationCommittedResult(existingTransaction, "replayed");
      }
      const rejected = this.#activationPreconditionFailure(state.replay, request);
      if (rejected !== null) return rejected;

      const committed = await writer.appendCommittedEnvelope(envelope);
      return activationCommittedResult(committed, "committed");
    });
  }

  public activate(input: SnapshotActivationRequest): Promise<SnapshotActivationResult> {
    const request = parseActivationRequest(input);
    return this.#commitActivation(request);
  }

  public async getSnapshot(snapshotId: string): Promise<DurableSnapshotRegistrationRecord | null> {
    const { replay } = await this.#storage.readVerifiedState();
    const registration = snapshotRegistration(replay, snapshotId);
    return registration === null ? null : immutableCopy(registration);
  }

  public async listSnapshots(): Promise<readonly DurableSnapshotRegistrationRecord[]> {
    const { replay } = await this.#storage.readVerifiedState();
    return immutableCopy(
      [...replay.snapshotRegistrations].sort((left, right) =>
        compareStrings(left.snapshot.snapshotId, right.snapshot.snapshotId),
      ),
    );
  }

  public async getLifecycleHistory(
    snapshotId: string,
  ): Promise<readonly DurableLifecycleTransitionRecord[]> {
    const { replay } = await this.#storage.readVerifiedState();
    return immutableCopy(
      replay.lifecycleHistory.filter((transition) => transition.snapshotId === snapshotId),
    );
  }

  public async getReviewDecisionHistory(
    snapshotId: string,
  ): Promise<readonly DurableReviewDecisionRecord[]> {
    const { replay } = await this.#storage.readVerifiedState();
    return immutableCopy(
      replay.reviewDecisionHistory.filter(
        (decision) => decision.reviewDecision.proposedSnapshotId === snapshotId,
      ),
    );
  }

  public async getActivationHistory(): Promise<readonly ActivationAuditRecord[]> {
    const { replay } = await this.#storage.readVerifiedState();
    return immutableCopy(replay.activationHistory);
  }

  public async getGovernedChangeSet(
    changeSetId: string,
  ): Promise<DurableGovernedChangeSetRecord | null> {
    const { replay } = await this.#storage.readVerifiedState();
    const changeSet = replay.governedChangeSetHistory.find(
      (record) => record.changeSetId === changeSetId,
    );
    return changeSet === undefined ? null : immutableCopy(changeSet);
  }

  public async getCurrentActiveSnapshot(): Promise<DurableSnapshotRegistrationRecord | null> {
    const { replay } = await this.#storage.readVerifiedState();
    if (replay.activeSnapshotId === null) return null;
    const registration = snapshotRegistration(replay, replay.activeSnapshotId);
    if (registration === null) {
      throw new DurableRegistryValidationError(
        "active_snapshot_not_registered",
        "Verified active state does not resolve to immutable registration evidence",
      );
    }
    return immutableCopy(registration);
  }

  public async verifyIntegrity(): Promise<RegistryIntegrityResult> {
    return this.#storage.verifyIntegrity();
  }

  public async recover(): Promise<RegistryRecoveryResult> {
    return this.#storage.recover();
  }

  public async inspectDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    return this.#storage.inspectDerivedIndex();
  }

  public async rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    return this.#storage.rebuildDerivedIndex();
  }
}

async function openRegistry(
  options: LocalFileRegistryOptions,
  transactionFaultHooks?: TransactionFaultHooks,
): Promise<GovernedDurableSnapshotRegistry> {
  const storage = await LocalFileRegistryStorage.open(options);
  return new PortGovernedDurableSnapshotRegistry(
    transactionFaultHooks === undefined
      ? storage
      : adaptLocalStorageFaultHooks(storage, transactionFaultHooks),
    transactionFaultHooks === undefined
      ? undefined
      : (transactionId) => transactionFaultHooks(transactionId)?.onBeforeWriterLock?.(),
  );
}

function adaptLocalStorageFaultHooks(
  storage: LocalFileRegistryStorage,
  transactionFaultHooks: TransactionFaultHooks,
): GovernedDurableSnapshotRegistryStoragePort {
  return {
    inspectDerivedIndex: () => storage.inspectDerivedIndex(),
    readVerifiedState: () => storage.readVerifiedState(),
    rebuildDerivedIndex: () => storage.rebuildDerivedIndex(),
    recover: () => storage.recover(),
    verifyIntegrity: () => storage.verifyIntegrity(),
    withExclusiveWriter: (operation) =>
      storage.withExclusiveWriter((writer) =>
        operation({
          appendCommittedEnvelope: (input) =>
            writer.appendCommittedEnvelope(input, transactionFaultHooks(input.transactionId) ?? {}),
          readVerifiedState: () => writer.readVerifiedState(),
        }),
      ),
  };
}

/** Direct-module test seam. Deliberately omitted from the package-root export surface. */
export function createGovernedDurableSnapshotRegistryForTesting(
  storage: GovernedDurableSnapshotRegistryStoragePort,
): GovernedDurableSnapshotRegistry {
  return new PortGovernedDurableSnapshotRegistry(storage);
}

export async function openGovernedDurableSnapshotRegistry(
  options: LocalFileRegistryOptions,
): Promise<GovernedDurableSnapshotRegistry> {
  return openRegistry(options);
}

/** Direct-module test seam. Deliberately omitted from the package-root export surface. */
export async function openGovernedDurableSnapshotRegistryForTesting(
  options: LocalFileRegistryOptions,
  transactionFaultHooks: TransactionFaultHooks,
): Promise<GovernedDurableSnapshotRegistry> {
  return openRegistry(options, transactionFaultHooks);
}
