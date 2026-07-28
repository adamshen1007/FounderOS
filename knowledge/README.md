# FounderOS Core knowledge corpus

This directory defines the logical KnowledgeOS corpus controlled by Milestone 04. The canonical source documents remain under `docs/` and are never rewritten or duplicated here.

`migration-manifest.yaml` binds every approved Priority 1 object to:

- its canonical source document;
- its expected SHA-256 source digest;
- its logical destination under `knowledge/governance/` or `knowledge/architecture/`;
- schema-valid metadata;
- migration and human-review status.

Run the controlled migration from the repository root:

```bash
pnpm knowledge:migrate
```

The command validates and materializes canonical KnowledgeOS objects in `migration-report.json`. The report is deterministic and ignored by Git. No database, index, source mutation, or persistent runtime is introduced.
