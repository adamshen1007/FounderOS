# FounderOS Milestone 11 Codex Execution Prompt v1.0

## Role and Mission

You are the lead engineer responsible for implementing **FounderOS Milestone 11 — Governed Context Consumer Boundary Foundation**.

Your responsibility is to implement the milestone completely, verify every required behavior, preserve all prior architectural guarantees, prepare the work for review, and return a formal completion report.

Do not stop after analysis or planning. Do not claim completion unless every required verification gate passes. Do not invoke any LLM, provider, agent, Hermes runtime, or MCP integration in this milestone.

---

## 1. Repository Preparation

Before modifying any file:

1. Fetch the latest remote state.
2. Confirm that Milestone 10 has been merged into the latest `main`.
3. Confirm that the current work is based on that merged state.
4. Create or switch to the dedicated branch:

```bash
codex/milestone-11
```

5. Inspect:

```bash
git status
git branch --show-current
git log --oneline --decorate -15
git merge-base HEAD origin/main
```

Preserve all legitimate existing work.

Do not reset, discard, overwrite, amend, rewrite, or silently relocate unrelated changes.

If unrelated worktree changes exist:

- Report them clearly.
- Isolate Milestone 11 safely.
- Do not destroy or hide existing work.

Do not include any of the following in the final milestone commit:

- `.DS_Store`
- iCloud conflict or duplicate files
- Local runtime data
- Generated Context Packages
- Generated delivery envelopes
- Generated receipts
- Lock files
- Temporary files
- Evaluation outputs
- Test artifacts
- Machine-local paths or caches

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
- Current implementations under `packages/knowledge-schema/`
- Current implementations under `services/knowledge-engine/`

Treat the approved Milestone 11 specification set as the implementation authority.

Understand and preserve:

- Milestone 04 migration and provenance authority
- Milestone 05 exact Query contracts and deterministic results
- Milestone 06 Repository and Candidate Source boundaries
- Milestone 07 corpus snapshot identity
- Milestone 08 lifecycle, review, approval, rejection, and activation semantics
- Milestone 09 durable registry, audit chain, atomic activation, recovery, integrity verification, and Active Snapshot resolution
- Milestone 10 governed Context Request, Context Package, Active Snapshot binding, deterministic selection, budgets, evidence, reproducibility, and independent package verification

Do not create competing Query, Repository, Snapshot, Lifecycle, Registry, Context, Evidence, Policy, Delivery, Receipt, or Fingerprint systems.

Preserve existing public contracts and package boundaries unless an approved Milestone 11 specification explicitly requires a compatible, versioned extension.

---

## 3. Milestone Objective

Implement a provider-neutral, governed boundary through which a verified Milestone 10 Context Package can be prepared for delivery to:

- An internal service
- A human-assisted service
- An evaluation harness
- A future reasoning provider
- A future agent runtime

The completed boundary must preserve:

- Exact Context Package identity
- Active Snapshot binding
- Registry integrity binding
- Consumer identity
- Consumer capability declarations
- Explicit policy decision evidence
- Freshness and expiration evidence
- Idempotency and replay rules
- Delivery fingerprint
- Delivery receipt
- No-context-bypass guarantees

This milestone must not:

- Invoke a model
- Construct provider-specific prompts
- Execute a reasoning request
- Run an agent
- Run Hermes
- Call MCP
- Implement authorization
- Add provider-specific adapters

---

## 4. Architectural Flow

Implement this governed flow:

```text
Verified Context Package
        |
        v
Governed Delivery Request
        |
        v
Context Package Verification
        |
        v
Consumer Capability Validation
        |
        v
Policy Evidence Validation
        |
        v
Freshness / Expiration Validation
        |
        v
Idempotency / Replay Validation
        |
        v
Governed Delivery Envelope
        |
        v
Provider-Neutral Consumer Boundary
        |
        v
Delivery Receipt
```

The public governed API must enforce every step.

No public path may deliver knowledge through a less-governed route.

---

## 5. Package Ownership and Dependency Rules

Maintain the dependency direction:

```text
knowledge-engine -> knowledge-schema
```

### `@founderos/knowledge-schema` owns

