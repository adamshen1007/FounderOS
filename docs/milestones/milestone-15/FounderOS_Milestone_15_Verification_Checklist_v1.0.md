# FounderOS Milestone 15 Verification Checklist v1.0

## Status

**Specified — not implemented**

## Repository Preconditions

- [ ] Milestone 14 is merged into `main`.
- [ ] `MILESTONE_14_RUNTIME_BASE_SHA` is exactly `a93faa29eecc37f2a08c79cda4c3075ffacfea3e`.
- [ ] A separate authorization supplies `AUTHORIZED_MILESTONE_15_DOCUMENTATION_MERGE_SHA`; it equals local `main` and `origin/main`, descends from the runtime predecessor with that predecessor as the documentation-delta merge base, and contains only the reviewed specification/governance delta.
- [ ] The future implementation branch is exactly `codex/milestone-15`, created from that authorized documentation merge SHA; `main`, the specification branch, and all other branches fail preflight.
- [ ] The worktree contains no unrelated changes.
- [ ] No unreviewed Milestone 15 runtime changes predate implementation authorization.
- [ ] ADR-0019 remains Proposed until implementation review accepts it.

## Contract Verification

- [ ] Every Milestone 15 contract is strict, versioned, and storage independent.
- [ ] Unknown fields and unsupported versions fail.
- [ ] Plain-own-data capture rejects accessors without invocation, symbols, hidden fields, inherited capabilities, custom prototypes, aliases, and executable values.
- [ ] Canonical JSON is finite, deterministic, acyclic, and byte stable.
- [ ] Domain-separated SHA-256 fingerprints independently recompute.
- [ ] Every fingerprint matches the exact named unsigned schema, fields, exclusions, domain tag, and order in the sole `M15-COMMIT-001` table; integrity and recovery results remain non-fingerprinted ephemeral outputs.
- [ ] Cross-record authority bindings are semantically verified, not accepted from coherent local re-signing.

## Registration Verification

- [ ] Readiness-ledger recovery and integrity precede mutation.
- [ ] Durable Delivery recovery and integrity precede evaluation.
- [ ] Exact Milestone 13 Delivery and Invocation authority resolves.
- [ ] The approved Milestone 14 evaluator produces and verifies the registration package.
- [ ] Caller package substitution, omission, addition, and reordering fail.
- [ ] Authorization precedes Credential Reference and Transport planning.
- [ ] Complete ownership, transaction, and audit evidence commits atomically.
- [ ] Registration stops before credential resolution and transport.

## Idempotency and Concurrency Verification

- [ ] First registration permanently owns its key.
- [ ] Identical retry returns the exact original transaction without append.
- [ ] Identical retry performs the governed resolver/evaluator/same-instance verification sequence exactly once and returns `idempotent-original-returned`.
- [ ] Conflicting key, transaction ID, request ID, or Decision ID reuse fails.
- [ ] Ownership survives process restart and derived-index loss.
- [ ] Stale expected head fails without mutation.
- [ ] Concurrent cooperative writers produce at most one valid commit.

## Replay Verification

- [ ] A fresh configured evaluator is used after restart.
- [ ] Stored and supplied configuration projections match exactly.
- [ ] Fresh upstream Delivery and Invocation authority verifies.
- [ ] Historical reconstruction always uses immutable `originalEvaluationTime`; current admissibility separately uses `replayEvaluatedAt` and never gates reconstruction.
- [ ] Complete package equality yields `matched`.
- [ ] Valid inequality yields `mismatched` with bounded field-path evidence.
- [ ] Invalid authority or evaluation yields `verification-failed` when append is safe.
- [ ] Historical `matched` plus current `authorization-expired` records successfully and Authorization is never refreshed.
- [ ] Current denial, review-required, not-evaluated, invalid-evidence, and authority-mismatch statuses record independently when append is safe.
- [ ] Public results distinguish historical, current-admissibility, append, and `recorded`/`not-recorded` status; every not-recorded result has exactly one stable operation reason and no attempt.
- [ ] Replay append status exists only in the ephemeral operation result, never in the pre-commit replay-attempt fingerprint domain.
- [ ] Exact replay retry binds all five replay IDs, verifies permanent history, tolerates later head advancement only through its stored expected-head exception, and returns `idempotent-replay-returned` without append.
- [ ] Original transaction bytes remain unchanged after every replay attempt.
- [ ] Replay attempts order by ledger sequence and remain append-only.

