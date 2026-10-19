(function () {
  try {
    document.documentElement.setAttribute("data-tauri-desktop", "1");
  } catch (_) {
    /* ignore */
  }

  // Reload while Rust still holds an async callback — expected, not actionable.
  try {
    var nativeWarn = console.warn.bind(console);
    console.warn = function () {
      var first = arguments[0];
      if (
        typeof first === "string" &&
        first.indexOf("Couldn't find callback id") !== -1
      ) {
        return;
      }
      return nativeWarn.apply(console, arguments);
    };
  } catch (_) {
    /* ignore */
  }

  /**
   * Remote HTTPS pages block `ipc://` fetches (mixed content). Tauri then
   * retries via `window.ipc.postMessage`, but the failed fetches still spam
   * the WebKit console. Route ipc:// traffic straight to postMessage instead.
   */
  function installIpcPostMessageBridge() {
    if (window.__BD_IPC_BRIDGE__) return true;
    if (!window.ipc || typeof window.ipc.postMessage !== "function") {
      return false;
    }

    var nativeFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      var url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : "";

      if (!url || url.indexOf("ipc:") !== 0) {
        return nativeFetch(input, init);
      }

      try {
        var parsed = new URL(url);
        var cmd = decodeURIComponent(
          (parsed.pathname || "").replace(/^\//, ""),
        );
        var headers = (init && init.headers) || null;
        var getHeader = function (name) {
          if (!headers) return null;
          if (typeof headers.get === "function") return headers.get(name);
          return headers[name] || headers[name.toLowerCase()] || null;
        };

        var callback = Number(getHeader("Tauri-Callback"));
        var error = Number(getHeader("Tauri-Error"));
        var invokeKey = getHeader("Tauri-Invoke-Key") || "";
        var body = init && init.body;
        var payload = body;
        if (typeof body === "string") {
          try {
            payload = JSON.parse(body);
          } catch (_) {
            payload = body;
          }
        }

        var message = {
          cmd: cmd,
          callback: callback,
          error: error,
          payload: payload,
          options: { customProtocolIpcBlocked: true },
          __TAURI_INVOKE_KEY__: invokeKey,
        };

        window.ipc.postMessage(JSON.stringify(message));
      } catch (err) {
        return Promise.reject(err);
      }

      // Response is delivered via runCallback (webview eval), not fetch.
      return new Promise(function () {});
    };

    window.__BD_IPC_BRIDGE__ = true;
    return true;
  }

  if (installIpcPostMessageBridge()) return;

  var tries = 0;
  var timer = setInterval(function () {
    if (installIpcPostMessageBridge() || ++tries > 200) {
      clearInterval(timer);
    }
  }, 10);
})();
