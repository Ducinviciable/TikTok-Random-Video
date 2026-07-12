# TikTok Random Liked ❤️

Chrome / Edge extension that **randomly plays videos from your Liked list** on TikTok — with auto-next playback that keeps working even when you switch tabs.

---

## ✨ Features

- 🎲 **Random Liked Video** — pick a random video from your liked list and play it instantly
- ⏭️ **Auto-Next** — when a video ends, automatically plays another random liked video (infinite playlist)
- 🔄 **Background Playback** — video keeps playing and auto-next works even when you're on another tab
- ➕ **Smart Collect More** — if already on the Liked tab, scrolls from current position without reloading
- 📦 **3-Day Cache** — stores collected video list for 3 days, no need to re-scrape every time
- ⌨️ **Global Shortcut** — `Ctrl+Shift+9` to skip & delete current video from any tab
- 🖥️ **Dark Mode UI** — clean popup interface

---

## 📂 Project Structure

```
tiktok-random-liked/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker: routing, storage, tab management
├── popup.html                 # Popup UI markup
├── popup.js                   # Popup logic & event handlers
├── style.css                  # Popup styles
├── content.js                 # Main content script entry point
├── icons/
│   └── icon.png               # Extension icon
├── js/
│   ├── selectors.js           # All TikTok DOM selectors (centralized)
│   ├── content-utils.js       # Helper: thumbnail extraction, DOM scraping
│   ├── content-video.js       # Visibility bypass + auto-next video watcher
│   └── content-core.js        # Collection engine: auto-scroll, tab click, startCollection
└── README.md
```

### Content Script Load Order

Scripts are loaded in this order via `manifest.json` — each file can access variables and functions from all files loaded before it:

1. **`js/selectors.js`** — `TK_SELECTORS` constant and `LIKED_TAB_LABELS`
2. **`js/content-utils.js`** — `parseSrcset()`, `extractImgUrl()`, `collectVideoUrls()`, `getVisibleUrls()`, `findScrollContainer()`, `sendVideosToBackground()`
3. **`js/content-video.js`** — Visibility bypass IIFE, `watchForVideoElement()`, `initVideoWatcher()`, `onVideoEnded()`, `requestNextVideo()`
4. **`js/content-core.js`** — `autoScroll()`, `clickLikedTab()`, `isOnLikedTab()`, `startCollection()`, `startObserving()`
5. **`content.js`** — Shared state variables, message router, `autoInit()`, SPA URL observer

---

## 🎮 Buttons & Controls

| Button | Description |
|--------|-------------|
| 🎲 **Random Video Đã Like** | Plays a random video from cache, or collects first if cache is empty/expired |
| ⏭️ **Bỏ qua & Xoá** | Deletes current video from list and plays next random one |
| 🔄 **Thu thập lại từ đầu** | Clears cache and re-scrapes the entire Liked list |
| ➕ **Thu thập thêm video** | Appends more videos — scrolls in-place if already on profile |
| 🔀 **Tự chuyển video** (Toggle) | Auto-next on/off — when video ends, auto-play another |

---

## ⚙️ How It Works

### Architecture

```
Popup (popup.js)  ←→  Background (background.js)  ←→  Content Scripts (js/*.js + content.js)
      ↕                      ↕                                ↕
   UI Controls          Storage & Routing              TikTok DOM Interaction
                      (chrome.storage)                 (scraping, scrolling, video)
```

### Video Collection

TikTok is a **Single Page Application** — content is rendered dynamically. The extension handles this with:

1. **Navigate to profile** → `/@username`
2. **Click the "Liked" tab** — using `data-e2e` selectors with text-matching fallback
3. **Auto-scroll** — scrolls the page to trigger lazy loading of video thumbnails
4. **MutationObserver** — detects newly rendered DOM elements in real-time
5. **Smart scroll container detection** — finds the correct scrollable element (not always `window`)
6. **Limit-based stopping** — stops after collecting the requested number of new videos

### Auto-Next Playback

1. Content script finds the `<video>` element on `/video/` pages
2. Removes the `loop` attribute so the `ended` event fires
3. Listens for `ended` event → requests next random video from background
4. **Fallback**: uses `timeupdate` to detect video near end (< 0.3s remaining) if `ended` doesn't fire

### Background Tab Bypass (6-Layer Defense)

All layers are implemented in [`js/content-video.js`](js/content-video.js):

| Layer | Technique | Purpose |
|-------|-----------|---------|
| 1 | Override `document.hidden`, `visibilityState` + block `visibilitychange` events | Fake tab visibility |
| 2 | Override `document.hasFocus()`, block `blur` events, dispatch fake `focus` events | Maintain focus state |
| 3 | Spoof `navigator.webdriver`, `plugins`, `languages` | Anti-automation detection |
| 4 | Periodic fake `mousemove`, `pointermove`, `scroll` events at random intervals | Simulate human activity |
| 5 | Intercept `XMLHttpRequest`, `fetch`, `sendBeacon` for tracking/telemetry URLs | Block bot-detection pings |
| 6 | Auto-detect "Please Wait" overlays and 403 errors → auto-dismiss / retry with delay | Error recovery |

Additionally, `background.js` adds **randomized delays** (2-5s) before video transitions to avoid server-side rate limiting.

### Storage

- Video list cached in `chrome.storage.local` for **3 days**
- Auto-next state synced across all TikTok tabs
- Username and collection limit persisted between popup opens

---

## 🚀 Installation

1. Download or clone this repository
2. Open **Chrome** or **Edge**
3. Navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Enable **Developer mode** (top right corner)
5. Click **Load unpacked** → select the extension folder
6. The extension icon appears on the toolbar

---

## 📖 Usage

1. Open **www.tiktok.com** and log in
2. Click the **TikTok Random Liked** extension icon
3. Enter your TikTok username (e.g. `@yourname`)
4. Click **"Random Video Đã Like 🎲"**
5. The extension will:
   - Open your profile → click Liked tab → auto-scroll to collect videos → play a random one
6. With **"Tự chuyển video"** ON → videos auto-advance like a playlist
7. Switch to any tab — video keeps playing in the background

> **💡 Tip**: Click "Thu thập thêm video" to add more videos without losing existing ones.
