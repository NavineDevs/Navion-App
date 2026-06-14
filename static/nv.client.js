(function () {
  var cfg = window.__navion;
  if (!cfg || typeof cfg.rewrite !== "function") return;
  var mode = cfg.mode || "full";
  var passiveMode = mode === "lite-nav";
  var lightMode = mode === "lite" || passiveMode;
  var navigationRedirecting = false;
  var lastEnforcedProxyPath = "";
  var nativeHistoryReplace = null;

  var URL_ATTRS = { href: 1, src: 1, action: 1, formaction: 1, poster: 1, "data-src": 1, "data-href": 1, "data-url": 1, "data-original": 1, "data-lazy-src": 1, "data-iframe-src": 1, "data-video": 1, "data-file": 1, "data-stream": 1, "data-source": 1, "data-mp4": 1, "data-webm": 1, "data-hls": 1, "data-m3u8": 1, "data-player": 1, "data-embed": 1, "data-id": 1, "data-link": 1, "data-target": 1 };
  var LOCAL_ALLOW = {
    "/api/fetch": 1,
    "/api/navion-status": 1,
    "/favicon.ico": 1,
    "/generate_204": 1,
    "/nav/home": 1,
    "/nav/error": 1,
    "/nv.sw.js": 1,
    "/nv.client.js": 1,
    "/nv.register.js": 1,
    "/app": 1,
    "/index.html": 1
  };

  function needsProxyHost(hostname) {
    var host = String(hostname || "").toLowerCase();
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

  function isYouTubeBarePath(pathname) {
    var path = String(pathname || "");
    if (path.indexOf("/youtubei/") === 0 || path.indexOf("/s/") === 0) return true;
    if (path === "/watch") return true;
    if (path.indexOf("/watch/") === 0) return false;
    if (path === "/shorts" || path.indexOf("/shorts/") === 0) return true;
    if (path === "/results" || path.indexOf("/results/") === 0) return true;
    if (path.indexOf("/feed/") === 0 || path.indexOf("/@") === 0) return true;
    if (path === "/live_chat" || path.indexOf("/live_chat/") === 0) return true;
    return false;
  }

  function isSpaRelativePath(value) {
    return typeof value === "string" && value.charAt(0) === "/" && value.indexOf("//") !== 0;
  }

  function isYouTubeSiteBase(base) {
    return /https?:\/\/(?:[^/]+\.)?youtube\.com\//i.test(String(base || ""));
  }

  function needsProxyHistoryRewrite(url) {
    if (url === undefined || url === null) return false;
    var urlStr = String(url);
    if (!urlStr || urlStr.indexOf("#") === 0) return false;
    if (!isSpaRelativePath(urlStr)) return true;
    return isYouTubeSiteBase(currentBase()) && isYouTubeBarePath(urlStr);
  }

  function isYouTubeShortsView() {
    try {
      var path = String(window.location.pathname || "");
      if (path.indexOf("/shorts") !== -1) return true;
      return /\/shorts(?:\/|$|\?)/i.test(String(currentBase() || ""));
    } catch (_e) {}
    return false;
  }

  function isProxiedNavionUrl(value) {
    if (typeof value !== "string") return false;
    try {
      var parsed = new URL(value, window.location.href);
      return parsed.origin === window.location.origin && parsed.pathname.indexOf("/nv/") === 0;
    } catch (_e) {
      return false;
    }
  }

  function rewriteUrl(value) {
    if (typeof value !== "string") return value;
    if (!value.trim()) return value;
    if (isProxiedNavionUrl(value)) {
      try {
        var proxied = new URL(value, window.location.href);
        return proxied.pathname + proxied.search + proxied.hash;
      } catch (_e0) {
        return value;
      }
    }
    var base = currentBase();
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.origin === window.location.origin) {
        if (!LOCAL_ALLOW[parsed.pathname]) {
          if (isYouTubeBarePath(parsed.pathname)) {
            return cfg.rewrite(parsed.pathname + parsed.search + parsed.hash, base || cfg.base || window.location.href);
          }
          value = parsed.pathname + parsed.search + parsed.hash;
        }
      } else if (needsProxyHost(parsed.hostname)) {
        return cfg.rewrite(parsed.href, base || cfg.base || window.location.href);
      }
    } catch (_e) {}
    return cfg.rewrite(value, base || cfg.base || window.location.href);
  }

  function decodeToken(token) {
    try {
      var p = token + "=".repeat((4 - (token.length % 4)) % 4);
      return decodeURIComponent(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_e) {
      return "";
    }
  }

  function decodeFromPath(pathname, search, hash) {
    if (typeof pathname !== "string" || pathname.indexOf("/nv/") !== 0) return "";
    var rawPath = pathname.slice(4);
    var slash = rawPath.indexOf("/");
    var rawToken = slash < 0 ? rawPath : rawPath.slice(0, slash);
    var suffix = slash < 0 ? "" : rawPath.slice(slash);
    if (!suffix) {
      var markers = ["dist/", "_next/", "country.json", "duckchat/", "static/"];
      for (var i = 0; i < markers.length; i++) {
        var index = rawPath.indexOf(markers[i]);
        if (index > 0) {
          rawToken = rawPath.slice(0, index);
          suffix = "/" + rawPath.slice(index);
          break;
        }
      }
    }
    try { rawToken = decodeURIComponent(rawToken); } catch (_e0) {}
    var decoded = /^https?:\/\//i.test(rawToken) ? rawToken : decodeToken(rawToken);
    if (!/^https?:\/\//i.test(decoded)) return "";
    for (var unwrap = 0; unwrap < 4; unwrap++) {
      try {
        var nested = new URL(decoded);
        if (nested.origin !== window.location.origin || nested.pathname.indexOf("/nv/") !== 0) break;
        var inner = decodeFromPath(nested.pathname, nested.search, nested.hash);
        if (!inner || inner === decoded) break;
        decoded = inner;
      } catch (_e2) {
        break;
      }
    }
    try {
      var target = new URL(decoded);
      if (suffix) target.pathname = target.pathname.replace(/\/?$/, "") + decodeURI(suffix);
      if (search && !target.search) target.search = search;
      if (hash) target.hash = hash;
      var host = target.hostname.toLowerCase();
      if ((host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "html.duckduckgo.com") && (target.pathname === "/ai" || target.pathname.indexOf("/ai/") === 0 || target.searchParams.get("duckai") === "1" || target.searchParams.get("ia") === "chat" || target.searchParams.get("iax") === "chat")) {
        var ai = new URL("https://duck.ai/");
        ai.pathname = target.pathname === "/ai" ? "/" : target.pathname.slice(3) || "/";
        ai.search = target.search;
        ai.hash = target.hash;
        return ai.href;
      }
      return target.href;
    } catch (_e1) {
      return decoded;
    }
  }

  function currentBase() {
    var decoded = decodeFromPath(window.location.pathname, window.location.search, window.location.hash);
    if (decoded && /^https?:\/\//i.test(decoded)) {
      try {
        var u = new URL(decoded);
        return u.origin + "/";
      } catch (_e) {
        return decoded;
      }
    }
    return cfg.base || window.location.href;
  }

  function emitLocation() {
    try {
      if (!(window.parent && window.parent !== window)) return;
      var href = window.location.href;
      var decoded = decodeFromPath(window.location.pathname, window.location.search, window.location.hash);
      window.parent.postMessage(
        { type: "navion-location", url: decoded || href, proxyHref: href },
        window.location.origin
      );
    } catch (_e) {}
  }

  function rewriteNodeAttrs(node) {
    if (!node || node.nodeType !== 1 || !node.getAttribute || !node.setAttribute) return;
    var attrs = node.attributes;
    if (attrs) {
      for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i];
        var name = String(attr.name || "").toLowerCase();
        if (!URL_ATTRS[name]) continue;
        var oldValue = attr.value;
        var nextValue = rewriteUrl(oldValue);
        if (nextValue !== oldValue) node.setAttribute(attr.name, nextValue);
      }
    }
    if (node.querySelectorAll) {
      var list = node.querySelectorAll("[href],[src],[action],[formaction],[poster],[data-src],[data-href],[data-url],[data-original],[data-lazy-src],[data-iframe-src],[data-video],[data-file],[data-stream],[data-source],[data-mp4],[data-webm],[data-hls],[data-m3u8],[data-player],[data-embed],[data-id],[data-link],[data-target]");
      for (var j = 0; j < list.length; j++) rewriteNodeAttrs(list[j]);
    }
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        if (!isProxiedNavionUrl(input)) input = rewriteUrl(input);
      } else if (input && typeof input.url === "string") {
        if (!isProxiedNavionUrl(input.url)) {
          var rewritten = rewriteUrl(input.url);
          if (rewritten !== input.url) input = new Request(rewritten, input);
        }
      }
      return nativeFetch.call(this, input, init);
    };
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || !window.XMLHttpRequest.prototype) return;
    var nativeOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === "string" && !isProxiedNavionUrl(url)) url = rewriteUrl(url);
      return nativeOpen.call(this, method, url, arguments[2], arguments[3], arguments[4]);
    };
  }

  function patchRequest() {
    if (typeof window.Request !== "function") return;
    var NativeRequest = window.Request;
    window.Request = function (input, init) {
      if (typeof input === "string") {
        if (!isProxiedNavionUrl(input)) input = rewriteUrl(input);
      } else if (input && typeof input.url === "string") {
        if (!isProxiedNavionUrl(input.url)) {
          var rewritten = rewriteUrl(input.url);
          if (rewritten !== input.url) input = new NativeRequest(rewritten, input);
        }
      }
      return new NativeRequest(input, init);
    };
    window.Request.prototype = NativeRequest.prototype;
    try { Object.defineProperty(window.Request, "name", { value: "Request" }); } catch (_e0) {}
  }

  function patchLocationMethods() {
    if (!window.location) return;
    ["assign", "replace"].forEach(function (method) {
      var native = window.location[method];
      if (typeof native !== "function") return;
      window.location[method] = function (url) {
        if (typeof url === "string" && needsProxyHistoryRewrite(url)) url = rewriteUrl(url);
        return native.call(this, url);
      };
    });
    try {
      var proto = window.Location && window.Location.prototype;
      var desc = proto && Object.getOwnPropertyDescriptor(proto, "href");
      if (desc && typeof desc.set === "function" && typeof desc.get === "function") {
        Object.defineProperty(window.location, "href", {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (value) {
            if (typeof value === "string" && needsProxyHistoryRewrite(value)) value = rewriteUrl(value);
            return desc.set.call(this, value);
          }
        });
      }
    } catch (_e1) {}
  }

  function patchDynamicImport() {
    if (typeof window.__nvImportPatched !== "undefined") return;
    window.__nvImportPatched = true;
    try {
      var nativeImport = new Function("u", "return import(u)");
      window.__nvDynamicImport = function (url) {
        return nativeImport(typeof url === "string" ? rewriteUrl(url) : url);
      };
    } catch (_e2) {}
  }

  function patchHistory() {
    if (!window.history) return;
    if (typeof window.history.pushState === "function") {
      var nativePush = window.history.pushState;
      window.history.pushState = function (state, title, url) {
        if (needsProxyHistoryRewrite(url)) url = rewriteUrl(String(url));
        var out = nativePush.call(this, state, title, url);
        emitLocation();
        setTimeout(enforceProxyLocation, 0);
        return out;
      };
    }
    if (typeof window.history.replaceState === "function") {
      var nativeReplace = window.history.replaceState;
      nativeHistoryReplace = nativeReplace.bind(window.history);
      window.history.replaceState = function (state, title, url) {
        if (needsProxyHistoryRewrite(url)) url = rewriteUrl(String(url));
        var out = nativeReplace.call(this, state, title, url);
        emitLocation();
        setTimeout(enforceProxyLocation, 0);
        return out;
      };
    }
  }

  function patchWindowOpen() {
    if (typeof window.open !== "function") return;
    window.open = function (url, target, features) {
      if (typeof url !== "string" || !url.trim()) return null;
      var rewritten = rewriteUrl(url);
      var normalizedTarget = String(target || "").toLowerCase();
      if (normalizedTarget === "_self" || normalizedTarget === "_top" || normalizedTarget === "_parent") {
        window.location.assign(rewritten);
      }
      return null;
    };
  }

  function patchConstructor(name) {
    var NativeCtor = window[name];
    if (typeof NativeCtor !== "function") return;
    try {
      window[name] = function (url) {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[0] === "string") args[0] = rewriteUrl(args[0]);
        return new (Function.prototype.bind.apply(NativeCtor, [null].concat(args)))();
      };
      window[name].prototype = NativeCtor.prototype;
      try { Object.defineProperty(window[name], "name", { value: name }); } catch (_e0) {}
    } catch (_e) {}
  }

  function bindNavigationEvents() {
    document.addEventListener("click", function (event) {
      var el = event.target && event.target.closest && event.target.closest("a[href]");
      if (!el) return;
      var href = el.getAttribute("href");
      if (!href || href.indexOf("javascript:") === 0 || href.indexOf("#") === 0) return;
      var rewritten = rewriteUrl(href);
      if (el.getAttribute("target")) el.setAttribute("target", "_self");
      if (rewritten !== href) {
        el.setAttribute("href", rewritten);
        if (isSpaRelativePath(href)) {
          setTimeout(emitLocation, 0);
          return;
        }
        event.preventDefault();
        window.location.assign(rewritten);
        return;
      }
      setTimeout(emitLocation, 0);
    }, true);

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.action) return;
      if (event.defaultPrevented) return;
      var rewritten = rewriteUrl(form.action);
      if (rewritten !== form.action) form.action = rewritten;
      setTimeout(emitLocation, 0);
    }, false);
  }

  function patchNavigationApi() {
    if (!window.navigation || typeof window.navigation.addEventListener !== "function") return;
    try {
      window.navigation.addEventListener("navigate", function (event) {
        if (!event) return;
        if (navigationRedirecting) return;
        if (event.hashChange || event.downloadRequest != null) return;
        if (event.formData) return;
        if (!event.destination || typeof event.destination.url !== "string") return;
        var dest = event.destination.url;
        var rewritten = rewriteUrl(dest);
        if (rewritten === dest) return;
        if (!needsProxyHistoryRewrite(dest)) return;
        if (typeof event.preventDefault === "function" && event.cancelable !== false) {
          event.preventDefault();
        }
        navigationRedirecting = true;
        setTimeout(function () {
          try {
            window.location.assign(rewritten);
          } finally {
            setTimeout(function () { navigationRedirecting = false; }, 500);
          }
        }, 0);
      }, true);
    } catch (_e) {}
  }

  function observeDom() {
    if (!window.MutationObserver) return;
    var root = document.documentElement || document.body;
    if (!root || !root.nodeType) {
      document.addEventListener("DOMContentLoaded", observeDom, { once: true });
      return;
    }
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes") rewriteNodeAttrs(m.target);
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) rewriteNodeAttrs(m.addedNodes[j]);
        }
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href", "src", "action", "formaction", "poster", "data-src", "data-href", "data-url", "data-original", "data-lazy-src", "data-iframe-src", "data-video", "data-file", "data-stream", "data-source", "data-mp4", "data-webm", "data-hls", "data-m3u8", "data-player", "data-embed", "data-id", "data-link", "data-target"]
    });
  }

  function patchSetAttribute() {
    if (!window.Element || !window.Element.prototype) return;
    var nativeSetAttribute = window.Element.prototype.setAttribute;
    window.Element.prototype.setAttribute = function (name, value) {
      if (name && URL_ATTRS[String(name).toLowerCase()] && typeof value === "string") {
        value = rewriteUrl(value);
      }
      return nativeSetAttribute.call(this, name, value);
    };
  }

  function patchUrlProperties() {
    function patchOne(proto, prop) {
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || typeof desc.set !== "function" || typeof desc.get !== "function") return;
      try {
        Object.defineProperty(proto, prop, {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (value) {
            if (typeof value === "string") value = rewriteUrl(value);
            return desc.set.call(this, value);
          }
        });
      } catch (_e) {}
    }
    var pairs = [
      [window.HTMLScriptElement && window.HTMLScriptElement.prototype, "src"],
      [window.HTMLImageElement && window.HTMLImageElement.prototype, "src"],
      [window.HTMLVideoElement && window.HTMLVideoElement.prototype, "src"],
      [window.HTMLAudioElement && window.HTMLAudioElement.prototype, "src"],
      [window.HTMLSourceElement && window.HTMLSourceElement.prototype, "src"],
      [window.HTMLIFrameElement && window.HTMLIFrameElement.prototype, "src"],
      [window.HTMLLinkElement && window.HTMLLinkElement.prototype, "href"],
      [window.HTMLAnchorElement && window.HTMLAnchorElement.prototype, "href"],
      [window.HTMLFormElement && window.HTMLFormElement.prototype, "action"]
    ];
    for (var i = 0; i < pairs.length; i++) {
      patchOne(pairs[i][0], pairs[i][1]);
    }
  }

  function rewriteCurrentDocument() {
    var root = document.documentElement || document.body;
    if (!root || !root.nodeType) {
      document.addEventListener("DOMContentLoaded", rewriteCurrentDocument, { once: true });
      return;
    }
    rewriteNodeAttrs(root);
  }

  function shouldEnforceProxyLocation() {
    if (!passiveMode) return true;
    return isYouTubeSiteBase(currentBase());
  }

  function cleanupSiteOverlays() {
    if (!isYouTubeShortsView()) return;
    var selectors = [
      "tp-yt-iron-overlay-backdrop",
      "ytd-popup-container",
      "iron-overlay-backdrop",
      "ytd-unified-share-panel-renderer",
      "ytd-engagement-panel-section-list-renderer"
    ];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        try {
          if (el.hasAttribute && el.hasAttribute("opened")) el.removeAttribute("opened");
          el.style.display = "none";
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          el.style.visibility = "hidden";
        } catch (_e) {}
      }
    }
    try {
      var style = document.getElementById("nv-shorts-scroll-fix");
      if (!style && document.head) {
        style = document.createElement("style");
        style.id = "nv-shorts-scroll-fix";
        style.textContent = "html,body,ytd-app,#content,#page-manager{overflow:visible!important;overscroll-behavior:auto!important;touch-action:auto!important}tp-yt-iron-overlay-backdrop,iron-overlay-backdrop{pointer-events:none!important;display:none!important}";
        document.head.appendChild(style);
      }
    } catch (_e2) {}
  }

  function enforceProxyLocation() {
    if (window.location.pathname.indexOf("/nv/") === 0) return;
    if (LOCAL_ALLOW[window.location.pathname]) return;
    var base = currentBase();
    if (!/^https?:\/\//i.test(base)) return;
    if (!isYouTubeSiteBase(base)) return;
    try {
      var target = new URL(window.location.pathname + window.location.search + window.location.hash, base);
      var next = "/nv/" + cfg.encode(target.origin + "/") + target.pathname + target.search + target.hash;
      var current = window.location.pathname + window.location.search + window.location.hash;
      if (next === current || next === lastEnforcedProxyPath) return;
      lastEnforcedProxyPath = next;
      var replaceFn = nativeHistoryReplace || window.history.replaceState;
      replaceFn(window.history.state, document.title, next);
      emitLocation();
    } catch (_e) {}
  }

  if (!lightMode) {
    patchSetAttribute();
    patchUrlProperties();
  }
  patchFetch();
  patchXhr();
  patchRequest();
  patchLocationMethods();
  patchDynamicImport();
  if (shouldEnforceProxyLocation()) patchHistory();
  if (shouldEnforceProxyLocation()) patchNavigationApi();
  patchWindowOpen();
  patchConstructor("EventSource");
  patchConstructor("Worker");
  patchConstructor("SharedWorker");
  patchConstructor("WebSocket");
  patchConstructor("Image");
  bindNavigationEvents();
  if (!lightMode) rewriteCurrentDocument();
  if (!lightMode) observeDom();
  if (shouldEnforceProxyLocation()) enforceProxyLocation();
  cleanupSiteOverlays();

  window.addEventListener("load", emitLocation, true);
  if (shouldEnforceProxyLocation()) window.addEventListener("load", enforceProxyLocation, true);
  window.addEventListener("load", cleanupSiteOverlays, true);
  window.addEventListener("hashchange", emitLocation, true);
  window.addEventListener("popstate", emitLocation, true);
  if (shouldEnforceProxyLocation()) setInterval(enforceProxyLocation, 2000);
  setInterval(cleanupSiteOverlays, 1500);
  setTimeout(emitLocation, 0);
})();
