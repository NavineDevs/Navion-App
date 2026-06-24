export const NAVION_APP_CONFIG = {
  bindHost: process.env.NAVION_APP_HOST || "0.0.0.0",
  port: parseInt(process.env.PORT || "8090", 10),
  coreImportPath: process.env.NAVION_USE_NPM_CORE === "1" ? "navion@npm" : "navion (local file:../Navion when present)",
};