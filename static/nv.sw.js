const PROXY_ENDPOINT = "/api/fetch";
const NAVION_PREFIX = "/nv/";
const CACHE_NAME = "navion-runtime-v4.2.43";
const RUNTIME_ASSETS = [
  "/nv.sw.js",
  "/nv.client.js?v=4.2.43",
  "/nv.register.js?v=4.2.43",
  "/nav/home",
  "/nav/error",
];
const PASSTHROUGH = new Set([
  "/",
  "/app",
  "/index.html",
  "/favicon.ico",
  "/logo.png",
  "/nv.sw.js",
  "/nv.client.js",
  "/nv.register.js",
  "/api/fetch",
  "/api/navion-status",
  "/generate_204",
  "/nav/home",
  "/nav/error",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(RUNTIME_ASSETS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key === CACHE_NAME ? null : caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "NV_SKIP_WAITING") return;
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === "/api/navion-status" && navigator.onLine === false) {
    event.respondWith(new Response(JSON.stringify({
      name: "Navion-App",
      layer: "app-shell",
      status: "offline",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    }));
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.protocol === "http:" || url.protocol === "https:") {
      event.respondWith(handleCrossOriginRequest(event.request, url));
    }
    return;
  }
  if (PASSTHROUGH.has(url.pathname)) {
    if (url.pathname === "/generate_204") {
      event.respondWith(new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      }));
      return;
    }
    event.respondWith(handleLocalRequest(event.request, url));
    return;
  }

  if (!url.pathname.startsWith(NAVION_PREFIX)) {
    event.respondWith(handleNonNavionRequest(event, url));
    return;
  }

  event.respondWith(handleRequest(event));
});

async function handleLocalRequest(request, url) {
  const cacheKey = url.pathname === "/nv.client.js" ? "/nv.client.js?v=4.2.43" :
    url.pathname === "/nv.register.js" ? "/nv.register.js?v=4.2.43" :
    url.pathname;
  if (request.method !== "GET" || !RUNTIME_ASSETS.includes(cacheKey)) {
    return safeFetch(request);
  }
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const fallback = await cache.match(cacheKey);
    if (fallback) return fallback;
    const empty = emptyAssetResponse(request);
    if (empty) return empty;
    return offlineResponse(request, err && err.message ? err.message : "Failed to fetch", 502);
  }
}

async function handleCrossOriginRequest(request, requestUrl) {
  if (shouldUseDirectCrossOrigin(requestUrl)) {
    return safeFetch(request);
  }
  if (isDroppedTelemetryUrl(requestUrl)) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (
    requestUrl.pathname === "/generate_204" &&
    (requestUrl.hostname === "i.ytimg.com" || requestUrl.hostname.endsWith(".ytimg.com"))
  ) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const encoded = swEncode(requestUrl.href);
  if (!encoded) return proxyFailureResponse(request, "Proxy Encode Failed", "Unable to encode upstream URL.", 502);
  try {
    const response = await proxyWithEncoded(request, encoded);
    if (shouldReplaceAssetResponse(request, response)) return emptyAssetResponse(request);
    if (shouldReplaceNavigationResponse(request, response)) return navigationErrorResponse(request);
    return response;
  } catch (err) {
    const empty = emptyAssetResponse(request);
    if (empty) return empty;
    return proxyFailureResponse(request, "Proxy Fetch Failed", err && err.message ? err.message : "Cross-origin proxy request failed.", 502);
  }
}

function swEncode(url) {
  try {
    return btoa(encodeURIComponent(url))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  } catch {
    return null;
  }
}

