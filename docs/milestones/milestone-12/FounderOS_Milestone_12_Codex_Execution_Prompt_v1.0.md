# FounderOS Milestone 12 Codex Execution Prompt v1.0

## Role and Mission

You are the lead engineer responsible for implementing **FounderOS Milestone 12 — Durable Context Delivery Ledger and Replay Registry Foundation**.

Your responsibility is to implement this milestone completely, preserve every Milestone 04–11 governance guarantee, verify restart safety and corruption resistance, prepare the work for review, and return a formal completion report.

Do not stop after analysis or planning.

Do not declare completion unless every required verification gate passes and the final whole-branch review contains no unresolved Critical, Important, or Minor findings.

This milestone must not invoke an LLM, reasoning provider, agent, Hermes runtime, MCP integration, or external service.

---

## 1. Repository Preparation

Before modifying any file:

1. Fetch the latest remote state.
2. Confirm Milestone 11 has been merged into the latest `main`.
3. Confirm the work is based on that merged state.
4. Create or switch to:

```bash
codex/milestone-12
```

5. Inspect:

```bash
git status
git branch --show-current
git log --oneline --decorate -15
git merge-base HEAD origin/main
git rev-parse origin/main
```

Preserve all legitimate work.

Do not:

- Reset unrelated changes
- Discard unrelated changes
- Rewrite unrelated history
- Amend another milestone's commit
- Move or delete user files
- Hide repository-state problems

If unrelated changes exist:

- Report them.
- Isolate Milestone 12 safely.
- Continue only when Milestone 12 changes can be kept separate.

Do not commit:

- `.DS_Store`
- iCloud duplicate or conflict files
- Local Delivery Ledger runtime data
- Generated Delivery Envelopes
- Generated Receipts
- Generated Replay Evidence
- Lock files
- Staging files
- Temporary files
- Evaluation output
- Generated `dist/` directories
- Test artifacts
- Physical-path-bearing debug files
- Credentials or secret-bearing files

---

## 2. Required Reading

Before implementation, read and follow:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `ARCHITECTURE_DECISIONS.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGELOG.md`
- `docs/reviews/REPOSITORY_AUDIT_v1.0.md`
- Every approved specification under `docs/milestones/milestone-04/`
- Every approved specification under `docs/milestones/milestone-05/`
- Every approved specification under `docs/milestones/milestone-06/`
- Every approved specification under `docs/milestones/milestone-07/`
- Every approved specification under `docs/milestones/milestone-08/`
- Every approved specification under `docs/milestones/milestone-09/`
- Every approved specification under `docs/milestones/milestone-10/`
- Every approved specification under `docs/milestones/milestone-11/`
- Every approved specification under `docs/milestones/milestone-12/`
- Current implementations under `packages/knowledge-schema/`
- Current implementations under `services/knowledge-engine/`

Treat the approved Milestone 12 specification set as the implementation authority.

Understand and preserve:

- Milestone 04 migration and provenance authority
- Milestone 05 deterministic exact Query behavior
- Milestone 06 Repository and Candidate Source boundaries
- Milestone 07 Snapshot identity
- Milestone 08 lifecycle, comparison, approval, rejection, and activation governance
- Milestone 09 durable Snapshot Registry, audit chain, atomic activation, recovery, and integrity verification
- Milestone 10 governed Context Assembly, budgets, provenance, omission evidence, reproducibility, and package verification
- Milestone 11 Consumer identity, capability matching, Policy Decision Evidence, Freshness, Replay, Idempotency, Delivery Envelope, Acknowledgment, Receipt, Replay Evidence, historical committed-prefix verification, and no-context-bypass enforcement

Do not create competing systems for:

- Query
- Repository
- Snapshot
- Registry
- Lifecycle
- Context Package
- Consumer identity
- Delivery Request
- Policy Evidence
- Delivery Envelope
- Receipt
- Replay Evidence
- Fingerprinting
- Canonical serialization

Extend the existing architecture.

Preserve backward compatibility unless an approved Milestone 12 document explicitly requires a compatible, versioned extension.

---

## 3. Milestone Objective

Milestone 11 currently proves governed Delivery, Idempotency, and Replay behavior within one process lifetime.

