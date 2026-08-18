// Module: content-cdn-bridge.js
// Runs on tiktok.com pages (injected programmatically by background on demand).
// Extracts the currently playable <video> src for the URL the tab is showing,
// then returns it via chrome.runtime.sendMessage to background.
//
// RULES:
// - NEVER delete or modify Akamai cookies (_abck, bm_*, rate, limit).
// - Does NOT navigate the tab on its own; background chooses the URL to open.
// - Tears itself down after responding (no persistent DOM listeners left).

'use strict';

(function () {
  const TIMEOUT_MS = 8000;
  const POLL_INTERVAL_MS = 250;

  /**
   * Wait until a playable <video> element with a real src appears in the DOM.
   * Returns the src string or null if timeout expires.
   */
  function waitForVideoSrc() {
    return new Promise((resolve) => {
      const deadline = Date.now() + TIMEOUT_MS;

      function attempt() {
        // Try all <video> elements; prefer the one with the longest src (likely CDN)
        const videos = Array.from(document.querySelectorAll('video'));
        let best = '';
        for (const v of videos) {
          const src = v.currentSrc || v.src || '';
          if (
            src &&
            !src.startsWith('blob:') &&
            !src.startsWith('data:') &&
            src.length > best.length
          ) {
            best = src;
          }
        }
        if (best) {
          resolve(best);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(null);
          return;
        }
        setTimeout(attempt, POLL_INTERVAL_MS);
      }

      attempt();
    });
  }

  // Only run if background asked US to extract (avoid running on every page load)
  if (!window.__cdnBridgeActive) {
    window.__cdnBridgeActive = true;

    waitForVideoSrc().then((cdnUrl) => {
      window.__cdnBridgeActive = false;
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'cdnBridgeResult',
          cdnUrl: cdnUrl || null,
          pageUrl: location.href.split('?')[0],
        });
      }
    });
  }
})();
