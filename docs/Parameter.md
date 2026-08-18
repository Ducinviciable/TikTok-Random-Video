# Bảng Tham Số & Hàm Quan Trọng (TikTok Random Liked v3.5.1)

Tài liệu này liệt kê toàn bộ các biến cấu hình, cờ trạng thái (state flags), tham số DSP âm thanh, và các hàm điều khiển cốt lõi ảnh hưởng trực tiếp đến cơ chế hoạt động của Extension trên cả **TikTok Web Controller** và **TikTok Hi-Fi Studio**.

---

## 1. Biến & Cờ Trạng Thái (Variables & State Flags)

| Tên biến / Cờ | Vị trí | Vai trò | Ảnh hưởng | Ghi chú thêm |
| :--- | :--- | :--- | :--- | :--- |
| **`isCatchingUp`** | `selectors.js` | Đánh dấu giai đoạn cuộn bắt kịp vùng video đã cào. | Đóng băng bộ đếm dừng `noNewCount = 0`, kích hoạt tốc độ cuộn nhanh và tạm thời bỏ qua trích xuất thumbnail. | Tự động chuyển sang `false` ngay khi gặp video mới đầu tiên. |
| **`noNewCount`** | `content-core.js` | Đếm số lần cuộn liên tiếp không phát hiện thêm video mới. | Nếu `noNewCount >= 4` (khi không ở vùng Catch-Up), hệ thống coi như đã hết dữ liệu mới và dừng quét. | Reset về `0` khi cuộn được video mới hoặc khi cờ `isCatchingUp` đang bật. |
| **`maxScrolls`** | `content-core.js` | Giới hạn số lần cuộn tối đa cho một phiên cào dữ liệu. | Buộc vòng cuộn dừng lại khi số lần cuộn thực tế đạt ngưỡng này nhằm tránh chạy vô hạn. | Tính toán động: `Math.ceil((existingCount + targetLimit) / 10) + 15`. |
| **`sameHeightCount`** | `content-core.js` | Phát hiện trạng thái chạm đáy trang TikTok Liked. | Nếu chiều cao trang không đổi trong 5 lần cuộn liên tiếp (`sameHeightCount >= 5`), kết thúc thu thập dữ liệu. | Tín hiệu chứng tỏ TikTok không thể nạp thêm video cards. |
| **`EARLY_SKIP_CHANCE`** | `content-video-smart.js` | Tỷ lệ ngẫu nhiên đánh dấu video "kém hứng thú" (Low Interest). | Quyết định xem video hiện tại có bị skip sớm hay không. Mặc định là `0.10` (10% xác suất). | Mô phỏng hành vi xem có chọn lọc (Selective Viewer) của người dùng thật để né tránh WAF. |
| **`EARLY_SKIP_MIN_RATIO`** / **`EARLY_SKIP_MAX_RATIO`** | `content-video-smart.js` | Khoảng thời lượng để kích hoạt skip video kém hứng thú. | Video được đánh dấu skip sớm sẽ chuyển tiếp ngẫu nhiên ở mốc **30% đến 80%** thời lượng. | Quyết định tỷ lệ thời lượng được chốt cố định một lần duy nhất lúc video bắt đầu phát. |
| **`consecutive403Count`** | `bg-recovery.js` | Theo dõi số lần gặp lỗi 403 / Access Denied liên tiếp trong phiên. | Quyết định cấp độ Cooldown tương ứng để hạ nhiệt kết nối trước khi thực hiện chuyển video tiếp theo. | Tự động reset về `0` nếu hệ thống phát video ổn định liên tục trong **5 phút** không có lỗi. |
| **`last403TriggerTime`** | `bg-recovery.js` | Lưu mốc thời gian của lần xử lý phục hồi 403 gần nhất. | Phối hợp cùng các khoảng giãn cách cooldown để tránh gửi trùng lặp yêu cầu chuyển video dồn dập. | Giữ an toàn cho tiến trình chuyển tab SPA hoạt động ổn định. |
| **`isRecoveryInProgress`** | `bg-recovery.js` | Cờ kiểm soát tiến trình khôi phục lỗi ở Background. | Khi cờ này là `true`, chặn hoàn toàn các tiến trình watchdog khác kích hoạt chuyển video trùng lặp. | Ngăn ngừa hiện tượng tranh chấp điều hướng (double-navigation). |
| **`activeChannel`** | `player-audio.js` | Đánh dấu kênh phát Dual-Buffer đang phát (`'A'` hoặc `'B'`). | Kênh active nhận âm lượng đầy đủ, kênh idle được chuẩn bị nạp trước bài kế tiếp. | Hoán đổi luân phiên khi kích hoạt crossfade chuyển bài. |
| **`isCrossfading`** | `player-audio.js` | Cờ trạng thái đang trong quá trình chuyển bài mượt mà. | Khóa kích hoạt crossfade lặp và điều phối ramp tăng/giảm GainNode 2 kênh song song. | Tự động mở khóa sau khi hoàn tất thời gian fade. |
| **`normalizerEnabled`** | `player-audio.js` | Trạng thái Bật/Tắt bộ nén cân bằng âm lượng tự động. | Điều hướng luồng âm thanh qua `DynamicsCompressorNode` hoặc qua nhánh `bypassGain`. | Mặc định `true` để tránh video tiếng quá to hoặc quá bé. |

