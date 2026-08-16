let activeCollectionJob = null;

async function navigateTabToUrl(tabId, url) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: "navigateToVideo",
      url: url,
    });
  } catch (e) {
    await chrome.tabs.update(tabId, { url: url });
  }
}

function startCollectionJob(
  tabId,
  limit,
  username,
  appendMode,
  autoPlay,
  smartStop = false,
) {
  if (activeCollectionJob) {
    clearTimeout(activeCollectionJob.timeoutId);
    clearInterval(activeCollectionJob.checkIntervalId);
  }

  activeCollectionJob = {
    tabId: tabId,
    limit: limit,
    username: username,
    appendMode: appendMode,
    autoPlay: autoPlay,
    smartStop: smartStop,
    attempts: 0,
  };

  runJobCycle();
}

function runJobCycle() {
  if (!activeCollectionJob) return;
  const job = activeCollectionJob;
  job.attempts++;

  console.log(`[BG] Collection job cycle: Attempt #${job.attempts}`);

  job.timeoutId = setTimeout(() => {
    if (activeCollectionJob === job) {
      console.warn(
        "[BG] Collection job timed out (took too long). Navigating tab and retrying...",
      );
      const handle = job.username
        ? job.username.startsWith("@")
          ? job.username
          : "@" + job.username
        : "";
      const profileUrl = handle
        ? "https://www.tiktok.com/" + handle
        : "https://www.tiktok.com";
      navigateTabToUrl(job.tabId, profileUrl).finally(() => {
        setTimeout(runJobCycle, 2000);
      });
    }
  }, 20000);

  let pingAttempts = 0;
  job.checkIntervalId = setInterval(() => {
    if (activeCollectionJob !== job) {
      clearInterval(job.checkIntervalId);
      return;
    }

    chrome.tabs.get(job.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        console.warn("[BG] Tab not found or closed. Canceling collection job.");
        clearInterval(job.checkIntervalId);
        clearTimeout(job.timeoutId);
        if (activeCollectionJob === job) activeCollectionJob = null;
        return;
      }

      const title = (tab.title || "").toLowerCase();
      if (
        title.includes("403") ||
        title.includes("denied") ||
        title.includes("forbidden")
      ) {
        console.warn(
          `[BG] Detected block/error page: "${tab.title}". Navigating tab in 5 seconds...`,
        );
        clearInterval(job.checkIntervalId);
        clearTimeout(job.timeoutId);

        setTimeout(() => {
          if (activeCollectionJob === job) {
            const handle = job.username
              ? job.username.startsWith("@")
                ? job.username
                : "@" + job.username
              : "";
            const profileUrl = handle
              ? "https://www.tiktok.com/" + handle
              : "https://www.tiktok.com";
            navigateTabToUrl(job.tabId, profileUrl).finally(() => {
              setTimeout(runJobCycle, 2000);
            });
          }
        }, 5000);
        return;
      }

      chrome.tabs.sendMessage(job.tabId, { action: "ping" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.alive) {
          pingAttempts++;
          console.log(
            `[BG] Ping content script failed (attempt ${pingAttempts})`,
          );
          return;
        }

        console.log(
          "[BG] Content script is alive. Sending clickLikedTabAndCollect message.",
        );
        clearInterval(job.checkIntervalId);
        clearTimeout(job.timeoutId);
        activeCollectionJob = null;

        chrome.tabs.sendMessage(
          job.tabId,
          {
            action: "clickLikedTabAndCollect",
            append: job.appendMode,
            autoPlay: job.autoPlay,
            limit: job.limit,
            smartStop: job.smartStop || false,
          },
          function () {
            if (chrome.runtime.lastError) {
            }
          },
        );
      });
    });
  }, 2000);
}

async function handleCollectMore(
  limit = 100,
  username = "",
  smartStop = false,
) {
  const handle = username.startsWith("@") ? username : "@" + username;
  const profileUrl = "https://www.tiktok.com/" + handle;

  const tab = await findTikTokTab();

  if (tab && isOnLikedPage(tab.url, username)) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "continueCollecting",
        append: true,
        autoPlay: false,
        limit: limit,
        smartStop: smartStop,
      });
    } catch (e) {
      console.log("[BG] Error sending continueCollecting:", e.message);
    }
    return { success: true, status: "collecting_in_place" };
  }

  const targetTab = await getOrCreateTikTokTab(profileUrl);
  startCollectionJob(targetTab.id, limit, username, true, false, smartStop);

  return { success: true, status: "navigating" };
}
