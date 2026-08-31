# Knowledge engine

Milestone 18 adds authorization-first credential-resolution orchestration. It verifies the exact registered Milestone 17 Decision and claim, compares every non-secret binding, reserves resolution identity, invokes a structural resolver port once, and constructs independently verifiable sanitized evidence. It does not import the concrete resolver or handle synthetic material.

Milestone 19 adds asynchronous disabled OpenAI Responses preparation orchestration. Knowledge
Engine verifies exact M17 Decision/claim authority, separate durable-readiness and current-control
evidence, model/cache/instruction/input/disablement artifacts, a deterministic structural request
plan, and the direct sanitized M18 result before invoking a disabled-adapter port. It does not
import the concrete integration package, receive credential material, or acquire network capability.
`createDurableM19ReadinessAuthority` verifies and projects the exact committed M15/M14 transaction
and separately captured M19 privacy, retention, operation, and cache-policy evidence;
`createSourceBoundFounderDecisionMemoInputProjectionAuthority` independently verifies the committed
M12 Delivery, captured M13 Invocation, and Context Package before deriving and binding their
canonical projection to the M17 Decision.

The Milestone 02 and 03 foundations read one Markdown file or one explicitly selected directory, parse YAML frontmatter, normalize specification-style keys, validate through `@founderos/knowledge-schema`, and return deterministic file-level and aggregate migration reports.

Milestone 04 adds manifest-controlled corpus execution. It loads a strict YAML manifest, confines every read to one physical root, rejects symbolic links and unsafe paths, verifies canonical SHA-256 digests, enforces ready/approved lifecycle gates, creates schema-valid objects from canonical document content, and writes a deterministic report artifact.

Milestone 05 adds a pure, storage-free query boundary over an explicitly supplied set of validated Knowledge Objects. It validates the query and every candidate, rejects duplicate object IDs, applies exact filters and context constraints by intersection, and sorts results by object ID. Multi-value filters match any allowed value; tag filters explicitly support `all` or `any`. Project filters match an object's domain, a project object's ID or name, or a decision object's `relatedProjectIds`. Every result includes the object's unchanged source metadata as provenance.

Milestone 06 makes repository-backed querying the primary access flow. Candidate sources emit versioned batches; the in-memory repository revalidates them, rejects duplicate source or object identities, builds a deterministic in-memory collection, and returns independent validated copies. It provides identity lookup and candidate discovery without persistence or search intelligence. The Milestone 05 candidate-array function remains available as the compatibility filtering core.

Milestone 07 connects the approved Priority 1 corpus to that repository boundary. `KnowledgeCorpusCandidateSource` reuses the manifest-controlled migration workflow, rejects partially valid corpus states, preserves object provenance, and creates an immutable repository snapshot with a content-derived identity. `initializeCorpusKnowledgeRepository` exposes the unchanged repository query capability, while `compareKnowledgeRepositorySnapshots` reports deterministic corpus changes without performing refreshes.

Milestone 08 provides pure public lifecycle and approval-workflow operations for caller-supplied snapshots. `createKnowledgeSnapshotLifecycleRecord` and `validateKnowledgeSnapshotLifecycle` create immutable pre-review evidence; review, approval, rejection, and activation transitions are available only through the approval workflow, while `archiveKnowledgeSnapshotLifecycle` archives an already superseded baseline. `generateKnowledgeGovernedChangeSet` deterministically compares snapshots from the same corpus, accepts same-identity no-op comparisons, and explains manifest-, version-, snapshot-, and object-level changes using separate comparison evidence so the Milestone 07 snapshot identity remains compatible. Each evidence record includes the canonical validated Knowledge Object; the engine recomputes and verifies its metadata, whole-object, and non-metadata content digests before comparison or workflow progression. `initializeKnowledgeSnapshotApprovalWorkflow` rejects no-op proposals and binds a matching active baseline, a validated proposal, and their evidence. Approval and rejection record immutable decisions tied to the change set and proposed snapshot. Activation atomically returns the old baseline as `superseded` and the proposal as `active`.

## Milestone 09 durable registry

Milestone 09 adds a governed application facade and a replaceable local file-backed adapter for durable snapshot governance. `openGovernedDurableSnapshotRegistry` exposes state-specific registration, change-set, validation, review, human approval or rejection, activation, archival, history, recovery, integrity, and derived-index operations. Before the first await, every public mutation captures only own enumerable data properties from a plain or null-prototype input into a new null-prototype object, defensively clones, strictly parses, and deeply freezes the captured values. The reserved `__proto__` key and all accessors are rejected synchronously. Registration captures and validates the exact raw manifest-evidence descriptor value, so an accessor cannot switch values and no writer is acquired for an invalid input. Internal writer sessions, storage, hooks, and commit helpers are ECMAScript-private and absent from the built prototype. Later caller mutation cannot alter the committed intent. Every mutation then acquires the exclusive writer lock before reading verified state and retains it through precondition validation, record construction, and commit. Registration persists a finite, plain, acyclic canonical-JSON migration manifest and its reference. Approved entries in `ready` or `migrated` state must exactly match the snapshot descriptor set by object ID, object type, source path, and source hash. The engine recomputes the evidence's SHA-256 commitment with a dedicated strict canonical-JSON serializer before record construction and during replay, and rejects a false digest or fully re-signed evidence substitution. Record, envelope, and derived-index verification accepts only canonical JSON primitive leaves, hashes the exact raw canonical representation before schema normalization, normalizes serializer failures to stable domain errors, and requires the parsed representation to remain canonically equivalent. Record builders descriptor-capture and strictly parse first, then omit only schema-accepted explicit `undefined` object properties before fingerprinting; undefined or sparse array positions and every other unsupported value still fail. Raw persisted records never receive this builder-only compatibility projection. The existing canonical fingerprint serializer remains byte-compatible with Milestones 07 and 08, including omission of `undefined` object properties and its historical array behavior. These checks do not alter the Milestone 07 snapshot contract or identity. Activation uses compare-and-swap against the active snapshot recovered under that lock, commits the candidate activation, optional prior-baseline supersession, and audit record in one envelope, and returns a rejected result without authoritative changes when evidence or state preconditions fail.

The governed facade depends on an engine-internal storage/writer port rather than the local filesystem implementation; an in-memory conformance integration exercises registration, lifecycle, review, activation, readers, recovery, integrity, and index delegation through that boundary. The package root does not export the port, replay kernel, canonical record/envelope builders, raw append capability, internal storage, writer session, layout helper, fault hooks, or direct-module adapter test factory. The narrower `LocalFileDurableSnapshotRegistry.open()` export supports immutable registration plus verified reads, recovery, integrity, and index operations; it cannot persist lifecycle, decision, or activation transitions. Governed callers should use `openGovernedDurableSnapshotRegistry`.

### Runtime layout and authority

Both local facades require an existing absolute `allowedParentRoot` and an absolute `runtimeRoot` that is a strict descendant. The implementation creates this fixed layout below `runtimeRoot`:

```text
knowledge-registry/
├── commit-head.json
├── committed/
│   └── <first-sequence>-<last-sequence>-<envelope-fingerprint>.json
├── staging/
│   ├── .<operation>.<random-id>.tmp
│   └── .orphan.<random-id>.<envelope-file>
├── locks/
│   └── writer.lock
└── derived/
    └── active-index.json
```

Sequence bounds in committed envelope names are zero-padded to 16 digits and the envelope fingerprint is a lowercase 64-character SHA-256 digest. The authoritative state is the canonical, fingerprinted `commit-head.json` together with exactly the immutable envelopes in `committed/` bounded by that marker. The marker binds the transaction and record counts, last audit sequence, record-chain head, complete-history integrity fingerprint, and last envelope name and fingerprint. `staging/`, suffix envelopes beyond the marker, `locks/writer.lock`, and `derived/active-index.json` are never governance authority. Active state and all histories are derived by verifying and replaying marker-bounded envelopes; the active index is only a rebuildable cache.

### Commit, locking, and crash assumptions

A writer creates and flushes a canonical envelope in `staging/`, atomically renames it to its deterministic immutable name in `committed/`, and flushes the committed directory. This is preparation, not commitment. It then creates and flushes the next marker in `staging/`. Atomic replacement of the fixed `commit-head.json` is the authoritative commit point, after which the runtime directory is flushed. A crash before marker replacement recovers the previous state and leaves any installed suffix envelope non-authoritative; a later different write moves such suffix orphans to `staging/` quarantine. A crash after marker replacement requires the referenced envelope and its complete coordinates to verify and recover as committed.

The protocol assumes staging, committed, derived, locks, and the marker are on one filesystem with atomic rename and file flush support. Directory flush is attempted and only errors that explicitly mean directory sync is unsupported are suppressed; real I/O failures propagate. If marker replacement succeeds but its directory flush reports failure, the write call can fail even though restart recovery correctly treats the marker-bounded transaction as committed. Canonical fingerprints do not include machine paths. The unkeyed local marker and audit chain detect accidental corruption and partial deletion while the marker remains, but not a coordinated privileged rewrite, re-signing, or deletion of both the complete history and marker.

`locks/writer.lock` is acquired exclusively for each mutation and released only after the short-lived writer session is invalidated. The adapter never guesses that an existing lock is stale and never breaks it automatically. After a process crash, an operator must first establish that no writer is alive and then explicitly remove only `<runtimeRoot>/locks/writer.lock`; ordinary lock conflicts should not be repaired by deleting the file.

### Recovery, integrity, and repair APIs

There is no Milestone 09 registry repair CLI. Use the public APIs:

```typescript
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { openGovernedDurableSnapshotRegistry } from "@founderos/knowledge-engine";

const allowedParentRoot = resolve(".founderos/runtime");
await mkdir(allowedParentRoot, { recursive: true, mode: 0o700 });

const registry = await openGovernedDurableSnapshotRegistry({
  allowedParentRoot,
  runtimeRoot: resolve(allowedParentRoot, "knowledge-registry"),
});

const integrity = await registry.verifyIntegrity();
const recovery = await registry.recover();
const indexStatus = await registry.inspectDerivedIndex();

if (integrity.status === "valid" && indexStatus.status !== "current") {
  await registry.rebuildDerivedIndex();
}
```

`verifyIntegrity()` verifies the full marker-bounded audit chain and returns a valid or invalid authoritative summary. `recover()` returns the independently replayed registry status, registered-snapshot, lifecycle-transition, decision, activation, transaction, and record counts, integrity coordinate, and active snapshot ID only when recovery succeeds; failure results expose the exact completely verified prefix and no active identity. If a marker-referenced tail envelope is missing, an earlier semantic replay failure remains authoritative and retains that exact prefix rather than being replaced by empty progress. Both operations inspect the stored active index against that exact replay and return `derivedIndexStatus` plus `derivedIndexIssues`. A missing, stale, invalid, or fingerprint-mismatched index does not corrupt authoritative status and is never repaired implicitly. `inspectDerivedIndex()` distinguishes `missing`, `current`, `stale`, and `invalid`, and only `rebuildDerivedIndex()` replaces that derived cache after authoritative history verifies. Deterministic results and thrown index-operation domain errors map authoritative reads, derived reads and writes, and other filesystem failures to stable codes and logical operation messages without raw Node.js text, usernames, checkout locations, temporary roots, or absolute runtime paths. After open, storage-topology and managed-entry safety failures are structured invalid or failed integrity/recovery results; path exceptions remain part of open and configuration validation. Authoritative corruption, missing records, marker mismatch, broken fingerprints or links, contradictory lifecycle evidence, and incomplete transactions always fail closed and are never silently skipped, overwritten, or rebuilt. Quarantined staging orphans may accumulate and are non-authoritative; cleanup is an explicit operator maintenance action.

