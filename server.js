import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "navion";
import { NAVION_APP_CONFIG } from "./src/config/app.config.js";
import { getNavionAppRuntime } from "./src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = createServer({
  staticDir: path.join(__dirname, "static"),
  port: NAVION_APP_CONFIG.port,
  bindHost: NAVION_APP_CONFIG.bindHost,
  getRuntime: getNavionAppRuntime,
});

server.listen(NAVION_APP_CONFIG.port, NAVION_APP_CONFIG.bindHost, () => {
  console.log("");
  console.log("=".repeat(60));
  console.log("  Navion-App - UI shell");
  console.log(`  Uses Navion core engine from ${NAVION_APP_CONFIG.coreImportPath}`);
  console.log("=".repeat(60));
  console.log(`  Server: http://localhost:${NAVION_APP_CONFIG.port}`);
  console.log("=".repeat(60));
  console.log("");
});

function shutdown() {
  console.log("Navion-App shutdown signal received. Closing server...");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