Milestone 12 must make those guarantees durable.

Implement a storage-independent Durable Context Delivery Ledger and Replay Registry that can:

- Register a governed Delivery Request immutably
- Claim an idempotency key durably
- Commit the original Delivery Result atomically
- Persist the exact Delivery Envelope
- Persist the exact Consumer Acknowledgment
- Persist the exact Delivery Receipt
- Persist every later Replay Attempt separately
- Recover the original result after restart
- Enforce single-delivery rules after restart
- Resolve identical idempotent retries after restart
- Reject conflicting idempotency-key reuse after restart
- Revalidate repeatable replay using current Policy and Freshness evidence
- Verify a tamper-evident audit chain
- Rebuild all derived lookup state
- Fail closed on corruption, contradiction, missing records, or partial transactions

The milestone must not execute reasoning.

---

## 4. Target Architecture

Implement this durable governance flow:

```text
Verified Milestone 11 Delivery Inputs
        |
        v
Durable Delivery Request Registration
        |
        v
Durable Idempotency Ownership Check
        |
        v
Atomic Original Delivery Transaction
        |
        +--> Delivery Envelope Record
        |
        +--> Acknowledgment Record
        |
        +--> Receipt Record
        |
        v
Append-Only Delivery Ledger
        |
        v
Durable Replay Attempt Ledger
        |
        v
Restart Recovery and Integrity Verification
```

A successful original Delivery must exist only as one complete committed transaction.

A Replay Attempt is a new governed event.

A Replay Attempt must never rewrite the original Delivery Envelope, Acknowledgment, or Receipt.

---

## 5. Package Ownership and Dependency Rules

Maintain:

```text
knowledge-engine -> knowledge-schema
```

### `@founderos/knowledge-schema` owns

- Durable Delivery Ledger record contracts
- Durable idempotency ownership contracts
- Durable Delivery Artifact record contracts
- Atomic Delivery transaction contracts
- Replay Attempt record contracts
- Retention and expiration evidence contracts
- Ledger recovery result contracts
- Ledger integrity verification result contracts
- Stable error and reason codes
- Record schema versions
- Runtime schemas
- Inferred TypeScript types

### `@founderos/knowledge-engine` owns

- Durable Delivery orchestration
- Milestone 11 artifact verification before persistence
- Idempotency ownership resolution
- Atomic transaction preparation and commit
- Replay Attempt persistence
- Ledger replay
- Recovery
- Audit-chain verification
- Derived index rebuilding
- Retention and expiration evaluation
- Local file-backed adapter
- Single-writer protection
- Filesystem safety
- Public governed application service

### Shared Contract Restrictions

Shared contracts must not expose:

- Filesystem paths
- File descriptors
- SQL tables
- Database transactions
- Vendor-specific storage concepts
- Provider names
- Model names
- Prompt fields
- Tokenizer fields
- API credentials
- Agent runtime concepts
- MCP concepts

---

## 6. Implement Strict Durable Record Contracts

Implement strict, versioned, storage-independent contracts for at least:

1. Durable Delivery Request Registration Record
2. Durable Idempotency Ownership Record
3. Durable Delivery Artifact Record
4. Atomic Delivery Transaction Request
5. Committed Delivery Transaction Record
6. Replay Attempt Record
7. Expiration or Retention Evidence Record
8. Ledger Recovery Result
9. Ledger Integrity Verification Result
10. Derived Index Rebuild Result

All authoritative records must:

- Reject unknown fields
- Reject unsupported versions
- Reject invalid identifiers
- Reject accessor-backed raw inputs
- Reject noncanonical values
- Preserve exact referenced Milestone 11 fingerprints
- Include explicit sequence evidence
- Include previous audit-record fingerprint or explicit genesis evidence
- Include canonical record fingerprint
- Be independently verifiable
- Be immutable after commit

Every stored fingerprint must be recomputed during read, replay, recovery, and integrity verification.

Do not trust stored digest fields merely because their format is valid.

---

## 7. Preserve Exact Milestone 11 Artifacts

Persist the exact canonical Milestone 11 artifacts rather than creating weaker persistence-specific representations.

At minimum preserve:

- Delivery Request
- Context Package binding
- Consumer Descriptor binding
- Policy Decision Evidence
- Freshness Evidence
- Compatibility Result
- Delivery Envelope
- Consumer Acknowledgment
- Delivery Receipt
- Replay Evidence where applicable
- Consumption Evidence placeholder where applicable

The Durable Artifact Record must bind:

- Artifact type
- Artifact ID
- Artifact contract version
- Canonical artifact payload
- Canonical artifact fingerprint
- Ledger sequence
- Delivery transaction ID
- Previous audit fingerprint
- Committed-at evidence
- Canonical durable-record fingerprint

During recovery, verify both:

1. The embedded Milestone 11 artifact.
2. The durable wrapper record.

Reject:

- Re-signed semantic substitutions
- Cross-artifact identity mismatches
- Envelope substitution
- Acknowledgment substitution
- Receipt substitution
- Consumer substitution
- Context Package substitution
- Policy Evidence substitution
- Freshness Evidence substitution

---

## 8. Implement the Durable Delivery Ledger Interface

Implement a storage-independent Delivery Ledger port.

It must support governed operations such as:

- Register Delivery Request
- Resolve Delivery Request by ID
- Resolve idempotency ownership
- Read original committed Delivery Result
- Read Delivery Envelope
- Read Acknowledgment
- Read Receipt
- Append Replay Attempt
- Read Replay history
- List committed original Delivery transactions deterministically
- Recover Ledger state
- Verify Ledger integrity
- Rebuild derived indexes

Do not expose low-level operations that allow callers to:

- Insert an Envelope without a Receipt
- Insert a Receipt without an Envelope
- Change idempotency ownership
- Rewrite original Delivery artifacts
- Delete authoritative records
- Bypass Milestone 11 verification
- Mark partial data as committed

Public application APIs must remain governed.

---

## 9. Implement Durable Idempotency Ownership

Implement restart-safe ownership for idempotency keys.

An ownership record must bind:

- Idempotency key
- Canonical Delivery Request fingerprint
- Delivery Request ID
- Original Delivery transaction ID
- Original Envelope ID and fingerprint
- Original Receipt ID and fingerprint
- Replay Policy
- Freshness and expiration evidence
- Ownership sequence
- Created-at evidence
- Previous audit fingerprint
- Canonical ownership fingerprint

### Required Behavior

#### Unused key

The first valid Delivery transaction may claim the key atomically.

#### Identical retry

The same key with the identical canonical Delivery Request must resolve to the original committed result.

#### Conflicting retry

The same key with a different canonical Delivery Request must fail.

#### Single delivery

A `single-delivery` key must reject another successful Delivery after restart.

#### Repeatable modes

Repeatable modes must preserve the original result identity and remain subject to current Policy and Freshness validation.

#### Expiration

Expiration must not erase authoritative ownership evidence.

Use a versioned policy for whether an expired idempotency key is reusable.

The safe Milestone 12 default is:

```text
Expired idempotency keys remain permanently reserved.
```

Do not treat an expired key as unused unless an approved specification explicitly requires a different versioned policy.

---

## 10. Implement Atomic Original Delivery Transactions

A successful original Delivery transaction must atomically commit:

1. Delivery Request Registration
2. Idempotency Ownership
3. Delivery Envelope Record
4. Consumer Acknowledgment Record
5. Delivery Receipt Record
6. Audit-chain advancement
7. Any required transaction summary
8. Derived-index eligibility

No partial subset may be externally visible as committed.

### Preconditions

Before transaction preparation:

- Independently verify the Milestone 11 Delivery Request.
- Independently verify the Context Package.
- Independently verify the Consumer Descriptor.
- Independently verify Policy Decision Evidence.
- Independently verify Compatibility Result.
- Independently verify Freshness Evidence.
- Independently verify Delivery Envelope.
- Independently verify Acknowledgment.
- Independently verify Receipt.
- Verify all cross-artifact bindings.
- Verify expected Ledger head.
- Verify idempotency-key state.
- Verify transaction ID state.

### Compare-and-Swap

Use optimistic preconditions for:

- Expected Ledger head
- Expected idempotency-key ownership state

A stale writer must fail without committed changes.

### Transaction Idempotency

