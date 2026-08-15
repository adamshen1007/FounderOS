import { createHash } from "node:crypto";
import { constants, lstat, mkdir, open, opendir, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  M15_MAX_CANONICAL_SOURCE_ROOTS,
  M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
  M15_MAX_LEDGER_EVENTS,
  M15_MAX_QUARANTINE_ENTRIES,
  M15_MAX_STAGING_ENTRIES,
  ReadinessDerivedIndexCollectionSchema,
  CommittedReadinessEvaluationTransactionSchema,
  ReadinessAuditEntrySchema,
  ReadinessCommitMarkerSchema,
  ReadinessCompleteHistoryCommitmentSchema,
  ReadinessCurrentAdmissibilitySchema,
  ReadinessHistoricalComparisonSchema,
  ReadinessIdempotencyOwnershipSchema,
  ReadinessLedgerHeadSchema,
  ReadinessLedgerEventSchema,
  ReadinessRegistrationRequestSchema,
  ReadinessReplayAttemptSchema,
  ReadinessReplayRequestSchema,
  ReadinessReplaySemanticEventSchema,
  ReadinessSemanticEventSchema,
  ReadinessWriterLockCleanupRequestSchema,
  ReadinessWriterLockCleanupResultSchema,
  ReadinessWriterLockInspectionResultSchema,
  type ReadinessCommitMarker,
  type ReadinessDerivedIndex,
  type ReadinessLedgerEvent,
  type ReadinessWriterLockCleanupRequest,
  type ReadinessWriterLockCleanupResult,
  type ReadinessWriterLockInspectionResult,
} from "@founderos/knowledge-schema";

import type {
  ReadinessLedgerStorageInspection,
  ReadinessLedgerStoragePort,
  ReadinessLedgerWriterPort,
} from "../application/durable-readiness-ledger-port.js";
import {
  createGovernedReadinessEvaluationLedger,
  type GovernedReadinessEvaluationLedger,
} from "../application/manage-governed-readiness-evaluation-ledger.js";
import {
  createReadinessDerivedIndexes,
  createReadinessGenesisCommitment,
  DurableReadinessLedgerError,
  replayReadinessLedger,
  verifyReadinessCommitMarker,
} from "../domain/durable-readiness-ledger.js";
import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";

const CURRENT_MARKER = "commit-head.json";
const GENESIS_ARCHIVE = join("events", "genesis", "commit-marker.json");
const DERIVED_HEAD = join("derived", "HEAD.json");
const DERIVED_INDEXES = join("derived", "indexes.json");
const WRITER_LOCK = "writer.lock";
const INITIALIZATION_LOCK_PREFIX = ".founderos-m15-init-";
const INITIALIZATION_LOCK_SUFFIX = ".lock";
const INITIALIZATION_WAIT_ATTEMPTS = 500;
const INITIALIZATION_WAIT_MILLISECONDS = 10;
export const M15_MAX_ROOT_PATH_UTF8_BYTES = 768;
export const M15_MAX_DERIVED_PATH_UTF8_BYTES = 1_024;
export const M15_MAX_PATH_COMPONENT_UTF8_BYTES = 240;
export const M15_MAX_EVENT_BASENAME_UTF8_BYTES = 96;
const REGISTRATION_COMPONENTS = [
  "registration-request.json",
  "ownership.json",
  "transaction.json",
  "semantic-event.json",
  "audit-entry.json",
  "complete-history.json",
  "ledger-head.json",
  "commit-marker.json",
] as const;
const REGISTRATION_PRE_AUDIT_COMPONENTS = [
  "registration-request.json",
  "ownership.json",
  "transaction.json",
  "semantic-event.json",
] as const;
const REPLAY_COMPONENTS = [
  "replay-request.json",
  "historical-comparison.json",
  "current-admissibility.json",
  "replay-attempt.json",
  "semantic-event.json",
  "audit-entry.json",
  "complete-history.json",
  "ledger-head.json",
  "commit-marker.json",
] as const;
const REPLAY_PRE_AUDIT_COMPONENTS = [
  "replay-request.json",
  "historical-comparison.json",
  "current-admissibility.json",
  "replay-attempt.json",
  "semantic-event.json",
] as const;
const ALL_EVENT_COMPONENTS = new Set([...REGISTRATION_COMPONENTS, ...REPLAY_COMPONENTS]);

function sameNames(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((name) => actual.includes(name));
}

export interface LocalFileReadinessLedgerLimits {
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxRecordBytes: number;
}

export interface LocalFileReadinessLedgerOptions {
  readonly runtimeRoot: string;
  readonly repositoryRoot: string;
  readonly canonicalSourceRoots: readonly string[];
  readonly createIfMissing?: boolean;
  readonly limits?: LocalFileReadinessLedgerLimits;
}

export type LocalFileReadinessWriterLockInspectionResult = ReadinessWriterLockInspectionResult;
export type LocalFileReadinessWriterLockCleanupRequest = ReadinessWriterLockCleanupRequest;
export type LocalFileReadinessWriterLockCleanupResult = ReadinessWriterLockCleanupResult;

export interface LocalFileReadinessEvaluationLedger extends GovernedReadinessEvaluationLedger {
  inspectWriterLock(): Promise<LocalFileReadinessWriterLockInspectionResult>;
  cleanupInactiveWriterLock(
    request: LocalFileReadinessWriterLockCleanupRequest,
  ): Promise<LocalFileReadinessWriterLockCleanupResult>;
}

export type LocalFileReadinessLedgerFaultPoint =
  | "before-staging"
  | "attempted-staging-before-lock"
  | "before-lock-acquisition"
  | "after-lock-before-integrity"
  | "after-integrity-before-head"
  | "after-head-before-ownership"
  | "after-ownership-staging"
  | "after-transaction-install"
  | "after-audit-install"
  | "during-marker-write"
  | "after-current-marker-install"
  | "before-derived-head"
  | "during-derived-index"
  | "derived-publication-write-failure"
  | "before-lock-release"
  | "during-replay-staging"
  | "after-replay-install"
  | "after-replay-marker-before-index"
  | "interruption-with-lock"
  | "stale-lock-on-write";

export type LocalFileReadinessGenesisFaultPoint =
  | "before-genesis-staging"
  | "during-genesis-staging"
  | "after-genesis-archive"
  | "after-genesis-current-marker"
  | "pause-after-initialization-lock"
  | "pause-after-root-creation"
  | "pause-during-genesis-staging";

interface TestingFaults {
  readonly event?: LocalFileReadinessLedgerFaultPoint;
  readonly genesis?: LocalFileReadinessGenesisFaultPoint;
}

interface Layout {
  readonly root: string;
  readonly events: string;
  readonly registrations: string;
  readonly replays: string;
  readonly staging: string;
  readonly quarantine: string;
  readonly derived: string;
  readonly currentMarker: string;
  readonly genesisArchive: string;
  readonly derivedHead: string;
  readonly derivedIndexes: string;
  readonly lock: string;
}

interface DirectoryIdentity {
  readonly device: number;
  readonly inode: number;
}
type LayoutDirectoryIdentities = ReadonlyMap<string, DirectoryIdentity>;

interface LocalLockRecord {
  readonly lockContractVersion: "1.0";
  readonly lockKind: "initialization" | "writer";
  readonly processId: number;
  readonly acquiredAt: string;
  readonly lockFingerprint: string;
}

const DEFAULT_LIMITS: LocalFileReadinessLedgerLimits = {
  maxEntries: M15_MAX_LEDGER_EVENTS,
  maxTotalBytes: 256 * 1024 * 1024,
  maxRecordBytes: 16 * 1024 * 1024,
};
const MAX_TOTAL_BYTES = DEFAULT_LIMITS.maxTotalBytes;
const MAX_RECORD_BYTES = DEFAULT_LIMITS.maxRecordBytes;

function capturedStringArray(value: unknown, maximum: number): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor | undefined
  >;
  const keys = Reflect.ownKeys(value);
  const length = descriptors.length;
  if (
    length === undefined ||
    !("value" in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    length.value > maximum ||
    keys.length !== length.value + 1
  ) {
    return null;
  }
  const captured: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      return null;
    }
    captured.push(descriptor.value);
  }
  return keys.every((key) => key === "length" || (typeof key === "string" && /^\d+$/u.test(key)))
    ? Object.freeze(captured)
    : null;
}

function publicFailure(code: string): DurableReadinessLedgerError {
  return new DurableReadinessLedgerError(code, "Readiness ledger storage operation failed");
}

