# FounderOS Local File Readiness Ledger Adapter Specification v1.0

## Status

**Specified — not implemented**

## Purpose

Define the first replaceable local adapter that can prove Milestone 15 persistence, atomicity, recovery, replay, and path-safety semantics.

## Runtime Root

The adapter uses one explicit Git-ignored root, for example:

```text
.founderos/runtime/provider-readiness-ledger/
```

It must not write into `docs/`, `knowledge/`, `packages/`, `services/`, fixtures, or other canonical source trees.

## Suggested Layout

```text
provider-readiness-ledger/
├── metadata.json
├── commit-head.json
├── events/
│   ├── genesis/            # immutable canonical genesis marker archive
│   ├── registrations/      # immutable event components plus archived marker
│   └── replay-attempts/    # immutable event components plus archived marker
├── staging/
├── quarantine/
├── derived/
└── writer.lock
```

Exact names may change during implementation, but authoritative, staging, quarantine, lock, and derived responsibilities must remain separated.

For the version `1.0` genesis contract, the logical immutable archive location is exactly `events/genesis/commit-marker.json`, and the fixed current-marker location is exactly `commit-head.json`. Implementations may relocate the whole configured runtime root but may not vary these relative logical coordinates without a new contract version.

## Safe Open

Before mutation, the adapter must:

- require an explicit bounded root path;
- reject empty, broad, root, home, or canonical-source targets;
- resolve lexical and physical confinement;
- reject traversal, symlinks, aliases, special files, and unsafe nested entries;
- reject runtime/source overlap in either direction;
- verify required directories remain physically the same around critical operations;
- reject accessor-backed or custom-prototype configuration before path access;
- normalize public errors without disclosing physical paths.

Read-only open distinguishes `uninitialized`, `initialized-empty`, non-empty initialized, incomplete genesis initialization, and corruption. It never manufactures genesis in a read path. Explicit create is the only operation that may initialize an uninitialized root, and it must acquire the cooperative writer lock before writing genesis staging material.

Node.js does not provide portable descriptor-relative traversal equivalent to all `openat(2)` protections. The adapter must document and test its best-effort no-follow leaf access and directory-identity rechecks without claiming hostile privileged-filesystem safety.

## Genesis Initialization Protocol (`M15-GENESIS-001`)

Create performs this exact sequence under the cooperative writer lock:

1. repeat safe-open confinement and prove no active or installed FounderOS ledger component exists;
2. construct and independently recompute the exact genesis complete-history commitment, genesis head, and genesis marker from `M15-COMMIT-001`;
3. use reserved `markerId = "m15-genesis"` and `markerGeneration = 0` without time, randomness, process, or filesystem input;
4. write and synchronize the complete genesis archive plus a byte-identical temporary fixed-marker copy in staging;
5. atomically install the immutable genesis archive at the deterministic genesis location;
6. atomically replace `commit-head.json` with the temporary fixed-marker copy; this is the sole genesis visibility boundary;
7. synchronize the marker directory where supported;
8. verify archive/current-marker byte equality and independently recompute genesis history, head, marker, and fingerprints;
9. optionally publish the byte-identical derived `HEAD` projection after authority verifies;
10. release the writer lock.

Fault behavior is deterministic:

| Genesis interruption | Visible authority | Classification | Permitted recovery |
| --- | --- | --- | --- |
| before staging | none | uninitialized | a later explicit create may start |
| during staging | none | incomplete genesis staging | read-only open reports failure; a later locked create may discard only verified staging orphans and restart |
| after archived genesis installation but before fixed-marker installation | none | incomplete genesis installation | read-only open reports failure; a later locked create may install only byte-identical independently recomputed canonical genesis or fail closed |
| after fixed-marker installation | complete genesis only if archive/current bytes and all commitments verify | initialized empty or corrupt genesis | return the exact genesis head, or fail closed without repair |

An archived genesis marker alone never becomes authority. A fixed genesis marker without its byte-identical archive is corruption. Event data, generation `1`, or a non-genesis marker cannot coexist with an uninitialized or initialized-empty classification. Concurrent create operations produce exactly one complete genesis state; the loser observes the verified initialized ledger and performs no mutation.

## Cooperative Writer Lock

