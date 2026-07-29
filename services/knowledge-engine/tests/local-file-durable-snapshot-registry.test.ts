import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { basename, relative, resolve } from "node:path";

import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import type {
  CommittedRegistryTransactionEnvelope,
  DurableSnapshotRegistrationRecord,
} from "@founderos/knowledge-schema";

import * as knowledgeEnginePublicApi from "../src/index.js";
import {
  LocalFileDurableSnapshotRegistry,
  LocalFileRegistryConflictError,
  LocalFileRegistryPathError,
  LocalFileRegistryWriterLockError,
} from "../src/index.js";
import {
  createCommittedRegistryTransactionEnvelope,
  createDurableAuditRecord,
  serializeCanonicalDurablePayload,
} from "../src/domain/durable-registry.js";
import {
  LocalFileRegistryStorage,
  localFileRegistryLayout,
  type LocalFileRegistryFaultPoint,
  type LocalFileRegistryReadFaultHooks,
  type LocalFileRegistryWriterSession,
} from "../src/infrastructure/local-file-durable-snapshot-registry-internal.js";
import {
  appendAdapterBootstrapHistory,
  appendAdapterRegistration,
  createAdapterChainBuilder,
  createAdapterSnapshot,
} from "./durable-registry-adapter-fixtures.js";

interface TestRegistryRoot {
  allowedParentRoot: string;
  runtimeRoot: string;
}

const cleanupRoots = new Set<string>();

async function createTestRoot(): Promise<TestRegistryRoot> {
  const allowedParentRoot = await mkdtemp(resolve(tmpdir(), "founderos-local-registry-"));
  cleanupRoots.add(allowedParentRoot);
  return {
    allowedParentRoot,
    runtimeRoot: resolve(allowedParentRoot, "runtime", "knowledge-registry"),
  };
}

async function openRegistry(root: TestRegistryRoot): Promise<LocalFileDurableSnapshotRegistry> {
  return LocalFileDurableSnapshotRegistry.open(root);
}

async function snapshotPhysicalTree(root: string): Promise<readonly string[]> {
  const snapshot: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = resolve(directoryPath, entry.name);
      const relativePath = relative(root, entryPath);
      if (entry.isDirectory()) {
        snapshot.push(`directory:${relativePath}`);
        await visit(entryPath);
      } else if (entry.isFile()) {
        snapshot.push(`file:${relativePath}:${await readFile(entryPath, "base64")}`);
      } else {
        snapshot.push(`other:${relativePath}`);
      }
    }
  }

  await visit(root);
  return snapshot;
}

function registrationRecord(
  envelope: CommittedRegistryTransactionEnvelope,
): DurableSnapshotRegistrationRecord {
  const record = envelope.records[0];
  if (record?.recordType !== "snapshot_registration") {
    throw new Error("Expected a snapshot-registration envelope fixture");
  }
  return record;
}

function committedEnvelopeFileName(envelope: CommittedRegistryTransactionEnvelope): string {
  return `${String(envelope.firstSequence).padStart(16, "0")}-${String(
    envelope.lastSequence,
  ).padStart(16, "0")}-${envelope.envelopeFingerprint}.json`;
}

function failAt(expected: LocalFileRegistryFaultPoint) {
  return {
    async onFaultPoint(actual: LocalFileRegistryFaultPoint): Promise<void> {
      if (actual === expected) throw new Error(`Injected interruption at ${actual}`);
    },
  };
}

function expectPortableDeterministicResult(result: unknown, root: TestRegistryRoot): void {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(root.runtimeRoot);
  expect(serialized).not.toContain(root.allowedParentRoot);
  expect(serialized).not.toContain(process.cwd());
  expect(serialized).not.toContain(tmpdir());
  expect(serialized).not.toMatch(/[/\\]Users[/\\]/u);
  expect(serialized).not.toContain(userInfo().username);
}

function expectPortableDomainError(error: unknown, root: TestRegistryRoot): void {
  expect(error).toBeInstanceOf(Error);
  const candidate = error as Error & { code?: string };
  expectPortableDeterministicResult(
    { code: candidate.code ?? null, message: candidate.message, name: candidate.name },
    root,
  );
}

function expectStorageSafetyResults(
  integrity: unknown,
  recovery: unknown,
  root: TestRegistryRoot,
): void {
  const issue = {
    code: "registry_storage_safety_failure",
    message: "Registry storage safety checks failed during verification",
  };
  expect(integrity).toMatchObject({ status: "invalid", issues: [issue] });
  expect(recovery).toMatchObject({ status: "failed", errors: [issue] });
  expectPortableDeterministicResult(integrity, root);
  expectPortableDeterministicResult(recovery, root);
}

afterEach(async () => {
  await Promise.all(
    [...cleanupRoots].map(async (root) => {
      await rm(root, { recursive: true, force: true });
      cleanupRoots.delete(root);
    }),
  );
});

