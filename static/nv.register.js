(function () {
  if (!navigator.serviceWorker) return;

  function registerNavionSw() {
    return navigator.serviceWorker.register("/nv.sw.js", { scope: "/" })
      .then(function () {
        console.log("[Navion] Service Worker registered");
      });
  }

  navigator.serviceWorker.getRegistration("/")
    .then(function (existing) {
      if (!existing) return registerNavionSw();
      if (existing.active && existing.active.scriptURL.endsWith("/nv.sw.js")) {
        return existing.update();
      }
      return existing.unregister().then(registerNavionSw);
    })
    .catch(function (err) {
      console.error("[Navion] Service Worker registration failed:", err);
    });
})();
