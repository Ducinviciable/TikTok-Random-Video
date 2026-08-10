# TikTok Random Liked

Chrome Extension hỗ trợ **thu thập video từ danh sách TikTok đã thích** và **phát ngẫu nhiên các video đã thu thập**.

README này mô tả kiến trúc kỹ thuật, các engine chính, cơ chế điều khiển, giới hạn và recovery của extension.

---

## 1. Architecture

Extension được chia thành hai engine chính:

```text
┌──────────────────────┐
│       Popup UI       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────────────┐
│           Background / SW            │
│                                      │
│  Collection Job Manager              │
│  Playback Manager                   │
│  Tab / Error Watchdog                │
└─────────────┬────────────────────────┘
              │
       Chrome Message API
              │
      ┌───────┴────────┐
      ▼                ▼
┌──────────────┐ ┌──────────────────┐
│ Collection   │ │ Playback Engine  │
│ Content      │ │ Content Scripts  │
└──────────────┘ └──────────────────┘
```

### Collection Engine

Chịu trách nhiệm:

* Cuộn trang TikTok Liked.
* Phát hiện và thu thập URL video.
* Thu thập thumbnail.
* Theo dõi tiến trình.
* Dừng khi đạt điều kiện.
* Checkpoint dữ liệu.
* Cleanup DOM để giảm tải.
* Recovery khi tab hoặc content script gặp lỗi.

### Playback Engine

Chịu trách nhiệm:

* Chọn video ngẫu nhiên.
* Theo dõi trạng thái `<video>`.
* Tự động chuyển video.
* Bỏ qua video lỗi hoặc không phù hợp.
* Phục hồi video bị pause/stuck.
* Theo dõi trạng thái tab.

---

# 2. Collection Engine

## 2.1 Target Limit

Số lượng video cần thu thập được xác định bởi:

```text
targetLimit
```

Giá trị mặc định từ Popup là `100`.

Phiên collection kết thúc khi số lượng video mới thu thập đạt target:

```text
newCollectedCount >= targetLimit
```

Giới hạn số lần cuộn tối đa:

```text
maxScrolls = ceil(targetLimit / 10) + 15
```

Điều này giúp giới hạn thời gian chạy trong trường hợp trang không thể cung cấp thêm dữ liệu.

---

## 2.2 Collection Stopping Conditions

Collection Engine có nhiều điều kiện dừng độc lập.

### Smart Stop

Được sử dụng khi thực hiện **Quét video mới**.

```text
smartStop = true
```

Engine theo dõi các video đã tồn tại trong `existingUrlsSet`.

Nếu phát hiện video cũ trong **3 batch liên tiếp**, collection được kết thúc sớm.

Đối với chế độ **Quét tiếp**, `smartStop` được tắt để tiếp tục thu thập dữ liệu.

### No-New Detection

Theo dõi số lần cuộn nhưng không phát hiện video mới:

```text
noNewCount
```

Nếu:

```text
noNewCount >= 4
```

engine coi trang không còn dữ liệu mới và dừng collection.

### Scroll Height Detection

Theo dõi:

```text
scrollHeight
```

Nếu chiều cao trang không thay đổi trong 5 lần cuộn liên tiếp:

```text
sameHeightCount >= 5
```

engine kết luận đã chạm đáy hoặc trang không tiếp tục load dữ liệu.

---

# 3. Collection Performance

## 3.1 Dynamic Scroll Delay

Thời gian chờ giữa các lần scroll được điều chỉnh dựa trên trạng thái collection.

Khi số lượng video tăng:

| Điều kiện                  | Delay bổ sung |
| -------------------------- | ------------: |
| `collectedMap.size > 800`  |        +400ms |
| `collectedMap.size > 1500` |        +800ms |
| `collectedMap.size > 2500` |       +1500ms |

Nếu thumbnail chưa load kịp:

```text
missingThumbQueue.size > 5
```

thêm `600ms` delay và chuyển trạng thái sang:

```text
slow_network
```

---

## 3.2 DOM Rest

Sau mỗi 100 lần scroll:

```text
itemsSinceLastRest >= 100
```

engine tạm nghỉ:

```text
2500ms
```

Mục đích là giảm áp lực CPU/RAM trong các phiên collection dài.

---

## 3.3 DOM Cleanup

Khi số lượng video card trên DOM vượt quá:

```text
200 items
```

extension giữ lại khoảng:

```text
150 items
```

và loại bỏ các card cũ hơn.

Dữ liệu cần thiết như URL và thumbnail được lưu vào collection trước khi DOM cleanup thực hiện.

---

# 4. Checkpoint & Recovery

## 4.1 Checkpoint

Collection Engine lưu trạng thái tạm thời vào:

```text
chrome.storage.local
└── checkpoint
```

Checkpoint được cập nhật:

* Mỗi `10s`
* Hoặc khi có thêm `30` video mới.

Khi collection hoàn tất thành công:

```text
clearCheckpoint()
```

được gọi để xóa trạng thái tạm.

---

## 4.2 Final Sweep

Sau khi kết thúc collection, engine thực hiện một lần sweep cuối:

```text
scrollBy(0, -300)
```

Sau đó chờ:

```text
2000ms
```

để các thumbnail hoặc dữ liệu còn pending có cơ hội được load và thu thập.

---

# 5. Collection Job Manager

Background Service Worker chịu trách nhiệm điều phối collection job.

### Job Timeout

Mỗi collection job có timeout:

```text
20s
```

Nếu job không phản hồi đúng thời gian, background thực hiện retry bằng cách điều hướng tab về profile và chạy lại job.

### Content Script Health Check

Background gửi:

```text
ping
```

mỗi:

```text
2000ms
```

để kiểm tra content script còn hoạt động trước khi gửi command collection.

### Error Page Recovery

Các trạng thái như:

```text
403
Access Denied
Forbidden
```

được phát hiện từ title/tab state.

Background chờ:

```text
5000ms
```

sau đó điều hướng lại profile để recovery.

---

# 6. Playback Engine

Playback Engine sử dụng danh sách video đã collection để thực hiện random playback.

## 6.1 Auto Next

Trạng thái được lưu trong:

```text
chrome.storage.local
└── autoNextEnabled
```

Nếu:

```text
autoNextEnabled = false
```

extension không tự động chuyển sang video tiếp theo.

---

## 6.2 Video Loop Control

Extension theo dõi `<video>` element và quản lý thuộc tính:

```html
<video loop>
```

`MutationObserver` được sử dụng để phát hiện khi thuộc tính `loop` bị thay đổi và khôi phục trạng thái cần thiết.

Khi video gần kết thúc:

```text
duration - currentTime < 0.5s
```

engine:

1. Remove `loop`
2. Pause video
3. Gửi `playNext` tới Background
4. Background chọn video tiếp theo

Event `ended` được sử dụng như cơ chế fallback nếu `loop` bị mất.

---

# 7. Video Selection

Video được chọn thông qua:

```text
selectRandomVideo()
```

Các video bị loại khỏi candidate list:

* Video nằm trong `blacklistedVideos`
* Video hiện tại

Engine ưu tiên các video chưa xuất hiện trong:

```text
playedVideos
```

Khi toàn bộ danh sách đã được phát:

```text
playedVideos = []
```

được reset để bắt đầu một vòng playback mới.

---

# 8. Playback Throttling

Content script đảm bảo khoảng cách tối thiểu giữa hai lần request chuyển video:

```text
>= 2000ms
```

Background sử dụng delay ngẫu nhiên trước khi thực hiện một số thao tác chuyển video:

| Action     |         Delay |
| ---------- | ------------: |
| Auto next  | `1500–3500ms` |
| Skip       |  `800–2000ms` |
| Ban & next |  `500–1500ms` |

Mục đích chính là tránh các thao tác chuyển tiếp xảy ra liên tục và giúp playback flow ổn định hơn.

---

# 9. Video Error Detection

