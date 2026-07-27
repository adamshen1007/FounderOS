import { describe, expect, it } from "vitest";

import { FrontmatterError, parseMarkdown } from "../src/index.js";

describe("parseMarkdown", () => {
  it("parses YAML frontmatter and preserves the Markdown body", () => {
    const markdown = "---\ntitle: Test\ntags:\n  - one\n---\n# Body\n\nText\n";
    const parsed = parseMarkdown(markdown);

    expect(parsed.frontmatter).toEqual({ title: "Test", tags: ["one"] });
    expect(parsed.rawFrontmatter).toBe("title: Test\ntags:\n  - one");
    expect(parsed.body).toBe("# Body\n\nText\n");
  });

  it("supports CRLF delimiter lines", () => {
    const parsed = parseMarkdown("---\r\ntitle: Test\r\n---\r\nBody\r\n");

    expect(parsed.frontmatter).toEqual({ title: "Test" });
    expect(parsed.body).toBe("Body\r\n");
  });

  it("rejects Markdown without frontmatter", () => {
    expect(() => parseMarkdown("# No frontmatter")).toThrowError(FrontmatterError);

    try {
      parseMarkdown("# No frontmatter");
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "missing_frontmatter" });
    }
  });

  it("rejects malformed YAML", () => {
    expect(() => parseMarkdown("---\ntags: [one\n---\nBody")).toThrowError(
      expect.objectContaining({ code: "frontmatter_parse_error" }),
    );
  });

  it("rejects scalar frontmatter", () => {
    expect(() => parseMarkdown("---\njust a string\n---\nBody")).toThrowError(
      expect.objectContaining({ code: "frontmatter_shape_error" }),
    );
  });
});
