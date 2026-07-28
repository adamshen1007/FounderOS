import {
  KnowledgeSnapshotLifecycleTransitionSchema,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeRepositorySnapshot,
  type SnapshotLifecycleStatus,
} from "@founderos/knowledge-schema";

import {
  deepFreeze,
  KnowledgeSnapshotLifecycleError,
  parseKnowledgeRepositorySnapshot,
  parseKnowledgeSnapshotLifecycleRecord,
  parseWithSnapshotDomainError,
  type SnapshotLifecycleTransitionEvidence,
} from "../domain/snapshot-lifecycle.js";

const LIFECYCLE_STATES = [
  "created",
  "validated",
  "reviewing",
  "approved",
  "active",
  "superseded",
  "archived",
] as const;

export { type SnapshotLifecycleTransitionEvidence } from "../domain/snapshot-lifecycle.js";

export function createKnowledgeSnapshotLifecycleRecord(
  snapshotInput: KnowledgeRepositorySnapshot,
): KnowledgeSnapshotLifecycleRecord {
  const snapshot = parseKnowledgeRepositorySnapshot(
    snapshotInput,
    "Cannot create lifecycle record for invalid snapshot",
  );
  return deepFreeze(
    parseKnowledgeSnapshotLifecycleRecord(
      {
        snapshotId: snapshot.snapshotId,
        snapshotCreatedAt: snapshot.creation.createdAt,
        status: "created",
        transitions: [],
      },
      "Cannot create lifecycle record",
    ),
  );
}

/** Internal orchestration primitive. Public callers use state-specific operations. */
export function advanceKnowledgeSnapshotLifecycle(
  recordInput: KnowledgeSnapshotLifecycleRecord,
  snapshotInput: KnowledgeRepositorySnapshot,
  targetStatus: SnapshotLifecycleStatus,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotLifecycleRecord {
  const record = parseKnowledgeSnapshotLifecycleRecord(
    recordInput,
    "Cannot transition invalid lifecycle record",
  );
  const snapshot = parseKnowledgeRepositorySnapshot(
    snapshotInput,
    "Cannot transition lifecycle for invalid snapshot",
  );
  if (
    record.snapshotId !== snapshot.snapshotId ||
    record.snapshotCreatedAt !== snapshot.creation.createdAt
  ) {
    throw new KnowledgeSnapshotLifecycleError(
      "Cannot transition lifecycle record with different snapshot identity or creation evidence",
    );
  }

  const currentIndex = LIFECYCLE_STATES.indexOf(record.status);
  const nextStatus = LIFECYCLE_STATES[currentIndex + 1];
  if (nextStatus === undefined) {
    throw new KnowledgeSnapshotLifecycleError(
      "Cannot transition an archived snapshot lifecycle record",
    );
  }
  if (targetStatus !== nextStatus) {
    throw new KnowledgeSnapshotLifecycleError(
      `Cannot transition snapshot lifecycle from ${record.status} to ${targetStatus}`,
    );
  }

  const transition = parseWithSnapshotDomainError(
    KnowledgeSnapshotLifecycleTransitionSchema,
    { from: record.status, to: targetStatus, ...evidence },
    KnowledgeSnapshotLifecycleError,
    "Invalid lifecycle transition evidence",
  );
  const previousTemporalEvidence =
    record.transitions.at(-1)?.transitionedAt ?? snapshot.creation.createdAt;
  if (Date.parse(previousTemporalEvidence) >= Date.parse(transition.transitionedAt)) {
    throw new KnowledgeSnapshotLifecycleError(
      record.transitions.length === 0
        ? "Lifecycle transition evidence must occur after snapshot creation"
        : "Lifecycle transition evidence timestamps must be strictly increasing",
    );
  }

  return deepFreeze(
    parseKnowledgeSnapshotLifecycleRecord(
      {
        snapshotId: record.snapshotId,
        snapshotCreatedAt: record.snapshotCreatedAt,
        status: targetStatus,
        transitions: [...record.transitions, transition],
      },
      "Cannot create transitioned lifecycle record",
    ),
  );
}

export function validateKnowledgeSnapshotLifecycle(
  recordInput: KnowledgeSnapshotLifecycleRecord,
  snapshotInput: KnowledgeRepositorySnapshot,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotLifecycleRecord {
  if (recordInput.status !== "created") {
    throw new KnowledgeSnapshotLifecycleError(
      "Snapshot validation can begin only from created lifecycle status",
    );
  }
  return advanceKnowledgeSnapshotLifecycle(recordInput, snapshotInput, "validated", evidence);
}

export function archiveKnowledgeSnapshotLifecycle(
  recordInput: KnowledgeSnapshotLifecycleRecord,
  snapshotInput: KnowledgeRepositorySnapshot,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotLifecycleRecord {
  if (recordInput.status !== "superseded") {
    throw new KnowledgeSnapshotLifecycleError(
      "Snapshot archival can occur only from superseded lifecycle status",
    );
  }
  return advanceKnowledgeSnapshotLifecycle(recordInput, snapshotInput, "archived", evidence);
}
