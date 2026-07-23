# FounderOS Research-to-Book Publishing Design

**Status:** Approved design  
**Date:** 2026-07-23  
**Initial reference publication:** The FounderOS Playbook for AI Founders

## 1. Purpose

FounderOS will become a reusable research-to-book publishing application. It
will help one creator research a defined topic, organize traceable evidence,
compose and enrich a beta book, review that beta in Notion, and publish an
approved edition as HTML, PDF, and EPUB to a private subscriber library.

The existing YC Playbook is the migration reference, not a hard-coded product
type. The same workflow must support future books about consulting methods,
industries, technologies, or other bounded topics without introducing
topic-specific application logic.

## 2. Product Decisions

The approved product decisions are:

- Use a governed hybrid research model. Creator-approved sources are primary;
  wider search may propose additional sources for approval.
- Support web pages, PDFs, Markdown, text documents, YouTube videos, and
  podcasts in the initial product.
- Use transcripts with locators and timestamps for audio and video evidence.
- Use evidence-first visuals: traceable charts, editable diagrams, labeled AI
  illustrations, and external media with recorded reuse rights.
- Run the Creator Studio privately and locally.
- Deploy only approved release artifacts to a hosted subscriber library.
- Manage initial subscriber access through a manual email allowlist.
- Use a provider-neutral AI interface with OpenAI as the first provider.
- Store Editorial Memory in global, series, and book layers.
- Import Notion edits and comments as proposals rather than canonical changes.
- Require explicit human approval for every final publication.
- Migrate the YC Playbook first, then create a short second pilot book
  end-to-end.

## 3. Architectural Direction

FounderOS will use a governed pipeline with bounded AI workers. Deterministic
workflow state, evidence relationships, review gates, and release manifests are
owned by FounderOS. AI providers, skills, and MCP integrations operate inside
individual stages but cannot bypass those controls.

```text
Book brief
  -> governed hybrid research
  -> evidence and claim graph
  -> approved book architecture
  -> evidence-grounded composition
  -> evidence-first visual enrichment
  -> automated quality review
  -> Notion beta review
  -> reconciled canonical Markdown
  -> human publication approval
  -> HTML + PDF + EPUB
  -> private subscriber library
```

This architecture extends the repository's existing research records, governed
agents, Markdown source model, quality gates, Notion-derived review workspace,
and publishing pipeline. It does not replace them with an opaque agent system.

## 4. Product Boundary

### 4.1 Local Creator Studio

The private Creator Studio contains:

- Book Projects and reusable Book Blueprints
- Research Workspace
- Evidence and Claim Graph
- Book Planner
- Editorial Memory
- Composition Pipeline
- Visual Studio
- Quality Center
- Notion Review Bridge
- Publication Console

Canonical Markdown, structured evidence, local workflow state, credentials,
research archives, drafts, rejected proposals, and Editorial Memory remain
local.

### 4.2 Hosted Subscriber Library

The hosted library contains:

- Manual email allowlist
- Passwordless subscriber authentication
- Book and edition pages
- Responsive HTML reader
- Search within a book
- Protected PDF and EPUB downloads
- Release metadata and optional edition history
- Minimal access and operational analytics

Only approved release artifacts, book metadata, subscriber email addresses,
authentication state, and minimal operational records may leave the local
environment.

### 4.3 Integration Boundaries

Notion is a review surface, not the canonical database. The hosted library is a
distribution surface, not an authoring environment. AI and media providers are
replaceable adapters, not owners of project state.

## 5. Reusable Book Model

Each Book Project has a portable directory containing its configuration,
Markdown, structured research records, assets, review history, and release
metadata. A project can be backed up, versioned, reopened without a hosted
service, and regenerated with another supported provider.

A Book Blueprint defines:

- Working title, series, and edition
- Target subscribers and reader outcome
- Topic, thesis, scope, and counterarguments
- Research questions
- Trusted, proposed, and excluded sources
- Freshness and evidence requirements
- Parts, chapter contracts, and reader journey
- Editorial Memory layers
- Visual policy and design theme
- Citation, attribution, brand, and rights rules
- Notion destination
- Release formats and subscriber visibility

Organizations such as YC, McKinsey, or Bain may be research subjects or source
families. FounderOS must not imply their endorsement, reproduce protected
publications, or imitate their visual identities.

