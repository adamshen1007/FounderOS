# Agent Evaluation Framework v1.0

## Document Status

Version: v1.0\
Layer: Agent System Official Specification

------------------------------------------------------------------------

# 1. Purpose

The Agent Evaluation Framework defines how FounderOS evaluates:

-   agent outputs
-   reasoning quality
-   execution reliability
-   context usage
-   learning capability

The objective:

> Ensure AI agents continuously improve while remaining aligned with
> founder goals.

------------------------------------------------------------------------

# 2. Evaluation Philosophy

FounderOS does not evaluate agents only by:

"Did the task finish?"

Completion alone is insufficient.

Evaluation considers:

    Accuracy

    +

    Context Alignment

    +

    Reasoning Quality

    +

    Actionability

    +

    Reliability

    +

    Learning Value

------------------------------------------------------------------------

# 3. Evaluation Dimensions

## 3.1 Accuracy

Question:

Is the information correct?

Evaluation:

-   factual correctness
-   technical correctness
-   source reliability

------------------------------------------------------------------------

## 3.2 Context Alignment

Question:

Did the agent understand the actual situation?

The agent should consider:

    Founder Goals

    +

    Project Context

    +

    Previous Decisions

    +

    Current Constraints

------------------------------------------------------------------------

## 3.3 Reasoning Quality

Question:

Is the reasoning logical?

Evaluate:

-   assumptions
-   evidence
-   tradeoffs
-   alternatives considered

Weak:

    Build this because AI is trending.

Strong:

    Build this because:

    - market timing is favorable
    - founder capability matches
    - distribution advantage exists
    - risk is acceptable

------------------------------------------------------------------------

## 3.4 Actionability

Question:

Can the founder execute based on this output?

Good output includes:

-   clear next steps
-   priorities
-   required resources
-   risks

------------------------------------------------------------------------

## 3.5 Reliability

Question:

Can the agent perform consistently?

Measure:

-   successful tasks
-   failure rate
-   retry frequency
-   human correction rate

------------------------------------------------------------------------

## 3.6 Learning Value

Question:

Does this execution improve FounderOS?

A valuable execution creates:

-   knowledge
-   decisions
-   lessons
-   improved workflows

------------------------------------------------------------------------

# 4. Agent Quality Score

Example model:

    Quality Score =

    Accuracy

    +

    Context Alignment

    +

    Reasoning Quality

    +

    Actionability

    +

    Reliability

    +

    Learning Value

Score interpretation:

    90-100

    Excellent


    70-89

    Good


    50-69

    Needs Review


    Below 50

    Requires Improvement

------------------------------------------------------------------------

# 5. Confidence Evaluation

Every important output should include confidence.

## High Confidence

Evidence is strong.

Examples:

-   verified data
-   tested implementation
-   validated decision

------------------------------------------------------------------------

## Medium Confidence

Some uncertainty exists.

Examples:

-   incomplete market data
-   assumptions remain

------------------------------------------------------------------------

## Low Confidence

Significant uncertainty exists.

Examples:

-   early hypothesis
-   limited evidence

------------------------------------------------------------------------

# 6. Human Review Framework

Not every output requires human review.

## Automatic Acceptance

Allowed:

-   formatting
-   summaries
-   organization
-   draft generation

------------------------------------------------------------------------

## Human Review Required

Required for:

### Strategic Decisions

Examples:

-   entering markets
-   changing direction
-   killing projects

### External Actions

Examples:

-   publishing
-   investor communication
-   customer communication

### Irreversible Changes

Examples:

-   deleting knowledge
-   major architecture changes

------------------------------------------------------------------------

# 7. Agent Performance Memory

FounderOS should remember:

-   agent strengths
-   agent weaknesses
-   successful patterns
-   failure patterns

Example:

``` yaml
Agent:

Codex

Strengths:

- TypeScript
- Architecture implementation

Weaknesses:

- Ambiguous requirements

Improvement:

Provide clearer specifications
```

------------------------------------------------------------------------

# 8. Evaluation Workflow

Every important execution:

    Agent Completes Task

    ↓

    Evaluation

    ↓

    Quality Score

    ↓

    Human/System Review

    ↓

    Memory Update

    ↓

    Future Improvement

------------------------------------------------------------------------

# 9. Feedback Loop

The system improves through:

    Execution

    ↓

    Evaluation

    ↓

    Learning

    ↓

    Updated Rules

    ↓

    Better Execution

------------------------------------------------------------------------

# 10. Agent Improvement Rules

When repeated failures occur:

1.  Identify failure pattern.
2.  Update instructions.
3.  Improve context preparation.
4.  Adjust routing rules.
5.  Update evaluation criteria.

------------------------------------------------------------------------

# 11. Agent Benchmarking

Agents can be evaluated by:

## Task Success Rate

Percentage of successful tasks.

## Correction Rate

How often humans modify outputs.

## Time Efficiency

Execution speed.

## Knowledge Contribution

Amount of reusable intelligence created.

------------------------------------------------------------------------

# 12. Evaluation Integration

## KnowledgeOS

Stores evaluation history.

## Hermes

Reviews strategic quality.

## Agent Runtime

Tracks execution.

## Decision Framework

Improves decisions.

------------------------------------------------------------------------

# 13. Final Principle

FounderOS does not seek perfect AI agents.

It seeks:

> A learning AI workforce that becomes more aligned, reliable, and
> valuable over time.
