# FounderOS Milestone 15 Acceptance Criteria v1.0

## Status

**Specified — not implemented**

## Normative Requirement Catalog

Every normative clause elsewhere in the Milestone 15 set is assigned by the machine-readable source-section ownership rules below to one or more independently testable requirements. This catalog is the stable requirement namespace used by acceptance and future executable verification.

| Requirement ID | Normative requirement | Acceptance criterion ID |
| --- | --- | --- |
| `M15-ARCH-001` | Preserve provider-neutral strict contracts, `knowledge-engine -> knowledge-schema`, and the sole Milestone 13/14 authority path. | `M15-AC-ARCH-001` |
| `M15-SCHEMA-001` | Strict versioned schemas and canonicalization reject unknown, explicit-`undefined`, accessor-backed, symbolic, inherited, hidden, aliased, custom-prototype, executable, non-finite, or cyclic input. | `M15-AC-SCHEMA-001` |
| `M15-PKG-001` | Schema owns storage-independent contracts; engine owns orchestration and adapters; dependency direction remains `knowledge-engine -> knowledge-schema`. | `M15-AC-PKG-001` |
| `M15-REG-001` | Registration and identical retry run recovery, current governed resolution, evaluation, same-instance verification, and canonical reconstruction exactly once before commit or return. | `M15-AC-REG-001` |
| `M15-REG-002` | Caller-supplied packages are equality candidates only; missing, stale, reordered, altered, or substituted members fail before mutation. | `M15-AC-REG-002` |
| `M15-IDEM-001` | The first original registration permanently and globally owns its idempotency key, ownership ID, request ID, transaction ID, Decision ID, registration semantic-event ID, registration audit-entry ID, registration marker ID, and exact bindings; only an exact retry may return it. | `M15-AC-IDEM-001` |
| `M15-IDEM-002` | Replay idempotency key and request, attempt, semantic-event, audit-entry, and marker IDs are globally and permanently owned; exact replay retry requires the exact owned tuple and request fingerprint. | `M15-AC-IDEM-002` |
| `M15-COMMIT-001` | Every fingerprint follows the sole named, acyclic commitment-domain table in the transaction contract. | `M15-AC-COMMIT-001` |
| `M15-GENESIS-001` | Explicit canonical genesis history, head, and marker commitments define the sole initialized-empty authority and fail closed under partial initialization or corruption. | `M15-AC-GENESIS-001` |
| `M15-HEAD-001` | Genesis and event heads use one exact latest-coordinate schema; marker embedding, `readHead()`, and derived `HEAD` use byte-identical head bytes. | `M15-AC-HEAD-001` |
| `M15-TXN-001` | The verified atomically installed marker is the sole visibility boundary; its embedded head is authoritative and separate `HEAD`/indexes are derived. | `M15-AC-TXN-001` |
| `M15-TXN-002` | Each event retains one immutable archived marker value byte-identical to the value installed at the replaceable fixed current-marker location; only fixed-marker replacement activates visibility. | `M15-AC-TXN-002` |
| `M15-AUDIT-001` | Marker-bounded events, audit sequence, previous-head links, complete-history commitments, and resulting heads verify without gaps or reordering. | `M15-AC-AUDIT-001` |
| `M15-REPLAY-001` | Replay always performs historical reconstruction at `originalEvaluationTime` and separately assesses current admissibility at `replayEvaluatedAt`. | `M15-AC-REPLAY-001` |
| `M15-REPLAY-002` | Replay exposes the exact historical, current-admissibility, append, and `recorded`/`not-recorded`/`idempotent-replay-returned` operation taxonomies with stable reasons. | `M15-AC-REPLAY-002` |
| `M15-REPLAY-003` | Exact replay retry verifies permanent history and returns the original attempt without reassessment or append; its owned original expected head need not equal the later current head. | `M15-AC-REPLAY-003` |
| `M15-INTEGRITY-001` | Integrity verifies all authoritative commitments and identities, fails closed, and returns strict non-fingerprinted ephemeral results that are never persisted in authoritative, derived, or logging material. | `M15-AC-INTEGRITY-001` |
| `M15-INTEGRITY-002` | Derived `HEAD` and indexes never establish authority; missing or corrupt derived state is reported separately and rebuilt only from verified marker-bounded history. | `M15-AC-INTEGRITY-002` |
| `M15-RECOVERY-001` | Recovery deterministically yields the old or new complete marker-bounded head, never partial or silently repaired authority. | `M15-AC-RECOVERY-001` |
| `M15-FS-001` | The local adapter satisfies every row of the sole 19-point fault/lock matrix, safe-path rules, CAS, and explicit local limitations. | `M15-AC-FS-001` |
| `M15-FS-002` | Safe-open confines lexical and physical paths, rejects symlinks and unsafe entries, and performs no-follow leaf and directory-identity checks without overclaiming hostile-filesystem safety. | `M15-AC-FS-002` |
| `M15-FS-003` | Mutation acquires the cooperative lock before staging, revalidates under lock, uses expected-head CAS, never steals stale locks, and permits operator removal of only an inactive lock. | `M15-AC-FS-003` |
| `M15-PRIVACY-001` | The sole exhaustive evidence inventory distinguishes authoritative and derived durable state from every non-fingerprinted, non-persisted application/adapter operation-result envelope, transient status value, and validation report; all inputs, data, reports, errors, and indexes exclude prohibited material and physical paths. | `M15-AC-PRIVACY-001` |
| `M15-PRIVACY-002` | Every public error, integrity result, recovery result, replay record, audit event, log, and report uses logical redacted coordinates and never exposes a physical path. | `M15-AC-PRIVACY-002` |
| `M15-NET-001` | Production import closure and runtime probes prove no network, provider, Agent, Hermes, MCP, streaming, or tools/functions capability. | `M15-AC-NET-001` |
| `M15-CRED-001` | Only Credential Reference ID/fingerprint may persist; no credential resolver, secret read, value, or access path exists. | `M15-AC-CRED-001` |
| `M15-NOEXEC-001` | Stored readiness and replay evidence never grants execution authority or introduces live-ready, credential-resolution, or transport behavior. | `M15-AC-NOEXEC-001` |
| `M15-BASELINE-001` | Future implementation requires the pinned Milestone 14 predecessor, separately authorized documentation merge SHA, exact `codex/milestone-15` branch, clean worktree, and no pre-existing runtime work. | `M15-AC-BASELINE-001` |
| `M15-DOC-001` | ADR-0019 remains Proposed and Milestone 15 remains Specified — not implemented until separately reviewed implementation exists; links and versions remain consistent. | `M15-AC-DOC-001` |

