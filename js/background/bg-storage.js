// Module: bg-storage.js
// Responsibilities: Storage CRUD, Progress State, Checkpoints, Import/Export, Blacklist

let progressState = {
  isCollecting: false,
  scrollCount: 0,
  maxScrolls: 0,
  count: 0,
};

async function handleSaveCheckpoint(checkpoint) {
  if (checkpoint) {
    await chrome.storage.local.set({ checkpoint: checkpoint });
    return { success: true };
  }
  return { success: false };
}

async function handleGetCheckpoint() {
  const data = await chrome.storage.local.get(["checkpoint"]);
  return { success: true, checkpoint: data.checkpoint || null };
}

async function handleClearCheckpoint() {
  await chrome.storage.local.remove(["checkpoint"]);
  return { success: true };
}

function handleCollectionProgress(request) {
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
  return { success: true };
}

function handleGetProgress() {
  return progressState;
}

async function handleVideosCollected(request) {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "blacklistedVideos",
  ]);
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

  await chrome.storage.local.set({
    likedVideos: merged,
    collectedAt: Date.now(),
  });

  console.log("[BG] Saved " + merged.length + " videos (filtered blacklist)");
  return { success: true, count: merged.length };
}

async function handleGetVideoCount() {
  const data = await chrome.storage.local.get(["likedVideos"]);
  return { count: (data.likedVideos || []).length };
}

async function handleGetVideoList() {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "blacklistedVideos",
  ]);
  return {
    videos: data.likedVideos || [],
    blacklistedCount: (data.blacklistedVideos || []).length,
  };
}

async function handleDeleteVideo(index) {
  const data = await chrome.storage.local.get(["likedVideos"]);
  const videos = data.likedVideos || [];
  if (index >= 0 && index < videos.length) {
    videos.splice(index, 1);
    await chrome.storage.local.set({ likedVideos: videos });
    return { success: true, count: videos.length };
  }
  return { success: false, message: "Index không hợp lệ" };
}

async function handleBanVideo(index) {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "blacklistedVideos",
  ]);
  const videos = data.likedVideos || [];
  const blacklist = data.blacklistedVideos || [];

  if (index >= 0 && index < videos.length) {
    const bannedItem = videos.splice(index, 1)[0];
    const bannedUrl = getUrl(bannedItem).split("?")[0];
    if (bannedUrl && !blacklist.includes(bannedUrl)) {
      blacklist.push(bannedUrl);
    }
    await chrome.storage.local.set({
      likedVideos: videos,
      blacklistedVideos: blacklist,
    });
    return {
      success: true,
      count: videos.length,
      blacklistedCount: blacklist.length,
    };
  }
  return { success: false, message: "Index không hợp lệ" };
}

async function handleExportData() {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "blacklistedVideos",
    "collectedAt",
    "tiktokUsername",
    "targetLimit",
  ]);
  return {
    version: "3.1",
    exportAt: Date.now(),
    collectedAt: data.collectedAt || null,
    tiktokUsername: data.tiktokUsername || "",
    targetLimit: data.targetLimit || 100,
    videoCount: (data.likedVideos || []).length,
    blacklistedCount: (data.blacklistedVideos || []).length,
    likedVideos: data.likedVideos || [],
    blacklistedVideos: data.blacklistedVideos || [],
  };
}

async function handleImportData(payload = {}) {
  if (!Array.isArray(payload.likedVideos)) {
    return {
      success: false,
      message: "File backup không hợp lệ (thiếu likedVideos)",
    };
  }
  const newLiked = payload.likedVideos;
  const newBlacklist = Array.isArray(payload.blacklistedVideos)
    ? payload.blacklistedVideos
    : [];
  const collectedAt = payload.collectedAt || Date.now();
  const username = payload.tiktokUsername || "";
  const limit = payload.targetLimit || 100;

  await chrome.storage.local.set({
    likedVideos: newLiked,
    blacklistedVideos: newBlacklist,
    collectedAt: collectedAt,
    tiktokUsername: username,
    targetLimit: limit,
  });

  progressState = {
    isCollecting: false,
    scrollCount: 0,
    maxScrolls: 0,
    count: newLiked.length,
    status: "complete",
  };

  return {
    success: true,
    count: newLiked.length,
    blacklistedCount: newBlacklist.length,
  };
}

