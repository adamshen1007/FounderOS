# Chapter 14 — Measure Behavior, Not Compliments

> **Core Principle:** Define the user behavior that represents delivered value
> before collecting more metrics.

## Learning Objectives

- Choose one value event tied to the product promise.
- Separate attention, activation, value, and retention signals.
- Combine behavioral data with direct user context.

## Deep Dive

Metrics become useful when they answer a decision question. Page views answer
whether a page loaded or attracted attention. They do not prove the user solved
the target problem.

YC’s essential advice recommends choosing a small number of key measures and
using them to guide focus.[^essential] The Startup Playbook also connects great
product, execution, and growth rather than treating growth as an isolated
dashboard.[^playbook]

Define a value event: the smallest observable behavior showing that the user
received the promised outcome. For an AI research assistant, “generated a
report” may be weak; “used a sourced report in a reviewed decision” is closer to
value, though harder to observe.

Map four stages: reached, activated, received value, returned. Record the
denominator and observation period. Segment by relevant user or workflow so an
average does not hide that one group succeeds and another fails. Pair events
with conversations to understand why behavior occurred.

## AI Founder Interpretation

AI can query events and surface unusual patterns. It cannot decide whether a
proxy truly represents user value. Keep event definitions, exclusions, and
data-quality limits visible.

Collect the minimum data needed. Avoid invasive tracking merely because an
analytics tool makes it easy.

## Callouts

### Decision Lens

> **Decision Lens:** What action would a user take only after receiving the
> outcome your product promises?

### Common Failure

> **Common Failure:** Replacing a weak metric with many weak metrics. More
> dashboard activity can make uncertainty harder to see.

## Checklist

- [ ] Write one primary value event in user language.
- [ ] Define reached, activated, value, and returned stages.
- [ ] Include denominators and observation windows.
- [ ] Segment by the focused user or workflow.
- [ ] Review behavior with direct qualitative context.

## Worksheet

| Stage | Event definition | Denominator | Time window | Decision informed |
| --- | --- | --- | --- | --- |
| Reached | | | | |
| Activated | | | | |
| Received value | | | | |
| Returned | | | | |

## Key Takeaways

- A value event must connect to the product promise.
- Attention and activation are not the same as delivered value.
- Denominators, time windows, and segments prevent misleading totals.
- AI can analyze events but founders must defend the proxy and data boundary.

## Sources

- [YC’s Essential Startup Advice — Y Combinator](https://www.ycombinator.com/blog/ycs-essential-startup-advice/)
- [Startup Playbook — Y Combinator](https://www.ycombinator.com/blog/startup-playbook/)

[^essential]: Geoff Ralston, “YC’s Essential Startup Advice”, Y Combinator.
[^playbook]: Sam Altman, “Startup Playbook”, Y Combinator.
