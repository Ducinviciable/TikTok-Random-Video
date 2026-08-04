// content-video.js — Enhanced video playback + multi-layer anti-detection bypass

// LAYER 1: Page Visibility API Override
(function initVisibilityBypass() {
    console.log("[CS] Layer 1 Visibility Bypass initialized.");
    try {
        Object.defineProperty(document, "hidden", {
            get: function () { return false; },
            configurable: true
        });
        Object.defineProperty(document, "visibilityState", {
            get: function () { return "visible"; },
            configurable: true
        });
    } catch (e) { }

    // Block visibilitychange in capture phase before TikTok receives it
    document.addEventListener("visibilitychange", function (e) {
        e.stopImmediatePropagation();
    }, true);
    window.addEventListener("visibilitychange", function (e) {
        e.stopImmediatePropagation();
    }, true);

    // Intercept future addEventListener calls for visibilitychange
    try {
        var _origAddEvent = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (type === "visibilitychange" && this === document) {
                return _origAddEvent.call(this, type, function () { }, options);
            }
            return _origAddEvent.call(this, type, listener, options);
        };
    } catch (e) { }
})();

// LAYER 2: Focus / Blur / hasFocus Override
(function initFocusBypass() {
    console.log("[CS] Layer 2 Focus/Blur Bypass initialized.");
    // Override document.hasFocus() — TikTok calls this to verify tab activity
    try {
        Document.prototype.hasFocus = function () { return true; };
    } catch (e) { }

    // Block blur events on window and document (capture phase)
    window.addEventListener("blur", function (e) {
        e.stopImmediatePropagation();
        e.preventDefault();
    }, true);

    document.addEventListener("blur", function (e) {
        e.stopImmediatePropagation();
    }, true);

    // Prevent window.onblur handlers
    try {
        Object.defineProperty(window, "onblur", {
            set: function () { },
            get: function () { return null; },
            configurable: true
        });
    } catch (e) { }

    // Periodically dispatch fake focus events to keep TikTok's internal state
    setInterval(function () {
        try {
            window.dispatchEvent(new Event("focus"));
            document.dispatchEvent(new FocusEvent("focus"));
        } catch (e) { }
    }, 10000);
})();

// LAYER 3: Navigator Anti-Detection
(function initNavigatorSpoof() {
    console.log("[CS] Layer 3 Navigator Spoofing initialized.");
    // Remove webdriver flag (Selenium/automation indicator)
    try {
        Object.defineProperty(navigator, "webdriver", {
            get: function () { return false; },
            configurable: true
        });
    } catch (e) { }

    // Ensure plugins array is not empty (bots typically have 0 plugins)
    try {
        if (navigator.plugins.length === 0) {
            Object.defineProperty(navigator, "plugins", {
                get: function () {
                    return [1, 2, 3, 4, 5]; // Fake non-empty plugins
                },
                configurable: true
            });
        }
    } catch (e) { }

    // Ensure languages array exists
    try {
        if (!navigator.languages || navigator.languages.length === 0) {
            Object.defineProperty(navigator, "languages", {
                get: function () { return ["vi-VN", "vi", "en-US", "en"]; },
                configurable: true
            });
        }
    } catch (e) { }
})();

// LAYER 4: Fake Human Activity Simulation

(function initFakeActivity() {
    console.log("[CS] Layer 4 Fake Human Activity initialized.");
    // Random integer between min and max (inclusive)
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Simulate mouse movement at random positions
    function fakeMouseMove() {
        try {
            var x = randInt(100, window.innerWidth - 100);
            var y = randInt(100, window.innerHeight - 100);
            var evt = new MouseEvent("mousemove", {
                bubbles: true,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y
            });
            document.dispatchEvent(evt);
        } catch (e) { }
    }

    // Simulate small scroll events (unnoticeable to user)
    function fakeScroll() {
        try {
            document.dispatchEvent(new Event("scroll", { bubbles: true }));
            window.dispatchEvent(new Event("scroll", { bubbles: true }));
        } catch (e) { }
    }

    // Simulate pointer events (TikTok uses pointer events heavily)
    function fakePointerMove() {
        try {
            var x = randInt(200, window.innerWidth - 200);
            var y = randInt(200, window.innerHeight - 200);
            document.dispatchEvent(new PointerEvent("pointermove", {
                bubbles: true,
                clientX: x,
                clientY: y,
                pointerId: 1,
                pointerType: "mouse"
            }));
        } catch (e) { }
    }

    // Run fake activity on randomized intervals (appear natural)
    setInterval(function () {
        fakeMouseMove();
    }, randInt(3000, 8000));

    setInterval(function () {
        fakeScroll();
    }, randInt(10000, 20000));

    setInterval(function () {
        fakePointerMove();
    }, randInt(5000, 12000));
})();