Same transaction ID + same canonical transaction payload:

- Return the original committed transaction.

Same transaction ID + different payload:

- Fail.

### Commit Point

Use one authoritative committed transaction envelope or equivalent atomic commit marker.

Do not claim atomicity from multiple unrelated file writes.

The authoritative commit marker must be sufficient for recovery to determine whether the complete transaction is committed.

---

## 11. Implement Durable Replay Attempt Records

Every Replay Attempt must be recorded separately.

A Replay Attempt record must bind:

- Replay Attempt ID
- Original Delivery transaction ID
- Idempotency key
- Canonical replay request fingerprint
- Original Envelope ID and fingerprint
- Original Receipt ID and fingerprint
- Current Policy Decision Evidence fingerprint
- Current Freshness evaluation fingerprint
- Current Active Snapshot evidence
- Replay Policy
- Replay classification
- Replay outcome
- Stable reason codes
- Explicit attempt timestamp
- Ledger sequence
- Previous audit fingerprint
- Canonical Replay Attempt fingerprint

### Required Replay Behavior

#### Accepted replay

Return the exact original canonical Delivery Result.

Do not generate a replacement Envelope or replacement Receipt.

Persist current validation evidence separately in the Replay Attempt record.

#### Single-delivery replay

Reject after restart and persist rejection evidence.

#### Expired replay

Reject and persist expiration evidence.

#### Policy rejection

Reject and persist current Policy validation evidence.

#### Freshness rejection

Reject and persist current Freshness evidence.

#### Evaluation-only replay

Keep it distinct from a normal accepted replay.

#### Conflicting key reuse

Reject and record stable conflict evidence if the approved policy requires an attempt record.

### Immutability

Replay Attempts must never mutate:

- Original Delivery Request
- Original Context Package
- Original Envelope
- Original Acknowledgment
- Original Receipt
- Original idempotency ownership

---

## 12. Implement a Tamper-Evident Audit Chain

Every authoritative committed Delivery and Replay record must participate in an explicit audit chain.

Each record must bind to:

- Previous committed audit fingerprint, or
- Explicit genesis value

Recovery must verify:

- Record sequence
- Previous fingerprint
- Canonical record fingerprint
- Artifact fingerprint
- Transaction membership
- Cross-artifact references

Reject:

- Missing records
- Reordered records
- Duplicate conflicting sequences
- Broken previous links
- Forged payloads
- Forged fingerprints
- Conflicting ownership
- Orphan Replay Attempts
- Orphan Receipts
- Orphan Envelopes
- Partial committed transactions
- Contradictory accepted replays

Do not silently:

- Skip
- Repair
- Truncate
- Rechain
- Rewrite
- Normalize

authoritative corrupt history.

---

## 13. Implement Recovery

Implement an explicit public Ledger recovery operation.

Recovery must:

1. Open the Ledger safely.
2. Load only authoritative committed transactions and Replay Attempts.
3. Ignore uncommitted staging data.
4. Strictly validate every raw record.
5. Recompute every artifact fingerprint.
6. Recompute every durable-record fingerprint.
7. Verify the audit chain.
8. Reconstruct Delivery Request registrations.
9. Reconstruct idempotency ownership.
10. Reconstruct original Delivery Results.
11. Reconstruct Replay Attempt history.
12. Reconstruct expiration state.
13. Rebuild or verify derived indexes.
14. Validate global invariants.
15. Return deterministic Recovery Evidence.

### Required Global Invariants

- Delivery Request IDs are unique.
- Transaction IDs are unique.
- Artifact IDs are unique.
- Idempotency ownership is unambiguous.
- Every committed original Delivery has a complete artifact set.
- Every Receipt binds to the correct Envelope and Acknowledgment.
- Every Replay Attempt references an existing original Delivery.
- Accepted Replay returns the original result identity.
- Single-delivery policy has no second accepted Delivery.
- Expiration history is consistent.
- Sequence ordering is valid.
- Derived indexes match authoritative history.
- No physical paths or credentials exist in public artifacts.

### Recovery Result

Return deterministic evidence including:

