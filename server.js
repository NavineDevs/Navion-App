import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleProxy, decode, encode } from "navion";
import { NAVION_APP_LOCAL_ASSET_PATHS } from "./src/config/routes.js";
import { NAVION_APP_CONFIG } from "./src/config/app.config.js";
import { getNavionAppRuntime } from "./src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_STATIC = path.join(__dirname, "static");
const NAVION_PREFIX = "/nv/";
const DEFAULT_DUCK_AI_ORIGIN = "https://duck.ai/";
const DEFAULT_DUCKDUCKGO_ORIGIN = "https://duckduckgo.com/";

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

function decodeNavionValue(value) {
  if (!value) return null;
  try {
    const decoded = decode(value);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return /^https?:\/\//i.test(value) ? value : null;
  }
}

function resolveBaseFromPath(pathname) {
  if (!pathname || !pathname.startsWith(NAVION_PREFIX)) return null;
  try {
    const target = resolveTargetFromNavionPath(pathname, "");
    if (target) return new URL(target).origin + "/";
  } catch {}
  let raw = "";
  try {
    raw = decodeURIComponent(pathname.slice(NAVION_PREFIX.length).split("/")[0]);
  } catch {
    return null;
  }
  if (!raw) return null;
  return decodeNavionValue(raw);
}

function resolveTargetFromNavionPath(pathname, search) {
  if (!pathname || !pathname.startsWith(NAVION_PREFIX)) return null;
  const rawPath = pathname.slice(NAVION_PREFIX.length);
  if (!rawPath) return null;
  const slash = rawPath.indexOf("/");
  let rawToken = slash === -1 ? rawPath : rawPath.slice(0, slash);
  let suffix = slash === -1 ? "" : rawPath.slice(slash);
  if (!suffix) {
    const markers = ["dist/", "_next/", "country.json", "duckchat/"];
    for (const marker of markers) {
      const index = rawPath.indexOf(marker);
      if (index > 0) {
        rawToken = rawPath.slice(0, index);
        suffix = `/${rawPath.slice(index)}`;
        break;
      }
    }
  }
  const token = decodeURIComponent(rawToken);
  const base = decodeNavionValue(token);
  if (!base) return null;
  const target = new URL(base);
  if (suffix) {
    target.pathname = target.pathname.replace(/\/?$/, "") + decodeURI(suffix);
  }
  if (search) target.search = search;
  return target.href;
}

function resolveRelativeTargetFromNavionPath(pathname, search, baseTarget) {
  if (!pathname || !pathname.startsWith(NAVION_PREFIX) || !baseTarget) return null;
  const rawPath = pathname.slice(NAVION_PREFIX.length);
  if (!rawPath) return null;
  return new URL(rawPath + (search || ""), baseTarget).href;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIMES[ext] || "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "no-store");
  if (path.basename(filePath) === "nv.sw.js") res.setHeader("Service-Worker-Allowed", "/");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Not found");
  });
  stream.pipe(res);
}

function isDroppedTelemetryUrl(url) {
  const host = String(url.hostname || "").toLowerCase();
  const pathname = String(url.pathname || "").toLowerCase();
  return (
    host === "improving.duckduckgo.com" ||
    host.endsWith(".improving.duckduckgo.com") ||
    pathname.indexOf("/t/static_fcp") === 0 ||
    pathname.indexOf("/t/page_home_searchbox_submit") === 0
  );
}

function resolveKnownAssetTarget(pathname, search, baseTarget) {
  const pathValue = String(pathname || "");
  if (baseTarget && (pathValue.startsWith("/_next/") || pathValue.startsWith("/assets/") || pathValue.startsWith("/static/"))) {
    try {
      return new URL(pathValue + (search || ""), baseTarget).href;
    } catch {}
  }
  if (
    pathValue.startsWith("/dist/duckai-dist/") ||
    pathValue.startsWith("/dist/locale/") ||
    pathValue === "/country.json" ||
    pathValue.startsWith("/duckchat/")
  ) {
    return new URL(pathValue + (search || ""), DEFAULT_DUCK_AI_ORIGIN).href;
  }
  if (pathValue.startsWith("/_next/")) {
    return new URL(pathValue + (search || ""), DEFAULT_DUCKDUCKGO_ORIGIN).href;
  }
  if (pathValue.startsWith("/dist/")) {
    return new URL(pathValue + (search || ""), DEFAULT_DUCKDUCKGO_ORIGIN).href;
  }
  return null;
}

function findStaticFile(reqPath) {
  const safePath = reqPath === "/" ? "/index.html" : reqPath;
  const appFile = path.join(APP_STATIC, safePath);
  if (appFile.startsWith(APP_STATIC + path.sep) && fs.existsSync(appFile) && fs.statSync(appFile).isFile()) return appFile;
  return null;
}

function requestOrigin(req) {
  return `http://${req.headers.host}`;
}

function decodeNestedUrl(value) {
  if (!value) return null;
  let out = String(value).replace(/(?:&amp;|&)rut=[^&]+$/i, "").replace(/&amp;/g, "&");
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next.replace(/(?:&amp;|&)rut=[^&]+$/i, "").replace(/&amp;/g, "&");
    } catch {
      break;
    }
  }
  return /^https?:\/\//i.test(out) ? out : null;
}

function normalizeProxyTarget(target) {
  try {
    const targetUrl = new URL(target);
    const host = targetUrl.hostname.toLowerCase();
    if (
      (host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "html.duckduckgo.com") &&
      (targetUrl.pathname === "/ai" || targetUrl.pathname.startsWith("/ai/"))
    ) {
      const aiUrl = new URL(DEFAULT_DUCK_AI_ORIGIN);
      aiUrl.pathname = targetUrl.pathname === "/ai" ? "/" : targetUrl.pathname.slice(3) || "/";
      aiUrl.search = targetUrl.search;
      aiUrl.hash = targetUrl.hash;
      return aiUrl.href;
    }
    if (
      (host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "html.duckduckgo.com") &&
      targetUrl.pathname === "/l/"
    ) {
      const destination = decodeNestedUrl(targetUrl.searchParams.get("uddg"));
      if (destination) return destination;
    }
    if (
      (host === "duckduckgo.com" || host === "www.duckduckgo.com") &&
      (targetUrl.pathname === "/" || targetUrl.pathname === "") &&
      targetUrl.searchParams.get("q")
    ) {
      const htmlUrl = new URL("https://html.duckduckgo.com/html/");
      const keep = ["q", "kl", "kp", "k1", "kz", "df"];
      for (const name of keep) {
        const value = targetUrl.searchParams.get(name);
        if (value !== null) htmlUrl.searchParams.set(name, value);
      }
      return htmlUrl.href;
    }
  } catch {}
  return target;
}

function resolveBaseContext(req) {
  let baseTarget = null;
  let fromProxyReferer = false;
  const origin = requestOrigin(req);
  const referer = req.headers.referer || "";
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === origin) {
        baseTarget = resolveBaseFromPath(refUrl.pathname);
        fromProxyReferer = refUrl.pathname.startsWith("/nv/");
      }
    } catch {}
  }

  if (!baseTarget) {
    try {
      const cookies = parseCookies(req.headers.cookie || "");
      if (cookies.nv_base) {
        baseTarget = decodeNavionValue(cookies.nv_base);
      }
      if (!baseTarget && cookies.nv_origin) {
        const decodedOrigin = decodeNavionValue(cookies.nv_origin);
        if (/^https?:\/\//i.test(decodedOrigin)) baseTarget = decodedOrigin + "/";
      }
    } catch {}
  }

  return { baseTarget, fromProxyReferer };
}

function proxyTarget(req, res, target) {
  const proxyUrl = new URL("/api/fetch", `http://${req.headers.host}`);
  proxyUrl.searchParams.set("url", encode(normalizeProxyTarget(target)));
  return handleProxy(req, res, proxyUrl);
}

