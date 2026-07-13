// Coordinating service worker for the extension

const MAX_AGE = 3 * 24 * 60 * 60 * 1000; // Cache expiration time

// Random delay to mimic human behavior and avoid rate limiting
function randomDelay(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
}

let progressState = {
    isCollecting: false,
    scrollCount: 0,
    maxScrolls: 0,
    count: 0,
    status: "idle"
};

// Global job tracking for page loading monitoring
let activeCollectionJob = null;

function startCollectionJob(tabId, limit, username, appendMode, autoPlay) {
    if (activeCollectionJob) {
        clearTimeout(activeCollectionJob.timeoutId);
        clearInterval(activeCollectionJob.checkIntervalId);
    }

    activeCollectionJob = {
        tabId: tabId,
        limit: limit,
        username: username,
        appendMode: appendMode,
        autoPlay: autoPlay,
        attempts: 0
    };

    runJobCycle();
}

function runJobCycle() {
    if (!activeCollectionJob) return;
    const job = activeCollectionJob;
    job.attempts++;

    console.log(`[BG] Collection job cycle: Attempt #${job.attempts}`);

    // Set a maximum timeout of 20 seconds for the entire loading + injection phase
    job.timeoutId = setTimeout(() => {
        if (activeCollectionJob === job) {
            console.warn("[BG] Collection job timed out (took too long). Reloading tab and retrying...");
            chrome.tabs.reload(job.tabId, {}, () => {
                setTimeout(runJobCycle, 2000);
            });
        }
    }, 20000);

    // Periodically check tab title, URL and try to ping the content script
    let pingAttempts = 0;
    job.checkIntervalId = setInterval(() => {
        if (activeCollectionJob !== job) {
            clearInterval(job.checkIntervalId);
            return;
        }

        chrome.tabs.get(job.tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.warn("[BG] Tab not found or closed. Canceling collection job.");
                clearInterval(job.checkIntervalId);
                clearTimeout(job.timeoutId);
                if (activeCollectionJob === job) activeCollectionJob = null;
                return;
            }

            // Detect 403 or Access Denied in tab title
            const title = (tab.title || "").toLowerCase();
            if (title.includes("403") || title.includes("access denied") || title.includes("forbidden") || title.includes("error")) {
                console.warn(`[BG] Detected block/error page: "${tab.title}". Reloading tab in 5 seconds...`);
                clearInterval(job.checkIntervalId);
                clearTimeout(job.timeoutId);

                setTimeout(() => {
                    if (activeCollectionJob === job) {
                        chrome.tabs.reload(job.tabId, {}, () => {
                            setTimeout(runJobCycle, 2000);
                        });
                    }
                }, 5000);
                return;
            }

            // Try to ping content script
            chrome.tabs.sendMessage(job.tabId, { action: "ping" }, (response) => {
                if (chrome.runtime.lastError || !response || !response.alive) {
                    pingAttempts++;
                    console.log(`[BG] Ping content script failed (attempt ${pingAttempts})`);
                    return;
                }

                // Content script is alive! Stop timers and send the collection command
                console.log("[BG] Content script is alive. Sending clickLikedTabAndCollect message.");
                clearInterval(job.checkIntervalId);
                clearTimeout(job.timeoutId);
                activeCollectionJob = null;

                chrome.tabs.sendMessage(job.tabId, {
                    action: "clickLikedTabAndCollect",
                    append: job.appendMode,
                    autoPlay: job.autoPlay,
                    limit: job.limit
                }).catch(() => { });
            });
        });
    }, 2000);
}

// Helper: Extract clean URL from item object or string
function getUrl(item) {
    if (!item) return "";
    return typeof item === "string" ? item : (item.url || "");
}

// Helper: Find or open a TikTok tab, focus it, and direct it to targetUrl
async function getOrCreateTikTokTab(targetUrl) {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let tab = activeTabs[0];
    if (tab && tab.url && tab.url.includes("tiktok.com")) {
        if (targetUrl) {
            await chrome.tabs.update(tab.id, { url: targetUrl });
        }
        return tab;
    }

    const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*", lastFocusedWindow: true });
    if (allTikTokTabs.length > 0) {
        const targetTab = allTikTokTabs[0];
        await chrome.tabs.update(targetTab.id, { active: true });
        if (targetUrl) {
            await chrome.tabs.update(targetTab.id, { url: targetUrl });
        }
        return targetTab;
    }

    return await chrome.tabs.create({ url: targetUrl || "https://www.tiktok.com", active: true });
}

