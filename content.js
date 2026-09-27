chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "startCollecting") {
    startCollection(
      request.autoPlay || false,
      request.append || false,
      request.limit || 100,
      false,
      request.smartStop || false,
    );
    sendResponse({ success: true, status: "collecting" });
    return true;
  }

  if (request.action === "clickLikedTabAndCollect") {
    clickLikedTab(function (found) {
      startCollection(
        request.autoPlay || false,
        request.append || false,
        request.limit || 100,
        false,
        request.smartStop || false,
      );
    });
    sendResponse({ success: true, status: "clicking_tab" });
    return true;
  }

  if (request.action === "continueCollecting") {
    if (isOnLikedTab()) {
      startCollection(
        request.autoPlay || false,
        true,
        request.limit || 100,
        true,
        request.smartStop || false,
      );
    } else {
      clickLikedTab(function (found) {
        startCollection(
          request.autoPlay || false,
          true,
          request.limit || 100,
          found,
          request.smartStop || false,
        );
      });
    }
    sendResponse({ success: true, status: "continue_collecting" });
    return true;
  }

  if (request.action === "getStatus") {
    sendResponse({
      success: true,
      count: collectedMap.size,
      isCollecting: isCollecting,
      isProfilePage: /tiktok\.com\/@[^/?]+\/?$/.test(
        window.location.href.split("?")[0],
      ),
      isLikedTab: isOnLikedTab(),
      isVideoPage: window.location.href.includes("/video/"),
      autoNextActive: videoWatcherActive,
    });
    return true;
  }

  if (request.action === "navigateToVideo") {
    var allVidsNav = document.querySelectorAll("video");
    for (var n = 0; n < allVidsNav.length; n++) {
      allVidsNav[n].muted = true;
      try { allVidsNav[n].pause(); } catch (_) {}
    }
    window.location.href = request.url;
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "ping") {
    sendResponse({ alive: true });
    return true;
  }

  if (request.action === "setAutoNext") {
    if (request.enabled) {
      initVideoWatcher();
    } else {
      videoWatcherActive = false;
      if (loopObserver) {
        loopObserver.disconnect();
        loopObserver = null;
      }
      if (currentVideoElement) {
        currentVideoElement.removeEventListener("ended", onVideoEnded);
        currentVideoElement.removeEventListener(
          "timeupdate",
          onVideoTimeUpdate,
        );
        if (typeof onVideoUserPause === "function") {
          currentVideoElement.removeEventListener("pause", onVideoUserPause);
          currentVideoElement.removeEventListener("play", onVideoUserPlay);
        }
        currentVideoElement = null;
      }
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "showWarningToast") {
    if (typeof showToast === "function") {
      showToast(request.message || "⚠️ Cảnh báo", "warning");
    }
    sendResponse({ success: true });
    return true;
  }
});

// Auto-init based on current page type
function autoInit() {
  if (window.location.href.includes("/video/")) {
    initVideoWatcher();
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  autoInit();
} else {
  window.addEventListener("DOMContentLoaded", autoInit);
  window.addEventListener("load", autoInit);
}

// SPA navigation detector — TikTok changes URL without full page reload
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(function () {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    currentVideoElement = null;
    timeUpdateTriggered = false;
    playNextRequested = false;
    if (loopObserver) {
      loopObserver.disconnect();
      loopObserver = null;
    }

    if (lastUrl.includes("/video/")) {
      setTimeout(function () {
        initVideoWatcher();
      }, 300);
    }
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });
