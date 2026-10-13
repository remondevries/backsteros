(function () {
  "use strict";

  var BRAND_HTML =
    '<div class="backster-brand" aria-label="BacksterDESIGN">' +
      '<img class="backster-brand__mark" src="/images/assets/logo-small.svg" alt="" width="20" height="20" />' +
      '<span class="backster-brand__name">' +
        '<span class="backster-brand__thin">Backster</span>' +
        '<span class="backster-brand__bold">DESIGN</span>' +
      "</span>" +
    "</div>";

  // Prefer the scrollable menu column (same slot as the team switcher).
  // Never inject into .dashboard-sidebar — it is grid 1fr/auto and the brand
  // would eat the growing row and push the menu down.
  function findMount() {
    return (
      document.querySelector('[class*="sidebar-content"]:not([class*="sidebar-content-wrapper"]):not([class*="sidebar-content-section"]):not([class*="sidebar-content-nitrate"])') ||
      document.querySelector('[class*="sidebar-content-wrapper"]') ||
      null
    );
  }

  function inject() {
    if (document.querySelector(".backster-brand")) return true;
    var mount = findMount();
    if (!mount) return false;
    var wrap = document.createElement("div");
    wrap.innerHTML = BRAND_HTML;
    mount.insertBefore(wrap.firstChild, mount.firstChild);
    return true;
  }

  function start() {
    if (inject()) return;
    var obs = new MutationObserver(function () {
      if (inject()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
