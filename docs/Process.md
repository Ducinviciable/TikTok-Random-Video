# Process.md — TikTok Random Liked Extension Upgrade Roadmap (FINAL)

**Project:** Random-Video (TikTok Random Liked Chrome Extension)  
**Current Version:** v3.4.1  
**Architecture principle:** Keep pure DOM Collection. Do **not** migrate to signed API endpoints.

**Content Scripts Load Order (per `manifest.json`):**  
`selectors.js → content-utils.js → content-bypass.js → content-video.js → content-checkpoint.js → content-core.js → content.js`

**Reference projects (under `projects-support/`):**
- `bezier-mouse-js` — human-like Bézier mouse trajectories
- `reels-cycler` — clean auto-next / ended-video detection & MV3 patterns
- `tiktok-smart-unfollow` — adaptive delays, milestone idle, human timing

---

## Roadmap Status Tracker

| Phase | Description | Priority | Status |
|---|---|---|---|
| **Phase 1** | Collection Core Optimization (Catch-Up Phase & Dynamic maxScrolls) | Highest | ✅ Done |
| **Phase 2** | Playback Core & Stuck Monitor Optimization | High | ⏳ Pending |
| **Phase 3** | Behavioral Simulation (Bézier mouse, Idle, Anti-detection) | Medium | ⏳ Pending |
| **Phase 4** | Smart Preload (70% HEAD warm-up) & Interest Simulation | Medium | ⏳ Pending |
| **Phase 5** | 403 / Please-Wait Soft Recovery & Resource Governance | High | ⏳ Pending |

---

## Global Rules for the Agent

1. Work on **one phase at a time**. Finish, verify, and summarize before starting the next.
2. Never delete existing diagnostic logs (`[DIAGNOSTICS]`, `[CS]`, `[BG]`). Extend them if needed.
3. Prefer minimal, surgical edits. Preserve public message contracts between content scripts and background.
4. After each phase, output: **files changed · key logic added · how to test · residual risks**.
5. **Do not** touch Akamai-related cookies (`_abck`, `bm_*`). Clearing them causes 403s.
6. When referencing support projects, **read their source first**, then adapt ideas — do not copy large blocks blindly.
7. Only use `chrome.tabs.update()` as a fallback when the content script is unreachable; otherwise prefer SPA message navigation (`navigateToVideo`).
8. Do **not** introduce new external runtime dependencies that break Manifest V3.
9. Keep the existing MutationObserver / DOM-based collection architecture. No TikTok private API hooks.

---

## Suggested Execution Order

1. **Phase 1** → verify Deep Append on a large existing library  
2. **Phase 2** → verify stuck recovery & background playback  
3. **Phase 3** → verify Bézier motion + idle (visual + log inspection)  
4. **Phase 4** → verify preload trigger & early-skip ratio  
5. **Phase 5** → verify soft 403 path & long-session stability  

After all five phases, run the **Post-Upgrade Regression Checklist** at the bottom of this file.

---

## File Map (quick reference)

| Area               | Primary files |
|--------------------|---------------|
| Selectors / Config | `js/selectors.js`, `manifest.json` |
| Collection         | `js/content-core.js`, `js/content-utils.js`, `js/content-checkpoint.js` |
| Playback           | `js/content-video.js`, `bg-playback.js` |
| Anti-detect / UX   | `js/content-bypass.js` |
| Orchestration      | `background.js`, `bg-collections.js`, `content.js` |
| Extension UI       | `popup.html`, `popup.js`, `style.css` |
| Support references | `projects-support/bezier-mouse-js`, `reels-cycler`, `tiktok-smart-unfollow` |

---

## PROMPT 1 — Core Collection Optimization (Phase 1) — Highest Priority

