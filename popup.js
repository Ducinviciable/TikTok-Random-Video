const statusEl = document.getElementById("status");
const countEl = document.getElementById("videoCount");
const cacheTimeEl = document.getElementById("cacheTime");
const randomBtn = document.getElementById("randomBtn");
const skipBtn = document.getElementById("skipBtn");
const banBtn = document.getElementById("banBtn");
const refreshBtn = document.getElementById("refreshBtn");
const quickUpdateBtn = document.getElementById("quickUpdateBtn");
const deepAppendBtn = document.getElementById("deepAppendBtn");
const checkpointBanner = document.getElementById("checkpointBanner");
const checkpointText = document.getElementById("checkpointText");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importInput = document.getElementById("importInput");
const autoNextToggle = document.getElementById("autoNextToggle");
const listWrapper = document.getElementById("videoListWrapper");
const limitInput = document.getElementById("limitInput");
const usernameInput = document.getElementById("usernameInput");

let progressInterval = null;
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;

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
        const cpData = await sendMsg({ action: "getCheckpoint" });

        if (cpData && cpData.checkpoint) {
            checkpointBanner.style.display = "block";
            checkpointText.textContent = `💾 Checkpoint: Đã bảo vệ ${cpData.checkpoint.count} video`;
        } else {
            checkpointBanner.style.display = "none";
        }

        if (progress && progress.isCollecting) {
            const current = progress.newCount !== undefined ? progress.newCount : 0;
            const limit = progress.limit || 100;

            if (progress.status === "slow_network") {
                statusEl.textContent = `⚠️ Mạng yếu, vui lòng chờ... (Đã lấy ${current}/${limit} video mới)`;
            } else if (progress.status === "catchup") {
                statusEl.textContent = `🔄 [Catch-Up] Đang lướt qua video cũ... (Tổng: ${progress.count})`;
            } else {
                statusEl.textContent = `⚡ [Collecting] +${current} video mới | Tổng: ${progress.count}`;
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
                statusEl.textContent = `✅ Thu thập xong! +${newCount} video mới (Tổng: ${totalCount})`;
            } else {
                statusEl.textContent = `✅ Thu thập xong! Tổng số: ${totalCount} video`;
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
            statusEl.textContent = `✅ Đang mở video random!`;
            statusEl.className = "status success";
            setLoading(false);
        } else if (response.status === "navigating") {
            statusEl.textContent = "🔄 Đang chuyển hướng đến trang cá nhân để quét video...";
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

// Skip button click handler (normal skip)
skipBtn.addEventListener("click", async () => {
    setLoading(true);
    statusEl.textContent = "⏳ Đang bỏ qua...";
    statusEl.className = "status loading";

    const response = await sendMsg({ action: "skipAndPlayNext" });

    if (!response) {
        statusEl.textContent = "❌ Extension lỗi, thử reload extension.";
        statusEl.className = "status error";
    } else if (response.success) {
        statusEl.textContent = `✅ Đã bỏ qua & mở video tiếp!`;
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

// Ban button click handler (permanent ban)
banBtn.addEventListener("click", async () => {
    setLoading(true);
    statusEl.textContent = "⏳ Đang xoá vĩnh viễn & cấm video...";
    statusEl.className = "status loading";

    const response = await sendMsg({ action: "banAndPlayNext" });

    if (!response) {
        statusEl.textContent = "❌ Extension lỗi, thử reload extension.";
        statusEl.className = "status error";
    } else if (response.success) {
        statusEl.textContent = `🚫 Đã cấm vĩnh viễn video & mở video tiếp!`;
        statusEl.className = "status success";
        refreshCount();
    } else {
        if (response.status === "not_tiktok") {
            statusEl.textContent = "❌ Bạn phải ở trang TikTok.";
        } else if (response.status === "no_videos") {
            statusEl.textContent = "⚠️ Danh sách trống sau khi cấm.";
        } else {
            statusEl.textContent = "⚠️ " + (response.message || "Có lỗi xảy ra.");
        }
        statusEl.className = "status error";
    }

    setLoading(false);
});

// Export Backup click handler
exportBtn.addEventListener("click", async () => {
    statusEl.textContent = "⏳ Đang xuất dữ liệu sao lưu...";
    statusEl.className = "status loading";

    const data = await sendMsg({ action: "exportData" });
    if (data) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        a.href = url;
        a.download = `tiktok_liked_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusEl.textContent = `📥 Đã xuất backup (${data.likedVideos.length} video, ${data.blacklistedVideos.length} cấm)!`;
        statusEl.className = "status success";
    } else {
        statusEl.textContent = "❌ Xuất backup thất bại.";
        statusEl.className = "status error";
    }
});

// Import Backup click handler
importBtn.addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
});

importInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            statusEl.textContent = "⏳ Đang nhập dữ liệu backup...";
            statusEl.className = "status loading";

            const res = await sendMsg({ action: "importData", data: parsed });
            if (res && res.success) {
                statusEl.textContent = `✅ Đã khôi phục ${res.count} video (${res.blacklistedCount} video cấm)!`;
                statusEl.className = "status success";
                if (parsed.tiktokUsername) {
                    usernameInput.value = parsed.tiktokUsername;
                }
                if (parsed.targetLimit) {
                    limitInput.value = parsed.targetLimit;
                }
                refreshCount();
                if (listWrapper.classList.contains("show")) {
                    renderVideoList();
                }
            } else {
                statusEl.textContent = "⚠️ " + ((res && res.message) || "Nhập backup thất bại.");
                statusEl.className = "status error";
            }
        } catch (err) {
            statusEl.textContent = "❌ File JSON không đúng định dạng.";
            statusEl.className = "status error";
        }
    };
    reader.readAsText(file);
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
        statusEl.textContent = "🔄 Đang chuyển hướng đến trang cá nhân để quét lại...";
        statusEl.className = "status loading";
        startProgressPoller();
    } else {
        setLoading(false);
    }
});

// Quick Update button click handler (Smart Stop = true)
quickUpdateBtn.addEventListener("click", async () => {
    setLoading(true);

    if (!checkUsernameFilled()) {
        setLoading(false);
        return;
    }

    statusEl.textContent = "⚡ Đang kiểm tra cập nhật video mới...";
    statusEl.className = "status loading";

    const limit = parseInt(limitInput.value) || 100;
    const username = getProfileUsername();

    const response = await sendMsg({ action: "collectMore", limit: limit, username: username, smartStop: true });
    if (response && response.success) {
        if (response.status === "collecting_in_place") {
            statusEl.textContent = "⚡ Đang kiểm tra video mới...";
        } else {
            statusEl.textContent = "⚡ Đang chuyển hướng đến trang cá nhân để cập nhật...";
        }
        statusEl.className = "status loading";
        startProgressPoller();
    } else {
        statusEl.textContent = "⚠️ " + ((response && response.message) || "Không gửi được yêu cầu.");
        statusEl.className = "status error";
        setLoading(false);
    }
});

// Deep Append button click handler (Smart Stop = false)
deepAppendBtn.addEventListener("click", async () => {
    setLoading(true);

    if (!checkUsernameFilled()) {
        setLoading(false);
        return;
    }

    statusEl.textContent = "📜 Đang quét sâu nối tiếp video cũ hơn...";
    statusEl.className = "status loading";

    const limit = parseInt(limitInput.value) || 100;
    const username = getProfileUsername();

    const response = await sendMsg({ action: "collectMore", limit: limit, username: username, smartStop: false });
    if (response && response.success) {
        if (response.status === "collecting_in_place") {
            statusEl.textContent = "📜 Đang cuộn nối tiếp để quét video cũ...";
        } else {
            statusEl.textContent = "📜 Đang chuyển hướng đến trang cá nhân để quét video cũ...";
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

        const btnGroup = document.createElement("div");
        btnGroup.style.cssText = "display:flex;gap:4px;flex-shrink:0;";

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Xoá khỏi danh sách tạm";
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

        const banItemBtn = document.createElement("button");
        banItemBtn.className = "delete-btn";
        banItemBtn.textContent = "🚫";
        banItemBtn.title = "Cấm vĩnh viễn video này";
        banItemBtn.style.color = "#ef233c";
        banItemBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const res = await sendMsg({ action: "banVideo", index: index });
            if (res && res.success) {
                statusEl.textContent = "🚫 Đã cấm vĩnh viễn. Còn " + res.count + " video.";
                statusEl.className = "status success";
                refreshCount();
                renderVideoList();
            }
        });

        btnGroup.appendChild(delBtn);
        btnGroup.appendChild(banItemBtn);

        div.appendChild(img);
        div.appendChild(info);
        div.appendChild(btnGroup);
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
    banBtn.disabled = loading;
    refreshBtn.disabled = loading;
    quickUpdateBtn.disabled = loading;
    deepAppendBtn.disabled = loading;
    exportBtn.disabled = loading;
    importBtn.disabled = loading;
    limitInput.disabled = loading;
    usernameInput.disabled = loading;
    if (loading) {
        randomBtn.classList.add("loading");
        skipBtn.classList.add("loading");
        banBtn.classList.add("loading");
    } else {
        randomBtn.classList.remove("loading");
        skipBtn.classList.remove("loading");
        banBtn.classList.remove("loading");
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