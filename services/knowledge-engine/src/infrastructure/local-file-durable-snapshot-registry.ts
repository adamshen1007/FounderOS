import type {
  ActivationAuditRecord,
  DerivedRegistryIndexResult,
  DurableGovernedChangeSetRecord,
  DurableLifecycleTransitionRecord,
  DurableReviewDecisionRecord,
  DurableSnapshotRegistrationRecord,
  DurableSnapshotRegistry,
  RegistryIntegrityResult,
  RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import {
  createCommittedRegistryTransactionEnvelope,
  serializeCanonicalDurablePayload,
  verifyDurableAuditRecordFingerprint,
} from "../domain/durable-registry.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import {
  LocalFileRegistryConflictError,
  LocalFileRegistryPathError,
  LocalFileRegistryStorage,
  LocalFileRegistryWriterLockError,
  type LocalFileRegistryOptions,
} from "./local-file-durable-snapshot-registry-internal.js";

type TaskThreeRegistryContract = Pick<
  DurableSnapshotRegistry,
  | "getActivationHistory"
  | "getCurrentActiveSnapshot"
  | "getGovernedChangeSet"
  | "getLifecycleHistory"
  | "getReviewDecisionHistory"
  | "getSnapshot"
  | "inspectDerivedIndex"
  | "listSnapshots"
  | "rebuildDerivedIndex"
  | "recover"
  | "verifyIntegrity"
> & {
  registerSnapshot(
    record: DurableSnapshotRegistrationRecord,
  ): Promise<DurableSnapshotRegistrationRecord>;
};

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export {
  LocalFileRegistryConflictError,
  LocalFileRegistryPathError,
  LocalFileRegistryWriterLockError,
};
export type { LocalFileRegistryOptions };

/**
 * Safe local persistence for the storage-independent durable registry contract.
 *
 * Task 3 deliberately exposes only immutable registration and read/recovery
 * operations. Governed lifecycle, decision, and activation entry points are added
 * at the application boundary in Task 4; the package root does not expose the raw
 * append primitive used underneath those operations.
 */
export class LocalFileDurableSnapshotRegistry implements TaskThreeRegistryContract {
  readonly #storage: LocalFileRegistryStorage;

  private constructor(storage: LocalFileRegistryStorage) {
    this.#storage = storage;
  }

  public static async open(
    options: LocalFileRegistryOptions,
  ): Promise<LocalFileDurableSnapshotRegistry> {
    return new LocalFileDurableSnapshotRegistry(await LocalFileRegistryStorage.open(options));
  }

  public async registerSnapshot(
    input: DurableSnapshotRegistrationRecord,
  ): Promise<DurableSnapshotRegistrationRecord> {
    const verified = verifyDurableAuditRecordFingerprint(input);
    if (verified.recordType !== "snapshot_registration") {
      throw new LocalFileRegistryConflictError(
        "invalid_registration_record",
        "Snapshot registration requires a durable snapshot-registration record",
      );
    }

    return this.#storage.withExclusiveWriter(async (writer) => {
      const state = await writer.readVerifiedState();
      const existing = state.replay.snapshotRegistrations.find(
        (record) => record.snapshot.snapshotId === verified.snapshot.snapshotId,
      );
      if (existing !== undefined) {
        if (
          serializeCanonicalDurablePayload(existing) !== serializeCanonicalDurablePayload(verified)
        ) {
          throw new LocalFileRegistryConflictError(
            "snapshot_registration_conflict",
            `Snapshot identity ${verified.snapshot.snapshotId} was already registered with different immutable evidence`,
          );
        }
        return immutableCopy(existing);
      }

      const envelope = createCommittedRegistryTransactionEnvelope({
        transactionType: "registration",
        transactionId: verified.transactionId,
        records: [verified],
        committedAt: verified.registeredAt,
      });
      await writer.appendCommittedEnvelope(envelope);
      return immutableCopy(verified);
    });
  }

  public async getSnapshot(snapshotId: string): Promise<DurableSnapshotRegistrationRecord | null> {
    const { replay } = await this.#storage.readVerifiedState();
    const registration = replay.snapshotRegistrations.find(
      (record) => record.snapshot.snapshotId === snapshotId,
    );
    return registration === undefined ? null : immutableCopy(registration);
  }

  public async listSnapshots(): Promise<readonly DurableSnapshotRegistrationRecord[]> {
    const { replay } = await this.#storage.readVerifiedState();
    return immutableCopy(replay.snapshotRegistrations);
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
    const record = replay.governedChangeSetHistory.find(
      (candidate) => candidate.changeSetId === changeSetId,
    );
    return record === undefined ? null : immutableCopy(record);
  }

  public async getCurrentActiveSnapshot(): Promise<DurableSnapshotRegistrationRecord | null> {
    const { replay } = await this.#storage.readVerifiedState();
    if (replay.activeSnapshotId === null) return null;
    const registration = replay.snapshotRegistrations.find(
      (record) => record.snapshot.snapshotId === replay.activeSnapshotId,
    );
    return registration === undefined ? null : immutableCopy(registration);
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
