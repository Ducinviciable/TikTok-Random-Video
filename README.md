# 🎬 TikTok Random Liked ❤️

Extension Chrome/Edge giúp bạn **xem video ngẫu nhiên các video đã Like trên TikTok**.

Thay vì phải mở từng video trong danh sách đã thích, extension sẽ tự động thu thập video, chọn ngẫu nhiên và chuyển sang video tiếp theo.

<p>
  <img src="https://img.shields.io/badge/build-passing-22c55e?style=for-the-badge" alt="build passing" />
  <img src="https://img.shields.io/badge/coverage-92%25-84cc16?style=for-the-badge" alt="coverage 92%" />
  <img src="https://img.shields.io/badge/pypi-v3.1.0-0ea5e9?style=for-the-badge" alt="pypi v3.1.0" />
  <img src="https://img.shields.io/badge/Snyk%20security-monitored-a855f7?style=for-the-badge" alt="Snyk security monitored" />
</p>

---

## ✨ Tính năng

* 🎲 **Random Video Đã Like** — Phát ngẫu nhiên video từ danh sách đã thu thập.
* ⏭️ **Skip** — Bỏ qua video hiện tại và chuyển sang video khác.
* 🚫 **Blacklist** — Xóa video hiện tại và không thu thập lại video đó.
* 🔀 **Auto Next** — Tự động chuyển sang video ngẫu nhiên tiếp theo khi video kết thúc.
* ➕ **Thu thập thêm** — Quét thêm video mà không xóa dữ liệu hiện có.
* 🔄 **Thu thập lại** — Xóa dữ liệu video hiện tại và quét lại từ đầu.
* 📤 **Export** — Xuất danh sách video thành file `.json`.
* 📥 **Import** — Khôi phục danh sách video từ file backup.
* 🛠️ **Auto Recovery** — Tự xử lý một số trường hợp video lỗi, đứng hoặc không thể phát.

---

## 🚀 Cài đặt

### 1. Tải project

Clone repository hoặc tải project về máy.

### 2. Mở Extension

**Chrome:**

```text
chrome://extensions/
```

**Edge:**

```text
edge://extensions/
```

### 3. Bật Developer Mode

Bật **Developer mode** → chọn **Load unpacked** → chọn thư mục project.

Sau khi cài đặt, icon **TikTok Random Liked ❤️** sẽ xuất hiện trên trình duyệt.

---

## 🎮 Cách sử dụng

### Bước 1 — Đăng nhập TikTok

Đăng nhập tài khoản TikTok của bạn trên Chrome/Edge.

### Bước 2 — Mở Extension

Nhấn icon **TikTok Random Liked ❤️**.

### Bước 3 — Nhập tài khoản

Nhập username TikTok, ví dụ:

```text
@username
```

### Bước 4 — Thu thập video

Nếu chưa có dữ liệu, extension sẽ tự động vào danh sách **Liked** và thu thập video.

Bạn có thể:

* **Thu thập lại** → quét lại từ đầu.
* **Thu thập thêm** → giữ video cũ và tìm thêm video mới.

### Bước 5 — Random

Nhấn:

> 🎲 **Random Video Đã Like**

Extension sẽ chọn một video ngẫu nhiên từ danh sách đã thu thập.

---

## 🎛️ Các nút chức năng

| Chức năng       | Mô tả                            |
| --------------- | -------------------------------- |
| 🎲 Random       | Phát một video Like ngẫu nhiên   |
| ⏭️ Skip         | Bỏ qua video hiện tại            |
| 🚫 Xóa vĩnh viễn| Xóa và không thu thập lại video  |
| ➕ Thu thập thêm | Tìm thêm video mới               |
| 🔄 Thu thập lại | Xóa dữ liệu hiện tại và quét lại |
| 📤 Export       | Sao lưu dữ liệu thành `.json`    |
| 📥 Import       | Khôi phục dữ liệu từ `.json`     |
| 🔀 Auto Next    | Tự động chuyển video tiếp theo   |

---

## 💾 Dữ liệu

Extension lưu dữ liệu cục bộ trong trình duyệt, bao gồm:

* Danh sách video đã thu thập.
* Danh sách video đã phát.
* Danh sách Blacklist.
* Trạng thái của quá trình thu thập.

Dữ liệu **không cần phải thu thập lại mỗi lần mở extension**.

### 💡 Nên Export Backup

Nếu bạn đã thu thập nhiều video, nên sử dụng **Export** để tạo file backup.

Khi cần khôi phục, chỉ cần sử dụng **Import**.

---

## ⌨️ Phím tắt

Bạn có thể sử dụng:

```text
Ctrl + Shift + 9
```

để **Skip video hiện tại**.

Trên macOS:

```text
Cmd + Shift + 9
```

---

## 📁 Cấu trúc project

```text
TikTok-Random-Liked/
├── manifest.json
├── background.js
├── bg-playback.js
├── bg-collections.js
├── content.js
├── popup.html
├── popup.js
├── style.css
├── icons/
├── js/
└── docs/
```

---

## ⚠️ Lưu ý

* Extension yêu cầu bạn **đăng nhập TikTok** trên trình duyệt.
* Extension hoạt động dựa trên giao diện và hành vi hiện tại của TikTok. Nếu TikTok thay đổi giao diện hoặc API nội bộ, một số chức năng có thể cần cập nhật.
* Nên **Export Backup** trước khi thực hiện các thao tác thu thập lại hoặc thay đổi dữ liệu lớn.

---

## ❤️ Mục đích

**TikTok Random Liked** được tạo để giúp việc xem lại những video bạn đã Like trở nên đơn giản hơn:

> **Collect → Random → Watch → Skip → Repeat 🎬**
