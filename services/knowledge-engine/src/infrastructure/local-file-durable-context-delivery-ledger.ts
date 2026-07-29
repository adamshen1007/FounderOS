import {
  constants,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  DurableDeliveryDerivedIndexSchema,
  findDurableCanonicalJsonIssue,
  type DurableDeliveryDerivedIndex,
  type DurableDeliveryLedgerEvent,
} from "@founderos/knowledge-schema";

import {
  DurableDeliveryLedgerConflictError,
  DurableDeliveryLedgerIntegrityError,
  replayDurableDeliveryLedger,
  verifyDurableDeliveryLedgerEvent,
} from "../domain/durable-context-delivery-ledger.js";
import { createCanonicalSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import { serializeCanonicalDurablePayload } from "../domain/durable-registry.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type {
  DurableDeliveryLedgerStoragePort,
  DurableDeliveryLedgerWriterPort,
  VerifiedDurableDeliveryLedgerState,
} from "../application/durable-context-delivery-ledger-port.js";
import {
  createGovernedDurableContextDeliveryLedger,
  type GovernedDurableContextDeliveryLedger,
} from "../application/manage-governed-durable-context-delivery-ledger.js";

const HEAD_FILE = "commit-head.json";
const DERIVED_FILE = "delivery-index.json";

export interface LocalFileDeliveryLedgerLimits {
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxRecordBytes: number;
}

export interface LocalFileDeliveryLedgerOptions {
  readonly runtimeRoot: string;
  readonly repositoryRoot: string;
  readonly canonicalSourceRoots: readonly string[];
  readonly limits?: LocalFileDeliveryLedgerLimits;
}

export type LocalFileDeliveryLedgerFaultPoint =
  "after-event-install" | "after-head-install" | "before-derived-write";

export interface LocalFileDeliveryLedgerFaultHooks {
  readonly failAt?: LocalFileDeliveryLedgerFaultPoint;
}

interface LocalFileDeliveryLedgerLayout {
  readonly root: string;
  readonly transactions: string;
  readonly replayAttempts: string;
  readonly staging: string;
  readonly derived: string;
  readonly head: string;
  readonly lock: string;
}

interface DeliveryLedgerCommitHead {
  readonly schemaVersion: "1.0";
  readonly committedEventCount: number;
  readonly lastCommittedLedgerSequence: number;
  readonly lastAuditFingerprint: "genesis" | string;
  readonly ledgerIntegrityFingerprint: string;
  readonly headFingerprint: string;
}

const DEFAULT_LIMITS: LocalFileDeliveryLedgerLimits = {
  maxEntries: 10_000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxRecordBytes: 16 * 1024 * 1024,
};

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function hasTraversal(path: string): boolean {
  return path.split(/[\\/]/u).some((segment) => segment === ".." || segment === ".");
}

function inspectOptions(raw: unknown): LocalFileDeliveryLedgerOptions {
  if (
    raw === null ||
    typeof raw !== "object" ||
    (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)
  )
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger options must be a plain data object",
    );
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const allowed = new Set(["runtimeRoot", "repositoryRoot", "canonicalSourceRoots", "limits"]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key)))
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger options contain unsupported fields",
    );
  const values: Record<string, unknown> = Object.create(null);
  for (const field of ["runtimeRoot", "repositoryRoot", "canonicalSourceRoots"] as const) {
    const descriptor = descriptors[field];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new DurableDeliveryLedgerConflictError(
        "unsafe_content",
        "Delivery Ledger options require enumerable data properties",
      );
    values[field] = descriptor.value;
  }
  const limitsDescriptor = descriptors.limits;
  if (limitsDescriptor !== undefined) {
    if (!("value" in limitsDescriptor) || limitsDescriptor.get || limitsDescriptor.set)
      throw new DurableDeliveryLedgerConflictError(
        "unsafe_content",
        "Delivery Ledger limits must be a data property",
      );
    values.limits = limitsDescriptor.value;
  }
  if (
    typeof values.runtimeRoot !== "string" ||
    typeof values.repositoryRoot !== "string" ||
    !Array.isArray(values.canonicalSourceRoots) ||
    values.canonicalSourceRoots.some((value) => typeof value !== "string")
  )
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger path options are invalid",
    );
  return values as unknown as LocalFileDeliveryLedgerOptions;
}

