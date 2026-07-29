import type {
  DurableDeliveryDerivedIndex,
  DurableDeliveryLedgerEvent,
} from "@founderos/knowledge-schema";

import type { DurableDeliveryLedgerReplayState } from "../domain/durable-context-delivery-ledger.js";

export interface VerifiedDurableDeliveryLedgerState {
  readonly replay: DurableDeliveryLedgerReplayState;
  readonly derivedIndex: unknown;
}

export interface DurableDeliveryLedgerWriterPort {
  readVerifiedState(): Promise<VerifiedDurableDeliveryLedgerState>;
  appendAuthoritativeEvent(
    event: DurableDeliveryLedgerEvent,
    expected: { readonly ledgerSequence: number; readonly auditFingerprint: string },
  ): Promise<void>;
  replaceDerivedIndex(index: DurableDeliveryDerivedIndex): Promise<void>;
}

export interface DurableDeliveryLedgerStoragePort {
  readVerifiedState(): Promise<VerifiedDurableDeliveryLedgerState>;
  withWriter<T>(operation: (writer: DurableDeliveryLedgerWriterPort) => Promise<T>): Promise<T>;
}
