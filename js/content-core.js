let observer = null;
let existingUrls = new Set();
let checkpointTimer = null;
let lastCheckpointCount = 0;

// MutationObserver for lazy-loaded thumbnails & DOM node tracking
function startObserving(appendMode) {
    if (observer) observer.disconnect();

    observer = new MutationObserver(function (mutations) {
        let hasNewNodes = false;
        for (let i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length > 0) {
                hasNewNodes = true;
                break;
            }
        }
        if (hasNewNodes) {
            collectVideoUrls();
            sendVideosToBackground(appendMode);
            if (videoWatcherActive) {
                watchForVideoElement();
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// DOM Clean-up / Node Pruning: Removes old DOM cards beyond 200 items to prevent RAM bloat
function performDomCleanup() {
    try {
        const likedContainer = document.querySelector(TK_SELECTORS.LIKED_CONTAINER);
        if (!likedContainer) return;

        const items = Array.from(likedContainer.querySelectorAll(TK_SELECTORS.LIKED_ITEM));
        if (items.length > 200) {
            // Keep the most recent 150 items; prune the older items above
            const removeCount = items.length - 150;
            for (let i = 0; i < removeCount; i++) {
                const item = items[i];
                // Ensure URL & Thumbnail are captured before removing
                const a = item.querySelector(TK_SELECTORS.VIDEO_LINK);
                if (a) {
                    const url = a.href.split("?")[0];
                    if (url) {
                        const img = item.querySelector("img");
                        const thumb = extractImgUrl(img);
                        if (!collectedMap.has(url)) {
                            collectedMap.set(url, thumb);
                        } else if (thumb && !collectedMap.get(url)) {
                            collectedMap.set(url, thumb);
                        }
                    }
                }
                item.remove();
                prunedNodeCount++;
            }
            console.log("[CS] 🧹 DOM Cleanup: Removed " + removeCount + " old cards (Total pruned: " + prunedNodeCount + ")");
        }
    } catch (e) { }
}

// Checkpoint Auto-Save helper: Saves progress to background storage
function saveCheckpointData(appendMode) {
    const videosArray = [];
    collectedMap.forEach(function (thumb, url) {
        videosArray.push({ url: url, thumb: thumb });
    });

    try {
        chrome.runtime.sendMessage({
            action: "saveCheckpoint",
            checkpoint: {
                timestamp: Date.now(),
                count: collectedMap.size,
                videos: videosArray,
                append: appendMode || false
            }
        }, function () {
            if (chrome.runtime.lastError) { }
        });
    } catch (e) { }
}

// Auto-scroll engine with Dual-Mode, Adaptive/Progressive Delays, DOM Cleanup & Checkpoints
function autoScroll(targetLimit, baseInterval, existingUrlsSet, smartStopMode) {
    targetLimit = targetLimit || 100;
    baseInterval = baseInterval || 1000;
    existingUrlsSet = existingUrlsSet || new Set();
    smartStopMode = smartStopMode || false;

    const maxScrolls = Math.ceil(targetLimit / 10) + 15;

    return new Promise(function (resolve) {
        let scrollCount = 0;
        let lastCount = 0;
        let noNewCount = 0;
        let sameHeightCount = 0;
        let lastScrollHeight = 0;
        let consecutiveExistingCount = 0;
        let itemsSinceLastRest = 0;
        lastCheckpointCount = collectedMap.size;

        const scrollContainer = findScrollContainer();

        // Start Checkpoint timer (every 10 seconds)
        if (checkpointTimer) clearInterval(checkpointTimer);
        checkpointTimer = setInterval(function () {
            if (isCollecting && collectedMap.size > lastCheckpointCount) {
                saveCheckpointData(true);
                lastCheckpointCount = collectedMap.size;
            }
        }, 10000);

        async function scrollStep() {
            if (!isCollecting) {
                if (checkpointTimer) clearInterval(checkpointTimer);
                resolve(collectedMap.size);
                return;
            }

            collectVideoUrls();

            // 1. Smart Stop check (Quick Update mode only)
            if (smartStopMode) {
                const visibleUrls = getVisibleUrls();
                let foundExistingInBatch = 0;
                visibleUrls.forEach(function (url) {
                    if (existingUrlsSet.has(url)) {
                        foundExistingInBatch++;
                    }
                });

                if (foundExistingInBatch > 0) {
                    consecutiveExistingCount += foundExistingInBatch;
                } else {
                    consecutiveExistingCount = 0;
                }

                if (consecutiveExistingCount >= 3) {
                    console.log("[CS] ⚡ Smart Stop: Detected 3 consecutive existing videos → Finishing Quick Update!");
                    if (checkpointTimer) clearInterval(checkpointTimer);
                    resolve(collectedMap.size);
                    return;
                }
            }

            // 2. Status Reporting & Adaptive Delay calculation
            let currentStatus = "collecting";

            // If missing thumbnails > 5, flag slow network & increase delay
            let extraDelay = 0;
            if (missingThumbQueue.size > 5) {
                currentStatus = "slow_network";
                extraDelay += 600;
            }

            // Progressive Delay based on scroll depth
            const totalCollected = collectedMap.size;
            if (totalCollected > 2500) {
                extraDelay += 1500;
            } else if (totalCollected > 1500) {
                extraDelay += 800;
            } else if (totalCollected > 800) {
                extraDelay += 400;
            }

            const newCollectedCount = collectedMap.size - existingUrlsSet.size;
            try {
                chrome.runtime.sendMessage({
                    action: "collectionProgress",
                    isCollecting: true,
                    scrollCount: scrollCount + 1,
                    maxScrolls: maxScrolls,
                    count: collectedMap.size,
                    newCount: newCollectedCount,
                    limit: targetLimit,
                    status: currentStatus,
                    missingThumbs: missingThumbQueue.size
                }, function () { if (chrome.runtime.lastError) { } });
            } catch (e) { }

            // Auto-save Checkpoint every 30 newly collected items
            if (newCollectedCount - lastCheckpointCount >= 30) {
                saveCheckpointData(true);
                lastCheckpointCount = newCollectedCount;
            }

            // 4. Termination conditions
            if (newCollectedCount >= targetLimit || scrollCount >= maxScrolls || noNewCount >= 4) {
                if (checkpointTimer) clearInterval(checkpointTimer);
                resolve(collectedMap.size);
                return;
            }

            // 5. Perform DOM Node Pruning (Clean-up)
            performDomCleanup();

            // 6. Scroll execution
            let containerHeight = 0;
            if (scrollContainer) {
                scrollContainer.scrollBy(0, 1100);
                containerHeight = scrollContainer.scrollHeight;
            } else {
                window.scrollBy(0, 1100);
                containerHeight = document.documentElement.scrollHeight;
            }

            if (containerHeight === lastScrollHeight) {
                sameHeightCount++;
            } else {
                sameHeightCount = 0;
            }
            lastScrollHeight = containerHeight;

            if (sameHeightCount >= 5) {
                if (checkpointTimer) clearInterval(checkpointTimer);
                resolve(collectedMap.size);
                return;
            }

            scrollCount++;
            itemsSinceLastRest++;

            if (collectedMap.size === lastCount) {
                noNewCount++;
            } else {
                noNewCount = 0;
            }
            lastCount = collectedMap.size;

            // 7. DOM Rest: Cool down CPU every 80-120 items
            let nextDelay = baseInterval + extraDelay + Math.floor(Math.random() * 250);
            if (itemsSinceLastRest >= 100) {
                itemsSinceLastRest = 0;
                nextDelay += 2500; // Pause 2.5s for Garbage Collection
                console.log("[CS] 🧊 DOM Rest: Pausing 2.5s to let CPU & RAM cool down...");
            }

            setTimeout(scrollStep, nextDelay);
        }

        scrollStep();
    });
}

// Final Sweep: Light scroll up + wait 2s + re-scan missingThumbQueue
async function performFinalSweep() {
    console.log("[CS] 🧹 Starting Final Sweep to capture trailing thumbnails...");
    try {
        const scrollContainer = findScrollContainer();
        if (scrollContainer) {
            scrollContainer.scrollBy(0, -300);
        } else {
            window.scrollBy(0, -300);
        }
    } catch (e) { }

    await new Promise(r => setTimeout(r, 2000));
    collectVideoUrls();
    console.log("[CS] ✅ Final Sweep complete. Remaining missing thumbnails:", missingThumbQueue.size);
}

// Click the "Liked" tab on a TikTok profile page
function clickLikedTab(callback) {
    var tabEl = null;

    var primarySelectors = [TK_SELECTORS.LIKED_TAB, TK_SELECTORS.USER_LIKED_TAB];
    for (var i = 0; i < primarySelectors.length; i++) {
        tabEl = document.querySelector(primarySelectors[i]);
        if (tabEl) break;
    }

    if (!tabEl) {
        var fallbackSelector = TK_SELECTORS.TAB_ROLE + ", " +
            TK_SELECTORS.TAB_ATTR + ", " +
            TK_SELECTORS.TAB_SPAN_CLASS + ", span";
        var allTabs = document.querySelectorAll(fallbackSelector);
        for (var j = 0; j < allTabs.length; j++) {
            var text = allTabs[j].textContent.trim();
            if (LIKED_TAB_LABELS.indexOf(text) !== -1 || text.toLowerCase() === "liked") {
                tabEl = allTabs[j];
                break;
            }
        }
    }

    if (tabEl) {
        tabEl.click();
        setTimeout(function () {
            if (callback) callback(true);
        }, 2000);
    } else {
        if (callback) callback(false);
    }
}

function isOnLikedTab() {
    return !!document.querySelector(TK_SELECTORS.LIKED_CONTAINER) ||
        document.querySelectorAll(TK_SELECTORS.LIKED_ITEM).length > 0;
}

// Main collection workflow with Dual-Mode, Checkpoints & Final Sweep
function startCollection(autoPlay, appendMode, targetLimit, continueFromCurrent, smartStopMode) {
    if (isCollecting) return;
    isCollecting = true;

    targetLimit = targetLimit || 100;
    continueFromCurrent = continueFromCurrent || false;
    smartStopMode = smartStopMode || false;
    isDeepAppend = !smartStopMode && appendMode;

    const maxScrolls = Math.ceil(targetLimit / 10) + 15;

    try {
        chrome.runtime.sendMessage({
            action: "collectionProgress",
            isCollecting: true,
            scrollCount: 0,
            maxScrolls: maxScrolls,
            count: collectedMap.size,
            newCount: 0,
            limit: targetLimit,
            status: "idle"
        }, function () { if (chrome.runtime.lastError) { } });
    } catch (e) { }

    if (!continueFromCurrent) {
        existingUrls.clear();
    }

    const proceed = function () {
        chrome.storage.local.get(["blacklistedVideos"], function (bData) {
            if (bData && bData.blacklistedVideos) {
                blacklistedSet = new Set(bData.blacklistedVideos);
            }
            collectVideoUrls();
            startObserving(appendMode);

            autoScroll(targetLimit, 1000, existingUrls, smartStopMode).then(async function () {
                // Final Sweep before completion
                await performFinalSweep();

                sendVideosToBackground(appendMode);

                // Clear checkpoint upon successful completion
                try {
                    chrome.runtime.sendMessage({ action: "clearCheckpoint" });
                } catch (e) { }

                const newCollectedCount = collectedMap.size - existingUrls.size;

                try {
                    chrome.runtime.sendMessage({
                        action: "collectionProgress",
                        isCollecting: false,
                        scrollCount: maxScrolls,
                        maxScrolls: maxScrolls,
                        count: collectedMap.size,
                        newCount: newCollectedCount,
                        limit: targetLimit,
                        status: "complete"
                    }, function () { if (chrome.runtime.lastError) { } });
                } catch (e) { }

                isCollecting = false;

                if (autoPlay && collectedMap.size > 0) {
                    setTimeout(function () {
                        try {
                            chrome.runtime.sendMessage({ action: "collectAndPlay" }, function () {
                                if (chrome.runtime.lastError) { }
                            });
                        } catch (e) { }
                    }, 500);
                }
            });
        });
    };

    if (continueFromCurrent) {
        chrome.storage.local.get(["likedVideos"], function (data) {
            const existing = data.likedVideos || [];
            existingUrls.clear();
            existing.forEach(function (v) {
                const url = typeof v === "string" ? v : (v ? v.url : "");
                const thumb = typeof v === "string" ? "" : (v ? v.thumb : "");
                if (url) {
                    if (!collectedMap.has(url)) {
                        collectedMap.set(url, thumb);
                    }
                    existingUrls.add(url.split("?")[0]);
                }
            });
            collectedMap.forEach(function (thumb, url) {
                existingUrls.add(url.split("?")[0]);
            });
            proceed();
        });
    } else if (appendMode) {
        chrome.storage.local.get(["likedVideos"], function (data) {
            const existing = data.likedVideos || [];
            existing.forEach(function (v) {
                const url = typeof v === "string" ? v : (v ? v.url : "");
                const thumb = typeof v === "string" ? "" : (v ? v.thumb : "");
                if (url) {
                    collectedMap.set(url, thumb);
                    existingUrls.add(url.split("?")[0]);
                }
            });
            proceed();
        });
    } else {
        collectedMap.clear();
        proceed();
    }
}
