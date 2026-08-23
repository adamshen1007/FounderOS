# FounderOS Authentication, Authorization, and Credential Ownership Specification v1.0

## Status

**Architecture ownership specification — no authority or resolver implemented**

## Purpose

Separate identity proof, execution authorization, credential-reference governance, secret resolution, and provider authentication so no component can silently combine them into an execution bypass.

## Ownership Model

| Concern | Required owner | Explicit non-owner |
| --- | --- | --- |
| Human and service authentication | Future identity/infrastructure boundary | Knowledge schema, Knowledge Engine, provider adapter |
| Authorization decision | Future human-governed policy authority | Provider adapter, credential resolver, model output |
| Authorization enforcement | Existing governed Invocation boundary extended by a future milestone | Caller, application, Agent, provider |
| Credential Reference contract | Shared schema boundary | Application and provider SDK |
| Credential lifecycle policy | Human-approved security/operations authority | Knowledge Engine and model |
| Secret storage and resolution | Future infrastructure credential resolver | Shared packages and domain services |
| Provider authentication header | Future OpenAI adapter for one attempt | Caller, durable evidence, logs |
| Revocation and kill switch | Human security/incident authority with fail-closed enforcement | Prior readiness or Authorization evidence |

## Authentication Boundary

Authentication proves the identity of a human, service, workload, or operator. It does not authorize provider execution.

A future service identity must be workload-bound, environment-bound, auditable, and independently verifiable. Caller-provided subject strings, local process identity, possession of a Context Package, or possession of a Credential Reference are not authentication.

Milestone 16 implements no login, session, token, identity provider, workload identity, or authentication middleware.

## Authorization Decision Boundary

Only a future approved Authorization authority may issue an execution decision. An allowed decision must bind:

- decision version, ID, issuer, issue time, expiry, and single-use identity;
- exact execution attempt identity;
- authenticated subject and requesting Consumer;
- Delivery transaction and Context Package identity/fingerprint;
- Invocation Request identity/fingerprint;
- Adapter identity/fingerprint and provider family;
- operation `founder-decision-memo`;
- immutable model-policy binding;
- immutable execution-instruction profile version and cryptographic fingerprint;
- exact processing-tier policy, initially explicit `service_tier = default`;
- Credential Reference identity/fingerprint without secret material;
- input/output bytes, tokens, timeouts, attempts, rate, concurrency, and cost ceilings;
- environment and data-classification policy;
- decision fingerprint and issuer proof.

An issued allowed decision begins in exactly `allowed-unclaimed`. Before credential resolution, the future Authorization authority must perform one atomic ownership transition to `claimed-by-exact-attempt`. The decision is already bound to that exact attempt identity, only one claimant can succeed, and the successful claim is permanent: credential-resolution failure, final-gate failure, cancellation, transport failure, or ambiguous send never returns it to `allowed-unclaimed`. A concurrent duplicate claim, stale claim, attempt mismatch, or already-claimed decision fails as `authorization-rejected`. A new governed attempt requires a new Authorization Decision and claim.

The claimed decision must remain valid at a distinct final gate after credential resolution and immediately before send. Missing, expired, denied, review-required, not-evaluated, mismatched, unverified, or revoked evidence before the atomic claim fails before secret resolution.

The final pre-send gate must verify the existing `claimed-by-exact-attempt` ownership and revalidate current Authorization expiry and revocation; Credential Reference revocation and rotation version; every global, provider, Adapter, model, environment, and operation kill switch; Circuit; Health; and incident state. It must not perform a non-atomic unused-state check or create a new claim. A final-gate failure releases the ephemeral credential through the adapter-private channel, emits only sanitized evidence, and performs no send. After final-gate success, no non-transport work may occur before authentication-header construction and the one bounded send.

An Authorization Decision does not override kill switches, incident state, credential revocation, Circuit, Health, Transport Policy, privacy, or admission failures.

## Credential Reference

A Credential Reference may identify:

- contract version and reference ID;
- provider family and OpenAI project reference;
- secret-store class and environment class;
- purpose/scope reference;
- rotation version and availability state;
- created, rotated, expires, and revoked metadata without secret values;
- reference fingerprint.

It must not include the API key, bearer token, authorization header, secret-store physical path, environment-variable dump, recovery material, or a value derived from secret bytes.

## Credential Lifecycle

A future credential system must support:

1. Human-approved provisioning outside the repository.
2. Project and environment scoping.
3. Least privilege and purpose binding to the OpenAI adapter.
4. Rotation with an explicit version transition.
5. Expiration and immediate revocation.
6. Availability checks that disclose no value.
7. Access audit using logical references only.
8. Incident disablement and replacement.
9. Destruction or deactivation evidence.

No credential value may be committed to Git, placed in Markdown, passed through a public FounderOS contract, stored in a ledger, printed in a test, or returned in an error.

## Resolution Contract

In a future milestone, the resolver may be invoked only after every non-secret gate passes. It receives the exact Credential Reference, Adapter binding, attempt identity, purpose, and deadline. It returns secret material through an adapter-private ephemeral channel, not a serializable application value.

The adapter must zero or release its reference as soon as the bounded request attempt no longer needs it. No cache, retry queue, callback, event, trace, or closure may retain it beyond the attempt.

## Provider Authentication

Only the OpenAI adapter may construct the provider authentication header. The header is attached after final request-plan verification and removed before any request or response structure crosses back into application code.

Provider authentication success proves only that OpenAI accepted the credential. It does not prove FounderOS authorization, response quality, retention, or safe execution.

## Human Decisions Required Before Implementation

- Identity-provider and workload-identity mechanism
- Authorization issuer and approval workflow
- OpenAI organization/project ownership
- Credential store and operator roles
- Rotation and emergency revocation service levels
- Data classification permitted for provider processing
- OpenAI retention/residency contractual posture
- Billing owner and spend limit
- Incident owner and escalation path

These are explicit future approval gates, not placeholders in the Milestone 16 architecture.
