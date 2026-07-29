# FounderOS Local File-Backed Snapshot Registry Adapter Specification v1.0

## Purpose

Define the minimal replaceable persistence adapter used to prove Milestone 09 durability without introducing a general-purpose database.

## Default Runtime Location

Use an explicit configurable root outside canonical documentation, for example:

```text
.founderos/runtime/knowledge-registry/
```

The runtime directory must be Git-ignored.

## Suggested Layout

```text
knowledge-registry/
├── registry-metadata.json
├── snapshots/
├── transitions/
├── decisions/
├── activations/
├── transactions/
└── derived/
```

## Authoritative Data

Authoritative files are immutable committed records.

Derived files, such as an active-snapshot cache or summary index, must be rebuildable.
Public integrity and recovery operations inspect the stored derived index against the same exact
authoritative replay they report. They expose missing, stale, invalid, fingerprint-mismatched, and
current state without repairing it. Only the explicit rebuild operation may replace the index.

## Commit Protocol

The adapter should use:

1. Explicit single-writer lock
2. Canonical serialization
3. Temporary file in the target filesystem
4. File flush when supported
5. Atomic rename into committed location
6. Directory flush when supported
7. Lock release

A transaction is committed only after the authoritative transaction record is atomically installed.

## Path Safety

The adapter must:

- Require an explicit runtime root
- Reject path traversal
- Reject symlink escape
- Never place the runtime inside canonical `docs` or `knowledge` sources, or above them such that
  managed runtime entries could be written alongside or over source trees
- Protect unrelated repository files from overwrite

## Determinism

Record identity and fingerprints must be content-derived where specified.

Machine-specific physical paths must not affect canonical record bytes.
Filesystem failures returned through deterministic recovery, integrity, or index contracts must use
stable codes and logical managed names rather than raw Node.js messages or physical paths.
Direct derived-index inspection and rebuild must apply the same normalization to authoritative reads,
derived reads, writer acquisition, and derived writes. When an index contract cannot represent an
authoritative-read or write failure as a result, it throws a stable path-free domain error.

## Concurrency Scope

Milestone 09 supports an explicit single-writer local adapter.

Distributed writers and remote coordination remain deferred.

## Principle

The first durable adapter should prove governance and recovery semantics while remaining replaceable.
