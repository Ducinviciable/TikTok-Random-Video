// Module: content-video-smart.js
// Responsibilities: Smart Preloading 70%, Video End & Loop-Reset Timing Detection, Early Interest Simulation, 2s Throttle & Navigation Dispatcher

var EARLY_SKIP_CHANCE = 0.10; // 10% probability of low interest
var EARLY_SKIP_MIN_RATIO = 0.40; // Skip between 40%
var EARLY_SKIP_MAX_RATIO = 0.80; // and 70% of duration
var preloadAttempted = false;
var isLowInterestVideo = false;
var earlySkipTargetRatio = 0;
var earlySkipTriggered = false;
var lastTimeForLoop = -1;
var lastSkipTimestamp = 0;
var playNextSafetyTimer = null;

var isBatchHealingActive = false;
var batchHealingDone = false;
var batchHealingTargetTime = 0;
var lastHudLeft = 16;
var lastHudTop = 16;
var isHudDragging = false;
var hudDragOffsetX = 0;
var hudDragOffsetY = 0;

function _initHudDragListeners(hudEl) {
  if (hudEl.dataset.dragInit) return;
  hudEl.dataset.dragInit = "true";

  hudEl.addEventListener("mousedown", function (e) {
    if (e.target.closest("button")) return;
    isHudDragging = true;
    hudDragOffsetX = e.clientX - hudEl.offsetLeft;
    hudDragOffsetY = e.clientY - hudEl.offsetTop;
    hudEl.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function (e) {
    if (!isHudDragging) return;
    var maxLeft = Math.max(8, window.innerWidth - hudEl.offsetWidth - 8);
    var maxTop = Math.max(8, window.innerHeight - hudEl.offsetHeight - 8);
    var newLeft = Math.max(8, Math.min(maxLeft, e.clientX - hudDragOffsetX));
    var newTop = Math.max(8, Math.min(maxTop, e.clientY - hudDragOffsetY));

    lastHudLeft = newLeft;
    lastHudTop = newTop;
    hudEl.style.left = newLeft + "px";
    hudEl.style.top = newTop + "px";
    hudEl.style.right = "auto";
  });

  document.addEventListener("mouseup", function () {
    if (isHudDragging) {
      isHudDragging = false;
      hudEl.style.cursor = "grab";
    }
  });
}

function renderBatchHealingHUD(pendingCount, totalCount) {
  var existing = document.getElementById("tk-batch-healing-hud");
  if (!isBatchHealingActive) {
    if (existing) existing.remove();
    return;
  }

  if (!existing) {
    existing = document.createElement("div");
    existing.id = "tk-batch-healing-hud";
    existing.style.cssText =
      "position:fixed;top:" +
      lastHudTop +
      "px;left:" +
      lastHudLeft +
      "px;z-index:999999;background:rgba(18,18,28,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.2);border-radius:14px;padding:10px 14px;color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,0.45);display:flex;align-items:center;gap:10px;cursor:grab;user-select:none;";
    document.body.appendChild(existing);
    _initHudDragListeners(existing);
  } else {
    existing.style.top = lastHudTop + "px";
    existing.style.left = lastHudLeft + "px";
    existing.style.right = "auto";
  }

  var healed = Math.max(0, totalCount - pendingCount);
  var pct = totalCount > 0 ? Math.round((healed / totalCount) * 100) : 100;

  existing.innerHTML =
    '<span style="font-size:16px;line-height:1;pointer-events:none">⚡</span>' +
    '<div style="pointer-events:none">' +
    '<div style="font-weight:600;font-size:12px;color:#a89cf5">ĐANG HỒI SINH BATCH</div>' +
    '<div style="font-size:11px;color:#94a3b8">' + healed + "/" + totalCount + " video (" + pct + "%)</div>" +
    "</div>" +
    '<button id="btn-stop-batch-healing" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.5);color:#f87171;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;margin-left:4px;">Dừng</button>';

  var stopBtn = document.getElementById("btn-stop-batch-healing");
  if (stopBtn) {
    stopBtn.onclick = function (e) {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: "stopBatchHealing" }, function () {
        isBatchHealingActive = false;
        if (existing) existing.remove();
      });
    };
  }
}

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

  // Batch Healing Skip Handler (10% - 40% duration, min 3.5s)
  if (
    isBatchHealingActive &&
    batchHealingDone &&
    !playNextRequested &&
    video.currentTime >= batchHealingTargetTime
  ) {
    playNextRequested = true;
    console.log(
      "[CS] ⚡ Batch Healing: Reached target skip time (" +
      video.currentTime.toFixed(1) +
      "s / " +
      batchHealingTargetTime.toFixed(1) +
      "s) → Chuyển video kế tiếp",
    );
    video.muted = true;
    requestNextVideo();
    lastTimeForLoop = -1;
    return;
  }

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

    video.muted = true;
    var otherVidsEarly = document.querySelectorAll("video");
    for (var k1 = 0; k1 < otherVidsEarly.length; k1++) {
      if (otherVidsEarly[k1] !== video) {
        otherVidsEarly[k1].muted = true;
        try { otherVidsEarly[k1].pause(); } catch (_) { }
      }
    }

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

    video.muted = true;
    var otherVidsEnd = document.querySelectorAll("video");
    for (var k2 = 0; k2 < otherVidsEnd.length; k2++) {
      if (otherVidsEnd[k2] !== video) {
        otherVidsEnd[k2].muted = true;
        try { otherVidsEnd[k2].pause(); } catch (_) { }
      }
    }

    console.log(
      "[CS] Video gần hết (" +
      remaining.toFixed(2) +
      "s còn lại) → Mute & chuyển video ngẫu nhiên",
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

    video.muted = true;
    var otherVidsLoop = document.querySelectorAll("video");
    for (var k3 = 0; k3 < otherVidsLoop.length; k3++) {
      if (otherVidsLoop[k3] !== video) {
        otherVidsLoop[k3].muted = true;
        try { otherVidsLoop[k3].pause(); } catch (_) { }
      }
    }

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

  if (playNextSafetyTimer) clearTimeout(playNextSafetyTimer);
  playNextSafetyTimer = setTimeout(function () {
    if (playNextRequested && videoWatcherActive) {
      console.warn(
        "[CS] ⚠️ playNextRequested timed out after 8s → resetting lock and retrying requestNextVideo",
      );
      if (typeof showToast === "function") {
        showToast("⚠️ Chuyển video bị nghẽn → Đang thử lại...", "warning");
      }
      playNextRequested = false;
      requestNextVideo();
    }
  }, 8000);

  console.log("[CS] → Sending playNext to background");
  try {
    chrome.runtime.sendMessage({ action: "playNext" }, function () {
      if (chrome.runtime.lastError) {
        if (playNextSafetyTimer) clearTimeout(playNextSafetyTimer);
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
