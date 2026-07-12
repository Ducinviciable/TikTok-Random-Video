const statusEl = document.getElementById("status");
const countEl = document.getElementById("videoCount");
const cacheTimeEl = document.getElementById("cacheTime");
const randomBtn = document.getElementById("randomBtn");
const skipBtn = document.getElementById("skipBtn");
const refreshBtn = document.getElementById("refreshBtn");
const collectMoreBtn = document.getElementById("collectMoreBtn");
const autoNextToggle = document.getElementById("autoNextToggle");
const listWrapper = document.getElementById("videoListWrapper");
const limitInput = document.getElementById("limitInput");
const usernameInput = document.getElementById("usernameInput");

let progressInterval = null;
const MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3 days cache lifetime

// Send message to background script securely
function sendMsg(data) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(data, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        } catch (e) {
            resolve(null);
        }
    });
}

// Clean and format username input
function getProfileUsername() {
    const raw = usernameInput.value.trim();
    if (!raw) return "";
    return raw.startsWith("@") ? raw : "@" + raw;
}

// Ensure username is filled before starting automation
function checkUsernameFilled() {
    const username = getProfileUsername();
    if (!username) {
        statusEl.textContent = "⚠️ Vui lòng nhập ID TikTok của bạn trước!";
        statusEl.className = "status error";
        usernameInput.focus();
        return false;
    }
    return true;
}

// Real-time progress poller during active collection
function startProgressPoller() {
    if (progressInterval) clearInterval(progressInterval);
    setLoading(true);

    progressInterval = setInterval(async () => {
        const progress = await sendMsg({ action: "getProgress" });
        if (progress && progress.isCollecting) {
            const current = progress.newCount !== undefined ? progress.newCount : 0;
            const limit = progress.limit || 100;

            if (progress.status === "catchup") {
                statusEl.textContent = `🔄 Đang cuộn bỏ qua các video cũ đã lưu...`;
            } else {
                statusEl.textContent = `🔄 Đang thu thập... (${current}/${limit})`;
            }
            statusEl.className = "status loading";
            
            updateCountText(progress.count);
        } else {
            clearInterval(progressInterval);
            progressInterval = null;

            const finalProgress = await sendMsg({ action: "getProgress" });
            const totalCount = (finalProgress && finalProgress.count) || 0;
            const newCount = (finalProgress && finalProgress.newAddedCount) || 0;

            if (newCount > 0) {
                statusEl.textContent = `✅ Thu thập video thành công! Tổng số: ${totalCount} (Thêm mới ${newCount} video)`;
            } else {
                statusEl.textContent = `✅ Thu thập video thành công! Tổng số: ${totalCount} video`;
            }
            statusEl.className = "status success";
            
            setLoading(false);
            refreshCount();

            if (listWrapper.classList.contains("show")) {
                renderVideoList();
            }
        }
    }, 1000);
}

// Display remaining cache time
function updateCacheTime() {
    chrome.storage.local.get(["collectedAt", "likedVideos"], (data) => {
        const videos = data.likedVideos || [];
        if (videos.length === 0 || !data.collectedAt) {
            cacheTimeEl.textContent = "Cache: Chưa có dữ liệu";
            return;
        }
        const age = Date.now() - data.collectedAt;
        const remaining = MAX_AGE - age;
        if (remaining <= 0) {
            cacheTimeEl.textContent = "Cache: Đã hết hạn (Đang sử dụng dữ liệu cũ)";
            return;
        }
        const diffDays = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const diffHrs = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const diffMins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

        let timeStr = "";
        if (diffDays > 0) timeStr += diffDays + " ngày ";
        if (diffHrs > 0 || diffDays > 0) timeStr += diffHrs + " giờ ";
        timeStr += diffMins + " phút";

        cacheTimeEl.textContent = "Cache hết hạn sau: " + timeStr;
    });
}

// Toggle video list visibility
countEl.addEventListener("click", async () => {
    const isShowing = listWrapper.classList.toggle("show");
    updateCountText();
    if (isShowing) {
        await renderVideoList();
    }
});

// Random button click handler
randomBtn.addEventListener("click", async () => {
    setLoading(true);
    statusEl.textContent = "⏳ Đang xử lý...";
    statusEl.className = "status loading";

    const hasCache = await sendMsg({ action: "getVideoCount" }).then(res => res && res.count > 0);
    
    if (!hasCache && !checkUsernameFilled()) {
        setLoading(false);
        return;
    }

    const limit = parseInt(limitInput.value) || 100;
    const username = getProfileUsername();

    const response = await sendMsg({ action: "randomLiked", limit: limit, username: username });

    if (!response) {
        statusEl.textContent = "❌ Extension lỗi, thử reload extension.";
        statusEl.className = "status error";
        setLoading(false);
    } else if (response.success) {
        if (response.status === "playing") {
            statusEl.textContent = "✅ Đang mở video random! (" + response.count + " video)";
            statusEl.className = "status success";
            setLoading(false);
        } else if (response.status === "navigating") {
            statusEl.textContent = "🔄 Đang mở trang cá nhân để click tab Đã thích...";
            statusEl.className = "status loading";
            startProgressPoller();
        } else {
            statusEl.textContent = "✅ Đang xử lý...";
            statusEl.className = "status success";
            setLoading(false);
        }
    } else {
        if (response.status === "not_tiktok") {
            statusEl.textContent = response.message || "❌ Hãy mở TikTok trước nhé!";
        } else {
            statusEl.textContent = "⚠️ " + (response.message || "Có lỗi xảy ra.");
        }
        statusEl.className = "status error";
        setLoading(false);
    }
});

// Skip and Delete button click handler
skipBtn.addEventListener("click", async () => {
    setLoading(true);
    statusEl.textContent = "⏳ Đang bỏ qua...";
    statusEl.className = "status loading";

    const response = await sendMsg({ action: "skipAndPlayNext" });

    if (!response) {
        statusEl.textContent = "❌ Extension lỗi, thử reload extension.";
        statusEl.className = "status error";
    } else if (response.success) {
        statusEl.textContent = "✅ Đã xoá & mở video tiếp! (" + response.count + " còn lại)";
        statusEl.className = "status success";
        refreshCount();
    } else {
        if (response.status === "not_tiktok") {
            statusEl.textContent = "❌ Bạn phải ở trang TikTok.";
        } else if (response.status === "no_videos") {
            statusEl.textContent = "⚠️ Danh sách trống. Hãy thu thập lại!";
        } else {
            statusEl.textContent = "⚠️ " + (response.message || "Có lỗi xảy ra.");
        }
        statusEl.className = "status error";
    }

    setLoading(false);
});

// Recollect from scratch button click handler
refreshBtn.addEventListener("click", async () => {
    setLoading(true);
    
    if (!checkUsernameFilled()) {
        setLoading(false);
        return;
    }

    await sendMsg({ action: "clearCache" });

    listWrapper.classList.remove("show");
    listWrapper.innerHTML = '<div class="empty-list">Chưa có video nào.</div>';
    refreshCount();
    updateCacheTime();

    statusEl.textContent = "🔄 Đang thu thập lại...";
    statusEl.className = "status loading";

    const limit = parseInt(limitInput.value) || 100;
    const username = getProfileUsername();

    const response = await sendMsg({ action: "randomLiked", limit: limit, username: username });
    if (response && response.success) {
        statusEl.textContent = "🔄 Đang mở trang cá nhân để click tab Đã thích...";
        statusEl.className = "status loading";
        startProgressPoller();
    } else {
        setLoading(false);
    }
});

// Collect More button click handler
collectMoreBtn.addEventListener("click", async () => {
    setLoading(true);

    if (!checkUsernameFilled()) {
        setLoading(false);
        return;
    }

    statusEl.textContent = "🔄 Đang quét bổ sung video...";
    statusEl.className = "status loading";

    const limit = parseInt(limitInput.value) || 100;
    const username = getProfileUsername();

    const response = await sendMsg({ action: "collectMore", limit: limit, username: username });
    if (response && response.success) {
        if (response.status === "collecting_in_place") {
            statusEl.textContent = "🔄 Đang cuộn tiếp tại chỗ để quét thêm video...";
        } else {
            statusEl.textContent = "🔄 Đang mở trang cá nhân để quét thêm video...";
        }
        statusEl.className = "status loading";
        startProgressPoller();
    } else {
        statusEl.textContent = "⚠️ " + ((response && response.message) || "Không gửi được yêu cầu.");
        statusEl.className = "status error";
        setLoading(false);
    }
});

