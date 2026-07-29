import {
  type ActivationAuditRecord,
  type CommittedRegistryTransactionEnvelope,
  type DurableAuditRecord,
  type DurableGovernedChangeSetRecord,
  type DurableLifecycleTransitionRecord,
  type DurablePreviousRecordFingerprint,
  type DurableReviewDecisionRecord,
  type DurableSnapshotManifestEvidence,
  type DurableSnapshotRegistrationRecord,
  type KnowledgeRepositorySnapshot,
  type RegistryTransactionType,
} from "@founderos/knowledge-schema";

import { createKnowledgeRepositorySnapshot } from "../src/index.js";
import {
  type DurableAuditRecordContent,
  type UnsignedDurableAuditRecord,
  createCommittedRegistryTransactionEnvelope,
  createDurableAuditRecord,
  createDurableSnapshotManifestFingerprint,
} from "../src/domain/durable-registry.js";

const CREATED_AT = "2026-07-28T00:00:00Z";

export interface AdapterChainBuilder {
  envelopes: CommittedRegistryTransactionEnvelope[];
  lastRecordFingerprint: DurablePreviousRecordFingerprint;
  lastSequence: number;
}

export function createAdapterChainBuilder(): AdapterChainBuilder {
  return { envelopes: [], lastRecordFingerprint: "genesis", lastSequence: 0 };
}

export function createAdapterSnapshot(corpusVersion: string): KnowledgeRepositorySnapshot {
  return createKnowledgeRepositorySnapshot({
    corpus: {
      schemaVersion: "1.0",
      corpusId: "founderos-priority-1",
      corpusVersion,
      sourceManifestReference: "knowledge/migration-manifest.yaml",
      source: {
        schemaVersion: "1.0",
        sourceId: "founderos-priority-1",
        sourceType: "knowledge_corpus",
        provenance: {
          sourceType: "migration_manifest",
          sourceReference: "knowledge/migration-manifest.yaml",
          originalCreator: "FounderOS",
        },
      },
    },
    creation: { createdAt: CREATED_AT, createdBy: "knowledge-engine" },
    documents: [],
  });
}

export function createAdapterManifestEvidence(
  snapshot: KnowledgeRepositorySnapshot,
): DurableSnapshotManifestEvidence {
  return {
    manifestReference: snapshot.sourceManifestReference,
    manifest: {
      schemaVersion: "1.0",
      corpusId: snapshot.corpusId,
      documents: snapshot.objects.map((object) => ({
        id: object.objectId,
        objectType: object.objectType,
        sourcePath: object.sourcePath,
        destinationPath: `knowledge/${object.objectId}.md`,
        sourceHash: object.sourceHash,
        migrationStatus: "ready",
        reviewStatus: "approved",
        metadata: {
          title: `Manifest evidence for ${object.objectId}`,
          domain: "FounderOS",
          createdAt: "2026-07-28",
          updatedAt: "2026-07-28",
          status: "active",
          confidence: "high",
          importance: "high",
          tags: [],
          relationships: [],
        },
        objectData: {},
      })),
    },
  };
}

function appendRecord<T extends DurableAuditRecord>(
  chain: AdapterChainBuilder,
  transactionId: string,
  content: DurableAuditRecordContent<T>,
): T {
  const record = createDurableAuditRecord<T>({
    ...content,
    transactionId,
    sequence: chain.lastSequence + 1,
    previousRecordFingerprint: chain.lastRecordFingerprint,
  } as UnsignedDurableAuditRecord<T>);
  chain.lastSequence = record.sequence;
  chain.lastRecordFingerprint = record.recordFingerprint;
  return record;
}

function appendEnvelope(
  chain: AdapterChainBuilder,
  transactionType: RegistryTransactionType,
  transactionId: string,
  records: readonly DurableAuditRecord[],
  committedAt: string,
): CommittedRegistryTransactionEnvelope {
  const envelope = createCommittedRegistryTransactionEnvelope({
    transactionType,
    transactionId,
    records,
    committedAt,
  });
  chain.envelopes.push(envelope);
  return envelope;
}

