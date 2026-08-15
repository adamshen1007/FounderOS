import { openLocalFileReadinessEvaluationLedger } from "../../dist/readiness-ledger.js";
import { openLocalFileReadinessLedgerStorageForTesting } from "../../dist/infrastructure/local-file-readiness-ledger.js";
import process from "node:process";

const options = JSON.parse(process.argv[2]);
if (process.argv[3]) {
  await openLocalFileReadinessLedgerStorageForTesting(options, { genesis: process.argv[3] });
  process.exit(0);
}
const ledger = await openLocalFileReadinessEvaluationLedger(options);
const head = await ledger.readHead();
process.stdout.write(JSON.stringify(head));
