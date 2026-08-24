'use strict';

(function () {
  const EQ_BANDS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
  let lastStartIndex = -1;
  let cachedFreqData = null;

  function getState() {
    return window.PlayerState ? window.PlayerState.state : {};
  }

  function getDom() {
    return window.PlayerState ? window.PlayerState.dom : {};
  }

  function esc(str) {
    return window.PlayerState ? window.PlayerState.escHtml(str) : String(str);
  }

  function updateVirtualScroll(force = false) {
    const state = getState();
    const dom = getDom();
    const visible = state.visibleTracks || [];
    const playlist = dom.playlist;
    if (!playlist) return;

    const itemHeight = 70;
    const viewportHeight = playlist.clientHeight || 400;
    const scrollTop = playlist.scrollTop;

    const buffer = 5;
    const totalCount = visible.length;

    if (totalCount === 0) {
      if (dom.playlistScrollContent) {
        dom.playlistScrollContent.innerHTML = '';
        dom.playlistScrollContent.style.paddingTop = '0px';
        dom.playlistScrollContent.style.paddingBottom = '0px';
      }
      lastStartIndex = -1;
      return;
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / itemHeight) + buffer);

    if (!force && startIndex === lastStartIndex) {
      return;
    }
    lastStartIndex = startIndex;

    const padTop = startIndex * itemHeight;
    const padBottom = Math.max(0, (totalCount - endIndex) * itemHeight);

    if (dom.playlistScrollContent) {
      dom.playlistScrollContent.style.paddingTop = padTop + 'px';
      dom.playlistScrollContent.style.paddingBottom = padBottom + 'px';
      dom.playlistScrollContent.innerHTML = '';
    }

    const itemsToRender = visible.slice(startIndex, endIndex);

    itemsToRender.forEach((track) => {
      const isSelected = track.id === state.activeId;
      const isOffline = state.offlineSet.has(track.id);

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
          <strong>${esc(track.username)}</strong>
          <span title="${esc(track.title)}">${esc(track.title)}</span>
          <div class="track-actions">
            <button class="mini-action action-save"
              ${isOffline ? 'disabled aria-disabled="true"' : ''}
              aria-label="Tải offline ${esc(track.username)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              ${isOffline ? 'Offline' : 'Save'}
            </button>
            <button class="mini-action danger action-ban"
              aria-label="Cấm video ${esc(track.username)}">
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

      if (dom.playlistScrollContent) {
        dom.playlistScrollContent.appendChild(div);
      }
    });
  }

  function refreshUI() {
    const state = getState();
    const dom = getDom();
    const query = dom.searchInput ? dom.searchInput.value.toLowerCase() : '';
    const visible = state.tracks.filter(t =>
      !state.blacklisted.has(t.id) &&
      (t.username.toLowerCase().includes(query) || t.title.toLowerCase().includes(query))
    );

    state.visibleTracks = visible;

    if (dom.playlist) {
      dom.playlist.scrollTop = 0;
    }

    if (dom.statTotal) dom.statTotal.textContent = state.tracks.filter(t => !state.blacklisted.has(t.id)).length;
    if (dom.statOffline) dom.statOffline.textContent = state.offlineSet.size;
    if (dom.statBanned) dom.statBanned.textContent = state.bannedFromStorage + state.blacklisted.size;
    if (dom.statHealingPending) dom.statHealingPending.textContent = state.healingPending || 0;
    if (dom.statHealingHealed) dom.statHealingHealed.textContent = state.healingHealed || 0;
    if (dom.btnHealAll) dom.btnHealAll.classList.toggle('has-pending', state.healingPending > 0);
    if (dom.trackCount) dom.trackCount.textContent = visible.length + ' video';

    if (visible.length === 0) {
      if (dom.playlistScrollContent) {
        dom.playlistScrollContent.innerHTML = '';
        dom.playlistScrollContent.style.paddingTop = '0px';
        dom.playlistScrollContent.style.paddingBottom = '0px';
      }
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

    updateVirtualScroll(true);
  }

  function updateSelectedTrackInDOM() {
    const state = getState();
    const dom = getDom();
    if (!dom.playlist) return;
    const prevSelected = dom.playlist.querySelector('.track-card.selected');
    if (prevSelected) {
      prevSelected.classList.remove('selected');
      prevSelected.setAttribute('aria-pressed', 'false');
    }

    if (state.activeId) {
      const newSelected = dom.playlist.querySelector(`.track-card[data-id="${state.activeId}"]`);
      if (newSelected) {
        newSelected.classList.add('selected');
        newSelected.setAttribute('aria-pressed', 'true');
      }
    }
  }

  function scrollTrackIntoView(id) {
    const state = getState();
    const dom = getDom();
    const visible = state.visibleTracks || [];
    const idx = visible.findIndex(t => t.id === id);
    if (idx === -1) return;

    const playlist = dom.playlist;
    if (!playlist) return;

    const itemHeight = 70;
    const itemTop = idx * itemHeight;
    const itemBottom = itemTop + itemHeight;
    const scrollTop = playlist.scrollTop;
    const viewportHeight = playlist.clientHeight;

    if (itemTop < scrollTop) {
      playlist.scrollTop = itemTop;
    } else if (itemBottom > scrollTop + viewportHeight) {
      playlist.scrollTop = itemBottom - viewportHeight;
    }
  }

  function highlightTrack(id) {
    const state = getState();
    const dom = getDom();
    const track = state.tracks.find(t => t.id === id);
    if (!track) return;
    state.activeId = id;

    if (dom.nowCreator) dom.nowCreator.textContent = track.username;
    if (dom.nowTitle) dom.nowTitle.innerHTML = `${esc(track.title)} <span aria-hidden="true">✦</span>`;
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

    if (dom.nowBarTitle) dom.nowBarTitle.textContent = track.username;
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

    updateSelectedTrackInDOM();
    scrollTrackIntoView(id);
  }

  function updateSourceBadge(source, fromCache) {
    const dom = getDom();
    if (!dom.sourceBadge) return;
    dom.sourceBadge.className = 'source-badge';
    if (fromCache) {
      dom.sourceBadge.textContent = 'RAM CACHED';
      dom.sourceBadge.classList.add('badge-cached');
      dom.sourceBadge.title = 'Phát từ bộ nhớ đệm RAM (TTL 20 phút)';
    } else if (source === 'tiktok-direct') {
      dom.sourceBadge.textContent = 'DIRECT CDN';
      dom.sourceBadge.classList.add('badge-direct');
      dom.sourceBadge.title = 'Luồng giải mã trực tiếp từ CDN TikTok';
    } else {
      dom.sourceBadge.textContent = 'TIKWM PROXY';
      dom.sourceBadge.title = 'Luồng proxy chuẩn AAC 128kbps';
    }
  }

  function setMode(mode) {
    const state = getState();
    const dom = getDom();
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
    const state = getState();
    const dom = getDom();
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
    const state = getState();
    if (state.specRAF) cancelAnimationFrame(state.specRAF);
    if (state.specCanvas) state.specCanvas.hidden = true;
  }

  function drawSpectrum() {
    const state = getState();
    const canvas = state.specCanvas;
    if (!canvas || canvas.hidden || state.currentMode !== 'spectrum') return;

    if (document.hidden) {
      state.specRAF = requestAnimationFrame(drawSpectrum);
      return;
    }

    const targetW = (canvas.clientWidth || 300) * 2;
    const targetH = (canvas.clientHeight || 150) * 2;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const analyser = window.PlayerAudio ? PlayerAudio.getAnalyserNode() : null;
    let freqData = null;
    if (analyser && state.playing) {
      if (!cachedFreqData || cachedFreqData.length !== analyser.frequencyBinCount) {
        cachedFreqData = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(cachedFreqData);
      freqData = cachedFreqData;
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
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, bh, 8);
      ctx.fill();
    }

    state.specRAF = requestAnimationFrame(drawSpectrum);
  }

  function buildEqSliders() {
    const state = getState();
    const dom = getDom();
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
        <small>${['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'][i]}</small>`;
      const input = label.querySelector('input');
      if (input) {
        input.addEventListener('input', (e) => updateEqBand(i, e.target.value, e.target));
      }
      dom.eqSliders.appendChild(label);
    });
  }

  function updateEqBand(index, value, el) {
    const state = getState();
    const dom = getDom();
    const numVal = Number(value);
    state.eqValues[index] = numVal;
    const span = document.getElementById(`eq-val-${index}`);
    if (span) span.textContent = (numVal > 0 ? '+' : '') + numVal;
    if (el) el.setAttribute('aria-valuenow', numVal);
    if (dom.eqPreset) dom.eqPreset.value = 'Flat';
    if (window.PlayerAudio) PlayerAudio.setEqBand(index, numVal);
  }

  function applyPreset(name) {
    const state = getState();
    const presets = window.PlayerAudio ? PlayerAudio.EQ_PRESETS : {};
    const vals = presets[name];
    if (!vals) return;
    state.eqValues = [...vals];
    buildEqSliders();
    if (window.PlayerAudio) PlayerAudio.setEqPreset(name);
  }

  function setSoundMode(mode) {
    const dom = getDom();
    const isDirect = mode === 'direct';
    if (dom.btnModeHifi) {
      dom.btnModeHifi.classList.toggle('active', !isDirect);
      dom.btnModeHifi.setAttribute('aria-pressed', String(!isDirect));
    }
    if (dom.btnModeDirect) {
      dom.btnModeDirect.classList.toggle('active', isDirect);
      dom.btnModeDirect.setAttribute('aria-pressed', String(isDirect));
    }

    if (window.PlayerAudio) {
      PlayerAudio.setPureDirect(isDirect);
      if (!isDirect) {
        PlayerAudio.setNormalizer(true);
      }
    }

    const dspControls = [dom.bassControl, dom.eqSliders, dom.eqPreset ? dom.eqPreset.parentElement : null];
    dspControls.forEach(el => {
      if (el) el.classList.toggle('dsp-bypassed', isDirect);
    });

    showToast(isDirect ? 'Chế độ: Pure Direct (Mộc 1:1)' : 'Chế độ: Hi-Fi DSP (Đầy đặn & Cân bằng)');
  }

  function updateBooster(mult, clickedBtn) {
    const dom = getDom();
    const val = parseFloat(mult) || 1.0;
    if (window.PlayerAudio) PlayerAudio.setVolumeBooster(val);
    if (dom.boosterLabel) {
      dom.boosterLabel.textContent = val === 1.0 ? '1.0x (Chuẩn)' : `${val.toFixed(2)}x (+${((val - 1) * 6).toFixed(1)} dB)`;
    }
    document.querySelectorAll('.booster-btn').forEach(btn => {
      btn.classList.toggle('active', btn === clickedBtn || parseFloat(btn.dataset.boost) === val);
    });
    showToast(`Volume Booster: ${val.toFixed(2)}x`);
  }

  function updateBass(val) {
    const dom = getDom();
    const num = Number(val);
    if (dom.bassLabel) dom.bassLabel.textContent = (num > 0 ? '+' : '') + num + ' dB';
    if (dom.bassRange) dom.bassRange.setAttribute('aria-valuenow', num);
    if (window.PlayerAudio) PlayerAudio.setBassBoost(num);
  }

  function updateCrossfade(val) {
    const dom = getDom();
    const sec = parseFloat(val);
    if (dom.crossfadeLabel) dom.crossfadeLabel.textContent = sec.toFixed(1) + 's';
    if (dom.crossfadeRange) dom.crossfadeRange.setAttribute('aria-valuenow', sec);
    if (window.PlayerAudio) PlayerAudio.setCrossfadeDuration(sec);
    try {
      localStorage.setItem('tiktok_player_crossfade', String(sec));
    } catch (_) { }
  }

  function updateVolume(val) {
    const dom = getDom();
    const num = Number(val);
    if (dom.volumeRange) dom.volumeRange.setAttribute('aria-valuenow', num);
    if (window.PlayerAudio) PlayerAudio.setVolume(num);
    try {
      localStorage.setItem('tiktok_player_volume', String(num));
    } catch (_) { }
  }

  function switchTab(name) {
    ['playlist', 'offline'].forEach(n => {
      const btn = document.getElementById('tab-' + n);
      if (btn) {
        btn.classList.toggle('active', n === name);
        btn.setAttribute('aria-selected', n === name);
      }
    });
  }

  function showToast(msg) {
    const state = getState();
    const dom = getDom();
    if (!dom.toastEl || !dom.toastMsg) return;
    dom.toastMsg.textContent = msg;
    dom.toastEl.hidden = false;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(hideToast, 2800);
  }

  function hideToast() {
    const dom = getDom();
    if (dom.toastEl) dom.toastEl.hidden = true;
  }

  function openHealConfirmModal(pendingCount) {
    const dom = getDom();
    if (!dom.modalHealConfirm) return;
    if (dom.modalPendingCount) {
      dom.modalPendingCount.textContent = pendingCount;
    }
    dom.modalHealConfirm.hidden = false;
    dom.modalHealConfirm.classList.add('is-open');
  }

  function closeHealConfirmModal() {
    const dom = getDom();
    if (!dom.modalHealConfirm) return;
    dom.modalHealConfirm.classList.remove('is-open');
    dom.modalHealConfirm.hidden = true;
  }

  let networkAlertDismissTimer = null;

  function showNetworkAlert(type) {
    const dom = getDom();
    if (!dom.networkOverlay) return;

    if (networkAlertDismissTimer) {
      clearTimeout(networkAlertDismissTimer);
      networkAlertDismissTimer = null;
    }

    const isOffline = type === 'offline';
    dom.networkOverlay.classList.toggle('is-offline', isOffline);
    dom.networkOverlay.classList.toggle('is-online', !isOffline);

    if (dom.networkIcon) {
      dom.networkIcon.textContent = isOffline ? '📡' : '⚡';
    }
    if (dom.networkTitle) {
      dom.networkTitle.textContent = isOffline ? 'Mất kết nối Internet' : 'Đã khôi phục kết nối!';
    }
    if (dom.networkDesc) {
      dom.networkDesc.textContent = isOffline
        ? 'Trình phát đã tạm dừng để bảo vệ danh sách phát. Sẽ tự động tiếp tục phát ngay khi có mạng trở lại...'
        : 'Đã nhận tín hiệu mạng internet. Đang tiếp tục phát bài hát...';
    }
    if (dom.networkBadgeText) {
      dom.networkBadgeText.textContent = isOffline ? 'Đang chờ kết nối lại...' : 'Đã kết nối lại thành công';
    }

    dom.networkOverlay.hidden = false;
    requestAnimationFrame(() => {
      dom.networkOverlay.classList.add('is-open');
    });

    if (!isOffline) {
      networkAlertDismissTimer = setTimeout(() => {
        hideNetworkAlert();
      }, 2000);
    }
  }

  function hideNetworkAlert() {
    const dom = getDom();
    if (!dom.networkOverlay) return;
    dom.networkOverlay.classList.remove('is-open');
    setTimeout(() => {
      if (!dom.networkOverlay.classList.contains('is-open')) {
        dom.networkOverlay.hidden = true;
      }
    }, 320);
  }

  window.PlayerUI = {
    updateVirtualScroll,
    refreshUI,
    updateSelectedTrackInDOM,
    scrollTrackIntoView,
    highlightTrack,
    updateSourceBadge,
    setMode,
    startSpectrumCanvas,
    stopSpectrumCanvas,
    drawSpectrum,
    buildEqSliders,
    updateEqBand,
    applyPreset,
    setSoundMode,
    updateBooster,
    updateBass,
    updateCrossfade,
    updateVolume,
    switchTab,
    showToast,
    hideToast,
    openHealConfirmModal,
    closeHealConfirmModal,
    showNetworkAlert,
    hideNetworkAlert,
  };
})();