### Path and scope boundaries

The adapter rejects relative roots, lexical traversal, runtime roots outside the allowed parent, symlinked components or leaves, physical escape, non-regular managed entries, cross-device runtime layouts, and any lexical or physical overlap between the runtime and canonical `docs` or `knowledge` sources. The allowed parent may contain both runtime and source trees, but the runtime can be neither inside a source root nor an ancestor containing one. This bidirectional check runs before runtime directories or the commit marker are created and applies to configured and auto-discovered source roots. For an existing planned runtime, auto-discovery recursively checks physical directory names at any depth without following symlinks; deterministic depth, directory, and entry limits fail closed before mutation. Regular managed envelope files are ignored by that directory-only discovery, so a legitimate registry can reopen. The adapter captures and rechecks device, inode, path, and realpath identities around critical operations and uses no-follow reads for leaf files. Callers may provide `canonicalSourceRoots` when repository source roots cannot be discovered. Node.js does not provide portable descriptor-relative `openat(2)` traversal, so these checks assume a cooperative local administrator and do not claim safety against a privileged process racing ancestor replacement between checks.

Milestone 09 deliberately defers database and object-store adapters, distributed locks and transactions, hostile local concurrency guarantees, remote coordination, replication, automatic corpus refresh or synchronization, watchers, event streaming, semantic retrieval and ranking, embeddings, vector or graph persistence, agents, Hermes, MCP, integrations, and UI workflows.

## Milestone 10 governed context assembly

`assembleGovernedKnowledgeContext` is the public context boundary. It strictly parses the request, verifies and recovers the durable registry, captures one immutable active registration, re-verifies that registration's canonical record fingerprint, manifest-to-snapshot binding, manifest fingerprint, and Milestone 07 content fingerprint, obtains candidates only through the supplied Knowledge Repository, and proves that the complete repository snapshot and every candidate match the active snapshot descriptors before query execution and packaging. Integrity/recovery disagreement, missing active state, registry/manifest/repository mismatch, or candidate drift fails closed.

Selection reuses the Milestone 05 exact query and Milestone 06 repository contracts. Required IDs, required types, preferred types, lifecycle/governance priority, object type, project/domain identity, and object ID form the versioned deterministic order; binary string comparison avoids locale and caller-order dependence. Conflicting duplicate IDs fail, while canonically equivalent duplicates are represented once with omission evidence. Required knowledge is never silently omitted.

The authoritative budget measures object count and Unicode code points in the canonical serialized Knowledge Object. Optional per-object limits use the same representation. Truncation is opt-in, works on Unicode code-point boundaries, never mutates source objects, and records original/included counts and fingerprints. Every filtered, duplicate, over-budget, and truncated candidate receives stable evidence. Successful empty context is possible only when the request explicitly permits it.

`verifyKnowledgeContextPackage` is a pure verifier supplied with the package, trusted active registry/snapshot bindings, and repository candidates. It recomputes request, query, query-result, included-content, object, provenance, budget, ordering, evidence, and final context fingerprints and reproduces the assembly result. The optional caller evidence timestamp is preserved but excluded from context identity, so identical governed inputs produce byte-identical packages. Context packages are audit artifacts, not prompts; no LLM, tokenizer, agent, authorization, or semantic-ranking behavior is present.

## Milestone 11 governed Context Consumer delivery

`deliverGovernedKnowledgeContext` is the only exported delivery operation. It accepts one strict Delivery Request, one Context Package, caller-supplied policy-decision evidence, the delivery-specific `GovernedHistoricalSnapshotRegistry`, a Knowledge Repository and matching repository snapshot, an explicit canonical evaluation timestamp, and a caller-owned `BoundedContextDeliveryIdempotencyStore`. It captures every top-level input field through own data-property descriptors before reading values, obtains candidates only from the repository, and independently verifies the complete Milestone 10 package, registered snapshot, activation evidence, and repository binding before evaluating Consumer capabilities, the allowed policy outcome, freshness, historical replay, and idempotency. Policy evidence must bind the exact canonical Delivery Request. A historical package additionally requires `verifyIntegrityAtSequence` and `recoverAtSequence` to derive matching valid integrity and active-state evidence for its exact committed registry prefix; the verifier never fabricates historical recovery state. These prefix operations extend, rather than alter, the Milestone 09 base registry contract. The operation never accepts raw candidate arrays, Query Results, corpus paths, prompts, provider configuration, credentials, or hidden context.

Successful delivery returns a deeply immutable envelope containing the exact Context Package plus deterministic compatibility, policy, freshness, replay-policy, and active-snapshot evidence, followed by a bound acknowledgment and initial-delivery receipt. Preflight rejection returns deterministic governed attempt evidence without pretending an envelope reached a Consumer. Same-key identical replay returns the exact original result for permitted modes and records separate Replay Evidence that binds the current policy and freshness evaluations to the original envelope and receipt; conflicting reuse and single-delivery replay fail. Policy and freshness are revalidated before replay lookup. Artifact verifiers require their authoritative request, candidate, registry, current-state, envelope, acknowledgment, or receipt inputs and reproduce the claimed artifact instead of trusting a self-consistent fingerprint. The initial store has explicit finite FIFO retention and no public mutation surface; it proves replaceable local behavior, not durable or distributed idempotency.