function validateLimits(
  raw: LocalFileDeliveryLedgerLimits | undefined,
): LocalFileDeliveryLedgerLimits {
  if (raw === undefined) return DEFAULT_LIMITS;
  if (
    findDurableCanonicalJsonIssue(raw) !== null ||
    Object.getPrototypeOf(raw) !== Object.prototype ||
    Reflect.ownKeys(raw).some(
      (key) => !["maxEntries", "maxTotalBytes", "maxRecordBytes"].includes(String(key)),
    ) ||
    !Number.isSafeInteger(raw.maxEntries) ||
    raw.maxEntries <= 0 ||
    !Number.isSafeInteger(raw.maxTotalBytes) ||
    raw.maxTotalBytes <= 0 ||
    !Number.isSafeInteger(raw.maxRecordBytes) ||
    raw.maxRecordBytes <= 0 ||
    raw.maxRecordBytes > raw.maxTotalBytes
  )
    throw new DurableDeliveryLedgerConflictError(
      "resource_limit_exceeded",
      "Delivery Ledger resource limits are invalid",
    );
  return immutableCopy(raw);
}

function layout(runtimeRoot: string): LocalFileDeliveryLedgerLayout {
  return {
    root: runtimeRoot,
    transactions: join(runtimeRoot, "transactions"),
    replayAttempts: join(runtimeRoot, "replay-attempts"),
    staging: join(runtimeRoot, "staging"),
    derived: join(runtimeRoot, "derived"),
    head: join(runtimeRoot, HEAD_FILE),
    lock: join(runtimeRoot, ".writer.lock"),
  };
}

async function inspectExistingTree(
  root: string,
  limits: LocalFileDeliveryLedgerLimits,
): Promise<{ readonly entries: number; readonly totalBytes: number }> {
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { entries: 0, totalBytes: 0 };
    throw error;
  }
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger runtime root must be a real directory",
    );
  const pending = [root];
  let entries = 0;
  let totalBytes = 0;
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      entries += 1;
      if (entries > limits.maxEntries)
        throw new DurableDeliveryLedgerConflictError(
          "resource_limit_exceeded",
          "Delivery Ledger preflight entry limit exceeded",
        );
      const entryPath = join(directory, entry.name);
      const info = await lstat(entryPath);
      if (info.isSymbolicLink())
        throw new DurableDeliveryLedgerConflictError(
          "unsafe_content",
          "Delivery Ledger runtime tree cannot contain symbolic links",
        );
      if (entry.isDirectory()) {
        if ([".git", ".founderos", "docs", "knowledge"].includes(entry.name))
          throw new DurableDeliveryLedgerConflictError(
            "unsafe_content",
            "Delivery Ledger runtime tree contains a nested protected source or repository tree",
          );
        pending.push(entryPath);
      } else if (entry.isFile()) {
        totalBytes += info.size;
        if (info.size > limits.maxRecordBytes || totalBytes > limits.maxTotalBytes)
          throw new DurableDeliveryLedgerConflictError(
            "resource_limit_exceeded",
            "Delivery Ledger preflight byte limit exceeded",
          );
      } else {
        throw new DurableDeliveryLedgerConflictError(
          "unsafe_content",
          "Delivery Ledger runtime tree contains an unsafe entry type",
        );
      }
    }
  }
  return { entries, totalBytes };
}

