'use strict';

const EQ_PRESETS = window.PlayerAudio ? PlayerAudio.EQ_PRESETS : {
  'Flat':         [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
  'Bass Boost':   [ 9,  7,  5,  3,  2,  1,  0,  0, -1, -2],
  'Vocal':        [-2, -1,  0,  2,  4,  5,  4,  3,  1,  0],
  'Electronic':   [ 4,  3,  2,  0, -1,  2,  4,  5,  3,  2],
  'Lofi':         [ 2,  2,  1,  0, -1, -1, -2, -2, -1,  0],
};
const EQ_BANDS = ['32Hz','64Hz','125Hz','250Hz','500Hz','1kHz','2kHz','4kHz','8kHz','16kHz'];
const BG_CLASSES = ['bg-a','bg-b','bg-c','bg-d','bg-e'];

const state = {
  tracks: [],
  blacklisted: new Set(),
  bannedFromStorage: 0,
  offlineSet: new Set(),
  activeId: null,
  playing: false,
  shuffled: false,
  looping: false,
  currentMode: 'vinyl',
  eqValues: [...EQ_PRESETS['Bass Boost']],
  progressPct: 0,
  toastTimer: null,
  specRAF: null,
  specCanvas: null,
};

const $ = id => document.getElementById(id);
const dom = {
  playlist:       $('playlist'),
  emptyState:     $('empty-state'),
  trackCount:     $('track-count'),
  statTotal:      $('stat-total'),
  statOffline:    $('stat-offline'),
  statBanned:     $('stat-banned'),
  nowCreator:     $('now-creator'),
  nowTitle:       $('now-title'),
  originalLink:   $('original-link'),
  vinylEl:        $('vinyl-el'),
  vinylName:      $('vinyl-name'),
  playBtn:        $('play-btn'),
  btnPrev:        $('btn-prev'),
  btnNext:        $('btn-next'),
  btnBan:         $('btn-ban'),
  timelineFill:   $('timeline-fill'),
  timeCurrent:    $('time-current'),
  timeTotal:      $('time-total'),
  nowThumb:       $('now-thumb'),
  nowThumbImg:    $('now-thumb-img'),
  nowBarTitle:    $('now-bar-title'),
  nowBarCreator:  $('now-bar-creator'),
  seekRange:      $('seek-range'),
  volumeRange:    $('volume-range'),
  searchInput:    $('search-input'),
  importZone:     $('import-zone'),
  fileInput:      $('file-input'),
  eqSliders:      $('eq-sliders'),
  toastEl:        $('toast'),
  toastMsg:       $('toast-msg'),
  toastClose:     $('toast-close'),
  eqPreset:       $('eq-preset'),
  bassRange:      $('bass-range'),
  bassLabel:      $('bass-label'),
  crossfadeRange: $('crossfade-range'),
  crossfadeLabel: $('crossfade-label'),
  btnShuffle:     $('btn-shuffle'),
  btnLoop:        $('btn-loop'),
  btnVinyl:       $('btn-vinyl'),
  btnSpectrum:    $('btn-spectrum'),
  visualizerArea: $('visualizer-area'),
  normalizerBtn:  $('normalizer-btn'),
  tabPlaylist:    $('tab-playlist'),
  tabOffline:     $('tab-offline'),
  btnShuffleLib:  $('btn-shuffle-library'),
};

function parseExtensionBackup(data) {
  if (!data || !Array.isArray(data.likedVideos)) {
    throw new Error('File JSON không hợp lệ: thiếu mảng likedVideos');
  }

  const blacklistUrls = new Set((data.blacklistedVideos || []).map(u => (typeof u === 'string' ? u.split('?')[0] : '')));

  const tracks = data.likedVideos
    .filter(item => {
      const url = typeof item === 'string' ? item : item.url;
      return url && !blacklistUrls.has(url.split('?')[0]);
    })
    .map((item, index) => {
      const rawUrl = typeof item === 'string' ? item : (item.url || '');
      const canonicalUrl = rawUrl.split('?')[0];
      const thumb = typeof item === 'object' ? (item.thumb || '') : '';

      const match = canonicalUrl.match(/https:\/\/www\.tiktok\.com\/@([^/]+)\/video\/(\d+)/);
      const username = match ? `@${match[1]}` : (canonicalUrl.match(/@([^/?#]+)/) ? `@${canonicalUrl.match(/@([^/?#]+)/)[1]}` : '@tiktok');
      const videoId = match ? match[2] : (canonicalUrl.match(/\/video\/(\d+)/) ? canonicalUrl.match(/\/video\/(\d+)/)[1] : `vid_${index}`);

      return {
        id: videoId,
        canonicalUrl,
        thumb,
        username,
        title: `TikTok Video #${index + 1}`,
        bgClass: BG_CLASSES[index % BG_CLASSES.length],
      };
    });

  return { tracks, bannedCount: blacklistUrls.size };
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadTracks(data, source) {
  try {
    const { tracks, bannedCount } = parseExtensionBackup(data);
    state.tracks = shuffleArray(tracks);
    state.bannedFromStorage = bannedCount;
    state.blacklisted.clear();
    state.offlineSet.clear();
    state.activeId = null;
    state.playing = false;

    refreshUI();

    const label = source === 'storage' ? 'extension storage' : 'file JSON';
    showToast(`✅ Đã tải ${state.tracks.length} video từ ${label}!`);

    if (state.tracks.length > 0) {
      highlightTrack(state.tracks[0].id);
      if (window.PlayerCDN) {
        const initialUrls = state.tracks.slice(0, 4).map(t => t.canonicalUrl);
        PlayerCDN.prefetchTracks(initialUrls);
      }
    }
  } catch (err) {
    showToast('❌ ' + err.message);
    console.error('[PLAYER] loadTracks error:', err);
  }
}

function refreshUI() {
  const query = dom.searchInput ? dom.searchInput.value.toLowerCase() : '';
  const visible = state.tracks.filter(t =>
    !state.blacklisted.has(t.id) &&
    (t.username.toLowerCase().includes(query) || t.title.toLowerCase().includes(query))
  );

  if (dom.statTotal)   dom.statTotal.textContent   = state.tracks.filter(t => !state.blacklisted.has(t.id)).length;
  if (dom.statOffline) dom.statOffline.textContent = state.offlineSet.size;
  if (dom.statBanned)  dom.statBanned.textContent  = state.bannedFromStorage + state.blacklisted.size;
  if (dom.trackCount)  dom.trackCount.textContent  = visible.length + ' video';

  dom.playlist.querySelectorAll('.track-card').forEach(el => el.remove());

  if (visible.length === 0) {
    if (dom.emptyState) {
      dom.emptyState.hidden = false;
      dom.emptyState.style.display = 'flex';
    }
    return;
  }

  if (dom.emptyState) {
    dom.emptyState.hidden = true;
    dom.emptyState.style.display = 'none';
  }

  visible.forEach(track => {
    const isSelected = track.id === state.activeId;
    const isOffline  = state.offlineSet.has(track.id);

    const div = document.createElement('div');
    div.className = 'track-card' + (isSelected ? ' selected' : '');
    div.dataset.id = track.id;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', `Phát ${track.username}`);
    div.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

    div.innerHTML = `
      <div class="thumbnail ${track.bgClass}">
        <div class="thumbnail-fallback" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
        <span class="thumb-shine" aria-hidden="true"></span>
      </div>
      <div class="track-copy">
        <strong>${escHtml(track.username)}</strong>
        <span title="${escHtml(track.title)}">${escHtml(track.title)}</span>
        <div class="track-actions">
          <button class="mini-action action-save"
            ${isOffline ? 'disabled aria-disabled="true"' : ''}
            aria-label="Tải offline ${escHtml(track.username)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${isOffline ? 'Offline' : 'Save'}
          </button>
          <button class="mini-action danger action-ban"
            aria-label="Cấm video ${escHtml(track.username)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Cấm
          </button>
        </div>
      </div>
      ${isOffline ? '<span class="offline-dot" aria-label="Có sẵn offline"></span>' : ''}
    `;

    const thumbBox = div.querySelector('.thumbnail');
    if (track.thumb && thumbBox) {
      const img = document.createElement('img');
      img.alt = track.username;
      img.referrerPolicy = 'no-referrer';
      img.style.opacity = '0';
      img.style.transition = 'opacity 0.25s ease';
      img.onload = () => { img.style.opacity = '1'; };
      img.onerror = () => { img.remove(); };
      img.src = track.thumb;
      thumbBox.appendChild(img);
    }

    const btnSave = div.querySelector('.action-save');
    if (btnSave) {
      btnSave.addEventListener('click', (e) => {
        e.stopPropagation();
        saveOffline(track.id);
      });
    }

    const btnBan = div.querySelector('.action-ban');
    if (btnBan) {
      btnBan.addEventListener('click', (e) => {
        e.stopPropagation();
        banTrack(track.id);
      });
    }

    div.addEventListener('click', () => selectAndPlay(track.id));
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAndPlay(track.id); }
    });

    dom.playlist.insertBefore(div, dom.emptyState);
  });
}

function highlightTrack(id) {
  const track = state.tracks.find(t => t.id === id);
  if (!track) return;
  state.activeId = id;

  if (dom.nowCreator)   dom.nowCreator.textContent = track.username;
  if (dom.nowTitle)     dom.nowTitle.innerHTML = `${escHtml(track.title)} <span aria-hidden="true">✦</span>`;
  if (dom.originalLink) {
    dom.originalLink.href = track.canonicalUrl;
    dom.originalLink.hidden = false;
  }

  const vinylThumb = document.getElementById('vinyl-thumb');
  const vinylFallback = document.getElementById('vinyl-fallback');
  if (vinylThumb && vinylFallback) {
    vinylThumb.style.opacity = '0';
    vinylThumb.referrerPolicy = 'no-referrer';
    if (track.thumb) {
      vinylThumb.onload = () => {
        vinylThumb.style.opacity = '1';
        vinylFallback.style.display = 'none';
      };
      vinylThumb.onerror = () => {
        vinylThumb.style.opacity = '0';
        vinylFallback.style.display = 'flex';
      };
      vinylThumb.src = track.thumb;
    } else {
      vinylFallback.style.display = 'flex';
    }
  }

  if (dom.nowBarTitle)   dom.nowBarTitle.textContent   = track.username;
  if (dom.nowBarCreator) dom.nowBarCreator.textContent = track.title;

  if (dom.nowThumb && dom.nowThumbImg) {
    dom.nowThumbImg.style.opacity = '0';
    dom.nowThumbImg.referrerPolicy = 'no-referrer';
    if (track.thumb) {
      dom.nowThumbImg.onload = () => {
        dom.nowThumbImg.style.opacity = '1';
        dom.nowThumb.className = 'now-thumb';
      };
      dom.nowThumbImg.onerror = () => {
        dom.nowThumbImg.style.opacity = '0';
        dom.nowThumb.className = `now-thumb ${track.bgClass}`;
      };
      dom.nowThumbImg.src = track.thumb;
    } else {
      dom.nowThumb.className = `now-thumb ${track.bgClass}`;
    }
  }

  refreshUI();
}

let skipCooldownTimer = null;
let lastNavigationTime = 0;

function clearSkipCooldown() {
  if (skipCooldownTimer) {
    clearTimeout(skipCooldownTimer);
    skipCooldownTimer = null;
  }
}

function enqueueForHealing(track, reason) {
  if (!track || !track.canonicalUrl) return;
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  chrome.runtime.sendMessage(
    { action: 'enqueueForHealing', canonicalUrl: track.canonicalUrl, reason },
    () => { if (chrome.runtime.lastError) {} },
  );
}

function scheduleAutoSkip(targetTrackId) {
  clearSkipCooldown();
  skipCooldownTimer = setTimeout(() => {
    skipCooldownTimer = null;
    if (window.PlayerAudio && PlayerAudio.isPlaying() && PlayerAudio.getCurrentTime() > 0.5) {
      console.log('[APP] Skip cancelled: audio is playing normally');
      return;
    }
    if (targetTrackId && state.activeId !== targetTrackId) {
      return;
    }
    nextTrack(true);
  }, 3500);
}

async function selectAndPlay(id, isAuto = false) {
  const now = Date.now();
  if (isAuto && (now - lastNavigationTime < 2000)) {
    return;
  }
  lastNavigationTime = now;

  clearSkipCooldown();
  const track = state.tracks.find(t => t.id === id);
  if (!track) return;

  highlightTrack(id);
  await startPlayback(track);
}

async function startPlayback(track) {
  clearSkipCooldown();
  state.playing = true;
  state.activeId = track.id;

  resumePlayState();

  const isCached = window.PlayerCDN ? PlayerCDN.hasCached(track.canonicalUrl) : false;
  if (!isCached) {
    showToast(`⚡ Đang nạp âm thanh: ${track.username}...`);
  }

  console.log('[APP] Fetching stream for:', track.username, track.canonicalUrl);
  let cdnResult = { ok: false };
  if (window.PlayerCDN) {
    cdnResult = await PlayerCDN.refreshCdnUrl(track.canonicalUrl);
  }
  console.log('[APP] CDN Result for', track.username, ':', cdnResult);

  if (cdnResult && cdnResult.ok && cdnResult.cdnUrl) {
    if (cdnResult.cover && !track.thumb) {
      track.thumb = cdnResult.cover;
      highlightTrack(track.id);
    }
    if (window.PlayerAudio) {
      const ok = await PlayerAudio.playTrack(cdnResult.cdnUrl, track);
      if (ok) {
        clearSkipCooldown();
        showToast(`🎧 Đang phát: ${track.username}`);
        triggerNextPreload(track);
      } else {
        if (window.PlayerCDN) {
          PlayerCDN.invalidateCdnCache(track.canonicalUrl);
        }
        enqueueForHealing(track, 'playback_failed');
        showToast(`⚠️ Không thể phát video của ${track.username}, thử bài kế tiếp`);
        scheduleAutoSkip(track.id);
      }
    }
  } else {
    if (window.PlayerCDN) {
      PlayerCDN.invalidateCdnCache(track.canonicalUrl);
    }
    console.warn('[APP] CDN refresh unavailable for:', track.canonicalUrl, cdnResult ? cdnResult.error : '');
    enqueueForHealing(track, 'cdn_expired');
    showToast(`⚠️ Không thể phát video của ${track.username}, thử bài kế tiếp`);
    scheduleAutoSkip(track.id);
  }

  updateMediaSession(track);
}

function triggerNextPreload(currentTrack) {
  const nextTrackObj = getNextTrackToPlay();
  if (!nextTrackObj || !window.PlayerCDN) return;

  const visible = visibleTracks();
  const curIdx = visible.findIndex(t => t.id === currentTrack.id);
  const upcomingUrls = [];
  for (let i = 1; i <= 3; i++) {
    const u = visible[(curIdx + i) % visible.length];
    if (u) upcomingUrls.push(u.canonicalUrl);
  }
  PlayerCDN.prefetchTracks(upcomingUrls);

  PlayerCDN.refreshCdnUrl(nextTrackObj.canonicalUrl).then(res => {
    if (res && res.ok) {
      if (res.cover && !nextTrackObj.thumb) {
        nextTrackObj.thumb = res.cover;
      }
      if (res.cdnUrl && window.PlayerAudio) {
        PlayerAudio.preloadTrack(res.cdnUrl, nextTrackObj);
      }
    }
  });
}

function getNextTrackToPlay() {
  const visible = visibleTracks();
  if (!visible.length) return null;
  if (state.shuffled) {
    return visible[Math.floor(Math.random() * visible.length)];
  }
  const idx = visible.findIndex(t => t.id === state.activeId);
  return visible[(idx + 1) % visible.length];
}

function getPrevTrackToPlay() {
  const visible = visibleTracks();
  if (!visible.length) return null;
  const idx = visible.findIndex(t => t.id === state.activeId);
  return visible[(idx - 1 + visible.length) % visible.length];
}

function handleTrackEnded() {
  if (state.looping) {
    const cur = state.tracks.find(t => t.id === state.activeId);
    if (cur) { startPlayback(cur); return; }
  }
  nextTrack();
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.username,
    artwork: track.thumb ? [{ src: track.thumb, sizes: '300x300', type: 'image/jpeg' }] : [],
  });
  navigator.mediaSession.setActionHandler('play',          () => togglePlay());
  navigator.mediaSession.setActionHandler('pause',         () => togglePlay());
  navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
  navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
}

function togglePlay() {
  if (state.tracks.length === 0) return;

  const currentAudioTrack = window.PlayerAudio ? PlayerAudio.getActiveTrack() : null;
  if (!currentAudioTrack) {
    const targetId = state.activeId || state.tracks[0].id;
    selectAndPlay(targetId);
    return;
  }

  if (state.playing) {
    pausePlayState();
    if (window.PlayerAudio) PlayerAudio.pause();
  } else {
    resumePlayState();
    if (window.PlayerAudio) PlayerAudio.resume();
  }
}

function pausePlayState() {
  state.playing = false;
  if (dom.vinylEl) dom.vinylEl.classList.remove('spinning');
  const playBtn = document.getElementById('play-btn');
  if (playBtn) {
    playBtn.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', 'Phát');
  }
}

function resumePlayState() {
  state.playing = true;
  if (dom.vinylEl) dom.vinylEl.classList.add('spinning');
  const playBtn = document.getElementById('play-btn');
  if (playBtn) {
    playBtn.classList.add('is-playing');
    playBtn.setAttribute('aria-label', 'Tạm dừng');
  }
}

function nextTrack(isAuto = false) {
  const next = getNextTrackToPlay();
  if (next) selectAndPlay(next.id, isAuto);
}

function previousTrack() {
  const prev = getPrevTrackToPlay();
  if (prev) selectAndPlay(prev.id, false);
}

function visibleTracks() {
  return state.tracks.filter(t => !state.blacklisted.has(t.id));
}

function shuffleLibrary() {
  if (!state.tracks || state.tracks.length <= 1) return;
  state.tracks = shuffleArray(state.tracks);
  refreshUI();
  if (dom.btnShuffleLib) {
    dom.btnShuffleLib.classList.remove('is-shuffling');
    void dom.btnShuffleLib.offsetWidth;
    dom.btnShuffleLib.classList.add('is-shuffling');
  }
  showToast('🔀 Đã xáo trộn danh sách video!');
}

function toggleShuffle() {
  state.shuffled = !state.shuffled;
  if (dom.btnShuffle) {
    dom.btnShuffle.classList.toggle('is-active', state.shuffled);
    dom.btnShuffle.setAttribute('aria-pressed', state.shuffled);
  }
}

function toggleLoop() {
  state.looping = !state.looping;
  if (dom.btnLoop) {
    dom.btnLoop.classList.toggle('is-active', state.looping);
    dom.btnLoop.setAttribute('aria-pressed', state.looping);
  }
}

function banCurrentTrack() {
  if (!state.activeId) return;
  banTrack(state.activeId);
}

function banTrack(id) {
  state.blacklisted.add(id);

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['blacklistedVideos', 'likedVideos'], data => {
      const track = state.tracks.find(t => t.id === id);
      if (!track) return;
      const bl = data.blacklistedVideos || [];
      if (!bl.includes(track.canonicalUrl)) {
        bl.push(track.canonicalUrl);
      }
      const lv = (data.likedVideos || []).filter(v => {
        const u = typeof v === 'string' ? v : v.url || '';
        return u.split('?')[0] !== track.canonicalUrl;
      });
      chrome.storage.local.set({ blacklistedVideos: bl, likedVideos: lv });
    });
  }

  showToast('🚫 Video đã được thêm vào danh sách cấm');
  if (id === state.activeId) nextTrack();
  refreshUI();
}

