---
name: tiktok-extension-dev
description: Coding standards and best practices for developing and maintaining the TikTok Random Liked Chrome Extension (Manifest V3). Covers file structure, code style, anti-detection patterns, video playback, and testing workflow.
---

# TikTok Random Liked Extension — Development Skill

## Project Structure

```
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker (no DOM)
├── popup.html / popup.js  # Extension popup UI
├── style.css              # Popup styles
├── content.js             # Content script entry point (message router + SPA observer)
└── js/
    ├── selectors.js       # DOM selectors + shared global state variables
    ├── content-utils.js   # DOM scraping helpers (thumbnail extraction, URL parsing)
    ├── content-video.js   # Anti-detection layers + video playback engine
    └── content-core.js    # Collection workflow (scroll, observe, collect, save)
```

### Load Order (content scripts)

```
selectors.js → content-utils.js → content-video.js → content-core.js → content.js
```

All files share **global scope** — no imports/exports. State declared in `selectors.js` is accessible everywhere.

---

## Code Style

### General

- No comments explaining obvious code. Only comment **why**, not **what**.
- No redundant inline comments like `// 3 days cache lifetime` next to `3 * 24 * 60 * 60 * 1000`.
- Keep functions short and focused — one responsibility per function.
- Use descriptive function names that explain intent: `handleSkipAndPlayNext`, `watchForVideoElement`.

### Content Scripts (content-video.js, content-core.js, content-utils.js)

- Use `var` inside IIFEs (Layer 1-6 in content-video.js).
- Use `let`/`const` in top-level module functions.
- Always use `function` declarations (not arrow functions) for hoisting compatibility.
- Wrap self-contained features in IIFEs: `(function initFeatureName() { ... })();`
- Guard all DOM operations with null checks.
- Guard all `video.play()` calls with `.then()/.catch()` — play() returns a Promise that rejects if autoplay is blocked.

```javascript
// ✅ Correct play() pattern
var p = video.play();
if (p && p.then) {
    p.then(function () { /* success */ })
    .catch(function (err) { /* handle rejection */ });
}

// ❌ Wrong — unhandled Promise rejection
video.play();
```

### Background Script (background.js)

- Use `const`/`let` and arrow functions.
- All handler functions are `async` — use `await` for chrome API calls.
- Always use `try/catch` around `chrome.tabs.sendMessage` — content script may not be loaded.
- Strip query parameters when comparing video URLs: `url.split("?")[0]`.

### Popup (popup.js)

- Use `const`/`let` and arrow functions.
- All chrome messaging goes through the `sendMsg()` wrapper.
- Never access `chrome.storage` directly from popup — always go through background.

---

## Anti-Detection Architecture (content-video.js)

The extension uses 6 layers to bypass TikTok's bot detection:

| Layer | Purpose | Method |
|---|---|---|
| 1 | Visibility API Override | `document.hidden = false`, block `visibilitychange` events |
| 2 | Focus/Blur Override | `document.hasFocus() = true`, block `blur` events |
| 3 | Navigator Spoofing | `navigator.webdriver = false`, fake plugins/languages |
| 4 | Fake Human Activity | Random mouse moves, scrolls, pointer events at natural intervals |
| 5 | Telemetry Interception | Block XHR/fetch/sendBeacon to tracking URLs |
| 6 | Playback Recovery | Detect paused/stuck/403/blank states and auto-recover |

### When adding new anti-detection features:

- Wrap in an IIFE with `console.log("[CS] Layer N ...")` init message.
- Use `try/catch` around every `Object.defineProperty` — some properties are non-configurable.
- Intercept in **capture phase** (`true` as 3rd arg to `addEventListener`) to run before TikTok's handlers.
- Never modify cookies — Akamai tokens are legitimate authorization, not tracking.

---

## Video Playback Pipeline

```
watchForVideoElement()
    → Find largest <video> by bounding rect area
    → Set preload="auto" + playsinline
    → Set loop attribute + MutationObserver guard
    → Attach diagnostic event listeners
    → Attach waiting/stalled recovery handlers
    → Start stuck monitor (8s timeout)
    → Check audio/shop after 2.5s delay
    → Listen timeupdate for end-of-video (remaining < 0.5s)
    → requestNextVideo() → background handlePlayNext()
```

### Key patterns:

- `loop` attribute stays ON during playback to prevent TikTok's auto-advance.
- `MutationObserver` re-adds `loop` if TikTok removes it.
- When video ends (remaining < 0.5s): disconnect observer → remove loop → pause → navigate.
- `playNextRequested` flag prevents double-navigation.

---

## Navigation Pattern

**Always prefer SPA navigation over full tab navigation:**

```javascript
// ✅ SPA navigation (preserves session + Akamai tokens)
try {
    await chrome.tabs.sendMessage(tabId, { action: "navigateToVideo", url: nextUrl });
} catch (e) {
    // Fallback only when content script is unreachable
    await chrome.tabs.update(tabId, { url: nextUrl });
}

// ❌ Never do this for video-to-video transitions
await chrome.tabs.update(tabId, { url: nextUrl });
```

---

## Testing Workflow

After every code change:

1. **Syntax check**: `node -c <filename>` for each modified file.
2. **Reload extension**: `chrome://extensions/` → click reload button.
3. **Functional test**:
   - Start random playback → verify video plays.
   - Switch to another tab → verify video doesn't stall.
   - Let auto-next cycle 5+ videos → verify no 403.
   - Test Skip and Ban buttons.
4. **Console check**: Look for `[DIAGNOSTICS]` and `[CS]` log prefixes.

---

## URL Comparison

Always strip query parameters before comparing video URLs:

```javascript
// ✅ Correct
const cleanUrl = url.split("?")[0];

// ❌ Wrong — query params change between sessions
if (url1 === url2) { ... }
```

---

## Storage Data Format

Video items can be either strings (legacy) or objects:

```javascript
// Always normalize before use
const url = typeof item === "string" ? item : (item.url || "");
const thumb = typeof item === "string" ? "" : (item.thumb || "");
```

The `getUrl()` helper in `background.js` handles this normalization.
