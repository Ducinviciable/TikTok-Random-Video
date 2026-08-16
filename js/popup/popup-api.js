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

      if (listWrapper.classList.contains("show") && typeof renderVideoList === "function") {
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
