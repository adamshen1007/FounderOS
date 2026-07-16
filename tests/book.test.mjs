import assert from "node:assert/strict";
import test from "node:test";
import { canonicalChapterFiles, validateChapter } from "../scripts/book-contract.mjs";

const completeChapter = `# Chapter 2 — Test a Decision

> **Core Principle:** Make the decision testable.

## Learning Objectives

- Name the decision.
- Define the evidence.
- Choose a review date.

## Deep Dive

Explain the decision.

## AI Founder Interpretation

Use AI as bounded assistance.

## Callouts

> **Decision Lens:** State the choice.

> **Common Failure:** Avoid vague evidence.

## Checklist

- [ ] Name the choice.
- [ ] Record evidence.
- [ ] Set a review date.

## Worksheet

| Prompt | Answer |
| --- | --- |
| Decision | |

## Key Takeaways

- Decisions need evidence.
- Evidence needs ownership.
- Reviews need dates.

## Sources

- [Example primary source](https://example.com/source)
`;

test("chapter contract accepts a complete canonical chapter", () => {
  assert.deepEqual(validateChapter("02-test-a-decision.md", completeChapter), []);
});

test("chapter contract reports missing beginner-facing elements", () => {
  const failures = validateChapter("02-test-a-decision.md", "# Chapter 2 — Incomplete\n");
  assert.ok(failures.some((failure) => failure.includes("Core Principle")));
  assert.ok(failures.some((failure) => failure.includes("Worksheet")));
  assert.ok(failures.some((failure) => failure.includes("Sources")));
});

test("canonical contents parser returns ordered chapter filenames", () => {
  assert.deepEqual(canonicalChapterFiles("| 01 | A | `01-a.md` |\n| 02 | B | `02-b.md` |"), ["01-a.md", "02-b.md"]);
});
