# ADR-009 — Lifecycle and Durable Workflow

## Status

Accepted

## Context

Research-to-book production contains human approval boundaries, granular
editorial decisions, long-running provider work, and recoverable local
mutations. If modules own independent status fields, they can disagree about
whether expensive work, export, or publication is allowed. If jobs exist only
in process memory, a restart can lose attempts, repeat side effects, or leave
canonical state and the interface out of sync.

RFC-006 establishes exactly three human approval gates. The workflow
architecture must enforce those gates while making concurrency, retries,
cancellation, budgets, and recovery observable and deterministic.

## Decision

### One Guarded Lifecycle

Each Book Project uses one versioned, guarded lifecycle state machine. Its
append-only transition history records:

- The project and lifecycle version
- The prior and requested states
- The actor and reason
- The caller's expected version
- Guard and policy results
- The resulting version and timestamp

Every transition command supplies the expected lifecycle version. A stale
version fails with a conflict and does not mutate lifecycle or canonical state.
Guards fail closed when required policy results, approvals, or records are
missing. State-machine definitions are versioned; changing states, guards, or
transition meaning requires an explicit migration.

The lifecycle proceeds through:

1. Brief and Blueprint Gate
2. Evidence collection
3. Book architecture
4. Composition
5. Visual enrichment
6. Quality review and Beta Gate
7. Notion beta
8. Proposal reconciliation
9. Release preparation and Publish Gate
10. Distribution and verification

The only lifecycle approval gates are:

1. **Blueprint Gate:** a human approves the brief, research plan, source
   policy, book architecture, budgets, and provider-egress policy before
   expensive work.
2. **Beta Gate:** a human approves a complete beta before export to Notion.
3. **Publish Gate:** a human explicitly performs the Publish action after all
   blocking proposals and quality policies pass.

Source, claim, chapter, visual, proposal, and Editorial Memory decisions are
granular review decisions within lifecycle stages. They may satisfy or block a
guard, but they do not create additional lifecycle gates. No agent, provider,
connector, or adapter may record or bypass a gate approval.

### Durable Run and Attempt Contract

SQLite stores the durable job ledger. A workflow is represented by a stable run
ID and durable stage and attempt records. Every run and stage attempt records:

- Run, stage, and attempt IDs
- Parent and retry lineage
- Input fingerprint and idempotency key
- Provider, model, prompt, and capability versions when applicable
- Status, timestamps, progress, and verification result
- Retry classification and attempt limit
- Checkpoint and recovery action
- Sanitized error and user-visible message

The idempotency key identifies the logical operation, while an attempt ID
identifies one execution. Repeating a submission with the same key must return
or resume the existing logical operation rather than duplicate records or
side effects. A retry creates a new attempt linked to its predecessor and
preserves the run and stage lineage.

Failures use these explicit retry classes:

- `retryable`: the recorded policy permits another bounded attempt.
- `blocked-awaiting-action`: work may resume only after the stated user or
  policy action.
- `cancelled`: no automatic retry; a new explicit command is required.
- `terminal`: the stage cannot retry without changed inputs, configuration, or
  implementation.

Attempt limits and retry policy are recorded before execution. Retries and
restarts revalidate input fingerprints, expected versions, lifecycle guards,
budgets, and idempotency before any side effect.

### Cancellation and Recovery

Cancellation is a durable requested transition, not only an in-memory signal.
Workers checkpoint at safe boundaries, stop scheduling new side effects, and
record whether the active attempt reached `cancelled` or needs recovery.

Workers maintain durable progress and ownership timestamps. On startup and
during reconciliation, an expired ownership record marks an unfinished
operation `stale`. Recovery then resumes from a verified checkpoint, creates a
linked retry attempt, moves to a blocked or terminal outcome, or compensates an
idempotent side effect. Crash and stale-job recovery must not duplicate records
or corrupt canonical state.

### Resource Budgets

Each project declares budgets bounded by safe application ceilings for:

- Source count and per-source bytes
- Total project and temporary storage
- Transcript duration and extracted text
- Context and output tokens
- Per-run and per-project model cost
- Concurrent jobs and provider request rate
- Stage and request timeouts

The Creator Studio shows an estimate before expensive execution. Workers check
budgets before dispatch and at durable checkpoints. Reaching a limit pauses
cleanly as blocked work with the exceeded budget and available next action
recorded; it must not silently exceed a ceiling.

### User-Visible Operation States

Every long-running operation exposes the same state vocabulary:

- `idle`
- `queued`
- `running`
- `partial`
- `blocked`
- `failed-retryable`
- `failed-terminal`
- `stale`
- `conflict`
- `cancelled`
- `succeeded`

Each state includes a clear next action. Interfaces must also define loading,
empty, offline, permission, stale-data, and recovery behavior. The
user-visible state is derived from the durable run and attempt records; it is
not a separate authority. Idempotency keys reject double submission, and
expected versions reject stale-tab actions.

## Consequences

- One transition history determines whether work, export, or publication is
  allowed.
- Human approval remains mandatory at the three accepted gates, while granular
  review can evolve without redefining the lifecycle.
- Restarts, retries, and cancellations remain inspectable and recoverable.
- Durable records and idempotency add storage, reconciliation, and test
  requirements.
- A consistent operation vocabulary gives every screen the same recovery
  semantics.

## Rejected Alternatives

### Module-Owned Status Fields

Rejected. Independent research, chapter, review, and release statuses can
contradict one another and permit a module to bypass lifecycle guards.

### In-Memory-Only Jobs

Rejected. Process memory cannot preserve attempt lineage, checkpoints,
idempotency, cancellation, or recovery after a crash.