function errno(error: unknown, code: string): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code
  );
}

function within(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function assertSafeLexicalPath(path: string, maximumBytes: number): void {
  if (
    path.includes("\0") ||
    utf8Bytes(path) > maximumBytes ||
    path
      .split(/[\\/]/u)
      .filter(Boolean)
      .some((component) => utf8Bytes(component) > M15_MAX_PATH_COMPONENT_UTF8_BYTES)
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
}

function assertSafeDerivedPath(path: string): string {
  assertSafeLexicalPath(path, M15_MAX_DERIVED_PATH_UTF8_BYTES);
  return path;
}

function safeJoin(...parts: readonly string[]): string {
  return assertSafeDerivedPath(join(...parts));
}

function canonicalLockRecord(
  lockKind: LocalLockRecord["lockKind"],
  processId = process.pid,
  acquiredAt = new Date().toISOString(),
): LocalLockRecord {
  const unsigned = { lockContractVersion: "1.0", lockKind, processId, acquiredAt } as const;
  const lockFingerprint = createHash("sha256")
    .update("founderos.m15.local-lock.v1")
    .update("\0")
    .update(JSON.stringify(unsigned))
    .digest("hex");
  return Object.freeze({ ...unsigned, lockFingerprint });
}

function canonicalLockBytes(record: LocalLockRecord): string {
  return JSON.stringify(record);
}

function exactPlainOptions(raw: unknown): LocalFileReadinessLedgerOptions {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null)
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const allowed = new Set([
    "runtimeRoot",
    "repositoryRoot",
    "canonicalSourceRoots",
    "createIfMissing",
    "limits",
  ]);
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  if (
    Reflect.ownKeys(raw).some((key) => typeof key !== "string" || !allowed.has(key)) ||
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const value = Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
  ) as unknown as LocalFileReadinessLedgerOptions;
  const canonicalSourceRoots = capturedStringArray(
    value.canonicalSourceRoots,
    M15_MAX_CANONICAL_SOURCE_ROOTS,
  );
  if (
    typeof value.runtimeRoot !== "string" ||
    typeof value.repositoryRoot !== "string" ||
    canonicalSourceRoots === null ||
    (value.createIfMissing !== undefined && typeof value.createIfMissing !== "boolean")
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  return {
    ...value,
    canonicalSourceRoots,
    limits: value.limits === undefined ? undefined : checkedLimits(value.limits),
  };
}

function checkedLimits(
  raw: LocalFileReadinessLedgerLimits | undefined,
): LocalFileReadinessLedgerLimits {
  if (raw === undefined) return DEFAULT_LIMITS;
  if (raw === null || typeof raw !== "object" || Object.getPrototypeOf(raw) !== Object.prototype) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const captured = {
    maxEntries: descriptors.maxEntries?.value,
    maxTotalBytes: descriptors.maxTotalBytes?.value,
    maxRecordBytes: descriptors.maxRecordBytes?.value,
  };
  const { maxEntries, maxTotalBytes, maxRecordBytes } = captured;
  if (
    Reflect.ownKeys(raw).length !== 3 ||
    Reflect.ownKeys(raw).some((key) =>
      typeof key === "string"
        ? !["maxEntries", "maxTotalBytes", "maxRecordBytes"].includes(key)
        : true,
    ) ||
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    ) ||
    typeof maxEntries !== "number" ||
    !Number.isSafeInteger(maxEntries) ||
    maxEntries <= 0 ||
    maxEntries > M15_MAX_LEDGER_EVENTS ||
    typeof maxTotalBytes !== "number" ||
    !Number.isSafeInteger(maxTotalBytes) ||
    maxTotalBytes <= 0 ||
    maxTotalBytes > MAX_TOTAL_BYTES ||
    typeof maxRecordBytes !== "number" ||
    !Number.isSafeInteger(maxRecordBytes) ||
    maxRecordBytes <= 0 ||
    maxRecordBytes > MAX_RECORD_BYTES ||
    maxRecordBytes > maxTotalBytes
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  return Object.freeze(captured as LocalFileReadinessLedgerLimits);
}

async function existingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if (!errno(error, "ENOENT")) throw publicFailure("unsafe-filesystem-state");
      const parent = dirname(current);
      if (parent === current) throw publicFailure("unsafe-filesystem-state");
      current = parent;
    }
  }
}

async function captureRootIdentity(path: string): Promise<DirectoryIdentity> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw publicFailure("unsafe-filesystem-state");
  }
  return { device: info.dev, inode: info.ino };
}

async function assertRootIdentity(path: string, expected: DirectoryIdentity): Promise<void> {
  const actual = await captureRootIdentity(path);
  if (actual.device !== expected.device || actual.inode !== expected.inode) {
    throw publicFailure("unsafe-filesystem-state");
  }
}

async function assertDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw publicFailure("unsafe-filesystem-state");
  }
}

function canonicalDirectories(layout: Layout): readonly string[] {
  return [
    layout.root,
    layout.events,
    dirname(layout.genesisArchive),
    layout.registrations,
    layout.replays,
    layout.staging,
    layout.quarantine,
    layout.derived,
  ];
}

async function captureLayoutDirectoryIdentities(
  layout: Layout,
): Promise<LayoutDirectoryIdentities> {
  return new Map(
    await Promise.all(
      canonicalDirectories(layout).map(
        async (path) => [path, await captureRootIdentity(path)] as const,
      ),
    ),
  );
}

async function assertLayoutDirectoryIdentities(
  identities: LayoutDirectoryIdentities,
): Promise<void> {
  for (const [path, identity] of identities) await assertRootIdentity(path, identity);
}

async function assertSafeEntries(
  path: string,
  allowed: ReadonlySet<string> | RegExp,
  maximum = M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
): Promise<readonly string[]> {
  const names: string[] = [];
  const directory = await opendir(path);
  try {
    for await (const entry of directory) {
      if (names.length >= maximum) throw publicFailure("unsafe-filesystem-state");
      const accepted =
        allowed instanceof RegExp ? allowed.test(entry.name) : allowed.has(entry.name);
      if (!accepted || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw publicFailure("unsafe-filesystem-state");
      }
      names.push(entry.name);
    }
  } finally {
    await directory.close().catch((error) => {
      if (!errno(error, "ERR_DIR_CLOSED")) throw error;
    });
  }
  return names;
}

async function boundedDirectoryEntryCount(path: string, maximum: number): Promise<number> {
  let count = 0;
  const directory = await opendir(path);
  try {
    for await (const entry of directory) {
      void entry;
      if (count >= maximum) throw publicFailure("unsafe-filesystem-state");
      count += 1;
    }
  } finally {
    await directory.close().catch((error) => {
      if (!errno(error, "ERR_DIR_CLOSED")) throw error;
    });
  }
  return count;
}

async function rejectSymlinkComponents(path: string): Promise<void> {
  const components: string[] = [];
  let current = resolve(path);
  while (true) {
    components.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const component of components.reverse()) {
    try {
      const info = await lstat(component);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw publicFailure("unsafe-filesystem-state");
      }
    } catch (error) {
      if (error instanceof DurableReadinessLedgerError) throw error;
      if (errno(error, "ENOENT")) return;
      throw publicFailure("unsafe-filesystem-state");
    }
  }
}

