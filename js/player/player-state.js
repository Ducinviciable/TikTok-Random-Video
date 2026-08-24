'use strict';

(function () {
  const BG_CLASSES = ['bg-a', 'bg-b', 'bg-c', 'bg-d', 'bg-e'];
  const RECENT_BUFFER_SIZE = 5;
  const recentlyPlayed = [];

  const state = {
    tracks: [],
    visibleTracks: [],
    blacklisted: new Set(),
    bannedFromStorage: 0,
    offlineSet: new Set(),
    activeId: null,
    playing: false,
    shuffled: false,
    looping: false,
    currentMode: 'vinyl',
    eqValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    progressPct: 0,
    toastTimer: null,
    specRAF: null,
    specCanvas: null,
    healingPending: 0,
    healingHealed: 0,
  };

  const $ = id => document.getElementById(id);
  const dom = {
    playlist: $('playlist'),
    playlistScrollContent: $('playlist-scroll-content'),
    emptyState: $('empty-state'),
    trackCount: $('track-count'),
    statTotal: $('stat-total'),
    statOffline: $('stat-offline'),
    statBanned: $('stat-banned'),
    statHealingPending: $('stat-healing-pending'),
    statHealingHealed: $('stat-healing-healed'),
    btnHealAll: $('btn-heal-all'),
    modalHealConfirm: $('modal-heal-confirm'),
    btnConfirmHealTiktok: $('btn-confirm-heal-tiktok'),
    btnCancelHeal: $('btn-cancel-heal'),
    modalPendingCount: $('modal-pending-count'),
    nowCreator: $('now-creator'),
    nowTitle: $('now-title'),
    originalLink: $('original-link'),
    vinylEl: $('vinyl-el'),
    vinylName: $('vinyl-name'),
    playBtn: $('play-btn'),
    btnPrev: $('btn-prev'),
    btnNext: $('btn-next'),
    btnBan: $('btn-ban'),
    timelineFill: $('timeline-fill'),
    timeCurrent: $('time-current'),
    timeTotal: $('time-total'),
    nowThumb: $('now-thumb'),
    nowThumbImg: $('now-thumb-img'),
    nowBarTitle: $('now-bar-title'),
    nowBarCreator: $('now-bar-creator'),
    sourceBadge: $('source-badge'),
    seekRange: $('seek-range'),
    volumeRange: $('volume-range'),
    searchInput: $('search-input'),
    importZone: $('import-zone'),
    fileInput: $('file-input'),
    eqSliders: $('eq-sliders'),
    toastEl: $('toast'),
    toastMsg: $('toast-msg'),
    toastClose: $('toast-close'),
    eqPreset: $('eq-preset'),
    bassRange: $('bass-range'),
    bassLabel: $('bass-label'),
    bassControl: $('bass-control'),
    crossfadeRange: $('crossfade-range'),
    crossfadeLabel: $('crossfade-label'),
    btnShuffle: $('btn-shuffle'),
    btnLoop: $('btn-loop'),
    btnVinyl: $('btn-vinyl'),
    btnSpectrum: $('btn-spectrum'),
    visualizerArea: $('visualizer-area'),
    soundModeRow: $('sound-mode-row'),
    soundModeTitle: $('sound-mode-title'),
    btnModeHifi: $('btn-mode-hifi'),
    btnModeDirect: $('btn-mode-direct'),
    boosterLabel: $('booster-label'),
    tabPlaylist: $('tab-playlist'),
    tabOffline: $('tab-offline'),
    btnShuffleLib: $('btn-shuffle-library'),
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

  function pushRecentlyPlayed(id) {
    const idx = recentlyPlayed.indexOf(id);
    if (idx !== -1) recentlyPlayed.splice(idx, 1);
    recentlyPlayed.push(id);
    if (recentlyPlayed.length > RECENT_BUFFER_SIZE) recentlyPlayed.shift();
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

      if (window.PlayerUI) {
        PlayerUI.refreshUI();
      }

      const label = source === 'storage' ? 'extension storage' : 'file JSON';
      if (window.PlayerUI) {
        PlayerUI.showToast(`✅ Đã tải ${state.tracks.length} video từ ${label}!`);
      }

      if (state.tracks.length > 0) {
        if (window.PlayerUI) {
          PlayerUI.highlightTrack(state.tracks[0].id);
        }
        if (window.PlayerCDN) {
          const initialUrls = state.tracks.slice(0, 4).map(t => t.canonicalUrl);
          PlayerCDN.prefetchTracks(initialUrls);
        }
      }
    } catch (err) {
      if (window.PlayerUI) {
        PlayerUI.showToast('❌ ' + err.message);
      }
      console.error('[PLAYER] loadTracks error:', err);
    }
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

  function loadStoredPreferences() {
    try {
      const savedVol = localStorage.getItem('tiktok_player_volume');
      if (savedVol !== null && !isNaN(savedVol)) {
        const volNum = Math.max(0, Math.min(100, Number(savedVol)));
        if (dom.volumeRange) {
          dom.volumeRange.value = volNum;
          dom.volumeRange.setAttribute('aria-valuenow', volNum);
        }
        if (window.PlayerAudio) PlayerAudio.setVolume(volNum);
      }
      const savedCrossfade = localStorage.getItem('tiktok_player_crossfade');
      if (savedCrossfade !== null && !isNaN(savedCrossfade)) {
        const crossfadeNum = Math.max(0, Math.min(5.0, Number(savedCrossfade)));
        if (dom.crossfadeRange) {
          dom.crossfadeRange.value = crossfadeNum;
          dom.crossfadeRange.setAttribute('aria-valuenow', crossfadeNum);
        }
        if (dom.crossfadeLabel) dom.crossfadeLabel.textContent = crossfadeNum.toFixed(1) + 's';
        if (window.PlayerAudio) PlayerAudio.setCrossfadeDuration(crossfadeNum);
      }
      const savedLoop = localStorage.getItem('tiktok_player_loop');
      if (savedLoop !== null) {
        state.looping = savedLoop === '1';
        if (dom.btnLoop) {
          dom.btnLoop.classList.toggle('is-active', state.looping);
          dom.btnLoop.setAttribute('aria-pressed', state.looping);
        }
        if (window.PlayerAudio) {
          PlayerAudio.setLoop(state.looping);
        }
      }
    } catch (_) { }
  }

  function refreshHealingStats() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(['healingQueue'], (data) => {
      const queue = data.healingQueue || [];
      state.healingPending = queue.filter((e) => e.status === 'pending').length;
      state.healingHealed = queue.filter((e) => e.status === 'healed').length;
      if (dom.statHealingPending) dom.statHealingPending.textContent = state.healingPending;
      if (dom.statHealingHealed) dom.statHealingHealed.textContent = state.healingHealed;
      if (dom.btnHealAll) {
        dom.btnHealAll.classList.toggle('has-pending', state.healingPending > 0);
      }
    });
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
        if (window.PlayerUI) {
          PlayerUI.showToast('❌ File JSON không hợp lệ hoặc bị lỗi định dạng');
        }
      }
    };
    reader.readAsText(file);
  }

  function formatTime(s) {
    if (isNaN(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.PlayerState = {
    BG_CLASSES,
    RECENT_BUFFER_SIZE,
    recentlyPlayed,
    state,
    dom,
    parseExtensionBackup,
    shuffleArray,
    pushRecentlyPlayed,
    loadTracks,
    tryLoadFromStorage,
    loadStoredPreferences,
    refreshHealingStats,
    initFileImport,
    readJsonFile,
    formatTime,
    escHtml,
  };
})();
