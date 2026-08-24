---
description: Review code changes for bugs, Manifest V3 architecture, anti-bot safety, and best practices tailored for TikTok Random Liked.
---

1. Review the current code changes and their context specifically for the **TikTok Random Liked** Chrome Extension project.

2. Check against **Core Directive: Stability First & Anti-Bot Safety**:
   - **Akamai/TikTok WAF Safety**: Verify no cookies matching `_abck`, `bm_`, `rate`, or `limit` are modified or deleted.
   - **Rate Limiting & Delays**: Verify realistic random delays (`handlePlayNext`: 4–9s, `handleSkipAndPlayNext`: 2–4s, `handleBanAndPlayNext`: 1–3s) and minimum 2s transition throttle (`requestNextVideo`).
   - **No Auto-Blacklist on HTTP 403**: Verify HTTP 403 errors trigger recovery/navigation, NEVER automatic blacklisting.
   - **Anti-Detection Layers**: Ensure Layer 1–6 modifications in `content-video.js` catch errors silently and do not leak bot signatures.

3. Check against **Manifest V3 Architecture & Content Script Patterns**:
   - **Load Order Compliance**: Respect `selectors.js → content-utils.js → content-video.js → content-core.js → content.js`.
   - **Global Scope Rules**: No ES6 `import`/`export` statements in content scripts. Use `function` declarations and IIFEs.
   - **Service Worker Limits**: `background.js` has no DOM access. Wrap `chrome.tabs.sendMessage` in `try/catch`.
   - **SPA Navigation**: Ensure video transitions use SPA navigation (`navigateToVideo` message / `window.location.href`), NOT `chrome.tabs.update()` or `location.reload()`.
   - **Video Loop Preservation**: Ensure `<video>` has `loop` attribute enabled and `MutationObserver` guards against TikTok removing it.

4. Check against **Data & Storage Integrity**:
   - **URL Cleaning**: Ensure query parameters are stripped (`url.split("?")[0]`) when comparing or matching video URLs.
   - **Storage Normalization**: Verify proper handling of video items (strings vs. objects `{url, thumb}`).
   - **Storage Keys**: Maintain integrity of `likedVideos`, `blacklistedVideos`, `playedVideos`, `checkpoint`, `tiktokUsername`, `targetLimit`, `autoNextEnabled`.

5. Check for **Code Quality & Edge Cases**:
   - `video.play()` calls must handle Promise rejections (`.then().catch()`).
   - DOM elements and selectors must be null-checked before dereferencing.
   - Check for syntax errors and bracket balancing (`node -c <file>`).
   - Avoid unnecessary re-renders, infinite loops, or memory leaks (e.g. unhandled observers or intervals).

6. Classify findings by severity:
   - **Critical**: Anti-bot/WAF risk (cookie deletion, rapid looping), full extension crash, security flaw.
   - **High**: Broken video navigation, loss of storage data, stuck state without auto-recovery.
   - **Medium**: Edge case failures, missing error handlers, inconsistent delay timing.
   - **Low**: Code redundancy, minor logging inconsistency.
   - **Suggestion**: Non-critical refactoring or minor polish (only if safe and high-value).

7. Format findings for each issue:
   - **File & Location**: [`file.js:L12-L34`](file:///path/to/file.js#L12-L34)
   - **Problem**: Clear description of the issue.
   - **Why it is a problem**: Impact on extension stability, TikTok anti-bot compliance, or MV3 execution.
   - **Recommended Solution**: Specific code diff or fix instructions.

8. Do not modify any code unless explicitly requested.

9. End with a concise summary:
   - Critical / High issues.
   - Medium / Low issues.
   - Anti-Bot & Stability assessment.
   - Final recommendation (Ready to merge / Needs revision).
   - Commit messager to writer