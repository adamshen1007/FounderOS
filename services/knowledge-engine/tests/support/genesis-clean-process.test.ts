import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createReadinessGenesisCommitment } from "../../src/domain/durable-readiness-ledger.js";
import { openLocalFileReadinessLedgerStorageForTesting } from "../../src/infrastructure/local-file-readiness-ledger.js";

import { expect, it } from "vitest";

const genesis = createReadinessGenesisCommitment();
const bytes = JSON.stringify({
  completeHistory: genesis.completeHistory,
  head: genesis.head,
  marker: genesis.marker,
});

const outputPath = process.env.FOUNDEROS_M15_GENESIS_OUTPUT;
if (outputPath !== undefined) writeFileSync(outputPath, bytes, { encoding: "utf8", flag: "wx" });

it(`genesis-clean-process:${Buffer.from(bytes).toString("base64url")}`, () => {
  expect(createReadinessGenesisCommitment()).toEqual(genesis);
});

const initializationLockRuntimeRoot = process.env.FOUNDEROS_M15_INITIALIZATION_LOCK_RUNTIME_ROOT;
const initializationLockRepositoryRoot =
  process.env.FOUNDEROS_M15_INITIALIZATION_LOCK_REPOSITORY_ROOT;

if (initializationLockRuntimeRoot !== undefined && initializationLockRepositoryRoot !== undefined) {
  it("holds a real initialization lock for bounded parent-process byte inspection", async () => {
    await openLocalFileReadinessLedgerStorageForTesting(
      {
        runtimeRoot: initializationLockRuntimeRoot,
        repositoryRoot: initializationLockRepositoryRoot,
        canonicalSourceRoots: [
          join(initializationLockRepositoryRoot, "docs"),
          join(initializationLockRepositoryRoot, "services"),
        ],
        createIfMissing: true,
      },
      { genesis: "pause-after-initialization-lock" },
    );
  }, 120_000);
}
