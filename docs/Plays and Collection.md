# Luồng Quét Video: Quét Video Mới và Quét Tiếp

Tài liệu này giải thích chi tiết hai button liên quan đến thu thập video trong popup:

- **Quét video mới**
- **Quét tiếp**

Ngoài ra, tài liệu cũng mô tả rõ ảnh hưởng của trường **Số lượng video cần thu thập:** đến toàn bộ luồng xử lý.

---

## 1. Hai button này khác nhau ở điểm nào?

Hai button đều đi qua cùng một cửa vào ở popup: `popup.js` gửi message `collectMore` sang `background.js`. Tuy nhiên, chúng khác nhau ở tham số `smartStop`.

### Quét video mới

- `smartStop = true`
- Mục tiêu là kiểm tra xem trên trang Liked hiện tại có xuất hiện video mới hay không.
- Luồng này ưu tiên dừng sớm khi phát hiện dữ liệu đã lặp lại, nên phù hợp cho việc cập nhật nhanh.
- Thường được dùng khi bạn đã có danh sách video cũ và chỉ muốn “xem có gì mới thêm vào”.

### Quét tiếp

- `smartStop = false`
- Mục tiêu là quét sâu hơn để kéo thêm video cũ hơn, không dừng sớm theo dấu hiệu lặp lại.
- Luồng này đi xa hơn, lâu hơn, và phù hợp khi muốn mở rộng tập video đã lưu.
- Thường được dùng khi bạn muốn “thu thập tiếp từ chỗ đang có” thay vì chỉ kiểm tra mới.

---

## 2. Trường “Số lượng video cần thu thập:” ảnh hưởng gì?

Giá trị trong trường này được đọc ở popup bằng:

```javascript
const limit = parseInt(limitInput.value) || 100;
```

Sau đó nó được gửi sang background dưới dạng `limit`.

### Ảnh hưởng trực tiếp

- Đây là **ngưỡng mục tiêu** cho phiên thu thập hiện tại.
- Nó quyết định mức độ sâu của quá trình cuộn trang và giới hạn số video mà hệ thống cố gắng gom thêm.
- Nó cũng ảnh hưởng đến số lần scroll tối đa vì hệ thống tính:

```javascript
const maxScrolls = Math.ceil(targetLimit / 10) + 15;
```

### Ảnh hưởng gián tiếp

- `limit` càng lớn thì thời gian quét càng lâu.
- `limit` càng nhỏ thì hệ thống dừng sớm hơn, ít cuộn hơn, nhưng dễ bỏ sót video cũ hơn.
- Dù `limit` lớn, hệ thống vẫn có các cơ chế dừng an toàn như:
  - hết dữ liệu mới,
  - trang không nạp thêm được nữa,
  - gặp nhiều nội dung đã có sẵn,
  - chạm giới hạn scroll tối đa.

### Tác động riêng theo từng button

- Với **Quét video mới**: `limit` chủ yếu xác định mức “kiểm tra cập nhật” sâu đến đâu, nhưng vẫn có cơ chế dừng sớm bằng `smartStop`.
- Với **Quét tiếp**: `limit` là độ sâu thu thập thực tế, vì `smartStop` tắt nên hệ thống sẽ cố đi sâu hơn để lấy thêm video cũ.

---

## 3. Luồng xử lý của button “Quét video mới”

### Bước 1: Popup gửi yêu cầu

Khi bấm button này, `popup.js` gửi message:

```javascript
{ action: "collectMore", limit, username, smartStop: true }
```

### Bước 2: Background quyết định có cần điều hướng lại trang cá nhân không

`background.js` xử lý `collectMore` bằng `handleCollectMore(limit, username, smartStop)`.

Có 2 tình huống:

- Nếu tab hiện tại đã ở đúng trang Liked của user, background gửi message `continueCollecting` thẳng vào content script.
- Nếu chưa ở đúng trang, background mở hoặc điều hướng tới profile URL rồi khởi tạo một `CollectionJob` để chờ content script sẵn sàng.

### Bước 3: Content script bắt đầu thu thập

Khi content script nhận được `continueCollecting` hoặc `clickLikedTabAndCollect`, nó sẽ:

- click tab **Liked** nếu cần,
- gọi `startCollection(...)`,
- bật `smartStopMode = true`,
- bắt đầu observer và auto-scroll.

### Bước 4: Smart Stop hoạt động

Trong `js/content-core.js`, hàm `autoScroll(...)` sẽ kiểm tra các URL đang hiển thị.

Nếu ở chế độ `smartStopMode = true`, hệ thống sẽ:

- so sánh các video đang thấy với tập video đã có trước đó,
- đếm số lần thấy video cũ lặp lại liên tiếp,
- dừng sớm khi gặp dấu hiệu “đã tới vùng dữ liệu cũ”.

Cụ thể, khi phát hiện **3 batch liên tiếp** có video đã tồn tại, hệ thống coi như đã đủ để cập nhật nhanh và kết thúc phiên quét.

### Bước 5: Gửi dữ liệu về background

Khi quét xong, content script:

