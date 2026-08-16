// Toggle video list visibility
countEl.addEventListener("click", async () => {
  const isShowing = listWrapper.classList.toggle("show");
  updateCountText();
  if (isShowing) {
    await renderVideoList();
  }
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
    const url = typeof item === "string" ? item : item ? item.url : "";
    const thumb =
      typeof item === "object" && item && item.thumb ? item.thumb : "";

    const div = document.createElement("div");
    div.className = "video-item";

    const img = document.createElement("img");
    img.className = "video-thumbnail";

    const isPlaceholder =
      !thumb ||
      thumb.startsWith("data:image") ||
      thumb.startsWith("blob:");
    img.src = isPlaceholder ? "icons/icon.png" : thumb;
    img.onerror = () => {
      img.src = "icons/icon.png";
    };

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
        statusEl.textContent =
          "🚫 Đã cấm vĩnh viễn. Còn " + res.count + " video.";
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
