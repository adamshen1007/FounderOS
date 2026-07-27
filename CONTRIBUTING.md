# Contributing to FounderOS

FounderOS follows specification-first, verification-driven development.

1. Read the applicable governance, architecture, and engineering specifications.
2. Define the responsibility, contract, acceptance criteria, and non-goals before implementation.
3. Keep dependencies directed from applications to services to shared packages.
4. Record consequential technical decisions in `ARCHITECTURE_DECISIONS.md` or a dedicated ADR.
5. Add tests and update documentation with every material change.
6. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, and `chore:`. Never commit credentials, tokens, private URLs, or sensitive founder knowledge.
