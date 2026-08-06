// Keep the service worker small; load background helpers from the project root.
importScripts("bg-playback.js", "bg-collections.js");

let progressState = {
  isCollecting: false,
  scrollCount: 0,
  maxScrolls: 0,
  count: 0,
};

let tabNavTimestamps = {};
let last403TriggerTime = 0;

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logTabUpdated(tabId, targetUrl) {
  if (tabId) tabNavTimestamps[tabId] = Date.now();
  try {
    const tab = await chrome.tabs.get(tabId);
    console.log(
      `[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=${tab ? tab.active : "N/A"} | targetURL=${targetUrl || (tab ? tab.url : "N/A")}`,
    );
  } catch (e) {
    console.log(
      `[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=N/A | targetURL=${targetUrl || "N/A"}`,
    );
  }
}

async function getOrCreateTikTokTab(targetUrl) {
  const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
  const activeTabs = await chrome.tabs.query({ active: true });
  const activeTikTok = activeTabs.find(
    (t) => t.url && t.url.includes("tiktok.com"),
  );

  if (activeTikTok) {
    if (targetUrl) {
      await chrome.tabs.update(activeTikTok.id, {
        url: targetUrl,
        active: true,
      });
      await logTabUpdated(activeTikTok.id, targetUrl);
    }
    return activeTikTok;
  }

  if (allTikTokTabs.length > 0) {
    const targetTab = allTikTokTabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
    await logTabUpdated(targetTab.id, targetUrl);
    if (targetUrl) {
      await chrome.tabs.update(targetTab.id, { url: targetUrl });
      await logTabUpdated(targetTab.id, targetUrl);
    }
    return targetTab;
  }

  return await chrome.tabs.create({
    url: targetUrl || "https://www.tiktok.com",
    active: true,
  });
}

async function findTikTokTab() {
  const activeTabs = await chrome.tabs.query({ active: true });
  const activeTikTok = activeTabs.find(
    (t) => t.url && t.url.includes("tiktok.com"),
  );
  if (activeTikTok) return activeTikTok;

  const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
  if (allTikTokTabs.length > 0) {
    return allTikTokTabs[0];
  }
  return null;
}

function isOnLikedPage(tabUrl, username) {
  if (!tabUrl || !username) return false;
  const handle = username.startsWith("@") ? username : "@" + username;
  const profilePattern = "tiktok.com/" + handle;
  return tabUrl.includes(profilePattern);
}

