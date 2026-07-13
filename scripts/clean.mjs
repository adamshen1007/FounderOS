import { rmSync } from "node:fs";
import { BUILD_DIR, DIST_DIR } from "./lib.mjs";

rmSync(BUILD_DIR, { recursive: true, force: true });
rmSync(DIST_DIR, { recursive: true, force: true });
console.log("✓ Removed build/ and dist/.");