- Exactly one explicit local writer lock protects mutation.
- Lock metadata uses logical process evidence and bounded timestamps without becoming ledger authority.
- A writer rechecks storage safety, recovery, integrity, and expected head after acquiring the lock.
- Lock acquisition never overrides an existing lock automatically.
- Abnormal termination may require explicit operator cleanup.
- No time threshold permits automatic lock stealing. A stale or abandoned lock blocks mutation with `operator-cleanup-required`.
- Read-only recovery and integrity verification may proceed while a stale lock exists, but must not delete the lock, quarantine or rebuild state, or perform any mutation. Operator cleanup is permitted only after independently verifying that no writer is active; cleanup removes only the cooperative lock and never alters authoritative records.
- The lock is cooperative and does not protect against a malicious privileged process.

## Commit Protocol

For registration or replay append:

1. Validate and capture all public inputs before filesystem mutation.
2. Acquire the cooperative writer lock.
3. Revalidate physical directory identity and safe entries.
4. Recover and verify marker-bounded authoritative history, including the complete genesis commitment.
5. Compare the exact expected-head fingerprint.
6. Revalidate idempotency and identity conflicts under the lock.
7. Construct one complete immutable event envelope and audit entry.
8. Canonically serialize and fingerprint every authoritative record.
9. Write the complete event to a unique file or directory within staging.
10. Synchronize staged files and directories where supported.
11. Atomically rename the complete event into its deterministic immutable authoritative location on the same filesystem.
12. Synchronize the authoritative event directory where supported.
13. Construct the canonical commit marker last; write and synchronize its immutable event-local archive and a byte-identical temporary fixed current-marker copy.
14. Atomically replace the fixed current marker with that temporary copy.
15. Synchronize the marker directory where supported.
16. Optionally update a derived index after commitment.
17. Release the writer lock.

Commit occurs only at successful atomic fixed current-marker replacement. Installed events and archived marker candidates beyond the old current marker remain uncommitted until activated by the byte-identical fixed current-marker copy.

The atomically installed verified fixed current-marker copy is the sole authoritative visibility boundary (`M15-TXN-001`, `M15-TXN-002`). The canonical marker embeds the resulting ledger-head projection and fingerprint. Its immutable event-local archive preserves history and global marker-ID ownership but is not a second visibility boundary. Any separate `HEAD` file and every index are non-authoritative derived state.

Unsupported directory synchronization errors may be suppressed only when explicitly documented and platform classified. Other I/O failures propagate as stable failures.

## Expected-Head Compare-and-Swap

Every mutation supplies the head observed during preflight. A changed generation, any count, sequence, latest audit-entry ID/fingerprint, latest semantic-event ID/fingerprint, latest subject transaction ID/fingerprint, complete-history fingerprint, or ledger-head fingerprint rejects the write without advancing the marker.

No force, overwrite, implicit merge, or last-writer-wins behavior is permitted.

## Crash Semantics

- Crash before authoritative event installation leaves only staging data; recovery ignores or quarantines it.
- Crash after event installation but before marker replacement leaves an installed uncommitted orphan; the prior committed head remains authoritative.
- Crash after marker replacement requires the newly referenced complete event; absence or corruption fails recovery.
- Derived-index failure after commitment does not roll back authority; it is reported and rebuilt explicitly.
- Conflicting or ambiguous orphan state fails closed.

## Normative Fault-Point and Lock Matrix (`M15-FS-001`)

This is the sole normative publication-fault matrix for both original registration and replay append. “Old head” and “new head” mean complete marker-bounded authoritative prefixes. Deterministic fault injection must recover exactly one of them, never partial authority.

