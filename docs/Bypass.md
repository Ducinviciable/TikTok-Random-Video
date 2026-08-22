# Tài liệu Cơ chế Bypass Chống chặn & Chống Siết Tài nguyên (Bypass & Anti-Detection Architecture)

Tài liệu này cung cấp bản phân tích chuyên sâu về hệ thống **Bypass Chống chặn (Anti-Detect)**, **Ngụy trang hành vi người dùng (Behavioral Simulation)** và **Chống siết tài nguyên chạy nền (Chromium Throttling Bypass)** của Extension TikTok Random Liked.

---

## 1. Tổng quan Kiến trúc Đa tầng (Multi-Layer Overview)

Hệ thống bảo vệ của Extension được tổ chức thành 6 lớp (Layer 1 $\rightarrow$ Layer 6) tại Content Script kết hợp với tầng điều phối chống nghẽn (Tiered Cooldown & Watchdog) tại Background Service Worker:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               KIẾN TRÚC PHÒNG THỦ & BYPASS                              │
├─────────┬───────────────────────────┬───────────────────────────────────────────────────┤
│ Tầng    │ Tên Cơ chế                │ Nhiệm vụ Cốt lõi                                  │
├─────────┼───────────────────────────┼───────────────────────────────────────────────────┤
│ Layer 1 │ Visibility State Spoofing │ Ghi đè document.hidden / visibilityState          │
│ Layer 2 │ Focus & Blur Interception │ Đánh chặn blur/focus, định kỳ dispatch focus giả  │
│ Layer 3 │ Navigator Fingerprint     │ Ngụy trang navigator.webdriver và platform        │
│ Layer 4 │ Behavioral Simulation     │ Chuột Bézier, Hover Dwell, Nghỉ ngơi Milestone    │
│ Layer 5 │ Telemetry Interceptor     │ Chặn gửi dữ liệu hành vi đến Slardar/MSSDK/Mon    │
│ Layer 6 │ Playback & Soft Recovery  │ Khôi phục Please Wait (Phase A-D), Stuck Monitor  │
│ BG SW   │ Tiered Cooldown Watchdog  │ Phục hồi lỗi 403 phân tầng (10s -> 20s -> 65s)   │
└─────────┴───────────────────────────┴───────────────────────────────────────────────────┘
```

---

## 2. Chi tiết Từng Cơ chế: Vấn đề - Xử lý - Tác động

---

### 🔹 Layer 1 & 2: Visibility & Focus Spoofing (Ngụy trang Hiển thị & Tiêu điểm)

#### 1. Vấn đề giải quyết:
* Khi người dùng chuyển sang tab khác hoặc thu nhỏ trình duyệt, Chromium tự động chuyển trạng thái `document.visibilityState = "hidden"` và phát sự kiện `blur`.
* Script của TikTok Web lắng nghe các sự kiện này để **ngay lập tức tạm dừng (pause) video**, ngừng nạp luồng đệm (buffering), hoặc gửi tín hiệu về máy chủ rằng tab đang không được người dùng theo dõi.

#### 2. Cơ chế xử lý của hệ thống:
* **Ghi đè thuộc tính**: Ghi đè các getter của `document.hidden` (luôn trả về `false`), `document.visibilityState` (luôn trả về `"visible"`) và `document.hasFocus()` (luôn trả về `true`).
* **Đánh chặn sự kiện**: Bắt và chặn triệt để sự kiện `visibilitychange` và `blur` ở giai đoạn Capture Phase (`stopImmediatePropagation()`).
* **Kích hoạt sự kiện giả lập**: Định kỳ phát sự kiện `focus` giả lập lên `window` và `document` để duy trì trạng thái active.
* **Ngụy trang Native Code**: Ghi đè `Function.prototype.toString` qua `_stealthRegister()` để trả về chuỗi `function hasFocus() { [native code] }`, vượt qua các bài kiểm tra hàm native của WAF.

#### 3. Tác động & Hành vi thực tế:
* **Phát liên tục dưới nền**: Video vẫn tiếp tục phát mượt mà, tải dữ liệu liên tục ngay cả khi người dùng đang làm việc ở cửa sổ hoặc ứng dụng khác.
* **Không cướp Focus**: Hoàn toàn không tự ý giật tiêu điểm chuột hay cửa sổ của người dùng.
* **Tự động kích hoạt lại khi mở tab**: Khi tab được mở lại thực tế, nếu video đang bị đơ hoặc pause thì hệ thống sẽ tự động gọi `.play()` để tiếp tục.

---

### 🔹 Giữ kết nối ẩn thông qua Âm thanh (Silent Audio Keep-Alive)

#### 1. Vấn đề giải quyết:
* Chromium áp dụng chính sách siết tài nguyên rất mạnh (Aggressive Throttling) đối với các tab chạy nền: đóng băng Timer (`setInterval`/`setTimeout` bị trễ từ vài giây đến hàng phút), tạm ngắt giải mã video và hạ độ ưu tiên mạng.

#### 2. Cơ chế xử lý của hệ thống:
* Khởi tạo một `AudioContext` cùng một bộ dao động âm thanh (`OscillatorNode`) và `GainNode` với âm lượng cực nhỏ (`gain.value = 0.00001` - hoàn toàn không phát ra tiếng cho tai người nghe).
* Tự động nối luồng âm thanh tĩnh này vào `audioContext.destination`.

#### 3. Tác động & Hành vi thực tế:
* **Nâng quyền ưu tiên tiến trình**: Trình duyệt nhận diện tab đang phát âm thanh đa phương tiện, từ đó tự động giữ cho tiến trình render của tab ở mức ưu tiên cao.
* **Bộ đếm thời gian không bị đóng băng**: Các vòng lặp kiểm tra stuck monitor (1s), playback check (1.5s) và cào dữ liệu chạy đúng lịch trình mili-giây, không bị Chromium làm trễ.

---

### 🔹 Layer 3: Navigator & Môi trường Trình duyệt (Anti-Automation)

#### 1. Vấn đề giải quyết:
* Các hệ thống WAF hiện đại (Akamai Bot Manager, Cloudflare) kiểm tra các thuộc tính tự động hóa như `navigator.webdriver = true` để nhận diện công cụ bot / headless browser.

#### 2. Cơ chế xử lý của hệ thống:
* Định nghĩa lại getter `navigator.webdriver` trả về `false` hoặc `undefined`.
* Giả lập danh sách `navigator.plugins` và `navigator.languages` đầy đủ như trình duyệt người dùng thông thường.

#### 3. Tác động & Hành vi thực tế:
* **Nâng cao Trust Score**: Tránh việc tài khoản bị đưa vào danh sách đen (Blacklist) hoặc bị yêu cầu giải mã Captcha phức tạp khi chạy nhiều lượt xem liên tục.

---

### 🔹 Layer 4: Mô phỏng Hành vi Tự nhiên (Behavioral Simulation)

#### 1. Vấn đề giải quyết:
* Bot thông thường không di chuyển chuột hoặc "teleport" tức thì (nhảy tọa độ $(X_1, Y_1) \rightarrow (X_2, Y_2)$ trong $0\text{ms}$). Thuật toán phân tích cử chỉ hành vi của Akamai sẽ gắn cờ "bot" ngay lập tức nếu phát hiện không có sự kiện `mousemove`/`pointermove` tự nhiên.

#### 2. Cơ chế xử lý của hệ thống:
* **Cubic Bézier Trajectory Engine**: Sinh quỹ đạo di chuyển chuột mô phỏng đường cong tự nhiên gồm 14–18 điểm trung gian với độ trễ 18–26ms mỗi bước.
* **Smoothstep Easing & Vi sai rung tay**: Áp dụng gia tốc theo định luật Fitts ($3t^2 - 2t^3$) kết hợp độ rung vi sai ngẫu nhiên $\pm 3\text{--}8\text{px}$ để tái tạo chuyển động tay người.
* **Hover Dwell (Dừng ngắm)**: Di chuyển chuột có chủ đích vào các vùng nội dung (khung video, avatar tác giả, dòng caption) và dừng lại từ 300–800ms.
* **Cuộn ngược ngẫu nhiên (Reverse Scroll)**: Xác suất 3–5% sau khi cuộn xuống sẽ có một cú cuộn ngược nhẹ lên trên (180–320px) như người dùng đang xem lại nội dung vừa lướt qua.
* **Nghỉ giải lao định kỳ (Milestone Idle Break)**: Sau mỗi 40–70 lượt hành động, hệ thống đưa phiên làm việc vào trạng thái **nghỉ ngơi hoàn toàn 8–15 giây**.

#### 3. Tác động & Hành vi thực tế:
* **Tạm dừng thao tác (Nghỉ 8–15s)**: Hệ thống sẽ tạm dừng việc lướt hoặc cào dữ liệu trong khoảng 8–15s để xả tải và mô phỏng việc người dùng đang đọc bình luận hoặc xem kỹ video.
* **Kích hoạt Nudge theo ngữ cảnh**:
  - Khi video sắp hết / vừa hết: Chuột giả lập cử chỉ rê về phía điều hướng.
  - Khi gặp màn hình trắng / lỗi: Chuột giả lập rung lắc nhẹ để kích thích renderer của trình duyệt cập nhật lại layout.

---

### 🔹 Layer 5: Chặn Thu thập Dữ liệu Hành vi (Telemetry Interception)

#### 1. Vấn đề giải quyết:
* TikTok Web nhúng các bộ SDK giám sát lỗi và hành vi (Slardar, MSSDK, Mon, Log SDK). Các SDK này âm thầm gửi log chi tiết về tốc độ cuộn, thời gian xem, tọa độ click và lỗi JS về máy chủ TikTok.

#### 2. Cơ chế xử lý của hệ thống:
* Can thiệp vào `XMLHttpRequest.prototype.open/send`, `window.fetch` và `navigator.sendBeacon`.
* Chặn hoàn toàn các request hướng đến các domain/endpoint:
  `log.tiktokv.com`, `mon.snssdk.com`, `mon.tiktokv.com`, `ib.tiktokv.com`, `/api/v1/report`, `/api/v1/track`, `slardar`, `mssdk`, `webmssdk`, `byteoversea`, `frontier`.
* Khi bị chặn, hàm `fetch` giả lập phản hồi thành công `HTTP 200 OK` rỗng (`{}`) để SDK của TikTok không phát sinh lỗi ngoại lệ (exception).

#### 3. Tác động & Hành vi thực tế:
* **Vô hiệu hóa việc gửi báo cáo**: TikTok không nhận được các bản ghi nhật ký telemetry bất thường.
* **Bảo toàn xác thực**: Tuyệt đối không chặn các endpoint đăng nhập/xác thực tài khoản (như `/passport/web/account/info/` hay `/api/user/detail/`).

---

### 🔹 Layer 6: Tự phục hồi Playback & Xử lý "Please Wait"

#### 1. Vấn đề giải quyết:
* Trong quá trình chuyển video liên tục, TikTok có thể hiện popup overlay `"Please Wait"` (Vui lòng chờ) hoặc `"Try Again"` (Thử lại) do mạng chậm hoặc WAF tạm thời pend request. Nếu reload cứng (F5), WAF sẽ tăng mức độ chặn.

#### 2. Cơ chế xử lý của hệ thống:
* **Tự động đóng modal**: Tự động tìm và bấm các nút đóng/thử lại (`close`, `dismiss`, `retry`).
* **Lọc gián đoạn ngắn (< 12s)**: Nếu overlay biến mất trong vòng dưới 12 giây, hệ thống bỏ qua và không ngắt quãng video.
* **Chuỗi Phục hồi Mềm 4 bước (Khi kẹt > 12s)**:
  - **Phase A (Micro-scrolls)**: Cuộn nhẹ lên/xuống $\pm 50\text{px}$ để ép trình duyệt vẽ lại giao diện.
  - **Phase B (Focus Flash)**: Bắn sự kiện focus/visibility để đánh thức renderer.
  - **Phase C (Chờ tự do 5s)**: Tạm dừng 5 giây cho WAF tự giải phóng kết nối.
  - **Phase D (Chuyển video SPA)**: Nếu sau 5s vẫn kẹt $\rightarrow$ gọi `requestNextVideo()` để chuyển sang video khác qua SPA (không reload tab).

#### 3. Tác động & Hành vi thực tế:
* **Chờ đợi thông minh**: Chờ 12s + 5s trước khi quyết định bỏ qua video bị lỗi.
* **Thông báo Toast**: Hiển thị thông báo màu vàng thân thiện: *"⚠️ Vui lòng chờ kéo dài → Đang thử tự phục hồi..."* để người dùng nắm được tiến trình.

---

### 🔹 Background Watchdog & Phục hồi lỗi 403 Phân tầng (Tiered Cooldown)

#### 1. Vấn đề giải quyết:
* Khi gặp lỗi 403 Forbidden, Access Denied hoặc trang trắng, nếu background liên tục gọi đổi video dồn dập (stampeding), máy chủ WAF sẽ nhận diện là hành vi tấn công từ chối dịch vụ (DDoS/Spam) và ban IP dài hạn.

#### 2. Cơ chế xử lý của hệ thống:
* **Thuật toán Cooldown Đa cấp (Exponential Backoff)**:
  - **Lần 1**: Tạm dừng thao tác, ngủ nghỉ **10 giây**.
  - **Lần 2 liên tiếp**: Tăng thời gian ngủ nghỉ lên **20 giây**.
  - **Lần 3+ liên tiếp**: Đưa hệ thống vào trạng thái ngủ sâu (**Deep Sleep 65 giây**), hiển thị cảnh báo WAF cho người dùng.
* **Đệm trễ chống xung đột (Anti-Stampeding 1.8s)**: Background Watchdog luôn chờ thêm 1.8 giây trước khi can thiệp, ưu tiên cho Content Script tự xử lý trước qua kênh SPA.
* **Cơ chế Tự động Reset**: Sau **5 phút** phát video bình thường không gặp lỗi, bộ đếm lỗi liên tiếp sẽ tự động reset về `0`.

#### 3. Tác động & Hành vi thực tế:
* **Ngừng khẩn cấp khi bị chặn**: Khi WAF siết chặt, hệ thống không cố đấm ăn xôi mà tự động hạ nhiệt kết nối (nghỉ 10s $\rightarrow$ 20s $\rightarrow$ 65s).
* **Điều hướng 100% qua SPA**: Luôn ưu tiên dùng tin nhắn `navigateToVideo` (`window.location.href = url`), tuyệt đối không dùng `chrome.tabs.update(url)` trừ khi Content Script chết hẳn.

---

---

## 3. Cơ chế Bảo vệ & Bypass Dành Riêng cho TikTok Hi-Fi Studio

Bên cạnh 6 tầng bảo vệ cho tab TikTok Web thông thường, trình phát độc lập **TikTok Hi-Fi Studio** ([`player.html`](file:///d:/A.Myself/Random-Video/player.html)) sở hữu kiến trúc phòng thủ mạng chuyên biệt:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      HI-FI STUDIO NETWORK ISOLATION & BYPASS                           │
├──────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Cơ chế                   │ Nguyên lý & Tác động phòng vệ                               │
├──────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 1. Proxy Stream Shield   │ Luồng media qua TikWM/Cobalt/TikSave proxy, ẩn hoàn toàn IP │
│                          │ và định danh client khỏi máy chủ CDN của ByteDance.         │
│ 2. Declarative Net Req   │ Rule 99002 tự động chèn Referer & Origin https://tiktok.com │
│    (DNR Rule 99002)      │ cho các request media trực tiếp từ chrome-extension://.     │
│ 3. Healing Rate-Limiter  │ Giãn cách tối thiểu 5 phút cho mỗi URL canonical lỗi, triệt│
│                          │ tiêu nguy cơ spam API làm nghẽn máy chủ.                    │
│ 4. RAM Caching 20 Min    │ Lưu tạm link CDN trong RAM, tái sử dụng 0ms không gọi mạng. │
└──────────────────────────┴─────────────────────────────────────────────────────────────┘
```

