# 🎬 TikTok Random Liked ❤️ (v3.5.1)

Extension Chrome/Edge cao cấp giúp bạn **thưởng thức ngẫu nhiên kho video đã Like trên TikTok** với hai chế độ trải nghiệm: **Tự động chuyển video trên tab TikTok** hoặc **Trình phát độc lập TikTok Hi-Fi Studio**.

<p>
  <img src="https://img.shields.io/badge/Manifest-V3-22c55e?style=for-the-badge&logo=googlechrome" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/version-v3.5.1-0ea5e9?style=for-the-badge" alt="version v3.5.1" />
  <img src="https://img.shields.io/badge/Web%20Audio-Hi--Fi%20DSP-a855f7?style=for-the-badge" alt="Web Audio DSP" />
  <img src="https://img.shields.io/badge/Anti--Bot-WAF%20Safe-f59e0b?style=for-the-badge" alt="Anti-Bot WAF Safe" />
</p>

---

## 🌟 Hai Chế Độ Trải Nghiệm Đỉnh Cao

### 1. 🎧 TikTok Hi-Fi Studio (Trình phát chuyên dụng độc lập)
* **Phát ngầm không cần mở tab TikTok**: Tiết kiệm 95% CPU/RAM, triệt tiêu 100% nguy cơ gặp WAF 403 & Captcha.
* **Bộ xử lý âm thanh Web Audio DSP**:
  * **10-Band Graphic Equalizer**: Tinh chỉnh 10 dải tần từ `32Hz` đến `16kHz` với các preset (*Flat, Bass Boost, Vocal, Electronic, Lofi*).
  * **Deep Bass Booster**: Tăng cường dải trầm LowShelf (100Hz) lên tới `+12dB`.
  * **Volume Normalizer (DynamicsCompressor)**: Cân bằng tự động sự chênh lệch âm lượng giữa các video.
  * **Volume Booster 300%**: Khuếch đại tối đa âm lượng cho những video ghi âm quá nhỏ.
* **Dual-Buffer Crossfade (A/B)**: Tự động nạp trước bài tiếp theo ở 85% thời lượng và chuyển bài mượt mà không khoảng lặng (Fade 2.5s).
* **Live Visualizer**: Đồ thị sóng âm Spectrum FFT 32 cột và animation Đĩa than Vinyl xoay theo beat.
* **Kéo thả JSON Backup**: Hỗ trợ trực tiếp file backup JSON v3.1 chứa kho 3.000+ video.

### 2. 🎬 TikTok Web Controller (Duyệt trực tiếp trên TikTok)
* **Auto-Next thông minh**: Tự động chuyển ngẫu nhiên video tiếp theo khi video hiện tại kết thúc qua SPA Navigation.
* **Bộ lọc nội dung rác**: Tự động phát hiện và bỏ qua video TikTok Shop/Quảng cáo, video bị gỡ âm thanh hoặc vi phạm bản quyền.
* **Bảo vệ chống trôi Feed**: Giữ thuộc tính `loop` để ngăn thuật toán TikTok tự nhảy sang luồng video gợi ý.
* **Phục hồi mềm đa tầng (Phase A–D)**: Tự động xử lý khi gặp popup *"Please Wait"*, video kẹt 6 giây hoặc lỗi 403 mà không cần reload trang.

---

## ✨ Tính Năng Chính

* 🎲 **Random Video Đã Like** — Chọn ngẫu nhiên không lặp lại video từ kho đã like.
* 🎧 **TikTok Hi-Fi Studio** — Mở không gian thưởng thức âm nhạc chuyên dụng.
* ⏭️ **Bỏ qua (Skip)** — Chuyển ngay sang video ngẫu nhiên khác.
* 🚫 **Xóa vĩnh viễn (Ban/Blacklist)** — Xóa video khỏi danh sách và cấm vĩnh viễn không thu thập lại.
* ⚡ **Cập nhật video mới (Smart Stop)** — Quét nhanh các video mới thích gần đây và tự dừng khi gặp video cũ.
* 📜 **Quét tiếp video cũ (Deep Append)** — Bắt kịp siêu tốc qua video cũ (Catch-Up Phase) để quét sâu lấy thêm video cũ hơn.
* 🔄 **Thu thập lại từ đầu** — Xóa cache cũ và quét lại toàn bộ danh sách.
* 💾 **Hệ thống Checkpoint** — Tự động lưu tiến trình quét, chống mất dữ liệu khi gián đoạn.
* 📤 **Xuất Backup (.json)** — Sao lưu bền vững danh sách video (Canonical URL) và Blacklist.
* 📥 **Nhập Backup (.json)** — Khôi phục kho video 3.000+ tức thì không cần quét lại từ đầu.

---

## 🚀 Cài Đặt

### 1. Tải Extension
Clone hoặc tải mã nguồn về máy:
```bash
git clone https://github.com/Ducinviciable/tiktok-random-video.git
```

### 2. Cài đặt vào Chrome / Edge / Brave
1. Mở trang quản lý Extension:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
2. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Nhấn **Load unpacked (Tải tiện ích đã giải nén)** và chọn thư mục `TikTok-Random-Liked`.
4. Ghim extension lên thanh công cụ trình duyệt.

