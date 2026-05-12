(function () {
  var cfg = window.__navion;
  if (!cfg) return;

  var _rl = cfg._rl || window.location;
  var isLiteMode = cfg.mode === "lite";
  var BYPASS_RE = /^(javascript:|data:|blob:|mailto:|tel:|about:|#|\/nv\/)/i;
  var URL_ATTRS = {
    href: true,
    src: true,
    action: true,
    formaction: true,
    poster: true,
    data: true,
    background: true,
    ping: true,
    manifest: true,
    "xlink:href": true,
  };
  var SRCSET_ATTRS = {
    srcset: true,
    imagesrcset: true,
  };
  var SANDBOX_TOKENS = [
    "allow-scripts",
    "allow-same-origin",
    "allow-forms",
    "allow-popups",
    "allow-popups-to-escape-sandbox",
    "allow-presentation",
    "allow-downloads",
  ];
  var LOCAL_PROBE_PATHS = {
    "/generate_204": true,
  };
  var LOCAL_NAVION_PATHS = {
    "/api/fetch": true,
    "/nv.sw.js": true,
    "/nv.client.js": true,
    "/nv.register.js": true,
    "/nav/home": true,
    "/nav/error": true,
    "/app": true,
  };
  var NAVION_DARK_STYLE_ID = "navion-force-dark-style";

  function isYouTubeHostName(host) {
    host = String(host || "").toLowerCase();
    return (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host.endsWith(".youtube.com")
    );
  }

  function isDuckDuckGoHostName(host) {
    host = String(host || "").toLowerCase();
    return host === "duckduckgo.com" || host.endsWith(".duckduckgo.com");
  }

  function isDuckAiHostName(host) {
    host = String(host || "").toLowerCase();
    return host === "duck.ai" || host.endsWith(".duck.ai");
  }

  function currentTargetHost() {
    try {
      return new URL(currentBase()).hostname.toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function forcedDarkCss(host, isYouTube) {
    if (isYouTube) {
      return (
        ":root{color-scheme:dark!important;}" +
        "html,body,ytd-app{background:#0f0f0f!important;color:#f1f1f1!important;}" +
        "html:not([dark]){--yt-spec-base-background:#0f0f0f!important;}" +
        "tp-yt-paper-dialog,#content,#page-manager,ytd-masthead{background:#0f0f0f!important;color:#f1f1f1!important;}" +
        "a,a:visited{color:#8ab4f8!important;}"
      );
    }
    if (isDuckDuckGoHostName(host)) {
      return (
        ":root{color-scheme:dark!important;}" +
        "html,body{background:#0b0d12!important;color:#e8eaed!important;}" +
        "input,textarea,select,button{background:#12161d!important;color:#e8eaed!important;border-color:#3b4252!important;}" +
        "a,a:visited{color:#8ab4f8!important;}"
      );
    }
    if (isDuckAiHostName(host)) {
      return (
        ":root{color-scheme:light dark!important;}" +
        "html,body{filter:none!important;background:unset!important;color:unset!important;}" +
        "img,video,picture,canvas,svg,iframe,embed,object{filter:none!important;}"
      );
    }
    return (
      ":root{color-scheme:dark!important;}" +
      "html{background:#0b0d12!important;}" +
      "html,body{min-height:100%!important;}" +
      "html{filter:invert(1) hue-rotate(180deg)!important;}" +
      "img,video,picture,canvas,svg,iframe,embed,object{filter:invert(1) hue-rotate(180deg)!important;}" +
      "input,textarea,select,button{background:#12161d!important;color:#e8eaed!important;border-color:#3b4252!important;}" +
      "a,a:visited{color:#8ab4f8!important;}"
    );
  }

  function applyYouTubeDarkSignals() {
    try {
      var pref = "f6=400";
      if (document.cookie.indexOf("PREF=") === -1 || document.cookie.indexOf("f6=400") === -1) {
        document.cookie = "PREF=" + pref + "; path=/; max-age=31536000; samesite=lax";
      }
    } catch (_e) {}
    try { localStorage.setItem("yt-dark-theme", "true"); } catch (_e) {}
    try {
      if (document.documentElement && document.documentElement.getAttribute("dark") !== "true") {
        document.documentElement.setAttribute("dark", "true");
      }
      var app = document.querySelector && document.querySelector("ytd-app");
      if (app && app.getAttribute("dark") !== "true") app.setAttribute("dark", "true");
      if (document.body && !document.body.classList.contains("dark")) document.body.classList.add("dark");
    } catch (_e) {}
  }

  function ensureForcedDarkMode() {
    var host = currentTargetHost();
    var isYouTube = isYouTubeHostName(host);
    var css = forcedDarkCss(host, isYouTube);
    var root = document.head || document.documentElement || document.body;
    if (!root) return;
    var style = document.getElementById(NAVION_DARK_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = NAVION_DARK_STYLE_ID;
      root.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    if (document.documentElement && document.documentElement.getAttribute("data-navion-force-dark") !== "1") {
      document.documentElement.setAttribute("data-navion-force-dark", "1");
    }
    if (isYouTube) applyYouTubeDarkSignals();
  }

  function observeForcedDarkMode() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      ensureForcedDarkMode();
    });
    observer.observe(document.documentElement || document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "dark"],
    });
  }

  function currentBase() {
    try {
      if (cfg.base && /^https?:\/\//i.test(cfg.base)) return cfg.base;
      var href = (_rl && _rl.href) || location.href;
      var u = new URL(href);
      if (u.pathname.startsWith("/nv/") && cfg.decode) {
        var decoded = cfg.decode(u.pathname.slice(4));
        if (decoded && /^https?:\/\//i.test(decoded)) {
          cfg.base = decoded;
          return decoded;
        }
      }
      return href;
    } catch (_e) {
      return location.href;
    }
  }

  function rewriteUrlValue(value) {
    var rawValue = value;
    if (value && typeof value === "object" && typeof value.href === "string") {
      rawValue = value.href;
    }
    if (typeof rawValue !== "string") return value;
    var trimmed = rawValue.trim();
    if (!trimmed || BYPASS_RE.test(trimmed)) return value;
    if (LOCAL_PROBE_PATHS[trimmed]) return trimmed;
    if (/^https?:\/\/i\.ytimg\.com\/generate_204/i.test(trimmed)) return "/generate_204";
    if (/^https?:\/\/(?:www\.)?youtube\.com\/generate_204/i.test(trimmed)) return "/generate_204";
    try {
      var existing = new URL(trimmed, location.href);
      if (
        (existing.hostname === "i.ytimg.com" || existing.hostname.endsWith(".ytimg.com") || existing.hostname.endsWith(".youtube.com")) &&
        existing.pathname === "/generate_204"
      ) {
        return "/generate_204";
      }
      if (existing.origin === location.origin) {
        if (LOCAL_PROBE_PATHS[existing.pathname]) return existing.pathname + existing.search + existing.hash;
        if (existing.pathname.startsWith("/nv/") || LOCAL_NAVION_PATHS[existing.pathname]) {
          return value;
        }
      }
    } catch (_e) {}
    var base = currentBase();
    try {
      var siteBase = new URL(base);
      var candidate = new URL(value, location.href);
      if (
        candidate.origin === location.origin &&
        !candidate.pathname.startsWith("/nv/") &&
        !LOCAL_NAVION_PATHS[candidate.pathname]
      ) {
        var rebound = new URL(candidate.pathname + candidate.search + candidate.hash, siteBase.origin).href;
        return cfg.rewrite(rebound, siteBase.href);
      }
    } catch (_e) {}
    return cfg.rewrite(rawValue, base);
  }

  function emitParentLocation() {
    try {
      if (!(window.parent && window.parent !== window)) return;
      var href = window.location.href;
      var display = href;
      var path = window.location.pathname || "";
      if (
        (path === "/" || path === "/index.html" || path === "/app") &&
        window.location.origin === location.origin
      ) {
        return;
      }
      if (path.indexOf("/nv/") === 0 && cfg.decode) {
        var decoded = cfg.decode(path.slice(4));
        if (decoded && /^https?:\/\//i.test(decoded)) display = decoded;
      }
      window.parent.postMessage({ type: "navion-location", url: display, proxyHref: href }, location.origin);
    } catch (_e) {}
  }

  function postOpenInParent(url) {
    if (!(window.parent && window.parent !== window)) return false;
    try {
      window.parent.postMessage({ type: "navion-open-tab", url: url }, location.origin);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function isBrowserOffline() {
    return typeof navigator !== "undefined" && navigator && navigator.onLine === false;
  }

  function buildOfflineErrorPath(rawUrl) {
    var code = "NAVION_OFFLINE";
    var message = "Browser is offline. Reconnect and retry.";
    var encodedTarget = "";
    try {
      var resolved = new URL(rawUrl, currentBase()).href;
      if (/^https?:\/\//i.test(resolved) && cfg.encode) encodedTarget = cfg.encode(resolved);
    } catch (_e) {
      if (typeof rawUrl === "string" && rawUrl.indexOf("/nv/") === 0) {
        encodedTarget = rawUrl.slice(4).split("?")[0].split("#")[0];
      }
    }
    var out = "/nav/error?c=" + encodeURIComponent(code) + "&m=" + encodeURIComponent(message);
    if (encodedTarget) out += "&u=" + encodeURIComponent(encodedTarget);
    return out;
  }

  function forceTopLevelProxyNavigation(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl) return false;
    if (isBrowserOffline()) {
      return postOpenInParent(buildOfflineErrorPath(rawUrl));
    }
    var proxied = rewriteUrlValue(rawUrl);
    if (typeof proxied !== "string" || !proxied) return false;
    return postOpenInParent(proxied);
  }

  function shouldOpenInNewTab(rawHref) {
    if (typeof rawHref !== "string" || !rawHref) return false;
    try {
      var resolved = new URL(rawHref, currentBase());
      var host = resolved.hostname.toLowerCase();
      var path = (resolved.pathname || "").toLowerCase();
      return (
        host === "accounts.google.com" ||
        host.endsWith(".google.com") && (
          path.indexOf("/signin") !== -1 ||
          path.indexOf("/service_login") !== -1 ||
          path.indexOf("/o/oauth2") !== -1 ||
          path.indexOf("/consent") !== -1
        ) ||
        (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com")) && (
          path.indexOf("/signin") !== -1 ||
          path.indexOf("/signin_prompt") !== -1 ||
          path.indexOf("/service_login") !== -1 ||
          path.indexOf("/accounts") !== -1 ||
          path.indexOf("/consent") !== -1
        )
      );
    } catch (_e) {
      return false;
    }
  }

  function youtubeSignInFallbackUrl() {
    return "https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2F";
  }

  function isYouTubeSignInText(value) {
    var text = String(value || "").toLowerCase().trim();
    if (!text) return false;
    return text === "sign in" || text === "signin" || text.indexOf("sign in") !== -1;
  }

  function resolveYouTubeSignInFromTarget(target) {
    if (!target || !target.closest || !isYouTubeHostName(currentTargetHost())) return "";
    var anchor = target.closest("a[href]");
    if (anchor) {
      var href = anchor.getAttribute("href") || "";
      if (href && shouldOpenInNewTab(href)) return href;
    }
    var clickable = target.closest("button,[role='button'],a,tp-yt-paper-button,ytd-button-renderer,yt-button-shape");
    if (!clickable) return "";
    if (isYouTubeSignInText(clickable.getAttribute && clickable.getAttribute("aria-label"))) return youtubeSignInFallbackUrl();
    if (isYouTubeSignInText(clickable.getAttribute && clickable.getAttribute("title"))) return youtubeSignInFallbackUrl();
    if (isYouTubeSignInText(clickable.textContent)) return youtubeSignInFallbackUrl();
    return "";
  }

  function rewriteSrcset(value) {
    if (typeof value !== "string") return value;
    var out = [];
    var current = "";
    var depth = 0;
    var inDataUrl = false;
    var dataCommaSeen = false;
    for (var i = 0; i < value.length; i++) {
      var ch = value[i];
      if (!current.trim() && value.slice(i, i + 5).toLowerCase() === "data:") {
        inDataUrl = true;
        dataCommaSeen = false;
      }
      if (ch === "(") depth++;
      else if (ch === ")" && depth > 0) depth--;
      if (inDataUrl) {
        if (ch === "," && !dataCommaSeen) {
          dataCommaSeen = true;
          current += ch;
          continue;
        }
        if (dataCommaSeen && /\s/.test(ch)) inDataUrl = false;
      }
      if (ch === "," && depth === 0 && !inDataUrl) {
        if (current.trim()) out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) out.push(current.trim());
    for (var j = 0; j < out.length; j++) {
      var part = out[j];
      var pieces = part.split(/\s+/);
      if (!pieces.length) continue;
      var sourceUrl = pieces[0];
      if (/^(data:|blob:)/i.test(sourceUrl)) continue;
      var rewritten = rewriteUrlValue(sourceUrl);
      if (typeof rewritten === "string" && rewritten !== sourceUrl) {
        pieces[0] = rewritten;
        out[j] = pieces.join(" ");
      }
    }
    return out.join(", ");
  }

  function isFrameElement(el) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toLowerCase();
    return tag === "iframe" || tag === "frame";
  }

  function normalizeSandboxValue(value) {
    var tokens = {};
    String(value || "").split(/\s+/).forEach(function (token) {
      if (token) tokens[token] = true;
    });
    for (var i = 0; i < SANDBOX_TOKENS.length; i++) tokens[SANDBOX_TOKENS[i]] = true;
    return Object.keys(tokens).join(" ");
  }

  function repairFrameSandbox(el) {
    if (!isFrameElement(el) || !el.hasAttribute || !el.setAttribute || !el.hasAttribute("sandbox")) return;
    var current = el.getAttribute("sandbox") || "";
    var next = normalizeSandboxValue(current);
    if (next !== current) el.setAttribute("sandbox", next);
  }

  function repairFrameSandboxTree(root) {
    if (!root) return;
    if (root.nodeType === 1) repairFrameSandbox(root);
    if (!root.querySelectorAll) return;
    var frames = root.querySelectorAll("iframe[sandbox],frame[sandbox]");
    for (var i = 0; i < frames.length; i++) repairFrameSandbox(frames[i]);
  }

  function rewriteElementAttr(el, attrName, attrValue) {
    if (typeof attrName !== "string") return attrValue;
    var n = attrName.toLowerCase();
    if (n === "sandbox" && isFrameElement(el)) return normalizeSandboxValue(attrValue);
    if (URL_ATTRS[n]) return rewriteUrlValue(attrValue);
    if (SRCSET_ATTRS[n]) return rewriteSrcset(attrValue);
    return attrValue;
  }

  function rewriteDomTree(root) {
    if (!root || !root.querySelectorAll) return;
    var selector = [
      "[href]", "[src]", "[action]", "[formaction]", "[poster]",
      "[data]", "[background]", "[ping]", "[manifest]", "[xlink\\:href]",
      "[srcset]", "[imagesrcset]", "iframe[sandbox]", "frame[sandbox]"
    ].join(",");
    var nodes = [];
    if (root.nodeType === 1) nodes.push(root);
    var found = root.querySelectorAll(selector);
    for (var i = 0; i < found.length; i++) nodes.push(found[i]);
    for (var j = 0; j < nodes.length; j++) {
      var node = nodes[j];
      if (!node || !node.getAttribute || !node.setAttribute) continue;
      repairFrameSandbox(node);
      for (var attr in URL_ATTRS) {
        if (!node.hasAttribute(attr)) continue;
        var oldUrl = node.getAttribute(attr);
        var newUrl = rewriteUrlValue(oldUrl);
        if (typeof newUrl === "string" && newUrl !== oldUrl) node.setAttribute(attr, newUrl);
      }
      for (var srcAttr in SRCSET_ATTRS) {
        if (!node.hasAttribute(srcAttr)) continue;
        var oldSet = node.getAttribute(srcAttr);
        var newSet = rewriteSrcset(oldSet);
        if (typeof newSet === "string" && newSet !== oldSet) node.setAttribute(srcAttr, newSet);
      }
    }
  }

  function patchAttributeSetter() {
    var nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      try {
        value = rewriteElementAttr(this, name, value);
      } catch (_e) {}
      return nativeSetAttribute.call(this, name, value);
    };
  }

  function patchSandboxRuntimeHooks() {
    var nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      try {
        if (String(name || "").toLowerCase() === "sandbox" && isFrameElement(this)) {
          value = normalizeSandboxValue(value);
        }
      } catch (_e) {}
      return nativeSetAttribute.call(this, name, value);
    };

    var nativeAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
      try { repairFrameSandboxTree(node); } catch (_e) {}
      return nativeAppendChild.call(this, node);
    };

    var nativeInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (node, child) {
      try { repairFrameSandboxTree(node); } catch (_e) {}
      return nativeInsertBefore.call(this, node, child);
    };

    var nativeReplaceChild = Node.prototype.replaceChild;
    Node.prototype.replaceChild = function (node, child) {
      try { repairFrameSandboxTree(node); } catch (_e) {}
      return nativeReplaceChild.call(this, node, child);
    };

    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === "attributes") repairFrameSandbox(m.target);
          if (m.type === "childList") {
            for (var j = 0; j < m.addedNodes.length; j++) repairFrameSandboxTree(m.addedNodes[j]);
          }
        }
      });
      observer.observe(document.documentElement || document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["sandbox"],
      });
    }
    repairFrameSandboxTree(document);
  }

  function patchFrameInsertionHooks() {
    var nativeAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
      try { rewriteDomTree(node); } catch (_e) {}
      return nativeAppendChild.call(this, node);
    };

    var nativeInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (node, child) {
      try { rewriteDomTree(node); } catch (_e) {}
      return nativeInsertBefore.call(this, node, child);
    };

    var nativeReplaceChild = Node.prototype.replaceChild;
    Node.prototype.replaceChild = function (node, child) {
      try { rewriteDomTree(node); } catch (_e) {}
      return nativeReplaceChild.call(this, node, child);
    };
  }

  function patchUrlProperty(proto, propName) {
    if (!proto) return;
    var desc = Object.getOwnPropertyDescriptor(proto, propName);
    if (!desc || !desc.configurable || typeof desc.get !== "function" || typeof desc.set !== "function") return;
    Object.defineProperty(proto, propName, {
      configurable: true,
      enumerable: desc.enumerable,
      get: function () {
        return desc.get.call(this);
      },
      set: function (value) {
        try {
          if (typeof value === "string") value = rewriteUrlValue(value);
        } catch (_e) {}
        return desc.set.call(this, value);
      },
    });
  }

  function patchDomPropertyHooks() {
    patchUrlProperty(window.HTMLAnchorElement && window.HTMLAnchorElement.prototype, "href");
    patchUrlProperty(window.HTMLAreaElement && window.HTMLAreaElement.prototype, "href");
    patchUrlProperty(window.HTMLLinkElement && window.HTMLLinkElement.prototype, "href");
    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, "src");
    patchUrlProperty(window.HTMLImageElement && window.HTMLImageElement.prototype, "srcset");
    patchUrlProperty(window.HTMLScriptElement && window.HTMLScriptElement.prototype, "src");
    patchUrlProperty(window.HTMLIFrameElement && window.HTMLIFrameElement.prototype, "src");
    patchUrlProperty(window.HTMLFormElement && window.HTMLFormElement.prototype, "action");
    patchUrlProperty(window.HTMLButtonElement && window.HTMLButtonElement.prototype, "formAction");
    patchUrlProperty(window.HTMLInputElement && window.HTMLInputElement.prototype, "formAction");
    patchUrlProperty(window.HTMLObjectElement && window.HTMLObjectElement.prototype, "data");
    patchUrlProperty(window.HTMLMediaElement && window.HTMLMediaElement.prototype, "src");
    patchUrlProperty(window.HTMLVideoElement && window.HTMLVideoElement.prototype, "poster");
  }

  function rewriteHtmlSnippet(html) {
    if (typeof html !== "string" || !html) return html;
    var out = html.replace(
      /(\s(?:href|src|action|formaction|poster|data|background|ping|manifest|xlink:href)\s*=\s*["'])([\s\S]*?)(["'])/gi,
      function (_m, pre, val, post) {
        return pre + rewriteUrlValue(val) + post;
      }
    );
    out = out.replace(
      /(\s(?:srcset|imagesrcset)\s*=\s*["'])([\s\S]*?)(["'])/gi,
      function (_m, pre, val, post) {
        return pre + rewriteSrcset(val) + post;
      }
    );
    return out;
  }

  function patchHtmlSinkHooks() {
    if (typeof Element !== "undefined" && typeof Element.prototype.insertAdjacentHTML === "function") {
      var nativeInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
      Element.prototype.insertAdjacentHTML = function (position, text) {
        if (typeof text === "string") text = rewriteHtmlSnippet(text);
        var result = nativeInsertAdjacentHTML.call(this, position, text);
        try { rewriteDomTree(this); } catch (_e) {}
        return result;
      };
    }

    var innerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (innerHtmlDesc && innerHtmlDesc.configurable && typeof innerHtmlDesc.set === "function" && typeof innerHtmlDesc.get === "function") {
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: innerHtmlDesc.enumerable,
        get: function () {
          return innerHtmlDesc.get.call(this);
        },
        set: function (value) {
          if (typeof value === "string") value = rewriteHtmlSnippet(value);
          var result = innerHtmlDesc.set.call(this, value);
          try { rewriteDomTree(this); } catch (_e) {}
          return result;
        },
      });
    }

    var outerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, "outerHTML");
    if (outerHtmlDesc && outerHtmlDesc.configurable && typeof outerHtmlDesc.set === "function" && typeof outerHtmlDesc.get === "function") {
      Object.defineProperty(Element.prototype, "outerHTML", {
        configurable: true,
        enumerable: outerHtmlDesc.enumerable,
        get: function () {
          return outerHtmlDesc.get.call(this);
        },
        set: function (value) {
          if (typeof value === "string") value = rewriteHtmlSnippet(value);
          return outerHtmlDesc.set.call(this, value);
        },
      });
    }

    if (typeof document.write === "function") {
      var nativeWrite = document.write.bind(document);
      document.write = function () {
        var args = Array.prototype.slice.call(arguments).map(function (part) {
          return typeof part === "string" ? rewriteHtmlSnippet(part) : part;
        });
        return nativeWrite.apply(document, args);
      };
    }

    if (typeof document.writeln === "function") {
      var nativeWriteln = document.writeln.bind(document);
      document.writeln = function () {
        var args = Array.prototype.slice.call(arguments).map(function (part) {
          return typeof part === "string" ? rewriteHtmlSnippet(part) : part;
        });
        return nativeWriteln.apply(document, args);
      };
    }
  }

  function observeDynamicDom() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes") {
          var attrName = m.attributeName;
          if (!attrName || !m.target || !m.target.getAttribute || !m.target.setAttribute) continue;
          var current = m.target.getAttribute(attrName);
          var rewritten = rewriteElementAttr(m.target, attrName, current);
          if (typeof rewritten === "string" && rewritten !== current) {
            m.target.setAttribute(attrName, rewritten);
          }
          continue;
        }
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node && node.nodeType === 1) rewriteDomTree(node);
          }
        }
      }
    });
    observer.observe(document.documentElement || document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: Object.keys(URL_ATTRS).concat(Object.keys(SRCSET_ATTRS)).concat(["sandbox"]),
    });
  }

  function patchLocationApi() {
    var proto = window.Location && window.Location.prototype;
    if (!proto) return;
    var hrefDesc = Object.getOwnPropertyDescriptor(proto, "href");
    if (hrefDesc && hrefDesc.configurable && typeof hrefDesc.get === "function" && typeof hrefDesc.set === "function") {
      Object.defineProperty(proto, "href", {
        configurable: true,
        enumerable: hrefDesc.enumerable,
        get: function () {
          return hrefDesc.get.call(this);
        },
        set: function (value) {
          try {
            if (typeof value === "string" && shouldOpenInNewTab(value)) {
              forceTopLevelProxyNavigation(value);
              return;
            }
            if (typeof value === "string") value = rewriteUrlValue(value);
          } catch (_e) {}
          return hrefDesc.set.call(this, value);
        },
      });
    }

    if (typeof proto.assign === "function") {
      var nativeAssign = proto.assign;
      proto.assign = function (url) {
        if (typeof url === "string" && shouldOpenInNewTab(url)) {
          forceTopLevelProxyNavigation(url);
          return;
        }
        if (typeof url === "string") url = rewriteUrlValue(url);
        return nativeAssign.call(this, url);
      };
    }

    if (typeof proto.replace === "function") {
      var nativeReplace = proto.replace;
      proto.replace = function (url) {
        if (typeof url === "string" && shouldOpenInNewTab(url)) {
          forceTopLevelProxyNavigation(url);
          return;
        }
        if (typeof url === "string") url = rewriteUrlValue(url);
        return nativeReplace.call(this, url);
      };
    }
  }

  function patchHistoryApi() {
    if (!window.history) return;
    if (typeof window.history.pushState === "function") {
      var nativePushState = window.history.pushState;
      window.history.pushState = function () {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[2] === "string") args[2] = rewriteUrlValue(args[2]);
        var result = nativePushState.apply(this, args);
        emitParentLocation();
        return result;
      };
    }
    if (typeof window.history.replaceState === "function") {
      var nativeReplaceState = window.history.replaceState;
      window.history.replaceState = function () {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[2] === "string") args[2] = rewriteUrlValue(args[2]);
        var result = nativeReplaceState.apply(this, args);
        emitParentLocation();
        return result;
      };
    }
    window.addEventListener("popstate", function () { emitParentLocation(); }, true);
    window.addEventListener("hashchange", function () { emitParentLocation(); }, true);
  }

  function isProxiedLocalUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      var parsed = new URL(value, location.href);
      return parsed.origin === location.origin && parsed.pathname.indexOf("/nv/") === 0;
    } catch (_e) {
      return value.indexOf("/nv/") === 0;
    }
  }

  function shouldDropNetworkUrl(value) {
    if (typeof value !== "string" || !value) return false;
    try {
      var parsed = new URL(value, currentBase());
      var host = parsed.hostname.toLowerCase();
      var path = parsed.pathname.toLowerCase();
      return (
        host === "improving.duckduckgo.com" ||
        host.endsWith(".improving.duckduckgo.com") ||
        path.indexOf("/t/static_fcp") === 0 ||
        path.indexOf("/t/page_home_searchbox_submit") === 0
      );
    } catch (_e) {
      return false;
    }
  }

  function emptyFetchResponse(url) {
    var headers = { "Cache-Control": "no-store" };
    var lower = String(url || "").toLowerCase();
    if (lower.indexOf(".css") !== -1) headers["Content-Type"] = "text/css; charset=utf-8";
    else if (lower.indexOf(".js") !== -1 || lower.indexOf("/_next/static/chunks/") !== -1) headers["Content-Type"] = "application/javascript; charset=utf-8";
    else if (lower.indexOf(".json") !== -1) headers["Content-Type"] = "application/json; charset=utf-8";
    else headers["Content-Type"] = "text/plain; charset=utf-8";
    var body = headers["Content-Type"].indexOf("json") !== -1 ? "{}" : "";
    return new Response(body, { status: 200, headers: headers });
  }

  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    var requestUrl = "";
    if (typeof input === "string") {
      if (shouldDropNetworkUrl(input)) return Promise.resolve(emptyFetchResponse(input));
      input = rewriteUrlValue(input);
      requestUrl = input;
    } else if (input && typeof input === "object" && input.url) {
      if (shouldDropNetworkUrl(input.url)) return Promise.resolve(emptyFetchResponse(input.url));
      var rewrittenUrl = rewriteUrlValue(input.url);
      if (rewrittenUrl !== input.url) {
        input = new Request(rewrittenUrl, input);
      }
      requestUrl = rewrittenUrl;
    }
    return nativeFetch.apply(this, [input, init]).catch(function (err) {
      if (isProxiedLocalUrl(requestUrl)) return emptyFetchResponse(requestUrl);
      throw err;
    });
  };

  var nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === "string" && shouldDropNetworkUrl(url)) url = "/generate_204";
    if (typeof url === "string") args[1] = rewriteUrlValue(url);
    return nativeXhrOpen.apply(this, args);
  };

  if (typeof window.Request === "function") {
    var NativeRequest = window.Request;
    window.Request = function (input, init) {
      if (typeof input === "string") input = rewriteUrlValue(input);
      else if (input && typeof input === "object" && typeof input.url === "string") {
        var nextUrl = rewriteUrlValue(input.url);
        if (nextUrl !== input.url) input = new NativeRequest(nextUrl, input);
      }
      return new NativeRequest(input, init);
    };
    window.Request.prototype = NativeRequest.prototype;
  }

  if (typeof window.WebSocket === "function") {
    var NativeWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      if (typeof url === "string") url = rewriteUrlValue(url);
      return protocols !== undefined ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;
  }

  if (typeof window.EventSource === "function") {
    var NativeEventSource = window.EventSource;
    window.EventSource = function (url, options) {
      if (typeof url === "string") url = rewriteUrlValue(url);
      return new NativeEventSource(url, options);
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }

  if (navigator.sendBeacon) {
    var nativeSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (typeof url === "string" && shouldDropNetworkUrl(url)) return true;
      if (typeof url === "string") url = rewriteUrlValue(url);
      return nativeSendBeacon(url, data);
    };
  }

  if (typeof window.open === "function") {
    var nativeOpen = window.open;
    window.open = function (url, target, features) {
      if (typeof url === "string") url = rewriteUrlValue(url);
      if (typeof url === "string" && shouldOpenInNewTab(url)) {
        forceTopLevelProxyNavigation(url);
        return null;
      }
      if (postOpenInParent(url)) return null;
      return nativeOpen.call(window, url, target, features);
    };
  }

  if (!isLiteMode && window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigate", function (event) {
      if (!event || !event.canIntercept || event.hashChange || event.downloadRequest !== null) return;
      var destination = event.destination && event.destination.url;
      if (!destination) return;
      var rewritten = rewriteUrlValue(destination);
      if (rewritten === destination) return;
      event.intercept({ handler: function () { return Promise.resolve(); } });
      window.location.href = rewritten;
    });
  }

  if (!isLiteMode && typeof window.Worker === "function") {
    var NativeWorker = window.Worker;
    window.Worker = function (scriptURL, options) {
      var nextURL = typeof scriptURL === "string" ? rewriteUrlValue(scriptURL) : scriptURL;
      return new NativeWorker(nextURL, options);
    };
    window.Worker.prototype = NativeWorker.prototype;
  }

  if (!isLiteMode && typeof window.SharedWorker === "function") {
    var NativeSharedWorker = window.SharedWorker;
    window.SharedWorker = function (scriptURL, options) {
      var nextURL = typeof scriptURL === "string" ? rewriteUrlValue(scriptURL) : scriptURL;
      return new NativeSharedWorker(nextURL, options);
    };
    window.SharedWorker.prototype = NativeSharedWorker.prototype;
  }

  if (!isLiteMode && navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
    var nativeSwRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function (scriptURL, options) {
      if (typeof scriptURL === "string") scriptURL = rewriteUrlValue(scriptURL);
      return nativeSwRegister(scriptURL, options);
    };
  }

  patchLocationApi();
  patchHistoryApi();
  ensureForcedDarkMode();
  observeForcedDarkMode();
  patchSandboxRuntimeHooks();
  if (!isLiteMode) {
    patchDomPropertyHooks();
    patchAttributeSetter();
    patchFrameInsertionHooks();
    patchHtmlSinkHooks();
    rewriteDomTree(document);
    observeDynamicDom();
  }

  document.addEventListener("click", function (e) {
    var signInUrl = resolveYouTubeSignInFromTarget(e.target);
    if (signInUrl) {
      e.preventDefault();
      e.stopPropagation();
      forceTopLevelProxyNavigation(signInUrl);
      return;
    }
    var el = e.target && e.target.closest && e.target.closest("a[href]");
    if (!el) return;
    var href = el.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    var rewritten = rewriteUrlValue(href);
    if (shouldOpenInNewTab(href) || String(el.getAttribute("target") || "").toLowerCase() === "_blank") {
      e.preventDefault();
      e.stopPropagation();
      forceTopLevelProxyNavigation(href);
      return;
    }
    if (rewritten !== href) {
      e.preventDefault();
      e.stopPropagation();
      try { window.location.assign(rewritten); } catch (_e) { window.location.href = rewritten; }
      return;
    }
    setTimeout(function () { emitParentLocation(); }, 0);
  }, true);

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.action) return;
    if (shouldOpenInNewTab(form.action)) {
      e.preventDefault();
      e.stopPropagation();
      forceTopLevelProxyNavigation(form.action);
      return;
    }
    form.action = rewriteUrlValue(form.action);
    setTimeout(function () { emitParentLocation(); }, 0);
  }, true);

  window.addEventListener("load", function () { ensureForcedDarkMode(); emitParentLocation(); }, true);
  document.addEventListener("DOMContentLoaded", function () { ensureForcedDarkMode(); }, true);
  setInterval(function () { ensureForcedDarkMode(); }, 1500);
  setTimeout(function () { ensureForcedDarkMode(); emitParentLocation(); }, 0);
})();
