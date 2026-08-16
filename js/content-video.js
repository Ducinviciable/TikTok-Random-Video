// Layer 6: Force Video Playback + "Please Wait" / 403 Recovery

var EARLY_SKIP_CHANCE = 0.10; // 10% probability of low interest
var EARLY_SKIP_MIN_RATIO = 0.30; // Skip between 30%
var EARLY_SKIP_MAX_RATIO = 0.80; // and 80% of duration
var preloadAttempted = false;
var isLowInterestVideo = false;
var earlySkipTargetRatio = 0;
var earlySkipTriggered = false;

function warmUpNextVideoUrl(nextUrl) {
  if (!nextUrl || typeof nextUrl !== "string" || !nextUrl.startsWith("http"))
    return;

  try {
    fetch(nextUrl, { method: "HEAD", mode: "no-cors" }).catch(function () { });
  } catch (e) { }

  try {
    var oldLink = document.getElementById("tk-random-preload-link");
    if (oldLink) oldLink.remove();

    var link = document.createElement("link");
    link.id = "tk-random-preload-link";
    link.rel = "prefetch";
    link.href = nextUrl;
    document.head.appendChild(link);
  } catch (e) { }
}

(function initPlaybackRecovery() {
  console.log("[CS] Layer 6 Playback & Error Recovery initialized.");
  var recoveryAttempts = 0;
  var MAX_RECOVERY = 3;
  var pleaseWaitStartTime = null;

  setInterval(function () {
    if (!window.location.href.includes("/video/")) return;
    if (playNextRequested) return;

    var videos = document.querySelectorAll("video");
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      if (v.paused && v.src && v.duration && v.duration > 0 && !v.ended) {
        (function (video) {
          console.log("[CS] ⚠️ Phát hiện video bị pause hoặc load chậm");
          logPlaybackDiagnostics("BEFORE_PLAY", video);
          var p = video.play();
          if (p && p.then) {
            p.then(function () {
              logPlaybackDiagnostics("PLAY_RESOLVED", video);
            }).catch(function (err) {
              logPlaybackDiagnostics("PLAY_REJECTED", video);
            });
          }
        })(v);
      }
    }
  }, 1500);

  var lastRecoveryTimestamp = 0;

  setInterval(function () {
    var errorDetected = false;
    var errorType = "";

    // Check for "Please Wait" text in any overlay
    var overlays = document.querySelectorAll(
      '[class*="modal"], [class*="overlay"], [class*="error"], [class*="captcha"], [class*="DivErrorContainer"]',
    );
    var pleaseWaitFound = false;
    for (var i = 0; i < overlays.length; i++) {
      var text = overlays[i].textContent.toLowerCase();
      if (
        text.includes("please wait") ||
        text.includes("vui lòng chờ") ||
        text.includes("try again") ||
        text.includes("thử lại")
      ) {
        errorDetected = true;
        errorType = "please_wait";
        pleaseWaitFound = true;
        break;
      }
    }

    if (pleaseWaitFound) {
      if (!pleaseWaitStartTime) {
        pleaseWaitStartTime = Date.now();
        console.log(
          "[CS] ⚠️ Bắt đầu xuất hiện màn hình 'Please wait / Vui lòng chờ'",
        );
      }
    } else {
      if (pleaseWaitStartTime) {
        var elapsedSec = ((Date.now() - pleaseWaitStartTime) / 1000).toFixed(1);
        console.log(
          "[CS] ✅ Màn hình 'Please wait' biến mất sau: " +
          elapsedSec +
          " giây.",
        );
        pleaseWaitStartTime = null;
      }
    }

    // Check page title or body for 403 / error / access denied / blank page states
    var title = document.title.toLowerCase();
    var bodyText = document.body
      ? document.body.innerText.substring(0, 500).toLowerCase()
      : "";
    var isBlankPage =
      document.body &&
      document.body.children.length <= 2 &&
      bodyText.trim().length === 0;

    if (
      title.includes("403") ||
      title.includes("denied") ||
      title.includes("forbidden") ||
      title.includes("error") ||
      bodyText.includes("403") ||
      bodyText.includes("denied") ||
      bodyText.includes("forbidden") ||
      isBlankPage
    ) {
      errorDetected = true;
      errorType = "403";
    }

    // Check for empty video container (video failed to load)
    if (window.location.href.includes("/video/")) {
      var videos = document.querySelectorAll("video");
      if (videos.length > 0) {
        var mainVideo = videos[0];
        if (mainVideo.error || mainVideo.networkState === 3) {
          errorDetected = true;
          errorType = "video_error";
        }
      }
    }

    var now = Date.now();
    var cooldownPassed = now - lastRecoveryTimestamp > 15000;

    if (errorDetected && cooldownPassed && recoveryAttempts < MAX_RECOVERY) {
      recoveryAttempts++;
      lastRecoveryTimestamp = now;
      console.warn(
        "[CS] Layer 6: Error detected - Type:",
        errorType,
        "- Attempt",
        recoveryAttempts,
      );

      if (errorType === "please_wait") {
        if (typeof triggerHumanMouseNudge === "function") {
          triggerHumanMouseNudge("please_wait");
        }
        // Try clicking any dismiss/close/retry buttons
        var dismissBtns = document.querySelectorAll(
          'button[class*="close"], button[class*="dismiss"], [class*="close-btn"], ' +
          'button[class*="retry"], [data-e2e*="close"]',
        );
        for (var j = 0; j < dismissBtns.length; j++) {
          try {
            dismissBtns[j].click();
          } catch (e) { }
        }

        // Multi-Phase Soft Recovery: Require Please Wait to persist > 12s
        if (pleaseWaitStartTime && now - pleaseWaitStartTime > 12000) {
          console.warn(
            "[CS] ⚠️ 'Please Wait' kéo dài > 12s → Kích hoạt chuỗi phục hồi mềm (Phase A-D)...",
          );
          showToast(
            "⚠️ Vui lòng chờ kéo dài → Đang thử tự phục hồi...",
            "warning",
          );

          // Phase A: Micro-scrolls (±50px)
          try {
            window.scrollBy({ top: -50, behavior: "smooth" });
            setTimeout(function () {
              window.scrollBy({ top: 50, behavior: "smooth" });
            }, 300);
          } catch (e) { }

          // Phase B: Fake focus/visibility flash
          try {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new FocusEvent("focus"));
          } catch (e) { }

          // Phase C & D: Wait 5s grace time; if still blocked -> soft SPA navigation
          setTimeout(function () {
            var overlaysStillPresent = document.querySelectorAll(
              '[class*="modal"], [class*="overlay"], [class*="error"], [class*="captcha"], [class*="DivErrorContainer"]',
            );
            var stillBlocked = false;
            for (var k = 0; k < overlaysStillPresent.length; k++) {
              var t = overlaysStillPresent[k].textContent.toLowerCase();
              if (
                t.includes("please wait") ||
                t.includes("vui lòng chờ") ||
                t.includes("try again") ||
                t.includes("thử lại")
              ) {
                stillBlocked = true;
                break;
              }
            }

            if (stillBlocked) {
              console.warn(
                "[CS] ⚠️ Vẫn bị chặn sau Phase A-C → Chuyển video mềm qua SPA",
              );
              showToast(
                "⚠️ Vẫn bị chặn → Đang chuyển video tiếp...",
                "warning",
              );
              requestNextVideo();
            } else {
              console.log(
                "[CS] ✅ Phục hồi mềm thành công! Màn hình Please Wait đã tự giải phóng.",
              );
            }
          }, 5000);
        }
      } else if (errorType === "403" || errorType === "video_error") {
        if (typeof triggerHumanMouseNudge === "function") {
          triggerHumanMouseNudge("blank_screen");
        }
        console.warn(
          "[CS] Layer 6: Detected 403 / Access Denied / Blank Page! Triggering Random Liked Video...",
        );
        showToast(
          "🤖 Phát hiện lỗi 403 / Trang trắng → Đang mở video ngẫu nhiên mới...",
          "warning",
        );
        try {
          chrome.runtime.sendMessage({ action: "handle403Detected" });
        } catch (e) { }
      }
    }

    // Reset recovery counter when video is playing normally
    var playingVideos = document.querySelectorAll("video");
    if (
      playingVideos.length > 0 &&
      !playingVideos[0].paused &&
      !playingVideos[0].error
    ) {
      recoveryAttempts = 0;
    }
  }, 4000);

  // NOTE: Cookie clearing removed — deleting _abck/bm_ Akamai tokens causes 403 errors
})();

