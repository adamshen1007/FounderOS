import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createContextDeliveryPolicyDecisionEvidence,
  createGovernedDurableContextDeliveryLedger,
  emptyDeliveryLedgerHead,
  evaluateContextDeliveryFreshness,
} from "../src/index.js";
import {
  LocalFileDeliveryLedgerStorage,
  openLocalFileDurableContextDeliveryLedgerForTesting,
  type LocalFileDeliveryLedgerFaultHooks,
} from "../src/infrastructure/local-file-durable-context-delivery-ledger.js";
import { createContextDeliveryFixture } from "./context-delivery-fixtures.js";
import {
  createConflictingIdempotencyFixture,
  createDistinctDeliveryFixture,
  createDurableDeliveryFixture,
  replayInput,
  type DurableDeliveryFixture,
} from "./durable-delivery-ledger-fixtures.js";

const roots: string[] = [];

async function testLayout() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "founderos-m12-"));
  roots.push(repositoryRoot);
  const docs = join(repositoryRoot, "docs");
  const knowledge = join(repositoryRoot, "knowledge");
  await mkdir(docs);
  await mkdir(knowledge);
  return {
    repositoryRoot,
    docs,
    knowledge,
    runtimeRoot: join(repositoryRoot, ".founderos", "runtime", "context-delivery-ledger"),
  };
}

async function openTestLedger(
  paths: Awaited<ReturnType<typeof testLayout>>,
  hooks: LocalFileDeliveryLedgerFaultHooks = {},
) {
  return openLocalFileDurableContextDeliveryLedgerForTesting(
    {
      runtimeRoot: paths.runtimeRoot,
      repositoryRoot: paths.repositoryRoot,
      canonicalSourceRoots: [paths.docs, paths.knowledge],
    },
    hooks,
  );
}

async function committedLedger(options: Parameters<typeof createDurableDeliveryFixture>[0] = {}) {
  const paths = await testLayout();
  const fixture = await createDurableDeliveryFixture(options);
  const ledger = await openTestLedger(paths);
  const result = await ledger.commitVerifiedOriginalDelivery(fixture.commitInput);
  return { paths, fixture, ledger, result };
}

