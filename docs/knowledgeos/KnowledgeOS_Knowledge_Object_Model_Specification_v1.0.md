# KnowledgeOS Knowledge Object Model Specification v1.0

## Document Status

Version: v1.0\
Layer: KnowledgeOS Official Specification

## 1. Purpose

This document defines the fundamental knowledge entities managed by
KnowledgeOS.

KnowledgeOS does not simply store files.

It manages:

> Structured knowledge objects with context, relationships, and
> lifecycle.

------------------------------------------------------------------------

# 2. Knowledge Object Philosophy

Traditional knowledge management:

    File

    ↓

    Folder

    ↓

    Search

KnowledgeOS:

    Knowledge Object

    ↓

    Metadata

    ↓

    Relationships

    ↓

    Context

    ↓

    Intelligence

------------------------------------------------------------------------

# 3. Core Knowledge Object Types

KnowledgeOS contains seven primary object types:

1.  Knowledge Object
2.  Decision Object
3.  Project Object
4.  Research Object
5.  Principle Object
6.  Experiment Object
7.  Relationship Object

------------------------------------------------------------------------

# 4. Knowledge Object

## Purpose

The base object representing reusable information.

Examples:

-   research notes
-   articles
-   insights
-   technical explanations
-   market observations

## Schema

``` yaml
KnowledgeObject:

id:

title:

type:

domain:

content:

source:

author:

metadata:

relationships:

created_at:

updated_at:

status:

confidence:
```

## Example

``` yaml
title:
"AI Agent Market Analysis"

type:
research

domain:
AI Agents

confidence:
high

relationships:

supports:
FounderOS Strategy Decision
```

------------------------------------------------------------------------

# 5. Decision Object

## Purpose

Capture why decisions were made.

A decision without reasoning has limited value.

## Schema

``` yaml
DecisionObject:

id:

decision_title:

context:

problem:

options:

chosen_option:

reasoning:

expected_outcome:

risks:

related_projects:

review_date:

result:

lessons_learned:
```

## Example

Decision:

Use Reddit as first OpportunityOS connector.

Context:

Need high-value startup signals.

Options:

-   X
-   Reddit
-   TikTok

Decision:

Reddit first.

Reason:

Better API accessibility and community depth.

Lesson:

Validate data quality before adding more sources.

------------------------------------------------------------------------

# 6. Project Object

## Purpose

Represent ventures, products, and initiatives.

Examples:

-   OpportunityOS
-   Speculor AI
-   FounderOS

## Schema

``` yaml
ProjectObject:

id:

name:

vision:

mission:

objectives:

status:

architecture:

decisions:

risks:

milestones:

team:

related_knowledge:
```

## Lifecycle

    Idea

    ↓

    Discovery

    ↓

    Validation

    ↓

    Building

    ↓

    Operating

    ↓

    Archived

------------------------------------------------------------------------

# 7. Research Object

## Purpose

Capture external knowledge.

Examples:

-   market research
-   competitor analysis
-   technical research

## Schema

``` yaml
ResearchObject:

title:

question:

sources:

findings:

insights:

implications:

confidence:

related_decisions:
```

------------------------------------------------------------------------

# 8. Principle Object

## Purpose

Capture reusable rules and beliefs.

Examples:

-   Documentation first
-   Context is the moat

## Schema

``` yaml
PrincipleObject:

name:

statement:

reasoning:

examples:

exceptions:

created_from:
```

------------------------------------------------------------------------

# 9. Experiment Object

## Purpose

Capture learning through execution.

Examples:

-   user validation
-   MVP experiments
-   marketing tests

## Schema

``` yaml
ExperimentObject:

hypothesis:

objective:

method:

metrics:

result:

learning:

next_action:
```

------------------------------------------------------------------------

# 10. Relationship Object

## Purpose

Create knowledge graph connections.

Relationships are first-class objects.

## Relationship Types

    supports

    contradicts

    derived_from

    depends_on

    influences

    related_to

    created_by

    validated_by

## Example

    AI Agent Research

    ↓

    supports

    FounderOS Strategy Decision

    ↓

    creates

    FounderOS Architecture

    ↓

    implemented_by

    Codex Development Task

------------------------------------------------------------------------

# 11. Object Lifecycle

Every object follows:

    Created

    ↓

    Reviewed

    ↓

    Active

    ↓

    Updated

    ↓

    Archived

------------------------------------------------------------------------

# 12. Knowledge Quality Attributes

Every object should evaluate:

## Completeness

Does it contain enough information?

## Confidence

How reliable is it?

## Freshness

Is it still valid?

## Relevance

Does it support current objectives?

------------------------------------------------------------------------

# 13. Relationship With FounderOS

Flow:

    Human Creates Knowledge

    ↓

    Knowledge Object

    ↓

    Relationship Mapping

    ↓

    Knowledge Graph

    ↓

    Hermes Context Retrieval

    ↓

    Decision Support

------------------------------------------------------------------------

# 14. Implementation Implications

This object model becomes the foundation for:

## Database

Potential entities:

-   knowledge_objects
-   decisions
-   projects
-   relationships

## Vector Database

Stores:

-   embeddings
-   semantic retrieval indexes

## Graph Database

Stores:

-   relationships
-   dependencies
-   influence

## Obsidian

Provides the human-readable representation.

------------------------------------------------------------------------

# 15. Final Principle

KnowledgeOS does not manage documents.

KnowledgeOS manages:

> The structured memory of a founder and their ventures.
