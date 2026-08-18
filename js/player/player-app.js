// TikTok Hi-Fi Player: Queue, UI State, JSON Backup Import, Storage Sync & Shortcuts
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

// Trạng thái ứng dụng
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
};

// Đọc và chuyển đổi dữ liệu backup JSON từ extension
function parseExtensionBackup(data) {
  if (!data || !Array.isArray(data.likedVideos)) {
    throw new Error('File JSON không hợp lệ: thiếu mảng likedVideos');
  }

  const blacklistUrls = new Set((data.blacklistedVideos || []).map(u => u.split('?')[0]));

  const tracks = data.likedVideos
    .filter(item => {
      const url = typeof item === 'string' ? item : item.url;
      return url && !blacklistUrls.has(url.split('?')[0]);
    })
    .map((item, index) => {
      const rawUrl = typeof item === 'string' ? item : (item.url || '');
      const canonicalUrl = rawUrl.split('?')[0];
      const thumb = typeof item === 'object' ? (item.thumb || '') : '';

      const idMatch = canonicalUrl.match(/\/video\/(\d+)/);
      const userMatch = canonicalUrl.match(/@([^/?#]+)/);

      return {
        id: idMatch ? idMatch[1] : `vid_${index}`,
        canonicalUrl,
        thumb,
        username: userMatch ? `@${userMatch[1]}` : '@tiktok',
        title: `TikTok Video #${index + 1}`,
        bgClass: BG_CLASSES[index % BG_CLASSES.length],
      };
    });

  return { tracks, bannedCount: blacklistUrls.size };
}

// Nạp danh sách bài hát vào bộ nhớ
function loadTracks(data, source) {
  try {
    const { tracks, bannedCount } = parseExtensionBackup(data);
    state.tracks = tracks;
    state.bannedFromStorage = bannedCount;
    state.blacklisted.clear();
    state.offlineSet.clear();
    state.activeId = null;
    state.playing = false;

    refreshUI();

    const label = source === 'storage' ? 'extension storage' : 'file JSON';
    showToast(`✅ Đã tải ${tracks.length} video từ ${label}!`);

    if (tracks.length > 0) {
      highlightTrack(tracks[0].id);
    }
  } catch (err) {
    showToast('❌ ' + err.message);
    console.error('[PLAYER] loadTracks error:', err);
  }
}

// Cập nhật danh sách phát và thống kê
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
        ${track.thumb
          ? `<img src="${track.thumb}" alt="" loading="lazy" onerror="this.hidden=true">`
          : ''
        }
        <div class="thumbnail-fallback" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
        <span class="thumb-shine" aria-hidden="true"></span>
      </div>
      <div class="track-copy">
        <strong>${escHtml(track.username)}</strong>
        <span title="${escHtml(track.title)}">${escHtml(track.title)}</span>
        <div class="track-actions">
          <button class="mini-action"
            onclick="event.stopPropagation(); saveOffline('${track.id}')"
            ${isOffline ? 'disabled aria-disabled="true"' : ''}
            aria-label="Tải offline ${escHtml(track.username)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${isOffline ? 'Offline' : 'Save'}
          </button>
          <button class="mini-action danger"
            onclick="event.stopPropagation(); banTrack('${track.id}')"
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

    div.addEventListener('click', () => selectAndPlay(track.id));
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAndPlay(track.id); }
    });

    dom.playlist.insertBefore(div, dom.emptyState);
  });
}

// Cập nhật thông tin hiển thị của bài hát (sân khấu, đĩa than, media bar)
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

  // Thumbnail trên nhãn đĩa than (hoặc fallback mặc định)
  const vinylThumb = document.getElementById('vinyl-thumb');
  const vinylFallback = document.getElementById('vinyl-fallback');
  if (track.thumb) {
    if (vinylThumb) {
      vinylThumb.src = track.thumb;
      vinylThumb.alt = track.username;
      vinylThumb.hidden = false;
    }
    if (vinylFallback) vinylFallback.hidden = true;
  } else {
    if (vinylThumb) vinylThumb.hidden = true;
    if (vinylFallback) {
      vinylFallback.hidden = false;
      if (dom.vinylName) dom.vinylName.textContent = track.username.slice(1, 7).toUpperCase() || 'TIKTOK';
    }
  }

  // Thanh điều khiển dưới đáy
  if (dom.nowBarTitle)   dom.nowBarTitle.textContent   = track.username;
  if (dom.nowBarCreator) dom.nowBarCreator.textContent = track.title;

  if (dom.nowThumb && dom.nowThumbImg) {
    if (track.thumb) {
      dom.nowThumbImg.src   = track.thumb;
      dom.nowThumbImg.alt   = track.username;
      dom.nowThumbImg.hidden = false;
      dom.nowThumb.className = 'now-thumb';
    } else {
      dom.nowThumbImg.hidden = true;
      dom.nowThumb.className = `now-thumb ${track.bgClass}`;
    }
  }

  refreshUI();
}

async function selectAndPlay(id) {
  const track = state.tracks.find(t => t.id === id);
  if (!track) return;

  highlightTrack(id);
  await startPlayback(track);
}

