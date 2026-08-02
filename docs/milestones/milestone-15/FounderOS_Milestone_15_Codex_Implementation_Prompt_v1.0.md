# FounderOS Milestone 15 Codex Implementation Prompt v1.0

## Status

**Specified — not implemented**

This is a future implementation artifact. Do not execute it during the documentation-only phase.

## Role and Mission

You are the lead engineer responsible for implementing FounderOS Milestone 15 — Durable Production-Provider Readiness Evaluation Ledger and Replay Verification Registry Foundation.

The objective is to make the non-executing Milestone 14 readiness evaluation durable, restart-safe, auditable, and independently replay-verifiable without adding credential access, outbound transport, a real provider, or a live-ready state.

## Authorization Precondition

The immutable runtime predecessor is:

```text
MILESTONE_14_RUNTIME_BASE_SHA = a93faa29eecc37f2a08c79cda4c3075ffacfea3e
```

No implementation authorization may substitute a different Milestone 14 predecessor. Do not execute this prompt until the documentation PR is merged and a separate implementation authorization supplies:

```text
AUTHORIZED_MILESTONE_15_DOCUMENTATION_MERGE_SHA
```

That SHA must equal local `main` and `origin/main` at execution time, descend from `MILESTONE_14_RUNTIME_BASE_SHA`, and have merge base exactly `MILESTONE_14_RUNTIME_BASE_SHA` for the reviewed Milestone 15 documentation delta. It must contain the approved documents and differ from the runtime predecessor only by their reviewed publication and repository-governance changes.

The only authorized implementation branch name is:

```text
codex/milestone-15
```

Create or switch to it only from the separately authorized documentation merge SHA. Fail preflight if the current branch is `main`, `codex/milestone-15-specification`, or any other branch; the runtime predecessor differs; documentation merge authorization is missing; the authorized SHA differs from local or remote `main`; the branch base is unauthorized; the worktree is unclean; or unreviewed Milestone 15 runtime changes already exist.

The separate authorization must also identify:

- the approved repository and base branch;
- the exact authorized documentation merge SHA;
- the reviewed Milestone 15 specification set;
- permitted publication actions.

Documentation-only authorization is insufficient.

## Required Reading

Before changing code, read:

- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `ARCHITECTURE_DECISIONS.md`
- `DOCUMENTATION_INDEX.md`
- all Milestone 12 specifications under `docs/milestones/milestone-12/`
- all Milestone 13 specifications under `docs/milestones/milestone-13/`
- all Milestone 14 specifications under `docs/milestones/milestone-14/`
- all Milestone 15 specifications under `docs/milestones/milestone-15/`, excluding this prompt until the controlling contracts are understood
- existing durable Delivery and Reasoning ledger implementations and tests
- existing Milestone 14 evaluator, input-safety, authority, retention, facade, and evaluation tests

## Architecture Constraints

Preserve:

```text
knowledge-engine -> knowledge-schema
```

`@founderos/knowledge-schema` owns strict shared contracts. `@founderos/knowledge-engine` owns verification, orchestration, application ports, canonical comparison, recovery, integrity, derived indexes, and the local adapter.

Do not redesign Milestones 12–14 or create a second readiness evaluator.

## Required Implementation Scope

### Shared Contracts

Implement strict, versioned schemas and inferred TypeScript types for:

- readiness evaluation registration request;
- evaluator configuration projection;
- durable Delivery and Invocation identity projection;
- canonical readiness evaluation package;
- committed readiness evaluation transaction;
- permanent idempotency ownership;
- genesis complete-history commitment, genesis ledger head and marker, audit entry, exact event ledger head, and event commit marker;
- replay request, attempt, comparison, and verification result;
- integrity and recovery results;
- derived index snapshot and status;
- stable application result unions and reason codes.

All contracts must reject unknown fields, unsupported versions, unsupported values, and noncanonical shapes.

### Registration Orchestration

Implement one governed registration facade that:

1. captures exact plain own data before authority access;
2. rejects prohibited and executable material;
3. requires caller-requested ownership, registration semantic-event, registration audit-entry, and registration marker IDs and binds them into the request fingerprint;
4. recovers and verifies the readiness ledger, including explicit genesis authority;
5. recovers and verifies the supplied Milestone 12 Delivery Ledger;
6. reuses the sole Milestone 13 Delivery/Invocation authority resolver;
7. reconstructs the evaluator configuration projection;
8. evaluates through an approved configured Milestone 14 evaluator;
9. verifies the Decision with that same evaluator instance and exact retention evidence;
10. compares any supplied expected package with the evaluator-produced package;
11. claims permanent global ownership of all `M15-IDEM-001` coordinates under expected-head compare-and-swap;
12. atomically commits the complete registration transaction and audit entry;
13. stops before credential resolution or transport.

Do not accept a prebuilt package as authority.

An identical retry is not lookup-only. It must execute the capture-through-package-comparison sequence exactly once, reconstruct the request and package, and prove exact equality across the key, every ownership/request/transaction/Decision/registration-event coordinate, the permanent ownership record, and the original transaction. It then returns `idempotent-original-returned` without append, ownership refresh, head advancement, or Authorization extension.

### Replay Orchestration

Implement fresh-evaluator replay that:

1. recovers and verifies the readiness ledger;
2. detects an exact owned replay retry by matching the replay idempotency key; requested replay request, attempt, semantic-event, audit-entry, and marker IDs; and the complete request fingerprint, then verifies and returns the original attempt as `idempotent-replay-returned` without append; its owned expected-head coordinate need not equal the later current head;
3. rejects every non-exact reuse of an owned replay coordinate;
4. reads and verifies the immutable original transaction for a distinct submission;
5. accepts a newly supplied governed Delivery Ledger and fresh approved evaluator;
6. verifies exact stored configuration and authority projections;
7. always reconstructs the exact stored canonical input at immutable `originalEvaluationTime`, independently of current admissibility;
8. verifies the fresh Decision with that evaluator and fresh retention evidence;
9. compares the complete canonical package and classifies historical status as `matched`, `mismatched`, `verification-failed`, or `not-assessed`;
10. separately evaluates original Authorization and authority evidence at explicit `replayEvaluatedAt` as `admissible`, `authorization-expired`, `authorization-denied`, `authorization-review-required`, `authorization-not-evaluated`, `authorization-invalid-evidence`, `authority-mismatch`, or `not-assessed`;
11. appends a recordable attempt, then reports operation-only `appended` after marker activation, including the valid combination `matched` plus `authorization-expired`, or returns `not-recorded`/`not-appended` with exactly one stable operation reason;
12. never stores append status inside the replay attempt;
13. never mutates the original transaction;
14. never refreshes Authorization or enables transport.

### Governed Ledger Port

Define an engine-owned storage port that supports verified reads, exclusive expected-head append, recovery, integrity verification, head reads, replay listing, derived-index inspection, and explicit index rebuild.

The public package facade may expose governed application operations and the approved local adapter factory. It must not expose low-level writers, direct record insertion, commit-marker mutation, ledger-head mutation, raw index mutation, or test corruption seams.

### Local File Adapter

Implement one Git-ignored local adapter with:

- explicit bounded runtime root;
- traversal, symlink, unsafe-entry, special-file, and overlap rejection;
- no-follow leaf operations where available and physical-directory identity rechecks;
- cooperative single-writer lock;
- expected-head compare-and-swap;
- canonical JSON and domain-separated SHA-256;
- immutable deterministic event locations;
- safe explicit creation of one deterministic genesis history/head/marker authority, with reserved marker ID `m15-genesis`, generation `0`, and atomic fixed-marker installation as the initialization visibility boundary;
- temporary staging, file synchronization, atomic same-filesystem rename, and directory synchronization where supported;
- immutable event-local marker archives plus a separately replaced, byte-identical authoritative fixed current marker;
- restart recovery and crash-orphan classification;
- fail-closed ambiguous recovery;
- rebuildable non-authoritative derived indexes;
- stable public errors without physical paths or secret material;
- bounded resources before mutation.

Document and test its cooperative local limitations. Do not claim distributed or hostile-process safety.

## Canonical Data and Fingerprints

Reuse FounderOS canonicalization patterns where compatible. Canonical input must be finite, plain, acyclic, and composed only of enumerable own data properties. Reject accessors before invoking them, symbols, non-enumerable fields, inherited capabilities, custom prototypes, aliases that undermine capture, functions, and unsupported built-ins.

Use lowercase SHA-256 with existing FounderOS canonical JSON. Implement exactly the artifact names, domain tags, unsigned schemas, included/excluded fields, dependency order, fingerprint fields, and authority classes in the sole normative `M15-COMMIT-001` table in the Durable Readiness Evaluation Transaction Contract. Do not create a variant table or a competing serializer/hash. Implement the sole exhaustive Evidence Durability Inventory from the privacy policy: every application/adapter operation-result envelope and transient status value, including registration, replay, append, integrity, recovery, derived-state, initialization/open, and failed-mutation results, plus validation reports, remains non-fingerprinted and non-persisted unless a separately reviewed specification outside readiness-ledger authority explicitly defines a durable validation report.

Implement the exact ledger-head keys without aliases: `headContractVersion`, `headGeneration`, three counts, `lastCommittedLedgerSequence`, latest audit-entry ID/fingerprint, latest semantic-event ID/fingerprint, latest subject transaction ID/fingerprint, `completeHistoryFingerprint`, and `ledgerHeadFingerprint`. Genesis makes all latest coordinates null; registration and replay make all non-null. Marker-embedded head bytes, `readHead()`, and rebuilt derived `HEAD` bytes must be identical. Reject `last committed event` or other variant fields.

The canonical marker is computed last with the resulting head embedded. Preserve one immutable event-local marker archive, then atomically install byte-identical bytes at the fixed current-marker location. Only that fixed-marker replacement is the authoritative visibility boundary (`M15-TXN-001`, `M15-TXN-002`); the archive preserves marker history and global identity but never activates an event by itself. A separate `HEAD` projection and indexes are derived and rebuildable. An unactivated component is never committed; a committed marker is never rolled back because derived publication failed.

## Idempotency Requirements

- First valid registration permanently owns the key.
- First valid registration globally owns the caller-requested ownership, registration semantic-event, registration audit-entry, and registration marker IDs together with the registration request ID, transaction ID, and evaluator-produced Decision ID.
- Identical registration retry returns the exact original without append.
- Conflicting key reuse fails across restart.
- Conflicting ownership, transaction, request, Decision, registration semantic-event, registration audit-entry, registration marker, replay-key, or replay-ID reuse fails with the stable coordinate-specific reason.
- Every `M15-IDEM-001` identity is globally owned even across different keys or requests, with the stable conflict reasons specified in the registration contract.
- Replay request, attempt, semantic-event, audit-entry, and marker identities are caller-bound in the replay request and globally owned. Exact retry is allowed only for the full owned tuple and complete request fingerprint, and its original expected-head coordinate need not equal the later current head (`M15-REPLAY-003`).
- Derived-index loss never frees ownership.
- Expiration never frees ownership.
- Ownership and complete registration commit atomically.

## Required Integrity and Recovery Behavior

Verify:

- exact marker-bounded event set;
- sequence and audit-chain continuity;
- transaction, request, package, ownership, replay, and marker fingerprints;
- canonical genesis history, head, marker, archive/current-marker byte equality, and initialization classification;
- exact Decision, gate order, retention evidence, evaluator configuration, and Delivery/Invocation bindings;
- replay attempt references and classifications;
- counts, sequence, latest audit-entry, latest semantic-event, latest subject-transaction, head, and complete-history coordinates;
- privacy and no-execution invariants.

Do not silently repair, truncate, skip, resign, or overwrite authoritative corruption.

Implement every row of `M15-FS-001`, the sole 19-point fault/lock matrix. Do not steal locks by elapsed time. Under a stale lock, read-only integrity may run without mutation; writes return `operator-cleanup-required`, and operator cleanup may remove only the lock after proving no active writer.

Report derived-index integrity separately. Rebuild indexes only through an explicit operation from valid authoritative history.

