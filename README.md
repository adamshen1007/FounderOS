# FounderOS

FounderOS is a documentation-first foundation for building an AI-native
founder operating system. It is designed to turn reusable knowledge,
governance, research, engineering practices, and publishing workflows into a
compounding operating system for founders.

The repository is currently in **Milestone 0 (M0): Strategy and Governance**.
It contains the canonical strategy, architecture, engine specifications,
governance records, publishing templates, and an initial Founder Library
sample. It is not yet a deployable application.

## Core Principles

- Git and Markdown are the source of truth.
- Documentation comes before implementation.
- Work is delivered in small, verifiable milestones.
- Research and externally verifiable claims require traceable sources.
- Derived formats such as Notion pages, websites, PDF, EPUB, and DOCX are
  publishing outputs.
- Strategic and architectural decisions require human approval.

The complete governance rules are defined in [CONSTITUTION.md](CONSTITUTION.md).

## Start Here

Clone the repository:

```bash
git clone https://github.com/adamshen1007/FounderOS.git
cd FounderOS
```

Then read these documents in order:

1. [Vision and manifesto](docs/strategy/vision-manifesto.md)
2. [Product requirements](docs/strategy/product-requirements.md)
3. [Roadmap](ROADMAP.md)
4. [System overview](docs/01-architecture/system-overview.md)
5. [Domain architecture](docs/01-architecture/domain-architecture.md)
6. [Capability architecture](docs/01-architecture/capability-architecture.md)
7. [Master specification](specs/000-master-spec.md)

No dependency installation or local deployment is required in M0. Markdown
files can be read directly on GitHub or in an editor such as VS Code or
Obsidian.

If [Vale](https://vale.sh/) is installed, check the writing rules locally with:

```bash
vale .
```

The planned M1 workflow will add repeatable `check`, `build`, and `preview`
commands for the publishing pipeline.

## Canonical Repository Structure

```text
FounderOS/
├── governance/     # ADRs, RFCs, and policies
├── docs/           # Strategy, architecture, and operating guides
├── specs/          # Implementation contracts and engine specifications
├── templates/      # Reusable document and project templates
├── prompts/        # Reusable AI-assisted workflows
├── books/          # Canonical Founder Library source content
├── research/       # Raw and processed research
├── diagrams/       # Diagram sources and standards
├── publishing/     # Publishing pipeline configuration
├── automation/     # Reproducible automation
└── ci/             # Quality and continuous-integration configuration
```

The root [CONSTITUTION.md](CONSTITUTION.md) is the only canonical constitution.
Accepted architecture decisions live under [`governance/ADR`](governance/ADR),
and implementation contracts live under [`specs`](specs).

## Current Milestone

M0 establishes the strategy, governance, architecture, and repository
foundation. The next milestone, M1, will implement the smallest useful
publishing path:

```text
Markdown change
  -> quality checks
  -> publishing export
  -> release artifact
```

See [ROADMAP.md](ROADMAP.md) for the complete milestone sequence and exit
criteria.

## Contributing and Security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report
security issues according to [SECURITY.md](SECURITY.md), not in a public issue.

## License

Copyright is reserved while FounderOS validates which components should become
open source. See [LICENSE](LICENSE) for the current terms.
