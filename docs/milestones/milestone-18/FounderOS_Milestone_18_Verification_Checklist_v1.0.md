# FounderOS Milestone 18 Verification Checklist v1.0

## Candidate Inventory

- [ ] Candidate base and head are recorded.
- [ ] Tracked and untracked files are enumerated.
- [ ] The M18 change contains no unrelated work or credential-shaped material.
- [ ] Pull request #18 baseline closure is accounted for without being duplicated or altered.

## Focused Proofs

- [ ] Shared contract tests pass after recorded RED failures.
- [ ] Knowledge Engine orchestration tests pass after recorded RED failures.
- [ ] Infrastructure resolver tests pass after recorded RED failures.
- [ ] Composition, structural closure, runtime witness, and documentation traceability tests pass.
- [ ] Exact replay performs no second materialization.
- [ ] Every preflight rejection performs zero resolver calls.
- [ ] Fault paths attempt complete owned-buffer overwrite and expose no material.

## Repository Gates

Run in this order:

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

- [ ] Every command and actual exit status is recorded.
- [ ] Exact file and test totals are recorded from the candidate.
- [ ] Secret-pattern and prohibited-capability scans are clean.
- [ ] A whole-branch review reports no unresolved Critical, Important, or Minor finding.

## Authorization Boundary

- [ ] No commit, push, pull request, merge, deployment, release, real credential operation,
  provider execution, or Milestone 19 action is inferred from green verification.