function saveOffline(id) {
  state.offlineSet.add(id);
  showToast('💾 Đã đánh dấu lưu offline (DP-4)');
  refreshUI();
}

function seekTo(val) {
  const pct = Number(val);
  state.progressPct = pct;
  if (dom.timelineFill) dom.timelineFill.style.width = pct + '%';
  if (dom.seekRange)    dom.seekRange.value = pct;
  if (window.PlayerAudio) {
    PlayerAudio.seekPercent(pct);
  }
}

function setMode(mode) {
  state.currentMode = mode;
  const isVinyl = mode === 'vinyl';

  if (dom.vinylEl) dom.vinylEl.hidden = !isVinyl;
  if (dom.btnVinyl) {
    dom.btnVinyl.classList.toggle('active', isVinyl);
    dom.btnVinyl.setAttribute('aria-pressed', isVinyl);
  }
  if (dom.btnSpectrum) {
    dom.btnSpectrum.classList.toggle('active', !isVinyl);
    dom.btnSpectrum.setAttribute('aria-pressed', !isVinyl);
  }

  if (!isVinyl) {
    startSpectrumCanvas();
  } else {
    stopSpectrumCanvas();
  }
}

function startSpectrumCanvas() {
  if (!state.specCanvas) {
    state.specCanvas = document.createElement('canvas');
    state.specCanvas.className = 'spectrum';
    state.specCanvas.setAttribute('aria-label', 'Đồ thị phổ âm thanh');
    if (dom.visualizerArea) dom.visualizerArea.appendChild(state.specCanvas);
  }
  state.specCanvas.hidden = false;
  drawSpectrum();
}

