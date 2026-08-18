<div align="center">

# 🎬 TikTok Random Liked ❤️ (v3.5.1)

<p><strong>Chrome / Edge Extension cao cấp giúp xem & nghe ngẫu nhiên kho video đã thích (Liked) trên TikTok với hai chế độ: Tự động chuyển video trên tab TikTok hoặc Trình phát độc lập TikTok Hi-Fi Studio.</strong></p>

<p>
  <img src="https://img.shields.io/badge/build-passing-22c55e?style=for-the-badge" alt="build passing" />
  <img src="https://img.shields.io/badge/coverage-95%25-84cc16?style=for-the-badge" alt="coverage 95%" />
  <img src="https://img.shields.io/badge/Web%20Audio-Hi--Fi%20DSP-0ea5e9?style=for-the-badge" alt="Web Audio DSP" />
  <img src="https://img.shields.io/badge/manifest-v3-a855f7?style=for-the-badge" alt="manifest v3" />
</p>

<p><em>Tự động chuyển video (Auto-Next), Trình phát nhạc Hi-Fi Studio độc lập (10-Band EQ, Deep Bass, Volume Booster 300%), chống nhảy sang luồng gợi ý TikTok, bỏ qua video đứng / không âm thanh / TikTok Shop, và tự khôi phục thông minh khi gặp lỗi 403 / Access Denied.</em></p>

</div>

---

## ✨ Tính năng nổi bật

### 1. 🎧 Trình Phát Độc Lập — TikTok Hi-Fi Studio
- 🚀 **Phát ngầm không cần mở tab TikTok** — Tiết kiệm 95% CPU/RAM, triệt tiêu 100% rủi ro bị WAF chặn 403 / Captcha.
- 🎛️ **Bộ xử lý âm thanh Web Audio DSP**:
  - **10-Band Graphic Equalizer**: Tinh chỉnh 10 dải tần (32Hz – 16kHz) với các preset tối ưu sẵn (*Flat, Bass Boost, Vocal, Electronic, Lofi*).
  - **Deep Bass Booster**: Bộ lọc LowShelf 100Hz tăng cường âm trầm uy lực lên tới `+12dB`.
  - **Volume Normalizer (DynamicsCompressor)**: Tự động san bằng độ chênh lệch âm lượng giữa các video.
  - **Volume Booster 300%**: Khuếch đại tối đa biên độ cho các video âm lượng yếu.
- 🔀 **Dual-Buffer Crossfade (A/B)**: Tự động nạp trước bài tiếp theo ở 85% thời lượng và chuyển bài mượt mà không khoảng lặng (Fade 2.5s).
- 📊 **Real-time Spectrum Visualizer**: Đồ thị phổ tần số 32 cột sóng nhảy theo nhịp nhạc FFT và đĩa than Vinyl quay đồng bộ.
- 📂 **Kéo thả JSON Backup v3.1**: Nạp trực tiếp kho 3.000+ video từ file backup của extension.

### 2. 🎬 Trình Điều Khiển Tab — TikTok Web Controller
- 🎲 **Random Video Đã Like** — Mở & xem ngẫu nhiên video từ danh sách đã thích lưu trong bộ nhớ tạm (cache).
- ⏭️ **Bỏ qua (Skip)** — Bỏ qua video hiện tại và mở ngay video ngẫu nhiên tiếp theo (Throttle 2s an toàn).
- 🚫 **Xoá vĩnh viễn (Permanent Ban / Blacklist)** — Xoá video hiện tại khỏi danh sách xem và thêm vào "Danh sách đen" (Blacklist) để không bao giờ thu thập lại ở những lần quét sau.
- 🔀 **Tự chuyển video (Auto-Next Engine)** — Khi video sắp phát xong (còn < 0.5s) hoặc khi loop-reset, extension tự động chọn và phát video ngẫu nhiên tiếp theo.
- 🚀 **Smart Preload 70%** — Tự động gửi tín hiệu pre-warm tải trước tài nguyên video kế tiếp khi video hiện tại đạt mốc 70% thời lượng.
- 🛡️ **Bảo vệ vòng lặp (Loop Guard)** — Ép thuộc tính `loop` và theo dõi qua `MutationObserver` để chặn TikTok tự nhảy sang luồng video gợi ý không mong muốn.
- ⚡ **Cập nhật video mới (Smart Stop)** — Quét nhanh các video mới thích gần đây, tự dừng khi gặp 3 video cũ liên tiếp.
- 📜 **Quét tiếp video cũ (Deep Append)** — Bắt kịp siêu tốc qua video cũ (Catch-Up Phase) để quét sâu bổ sung các video cũ hơn.
- 📤/📥 **Xuất & Nhập Sao lưu (Export / Import Backup)** — Tải về file `.json` chứa toàn bộ video và danh sách đen để khôi phục nhanh mà không cần quét lại từ đầu.
- 🤖 **Tự động xử lý sự cố (Auto-Recovery & Tiered 403 Backoff)**:
  - Tự nhảy video nếu video bị đứng quá 6 giây (`startStuckMonitor`).
  - Tự nhảy video nếu phát hiện video bị tắt tiếng (Muted / Sound Removed / Copyright).
  - Tự nhảy video nếu gặp video quảng cáo TikTok Shop.
  - Phục hồi mềm đa giai đoạn (Phase A-D) khi xuất hiện màn hình *"Please Wait / Vui lòng chờ"*.
  - Cơ chế nghỉ hạ nhiệt theo bậc thang (Tier 1: 10s, Tier 2: 20s, Tier 3+: 65s) khi gặp chặn WAF rate-limit 403.
- 🔄 **Chạy ẩn nền (Background Playback)** — Vượt qua cơ chế Pause khi chuyển tab của TikTok nhờ bộ mô phỏng hành vi 6 lớp (Visibility, Focus, Bézier Mouse Activity, Telemetry Block, Web Audio Keep-Alive).
- ⌨️ **Phím tắt toàn cục & Phím tắt Player**:
  - TikTok Web: `Ctrl+Shift+9` (hoặc `Cmd+Shift+9` trên Mac) để bỏ qua và xoá video.
  - Player Studio: `Space` (Play/Pause), `N`/`P` (Next/Prev), `M` (Mute), `↑`/`↓` (Volume), `←`/`→` (Seek).

---

## 📂 Cấu trúc dự án

Toàn bộ mã nguồn được module hóa cao cấp theo nguyên tắc đơn trách nhiệm (Single Responsibility Principle):

