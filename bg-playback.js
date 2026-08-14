function getUrl(item) {
  if (!item) return "";
  return typeof item === "string" ? item : item.url || "";
}

async function selectRandomVideo(excludeUrl = "") {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "playedVideos",
    "blacklistedVideos",
  ]);
  const videos = data.likedVideos || [];
  let played = data.playedVideos || [];
  const blacklist = new Set(data.blacklistedVideos || []);

  const validVideos = videos.filter(
    (v) => !blacklist.has(getUrl(v).split("?")[0]),
  );
  if (validVideos.length === 0) return null;

  const targetExclude = excludeUrl.split("?")[0];
  let pool = validVideos.filter(
    (v) => getUrl(v).split("?")[0] !== targetExclude,
  );
  if (pool.length === 0) pool = validVideos;

  const playedSet = new Set(played);
  let unplayedPool = pool.filter(
    (v) => !playedSet.has(getUrl(v).split("?")[0]),
  );

  if (unplayedPool.length === 0) {
    played = [];
    unplayedPool = pool;
  }

  const selectedVideo =
    unplayedPool[Math.floor(Math.random() * unplayedPool.length)];
  const selectedUrl = getUrl(selectedVideo);

  played.push(selectedUrl.split("?")[0]);
  await chrome.storage.local.set({ playedVideos: played });

  return {
    video: selectedVideo,
    unplayedCount: unplayedPool.length - 1,
    totalCount: validVideos.length,
  };
}

async function peekNextVideo(excludeUrl = "") {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "playedVideos",
    "blacklistedVideos",
  ]);
  const videos = data.likedVideos || [];
  const played = data.playedVideos || [];
  const blacklist = new Set(data.blacklistedVideos || []);

  const validVideos = videos.filter(
    (v) => !blacklist.has(getUrl(v).split("?")[0]),
  );
  if (validVideos.length === 0) return null;

  const targetExclude = excludeUrl.split("?")[0];
  let pool = validVideos.filter(
    (v) => getUrl(v).split("?")[0] !== targetExclude,
  );
  if (pool.length === 0) pool = validVideos;

  const playedSet = new Set(played);
  let unplayedPool = pool.filter(
    (v) => !playedSet.has(getUrl(v).split("?")[0]),
  );

  if (unplayedPool.length === 0) {
    unplayedPool = pool;
  }

  const selectedVideo =
    unplayedPool[Math.floor(Math.random() * unplayedPool.length)];
  const selectedUrl = getUrl(selectedVideo);

  return {
    url: selectedUrl,
  };
}

async function handleSkipAndPlayNext() {
  const tab = await findTikTokTab();
  if (!tab) {
    const result = await selectRandomVideo();
    if (result) {
      const nextUrl = getUrl(result.video);
      await chrome.tabs.create({ url: nextUrl, active: true });
      return {
        success: true,
        count: result.totalCount,
        unplayedCount: result.unplayedCount,
        status: "playing",
      };
    }
    return {
      success: false,
      status: "no_videos",
      message: "Không tìm thấy tab TikTok và danh sách video trống.",
    };
  }

  const currentUrl = tab.url.split("?")[0];
  const data = await chrome.storage.local.get(["likedVideos"]);
  const videos = data.likedVideos || [];

  const filtered = videos.filter((v) => getUrl(v).split("?")[0] !== currentUrl);
  await chrome.storage.local.set({ likedVideos: filtered });

  if (filtered.length > 0) {
    const result = await selectRandomVideo(currentUrl);
    if (result) {
      await randomDelay(800, 2000);
      const nextUrl = getUrl(result.video);
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "navigateToVideo",
          url: nextUrl,
        });
      } catch (e) {
        await chrome.tabs.update(tab.id, { url: nextUrl });
      }
      await logTabUpdated(tab.id, nextUrl);
      return {
        success: true,
        count: result.totalCount,
        unplayedCount: result.unplayedCount,
        status: "playing",
      };
    }
  }
  return {
    success: false,
    status: "no_videos",
    message: "Danh sách video đã trống.",
  };
}