function stopSpectrumCanvas() {
  if (state.specRAF) cancelAnimationFrame(state.specRAF);
  if (state.specCanvas) state.specCanvas.hidden = true;
}

function drawSpectrum() {
  const canvas = state.specCanvas;
  if (!canvas || canvas.hidden) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width  = canvas.clientWidth  * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);

  const analyser = window.PlayerAudio ? PlayerAudio.getAnalyserNode() : null;
  let freqData = null;
  if (analyser && state.playing) {
    freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
  }

  const numBars = 32;
  const barWidth = 8 * 2;
  const barGap = 5 * 2;
  const totalBarsWidth = numBars * barWidth + (numBars - 1) * barGap;
  const startX = Math.max(0, (w - totalBarsWidth) / 2);

  for (let i = 0; i < numBars; i++) {
    let wave = 0.06;
    if (freqData && freqData.length > 0 && state.playing) {
      const binIdx = Math.floor((i / numBars) * (freqData.length * 0.75));
      const rawVal = freqData[binIdx] || 0;
      wave = rawVal / 255;
    } else if (state.playing) {
      wave = Math.abs(Math.sin(Date.now() / 330 + i * 0.7));
    }

    const bh = Math.max(8, h * (0.08 + wave * 0.82));
    const x = startX + i * (barWidth + barGap);
    const y = h - bh;

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#a89cf5');
    grad.addColorStop(0.5, '#86ddeb');
    grad.addColorStop(1, '#edb7d6');
    ctx.fillStyle    = grad;
    ctx.globalAlpha  = 0.9;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, bh, 8);
    ctx.fill();
  }

  state.specRAF = requestAnimationFrame(drawSpectrum);
}

