# FounderOS Milestone 13 Codex Execution Prompt v1.0

## Role and Mission

You are the lead engineer responsible for implementing **FounderOS Milestone 13 — Provider-Neutral Reasoning Invocation and Result Evidence Foundation**.

Your responsibility is to implement this milestone completely, preserve every Milestone 04–12 governance and durability guarantee, verify the entire execution and evidence lifecycle, prepare the work for review, and return a formal completion report.

Do not stop after analysis or planning.

Do not declare completion unless:

- Every required verification gate passes.
- Every prior milestone regression remains green.
- The final independent whole-branch review contains no unresolved Critical, Important, or Minor findings.

Milestone 13 must not call a real LLM, reasoning provider, remote model API, local production model, Agent runtime, Hermes runtime, MCP integration, or external service.

---

## 1. Repository Preparation

Before modifying any file:

1. Fetch the latest remote state.
2. Confirm Milestone 12 has been merged into the latest `main`.
3. Confirm the work is based on that merged state.
4. Create or switch to:

```bash
codex/milestone-13
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
- Delete or move user files
- Hide repository-state problems
- Commit generated runtime artifacts

If unrelated changes exist:

- Report them clearly.
- Isolate Milestone 13 safely.
- Continue only when the milestone changes can remain separate.

Do not commit:

- `.DS_Store`
- iCloud duplicate or conflict files
- Local Delivery Ledger runtime data
- Generated Invocation Requests
- Generated Result Envelopes
- Generated Execution Receipts
- Generated Consumption Evidence
- Fake-provider fixture output
- Lock files
- Staging files
- Temporary files
- Evaluation output
- Generated `dist/` directories
- Test artifacts
- Physical-path-bearing debug files
- Credentials, tokens, API keys, or secret-bearing files

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
- Every approved specification under `docs/milestones/milestone-13/`
- Current implementations under `packages/knowledge-schema/`
- Current implementations under `services/knowledge-engine/`

Treat the approved Milestone 13 specification set as the implementation authority.

Understand and preserve:

- Milestone 04 migration and provenance authority
- Milestone 05 deterministic exact Query behavior
- Milestone 06 Repository and Candidate Source boundaries
- Milestone 07 Snapshot identity
- Milestone 08 lifecycle, comparison, approval, rejection, and activation governance
- Milestone 09 durable Snapshot Registry, audit chain, recovery, and integrity verification
- Milestone 10 governed Context Assembly, budgets, provenance, omission evidence, reproducibility, and package verification
- Milestone 11 Consumer identity, Capability matching, Policy Decision Evidence, Freshness, Delivery Envelope, Acknowledgment, Receipt, Replay Evidence, and no-context-bypass enforcement
- Milestone 12 durable Delivery Ledger, permanent idempotency ownership, atomic Delivery transactions, Replay Attempt records, restart recovery, audit-chain verification, bounded derived indexes, and filesystem safety

Do not create competing systems for:

- Query
- Repository
- Snapshot
- Registry
- Context Package
- Delivery Request
- Delivery Envelope
- Delivery Receipt
- Replay Evidence
- Durable Delivery Ledger
- Fingerprinting
- Canonical serialization
- Consumer identity
- Policy Evidence

Extend the existing architecture.

Preserve backward compatibility unless an approved Milestone 13 document explicitly requires a compatible, versioned extension.

---

## 3. Milestone Objective

Implement the first governed provider-neutral Reasoning Invocation boundary.

The system must be able to:

- Start from one exact durable Milestone 12 Delivery transaction.
- Verify its Delivery Envelope and Receipt.
- Construct and validate a Reasoning Invocation Request.
- Match the request against a Provider Capability Descriptor.
- Execute only through a provider-neutral port.
- Use only a deterministic fake provider in Milestone 13.
- Produce Success, Failure, Timeout, or Cancellation evidence.
- Enforce Invocation idempotency.
- Create immutable execution attempts.
- Apply verified retry policy.
- Enforce input, output, timeout, and attempt budgets.
- Produce an independently verifiable Reasoning Result Envelope.
- Produce Usage and Cost Evidence.
- Finalize Milestone 11 Consumption Evidence.
- Persist final execution evidence through a governed, storage-independent, append-only boundary.
- Recover or replay finalization deterministically where persistence is implemented.
- Preserve the complete chain back to the Active Snapshot and Context Package.

The milestone must not execute a real production model.

---

## 4. Target Architecture

Implement this governed flow:

```text
Durably Committed Delivery Transaction
        |
        v
Verified Delivery Envelope and Receipt
        |
        v
Reasoning Invocation Request
        |
        v
Provider Capability Matching
        |
        v
Execution Policy Validation
        |
        v
Invocation Idempotency Resolution
        |
        v
Provider-Neutral Execution Port
        |
        v
Deterministic Fake Provider
        |
        v
Execution Attempt Evidence
        |
        v
Reasoning Result Envelope
        |
        v
Finalized Consumption Evidence
        |
        v
