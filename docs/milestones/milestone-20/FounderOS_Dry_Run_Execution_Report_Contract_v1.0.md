# FounderOS Dry-Run Execution Report Contract v1.0

## Purpose

Define the sole M20 terminal report so dry-run claims are deterministic, independently verifiable,
secret-free, and incapable of representing provider execution.

## Report Shape

`M20DryRunReportV1` contains exactly:

- contract version and taxonomy ID;
- run, scenario, and explicit evaluation-time identity;
- canonical request fingerprint;
- terminal status `dry-run-verified` or `dry-run-rejected`;
- exactly one reason code for rejection and no reason for success;
- exact ordered stage observations;
- M17 Authorization/claim identity and fingerprints plus exactly the public M19 terminal fields
  enumerated in the M20 contract catalog when their stages complete; Credential Resolution remains
  fingerprint-only and has no M20-visible evidence ID;
- final-control rehearsal evidence identity, outcome, and fingerprint when evaluated;
- closed protected-boundary call counts;
- zero-network witness count;
- closed security assertions;
- report fingerprint.

The report has no optional catch-all metadata object. Stage-dependent fields use a strict
discriminated union so absent work cannot be represented as completed evidence.

## Stage Observation

Each `M20StageObservationV1` binds:

- one closed stage name;
- contiguous one-based position;
- outcome `completed` or `rejected`;
- explicit `observedAt` equal to the run's deterministic evaluation time, except the
  `final-control-rehearsal-complete` observation uses `rehearsalEvaluatedAt`;
- logical artifact IDs and fingerprints permitted for that stage only;
- one observation fingerprint.

No stage observation contains duration, raw input, error detail, credential state, provider body,
path, host, process, or arbitrary attributes.

## Call Counts

The report records the exact six-family protected call-count object from the contract catalog. The
terminal grammar contains distinct count rows when an M17 port rejects and when its returned
artifact fails a verification call; the captured scenario's `expectedOwnerCallCounts` selects the
authoritative row:

1. M17 issuance
2. M17 claim
3. M17 verification
4. M19 preparation
5. M20 final-control snapshot issuance
6. M20 final-control snapshot verification

`networkAttemptCount` is a separate literal-zero field derived from the difference between two
reads of the factory-captured monotonic network-attempt witness on every owner, follower, and replay
invocation. A positive observed delta forbids report construction and returns report-free
integrity rejection without mutating an existing owner. Report verification is a pure
operation performed before return and is not a protected-port call or a stage inside its own
report.

M14/M15 readiness plus M18 and M19 internal boundary counts remain proven by their existing
evidence and focused tests. M20 may add test-only witness counts but cannot relabel them as new
durable authority or M20-owned stage observation.

## Security Assertions

The closed assertion set is:

- `request-canonical`
- `scenario-authoritative`
- `authorization-authoritative`
- `preparation-terminal-bound`
- `rehearsal-artifact-authoritative`
- `rehearsal-control-allowed`
- `rehearsal-non-executing`
- `public-output-secret-free`
- `network-attempts-zero`
- `stage-sequence-exact`

Each assertion is present exactly once with `passed`, `failed`, or `not-reached`. The exact ordered
ten-item list and per-terminal status tuples are defined in the M20 contract catalog. A successful
report requires all assertions `passed`.

## Canonicalization and Fingerprint

The report is canonical JSON serialized with repository rules. Its domain-separated SHA-256
fingerprint excludes only the `reportFingerprint` field and binds every other byte. Independent
verification reconstructs every observation fingerprint, checks stage grammar and counts, checks
the terminal/reason discriminant, and recomputes the report fingerprint.

## Determinism

Two fresh conductors configured with identical immutable authorities, the same catalog version,
the same canonical request, and the same explicit time must return byte-identical reports.
Concurrency observations are ephemeral and never enter terminal report bytes. Report array order
is normative and never depends on object enumeration, completion timing, or filesystem order.

## Public and Durable Exclusions

The report cannot represent:

- credential material, a material-derived value, authorization header, or secret-store coordinate;
- raw request, response, Context, Knowledge, provider error, or unrestricted advisory memo;
- endpoint, URL, path, environment value, host, process, stack, callback, function, or client;
- a send, provider acceptance, response receipt, model truth, retention, deletion, cost charge, or
  production-readiness claim;
- `ready`, `enabled`, `sent`, `executed`, `completed-by-provider`, or equivalent status.

Persisting reports is outside M20. Source-immutability evidence and the M19 fixture-regression matrix
also remain independent test evidence outside this report. The contract remains storage-independent.
