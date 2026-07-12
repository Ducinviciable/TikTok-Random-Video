// content.js — Main entry point for TikTok content scripts
// Loads: selectors.js → content-utils.js → content-video.js → content-core.js → this file
//
// Shared state variables (accessible by all modules):
let isCollecting = false;
let collectedMap = new Map();
let videoWatcherActive = false;
let currentVideoElement = null;
let timeUpdateTriggered = false;

// Message listener — routes commands from background/popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "startCollecting") {
        startCollection(request.autoPlay || false, request.append || false, request.limit || 100, false);
        sendResponse({ success: true, status: "collecting" });
        return true;
    }

    if (request.action === "clickLikedTabAndCollect") {
        clickLikedTab(function (found) {
            startCollection(request.autoPlay || false, request.append || false, request.limit || 100, false);
        });
        sendResponse({ success: true, status: "clicking_tab" });
        return true;
    }

    if (request.action === "continueCollecting") {
        if (isOnLikedTab()) {
            startCollection(request.autoPlay || false, true, request.limit || 100, true);
        } else {
            clickLikedTab(function (found) {
                startCollection(request.autoPlay || false, true, request.limit || 100, found);
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
            isProfilePage: /tiktok\.com\/@[^/?]+\/?$/.test(window.location.href.split("?")[0]),
            isLikedTab: isOnLikedTab(),
            isVideoPage: window.location.href.includes("/video/"),
            autoNextActive: videoWatcherActive
        });
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
                currentVideoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
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
        }, 2000);
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

        if (lastUrl.includes("/video/")) {
            setTimeout(function () {
                initVideoWatcher();
            }, 2000);
        }
    }
});
urlObserver.observe(document.body, { childList: true, subtree: true });