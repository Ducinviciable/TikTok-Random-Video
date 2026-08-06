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
      if (currentVideoElement) {
        currentVideoElement.setAttribute("loop", "");
        currentVideoElement.removeEventListener("ended", onVideoEnded);
        currentVideoElement.removeEventListener(
          "timeupdate",
          onVideoTimeUpdate,
        );
        currentVideoElement = null;
      }
    }
    sendResponse({ success: true });
    return true;
  }
});

// Auto-init based on current page type
function autoInit() {
  if (window.location.href.includes("/video/")) {
    setTimeout(function () {
      initVideoWatcher();
    }, 1000);
  }
}

if (document.readyState === "complete") {
  autoInit();
} else {
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
      }, 800);
    }
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });
