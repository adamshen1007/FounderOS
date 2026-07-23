# ADR-012 — Immutable Releases and Ghost Adapter

## Status

Accepted subject to Ghost capability spike

## Context

RFC-006 accepts a local-first research-to-book product whose approved releases
cross a bounded publishing boundary. It selects Ghost as the first hosted
subscriber-library adapter, but only after an early capability spike. The
reviewed design also requires immutable release bundles, protected downloads,
one activation pointer, safe rollback, and a sidecar or object-storage fallback
for capabilities Ghost cannot prove.

ADR-001 keeps canonical Markdown authoritative and generated outputs derived.
ADR-009 requires durable runs, stable idempotency keys, an outbox before remote
side effects, and reconciliation before retrying an uncertain operation. This
decision applies those rules to release storage and activation without treating
Ghost, object storage, or subscriber state as canonical publication content.

## Decision

### Immutable Release Identity and Manifest

Every prepared release receives a globally unique, stable release ID before
staging. A release ID is never reused, even after an upload fails, a release is
unpublished, or retained artifacts are deleted. An edition correction creates
a new release ID and bundle; no artifact or manifest is replaced in place.

Each release has one immutable, versioned manifest. The manifest binds:

- Project, edition, release, schema, and parent-release IDs
- Canonical Git revision and normalized source-snapshot hash
- Ordered artifact paths, media types, byte sizes, and SHA-256 checksums
- HTML, PDF, and EPUB format and validator-profile versions
- Renderer, template, policy, configuration, and dependency-lock hashes
- Rights, accessibility, citation, link, and release-integrity results
- Publish approval, lifecycle version, build run, and creation evidence

The manifest itself receives a SHA-256 checksum. An implementation may add a
signature, but a signature cannot replace the required artifact and manifest
checksums. The local immutable manifest is the comparison authority for remote
reconciliation. Hosted destination identities and verified checksums belong in
separate immutable staging evidence linked to the manifest checksum. Hosted
metadata is never trusted as proof of artifact content.

Release content consists only of allowlisted, approved artifacts and the
minimum publication metadata declared by the manifest. Drafts, research,
evidence, rejected proposals, Editorial Memory, credentials, local database
records, and subscriber data cannot enter the bundle.

### Disk-Backed Preparation and Streaming

Preparation uses a clean, bounded, disk-backed staging directory dedicated to
one release ID. The renderer and adapter must not retain the complete
manuscript, bundle, or large artifact set in application memory. Source reads,
checksum calculation, artifact validation, and transfer use bounded buffers or
streams. Temporary paths remain inside an approved staging root, reject links
and traversal, and are cleaned or quarantined according to the recorded
failure outcome.

All required formats must be generated from the same source snapshot. The
release stays local and inactive if any artifact is missing, empty, stale,
outside the staging root, fails its format-specific validator, or has a
checksum mismatch.

### Hosted-Library Adapter Contract

The hosted-library adapter exposes versioned operations for:

- Capability discovery and compatibility proof
- Idempotent release staging or authoritative stage reconciliation
- Hosted artifact, metadata, and access-control verification
- One guarded active-release pointer read and compare-and-set
- Rollback to a retained verified release
- Unpublish and access revocation
- Protected HTML access and short-lived binary download grants
- Remote release deletion under retention policy
- Audit and webhook reconciliation where the provider supports them

Only a release with a current human Publish approval may cross the hosted
boundary. Every remote mutation follows ADR-009. The worker commits an outbox
record before dispatch, propagates a stable scoped idempotency key when
supported, and records the remote identity and reconciled result. If Ghost or a
fallback cannot provide idempotent mutation or authoritative reconciliation,
an uncertain side effect becomes `blocked-awaiting-action`; it is not repeated
automatically.

Compensation is explicit, bounded, and idempotent. It may remove an incomplete
staging release, revoke grants, or restore the expected pointer, but it must
never delete or overwrite the previously active release. A failed compensation
is durable blocked work with a creator-visible next action.

### Activation, Rollback, and Unpublish

There is exactly one mutable active-release pointer per published book
destination. Activation is one guarded compare-and-set after:

1. The local release candidate passes every required validator and receives a
   stable input fingerprint.
2. The human Publish action and lifecycle guards approve that exact candidate
   fingerprint.
3. The immutable manifest binds that approval and passes its checksum check.
4. Every remote artifact matches its manifest checksum.
5. Hosted visibility, subscriber authorization, and download controls pass.
6. The current pointer still matches the caller's expected value.

The pointer change and its expected and resulting values are append-only audit
evidence. Uploading or staging content does not activate it. A failed upload,
verification, access check, or pointer change leaves the previous pointer
active.

Rollback verifies a retained prior release against its immutable manifest, then
performs the same guarded pointer change. It does not rebuild, edit, or copy the
prior bundle. Unpublish clears or disables the active pointer and revokes new
access without rewriting release content. Existing sessions and download
grants are revoked as policy requires. Re-publishing uses a retained verified
release or a new release ID; it never reconstructs identity from mutable hosted
state.

### Content, Access, and Retention Separation

Immutable release content and mutable operational or privacy records use
separate schemas and storage authority:

- Release bundles, manifests, and their checksums are immutable while retained.
- The active pointer, visibility, allowlists, sessions, grants, subscriber
  records, and access decisions are mutable and must not be embedded in a
  release manifest as current state.
- Subscriber identity is not required to verify release integrity and cannot
  enter release artifacts, checksums, or general release logs.