```text
ROLE
You are a senior Chrome-extension engineer specializing in robust DOM scrapers and anti-fragile collection loops.

GOAL
Make Deep Append / "Collect More" reliable on large Liked lists (>1000 videos, e.g. 1700 already cached + fetch 300 more). Eliminate premature stops caused by `noNewCount` while the scraper is still inside already-known territory. Introduce a State-aware Catch-Up Phase, dynamic scroll budgeting, and Fast Catch-Up performance mode.

CONTEXT
- Core loop: `js/content-core.js` (`autoScroll`, `startCollection`, `noNewCount`, smartStop).
- Helpers: `js/content-utils.js` (collectVideoUrls, findScrollContainer), `js/content-checkpoint.js`.
- `existingUrls` / `existingUrlsSet` and `appendMode` / `isDeepAppend` already exist.
- Pain point: when `appendMode=true` the scraper often hits `noNewCount >= 4` within ~8 s while still scrolling through cached items, then aborts before reaching new videos.

PROCESS
1. Read thoroughly:
   - `js/content-core.js` (especially `autoScroll` / `scrollStep` and `startCollection`)
   - `js/content-utils.js`
   - `js/content-checkpoint.js`
2. State-aware "noNewCount" freezing (Catch-Up Phase):
   - When `appendMode === true` or `isDeepAppend === true`, introduce flag `isCatchingUp = true`.
   - While `isCatchingUp` is true, **do not** increment `noNewCount` even if consecutive scrolls yield zero new URLs.
   - As soon as the extractor finds the first URL that is NOT in `existingUrlsSet`, set `isCatchingUp = false` and re-enable normal `noNewCount` monitoring.
3. Dynamic scroll limit:
   - Replace
     `maxScrolls = Math.ceil(targetLimit / 10) + 15`
   - with
     `maxScrolls = Math.ceil((existingCount + targetLimit) / 10) + 15`
   - where `existingCount` is the size of `existingUrlsSet` (or likedVideos length) at the start of the run.
4. Fast Catch-Up mode (only while `isCatchingUp === true`):
   - Reduce scroll delay to a randomized 300–500 ms window.
   - Skip / defer heavy thumbnail extraction (metadata already cached).
   - When `isCatchingUp` becomes false, restore humanized delay (700–1300 ms + adaptive extras) and full thumbnail harvesting.
5. Keep Smart Stop, DOM cleanup and checkpoint behavior intact unless they conflict with the freeze logic.
6. Add clear console logs:
   - Enter Catch-Up
   - Still in known territory
   - First new URL → exit Catch-Up
   - Final counts

FILES TO FOCUS
- `js/content-core.js` (primary)
- `js/content-utils.js`
- `js/content-checkpoint.js` (only if checkpoint must know Catch-Up state)
- Do NOT change `background.js`, playback files, or bypass layers in this phase.

REFERENCE PROJECTS
- `projects-support/tiktok-smart-unfollow` → adaptive velocity / milestone logic and how it avoids stopping too early under resistance.
- Adapt the idea of "speed up in safe territory, brake when crossing the action threshold". Do not pull unfollow or mouse code.

OUT OF SCOPE
- No API / X-Bogus / signature work.
- No changes to playback or anti-detect layers.
- Do not remove MutationObserver or DOM collection structure.

CRITICAL NOTES
- Maintain compatibility with `chrome.storage.local` checkpoint saves.
- Preserve existing message actions: `collectionProgress`, `videosCollected`, `continueCollecting`, `clickLikedTabAndCollect`.
- If selectors change or Liked container is missing, fail gracefully and log.

ACCEPTANCE / TEST PLAN
- Start with an already-collected library (e.g. 1000+ items).
- Run "Collect More" / Deep Append for a modest targetLimit.
- Confirm logs show: Catch-Up → still known → first new URL → normal counting.
- Confirm the run does not abort in the first few seconds solely because of `noNewCount`.
- Confirm thumbnails are still collected once new territory is reached.
- Confirm checkpoint still saves intermediate progress.

DELIVERABLE
- Working Catch-Up + dynamic `maxScrolls` + Fast Catch-Up.
- Short summary of changes, test steps performed, residual risks.
- Update Roadmap Status Tracker: Phase 1 → ✅ Done (or ⚠️ Partial with notes).
```

---

## PROMPT 2 — Playback Core & Stuck Monitor (Phase 2)