Playback Engine có nhiều lớp phát hiện lỗi.

## 9.1 Stuck Video

Video được kiểm tra định kỳ mỗi:

```text
1s
```

Nếu `currentTime` gần như không thay đổi trong:

```text
8s
```

engine coi video là stuck và chuyển sang video tiếp theo.

---

## 9.2 TikTok Shop / Muted Video

Sau khi video load khoảng:

```text
2500ms
```

extension kiểm tra các dấu hiệu:

* TikTok Shop
* Audio bị mute do vấn đề bản quyền
* Các keyword được cấu hình trong `MUTED_SOUND_KEYWORDS`

Nếu phát hiện, video sẽ được skip sau khoảng:

```text
2200ms
```

---

# 10. Playback Recovery

## Video Auto Resume

Extension kiểm tra video định kỳ:

```text
2000ms
```

Nếu video bị `paused` ngoài dự kiến, engine thử gọi:

```javascript
video.play()
```

để khôi phục playback.

## "Please Wait" Recovery

Kiểm tra overlay định kỳ:

```text
4000ms
```

Nếu trạng thái `"Please Wait"` tồn tại quá:

```text
12s
```

engine chuyển sang video khác thông qua SPA navigation.

## 403 / Blank Page

Nếu phát hiện:

```text
403
Access Denied
Blank Page
```

extension gửi event:

```text
handle403Detected
```

để thực hiện playback recovery.

---

# 11. Background Watchdog

Background Service Worker chạy watchdog định kỳ:

```text
3000ms
```

Watchdog theo dõi:

* Tab bị 403.
* Tab hiển thị trang trắng.
* Content script không phản hồi.
* Video tab không phản hồi trong thời gian cho phép.

Khi phát hiện trạng thái bất thường, background có thể khởi động lại playback bằng cách chọn video mới.

---

# 12. Background / Visibility Handling

Extension có một nhóm cơ chế nhằm duy trì trạng thái playback khi tab không ở foreground.

Các lớp hiện có:

### Layer 1 — Visibility

Theo dõi và xử lý:

```text
document.hidden
document.visibilityState
visibilitychange
```

### Layer 2 — Focus

Theo dõi:

```text
document.hasFocus()
blur
focus
```

và thực hiện các hành vi resume cần thiết.

### Layer 3 — Navigator State

Điều chỉnh một số thuộc tính navigator được sử dụng để xác định môi trường trình duyệt.

### Web Audio Keep-Alive

Sử dụng một `AudioContext` với gain rất thấp nhằm duy trì hoạt động của browser process trong một số trường hợp tab chạy nền.

### Layer 4 — Activity Simulation

Tạo các hoạt động trình duyệt định kỳ như:

```text
mousemove
pointermove
scroll
```

với khoảng thời gian không cố định.

### Layer 5 — Telemetry Handling

Theo dõi các request telemetry liên quan đến các endpoint được cấu hình trong extension.

Các cơ chế này được triển khai trong:

```text
js/content-bypass.js
```

---

# 13. Storage

Các trạng thái chính được lưu trong:

```text
chrome.storage.local
```

| Key                 | Purpose                        |
| ------------------- | ------------------------------ |
| `likedVideos`       | Danh sách video đã thu thập    |
| `playedVideos`      | Video đã phát                  |
| `blacklistedVideos` | Video bị loại                  |
| `checkpoint`        | Trạng thái collection tạm thời |
| `autoNextEnabled`   | Trạng thái auto next           |

---

# 14. Main Parameters

