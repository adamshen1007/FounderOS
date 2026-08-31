# FounderOS Milestone 18 Credential Resolution and Rotation Design v1.0

## Status

Approved design candidate. Documentation only until the detailed specification, acceptance
criteria, verification checklist, and implementation plan are reviewed. This document authorizes
no credential operation, Git publication, provider transport, deployment, release, or live
execution.

## Objective

Milestone 18 implements the second bounded component in the Milestone 16 production-execution
sequence: a provider-neutral Credential Reference resolution and rotation foundation with no
transport. It proves that one exact Milestone 17 authorization claim can be verified before a
synthetic credential source is touched, that only the currently active rotation version can be
resolved, and that synthetic material is released before any public result is returned.

Milestone 18 does not read or store a real credential. Its material source is deterministic,
synthetic, non-provider-valid, and confined to an infrastructure-owned closure. The milestone
returns only strict sanitized evidence. It creates no authentication header and exposes no method
that can send, map, serialize, log, fingerprint, or retrieve credential bytes.

## Authority Chain

The design inherits, without broadening, the following approved order:

1. Milestone 16 defines the credential ownership and future execution sequence.
2. Milestone 17 provides the exact process-local Authorization Decision and permanent
   `claimed-by-exact-attempt` transition.
3. Milestone 18 verifies the registered claim at an explicit evaluation time before invoking the
   resolver port.
4. A later milestone may add a disabled OpenAI mapper and adapter-private credential handoff.
5. Live provider execution remains separately human-authorized.

Possession of a Credential Reference, Context Package, Invocation, Decision artifact, or claim
artifact is not sufficient. The exact claim must be currently verified by the same registered
Milestone 17 authority instance before the resolution boundary is entered.

## Architectural Decision

### Selected approach

Use a dedicated infrastructure workspace package for the synthetic resolver, a service-owned
orchestration boundary for authorization ordering, and shared secret-free schemas for all public
data.

### Rejected alternatives

1. **Resolver implementation inside `@founderos/knowledge-engine`.** This is smaller but violates
   the Milestone 16 ownership rule that Knowledge Engine does not own secret storage or resolution.
2. **Environment-variable, macOS Keychain, or external secret-store adapter.** This crosses into
   real credential provisioning, host configuration, operator access, and incident response before
   those human decisions are approved.
3. **Returning an opaque lease that retains synthetic material.** With no provider adapter in this
   milestone, a retained lease has no authorized consumer and creates unnecessary lifetime and
   leakage risk.

## Package Ownership and Dependency Direction

### `@founderos/knowledge-schema`

Owns strict versioned serializable contracts in a focused credential-resolution module:

- resolution request and sanitized result;
- rotation and revocation metadata;
- resolution, rotation, revocation, and release evidence;
- closed failure reasons;
- deterministic evidence fingerprints;
- independent verification results.

The schema package contains no credential value, byte buffer, secret source, resolver callback,
environment-variable name, physical secret-store path, authentication header, endpoint, provider
body, or transport concept.

### `@founderos/knowledge-engine`

Owns application orchestration only:

- strict input capture before authority access;
- verification of the exact registered Milestone 17 Decision and claim;
- equality checks for attempt, provider family, Adapter, environment, operation, Credential
  Reference, fingerprint, and rotation version;
- resolver-port invocation only after every non-secret gate passes;
- normalization into schema-valid sanitized results;
- independent reproduction of public evidence.

Knowledge Engine never receives or handles synthetic material and does not implement the resolver.

### `@founderos/credential-resolver`

A new package under `infrastructure/credential-resolver/` owns:

- the process-local synthetic Credential Reference and rotation registry;
- deterministic non-provider-valid material construction inside a private closure;
- active-version selection, monotonic rotation, and revocation;
- one bounded materialization attempt per new resolution identity;
- unconditional release through `Uint8Array.fill(0)` in a `finally` block;
- sanitized evidence returned only after release is confirmed;
- a disabled deterministic evaluation harness.

