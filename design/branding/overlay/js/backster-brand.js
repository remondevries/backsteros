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

  function findSidebar() {
    return (
      document.querySelector('[class*="dashboard-sidebar"]') ||
      document.querySelector('[class*="sidebar-content-wrapper"]') ||
      null
    );
  }

  function inject() {
    if (document.querySelector(".backster-brand")) return true;
    var sidebar = findSidebar();
    if (!sidebar) return false;
    var wrap = document.createElement("div");
    wrap.innerHTML = BRAND_HTML;
    sidebar.insertBefore(wrap.firstChild, sidebar.firstChild);
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
