# Hỏi Đáp Hệ Thống Thu Thập Video

Tài liệu này chỉ giải thích dựa trên code hiện tại của dự án.

Nếu một hành vi không thấy được trong code, tài liệu sẽ ghi rõ là **không xác định từ code hiện tại**.

---

## 1. Cách tính số lần cuộn (Scroll Count)

### 1.1 Scroll count được tính ở đâu?

Scroll count được theo dõi trong `js/content-core.js` داخل hàm `autoScroll(...)`.

Các biến liên quan:

- `scrollCount`
- `maxScrolls`
- `noNewCount`
- `sameHeightCount`
- `itemsSinceLastRest`
- `lastCount`
- `lastScrollHeight`
- `smartStopMode`

Hàm liên quan:

- `autoScroll(targetLimit, baseInterval, existingUrlsSet, smartStopMode)` trong [js/content-core.js](js/content-core.js)
- `startCollection(autoPlay, appendMode, targetLimit, continueFromCurrent, smartStopMode)` trong [js/content-core.js](js/content-core.js)
- `startCollectionJob(...)` và `runJobCycle()` trong [bg-collections.js](bg-collections.js)

### 1.2 Một lần cuộn được hiểu là gì?

Trong code hiện tại, một lần cuộn được tính khi `scrollStep()` thực thi xong một vòng và đến đoạn:

```javascript
if (scrollContainer) {
  scrollContainer.scrollBy(0, 1100);
} else {
  window.scrollBy(0, 1100);
}

scrollCount++;
```

Vì vậy:

- **không phải** một viewport cố định,
- **không phải** một vòng lặp UI tổng quát,
- mà là **một vòng lặp của `scrollStep()` có thực hiện một lần `scrollBy(0, 1100)`**.

### 1.3 Biến nào làm `scrollCount` tăng?

Trong `autoScroll(...)`:

- `scrollCount` khởi tạo bằng `0`
- mỗi lần `scrollStep()` chạy đến đoạn scroll thành công thì `scrollCount++`
- sau đó `setTimeout(scrollStep, nextDelay)` lên lịch vòng tiếp theo

Nghĩa là `scrollCount` tăng theo **số vòng cuộn thực tế**, không tăng theo số video tìm được.

### 1.4 Điều kiện nào khiến hệ thống dừng cuộn?

Trong `autoScroll(...)`, hệ thống dừng khi một trong các điều kiện sau xảy ra:

1. `isCollecting` bị tắt.
2. `newCollectedCount >= targetLimit`.
3. `scrollCount >= maxScrolls`.
4. `noNewCount >= 4`.
5. `sameHeightCount >= 5`.
6. Ở chế độ `smartStopMode = true`, nếu `consecutiveExistingCount >= 3` thì resolve sớm.
7. `startObserving(...)` chỉ quan sát DOM; nó không tự quyết định dừng, việc dừng vẫn do `autoScroll(...)` và `isCollecting`.

### 1.5 Luồng xử lý từ lúc bắt đầu đến lúc kết thúc

1. Popup gửi `collectMore` hoặc `randomLiked` sang background.
2. Background điều phối tab và, nếu cần, gửi `clickLikedTabAndCollect` hoặc `continueCollecting` xuống content script.
3. `startCollection(...)` được gọi trong `js/content-core.js`.
4. `startCollection(...)`:
   - set `isCollecting = true`
   - đọc `targetLimit`
   - có thể reset `existingUrls`
   - nạp `blacklistedVideos` từ storage
   - gọi `collectVideoUrls()`
   - gọi `startObserving(appendMode)`
   - gọi `autoScroll(targetLimit, 1000, existingUrls, smartStopMode)`
5. `autoScroll(...)` lặp qua `scrollStep()`.
6. `scrollStep()`:
   - gọi `collectVideoUrls()`
   - kiểm tra smart stop (nếu bật)
   - gửi progress về background bằng `collectionProgress`
   - kiểm tra điều kiện dừng
   - gọi `scrollBy(0, 1100)` trên scroll container hoặc `window`
   - tăng `scrollCount`
   - hẹn vòng tiếp theo bằng `setTimeout`
7. Khi dừng, `autoScroll(...)` resolve.
8. `startCollection(...)` gọi `performFinalSweep()`, `sendVideosToBackground(...)`, `clearCheckpoint`, rồi gửi `collectionProgress` trạng thái `complete`.
9. Nếu `autoPlay = true`, content script gửi tiếp `collectAndPlay` sang background sau 500ms.

---

## 2. Quy trình sử dụng cho người dùng mới

Phần này mô tả đúng theo code hiện tại, với giả định ban đầu:

