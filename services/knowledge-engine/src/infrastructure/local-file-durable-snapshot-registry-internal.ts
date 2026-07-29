import { randomUUID } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { dirname, isAbsolute, parse as parsePath, relative, resolve, sep } from "node:path";

import {
  DerivedRegistryIndexResultSchema,
  DerivedRegistryIndexSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type CommittedRegistryTransactionEnvelope,
  type DerivedRegistryIndex,
  type DerivedRegistryIndexResult,
  type DurablePreviousRecordFingerprint,
  type RegistryIntegrityIssue,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import { createCanonicalSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import {
  DurableRegistryConflictError,
  DurableRegistryIntegrityError,
  DurableRegistryValidationError,
  type DurableRegistryReplayProgress,
  type DurableRegistryReplayResult,
  areCommittedRegistryTransactionsIdempotent,
  recoverCommittedRegistry,
  replayCommittedRegistryTransactions,
  serializeCanonicalDurablePayload,
  verifyCommittedRegistryIntegrity,
  verifyCommittedRegistryTransactionEnvelopeFingerprint,
} from "../domain/durable-registry.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type {
  GovernedDurableSnapshotRegistryStoragePort,
  GovernedDurableSnapshotRegistryWriterPort,
} from "../application/governed-durable-snapshot-registry-port.js";

const COMMIT_MARKER_FILE = "commit-head.json";
const ACTIVE_INDEX_FILE = "active-index.json";
const WRITER_LOCK_FILE = "writer.lock";
const ENVELOPE_FILE_PATTERN = /^(\d{16})-(\d{16})-([a-f0-9]{64})\.json$/u;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_TREE_SEGMENTS = new Set(["docs", "knowledge"]);
const MAX_CANONICAL_SOURCE_DISCOVERY_DEPTH = 64;
const MAX_CANONICAL_SOURCE_DISCOVERY_DIRECTORIES = 10_000;
const MAX_CANONICAL_SOURCE_DISCOVERY_ENTRIES = 250_000;
const PLACEHOLDER_FINGERPRINT = "0".repeat(64);

export interface LocalFileRegistryOptions {
  readonly allowedParentRoot: string;
  readonly canonicalSourceRoots?: readonly string[];
  readonly runtimeRoot: string;
}

export interface LocalFileRegistryLayout {
  readonly activeIndexPath: string;
  readonly committedRoot: string;
  readonly commitMarkerPath: string;
  readonly derivedRoot: string;
  readonly locksRoot: string;
  readonly runtimeRoot: string;
  readonly stagingRoot: string;
  readonly writerLockPath: string;
}

export type LocalFileRegistryFaultPoint =
  | "after_envelope_staged"
  | "after_envelope_installed_before_commit_marker"
  | "after_commit_marker_installed";

export interface LocalFileRegistryFaultHooks {
  readonly onDirectorySync?: (directoryPath: string) => Promise<void> | void;
  readonly onFaultPoint?: (point: LocalFileRegistryFaultPoint) => Promise<void> | void;
  readonly onBeforeWriterLock?: () => Promise<void> | void;
}

export interface LocalFileRegistryReadFaultHooks {
  readonly onBeforeFileRead?: (
    kind: "commit_marker" | "derived_index" | "envelope",
    logicalName: string,
  ) => Promise<void> | void;
  readonly onBeforeDerivedIndexWrite?: () => Promise<void> | void;
}

interface RegistryCommitMarker {
  readonly schemaVersion: "1.0";
  readonly markerType: "registry_commit_head";
  readonly committedTransactionCount: number;
  readonly committedRecordCount: number;
  readonly lastCommittedAuditSequence: number;
  readonly lastRecordFingerprint: DurablePreviousRecordFingerprint;
  readonly integrityFingerprint: string;
  readonly lastEnvelopeFileName: string | null;
  readonly lastEnvelopeFingerprint: string | null;
  readonly markerFingerprint: string;
}

interface ParsedEnvelopeFileName {
  readonly fileName: string;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly envelopeFingerprint: string;
}

type CriticalDirectoryName =
  "allowedParent" | "committed" | "derived" | "locks" | "runtime" | "staging";

interface PhysicalDirectoryIdentity {
  readonly device: number;
  readonly inode: number;
  readonly path: string;
  readonly realPath: string;
}

type CriticalDirectoryIdentities = Readonly<
  Record<CriticalDirectoryName, PhysicalDirectoryIdentity>
>;

export interface VerifiedLocalFileRegistryState {
  readonly commitMarker: RegistryCommitMarker;
  readonly envelopes: readonly CommittedRegistryTransactionEnvelope[];
  readonly replay: DurableRegistryReplayResult;
}

export interface LocalFileRegistryWriterSession extends GovernedDurableSnapshotRegistryWriterPort {
  appendCommittedEnvelope(
    input: CommittedRegistryTransactionEnvelope,
    hooks?: LocalFileRegistryFaultHooks,
  ): Promise<CommittedRegistryTransactionEnvelope>;
  readVerifiedState(): Promise<VerifiedLocalFileRegistryState>;
}

export class LocalFileRegistryPathError extends DurableRegistryValidationError {
  public constructor(code: string, message: string) {
    super(code, message);
  }
}

export class LocalFileRegistryConflictError extends DurableRegistryConflictError {
  public constructor(code: string, message: string) {
    super(code, message);
  }
}

export class LocalFileRegistryWriterLockError extends LocalFileRegistryConflictError {
  public constructor(message: string) {
    super("writer_lock_held", message);
  }
}

export function localFileRegistryLayout(runtimeRoot: string): LocalFileRegistryLayout {
  const committedRoot = resolve(runtimeRoot, "committed");
  const derivedRoot = resolve(runtimeRoot, "derived");
  const locksRoot = resolve(runtimeRoot, "locks");
  const stagingRoot = resolve(runtimeRoot, "staging");
  return {
    activeIndexPath: resolve(derivedRoot, ACTIVE_INDEX_FILE),
    committedRoot,
    commitMarkerPath: resolve(runtimeRoot, COMMIT_MARKER_FILE),
    derivedRoot,
    locksRoot,
    runtimeRoot,
    stagingRoot,
    writerLockPath: resolve(locksRoot, WRITER_LOCK_FILE),
  };
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}

function pathHasTraversal(inputPath: string): boolean {
  const pathRoot = parsePath(inputPath).root;
  return inputPath
    .slice(pathRoot.length)
    .split(sep)
    .some((segment) => segment === "." || segment === "..");
}

function pathHasCanonicalSourceSegment(inputPath: string): boolean {
  const pathRoot = parsePath(inputPath).root;
  return inputPath
    .slice(pathRoot.length)
    .split(sep)
    .some((segment) => SOURCE_TREE_SEGMENTS.has(segment.toLowerCase()));
}

function assertAbsoluteSafeInputs(options: LocalFileRegistryOptions): {
  allowedParentRoot: string;
  runtimeRoot: string;
} {
  if (!isAbsolute(options.allowedParentRoot)) {
    throw new LocalFileRegistryPathError(
      "allowed_parent_not_absolute",
      "The allowed parent root must be an explicit absolute path",
    );
  }
  if (!isAbsolute(options.runtimeRoot)) {
    throw new LocalFileRegistryPathError(
      "runtime_root_not_absolute",
      "The registry runtime root must be an explicit absolute path",
    );
  }
  if (pathHasTraversal(options.allowedParentRoot)) {
    throw new LocalFileRegistryPathError(
      "allowed_parent_path_traversal",
      "The allowed parent root cannot contain lexical traversal segments",
    );
  }
  if (pathHasTraversal(options.runtimeRoot)) {
    throw new LocalFileRegistryPathError(
      "runtime_path_traversal",
      "The registry runtime root cannot contain lexical traversal segments",
    );
  }

  const allowedParentRoot = resolve(options.allowedParentRoot);
  const runtimeRoot = resolve(options.runtimeRoot);
  const relativeRuntime = relative(allowedParentRoot, runtimeRoot);
  if (
    relativeRuntime === "" ||
    isAbsolute(relativeRuntime) ||
    relativeRuntime === ".." ||
    relativeRuntime.startsWith(`..${sep}`)
  ) {
    throw new LocalFileRegistryPathError(
      "runtime_outside_allowed_parent",
      "The registry runtime root must be a strict descendant of the allowed parent root",
    );
  }

  if (pathHasCanonicalSourceSegment(runtimeRoot)) {
    throw new LocalFileRegistryPathError(
      "canonical_source_target",
      "The registry runtime root cannot be located inside canonical docs or knowledge trees",
    );
  }
  for (const sourceRoot of options.canonicalSourceRoots ?? []) {
    if (!isAbsolute(sourceRoot)) {
      throw new LocalFileRegistryPathError(
        "canonical_source_root_not_absolute",
        "Configured canonical source roots must be explicit absolute paths",
      );
    }
    if (pathHasTraversal(sourceRoot)) {
      throw new LocalFileRegistryPathError(
        "canonical_source_root_path_traversal",
        "Configured canonical source roots cannot contain lexical traversal segments",
      );
    }
  }
  return { allowedParentRoot, runtimeRoot };
}

async function requirePhysicalDirectory(directoryPath: string, label: string): Promise<void> {
  let status;
  try {
    status = await lstat(directoryPath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      throw new LocalFileRegistryPathError(
        "missing_allowed_parent",
        `${label} does not exist: ${directoryPath}`,
      );
    }
    throw error;
  }
  if (status.isSymbolicLink()) {
    throw new LocalFileRegistryPathError(
      "symbolic_link_not_allowed",
      `${label} cannot be a symbolic link: ${directoryPath}`,
    );
  }
  if (!status.isDirectory()) {
    throw new LocalFileRegistryPathError(
      "runtime_component_not_directory",
      `${label} must be a physical directory: ${directoryPath}`,
    );
  }
}

async function ensureDirectoryBelow(
  allowedPhysicalRoot: string,
  directoryPath: string,
  label: string,
): Promise<void> {
  try {
    await mkdir(directoryPath, { mode: 0o700 });
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
  }
  await requirePhysicalDirectory(directoryPath, label);
  const physicalPath = await realpath(directoryPath);
  if (!isInside(allowedPhysicalRoot, physicalPath)) {
    throw new LocalFileRegistryPathError(
      "physical_path_escape",
      `${label} resolves outside the allowed physical root: ${directoryPath}`,
    );
  }
}

async function physicalDirectoryIfPresent(directoryPath: string): Promise<string | null> {
  try {
    const physicalPath = await realpath(directoryPath);
    const status = await lstat(physicalPath);
    return status.isDirectory() && !status.isSymbolicLink() ? physicalPath : null;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function resolveCanonicalSourceRoots(
  allowedPhysicalRoot: string,
  configuredRoots: readonly string[],
): Promise<readonly string[]> {
  const roots = new Set<string>();
  for (const configuredRoot of configuredRoots) {
    const physicalRoot = await physicalDirectoryIfPresent(resolve(configuredRoot));
    if (physicalRoot === null) {
      throw new LocalFileRegistryPathError(
        "canonical_source_root_not_directory",
        `Configured canonical source root must resolve to a physical directory: ${configuredRoot}`,
      );
    }
    roots.add(physicalRoot);
  }

  // When the allowed parent is at or below a repository, discover the canonical
  // sibling trees by walking physical ancestors. Explicit roots remain supported
  // for deployments whose repository layout cannot be inferred this way.
  let ancestor = allowedPhysicalRoot;
  while (true) {
    for (const sourceName of SOURCE_TREE_SEGMENTS) {
      const physicalRoot = await physicalDirectoryIfPresent(resolve(ancestor, sourceName));
      if (physicalRoot !== null) roots.add(physicalRoot);
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return [...roots].sort();
}

async function discoverCanonicalSourceRootsBelow(
  plannedRuntimePhysicalRoot: string,
): Promise<readonly string[]> {
  let rootStatus;
  try {
    rootStatus = await lstat(plannedRuntimePhysicalRoot);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw new LocalFileRegistryPathError(
      "canonical_source_discovery_failed",
      "Canonical source discovery could not inspect the existing runtime root",
    );
  }
  if (rootStatus.isSymbolicLink()) {
    throw new LocalFileRegistryPathError(
      "symbolic_link_not_allowed",
      "Canonical source discovery does not traverse symbolic links",
    );
  }
  if (!rootStatus.isDirectory()) {
    throw new LocalFileRegistryPathError(
      "runtime_component_not_directory",
      "The existing registry runtime root must be a physical directory",
    );
  }

  let existingRuntimeRoot: string;
  try {
    existingRuntimeRoot = await realpath(plannedRuntimePhysicalRoot);
  } catch {
    throw new LocalFileRegistryPathError(
      "canonical_source_discovery_failed",
      "Canonical source discovery could not resolve the existing runtime root",
    );
  }
  if (existingRuntimeRoot !== plannedRuntimePhysicalRoot) {
    throw new LocalFileRegistryPathError(
      "symbolic_link_not_allowed",
      "Canonical source discovery does not traverse symbolic-link aliases",
    );
  }

  const pending: Array<{ readonly depth: number; readonly path: string }> = [
    { depth: 0, path: existingRuntimeRoot },
  ];
  const roots: string[] = [];
  let inspectedDirectories = 0;
  let inspectedEntries = 0;
  let nextDirectoryIndex = 0;

  while (nextDirectoryIndex < pending.length) {
    const current = pending[nextDirectoryIndex];
    nextDirectoryIndex += 1;
    if (current === undefined) {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_failed",
        "Canonical source discovery encountered an invalid traversal state",
      );
    }
    inspectedDirectories += 1;
    if (inspectedDirectories > MAX_CANONICAL_SOURCE_DISCOVERY_DIRECTORIES) {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_limit",
        "Canonical source discovery exceeded its directory safety limit",
      );
    }

    let beforeStatus;
    let currentPhysicalPath: string;
    try {
      beforeStatus = await lstat(current.path);
      if (beforeStatus.isSymbolicLink() || !beforeStatus.isDirectory()) {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_unsafe_entry",
          "Canonical source discovery encountered an unsafe directory entry",
        );
      }
      currentPhysicalPath = await realpath(current.path);
    } catch (error) {
      if (error instanceof LocalFileRegistryPathError) throw error;
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_failed",
        "Canonical source discovery could not inspect a runtime directory",
      );
    }
    if (
      currentPhysicalPath !== current.path ||
      !isInside(existingRuntimeRoot, currentPhysicalPath)
    ) {
      throw new LocalFileRegistryPathError(
        "symbolic_link_not_allowed",
        "Canonical source discovery does not traverse symbolic-link aliases",
      );
    }

    let entries;
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_failed",
        "Canonical source discovery could not read a runtime directory",
      );
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    inspectedEntries += entries.length;
    if (inspectedEntries > MAX_CANONICAL_SOURCE_DISCOVERY_ENTRIES) {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_limit",
        "Canonical source discovery exceeded its entry safety limit",
      );
    }

    for (const entry of entries) {
      const entryPath = resolve(current.path, entry.name);
      let entryStatus;
      try {
        entryStatus = await lstat(entryPath);
      } catch {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_failed",
          "Canonical source discovery could not inspect a runtime entry",
        );
      }
      if (entryStatus.isSymbolicLink()) {
        throw new LocalFileRegistryPathError(
          "symbolic_link_not_allowed",
          "Canonical source discovery does not traverse symbolic links",
        );
      }
      if (entryStatus.isFile()) continue;
      if (!entryStatus.isDirectory()) {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_unsafe_entry",
          "Canonical source discovery encountered an unsafe runtime entry",
        );
      }

      let physicalEntryPath: string;
      try {
        physicalEntryPath = await realpath(entryPath);
      } catch {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_failed",
          "Canonical source discovery could not resolve a runtime directory",
        );
      }
      if (physicalEntryPath !== entryPath || !isInside(existingRuntimeRoot, physicalEntryPath)) {
        throw new LocalFileRegistryPathError(
          "symbolic_link_not_allowed",
          "Canonical source discovery does not traverse symbolic-link aliases",
        );
      }
      let stableEntryStatus;
      try {
        stableEntryStatus = await lstat(entryPath);
      } catch {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_failed",
          "A runtime entry changed during canonical source discovery",
        );
      }
      if (
        stableEntryStatus.isSymbolicLink() ||
        !stableEntryStatus.isDirectory() ||
        stableEntryStatus.dev !== entryStatus.dev ||
        stableEntryStatus.ino !== entryStatus.ino
      ) {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_unsafe_entry",
          "A runtime entry changed during canonical source discovery",
        );
      }

      if (SOURCE_TREE_SEGMENTS.has(entry.name.toLowerCase())) {
        roots.push(physicalEntryPath);
        continue;
      }
      if (current.depth >= MAX_CANONICAL_SOURCE_DISCOVERY_DEPTH) {
        throw new LocalFileRegistryPathError(
          "canonical_source_discovery_limit",
          "Canonical source discovery exceeded its depth safety limit",
        );
      }
      pending.push({ depth: current.depth + 1, path: physicalEntryPath });
    }

    let afterStatus;
    let afterPhysicalPath: string;
    try {
      [afterStatus, afterPhysicalPath] = await Promise.all([
        lstat(current.path),
        realpath(current.path),
      ]);
    } catch {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_failed",
        "A runtime directory changed during canonical source discovery",
      );
    }
    if (
      afterStatus.isSymbolicLink() ||
      !afterStatus.isDirectory() ||
      afterStatus.dev !== beforeStatus.dev ||
      afterStatus.ino !== beforeStatus.ino ||
      afterPhysicalPath !== currentPhysicalPath
    ) {
      throw new LocalFileRegistryPathError(
        "canonical_source_discovery_unsafe_entry",
        "A runtime directory changed during canonical source discovery",
      );
    }
  }
  return roots.sort();
}