async function validatePaths(options: LocalFileDeliveryLedgerOptions): Promise<{
  readonly runtimeRoot: string;
  readonly limits: LocalFileDeliveryLedgerLimits;
}> {
  const limits = validateLimits(options.limits);
  const paths = [options.runtimeRoot, options.repositoryRoot, ...options.canonicalSourceRoots];
  if (paths.some((path) => !isAbsolute(path) || hasTraversal(path) || path.includes("\0")))
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger paths must be absolute and traversal-free",
    );
  const repositoryRoot = await realpath(options.repositoryRoot);
  const lexicalRepositoryRoot = resolve(options.repositoryRoot);
  const lexicalRuntimeRoot = resolve(options.runtimeRoot);
  const runtimeRoot = resolve(repositoryRoot, relative(lexicalRepositoryRoot, lexicalRuntimeRoot));
  const allowedRuntimeRoot = join(repositoryRoot, ".founderos", "runtime");
  if (!isWithin(allowedRuntimeRoot, runtimeRoot) || runtimeRoot === allowedRuntimeRoot)
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger runtime root must be a dedicated repository runtime child",
    );
  const sourceRoots = await Promise.all(options.canonicalSourceRoots.map((path) => realpath(path)));
  if (
    sourceRoots.some(
      (sourceRoot) => isWithin(sourceRoot, runtimeRoot) || isWithin(runtimeRoot, sourceRoot),
    )
  )
    throw new DurableDeliveryLedgerConflictError(
      "unsafe_content",
      "Delivery Ledger runtime and canonical source roots must not overlap",
    );
  let ancestor = dirname(runtimeRoot);
  while (isWithin(repositoryRoot, ancestor) && ancestor !== repositoryRoot) {
    try {
      if ((await lstat(ancestor)).isSymbolicLink())
        throw new DurableDeliveryLedgerConflictError(
          "unsafe_content",
          "Delivery Ledger runtime ancestors cannot be symbolic links",
        );
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
    ancestor = dirname(ancestor);
  }
  await inspectExistingTree(runtimeRoot, limits);
  return { runtimeRoot, limits };
}

async function flushDirectory(directory: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (
      !isErrno(error, "EINVAL") &&
      !isErrno(error, "ENOTSUP") &&
      !isErrno(error, "EISDIR") &&
      !isErrno(error, "EBADF")
    )
      throw error;
  } finally {
    await handle?.close();
  }
}

async function writeFlushed(path: string, bytes: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceAtomically(path: string, bytes: string, staging: string): Promise<void> {
  const temporary = join(staging, `${basename(path)}.${process.pid}.tmp`);
  await rm(temporary, { force: true });
  await writeFlushed(temporary, bytes);
  await rename(temporary, path);
  await flushDirectory(dirname(path));
}

function emptyHead(): DeliveryLedgerCommitHead {
  const unsigned = {
    schemaVersion: "1.0" as const,
    committedEventCount: 0,
    lastCommittedLedgerSequence: 0,
    lastAuditFingerprint: "genesis" as const,
    ledgerIntegrityFingerprint: createCanonicalSha256Fingerprint([]),
  };
  return { ...unsigned, headFingerprint: createCanonicalSha256Fingerprint(unsigned) };
}

function parseHead(raw: unknown): DeliveryLedgerCommitHead {
  if (
    findDurableCanonicalJsonIssue(raw) !== null ||
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Delivery Ledger commit head is invalid",
    );
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "committedEventCount",
    "headFingerprint",
    "lastAuditFingerprint",
    "lastCommittedLedgerSequence",
    "ledgerIntegrityFingerprint",
    "schemaVersion",
  ];
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    value.schemaVersion !== "1.0" ||
    !Number.isSafeInteger(value.committedEventCount) ||
    !Number.isSafeInteger(value.lastCommittedLedgerSequence) ||
    typeof value.lastAuditFingerprint !== "string" ||
    typeof value.ledgerIntegrityFingerprint !== "string" ||
    typeof value.headFingerprint !== "string"
  )
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Delivery Ledger commit head fields are invalid",
    );
  const unsigned = { ...value };
  delete unsigned.headFingerprint;
  if (createCanonicalSha256Fingerprint(unsigned) !== value.headFingerprint)
    throw new DurableDeliveryLedgerIntegrityError(
      "fingerprint_mismatch",
      "Delivery Ledger commit-head fingerprint does not verify",
    );
  return value as unknown as DeliveryLedgerCommitHead;
}

