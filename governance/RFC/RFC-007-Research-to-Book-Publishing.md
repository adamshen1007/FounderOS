# RFC-007 — Research-to-Book Publishing

<!-- cspell:words WCAG -->

## Status

Accepted for Increment 1 implementation

## Summary

FounderOS publishes canonical Markdown as validated HTML, PDF, and EPUB 3.
DOCX is removed from the research-to-book release contract. Increment 1 must
generalize the existing pipeline, migrate the YC Playbook through a semantic
oracle, select and pin the required validators, use safe disk-backed staging,
and complete the Ghost capability spike.

This RFC also fixes the release, activation, rollback, unpublish, retention,
and failure contracts that Increment 3 subscriber delivery must implement.
Defining those contracts now does not represent Ghost compatibility as proven
or authorize production hosted delivery before ADR-012's spike criteria pass.

## Evidence, Assumptions, and Scope

ADR-001 proves a local, repeatable Markdown pipeline for standalone HTML, EPUB
3, and DOCX. RFC-006 accepts the research-to-book pivot and replaces DOCX with
PDF. The reviewed design requires all three new outputs from one source
snapshot, output-specific validation, a YC semantic migration report,
checksummed immutable release manifests, one activation pointer, protected
downloads, and preservation of the prior active release on failure.

The exact PDF accessibility profile is not yet selected by the reviewed
records. This RFC therefore makes a named, versioned profile and its pinned
validation procedure a blocking Increment 1 implementation prerequisite. No
claim of PDF accessibility conformance may be made until that profile's
automated and manual acceptance evidence passes.

Increment 1 covers local publishing foundation, YC migration, and the Ghost
spike. Subscriber staging, activation, rollback, unpublish, and retention
controls are contractually defined here but remain Increment 3 implementation
scope under RFC-006.

## Publishing Contract

### Authority and Common Build Input

Markdown and Git remain the authority for authored publication content.
Generated artifacts, build intermediates, release manifests, Ghost, and object
storage are derived and cannot write canonical content.

One build resolves an immutable source snapshot containing:

- Project and edition configuration
- Ordered Markdown documents and stable semantic IDs
- Publication metadata, references, worksheets, and approved assets
- Rendered visual inputs and accessibility text
- Rights, quality-policy, template, and toolchain versions

The build records the Git revision and normalized source-snapshot hash. HTML,
PDF, and EPUB must all derive from that same snapshot and content-addressed
dependency graph. A source or configuration change invalidates affected
outputs; an old artifact cannot be silently mixed into a new release.

Rendering uses a clean, bounded, disk-backed staging directory. Large inputs
and artifacts use bounded-buffer streaming for reads, checksum calculation,
validation, and later transfer. Renderers run without network or credentials,
use fixed argument arrays rather than shell interpolation, and may write only
inside approved staging and output roots.

### Required Output Set

Every successful research-to-book build produces:

1. Standalone, sanitized HTML
2. A PDF meeting the selected PDF profile
3. A valid EPUB 3 publication

DOCX is not a supported output, compatibility artifact, or release-manifest
entry. Its removal is an approved semantic difference in YC migration. A
consumer that still requires DOCX must use a separately governed conversion
outside this release contract.

Output filenames are deterministic from project configuration. Build
intermediates stay outside canonical source directories. A format succeeds
only when conversion and all validators for that output pass.

### HTML Profile

HTML targets WCAG 2.2 Level AA. The pinned HTML profile must check, at minimum:

- Valid document structure, language, title, landmarks, and heading hierarchy
- Keyboard-operable navigation, visible focus, skip navigation, and logical
  reading and tab order
- Text alternatives for meaningful images and appropriate decorative-image
  handling
- Table headers and associations, link purpose, labels, and accessible names
- Color contrast, reflow, zoom, spacing, and reduced-motion behavior
- Sanitized markup, safe URLs, content security policy, and no required active
  third-party content
- Internal links, external-link policy, metadata, and required book navigation

