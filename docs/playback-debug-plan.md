# Diagnostic Logging Plan for Background Tab Playback Stalls

This document provides a technical diagnostic plan to identify why a randomly opened TikTok video occasionally stalls in a background tab until the user manually focuses/activates the tab.

---

## 1. Problem Analysis & Diagnostic Goals

When Chrome or Edge navigates to a new TikTok video in a background (non-focused) tab:
1. **Browser Resource Throttling**: Chromium aggressively throttles timers (`setInterval` / `setTimeout` delayed to 1000ms+), suspends media decoding, and delays audio context initialization in background tabs.
2. **TikTok Web Player Background Policy**: TikTok's web player script checks `document.hidden`, `document.visibilityState`, and `document.hasFocus()`. If false, TikTok pauses or delays buffering media streams.
3. **Media Pipeline Ready State**: The HTML5 `<video>` element may remain stuck at `readyState = 1` (`HAVE_METADATA`) or `readyState = 2` (`HAVE_CURRENT_DATA`) until tab focus occurs.

### Diagnostic Objectives
By injecting structured telemetry logs at critical execution checkpoints, we can determine:
- Whether the video element is found but stuck in `paused = true`.
- Whether network buffering halts (`networkState = 2` or `3`, `buffered = []`).
- Whether Chromium background throttling is preventing Layer 6 `v.play()` calls or `setInterval` execution.
- Whether `document.visibilityState` / `hasFocus()` overrides are successfully active at the moment of failure.

---

## 2. Standardized Diagnostic Logging Helper

To ensure consistency across all logging points, use the following helper function:

```javascript
function logPlaybackDiagnostics(tag, video) {
    var bufferedRanges = [];
    if (video && video.buffered) {
        for (var i = 0; i < video.buffered.length; i++) {
            bufferedRanges.push([
                video.buffered.start(i).toFixed(2),
                video.buffered.end(i).toFixed(2)
            ]);
        }
    }

    console.log(
        `[PLAYBACK-DEBUG] [${tag}] ` +
        `t=${performance.now().toFixed(2)}ms | ` +
        `doc.hidden=${document.hidden} | ` +
        `doc.visState=${document.visibilityState} | ` +
        `doc.hasFocus=${typeof document.hasFocus === "function" ? document.hasFocus() : "N/A"} | ` +
        `v.readyState=${video ? video.readyState : "N/A"} | ` +
        `v.netState=${video ? video.networkState : "N/A"} | ` +
        `v.paused=${video ? video.paused : "N/A"} | ` +
        `v.currentTime=${video ? video.currentTime.toFixed(2) : "N/A"} | ` +
        `v.duration=${video ? (isNaN(video.duration) ? "NaN" : video.duration.toFixed(2)) : "N/A"} | ` +
        `v.buffered=${JSON.stringify(bufferedRanges)}`
    );
}
```

---

## 3. Recommended Logging Insertion Points

### Point 1: Initial Video Element Detection & Binding
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Function:** `watchForVideoElement()`
* **Placement:** Immediately after `currentVideoElement = targetVideo;` is assigned.
* **Purpose:** Verifies the exact DOM state, buffer state, and visibility properties the moment a `<video>` element is discovered by the extension.

#### Code Snippet to Insert:
```javascript
// Inside watchForVideoElement() after targetVideo is selected:
currentVideoElement = targetVideo;
logPlaybackDiagnostics("VIDEO_BOUND", currentVideoElement);
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [VIDEO_BOUND] t=1420.50ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=1 | v.netState=2 | v.paused=true | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","1.20"]]
```

---

### Point 2: HTML5 Media Event Listeners (`playing`, `pause`, `waiting`, `stalled`, `canplay`)
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Function:** `watchForVideoElement()`
* **Placement:** Inside `watchForVideoElement()`, bind event listeners directly to `currentVideoElement`.
* **Purpose:** Tracks exact native media state transitions (e.g., whether the browser fires `waiting` or `stalled` when background tab buffering halts).

#### Code Snippet to Insert:
```javascript
// Inside watchForVideoElement() after binding timeupdate / ended:
["playing", "pause", "waiting", "stalled", "canplay", "canplaythrough"].forEach(function(evtName) {
    currentVideoElement.addEventListener(evtName, function() {
        logPlaybackDiagnostics("EVENT_" + evtName.toUpperCase(), currentVideoElement);
    });
});
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [EVENT_WAITING] t=2150.80ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=2 | v.netState=2 | v.paused=false | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","0.50"]]
[PLAYBACK-DEBUG] [EVENT_STALLED] t=4150.10ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=2 | v.netState=2 | v.paused=false | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","0.50"]]
```

---

### Point 3: Layer 6 Forced Playback Recovery Interval
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Function:** `initPlaybackRecovery()`
* **Placement:** Inside the 1.5-second recovery `setInterval` loop when `v.paused === true`.
* **Purpose:** Determines if `v.play().catch()` is actively being executed or if browser background throttling is freezing the `setInterval` timer entirely.

#### Code Snippet to Insert:
```javascript
// Inside initPlaybackRecovery() setInterval loop:
if (v.paused && v.src && v.duration && v.duration > 0 && !v.ended) {
    logPlaybackDiagnostics("LAYER6_RECOVERY_ATTEMPT", v);
    v.play().then(function() {
        logPlaybackDiagnostics("LAYER6_PLAY_SUCCESS", v);
    }).catch(function(err) {
        console.warn("[PLAYBACK-DEBUG] [LAYER6_PLAY_ERROR]", err.message);
        logPlaybackDiagnostics("LAYER6_PLAY_FAILED", v);
    });
}
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [LAYER6_RECOVERY_ATTEMPT] t=3500.00ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=1 | v.netState=2 | v.paused=true | v.currentTime=0.00 | v.duration=12.10 | v.buffered=[]
[PLAYBACK-DEBUG] [LAYER6_PLAY_FAILED] NotAllowedError: play() failed because the user didn't interact with the document first.
```