function assertOutsideCanonicalSourceRoots(
  physicalPath: string,
  canonicalSourceRoots: readonly string[],
  label: string,
  rejectSourceDescendants = false,
): void {
  if (
    pathHasCanonicalSourceSegment(physicalPath) ||
    canonicalSourceRoots.some(
      (sourceRoot) =>
        isInside(sourceRoot, physicalPath) ||
        (rejectSourceDescendants && isInside(physicalPath, sourceRoot)),
    )
  ) {
    throw new LocalFileRegistryPathError(
      "canonical_source_target",
      `${label} overlaps a canonical docs or knowledge tree`,
    );
  }
}

async function captureDirectoryIdentity(directoryPath: string): Promise<PhysicalDirectoryIdentity> {
  await requirePhysicalDirectory(directoryPath, "Registry critical directory");
  const [status, physicalPath] = await Promise.all([lstat(directoryPath), realpath(directoryPath)]);
  return {
    device: status.dev,
    inode: status.ino,
    path: directoryPath,
    realPath: physicalPath,
  };
}

async function assertDirectoryIdentity(identity: PhysicalDirectoryIdentity): Promise<void> {
  let status;
  let physicalPath: string;
  try {
    [status, physicalPath] = await Promise.all([lstat(identity.path), realpath(identity.path)]);
  } catch (error) {
    throw new LocalFileRegistryPathError(
      "runtime_directory_identity_changed",
      `Critical registry directory became unavailable or changed: ${identity.path}; ${
        error instanceof Error ? error.message : "unknown filesystem error"
      }`,
    );
  }
  if (
    status.isSymbolicLink() ||
    !status.isDirectory() ||
    status.dev !== identity.device ||
    status.ino !== identity.inode ||
    physicalPath !== identity.realPath
  ) {
    throw new LocalFileRegistryPathError(
      "runtime_directory_identity_changed",
      `Critical registry directory identity changed after open: ${identity.path}`,
    );
  }
}

