import { markdownFiles, relativeToRoot, run } from "./lib.mjs";

const files = markdownFiles().map(relativeToRoot);
if (files.length === 0) {
  console.error("No Markdown files found for Vale.");
  process.exit(1);
}

const result = run("vale", files, { allowFailure: true });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`✓ Vale checked ${files.length} Markdown files.`);
