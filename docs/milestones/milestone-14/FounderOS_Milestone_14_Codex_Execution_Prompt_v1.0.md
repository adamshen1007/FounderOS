# FounderOS Milestone 14 Codex Execution Prompt v1.0

## Role and Mission

You are the lead engineer responsible for implementing **FounderOS Milestone 14 — Production Reasoning Provider Readiness and Secure Adapter Boundary Foundation**.

Your responsibility is to implement the milestone completely, preserve every Milestone 04–13 governance, durability, evidence, and no-bypass guarantee, prove that all production-provider readiness controls are independently verifiable, and keep real provider execution structurally disabled.

Do not stop after analysis or planning.

Do not declare completion unless:

- Every required verification gate passes.
- Every Milestone 04–13 regression remains green.
- The final independent whole-branch review has no unresolved Critical, Important, or Minor findings.
- Tests prove that no real network request, credential use, production provider call, Agent, Hermes, or MCP execution can occur.

Milestone 14 must not call OpenAI, Anthropic, Google, a local production model, or any other real provider.

---

## 1. Repository Preparation

Before modifying any file:

1. Fetch the latest remote state.
2. Confirm Milestone 13 has been merged into the latest `main`.
3. Confirm the work is based on that merged state.
4. Create or switch to:

```bash
codex/milestone-14
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

Do not reset, discard, rewrite, amend, move, delete, or hide unrelated work.

If unrelated changes exist:

- Report them clearly.
- Isolate Milestone 14 safely.
- Continue only when the milestone can remain separate.

Do not commit:

- `.DS_Store`
- iCloud duplicate or conflict files
- Local runtime ledgers
- Generated Request Plans
- Generated Readiness Decisions
- Generated observability output
- Credential fixtures containing secret-like material
- Lock files
- Staging files
- Temporary files
- Generated `dist/` directories
- Evaluation outputs
- Test artifacts
- Physical-path-bearing debug files
- Environment dumps
- API keys, tokens, credentials, or secret-bearing files

---

## 2. Required Reading

Read and follow:

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
- Every approved specification under `docs/milestones/milestone-14/`
- Current implementation under `packages/knowledge-schema/`
- Current implementation under `services/knowledge-engine/`

Treat the approved Milestone 14 specification set as the implementation authority.

Understand and preserve:

- Milestone 04 migration and provenance authority
- Milestone 05 deterministic Query behavior
- Milestone 06 Repository boundaries
- Milestone 07 Snapshot identity
- Milestone 08 lifecycle governance
- Milestone 09 durable Registry, audit chain, recovery, and integrity
- Milestone 10 Context Package governance and verification
- Milestone 11 Delivery, Policy, Consumer, Replay, Receipt, and no-context-bypass behavior
- Milestone 12 durable Delivery Ledger, permanent idempotency ownership, atomic transactions, restart recovery, and filesystem safety
- Milestone 13 provider-neutral Invocation, Capability matching, Fake Provider execution, Attempts, Results, Usage, Cost, Failure, Timeout, Cancellation, Consumption Evidence, execution-evidence durability, and no-provider-bypass behavior

Do not create competing systems for:

- Context Assembly
- Delivery
- Durable Delivery
- Reasoning Invocation
- Provider Capability
- Execution Policy
- Result Envelope
- Consumption Evidence
- Fingerprinting
- Canonical serialization
- Durable execution evidence

Extend the existing architecture.

Preserve backward compatibility unless an approved Milestone 14 specification explicitly requires a compatible, versioned extension.

---

## 3. Milestone Objective

Implement the complete security and operational-readiness boundary required before the first real provider adapter can be enabled.

The system must be able to:

- Resolve one exact governed Milestone 13 Invocation.
- Verify all Delivery, Context, Consumer, Policy, Attempt, and Result-preparation bindings.
- Enforce explicit Authorization Decision Evidence.
- Accept only Credential References, never credentials.
- Validate a secure outbound Transport Policy.
- Build a deterministic, redacted dry-run Provider Request Plan.
- Map deterministic provider-response fixtures into provider-neutral evidence.
- Enforce rate, capacity, timeout, retry, cancellation, and cost admission.
- Evaluate Circuit and Provider Health state.
- Produce safe Logs, Metrics, Traces, and public errors.
- Produce one independently verifiable Provider Readiness Decision.
- Prove that adapter Enabled state and network execution are structurally unavailable.

The milestone must not send traffic or resolve real credentials.

---

## 4. Target Architecture

Implement:

```text
Governed Milestone 13 Invocation
        |
        v