| Fault point | Lock state | Authoritative files visible | Is committed? | Recovery classification | Automatic action | Operator action | Head/index behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Before staging | absent | old marked prefix | no new commit | clean old head | none | none | derived state remains bound to old head |
| 2. Attempted staging before lock acquisition | absent | old marked prefix; no files created by this operation | no | prohibited/unreachable operation state | reject before filesystem mutation; pre-existing staging is classified read-only only | no quarantine until a later lock is acquired and recovery, integrity, and expected-head checks pass | old head; index unchanged |
| 3. Before lock acquisition | absent or held by another writer | old marked prefix | no | clean or lock unavailable | return `lock-unavailable` if actively held | none | old head |
| 4. After lock acquisition, before integrity verification | held | old prefix | no | unverified locked state | release lock on handled failure | cleanup only after inactive-writer proof | no derived publication |
| 5. After integrity verification, before expected-head validation | held | verified old prefix | no | verified old head | release on failure | none | old head |
| 6. After expected-head validation, before ownership preparation | held | verified old prefix | no | verified old head | release on failure | none | old head |
| 7. After ownership preparation in staging | held | old prefix; staged components | no | staging orphan after interruption | later locked recovery may quarantine | cleanup only if ambiguous | old head |
| 8. After transaction component installation, before audit component installation | held | old prefix; unmarked transaction component | no | installed-uncommitted orphan | ignore as authority; later verified quarantine | required if ambiguous/conflicting | old head |
| 9. After audit component installation, before marker archive/current-copy preparation | held | old prefix; unmarked transaction and audit components | no | installed-uncommitted orphan | ignore as authority; later verified quarantine | required if ambiguous/conflicting | old head |
| 10. During archived-marker or temporary current-marker write/synchronization | held | old current marker; archived candidate or temporary current copy may exist | no unless atomic fixed-marker replacement completed | marker candidate/temporary orphan or case 11 | discard verified temporary only on later locked write; archived candidate remains an uncommitted orphan | required if ambiguous | old head unless fixed current marker verifies |
| 11. After atomic fixed current-marker installation | held | new complete marker-bounded prefix with byte-identical archived marker | yes | committed new head | verify new prefix and archive/current-marker equality | repair no authority automatically | marker-embedded new head is authority |
| 12. After marker installation, before derived `HEAD` publication | held | new committed prefix; stale/missing derived `HEAD` | yes | valid authority, derived state missing/stale | report derived state; explicit rebuild only | none normally | rebuild `HEAD` from verified markers |
| 13. During derived-index publication | held | new committed prefix; temporary/stale index | yes | valid authority, derived index missing/invalid | report separately | none normally | discard/rebuild index explicitly |
| 14. After authoritative commit, before lock release | held or abandoned | new committed prefix | yes | committed head plus existing lock | read-only verification allowed; writes blocked | cleanup only after inactive-writer proof | new head remains authoritative |
| 15. During replay component staging | held | old prefix; staged replay components | no replay commit | replay staging orphan | ignore as authority; later verified quarantine | required if ambiguous | old head |
| 16. After replay component installation, before replay marker | held | old prefix; unmarked replay components | no replay commit | installed-uncommitted replay orphan | ignore as authority; later verified quarantine | required if ambiguous/conflicting | old head |
| 17. After replay fixed current-marker installation, before derived replay-index publication | held | new replay marker-bounded prefix with byte-identical archived marker | yes | committed replay; derived index missing/stale | report separately | none normally | rebuild index from verified markers |
| 18. Interruption while lock exists | abandoned until proven otherwise | old or new complete marked prefix | determined solely by verified marker | stale-lock state plus verified prefix | no lock stealing; read-only integrity allowed | verify no active writer, then remove lock only | marker decides head; derived state separate |
| 19. Stale or abandoned lock on later write | stale or uncertain | verified marker-bounded prefix | unchanged | write blocked | return `operator-cleanup-required` | prove no active writer and remove only lock | no head/index mutation during cleanup |

Authoritative corruption is never silently rebuilt. Unmarked installed components are never inferred committed. Missing derived `HEAD` or index state after marker installation cannot roll back a commit.

## Immutable Names and Records

Authoritative event locations derive from explicit ledger sequence and immutable logical identity. Existing authoritative files are opened no-follow and never edited in place. Conflicting reuse fails.

## Derived Indexes

Derived indexes are written outside authoritative event directories, bind the exact head fingerprint, and may be atomically replaced. Reads must not trust them without verification. They may be deleted and rebuilt only through an explicit governed operation.

## Resource Limits

The adapter must bound before mutation:

- path and identifier lengths;
- event and canonical JSON byte sizes;
- nesting depth and collection counts;
- number of discovered entries;
- replay listing and index sizes;
- staging and quarantine operations.

## Explicit Limitations

The adapter provides:

- single-machine persistence;
- same-filesystem atomic rename assumptions;
- cooperative single-writer locking;
- restart recovery for accidental interruption and corruption detection.

It does not provide:

- hostile privileged-filesystem protection;
- distributed locks or consensus;
- multi-writer database transactions;
- network-filesystem guarantees;
- replication or remote durability;
- coordinated rollback protection;
- automatic lock cleanup after abnormal termination.

## Principle

The local adapter proves durable non-executing readiness evidence without choosing the permanent storage technology or enabling provider transport.
