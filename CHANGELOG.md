# Changelog

## 0.5.0

- Add M3 research automation RFC, ADR, and Specification 010.
- Add schemas for research topics, sources, evidence, and classified claims.
- Add `research create`, `add-source`, `validate`, `build`, `status`, and
  `refresh` CLI commands.
- Add deterministic freshness calculations and protected research-brief output.
- Enforce provenance integrity, synthesis diversity, quotation limits, and safe
  repository paths.
- Add a five-source customer-validation research example and cited brief.
- Add 13 research tests and CI research-graph drift checks.
- Add beginner-first research operations documentation.

## 0.4.0

- Add the M2 engineering-kit generator RFC, ADR, specification, and JSON Schema.
- Add `create`, `validate`, `generate`, and `doctor` CLI commands.
- Generate eight standard Markdown project documents from one YAML manifest.
- Protect unowned and user-modified files with deterministic generation hashes.
- Add dry-run, drift-check, and explicit force-replacement behavior.
- Add snapshot, validation, path-safety, idempotency, and overwrite tests.
- Add the AI Launch Copilot example kit and enforce it in CI.
- Add beginner-first generator and regeneration documentation.

## 0.3.0

- Add M1 publishing specifications and ADR-001.
- Add pinned Node and pnpm tooling for Markdown, links, spelling, Vale,
  Mermaid, citation, and artifact checks.
- Publish the sample YC playbook chapter to standalone HTML, EPUB 3, and DOCX.
- Add local preview, clean, and output-verification commands.
- Add GitHub Actions quality and artifact-build jobs.
- Add local development and publishing troubleshooting guides.
- Replace the sample chapter's source placeholder with traceable YC sources.
- Normalize existing Markdown files to pass the repository quality gate.

## 0.2.0

- Flatten the publishing engineering kit into the canonical repository root.
- Move strategy, architecture, engine, and orchestration documents into the
  root `docs/` and `specs/` hierarchy.
- Merge duplicate constitutions and foundational ADRs into single canonical
  records.
- Standardize delivery naming on milestones M0 through M5.
- Add the root project guide, contribution guide, security policy, license,
  ignore rules, and specification-number registry.
- Add the missing FounderOS Vale style configuration.

## 0.1.0

- Initial FounderOS Publishing Platform engineering kit.