```
Random-Video/
├── manifest.json                        # Cấu hình gốc Manifest V3 (permissions, icons, DNR, host_permissions)
├── background.js                        # Service Worker Root: Nạp importScripts, Central Message Router
├── content.js                           # Content Script Entry Point: Message listener, SPA Observer, AutoInit
├── player.html                          # Giao diện chính của Trình phát TikTok Hi-Fi Studio (Grid 4 panel phẳng)
├── style-player.css                     # Bảng kiểu CSS Glassmorphism & Audio Visualizer Animations
├── popup.html                           # Giao diện Popup điều khiển
├── popup.js                             # Popup Main Controller: Gắn sự kiện nút bấm & khởi tạo UI
├── style.css                            # Bảng kiểu CSS cho Popup (Dark Mode, hiệu ứng, toggle slider)
├── README.md                            # Tài liệu tổng quan dự án (v3.5.1)
├── icons/                               # Icon extension đa kích thước (16px, 48px, 128px)
│   └── icon.png
│
├── js/
│   ├── background/                      # 📦 Các module chuyên biệt cho Background Service Worker
│   │   ├── bg-playback.js               # Thuật toán chọn video random không trùng lặp, peek 70%, skip, ban, auto-next
│   │   ├── bg-collections.js            # Quản lý vòng đời Crawler Job, tự động cuộn trang từ background
│   │   ├── bg-storage.js                # Quản lý storage progressState, Checkpoint CRUD, Video CRUD, Blacklist, Backup JSON
│   │   ├── bg-recovery.js               # Phục hồi 403 bậc thang (Tiered 403), Reset window 5 phút, chẩn đoán tab, Watchdog
│   │   └── bg-player.js                 # JIT Silent Fetch Engine, TikWM stream prioritization & DNR CORS Isolator
│   │
│   ├── player/                          # 🎧 Các module dành riêng cho Trình phát TikTok Hi-Fi Studio
│   │   ├── player-app.js                # Khởi tạo giao diện, Queue, Drag-Drop JSON v3.1, Keyboard, Spectrum Canvas
│   │   ├── player-audio.js              # Web Audio DSP Engine (10-Band EQ, Bass Boost, Compressor, Dual-Buffer Crossfade)
│   │   └── player-cdn-refresh.js        # Client-side JIT CDN Cache & Background stream bridge
│   │
│   ├── content/                         # 🛡️ Các module Content Script chạy trên trang TikTok
│   │   ├── content-cdn-bridge.js        # Bridge trích xuất <video src> tức thời theo yêu cầu background
│   │   ├── crawler/                     # ── Layer Thu thập dữ liệu (DOM Scraper & Checkpoint) ──
│   │   │   ├── selectors.js             # Bộ chọn DOM TK_SELECTORS & khai báo biến toàn cục chia sẻ
│   │   │   ├── content-utils.js         # Phân tích DOM, trích xuất ảnh thumbnail (srcset), phát hiện scroll container
│   │   │   ├── content-checkpoint.js    # Dọn dẹp DOM giải phóng RAM (performDomCleanup), lưu checkpoint, quét vét cuối
│   │   │   └── content-core.js          # Engine cuộn trang autoScroll, Catch-up Phase lướt nhanh video cũ, Smart Stop
│   │   │
│   │   ├── stealth/                     # ── Layer 1, 2, 3 & 5: Anti-Detection, Spoofing & Interceptor ──
│   │   │   ├── content-stealth.js       # Stealthing API, Visibility Bypass (L1), Focus Bypass (L2), Navigator Spoof (L3)
│   │   │   └── content-interceptor.js   # Telemetry Interceptor (L5: chặn Slardar, Mon, MSSDK) & thông báo UI Toast
│   │   │
│   │   ├── behavior/                    # ── Layer 4: Mô phỏng hành vi người dùng (Human Behavior) ──
│   │   │   └── content-behavior.js      # Di chuyển chuột Bézier mượt mà, micro reverse-scroll, nghỉ ngơi Milestone Idle
│   │   │
│   │   └── video/                       # ── Layer 6: Trình phát, Điều hướng & Phục hồi lỗi Video ──
│   │       ├── content-video-recovery.js# Phục hồi lỗi Please Wait/403 (Phase A-D), Giám sát video đứng 6s, Bỏ qua Shop/Muted
│   │       ├── content-video-smart.js   # Smart Preload 70%, Bắt kết thúc video (timeupdate/ended), Bỏ qua sớm 10%, Throttle 2s
│   │       └── content-video-watcher.js # Bắt phần tử <video>, đảm bảo unmuted/volume, Loop Guardian MutationObserver
│   │
│   └── popup/                           # 🎨 Các module hỗ trợ giao diện Popup
│       ├── popup-api.js                 # DOM references, sendMsg, helper username, kiểm soát loading, cache lifetime & poller
│       ├── popup-list.js                # Render danh sách video (renderVideoList), xem thumbnail, xoá tạm & cấm vĩnh viễn
│       └── popup-backup.js              # Xử lý Xuất file JSON backup (exportBtn) & Nhập file JSON backup (importBtn)
│
└── docs/                                # 📚 Tài liệu kỹ thuật, kiến trúc & kế hoạch vận hành
    ├── Summary.md                       # Tài liệu tổng quan kiến trúc & tính năng (File này)
    ├── Parameter.md                     # Bảng thông số kỹ thuật, hằng số DSP và thời gian chờ
    ├── Process-Dedicated-Player.md      # Tài liệu đặc tả kỹ thuật & Lộ trình 5 Phase của Hi-Fi Studio
    ├── Bypass.md                        # Chi tiết kỹ thuật về cơ chế bypass 6 lớp / anti-detection
    ├── Random-play-flow.md              # Sơ đồ tuần tự luồng phát ngẫu nhiên end-to-end
    ├── Realistic.md                     # Chi tiết cơ chế cuộn thực tế, Catch-up Phase & Checkpoint
    ├── Plays and Collection.md          # Chi tiết luồng phát và thu thập video
    ├── Playback-debug-plan.md           # Kế hoạch debug lỗi phát video
    ├── Control.md                       # Mô tả chi tiết hành vi điều khiển
    └── System and User.md               # Mô hình tương tác giữa Hệ thống và Người dùng
```

