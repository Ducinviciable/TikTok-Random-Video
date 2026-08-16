# Kế hoạch Ghi nhận Nhật ký Chẩn đoán Lỗi Treo phát Video trong Tab Chạy nền

Tài liệu này cung cấp kế hoạch chẩn đoán kỹ thuật nhằm xác định lý do tại sao một video TikTok được mở ngẫu nhiên đôi khi bị kẹt (stalls/freezes) trong một tab chạy nền (tab không được chọn) cho đến khi người dùng chủ động focus/kích hoạt tab đó theo cách thủ công.

---

## 1. Phân tích vấn đề & Mục tiêu Chẩn đoán

Khi Chrome hoặc Edge điều hướng đến một video TikTok mới trong một tab chạy nền (không được focus):
1.  **Browser Resource Throttling (Giới hạn tài nguyên trình duyệt)**: Chromium chủ động hạn chế các bộ hẹn giờ (`setInterval` / `setTimeout` bị trễ đến hơn 1000ms), tạm dừng giải mã đa phương tiện (media decoding), và làm chậm quá trình khởi tạo audio context đối với các tab chạy nền.
2.  **Chính sách chạy nền của TikTok Web Player**: Script trình phát web của TikTok thực hiện kiểm tra `document.hidden`, `document.visibilityState`, và `document.hasFocus()`. Nếu các thuộc tính này trả về false, TikTok sẽ tạm dừng hoặc trì hoãn việc tải bộ đệm luồng dữ liệu video (buffering media streams).
3.  **Trạng thái sẵn sàng của Media Pipeline**: Thẻ HTML5 `<video>` có thể bị kẹt ở trạng thái `readyState = 1` (`HAVE_METADATA`) hoặc `readyState = 2` (`HAVE_CURRENT_DATA`) cho đến khi tab được focus trở lại.

### Mục tiêu chẩn đoán
Bằng cách chèn các bản ghi nhật ký (logs) đo lường có cấu trúc tại các điểm kiểm tra thực thi quan trọng, chúng ta có thể xác định:
- Thẻ video có được tìm thấy nhưng bị kẹt ở trạng thái `paused = true` hay không.
- Việc tải bộ đệm mạng có bị tạm dừng hay không (`networkState = 2` hoặc `3`, `buffered = []`).
- Trình trạng giới hạn chạy nền của Chromium có đang ngăn chặn việc gọi hàm phục hồi Layer 6 `v.play()` hoặc thực thi `setInterval` hay không.
- Các cơ chế ghi đè `document.visibilityState` / `hasFocus()` có đang hoạt động thành công tại thời điểm xảy ra sự cố hay không.

---

## 2. Hàm Trợ giúp Ghi nhật ký Chẩn đoán Chuẩn hóa

Để đảm bảo tính nhất quán giữa tất cả các điểm ghi log, hãy sử dụng hàm bổ trợ sau:

```javascript
function logPlaybackDiagnostics(tag, video) {
    var bufferedRanges = [];
    if (video && video.buffered) {
        for (var i = 0; i < video.buffered.length; i++) {
            bufferedRanges.push([
                video.buffered.start(i).toFixed(2),
                video.buffered.end(i).toFixed(2)
            ]);
        }
    }

    console.log(
        `[PLAYBACK-DEBUG] [${tag}] ` +
        `t=${performance.now().toFixed(2)}ms | ` +
        `doc.hidden=${document.hidden} | ` +
        `doc.visState=${document.visibilityState} | ` +
        `doc.hasFocus=${typeof document.hasFocus === "function" ? document.hasFocus() : "N/A"} | ` +
        `v.readyState=${video ? video.readyState : "N/A"} | ` +
        `v.netState=${video ? video.networkState : "N/A"} | ` +
        `v.paused=${video ? video.paused : "N/A"} | ` +
        `v.currentTime=${video ? video.currentTime.toFixed(2) : "N/A"} | ` +
        `v.duration=${video ? (isNaN(video.duration) ? "NaN" : video.duration.toFixed(2)) : "N/A"} | ` +
        `v.buffered=${JSON.stringify(bufferedRanges)}`
    );
}
```

---

## 3. Các Điểm Chèn Nhật ký Khuyến nghị

### Điểm 1: Phát hiện & Liên kết Phần tử Video Ban đầu
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Hàm:** `watchForVideoElement()`
* **Vị trí:** Ngay sau khi gán biến `currentVideoElement = targetVideo;`.
* **Mục đích:** Xác minh trạng thái DOM, trạng thái bộ đệm (buffer) và các thuộc tính visibility chính xác tại thời điểm thẻ `<video>` được phát hiện bởi extension.

#### Đoạn code cần chèn:
```javascript
// Bên trong watchForVideoElement() sau khi targetVideo được chọn:
currentVideoElement = targetVideo;
logPlaybackDiagnostics("VIDEO_BOUND", currentVideoElement);
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [VIDEO_BOUND] t=1420.50ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=1 | v.netState=2 | v.paused=true | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","1.20"]]
```

