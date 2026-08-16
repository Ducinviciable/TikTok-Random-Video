<div align="center">

# 🎬 TikTok Random Liked ❤️

<p><strong>Chrome / Edge Extension giúp xem ngẫu nhiên các video bạn đã thích (Liked) trên TikTok với trải nghiệm mượt, tự động và ít gián đoạn.</strong></p>

<p>
  <img src="https://img.shields.io/badge/build-passing-22c55e?style=for-the-badge" alt="build passing" />
  <img src="https://img.shields.io/badge/coverage-95%25-84cc16?style=for-the-badge" alt="coverage 95%" />
  <img src="https://img.shields.io/badge/architecture-modular-0ea5e9?style=for-the-badge" alt="architecture modular" />
  <img src="https://img.shields.io/badge/manifest-v3-a855f7?style=for-the-badge" alt="manifest v3" />
</p>

<p><em>Tự động chuyển video (Auto-Next), chống nhảy sang luồng gợi ý TikTok, bỏ qua video đứng / không âm thanh / TikTok Shop, và tự khôi phục thông minh khi gặp lỗi 403 / Access Denied.</em></p>

</div>

---

## ✨ Tính năng nổi bật

- 🎲 **Random Video Đã Like** — Mở & xem ngẫu nhiên video từ danh sách đã thích lưu trong bộ nhớ tạm (cache).
- ⏭️ **Bỏ qua (Skip)** — Bỏ qua video hiện tại và mở ngay video ngẫu nhiên tiếp theo (Throttle 2s an toàn).
- 🚫 **Xoá vĩnh viễn (Permanent Ban / Blacklist)** — Xoá video hiện tại khỏi danh sách xem và thêm vào "Danh sách đen" (Blacklist) để không bao giờ thu thập lại ở những lần quét sau.
- 🔀 **Tự chuyển video (Auto-Next Engine)** — Khi video sắp phát xong (còn < 0.5s) hoặc khi loop-reset, extension tự động chọn và phát video ngẫu nhiên tiếp theo.
- 🚀 **Smart Preload 70%** — Tự động gửi tín hiệu pre-warm tải trước tài nguyên video kế tiếp khi video hiện tại đạt mốc 70% thời lượng.
- 🛡️ **Bảo vệ vòng lặp (Loop Guard)** — Ép thuộc tính `loop` và theo dõi qua `MutationObserver` để chặn TikTok tự nhảy sang luồng video gợi ý không mong muốn.
- 📤/📥 **Xuất & Nhập Sao lưu (Export / Import Backup)** — Tải về file `.json` chứa toàn bộ video và danh sách đen để khôi phục nhanh mà không cần quét lại từ đầu.
- 🤖 **Tự động xử lý sự cố (Auto-Recovery & Tiered 403 Backoff)**:
  - Tự nhảy video nếu video bị đứng quá 6 giây (`startStuckMonitor`).
  - Tự nhảy video nếu phát hiện video bị tắt tiếng (Muted / Sound Removed / Copyright).
  - Tự nhảy video nếu gặp video quảng cáo TikTok Shop.
  - Phục hồi mềm đa giai đoạn (Phase A-D) khi xuất hiện màn hình *"Please Wait / Vui lòng chờ"*.
  - Cơ chế nghỉ hạ nhiệt theo bậc thang (Tier 1: 10s, Tier 2: 20s, Tier 3+: 65s) khi gặp chặn WAF rate-limit 403.
- 🔄 **Chạy ẩn nền (Background Playback)** — Vượt qua cơ chế Pause khi chuyển tab của TikTok nhờ bộ mô phỏng hành vi 6 lớp (Visibility, Focus, Bézier Mouse Activity, Telemetry Block, Web Audio Keep-Alive).
- ⌨️ **Phím tắt toàn cục (Global Shortcut)** — Nhấn `Ctrl+Shift+9` (hoặc `Cmd+Shift+9` trên Mac) để bỏ qua và xoá video bất kỳ lúc nào.

---

## 📂 Cấu trúc dự án

Toàn bộ mã nguồn được chia nhỏ theo nguyên tắc đơn trách nhiệm (Single Responsibility Principle) và phân chia theo các lớp chức năng riêng biệt:

