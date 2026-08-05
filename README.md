# TikTok Random Liked ❤️

Chrome / Edge Extension giúp **xem ngẫu nhiên các video bạn đã thích (Liked)** trên TikTok với cơ chế **chuyển video tự động (Auto-Next)**, chống chuyển nhầm sang luồng gợi ý của TikTok, tự động bỏ qua video đứng/không âm thanh/TikTok Shop, và tự khôi phục khi gặp lỗi 403 / Access Denied.

---

## ✨ Tính năng nổi bật

- 🎲 **Random Video Đã Like** — Mở & xem ngẫu nhiên video từ danh sách đã thích lưu trong bộ nhớ tạm (cache).
- ⏭️ **Bỏ qua (Skip)** — Bỏ qua video hiện tại và mở ngay video ngẫu nhiên tiếp theo.
- 🚫 **Xoá vĩnh viễn (Permanent Ban / Blacklist)** — Xoá video hiện tại khỏi danh sách xem và thêm vào "Danh sách đen" (Blacklist) để không bao giờ thu thập lại ở những lần quét sau.
- 🔀 **Tự chuyển video (Auto-Next Engine)** — Khi video sắp phát xong (còn < 0.5s), extension tự động chọn và phát video ngẫu nhiên tiếp theo.
- 🛡️ **Bảo vệ vòng lặp (Loop Guard)** — Ép thuộc tính `loop` trên `<video>` để chặn TikTok tự nhảy sang luồng video gợi ý không mong muốn.
- 📤/📥 **Xuất & Nhập Sao lưu (Export / Import Backup)** — Tải về file `.json` chứa toàn bộ video và danh sách đen để khôi phục nhanh mà không cần quét lại từ đầu.
- 🤖 **Tự động xử lý sự cố (Auto-Recovery & Anti-403)**:
  - Tự nhảy video nếu video bị đứng quá 8 giây.
  - Tự nhảy video nếu phát hiện video bị tắt tiếng (Muted / No Audio).
  - Tự nhảy video nếu gặp video quảng cáo TikTok Shop.
  - Tự chuyển ngẫu nhiên video mới nếu gặp lỗi 403 Access Denied, Cloudflare hoặc trang trắng.
- 🔄 **Chạy ẩn nền (Background Playback)** — Vượt qua cơ chế Pause khi chuyển tab của TikTok nhờ bộ mô phỏng hành vi 6 lớp (Visibility, Focus, Activity Simulation, Telemetry Block).
- ⌨️ **Phím tắt toàn cục (Global Shortcut)** — Nhấn `Ctrl+Shift+9` (hoặc `Cmd+Shift+9` trên Mac) để bỏ qua video bất kỳ lúc nào.

---

## 📂 Cấu trúc dự án (Project Structure)

```
Random-Video/
├── manifest.json              # Chrome Extension Manifest V3
├── background.js              # Service Worker: Quản lý tab, routing, storage, 403 watchdog
├── popup.html                 # Giao diện điều khiển Popup
├── popup.js                   # Xử lý sự kiện giao diện Popup & truyền tin nhắn
├── style.css                  # Style giao diện Popup (Dark mode, glassmorphism)
├── content.js                 # Entry point của Content Script (SPA observer & message router)
├── icons/
│   └── icon.png               # Icon của Extension
├── js/
│   ├── selectors.js           # Centralized DOM Selectors & Từ khóa phát hiện tiếng/shop
│   ├── content-utils.js       # Helper trích xuất thumbnail, DOM scraping
│   ├── content-video.js       # Auto-next engine, Video Watcher, 6-Layer Anti-Detection
│   └── content-core.js        # Động cơ cuộn trang & thu thập danh sách video
└── docs/
    ├── random-play-flow.md    # Tài liệu kỹ thuật chi tiết về luồng Random Play
    └── playback-debug-plan.md # Kế hoạch chẩn đoán log & telemetry sự cố phát video
```

---

## 🎮 Bảng điều khiển & Nút chức năng