export function appendAdapterRegistration(
  chain: AdapterChainBuilder,
  snapshot: KnowledgeRepositorySnapshot,
  label: string,
  reason = "Register the immutable snapshot.",
): CommittedRegistryTransactionEnvelope {
  const transactionId = `transaction-register-${label}`;
  const manifestEvidence = createAdapterManifestEvidence(snapshot);
  const record = appendRecord<DurableSnapshotRegistrationRecord>(chain, transactionId, {
    schemaVersion: "1.0",
    recordType: "snapshot_registration",
    registrationId: `registration-${snapshot.snapshotId}`,
    snapshotContractVersion: "1.0",
    snapshot,
    manifestEvidence,
    manifestFingerprint: createDurableSnapshotManifestFingerprint(manifestEvidence),
    provenanceSummary: {
      corpusId: snapshot.corpusId,
      corpusVersion: snapshot.corpusVersion,
      sourceManifestReference: snapshot.sourceManifestReference,
      snapshotCreatedAt: snapshot.creation.createdAt,
      snapshotCreatedBy: snapshot.creation.createdBy,
    },
    actorId: "knowledge-engine",
    actorType: "service",
    reason,
    registeredAt: "2026-07-28T00:01:00Z",
  });
  return appendEnvelope(chain, "registration", transactionId, [record], "2026-07-28T00:01:01Z");
}