async function safeLayout(raw: unknown): Promise<{
  readonly layout: Layout;
  readonly limits: LocalFileReadinessLedgerLimits;
  readonly createIfMissing: boolean;
}> {
  const options = exactPlainOptions(raw);
  for (const path of [
    options.runtimeRoot,
    options.repositoryRoot,
    ...options.canonicalSourceRoots,
  ]) {
    assertSafeLexicalPath(path, M15_MAX_ROOT_PATH_UTF8_BYTES);
  }
  if (
    !isAbsolute(options.runtimeRoot) ||
    !isAbsolute(options.repositoryRoot) ||
    options.canonicalSourceRoots.some((entry) => !isAbsolute(entry)) ||
    options.runtimeRoot.split(/[\\/]/u).some((entry) => entry === "." || entry === "..")
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const root = resolve(options.runtimeRoot);
  const repository = resolve(options.repositoryRoot);
  const home = resolve(homedir());
  if (
    root === sep ||
    root === home ||
    root === repository ||
    dirname(root) === sep ||
    within(root, repository) ||
    within(repository, root) ||
    options.canonicalSourceRoots.some((source) => {
      const canonical = resolve(source);
      return within(root, canonical) || within(canonical, root);
    })
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  for (const path of [root, repository, ...options.canonicalSourceRoots]) {
    await rejectSymlinkComponents(path);
  }
  const ancestor = await existingAncestor(root);
  const repositoryPhysical = await realpath(repository).catch(() => repository);
  const sourcePhysicalRoots = await Promise.all(
    options.canonicalSourceRoots.map((source) =>
      realpath(resolve(source)).catch(() => existingAncestor(resolve(source))),
    ),
  );
  if (
    within(ancestor, repositoryPhysical) ||
    within(repositoryPhysical, ancestor) ||
    sourcePhysicalRoots.some((source) => within(ancestor, source) || within(source, ancestor))
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const layout: Layout = {
    root,
    events: safeJoin(root, "events"),
    registrations: safeJoin(root, "events", "registrations"),
    replays: safeJoin(root, "events", "replay-attempts"),
    staging: safeJoin(root, "staging"),
    quarantine: safeJoin(root, "quarantine"),
    derived: safeJoin(root, "derived"),
    currentMarker: safeJoin(root, CURRENT_MARKER),
    genesisArchive: safeJoin(root, GENESIS_ARCHIVE),
    derivedHead: safeJoin(root, DERIVED_HEAD),
    derivedIndexes: safeJoin(root, DERIVED_INDEXES),
    lock: safeJoin(root, WRITER_LOCK),
  };
  return {
    layout,
    limits: checkedLimits(options.limits),
    createIfMissing: options.createIfMissing ?? false,
  };
}

async function syncWrite(path: string, bytes: string, exclusive: boolean): Promise<void> {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      (exclusive ? constants.O_EXCL : constants.O_TRUNC),
    0o600,
  );
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await handle.stat()).isDirectory()) throw publicFailure("unsafe-filesystem-state");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
}

async function safeRead(path: string, maxBytes: number): Promise<string> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw publicFailure("unsafe-filesystem-state");
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) throw publicFailure("unsafe-filesystem-state");
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw publicFailure("readiness-ledger-integrity-failure");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw publicFailure("readiness-ledger-integrity-failure");
    }
  } catch (error) {
    if (error instanceof DurableReadinessLedgerError || errno(error, "ENOENT")) throw error;
    throw publicFailure("unsafe-filesystem-state");
  } finally {
    await handle?.close();
  }
}

function parseJson(bytes: string): unknown {
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
}

function sequenceName(sequence: number, id: string): string {
  const idToken = createHash("sha256")
    .update("founderos.m15.event-location.v1")
    .update("\0")
    .update(id)
    .digest("hex");
  const value = `${String(sequence).padStart(12, "0")}-${idToken}`;
  if (utf8Bytes(value) > M15_MAX_EVENT_BASENAME_UTF8_BYTES) {
    throw publicFailure("unsafe-filesystem-state");
  }
  return value;
}

/** Direct-module deterministic physical-location seam; intentionally absent from the package facade. */
export function readinessEventLocationNameForTesting(sequence: number, id: string): string {
  return sequenceName(sequence, id);
}

interface StrictSchema<T> {
  parse(value: unknown): T;
}

