import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { BOOK_DIR, listFiles, relativeToRoot } from "./lib.mjs";

const chapters = listFiles(resolve(BOOK_DIR, "chapters"), (file) => extname(file).toLowerCase() === ".md");
const requiredElements = [
  /^#\s+.+/m,
  /^>\s*\*\*Core Principle:/m,
  /^## Learning Objectives$/m,
  /^## Deep Dive$/m,
  /^## AI Founder Interpretation$/m,
  /^## Callout$/m,
  /^## Diagram$/m,
  /^## Checklist$/m,
  /^## Worksheet$/m,
  /^## Key Takeaways$/m,
  /^## Sources$/m,
];
const placeholders = /\b(TODO|TBD|FIXME|citation needed|add (public )?sources?)\b/i;
const failures = [];

if (chapters.length === 0) failures.push("No book chapters were found.");
for (const chapter of chapters) {
  const content = readFileSync(chapter, "utf8");
  for (const required of requiredElements) {
    if (!required.test(content)) failures.push(`${relativeToRoot(chapter)} -> missing required element ${required}`);
  }
  if (placeholders.test(content)) failures.push(`${relativeToRoot(chapter)} -> contains a citation or content placeholder`);
  const sourcesStart = content.search(/^## Sources\s*$/m);
  const sourcesTail = sourcesStart === -1 ? "" : content.slice(sourcesStart).replace(/^## Sources\s*$/m, "");
  const nextHeading = sourcesTail.search(/^##\s+/m);
  const sources = nextHeading === -1 ? sourcesTail : sourcesTail.slice(0, nextHeading);
  if (![...sources.matchAll(/^-\s+\[[^\]]+\]\(https?:\/\/[^)]+\)/gm)].length) {
    failures.push(`${relativeToRoot(chapter)} -> Sources must contain at least one public Markdown link`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
console.log(`✓ Validated structure and citations for ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}.`);
