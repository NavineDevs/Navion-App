(function () {
  if (!navigator.serviceWorker) return;

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