```text
ROLE
You are a senior front-end engineer focused on reliable HTML5 video playback inside SPA environments (TikTok web) and Chrome extensions.

GOAL
Eliminate long freezes and slow start-up of videos. Make the Playback Engine react faster and more aggressively while remaining stable when the tab is in the background. Preserve Loop Guard so TikTok does not auto-advance the feed.

CONTEXT
- Core playback: `js/content-video.js` (watchForVideoElement, stuck monitor, force-play, waiting/stalled handlers, requestNextVideo, Loop Guard).
- SPA / init: `content.js`; visibility/focus bypass already in `js/content-bypass.js`.
- Background: `bg-playback.js`, `background.js` (playNext, randomLiked, …).
- Current pain: ~8 s freeze before skip; passive start-up; weaker enforcement when tab is hidden.

PROCESS
1. Read `js/content-video.js` completely, focusing on:
   - Stuck monitor (`stuckSeconds` / interval, currently ~8 s)
   - `watchForVideoElement`
   - Force-play paths and `waiting` / `stalled` handlers
   - Loop attribute guard and timeupdate / ended detection
2. Tighten stuck threshold:
   - Reduce from 8.0 s to **5.5–6.5 s** (use the upper end under slow-network signals if you already track missing thumbs / network state).
   - When `currentTime` fails to advance for that window while the video should be playing → treat as stuck and call `requestNextVideo()`.
3. Aggressive force-play on new video discovery:
   ```javascript
   activeVideo.setAttribute("preload", "auto");
   activeVideo.setAttribute("playsinline", "");
   activeVideo.load();
   try { activeVideo.currentTime = 0.05; } catch (e) {}
   activeVideo.play().catch(function (err) {
     console.warn("[CS] Autoplay/play rejected:", err);
   });
   ```
4. Background / unfocused tab:
   - Increase force-play / resume check frequency to ~1.2–1.5 s when the tab should still be playing.
   - If paused while it should be playing → re-call `play()`.
   - Keep existing silent Web Audio keep-alive in `content-bypass.js` (helps Chromium media priority).
5. Waiting / stalled interceptors:
   - On `waiting` or `stalled`, attempt soft recovery (play again or small `currentTime` bump).
   - If recovery fails after ~3 s, allow stuck monitor / next-video path to take over.
6. Preserve Loop Guard:
   - Keep `loop` on while watching.
   - Strip `loop` only when intentionally handing off to `requestNextVideo` (remaining < ~0.5 s), so TikTok does not auto-advance the feed.
7. Align "natural end → next" with clean patterns from `reels-cycler` (detect end; do not accidentally restart the same video).
8. Extend diagnostics (`BEFORE_PLAY`, `STUCK`, `PLAY_RESOLVED`, …).

FILES TO FOCUS
- `js/content-video.js` (primary)
- `content.js` only if `initVideoWatcher` wiring needs a tiny adjustment
- Do not rewrite collection or bypass layers in this phase.

REFERENCE PROJECTS
- `projects-support/reels-cycler` → natural video-end detection and clean advance on TikTok / Shorts. Adapt the spirit, not the whole extension.

OUT OF SCOPE
- No collection logic changes.
- No Bezier / mouse work (Phase 3).
- No 403 recovery redesign (Phase 5).

CRITICAL NOTES
- Respect the existing `requestNextVideo` throttle.
- Do not remove the loop-attribute MutationObserver guard.
- Prefer SPA `navigateToVideo` over `chrome.tabs.update` when content script is alive (Global Rule 7).

ACCEPTANCE / TEST PLAN
- Foreground: normal video ends → next starts cleanly.
- Stuck simulation → skip within ~6 s.
- Background tab: switch away; video keeps playing / resumes quickly.
- Loop Guard still prevents TikTok feed auto-advance.
- No double-navigation from ended + stuck firing together.

DELIVERABLE
- Faster stuck recovery + aggressive but safe force-play + solid background behavior.
- Summary, test checklist results, residual risks.
- Update Roadmap Status Tracker: Phase 2 → ✅ Done.
```

---

## PROMPT 3 — Behavioral Simulation & Anti-Detection (Phase 3)