- gửi danh sách video đã gom được về background,
- giữ nguyên video cũ,
- chỉ bổ sung phần mới nếu có,
- cập nhật trạng thái progress cho popup.

### Kết quả cuối cùng

Button này cho cảm giác “nhanh” hơn vì nó không cố đi quá sâu vào lịch sử video.

---

## 4. Luồng xử lý của button “Quét tiếp”

### Bước 1: Popup gửi yêu cầu

Khi bấm button này, `popup.js` gửi message:

```javascript
{ action: "collectMore", limit, username, smartStop: false }
```

### Bước 2: Background điều phối như trên, nhưng với mục tiêu sâu hơn

Background vẫn đi qua `handleCollectMore(...)`, nhưng lần này `smartStop` tắt.

Điều đó có nghĩa là:

- nếu đang ở đúng trang Liked, hệ thống tiếp tục quét ngay tại chỗ;
- nếu chưa ở đúng trang, hệ thống đi tới profile và khởi tạo job quét;
- khi content script bắt đầu cuộn, nó không dừng sớm theo dấu hiệu lặp lại.

### Bước 3: Content script chạy chế độ append sâu

Trong `startCollection(...)`, hệ thống sẽ đặt:

- `appendMode = true`
- `smartStopMode = false`
- `isDeepAppend = true`

Điều này có nghĩa:

- dữ liệu cũ trong storage vẫn được giữ lại,
- dữ liệu mới sẽ được nối thêm vào,
- hệ thống cuộn sâu hơn để lấy thêm video cũ hơn.

### Bước 4: Auto-scroll tiếp tục cho đến khi gặp giới hạn

Không có smart stop nên luồng này chỉ dừng khi một trong các điều kiện sau xảy ra:

- đã đạt số video mục tiêu `limit`,
- cuộn quá số lần tối đa `maxScrolls`,
- không còn video mới trong nhiều vòng liên tiếp,
- trang không tăng chiều cao nữa,
- hoặc checkpoint / trạng thái thu thập cho thấy không còn dữ liệu đáng kể.

### Kết quả cuối cùng

Button này cho phép mở rộng thư viện video đã lưu sâu hơn, nhưng sẽ mất thời gian hơn button “Quét video mới”.

---

## 5. So sánh nhanh hai button

| Tiêu chí       | Quét video mới                  | Quét tiếp                                 |
| -------------- | ------------------------------- | ----------------------------------------- |
| `smartStop`    | `true`                          | `false`                                   |
| Mục tiêu chính | Kiểm tra cập nhật mới           | Quét sâu để lấy thêm video                |
| Tốc độ         | Nhanh hơn                       | Chậm hơn                                  |
| Độ sâu cuộn    | Nông hơn                        | Sâu hơn                                   |
| Cách dừng      | Có dừng sớm khi gặp dữ liệu lặp | Chủ yếu dừng theo limit / giới hạn scroll |
| Phù hợp khi    | Muốn cập nhật nhanh             | Muốn mở rộng kho video đã lưu             |

---

## 6. Điều gì xảy ra bên trong hệ thống theo trình tự?

1. Người dùng nhập username và số lượng video cần thu thập.
2. Người dùng bấm một trong hai button.
3. Popup gửi message `collectMore` sang background.
4. Background kiểm tra tab hiện tại và quyết định:
   - tiếp tục quét tại chỗ,
   - hoặc điều hướng về trang profile.
5. Content script được kích hoạt qua message `clickLikedTabAndCollect` hoặc `continueCollecting`.
6. Content script click tab Liked, khởi tạo observer và auto-scroll.
7. Video được thu thập dần vào `chrome.storage.local`.
8. Nếu là “Quét video mới”, hệ thống dừng sớm khi thấy nội dung đã lặp.
9. Nếu là “Quét tiếp”, hệ thống đi sâu hơn cho đến khi chạm limit hoặc hết dữ liệu mới.
10. Popup cập nhật progress và hiển thị kết quả cuối cùng.

---

## 7. Ghi chú thực tế khi chọn giá trị limit

- Nếu bạn chỉ muốn kiểm tra nhanh xem có video mới không, nên chọn limit nhỏ hoặc vừa.
- Nếu bạn muốn mở rộng danh sách đã lưu nhiều hơn, nên chọn limit lớn hơn.
- Limit quá lớn không đảm bảo luôn lấy được nhiều hơn tương ứng, vì TikTok có thể hết dữ liệu nạp được sớm hơn giới hạn đó.
- Nếu bộ video đã gần đầy, `smartStop` sẽ làm button “Quét video mới” dừng nhanh hơn nhiều so với “Quét tiếp”.

---

## 8. Kết luận ngắn

- **Quét video mới** = kiểm tra cập nhật nhanh, dừng sớm hơn, hợp với việc bắt kịp video mới.
- **Quét tiếp** = đi sâu hơn để lấy thêm video cũ, hợp với việc mở rộng thư viện đã lưu.
- **Số lượng video cần thu thập** = ngưỡng mục tiêu và cũng là tham số quyết định độ sâu, số lần cuộn, và thời gian hoàn tất phiên quét.