## Privacy and No-Execution Requirements

Reject or exclude:

- raw Knowledge or Query Results;
- hidden Context or Context content;
- persisted Delivery Ledger objects or ports;
- credential values, secret bytes, tokens, keys, environment contents, or authorization headers;
- arbitrary URLs or endpoints;
- provider request or response bodies;
- clients, callbacks, functions, streams, SDK objects, or executable payloads;
- caller-supplied commit markers, writers, locks, or indexes;
- Agents, Hermes, MCP, or tool/function payloads.

Persist Credential Reference ID and fingerprint only.

Persist only the authoritative and derived members enumerated by the sole Evidence Durability Inventory. Every application/adapter operation-result envelope and transient status value, plus validation reports, is ephemeral public or validation output: do not write it into authoritative records, staging envelopes intended for installation, markers, derived state, logs, traces, metrics, or observability artifacts, and do not fingerprint it. An authoritative or derived record returned inside an ephemeral result retains its inventory class, but the envelope never permits a second durable copy.

Production import closure must contain no HTTP, DNS, TLS, socket, proxy, provider SDK, credential resolver, environment-secret, Agent, Hermes, MCP, streaming, or tools/functions capability.

No contract or result may express `live-ready`, production enablement, or equivalent authority.

## Required Tests

Implement unit, integration, restart, adapter, corruption, concurrency, and facade tests covering at least:

- successful first registration;
- canonical genesis bytes and fingerprints across clean processes;
- safe first create and every genesis crash point before staging, during staging, after genesis archive creation, and after fixed-marker installation;
- uninitialized, initialized-empty, incomplete-genesis, and corrupt-genesis classification;
- independently recomputed genesis history, head, marker, archive/current equality, and first-registration advance from genesis;
- exact genesis, first-registration, and replay head fixtures; unknown/missing head-key rejection; substituted latest-coordinate rejection; and byte equality among marker, `readHead()`, and rebuilt `HEAD`;
- identical idempotent registration replay;
- conflicting idempotency reuse;
- duplicate Decision ID;
- duplicate transaction ID;
- duplicate registration request ID under a different key;
- duplicate Decision ID under a different request;
- duplicate ownership ID;
- duplicate registration semantic-event ID;
- duplicate registration audit-entry ID;
- duplicate registration marker ID;
- the same original-registration IDs under another key or request, the same key with changed requested IDs, and exact retry with every original coordinate;
- replay idempotency-key conflict and exact replay retry;
- stale fingerprint;
- coherent re-sign substitution;
- altered gate order;
- altered retention evidence;
- evaluator configuration mismatch;
- Delivery and Invocation mismatch;
- missing transaction component;
- crash before event installation;
- crash after event installation and before marker replacement;
- marker referencing incomplete state;
- stale expected head;
- concurrent writer conflict;
- symlink, traversal, special-file, and overlap rejection;
- corrupt authoritative record;
- missing and corrupt rebuildable indexes;
- deterministic index rebuild;
- fresh-evaluator replay match;
- fresh-evaluator replay match while currently admissible;
- replay mismatch;
- replay verification failure;
- expired Authorization during replay;
- historical match plus current Authorization expiration;
- current Authorization denial, review required, not evaluated, and invalid evidence;
- original-time reconstruction plus current-time admissibility;
- replay-ledger integrity failure, original transaction not found, and invalid replay input;
- replay append failure, stale expected replay head, and replay concurrent writer conflict;
- exact replay retry after later head advancement, with all requested replay identities verified and no append;
- lock interruption and stale lock requiring operator cleanup;
- every registration and replay row of `M15-FS-001`, including derived `HEAD` rebuild after marker commit;
- raw credential and credential-like material;
- accessor-backed, hidden, symbolic, inherited, custom-prototype, aliased, and executable input;
- stored-data privacy inspection;
- stored-data and log inspection proving no application/adapter operation-result envelope, transient status value, or validation report persists, while schema-backed public results remain canonical/redacted/non-fingerprinted and validation reports remain redacted, non-fingerprinted, and ephemeral;
- no-network import and runtime proof;
- no-credential import and runtime proof;
- deterministic repeated bytes and stable ordering;
- unknown and explicit-`undefined` fields;
- physical-path privacy in errors and reports;
- immutable marker archive/current-marker equality, missing archives, duplicate marker IDs, and archived-candidate invisibility;
- no-follow leaf and physical directory-identity substitution detection;
- every future implementation-preflight rejection case;
- ADR, status, version, index-inventory, and relative-link documentation lint;
- static package dependency-direction proof and no-execution facade/status proof;
- complete Milestone 04–14 regression preservation with no predecessor-test loss: before counting any Milestone 15 tests, at least the pinned baseline of 42 test files and 1,038 tests must execute and pass.