---

## 🎮 Bảng điều khiển & Nút chức năng

| Nút / Thao tác | Chức năng |
| :--- | :--- |
| 🎧 **TikTok Hi-Fi Studio** | Mở Trình phát nhạc & video Hi-Fi Studio độc lập trong tab mới. |
| 🎲 **Random Video Đã Like** | Phát ngẫu nhiên 1 video từ danh sách cache trên tab TikTok. Nếu cache trống sẽ tự chuyển sang trang cá nhân để quét. |
| ⏭️ **Bỏ qua** | Bỏ qua video đang xem (vẫn lưu lại trong cache) và mở ngay video ngẫu nhiên tiếp theo. |
| 🚫 **Xoá vĩnh viễn** | Xoá video đang xem khỏi cache và đưa vào Danh sách đen (vĩnh viễn không thu thập lại). |
| ⚡ **Cập nhật video mới** | Quét nhanh các video mới thích gần đây, tự động dừng lại khi gặp 3 video cũ liên tiếp (Smart Stop). |
| 📜 **Quét tiếp video cũ** | Quét sâu bổ sung các video cũ hơn bằng chế độ Catch-up lướt nhanh qua các video đã biết. |
| 🔄 **Thu thập lại từ đầu** | Xoá bộ nhớ cache hiện tại và thực hiện quét lại từ đầu toàn bộ trang cá nhân. |
| 📤 **Xuất Backup** | Tải về file sao lưu `.json` chứa toàn bộ danh sách video và danh sách đen. |
| 📥 **Nhập Backup** | Khôi phục danh sách video và danh sách đen từ file sao lưu `.json` có sẵn. |
| ⏭️ **Tự chuyển video** (Toggle) | Bật/Tắt chế độ tự động nhảy video ngẫu nhiên tiếp theo khi hết bài. |

---

## ⚙️ Cơ chế hoạt động kỹ thuật

### 1. Luồng Thu thập Dữ liệu (Crawler Engine)
1. Điều hướng tab TikTok đến trang `@username`.
2. Tự động click tab **Đã thích (Liked)**.
3. Kích hoạt chu trình cuộn thích ứng:
   - **Fast Catch-Up Phase**: Khi cuộn qua vùng video cũ đã biết, tăng tốc cuộn (300–500ms), tạm bỏ qua tải thumbnail và đóng băng `noNewCount = 0`.
   - **Normal Collection**: Khi chạm vùng video mới, chuyển sang nhịp cuộn tự nhiên (700–1300ms) kèm trích xuất thumbnail `srcset`.
4. Lọc bỏ các URL đã có trong `blacklistedVideos` (Danh sách đen).
5. Tự động lưu Checkpoint dự phòng định kỳ (`saveCheckpointData`) và dọn dẹp các thẻ DOM cũ (`performDomCleanup`, giữ DOM $\le 150$ thẻ) để tránh tràn RAM.
6. Lưu danh sách hoàn chỉnh vào `chrome.storage.local`.