```text
ROLE
You are an anti-detect / behavioral-simulation specialist focused on defeating commercial WAF behavioral analysis (e.g. Akamai) on high-traffic social sites.

GOAL
Replace robotic mouse/scroll patterns with human-heuristic movement and timing. Add purposeful micro-interactions and idle periods. Expand telemetry blocking. Raise session trust score for long automated runs.

CONTEXT
- Fake activity: `js/content-bypass.js` (Layer 4 – random mousemove / pointermove / scroll).
- Visibility, focus, navigator.webdriver, silent audio and basic telemetry block already exist in the same file.
- Collection and playback must keep working; only the human layer is upgraded.

PROCESS
1. Read `js/content-bypass.js` (especially `initFakeActivity` and related intervals).
2. Study `projects-support/bezier-mouse-js`:
   - Curve generation, control-point randomization
   - How points become successive mousemove / pointermove events
3. Replace random-point fake mouse with a Bézier Trajectory Engine:
   - 12–20 intermediate steps per move
   - Acceleration at start, deceleration near target (Fitts-inspired)
   - Per-point spatial jitter ±3–8 px
   - Disperse points over time with staggered timeouts or rAF (no teleport)
   - Lightweight pure-JS helper preferred, e.g.:
     ```javascript
     function getBezierPoints(p0, p1, p2, p3, steps) { /* ... */ }
     // ease timing with sine or smoothstep
     ```
4. Micro-interactions:
   - Occasional reverse scroll (3–5% chance after a down-scroll): up 200–400 px, smooth behavior.
   - Hover intent: move over avatar / caption / username zone, hold 300–800 ms, no sensitive clicks.
   - Idle: after every 40–70 videos (or equivalent activity counter), force full idle 8–15 s.
5. Extended telemetry blocking — expand XHR / fetch / sendBeacon intercept for:
   `log.tiktokv.com`, `mon.snssdk.com`, `mon.tiktokv.com`, `/api/v1/report`,
   keywords: `slardar`, `mssdk`, `webmssdk`, `byteoversea`, plus hosts already partially covered.
6. Register any new injected functions with the existing `Function.prototype.toString` stealth map if present.
7. Ensure fake activity is low-priority and never blocks `requestNextVideo` or collection.

FILES TO FOCUS
- `js/content-bypass.js` (primary)
- Optional small pure helper if Bézier math is extracted cleanly
- Do not change collection or playback logic except reading a shared activity counter if needed.

REFERENCE PROJECTS
- `projects-support/bezier-mouse-js` → primary source for curves and realistic paths.
- `projects-support/tiktok-smart-unfollow` → adaptive timing, milestone breaks, human-like pauses.
- `projects-support/reels-cycler` → lightweight activity patterns only; do not import UI.

OUT OF SCOPE
- No playback or collection refactors.
- No cookie clearing / Akamai token manipulation.
- No new npm dependencies that break MV3.

CRITICAL NOTES
- NEVER delete or clear Akamai session cookies (`_abck`, `bm_sv`, etc.).
- All synthetic movement stays in the content-script world.
- Log (debug level) when a Bézier move or idle starts, without spamming.

ACCEPTANCE / TEST PLAN
- Mouse path is curved, not teleporting, with small jitter.
- Reverse-scroll and hover occur occasionally.
- Idle pause appears after a batch of videos.
- Blocked telemetry hosts no longer send payloads (Network tab).
- Collection and auto-next still work with the new activity layer active.

DELIVERABLE
- Bézier-based fake mouse + micro-interactions + idle + extended telemetry block.
- Short explanation of trajectory algorithm and how to tune jitter / step count.
- Update Roadmap Status Tracker: Phase 3 → ✅ Done.
```

---

## PROMPT 4 — Smart Preload & Interest Simulation (Phase 4)

