# M4 Delivery Record — WP23 to WP30

## Outcome

WP23–WP30 establish a governed, proposal-only agent ecosystem and implement one
complete Research Review Agent workflow.

| Work package | Delivered evidence |
| --- | --- |
| WP23 | RFC-003, ADR-004, threat model, retention policy, M4 acceptance criteria |
| WP24 | Six versioned JSON Schemas and declarative role definitions |
| WP25 | Provider-neutral runtime and agent CLI with fake and optional OpenAI adapters |
| WP26 | Deny-by-default paths, budgets, timeout, injection checks, exact approvals |
| WP27 | Research reviewer prompt, fixture, structured findings, M3 revalidation |
| WP28 | Adversarial tests, mocked live adapter tests, evaluation suite, run summaries |
| WP29 | Contract-only authoring, editorial, diagram, QA, and publisher roles |
| WP30 | Sanitized rejected-run example, fake-only CI gates, operator documentation |

## Acceptance Evidence

- The fake provider is deterministic, costs zero, and needs no secret.
- The live adapter is contract-tested with a mocked response.
- Run artifacts expose provider, model, timestamps, duration, usage, cost, and
  lifecycle status.
- No canonical write occurs during a run or review.
- Apply requires an exact human approval and invokes M3 validation.

## Assumption

The M4 implementation demonstrates governance and workflow value; it does not
demonstrate that a particular live model produces high-quality research advice.
That requires operator-owned evaluation with current models and real review
decisions.