- Context Consumer identity contracts
- Consumer capability contracts
- Delivery Request contracts
- Delivery Envelope contracts
- Policy input contracts
- Policy decision evidence contracts
- Freshness and expiration contracts
- Replay and idempotency contracts
- Delivery Receipt contracts
- Consumption evidence placeholder contracts
- Provider-neutral consumer boundary contracts
- Stable reason codes
- Verification-result contracts
- Contract versions
- Runtime schemas and inferred TypeScript types

### `@founderos/knowledge-engine` owns

- Context Package verification before delivery
- Consumer capability matching
- Policy evidence validation
- Freshness and expiration evaluation
- Idempotency and replay evaluation
- Delivery Envelope creation
- Delivery fingerprinting
- Receipt generation
- Independent Envelope and Receipt verification
- Governed delivery orchestration
- In-memory bounded idempotency state where needed for this milestone

Do not expose the following in shared contracts:

- Provider names
- Model names
- Chat role structures
- Prompt formats
- Temperature or sampling settings
- Tokenizers
- API keys
- Provider credentials
- Pricing fields
- SQL concepts
- Physical filesystem paths
- MCP concepts

---

## 6. Implement the Context Consumer Identity and Capability Contract

Implement a strict, versioned Consumer Descriptor.

It must support:

- Consumer ID
- Consumer type
- Display name
- Owning system or domain
- Declared purpose
- Accepted Context Package contract versions
- Accepted assembly policy versions
- Maximum accepted object count
- Maximum accepted canonical character count
- Required provenance support
- Required replay support
- Required receipt support
- Whether truncated content is accepted
- Whether empty Context Packages are accepted
- Policy subject reference
- Descriptor fingerprint

Initial provider-neutral consumer types may include:

- `human-assisted-service`
- `internal-service`
- `reasoning-provider`
- `agent-runtime`
- `evaluation-harness`

Consumer type describes intended use. It does not grant authorization.

Reject:

- Unknown fields
- Unsupported versions
- Empty or malformed IDs
- Empty purpose
- Non-positive limits
- Contradictory capabilities
- Duplicate accepted versions
- Unsupported capability combinations
- Forged descriptor fingerprints

Do not add model-specific fields.

---

## 7. Implement the Governed Context Delivery Request Contract

Implement a strict, versioned Delivery Request.

It must bind:

- Delivery Request ID
- Context Package ID
- Context Package fingerprint
- Consumer Descriptor
- Consumer Descriptor fingerprint
- Delivery purpose
- Requested capability requirements
- Policy decision input
- Freshness policy
- Idempotency key
- Replay policy
- Request actor
- Request reason
- Request timestamp evidence
- Canonical request fingerprint

Reject:

- Unknown fields
- Unsupported versions
- Missing package bindings
- Forged package bindings
- Invalid consumer descriptors
- Empty purpose
- Empty reason
- Contradictory freshness rules
- Contradictory replay rules
- Invalid idempotency keys
- Forged request fingerprints

The request is not a provider API request.

It must not contain:

- Prompt text
- Model settings
- Chat roles
- Provider configuration
- Tool calls
- Agent instructions

---

## 8. Implement the Policy and Authorization Input Boundary

Implement strict, provider-neutral, storage-independent contracts for:

- Policy decision input
- Policy decision evidence

### Policy input may include

- Subject reference
- Consumer reference
- Context Package reference
- Active Snapshot reference
- Intended purpose
- Project scope
- Domain scope
- Data classification
- Requested operation
- Required governance approval reference
- Request timestamp evidence

### Policy decision evidence must include

- Decision ID
- Decision version
- Input fingerprint
- Context Package ID and fingerprint
- Consumer ID and descriptor fingerprint
- Intended purpose
- Decision authority reference
- Stable reason codes
- Decision timestamp evidence
- Expiration evidence
- Canonical decision fingerprint

### Supported outcomes

- `allowed`
- `denied`
- `review-required`
- `not-evaluated`

`not-evaluated` must never be interpreted as `allowed`.

Milestone 11 must not implement:

- Authentication
- Identity verification
- Authorization rules
- Role-based access control
- Policy engines

The governed delivery operation may accept:

- Verified caller-supplied policy decision evidence
- Deterministic test fixtures

