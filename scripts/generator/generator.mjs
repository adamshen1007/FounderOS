import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { GENERATED_MARKER, GENERATOR_VERSION, STATE_DIRECTORY, STATE_FILE } from "./constants.mjs";
import { loadManifest, resolveOutputDirectory } from "./manifest.mjs";
import { renderKit } from "./templates.mjs";
import { assertRepositoryPath } from "./paths.mjs";

export function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readState(outputDirectory) {
  const stateFile = resolve(outputDirectory, STATE_DIRECTORY, STATE_FILE);
  assertRepositoryPath(stateFile, { label: "Generation state" });
  if (!existsSync(stateFile)) return { generatorVersion: GENERATOR_VERSION, files: {} };
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (state.generatorVersion !== GENERATOR_VERSION || typeof state.files !== "object") throw new Error("unsupported generation state");
    return state;
  } catch (error) {
    throw new Error(`Could not read generation state ${stateFile}: ${error.message}`);
  }
}

function classifyFile(file, desired, previousHash, force) {
  if (!existsSync(file)) return "create";
  const current = readFileSync(file, "utf8");
  if (current === desired) return "unchanged";
  if (force) return "replace";
  if (!previousHash) return "conflict";
  if (hash(current) !== previousHash) return "conflict";
  if (!current.startsWith(GENERATED_MARKER)) return "conflict";
  return "update";
}

export function planGeneration(manifestFile, options = {}) {
  const { manifest } = loadManifest(manifestFile);
  const outputDirectory = resolveOutputDirectory(manifest, resolve(manifestFile));
  const state = readState(outputDirectory);
  const files = renderKit(manifest).map((entry) => {
    const absolutePath = resolve(outputDirectory, entry.path);
    assertRepositoryPath(absolutePath, { label: `Generated file ${entry.path}` });
    return { ...entry, absolutePath, action: classifyFile(absolutePath, entry.content, state.files[entry.path], options.force) };
  });
  return { manifest, manifestFile: resolve(manifestFile), outputDirectory, state, files };
}

export function generateKit(manifestFile, options = {}) {
  const plan = planGeneration(manifestFile, options);
  const conflicts = plan.files.filter((file) => file.action === "conflict");
  if (conflicts.length > 0) {
    const paths = conflicts.map((file) => `- ${relative(plan.outputDirectory, file.absolutePath)}`).join("\n");
    throw new Error(`Generation stopped to protect user-owned changes:\n${paths}\nUse --force only after reviewing these files.`);
  }
  const changes = plan.files.filter((file) => file.action !== "unchanged");
  if (options.check && changes.length > 0) {
    const paths = changes.map((file) => `- ${file.action}: ${file.path}`).join("\n");
    throw new Error(`Generated example is out of date:\n${paths}`);
  }
  if (!options.dryRun && !options.check) {
    for (const file of changes) {
      mkdirSync(dirname(file.absolutePath), { recursive: true });
      writeFileSync(file.absolutePath, file.content);
    }
    const nextState = {
      generatorVersion: GENERATOR_VERSION,
      files: Object.fromEntries(plan.files.map((file) => [file.path, hash(file.content)]))
    };
    const stateFile = resolve(plan.outputDirectory, STATE_DIRECTORY, STATE_FILE);
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, `${JSON.stringify(nextState, null, 2)}\n`);
  }
  return { ...plan, changes };
}
