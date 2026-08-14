let checkpointTimer = null;
let lastCheckpointCount = 0;

function performDomCleanup() {
  try {
    const likedContainer = document.querySelector(TK_SELECTORS.LIKED_CONTAINER);
    if (!likedContainer) return;

    const items = Array.from(
      likedContainer.querySelectorAll(TK_SELECTORS.LIKED_ITEM),
    );
    if (items.length > 200) {
      const removeCount = items.length - 150;
      for (let i = 0; i < removeCount; i++) {
        const item = items[i];
        const a = item.querySelector(TK_SELECTORS.VIDEO_LINK);
        if (a) {
          const url = a.href.split("?")[0];
          if (url) {
            const img = item.querySelector("img");
            const thumb = extractImgUrl(img);
            if (!collectedMap.has(url)) {
              collectedMap.set(url, thumb);
            } else if (thumb && !collectedMap.get(url)) {
              collectedMap.set(url, thumb);
            }
          }
        }
        item.remove();
        prunedNodeCount++;
      }
      console.log(
        "[CS] 🧹 DOM Cleanup: Removed " +
          removeCount +
          " old cards (Total pruned: " +
          prunedNodeCount +
          ")",
      );
      if (removeCount > 0 && typeof saveCheckpointData === "function") {
        saveCheckpointData(
          typeof isDeepAppend !== "undefined" ? isDeepAppend : false,
        );
      }
    }
  } catch (e) {}
}

function saveCheckpointData(appendMode) {
  const videosArray = [];
  collectedMap.forEach(function (thumb, url) {
    videosArray.push({ url: url, thumb: thumb });
  });

  try {
    chrome.runtime.sendMessage(
      {
        action: "saveCheckpoint",
        checkpoint: {
          timestamp: Date.now(),
          count: collectedMap.size,
          videos: videosArray,
          append: appendMode || false,
        },
      },
      function () {
        if (chrome.runtime.lastError) {
        }
      },
    );
  } catch (e) {}
}

async function performFinalSweep() {
  console.log("[CS] 🧹 Starting Final Sweep to capture trailing thumbnails...");
  try {
    const scrollContainer = findScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollBy(0, -300);
    } else {
      window.scrollBy(0, -300);
    }
  } catch (e) {}

  await new Promise(function (r) {
    setTimeout(r, 2000);
  });
  collectVideoUrls();
  console.log(
    "[CS] ✅ Final Sweep complete. Remaining missing thumbnails:",
    missingThumbQueue.size,
  );
}