Automated checks are necessary but not sufficient. The release evidence must
also record the versioned manual review procedure, tested user-agent and
assistive-technology matrix, findings, approved exceptions, and remediation
status. An unresolved Level A or Level AA blocker fails HTML validation.

### EPUB Profile

EPUB output conforms to EPUB 3 and must pass a repository-pinned EPUBCheck
version and configuration. The EPUB profile also verifies:

- Required package metadata, language, unique identity, and navigation
- Ordered spine content, chapter hierarchy, links, anchors, and media types
- Embedded asset presence, checksums, and permitted remote-resource policy
- Accessibility metadata, semantic structure, text alternatives, tables, and
  reading order
- Absence of undeclared, unsafe, or unreachable content

Warnings are classified in a versioned policy. A warning cannot be ignored by
default or reclassified without a recorded policy change and regression
fixture. EPUBCheck success does not replace EPUB accessibility and content
tests.

### PDF Profile

Before PDF implementation begins, the Increment 1 plan must explicitly select:

- A named PDF accessibility and archival profile with a fixed version
- A renderer and pinned versions capable of producing that profile
- Pinned structural and profile validators with machine-readable results
- A versioned manual screen-reader and visual review procedure
- Supported font, language, metadata, link, and tagged-structure behavior
- Failure, waiver, and regression-fixture rules

The selected profile must be recorded in repository governance or an accepted
amendment to this RFC. Selecting only a renderer default or an unversioned
claim such as “accessible PDF” does not satisfy this prerequisite.

Regardless of the selected profile, pinned checks must verify:

- File signature, page count, successful pinned-parser reads, and absence of
  corruption
- Tagged document structure, logical reading order, headings, lists, tables,
  figures, alternative text, and document language
- Embedded or approved font substitution, font licensing, and missing-glyph
  detection
- Title, author, subject, keywords, profile, and creation metadata according to
  the reproducibility policy
- Internal and external links, bookmarks, destinations, and page references
- Page geometry, overflow, clipped content, image resolution, and visual
  regression samples

Any blocking structural, font, metadata, link, accessibility-profile, or
visual-review failure fails the PDF output.

### Pinning and Reproducibility

Renderer, sanitizer, validator, template, browser, font, and configuration
versions are pinned through repository-owned lock files or checksummed tool
manifests. CI and local commands use the same profiles. Upgrading a pinned tool
or policy requires compatibility fixtures and a recorded baseline comparison.

Reproducibility requires equivalent normalized content, deterministic
filenames and structure, stable source and configuration fingerprints, and
documented treatment of allowed timestamp or container metadata. Byte identity
is required only when the selected output profile declares it.

## Release Manifest

After all formats pass, the pipeline computes a stable release-candidate
fingerprint. A human Publish action approves that exact fingerprint and
lifecycle version. The pipeline then creates the immutable manifest required by
ADR-012 and binds the approval evidence. At minimum it records:

- Project, edition, release, schema, and parent-release IDs
- Git revision, source-snapshot hash, and ordered canonical input hashes
- Artifact paths, media types, bytes, and SHA-256 checksums
- Renderer, template, font, sanitizer, validator, profile, and policy versions
- Format-specific results and human-review evidence references
- Rights, citations, links, visual provenance, and quality-policy results
- Lifecycle version, Publish approval, build run, and creation evidence

Manifest creation fails when a required field or result is absent. The
manifest's SHA-256 checksum binds the bundle. Hosted identities and verified
remote checksums are appended to a separate immutable staging evidence record
or included when a final manifest representation can remain immutable; a
manifest already identified and checksummed is never edited in place.

Release content includes only manifest-allowlisted artifacts and minimum
publication metadata. Mutable subscriber, session, allowlist, visibility, and
active-pointer state stays outside the manifest and bundle.

## YC Semantic Migration Oracle

The existing YC Playbook is the Increment 1 migration oracle, not a fixed
product schema. Migration must remove volume-specific and 23-chapter discovery
assumptions while preserving:

- Normalized chapter text and order
- Heading hierarchy and stable semantic structure
- Citations and source relationships
- Worksheets and their chapter relationships
- Assets, diagrams, alternative text, and references
- Internal and approved external links
- Book, chapter, and publication metadata

Approved differences are project layout, generated markup, normalized
formatting that does not change meaning, and replacement of DOCX with PDF.
Every other difference is classified as intended and approved, remediated, or
blocking.

The migration produces a machine-readable report with stable semantic IDs,
base and migrated hashes, normalized values, difference categories, and
validator results. A human visual review compares representative and
risk-selected HTML, PDF, and EPUB views and records findings. Compatibility
cannot be claimed from filenames, artifact existence, or visual similarity
alone.

## Validation and Test Contract

Normal local and CI runs use deterministic fakes where an external system is
involved. Recorded, sanitized fixtures test adapter and renderer compatibility.
Opt-in staging tests use isolated Ghost resources only after credentials and
egress policy permit them.

Required shared tests cover:

- Schema validation, source-snapshot hashing, content-addressed invalidation,
  deterministic filenames, and clean staging
- Missing tools, disk exhaustion, permissions, symlinks, traversal, malformed
  content, process termination, and stale intermediates
- One format failing while two pass; the bundle remains inactive and no
  partial release is accepted
- Duplicate commands, stale lifecycle versions, cancellation, restart, and
  crash recovery at every durable checkpoint
- Artifact and manifest checksum mismatch before staging, after transfer, and
  before access

Required HTML tests cover semantics, sanitization, navigation, keyboard use,
WCAG 2.2 Level AA automated rules, links, responsive reflow, assistive
technology, and the manual review procedure.

Required PDF tests cover the selected profile, tagged structure, reading order,
fonts and glyphs, metadata, links and bookmarks, overflow, visual regression,
screen-reader review, and malformed or truncated files.

Required EPUB tests cover the pinned EPUBCheck profile, package and navigation
structure, reading order, metadata, links, assets, accessibility metadata,
text alternatives, and representative reader behavior.

YC oracle fixtures cover unchanged, intended-difference, reordered, missing,
duplicated, relinked, and metadata-drift cases. A deliberately introduced
semantic difference must fail the migration gate.

Hosted adapter contract and staging tests cover every ADR-012 capability row,
including denial cases, API limits, interrupted upload, uncertain response,
duplicate delivery, drift, stale pointer, rollback, unpublish, expired
credentials, revoked subscriber, and replayed download grant.

## Staging, Activation, and Failure Behavior

Release preparation is a dry run. It never changes hosted visibility. A
release may enter remote staging only after all local formats, validators,
rights checks, checksums, and manifest checks pass and a human completes the
Publish action against that exact release input and lifecycle version.

Remote staging streams content under a new release ID and verifies each hosted
artifact and access rule against the immutable local manifest. Staging is not
activation. The only activation mutation is ADR-012's guarded compare-and-set
of one active-release pointer after the human Publish action and repeated
lifecycle and policy checks.

All remote side effects use ADR-009's durable outbox, stable idempotency key,
attempt lineage, and reconciliation rules. A known retryable failure may resume
within its recorded limit. An uncertain side effect is reconciled before
retry; if safe replay cannot be proved, the operation becomes
`blocked-awaiting-action`.

Failure behavior is atomic at the release level:

- A prerequisite, conversion, or validator failure produces no staged release.
- A partial or mismatched upload remains inactive and is quarantined or handled
  through idempotent compensation.
- An access-control or hosted-verification failure blocks activation.
- A stale or failed pointer comparison leaves the prior release active.
- A compensation failure preserves evidence and becomes visible blocked work.
- A process crash resumes from a verified durable checkpoint and never infers
  success from an incomplete response.

Rollback verifies a retained prior manifest and changes only the guarded active
pointer. It does not rebuild or mutate that release. Unpublish disables the
pointer and revokes access without editing retained artifacts. Neither action
bypasses current rights, integrity, lifecycle, or incident-policy checks.

## Retention and Removal

Release bundles are immutable while retained. The retention schedule declares
per-store periods and actions for:

- Active, superseded, failed-staging, and unreferenced release content
- Local staging and temporary files
- Hosted copies, caches, backups, and deletion requests
- Release, activation, rollback, unpublish, access, and incident evidence
- Subscriber identity, allowlist, session, grant, and access records
- Rights expiry or revocation and legal holds

Mutable access and privacy data remains separate from immutable release
content. Privacy deletion or redaction must not require editing a release.
Rights withdrawal or unpublish revokes access first, then creates a corrected
release or destructively removes the complete affected bundle when policy
requires it.

Garbage collection cannot remove the active release, a rollback target still
required by policy, a referenced audit object, or held records. Authorized
destructive removal deletes the complete bundle and preserves only the minimal
non-content tombstone defined by ADR-012. Legal holds suspend only covered
deletion; the applicable deletion or redaction schedule resumes after release.

Protected binary downloads require current authorization and short-lived,
audience-bound access. Permanent public URLs are prohibited. Provider deletion
outcomes are evidence of requests and observed results, not proof of
unobservable physical erasure.

## Compatibility and Supersession

This RFC narrows ADR-001 as follows:

- Markdown authority, derived output directories, local and CI command parity,
  and repeatable project-owned quality gates remain active.
- PDF replaces DOCX for research-to-book releases.
- HTML and EPUB remain required, now under the profiles in this RFC.
- PDF production, local release manifests, and the Ghost capability spike move
  into Increment 1 scope.
- Production hosted delivery remains outside Increment 1 and enters only
  through RFC-006 Increment 3 and ADR-012's proven adapter.

ADR-001 remains part of the decision history. This RFC does not rewrite M1
release artifacts already produced under its accepted contract.

Ghost is the first adapter candidate, not a guaranteed implementation.
Production support requires the recorded capability matrix and selected
fallback architecture required by ADR-012. A missing capability cannot be
silently ignored or replaced by a broader hosted system.

## Increment 1 Acceptance Criteria

- A fresh clone discovers reusable Book Projects without fixed volume or
  chapter-count assumptions.
- The repository records the selected PDF accessibility profile and pins every
  required renderer and validator before PDF implementation begins.
- The same public local and CI command surface builds and validates HTML, PDF,
  and EPUB from one source snapshot.
- Output-specific tests and an integrated multi-format failure test pass.
- The YC migration machine report and human visual review preserve every
  required semantic dimension or record an approved difference.
- Release manifests and checksums are deterministic, complete, and fail closed
  on stale, missing, extra, or mismatched artifacts.
- Rendering, validation, checksum, and transfer fixtures demonstrate
  disk-backed, bounded-memory behavior.
- The Ghost spike records evidence for every ADR-012 matrix row and selects the
  sidecar or object-storage fallback where required.
- No production activation is represented as complete unless a later
  Increment 3 acceptance report proves staging, authorization, activation,
  rollback, unpublish, retention, and failure contracts.

## Consequences

- Research-to-book releases have one explicit required output set and no DOCX
  compatibility ambiguity.
- Accessibility becomes a versioned release target with automated and manual
  evidence rather than an unqualified renderer claim.
- One failed output prevents a partial edition from becoming a release.
- The YC Playbook can prove semantic migration while future books remain
  independent of its fixed structure.
- Defining hosted contracts before implementation reduces the risk of adapting
  release integrity to whatever Ghost happens to expose.
- Pinned validators, manual reviews, retained releases, and disk-backed staging
  add build time, storage, and operational work.

## Rejected Alternatives

### Keep DOCX and Add PDF

Rejected. RFC-006 accepts PDF as the research-to-book replacement for DOCX; a
fourth required format would preserve an unsupported compatibility burden.

### Treat Conversion Success as Validation

Rejected. A renderer can emit a corrupt, inaccessible, stale, or semantically
different artifact without returning an error.

### Accept Partial Multi-Format Releases

Rejected. Subscribers would receive an edition whose formats do not represent
the same approved source snapshot.

### Claim Ghost Compatibility Before the Spike

Rejected. Membership, protected access, download, staging, activation,
rollback, limit, and reconciliation behavior must be proved against isolated
resources first.
