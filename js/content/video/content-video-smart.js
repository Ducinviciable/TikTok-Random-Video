// Module: content-video-smart.js
// Responsibilities: Smart Preloading 70%, Video End & Loop-Reset Timing Detection, Early Interest Simulation, 2s Throttle & Navigation Dispatcher

var EARLY_SKIP_CHANCE = 0.10; // 10% probability of low interest
var EARLY_SKIP_MIN_RATIO = 0.30; // Skip between 30%
var EARLY_SKIP_MAX_RATIO = 0.80; // and 80% of duration
var preloadAttempted = false;
var isLowInterestVideo = false;
var earlySkipTargetRatio = 0;
var earlySkipTriggered = false;
var lastTimeForLoop = -1;
var lastSkipTimestamp = 0;

function warmUpNextVideoUrl(nextUrl) {
  if (!nextUrl || typeof nextUrl !== "string" || !nextUrl.startsWith("http"))
    return;

  try {
    fetch(nextUrl, { method: "HEAD", mode: "no-cors" }).catch(function () {});
  } catch (e) {}

  try {
    var oldLink = document.getElementById("tk-random-preload-link");
    if (oldLink) oldLink.remove();

    var link = document.createElement("link");
    link.id = "tk-random-preload-link";
    link.rel = "prefetch";
    link.href = nextUrl;
    document.head.appendChild(link);
  } catch (e) {}
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
    } catch (e) {}
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
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("BEFORE_PLAY", currentVideoElement);
          }
          var p1 = currentVideoElement.play();
          if (p1 && p1.then) {
            p1.then(function () {
              if (typeof logPlaybackDiagnostics === "function") {
                logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
              }
            }).catch(function (err) {
              if (typeof logPlaybackDiagnostics === "function") {
                logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
              }
            });
          }
        }
      }
    });
  } catch (e) {
    playNextRequested = false;
    if (currentVideoElement) {
      currentVideoElement.setAttribute("loop", "");
      if (typeof logPlaybackDiagnostics === "function") {
        logPlaybackDiagnostics("BEFORE_PLAY", currentVideoElement);
      }
      var p2 = currentVideoElement.play();
      if (p2 && p2.then) {
        p2.then(function () {
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
          }
        }).catch(function (err) {
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
          }
        });
      }
    }
  }
}