```typescript
import {
  BoundedContextDeliveryIdempotencyStore,
  deliverGovernedKnowledgeContext,
} from "@founderos/knowledge-engine";

const delivery = await deliverGovernedKnowledgeContext({
  request: deliveryRequest,
  contextPackage,
  policyDecisionEvidence,
  registry,
  repository,
  repositorySnapshot,
  idempotencyStore: new BoundedContextDeliveryIdempotencyStore(1_000),
  evaluatedAt: "2026-07-29T12:00:00.000Z",
});
```

Milestone 11 does not authenticate callers, define authorization rules, invoke a model, execute reasoning, run an agent, persist delivery state, or add provider, Hermes, MCP, integration, or UI behavior.

## Milestone 12 durable Context Delivery Ledger

`openLocalFileDurableContextDeliveryLedger` opens the governed Milestone 12 boundary. `commitVerifiedOriginalDelivery` first requires the complete Milestone 11 Envelope verification inputs and independently verifies the Request, Consumer, Context Package identity, Policy evidence, compatibility, Freshness evidence, Envelope, Acknowledgment, and Receipt. It then acquires one writer lock, replays the authoritative Ledger, checks the expected head and permanent idempotency owner, and commits the exact original artifact set in one immutable transaction event. Identical transaction retries and identical key retries return the original result; conflicting identity reuse fails.

Each Replay Attempt is a new audit event. Current Policy and Freshness evidence is independently fingerprint-checked and stored separately. Accepted repeatable replay returns the exact original Envelope, Acknowledgment, and Receipt; single-delivery, expired, policy-denied, freshness-denied, conflict, and evaluation-only attempts never rewrite the original result. Expired keys remain permanently reserved.

The local adapter uses this Git-ignored layout:

```text
.founderos/runtime/context-delivery-ledger/
├── commit-head.json
├── transactions/
├── replay-attempts/
├── staging/
├── derived/
└── .writer.lock
```

An event file is prepared and flushed before atomic installation. Installation is not the commit point. Atomic replacement of the separately fingerprinted `commit-head.json` commits the exact event-bounded prefix. A pre-head crash leaves the prior committed state; a post-head crash requires the complete referenced event. Staging data and suffix orphans are ignored. Recovery recomputes every embedded Milestone 11 fingerprint, durable wrapper fingerprint, transaction fingerprint, event fingerprint, sequence, previous link, and global binding. Derived indexes are non-authoritative and rebuilt only through the explicit API. Their `bounded-latest-v1` policy retains at most the latest 1,024 records in each lookup category; governed reads replay the complete authoritative history, so index retention cannot erase ownership or audit evidence.

The adapter requires an absolute dedicated child of `<repositoryRoot>/.founderos/runtime`, rejects runtime/source overlap in both directions, traversal, symlinks, nested protected trees, runtime identity replacement, unsafe entry types, and resource-limit breaches before mutation. Public results and normalized failures contain only logical locations. The adapter assumes cooperative local administration, one writer, same-filesystem atomic rename, and supported file flushing. It does not provide hostile privileged-filesystem protection, distributed locking, remote consensus, coordinated rollback detection, archival, or destructive compaction.

```typescript
import { openLocalFileDurableContextDeliveryLedger } from "@founderos/knowledge-engine";

const ledger = await openLocalFileDurableContextDeliveryLedger({
  repositoryRoot,
  runtimeRoot: `${repositoryRoot}/.founderos/runtime/context-delivery-ledger`,
  canonicalSourceRoots: [`${repositoryRoot}/docs`, `${repositoryRoot}/knowledge`],
});

const result = await ledger.commitVerifiedOriginalDelivery({
  transaction,
  envelopeVerification,
});
```

Milestone 12 does not invoke a provider or LLM, execute prompts, run Agents or Hermes, call MCP, implement authentication or authorization, add semantic retrieval, or introduce a database.

## Milestone 13 governed reasoning invocation

`invokeGovernedReasoning` is the only public execution path. It accepts an exact Milestone 12 transaction identity and the Durable Delivery Ledger, independently recovers and verifies that Ledger, resolves the authoritative transaction, and verifies the Request registration, permanent idempotency owner, Envelope, Acknowledgment, Receipt, Context Package, Consumer, Policy, Freshness, Active Snapshot, and Registry bindings before accepting an Invocation. It then verifies provider-neutral input and policy fingerprints, performs deterministic capability matching, registers Invocation ownership, appends immutable ordered Attempts and Outcomes, independently verifies the terminal Result Envelope, and atomically finalizes Consumption Evidence.

Milestone 13 instantiates exactly one executor: a deterministic fake provider. Its explicit fixture modes cover structured and empty success, transient and permanent failure, timeout, three cancellation phases, output overflow, malformed and contradictory outcomes, and physical-path or credential-bearing output. The adapter has no Repository, corpus, environment, credential, network, random, implicit-clock, tool, Agent, Hermes, or MCP dependency. Unsafe or malformed output is normalized into sanitized failure evidence before persistence.

