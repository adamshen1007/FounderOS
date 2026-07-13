import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GENERATED_MARKER, TEMPLATE_DIRECTORY, TEMPLATE_OUTPUTS } from "./constants.mjs";

function valuesFor(manifest) {
  return {
    "project.name": manifest.project.name,
    "project.slug": manifest.project.slug,
    "project.description": manifest.project.description,
    "project.owner": manifest.project.owner,
    "product.audience": manifest.product.audience,
    "product.problem": manifest.product.problem,
    "product.stage": manifest.product.stage
  };
}

export function renderTemplate(source, manifest) {
  const values = valuesFor(manifest);
  const rendered = source.replace(/\{\{([a-z.]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown template variable: ${key}`);
    return values[key];
  });
  const unresolved = rendered.match(/\{\{[^}]+\}\}/);
  if (unresolved) throw new Error(`Unresolved template variable: ${unresolved[0]}`);
  return `${GENERATED_MARKER}\n\n${rendered.trim()}\n`;
}

export function renderKit(manifest) {
  return Object.entries(TEMPLATE_OUTPUTS).map(([templateName, output]) => ({
    path: output,
    content: renderTemplate(readFileSync(resolve(TEMPLATE_DIRECTORY, templateName), "utf8"), manifest)
  }));
}
