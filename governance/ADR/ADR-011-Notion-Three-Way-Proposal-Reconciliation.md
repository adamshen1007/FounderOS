# ADR-011 — Notion Three-Way Proposal Reconciliation

## Status

Accepted for implementation after RFC-006

## Context

ADR-007 keeps Markdown and Git canonical and makes Notion a private derived
review surface. Its manual-only return path prevents Notion from becoming a
second source of truth, but it cannot reliably distinguish a Notion edit from
a concurrent local edit or preserve both when reviewers and authors work at
the same time.

RFC-006 accepts proposal-only Notion reconciliation after the Beta Gate. This
decision defines that reconciliation without granting Notion direct mutation
authority.

## Decision

### Export Identity and Immutable Base

Each Beta Gate export creates an immutable, content-addressed export base. It
contains:

- Project, beta, export, schema, and converter versions
- Canonical source paths and content hashes
- A normalized abstract syntax tree for every exported document
- Stable section and block IDs that persist across compatible exports
- The mapping to Notion page and block IDs
- Notion revision IDs or equivalent observed revision evidence
- Export timestamps, parent export ID, and lifecycle version
- A report of omitted, unsupported, or lossy conversions

Stable section and block IDs identify semantic units independently of text
position and Notion's private identifiers. New content receives new IDs;
deletion does not recycle an ID. Splits, joins, and moves record predecessor or
parent relationships where deterministic identity cannot be preserved.

The normalized abstract syntax tree is produced by a versioned, deterministic
converter. It normalizes semantically equivalent formatting while retaining
meaningful text, structure, ordering, links, annotations, and supported
comments. The export base is never updated in place. A later export creates a
new base and lineage.

The bridge reads a consistent Notion snapshot. It records revision evidence
before and after retrieval and rejects or retries the import if the page
changes during that interval. Private Notion identifiers and credentials remain
in ignored local state; the immutable audit export contains only the minimum
identifiers needed for reconciliation.

### Three-Way Comparison

Import converts the current Notion representation into the same normalized
tree, then compares:

1. The immutable export base
2. Current canonical Markdown
3. The consistently read Notion snapshot

Comparison is by stable identity and normalized semantics, not line number or
Notion block position alone. It detects edits, deletions, additions, moves,
splits, joins, formatting changes, and supported comments.

A change present only in Notion becomes a proposal. A change present only in
Markdown remains canonical and does not become a reverse Notion mutation. The
same normalized change on both sides is already resolved. Incompatible changes
to the same semantic unit become an explicit conflict. Ambiguous identity,
converter-version incompatibility, or missing revision evidence also fails
closed as a conflict or blocked import.

Every imported change becomes an individual, immutable proposal at the
smallest safe semantic unit. Each proposal records:

- Proposal type and stable affected IDs
- Export-base, current-Markdown, and current-Notion values and hashes
- Source path, parent and ordering context, and converter versions
- Notion page, block, and revision evidence
- Author or reviewer identity when the connector supplies it
- Import run and idempotency identities
- Conflict, dependency, and unsupported-content status
- Decision, rationale, actor, timestamps, and resulting canonical hash

Comments are review proposals or evidence attached to a proposal; they never
become publication text automatically. Proposal dependencies make structural
changes, such as a parent deletion and child edits, reviewable without unsafe
application order. Reimporting the same revisions and hashes returns the
existing proposals instead of duplicating them.

### Unsupported Blocks and Conflicts

Every export and import produces a conversion report. Unsupported or lossy
Notion blocks retain their page, block, type, position, revision evidence, and
a sanitized preview or hash when safe. They are never silently dropped or
flattened into canonical prose.

An unsupported block that could affect meaning is blocking until a human
excludes it, converts it manually, or a compatible converter handles it. The
original Notion content remains untouched. Malformed, oversized, inaccessible,
or permission-denied blocks produce visible, bounded failures.

A conflict preserves the export base, current Markdown, and current Notion
versions. The creator may revise the proposal into an explicit resolution,
reject it, defer it, or produce a new beta export after resolving canonical
content. The bridge never chooses a side by timestamp, last writer, provider
output, or Notion revision order.

### Human Decision and Authorized Mutation

The creator can accept, revise, reject, or defer each proposal. Acceptance and
revision bind the exact proposal hash, current canonical hash, lifecycle
version, actor, and intended normalized result. A stale hash, changed
dependency, unresolved blocking conflict, or failed policy check prevents
application.

Only the authorized local mutation service from ADR-008 may apply an accepted
proposal. It revalidates the decision and expected hashes under the
per-project writer lock, writes through the durable journal, runs canonical
validators, and records the immutable audit result. A Notion webhook,
connector, provider, browser, or import worker cannot write Markdown directly
or approve a lifecycle gate.

Acceptance does not mutate Notion automatically. A later explicit export may
update the derived review surface from canonical Markdown and creates a new
immutable base. Failed, rejected, deferred, and superseded proposals remain in
decision history.

### Amendment to ADR-007

This ADR supersedes only ADR-007's manual-only return path after RFC-006 and
this ADR's implementation acceptance criteria pass. The following part of
ADR-007:

> Use Review Findings as the return path. A Notion suggestion becomes effective
> only after a human accepts it, changes Markdown, runs quality checks, and
> resyncs the derived page. Do not implement automatic two-way reconciliation.

is replaced by:

> A Notion change returns as an individually reviewable proposal produced by an
> immutable-base, normalized-AST three-way comparison. It becomes effective
> only after a human accepts or revises it and the authorized local mutation
> service validates and applies the exact proposal to current Markdown.

ADR-007 remains active in every other respect. Markdown is the only canonical
publication source, Notion remains private and derived, Notion identifiers
remain local, and Notion outages cannot block local authoring or publishing.
This is proposal reconciliation, not automatic two-way authority.

Until the implementation acceptance criteria pass, ADR-007's existing manual
return path remains the operational rule.

## Implementation Acceptance Criteria

- Fixtures prove stable identity across unchanged, edited, moved, added,
  deleted, split, and joined content.
- Converter fixtures prove deterministic normalized output and report every
  unsupported or lossy block.
- Three-way fixtures cover Notion-only changes, Markdown-only changes, equal
  changes, incompatible changes, comments, reorderings, and deletions.
- Concurrent Notion revisions, stale canonical hashes, duplicate imports, and
  stale decisions fail closed without data loss or duplicate proposals.
- Accepted proposals can be applied only through ADR-008's authorized mutation
  and recovery protocol.
- Audit fixtures preserve all three versions, human decisions, application
  results, and superseded proposals.
- End-to-end tests show that rejected, deferred, conflicted, unsupported, or
  unapproved content cannot change Markdown.

## Consequences

- Reviewers can work in Notion while Markdown remains the only publication
  authority.
- Concurrent edits become explicit proposals or conflicts instead of
  last-writer-wins overwrites.
- Immutable bases and normalized conversion make reconciliation reproducible
  and auditable.
- Stable IDs and converter migrations add metadata and testing complexity.
- Unsupported Notion features require visible manual handling.

## Rejected Alternatives

### Last-Writer-Wins Synchronization

Rejected. Revision order cannot establish editorial intent and would discard
one side of a concurrent change.

### Direct Notion-to-Markdown Writes

Rejected. They would bypass human proposal decisions, lifecycle guards,
expected hashes, canonical validators, and mutation recovery.

### Line-Based Comparison

Rejected. Notion blocks and Markdown lines do not share stable positions, and
format-only changes would create noisy or unsafe merges.
