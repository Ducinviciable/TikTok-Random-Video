# Bảng Tham Số & Hàm Quan Trọng (TikTok Random Liked)

Tài liệu này liệt kê toàn bộ các biến cấu hình, cờ trạng thái (state flags), và các hàm điều khiển cốt lõi ảnh hưởng trực tiếp đến cơ chế hoạt động của Extension.

---

## 1. Biến & Cờ Trạng Thái (Variables & State Flags)

| Tên biến / Cờ | Vai trò | Ảnh hưởng | Ghi chú thêm |
| :--- | :--- | :--- | :--- |
| **`isCatchingUp`** | Đánh dấu giai đoạn cuộn bắt kịp vùng video đã cào. | Đóng băng bộ đếm dừng `noNewCount = 0`, kích hoạt tốc độ cuộn nhanh và tạm thời bỏ qua trích xuất thumbnail. | Tự động chuyển sang `false` ngay khi gặp video mới đầu tiên. |
| **`noNewCount`** | Đếm số lần cuộn liên tiếp không phát hiện thêm video mới. | Nếu `noNewCount >= 4` (khi không ở vùng Catch-Up), hệ thống coi như đã hết dữ liệu mới và dừng quét. | Reset về `0` khi cuộn được video mới hoặc khi cờ `isCatchingUp` đang bật. |
| **`maxScrolls`** | Giới hạn số lần cuộn tối đa cho một phiên cào dữ liệu. | Buộc vòng cuộn dừng lại khi số lần cuộn thực tế đạt ngưỡng này nhằm tránh chạy vô hạn. | Tính toán động: `Math.ceil((existingCount + targetLimit) / 10) + 15`. |
| **`sameHeightCount`** | Phát hiện trạng thái chạm đáy trang TikTok Liked. | Nếu chiều cao trang không đổi trong 5 lần cuộn liên tiếp (`sameHeightCount >= 5`), kết thúc thu thập dữ liệu. | Tín hiệu chứng tỏ TikTok không thể nạp thêm video cards. |
| **`EARLY_SKIP_CHANCE`** | Tỷ lệ ngẫu nhiên đánh dấu video "kém hứng thú" (Low Interest). | Quyết định xem video hiện tại có bị skip sớm hay không. Mặc định là `0.10` (10% xác suất). | Mô phỏng hành vi xem có chọn lọc (Selective Viewer) của người dùng thật để né tránh WAF. |
| **`EARLY_SKIP_MIN_RATIO`** / **`EARLY_SKIP_MAX_RATIO`** | Khoảng thời lượng để kích hoạt skip video kém hứng thú. | Video được đánh dấu skip sớm sẽ chuyển tiếp ngẫu nhiên ở mốc **30% đến 80%** thời lượng. | Quyết định tỷ lệ thời lượng được chốt cố định một lần duy nhất lúc video bắt đầu phát. |
| **`consecutive403Count`** | Theo dõi số lần gặp lỗi 403 / Access Denied liên tiếp trong phiên. | Quyết định cấp độ Cooldown tương ứng để hạ nhiệt kết nối trước khi thực hiện chuyển video tiếp theo. | Tự động reset về `0` nếu hệ thống phát video ổn định liên tục trong **5 phút** không có lỗi. |
| **`last403TriggerTime`** | Lưu mốc thời gian của lần xử lý phục hồi 403 gần nhất. | Phối hợp cùng các khoảng giãn cách cooldown để tránh gửi trùng lặp yêu cầu chuyển video dồn dập. | Giữ an toàn cho tiến trình chuyển tab SPA hoạt động ổn định. |
| **`isRecoveryInProgress`** | Cờ kiểm soát tiến trình khôi phục lỗi ở Background. | Khi cờ này là `true`, chặn hoàn toàn các tiến trình watchdog khác kích hoạt chuyển video trùng lặp. | Ngăn ngừa hiện tượng tranh chấp điều hướng (double-navigation). |

---

## 2. Khoảng Thời Gian & Chu Kỳ (Timers & Intervals)