// MONITOR 1: Stuck / Frozen Video Monitor (6-second freeze check)
let lastVideoTime = -1;
let stuckSeconds = 0;
let stuckInterval = null;

function startStuckMonitor() {
  if (stuckInterval) clearInterval(stuckInterval);
  lastVideoTime = -1;
  stuckSeconds = 0;

  stuckInterval = setInterval(function () {
    if (!videoWatcherActive || playNextRequested || !currentVideoElement)
      return;

    const video = currentVideoElement;
    if (video.duration && video.duration > 1 && !video.ended) {
      const currentTime = video.currentTime;
      if (
        lastVideoTime >= 0 &&
        Math.abs(currentTime - lastVideoTime) < 0.05 &&
        !video.paused
      ) {
        stuckSeconds++;
        if (stuckSeconds === 4) {
          logPlaybackDiagnostics("STUCK", video);
        }
        console.warn(
          "[CS] ⚠️ Video bị đứng (" +
          stuckSeconds +
          "s) - currentTime: " +
          currentTime.toFixed(2),
        );
        // Soft recovery at 5s: try load() + play() before giving up
        if (stuckSeconds === 5) {
          console.warn(
            "[CS] ⚠️ Video đứng 5s → Thử soft recovery (load + play)...",
          );
          logPlaybackDiagnostics("STUCK_SOFT_RECOVERY", video);
          if (typeof triggerHumanMouseNudge === "function") {
            triggerHumanMouseNudge("recovery");
          }
          try {
            video.load();
            video.currentTime = 0.05;
          } catch (e) { }
          var p = video.play();
          if (p && p.then) {
            p.then(function () {
              logPlaybackDiagnostics("PLAY_RESOLVED", video);
            }).catch(function () { });
          }
        }
        // Hard skip at 6s
        if (stuckSeconds >= 6) {
          console.warn(
            "[CS] ⚠️ Video bị đứng quá 6s! Tự động chuyển video tiếp...",
          );
          showToast("⚠️ Video bị đứng quá 6s → Tự chuyển video", "warning");
          clearInterval(stuckInterval);
          requestNextVideo();
          return;
        }
      } else {
        stuckSeconds = 0;
      }
      lastVideoTime = currentTime;
    }
  }, 1000);
}

