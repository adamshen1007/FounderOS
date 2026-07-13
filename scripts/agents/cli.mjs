import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { ROOT } from "../lib.mjs";
import { listAgentDefinitions, loadAgentDefinition } from "./model.mjs";
import { applyRun, inspectRun, reviewRun, runAgent, validateRunPackage } from "./runtime.mjs";

function requiredNumber(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${option} must be a non-negative number.`);
  return number;
}

function listCommand() {
  for (const agent of listAgentDefinitions()) console.log(`${agent.id.padEnd(20)} ${agent.status.padEnd(14)} ${agent.purpose}`);
}

function doctorCommand() {
  let failed = false;
  for (const agent of listAgentDefinitions()) {
    const prompt = resolve(ROOT, agent.prompt);
    const valid = existsSync(prompt) && existsSync(resolve(ROOT, agent.outputSchema));
    console.log(`${valid ? "✓" : "✗"} ${agent.id}: ${agent.status}`);
    failed ||= !valid;
  }
  console.log(`${process.env.OPENAI_API_KEY ? "✓" : "○"} OpenAI key: ${process.env.OPENAI_API_KEY ? "configured" : "optional; fake provider remains available"}`);
  if (failed) throw new Error("Agent doctor found invalid contracts.");
}

export async function runAgentCommand(positionals, options) {
  const [command, subject] = positionals;
  if (command === "list") return listCommand();
  if (command === "doctor") return doctorCommand();
  if (command === "run") {
    if (!subject) throw new Error("agent run requires an agent ID.");
    const pricing = options["input-cost-per-million"] == null ? undefined : {
      inputPerMillion: requiredNumber(options["input-cost-per-million"], "--input-cost-per-million"),
      outputPerMillion: requiredNumber(options["output-cost-per-million"], "--output-cost-per-million")
    };
    const result = await runAgent(subject, {
      subject: options.subject, provider: options.provider, model: options.model,
      runId: options["run-id"], createdAt: options["created-at"], completedAt: options["completed-at"],
      output: options.output, force: options.force, pricing
    });
    console.log(`✓ Proposal created: ${relative(ROOT, result.runDirectory)}`);
    console.log(`✓ ${result.proposal.findings.length} finding(s), ${result.proposal.changes.length} proposed change(s)`);
    return;
  }
  if (command === "status") {
    const run = inspectRun(subject);
    console.log(`${run.summary.runId} ${run.summary.status} ${run.summary.provider}/${run.summary.model}`);
    if (run.proposal) console.log(`${run.proposal.findings.length} finding(s), ${run.proposal.changes.length} proposed change(s)`);
    else if (run.summary.error) console.log(`Failure: ${run.summary.error}`);
    return;
  }
  if (command === "review") {
    const approval = reviewRun(subject, { decision: options.decision, reviewer: options.reviewer, reviewedAt: options["reviewed-at"], note: options.note });
    console.log(`✓ Run ${approval.runId} ${approval.decision} by ${approval.reviewer}`);
    return;
  }
  if (command === "apply") {
    const result = applyRun(subject);
    console.log(`✓ Applied ${result.changed} approved change(s)`);
    return;
  }
  if (command === "validate") {
    const run = validateRunPackage(subject);
    console.log(`✓ Valid agent run: ${run.summary.runId}`);
    return;
  }
  throw new Error("Agent command must be list, doctor, run, status, review, apply, or validate.");
}
