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
            if (title.includes("403") || title.includes("denied") || title.includes("forbidden")) {
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

let tabNavTimestamps = {};

async function logTabUpdated(tabId, targetUrl) {
    if (tabId) tabNavTimestamps[tabId] = Date.now();
    try {
        const tab = await chrome.tabs.get(tabId);
        console.log(`[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=${tab ? tab.active : "N/A"} | targetURL=${targetUrl || (tab ? tab.url : "N/A")}`);
    } catch (e) {
        console.log(`[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=N/A | targetURL=${targetUrl || "N/A"}`);
    }
}

// Helper: Find or open a TikTok tab, focus it, and direct it to targetUrl
async function getOrCreateTikTokTab(targetUrl) {
    // Search ALL windows (not just lastFocusedWindow) so popup opening doesn't hide TikTok tabs
    const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });

    // Prefer the already-active tab if it's TikTok
    const activeTabs = await chrome.tabs.query({ active: true });
    const activeTikTok = activeTabs.find(t => t.url && t.url.includes("tiktok.com"));
    if (activeTikTok) {
        if (targetUrl) {
            await chrome.tabs.update(activeTikTok.id, { url: targetUrl, active: true });
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

    return await chrome.tabs.create({ url: targetUrl || "https://www.tiktok.com", active: true });
}

// Helper: Locate any existing TikTok tab (prioritizes active tab across all windows)
async function findTikTokTab() {
    // Check active tabs across all windows first
    const activeTabs = await chrome.tabs.query({ active: true });
    const activeTikTok = activeTabs.find(t => t.url && t.url.includes("tiktok.com"));
    if (activeTikTok) return activeTikTok;

    // Fall back to any TikTok tab in any window
    const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
    if (allTikTokTabs.length > 0) {
        return allTikTokTabs[0];
    }
    return null;
}

// Helper: Select a random video excluding the current one without repeats
async function selectRandomVideo(excludeUrl = "") {
    const data = await chrome.storage.local.get(["likedVideos", "playedVideos", "blacklistedVideos"]);
    const videos = data.likedVideos || [];
    let played = data.playedVideos || [];
    const blacklist = new Set(data.blacklistedVideos || []);

    const validVideos = videos.filter(v => !blacklist.has(getUrl(v).split("?")[0]));

    if (validVideos.length === 0) return null;

    const targetExclude = excludeUrl.split("?")[0];
    let pool = validVideos.filter(v => getUrl(v).split("?")[0] !== targetExclude);
    if (pool.length === 0) pool = validVideos;

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
        totalCount: validVideos.length
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

        case "handle403Detected":
            console.warn("[BG] 403 / Blank page message received! Auto-triggering randomLiked...");
            chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
                const limit = data.targetLimit || 100;
                const username = data.tiktokUsername || "";
                handleRandomLiked(limit, username).then(sendResponse).catch(e => sendResponse({ success: false, message: e.message }));
            });
            return true;

        case "collectMore":
            handleCollectMore(request.limit, request.username).then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
            return true;

        case "skipAndPlayNext":
            handleSkipAndPlayNext().then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
            return true;

        case "banAndPlayNext":
            handleBanAndPlayNext().then(sendResponse).catch(e => sendResponse({ success: false, status: "error", message: e.message }));
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
            chrome.storage.local.get(["likedVideos", "blacklistedVideos"], (data) => {
                let existing = data.likedVideos || [];
                let incoming = request.videos || [];
                const blacklist = new Set(data.blacklistedVideos || []);

                existing = existing.map(v => typeof v === 'string' ? { url: v, thumb: '' } : v).filter(v => !blacklist.has(getUrl(v).split("?")[0]));
                incoming = incoming.map(v => typeof v === 'string' ? { url: v, thumb: '' } : v).filter(v => !blacklist.has(getUrl(v).split("?")[0]));

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
                    console.log("[BG] Saved " + merged.length + " videos (filtered blacklist)");
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
            chrome.storage.local.get(["likedVideos", "blacklistedVideos"], (data) => {
                sendResponse({
                    videos: data.likedVideos || [],
                    blacklistedCount: (data.blacklistedVideos || []).length
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
                    chrome.storage.local.set({ likedVideos: videos, blacklistedVideos: blacklist }, () => {
                        sendResponse({ success: true, count: videos.length, blacklistedCount: blacklist.length });
                    });
                } else {
                    sendResponse({ success: false, message: "Index không hợp lệ" });
                }
            });
            return true;

        case "exportData":
            chrome.storage.local.get(["likedVideos", "blacklistedVideos", "collectedAt", "tiktokUsername", "targetLimit"], (data) => {
                sendResponse({
                    version: "3.1",
                    exportAt: Date.now(),
                    collectedAt: data.collectedAt || null,
                    tiktokUsername: data.tiktokUsername || "",
                    targetLimit: data.targetLimit || 100,
                    videoCount: (data.likedVideos || []).length,
                    blacklistedCount: (data.blacklistedVideos || []).length,
                    likedVideos: data.likedVideos || [],
                    blacklistedVideos: data.blacklistedVideos || []
                });
            });
            return true;

        case "importData":
            try {
                const payload = request.data || {};
                if (!Array.isArray(payload.likedVideos)) {
                    sendResponse({ success: false, message: "File backup không hợp lệ (thiếu likedVideos)" });
                    return true;
                }
                const newLiked = payload.likedVideos;
                const newBlacklist = Array.isArray(payload.blacklistedVideos) ? payload.blacklistedVideos : [];
                const collectedAt = payload.collectedAt || Date.now();
                const username = payload.tiktokUsername || "";
                const limit = payload.targetLimit || 100;

                chrome.storage.local.set({
                    likedVideos: newLiked,
                    blacklistedVideos: newBlacklist,
                    collectedAt: collectedAt,
                    tiktokUsername: username,
                    targetLimit: limit
                }, () => {
                    progressState = { isCollecting: false, scrollCount: 0, maxScrolls: 0, count: newLiked.length, status: "complete" };
                    sendResponse({
                        success: true,
                        count: newLiked.length,
                        blacklistedCount: newBlacklist.length
                    });
                });
            } catch (e) {
                sendResponse({ success: false, message: e.message });
            }
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
            await randomDelay(2000, 4000);
            const nextUrl = getUrl(result.video);
            // SPA navigation to preserve session & Akamai tokens
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "navigateToVideo", url: nextUrl });
            } catch (e) {
                await chrome.tabs.update(tab.id, { url: nextUrl });
            }
            await logTabUpdated(tab.id, nextUrl);
            return { success: true, count: result.totalCount, unplayedCount: result.unplayedCount, status: "playing" };
        }
    }
    return { success: false, status: "no_videos", message: "Danh sách video đã trống." };
}

