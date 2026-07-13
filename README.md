# FounderOS

FounderOS is a documentation-first foundation for building an AI-native
founder operating system. It is designed to turn reusable knowledge,
governance, research, engineering practices, and publishing workflows into a
compounding operating system for founders.

The repository has completed **Milestone 2 (M2): Engineering Kit Generator**. It
contains the canonical strategy, architecture, engine specifications,
governance records, publishing templates, an initial Founder Library sample,
the local and CI publishing pipeline, and a deterministic project-kit CLI. It
is not yet a SaaS application.

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

Install dependencies and run the complete quality suite:

```bash
pnpm install
pnpm check
```

Build and preview the sample book:

```bash
pnpm build
pnpm preview
```

Create an engineering kit for a new project:

```bash
pnpm founderos create my-project \
  --name "My Project" \
  --description "A focused description of the project." \
  --owner "Your Name" \
  --audience "The people you intend to help" \
  --problem "The concrete problem they experience"
```

See the [engineering-kit generator guide](docs/05-operations/engineering-kit-generator.md)
before regenerating or forcing replacement.

The preview is available at <http://127.0.0.1:4173>. See the
[local development guide](docs/05-operations/local-development.md) for system
prerequisites and individual commands.

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
├── examples/       # Committed end-to-end reference projects
├── schemas/        # Machine-readable input contracts
├── scripts/        # Publishing and generator implementation
└── ci/             # Quality and continuous-integration configuration
```

The root [CONSTITUTION.md](CONSTITUTION.md) is the only canonical constitution.
Accepted architecture decisions live under [`governance/ADR`](governance/ADR),
and implementation contracts live under [`specs`](specs).

## Current Milestone

M0 established the repository foundation, M1 implemented the publishing path,
and M2 implements deterministic engineering-kit generation:

```text
founderos.project.yaml
  -> schema and path validation
  -> deterministic Markdown kit
  -> protected regeneration
```

See [ROADMAP.md](ROADMAP.md) for the complete milestone sequence. The next
development focus is M3 — Research Automation.

## Contributing and Security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change. Report
security issues according to [SECURITY.md](SECURITY.md), not in a public issue.

## License

Copyright is reserved while FounderOS validates which components should become
open source. See [LICENSE](LICENSE) for the current terms.
