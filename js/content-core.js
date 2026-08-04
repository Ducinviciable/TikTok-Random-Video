// Core collection logic: auto-scroll, mutation observer, tab click, startCollection

let observer = null;
let existingUrls = new Set();

// MutationObserver for lazy-loaded thumbnails during collection
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

// Auto-scroll the page to trigger TikTok's lazy loading
function autoScroll(targetLimit, interval, existingUrlsSet) {
    targetLimit = targetLimit || 100;
    interval = interval || 1000;
    existingUrlsSet = existingUrlsSet || new Set();

    const maxScrolls = Math.ceil(targetLimit / 12) + 5;

    return new Promise(function (resolve) {
        let scrollCount = 0;
        let lastCount = 0;
        let noNewCount = 0;
        let sameHeightCount = 0;
        let lastScrollHeight = 0;
        let isCatchingUp = existingUrlsSet.size > 0;
        const scrollContainer = findScrollContainer();

        const timer = setInterval(function () {
            collectVideoUrls();

            let hasNewVideo = true;
            if (isCatchingUp) {
                const visibleUrls = getVisibleUrls();
                hasNewVideo = visibleUrls.some(function (url) {
                    return !existingUrlsSet.has(url);
                });

                if (!hasNewVideo) {
                    try {
                        chrome.runtime.sendMessage({
                            action: "collectionProgress",
                            isCollecting: true,
                            scrollCount: 0,
                            maxScrolls: maxScrolls,
                            count: collectedMap.size,
                            newCount: 0,
                            limit: targetLimit,
                            status: "catchup"
                        }, function () { if (chrome.runtime.lastError) { } });
                    } catch (e) { }
                } else {
                    isCatchingUp = false;
                }
            }

            if (!isCatchingUp) {
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
                        status: "collecting"
                    }, function () {
                        if (chrome.runtime.lastError) { }
                    });
                } catch (e) { }
            }

            // Stop if limit reached, max scrolls hit, or no new videos 3x
            if (!isCatchingUp) {
                const newCollectedCount = collectedMap.size - existingUrlsSet.size;
                if (newCollectedCount >= targetLimit || scrollCount >= maxScrolls || noNewCount >= 3) {
                    clearInterval(timer);
                    resolve(collectedMap.size);
                    return;
                }
            }

            let containerHeight = 0;
            if (scrollContainer) {
                scrollContainer.scrollBy(0, 1200);
                containerHeight = scrollContainer.scrollHeight;
            } else {
                window.scrollBy(0, 1200);
                containerHeight = document.documentElement.scrollHeight;
            }

            if (containerHeight === lastScrollHeight) {
                sameHeightCount++;
            } else {
                sameHeightCount = 0;
            }
            lastScrollHeight = containerHeight;

            // Stop if page bottom reached 5 consecutive times
            if (sameHeightCount >= 5) {
                clearInterval(timer);
                resolve(collectedMap.size);
                return;
            }

            if (!isCatchingUp) {
                scrollCount++;
                if (collectedMap.size === lastCount) {
                    noNewCount++;
                } else {
                    noNewCount = 0;
                }
                lastCount = collectedMap.size;
            }
        }, interval);
    });
}

// Click the "Liked" tab on a TikTok profile page
function clickLikedTab(callback) {
    var tabEl = null;

    // Try primary selectors
    var primarySelectors = [TK_SELECTORS.LIKED_TAB, TK_SELECTORS.USER_LIKED_TAB];
    for (var i = 0; i < primarySelectors.length; i++) {
        tabEl = document.querySelector(primarySelectors[i]);
        if (tabEl) break;
    }

    // Fallback: text-based search
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

// Check if the Liked items container is present in DOM
function isOnLikedTab() {
    return !!document.querySelector(TK_SELECTORS.LIKED_CONTAINER) ||
        document.querySelectorAll(TK_SELECTORS.LIKED_ITEM).length > 0;
}

// Main collection workflow with append/continue support
function startCollection(autoPlay, appendMode, targetLimit, continueFromCurrent) {
    if (isCollecting) return;
    isCollecting = true;

    targetLimit = targetLimit || 100;
    continueFromCurrent = continueFromCurrent || false;

    const maxScrolls = Math.ceil(targetLimit / 12) + 5;

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

            autoScroll(targetLimit, 1000, existingUrls).then(function () {
                collectVideoUrls();
                sendVideosToBackground(appendMode);

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
        // Continue scrolling from current position without reloading
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
