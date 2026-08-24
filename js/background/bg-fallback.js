'use strict';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DNR_RULE_ID = 99001;

let _lastTikwmRequestTime = 0;
const TIKWM_MIN_INTERVAL_MS = 1200;
let _tikwmQueue = Promise.resolve();

async function _throttledFetchTikwm(canonicalUrl, signal) {
  return new Promise((resolve) => {
    _tikwmQueue = _tikwmQueue.then(async () => {
      if (signal && signal.aborted) {
        resolve(null);
        return;
      }
      const now = Date.now();
      const elapsed = now - _lastTikwmRequestTime;
      if (elapsed < TIKWM_MIN_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, TIKWM_MIN_INTERVAL_MS - elapsed));
      }
      _lastTikwmRequestTime = Date.now();
      try {
        const result = await _fetchTikwmStream(canonicalUrl, signal);
        resolve(result);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

async function _fetchTikwmStream(canonicalUrl, signal) {
  const endpoints = ['https://tikwm.com/api/', 'https://www.tikwm.com/api/'];
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1400));
    }
    const endpoint = endpoints[attempt % endpoints.length];
    try {
      const body = new URLSearchParams({ url: canonicalUrl, hd: '1' });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal,
      });
      if (!res.ok) {
        if (res.status === 429) continue;
        return null;
      }
      const json = await res.json();
      if (json.code === -1 && json.msg && json.msg.includes('Limit')) {
        continue;
      }
      if (json.code !== 0 || !json.data) return null;
      const cdnUrl = json.data.play || json.data.hdplay || (typeof json.data.music === 'string' ? json.data.music : null);
      if (!cdnUrl) return null;
      return {
        ok: true,
        cdnUrl,
        title: json.data.title,
        cover: json.data.cover,
        source: 'tikwm',
      };
    } catch (e) {
      if (e.name === 'AbortError') return null;
    }
  }
  return null;
}

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
    console.warn('[STREAM-EXTRACTOR] Failed to apply mobile UA rule:', e.message);
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
  const maxRetries = 1;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = 1500 + Math.random() * 1000;
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
        break;
      }

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
      }

      const html = await response.text();
      const cdnUrl = _extractCdnFromHtml(html, videoId);

      if (cdnUrl) {
        return { ok: true, cdnUrl, source: 'tiktok-direct' };
      }

      return { ok: false, error: 'Could not extract CDN stream URL from TikTok HTML' };
    } catch (err) {
      await _removeMobileUaRule();
      if (err.name === 'AbortError') throw err;
      lastError = err.message;
    }
  }

  return { ok: false, error: lastError || 'Silent fetch failed' };
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

async function resolveStreamUrl(canonicalUrl, videoId, signal) {
  const tikwmResult = await _throttledFetchTikwm(canonicalUrl, signal);
  if (tikwmResult && tikwmResult.ok && tikwmResult.cdnUrl) {
    return tikwmResult;
  }

  return await _doSilentFetch(canonicalUrl, videoId, signal);
}
