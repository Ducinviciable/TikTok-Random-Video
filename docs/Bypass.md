You are a senior anti-detect and TikTok protection bypass expert (Akamai, WAF, bot detection, Chromium background throttling). Upgrade the entire existing bypass system in the extension (mainly content-video.js and the related parts of background.js) with the following mandatory requirements:

### Main Goals
Maximize reduction of “Please Wait”, 403, Access Denied, and background throttling when:
- The TikTok tab is in the background
- Videos are switched continuously (auto-next / skip / ban)
- Large-scale Liked scanning is running
- Chromium heavily throttles the inactive tab

The solution must be completely non-intrusive (never steal user focus) and highly stealthy.

### Bypass Layers to Upgrade / Add

1. Visibility & Focus Bypass (Layer 1-2)
- Improve the override of document.hidden, visibilityState, and hasFocus so they are much harder to detect (especially against toString() checks).
- Add a real “visibility resume” mechanism: when the tab actually becomes focused/visible again, immediately force-play the current video.

2. Smart “Please Wait” Handling (Layer 6 Upgrade)
- Detect “Please Wait” more accurately and earlier.
- When “Please Wait” appears while the tab is in the background → **do not** activate or focus the tab (this interrupts the user).
- Rely on Silent Audio Keep-Alive (see point 6) + controlled recovery instead.
- If “Please Wait” lasts longer than 12–15 seconds → perform a soft recovery (prefer SPA re-navigation) with proper cooldown.
- Implement a solid cooldown system to prevent recovery spam.

3. Background Tab Handling
- Before every video change (playNext, skip, ban), check whether the tab is currently active.
- Prefer non-intrusive techniques (Silent Audio) over forcing the tab to the foreground.
- Increase randomized delays when the tab is detected as background.

4. Fake Human Activity Upgrade
- Make mouse / pointer / scroll simulation smarter (prioritize the video player area, avoid completely random full-screen positions).
- Add light fake keyboard events and realistic interactions with the player.

5. Telemetry & Network
- Fine-tune the list of blocked telemetry endpoints (do not block too aggressively or the missing heartbeat will look suspicious).
- Never delete or clear Akamai cookies (_abck, bm_*, etc.).

6. Background Tab Keep-Alive – Silent Audio Technique (Critical & Mandatory)
- Do **not** rely on activating or focusing the TikTok tab (this steals focus and interrupts the user while typing or working in other tabs).
- Implement a Silent Web Audio keep-alive stream in content-video.js:
  - Create a silent AudioContext / oscillator with volume = 0 that runs continuously while video watching or collection is active.
  - When Chromium detects that the tab is playing audio, it automatically raises the tab’s process priority and significantly reduces background throttling.
- This allows smooth video loading and auto-next even when the tab stays completely in the background, without ever flashing or focusing the tab.

7. Mandatory SPA-Style Navigation (No Hard Reload) – Critical
- When changing videos (playNext / skip / ban), **absolutely forbid** using chrome.tabs.update with a full URL that causes a hard page reload.
- Always prioritize true SPA navigation methods:
  - history.pushState + proper popstate handling, or
  - Simulating the ArrowDown key / triggering TikTok’s internal UI navigation, or
  - Changing the location from the content script while fully preserving the session and Akamai tokens.
- Hard reload via chrome.tabs.update is allowed only as an absolute last-resort fallback.
- You must update the actual source code in both background.js and content-video.js right now to enforce this rule. Do not leave any path that still uses full URL reload for normal video switching.

8. Native Code Stealthing (Anti-Detection – Mandatory)
- All overridden native functions (especially document.hasFocus, visibility-related getters, etc.) must be properly stealthed.
- Override Function.prototype.toString so that when TikTok checks `document.hasFocus.toString()` (or any similar overridden method), it returns the authentic native string:
  `function hasFocus() { [native code] }`
- Apply the same native-code stealthing to every other overridden method to prevent easy detection via toString() checks.

9. Stuck Video & Error Recovery
- Improve the 8-second stuck monitor and tightly integrate it with Please Wait and 403 detection.
- When 403 / blank page / video error is detected → apply proper cooldown + intelligent recovery (prefer SPA re-navigation or soft reload) instead of aggressively calling randomLiked in a loop.

### Technical Requirements
- Keep the existing Layer structure; only upgrade and extend it.
- Prioritize stability when the tab is in the background and zero user interruption.
- All delays and simulated behaviors must include natural randomness.
- Code must be clean, well-commented, and include clear diagnostic logs.
- Provide complete, ready-to-use code for content-video.js and all necessary changes in background.js.
- Explicitly fix the SPA navigation paths in the current source code so that background.js no longer uses full URL reload for normal video switching.

First briefly analyze the current weaknesses of the bypass system, then deliver the fully upgraded implementation.