// Helper: Locate any existing TikTok tab (prioritizes active tab)
async function findTikTokTab() {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let tab = activeTabs[0];
    if (tab && tab.url && tab.url.includes("tiktok.com")) {
        return tab;
    }
    const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
    if (allTikTokTabs.length > 0) {
        return allTikTokTabs[0];
    }
    return null;
}

// Helper: Select a random video excluding the current one without repeats
async function selectRandomVideo(excludeUrl = "") {
    const data = await chrome.storage.local.get(["likedVideos", "playedVideos"]);
    const videos = data.likedVideos || [];
    let played = data.playedVideos || [];

    if (videos.length === 0) return null;

    const targetExclude = excludeUrl.split("?")[0];
    let pool = videos.filter(v => getUrl(v).split("?")[0] !== targetExclude);
    if (pool.length === 0) pool = videos;

    const playedSet = new Set(played);
    let unplayedPool = pool.filter(v => !playedSet.has(getUrl(v).split("?")[0]));

    // Reset played list if all videos have been played
    if (unplayedPool.length === 0) {
        played = [];
        unplayedPool = pool;
    }

    const selectedVideo = unplayedPool[Math.floor(Math.random() * unplayedPool.length)];
    const selectedUrl = getUrl(selectedVideo);

    played.push(selectedUrl.split("?")[0]);
    await chrome.storage.local.set({ playedVideos: played });

    return {
        video: selectedVideo,
        unplayedCount: unplayedPool.length - 1,
        totalCount: videos.length
    };
}

