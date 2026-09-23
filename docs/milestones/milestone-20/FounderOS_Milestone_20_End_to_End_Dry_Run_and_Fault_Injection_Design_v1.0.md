# FounderOS Milestone 20 End-to-End Dry-Run and Fault-Injection Design v1.0

## Status

**Documentation candidate only. No implementation, publication, credential operation, provider
configuration, transport, deployment, release, or live execution is authorized.**

## Objective

Milestone 20 specifies the fourth separately gated component in the accepted Milestone 16
sequence: an independent, deterministic, no-network dry run of the implemented M17 authorization,
M18 synthetic credential-resolution, and M19 disabled OpenAI Responses preparation boundaries,
plus controlled fault injection at every protected transition.

The successful terminal result is `dry-run-verified`. It proves that one exact synthetic scenario
reached a strictly parsed, M20-known-coordinate-bound, inherited-trust M19 `disabled-by-policy`
result; it never means
`ready`, `enabled`, `sendable`, `production-ready`, or authorized for live traffic.

## Verified Current State

As verified against repository `main` at
`db6293cf4bc8818367a306e0243f475eb6d10091` on 2026-09-11:

1. M14–M15 provide deterministic non-executing provider-readiness authority and durable replay.
2. M17 provides process-local Authorization Decision issuance, permanent exact-attempt claim,
   revocation, inspection, and verification.
3. M18 provides authorization-first orchestration and an infrastructure-owned process-local
   synthetic resolver that returns only released, secret-free evidence.
4. M19 provides deterministic request-plan mapping, isolated fixture-response mapping, and a
   three-method OpenAI Responses adapter facade whose only valid preparation terminal is
   `disabled-by-policy`.
5. No existing component composes those boundaries into one independently reported dry run or
   proves ordered behavior under injected faults across the complete chain.

## Selected Architecture

M20 adds strict shared dry-run contracts, one Knowledge Engine dry-run conductor expressed only in
terms of structural ports, and a test-only repository composition root. The composition root may
instantiate existing M17, M18, and M19 deterministic implementations. Production packages remain
unaware of concrete downstream packages.

```text
test-only composition root
  -> M20 dry-run conductor (knowledge-engine)
       -> M17 authority port
       -> M19 preparation port
            -> existing M18 orchestrator port
            -> existing M19 mapper/disabled-adapter ports
       -> M20 final-control snapshot authority (test-only, non-authoritative for execution)
       -> captured monotonic network-attempt witness
  -> canonical M20 dry-run report

No branch reaches a credential value, authentication header, endpoint client, or network send.
```

## Package Ownership

### `@founderos/knowledge-schema`

Owns strict versioned plain-data contracts for dry-run requests, scenario descriptors, ordered
stage observations, fault declarations, final-control rehearsal evidence, terminal results,
canonical reports, fingerprints, and closed reason taxonomies. It owns no runner, clock, random
source, credential, callback, client, filesystem, or network capability.

### `@founderos/knowledge-engine`

Owns the authority-first dry-run conductor, ordered stage state machine, exact identity
reservation, deterministic report construction, independent report verification, and structural
ports. It imports neither `@founderos/credential-resolver` nor
`@founderos/openai-responses-adapter`.

### Existing infrastructure and integration packages

`@founderos/credential-resolver` and `@founderos/openai-responses-adapter` remain unchanged in
responsibility. M20 must not add a material-bearing resolver API, authentication-header API,
send-like adapter method, or transport dependency.

### Repository test composition

`tests/` owns the only concrete M20 composition. It may wire the existing deterministic M17
authority, M18 synthetic resolver, M19 authorities, mapper, and disabled adapter to structural
ports. It may not be exported as an application or production runtime.

## Dry-Run Sequence

The conductor performs these stages in fixed order:

1. Read the factory-captured monotonic network-attempt witness, then capture and validate one exact
   plain own-key M20 request.
2. Apply permanent run-identity conflict precedence and install an `in-flight` owner before the
   first asynchronous boundary.
3. Execute M17 in the exact order: issue the Decision, verify that returned registered Decision,
   claim it for the exact attempt, then verify the returned registered claim. Stop before the next
   call whenever a step rejects.
4. Invoke the configured M19 preparation path, which itself verifies M14–M17 authority, constructs
   and verifies the request plan, invokes M18, verifies released evidence, and reaches the M19
   disabled adapter.
5. Strictly validate the returned M19 `disabled-by-policy` result; bind only M20-known preparation,
   request-plan ID, Adapter, operation, and evaluation-time coordinates; and carry schema-valid
   opaque fingerprints/version as inherited-trust output. M19 remains the owner of its internal
   request-plan, M18 release, and terminal reproduction checks; M20 does not claim to observe or
   reproduce private M19 internals or detect a malicious captured port.