The package depends on shared contracts. It exposes no filesystem, environment, Keychain, network,
provider SDK, endpoint, header, proxy, socket, or transport capability. The root workspace adds
`infrastructure/*` only to host this independently testable boundary.

The shared schema defines the secret-free `CredentialResolutionCommand` and
`CredentialResolutionPortResult` data contracts. Knowledge Engine declares its narrow structural
`CredentialResolutionPort` locally from those shared types. The infrastructure package exports a
facade with the same structural signature while depending only on the shared schema; Knowledge
Engine never imports the concrete package. Composition tests prove compatibility by supplying the
infrastructure facade to the service boundary without introducing a schema-to-service or
service-to-infrastructure dependency cycle.

## Public Data Model

### Resolution request

The canonical request binds:

- schema version and resolution request ID;
- Authorization Decision ID and fingerprint;
- authorization claim ID and fingerprint;
- exact execution-attempt identity;
- subject, Consumer, Delivery, Context, and Invocation coordinates;
- provider family, Adapter identity and fingerprint;
- environment and operation;
- Credential Reference ID and fingerprint;
- expected rotation version;
- canonical `purpose/<authorized operation>` reference;
- explicit `evaluatedAt` and resolution deadline no later than the M17 Decision expiry.

Unknown, hidden, symbolic, inherited, accessor-backed, non-enumerable, non-plain, duplicate,
non-canonical, unbounded, secret-shaped, URL-shaped, or unsupported values fail before authority or
resolver access.

### Rotation record

A canonical rotation transition binds:

- rotation record ID and monotonically increasing positive sequence;
- Credential Reference ID and fingerprint;
- prior rotation version and next rotation version;
- explicit effective time;
- rotation authority reference and evidence reference;
- environment, provider family, and Adapter binding;
- deterministic record fingerprint.

The first configured version has sequence `1`. A later transition must name the exact current
version and use the next sequence. Versions are permanently reserved. Equal, stale, skipped,
reused, conflicting, or time-regressing transitions fail without changing active state.

### Revocation record

Revocation binds the exact Credential Reference and rotation version, a positive monotonic
revocation version, explicit time, authority reference, bounded sanitized reason code, and
fingerprint. Revocation is permanent. It does not delete history or make a previous rotation
resolvable again.

### Resolution evidence

Successful evidence states only that the exact synthetic version was materialized and released.
It binds request, authorization, claim, attempt, reference, rotation, provider, Adapter,
environment, operation, evaluation time, deadline, resolver identity, source class
`deterministic-synthetic`, release status `released`, and an evidence fingerprint.

It contains no material length, bytes, string, prefix, suffix, checksum derived from material,
secret-store location, environment-variable name, authentication header, or provider request data.

## Resolver Port

The service boundary consumes a narrow synchronous port:

```ts
interface CredentialResolutionPort {
  resolveAndRelease(
    input: CredentialResolutionCommand,
  ): CredentialResolutionPortResult;
}
```

`CredentialResolutionCommand` is an immutable service-to-infrastructure projection produced only
after successful M17 verification. It contains the exact non-secret coordinates needed by the
resolver and no authority callback or caller-controlled capability.

The resolver method always releases any constructed synthetic buffer before returning. The
returned port result is a sanitized discriminated union. There is no `getCredential`, `readSecret`,
`withSecret`, `toAuthorizationHeader`, `send`, retry, reset, release, or reopen operation in the
public facade.

## Resolution Flow

1. Capture the complete caller wrapper into canonical plain data before protected-value access.
2. Reject malformed, hidden-capability, secret-bearing, URL-bearing, or unsupported input.
3. Ask the registered M17 authority to verify the exact Decision and claim at `evaluatedAt`.
4. Compare every Decision, claim, attempt, provider, Adapter, environment, operation, reference,
   fingerprint, rotation, canonical operation-derived purpose, and authorization-bounded deadline
   coordinate.
5. Reserve the resolution request ID before resolver access. Exact replay returns the original
   immutable sanitized result without rematerializing; conflicting reuse fails closed.
6. Invoke `resolveAndRelease` exactly once.
7. The infrastructure registry revalidates the exact active version, availability, revocation,
   deadline, and command coordinates before constructing synthetic bytes.
8. Construct the deterministic synthetic `Uint8Array` inside the resolver closure.
9. Produce the non-secret evidence fields, zero the entire buffer in `finally`, and confirm every
   owned byte is zero.
10. Return success only after release confirmation and final evidence validation.

No provider mapping, header construction, request serialization, network preparation, or durable
execution evidence occurs after resolution.

## Idempotency and Failure Ordering

Resolution identities are process-locally and permanently reserved once pre-resolution authority
and coordinate validation succeeds. An exact duplicate returns the original immutable result and
does not invoke the resolver again. Reusing the identity with different canonical content returns
`conflicting_identity` before active-version, revocation, or material-source access.

Failure precedence is:

1. invalid public input;
2. conflicting resolution identity;
3. invalid or non-authoritative M17 Decision/claim;
4. exact coordinate mismatch;
5. expired deadline;
6. missing, unavailable, stale, or revoked Credential Reference version;
7. internal materialization or release-integrity failure.

Every public failure is a strict sanitized union with a closed reason inventory. Raw exceptions,
input payloads, source details, buffer content, stack traces, and provider-shaped material never
cross the boundary.

## Synthetic Material Rules

- Synthetic bytes are deterministically derived inside the infrastructure package from a
  non-secret domain label, resolver identity, and active rotation version.
- The derivation is test material only and must not resemble or validate as any provider
  credential format.
- Source code and fixtures must not contain contiguous provider-key-shaped literals.
- Synthetic bytes never influence a public fingerprint or comparison value.
- The owned buffer exists only inside one synchronous `resolveAndRelease` call.
- Cleanup uses `finally`; internal failure cannot skip release.
- JavaScript cannot prove erasure of runtime, VM, CPU, or operating-system copies. Milestone 18
  claims only that its owned `Uint8Array` is overwritten and no application-visible copy is made.

## State and Concurrency

The synthetic registry is process-local and synchronous. It provides deterministic single-process
ordering for resolution ID reservation, rotation, and revocation. It does not claim durability,
cross-process exclusion, distributed coordination, crash recovery, or production credential
authority.

Rotation and revocation commit only after all fallible record construction and validation succeed.
An internally rejected transition cannot consume a sequence or alter active state. Resolution
reads one atomic registry snapshot and never changes the active rotation version.

## Security and Capability Closure

The complete M18 production-module closure must fail if it contains:

- Node filesystem, process, child-process, worker, VM, network, TLS, DNS, HTTP, HTTPS, socket,
  module-loader, or dynamic-import capabilities;
- `fetch`, `XMLHttpRequest`, WebSocket, proxy, SDK, or provider-client capabilities;
- environment-variable, Keychain, shell, credential-file, secret-manager, or external-store reads;
- caller-provided callbacks, reflective constructors, alternate loaders, computed capability
  access, or unapproved dynamic property access;
- serialization or logging of material-bearing objects.

Static analysis is supplemented by runtime witnesses proving that rejected preflight and replay
paths do not invoke the resolver and that the disabled harness cannot invoke network or transport.

## Test Strategy

### Shared contracts

- valid request, rotation, revocation, evidence, result, and verification fixtures;
- unknown-field, hidden-property, symbol, accessor, prototype, duplicate, non-finite, time,
  identifier, URL, and secret-shape rejection;
- canonical serialization and deterministic fingerprint reproduction;
- proof that every public schema is incapable of representing material.

### Authorization ordering