function eventFileName(event: DurableDeliveryLedgerEvent): string {
  return `${String(event.ledgerSequence).padStart(16, "0")}-${event.auditFingerprint}.json`;
}

function sequenceFromName(name: string): number | null {
  const match = /^(\d{16})-[a-f0-9]{64}\.json$/u.exec(name);
  if (match === null) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

async function readJson(path: string, limits: LocalFileDeliveryLedgerLimits): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limits.maxRecordBytes)
    throw new DurableDeliveryLedgerIntegrityError(
      "resource_limit_exceeded",
      "Delivery Ledger record violates file safety limits",
    );
  const bytes = await readFile(path, "utf8");
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    throw new DurableDeliveryLedgerIntegrityError(
      "invalid_raw_record",
      "Delivery Ledger record is not valid JSON",
    );
  }
}

async function readOptionalJson(
  path: string,
  limits: LocalFileDeliveryLedgerLimits,
): Promise<unknown | null> {
  try {
    return await readJson(path, limits);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function initializeLayout(paths: LocalFileDeliveryLedgerLayout): Promise<void> {
  await mkdir(paths.transactions, { recursive: true, mode: 0o700 });
  await mkdir(paths.replayAttempts, { recursive: true, mode: 0o700 });
  await mkdir(paths.staging, { recursive: true, mode: 0o700 });
  await mkdir(paths.derived, { recursive: true, mode: 0o700 });
  try {
    await writeFlushed(paths.head, `${serializeCanonicalDurablePayload(emptyHead())}\n`);
    await flushDirectory(paths.root);
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
  }
}

class WriterLock {
  private constructor(
    private readonly path: string,
    private readonly handle: FileHandle,
  ) {}

  public static async acquire(path: string): Promise<WriterLock> {
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      await handle.writeFile('{"schemaVersion":"1.0","status":"locked"}\n', "utf8");
      await handle.sync();
      return new WriterLock(path, handle);
    } catch (error) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
        await rm(path, { force: true }).catch(() => undefined);
      }
      if (isErrno(error, "EEXIST"))
        throw new DurableDeliveryLedgerConflictError(
          "storage_failure",
          "Delivery Ledger already has an active cooperative writer",
        );
      throw error;
    }
  }

  public async release(): Promise<void> {
    await this.handle.close();
    await rm(this.path, { force: true });
  }
}

class LocalFileDeliveryLedgerWriter implements DurableDeliveryLedgerWriterPort {
  public constructor(
    private readonly storage: LocalFileDeliveryLedgerStorage,
    private readonly faultHooks: LocalFileDeliveryLedgerFaultHooks,
  ) {}

  public readVerifiedState(): Promise<VerifiedDurableDeliveryLedgerState> {
    return this.storage.readVerifiedState();
  }