```
Random-Video/
├── manifest.json                        # Cấu hình gốc Manifest V3: permissions, content scripts, background worker, commands
├── background.js                        # Service Worker Root: Nạp importScripts, Central Message Router, Lifecycle listeners
├── content.js                           # Content Script Entry Point: Message listener, SPA URL Observer, AutoInit
├── popup.html                           # Giao diện Popup HTML
├── popup.js                             # Popup Main Controller: Gắn sự kiện nút bấm & khởi tạo UI
├── style.css                            # Bảng kiểu CSS cho Popup (Dark Mode, hiệu ứng, toggle slider)
├── README.md                            # Tài liệu tổng quan dự án
├── icons/                               # Icon extension (16x16, 48x48, 128x128)
│   └── icon.png
│
├── js/
│   ├── background/                      # 📦 Các module chuyên biệt cho Background Service Worker
│   │   ├── bg-recovery.js               # Phục hồi 403 bậc thang (Tiered 403), Reset window 5 phút, chẩn đoán tab, 3s Watchdog Ping
│   │   ├── bg-storage.js                # Quản lý storage progressState, Checkpoint CRUD, Video CRUD, Blacklist, Backup JSON
│   │   ├── bg-playback.js               # Thuật toán chọn video random không trùng lặp, peek 70%, skip, ban, auto-next
│   │   └── bg-collections.js            # Quản lý vòng đời Crawler Job, tự động cuộn trang từ background
│   │
│   ├── content/                         # 🛡️ Các module Content Script chạy trên trang TikTok (phân tách theo Layer)
│   │   ├── crawler/                     # ── Layer Thu thập dữ liệu (DOM Scraper & Checkpoint) ──
│   │   │   ├── selectors.js             # Bộ chọn DOM TK_SELECTORS & khai báo biến toàn cục chia sẻ
│   │   │   ├── content-utils.js         # Phân tích DOM, trích xuất ảnh thumbnail (srcset), phát hiện scroll container
│   │   │   ├── content-checkpoint.js    # Dọn dẹp DOM giải phóng RAM (performDomCleanup), lưu checkpoint, quét vét cuối
│   │   │   └── content-core.js          # Engine cuộn trang autoScroll, Catch-up Phase lướt nhanh video cũ, Smart Stop
│   │   │
│   │   ├── stealth/                     # ── Layer 1, 2, 3 & 5: Anti-Detection, Spoofing & Interceptor ──
│   │   │   ├── content-stealth.js       # Stealthing API, Visibility Bypass (L1), Focus Bypass (L2), Navigator Spoof (L3), Audio Keep-Alive
│   │   │   └── content-interceptor.js   # Telemetry Interceptor (L5: chặn Slardar, Mon, MSSDK) & thông báo UI Toast (showToast)
│   │   │
│   │   ├── behavior/                    # ── Layer 4: Mô phỏng hành vi người dùng (Human Behavior) ──
│   │   │   └── content-behavior.js      # Di chuyển chuột Bézier mượt mà, micro reverse-scroll, nghỉ ngơi Milestone Idle, Cú hích ngữ cảnh
│   │   │
│   │   └── video/                       # ── Layer 6: Trình phát, Điều hướng & Phục hồi lỗi Video ──
│   │       ├── content-video-recovery.js# Phục hồi lỗi Please Wait/403 (Phase A-D), Giám sát video đứng 6s, Bỏ qua Shop & Muted audio
│   │       ├── content-video-smart.js   # Smart Preload 70%, Bắt kết thúc video (timeupdate/ended), Bỏ qua sớm 10%, Throttle 2s điều hướng
│   │       └── content-video-watcher.js # Bắt phần tử <video>, cấu hình buffer/preload, Loop Guardian MutationObserver, Watcher init
│   │
│   └── popup/                           # 🎨 Các module hỗ trợ giao diện Popup
│       ├── popup-api.js                 # DOM references, sendMsg, helper username, kiểm soát loading, cache lifetime & poller
│       ├── popup-list.js                # Render danh sách video (renderVideoList), xem thumbnail, xoá tạm & cấm vĩnh viễn
│       └── popup-backup.js              # Xử lý Xuất file JSON backup (exportBtn) & Nhập file JSON backup (importBtn)
│
└── docs/                                # 📚 Tài liệu kỹ thuật, kế hoạch và ghi chú vận hành
    ├── Summary.md                       # Tài liệu tổng quan kiến trúc, tính năng & vận hành (File này)
    ├── Bypass.md                        # Chi tiết kỹ thuật về cơ chế bypass / anti-detection
    ├── EXPECTED.MD                      # Hành vi mong đợi của hệ thống
    ├── Parameter.md                     # Bảng thông số kỹ thuật, hằng số và thời gian chờ
    ├── Playback-debug-plan.md           # Kế hoạch debug lỗi phát video
    ├── Plays and Collection.md          # Chi tiết luồng phát và thu thập video
    ├── Random-play-flow.md              # Sơ đồ tuần tự luồng phát ngẫu nhiên end-to-end
    └── System and User.md               # Mô hình tương tác giữa Hệ thống và Người dùng
```

