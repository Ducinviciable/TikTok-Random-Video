'use strict';

(function () {
  const CDN_CACHE_TTL_MS = 20 * 60 * 1000;
  const cdnCache = new Map();
  const prefetchingUrls = new Set();

  function hasCached(canonicalUrl) {
    if (!canonicalUrl) return false;
    const key = canonicalUrl.split('?')[0];
    const cached = cdnCache.get(key);
    return !!(cached && (Date.now() - cached.fetchedAt) < CDN_CACHE_TTL_MS);
  }

  async function refreshCdnUrl(canonicalUrl) {
    if (!canonicalUrl) return { ok: false, error: 'No canonical URL provided' };
    const key = canonicalUrl.split('?')[0];

    const cached = cdnCache.get(key);
    if (cached && (Date.now() - cached.fetchedAt) < CDN_CACHE_TTL_MS) {
      return { ok: true, cdnUrl: cached.cdnUrl, cover: cached.cover, source: cached.source, fromCache: true };
    }

    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        resolve({ ok: false, error: 'Not in extension context' });
        return;
      }

      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ ok: false, error: 'refreshCdnUrl timed out after 10s' });
        }
      }, 10000);

      chrome.runtime.sendMessage(
        { action: 'refreshCdnUrl', canonicalUrl: key },
        (response) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (response && response.ok && response.cdnUrl) {
            cdnCache.set(key, {
              cdnUrl: response.cdnUrl,
              cover: response.cover,
              source: response.source || 'unknown',
              fetchedAt: Date.now(),
            });
            resolve({
              ok: true,
              cdnUrl: response.cdnUrl,
              cover: response.cover,
              source: response.source || 'unknown',
            });
          } else {
            const err = (response && response.error) || 'Unknown error';
            resolve({ ok: false, error: err });
          }
        }
      );
    });
  }

  async function prefetchTracks(urls) {
    if (!Array.isArray(urls)) return;
    for (const rawUrl of urls) {
      if (!rawUrl) continue;
      const key = rawUrl.split('?')[0];
      if (hasCached(key) || prefetchingUrls.has(key)) continue;

      prefetchingUrls.add(key);
      refreshCdnUrl(key).finally(() => {
        prefetchingUrls.delete(key);
      });
      await new Promise(r => setTimeout(r, 200));
    }
  }

  function invalidateCdnCache(canonicalUrl) {
    const key = (canonicalUrl || '').split('?')[0];
    if (cdnCache.has(key)) {
      cdnCache.delete(key);
    }
  }

  window.PlayerCDN = { refreshCdnUrl, prefetchTracks, hasCached, invalidateCdnCache };
})();
