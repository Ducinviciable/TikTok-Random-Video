let observer = null;
let existingUrls = new Set();

function startObserving(appendMode) {
  if (observer) observer.disconnect();

  observer = new MutationObserver(function (mutations) {
    let hasNewNodes = false;
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      collectVideoUrls(isCatchingUp);
      sendVideosToBackground(appendMode);
      if (videoWatcherActive) {
        watchForVideoElement();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function autoScroll(
  targetLimit,
  baseInterval,
  existingUrlsSet,
  smartStopMode,
  appendMode,
) {
  targetLimit = targetLimit || 100;
  baseInterval = baseInterval || 1000;
  existingUrlsSet = existingUrlsSet || new Set();
  smartStopMode = smartStopMode || false;

  const existingCount = existingUrlsSet ? existingUrlsSet.size : 0;
  const maxScrolls = Math.ceil((existingCount + targetLimit) / 10) + 15;

  isCatchingUp =
    (isDeepAppend || appendMode) && existingCount > 0 && !smartStopMode;

  if (isCatchingUp) {
    console.log(
      "[CS] 🏃 Entering Catch-Up Phase: Fast-scrolling past " +
        existingCount +
        " known videos (scroll budget: " +
        maxScrolls +
        ")...",
    );
  }

  return new Promise(function (resolve) {
    let scrollCount = 0;
    let lastCount = 0;
    let noNewCount = 0;
    let sameHeightCount = 0;
    let lastScrollHeight = 0;
    let consecutiveExistingCount = 0;
    let itemsSinceLastRest = 0;
    lastCheckpointCount = collectedMap.size;

    const scrollContainer = findScrollContainer();

    if (checkpointTimer) clearInterval(checkpointTimer);
    checkpointTimer = setInterval(function () {
      if (isCollecting && collectedMap.size > lastCheckpointCount) {
        saveCheckpointData(true);
        lastCheckpointCount = collectedMap.size;
      }
    }, 10000);

    async function scrollStep() {
      if (!isCollecting) {
        if (checkpointTimer) clearInterval(checkpointTimer);
        isCatchingUp = false;
        resolve(collectedMap.size);
        return;
      }

      // Fast Catch-Up mode: skip heavy thumbnail parsing while in known territory
      collectVideoUrls(isCatchingUp);

      const newCollectedCount = collectedMap.size - existingUrlsSet.size;

      if (isCatchingUp) {
        if (newCollectedCount > 0) {
          isCatchingUp = false;
          noNewCount = 0;
          console.log(
            "[CS] 🚀 Exited Catch-Up Phase! First new video URL encountered (Total: " +
              collectedMap.size +
              ", New: " +
              newCollectedCount +
              "). Restoring normal collection pace & full thumbnail extraction.",
          );
          // Immediately perform full extraction with thumbnails enabled
          collectVideoUrls(false);
        } else if (scrollCount > 0 && scrollCount % 10 === 0) {
          console.log(
            "[CS] 🏃 Catch-Up Phase: Still in known territory (" +
              collectedMap.size +
              "/" +
              existingCount +
              " seen, scroll " +
              scrollCount +
              "/" +
              maxScrolls +
              ")...",
          );
        }
      }

      if (smartStopMode) {
        const visibleUrls = getVisibleUrls();
        let foundExistingInBatch = 0;
        visibleUrls.forEach(function (url) {
          if (existingUrlsSet.has(url)) {
            foundExistingInBatch++;
          }
        });

        if (foundExistingInBatch > 0) {
          consecutiveExistingCount += foundExistingInBatch;
        } else {
          consecutiveExistingCount = 0;
        }

        if (consecutiveExistingCount >= 3) {
          console.log(
            "[CS] ⚡ Smart Stop: Detected 3 consecutive existing videos → Finishing Quick Update!",
          );
          if (checkpointTimer) clearInterval(checkpointTimer);
          isCatchingUp = false;
          resolve(collectedMap.size);
          return;
        }
      }

      let currentStatus = "collecting";
      if (isCatchingUp) {
        currentStatus = "catchup";
      } else if (missingThumbQueue.size > 5) {
        currentStatus = "slow_network";
      }

      let extraDelay = 0;
      if (!isCatchingUp) {
        if (missingThumbQueue.size > 5) {
          extraDelay += 600;
        }

        const totalCollected = collectedMap.size;
        if (totalCollected > 2500) {
          extraDelay += 1500;
        } else if (totalCollected > 1500) {
          extraDelay += 800;
        } else if (totalCollected > 800) {
          extraDelay += 400;
        }
      }

      try {
        chrome.runtime.sendMessage(
          {
            action: "collectionProgress",
            isCollecting: true,
            scrollCount: scrollCount + 1,
            maxScrolls: maxScrolls,
            count: collectedMap.size,
            newCount: Math.max(0, newCollectedCount),
            limit: targetLimit,
            status: currentStatus,
            missingThumbs: isCatchingUp ? 0 : missingThumbQueue.size,
          },
          function () {
            if (chrome.runtime.lastError) {
            }
          },
        );
      } catch (e) {}

      if (newCollectedCount - lastCheckpointCount >= 30) {
        saveCheckpointData(true);
        lastCheckpointCount = collectedMap.size;
      }

      if (
        newCollectedCount >= targetLimit ||
        scrollCount >= maxScrolls ||
        (!isCatchingUp && noNewCount >= 4)
      ) {
        if (checkpointTimer) clearInterval(checkpointTimer);
        isCatchingUp = false;
        resolve(collectedMap.size);
        return;
      }

      performDomCleanup();

      let containerHeight = 0;
      if (scrollContainer) {
        scrollContainer.scrollBy(0, 1100);
        containerHeight = scrollContainer.scrollHeight;
      } else {
        window.scrollBy(0, 1100);
        containerHeight = document.documentElement.scrollHeight;
      }

      if (containerHeight === lastScrollHeight) {
        sameHeightCount++;
      } else {
        sameHeightCount = 0;
      }
      lastScrollHeight = containerHeight;

      if (sameHeightCount >= 5) {
        console.log(
          "[CS] 🛑 Reached end of scrollable page (sameHeightCount >= 5). Finishing collection.",
        );
        if (checkpointTimer) clearInterval(checkpointTimer);
        isCatchingUp = false;
        resolve(collectedMap.size);
        return;
      }

      scrollCount++;
      itemsSinceLastRest++;

      if (isCatchingUp) {
        noNewCount = 0; // State-aware Freeze in known territory
      } else {
        if (collectedMap.size === lastCount) {
          noNewCount++;
        } else {
          noNewCount = 0;
        }
      }
      lastCount = collectedMap.size;

      let nextDelay;
      if (isCatchingUp) {
        // Fast Catch-Up mode: 300–500 ms randomized
        nextDelay = Math.floor(Math.random() * 200) + 300;
      } else {
        // Normal humanized mode: 700–1300 ms + adaptive extras
        nextDelay =
          baseInterval + extraDelay + Math.floor(Math.random() * 250);
        if (itemsSinceLastRest >= 100) {
          itemsSinceLastRest = 0;
          nextDelay += 2500;
          console.log(
            "[CS] 🧊 DOM Rest: Pausing 2.5s to let CPU & RAM cool down...",
          );
        }
      }

      setTimeout(scrollStep, nextDelay);
    }

    scrollStep();
  });
}

// Click the "Liked" tab on a TikTok profile page
function clickLikedTab(callback) {
  var tabEl = null;

  var primarySelectors = [TK_SELECTORS.LIKED_TAB, TK_SELECTORS.USER_LIKED_TAB];
  for (var i = 0; i < primarySelectors.length; i++) {
    tabEl = document.querySelector(primarySelectors[i]);
    if (tabEl) break;
  }

  if (!tabEl) {
    var fallbackSelector =
      TK_SELECTORS.TAB_ROLE +
      ", " +
      TK_SELECTORS.TAB_ATTR +
      ", " +
      TK_SELECTORS.TAB_SPAN_CLASS +
      ", span";
    var allTabs = document.querySelectorAll(fallbackSelector);
    for (var j = 0; j < allTabs.length; j++) {
      var text = allTabs[j].textContent.trim();
      if (
        LIKED_TAB_LABELS.indexOf(text) !== -1 ||
        text.toLowerCase() === "liked"
      ) {
        tabEl = allTabs[j];
        break;
      }
    }
  }

  if (tabEl) {
    tabEl.click();
    setTimeout(function () {
      if (callback) callback(true);
    }, 2000);
  } else {
    if (callback) callback(false);
  }
}

function isOnLikedTab() {
  return (
    !!document.querySelector(TK_SELECTORS.LIKED_CONTAINER) ||
    document.querySelectorAll(TK_SELECTORS.LIKED_ITEM).length > 0
  );
}

function startCollection(
  autoPlay,
  appendMode,
  targetLimit,
  continueFromCurrent,
  smartStopMode,
) {
  if (isCollecting) return;
  isCollecting = true;

  targetLimit = targetLimit || 100;
  continueFromCurrent = continueFromCurrent || false;
  smartStopMode = smartStopMode || false;
  isDeepAppend = !smartStopMode && appendMode;

  if (!continueFromCurrent) {
    existingUrls.clear();
  }

  const proceed = function () {
    const existingCount = existingUrls.size;
    const maxScrolls = Math.ceil((existingCount + targetLimit) / 10) + 15;
    isCatchingUp =
      !smartStopMode && (appendMode || isDeepAppend) && existingCount > 0;

    try {
      chrome.runtime.sendMessage(
        {
          action: "collectionProgress",
          isCollecting: true,
          scrollCount: 0,
          maxScrolls: maxScrolls,
          count: collectedMap.size,
          newCount: 0,
          limit: targetLimit,
          status: isCatchingUp ? "catchup" : "idle",
        },
        function () {
          if (chrome.runtime.lastError) {
          }
        },
      );
    } catch (e) {}

    chrome.storage.local.get(["blacklistedVideos"], function (bData) {
      if (bData && bData.blacklistedVideos) {
        blacklistedSet = new Set(bData.blacklistedVideos);
      }
      collectVideoUrls(isCatchingUp);
      startObserving(appendMode);

      autoScroll(
        targetLimit,
        1000,
        existingUrls,
        smartStopMode,
        appendMode,
      ).then(async function () {
        // Final Sweep before completion
        await performFinalSweep();

        sendVideosToBackground(appendMode);

        // Clear checkpoint upon successful completion
        try {
          chrome.runtime.sendMessage({ action: "clearCheckpoint" });
        } catch (e) {}

        const newCollectedCount = collectedMap.size - existingUrls.size;
        console.log(
          "[CS] 🏁 Collection finished: total=" +
            collectedMap.size +
            ", new=" +
            newCollectedCount +
            ", targetLimit=" +
            targetLimit,
        );

        try {
          chrome.runtime.sendMessage(
            {
              action: "collectionProgress",
              isCollecting: false,
              scrollCount: maxScrolls,
              maxScrolls: maxScrolls,
              count: collectedMap.size,
              newCount: newCollectedCount,
              limit: targetLimit,
              status: "complete",
            },
            function () {
              if (chrome.runtime.lastError) {
              }
            },
          );
        } catch (e) {}

        isCollecting = false;
        isCatchingUp = false;

        if (autoPlay && collectedMap.size > 0) {
          setTimeout(function () {
            try {
              chrome.runtime.sendMessage(
                { action: "collectAndPlay" },
                function () {
                  if (chrome.runtime.lastError) {
                  }
                },
              );
            } catch (e) {}
          }, 500);
        }
      });
    });
  };

  if (continueFromCurrent) {
    chrome.storage.local.get(["likedVideos"], function (data) {
      const existing = data.likedVideos || [];
      existingUrls.clear();
      existing.forEach(function (v) {
        const url = typeof v === "string" ? v : v ? v.url : "";
        const thumb = typeof v === "string" ? "" : v ? v.thumb : "";
        if (url) {
          if (!collectedMap.has(url)) {
            collectedMap.set(url, thumb);
          }
          existingUrls.add(url.split("?")[0]);
        }
      });
      collectedMap.forEach(function (thumb, url) {
        existingUrls.add(url.split("?")[0]);
      });
      proceed();
    });
  } else if (appendMode) {
    chrome.storage.local.get(["likedVideos"], function (data) {
      const existing = data.likedVideos || [];
      existing.forEach(function (v) {
        const url = typeof v === "string" ? v : v ? v.url : "";
        const thumb = typeof v === "string" ? "" : v ? v.thumb : "";
        if (url) {
          collectedMap.set(url, thumb);
          existingUrls.add(url.split("?")[0]);
        }
      });
      proceed();
    });
  } else {
    collectedMap.clear();
    proceed();
  }
}