// MONITOR 2 & 3: Audio Check & TikTok Shop Check
function checkVideoAudioAndShop() {
  if (!currentVideoElement || playNextRequested) return;

  // 1. TikTok Shop Check
  let isShop = false;
  if (typeof TK_SELECTORS !== "undefined" && TK_SELECTORS.SHOP_ANCHOR) {
    const shopEl = document.querySelector(TK_SELECTORS.SHOP_ANCHOR);
    if (shopEl) isShop = true;
  }
  if (!isShop) {
    const anchors = document.querySelectorAll(
      'a[href*="shop"], [class*="shop"], [class*="product"], [class*="cart"], [class*="anchor"]',
    );
    for (let i = 0; i < anchors.length; i++) {
      const text = anchors[i].textContent.toLowerCase();
      if (
        text.includes("cửa hàng") ||
        text.includes("shop") ||
        text.includes("mua ngay") ||
        text.includes("giỏ hàng")
      ) {
        isShop = true;
        break;
      }
    }
  }

  if (isShop) {
    console.log(
      "[CS] 🛒 Phát hiện video TikTok Shop → Tự động bỏ qua (chờ 2.2s)",
    );
    showToast("🛒 Bỏ qua video sau 2s...", "info");
    setTimeout(requestNextVideo, 2200);
    return;
  }

  // 2. No Audio / Muted Sound Check
  const video = currentVideoElement;
  let isMuted = false;

  // Check specific sound/music title containers for copyright muted notices
  if (typeof MUTED_SOUND_KEYWORDS !== "undefined") {
    const soundContainer = document.querySelector(
      '[data-e2e="browse-sound"], [class*="DivMusicText"], [class*="SoundTitle"], [class*="MusicText"]',
    );
    if (soundContainer) {
      const soundText = soundContainer.textContent.toLowerCase();
      for (let j = 0; j < MUTED_SOUND_KEYWORDS.length; j++) {
        if (soundText.includes(MUTED_SOUND_KEYWORDS[j])) {
          isMuted = true;
          break;
        }
      }
    }
  }

  if (isMuted) {
    console.log(
      "[CS] 🔇 Phát hiện âm thanh bị gỡ / vi phạm bản quyền → Tự động bỏ qua (chờ 2.2s)",
    );
    showToast("🔇 Bỏ qua video âm thanh bị gỡ (chờ 2s)...", "info");
    setTimeout(requestNextVideo, 2200);
    return;
  }
}