---

### Point 4: 6-Second Stuck Video Monitor Interval
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Function:** `startStuckMonitor()`
* **Placement:** Inside the 1-second `stuckInterval` loop when `stuckSeconds > 0`.
* **Purpose:** Monitors whether video playback is frozen at a specific `currentTime` timestamp and tracks how `stuckSeconds` increments over time.

#### Code Snippet to Insert:
```javascript
// Inside startStuckMonitor() timer when Math.abs(currentTime - lastVideoTime) < 0.05:
if (stuckSeconds > 0) {
    logPlaybackDiagnostics("STUCK_MONITOR_TICK_" + stuckSeconds + "S", video);
}
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [STUCK_MONITOR_TICK_1S] t=5010.20ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=3 | v.netState=2 | v.paused=false | v.currentTime=2.14 | v.duration=20.00 | v.buffered=[["0.00","2.14"]]
[PLAYBACK-DEBUG] [STUCK_MONITOR_TICK_2S] t=6015.40ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=3 | v.netState=2 | v.paused=false | v.currentTime=2.14 | v.duration=20.00 | v.buffered=[["0.00","2.14"]]
```

---

### Point 5: Post-Load Audio & Shop Inspection Check
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Function:** `checkVideoAudioAndShop()`
* **Placement:** At the entry of `checkVideoAudioAndShop()`.
* **Purpose:** Verifies audio track state (`v.muted`, `v.volume`) and DOM elements 2.5 seconds after video element binding.

#### Code Snippet to Insert:
```javascript
// Inside checkVideoAudioAndShop() entry:
logPlaybackDiagnostics("POST_LOAD_CHECK_2500MS", currentVideoElement);
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [POST_LOAD_CHECK_2500MS] t=3920.10ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=4 | v.netState=1 | v.paused=false | v.currentTime=1.20 | v.duration=18.50 | v.buffered=[["0.00","18.50"]]
```

---

### Point 6: Tab Focus & Active Status Check in Service Worker
* **File:** [background.js](file:///d:/A.Myself/Random-Video/background.js)
* **Function:** `getOrCreateTikTokTab(targetUrl)`
* **Placement:** Inside `getOrCreateTikTokTab()` before calling `chrome.tabs.update()`.
* **Purpose:** Logs whether the target TikTok tab is created/updated with `{ active: true }` or in the background (`{ active: false }`).

#### Code Snippet to Insert:
```javascript
// Inside getOrCreateTikTokTab() in background.js:
console.log(`[PLAYBACK-DEBUG] [BG_TAB_NAVIGATION] t=${Date.now()} | tabId=${targetTab.id} | active=${targetTab.active} | targetUrl=${targetUrl}`);
```

#### Expected DevTools Console Output:
```text
[PLAYBACK-DEBUG] [BG_TAB_NAVIGATION] t=1722800000000 | tabId=142 | active=false | targetUrl=https://www.tiktok.com/@username/video/7391000000
```

---

## 4. Summary Table of Diagnostic Logging Locations

| Location # | Target File | Target Function | Trigger Condition | Primary Value |
|:---|:---|:---|:---|:---|
| **1** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `watchForVideoElement()` | `<video>` element found in DOM | Verifies initial buffer & readyState upon DOM binding |
| **2** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `watchForVideoElement()` | Native HTML5 media events | Detects `waiting` / `stalled` events when network buffering stops |
| **3** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `initPlaybackRecovery()` | Every 2s when `v.paused == true` | Logs Layer 6 `v.play()` attempt success or rejection errors |
| **4** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `startStuckMonitor()` | Every 1s when `currentTime` is frozen | Tracks freeze duration when video stalls mid-playback |
| **5** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `checkVideoAudioAndShop()` | 2.5s after video detection | Inspects volume, muted status, and shop element flags |
| **6** | [background.js](file:///d:/A.Myself/Random-Video/background.js) | `getOrCreateTikTokTab()` | Tab URL navigation | Logs tab active status (`active=true` vs `active=false`) |

---

## 5. Diagnostic Interpretation Matrix

When testing background tab video playback, review DevTools Console logs against this matrix:

| Log Pattern Observed | Root Cause | Solution |
|:---|:---|:---|
| `v.readyState = 1` (`HAVE_METADATA`), `v.buffered = []`, `v.paused = true` | TikTok web player halted network fetch because tab is in background. | Enforce tab focus during navigation or dispatch synthetic play gesture. |
| `LAYER6_PLAY_FAILED: play() failed because the user didn't interact` | Chrome Autoplay Policy blocked programmatic `.play()` without user gesture. | Ensure extension popup click or keyboard shortcut acts as activation context. |
| `EVENT_STALLED`, `v.netState = 2`, `v.buffered` stopped advancing | Chrome background tab network throttling deprioritized media stream requests. | Enable background media audio keep-alive stream or tab focus. |
| No log output from `LAYER6_RECOVERY_ATTEMPT` for > 10 seconds | Chromium background timer throttling delayed `setInterval` execution. | Use `chrome.alarms` or Service Worker tab ping to maintain timer cadence. |
