# FounderOS Milestone 04 Verification Checklist v1.0

## Purpose

Define the verification process for Milestone 04 --- Core Vault
Materialization.

------------------------------------------------------------------------

# 1. Repository Verification

Checklist:

-   [ ] Milestone 04 documents exist.
-   [ ] New files follow repository documentation conventions.
-   [ ] No unrelated files are modified.

------------------------------------------------------------------------

# 2. Migration Workflow Verification

Checklist:

-   [ ] Migration manifest can be loaded.
-   [ ] Valid documents migrate successfully.
-   [ ] Invalid documents fail with clear errors.
-   [ ] Migration reports are generated.

------------------------------------------------------------------------

# 3. Data Integrity Verification

Checklist:

-   [ ] Original source documents remain unchanged.
-   [ ] Source hashes are recorded.
-   [ ] Object IDs are unique.
-   [ ] Provenance information is preserved.

------------------------------------------------------------------------

# 4. Determinism Verification

Checklist:

-   [ ] Same input produces identical output.
-   [ ] Document ordering is stable.
-   [ ] Report serialization is deterministic.

------------------------------------------------------------------------

# 5. Safety Verification

Checklist:

-   [ ] Migration cannot access files outside the approved root.
-   [ ] Symbolic link behavior is controlled.
-   [ ] No uncontrolled filesystem mutation occurs.

------------------------------------------------------------------------

# 6. Engineering Verification

Checklist:

-   [ ] Format check passes.
-   [ ] Lint passes.
-   [ ] Build passes.
-   [ ] Tests pass.

Commands:

``` bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

------------------------------------------------------------------------

# Milestone Approval

Milestone 04 can be approved when:

-   Functional requirements are complete.
-   Verification checklist passes.
-   Codex execution report confirms readiness.

## Principle

Verification converts implementation into reliable progress.