6. Evaluate a secret-free M20 final-control rehearsal from immutable authority projections. The
   rehearsal result is only `would-allow` or `would-deny`; it is not the M16 live final pre-send
   gate and cannot authorize a send.
7. Read the same network-attempt witness before return; require an observed zero delta, prove no
   secret-shaped value crossed a public boundary, and require every expected stage observation
   exactly once. A positive delta returns report-free integrity rejection.
8. Construct and independently verify one canonical immutable report.

The exact successful sequence is:

```text
request-accepted
scenario-authority-verified
authorization-issued
authorization-claimed
preparation-started
preparation-disabled-bound
final-control-rehearsal-complete
no-network-verified
```

No M20-owned stage may be skipped, repeated, reordered, inferred, or fabricated by a fixture. M18
and M19 internal gate order remains proven by their accepted focused evidence, not relabeled as M20
stage observation.

## Final-Control Rehearsal Boundary

The rehearsal checks the M16 final-gate inputs using only secret-free, immutable projections:
existing exact-attempt claim; current Authorization expiry and revocation; Credential Reference
identity, rotation, and revocation; global, provider, Adapter, model, environment, and operation
kill switches; Circuit; Health; and incident state.

`would-allow` means only that the final-control authority's issued and verified immutable snapshot
satisfies the specified predicate. The conductor then terminates without authentication-header
construction or transport.
The live M16 gate must later re-read real current authorities after real credential resolution and
transition immediately to one separately authorized bounded send. M20 evidence is never accepted
by that future live gate.

## Fault-Injection Model

Faults are selected only by a closed repository-owned scenario catalog. Public callers cannot
provide callbacks, throwables, mutable ports, arbitrary stage names, or executable fault payloads.
Each scenario injects at most one primary fault at one named boundary, with optional secondary
conditions used only to prove fixed precedence.

Every injected fault must prove:

- the exact first-applicable reason code;
- the last completed stage and zero calls to later protected boundaries;
- permanent claim and identity semantics where already crossed;
- secret-free, bounded, deterministic output;
- no network attempt; and
- exact replay or conflict behavior.

## Determinism and Replay

All time, IDs, authorities, scenario inputs, and fault choices are explicit. Canonical JSON and
domain-separated SHA-256 bind requests, observations, rehearsal evidence, results, and reports.
Every invocation performs the two read-only network-witness reads. With a zero delta, exact
terminal replay returns the original frozen result without invoking M17, M18, M19, or rehearsal,
and concurrent exact input yields non-mutating `dry_run_in_progress`. A positive-delta replay or
follower returns report-free integrity rejection without mutating the permanent owner. Conflicting
run-ID reuse never mutates the owner.

## Security Closure

M20 production modules and runtime dependencies must not acquire filesystem, environment, process,
module-loader, dynamic-code, worker, DNS, TLS, HTTP, HTTPS, socket, proxy, provider-SDK, credential,
Agent, Hermes, MCP, or external observability capabilities. Runtime witnesses replace every
available ambient network global with throwing counters and require exactly zero attempted calls
across success, rejection, fault, replay, and concurrency paths.

## Rejected Alternatives

1. **A dormant HTTP client behind a dry-run flag.** This creates an executable egress path before
   live authorization.
2. **A fake successful provider send.** This confuses fixture mapping with provider execution and
   weakens M19's structural stop.
3. **Credential bytes passed through the conductor.** M18 deliberately releases its owned bytes
   before returning; reintroducing material invalidates that boundary.
4. **A caller-programmable fault callback.** Executable injection would create a new capability and
   make deterministic closure unverifiable.
5. **Treating `would-allow` as final-gate success.** A rehearsal cannot prove the real current
   authority state immediately before a future send.

## Explicit Non-Goals

- Real credentials, secret stores, provider-valid fixtures, material leases, or headers
- Successful live final pre-send revalidation or reusable final-gate authority
- DNS, TLS, sockets, HTTP, `fetch`, provider SDKs, retries, or provider requests
- Live or simulated-live provider execution, deployment, release, or production configuration
- Provider conformance, model quality, retention, deletion, availability, or billing claims
- Durable or distributed M17/M18/M19 state, background execution, or external observability
- Streaming, tools, functions, files, images, audio, state, Agents, Hermes, MCP, UI, or side effects
- Authorization of a later live-execution milestone

## Completion Boundary

The documentation package must be independently reviewed and separately accepted before any M20
implementation begins. A future implementation must then pass focused tests, all repository gates,
security closure, deterministic scenario verification, and an independent exact-candidate review.
None of those results authorizes live execution.
