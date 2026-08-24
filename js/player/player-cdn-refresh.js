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

  function isNetworkErrorMessage(err) {
    if (!err || typeof err !== 'string') return false;
    const lower = err.toLowerCase();
    return (
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('err_internet_disconnected') ||
      lower.includes('err_network_changed') ||
      lower.includes('err_name_not_resolved') ||
      lower.includes('err_connection_timed_out') ||
      lower.includes('err_connection_refused') ||
      lower.includes('offline') ||
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('silent fetch failed') ||
      lower.includes('stream fetch failed')
    );
  }

  async function refreshCdnUrl(canonicalUrl) {
    if (!canonicalUrl) return { ok: false, error: 'No canonical URL provided' };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, isNetworkError: true, error: 'Mất kết nối internet' };
    }
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
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          resolve({
            ok: false,
            isNetworkError: isOffline,
            error: isOffline ? 'Mất kết nối internet' : 'refreshCdnUrl timed out after 15s',
          });
        }
      }, 15000);

      chrome.runtime.sendMessage(
        { action: 'refreshCdnUrl', canonicalUrl: key },
        (response) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            const isNetErr = (typeof navigator !== 'undefined' && !navigator.onLine) || isNetworkErrorMessage(msg);
            resolve({ ok: false, isNetworkError: isNetErr, error: msg });
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
            const isNetErr = (typeof navigator !== 'undefined' && !navigator.onLine) || isNetworkErrorMessage(err);
            resolve({ ok: false, isNetworkError: isNetErr, error: err });
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
      try {
        await refreshCdnUrl(key);
      } finally {
        prefetchingUrls.delete(key);
      }
      await new Promise(r => setTimeout(r, 1500));
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
