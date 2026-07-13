# AI Agent Threat Model

## Scope

This model covers the local M4 runtime, agent definitions, provider adapters,
run packages, approval artifacts, and application of structured claim changes.

## Assets

- Canonical research and publishing content
- Git history and release authority
- Local secrets and environment configuration
- Provider credentials, usage budgets, and private input
- Integrity of approvals and run evidence

## Trust Boundaries

The operator, reviewed repository content, deterministic validators, model
provider, and untrusted research text are separate trust domains. Model output
is untrusted until schema and policy verification succeeds. Approval is valid
only for the exact proposal and file hashes recorded at review time.

## Threats and Controls

| Threat | M4 control | Residual risk |
| --- | --- | --- |
| Prompt injection in a source | Delimit input, deny tools, scan markers, fail verification | Novel wording may evade the scanner, but no tools are available |
| Secret disclosure | Deny sensitive paths; do not persist prompt content; disable provider storage | Allowed files may still contain sensitive prose and require human judgment |
| Path escape or symbolic-link attack | Repository-relative resolution and per-segment symbolic-link rejection | Files already committed in allowlisted paths remain readable |
| Unauthorized edit | Proposal-only runtime plus exact human approval | A careless reviewer can approve a poor recommendation |
| Stale or swapped approval | Bind proposal and target SHA-256 hashes | Compromised local host remains out of scope |
| Excessive spend | Token caps, timeout, cost cap, operator-supplied current pricing | Provider accounting can differ slightly from estimates |
| Provider outage or malformed output | Timeout, HTTP failure, strict JSON Schema, fake fallback | A live run may fail and need retry |
| CI secret use or nondeterminism | Fake provider only in CI | Mock tests cannot prove provider availability |
| Model claims false completion | Runtime assigns status; model cannot approve or apply | Human still must inspect semantic quality |

## Security Invariants

- No model tool can execute shell, Git, network browsing, or publication.
- A failed check produces no canonical edit.
- A rejected or missing approval cannot be applied.
- Application reuses M3 schema and graph validation and rolls back on failure.
- Expanding permissions requires an RFC, ADR review, and updated adversarial
  tests.
