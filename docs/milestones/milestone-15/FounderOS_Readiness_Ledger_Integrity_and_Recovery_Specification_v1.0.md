# FounderOS Readiness Ledger Integrity and Recovery Specification v1.0

## Status

**Specified — not implemented**

## Purpose

Define deterministic restart recovery and fail-closed integrity verification for durable readiness evaluation registrations and replay attempts.

## Recovery Sequence

```text
Open configured ledger root safely
        |
        v
Validate root identity and entry safety
        |
        v
Read and verify commit-head marker
        |
        v
Load exact marker-bounded event prefix
        |
        v
Verify schemas, canonical bytes, and fingerprints
        |
        v
Replay sequences, audit chain, ownership, and bindings
        |
        v
Classify staging and installed crash orphans
        |
        v
Compare derived indexes with authoritative replay
        |
        v
Return deterministic recovery evidence
```

## Integrity Coverage

Verification must cover:

- canonical JSON and record fingerprints;
- canonical genesis complete-history, genesis-head, and genesis-marker bytes and fingerprints;
- registration-request and transaction fingerprints;
- permanent idempotency ownership;
- Decision ID uniqueness and authority bindings;
- exact stored Decision, ordered gate trace, retained Evidence package, and retention fingerprint;
- exact evaluator configuration projection;
- exact Delivery and Invocation identity projection;
- registration and replay sequence continuity;
- previous-head and resulting-head bindings;
- complete audit-chain continuity;
- replay reference and comparison bindings;
- global uniqueness and permanent ownership for every original-registration and replay identity defined by `M15-IDEM-001` and `M15-IDEM-002`;
- the exact genesis and event commit-marker field sets from `M15-COMMIT-001`, including counts, last sequence, subject, semantic-event, and audit-entry coordinates, resulting ledger head, and complete-history fingerprint;
- byte equality among the marker-embedded head, `readHead()`, and any rebuilt derived `HEAD` projection;
- byte equality and fingerprint equality between the installed fixed current marker and its immutable event-local archive, plus permanent uniqueness of every archived marker ID;
- authoritative record completeness;
- privacy and no-execution invariants;
- derived index equality with authoritative replay.

## Recovery Result

The deterministic recovery result contains:

- result contract version;
- status: `recovered`, `empty`, or `failed`;
- committed registration count;
- committed replay-attempt count;
- permanent idempotency ownership count;
- last committed sequence;
- recovered latest audit-entry ID and fingerprint, both null for initialized empty;
- recovered latest semantic-event ID and fingerprint, both null for initialized empty;
- recovered latest subject transaction ID and fingerprint, both null for initialized empty;
- recovered complete-history fingerprint;
- authoritative marker fingerprint;
- derived-index status;
- staging-orphan count;
- installed-uncommitted-orphan count;
- stable ordered errors;

Recovery results are strict canonical ephemeral verification outputs and are deliberately not fingerprinted. They are not ledger authority and therefore have no unsigned commitment domain or fingerprint field (`M15-INTEGRITY-001`).

An uninitialized root returns `status = failed` with sole stable error `ledger-uninitialized`; incomplete genesis initialization returns `genesis-initialization-incomplete`; corrupt genesis returns `genesis-corrupt`. None is reported as `empty`, and none causes mutation during `recover()` or `verifyIntegrity()`.

Public errors contain logical record coordinates, never physical paths or secret values.

## Integrity Result

The integrity result contains:

- result contract version;
- status: `valid` or `invalid`;
- verified marker fingerprint;
- verified registration, replay, and total event counts;
- verified last sequence and latest audit-entry fingerprint;
- verified complete-history fingerprint;
- derived-index status reported separately;
- stable ordered findings;

Integrity results are strict canonical ephemeral verification outputs and are deliberately not fingerprinted. They are not ledger authority and therefore have no unsigned commitment domain or fingerprint field (`M15-INTEGRITY-001`).

Derived-index corruption alone does not make valid authoritative history invalid, but it prevents use of the index until explicit rebuild succeeds.

## Fail-Closed Conditions

Recovery fails on:

