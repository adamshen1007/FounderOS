# FounderOS Agent Runtime Specification v1.0

## Document Status

Version: v1.0\
Layer: Agent System Official Specification

------------------------------------------------------------------------

# 1. Purpose

The FounderOS Agent Runtime is the execution layer that enables AI
agents to:

-   receive tasks
-   understand objectives
-   access knowledge
-   execute workflows
-   communicate results
-   update memory

The Agent Runtime transforms FounderOS from a knowledge system into an
AI operating system.

------------------------------------------------------------------------

# 2. Agent Runtime Philosophy

FounderOS does not use one universal AI agent.

Instead:

    FounderOS

    ↓

    AI Workforce

    ↓

    Specialized Agents

Each agent has:

-   clear responsibility
-   defined capabilities
-   controlled permissions
-   measurable outputs

------------------------------------------------------------------------

# 3. Agent Runtime Architecture

    Founder

    ↓

    FounderOS Interface

    ↓

    Hermes Coordination Layer

    ↓

    Agent Runtime Engine

    ↓

    -------------------------------------------

    Research Agent

    Engineering Agent

    Operations Agent

    Device Agent

    -------------------------------------------

    ↓

    MCP Gateway

    ↓

    External Tools

------------------------------------------------------------------------

# 4. Core Runtime Components

## 4.1 Task Manager

Purpose:

Receive and manage work requests.

Responsibilities:

-   create tasks
-   assign identifiers
-   track status
-   manage priority

Example:

``` yaml
Task:

id:

title:

description:

priority:

assigned_agent:

status:

created_at:
```

------------------------------------------------------------------------

## 4.2 Context Loader

Purpose:

Provide relevant knowledge before execution.

Context sources:

    Founder Profile

    +

    KnowledgeOS

    +

    Project Memory

    +

    Decision History

    +

    Previous Execution

Flow:

    Task

    ↓

    Context Retrieval

    ↓

    Context Package

    ↓

    Agent Execution

------------------------------------------------------------------------

## 4.3 Agent Selector

Purpose:

Determine the appropriate agent.

Example:

    Strategic Question

    ↓

    Hermes

    ↓

    Research Agent

    ↓

    Technical Analysis Agent

    ↓

    Codex

------------------------------------------------------------------------

## 4.4 Execution Manager

Purpose:

Control agent execution.

Responsibilities:

-   start tasks
-   monitor progress
-   handle failures
-   collect results

------------------------------------------------------------------------

## 4.5 Memory Update Manager

Purpose:

Convert execution results into intelligence.

Flow:

    Result

    ↓

    Evaluation

    ↓

    Knowledge Update

    ↓

    Decision Memory

    ↓

    Future Context

------------------------------------------------------------------------

# 5. Agent Lifecycle

Every execution follows:

    Created

    ↓

    Context Loading

    ↓

    Planning

    ↓

    Execution

    ↓

    Evaluation

    ↓

    Memory Update

    ↓

    Completed

------------------------------------------------------------------------

# 6. Agent State Model

``` yaml
AgentTask:

status:

- created

- waiting_context

- planning

- executing

- waiting_approval

- completed

- failed

- learning
```

------------------------------------------------------------------------

# 7. Agent Contract Model

Every agent must define:

## Identity

Example:

``` yaml
name:
Hermes

role:
Chief of Staff
```

## Responsibility

Example:

``` yaml
responsibility:

Strategic reasoning

Decision support

Task coordination
```

## Capability

Example:

``` yaml
capabilities:

research

analysis

planning

delegation
```

## Limitation

Example:

``` yaml
limitations:

Cannot change strategy without approval.

Cannot delete knowledge.
```

------------------------------------------------------------------------

# 8. Agent Execution Flow

Example:

Founder:

"Evaluate this startup opportunity."

Flow:

    Founder Request

    ↓

    Hermes

    ↓

    Intent Analysis

    ↓

    KnowledgeOS Retrieval

    ↓

    Context Assembly

    ↓

    Research Agent

    ↓

    Technical Agent

    ↓

    Hermes Recommendation

    ↓

    Decision Record

------------------------------------------------------------------------

# 9. Agent Permission Model

## Level 0 --- Read Only

Allowed:

-   search
-   summarize
-   analyze

## Level 1 --- Create

Allowed:

-   create documents
-   create reports
-   create drafts

## Level 2 --- Execute

Allowed:

-   run workflows
-   modify project artifacts

## Level 3 --- External Action

Requires approval:

-   send messages
-   publish content
-   financial actions

------------------------------------------------------------------------

# 10. Human Approval Model

Approval required for:

## Strategic Actions

Examples:

-   changing company direction
-   abandoning projects
-   entering new markets

## External Actions

Examples:

-   investor communication
-   customer communication
-   public publishing

## Irreversible Actions

Examples:

-   deleting data
-   major architecture changes

------------------------------------------------------------------------

# 11. Agent Learning Loop

Every execution should create learning.

    Task

    ↓

    Execution

    ↓

    Result

    ↓

    Evaluation

    ↓

    Memory Update

    ↓

    Future Improvement

------------------------------------------------------------------------

# 12. Agent Observability

Every execution records:

-   task
-   agent
-   context used
-   actions performed
-   output
-   evaluation
-   memory updates

Example:

``` yaml
ExecutionRecord:

task_id:

agent:

context:

actions:

result:

quality_score:

lessons:
```

------------------------------------------------------------------------

# 13. Failure Handling

When an agent fails:

1.  Record failure.
2.  Identify cause.
3.  Retry if appropriate.
4.  Escalate when necessary.
5.  Capture learning.

------------------------------------------------------------------------

# 14. Implementation Mapping

Agent Runtime connects:

## KnowledgeOS

Provides intelligence.

## MCP Gateway

Provides tools.

## Hermes

Provides coordination.

## Codex/OpenClaw/OpenMinis

Provide execution.

------------------------------------------------------------------------

# 15. Final Principle

FounderOS agents are not independent AI assistants.

They are:

> Specialized intelligence workers operating inside a governed founder
> operating system.