## Acceptance Criteria

- [ ] `M15-AC-ARCH-001`: Strict versions, unknown-field rejection, storage/provider independence, package boundaries, and sole upstream authority are preserved.
- [ ] `M15-AC-SCHEMA-001`: Every prohibited JavaScript/object shape and canonical-data edge rejects deterministically before authority or mutation.
- [ ] `M15-AC-PKG-001`: Static dependency inspection proves exact package ownership and no reverse dependency.
- [ ] `M15-AC-REG-001`: First registration commits a fully verified transaction; exact retry performs the mandated checks exactly once and returns `idempotent-original-returned` without mutation.
- [ ] `M15-AC-REG-002`: Stale fingerprints, missing members, altered order/retention, and coherent substitutions reject before ownership or append.
- [ ] `M15-AC-IDEM-001`: Cross-key/request reuse of any of the eight original-registration ownership coordinates returns its stable coordinate-specific conflict; exact retry binds every caller-requested ID and never creates a second original transaction.
- [ ] `M15-AC-IDEM-002`: Replay idempotency-key and identity conflicts fail globally; only an exact retry of the complete key/five-ID/request tuple returns the original attempt without append.
- [ ] `M15-AC-COMMIT-001`: Fixtures independently recompute every row of `M15-COMMIT-001`; no artifact commits to itself or a later artifact.
- [ ] `M15-AC-GENESIS-001`: Clean processes reproduce identical genesis bytes; create exposes either no authority or one complete genesis state; every genesis crash/corruption case is classified; and first registration advances exactly from the verified genesis head.
- [ ] `M15-AC-HEAD-001`: Genesis, first-registration, and replay fixtures enforce exact keys/nullability/latest coordinates and byte equality among marker-embedded head, `readHead()`, and rebuilt derived `HEAD`.
- [ ] `M15-AC-TXN-001`: A transaction becomes visible only through a verified installed marker; missing derived `HEAD` or index after marker commit is rebuildable and does not undo authority.
- [ ] `M15-AC-TXN-002`: Every activated marker has one byte-identical immutable archive; archived candidates alone remain invisible and fixed current-marker mismatch fails closed.
- [ ] `M15-AC-AUDIT-001`: Audit, event, history, marker, count, and head coordinates verify exactly.
- [ ] `M15-AC-REPLAY-001`: Historical reconstruction never depends on current admissibility; `matched` plus `authorization-expired` is recorded and execution authority remains absent.
- [ ] `M15-AC-REPLAY-002`: Recorded outcomes append exactly one attempt; not-recorded outcomes append none and expose exactly one stable reason; idempotent replay returns an existing attempt as not-appended.
- [ ] `M15-AC-REPLAY-003`: Exact replay retry verifies the full five-ID ownership tuple and original request, returns `idempotent-replay-returned`/`not-appended`, and tolerates only later current-head advancement.
- [ ] `M15-AC-INTEGRITY-001`: Missing, corrupt, contradictory, substituted, duplicated, or privacy-invalid authority fails closed; derived-state findings remain separate; integrity/recovery outputs are never fingerprinted or persisted.
- [ ] `M15-AC-INTEGRITY-002`: Missing and corrupt derived state are independently detected, never trusted, and explicitly rebuilt to deterministic bytes from verified history.
- [ ] `M15-AC-RECOVERY-001`: Restart and injected interruption recover exactly a complete old or new marker-bounded prefix.
- [ ] `M15-AC-FS-001`: Safe-open, cooperative locking, no automatic stale-lock stealing, operator-only cleanup, atomic publication, synchronization, CAS, and all 19 fault rows pass.
- [ ] `M15-AC-FS-002`: Traversal, physical escape, symlink, special-file, unsafe-entry, overlap, no-follow, and directory-identity tests pass with path-redacted results.
- [ ] `M15-AC-FS-003`: No staging write occurs before lock acquisition; lock/CAS revalidation and stale-lock cleanup constraints hold under deterministic concurrency tests.
- [ ] `M15-AC-PRIVACY-001`: Plain-own-data validation rejects explicit `undefined`, accessors without invocation, symbols, hidden/inherited fields, custom prototypes, aliases, executable values, secrets, endpoints, and physical-path disclosure; stored-data inspection permits only inventoried authoritative/derived evidence and excludes every application/adapter operation-result envelope, transient status value, and validation report.
- [ ] `M15-AC-PRIVACY-002`: Every public result, stored record, log, and completion report passes physical-path redaction inspection.
- [ ] `M15-AC-NET-001`: Static import closure and runtime probes find no outbound or provider-execution path.
- [ ] `M15-AC-CRED-001`: Static import closure, runtime probes, and stored-data inspection find no credential access or value.
- [ ] `M15-AC-NOEXEC-001`: Status schemas, facade inspection, imports, and runtime probes expose no live-execution authority or path.
- [ ] `M15-AC-BASELINE-001`: Future implementation preflight rejects every unauthorized SHA, branch, dirty-worktree, and pre-existing-runtime case.
- [ ] `M15-AC-DOC-001`: Documentation lint verifies status, ADR, version, index, and relative-link invariants.