function buildEqSliders() {
  if (!dom.eqSliders) return;
  dom.eqSliders.innerHTML = '';
  state.eqValues.forEach((val, i) => {
    const label = document.createElement('label');
    label.className = 'eq-slider';
    const band = EQ_BANDS[i];
    label.innerHTML = `
      <input type="range" min="-12" max="12" value="${val}"
        aria-label="${band} EQ" aria-valuemin="-12" aria-valuemax="12" aria-valuenow="${val}">
      <span id="eq-val-${i}">${val > 0 ? '+' : ''}${val}</span>
      <small>${['32','64','125','250','500','1k','2k','4k','8k','16k'][i]}</small>`;
    const input = label.querySelector('input');
    if (input) {
      input.addEventListener('input', (e) => updateEqBand(i, e.target.value, e.target));
    }
    dom.eqSliders.appendChild(label);
  });
}

function updateEqBand(index, value, el) {
  const numVal = Number(value);
  state.eqValues[index] = numVal;
  const span = document.getElementById(`eq-val-${index}`);
  if (span) span.textContent = (numVal > 0 ? '+' : '') + numVal;
  if (el) el.setAttribute('aria-valuenow', numVal);
  if (dom.eqPreset) dom.eqPreset.value = 'Flat';
  if (window.PlayerAudio) PlayerAudio.setEqBand(index, numVal);
}

