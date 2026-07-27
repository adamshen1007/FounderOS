# Agent Communication Protocol v1.0

## Document Status

Version: v1.0\
Layer: Agent System Official Specification

------------------------------------------------------------------------

# 1. Purpose

The Agent Communication Protocol defines how FounderOS agents:

-   receive tasks
-   exchange information
-   transfer context
-   report execution
-   handle failures
-   update knowledge

The goal:

> Enable reliable collaboration between specialized AI workers.

------------------------------------------------------------------------

# 2. Communication Principles

## Principle 1 --- Explicit Context Transfer

Agents must not assume hidden context.

Every handoff must include:

-   objective
-   background
-   constraints
-   expected output
-   verification method

------------------------------------------------------------------------

## Principle 2 --- Structured Communication

Agents communicate through defined contracts.

Example:

``` yaml
task_type:
engineering

objective:
Implement feature X

context:
Project Y

constraints:
Follow architecture rules

expected_output:
Tested implementation
```

------------------------------------------------------------------------

## Principle 3 --- Traceability

Important communication should record:

-   sender
-   receiver
-   task
-   context
-   result
-   timestamp

------------------------------------------------------------------------

# 3. Communication Architecture

    Founder

    ↓

    Hermes Agent

    ↓

    Agent Communication Layer

    ↓

    --------------------------------

    Research Agent

    Codex

    OpenClaw

    OpenMinis

    --------------------------------

    ↓

    KnowledgeOS

------------------------------------------------------------------------

# 4. Message Types

FounderOS supports five message categories.

------------------------------------------------------------------------

# Type 1 --- Task Request

Purpose:

Assign work.

Example:

``` yaml
message_type:
task_request

sender:
Hermes

receiver:
Codex

task:
engineering

objective:
Build Reddit connector MVP

context:
OpportunityOS

constraints:
Follow repository architecture

expected_output:
Working implementation with tests
```

------------------------------------------------------------------------

# Type 2 --- Context Package

Purpose:

Provide required background.

Example:

``` yaml
context_package:

project:
OpportunityOS

related_documents:

- Architecture.md
- Connector_Spec.md

decisions:

- Reddit selected as first connector

constraints:

- Maintain existing API design
```

------------------------------------------------------------------------

# Type 3 --- Execution Report

Purpose:

Return results.

Example:

``` yaml
execution_report:

status:
completed

summary:
Implemented Reddit connector

changes:

- Added connector service
- Added tests

verification:

- Tests passed

memory_update_required:
true
```

------------------------------------------------------------------------

# Type 4 --- Evaluation Request

Purpose:

Request review.

Example:

``` yaml
evaluation_request:

target:
Codex implementation

reviewer:
Hermes

criteria:

- correctness
- architecture compliance
- maintainability
```

------------------------------------------------------------------------

# Type 5 --- Memory Update Event

Purpose:

Create institutional memory.

Example:

``` yaml
memory_event:

type:
decision

source:
Hermes

content:

Reddit chosen as first connector.

reason:

Community signal quality and API accessibility.
```

------------------------------------------------------------------------

# 5. Agent Handoff Contract

Every handoff must include:

``` yaml
Handoff:

from_agent:

to_agent:

objective:

context:

constraints:

expected_output:

priority:

deadline:

approval_required:
```

------------------------------------------------------------------------

# 6. Example Multi-Agent Workflow

Scenario:

Evaluate a new AI startup opportunity.

    Founder

    ↓

    Hermes

    ↓

    Research Agent

    Market analysis

    ↓

    Codex

    Technical feasibility

    ↓

    Hermes

    Final Recommendation

    ↓

    Decision Record

------------------------------------------------------------------------

# 7. Error Communication

When an agent fails:

Required fields:

``` yaml
failure_report:

agent:

task:

failure_reason:

attempted_solution:

recommended_next_step:

requires_human_help:
```

------------------------------------------------------------------------

# 8. Context Priority Rules

Context transfer priority:

    Current Objective

    ↓

    Project Context

    ↓

    Recent Decisions

    ↓

    Historical Knowledge

    ↓

    General Knowledge

------------------------------------------------------------------------

# 9. Security Rules

Agents must not:

-   access unauthorized data
-   expose private knowledge
-   modify protected information
-   bypass approval requirements

------------------------------------------------------------------------

# 10. Communication Memory

Important communication creates:

## Decision Memory

Why a decision happened.

## Execution Memory

What happened.

## Knowledge Memory

What was learned.

------------------------------------------------------------------------

# 11. Protocol Evolution

The protocol evolves based on:

-   new agent capabilities
-   new tools
-   execution failures
-   workflow improvements

All changes require documentation updates.

------------------------------------------------------------------------

# 12. Final Principle

Agents become valuable not because they work individually.

They become valuable because they can:

> Communicate, coordinate, learn, and improve together.