## Verification Scenario Catalog

| Scenario ID | Required result | Authoritative mutation | Requirements |
| --- | --- | --- | --- |
| `M15-SC-001` | Successful first registration | one original event | `M15-ARCH-001`, `M15-REG-001`, `M15-IDEM-001` |
| `M15-SC-002` | Exact registration retry runs authority/evaluator checks exactly once and returns original | none | `M15-REG-001`, `M15-IDEM-001` |
| `M15-SC-003` | Same idempotency key with a different request fingerprint returns `idempotency-key-conflict` | none | `M15-IDEM-001` |
| `M15-SC-004` | Exact replay retry returns original attempt; conflicting replay identities reject | none | `M15-IDEM-002` |
| `M15-SC-005` | Every commitment-table fixture recomputes byte-for-byte in normative order | none | `M15-COMMIT-001`, `M15-AUDIT-001` |
| `M15-SC-006` | Historical match plus current Authorization expiration records both statuses | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-007` | Current Authorization denial records `authorization-denied` | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-008` | Current review-required records `authorization-review-required` | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-009` | Current not-evaluated records `authorization-not-evaluated` | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-010` | Invalid Authorization evidence records `authorization-invalid-evidence` | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-011` | Original-time reconstruction and current-time admissibility use distinct bound timestamps | one replay event | `M15-REPLAY-001` |
| `M15-SC-012` | Valid package inequality is `mismatched` with bounded paths | one replay event | `M15-REPLAY-002` |
| `M15-SC-013` | Evaluator configuration mismatch records historical `verification-failed` | one replay event | `M15-REPLAY-002` |
| `M15-SC-014` | Delivery authority mismatch records historical `verification-failed` | one replay event | `M15-REPLAY-002` |
| `M15-SC-015` | Invocation authority mismatch records historical `verification-failed` | one replay event | `M15-REPLAY-002` |
| `M15-SC-016` | Ledger-integrity failure returns not-recorded | none | `M15-INTEGRITY-001`, `M15-REPLAY-002` |
| `M15-SC-017` | Missing original returns not-recorded | none | `M15-REPLAY-002` |
| `M15-SC-018` | Invalid replay input returns not-recorded before authority access | none | `M15-REPLAY-002`, `M15-PRIVACY-001` |
| `M15-SC-019` | Replay append failure returns not-recorded/not-appended | none | `M15-REPLAY-002` |
| `M15-SC-020` | Stale expected replay head returns `stale-expected-head`/not-recorded | none | `M15-REPLAY-002`, `M15-FS-003` |
| `M15-SC-021` | Every registration-applicable matrix row, including 1–14, 18, and 19, recovers old or new complete head | zero or one event per row | `M15-TXN-001`, `M15-RECOVERY-001`, `M15-FS-001` |
| `M15-SC-022` | Every replay-applicable matrix row, including replay-specific 15–17 and shared publication/lock rows, recovers old or new complete head | zero or one event per row | `M15-TXN-001`, `M15-RECOVERY-001`, `M15-FS-001` |
| `M15-SC-023` | Interruption with lock and stale-lock discovery block writes; operator cleanup changes only lock | none | `M15-FS-001` |
| `M15-SC-024` | Deterministic index rebuild restores exact lookups from verified history | derived only | `M15-TXN-001`, `M15-INTEGRITY-001` |
| `M15-SC-025` | Derived `HEAD` rebuild after marker commit restores exact projection | derived only | `M15-TXN-001`, `M15-RECOVERY-001` |
| `M15-SC-026` | Corrupt, missing, reordered, duplicated, partial, or coherently substituted authority fails | none | `M15-AUDIT-001`, `M15-INTEGRITY-001` |
| `M15-SC-027` | Unknown and explicit-`undefined` fields reject | none | `M15-ARCH-001`, `M15-SCHEMA-001`, `M15-PRIVACY-001` |
| `M15-SC-028` | Accessor-backed input rejects without accessor invocation | none | `M15-SCHEMA-001`, `M15-PRIVACY-001` |
| `M15-SC-029` | Symbols, hidden/inherited properties, custom prototypes, aliases, and executable input reject | none | `M15-SCHEMA-001`, `M15-PRIVACY-001` |
| `M15-SC-030` | Traversal, symlink, special file, unsafe entry, and runtime/source overlap reject | none | `M15-FS-001` |
| `M15-SC-031` | Errors and reports contain logical coordinates and no physical path | none | `M15-PRIVACY-001` |
| `M15-SC-032` | Stored-data traversal finds no prohibited or secret-like material | none | `M15-PRIVACY-001`, `M15-CRED-001` |
| `M15-SC-033` | Exact production import closure and runtime probe prove no network/provider path | none | `M15-NET-001` |
| `M15-SC-034` | Exact production import closure and runtime probe prove no credential path | none | `M15-CRED-001` |
| `M15-SC-035` | All Milestone 04–14 regression tests pass without predecessor-test loss, preserving at least the pinned 42-file and 1,038-test baseline including Milestone 14 FIFO behavior | none | `M15-ARCH-001`, `M15-REG-001`, `M15-BASELINE-001` |
| `M15-SC-036` | Exact historical reconstruction while currently admissible records `matched` plus `admissible` | one replay event | `M15-REPLAY-001`, `M15-REPLAY-002` |
| `M15-SC-037` | Same registration request ID under a different key returns `registration-request-id-conflict` | none | `M15-IDEM-001` |
| `M15-SC-038` | Same transaction ID under a different key or request returns `transaction-id-conflict` | none | `M15-IDEM-001` |
| `M15-SC-039` | Same Decision ID under a different key or request returns `decision-id-conflict` and no second original exists | none | `M15-IDEM-001` |
| `M15-SC-040` | Each stale request, transaction, Decision, authority, configuration, package, and evidence fingerprint rejects independently | none | `M15-REG-002`, `M15-COMMIT-001` |
| `M15-SC-041` | Each required transaction member missing in turn fails integrity and cannot become visible | none | `M15-REG-002`, `M15-INTEGRITY-001` |
| `M15-SC-042` | Each gate-order permutation rejects independently | none | `M15-REG-002`, `M15-INTEGRITY-001` |
| `M15-SC-043` | Each retention omission, addition, or alteration rejects independently | none | `M15-REG-002`, `M15-INTEGRITY-001` |
| `M15-SC-044` | Corrupt derived index is reported invalid, bypassed, and deterministically rebuilt | derived only | `M15-INTEGRITY-002` |
| `M15-SC-045` | Missing derived index is reported missing and deterministically rebuilt | derived only | `M15-INTEGRITY-002` |
| `M15-SC-046` | Archived/current marker byte mismatch, missing archive, or duplicate marker ID fails closed; archived candidate alone is invisible | none | `M15-TXN-001`, `M15-TXN-002`, `M15-INTEGRITY-001` |
| `M15-SC-047` | Exact replay retry after later head advancement verifies all five replay IDs and returns the original as not-appended | none | `M15-IDEM-002`, `M15-REPLAY-003` |
| `M15-SC-048` | No-follow leaf and physical directory-identity rechecks detect substitution without physical-path disclosure | none | `M15-FS-002`, `M15-PRIVACY-002` |
| `M15-SC-049` | Future implementation preflight rejects every wrong predecessor, missing/wrong merge authorization, wrong branch/base, dirty tree, and pre-existing runtime-work case | none | `M15-BASELINE-001` |
| `M15-SC-050` | ADR-0019, milestone status, document versions, index inventory, and every relative link lint clean | none | `M15-DOC-001` |
| `M15-SC-051` | Two concurrent replay writers from one observed head produce at most one commit and one stable conflict | at most one replay event | `M15-REPLAY-002`, `M15-FS-003` |
| `M15-SC-052` | Static package graph proves schema/engine ownership and no reverse dependency | none | `M15-PKG-001` |
| `M15-SC-053` | Status/facade validation rejects live-ready aliases and runtime probes reach no execution authority | none | `M15-NOEXEC-001` |
| `M15-SC-054` | Two clean processes independently produce byte-identical canonical genesis history, head, marker, and fingerprints | genesis initialization only | `M15-COMMIT-001`, `M15-GENESIS-001` |
| `M15-SC-055` | First create and interruptions before staging, during staging, after genesis archive creation, and after fixed-marker installation expose either no authority or one complete genesis state | genesis initialization only | `M15-GENESIS-001`, `M15-RECOVERY-001`, `M15-FS-001` |
| `M15-SC-056` | Missing, extra, mismatched, malformed, noncanonical, or fingerprint-invalid genesis material fails closed | none | `M15-GENESIS-001`, `M15-INTEGRITY-001` |
| `M15-SC-057` | First registration binds the verified genesis head and advances exactly to generation/sequence `1` with non-null latest coordinates | one original event | `M15-GENESIS-001`, `M15-HEAD-001`, `M15-AUDIT-001` |
| `M15-SC-058` | Genesis archive and fixed current marker are byte-identical; an archive alone is invisible | genesis initialization only | `M15-GENESIS-001`, `M15-TXN-001`, `M15-TXN-002` |
| `M15-SC-059` | Genesis, first-registration, and replay head fixtures independently recompute every exact field | none | `M15-HEAD-001`, `M15-COMMIT-001` |
| `M15-SC-060` | Missing, extra, aliased, or category-invalid ledger-head keys and wrong genesis nullability reject | none | `M15-HEAD-001`, `M15-SCHEMA-001` |
| `M15-SC-061` | Stale or substituted latest audit-entry, semantic-event, or subject-transaction coordinates fail integrity | none | `M15-HEAD-001`, `M15-INTEGRITY-001` |
| `M15-SC-062` | Marker-embedded head, public `readHead()`, and rebuilt derived `HEAD` are byte-identical | derived only | `M15-HEAD-001`, `M15-INTEGRITY-002` |
| `M15-SC-063` | Ownership ID reuse returns `ownership-id-conflict` across key, request, restart, and derived-index loss | none | `M15-IDEM-001` |
| `M15-SC-064` | Registration semantic-event ID reuse returns `registration-semantic-event-id-conflict` | none | `M15-IDEM-001` |
| `M15-SC-065` | Registration audit-entry ID reuse returns `registration-audit-entry-id-conflict` | none | `M15-IDEM-001` |
| `M15-SC-066` | Registration marker ID reuse returns `registration-marker-id-conflict` | none | `M15-IDEM-001` |
| `M15-SC-067` | Reusing any original-registration ID under a different key or request returns the coordinate-specific stable conflict | none | `M15-IDEM-001` |
| `M15-SC-068` | Reusing a key with any changed caller-requested original-registration ID returns `idempotency-key-conflict` | none | `M15-IDEM-001` |
| `M15-SC-069` | Exact registration retry binds all eight owned coordinates and survives restart and complete derived-index loss | none | `M15-IDEM-001`, `M15-REG-001` |
| `M15-SC-070` | Replay idempotency-key conflict rejects; exact key/five-ID/request retry returns the original without append | none | `M15-IDEM-002`, `M15-REPLAY-003` |
| `M15-SC-071` | Authoritative records, staging-to-install envelopes, derived state, logs, traces, metrics, and observability artifacts contain no application/adapter operation-result envelope, transient status value, or validation report | none | `M15-PRIVACY-001`, `M15-INTEGRITY-001` |
| `M15-SC-072` | Every public application/adapter result envelope and transient status is strict canonical redacted ephemeral output, while validation reports are redacted ephemeral outputs; none has a readiness-ledger fingerprint or durable copy, and a separately specified outside-ledger report is the only explicit exception | none | `M15-PRIVACY-001`, `M15-PRIVACY-002`, `M15-INTEGRITY-001` |

## Normative Source-Section Ownership

A **normative clause** is detected structurally, without natural-language inference: outside fenced code, it is (a) every prose sentence or table row containing the case-insensitive whole-word token `must`, `shall`, `required`, `only`, `never`, or the exact phrase `may not`; and (b) every ordered-list or unordered-list item, including its continuation lines. The deterministic documentation lint parses every Milestone 15 Markdown file, assigns each clause to the nearest preceding Markdown section heading, then uses this table. A section override replaces its document default; every non-overridden section inherits its file default. An unlisted file or a clause with no resulting requirement is a lint failure.

| Source document | Default requirement ownership | Exact section overrides |
| --- | --- | --- |
| `FounderOS_Milestone_15_Durable_Production_Provider_Readiness_Evaluation_Ledger_and_Replay_Verification_Registry_Foundation_Specification_v1.0.md` | `M15-ARCH-001`, `M15-PKG-001`, `M15-NOEXEC-001`, `M15-DOC-001` | `Authoritative Registration Flow` -> `M15-REG-001`, `M15-REG-002`, `M15-IDEM-001`; `Authoritative Replay Flow` -> `M15-REPLAY-001`, `M15-REPLAY-002`; `Authoritative and Derived State` -> `M15-GENESIS-001`, `M15-TXN-001`, `M15-TXN-002`, `M15-INTEGRITY-002`; `Identity and Fingerprinting` -> `M15-COMMIT-001`, `M15-GENESIS-001`, `M15-HEAD-001`, `M15-IDEM-001`, `M15-IDEM-002`; `Local Adapter Boundary` -> `M15-FS-001`, `M15-FS-002`, `M15-FS-003` |
| `FounderOS_Milestone_15_Architecture_Specification_v1.0.md` | `M15-ARCH-001`, `M15-PKG-001`, `M15-NOEXEC-001` | `Evaluator Configuration Projection` -> `M15-COMMIT-001`; `Registration Boundary` -> `M15-REG-001`, `M15-REG-002`, `M15-IDEM-001`; `Replay Boundary` -> `M15-REPLAY-001`, `M15-REPLAY-002`, `M15-REPLAY-003`; `Persistence Boundary` -> `M15-GENESIS-001`, `M15-HEAD-001`, `M15-TXN-001`, `M15-TXN-002`, `M15-INTEGRITY-002`; `Transaction and Audit Ordering` -> `M15-COMMIT-001`, `M15-GENESIS-001`, `M15-HEAD-001`, `M15-AUDIT-001`; `Local Adapter Limitations` -> `M15-FS-001`, `M15-FS-002`, `M15-FS-003` |
| `FounderOS_Durable_Readiness_Evaluation_Transaction_Contract_v1.0.md` | `M15-SCHEMA-001`, `M15-PRIVACY-001`, `M15-NOEXEC-001` | `Registration Request` -> `M15-REG-002`, `M15-IDEM-001`; `Durable Delivery and Invocation Identity Projection`, `Evaluator Configuration Projection`, `Canonical Evaluation Package`, `Committed Transaction` -> `M15-COMMIT-001`; `Normative Commitment Domains`, `Exact ledger-head and category rules`, `Normative computation order` -> `M15-COMMIT-001`, `M15-GENESIS-001`, `M15-HEAD-001`; `Authoritative Visibility` -> `M15-GENESIS-001`, `M15-TXN-001`, `M15-TXN-002`; `Transaction Invariants` -> `M15-IDEM-001`, `M15-AUDIT-001`, `M15-COMMIT-001` |
| `FounderOS_Readiness_Evaluation_Registration_and_Idempotency_Contract_v1.0.md` | `M15-REG-001`, `M15-REG-002`, `M15-IDEM-001` | `Atomic Claim and Commit` -> `M15-TXN-001`, `M15-TXN-002`, `M15-FS-003`; `Required Conflict Detection` -> `M15-IDEM-001`, `M15-INTEGRITY-001`; `Ordering` -> `M15-AUDIT-001` |
| `FounderOS_Durable_Readiness_Evaluation_Ledger_Contract_v1.0.md` | `M15-ARCH-001`, `M15-PKG-001`, `M15-AUDIT-001` | `Authoritative Record Categories` -> `M15-GENESIS-001`, `M15-TXN-001`, `M15-TXN-002`; `Ledger Head` -> `M15-HEAD-001`; `Genesis Authority` -> `M15-GENESIS-001`, `M15-HEAD-001`, `M15-RECOVERY-001`; `Commit Marker`, `Write Semantics` -> `M15-TXN-001`, `M15-TXN-002`; `Integrity Expectations` -> `M15-INTEGRITY-001`, `M15-IDEM-001`, `M15-IDEM-002`; `Derived Index Model` -> `M15-INTEGRITY-002` |
| `FounderOS_Readiness_Replay_Verification_Registry_Contract_v1.0.md` | `M15-REPLAY-001`, `M15-REPLAY-002`, `M15-NOEXEC-001` | `Replay Request`, `Registry Rules` -> `M15-IDEM-002`, `M15-REPLAY-003`; `Replay Append and Operation Results` -> `M15-REPLAY-002`, `M15-REPLAY-003`; `Privacy` -> `M15-PRIVACY-001`, `M15-PRIVACY-002` |
| `FounderOS_Readiness_Ledger_Integrity_and_Recovery_Specification_v1.0.md` | `M15-INTEGRITY-001`, `M15-RECOVERY-001` | `Crash-State Classification` -> `M15-RECOVERY-001`, `M15-TXN-001`, `M15-TXN-002`; `Derived Index Recovery` -> `M15-INTEGRITY-002`; `Recovery Result`, `Integrity Result` -> `M15-PRIVACY-002`, `M15-INTEGRITY-001`; `Empty Ledger` -> `M15-GENESIS-001`, `M15-HEAD-001`, `M15-RECOVERY-001` |
| `FounderOS_Local_File_Readiness_Ledger_Adapter_Specification_v1.0.md` | `M15-FS-001`, `M15-FS-002`, `M15-FS-003` | `Safe Open`, `Runtime Root`, `Resource Limits` -> `M15-FS-002`, `M15-PRIVACY-002`; `Genesis Initialization Protocol` -> `M15-GENESIS-001`, `M15-HEAD-001`, `M15-FS-001`, `M15-RECOVERY-001`; `Cooperative Writer Lock`, `Expected-Head Compare-and-Swap` -> `M15-FS-003`; `Commit Protocol`, `Crash Semantics`, `Normative Fault-Point and Lock Matrix` -> `M15-FS-001`, `M15-TXN-001`, `M15-TXN-002`, `M15-RECOVERY-001`; `Derived Indexes` -> `M15-INTEGRITY-002` |
| `FounderOS_Readiness_Evidence_Privacy_and_No_Execution_Policy_v1.0.md` | `M15-PRIVACY-001`, `M15-NOEXEC-001` | `Evidence Durability Inventory`, `Stored-Data Inspection` -> `M15-PRIVACY-001`, `M15-PRIVACY-002`, `M15-INTEGRITY-001`; `Credential Reference Rule` -> `M15-CRED-001`; `Redaction and Errors` -> `M15-PRIVACY-002`; `Production Import Closure` -> `M15-NET-001`, `M15-CRED-001`, `M15-NOEXEC-001`; `Authorization Expiration` -> `M15-REPLAY-001`, `M15-NOEXEC-001` |
| `FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md` | every requirement listed in the catalog | `Normative Source-Section Ownership`, `Normative Traceability Matrix` -> every cataloged requirement |
| `FounderOS_Milestone_15_Verification_Checklist_v1.0.md` | every requirement listed in the catalog | `Repository Preconditions` -> `M15-BASELINE-001`, `M15-DOC-001`; `Traceability Verification` -> every cataloged requirement |
| `FounderOS_Milestone_15_Package_README_v1.0.md` | `M15-DOC-001`, `M15-ARCH-001`, `M15-NOEXEC-001` | `Architecture` -> `M15-PKG-001`, `M15-GENESIS-001`, `M15-HEAD-001`, `M15-IDEM-001`, `M15-IDEM-002`, `M15-TXN-001`, `M15-TXN-002`; `Document Inventory` -> `M15-DOC-001` |
| `FounderOS_Milestone_15_Codex_Implementation_Prompt_v1.0.md` | every requirement listed in the catalog | `Authorization Precondition` -> `M15-BASELINE-001`; `Required Tests` -> every cataloged requirement; `Documentation Updates`, `Stop Condition` -> `M15-DOC-001`, `M15-NOEXEC-001` |

The filename-to-source names above is exact and one-to-one with the 13 files in the package inventory. The override grammar is deterministic: semicolons separate override entries, `->` separates the comma-delimited exact heading list from the comma-delimited requirement-ID list, and backticks delimit IDs. Heading matching ignores the trailing parenthesized requirement-ID annotation already present on some headings but otherwise requires exact text.

## Normative Traceability Matrix

| Requirement ID | Acceptance criterion ID | Verification scenario ID(s) | Future test class |
| --- | --- | --- | --- |
| `M15-ARCH-001` | `M15-AC-ARCH-001` | `M15-SC-001`, `M15-SC-035` | architecture and regression |
| `M15-SCHEMA-001` | `M15-AC-SCHEMA-001` | `M15-SC-027`–`M15-SC-029` | schema/input-shape |
| `M15-PKG-001` | `M15-AC-PKG-001` | `M15-SC-052` | package dependency graph |
| `M15-REG-001` | `M15-AC-REG-001` | `M15-SC-001`, `M15-SC-002`, `M15-SC-035` | registration integration |
| `M15-REG-002` | `M15-AC-REG-002` | `M15-SC-040`–`M15-SC-043` | candidate-package rejection |
| `M15-IDEM-001` | `M15-AC-IDEM-001` | `M15-SC-001`–`M15-SC-003`, `M15-SC-037`–`M15-SC-039`, `M15-SC-063`–`M15-SC-069` | original idempotency/restart |
| `M15-IDEM-002` | `M15-AC-IDEM-002` | `M15-SC-004`, `M15-SC-047`, `M15-SC-070` | replay identity/restart |
| `M15-COMMIT-001` | `M15-AC-COMMIT-001` | `M15-SC-005`, `M15-SC-040`, `M15-SC-054`, `M15-SC-059` | canonical commitment fixtures |
| `M15-GENESIS-001` | `M15-AC-GENESIS-001` | `M15-SC-054`–`M15-SC-058` | genesis create/restart/corruption |
| `M15-HEAD-001` | `M15-AC-HEAD-001` | `M15-SC-057`, `M15-SC-059`–`M15-SC-062` | exact head schema/equality |
| `M15-TXN-001` | `M15-AC-TXN-001` | `M15-SC-021`, `M15-SC-022`, `M15-SC-025`, `M15-SC-046`, `M15-SC-058` | commit/restart |
| `M15-TXN-002` | `M15-AC-TXN-002` | `M15-SC-046`, `M15-SC-058` | marker archive/current copy |
| `M15-AUDIT-001` | `M15-AC-AUDIT-001` | `M15-SC-005`, `M15-SC-026`, `M15-SC-057` | audit corruption |
| `M15-REPLAY-001` | `M15-AC-REPLAY-001` | `M15-SC-006`–`M15-SC-011`, `M15-SC-036` | replay dual-time |
| `M15-REPLAY-002` | `M15-AC-REPLAY-002` | `M15-SC-006`–`M15-SC-020`, `M15-SC-036`, `M15-SC-051` | replay result union |
| `M15-REPLAY-003` | `M15-AC-REPLAY-003` | `M15-SC-004`, `M15-SC-047`, `M15-SC-070` | replay retry |
| `M15-INTEGRITY-001` | `M15-AC-INTEGRITY-001` | `M15-SC-016`, `M15-SC-026`, `M15-SC-041`–`M15-SC-043`, `M15-SC-046`, `M15-SC-056`, `M15-SC-061`, `M15-SC-071`, `M15-SC-072` | integrity/corruption |
| `M15-INTEGRITY-002` | `M15-AC-INTEGRITY-002` | `M15-SC-024`, `M15-SC-025`, `M15-SC-044`, `M15-SC-045`, `M15-SC-062` | derived-state verification |
| `M15-RECOVERY-001` | `M15-AC-RECOVERY-001` | `M15-SC-021`, `M15-SC-022`, `M15-SC-025`, `M15-SC-055` | restart/fault injection |
| `M15-FS-001` | `M15-AC-FS-001` | `M15-SC-021`–`M15-SC-023`, `M15-SC-055` | fault-matrix injection |
| `M15-FS-002` | `M15-AC-FS-002` | `M15-SC-030`, `M15-SC-048` | path/no-follow safety |
| `M15-FS-003` | `M15-AC-FS-003` | `M15-SC-020`, `M15-SC-023`, `M15-SC-051` | lock/CAS/concurrency |
| `M15-PRIVACY-001` | `M15-AC-PRIVACY-001` | `M15-SC-018`, `M15-SC-027`–`M15-SC-032`, `M15-SC-071` | privacy/input safety |
| `M15-PRIVACY-002` | `M15-AC-PRIVACY-002` | `M15-SC-031`, `M15-SC-048`, `M15-SC-072` | path-redaction sweep |
| `M15-NET-001` | `M15-AC-NET-001` | `M15-SC-033` | static import/runtime probe |
| `M15-CRED-001` | `M15-AC-CRED-001` | `M15-SC-032`, `M15-SC-034` | static import/runtime probe |
| `M15-NOEXEC-001` | `M15-AC-NOEXEC-001` | `M15-SC-033`, `M15-SC-053` | facade/status/runtime probe |
| `M15-BASELINE-001` | `M15-AC-BASELINE-001` | `M15-SC-049` | implementation preflight |
| `M15-DOC-001` | `M15-AC-DOC-001` | `M15-SC-050` | documentation integration lint |

The future implementation must include deterministic traceability validation that fails on an unmapped normative clause or source file, a missing requirement/acceptance/scenario target, a scenario referencing a missing requirement, a requirement without at least one scenario, a duplicate requirement/acceptance/scenario ID, or a non-contiguous scenario catalog.

## Definition of Done for Future Implementation

FounderOS can atomically register, restart-recover, independently verify, and dual-time fresh-evaluator replay one exact non-executing readiness evaluation while all cataloged scenarios pass. This definition is not satisfied by the current documentation-only phase.
