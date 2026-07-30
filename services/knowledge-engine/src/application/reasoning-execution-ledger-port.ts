import type {
  DurableReasoningExecutionDerivedIndex,
  ReasoningExecutionLedgerEvent,
} from "@founderos/knowledge-schema";

import type { ReasoningExecutionLedgerReplayState } from "../domain/durable-reasoning-execution-ledger.js";
import type { ReasoningInvocationAuthority } from "../domain/durable-reasoning-execution-ledger.js";

export interface VerifiedReasoningExecutionLedgerState {
  readonly replay: ReasoningExecutionLedgerReplayState;
  readonly derivedIndex: unknown;
  readonly authoritativeCommitFingerprint: string;
}

export interface ReasoningExecutionLedgerWriterPort {
  readVerifiedState(): Promise<VerifiedReasoningExecutionLedgerState>;
  appendAuthoritativeEvent(
    event: ReasoningExecutionLedgerEvent,
    expected: { readonly ledgerSequence: number; readonly auditFingerprint: string },
    invocationAuthority?: ReasoningInvocationAuthority,
  ): Promise<void>;
  replaceDerivedIndex(index: DurableReasoningExecutionDerivedIndex): Promise<void>;
}

export interface ReasoningExecutionLedgerStoragePort {
  readVerifiedState(): Promise<VerifiedReasoningExecutionLedgerState>;
  withWriter<T>(operation: (writer: ReasoningExecutionLedgerWriterPort) => Promise<T>): Promise<T>;
}
