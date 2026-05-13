(function () {
  if (!navigator.serviceWorker) return;
  var reloading = false;

  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
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
            return;
          }
          reloadOnce();
        });
      });
      console.log("[Navion] Service Worker registered");
      return registration;
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    reloadOnce();
  });

  navigator.serviceWorker.getRegistration("/")
    .then(function (existing) {
      if (!existing) return registerNavionSw();
      if (existing.active && existing.active.scriptURL.indexOf("/nv.sw.js") !== -1) {
        if (existing.waiting) {
          try { existing.waiting.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
        }
        return existing.update().then(registerNavionSw);
      }
      return existing.unregister().then(registerNavionSw);
    })
    .catch(function (err) {
      console.error("[Navion] Service Worker registration failed:", err);
    });
})();
