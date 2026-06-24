import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localCore = path.resolve(root, "../Navion/package.json");
const useNpmCore = String(process.env.NAVION_USE_NPM_CORE || "").trim() === "1";
const forceLocal = String(process.env.NAVION_USE_LOCAL_CORE || "").trim() === "1";
const shouldUseLocal = !useNpmCore && (forceLocal || fs.existsSync(localCore));

if (!shouldUseLocal || process.env.NAVION_CORE_RESOLVE === "1") {
  process.exit(0);
}

process.env.NAVION_CORE_RESOLVE = "1";
execSync("npm install file:../Navion --ignore-scripts", {
  cwd: root,
  stdio: "inherit",
});