function applyPreset(name) {
  const vals = EQ_PRESETS[name];
  if (!vals) return;
  state.eqValues = [...vals];
  buildEqSliders();
  if (window.PlayerAudio) PlayerAudio.setEqPreset(name);
}

function toggleNormalizer(btn) {
  btn.classList.toggle('on');
  const isOn = btn.classList.contains('on');
  btn.setAttribute('aria-label', `Volume normalizer ${isOn ? 'on' : 'off'}`);
  if (window.PlayerAudio) PlayerAudio.setNormalizer(isOn);
  showToast(`Volume Normalizer: ${isOn ? 'BẬT' : 'TẮT'}`);
}

function updateBass(val) {
  const num = Number(val);
  if (dom.bassLabel) dom.bassLabel.textContent = (num > 0 ? '+' : '') + num + ' dB';
  if (dom.bassRange) dom.bassRange.setAttribute('aria-valuenow', num);
  if (window.PlayerAudio) PlayerAudio.setBassBoost(num);
}

function updateCrossfade(val) {
  const sec = parseFloat(val);
  if (dom.crossfadeLabel) dom.crossfadeLabel.textContent = sec.toFixed(1) + 's';
  if (dom.crossfadeRange) dom.crossfadeRange.setAttribute('aria-valuenow', sec);
  if (window.PlayerAudio) PlayerAudio.setCrossfadeDuration(sec);
}

