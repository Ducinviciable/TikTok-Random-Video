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
        if (listWrapper.classList.contains("show") && typeof renderVideoList === "function") {
          renderVideoList();
        }
      } else {
        statusEl.textContent =
          "⚠️ " + ((res && res.message) || "Nhập backup thất bại.");
        statusEl.className = "status error";
      }
    } catch (err) {
      statusEl.textContent = "❌ File JSON không đúng định dạng.";
      statusEl.className = "status error";
    }
  };
  reader.readAsText(file);
});
