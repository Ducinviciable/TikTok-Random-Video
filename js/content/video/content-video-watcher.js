// Module: content-video-watcher.js
// Responsibilities: Video Element Discovery, Buffer/Play Configuration, Event Listeners, Loop Guardian, Video Watcher Initializer

function isMatchingTikTokVideo(url1, url2) {
  if (!url1 || !url2) return false;
  const match1 = url1.match(/\/video\/(\d+)/) || url1.match(/\/v\/(\d+)/);
  const match2 = url2.match(/\/video\/(\d+)/) || url2.match(/\/v\/(\d+)/);
  if (match1 && match2 && match1[1] === match2[1]) return true;
  const clean1 = url1.split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
  const clean2 = url2.split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
  return clean1 === clean2;
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

  for (let j = 0; j < videos.length; j++) {
    const other = videos[j];
    if (other !== targetVideo) {
      other.muted = true;
      try { other.pause(); } catch (_) { }
    }
  }

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

  _checkAndHealVideo(currentVideoElement);

  currentVideoElement.setAttribute("preload", "auto");
  currentVideoElement.setAttribute("playsinline", "");
  currentVideoElement.muted = false;
  if (currentVideoElement.volume === 0) {
    currentVideoElement.volume = 1.0;
  }

  if (typeof logPlaybackDiagnostics === "function") {
    logPlaybackDiagnostics("VIDEO_FOUND", currentVideoElement);
    logPlaybackDiagnostics("AGGRESSIVE_PLAY", currentVideoElement);
  }
  var pInit = currentVideoElement.play();
  if (pInit && pInit.then) {
    pInit
      .then(function () {
        if (typeof logPlaybackDiagnostics === "function") {
          logPlaybackDiagnostics("PLAY_RESOLVED", currentVideoElement);
        }
      })
      .catch(function (err) {
        console.warn("[CS] Autoplay rejected on new video:", err);
        if (err && err.name === "NotAllowedError" && currentVideoElement) {
          currentVideoElement.muted = true;
          currentVideoElement.play().catch(function () { });
          function unmuteOnInteraction() {
            if (currentVideoElement) {
              currentVideoElement.muted = false;
              if (currentVideoElement.volume === 0) currentVideoElement.volume = 1.0;
            }
            window.removeEventListener("click", unmuteOnInteraction, true);
            window.removeEventListener("keydown", unmuteOnInteraction, true);
            window.removeEventListener("touchstart", unmuteOnInteraction, true);
            window.removeEventListener("pointerdown", unmuteOnInteraction, true);
          }
          window.addEventListener("click", unmuteOnInteraction, true);
          window.addEventListener("keydown", unmuteOnInteraction, true);
          window.addEventListener("touchstart", unmuteOnInteraction, true);
          window.addEventListener("pointerdown", unmuteOnInteraction, true);
        }
        if (typeof logPlaybackDiagnostics === "function") {
          logPlaybackDiagnostics("PLAY_REJECTED", currentVideoElement);
        }
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
      if (typeof logPlaybackDiagnostics === "function") {
        logPlaybackDiagnostics(
          "EVENT_" + evtName.toUpperCase(),
          currentVideoElement,
        );
      }
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

  // Recovery: Re-play when network stream stalls in background
  currentVideoElement.addEventListener("stalled", function () {
    if (
      !playNextRequested &&
      currentVideoElement &&
      !currentVideoElement.ended
    ) {
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

  if (typeof startStuckMonitor === "function") {
    startStuckMonitor();
  }
  if (typeof checkVideoAudioAndShop === "function") {
    setTimeout(checkVideoAudioAndShop, 2500);
  }

  if (!currentVideoElement.hasAttribute("loop")) {
    currentVideoElement.setAttribute("loop", "");
  }
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

  currentVideoElement.addEventListener("timeupdate", onVideoTimeUpdate);
  currentVideoElement.addEventListener("ended", onVideoEnded);
}

function initVideoWatcher() {
  chrome.storage.local.get(["autoNextEnabled", "healingModeActive"], function (data) {
    if (data.autoNextEnabled === false) return;
    if (!window.location.href.includes("/video/")) return;

    videoWatcherActive = true;
    _checkAndHealVideo();
    watchForVideoElement();

    if (!currentVideoElement) {
      let attempts = 0;
      const checkInterval = setInterval(function () {
        watchForVideoElement();
        attempts++;
        if (currentVideoElement || !videoWatcherActive) {
          clearInterval(checkInterval);
        } else if (attempts > 30) {
          clearInterval(checkInterval);
          if (data.healingModeActive && !playNextRequested) {
            console.log("[CS] ⚡ Batch Healing: Video load timeout → Bỏ qua video");
            requestNextVideo();
          }
        }
      }, 500);
    }
  });
}

function _isPageVideoUnavailable() {
  const bodyText = (document.body ? document.body.innerText || "" : "").toLowerCase();
  const pageTitle = (document.title || "").toLowerCase();

  const keywords = typeof UNAVAILABLE_VIDEO_KEYWORDS !== "undefined" ? UNAVAILABLE_VIDEO_KEYWORDS : [
    "video unavailable",
    "this video is unavailable",
    "couldn't find this video",
    "video is private",
    "video not available",
    "video hiện không khả dụng",
    "video này hiện không khả dụng",
    "không thể tìm thấy video này",
    "bạn đang tìm kiếm video",
    "hãy thử duyệt tìm các tác giả",
    "video ở chế độ riêng tư",
    "video này đã bị xóa",
    "video đã bị xóa",
    "404"
  ];

  return keywords.some(function (kw) {
    return bodyText.includes(kw.toLowerCase()) || pageTitle.includes(kw.toLowerCase());
  });
}

function _checkAndHealVideo(videoEl) {
  const canonicalUrl = window.location.href.split("?")[0];
  if (!canonicalUrl.includes("/video/")) return;

  chrome.storage.local.get(["healingQueue", "healingEnabled", "healingModeActive"], function (data) {
    if (data.healingEnabled === false) return;
    const queue = data.healingQueue || [];
    const isBatchMode = data.healingModeActive === true;
    const pendingList = queue.filter((e) => e.status === "pending");

    if (isBatchMode) {
      isBatchHealingActive = true;
      if (typeof renderBatchHealingHUD === "function") {
        renderBatchHealingHUD(pendingList.length, queue.length);
      }
    }

    const entry = queue.find(
      (e) => isMatchingTikTokVideo(e.url, canonicalUrl) && e.status === "pending",
    );
    if (!entry && !isBatchMode) return;

    function triggerDeadSkip() {
      chrome.runtime.sendMessage(
        { action: "markHealingDead", canonicalUrl },
        function () {
          if (chrome.runtime.lastError) { }
        },
      );
      if (isBatchMode) {
        if (typeof showToast === "function") {
          showToast("Video không khả dụng → Bỏ qua sau 2s", "warning");
        }
        setTimeout(function () {
          if (!playNextRequested) requestNextVideo();
        }, 2000);
      }
    }

    if (_isPageVideoUnavailable()) {
      triggerDeadSkip();
      return;
    }

    var deadObserver = null;
    if (document.body) {
      deadObserver = new MutationObserver(function () {
        if (_isPageVideoUnavailable()) {
          if (deadObserver) {
            deadObserver.disconnect();
            deadObserver = null;
          }
          clearInterval(pollInterval);
          triggerDeadSkip();
        }
      });
      deadObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    var attempts = 0;
    var pollInterval = setInterval(function () {
      attempts++;

      if (_isPageVideoUnavailable()) {
        if (deadObserver) {
          deadObserver.disconnect();
          deadObserver = null;
        }
        clearInterval(pollInterval);
        triggerDeadSkip();
        return;
      }

      var liveEl = currentVideoElement || videoEl || document.querySelector("video");
      var isHealed =
        liveEl &&
        !liveEl.error &&
        (liveEl.readyState >= 2 || liveEl.currentTime > 0 || (liveEl.duration > 0 && !liveEl.paused));

      if (isHealed) {
        if (deadObserver) {
          deadObserver.disconnect();
          deadObserver = null;
        }
        clearInterval(pollInterval);
        var rawSrc = liveEl.currentSrc || liveEl.src || "";
        var directCdnUrl =
          rawSrc && !rawSrc.startsWith("blob:") && !rawSrc.startsWith("data:") && rawSrc.startsWith("http")
            ? rawSrc
            : null;
        chrome.runtime.sendMessage(
          { action: "healVideo", canonicalUrl, newCdnUrl: directCdnUrl },
          function () {
            if (chrome.runtime.lastError) { }
          },
        );
        if (typeof showToast === "function") {
          showToast("Chúc mừng video đã hồi sinh 🤩", "success");
        }

        if (isBatchMode) {
          var ratio = 0.10 + Math.random() * (0.25 - 0.10);
          var dur = liveEl.duration && isFinite(liveEl.duration) ? liveEl.duration : 15;
          batchHealingTargetTime = Math.max(dur * ratio, 2.5);
          batchHealingDone = true;
          console.log(
            "[CS] ⚡ Batch Healing: Target skip at " +
            (ratio * 100).toFixed(0) +
            "% (" +
            batchHealingTargetTime.toFixed(1) +
            "s / " +
            dur.toFixed(1) +
            "s)",
          );
        }
        return;
      }

      if (attempts >= 30) {
        if (deadObserver) {
          deadObserver.disconnect();
          deadObserver = null;
        }
        clearInterval(pollInterval);
        if (isBatchMode) {
          setTimeout(function () {
            if (!playNextRequested) requestNextVideo();
          }, 2000);
        }
      }
    }, 500);
  });
}

