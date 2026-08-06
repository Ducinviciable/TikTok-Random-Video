function logPlaybackDiagnostics(tag, video) {
  var bufferedRanges = [];
  if (video && video.buffered) {
    for (var i = 0; i < video.buffered.length; i++) {
      bufferedRanges.push([
        video.buffered.start(i).toFixed(2),
        video.buffered.end(i).toFixed(2),
      ]);
    }
  }

  console.log(
    "[DIAGNOSTICS] [" +
      tag +
      "] " +
      "t=" +
      performance.now().toFixed(2) +
      "ms | " +
      "url=" +
      window.location.href +
      " | " +
      "doc.hidden=" +
      document.hidden +
      " | " +
      "doc.visState=" +
      document.visibilityState +
      " | " +
      "doc.hasFocus=" +
      (typeof document.hasFocus === "function" ? document.hasFocus() : "N/A") +
      " | " +
      "v.readyState=" +
      (video ? video.readyState : "N/A") +
      " | " +
      "v.netState=" +
      (video ? video.networkState : "N/A") +
      " | " +
      "v.paused=" +
      (video ? video.paused : "N/A") +
      " | " +
      "v.currentTime=" +
      (video
        ? typeof video.currentTime === "number"
          ? video.currentTime.toFixed(2)
          : video.currentTime
        : "N/A") +
      " | " +
      "v.duration=" +
      (video
        ? isNaN(video.duration)
          ? "NaN"
          : typeof video.duration === "number"
            ? video.duration.toFixed(2)
            : video.duration
        : "N/A") +
      " | " +
      "v.buffered=" +
      JSON.stringify(bufferedRanges) +
      " | " +
      "v.seeking=" +
      (video ? video.seeking : "N/A") +
      " | " +
      "v.ended=" +
      (video ? video.ended : "N/A"),
  );
}

(function initNativeStealthing() {
  try {
    var _origToString = Function.prototype.toString;
    var stealthMap = new Map();

    window._stealthRegister = function (fn, nativeName) {
      if (typeof fn === "function") {
        stealthMap.set(fn, "function " + nativeName + "() { [native code] }");
      }
    };

    Function.prototype.toString = function () {
      if (stealthMap.has(this)) {
        return stealthMap.get(this);
      }
      return _origToString.apply(this, arguments);
    };
    window._stealthRegister(Function.prototype.toString, "toString");
  } catch (e) {}
})();

(function initVisibilityBypass() {
  console.log("[CS] Layer 1 Visibility Bypass initialized.");
  var hiddenGetter = function () {
    return false;
  };
  var visStateGetter = function () {
    return "visible";
  };

  if (window._stealthRegister) {
    window._stealthRegister(hiddenGetter, "get hidden");
    window._stealthRegister(visStateGetter, "get visibilityState");
  }

  try {
    Object.defineProperty(document, "hidden", {
      get: hiddenGetter,
      configurable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      get: visStateGetter,
      configurable: true,
    });
  } catch (e) {}

  document.addEventListener(
    "visibilitychange",
    function (e) {
      e.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener(
    "visibilitychange",
    function (e) {
      e.stopImmediatePropagation();
    },
    true,
  );

  try {
    var _origAddEvent = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (type === "visibilitychange" && this === document) {
        return _origAddEvent.call(this, type, function () {}, options);
      }
      return _origAddEvent.call(this, type, listener, options);
    };
    if (window._stealthRegister) {
      window._stealthRegister(
        EventTarget.prototype.addEventListener,
        "addEventListener",
      );
    }
  } catch (e) {}
})();

(function initFocusBypass() {
  console.log("[CS] Layer 2 Focus/Blur Bypass & Resume initialized.");
  var hasFocusFn = function () {
    return true;
  };
  if (window._stealthRegister) {
    window._stealthRegister(hasFocusFn, "hasFocus");
  }

  try {
    Document.prototype.hasFocus = hasFocusFn;
  } catch (e) {}

  window.addEventListener(
    "blur",
    function (e) {
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );

  document.addEventListener(
    "blur",
    function (e) {
      e.stopImmediatePropagation();
    },
    true,
  );

  try {
    Object.defineProperty(window, "onblur", {
      set: function () {},
      get: function () {
        return null;
      },
      configurable: true,
    });
  } catch (e) {}

  window.addEventListener("focus", function () {
    if (
      currentVideoElement &&
      currentVideoElement.paused &&
      !currentVideoElement.ended &&
      currentVideoElement.duration > 0
    ) {
      console.log("[CS] 👁️ Tab focus resumed → Force-playing current video");
      var p = currentVideoElement.play();
      if (p && p.then) {
        p.catch(function () {});
      }
    }
  });

  setInterval(function () {
    try {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new FocusEvent("focus"));
    } catch (e) {}
  }, 10000);
})();

(function initNavigatorSpoof() {
  console.log("[CS] Layer 3 Navigator Spoofing initialized.");
  var webdriverGetter = function () {
    return false;
  };
  if (window._stealthRegister) {
    window._stealthRegister(webdriverGetter, "get webdriver");
  }

  try {
    Object.defineProperty(navigator, "webdriver", {
      get: webdriverGetter,
      configurable: true,
    });
  } catch (e) {}

  try {
    if (navigator.plugins.length === 0) {
      Object.defineProperty(navigator, "plugins", {
        get: function () {
          return [1, 2, 3, 4, 5];
        },
        configurable: true,
      });
    }
  } catch (e) {}

  try {
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, "languages", {
        get: function () {
          return ["vi-VN", "vi", "en-US", "en"];
        },
        configurable: true,
      });
    }
  } catch (e) {}
})();

