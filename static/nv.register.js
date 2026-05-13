(function () {
  if (!navigator.serviceWorker) return;
  var reloading = false;

  function registerNavionSw() {
    return navigator.serviceWorker.register("/nv.sw.js", { scope: "/", updateViaCache: "none" })
      .then(function (registration) {
        if (registration.waiting) {
          try { registration.waiting.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
        }
        registration.addEventListener("updatefound", function () {
          var worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", function () {
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                try { worker.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
                return;
              }
              if (!reloading) {
                reloading = true;
                window.location.reload();
              }
            }
          });
        });
        console.log("[Navion] Service Worker registered");
      });
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.getRegistration("/")
    .then(function (existing) {
      if (!existing) return registerNavionSw();
      if (existing.active && existing.active.scriptURL.endsWith("/nv.sw.js")) {
        if (existing.waiting) {
          try { existing.waiting.postMessage({ type: "NV_SKIP_WAITING" }); } catch (e) {}
        }
        return existing.update().then(function () {
          return registerNavionSw();
        });
      }
      return existing.unregister().then(registerNavionSw);
    })
    .catch(function (err) {
      console.error("[Navion] Service Worker registration failed:", err);
    });
})();