function decisionWithOutcome(
  fixture: DurableDeliveryFixture,
  outcome: "allowed" | "denied" | "review-required" | "not-evaluated",
) {
  const {
    decisionFingerprint: _fingerprint,
    reasonCodes: _reasonCodes,
    ...unsigned
  } = fixture.context.policy;
  void _fingerprint;
  void _reasonCodes;
  const reasonCodes = {
    allowed: ["policy_allowed"],
    denied: ["policy_denied"],
    "review-required": ["policy_review_required"],
    "not-evaluated": ["policy_not_evaluated"],
  } as const;
  return createContextDeliveryPolicyDecisionEvidence({
    ...unsigned,
    outcome,
    reasonCodes: [...reasonCodes[outcome]],
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local file-backed Durable Context Delivery Ledger", () => {
  it("atomically commits and recovers the exact original result after restart", async () => {
    const { paths, fixture, result } = await committedLedger();
    const reopened = await openTestLedger(paths);
    expect(await reopened.readOriginalDeliveryResult("durable-delivery-transaction-0001")).toEqual(
      result,
    );
    expect(
      await reopened.resolveDeliveryRequest(fixture.context.request.deliveryRequestId),
    ).toEqual(fixture.context.request);
    expect(
      await reopened.resolveIdempotencyOwnership(fixture.context.request.idempotencyKey),
    ).toMatchObject({ originalEnvelopeId: result.envelope.deliveryEnvelopeId });
    expect((await reopened.recover()).status).toBe("recovered");
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
  });

  it("rejects original-commit accessors without executing them", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths);
    let executions = 0;
    const input = { ...fixture.commitInput };
    Object.defineProperty(input, "transaction", {
      enumerable: true,
      get() {
        executions += 1;
        return fixture.commitInput.transaction;
      },
    });
    await expect(ledger.commitVerifiedOriginalDelivery(input)).rejects.toThrow(/accessor-free/u);
    expect(executions).toBe(0);
    expect((await ledger.recover()).originalDeliveryTransactionCount).toBe(0);
  });

  it("returns byte-identical deterministic recovery evidence after restart", async () => {
    const { paths, ledger } = await committedLedger();
    const first = await ledger.recover();
    const second = await (await openTestLedger(paths)).recover();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("never mutates configured canonical source roots", async () => {
    const paths = await testLayout();
    const docsSentinel = join(paths.docs, "canonical.md");
    const knowledgeSentinel = join(paths.knowledge, "canonical.md");
    await writeFile(docsSentinel, "docs-source\n");
    await writeFile(knowledgeSentinel, "knowledge-source\n");
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths);
    await ledger.commitVerifiedOriginalDelivery(fixture.commitInput);
    expect(await readFile(docsSentinel, "utf8")).toBe("docs-source\n");
    expect(await readFile(knowledgeSentinel, "utf8")).toBe("knowledge-source\n");
  });

  it("treats an identical transaction replay as idempotent", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths);
    const first = await ledger.commitVerifiedOriginalDelivery(fixture.commitInput);
    const second = await ledger.commitVerifiedOriginalDelivery(fixture.commitInput);
    expect(second).toEqual(first);
    expect((await ledger.listCommittedOriginalDeliveries()).length).toBe(1);
  });

  it("rejects conflicting transaction-ID reuse", async () => {
    const { ledger, fixture } = await committedLedger();
    await expect(
      ledger.commitVerifiedOriginalDelivery({
        ...fixture.commitInput,
        transaction: {
          ...fixture.commitInput.transaction,
          committedAt: "2026-07-29T01:00:01.000Z",
        },
      }),
    ).rejects.toThrow(/Transaction ID/u);
  });

  it("resolves an identical idempotency retry with a new transaction ID to the original result", async () => {
    const { ledger, fixture, result } = await committedLedger();
    const retry = await ledger.commitVerifiedOriginalDelivery({
      ...fixture.commitInput,
      transaction: {
        ...fixture.commitInput.transaction,
        transactionId: "durable-delivery-transaction-retry",
        expectedLedgerHead: {
          ledgerSequence: 1,
          auditFingerprint: (await ledger.recover()).lastAuditFingerprint,
        },
      },
    });
    expect(retry).toEqual(result);
    expect(await ledger.listCommittedOriginalDeliveries()).toHaveLength(1);
  });

  it("rejects conflicting idempotency-key reuse after restart", async () => {
    const { paths, fixture } = await committedLedger();
    const conflicting = await createConflictingIdempotencyFixture();
    const reopened = await openTestLedger(paths);
    const recovery = await reopened.recover();
    await expect(
      reopened.commitVerifiedOriginalDelivery({
        ...conflicting.commitInput,
        transaction: {
          ...conflicting.commitInput.transaction,
          expectedLedgerHead: {
            ledgerSequence: recovery.lastCommittedLedgerSequence,
            auditFingerprint: recovery.lastAuditFingerprint,
          },
        },
      }),
    ).rejects.toThrow(/permanently owned/u);
    expect(
      await reopened.resolveIdempotencyOwnership(fixture.context.request.idempotencyKey),
    ).not.toBeNull();
  });

  it("rejects a stale expected Ledger head without committed changes", async () => {
    const { ledger, fixture } = await committedLedger();
    const different = await createDistinctDeliveryFixture();
    await expect(
      ledger.commitVerifiedOriginalDelivery({
        ...different.commitInput,
        transaction: {
          ...different.commitInput.transaction,
          expectedLedgerHead: emptyDeliveryLedgerHead(),
        },
      }),
    ).rejects.toThrow(/stale/u);
    expect(await ledger.listCommittedOriginalDeliveries()).toHaveLength(1);
    expect(fixture.result.status).toBe("delivered");
  });

  it("persists accepted repeatable Replay Attempts and returns the exact original result", async () => {
    const { paths, fixture, ledger, result } = await committedLedger();
    const recovery = await ledger.recover();
    const replay = await ledger.submitReplayAttempt(
      replayInput(fixture, {
        ledgerSequence: recovery.lastCommittedLedgerSequence,
        auditFingerprint: recovery.lastAuditFingerprint,
      }),
    );
    expect(replay.attempt.outcome).toBe("accepted-original-result");
    expect(replay.originalResult).toEqual(result);
    expect(replay.originalResult).toBeDefined();
    const reopened = await openTestLedger(paths);
    expect(await reopened.readReplayHistory("durable-delivery-transaction-0001")).toEqual([
      replay.attempt,
    ]);
    expect(await reopened.readOriginalDeliveryResult("durable-delivery-transaction-0001")).toEqual(
      result,
    );
  });

  it("resolves an exact Replay Attempt retry without re-evaluating a later Registry state", async () => {
    const { fixture, ledger, result } = await committedLedger();
    const recovery = await ledger.recover();
    const input = replayInput(fixture, {
      ledgerSequence: recovery.lastCommittedLedgerSequence,
      auditFingerprint: recovery.lastAuditFingerprint,
    });
    const first = await ledger.submitReplayAttempt(input);
    let registryReads = 0;
    const retry = await ledger.submitReplayAttempt({
      ...input,
      registry: {
        verifyIntegrity: async () => {
          registryReads += 1;
          throw new Error("a committed retry must not re-evaluate current Registry state");
        },
      } as unknown as typeof input.registry,
    });
    expect(retry).toEqual(first);
    expect(retry.originalResult).toEqual(result);
    expect(registryReads).toBe(0);
  });

  it("enforces single-delivery replay rejection after restart", async () => {
    const { paths, fixture, ledger } = await committedLedger({ replayMode: "single-delivery" });
    const recovery = await ledger.recover();
    const reopened = await openTestLedger(paths);
    const replay = await reopened.submitReplayAttempt(
      replayInput(fixture, {
        ledgerSequence: recovery.lastCommittedLedgerSequence,
        auditFingerprint: recovery.lastAuditFingerprint,
      }),
    );
    expect(replay.attempt.outcome).toBe("rejected-single-delivery");
    expect(replay.originalResult).toBeNull();
  });

  it("records evaluation-only Replay separately without returning a normal result", async () => {
    const { fixture, ledger } = await committedLedger({ replayMode: "evaluation-only" });
    const recovery = await ledger.recover();
    const replay = await ledger.submitReplayAttempt(
      replayInput(fixture, {
        ledgerSequence: recovery.lastCommittedLedgerSequence,
        auditFingerprint: recovery.lastAuditFingerprint,
      }),
    );
    expect(replay.attempt.outcome).toBe("evaluation-only");
    expect(replay.attempt.replayClassification).toBe("evaluation-replay");
    expect(replay.originalResult).toBeNull();
  });

  it("records current Policy denial separately", async () => {
    const { fixture, ledger } = await committedLedger();
    const recovery = await ledger.recover();
    const input = replayInput(fixture, {
      ledgerSequence: recovery.lastCommittedLedgerSequence,
      auditFingerprint: recovery.lastAuditFingerprint,
    });
    const replay = await ledger.submitReplayAttempt({
      ...input,
      policyDecisionEvidence: decisionWithOutcome(fixture, "denied"),
    });
    expect(replay.attempt.outcome).toBe("rejected-policy");
    expect(replay.attempt.reasonCodes).toEqual(["policy_denied"]);
  });

  it("records current Freshness denial for a newer Active Snapshot", async () => {
    const { fixture, ledger } = await committedLedger({
      freshnessPolicy: {
        invalidateOnNewerActiveSnapshot: true,
        allowHistoricalReplay: false,
      },
    });
    const recovery = await ledger.recover();
    const evaluatedAt = "2026-07-29T01:00:01.000Z";
    const newerSnapshotId = `snapshot-${"1".repeat(64)}`;
    const currentContext = createContextDeliveryFixture({ activeSnapshotId: newerSnapshotId });
    const currentIntegrity = await currentContext.input.registry.verifyIntegrity();
    const currentRecovery = await currentContext.input.registry.recover();
    if (
      currentIntegrity.status !== "valid" ||
      currentRecovery.status !== "recovered" ||
      currentRecovery.activeSnapshotId === null
    )
      throw new Error("Newer Active Snapshot fixture did not recover");
    const freshness = evaluateContextDeliveryFreshness({
      request: fixture.context.request,
      policyDecision: fixture.context.policy,
      contextPackage: fixture.context.contextPackage,
      currentActiveSnapshotId: currentRecovery.activeSnapshotId,
      currentActivationSequence: currentRecovery.lastCommittedAuditSequence,
      evaluatedAt,
    });
    const replay = await ledger.submitReplayAttempt({
      ...replayInput(
        fixture,
        {
          ledgerSequence: recovery.lastCommittedLedgerSequence,
          auditFingerprint: recovery.lastAuditFingerprint,
        },
        { evaluatedAt },
      ),
      registry: currentContext.input.registry,
      freshnessEvidence: freshness,
      currentActiveSnapshotEvidence: {
        snapshotId: currentRecovery.activeSnapshotId,
        activationSequence: currentRecovery.lastCommittedAuditSequence,
        registryIntegrityFingerprint: currentIntegrity.integrityFingerprint,
      },
    });
    expect(replay.attempt.outcome).toBe("rejected-freshness");
    expect(replay.attempt.reasonCodes).toEqual(["newer_active_snapshot"]);
  });

  it("rejects caller-forged current Registry evidence without appending a Replay Attempt", async () => {
    const { fixture, ledger } = await committedLedger();
    const recovery = await ledger.recover();
    const input = replayInput(fixture, {
      ledgerSequence: recovery.lastCommittedLedgerSequence,
      auditFingerprint: recovery.lastAuditFingerprint,
    });
    await expect(
      ledger.submitReplayAttempt({
        ...input,
        currentActiveSnapshotEvidence: {
          ...input.currentActiveSnapshotEvidence,
          registryIntegrityFingerprint: "9".repeat(64),
        },
      }),
    ).rejects.toThrow(/does not match the durable Registry/u);
    expect(await ledger.readReplayHistory("durable-delivery-transaction-0001")).toEqual([]);
  });

  it("rejects Replay accessors without executing them", async () => {
    const { fixture, ledger } = await committedLedger();
    const recovery = await ledger.recover();
    const input = {
      ...replayInput(fixture, {
        ledgerSequence: recovery.lastCommittedLedgerSequence,
        auditFingerprint: recovery.lastAuditFingerprint,
      }),
    };
    let executions = 0;
    Object.defineProperty(input, "request", {
      enumerable: true,
      get() {
        executions += 1;
        return fixture.context.request;
      },
    });
    await expect(ledger.submitReplayAttempt(input)).rejects.toThrow(/accessor-free/u);
    expect(executions).toBe(0);
  });

  it("persists expiration evidence and permanently reserves the key", async () => {
    const { paths, fixture, ledger } = await committedLedger({
      replayMode: "repeatable-until-expiration",
      freshnessPolicy: { expiresAt: "2026-07-29T02:00:00.000Z" },
      policyExpiresAt: "2026-07-30T00:00:00.000Z",
    });
    const recovery = await ledger.recover();
    const replay = await ledger.submitReplayAttempt(
      replayInput(
        fixture,
        {
          ledgerSequence: recovery.lastCommittedLedgerSequence,
          auditFingerprint: recovery.lastAuditFingerprint,
        },
        { evaluatedAt: "2026-07-29T02:00:00.000Z" },
      ),
    );
    expect(replay.attempt.outcome).toBe("rejected-expired");
    expect(replay.attempt.expirationEvidence?.status).toBe("expired-permanently-reserved");
    const reopened = await openTestLedger(paths);
    expect((await reopened.recover()).expiredIdempotencyOwnershipCount).toBe(1);
    expect(
      await reopened.resolveIdempotencyOwnership(fixture.context.request.idempotencyKey),
    ).not.toBeNull();
  });

  it("leaves no committed Delivery when failure occurs before commit-head installation", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths, { failAt: "after-event-install" });
    await expect(ledger.commitVerifiedOriginalDelivery(fixture.commitInput)).rejects.toThrow(
      /injected/u,
    );
    const reopened = await openTestLedger(paths);
    expect((await reopened.recover()).originalDeliveryTransactionCount).toBe(0);
    expect(
      await reopened.readOriginalDeliveryResult("durable-delivery-transaction-0001"),
    ).toBeNull();
  });

  it("commits an exact retry over an identical pre-head event orphan without overwriting it", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const failing = await openTestLedger(paths, { failAt: "after-event-install" });
    await expect(failing.commitVerifiedOriginalDelivery(fixture.commitInput)).rejects.toThrow();
    const retry = await openTestLedger(paths);
    await expect(retry.commitVerifiedOriginalDelivery(fixture.commitInput)).resolves.toEqual(
      fixture.result,
    );
    expect((await retry.recover()).originalDeliveryTransactionCount).toBe(1);
  });

  it("recovers a complete Delivery when failure occurs after commit-head installation", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths, { failAt: "after-head-install" });
    await expect(ledger.commitVerifiedOriginalDelivery(fixture.commitInput)).rejects.toThrow(
      /injected/u,
    );
    const reopened = await openTestLedger(paths);
    expect(await reopened.readOriginalDeliveryResult("durable-delivery-transaction-0001")).toEqual(
      fixture.result,
    );
  });

  it("ignores abandoned staging files and uncommitted event orphans", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths, { failAt: "after-event-install" });
    await expect(ledger.commitVerifiedOriginalDelivery(fixture.commitInput)).rejects.toThrow();
    await writeFile(join(paths.runtimeRoot, "staging", "partial.tmp"), "partial");
    const reopened = await openTestLedger(paths);
    expect((await reopened.verifyIntegrity()).status).toBe("valid");
    expect((await reopened.recover()).originalDeliveryTransactionCount).toBe(0);
  });

  it("survives derived-index write failure and rebuilds deterministically", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const ledger = await openTestLedger(paths, { failAt: "before-derived-write" });
    await expect(ledger.commitVerifiedOriginalDelivery(fixture.commitInput)).resolves.toEqual(
      fixture.result,
    );
    const reopened = await openTestLedger(paths);
    expect((await reopened.recover()).derivedIndexStatus).toBe("missing");
    expect((await reopened.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect((await reopened.recover()).derivedIndexStatus).toBe("current");
  });

  it("detects and rebuilds a corrupt derived index without changing authoritative history", async () => {
    const { paths, ledger } = await committedLedger();
    const before = await ledger.readOriginalDeliveryResult("durable-delivery-transaction-0001");
    await writeFile(join(paths.runtimeRoot, "derived", "delivery-index.json"), "not-json");
    const reopened = await openTestLedger(paths);
    expect((await reopened.verifyIntegrity()).derivedIndexStatus).toBe("invalid");
    expect((await reopened.rebuildDerivedIndexes()).status).toBe("rebuilt");
    expect(await reopened.readOriginalDeliveryResult("durable-delivery-transaction-0001")).toEqual(
      before,
    );
  });

  it("fails closed on authoritative event tampering and never repairs it", async () => {
    const { paths } = await committedLedger();
    const [name] = await readdir(join(paths.runtimeRoot, "transactions"));
    const path = join(paths.runtimeRoot, "transactions", name!);
    const event = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const transaction = event.transaction as Record<string, unknown>;
    transaction.committedAt = "2026-07-29T01:00:01.000Z";
    await writeFile(path, JSON.stringify(event));
    const reopened = await openTestLedger(paths);
    expect((await reopened.verifyIntegrity()).status).toBe("invalid");
    expect((await reopened.recover()).status).toBe("failed");
    expect((await reopened.rebuildDerivedIndexes()).status).toBe("failed");
  });

  it("fails closed when the commit head references a missing event", async () => {
    const { paths } = await committedLedger();
    const [name] = await readdir(join(paths.runtimeRoot, "transactions"));
    await unlink(join(paths.runtimeRoot, "transactions", name!));
    const reopened = await openTestLedger(paths);
    expect((await reopened.recover()).status).toBe("failed");
  });

  it("enforces an explicit cooperative single-writer lock", async () => {
    const paths = await testLayout();
    const storage = await LocalFileDeliveryLedgerStorage.open({
      runtimeRoot: paths.runtimeRoot,
      repositoryRoot: paths.repositoryRoot,
      canonicalSourceRoots: [paths.docs, paths.knowledge],
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const writerEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = storage.withWriter(async () => {
      entered();
      return blocked;
    });
    await writerEntered;
    await expect(storage.withWriter(async () => undefined)).rejects.toThrow(
      /active cooperative writer/u,
    );
    release();
    await first;
  });

  it("rejects lexical traversal before runtime mutation", async () => {
    const paths = await testLayout();
    const unsafe = `${paths.repositoryRoot}/.founderos/runtime/../escape`;
    await expect(
      LocalFileDeliveryLedgerStorage.open({
        runtimeRoot: unsafe,
        repositoryRoot: paths.repositoryRoot,
        canonicalSourceRoots: [paths.docs],
      }),
    ).rejects.toThrow(/traversal-free/u);
    await expect(readdir(join(paths.repositoryRoot, ".founderos"))).rejects.toThrow();
  });

  it("rejects exhausted event capacity before staging authoritative bytes", async () => {
    const paths = await testLayout();
    const fixture = await createDurableDeliveryFixture();
    const storage = await LocalFileDeliveryLedgerStorage.open({
      runtimeRoot: paths.runtimeRoot,
      repositoryRoot: paths.repositoryRoot,
      canonicalSourceRoots: [paths.docs, paths.knowledge],
      limits: {
        maxEntries: 6,
        maxRecordBytes: 16 * 1024 * 1024,
        maxTotalBytes: 64 * 1024 * 1024,
      },
    });
    const ledger = createGovernedDurableContextDeliveryLedger(storage);
    await expect(ledger.commitVerifiedOriginalDelivery(fixture.commitInput)).rejects.toThrow(
      /staging headroom/u,
    );
    expect(await readdir(join(paths.runtimeRoot, "staging"))).toEqual([]);
    expect(await readdir(join(paths.runtimeRoot, "transactions"))).toEqual([]);
    expect((await ledger.recover()).originalDeliveryTransactionCount).toBe(0);
  });

  it("rejects runtime-root symlinks and symlink escape", async () => {
    const paths = await testLayout();
    const outside = await mkdtemp(join(tmpdir(), "founderos-m12-outside-"));
    roots.push(outside);
    await mkdir(join(paths.repositoryRoot, ".founderos", "runtime"), { recursive: true });
    await symlink(outside, paths.runtimeRoot);
    await expect(openTestLedger(paths)).rejects.toThrow(/real directory|symbolic/u);
  });

  it("rejects runtime/source overlap in both directions", async () => {
    const paths = await testLayout();
    await expect(
      LocalFileDeliveryLedgerStorage.open({
        runtimeRoot: paths.runtimeRoot,
        repositoryRoot: paths.repositoryRoot,
        canonicalSourceRoots: [paths.repositoryRoot],
      }),
    ).rejects.toThrow(/must not overlap/u);
    await mkdir(paths.runtimeRoot, { recursive: true });
    const nestedSource = join(paths.runtimeRoot, "source");
    await mkdir(nestedSource);
    await expect(
      LocalFileDeliveryLedgerStorage.open({
        runtimeRoot: paths.runtimeRoot,
        repositoryRoot: paths.repositoryRoot,
        canonicalSourceRoots: [nestedSource],
      }),
    ).rejects.toThrow(/must not overlap/u);
  });

  it("rejects nested protected trees and resource-limit breaches before mutation", async () => {
    const paths = await testLayout();
    await mkdir(join(paths.runtimeRoot, ".git"), { recursive: true });
    await expect(openTestLedger(paths)).rejects.toThrow(/nested protected/u);
    await rm(paths.runtimeRoot, { recursive: true, force: true });
    await mkdir(paths.runtimeRoot, { recursive: true });
    await writeFile(join(paths.runtimeRoot, "oversized"), "12345");
    await expect(
      LocalFileDeliveryLedgerStorage.open({
        runtimeRoot: paths.runtimeRoot,
        repositoryRoot: paths.repositoryRoot,
        canonicalSourceRoots: [paths.docs],
        limits: { maxEntries: 1, maxTotalBytes: 4, maxRecordBytes: 4 },
      }),
    ).rejects.toThrow(/limit exceeded/u);
  });

  it("returns public failures without physical paths or credentials", async () => {
    const { paths } = await committedLedger();
    const [name] = await readdir(join(paths.runtimeRoot, "transactions"));
    await writeFile(join(paths.runtimeRoot, "transactions", name!), "token=/Users/adam/private");
    const ledger = await openTestLedger(paths);
    const result = await ledger.recover();
    expect(JSON.stringify(result)).not.toContain(paths.repositoryRoot);
    expect(JSON.stringify(result)).not.toContain("token=/Users");
  });
});