- chưa export dữ liệu,
- `chrome.storage.local` đang trống,
- muốn thu thập khoảng 500 video đã thích.

### 2.1 Người dùng cần bấm gì?

Từ `popup.js`, các button liên quan thu thập là:

- **Random Video Đã Like** (`randomBtn`) → gửi `randomLiked`
- **Quét video mới** (`quickUpdateBtn`) → gửi `collectMore` với `smartStop: true`
- **Quét tiếp** (`deepAppendBtn`) → gửi `collectMore` với `smartStop: false`
- **Thu thập lại từ đầu** (`refreshBtn`) → gửi `clearCache`, sau đó `randomLiked`

Với người dùng mới muốn thu thập khoảng 500 video, luồng hợp với code hiện tại là:

1. Nhập username TikTok.
2. Nhập `Số lượng video cần thu thập:`.
3. Bấm **Thu thập lại từ đầu** nếu muốn làm sạch cache cũ, hoặc bấm **Quét tiếp** nếu muốn nối thêm.

### 2.2 Nên cấu hình gì?

Các giá trị thực sự được dùng trong code:

- `usernameInput` → lấy qua `getProfileUsername()`
- `limitInput` → đọc bằng `parseInt(limitInput.value) || 100`
- `autoNextToggle` → bật/tắt `autoNextEnabled`

Nếu storage trống và muốn thu thập mới, code hiện tại không bắt buộc phải export/import gì trước.

### 2.3 Sau khi bấm bắt đầu thì hệ thống hoạt động như thế nào?

Theo `popup.js`:

- `refreshBtn` gọi `clearCache`, rồi `randomLiked(limit, username)`.
- `quickUpdateBtn` gọi `collectMore(limit, username, true)`.
- `deepAppendBtn` gọi `collectMore(limit, username, false)`.

Theo `background.js` và `bg-collections.js`:

- `collectMore` đi vào `handleCollectMore(...)`.
- Nếu tab đang ở đúng trang Liked của user, background gửi `continueCollecting` vào content script.
- Nếu không, background điều hướng tới profile URL rồi tạo `startCollectionJob(...)`.
- `startCollectionJob(...)` tạo job và `runJobCycle()`.
- `runJobCycle()` ping content script bằng `action: "ping"`.
- Khi content script alive, background gửi `clickLikedTabAndCollect`.

Theo `js/content-core.js`:

- `clickLikedTab(...)` hoặc `continueCollecting` sẽ kích hoạt `startCollection(...)`.
- `startCollection(...)` khởi tạo `autoScroll(...)`.
- `autoScroll(...)` scroll dần cho đến khi đạt điều kiện dừng.

### 2.4 Khi nào nên dừng?

Theo code hiện tại, hệ thống tự dừng khi:

- đạt `targetLimit`,
- không còn dữ liệu mới đủ lâu,
- không tăng chiều cao trang,
- hoặc smart stop phát hiện nội dung cũ lặp lại liên tiếp.

Nói cách khác, người dùng không có một nút “dừng thủ công” trong code được thấy ở đây; việc dừng là do logic tự kết thúc phiên quét.

### 2.5 Khi nào nên tiếp tục thu thập?

Chỉ dựa trên code hiện tại, `collectMore` là nút để tiếp tục thu thập khi:

- đã có `likedVideos` trong storage,
- muốn nối thêm video vào danh sách hiện có,
- hoặc muốn kiểm tra video mới với `smartStop: true`.

---

## 3. Phân tích hiệu năng và mức độ rủi ro

Phần này chỉ mô tả những gì có thể suy ra trực tiếp từ code.

### 3.1 Trường hợp tốt nhất

Điều kiện từ code:

- trang đã ở đúng profile/Liked,
- content script sống và nhận `ping`,
- `collectVideoUrls()` tìm thấy video nhanh,
- `smartStopMode = true` gặp nội dung lặp sớm.

Kết quả khả dĩ:

- tốc độ thu thập: nhanh hơn vì dừng sớm,
- thời gian: ngắn hơn vì `consecutiveExistingCount >= 3` có thể kết thúc sớm,
- CPU/RAM: vẫn chịu vòng `MutationObserver`, `sendMessage`, và `scrollBy`, nhưng thời gian chạy ngắn hơn,
- mạng: ít yêu cầu hơn do phiên quét ngắn hơn,
- số lần cuộn: thấp hơn do smart stop,
- số lần tải trang: code hiện tại không chủ động `reload` trong flow này; chủ yếu là điều hướng tab và scroll,
- rủi ro bị TikTok phát hiện/chặn: **không thể định lượng từ code**; code chỉ cho thấy có `content-bypass.js`, `content-video.js`, và watchdog 403.

