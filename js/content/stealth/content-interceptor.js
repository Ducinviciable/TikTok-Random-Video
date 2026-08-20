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
      "position:fixed;top:24px;right:24px;z-index:2147483647;background:rgba(15,23,42,0.95);color:#fff;padding:12px 20px;border-radius:12px;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(12px);transition:all 0.35s cubic-bezier(0.16,1,0.3,1);pointer-events:none;display:flex;align-items:center;gap:10px;";
    (document.body || document.documentElement).appendChild(toast);
  }

  if (type === "success") {
    toast.style.borderColor = "rgba(34,197,94,0.7)";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(34,197,94,0.3)";
  } else if (type === "warning") {
    toast.style.borderColor = "rgba(234,179,8,0.7)";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(234,179,8,0.3)";
  } else {
    toast.style.borderColor = "rgba(255,255,255,0.2)";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
  }

  toast.innerHTML = message;
  toast.style.display = "flex";
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  if (toast._timer) clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-12px)";
  }, 4500);
}
