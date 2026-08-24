'use strict';

(function () {
  const state = window.PlayerState.state;
  const dom = window.PlayerState.dom;

  let skipCooldownTimer = null;
  let lastNavigationTime = 0;
  let searchDebounceTimer = null;
  const recentlyEnqueuedHealing = new Map();
  const HEALING_COOLDOWN_MS = 5 * 60 * 1000;

  function clearSkipCooldown() {
    if (skipCooldownTimer) {
      clearTimeout(skipCooldownTimer);
      skipCooldownTimer = null;
    }
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

  function enqueueForHealing(track, reason) {
    if (!track || !track.canonicalUrl) return;
    const now = Date.now();
    const lastEnqueued = recentlyEnqueuedHealing.get(track.canonicalUrl) || 0;
    if (now - lastEnqueued < HEALING_COOLDOWN_MS) {
      return;
    }
    recentlyEnqueuedHealing.set(track.canonicalUrl, now);

    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    chrome.runtime.sendMessage(
      { action: 'enqueueForHealing', canonicalUrl: track.canonicalUrl, reason },
      () => {
        if (chrome.runtime.lastError) return;
        PlayerState.refreshHealingStats();
      },
    );
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

    PlayerUI.highlightTrack(id);
    await startPlayback(track);
  }

  async function startPlayback(track) {
    clearSkipCooldown();
    state.playing = true;
    state.activeId = track.id;

    if (window.PlayerAudio) PlayerAudio.stopAll();
    await new Promise(r => setTimeout(r, 150));

    resumePlayState();

    const isCached = window.PlayerCDN ? PlayerCDN.hasCached(track.canonicalUrl) : false;
    if (!isCached) {
      PlayerUI.showToast(`⚡ Đang nạp âm thanh: ${track.username}...`);
    }

    console.log('[APP] Fetching stream for:', track.username, track.canonicalUrl);
    let cdnResult = { ok: false };
    if (window.PlayerCDN) {
      cdnResult = await PlayerCDN.refreshCdnUrl(track.canonicalUrl);
    }
    console.log('[APP] CDN Result for', track.username, 'source:', cdnResult.source || 'unknown', cdnResult);

    if (cdnResult && cdnResult.ok && cdnResult.cdnUrl) {
      if (cdnResult.cover && !track.thumb) {
        track.thumb = cdnResult.cover;
        PlayerUI.highlightTrack(track.id);
      }
      if (window.PlayerAudio) {
        const ok = await PlayerAudio.playTrack(cdnResult.cdnUrl, track);
        if (ok) {
          clearSkipCooldown();
          PlayerState.pushRecentlyPlayed(track.id);
          PlayerUI.updateSourceBadge(cdnResult.source, cdnResult.fromCache);
          console.info(`[STREAM-RESOLVER] 🚀 ${track.username} -> source: ${cdnResult.source || 'direct'} (${cdnResult.fromCache ? 'RAM cache' : 'fresh fetch'})`);
          PlayerUI.showToast(`🎧 Đang phát: ${track.username}`);
          triggerNextPreload(track);
        } else {
          if (window.PlayerCDN) {
            PlayerCDN.invalidateCdnCache(track.canonicalUrl);
          }
          enqueueForHealing(track, 'playback_failed');
          PlayerUI.showToast(`⚠️ Không thể phát video của ${track.username}, thử bài kế tiếp`);
          scheduleAutoSkip(track.id);
        }
      }
    } else {
      if (window.PlayerCDN) {
        PlayerCDN.invalidateCdnCache(track.canonicalUrl);
      }
      console.warn('[APP] CDN refresh unavailable for:', track.canonicalUrl, cdnResult ? cdnResult.error : '');
      enqueueForHealing(track, 'cdn_expired');
      PlayerUI.showToast(`⚠️ Không thể phát video của ${track.username}, thử bài kế tiếp`);
      scheduleAutoSkip(track.id);
    }

    updateMediaSession(track);
  }

  function triggerNextPreload(currentTrack) {
    if (state.looping) return;
    const nextTrackObj = getNextTrackToPlay();
    if (!nextTrackObj || !window.PlayerCDN) return;

    PlayerCDN.refreshCdnUrl(nextTrackObj.canonicalUrl).then(res => {
      if (res && res.ok) {
        if (res.cover && !nextTrackObj.thumb) {
          nextTrackObj.thumb = res.cover;
        }
        if (res.cdnUrl && window.PlayerAudio) {
          PlayerAudio.preloadTrack(res.cdnUrl, nextTrackObj);
        }
      }

      const visible = visibleTracks();
      const curIdx = visible.findIndex(t => t.id === currentTrack.id);
      const upcomingUrls = [];
      for (let i = 2; i <= 3; i++) {
        const u = visible[(curIdx + i) % visible.length];
        if (u && u.canonicalUrl !== nextTrackObj.canonicalUrl) {
          upcomingUrls.push(u.canonicalUrl);
        }
      }
      if (upcomingUrls.length > 0) {
        PlayerCDN.prefetchTracks(upcomingUrls);
      }
    });
  }

  function getNextTrackToPlay() {
    const visible = visibleTracks();
    if (!visible.length) return null;
    if (state.shuffled) {
      const pool = visible.filter(t => !PlayerState.recentlyPlayed.includes(t.id));
      const candidates = pool.length > 0 ? pool : visible;
      return candidates[Math.floor(Math.random() * candidates.length)];
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
      if (window.PlayerAudio && PlayerAudio.replay()) return;
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
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
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
    state.tracks = PlayerState.shuffleArray(state.tracks);
    PlayerUI.refreshUI();
    if (dom.btnShuffleLib) {
      dom.btnShuffleLib.classList.remove('is-shuffling');
      void dom.btnShuffleLib.offsetWidth;
      dom.btnShuffleLib.classList.add('is-shuffling');
    }
    PlayerUI.showToast('🔀 Đã xáo trộn danh sách video!');
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
    if (window.PlayerAudio) {
      PlayerAudio.setLoop(state.looping);
    }
    try {
      localStorage.setItem('tiktok_player_loop', state.looping ? '1' : '0');
    } catch (_) { }
    PlayerUI.showToast(state.looping ? '🔁 Lặp lại: Bật' : '🔁 Lặp lại: Tắt');
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

    PlayerUI.showToast('🚫 Video đã được thêm vào danh sách cấm');
    if (id === state.activeId) nextTrack();
    PlayerUI.refreshUI();
  }

  function saveOffline(id) {
    state.offlineSet.add(id);
    PlayerUI.showToast('💾 Đã đánh dấu lưu offline (DP-4)');

    const card = dom.playlist.querySelector(`.track-card[data-id="${id}"]`);
    if (card) {
      const btnSave = card.querySelector('.action-save');
      if (btnSave) {
        btnSave.setAttribute('disabled', 'true');
        btnSave.setAttribute('aria-disabled', 'true');
        btnSave.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Offline
        `;
      }
      if (!card.querySelector('.offline-dot')) {
        const dot = document.createElement('span');
        dot.className = 'offline-dot';
        dot.setAttribute('aria-label', 'Có sẵn offline');
        card.appendChild(dot);
      }
    }
  }

  function seekTo(val) {
    const pct = Number(val);
    state.progressPct = pct;
    if (dom.timelineFill) dom.timelineFill.style.width = pct + '%';
    if (dom.seekRange) dom.seekRange.value = pct;
    if (window.PlayerAudio) {
      PlayerAudio.seekPercent(pct);
    }
  }

  function handleBatchHealClick() {
    if (state.healingPending === 0) {
      PlayerUI.showToast('✨ Không có video nào cần hồi sinh!');
      return;
    }
    PlayerUI.openHealConfirmModal(state.healingPending);
  }

  function confirmBatchHealToTikTok() {
    PlayerUI.closeHealConfirmModal();
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ action: 'startBatchHealing' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[APP] startBatchHealing lastError:', chrome.runtime.lastError.message);
          PlayerUI.showToast(`⚠️ Không thể kết nối Service Worker: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (response && response.success) {
          PlayerUI.showToast('🚀 Đang chuyển sang TikTok để hồi sinh video...');
        } else {
          PlayerUI.showToast(`⚠️ ${response ? response.error || response.message : 'Không có video pending'}`);
        }
      });
    }
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
            PlayerUI.updateVolume(v);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (dom.volumeRange) {
            const v = Math.max(0, Number(dom.volumeRange.value) - 5);
            dom.volumeRange.value = v;
            PlayerUI.updateVolume(v);
          }
          break;
        case 'm': case 'M':
          if (window.PlayerAudio) {
            const isMuted = PlayerAudio.toggleMute();
            PlayerUI.showToast(isMuted ? '🔇 Đã tắt tiếng' : '🔊 Đã bật tiếng');
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

  function initUIEventListeners() {
    if (dom.tabPlaylist) dom.tabPlaylist.addEventListener('click', () => PlayerUI.switchTab('playlist'));
    if (dom.tabOffline) dom.tabOffline.addEventListener('click', () => PlayerUI.switchTab('offline'));
    if (dom.btnVinyl) dom.btnVinyl.addEventListener('click', () => PlayerUI.setMode('vinyl'));
    if (dom.btnSpectrum) dom.btnSpectrum.addEventListener('click', () => PlayerUI.setMode('spectrum'));
    if (dom.btnModeHifi) dom.btnModeHifi.addEventListener('click', () => PlayerUI.setSoundMode('hifi'));
    if (dom.btnModeDirect) dom.btnModeDirect.addEventListener('click', () => PlayerUI.setSoundMode('direct'));
    if (dom.bassRange) dom.bassRange.addEventListener('input', (e) => PlayerUI.updateBass(e.target.value));
    if (dom.crossfadeRange) dom.crossfadeRange.addEventListener('input', (e) => PlayerUI.updateCrossfade(e.target.value));
    if (dom.eqPreset) dom.eqPreset.addEventListener('change', (e) => PlayerUI.applyPreset(e.target.value));
    if (dom.seekRange) dom.seekRange.addEventListener('input', (e) => seekTo(e.target.value));
    if (dom.btnShuffle) dom.btnShuffle.addEventListener('click', toggleShuffle);
    if (dom.btnPrev) dom.btnPrev.addEventListener('click', previousTrack);
    if (dom.playBtn) dom.playBtn.addEventListener('click', togglePlay);
    if (dom.btnNext) dom.btnNext.addEventListener('click', nextTrack);
    if (dom.btnLoop) dom.btnLoop.addEventListener('click', toggleLoop);
    if (dom.btnBan) dom.btnBan.addEventListener('click', banCurrentTrack);
    if (dom.volumeRange) dom.volumeRange.addEventListener('input', (e) => PlayerUI.updateVolume(e.target.value));
    if (dom.toastClose) dom.toastClose.addEventListener('click', PlayerUI.hideToast);

    if (dom.btnHealAll) dom.btnHealAll.addEventListener('click', handleBatchHealClick);
    if (dom.btnConfirmHealTiktok) dom.btnConfirmHealTiktok.addEventListener('click', confirmBatchHealToTikTok);
    if (dom.btnCancelHeal) dom.btnCancelHeal.addEventListener('click', PlayerUI.closeHealConfirmModal);

    document.querySelectorAll('.booster-btn').forEach(btn => {
      btn.addEventListener('click', () => PlayerUI.updateBooster(btn.dataset.boost, btn));
    });

    const vinylThumb = document.getElementById('vinyl-thumb');
    if (vinylThumb) {
      vinylThumb.addEventListener('error', () => {
        vinylThumb.style.display = 'none';
        vinylThumb.hidden = true;
      });
    }

    if (dom.visualizerArea) {
      dom.visualizerArea.addEventListener('click', () => {
        if (state.currentMode === 'vinyl' && dom.vinylEl) {
          dom.vinylEl.hidden = !dom.vinylEl.hidden;
        }
      });
    }

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', () => {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(PlayerUI.refreshUI, 120);
      });
    }

    if (dom.playlist) {
      dom.playlist.addEventListener('scroll', () => PlayerUI.updateVirtualScroll());

      dom.playlist.addEventListener('click', (e) => {
        const btnSave = e.target.closest('.action-save');
        if (btnSave) {
          e.stopPropagation();
          const card = btnSave.closest('.track-card');
          if (card && card.dataset.id) saveOffline(card.dataset.id);
          return;
        }

        const btnBan = e.target.closest('.action-ban');
        if (btnBan) {
          e.stopPropagation();
          const card = btnBan.closest('.track-card');
          if (card && card.dataset.id) banTrack(card.dataset.id);
          return;
        }

        const card = e.target.closest('.track-card');
        if (card && card.dataset.id) {
          selectAndPlay(card.dataset.id);
        }
      });

      dom.playlist.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const card = e.target.closest('.track-card');
          if (card && card.dataset.id && !e.target.closest('.mini-action')) {
            e.preventDefault();
            selectAndPlay(card.dataset.id);
          }
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.currentMode === 'spectrum') {
        if (state.specRAF) cancelAnimationFrame(state.specRAF);
        PlayerUI.drawSpectrum();
      }
    });

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
      if (dom.seekRange) dom.seekRange.value = progressPct;
      if (dom.timeCurrent) dom.timeCurrent.textContent = PlayerState.formatTime(currentTime);
      if (dom.timeTotal && duration > 0) {
        dom.timeTotal.textContent = PlayerState.formatTime(duration);
      }
    });

    PlayerAudio.on('play', () => {
      clearSkipCooldown();
    });

    PlayerAudio.on('preloadNeeded', async () => {
      if (state.looping) return;
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
        PlayerUI.highlightTrack(track.id);
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
      PlayerUI.showToast(msg);
      scheduleAutoSkip(track ? track.id : null);
    });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.healingQueue) return;
        PlayerState.refreshHealingStats();
        const newQueue = changes.healingQueue.newValue || [];
        const healedEntries = newQueue.filter((e) => e.status === 'healed' && e.newCdnUrl);
        for (const entry of healedEntries) {
          const track = state.tracks.find((t) => t.canonicalUrl === entry.url);
          if (track && window.PlayerCDN) {
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
    setMode: (m) => PlayerUI.setMode(m),
    setSoundMode: (m) => PlayerUI.setSoundMode(m),
    updateBooster: (m, b) => PlayerUI.updateBooster(m, b),
    updateBass: (v) => PlayerUI.updateBass(v),
    updateCrossfade: (v) => PlayerUI.updateCrossfade(v),
    updateVolume: (v) => PlayerUI.updateVolume(v),
    switchTab: (t) => PlayerUI.switchTab(t),
    hideToast: () => PlayerUI.hideToast(),
    applyPreset: (p) => PlayerUI.applyPreset(p),
    updateEqBand: (i, v, e) => PlayerUI.updateEqBand(i, v, e),
    shuffleLibrary,
  });

  PlayerUI.buildEqSliders();
  PlayerState.initFileImport();
  initKeyboard();
  initUIEventListeners();
  initAudioEventListeners();
  PlayerUI.refreshUI();
  PlayerState.tryLoadFromStorage();
  PlayerState.loadStoredPreferences();
  PlayerState.refreshHealingStats();
})();
