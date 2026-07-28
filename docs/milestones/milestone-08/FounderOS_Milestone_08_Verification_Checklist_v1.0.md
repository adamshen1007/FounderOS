# FounderOS Milestone 08 Verification Checklist v1.0

## Architecture

-   [ ] Lifecycle separated from query execution.
-   [ ] Repository contracts remain stable.

## Functional

-   [ ] Valid transitions work.
-   [ ] Invalid transitions fail.
-   [ ] Comparison produces deterministic change sets.

## Governance

-   [ ] Approval required.
-   [ ] Provenance preserved.
-   [ ] Historical snapshots traceable.

## Engineering

Run:

``` bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```
