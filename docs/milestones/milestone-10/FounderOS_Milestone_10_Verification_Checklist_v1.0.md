# FounderOS Milestone 10 Verification Checklist v1.0

## Repository Preconditions

- [ ] Milestone 09 is merged into `main`.
- [ ] The Milestone 10 branch is based on current `main`.
- [ ] The worktree contains no unrelated changes.

## Contract Verification

- [ ] Request and package schemas validate strictly.
- [ ] Unknown fields and unsupported versions are rejected.
- [ ] Model and storage concepts do not leak into shared contracts.

## Snapshot Binding Verification

- [ ] Registry integrity is verified before assembly.
- [ ] Active snapshot is durably recovered.
- [ ] Repository snapshot matches active evidence.
- [ ] Later activation cannot alter an in-progress assembly.
- [ ] Missing or invalid active state fails closed.

## Selection Verification

- [ ] Existing filters remain compatible.
- [ ] Required IDs and types are enforced.
- [ ] Stable ordering survives candidate permutations.
- [ ] Equivalent duplicates are safely deduplicated.
- [ ] Conflicting duplicates fail.
- [ ] Empty and insufficient outcomes follow explicit policy.

## Budget Verification

- [ ] Object and character limits are enforced.
- [ ] Per-object limits are enforced when enabled.
- [ ] Required objects are never silently removed.
- [ ] Truncation is deterministic and opt-in.
- [ ] Omitted and over-budget evidence is complete.

## Evidence and Reproducibility Verification

- [ ] Provenance and hashes verify.
- [ ] Exclusion, omission, and truncation reason codes are stable.
- [ ] Canonical serialization is byte stable.
- [ ] Context fingerprint independently recomputes.
- [ ] Wall-clock time does not alter identity.
- [ ] Tampering is detected.
- [ ] Evidence counts and budget arithmetic verify.
- [ ] Physical paths are not leaked.

## Regression Verification

- [ ] All Milestone 04–09 tests remain green.
- [ ] New Milestone 10 tests pass.

## Required Commands

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
git diff --check
```

## Approval Rule

Milestone 10 is `GO` only when context packages are governed, deterministic, budget compliant, provenance complete, independently verifiable, and compatible with all prior milestones.