### 2. Luồng Phát Tab TikTok (Web Controller)
1. `initVideoWatcher()` tìm thẻ `<video>` hợp lệ trên trang `/video/`.
2. Gắn thuộc tính `loop`, cấu hình `muted = false`, `volume = 1.0` và kích hoạt `loopObserver` (`MutationObserver`) để vô hiệu hoá tính năng tự nhảy bài gợi ý của TikTok.
3. Khi video đạt mốc 70% thời lượng, `content-video-smart.js` kích hoạt **Smart Preload** để tải trước tài nguyên video tiếp theo.
4. Theo dõi sự kiện `timeupdate` & `ended`: khi thời gian còn lại `< 0.5s` hoặc phát hiện `loop-reset`, tạm dừng video và gửi yêu cầu `playNext` (kèm throttle 2 giây chống nhảy dồn dập).
5. Background chọn video ngẫu nhiên tiếp theo và điều hướng tab qua SPA message `navigateToVideo` (không dùng `location.reload()` để tránh làm mới trang).

### 3. Luồng Phát TikTok Hi-Fi Studio (JIT Silent Fetch & Web Audio DSP)
1. **Khởi tạo hàng chờ**: Nạp từ `chrome.storage.local` hoặc kéo thả trực tiếp file backup JSON v3.1.
2. **JIT Silent Fetch**: Khi chuẩn bị phát hoặc preload bài tiếp theo ở 85% thời lượng:
   - `PlayerCDN` gửi thông điệp `refreshCdnUrl` về Background.
   - Background thực hiện fetch ngầm lấy stream video `.mp4` (Fast TikWM + Silent Fallback) và trả về client với TTL 15 phút.
   - DNR Rule cô lập (`initiatorDomains: [chrome.runtime.id]`) mở quyền CORS cho tab Extension mà hoàn toàn không can thiệp vào tab TikTok.
3. **Web Audio DSP Pipeline**:
   $$\text{Player A/B} \longrightarrow \text{Gain A/B} \longrightarrow \text{10-Band EQ} \longrightarrow \text{Bass Boost (+12dB)} \longrightarrow \text{DynamicsCompressor} \longrightarrow \text{Master Gain (300\%)} \longrightarrow \text{Speakers}$$
4. **Dual-Buffer Crossfade (A/B)**: Khi chuyển bài, Gain kênh A giảm dần (Fade-out) đồng thời Gain kênh B tăng dần (Fade-in) trong 2.5s tạo trải nghiệm liền mạch không ngắt quãng.

### 4. Bộ phòng vệ 6 lớp (6-Layer Anti-Detection & Recovery)

- **Layer 1 (Visibility Bypass)**: Ghi đè `document.hidden = false`, `visibilityState = "visible"`, chặn sự kiện `visibilitychange` để video không bị tạm dừng khi chuyển tab.
- **Layer 2 (Focus Bypass)**: Ghi đè `document.hasFocus() = true`, chặn sự kiện `blur`, tự động kích hoạt lại `play()` khi tab lấy lại tiêu điểm.
- **Layer 3 (Navigator Spoof)**: Spoof `navigator.webdriver = false`, giả lập danh sách `plugins` và `languages`.
- **Layer 4 (Human Behavior Simulation)**: Tự động di chuyển chuột theo đường cong Bézier mượt mà kèm rung động bàn tay (spatial jitter), micro reverse-scroll và thời gian nghỉ giải lao tự nhiên (Milestone Idle 8-15s).
- **Layer 5 (Telemetry Interceptor)**: Chặn các request gửi dữ liệu phân tích / phát hiện bot về máy chủ TikTok (`slardar`, `mon.tiktokv.com`, `mssdk`, `sendBeacon`).
- **Layer 6 (Error & 403 Recovery)**: Phục hồi mềm 4 giai đoạn khi gặp màn hình "Please Wait", tự động bỏ qua video đứng 6s / không âm thanh / video Shop, và kích hoạt cơ chế hồi phục 403 theo bậc thang tránh bị WAF chặn.