// LAYER 5: Network Telemetry Interception

(function initTelemetryBlock() {
    console.log("[CS] Layer 5 Telemetry Interceptor initialized.");
    // Tracking/monitoring URL patterns that TikTok uses to detect bots
    var trackingPatterns = [
        "/api/v1/report",
        "/api/v1/track",
        "mon.tiktokv.com",
        "analytics",
        "log-sdk",
        "slardar",
        "frontier",
        "/passport/web/rate"
    ];

    function isTrackingUrl(url) {
        if (!url) return false;
        for (var i = 0; i < trackingPatterns.length; i++) {
            if (url.indexOf(trackingPatterns[i]) !== -1) return true;
        }
        return false;
    }

    // Intercept XMLHttpRequest
    try {
        var _origXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            if (isTrackingUrl(url)) {
                this._blocked = true;
            }
            return _origXHROpen.apply(this, arguments);
        };

        var _origXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
            if (this._blocked) {
                return; // Silently drop tracking requests
            }
            return _origXHRSend.apply(this, arguments);
        };
    } catch (e) { }

    // Intercept fetch API
    try {
        var _origFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = typeof input === "string" ? input : (input && input.url ? input.url : "");
            if (isTrackingUrl(url)) {
                // Return fake successful response
                return Promise.resolve(new Response("{}", { status: 200 }));
            }
            return _origFetch.apply(this, arguments);
        };
    } catch (e) { }

    // Intercept navigator.sendBeacon (used for tracking pings)
    try {
        var _origBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function (url, data) {
            if (isTrackingUrl(url)) {
                return true; // Pretend it was sent
            }
            return _origBeacon.apply(this, arguments);
        };
    } catch (e) { }
})();

// Toast notification floating UI on TikTok page
function showToast(message, type) {
    type = type || "info";
    let toast = document.getElementById("tk-random-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "tk-random-toast";
        toast.style.cssText = "position:fixed;top:20px;right:20px;z-index:999999;background:rgba(20,20,32,0.92);color:#fff;padding:12px 18px;border-radius:10px;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.18);backdrop-filter:blur(10px);transition:all 0.3s cubic-bezier(0.16,1,0.3,1);pointer-events:none;display:flex;align-items:center;gap:8px;";
        document.body.appendChild(toast);
    }
    toast.innerHTML = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";

    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
    }, 4000);
}

// LAYER 6: Force Video Playback + "Please Wait" / 403 Recovery

