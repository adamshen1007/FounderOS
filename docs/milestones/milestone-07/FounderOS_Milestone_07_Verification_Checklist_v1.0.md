# FounderOS Milestone 07 Verification Checklist v1.0

## Architecture Verification

- [ ] Corpus source uses repository boundary.
- [ ] Query engine remains storage independent.
- [ ] Snapshot model is immutable.

## Functional Verification

- [ ] Corpus loads successfully.
- [ ] Provenance is preserved.
- [ ] Results remain deterministic.

## Change Detection Verification

- [ ] Snapshot identity is stable.
- [ ] Source changes are detectable.
- [ ] Invalid corpus states fail safely.

## Engineering Verification

Run:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```
