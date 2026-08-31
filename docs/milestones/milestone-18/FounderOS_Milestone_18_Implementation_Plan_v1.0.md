# FounderOS Milestone 18 Credential Resolution and Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven development and execute this plan
> task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement a secret-free authorization-first orchestration boundary and a process-local
synthetic credential resolver with monotonic rotation, permanent revocation, and verified release.

**Architecture:** Shared strict contracts define every serializable value. Knowledge Engine owns
M17 verification, coordinate checks, idempotency, and final evidence. A new infrastructure package
owns synthetic bytes and returns only a structural secret-free port result after cleanup.

**Tech Stack:** TypeScript 6 strict ESM, Zod 4, Vitest 4, pnpm 11.

## Global Constraints

- No real credentials, provider-valid fixtures, environment or filesystem reads, provider mapping,
  transport, network, deployment, release, or Milestone 19 behavior.
- No production code before the focused test has failed for the expected missing behavior.
- All operation time is explicit; public results are canonical, sanitized, and deeply immutable.
- Knowledge Engine must not import `@founderos/credential-resolver`.

---

### Task 1: Shared Credential Contracts

**Files:** Create `packages/knowledge-schema/src/credential-resolution.ts`; create
`packages/knowledge-schema/tests/credential-resolution.test.ts`; modify package facade.

**Produces:** strict schemas and types named `CredentialResolutionRequest`,
`CredentialResolutionCommand`, `CredentialRotationRecord`, `CredentialRevocationRecord`,
`CredentialResolutionPortResult`, `CredentialResolutionEvidence`, `CredentialResolutionResult`,
and `CredentialResolutionVerificationResult`.

- [ ] Write facade-imported tests for valid variants, strictness, semantic bindings, sorted reasons,
  chronology, safe identifiers, and secret/URL rejection.
- [ ] Run the focused schema test and record missing-export RED.
- [ ] Implement the minimal strict schemas and export them.
- [ ] Run the focused test and package typecheck to GREEN.

### Task 2: Canonical Evidence and Authorization-First Orchestration

**Files:** Create `services/knowledge-engine/src/domain/credential-resolution.ts`; create
`services/knowledge-engine/src/application/credential-resolution-orchestrator.ts`; create focused
tests; modify the engine facade.

**Consumes:** M17 authority `verifyDecision` and `verifyClaim`; the shared structural command/result
types.

**Produces:** `createCredentialResolutionRequest`, `createCredentialResolutionEvidence`,
`verifyCredentialResolutionEvidence`, `CredentialResolutionPort`, and
`createCredentialResolutionOrchestrator`.

- [ ] Write tests proving deterministic fingerprints, tamper rejection, exact registered M17
  verification, all binding mismatches, deadline enforcement, zero preflight port calls, exact
  replay, conflict precedence, and immutable sanitized results.
- [ ] Run focused tests and record missing-module RED.
- [ ] Implement canonical constructors/verifier and the minimal factory-owned request registry.
- [ ] Run focused tests and engine typecheck to GREEN.

### Task 3: Synthetic Resolver, Rotation, Revocation, and Release

**Files:** Create `infrastructure/credential-resolver/package.json`, TypeScript configurations,
`src/index.ts`, and `tests/credential-resolver.test.ts`; extend `pnpm-workspace.yaml`.

**Produces:** `createSyntheticCredentialResolver` with structural `resolveAndRelease`, `rotate`,
`revoke`, `inspect`, and disabled evaluation methods. No method returns material.

- [ ] Write tests for initial version, exact rotation, conflict and chronology rejection, permanent
  revocation, active-only resolution, one materialization, replay behavior at the service layer,
  fault cleanup, zero confirmation, and secret-free public shapes.
- [ ] Run the focused infrastructure test and record missing-package RED.
- [ ] Implement the synchronous private registry and numeric-fragment synthetic buffer.
- [ ] Ensure buffer overwrite occurs in `finally` and success is impossible without zero proof.
- [ ] Run focused tests and package typecheck to GREEN.

### Task 4: Composition, Closure, and Traceability

**Files:** Create service composition/closure tests and M18 documentation traceability tests; update
package READMEs and repository status documents.

- [ ] Write tests proving structural composition without an engine-to-infrastructure import,
  prohibited-capability closure, no-network runtime behavior, document inventory, and exact
  AC-001 through AC-020 mapping.
- [ ] Record RED for missing composition/docs anchors.
- [ ] Implement only the required facade exports, structural scanner, disabled harness, and truthful
  documentation updates.
- [ ] Run focused tests and formatting to GREEN.

### Task 5: Inventory, Full Verification, and Review

**Files:** Modify `services/knowledge-engine/scripts/run-tests.mjs` only for observed inventory;
modify root scripts only if the new workspace requires it.

- [ ] Run the engine aggregate test before inventory update and confirm only the expected inventory
  mismatch.
- [ ] Update exact ordinary file/test totals and preserve the isolated M15 and predecessor gates.
- [ ] Run formatting, lint, build, typecheck, full tests, predecessor-bound verification, diff check,
  untracked inventory, and secret/capability scans.
- [ ] Review the entire candidate against its base and remediate every finding.
- [ ] Produce a commit-readiness decision without committing or publishing M18.
