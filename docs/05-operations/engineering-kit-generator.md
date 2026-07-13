# Engineering Kit Generator

## What It Does

The FounderOS generator turns one small YAML manifest into a consistent starter
kit. It creates Markdown for strategy, product requirements, architecture,
milestones, verification, and changes. It does not invent research evidence or
approve product decisions.

## Before You Start

Complete the repository setup in [local development](local-development.md),
then check the generator:

```bash
pnpm founderos doctor
```

## Create Your First Project

Run this command from the FounderOS repository root and replace the example
values:

```bash
pnpm founderos create customer-interview-copilot \
  --name "Customer Interview Copilot" \
  --description "A workspace for planning and reviewing customer interviews." \
  --owner "Your Name" \
  --audience "Early-stage founders conducting customer discovery" \
  --problem "Founders lose important evidence across inconsistent interview notes"
```

This creates `projects/customer-interview-copilot/` with:

```text
founderos.project.yaml
README.md
CHANGELOG.md
docs/strategy/
governance/ADR/
planning/
.founderos/generation-state.json
```

The YAML manifest is yours to edit. The generated Markdown begins with an
ownership marker. The state file contains only content hashes used to detect
human changes.

## Validate Before Generating

```bash
pnpm founderos validate projects/customer-interview-copilot/founderos.project.yaml
```

Validation checks required values, the project slug, supported stage, template,
and output path. It writes nothing.

## Preview Regeneration

After changing the manifest, preview the plan:

```bash
pnpm founderos generate \
  projects/customer-interview-copilot/founderos.project.yaml \
  --dry-run
```

Then apply it:

```bash
pnpm founderos generate projects/customer-interview-copilot/founderos.project.yaml
```

Actions are reported as `create`, `update`, `replace`, or `unchanged`.

## Understand Conflict Protection

If you edit a generated document, FounderOS treats it as human-owned work and
stops. Review the changed file and choose one of these approaches:

1. Preserve the human change by moving it into the manifest or a user-owned
   document, then reconcile the generated file deliberately.
2. Keep the generated file unchanged and continue working without regeneration.
3. Replace the change only after review by adding `--force`.

```bash
pnpm founderos generate projects/customer-interview-copilot/founderos.project.yaml --force
```

`--force` replaces every conflicting standard output. Commit or back up valuable
work before using it.

## CI Drift Check

The committed example uses:

```bash
pnpm check:example
```

This command exits with status 1 if templates, the manifest, or generated files
are out of sync. `pnpm check` includes the same check.

## Command Reference

```text
pnpm founderos create <slug> [options]
pnpm founderos validate [manifest]
pnpm founderos generate [manifest] [--dry-run] [--check] [--force]
pnpm founderos doctor
```

Run `pnpm founderos --help` for create options and supported product stages.
