# FounderOS Vault Initialization Specification v1.0

## Document Status

Version: v1.0\
Layer: Migration & Execution Specification

------------------------------------------------------------------------

# 1. Purpose

The FounderOS Vault is the initial human knowledge environment that
powers:

-   KnowledgeOS
-   Hermes
-   AI agents
-   project intelligence
-   decision memory

The vault is the human-owned source of truth.

------------------------------------------------------------------------

# 2. Vault Philosophy

FounderOS follows:

    Human Thinking

    ↓

    Knowledge Capture

    ↓

    Knowledge Structure

    ↓

    AI Understanding

    ↓

    Better Decisions

The vault is not a note collection.

It is:

> The memory foundation of an AI-native founder operating system.

------------------------------------------------------------------------

# 3. Vault Location

Recommended:

    FounderOS/

    ├── vault/

    └── repository/

Relationship:

    FounderOS Repository

    ↓

    KnowledgeOS Vault

    ↓

    Hermes Context

------------------------------------------------------------------------

# 4. Top-Level Vault Structure

    FounderOS_Vault/

    ├── 00_Inbox/

    ├── 01_Founder_Profile/

    ├── 02_Principles/

    ├── 03_Decision_Journal/

    ├── 04_Projects/

    ├── 05_Research/

    ├── 06_Playbooks/

    ├── 07_Templates/

    ├── 08_Registries/

    ├── 09_Memory/

    └── 10_Archive/

------------------------------------------------------------------------

# 5. Folder Specifications

## 00_Inbox

Purpose:

Capture ideas, screenshots, links, voice notes, and temporary thoughts.

Workflow:

    Capture

    ↓

    Review

    ↓

    Classify

    ↓

    Move

------------------------------------------------------------------------

## 01_Founder_Profile

Purpose:

Store founder context used by Hermes.

Structure:

    01_Founder_Profile/

    ├── Founder_Profile.md

    ├── Working_Style.md

    ├── Decision_Style.md

    ├── Goals.md

    ├── Preferences.md

    └── Experience.md

------------------------------------------------------------------------

## 02_Principles

Purpose:

Store permanent operating principles.

Examples:

-   AI Principles
-   Product Principles
-   Engineering Principles
-   Business Principles

------------------------------------------------------------------------

## 03_Decision_Journal

Purpose:

Store important decisions.

Structure:

    03_Decision_Journal/

    ├── Strategic/

    ├── Product/

    ├── Engineering/

    └── Operations/

Decision template:

``` markdown
# Decision Title

Date:

Context:

Problem:

Options:

Decision:

Reasoning:

Expected Outcome:

Risks:

Review Date:

Actual Result:

Lessons Learned:
```

------------------------------------------------------------------------

## 04_Projects

Purpose:

Each project becomes a knowledge domain.

Initial projects:

    04_Projects/

    ├── FounderOS/

    ├── OpportunityOS/

    └── Speculor_AI/

Project structure:

    Project/

    ├── Overview/

    ├── Strategy/

    ├── Research/

    ├── Architecture/

    ├── Decisions/

    ├── Experiments/

    ├── Status/

    └── Lessons/

------------------------------------------------------------------------

## 05_Research

Purpose:

Store external intelligence.

Structure:

    05_Research/

    ├── AI/

    ├── Startups/

    ├── Markets/

    ├── Technology/

    └── Competitors/

Research flow:

    Question

    ↓

    Sources

    ↓

    Findings

    ↓

    Insights

    ↓

    Decision Impact

------------------------------------------------------------------------

## 06_Playbooks

Purpose:

Store reusable operating knowledge.

Examples:

-   Startup Validation Playbook
-   AI Product Development Playbook
-   Content Creation Playbook
-   Marketing Playbook

------------------------------------------------------------------------

## 07_Templates

Contains:

-   Research Template
-   Decision Template
-   Project Template
-   Experiment Template
-   Meeting Template
-   ADR Template

------------------------------------------------------------------------

## 08_Registries

System control layer.

Contains:

-   Project Registry
-   Agent Registry
-   Skill Registry
-   Integration Registry
-   Knowledge Domain Registry

------------------------------------------------------------------------

## 09_Memory

Stores generated intelligence.

Structure:

    09_Memory/

    ├── Identity_Memory/

    ├── Knowledge_Memory/

    ├── Decision_Memory/

    ├── Project_Memory/

    └── Execution_Memory/

------------------------------------------------------------------------

## 10_Archive

Historical preservation.

Important knowledge should be archived, not deleted.

Archive when information is:

-   outdated
-   replaced
-   completed

------------------------------------------------------------------------

# 6. Metadata Standard

Important Markdown files require:

``` yaml
---
title:

type:

domain:

status:

confidence:

importance:

created:

updated:

tags:
---
```

------------------------------------------------------------------------

# 7. Initial Migration Priority

Do not migrate everything.

Priority:

## Priority 1

FounderOS documents.

Reason:

Defines the operating system.

## Priority 2

OpportunityOS.

Reason:

First real project validation.

## Priority 3

Speculor AI.

Reason:

Product development memory.

## Priority 4

General research.

------------------------------------------------------------------------

# 8. Initial Vault Validation

FounderOS should answer:

## Founder Questions

-   Who am I?
-   What are my principles?
-   How do I make decisions?

## Project Questions

-   What is OpportunityOS?
-   What decisions were made?
-   What should happen next?

## Strategic Questions

-   Should I start this project?
-   What should I prioritize?

------------------------------------------------------------------------

# 9. Implementation Sequence

    Create Vault

    ↓

    Import Governance Documents

    ↓

    Import KnowledgeOS Specifications

    ↓

    Import OpportunityOS Context

    ↓

    Import Speculor AI Context

    ↓

    Connect Retrieval System

------------------------------------------------------------------------

# 10. Final Principle

The FounderOS Vault is not where information is stored.

It is where:

> Founder experience becomes AI-accessible intelligence.