- Ledger contract version
- Ledger status
- Original Delivery transaction count
- Replay Attempt count
- Active idempotency ownership count
- Expired idempotency ownership count
- Last committed Ledger sequence
- Last audit fingerprint
- Ledger integrity fingerprint
- Derived index status
- Stable errors on failure

Do not include machine-specific paths in deterministic Recovery output.

---

## 14. Implement Independent Integrity Verification

Implement an integrity-verification operation that can run independently of normal recovery.

It must verify:

- Raw record safety
- Contract versions
- Canonical serialization
- Artifact fingerprints
- Durable-record fingerprints
- Transaction fingerprints
- Audit-chain continuity
- Transaction completeness
- Idempotency ownership
- Replay references
- Expiration evidence
- Derived index consistency
- Public artifact path privacy
- Public artifact credential privacy

### Derived corruption

If authoritative history is valid but a derived index is missing or corrupt:

- Rebuild deterministically.
- Report the rebuild.
- Do not alter authoritative fingerprints.

### Authoritative corruption

If authoritative history is corrupt:

- Fail closed.
- Do not rewrite it.
- Do not rebuild it from derived indexes.
- Do not return a successful original Delivery Result.

---

## 15. Implement Retention and Bounded Operational State

Authoritative history remains append-only.

Do not destructively compact:

- Original Delivery transactions
- Envelope records
- Acknowledgment records
- Receipt records
- Idempotency ownership records
- Replay Attempt records
- Expiration records
- Audit-chain records

Derived indexes may be bounded and rebuilt.

Examples:

- Active idempotency lookup
- Delivery Request lookup
- Original-result lookup
- Replay eligibility summary
- Expiration schedule

Expiration may remove an entry from an active derived index only when the policy allows it.

Expiration must not erase audit evidence.

Do not implement archival or destructive compaction in Milestone 12.

Document future archival as deferred.

---

## 16. Implement the Local File-Backed Adapter

Implement one replaceable local file-backed adapter.

Use an explicit, Git-ignored runtime root such as:

```text
.founderos/runtime/context-delivery-ledger/
```

Follow existing Milestone 09 filesystem-safety patterns where appropriate.

### Suggested logical layout

```text
context-delivery-ledger/
├── metadata.json
├── transactions/
├── replay-attempts/
├── checkpoints/
├── staging/
└── derived/
```

The exact layout may differ if a simpler design better satisfies the specification.

### Required commit protocol

1. Validate runtime root.
2. Run recursive safety preflight.
3. Acquire explicit single-writer lock.
4. Recover or verify current Ledger state.
5. Verify expected Ledger head.
6. Verify idempotency ownership.
7. Prepare complete transaction in staging.
8. Canonically serialize all records.
9. Recompute all fingerprints.
10. Flush files where supported.
11. Atomically install one committed transaction envelope.
12. Flush the containing directory where supported.
13. Update or rebuild derived indexes.
14. Release the lock.

### Filesystem safety

Reject before mutation:

- Lexical traversal
- Physical traversal
- Symlink escape
- Runtime-root symlink
- Runtime root inside canonical source
- Canonical source inside runtime root
- Nested unsafe repository or source tree
- Unsafe directory entries
- Accessor-backed configuration
- Resource-limit breach
- Race-detected path changes
- Credential-bearing configuration
- Physical-path leakage in public errors

### Recovery behavior

Ignore:

- Staging files
- Temporary files
- Incomplete transaction directories
- Abandoned lock metadata when safely classified
- Non-authoritative derived files

Use authoritative committed transaction envelopes and Replay Attempt records.

### Scope

Support:

- Cooperative local administration
- Explicit single writer
- Compare-and-swap Ledger head
- Compare-and-swap idempotency ownership

Do not claim:

- Hostile filesystem protection beyond tested assumptions
- Distributed writer safety
- Network filesystem consensus
- Multi-region durability
- Database-grade distributed transactions

---

## 17. Preserve the Milestone 11 Governed Boundary

Milestone 12 persistence must never become a bypass around Milestone 11.

The public Durable Delivery service must still require:

1. Verified Context Package
2. Verified Consumer Descriptor
3. Verified Delivery Request
4. Exact Policy Decision Evidence
5. Valid Capability Result
6. Valid Freshness Result
7. Valid Replay and Idempotency Policy
8. Valid Envelope
9. Valid Acknowledgment
10. Valid Receipt