export function appendAdapterBootstrapHistory(
  chain: AdapterChainBuilder,
  snapshot: KnowledgeRepositorySnapshot,
  label: string,
): void {
  appendAdapterRegistration(chain, snapshot, label);

  const changeSetId = `change-bootstrap-to-${snapshot.snapshotId}`;
  const changeSetTransactionId = `transaction-change-set-${label}`;
  const changeSet = appendRecord<DurableGovernedChangeSetRecord>(chain, changeSetTransactionId, {
    schemaVersion: "1.0",
    recordType: "governed_change_set",
    changeSetId,
    evidence: {
      evidenceType: "bootstrap",
      changeSet: {
        schemaVersion: "1.0",
        changeSetType: "bootstrap",
        changeId: changeSetId,
        sourceSnapshotId: null,
        sourceSnapshotFingerprint: null,
        targetSnapshotId: snapshot.snapshotId,
        targetSnapshotFingerprint: snapshot.contentFingerprint,
        targetManifestReference: snapshot.sourceManifestReference,
        targetCorpusVersion: snapshot.corpusVersion,
        addedObjects: [],
        reviewStatus: "pending",
        changed: true,
      },
    },
    actorId: "knowledge-engine",
    actorType: "service",
    reason: "Record the bootstrap change set.",
    recordedAt: "2026-07-28T00:02:00Z",
  });
  appendEnvelope(chain, "change_set", changeSetTransactionId, [changeSet], "2026-07-28T00:02:01Z");

  const validationTransactionId = `transaction-validate-${label}`;
  const validation = appendRecord<DurableLifecycleTransitionRecord>(
    chain,
    validationTransactionId,
    {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: `transition-validate-${label}`,
      snapshotId: snapshot.snapshotId,
      from: "created",
      to: "validated",
      actorId: "validator",
      actorType: "service",
      reason: "Validate the registered snapshot.",
      transitionedAt: "2026-07-28T00:03:00Z",
      evidence: {
        changeSetId: null,
        changeSetFingerprint: null,
        decisionId: null,
        decisionFingerprint: null,
        activationId: null,
      },
    },
  );
  appendEnvelope(chain, "lifecycle", validationTransactionId, [validation], "2026-07-28T00:03:01Z");

  const reviewTransactionId = `transaction-review-${label}`;
  const review = appendRecord<DurableLifecycleTransitionRecord>(chain, reviewTransactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-review-${label}`,
    snapshotId: snapshot.snapshotId,
    from: "validated",
    to: "reviewing",
    actorId: "reviewer",
    actorType: "human",
    reason: "Begin governed review.",
    transitionedAt: "2026-07-28T00:04:00Z",
    evidence: {
      changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      decisionId: null,
      decisionFingerprint: null,
      activationId: null,
    },
  });
  appendEnvelope(chain, "lifecycle", reviewTransactionId, [review], "2026-07-28T00:04:01Z");

  const decisionId = `decision-approve-${label}`;
  const decisionTransactionId = `transaction-approve-${label}`;
  const decision = appendRecord<DurableReviewDecisionRecord>(chain, decisionTransactionId, {
    schemaVersion: "1.0",
    recordType: "review_decision",
    decisionId,
    reviewDecision: {
      changeId: changeSetId,
      proposedSnapshotId: snapshot.snapshotId,
      decision: "approved",
      actorId: "founder",
      decidedAt: "2026-07-28T00:05:00Z",
      reason: "Approve the governed snapshot.",
    },
    changeSetFingerprint: changeSet.recordFingerprint,
    proposedSnapshotFingerprint: snapshot.contentFingerprint,
    actorId: "founder",
    actorType: "human",
    reason: "Approve the governed snapshot.",
    decidedAt: "2026-07-28T00:05:00Z",
  });
  const approval = appendRecord<DurableLifecycleTransitionRecord>(chain, decisionTransactionId, {
    schemaVersion: "1.0",
    recordType: "lifecycle_transition",
    transitionId: `transition-approve-${label}`,
    snapshotId: snapshot.snapshotId,
    from: "reviewing",
    to: "approved",
    actorId: "founder",
    actorType: "human",
    reason: "Approve the governed snapshot.",
    transitionedAt: "2026-07-28T00:05:00Z",
    evidence: {
      changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      decisionId,
      decisionFingerprint: decision.recordFingerprint,
      activationId: null,
    },
  });
  appendEnvelope(
    chain,
    "decision",
    decisionTransactionId,
    [decision, approval],
    "2026-07-28T00:05:01Z",
  );

  const activationTransactionId = `transaction-activate-${label}`;
  const activationId = `activation-${label}`;
  const activation = appendRecord<DurableLifecycleTransitionRecord>(
    chain,
    activationTransactionId,
    {
      schemaVersion: "1.0",
      recordType: "lifecycle_transition",
      transitionId: `transition-activate-${label}`,
      snapshotId: snapshot.snapshotId,
      from: "approved",
      to: "active",
      actorId: "founder",
      actorType: "human",
      reason: "Activate the approved snapshot.",
      transitionedAt: "2026-07-28T00:06:00Z",
      evidence: {
        changeSetId,
        changeSetFingerprint: changeSet.recordFingerprint,
        decisionId,
        decisionFingerprint: decision.recordFingerprint,
        activationId,
      },
    },
  );
  const audit = appendRecord<ActivationAuditRecord>(chain, activationTransactionId, {
    schemaVersion: "1.0",
    recordType: "activation_audit",
    activationId,
    candidateSnapshotId: snapshot.snapshotId,
    candidateSnapshotFingerprint: snapshot.contentFingerprint,
    previousActiveSnapshotId: null,
    previousActiveSnapshotFingerprint: null,
    expectedActiveSnapshotId: null,
    changeSetType: "bootstrap",
    changeSetId,
    changeSetFingerprint: changeSet.recordFingerprint,
    approvalDecisionId: decisionId,
    approvalDecisionFingerprint: decision.recordFingerprint,
    candidateActivationTransitionId: activation.transitionId,
    previousActiveSupersessionTransitionId: null,
    resultingActiveSnapshotId: snapshot.snapshotId,
    actorId: "founder",
    actorType: "human",
    reason: "Activate the approved snapshot.",
    activatedAt: "2026-07-28T00:06:00Z",
  });
  appendEnvelope(
    chain,
    "activation",
    activationTransactionId,
    [activation, audit],
    "2026-07-28T00:06:01Z",
  );
}
