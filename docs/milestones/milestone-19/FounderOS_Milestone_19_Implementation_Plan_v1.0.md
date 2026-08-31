# FounderOS Milestone 19 Disabled OpenAI Responses Adapter Implementation Plan v1.0

> **Execution gate:** This plan is inactive until the specification package is independently
> accepted and implementation is explicitly authorized.

**Goal:** Implement deterministic request-plan and fixture-response mapping plus a structurally
disabled OpenAI Responses adapter facade with zero network capability.

**Stack:** TypeScript 6 strict ESM, Zod 4, Vitest 4, pnpm 11. No new production dependency is
expected.

## Global Constraints

- Test-driven changes only after separate implementation authorization.
- No credential material, authentication header, SDK, HTTP client, network module, endpoint
  override, successful final pre-send gate, deployment, release, or M20 behavior.
- No overlapping application-code writer in one worktree.
- Public artifacts are strict, canonical, deeply immutable, deterministic, and sanitized.

## Task 1 — Shared Contracts

**Expected files:** focused module and tests in `packages/knowledge-schema/`, plus facade export.

- [ ] Add facade-imported RED tests for every strict contract, both exact taxonomies and the total
      fixture matrix, model/instruction/input/cache/disablement binding, canonical byte,
      fingerprint, hidden-capability, and prohibited-field requirement.
- [ ] Implement the minimum schemas and inferred types.
- [ ] Run focused package tests and typecheck to GREEN.

## Task 2 — Authority-First Service Orchestration

**Expected files:** focused domain/application modules and tests in `services/knowledge-engine/`,
plus facade export.

- [ ] Add RED tests for exact M14–M18 verification, request-plan-before-resolution ordering, every
      coordinate substitution, boundary-specific zero calls, permanent identity, exact replay,
      conflict precedence, asynchronous concurrency, non-mutating in-flight observations, fresh
      current-control authority, mandatory captured M18 orchestration, and sanitized results.
- [ ] Implement canonical constructors, independent verifiers, the structural ports, and the
      factory-owned process-local registry.
- [ ] Run focused engine tests and typecheck to GREEN.

## Task 3 — Disabled OpenAI Integration

**Expected files:** new `integrations/openai-responses/` workspace package with source, tests,
TypeScript configurations, README, and package manifest.

- [ ] Add RED tests for the fixed profile, deterministic plan, every prohibited request member,
      exact eight-section response shape, same-unit byte/token bounds, adversarial multi-fault
      response precedence, exact response taxonomy, disabled-only state, immutable facade, and
      fixture isolation.
- [ ] Implement deterministic mapping without any production runtime dependency.
- [ ] Run focused integration tests and typecheck to GREEN.

## Task 4 — Composition and Security Closure

- [ ] Add structural composition tests proving no engine-to-integration import.
- [ ] Add TypeScript-aware transitive closure, manifest dependency, secret, and provider-capability
      tests with adversarial syntax fixtures.
- [ ] Add runtime no-network witnesses for every public path.
- [ ] Add exact AC-001 through AC-020 documentation traceability.
- [ ] Update root/package documentation only for behavior actually implemented.

## Task 5 — Verification and Review

- [ ] Update exact test inventory only after observing the expected inventory mismatch.
- [ ] Run focused tests, formatting, lint, build, typecheck, complete tests, predecessor-bound proof,
      diff check, untracked inventory, and security scans.
- [ ] Self-review the full branch against its base.
- [ ] Conduct an independent exact-candidate whole-branch review.
- [ ] Stop at a truthful readiness decision without committing or publishing unless separately
      authorized.
