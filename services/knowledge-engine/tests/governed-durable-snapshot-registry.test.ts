import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KnowledgeObjectSchema,
  CommittedRegistryTransactionEnvelope,
  DerivedRegistryIndexResult,
  DurableGovernedChangeSetEvidence,
  KnowledgeRepositorySnapshot,
  SnapshotActivationRequest,
} from "@founderos/knowledge-schema";

import * as knowledgeEnginePublicApi from "../src/index.js";
import {
  createGovernedDurableSnapshotRegistryForTesting,
  openGovernedDurableSnapshotRegistry,
  openGovernedDurableSnapshotRegistryForTesting,
  type GovernedDurableSnapshotRegistry,
} from "../src/application/manage-governed-durable-snapshot-registry.js";
import type {
  GovernedDurableSnapshotRegistryStoragePort,
  GovernedDurableSnapshotRegistryWriterPort,
} from "../src/application/governed-durable-snapshot-registry-port.js";
import {
  recoverCommittedRegistry,
  replayCommittedRegistryTransactions,
  verifyCommittedRegistryIntegrity,
} from "../src/domain/durable-registry.js";
import type {
  LocalFileRegistryFaultHooks,
  LocalFileRegistryFaultPoint,
} from "../src/infrastructure/local-file-durable-snapshot-registry-internal.js";
import {
  createKnowledgeRepositorySnapshot,
  createKnowledgeSnapshotComparisonEvidence,
  generateKnowledgeGovernedChangeSet,
} from "../src/index.js";
import { createAdapterManifestEvidence } from "./durable-registry-adapter-fixtures.js";
import { document, metadata } from "./snapshot-lifecycle-fixtures.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const CREATED_AT = "2026-07-28T00:00:00Z";

vi.setConfig({ testTimeout: 20_000 });

interface TestRegistryRoot {
  allowedParentRoot: string;
  runtimeRoot: string;
}

interface GovernedCandidate {
  approvalDecisionFingerprint: string;
  approvalDecisionId: string;
  changeSetFingerprint: string;
  changeSetId: string;
  snapshot: KnowledgeRepositorySnapshot;
}

class InMemoryGovernedRegistryStorage implements GovernedDurableSnapshotRegistryStoragePort {
  private envelopes: CommittedRegistryTransactionEnvelope[] = [];
  private writerActive = false;

  public async readVerifiedState() {
    const envelopes = structuredClone(this.envelopes);
    return {
      envelopes,
      replay: replayCommittedRegistryTransactions(envelopes),
    };
  }

  public async withExclusiveWriter<T>(
    operation: (writer: GovernedDurableSnapshotRegistryWriterPort) => Promise<T>,
  ): Promise<T> {
    if (this.writerActive) throw new Error("In-memory writer already active");
    this.writerActive = true;
    try {
      return await operation({
        appendCommittedEnvelope: async (input) => {
          const candidate = [...this.envelopes, structuredClone(input)];
          replayCommittedRegistryTransactions(candidate);
          this.envelopes = candidate;
          return structuredClone(input);
        },
        readVerifiedState: () => this.readVerifiedState(),
      });
    } finally {
      this.writerActive = false;
    }
  }

  public async verifyIntegrity() {
    return verifyCommittedRegistryIntegrity(structuredClone(this.envelopes));
  }

  public async recover() {
    return recoverCommittedRegistry(structuredClone(this.envelopes));
  }

  public async inspectDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    return this.missingDerivedIndex();
  }

  public async rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    return this.missingDerivedIndex();
  }

  private async missingDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    const { replay } = await this.readVerifiedState();
    return {
      schemaVersion: "1.0",
      status: "missing",
      index: null,
      authoritativeThroughSequence: replay.lastCommittedAuditSequence,
      authoritativeIntegrityFingerprint: replay.integrityFingerprint,
      issues: [],
    };
  }
}

const cleanupRoots = new Set<string>();

async function createTestRoot(): Promise<TestRegistryRoot> {
  const allowedParentRoot = await mkdtemp(resolve(tmpdir(), "founderos-governed-registry-"));
  cleanupRoots.add(allowedParentRoot);
  return {
    allowedParentRoot,
    runtimeRoot: resolve(allowedParentRoot, "runtime", "knowledge-registry"),
  };
}

type MigrationDocument = ReturnType<typeof document>;

function snapshot(
  corpusVersion: string,
  documents: readonly MigrationDocument[] = [],
): KnowledgeRepositorySnapshot {
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
    documents,
  });
}

