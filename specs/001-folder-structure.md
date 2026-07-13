# Folder Structure Specification

## Rule

The repository must preserve separation between governance, documentation,
specifications, source content, research, prompts, automation, and publishing
outputs.

The canonical root-level directories are defined in the
[repository structure guide](../docs/01-architecture/repository-structure.md).

## Constraints

- The repository has one project root and one root README.
- The root `CONSTITUTION.md` is the only canonical constitution.
- ADRs and RFCs live under `governance/`.
- Implementation contracts live under `specs/`.
- Human-readable strategy and operating guidance live under `docs/`.
- Generated outputs live in ignored output directories and are never treated
  as canonical sources.
- A structural change that affects multiple domains requires an RFC; an
  accepted architecture change requires an ADR.
