# AI Task Routing Framework v1.0

## Document Status

Version: v1.0\
Layer: Agent System Official Specification

------------------------------------------------------------------------

# 1. Purpose

FounderOS should not send every task to the same AI agent.

Different problems require different intelligence capabilities.

The routing framework ensures:

-   correct agent selection
-   efficient execution
-   clear responsibility
-   predictable outcomes
-   controlled autonomy

------------------------------------------------------------------------

# 2. Agent Organization Model

    Founder

    ↓

    Hermes Chief of Staff

    ↓

    --------------------------------

    Research Agent

    Product Agent

    Codex

    OpenClaw

    OpenMinis

    --------------------------------

    ↓

    KnowledgeOS

------------------------------------------------------------------------

# 3. Core Routing Principle

Every task must answer:

1.  What type of problem is this?
2.  What capability is required?
3.  Which agent owns responsibility?
4.  What approval level is required?

------------------------------------------------------------------------

# 4. Agent Responsibility Matrix

  Agent            Primary Responsibility
  ---------------- --------------------------------------
  Hermes           Strategy, decisions, coordination
  Research Agent   Discovery, evidence, analysis
  Product Agent    Product planning, UX, prioritization
  Codex            Engineering implementation
  OpenClaw         Automation and operations
  OpenMinis        Device interaction
  KnowledgeOS      Memory and knowledge management

------------------------------------------------------------------------

# 5. Task Categories

## Category 1 --- Strategic Tasks

Examples:

-   opportunity evaluation
-   strategic direction
-   project prioritization

Owner:

    Hermes

Requires human approval.

Workflow:

    Founder Question

    ↓

    Hermes

    ↓

    KnowledgeOS Retrieval

    ↓

    Decision Analysis

    ↓

    Recommendation

    ↓

    Founder Decision

------------------------------------------------------------------------

## Category 2 --- Research Tasks

Examples:

-   market analysis
-   competitor research
-   technology evaluation

Owner:

    Research Agent

Workflow:

    Research Question

    ↓

    Research Agent

    ↓

    Evidence Collection

    ↓

    Analysis

    ↓

    KnowledgeOS Update

    ↓

    Hermes Review

------------------------------------------------------------------------

## Category 3 --- Product Tasks

Examples:

-   feature prioritization
-   MVP definition
-   user journey design

Owner:

    Product Agent

------------------------------------------------------------------------

## Category 4 --- Engineering Tasks

Examples:

-   coding
-   architecture implementation
-   testing
-   debugging

Owner:

    Codex

Workflow:

    Engineering Requirement

    ↓

    Hermes Context Package

    ↓

    Codex

    ↓

    Implementation

    ↓

    Testing

    ↓

    Engineering Memory Update

------------------------------------------------------------------------

## Category 5 --- Operations Tasks

Examples:

-   monitoring
-   automation
-   scheduled workflows

Owner:

    OpenClaw

------------------------------------------------------------------------

## Category 6 --- Device Tasks

Examples:

-   voice capture
-   camera input
-   local interactions

Owner:

    OpenMinis

------------------------------------------------------------------------

## Category 7 --- Knowledge Tasks

Examples:

-   organizing information
-   updating relationships
-   maintaining memory

Owner:

    KnowledgeOS

------------------------------------------------------------------------

# 6. Routing Decision Tree

    New Task

    ↓

    Strategic?

    Yes → Hermes

    ↓

    Research?

    Yes → Research Agent

    ↓

    Product?

    Yes → Product Agent

    ↓

    Engineering?

    Yes → Codex

    ↓

    Automation?

    Yes → OpenClaw

    ↓

    Device?

    Yes → OpenMinis

------------------------------------------------------------------------

# 7. Multi-Agent Collaboration

Complex tasks require multiple agents.

Example:

Evaluate a new AI startup opportunity.

    Founder Question

    ↓

    Hermes

    ↓

    Research Agent

    Market Size

    Competitors

    Trends

    ↓

    Codex

    Technical Feasibility

    ↓

    Product Agent

    User Experience

    ↓

    Hermes

    Final Recommendation

    ↓

    Decision Record

------------------------------------------------------------------------

# 8. Agent Handoff Rules

Every handoff must include:

``` yaml
Task:

objective:

context:

constraints:

expected_output:

verification_method:

deadline:
```

Example:

``` yaml
Task:

objective:
Build Reddit connector MVP

context:
OpportunityOS

constraints:
Follow existing architecture

expected_output:
Working connector with tests

verification:
pnpm test
```

------------------------------------------------------------------------

# 9. Escalation Rules

Agents must escalate when:

## Missing Context

Action:

Request KnowledgeOS retrieval.

## Conflicting Information

Action:

Create decision review.

## Strategic Impact

Action:

Require founder approval.

------------------------------------------------------------------------

# 10. Human Approval Matrix

  Action                   Approval
  ------------------------ ----------------------
  Research summary         No
  Document organization    No
  Draft creation           No
  Code changes             Depends on milestone
  Architecture changes     Yes
  Strategy changes         Yes
  External communication   Yes
  Financial actions        Yes

------------------------------------------------------------------------

# 11. Routing Memory

FounderOS should learn routing patterns.

Example:

    Market Analysis

    ↓

    Research Agent

    ↓

    Hermes

Repeated patterns improve future routing.

------------------------------------------------------------------------

# 12. Quality Metrics

Routing quality is measured by:

## Correct Agent Selection

Was the right worker selected?

## Execution Efficiency

Did the task avoid unnecessary steps?

## Output Quality

Was the result useful?

## Learning Improvement

Did routing improve over time?

------------------------------------------------------------------------

# 13. Final Principle

FounderOS does not create many AI agents.

It creates:

> The right intelligence worker for the right problem at the right time.
