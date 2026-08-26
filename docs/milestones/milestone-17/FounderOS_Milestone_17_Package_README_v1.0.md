# FounderOS Milestone 17 Package README v1.0

## Scope

Milestone 17 implements a process-local, provider-neutral, non-production execution Authorization
Decision authority. It extends the documentation-only Milestone 16 sequence without adding a
credential or provider path.

## Packages

### `@founderos/knowledge-schema`

Owns `authorization.ts`: strict contracts for verified Service Identity evidence, human approval,
exact Authorization Requests, Decisions, permanent claims, limits, reason codes, and operation
results.

### `@founderos/knowledge-engine`

Owns:

- canonical constructors and independent artifact verifiers;
- the factory-created in-memory authority;
- deterministic exact issuance with captured Service Identity evidence/workload/proof coordinates,
  fixed processing tier `default`, and permanent claim ownership;
- inspection, monotonic revocation, and registered-artifact verification;
- the disabled evaluation harness.

## Evaluation example

```ts
import {
  createInMemoryExecutionAuthorizationAuthority,
  runDisabledExecutionAuthorizationHarness,
} from "@founderos/knowledge-engine";
```

The harness accepts exact deterministic evidence; exercises issuance, permanent claim,
pre/post-revocation inspection and verification, successful revocation N, stale/equal rejection,
successful later N+1, and claim preservation; and returns a sanitized foundation status. It is not
a command, daemon, API server, provider adapter, or production runtime.

## Boundaries

The registry is private and process-local. Restart loses decisions, claims, and revocations.
JavaScript synchronous mutation linearizes a claim inside one authority instance; there is no
cross-process coordination claim.

No credential resolver, environment read, secret store, authentication integration, database,
provider mapping, provider SDK, endpoint, transport, network, Agent, Hermes, MCP, UI, deployment,
release, or live execution exists in this package.

## Verification

Run the root formatting, lint, build, typecheck, test, and predecessor-bound commands listed in the
Milestone 17 verification checklist. Volatile file and test totals belong in the exact candidate
report, not this durable document.
