'use strict';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DNR_RULE_ID = 99001;

async function _fetchTikwmStream(canonicalUrl, signal) {
  try {
    const body = new URLSearchParams({ url: canonicalUrl, hd: '1' });
    const res = await fetch('https://tikwm.com/api/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
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
  } catch (_) {
    return null;
  }
}

async function _fetchCobaltStream(canonicalUrl, signal) {
  try {
    const res = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: canonicalUrl,
        vQuality: '720',
      }),
      signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const cdnUrl = json.url || (json.audio ? json.audio : null);
    if (!cdnUrl) return null;
    return { ok: true, cdnUrl, source: 'cobalt' };
  } catch (_) {
    return null;
  }
}

async function _fetchTikSaveStream(canonicalUrl, signal) {
  try {
    const res = await fetch(`https://api.vkrdown.com/api/index.php?url=${encodeURIComponent(canonicalUrl)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal,
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        const cdnUrl = json.data.downloadUrl || json.data.video || json.data.audio || json.data.play;
        if (cdnUrl) {
          return { ok: true, cdnUrl, source: 'tiksave' };
        }
      }
    }
  } catch (_) {}

  try {
    const res2 = await fetch('https://api.tiksave.io/api/v1/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url: canonicalUrl }),
      signal,
    });
    if (res2.ok) {
      const json2 = await res2.json();
      const cdnUrl2 = json2 && json2.data && (json2.data.play || json2.data.video || json2.data.url);
      if (cdnUrl2) {
        return { ok: true, cdnUrl: cdnUrl2, source: 'tiksave' };
      }
    }
  } catch (_) {}

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
  const tikwmResult = await _fetchTikwmStream(canonicalUrl, signal);
  if (tikwmResult && tikwmResult.ok && tikwmResult.cdnUrl) {
    return tikwmResult;
  }

  const cobaltResult = await _fetchCobaltStream(canonicalUrl, signal);
  if (cobaltResult && cobaltResult.ok && cobaltResult.cdnUrl) {
    return cobaltResult;
  }

  const tiksaveResult = await _fetchTikSaveStream(canonicalUrl, signal);
  if (tiksaveResult && tiksaveResult.ok && tiksaveResult.cdnUrl) {
    return tiksaveResult;
  }

  return await _doSilentFetch(canonicalUrl, videoId, signal);
}
