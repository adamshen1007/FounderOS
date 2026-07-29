import type {
  CommittedRegistryTransactionEnvelope,
  DerivedRegistryIndexResult,
  RegistryIntegrityResult,
  RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import type { DurableRegistryReplayResult } from "../domain/durable-registry.js";

export interface GovernedDurableSnapshotRegistryVerifiedState {
  readonly envelopes: readonly CommittedRegistryTransactionEnvelope[];
  readonly replay: DurableRegistryReplayResult;
}

export interface GovernedDurableSnapshotRegistryWriterPort {
  appendCommittedEnvelope(
    input: CommittedRegistryTransactionEnvelope,
  ): Promise<CommittedRegistryTransactionEnvelope>;
  readVerifiedState(): Promise<GovernedDurableSnapshotRegistryVerifiedState>;
}

/** Engine-internal persistence boundary; deliberately omitted from package-root exports. */
export interface GovernedDurableSnapshotRegistryStoragePort {
  inspectDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  readVerifiedState(): Promise<GovernedDurableSnapshotRegistryVerifiedState>;
  rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  recover(): Promise<RegistryRecoveryResult>;
  recoverAtSequence(sequence: number): Promise<RegistryRecoveryResult>;
  verifyIntegrity(): Promise<RegistryIntegrityResult>;
  verifyIntegrityAtSequence(sequence: number): Promise<RegistryIntegrityResult>;
  withExclusiveWriter<T>(
    operation: (writer: GovernedDurableSnapshotRegistryWriterPort) => Promise<T>,
  ): Promise<T>;
}