async function handleBanAndPlayNext() {
  const tab = await findTikTokTab();
  if (!tab) {
    const result = await selectRandomVideo();
    if (result) {
      const nextUrl = getUrl(result.video);
      await chrome.tabs.create({ url: nextUrl, active: true });
      return {
        success: true,
        count: result.totalCount,
        unplayedCount: result.unplayedCount,
        status: "playing",
      };
    }
    return {
      success: false,
      status: "no_videos",
      message: "Không tìm thấy tab TikTok và danh sách video trống.",
    };
  }

  const rawUrl = tab.url || "";
  const currentUrl = rawUrl.split("?")[0];
  const data = await chrome.storage.local.get([
    "likedVideos",
    "blacklistedVideos",
  ]);
  let videos = data.likedVideos || [];
  let blacklist = data.blacklistedVideos || [];

  if (currentUrl.includes("/video/")) {
    videos = videos.filter((v) => getUrl(v).split("?")[0] !== currentUrl);
    if (!blacklist.includes(currentUrl)) {
      blacklist.push(currentUrl);
    }
    await chrome.storage.local.set({
      likedVideos: videos,
      blacklistedVideos: blacklist,
    });
    console.log(
      `[BG] Banned video: ${currentUrl}. Total banned: ${blacklist.length}`,
    );
  }

  if (videos.length > 0) {
    const result = await selectRandomVideo(currentUrl);
    if (result) {
      await randomDelay(500, 1500);
      const nextUrl = getUrl(result.video);
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: "navigateToVideo",
          url: nextUrl,
        });
      } catch (e) {
        await chrome.tabs.update(tab.id, { url: nextUrl });
      }
      await logTabUpdated(tab.id, nextUrl);
      return {
        success: true,
        count: result.totalCount,
        unplayedCount: result.unplayedCount,
        status: "playing",
      };
    }
  }
  return {
    success: false,
    status: "no_videos",
    message: "Danh sách video đã trống sau khi cấm.",
  };
}

async function handleRandomLiked(limit = 100, username = "") {
  const data = await chrome.storage.local.get(["likedVideos"]);
  const videos = data.likedVideos || [];

  if (videos.length > 0) {
    const result = await selectRandomVideo();
    if (result) {
      const randomUrl = getUrl(result.video);
      await getOrCreateTikTokTab(randomUrl);
      return {
        success: true,
        count: result.totalCount,
        unplayedCount: result.unplayedCount,
        status: "playing",
      };
    }
  }

  const handle = username.startsWith("@") ? username : "@" + username;
  const profileUrl = "https://www.tiktok.com/" + handle;

  const tab = await getOrCreateTikTokTab(profileUrl);
  startCollectionJob(tab.id, limit, username, false, true);

  return { success: true, status: "navigating" };
}

async function handleCollectAndPlay(tabId) {
  const data = await chrome.storage.local.get(["likedVideos"]);
  const videos = data.likedVideos || [];

  if (videos.length > 0) {
    const result = await selectRandomVideo();
    if (result) {
      const randomUrl = getUrl(result.video);
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: "navigateToVideo",
          url: randomUrl,
        });
      } catch (e) {
        await chrome.tabs.update(tabId, { url: randomUrl });
      }
      await logTabUpdated(tabId, randomUrl);
      return { success: true, count: result.totalCount };
    }
  }
  return { success: false, message: "Không tìm thấy video nào" };
}

async function handlePlayNext(tabId) {
  const data = await chrome.storage.local.get([
    "likedVideos",
    "autoNextEnabled",
  ]);

  if (data.autoNextEnabled === false) {
    return { success: false, reason: "disabled" };
  }

  const videos = data.likedVideos || [];
  if (videos.length === 0) {
    return { success: false, reason: "no_videos" };
  }

  let currentUrl = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    currentUrl = tab.url.split("?")[0];
  } catch (e) {}

  const result = await selectRandomVideo(currentUrl);
  if (result) {
    await randomDelay(1500, 3500);
    const nextUrl = getUrl(result.video);
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "navigateToVideo",
        url: nextUrl,
      });
    } catch (e) {
      await chrome.tabs.update(tabId, { url: nextUrl });
    }
    await logTabUpdated(tabId, nextUrl);
    return { success: true };
  }
  return { success: false, reason: "select_failed" };
}

async function notifyContentScriptAutoNext(enabled) {
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.tiktok.com/*" });
    for (const tab of tabs) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "setAutoNext",
          enabled: enabled,
        })
        .catch(() => {});
    }
  } catch (e) {}
}
