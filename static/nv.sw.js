const PROXY_ENDPOINT = "/api/fetch";
let lastChallengeBase = null;
let lastChallengeBaseAt = 0;
const NAVION_PREFIX = "/nv/";
const CACHE_NAME = "navion-runtime-v1.0.19";
const RUNTIME_ASSETS = [
  "/nv.sw.js",
  "/nv.client.js?v=1.0.19",
  "/nv.register.js?v=1.0.19",
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
      event.respondWith(handleCrossOriginRequest(event, event.request, url));
    }
    return;
  }
  if (url.pathname.startsWith(NAVION_PREFIX)) {
    event.respondWith(handleRequest(event));
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
});

async function handleLocalRequest(request, url) {
  const cacheKey = url.pathname === "/nv.client.js" ? "/nv.client.js?v=1.0.19" :
    url.pathname === "/nv.register.js" ? "/nv.register.js?v=1.0.19" :
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

async function handleCrossOriginRequest(event, request, requestUrl) {
  if (!needsProxyCrossOriginHost(requestUrl.hostname)) {
    if (shouldUseDirectCrossOrigin(requestUrl)) return safeFetch(request);
    const baseUrl = await resolveBaseUrl(event);
    if (!baseUrl || !shouldProxyEscapedFromBase(baseUrl)) return safeFetch(request);
  }
  return proxyCrossOriginRequest(request, requestUrl);
}

async function proxyCrossOriginRequest(request, requestUrl) {
  if (!needsProxyCrossOriginHost(requestUrl.hostname) && shouldUseDirectCrossOrigin(requestUrl)) {
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

function decodeNavionCookie(value) {
  if (!value) return null;
  const decoded = swDecode(value);
  if (decoded && /^https?:\/\//i.test(decoded)) return decoded;
  try {
    const plain = decodeURIComponent(value);
    if (/^https?:\/\//i.test(plain)) return plain;
  } catch {}
  return /^https?:\/\//i.test(value) ? value : null;
}

function isYouTubePagePath(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/youtubei/") || path.startsWith("/s/")) return true;
  if (path === "/watch") return true;
  if (path.startsWith("/watch/")) return false;
  if (path === "/shorts" || path.startsWith("/shorts/")) return true;
  if (path === "/embed" || path.startsWith("/embed/")) return true;
  if (path === "/results" || path.startsWith("/results/")) return true;
  if (path.startsWith("/channel/") || path.startsWith("/c/") || path.startsWith("/user/")) return true;
  if (path.startsWith("/playlist")) return true;
  if (path.startsWith("/feed/")) return true;
  if (path.startsWith("/@")) return true;
  if (path === "/live_chat" || path.startsWith("/live_chat/")) return true;
  return false;
}

function resolveDefaultBaseTarget(pathname) {
  if (isYouTubePagePath(pathname)) return "https://www.youtube.com/";
  return null;
}

function needsProxyCrossOriginHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "googlevideo.com" ||
    host.endsWith(".googlevideo.com") ||
    host.endsWith(".gstatic.com") ||
    host.endsWith(".ytimg.com") ||
    host.endsWith(".ggpht.com") ||
    host.endsWith(".googleapis.com") ||
    host.endsWith(".doubleclick.net") ||
    host.indexOf("youtube") !== -1
  );
}

function isAdultProxyHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "pornhub.com" ||
    host.endsWith(".pornhub.com") ||
    host.endsWith(".phncdn.com") ||
    host.endsWith(".phprcdn.com") ||
    host.endsWith(".trafficjunky.net") ||
    host === "xvideos.com" ||
    host.endsWith(".xvideos.com") ||
    host.endsWith(".xvideos-cdn.com") ||
    host === "xhamster.com" ||
    host.endsWith(".xhamster.com") ||
    host === "xhamster.desi" ||
    host.endsWith(".xhamster.desi") ||
    host === "eporner.com" ||
    host.endsWith(".eporner.com") ||
    host === "redtube.com" ||
    host.endsWith(".redtube.com") ||
    host === "spankbang.com" ||
    host.endsWith(".spankbang.com") ||
    host === "xnxx.com" ||
    host.endsWith(".xnxx.com") ||
    host === "uncensoredhentai.xxx" ||
    host.endsWith(".uncensoredhentai.xxx") ||
    host === "hentaihaven.xxx" ||
    host.endsWith(".hentaihaven.xxx") ||
    host === "hanime.tv" ||
    host.endsWith(".hanime.tv") ||
    host === "hstream.moe" ||
    host.endsWith(".hstream.moe") ||
    host.endsWith(".sb-cd.com") ||
    host.endsWith(".streamsb.net") ||
    host.endsWith(".doodstream.com") ||
    host.endsWith(".doodcdn.co") ||
    host.endsWith(".htstreaming.com") ||
    host.endsWith(".1hanime.com")
  );
}

function shouldProxyEscapedFromBase(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return needsProxyCrossOriginHost(host) || isAdultProxyHost(host) || host.endsWith(".vercel.app");
  } catch {
    return false;
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

function isShellPath(pathname) {
  return pathname === "/" || pathname === "/app" || pathname === "/index.html";
}

function normalizeTargetUrl(target) {
  try {
    const targetUrl = new URL(target);
    const host = targetUrl.hostname.toLowerCase();
    if (host === "m.youtube.com") {
      targetUrl.hostname = "www.youtube.com";
      return targetUrl.href;
    }
    if (
      (host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "html.duckduckgo.com") &&
      (targetUrl.pathname === "/ai" || targetUrl.pathname.startsWith("/ai/") || targetUrl.searchParams.get("duckai") === "1" || targetUrl.searchParams.get("ia") === "chat" || targetUrl.searchParams.get("iax") === "chat")
    ) {
      return "https://duck.ai/";
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
  if (
    baseUrl &&
    (
      path.startsWith("/_next/") ||
      path.startsWith("/assets/") ||
      path.startsWith("/static/") ||
      path.startsWith("/cdn-cgi/") ||
      path.startsWith("/content/") ||
      path.startsWith("/wp-content/") ||
      path.startsWith("/wp-includes/") ||
      /\.(?:js|mjs|css|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|webm|m3u8|mpd|ts|m4s|m4v|mov|m4a|mp3|aac|vtt)(?:$|\?)/i.test(path)
    )
  ) {
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

function tryDecodeNavionToken(rawToken) {
  let token = rawToken;
  try { token = decodeURIComponent(rawToken); } catch {}
  try {
    const decoded = /^https?:\/\//i.test(token) ? token : swDecode(token);
    if (decoded && /^https?:\/\//i.test(decoded)) return decoded;
  } catch {}
  return null;
}

function isExactNavionToken(rawToken, decoded) {
  if (!decoded) return false;
  try {
    return swEncode(decoded) === rawToken;
  } catch {
    return false;
  }
}

function splitNavionRawPath(rawPath) {
  const slash = rawPath.indexOf("/");
  if (slash >= 0) return { rawToken: rawPath.slice(0, slash), suffix: rawPath.slice(slash) };
  const markers = ["dist/", "_next/", "country.json", "duckchat/", "static/"];
  for (const marker of markers) {
    const index = rawPath.indexOf(marker);
    if (index > 0) return { rawToken: rawPath.slice(0, index), suffix: "/" + rawPath.slice(index) };
  }
  const full = tryDecodeNavionToken(rawPath);
  if (full && isExactNavionToken(rawPath, full)) return { rawToken: rawPath, suffix: "" };
  for (let i = rawPath.length - 1; i >= 12; i--) {
    const candidate = rawPath.slice(0, i);
    const decoded = tryDecodeNavionToken(candidate);
    if (decoded && decoded.endsWith("/") && isExactNavionToken(candidate, decoded) && rawPath.slice(i)) {
      return { rawToken: candidate, suffix: rawPath.slice(i) };
    }
  }
  return { rawToken: rawPath, suffix: "" };
}

function applyNavionSuffix(target, suffix) {
  if (!suffix) return target;
  let piece = suffix;
  if (!piece.startsWith("/")) piece = "/" + piece;
  const suffixUrl = new URL(piece, "https://navion.invalid");
  target.pathname = target.pathname.replace(/\/?$/, "") + suffixUrl.pathname;
  if (suffixUrl.search) target.search = suffixUrl.search;
  if (suffixUrl.hash) target.hash = suffixUrl.hash;
  return target;
}

function resolveTargetFromNavionUrl(url) {
  if (!url.pathname.startsWith(NAVION_PREFIX)) return null;
  const rawPath = url.pathname.slice(NAVION_PREFIX.length);
  if (!rawPath) return null;
  const { rawToken, suffix } = splitNavionRawPath(rawPath);
  let token = rawToken;
  try { token = decodeURIComponent(rawToken); } catch {}
  const decoded = /^https?:\/\//i.test(token) ? token : swDecode(token);
  if (!decoded || !/^https?:\/\//i.test(decoded)) return null;
  try {
    const target = applyNavionSuffix(new URL(decoded), suffix);
    if (url.search && !target.search) target.search = url.search;
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
      const decodedBase = decodeNavionCookie(cookies.nv_base);
      if (decodedBase) return decodedBase;
    }
    if (cookies.nv_origin) {
      const decodedOrigin = decodeNavionCookie(cookies.nv_origin);
      if (decodedOrigin) return decodedOrigin + "/";
    }
  } catch {}

  return null;
}

async function proxyWithEncoded(request, encoded) {
  const apiUrl = new URL(PROXY_ENDPOINT, self.location.origin);
  apiUrl.searchParams.set("url", encoded);

  const forwardHeaders = {};
  let origin = request.headers.get("origin");
  if (!origin && request.referrer) {
    try {
      origin = new URL(request.referrer).origin;
    } catch {}
  }
  for (const [key, value] of request.headers) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "origin") continue;
    forwardHeaders[key] = value;
  }
  if (origin) forwardHeaders.Origin = origin;

  const response = await fetch(apiUrl.href, {
    method: request.method,
    headers: forwardHeaders,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.blob(),
    credentials: "include",
    redirect: "follow",
  });
  return await normalizeProxyResponse(request, response);
}

async function followProxyRedirect(request, response) {
  if (!response || response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get("location");
  if (!location) return response;
  try {
    let target = location;
    const resolved = new URL(location, self.location.origin);
    if (resolved.origin === self.location.origin && resolved.pathname.startsWith(NAVION_PREFIX)) {
      const fromNavion = resolveTargetFromNavionUrl(resolved);
      if (fromNavion) target = fromNavion;
    } else if (!/^https?:/i.test(location)) {
      target = resolved.href;
    }
    const encoded = swEncode(normalizeTargetUrl(target));
    if (!encoded) return response;
    try {
      if (response.body && typeof response.body.cancel === "function") await response.body.cancel();
    } catch {}
    return proxyWithEncoded(request, encoded);
  } catch {
    return response;
  }
}

async function normalizeProxyResponse(request, response) {
  if (!response) return response;
  if (response.status >= 300 && response.status < 400) {
    return followProxyRedirect(request, response);
  }
  if (response.status < 500) return response;
  let host = "";
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname.startsWith(NAVION_PREFIX)) {
      const target = resolveTargetFromNavionUrl(reqUrl);
      if (target) host = new URL(target).hostname.toLowerCase();
    }
  } catch {}
  if (host.endsWith(".googlevideo.com") || host === "googlevideo.com") {
    return new Response("", {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Navion-Playback": "blocked" },
    });
  }
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
  if (PASSTHROUGH.has(requestUrl.pathname) || isShellPath(requestUrl.pathname)) {
    if (requestUrl.pathname === "/generate_204") {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return handleLocalRequest(event.request, requestUrl);
  }

  let baseUrl = await resolveBaseUrl(event);
  if (!baseUrl) baseUrl = resolveDefaultBaseTarget(requestUrl.pathname);
  if (!baseUrl && requestUrl.pathname.startsWith("/cdn-cgi/") && lastChallengeBase && Date.now() - lastChallengeBaseAt < 120000) {
    baseUrl = lastChallengeBase;
  }
  const knownAssetTarget = resolveKnownAssetTarget(requestUrl, baseUrl);
  if (knownAssetTarget) {
    try {
      const targetUrl = new URL(knownAssetTarget);
      if (targetUrl.pathname.startsWith("/cdn-cgi/") || targetUrl.hostname.toLowerCase().indexOf("nhplayer") !== -1) {
        lastChallengeBase = targetUrl.origin + "/";
        lastChallengeBaseAt = Date.now();
      }
    } catch {}
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
    isShellPath(requestUrl.pathname)
  ) {
    return handleLocalRequest(event.request, requestUrl);
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

function isSwNoiseTarget(url) {
  const host = String(url.hostname || "").toLowerCase();
  const path = String(url.pathname || "").toLowerCase();
  return (
    host === "improving.duckduckgo.com" ||
    host.endsWith(".improving.duckduckgo.com") ||
    host === "googleads.g.doubleclick.net" ||
    path.startsWith("/youtubei/v1/log_event") ||
    path.startsWith("/youtubei/v1/feedback") ||
    path.startsWith("/api/stats/") ||
    path.startsWith("/ptracking") ||
    path.indexOf("/t/static_fcp") === 0 ||
    path.indexOf("/t/page_home_searchbox_submit") === 0
  );
}

function shouldReplaceAssetResponse(request, response) {
  if (!request || !response) return false;
  let requestUrl = null;
  try { requestUrl = new URL(request.url); } catch {}
  if (requestUrl && isSwNoiseTarget(requestUrl)) {
    if (response.status >= 400) return true;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    return contentType.includes("text/html");
  }
  return false;
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
  if (request.mode === "navigate" && request.destination === "document") {
    return Response.redirect(`/app?open=${encodeURIComponent(url.pathname + url.search + url.hash)}`, 302);
  }
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