describe("local file durable snapshot registry path boundary", () => {
  it("requires explicit absolute roots and rejects lexical traversal and source-tree targets", async () => {
    const root = await createTestRoot();

    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: "relative-parent",
        runtimeRoot: root.runtimeRoot,
      }),
    ).rejects.toBeInstanceOf(LocalFileRegistryPathError);
    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: root.allowedParentRoot,
        runtimeRoot: "relative-runtime",
      }),
    ).rejects.toBeInstanceOf(LocalFileRegistryPathError);
    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: root.allowedParentRoot,
        runtimeRoot: `${root.allowedParentRoot}/runtime/../escape`,
      }),
    ).rejects.toMatchObject({ code: "runtime_path_traversal" });
    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: `${root.allowedParentRoot}/nested/../`,
        runtimeRoot: root.runtimeRoot,
      }),
    ).rejects.toMatchObject({ code: "allowed_parent_path_traversal" });

    const outsideAllowedParent = await mkdtemp(resolve(tmpdir(), "founderos-registry-outside-"));
    cleanupRoots.add(outsideAllowedParent);
    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: root.allowedParentRoot,
        runtimeRoot: resolve(outsideAllowedParent, "registry"),
      }),
    ).rejects.toMatchObject({ code: "runtime_outside_allowed_parent" });

    for (const sourceTree of ["docs", "knowledge"] as const) {
      await expect(
        LocalFileDurableSnapshotRegistry.open({
          allowedParentRoot: root.allowedParentRoot,
          runtimeRoot: resolve(root.allowedParentRoot, sourceTree, "registry"),
        }),
      ).rejects.toMatchObject({ code: "canonical_source_target" });
    }
  });

  it("rejects an ancestor-symlink alias that physically resolves into a canonical source tree", async () => {
    const repositoryRoot = await mkdtemp(resolve(tmpdir(), "founderos-canonical-repository-"));
    const aliasRoot = await mkdtemp(resolve(tmpdir(), "founderos-canonical-alias-"));
    cleanupRoots.add(repositoryRoot);
    cleanupRoots.add(aliasRoot);
    const docsRoot = resolve(repositoryRoot, "docs");
    const knowledgeRoot = resolve(repositoryRoot, "knowledge");
    const physicalAllowedParent = resolve(docsRoot, "nested-parent");
    await mkdir(physicalAllowedParent, { recursive: true });
    await mkdir(knowledgeRoot);
    const alias = resolve(aliasRoot, "source-alias");
    await symlink(docsRoot, alias, "dir");
    const aliasedAllowedParent = resolve(alias, "nested-parent");
    const aliasedRuntime = resolve(aliasedAllowedParent, "registry-runtime");

    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: aliasedAllowedParent,
        canonicalSourceRoots: [docsRoot, knowledgeRoot],
        runtimeRoot: aliasedRuntime,
      }),
    ).rejects.toMatchObject({ code: "canonical_source_target" });
    await expect(lstat(resolve(physicalAllowedParent, "registry-runtime"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    ["configured", true],
    ["auto-discovered", false],
  ])(
    "rejects a runtime root containing %s source roots before any write",
    async (_mode, configured) => {
      const allowedParentRoot = await mkdtemp(
        resolve(tmpdir(), "founderos-canonical-ancestor-parent-"),
      );
      cleanupRoots.add(allowedParentRoot);
      const runtimeRoot = resolve(allowedParentRoot, "runtime");
      const repositoryRoot = resolve(runtimeRoot, "FounderOS");
      const docsRoot = resolve(repositoryRoot, "docs");
      const knowledgeRoot = resolve(repositoryRoot, "knowledge");
      await mkdir(docsRoot, { recursive: true });
      await mkdir(knowledgeRoot);
      const repositorySentinel = resolve(repositoryRoot, "repository-sentinel.txt");
      const docsSentinel = resolve(docsRoot, "docs-sentinel.txt");
      const knowledgeSentinel = resolve(knowledgeRoot, "knowledge-sentinel.txt");
      await writeFile(repositorySentinel, "repository sentinel", "utf8");
      await writeFile(docsSentinel, "docs sentinel", "utf8");
      await writeFile(knowledgeSentinel, "knowledge sentinel", "utf8");
      const beforeTree = await snapshotPhysicalTree(runtimeRoot);

      let error: unknown;
      try {
        await LocalFileDurableSnapshotRegistry.open({
          allowedParentRoot,
          ...(configured ? { canonicalSourceRoots: [docsRoot, knowledgeRoot] } : {}),
          runtimeRoot,
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({
        name: "LocalFileRegistryPathError",
        code: "canonical_source_target",
      });
      expectPortableDomainError(error, { allowedParentRoot, runtimeRoot });
      expect(await snapshotPhysicalTree(runtimeRoot)).toEqual(beforeTree);
      expect(await readFile(repositorySentinel, "utf8")).toBe("repository sentinel");
      expect(await readFile(docsSentinel, "utf8")).toBe("docs sentinel");
      expect(await readFile(knowledgeSentinel, "utf8")).toBe("knowledge sentinel");
      for (const managedEntry of ["commit-head.json", "committed", "derived", "locks", "staging"]) {
        await expect(lstat(resolve(runtimeRoot, managedEntry))).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    },
  );

  it("fails closed without traversing a symbolic link during recursive source discovery", async () => {
    const allowedParentRoot = await mkdtemp(
      resolve(tmpdir(), "founderos-canonical-symlink-parent-"),
    );
    const outsideRoot = await mkdtemp(resolve(tmpdir(), "founderos-canonical-symlink-outside-"));
    cleanupRoots.add(allowedParentRoot);
    cleanupRoots.add(outsideRoot);
    const runtimeRoot = resolve(allowedParentRoot, "runtime");
    await mkdir(resolve(runtimeRoot, "safe", "nested"), { recursive: true });
    await mkdir(resolve(outsideRoot, "FounderOS", "docs"), { recursive: true });
    const outsideSentinel = resolve(outsideRoot, "FounderOS", "docs", "sentinel.txt");
    await writeFile(outsideSentinel, "outside sentinel", "utf8");
    await symlink(outsideRoot, resolve(runtimeRoot, "linked-repository"), "dir");
    const beforeTree = await snapshotPhysicalTree(runtimeRoot);

    let error: unknown;
    try {
      await LocalFileDurableSnapshotRegistry.open({ allowedParentRoot, runtimeRoot });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: "LocalFileRegistryPathError",
      code: "symbolic_link_not_allowed",
    });
    expectPortableDomainError(error, { allowedParentRoot, runtimeRoot });
    expect(await snapshotPhysicalTree(runtimeRoot)).toEqual(beforeTree);
    expect(await readFile(outsideSentinel, "utf8")).toBe("outside sentinel");
    for (const managedEntry of ["commit-head.json", "committed", "derived", "locks", "staging"]) {
      await expect(lstat(resolve(runtimeRoot, managedEntry))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("rejects runtime-root, intermediate, and later descendant symbolic links", async () => {
    const root = await createTestRoot();
    const outside = await mkdtemp(resolve(tmpdir(), "founderos-registry-outside-"));
    cleanupRoots.add(outside);
    await mkdir(resolve(root.allowedParentRoot, "runtime"));
    await symlink(outside, root.runtimeRoot, "dir");
    await expect(openRegistry(root)).rejects.toMatchObject({ code: "symbolic_link_not_allowed" });

    await unlink(root.runtimeRoot);
    const linkedParent = resolve(root.allowedParentRoot, "linked-parent");
    await symlink(outside, linkedParent, "dir");
    await expect(
      LocalFileDurableSnapshotRegistry.open({
        allowedParentRoot: root.allowedParentRoot,
        runtimeRoot: resolve(linkedParent, "registry"),
      }),
    ).rejects.toMatchObject({ code: "symbolic_link_not_allowed" });

    const safeRuntime = resolve(root.allowedParentRoot, "safe", "registry");
    const registry = await LocalFileDurableSnapshotRegistry.open({
      allowedParentRoot: root.allowedParentRoot,
      runtimeRoot: safeRuntime,
    });
    await symlink(outside, resolve(safeRuntime, "staging", "escape"), "dir");
    await expect(registry.listSnapshots()).rejects.toMatchObject({
      code: "symbolic_link_not_allowed",
    });
  });

  it("fails when a critical managed directory is replaced after open", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const originalStagingRoot = `${layout.stagingRoot}-original`;
    await rename(layout.stagingRoot, originalStagingRoot);
    await mkdir(layout.stagingRoot);

    await expect(registry.listSnapshots()).rejects.toMatchObject({
      code: "runtime_directory_identity_changed",
    });
  });
});

describe("local registry public surface", () => {
  it("keeps storage, layout, raw append, and fault hooks unreachable from the root facade", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const publicKeys = Object.keys(knowledgeEnginePublicApi);

    expect(publicKeys).not.toContain("LocalFileRegistryStorage");
    expect(publicKeys).not.toContain("localFileRegistryLayout");
    expect(publicKeys).not.toContain("LocalFileRegistryFaultPoint");
    expect(publicKeys).not.toContain("LocalFileRegistryFaultHooks");
    expect(publicKeys.some((key) => key.toLowerCase().includes("appendcommitted"))).toBe(false);
    expect(Reflect.ownKeys(registry)).toEqual([]);
    expect("storage" in registry).toBe(false);

    const facadeSource = await readFile(
      resolve(import.meta.dirname, "../src/infrastructure/local-file-durable-snapshot-registry.ts"),
      "utf8",
    );
    const emittedFacade = transpileModule(facadeSource, {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    }).outputText;
    expect(emittedFacade).toContain("#storage");
    expect(emittedFacade).not.toContain("this.storage");
  });
});

describe("local file durable snapshot registration", () => {
  it.each([
    "transactionId",
    "sequence",
    "registrationId",
    "transitionId",
    "decisionId",
    "changeSetId",
    "activationId",
  ])(
    "does not invoke a throwing %s accessor or write through the public adapter",
    async (field) => {
      const root = await createTestRoot();
      const registry = await openRegistry(root);
      const chain = createAdapterChainBuilder();
      const record = structuredClone(
        registrationRecord(
          appendAdapterRegistration(
            chain,
            createAdapterSnapshot(`getter-${field}`),
            `getter-${field}`,
          ),
        ),
      ) as unknown as Record<string, unknown>;
      if (field.endsWith("Id") && field !== "transactionId") {
        for (const recordId of [
          "registrationId",
          "transitionId",
          "decisionId",
          "changeSetId",
          "activationId",
        ]) {
          delete record[recordId];
        }
      }
      let getterReadCount = 0;
      Object.defineProperty(record, field, {
        configurable: true,
        enumerable: true,
        get: () => {
          getterReadCount += 1;
          throw new Error(`Unexpected ${field} getter read`);
        },
      });

      let error: unknown;
      try {
        await registry.registerSnapshot(record as unknown as DurableSnapshotRegistrationRecord);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: "DurableRegistryIntegrityError",
        code: "invalid_durable_record",
      });
      expectPortableDomainError(error, root);
      expect(getterReadCount).toBe(0);
      expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
      expect(await readdir(localFileRegistryLayout(root.runtimeRoot).committedRoot)).toEqual([]);
    },
  );

  it("survives restart with deterministic immutable lookup/list output and isolated writes", async () => {
    const root = await createTestRoot();
    const docsFile = resolve(root.allowedParentRoot, "docs", "source.md");
    const knowledgeFile = resolve(root.allowedParentRoot, "knowledge", "source.md");
    const outsideFile = resolve(root.allowedParentRoot, "outside-sentinel.json");
    await mkdir(resolve(root.allowedParentRoot, "docs"));
    await mkdir(resolve(root.allowedParentRoot, "knowledge"));
    await writeFile(docsFile, "canonical docs", "utf8");
    await writeFile(knowledgeFile, "canonical knowledge", "utf8");
    await writeFile(outsideFile, "outside", "utf8");

    const chain = createAdapterChainBuilder();
    const secondEnvelope = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("version-b"),
      "version-b",
    );
    const firstEnvelope = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("version-a"),
      "version-a",
    );
    const registry = await openRegistry(root);
    await registry.registerSnapshot(registrationRecord(secondEnvelope));
    await registry.registerSnapshot(registrationRecord(firstEnvelope));

    const restarted = await openRegistry(root);
    const listed = await restarted.listSnapshots();
    expect(listed.map((record) => record.snapshot.snapshotId)).toEqual(
      listed.map((record) => record.snapshot.snapshotId).sort(),
    );
    expect(listed.map((record) => record.snapshot.corpusVersion).sort()).toEqual([
      "version-a",
      "version-b",
    ]);
    expect(await restarted.getSnapshot(listed[0]!.snapshot.snapshotId)).toEqual(listed[0]);
    expect(await restarted.getSnapshot("snapshot-missing")).toBeNull();
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed[0]!.snapshot)).toBe(true);
    expect(() => {
      (listed as DurableSnapshotRegistrationRecord[]).pop();
    }).toThrow();

    expect(await readFile(docsFile, "utf8")).toBe("canonical docs");
    expect(await readFile(knowledgeFile, "utf8")).toBe("canonical knowledge");
    expect(await readFile(outsideFile, "utf8")).toBe("outside");

    const committedFiles = await readdir(localFileRegistryLayout(root.runtimeRoot).committedRoot);
    expect(committedFiles).toHaveLength(2);
    expect(committedFiles).toEqual([...committedFiles].sort());
    expect(committedFiles.every((file) => /^\d{16}-\d{16}-[a-f0-9]{64}\.json$/u.test(file))).toBe(
      true,
    );
  });

  it("treats exact repeated registration as idempotent and rejects conflicting identity reuse", async () => {
    const root = await createTestRoot();
    const chain = createAdapterChainBuilder();
    const snapshot = createAdapterSnapshot("idempotent");
    const originalEnvelope = appendAdapterRegistration(chain, snapshot, "idempotent");
    const original = registrationRecord(originalEnvelope);
    const registry = await openRegistry(root);

    expect(await registry.registerSnapshot(original)).toEqual(original);
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const [committedName] = await readdir(layout.committedRoot);
    const originalCommittedBytes = await readFile(
      resolve(layout.committedRoot, committedName!),
      "utf8",
    );
    expect(await registry.registerSnapshot(structuredClone(original))).toEqual(original);
    expect((await registry.recover()).committedTransactionCount).toBe(1);

    const conflictingEnvelope = appendAdapterRegistration(
      chain,
      snapshot,
      "conflicting-registration",
      "Conflicting registration evidence.",
    );
    await expect(
      registry.registerSnapshot(registrationRecord(conflictingEnvelope)),
    ).rejects.toBeInstanceOf(LocalFileRegistryConflictError);
    expect((await registry.recover()).committedTransactionCount).toBe(1);
    expect(await readdir(layout.committedRoot)).toEqual([committedName]);
    expect(await readFile(resolve(layout.committedRoot, committedName!), "utf8")).toBe(
      originalCommittedBytes,
    );
  });

  it("rejects raw class-instance manifest evidence before registration can clone it", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const chain = createAdapterChainBuilder();
    const original = registrationRecord(
      appendAdapterRegistration(
        chain,
        createAdapterSnapshot("raw-class-instance"),
        "raw-class-instance",
      ),
    );
    const record = structuredClone(original);
    const plainEvidence = record.manifestEvidence;
    class UnsupportedManifestEvidence {
      public readonly manifest = plainEvidence.manifest;
      public readonly manifestReference = plainEvidence.manifestReference;
    }
    (record as unknown as { manifestEvidence: unknown }).manifestEvidence =
      new UnsupportedManifestEvidence();

    let error: unknown;
    try {
      await registry.registerSnapshot(record);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: "DurableRegistryIntegrityError",
      code: "invalid_manifest_evidence",
      message: "Snapshot registration manifest evidence must be finite canonical JSON",
    });
    expectPortableDomainError(error, root);
    expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
  });

  it("rejects an accessor discriminator before it can hide class-instance evidence", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const chain = createAdapterChainBuilder();
    const original = registrationRecord(
      appendAdapterRegistration(
        chain,
        createAdapterSnapshot("raw-accessor-discriminator"),
        "raw-accessor-discriminator",
      ),
    );
    const record = structuredClone(original);
    const plainEvidence = record.manifestEvidence;
    class UnsupportedManifestEvidence {
      public readonly manifest = plainEvidence.manifest;
      public readonly manifestReference = plainEvidence.manifestReference;
    }
    (record as unknown as { manifestEvidence: unknown }).manifestEvidence =
      new UnsupportedManifestEvidence();
    let discriminatorReadCount = 0;
    Object.defineProperty(record, "recordType", {
      configurable: true,
      enumerable: true,
      get: () => {
        discriminatorReadCount += 1;
        return "snapshot_registration";
      },
    });

    let error: unknown;
    try {
      await registry.registerSnapshot(record);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: "DurableRegistryIntegrityError",
      code: "invalid_durable_record",
      message:
        "Durable audit record must be a plain object with a valid own enumerable data recordType property",
    });
    expect(discriminatorReadCount).toBe(0);
    expectPortableDomainError(error, root);
    expect(await registry.recover()).toMatchObject({ registeredSnapshotCount: 0 });
  });

  it("does not break an existing writer lock and releases the lock after injected failure", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const chain = createAdapterChainBuilder();
    const envelope = appendAdapterRegistration(chain, createAdapterSnapshot("locked"), "locked");
    const record = registrationRecord(envelope);

    await writeFile(layout.writerLockPath, "operator-owned stale lock", { flag: "wx" });
    await expect(registry.registerSnapshot(record)).rejects.toBeInstanceOf(
      LocalFileRegistryWriterLockError,
    );
    expect(await readFile(layout.writerLockPath, "utf8")).toBe("operator-owned stale lock");
    await unlink(layout.writerLockPath);

    const storage = await LocalFileRegistryStorage.open(root);
    await expect(
      storage.appendCommittedEnvelope(envelope, failAt("after_envelope_staged")),
    ).rejects.toThrow("Injected interruption");
    await expect(lstat(layout.writerLockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(registry.registerSnapshot(record)).resolves.toEqual(record);
    await expect(lstat(layout.writerLockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps every atomic runtime directory on one device", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const devices = await Promise.all(
      [
        layout.runtimeRoot,
        layout.committedRoot,
        layout.stagingRoot,
        layout.derivedRoot,
        layout.locksRoot,
      ].map(async (directoryPath) => (await stat(directoryPath)).dev),
    );
    expect(new Set(devices).size).toBe(1);
  });
});