(function initPlaybackRecovery() {
    console.log("[CS] Layer 6 Playback & Error Recovery initialized.");
    var recoveryAttempts = 0;
    var MAX_RECOVERY = 3;
    var pleaseWaitStartTime = null;

    setInterval(function () {
        if (!window.location.href.includes("/video/")) return;

        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
            var v = videos[i];
            if (v.paused && v.src && v.duration && v.duration > 0 && !v.ended) {
                console.log("[CS] ⚠️ Phát hiện video bị pause hoặc load chậm");
                v.play().catch(function () { });
            }
        }
    }, 2000);

    // Detect "Please Wait", 403 or error overlays and auto-recover by triggering randomLiked
    setInterval(function () {
        // Common TikTok error overlay patterns
        var errorDetected = false;
        var errorType = "";

        // Check for "Please Wait" text in any overlay
        var overlays = document.querySelectorAll(
            '[class*="modal"], [class*="overlay"], [class*="error"], [class*="captcha"], [class*="DivErrorContainer"]'
        );
        var pleaseWaitFound = false;
        for (var i = 0; i < overlays.length; i++) {
            var text = overlays[i].textContent.toLowerCase();
            if (text.includes("please wait") || text.includes("vui lòng chờ") ||
                text.includes("try again") || text.includes("thử lại")) {
                errorDetected = true;
                errorType = "please_wait";
                pleaseWaitFound = true;
                break;
            }
        }

        if (pleaseWaitFound) {
            if (!pleaseWaitStartTime) {
                pleaseWaitStartTime = Date.now();
                console.log("[CS] ⚠️ Bắt đầu xuất hiện màn hình 'Please wait / Vui lòng chờ'");
            }
        } else {
            if (pleaseWaitStartTime) {
                var elapsedSec = ((Date.now() - pleaseWaitStartTime) / 1000).toFixed(1);
                console.log("[CS] ✅ Màn hình 'Please wait' biến mất sau: " + elapsedSec + " giây.");
                pleaseWaitStartTime = null;
            }
        }

        // Check page title or body for 403 / error / access denied / blank page states
        var title = document.title.toLowerCase();
        var bodyText = document.body ? document.body.innerText.substring(0, 500).toLowerCase() : "";
        var isBlankPage = document.body && document.body.children.length <= 2 && bodyText.trim().length === 0;

        if (title.includes("403") || title.includes("access denied") || title.includes("forbidden") ||
            bodyText.includes("403 forbidden") || bodyText.includes("access denied") || isBlankPage) {
            errorDetected = true;
            errorType = "403";
        }

        // Check for empty video container (video failed to load)
        if (window.location.href.includes("/video/")) {
            var videos = document.querySelectorAll("video");
            if (videos.length > 0) {
                var mainVideo = videos[0];
                if (mainVideo.error || mainVideo.networkState === 3) {
                    errorDetected = true;
                    errorType = "video_error";
                }
            }
        }

        if (errorDetected && recoveryAttempts < MAX_RECOVERY) {
            recoveryAttempts++;
            console.warn("[CS] Layer 6: Error detected - Type:", errorType, "- Attempt", recoveryAttempts);

            if (errorType === "please_wait") {
                // Try clicking any dismiss/close/retry buttons
                var dismissBtns = document.querySelectorAll(
                    'button[class*="close"], button[class*="dismiss"], [class*="close-btn"], ' +
                    'button[class*="retry"], [data-e2e*="close"]'
                );
                for (var j = 0; j < dismissBtns.length; j++) {
                    dismissBtns[j].click();
                }

                if (dismissBtns.length === 0) {
                    setTimeout(function () {
                        window.location.reload();
                    }, 3000 + Math.random() * 4000);
                }
            } else if (errorType === "403" || errorType === "video_error") {
                console.warn("[CS] Layer 6: Detected 403 / Access Denied / Blank Page! Triggering Random Liked Video...");
                showToast("🤖 Phát hiện lỗi 403 / Trang trắng → Đang mở video ngẫu nhiên mới...", "warning");
                try {
                    chrome.runtime.sendMessage({ action: "handle403Detected" });
                } catch (e) { }
            }
        }

        // Reset recovery counter when video is playing normally
        var playingVideos = document.querySelectorAll("video");
        if (playingVideos.length > 0 && !playingVideos[0].paused && !playingVideos[0].error) {
            recoveryAttempts = 0;
        }
    }, 4000);

    // Periodically clear TikTok's internal error/rate-limit cookies
    setInterval(function () {
        try {
            var cookies = document.cookie.split(";");
            for (var i = 0; i < cookies.length; i++) {
                var name = cookies[i].split("=")[0].trim();
                if (name.includes("rate") || name.includes("limit") ||
                    name.includes("_abck") || name.includes("bm_")) {
                    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.tiktok.com";
                }
            }
            console.log("[CS] Layer 6: Cleaned rate-limiting / telemetry cookies.");
        } catch (e) { }
    }, 60000);
})();