Reject attempts to persist:

- Raw Knowledge Objects
- Full Query Results
- Hidden unbudgeted context
- Direct Repository references
- Direct corpus references
- Unverified Context Packages
- Re-signed semantic substitutions
- Missing provenance evidence
- Missing omission evidence
- Missing truncation evidence
- Missing budget evidence
- Provider-specific prompts
- Provider requests
- Credentials
- Physical paths
- Accessor-backed payloads

---

## 18. Application-Facing API

Provide a clear governed application service.

At minimum, callers should be able to:

- Open or initialize the Durable Delivery Ledger
- Commit a verified original Delivery transaction
- Resolve an idempotency key
- Read the exact original Delivery Result
- Submit a governed Replay Attempt
- Read Replay history
- Recover Ledger state
- Verify Ledger integrity
- Rebuild derived indexes

Do not publicly expose infrastructure methods that allow callers to:

- Write arbitrary records
- Write partial transactions
- Change idempotency ownership
- Rewrite original artifacts
- Delete history
- Skip verification
- Skip Policy or Freshness validation

---

## 19. Determinism and Time Rules

All time-dependent domain logic must receive:

- Explicit timestamp evidence, or
- An injected clock abstraction

Do not read current wall-clock time inside pure functions.

Machine-specific values must not affect canonical identity:

- Absolute paths
- Usernames
- Checkout roots
- Runtime roots
- iCloud paths
- Directory enumeration order
- Map iteration order
- Locale-sensitive sorting

Identical committed Ledger content must produce:

- Byte-identical canonical Recovery output
- Identical Ledger integrity fingerprint
- Identical derived indexes
- Identical original Delivery Result
- Identical idempotency resolution result

---

## 20. Add Deterministic Evaluation Fixtures

Add executable evaluation scenarios covering at least:

### Original Delivery

- First successful Delivery commit
- Restart and original-result lookup
- Identical transaction replay
- Conflicting transaction-ID reuse

### Idempotency

- Identical retry after restart
- Conflicting key reuse after restart
- Permanent expired-key reservation
- Derived ownership index rebuild

### Replay

- Single-delivery rejection after restart
- Repeatable-identical replay after restart
- Repeatable-until-expiration success
- Expired replay rejection
- Evaluation-only replay
- Current Policy denial
- Current Freshness denial
- New Active Snapshot invalidation
- Historical replay permission

### Crash Safety

- Failure before transaction commit
- Failure after authoritative commit
- Abandoned staging directory
- Partial staging files
- Derived-index write failure
- Lock interruption

### Integrity

- Missing Envelope
- Missing Acknowledgment
- Missing Receipt
- Envelope substitution
- Receipt substitution
- Acknowledgment substitution
- Context Package substitution
- Broken artifact fingerprint
- Broken durable-record fingerprint
- Broken audit-chain link
- Conflicting idempotency ownership
- Orphan Replay Attempt
- Contradictory accepted Replay
- Sequence duplication
- Sequence reordering

### Derived State

- Missing derived index
- Corrupt derived index
- Deterministic rebuild
- Authoritative corruption not repaired

### Filesystem Safety

- Lexical traversal
- Physical traversal
- Symlink escape
- Runtime-root symlink
- Runtime/source overlap in both directions
- Nested unsafe tree
- Race-detected path change
- Resource-limit preflight
- Physical-path privacy
- Credential privacy

Define expected:

- Outcome
- Stable reason codes
- Transaction identity
- Envelope identity
- Receipt identity
- Replay Attempt identity
- Ledger sequence
- Integrity fingerprint
- Recovery result
- Derived-index behavior

---

## 21. Add Comprehensive Tests

Add focused tests in these categories.

### Contract Tests

- Strict validation
- Unknown-field rejection
- Unsupported versions
- Invalid identifiers
- Explicit-undefined rejection where required
- Accessor-safe validation
- Canonical normalization
- Fingerprint round trips
- Forged fingerprint rejection

### Original Delivery Transaction Tests