// Ban currently playing video (add to blacklist), delete it from storage, and play next
async function handleBanAndPlayNext() {
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

    const rawUrl = tab.url || "";
    const currentUrl = rawUrl.split("?")[0];
    const data = await chrome.storage.local.get(["likedVideos", "blacklistedVideos"]);
    let videos = data.likedVideos || [];
    let blacklist = data.blacklistedVideos || [];

    if (currentUrl.includes("/video/")) {
        videos = videos.filter(v => getUrl(v).split("?")[0] !== currentUrl);
        if (!blacklist.includes(currentUrl)) {
            blacklist.push(currentUrl);
        }
        await chrome.storage.local.set({
            likedVideos: videos,
            blacklistedVideos: blacklist
        });
        console.log(`[BG] Banned video: ${currentUrl}. Total banned: ${blacklist.length}`);
    }

    if (videos.length > 0) {
        const result = await selectRandomVideo(currentUrl);
        if (result) {
            await randomDelay(1000, 3000);
            const nextUrl = getUrl(result.video);
            // SPA navigation to preserve session & Akamai tokens
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "navigateToVideo", url: nextUrl });
            } catch (e) {
                await chrome.tabs.update(tab.id, { url: nextUrl });
            }
            await logTabUpdated(tab.id, nextUrl);
            return { success: true, count: result.totalCount, unplayedCount: result.unplayedCount, status: "playing" };
        }
    }
    return { success: false, status: "no_videos", message: "Danh sách video đã trống sau khi cấm." };
}