Governed Append-Only Execution Evidence
```

Every result must remain traceable to:

- Delivery transaction
- Delivery Envelope
- Delivery Receipt
- Consumer
- Context Package
- Active Snapshot
- Registry integrity evidence
- Policy Decision Evidence
- Invocation Request
- Provider Capability Descriptor
- Execution Policy
- Execution Attempt

---

## 5. Package Ownership and Dependency Rules

Maintain:

```text
knowledge-engine -> knowledge-schema
```

### `@founderos/knowledge-schema` owns

- Reasoning Invocation Request contracts
- Provider Capability Descriptor contracts
- Provider-neutral input contracts
- Execution Policy contracts
- Compatibility-result contracts
- Execution Attempt contracts
- Result Envelope contracts
- Execution Receipt contracts
- Usage Evidence contracts
- Cost Evidence contracts
- Failure Evidence contracts
- Timeout Evidence contracts
- Cancellation Evidence contracts
- Finalized Consumption Evidence contracts
- Invocation finalization contracts
- Stable statuses and reason codes
- Verification-result contracts
- Contract versions
- Runtime schemas
- Inferred TypeScript types

### `@founderos/knowledge-engine` owns

- Durable Delivery resolution
- Milestone 11 and 12 artifact verification
- Invocation validation and orchestration
- Provider Capability matching
- Execution Policy evaluation
- Invocation idempotency resolution
- Attempt lifecycle
- Retry, timeout, and cancellation handling
- Provider-neutral execution port
- Deterministic fake provider adapter
- Result Envelope construction
- Evidence generation
- Independent verification
- Consumption Evidence finalization
- Governed append-only execution-evidence persistence
- Recovery or finalization replay where applicable

### Shared Contract Restrictions

Shared contracts must not expose:

- Vendor names
- Production model names
- Provider API payloads
- Chat-completions schemas
- Provider-specific roles
- Temperature, top-p, top-k, or vendor sampling controls
- Provider tokenizers
- API keys
- Credentials
- Network endpoints
- Filesystem paths
- SQL tables
- Database handles
- Agent runtime types
- Hermes types
- MCP types

---

## 6. Implement the Reasoning Invocation Request

Implement a strict, versioned Reasoning Invocation Request.

It must bind:

- Invocation Request ID
- Delivery transaction ID
- Delivery Envelope ID and fingerprint
- Delivery Receipt ID and fingerprint
- Context Package ID and fingerprint
- Active Snapshot binding
- Registry integrity binding
- Consumer ID and Descriptor fingerprint
- Policy Decision Evidence fingerprint
- Invocation purpose
- Provider Capability requirements
- Provider-neutral Reasoning Input
- Execution Policy
- Invocation idempotency key
- Request actor
- Request reason
- Requested-at evidence
- Canonical Invocation Request fingerprint

Reject:

- Unknown fields
- Unsupported versions
- Empty purpose
- Empty reason
- Invalid identifiers
- Invalid Delivery transaction
- Forged Envelope or Receipt binding
- Forged Context Package binding
- Consumer substitution
- Policy Evidence substitution
- Unsupported input content
- Contradictory Execution Policy
- Invalid idempotency key
- Physical paths
- Credential-bearing keys or values
- Accessor-backed input
- Noncanonical text
- Forged Invocation fingerprint

The Invocation Request must not contain:

- Provider credentials
- Real provider selection
- Production model ID
- Tool definitions
- Agent instructions
- Hidden knowledge
- Raw Knowledge Objects
- Full Query Results

---

## 7. Verify Durable Delivery Before Invocation

Before Invocation acceptance:

1. Resolve the exact committed Milestone 12 Delivery transaction.
2. Verify the complete Delivery Ledger integrity required by the operation.
3. Verify Delivery Request registration.
4. Verify idempotency ownership.
5. Verify Delivery Envelope.
6. Verify Consumer Acknowledgment.
7. Verify Delivery Receipt.
8. Verify Context Package.
9. Verify Active Snapshot and Registry bindings.
10. Verify Consumer identity.
11. Verify Policy Decision Evidence.
12. Verify Freshness and historical delivery rules.
13. Verify no-context-bypass evidence.

Fail closed on any mismatch.

Do not allow a public Invocation API that accepts an arbitrary Envelope-like object and bypasses durable Delivery verification.

---

## 8. Implement Provider-Neutral Reasoning Input

Implement strict, versioned provider-neutral input contracts.

Support stable Instruction Blocks such as:

- System constraint
- Task instruction
- Context reference
- Output requirement
- Evaluation directive

Each block must include:

- Stable block ID
- Block type
- Canonical text
- Priority
- Source classification
- Block fingerprint

The input must also include:

- Exact Context Package reference
- Exact Delivery Envelope reference
- Output requirements
- Constraint blocks
- Evaluation metadata where applicable
- Canonical input fingerprint

### Required Restrictions

Do not use:

- OpenAI-style message roles as the canonical shared contract
- Anthropic-specific content blocks
- Google-specific request structure
- Vendor model parameters
- Tool call payloads
- Hidden context
- Extra knowledge outside the Delivery Envelope

Reject:

- Duplicate block IDs
- Unsupported block types
- Noncanonical text
- Context reference mismatch
- Physical paths
- Credentials
- Accessor-backed blocks
- Forged block or input fingerprints

---

## 9. Implement Provider Capability Descriptors

Implement a strict, versioned Provider Capability Descriptor.

It must support:

- Provider Capability ID
- Provider class
- Accepted Invocation Request versions
- Accepted Delivery Envelope versions
- Accepted input content types
- Maximum input character count
- Maximum output character count
- Supported timeout range
- Supported cancellation modes
- Supported retry modes
- Supported deterministic execution mode
- Supported Usage Evidence
- Supported Cost Evidence
- Supported Failure Evidence
- Supported Result Envelope versions
- Descriptor fingerprint

Initial provider-neutral classes may include:

- `deterministic-fake-provider`
- `remote-reasoning-provider`
- `local-reasoning-provider`
- `evaluation-provider`

Only `deterministic-fake-provider` may be instantiated in Milestone 13.

Reject:

- Unknown fields
- Unsupported versions
- Empty capability identity
- Duplicate accepted versions
- Non-positive limits
- Contradictory capabilities
- Provider-specific secret fields
- Vendor or production-model coupling
- Forged Descriptor fingerprints

---

## 10. Implement Capability Matching

Create a deterministic compatibility result between:

- Invocation Request
- Provider-neutral input
- Execution Policy
- Provider Capability Descriptor

Validate at least:

- Invocation contract version
- Delivery Envelope version
- Input content types
- Input character count
- Output character limit
- Timeout range
- Cancellation mode
- Retry mode
- Deterministic-mode requirement
- Usage Evidence requirement
- Cost Evidence requirement
- Failure Evidence requirement
- Result Envelope version

Return:

- Compatible or incompatible status
- Stable ordered reason codes
- Exact mismatched fields
- Invocation Request fingerprint
- Provider Capability fingerprint
- Compatibility-result fingerprint

Capability mismatch must fail before execution.

Do not modify or downgrade the Invocation Request to create compatibility.

---

## 11. Implement Execution Policy and Budgets

Implement a strict, versioned Execution Policy.

It must support:

- Maximum input character count
- Maximum output character count
- Timeout duration
- Cancellation policy
- Retry policy
- Maximum attempt count
- Deterministic mode requirement
- Usage Evidence requirement
- Cost Evidence requirement
- Failure Evidence requirement
- Result persistence requirement
- Explicit evaluation timestamp
- Policy fingerprint

### Authoritative Milestone 13 budgets

Use:

- Input characters
- Output characters
- Attempt count
- Timeout duration

Do not require a provider-specific tokenizer.

Optional estimated token-like units may exist only as evidence with a documented deterministic method.

### Retry modes

Support versioned modes such as:

- `no-retry`
- `retry-deterministic-transient-failure`
- `retry-until-attempt-limit`
- `evaluation-only-retry`

### Cancellation modes

Support versioned modes such as:

- `not-cancellable`
- `cancel-before-execution`
- `cooperative-cancellation`
- `deadline-cancellation`

Reject contradictory limits and policies.

---

## 12. Implement Invocation Idempotency

Invocation idempotency must be explicit and governed.

### Identical request

Same Invocation idempotency key plus identical canonical Invocation Request:

- Return the original finalized Result and Consumption Evidence.
- Do not execute a new fake-provider attempt after finalization.

### Conflicting request

Same Invocation idempotency key plus different canonical Invocation Request:

- Fail closed.

### In-progress request

The system must explicitly classify an Invocation that is already in progress.

Do not create two concurrent finalized owners of the same idempotency key.

### Durable behavior

Use a storage-independent execution-evidence port or a compatible versioned extension to the Milestone 12 ledger.

Do not expose arbitrary record insertion.

Persist or recover:

- Invocation ownership
- Attempt history
- Finalized result identity
- Consumption Evidence identity

The implementation may use the existing local durable pattern, but it must not couple shared contracts to filesystem concepts.


---

## 13. Implement Execution Attempt Lifecycle

Every execution attempt must be immutable and independently identifiable.

An Attempt must bind:

- Execution Attempt ID
- Invocation Request ID and fingerprint
- Invocation idempotency key
- Provider Capability ID and fingerprint
- Execution Policy fingerprint
- Attempt number
- Previous Attempt ID when applicable
- Explicit started-at evidence
- Explicit deadline evidence when applicable
- Cancellation state
- Attempt fingerprint

### Attempt ordering

Attempt numbers must be:

- Positive
- Sequential
- Unique within the Invocation
- Derived from authoritative attempt history

Do not use wall-clock time as the ordering authority.

### Attempt final states

Each Attempt must terminate as exactly one of:

- Succeeded
- Failed
- Timed out
- Cancelled

Reject contradictory states.

A retry creates a new Attempt.

A retry must never rewrite or delete a prior Attempt.

---

## 14. Implement the Provider-Neutral Execution Port

Create a replaceable execution interface.

The port accepts only:

- Verified Invocation Request
- Verified Delivery bindings
- Verified Provider Capability Descriptor
- Verified Compatibility Result
- Verified Execution Policy
- Explicit Attempt identity
- Explicit evaluation timestamp
- Explicit cancellation signal abstraction
- Deterministic fixture configuration for the fake provider

The port returns one provider-neutral outcome:

- Success
- Failure
- Timeout
- Cancelled

### Port restrictions

The port must not:

- Query KnowledgeOS
- Access the Repository
- Read corpus files
- Read raw Knowledge Objects
- Read full Query Results
- Modify the Context Package
- Add hidden context
- Select a real provider
- Read environment credentials
- Read API keys
- Call the network
- Perform tool calling
- Create Agent actions
- Invoke Hermes
- Invoke MCP

Do not export infrastructure methods that allow a less-governed execution path.

---

## 15. Implement the Deterministic Fake Provider

Implement exactly one fake provider adapter.

For identical:

- Invocation Request
- Delivery Envelope
- Provider Capability Descriptor
- Execution Policy
- Attempt number
- Explicit evaluation time
- Fixture mode

the adapter must return byte-identical canonical output.

### Required deterministic modes

Implement fixtures for at least:

- Successful structured response
- Successful empty response
- Output-budget overflow
- Deterministic transient failure
- Deterministic permanent failure
- Timeout
- Cancellation before execution
- Cooperative cancellation
- Malformed success outcome
- Malformed failure outcome
- Contradictory outcome
- Physical-path-bearing outcome
- Credential-bearing outcome

### Success content

A success response may be deterministically derived from:

- Invocation Request fingerprint
- Context Package fingerprint
- Instruction Block fingerprints
- Attempt number
- Fixture mode

It must not invent or retrieve hidden organizational knowledge.

### Forbidden fake-provider behavior

Do not:

- Access the internet
- Read environment credentials
- Use randomness
- Read implicit wall-clock time
- Read machine-specific paths
- Depend on checkout location
- Depend on map iteration order
- Depend on locale-sensitive sorting

---

## 16. Implement Retry Semantics

Retries are permitted only when authorized by the verified Execution Policy.

A retry must:

- Preserve the original Invocation Request
- Preserve the Delivery transaction binding
- Preserve the Delivery Envelope binding
- Preserve the Delivery Receipt binding
- Preserve the Context Package binding
- Preserve the Consumer binding
- Preserve Provider Capability requirements
- Increment the Attempt number
- Reference the previous Attempt
- Re-evaluate explicit timeout and cancellation state
- Produce new immutable Attempt Evidence

### Transient failure

A deterministic transient failure may be retried only when:

- The Retry Policy permits it.
- The maximum Attempt count has not been reached.
- The Invocation is not cancelled.
- The deadline is not exceeded.

### Permanent failure

A permanent failure must not be retried unless an explicit evaluation-only policy permits a test-only Attempt.

### Attempt exhaustion

When the Attempt limit is reached:

- Stop execution.
- Produce stable terminal Failure Evidence.
- Finalize the Invocation according to the approved policy.

### Retry idempotency

Retrying the same Attempt ID and same canonical Attempt request must return the original Attempt outcome.

Conflicting reuse of an Attempt ID must fail.

---

## 17. Implement Timeout Semantics

All timeout logic must use:

- Explicit timestamps
- Injected clock abstractions
- Deterministic fake-provider elapsed evidence

Do not read current time inside pure domain logic.

Timeout Evidence must bind:

- Execution Attempt ID
- Configured timeout
- Attempt start evidence
- Deadline evidence
- Deterministic elapsed evidence
- Timeout phase
- Stable reason code
- Timeout Evidence fingerprint

A timed-out Attempt must not contain contradictory success output.

If retry is permitted:

- Create a new Attempt.
- Preserve the timed-out Attempt evidence.
- Re-evaluate current deadline and cancellation state.

---

## 18. Implement Cancellation Semantics

Cancellation must be explicit and evidence-bearing.

Support:

- Cancellation before execution
- Cooperative cancellation during execution
- Deadline cancellation

Cancellation Evidence must bind:

- Invocation Request
- Execution Attempt
- Cancellation mode
- Cancellation phase
- Cancellation authority reference
- Requested-at evidence
- Observed-at evidence
- Stable reason codes
- Cancellation Evidence fingerprint

A cancelled Attempt must:

- Never be marked as successful
- Never produce contradictory output
- Remain immutable
- Remain in Attempt history

Do not implement platform-specific process termination or remote-provider cancellation.

---

## 19. Implement the Reasoning Result Envelope

Implement a strict, versioned, immutable Result Envelope.

It must include:

- Result Envelope ID
- Invocation Request ID and fingerprint
- Invocation idempotency key
- Delivery transaction ID
- Delivery Envelope ID and fingerprint
- Delivery Receipt ID and fingerprint
- Context Package ID and fingerprint
- Consumer ID and Descriptor fingerprint
- Provider Capability ID and fingerprint
- Execution Policy fingerprint
- Execution Attempt ID
- Attempt number
- Outcome status
- Canonical output content
- Output content fingerprint
- Execution Receipt
- Usage Evidence
- Cost Evidence
- Failure Evidence when applicable
- Timeout Evidence when applicable
- Cancellation Evidence when applicable
- Completed-at evidence
- Canonical Result Envelope fingerprint

### Outcome consistency

#### Succeeded

Must include:

- Valid output content
- Output fingerprint
- Execution Receipt
- Usage Evidence
- Cost Evidence

Must not include terminal Failure, Timeout, or Cancellation Evidence.

#### Failed

Must include Failure Evidence.

Must not include contradictory successful output.

#### Timed out

Must include Timeout Evidence.

Must not include contradictory successful output.

#### Cancelled

Must include Cancellation Evidence.

Must not include contradictory successful output.

### Output budget

Enforce the maximum canonical output character count.

Do not silently truncate provider output unless an approved versioned policy explicitly permits it.

The default Milestone 13 behavior should be:

```text
Output over budget -> fail closed with explicit evidence.
```

---

## 20. Implement Execution Receipt and Operational Evidence

### Execution Receipt

The Receipt must bind:

- Execution Attempt ID
- Invocation Request ID and fingerprint
- Provider Capability ID and fingerprint
- Attempt number
- Started-at evidence
- Completed-at evidence
- Outcome
- Canonical Receipt fingerprint

### Usage Evidence

Include provider-neutral measures:

- Input character count
- Output character count
- Instruction Block count
- Context Package object count
- Attempt number
- Duration evidence
- Optional deterministic estimated input units
- Optional deterministic estimated output units
- Usage Evidence fingerprint

Do not claim real provider token counts.

### Cost Evidence

Support statuses such as:

- Actual
- Estimated
- Unavailable
- Not applicable

When amount is present, bind:

- Currency code
- Amount in minor units
- Estimation method
- Pricing reference version
- Cost Evidence fingerprint

The deterministic fake provider should use:

- `not-applicable`, or
- Deterministic zero-cost evidence

Do not introduce real provider pricing tables in Milestone 13.

### Failure Evidence

Bind:

- Failure category
- Stable reason codes
- Retryable classification
- Sanitized failure detail
- Attempt number
- Failure Evidence fingerprint

Do not expose:

- Stack traces in public canonical evidence
- Physical paths
- Environment values
- Credentials
- Provider secrets

---

## 21. Implement Independent Result Verification

Implement pure verification for:

- Invocation Request
- Provider-neutral input
- Provider Capability Descriptor
- Compatibility Result
- Execution Policy
- Execution Attempt
- Execution Receipt
- Usage Evidence
- Cost Evidence
- Failure Evidence
- Timeout Evidence
- Cancellation Evidence
- Result Envelope
- Final Consumption Evidence

Verification must recompute:

- Canonical fingerprints
- Character budgets
- Attempt ordering
- Outcome consistency
- Cross-artifact bindings
- Delivery transaction binding
- Context Package binding
- Provider Capability binding
- Execution Policy binding
- Finalization binding

Detect and reject:

- Delivery substitution
- Receipt substitution
- Context Package substitution
- Consumer substitution
- Provider Capability substitution
- Execution Policy substitution
- Attempt-number substitution
- Output mutation
- Usage mutation
- Cost mutation
- Failure mutation
- Timeout mutation
- Cancellation mutation
- Outcome contradiction
- Reordering
- Missing evidence
- Physical-path leakage
- Credential leakage
- Re-signed semantic substitutions

Fail closed.

Do not silently repair authoritative evidence.

---

## 22. Finalize Consumption Evidence

Extend the Milestone 11 Consumption Evidence placeholder into a finalized, strict, versioned record.

It must bind:

- Consumption ID
- Delivery Receipt ID and fingerprint
- Delivery transaction ID
- Invocation Request ID and fingerprint
- Invocation idempotency key
- Provider Capability ID and fingerprint
- Final Result Envelope ID and fingerprint
- Final outcome
- Attempt history summary
- Started-at evidence
- Completed-at evidence
- Usage Evidence fingerprint
- Cost Evidence fingerprint
- Failure, Timeout, or Cancellation Evidence fingerprint when applicable
- Durable execution-evidence transaction reference
- Canonical Consumption Evidence fingerprint

### Finalization rules

- Consumption cannot finalize before a terminal Result Envelope exists.
- Exactly one final Consumption Evidence record may own one finalized Invocation.
- Identical finalization retry returns the original finalized record.
- Conflicting finalization fails.
- Finalization never modifies Delivery artifacts.
- Finalization never rewrites Attempt history.
- Finalized evidence is append-only when persisted.

---

## 23. Implement the Durable Execution-Evidence Boundary

Implement a storage-independent port or compatible versioned extension to the Milestone 12 durable ledger.

The governed persistence boundary must support:

- Register Invocation ownership
- Append Execution Attempt
- Finalize Invocation Result
- Store Result Envelope
- Store finalized Consumption Evidence
- Resolve Invocation idempotency
- Read Attempt history
- Read finalized result
- Recover finalized state
- Verify execution-evidence integrity

### Required durability behavior

If persistence is implemented through a local adapter:

- Use append-only authoritative records.
- Use explicit single-writer behavior.
- Use expected-head compare-and-swap.
- Use atomic committed transaction envelopes.
- Ignore staging and partial files during recovery.
- Keep derived indexes non-authoritative.
- Preserve physical-path and credential privacy.
- Reuse Milestone 09 and 12 safety patterns where appropriate.

### Public API restriction

Do not export low-level methods that allow:

- Arbitrary Result insertion
- Arbitrary Consumption Evidence insertion
- Attempt history rewriting
- Invocation ownership reassignment
- Finalization without verification
- Deletion of authoritative evidence

---

## 24. Preserve the No-Provider-Bypass Rule

The public governed Invocation API must reject:

- Raw Knowledge Objects
- Full Query Results
- Direct Repository access
- Direct corpus access
- Unverified Context Packages
- Unverified Delivery Envelopes
- Unverified Delivery Receipts
- Hidden context
- Provider-specific prompt injection
- Production model selection
- Credential-bearing input
- Physical paths
- Accessor-backed input
- Provider Capability substitution
- Execution Policy substitution
- Fake Result Envelope injection
- Result construction without an Attempt
- Evidence stripping
- Result mutation after finalization

Every successful Result must have a complete chain:

```text
Active Snapshot
        ->