## 6. Evidence and Provenance

The core provenance chain is:

```text
Source
  -> evidence excerpt, datum, or observation
  -> supported claim
  -> synthesis or contradiction
  -> chapter section
  -> visual
  -> published citation
```

Every externally verifiable statement must resolve to evidence. Evidence from
audio and video includes a timestamp. Charts additionally record source data,
transformations, labels, and citations. Generated images record their provider,
model, prompt reference, generation time, usage status, and required disclosure.

Wider web search may discover sources, but discovered sources remain proposed
until approved. Search results and raw model output cannot directly become
canonical claims or publication text.

## 7. Editorial Memory and Progressive Autonomy

Editorial Memory is explicit, inspectable, editable, and reversible:

```text
Global creator profile
└── Series profile
    └── Book profile
```

Each learned rule records:

- Original proposal
- Accepted revision or rejection
- Creator rationale
- Applicable layer and scope
- Confidence and supporting examples
- Provider and model context
- Creation and update dates
- Active or disabled state

The initial workflow is guided. FounderOS records decisions while the creator
approves research plans, sources, outlines, drafts, and visuals. It may later
advance individual decisions to supervised or automatic-beta behavior when
explicit confidence criteria are satisfied. Autonomy changes are visible and
reversible. FounderOS never silently promotes a rule or publishes a release.

The highest supported autonomy level generates a complete beta and sends it to
review. Final publication always requires a human Publish action.

## 8. Book Lifecycle

1. **Brief:** Define audience, outcome, thesis, scope, series, source policy,
   visual policy, and release formats.
2. **Research Plan:** Propose questions, source boundaries, methods, and
   evidence thresholds for approval.
3. **Evidence Collection:** Normalize approved sources, transcripts, evidence,
   claims, contradictions, and freshness.
4. **Book Architecture:** Propose the argument, reader journey, parts, chapters,
   objectives, and chapter contracts.
5. **Composition:** Draft chapters from approved claims and contracts rather
   than directly from unstructured search results.
6. **Enrichment:** Recommend and generate visuals based on communicative
   purpose and provenance requirements.
7. **Quality Review:** Run evidence, citation, structure, editorial,
   accessibility, rights, brand, link, and output checks.
8. **Notion Beta:** Export the complete beta to Notion for human review.
9. **Reconciliation:** Import Notion edits and comments as proposed changes.
10. **Release Approval:** Resolve blockers and require a human Publish action.
11. **Distribution:** Build, verify, stage, and activate HTML, PDF, and EPUB in
    the private subscriber library.

## 9. Creator Studio Experience

The local application has these primary screens:

1. **Library:** Projects, editions, stages, review state, and release history.
2. **New Book Wizard:** Brief, audience, source policy, series, and seed
   materials.
3. **Research Desk:** Sources, transcripts, evidence, claims, contradictions,
   freshness, and approvals.
4. **Outline Builder:** Reader journey, parts, chapters, objectives, evidence
   coverage, and gaps.
5. **Chapter Studio:** Manuscript, sources, AI proposals, Editorial Memory, and
   chapter checks.
6. **Visual Studio:** Charts, diagrams, images, provenance, editability, and
   accessibility text.
7. **Beta Review:** Notion export, synchronization state, conflicts, and
   imported proposals.
8. **Release Center:** Blocking gates, artifact previews, release notes,
   subscriber visibility, and Publish.

Notion reconciliation presents original Markdown, the Notion proposal, and the
result of acceptance side by side. The creator can accept, revise, reject, or
defer a proposal. Accepted changes update canonical Markdown and rerun affected
checks. If live Notion content changed after the last read, synchronization
pauses and preserves both versions.

## 10. Publication and Subscriber Experience

Publish performs a dry run before activation:

1. Revalidate research and manuscript integrity.
2. Rebuild and validate visuals.
3. Generate HTML, PDF, and EPUB.
4. Verify content, structure, metadata, accessibility, and file integrity.
5. Create an immutable release manifest.
6. Upload into a staged hosted release.
7. Verify hosted artifacts and access controls.
8. Atomically activate the new edition.

A failed stage leaves the previous edition active. Unpublishing removes an
edition from subscriber visibility without deleting its local canonical source.
Protected downloads use authenticated, short-lived access rather than permanent
public file URLs.