async function handleClearCache() {
  await chrome.storage.local.remove([
    "likedVideos",
    "collectedAt",
    "playedVideos",
  ]);
  progressState = {
    isCollecting: false,
    scrollCount: 0,
    maxScrolls: 0,
    count: 0,
    status: "idle",
  };
  return { success: true };
}

async function handleGetAutoNextState() {
  const data = await chrome.storage.local.get(["autoNextEnabled"]);
  return { enabled: data.autoNextEnabled !== false };
}

async function handleSetAutoNext(enabled) {
  await chrome.storage.local.set({ autoNextEnabled: enabled });
  notifyContentScriptAutoNext(enabled);
  return { success: true };
}

const HEALING_MAX_ENTRIES = 50;
const HEALING_MAX_RETRIES = 3;
const HEALING_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

function isMatchingTikTokVideo(url1, url2) {
  if (!url1 || !url2) return false;
  const match1 = url1.match(/\/video\/(\d+)/) || url1.match(/\/v\/(\d+)/);
  const match2 = url2.match(/\/video\/(\d+)/) || url2.match(/\/v\/(\d+)/);
  if (match1 && match2 && match1[1] === match2[1]) return true;
  const clean1 = url1.split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
  const clean2 = url2.split("?")[0].split("#")[0].replace(/\/$/, "").toLowerCase();
  return clean1 === clean2;
}

async function _getHealingQueue() {
  const data = await chrome.storage.local.get(["healingQueue"]);
  return data.healingQueue || [];
}

async function _saveHealingQueue(queue) {
  await chrome.storage.local.set({ healingQueue: queue });
}

async function handleEnqueueForHealing(request) {
  const canonicalUrl = (request.canonicalUrl || "").split("?")[0];
  if (!canonicalUrl || !canonicalUrl.includes("/video/")) {
    return { success: false, error: "Invalid URL" };
  }

  let queue = await _getHealingQueue();

  const existing = queue.find((e) => isMatchingTikTokVideo(e.url, canonicalUrl));
  if (existing) {
    if (existing.retryCount >= HEALING_MAX_RETRIES || existing.status === "dead") {
      return { success: false, error: "Max retries or dead" };
    }
    return { success: true, alreadyQueued: true };
  }

  const entry = {
    url: canonicalUrl,
    reason: request.reason || "unknown",
    addedAt: Date.now(),
    retryCount: 0,
    lastRetryAt: null,
    status: "pending",
  };

  queue.push(entry);
  if (queue.length > HEALING_MAX_ENTRIES) {
    queue = queue.slice(queue.length - HEALING_MAX_ENTRIES);
  }

  await _saveHealingQueue(queue);
  return { success: true };
}

async function handleHealVideo(request) {
  const canonicalUrl = (request.canonicalUrl || "").split("?")[0];
  if (!canonicalUrl) return { success: false };

  const queue = await _getHealingQueue();
  const idx = queue.findIndex((e) => isMatchingTikTokVideo(e.url, canonicalUrl));
  if (idx === -1) return { success: false, error: "Not in queue" };

  queue[idx].status = "healed";
  queue[idx].healedAt = Date.now();
  if (request.newCdnUrl) queue[idx].newCdnUrl = request.newCdnUrl;

  // Purge healed entries older than 24h
  const cutoff = Date.now() - HEALING_CLEANUP_AGE_MS;
  const cleaned = queue.filter(
    (e) => !(e.status === "healed" && e.healedAt && e.healedAt < cutoff),
  );

  await _saveHealingQueue(cleaned);
  return { success: true };
}

async function handleMarkHealingDead(request) {
  const canonicalUrl = (request.canonicalUrl || "").split("?")[0];
  if (!canonicalUrl) return { success: false };

  const queue = await _getHealingQueue();
  const idx = queue.findIndex((e) => isMatchingTikTokVideo(e.url, canonicalUrl));
  if (idx !== -1) {
    queue[idx].status = "dead";
    await _saveHealingQueue(queue);
  }
  return { success: true };
}

async function handleGetHealingQueue() {
  const queue = await _getHealingQueue();
  const pending = queue.filter((e) => e.status === "pending");
  return { success: true, queue, pendingCount: pending.length };
}

async function handleClearHealingQueue() {
  await chrome.storage.local.remove(["healingQueue"]);
  return { success: true };
}

