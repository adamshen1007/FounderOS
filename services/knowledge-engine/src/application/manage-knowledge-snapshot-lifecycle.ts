import {
  KnowledgeSnapshotLifecycleTransitionSchema,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeRepositorySnapshot,
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
      { snapshotId: snapshot.snapshotId, status: "created", transitions: [] },
      "Cannot create lifecycle record",
    ),
  );
}

export function transitionKnowledgeSnapshotLifecycle(
  recordInput: KnowledgeSnapshotLifecycleRecord,
  snapshotInput: KnowledgeRepositorySnapshot,
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
  if (record.snapshotId !== snapshot.snapshotId) {
    throw new KnowledgeSnapshotLifecycleError(
      "Cannot transition lifecycle record with a different snapshot identity",
    );
  }

  const currentIndex = LIFECYCLE_STATES.indexOf(record.status);
  const nextStatus = LIFECYCLE_STATES[currentIndex + 1];
  if (nextStatus === undefined) {
    throw new KnowledgeSnapshotLifecycleError(
      "Cannot transition an archived snapshot lifecycle record",
    );
  }

  const transition = parseWithSnapshotDomainError(
    KnowledgeSnapshotLifecycleTransitionSchema,
    { from: record.status, to: nextStatus, ...evidence },
    KnowledgeSnapshotLifecycleError,
    "Invalid lifecycle transition evidence",
  );
  const previousTransition = record.transitions.at(-1);
  if (
    previousTransition !== undefined &&
    Date.parse(previousTransition.transitionedAt) >= Date.parse(transition.transitionedAt)
  ) {
    throw new KnowledgeSnapshotLifecycleError(
      "Lifecycle transition evidence timestamps must be strictly increasing",
    );
  }

  return deepFreeze(
    parseKnowledgeSnapshotLifecycleRecord(
      {
        snapshotId: record.snapshotId,
        status: nextStatus,
        transitions: [...record.transitions, transition],
      },
      "Cannot create transitioned lifecycle record",
    ),
  );
}