function assertAtomicLayoutUsesOneDevice(identities: CriticalDirectoryIdentities): void {
  const devices = new Set(
    [
      identities.runtime,
      identities.committed,
      identities.staging,
      identities.derived,
      identities.locks,
    ].map((identity) => identity.device),
  );
  if (devices.size !== 1) {
    throw new LocalFileRegistryPathError(
      "runtime_cross_device",
      "Registry runtime, staging, committed, derived, and lock directories must share one device",
    );
  }
}

async function createSafeRuntimeLayout(options: LocalFileRegistryOptions): Promise<{
  allowedPhysicalRoot: string;
  canonicalSourceRoots: readonly string[];
  identities: CriticalDirectoryIdentities;
  layout: LocalFileRegistryLayout;
}> {
  const normalized = assertAbsoluteSafeInputs(options);
  await requirePhysicalDirectory(normalized.allowedParentRoot, "Allowed parent root");
  const allowedPhysicalRoot = await realpath(normalized.allowedParentRoot);
  const relativeRuntime = relative(normalized.allowedParentRoot, normalized.runtimeRoot);
  const plannedRuntimePhysicalRoot = resolve(allowedPhysicalRoot, relativeRuntime);
  const canonicalSourceRoots = [
    ...new Set([
      ...(await resolveCanonicalSourceRoots(
        allowedPhysicalRoot,
        options.canonicalSourceRoots ?? [],
      )),
      ...(await discoverCanonicalSourceRootsBelow(plannedRuntimePhysicalRoot)),
    ]),
  ].sort();
  assertOutsideCanonicalSourceRoots(
    allowedPhysicalRoot,
    canonicalSourceRoots,
    "Allowed parent root",
  );
  assertOutsideCanonicalSourceRoots(
    plannedRuntimePhysicalRoot,
    canonicalSourceRoots,
    "Registry runtime root",
    true,
  );

  let currentPath = normalized.allowedParentRoot;
  for (const segment of relativeRuntime.split(sep)) {
    currentPath = resolve(currentPath, segment);
    await ensureDirectoryBelow(allowedPhysicalRoot, currentPath, "Registry runtime component");
  }

  const layout = localFileRegistryLayout(normalized.runtimeRoot);
  for (const directoryPath of [
    layout.committedRoot,
    layout.stagingRoot,
    layout.derivedRoot,
    layout.locksRoot,
  ]) {
    await ensureDirectoryBelow(allowedPhysicalRoot, directoryPath, "Registry managed directory");
  }
  const runtimePhysicalRoot = await realpath(layout.runtimeRoot);
  assertOutsideCanonicalSourceRoots(
    runtimePhysicalRoot,
    canonicalSourceRoots,
    "Registry runtime root",
    true,
  );
  const identities: CriticalDirectoryIdentities = {
    allowedParent: await captureDirectoryIdentity(normalized.allowedParentRoot),
    committed: await captureDirectoryIdentity(layout.committedRoot),
    derived: await captureDirectoryIdentity(layout.derivedRoot),
    locks: await captureDirectoryIdentity(layout.locksRoot),
    runtime: await captureDirectoryIdentity(layout.runtimeRoot),
    staging: await captureDirectoryIdentity(layout.stagingRoot),
  };
  assertAtomicLayoutUsesOneDevice(identities);
  return {
    allowedPhysicalRoot,
    canonicalSourceRoots,
    identities,
    layout,
  };
}

async function assertNoDescendantSymbolicLinks(directoryPath: string): Promise<void> {
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new LocalFileRegistryPathError(
        "symbolic_link_not_allowed",
        `Registry runtime descendants cannot be symbolic links: ${entryPath}`,
      );
    }
    if (entry.isDirectory()) {
      await assertNoDescendantSymbolicLinks(entryPath);
    } else if (!entry.isFile()) {
      throw new LocalFileRegistryPathError(
        "unsupported_runtime_entry",
        `Registry runtime descendants must be physical files or directories: ${entryPath}`,
      );
    }
  }
}

