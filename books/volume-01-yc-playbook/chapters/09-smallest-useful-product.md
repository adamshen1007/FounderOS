# Chapter 9 — Design the Smallest Useful Product

> **Core Principle:** Remove scope until one complete user outcome remains.

## Learning Objectives

- Distinguish a minimum useful product from a collection of partial features.
- Define a complete user journey and manual boundaries.
- Write a release test with success, failure, and safety conditions.

## Deep Dive

“Minimum” describes scope, not carelessness. A useful first product gives one
specific user a coherent path from a trigger to a meaningful outcome.

YC’s MVP guidance describes a product with a clear purpose and only the features
needed to tell that complete story.[^spec] Michael Seibel’s order of operations
also recommends an extremely stripped-down version that can reach users before
the complete solution exists.[^order]

Write the journey in five steps: trigger, input, core action, output, and
confirmation. Mark what software performs, what a founder performs manually,
and what is deliberately unavailable. Manual work is acceptable when it is
truthful, safe, and helps you learn what to automate.

Define failure before launch. What happens when AI confidence is low, data is
missing, or the workflow has a consequence you should not automate? A useful
product includes a clear fallback, not just a happy-path demo.

## AI Founder Interpretation

AI can prototype interfaces and operations quickly, which makes scope discipline
more important. Cheap feature generation does not make extra features free:
each adds evaluation, support, security, and explanation work.

Keep consequential approval with a named person. Expose uncertainty when a user
could otherwise mistake generated output for verified fact.

## Callouts

### Decision Lens

> **Decision Lens:** What is the smallest end-to-end outcome a user would still
> consider worth changing behavior for?

### Common Failure

> **Common Failure:** Shipping a broad interface with many incomplete paths.
> Users cannot test the central value because the story never finishes.

## Checklist

- [ ] Name one user, trigger, and complete outcome.
- [ ] Remove every feature not required for that outcome.
- [ ] Label manual work and user expectations honestly.
- [ ] Define AI failure and human fallback paths.
- [ ] Set a launch date and evidence rule.

## Worksheet

| Journey step | User action | Product action | Manual action | Failure path |
| --- | --- | --- | --- | --- |
| Trigger | | | | |
| Input | | | | |
| Core action | | | | |
| Output | | | | |
| Confirmation | | | | |

## Key Takeaways

- A minimum product should deliver one complete outcome.
- Manual delivery is useful when it is safe and transparent.
- Generated features still create evaluation and operating costs.
- A failure path is part of the product, not later polish.

## Sources

- [Practical Design: MVP Spec — Y Combinator](https://www.ycombinator.com/blog/practical-design-mvp)
- [One Order of Operations for Starting a Startup — Y Combinator](https://www.ycombinator.com/blog/one-order-of-operations-for-starting-a-startup/)

[^spec]: Dominika Blackappl, “Practical Design: MVP Spec”, Y Combinator.
[^order]: Michael Seibel, “One Order of Operations for Starting a Startup”, Y Combinator.