`openLocalFileGovernedReasoningExecutionEvidence` opens the local append-only execution-evidence runtime. Its public value exposes only verified reads, recovery, integrity verification, and derived-index rebuild; ownership registration, Attempt append, Outcome append, and finalization remain inaccessible outside the governed Invocation facade. The ownership envelope commits the exact Invocation Request, selected Provider Capability, and delivered Context Package object count under a separate rolling authority fingerprint in the atomic head. Result construction, finalization, recovery, and integrity verification independently reconstruct Receipt, Usage, deterministic-fake Cost, complete Attempt/Outcome history, full execution span, transaction identity, and terminal evidence from that authority. The complete explicit Attempt schedule is validated before ownership. Deadline and cancellation signals are execution controls with deterministic precedence: cancellation observed before execution wins first, explicit deadline cancellation wins at the deadline, an expired execution deadline then wins over cooperative cancellation, and cooperative cancellation applies only while the deadline remains live. An observed terminal control cannot become success, and pre-execution cancellation skips Provider execution. Authoritative events use expected-head compare-and-swap, a single-writer lock, fingerprinted atomic commit markers, immutable event envelopes, file sync, and containing-directory sync. The adapter rejects accessor-backed options, symlinked runtime parents/root/managed directories, and physical confinement changes around writes while normalizing filesystem failures to path-private logical errors. Writer settlement preserves a primary governed-operation error if cleanup also fails; without a primary error, handle-close failure precedes lock-removal failure, and every cleanup failure is normalized before crossing the public boundary. Staging and uncommitted suffix files are ignored; missing, malformed, invalid, or oversized derived indexes remain non-authoritative and cannot block authoritative replay; authoritative corruption fails closed.

```typescript
import {
  invokeGovernedReasoning,
  openLocalFileGovernedReasoningExecutionEvidence,
} from "@founderos/knowledge-engine";

const executionEvidence = await openLocalFileGovernedReasoningExecutionEvidence({
  repositoryRoot,
  runtimeRoot: `${repositoryRoot}/.founderos/runtime/reasoning-execution-ledger`,
  canonicalSourceRoots: [`${repositoryRoot}/docs`, `${repositoryRoot}/knowledge`],
});

const finalized = await invokeGovernedReasoning({
  deliveryLedger,
  executionEvidence,
  deliveryIdentity,
  invocationRequest,
  fixtureMode: "successful-structured-response",
  attemptSchedule,
});
```

The local adapter remains a cooperative single-process runtime. It does not provide a production model, provider selection, credentials, streaming, tools, distributed coordination, remote persistence, authentication, authorization, or Agent execution.

## Milestone 14 production-provider readiness

`createProductionProviderReadinessEvaluator` constructs the sole public composed readiness facade. It captures one approved Transport Policy authority at configuration time and returns frozen `evaluate` and `verifyDecision` operations; neither operation accepts a per-request authority. Evaluator, verifier, harness, response-fixture, and authority wrappers require an exact plain own-key shape and own enumerable data descriptors. Non-enumerable fields, symbols, accessors, inherited capabilities, and custom prototypes fail before any wrapper value, Delivery Ledger, or Transport authority is read. The evaluator accepts one exact durable Milestone 12 Delivery identity and its Milestone 13 Invocation Request, recovers and independently verifies the existing Delivery authority, and then evaluates the following fail-closed workflow in order:

1. Verify the durable Delivery and exact Invocation.
2. Enforce externally supplied Authorization Decision evidence before any Adapter, Credential, Capability, Transport, Rate, or Cost preparation. Milestone 14 consumes exact authorization evidence; it does not authenticate a subject or create an authorization engine.
3. Verify the disabled/validation-only/dry-run Adapter descriptor.
4. Validate the Credential Reference and its availability, scope, provider, rotation, and Adapter bindings. This is reference validation only; no secret resolution, read, storage, or return occurs.
5. Match the existing Milestone 13 provider-neutral Capability descriptor.
6. Resolve the expected signed Transport Policy from a provider-neutral deterministic authority
   keyed by the exact Adapter binding, verify the caller candidate against it, enforce exact
   Invocation timeout compatibility, and construct a non-executable dry-run Transport Plan. Milestone
   13 application-attempt retry and Milestone 14 transport retry are independent controls.
7. Simulate bounded Rate/Capacity admission with caller-supplied counters and explicit time.
8. Simulate Cost/Budget admission with deterministic fixture pricing and integer minor-unit arithmetic.
9. Reject Circuit reset, then derive and verify Circuit state, permitting only closed state or an
   explicitly bounded half-open dry-run probe while preserving Disabled and Quarantined containment.
10. Build redacted Logs, Metrics, Traces, public-error evidence, and readiness; append that exact
    bundle once to an internally constructed bounded deterministic in-memory sink; immediately
    capture and verify the retained snapshot in exact order and content; and sign provider-neutral
    retention evidence for the exact sink configuration, ordered fingerprints, counts, snapshot,
    and single append before continuing.
11. Derive and verify Health from the exact preceding evidence.
12. Construct and independently verify a byte-stable, redacted dry-run Request Plan.
13. Construct and independently verify the final Readiness Decision.
14. Record the structural stop before transport.

The facade returns immutable evidence and may report `ready-for-dry-run`, but no live-ready or enabled state exists. The final Decision binds the retention-evidence fingerprint. After the final Decision is constructed and internally verified, its configured evaluator records the exact Decision and retention-evidence canonical bytes plus Adapter, Invocation, and Observability bindings in an evaluator-private issuance registry. The registry has a fixed capacity of four and deterministic `first-issued-fifo-v1` eviction. Repeating an identical evaluation is idempotent for issuance and does not refresh its FIFO position, although each evaluation still performs its own single sink append. `verifyDecision` requires the original retention evidence alongside the Decision and authoritative input, requires that exact pair to remain issued by the same evaluator instance, and reconstructs the observability bundle and retained snapshot without instantiating a sink or emitting a second artifact. A fresh evaluator and an evicted pair fail closed. The registry is not exposed or configurable and provides no persistence or cross-process verification. Its Transport authority has one synchronous policy-lookup method and no endpoint, provider client, network, credential, secret, DNS, TLS, or socket method. Response Mapping uses 12 fixed deterministic, ephemeral fixtures to normalize success and sanitized failure cases into Milestone 13-compatible Attempt, Outcome, Receipt, Usage, Cost, terminal, Result, and mapping evidence. The mapped chain is independently verified in memory and never appended to the Milestone 13 execution Ledger; no raw provider response, header, or error body is retained. Transport response limits reserve one safe-integer byte so the oversized fixture remains valid at its maximum boundary.

