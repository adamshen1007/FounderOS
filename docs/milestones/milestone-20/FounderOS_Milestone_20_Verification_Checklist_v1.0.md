# FounderOS Milestone 20 Verification Checklist v1.0

## Documentation Candidate

- [ ] Record base, branch, tracked changes, staged changes, and all untracked files.
- [ ] Record SHA-256 for every changed documentation file and one canonical candidate manifest.
- [ ] Confirm the candidate changes only approved M20 Markdown and necessary documentation indexes.
- [ ] Confirm M16 sequencing and M17–M19 accepted boundaries are cited consistently.
- [ ] Confirm ADR-0024 remains `Proposed` until the documentation package is accepted and merged.
- [ ] Confirm no document claims implementation, provider conformance, final-gate authority,
      production readiness, or live-execution authorization.
- [ ] Confirm all local Markdown links resolve and no placeholder, TODO, draft ambiguity, personal
      data, credential-shaped text, or machine-specific path exists in candidate content.
- [ ] Confirm the contract catalog closes every public key, bound, discriminant, fingerprint
      domain, terminal grammar, assertion status, and verifier result.

## Future Focused Proofs

- [ ] Shared-contract tests cover every strict schema, enum, discriminant, bound, and fingerprint.
- [ ] Conductor tests prove exact gate order, protected-boundary zero-call behavior, and permanent
      run identity semantics.
- [ ] Success tests traverse actual public M17 issuance/claim and M19 preparation with its captured
      M18 resolution path, ending at exact-coordinate-bound `disabled-by-policy` and
      `dry-run-verified` without claiming private M19 observations.
- [ ] Every runtime fault family, separate report-verifier mutation, and required multi-fault
      precedence pair executes without invoking a network global.
- [ ] Final-control rehearsal covers all 12 ordered denial rows and cannot be accepted as authority.
- [ ] Fresh-conductor byte equality, exact replay, conflict, concurrency, report tamper, and source
      immutability proofs pass; source evidence remains outside conductor reports.
- [ ] Report counts bind only the original owner execution; separate test witnesses prove exact
      replay and concurrent-follower call deltas are all zero.
- [ ] Authority-bound conductor checks and pure structural report verification are tested and
      reported as distinct proofs.
- [ ] Isolated M19 fixture mapping remains a separate test-only regression matrix distinct from the
      runtime catalog and dry-run attempt evidence.

## Structural Security

- [ ] TypeScript-aware transitive closure covers every new production module.
- [ ] Package manifests add no transport-capable runtime dependency.
- [ ] Adversarial aliases, computed access, destructuring, reflection, loader, dynamic-code,
      environment, filesystem, credential, provider-SDK, Agent, Hermes, and MCP probes reject.
- [ ] Ambient `fetch`, `XMLHttpRequest`, `WebSocket`, and every other available network witness
      are wrapped before dependency construction and record exactly zero attempted calls across
      runtime scenarios and verifier-negative tests; the conductor's captured monotonic witness
      supplies the observed report delta, and nonzero report-count cases are mutated data supplied
      only to the report verifier.
- [ ] Secret, header, endpoint, path, provider-body, and unrestricted-error scans are clean.

## Repository Gates

Run in order on the exact future implementation candidate:

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

- [ ] Record every exit status and exact test inventory truthfully.
- [ ] Distinguish unrelated preserved untracked files from the candidate manifest.
- [ ] Do not infer a pass from earlier CI, a partial suite, or a previous candidate hash.

## Independent Review

- [ ] An independent read-only reviewer examines the complete exact candidate against M16–M20,
      every acceptance criterion, package direction, threat boundary, and explicit non-goal.
- [ ] Terminal GO requires Critical 0, Important 0, Minor 0.
- [ ] Any remediation creates a new candidate identity and repeats affected gates and independent
      whole-candidate review.

## Authorization Boundaries

- [ ] Documentation review does not authorize implementation.
- [ ] Human acceptance of the specification does not authorize commit, push, pull request, merge,
      credential operation, provider configuration, deployment, release, or live execution.
- [ ] Implementation acceptance does not authorize a later live-execution milestone.