It must never invent, infer, or silently assume authorization.

---

## 9. Implement Freshness and Expiration Rules

Implement a strict, versioned Freshness Policy.

It may bind to:

- Context Package creation evidence
- Active Snapshot ID
- Active Snapshot activation sequence
- Not-before timestamp
- Expiration timestamp
- Maximum age
- Whether a newer Active Snapshot invalidates delivery
- Whether historical replay is allowed

All time-dependent domain operations must receive:

- An explicit evaluation timestamp, or
- An injected clock abstraction

Do not read wall-clock time implicitly inside pure domain functions.

Fail closed when:

- The request is not yet valid
- The request has expired
- Policy evidence has expired
- Maximum age is exceeded
- A newer Active Snapshot invalidates delivery
- Historical replay is not permitted
- Timestamp evidence is incomplete
- Timestamp evidence is contradictory
- Timestamp evidence is forged

The default behavior for a package bound to a superseded snapshot should be rejection unless explicit verified policy allows historical replay.

---

## 10. Implement Idempotency and Replay Rules

Implement strict, versioned Replay Policy modes:

- `single-delivery`
- `repeatable-identical`
- `repeatable-until-expiration`
- `evaluation-only`

Implement idempotency behavior:

- Same idempotency key + identical canonical request payload returns the original deterministic result.
- Same idempotency key + different canonical request payload fails.
- A `single-delivery` request cannot produce two successful deliveries.
- A repeatable delivery must preserve the original Context Package and Consumer bindings.
- Replay must remain subject to freshness and policy validation.

Do not implement:

- Distributed idempotency
- Distributed locks
- Provider-side deduplication

Use the minimum bounded, replaceable, in-memory state necessary to prove deterministic behavior.

Do not allow unbounded memory growth. Define and test a bounded retention policy or explicit caller-supplied store boundary if required.

---

## 11. Verify the Context Package Before Delivery

Before creating a Delivery Envelope:

1. Independently verify the Milestone 10 Context Package.
2. Recompute and verify its Context Package fingerprint.
3. Verify its Active Snapshot binding.
4. Verify its Registry integrity binding.
5. Verify its Repository Snapshot binding.
6. Verify object-count budget evidence.
7. Verify character-count budget evidence.
8. Verify included object fingerprints.
9. Verify provenance evidence.
10. Verify exclusion evidence.
11. Verify omission evidence.
12. Verify truncation evidence.
13. Verify evidence counts.

Fail closed on any mismatch.

Do not expose a public API that accepts an unverified package and skips this step.

---

## 12. Implement Consumer Capability Matching

Compare the verified Context Package against the declared Consumer capabilities.

At minimum validate:

- Context Package contract version
- Assembly policy version
- Included object count
- Canonical included character count
- Presence of truncation
- Empty-package state
- Provenance support requirement
- Replay support requirement
- Receipt support requirement

Return a deterministic compatibility result containing:

- Compatible or incompatible status
- Stable reason codes
- Exact mismatched fields
- Consumer Descriptor fingerprint
- Context Package fingerprint
- Canonical compatibility-result fingerprint

Stable reason-code ordering must not depend on input order or map iteration.

Do not modify, reassemble, retruncate, remove evidence, or reduce a Context Package to make it compatible.

Capability mismatch must reject delivery.

---

## 13. Implement the Governed Delivery Envelope

Implement a strict, versioned, immutable, canonically serializable Delivery Envelope.

It must include:

- Envelope contract version
- Delivery Envelope ID
- Delivery Request ID and fingerprint
- Context Package ID and fingerprint
- Exact verified Context Package payload
- Consumer ID and Descriptor fingerprint
- Delivery purpose
- Active Snapshot binding summary
- Registry integrity binding summary
- Capability matching result
- Policy decision evidence
- Freshness and expiration evidence
- Idempotency key
- Replay policy
- Delivery sequence
- Created-at evidence
- Canonical delivery fingerprint

The Envelope must contain:

- Exactly one verified Context Package
- No hidden raw Knowledge Objects
- No full unbudgeted Query Result
- No direct Repository handle
- No direct corpus reference
- No provider-specific prompt
- No provider request
- No API credentials
- No ungoverned context