| Parameter           |                 Giá trị | Vai trò                        |
| ------------------- | ----------------------: | ------------------------------ |
| `targetLimit`       |          `100` mặc định | Số video mục tiêu              |
| `maxScrolls`        | `ceil(limit / 10) + 15` | Giới hạn scroll                |
| `noNewCount`        |                     `4` | Dừng khi không có video mới    |
| `sameHeightCount`   |                     `5` | Dừng khi page height không đổi |
| `smartStop`         |            `true/false` | Dừng khi gặp dữ liệu cũ        |
| Checkpoint interval |                   `10s` | Lưu progress                   |
| Checkpoint batch    |             `30 videos` | Lưu progress                   |
| DOM rest            |           `100 scrolls` | Nghỉ giảm tải                  |
| DOM rest delay      |                `2500ms` | Thời gian nghỉ                 |
| Collection timeout  |                   `20s` | Job timeout                    |
| Ping interval       |                `2000ms` | Health check                   |
| Stuck timeout       |                    `8s` | Phát hiện video đứng           |
| Watchdog interval   |                `3000ms` | Giám sát playback              |

---

# 15. High-Level Flow

## Collection

```text
User
 │
 ▼
Popup
 │
 ▼
Start Collection
 │
 ▼
Background Job Manager
 │
 ▼
Content Script
 │
 ├── Scan video cards
 ├── Extract URL
 ├── Extract thumbnail
 ├── Save collection
 ├── Check stopping conditions
 ├── Cleanup DOM
 └── Save checkpoint
 │
 ▼
Final Sweep
 │
 ▼
Collection Completed
```

## Playback

```text
User
 │
 ▼
Playback Request
 │
 ▼
Background
 │
 ├── Filter blacklist
 ├── Filter current video
 ├── Filter played videos
 └── Select random video
 │
 ▼
Random Delay
 │
 ▼
TikTok SPA Navigation
 │
 ▼
Content Video Controller
 │
 ├── Monitor video
 ├── Resume playback
 ├── Detect stuck
 ├── Detect invalid video
 └── Detect end
 │
 ▼
playNext
 │
 └──────────────► Background
```

---

# 16. Source Structure

Các module chính liên quan đến hai engine:

```text
popup.js
│
├── User controls
└── Collection configuration

background.js
│
├── Global watchdog
└── Background coordination

bg-collections.js
│
└── Collection Job Manager

bg-playback.js
│
└── Playback Manager

content.js
│
└── Playback messaging / page integration

js/
├── content-core.js
│   └── Collection engine
│
├── content-checkpoint.js
│   └── Checkpoint / DOM cleanup / final sweep
│
├── content-video.js
│   └── Video monitoring / playback recovery
│
└── content-bypass.js
    └── Background / visibility handling
```

---

# 17. Design Principles

Extension được xây dựng xoay quanh các nguyên tắc:

1. **Collection có giới hạn** — luôn có target và nhiều stopping criteria.
2. **Không phụ thuộc một điều kiện dừng duy nhất** — sử dụng nhiều tín hiệu để tránh collection chạy vô hạn.
3. **Progress có thể phục hồi** — checkpoint giúp hạn chế mất dữ liệu khi job bị gián đoạn.
4. **DOM được kiểm soát** — tránh giữ quá nhiều video card trong DOM.
5. **Playback có watchdog** — video và tab đều được giám sát.
6. **Error recovery tự động** — các trạng thái stuck, 403, blank page và loading bất thường đều có hướng xử lý.
7. **Playback không lặp video trong cùng một cycle** — sử dụng `playedVideos` để quản lý vòng phát.
8. **Background chịu trách nhiệm điều phối** — content script tập trung xử lý logic trực tiếp trên trang.

---

## 18. Summary

Có thể xem hệ thống gồm hai pipeline độc lập nhưng liên kết với nhau:

```text
TikTok Liked
     │
     ▼
┌───────────────┐
│ Collection    │
│ Engine        │
└───────┬───────┘
        │
        ▼
 likedVideos
        │
        ▼
┌───────────────┐
│ Playback      │
│ Engine        │
└───────┬───────┘
        │
        ▼
 Random Playback
        │
        ▼
 Recovery / Watchdog
```

**Collection Engine** tối ưu cho việc thu thập dữ liệu có kiểm soát và có khả năng tiếp tục/recovery.

**Playback Engine** tối ưu cho việc lựa chọn, phát, chuyển tiếp và phục hồi video trong quá trình chạy extension.