1. **Proxy Stream Shield (Cách ly nguồn phát)**: Thay vì kết nối trực tiếp đến các endpoint CDN hạn chế cookie của TikTok, `player.html` định tuyến luồng qua các proxy stream an toàn (`TikWM`, `Cobalt`, `TikSave`). Điều này giúp người dùng nghe nhạc $100\%$ không lo bị dính WAF 403, Captcha hay bị chặn IP.
2. **DNR Header Injection (Rule 99002)**: Khi buộc phải tải trực tiếp từ TikTok CDN, Background Service Worker kích hoạt bộ quy tắc Declarative Net Request cô lập, tự động bổ sung:
   - `Referer: https://www.tiktok.com/`
   - `Origin: https://www.tiktok.com`
   - Bổ sung `Access-Control-Allow-Origin: *` cho riêng extension tab, cho phép `AudioContext` kết nối DSP mà không vi phạm chính sách bảo mật CORS.
3. **Healing Queue Rate-Limiter**: Khi gặp bài hát bị lỗi link hoặc hỏng stream, bộ nhớ `recentlyEnqueuedHealing` sẽ chặn không cho bài hát đó gửi lại request hồi sinh trong vòng **5 phút**. Điều này bảo vệ máy chủ giải mã và tránh tạo ra các vòng lặp request bất tận.