Authorization Enforcement
        |
        v
Credential Reference Validation
        |
        v
Provider Capability and Adapter Validation
        |
        v
Secure Transport Policy Validation
        |
        v
Rate and Capacity Admission
        |
        v
Cost and Budget Admission
        |
        v
Circuit and Health Validation
        |
        v
Redacted Request Mapping Dry Run
        |
        v
Observability Readiness
        |
        v
Provider Readiness Decision
        |
        v
STOP: Production Transport Disabled
```

No execution path may proceed beyond dry-run planning.

---

## 5. Package Ownership and Dependency Rules

Maintain:

```text
knowledge-engine -> knowledge-schema
```

### `@founderos/knowledge-schema` owns

- Production Adapter Descriptor contracts
- Authorization Enforcement input and result contracts
- Credential Reference contracts
- Secure Transport Policy contracts
- Provider Request Plan contracts
- Provider Response Mapping evidence contracts
- Rate and Capacity Decision contracts
- Cost and Budget Decision contracts
- Circuit State contracts
- Provider Health and Readiness contracts
- Observability and Redaction contracts
- Provider Readiness Decision contracts
- Stable status and reason codes
- Verification-result contracts
- Contract versions
- Runtime schemas and inferred TypeScript types

### `@founderos/knowledge-engine` owns

- Milestone 13 Invocation and evidence verification
- Authorization enforcement
- Credential-reference validation
- Transport-policy evaluation
- Provider Request Plan construction
- Deterministic response-mapping fixtures
- Rate and Capacity admission
- Cost and Budget admission
- Circuit state transitions
- Provider Health evaluation
- Observability and Redaction processing
- Disabled production-adapter harness
- Readiness Decision construction and verification
- Application orchestration
- In-memory deterministic readiness state where required

### Shared Contract Restrictions

Shared contracts must not expose:

- Raw credentials
- Authorization headers
- API keys
- Secret values
- Network clients
- Sockets
- DNS resolver objects
- TLS library objects
- Vendor SDK types
- OpenAI, Anthropic, Google, or other provider request schemas
- Physical filesystem paths
- SQL or database handles
- Agent, Hermes, or MCP types

---

## 6. Implement the Production Adapter Descriptor

Implement a strict, versioned Production Provider Adapter Descriptor.

It must bind:

- Adapter ID
- Provider family reference
- Provider Capability Descriptor reference
- Request-mapping version
- Response-mapping version
- Transport-policy version
- Observability-policy version
- Credential Reference class
- Adapter state
- Adapter fingerprint

Supported Adapter states:

- `disabled`
- `validation-only`
- `dry-run-mapping`

Reject:

- `enabled`
- `live`
- `production`
- Any equivalent executable state
- Unknown fields
- Unsupported versions
- Empty IDs
- Provider secret material
- Executable URL fields
- Forged fingerprints

Only one disabled or dry-run adapter fixture is required.

---

## 7. Implement Authorization Enforcement

Implement a mandatory Authorization Enforcement operation.

It must receive and independently verify Authorization Decision Evidence bound to:

- Subject
- Consumer
- Invocation Request
- Delivery transaction
- Context Package
- Production Adapter
- Requested operation
- Decision authority
- Decision timestamp
- Expiration
- Decision fingerprint

Supported outcomes:

- `allowed`
- `denied`
- `review-required`
- `not-evaluated`
- `expired`
- `invalid-evidence`

Only `allowed` proceeds.

Enforce Authorization before:

- Credential Reference validation only
- Transport planning
- Rate admission
- Cost admission
- Request mapping

Milestone 14 must not implement authentication or an Authorization Decision engine.

Use deterministic caller-supplied fixtures.

---

## 8. Implement Credential References and Isolation

Implement strict Credential Reference contracts.

A Credential Reference may contain:

- Credential Reference ID
- Provider family reference
- Secret-store class
- Scope reference
- Environment class
- Rotation version
- Availability status
- Reference fingerprint

It must not contain:

- API key
- Token
- Password
- Secret bytes
- Authorization header
- Credential-bearing URL
- Environment variable value
- Serialized secret object

Milestone 14 must not resolve a real secret.

Implement deterministic fixture states such as:

- Available reference
- Unavailable reference
- Expired reference
- Invalid scope
- Wrong provider family
- Raw secret supplied
- Credential-like value supplied

Credential validation must happen before Transport Plan construction, but no secret value may be returned.

---

## 9. Implement Secure Outbound Transport Policy

Implement a strict, versioned Transport Policy.

It must support:

- Provider family reference
- Allowed scheme
- Allowed hostnames
- Allowed ports
- DNS policy
- Redirect policy
- TLS requirement
- Minimum TLS version
- Certificate-validation policy
- Connection timeout
- Request timeout
- Maximum request size
- Maximum response size
- Retry transport policy
- Proxy policy
- Egress classification
- Policy fingerprint

Required safe defaults:

- HTTPS only
- Explicit hostname allowlist
- No caller-supplied arbitrary endpoint
- No redirects
- Certificate validation required
- No credentials in URLs
- Reject loopback, private, link-local, multicast, metadata, reserved, and unspecified targets unless a future explicit internal-provider policy permits them
- Explicit request and response limits
- Explicit timeouts
- Sanitized transport errors

Milestone 14 must not:

- Open sockets
- Perform DNS resolution
- Perform TLS negotiation
- Send HTTP requests
- Call a network library

The output is a deterministic verified Transport Plan only.

---

## 10. Implement Request Mapping Dry Run

Implement deterministic provider request mapping.

Inputs:

- Verified Invocation Request
- Verified Delivery and Result-preparation bindings
- Verified Adapter Descriptor
- Verified Authorization Evidence
- Verified Credential Reference
- Verified Transport Policy
- Rate and Cost admission evidence
- Mapping policy version

Output a dry-run Request Plan containing:

- Request Plan ID
- Adapter ID and fingerprint
- Invocation ID and fingerprint
- Credential Reference ID
- Transport Policy ID and fingerprint
- Logical endpoint classification
- Method classification
- Redacted header plan
- Provider-neutral body mapping evidence
- Input-size evidence
- Timeout and cancellation plan
- Expected response constraints
- Stable warnings
- Request Plan fingerprint

Do not include:

- Live Authorization header
- Secret values
- Executable transport client
- Raw unredacted Context content
- Hidden context
- Tool definitions
- Function-call payloads
- Arbitrary URL
- Real model ID

The dry-run mapping must be byte stable for identical inputs.

---

## 11. Implement Response Mapping Fixtures

Implement deterministic provider-response fixture mapping.

Support fixtures for:

- Successful response
- Empty response
- Provider timeout
- Provider rate limit
- Provider server failure
- Invalid provider response
- Usage metadata
- Cost metadata
- Credential rejection
- Transport security failure
- Oversized response
- Redaction failure

Map fixtures into Milestone 13 provider-neutral:

- Execution outcome
- Output content
- Execution Receipt evidence
- Usage Evidence
- Cost Evidence
- Failure Evidence
- Timeout Evidence
- Cancellation Evidence
- Rate-limit Evidence
- Mapping Evidence

Do not accept a fixture result that bypasses Result Envelope verification.

Do not persist provider headers, raw error bodies, credential values, or secret-bearing metadata.

---

## 12. Implement Rate and Capacity Admission

Implement deterministic pre-transport admission controls.

Support:

- Requests per governed time window
- Concurrent in-flight limit
- Maximum queue size
- Consumer or project quota
- Provider capacity state
- Priority class
- Retry-after evidence
- Explicit evaluation time

Outcomes:

- `admitted`
- `rate-limited`
- `capacity-exhausted`
- `queue-full`
- `provider-unavailable`
- `policy-denied`

Rules:

- Admission happens before Credential resolution into a future secret and before Transport.
- State is bounded.
- Time is injected explicitly.
- Stable reason ordering is deterministic.
- Rejection produces fingerprinted evidence.
- Milestone 14 performs simulation only.

---

## 13. Implement Cost and Budget Admission

Implement deterministic cost admission.

Inputs:

- Invocation Execution Policy
- Provider Capability Descriptor
- Adapter Descriptor
- Deterministic Pricing Reference fixture
- Estimated input units
- Maximum output units
- Attempt limit
- Timeout budget
- Consumer or project ceiling
- Currency
- Evaluation time

Output:

- Decision ID
- Invocation fingerprint
- Adapter fingerprint
- Pricing Reference version
- Estimated input usage
- Estimated output usage
- Estimated maximum cost
- Currency
- Ceiling
- Outcome
- Stable reason codes
- Decision fingerprint

Outcomes:

- `within-budget`
- `input-budget-exceeded`
- `output-budget-exceeded`
- `cost-ceiling-exceeded`
- `pricing-unavailable`
- `invalid-budget-evidence`
- `manual-review-required`

Rules:

- Admission happens before Transport.
- Unknown pricing fails closed when a cost ceiling is mandatory.
- Use deterministic fake pricing only.
- Do not claim actual billing.
- Use integer minor units and validated ISO currency identifiers where amount evidence exists.


---

## 14. Implement Circuit Breaker and Failure Containment

Implement deterministic Circuit State and transitions.

Supported states:

- `closed`
- `open`
- `half-open`
- `disabled`
- `quarantined`

Each state record must bind:

- Adapter ID
- Current state
- Previous state
- Transition reason
- Failure-window evidence
- Threshold policy
- Opened-at evidence
- Next evaluation evidence
- Probe allowance
- State fingerprint

Failure categories should include:

- Transport failure
- Timeout
- Rate limit
- Invalid response
- Response-mapping failure
- Credential unavailable
- Authorization failure
- Cost rejection
- Capacity rejection
- Security-policy violation

Required behavior:

- `disabled` never permits execution.
- `quarantined` never permits execution.
- `open` rejects normal requests.
- `half-open` permits only explicitly bounded dry-run probes.
- Security-policy violations may quarantine immediately.
- State transitions use explicit time.
- Thresholds and reason ordering are deterministic.
- Milestone 14 must not perform a live probe.

---

## 15. Implement Provider Health and Readiness State

Implement strict Health and Readiness contracts.

Health states:

- `unknown`
- `healthy`
- `degraded`
- `unavailable`
- `disabled`
- `quarantined`

Readiness states:

- `not-assessed`
- `not-ready`
- `ready-for-dry-run`
- `disabled-by-policy`

Do not implement or emit:

- `ready-for-live-traffic`
- `production-enabled`
- Any equivalent state

Health Evidence must bind:

- Adapter ID and fingerprint
- Health state
- Circuit state
- Credential Reference availability
- Authorization readiness
- Transport-policy readiness
- Rate and Capacity readiness
- Cost readiness
- Observability readiness
- Last evaluation evidence
- Stable reason codes
- Health fingerprint

Readiness must derive from verified evidence, not mutable flags.

---

## 16. Implement Observability and Redaction

Implement deterministic in-memory observability components for:

- Structured logs
- Metrics
- Traces
- Public error evidence

Allowed evidence may include:

- Invocation correlation ID
- Delivery transaction reference
- Adapter ID
- Request Plan fingerprint
- Outcome category
- Duration
- Usage summary
- Cost summary
- Rate-limit status
- Circuit state
- Retry count
- Stable error category

Never emit:

- Credential values
- Authorization headers
- Raw provider Request body
- Raw Context Package content
- Full provider Response body
- Physical paths
- Environment dumps
- Secret-bearing URLs
- API tokens
- Unbounded user content

Required safeguards:

- Redact before serialization or sink delivery.
- Apply key-based redaction.
- Apply value-pattern redaction.
- Reject or omit unknown sensitive fields by explicit policy.
- Bound log field lengths.
- Bound trace attribute lengths.
- Bound metric label cardinality.
- Do not use raw Invocation, Consumer, or user-generated text as metric labels.
- Public errors use logical stable identifiers.

No external logging, tracing, metrics, or monitoring service may be integrated.

---

## 17. Implement the Disabled Production Adapter Harness

Implement a harness whose structure makes live execution unavailable.

Supported modes:

- Contract validation
- Authorization validation
- Credential Reference validation
- Transport Plan dry run
- Request Mapping dry run
- Response Mapping fixture
- Rate and Cost admission simulation
- Circuit simulation
- Health evaluation
- Observability and Redaction simulation
- Full Readiness evaluation

The Harness must:

- Have no network execution method.
- Have no socket dependency.
- Have no DNS dependency.
- Have no raw credential parameter.
- Reject executable Adapter states.
- Reject arbitrary URLs.
- Use deterministic fixtures.
- Use explicit injected time.
- Produce immutable Readiness Evidence.
- Verify no Credential or path leakage.
- Never return a real provider response.

Tests must demonstrate that adding an `enabled` state, executable Transport callback, raw secret, or arbitrary endpoint fails.

---

## 18. Implement the Production Provider Readiness Decision

Implement a strict, versioned Readiness Decision.

It must bind:

- Readiness Decision ID
- Adapter ID and fingerprint
- Invocation Request ID and fingerprint
- Authorization Decision fingerprint
- Credential Reference fingerprint
- Capability Result fingerprint
- Transport Policy fingerprint
- Request Plan fingerprint
- Rate and Capacity Decision fingerprint
- Cost and Budget Decision fingerprint
- Circuit State fingerprint
- Health Evidence fingerprint
- Observability Readiness fingerprint
- Evaluation timestamp
- Readiness status
- Blocking reason codes
- Warning reason codes
- Canonical Decision fingerprint

Supported statuses:

- `not-assessed`
- `not-ready`
- `ready-for-dry-run`
- `disabled-by-policy`

Do not support live readiness.

Rules:

- All mandatory gates verify before `ready-for-dry-run`.
- Blocking reasons are deterministic and ordered.
- Warnings cannot override blockers.
- Enabled Adapter state is a blocker.
- Any raw Credential, path, secret, arbitrary URL, or network-execution evidence is a blocker.
- Decision verification recomputes every nested binding.

---

## 19. Enforce No-Direct-Provider-Bypass

The public Readiness API must reject:

- Direct provider HTTP calls
- Caller-supplied endpoints
- Raw credentials
- Provider execution without verified Authorization
- Provider execution without verified Delivery and Invocation
- Provider execution without Capability matching
- Provider execution without Rate and Cost admission
- Provider execution while Circuit is Open, Disabled, or Quarantined
- Provider execution without Redaction readiness
- Hidden context injection
- Raw Knowledge Objects
- Full Query Results
- Unverified Context Packages
- Unverified Delivery Envelopes or Receipts
- Provider-specific executable payload injection
- Adapter Enabled state
- Network callback injection
- Low-level Transport bypass
- Low-level readiness artifact insertion

The mandatory gate order is:

1. Verify durable Delivery and Invocation.
2. Verify Authorization.
3. Verify Adapter Descriptor.
4. Verify Credential Reference.
5. Verify Capability.
6. Verify Transport Policy.
7. Verify Rate and Capacity admission.
8. Verify Cost and Budget admission.
9. Verify Circuit and Health state.
10. Verify Observability and Redaction.
11. Construct the dry-run Request Plan.
12. Construct and verify Readiness Evidence.
13. Stop before Transport.

Do not export a public method that skips a gate.

---

## 20. Implement Independent Verification

Implement pure independent verification for:

- Production Adapter Descriptor
- Authorization Decision Evidence
- Credential Reference
- Transport Policy
- Request Plan
- Response Mapping Evidence
- Rate and Capacity Decision
- Cost and Budget Decision
- Circuit State
- Health Evidence
- Observability Readiness Evidence
- Production Provider Readiness Decision

Verification must recompute:

- Canonical fingerprints
- Exact Invocation and Delivery bindings
- Adapter bindings
- Authorization chronology
- Credential Reference constraints
- Host allowlist decisions
- Transport limits
- Input and Response size calculations
- Rate and Capacity arithmetic
- Cost arithmetic
- Circuit transitions
- Health state derivation
- Blocking and Warning reason ordering
- Redaction results

Detect and reject:

- Invocation substitution
- Adapter substitution
- Authorization substitution
- Credential Reference substitution
- Raw credential insertion
- Endpoint substitution
- Transport Policy substitution
- Request Plan mutation
- Cost or Rate mutation
- Circuit-state mutation
- Health-state mutation
- Observability evidence mutation
- Readiness Decision mutation
- Re-signed semantic substitution
- Physical-path leakage
- Credential leakage
- Live-execution capability insertion

Fail closed and do not silently repair artifacts.

---

## 21. Add Deterministic Evaluation Fixtures

Implement executable readiness scenarios covering at least:

### Valid readiness

- Fully valid dry-run readiness
- Deterministic repeated readiness evaluation
- Dry-run Request Plan verification
- Deterministic Response Mapping fixture

### Authorization

- Missing Authorization Evidence
- Denied
- Review required
- Not evaluated
- Expired
- Invocation mismatch
- Consumer mismatch
- Adapter mismatch
- Operation mismatch

### Credentials

- Valid fake Credential Reference
- Credential unavailable
- Wrong provider family
- Invalid scope
- Expired rotation reference
- Raw API key supplied
- Bearer token supplied
- Credential-bearing URL
- Secret-like environment value

### Transport

- HTTPS allowlisted host
- HTTP rejected
- Arbitrary host rejected
- Redirect rejected
- Loopback target rejected
- Private target rejected
- Link-local target rejected
- Metadata target rejected
- Reserved target rejected
- Credential in URL rejected
- Invalid TLS version
- Certificate verification disabled
- Request size exceeded
- Response size exceeded
- Timeout invalid
- Network callback injection

### Mapping

- Valid dry-run mapping
- Hidden context injection
- Tool payload injection
- Executable provider payload injection
- Header secret injection
- Mapping fingerprint tampering
- Response Mapping tampering
- Raw error-body persistence attempt

### Rate and Capacity

- Admitted
- Rate limited
- Capacity exhausted
- Queue full
- Provider unavailable
- Quota exceeded
- Stable Retry-After evidence
- Explicit time-window boundary

### Cost and Budget

- Within budget
- Input budget exceeded
- Output budget exceeded
- Cost ceiling exceeded
- Pricing unavailable
- Invalid pricing reference
- Manual review required
- Integer minor-unit boundary

### Circuit and Health

- Closed
- Open
- Half-open bounded dry-run probe
- Disabled
- Quarantined
- Immediate quarantine for security violation
- Degraded Health
- Unavailable Health
- Disabled readiness
- No live-traffic readiness state

### Observability

- Safe structured log
- Credential key redaction
- Credential value-pattern redaction
- Authorization header redaction
- Raw Context omission
- Raw provider body omission
- Physical-path redaction
- Environment dump rejection
- High-cardinality metric rejection
- Oversized trace attribute rejection
- Public error privacy

### Harness and bypass

- Enabled Adapter state rejected
- Direct network call attempt rejected
- Socket dependency absent
- DNS dependency absent
- Direct provider client injection rejected
- Raw Knowledge Object bypass
- Full Query Result bypass
- Unverified Delivery bypass
- Unverified Invocation bypass
- Low-level Request Plan insertion rejected
- Readiness Decision tampering
- Re-signed semantic substitution

Define expected:

- Readiness status
- Gate outcomes
- Blocking reason codes
- Warning reason codes
- Fingerprints
- Redacted evidence
- Deterministic byte behavior
- Confirmation that no network action occurred

---

## 22. Add Comprehensive Tests

Add focused tests in these categories.

### Contract tests

- Strict validation
- Unknown fields
- Unsupported versions
- Invalid IDs
- Explicit-undefined rejection where required
- Accessor-safe input capture
- Canonical normalization
- Fingerprint round trips
- Forged fingerprints
- Secret-like key and value rejection
- Physical-path rejection

### Authorization tests

- Allowed
- Denied
- Review required
- Not evaluated
- Missing
- Expired
- Invalid chronology
- Invocation mismatch
- Consumer mismatch
- Adapter mismatch
- Enforcement before Credential and Transport

### Credential tests

- Reference validation
- Availability states
- Provider-family binding
- Scope binding
- Rotation version
- Raw secret rejection
- Header rejection
- Environment-value rejection
- No secret in artifacts or errors

### Transport tests

- Scheme
- Host allowlist
- Port allowlist
- Redirect policy
- TLS policy
- Address classification
- Request and Response size
- Timeout and Retry policy
- URL credential rejection
- No socket creation
- No DNS resolution
- No network client dependency

### Mapping tests

- Deterministic Request Plan
- Redacted header plan
- Body Mapping evidence
- Input-size evidence
- Timeout plan
- Expected Response constraints
- Mapping tamper rejection
- Hidden Context rejection
- Provider payload rejection
- Response fixture mapping
- Sanitized error mapping

### Rate and Cost tests

- Exact time-window boundaries
- Concurrent capacity
- Queue capacity
- Quotas
- Retry-After
- Pricing fixtures
- Input and Output estimates
- Cost ceilings
- Currency and minor units
- Missing pricing
- Stable arithmetic
- Fail-before-mapping or fail-before-transport order

### Circuit and Health tests

- Every state
- Valid transitions
- Invalid transitions
- Thresholds
- Quarantine
- Half-open probe limits
- Explicit time
- Health derivation
- Readiness derivation
- No live-ready state

### Observability tests

- Log redaction
- Metric label bounding
- Trace attribute bounding
- Error normalization
- Credential and path privacy
- Context and Response body exclusion
- Deterministic in-memory sink
- No external sink

### Harness tests

- Every Harness mode
- Enabled-state rejection
- Raw Credential rejection
- Arbitrary URL rejection
- Network callback rejection
- Deterministic repeated evaluation
- Readiness Decision generation
- Independent verification
- No network side effect

### No-bypass tests

- Direct Provider call rejection
- Raw Knowledge rejection
- Query Result rejection
- Hidden Context rejection
- Unverified Delivery rejection
- Unverified Invocation rejection
- Missing Authorization rejection
- Missing Rate or Cost Decision rejection
- Circuit bypass rejection
- Redaction bypass rejection
- Low-level artifact insertion rejection

### Regression tests

- Keep all Milestone 04–13 tests green.
- Preserve Context Package governance.
- Preserve Delivery and durable Delivery governance.
- Preserve Reasoning Invocation, Attempt, Result, and Consumption Evidence governance.
- Preserve every no-context and no-provider-bypass rule.

---

## 23. Architectural Constraints

Do not implement:

- OpenAI API calls
- Anthropic API calls
- Google API calls
- Real local-model execution
- Any network Provider call
- Real Credential loading
- Secret-store integration
- Provider SDK dependency
- Streaming
- Tool calling
- Function calling
- Agent runtime
- Hermes runtime
- MCP gateway
- Autonomous planning
- Multi-provider routing
- Provider failover
- Authentication
- Authorization engine
- External logging vendor
- External tracing vendor
- External metrics vendor
- UI
- Distributed rate limiting
- Distributed circuit state
- Distributed Credential resolution
- Real provider pricing synchronization

Do not add a framework or dependency unless the current Node.js and TypeScript platform cannot satisfy the approved deterministic contracts.

If a dependency is unavoidable, document:

- Requirement
- Alternatives
- Security impact
- Credential impact
- Network impact
- Determinism impact
- Provider-neutrality impact
- Architecture decision

in `ARCHITECTURE_DECISIONS.md` before implementation.

---

## 24. Engineering Rules

Follow:

- Documentation first
- Architecture before code
- Strict TypeScript
- Existing package boundaries
- No reverse dependencies
- No unrelated refactoring
- No unsupported completion claims
- Defensive copying
- Immutable artifacts
- Accessor-safe validation
- Explicit time injection
- No implicit randomness
- No network access
- No Credential access
- Stable public errors
- No physical-path leakage
- No secret leakage
- Pure gate evaluation, arithmetic, mapping, canonicalization, and verification
- Tests for every behavior change

Use isolated temporary directories where filesystem tests are necessary.

Do not write readiness output into the developer's real runtime directories.

Never modify canonical `docs/` or `knowledge/` sources.

If the checkout is under iCloud-managed storage, do not rely on hydration timing and do not commit duplicate files.

---

## 25. Documentation Updates

Update only documentation reflecting implemented behavior:

- Root `README.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGELOG.md`
- Relevant package READMEs
- Public exports
- `ARCHITECTURE_DECISIONS.md`

Add an ADR documenting:

- Production Provider Readiness boundary
- Authorization Enforcement order
- Credential Reference isolation
- Secure Transport Policy
- Request and Response Mapping boundaries
- Rate and Capacity admission
- Cost and Budget admission
- Circuit and Failure containment
- Health and Readiness states
- Observability and Redaction
- Disabled Adapter Harness
- No-direct-provider-bypass
- Structurally disabled network execution
- Deferred real Provider Adapter
- Deferred streaming
- Deferred tool calling
- Deferred Agent, Hermes, and MCP
- Deferred multi-provider routing

Do not document real Provider execution as implemented.

---

## 26. Verification Gates

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

All Milestone 04–13 regressions and all new Milestone 14 tests must pass.

Inspect:

```bash
git status
```

Confirm:

- Only intended Milestone 14 changes exist.
- No Provider Credential exists.
- No Provider API configuration exists.
- No live endpoint configuration exists.
- No generated Request Plans are staged.
- No generated Readiness Decisions are staged.
- No observability output is staged.
- No network fixtures containing executable clients are staged.
- No lock, staging, or temporary files are staged.
- `.DS_Store` is excluded.
- iCloud conflict files are excluded.
- `dist/` is excluded.
- Physical-path debug files are excluded.
- Environment dumps are excluded.

---

## 27. Independent Whole-Branch Review

After all verification passes, perform an independent whole-branch review focused on:

- Milestone 13 Invocation verification bypass
- Raw Knowledge or Query Result bypass
- Unverified Delivery or Receipt acceptance
- Missing Authorization enforcement
- `not-evaluated` treated as allowed
- Authorization checked after Credential Reference validation
- Raw Credential acceptance
- Secret value persistence
- Authorization header leakage
- Caller-controlled endpoint
- SSRF-like target acceptance
- Redirect bypass
- TLS verification bypass
- Network method accidentally available
- DNS or socket side effects
- Rate or Cost admission bypass
- Circuit Open or Quarantined bypass
- Half-open unbounded probe
- Enabled Adapter state acceptance
- Request Plan secret leakage
- Hidden Context injection
- Response Mapping bypass
- Raw provider error persistence
- Unredacted log, trace, metric, or error
- High-cardinality metrics
- Physical-path leakage
- Readiness state claiming live traffic
- Readiness Decision forgery
- Re-signed semantic substitution
- Mutable aliasing
- Accessor execution
- Provider-specific SDK coupling
- Accidental real Provider call
- Accidental Agent, Hermes, or MCP execution

Fix every Critical, Important, or Minor finding before declaring `GO`.

Otherwise return `NOT READY` with exact unresolved findings.

---

## 28. Commit and Pull Request Rules

Prepare the result as commit-ready.

Do not merge into `main`.

If the user has not explicitly authorized commit and push:

- Leave changes uncommitted.
- Report that state.

If explicitly authorized:

1. Create one clean conventional milestone commit.
2. Push `codex/milestone-14`.
3. Prepare a Pull Request into `main`.
4. Do not merge locally.
5. Do not merge remotely.

Never discard completed work.

---

## 29. Completion Report

Return a report titled:

# FounderOS Milestone 14 Completion Report

Include:

1. Status: `GO` or `NOT READY`
2. Branch
3. Base branch
4. Worktree state
5. Commit state
6. Push state
7. Implementation summary
8. Exact Provider Readiness workflow
9. All added files
10. All modified files
11. Tests added by category
12. Final total test count
13. Exact verification results
14. Milestone 13 Invocation-binding evidence
15. Authorization Enforcement evidence
16. Credential isolation evidence
17. Transport Policy evidence
18. Request Mapping evidence
19. Response Mapping evidence
20. Rate and Capacity evidence
21. Cost and Budget evidence
22. Circuit and Failure-containment evidence
23. Health and Readiness evidence
24. Observability and Redaction evidence
25. Disabled Harness evidence
26. No-direct-provider-bypass evidence
27. Readiness Decision evidence
28. Proof that no network call occurred
29. Proof that no real Credential was read or stored
30. Tamper and substitution rejection evidence
31. Architecture impact
32. Dependency direction
33. Known limitations
34. Deliberately deferred capabilities
35. Independent review findings
36. Recommended next milestone
37. Pull Request readiness

---

## 30. GO Standard

Milestone 14 may be reported as `GO` only when FounderOS can:

- Resolve and verify an exact governed Milestone 13 Invocation
- Enforce explicit Authorization before all Provider preparation
- Validate a Credential Reference without reading a secret
- Verify a secure allowlisted Transport Policy
- Construct and verify a deterministic redacted Request Plan
- Map deterministic Response fixtures into portable evidence
- Enforce Rate, Capacity, Cost, Timeout, Retry, and Cancellation readiness
- Enforce Circuit and Health state
- Produce redacted Logs, Metrics, Traces, and public errors
- Produce and independently verify a Provider Readiness Decision
- Reject every direct Provider, Credential, endpoint, hidden Context, and low-level bypass
- Preserve all Milestone 10–13 governance and durability guarantees
- Prove that Production Adapter enablement and network execution remain structurally impossible
- Complete the full workflow without a real Provider, Credential, network call, Agent, Hermes runtime, or MCP integration

Prioritize authorization, Credential isolation, transport safety, cost containment, observability privacy, failure containment, and structural disablement over provider connectivity.
