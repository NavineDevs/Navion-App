import { NAVION_APP_CONFIG } from "./config/app.config.js";
import { createUpstreamProxyConfig } from "navion/config";

export function getNavionAppRuntime() {
  const upstreamProxy = createUpstreamProxyConfig(process.env);
  return {
    name: "Navion-App",
    layer: "app-shell",
    version: "1.0.0",
    host: NAVION_APP_CONFIG.bindHost,
    port: NAVION_APP_CONFIG.port,
    coreImport: NAVION_APP_CONFIG.coreImportPath,
    upstreamProxy: {
      enabled: Boolean(upstreamProxy.proxy || upstreamProxy.auto),
      all: upstreamProxy.all,
      auto: upstreamProxy.auto,
      hostRules: upstreamProxy.hosts.length,
    },
  };
}