---

## 4. Bảng Tổng hợp Tác động & Hành vi Hệ thống

| Tình huống / Sự kiện | Hành vi Xử lý Cụ thể | Thời gian Chờ / Nghỉ | Tác động Điều hướng / Playback |
| :--- | :--- | :--- | :--- |
| **Tab chuyển xuống chạy nền** | Kích hoạt Silent Audio, chặn `blur`/`hidden`, tăng delay ngẫu nhiên. | Không chờ (chạy ngầm tức thì) | Video tiếp tục phát bình thường, không bị Chromium pause. |
| **Video bị đứng hình (Stuck)** | Giây 4 log $\rightarrow$ Giây 5 thử Soft Recovery (`.load()` + `currentTime=0.05` + `.play()`) $\rightarrow$ Giây 6 skip. | 6 giây tối đa | Tự động chuyển sang video tiếp theo nếu không thể cứu video cũ. |
| **Gặp modal "Please Wait"** | Thử click Close $\rightarrow$ Nếu kéo dài > 12s, chạy chuỗi phục hồi 4 bước (A-D). | 12s + 5s chờ giải phóng | Nếu sau 17s vẫn kẹt, tự động đổi video mới qua SPA. |
| **Phát hiện lỗi 403 / Trang trắng** | Áp dụng Cooldown đa tầng, tạm hoãn gọi background, chuyển video ngẫu nhiên mới. | Lần 1: 10s<br>Lần 2: 20s<br>Lần 3: 65s (Deep Sleep) | Tạm dừng toàn bộ thao tác, hiện Toast cảnh báo, sau đó mới đổi video. |
| **Xem nhiều video liên tục** | Sau mỗi 40–70 lượt hành động, kích hoạt Milestone Idle Break. | 8 – 15 giây nghỉ ngơi hoàn toàn | Tạm ngừng cuộn / chuyển video trong 8–15s để mô phỏng người dùng dừng xem. |
| **Video kém hứng thú (Low Interest)** | Đánh dấu 10% video skip sớm ở mốc 30% – 80% thời lượng. | Không chờ (skip giữa chừng) | Chuyển video sớm tự nhiên như người dùng thật lướt qua video chán. |
| **Cào dữ liệu danh sách cũ (Catch-Up)** | Bật Fast Catch-Up, giảm delay, bỏ qua thumbnail, đóng băng `noNewCount = 0`. | 300 – 500 ms mỗi lần cuộn | Cuộn siêu tốc qua 1700+ video cũ mà không bị dừng sớm hay tràn RAM. |
| **Hi-Fi Stream bị lỗi CDN / 403** | Đưa vào Healing Queue, kích hoạt Rate-Limit 5 phút, tự chuyển bài tiếp theo. | Tức thì (cooldown 5 phút/URL) | Không làm đứt mạch nghe nhạc, tự động sửa lỗi ngầm trong background. |