// Randomly choose and play a video from the liked list
async function handleRandomLiked(limit = 100, username = "") {
    const data = await chrome.storage.local.get(["likedVideos"]);
    const videos = data.likedVideos || [];

    if (videos.length > 0) {
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
            // SPA navigation to preserve session & Akamai tokens
            try {
                await chrome.tabs.sendMessage(tabId, { action: "navigateToVideo", url: randomUrl });
            } catch (e) {
                await chrome.tabs.update(tabId, { url: randomUrl });
            }
            await logTabUpdated(tabId, randomUrl);
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
        // Random delay 4-9s before navigating to avoid rate limiting
        await randomDelay(4000, 9000);
        const nextUrl = getUrl(result.video);
        // SPA navigation to preserve session & Akamai tokens
        try {
            await chrome.tabs.sendMessage(tabId, { action: "navigateToVideo", url: nextUrl });
        } catch (e) {
            await chrome.tabs.update(tabId, { url: nextUrl });
        }
        await logTabUpdated(tabId, nextUrl);
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

// Helper: Check if tab title or URL indicates 403 / Access Denied / Chrome Error page
function is403OrErrorTab(tab) {
    if (!tab) return false;
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();

    // Check title keywords (covers "Access to www.tiktok.com was denied", "HTTP ERROR 403", etc.)
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

    // Check Chrome/Edge error page URL
    if (url.includes("chrome-error") || url.includes("edge-error")) {
        return true;
    }

    return false;
}

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

// Auto-recover when TikTok tab encounters 403, Access Denied, Forbidden or blank page
let last403TriggerTime = 0;
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId && changeInfo.url) {
        tabNavTimestamps[tabId] = Date.now();
    }
    if (tab && tab.url && (tab.url.includes("tiktok.com") || tab.url.includes("chrome-error") || tab.url.includes("edge-error"))) {
        if (is403OrErrorTab(tab)) {
            const now = Date.now();
            if (now - last403TriggerTime > 3000) { // Throttling 3s
                last403TriggerTime = now;
                console.warn(`[BG] Detected 403/Access Denied/Error tab (title: "${tab.title}", url: "${tab.url}"). Auto-triggering randomLiked...`);
                setTimeout(() => {
                    chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
                        handleRandomLiked(data.targetLimit || 100, data.tiktokUsername || "");
                    });
                }, 1000);
            }
        }
    }
});

// Watchdog interval: Periodically check if active TikTok tab is stuck on 403 / Access Denied error page
setInterval(async () => {
    try {
        const tab = await findTikTokTab();
        if (!tab || !tab.url) return;

        const now = Date.now();

        // 1. Explicit title or URL keyword match
        if (is403OrErrorTab(tab)) {
            if (now - last403TriggerTime > 3000) {
                last403TriggerTime = now;
                console.warn(`[BG Watchdog] Active TikTok tab is in 403/Error state ("${tab.title}"). Auto-switching to next random video...`);
                chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
                    handleRandomLiked(data.targetLimit || 100, data.tiktokUsername || "");
                });
            }
            return;
        }

        // 2. Ping check for /video/ pages where Edge/Chrome rendered native error page (content script blocked)
        if (tab.url.includes("/video/")) {
            const navTime = tabNavTimestamps[tab.id] || 0;
            const elapsed = now - navTime;

            // Check ping if tab has been on video URL for more than 3 seconds
            if (elapsed > 3000) {
                chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.alive) {
                        if (now - last403TriggerTime > 3000) {
                            last403TriggerTime = now;
                            console.warn(`[BG Watchdog] Video tab ping failed after ${elapsed}ms ("${tab.url}"). Tab is stuck on 403/chrome-error. Auto-skipping...`);
                            chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
                                handleRandomLiked(data.targetLimit || 100, data.tiktokUsername || "");
                            });
                        }
                    }
                });
            }
        }
    } catch (e) { }
}, 3000);