function swDecode(encoded) {
  try {
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    return decodeURIComponent(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function shouldUseDirectCrossOrigin(url) {
  const host = String(url.hostname || "").toLowerCase();
  return (
    host === "api.jikan.moe" ||
    host === "cdn.myanimelist.net" ||
    host.endsWith(".myanimelist.net")
  );
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

function normalizeTargetUrl(target) {
  try {
    const targetUrl = new URL(target);
    const host = targetUrl.hostname.toLowerCase();
    if (
      (host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "html.duckduckgo.com") &&
      (targetUrl.pathname === "/ai" || targetUrl.pathname.startsWith("/ai/"))
    ) {
      const aiUrl = new URL("https://duck.ai/");
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
  } catch {}
  return target;
}

function decodeNavionPath(pathname) {
  if (!pathname.startsWith(NAVION_PREFIX)) return null;
  const rawPath = pathname.slice(NAVION_PREFIX.length).split("/")[0];
  if (!rawPath) return null;
  const decodedPath = swDecode(rawPath);
  if (decodedPath) return decodedPath;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

function isDroppedTelemetryUrl(url) {
  const host = String(url.hostname || "").toLowerCase();
  const path = String(url.pathname || "").toLowerCase();
  return (
    host === "improving.duckduckgo.com" ||
    host.endsWith(".improving.duckduckgo.com") ||
    path.indexOf("/t/static_fcp") === 0 ||
    path.indexOf("/t/page_home_searchbox_submit") === 0
  );
}

function resolveKnownAssetTarget(url, baseUrl) {
  const path = String(url.pathname || "");
  if (baseUrl && (path.startsWith("/_next/") || path.startsWith("/assets/") || path.startsWith("/static/"))) {
    try {
      return new URL(path + url.search + url.hash, baseUrl).href;
    } catch {}
  }
  if (
    path.startsWith("/dist/duckai-dist/") ||
    path.startsWith("/dist/locale/") ||
    path === "/country.json" ||
    path.startsWith("/duckchat/")
  ) {
    return new URL(path + url.search + url.hash, "https://duck.ai/").href;
  }
  if (path.startsWith("/_next/")) {
    return new URL(path + url.search + url.hash, "https://duckduckgo.com/").href;
  }
  if (path.startsWith("/dist/")) {
    return new URL(path + url.search + url.hash, "https://duckduckgo.com/").href;
  }
  return null;
}

function resolveTargetFromNavionUrl(url) {
  if (!url.pathname.startsWith(NAVION_PREFIX)) return null;
  const rawPath = url.pathname.slice(NAVION_PREFIX.length);
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
        suffix = "/" + rawPath.slice(index);
        break;
      }
    }
  }
  let token = rawToken;
  try { token = decodeURIComponent(rawToken); } catch {}
  const decoded = /^https?:\/\//i.test(token) ? token : swDecode(token);
  if (!decoded || !/^https?:\/\//i.test(decoded)) return null;
  try {
    const target = new URL(decoded);
    if (suffix) target.pathname = target.pathname.replace(/\/?$/, "") + decodeURI(suffix);
    if (url.search) target.search = url.search;
    return target.href;
  } catch {
    return null;
  }
}

async function resolveRelativeNavionTarget(event, url) {
  const baseUrl = await resolveBaseUrl(event);
  if (!baseUrl) return null;
  try {
    const rawPath = url.pathname.slice(NAVION_PREFIX.length);
    if (!rawPath) return null;
    return new URL(rawPath + url.search + url.hash, baseUrl).href;
  } catch {
    return null;
  }
}

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(";");
  for (let i = 0; i < parts.length; i++) {
    const item = parts[i].trim();
    if (!item) continue;
    const eq = item.indexOf("=");
    if (eq === -1) continue;
    const key = item.slice(0, eq).trim();
    const value = item.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function resolveBaseUrl(event) {
  if (event.request.referrer) {
    try {
      const ref = new URL(event.request.referrer);
      if (ref.origin === self.location.origin) {
        const fromReferrer = decodeNavionPath(ref.pathname);
        const fromReferrerUrl = resolveTargetFromNavionUrl(ref);
        if (fromReferrerUrl) return fromReferrerUrl;
        if (fromReferrer) return fromReferrer;
      }
    } catch {}
  }

  if (event.clientId) {
    try {
      const client = await self.clients.get(event.clientId);
      if (client && client.url) {
        const cu = new URL(client.url);
        if (cu.origin === self.location.origin) {
          const fromClient = decodeNavionPath(cu.pathname);
          const fromClientUrl = resolveTargetFromNavionUrl(cu);
          if (fromClientUrl) return fromClientUrl;
          if (fromClient) return fromClient;
        }
      }
    } catch {}
  }

  try {
    const cookies = parseCookieHeader(event.request.headers.get("cookie") || "");
    if (cookies.nv_base) {
      const decodedBase = swDecode(cookies.nv_base);
      if (decodedBase && /^https?:\/\//i.test(decodedBase)) return decodedBase;
    }
    if (cookies.nv_origin) {
      const decodedOrigin = swDecode(cookies.nv_origin);
      if (decodedOrigin && /^https?:\/\//i.test(decodedOrigin)) return decodedOrigin + "/";
    }
  } catch {}

  return null;
}

async function proxyWithEncoded(request, encoded) {
  const apiUrl = new URL(PROXY_ENDPOINT, self.location.origin);
  apiUrl.searchParams.set("url", encoded);

  const forwardHeaders = {};
  for (const [key, value] of request.headers) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "origin") continue;
    forwardHeaders[key] = value;
  }

  const response = await fetch(apiUrl.href, {
    method: request.method,
    headers: forwardHeaders,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.blob(),
  });
  return normalizeProxyResponse(request, response);
}

function normalizeProxyResponse(request, response) {
  if (!response) return response;
  if (response.status < 500) return response;
  if (isNavigationRequest(request)) return navigationErrorResponse(request);
  const empty = emptyAssetResponse(request);
  if (empty) return empty;
  return new Response("", {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

async function safeFetch(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return offlineResponse(request, err && err.message ? err.message : "Failed to fetch", 502);
  }
}

async function handleNonNavionRequest(event, requestUrl) {
  if (requestUrl.pathname === "/generate_204") {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const baseUrl = await resolveBaseUrl(event);
  const knownAssetTarget = resolveKnownAssetTarget(requestUrl, baseUrl);
  if (knownAssetTarget) {
    const encoded = swEncode(knownAssetTarget);
    if (encoded) {
      try {
        const response = await proxyWithEncoded(event.request, encoded);
        if (shouldReplaceAssetResponse(event.request, response)) return emptyAssetResponse(event.request);
        if (shouldReplaceNavigationResponse(event.request, response)) return navigationErrorResponse(event.request);
        return response;
      } catch (err) {
        const empty = emptyAssetResponse(event.request);
        if (empty) return empty;
        return offlineResponse(event.request, err && err.message ? err.message : "Failed to fetch", 502);
      }
    }
  }
  if (PASSTHROUGH.has(requestUrl.pathname)) {
    return safeFetch(event.request);
  }

  if (
    (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") &&
    !baseUrl
  ) {
    return safeFetch(event.request);
  }
  if (!baseUrl) return safeFetch(event.request);

  try {
    const targetUrl = new URL(
      requestUrl.pathname + requestUrl.search + requestUrl.hash,
      baseUrl
    ).href;
    const encoded = swEncode(targetUrl);
    if (!encoded) return proxyFailureResponse(event.request, "Proxy Encode Failed", "Unable to encode target URL.", 502);

    if (event.request.mode === "navigate") {
      return Response.redirect(NAVION_PREFIX + encoded, 302);
    }
    const response = await proxyWithEncoded(event.request, encoded);
    if (shouldReplaceAssetResponse(event.request, response)) return emptyAssetResponse(event.request);
    if (shouldReplaceNavigationResponse(event.request, response)) return navigationErrorResponse(event.request);
    return response;
  } catch (err) {
    return proxyFailureResponse(event.request, "Proxy Fetch Failed", err && err.message ? err.message : "Failed to proxy non-prefixed request.", 502);
  }
}

function errorResponse(title, message, status) {
  return new Response(`${title}: ${message}`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function proxyFailureResponse(request, title, message, status) {
  if (isNavigationRequest(request)) {
    return navigationErrorResponse(request);
  }
  const empty = emptyAssetResponse(request);
  if (empty) return empty;
  return errorResponse(title, message, status);
}

function navigationErrorResponse(request) {
  let next = "/nav/error";
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.startsWith(NAVION_PREFIX)) {
      const encoded = reqUrl.pathname.slice(NAVION_PREFIX.length).split("?")[0].split("#")[0];
      if (encoded) next = "/nav/error?u=" + encodeURIComponent(encoded);
    }
  } catch {}
  return Response.redirect(next, 302);
}

function isNavigationRequest(request) {
  try {
    const accept = String((request && request.headers && request.headers.get("accept")) || "").toLowerCase();
    return (
      request &&
      (request.mode === "navigate" || request.destination === "document" || accept.includes("text/html"))
    );
  } catch {
    return false;
  }
}

function emptyAssetResponse(request) {
  const dest = String((request && request.destination) || "").toLowerCase();
  let accept = "";
  let pathname = "";
  try {
    accept = String((request && request.headers && request.headers.get("accept")) || "").toLowerCase();
    pathname = new URL(request.url).pathname.toLowerCase();
  } catch {}
  if (dest === "script") {
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (dest === "style") {
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (dest === "font") {
    return new Response(new ArrayBuffer(0), {
      status: 200,
      headers: { "Content-Type": "font/woff2", "Cache-Control": "no-store" },
    });
  }
  if (dest === "audio") {
    return new Response(new ArrayBuffer(0), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }
  if (
    pathname.endsWith(".json") ||
    accept.includes("application/json")
  ) {
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (dest === "image") {
    return new Response(new ArrayBuffer(0), {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  }
  return null;
}

function shouldReplaceAssetResponse(request, response) {
  if (!request || !response) return false;
  const empty = emptyAssetResponse(request);
  if (!empty) return false;
  if (response.status >= 400) return true;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return contentType.includes("text/html");
}

function shouldReplaceNavigationResponse(request, response) {
  return isNavigationRequest(request) && response && response.status >= 500;
}

function offlineResponse(request, message, status) {
  try {
    const accept = String((request && request.headers && request.headers.get("accept")) || "").toLowerCase();
    if (isNavigationRequest(request)) {
      return navigationErrorResponse(request);
    }
  } catch {}
  return errorResponse("Connection Failed", message || "Failed to fetch", status || 502);
}

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);
  let targetUrl = resolveTargetFromNavionUrl(url);
  if (!targetUrl) targetUrl = await resolveRelativeNavionTarget(event, url);
  if (!targetUrl) {
    return errorResponse("Missing URL", "No URL was provided to proxy.", 400);
  }
  targetUrl = normalizeTargetUrl(targetUrl);
  const encoded = swEncode(targetUrl);

  if (!encoded) {
    return errorResponse("Invalid URL", "The URL could not be encoded.", 400);
  }

  try {
    const response = await proxyWithEncoded(request, encoded);
    if (shouldReplaceAssetResponse(request, response)) return emptyAssetResponse(request);
    if (shouldReplaceNavigationResponse(request, response)) return navigationErrorResponse(request);
    return response;
  } catch (err) {
    const empty = emptyAssetResponse(request);
    if (empty) return empty;
    return offlineResponse(request, err && err.message ? err.message : "Failed to fetch", 502);
  }
}