// MONITOR 1: Stuck / Frozen Video Monitor (8-second freeze check)
let lastVideoTime = -1;
let stuckSeconds = 0;
let stuckInterval = null;

function startStuckMonitor() {
    if (stuckInterval) clearInterval(stuckInterval);
    lastVideoTime = -1;
    stuckSeconds = 0;

    stuckInterval = setInterval(function () {
        if (!videoWatcherActive || playNextRequested || !currentVideoElement) return;

        const video = currentVideoElement;
        if (video.duration && video.duration > 1 && !video.ended) {
            const currentTime = video.currentTime;
            if (lastVideoTime >= 0 && Math.abs(currentTime - lastVideoTime) < 0.05 && !video.paused) {
                stuckSeconds++;
                console.warn("[CS] ⚠️ Video bị đứng (" + stuckSeconds + "s) - currentTime: " + currentTime.toFixed(2));
                if (stuckSeconds >= 8) {
                    console.warn("[CS] ⚠️ Video bị đứng quá 8s! Tự động chuyển video tiếp...");
                    showToast("⚠️ Video bị đứng quá 8s → Tự chuyển video", "warning");
                    clearInterval(stuckInterval);
                    requestNextVideo();
                    return;
                }
            } else {
                stuckSeconds = 0;
            }
            lastVideoTime = currentTime;
        }
    }, 1000);
}

// MONITOR 2 & 3: Audio Check & TikTok Shop Check
function checkVideoAudioAndShop() {
    if (!currentVideoElement || playNextRequested) return;

    // 1. TikTok Shop Check
    let isShop = false;
    if (typeof TK_SELECTORS !== "undefined" && TK_SELECTORS.SHOP_ANCHOR) {
        const shopEl = document.querySelector(TK_SELECTORS.SHOP_ANCHOR);
        if (shopEl) isShop = true;
    }
    if (!isShop) {
        const anchors = document.querySelectorAll('a[href*="shop"], [class*="shop"], [class*="product"], [class*="cart"], [class*="anchor"]');
        for (let i = 0; i < anchors.length; i++) {
            const text = anchors[i].textContent.toLowerCase();
            if (text.includes("cửa hàng") || text.includes("shop") || text.includes("mua ngay") || text.includes("giỏ hàng")) {
                isShop = true;
                break;
            }
        }
    }

    if (isShop) {
        console.log("[CS] 🛒 Phát hiện video TikTok Shop → Tự động bỏ qua");
        showToast("🛒 Bỏ qua video TikTok Shop", "info");
        setTimeout(requestNextVideo, 800);
        return;
    }

    // 2. No Audio / Muted Sound Check
    const video = currentVideoElement;
    let isMuted = false;

    if (video.muted || video.volume === 0) {
        isMuted = true;
    }

    if (!isMuted && typeof TK_SELECTORS !== "undefined" && TK_SELECTORS.MUTED_NOTICE) {
        const muteEl = document.querySelector(TK_SELECTORS.MUTED_NOTICE);
        if (muteEl) isMuted = true;
    }

    if (!isMuted && typeof MUTED_SOUND_KEYWORDS !== "undefined") {
        const pageText = document.body ? document.body.innerText.toLowerCase() : "";
        for (let j = 0; j < MUTED_SOUND_KEYWORDS.length; j++) {
            if (pageText.includes(MUTED_SOUND_KEYWORDS[j])) {
                isMuted = true;
                break;
            }
        }
    }

    if (isMuted) {
        console.log("[CS] 🔇 Phát hiện video không có âm thanh / bị tắt tiếng → Tự động bỏ qua");
        showToast("🔇 Bỏ qua video không có âm thanh", "info");
        setTimeout(requestNextVideo, 1000);
        return;
    }
}