function is403OrErrorTab(tab) {
  if (!tab) return false;
  const title = (tab.title || "").toLowerCase();
  const url = (tab.url || "").toLowerCase();

  if (
    title.includes("denied") ||
    title.includes("403") ||
    title.includes("forbidden") ||
    title.includes("just a moment") ||
    title.includes("access to") ||
    title.includes("site can't be reached") ||
    title.includes("cannot be reached") ||
    title.includes("error") ||
    title.includes("blocked")
  ) {
    return true;
  }

  if (url.includes("chrome-error") || url.includes("edge-error")) {
    return true;
  }

  return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
        "[BG] 403 / Blank page message received! Auto-triggering randomLiked...",
      );
      chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
        const limit = data.targetLimit || 100;
        const username = data.tiktokUsername || "";
        handleRandomLiked(limit, username)
          .then(sendResponse)
          .catch((e) => sendResponse({ success: false, message: e.message }));
      });
      return true;

    case "collectMore":
      handleCollectMore(request.limit, request.username)
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
      handleCollectAndPlay(sender.tab && sender.tab.id ? sender.tab.id : null)
        .then(sendResponse)
        .catch((e) => sendResponse({ success: false, message: e.message }));
      return true;

    case "playNext":
      handlePlayNext(sender.tab && sender.tab.id ? sender.tab.id : null)
        .then(sendResponse)
        .catch((e) => sendResponse({ success: false, message: e.message }));
      return true;

    case "saveCheckpoint":
      if (request.checkpoint) {
        chrome.storage.local.set({ checkpoint: request.checkpoint }, () => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false });
      }
      return true;

    case "getCheckpoint":
      chrome.storage.local.get(["checkpoint"], (data) => {
        sendResponse({ success: true, checkpoint: data.checkpoint || null });
      });
      return true;

    case "clearCheckpoint":
      chrome.storage.local.remove(["checkpoint"], () => {
        sendResponse({ success: true });
      });
      return true;

    case "collectionProgress":
      if (request.isCollecting) {
        progressState = {
          isCollecting: true,
          scrollCount: request.scrollCount,
          maxScrolls: request.maxScrolls,
          count: request.count,
          newCount: request.newCount,
          limit: request.limit,
          status: request.status || "collecting",
          missingThumbs: request.missingThumbs || 0,
          newAddedCount: 0,
        };
      } else {
        progressState.isCollecting = false;
        progressState.status = "complete";
      }
      sendResponse({ success: true });
      return true;

    case "getProgress":
      sendResponse(progressState);
      return true;

    case "videosCollected":
      chrome.storage.local.get(["likedVideos", "blacklistedVideos"], (data) => {
        let existing = data.likedVideos || [];
        let incoming = request.videos || [];
        const blacklist = new Set(data.blacklistedVideos || []);

        existing = existing
          .map((v) => (typeof v === "string" ? { url: v, thumb: "" } : v))
          .filter((v) => !blacklist.has(getUrl(v).split("?")[0]));
        incoming = incoming
          .map((v) => (typeof v === "string" ? { url: v, thumb: "" } : v))
          .filter((v) => !blacklist.has(getUrl(v).split("?")[0]));

        let merged = [];
        let newAddedCount = 0;

        if (request.append) {
          const map = new Map();
          existing.forEach((v) => {
            const url = getUrl(v);
            if (url) map.set(url.split("?")[0], v);
          });

          incoming.forEach((v) => {
            const url = getUrl(v);
            if (url) {
              const key = url.split("?")[0];
              if (map.has(key)) {
                const existingItem = map.get(key);
                if (!existingItem.thumb && v.thumb) {
                  existingItem.thumb = v.thumb;
                }
              } else {
                map.set(key, v);
                newAddedCount++;
              }
            }
          });
          merged = Array.from(map.values());
        } else {
          merged = incoming;
          newAddedCount = incoming.length;
        }

        progressState.isCollecting = false;
        progressState.count = merged.length;
        progressState.newAddedCount = newAddedCount;
        progressState.status = "complete";

        chrome.storage.local.set(
          {
            likedVideos: merged,
            collectedAt: Date.now(),
          },
          () => {
            console.log(
              "[BG] Saved " + merged.length + " videos (filtered blacklist)",
            );
            sendResponse({ success: true, count: merged.length });
          },
        );
      });
      return true;

    case "getVideoCount":
      chrome.storage.local.get(["likedVideos"], (data) => {
        sendResponse({ count: (data.likedVideos || []).length });
      });
      return true;

    case "getVideoList":
      chrome.storage.local.get(["likedVideos", "blacklistedVideos"], (data) => {
        sendResponse({
          videos: data.likedVideos || [],
          blacklistedCount: (data.blacklistedVideos || []).length,
        });
      });
      return true;

    case "deleteVideo":
      chrome.storage.local.get(["likedVideos"], (data) => {
        const videos = data.likedVideos || [];
        const index = request.index;
        if (index >= 0 && index < videos.length) {
          videos.splice(index, 1);
          chrome.storage.local.set({ likedVideos: videos }, () => {
            sendResponse({ success: true, count: videos.length });
          });
        } else {
          sendResponse({ success: false, message: "Index không hợp lệ" });
        }
      });
      return true;

    case "banVideo":
      chrome.storage.local.get(["likedVideos", "blacklistedVideos"], (data) => {
        const videos = data.likedVideos || [];
        const blacklist = data.blacklistedVideos || [];
        const index = request.index;

        if (index >= 0 && index < videos.length) {
          const bannedItem = videos.splice(index, 1)[0];
          const bannedUrl = getUrl(bannedItem).split("?")[0];
          if (bannedUrl && !blacklist.includes(bannedUrl)) {
            blacklist.push(bannedUrl);
          }
          chrome.storage.local.set(
            { likedVideos: videos, blacklistedVideos: blacklist },
            () => {
              sendResponse({
                success: true,
                count: videos.length,
                blacklistedCount: blacklist.length,
              });
            },
          );
        } else {
          sendResponse({ success: false, message: "Index không hợp lệ" });
        }
      });
      return true;

    case "exportData":
      chrome.storage.local.get(
        [
          "likedVideos",
          "blacklistedVideos",
          "collectedAt",
          "tiktokUsername",
          "targetLimit",
        ],
        (data) => {
          sendResponse({
            version: "3.1",
            exportAt: Date.now(),
            collectedAt: data.collectedAt || null,
            tiktokUsername: data.tiktokUsername || "",
            targetLimit: data.targetLimit || 100,
            videoCount: (data.likedVideos || []).length,
            blacklistedCount: (data.blacklistedVideos || []).length,
            likedVideos: data.likedVideos || [],
            blacklistedVideos: data.blacklistedVideos || [],
          });
        },
      );
      return true;

    case "importData":
      try {
        const payload = request.data || {};
        if (!Array.isArray(payload.likedVideos)) {
          sendResponse({
            success: false,
            message: "File backup không hợp lệ (thiếu likedVideos)",
          });
          return true;
        }
        const newLiked = payload.likedVideos;
        const newBlacklist = Array.isArray(payload.blacklistedVideos)
          ? payload.blacklistedVideos
          : [];
        const collectedAt = payload.collectedAt || Date.now();
        const username = payload.tiktokUsername || "";
        const limit = payload.targetLimit || 100;

        chrome.storage.local.set(
          {
            likedVideos: newLiked,
            blacklistedVideos: newBlacklist,
            collectedAt: collectedAt,
            tiktokUsername: username,
            targetLimit: limit,
          },
          () => {
            progressState = {
              isCollecting: false,
              scrollCount: 0,
              maxScrolls: 0,
              count: newLiked.length,
              status: "complete",
            };
            sendResponse({
              success: true,
              count: newLiked.length,
              blacklistedCount: newBlacklist.length,
            });
          },
        );
      } catch (e) {
        sendResponse({ success: false, message: e.message });
      }
      return true;

    case "clearCache":
      chrome.storage.local.remove(
        ["likedVideos", "collectedAt", "playedVideos"],
        () => {
          progressState = {
            isCollecting: false,
            scrollCount: 0,
            maxScrolls: 0,
            count: 0,
            status: "idle",
          };
          sendResponse({ success: true });
        },
      );
      return true;

    case "getAutoNextState":
      chrome.storage.local.get(["autoNextEnabled"], (data) => {
        sendResponse({ enabled: data.autoNextEnabled !== false });
      });
      return true;

    case "setAutoNext":
      chrome.storage.local.set({ autoNextEnabled: request.enabled }, () => {
        notifyContentScriptAutoNext(request.enabled);
        sendResponse({ success: true });
      });
      return true;
  }
});

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId && changeInfo.url) {
    tabNavTimestamps[tabId] = Date.now();
  }
  if (
    tab &&
    tab.url &&
    (tab.url.includes("tiktok.com") ||
      tab.url.includes("chrome-error") ||
      tab.url.includes("edge-error"))
  ) {
    if (is403OrErrorTab(tab)) {
      const now = Date.now();
      if (now - last403TriggerTime > 3000) {
        last403TriggerTime = now;
        console.warn(
          `[BG] Detected 403/Access Denied/Error tab (title: "${tab.title}", url: "${tab.url}"). Auto-triggering randomLiked...`,
        );
        setTimeout(() => {
          chrome.storage.local.get(
            ["targetLimit", "tiktokUsername"],
            (data) => {
              handleRandomLiked(
                data.targetLimit || 100,
                data.tiktokUsername || "",
              );
            },
          );
        }, 1000);
      }
    }
  }
});

