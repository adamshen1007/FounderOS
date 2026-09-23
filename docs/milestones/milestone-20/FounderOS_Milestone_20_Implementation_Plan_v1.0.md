# FounderOS Milestone 20 End-to-End Dry-Run and Fault-Injection Implementation Plan v1.0

> **Execution gate:** Inactive until the exact documentation package is independently reviewed and
> separately accepted by the human Product Owner with explicit implementation authorization.

**Goal:** Implement deterministic M17–M19 composition, closed fault injection, a non-authoritative
final-control rehearsal, and self-verifying no-network reports.

**Stack:** Existing TypeScript 6 strict ESM, Zod 4, Vitest 4, and pnpm 11. No new production
dependency is expected.

## Global Constraints

- One application-code writer in one worktree.
- Test-driven implementation in small verified changes.
- No real credential, header, final live gate, network client, provider SDK, provider request,
  deployment, release, or later-milestone behavior.
- Preserve M17–M19 public behavior and package direction.
- Public artifacts remain strict, canonical, deterministic, deeply immutable, bounded, and
  sanitized.

## Task 1 — Shared M20 Contracts

**Expected paths:**

- `packages/knowledge-schema/src/m20-dry-run.ts`
- `packages/knowledge-schema/tests/m20-dry-run.test.ts`
- existing schema facade export

- [ ] Add RED tests for every request, scenario, catalog, fault, observation, final-control snapshot,
      rehearsal, result, report, taxonomy, strict-shape, terminal grammar, bound, and fingerprint
      requirement.
- [ ] Implement the minimum schemas and inferred types.
- [ ] Run focused schema tests and typecheck to GREEN.

## Task 2 — Knowledge Engine Dry-Run Conductor

**Expected paths:**

- `services/knowledge-engine/src/application/m20-dry-run-conductor.ts`
- `services/knowledge-engine/src/domain/m20-dry-run.ts`
- `services/knowledge-engine/tests/m20-dry-run.test.ts`
- existing engine facade export

- [ ] Add RED tests for exact gate order, owner-before-await, permanent identity, concurrency,
      replay, conflict, unique result discriminants, stage grammar, owner boundary counts, external
      replay/follower deltas, authority-bound checks, structural report verification, rehearsal,
      and every M20 failure precedence row.
- [ ] Implement only structural ports, including the captured monotonic read-only network witness,
      deterministic state, canonical construction, and verifier.
- [ ] Prove the engine imports no concrete M18 or M19 package.
- [ ] Run focused engine tests and typecheck to GREEN.

## Task 3 — Test-Only Composition and Scenario Catalog

**Expected paths:**

- `tests/support/milestone-20/`
- `tests/milestone-20-composition.test.ts`

- [ ] Wire existing public M17, M18, and M19 boundaries without altering their ownership.
- [ ] Define the closed immutable catalog and deterministic fixtures.
- [ ] Execute one full success path and every required single- and multi-fault path.
- [ ] Prove source immutability outside conductor reports, fresh-conductor report equality, the
      separate isolated M19 fixture regression matrix, and zero provider/network attempt.

## Task 4 — Security and Traceability

- [ ] Extend the existing TypeScript-aware closure proof to every new production module.
- [ ] Add adversarial static probes and one concrete test-only witness that wraps every available
      ambient network global, increments before rejection, and supplies the captured monotonic
      count to the conductor.
- [ ] Add exact M20 AC-001 through AC-020 documentation-to-test traceability.
- [ ] Scan source, diff, public JSON, errors, and snapshots for secrets, headers, endpoints, paths,
      and prohibited execution claims.
- [ ] Update root/package current-state documentation only for behavior actually implemented.

## Task 5 — Verification and Independent Review

- [ ] Run focused tests, formatting, lint, build, typecheck, full tests, predecessor-bound proof,
      diff check, untracked inventory, and security scans.
- [ ] Record exact candidate manifest and file hashes.
- [ ] Self-review the whole branch against its authorized base.
- [ ] Conduct an independent read-only exact-candidate review.
- [ ] Stop at a truthful implementation-readiness result without committing or publishing unless
      separately authorized.

## Rollback

Before publication, discard only the explicitly owned M20 candidate files if authorized. After a
future merge, revert the M20 implementation commit or pull request. No database, provider, secret,
or remote runtime state exists to migrate or roll back.