// Check if tab is currently on the user's Liked profile page
function isOnLikedPage(tabUrl, username) {
    if (!tabUrl || !username) return false;
    const handle = username.startsWith("@") ? username : "@" + username;
    const profilePattern = "tiktok.com/" + handle;
    return tabUrl.includes(profilePattern);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "randomLiked":
            handleRandomLiked(request.limit, request.username).then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
            return true;

        case "collectMore":
            handleCollectMore(request.limit, request.username).then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
            return true;

        case "skipAndPlayNext":
            handleSkipAndPlayNext().then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
            return true;

        case "collectAndPlay":
            handleCollectAndPlay(sender.tab.id).then(sendResponse).catch(e => sendResponse({ success: false, message: e.message }));
            return true;

        case "playNext":
            handlePlayNext(sender.tab.id).then(sendResponse).catch(e => sendResponse({ success: false, message: e.message }));
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
                    newAddedCount: 0
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
            chrome.storage.local.get(["likedVideos"], (data) => {
                let existing = data.likedVideos || [];
                let incoming = request.videos || [];

                existing = existing.map(v => typeof v === 'string' ? { url: v, thumb: '' } : v);
                incoming = incoming.map(v => typeof v === 'string' ? { url: v, thumb: '' } : v);

                let merged = [];
                let newAddedCount = 0;

                if (request.append) {
                    const map = new Map();
                    existing.forEach(v => {
                        const url = getUrl(v);
                        if (url) map.set(url.split("?")[0], v);
                    });

                    incoming.forEach(v => {
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

                chrome.storage.local.set({
                    likedVideos: merged,
                    collectedAt: Date.now()
                }, () => {
                    console.log("[BG] Saved " + merged.length + " videos");
                    sendResponse({ success: true, count: merged.length });
                });
            });
            return true;

        case "getVideoCount":
            chrome.storage.local.get(["likedVideos"], (data) => {
                sendResponse({ count: (data.likedVideos || []).length });
            });
            return true;

        case "getVideoList":
            chrome.storage.local.get(["likedVideos"], (data) => {
                sendResponse({ videos: data.likedVideos || [] });
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

        case "clearCache":
            chrome.storage.local.remove(["likedVideos", "collectedAt", "playedVideos"], () => {
                progressState = { isCollecting: false, scrollCount: 0, maxScrolls: 0, count: 0, status: "idle" };
                sendResponse({ success: true });
            });
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

// Skip currently playing video, delete it from storage, and play next
async function handleSkipAndPlayNext() {
    const tab = await findTikTokTab();
    if (!tab) {
        const result = await selectRandomVideo();
        if (result) {
            const nextUrl = getUrl(result.video);
            await chrome.tabs.create({ url: nextUrl, active: true });
            return { success: true, count: result.totalCount, unplayedCount: result.unplayedCount, status: "playing" };
        }
        return { success: false, status: "no_videos", message: "Không tìm thấy tab TikTok và danh sách video trống." };
    }

    const currentUrl = tab.url.split("?")[0];
    const data = await chrome.storage.local.get(["likedVideos"]);
    const videos = data.likedVideos || [];

    const filtered = videos.filter(v => getUrl(v).split("?")[0] !== currentUrl);
    await chrome.storage.local.set({ likedVideos: filtered });

    if (filtered.length > 0) {
        const result = await selectRandomVideo(currentUrl);
        if (result) {
            // Brief delay before skip transition to appear natural
            await randomDelay(800, 2000);
            const nextUrl = getUrl(result.video);
            await chrome.tabs.update(tab.id, { url: nextUrl });
            return { success: true, count: result.totalCount, unplayedCount: result.unplayedCount, status: "playing" };
        }
    }
    return { success: false, status: "no_videos", message: "Danh sách video đã trống." };
}

// Randomly choose and play a video from the liked list
async function handleRandomLiked(limit = 100, username = "") {
    const data = await chrome.storage.local.get(["likedVideos", "collectedAt"]);
    const videos = data.likedVideos || [];
    const age = Date.now() - (data.collectedAt || 0);

    if (videos.length > 0 && age < MAX_AGE) {
        const result = await selectRandomVideo();
        if (result) {
            const randomUrl = getUrl(result.video);
            await getOrCreateTikTokTab(randomUrl);
            return { success: true, count: result.totalCount, unplayedCount: result.unplayedCount, status: "playing" };
        }
    }

    const handle = username.startsWith("@") ? username : "@" + username;
    const profileUrl = "https://www.tiktok.com/" + handle;

    const tab = await getOrCreateTikTokTab(profileUrl);

    // Monitor tab loading, error pages (403), and triggers collection automatically
    startCollectionJob(tab.id, limit, username, false, true);

    return { success: true, status: "navigating" };
}

// Collect more videos (append mode). If already on liked tab, scroll in place
async function handleCollectMore(limit = 100, username = "") {
    const handle = username.startsWith("@") ? username : "@" + username;
    const profileUrl = "https://www.tiktok.com/" + handle;

    const tab = await findTikTokTab();

    if (tab && isOnLikedPage(tab.url, username)) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "continueCollecting",
                append: true,
                autoPlay: false,
                limit: limit
            });
        } catch (e) {
            console.log("[BG] Error sending continueCollecting:", e.message);
        }
        return { success: true, status: "collecting_in_place" };
    }

    const targetTab = await getOrCreateTikTokTab(profileUrl);

    // Monitor tab loading, error pages (403), and triggers collection automatically
    startCollectionJob(targetTab.id, limit, username, true, false);

    return { success: true, status: "navigating" };
}

// Automation helper called after collection finishes
async function handleCollectAndPlay(tabId) {
    const data = await chrome.storage.local.get(["likedVideos"]);
    const videos = data.likedVideos || [];

    if (videos.length > 0) {
        const result = await selectRandomVideo();
        if (result) {
            const randomUrl = getUrl(result.video);
            await chrome.tabs.update(tabId, { url: randomUrl });
            return { success: true, count: result.totalCount };
        }
    }
    return { success: false, message: "Không tìm thấy video nào" };
}

// Auto-next: Play next video after a human-like random delay
async function handlePlayNext(tabId) {
    const data = await chrome.storage.local.get(["likedVideos", "autoNextEnabled"]);

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
    } catch (e) { }

    const result = await selectRandomVideo(currentUrl);
    if (result) {
        // Random delay 2-5s before navigating to avoid rate limiting
        await randomDelay(2000, 5000);
        const nextUrl = getUrl(result.video);
        await chrome.tabs.update(tabId, { url: nextUrl });
        return { success: true };
    }
    return { success: false, reason: "select_failed" };
}

// Send autoplay toggle events to all open TikTok tabs
async function notifyContentScriptAutoNext(enabled) {
    try {
        const tabs = await chrome.tabs.query({ url: "https://www.tiktok.com/*" });
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
                action: "setAutoNext",
                enabled: enabled
            }).catch(() => { });
        }
    } catch (e) { }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.remove(["likedVideos", "collectedAt", "playedVideos"]);
    chrome.storage.local.set({ autoNextEnabled: true });
    console.log("[BG] Extension installed/updated, cache cleared");
});

// Global keyboard shortcut triggers
chrome.commands.onCommand.addListener((command) => {
    if (command === "skip-and-delete") {
        handleSkipAndPlayNext().then((response) => {
            console.log("[BG] Shortcut result:", response);
        }).catch((err) => {
            console.error("[BG] Shortcut error:", err);
        });
    }
});
