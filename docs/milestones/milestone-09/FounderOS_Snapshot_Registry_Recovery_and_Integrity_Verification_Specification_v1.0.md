# FounderOS Snapshot Registry Recovery and Integrity Verification Specification v1.0

## Purpose

Define restart recovery and corruption detection for the durable snapshot registry.

## Recovery Workflow

```text
Open Registry
    |
    v
Load Committed Records
    |
    v
Verify Canonical Fingerprints
    |
    v
Verify Audit-Chain Continuity
    |
    v
Replay Lifecycle and Activation Records
    |
    v
Validate Invariants
    |
    v
Inspect Derived Index Against That Exact Replay
    |
    v
Recover Active Snapshot
```

## Required Invariants

Recovery must verify:

- Registered snapshot identities are unique.
- Snapshot fingerprints match canonical payloads.
- Lifecycle transitions are valid and ordered.
- Approval references exist and match.
- Activation records reference approved snapshots.
- Audit-chain links are continuous.
- No snapshot has contradictory terminal states.
- No more than one snapshot is active.
- Supersession history is consistent.
- Derived active state matches any cached index.

The derived index remains non-authoritative. Its exact raw JSON representation is fingerprinted
before schema parsing and must be canonically equivalent to the parsed index, preventing whitespace
trimming or defaults from changing signed meaning. A missing, stale, schema-invalid, or
fingerprint-mismatched index is reported separately as `derivedIndexStatus` and
`derivedIndexIssues`; it does not turn otherwise valid authoritative history into corruption and
is never rebuilt by `verifyIntegrity()` or `recover()`.

## Corruption Handling

The system must fail closed when detecting:

- Missing records
- Fingerprint mismatches
- Broken audit-chain links
- Duplicate conflicting identities
- Invalid lifecycle transitions
- Contradictory activations
- Partial transaction artifacts presented as committed

Do not silently skip or repair invalid governance history.

## Recovery Output

Recovery should return:

- Registry status
- Active snapshot ID, if any
- Registered snapshot count
- Lifecycle transition, review decision, and activation counts
- Last committed audit sequence
- Integrity fingerprint
- Derived-index status and issues
- Actionable errors on failure

Failure counts describe only the completely verified authoritative prefix. Deterministic recovery,
integrity, and index results use stable filesystem failure codes and logical envelope, marker, or
index names; they never serialize operating-system error text or absolute runtime paths.
Post-open managed-directory identity, symlink, and non-regular-entry failures are structured invalid
or failed integrity/recovery results; configuration and initial path-validation failures remain
errors from registry open. When a marker-referenced tail envelope is missing, an earlier semantic
replay failure and its exact verified-prefix progress take precedence over the later coordinate gap.
Direct index inspection and rebuild normalize failures from authoritative reads, derived reads, lock
handling, and derived writes into the same stable path-free domain vocabulary.

## Principle

A durable knowledge state is trustworthy only when it can be independently reconstructed and verified.
