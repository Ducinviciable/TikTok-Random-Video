# Bảng Tham Số & Hàm Quan Trọng (TikTok Random Liked v3.5.4)

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
| **`pureDirectEnabled`** | `player-audio.js` | Trạng thái Bật/Tắt chế độ âm mộc Pure Direct (Bypass 100% DSP). | Khi `true`, định tuyến tín hiệu trực tiếp qua `directBranchGain`, bỏ qua toàn bộ EQ và Compressor. | Giữ trọn vẹn chất âm $1:1$ nguyên bản từ nguồn thu. |
| **`normalizerEnabled`** | `player-audio.js` | Trạng thái Bật/Tắt bộ nén cân bằng âm lượng tự động. | Điều hướng luồng âm thanh qua `DynamicsCompressorNode` + `makeupGainNode`. | Mặc định `true` trong chế độ Hi-Fi DSP. |
| **`recentlyEnqueuedHealing`**| `player-app.js` | Bảng Map lưu vết các video vừa gửi vào hàng đợi hồi sinh kèm timestamp. | Ngăn chặn việc gửi liên tục các yêu cầu hồi sinh cho cùng 1 bài hát bị lỗi. | Cooldown cố định **5 phút** cho mỗi URL canonical. |

---

## 2. Khoảng Thời Gian & Chu Kỳ (Timers & Intervals)