Retention is policy-driven per store. It covers active and superseded releases,
failed staging content, temporary files, subscriber records, access logs,
download grants, audit evidence, backups, legal holds, and provider copies. A
release under retention cannot be mutated. When policy authorizes destructive
removal, the system deletes the complete unreferenced bundle rather than
editing it and preserves only a minimal, non-content tombstone with release ID,
manifest checksum, deletion decision, time, and applicable exception.

A legal hold pauses deletion only for covered records. Privacy deletion,
irreversible redaction, or release garbage collection resumes when the hold is
released under the applicable schedule. Provider deletion requests and their
outcomes are recorded without claiming physical erasure that cannot be proved.

Protected PDF and EPUB downloads require current server-side authorization and
short-lived, audience-bound grants. Permanent public artifact URLs, public
buckets, directory listing, and complete signed URLs in logs are prohibited.

### Ghost Capability Spike

Ghost remains a candidate adapter until a time-boxed spike proves the required
capabilities in an isolated staging environment. The spike records the Ghost
version, API and plan, configuration, limits, observed behavior, sanitized
fixtures, and repeatable commands for this matrix:

| Capability | Required proof |
| --- | --- |
| Invitations and allowlist | Only an allowlisted email can complete the invitation and gain access; enumeration-safe failure is visible |
| Password-free access | Token expiry, replay denial, session rotation, revocation, and provider-outage behavior fail closed |
| Protected HTML | Server-side authorization protects every page and cache behavior cannot cross subscribers |
| Binary downloads | PDF and EPUB require short-lived authorization; revoked, expired, replayed, and copied grants are denied as designed |
| Search | Results contain only releases visible to the current subscriber and do not disclose private metadata |
| Staging | A release ID can be uploaded and verified without becoming active or overwriting another release |
| Activation | One guarded operation changes the active release or provides an authoritative primitive for the adapter to do so |
| Rollback and unpublish | A retained prior release can be restored and current access can be revoked without rebuilding content |
| API limits and failures | Rate limits, payload ceilings, partial uploads, timeouts, retries, and uncertain outcomes have bounded recovery |
| Webhooks and reconciliation | Events are authenticated and deduplicated where available; authoritative reads detect drift without trusting event bodies |

Each row receives `pass`, `fallback-required`, or `fail` with evidence. A pass
requires both the successful path and its denial or failure cases. An
unavailable webhook may be `fallback-required` when polling supplies bounded,
authoritative reconciliation. A security invariant, protected-access
requirement, or safe activation requirement cannot be waived.

No production Ghost adapter is accepted until every required row passes either
through Ghost or through a documented fallback behind the same adapter
contract.

### Sidecar and Object-Storage Fallback

The approved fallback boundary is a minimal sidecar and private object storage,
used only for capabilities the spike marks `fallback-required`. Ghost may
provide membership and protected HTML while the sidecar authorizes binary
downloads, maintains the active pointer, or supplies reconciliation. The
fallback must:

- Implement the same release IDs, manifests, adapter operations, and audit
  contract
- Use private storage, least-privilege identities, short-lived grants, and
  server-side authorization
- Receive only manifest-allowlisted release data and minimum subscriber state
- Preserve staging, verification, activation, rollback, unpublish, retention,
  deletion, and idempotent recovery semantics
- Be selected explicitly from spike evidence rather than as a silent runtime
  downgrade

Adding a broader hosted application, a second publication authority, or a
general cloud workspace is outside this decision and requires governance
review.

## Implementation Acceptance Criteria

- Contract tests prove release IDs and manifest payloads cannot be reused or
  mutated and detect every artifact or manifest checksum mismatch.
- Large-fixture tests enforce bounded-memory, disk-backed rendering, checksum,
  and transfer behavior.
- Multi-format failure tests keep the complete release inactive and preserve
  the previous pointer.
- Duplicate, interrupted, timed-out, and uncertain remote operations prove
  idempotent resume, authoritative reconciliation, or safe manual blocking.
- Activation, rollback, and unpublish tests cover stale pointers, two
  concurrent operators, partial uploads, access-check failures, and crashes at
  every durable boundary.
- Authorization tests deny non-allowlisted, revoked, expired, replayed, and
  cross-subscriber HTML and download access.
- Retention tests distinguish immutable content from mutable privacy records
  and cover legal hold, destructive deletion, garbage collection, and
  tombstones.
- The Ghost spike matrix and selected fallback architecture are recorded before
  a production Ghost implementation is accepted.

## Consequences

- A failed publication or rollback cannot silently replace the last verified
  active edition.
- Checksummed immutable bundles make local and hosted state independently
  verifiable.
- Subscriber privacy operations can proceed without rewriting publication
  content.
- Disk-backed streaming supports books larger than the application's memory
  budget.
- Ghost integration remains conditional and may require a narrowly scoped
  sidecar and object-storage deployment.
- Retained prior releases and durable audit evidence require explicit storage
  and deletion budgets.

## Rejected Alternatives

### Treat Ghost as the Release Authority

Rejected. Ghost content and metadata are mutable hosted state and cannot
replace canonical Markdown, Git, or the local immutable manifest.

### Overwrite the Current Edition

Rejected. In-place replacement prevents reliable verification, rollback,
concurrent activation control, and incident reconstruction.

### Permanent Public Download URLs

Rejected. A reusable URL bypasses current subscriber authorization, revocation,
and private retention controls.

### Keep Complete Bundles in Process Memory

Rejected. Memory-backed publication scales with book size and makes resource
exhaustion and crash recovery harder to bound.
