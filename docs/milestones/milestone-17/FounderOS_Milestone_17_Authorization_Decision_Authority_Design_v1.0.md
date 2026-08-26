# FounderOS Milestone 17 Authorization Decision Authority Design v1.0

## Status

**Approved design — implementation and publication remain separately gated**

## Purpose

Implement the first post-Milestone-16 production-execution foundation: a provider-neutral,
non-production Authorization Decision authority and service-identity boundary. The milestone
must prove exact authorization issuance, permanent exact-attempt claim ownership, expiry,
revocation, and independent verification without resolving credentials or enabling provider
transport.

## Architectural Position

Milestone 17 extends the accepted Milestone 16 architecture while preserving the existing
dependency direction:

```text
externally verified service identity evidence
  + explicit human approval evidence
  + verified Delivery, Context, and Invocation authority
  + approved Adapter, model, instruction, credential-reference, environment,
    classification, and limit bindings
  -> provider-neutral authorization evaluation
  -> allowed-unclaimed Authorization Decision
  -> atomic exact-attempt claim
  -> claimed-by-exact-attempt evidence
```

The implementation remains inside the existing shared-contract and domain-service boundaries:

- `@founderos/knowledge-schema` owns strict storage-independent contracts and validation.
- `@founderos/knowledge-engine` owns deterministic evaluation, in-memory authority state,
  atomic claim orchestration, verification, and the disabled evaluation harness.
- No application, Agent, Hermes, MCP component, provider adapter, or infrastructure secret
  resolver participates in Milestone 17.

## Selected Approach

Milestone 17 uses a local in-memory authority that consumes externally verified service-identity
and human-approval evidence. It does not authenticate a workload itself and does not integrate an
identity provider. The boundary treats identity and approval evidence as independently verifiable
authoritative inputs rather than accepting caller-provided subject strings or boolean approval
flags.

The authority is non-production and process-local. Restart loses its issuance and claim registry.
This is intentional: durable authorization persistence and a production identity provider require
later architecture and threat review.

## Shared Contract Ownership

`@founderos/knowledge-schema` will define strict versioned contracts for:

1. Service identity evidence
   - evidence ID and version;
   - authenticated subject and service/workload identity;
   - issuer and assurance profile;
   - environment and audience binding;
   - issue, not-before, expiry, and revocation evidence;
   - evidence fingerprint and issuer-proof reference without secret material.
2. Human approval evidence
   - approval ID and version;
   - human approver reference and approval-authority reference;
   - exact authorization-request identity/fingerprint;
   - purpose, operation, environment, data classification, and ceilings;
   - issue and expiry times;
   - approved, denied, or review-required outcome;
   - evidence fingerprint and proof reference without credentials or personal contact data.
3. Authorization request
   - exact execution-attempt identity;
   - subject, Consumer, Delivery, Context, Invocation, Adapter, provider family, operation, and
     fixed processing tier `default`;
   - immutable model-policy and execution-instruction-profile bindings;
   - logical Credential Reference identity, fingerprint, and rotation version only;
   - environment and data-classification policy;
   - exact input/output byte, token, timeout, attempt, rate, concurrency, and cost ceilings;
   - request identity and fingerprint.
4. Authorization Decision
   - decision ID, version, issuer, issue time, expiry, and revocation version;
   - exact authorization request and all transitive bindings;
   - outcome and closed reason-code inventory;
   - initial state `allowed-unclaimed` only for an allowed decision;
   - decision fingerprint and issuer-proof reference.
5. Authorization claim
   - exact decision and execution-attempt identity;
   - permanent state `claimed-by-exact-attempt`;
   - claim time, claim sequence, authority identity, and claim fingerprint.
6. Issuance, claim, inspection, revocation, and verification results
   - discriminated strict unions;
   - closed sanitized reason taxonomies;
   - no arbitrary exception, path, URI, provider body, or secret field.

Every public contract rejects unknown, hidden, accessor-backed, inherited, symbolic, non-finite,
non-canonical, or unsupported members before protected-value access.

## Knowledge Engine Ownership

`@founderos/knowledge-engine` will provide a factory-created in-memory Authorization authority.
The factory captures one immutable authority configuration, including exact Service Identity
evidence ID, workload and issuer-proof references and fixed processing tier `default`, and returns
a frozen narrow facade.
Callers cannot replace the identity verifier, approval verifier, policy binding, clock, registry,
or claim primitive per operation.

The authority will support only these governed operations:

1. `issueDecision`
   - capture and strictly validate the complete input before authority access;
   - verify service identity and human approval independently;
   - verify Delivery, Context, Invocation, Adapter, model, instruction-profile,
     Credential Reference, environment, classification, and limit equality;
   - enforce chronology, freshness, and revocation state;
   - issue one deterministic allowed, denied, or review-required decision;
   - register decision identity permanently for the authority instance.
2. `claimDecision`
   - require one unexpired, unrevoked allowed decision in `allowed-unclaimed` state;
   - require the exact attempt already bound by the request and decision;
   - atomically transition the registry entry to `claimed-by-exact-attempt`;
   - allow exactly one successful claimant;
   - never release or reuse the claim after cancellation or downstream failure.
3. `inspectDecision`
   - return only immutable sanitized decision and claim state;
   - expose no mutable registry handle or implementation state.
4. `revokeDecision`
   - apply a monotonic authority-owned revocation version;
   - reject stale, conflicting, or unauthorized revocation evidence;
   - never convert a claimed decision back to unclaimed.
5. `verifyDecision` and `verifyClaim`
   - independently reproduce fingerprints and exact bindings;
   - verify current expiry and revocation state;
   - distinguish an allowed-unclaimed decision from the exact permanent claim;
   - reject another attempt's claim or a non-authoritative claim representation.

## Determinism and Identity Rules

- Canonical JSON and existing SHA-256 domain separation remain the fingerprint foundation.
- All outputs are deterministic for identical captured input, explicit time, and authority state.
- Time is supplied through the captured authority configuration or explicit operation input; no
  ambient time read may silently change a fingerprinted artifact.
- Decision IDs, request IDs, attempt IDs, and claim identities are permanently reserved inside the
  authority instance.
- Duplicate IDs with byte-identical authoritative input return the original immutable result only
  when the specification explicitly defines an idempotent operation.
- Any coordinate reuse with different input fails closed before downstream authority access.
- Returned objects and nested arrays are deeply immutable defensive copies.

## Atomic Claim Semantics

The sole valid successful transition is:

```text
allowed-unclaimed -> claimed-by-exact-attempt
```

The transition is linearized inside the authority's private registry. JavaScript execution is
single-threaded per process, but the API will still define and test simultaneous asynchronous claim
requests so only one operation observes and changes the unclaimed entry.

After a successful claim:

- duplicate claim by the same attempt returns the original claim only if exact idempotent retry is
  explicitly requested and all inputs match;
- a different attempt always fails;
- cancellation, timeout, credential failure, final-gate failure, transport failure, or ambiguous
  execution cannot release the claim;
- creating a new governed attempt requires a new Authorization request and Decision.

## Failure Model

The public result taxonomy will distinguish at minimum:

- invalid input or non-canonical evidence;
- invalid or stale service identity;
- missing, denied, review-required, stale, or mismatched human approval;
- Delivery, Context, Invocation, Adapter, model, instruction-profile, Credential Reference,
  environment, classification, or limit mismatch;
- duplicate or conflicting request/decision identity;
- denied, expired, or revoked decision;
- attempt mismatch;
- already claimed or concurrent claim conflict;
- non-authoritative decision or claim representation;
- internal authority integrity failure normalized to one sanitized category.

Every public operation, including inspection and verification, normalizes unexpected exceptions to
its schema-valid internal-integrity result. Unknown internal errors never cross the public boundary. No public result includes raw exception
text, physical paths, URIs, provider envelopes, headers, environment data, secret-store locations,
or credential material.

## Disabled Evaluation Harness

Milestone 17 will include a disabled, deterministic harness that exercises contract validation,
identity verification, approval verification, decision issuance, atomic claim, revocation,
inspection, and independent verification. It accepts only exact plain data and deterministic
fixtures. It exposes no callback, filesystem, database, credential, provider client, endpoint, or
network capability.

The harness cannot report live readiness. Its highest successful state is authorization-foundation
verified for non-production evaluation.

## Testing Strategy

Implementation follows red-green-refactor cycles. Tests will cover:

- valid exact-bound issuance;
- denied and review-required decisions;
- service-identity and approval expiry, revocation, audience, assurance, and binding failures;
- all direct and transitive authority substitutions;
- Service Identity evidence-ID, workload-reference, issuer-proof-reference, and fixed processing-tier substitutions;
- strict own-key, data-property, symbol, accessor, prototype, and unknown-member rejection;
- deterministic fingerprints and defensive immutability;
- duplicate decision and request identity behavior;
- one successful exact-attempt claim under concurrent requests;
- same-attempt exact retry and conflicting retry behavior;
- different-attempt, stale, expired, revoked, and already-claimed failures;
- permanent claim ownership after every modeled downstream failure;
- monotonic revocation and inability to reopen a claimed decision;
- independent decision and claim reproduction;
- path, URI, secret-like, header, environment, and unrestricted-error leakage rejection;
- compatibility with the existing Delivery, Invocation, Adapter, readiness, and durable-readiness
  contracts;
- deny-by-default import-closure proof with explicit safe-import and path/member reflection
  allowlists plus full-source SHA-256 binding for every approved non-static computed access or
  property name, including static bracketed and destructured loader members and direct or reflectively recovered dynamic-code constructors regardless of computed-key
  spelling, callable declaration, assignment, factory return, object membership, array
  destructuring or indexing, inline or named parameter carriage, inline or named identity-call
  propagation, conditional selection, class or built-in callable use, or binding, reflection-root
  aliasing through direct, array, or parameter coordinates, or reflection-member destructuring,
  aliased or indirect loaders, and filesystem- or network-capable Node built-ins; plus a separate
  runtime witness that
  the disabled harness does not invoke `fetch`.

The existing full repository gates and predecessor-bound verification remain mandatory.

## Documentation Deliverables

The implemented milestone will include:

- Milestone 17 core specification;
- service-identity evidence contract;
- human-approval and authorization-request contract;
- Authorization Decision issuance, claim, revocation, and verification contract;
- acceptance criteria;
- verification checklist;
- package README;
- required README, documentation-index, changelog, and ADR updates reflecting actual behavior.

## Explicit Non-Goals

- A real identity provider, login, session, token, certificate, workload-identity integration, or
  authentication middleware
- Durable authorization storage, database, distributed coordination, or cross-process claims
- Credential values, environment-secret reads, secret stores, credential resolution, or rotation
  implementation
- OpenAI request mapping, authentication headers, provider SDKs, provider configuration, or
  transport
- DNS, TLS, HTTP, sockets, proxies, blocked or live network probes
- Streaming, background execution, state, tools, functions, files, images, or provider requests
- Agents, Hermes, MCP, routing, failover, autonomous planning, or UI
- Deployment, release, production enablement, or live traffic
- Milestone 18 implementation

## Acceptance Boundary

Milestone 17 is implementation-ready only after this design is reviewed and the detailed
specification and TDD plan are approved. Implementation completion requires strict requirement
traceability, fresh repository gates, whole-branch review, a sanitized exact candidate bundle, and
an independent decision with no Critical, Important, or Minor findings.

No review result by itself authorizes commit, push, pull request, merge, deployment, release,
credential action, live provider execution, or Milestone 18 work.
