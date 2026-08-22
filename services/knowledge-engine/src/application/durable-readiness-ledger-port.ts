import type {
  ReadinessCommitMarker,
  ReadinessDerivedIndex,
  ReadinessLedgerEvent,
} from "@founderos/knowledge-schema";

import type { ReplayedReadinessLedgerState } from "../domain/durable-readiness-ledger.js";

export interface ReadinessLedgerStorageInspection {
  readonly state: ReplayedReadinessLedgerState;
  readonly authoritativeByteCount: number;
  readonly derivedIndexStatus: "valid" | "missing" | "invalid";
  readonly stagingOrphanCount: number;
  readonly installedUncommittedOrphanCount: number;
}

export interface ReadinessLedgerWriterPort {
  readonly inspection: ReadinessLedgerStorageInspection;
  commitEvent(event: ReadinessLedgerEvent): Promise<"valid" | "missing" | "invalid">;
  replaceDerivedState(
    marker: ReadinessCommitMarker,
    indexes: readonly ReadinessDerivedIndex[],
  ): Promise<void>;
}

export interface ReadinessLedgerStoragePort {
  inspect(): Promise<ReadinessLedgerStorageInspection>;
  withWriter<T>(operation: (writer: ReadinessLedgerWriterPort) => Promise<T>): Promise<T>;
}