- missing, malformed, unsupported, or fingerprint-invalid marker;
- missing marker-referenced event;
- extra installed event that conflicts with the committed prefix;
- incomplete registration transaction or replay attempt;
- invalid canonical bytes or fingerprint;
- broken, duplicated, or reordered sequence;
- broken audit-chain link;
- conflicting idempotency ownership;
- duplicate or conflicting globally owned registration idempotency key, ownership ID, registration request ID, transaction ID, readiness Decision ID, registration semantic-event ID, registration audit-entry ID, registration marker ID, replay idempotency key, replay request ID, replay attempt ID, replay semantic event ID, replay audit entry ID, or replay marker ID;
- mismatched Delivery, Invocation, Adapter, capability, Credential Reference, Transport Policy, evaluator configuration, gate trace, or retention binding;
- replay referencing a missing original transaction;
- prohibited secret, endpoint, path, client, callback, or executable material;
- symlink, traversal, special-file, or unsafe-entry discovery;
- ambiguous crash state.

Authoritative corruption is never silently skipped, truncated, normalized, repaired, or overwritten.

## Crash-State Classification

- Temporary files wholly within staging and absent from the marker are uncommitted staging orphans.
- Fully installed events beyond the marker are uncommitted installed orphans.
- Neither category is replayed as authority.
- A later write may quarantine safely classified orphans only after successful recovery, expected-head verification, and lock acquisition.
- If an orphan conflicts with a marker-bounded identity or cannot be classified unambiguously, recovery fails.
- A marker that references a missing or incomplete event is corruption, not a pre-commit crash.
- A verified atomically installed fixed current-marker copy is the sole authoritative visibility boundary. Its byte-identical immutable event-local archive preserves the activated marker as history but never creates visibility by itself. A separately stored `HEAD` projection and every index are derived; their absence after marker commitment never rolls back the commit (`M15-TXN-001`, `M15-TXN-002`).
- Recovery classification for every interruption and lock state is governed by the single fault-point matrix `M15-FS-001` in the Local File Readiness Ledger Adapter Specification.

## Derived Index Recovery

Indexes are verified only after authoritative replay. Missing or corrupt indexes are reported as `missing` or `invalid`; they are not repaired implicitly during read, recovery, or integrity verification.

Explicit rebuild must:

1. start from valid authoritative history;
2. create deterministic index bytes;
3. bind the exact ledger-head fingerprint;
4. publish atomically through the adapter;
5. verify the installed index before reporting success.

## Coherent Re-Signing and Substitution

Recomputed local fingerprints do not establish semantic authority. Recovery must compare all cross-record identity and configuration bindings. A coherently re-signed transaction with a substituted Delivery, Invocation, Adapter, capability, Credential Reference, Transport Policy, gate order, or retention package fails because it no longer matches the marker-bounded ownership and upstream authority projections.

## Empty Ledger

The sole authoritative empty-ledger model is the explicit genesis commitment in `M15-COMMIT-001` and `M15-GENESIS-001`:

- canonical genesis complete history uses the exact constant input and domain tag;
- the zero-event genesis head uses generation, counts, and sequence `0`, all six latest-coordinate fields `null`, and the genesis complete-history fingerprint;
- the deterministic genesis marker uses ID `m15-genesis`, generation `0`, category `genesis`, null event coordinates, and the exact embedded genesis head;
- the immutable genesis archive and fixed current-marker copy are byte-identical;
- atomic fixed-marker installation is the genesis visibility boundary.

Safe open/create distinguishes four states:

1. `uninitialized`: no FounderOS-created genesis or event component exists; read-only open reports uninitialized and create may initialize under the writer lock.
2. `initialized-empty`: both genesis marker copies exist, are byte-identical, independently recompute, and reference the exact canonical genesis head and history; recovery returns `empty`.
3. `incomplete-genesis-initialization`: staging or a canonical archived genesis candidate exists without a fixed marker; it is not authority. Read-only open reports failure, while a later locked create may complete only from independently verified exact canonical genesis material after classifying every orphan.
4. `corrupt-genesis`: any missing counterpart after fixed-marker visibility, extra component, byte mismatch, invalid schema/fingerprint, noncanonical constant, event data at generation `0`, or event marker using the reserved genesis ID; recovery fails closed and performs no automatic repair.

Crash before staging preserves `uninitialized`. Crash during staging yields incomplete initialization with staging orphans only. Crash after archived genesis installation but before fixed-marker installation yields incomplete initialization with no empty-ledger authority. Crash after fixed-marker installation yields `initialized-empty` only when both copies and every genesis commitment verify. The first registration must bind the verified genesis `ledgerHeadFingerprint` as its previous and expected head and advance to generation and sequence `1`.

## Principle

Restart safety exists only when the exact committed prefix can be independently reconstructed without trusting process memory or derived indexes.