`createDisabledProductionProviderAdapterHarness` captures the same kind of approved Transport Policy authority once and exposes a frozen `run` facade with exactly 11 validation/simulation modes: contract validation, authorization validation, Credential Reference validation, Transport Plan dry run, Request Mapping dry run, Response Mapping fixture, Rate/Cost admission simulation, Circuit simulation, Health evaluation, Observability/Redaction simulation, and full readiness evaluation. Observability and Health simulation each construct and verify one private bounded sink and return immutable retention evidence; full readiness relies only on the evaluator's single append and passes its returned retention evidence into non-emitting Decision verification. Every mode uses explicit time and deterministic fixtures, returns immutable evidence, and rejects enabled Adapter states, raw credentials, arbitrary URLs, callbacks, provider clients, raw Knowledge or Query Results, unverified Delivery/Invocation material, caller-supplied authorities, caller-supplied sinks, and caller-supplied low-level readiness artifacts.

Milestone 14 does not perform DNS resolution, TLS negotiation, socket creation, HTTP requests, SDK or client calls, secret-store access, live provider pricing synchronization, persistence, or external log/metric/trace delivery. There is no real provider response or production-provider execution. Streaming, tools/functions, Agents, Hermes, MCP, multi-provider routing/failover, authentication or authorization systems, distributed admission/containment, UI, and real-provider enablement remain deferred.

## Milestone 15 durable readiness evaluation ledger

The canonical Milestone 15 import is `@founderos/knowledge-engine/readiness-ledger`. The legacy aggregate package root deliberately does not expose the Milestone 15 ledger facade, keeping the approved dedicated capability closure separate from predecessor snapshot-registry exports. `openLocalFileReadinessEvaluationLedger` opens or explicitly initializes a Git-ignored local ledger rooted in one deterministic `m15-genesis` history/head/marker commitment. The governed facade can register one same-instance-verified Milestone 14 evaluation, return an exact permanently owned registration retry without append, record fresh-evaluator replay evidence at immutable original time plus separate current admissibility time, read marker-bounded transactions and replay attempts, recover and verify integrity, return the exact marker-embedded head, and explicitly rebuild derived state.

Registration and replay reuse the sole Milestone 12 recovery and Milestone 13 Delivery/Invocation resolver. Public request data is strictly captured before protected work; the exact Milestone 14 evaluator instance must be present in the evaluator factory's private provenance registry, and its configuration is derived internally rather than established by caller assertion. Every transaction preserves only reference-safe authority, a strict allowlisted retained-evidence projection, logical Credential Reference identity, exact canonical `.sssZ` UTC timestamps, and canonical fingerprints. Registration verifies every caller-requested ID across the request, permanent ownership, transaction, semantic event, audit entry, marker, head, and complete-history graph. Replay inspects its six permanent coordinates in fixed key/request/attempt/semantic/audit/marker order and returns exact retry or coordinate conflict before original-input/time comparison, Delivery recovery, evaluator access, or a writer lock; unused coordinates then require the exact original readiness-input fingerprint and original time, with all coordinates revalidated under the lock. The local adapter locks before staging, retains and revalidates root and nested canonical directory identities, requires authoritative files to be exact canonical UTF-8, derives bounded fixed-length physical event names from domain-separated identifier hashes, and commits only by atomically replacing a current marker byte-identical to its archive. A registration directory contains exact separate `registration-request`, `ownership`, `transaction`, `semantic-event`, `audit-entry`, `complete-history`, `ledger-head`, and `commit-marker` JSON components; a replay directory substitutes exact `replay-request`, `historical-comparison`, `current-admissibility`, and `replay-attempt` components for the registration-specific group. Recovery strictly parses and canonically cross-binds every component and rejects extra active files. Once the marker is active, any later filesystem or derived-publication fault returns a committed/recorded result with ephemeral `derivedStateStatus: "invalid"`, never a rejected append. It never steals an abandoned lock. Missing or corrupt derived `HEAD`/indexes are separate from authority and rebuild only from verified history.

Operation-result reasons are closed by the schema-owned taxonomy version `1.0`. Production normalizes unexpected internal failures to the operation's canonical invalid-input or integrity reason before parsing the strict result union; it never returns an arbitrary error code.