The initial hosted roles are owner and subscriber. Billing, public
registration, teams, subscriber self-service, comments, and social features are
outside the initial scope.

## 11. Quality Gates

Publication is blocked by:

- Unsupported externally verifiable claims
- Broken evidence or citation relationships
- Unresolved high-severity contradictions
- Missing visual or source provenance
- Unresolved rights or brand-risk findings
- Missing accessibility descriptions for meaningful visuals
- Unresolved Notion proposals designated as blocking
- Failed HTML, PDF, or EPUB generation
- Release packages that differ from their verified manifests
- Failed subscriber authorization or staged-release verification

Style suggestions, optional visual improvements, and low-severity editorial
findings remain non-blocking unless the creator promotes them.

## 12. Failure and Recovery

Every workflow stage records its inputs, outputs, provider, model, prompt
version, status, and verification result. Work resumes from the last valid
checkpoint.

- Search or model failure retries within a bounded policy, then pauses with a
  recovery action.
- A missing source retains captured metadata and creates a freshness risk.
- A Notion conflict preserves both versions and creates a proposal.
- An optional visual failure leaves the chapter publishable only when no
  required information is lost.
- A hosting failure leaves the previous release active.
- A provider change invalidates and reruns only provider-dependent artifacts.
- An interrupted workflow must be safe to restart without duplicating records
  or corrupting state.

## 13. Testing Strategy

Required test layers are:

- Unit tests for schemas, transformations, state transitions, and policy rules
- Contract tests for AI, search, media, Notion, and hosting adapters
- Golden examples for research-to-outline and evidence-to-chapter generation
- Citation, evidence, contradiction, and freshness integrity tests
- Visual provenance, chart-data, and accessibility tests
- End-to-end local publication tests for all three formats
- Subscriber authentication and authorization tests
- Staged release, activation, unpublish, and rollback tests
- Provider failure, synchronization conflict, and interrupted workflow tests

The migrated YC Playbook proves backward compatibility and preserves its
approved content. A short second pilot proves genuine multimodal research,
planning, composition, Editorial Memory, visual enrichment, Notion
reconciliation, publication, and subscriber delivery.

## 14. Delivery Stages

### Stage A — Product Foundation and YC Migration

Introduce Book Projects and Blueprints, refocus product language, migrate the
existing YC Playbook, and preserve current publishing behavior.

### Stage B — Multimodal Research Desk

Implement supported-source ingestion, governed hybrid search, source approval,
transcripts, evidence, claims, contradictions, and freshness.

### Stage C — Book Planning and Composition

Implement research plans, outlines, chapter contracts, evidence-grounded
drafting, and the provider-neutral AI interface with OpenAI first.

### Stage D — Editorial Memory and Progressive Autonomy

Implement layered memory, decision capture, inspectable rules, confidence
policies, and guided, supervised, and automatic-beta modes.

### Stage E — Evidence-First Visual Studio

Implement traceable charts, editable diagrams, rights-aware media, labeled AI
illustrations, accessibility descriptions, and visual gates.

### Stage F — Notion Beta Review

Implement controlled beta export, edit and comment import, comparisons,
conflict detection, and canonical reconciliation.

### Stage G — Publication and Subscriber Library

Implement final approval, HTML/PDF/EPUB releases, email-allowlisted access,
protected downloads, rollback, edition management, and the short second pilot.

## 15. Success Criteria

The upgraded system is successful when:

1. The existing YC Playbook is represented as a reusable Book Project without
   material publication regression.
2. A short second book is created from approved multimodal research through the
   complete workflow.
3. Every material claim and meaningful visual has traceable provenance.
4. Notion review produces reconcilable proposals without overwriting canonical
   Markdown or human edits.
5. A human-approved release produces verified HTML, PDF, and EPUB artifacts.
6. Allowlisted subscribers can read HTML and securely download PDF and EPUB.
7. A failed publication never replaces the last valid hosted edition.
8. Editorial Memory visibly improves proposals while remaining inspectable and
   reversible.

## 16. Non-Goals for the Initial Release

- Native payments or subscription billing
- Public account registration
- Multi-creator teams and permissions
- Fully autonomous final publication
- Opaque fine-tuning on creator decisions
- Topic-specific generators
- Mobile applications
- Social reading, comments, or community features
- Public marketplaces for books, prompts, or templates
