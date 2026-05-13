(function () {
  var cfg = window.__navion;
  if (!cfg || typeof cfg.rewrite !== "function") return;

  var URL_ATTRS = { href: 1, src: 1, action: 1, formaction: 1, poster: 1 };

  function rewriteUrl(value) {
    if (typeof value !== "string") return value;
    if (!value.trim()) return value;
    return cfg.rewrite(value, cfg.base || window.location.href);
  }

  function decodeToken(token) {
    try {
      var p = token + "=".repeat((4 - (token.length % 4)) % 4);
      return decodeURIComponent(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
    } catch (_e) {
      return "";
    }
  }

  function decodeFromPath(pathname) {
    if (typeof pathname !== "string" || pathname.indexOf("/nv/") !== 0) return "";
    var encoded = pathname.slice(4).split("?")[0].split("#")[0];
    return decodeToken(encoded);
  }

  function emitLocation() {
    try {
      if (!(window.parent && window.parent !== window)) return;
      var href = window.location.href;
      var decoded = decodeFromPath(window.location.pathname);
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
      var list = node.querySelectorAll("[href],[src],[action],[formaction],[poster]");
      for (var j = 0; j < list.length; j++) rewriteNodeAttrs(list[j]);
    }
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") return;
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        input = rewriteUrl(input);
      } else if (input && typeof input.url === "string") {
        var rewritten = rewriteUrl(input.url);
        if (rewritten !== input.url) input = new Request(rewritten, input);
      }
      return nativeFetch.call(this, input, init);
    };
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || !window.XMLHttpRequest.prototype) return;
    var nativeOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === "string") url = rewriteUrl(url);
      return nativeOpen.call(this, method, url, arguments[2], arguments[3], arguments[4]);
    };
  }

  function patchHistory() {
    if (!window.history) return;
    if (typeof window.history.pushState === "function") {
      var nativePush = window.history.pushState;
      window.history.pushState = function (state, title, url) {
        if (typeof url === "string") url = rewriteUrl(url);
        var out = nativePush.call(this, state, title, url);
        emitLocation();
        return out;
      };
    }
    if (typeof window.history.replaceState === "function") {
      var nativeReplace = window.history.replaceState;
      window.history.replaceState = function (state, title, url) {
        if (typeof url === "string") url = rewriteUrl(url);
        var out = nativeReplace.call(this, state, title, url);
        emitLocation();
        return out;
      };
    }
  }

  function patchWindowOpen() {
    if (typeof window.open !== "function") return;
    var nativeOpen = window.open;
    window.open = function (url, target, features) {
      if (typeof url === "string") url = rewriteUrl(url);
      return nativeOpen.call(window, url, target, features);
    };
  }

  function bindNavigationEvents() {
    document.addEventListener("click", function (event) {
      var el = event.target && event.target.closest && event.target.closest("a[href]");
      if (!el) return;
      var href = el.getAttribute("href");
      if (!href || href.indexOf("javascript:") === 0 || href.indexOf("#") === 0) return;
      var rewritten = rewriteUrl(href);
      if (rewritten !== href) {
        event.preventDefault();
        window.location.assign(rewritten);
        return;
      }
      setTimeout(emitLocation, 0);
    }, true);

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.action) return;
      var rewritten = rewriteUrl(form.action);
      if (rewritten !== form.action) form.action = rewritten;
      setTimeout(emitLocation, 0);
    }, true);
  }

  function observeDom() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes") rewriteNodeAttrs(m.target);
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) rewriteNodeAttrs(m.addedNodes[j]);
        }
      }
    });
    observer.observe(document.documentElement || document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href", "src", "action", "formaction", "poster"]
    });
  }

  patchFetch();
  patchXhr();
  patchHistory();
  patchWindowOpen();
  bindNavigationEvents();
  rewriteNodeAttrs(document.documentElement || document.body || document);
  observeDom();

  window.addEventListener("load", emitLocation, true);
  window.addEventListener("hashchange", emitLocation, true);
  window.addEventListener("popstate", emitLocation, true);
  setTimeout(emitLocation, 0);
})();
