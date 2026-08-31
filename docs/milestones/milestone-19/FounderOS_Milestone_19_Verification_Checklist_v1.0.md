# FounderOS Milestone 19 Verification Checklist v1.0

## Candidate Inventory

- [ ] Base, head, branch, tracked changes, staged changes, and untracked files are recorded.
- [ ] M18 merge `12f5c768a832cd4b12effb6b8dd70bccd8a8e0cd` is the minimum candidate base.
- [ ] Changed paths contain only the approved M19 package, required implementation, tests, package
      wiring, and truthful current-state documentation.
- [ ] No credential-shaped fixture, personal data, machine path, or unrelated work exists.

## Focused Proofs

- [ ] Shared-contract tests record expected RED and final GREEN.
- [ ] Knowledge Engine authority-ordering and zero-adapter-call tests pass.
- [ ] Integration request-plan, fixture-mapping, disabled-facade, and no-network tests pass.
- [ ] Exact replay, conflict precedence, immutability, and deterministic-byte proofs pass.
- [ ] Response taxonomy coverage is exact and has no generic fallback.
- [ ] Exact model-policy authority, instruction bytes, input projection, cache posture, and
      M14-versus-M19 policy bindings reproduce independently.
- [ ] Concurrent exact identity returns only the ephemeral non-mutating
      `preparation_in_progress` observation; conflict never mutates the owner; every owner terminal
      result remains permanently replayable without protected-boundary calls.
- [ ] Durable M15/M14 reconstruction and the fresh complete current-control snapshot are separately
      verified at one explicit time before mapping.
- [ ] Callers cannot supply M18 result evidence or replace the factory-captured orchestrator.
- [ ] Character, UTF-8 byte, and token limits are counted and compared only within the same unit.
- [ ] Every rejected preparation maps by fixed precedence to exactly one closed reason code.
- [ ] M17 input/output byte and token ceilings plus M14 request/response byte ceilings are all
      bound, enforced, and independently reproduced, including multibyte fixtures.
- [ ] Missing, duplicate, reordered, renamed, extra, empty, and wrong-level memo sections reject;
      only the exact eight ordered non-empty level-two headings can map successfully.
- [ ] Multi-fault fixture cases prove the exact first-applicable response precedence, including
      tool-plus-oversize, refusal-with-content, and oversize-plus-invalid-usage.
- [ ] Documentation traceability maps every acceptance row to exact anchors and test names.

## Structural Security

- [ ] TypeScript-aware transitive production closure includes every M19 production module.
- [ ] Adversarial aliases, computed access, destructuring, reflection, and loader probes reject.
- [ ] Package manifests contain no transport-capable runtime dependency.
- [ ] Ambient `fetch`, `XMLHttpRequest`, WebSocket, and other available network witnesses record
      exactly zero calls.
- [ ] Secret, header, endpoint-override, provider-SDK, and credential scans are clean.

## Repository Gates

Run in order:

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

- [ ] Every exit status and exact test inventory is recorded truthfully.
- [ ] No passed check is inferred from an earlier commit or partial suite.

## Independent Review

- [ ] Record exact candidate identity and hash every changed file plus the canonical manifest.
- [ ] Independent read-only review covers the whole candidate, every acceptance row, threat
      boundary, dependency direction, and explicit non-goal.
- [ ] Terminal GO requires Critical 0, Important 0, Minor 0.
- [ ] Any remediation produces a new candidate identity and repeats all affected gates and the
      whole-candidate review.

## Authorization Boundary

- [ ] No green gate or review result authorizes commit, push, pull request, merge, credential
      operation, provider call, deployment, release, or Milestone 20.