| Nút / Thao tác | Chức năng |
|---|---|
| 🎲 **Random Video Đã Like** | Phát ngẫu nhiên 1 video từ danh sách cache. Nếu cache trống sẽ tự động điều hướng quét video. |
| ⏭️ **Bỏ qua** | Bỏ qua video đang xem và mở ngay video ngẫu nhiên tiếp theo. |
| 🚫 **Xoá vĩnh viễn** | Xoá video đang xem khỏi bộ nhớ và đưa vào Danh sách đen (không bao giờ thu thập lại). |
| 🔄 **Thu thập lại từ đầu** | Xoá bộ nhớ tạm hiện tại và thực hiện quét lại từ đầu trang cá nhân. |
| ➕ **Thu thập thêm video** | Cuộn quét bổ sung các video mới mà vẫn giữ nguyên các video đã lưu. |
| 📤 **Xuất Backup** | Tải về file sao lưu `.json` chứa danh sách video và danh sách đen. |
| 📥 **Nhập Backup** | Khôi phục danh sách video từ file sao lưu `.json` có sẵn. |
| 🔀 **Tự chuyển video** (Toggle) | Bật/Tắt chế độ tự động nhảy video ngẫu nhiên tiếp theo khi hết bài. |

---

## ⚙️ Cơ chế hoạt động kỹ thuật

### 1. Luồng Thu thập (Collection Engine)
1. Điều hướng tab TikTok đến trang `@username`.
2. Tự động click tab **Đã thích (Liked)**.
3. Sử dụng `MutationObserver` kết hợp tự động cuộn (Auto-scroll) để trigger lazy-load của TikTok.
4. Lọc bỏ các URL đã có trong `blacklistedVideos` (Danh sách đen).
5. Lưu danh sách vào `chrome.storage.local`.

### 2. Luồng Phát & Tự nhảy Video (Auto-Next Engine)
1. `initVideoWatcher()` tìm thẻ `<video>` lớn nhất trên trang `/video/`.
2. Gắn thuộc tính `loop` để vô hiệu hoá tính năng tự nhảy bài gợi ý của TikTok.
3. Theo dõi sự kiện `timeupdate`: khi thời gian còn lại `< 0.5s`, gỡ `loop`, tạm dừng video và gửi yêu cầu `playNext` tới Service Worker background.
4. `background.js` gọi `selectRandomVideo()` chọn video chưa phát, sau đó cập nhật URL bằng `chrome.tabs.update()`.

### 3. Bộ phòng vệ 6 lớp (6-Layer Anti-Detection & Recovery)
- **Layer 1 (Visibility Bypass)**: Ghi đè `document.hidden = false`, `visibilityState = "visible"`, chặn sự kiện `visibilitychange`.
- **Layer 2 (Focus Bypass)**: Ghi đè `document.hasFocus() = true`, chặn sự kiện `blur`, định kỳ phát sự kiện `focus` giả lập.
- **Layer 3 (Navigator Spoof)**: Spoof `navigator.webdriver = false`, giả lập danh sách `plugins` và `languages`.
- **Layer 4 (Human Simulation)**: Tự động giả lập `mousemove`, `pointermove`, `scroll` ngẫu nhiên.
- **Layer 5 (Telemetry Block)**: Chặn các request theo dõi hành vi bot (`/api/v1/report`, `slardar`, `mon.tiktokv.com`, `sendBeacon`).
- **Layer 6 (Error & 403 Recovery)**: Phát hiện trang trắng/403 Access Denied hoặc overlay lỗi và tự động chuyển video mới.

---

## 🚀 Hướng dẫn cài đặt

1. Tải về hoặc clone repository này về máy.
2. Mở trình duyệt **Chrome** hoặc **Edge**.
3. Truy cập địa chỉ:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Bật chế độ **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
5. Bấm **Load unpacked (Tải tiện ích đã giải nén)** → chọn thư mục của dự án này.
6. Icon extension ❤️ sẽ xuất hiện trên thanh công cụ trình duyệt.

---

## 📖 Hướng dẫn sử dụng

1. Đăng nhập vào **www.tiktok.com** trên trình duyệt.
2. Bấm vào biểu tượng **TikTok Random Liked** trên thanh công cụ.
3. Nhập ID TikTok của bạn (ví dụ: `@username`).
4. Bấm **"Random Video Đã Like 🎲"**.
5. Thưởng thức các video yêu thích ngẫu nhiên liên tục!

---

## 📝 Tài liệu tham khảo kỹ thuật

- [Random Play Flow Architecture](docs/random-play-flow.md)
- [Playback Diagnostic & Debug Plan](docs/playback-debug-plan.md)