  public async appendAuthoritativeEvent(
    event: DurableDeliveryLedgerEvent,
    expected: { readonly ledgerSequence: number; readonly auditFingerprint: string },
  ): Promise<void> {
    const current = await this.storage.readVerifiedState();
    if (
      current.replay.lastSequence !== expected.ledgerSequence ||
      current.replay.lastAuditFingerprint !== expected.auditFingerprint
    )
      throw new DurableDeliveryLedgerConflictError(
        "audit_chain_broken",
        "Expected Delivery Ledger head is stale",
      );
    const verified = verifyDurableDeliveryLedgerEvent(event);
    if (
      verified.ledgerSequence !== current.replay.lastSequence + 1 ||
      verified.previousAuditFingerprint !== current.replay.lastAuditFingerprint
    )
      throw new DurableDeliveryLedgerConflictError(
        "audit_chain_broken",
        "New Delivery Ledger event does not extend the committed head",
      );
    const directory =
      verified.eventType === "original-delivery"
        ? this.storage.paths.transactions
        : this.storage.paths.replayAttempts;
    const target = join(directory, eventFileName(verified));
    const temporary = join(
      this.storage.paths.staging,
      `${eventFileName(verified)}.${process.pid}.tmp`,
    );
    await rm(temporary, { force: true });
    const bytes = `${serializeCanonicalDurablePayload(verified)}\n`;
    const byteLength = Buffer.byteLength(bytes);
    if (byteLength > this.storage.limits.maxRecordBytes)
      throw new DurableDeliveryLedgerConflictError(
        "resource_limit_exceeded",
        "Delivery Ledger event exceeds the configured record limit",
      );
    const usage = await inspectExistingTree(this.storage.paths.root, this.storage.limits);
    if (
      usage.entries + 2 > this.storage.limits.maxEntries ||
      usage.totalBytes + byteLength * 2 > this.storage.limits.maxTotalBytes
    )
      throw new DurableDeliveryLedgerConflictError(
        "resource_limit_exceeded",
        "Delivery Ledger lacks safe staging headroom for another authoritative event",
      );
    await writeFlushed(temporary, bytes);
    try {
      await link(temporary, target);
      await unlink(temporary);
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      if ((await readFile(target, "utf8")) !== bytes)
        throw new DurableDeliveryLedgerConflictError(
          "artifact_conflict",
          "Delivery Ledger event coordinate already contains different immutable content",
        );
      await rm(temporary, { force: true });
    }
    await flushDirectory(directory);
    if (this.faultHooks.failAt === "after-event-install")
      throw new Error("injected failure after event install");
    const nextReplay = replayDurableDeliveryLedger([...current.replay.events, verified]);
    const unsignedHead = {
      schemaVersion: "1.0" as const,
      committedEventCount: nextReplay.events.length,
      lastCommittedLedgerSequence: nextReplay.lastSequence,
      lastAuditFingerprint: nextReplay.lastAuditFingerprint,
      ledgerIntegrityFingerprint: nextReplay.ledgerIntegrityFingerprint,
    };
    const head = {
      ...unsignedHead,
      headFingerprint: createCanonicalSha256Fingerprint(unsignedHead),
    };
    await replaceAtomically(
      this.storage.paths.head,
      `${serializeCanonicalDurablePayload(head)}\n`,
      this.storage.paths.staging,
    );
    if (this.faultHooks.failAt === "after-head-install")
      throw new Error("injected failure after head install");
  }

  public async replaceDerivedIndex(index: DurableDeliveryDerivedIndex): Promise<void> {
    if (this.faultHooks.failAt === "before-derived-write")
      throw new Error("injected derived-index failure");
    const parsed = DurableDeliveryDerivedIndexSchema.parse(index);
    await replaceAtomically(
      join(this.storage.paths.derived, DERIVED_FILE),
      `${serializeCanonicalDurablePayload(parsed)}\n`,
      this.storage.paths.staging,
    );
  }
}

export class LocalFileDeliveryLedgerStorage implements DurableDeliveryLedgerStoragePort {
  public readonly paths: LocalFileDeliveryLedgerLayout;

  private constructor(
    runtimeRoot: string,
    public readonly limits: LocalFileDeliveryLedgerLimits,
    private readonly faultHooks: LocalFileDeliveryLedgerFaultHooks,
    private readonly rootIdentity: { readonly device: bigint; readonly inode: bigint },
  ) {
    this.paths = layout(runtimeRoot);
  }

  public static async open(
    rawOptions: LocalFileDeliveryLedgerOptions,
    faultHooks: LocalFileDeliveryLedgerFaultHooks = {},
  ): Promise<LocalFileDeliveryLedgerStorage> {
    try {
      const options = inspectOptions(rawOptions);
      const validated = await validatePaths(options);
      const paths = layout(validated.runtimeRoot);
      await initializeLayout(paths);
      await inspectExistingTree(paths.root, validated.limits);
      const rootInfo = await stat(paths.root, { bigint: true });
      return new LocalFileDeliveryLedgerStorage(
        validated.runtimeRoot,
        validated.limits,
        faultHooks,
        { device: rootInfo.dev, inode: rootInfo.ino },
      );
    } catch (error) {
      if (error instanceof DurableDeliveryLedgerConflictError) throw error;
      throw new DurableDeliveryLedgerConflictError(
        "storage_failure",
        "Delivery Ledger could not be opened safely",
      );
    }
  }

