# FounderOS Milestone 16 Verification Checklist v1.0

## Baseline and Scope

- [ ] Branch is `codex/milestone-16-specification`.
- [ ] Base is merged `main` at or after `7dd4c61dabf1c123b26928a841a88632add2b542`.
- [ ] Worktree contained no unrelated changes before M16 drafting.
- [ ] Every changed path is one of the nine M16 documents or the approved root documentation updates.
- [ ] No source, test, package, lockfile, workflow, configuration, infrastructure, integration, or runtime file changed.

## Document Inventory

- [ ] Core architecture and threat-model specification exists.
- [ ] OpenAI Responses execution-boundary contract exists.
- [ ] Founder decision memo use-case contract exists.
- [ ] Production execution threat model exists.
- [ ] Authentication, authorization, and credential-ownership specification exists.
- [ ] Provider data/privacy/retention/observability/incident/kill-switch policy exists.
- [ ] Acceptance criteria exists.
- [ ] Verification checklist exists.
- [ ] Package README exists.
- [ ] Documentation index, root README, changelog, and ADR ledger reflect the candidate accurately.

## Consistency

- [ ] Provider family is `openai` everywhere.
- [ ] Operation is `founder-decision-memo` everywhere.
- [ ] M16 status is documentation-only and not implemented everywhere.
- [ ] ADR-0020 is Proposed before independent acceptance/merge.
- [ ] `stream: false`, `background: false`, `store: false`, and no tools/state are consistent.
- [ ] The canonical request profile and independently reproduced request plan bind the exact provider-visible immutable model identifier or snapshot, exact authorized `max_output_tokens`, and `truncation = disabled` before credential resolution.
- [ ] The canonical profile binds adapter-derived explicit `service_tier = default` to Authorization/model/admission/cost evidence; omission, `auto`, project-controlled implicit selection, and caller override are prohibited; returned model and effective tier must exactly match authorization.
- [ ] The immutable execution-instruction profile binds fixed system/developer and advisory-output instructions, the eight-section memo definition, deterministic serialization, version/fingerprint, Authorization, request plan, Adapter/model-policy compatibility, independent reproduction, and required evaluation evidence.
- [ ] Prompt caching is classified as provider application state; exact model/project behavior and retention require current human evidence; caller-controlled cache keys, options, retention members, and breakpoints are prohibited; any adapter cache policy is immutably bound.
- [ ] Memo sections, gate order, trust boundaries, future milestone sequence, and terminal decision are consistent.
- [ ] No document claims provider-side deletion, Zero Data Retention, production readiness, live traffic, or execution authority.

## Security and Privacy Review

- [ ] All 25 threat rows have one control and fail-closed result.
- [ ] Prompt injection, confused deputy, replay, SSRF, DNS, TLS, proxy/header injection, model drift, response-storage and prompt-cache retention, cost, ambiguity, output validation, error leakage, side effects, and privileged-host limits are covered.
- [ ] Secret values, authorization headers, raw provider bodies, internal reasoning, paths, environment contents, and unrestricted errors are prohibited.
- [ ] Authentication, authorization, credential lifecycle, resolution, transport, and incident ownership are distinct.
- [ ] Before credential resolution, one exact-attempt-bound Authorization decision atomically transitions from `allowed-unclaimed` to permanent `claimed-by-exact-attempt`; duplicate, concurrent, stale, mismatched, or already-claimed attempts fail as `authorization-rejected`, and downstream failure never makes the claim reusable.
- [ ] A distinct final pre-send gate occurs after credential resolution and immediately before authentication-header construction/send; it verifies the existing exact-attempt claim, revalidates expiry/revocation, credential reference/version, all kill switches, Circuit, Health, and incident state without an unused-state check or new claim, releases the credential on failure, and permits no intervening non-transport work after success.
- [ ] Missing, substituted, stale, unapproved, changed, or caller-controlled execution-instruction profiles fail before credential resolution.
- [ ] Provider/account data controls remain external current human evidence.
- [ ] Omitted or caller-controlled model/output-token/truncation values, mutable model alias substitution, unbounded or null output-token configuration, and `truncation = auto` are rejected before credential resolution.
- [ ] The error inventory is exactly `M16-error-taxonomy-v1`; future additions require an explicit contract version change and no undocumented fallback is allowed.
- [ ] Kill switches override prior readiness and Authorization evidence.

## Placeholder and Link Review

```bash
rg -n 'T[B]D|T[O]DO|FIX[M]E|PLACEHOLD[E]R|lorem[ ]ipsum' docs/milestones/milestone-16 README.md DOCUMENTATION_INDEX.md ARCHITECTURE_DECISIONS.md CHANGELOG.md
```

- [ ] Scan returns no unresolved placeholder.
- [ ] Every relative Markdown link resolves.
- [ ] Official OpenAI links use `developers.openai.com` or `platform.openai.com`.
- [ ] No machine-specific absolute path, credential, personal data, or secret-like value exists.

## Repository Gates

Run from repository root:

```bash
git diff --check
pnpm format:check
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm verify:m15-predecessor-bound
```

- [ ] Every command exits zero.
- [ ] Exact test inventories and any retries are recorded truthfully.
- [ ] No check is reported as passed unless it ran and passed.

## Whole-Candidate Review

- [ ] Record base SHA, HEAD SHA, branch, status, and changed-path manifest.
- [ ] Hash every changed file and the canonical manifest.
- [ ] Provide the complete sanitized candidate to the independent reviewer.
- [ ] Reviewer checks every acceptance criterion and all explicit non-goals.
- [ ] Reviewer returns `GO — M16 ARCHITECTURE COMMIT READY` only at Critical 0, Important 0, Minor 0.
- [ ] Otherwise, perform only bounded authorized remediation and repeat the whole-candidate review.

## Publication Boundary

- [ ] No commit or push occurs before the terminal GO and separate user authorization.
- [ ] No pull request or merge occurs without separate authorization.
- [ ] No implementation, provider configuration, credential action, live request, deployment, or release occurs.
