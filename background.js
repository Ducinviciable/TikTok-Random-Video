// Root Service Worker for TikTok Random Liked (Manifest V3)
importScripts(
  "js/background/bg-recovery.js",
  "js/background/bg-storage.js",
  "js/background/bg-playback.js",
  "js/background/bg-collections.js",
);

// Central Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const senderTabId = sender.tab && sender.tab.id ? sender.tab.id : null;
  const senderTabUrl = sender.tab && sender.tab.url ? sender.tab.url : "";

  switch (request.action) {
    case "randomLiked":
      handleRandomLiked(request.limit, request.username)
        .then(sendResponse)
        .catch((e) =>
          sendResponse({ success: false, status: "error", message: e.message }),
        );
      return true;

    case "handle403Detected":
      console.warn(
        "[BG] 403 / Blank page message received from CS! Triggering tiered recovery...",
      );
      triggerTiered403Recovery("CS_handle403Detected", senderTabId)
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, message: e.message }));
      return true;

    case "collectMore":
      handleCollectMore(request.limit, request.username, request.smartStop)
        .then(sendResponse)
        .catch((e) =>
          sendResponse({ success: false, status: "error", message: e.message }),
        );
      return true;

    case "skipAndPlayNext":
      handleSkipAndPlayNext()
        .then(sendResponse)
        .catch((e) =>
          sendResponse({ success: false, status: "error", message: e.message }),
        );
      return true;

    case "banAndPlayNext":
      handleBanAndPlayNext()
        .then(sendResponse)
        .catch((e) =>
          sendResponse({ success: false, status: "error", message: e.message }),
        );
      return true;

    case "collectAndPlay":
      handleCollectAndPlay(senderTabId)
        .then(sendResponse)
        .catch((e) => sendResponse({ success: false, message: e.message }));
      return true;

    case "playNext":
      handlePlayNext(senderTabId)
        .then(sendResponse)
        .catch((e) => sendResponse({ success: false, message: e.message }));
      return true;

    case "peekNextVideo":
      peekNextVideo(request.currentUrl || senderTabUrl)
        .then((res) => sendResponse(res || { url: null }))
        .catch(() => sendResponse({ url: null }));
      return true;

    case "saveCheckpoint":
      handleSaveCheckpoint(request.checkpoint).then(sendResponse);
      return true;

    case "getCheckpoint":
      handleGetCheckpoint().then(sendResponse);
      return true;

    case "clearCheckpoint":
      handleClearCheckpoint().then(sendResponse);
      return true;

    case "collectionProgress":
      sendResponse(handleCollectionProgress(request));
      return true;

    case "getProgress":
      sendResponse(handleGetProgress());
      return true;

    case "videosCollected":
      handleVideosCollected(request).then(sendResponse);
      return true;

    case "getVideoCount":
      handleGetVideoCount().then(sendResponse);
      return true;

    case "getVideoList":
      handleGetVideoList().then(sendResponse);
      return true;

    case "deleteVideo":
      handleDeleteVideo(request.index).then(sendResponse);
      return true;

    case "banVideo":
      handleBanVideo(request.index).then(sendResponse);
      return true;

    case "exportData":
      handleExportData().then(sendResponse);
      return true;

    case "importData":
      handleImportData(request.data).then(sendResponse);
      return true;

    case "clearCache":
      handleClearCache().then(sendResponse);
      return true;

    case "getAutoNextState":
      handleGetAutoNextState().then(sendResponse);
      return true;

    case "setAutoNext":
      handleSetAutoNext(request.enabled).then(sendResponse);
      return true;
  }
});

// Extension Lifecycle Listeners
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(["likedVideos", "collectedAt", "playedVideos"]);
  chrome.storage.local.set({ autoNextEnabled: true });
  console.log("[BG] Extension installed/updated, cache cleared");
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "skip-and-delete") {
    handleSkipAndPlayNext()
      .then((response) => {
        console.log("[BG] Shortcut result:", response);
      })
      .catch((err) => {
        console.error("[BG] Shortcut error:", err);
      });
  }
});

// Initialize Background Watchdog and Navigation Tracker
initWatchdogAndTabListeners();
