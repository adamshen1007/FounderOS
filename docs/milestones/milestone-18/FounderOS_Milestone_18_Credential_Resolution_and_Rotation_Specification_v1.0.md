# FounderOS Milestone 18 Credential Resolution and Rotation Specification v1.0

## Status

Implementation specification for a process-local, synthetic, non-production credential boundary.
It authorizes no real credential, provider mapping, transport, network access, deployment, release,
or live execution.

## Objective

Implement the second bounded component in the accepted Milestone 16 sequence. Milestone 18 proves
that an exact registered Milestone 17 Decision and permanent claim are valid before an
infrastructure-owned resolver is touched, that only one current synthetic rotation version may be
materialized, and that the resolver overwrites its owned bytes before returning sanitized evidence.

## Package Boundaries

- `@founderos/knowledge-schema` owns strict, serializable, secret-free request, command, rotation,
  revocation, evidence, result, and verification contracts.
- `@founderos/knowledge-engine` owns canonical public evidence construction, registered M17
  Decision/claim verification, exact coordinate comparison, request-identity reservation, and
  resolver-port orchestration.
- `@founderos/credential-resolver` under `infrastructure/credential-resolver/` owns a synchronous
  process-local synthetic registry, monotonic rotation and revocation, one bounded materialization,
  and unconditional owned-buffer overwrite.

Dependencies flow from infrastructure and service packages to the shared schema. Knowledge Engine
declares a structural port and never imports the concrete resolver package. Composition occurs only
in tests or a later approved application boundary.

## Required Gate Order

1. Capture the exact wrapper as own enumerable plain canonical data.
2. Validate all public schemas and reject hidden, symbolic, inherited, accessor-backed,
   non-canonical, URL-shaped, or credential-shaped values.
3. Apply permanent conflicting-resolution-identity precedence.
4. Verify the exact registered M17 Decision at `evaluatedAt`.
5. Verify the exact registered M17 claim at `evaluatedAt`.
6. Compare Decision, claim, Attempt, provider, Adapter, environment, operation, Credential
   Reference, rotation, canonical `purpose/<authorized operation>`, evaluation, and a resolution
   deadline no later than the M17 Decision expiry.
7. Reject an expired resolution deadline.
8. Permanently reserve the resolution identity.
9. Invoke the resolver port exactly once.
10. Revalidate the active synthetic reference, rotation, revocation, deadline, and command inside
    the infrastructure package.
11. Materialize deterministic non-provider-valid bytes inside one synchronous closure.
12. Construct secret-free port evidence, overwrite the complete owned buffer in `finally`, verify
    every owned byte is zero, and only then return.
13. Independently validate and fingerprint the public evidence in Knowledge Engine.

An exact replay returns the original frozen result and performs no resolver call. Conflicting reuse
fails before authority or resolver access.

## State Semantics

The first configured rotation has sequence `1`. Rotation requires the exact current version, the
next positive sequence, non-regressing effective time, authority reference, and evidence reference.
Every version and schema-valid, fingerprint-valid record identity is permanently reserved,
including rejected transition attempts. Revocation is monotonic and permanent; it never restores a
prior version. Fallible validation and artifact construction complete before registry state
changes.

Resolution identity, rotation, revocation, and evidence state are process-local. The milestone
claims deterministic single-process linearization only, not durability or distributed authority.

## Failure Semantics

Public failures use closed sanitized reason codes. Precedence is invalid input, conflicting
identity, non-authoritative M17 artifact, coordinate mismatch, expired deadline, resolver reference
state, and internal materialization or release-integrity failure. Raw exceptions, stacks, source
details, material, material-derived digests, paths, URLs, endpoints, headers, and environment values
never cross a public boundary.

## Security Closure

Production M18 modules may not import or acquire filesystem, process, child-process, worker, VM,
module-loader, environment, DNS, TLS, HTTP, HTTPS, socket, proxy, provider SDK, or network
capabilities. They accept no callback or client. The resolver facade has no credential getter,
header constructor, serializer, sender, retry, reset, release, reopen, or delete operation.

Synthetic bytes are constructed from numeric, non-secret fragments and never resemble a provider
credential. They never affect a public fingerprint. `Uint8Array.fill(0)` proves only overwrite of
the resolver-owned buffer; no VM, operating-system, or hardware erasure claim is made.

## Explicit Non-Goals

- Real credentials or provider-valid fixtures
- Environment, Keychain, filesystem, HSM, vault, or cloud secret stores
- Durable or distributed state, operator automation, or background rotation
- OpenAI mapping, authentication headers, SDKs, endpoints, DNS, TLS, sockets, HTTP, retry, or send
- Final pre-send revalidation or any provider execution
- Agents, Hermes, MCP, UI, deployment, release, or Milestone 19

## Completion Boundary

Completion requires a complete contract-to-test traceability mapping, focused red-green evidence,
all repository gates, the bounded Milestone 15 predecessor proof, secret-pattern scanning, and an
independent whole-candidate review with no unresolved finding. Completion does not authorize Git
publication, deployment, real credential access, provider execution, or the next milestone.
