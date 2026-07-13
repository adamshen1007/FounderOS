import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_DIST_DIR, BOOK_OUTPUT_NAME } from "./lib.mjs";

export function verifyOutputs() {
  const expected = [
    { file: resolve(BOOK_DIST_DIR, "index.html"), kind: "html", minimum: 1_000 },
    { file: resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.epub`), kind: "zip", minimum: 2_000 },
    { file: resolve(BOOK_DIST_DIR, `${BOOK_OUTPUT_NAME}.docx`), kind: "zip", minimum: 2_000 },
  ];
  const failures = [];
  for (const output of expected) {
    if (!existsSync(output.file)) {
      failures.push(`Missing output: ${output.file}`);
      continue;
    }
    const size = statSync(output.file).size;
    if (size < output.minimum) {
      failures.push(`${output.file} is unexpectedly small (${size} bytes).`);
      continue;
    }
    const content = readFileSync(output.file);
    if (output.kind === "zip" && content.subarray(0, 2).toString("ascii") !== "PK") {
      failures.push(`${output.file} does not have a ZIP-compatible signature.`);
    }
    if (output.kind === "html") {
      const html = content.toString("utf8");
      if (!/<title>[^<]*YC Playbook for AI Founders[^<]*<\/title>/i.test(html)) failures.push(`${output.file} does not contain the canonical document title.`);
      if (!/<body[\s>]/i.test(html)) failures.push(`${output.file} has no HTML body.`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return expected.map((output) => ({ file: output.file, size: statSync(output.file).size }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    for (const output of verifyOutputs()) console.log(`✓ ${output.file} (${output.size} bytes)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