Giá trị `Số lượng video cần thu thập` nên chọn:

- vừa phải nếu chỉ muốn kiểm tra cập nhật,
- vì `smartStop` có thể kết thúc sớm dù limit lớn.

### 3.2 Trường hợp bình thường

Điều kiện từ code:

- tab/content script hoạt động bình thường,
- dữ liệu mới và cũ đan xen,
- không gặp smart stop quá sớm,
- `autoScroll(...)` chạy đến gần `targetLimit` hoặc gặp giới hạn cuộn.

Kết quả khả dĩ:

- tốc độ: trung bình,
- thời gian: phụ thuộc `targetLimit`, `baseInterval = 1000`, `extraDelay`, và các lần nghỉ 2.5s sau 100 vòng,
- CPU/RAM: tăng theo thời gian chạy dài hơn vì observer, scroll và check progress diễn ra liên tục,
- mạng: có thể tăng khi TikTok nạp thêm dữ liệu khi scroll,
- số lần cuộn: xấp xỉ phụ thuộc `limit` vì `maxScrolls = Math.ceil(targetLimit / 10) + 15`,
- rủi ro bị chặn: không thể kết luận định lượng, nhưng thời gian chạy dài hơn đồng nghĩa số vòng hoạt động nhiều hơn.

Giá trị `Số lượng video cần thu thập` nên chọn:

- khoảng 100–200 nếu muốn cân bằng giữa độ sâu và thời gian,
- vì `maxScrolls` tăng theo `targetLimit`.

### 3.3 Trường hợp xấu nhất

Điều kiện từ code:

- trang không nạp thêm dữ liệu,
- `noNewCount >= 4`,
- `sameHeightCount >= 5`,
- hoặc job ở background timeout 20s rồi điều hướng lại profile,
- hoặc active tab bị 403 / forbidden / denied,
- hoặc content script không ping được và watchdog background can thiệp.

Kết quả khả dĩ:

- tốc độ: chậm hoặc bị lặp lại,
- thời gian: dài nhất,
- CPU/RAM: có thể tốn hơn do chạy lâu và do retry,
- mạng: có thể phát sinh thêm vì background điều hướng lại profile hoặc watchdog auto-trigger,
- số lần cuộn: có thể tăng đến `maxScrolls`,
- số lần tải trang: có thể tăng nếu job timeout hoặc bị 403/error,
- rủi ro bị chặn: code có watchdog và chuyển video khi gặp 403, nhưng mức rủi ro thực tế không định lượng được từ code.

Giá trị `Số lượng video cần thu thập` nên chọn:

- nhỏ hơn nếu chỉ kiểm tra nhanh,
- vì limit lớn trong điều kiện xấu có thể làm phiên chạy kéo dài nhưng vẫn không đạt số mong muốn.

---

## 4. Hệ thống đang dựa vào số lượng video hay độ sâu?

### 4.1 Dựa vào cái gì?

Từ code hiện tại, hệ thống là **kết hợp cả hai**:

1. **Số lượng video mục tiêu** thông qua `targetLimit` / `limit`.
2. **Độ sâu cuộn** thông qua `scrollCount`, `maxScrolls`, `noNewCount`, `sameHeightCount`.

### 4.2 Code nào chứng minh điều đó?

Trong `js/content-core.js`:

- `targetLimit = targetLimit || 100`
- `maxScrolls = Math.ceil(targetLimit / 10) + 15`
- dừng nếu `newCollectedCount >= targetLimit`
- dừng nếu `scrollCount >= maxScrolls`
- dừng nếu `noNewCount >= 4`
- dừng nếu `sameHeightCount >= 5`

### 4.3 Hệ thống xác định đã thu thập đủ dữ liệu bằng cách nào?

Hiện tại có nhiều điều kiện “đủ”:

- đủ theo số lượng: `newCollectedCount >= targetLimit`
- đủ theo độ sâu: `scrollCount >= maxScrolls`
- đủ theo tín hiệu không còn dữ liệu: `noNewCount >= 4`
- đủ theo trang không tăng chiều cao: `sameHeightCount >= 5`
- đủ theo smart stop: `consecutiveExistingCount >= 3`

Vì vậy hệ thống **không chỉ dùng một tiêu chí duy nhất**.

---

## 5. Thu thập tiếp sau lần quét trước

Ví dụ: “Lần trước tôi đã quét đến khoảng video thứ 1700. Bây giờ tôi muốn tiếp tục từ video 1701.”

### 5.1 Có thực sự hỗ trợ việc này không?