---

## 5. Nguyên tắc Bất biến & Điều Cấm kỵ (Hard Guardrails)

1. **Tuyệt đối KHÔNG xóa Cookie Akamai**: Không bao giờ xóa hoặc can thiệp vào các cookie `_abck`, `bm_sv`, `bm_sz`. Đây là các token định danh phiên của WAF; việc xóa chúng sẽ lập tức kích hoạt mã phản hồi HTTP 403 Access Denied.
2. **Tuyệt đối KHÔNG Reload cứng trang (`location.reload()` hoặc `chrome.tabs.reload()`)**: Việc tải lại trang toàn bộ sẽ phá hủy phiên làm việc của SPA, làm mất các biến trạng thái và khiến WAF đánh giá lại toàn bộ vân tay trình duyệt.
3. **Tuyệt đối KHÔNG cướp Focus của người dùng**: Mọi cơ chế xử lý lỗi, phát video nền và phục hồi phải diễn ra hoàn toàn vô hình, không được tự ý kích hoạt tab TikTok lên màn hình làm gián đoạn công việc của người dùng.
4. **Luôn bảo toàn giới hạn thời gian tối thiểu giữa 2 lần chuyển video**: Giữ khoảng giãn cách tối thiểu $\ge 2.0\text{s}$ để tránh việc nhảy video liên hồi kích hoạt cơ chế chống spam của TikTok.
5. **Không tự động Blacklist video khi gặp lỗi mạng / 403**: Lỗi 403 chỉ là hạn chế nhất thời của đường truyền hoặc WAF, không phải video bị xóa. Chỉ có người dùng mới có quyền cấm vĩnh viễn video vào Blacklist.