async function assertSafeRuntimeTree(
  allowedPhysicalRoot: string,
  layout: LocalFileRegistryLayout,
): Promise<void> {
  await requirePhysicalDirectory(layout.runtimeRoot, "Registry runtime root");
  const physicalRoot = await realpath(layout.runtimeRoot);
  if (!isInside(allowedPhysicalRoot, physicalRoot)) {
    throw new LocalFileRegistryPathError(
      "physical_path_escape",
      "The registry runtime root resolves outside its allowed physical parent",
    );
  }
  await assertNoDescendantSymbolicLinks(layout.runtimeRoot);
  for (const managedRoot of [
    layout.committedRoot,
    layout.stagingRoot,
    layout.derivedRoot,
    layout.locksRoot,
  ]) {
    await requirePhysicalDirectory(managedRoot, "Registry managed directory");
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

async function readPhysicalFile(
  filePath: string,
  parentIdentity: PhysicalDirectoryIdentity,
): Promise<string> {
  await assertDirectoryIdentity(parentIdentity);
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new LocalFileRegistryPathError(
      "unsafe_registry_file",
      `Registry data must be stored in a physical regular file: ${filePath}`,
    );
  }
  let handle: FileHandle;
  try {
    handle = await open(
      filePath,
      fileSystemConstants.O_RDONLY |
        fileSystemConstants.O_NOFOLLOW |
        fileSystemConstants.O_NONBLOCK,
    );
  } catch (error) {
    if (isErrno(error, "ELOOP")) {
      throw new LocalFileRegistryPathError(
        "symbolic_link_not_allowed",
        `Registry data cannot be opened through a symbolic link: ${filePath}`,
      );
    }
    throw error;
  }
  try {
    await assertDirectoryIdentity(parentIdentity);
    const openedStatus = await handle.stat();
    if (!openedStatus.isFile()) {
      throw new LocalFileRegistryPathError(
        "unsafe_registry_file",
        `Registry data changed from a physical regular file while opening: ${filePath}`,
      );
    }
    const contents = await handle.readFile("utf8");
    await assertDirectoryIdentity(parentIdentity);
    return contents;
  } finally {
    await handle.close();
  }
}

const UNSUPPORTED_DIRECTORY_SYNC_ERRORS = new Set([
  "EBADF",
  "EISDIR",
  "EINVAL",
  "ENOTSUP",
  "EOPNOTSUPP",
]);

async function flushDirectoryWhenSupported(
  identity: PhysicalDirectoryIdentity,
  hooks: LocalFileRegistryFaultHooks = {},
): Promise<void> {
  let handle: FileHandle | null = null;
  try {
    await assertDirectoryIdentity(identity);
    await hooks.onDirectorySync?.(identity.path);
    handle = await open(identity.path, "r");
    await assertDirectoryIdentity(identity);
    await handle.sync();
    await assertDirectoryIdentity(identity);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      UNSUPPORTED_DIRECTORY_SYNC_ERRORS.has(String(error.code))
    )) {
      throw error;
    }
    // Directory fsync is not uniformly supported. Only explicitly unsupported
    // platform errors are suppressed; EIO and other real failures propagate.
  } finally {
    if (handle !== null) await handle.close();
  }
}

async function writeFlushedStagingFile(
  stagingIdentity: PhysicalDirectoryIdentity,
  label: string,
  contents: string,
): Promise<string> {
  await assertDirectoryIdentity(stagingIdentity);
  const stagingPath = resolve(stagingIdentity.path, `.${label}.${randomUUID()}.tmp`);
  const handle = await open(stagingPath, "wx", 0o600);
  try {
    await assertDirectoryIdentity(stagingIdentity);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await assertDirectoryIdentity(stagingIdentity);
  } finally {
    await handle.close();
  }
  return stagingPath;
}

async function renameAcrossVerifiedDirectories(
  sourcePath: string,
  destinationPath: string,
  sourceIdentity: PhysicalDirectoryIdentity,
  destinationIdentity: PhysicalDirectoryIdentity,
): Promise<void> {
  // Node.js has no portable descriptor-relative rename/openat API. These identity
  // fences detect deterministic parent replacement immediately around mutation,
  // but the Milestone 09 local adapter still assumes a cooperative local writer
  // and no privileged process racing directory-ancestor replacement between checks.
  await assertDirectoryIdentity(sourceIdentity);
  await assertDirectoryIdentity(destinationIdentity);
  await rename(sourcePath, destinationPath);
  await assertDirectoryIdentity(sourceIdentity);
  await assertDirectoryIdentity(destinationIdentity);
}

async function replaceWithFlushedFile(
  stagingIdentity: PhysicalDirectoryIdentity,
  destinationIdentity: PhysicalDirectoryIdentity,
  label: string,
  destinationPath: string,
  contents: string,
): Promise<void> {
  const stagingPath = await writeFlushedStagingFile(stagingIdentity, label, contents);
  await renameAcrossVerifiedDirectories(
    stagingPath,
    destinationPath,
    stagingIdentity,
    destinationIdentity,
  );
  await flushDirectoryWhenSupported(destinationIdentity);
}

async function readVerifiedDirectoryNames(identity: PhysicalDirectoryIdentity): Promise<string[]> {
  await assertDirectoryIdentity(identity);
  const names = await readdir(identity.path);
  await assertDirectoryIdentity(identity);
  return names;
}

function parseEnvelopeFileName(fileName: string): ParsedEnvelopeFileName | null {
  const match = ENVELOPE_FILE_PATTERN.exec(fileName);
  if (match === null) return null;
  const firstSequence = Number(match[1]);
  const lastSequence = Number(match[2]);
  if (
    !Number.isSafeInteger(firstSequence) ||
    !Number.isSafeInteger(lastSequence) ||
    firstSequence <= 0 ||
    lastSequence < firstSequence
  ) {
    return null;
  }
  return {
    fileName,
    firstSequence,
    lastSequence,
    envelopeFingerprint: match[3]!,
  };
}

function envelopeFileName(envelope: CommittedRegistryTransactionEnvelope): string {
  return `${String(envelope.firstSequence).padStart(16, "0")}-${String(
    envelope.lastSequence,
  ).padStart(16, "0")}-${envelope.envelopeFingerprint}.json`;
}

