# FounderOS Provider-Neutral Reasoning Execution Port v1.0

## Purpose

Define the replaceable boundary through which a governed Reasoning Invocation is executed.

## Port Input

The execution port accepts only:

- Verified Reasoning Invocation Request
- Verified Delivery Envelope binding
- Verified Provider Capability Descriptor
- Verified compatibility result
- Explicit execution timestamp
- Explicit cancellation signal abstraction
- Explicit attempt number

## Port Output

The execution port returns one provider-neutral outcome:

- Success
- Failure
- Timeout
- Cancelled

Each outcome must include sufficient evidence for independent verification.

## Port Must Not

- Query KnowledgeOS
- Access the Repository
- Read raw Knowledge Objects
- Read full Query Results
- Change the Context Package
- Add hidden context
- Select a real provider
- Read credentials
- Perform tool calling
- Create Agent actions

## Adapter Neutrality

Milestone 13 implements only a deterministic fake provider behind this port.

## Principle

The execution port is a controlled reasoning boundary, not a gateway to organizational knowledge.
