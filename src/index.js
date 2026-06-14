import { NAVION_APP_CONFIG } from "./config/app.config.js";

export function getNavionAppRuntime() {
  return {
    name: "Navion-App",
    layer: "app-shell",
    version: "1.0.0",
    host: NAVION_APP_CONFIG.bindHost,
    port: NAVION_APP_CONFIG.port,
    coreImport: NAVION_APP_CONFIG.coreImportPath,
  };
}
