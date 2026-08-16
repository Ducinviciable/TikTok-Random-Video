// Module: content-interceptor.js
// Responsibilities: Layer 5 Extended Telemetry & Tracking Interceptor, UI Toast Notifications

(function initTelemetryBlock() {
  console.log(
    "[CS] Layer 5 Extended Telemetry & Tracking Interceptor initialized.",
  );
  var trackingPatterns = [
    "log.tiktokv.com",
    "mon.snssdk.com",
    "mon.tiktokv.com",
    "ib.tiktokv.com",
    "/api/v1/report",
    "/api/v1/track",
    "/passport/web/rate",
    "slardar",
    "mssdk",
    "webmssdk",
    "byteoversea",
    "frontier",
    "log-sdk",
    "analytics",
  ];

  function isTrackingUrl(url) {
    if (!url) return false;
    var urlStr = typeof url === "string" ? url : String(url);
    for (var i = 0; i < trackingPatterns.length; i++) {
      if (urlStr.indexOf(trackingPatterns[i]) !== -1) return true;
    }
    return false;
  }

  try {
    var _origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isTrackingUrl(url)) {
        this._blocked = true;
      }
      return _origXHROpen.apply(this, arguments);
    };
    if (window._stealthRegister) {
      window._stealthRegister(XMLHttpRequest.prototype.open, "open");
    }

    var _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this._blocked) {
        return;
      }
      return _origXHRSend.apply(this, arguments);
    };
    if (window._stealthRegister) {
      window._stealthRegister(XMLHttpRequest.prototype.send, "send");
    }
  } catch (e) {}

  try {
    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url =
        typeof input === "string" ? input : input && input.url ? input.url : "";
      if (isTrackingUrl(url)) {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      return _origFetch.apply(this, arguments);
    };
    if (window._stealthRegister) {
      window._stealthRegister(window.fetch, "fetch");
    }
  } catch (e) {}

  try {
    var _origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      if (isTrackingUrl(url)) {
        return true;
      }
      return _origBeacon.apply(this, arguments);
    };
    if (window._stealthRegister) {
      window._stealthRegister(navigator.sendBeacon, "sendBeacon");
    }
  } catch (e) {}
})();

function showToast(message, type) {
  type = type || "info";
  var toast = document.getElementById("tk-random-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "tk-random-toast";
    toast.style.cssText =
      "position:fixed;top:20px;right:20px;z-index:999999;background:rgba(20,20,32,0.92);color:#fff;padding:12px 18px;border-radius:10px;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(10px);transition:all 0.3s cubic-bezier(0.16,1,0.3,1);pointer-events:none;display:flex;align-items:center;gap:8px;";
    document.body.appendChild(toast);
  }
  toast.innerHTML = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  if (toast._timer) clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
  }, 4000);
}
