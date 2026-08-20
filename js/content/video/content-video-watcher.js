// Module: content-video-watcher.js
// Responsibilities: Video Element Discovery, Buffer/Play Configuration, Event Listeners, Loop Guardian, Video Watcher Initializer

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

  _checkAndHealVideo(currentVideoElement);


  // Force aggressive buffering + immediate playback attempt
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
          currentVideoElement.play().catch(function () {});
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
      } catch (e) {}
      var p = currentVideoElement.play();
      if (p && p.then) {
        p.catch(function () {});
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
            p.catch(function () {});
          }
        }
      }, 300);
    }
  });

  // Start 6-second stuck monitor and check audio/shop after video loads
  if (typeof startStuckMonitor === "function") {
    startStuckMonitor();
  }
  if (typeof checkVideoAudioAndShop === "function") {
    setTimeout(checkVideoAudioAndShop, 2500);
  }

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

function _checkAndHealVideo(videoEl) {
  const canonicalUrl = window.location.href.split("?")[0];
  if (!canonicalUrl.includes("/video/")) return;

  chrome.storage.local.get(["healingQueue", "healingEnabled"], function (data) {
    if (data.healingEnabled === false) return;
    const queue = data.healingQueue || [];
    const entry = queue.find(
      (e) => e.url === canonicalUrl && e.status === "pending",
    );
    if (!entry) return;

    // Check if the page itself signals the video is unavailable/deleted
    const bodyText = document.body ? document.body.innerText || "" : "";
    const isUnavailable =
      bodyText.includes("Video unavailable") ||
      bodyText.includes("This video is unavailable") ||
      bodyText.includes("Couldn't find this video") ||
      document.title.toLowerCase().includes("404");

    if (isUnavailable) {
      chrome.runtime.sendMessage(
        { action: "markHealingDead", canonicalUrl },
        function () {
          if (chrome.runtime.lastError) {}
        },
      );
      return;
    }

    // Wait for the video element to have a valid playable CDN src
    var attempts = 0;
    var pollInterval = setInterval(function () {
      attempts++;
      var src = videoEl ? (videoEl.currentSrc || videoEl.src || "") : "";
      var isValidSrc =
        src &&
        !src.startsWith("blob:") &&
        !src.startsWith("data:") &&
        src.includes("http");

      if (isValidSrc) {
        clearInterval(pollInterval);
        chrome.runtime.sendMessage(
          { action: "healVideo", canonicalUrl, newCdnUrl: src },
          function () {
            if (chrome.runtime.lastError) {}
          },
        );
        return;
      }

      if (attempts >= 20) {
        clearInterval(pollInterval);
      }
    }, 500);
  });
}

