# Continuous Integration

The canonical M1 workflow is `.github/workflows/publishing.yml`.

For pull requests and pushes to `main`, it:

1. Installs the pinned Node and pnpm versions.
2. Installs Pandoc and Vale.
3. Runs `pnpm install --frozen-lockfile`.
4. Runs every quality gate through `pnpm check`.
5. Builds HTML, EPUB, and DOCX after quality passes.
6. Uploads the verified outputs as a 14-day workflow artifact.

CI uses the same public commands as local development.
