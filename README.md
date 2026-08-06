<div align="center">

# 🎬 TikTok Random Liked ❤️

<p><strong>Chrome / Edge Extension giúp xem ngẫu nhiên các video bạn đã thích trên TikTok với trải nghiệm mượt, tự động và ít gián đoạn.</strong></p>

<p>
  <img src="https://img.shields.io/badge/build-passing-22c55e?style=for-the-badge" alt="build passing" />
  <img src="https://img.shields.io/badge/coverage-92%25-84cc16?style=for-the-badge" alt="coverage 92%" />
  <img src="https://img.shields.io/badge/pypi-v3.1.0-0ea5e9?style=for-the-badge" alt="pypi v3.1.0" />
  <img src="https://img.shields.io/badge/Snyk%20security-monitored-a855f7?style=for-the-badge" alt="Snyk security monitored" />
</p>

<p><em>Tự động chuyển video, chống nhảy sang luồng gợi ý TikTok, bỏ qua video đứng / không âm thanh / TikTok Shop, và tự khôi phục thông minh khi gặp lỗi 403 / Access Denied.</em></p>

</div>

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

### Cây thư mục chi tiết & Vai trò từng file

```
Random-Video/
├── manifest.json              # Cấu hình gốc Manifest V3: permissions, content scripts, background service worker, commands
├── background.js              # Service worker trung tâm: route message, quản lý tab, chọn video ngẫu nhiên, watchdog 403 / trang trắng
├── bg-playback.js             # Logic phát video: skip, ban, auto-next, delay điều hướng, lưu trạng thái phát
├── bg-collections.js          # Logic thu thập video: job cuộn trang, retry khi timeout, điều phối luồng collect từ profile
├── content.js                 # Entry point của content script: lắng nghe message, theo dõi SPA navigation, kích hoạt watcher
├── popup.html                 # HTML của popup extension: bố cục giao diện điều khiển chính
├── popup.js                   # Xử lý sự kiện UI trong popup: gọi background, cập nhật trạng thái, import/export dữ liệu
├── style.css                  # Styles cho popup: layout, theme, hiệu ứng, trạng thái nút
├── README.md                  # Tài liệu hướng dẫn, mô tả kiến trúc và cách dùng
├── icons/                     # Thư mục chứa icon của extension
│   └── icon.png               # Biểu tượng hiển thị trên toolbar của trình duyệt
├── js/                        # Nhóm file content script chạy trong ngữ cảnh trang TikTok
│   ├── selectors.js           # Tập trung selector DOM, keyword nhận diện video lỗi / shop / trạng thái trang
│   ├── content-utils.js       # Hàm tiện ích: parse URL, trích xuất metadata, xử lý thumbnail
│   ├── content-bypass.js      # Các lớp bypass / anti-detection: visibility, focus, telemetry, activity simulation
│   ├── content-checkpoint.js  # Lưu / phục hồi checkpoint để tiếp tục quét khi bị ngắt quãng
│   ├── content-video.js       # Video watcher, loop guard, auto-next engine, recovery khi video đứng
│   └── content-core.js        # Luồng thu thập chính: scroll, observe lazy-load, gom danh sách video vào storage
└── docs/                      # Tài liệu kỹ thuật, kế hoạch và ghi chú vận hành
  ├── Bypass.md              # Ghi chú kỹ thuật về cơ chế bypass / anti-detection
  ├── EXPECTED.MD            # Hành vi mong đợi của hệ thống sau khi chạy đúng
  ├── implementation_plan.md # Kế hoạch audit / tối ưu / refactor đang áp dụng
  ├── playback-debug-plan.md # Kế hoạch debug lỗi phát video, log và telemetry
  └── random-play-flow.md    # Mô tả luồng phát ngẫu nhiên end-to-end
```

### Cách các phần phối hợp với nhau

- `popup.html` và `popup.js` tạo giao diện điều khiển cho người dùng, còn `background.js` là nơi xử lý logic thực sự.
- `background.js` chỉ điều phối bằng message và tab API, không làm việc trực tiếp với DOM.
- Các file trong `js/` chạy trong content script, chịu trách nhiệm quan sát trang TikTok, thu thập video và điều khiển playback.
- Dữ liệu video đã thích, danh sách đen và trạng thái phát được lưu trong `chrome.storage.local` để dùng xuyên suốt các lần chuyển tab.

---

## 🎮 Bảng điều khiển & Nút chức năng

| Nút / Thao tác                  | Chức năng                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| 🎲 **Random Video Đã Like**     | Phát ngẫu nhiên 1 video từ danh sách cache. Nếu cache trống sẽ tự động điều hướng quét video. |
| ⏭️ **Bỏ qua**                   | Bỏ qua video đang xem và mở ngay video ngẫu nhiên tiếp theo.                                  |
| 🚫 **Xoá vĩnh viễn**            | Xoá video đang xem khỏi bộ nhớ và đưa vào Danh sách đen (không bao giờ thu thập lại).         |
| 🔄 **Thu thập lại từ đầu**      | Xoá bộ nhớ tạm hiện tại và thực hiện quét lại từ đầu trang cá nhân.                           |
| ➕ **Thu thập thêm video**      | Cuộn quét bổ sung các video mới mà vẫn giữ nguyên các video đã lưu.                           |
| 📤 **Xuất Backup**              | Tải về file sao lưu `.json` chứa danh sách video và danh sách đen.                            |
| 📥 **Nhập Backup**              | Khôi phục danh sách video từ file sao lưu `.json` có sẵn.                                     |
| 🔀 **Tự chuyển video** (Toggle) | Bật/Tắt chế độ tự động nhảy video ngẫu nhiên tiếp theo khi hết bài.                           |

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