  public async readVerifiedState(): Promise<VerifiedDurableDeliveryLedgerState> {
    try {
      const rootInfo = await stat(this.paths.root, { bigint: true });
      if (rootInfo.dev !== this.rootIdentity.device || rootInfo.ino !== this.rootIdentity.inode)
        throw new DurableDeliveryLedgerIntegrityError(
          "unsafe_content",
          "Delivery Ledger runtime identity changed after open",
        );
      await inspectExistingTree(this.paths.root, this.limits);
      const head = parseHead(await readJson(this.paths.head, this.limits));
      const candidates: { sequence: number; path: string }[] = [];
      for (const directory of [this.paths.transactions, this.paths.replayAttempts]) {
        for (const name of await readdir(directory)) {
          const sequence = sequenceFromName(name);
          if (sequence === null)
            throw new DurableDeliveryLedgerIntegrityError(
              "invalid_raw_record",
              "Committed Delivery Ledger directory contains an invalid entry name",
            );
          if (sequence <= head.lastCommittedLedgerSequence)
            candidates.push({ sequence, path: join(directory, name) });
        }
      }
      candidates.sort((left, right) => left.sequence - right.sequence);
      if (
        candidates.length !== head.committedEventCount ||
        candidates.some((entry, index) => entry.sequence !== index + 1)
      )
        throw new DurableDeliveryLedgerIntegrityError(
          "transaction_incomplete",
          "Commit head references a missing, duplicated, or reordered Delivery Ledger event",
        );
      const rawEvents = await Promise.all(
        candidates.map((candidate) => readJson(candidate.path, this.limits)),
      );
      const replay = replayDurableDeliveryLedger(rawEvents);
      if (
        replay.lastSequence !== head.lastCommittedLedgerSequence ||
        replay.lastAuditFingerprint !== head.lastAuditFingerprint ||
        replay.ledgerIntegrityFingerprint !== head.ledgerIntegrityFingerprint
      )
        throw new DurableDeliveryLedgerIntegrityError(
          "audit_chain_broken",
          "Commit head does not match the verified Delivery Ledger prefix",
        );
      let derivedIndex: unknown;
      try {
        derivedIndex = await readOptionalJson(join(this.paths.derived, DERIVED_FILE), this.limits);
      } catch {
        derivedIndex = { invalidDerivedIndex: true };
      }
      return { replay, derivedIndex };
    } catch (error) {
      if (error instanceof DurableDeliveryLedgerIntegrityError) throw error;
      throw new DurableDeliveryLedgerIntegrityError(
        "storage_failure",
        "Delivery Ledger storage could not be read safely",
      );
    }
  }

  public async withWriter<T>(
    operation: (writer: DurableDeliveryLedgerWriterPort) => Promise<T>,
  ): Promise<T> {
    const lock = await WriterLock.acquire(this.paths.lock);
    try {
      return await operation(new LocalFileDeliveryLedgerWriter(this, this.faultHooks));
    } finally {
      await lock.release();
    }
  }
}

export async function openLocalFileDurableContextDeliveryLedger(
  options: LocalFileDeliveryLedgerOptions,
): Promise<GovernedDurableContextDeliveryLedger> {
  return createGovernedDurableContextDeliveryLedger(
    await LocalFileDeliveryLedgerStorage.open(options),
  );
}

export async function openLocalFileDurableContextDeliveryLedgerForTesting(
  options: LocalFileDeliveryLedgerOptions,
  faultHooks: LocalFileDeliveryLedgerFaultHooks,
): Promise<GovernedDurableContextDeliveryLedger> {
  return createGovernedDurableContextDeliveryLedger(
    await LocalFileDeliveryLedgerStorage.open(options, faultHooks),
  );
}
