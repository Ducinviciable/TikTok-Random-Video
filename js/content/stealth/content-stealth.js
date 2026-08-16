// Module: content-stealth.js
// Responsibilities: Diagnostic logging, Native Function Stealthing, Visibility Bypass, Focus/Blur Spoof, Navigator Spoof, Silent Audio Keep-Alive

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
