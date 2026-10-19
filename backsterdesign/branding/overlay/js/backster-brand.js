(function () {
  "use strict";

  // Brand mark + "BacksterDESIGN" now render in the dashboard page header
  // (CLJS page-header*). Keep this script as a no-op so older cached
  // index.html that still loads it does not inject a duplicate into the
  // sidebar. Workspace left-header logo still uses backster-brand.css.
})();