(function initSilentAudioKeepAlive() {
  var audioCtx = null;

  function startAudio() {
    try {
      if (!audioCtx) {
        var AudioContextClass =
          window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();

        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.00001, audioCtx.currentTime);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();

        console.log(
          "[CS] 🔊 Silent Web Audio Keep-Alive active (Process priority boosted).",
        );
      }

      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    } catch (e) {}
  }

  if (document.readyState === "complete") {
    startAudio();
  } else {
    window.addEventListener("load", startAudio);
  }

  window.addEventListener("click", startAudio, { once: true });
  window.addEventListener("keydown", startAudio, { once: true });
})();

(function initFakeActivity() {
  console.log("[CS] Layer 4 Smart Fake Human Activity initialized.");

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getTargetPoint() {
    if (currentVideoElement) {
      var rect = currentVideoElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: Math.floor(rect.left + randInt(20, rect.width - 20)),
          y: Math.floor(rect.top + randInt(20, rect.height - 20)),
        };
      }
    }
    return {
      x: randInt(150, window.innerWidth - 150),
      y: randInt(150, window.innerHeight - 150),
    };
  }

  function fakeMouseMove() {
    try {
      var pt = getTargetPoint();
      var evt = new MouseEvent("mousemove", {
        bubbles: true,
        clientX: pt.x,
        clientY: pt.y,
        screenX: pt.x,
        screenY: pt.y,
      });
      if (currentVideoElement) currentVideoElement.dispatchEvent(evt);
      else document.dispatchEvent(evt);
    } catch (e) {}
  }

  function fakePointerMove() {
    try {
      var pt = getTargetPoint();
      var evt = new PointerEvent("pointermove", {
        bubbles: true,
        clientX: pt.x,
        clientY: pt.y,
        pointerId: 1,
        pointerType: "mouse",
      });
      if (currentVideoElement) currentVideoElement.dispatchEvent(evt);
      else document.dispatchEvent(evt);
    } catch (e) {}
  }

  function fakeScroll() {
    try {
      document.dispatchEvent(new Event("scroll", { bubbles: true }));
      window.dispatchEvent(new Event("scroll", { bubbles: true }));
    } catch (e) {}
  }

  setInterval(
    function () {
      fakeMouseMove();
    },
    randInt(4000, 9000),
  );

  setInterval(
    function () {
      fakePointerMove();
    },
    randInt(6000, 14000),
  );

  setInterval(
    function () {
      fakeScroll();
    },
    randInt(12000, 22000),
  );
})();

(function initTelemetryBlock() {
  console.log("[CS] Layer 5 Telemetry Interceptor initialized.");
  var trackingPatterns = [
    "/api/v1/report",
    "/api/v1/track",
    "mon.tiktokv.com",
    "analytics",
    "log-sdk",
    "slardar",
    "frontier",
    "/passport/web/rate",
  ];

  function isTrackingUrl(url) {
    if (!url) return false;
    for (var i = 0; i < trackingPatterns.length; i++) {
      if (url.indexOf(trackingPatterns[i]) !== -1) return true;
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

    var _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this._blocked) {
        return;
      }
      return _origXHRSend.apply(this, arguments);
    };
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
  } catch (e) {}

  try {
    var _origBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      if (isTrackingUrl(url)) {
        return true;
      }
      return _origBeacon.apply(this, arguments);
    };
  } catch (e) {}
})();

function showToast(message, type) {
  type = type || "info";
  let toast = document.getElementById("tk-random-toast");
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