```text
ROLE
You are a media-performance and UX engineer optimizing perceived latency of sequential video playback and natural viewing patterns.

GOAL
(1) Reduce white-screen / empty-player moments when jumping to the next liked video by warming the next resource early.  
(2) Make watch behavior look selective by occasionally skipping videos before they finish (Interest Simulation).

CONTEXT
- Playback & next flow: `js/content-video.js` (`onVideoTimeUpdate`, `requestNextVideo`, `currentVideoElement`).
- Next URL selection: `bg-playback.js` / `background.js` (`playNext`, `selectRandomVideo`).
- Collection assumed stable after Phase 1; stuck/force-play improved after Phase 2.

PROCESS
1. Read `js/content-video.js` (timeupdate / ended path) and playNext handling in `bg-playback.js` / `background.js`.
2. Proactive media preloading (~70% mark):
   - On `timeupdate`, when `currentTime / duration >= ~0.70` (once per video):
     - Ask background for the probable next random URL (or reuse an already chosen next URL if architecture picks early).
     - Warm with lightweight approach:
       - `fetch(nextUrl, { method: "HEAD", mode: "no-cors" })` (fail silently), and/or
       - temporary `<link rel="preload" href="..." as="document">` (or appropriate `as`)
     - Clean up old preload `<link>` tags to avoid leaks on long sessions.
3. Interest Simulation (selective skip):
   - Each video has a 15–25% chance of being marked "low interest" (decision stable for that video's lifetime).
   - For low-interest videos, schedule early `requestNextVideo` when progress reaches a random point between 40% and 70% of duration.
   - Do not early-skip videos in error-recovery or conflicting stuck-monitor state.
4. Respect existing `requestNextVideo` throttle and `autoNextEnabled` flag.
5. Keep the majority path "watch to natural end" unchanged.

FILES TO FOCUS
- `js/content-video.js` (primary)
- `bg-playback.js` and/or `background.js` (minimal API to learn or warm next URL)
- `content.js` only if a new message type must be wired

REFERENCE PROJECTS
- `projects-support/reels-cycler` → clean advance-on-end and lightweight pre-transition ideas.
- Timing philosophy from `projects-support/tiktok-smart-unfollow` (random ranges, not unfollow actions).

OUT OF SCOPE
- No collection changes.
- No Bezier work.
- No hard 403 recovery redesign (Phase 5).

CRITICAL NOTES
- HEAD / preload failures (CORS, network) must fail silently and never throw into the main flow.
- Early-skip percentage and 40–70% window should be easy to tune (constants at top of file).
- Do not clash with stuck monitor or Loop Guard from Phase 2.
- Throttle preload so it runs at most once per video.
- Prefer SPA navigation when content script is alive (Global Rule 7).

ACCEPTANCE / TEST PLAN
- Majority of videos still watch to natural end.
- At ~70%, confirm a preload/HEAD attempt fires once (log or Network).
- Confirm ~15–25% of videos skip early between 40–70%.
- No memory growth from leftover `<link rel="preload">` tags after many transitions.
- Early skip still respects `autoNextEnabled = false`.

DELIVERABLE
- Working ~70% preload warm-up + configurable Interest Simulation (early skip).
- Test plan results and residual risks.
- Update Roadmap Status Tracker: Phase 4 → ✅ Done.
```

---

## PROMPT 5 — 403 Soft Recovery & Resource Governance (Phase 5)