---

### Điểm 2: Trình lắng nghe sự kiện HTML5 Media (`playing`, `pause`, `waiting`, `stalled`, `canplay`)
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Hàm:** `watchForVideoElement()`
* **Vị trí:** Bên trong `watchForVideoElement()`, đăng ký các sự kiện lắng nghe trực tiếp trên `currentVideoElement`.
* **Mục đích:** Theo dõi chính xác các thay đổi trạng thái phát video gốc (ví dụ: trình duyệt có kích hoạt sự kiện `waiting` hoặc `stalled` khi quá trình nạp bộ đệm của tab chạy nền bị dừng lại hay không).

#### Đoạn code cần chèn:
```javascript
// Bên trong watchForVideoElement() sau khi đăng ký timeupdate / ended:
["playing", "pause", "waiting", "stalled", "canplay", "canplaythrough"].forEach(function(evtName) {
    currentVideoElement.addEventListener(evtName, function() {
        logPlaybackDiagnostics("EVENT_" + evtName.toUpperCase(), currentVideoElement);
    });
});
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [EVENT_WAITING] t=2150.80ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=2 | v.netState=2 | v.paused=false | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","0.50"]]
[PLAYBACK-DEBUG] [EVENT_STALLED] t=4150.10ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=2 | v.netState=2 | v.paused=false | v.currentTime=0.00 | v.duration=15.40 | v.buffered=[["0.00","0.50"]]
```

---

### Điểm 3: Chu kỳ Tự động Phục hồi Playback của Layer 6
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Hàm:** `initPlaybackRecovery()`
* **Vị trí:** Bên trong vòng lặp `setInterval` phục hồi chu kỳ 1.5 giây khi `v.paused === true`.
* **Mục đích:** Xác định xem lệnh `v.play().catch()` có đang được thực thi tích cực hay bộ định thời `setInterval` đã bị đóng băng hoàn toàn bởi cơ chế tiết kiệm tài nguyên của trình duyệt.

#### Đoạn code cần chèn:
```javascript
// Bên trong vòng lặp setInterval của initPlaybackRecovery():
if (v.paused && v.src && v.duration && v.duration > 0 && !v.ended) {
    logPlaybackDiagnostics("LAYER6_RECOVERY_ATTEMPT", v);
    v.play().then(function() {
        logPlaybackDiagnostics("LAYER6_PLAY_SUCCESS", v);
    }).catch(function(err) {
        console.warn("[PLAYBACK-DEBUG] [LAYER6_PLAY_ERROR]", err.message);
        logPlaybackDiagnostics("LAYER6_PLAY_FAILED", v);
    });
}
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [LAYER6_RECOVERY_ATTEMPT] t=3500.00ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=1 | v.netState=2 | v.paused=true | v.currentTime=0.00 | v.duration=12.10 | v.buffered=[]
[PLAYBACK-DEBUG] [LAYER6_PLAY_FAILED] NotAllowedError: play() failed because the user didn't interact with the document first.
```

---

### Điểm 4: Chu kỳ Giám sát Video Bị Kẹt (Stuck) 6 Giây
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Hàm:** `startStuckMonitor()`
* **Vị trí:** Bên trong vòng lặp `stuckInterval` 1 giây khi `stuckSeconds > 0`.
* **Mục đích:** Theo dõi xem video phát có bị đóng băng tại một dấu thời gian `currentTime` cụ thể hay không và theo dõi cách biến `stuckSeconds` tăng dần theo thời gian.

#### Đoạn code cần chèn:
```javascript
// Bên trong bộ hẹn giờ startStuckMonitor() khi Math.abs(currentTime - lastVideoTime) < 0.05:
if (stuckSeconds > 0) {
    logPlaybackDiagnostics("STUCK_MONITOR_TICK_" + stuckSeconds + "S", video);
}
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [STUCK_MONITOR_TICK_1S] t=5010.20ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=3 | v.netState=2 | v.paused=false | v.currentTime=2.14 | v.duration=20.00 | v.buffered=[["0.00","2.14"]]
[PLAYBACK-DEBUG] [STUCK_MONITOR_TICK_2S] t=6015.40ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=3 | v.netState=2 | v.paused=false | v.currentTime=2.14 | v.duration=20.00 | v.buffered=[["0.00","2.14"]]
```

---

### Điểm 5: Kiểm tra Âm thanh & Nhận diện TikTok Shop Sau khi Tải video
* **File:** [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js)
* **Hàm:** `checkVideoAudioAndShop()`
* **Vị trí:** Ngay khi bắt đầu vào hàm `checkVideoAudioAndShop()`.
* **Mục đích:** Xác minh trạng thái track âm thanh (`v.muted`, `v.volume`) và các thành phần DOM sau khi liên kết video được 2.5 giây.

