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
      const fastResult = await _fetchTikwmStream(canonicalUrl);
      if (fastResult && fastResult.ok && fastResult.cdnUrl) {
        return fastResult;
      }
      return await _doSilentFetch(canonicalUrl, videoId, abortController.signal);
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

async function _fetchTikwmStream(canonicalUrl) {
  try {
    const body = new URLSearchParams({ url: canonicalUrl, hd: '1' });
    const res = await fetch('https://tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 0 || !json.data) return null;
    const cdnUrl = json.data.play || json.data.hdplay || (typeof json.data.music === 'string' ? json.data.music : null);
    if (!cdnUrl) return null;
    return { ok: true, cdnUrl, title: json.data.title, cover: json.data.cover };
  } catch (_) {
    return null;
  }
}

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DNR_RULE_ID = 99001;
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

async function _applyMobileUaRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [{
        id: DNR_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{
            header: 'User-Agent',
            operation: 'set',
            value: MOBILE_UA,
          }],
        },
        condition: {
          urlFilter: '||www.tiktok.com',
          initiatorDomains: [chrome.runtime.id],
          excludedInitiatorDomains: ['tiktok.com', 'www.tiktok.com'],
          resourceTypes: ['xmlhttprequest', 'other'],
        },
      }],
    });
  } catch (e) {
    console.warn('[BG-PLAYER] Failed to apply mobile UA rule:', e.message);
  }
}

async function _removeMobileUaRule() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
    });
  } catch (_) {}
}

async function _doSilentFetch(canonicalUrl, videoId, signal) {
  const maxRetries = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 4000 + Math.random() * 2000;
      await new Promise(r => setTimeout(r, delay));
    }

    await _applyMobileUaRule();

    try {
      const response = await fetch(canonicalUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        },
        credentials: 'omit',
        signal,
      });

      await _removeMobileUaRule();

      if (response.status === 403) {
        lastError = 'HTTP 403 Forbidden (rate-limited)';
        continue;
      }

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
      }

      const html = await response.text();
      const cdnUrl = _extractCdnFromHtml(html, videoId);

      if (cdnUrl) {
        return { ok: true, cdnUrl };
      }

      return { ok: false, error: 'Could not extract CDN stream URL from TikTok HTML' };
    } catch (err) {
      await _removeMobileUaRule();
      throw err;
    }
  }

  return { ok: false, error: lastError || 'All retries exhausted' };
}

function _extractCdnFromHtml(html, videoId) {
  if (!html || typeof html !== 'string') return null;

  const cleanUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    let url = raw.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    try {
      url = JSON.parse(`"${raw}"`);
    } catch (_) { }
    url = url.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (url.startsWith('//')) url = 'https:' + url;
    return (url.startsWith('http://') || url.startsWith('https://')) ? url : null;
  };

  const apiDataMatch = html.match(/<script\s+id="api-data"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (apiDataMatch && apiDataMatch[1]) {
    try {
      const data = JSON.parse(apiDataMatch[1]);
      const itemStruct = data.videoDetail?.itemInfo?.itemStruct;
      const playAddr = itemStruct?.video?.playAddr || itemStruct?.video?.downloadAddr || itemStruct?.music?.playUrl;
      const cleaned = cleanUrl(playAddr);
      if (cleaned) return cleaned;

      const bitrateList = itemStruct?.video?.bitrateInfo;
      if (Array.isArray(bitrateList) && bitrateList.length > 0) {
        const bestUrl = bitrateList[0]?.PlayAddr?.UrlList?.[0];
        const cleanedBitrate = cleanUrl(bestUrl);
        if (cleanedBitrate) return cleanedBitrate;
      }
    } catch (_) {}
  }

  const rehydrationMatch = html.match(/<script\s+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (rehydrationMatch && rehydrationMatch[1]) {
    try {
      const data = JSON.parse(rehydrationMatch[1]);
      const defaultScope = data.__DEFAULT_SCOPE__ || data;
      const videoDetail = defaultScope['webapp.video-detail'] || defaultScope['videoDetail'];
      const itemStruct = videoDetail?.itemInfo?.itemStruct;

      const playAddr = itemStruct?.video?.playAddr || itemStruct?.video?.downloadAddr || itemStruct?.music?.playUrl;
      const cleaned = cleanUrl(playAddr);
      if (cleaned) return cleaned;

      const bitrateList = itemStruct?.video?.bitrateInfo;
      if (Array.isArray(bitrateList) && bitrateList.length > 0) {
        const bestUrl = bitrateList[0]?.PlayAddr?.UrlList?.[0];
        const cleanedBitrate = cleanUrl(bestUrl);
        if (cleanedBitrate) return cleanedBitrate;
      }
    } catch (_) {}
  }

  const sigiMatch = html.match(/<script\s+id="SIGI_STATE"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (sigiMatch && sigiMatch[1]) {
    try {
      const data = JSON.parse(sigiMatch[1]);
      const itemModule = data.ItemModule;
      if (itemModule) {
        const item = videoId && itemModule[videoId] ? itemModule[videoId] : Object.values(itemModule)[0];
        const playAddr = item?.video?.playAddr || item?.video?.downloadAddr || item?.music?.playUrl;
        const cleaned = cleanUrl(playAddr);
        if (cleaned) return cleaned;
      }
    } catch (_) {}
  }

  const playAddrMatch = html.match(/"playAddr":\s*"([^"]+)"/i) ||
    html.match(/"playUrl":\s*"([^"]+)"/i) ||
    html.match(/"downloadAddr":\s*"([^"]+)"/i);
  if (playAddrMatch && playAddrMatch[1]) {
    const cleaned = cleanUrl(playAddrMatch[1]);
    if (cleaned) return cleaned;
  }

  return null;
}