// Toggle auto-next autoplay state
autoNextToggle.addEventListener("change", async () => {
    const enabled = autoNextToggle.checked;
    await sendMsg({ action: "setAutoNext", enabled: enabled });
    statusEl.textContent = enabled ? "⏭️ Tự chuyển video: BẬT" : "⏸️ Tự chuyển video: TẮT";
    statusEl.className = "status success";
});

// Render scraped video list inside popup UI
async function renderVideoList() {
    listWrapper.innerHTML = "";

    const response = await sendMsg({ action: "getVideoList" });
    const videos = (response && response.videos) || [];

    if (videos.length === 0) {
        listWrapper.innerHTML = '<div class="empty-list">Chưa có video nào.</div>';
        return;
    }

    videos.forEach((item, index) => {
        const url = typeof item === 'string' ? item : (item ? item.url : '');
        const thumb = (typeof item === 'object' && item && item.thumb) ? item.thumb : '';

        const div = document.createElement("div");
        div.className = "video-item";

        const img = document.createElement("img");
        img.className = "video-thumbnail";
        
        const isPlaceholder = !thumb || thumb.startsWith("data:image") || thumb.startsWith("blob:");
        img.src = isPlaceholder ? "icons/icon.png" : thumb;
        img.onerror = () => { img.src = "icons/icon.png"; };

        const info = document.createElement("div");
        info.className = "video-info";

        let displayTitle = url;
        const parts = url.split("/video/");
        if (parts.length > 1) {
            const userPart = parts[0].split("@");
            const userName = userPart.length > 1 ? "@" + userPart[1] : "Video";
            const videoId = parts[1].substring(0, 12) + "...";
            displayTitle = userName + " - " + videoId;
        }

        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.className = "video-link";
        link.textContent = displayTitle;
        link.title = url;

        info.appendChild(link);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Xoá khỏi danh sách";
        delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const res = await sendMsg({ action: "deleteVideo", index: index });
            if (res && res.success) {
                statusEl.textContent = "🗑️ Đã xoá. Còn " + res.count + " video.";
                statusEl.className = "status success";
                refreshCount();
                renderVideoList();
            }
        });

        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(delBtn);
        listWrapper.appendChild(div);
    });
}

// Synchronously reload video count and cache lifetime
async function refreshCount() {
    const response = await sendMsg({ action: "getVideoCount" });
    if (response) {
        updateCountText(response.count);
    }
    updateCacheTime();
}

function updateCountText(count) {
    if (count === undefined) {
        return;
    }
    const suffix = listWrapper.classList.contains("show") ? " (click ẩn)" : " (click xem)";
    countEl.textContent = count + " video đã thu thập" + suffix;
}

// Load autoplay status
async function loadAutoNextState() {
    const response = await sendMsg({ action: "getAutoNextState" });
    if (response) {
        autoNextToggle.checked = response.enabled;
    }
}

// UI buttons state helper
function setLoading(loading) {
    randomBtn.disabled = loading;
    skipBtn.disabled = loading;
    refreshBtn.disabled = loading;
    collectMoreBtn.disabled = loading;
    limitInput.disabled = loading;
    usernameInput.disabled = loading;
    if (loading) {
        randomBtn.classList.add("loading");
        skipBtn.classList.add("loading");
    } else {
        randomBtn.classList.remove("loading");
        skipBtn.classList.remove("loading");
    }
}

// Read settings from storage on startup
chrome.storage.local.get(["targetLimit", "tiktokUsername"], (data) => {
    if (data.targetLimit) {
        limitInput.value = data.targetLimit;
    }
    if (data.tiktokUsername) {
        usernameInput.value = data.tiktokUsername;
    }
});

limitInput.addEventListener("change", () => {
    const limit = parseInt(limitInput.value) || 100;
    chrome.storage.local.set({ targetLimit: limit });
});

usernameInput.addEventListener("change", () => {
    chrome.storage.local.set({ tiktokUsername: usernameInput.value.trim() });
});

// Initialization
refreshCount();
loadAutoNextState();
updateCacheTime();