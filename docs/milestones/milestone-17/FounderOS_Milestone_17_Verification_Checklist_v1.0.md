# FounderOS Milestone 17 Verification Checklist v1.0

## Candidate identity

Record repository root, branch, base commit, candidate proof, staged/unstaged/untracked inventory,
and publication state before issuing a readiness decision.

## Acceptance mapping

| Acceptance | Required evidence                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M17-AC-001 | `authorization.test.ts`; schema build and typecheck                                                                                                                                                                                                                                                 |
| M17-AC-002 | deterministic artifact test in `execution-authorization.test.ts`                                                                                                                                                                                                                                    |
| M17-AC-003 | tamper-verification tests                                                                                                                                                                                                                                                                           |
| M17-AC-004 | schema, domain, authority, and harness accessor/shape tests                                                                                                                                                                                                                                         |
| M17-AC-005 | authority factory configuration, exact Service Identity authority-coordinate, fixed processing-tier, and narrow-facade tests                                                                                                                                                                     |
| M17-AC-006 | valid issuance test                                                                                                                                                                                                                                                                                 |
| M17-AC-007 | denied/review-required approval tests plus exact identity-not-active, identity-expired, identity-revoked, and approval-expired non-claimable Decision tests                                                                                                                                         |
| M17-AC-008 | distinct fixture-fingerprint proof plus independent identifier, reference, fingerprint, Service Identity evidence/workload/proof, fixed processing-tier, and rotation-version substitutions with exact reason assertions                                                                             |
| M17-AC-009 | issuance replay and conflicting identity tests                                                                                                                                                                                                                                                      |
| M17-AC-010 | eight-caller concurrent claim test                                                                                                                                                                                                                                                                  |
| M17-AC-011 | exact-attempt mismatch test                                                                                                                                                                                                                                                                         |
| M17-AC-012 | explicit idempotent same-attempt retry plus permanent claim-ID conflict-precedence tests across mutable state                                                                                                                                                                                       |
| M17-AC-013 | six modeled downstream-failure permanence checks                                                                                                                                                                                                                                                    |
| M17-AC-014 | revocation authority, monotonic-version, non-regressing-time, and post-claim chronology tests                                                                                                                                                                                                       |
| M17-AC-015 | post-claim revocation and inspection test                                                                                                                                                                                                                                                           |
| M17-AC-016 | registered Decision/claim verification, pre-claim evaluation rejection, immutability tests, controlled fault normalization for all six public authority operations, and late-claim-fault sequence/ownership atomicity                                                                               |
| M17-AC-017 | disabled harness issuance, permanent claim, pre/post inspection and verification, version N success, stale/equal rejection, N+1 success, claim-preservation, and deterministic status tests                                                                                                         |
| M17-AC-018 | fetch runtime witness, input capability rejection, recursive transitive local/workspace TypeScript import closure, explicit-safe-import plus path/member reflection allowlists, full-source SHA-256 binding for every approved non-static computed access/property name, mutation and stale-member invalidation, Node-subpath/HTTP2/SQLite, variable dynamic import, process alias, bracketed fetch/static loaders, and direct/aliased/indirect/reflective-constructor loader bypass tests including template-expression, concat-built, join-built, static and computed binding/assignment destructuring, callable declaration, assignment, factory return, object membership, array destructuring/indexing, inline/named parameter carriage, inline/named identity-call propagation, conditional/class/built-in callable use, and binding, direct/array/parameter-carried reflection roots, shorthand/renamed/aliased-root reflection-member destructuring, and assignment destructuring |
| M17-AC-019 | full repository gates plus `pnpm verify:m15-predecessor-bound`                                                                                                                                                                                                                                      |
| M17-AC-020 | exact 20-row contract/structural-anchor mapping in `milestone-17-traceability.ts`; facade-export plus exact-test evidence for behavioral rows; actual package-script plus runner-anchor evidence for gate rows; executable TypeScript-AST traceability test; whole-diff review                      |

## Required commands

Run sequentially from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm verify:m15-predecessor-bound
git diff --check
git status --short
git ls-files --others --exclude-standard
```

Record actual exit codes and observed test inventory. Do not copy historical totals.

## Whole-branch review

Review the complete candidate against its exact base for contract strictness, fingerprint
omissions, authority ordering, claim linearization, permanent ownership, revocation, error leakage,
import closure, mutable aliases, scope, documentation truth, and unrelated changes. Remediate every
Critical, Important, and Minor finding and rerun affected gates.

## Decision boundary

The final decision is `GO — M17 COMMIT READY`, `NO-GO — M17 NOT COMMIT READY`, or
`HUMAN DECISION REQUIRED` based on reproduced evidence. Even a clean
review does not authorize commit, push, pull request, merge, deployment, release, credential work,
provider execution, or Milestone 18.