function updateVolume(val) {
  const num = Number(val);
  if (dom.volumeRange) dom.volumeRange.setAttribute('aria-valuenow', num);
  if (window.PlayerAudio) PlayerAudio.setVolume(num);
}

function switchTab(name) {
  ['playlist','offline'].forEach(n => {
    const btn = document.getElementById('tab-' + n);
    if (btn) {
      btn.classList.toggle('active', n === name);
      btn.setAttribute('aria-selected', n === name);
    }
  });
}

function showToast(msg) {
  if (!dom.toastEl || !dom.toastMsg) return;
  dom.toastMsg.textContent = msg;
  dom.toastEl.hidden = false;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(hideToast, 2800);
}

function hideToast() {
  if (dom.toastEl) dom.toastEl.hidden = true;
}

function initFileImport() {
  if (!dom.importZone || !dom.fileInput) return;

  dom.importZone.addEventListener('click', () => dom.fileInput.click());
  dom.importZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.fileInput.click(); }
  });
  dom.importZone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.importZone.classList.add('drag-over');
  });
  dom.importZone.addEventListener('dragleave', () => dom.importZone.classList.remove('drag-over'));
  dom.importZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.importZone.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) readJsonFile(file);
  });
  dom.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) readJsonFile(file);
    dom.fileInput.value = '';
  });
}

function readJsonFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      loadTracks(data, 'file');
    } catch (_) {
      showToast('❌ File JSON không hợp lệ hoặc bị lỗi định dạng');
    }
  };
  reader.readAsText(file);
}

function tryLoadFromStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(
    ['likedVideos', 'blacklistedVideos', 'tiktokUsername', 'targetLimit'],
    data => {
      if (data.likedVideos && data.likedVideos.length > 0) {
        loadTracks(data, 'storage');
      }
    }
  );
}

function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (window.PlayerAudio) {
          const cur = PlayerAudio.getCurrentTime();
          PlayerAudio.seek(cur + 5);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (window.PlayerAudio) {
          const cur = PlayerAudio.getCurrentTime();
          PlayerAudio.seek(Math.max(0, cur - 5));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (dom.volumeRange) {
          const v = Math.min(100, Number(dom.volumeRange.value) + 5);
          dom.volumeRange.value = v;
          updateVolume(v);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (dom.volumeRange) {
          const v = Math.max(0, Number(dom.volumeRange.value) - 5);
          dom.volumeRange.value = v;
          updateVolume(v);
        }
        break;
      case 'm': case 'M':
        if (window.PlayerAudio) {
          const isMuted = PlayerAudio.toggleMute();
          showToast(isMuted ? '🔇 Đã tắt tiếng' : '🔊 Đã bật tiếng');
        }
        break;
      case 'n': case 'N':
        nextTrack();
        break;
      case 'p': case 'P':
        previousTrack();
        break;
    }
  });
}

