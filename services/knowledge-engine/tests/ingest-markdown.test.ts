import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ingestMarkdownDocument, ingestMarkdownFile } from "../src/index.js";

const FIXTURE_DIRECTORY = fileURLToPath(new URL("fixtures", import.meta.url));

describe("Markdown ingestion", () => {
  it("ingests a FounderOS Constitution-derived knowledge fixture", async () => {
    const fixturePath = resolve(FIXTURE_DIRECTORY, "founderos-constitution.md");
    const report = await ingestMarkdownFile(fixturePath);

    expect(report.status).toBe("accepted");
    if (report.status === "accepted") {
      expect(report.object).toMatchObject({
        metadata: {
          id: "governance-constitution-v1",
          objectType: "knowledge",
          validationStatus: "validated",
        },
      });
      expect(report.source.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(report.source.byteLength).toBeGreaterThan(0);
    }
  });

  it("maps a real specification decision example", async () => {
    const fixturePath = resolve(FIXTURE_DIRECTORY, "reddit-connector-decision.md");
    const report = await ingestMarkdownFile(fixturePath);

    expect(report.status).toBe("accepted");
    if (report.status === "accepted") {
      expect(report.object).toMatchObject({
        chosenOption: "Reddit",
        metadata: { objectType: "decision" },
        reviewDate: "2026-10-27",
      });
    }
  });

  it("returns field-level schema errors for invalid FounderOS-derived metadata", async () => {
    const fixturePath = resolve(FIXTURE_DIRECTORY, "invalid-design-principle.md");
    const report = await ingestMarkdownFile(fixturePath);

    expect(report.status).toBe("rejected");
    if (report.status === "rejected") {
      expect(report.errors.every((error) => error.code === "knowledge_validation_error")).toBe(
        true,
      );
      expect(report.errors.map((error) => error.fieldPath)).toEqual(
        expect.arrayContaining(["metadata.domain", "metadata.createdAt", "metadata.status"]),
      );
    }
  });

  it("returns a read error for an inaccessible file", async () => {
    const fixturePath = resolve(FIXTURE_DIRECTORY, "does-not-exist.md");
    const report = await ingestMarkdownFile(fixturePath);

    expect(report).toMatchObject({
      errors: [{ code: "file_read_error" }],
      source: { path: fixturePath },
      status: "rejected",
    });
  });

  it("returns a report for missing frontmatter instead of throwing", () => {
    const report = ingestMarkdownDocument("vault/plain.md", "# Plain Markdown");

    expect(report).toMatchObject({
      errors: [{ code: "missing_frontmatter" }],
      status: "rejected",
    });
  });

  it("returns a report for malformed YAML instead of throwing", () => {
    const report = ingestMarkdownDocument("vault/malformed.md", "---\ntags: [one\n---\nBody");

    expect(report).toMatchObject({
      errors: [{ code: "frontmatter_parse_error" }],
      status: "rejected",
    });
  });

  it("rejects inherited object names as unknown types without throwing", () => {
    const markdown = `---
id: inherited-name
title: Inherited object name
type: toString
domain: FounderOS
created: 2026-07-27
updated: 2026-07-27
status: active
confidence: high
importance: high
---
Body`;

    const report = ingestMarkdownDocument("vault/inherited.md", markdown);

    expect(report).toMatchObject({
      errors: [{ code: "knowledge_validation_error" }],
      status: "rejected",
    });
  });

  it("does not modify source bytes", async () => {
    const fixturePath = resolve(FIXTURE_DIRECTORY, "founderos-constitution.md");
    const before = await readFile(fixturePath);

    await ingestMarkdownFile(fixturePath);

    const after = await readFile(fixturePath);
    expect(after.equals(before)).toBe(true);
  });

  it("returns deterministic source evidence", () => {
    const markdown = "---\nid: test\n---\nBody";
    const first = ingestMarkdownDocument("vault/test.md", markdown);
    const second = ingestMarkdownDocument("vault/test.md", markdown);

    expect(first.source).toEqual(second.source);
  });
});