// Bắt đầu phát âm thanh qua JIT CDN & DSP Engine
async function startPlayback(track) {
  state.playing = true;
  state.activeId = track.id;

  resumePlayState();

  showToast(`⚡ Đang nạp âm thanh Hi-Fi: ${track.username}...`);
  let cdnResult = { ok: false };
  if (window.PlayerCDN) {
    cdnResult = await PlayerCDN.refreshCdnUrl(track.canonicalUrl);
  }

  if (cdnResult && cdnResult.ok && cdnResult.cdnUrl) {
    if (window.PlayerAudio) {
      const ok = await PlayerAudio.playTrack(cdnResult.cdnUrl, track);
      if (ok) {
        showToast(`🎧 Đang phát Hi-Fi: ${track.username}`);
      }
    }
  } else {
    console.warn('[APP] CDN refresh unavailable for:', track.canonicalUrl);
    showToast(`⚠️ Không thể phát âm thanh của ${track.username}, thử bài kế tiếp`);
    setTimeout(() => nextTrack(), 1500);
  }

  updateMediaSession(track);
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

// Đồng bộ Media Session API với hệ điều hành
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
  if (!state.activeId && state.tracks.length > 0) {
    selectAndPlay(state.tracks[0].id);
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

function nextTrack() {
  const next = getNextTrackToPlay();
  if (next) selectAndPlay(next.id);
}

function previousTrack() {
  const prev = getPrevTrackToPlay();
  if (prev) selectAndPlay(prev.id);
}

function visibleTracks() {
  return state.tracks.filter(t => !state.blacklisted.has(t.id));
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

// Chuyển đổi chế độ Visualizer (Vinyl / Spectrum)
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
  const bw = w / 36;

  for (let i = 0; i < numBars; i++) {
    let wave = 0.08;
    if (freqData && freqData.length > 0 && state.playing) {
      const binIdx = Math.floor((i / numBars) * (freqData.length * 0.7));
      const rawVal = freqData[binIdx] || 0;
      wave = rawVal / 255;
    } else if (state.playing) {
      wave = Math.abs(Math.sin(Date.now() / 330 + i * 0.7));
    }

    const bh = h * (0.08 + wave * (0.75 + (i % 4) * 0.04));
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#a89cf5');
    grad.addColorStop(0.5, '#86ddeb');
    grad.addColorStop(1, '#edb7d6');
    ctx.fillStyle    = grad;
    ctx.globalAlpha  = 0.85;
    ctx.beginPath();
    ctx.roundRect(i * bw + 6, h - bh, bw - 10, bh, 12);
    ctx.fill();
  }

  state.specRAF = requestAnimationFrame(drawSpectrum);
}

// Xây dựng thanh trượt EQ 10 dải
function buildEqSliders() {
  if (!dom.eqSliders) return;
  dom.eqSliders.innerHTML = '';
  state.eqValues.forEach((val, i) => {
    const label = document.createElement('label');
    label.className = 'eq-slider';
    const band = EQ_BANDS[i];
    label.innerHTML = `
      <input type="range" min="-12" max="12" value="${val}"
        aria-label="${band} EQ" aria-valuemin="-12" aria-valuemax="12" aria-valuenow="${val}"
        oninput="updateEqBand(${i}, this.value, this)">
      <span id="eq-val-${i}">${val > 0 ? '+' : ''}${val}</span>
      <small>${['32','64','125','250','500','1k','2k','4k','8k','16k'][i]}</small>`;
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

// Kéo thả và chọn file JSON backup
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

// Tự động tải danh sách từ chrome.storage
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

// Phím tắt điều khiển
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

// Đăng ký sự kiện từ PlayerAudio
function initAudioEventListeners() {
  if (!window.PlayerAudio) return;

  PlayerAudio.on('timeupdate', ({ currentTime, duration, progressPct }) => {
    state.progressPct = progressPct;
    if (dom.timelineFill) dom.timelineFill.style.width = progressPct + '%';
    if (dom.seekRange)    dom.seekRange.value = progressPct;
    if (dom.timeCurrent)  dom.timeCurrent.textContent = formatTime(currentTime);
    if (dom.timeTotal && duration > 0) {
      dom.timeTotal.textContent = formatTime(duration);
    }
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
    if (track) {
      highlightTrack(track.id);
      updateMediaSession(track);
      state.playing = true;
      resumePlayState();
    }
  });

  PlayerAudio.on('ended', () => {
    handleTrackEnded();
  });

  PlayerAudio.on('error', ({ track }) => {
    if (track && window.PlayerCDN) {
      PlayerCDN.invalidateCdnCache(track.canonicalUrl);
    }
    showToast('⚠️ Lỗi phát stream, tự động thử bài kế tiếp...');
    setTimeout(() => nextTrack(), 1000);
  });
}

Object.assign(window, {
  togglePlay, nextTrack, previousTrack,
  toggleShuffle, toggleLoop, banCurrentTrack,
  banTrack, saveOffline, seekTo,
  setMode, toggleNormalizer, updateBass, updateCrossfade,
  updateVolume, switchTab, hideToast,
  applyPreset, updateEqBand,
});

buildEqSliders();
initFileImport();
initKeyboard();
initAudioEventListeners();
if (dom.searchInput) dom.searchInput.addEventListener('input', refreshUI);
refreshUI();
tryLoadFromStorage();
