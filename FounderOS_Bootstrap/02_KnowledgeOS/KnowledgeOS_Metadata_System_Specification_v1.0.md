# KnowledgeOS Metadata System Specification v1.0

## Document Status

Version: v1.0\
Layer: KnowledgeOS Official Specification

## 1. Purpose

Metadata is the intelligence layer that allows KnowledgeOS to
understand:

-   what information exists
-   where it belongs
-   how important it is
-   how reliable it is
-   how it connects to other knowledge

Without metadata:

    Knowledge = Documents

With metadata:

    Knowledge = Structured Intelligence

------------------------------------------------------------------------

# 2. Metadata Design Principles

## Principle 1 --- Metadata Must Serve Retrieval

Metadata exists to improve:

-   search
-   reasoning
-   context assembly
-   decision support

Metadata should have operational value.

------------------------------------------------------------------------

## Principle 2 --- Human-Friendly and AI-Friendly

Metadata must be:

-   readable by humans
-   interpretable by AI
-   consistent across projects

------------------------------------------------------------------------

## Principle 3 --- Metadata Must Evolve

The metadata system should support future FounderOS capabilities without
requiring redesign.

------------------------------------------------------------------------

# 3. Metadata Architecture

Each Knowledge Object contains:

    Knowledge Object

    ↓

    Metadata Layer

    ↓

    Identity
    Classification
    Context
    Quality
    Lifecycle
    Relationships

------------------------------------------------------------------------

# 4. Core Metadata Schema

``` yaml
metadata:

id:

title:

object_type:

domain:

category:

source:

author:

created_at:

updated_at:

status:

confidence:

importance:

tags:

relationships:
```

------------------------------------------------------------------------

# 5. Metadata Categories

## 5.1 Identity Metadata

Purpose:

Identify the knowledge object.

Fields:

``` yaml
id:

title:

object_type:

created_at:

updated_at:
```

Example:

``` yaml
title:
"FounderOS Architecture Decision"

object_type:
decision
```

------------------------------------------------------------------------

## 5.2 Classification Metadata

Purpose:

Understand knowledge location and meaning.

Fields:

``` yaml
domain:

category:

sub_category:

tags:
```

Example:

``` yaml
domain:
AI Agents

category:
Agent Architecture

tags:
- LLM
- MCP
- Automation
```

------------------------------------------------------------------------

## 5.3 Source Metadata

Purpose:

Track knowledge origin.

Fields:

``` yaml
source_type:

source_reference:

author:

original_creator:
```

Source examples:

-   Personal Insight
-   Research Paper
-   Conversation
-   GitHub Repository
-   Book
-   Article
-   Experiment

------------------------------------------------------------------------

## 5.4 Quality Metadata

Purpose:

Evaluate reliability and usefulness.

Fields:

``` yaml
confidence:

importance:

freshness:

validation_status:
```

## Confidence

Values:

-   High
-   Medium
-   Low

Meaning:

How reliable is the knowledge?

------------------------------------------------------------------------

## Importance

Values:

-   Critical
-   High
-   Medium
-   Low

Meaning:

How valuable is this knowledge?

------------------------------------------------------------------------

## Freshness

Values:

-   Current
-   Aging
-   Historical
-   Deprecated

Meaning:

How likely is this knowledge still valid?

------------------------------------------------------------------------

# 6. Lifecycle Metadata

Purpose:

Track knowledge evolution.

Lifecycle:

    Draft

    ↓

    Review

    ↓

    Active

    ↓

    Archived

    ↓

    Deprecated

------------------------------------------------------------------------

# 7. Relationship Metadata

Purpose:

Support the Knowledge Graph.

Fields:

``` yaml
relationships:

supports:

contradicts:

derived_from:

depends_on:

influences:

related_to:
```

Example:

    AI Agent Research

    ↓

    supports

    FounderOS Agent Architecture

    ↓

    depends_on

    MCP Specification

------------------------------------------------------------------------

# 8. Obsidian Frontmatter Standard

Every Markdown knowledge file should include:

``` yaml
---
title: FounderOS Agent Research

type: research

domain: AI Agents

category: Agent Architecture

status: active

confidence: high

importance: critical

tags:
- AI
- Agents
- MCP

created:
2026-07-27

updated:
2026-07-27
---
```

------------------------------------------------------------------------

# 9. Metadata Validation Rules

Every object requires:

    title

    type

    domain

    status

    created date

Important objects require:

    confidence

    importance

    relationships

Decision objects require:

    reasoning

    expected outcome

    review date

Project objects require:

    vision

    status

    milestones

------------------------------------------------------------------------

# 10. Metadata and AI Retrieval

When Hermes receives a question:

Example:

"Should we build another AI SaaS?"

KnowledgeOS prioritizes:

-   important principles
-   validated decisions
-   active projects
-   related research

Retrieval ranking:

    Importance

    +

    Confidence

    +

    Freshness

    +

    Relationship Strength

    +

    Current Context

------------------------------------------------------------------------

# 11. Metadata Evolution Rules

New fields may be added when they:

1.  Improve retrieval.
2.  Improve decision quality.
3.  Improve automation.
4.  Improve knowledge lifecycle management.

Do not add fields only for organization.

------------------------------------------------------------------------

# 12. Implementation Mapping

## Obsidian

Uses:

-   Markdown frontmatter

## PostgreSQL

Uses:

-   structured metadata columns

## Vector Database

Uses:

-   filtered semantic retrieval

## Graph Database

Uses:

-   relationship properties

## Hermes

Uses:

-   context ranking

------------------------------------------------------------------------

# 13. Final Principle

Metadata is not administrative information.

Metadata teaches FounderOS:

> What matters, why it matters, and when it should be used.