function formatTime(s) {
  if (isNaN(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function initUIEventListeners() {
  if (dom.tabPlaylist) dom.tabPlaylist.addEventListener('click', () => switchTab('playlist'));
  if (dom.tabOffline)  dom.tabOffline.addEventListener('click', () => switchTab('offline'));
  if (dom.btnVinyl)    dom.btnVinyl.addEventListener('click', () => setMode('vinyl'));
  if (dom.btnSpectrum) dom.btnSpectrum.addEventListener('click', () => setMode('spectrum'));
  if (dom.normalizerBtn) dom.normalizerBtn.addEventListener('click', () => toggleNormalizer(dom.normalizerBtn));
  if (dom.bassRange) dom.bassRange.addEventListener('input', (e) => updateBass(e.target.value));
  if (dom.crossfadeRange) dom.crossfadeRange.addEventListener('input', (e) => updateCrossfade(e.target.value));
  if (dom.eqPreset) dom.eqPreset.addEventListener('change', (e) => applyPreset(e.target.value));
  if (dom.seekRange) dom.seekRange.addEventListener('input', (e) => seekTo(e.target.value));
  if (dom.btnShuffle) dom.btnShuffle.addEventListener('click', toggleShuffle);
  if (dom.btnPrev) dom.btnPrev.addEventListener('click', previousTrack);
  if (dom.playBtn) dom.playBtn.addEventListener('click', togglePlay);
  if (dom.btnNext) dom.btnNext.addEventListener('click', nextTrack);
  if (dom.btnLoop) dom.btnLoop.addEventListener('click', toggleLoop);
  if (dom.btnBan) dom.btnBan.addEventListener('click', banCurrentTrack);
  if (dom.volumeRange) dom.volumeRange.addEventListener('input', (e) => updateVolume(e.target.value));
  if (dom.toastClose) dom.toastClose.addEventListener('click', hideToast);
  if (dom.searchInput) dom.searchInput.addEventListener('input', refreshUI);
  if (dom.btnShuffleLib) {
    dom.btnShuffleLib.addEventListener('click', shuffleLibrary);
    dom.btnShuffleLib.addEventListener('animationend', () => {
      dom.btnShuffleLib.classList.remove('is-shuffling');
    });
  }
}

function initAudioEventListeners() {
  if (!window.PlayerAudio) return;

  PlayerAudio.on('timeupdate', ({ currentTime, duration, progressPct }) => {
    if (currentTime > 0.3) {
      clearSkipCooldown();
    }
    state.progressPct = progressPct;
    if (dom.timelineFill) dom.timelineFill.style.width = progressPct + '%';
    if (dom.seekRange)    dom.seekRange.value = progressPct;
    if (dom.timeCurrent)  dom.timeCurrent.textContent = formatTime(currentTime);
    if (dom.timeTotal && duration > 0) {
      dom.timeTotal.textContent = formatTime(duration);
    }
  });

  PlayerAudio.on('play', () => {
    clearSkipCooldown();
  });

  PlayerAudio.on('preloadNeeded', async () => {
    const next = getNextTrackToPlay();
    if (!next) return;
    if (window.PlayerCDN) {
      const result = await PlayerCDN.refreshCdnUrl(next.canonicalUrl);
      if (result && result.ok && result.cdnUrl) {
        PlayerAudio.preloadTrack(result.cdnUrl, next);
      }
    }
  });

  PlayerAudio.on('trackChanged', ({ track }) => {
    clearSkipCooldown();
    if (track) {
      highlightTrack(track.id);
      updateMediaSession(track);
      state.playing = true;
      resumePlayState();
    }
  });

  PlayerAudio.on('ended', () => {
    clearSkipCooldown();
    handleTrackEnded();
  });

  PlayerAudio.on('error', ({ track, error }) => {
    console.warn('[APP] PlayerAudio error on track:', track ? track.username : 'unknown', error);
    if (window.PlayerAudio && PlayerAudio.isPlaying() && PlayerAudio.getCurrentTime() > 0.5) {
      console.log('[APP] Suppressing error skip - track is playing');
      return;
    }
    if (track && window.PlayerCDN) {
      PlayerCDN.invalidateCdnCache(track.canonicalUrl);
    }
    const isStalled = error && (error.message && error.message.includes('stalled'));
    enqueueForHealing(track, isStalled ? 'playback_stalled' : 'stream_error');
    const trackName = track && track.username ? track.username : 'bài hát này';
    const msg = isStalled
      ? `⚠️ Luồng phát của ${trackName} bị đứng quá lâu → Tự chuyển bài...`
      : `⚠️ Không thể phát ${trackName}, đang chuyển bài kế tiếp...`;
    showToast(msg);
    scheduleAutoSkip(track ? track.id : null);
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.healingQueue) return;
      const newQueue = changes.healingQueue.newValue || [];
      const healedEntries = newQueue.filter((e) => e.status === 'healed' && e.newCdnUrl);
      for (const entry of healedEntries) {
        const track = state.tracks.find((t) => t.canonicalUrl === entry.url);
        if (track && window.PlayerCDN) {
          // Silently update the CDN cache with the refreshed URL
          PlayerCDN.invalidateCdnCache(entry.url);
          console.log('[APP] 🩹 Healing: CDN cache refreshed for', track.username);
        }
      }
    });
  }
}

Object.assign(window, {
  togglePlay, nextTrack, previousTrack,
  toggleShuffle, toggleLoop, banCurrentTrack,
  banTrack, saveOffline, seekTo,
  setMode, toggleNormalizer, updateBass, updateCrossfade,
  updateVolume, switchTab, hideToast,
  applyPreset, updateEqBand, shuffleLibrary,
});

buildEqSliders();
initFileImport();
initKeyboard();
initUIEventListeners();
initAudioEventListeners();
refreshUI();
tryLoadFromStorage();
