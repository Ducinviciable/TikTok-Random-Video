// Web Audio DSP Engine: Dual-Buffer Crossfade (A/B), 10-Band EQ, Bass Boost, Auto Normalizer, Analyser
'use strict';

(function () {
  const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const EQ_PRESETS = {
    'Flat':         [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0],
    'Bass Boost':   [ 9,  7,  5,  3,  2,  1,  0,  0, -1, -2],
    'Vocal':        [-2, -1,  0,  2,  4,  5,  4,  3,  1,  0],
    'Electronic':   [ 4,  3,  2,  0, -1,  2,  4,  5,  3,  2],
    'Lofi':         [ 2,  2,  1,  0, -1, -1, -2, -2, -1,  0],
  };

  let audioCtx = null;
  let isInitialized = false;

  // Dual Player & Gain Nodes
  let playerA = null;
  let playerB = null;
  let sourceA = null;
  let sourceB = null;
  let gainA = null;
  let gainB = null;

  // DSP Pipeline Nodes
  let preMixGain = null;
  let eqFilters = [];
  let bassBoostNode = null;
  let compressorNode = null;
  let compressorGain = null;
  let bypassGain = null;
  let postDSPCrossover = null;
  let masterGainNode = null;
  let analyserNode = null;

  // Trạng thái phát
  let activeChannel = 'A';
  let activeTrack = null;
  let preloadedTrack = null;
  let preloadedUrl = null;

  // Cấu hình âm thanh
  let crossfadeDuration = 2.5;
  let bassBoostGain = 6;
  let normalizerEnabled = true;
  let masterVolume = 0.72;
  let volumeBooster = 1.0;
  let isMuted = false;

  let preloadTriggered = false;
  let isCrossfading = false;
  let crossfadeTimer = null;

  const listeners = {
    timeupdate: [],
    ended: [],
    trackChanged: [],
    preloadNeeded: [],
    play: [],
    pause: [],
    error: [],
    ready: [],
  };

  function emit(event, data) {
    if (listeners[event]) {
      listeners[event].forEach(fn => {
        try { fn(data); } catch (e) { console.error(`[AUDIO] Event error (${event}):`, e); }
      });
    }
  }

  // Khởi tạo AudioContext khi có tương tác người dùng
  function initAudioContext() {
    if (isInitialized && audioCtx) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();

      playerA = new Audio();
      playerB = new Audio();
      playerA.preload = 'auto';
      playerB.preload = 'auto';
      playerA.crossOrigin = 'anonymous';
      playerB.crossOrigin = 'anonymous';

      sourceA = audioCtx.createMediaElementSource(playerA);
      sourceB = audioCtx.createMediaElementSource(playerB);

      gainA = audioCtx.createGain();
      gainB = audioCtx.createGain();
      gainA.gain.value = 1.0;
      gainB.gain.value = 0.0;

      sourceA.connect(gainA);
      sourceB.connect(gainB);

      preMixGain = audioCtx.createGain();
      preMixGain.gain.value = 1.0;
      gainA.connect(preMixGain);
      gainB.connect(preMixGain);

      // Equalizer 10 dải tần
      eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = audioCtx.createBiquadFilter();
        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = EQ_PRESETS['Bass Boost'][idx] || 0;
        return filter;
      });

      let lastNode = preMixGain;
      eqFilters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });

      // Bass Boost Node (LowShelf 100Hz)
      bassBoostNode = audioCtx.createBiquadFilter();
      bassBoostNode.type = 'lowshelf';
      bassBoostNode.frequency.value = 100;
      bassBoostNode.gain.value = bassBoostGain;
      lastNode.connect(bassBoostNode);

      // Volume Normalizer (DynamicsCompressor) & Bypass
      compressorNode = audioCtx.createDynamicsCompressor();
      compressorNode.threshold.value = -24;
      compressorNode.knee.value = 30;
      compressorNode.ratio.value = 4;
      compressorNode.attack.value = 0.003;
      compressorNode.release.value = 0.25;

      compressorGain = audioCtx.createGain();
      bypassGain = audioCtx.createGain();
      postDSPCrossover = audioCtx.createGain();

      compressorGain.gain.value = normalizerEnabled ? 1.0 : 0.0;
      bypassGain.gain.value = normalizerEnabled ? 0.0 : 1.0;

      bassBoostNode.connect(compressorNode);
      compressorNode.connect(compressorGain);
      compressorGain.connect(postDSPCrossover);

      bassBoostNode.connect(bypassGain);
      bypassGain.connect(postDSPCrossover);

      // Master Gain Node
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = masterVolume * volumeBooster;
      postDSPCrossover.connect(masterGainNode);

      // AnalyserNode cho Spectrum Visualizer
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128;
      analyserNode.smoothingTimeConstant = 0.8;
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -10;

      masterGainNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      _attachPlayerListeners(playerA, 'A');
      _attachPlayerListeners(playerB, 'B');

      isInitialized = true;
      emit('ready');
    } catch (err) {
      console.error('[AUDIO] Init failed:', err);
    }
  }

  function _attachPlayerListeners(player, channelName) {
    player.addEventListener('timeupdate', () => {
      if (channelName !== activeChannel) return;
      const cur = player.currentTime || 0;
      const dur = player.duration || 0;
      const pct = dur > 0 ? (cur / dur) * 100 : 0;

      emit('timeupdate', {
        currentTime: cur,
        duration: dur,
        progressPct: pct,
        channel: channelName,
        track: activeTrack,
      });

      // Tự động preload bài kế tiếp ở 85% thời lượng
      if (dur > 6 && !preloadTriggered) {
        const remaining = dur - cur;
        if (pct >= 85 || remaining <= (crossfadeDuration + 2)) {
          preloadTriggered = true;
          emit('preloadNeeded', { currentTrack: activeTrack });
        }
      }

      // Kích hoạt crossfade khi gần hết bài
      if (!isCrossfading && preloadedUrl && dur > 6 && (dur - cur) <= crossfadeDuration && crossfadeDuration > 0) {
        performCrossfade();
      }
    });

    player.addEventListener('ended', () => {
      if (channelName === activeChannel && !isCrossfading) {
        if (preloadedUrl) {
          performCrossfade();
        } else {
          emit('ended', { channel: channelName, track: activeTrack });
        }
      }
    });

    player.addEventListener('error', () => {
      if (channelName === activeChannel) {
        emit('error', { channel: channelName, error: player.error, track: activeTrack });
      }
    });

    player.addEventListener('play', () => {
      if (channelName === activeChannel) emit('play', { track: activeTrack });
    });

    player.addEventListener('pause', () => {
      if (channelName === activeChannel && !isCrossfading) emit('pause', { track: activeTrack });
    });
  }

  // Phát bài ngay lập tức trên channel đang kích hoạt
  async function playTrack(cdnUrl, track) {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
      isCrossfading = false;
    }

    preloadTriggered = false;
    activeTrack = track;

    const targetPlayer = activeChannel === 'A' ? playerA : playerB;
    const targetGain = activeChannel === 'A' ? gainA : gainB;
    const idlePlayer = activeChannel === 'A' ? playerB : playerA;
    const idleGain = activeChannel === 'A' ? gainB : gainA;

    try {
      idlePlayer.pause();
      idlePlayer.currentTime = 0;
      idleGain.gain.setValueAtTime(0, audioCtx.currentTime);
    } catch (_) {}

    preloadedTrack = null;
    preloadedUrl = null;

    targetPlayer.src = cdnUrl;
    targetGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    try {
      await targetPlayer.play();
      return true;
    } catch (err) {
      emit('error', { channel: activeChannel, error: err, track });
      return false;
    }
  }

  // Nạp trước bài tiếp theo vào channel nhàn rỗi (idle)
  function preloadTrack(cdnUrl, track) {
    initAudioContext();
    if (!cdnUrl || !track) return;

    const idlePlayer = activeChannel === 'A' ? playerB : playerA;
    const idleGain = activeChannel === 'A' ? gainB : gainA;

    preloadedUrl = cdnUrl;
    preloadedTrack = track;

    idlePlayer.src = cdnUrl;
    idlePlayer.load();
    idleGain.gain.setValueAtTime(0, audioCtx.currentTime);
  }

  // Chuyển bài mượt mà qua Dual-Buffer Crossfade (A ↔ B)
  async function performCrossfade() {
    if (isCrossfading || !preloadedUrl) return;
    isCrossfading = true;

    initAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const fadeOutPlayer = activeChannel === 'A' ? playerA : playerB;
    const fadeOutGain   = activeChannel === 'A' ? gainA : gainB;
    const fadeInPlayer  = activeChannel === 'A' ? playerB : playerA;
    const fadeInGain    = activeChannel === 'A' ? gainB : gainA;
    const newChannel    = activeChannel === 'A' ? 'B' : 'A';
    const newTrack      = preloadedTrack;

    const now = audioCtx.currentTime;
    const duration = Math.max(0.1, crossfadeDuration);

    // Tăng âm lượng bài mới (0.001 -> 1.0)
    fadeInGain.gain.cancelScheduledValues(now);
    fadeInGain.gain.setValueAtTime(0.001, now);
    fadeInGain.gain.linearRampToValueAtTime(1.0, now + duration);

    try {
      await fadeInPlayer.play();
    } catch (err) {
      console.warn('[AUDIO] fadeInPlayer play error:', err);
    }

    // Giảm âm lượng bài cũ (1.0 -> 0.001)
    fadeOutGain.gain.cancelScheduledValues(now);
    fadeOutGain.gain.setValueAtTime(fadeOutGain.gain.value, now);
    fadeOutGain.gain.linearRampToValueAtTime(0.001, now + duration);

    activeChannel = newChannel;
    activeTrack = newTrack;
    preloadTriggered = false;
    preloadedTrack = null;
    preloadedUrl = null;

    emit('trackChanged', { track: newTrack, channel: newChannel });

    crossfadeTimer = setTimeout(() => {
      try {
        fadeOutPlayer.pause();
        fadeOutPlayer.currentTime = 0;
        fadeOutGain.gain.setValueAtTime(0, audioCtx.currentTime);
      } catch (_) {}
      isCrossfading = false;
      crossfadeTimer = null;
    }, duration * 1000 + 100);
  }

  function pause() {
    const player = activeChannel === 'A' ? playerA : playerB;
    if (player) player.pause();
  }

  async function resume() {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const player = activeChannel === 'A' ? playerA : playerB;
    if (player) {
      try {
        await player.play();
      } catch (err) {
        console.warn('[AUDIO] resume error:', err);
      }
    }
  }

  function seek(seconds) {
    const player = activeChannel === 'A' ? playerA : playerB;
    if (player && !isNaN(seconds)) {
      player.currentTime = Math.max(0, Math.min(player.duration || 0, seconds));
    }
  }

  function seekPercent(pct) {
    const player = activeChannel === 'A' ? playerA : playerB;
    if (player && player.duration) {
      player.currentTime = (pct / 100) * player.duration;
    }
  }

  function setVolume(pct) {
    masterVolume = Math.max(0, Math.min(100, Number(pct))) / 100;
    if (masterGainNode && audioCtx) {
      const finalGain = isMuted ? 0 : masterVolume * volumeBooster;
      masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGainNode.gain.setValueAtTime(finalGain, audioCtx.currentTime);
    }
  }

  function setVolumeBooster(multiplier) {
    volumeBooster = Math.max(1.0, Math.min(3.0, Number(multiplier)));
    setVolume(masterVolume * 100);
  }

  function toggleMute() {
    isMuted = !isMuted;
    setVolume(masterVolume * 100);
    return isMuted;
  }

  function setBassBoost(gainDb) {
    bassBoostGain = Number(gainDb);
    if (bassBoostNode && audioCtx) {
      bassBoostNode.gain.cancelScheduledValues(audioCtx.currentTime);
      bassBoostNode.gain.setValueAtTime(bassBoostGain, audioCtx.currentTime);
    }
  }

  function setNormalizer(enabled) {
    normalizerEnabled = Boolean(enabled);
    if (compressorGain && bypassGain && audioCtx) {
      compressorGain.gain.setValueAtTime(normalizerEnabled ? 1.0 : 0.0, audioCtx.currentTime);
      bypassGain.gain.setValueAtTime(normalizerEnabled ? 0.0 : 1.0, audioCtx.currentTime);
    }
  }

  function setCrossfadeDuration(sec) {
    crossfadeDuration = Math.max(0, Math.min(5.0, Number(sec)));
  }

  function setEqBand(bandIdx, gainDb) {
    if (eqFilters[bandIdx] && audioCtx) {
      eqFilters[bandIdx].gain.cancelScheduledValues(audioCtx.currentTime);
      eqFilters[bandIdx].gain.setValueAtTime(Number(gainDb), audioCtx.currentTime);
    }
  }

  function setEqPreset(presetName) {
    const values = EQ_PRESETS[presetName];
    if (!values) return;
    values.forEach((gain, idx) => setEqBand(idx, gain));
  }

  function getAudioContext() {
    initAudioContext();
    return audioCtx;
  }

  function getAnalyserNode() {
    initAudioContext();
    return analyserNode;
  }

  function getCurrentTime() {
    const player = activeChannel === 'A' ? playerA : playerB;
    return player ? player.currentTime || 0 : 0;
  }

  function getDuration() {
    const player = activeChannel === 'A' ? playerA : playerB;
    return player ? player.duration || 0 : 0;
  }

  function isPlaying() {
    const player = activeChannel === 'A' ? playerA : playerB;
    return player ? !player.paused && !player.ended : false;
  }

  function getActiveChannel() {
    return activeChannel;
  }

  function getActiveTrack() {
    return activeTrack;
  }

  window.PlayerAudio = {
    init: initAudioContext,
    playTrack,
    preloadTrack,
    performCrossfade,
    pause,
    resume,
    seek,
    seekPercent,
    setVolume,
    setVolumeBooster,
    toggleMute,
    setBassBoost,
    setNormalizer,
    setCrossfadeDuration,
    setEqBand,
    setEqPreset,
    getAudioContext,
    getAnalyserNode,
    getCurrentTime,
    getDuration,
    isPlaying,
    getActiveChannel,
    getActiveTrack,
    on: (event, fn) => { if (listeners[event]) listeners[event].push(fn); },
    off: (event, fn) => {
      if (listeners[event]) listeners[event] = listeners[event].filter(cb => cb !== fn);
    },
    EQ_PRESETS,
    EQ_FREQUENCIES,
  };
})();
