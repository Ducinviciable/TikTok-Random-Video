// Dedicated Player button click handler
if (openPlayerBtn) {
  openPlayerBtn.addEventListener("click", async () => {
    setLoading(true);
    statusEl.textContent = "🎧 Đang mở TikTok Hi-Fi Studio...";
    statusEl.className = "status loading";

    const response = await sendMsg({ action: "openPlayerTab" });
    if (response && response.ok) {
      statusEl.textContent = "✨ Đã mở TikTok Hi-Fi Studio!";
      statusEl.className = "status success";
    } else {
      statusEl.textContent = "⚠️ Không thể mở tab Player.";
      statusEl.className = "status error";
    }
    setLoading(false);
  });
}

// Random button click handler
randomBtn.addEventListener("click", async () => {
  setLoading(true);
  statusEl.textContent = "⏳ Đang xử lý...";
  statusEl.className = "status loading";

  const hasCache = await sendMsg({ action: "getVideoCount" }).then(
    (res) => res && res.count > 0,
  );

  if (!hasCache && !checkUsernameFilled()) {
    setLoading(false);
    return;
  }

  const limit = parseInt(limitInput.value) || 100;
  const username = getProfileUsername();

  const response = await sendMsg({
    action: "randomLiked",
    limit: limit,
    username: username,
  });

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
      statusEl.textContent =
        "🔄 Đang chuyển hướng đến trang cá nhân để quét video...";
      statusEl.className = "status loading";
      startProgressPoller();
    } else {
      statusEl.textContent = "✅ Đang xử lý...";
      statusEl.className = "status success";
      setLoading(false);
    }
  } else {
    if (response.status === "not_tiktok") {
      statusEl.textContent =
        response.message || "❌ Hãy mở TikTok trước nhé!";
    } else {
      statusEl.textContent =
        "⚠️ " + (response.message || "Có lỗi xảy ra.");
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
      statusEl.textContent =
        "⚠️ " + (response.message || "Có lỗi xảy ra.");
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
      statusEl.textContent =
        "⚠️ " + (response.message || "Có lỗi xảy ra.");
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

  const response = await sendMsg({
    action: "randomLiked",
    limit: limit,
    username: username,
  });
  if (response && response.success) {
    statusEl.textContent =
      "🔄 Đang chuyển hướng đến trang cá nhân để quét lại...";
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

  const response = await sendMsg({
    action: "collectMore",
    limit: limit,
    username: username,
    smartStop: true,
  });
  if (response && response.success) {
    if (response.status === "collecting_in_place") {
      statusEl.textContent = "⚡ Đang kiểm tra video mới...";
    } else {
      statusEl.textContent =
        "⚡ Đang chuyển hướng đến trang cá nhân để cập nhật...";
    }
    statusEl.className = "status loading";
    startProgressPoller();
  } else {
    statusEl.textContent =
      "⚠️ " +
      ((response && response.message) || "Không gửi được yêu cầu.");
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

  const response = await sendMsg({
    action: "collectMore",
    limit: limit,
    username: username,
    smartStop: false,
  });
  if (response && response.success) {
    if (response.status === "collecting_in_place") {
      statusEl.textContent = "📜 Đang cuộn nối tiếp để quét video cũ...";
    } else {
      statusEl.textContent =
        "📜 Đang chuyển hướng đến trang cá nhân để quét video cũ...";
    }
    statusEl.className = "status loading";
    startProgressPoller();
  } else {
    statusEl.textContent =
      "⚠️ " +
      ((response && response.message) || "Không gửi được yêu cầu.");
    statusEl.className = "status error";
    setLoading(false);
  }
});

// Toggle auto-next autoplay state
autoNextToggle.addEventListener("change", async () => {
  const enabled = autoNextToggle.checked;
  await sendMsg({ action: "setAutoNext", enabled: enabled });
  statusEl.textContent = enabled
    ? "⏭️ Tự chuyển video: BẬT"
    : "⏸️ Tự chuyển video: TẮT";
  statusEl.className = "status success";
});

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