import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { BUILD_DIR, markdownFiles, relativeToRoot } from "./lib.mjs";
import { countMermaidBlocks, renderMermaidBlocks } from "./mermaid.mjs";

const outputDirectory = resolve(BUILD_DIR, "diagram-check");
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

let total = 0;
for (const file of markdownFiles()) {
  const markdown = readFileSync(file, "utf8");
  const count = countMermaidBlocks(markdown);
  if (count === 0) continue;
  const fileOutput = resolve(outputDirectory, relativeToRoot(file).replace(/\.md$/i, ""));
  renderMermaidBlocks(markdown, file, fileOutput);
  total += count;
  console.log(`✓ ${relativeToRoot(file)}: ${count} Mermaid diagram${count === 1 ? "" : "s"}`);
}
console.log(`✓ Rendered ${total} Mermaid diagram${total === 1 ? "" : "s"}.`);