## Integrity and Recovery Verification

- [ ] Genesis and non-empty commit-head markers verify.
- [ ] Event, audit, and marker sequence/count/head coordinates agree.
- [ ] Missing, reordered, duplicated, corrupt, partial, or contradictory authoritative evidence fails.
- [ ] Altered gate order, retention evidence, configuration, Delivery, Invocation, or Adapter authority fails.
- [ ] Pre-marker crash state leaves the prior committed prefix.
- [ ] Marker-referenced incomplete state fails closed.
- [ ] Ambiguous installed state fails closed.
- [ ] Authoritative records are never silently repaired or truncated.
- [ ] Recovery results and public errors are deterministic and path redacted.
- [ ] Global original and replay identity ownership survives restart and detects every cross-key/cross-request conflict.

## Derived Index Verification

- [ ] Indexes bind the exact authoritative head.
- [ ] Reads verify or bypass indexes rather than trust them.
- [ ] Missing and corrupt indexes are reported separately.
- [ ] Explicit rebuild produces deterministic bytes and exact lookups.
- [ ] Index rebuild never changes authoritative history.

## Filesystem Safety Verification

- [ ] Runtime root is explicit, bounded, Git-ignored, and outside canonical sources.
- [ ] Lexical traversal, physical escape, symlinks, aliases, special files, and unsafe nested entries fail.
- [ ] Runtime/source overlap fails in both directions.
- [ ] Directory identity is rechecked around critical operations.
- [ ] Immutable authoritative records are never overwritten.
- [ ] Public failures expose no physical paths.
- [ ] Resource limits fail before mutation.
- [ ] Abandoned lock behavior and operator cleanup are documented and tested.
- [ ] Every row of `M15-FS-001` is fault-injected for registration and replay as applicable and recovers only the old or new complete marker-bounded head.
- [ ] A stale lock is never stolen automatically; read-only integrity remains non-mutating, and cleanup removes only the lock after no active writer is proven.
- [ ] Marker commit followed by missing derived `HEAD` or index remains committed and rebuilds deterministically.
- [ ] Every activated event retains an immutable archived marker byte-identical to the marker value installed at the fixed current-marker location; only fixed-marker replacement activates visibility.

## Privacy and No-Execution Verification

- [ ] Stored-data traversal finds no raw Knowledge, Query Results, Context content, credential values, secret bytes, environment contents, headers, URLs, provider bodies, clients, callbacks, functions, or executable payloads.
- [ ] Credential References contain logical IDs and fingerprints only.
- [ ] No live-ready or equivalent status validates.
- [ ] A durable transaction cannot satisfy a provider-execution authorization boundary by itself.
- [ ] Production import closure contains no HTTP, DNS, TLS, socket, proxy, provider SDK, environment-secret, credential resolver, Agent, Hermes, MCP, streaming, or tools/functions path.
- [ ] No outbound network or credential access occurs in tests or runtime probes.

## Regression Verification

- [ ] All Milestone 04–14 tests remain green.
- [ ] New Milestone 15 unit, integration, restart, corruption, concurrency, path-safety, privacy, and no-execution tests pass.
- [ ] Existing package boundaries and public facades remain compatible.

## Traceability Verification

- [ ] Every normative `M15-*` requirement has one `M15-AC-*` acceptance criterion and at least one `M15-SC-*` executable scenario.
- [ ] Every scenario references only existing requirements.
- [ ] Requirement, acceptance, and scenario IDs are unique.
- [ ] Deterministic documentation/fixture lint parses every normative clause and source file/section using the acceptance-criteria ownership grammar and fails on any unmapped clause/file, missing target, non-contiguous catalog, or duplicate ID.
- [ ] All scenarios `M15-SC-001` through `M15-SC-053` execute, including all Milestone 04–14 regressions.

## Required Commands

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

## Approval Rule

Milestone 15 is `GO` only when one exact verified readiness evaluation and all later replay attempts survive restart, independently verify, fail closed under conflict or tampering, preserve privacy and path safety, and expose no credential or provider-transport capability.
