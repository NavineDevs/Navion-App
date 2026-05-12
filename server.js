import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleProxy } from "../Navion/src/proxy.js";
import { decode, encode } from "../Navion/src/rewriters/url.js";
import { NAVION_APP_LOCAL_ASSET_PATHS } from "./src/config/routes.js";
import { NAVION_APP_CONFIG } from "./src/config/app.config.js";
import { getNavionAppRuntime } from "./src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_STATIC = path.join(__dirname, "static");

const MIMES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function parseCookies(headerValue) {
  const out = {};
  if (!headerValue) return out;
  const parts = headerValue.split(";");
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    if (!item) continue;
    const eq = item.indexOf("=");
    if (eq === -1) continue;
    const k = item.slice(0, eq).trim();
    const v = item.slice(eq + 1).trim();
    out[k] = v;
  }
  return out;
}

function resolveBaseFromPath(pathname) {
  if (!pathname || !pathname.startsWith("/nv/")) return null;
  const raw = decodeURIComponent(pathname.slice("/nv/".length));
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return decode(raw);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIMES[ext] || "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "no-store");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Not found");
  });
  stream.pipe(res);
}

function findStaticFile(reqPath) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const appFile = path.join(APP_STATIC, safePath);
  if (appFile.startsWith(APP_STATIC + path.sep) && fs.existsSync(appFile) && fs.statSync(appFile).isFile()) return appFile;
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/fetch") return handleProxy(req, res, url);

  if (url.pathname === "/api/navion-status") {
    const runtime = getNavionAppRuntime();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      name: runtime.name,
      layer: runtime.layer,
      version: runtime.version,
      runtime: process.version,
      status: "ok",
      coreImport: runtime.coreImport,
    }));
    return;
  }

  if (url.pathname === "/generate_204") {
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  if (url.pathname === "/favicon.ico") {
    const iconPath = path.join(APP_STATIC, "logo.png");
    if (fs.existsSync(iconPath)) return serveFile(res, iconPath);
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  if (url.pathname === "/app") {
    const filePath = path.join(APP_STATIC, "index.html");
    return serveFile(res, filePath);
  }

  if (url.pathname === "/nav/home") return serveFile(res, path.join(APP_STATIC, "nav.home.html"));
  if (url.pathname === "/nav/error") return serveFile(res, path.join(APP_STATIC, "nav.error.html"));

  if (url.pathname.startsWith("/nv/")) {
    const encoded = url.pathname.slice("/nv/".length);
    if (!encoded) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    try {
      const target = resolveBaseFromPath(url.pathname);
      if (target) {
        const targetOrigin = new URL(target).origin;
        const stableBase = encode(targetOrigin + "/");
        const stableOrigin = encode(targetOrigin);
        res.setHeader("Set-Cookie", [
          `nv_base=${stableBase}; Path=/; SameSite=Lax; Max-Age=2592000`,
          `nv_origin=${stableOrigin}; Path=/; SameSite=Lax; Max-Age=2592000`,
        ]);
      }
    } catch {}
    const proxyUrl = new URL("/api/fetch", `http://${req.headers.host}`);
    proxyUrl.searchParams.set("url", encoded);
    return handleProxy(req, res, proxyUrl);
  }

  if (url.pathname === "/nv") {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  let baseTarget = null;
  let fromProxyReferer = false;
  const referer = req.headers.referer || "";
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === `http://${req.headers.host}`) {
        baseTarget = resolveBaseFromPath(refUrl.pathname);
        fromProxyReferer = refUrl.pathname.startsWith("/nv/");
      }
    } catch {}
  }

  if (!baseTarget) {
    try {
      const cookies = parseCookies(req.headers.cookie || "");
      if (cookies.nv_base) {
        const decodedBase = decode(cookies.nv_base);
        if (/^https?:\/\//i.test(decodedBase)) baseTarget = decodedBase;
      }
      if (!baseTarget && cookies.nv_origin) {
        const decodedOrigin = decode(cookies.nv_origin);
        if (/^https?:\/\//i.test(decodedOrigin)) baseTarget = decodedOrigin + "/";
      }
    } catch {}
  }

  if (!baseTarget) {
    if (url.pathname.startsWith("/youtubei/") || url.pathname.startsWith("/s/")) {
      baseTarget = "https://www.youtube.com/";
    }
  }

  const isRootShellPath = url.pathname === "/" || url.pathname === "/index.html";
  const shouldForceProxyRoot =
    !!baseTarget && isRootShellPath && (fromProxyReferer || !!url.search || !!url.hash);

  if (baseTarget && (!NAVION_APP_LOCAL_ASSET_PATHS.has(url.pathname) || shouldForceProxyRoot)) {
    try {
      const target = new URL(url.pathname + url.search + url.hash, baseTarget).href;
      const proxyUrl = new URL("/api/fetch", `http://${req.headers.host}`);
      proxyUrl.searchParams.set("url", encode(target));
      return handleProxy(req, res, proxyUrl);
    } catch {}
  }

  const filePath = findStaticFile(url.pathname);
  if (filePath) return serveFile(res, filePath);

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const PORT = NAVION_APP_CONFIG.port;
const HOST = NAVION_APP_CONFIG.bindHost;
server.listen(PORT, HOST, () => {
  console.log("");
  console.log("═".repeat(60));
  console.log("  Navion-App - UI shell");
  console.log(`  Uses Navion core engine from ${NAVION_APP_CONFIG.coreImportPath}`);
  console.log("═".repeat(60));
  console.log(`  Server: http://localhost:${PORT}`);
  console.log("═".repeat(60));
  console.log("");
});

function shutdown() {
  console.log("Navion-App shutdown signal received. Closing server...");
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
