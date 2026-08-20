'use strict';

const _inflightRefreshes = new Map();

function handleRefreshCdnUrl(request, sender, sendResponse) {
  const rawUrl = request.canonicalUrl || request.tiktokUrl || '';
  const canonicalUrl = rawUrl.split('?')[0];

  if (!canonicalUrl || !canonicalUrl.includes('/video/')) {
    sendResponse({ ok: false, error: 'Invalid canonical TikTok video URL' });
    return true;
  }

  const idMatch = canonicalUrl.match(/\/video\/(\d+)/);
  const videoId = idMatch ? idMatch[1] : '';

  if (_inflightRefreshes.has(canonicalUrl)) {
    _inflightRefreshes.get(canonicalUrl).push(sendResponse);
    return true;
  }

  const callbacks = [sendResponse];
  _inflightRefreshes.set(canonicalUrl, callbacks);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
    const list = _inflightRefreshes.get(canonicalUrl) || [];
    _inflightRefreshes.delete(canonicalUrl);
    list.forEach(cb => {
      try { cb({ ok: false, error: 'Stream fetch timed out after 12s' }); } catch (_) {}
    });
  }, 12000);

  (async () => {
    try {
      return await resolveStreamUrl(canonicalUrl, videoId, abortController.signal);
    } catch (err) {
      return { ok: false, error: err.message || 'Stream fetch failed' };
    }
  })().then((result) => {
    clearTimeout(timeoutId);
    const list = _inflightRefreshes.get(canonicalUrl) || [];
    _inflightRefreshes.delete(canonicalUrl);
    list.forEach(cb => {
      try { cb(result); } catch (_) {}
    });
  });

  return true;
}

const CORS_RULE_ID = 99002;

async function _applyPlayerCorsRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [CORS_RULE_ID],
      addRules: [{
        id: CORS_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' },
            { header: 'Access-Control-Allow-Methods', operation: 'set', value: 'GET, HEAD, OPTIONS' },
            { header: 'Access-Control-Allow-Headers', operation: 'set', value: '*' },
            { header: 'Access-Control-Expose-Headers', operation: 'set', value: 'Content-Length, Content-Range, Accept-Ranges' },
          ],
        },
        condition: {
          initiatorDomains: [chrome.runtime.id],
          excludedInitiatorDomains: ['tiktok.com', 'www.tiktok.com'],
          resourceTypes: ['media', 'xmlhttprequest', 'other'],
        },
      }],
    });
  } catch (e) {
    console.warn('[BG-PLAYER] Failed to apply Player CORS rule:', e.message);
  }
}

_applyPlayerCorsRule();
