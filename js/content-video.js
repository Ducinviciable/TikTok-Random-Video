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

// LAYER 6: Force Video Playback + "Please Wait" / 403 Recovery

(function initPlaybackRecovery() {
    console.log("[CS] Layer 6 Playback & Error Recovery initialized.");
    var recoveryAttempts = 0;
    var MAX_RECOVERY = 3;

    // Force-play paused videos periodically
    setInterval(function () {
        if (!window.location.href.includes("/video/")) return;

        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
            var v = videos[i];
            if (v.paused && v.src && v.duration && v.duration > 0 && !v.ended) {
                v.play().catch(function () { });
            }
        }
    }, 2000);

    // Detect "Please Wait" or error overlays and auto-recover
    setInterval(function () {
        if (!window.location.href.includes("/video/")) return;

        // Common TikTok error overlay patterns
        var errorDetected = false;
        var errorType = "";

        // Check for "Please Wait" text in any overlay
        var overlays = document.querySelectorAll(
            '[class*="modal"], [class*="overlay"], [class*="error"], [class*="captcha"], [class*="DivErrorContainer"]'
        );
        for (var i = 0; i < overlays.length; i++) {
            var text = overlays[i].textContent.toLowerCase();
            if (text.includes("please wait") || text.includes("vui lòng chờ") ||
                text.includes("try again") || text.includes("thử lại")) {
                errorDetected = true;
                errorType = "please_wait";
                break;
            }
        }

        // Check page title or body for 403 / error states
        var title = document.title.toLowerCase();
        var body = document.body ? document.body.innerText.substring(0, 500).toLowerCase() : "";
        if (title.includes("403") || title.includes("access denied") ||
            body.includes("403 forbidden") || body.includes("access denied")) {
            errorDetected = true;
            errorType = "403";
        }

        // Check for empty video container (video failed to load)
        var videos = document.querySelectorAll("video");
        if (videos.length > 0) {
            var mainVideo = videos[0];
            if (mainVideo.error || mainVideo.networkState === 3) {
                errorDetected = true;
                errorType = "video_error";
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

                // If no buttons found, wait then reload
                if (dismissBtns.length === 0) {
                    setTimeout(function () {
                        window.location.reload();
                    }, 3000 + Math.random() * 4000);
                }
            } else if (errorType === "403" || errorType === "video_error") {
                // Wait a random 5-15 seconds then retry the same page
                var delay = 5000 + Math.random() * 10000;
                console.warn("[CS] Layer 6: Reloading page in", Math.round(delay / 1000), "seconds to recover from access denied/video error.");
                setTimeout(function () {
                    window.location.reload();
                }, delay);
            }
        }

        // Reset recovery counter when video is playing normally
        if (videos.length > 0 && !videos[0].paused && !videos[0].error) {
            recoveryAttempts = 0;
        }
    }, 5000);

    // Periodically clear TikTok's internal error/rate-limit cookies
    setInterval(function () {
        try {
            // Delete rate-limit and tracking cookies
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
    }, 60000); // Every 60 seconds
})();

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

    if (!targetVideo || targetVideo === currentVideoElement) return;

    if (currentVideoElement) {
        currentVideoElement.removeEventListener("ended", onVideoEnded);
        currentVideoElement.removeEventListener("timeupdate", onVideoTimeUpdate);
    }

    currentVideoElement = targetVideo;

    if (currentVideoElement.hasAttribute("loop")) {
        currentVideoElement.removeAttribute("loop");
    }

    currentVideoElement.addEventListener("ended", onVideoEnded);
    currentVideoElement.addEventListener("timeupdate", onVideoTimeUpdate);
}

function onVideoEnded() {
    timeUpdateTriggered = false;
    requestNextVideo();
}

function onVideoTimeUpdate() {
    if (timeUpdateTriggered) return;

    const video = currentVideoElement;
    if (!video || !video.duration || video.duration === Infinity) return;

    if (video.duration - video.currentTime < 0.3 && video.duration > 1) {
        timeUpdateTriggered = true;
        setTimeout(function () {
            if (timeUpdateTriggered) {
                timeUpdateTriggered = false;
                requestNextVideo();
            }
        }, 2000);
    }
}

function requestNextVideo() {
    try {
        chrome.runtime.sendMessage({ action: "playNext" }, function () {
            if (chrome.runtime.lastError) { }
        });
    } catch (e) { }
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
