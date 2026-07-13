import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertRepositoryPath } from "../generator/paths.mjs";
import { RESEARCH_GENERATOR_VERSION, RESEARCH_MARKER, RESEARCH_OUTPUT, RESEARCH_STATE } from "./constants.mjs";
import { renderResearchBrief } from "./brief.mjs";
import { loadResearch } from "./model.mjs";

export function researchHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readState(stateFile) {
  if (!existsSync(stateFile)) return null;
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    if (state.generatorVersion !== RESEARCH_GENERATOR_VERSION || typeof state.outputHash !== "string") {
      throw new Error("unsupported research state");
    }
    return state;
  } catch (error) {
    throw new Error(`Could not read research state ${stateFile}: ${error.message}`);
  }
}

export function planResearchBuild(manifestFile, options = {}) {
  const data = loadResearch(manifestFile);
  const outputFile = assertRepositoryPath(resolve(data.directory, RESEARCH_OUTPUT), { label: "Research output" });
  const stateFile = assertRepositoryPath(resolve(data.directory, RESEARCH_STATE), { label: "Research state" });
  const content = renderResearchBrief(data);
  const state = readState(stateFile);
  let action = "create";
  if (existsSync(outputFile)) {
    const current = readFileSync(outputFile, "utf8");
    if (current === content) action = "unchanged";
    else if (options.force) action = "replace";
    else if (!state || researchHash(current) !== state.outputHash || !current.startsWith(RESEARCH_MARKER)) action = "conflict";
    else action = "update";
  }
  return { data, outputFile, stateFile, content, action };
}

export function buildResearch(manifestFile, options = {}) {
  const plan = planResearchBuild(manifestFile, options);
  if (plan.action === "conflict") {
    throw new Error(`Research build stopped to protect human changes: ${plan.outputFile}\nUse --force only after reviewing the generated brief.`);
  }
  if (options.check && plan.action !== "unchanged") {
    throw new Error(`Research brief is out of date: ${plan.action} ${plan.outputFile}`);
  }
  if (!options.dryRun && !options.check && plan.action !== "unchanged") {
    mkdirSync(dirname(plan.outputFile), { recursive: true });
    writeFileSync(plan.outputFile, plan.content);
    mkdirSync(dirname(plan.stateFile), { recursive: true });
    writeFileSync(plan.stateFile, `${JSON.stringify({
      generatorVersion: RESEARCH_GENERATOR_VERSION,
      output: RESEARCH_OUTPUT,
      outputHash: researchHash(plan.content)
    }, null, 2)}\n`);
  }
  return plan;
}