- exact registered M17 Decision and claim succeeds;
- missing, substituted, expired, revoked, pre-claim, foreign-authority, stale-time, attempt,
  reference, rotation, provider, Adapter, environment, operation, and deadline cases reject;
- a counting port proves zero resolver calls for every pre-resolution rejection;
- conflicting resolution identity wins before resolver or mutable registry access.

### Rotation and revocation

- initial active version, exact monotonic rotation, and permanent prior-version rejection;
- equal, stale, skipped, conflicting, foreign-authority, and time-regressing rotation rejection;
- monotonic revocation and permanent revoked-version rejection;
- late internal faults cannot consume sequence or alter current state.

### Material containment

- exact success materializes once and returns only released sanitized evidence;
- exact replay materializes zero additional times;
- source failure and evidence-construction failure still zero the owned buffer;
- a private runtime witness confirms nonzero bytes existed only before cleanup and every owned byte
  is zero afterward;
- a canary assembled from non-secret numeric fragments is absent from JSON, canonical evidence,
  errors, logs, snapshots, source text, and Git diff;
- repository secret-pattern scanning remains clean.

### Structural closure and regression

- TypeScript-AST closure analysis covers every transitive M18 production module;
- adversarial loader, reflection, destructuring, computed-access, environment, filesystem, and
  network probes fail closed;
- all Milestone 04–17 tests and predecessor-bound verification remain green;
- formatting, lint, build, typecheck, complete tests, and `git diff --check` are mandatory.

## Documentation Deliverables

The completed documentation set will include:

1. this architecture design;
2. core Milestone 18 specification;
3. Credential Resolution Request and Evidence contract;
4. Credential Rotation and Revocation contract;
5. acceptance criteria;
6. verification checklist;
7. package responsibility README;
8. detailed TDD implementation plan;
9. root README, documentation index, changelog, and ADR updates reflecting only approved or
   implemented state.

## Explicit Non-Goals

- Real credential values, API keys, bearer tokens, authentication headers, or provider-valid test
  credentials
- Environment-variable, Keychain, filesystem, HSM, vault, cloud secret-manager, or external
  credential-store integration
- Durable or distributed credential registry, cross-process coordination, background rotation, or
  operator automation
- OpenAI request mapping, provider SDK, endpoint, proxy, DNS, TLS, socket, HTTP, retry, or send
- Final pre-send revalidation, because there is no send boundary in M18
- Model selection, provider configuration, account changes, billing, retention configuration, or
  production operations
- Streaming, background execution, tools, functions, files, images, audio, web search, or state
- Agents, Hermes, MCP, routing, fallback, autonomous planning, semantic retrieval, embeddings,
  knowledge graphs, UI, deployment, or release
- Milestone 19 implementation or any live-execution authorization

## Known Limitations

- State and idempotency are lost on process restart.
- Synthetic material proves containment mechanics, not compatibility with a real secret store or
  OpenAI authentication.
- `Uint8Array.fill(0)` proves overwrite of the owned buffer only; it is not a claim about runtime
  or hardware memory erasure.
- No component can consume credential material for transport in this milestone.
- A production credential store, operator roles, rotation service levels, incident ownership, and
  provider-account controls remain human decisions.

## Acceptance Boundary

The design is ready for detailed specification and planning only after review confirms that it:

- preserves the M16 sequence and M17 exact-claim authority;
- assigns resolution ownership to infrastructure rather than Knowledge Engine;
- contains only deterministic synthetic material;
- provides no material-return or transport capability;
- specifies exact ordering, rotation, revocation, release, idempotency, and failure semantics;
- keeps all future credential-store and live-provider choices separately gated.

Implementation completion will require exact requirement traceability, fresh repository gates,
whole-branch review, and an independent decision with no unresolved Critical, Important, or Minor
findings. No review result alone authorizes commit, push, pull request, merge, deployment, release,
real credential access, provider execution, or Milestone 19 work.