const COMMIT_MARKER_KEYS = [
  "schemaVersion",
  "markerType",
  "committedTransactionCount",
  "committedRecordCount",
  "lastCommittedAuditSequence",
  "lastRecordFingerprint",
  "integrityFingerprint",
  "lastEnvelopeFileName",
  "lastEnvelopeFingerprint",
  "markerFingerprint",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function markerWithoutFingerprint(
  marker: RegistryCommitMarker,
): Omit<RegistryCommitMarker, "markerFingerprint"> {
  const { markerFingerprint: _markerFingerprint, ...unsigned } = marker;
  void _markerFingerprint;
  return unsigned;
}

function createMarkerFingerprint(
  marker: Omit<RegistryCommitMarker, "markerFingerprint"> | RegistryCommitMarker,
): string {
  const unsigned =
    "markerFingerprint" in marker ? markerWithoutFingerprint(marker) : structuredClone(marker);
  return createCanonicalSha256Fingerprint(unsigned);
}

function parseCommitMarker(input: unknown): RegistryCommitMarker {
  if (!isPlainRecord(input) || !hasExactKeys(input, COMMIT_MARKER_KEYS)) {
    throw new DurableRegistryIntegrityError(
      "invalid_commit_marker",
      "Registry commit marker must match the strict local marker schema",
    );
  }
  const marker = input as unknown as RegistryCommitMarker;
  const countsAreValid = [
    marker.committedTransactionCount,
    marker.committedRecordCount,
    marker.lastCommittedAuditSequence,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
  const empty = marker.committedTransactionCount === 0;
  const structuralValid =
    marker.schemaVersion === "1.0" &&
    marker.markerType === "registry_commit_head" &&
    countsAreValid &&
    marker.committedRecordCount === marker.lastCommittedAuditSequence &&
    marker.committedTransactionCount <= marker.committedRecordCount &&
    typeof marker.integrityFingerprint === "string" &&
    SHA_256_PATTERN.test(marker.integrityFingerprint) &&
    typeof marker.markerFingerprint === "string" &&
    SHA_256_PATTERN.test(marker.markerFingerprint) &&
    (empty
      ? marker.committedRecordCount === 0 &&
        marker.lastRecordFingerprint === "genesis" &&
        marker.lastEnvelopeFileName === null &&
        marker.lastEnvelopeFingerprint === null
      : marker.committedRecordCount > 0 &&
        typeof marker.lastRecordFingerprint === "string" &&
        SHA_256_PATTERN.test(marker.lastRecordFingerprint) &&
        typeof marker.lastEnvelopeFileName === "string" &&
        parseEnvelopeFileName(marker.lastEnvelopeFileName) !== null &&
        typeof marker.lastEnvelopeFingerprint === "string" &&
        SHA_256_PATTERN.test(marker.lastEnvelopeFingerprint));
  if (!structuralValid) {
    throw new DurableRegistryIntegrityError(
      "invalid_commit_marker",
      "Registry commit marker contains invalid chain-head or count coordinates",
    );
  }
  if (createMarkerFingerprint(marker) !== marker.markerFingerprint) {
    throw new DurableRegistryIntegrityError(
      "commit_marker_fingerprint_mismatch",
      "Registry commit marker fingerprint does not match its canonical payload",
    );
  }
  return deepFreeze(structuredClone(marker));
}

function createCommitMarker(
  replay: DurableRegistryReplayResult,
  lastEnvelope: CommittedRegistryTransactionEnvelope | null,
): RegistryCommitMarker {
  const unsigned = {
    schemaVersion: "1.0" as const,
    markerType: "registry_commit_head" as const,
    committedTransactionCount: replay.committedTransactionCount,
    committedRecordCount: replay.committedRecordCount,
    lastCommittedAuditSequence: replay.lastCommittedAuditSequence,
    lastRecordFingerprint: replay.lastRecordFingerprint,
    integrityFingerprint: replay.integrityFingerprint,
    lastEnvelopeFileName: lastEnvelope === null ? null : envelopeFileName(lastEnvelope),
    lastEnvelopeFingerprint: lastEnvelope?.envelopeFingerprint ?? null,
  };
  return deepFreeze({ ...unsigned, markerFingerprint: createMarkerFingerprint(unsigned) });
}

function replayProgress(replay: DurableRegistryReplayResult): DurableRegistryReplayProgress {
  return {
    activationCount: replay.activationHistory.length,
    committedRecordCount: replay.committedRecordCount,
    committedTransactionCount: replay.committedTransactionCount,
    decisionCount: replay.reviewDecisionHistory.length,
    lastCommittedAuditSequence: replay.lastCommittedAuditSequence,
    lastRecordFingerprint: replay.lastRecordFingerprint,
    lifecycleTransitionCount: replay.lifecycleHistory.length,
    registeredSnapshotCount: replay.snapshotRegistrations.length,
  };
}

function coordinateMismatch(
  replay: DurableRegistryReplayResult,
  message: string,
): DurableRegistryIntegrityError {
  return new DurableRegistryIntegrityError(
    "committed_history_coordinate_mismatch",
    message,
    {},
    replayProgress(replay),
  );
}

function markerMatchesReplay(
  marker: RegistryCommitMarker,
  replay: DurableRegistryReplayResult,
  envelopes: readonly CommittedRegistryTransactionEnvelope[],
): boolean {
  const lastEnvelope = envelopes.at(-1) ?? null;
  return (
    marker.committedTransactionCount === replay.committedTransactionCount &&
    marker.committedRecordCount === replay.committedRecordCount &&
    marker.lastCommittedAuditSequence === replay.lastCommittedAuditSequence &&
    marker.lastRecordFingerprint === replay.lastRecordFingerprint &&
    marker.integrityFingerprint === replay.integrityFingerprint &&
    marker.lastEnvelopeFileName ===
      (lastEnvelope === null ? null : envelopeFileName(lastEnvelope)) &&
    marker.lastEnvelopeFingerprint === (lastEnvelope?.envelopeFingerprint ?? null)
  );
}

function integrityIssue(error: DurableRegistryIntegrityError): RegistryIntegrityIssue {
  return {
    code: error.code,
    message: error.message,
    transactionId: error.transactionId,
    recordId: error.recordId,
    sequence: error.sequence !== null && error.sequence > 0 ? error.sequence : null,
  };
}

function asIntegrityError(
  error: unknown,
  logicalName = "Registry data",
): DurableRegistryIntegrityError {
  if (error instanceof DurableRegistryIntegrityError) return error;
  if (error instanceof LocalFileRegistryPathError) {
    return new DurableRegistryIntegrityError(
      "registry_storage_safety_failure",
      "Registry storage safety checks failed during verification",
    );
  }
  if (
    error instanceof DurableRegistryValidationError ||
    error instanceof DurableRegistryConflictError
  ) {
    return new DurableRegistryIntegrityError(error.code, error.message, error);
  }
  if (error instanceof Error && "code" in error) {
    const code = String(error.code);
    if (code === "ENOENT") {
      return new DurableRegistryIntegrityError(
        "registry_file_unavailable",
        `${logicalName} became unavailable during verification`,
      );
    }
    if (code === "EACCES" || code === "EPERM") {
      return new DurableRegistryIntegrityError(
        "registry_file_unreadable",
        `${logicalName} could not be read during verification`,
      );
    }
    return new DurableRegistryIntegrityError(
      "registry_filesystem_failure",
      `${logicalName} could not be verified because of a filesystem failure`,
    );
  }
  return new DurableRegistryIntegrityError(
    "invalid_authoritative_history",
    "Authoritative registry history could not be verified",
  );
}

function stableIndexOperationError(
  error: unknown,
  logicalName: string,
  message: string,
): DurableRegistryIntegrityError {
  const normalized = asIntegrityError(error, logicalName);
  return new DurableRegistryIntegrityError(
    normalized.code,
    message,
    {
      recordId: normalized.recordId,
      sequence: normalized.sequence,
      transactionId: normalized.transactionId,
    },
    normalized.progress,
  );
}

function invalidIntegrityResult(error: DurableRegistryIntegrityError): RegistryIntegrityResult {
  return deepFreeze(
    RegistryIntegrityResultSchema.parse({
      schemaVersion: "1.0",
      status: "invalid",
      verifiedTransactionCount: error.progress.committedTransactionCount,
      verifiedRecordCount: error.progress.committedRecordCount,
      verifiedThroughSequence: error.progress.lastCommittedAuditSequence,
      lastRecordFingerprint: error.progress.lastRecordFingerprint,
      derivedIndexStatus: "not_checked",
      derivedIndexIssues: [],
      integrityFingerprint: null,
      issues: [integrityIssue(error)],
    }),
  );
}

function failedRecoveryResult(error: DurableRegistryIntegrityError): RegistryRecoveryResult {
  return deepFreeze(
    RegistryRecoveryResultSchema.parse({
      schemaVersion: "1.0",
      status: "failed",
      activeSnapshotId: null,
      registeredSnapshotCount: error.progress.registeredSnapshotCount,
      lifecycleTransitionCount: error.progress.lifecycleTransitionCount,
      decisionCount: error.progress.decisionCount,
      activationCount: error.progress.activationCount,
      committedTransactionCount: error.progress.committedTransactionCount,
      committedRecordCount: error.progress.committedRecordCount,
      lastCommittedAuditSequence: error.progress.lastCommittedAuditSequence,
      lastRecordFingerprint: error.progress.lastRecordFingerprint,
      derivedIndexStatus: "not_checked",
      derivedIndexIssues: [],
      integrityFingerprint: null,
      errors: [integrityIssue(error)],
    }),
  );
}

function derivedIssue(code: string, message: string): RegistryIntegrityIssue {
  return { code, message, transactionId: null, recordId: null, sequence: null };
}

function createDerivedIndex(replay: DurableRegistryReplayResult): DerivedRegistryIndex {
  const unsigned = {
    schemaVersion: "1.0" as const,
    activeSnapshotId: replay.activeSnapshotId,
    indexedThroughSequence: replay.lastCommittedAuditSequence,
    authoritativeIntegrityFingerprint: replay.integrityFingerprint,
  };
  const normalized = DerivedRegistryIndexSchema.parse({
    ...unsigned,
    indexFingerprint: PLACEHOLDER_FINGERPRINT,
  });
  const { indexFingerprint: _indexFingerprint, ...normalizedUnsigned } = normalized;
  void _indexFingerprint;
  return deepFreeze(
    DerivedRegistryIndexSchema.parse({
      ...normalizedUnsigned,
      indexFingerprint: createCanonicalSha256Fingerprint(normalizedUnsigned),
    }),
  );
}

function hasCanonicalDerivedIndexValue(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;

  ancestors.add(value);
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor =
        typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
    } catch {
      return false;
    }
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !("value" in descriptor) ||
      !hasCanonicalDerivedIndexValue(descriptor.value, ancestors)
    ) {
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

function verifyRawDerivedIndexFingerprint(input: unknown): boolean {
  if (
    !hasCanonicalDerivedIndexValue(input) ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "indexFingerprint");
  if (
    descriptor === undefined ||
    descriptor.enumerable !== true ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "string"
  ) {
    return false;
  }
  const unsigned = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "indexFingerprint"),
  );
  try {
    return createCanonicalSha256Fingerprint(unsigned) === descriptor.value;
  } catch {
    return false;
  }
}

