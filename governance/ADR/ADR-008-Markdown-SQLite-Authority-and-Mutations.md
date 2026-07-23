# ADR-008 — Markdown, SQLite Authority, and Mutations

## Status

Accepted

## Context

The research-to-book Creator Studio combines portable authored content with
transactional workflow state. Markdown and Git must remain authoritative for
publication content, while jobs, proposals, locks, and checkpoints need durable
local transactions. Allowing either store to become an unbounded second source
of truth would make recovery, conflict handling, and releases unverifiable.

ADR-005 made the local interface read-only and allowed jobs to invoke existing
CLI workflows. RFC-006 now permits approved Creator Studio actions to make
canonical changes through a narrow local service. That change requires explicit
field ownership and a recoverable mutation protocol.

## Decision

### Authority Matrix

Each entity and field has exactly one authority. A new field must receive an
authority assignment before implementation.

| Data | Authority | Notes |
| --- | --- | --- |
| Manuscript, worksheets, citations | Markdown and Git | Human-readable source |
| Book and chapter configuration | Versioned Markdown/YAML | Portable project contract |
| Sources, evidence, claims, rights | Versioned local records | Git-trackable when safe |
| Jobs, attempts, locks, checkpoints | SQLite | Operational and transactional |
| Review proposals and decisions | SQLite plus immutable audit export | Linked to content hashes |
| Editorial Memory observations | SQLite | Approved rules exportable to Markdown |
| Search and FTS indexes | SQLite | Rebuildable derived state |
| Artifact dependency graph | SQLite | Rebuildable from manifests |
| Release bundle and manifest | Immutable files | Addressed by release ID and hash |
| Subscriber identity and sessions | Ghost | Minimum hosted operational state |

SQLite may store hashes, paths, summaries, and indexes that point to canonical
files. Those values are derived locators, not an alternate manuscript or
configuration authority. Search, FTS, and artifact dependency indexes must be
rebuildable from canonical files and manifests. Where the matrix requires an
immutable audit export, SQLite owns the active record and the export is its
append-only evidence copy, not a second mutable authority.

### Versioned Core-Record Envelope

Before first use, every `BookProject`, `BookBlueprint`, `Source`, `Evidence`,
`Claim`, `Contradiction`, `RightsRecord`, `ReviewProposal`,
`EditorialDecision`, `MemoryRule`, `WorkflowRun`, `WorkflowStageAttempt`,
`QualityFinding`, `Artifact`, and `ReleaseManifest` must have a versioned
schema.

Every core record includes:

- A stable ID
- `schema_version`
- Creation and update timestamps
- The actor or producer
- Validation rules

Content-bearing and derived records also include input and output hashes.
Schema changes require forward migrations, fixture coverage, and documented
rollback limits.

### Authorized Mutation Contract

The authorized local mutation service is the only path by which a Creator
Studio action may change canonical files. Before validating expected hashes,
it must atomically acquire an exclusive SQLite-backed mutation lease for the
Book Project. The lease identifies the owner and operation with a fencing
token. No two mutation commands may overlap the protected interval for one
project.

While holding the lease, each command performs this sequence:

1. Validate the command, actor, expected hashes, and lifecycle guard.
2. Calculate all Markdown and SQLite effects without writing.
3. Append the intended operation to a durable mutation journal.
4. Write temporary files and verify their hashes.
5. Atomically replace the canonical files.
6. Commit the corresponding SQLite state and immutable audit record.
7. Mark the journal operation complete.

The service releases the lease only after step 7. Lease ownership and the
fencing token must be verified at every durable commit boundary. The protected
interval therefore spans expected-hash validation, file replacement, the
SQLite commit, and journal completion as one serialized project mutation.

Canonical replacement must use same-filesystem temporary files so the final
replacement is atomic. Expected content hashes provide optimistic concurrency.
A stale expected hash must return a proposal conflict and preserve both
versions; it must never overwrite the current canonical file.

At startup, the mutation service inspects every incomplete journal entry. Using
the recorded intent, expected hashes, and observed file and database state, it
must deterministically complete the operation or roll it back. Recovery must be
idempotent, must preserve an audit trail, and must finish before new mutations
are accepted. An expired or abandoned lease is never simply stolen. Recovery
must first fence its prior owner, claim recovery ownership atomically, reconcile
the associated journal entry, and only then release the project for a new
mutation.

SQLite transactions cannot make filesystem writes atomic. The durable journal,
verified temporary files, atomic replacement, and startup recovery together
provide the cross-store recovery boundary. Best-effort dual writes are not
permitted.

### Amendment to ADR-005

ADR-005 is amended only at its write boundary. Its statement:

> The UI never writes canonical content directly; jobs invoke existing CLI
> workflows through a fixed allowlist.

is replaced by:

> The browser never writes canonical content directly. Approved Creator Studio
> actions invoke an authorized local mutation service through a fixed
> allowlist; that service is the sole writer for canonical local changes.

ADR-005 remains active in all other respects: the local application remains
dependency-light, indexes and summaries remain derived, and arbitrary external
execution remains deferred.

## Consequences

- Authored content stays portable, inspectable, and reproducible from Markdown
  and Git.
- Transactional state can use SQLite without making it a competing manuscript
  authority.
- Expected hashes reject stale tabs, concurrent edits, and proposal conflicts
  without data loss.
- Cross-store changes require journal management and startup recovery tests.
- Derived indexes can be discarded and rebuilt without changing canonical
  records.

## Rejected Alternatives

### Direct Browser Writes

Rejected. Browser filesystem writes would bypass the command allowlist,
validation, lifecycle guards, optimistic hashes, and recovery journal.

### Best-Effort Dual Writes

Rejected. Independently writing files and SQLite without a durable intent
record leaves ambiguous partial state after a crash.

### Database-First Manuscripts

Rejected. Making SQLite or a hosted system authoritative for manuscript prose
would conflict with the accepted Markdown and Git publishing model and weaken
portable, reviewable releases.