async function readCanonicalComponent<T>(
  directory: string,
  name: string,
  schema: StrictSchema<T>,
  maxBytes: number,
): Promise<{ readonly value: T; readonly bytes: string }> {
  const bytes = await safeRead(safeJoin(directory, name), maxBytes);
  let value: T;
  try {
    value = schema.parse(parseJson(bytes));
    if (bytes === serializeDurableCanonicalJsonValue(value)) return { value, bytes };
  } catch {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
  throw publicFailure("readiness-ledger-integrity-failure");
}

function eventComponentValues(event: ReadinessLedgerEvent): ReadonlyMap<string, unknown> {
  if (event.category === "registration") {
    return new Map<string, unknown>([
      ["registration-request.json", event.registrationRequest],
      ["ownership.json", event.ownership],
      ["transaction.json", event.transaction],
      ["semantic-event.json", event.semanticEvent],
      ["audit-entry.json", event.auditEntry],
      ["complete-history.json", event.completeHistory],
      ["ledger-head.json", event.commitMarker.resultingLedgerHead],
      ["commit-marker.json", event.commitMarker],
    ]);
  }
  return new Map<string, unknown>([
    ["replay-request.json", event.replayRequest],
    ["historical-comparison.json", event.historicalComparison],
    ["current-admissibility.json", event.currentAdmissibility],
    ["replay-attempt.json", event.replayAttempt],
    ["semantic-event.json", event.semanticEvent],
    ["audit-entry.json", event.auditEntry],
    ["complete-history.json", event.completeHistory],
    ["ledger-head.json", event.commitMarker.resultingLedgerHead],
    ["commit-marker.json", event.commitMarker],
  ]);
}

async function readInstalledEvent(
  directory: string,
  category: "registration" | "replay",
  limits: LocalFileReadinessLedgerLimits,
  fallbackDirectory?: string,
): Promise<{
  readonly value: ReadinessLedgerEvent;
  readonly markerBytes: string;
  readonly totalBytes: number;
}> {
  const expectedNames = category === "registration" ? REGISTRATION_COMPONENTS : REPLAY_COMPONENTS;
  const names = await assertSafeEntries(directory, new Set(expectedNames));
  const fallbackNames =
    fallbackDirectory === undefined
      ? []
      : await assertSafeEntries(fallbackDirectory, new Set(expectedNames));
  const combinedNames = [...names, ...fallbackNames];
  if (
    new Set(combinedNames).size !== combinedNames.length ||
    combinedNames.length !== expectedNames.length ||
    expectedNames.some((name) => !combinedNames.includes(name))
  ) {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
  const componentDirectory = (name: string): string =>
    names.includes(name) ? directory : fallbackDirectory!;
  if (category === "registration") {
    const request = await readCanonicalComponent(
      componentDirectory("registration-request.json"),
      "registration-request.json",
      ReadinessRegistrationRequestSchema,
      limits.maxRecordBytes,
    );
    const ownership = await readCanonicalComponent(
      componentDirectory("ownership.json"),
      "ownership.json",
      ReadinessIdempotencyOwnershipSchema,
      limits.maxRecordBytes,
    );
    const transaction = await readCanonicalComponent(
      componentDirectory("transaction.json"),
      "transaction.json",
      CommittedReadinessEvaluationTransactionSchema,
      limits.maxRecordBytes,
    );
    const semanticEvent = await readCanonicalComponent(
      componentDirectory("semantic-event.json"),
      "semantic-event.json",
      ReadinessSemanticEventSchema,
      limits.maxRecordBytes,
    );
    const auditEntry = await readCanonicalComponent(
      componentDirectory("audit-entry.json"),
      "audit-entry.json",
      ReadinessAuditEntrySchema,
      limits.maxRecordBytes,
    );
    const completeHistory = await readCanonicalComponent(
      componentDirectory("complete-history.json"),
      "complete-history.json",
      ReadinessCompleteHistoryCommitmentSchema,
      limits.maxRecordBytes,
    );
    const ledgerHead = await readCanonicalComponent(
      componentDirectory("ledger-head.json"),
      "ledger-head.json",
      ReadinessLedgerHeadSchema,
      limits.maxRecordBytes,
    );
    const commitMarker = await readCanonicalComponent(
      componentDirectory("commit-marker.json"),
      "commit-marker.json",
      ReadinessCommitMarkerSchema,
      limits.maxRecordBytes,
    );
    if (
      commitMarker.value.markerCategory !== "registration" ||
      serializeDurableCanonicalJsonValue(ledgerHead.value) !==
        serializeDurableCanonicalJsonValue(commitMarker.value.resultingLedgerHead)
    ) {
      throw publicFailure("readiness-ledger-integrity-failure");
    }
    const value = ReadinessLedgerEventSchema.parse({
      eventEnvelopeContractVersion: "1.0",
      category,
      sequence: auditEntry.value.ledgerSequence,
      registrationRequest: request.value,
      ownership: ownership.value,
      transaction: transaction.value,
      semanticEvent: semanticEvent.value,
      auditEntry: auditEntry.value,
      completeHistory: completeHistory.value,
      commitMarker: commitMarker.value,
    });
    return {
      value,
      markerBytes: commitMarker.bytes,
      totalBytes: [
        request,
        ownership,
        transaction,
        semanticEvent,
        auditEntry,
        completeHistory,
        ledgerHead,
        commitMarker,
      ].reduce((total, component) => total + Buffer.byteLength(component.bytes), 0),
    };
  }
  const replayRequest = await readCanonicalComponent(
    componentDirectory("replay-request.json"),
    "replay-request.json",
    ReadinessReplayRequestSchema,
    limits.maxRecordBytes,
  );
  const historicalComparison = await readCanonicalComponent(
    componentDirectory("historical-comparison.json"),
    "historical-comparison.json",
    ReadinessHistoricalComparisonSchema,
    limits.maxRecordBytes,
  );
  const currentAdmissibility = await readCanonicalComponent(
    componentDirectory("current-admissibility.json"),
    "current-admissibility.json",
    ReadinessCurrentAdmissibilitySchema,
    limits.maxRecordBytes,
  );
  const replayAttempt = await readCanonicalComponent(
    componentDirectory("replay-attempt.json"),
    "replay-attempt.json",
    ReadinessReplayAttemptSchema,
    limits.maxRecordBytes,
  );
  const semanticEvent = await readCanonicalComponent(
    componentDirectory("semantic-event.json"),
    "semantic-event.json",
    ReadinessReplaySemanticEventSchema,
    limits.maxRecordBytes,
  );
  const auditEntry = await readCanonicalComponent(
    componentDirectory("audit-entry.json"),
    "audit-entry.json",
    ReadinessAuditEntrySchema,
    limits.maxRecordBytes,
  );
  const completeHistory = await readCanonicalComponent(
    componentDirectory("complete-history.json"),
    "complete-history.json",
    ReadinessCompleteHistoryCommitmentSchema,
    limits.maxRecordBytes,
  );
  const ledgerHead = await readCanonicalComponent(
    componentDirectory("ledger-head.json"),
    "ledger-head.json",
    ReadinessLedgerHeadSchema,
    limits.maxRecordBytes,
  );
  const commitMarker = await readCanonicalComponent(
    componentDirectory("commit-marker.json"),
    "commit-marker.json",
    ReadinessCommitMarkerSchema,
    limits.maxRecordBytes,
  );
  if (
    commitMarker.value.markerCategory !== "replay" ||
    serializeDurableCanonicalJsonValue(ledgerHead.value) !==
      serializeDurableCanonicalJsonValue(commitMarker.value.resultingLedgerHead)
  ) {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
  const value = ReadinessLedgerEventSchema.parse({
    eventEnvelopeContractVersion: "1.0",
    category,
    sequence: auditEntry.value.ledgerSequence,
    replayRequest: replayRequest.value,
    historicalComparison: historicalComparison.value,
    currentAdmissibility: currentAdmissibility.value,
    replayAttempt: replayAttempt.value,
    semanticEvent: semanticEvent.value,
    auditEntry: auditEntry.value,
    completeHistory: completeHistory.value,
    commitMarker: commitMarker.value,
  });
  return {
    value,
    markerBytes: commitMarker.bytes,
    totalBytes: [
      replayRequest,
      historicalComparison,
      currentAdmissibility,
      replayAttempt,
      semanticEvent,
      auditEntry,
      completeHistory,
      ledgerHead,
      commitMarker,
    ].reduce((total, component) => total + Buffer.byteLength(component.bytes), 0),
  };
}

async function ensureLeafDirectories(layout: Layout): Promise<void> {
  await mkdir(safeJoin(layout.events, "genesis"), { recursive: true, mode: 0o700 });
  await mkdir(layout.registrations, { recursive: true, mode: 0o700 });
  await mkdir(layout.replays, { recursive: true, mode: 0o700 });
  await mkdir(layout.staging, { recursive: true, mode: 0o700 });
  await mkdir(layout.quarantine, { recursive: true, mode: 0o700 });
  await mkdir(layout.derived, { recursive: true, mode: 0o700 });
}

class CooperativeWriterLock {
  private released = false;

  private constructor(private readonly path: string) {}

  public static async acquire(path: string): Promise<CooperativeWriterLock> {
    try {
      const handle = await open(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      await handle.writeFile(canonicalLockBytes(canonicalLockRecord("writer")), "utf8");
      await handle.sync();
      await handle.close();
      return new CooperativeWriterLock(path);
    } catch (error) {
      if (errno(error, "EEXIST")) throw publicFailure("operator-cleanup-required");
      throw publicFailure("lock-unavailable");
    }
  }

  public async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await unlink(this.path).catch((error) => {
      if (!errno(error, "ENOENT")) throw error;
    });
  }
}

function verifiedLockRecord(
  bytes: string,
  expectedKind: LocalLockRecord["lockKind"],
): LocalLockRecord {
  let candidate: unknown;
  try {
    candidate = JSON.parse(bytes) as unknown;
  } catch {
    throw publicFailure("operator-cleanup-required");
  }
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    Object.getPrototypeOf(candidate) !== Object.prototype ||
    Object.keys(candidate).sort().join("\0") !==
      ["acquiredAt", "lockContractVersion", "lockFingerprint", "lockKind", "processId"]
        .sort()
        .join("\0")
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  const value = candidate as Record<string, unknown>;
  if (
    value.lockContractVersion !== "1.0" ||
    value.lockKind !== expectedKind ||
    typeof value.processId !== "number" ||
    !Number.isSafeInteger(value.processId) ||
    value.processId <= 0 ||
    typeof value.acquiredAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.acquiredAt) ||
    new Date(value.acquiredAt).toISOString() !== value.acquiredAt ||
    typeof value.lockFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.lockFingerprint)
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  const expected = canonicalLockRecord(expectedKind, value.processId, value.acquiredAt);
  if (canonicalLockBytes(expected) !== bytes) throw publicFailure("operator-cleanup-required");
  return expected;
}

function processLiveness(processId: number): "active" | "inactive" | "ambiguous" {
  try {
    process.kill(processId, 0);
    return "active";
  } catch (error) {
    if (errno(error, "ESRCH")) return "inactive";
    if (errno(error, "EPERM")) return "active";
    return "ambiguous";
  }
}

function capturedCleanupRequest(raw: unknown): LocalFileReadinessWriterLockCleanupRequest {
  try {
    return Object.freeze(ReadinessWriterLockCleanupRequestSchema.parse(raw));
  } catch {
    throw publicFailure("operator-cleanup-required");
  }
}

async function inspectWriterLockAt(
  layout: Layout,
): Promise<LocalFileReadinessWriterLockInspectionResult> {
  try {
    const bytes = await safeRead(layout.lock, 4_096);
    const record = verifiedLockRecord(bytes, "writer");
    const status = processLiveness(record.processId);
    return ReadinessWriterLockInspectionResultSchema.parse({
      resultContractVersion: "1.0",
      status,
      lockFingerprint: record.lockFingerprint,
      writerProcessId: record.processId,
      reason: status === "ambiguous" ? "writer-liveness-ambiguous" : null,
    });
  } catch (error) {
    if (errno(error, "ENOENT")) {
      return ReadinessWriterLockInspectionResultSchema.parse({
        resultContractVersion: "1.0",
        status: "none",
        lockFingerprint: null,
        writerProcessId: null,
        reason: null,
      });
    }
    if (error instanceof DurableReadinessLedgerError) {
      return ReadinessWriterLockInspectionResultSchema.parse({
        resultContractVersion: "1.0",
        status: "ambiguous",
        lockFingerprint: null,
        writerProcessId: null,
        reason: "writer-lock-invalid",
      });
    }
    throw publicFailure("operator-cleanup-required");
  }
}

async function cleanupWriterLockAt(
  layout: Layout,
  limits: LocalFileReadinessLedgerLimits,
  requestRaw: unknown,
): Promise<LocalFileReadinessWriterLockCleanupResult> {
  const request = capturedCleanupRequest(requestRaw);
  const beforeRoot = await captureRootIdentity(layout.root);
  const inspection = await readInspection(layout, limits, beforeRoot);
  if (inspection.stagingOrphanCount !== 0 || inspection.installedUncommittedOrphanCount !== 0) {
    throw publicFailure("operator-cleanup-required");
  }
  const beforeLock = await lstat(layout.lock).catch((error) => {
    if (errno(error, "ENOENT")) return null;
    throw publicFailure("operator-cleanup-required");
  });
  if (beforeLock === null) {
    return ReadinessWriterLockCleanupResultSchema.parse({
      resultContractVersion: "1.0",
      status: "not-cleaned",
      lockFingerprint: null,
      reason: "writer-lock-not-found",
    });
  }
  if (!beforeLock.isFile() || beforeLock.isSymbolicLink()) {
    throw publicFailure("operator-cleanup-required");
  }
  const bytes = await safeRead(layout.lock, 4_096);
  const record = verifiedLockRecord(bytes, "writer");
  if (
    record.lockFingerprint !== request.lockFingerprint ||
    record.processId !== request.writerProcessId ||
    processLiveness(record.processId) !== "inactive"
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  await assertRootIdentity(layout.root, beforeRoot);
  const currentLock = await lstat(layout.lock);
  if (
    currentLock.dev !== beforeLock.dev ||
    currentLock.ino !== beforeLock.ino ||
    (await safeRead(layout.lock, 4_096)) !== bytes
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  await unlink(layout.lock);
  await assertRootIdentity(layout.root, beforeRoot);
  return ReadinessWriterLockCleanupResultSchema.parse({
    resultContractVersion: "1.0",
    status: "cleaned",
    lockFingerprint: record.lockFingerprint,
    reason: null,
  });
}

class InitializationLock {
  private released = false;

  private constructor(private readonly path: string) {}

  public static async acquire(root: string): Promise<InitializationLock> {
    const parent = dirname(root);
    const path = initializationLockPath(root);
    const parentIdentity = await captureRootIdentity(parent);

    for (let attempt = 0; attempt < INITIALIZATION_WAIT_ATTEMPTS; attempt += 1) {
      await assertRootIdentity(parent, parentIdentity);
      try {
        const handle = await open(
          path,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await handle.writeFile(canonicalLockBytes(canonicalLockRecord("initialization")), "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await assertRootIdentity(parent, parentIdentity);
        return new InitializationLock(path);
      } catch (error) {
        if (!errno(error, "EEXIST")) throw publicFailure("lock-unavailable");
        await delay(INITIALIZATION_WAIT_MILLISECONDS);
      }
    }
    throw publicFailure("operator-cleanup-required");
  }

  public async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await unlink(this.path).catch((error) => {
      if (!errno(error, "ENOENT")) throw error;
    });
  }
}

function initializationLockPath(root: string): string {
  const token = createHash("sha256")
    .update("founderos.m15.initialization-lock.v1")
    .update("\0")
    .update(basename(root))
    .digest("hex")
    .slice(0, 32);
  return safeJoin(
    dirname(root),
    `${INITIALIZATION_LOCK_PREFIX}${token}${INITIALIZATION_LOCK_SUFFIX}`,
  );
}

/** Direct-module deterministic initialization-lock seam; intentionally absent from package facade. */
export function readinessInitializationLockPathForTesting(root: string): string {
  return initializationLockPath(root);
}

async function initializeGenesis(
  layout: Layout,
  limits: LocalFileReadinessLedgerLimits,
  faults: TestingFaults,
): Promise<void> {
  const initializationLock = await InitializationLock.acquire(layout.root);
  try {
    if (faults.genesis === "pause-after-initialization-lock") await delay(60_000);
    if (faults.genesis === "before-genesis-staging") throw publicFailure("append-failure");
    await mkdir(layout.root, { recursive: false, mode: 0o700 }).catch((error) => {
      if (!errno(error, "EEXIST")) throw error;
    });
    await rejectSymlinkComponents(layout.root);
    if (faults.genesis === "pause-after-root-creation") await delay(60_000);
    const initializationRootIdentity = await captureRootIdentity(layout.root);
    await ensureLeafDirectories(layout);
    await assertRootIdentity(layout.root, initializationRootIdentity);
    const lock = await CooperativeWriterLock.acquire(layout.lock);
    try {
      const permitted = new Set([
        "events",
        "staging",
        "quarantine",
        "derived",
        WRITER_LOCK,
        CURRENT_MARKER,
      ]);
      await assertSafeEntries(layout.root, permitted);
      const genesis = createReadinessGenesisCommitment();
      const bytes = serializeDurableCanonicalJsonValue(genesis.marker);
      if (Buffer.byteLength(bytes) > limits.maxRecordBytes)
        throw publicFailure("unsafe-filesystem-state");
      let currentInstalled = false;
      try {
        const current = await safeRead(layout.currentMarker, limits.maxRecordBytes);
        currentInstalled = true;
        const archive = await safeRead(layout.genesisArchive, limits.maxRecordBytes);
        if (current === bytes && archive === bytes) return;
        throw publicFailure("genesis-corrupt");
      } catch (error) {
        if (currentInstalled) throw publicFailure("genesis-corrupt");
        if (error instanceof DurableReadinessLedgerError) throw error;
      }
      const stagedArchive = safeJoin(layout.staging, "genesis-archive.json");
      const stagedCurrent = safeJoin(layout.staging, "genesis-current.json");
      const stagingEntries = await assertSafeEntries(
        layout.staging,
        new Set(["genesis-archive.json", "genesis-current.json"]),
        M15_MAX_STAGING_ENTRIES,
      );
      for (const entry of stagingEntries) {
        if (entry !== "genesis-archive.json" && entry !== "genesis-current.json") {
          throw publicFailure("genesis-initialization-incomplete");
        }
        const staged = safeJoin(layout.staging, entry);
        if ((await safeRead(staged, limits.maxRecordBytes)) !== bytes) {
          throw publicFailure("genesis-corrupt");
        }
        await unlink(staged);
      }
      let archiveInstalled = false;
      try {
        archiveInstalled = (await safeRead(layout.genesisArchive, limits.maxRecordBytes)) === bytes;
        if (!archiveInstalled) throw publicFailure("genesis-corrupt");
      } catch (error) {
        if (error instanceof DurableReadinessLedgerError) throw error;
        if (!errno(error, "ENOENT")) throw publicFailure("genesis-corrupt");
      }
      if (!archiveInstalled) await syncWrite(stagedArchive, bytes, true);
      if (faults.genesis === "pause-during-genesis-staging") await delay(60_000);
      if (faults.genesis === "during-genesis-staging") throw publicFailure("append-failure");
      await syncWrite(stagedCurrent, bytes, true);
      if (!archiveInstalled) {
        await rename(stagedArchive, layout.genesisArchive);
        await syncDirectory(dirname(layout.genesisArchive));
      }
      if (faults.genesis === "after-genesis-archive") throw publicFailure("append-failure");
      await rename(stagedCurrent, layout.currentMarker);
      await syncDirectory(layout.root);
      if (faults.genesis === "after-genesis-current-marker") throw publicFailure("append-failure");
      await publishDerived(layout, genesis.marker, [], limits);
    } finally {
      await lock.release();
    }
  } finally {
    await initializationLock.release();
  }
}

async function listEventDirectories(path: string): Promise<readonly string[]> {
  try {
    await assertDirectory(path);
    const before = await captureRootIdentity(path);
    const names: string[] = [];
    const handle = await opendir(path);
    try {
      for await (const entry of handle) {
        if (names.length >= M15_MAX_LEDGER_EVENTS) {
          throw publicFailure("unsafe-filesystem-state");
        }
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          !/^\d{12}-[a-f0-9]{64}$/u.test(entry.name) ||
          utf8Bytes(entry.name) > M15_MAX_EVENT_BASENAME_UTF8_BYTES
        ) {
          throw publicFailure("unsafe-filesystem-state");
        }
        names.push(entry.name);
      }
    } finally {
      await handle.close().catch((error) => {
        if (!errno(error, "ERR_DIR_CLOSED")) throw error;
      });
    }
    const directories = names.map((name) => safeJoin(path, name)).sort();
    for (const directory of directories) await assertDirectory(directory);
    await assertRootIdentity(path, before);
    return directories;
  } catch (error) {
    if (errno(error, "ENOENT")) return [];
    throw error;
  }
}

async function readInspection(
  layout: Layout,
  limits: LocalFileReadinessLedgerLimits,
  expectedRootIdentity?: DirectoryIdentity,
  expectedDirectoryIdentities?: LayoutDirectoryIdentities,
): Promise<ReadinessLedgerStorageInspection> {
  if (expectedDirectoryIdentities !== undefined) {
    await assertLayoutDirectoryIdentities(expectedDirectoryIdentities);
  }
  if (expectedRootIdentity !== undefined) {
    await assertRootIdentity(layout.root, expectedRootIdentity);
  }
  for (const directory of [
    layout.events,
    dirname(layout.genesisArchive),
    layout.registrations,
    layout.replays,
    layout.staging,
    layout.quarantine,
    layout.derived,
  ]) {
    await assertDirectory(directory);
  }
  await assertSafeEntries(
    layout.root,
    new Set([
      "events",
      "staging",
      "quarantine",
      "derived",
      basename(layout.currentMarker),
      WRITER_LOCK,
    ]),
  );
  await assertSafeEntries(layout.events, new Set(["genesis", "registrations", "replay-attempts"]));
  await assertSafeEntries(
    dirname(layout.genesisArchive),
    new Set([basename(layout.genesisArchive)]),
  );
  const stagingEntries = await assertSafeEntries(
    layout.staging,
    /^(?:\d{12}-[A-Za-z0-9][A-Za-z0-9._:-]*|current-\d+\.json|genesis-(?:archive|current)\.json)$/u,
    M15_MAX_STAGING_ENTRIES,
  );
  for (const entry of stagingEntries) {
    const path = safeJoin(layout.staging, entry);
    if ((await lstat(path)).isDirectory()) {
      await assertDirectory(path);
      await assertSafeEntries(path, ALL_EVENT_COMPONENTS);
    }
  }
  await assertSafeEntries(
    layout.quarantine,
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
    M15_MAX_QUARANTINE_ENTRIES,
  );
  await assertSafeEntries(
    layout.derived,
    new Set(["HEAD.json", "indexes.json", ".HEAD.tmp", ".indexes.tmp"]),
  );
  let currentBytes: string;
  try {
    currentBytes = await safeRead(layout.currentMarker, limits.maxRecordBytes);
  } catch (error) {
    if (errno(error, "ENOENT")) {
      const rootEntryCount = await boundedDirectoryEntryCount(
        layout.root,
        M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES,
      ).catch(() => 1);
      throw publicFailure(
        rootEntryCount === 0 ? "ledger-uninitialized" : "genesis-initialization-incomplete",
      );
    }
    throw error;
  }
  let current: ReadinessCommitMarker;
  try {
    current = verifyReadinessCommitMarker(parseJson(currentBytes));
  } catch {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
  const genesisBytes = await safeRead(layout.genesisArchive, limits.maxRecordBytes).catch(() => {
    throw publicFailure("genesis-corrupt");
  });
  const genesis = createReadinessGenesisCommitment();
  if (genesisBytes !== serializeDurableCanonicalJsonValue(genesis.marker)) {
    throw publicFailure("genesis-corrupt");
  }
  const installed = [
    ...(await listEventDirectories(layout.registrations)),
    ...(await listEventDirectories(layout.replays)),
  ].sort((left, right) => basename(left).localeCompare(basename(right)));
  if (installed.length > limits.maxEntries) throw publicFailure("unsafe-filesystem-state");
  const events: Array<{
    sequence: number;
    value: ReadinessLedgerEvent;
    directory: string;
    markerBytes: string;
  }> = [];
  let totalBytes = Buffer.byteLength(currentBytes) + Buffer.byteLength(genesisBytes);
  let installedOrphanCount = 0;
  let installedOrphanEvent: ReadinessLedgerEvent | null = null;
  for (const directory of installed) {
    const directoryIdentity = await captureRootIdentity(directory);
    const parent = dirname(directory);
    const category = parent === layout.replays ? "replay" : "registration";
    const directorySequence = Number.parseInt(basename(directory).slice(0, 12), 10);
    if (directorySequence > current.lastCommittedLedgerSequence) {
      const names = await assertSafeEntries(directory, ALL_EVENT_COMPONENTS);
      installedOrphanCount += 1;
      const preAudit =
        category === "replay" ? REPLAY_PRE_AUDIT_COMPONENTS : REGISTRATION_PRE_AUDIT_COMPONENTS;
      const complete = category === "replay" ? REPLAY_COMPONENTS : REGISTRATION_COMPONENTS;
      const partial =
        sameNames(names, preAudit) || sameNames(names, [...preAudit, "audit-entry.json"]);
      const completeSnapshot = sameNames(names, complete);
      const stagingName = basename(directory);
      const fallbackDirectory = safeJoin(layout.staging, stagingName);
      const temporaryMarkerName = `current-${directorySequence}.json`;
      const hasTemporaryMarker =
        stagingEntries.length === 1 && stagingEntries[0] === temporaryMarkerName;
      if (
        installedOrphanCount > 1 ||
        directorySequence !== current.lastCommittedLedgerSequence + 1 ||
        (!partial && !completeSnapshot) ||
        (partial && (stagingEntries.length !== 1 || !stagingEntries.includes(stagingName))) ||
        (completeSnapshot && stagingEntries.length !== 0 && !hasTemporaryMarker)
      ) {
        throw publicFailure("readiness-ledger-integrity-failure");
      }
      if (partial) await assertDirectory(fallbackDirectory);
      const orphan = await readInstalledEvent(
        directory,
        category,
        limits,
        partial ? fallbackDirectory : undefined,
      );
      if (
        orphan.value.sequence !== directorySequence ||
        basename(directory) !==
          sequenceName(orphan.value.sequence, orphan.value.commitMarker.markerId)
      ) {
        throw publicFailure("readiness-ledger-integrity-failure");
      }
      if (
        hasTemporaryMarker &&
        (await safeRead(safeJoin(layout.staging, temporaryMarkerName), limits.maxRecordBytes)) !==
          orphan.markerBytes
      ) {
        throw publicFailure("readiness-ledger-integrity-failure");
      }
      installedOrphanEvent = orphan.value;
      totalBytes += orphan.totalBytes;
      if (totalBytes > limits.maxTotalBytes) throw publicFailure("unsafe-filesystem-state");
      await assertRootIdentity(directory, directoryIdentity);
      continue;
    }
    const event = await readInstalledEvent(directory, category, limits);
    totalBytes += event.totalBytes;
    if (totalBytes > limits.maxTotalBytes) throw publicFailure("unsafe-filesystem-state");
    const value = event.value;
    const expectedParent = value.category === "replay" ? layout.replays : layout.registrations;
    if (
      dirname(directory) !== expectedParent ||
      basename(directory) !== sequenceName(value.sequence, value.commitMarker.markerId)
    ) {
      throw publicFailure("readiness-ledger-integrity-failure");
    }
    await assertRootIdentity(directory, directoryIdentity);
    events.push({ sequence: value.sequence, value, directory, markerBytes: event.markerBytes });
  }
  events.sort((left, right) => left.sequence - right.sequence);
  const bounded = events.filter((entry) => entry.sequence <= current.lastCommittedLedgerSequence);
  const activeMarkerBytes =
    current.markerCategory === "genesis"
      ? genesisBytes
      : bounded.find(
          (entry) =>
            entry.sequence === current.lastCommittedLedgerSequence &&
            entry.value.commitMarker.markerId === current.markerId,
        )?.markerBytes;
  if (
    currentBytes !== serializeDurableCanonicalJsonValue(current) ||
    activeMarkerBytes === undefined ||
    currentBytes !== activeMarkerBytes
  ) {
    throw publicFailure("readiness-ledger-integrity-failure");
  }
  const installedUncommittedOrphanCount = installed.length - bounded.length;
  const state = replayReadinessLedger(
    current,
    bounded.map((entry) => entry.value),
  );
  if (installedOrphanEvent !== null) {
    replayReadinessLedger(installedOrphanEvent.commitMarker, [
      ...bounded.map((entry) => entry.value),
      installedOrphanEvent,
    ]);
  }
  const stagingOrphanCount = stagingEntries.length;
  let derivedIndexStatus: ReadinessLedgerStorageInspection["derivedIndexStatus"];
  try {
    const headBytes = await safeRead(layout.derivedHead, limits.maxRecordBytes);
    const indexBytes = await safeRead(layout.derivedIndexes, limits.maxRecordBytes);
    const indexes = ReadinessDerivedIndexCollectionSchema.parse(parseJson(indexBytes));
    const expected = createReadinessDerivedIndexes(state);
    derivedIndexStatus =
      headBytes === serializeDurableCanonicalJsonValue(state.head) &&
      serializeDurableCanonicalJsonValue(indexes) === serializeDurableCanonicalJsonValue(expected)
        ? "valid"
        : "invalid";
  } catch (error) {
    derivedIndexStatus = errno(error, "ENOENT") ? "missing" : "invalid";
  }
  if (expectedRootIdentity !== undefined) {
    await assertRootIdentity(layout.root, expectedRootIdentity);
  }
  if (expectedDirectoryIdentities !== undefined) {
    await assertLayoutDirectoryIdentities(expectedDirectoryIdentities);
  }
  return {
    state,
    authoritativeByteCount: totalBytes,
    derivedIndexStatus,
    stagingOrphanCount,
    installedUncommittedOrphanCount,
  };
}

async function publishDerived(
  layout: Layout,
  marker: ReadinessCommitMarker,
  indexes: readonly ReadinessDerivedIndex[],
  limits: LocalFileReadinessLedgerLimits,
  interruptDuringIndexPublication = false,
  failDuringIndexPublication = false,
): Promise<void> {
  const headBytes = serializeDurableCanonicalJsonValue(marker.resultingLedgerHead);
  const indexBytes = serializeDurableCanonicalJsonValue(
    ReadinessDerivedIndexCollectionSchema.parse(indexes),
  );
  if (
    Buffer.byteLength(headBytes) > limits.maxRecordBytes ||
    Buffer.byteLength(indexBytes) > limits.maxRecordBytes
  ) {
    throw publicFailure("unsafe-filesystem-state");
  }
  const headTemp = safeJoin(layout.derived, ".HEAD.tmp");
  const indexTemp = safeJoin(layout.derived, ".indexes.tmp");
  await syncWrite(headTemp, headBytes, false);
  await rename(headTemp, layout.derivedHead);
  await syncDirectory(layout.derived);
  await syncWrite(indexTemp, indexBytes, false);
  if (failDuringIndexPublication) throw publicFailure("derived-publication-failure");
  if (interruptDuringIndexPublication) return;
  await rename(indexTemp, layout.derivedIndexes);
  await syncDirectory(layout.derived);
}

class Writer implements ReadinessLedgerWriterPort {
  private markerInstalled = false;

  public constructor(
    public readonly inspection: ReadinessLedgerStorageInspection,
    private readonly layout: Layout,
    private readonly limits: LocalFileReadinessLedgerLimits,
    private readonly faults: TestingFaults,
    private readonly rootIdentity: DirectoryIdentity,
    private readonly directoryIdentities: LayoutDirectoryIdentities,
  ) {}

  public get authoritativeCommitInstalled(): boolean {
    return this.markerInstalled;
  }

  public async commitEvent(
    event: ReadinessLedgerEvent,
  ): Promise<ReadinessLedgerStorageInspection["derivedIndexStatus"]> {
    await assertRootIdentity(this.layout.root, this.rootIdentity);
    await assertLayoutDirectoryIdentities(this.directoryIdentities);
    const verified = ReadinessLedgerEventSchema.parse(event);
    if (
      verified.sequence !== this.inspection.state.head.lastCommittedLedgerSequence + 1 ||
      verified.auditEntry.previousLedgerHeadFingerprint !==
        this.inspection.state.head.ledgerHeadFingerprint
    ) {
      throw publicFailure("stale-expected-head");
    }
    if (
      this.inspection.installedUncommittedOrphanCount > 0 ||
      this.inspection.stagingOrphanCount > 0
    ) {
      throw publicFailure("operator-cleanup-required");
    }
    if (
      this.inspection.state.events.length + this.inspection.installedUncommittedOrphanCount >=
        this.limits.maxEntries ||
      this.inspection.stagingOrphanCount >= M15_MAX_STAGING_ENTRIES
    ) {
      throw publicFailure("unsafe-filesystem-state");
    }
    const isReplay = verified.category === "replay";
    if (this.faults.event === "after-head-before-ownership") throw publicFailure("append-failure");
    const stagingDirectory = safeJoin(
      this.layout.staging,
      sequenceName(verified.sequence, verified.commitMarker.markerId),
    );
    const components = eventComponentValues(verified);
    const markerBytes = serializeDurableCanonicalJsonValue(verified.commitMarker);
    const componentBytes = [...components].map(
      ([name, value]) => [name, serializeDurableCanonicalJsonValue(value)] as const,
    );
    const prospectiveAuthoritativeBytes =
      this.inspection.authoritativeByteCount -
      Buffer.byteLength(serializeDurableCanonicalJsonValue(this.inspection.state.marker)) +
      Buffer.byteLength(markerBytes) +
      componentBytes.reduce((total, [, bytes]) => total + Buffer.byteLength(bytes), 0);
    if (
      prospectiveAuthoritativeBytes > this.limits.maxTotalBytes ||
      componentBytes.some(([, bytes]) => Buffer.byteLength(bytes) > this.limits.maxRecordBytes)
    ) {
      throw publicFailure("unsafe-filesystem-state");
    }
    await mkdir(stagingDirectory, { mode: 0o700 });
    for (const [name, bytes] of componentBytes) {
      await syncWrite(safeJoin(stagingDirectory, name), bytes, true);
    }
    await syncDirectory(stagingDirectory);
    await assertLayoutDirectoryIdentities(this.directoryIdentities);
    if (
      this.faults.event === "after-ownership-staging" ||
      (isReplay && this.faults.event === "during-replay-staging")
    ) {
      throw publicFailure("append-failure");
    }
    const targetParent = isReplay ? this.layout.replays : this.layout.registrations;
    const target = safeJoin(
      targetParent,
      sequenceName(verified.sequence, verified.commitMarker.markerId),
    );
    await assertRootIdentity(this.layout.root, this.rootIdentity);
    await assertDirectory(targetParent);
    const preAuditNames = isReplay
      ? REPLAY_PRE_AUDIT_COMPONENTS
      : REGISTRATION_PRE_AUDIT_COMPONENTS;
    const installFaultSnapshot = async (names: readonly string[]): Promise<void> => {
      const snapshot = `${stagingDirectory}-install`;
      await mkdir(snapshot, { mode: 0o700 });
      for (const name of names) {
        await rename(safeJoin(stagingDirectory, name), safeJoin(snapshot, name));
      }
      await syncDirectory(snapshot);
      await rename(snapshot, target);
      await syncDirectory(targetParent);
    };
    if (this.faults.event === "after-transaction-install") {
      await installFaultSnapshot(preAuditNames);
      throw publicFailure("append-failure");
    }
    if (isReplay && this.faults.event === "after-replay-install") {
      await installFaultSnapshot(preAuditNames);
      throw publicFailure("append-failure");
    }
    if (this.faults.event === "after-audit-install") {
      await installFaultSnapshot([...preAuditNames, "audit-entry.json"]);
      throw publicFailure("append-failure");
    }
    await rename(stagingDirectory, target);
    await syncDirectory(targetParent);
    const currentTemp = safeJoin(this.layout.staging, `current-${verified.sequence}.json`);
    await syncWrite(currentTemp, markerBytes, true);
    if (this.faults.event === "during-marker-write") throw publicFailure("append-failure");
    await assertRootIdentity(this.layout.root, this.rootIdentity);
    await rename(currentTemp, this.layout.currentMarker);
    this.markerInstalled = true;
    try {
      await syncDirectory(this.layout.root);
      await assertLayoutDirectoryIdentities(this.directoryIdentities);
      if (this.faults.event === "after-current-marker-install") return "invalid";
      if (this.faults.event === "before-derived-head") return "invalid";
      const nextState = replayReadinessLedger(verified.commitMarker, [
        ...this.inspection.state.events,
        verified,
      ]);
      await publishDerived(
        this.layout,
        verified.commitMarker,
        createReadinessDerivedIndexes(nextState),
        this.limits,
        (isReplay && this.faults.event === "after-replay-marker-before-index") ||
          this.faults.event === "during-derived-index",
        this.faults.event === "derived-publication-write-failure",
      );
      await assertLayoutDirectoryIdentities(this.directoryIdentities);
      return (isReplay && this.faults.event === "after-replay-marker-before-index") ||
        this.faults.event === "during-derived-index"
        ? "invalid"
        : "valid";
    } catch {
      // The authoritative commit marker is already installed. Any derived-state
      // failure is repairable and must never be reported as a rejected append.
      return "invalid";
    }
  }

  public async replaceDerivedState(
    marker: ReadinessCommitMarker,
    indexes: readonly ReadinessDerivedIndex[],
  ): Promise<void> {
    await assertRootIdentity(this.layout.root, this.rootIdentity);
    await assertLayoutDirectoryIdentities(this.directoryIdentities);
    if (marker.commitMarkerFingerprint !== this.inspection.state.marker.commitMarkerFingerprint) {
      throw publicFailure("stale-expected-head");
    }
    await publishDerived(this.layout, marker, indexes, this.limits);
    await assertLayoutDirectoryIdentities(this.directoryIdentities);
  }
}

class LocalFileReadinessLedgerStorage implements ReadinessLedgerStoragePort {
  public constructor(
    private readonly layout: Layout,
    private readonly limits: LocalFileReadinessLedgerLimits,
    private readonly faults: TestingFaults,
    private readonly rootIdentity: DirectoryIdentity,
    private readonly directoryIdentities: LayoutDirectoryIdentities,
  ) {}

  public async inspect(): Promise<ReadinessLedgerStorageInspection> {
    try {
      return await readInspection(
        this.layout,
        this.limits,
        this.rootIdentity,
        this.directoryIdentities,
      );
    } catch (error) {
      if (error instanceof DurableReadinessLedgerError) throw error;
      throw publicFailure("readiness-ledger-integrity-failure");
    }
  }

  public async withWriter<T>(
    operation: (writer: ReadinessLedgerWriterPort) => Promise<T>,
  ): Promise<T> {
    try {
      if (this.faults.event === "stale-lock-on-write") {
        await syncWrite(
          this.layout.lock,
          canonicalLockBytes(canonicalLockRecord("writer", 999_999, "2000-01-01T00:00:00.000Z")),
          true,
        );
        throw publicFailure("operator-cleanup-required");
      }
      if (
        this.faults.event === "before-staging" ||
        this.faults.event === "attempted-staging-before-lock" ||
        this.faults.event === "before-lock-acquisition"
      ) {
        throw publicFailure("append-failure");
      }
      const lock = await CooperativeWriterLock.acquire(this.layout.lock);
      let preserveLock = false;
      let writer: Writer | null = null;
      try {
        if (this.faults.event === "after-lock-before-integrity")
          throw publicFailure("append-failure");
        const inspection = await readInspection(
          this.layout,
          this.limits,
          this.rootIdentity,
          this.directoryIdentities,
        );
        if (this.faults.event === "after-integrity-before-head")
          throw publicFailure("append-failure");
        writer = new Writer(
          inspection,
          this.layout,
          this.limits,
          this.faults,
          this.rootIdentity,
          this.directoryIdentities,
        );
        const result = await operation(writer);
        if (
          this.faults.event === "before-lock-release" ||
          this.faults.event === "interruption-with-lock"
        ) {
          preserveLock = true;
          return result;
        }
        return result;
      } finally {
        if (!preserveLock) {
          if (writer?.authoritativeCommitInstalled === true) {
            await lock.release().catch(() => undefined);
          } else {
            await lock.release();
          }
        }
      }
    } catch (error) {
      if (error instanceof DurableReadinessLedgerError) throw error;
      throw publicFailure("readiness-ledger-integrity-failure");
    }
  }
}

async function openStorage(
  raw: unknown,
  faults: TestingFaults,
): Promise<ReadinessLedgerStoragePort> {
  const { layout, limits, createIfMissing } = await safeLayout(raw);
  let rootExists = true;
  try {
    const rootInfo = await lstat(layout.root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
      throw publicFailure("unsafe-filesystem-state");
  } catch (error) {
    if (!errno(error, "ENOENT")) throw error;
    rootExists = false;
  }
  if (!rootExists && !createIfMissing) throw publicFailure("ledger-uninitialized");
  if (createIfMissing) {
    let currentMarkerExists = false;
    try {
      const markerInfo = await lstat(layout.currentMarker);
      if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) {
        throw publicFailure("unsafe-filesystem-state");
      }
      currentMarkerExists = true;
    } catch (error) {
      if (!errno(error, "ENOENT")) throw error;
    }
    if (!currentMarkerExists) {
      await initializeGenesis(layout, limits, faults);
    }
  } else if (!rootExists) {
    throw publicFailure("ledger-uninitialized");
  }
  await rejectSymlinkComponents(layout.root);
  try {
    await readInspection(layout, limits);
  } catch (error) {
    if (
      createIfMissing &&
      error instanceof DurableReadinessLedgerError &&
      error.code === "genesis-initialization-incomplete"
    ) {
      await initializeGenesis(layout, limits, faults);
      await readInspection(layout, limits);
    } else {
      throw error;
    }
  }
  const rootIdentity = await captureRootIdentity(layout.root);
  const directoryIdentities = await captureLayoutDirectoryIdentities(layout);
  await readInspection(layout, limits, rootIdentity, directoryIdentities);
  return new LocalFileReadinessLedgerStorage(
    layout,
    limits,
    faults,
    rootIdentity,
    directoryIdentities,
  );
}

export async function openLocalFileReadinessLedgerStorage(
  options: LocalFileReadinessLedgerOptions,
): Promise<ReadinessLedgerStoragePort> {
  try {
    return await openStorage(options, {});
  } catch (error) {
    if (error instanceof DurableReadinessLedgerError) throw error;
    throw publicFailure("readiness-ledger-integrity-failure");
  }
}

export async function openLocalFileReadinessEvaluationLedger(
  options: LocalFileReadinessLedgerOptions,
): Promise<LocalFileReadinessEvaluationLedger> {
  const { layout, limits } = await safeLayout(options);
  const governed = createGovernedReadinessEvaluationLedger(
    await openLocalFileReadinessLedgerStorage(options),
  );
  return Object.freeze({
    verifyIntegrity: () => governed.verifyIntegrity(),
    recover: () => governed.recover(),
    readOriginalReadinessEvaluation: (transactionId: string) =>
      governed.readOriginalReadinessEvaluation(transactionId),
    listCommittedReadinessEvaluations: (
      query?: Parameters<typeof governed.listCommittedReadinessEvaluations>[0],
    ) => governed.listCommittedReadinessEvaluations(query),
    listReadinessReplayAttempts: (
      transactionId: string,
      query?: Parameters<typeof governed.listReadinessReplayAttempts>[1],
    ) => governed.listReadinessReplayAttempts(transactionId, query),
    readHead: () => governed.readHead(),
    rebuildDerivedIndexes: () => governed.rebuildDerivedIndexes(),
    registerVerifiedReadinessEvaluation: (
      input: Parameters<typeof governed.registerVerifiedReadinessEvaluation>[0],
    ) => governed.registerVerifiedReadinessEvaluation(input),
    submitReadinessReplayAttempt: (
      input: Parameters<typeof governed.submitReadinessReplayAttempt>[0],
    ) => governed.submitReadinessReplayAttempt(input),
    inspectWriterLock: () => inspectWriterLockAt(layout),
    cleanupInactiveWriterLock: (request: LocalFileReadinessWriterLockCleanupRequest) =>
      cleanupWriterLockAt(layout, limits, request),
  });
}

/** Direct-module deterministic fault seam; intentionally absent from the package facade. */
export async function openLocalFileReadinessLedgerStorageForTesting(
  options: LocalFileReadinessLedgerOptions,
  faults: TestingFaults,
): Promise<ReadinessLedgerStoragePort> {
  try {
    return await openStorage(options, faults);
  } catch (error) {
    if (error instanceof DurableReadinessLedgerError) throw error;
    throw publicFailure("readiness-ledger-integrity-failure");
  }
}

/** Removes only the cooperative lock after the operator has independently proved no writer active. */
export async function cleanupInactiveReadinessLedgerWriterLockForTesting(
  options: LocalFileReadinessLedgerOptions,
  evidence: { readonly writerActive: false },
): Promise<void> {
  if (
    evidence === null ||
    typeof evidence !== "object" ||
    Object.getPrototypeOf(evidence) !== Object.prototype ||
    Reflect.ownKeys(evidence).length !== 1 ||
    evidence.writerActive !== false
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  const { layout, limits } = await safeLayout(options);
  const inspection = await inspectWriterLockAt(layout);
  if (
    inspection.status !== "inactive" ||
    inspection.lockFingerprint === null ||
    inspection.writerProcessId === null
  ) {
    throw publicFailure("operator-cleanup-required");
  }
  await cleanupWriterLockAt(layout, limits, {
    requestContractVersion: "1.0",
    lockFingerprint: inspection.lockFingerprint,
    writerProcessId: inspection.writerProcessId,
    writerActive: false,
  });
}

/** Direct-module traversal-bound seam; intentionally absent from the package facade. */
export function countReadinessFilesystemEntriesForTesting(path: string): Promise<number> {
  return boundedDirectoryEntryCount(path, M15_MAX_DISCOVERED_FILESYSTEM_ENTRIES);
}