Từ code hiện tại, **không có cơ chế đảm bảo bắt đầu chính xác từ video 1701**.

Lý do:

- `startCollection(...)` không lưu một “con trỏ vị trí” cuộn theo số thứ tự video.
- Không có biến nào thể hiện offset như “đã tới video 1700 thì bắt đầu từ 1701”.
- Việc thu thập phụ thuộc vào DOM hiện tại, `MutationObserver`, `autoScroll(...)`, và trạng thái storage.

### 5.2 Dữ liệu nào được sử dụng lại?

Các dữ liệu được dùng lại gồm:

- `likedVideos` trong `chrome.storage.local`
- `blacklistedVideos` trong `chrome.storage.local`
- `collectedAt`
- `playedVideos` trong một số flow playback

Trong `startCollection(...)`:

- nếu `continueFromCurrent = true`, nó đọc `likedVideos` và nạp lại vào `collectedMap` / `existingUrls`.
- nếu `appendMode = true`, nó cũng đọc `likedVideos` rồi tiếp tục nối thêm.

### 5.3 Storage nào liên quan?

Liên quan trực tiếp:

- `chrome.storage.local.likedVideos`
- `chrome.storage.local.blacklistedVideos`
- `chrome.storage.local.collectedAt`
- `chrome.storage.local.checkpoint`

### 5.4 Hệ thống có bắt đầu từ video 1701 hay vẫn quét lại từ đầu?

Theo code:

- hệ thống **không có bằng chứng** cho việc bắt đầu chính xác từ video 1701,
- nó có thể nối tiếp từ trạng thái trang hiện tại hoặc tiếp tục quét từ vị trí DOM hiện có,
- nhưng không có cơ chế xác định “video thứ 1700” trong code hiện tại.

### 5.5 Khi nào sẽ xuất hiện video trùng?

Theo code, video trùng có thể xuất hiện khi:

- quét lại từ đầu,
- quét tiếp mà dữ liệu cũ vẫn còn trong `likedVideos`,
- `appendMode = true` nhưng DOM nạp lại những video đã có,
- `smartStop` không dừng sớm đủ nhanh.

Code có một số cơ chế giảm trùng:

- `existingUrls`
- `collectedMap`
- `blacklistedSet`
- lọc theo `url.split("?")[0]`

Nhưng **không có bằng chứng** cho việc loại trùng tuyệt đối trên toàn bộ mọi đường đi.

---

## 6. Thu thập lại các video bị thiếu

### 6.1 Thiếu video ở gần đầu danh sách

Theo code hiện tại:

- nếu quét tiếp từ giữa chừng, các video gần đầu danh sách thường không được đánh dấu riêng để “quay lại đúng chỗ đó”.
- `startCollection(...)` không có con trỏ offset theo vị trí.

Khả năng lấy lại:

- chỉ có thể lấy lại nếu bạn quét lại từ đầu hoặc nếu chúng còn nằm trong vùng DOM được load khi scroll.

Có cần quét lại từ đầu không?

- Nếu muốn chắc chắn lấy lại các video đầu danh sách, code hiện tại không cho thấy cách khác ngoài quét lại.

Có làm tăng dữ liệu trùng không?

- Có thể có, vì `likedVideos` cũ vẫn có thể được nạp lại rồi gặp lại cùng URL.

### 6.2 Thiếu video ở gần cuối danh sách

Theo code hiện tại:

- nếu thiếu ở gần cuối, việc quét tiếp có thể gặp lại chúng nếu scroll đủ sâu.
- `autoScroll(...)` sẽ tiếp tục đến khi có điều kiện dừng.

Khả năng lấy lại:

- tốt hơn so với video ở đầu, vì chỉ cần đẩy scroll sâu hơn.

Có cần quét lại từ đầu không?

- Không thấy bắt buộc trong code.

Có làm tăng dữ liệu trùng không?

- Có thể, nhưng code có lọc trùng theo URL và `blacklistedVideos`.

### 6.3 Thiếu video nằm rải rác toàn bộ danh sách

Theo code hiện tại:

- không có cơ chế “điền lại lỗ hổng rải rác” theo vị trí.
- dữ liệu được thu theo những gì DOM TikTok nạp ra trong các batch scroll.

Khả năng lấy lại:

- không đảm bảo chính xác.

Quét lại từ đầu có cần không?

- Nếu muốn tăng xác suất lấy đủ hơn, quét lại từ đầu là cách dễ suy ra từ code nhất, nhưng vẫn không có bảo đảm tuyệt đối.

### 6.4 Quy trình tối ưu nhất cho người dùng là gì?