describe("local file registry commit and recovery", () => {
  it("verifies trusted historical prefixes only at committed transaction boundaries", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    appendAdapterBootstrapHistory(
      chain,
      createAdapterSnapshot("historical-prefix"),
      "historical-prefix",
    );
    for (const envelope of chain.envelopes) await storage.appendCommittedEnvelope(envelope);

    const first = chain.envelopes[0]!;
    await expect(storage.verifyIntegrityAtSequence(first.lastSequence)).resolves.toMatchObject({
      status: "valid",
      verifiedThroughSequence: first.lastSequence,
      lastRecordFingerprint: first.lastRecordFingerprint,
    });
    await expect(storage.recoverAtSequence(first.lastSequence)).resolves.toMatchObject({
      status: "recovered",
      activeSnapshotId: null,
      lastCommittedAuditSequence: first.lastSequence,
      lastRecordFingerprint: first.lastRecordFingerprint,
    });
    const multiRecord = chain.envelopes.find((envelope) => envelope.records.length > 1)!;
    await expect(
      storage.verifyIntegrityAtSequence(multiRecord.firstSequence),
    ).resolves.toMatchObject({
      status: "invalid",
      issues: [{ code: "integrity_sequence_not_committed_boundary" }],
    });
    await expect(storage.recoverAtSequence(multiRecord.firstSequence)).resolves.toMatchObject({
      status: "failed",
      errors: [{ code: "integrity_sequence_not_committed_boundary" }],
    });
  });

  it("serializes an exclusive writer session and invalidates it before lock release", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    const first = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("session-first"),
      "session-first",
    );
    const second = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("session-second"),
      "session-second",
    );
    let retainedSession: LocalFileRegistryWriterSession | undefined;

    await storage.withExclusiveWriter(async (writer) => {
      retainedSession = writer;
      await expect(
        Promise.all([
          writer.appendCommittedEnvelope(first),
          writer.appendCommittedEnvelope(second),
        ]),
      ).resolves.toEqual([first, second]);
    });

    expect((await storage.readVerifiedState()).replay.committedTransactionCount).toBe(2);
    if (retainedSession === undefined) throw new Error("Expected retained writer-session fixture");
    await expect(retainedSession.readVerifiedState()).rejects.toMatchObject({
      code: "writer_session_expired",
    });
  });

  it("keeps old state before the marker commit and recovers new state after it", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    const first = appendAdapterRegistration(chain, createAdapterSnapshot("old"), "old");
    await storage.appendCommittedEnvelope(first);
    const second = appendAdapterRegistration(chain, createAdapterSnapshot("new"), "new");

    await expect(
      storage.appendCommittedEnvelope(
        second,
        failAt("after_envelope_installed_before_commit_marker"),
      ),
    ).rejects.toThrow("Injected interruption");
    expect(
      (await (await openRegistry(root)).listSnapshots()).map((item) => item.snapshot.corpusVersion),
    ).toEqual(["old"]);

    await storage.appendCommittedEnvelope(second);
    const third = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("post-commit"),
      "post-commit",
    );
    await expect(
      storage.appendCommittedEnvelope(third, failAt("after_commit_marker_installed")),
    ).rejects.toThrow("Injected interruption");
    expect(
      (await (await openRegistry(root)).listSnapshots())
        .map((item) => item.snapshot.corpusVersion)
        .sort(),
    ).toEqual(["new", "old", "post-commit"]);
  });

  it("propagates a real marker-directory sync failure after the marker commit", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    const envelope = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("marker-sync-eio"),
      "marker-sync-eio",
    );
    const ioFailure = Object.assign(new Error("Injected marker-directory fsync failure"), {
      code: "EIO",
    });

    await expect(
      storage.appendCommittedEnvelope(envelope, {
        onDirectorySync(directoryPath) {
          if (directoryPath === root.runtimeRoot) throw ioFailure;
        },
      }),
    ).rejects.toMatchObject({ code: "EIO" });

    expect(
      (await (await openRegistry(root)).listSnapshots()).map(
        (registration) => registration.snapshot.corpusVersion,
      ),
    ).toEqual(["marker-sync-eio"]);
    await expect(
      lstat(localFileRegistryLayout(root.runtimeRoot).writerLockPath),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("ignores abandoned staging, temporary, and uncommitted suffix envelope files", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const chain = createAdapterChainBuilder();
    const committed = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("committed"),
      "committed",
    );
    await storage.appendCommittedEnvelope(committed);
    const orphan = appendAdapterRegistration(chain, createAdapterSnapshot("orphan"), "orphan");
    await expect(
      storage.appendCommittedEnvelope(
        orphan,
        failAt("after_envelope_installed_before_commit_marker"),
      ),
    ).rejects.toThrow("Injected interruption");
    await writeFile(resolve(layout.stagingRoot, "abandoned.json"), "not json", "utf8");
    await writeFile(resolve(layout.committedRoot, "abandoned.tmp"), "not json", "utf8");

    const restarted = await openRegistry(root);
    expect(await restarted.verifyIntegrity()).toMatchObject({ status: "valid" });
    expect(
      (await restarted.listSnapshots()).map((record) => record.snapshot.corpusVersion),
    ).toEqual(["committed"]);

    const replacementChain = createAdapterChainBuilder();
    appendAdapterRegistration(replacementChain, createAdapterSnapshot("committed"), "committed");
    const replacement = appendAdapterRegistration(
      replacementChain,
      createAdapterSnapshot("replacement"),
      "replacement",
    );
    await storage.appendCommittedEnvelope(replacement);
    expect(
      (await restarted.listSnapshots()).map((record) => record.snapshot.corpusVersion).sort(),
    ).toEqual(["committed", "replacement"]);
    expect(
      (await readdir(layout.stagingRoot)).some((fileName) => fileName.includes(".orphan.")),
    ).toBe(true);
  });

  it("fails closed for tampering, missing middle records, and valid committed suffix deletion", async () => {
    const tamperRoot = await createTestRoot();
    await openRegistry(tamperRoot);
    const tamperStorage = await LocalFileRegistryStorage.open(tamperRoot);
    const tamperChain = createAdapterChainBuilder();
    await tamperStorage.appendCommittedEnvelope(
      appendAdapterRegistration(tamperChain, createAdapterSnapshot("tamper"), "tamper"),
    );
    const tamperLayout = localFileRegistryLayout(tamperRoot.runtimeRoot);
    const [tamperName] = (await readdir(tamperLayout.committedRoot)).filter((name) =>
      name.endsWith(".json"),
    );
    const tampered = JSON.parse(
      await readFile(resolve(tamperLayout.committedRoot, tamperName!), "utf8"),
    ) as { records: [{ reason: string }] };
    tampered.records[0].reason = `  ${tampered.records[0].reason}  `;
    await writeFile(
      resolve(tamperLayout.committedRoot, tamperName!),
      JSON.stringify(tampered),
      "utf8",
    );
    expect(await (await openRegistry(tamperRoot)).verifyIntegrity()).toMatchObject({
      status: "invalid",
      issues: [{ code: "record_fingerprint_mismatch" }],
    });

    const nonFiniteRoot = await createTestRoot();
    await openRegistry(nonFiniteRoot);
    const nonFiniteStorage = await LocalFileRegistryStorage.open(nonFiniteRoot);
    const nonFiniteChain = createAdapterChainBuilder();
    await nonFiniteStorage.appendCommittedEnvelope(
      appendAdapterRegistration(nonFiniteChain, createAdapterSnapshot("non-finite"), "non-finite"),
    );
    const nonFiniteLayout = localFileRegistryLayout(nonFiniteRoot.runtimeRoot);
    const [nonFiniteName] = (await readdir(nonFiniteLayout.committedRoot)).filter((name) =>
      name.endsWith(".json"),
    );
    const nonFiniteEnvelope = JSON.parse(
      await readFile(resolve(nonFiniteLayout.committedRoot, nonFiniteName!), "utf8"),
    ) as { records: [{ reason: unknown }] };
    nonFiniteEnvelope.records[0].reason = Number.NaN;
    await writeFile(
      resolve(nonFiniteLayout.committedRoot, nonFiniteName!),
      JSON.stringify(nonFiniteEnvelope),
      "utf8",
    );
    expect(await (await openRegistry(nonFiniteRoot)).verifyIntegrity()).toMatchObject({
      status: "invalid",
      issues: [{ code: "record_fingerprint_mismatch" }],
    });

    const missingRoot = await createTestRoot();
    await openRegistry(missingRoot);
    const missingStorage = await LocalFileRegistryStorage.open(missingRoot);
    const missingChain = createAdapterChainBuilder();
    await missingStorage.appendCommittedEnvelope(
      appendAdapterRegistration(missingChain, createAdapterSnapshot("one"), "one"),
    );
    await missingStorage.appendCommittedEnvelope(
      appendAdapterRegistration(missingChain, createAdapterSnapshot("two"), "two"),
    );
    await missingStorage.appendCommittedEnvelope(
      appendAdapterRegistration(missingChain, createAdapterSnapshot("three"), "three"),
    );
    const missingLayout = localFileRegistryLayout(missingRoot.runtimeRoot);
    const missingFiles = (await readdir(missingLayout.committedRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
    await unlink(resolve(missingLayout.committedRoot, missingFiles[1]!));
    expect(await (await openRegistry(missingRoot)).verifyIntegrity()).toMatchObject({
      status: "invalid",
    });

    const suffixRoot = await createTestRoot();
    await openRegistry(suffixRoot);
    const suffixStorage = await LocalFileRegistryStorage.open(suffixRoot);
    const suffixChain = createAdapterChainBuilder();
    await suffixStorage.appendCommittedEnvelope(
      appendAdapterRegistration(suffixChain, createAdapterSnapshot("prefix"), "prefix"),
    );
    await suffixStorage.appendCommittedEnvelope(
      appendAdapterRegistration(suffixChain, createAdapterSnapshot("suffix"), "suffix"),
    );
    const suffixLayout = localFileRegistryLayout(suffixRoot.runtimeRoot);
    const suffixFiles = (await readdir(suffixLayout.committedRoot))
      .filter((name) => name.endsWith(".json"))
      .sort();
    await unlink(resolve(suffixLayout.committedRoot, suffixFiles.at(-1)!));
    expect(await (await openRegistry(suffixRoot)).verifyIntegrity()).toMatchObject({
      status: "invalid",
      issues: [{ code: "committed_history_coordinate_mismatch" }],
    });
  }, 15_000);

  it("preserves semantic replay progress when a later marker-referenced envelope is missing", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    const firstSnapshot = createAdapterSnapshot("semantic-prefix");
    const first = appendAdapterRegistration(chain, firstSnapshot, "semantic-prefix");
    const second = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("semantic-invalid"),
      "semantic-invalid",
    );
    const third = appendAdapterRegistration(
      chain,
      createAdapterSnapshot("missing-marker-tail"),
      "missing-marker-tail",
    );
    for (const envelope of [first, second, third]) {
      await storage.appendCommittedEnvelope(envelope);
    }

    const firstRegistration = registrationRecord(first);
    const secondRegistration = registrationRecord(second);
    const { recordFingerprint: _recordFingerprint, ...duplicateContent } =
      structuredClone(firstRegistration);
    void _recordFingerprint;
    const duplicateRegistration = createDurableAuditRecord<DurableSnapshotRegistrationRecord>({
      ...duplicateContent,
      transactionId: second.transactionId,
      sequence: secondRegistration.sequence,
      previousRecordFingerprint: secondRegistration.previousRecordFingerprint,
      reason: "Correctly signed duplicate snapshot registration.",
    });
    const semanticallyInvalidSecond = createCommittedRegistryTransactionEnvelope({
      transactionType: "registration",
      transactionId: second.transactionId,
      records: [duplicateRegistration],
      committedAt: second.committedAt,
    });

    const layout = localFileRegistryLayout(root.runtimeRoot);
    await unlink(resolve(layout.committedRoot, committedEnvelopeFileName(second)));
    await writeFile(
      resolve(layout.committedRoot, committedEnvelopeFileName(semanticallyInvalidSecond)),
      serializeCanonicalDurablePayload(semanticallyInvalidSecond),
      "utf8",
    );
    await unlink(resolve(layout.committedRoot, committedEnvelopeFileName(third)));

    const restarted = await openRegistry(root);
    expect(await restarted.verifyIntegrity()).toMatchObject({
      status: "invalid",
      verifiedTransactionCount: 1,
      verifiedRecordCount: 1,
      verifiedThroughSequence: 1,
      lastRecordFingerprint: first.lastRecordFingerprint,
      issues: [
        {
          code: "duplicate_record_id",
          transactionId: second.transactionId,
          sequence: 2,
        },
      ],
    });
    expect(await restarted.recover()).toMatchObject({
      status: "failed",
      registeredSnapshotCount: 1,
      lifecycleTransitionCount: 0,
      decisionCount: 0,
      activationCount: 0,
      committedTransactionCount: 1,
      committedRecordCount: 1,
      lastCommittedAuditSequence: 1,
      lastRecordFingerprint: first.lastRecordFingerprint,
      errors: [
        {
          code: "duplicate_record_id",
          transactionId: second.transactionId,
          sequence: 2,
        },
      ],
    });
  });

  it("requires a valid separately fingerprinted commit marker when envelopes exist", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    await storage.appendCommittedEnvelope(
      appendAdapterRegistration(chain, createAdapterSnapshot("marked"), "marked"),
    );
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const marker = JSON.parse(await readFile(layout.commitMarkerPath, "utf8")) as {
      lastEnvelopeFingerprint: string;
    };
    marker.lastEnvelopeFingerprint = "b".repeat(64);
    await writeFile(layout.commitMarkerPath, JSON.stringify(marker), "utf8");
    expect(await (await openRegistry(root)).verifyIntegrity()).toMatchObject({
      status: "invalid",
      issues: [{ code: "commit_marker_fingerprint_mismatch" }],
    });

    const missingMarkerRoot = await createTestRoot();
    await openRegistry(missingMarkerRoot);
    const missingMarkerStorage = await LocalFileRegistryStorage.open(missingMarkerRoot);
    const missingMarkerChain = createAdapterChainBuilder();
    await missingMarkerStorage.appendCommittedEnvelope(
      appendAdapterRegistration(
        missingMarkerChain,
        createAdapterSnapshot("missing-marker"),
        "missing-marker",
      ),
    );
    const missingMarkerLayout = localFileRegistryLayout(missingMarkerRoot.runtimeRoot);
    await unlink(missingMarkerLayout.commitMarkerPath);
    expect(await (await openRegistry(missingMarkerRoot)).verifyIntegrity()).toMatchObject({
      status: "invalid",
      issues: [{ code: "missing_commit_marker" }],
    });
  });
});

