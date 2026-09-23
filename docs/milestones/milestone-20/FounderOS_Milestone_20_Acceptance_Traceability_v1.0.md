# FounderOS Milestone 20 Acceptance Traceability v1.0

## Purpose

This ledger maps every Milestone 20 acceptance criterion to the current implementation candidate
and its executable proof. It records local implementation evidence only. It does not claim
independent whole-candidate acceptance, Git publication, merge, production readiness, provider
access, deployment, release, live execution, or authority to begin Milestone 21.

| Acceptance | Implementation anchor | Executable proof |
| --- | --- | --- |
| M20-AC-001 | `packages/knowledge-schema/src/m20-dry-run.ts` | `packages/knowledge-schema/tests/m20-dry-run.test.ts` exact contract, bounds, discriminant, taxonomy, fingerprint-domain, strictness, and freezing tests |
| M20-AC-002 | `services/knowledge-engine/src/application/m20-dry-run-conductor.ts` and `services/knowledge-engine/src/domain/m20-dry-run.ts` | `services/knowledge-engine/tests/m20-dry-run.test.ts` owner-order, replay, report-construction, and independent-verifier tests |
| M20-AC-003 | `tests/support/milestone-20/composition.ts` | `tests/milestone-20-composition.test.ts` concrete public-boundary composition and exact-facade tests |
| M20-AC-004 | `tests/support/milestone-20/composition.ts` public M17/M18/M19 wiring | `runs the concrete no-network success composition` plus M17 and M19 substitution tests |
| M20-AC-005 | M19 terminal validation in `m20-dry-run-conductor.ts` | success composition asserts `disabled-by-policy` followed by `dry-run-verified` and no provider-ready state |
| M20-AC-006 | `tests/support/milestone-20/final-control-authority.ts` | exact two-method facade, authority identity, snapshot substitution, retry, and every denial-precedence test |
| M20-AC-007 | exact descriptor capture in both M20 engine modules | engine and composition hostile-input matrices for unknown, hidden, symbol, inherited, accessor, prototype, array, callback, client, secret-shaped, and URL-shaped values |
| M20-AC-008 | process-local owner registry and two network-witness reads in `m20-dry-run-conductor.ts` | owner-before-await, follower, replay, conflict, positive-delta, permanent-integrity, and exact protected-call-delta tests |
| M20-AC-009 | terminal grammar in the shared schema and request-authoritative verifier in `m20-dry-run.ts` | complete report mutation matrix, exact M17 port-versus-verification count rows, stage-prefix, assertion, count, terminal, and catalog-bound tests |
| M20-AC-010 | `M20_DRY_RUN_REASON_CODES` and closed result schemas | all five result discriminants, first-applicable precedence, throwing-port normalization, and unrestricted-detail rejection tests |
| M20-AC-011 | `tests/support/milestone-20/catalog.ts` | immutable closed catalog proof for all 31 fault kinds, success, concurrency, replay, named M17/M14/M15/M19 variants, and separate preflight/mutation matrices |
| M20-AC-012 | catalog precedence scenarios and final-control profile fixtures | adjacent taxonomy-pair and all final-control denial-row tests in `tests/milestone-20-composition.test.ts` |
| M20-AC-013 | inert fault and scenario contracts plus catalog fixture references; the public Knowledge Engine facade excludes the test-only fault constructor | facade-exclusion, schema callback/client/executable exclusion, and composition proof that behavior derives only from fingerprinted fixture references |
| M20-AC-014 | canonical M20 artifact constructors | fresh-conductor byte-identical report and fingerprint test |
| M20-AC-015 | `verifyM20DryRunReport` and captured structural authorities | Decision/claim/snapshot/rehearsal substitution tests, pure verifier mutation matrix, M19 public-coordinate tests, and retained M19 private terminal-reproduction suite |
| M20-AC-016 | `sourceInventory`, independent snapshot/fingerprint readers, and canonical-document hashes in test composition | immutability assertions after every success, rejection, fault, concurrency, replay, and full negative-preflight sequence |
| M20-AC-017 | `createM20IsolatedFixtureMapping` outside the catalog and conductor | isolated M19 fixture-response regression matrix and absence-from-artifact assertions |
| M20-AC-018 | TypeScript-aware transitive production closure in `services/knowledge-engine/tests/milestone-20-documentation-traceability.test.ts` | exact dependency allowlist and adversarial alias, computed, destructuring, reflection, loader, dynamic-code, environment, filesystem, worker, credential, provider-SDK, Agent, Hermes, MCP, network, and direct/aliased/computed `WebTransport` probes |
| M20-AC-019 | `tests/support/milestone-20/network-witness.ts` | every available ambient network global is wrapped before dependency construction, increments before rejection, supplies the conductor witness, and remains zero across all execution families |
| M20-AC-020 | this complete AC-001 through AC-020 ledger | M20 focused suites, predecessor proof, repository gates, candidate scans, and independent exact-candidate review are Task 5 gates and must be reported from fresh execution rather than presumed here |

## Security and Publication Boundary

The M20 production closure imports only repository-local modules, `node:crypto`,
`node:util/types`, and `zod`. Its reviewed reflective and dynamic-access source fingerprints are
pinned by the executable closure test. Mutation probes prove the witness rejects direct, aliased,
computed, destructured, reflective, loader, dynamic-code, environment, filesystem, worker,
credential-resolver, provider-SDK, Agent, Hermes, MCP, and ambient-network capability additions.

Candidate scans cover production source, public-schema/result fixtures, serialized report evidence,
error taxonomies, source snapshots, and the exact Git diff. They prohibit credential material,
authentication headers, provider bodies, endpoints, machine-local paths, provider-shaped tokens,
raw exception detail, and unrestricted readiness or execution claims. The diff scan is an
operational Task 5 gate because a test must not execute Git or treat a mutable working-tree diff as
runtime authority.

## Preserved Non-Goals

No real credential, secret store, material handoff, authentication header, endpoint, successful
live final pre-send gate, DNS, TLS, socket, HTTP, provider SDK, provider request, production model,
external observability, deployment, release, durable or distributed M20 state, Agent, Hermes, MCP,
UI, or Milestone 21 behavior is included.