| Operation           | Status             | Canonical reasons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Production branch                                                                                                              | Normative/test reference                                                                              |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| registration        | `rejected`         | `append-failure`, `concurrent-writer-conflict`, `configuration-mismatch`, `decision-id-conflict`, `evaluation-package-mismatch`, `evaluation-verification-failed`, `idempotency-key-conflict`, `invalid-input`, `invalid-registration-input`, `lock-unavailable`, `operator-cleanup-required`, `ownership-id-conflict`, `registration-audit-entry-id-conflict`, `registration-marker-id-conflict`, `registration-request-id-conflict`, `registration-semantic-event-id-conflict`, `stale-expected-head`, `transaction-id-conflict`               | request/evaluator validation, exact ownership conflict, writer precondition, or pre-commit failure                             | `M15-REG-001`, `M15-IDEM-001`, `M15-FS-003`; `M15-SC-002`, `003`, `037`–`039`, `063`–`069`, `072`     |
| registration        | `integrity-failed` | `genesis-corrupt`, `genesis-initialization-incomplete`, `ledger-uninitialized`, `readiness-ledger-integrity-failure`, `unsafe-filesystem-state`                                                                                                                                                                                                                                                                                                                                                                                                  | authoritative inspection fails before a writer is entered                                                                      | `M15-INTEGRITY-001`, `M15-GENESIS-001`; integrity and genesis regression suites                       |
| replay              | `not-recorded`     | `append-failure`, `genesis-corrupt`, `genesis-initialization-incomplete`, `invalid-input`, `invalid-replay-input`, `ledger-uninitialized`, `lock-unavailable`, `operator-cleanup-required`, `original-transaction-not-found`, `readiness-ledger-integrity-failure`, `replay-attempt-id-conflict`, `replay-audit-entry-id-conflict`, `replay-idempotency-key-conflict`, `replay-input-mismatch`, `replay-marker-id-conflict`, `replay-request-id-conflict`, `replay-semantic-event-id-conflict`, `stale-expected-head`, `unsafe-filesystem-state` | strict input, permanent replay ownership, original lookup/input binding, writer precondition, integrity, or pre-commit failure | `M15-REPLAY-002`, `M15-IDEM-002`, `M15-FS-003`; `M15-SC-004`, `016`–`020`, `047`, `051`, `070`, `072` |
| registration/replay | success variants   | none; `reason` is forbidden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | committed or exact-idempotent result                                                                                           | `M15-REG-001`, `M15-REPLAY-002`, `M15-REPLAY-003`                                                     |

`verifyIntegrity()` findings and failed `recover()` errors expose only the schema-owned redacted inventory: `genesis-corrupt`, `genesis-initialization-incomplete`, `ledger-uninitialized`, `readiness-ledger-integrity-failure`, or `unsafe-filesystem-state`. An internal storage or adapter error whose code is not in that inventory is normalized to `readiness-ledger-integrity-failure`; raw exception messages, paths, URIs, and unknown diagnostic codes never cross these public boundaries. Derived-index rebuild failures are independently normalized into their own closed schema-owned reason inventory.

Committed-registration and replay-attempt list methods replay verified authoritative history and return bounded pages rather than unbounded arrays. Queries accept only `limit` and an exclusive positive `afterSequence`; the default page size is 100 and the maximum is 256. Page metadata reports the requested and returned sizes, current/next cursors, `hasMore`, and the exact source head and sequence. Derived indexes are never list authority, so missing, stale, or corrupt derived files do not alter page contents. Shared limits cap total authoritative events, retained observability items, discovered filesystem entries, staging entries, and quarantine entries at 10,000; source roots, reason codes, mismatch paths, gate traces, derived collections, and public findings have smaller exported caps. Boundary validation happens before unbounded materialization. Pagination results and derived-state status are non-durable, strict, redacted, and non-fingerprinted.

The implementation has no credential resolver, environment-secret read, endpoint, provider client, HTTP/DNS/TLS/socket path, streaming, tool/function calling, Agent, Hermes, MCP, routing, distributed persistence, external observability, UI, deployment, or live-ready status. A stored transaction is audit evidence only. ADR-0019 is Accepted following independent whole-candidate review and merge through pull request #13. That acceptance does not authorize any deferred capability.

First creation is serialized by a deterministic parent-scoped initialization lock acquired before the ledger root or canonical layout is mutated. A concurrent creator waits boundedly, then verifies the same byte-identical genesis; elapsed time never authorizes lock stealing. A crashed initializer leaves stable operator-action evidence. Writer-lock inspection returns only status, PID, and fingerprint evidence. `cleanupInactiveWriterLock` accepts that exact identity through a strict plain-data request, independently checks local process liveness, revalidates root and lock identity, refuses active, ambiguous, replaced, symlinked, or orphan-adjacent state, and deletes only the fixed writer-lock file. Process-liveness evidence is local-platform and cooperative: `ESRCH` proves inactivity, permission denial remains active, and ambiguous failures do not authorize deletion. The adapter caps root paths at 768 UTF-8 bytes, derived paths at 1,024 bytes, lexical components at 240 bytes, and event basenames at 96 bytes.

Milestone 15 engineering verification keeps ordinary Vitest discovery single-level: the runtime registry calls 72 scenario test bodies and a separately counted registry integrity test. The clean-process genesis scenario alone starts two bounded, single-file Vitest child processes so each computes canonical genesis bytes in a genuinely separate runtime; it does not launch a package or workspace suite. In ordinary tests SC-035 validates only the standalone predecessor gate contract and does not claim predecessor execution. After ordinary `pnpm test` completes, `pnpm verify:m15-predecessor-bound` runs the standalone predecessor command once, captures its real exit and stdout in an ephemeral signed same-candidate attestation outside repository authority, and reruns only SC-035 to consume that evidence. The underlying verifier derives the original inventory from the authorized documentation base, requires 41 predecessor files to be byte-identical, permits only one exactly pinned M14 provenance patch by base/candidate/patch SHA-256, executes those 42 files with bounded workers, proves all 1,038 original tests passed, and reports the additional Milestone 14 evaluator-provenance test separately. Real-Git preflight tests use isolated repositories and controlled command-mapping seams without fetching or repository mutation. The knowledge-engine package test command runs 34 non-scenario files first with one worker, then runs the 73-test scenario registry alone in a separate final one-worker OS process with bail-on-first-failure. This preserves every existing timeout and assertion while ensuring a framework-timed-out scenario process cannot overlap durable-ledger tests. Volatile aggregate full-suite totals belong in current verification evidence rather than long-lived package documentation. The versioned implementation preflight accepts only the five authorized input fields and independently observes branch, refs, merge base, ahead/behind state, ancestry, staged/unstaged/untracked work, pre-existing runtime paths, and the prohibited remote implementation branch without mutating Git.

```typescript
import {
  assembleGovernedKnowledgeContext,
  verifyKnowledgeContextPackage,
} from "@founderos/knowledge-engine";

const result = await assembleGovernedKnowledgeContext({
  request,
  registry,
  repository,
  repositorySnapshot,
});

if (result.status === "assembled") {
  const verification = verifyKnowledgeContextPackage({
    package: result.package,
    candidateInputs: await repository.getCandidates(),
    bindings,
  });
}
```

```typescript
import { queryKnowledgeObjects } from "@founderos/knowledge-engine";

const result = queryKnowledgeObjects(query, candidateObjects);
```

```typescript
import {
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
  queryKnowledgeRepository,
} from "@founderos/knowledge-engine";

const source = new InMemoryKnowledgeCandidateSource(sourceDescriptor, candidateObjects);
const repository = await InMemoryKnowledgeRepository.create([source]);
const result = await queryKnowledgeRepository(query, repository);
```

```typescript
import { initializeCorpusKnowledgeRepository } from "@founderos/knowledge-engine";

const { repository, snapshot, snapshotComparisonEvidence } =
  await initializeCorpusKnowledgeRepository({
    rootPath: process.cwd(),
    manifestPath: "knowledge/migration-manifest.yaml",
    corpusVersion: "priority-1-v1",
    createdAt: "2026-07-28T00:00:00Z",
    createdBy: "knowledge-engine",
  });
```

```typescript
import {
  activateKnowledgeSnapshotApprovalWorkflow,
  approveKnowledgeSnapshotApprovalWorkflow,
  beginKnowledgeSnapshotApprovalReview,
  createKnowledgeSnapshotLifecycleRecord,
  initializeKnowledgeSnapshotApprovalWorkflow,
  validateKnowledgeSnapshotLifecycle,
} from "@founderos/knowledge-engine";

// The active snapshot, comparison evidence, and active lifecycle come from the
// preceding approved workflow. The proposal is a newer snapshot of the same corpus.
const proposedValidated = validateKnowledgeSnapshotLifecycle(
  createKnowledgeSnapshotLifecycleRecord(proposedSnapshot),
  proposedSnapshot,
  { actorId: "validator", transitionedAt: "2026-07-28T00:01:00.000Z" },
);
const workflow = initializeKnowledgeSnapshotApprovalWorkflow({
  activeSnapshot,
  activeSnapshotEvidence,
  activeSnapshotLifecycle,
  proposedSnapshot,
  proposedSnapshotEvidence,
  proposedSnapshotLifecycle: proposedValidated,
});
const reviewing = beginKnowledgeSnapshotApprovalReview(workflow, {
  actorId: "reviewer",
  transitionedAt: "2026-07-28T00:02:00.000Z",
});
const approved = approveKnowledgeSnapshotApprovalWorkflow(reviewing, {
  actorId: "approver",
  decidedAt: "2026-07-28T00:03:00.000Z",
  reason: "The source, provenance, and impact were reviewed.",
});
const activated = activateKnowledgeSnapshotApprovalWorkflow(approved, {
  actorId: "activator",
  transitionedAt: "2026-07-28T00:04:00.000Z",
});

// `activated.activeSnapshotLifecycle` is superseded and
// `activated.proposedSnapshotLifecycle` is active.
```

From the repository root:

```bash
pnpm knowledge:migrate
```

Directory ingestion is recursive, Markdown-only, stable in path order, and does not follow symbolic links. Repository access remains an immutable in-memory snapshot; Milestone 09 durably stores governed snapshot and audit evidence, not query candidates or a general knowledge database. Milestone 08 lifecycle and approval workflows remain pure in-memory APIs, while the Milestone 09 governed registry is the explicit persistence boundary. Neither path synchronizes, automatically approves, or automatically activates a snapshot. Snapshot comparison detects changes but does not synchronize them. Querying remains deterministic exact filtering—not full-text search, semantic retrieval, ranking, or authorization. The implementation does not watch a vault or implement embeddings, graph storage, Hermes, agents, or MCP integrations.

## Milestone 17 authorization decision authority

Milestone 17 adds domain-separated canonical constructors and verifiers plus a factory-created,
process-local execution Authorization Decision authority. The authority captures immutable Service
Identity evidence ID, workload and issuer-proof references, human approval, revocation, subject,
Consumer, Delivery, Context, Invocation, Execution Attempt, environment, operation, fixed
processing tier `default`, Adapter, provider-family, model, instruction-profile, logical Credential
Reference, classification, limit, and lifetime policy. It issues deterministic exact-bound
Decisions, permanently claims one exact Execution Attempt, supports authority-bound monotonic
revocation and immutable inspection, and verifies only exact registered artifacts at an explicit
time.

`runDisabledExecutionAuthorizationHarness` exercises issuance, permanent claim, pre/post-revocation
inspection and verification, successful revocation N, stale/equal rejection, successful later
N+1, and claim preservation without callbacks, filesystem, environment, credential, provider,
endpoint, transport, or network capability. Its success status is evaluation evidence only; it
never reports live execution enablement. Registry state is intentionally non-durable and cannot
coordinate across processes.