function timestamp(hour: number, minute: number): string {
  return `2026-07-28T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
}

function bootstrapEvidence(
  candidate: KnowledgeRepositorySnapshot,
): DurableGovernedChangeSetEvidence {
  return {
    evidenceType: "bootstrap",
    changeSet: {
      schemaVersion: "1.0",
      changeSetType: "bootstrap",
      changeId: `change-bootstrap-to-${candidate.snapshotId}`,
      sourceSnapshotId: null,
      sourceSnapshotFingerprint: null,
      targetSnapshotId: candidate.snapshotId,
      targetSnapshotFingerprint: candidate.contentFingerprint,
      targetManifestReference: candidate.sourceManifestReference,
      targetCorpusVersion: candidate.corpusVersion,
      addedObjects: [],
      reviewStatus: "pending",
      changed: true,
    },
  };
}

function comparisonEvidence(
  baseline: KnowledgeRepositorySnapshot,
  candidate: KnowledgeRepositorySnapshot,
  baselineDocuments: readonly MigrationDocument[] = [],
  candidateDocuments: readonly MigrationDocument[] = [],
): DurableGovernedChangeSetEvidence {
  return {
    evidenceType: "comparison",
    changeSet: generateKnowledgeGovernedChangeSet({
      currentSnapshot: baseline,
      currentSnapshotEvidence: createKnowledgeSnapshotComparisonEvidence({
        snapshot: baseline,
        documents: baselineDocuments,
      }),
      proposedSnapshot: candidate,
      proposedSnapshotEvidence: createKnowledgeSnapshotComparisonEvidence({
        snapshot: candidate,
        documents: candidateDocuments,
      }),
    }),
  };
}

async function prepareApprovedCandidate(
  registry: GovernedDurableSnapshotRegistry,
  candidate: KnowledgeRepositorySnapshot,
  label: string,
  hour: number,
  evidence: DurableGovernedChangeSetEvidence,
): Promise<GovernedCandidate> {
  await registry.registerSnapshot({
    transactionId: `transaction-register-${label}`,
    snapshot: candidate,
    manifestEvidence: createAdapterManifestEvidence(candidate),
    actorId: "knowledge-engine",
    actorType: "service",
    reason: `Register ${label}.`,
    registeredAt: timestamp(hour, 1),
  });
  const changeSet = await registry.recordGovernedChangeSet({
    transactionId: `transaction-change-set-${label}`,
    evidence,
    actorId: "knowledge-engine",
    actorType: "service",
    reason: `Record the governed ${label} change set.`,
    recordedAt: timestamp(hour, 2),
  });
  await registry.validateSnapshot({
    transactionId: `transaction-validate-${label}`,
    transitionId: `transition-validate-${label}`,
    snapshotId: candidate.snapshotId,
    actorId: "validator",
    actorType: "service",
    reason: `Validate ${label}.`,
    transitionedAt: timestamp(hour, 3),
  });
  await registry.beginSnapshotReview({
    transactionId: `transaction-review-${label}`,
    transitionId: `transition-review-${label}`,
    snapshotId: candidate.snapshotId,
    changeSetId: changeSet.changeSetId,
    changeSetFingerprint: changeSet.recordFingerprint,
    actorId: "reviewer",
    actorType: "human",
    reason: `Begin review for ${label}.`,
    transitionedAt: timestamp(hour, 4),
  });
  const [decision] = await registry.approveSnapshot({
    transactionId: `transaction-approve-${label}`,
    decisionId: `decision-approve-${label}`,
    approvalTransitionId: `transition-approve-${label}`,
    snapshotId: candidate.snapshotId,
    snapshotFingerprint: candidate.contentFingerprint,
    changeSetId: changeSet.changeSetId,
    changeSetFingerprint: changeSet.recordFingerprint,
    actorId: "founder",
    actorType: "human",
    reason: `Approve ${label}.`,
    decidedAt: timestamp(hour, 5),
  });

  return {
    approvalDecisionFingerprint: decision.recordFingerprint,
    approvalDecisionId: decision.decisionId,
    changeSetFingerprint: changeSet.recordFingerprint,
    changeSetId: changeSet.changeSetId,
    snapshot: candidate,
  };
}

function activationRequest(
  candidate: GovernedCandidate,
  label: string,
  requestedAt: string,
  baseline: KnowledgeRepositorySnapshot | null,
): SnapshotActivationRequest {
  return {
    schemaVersion: "1.0",
    transactionId: `transaction-activate-${label}`,
    activationId: `activation-${label}`,
    candidateSnapshotId: candidate.snapshot.snapshotId,
    candidateSnapshotFingerprint: candidate.snapshot.contentFingerprint,
    baselineSnapshotId: baseline?.snapshotId ?? null,
    baselineSnapshotFingerprint: baseline?.contentFingerprint ?? null,
    expectedActiveSnapshotId: baseline?.snapshotId ?? null,
    changeSetType: baseline === null ? "bootstrap" : "comparison",
    changeSetId: candidate.changeSetId,
    changeSetFingerprint: candidate.changeSetFingerprint,
    approvalDecisionId: candidate.approvalDecisionId,
    approvalDecisionFingerprint: candidate.approvalDecisionFingerprint,
    actorId: "founder",
    actorType: "human",
    reason: `Activate ${label}.`,
    requestedAt,
  };
}

async function authoritativeBytes(root: TestRegistryRoot): Promise<readonly string[]> {
  const committedRoot = resolve(root.runtimeRoot, "committed");
  const committedNames = (await readdir(committedRoot)).sort();
  return Promise.all([
    readFile(resolve(root.runtimeRoot, "commit-head.json"), "utf8"),
    ...committedNames.map((name) => readFile(resolve(committedRoot, name), "utf8")),
  ]);
}

function failAt(expected: LocalFileRegistryFaultPoint) {
  return {
    async onFaultPoint(actual: LocalFileRegistryFaultPoint): Promise<void> {
      if (actual === expected) throw new Error(`Injected interruption at ${actual}`);
    },
  };
}

async function invokeBehindDelayedWriterLock<Input extends { transactionId: string }, Result>(
  gates: Map<string, LocalFileRegistryFaultHooks>,
  input: Input,
  invoke: (captured: Input) => Promise<Result>,
  mutate: (callerOwned: Input) => void,
): Promise<Result> {
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolveEntered) => {
    signalEntered = resolveEntered;
  });
  const blocked = new Promise<void>((resolveBlocked) => {
    release = resolveBlocked;
  });
  gates.set(input.transactionId, {
    onBeforeWriterLock() {
      signalEntered();
      return blocked;
    },
  });
  const pending = invoke(input);
  await entered;
  mutate(input);
  release();
  const result = await pending;
  gates.delete(input.transactionId);
  return result;
}

afterEach(async () => {
  await Promise.all(
    [...cleanupRoots].map(async (root) => {
      await rm(root, { recursive: true, force: true });
      cleanupRoots.delete(root);
    }),
  );
});

describe("governed durable lifecycle and decision APIs", () => {
  it("runs registration, lifecycle, review, and activation through an in-memory storage port", async () => {
    const storage: GovernedDurableSnapshotRegistryStoragePort =
      new InMemoryGovernedRegistryStorage();
    const registry = createGovernedDurableSnapshotRegistryForTesting(storage);
    const candidate = snapshot("in-memory-port");
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "in-memory-port",
      0,
      bootstrapEvidence(candidate),
    );

    await expect(
      registry.activateSnapshot(
        activationRequest(approved, "in-memory-port", timestamp(0, 6), null),
      ),
    ).resolves.toMatchObject({ status: "committed", activeSnapshotId: candidate.snapshotId });
    await expect(registry.getCurrentActiveSnapshot()).resolves.toMatchObject({
      snapshot: { snapshotId: candidate.snapshotId },
    });
    await expect(registry.getLifecycleHistory(candidate.snapshotId)).resolves.toHaveLength(4);
    await expect(registry.getReviewDecisionHistory(candidate.snapshotId)).resolves.toHaveLength(1);
    await expect(registry.getActivationHistory()).resolves.toHaveLength(1);
    await expect(registry.verifyIntegrity()).resolves.toMatchObject({ status: "valid" });
    await expect(registry.recover()).resolves.toMatchObject({
      status: "recovered",
      activeSnapshotId: candidate.snapshotId,
    });
    await expect(registry.inspectDerivedIndex()).resolves.toMatchObject({ status: "missing" });
    await expect(registry.rebuildDerivedIndex()).resolves.toMatchObject({ status: "missing" });
  });

  it("persists and replays Milestone 08 evidence with explicit undefined optionals", async () => {
    const root = await createTestRoot();
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const baseline = snapshot("undefined-baseline");
    const first = await prepareApprovedCandidate(
      registry,
      baseline,
      "undefined-baseline",
      0,
      bootstrapEvidence(baseline),
    );
    await registry.activateSnapshot(
      activationRequest(first, "undefined-baseline", timestamp(0, 6), null),
    );

    const decisionMetadata = metadata("undefined-candidate", "decision");
    const explicitObject = KnowledgeObjectSchema.parse({
      metadata: {
        ...decisionMetadata,
        category: undefined,
        source: { ...decisionMetadata.source, author: undefined },
      },
      context: "Context",
      problem: "Problem",
      options: ["A", "B"],
      chosenOption: "A",
      reasoning: "Reason",
      expectedOutcome: "Outcome",
      risks: [],
      relatedProjectIds: [],
      reviewDate: "2026-08-28T00:00:00.000Z",
      result: undefined,
      lessonsLearned: [],
    });
    const explicitDocument = document(explicitObject);
    const candidate = snapshot("undefined-candidate", [explicitDocument]);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "undefined-candidate",
      1,
      comparisonEvidence(baseline, candidate, [], [explicitDocument]),
    );
    await registry.activateSnapshot(
      activationRequest(approved, "undefined-candidate", timestamp(1, 6), baseline),
    );

    const restarted = await openGovernedDurableSnapshotRegistry(root);
    const durableChangeSet = await restarted.getGovernedChangeSet(approved.changeSetId);
    if (durableChangeSet?.evidence.evidenceType !== "comparison") {
      throw new Error("Expected durable comparison evidence");
    }
    const storedObject = durableChangeSet.evidence.changeSet.addedObjects[0]?.object;
    if (storedObject === undefined) throw new Error("Expected stored decision evidence");
    expect(Object.hasOwn(explicitObject, "result")).toBe(true);
    expect(Object.hasOwn(storedObject, "result")).toBe(false);
    expect(Object.hasOwn(storedObject.metadata, "category")).toBe(false);
    expect(Object.hasOwn(storedObject.metadata.source, "author")).toBe(false);
    expect(await restarted.getCurrentActiveSnapshot()).toMatchObject({
      snapshot: { snapshotId: candidate.snapshotId },
    });
    expect(await restarted.verifyIntegrity()).toMatchObject({ status: "valid" });
    expect(await restarted.recover()).toMatchObject({
      status: "recovered",
      activeSnapshotId: candidate.snapshotId,
    });
  });

  it("persists exact lifecycle and approval bindings across restart", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-1");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "first",
      0,
      bootstrapEvidence(candidate),
    );

    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.getLifecycleHistory(candidate.snapshotId)).toMatchObject([
      {
        from: "created",
        to: "validated",
        actorId: "validator",
        actorType: "service",
        reason: "Validate first.",
        transitionedAt: timestamp(0, 3),
      },
      {
        from: "validated",
        to: "reviewing",
        actorId: "reviewer",
        actorType: "human",
        reason: "Begin review for first.",
        evidence: {
          changeSetId: approved.changeSetId,
          changeSetFingerprint: approved.changeSetFingerprint,
        },
      },
      {
        from: "reviewing",
        to: "approved",
        actorId: "founder",
        actorType: "human",
        reason: "Approve first.",
        transitionedAt: timestamp(0, 5),
        evidence: {
          changeSetId: approved.changeSetId,
          changeSetFingerprint: approved.changeSetFingerprint,
          decisionId: approved.approvalDecisionId,
          decisionFingerprint: approved.approvalDecisionFingerprint,
        },
      },
    ]);
    expect(await restarted.getReviewDecisionHistory(candidate.snapshotId)).toMatchObject([
      {
        decisionId: approved.approvalDecisionId,
        actorId: "founder",
        actorType: "human",
        reason: "Approve first.",
        decidedAt: timestamp(0, 5),
        reviewDecision: {
          changeId: approved.changeSetId,
          proposedSnapshotId: candidate.snapshotId,
          decision: "approved",
          actorId: "founder",
          reason: "Approve first.",
          decidedAt: timestamp(0, 5),
        },
      },
    ]);
    expect(await restarted.verifyIntegrity()).toMatchObject({ status: "valid", issues: [] });
  });

  it("records rejection durably and leaves the candidate terminal for governance", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("rejected-version");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    await registry.registerSnapshot({
      transactionId: "transaction-register-rejected",
      snapshot: candidate,
      manifestEvidence: createAdapterManifestEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Register the rejected candidate.",
      registeredAt: timestamp(0, 1),
    });
    const changeSet = await registry.recordGovernedChangeSet({
      transactionId: "transaction-change-set-rejected",
      evidence: bootstrapEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Record bootstrap evidence.",
      recordedAt: timestamp(0, 2),
    });
    await registry.validateSnapshot({
      transactionId: "transaction-validate-rejected",
      transitionId: "transition-validate-rejected",
      snapshotId: candidate.snapshotId,
      actorId: "validator",
      actorType: "service",
      reason: "Validate the rejected candidate.",
      transitionedAt: timestamp(0, 3),
    });
    await registry.beginSnapshotReview({
      transactionId: "transaction-review-rejected",
      transitionId: "transition-review-rejected",
      snapshotId: candidate.snapshotId,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "reviewer",
      actorType: "human",
      reason: "Review the candidate.",
      transitionedAt: timestamp(0, 4),
    });
    const rejected = await registry.rejectSnapshot({
      transactionId: "transaction-reject-candidate",
      decisionId: "decision-reject-candidate",
      snapshotId: candidate.snapshotId,
      snapshotFingerprint: candidate.contentFingerprint,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "founder",
      actorType: "human",
      reason: "Reject the provenance.",
      decidedAt: timestamp(0, 5),
    });

    expect(rejected.reviewDecision).toMatchObject({
      decision: "rejected",
      actorId: "founder",
      reason: "Reject the provenance.",
      decidedAt: timestamp(0, 5),
    });
    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.getReviewDecisionHistory(candidate.snapshotId)).toEqual([rejected]);
    await expect(
      restarted.approveSnapshot({
        transactionId: "transaction-approve-after-rejection",
        decisionId: "decision-approve-after-rejection",
        approvalTransitionId: "transition-approve-after-rejection",
        snapshotId: candidate.snapshotId,
        snapshotFingerprint: candidate.contentFingerprint,
        changeSetId: changeSet.changeSetId,
        changeSetFingerprint: changeSet.recordFingerprint,
        actorId: "founder",
        actorType: "human",
        reason: "Attempt to override immutable rejection.",
        decidedAt: timestamp(0, 6),
      }),
    ).rejects.toMatchObject({ code: "candidate_review_rejected" });
  });

  it("does not expose generic lifecycle, append, session, storage, or test fault controls", async () => {
    const root = await createTestRoot();
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const publicKeys = Object.keys(knowledgeEnginePublicApi);

    expect(publicKeys).not.toContain("advanceKnowledgeSnapshotLifecycle");
    expect(publicKeys).not.toContain("recordLifecycleTransition");
    expect(publicKeys).not.toContain("appendCommittedEnvelope");
    expect(publicKeys).not.toContain("LocalFileRegistryStorage");
    expect(publicKeys).not.toContain("LocalFileRegistryWriterSession");
    expect(publicKeys).not.toContain("openGovernedDurableSnapshotRegistryForTesting");
    expect(publicKeys).not.toContain("createGovernedDurableSnapshotRegistryForTesting");
    expect(publicKeys.some((key) => key.toLowerCase().includes("fault"))).toBe(false);
    expect(Reflect.ownKeys(registry)).toEqual([]);
    expect("storage" in registry).toBe(false);

    const prototype = Object.getPrototypeOf(registry) as Record<string, unknown>;
    expect(Object.getOwnPropertyNames(prototype).sort()).toEqual(
      [
        "activate",
        "activateSnapshot",
        "approveSnapshot",
        "archiveSnapshot",
        "beginSnapshotReview",
        "constructor",
        "getActivationHistory",
        "getCurrentActiveSnapshot",
        "getGovernedChangeSet",
        "getLifecycleHistory",
        "getReviewDecisionHistory",
        "getSnapshot",
        "inspectDerivedIndex",
        "listSnapshots",
        "rebuildDerivedIndex",
        "recordGovernedChangeSet",
        "recover",
        "registerSnapshot",
        "rejectSnapshot",
        "validateSnapshot",
        "verifyIntegrity",
      ].sort(),
    );
    let writerSessionExposed = false;
    const prototypeHelper = prototype.runCapturedMutation;
    if (typeof prototypeHelper === "function") {
      await prototypeHelper.call(
        registry,
        { transactionId: "transaction-prototype-helper-exploit" },
        async () => {
          writerSessionExposed = true;
        },
      );
    }
    expect(writerSessionExposed).toBe(false);
  });
});

describe("governed durable activation", () => {
  it("commits a first activation, recovers it exactly, and replays one transaction idempotently", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-1");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "first",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "first", timestamp(0, 6), null);

    const committed = await registry.activate(request);
    const bytesAfterCommit = await authoritativeBytes(root);
    const replayed = await registry.activateSnapshot(structuredClone(request));

    expect(committed).toMatchObject({
      status: "committed",
      candidateSnapshotId: candidate.snapshotId,
      previousActiveSnapshotId: null,
      activeSnapshotId: candidate.snapshotId,
    });
    expect(replayed).toEqual({ ...committed, status: "replayed" });
    expect(await authoritativeBytes(root)).toEqual(bytesAfterCommit);

    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.getCurrentActiveSnapshot()).toMatchObject({
      snapshot: { snapshotId: candidate.snapshotId },
    });
    expect(await restarted.getActivationHistory()).toHaveLength(1);
    expect(await restarted.recover()).toMatchObject({
      status: "recovered",
      activeSnapshotId: candidate.snapshotId,
    });
    expect(await restarted.rebuildDerivedIndex()).toMatchObject({
      status: "rebuilt",
      index: { activeSnapshotId: candidate.snapshotId },
    });
  });

  it("atomically activates a replacement and archives only the superseded baseline", async () => {
    const root = await createTestRoot();
    const firstSnapshot = snapshot("version-1");
    const secondSnapshot = snapshot("version-2");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const first = await prepareApprovedCandidate(
      registry,
      firstSnapshot,
      "first",
      0,
      bootstrapEvidence(firstSnapshot),
    );
    await registry.activateSnapshot(activationRequest(first, "first", timestamp(0, 6), null));
    const second = await prepareApprovedCandidate(
      registry,
      secondSnapshot,
      "second",
      1,
      comparisonEvidence(firstSnapshot, secondSnapshot),
    );

    const committed = await registry.activateSnapshot(
      activationRequest(second, "second", timestamp(1, 6), firstSnapshot),
    );

    expect(committed).toMatchObject({
      status: "committed",
      previousActiveSnapshotId: firstSnapshot.snapshotId,
      activeSnapshotId: secondSnapshot.snapshotId,
    });
    const firstHistory = await registry.getLifecycleHistory(firstSnapshot.snapshotId);
    const secondHistory = await registry.getLifecycleHistory(secondSnapshot.snapshotId);
    expect(firstHistory.at(-1)).toMatchObject({
      from: "active",
      to: "superseded",
      evidence: { activationId: "activation-second" },
    });
    expect(secondHistory.at(-1)).toMatchObject({
      from: "approved",
      to: "active",
      evidence: {
        activationId: "activation-second",
        decisionId: second.approvalDecisionId,
        decisionFingerprint: second.approvalDecisionFingerprint,
        changeSetId: second.changeSetId,
        changeSetFingerprint: second.changeSetFingerprint,
      },
    });
    expect(firstHistory.at(-1)?.sequence).toBe(secondHistory.at(-1)!.sequence + 1);
    const audit = (await registry.getActivationHistory()).at(-1)!;
    expect(audit.sequence).toBe(firstHistory.at(-1)!.sequence + 1);

    await registry.archiveSnapshot({
      transactionId: "transaction-archive-first",
      transitionId: "transition-archive-first",
      snapshotId: firstSnapshot.snapshotId,
      actorId: "archivist",
      actorType: "human",
      reason: "Archive the superseded baseline.",
      transitionedAt: timestamp(1, 7),
    });
    await expect(
      registry.archiveSnapshot({
        transactionId: "transaction-archive-active",
        transitionId: "transition-archive-active",
        snapshotId: secondSnapshot.snapshotId,
        actorId: "archivist",
        actorType: "human",
        reason: "Attempt to archive the active snapshot.",
        transitionedAt: timestamp(1, 8),
      }),
    ).rejects.toMatchObject({ code: "snapshot_not_superseded" });

    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.getCurrentActiveSnapshot()).toMatchObject({
      snapshot: { snapshotId: secondSnapshot.snapshotId },
    });
    expect((await restarted.getLifecycleHistory(firstSnapshot.snapshotId)).at(-1)).toMatchObject({
      to: "archived",
    });
    expect(await restarted.verifyIntegrity()).toMatchObject({ status: "valid", issues: [] });
  });

  it("rejects stale, missing, forged, mismatched, unapproved, and terminal evidence with zero state change", async () => {
    const root = await createTestRoot();
    const firstSnapshot = snapshot("version-1");
    const secondSnapshot = snapshot("version-2");
    const unapprovedSnapshot = snapshot("version-unapproved");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const first = await prepareApprovedCandidate(
      registry,
      firstSnapshot,
      "first",
      0,
      bootstrapEvidence(firstSnapshot),
    );
    await registry.activateSnapshot(activationRequest(first, "first", timestamp(0, 6), null));
    const second = await prepareApprovedCandidate(
      registry,
      secondSnapshot,
      "second",
      1,
      comparisonEvidence(firstSnapshot, secondSnapshot),
    );
    await registry.registerSnapshot({
      transactionId: "transaction-register-unapproved",
      snapshot: unapprovedSnapshot,
      manifestEvidence: createAdapterManifestEvidence(unapprovedSnapshot),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Register an unapproved candidate.",
      registeredAt: timestamp(1, 7),
    });
    const validRequest = activationRequest(second, "second", timestamp(1, 6), firstSnapshot);
    const bytesBeforeFailures = await authoritativeBytes(root);

    await expect(
      registry.activateSnapshot({ ...validRequest, changeSetFingerprint: HASH_B }),
    ).resolves.toMatchObject({
      status: "rejected",
      failureCode: "change_set_fingerprint_mismatch",
    });
    await expect(
      registry.activateSnapshot({
        ...validRequest,
        approvalDecisionId: "decision-missing",
      }),
    ).resolves.toMatchObject({ status: "rejected", failureCode: "approval_decision_not_found" });
    await expect(
      registry.activateSnapshot({
        ...validRequest,
        approvalDecisionFingerprint: first.approvalDecisionFingerprint,
      }),
    ).resolves.toMatchObject({ status: "rejected", failureCode: "decision_binding_mismatch" });
    await expect(
      registry.activateSnapshot({
        ...validRequest,
        transactionId: "transaction-activate-stale-time",
        activationId: "activation-stale-time",
        requestedAt: timestamp(1, 5),
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      failureCode: "activation_timestamp_mismatch",
    });
    const structurallyValidUnapprovedRequest: SnapshotActivationRequest = {
      ...validRequest,
      transactionId: "transaction-activate-unapproved",
      activationId: "activation-unapproved",
      candidateSnapshotId: unapprovedSnapshot.snapshotId,
      candidateSnapshotFingerprint: unapprovedSnapshot.contentFingerprint,
      changeSetId: `change-${firstSnapshot.snapshotId}-to-${unapprovedSnapshot.snapshotId}`,
    };
    await expect(
      registry.activateSnapshot(structurallyValidUnapprovedRequest),
    ).resolves.toMatchObject({ status: "rejected", failureCode: "candidate_not_approved" });
    expect(await authoritativeBytes(root)).toEqual(bytesBeforeFailures);

    await registry.activateSnapshot(validRequest);
    const bytesAfterReplacement = await authoritativeBytes(root);
    await expect(
      registry.activateSnapshot({
        ...validRequest,
        transactionId: "transaction-activate-stale",
        activationId: "activation-stale",
      }),
    ).resolves.toMatchObject({ status: "rejected", failureCode: "stale_active_snapshot" });

    await registry.archiveSnapshot({
      transactionId: "transaction-archive-first",
      transitionId: "transition-archive-first",
      snapshotId: firstSnapshot.snapshotId,
      actorId: "archivist",
      actorType: "human",
      reason: "Archive the first snapshot.",
      transitionedAt: timestamp(1, 7),
    });
    const terminalAttempt: SnapshotActivationRequest = {
      ...validRequest,
      transactionId: "transaction-reactivate-archived",
      activationId: "activation-reactivate-archived",
      candidateSnapshotId: firstSnapshot.snapshotId,
      candidateSnapshotFingerprint: firstSnapshot.contentFingerprint,
      baselineSnapshotId: secondSnapshot.snapshotId,
      baselineSnapshotFingerprint: secondSnapshot.contentFingerprint,
      expectedActiveSnapshotId: secondSnapshot.snapshotId,
      changeSetId: `change-${secondSnapshot.snapshotId}-to-${firstSnapshot.snapshotId}`,
      changeSetFingerprint: HASH_A,
      approvalDecisionId: first.approvalDecisionId,
      approvalDecisionFingerprint: first.approvalDecisionFingerprint,
      requestedAt: timestamp(1, 8),
    };
    const bytesBeforeTerminalAttempt = await authoritativeBytes(root);
    await expect(registry.activateSnapshot(terminalAttempt)).resolves.toMatchObject({
      status: "rejected",
      failureCode: "candidate_terminal_state",
    });
    expect(await authoritativeBytes(root)).toEqual(bytesBeforeTerminalAttempt);
    expect(bytesAfterReplacement.length).toBeLessThan(bytesBeforeTerminalAttempt.length);
    expect(await registry.getCurrentActiveSnapshot()).toMatchObject({
      snapshot: { snapshotId: secondSnapshot.snapshotId },
    });
  });

  it("rejects conflicting activation transaction reuse without changing authoritative bytes", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-1");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "first",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "first", timestamp(0, 6), null);
    await registry.activateSnapshot(request);
    const bytes = await authoritativeBytes(root);

    await expect(
      registry.activateSnapshot({
        ...request,
        reason: "Conflicting canonical transaction intent.",
      }),
    ).rejects.toMatchObject({ code: "transaction_id_conflict" });
    expect(await authoritativeBytes(root)).toEqual(bytes);
  });

  it("fails closed before activation when authoritative decision evidence is tampered", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-tampered");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "tampered",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "tampered", timestamp(0, 6), null);
    const committedRoot = resolve(root.runtimeRoot, "committed");
    const committedNames = (await readdir(committedRoot)).sort();
    const approvalPath = resolve(committedRoot, committedNames.at(-1)!);
    const envelope = JSON.parse(await readFile(approvalPath, "utf8")) as {
      records: { reason: string }[];
    };
    envelope.records[0]!.reason = "Tampered approval reason.";
    await writeFile(approvalPath, JSON.stringify(envelope), "utf8");
    const fileNamesBeforeAttempt = await readdir(committedRoot);

    await expect(registry.activateSnapshot(request)).rejects.toMatchObject({
      code: expect.stringMatching(/invalid|fingerprint|binding/u),
    });
    expect((await readdir(committedRoot)).sort()).toEqual(fileNamesBeforeAttempt.sort());
    expect(await registry.verifyIntegrity()).toMatchObject({ status: "invalid" });
    expect(await registry.recover()).toMatchObject({
      status: "failed",
      activeSnapshotId: null,
    });
  });
});

describe("governed mutation input capture", () => {
  it("commits invocation-time evidence for every mutation while writer acquisition is delayed", async () => {
    const root = await createTestRoot();
    const gates = new Map<string, LocalFileRegistryFaultHooks>();
    const registry = await openGovernedDurableSnapshotRegistryForTesting(root, (transactionId) =>
      gates.get(transactionId),
    );
    const candidate = snapshot("captured-baseline");

    const registrationInput = {
      transactionId: "transaction-capture-register",
      snapshot: structuredClone(candidate),
      manifestEvidence: createAdapterManifestEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service" as const,
      reason: "Invocation-time registration reason.",
      registeredAt: timestamp(0, 1),
    };
    const registration = await invokeBehindDelayedWriterLock(
      gates,
      registrationInput,
      (input) => registry.registerSnapshot(input),
      (input) => {
        input.reason = "Caller-mutated registration reason.";
        input.snapshot.corpusVersion = "caller-mutated-version";
        input.manifestEvidence.manifest.corpusId = "caller-mutated-corpus";
      },
    );
    expect(registration).toMatchObject({
      reason: "Invocation-time registration reason.",
      snapshot: { corpusVersion: "captured-baseline" },
      manifestEvidence: {
        manifest: { corpusId: "founderos-priority-1", documents: [] },
      },
    });

    const changeSetInput = {
      transactionId: "transaction-capture-change-set",
      evidence: bootstrapEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service" as const,
      reason: "Invocation-time change-set reason.",
      recordedAt: timestamp(0, 2),
    };
    const changeSet = await invokeBehindDelayedWriterLock(
      gates,
      changeSetInput,
      (input) => registry.recordGovernedChangeSet(input),
      (input) => {
        input.reason = "Caller-mutated change-set reason.";
        input.evidence.changeSet.targetCorpusVersion = "caller-mutated-version";
      },
    );
    expect(changeSet).toMatchObject({
      reason: "Invocation-time change-set reason.",
      evidence: { changeSet: { targetCorpusVersion: "captured-baseline" } },
    });

    const validationInput = {
      transactionId: "transaction-capture-validate",
      transitionId: "transition-capture-validate",
      snapshotId: candidate.snapshotId,
      actorId: "validator",
      actorType: "service" as const,
      reason: "Invocation-time validation reason.",
      transitionedAt: timestamp(0, 3),
    };
    const validation = await invokeBehindDelayedWriterLock(
      gates,
      validationInput,
      (input) => registry.validateSnapshot(input),
      (input) => {
        input.transitionId = "transition-caller-mutated-validate";
        input.reason = "Caller-mutated validation reason.";
      },
    );
    expect(validation).toMatchObject({
      transitionId: "transition-capture-validate",
      reason: "Invocation-time validation reason.",
    });

    const reviewInput = {
      transactionId: "transaction-capture-review",
      transitionId: "transition-capture-review",
      snapshotId: candidate.snapshotId,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "reviewer",
      actorType: "human" as const,
      reason: "Invocation-time review reason.",
      transitionedAt: timestamp(0, 4),
    };
    const review = await invokeBehindDelayedWriterLock(
      gates,
      reviewInput,
      (input) => registry.beginSnapshotReview(input),
      (input) => {
        input.changeSetFingerprint = HASH_B;
        input.reason = "Caller-mutated review reason.";
      },
    );
    expect(review).toMatchObject({
      reason: "Invocation-time review reason.",
      evidence: { changeSetFingerprint: changeSet.recordFingerprint },
    });

    const approvalInput = {
      transactionId: "transaction-capture-approve",
      decisionId: "decision-capture-approve",
      approvalTransitionId: "transition-capture-approve",
      snapshotId: candidate.snapshotId,
      snapshotFingerprint: candidate.contentFingerprint,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "founder",
      actorType: "human" as const,
      reason: "Invocation-time approval reason.",
      decidedAt: timestamp(0, 5),
    };
    const approval = await invokeBehindDelayedWriterLock(
      gates,
      approvalInput,
      (input) => registry.approveSnapshot(input),
      (input) => {
        input.decisionId = "decision-caller-mutated-approve";
        input.snapshotFingerprint = HASH_B;
        input.reason = "Caller-mutated approval reason.";
      },
    );
    expect(approval).toMatchObject([
      { decisionId: "decision-capture-approve", reason: "Invocation-time approval reason." },
      {
        transitionId: "transition-capture-approve",
        reason: "Invocation-time approval reason.",
      },
    ]);

    const approved: GovernedCandidate = {
      approvalDecisionFingerprint: approval[0].recordFingerprint,
      approvalDecisionId: approval[0].decisionId,
      changeSetFingerprint: changeSet.recordFingerprint,
      changeSetId: changeSet.changeSetId,
      snapshot: candidate,
    };
    const activationInput = activationRequest(approved, "capture", timestamp(0, 6), null);
    const activation = await invokeBehindDelayedWriterLock(
      gates,
      activationInput,
      (input) => registry.activate(input),
      (input) => {
        input.candidateSnapshotFingerprint = HASH_B;
        input.reason = "Caller-mutated activation reason.";
      },
    );
    expect(activation).toMatchObject({
      status: "committed",
      candidateSnapshotId: candidate.snapshotId,
    });
    expect(await registry.getActivationHistory()).toMatchObject([
      { activationId: "activation-capture", reason: "Activate capture." },
    ]);

    const replacementSnapshot = snapshot("captured-replacement");
    const replacement = await prepareApprovedCandidate(
      registry,
      replacementSnapshot,
      "capture-replacement",
      1,
      comparisonEvidence(candidate, replacementSnapshot),
    );
    await registry.activateSnapshot(
      activationRequest(replacement, "capture-replacement", timestamp(1, 6), candidate),
    );

    const archiveInput = {
      transactionId: "transaction-capture-archive",
      transitionId: "transition-capture-archive",
      snapshotId: candidate.snapshotId,
      actorId: "archivist",
      actorType: "human" as const,
      reason: "Invocation-time archival reason.",
      transitionedAt: timestamp(1, 7),
    };
    const archive = await invokeBehindDelayedWriterLock(
      gates,
      archiveInput,
      (input) => registry.archiveSnapshot(input),
      (input) => {
        input.transitionId = "transition-caller-mutated-archive";
        input.reason = "Caller-mutated archival reason.";
      },
    );
    expect(archive).toMatchObject({
      transitionId: "transition-capture-archive",
      reason: "Invocation-time archival reason.",
    });

    const rejectedSnapshot = snapshot("captured-rejection");
    await registry.registerSnapshot({
      transactionId: "transaction-capture-register-rejection",
      snapshot: rejectedSnapshot,
      manifestEvidence: createAdapterManifestEvidence(rejectedSnapshot),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Register rejection candidate.",
      registeredAt: timestamp(2, 1),
    });
    const rejectedChangeSet = await registry.recordGovernedChangeSet({
      transactionId: "transaction-capture-change-set-rejection",
      evidence: comparisonEvidence(replacementSnapshot, rejectedSnapshot),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Record rejection change set.",
      recordedAt: timestamp(2, 2),
    });
    await registry.validateSnapshot({
      transactionId: "transaction-capture-validate-rejection",
      transitionId: "transition-capture-validate-rejection",
      snapshotId: rejectedSnapshot.snapshotId,
      actorId: "validator",
      actorType: "service",
      reason: "Validate rejection candidate.",
      transitionedAt: timestamp(2, 3),
    });
    await registry.beginSnapshotReview({
      transactionId: "transaction-capture-review-rejection",
      transitionId: "transition-capture-review-rejection",
      snapshotId: rejectedSnapshot.snapshotId,
      changeSetId: rejectedChangeSet.changeSetId,
      changeSetFingerprint: rejectedChangeSet.recordFingerprint,
      actorId: "reviewer",
      actorType: "human",
      reason: "Review rejection candidate.",
      transitionedAt: timestamp(2, 4),
    });
    const rejectionInput = {
      transactionId: "transaction-capture-reject",
      decisionId: "decision-capture-reject",
      snapshotId: rejectedSnapshot.snapshotId,
      snapshotFingerprint: rejectedSnapshot.contentFingerprint,
      changeSetId: rejectedChangeSet.changeSetId,
      changeSetFingerprint: rejectedChangeSet.recordFingerprint,
      actorId: "founder",
      actorType: "human" as const,
      reason: "Invocation-time rejection reason.",
      decidedAt: timestamp(2, 5),
    };
    const rejection = await invokeBehindDelayedWriterLock(
      gates,
      rejectionInput,
      (input) => registry.rejectSnapshot(input),
      (input) => {
        input.decisionId = "decision-caller-mutated-reject";
        input.reason = "Caller-mutated rejection reason.";
      },
    );
    expect(rejection).toMatchObject({
      decisionId: "decision-capture-reject",
      reason: "Invocation-time rejection reason.",
    });
    expect(await registry.verifyIntegrity()).toMatchObject({ status: "valid" });
  });

  it("normalizes clone and strict-parse failures before writer acquisition", async () => {
    const root = await createTestRoot();
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const candidate = snapshot("capture-invalid");

    const uncloneable = {
      transactionId: "transaction-uncloneable-register",
      snapshot: candidate,
      manifestEvidence: createAdapterManifestEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service" as const,
      reason: "Uncloneable input.",
      registeredAt: timestamp(0, 1),
      uncloneable: (): void => undefined,
    };
    expect(() => registry.registerSnapshot(uncloneable)).toThrowError(
      expect.objectContaining({
        code: "invalid_registration_input",
        message: "Snapshot registration input could not be defensively cloned",
      }),
    );
    expect(() =>
      registry.validateSnapshot({
        transactionId: "transaction-invalid-validate",
        transitionId: "transition-invalid-validate",
        snapshotId: candidate.snapshotId,
        actorId: "validator",
        actorType: "service",
        reason: "Strict input.",
        transitionedAt: timestamp(0, 2),
        unexpected: true,
      } as Parameters<GovernedDurableSnapshotRegistry["validateSnapshot"]>[0]),
    ).toThrowError(expect.objectContaining({ code: "invalid_validation_input" }));
  });

  it("rejects non-plain manifest evidence synchronously before cloning can erase its prototype", async () => {
    const root = await createTestRoot();
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const candidate = snapshot("capture-non-plain-manifest");
    const plainEvidence = createAdapterManifestEvidence(candidate);
    class UnsupportedManifestEvidence {
      public readonly manifest = plainEvidence.manifest;
      public readonly manifestReference = plainEvidence.manifestReference;
    }
    let thrown: unknown;
    let pending: ReturnType<GovernedDurableSnapshotRegistry["registerSnapshot"]> | undefined;
    try {
      pending = registry.registerSnapshot({
        transactionId: "transaction-non-plain-manifest",
        snapshot: candidate,
        manifestEvidence: new UnsupportedManifestEvidence() as Parameters<
          GovernedDurableSnapshotRegistry["registerSnapshot"]
        >[0]["manifestEvidence"],
        actorId: "knowledge-engine",
        actorType: "service",
        reason: "Reject non-plain durable evidence.",
        registeredAt: timestamp(0, 1),
      });
    } catch (error) {
      thrown = error;
    }
    if (pending !== undefined) await pending;

    expect(thrown).toMatchObject({ code: "invalid_registration_input" });
    expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
  });

  it("rejects a switching manifest accessor without reading it or acquiring a writer", async () => {
    const root = await createTestRoot();
    let writerAcquisitionCount = 0;
    const registry = await openGovernedDurableSnapshotRegistryForTesting(root, () => ({
      onBeforeWriterLock() {
        writerAcquisitionCount += 1;
      },
    }));
    const candidate = snapshot("capture-switching-manifest");
    const plainEvidence = createAdapterManifestEvidence(candidate);
    class CloneFlattenedManifestEvidence {
      public readonly manifest = plainEvidence.manifest;
      public readonly manifestReference = plainEvidence.manifestReference;
    }
    let manifestGetterReadCount = 0;
    const input: Record<string, unknown> = {
      transactionId: "transaction-switching-manifest",
      snapshot: candidate,
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Reject a switching manifest accessor.",
      registeredAt: timestamp(0, 1),
    };
    Object.defineProperty(input, "manifestEvidence", {
      enumerable: true,
      get: () => {
        manifestGetterReadCount += 1;
        return manifestGetterReadCount === 1 ? plainEvidence : new CloneFlattenedManifestEvidence();
      },
    });

    let thrown: unknown;
    let pending: Promise<unknown> | undefined;
    try {
      pending = registry.registerSnapshot(
        input as unknown as Parameters<GovernedDurableSnapshotRegistry["registerSnapshot"]>[0],
      );
    } catch (error) {
      thrown = error;
    }
    if (pending !== undefined) await pending;

    expect(thrown).toMatchObject({ code: "invalid_registration_input" });
    expect(manifestGetterReadCount).toBe(0);
    expect(writerAcquisitionCount).toBe(0);
    expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
  });

  it("rejects an own __proto__ data property before capture can mutate its prototype", async () => {
    const root = await createTestRoot();
    let writerAcquisitionCount = 0;
    const registry = await openGovernedDurableSnapshotRegistryForTesting(root, () => ({
      onBeforeWriterLock() {
        writerAcquisitionCount += 1;
      },
    }));
    const candidate = snapshot("capture-proto-key");
    let inheritedGetterReadCount = 0;
    const hostilePrototype = Object.defineProperty({}, "transactionId", {
      enumerable: true,
      get: () => {
        inheritedGetterReadCount += 1;
        return "inherited-transaction";
      },
    });
    const input: Record<string, unknown> = {
      transactionId: "transaction-proto-key",
      snapshot: candidate,
      manifestEvidence: createAdapterManifestEvidence(candidate),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Reject prototype mutation during capture.",
      registeredAt: timestamp(0, 1),
    };
    Object.defineProperty(input, "__proto__", {
      enumerable: true,
      value: hostilePrototype,
    });

    let thrown: unknown;
    let pending: Promise<unknown> | undefined;
    try {
      pending = registry.registerSnapshot(
        input as unknown as Parameters<GovernedDurableSnapshotRegistry["registerSnapshot"]>[0],
      );
    } catch (error) {
      thrown = error;
    }
    if (pending !== undefined) await pending;

    expect(thrown).toMatchObject({ code: "invalid_registration_input" });
    expect(inheritedGetterReadCount).toBe(0);
    expect(writerAcquisitionCount).toBe(0);
    expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
  });
});

describe("governed public mutation idempotency", () => {
  it("replays every exact transaction without new history and conflicts on semantic reuse", async () => {
    const root = await createTestRoot();
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const firstSnapshot = snapshot("matrix-first");

    const registrationInput = {
      transactionId: "transaction-matrix-register",
      snapshot: firstSnapshot,
      manifestEvidence: createAdapterManifestEvidence(firstSnapshot),
      actorId: "knowledge-engine",
      actorType: "service" as const,
      reason: "Register the matrix candidate.",
      registeredAt: timestamp(0, 1),
    };
    const registration = await registry.registerSnapshot(registrationInput);

    const changeSetInput = {
      transactionId: "transaction-matrix-change-set",
      evidence: bootstrapEvidence(firstSnapshot),
      actorId: "knowledge-engine",
      actorType: "service" as const,
      reason: "Record matrix bootstrap evidence.",
      recordedAt: timestamp(0, 2),
    };
    const changeSet = await registry.recordGovernedChangeSet(changeSetInput);

    const validationInput = {
      transactionId: "transaction-matrix-validate",
      transitionId: "transition-matrix-validate",
      snapshotId: firstSnapshot.snapshotId,
      actorId: "validator",
      actorType: "service" as const,
      reason: "Validate the matrix candidate.",
      transitionedAt: timestamp(0, 3),
    };
    const validation = await registry.validateSnapshot(validationInput);

    const reviewInput = {
      transactionId: "transaction-matrix-review",
      transitionId: "transition-matrix-review",
      snapshotId: firstSnapshot.snapshotId,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "reviewer",
      actorType: "human" as const,
      reason: "Begin matrix review.",
      transitionedAt: timestamp(0, 4),
    };
    const review = await registry.beginSnapshotReview(reviewInput);

    const approvalInput = {
      transactionId: "transaction-matrix-approve",
      decisionId: "decision-matrix-approve",
      approvalTransitionId: "transition-matrix-approve",
      snapshotId: firstSnapshot.snapshotId,
      snapshotFingerprint: firstSnapshot.contentFingerprint,
      changeSetId: changeSet.changeSetId,
      changeSetFingerprint: changeSet.recordFingerprint,
      actorId: "founder",
      actorType: "human" as const,
      reason: "Approve the matrix candidate.",
      decidedAt: timestamp(0, 5),
    };
    const approval = await registry.approveSnapshot(approvalInput);
    const firstCandidate: GovernedCandidate = {
      approvalDecisionFingerprint: approval[0].recordFingerprint,
      approvalDecisionId: approval[0].decisionId,
      changeSetFingerprint: changeSet.recordFingerprint,
      changeSetId: changeSet.changeSetId,
      snapshot: firstSnapshot,
    };
    const activationInput = activationRequest(
      firstCandidate,
      "matrix-first",
      timestamp(0, 6),
      null,
    );
    const activation = await registry.activate(activationInput);

    const replacementSnapshot = snapshot("matrix-replacement");
    const replacement = await prepareApprovedCandidate(
      registry,
      replacementSnapshot,
      "matrix-replacement",
      1,
      comparisonEvidence(firstSnapshot, replacementSnapshot),
    );
    await registry.activate(
      activationRequest(replacement, "matrix-replacement", timestamp(1, 6), firstSnapshot),
    );
    const archiveInput = {
      transactionId: "transaction-matrix-archive",
      transitionId: "transition-matrix-archive",
      snapshotId: firstSnapshot.snapshotId,
      actorId: "archivist",
      actorType: "human" as const,
      reason: "Archive the matrix baseline.",
      transitionedAt: timestamp(1, 7),
    };
    const archive = await registry.archiveSnapshot(archiveInput);

    const rejectedSnapshot = snapshot("matrix-rejected");
    await registry.registerSnapshot({
      transactionId: "transaction-matrix-register-rejected",
      snapshot: rejectedSnapshot,
      manifestEvidence: createAdapterManifestEvidence(rejectedSnapshot),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Register the matrix rejection candidate.",
      registeredAt: timestamp(2, 1),
    });
    const rejectedChangeSet = await registry.recordGovernedChangeSet({
      transactionId: "transaction-matrix-change-set-rejected",
      evidence: comparisonEvidence(replacementSnapshot, rejectedSnapshot),
      actorId: "knowledge-engine",
      actorType: "service",
      reason: "Record rejection comparison evidence.",
      recordedAt: timestamp(2, 2),
    });
    await registry.validateSnapshot({
      transactionId: "transaction-matrix-validate-rejected",
      transitionId: "transition-matrix-validate-rejected",
      snapshotId: rejectedSnapshot.snapshotId,
      actorId: "validator",
      actorType: "service",
      reason: "Validate the rejection candidate.",
      transitionedAt: timestamp(2, 3),
    });
    await registry.beginSnapshotReview({
      transactionId: "transaction-matrix-review-rejected",
      transitionId: "transition-matrix-review-rejected",
      snapshotId: rejectedSnapshot.snapshotId,
      changeSetId: rejectedChangeSet.changeSetId,
      changeSetFingerprint: rejectedChangeSet.recordFingerprint,
      actorId: "reviewer",
      actorType: "human",
      reason: "Begin rejection review.",
      transitionedAt: timestamp(2, 4),
    });
    const rejectionInput = {
      transactionId: "transaction-matrix-reject",
      decisionId: "decision-matrix-reject",
      snapshotId: rejectedSnapshot.snapshotId,
      snapshotFingerprint: rejectedSnapshot.contentFingerprint,
      changeSetId: rejectedChangeSet.changeSetId,
      changeSetFingerprint: rejectedChangeSet.recordFingerprint,
      actorId: "founder",
      actorType: "human" as const,
      reason: "Reject the matrix candidate.",
      decidedAt: timestamp(2, 5),
    };
    const rejection = await registry.rejectSnapshot(rejectionInput);
    const restartedRegistry = await openGovernedDurableSnapshotRegistry(root);

    const mutationCases: readonly {
      name: string;
      original: unknown;
      replay: () => Promise<unknown>;
      conflict: () => Promise<unknown>;
      expectedReplay?: unknown;
    }[] = [
      {
        name: "snapshot registration",
        original: registration,
        replay: () => restartedRegistry.registerSnapshot(structuredClone(registrationInput)),
        conflict: () =>
          restartedRegistry.registerSnapshot({
            ...registrationInput,
            reason: "Changed registration reason.",
          }),
      },
      {
        name: "governed change set",
        original: changeSet,
        replay: () => restartedRegistry.recordGovernedChangeSet(structuredClone(changeSetInput)),
        conflict: () =>
          restartedRegistry.recordGovernedChangeSet({
            ...changeSetInput,
            reason: "Changed change-set reason.",
          }),
      },
      {
        name: "snapshot validation",
        original: validation,
        replay: () => restartedRegistry.validateSnapshot(structuredClone(validationInput)),
        conflict: () =>
          restartedRegistry.validateSnapshot({
            ...validationInput,
            reason: "Changed validation reason.",
          }),
      },
      {
        name: "review entry",
        original: review,
        replay: () => restartedRegistry.beginSnapshotReview(structuredClone(reviewInput)),
        conflict: () =>
          restartedRegistry.beginSnapshotReview({
            ...reviewInput,
            reason: "Changed review reason.",
          }),
      },
      {
        name: "approval",
        original: approval,
        replay: () => restartedRegistry.approveSnapshot(structuredClone(approvalInput)),
        conflict: () =>
          restartedRegistry.approveSnapshot({
            ...approvalInput,
            reason: "Changed approval reason.",
          }),
      },
      {
        name: "rejection",
        original: rejection,
        replay: () => restartedRegistry.rejectSnapshot(structuredClone(rejectionInput)),
        conflict: () =>
          restartedRegistry.rejectSnapshot({
            ...rejectionInput,
            reason: "Changed rejection reason.",
          }),
      },
      {
        name: "archival",
        original: archive,
        replay: () => restartedRegistry.archiveSnapshot(structuredClone(archiveInput)),
        conflict: () =>
          restartedRegistry.archiveSnapshot({
            ...archiveInput,
            reason: "Changed archive reason.",
          }),
      },
      {
        name: "activation",
        original: activation,
        expectedReplay: { ...activation, status: "replayed" },
        replay: () => restartedRegistry.activate(structuredClone(activationInput)),
        conflict: () =>
          restartedRegistry.activate({
            ...activationInput,
            reason: "Changed activation reason.",
          }),
      },
    ];

    for (const mutationCase of mutationCases) {
      const bytesBeforeReplay = await authoritativeBytes(root);
      await expect(mutationCase.replay(), `${mutationCase.name} exact replay`).resolves.toEqual(
        mutationCase.expectedReplay ?? mutationCase.original,
      );
      expect(await authoritativeBytes(root), `${mutationCase.name} exact replay history`).toEqual(
        bytesBeforeReplay,
      );

      await expect(
        mutationCase.conflict(),
        `${mutationCase.name} conflicting reuse`,
      ).rejects.toMatchObject({ code: "transaction_id_conflict" });
      expect(
        await authoritativeBytes(root),
        `${mutationCase.name} conflicting reuse history`,
      ).toEqual(bytesBeforeReplay);
    }

    for (const changedApproval of [
      { actorId: "different-founder" },
      { decidedAt: timestamp(0, 6) },
      { decisionId: "decision-matrix-approve-changed" },
      { approvalTransitionId: "transition-matrix-approve-changed" },
    ] as const) {
      const bytesBeforeConflict = await authoritativeBytes(root);
      await expect(
        restartedRegistry.approveSnapshot({ ...approvalInput, ...changedApproval }),
      ).rejects.toMatchObject({ code: "transaction_id_conflict" });
      expect(await authoritativeBytes(root)).toEqual(bytesBeforeConflict);
    }
  }, 20_000);

  it("leaves authoritative committed bytes identical after a rejected activation", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("zero-change-activation");
    const registry = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      registry,
      candidate,
      "zero-change-activation",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "zero-change-activation", timestamp(0, 6), null);
    const bytesBefore = await authoritativeBytes(root);

    await expect(
      registry.activate({ ...request, changeSetFingerprint: HASH_B }),
    ).resolves.toMatchObject({
      status: "rejected",
      failureCode: "change_set_fingerprint_mismatch",
    });
    expect(await authoritativeBytes(root)).toEqual(bytesBefore);
  });
});

describe("governed activation crash recovery", () => {
  it("leaves no committed activation before the marker and safely retries the orphaned transaction", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-before-marker");
    const normal = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      normal,
      candidate,
      "before-marker",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "before-marker", timestamp(0, 6), null);
    const crashing = await openGovernedDurableSnapshotRegistryForTesting(root, (transactionId) =>
      transactionId === request.transactionId
        ? failAt("after_envelope_installed_before_commit_marker")
        : undefined,
    );

    await expect(crashing.activateSnapshot(request)).rejects.toThrow(/Injected interruption/);
    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.getCurrentActiveSnapshot()).toBeNull();
    expect(await restarted.getActivationHistory()).toEqual([]);
    expect(await restarted.recover()).toMatchObject({
      status: "recovered",
      activeSnapshotId: null,
    });

    await expect(restarted.activateSnapshot(request)).resolves.toMatchObject({
      status: "committed",
      activeSnapshotId: candidate.snapshotId,
    });
    expect(await restarted.verifyIntegrity()).toMatchObject({ status: "valid" });
  });

  it("recovers the complete activation after the marker and replays the acknowledged transaction", async () => {
    const root = await createTestRoot();
    const candidate = snapshot("version-after-marker");
    const normal = await openGovernedDurableSnapshotRegistry(root);
    const approved = await prepareApprovedCandidate(
      normal,
      candidate,
      "after-marker",
      0,
      bootstrapEvidence(candidate),
    );
    const request = activationRequest(approved, "after-marker", timestamp(0, 6), null);
    const crashing = await openGovernedDurableSnapshotRegistryForTesting(root, (transactionId) =>
      transactionId === request.transactionId ? failAt("after_commit_marker_installed") : undefined,
    );

    await expect(crashing.activateSnapshot(request)).rejects.toThrow(/Injected interruption/);
    const restarted = await openGovernedDurableSnapshotRegistry(root);
    expect(await restarted.recover()).toMatchObject({
      status: "recovered",
      activeSnapshotId: candidate.snapshotId,
    });
    expect(await restarted.getActivationHistory()).toHaveLength(1);
    await expect(restarted.activateSnapshot(request)).resolves.toMatchObject({
      status: "replayed",
      activeSnapshotId: candidate.snapshotId,
    });
  });
});
