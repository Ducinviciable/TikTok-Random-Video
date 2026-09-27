# TikTok Random Liked — Agent Rules

## Core Directive: Stability First

> **STABILITY OVER PERFORMANCE**: Prioritize System Stability & Anti-Bot Safety over execution speed or resource refactoring. NEVER optimize, refactor, or alter working logic if there is any risk of introducing bugs, breaking edge cases, or triggering TikTok/Akamai WAF rate-limits.

---

## Architecture

- **Manifest V3 Extension**: Service Worker (`background.js`) has no DOM.
- **Content Scripts Load Order**:
  `selectors.js → content-utils.js → content-video.js → content-core.js → content.js`
- **Global Scope**: Content scripts share global variables declared in `selectors.js`. Do NOT use ES6 `import`/`export`.

---

## Critical Rules (Must Follow)

1. **NEVER Delete Akamai Cookies**: Do NOT touch cookies matching `_abck`, `bm_`, `rate`, `limit`. They are Akamai Bot Manager authorization tokens. Deleting them triggers **403 Access Denied**.
2. **NEVER Use `chrome.tabs.update()` for Video Navigation**: Use SPA navigation via `chrome.tabs.sendMessage(tabId, { action: "navigateToVideo", url })` (`window.location.href = url`). Only use `tabs.update()` as a fallback if the content script is unreachable.
3. **NEVER Auto-Blacklist on HTTP 403**: 403 is WAF rate-limiting, not a broken video. Only the user can manually ban videos.
4. **NEVER Hijack User Experience Outside Liked Videos**:
   - Extension ONLY controls playback for videos in `likedVideos` (or `healingQueue`).
   - When the user watches normal TikTok videos (FYP, profile, search), the content script MUST remain 100% passive: NO auto-next, NO forced `loop`, NO pause/play intervention, NO early skip, and NO forced navigation.
   - NEVER override user's manual pause/play actions.
5. **NEVER Remove `loop` Logic on Liked Videos**: The `loop` attribute on `<video>` prevents TikTok feed auto-advance during random liked playback. Keep the `MutationObserver` that re-adds `loop` if TikTok removes it (applies strictly to Liked Videos).
6. **NEVER Micro-Seek on Video Buffering**: Do NOT modify `currentTime` (`currentTime += 0.01` or similar) in `waiting` or `stalled` event handlers. Seeking flushes the browser media buffer and causes severe stutter/jittering.
7. **NEVER Full-Reload Tab for Recovery**: Do NOT call `location.reload()` or `chrome.tabs.reload()`. Use `navigateToVideo` to switch to a different video URL instead.
8. **NEVER Skip Video Under 2 Seconds**: Enforce a minimum 2-second delay (`requestNextVideo` throttle) between automatic video transitions to prevent rapid jumping.
9. **Keep Realistic & User-Friendly Delays**:
   - `handlePlayNext` (Auto-Next): Maintain `randomDelay(2000, 3200)` (2.0s – 3.2s). Shorter (< 2s) triggers Akamai WAF rate-limiting; longer (> 3.5s) causes frustrating muted playback lag.
   - `handleSkipAndPlayNext` (User Skip): `randomDelay(800, 1500)` (0.8s – 1.5s) for responsive user feedback.
   - `handleBanAndPlayNext` (User Ban): `randomDelay(500, 1000)` (0.5s – 1.0s) for responsive user feedback.
   - **Mute Timing**: Do NOT mute audio seconds in advance. Only mute immediately before SPA navigation to preserve audio continuity.

---

## Pre-Output Checklist

Before outputting code edits, verify:
- [ ] Does this change risk breaking any existing functionality?
- [ ] Could this trigger Akamai/TikTok WAF bot detection?
- [ ] Are all bracket pairs (`{}`) balanced? (Always verify with `node -c <file>`).
- [ ] Are all identifiers in `Object.assign(window, { ... })` in `player-app.js` strictly defined in scope? (Avoid `ReferenceError` blocking initialization).
- [ ] Are all event handlers attached in JS without inline `onclick`/`onerror` in HTML (CSP compliance)?

---

## Quick Reference

### Storage Keys
| Key | Type | Purpose |
|---|---|---|
| `likedVideos` | `Array<{url, thumb}>` | Collected video URLs & thumbnails |
| `blacklistedVideos` | `Array<string>` | Banned base URLs |
| `playedVideos` | `Array<string>` | Played URLs (no-repeat tracking) |
| `checkpoint` | `Object` | Auto-saved collection backup |
| `tiktokUsername` | `string` | User's TikTok handle |
| `targetLimit` | `number` | Target collection limit |
| `autoNextEnabled` | `boolean` | Auto-next toggle state |

### Message Actions
| Action | Direction | Purpose |
|---|---|---|
| `navigateToVideo` | BG → CS | SPA navigate to video URL |
| `playNext` | CS → BG | Request next random video |
| `handle403Detected` | CS → BG | 403 error recovery trigger |
| `videosCollected` | CS → BG | Send collected URLs to storage |
| `collectionProgress` | CS → BG | Report scroll/collection progress |
| `saveCheckpoint` | CS → BG | Auto-save scroll progress checkpoint |
| `getCheckpoint` | CS/Popup → BG | Retrieve checkpoint data |
| `clearCheckpoint` | CS → BG | Clear completed checkpoint |