function watchForVideoElement() {
  const videos = document.querySelectorAll("video");
  if (videos.length === 0) return;

  let targetVideo = null;
  let maxArea = 0;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      targetVideo = v;
    }
  }

  if (!targetVideo && videos.length > 0) {
    targetVideo = videos[0];
  }

  if (!targetVideo || targetVideo === currentVideoElement) return;

  // Cleanup previous video
  if (currentVideoElement) {
    currentVideoElement.removeEventListener("ended", onVideoEnded);
    currentVideoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
  }
  if (loopObserver) {
    loopObserver.disconnect();
    loopObserver = null;
  }

  currentVideoElement = targetVideo;
  playNextRequested = false;
  timeUpdateTriggered = false;
  lastTimeForLoop = -1;
  preloadAttempted = false;
  earlySkipTriggered = false;
  isLowInterestVideo = Math.random() < EARLY_SKIP_CHANCE;
  if (isLowInterestVideo) {
    earlySkipTargetRatio =
      EARLY_SKIP_MIN_RATIO +
      Math.random() * (EARLY_SKIP_MAX_RATIO - EARLY_SKIP_MIN_RATIO);
  } else {
    earlySkipTargetRatio = 0;
  }

  console.log("[CS] Chuyển sang video mới");

  // Force aggressive buffering + immediate playback attempt
  currentVideoElement.setAttribute("preload", "auto");
  currentVideoElement.setAttribute("playsinline", "");
  currentVideoElement.load();
  try {
    currentVideoElement.currentTime = 0.05;
  } catch (e) { }

  logPlaybackDiagnostics("VIDEO_FOUND", currentVideoElement);
  logPlaybackDiagnostics("AGGRESSIVE_PLAY", currentVideoElement);
  var pInit = currentVideoElement.play();
  if (pInit && pInit.then) {
    pInit
      .then(function () {
        logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
      })
      .catch(function (err) {
        console.warn("[CS] Autoplay rejected on new video:", err);
        logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
      });
  }

  var diagEvents = [
    "loadstart",
    "loadedmetadata",
    "canplay",
    "playing",
    "waiting",
    "stalled",
    "error",
  ];
  diagEvents.forEach(function (evtName) {
    currentVideoElement.addEventListener(evtName, function () {
      logPlaybackDiagnostics(
        "EVENT_" + evtName.toUpperCase(),
        currentVideoElement,
      );
    });
  });

  // Recovery: Auto-resume when Chromium throttles media in background tab
  currentVideoElement.addEventListener("waiting", function () {
    if (
      !playNextRequested &&
      currentVideoElement &&
      !currentVideoElement.ended
    ) {
      console.log("[CS] ⚡ waiting event → bump currentTime + play()");
      try {
        currentVideoElement.currentTime += 0.01;
      } catch (e) { }
      var p = currentVideoElement.play();
      if (p && p.then) {
        p.catch(function () { });
      }
    }
  });

  // Recovery: Re-buffer when network stream stalls in background
  currentVideoElement.addEventListener("stalled", function () {
    if (
      !playNextRequested &&
      currentVideoElement &&
      !currentVideoElement.ended
    ) {
      console.log(
        "[CS] ⚡ stalled event → calling load() + play() to re-buffer",
      );
      currentVideoElement.load();
      setTimeout(function () {
        if (
          currentVideoElement &&
          !currentVideoElement.ended &&
          !playNextRequested
        ) {
          var p = currentVideoElement.play();
          if (p && p.then) {
            p.catch(function () { });
          }
        }
      }, 300);
    }
  });

  // Start 6-second stuck monitor and check audio/shop after video loads
  startStuckMonitor();
  setTimeout(checkVideoAudioAndShop, 2500);

  // CRITICAL: Keep loop ON to prevent TikTok's auto-advance to next feed video
  if (!currentVideoElement.hasAttribute("loop")) {
    currentVideoElement.setAttribute("loop", "");
  }

  // Guard: Watch for TikTok re-removing the loop attribute
  loopObserver = new MutationObserver(function () {
    if (
      currentVideoElement &&
      !currentVideoElement.hasAttribute("loop") &&
      !playNextRequested
    ) {
      currentVideoElement.setAttribute("loop", "");
      console.log("[CS] ⚠️ TikTok removed loop attribute — re-added it");
    }
  });
  loopObserver.observe(currentVideoElement, {
    attributes: true,
    attributeFilter: ["loop"],
  });

  // timeupdate is the PRIMARY detection method (ended won't fire with loop on)
  currentVideoElement.addEventListener("timeupdate", onVideoTimeUpdate);
  // ended is a SAFETY NET only (fires if loop is somehow removed)
  currentVideoElement.addEventListener("ended", onVideoEnded);
}