#### Đoạn code cần chèn:
```javascript
// Bên trong hàm checkVideoAudioAndShop():
logPlaybackDiagnostics("POST_LOAD_CHECK_2500MS", currentVideoElement);
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [POST_LOAD_CHECK_2500MS] t=3920.10ms | doc.hidden=false | doc.visState=visible | doc.hasFocus=true | v.readyState=4 | v.netState=1 | v.paused=false | v.currentTime=1.20 | v.duration=18.50 | v.buffered=[["0.00","18.50"]]
```

---

### Điểm 6: Kiểm tra Hoạt động & Focus của Tab trong Service Worker
* **File:** [background.js](file:///d:/A.Myself/Random-Video/background.js)
* **Hàm:** `getOrCreateTikTokTab(targetUrl)`
* **Vị trí:** Bên trong `getOrCreateTikTokTab()` trước khi gọi `chrome.tabs.update()`.
* **Mục đích:** Ghi lại nhật ký cho biết tab TikTok mục tiêu được tạo/cập nhật với thuộc tính hoạt động hoạt bát `{ active: true }` hay chạy trong nền (`{ active: false }`).

#### Đoạn code cần chèn:
```javascript
// Bên trong getOrCreateTikTokTab() ở background.js:
console.log(`[PLAYBACK-DEBUG] [BG_TAB_NAVIGATION] t=${Date.now()} | tabId=${targetTab.id} | active=${targetTab.active} | targetUrl=${targetUrl}`);
```

#### Kết quả đầu ra dự kiến ở DevTools Console:
```text
[PLAYBACK-DEBUG] [BG_TAB_NAVIGATION] t=1722800000000 | tabId=142 | active=false | targetUrl=https://www.tiktok.com/@username/video/7391000000
```

---

## 4. Bảng Tổng kết Vị trí Ghi nhật ký Chẩn đoán

| Vị trí | File Mục tiêu | Hàm Mục tiêu | Điều kiện kích hoạt | Giá trị cốt lõi được ghi log |
| :--- | :--- | :--- | :--- | :--- |
| **1** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `watchForVideoElement()` | Tìm thấy phần tử `<video>` trong DOM | Xác minh dung lượng bộ đệm ban đầu & readyState khi liên kết DOM |
| **2** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `watchForVideoElement()` | Sự kiện media gốc của HTML5 | Phát hiện các sự kiện `waiting` / `stalled` khi bộ đệm mạng dừng nạp |
| **3** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `initPlaybackRecovery()` | Mỗi 1.5 giây khi `v.paused == true` | Ghi nhật ký kết quả gọi lệnh `v.play()` Layer 6 thành công hay thất bại |
| **4** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `startStuckMonitor()` | Mỗi 1 giây khi `currentTime` bị đứng | Theo dõi thời lượng bị kẹt khi video dừng giữa chừng khi đang phát |
| **5** | [js/content-video.js](file:///d:/A.Myself/Random-Video/js/content-video.js) | `checkVideoAudioAndShop()` | 2.5 giây sau khi phát hiện video | Kiểm tra âm lượng, trạng thái tắt tiếng, và các cờ phần tử shop |
| **6** | [background.js](file:///d:/A.Myself/Random-Video/background.js) | `getOrCreateTikTokTab()` | Điều hướng URL của Tab | Ghi lại trạng thái hoạt động của tab (`active=true` so với `active=false`) |

---

## 5. Ma trận Phân tích Kết quả Chẩn đoán

Khi thử nghiệm phát video trong tab chạy nền, hãy đối chiếu các log quan sát được trong DevTools Console với ma trận sau:

| Mẫu Log Quan sát được | Nguyên nhân gốc rễ | Giải pháp |
| :--- | :--- | :--- |
| `v.readyState = 1` (`HAVE_METADATA`), `v.buffered = []`, `v.paused = true` | Trình phát web TikTok dừng tải dữ liệu từ mạng vì tab đang chạy ẩn dưới nền. | Ép focus tab khi điều hướng hoặc gửi tương tác cử chỉ phát giả lập. |
| `LAYER6_PLAY_FAILED: play() failed because the user didn't interact` | Chính sách Autoplay của Chrome chặn phát video theo chương trình `.play()` khi thiếu tương tác thực từ người dùng. | Đảm bảo tương tác click vào Popup extension hoặc phím tắt đóng vai trò là ngữ cảnh kích hoạt. |
| `EVENT_STALLED`, `v.netState = 2`, `v.buffered` dừng tăng lên | Cơ chế hạn chế chạy nền của Chrome giảm độ ưu tiên của các luồng request dữ liệu đa phương tiện. | Kích hoạt luồng âm thanh giữ kết nối ẩn (Silent Audio Keep-Alive) hoặc focus tab. |
| Không thấy xuất hiện log `LAYER6_RECOVERY_ATTEMPT` quá 10 giây | Trình duyệt hạn chế bộ hẹn giờ chạy nền làm chậm trễ tiến trình thực thi của `setInterval`. | Sử dụng `chrome.alarms` hoặc cơ chế ping định kỳ từ Service Worker để duy trì hoạt động bộ hẹn giờ. |