A created-at timestamp may be recorded as evidence, but it must not make identical idempotent delivery produce a different identity unless the approved policy explicitly binds it.

---

## 14. Enforce the No-Context-Bypass Rule

The public governed delivery API must reject or prevent:

- Raw Knowledge Object delivery
- Full unbudgeted Query Result delivery
- Direct Knowledge Repository access
- Direct corpus-file access
- Delivery from an inactive snapshot
- Delivery from an unverified snapshot
- Delivery of an unverified Context Package
- Hidden provider-specific context injection
- Mutation of the Context Package
- Removal of provenance evidence
- Removal of exclusion evidence
- Removal of omission evidence
- Removal of truncation evidence
- Removal of budget evidence

Low-level pure helpers may exist for internal testing.

They must not be exported as a less-governed public delivery path.

---

## 15. Implement the Provider-Neutral Consumer Boundary

Create a provider-neutral interface for future Consumer adapters.

A future adapter may:

- Declare Consumer capabilities
- Accept a Governed Delivery Envelope
- Validate compatibility
- Return a Delivery Receipt
- Return future Consumption Evidence

It must not:

- Query KnowledgeOS directly
- Read the Knowledge Repository directly
- Request raw Knowledge Objects
- Request full Query Results
- Modify the Context Package
- Ignore policy evidence
- Ignore freshness rules
- Ignore replay rules
- Reconstruct hidden unbudgeted context
- Invoke a provider in Milestone 11

Do not add provider-specific adapters for:

- OpenAI
- Anthropic
- Google
- Local models
- Any other provider

---

## 16. Implement Delivery Receipts

Implement a strict, versioned Delivery Receipt contract and deterministic Receipt creation.

The Receipt must bind:

- Receipt ID
- Delivery Envelope ID and fingerprint
- Context Package ID and fingerprint
- Consumer ID and Descriptor fingerprint
- Delivery status
- Delivery sequence
- Received-at evidence
- Idempotency key
- Replay classification
- Consumer acknowledgment fingerprint
- Canonical Receipt fingerprint

Initial status values may include:

- `accepted`
- `rejected`
- `expired`
- `duplicate`
- `policy-denied`
- `capability-mismatch`
- `integrity-failure`

Accepted and rejected delivery attempts must produce appropriate governed evidence according to the approved design.

Do not expose:

- Secrets
- Physical paths
- Provider-specific diagnostics
- Credentials
- Hidden context

---

## 17. Define Consumption Evidence Without Executing Reasoning

Implement a strict, versioned placeholder contract for future Consumption Evidence.

It may include:

- Consumption ID
- Receipt ID
- Consumer operation reference
- Started-at evidence
- Completed-at evidence
- Result evidence reference
- Failure reason
- Canonical fingerprint

Do not:

- Invoke a model
- Produce a reasoning result
- Produce an LLM response
- Produce an Agent action
- Persist provider output
- Create a provider-specific result schema

---

## 18. Implement Independent Verification

Implement pure independent verification for:

- Consumer Descriptor
- Delivery Request
- Policy Decision Evidence
- Compatibility Result
- Delivery Envelope
- Delivery Receipt
- Consumption Evidence placeholder

Verification must recompute canonical fingerprints and validate:

- Context Package binding
- Consumer binding
- Request binding
- Policy binding
- Freshness evidence
- Expiration evidence
- Replay evidence
- Idempotency evidence
- Envelope identity
- Receipt identity
- Stable reason ordering
- Evidence counts

Detect and reject:

- Context Package substitution
- Consumer substitution
- Request mutation
- Policy evidence forgery
- Freshness mutation
- Replay-policy mutation
- Idempotency-key conflict
- Envelope tampering
- Receipt tampering
- Reordering
- Missing evidence
- Physical-path leakage
- Secret leakage

Fail closed.

Do not silently repair authoritative artifacts.

---

## 19. Add Deterministic Evaluation Fixtures

Add evaluation scenarios covering at least:

- Valid internal service Consumer
- Valid future reasoning Consumer
- Valid evaluation-harness Consumer
- Unsupported Context Package version
- Unsupported assembly policy version
- Object-count capability mismatch
- Character-count capability mismatch
- Truncated package rejected
- Empty package rejected
- Provenance requirement mismatch
- Receipt capability mismatch
- Replay capability mismatch
- Policy allowed
- Policy denied
- Policy review required
- Policy not evaluated
- Missing policy evidence
- Expired policy evidence
- Request not yet valid
- Expired delivery request
- New Active Snapshot invalidates delivery
- Historical replay explicitly allowed
- Identical idempotent replay
- Conflicting idempotency-key reuse
- Single-use replay rejection
- Repeatable-until-expiration success
- Evaluation-only replay
- Context Package tampering
- Consumer Descriptor tampering
- Delivery Request tampering
- Policy evidence tampering
- Delivery Envelope tampering
- Receipt tampering
- Raw Knowledge Object bypass attempt
- Full Query Result bypass attempt
- Hidden context injection attempt
- Physical-path privacy
- Stable reason ordering

Define expected:

- Status
- Stable reason codes
- Fingerprints
- Envelope behavior
- Receipt behavior
- Replay behavior
- Idempotency behavior

---

## 20. Add Comprehensive Tests

Add focused tests for the following categories.

### Contract Validation

- Valid records
- Unknown-field rejection
- Unsupported versions
- Contradictory capabilities
- Invalid IDs
- Duplicate versions
- Forged fingerprints
- Accessor-safe raw input validation

### Context Package Integrity

- Valid package
- Tampered package
- Active Snapshot mismatch
- Registry binding mismatch
- Repository binding mismatch
- Budget evidence mismatch
- Provenance mismatch
- Missing evidence
- Reordered evidence

### Consumer Capability Matching

- Every supported field
- Exact boundary matching
- Stable reason ordering
- No implicit package mutation
- No implicit truncation
- No evidence stripping

### Policy Boundary

- Allowed
- Denied
- Review required
- Not evaluated
- Missing decision evidence
- Expired decision evidence
- Forged decision evidence
- Input fingerprint mismatch

### Freshness and Time

- Explicit injected time
- Not-before
- Expiration
- Maximum age
- New Active Snapshot
- Historical replay allowed
- Historical replay denied
- Contradictory time evidence

### Idempotency and Replay

- Identical replay
- Conflicting key reuse
- Single-use rejection
- Replay until expiration
- Evaluation replay
- Stable original result
- Bounded state behavior

### Delivery Envelope

- Deterministic creation
- Byte-identical canonical serialization
- Stable fingerprint
- Exact package binding
- Exact Consumer binding
- Exact policy binding
- Exact freshness binding
- No hidden context

### Delivery Receipt

- Deterministic Receipt creation
- Stable Receipt fingerprint
- Accepted outcome
- Rejected outcome
- Duplicate outcome
- Expired outcome
- Capability mismatch
- Integrity failure
- Tamper detection

### No-Context-Bypass

- Raw Knowledge Object rejection
- Full Query Result rejection
- Direct Repository bypass rejection
- Unverified package rejection
- Hidden context rejection
- Package mutation rejection
- Evidence stripping rejection

### Regression

All Milestone 04–10 tests must remain green.

All existing public contracts must remain compatible.

---

## 21. Architectural Constraints

Do not implement:

- LLM calls
- Prompt execution
- Provider-specific payload construction
- Provider API clients
- Agent runtime
- Hermes runtime
- Authentication
- Authorization decision engine
- MCP gateway
- External integrations
- Model-output persistence
- Context Package persistence unless already required by approved architecture
- Embeddings
- Vector databases
- Semantic search
- Ranking
- Knowledge graph persistence
- UI applications

Do not add a new framework or dependency unless the current Node.js and TypeScript platform cannot satisfy the approved deterministic contracts.

If a dependency is unavoidable, document:

- The requirement
- Alternatives
- Security impact
- Determinism impact
- Architecture decision

in `ARCHITECTURE_DECISIONS.md` before implementation.

---

## 22. Engineering Rules

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
- Immutable results
- Accessor-safe validation
- Stable public errors
- No physical-path leakage
- No secret leakage
- Explicit time injection
- Pure functions for capability matching, policy evaluation, freshness, replay, canonicalization, fingerprinting, and verification
- Tests for every behavior change

Use OS temporary directories or isolated test roots.

