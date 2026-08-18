// JIT CDN Refresher: Lấy stream URL mới qua background bridge và cache trong bộ nhớ (15p)
'use strict';

(function () {
  const CDN_CACHE_TTL_MS = 15 * 60 * 1000;
  const cdnCache = new Map();

  // Lấy stream URL mới cho video TikTok
  async function refreshCdnUrl(canonicalUrl) {
    if (!canonicalUrl) return { ok: false, error: 'No canonical URL provided' };
    const key = canonicalUrl.split('?')[0];

    const cached = cdnCache.get(key);
    if (cached && (Date.now() - cached.fetchedAt) < CDN_CACHE_TTL_MS) {
      return { ok: true, cdnUrl: cached.cdnUrl, fromCache: true };
    }

    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        resolve({ ok: false, error: 'Not in extension context' });
        return;
      }

      chrome.runtime.sendMessage(
        { action: 'refreshCdnUrl', canonicalUrl: key },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[CDN] sendMessage error:', chrome.runtime.lastError.message);
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (response && response.ok && response.cdnUrl) {
            cdnCache.set(key, { cdnUrl: response.cdnUrl, fetchedAt: Date.now() });
            resolve({ ok: true, cdnUrl: response.cdnUrl });
          } else {
            const err = (response && response.error) || 'Unknown error';
            console.warn('[CDN] Refresh failed for', key, ':', err);
            resolve({ ok: false, error: err });
          }
        }
      );
    });
  }

  // Xóa cache khi gặp lỗi 403 hoặc stream hỏng
  function invalidateCdnCache(canonicalUrl) {
    const key = (canonicalUrl || '').split('?')[0];
    if (cdnCache.has(key)) {
      cdnCache.delete(key);
    }
  }

  window.PlayerCDN = { refreshCdnUrl, invalidateCdnCache };
})();
