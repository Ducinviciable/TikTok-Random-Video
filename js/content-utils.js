function parseSrcset(srcset) {
    if (!srcset) return "";
    const parts = srcset.split(",");
    if (parts.length > 0) {
        return parts[0].trim().split(" ")[0];
    }
    return "";
}

// Extract video thumbnail URL from <img> or its parent <picture>
function extractImgUrl(img) {
    if (!img) return "";

    const picture = img.closest("picture");
    if (picture) {
        const source = picture.querySelector("source");
        if (source && source.srcset) {
            const url = parseSrcset(source.srcset);
            if (url) return url;
        }
    }

    if (img.srcset) {
        const url = parseSrcset(img.srcset);
        if (url) return url;
    }

    let src = img.currentSrc || img.src || "";

    if (src.startsWith("data:image") || src.startsWith("blob:")) {
        src = "";
    }

    if (!src) {
        src = img.getAttribute("data-src") || img.getAttribute("data-srcset") || "";
        if (src && src.includes(" ")) {
            src = parseSrcset(src);
        }
    }

    return src;
}

// Scrape liked video links + thumbnails from current page DOM
function collectVideoUrls() {
    let found = 0;
    const likedContainer = document.querySelector(TK_SELECTORS.LIKED_CONTAINER);

    function processItem(a, imgOwner) {
        const url = a.href.split("?")[0];
        if (!url || (blacklistedSet && blacklistedSet.has(url))) return;

        let img = a.querySelector("img");
        if (!img && imgOwner) img = imgOwner.querySelector("img");

        const thumb = extractImgUrl(img);

        if (!collectedMap.has(url)) {
            collectedMap.set(url, thumb);
            found++;
        } else if (thumb && !collectedMap.get(url)) {
            collectedMap.set(url, thumb);
        }

        // Track missing thumbnails for Retry Queue & Adaptive Delay
        if (!thumb || thumb === "") {
            missingThumbQueue.add(url);
        } else {
            missingThumbQueue.delete(url);
        }
    }

    if (likedContainer) {
        const links = likedContainer.querySelectorAll(TK_SELECTORS.VIDEO_LINK);
        links.forEach(function (a) {
            const parent = a.closest(TK_SELECTORS.LIKED_ITEM) || a.parentElement;
            processItem(a, parent);
        });
    } else {
        const items = document.querySelectorAll(TK_SELECTORS.LIKED_ITEM);
        if (items.length > 0) {
            items.forEach(function (item) {
                const a = item.querySelector(TK_SELECTORS.VIDEO_LINK);
                if (a) processItem(a, item);
            });
        }
    }

    return found;
}

// Return video URLs currently visible on the page
function getVisibleUrls() {
    const urls = [];
    const likedContainer = document.querySelector(TK_SELECTORS.LIKED_CONTAINER);
    const links = likedContainer
        ? likedContainer.querySelectorAll(TK_SELECTORS.VIDEO_LINK)
        : document.querySelectorAll(TK_SELECTORS.LIKED_ITEM + " " + TK_SELECTORS.VIDEO_LINK);
    links.forEach(function (a) {
        const url = a.href.split("?")[0];
        if (url) urls.push(url);
    });
    return urls;
}

// Find the scrollable container element on TikTok profile page
function findScrollContainer() {
    const candidates = [
        document.querySelector(TK_SELECTORS.LIKED_CONTAINER),
        document.querySelector(TK_SELECTORS.LIKED_CONTAINER)?.parentElement,
        document.querySelector(TK_SELECTORS.MAIN),
        document.querySelector(TK_SELECTORS.MAIN_CONTENT_ALT),
    ];

    for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el) {
            const style = getComputedStyle(el);
            if (style.overflowY === "auto" || style.overflowY === "scroll") {
                return el;
            }
            if (el.parentElement) {
                const parentStyle = getComputedStyle(el.parentElement);
                if (parentStyle.overflowY === "auto" || parentStyle.overflowY === "scroll") {
                    return el.parentElement;
                }
            }
        }
    }

    return null;
}

// Send collected video array to background for storage
function sendVideosToBackground(appendMode) {
    const videosArray = [];
    collectedMap.forEach(function (thumb, url) {
        videosArray.push({ url: url, thumb: thumb });
    });

    if (videosArray.length > 0) {
        try {
            chrome.runtime.sendMessage({
                action: "videosCollected",
                videos: videosArray,
                append: appendMode || false
            }, function () {
                if (chrome.runtime.lastError) { }
            });
        } catch (e) { }
    }
}