// VIDEO WATCHER — Auto-next playback engine
// Find the largest visible video element on the page
function watchForVideoElement() {
    const videos = document.querySelectorAll("video");
    if (videos.length === 0) return;

    let targetVideo = null;
    let maxArea = 0;

    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) {
            maxArea = area;
            targetVideo = v;
        }
    }

    if (!targetVideo && videos.length > 0) {
        targetVideo = videos[0];
    }

    if (!targetVideo || targetVideo === currentVideoElement) return;

    // Cleanup previous video
    if (currentVideoElement) {
        currentVideoElement.removeEventListener("ended", onVideoEnded);
        currentVideoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
    }
    if (loopObserver) {
        loopObserver.disconnect();
        loopObserver = null;
    }

    currentVideoElement = targetVideo;
    playNextRequested = false;
    timeUpdateTriggered = false;
    console.log("[CS] Chuyển sang video mới");

    // Start 8-second stuck monitor and check audio/shop after video loads
    startStuckMonitor();
    setTimeout(checkVideoAudioAndShop, 2500);

    // CRITICAL: Keep loop ON to prevent TikTok's auto-advance to next feed video
    if (!currentVideoElement.hasAttribute("loop")) {
        currentVideoElement.setAttribute("loop", "");
    }

    // Guard: Watch for TikTok re-removing the loop attribute
    loopObserver = new MutationObserver(function () {
        if (currentVideoElement && !currentVideoElement.hasAttribute("loop") && !playNextRequested) {
            currentVideoElement.setAttribute("loop", "");
            console.log("[CS] ⚠️ TikTok removed loop attribute — re-added it");
        }
    });
    loopObserver.observe(currentVideoElement, { attributes: true, attributeFilter: ["loop"] });

    // timeupdate is the PRIMARY detection method (ended won't fire with loop on)
    currentVideoElement.addEventListener("timeupdate", onVideoTimeUpdate);
    // ended is a SAFETY NET only (fires if loop is somehow removed)
    currentVideoElement.addEventListener("ended", onVideoEnded);
}

// Safety net — only fires if loop attribute was somehow removed
function onVideoEnded() {
    if (playNextRequested) return;
    console.log("[CS] Video đã kết thúc (ended event) → Gửi yêu cầu playNext");
    timeUpdateTriggered = false;
    requestNextVideo();
}

// PRIMARY end-of-video detection — fires while loop is on
function onVideoTimeUpdate() {
    if (playNextRequested) return;

    const video = currentVideoElement;
    if (!video || !video.duration || video.duration === Infinity || video.duration < 1) return;

    var remaining = video.duration - video.currentTime;

    if (remaining < 0.5 && remaining >= 0) {
        playNextRequested = true;

        // Remove loop and pause to prevent loop-restart during navigation delay
        if (loopObserver) {
            loopObserver.disconnect();
            loopObserver = null;
        }
        video.removeAttribute("loop");
        video.pause();

        console.log("[CS] Video gần hết (" + remaining.toFixed(2) + "s còn lại) → Tạm dừng & chuyển video");
        requestNextVideo();
    }
}

function requestNextVideo() {
    if (playNextRequested !== true) {
        playNextRequested = true;
    }
    console.log("[CS] → Sending playNext to background");
    try {
        chrome.runtime.sendMessage({ action: "playNext" }, function () {
            if (chrome.runtime.lastError) {
                console.warn("[CS] playNext failed:", chrome.runtime.lastError.message);
                playNextRequested = false;
                // Try to resume video if navigation failed
                if (currentVideoElement) {
                    currentVideoElement.setAttribute("loop", "");
                    currentVideoElement.play().catch(function () { });
                }
            }
        });
    } catch (e) {
        playNextRequested = false;
        if (currentVideoElement) {
            currentVideoElement.setAttribute("loop", "");
            currentVideoElement.play().catch(function () { });
        }
    }
}

function initVideoWatcher() {
    chrome.storage.local.get(["autoNextEnabled"], function (data) {
        if (data.autoNextEnabled === false) return;
        if (!window.location.href.includes("/video/")) return;

        videoWatcherActive = true;
        watchForVideoElement();

        if (!currentVideoElement) {
            let attempts = 0;
            const checkInterval = setInterval(function () {
                watchForVideoElement();
                attempts++;
                if (currentVideoElement || !videoWatcherActive || attempts > 30) {
                    clearInterval(checkInterval);
                }
            }, 500);
        }
    });
}