// Safety net — only fires if loop attribute was somehow removed
function onVideoEnded() {
  if (playNextRequested) return;
  console.log("[CS] Video đã kết thúc (ended event) → Gửi yêu cầu playNext");
  if (typeof triggerHumanMouseNudge === "function") {
    triggerHumanMouseNudge("video_end");
  }
  timeUpdateTriggered = false;
  requestNextVideo();
}

// Track last currentTime for loop-reset detection (inspired by reels-cycler)
var lastTimeForLoop = -1;

// PRIMARY end-of-video detection — fires while loop is on
function onVideoTimeUpdate() {
  if (playNextRequested) return;

  const video = currentVideoElement;
  if (
    !video ||
    !video.duration ||
    video.duration === Infinity ||
    video.duration < 1
  )
    return;

  var remaining = video.duration - video.currentTime;

  if (
    isLowInterestVideo &&
    !earlySkipTriggered &&
    !playNextRequested &&
    video.duration >= 4 &&
    video.currentTime / video.duration >= earlySkipTargetRatio
  ) {
    earlySkipTriggered = true;
    playNextRequested = true;

    console.log(
      "[CS] ⏭️ Interest Simulation: Early skipping low-interest video at " +
      ((video.currentTime / video.duration) * 100).toFixed(0) +
      "% (" +
      video.currentTime.toFixed(1) +
      "s / " +
      video.duration.toFixed(1) +
      "s)",
    );

    if (typeof triggerHumanMouseNudge === "function") {
      triggerHumanMouseNudge("video_transition");
    }

    if (loopObserver) {
      loopObserver.disconnect();
      loopObserver = null;
    }
    video.removeAttribute("loop");
    video.pause();

    requestNextVideo();
    lastTimeForLoop = -1;
    return;
  }

  if (
    !preloadAttempted &&
    video.duration >= 3 &&
    video.currentTime / video.duration >= 0.70
  ) {
    preloadAttempted = true;
    try {
      chrome.runtime.sendMessage(
        { action: "peekNextVideo", currentUrl: window.location.href },
        function (res) {
          if (chrome.runtime.lastError) return;
          if (res && res.url) {
            console.log(
              "[CS] 🚀 Smart Preload: Pre-warming next video resource (~70% mark): " +
              res.url,
            );
            warmUpNextVideoUrl(res.url);
          }
        },
      );
    } catch (e) { }
  }

  // Method 1: Remaining time check 
  if (remaining < 0.5 && remaining >= 0) {
    playNextRequested = true;


    if (typeof triggerHumanMouseNudge === "function") {
      triggerHumanMouseNudge("video_end");
    }

    if (loopObserver) {
      loopObserver.disconnect();
      loopObserver = null;
    }
    video.removeAttribute("loop");
    video.pause();

    console.log(
      "[CS] Video gần hết (" +
      remaining.toFixed(2) +
      "s còn lại) → Tạm dừng & chuyển video",
    );
    requestNextVideo();
    lastTimeForLoop = -1;
    return;
  }

  // Method 2: Loop-reset detection
  if (
    lastTimeForLoop > 0 &&
    video.duration > 0.5 &&
    lastTimeForLoop > video.duration - 0.6 &&
    video.currentTime < 0.4
  ) {
    console.log(
      "[CS] 🔄 Loop-reset detected (was " +
      lastTimeForLoop.toFixed(2) +
      "s → now " +
      video.currentTime.toFixed(2) +
      "s) → Chuyển video",
    );
    playNextRequested = true;

    if (typeof triggerHumanMouseNudge === "function") {
      triggerHumanMouseNudge("video_transition");
    }

    if (loopObserver) {
      loopObserver.disconnect();
      loopObserver = null;
    }
    video.removeAttribute("loop");
    video.pause();

    requestNextVideo();
    lastTimeForLoop = -1;
    return;
  }

  lastTimeForLoop = video.currentTime;
}