Context Package
        ->
Delivery Envelope
        ->
Delivery Receipt
        ->
Invocation Request
        ->
Provider Capability
        ->
Execution Attempt
        ->
Result Envelope
        ->
Consumption Evidence
```

---

## 25. Add Deterministic Evaluation Fixtures

Add executable evaluation scenarios covering at least:

### Successful execution

- Successful structured fake-provider response
- Successful empty response when policy permits
- Deterministic repeated execution
- Restart and finalized-result lookup when persistence is present

### Delivery binding

- Missing Delivery transaction
- Envelope substitution
- Receipt substitution
- Context Package substitution
- Consumer substitution
- Registry-binding substitution

### Capability matching

- Invocation version mismatch
- Delivery version mismatch
- Unsupported input content type
- Input budget mismatch
- Output budget mismatch
- Unsupported timeout
- Unsupported cancellation mode
- Unsupported retry mode
- Missing Usage Evidence capability
- Missing Cost Evidence capability
- Missing Failure Evidence capability

### Idempotency

- First Invocation ownership
- Identical finalized retry
- Conflicting key reuse
- In-progress duplicate request
- Conflicting finalization

### Retry

- Transient failure followed by success
- Permanent failure with no retry
- Attempt-limit exhaustion
- Identical Attempt retry
- Conflicting Attempt ID reuse

### Timeout

- Timeout without retry
- Timeout followed by permitted retry
- Contradictory success plus Timeout Evidence
- Deadline already expired

### Cancellation

- Cancel before execution
- Cooperative cancellation
- Deadline cancellation
- Contradictory success plus Cancellation Evidence

### Evidence integrity

- Output mutation
- Usage Evidence mutation
- Cost Evidence mutation
- Failure Evidence mutation
- Timeout Evidence mutation
- Cancellation Evidence mutation
- Execution Receipt mutation
- Result Envelope mutation
- Consumption Evidence mutation
- Re-signed semantic substitution

### Fake-provider safety

- Network access attempt
- Environment credential access attempt
- Randomness attempt
- Implicit wall-clock dependence
- Physical-path-bearing output
- Credential-bearing output
- Malformed outcome
- Contradictory outcome

### No-provider-bypass

- Raw Knowledge Object attempt
- Full Query Result attempt
- Hidden context injection
- Provider-specific payload injection
- Fake preconstructed Result attempt
- Low-level finalization bypass attempt

Define expected:

- Outcome status
- Stable reason codes
- Attempt count
- Attempt identities
- Result identity
- Usage and Cost Evidence
- Final Consumption Evidence
- Idempotency behavior
- Durability behavior
- Fingerprints

---

## 26. Add Comprehensive Tests

Add focused tests in these categories.

### Contract tests

- Strict validation
- Unknown-field rejection
- Unsupported versions
- Invalid identifiers
- Duplicate Instruction Block IDs
- Explicit-undefined rejection where required
- Accessor-safe validation
- Noncanonical text rejection
- Canonical normalization
- Fingerprint round trips
- Forged fingerprint rejection

### Delivery-resolution tests

- Exact durable Delivery lookup
- Ledger-integrity verification
- Envelope verification
- Receipt verification
- Context Package verification
- Consumer binding
- Policy binding
- Historical Delivery support where allowed
- Substitution rejection

### Capability tests

- Every supported compatibility field
- Exact boundary values
- Stable reason ordering
- No silent downgrade
- No silent input mutation
- No execution after incompatibility

### Execution Policy tests

- Input budget
- Output budget
- Timeout
- Attempt limits
- Retry modes
- Cancellation modes
- Evidence requirements
- Contradictory policy rejection

### Fake-provider tests

- Deterministic success
- Deterministic empty success
- Transient failure
- Permanent failure
- Timeout
- Cancellation
- Output overflow
- Malformed outcome
- Contradictory outcome
- No network
- No credentials
- No randomness
- No implicit time

### Invocation idempotency tests

- First ownership
- Identical finalized retry
- Conflicting request
- In-progress duplicate
- Restart recovery if persisted
- Conflicting finalization

### Attempt and retry tests

- Attempt creation
- Attempt ordering
- Prior-attempt binding
- Transient retry
- Attempt exhaustion
- Identical Attempt retry
- Conflicting Attempt reuse
- Prior Attempt immutability

### Result and evidence tests

- Success Result
- Failure Result
- Timeout Result
- Cancellation Result
- Outcome consistency
- Execution Receipt
- Usage Evidence
- Cost Evidence
- Failure Evidence
- Timeout Evidence
- Cancellation Evidence
- Output-budget enforcement
- Independent verification
- Tamper rejection

### Consumption finalization tests

- Valid finalization
- Finalization before terminal Result rejection
- Identical finalization replay
- Conflicting finalization
- Durable lookup
- Attempt-history summary
- Delivery-to-Result chain verification

### No-provider-bypass tests

- Raw Knowledge Object rejection
- Full Query Result rejection
- Direct Repository bypass rejection
- Unverified Delivery rejection
- Hidden context rejection
- Provider-specific payload rejection
- Result injection rejection
- Evidence stripping rejection
- Credential rejection
- Physical-path rejection

### Regression tests

- Keep all Milestone 04–12 tests green.
- Preserve Milestone 10 Context Package governance.
- Preserve Milestone 11 Delivery governance.
- Preserve Milestone 12 durable idempotency, replay, recovery, and audit-chain guarantees.


---

## 27. Architectural Constraints

Do not implement:

- OpenAI adapter
- Anthropic adapter
- Google adapter
- Local production-model adapter
- Any real provider adapter
- Provider credentials
- Secret management
- Provider API clients
- Network execution
- Streaming output
- Tool calling
- Function calling
- Agent runtime
- Hermes runtime
- MCP gateway
- Autonomous planning
- Authentication
- Authorization engine
- Semantic search
- Embeddings
- Vector databases
- Ranking
- Knowledge graphs
- UI
- Distributed execution coordination
- Distributed idempotency
- Multi-provider routing
- Provider failover
- Real provider pricing catalogs

Do not add a framework or dependency unless the current Node.js and TypeScript platform cannot satisfy the approved deterministic contracts.

If a dependency is unavoidable, first document:

- Requirement
- Alternatives
- Security impact
- Determinism impact
- Durability impact
- Provider-neutrality impact
- Architecture decision

in `ARCHITECTURE_DECISIONS.md`.

---

## 28. Engineering Rules

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
- Immutable authoritative artifacts
- Accessor-safe raw validation
- Explicit time injection
- No implicit randomness
- Stable public errors
- No physical-path leakage
- No credential leakage
- Pure canonicalization, compatibility, budget, idempotency, attempt, and verification functions
- Tests for every behavior change

Use:

- OS temporary directories, or
- Explicit isolated test roots

Do not write tests into the developer's real runtime ledger.

Never modify canonical `docs/` or `knowledge/` sources.

If the checkout is under an iCloud-managed directory:

- Keep runtime and test fixtures outside file-provider-managed paths when possible.
- Do not rely on hydration timing for correctness.
- Do not commit hydrated duplicates or conflict files.

---

## 29. Documentation Updates

Update only documentation that reflects implemented behavior:

- Root `README.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGELOG.md`
- Relevant package READMEs
- Public exports
- `ARCHITECTURE_DECISIONS.md`

Add an ADR documenting:

- Provider-Neutral Reasoning Invocation boundary
- Exact durable Delivery binding
- Provider Capability Descriptor
- Provider-neutral input representation
- Execution Policy and authoritative budgets
- Deterministic fake provider
- Invocation idempotency
- Attempt lifecycle
- Retry, timeout, and cancellation semantics
- Result Envelope identity
- Usage and Cost Evidence
- Failure, Timeout, and Cancellation Evidence
- Consumption Evidence finalization
- Durable execution-evidence boundary
- No-provider-bypass rule
- Deferred real provider adapters
- Deferred streaming
- Deferred tool calling
- Deferred Agent, Hermes, and MCP
- Deferred authorization

Do not document speculative production-provider behavior as implemented.

---

## 30. Verification Gates

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

All Milestone 04–12 regressions and all new Milestone 13 tests must pass.

Inspect:

```bash
git status
```

Confirm:

- Only intended Milestone 13 changes exist.
- No real provider credentials exist.
- No provider API configuration is staged.
- No generated Invocation Requests are staged.
- No generated Result Envelopes are staged.
- No generated Consumption Evidence is staged.
- No execution-ledger runtime records are staged.
- No fake-provider output is staged.
- No lock, staging, or temporary files are staged.
- `.DS_Store` is excluded.
- iCloud conflicts are excluded.
- Generated `dist/` directories are excluded.
- Physical-path-bearing debug files are excluded.
- Credential-bearing files are excluded.

---

## 31. Independent Whole-Branch Review

After all verification passes, perform an independent whole-branch review focused on:

- Milestone 12 Delivery verification bypass
- Raw Knowledge Object bypass
- Full Query Result bypass
- Unverified Delivery Envelope acceptance
- Unverified Delivery Receipt acceptance
- Context Package substitution
- Consumer substitution
- Policy Evidence substitution
- Provider Capability substitution
- Execution Policy substitution
- Hidden context injection
- Provider-specific payload leakage
- Accidental real provider call
- Accidental network call
- Environment credential access
- Randomness
- Implicit wall-clock use
- Invocation idempotency conflict
- Duplicate finalized owner
- Attempt-number race
- Prior Attempt mutation
- Retry-policy bypass
- Attempt-limit bypass
- Timeout represented as success
- Cancellation represented as success
- Output-budget bypass
- Malformed fake-provider outcome acceptance
- Result Envelope forgery
- Usage Evidence forgery
- Cost Evidence forgery
- Failure Evidence forgery
- Consumption Evidence forgery
- Finalization before terminal Result
- Conflicting finalization
- Derived index treated as authoritative
- Authoritative corruption silently repaired
- Mutable aliasing across asynchronous boundaries
- Accessor execution
- Physical-path leakage
- Credential leakage
- Provider or model coupling
- Accidental Agent, Hermes, or MCP invocation

Fix every Critical, Important, or Minor finding before declaring `GO`.

Otherwise return `NOT READY` with exact unresolved findings.

---

## 32. Commit and Pull Request Rules

Prepare the result as commit-ready.

Do not merge into `main`.

If the user has not explicitly authorized commit and push:

- Leave the changes uncommitted.
- Report that state.

If explicitly authorized:

1. Create one clean conventional milestone commit.
2. Push `codex/milestone-13`.
3. Prepare a Pull Request into `main`.
4. Do not merge locally.
5. Do not merge remotely.

Never discard completed work.

---

## 33. Completion Report

Return a report titled:

# FounderOS Milestone 13 Completion Report

Include:

1. Status: `GO` or `NOT READY`
2. Branch
3. Base branch
4. Worktree state
5. Commit state
6. Push state
7. Implementation summary
8. Exact Reasoning Invocation workflow
9. Exact Attempt and Retry workflow
10. Exact Consumption Evidence finalization workflow
11. All added files
12. All modified files
13. Tests added by category
14. Final total test count
15. Exact verification results
16. Durable Delivery-binding evidence
17. Provider Capability matching evidence
18. Provider-neutral input evidence
19. Execution Policy and budget evidence
20. Fake-provider determinism evidence
21. Invocation idempotency evidence
22. Attempt ordering and retry evidence
23. Timeout evidence
24. Cancellation evidence
25. Result Envelope evidence
26. Usage and Cost Evidence
27. Failure Evidence
28. Consumption Evidence finalization evidence
29. Durable execution-evidence and recovery evidence
30. Tamper and substitution rejection evidence
31. No-provider-bypass evidence
32. Architecture impact
33. Dependency direction
34. Known limitations
35. Deliberately deferred capabilities
36. Independent review findings
37. Recommended next milestone
38. Pull Request readiness

---

## 34. GO Standard

Milestone 13 may be reported as `GO` only when FounderOS can:

- Resolve and verify one exact durable Milestone 12 Delivery transaction
- Verify its Envelope, Receipt, Context Package, Consumer, Policy, Active Snapshot, and Registry bindings
- Create a strict provider-neutral Reasoning Invocation Request
- Match it deterministically to a Provider Capability Descriptor
- Enforce provider-neutral input, output, timeout, retry, cancellation, and Attempt budgets
- Execute only through a deterministic fake provider
- Produce immutable Success, Failure, Timeout, or Cancellation Attempt evidence
- Enforce Invocation idempotency
- Preserve immutable ordered Attempt history
- Produce and independently verify a Reasoning Result Envelope
- Produce and independently verify Execution Receipt, Usage, Cost, Failure, Timeout, and Cancellation Evidence
- Finalize one exact Consumption Evidence record
- Persist or durably bind append-only execution evidence through a governed storage-independent boundary
- Reject partial, corrupt, substituted, contradictory, hidden, credential-bearing, physical-path-bearing, or forged artifacts
- Preserve all Milestone 10–12 no-bypass, durability, replay, and audit guarantees
- Complete the full workflow without invoking a real provider, network service, Agent, Hermes runtime, or MCP integration

Prioritize traceability, deterministic execution evidence, provider neutrality, idempotency, attempt integrity, and result verification over production intelligence or provider integration.