---

## 🎮 Bảng điều khiển & Nút chức năng

| Nút / Thao tác | Chức năng |
| :--- | :--- |
| 🎲 **Random Video Đã Like** | Phát ngẫu nhiên 1 video từ danh sách cache. Nếu cache trống sẽ tự động điều hướng sang trang cá nhân để quét. |
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

### 1. Luồng Thu thập
1. Điều hướng tab TikTok đến trang `@username`.
2. Tự động click tab **Đã thích (Liked)**.
3. Sử dụng `MutationObserver` kết hợp tự động cuộn (`autoScroll`) để kích hoạt lazy-load của TikTok.
4. Lọc bỏ các URL đã có trong `blacklistedVideos` (Danh sách đen).
5. Tự động lưu Checkpoint dự phòng định kỳ (`saveCheckpointData`) và dọn dẹp các thẻ DOM cũ (`performDomCleanup`) để tránh tràn RAM.
6. Lưu danh sách hoàn chỉnh vào `chrome.storage.local`.

### 2. Luồng Phát & Tự nhảy Video
1. `initVideoWatcher()` tìm thẻ `<video>` hợp lệ trên trang `/video/`.
2. Gắn thuộc tính `loop` và kích hoạt `loopObserver` (`MutationObserver`) để vô hiệu hoá tính năng tự nhảy bài gợi ý của TikTok.
3. Khi video đạt mốc 70% thời lượng, `content-video-smart.js` kích hoạt **Smart Preload** để tải trước tài nguyên video tiếp theo.
4. Theo dõi sự kiện `timeupdate` & `ended`: khi thời gian còn lại `< 0.5s` hoặc phát hiện `loop-reset`, tạm dừng video và gửi yêu cầu `playNext` (kèm throttle 2 giây chống nhảy dồn dập).
5. Background chọn video ngẫu nhiên tiếp theo và điều hướng tab qua SPA message `navigateToVideo` (không dùng `location.reload()` để tránh làm mới trang).

### 3. Bộ phòng vệ 6 lớp (6-Layer Anti-Detection & Recovery)

- **Layer 1 (Visibility Bypass)**: Ghi đè `document.hidden = false`, `visibilityState = "visible"`, chặn sự kiện `visibilitychange` để video không bị tạm dừng khi chuyển tab.
- **Layer 2 (Focus Bypass)**: Ghi đè `document.hasFocus() = true`, chặn sự kiện `blur`, tự động kích hoạt lại `play()` khi tab lấy lại tiêu điểm.
- **Layer 3 (Navigator Spoof)**: Spoof `navigator.webdriver = false`, giả lập danh sách `plugins` và `languages`.
- **Layer 4 (Human Behavior Simulation)**: Tự động di chuyển chuột theo đường cong Bézier mượt mà kèm rung động bàn tay (spatial jitter), micro reverse-scroll và thời gian nghỉ giải lao tự nhiên (Milestone Idle 8-15s).
- **Layer 5 (Telemetry Interceptor)**: Chặn các request gửi dữ liệu phân tích / phát hiện bot về máy chủ TikTok (`slardar`, `mon.tiktokv.com`, `mssdk`, `sendBeacon`).
- **Layer 6 (Error & 403 Recovery)**: Phục hồi mềm 4 giai đoạn khi gặp màn hình "Please Wait", tự động bỏ qua video đứng 6s / không âm thanh / video Shop, và kích hoạt cơ chế hồi phục 403 theo bậc thang tránh bị WAF chặn.

---

## 🚀 Hướng dẫn cài đặt

1. Tải về hoặc clone repository này về máy.
2. Mở trình duyệt **Chrome** hoặc **Edge**.
3. Truy cập địa chỉ:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Bật chế độ **Developer mode** ở góc trên bên phải.
5. Bấm **Load unpacked** → chọn thư mục gốc của dự án này.
6. Icon extension ❤️ sẽ xuất hiện trên thanh công cụ trình duyệt.

---

## 📖 Hướng dẫn sử dụng

1. Đăng nhập vào **www.tiktok.com** trên trình duyệt.
2. Bấm vào biểu tượng **TikTok Random Liked** trên thanh công cụ.
3. Nhập ID TikTok của bạn (ví dụ: `@username`).
4. Bấm **"Random Video Đã Like 🎲"** hoặc **"Cập nhật video mới ⚡"**.
5. Thưởng thức các video yêu thích ngẫu nhiên liên tục mà không bị gián đoạn!