```text
ROLE
You are a resilience engineer building self-healing browser automation that survives WAF challenges and multi-hour sessions.

GOAL
Replace aggressive hard reloads with soft, human-like recovery for 403 / "Please Wait" / blank pages. Add tiered cooldowns. Keep memory stable on long runs via disciplined DOM cleanup while preserving all harvested metadata.

CONTEXT
- Error detection & recovery: `js/content-video.js` (Layer 6 – Please Wait / 403 / video_error).
- Background watchdog & 403 triggers: `background.js` (tabs.onUpdated, interval ping, handle403Detected, last403TriggerTime).
- DOM cleanup & checkpoints: `js/content-checkpoint.js` + collection side in `content-core.js`.
- Previous phases have improved collection, playback speed, behavior, and preload.

PROCESS
1. Read recovery sections in `js/content-video.js` and 403 watchdog paths in `background.js`.
2. Soft SPA-based recovery for "Please Wait" / soft blocks:
   - Require the condition to persist **> 12 seconds** before treating it as hard failure (filter short network blips).
   - On confirmed soft block, run a gentle sequence:
     - **Phase A:** micro-scrolls (e.g. up 50 px, down 50 px)
     - **Phase B:** fake focus / visibility flash (dispatch focus-related events)
     - **Phase C:** wait an additional 4–7 seconds
     - **Phase D:** if still blocked → soft SPA navigation to another random video via existing `navigateToVideo` / randomLiked path (avoid full hard reload when content script is alive)
3. Tiered cooldown (exponential-style backoff) tracked in background:
   - **1st block:** pause actions, cooldown 8–12 s
   - **2nd consecutive:** cooldown 15–25 s
   - **3rd consecutive:** deep sleep 60+ s or surface a user-visible hint (possible captcha)
   - Reset consecutive counter after a stable error-free playback window (e.g. ~5 minutes)
4. Background watchdog alignment:
   - When ping fails or chrome-error / blank title is detected, wait an extra 1.5–2 s before calling `handleRandomLiked` / `handle403Detected` to avoid stampeding.
   - Coordinate content-script recovery and background watchdog so they do not both fire and double-navigate.
5. Smart DOM cleanup & metadata persistence:
   - Every ~100 successful scrolls (or existing cleanup cadence), remove older off-screen liked cards from the DOM.
   - Before removal, ensure URL + thumb (+ any other metadata) is already in the in-memory map and/or flushed via checkpoint / `videosCollected` so long sessions (>2 h) do not lose state.
6. Never clear Akamai cookies as a recovery step.

FILES TO FOCUS
- `js/content-video.js` (Layer 6 recovery)
- `background.js` (watchdog, last403TriggerTime, handle403Detected)
- `js/content-checkpoint.js`
- `js/content-core.js` only if cleanup thresholds need a small adjustment

REFERENCE PROJECTS
- `projects-support/tiktok-smart-unfollow` → adaptive slowdown and milestone pauses under resistance (map to cooldown tiers).
- `projects-support/reels-cycler` → clean navigation / state-reset patterns if useful.

OUT OF SCOPE
- No new collection strategy.
- No Bezier or preload redesign.
- No API signature work.

CRITICAL NOTES
- Keep Logging Diagnostics fully active during recovery so failure cascades are traceable.
- showToast messages should stay user-friendly and non-spammy.
- Log recovery decisions with reason + cooldown applied.
- Prefer SPA `navigateToVideo` over `chrome.tabs.update` when content script is reachable (Global Rule 7).
- Ensure long backoff periods do not fight the background watchdog interval.

ACCEPTANCE / TEST PLAN
- Short "Please Wait" blip (<12 s) → ignored / no navigation.
- Sustained block >12 s → soft sequence (A→B→C→D) then SPA navigation if needed.
- Consecutive 403-like events → observe tiered cooldowns (8–12 → 15–25 → 60+).
- Watchdog ping failure → delayed, non-stampeding reaction.
- 2-hour collection + playback soak: memory stable, metadata intact, checkpoints valid.
- Confirm Akamai cookies were never cleared by recovery code.

DELIVERABLE
- Soft SPA recovery, tiered cooldowns, safer watchdog timing, memory-safe cleanup with persistent metadata.
- Final test matrix results and residual risks.
- Update Roadmap Status Tracker: Phase 5 → ✅ Done.
```

---

## Post-Upgrade Regression Checklist

After all five phases:

- [ ] Deep Append on large cache reaches new territory without early `noNewCount` abort  
- [ ] Stuck videos skip within ~6 s  
- [ ] Background tab continues / resumes playback  
- [ ] Loop Guard still prevents TikTok feed auto-advance  
- [ ] Bézier mouse paths look curved; idle and reverse-scroll occur  
- [ ] ~70% preload fires once; early-skip rate roughly 15–25%  
- [ ] Soft 403 path does not hard-reload on short blips; cooldowns tier correctly (incl. tier 3)  
- [ ] Long session: no unbounded DOM growth; checkpoints restore  
- [ ] Skip / Ban / Random / Auto-next still work end-to-end  
- [ ] SPA `navigateToVideo` preferred over `chrome.tabs.update` when content script is alive  
- [ ] No Akamai cookie clearing anywhere in the new paths  
- [ ] Roadmap Status Tracker all phases marked ✅ (or documented ⚠️)

---

*End of FINAL Process.md — ready for agent execution phase by phase.*  
*Sources merged: Process_Agents.md (codebase) + prior merged Process.md (strategy + depth).*