---

## 🎮 Hướng Dẫn Sử Dụng

### Cách 1: Thưởng thức qua TikTok Hi-Fi Studio 🎧
1. Bấm vào icon extension trên thanh công cụ.
2. Nhấn nút **TikTok Hi-Fi Studio 🎧✨**.
3. Kéo thả file JSON backup vào khung nạp hoặc chọn bài từ danh sách để bắt đầu nghe nhạc chất lượng cao.

### Cách 2: Lướt ngẫu nhiên trên trang web TikTok 🎬
1. Đăng nhập tài khoản TikTok của bạn trên trình duyệt.
2. Mở popup extension, nhập Username của bạn (ví dụ: `@username`).
3. Chọn số lượng video cần quét (mặc định: `100`).
4. Nhấn **Random Video Đã Like 🎲**:
   - Nếu chưa có dữ liệu: Extension tự chuyển đến tab Liked để quét.
   - Nếu đã có dữ liệu: Tự động mở video ngẫu nhiên và tự chuyển bài khi xem xong.

---

## ⌨️ Bảng Phím Tắt

### Khi đang xem trên TikTok Web
| Phím tắt | Hệ điều hành | Chức năng |
| :--- | :--- | :--- |
| `Ctrl + Shift + 9` | Windows / Linux | Bỏ qua & xóa vĩnh viễn video hiện tại |
| `Cmd + Shift + 9` | macOS | Bỏ qua & xóa vĩnh viễn video hiện tại |

### Khi đang dùng TikTok Hi-Fi Studio
| Phím tắt | Chức năng |
| :--- | :--- |
| `Space` | Phát / Tạm dừng (Play / Pause) |
| `N` | Chuyển bài tiếp theo (Next Track) |
| `P` | Quay lại bài trước (Previous Track) |
| `M` | Bật / Tắt tiếng (Mute / Unmute) |
| `↑` / `↓` | Tăng / Giảm âm lượng $\pm 5\%$ |
| `←` / `→` | Tua lùi / Tua nhanh $\pm 5\text{s}$ |

---

## 📁 Cấu Trúc Dự Án

```text
TikTok-Random-Liked/
├── manifest.json                  # Manifest V3 Configuration
├── background.js                  # Service Worker Router & Event Dispatcher
├── content.js                     # Content Script Entry Point
├── player.html                    # Giao diện TikTok Hi-Fi Studio độc lập
├── style-player.css               # Hệ thống Style Glassmorphism & Audio Animations
├── popup.html                     # Giao diện Popup điều khiển
├── popup.js                       # Logic điều khiển Popup chính
├── style.css                      # Style giao diện Popup
├── icons/                         # Bộ Icon nhận diện (16px, 48px, 128px)
├── js/
│   ├── background/
│   │   ├── bg-playback.js         # Quản lý điều hướng ngẫu nhiên & SPA Navigation
│   │   ├── bg-collections.js      # Điều phối chu trình cuộn & thu thập Liked
│   │   ├── bg-storage.js          # Quản lý Cache, Checkpoint, Export/Import
│   │   ├── bg-recovery.js         # Phục hồi lỗi 403 & Watchdog giám sát tab
│   │   └── bg-player.js           # JIT Silent Fetch Engine & DNR Header Isolator
│   ├── player/
│   │   ├── player-app.js          # Khởi tạo giao diện, Queue, Drag-Drop JSON v3.1
│   │   ├── player-audio.js        # Web Audio DSP, 10-Band EQ, Bass Boost, Crossfade
│   │   └── player-cdn-refresh.js  # JIT Caching & Client-side Stream Refresh
│   ├── popup/
│   │   ├── popup-api.js           # Giao tiếp tin nhắn giữa Popup và Background
│   │   ├── popup-list.js          # Render danh sách video có thumbnail trong popup
│   │   └── popup-backup.js        # Logic Xuất/Nhập file JSON sao lưu
│   └── content/
│       ├── crawler/               # Quét DOM, Checkpoint & Cuộn tự động
│       ├── stealth/               # Đánh chặn telemetry, Anti-debugging & Chống ẩn danh
│       ├── behavior/              # Giả lập hành vi chuột Human-like & Micro-scroll
│       └── video/                 # Giám sát Playback, Loop Guardian, Soft Recovery
└── docs/                          # Tài liệu kỹ thuật, sơ đồ luồng & hướng dẫn chi tiết
```

---

## 🛡️ Nguyên Tắc An Toàn & Bảo Mật
**Bảo mật dữ liệu cục bộ**: Dữ liệu video và danh sách đen được lưu trữ 100% trong trình duyệt của bạn (`chrome.storage.local`), không gửi về bất kỳ máy chủ bên thứ ba nào.

---

## 📜 Giấy Phép & Đóng Góp

Dự án được phát triển dưới sự định hướng **Ổn định - An toàn - Trải nghiệm Âm thanh Hi-Fi**. Mọi đóng góp và phản hồi vui lòng tạo Issue hoặc Pull Request trên repository.

> **Collect → Random → Listen & Watch → Repeat 🎵❤️**
