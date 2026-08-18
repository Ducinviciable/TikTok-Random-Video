// Module: bg-player.js
// Responsibilities: JIT CDN URL refresh pipeline for the Dedicated Player.
//
// Flow:
//   player-cdn-refresh.js  →  background message "refreshCdnUrl"
//   → handleRefreshCdnUrl() finds/reuses a TikTok tab
//   → injects content-cdn-bridge.js via scripting API
//   → bridge POSTs back "cdnBridgeResult"
//   → we resolve the pending promise with { ok, cdnUrl }
//
// SAFETY RULES (never violate):
//   - Never clear Akamai cookies (_abck, bm_*, rate, limit)
//   - Prefer reusing an existing tiktok.com tab; avoid spamming new tabs
//   - After extraction, do NOT leave orphan navigation or injected state
//   - Cache CDN URLs in memory only (short TTL handled by player-cdn-refresh)
//   - One in-flight refresh per canonical URL at a time (deduplicate)

'use strict';

// ── In-Flight Request Deduplication Map ───────────────────────────────────
// Map<canonicalUrlKey, {resolve, reject, timeoutId}>
const _inflightRefreshes = new Map();

// ── Tab-level CDN bridge result listener registration ─────────────────────
// We register a one-time message listener per request inside handleRefreshCdnUrl.

/**
 * Called by background.js message router for action "refreshCdnUrl".
 * @param {{canonicalUrl: string}} request
 * @param {chrome.runtime.MessageSender} sender
 * @param {function} sendResponse
 * @returns {true}  (async response)
 */
function handleRefreshCdnUrl(request, sender, sendResponse) {
  const canonicalUrl = (request.canonicalUrl || '').split('?')[0];
  if (!canonicalUrl || !canonicalUrl.includes('/video/')) {
    sendResponse({ ok: false, error: 'Invalid canonical URL' });
    return true;
  }

  // Deduplicate: if already fetching this URL, piggyback on existing promise
  if (_inflightRefreshes.has(canonicalUrl)) {
    const existing = _inflightRefreshes.get(canonicalUrl);
    // Chain a secondary resolve once existing resolves
    const origResolve = existing.resolve;
    existing.resolve = (result) => {
      origResolve(result);
      sendResponse(result);
    };
    return true;
  }

  // Start refresh pipeline
  const timeoutMs = 12000;
  let timeoutId;

  const promise = new Promise(async (resolve) => {
    timeoutId = setTimeout(() => {
      _inflightRefreshes.delete(canonicalUrl);
      resolve({ ok: false, error: 'CDN refresh timed out after 12s' });
    }, timeoutMs);

    try {
      const result = await _doRefresh(canonicalUrl);
      clearTimeout(timeoutId);
      _inflightRefreshes.delete(canonicalUrl);
      resolve(result);
    } catch (err) {
      clearTimeout(timeoutId);
      _inflightRefreshes.delete(canonicalUrl);
      resolve({ ok: false, error: err.message });
    }
  });

  _inflightRefreshes.set(canonicalUrl, {
    resolve: (result) => sendResponse(result),
    timeoutId,
  });

  promise.then((result) => {
    const entry = _inflightRefreshes.get(canonicalUrl);
    if (entry) {
      entry.resolve(result);
      _inflightRefreshes.delete(canonicalUrl);
    }
    sendResponse(result);
  });

  return true; // keep message channel open for async
}

/**
 * Internal: navigate/reuse TikTok tab to the video URL, inject bridge, await result.
 * @param {string} canonicalUrl
 * @returns {Promise<{ok: boolean, cdnUrl?: string, error?: string}>}
 */
async function _doRefresh(canonicalUrl) {
  // 1. Find existing TikTok tab (prefer one already on the target video)
  let tab = await _findBestTikTokTab(canonicalUrl);

  let didNavigate = false;

  if (!tab) {
    // Create a new background tab (not active — don't disrupt user's view)
    tab = await chrome.tabs.create({ url: canonicalUrl, active: false });
    didNavigate = true;
    console.log('[BG-PLAYER] [CDN] Created background tab', tab.id, 'for', canonicalUrl);
  } else if (!_tabIsOnTargetVideo(tab.url, canonicalUrl)) {
    // Navigate existing tab to the video; use SPA message first
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'navigateToVideo', url: canonicalUrl });
      didNavigate = true;
    } catch (_) {
      await chrome.tabs.update(tab.id, { url: canonicalUrl });
      didNavigate = true;
    }
    console.log('[BG-PLAYER] [CDN] Navigated tab', tab.id, 'to', canonicalUrl);
  }

  // 2. Wait for tab to finish loading if we navigated
  if (didNavigate) {
    await _waitForTabLoad(tab.id, 7000);
  }

  // 3. Inject content-cdn-bridge.js programmatically
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['js/content/content-cdn-bridge.js'],
    });
  } catch (err) {
    console.warn('[BG-PLAYER] [CDN] Script inject failed on tab', tab.id, ':', err.message);
    return { ok: false, error: 'Script injection failed: ' + err.message };
  }

  // 4. Wait for cdnBridgeResult message from that tab
  const cdnUrl = await _waitForBridgeResult(tab.id, 9000);

  if (cdnUrl) {
    console.log('[BG-PLAYER] [CDN] Got CDN URL for', canonicalUrl, '→', cdnUrl.substring(0, 60) + '...');
    return { ok: true, cdnUrl };
  }

  return { ok: false, error: 'Bridge did not return a CDN URL within timeout' };
}

/**
 * Find the best available TikTok tab for CDN extraction.
 * Priority: tab already on the exact canonical URL > any tiktok.com tab.
 */
async function _findBestTikTokTab(canonicalUrl) {
  const all = await chrome.tabs.query({ url: '*://*.tiktok.com/*' });
  if (!all.length) return null;
  const exact = all.find(t => _tabIsOnTargetVideo(t.url, canonicalUrl));
  return exact || all[0];
}

function _tabIsOnTargetVideo(tabUrl, canonicalUrl) {
  if (!tabUrl || !canonicalUrl) return false;
  const id = canonicalUrl.match(/\/video\/(\d+)/)?.[1];
  return id ? tabUrl.includes(id) : false;
}

/** Wait until a tab's status becomes 'complete' or timeout. */
function _waitForTabLoad(tabId, maxMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxMs;

    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);

    // Fallback: resolve after maxMs anyway
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, maxMs);

    // Also check immediately if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab && tab.status === 'complete' && Date.now() < deadline) {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }).catch(() => resolve());
  });
}

/**
 * Wait for the content bridge on tabId to POST back a cdnBridgeResult message.
 * Returns the cdnUrl string, or null if timeout.
 */
function _waitForBridgeResult(tabId, maxMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMsg);
      resolve(null);
    }, maxMs);

    function onMsg(msg, sender) {
      if (
        msg.action === 'cdnBridgeResult' &&
        sender.tab && sender.tab.id === tabId
      ) {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(onMsg);
        resolve(msg.cdnUrl || null);
      }
    }
    chrome.runtime.onMessage.addListener(onMsg);
  });
}