Use every `M15-SC-*` scenario in the Acceptance Criteria as the minimum executable scenario catalog. Implement the exact normative-clause parser, source-section ownership grammar, and traceability rules specified there. Validation fails on an unmapped normative clause or source file, a missing requirement/acceptance/scenario target, a requirement without a scenario, a scenario referencing a missing requirement, a non-contiguous scenario catalog, or a duplicate requirement/acceptance/scenario ID.

Use bounded temporary directories. Do not write fixtures into canonical source trees. Preserve original documents.

## Documentation Updates

Only after implementation matches the specification:

- update status labels from specified to implemented where true;
- update `README.md`, package READMEs, `DOCUMENTATION_INDEX.md`, and `CHANGELOG.md` only for real behavior;
- change ADR-0019 from Proposed to Accepted only if the implementation review approves the architecture;
- document commands, local runtime root, operating limitations, and explicit exclusions.

## Explicitly Deferred

Do not implement:

- real provider adapters;
- credential resolution or secret-store access;
- environment-variable secret loading;
- HTTP, DNS, TLS, sockets, proxies, SDKs, or outbound transport;
- provider dispatch or response ingestion;
- streaming;
- tools or function calling;
- Agents, Hermes, or MCP;
- provider routing or failover;
- distributed locks, ledgers, consensus, replication, or coordinated rollback protection;
- external observability;
- UI, deployment, or production enablement.

## Implementation Order

1. Enforce the exact runtime-predecessor, documentation-merge SHA, clean-worktree, no-preexisting-runtime-change, and `codex/milestone-15` branch preflight above.
2. Read the complete controlling documentation and implementation patterns.
3. Produce a detailed plan mapping every acceptance criterion to code and tests.
4. Implement shared contracts and focused tests.
5. Implement engine verification and registration orchestration.
6. Implement replay orchestration.
7. Implement the governed ledger port and in-memory test seam.
8. Implement the local file adapter and crash/path-safety tests.
9. Add privacy, bypass, deterministic, and import-closure tests.
10. Run focused verification after each small change.
11. Run the complete suite.
12. Perform a whole-branch architecture, security, and scope review.
13. Update only documentation justified by actual implementation.
14. Stop before publication unless separately authorized.

## Required Verification

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

All gates, all 72 scenarios `M15-SC-001` through `M15-SC-072`, and all Milestone 04–14 regressions must pass. The predecessor suite must be reported separately and may not fall below 42 test files and 1,038 passing tests before any Milestone 15 tests are counted; any lower count fails verification unless a separate reviewed authorization explicitly changes the predecessor baseline.

## Final Implementation Report

Return:

1. `GO` or `NOT READY`.
2. Exact base, branch, and head SHAs.
3. Implementation summary.
4. Added and modified files.
5. Contract and package-boundary review.
6. Registration, idempotency, replay, recovery, and adapter behavior.
7. Privacy and no-execution evidence.
8. Test categories and exact counts.
9. Verification-command results.
10. Architecture review findings by severity.
11. Known local-adapter limitations.
12. Explicit deferred capabilities.
13. Publication recommendation without taking unauthorized publication action.

## Stop Condition

Stop when the separately authorized implementation, tests, verification, and review are complete. Do not commit, push, create or merge a pull request, tag, release, deploy, begin credential work, enable transport, or begin Milestone 16 unless separately authorized.
