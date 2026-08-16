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