class WriterLock {
  public constructor(
    private readonly handle: FileHandle,
    private readonly lockPath: string,
    private readonly locksIdentity: PhysicalDirectoryIdentity,
    private readonly device: number,
    private readonly inode: number,
  ) {}

  public async release(): Promise<void> {
    await assertDirectoryIdentity(this.locksIdentity);
    let currentStatus;
    try {
      currentStatus = await lstat(this.lockPath);
    } catch (error) {
      await this.handle.close().catch(() => undefined);
      if (isErrno(error, "ENOENT")) {
        throw new LocalFileRegistryConflictError(
          "writer_lock_lost",
          "The owned writer lock disappeared before normal release",
        );
      }
      throw error;
    }
    if (
      currentStatus.isSymbolicLink() ||
      currentStatus.dev !== this.device ||
      currentStatus.ino !== this.inode
    ) {
      await this.handle.close().catch(() => undefined);
      throw new LocalFileRegistryConflictError(
        "writer_lock_replaced",
        "The owned writer lock was replaced; the replacement was not removed",
      );
    }
    await this.handle.close();
    await unlink(this.lockPath);
    await assertDirectoryIdentity(this.locksIdentity);
  }
}

export class LocalFileRegistryStorage implements GovernedDurableSnapshotRegistryStoragePort {
  public readonly layout: LocalFileRegistryLayout;

  private constructor(
    private readonly allowedPhysicalRoot: string,
    private readonly canonicalSourceRoots: readonly string[],
    private readonly identities: CriticalDirectoryIdentities,
    layout: LocalFileRegistryLayout,
    private readonly readFaultHooks: LocalFileRegistryReadFaultHooks = {},
  ) {
    this.layout = layout;
  }

  public static async open(
    options: LocalFileRegistryOptions,
    readFaultHooks: LocalFileRegistryReadFaultHooks = {},
  ): Promise<LocalFileRegistryStorage> {
    const resolved = await createSafeRuntimeLayout(options);
    const storage = new LocalFileRegistryStorage(
      resolved.allowedPhysicalRoot,
      resolved.canonicalSourceRoots,
      resolved.identities,
      resolved.layout,
      readFaultHooks,
    );
    await storage.initializeGenesisMarkerWhenSafe();
    return storage;
  }

  public async withExclusiveWriter<T>(
    operation: (writer: LocalFileRegistryWriterSession) => Promise<T>,
  ): Promise<T> {
    await this.assertSafeTree();
    const writerLock = await this.acquireWriterLock();
    let active = true;
    let acceptingOperations = true;
    let operationTail: Promise<unknown> = Promise.resolve();
    const sessionOperations: Promise<unknown>[] = [];
    const requireActive = (starting: boolean): void => {
      if (!active || (starting && !acceptingOperations)) {
        throw new LocalFileRegistryConflictError(
          "writer_session_expired",
          "The exclusive local-registry writer session is no longer active",
        );
      }
    };
    const runSessionOperation = <Result>(
      sessionOperation: () => Promise<Result>,
    ): Promise<Result> => {
      requireActive(true);
      const pending = operationTail.then(async (): Promise<Result> => {
        requireActive(false);
        return sessionOperation();
      });
      // Preserve invocation order inside the session. In particular, concurrent
      // appends must not both verify against the same previously committed head.
      // A failed operation poisons the remaining queue instead of permitting a
      // later mutation after the callback has already observed an error.
      operationTail = pending;
      sessionOperations.push(pending);
      return pending;
    };
    const writer: LocalFileRegistryWriterSession = Object.freeze({
      appendCommittedEnvelope: async (
        input: CommittedRegistryTransactionEnvelope,
        hooks: LocalFileRegistryFaultHooks = {},
      ): Promise<CommittedRegistryTransactionEnvelope> =>
        runSessionOperation(async () => {
          const state = await this.readVerifiedState();
          requireActive(false);
          return this.commitEnvelopeFromVerifiedState(input, state, hooks);
        }),
      readVerifiedState: async (): Promise<VerifiedLocalFileRegistryState> =>
        runSessionOperation(async () => {
          const state = await this.readVerifiedState();
          requireActive(false);
          return state;
        }),
    });
    let operationResult: T | undefined;
    let operationFailed = false;
    let operationError: unknown;
    try {
      operationResult = await operation(writer);
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    acceptingOperations = false;
    const pendingResults = await Promise.allSettled(sessionOperations);
    // Invalidate the unforgeable closure-backed capability before releasing the
    // OS lock so retained sessions cannot be reused by later asynchronous work.
    active = false;
    let releaseFailed = false;
    let releaseError: unknown;
    try {
      await writerLock.release();
    } catch (error) {
      releaseFailed = true;
      releaseError = error;
    }
    if (operationFailed) throw operationError;
    const pendingFailure = pendingResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (pendingFailure !== undefined) throw pendingFailure.reason;
    if (releaseFailed) throw releaseError;
    // A lock left by a real process crash is deliberately never auto-broken. An
    // operator must confirm that no writer is alive before removing that file.
    return operationResult as T;
  }

  public async readVerifiedState(): Promise<VerifiedLocalFileRegistryState> {
    await this.assertSafeTree();
    if (!(await pathExists(this.layout.commitMarkerPath))) {
      throw new DurableRegistryIntegrityError(
        "missing_commit_marker",
        "Registry commit marker is missing; committed history cannot be trusted",
      );
    }
    await this.readFaultHooks.onBeforeFileRead?.("commit_marker", COMMIT_MARKER_FILE);
    const commitMarker = parseCommitMarker(
      this.parseJson(
        await readPhysicalFile(this.layout.commitMarkerPath, this.identities.runtime),
        "invalid_commit_marker",
        "Registry commit marker is not valid JSON",
      ),
    );
    const fileNames = await readVerifiedDirectoryNames(this.identities.committed);
    const authoritativeFiles: ParsedEnvelopeFileName[] = [];
    for (const fileName of fileNames) {
      const parsed = parseEnvelopeFileName(fileName);
      if (parsed === null) {
        if (fileName.endsWith(".json")) {
          throw new DurableRegistryIntegrityError(
            "unexpected_committed_file",
            `Committed envelope directory contains a non-deterministic JSON filename: ${fileName}`,
          );
        }
        continue;
      }
      if (parsed.lastSequence <= commitMarker.lastCommittedAuditSequence) {
        authoritativeFiles.push(parsed);
      } else if (parsed.firstSequence <= commitMarker.lastCommittedAuditSequence) {
        throw new DurableRegistryIntegrityError(
          "committed_history_coordinate_mismatch",
          `Envelope ${fileName} crosses the trusted commit-marker boundary`,
        );
      }
      // A whole envelope strictly beyond the marker is an uncommitted pre-marker
      // orphan. It is ignored and may be replaced by the next exclusive writer.
    }
    authoritativeFiles.sort(
      (left, right) =>
        left.firstSequence - right.firstSequence ||
        left.lastSequence - right.lastSequence ||
        (left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0),
    );

    if (
      commitMarker.lastEnvelopeFileName !== null &&
      !authoritativeFiles.some((file) => file.fileName === commitMarker.lastEnvelopeFileName)
    ) {
      const prefixInputs = await this.readEnvelopeInputs(authoritativeFiles);
      const prefixReplay = replayCommittedRegistryTransactions(prefixInputs);
      throw coordinateMismatch(
        prefixReplay,
        `Trusted commit marker references missing envelope ${commitMarker.lastEnvelopeFileName}`,
      );
    }

    const envelopes = await this.readEnvelopeInputs(authoritativeFiles);
    const replay = replayCommittedRegistryTransactions(envelopes);
    if (!markerMatchesReplay(commitMarker, replay, envelopes)) {
      throw coordinateMismatch(
        replay,
        "Committed envelopes do not match the separately trusted chain head, counts, and integrity coordinate",
      );
    }
    return deepFreeze({ commitMarker, envelopes, replay });
  }

  public async appendCommittedEnvelope(
    input: CommittedRegistryTransactionEnvelope,
    hooks: LocalFileRegistryFaultHooks = {},
  ): Promise<CommittedRegistryTransactionEnvelope> {
    return this.withExclusiveWriter((writer) => writer.appendCommittedEnvelope(input, hooks));
  }

  private async commitEnvelopeFromVerifiedState(
    input: CommittedRegistryTransactionEnvelope,
    state: VerifiedLocalFileRegistryState,
    hooks: LocalFileRegistryFaultHooks = {},
  ): Promise<CommittedRegistryTransactionEnvelope> {
    const proposed = verifyCommittedRegistryTransactionEnvelopeFingerprint(input);
    const existing = state.envelopes.find(
      (envelope) => envelope.transactionId === proposed.transactionId,
    );
    if (existing !== undefined) {
      if (!areCommittedRegistryTransactionsIdempotent(existing, proposed)) {
        throw new LocalFileRegistryConflictError(
          "transaction_id_conflict",
          `Transaction identity ${proposed.transactionId} was reused with different content`,
        );
      }
      return existing;
    }

    const candidateReplay = replayCommittedRegistryTransactions([...state.envelopes, proposed]);
    await this.quarantineUncommittedSuffix(state.commitMarker.lastCommittedAuditSequence);
    const destinationName = envelopeFileName(proposed);
    const destinationPath = resolve(this.layout.committedRoot, destinationName);
    const envelopeStagingPath = await writeFlushedStagingFile(
      this.identities.staging,
      "envelope",
      serializeCanonicalDurablePayload(proposed),
    );
    await hooks.onFaultPoint?.("after_envelope_staged");
    await renameAcrossVerifiedDirectories(
      envelopeStagingPath,
      destinationPath,
      this.identities.staging,
      this.identities.committed,
    );
    await flushDirectoryWhenSupported(this.identities.committed, hooks);
    await hooks.onFaultPoint?.("after_envelope_installed_before_commit_marker");

    const candidateMarker = createCommitMarker(candidateReplay, proposed);
    const markerStagingPath = await writeFlushedStagingFile(
      this.identities.staging,
      "commit-marker",
      serializeCanonicalDurablePayload(candidateMarker),
    );

    // Atomic replacement of this fixed marker is the authoritative commit point.
    // The immutable envelope is installed and flushed first. Therefore a crash
    // before this rename leaves an ignored suffix orphan, while a crash after it
    // requires recovery to find the exact referenced envelope and full coordinate.
    // This assumes same-filesystem atomic rename within runtimeRoot. Directory
    // sync is attempted; only explicitly unsupported platform errors are ignored,
    // while real I/O failures propagate and any durability anomaly fails closed.
    await renameAcrossVerifiedDirectories(
      markerStagingPath,
      this.layout.commitMarkerPath,
      this.identities.staging,
      this.identities.runtime,
    );
    await flushDirectoryWhenSupported(this.identities.runtime, hooks);
    await hooks.onFaultPoint?.("after_commit_marker_installed");
    return proposed;
  }

  public async verifyIntegrity(): Promise<RegistryIntegrityResult> {
    try {
      const state = await this.readVerifiedState();
      const derivedIndex = await this.inspectDerivedIndexAgainstReplay(state.replay);
      return verifyCommittedRegistryIntegrity(state.envelopes, {
        derivedIndexStatus: derivedIndex.status === "rebuilt" ? "current" : derivedIndex.status,
        derivedIndexIssues: derivedIndex.issues,
      });
    } catch (error) {
      return invalidIntegrityResult(asIntegrityError(error));
    }
  }

  public async verifyIntegrityAtSequence(sequence: number): Promise<RegistryIntegrityResult> {
    try {
      if (!Number.isSafeInteger(sequence) || sequence < 0)
        throw new DurableRegistryIntegrityError(
          "invalid_integrity_sequence",
          "Historical integrity sequence must be a non-negative safe integer",
        );
      const state = await this.readVerifiedState();
      const boundary = state.envelopes.findIndex((envelope) => envelope.lastSequence === sequence);
      if (sequence !== 0 && boundary === -1)
        throw new DurableRegistryIntegrityError(
          "integrity_sequence_not_committed_boundary",
          "Historical integrity sequence is not a committed transaction boundary",
        );
      return verifyCommittedRegistryIntegrity(
        sequence === 0 ? [] : state.envelopes.slice(0, boundary + 1),
      );
    } catch (error) {
      return invalidIntegrityResult(asIntegrityError(error));
    }
  }

  public async recover(): Promise<RegistryRecoveryResult> {
    try {
      const state = await this.readVerifiedState();
      const derivedIndex = await this.inspectDerivedIndexAgainstReplay(state.replay);
      return recoverCommittedRegistry(state.envelopes, {
        derivedIndexStatus: derivedIndex.status === "rebuilt" ? "current" : derivedIndex.status,
        derivedIndexIssues: derivedIndex.issues,
      });
    } catch (error) {
      return failedRecoveryResult(asIntegrityError(error));
    }
  }

  public async recoverAtSequence(sequence: number): Promise<RegistryRecoveryResult> {
    try {
      if (!Number.isSafeInteger(sequence) || sequence < 0)
        throw new DurableRegistryIntegrityError(
          "invalid_integrity_sequence",
          "Historical recovery sequence must be a non-negative safe integer",
        );
      const state = await this.readVerifiedState();
      const boundary = state.envelopes.findIndex((envelope) => envelope.lastSequence === sequence);
      if (sequence !== 0 && boundary === -1)
        throw new DurableRegistryIntegrityError(
          "integrity_sequence_not_committed_boundary",
          "Historical recovery sequence is not a committed transaction boundary",
        );
      return recoverCommittedRegistry(sequence === 0 ? [] : state.envelopes.slice(0, boundary + 1));
    } catch (error) {
      return failedRecoveryResult(asIntegrityError(error));
    }
  }

  public async inspectDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    try {
      const { replay } = await this.readVerifiedState();
      return await this.inspectDerivedIndexAgainstReplay(replay);
    } catch (error) {
      throw stableIndexOperationError(
        error,
        "Authoritative registry history",
        "Derived-index inspection could not verify authoritative registry history",
      );
    }
  }

  private async inspectDerivedIndexAgainstReplay(
    replay: DurableRegistryReplayResult,
  ): Promise<DerivedRegistryIndexResult> {
    const common = {
      schemaVersion: "1.0" as const,
      authoritativeThroughSequence: replay.lastCommittedAuditSequence,
      authoritativeIntegrityFingerprint: replay.integrityFingerprint,
    };
    let parsedJson: unknown;
    try {
      if (!(await pathExists(this.layout.activeIndexPath))) {
        return deepFreeze(
          DerivedRegistryIndexResultSchema.parse({
            ...common,
            status: "missing",
            index: null,
            issues: [],
          }),
        );
      }
      await this.readFaultHooks.onBeforeFileRead?.("derived_index", ACTIVE_INDEX_FILE);
      parsedJson = JSON.parse(
        await readPhysicalFile(this.layout.activeIndexPath, this.identities.derived),
      ) as unknown;
    } catch (error) {
      if (error instanceof LocalFileRegistryPathError) throw error;
      const normalized = asIntegrityError(error, "Derived active index");
      const isJsonError = error instanceof SyntaxError;
      return deepFreeze(
        DerivedRegistryIndexResultSchema.parse({
          ...common,
          status: "invalid",
          index: null,
          issues: [
            derivedIssue(
              isJsonError ? "invalid_derived_index" : normalized.code,
              isJsonError ? "Derived active index is not valid JSON" : normalized.message,
            ),
          ],
        }),
      );
    }
    if (!verifyRawDerivedIndexFingerprint(parsedJson)) {
      return deepFreeze(
        DerivedRegistryIndexResultSchema.parse({
          ...common,
          status: "invalid",
          index: null,
          issues: [
            derivedIssue(
              "derived_index_fingerprint_mismatch",
              "Derived active-index fingerprint does not match its exact canonical payload",
            ),
          ],
        }),
      );
    }
    const parsed = DerivedRegistryIndexSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return deepFreeze(
        DerivedRegistryIndexResultSchema.parse({
          ...common,
          status: "invalid",
          index: null,
          issues: [
            derivedIssue("invalid_derived_index", "Derived active index failed schema validation"),
          ],
        }),
      );
    }
    const index = deepFreeze(parsed.data);
    if (serializeCanonicalDurablePayload(parsedJson) !== serializeCanonicalDurablePayload(index)) {
      return deepFreeze(
        DerivedRegistryIndexResultSchema.parse({
          ...common,
          status: "invalid",
          index,
          issues: [
            derivedIssue(
              "non_canonical_derived_index",
              "Derived active index raw representation is not canonical",
            ),
          ],
        }),
      );
    }
    const stale =
      index.activeSnapshotId !== replay.activeSnapshotId ||
      index.indexedThroughSequence !== replay.lastCommittedAuditSequence ||
      index.authoritativeIntegrityFingerprint !== replay.integrityFingerprint;
    if (stale) {
      return deepFreeze(
        DerivedRegistryIndexResultSchema.parse({
          ...common,
          status: "stale",
          index,
          issues: [
            derivedIssue(
              "stale_derived_index",
              "Derived active index does not cover the complete verified authoritative history",
            ),
          ],
        }),
      );
    }
    return deepFreeze(
      DerivedRegistryIndexResultSchema.parse({
        ...common,
        status: "current",
        index,
        issues: [],
      }),
    );
  }

  public async rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult> {
    try {
      return await this.withExclusiveWriter(async () => {
        const { replay } = await this.readVerifiedState();
        const index = createDerivedIndex(replay);
        await this.readFaultHooks.onBeforeDerivedIndexWrite?.();
        await replaceWithFlushedFile(
          this.identities.staging,
          this.identities.derived,
          "active-index",
          this.layout.activeIndexPath,
          serializeCanonicalDurablePayload(index),
        );
        return deepFreeze(
          DerivedRegistryIndexResultSchema.parse({
            schemaVersion: "1.0",
            status: "rebuilt",
            index,
            authoritativeThroughSequence: replay.lastCommittedAuditSequence,
            authoritativeIntegrityFingerprint: replay.integrityFingerprint,
            issues: [],
          }),
        );
      });
    } catch (error) {
      throw stableIndexOperationError(
        error,
        "Derived active index",
        "Derived-index rebuild could not be completed",
      );
    }
  }

  private async assertSafeTree(): Promise<void> {
    for (const identity of Object.values(this.identities)) {
      await assertDirectoryIdentity(identity);
    }
    await assertSafeRuntimeTree(this.allowedPhysicalRoot, this.layout);
    assertOutsideCanonicalSourceRoots(
      await realpath(this.identities.allowedParent.path),
      this.canonicalSourceRoots,
      "Allowed parent root",
    );
    assertOutsideCanonicalSourceRoots(
      await realpath(this.layout.runtimeRoot),
      this.canonicalSourceRoots,
      "Registry runtime root",
    );
    assertAtomicLayoutUsesOneDevice(this.identities);
  }

  private async acquireWriterLock(): Promise<WriterLock> {
    await assertDirectoryIdentity(this.identities.locks);
    let handle: FileHandle;
    try {
      handle = await open(this.layout.writerLockPath, "wx", 0o600);
    } catch (error) {
      if (isErrno(error, "EEXIST")) {
        throw new LocalFileRegistryWriterLockError(
          "The local registry writer lock already exists. It is never broken automatically; after a crash, an operator must confirm no writer is running before removing it.",
        );
      }
      throw error;
    }
    let identity: { dev: number; ino: number };
    try {
      await assertDirectoryIdentity(this.identities.locks);
      await handle.writeFile(
        JSON.stringify({ processId: process.pid, acquiredAt: new Date().toISOString() }),
        "utf8",
      );
      await handle.sync();
      identity = await handle.stat();
    } catch (error) {
      await handle.close().catch(() => undefined);
      try {
        await assertDirectoryIdentity(this.identities.locks);
        await unlink(this.layout.writerLockPath);
      } catch {
        // If the directory identity changed, do not touch the replacement path.
      }
      throw error;
    }
    return new WriterLock(
      handle,
      this.layout.writerLockPath,
      this.identities.locks,
      identity.dev,
      identity.ino,
    );
  }

  private async initializeGenesisMarkerWhenSafe(): Promise<void> {
    await this.assertSafeTree();
    if (await pathExists(this.layout.commitMarkerPath)) return;
    const committedCandidates = (await readVerifiedDirectoryNames(this.identities.committed)).some(
      (fileName) => parseEnvelopeFileName(fileName) !== null,
    );
    if (committedCandidates) return;

    await this.withExclusiveWriter(async () => {
      if (await pathExists(this.layout.commitMarkerPath)) return;
      const recheckedCandidates = (
        await readVerifiedDirectoryNames(this.identities.committed)
      ).some((fileName) => parseEnvelopeFileName(fileName) !== null);
      if (recheckedCandidates) return;
      const genesis = replayCommittedRegistryTransactions([]);
      const marker = createCommitMarker(genesis, null);
      await replaceWithFlushedFile(
        this.identities.staging,
        this.identities.runtime,
        "genesis-marker",
        this.layout.commitMarkerPath,
        serializeCanonicalDurablePayload(marker),
      );
    });
  }

  private async readEnvelopeInputs(
    files: readonly ParsedEnvelopeFileName[],
  ): Promise<CommittedRegistryTransactionEnvelope[]> {
    const envelopes: CommittedRegistryTransactionEnvelope[] = [];
    for (const file of files) {
      try {
        const filePath = resolve(this.layout.committedRoot, file.fileName);
        await this.readFaultHooks.onBeforeFileRead?.("envelope", file.fileName);
        const raw = this.parseJson(
          await readPhysicalFile(filePath, this.identities.committed),
          "invalid_authoritative_envelope_json",
          `Committed envelope ${file.fileName} is not valid JSON`,
        );
        const envelope = verifyCommittedRegistryTransactionEnvelopeFingerprint(raw);
        if (
          envelopeFileName(envelope) !== file.fileName ||
          envelope.firstSequence !== file.firstSequence ||
          envelope.lastSequence !== file.lastSequence ||
          envelope.envelopeFingerprint !== file.envelopeFingerprint
        ) {
          throw new DurableRegistryIntegrityError(
            "envelope_filename_mismatch",
            `Committed envelope payload does not match deterministic filename ${file.fileName}`,
            { transactionId: envelope.transactionId },
          );
        }
        envelopes.push(envelope);
      } catch (error) {
        if (error instanceof LocalFileRegistryPathError) throw error;
        const normalized = asIntegrityError(error, `Committed envelope ${file.fileName}`);
        const prefixReplay = replayCommittedRegistryTransactions(envelopes);
        throw new DurableRegistryIntegrityError(
          normalized.code,
          normalized.message,
          normalized,
          replayProgress(prefixReplay),
        );
      }
    }
    return envelopes;
  }

  private async quarantineUncommittedSuffix(authoritativeThroughSequence: number): Promise<void> {
    let moved = false;
    for (const fileName of await readVerifiedDirectoryNames(this.identities.committed)) {
      const parsed = parseEnvelopeFileName(fileName);
      if (parsed === null || parsed.firstSequence <= authoritativeThroughSequence) continue;
      await renameAcrossVerifiedDirectories(
        resolve(this.layout.committedRoot, fileName),
        resolve(this.layout.stagingRoot, `.orphan.${randomUUID()}.${fileName}`),
        this.identities.committed,
        this.identities.staging,
      );
      moved = true;
    }
    if (moved) {
      await flushDirectoryWhenSupported(this.identities.committed);
      await flushDirectoryWhenSupported(this.identities.staging);
    }
  }

  private parseJson(contents: string, code: string, message: string): unknown {
    try {
      return JSON.parse(contents) as unknown;
    } catch {
      throw new DurableRegistryIntegrityError(code, message);
    }
  }
}
