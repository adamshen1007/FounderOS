import process from "node:process";

import {
  validateMilestone15ImplementationAuthorization,
  validateMilestone15RepositoryObservation,
} from "../../scripts/validate-milestone-15-implementation-preflight.mjs";

try {
  const mode = process.argv[2];
  const input = JSON.parse(process.argv[3] ?? "null");
  if (mode === "authorization") validateMilestone15ImplementationAuthorization(input);
  else if (mode === "observation") validateMilestone15RepositoryObservation(input);
  else throw new Error("preflight-test-mode-rejected");
  process.stdout.write("preflight-test-valid\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "preflight-test-failed"}\n`);
  process.exitCode = 1;
}