---

## 2. Khoảng Thời Gian & Chu Kỳ (Timers & Intervals)

| Tên thông số | Giá trị mặc định | Vai trò | Ghi chú thêm |
| :--- | :--- | :--- | :--- |
| **Cuộn Catch-Up** | `300 - 500 ms` (ngẫu nhiên) | Khoảng chờ cuộn trong safe territory (video cũ). | Tối ưu hóa thời gian quét qua vùng dữ liệu cũ đã lưu. |
| **Cuộn bình thường** | `700 - 1300 ms` (+ delay lũy tiến) | Khoảng chờ cuộn tự nhiên ở vùng video mới. | Tăng dần delay khi tập dữ liệu cào được ngày càng lớn để giảm tải trình duyệt. |
| **DOM Rest Delay** | `2500 ms` sau mỗi `100` lần cuộn | Khoảng nghỉ tạm thời của tiến trình cuộn. | Bị bỏ qua trong chế độ Catch-Up để chạy nhanh nhất có thể. |
| **Stuck Threshold** | `6 giây` (kiểm tra mỗi `1s`) | Thời gian tối đa cho phép video đứng hình. | Giây thứ 4 log chẩn đoán; giây thứ 5 kích hoạt Soft Recovery; giây thứ 6 skip video. |
| **Please Wait Recovery** | `12 giây` (kiểm tra mỗi `4s`) | Thời gian chờ tối đa khi xuất hiện popup "Please Wait". | Sau 12s, kích hoạt chuỗi phục hồi mềm (Phase A-D) thay vì ép F5 tải lại trang. |
| **Throttle chuyển video** | `2.0 giây` (2000ms) | Giãn cách tối thiểu giữa 2 lần yêu cầu `playNext`. | Chặn spam lệnh chuyển video làm WAF đánh giá hành vi bot. |
| **Watchdog Buffer Delay** | `1.8 giây` (1800ms) | Khoảng trễ trước khi Watchdog can thiệp chuyển video. | Tránh tranh chấp khi Content Script đang tự thực hiện SPA navigation. |
| **Cooldown Tier 1** | `10 giây` (10000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ nhất. | Giảm tần suất request tải trang liên tục khi WAF bắt đầu chặn. |
| **Cooldown Tier 2** | `20 giây` (20000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ hai liên tiếp. | Tăng gấp đôi thời gian cooldown phòng vệ. |
| **Cooldown Tier 3** | `65 giây` (65000ms) | Thời gian tạm nghỉ sâu khi gặp lỗi 403 từ lần thứ ba liên tiếp. | Đưa hệ thống vào trạng thái ngủ đông tạm thời, hiển thị Toast cảnh báo người dùng. |
| **Crossfade Duration** | `2.5 giây` (0.1s – 5.0s) | Thời gian chuyển tiếp âm lượng giữa 2 bài (Fade-in/Fade-out). | Kích hoạt tự động khi bài hát còn $\le \text{crossfadeDuration}$. |
| **CDN Cache TTL** | `15 phút` (900000ms) | Thời gian sống của link CDN trích xuất ngầm trong RAM. | Đảm bảo link luôn tươi, tự làm mới khi hết hạn chữ ký `x-expires`. |

---

## 3. Tham Số Bộ Xử Lý Âm Thanh DSP (Hi-Fi Studio)

| Tham số / Node | Dải giá trị | Giá trị mặc định | Chức năng kỹ thuật |
| :--- | :--- | :--- | :--- |
| **10-Band EQ Frequencies** | `[32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k]` Hz | 10 Dải tần chuẩn ISO | Điều chỉnh độc lập từng dải qua `BiquadFilterNode` (`peaking` / `lowshelf` / `highshelf`, $Q=1.4$). |
| **EQ Gain Range** | `-12 dB` đến `+12 dB` | `0 dB` (Flat) | Tăng giảm cường độ từng dải tần số. |
| **EQ Presets** | Flat, Bass Boost, Vocal, Electronic, Lofi | `Bass Boost` | Các cấu hình Equalizer tối ưu sẵn cho từng thể loại nhạc. |
| **Deep Bass Boost** | `0 dB` đến `+12 dB` | `+6 dB` | Bộ lọc `LowShelf` tại tần số cắt `100Hz` tạo âm trầm sâu và lực. |
| **Dynamics Compressor** | Threshold: `-24dB`, Ratio: `4:1`, Knee: `30`, Attack: `3ms`, Release: `250ms` | Bật (`on`) | Tự động cân bằng động lực học, kiểm soát biên độ âm thanh không bị vỡ tiếng. |
| **Volume Booster** | `1.0x` (100%) đến `3.0x` (300%) | `1.0x` | Khuếch đại biên độ tổng thể qua `masterGainNode` cho các video âm lượng yếu. |
| **Spectrum Visualizer FFT** | `fftSize = 128`, 32 Bars, `smoothing = 0.8` | 32 Cột sóng động | Trích xuất dữ liệu phổ tần số thực tế theo thời gian thực từ `AnalyserNode`. |

---

## 4. Các Hàm Cốt Lõi (Key Functions)

| Tên hàm | Vị trí định nghĩa | Vai trò | Ảnh hưởng |
| :--- | :--- | :--- | :--- |
| **`handleRefreshCdnUrl`** | `js/background/bg-player.js` | Bộ trích xuất CDN JIT ngầm (Fast TikWM + Silent Fallback). | Trả về stream `.mp4` đầy đủ âm thanh cho Player Studio mà không mở bất kỳ tab TikTok nào. |
| **`_applyPlayerCorsRule`** | `js/background/bg-player.js` | Áp dụng DNR CORS cô lập cho riêng tab Extension. | Mở quyền CORS cho `AudioContext` xử lý DSP mà hoàn toàn không can thiệp vào tab `tiktok.com`. |
| **`playTrack`** | `js/player/player-audio.js` | Khởi tạo AudioContext và phát nhạc trên kênh active. | Hủy scheduled values, gán gain `1.0` và kích hoạt chuỗi Web Audio DSP. |
| **`preloadTrack`** | `js/player/player-audio.js` | Nạp sẵn bài hát kế tiếp vào kênh idle (A hoặc B). | Gán source, tải buffer ngầm với `gain = 0` chuẩn bị cho thao tác crossfade. |
| **`performCrossfade`** | `js/player/player-audio.js` | Chuyển bài mượt mà không khoảng lặng giữa 2 kênh A/B. | Fade-in kênh mới từ `0.001` lên `1.0` đồng thời Fade-out kênh cũ xuống `0.001` trong 2.5s. |
| **`triggerTiered403Recovery`** | `js/background/bg-recovery.js` | Điều phối tổng thể phục hồi lỗi 403 và Access Denied. | Tính toán Cooldown phù hợp theo cấp độ, tạm hoãn và gọi `handleRandomLiked` để đổi video. |
| **`performDomCleanup`** | `js/content/crawler/content-checkpoint.js` | Dọn dẹp các thẻ video đã cào xong ra khỏi DOM. | Giữ số lượng Liked cards trong DOM luôn $\le 150$ thẻ (khi vượt quá 200) và lưu checkpoint. |
| **`triggerHumanMouseNudge`** | `js/content/behavior/content-behavior.js` | Sinh các hành vi chuyển động chuột mô phỏng tay người. | Tạo đường cong di chuyển Cubic Bézier mượt mà và hover ngẫu nhiên để tăng trust score. |
| **`warmUpNextVideoUrl`** | `js/content/video/content-video-smart.js` | Preload video tiếp theo từ mốc 70% thời lượng. | Thực hiện ping request `HEAD` và tạo thẻ `<link rel="prefetch">` giúp chuyển video không bị khựng. |
| **`checkVideoAudioAndShop`** | `js/content/video/content-video-recovery.js` | Giám sát video không tiếng hoặc TikTok Shop. | Tự động phát hiện âm thanh bị xóa bản quyền hoặc giỏ hàng để skip an toàn sau 2.2s. |
| **`selectRandomVideo`** | `js/background/bg-playback.js` | Lựa chọn video ngẫu nhiên tiếp theo từ kho dữ liệu. | Loại trừ video đang phát, video trong danh sách đen và ưu tiên video chưa được phát trong chu kỳ. |
| **`watchForVideoElement`** | `js/content/video/content-video-watcher.js` | Đăng ký sự kiện và áp đặt thuộc tính cho thẻ `<video>`. | Đảm bảo bật `loop` (ngăn feed tự cuộn), cấu hình `muted = false`, gán sự kiện kết thúc video và theo dõi trạng thái. |