Do not write generated Envelopes or Receipts into the developer's real runtime directory.

Never modify canonical `docs/` or `knowledge/` sources.

---

## 23. Documentation Updates

Update only documentation that reflects implemented behavior:

- Root `README.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGELOG.md`
- Relevant package READMEs
- Public exports
- `ARCHITECTURE_DECISIONS.md`

Add an ADR documenting:

- Governed Context Consumer Boundary
- No-context-bypass rule
- Provider-neutral Consumer interface
- Capability matching
- Policy-input boundary
- Freshness and expiration
- Idempotency and replay
- Delivery Envelope identity
- Delivery Receipt evidence
- Deferred provider execution
- Deferred authorization
- Deferred agents and Hermes
- Deferred MCP

Do not document speculative capabilities as implemented.

---

## 24. Verification Gates

Before completion, run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

Run any additional repository-defined verification commands.

All prior milestone regressions and all new Milestone 11 tests must pass.

Inspect:

```bash
git status
```

Confirm:

- Only intended Milestone 11 changes exist
- No machine-local artifacts are staged
- No generated Envelopes or Receipts are staged
- `.DS_Store` is excluded
- iCloud conflict files are excluded
- Temporary files are excluded

---

## 25. Independent Whole-Branch Review

After all tests pass, perform an independent review focused on:

- Context Package verification bypass
- Active Snapshot binding loss
- Registry integrity binding loss
- Raw Knowledge Object bypass
- Full Query Result bypass
- Consumer substitution
- Capability mismatch bypass
- `not-evaluated` treated as `allowed`
- Missing policy evidence
- Implicit wall-clock use
- Expired delivery acceptance
- New-snapshot freshness bypass
- Idempotency conflict
- Replay-policy bypass
- Mutable aliasing
- Unbounded in-memory idempotency state
- Nondeterministic reason ordering
- Envelope fingerprint forgery
- Receipt fingerprint forgery
- Physical-path leakage
- Secret leakage
- Provider-specific coupling
- Accidental model invocation
- Accidental agent invocation

Fix every Critical, Important, or Minor finding before declaring `GO`.

Otherwise report `NOT READY` with precise reasons.

---

## 26. Commit and Pull Request Rules

Prepare the result as commit-ready.

Do not merge into `main`.

If the user has not explicitly authorized commit and push:

- Leave the changes uncommitted.
- Report that state.

If the user has explicitly authorized commit and push:

1. Create one clean conventional milestone commit.
2. Push `codex/milestone-11`.
3. Prepare a Pull Request into `main`.
4. Do not merge locally or remotely.

Never discard the branch or completed work.

---

## 27. Completion Report

Return a report titled:

# FounderOS Milestone 11 Completion Report

Include:

1. Status: `GO` or `NOT READY`
2. Branch
3. Base branch
4. Worktree state
5. Commit state
6. Push state
7. Implementation summary
8. Exact governed delivery workflow
9. All added files
10. All modified files
11. Tests added by category
12. Final total test count
13. Exact verification results
14. Context Package verification evidence
15. Consumer capability enforcement evidence
16. Policy outcome handling evidence
17. Freshness and expiration evidence
18. Idempotency and replay evidence
19. No-context-bypass evidence
20. Deterministic Envelope evidence
21. Receipt generation and verification evidence
22. Tamper-rejection evidence
23. Architecture impact
24. Dependency direction
25. Known limitations
26. Deliberately deferred capabilities
27. Independent review findings
28. Recommended next milestone
29. Pull Request readiness

---

## GO Standard

Milestone 11 may be reported as `GO` only when FounderOS can:

- Independently verify a Milestone 10 Context Package
- Validate a declared Consumer and its capabilities
- Preserve explicit Policy Decision evidence
- Enforce freshness and expiration
- Enforce idempotency and replay rules
- Create an immutable provider-neutral Delivery Envelope
- Prevent every less-governed context bypass path
- Produce a deterministic Delivery Receipt
- Independently verify the Envelope and Receipt
- Complete the workflow without invoking an LLM, provider, agent, Hermes runtime, or MCP integration

Prioritize provenance preservation, bypass resistance, deterministic evidence, explicit policy boundaries, and replay safety over provider integration or apparent intelligence.