Chỉ dựa trên code hiện tại:

- Nếu cần cập nhật nhanh các video mới: dùng **Quét video mới** (`smartStop: true`).
- Nếu cần mở rộng dữ liệu đã có: dùng **Quét tiếp** (`smartStop: false`).
- Nếu nghi ngờ dữ liệu thiếu nhiều hoặc cache cũ quá: dùng **Thu thập lại từ đầu** (`clearCache` rồi `randomLiked`).

---

## 7. Các giới hạn của thuật toán hiện tại

### 7.1 Chiến lược cuộn

Giới hạn:

- mỗi vòng chỉ scroll một mức cố định `scrollBy(0, 1100)`.
- `baseInterval` cố định là `1000` trong `startCollection(...)`.
- có nghỉ thêm sau 100 vòng (`DOM Rest` thêm 2500ms).
- không có chiến lược adaptive theo độ phân bố video trong DOM.

### 7.2 Khả năng tiếp tục thu thập

Giới hạn:

- không có offset/marker để biết chính xác “đang ở video thứ bao nhiêu”.
- `continueFromCurrent` và `appendMode` chỉ ảnh hưởng cách nạp lại dữ liệu storage và cách nối thêm, không tạo ra checkpoint vị trí danh sách.

### 7.3 Khả năng phát hiện và loại bỏ video trùng

Giới hạn:

- có lọc trùng theo URL gốc bằng `split("?")[0]`.
- có `blacklistedVideos` và `existingUrls`.
- nhưng không có bằng chứng về dedupe tuyệt đối trên mọi đường đi.
- nếu URL biến thể khác nhau nhưng cùng video logic, code hiện tại chỉ cho thấy lọc theo URL chuẩn hoá, không xác nhận các biến thể khác.

### 7.4 Khả năng thu hồi video bị bỏ sót

Giới hạn:

- không có cơ chế truy vết video bị thiếu theo vị trí.
- không có hàng đợi ưu tiên để quay lại các lỗ hổng.
- việc thu hồi phụ thuộc vào việc scroll lại và DOM nạp lại.

### 7.5 Giới hạn của `chrome.storage`

Từ code hiện tại có thể thấy:

- dữ liệu lưu ở `chrome.storage.local` gồm `likedVideos`, `blacklistedVideos`, `collectedAt`, `checkpoint`, `playedVideos`, `targetLimit`, `tiktokUsername`, `autoNextEnabled`.
- code không có kiểm tra giới hạn dung lượng storage trước khi ghi.
- code cũng không có cơ chế phân mảnh hay nén dữ liệu.

### 7.6 Các điểm nghẽn hiệu năng

Những chỗ có thể tốn tài nguyên trong code:

- `MutationObserver` theo dõi DOM trong `startObserving(...)`.
- `autoScroll(...)` lặp liên tục, gửi `collectionProgress` mỗi vòng.
- `collectVideoUrls()` được gọi nhiều lần.
- `performDomCleanup()` và `performFinalSweep()` có thể tốn thêm chi phí nhưng chi tiết nội bộ không hiển thị đầy đủ trong đoạn code đã đọc.
- `setInterval` checkpoint mỗi 10s.
- background watchdog `setInterval(..., 3000)`.

### 7.7 Những trường hợp có thể khiến dữ liệu không đầy đủ

Theo code hiện tại:

- `autoScroll(...)` dừng do `noNewCount`, `sameHeightCount`, `maxScrolls` hoặc `targetLimit` trước khi nạp đủ dữ liệu.
- `smartStopMode = true` có thể dừng sớm khi gặp video lặp.
- TikTok không nạp thêm DOM như mong muốn.
- content script không ping được trong job collection.
- tab chuyển sang 403 / error / chrome-error / edge-error.
- checkpoint chỉ hỗ trợ tiếp tục tiến trình, không đảm bảo đầy đủ dữ liệu nếu phiên quét bị cắt.

---

## Kết luận ngắn

- Scroll count là số vòng `scrollStep()` thực sự gọi `scrollBy(0, 1100)` trong `autoScroll(...)`.
- Hệ thống kết hợp cả **số lượng video mục tiêu** và **độ sâu cuộn** để quyết định dừng.
- Không có cơ chế xác định chính xác “video thứ 1701” từ code hiện tại.
- `smartStop: true` và `smartStop: false` tạo ra hai kiểu quét khác nhau: cập nhật nhanh và quét sâu.
- `chrome.storage.local` được dùng để giữ dữ liệu, nhưng code không cho thấy cơ chế đảm bảo toàn vẹn tuyệt đối hay chống thiếu sót hoàn toàn.
