# FounderOS Milestone 17 Authorization Decision Authority Specification v1.0

## Status

Implemented candidate — non-production, process-local, and not publication-authorized.

## Objective

Milestone 17 implements the first bounded component in the Milestone 16 execution sequence: a
provider-neutral authority that can issue, claim, inspect, revoke, and verify an exact execution
Authorization Decision. It proves authority semantics without resolving credentials or creating a
provider execution path.

## Package ownership

- `@founderos/knowledge-schema` owns strict data contracts in `src/authorization.ts`.
- `@founderos/knowledge-engine` owns canonical artifact construction and verification in
  `src/domain/execution-authorization.ts`.
- `@founderos/knowledge-engine` owns process-local authority state in
  `src/application/in-memory-execution-authorization-authority.ts`.
- `@founderos/knowledge-engine` owns the disabled evaluation wrapper in
  `src/application/disabled-execution-authorization-harness.ts`.

The schema package has no dependency on the engine. The engine consumes shared contracts. No app,
integration, infrastructure adapter, Agent, Hermes, or MCP component participates.

## Public implementation

The domain facade exports canonical constructors and verifiers, including
`createExecutionAuthorizationDecision` and `verifyExecutionAuthorizationClaim`. The application
facade exports `createInMemoryExecutionAuthorizationAuthority` and
`runDisabledExecutionAuthorizationHarness`.

The authority exposes exactly six methods:

1. `issueDecision`
2. `claimDecision`
3. `inspectDecision`
4. `revokeDecision`
5. `verifyDecision`
6. `verifyClaim`

Its factory captures immutable Service Identity evidence ID, workload and issuer-proof references,
subject, Consumer, Delivery, Context, Invocation, Execution Attempt, identity issuer, assurance,
audience, human approval authority, revocation authority, environment, operation, fixed processing
tier `default`, provider family, Adapter, model policy, instruction profile, Credential Reference,
classification, limit, lifetime, and Decision issuer-proof bindings. Individual operations cannot
replace those bindings.

## Evaluation and issuance

Issuance accepts one exact plain-data wrapper containing an Authorization Request, verified Service
Identity evidence, human approval evidence, an explicit evaluation time, an expiry, and a Decision
ID. Before registry access it validates canonical data, exact own enumerable data properties, and
all three artifact fingerprints.

The evaluator compares Service Identity evidence, workload and proof coordinates; subject,
Consumer, Delivery, Context, Invocation, Execution Attempt, issuer, assurance, audience, approval
authority, request identity, purpose, operation, environment, fixed processing tier,
classification, limits, provider family, Adapter, model policy, instruction profile, Credential
Reference, and rotation version. It also enforces identity, request, approval, Decision, claim, and
revocation chronology plus the configured Decision lifetime ceiling.

An allowed result has state `allowed-unclaimed`. Denied and review-required results have state
`not-claimable`. Request and Decision IDs are permanently reserved within the authority instance.
An exact duplicate issuance returns the original immutable Decision; conflicting coordinate reuse
fails closed.

## Claim, revocation, and verification

The only successful claim transition is:

```text
allowed-unclaimed -> claimed-by-exact-attempt
```

The private registry performs the transition synchronously, so simultaneous asynchronous callers
cannot both observe an unclaimed entry. An exact same-attempt retry returns the original claim only
when explicitly marked idempotent and every claim coordinate matches. Claims are permanent; the
API has no release, reset, delete, or reopen method. Reuse of a permanently reserved claim ID with
altered coordinates fails as `conflicting_identity` before mutable claimability, revocation, or
expiry state—or a foreign target Decision—is consulted.

Revocation requires the factory-captured revocation authority and a strictly increasing positive
version. A revocation timestamp cannot precede an existing permanent claim or regress from the
previous revocation timestamp. Revocation blocks current authorization but never removes an
existing claim. Inspection returns immutable projections, not registry handles. Verification
reproduces fingerprints, checks factory registration, compares exact artifacts, and evaluates
Decision issuance, claim creation, expiry, and current revocation at an explicit supplied time; a
claim is never valid before its own `claimedAt`.

## Safety and determinism

- Canonical JSON plus domain-separated SHA-256 constructs every artifact fingerprint.
- No ambient clock, random source, filesystem, environment, database, or network input affects an
  artifact.
- Unknown, hidden, symbolic, inherited, accessor-backed, non-plain, non-finite, and unsupported
  inputs fail before protected-value access.
- Every public operation normalizes unexpected internal faults to its schema-valid closed
  `internal_authority_integrity_failure` result and does not expose raw exceptions or rejected
  payloads; inspection has an explicit rejected integrity variant.
- Outputs are deeply frozen structured defensive copies.

## Disabled harness

The disabled harness creates a fresh process-local authority and deterministically exercises
issuance, permanent claim, pre-revocation inspection and verification, successful revocation
version N, stale/equal-version rejection, successful later version N+1, post-revocation
inspection, and rejection of the now-revoked Decision and claim. It confirms that both monotonic
revocation transitions preserve the permanent claim and returns only a sanitized non-production
evaluation summary. Its maximum success status is `authorization-foundation-verified`, and
`liveExecutionReady` is always `false`. The harness accepts no callback, client, endpoint, header,
secret, environment object, filesystem capability, or provider body.

## Non-goals

No credential value, credential resolver, secret store, identity provider, authentication token,
database, distributed claim, provider SDK, OpenAI mapping, endpoint, DNS, TLS, socket, HTTP request,
streaming, tool, Agent, Hermes, MCP, UI, deployment, release, or live execution is implemented or
authorized by Milestone 17.

Milestone 18 remains separately gated.
