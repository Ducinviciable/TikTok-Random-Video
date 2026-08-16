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
  console.log(
    "[CS] Layer 4 Human-Heuristic Bézier & Behavioral Simulation initialized.",
  );

  var virtualCursor = {
    x: Math.floor(window.innerWidth / 2),
    y: Math.floor(window.innerHeight / 2),
  };
  var isMovingCursor = false;
  var isIdleBreak = false;
  var activityCounter = 0;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Smoothstep easing (Fitts-inspired acceleration/deceleration)
  function easeInOutSmooth(t) {
    return t * t * (3 - 2 * t);
  }

  // Parametric cubic Bézier evaluation
  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    var tt = t * t;
    var uu = u * u;
    var uuu = uu * u;
    var ttt = tt * t;

    var x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
    var y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

    return { x: x, y: y };
  }

  // Generate control points with human-like perpendicular deviation
  function generateControlPoints(start, end) {
    var deltaX = Math.abs(end.x - start.x);
    var deltaY = Math.abs(end.y - start.y);
    var dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    var deviation = Math.min(Math.max(dist * 0.25, 20), 120);

    var signX1 = Math.random() < 0.5 ? -1 : 1;
    var signY1 = Math.random() < 0.5 ? -1 : 1;
    var signX2 = Math.random() < 0.5 ? -1 : 1;
    var signY2 = Math.random() < 0.5 ? -1 : 1;

    var cp1 = {
      x:
        start.x +
        (end.x - start.x) * 0.25 +
        signX1 * randInt(deviation * 0.3, deviation),
      y:
        start.y +
        (end.y - start.y) * 0.25 +
        signY1 * randInt(deviation * 0.3, deviation),
    };

    var cp2 = {
      x:
        start.x +
        (end.x - start.x) * 0.75 +
        signX2 * randInt(deviation * 0.3, deviation),
      y:
        start.y +
        (end.y - start.y) * 0.75 +
        signY2 * randInt(deviation * 0.3, deviation),
    };

    return { cp1: cp1, cp2: cp2 };
  }

  // Generate 12-20 intermediate points along cubic Bézier path with spatial jitter
  function generateBezierPath(start, end, numSteps) {
    numSteps = numSteps || randInt(14, 18);
    var cps = generateControlPoints(start, end);
    var path = [];

    for (var i = 0; i <= numSteps; i++) {
      var rawT = i / numSteps;
      var t = easeInOutSmooth(rawT);
      var pt = cubicBezier(start, cps.cp1, cps.cp2, end, t);

      // Add spatial jitter (±3-8px) on intermediate points to simulate micro hand tremor
      if (i > 0 && i < numSteps) {
        var jitterX = (Math.random() - 0.5) * randInt(6, 12);
        var jitterY = (Math.random() - 0.5) * randInt(6, 12);
        pt.x += jitterX;
        pt.y += jitterY;
      }

      pt.x = Math.max(10, Math.min(window.innerWidth - 10, pt.x));
      pt.y = Math.max(10, Math.min(window.innerHeight - 10, pt.y));

      path.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
    }

    return path;
  }

  // Dispatch dual MouseEvent and PointerEvent streams
  function dispatchSyntheticPointer(pt) {
    try {
      var targetEl = document.elementFromPoint(pt.x, pt.y) || document.body;
      var mouseEvt = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: pt.x,
        clientY: pt.y,
        screenX: pt.x + (window.screenX || 0),
        screenY: pt.y + (window.screenY || 0),
      });
      var pointerEvt = new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: pt.x,
        clientY: pt.y,
        screenX: pt.x + (window.screenX || 0),
        screenY: pt.y + (window.screenY || 0),
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      });

      targetEl.dispatchEvent(pointerEvt);
      targetEl.dispatchEvent(mouseEvt);
    } catch (e) {}
  }

  // Move cursor smoothly along Bézier curve with staggered timeouts (no teleport)
  function moveCursorBezier(targetPt, onComplete) {
    if (isMovingCursor || isIdleBreak) return;
    isMovingCursor = true;

    var startPt = { x: virtualCursor.x, y: virtualCursor.y };
    var steps = randInt(14, 18);
    var path = generateBezierPath(startPt, targetPt, steps);
    var stepIndex = 0;
    var baseStepDelay = randInt(18, 26); // 18-26ms per step (~280-450ms total path duration)

    function nextStep() {
      if (stepIndex < path.length) {
        var pt = path[stepIndex];
        dispatchSyntheticPointer(pt);
        virtualCursor.x = pt.x;
        virtualCursor.y = pt.y;
        stepIndex++;
        var stepDelay = baseStepDelay + randInt(-2, 3);
        setTimeout(nextStep, Math.max(10, stepDelay));
      } else {
        virtualCursor.x = targetPt.x;
        virtualCursor.y = targetPt.y;
        isMovingCursor = false;
        if (typeof onComplete === "function") {
          onComplete();
        }
      }
    }

    nextStep();
  }

  // Select human-relevant target regions on TikTok page
  function getMeaningfulTarget() {
    var zones = [
      // 1. Current video playback area
      function () {
        if (currentVideoElement) {
          var r = currentVideoElement.getBoundingClientRect();
          if (r.width > 50 && r.height > 50) {
            return {
              x: Math.floor(r.left + randInt(r.width * 0.15, r.width * 0.85)),
              y: Math.floor(r.top + randInt(r.height * 0.2, r.height * 0.8)),
              type: "video",
            };
          }
        }
        return null;
      },
      // 2. Author / Avatar / Username area
      function () {
        var authorEl = document.querySelector(
          '[data-e2e="video-author-uniqueid"], [data-e2e="user-avatar"], [class*="Author"], [class*="Avatar"], [class*="DivAuthorContainer"]',
        );
        if (authorEl) {
          var r = authorEl.getBoundingClientRect();
          if (
            r.width > 10 &&
            r.height > 10 &&
            r.top >= 0 &&
            r.top < window.innerHeight
          ) {
            return {
              x: Math.floor(r.left + randInt(5, Math.max(10, r.width - 5))),
              y: Math.floor(r.top + randInt(5, Math.max(10, r.height - 5))),
              type: "author",
            };
          }
        }
        return null;
      },
      // 3. Caption / Description area
      function () {
        var descEl = document.querySelector(
          '[data-e2e="video-desc"], [class*="DivDescription"], [class*="DivTextInfoContainer"]',
        );
        if (descEl) {
          var r = descEl.getBoundingClientRect();
          if (
            r.width > 20 &&
            r.height > 10 &&
            r.top >= 0 &&
            r.top < window.innerHeight
          ) {
            return {
              x: Math.floor(r.left + randInt(10, Math.max(20, r.width - 10))),
              y: Math.floor(r.top + randInt(5, Math.max(10, r.height - 5))),
              type: "caption",
            };
          }
        }
        return null;
      },
    ];

    var shuffled = zones.sort(function () {
      return 0.5 - Math.random();
    });
    for (var i = 0; i < shuffled.length; i++) {
      var target = shuffled[i]();
      if (target) return target;
    }

    return {
      x: randInt(120, Math.max(200, window.innerWidth - 120)),
      y: randInt(120, Math.max(200, window.innerHeight - 120)),
      type: "viewport",
    };
  }

  // Micro-interaction: Reverse scroll (3-5% probability)
  function performMicroReverseScroll() {
    if (isIdleBreak) return;
    try {
      var scrollContainer = null;
      if (typeof findScrollContainer === "function") {
        scrollContainer = findScrollContainer();
      }
      var upDistance = -randInt(180, 320);

      if (scrollContainer) {
        scrollContainer.scrollBy({ top: upDistance, behavior: "smooth" });
      } else {
        window.scrollBy({ top: upDistance, behavior: "smooth" });
      }

      console.log(
        "[CS] 🔄 Micro reverse-scroll performed (" + upDistance + "px)",
      );
      document.dispatchEvent(new Event("scroll", { bubbles: true }));
      window.dispatchEvent(new Event("scroll", { bubbles: true }));
    } catch (e) {}
  }

  // Milestone Idle: Resting break after every 40-70 actions
  function triggerMilestoneIdle() {
    if (isIdleBreak) return;
    isIdleBreak = true;
    activityCounter = 0;
    var idleDuration = randInt(8000, 15000);
    console.log(
      "[CS] ☕ Human Milestone Idle: Taking a " +
        (idleDuration / 1000).toFixed(1) +
        "s natural resting break...",
    );

    setTimeout(function () {
      isIdleBreak = false;
      console.log("[CS] ☕ Human Milestone Idle complete. Resuming activity.");
    }, idleDuration);
  }

  // Core behavioral loop with natural hover dwell
  function performHumanMouseInteraction() {
    if (isIdleBreak) return;
    var target = getMeaningfulTarget();

    moveCursorBezier(target, function () {
      activityCounter++;
      if (activityCounter >= randInt(40, 70)) {
        triggerMilestoneIdle();
        return;
      }

      // Natural hover dwell (300-800ms) on arrival
      var dwellTime = randInt(300, 800);
      setTimeout(function () {
        if (Math.random() < 0.05) {
          performMicroReverseScroll();
        }
      }, dwellTime);
    });
  }

  // Contextual Human Nudge: triggered by specific life-cycle events (video ending, blank page, recovery)
  function triggerHumanMouseNudge(reason) {
    if (isMovingCursor || isIdleBreak) return;

    var nudgeTarget = null;
    if (reason === "video_end" || reason === "video_transition") {
      var base = getMeaningfulTarget();
      nudgeTarget = {
        x: Math.max(
          50,
          Math.min(window.innerWidth - 50, base.x + randInt(-40, 40)),
        ),
        y: Math.max(
          50,
          Math.min(window.innerHeight - 50, base.y + randInt(-40, 40)),
        ),
      };
      console.log(
        "[CS] 🖱️ Contextual human nudge: video ending/transition (" +
          reason +
          ")",
      );
    } else if (
      reason === "blank_screen" ||
      reason === "recovery" ||
      reason === "please_wait"
    ) {
      var centerX = Math.floor(window.innerWidth / 2);
      var centerY = Math.floor(window.innerHeight / 2);
      nudgeTarget = {
        x: Math.max(
          100,
          Math.min(window.innerWidth - 100, centerX + randInt(-150, 150)),
        ),
        y: Math.max(
          100,
          Math.min(window.innerHeight - 100, centerY + randInt(-100, 100)),
        ),
      };
      console.log(
        "[CS] 🖱️ Contextual human nudge: page recovery/blank agitation (" +
          reason +
          ")",
      );
    } else {
      nudgeTarget = getMeaningfulTarget();
    }

    if (nudgeTarget) {
      moveCursorBezier(nudgeTarget, function () {
        if (reason === "blank_screen" || reason === "recovery") {
          try {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new FocusEvent("focus"));
          } catch (e) {}
        }
      });
    }
  }

  window.triggerHumanMouseNudge = triggerHumanMouseNudge;

  // Schedule human mouse interactions at natural intervals
  setInterval(
    function () {
      performHumanMouseInteraction();
    },
    randInt(5000, 10000),
  );

  // Subtle scroll jitter at realistic intervals
  setInterval(
    function () {
      if (isIdleBreak) return;
      try {
        document.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.dispatchEvent(new Event("scroll", { bubbles: true }));
      } catch (e) {}
    },
    randInt(14000, 24000),
  );
})();

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