setInterval(async () => {
  try {
    const tab = await findTikTokTab();
    if (!tab || !tab.url) return;

    const now = Date.now();

    if (is403OrErrorTab(tab)) {
      if (now - last403TriggerTime > 3000) {
        last403TriggerTime = now;
        console.warn(
          `[BG Watchdog] Active TikTok tab is in 403/Error state ("${tab.title}"). Auto-switching to next random video...`,
        );
        chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
          handleRandomLiked(data.targetLimit || 100, data.tiktokUsername || "");
        });
      }
      return;
    }

    if (tab.url.includes("/video/")) {
      const navTime = tabNavTimestamps[tab.id] || 0;
      const elapsed = now - navTime;

      if (elapsed > 3000) {
        chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
          if (chrome.runtime.lastError || !response || !response.alive) {
            if (now - last403TriggerTime > 3000) {
              last403TriggerTime = now;
              console.warn(
                `[BG Watchdog] Video tab ping failed after ${elapsed}ms ("${tab.url}"). Tab is stuck on 403/chrome-error. Auto-skipping...`,
              );
              chrome.storage.local.get(
                ["targetLimit", "tiktokUsername"],
                (data) => {
                  handleRandomLiked(
                    data.targetLimit || 100,
                    data.tiktokUsername || "",
                  );
                },
              );
            }
          }
        });
      }
    }
  } catch (e) {}
}, 3000);