- Valid atomic commit
- Complete artifact binding
- Stale Ledger head
- Claimed idempotency key
- Pre-commit failure
- Post-commit recovery
- Identical transaction replay
- Conflicting transaction reuse
- No partial committed state

### Idempotency Tests

- First ownership
- Identical retry
- Conflicting retry
- Ownership after restart
- Single-delivery after restart
- Expired ownership
- Permanent reservation
- Derived index rebuild

### Replay Attempt Tests

- Accepted repeatable replay
- Single-delivery rejection
- Expired rejection
- Policy rejection
- Freshness rejection
- Evaluation-only replay
- Exact original result return
- Separate current-validation evidence
- Replay history ordering
- Orphan Replay rejection

### Recovery Tests

- Clean recovery
- Deterministic recovery
- Complete counts
- Original-result reconstruction
- Replay-history reconstruction
- Derived-index verification
- Derived-index rebuild
- Missing record failure
- Contradictory state failure

### Integrity Tests

- Artifact tampering
- Record tampering
- Audit-chain tampering
- Transaction-member deletion
- Substitution attacks
- Conflicting ownership
- Duplicate sequence
- Reordered sequence
- Forged Recovery evidence
- Physical-path leakage
- Credential leakage

### Filesystem Safety Tests

- Recursive preflight
- Path traversal
- Symlink escape
- Runtime-root symlink
- Runtime/source overlap
- Nested unsafe entries
- Resource limits
- Race handling
- No filesystem mutation before failed preflight
- Temporary-file exclusion
- Staging-file exclusion
- Arbitrary overwrite prevention

### Immutability Tests

- Defensive copies
- Mutation aliasing across asynchronous boundaries
- Original Milestone 11 artifact immutability
- Replay does not mutate original result
- Derived rebuild does not change authoritative history

### Regression Tests

Keep all Milestone 04–11 tests green.

Preserve all existing public contracts.

Preserve Milestone 11 no-context-bypass behavior.

---

## 22. Architectural Constraints

Do not implement:

- LLM calls
- Provider clients
- Prompt execution
- Provider-specific payloads
- Model configuration
- Agent runtime
- Hermes runtime
- Authentication
- Authorization engine
- MCP gateway
- External integrations
- Model-output persistence
- Semantic search
- Embeddings
- Vector databases
- Ranking
- Knowledge graphs
- UI
- Distributed idempotency
- Distributed locking
- Remote coordination
- General-purpose database infrastructure
- Destructive Ledger compaction

Do not add a framework or dependency unless the current Node.js and TypeScript platform cannot satisfy the approved deterministic and crash-safety contracts.

If a dependency is unavoidable, first document:

- Requirement
- Alternatives
- Security impact
- Determinism impact
- Crash-safety impact
- Architecture decision

in `ARCHITECTURE_DECISIONS.md`.

---

## 23. Engineering Rules

Follow:

- Documentation first
- Architecture before code
- Strict TypeScript
- Existing naming conventions
- Existing package boundaries
- No reverse dependencies
- No unrelated refactoring
- No unsupported completion claims
- Defensive copying
- Immutable authoritative results
- Accessor-safe raw validation
- Explicit time injection
- Stable public errors
- No physical-path leakage
- No credential leakage
- Pure canonicalization and verification functions
- Tests for every behavior change

Use:

- OS temporary directories, or
- Explicit isolated test roots

Do not write tests into the developer's real runtime Ledger.

Never modify canonical `docs/` or `knowledge/` sources.

If the checkout is under an iCloud-managed directory, ensure tests and runtime fixtures are isolated from file-provider behavior.

---

## 24. Documentation Updates

Update only documentation reflecting implemented behavior:

- Root `README.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGELOG.md`
- Relevant package READMEs
- Public exports
- `ARCHITECTURE_DECISIONS.md`

Add an ADR documenting:

- Durable Context Delivery Ledger
- Durable Idempotency ownership
- Atomic original Delivery transaction
- Immutable Milestone 11 artifact persistence
- Replay Attempt separation
- Audit-chain design
- Recovery model
- Derived-index policy
- Expired-key reservation policy
- Local file-backed adapter
- Single-writer assumptions
- Commit point and crash-consistency assumptions
- Deferred distributed persistence
- Deferred provider execution
- Deferred authentication and authorization
- Deferred agents, Hermes, and MCP

