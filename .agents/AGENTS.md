# TikTok Random Liked — Agent Rules

## Architecture

This is a **Chrome Extension (Manifest V3)** with the following file loading order for content scripts:

```
selectors.js → content-utils.js → content-video.js → content-core.js → content.js
```

All content script files share global scope. State variables are declared in `selectors.js` and accessed across all files without imports.

`background.js` is a **service worker** — it has no DOM access, no `window`, no `document`.

---

## Critical Rules

### 1. NEVER delete TikTok/Akamai cookies

Cookies like `_abck`, `bm_sz`, `bm_sv` are **Akamai Bot Manager authorization tokens**. Deleting them immediately triggers **403 Access Denied** on subsequent requests. Any code that clears cookies matching patterns like `_abck`, `bm_`, `rate`, `limit` on `.tiktok.com` must NOT be added.

### 2. NEVER use `chrome.tabs.update()` for video-to-video navigation

Use SPA navigation via `chrome.tabs.sendMessage(tabId, { action: "navigateToVideo", url })` instead. This executes `window.location.href = url` inside the page context, preserving session cookies and Akamai tokens.

`chrome.tabs.update()` triggers a full top-level navigation that the WAF sees as a new request — causing 403 blocks. Only use `chrome.tabs.update()` as a **fallback** when the content script is unreachable (e.g., tab is on a 403 error page).

### 3. NEVER auto-blacklist videos based on HTTP errors

403 errors are caused by WAF/rate-limiting, NOT by the video itself being broken. Auto-blacklisting a video URL on 403 would permanently remove valid videos from the user's collection. Only the user can manually ban videos via the Ban button.

### 4. NEVER remove the `loop` attribute logic

The `loop` attribute on `<video>` is critical to prevent TikTok's auto-advance to the next feed video. The `MutationObserver` that re-adds `loop` when TikTok removes it must NOT be deleted. End-of-video detection relies on `timeupdate` (primary) checking `remaining < 0.5s`, not `ended` event — because `ended` never fires while `loop` is active.

### 5. NEVER use ES6 modules or `import`/`export` in content scripts

Content scripts are loaded via `manifest.json` `content_scripts` array and share global scope. They do NOT support ES modules. All shared state goes in `selectors.js`. All functions are global.

### 6. NEVER use `var` for new code in `background.js` or `popup.js`

`background.js` and `popup.js` use `const`/`let`. Content scripts (`content-video.js`, `content-core.js`, `content-utils.js`) use a mix — prefer `var` in IIFE layers and `let`/`const` in module-level functions for consistency with existing patterns.

### 7. NEVER reload the tab with `window.location.reload()` or `chrome.tabs.reload()` for error recovery

Full reloads destroy the content script context and can trigger WAF detection. For error recovery, send a `navigateToVideo` message to switch to a different video URL instead.

### 8. Keep `randomDelay()` ranges realistic

Current ranges: `handlePlayNext` 4-9s, `handleSkipAndPlayNext` 2-4s, `handleBanAndPlayNext` 1-3s. Never reduce below these minimums — shorter delays trigger TikTok's rate limiter.

---

## Bracket/Syntax Pitfalls

Content scripts have deeply nested callback structures (especially `content-core.js`). When editing:

- Count every `{` and `}` before and after your edit
- The `proceed()` function inside `startCollection()` has 3 nesting levels: `proceed` → `chrome.storage.local.get` callback → `autoScroll().then` callback
- Always verify with `node -c <file>` after editing

---

## Storage Keys

| Key | Type | Description |
|---|---|---|
| `likedVideos` | Array<{url, thumb}> | Collected video URLs with thumbnails |
| `blacklistedVideos` | Array<string> | Banned video URLs (base URL without query) |
| `playedVideos` | Array<string> | Already-played URLs for no-repeat tracking |
| `collectedAt` | number | Timestamp of last collection |
| `tiktokUsername` | string | User's TikTok handle (with or without @) |
| `targetLimit` | number | Target video collection count |
| `autoNextEnabled` | boolean | Auto-next toggle state |

---

## Message Actions (content ↔ background)

| Action | Direction | Purpose |
|---|---|---|
| `navigateToVideo` | BG → CS | SPA-navigate to a video URL |
| `playNext` | CS → BG | Request next random video |
| `handle403Detected` | CS → BG | 403 error detected, trigger random |
| `videosCollected` | CS → BG | Send collected URLs to storage |
| `collectionProgress` | CS → BG | Report scroll/collection progress |
| `collectAndPlay` | CS → BG | Collection done, start playback |
| `ping` | BG → CS | Check if content script is alive |
