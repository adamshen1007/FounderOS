# FounderOS Milestone 06 Verification Checklist v1.0

## Architecture

-   [ ] Repository boundary exists.
-   [ ] Query engine remains storage-independent.
-   [ ] Candidate sources are replaceable.

## Functional

-   [ ] Objects retrieved through repository.
-   [ ] Query filtering works.
-   [ ] Provenance preserved.

## Regression

-   [ ] Migration tests pass.
-   [ ] Query tests pass.
-   [ ] Repository tests pass.

## Commands

``` bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```