Do not document speculative capabilities as implemented.

---

## 25. Verification Gates

Before completion, run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

Run additional repository-defined checks if present.

All prior milestone regressions and all new Milestone 12 tests must pass.

Inspect:

```bash
git status
```

Confirm:

- Only intended Milestone 12 changes exist
- No runtime Ledger records are staged
- No generated Envelopes are staged
- No generated Receipts are staged
- No Replay Evidence output is staged
- No lock or staging files are staged
- `.DS_Store` is excluded
- iCloud conflicts are excluded
- Temporary files are excluded
- Credentials are excluded

---

## 26. Independent Whole-Branch Review

After verification passes, perform an independent whole-branch review focused on:

- Milestone 11 verification bypass
- Raw Knowledge Object bypass
- Full Query Result bypass
- Partial transaction exposure
- Incorrect commit-point assumptions
- Missing atomic artifact
- Stale Ledger-head race
- Idempotency ownership race
- Conflicting key reuse after restart
- Single-delivery bypass after restart
- Replay mutating original artifacts
- Replay returning a new result instead of the original result
- Missing current Policy validation
- Missing current Freshness validation
- Audit-chain forgery
- Artifact substitution
- Receipt substitution
- Derived index treated as authoritative
- Authoritative corruption silently repaired
- Expired key incorrectly treated as unused
- Unbounded derived state
- Mutable aliasing
- Accessor execution
- Physical-path leakage
- Credential leakage
- Filesystem mutation before failed preflight
- Symlink or overlap bypass
- Provider-specific coupling
- Accidental LLM invocation
- Accidental Agent or Hermes invocation

Fix every Critical, Important, or Minor finding before declaring `GO`.

Otherwise return `NOT READY` with exact unresolved findings.

---

## 27. Commit and Pull Request Rules

Prepare the result as commit-ready.

Do not merge into `main`.

If the user has not explicitly authorized commit and push:

- Leave changes uncommitted.
- Report that state.

If explicitly authorized:

1. Create one clean conventional milestone commit.
2. Push `codex/milestone-12`.
3. Prepare a Pull Request into `main`.
4. Do not merge locally.
5. Do not merge remotely.

Never discard completed work.

---

## 28. Completion Report

Return a report titled:

# FounderOS Milestone 12 Completion Report

Include:

1. Status: `GO` or `NOT READY`
2. Branch
3. Base branch
4. Worktree state
5. Commit state
6. Push state
7. Implementation summary
8. Exact durable Delivery workflow
9. Exact Replay workflow
10. All added files
11. All modified files
12. Tests added by category
13. Final total test count
14. Exact verification results
15. Atomic transaction evidence
16. Crash-recovery evidence
17. Durable idempotency evidence
18. Single-delivery-across-restart evidence
19. Repeatable replay evidence
20. Expiration evidence
21. Audit-chain evidence
22. Artifact substitution rejection evidence
23. Derived-index rebuild evidence
24. Filesystem-safety evidence
25. No-context-bypass regression evidence
26. Architecture impact
27. Dependency direction
28. Crash-consistency assumptions
29. Known limitations
30. Deliberately deferred capabilities
31. Independent review findings
32. Recommended next milestone
33. Pull Request readiness

---

## GO Standard

Milestone 12 may be reported as `GO` only when FounderOS can:

- Persist a complete original Milestone 11 Delivery Result atomically
- Recover the exact original result after restart
- Preserve idempotency ownership after restart
- Reject conflicting idempotency-key reuse after restart
- Enforce single-delivery policy after restart
- Return the exact original result for permitted replay
- Record every Replay Attempt separately
- Preserve current Policy and Freshness validation evidence
- Verify every artifact and durable wrapper fingerprint
- Verify complete audit-chain continuity
- Rebuild derived state from authoritative history
- Fail closed on partial, corrupt, substituted, contradictory, or forged records
- Preserve Milestone 11 no-context-bypass guarantees
- Complete all behavior without invoking an LLM, provider, Agent, Hermes runtime, or MCP integration

Prioritize atomicity, restart safety, tamper evidence, replay correctness, and governance integrity over storage sophistication or provider integration.
