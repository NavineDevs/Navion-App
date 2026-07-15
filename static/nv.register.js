(function () {
  if (!navigator.serviceWorker) return;
  var NV_SW_VERSION = "1.0.24";
  var NV_SW_VERSION_KEY = "navion-sw-version";

  function isNavionWorker(registration) {
    try {
      var worker = registration && (registration.active || registration.waiting || registration.installing);
      var script = worker && worker.scriptURL;
      return typeof script === "string" && new URL(script, location.href).pathname === "/nv.sw.js";
    } catch (e) {
      return false;
    }
  }

  function registerNavionSw() {
    return navigator.serviceWorker.register("/nv.sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).then(function (registration) {
      if (registration.waiting) {
        try { registration.waiting.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
      }
      registration.addEventListener("updatefound", function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state !== "installed") return;
          if (navigator.serviceWorker.controller) {
            try { worker.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
          }
        });
      });
      console.log("[Navion] Service Worker registered");
      return registration;
    });
  }

  function resetNavionSw() {
    try { localStorage.setItem(NV_SW_VERSION_KEY, NV_SW_VERSION); } catch (e) {}
    return navigator.serviceWorker.getRegistration("/")
      .then(function (existing) {
        var clearCaches = window.caches ? caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) {
            return key.indexOf("navion-") === 0 ? caches.delete(key) : null;
          }));
        }).catch(function () {}) : Promise.resolve();
        return clearCaches.then(function () {
          if (existing && isNavionWorker(existing)) return existing.unregister().catch(function () {});
          return null;
        });
      })
      .then(registerNavionSw)
      .then(function () {
        if (navigator.serviceWorker.controller) window.location.reload();
      });
  }

  try {
    if (localStorage.getItem(NV_SW_VERSION_KEY) !== NV_SW_VERSION) {
      resetNavionSw().catch(function (err) {
        console.error("[Navion] Service Worker reset failed:", err);
      });
      return;
    }
  } catch (e) {}

  navigator.serviceWorker.getRegistration("/")
    .then(function (existing) {
      if (!existing) return registerNavionSw();
      if (isNavionWorker(existing)) {
        if (existing.waiting) {
          try { existing.waiting.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
        }
        existing.update().catch(function () {});
        return existing;
      }
      return registerNavionSw();
    })
    .catch(function (err) {
      console.error("[Navion] Service Worker registration failed:", err);
    });
})();