function setBaseCookies(res, target) {
  try {
    const targetOrigin = new URL(target).origin;
    const stableBase = encode(targetOrigin + "/");
    const stableOrigin = encode(targetOrigin);
    res.setHeader("Set-Cookie", [
      `nv_base=${stableBase}; Path=/; SameSite=Lax; Max-Age=2592000`,
      `nv_origin=${stableOrigin}; Path=/; SameSite=Lax; Max-Age=2592000`,
    ]);
  } catch {}
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
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1a1f36"/><path d="M16 46V18h8l16 18V18h8v28h-8L24 28v18z" fill="#b8c4ff"/></svg>`;
    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(icon),
    });
    res.end(icon);
    return;
  }

  const baseContext = resolveBaseContext(req);
  const isShellAssetRequest = url.pathname === "/app" || url.pathname === "/index.html";

  if (url.pathname === "/app" && !(baseContext.baseTarget && baseContext.fromProxyReferer)) {
    const filePath = path.join(APP_STATIC, "index.html");
    return serveFile(res, filePath);
  }

  if (url.pathname === "/nav/home") return serveFile(res, path.join(APP_STATIC, "nav.home.html"));
  if (url.pathname === "/nav/error") return serveFile(res, path.join(APP_STATIC, "nav.error.html"));

  const knownAssetTarget = resolveKnownAssetTarget(url.pathname, url.search, baseContext.baseTarget);
  if (knownAssetTarget) {
    return proxyTarget(req, res, knownAssetTarget);
  }

  if (url.pathname.startsWith(NAVION_PREFIX)) {
    const { baseTarget } = baseContext;
    const rawNavionPath = url.pathname.slice(NAVION_PREFIX.length);
    let target = null;
    try { target = resolveTargetFromNavionPath(url.pathname, url.search); } catch {}
    if (!target) {
      try { target = resolveRelativeTargetFromNavionPath(url.pathname, url.search, baseTarget); } catch {}
    }
    if (!target) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    setBaseCookies(res, target);
    try {
      if (isDroppedTelemetryUrl(new URL(target))) {
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
    } catch {}
    try {
      const accept = String(req.headers.accept || "").toLowerCase();
      const targetUrl = new URL(target);
      const suffix = targetUrl.pathname + targetUrl.search + targetUrl.hash;
      if (!rawNavionPath.includes("/") && suffix !== "/" && accept.includes("text/html")) {
        res.writeHead(302, {
          Location: NAVION_PREFIX + encode(targetUrl.origin + "/") + suffix,
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
    } catch {}
    return proxyTarget(req, res, target);
  }

  if (url.pathname === "/nv") {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  let { baseTarget, fromProxyReferer } = baseContext;

  if (!baseTarget) {
    if (url.pathname.startsWith("/youtubei/") || url.pathname.startsWith("/s/")) {
      baseTarget = "https://www.youtube.com/";
    }
  }

  const isRootShellPath = url.pathname === "/" || isShellAssetRequest;

  if (baseTarget && fromProxyReferer && isRootShellPath) {
    try {
      const target = new URL(url.pathname + url.search + url.hash, baseTarget).href;
      const accept = String(req.headers.accept || "").toLowerCase();
      if (req.headers["sec-fetch-dest"] === "document" || accept.includes("text/html")) {
        res.writeHead(302, { Location: NAVION_PREFIX + encode(target) });
        res.end();
        return;
      }
      return proxyTarget(req, res, target);
    } catch {}
  }

  if (isRootShellPath) {
    const shellFile = path.join(APP_STATIC, "index.html");
    return serveFile(res, shellFile);
  }

  if (baseTarget && !NAVION_APP_LOCAL_ASSET_PATHS.has(url.pathname)) {
    try {
      const target = new URL(url.pathname + url.search + url.hash, baseTarget).href;
      return proxyTarget(req, res, target);
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
