import {
  constants,
  type FileHandle,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  DurableReasoningExecutionDerivedIndexSchema,
  findDurableCanonicalJsonIssue,
  type DurableReasoningExecutionDerivedIndex,
  type ReasoningExecutionLedgerEvent,
} from "@founderos/knowledge-schema";

import {
  createGovernedReasoningExecutionEvidence,
  createSafeReasoningExecutionEvidenceReader,
  type GovernedReasoningExecutionEvidenceReader,
} from "../application/manage-governed-reasoning-execution-ledger.js";
import type {
  ReasoningExecutionLedgerStoragePort,
  ReasoningExecutionLedgerWriterPort,
  VerifiedReasoningExecutionLedgerState,
} from "../application/reasoning-execution-ledger-port.js";
import { createDurableCanonicalJsonSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import {
  ReasoningExecutionLedgerConflictError,
  ReasoningExecutionLedgerError,
  ReasoningExecutionLedgerIntegrityError,
  replayReasoningExecutionLedger,
  type ReasoningInvocationAuthority,
} from "../domain/durable-reasoning-execution-ledger.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

const HEAD_FILE = "commit-head.json";
const INDEX_FILE = "execution-index.json";
const DEFAULT_LIMITS = {
  maxEntries: 10_000,
  maxTotalBytes: 256 * 1024 * 1024,
  maxRecordBytes: 16 * 1024 * 1024,
};

export interface LocalFileReasoningExecutionEvidenceLimits {
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxRecordBytes: number;
}
export interface LocalFileReasoningExecutionEvidenceOptions {
  readonly runtimeRoot: string;
  readonly repositoryRoot: string;
  readonly canonicalSourceRoots: readonly string[];
  readonly limits?: LocalFileReasoningExecutionEvidenceLimits;
}

interface CommitEnvelope {
  readonly schemaVersion: "1.0";
  readonly event: ReasoningExecutionLedgerEvent;
  readonly invocationAuthority?: ReasoningInvocationAuthority;
  readonly commitFingerprint: string;
}
interface CommitHead {
  readonly schemaVersion: "1.0";
  readonly committedEventCount: number;
  readonly lastCommittedLedgerSequence: number;
  readonly lastAuditFingerprint: "genesis" | string;
  readonly executionEvidenceFingerprint: string;
  readonly authoritativeCommitFingerprint: string;
  readonly headFingerprint: string;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}
function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}
function safeError(code: ReasoningExecutionLedgerIntegrityError["code"], message: string) {
  return new ReasoningExecutionLedgerIntegrityError(code, message);
}
function serialize(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
function without(value: object, field: string) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function validateLimits(raw: LocalFileReasoningExecutionEvidenceLimits | undefined) {
  if (raw === undefined) return DEFAULT_LIMITS;
  if (
    findDurableCanonicalJsonIssue(raw) !== null ||
    !Number.isSafeInteger(raw.maxEntries) ||
    raw.maxEntries <= 0 ||
    !Number.isSafeInteger(raw.maxTotalBytes) ||
    raw.maxTotalBytes <= 0 ||
    !Number.isSafeInteger(raw.maxRecordBytes) ||
    raw.maxRecordBytes <= 0 ||
    raw.maxRecordBytes > raw.maxTotalBytes
  )
    throw safeError("resource_limit_exceeded", "Execution Ledger resource limits are invalid");
  return immutableCopy(raw);
}

async function validateOptions(raw: LocalFileReasoningExecutionEvidenceOptions) {
  if (raw === null || typeof raw !== "object" || Object.getPrototypeOf(raw) !== Object.prototype)
    throw safeError(
      "unsafe_content",
      "Execution Ledger options must be an accessor-free plain record",
    );
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const allowed = new Set(["runtimeRoot", "repositoryRoot", "canonicalSourceRoots", "limits"]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key)))
    throw safeError("unsafe_content", "Execution Ledger options contain unsupported fields");
  for (const field of [
    "runtimeRoot",
    "repositoryRoot",
    "canonicalSourceRoots",
    "limits",
  ] as const) {
    const descriptor = descriptors[field];
    if (field === "limits" && descriptor === undefined) continue;
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      throw safeError("unsafe_content", "Execution Ledger options require data properties");
  }
  const runtimeRoot = descriptors.runtimeRoot!.value;
  const repositoryRoot = descriptors.repositoryRoot!.value;
  const canonicalSourceRoots = descriptors.canonicalSourceRoots!.value;
  if (
    typeof runtimeRoot !== "string" ||
    typeof repositoryRoot !== "string" ||
    findDurableCanonicalJsonIssue(canonicalSourceRoots) !== null ||
    !Array.isArray(canonicalSourceRoots) ||
    canonicalSourceRoots.some((value) => typeof value !== "string") ||
    [runtimeRoot, repositoryRoot, ...canonicalSourceRoots].some(
      (path) => !isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/u).includes(".."),
    )
  )
    throw safeError("unsafe_content", "Execution Ledger paths are invalid");
  const realRepository = await realpath(repositoryRoot);
  const resolvedRuntime = resolve(
    realRepository,
    relative(resolve(repositoryRoot), resolve(runtimeRoot)),
  );
  const allowedRoot = join(realRepository, ".founderos", "runtime");
  if (!isWithin(allowedRoot, resolvedRuntime) || resolvedRuntime === allowedRoot)
    throw safeError("unsafe_content", "Execution Ledger runtime must be a dedicated runtime child");
  const realSources = await Promise.all(canonicalSourceRoots.map((path) => realpath(path)));
  if (
    realSources.some(
      (source) => isWithin(source, resolvedRuntime) || isWithin(resolvedRuntime, source),
    )
  )
    throw safeError("unsafe_content", "Execution Ledger runtime cannot overlap canonical sources");
  let ancestor = dirname(resolvedRuntime);
  while (ancestor !== realRepository && isWithin(realRepository, ancestor)) {
    try {
      if ((await lstat(ancestor)).isSymbolicLink())
        throw safeError(
          "unsafe_content",
          "Execution Ledger runtime ancestors cannot be symbolic links",
        );
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
    ancestor = dirname(ancestor);
  }
  try {
    const target = await lstat(resolvedRuntime);
    if (target.isSymbolicLink() || !target.isDirectory())
      throw safeError("unsafe_content", "Execution Ledger runtime root type is unsafe");
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  return {
    runtimeRoot: resolvedRuntime,
    limits: validateLimits(
      descriptors.limits === undefined
        ? undefined
        : (descriptors.limits.value as LocalFileReasoningExecutionEvidenceLimits),
    ),
  };
}

async function writeExclusive(path: string, bytes: string): Promise<void> {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function replaceAtomic(path: string, bytes: string, staging: string): Promise<void> {
  const temporary = join(staging, `${basename(path)}.${process.pid}.partial`);
  await rm(temporary, { force: true });
  await writeExclusive(temporary, bytes);
  await rename(temporary, path);
  await flushDirectory(dirname(path));
}
async function flushDirectory(path: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EBADF"].some((code) => isErrno(error, code))) throw error;
  } finally {
    await handle?.close();
  }
}
function nextAuthoritativeFingerprint(previous: string, commitFingerprint: string): string {
  return createDurableCanonicalJsonSha256Fingerprint({ previous, commitFingerprint });
}
function emptyHead(): CommitHead {
  const unsigned = {
    schemaVersion: "1.0" as const,
    committedEventCount: 0,
    lastCommittedLedgerSequence: 0,
    lastAuditFingerprint: "genesis" as const,
    executionEvidenceFingerprint: createDurableCanonicalJsonSha256Fingerprint([]),
    authoritativeCommitFingerprint: createDurableCanonicalJsonSha256Fingerprint([]),
  };
  return { ...unsigned, headFingerprint: createDurableCanonicalJsonSha256Fingerprint(unsigned) };
}
function parseHead(raw: unknown): CommitHead {
  if (findDurableCanonicalJsonIssue(raw) !== null || raw === null || typeof raw !== "object")
    throw safeError("invalid_raw_record", "Execution Ledger commit marker is invalid");
  const head = raw as CommitHead;
  const keys = Object.keys(head).sort();
  const expectedKeys = [
    "authoritativeCommitFingerprint",
    "committedEventCount",
    "executionEvidenceFingerprint",
    "headFingerprint",
    "lastAuditFingerprint",
    "lastCommittedLedgerSequence",
    "schemaVersion",
  ];
  const isDigest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    head.schemaVersion !== "1.0" ||
    !Number.isSafeInteger(head.committedEventCount) ||
    head.committedEventCount < 0 ||
    !isDigest(head.executionEvidenceFingerprint) ||
    !isDigest(head.authoritativeCommitFingerprint) ||
    !isDigest(head.headFingerprint) ||
    head.lastCommittedLedgerSequence !== head.committedEventCount ||
    (head.committedEventCount === 0) !== (head.lastAuditFingerprint === "genesis") ||
    (head.lastAuditFingerprint !== "genesis" && !isDigest(head.lastAuditFingerprint)) ||
    head.headFingerprint !==
      createDurableCanonicalJsonSha256Fingerprint(without(head, "headFingerprint"))
  )
    throw safeError("fingerprint_mismatch", "Execution Ledger commit marker does not verify");
  return head;
}
function parseEnvelope(raw: unknown): CommitEnvelope {
  if (findDurableCanonicalJsonIssue(raw) !== null || raw === null || typeof raw !== "object")
    throw safeError("invalid_raw_record", "Execution Ledger commit envelope is invalid");
  const envelope = raw as CommitEnvelope;
  const keys = Object.keys(envelope).sort();
  const expected =
    envelope.invocationAuthority === undefined
      ? ["commitFingerprint", "event", "schemaVersion"]
      : ["commitFingerprint", "event", "invocationAuthority", "schemaVersion"];
  if (
    JSON.stringify(keys) !== JSON.stringify(expected) ||
    envelope.schemaVersion !== "1.0" ||
    envelope.commitFingerprint !==
      createDurableCanonicalJsonSha256Fingerprint(without(envelope, "commitFingerprint"))
  )
    throw safeError("fingerprint_mismatch", "Execution Ledger commit envelope does not verify");
  if (
    (envelope.event.eventType === "invocation-ownership") !==
    (envelope.invocationAuthority !== undefined)
  )
    throw safeError(
      "invocation_binding_mismatch",
      "Execution Ledger authority must be committed with exactly one ownership event",
    );
  return immutableCopy(envelope);
}