describe("local file registry histories and derived active index", () => {
  it("recovers deterministic lifecycle, decision, activation, and current-active views", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root);
    const chain = createAdapterChainBuilder();
    const snapshot = createAdapterSnapshot("active");
    appendAdapterBootstrapHistory(chain, snapshot, "active");
    for (const envelope of chain.envelopes) await storage.appendCommittedEnvelope(envelope);

    const restarted = await openRegistry(root);
    expect((await restarted.getCurrentActiveSnapshot())?.snapshot.snapshotId).toBe(
      snapshot.snapshotId,
    );
    expect(await restarted.getLifecycleHistory(snapshot.snapshotId)).toHaveLength(4);
    expect(await restarted.getReviewDecisionHistory(snapshot.snapshotId)).toHaveLength(1);
    expect(await restarted.getActivationHistory()).toHaveLength(1);
    expect(
      await restarted.getGovernedChangeSet(`change-bootstrap-to-${snapshot.snapshotId}`),
    ).not.toBeNull();
    expect(Object.isFrozen(await restarted.getActivationHistory())).toBe(true);
    expect(await restarted.recover()).toMatchObject({
      status: "recovered",
      activeSnapshotId: snapshot.snapshotId,
      lifecycleTransitionCount: 4,
      decisionCount: 1,
      activationCount: 1,
      committedTransactionCount: 6,
    });
    expect(await restarted.rebuildDerivedIndex()).toMatchObject({
      status: "rebuilt",
      index: { activeSnapshotId: snapshot.snapshotId, indexedThroughSequence: 8 },
    });
    const layout = localFileRegistryLayout(root.runtimeRoot);
    const whitespaceIndex = JSON.parse(await readFile(layout.activeIndexPath, "utf8")) as {
      activeSnapshotId: string;
    };
    whitespaceIndex.activeSnapshotId = `  ${whitespaceIndex.activeSnapshotId}  `;
    await writeFile(layout.activeIndexPath, JSON.stringify(whitespaceIndex), "utf8");
    expect(await restarted.inspectDerivedIndex()).toMatchObject({
      status: "invalid",
      issues: [{ code: expect.stringMatching(/fingerprint|canonical/u) }],
    });
  });

  it("validates, detects corruption/staleness, and deterministically rebuilds the derived index", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    expect(await registry.inspectDerivedIndex()).toMatchObject({ status: "missing", index: null });
    expect(await registry.verifyIntegrity()).toMatchObject({
      status: "valid",
      derivedIndexStatus: "missing",
      derivedIndexIssues: [],
    });
    expect(await registry.recover()).toMatchObject({
      status: "recovered",
      derivedIndexStatus: "missing",
      derivedIndexIssues: [],
    });

    const firstRebuild = await registry.rebuildDerivedIndex();
    expect(firstRebuild).toMatchObject({
      status: "rebuilt",
      index: { activeSnapshotId: null, indexedThroughSequence: 0 },
    });
    expect(await registry.inspectDerivedIndex()).toMatchObject({ status: "current" });
    expect(await registry.verifyIntegrity()).toMatchObject({
      status: "valid",
      derivedIndexStatus: "current",
    });
    expect(await registry.recover()).toMatchObject({
      status: "recovered",
      derivedIndexStatus: "current",
    });

    const layout = localFileRegistryLayout(root.runtimeRoot);
    await writeFile(layout.activeIndexPath, "{corrupt", "utf8");
    expect(await registry.inspectDerivedIndex()).toMatchObject({
      status: "invalid",
      issues: [{ code: "invalid_derived_index" }],
    });
    expect(await registry.verifyIntegrity()).toMatchObject({
      status: "valid",
      derivedIndexStatus: "invalid",
      derivedIndexIssues: [{ code: "invalid_derived_index" }],
    });
    expect(await registry.recover()).toMatchObject({
      status: "recovered",
      derivedIndexStatus: "invalid",
      derivedIndexIssues: [{ code: "invalid_derived_index" }],
    });
    expect(await registry.rebuildDerivedIndex()).toMatchObject({ status: "rebuilt" });

    const fingerprintMismatch = JSON.parse(await readFile(layout.activeIndexPath, "utf8")) as {
      activeSnapshotId: string | null;
    };
    fingerprintMismatch.activeSnapshotId = "snapshot-fingerprint-mismatch";
    await writeFile(layout.activeIndexPath, JSON.stringify(fingerprintMismatch), "utf8");
    expect(await registry.verifyIntegrity()).toMatchObject({
      status: "valid",
      derivedIndexStatus: "invalid",
      derivedIndexIssues: [{ code: "derived_index_fingerprint_mismatch" }],
    });
    expect(await registry.rebuildDerivedIndex()).toMatchObject({ status: "rebuilt" });

    const chain = createAdapterChainBuilder();
    await registry.registerSnapshot(
      registrationRecord(
        appendAdapterRegistration(chain, createAdapterSnapshot("index-stale"), "index-stale"),
      ),
    );
    expect(await registry.inspectDerivedIndex()).toMatchObject({
      status: "stale",
      index: { indexedThroughSequence: 0 },
    });
    expect(await registry.verifyIntegrity()).toMatchObject({
      status: "valid",
      derivedIndexStatus: "stale",
      derivedIndexIssues: [{ code: "stale_derived_index" }],
    });
    expect(await registry.recover()).toMatchObject({
      status: "recovered",
      registeredSnapshotCount: 1,
      derivedIndexStatus: "stale",
      derivedIndexIssues: [{ code: "stale_derived_index" }],
    });
    const rebuilt = await registry.rebuildDerivedIndex();
    expect(rebuilt).toMatchObject({
      status: "rebuilt",
      index: { indexedThroughSequence: 1, activeSnapshotId: null },
    });
    const persisted = await readFile(layout.activeIndexPath, "utf8");
    expect(JSON.parse(persisted)).toEqual(rebuilt.index);
    expect(basename(layout.activeIndexPath)).toBe("active-index.json");
  });

  it("normalizes authoritative disappearance and unreadable-file races without physical paths", async () => {
    const disappearanceRoot = await createTestRoot();
    await openRegistry(disappearanceRoot);
    const disappearanceStorage = await LocalFileRegistryStorage.open(disappearanceRoot);
    const disappearanceChain = createAdapterChainBuilder();
    await disappearanceStorage.appendCommittedEnvelope(
      appendAdapterRegistration(
        disappearanceChain,
        createAdapterSnapshot("disappearance"),
        "disappearance",
      ),
    );
    const disappearanceLayout = localFileRegistryLayout(disappearanceRoot.runtimeRoot);
    let removed = false;
    const disappearingRead: LocalFileRegistryReadFaultHooks = {
      async onBeforeFileRead(kind, logicalName) {
        if (kind !== "envelope" || removed) return;
        removed = true;
        await unlink(resolve(disappearanceLayout.committedRoot, logicalName));
      },
    };
    const racingStorage = await LocalFileRegistryStorage.open(disappearanceRoot, disappearingRead);
    const disappearance = await racingStorage.verifyIntegrity();
    expect(disappearance).toMatchObject({
      status: "invalid",
      issues: [{ code: "registry_file_unavailable" }],
    });
    expectPortableDeterministicResult(disappearance, disappearanceRoot);

    const unreadableRoot = await createTestRoot();
    await openRegistry(unreadableRoot);
    const unreadableStorage = await LocalFileRegistryStorage.open(unreadableRoot);
    const unreadableChain = createAdapterChainBuilder();
    await unreadableStorage.appendCommittedEnvelope(
      appendAdapterRegistration(unreadableChain, createAdapterSnapshot("unreadable"), "unreadable"),
    );
    const unreadable = await (
      await LocalFileRegistryStorage.open(unreadableRoot, {
        onBeforeFileRead(kind) {
          if (kind === "envelope") {
            throw Object.assign(new Error(`Injected EACCES at ${unreadableRoot.runtimeRoot}`), {
              code: "EACCES",
            });
          }
        },
      })
    ).recover();
    expect(unreadable).toMatchObject({
      status: "failed",
      errors: [{ code: "registry_file_unreadable" }],
    });
    expectPortableDeterministicResult(unreadable, unreadableRoot);
  });

  it("normalizes post-open storage safety failures into path-free public results", async () => {
    const replacedRoot = await createTestRoot();
    const replacedRegistry = await openRegistry(replacedRoot);
    const replacedLayout = localFileRegistryLayout(replacedRoot.runtimeRoot);
    await rename(replacedLayout.stagingRoot, `${replacedLayout.stagingRoot}-original`);
    await mkdir(replacedLayout.stagingRoot);
    expectStorageSafetyResults(
      await replacedRegistry.verifyIntegrity(),
      await replacedRegistry.recover(),
      replacedRoot,
    );

    const symlinkRoot = await createTestRoot();
    const symlinkRegistry = await openRegistry(symlinkRoot);
    const symlinkChain = createAdapterChainBuilder();
    const symlinkEnvelope = appendAdapterRegistration(
      symlinkChain,
      createAdapterSnapshot("symlink-authoritative-entry"),
      "symlink-authoritative-entry",
    );
    await symlinkRegistry.registerSnapshot(registrationRecord(symlinkEnvelope));
    const symlinkLayout = localFileRegistryLayout(symlinkRoot.runtimeRoot);
    const [symlinkEnvelopeName] = (await readdir(symlinkLayout.committedRoot)).filter((name) =>
      name.endsWith(".json"),
    );
    const symlinkEnvelopePath = resolve(symlinkLayout.committedRoot, symlinkEnvelopeName!);
    const symlinkTarget = resolve(symlinkRoot.allowedParentRoot, "outside-envelope.json");
    await writeFile(symlinkTarget, "{}", "utf8");
    await unlink(symlinkEnvelopePath);
    await symlink(symlinkTarget, symlinkEnvelopePath, "file");
    expectStorageSafetyResults(
      await symlinkRegistry.verifyIntegrity(),
      await symlinkRegistry.recover(),
      symlinkRoot,
    );

    const nonRegularRoot = await createTestRoot();
    const nonRegularRegistry = await openRegistry(nonRegularRoot);
    const nonRegularChain = createAdapterChainBuilder();
    const nonRegularEnvelope = appendAdapterRegistration(
      nonRegularChain,
      createAdapterSnapshot("non-regular-authoritative-entry"),
      "non-regular-authoritative-entry",
    );
    await nonRegularRegistry.registerSnapshot(registrationRecord(nonRegularEnvelope));
    const nonRegularLayout = localFileRegistryLayout(nonRegularRoot.runtimeRoot);
    const [nonRegularEnvelopeName] = (await readdir(nonRegularLayout.committedRoot)).filter(
      (name) => name.endsWith(".json"),
    );
    const nonRegularEnvelopePath = resolve(nonRegularLayout.committedRoot, nonRegularEnvelopeName!);
    await rename(nonRegularEnvelopePath, `${nonRegularEnvelopePath}.saved`);
    await mkdir(nonRegularEnvelopePath);
    expectStorageSafetyResults(
      await nonRegularRegistry.verifyIntegrity(),
      await nonRegularRegistry.recover(),
      nonRegularRoot,
    );
  });

  it("normalizes derived-index read failures while preserving authoritative validity", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    await registry.rebuildDerivedIndex();
    const storage = await LocalFileRegistryStorage.open(root, {
      onBeforeFileRead(kind) {
        if (kind === "derived_index") {
          throw Object.assign(new Error(`Injected EIO at ${root.runtimeRoot}`), { code: "EIO" });
        }
      },
    });

    const index = await storage.inspectDerivedIndex();
    expect(index).toMatchObject({
      status: "invalid",
      issues: [{ code: "registry_filesystem_failure" }],
    });
    const integrity = await storage.verifyIntegrity();
    expect(integrity).toMatchObject({
      status: "valid",
      derivedIndexStatus: "invalid",
      derivedIndexIssues: [{ code: "registry_filesystem_failure" }],
    });
    expectPortableDeterministicResult(index, root);
    expectPortableDeterministicResult(integrity, root);
  });

  it("normalizes direct index-operation authoritative read failures without physical paths", async () => {
    const root = await createTestRoot();
    await openRegistry(root);
    const storage = await LocalFileRegistryStorage.open(root, {
      onBeforeFileRead(kind) {
        if (kind === "commit_marker") {
          throw Object.assign(new Error(`Injected authoritative EIO at ${root.runtimeRoot}`), {
            code: "EIO",
          });
        }
      },
    });

    let inspectError: unknown;
    try {
      await storage.inspectDerivedIndex();
    } catch (error) {
      inspectError = error;
    }
    expect(inspectError).toMatchObject({ code: "registry_filesystem_failure" });
    expectPortableDomainError(inspectError, root);

    let rebuildError: unknown;
    try {
      await storage.rebuildDerivedIndex();
    } catch (error) {
      rebuildError = error;
    }
    expect(rebuildError).toMatchObject({ code: "registry_filesystem_failure" });
    expectPortableDomainError(rebuildError, root);
  });

  it("normalizes derived-index write failures without paths or partial replacement", async () => {
    const root = await createTestRoot();
    const registry = await openRegistry(root);
    const hooks: LocalFileRegistryReadFaultHooks & {
      readonly onBeforeDerivedIndexWrite: () => void;
    } = {
      onBeforeDerivedIndexWrite() {
        throw Object.assign(new Error(`Injected derived write EIO at ${root.runtimeRoot}`), {
          code: "EIO",
        });
      },
    };
    const storage = await LocalFileRegistryStorage.open(root, hooks);

    let rebuildError: unknown;
    try {
      await storage.rebuildDerivedIndex();
    } catch (error) {
      rebuildError = error;
    }
    expect(rebuildError).toMatchObject({ code: "registry_filesystem_failure" });
    expectPortableDomainError(rebuildError, root);
    expect(await registry.inspectDerivedIndex()).toMatchObject({ status: "missing", index: null });
  });
});