| Tên thông số | Giá trị mặc định | Vai trò | Ghi chú thêm |
| :--- | :--- | :--- | :--- |
| **Cuộn Catch-Up** | `300 - 500 ms` (ngẫu nhiên) | Khoảng chờ cuộn trong safe territory (video cũ). | Tối ưu hóa thời gian quét qua vùng dữ liệu cũ đã lưu. |
| **Cuộn bình thường** | `700 - 1300 ms` (+ delay lũy tiến) | Khoảng chờ cuộn tự nhiên ở vùng video mới. | Tăng dần delay khi tập dữ liệu cào được ngày càng lớn để giảm tải trình duyệt. |
| **DOM Rest Delay** | `2500 ms` sau mỗi `100` lần cuộn | Khoảng nghỉ tạm thời của tiến trình cuộn. | Bị bỏ qua trong chế độ Catch-Up để chạy nhanh nhất có thể. |
| **Stuck Threshold** | `6 giây` (kiểm tra mỗi `1s`) | Thời gian tối đa cho phép video đứng hình. | Giây thứ 4 log chẩn đoán; giây thứ 5 kích hoạt Soft Recovery; giây thứ 6 skip video. |
| **Please Wait Recovery** | `12 giây` (kiểm tra mỗi `4s`) | Thời gian chờ tối đa khi xuất hiện popup "Please Wait". | Sau 12s, kích hoạt chuỗi phục hồi mềm (Phase A-D) thay vì ép F5 tải lại trang. |
| **Watchdog Buffer Delay** | `1.8 giây` (1800ms) | Khoảng trễ trước khi Watchdog can thiệp chuyển video. | Tránh tranh chấp khi Content Script đang tự thực hiện SPA navigation. |
| **Cooldown Tier 1** | `10 giây` (10000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ nhất. | Giảm tần suất request tải trang liên tục khi WAF bắt đầu chặn. |
| **Cooldown Tier 2** | `20 giây` (20000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ hai liên tiếp. | Tăng gấp đôi thời gian cooldown phòng vệ. |
| **Cooldown Tier 3** | `65 giây` (65000ms) | Thời gian tạm nghỉ sâu khi gặp lỗi 403 từ lần thứ ba liên tiếp. | Đưa hệ thống vào trạng thái ngủ đông tạm thời, hiển thị Toast cảnh báo người dùng. |

---

## 3. Các Hàm Cốt Lõi (Key Functions)

| Tên hàm | Vị trí định nghĩa | Vai trò | Ảnh hưởng |
| :--- | :--- | :--- | :--- |
| **`triggerTiered403Recovery`** | `background.js` | Điều phối tổng thể phục hồi lỗi 403 và Access Denied. | Tính toán Cooldown phù hợp theo cấp độ, tạm hoãn và gọi `handleRandomLiked` để đổi video. |
| **`performDomCleanup`** | `js/content-checkpoint.js` | Dọn dẹp các thẻ video đã cào xong ra khỏi DOM. | Giữ số lượng Liked cards trong DOM luôn $\le 150$ thẻ (khi vượt quá 200) và lưu checkpoint. |
| **`triggerHumanMouseNudge`** | `js/content-bypass.js` | Sinh các hành vi chuyển động chuột mô phỏng tay người. | Tạo đường cong di chuyển Cubic Bézier mượt mà và hover ngẫu nhiên để tăng trust score. |
| **`warmUpNextVideoUrl`** | `js/content-video.js` | Preload video tiếp theo từ mốc 70% thời lượng. | Thực hiện ping request `HEAD` và tạo thẻ `<link rel="prefetch">` giúp chuyển video không bị khựng. |
| **`initPlaybackRecovery`** | `js/content-video.js` | Giám sát và tự động click các nút tắt modal lỗi/chờ. | Thực hiện chuỗi phục hồi 4 bước (A: cuộn nhẹ, B: focus flash, C: chờ 5s, D: SPA skip). |
| **`selectRandomVideo`** | `bg-playback.js` | Lựa chọn video ngẫu nhiên tiếp theo từ kho dữ liệu. | Loại trừ video đang phát, video trong danh sách đen và ưu tiên video chưa được phát trong chu kỳ. |
| **`watchForVideoElement`** | `js/content-video.js` | Đăng ký sự kiện và áp đặt thuộc tính cho thẻ `<video>`. | Đảm bảo bật `loop` (ngăn feed tự cuộn), gán sự kiện kết thúc video và theo dõi trạng thái. |
