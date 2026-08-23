# FounderOS Founder Decision Memo Use Case Contract v1.0

## Status

**Specified — no generation runtime authorized**

## Purpose

Define the sole advisory use case selected for the first future OpenAI provider boundary.

## Operation Identity

- Operation: `founder-decision-memo`
- Provider family: OpenAI
- Interaction: one foreground non-streaming request
- Input: one verified governed Context Package plus one explicit founder decision question
- Output: one bounded advisory text memo
- Side effects: none

## Preconditions

- The Context Package verifies against current trusted KnowledgeOS authority.
- Delivery and Invocation evidence verify and remain within freshness and budget limits.
- The requesting Consumer is explicitly capable of requesting this operation.
- A future Authorization Decision is atomically `claimed-by-exact-attempt`, unexpired, and bound to the exact attempt, operation, and execution-instruction profile.
- Provider, credential-reference, transport, rate, cost, Circuit, Health, privacy, observability, and incident gates pass.
- The founder decision question is non-empty, bounded, and free of credential or executable payload material.

## Required Memo Sections

The future output instruction must request these human-readable sections in this order:

1. Decision question
2. Executive summary
3. Options considered
4. Recommendation
5. Evidence references
6. Assumptions and uncertainties
7. Risks
8. Proposed next action

The response mapper stores the memo as bounded text and does not infer that section presence makes its claims true.

The fixed system/developer instruction, advisory-output instruction, exact eight-section definition above, and deterministic instruction serialization form one immutable FounderOS execution-instruction profile with an explicit version and cryptographic fingerprint. Authorization, the request plan, Adapter/model-policy compatibility evidence, and independent reproduction must bind that exact identity and fingerprint. Changing any instruction or serialization requires new authorization plus the relevant quality and injection-resistance evaluation; missing, substituted, stale, unapproved, or caller-controlled profiles fail before credential resolution.

## Evidence References

The memo may cite only logical evidence identifiers already present in the verified Context Package. It must not disclose physical source paths, credentials, internal fingerprints intended to remain private, hidden provider metadata, or unsupported external citations.

An evidence reference indicates which governed input informed the memo. It is not proof that the model interpreted that evidence correctly.

## Human Authority

The memo is advisory. A human retains authority over every strategic, financial, legal, publishing, external, irreversible, or high-risk action.

The memo cannot:

- approve its own recommendation;
- create or modify Authorization evidence;
- activate Knowledge, snapshots, or provider capabilities;
- send messages, publish content, spend money, sign agreements, or mutate external systems;
- invoke another model, tool, Agent, Hermes, MCP, or integration;
- become a system instruction or executable task automatically.

## Input Exclusions

- Arbitrary prompts unrelated to the selected operation
- Raw vault or filesystem access
- Unverified Knowledge Objects, Query Results, or caller-selected context
- Secrets, credential values, personal data not already approved for the Context Package, or environment dumps
- Files, images, audio, websites, third-party tool outputs, or hidden attachments
- Instructions to ignore FounderOS governance or disclose protected material

## Output Limits

A future implementation must bind exact byte, token, and section-count limits before transport. Truncation after receipt cannot convert an oversized or partial response into a valid memo; the attempt fails with sanitized evidence.

## Quality and Safety Evaluation

Before live authorization, a separately approved evaluation must measure at least:

- faithfulness to supplied evidence;
- explicit uncertainty and assumption handling;
- unsupported-claim rate;
- recommendation traceability;
- instruction-hierarchy resistance;
- sensitive-data leakage;
- prohibited-action language;
- output-shape compliance;
- stability under equivalent governed inputs.

Quality evaluation cannot replace authorization, privacy, cost, or transport gates.

## Terminal Result

The future operation yields either one verified advisory memo envelope or one fail-closed sanitized failure. There is no partially accepted memo and no automatic side effect.
