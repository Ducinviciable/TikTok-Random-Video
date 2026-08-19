// Module: content-video-recovery.js
// Responsibilities: Layer 6 Error Recovery, "Please Wait" & 403 Detectors, 6s Stuck Video Monitor, TikTok Shop & Muted Audio Check

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
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("BEFORE_PLAY", video);
          }
          var p = video.play();
          if (p && p.then) {
            p.then(function () {
              if (typeof logPlaybackDiagnostics === "function") {
                logPlaybackDiagnostics("PLAY_RESOLVED", video);
              }
            }).catch(function (err) {
              if (typeof logPlaybackDiagnostics === "function") {
                logPlaybackDiagnostics("PLAY_REJECTED", video);
              }
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
          } catch (e) {}
        }

        // Multi-Phase Soft Recovery: Require Please Wait to persist > 12s
        if (pleaseWaitStartTime && now - pleaseWaitStartTime > 12000) {
          console.warn(
            "[CS] ⚠️ 'Please Wait' kéo dài > 12s → Kích hoạt chuỗi phục hồi mềm (Phase A-D)...",
          );
          if (typeof showToast === "function") {
            showToast(
              "⚠️ Vui lòng chờ kéo dài → Đang thử tự phục hồi...",
              "warning",
            );
          }

          // Phase A: Micro-scrolls (±50px)
          try {
            window.scrollBy({ top: -50, behavior: "smooth" });
            setTimeout(function () {
              window.scrollBy({ top: 50, behavior: "smooth" });
            }, 300);
          } catch (e) {}

          // Phase B: Fake focus/visibility flash
          try {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new FocusEvent("focus"));
          } catch (e) {}

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
              if (typeof showToast === "function") {
                showToast(
                  "⚠️ Vẫn bị chặn → Đang chuyển video tiếp...",
                  "warning",
                );
              }
              if (typeof requestNextVideo === "function") {
                requestNextVideo();
              }
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
        if (typeof showToast === "function") {
          showToast(
            "🤖 Phát hiện lỗi 403 / Trang trắng → Đang mở video ngẫu nhiên mới...",
            "warning",
          );
        }
        try {
          chrome.runtime.sendMessage({ action: "handle403Detected" });
        } catch (e) {}
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
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("STUCK", video);
          }
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
          if (typeof logPlaybackDiagnostics === "function") {
            logPlaybackDiagnostics("STUCK_SOFT_RECOVERY", video);
          }
          if (typeof triggerHumanMouseNudge === "function") {
            triggerHumanMouseNudge("recovery");
          }
          try {
            video.load();
            video.currentTime = 0.05;
          } catch (e) {}
          var p = video.play();
          if (p && p.then) {
            p.then(function () {
              if (typeof logPlaybackDiagnostics === "function") {
                logPlaybackDiagnostics("PLAY_RESOLVED", video);
              }
            }).catch(function () {});
          }
        }
        // Hard skip at 6s
        if (stuckSeconds >= 6) {
          console.warn(
            "[CS] ⚠️ Video bị đứng quá 6s! Tự động chuyển video tiếp...",
          );
          if (typeof showToast === "function") {
            showToast("⚠️ Video bị đứng quá 6s → Tự chuyển video", "warning");
          }
          clearInterval(stuckInterval);
          if (typeof requestNextVideo === "function") {
            requestNextVideo();
          }
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
    if (typeof showToast === "function") {
      showToast("🛒 Bỏ qua video sau 2s...", "info");
    }
    if (typeof requestNextVideo === "function") {
      setTimeout(requestNextVideo, 2200);
    }
    return;
  }

  // 2. No Audio / Muted Sound Check
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
    if (typeof showToast === "function") {
      showToast("🔇 Bỏ qua video âm thanh bị gỡ (chờ 2s)...", "info");
    }
    if (typeof requestNextVideo === "function") {
      setTimeout(requestNextVideo, 2200);
    }
    return;
  }

  if (currentVideoElement && currentVideoElement.muted) {
    currentVideoElement.muted = false;
    if (currentVideoElement.volume === 0) {
      currentVideoElement.volume = 1.0;
    }
  }
}
