// Module: bg-recovery.js
// Responsibilities: Tiered 403 Backoff Recovery, Tab Diagnostics, Watchdog Ping, Tab Listeners

let tabNavTimestamps = {};
let consecutive403Count = 0;
let last403TriggerTime = 0;
let isRecoveryInProgress = false;
let errorFreeResetTimer = null;

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTieredCooldown(count) {
  if (count <= 1) return 10000;
  if (count === 2) return 20000;
  return 65000;
}

function resetErrorFreeWindow() {
  if (errorFreeResetTimer) clearTimeout(errorFreeResetTimer);
  // Reset consecutive counter after 5 minutes of stable error-free playback
  errorFreeResetTimer = setTimeout(() => {
    if (consecutive403Count > 0) {
      console.log(
        `[BG] 🛡️ 5-minute error-free window reached. Resetting consecutive403Count (${consecutive403Count} -> 0).`,
      );
      consecutive403Count = 0;
    }
  }, 300000);
}

async function logTabUpdated(tabId, targetUrl) {
  if (tabId) tabNavTimestamps[tabId] = Date.now();
  try {
    const tab = await chrome.tabs.get(tabId);
    console.log(
      `[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=${tab ? tab.active : "N/A"} | targetURL=${targetUrl || (tab ? tab.url : "N/A")}`,
    );
  } catch (e) {
    console.log(
      `[DIAGNOSTICS] [TAB_UPDATED] t=${performance.now().toFixed(2)}ms | timestamp=${Date.now()} | tabId=${tabId} | active=N/A | targetURL=${targetUrl || "N/A"}`,
    );
  }
}

async function findTikTokTab() {
  const activeTabs = await chrome.tabs.query({ active: true });
  const activeTikTok = activeTabs.find(
    (t) => t.url && t.url.includes("tiktok.com"),
  );
  if (activeTikTok) return activeTikTok;

  const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
  if (allTikTokTabs.length > 0) {
    return allTikTokTabs[0];
  }
  return null;
}

async function getOrCreateTikTokTab(targetUrl) {
  const allTikTokTabs = await chrome.tabs.query({ url: "*://*.tiktok.com/*" });
  const activeTabs = await chrome.tabs.query({ active: true });
  const activeTikTok = activeTabs.find(
    (t) => t.url && t.url.includes("tiktok.com"),
  );

  if (activeTikTok) {
    if (targetUrl) {
      await chrome.tabs.update(activeTikTok.id, {
        url: targetUrl,
        active: true,
      });
      await logTabUpdated(activeTikTok.id, targetUrl);
    }
    return activeTikTok;
  }

  if (allTikTokTabs.length > 0) {
    const targetTab = allTikTokTabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
    await logTabUpdated(targetTab.id, targetUrl);
    if (targetUrl) {
      await chrome.tabs.update(targetTab.id, { url: targetUrl });
      await logTabUpdated(targetTab.id, targetUrl);
    }
    return targetTab;
  }

  return await chrome.tabs.create({
    url: targetUrl || "https://www.tiktok.com",
    active: true,
  });
}

function isOnLikedPage(tabUrl, username) {
  if (!tabUrl || !username) return false;
  const handle = username.startsWith("@") ? username : "@" + username;
  const profilePattern = "tiktok.com/" + handle;
  return tabUrl.includes(profilePattern);
}

function is403OrErrorTab(tab) {
  if (!tab) return false;
  const title = (tab.title || "").toLowerCase();
  const url = (tab.url || "").toLowerCase();

  if (
    title.includes("denied") ||
    title.includes("403") ||
    title.includes("forbidden") ||
    title.includes("just a moment") ||
    title.includes("access to") ||
    title.includes("site can't be reached") ||
    title.includes("cannot be reached") ||
    title.includes("error") ||
    title.includes("blocked")
  ) {
    return true;
  }

  if (url.includes("chrome-error") || url.includes("edge-error")) {
    return true;
  }

  return false;
}

async function triggerTiered403Recovery(reason, tabId = null) {
  if (isRecoveryInProgress) {
    console.log(
      `[BG] ⏳ Recovery already in progress, skipping duplicate request (${reason}).`,
    );
    return;
  }

  const now = Date.now();
  consecutive403Count++;
  const cooldownMs = getTieredCooldown(consecutive403Count);

  if (now - last403TriggerTime < cooldownMs && last403TriggerTime > 0) {
    console.log(
      `[BG] ⏳ Tiered Cooldown active (${(cooldownMs / 1000).toFixed(0)}s). Skipping stampede (${reason}).`,
    );
    return;
  }

  last403TriggerTime = now;
  isRecoveryInProgress = true;

  console.warn(
    `[BG] 🛡️ Tiered 403 Recovery (Tier ${consecutive403Count > 2 ? 3 : consecutive403Count} - ${consecutive403Count} consecutive). Reason: "${reason}". Cooldown: ${(cooldownMs / 1000).toFixed(0)}s`,
  );

  // If Tier 3+ (consecutive blocks), surface a user-friendly hint toast
  if (consecutive403Count >= 3) {
    try {
      const activeTab = tabId ? { id: tabId } : await findTikTokTab();
      if (activeTab && activeTab.id) {
        chrome.tabs
          .sendMessage(activeTab.id, {
            action: "showWarningToast",
            message:
              "⚠️ Phát hiện chặn WAF liên tục. Đang tạm nghỉ 60s để phục hồi...",
          })
          .catch(() => {});
      }
    } catch (e) {}
  }

  // Wait the backoff cooldown before navigating
  await randomDelay(Math.floor(cooldownMs * 0.8), cooldownMs);

  try {
    const data = await chrome.storage.local.get([
      "targetLimit",
      "tiktokUsername",
    ]);
    const limit = data.targetLimit || 100;
    const username = data.tiktokUsername || "";
    await handleRandomLiked(limit, username);
    resetErrorFreeWindow();
  } catch (err) {
    console.warn("[BG] Tiered recovery navigation failed:", err);
  } finally {
    isRecoveryInProgress = false;
  }
}

function initWatchdogAndTabListeners() {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId && changeInfo.url) {
      tabNavTimestamps[tabId] = Date.now();
    }
    if (
      tab &&
      tab.url &&
      (tab.url.includes("tiktok.com") ||
        tab.url.includes("chrome-error") ||
        tab.url.includes("edge-error"))
    ) {
      if (is403OrErrorTab(tab)) {
        // 1.8s buffer delay to avoid racing with Content Script's own recovery
        setTimeout(() => {
          triggerTiered403Recovery(`tabs.onUpdated: "${tab.title}"`, tab.id);
        }, 1800);
      }
    }
  });

  setInterval(async () => {
    try {
      const tab = await findTikTokTab();
      if (!tab || !tab.url) return;

      const now = Date.now();

      if (is403OrErrorTab(tab)) {
        triggerTiered403Recovery(
          `Watchdog error state: "${tab.title}"`,
          tab.id,
        );
        return;
      }

      if (tab.url.includes("/video/")) {
        const navTime = tabNavTimestamps[tab.id] || 0;
        const elapsed = now - navTime;

        // Ping tab after 4.5s navigation delay
        if (elapsed > 4500) {
          chrome.tabs.sendMessage(tab.id, { action: "ping" }, (response) => {
            if (chrome.runtime.lastError || !response || !response.alive) {
              setTimeout(() => {
                triggerTiered403Recovery(
                  `Watchdog ping failed (${elapsed}ms)`,
                  tab.id,
                );
              }, 1800);
            } else {
              resetErrorFreeWindow();
            }
          });
        }
      }
    } catch (e) {}
  }, 3000);
}