class LocalReasoningExecutionStorage implements ReasoningExecutionLedgerStoragePort {
  private constructor(
    private readonly root: string,
    private readonly limits: LocalFileReasoningExecutionEvidenceLimits,
  ) {}
  public static async open(options: LocalFileReasoningExecutionEvidenceOptions) {
    try {
      const validated = await validateOptions(options);
      const storage = new LocalReasoningExecutionStorage(validated.runtimeRoot, validated.limits);
      await storage.initialize();
      await storage.readVerifiedState();
      return storage;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }
  private get events() {
    return join(this.root, "events");
  }
  private get staging() {
    return join(this.root, "staging");
  }
  private get derived() {
    return join(this.root, "derived");
  }
  private get head() {
    return join(this.root, HEAD_FILE);
  }
  private get index() {
    return join(this.derived, INDEX_FILE);
  }
  private get lock() {
    return join(this.root, ".single-writer.lock");
  }
  private async initialize() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(this.events, { recursive: true, mode: 0o700 });
    await mkdir(this.staging, { recursive: true, mode: 0o700 });
    await mkdir(this.derived, { recursive: true, mode: 0o700 });
    try {
      await writeExclusive(this.head, serialize(emptyHead()));
    } catch (error) {
      if (!isErrno(error, "EEXIST"))
        throw safeError("storage_failure", "Execution Ledger initialization failed");
    }
    await this.assertPhysicalLayout();
  }
  private async assertPhysicalLayout(): Promise<void> {
    const expectedRoot = resolve(this.root);
    for (const path of [this.root, this.events, this.staging, this.derived]) {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw safeError("unsafe_content", "Execution Ledger managed directory type is unsafe");
      const physical = await realpath(path);
      if (!isWithin(expectedRoot, physical) || (path === this.root && physical !== expectedRoot))
        throw safeError("unsafe_content", "Execution Ledger managed directory escaped its root");
    }
  }
  private async readJson(path: string, maxBytes: number): Promise<unknown> {
    let bytes: string;
    try {
      bytes = await readFile(path, "utf8");
    } catch {
      throw safeError("storage_failure", "Execution Ledger read failed");
    }
    if (Buffer.byteLength(bytes) > maxBytes)
      throw safeError(
        "resource_limit_exceeded",
        "Execution Ledger record exceeds configured limits",
      );
    try {
      return JSON.parse(bytes) as unknown;
    } catch {
      throw safeError("invalid_raw_record", "Execution Ledger record is not valid JSON");
    }
  }
  private async readHeadJson(): Promise<unknown> {
    let handle: FileHandle | undefined;
    try {
      const before = await lstat(this.head);
      if (before.isSymbolicLink() || !before.isFile() || before.size > this.limits.maxRecordBytes)
        throw safeError("unsafe_content", "Execution Ledger commit marker type is unsafe");
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      handle = await open(this.head, constants.O_RDONLY | noFollow);
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > this.limits.maxRecordBytes)
        throw safeError("unsafe_content", "Execution Ledger commit marker type is unsafe");
      const bytes = await handle.readFile("utf8");
      if (Buffer.byteLength(bytes) > this.limits.maxRecordBytes)
        throw safeError(
          "resource_limit_exceeded",
          "Execution Ledger record exceeds configured limits",
        );
      try {
        return JSON.parse(bytes) as unknown;
      } catch {
        throw safeError("invalid_raw_record", "Execution Ledger record is not valid JSON");
      }
    } catch (error) {
      if (error instanceof ReasoningExecutionLedgerError) throw error;
      if (isErrno(error, "ELOOP"))
        throw safeError("unsafe_content", "Execution Ledger commit marker type is unsafe");
      throw safeError("storage_failure", "Execution Ledger read failed");
    } finally {
      await handle?.close();
    }
  }
  public async readVerifiedState(): Promise<VerifiedReasoningExecutionLedgerState> {
    try {
      return await this.readVerifiedStateInternal();
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }
  private async readVerifiedStateInternal(): Promise<VerifiedReasoningExecutionLedgerState> {
    await this.assertPhysicalLayout();
    const head = parseHead(await this.readHeadJson());
    if (head.committedEventCount > this.limits.maxEntries)
      throw safeError("resource_limit_exceeded", "Execution Ledger entry limit exceeded");
    const names = await readdir(this.events);
    const committedNames = names.filter((name) => /^\d{16}\.json$/u.test(name)).sort();
    const events: ReasoningExecutionLedgerEvent[] = [];
    const authorities: ReasoningInvocationAuthority[] = [];
    let authoritativeCommitFingerprint = createDurableCanonicalJsonSha256Fingerprint([]);
    let totalBytes = 0;
    for (let sequence = 1; sequence <= head.committedEventCount; sequence += 1) {
      const name = `${String(sequence).padStart(16, "0")}.json`;
      if (!committedNames.includes(name))
        throw safeError("sequence_invalid", "Execution Ledger committed sequence is incomplete");
      const path = join(this.events, name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile())
        throw safeError("unsafe_content", "Execution Ledger authoritative entry type is unsafe");
      totalBytes += info.size;
      if (info.size > this.limits.maxRecordBytes || totalBytes > this.limits.maxTotalBytes)
        throw safeError("resource_limit_exceeded", "Execution Ledger byte limit exceeded");
      const envelope = parseEnvelope(await this.readJson(path, this.limits.maxRecordBytes));
      if (envelope.event.ledgerSequence !== sequence)
        throw safeError("sequence_invalid", "Execution Ledger file sequence is invalid");
      events.push(envelope.event);
      authoritativeCommitFingerprint = nextAuthoritativeFingerprint(
        authoritativeCommitFingerprint,
        envelope.commitFingerprint,
      );
      if (envelope.invocationAuthority !== undefined)
        authorities.push(envelope.invocationAuthority);
    }
    if (authoritativeCommitFingerprint !== head.authoritativeCommitFingerprint)
      throw safeError(
        "fingerprint_mismatch",
        "Execution Ledger committed authority does not match its head",
      );
    const replay = replayReasoningExecutionLedger(events, authorities);
    if (
      replay.lastAuditFingerprint !== head.lastAuditFingerprint ||
      replay.executionEvidenceFingerprint !== head.executionEvidenceFingerprint
    )
      throw safeError(
        "fingerprint_mismatch",
        "Execution Ledger committed head does not match authoritative history",
      );
    const derivedIndex = await this.readOptionalDerivedIndex();
    return immutableCopy({ replay, derivedIndex, authoritativeCommitFingerprint });
  }
  private async readOptionalDerivedIndex(): Promise<unknown> {
    try {
      const info = await lstat(this.index);
      if (info.isSymbolicLink() || !info.isFile() || info.size > this.limits.maxRecordBytes)
        return null;
      return await this.readJson(this.index, this.limits.maxRecordBytes);
    } catch {
      return null;
    }
  }
  public async withWriter<T>(
    operation: (writer: ReasoningExecutionLedgerWriterPort) => Promise<T>,
  ): Promise<T> {
    let handle: FileHandle;
    try {
      handle = await open(
        this.lock,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
    } catch {
      throw new ReasoningExecutionLedgerConflictError(
        "transaction_conflict",
        "Execution Ledger already has an active writer",
      );
    }
    const writer: ReasoningExecutionLedgerWriterPort = {
      readVerifiedState: () => this.readVerifiedState(),
      appendAuthoritativeEvent: (event, expected, invocationAuthority) =>
        this.append(event, expected, invocationAuthority),
      replaceDerivedIndex: (index) => this.replaceIndex(index),
    };
    return runReasoningWriterSession(
      () => operation(writer),
      () => handle.close(),
      () => rm(this.lock, { force: true }),
    );
  }
  private async append(
    event: ReasoningExecutionLedgerEvent,
    expected: { readonly ledgerSequence: number; readonly auditFingerprint: string },
    invocationAuthority?: ReasoningInvocationAuthority,
  ) {
    await this.assertPhysicalLayout();
    const current = await this.readVerifiedState();
    if (
      current.replay.lastSequence !== expected.ledgerSequence ||
      current.replay.lastAuditFingerprint !== expected.auditFingerprint ||
      event.ledgerSequence !== expected.ledgerSequence + 1 ||
      event.previousAuditFingerprint !== expected.auditFingerprint
    )
      throw new ReasoningExecutionLedgerConflictError(
        "audit_chain_broken",
        "Expected Execution Ledger head is stale",
      );
    const envelopeUnsigned = {
      schemaVersion: "1.0" as const,
      event,
      ...(invocationAuthority === undefined ? {} : { invocationAuthority }),
    };
    const envelope = {
      ...envelopeUnsigned,
      commitFingerprint: createDurableCanonicalJsonSha256Fingerprint(envelopeUnsigned),
    };
    const eventPath = join(this.events, `${String(event.ledgerSequence).padStart(16, "0")}.json`);
    try {
      const orphan = await lstat(eventPath);
      if (orphan.isSymbolicLink() || !orphan.isFile())
        throw safeError(
          "unsafe_content",
          "Execution Ledger uncommitted suffix has an unsafe entry type",
        );
      await rm(eventPath);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
    try {
      await writeExclusive(eventPath, serialize(envelope));
      await flushDirectory(this.events);
    } catch {
      throw safeError("storage_failure", "Execution Ledger authoritative append failed");
    }
    const nextEvents = [...current.replay.events, event];
    const headUnsigned = {
      schemaVersion: "1.0" as const,
      committedEventCount: nextEvents.length,
      lastCommittedLedgerSequence: nextEvents.length,
      lastAuditFingerprint: event.auditFingerprint,
      executionEvidenceFingerprint: createDurableCanonicalJsonSha256Fingerprint(nextEvents),
      authoritativeCommitFingerprint: nextAuthoritativeFingerprint(
        current.authoritativeCommitFingerprint,
        envelope.commitFingerprint,
      ),
    };
    await this.assertPhysicalLayout();
    await replaceAtomic(
      this.head,
      serialize({
        ...headUnsigned,
        headFingerprint: createDurableCanonicalJsonSha256Fingerprint(headUnsigned),
      }),
      this.staging,
    );
    await this.assertPhysicalLayout();
  }
  private async replaceIndex(index: DurableReasoningExecutionDerivedIndex) {
    await this.assertPhysicalLayout();
    const parsed = DurableReasoningExecutionDerivedIndexSchema.parse(index);
    await replaceAtomic(this.index, serialize(parsed), this.staging);
  }
}

function normalizeStorageError(error: unknown): ReasoningExecutionLedgerError {
  if (error instanceof ReasoningExecutionLedgerError) return error;
  return safeError("storage_failure", "Execution Ledger storage operation failed");
}

/** Deep-module test seam for deterministic primary-operation/cleanup error precedence. */
export async function runReasoningWriterSession<T>(
  operation: () => Promise<T>,
  closeHandle: () => Promise<unknown>,
  removeLock: () => Promise<unknown>,
): Promise<T> {
  let value: T | undefined;
  let operationCompleted = false;
  let primaryError: unknown;
  try {
    value = await operation();
    operationCompleted = true;
  } catch (error) {
    primaryError = error;
  }
  let cleanupError: unknown;
  try {
    await closeHandle();
  } catch (error) {
    cleanupError = error;
  }
  try {
    await removeLock();
  } catch (error) {
    cleanupError ??= error;
  }
  // The primary operation is authoritative; otherwise close precedes lock removal.
  if (primaryError !== undefined) throw normalizeStorageError(primaryError);
  if (cleanupError !== undefined) throw normalizeStorageError(cleanupError);
  if (!operationCompleted) throw safeError("storage_failure", "Execution Ledger writer failed");
  return value as T;
}

export async function openLocalFileGovernedReasoningExecutionEvidence(
  options: LocalFileReasoningExecutionEvidenceOptions,
): Promise<GovernedReasoningExecutionEvidenceReader> {
  return createSafeReasoningExecutionEvidenceReader(
    createGovernedReasoningExecutionEvidence(await LocalReasoningExecutionStorage.open(options)),
  );
}