| Tên thông số | Giá trị mặc định | Vai trò | Ghi chú thêm |
| :--- | :--- | :--- | :--- |
| **Cuộn Catch-Up** | `300 - 500 ms` (ngẫu nhiên) | Khoảng chờ cuộn trong safe territory (video cũ). | Tối ưu hóa thời gian quét qua vùng dữ liệu cũ đã lưu. |
| **Cuộn bình thường** | `700 - 1300 ms` (+ delay lũy tiến) | Khoảng chờ cuộn tự nhiên ở vùng video mới. | Tăng dần delay khi tập dữ liệu cào được ngày càng lớn để giảm tải trình duyệt. |
| **DOM Rest Delay** | `2500 ms` sau mỗi `100` lần cuộn | Khoảng nghỉ tạm thời của tiến trình cuộn. | Bị bỏ qua trong chế độ Catch-Up để chạy nhanh nhất có thể. |
| **Stuck Threshold** | `6 giây` (kiểm tra mỗi `1s`) | Thời gian tối đa cho phép video đứng hình trên tab TikTok. | Giây thứ 4 log chẩn đoán; giây thứ 5 kích hoạt Soft Recovery; giây thứ 6 skip video. |
| **Player Watchdog Timeout**| `12 giây` (kiểm tra mỗi `1s`) | Thời gian tối đa cho phép bài hát đứng hình trên Player Hi-Fi. | Tự động chuyển bài an toàn nếu audio bị đứng quá 12s. |
| **Please Wait Recovery** | `12 giây` (kiểm tra mỗi `4s`) | Thời gian chờ tối đa khi xuất hiện popup "Please Wait". | Sau 12s, kích hoạt chuỗi phục hồi mềm (Phase A-D) thay vì ép F5 tải lại trang. |
| **Throttle chuyển video** | `2.0 giây` (2000ms) | Giãn cách tối thiểu giữa 2 lần yêu cầu `playNext`. | Chặn spam lệnh chuyển video làm WAF đánh giá hành vi bot. |
| **Watchdog Buffer Delay** | `1.8 giây` (1800ms) | Khoảng trễ trước khi Watchdog can thiệp chuyển video. | Tránh tranh chấp khi Content Script đang tự thực hiện SPA navigation. |
| **Cooldown Tier 1** | `10 giây` (10000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ nhất. | Giảm tần suất request tải trang liên tục khi WAF bắt đầu chặn. |
| **Cooldown Tier 2** | `20 giây` (20000ms) | Thời gian tạm nghỉ khi gặp lỗi 403 lần thứ hai liên tiếp. | Tăng gấp đôi thời gian cooldown phòng vệ. |
| **Cooldown Tier 3** | `65 giây` (65000ms) | Thời gian tạm nghỉ sâu khi gặp lỗi 403 từ lần thứ ba liên tiếp. | Đưa hệ thống vào trạng thái ngủ đông tạm thời, hiển thị Toast cảnh báo người dùng. |
| **Crossfade Duration** | `2.5 giây` (0.1s – 5.0s) | Thời gian chuyển tiếp âm lượng giữa 2 bài (Fade-in/Fade-out). | Kích hoạt tự động khi bài hát còn $\le \text{crossfadeDuration}$. |
| **CDN Cache TTL** | `20 phút` (1200000ms) | Thời gian sống của link CDN trích xuất ngầm trong RAM. | Đảm bảo link luôn tươi, tự làm mới khi hết hạn chữ ký `x-expires`. |
| **Healing Queue Cooldown**| `5 phút` (300000ms) | Giãn cách gửi yêu cầu hồi sinh trên cùng 1 video. | Ngăn ngừa tình trạng request spam làm quá tải resolver server. |
| **Resolver Request Timeout**| `8.0 giây` (8000ms) | Thời gian chờ tối đa cho mỗi endpoint API phân giải stream. | Tự động nhảy sang cấp độ fallback tiếp theo nếu vượt quá 8s. |

---

## 3. Tham Số Bộ Xử Lý Âm Thanh DSP (Hi-Fi Studio)

| Tham số / Node | Dải giá trị | Giá trị mặc định | Chức năng kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Master Volume** | `0.0` đến `1.0` | `1.0` (100%) | Âm lượng xuất master, loại bỏ mức sụt giảm $-2.85\text{ dB}$, lưu vào `localStorage`. |
| **10-Band EQ Frequencies** | `[32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k]` Hz | 10 Dải tần chuẩn ISO | Điều chỉnh độc lập từng dải qua `BiquadFilterNode` (`peaking` / `lowshelf` / `highshelf`, $Q=1.4$). |
| **EQ Gain Range** | `-12 dB` đến `+12 dB` | `0 dB` (Flat) | Tăng giảm cường độ từng dải tần số. |
| **EQ Presets** | Flat, Bass Boost, Vocal, Electronic, Lofi | `Flat` (Chuẩn) | Các cấu hình Equalizer tối ưu sẵn cho từng thể loại nhạc. |
| **Bass Boost Curve** | `[3, 4, 5, 4, 2, 1, 0, 0, 0, 0]` dB | Tập trung 125–250Hz | Tăng cường dải mid-bass ấm áp, bảo toàn không gian headroom cho dải cao. |
| **Dynamics Compressor** | Threshold: `-12 dBFS`, Ratio: `2:1`, Knee: `15`, Attack: `10ms`, Release: `200ms` | Bật (`on`) | Nén nhẹ nhàng để kiểm soát dải động mà không làm nát chi tiết âm học. |
| **Makeup Gain Node** | `+3.5 dB` (`gain = 1.496`) | Bật cố định sau Comp | Bù đắp lượng suy hao do nén động lực học, giữ cho âm lượng tổng thể luôn đầy đặn. |
| **Volume Booster** | `1.0x` (Chuẩn), `1.25x` (+2dB), `1.5x` (+3.5dB), `2.0x` (+6dB) | `1.0x` | Khuếch đại âm lượng qua `masterGainNode` cho các video thu âm nhỏ. |
| **Spectrum Visualizer FFT** | `fftSize = 128`, 32 Bars, `smoothing = 0.8` | 32 Cột sóng động | Trích xuất dữ liệu phổ tần số thực tế theo thời gian thực từ `AnalyserNode`. |

---

## 4. Các Hàm Cốt Lõi (Key Functions)

| Tên hàm | Vị trí định nghĩa | Vai trò | Ảnh hưởng |
| :--- | :--- | :--- | :--- |
| **`handleRefreshCdnUrl`** | `js/background/bg-player.js` | Bộ trích xuất CDN JIT ngầm (TikWM Proxy $\rightarrow$ Fallback). | Trả về stream `.mp4` đầy đủ âm thanh cho Player Studio mà không mở bất kỳ tab TikTok nào. |
| **`_resolveWithFallbacks`** | `js/background/bg-fallback.js` | Quản lý định tuyến fallback phân giải luồng media qua 4 cấp. | Đảm bảo tỷ lệ phân giải thành công $100\%$ ngay cả khi một dịch vụ bị nghẽn. |
| **`setSoundMode`** | `js/player/player-app.js` | Chuyển đổi giữa chế độ `Hi-Fi DSP` và `Pure Direct`. | Điều phối gain routing và cập nhật trạng thái UI/DSP trong 1 click. |
| **`setPureDirect`** | `js/player/player-audio.js` | Bật/Tắt chế độ phát âm mộc $1:1$ Bit-perfect. | Thiết lập `dspBranchGain = 0`, `directBranchGain = 1` hoặc ngược lại. |
| **`updateBooster`** | `js/player/player-app.js` | Cập nhật hệ số khuếch đại Volume Booster. | Áp dụng hệ số ($1.0\times - 2.0\times$) và cập nhật giao diện button group. |
| **`getAudioMetrics`** / **`logAudioDiagnostics`** | `js/player/player-audio.js` | Đo lường mức tín hiệu RMS & Peak dBFS theo thời gian thực. | Cung cấp số liệu chính xác để đối chiếu A/B với TikTok web player. |
| **`enqueueForHealing`** | `js/player/player-app.js` | Đưa video gặp lỗi vào hàng đợi tự phục hồi. | Áp dụng rate-limit 5 phút và gửi tin nhắn `enqueueForHealing` về Background. |
| **`updateSourceBadge`** | `js/player/player-app.js` | Hiển thị huy hiệu nguồn phát media (`TIKWM PROXY`, `DIRECT CDN`, `RAM CACHED`). | Giúp người dùng nhận biết tức thì kênh dữ liệu đang được sử dụng. |
| **`playTrack`** | `js/player/player-audio.js` | Khởi tạo AudioContext và phát nhạc trên kênh active. | Hủy scheduled values, gán gain `1.0` và kích hoạt chuỗi Web Audio DSP. |
| **`performCrossfade`** | `js/player/player-audio.js` | Chuyển bài mượt mà không khoảng lặng giữa 2 kênh A/B. | Fade-in kênh mới từ `0.001` lên `1.0` đồng thời Fade-out kênh cũ xuống `0.001` trong 2.5s. |
| **`triggerTiered403Recovery`** | `js/background/bg-recovery.js` | Điều phối tổng thể phục hồi lỗi 403 và Access Denied. | Tính toán Cooldown phù hợp theo cấp độ, tạm hoãn và gọi `handleRandomLiked` để đổi video. |
| **`performDomCleanup`** | `js/content/crawler/content-checkpoint.js` | Dọn dẹp các thẻ video đã cào xong ra khỏi DOM. | Giữ số lượng Liked cards trong DOM luôn $\le 150$ thẻ (khi vượt quá 200) và lưu checkpoint. |
| **`selectRandomVideo`** | `js/background/bg-playback.js` | Lựa chọn video ngẫu nhiên tiếp theo từ kho dữ liệu. | Loại trừ video đang phát, video trong danh sách đen và ưu tiên video chưa được phát trong chu kỳ. |
| **`watchForVideoElement`** | `js/content/video/content-video-watcher.js` | Đăng ký sự kiện và áp đặt thuộc tính cho thẻ `<video>`. | Đảm bảo bật `loop` (ngăn feed tự cuộn), cấu hình `muted = false`, gán sự kiện kết thúc video và theo dõi trạng thái. |

