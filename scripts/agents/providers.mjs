import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../lib.mjs";

export async function fakeProvider({ definition, request }) {
  const fixture = JSON.parse(readFileSync(resolve(ROOT, definition.fixture), "utf8"));
  fixture.runId = request.runId;
  return { proposal: fixture, usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } };
}

function responseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) if (part.type === "output_text" && typeof part.text === "string") return part.text;
  }
  throw new Error("OpenAI response did not contain output text.");
}

export async function openAIProvider(context) {
  const { request, definition, prompt, inputText, outputSchema, apiKey, pricing = {}, fetchImpl = fetch, signal } = context;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for --provider openai.");
  if (!request.model || request.model === "deterministic-fixture-v1") throw new Error("--model is required for --provider openai.");
  if (pricing.inputPerMillion == null || pricing.outputPerMillion == null) {
    throw new Error("OpenAI runs require --input-cost-per-million and --output-cost-per-million for budget enforcement.");
  }
  const maximumCost = ((request.limits.maxInputTokens * pricing.inputPerMillion) + (request.limits.maxOutputTokens * pricing.outputPerMillion)) / 1_000_000;
  if (maximumCost > request.limits.maxCostUsd) throw new Error(`Configured worst-case cost $${maximumCost.toFixed(4)} exceeds the $${request.limits.maxCostUsd} agent limit.`);
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({
      model: request.model,
      instructions: prompt,
      input: `BEGIN UNTRUSTED INPUT\n${inputText}\nEND UNTRUSTED INPUT`,
      max_output_tokens: request.limits.maxOutputTokens,
      store: false,
      text: { format: { type: "json_schema", name: "research_review_proposal", strict: true, schema: outputSchema } }
    })
  });
  if (!response.ok) throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const inputTokens = payload.usage?.input_tokens ?? 0;
  const outputTokens = payload.usage?.output_tokens ?? 0;
  const estimatedCostUsd = ((inputTokens * pricing.inputPerMillion) + (outputTokens * pricing.outputPerMillion)) / 1_000_000;
  return { proposal: JSON.parse(responseText(payload)), usage: { inputTokens, outputTokens, estimatedCostUsd } };
}

export const PROVIDERS = { fake: fakeProvider, openai: openAIProvider };
