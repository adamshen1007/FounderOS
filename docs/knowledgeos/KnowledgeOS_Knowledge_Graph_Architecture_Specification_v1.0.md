# KnowledgeOS Knowledge Graph Architecture Specification v1.0

## Document Status

Version: v1.0\
Layer: KnowledgeOS Official Specification

------------------------------------------------------------------------

# 1. Purpose

The Knowledge Graph enables FounderOS to understand relationships
between:

-   ideas
-   research
-   decisions
-   projects
-   experiments
-   outcomes
-   principles

The goal:

> Build a connected intelligence map of founder knowledge.

------------------------------------------------------------------------

# 2. Why Knowledge Graphs Matter

Traditional knowledge systems:

    Document A

    Document B

    Document C

Knowledge Graph:

    Research

    ↓

    Insight

    ↓

    Decision

    ↓

    Project

    ↓

    Outcome

    ↓

    Lesson

The value comes from relationships.

------------------------------------------------------------------------

# 3. Knowledge Graph Position in FounderOS

    FounderOS

    ↓

    KnowledgeOS

    ↓

    Vault

    ↓

    Knowledge Objects

    ↓

    Metadata

    ↓

    Knowledge Graph

    ↓

    Retrieval Engine

    ↓

    Hermes Context

------------------------------------------------------------------------

# 4. Graph Architecture Model

Knowledge Graph consists of:

    Nodes

    +

    Relationships

    +

    Properties

    +

    Events

------------------------------------------------------------------------

# 5. Node Types

## 5.1 Knowledge Node

Represents general knowledge.

Examples:

-   research
-   article
-   insight
-   technical information

------------------------------------------------------------------------

## 5.2 Decision Node

Represents choices and reasoning.

Example:

    Decision:

    Use Reddit as first OpportunityOS connector.

------------------------------------------------------------------------

## 5.3 Project Node

Represents ventures and initiatives.

Examples:

-   OpportunityOS
-   Speculor AI
-   FounderOS

------------------------------------------------------------------------

## 5.4 Principle Node

Represents reusable beliefs.

Examples:

-   Context is the moat
-   Documentation first

------------------------------------------------------------------------

## 5.5 Experiment Node

Represents validation activities.

Examples:

-   User interview experiment
-   Landing page test

------------------------------------------------------------------------

## 5.6 Agent Node

Represents AI workers.

Examples:

-   Hermes
-   Codex
-   OpenClaw
-   OpenMinis

------------------------------------------------------------------------

# 6. Relationship Types

## Supports

One knowledge item strengthens another.

Example:

    Market Research

    supports

    Product Decision

------------------------------------------------------------------------

## Contradicts

Information conflicts with another assumption.

Example:

    Old Market Assumption

    contradicts

    New Customer Feedback

------------------------------------------------------------------------

## Derived From

Knowledge originates from another source.

Example:

    Architecture Decision

    derived_from

    Technical Research

------------------------------------------------------------------------

## Depends On

One object requires another.

Example:

    Hermes Agent

    depends_on

    Knowledge Retrieval Engine

------------------------------------------------------------------------

## Influences

One object affects another.

Example:

    AI Trend

    influences

    FounderOS Strategy

------------------------------------------------------------------------

## Validated By

Evidence confirms an assumption.

Example:

    Startup Hypothesis

    validated_by

    Customer Interviews

------------------------------------------------------------------------

# 7. Graph Schema Example

    AI Agent Research

            |

         supports

            |

    FounderOS Agent Architecture

            |

         creates

            |

    Hermes Runtime

            |

     validated_by

            |

    User Feedback

------------------------------------------------------------------------

# 8. Relationship Strength

Each relationship contains:

``` yaml
relationship:

type:

strength:

confidence:

source:

created:
```

Example:

``` yaml
type:
supports

strength:
high

confidence:
validated
```

------------------------------------------------------------------------

# 9. Graph Traversal

Knowledge Graph enables questions such as:

## Why did we choose this architecture?

Traversal:

    Architecture Decision

    ↓

    Derived From

    ↓

    Technical Research

    ↓

    Supported By

    ↓

    Experiment Results

------------------------------------------------------------------------

## What risks exist?

Traversal:

    Project

    ↓

    Related Decisions

    ↓

    Known Risks

    ↓

    Previous Failures

------------------------------------------------------------------------

## What should I prioritize?

Traversal:

    Current Goals

    ↓

    Projects

    ↓

    Expected Impact

    ↓

    Available Resources

    ↓

    Recommendation

------------------------------------------------------------------------

# 10. Hermes Graph Usage

Hermes uses the graph for:

## Context Expansion

Find related knowledge.

## Decision Explanation

Explain why decisions exist.

## Pattern Recognition

Identify repeated patterns.

## Strategic Reasoning

Connect:

    Past

    +

    Present

    +

    Possible Future

------------------------------------------------------------------------

# 11. Graph Update Rules

New relationships should be created when:

-   a decision references research
-   a project uses knowledge
-   an experiment validates a hypothesis
-   a lesson changes a principle

------------------------------------------------------------------------

# 12. Graph Quality Management

Evaluate:

## Accuracy

Are relationships correct?

## Completeness

Are important connections missing?

## Relevance

Are relationships still useful?

## Confidence

How strong is the connection?

------------------------------------------------------------------------

# 13. Implementation Mapping

## Obsidian

Human-readable graph source.

## Metadata System

Defines graph properties.

## Vector Database

Provides semantic similarity.

## Graph Database

Stores explicit relationships.

## Hermes

Consumes graph intelligence.

------------------------------------------------------------------------

# 14. Future Evolution

Knowledge Graph evolves into:

    Founder Experience

    +

    Project History

    +

    Decision Patterns

    +

    AI Understanding

    =

    Founder Intelligence Model

------------------------------------------------------------------------

# 15. Final Principle

A database stores information.

A knowledge graph stores understanding.

KnowledgeOS exists to help FounderOS understand:

> What happened, why it happened, how things connect, and what should
> happen next.
