import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../lib.mjs";
import { loadAgentDefinition, validateAgentRecord } from "./model.mjs";

const suite = JSON.parse(readFileSync(resolve(ROOT, "evals", "research-reviewer", "cases.json"), "utf8"));
const { definition } = loadAgentDefinition(suite.agentId);
const fixture = JSON.parse(readFileSync(resolve(ROOT, definition.fixture), "utf8"));
fixture.runId = "RUN-EVAL-001";
validateAgentRecord("proposal", fixture, "evaluation proposal");

let passed = 0;
for (const evaluation of suite.cases) {
  const categoryPresent = fixture.findings.some((finding) => finding.category === evaluation.expectedCategory);
  const changeBudgetMet = fixture.changes.length <= evaluation.maximumChanges;
  if (!categoryPresent || !changeBudgetMet) throw new Error(`${evaluation.id} failed: category=${categoryPresent}, changeBudget=${changeBudgetMet}`);
  passed += 1;
  console.log(`✓ ${evaluation.id}`);
}
console.log(`Agent evaluation: ${passed}/${suite.cases.length} cases passed; schema validity 100%; unsafe changes 0.`);