var lastSkipTimestamp = 0;

function requestNextVideo() {
  var now = Date.now();
  var timeSinceLastSkip = now - lastSkipTimestamp;
  if (timeSinceLastSkip < 2000) {
    var remainingDelay = 2000 - timeSinceLastSkip;
    console.log(
      "[CS] ⏳ Throttle: Chờ " +
      remainingDelay +
      "ms trước khi chuyển video tiếp...",
    );
    setTimeout(requestNextVideo, remainingDelay);
    return;
  }
  lastSkipTimestamp = Date.now();

  if (playNextRequested !== true) {
    playNextRequested = true;
  }
  console.log("[CS] → Sending playNext to background");
  try {
    chrome.runtime.sendMessage({ action: "playNext" }, function () {
      if (chrome.runtime.lastError) {
        console.warn("[CS] playNext failed:", chrome.runtime.lastError.message);
        playNextRequested = false;
        // Try to resume video if navigation failed
        if (currentVideoElement) {
          currentVideoElement.setAttribute("loop", "");
          logPlaybackDiagnostics("BEFORE_PLAY", currentVideoElement);
          var p1 = currentVideoElement.play();
          if (p1 && p1.then) {
            p1.then(function () {
              logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
            }).catch(function (err) {
              logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
            });
          }
        }
      }
    });
  } catch (e) {
    playNextRequested = false;
    if (currentVideoElement) {
      currentVideoElement.setAttribute("loop", "");
      logPlaybackDiagnostics("BEFORE_PLAY", currentVideoElement);
      var p2 = currentVideoElement.play();
      if (p2 && p2.then) {
        p2.then(function () {
          logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
        }).catch(function (err) {
          logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
        });
      }
    }
  }
}

function initVideoWatcher() {
  chrome.storage.local.get(["autoNextEnabled"], function (data) {
    if (data.autoNextEnabled === false) return;
    if (!window.location.href.includes("/video/")) return;

    videoWatcherActive = true;
    watchForVideoElement();

    if (!currentVideoElement) {
      let attempts = 0;
      const checkInterval = setInterval(function () {
        watchForVideoElement();
        attempts++;
        if (currentVideoElement || !videoWatcherActive || attempts > 30) {
          clearInterval(checkInterval);
        }
      }, 500);
    }
  });
}
