'use strict';

(function () {
  let audioCtx = null;
  let isInitialized = false;

  let playerA = null;
  let playerB = null;
  let sourceA = null;
  let sourceB = null;
  let gainA = null;
  let gainB = null;
  let preMixGain = null;

  let activeChannel = 'A';
  let activeTrack = null;
  let preloadedTrack = null;
  let preloadedUrl = null;

  let crossfadeDuration = 2.5;
  let isLoopEnabled = false;

  let preloadTriggered = false;
  let isCrossfading = false;
  let crossfadeTimer = null;
  let crossfadeInitiated = false;
  let pendingPreload = null;

  let isUserPaused = false;
  let watchdogInterval = null;
  let lastCurrentTime = -1;
  let stuckSeconds = 0;

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
      playerA.crossOrigin = 'anonymous';
      playerB.crossOrigin = 'anonymous';
      playerA.preload = 'auto';
      playerB.preload = 'auto';
      playerA.referrerPolicy = 'no-referrer';
      playerB.referrerPolicy = 'no-referrer';
      playerA.muted = false;
      playerB.muted = false;
      playerA.volume = 1.0;
      playerB.volume = 1.0;
      playerA.loop = isLoopEnabled;
      playerB.loop = isLoopEnabled;

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

      if (window.PlayerAudioDSP && typeof window.PlayerAudioDSP.buildDspChain === 'function') {
        window.PlayerAudioDSP.buildDspChain(audioCtx, preMixGain);
      }

      _attachPlayerListeners(playerA, 'A');
      _attachPlayerListeners(playerB, 'B');

      isInitialized = true;
      _startWatchdog();
      emit('ready');
    } catch (err) {
      console.error('[AUDIO] Init failed:', err);
    }
  }

  function _startWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);
    lastCurrentTime = -1;
    stuckSeconds = 0;

    watchdogInterval = setInterval(() => {
      if (!isInitialized || isUserPaused) return;
      const player = activeChannel === 'A' ? playerA : playerB;
      if (!player || !player.src || !activeTrack) return;

      const dur = player.duration;
      const cur = player.currentTime || 0;

      if (!player.paused && cur > 0 && (lastCurrentTime < 0 || cur > lastCurrentTime + 0.02)) {
        stuckSeconds = 0;
        lastCurrentTime = cur;
        return;
      }

      if (!dur || isNaN(dur) || dur <= 0) {
        if (player.paused || cur === 0) {
          stuckSeconds++;
          if (stuckSeconds === 4) {
            try { player.play().catch(() => {}); } catch (_) {}
          } else if (stuckSeconds >= 12) {
            const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
            console.warn('[AUDIO] ⚠️ Track metadata load timeout > 12s → ' + (isOffline ? 'network offline' : 'skipping'));
            stuckSeconds = 0;
            emit('error', {
              channel: activeChannel,
              error: new Error(isOffline ? 'Network disconnected (load timeout)' : 'Track metadata load timeout (12s)'),
              track: activeTrack,
              isNetworkError: isOffline,
            });
            return;
          }
        } else {
          stuckSeconds = 0;
        }
        lastCurrentTime = cur;
        return;
      }

      if (dur > 0 && cur >= dur - 0.3 && !isCrossfading) {
        stuckSeconds++;
        if (stuckSeconds >= 3) {
          stuckSeconds = 0;
          if (isLoopEnabled) {
            console.warn('[AUDIO] End-of-track reached with loop enabled → replaying');
            replay();
            return;
          }
          console.warn('[AUDIO] End-of-track reached without transition → forcing transition');
          if (preloadedUrl) {
            performCrossfade();
          } else {
            emit('ended', { channel: activeChannel, track: activeTrack });
          }
          return;
        }
      }

      const isStuckAdvancing = lastCurrentTime >= 0 && Math.abs(cur - lastCurrentTime) < 0.01;
      const isUnintentionallyPaused = player.paused;

      if (isStuckAdvancing || isUnintentionallyPaused) {
        stuckSeconds++;
        console.warn(`[AUDIO] ⚠️ Playback stuck (${stuckSeconds}s) - currentTime: ${cur.toFixed(2)} / ${dur.toFixed(2)}, paused: ${player.paused}`);

        if (stuckSeconds === 4 || stuckSeconds === 8) {
          try { player.play().catch(() => {}); } catch (_) {}
        } else if (stuckSeconds >= 12) {
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          console.warn('[AUDIO] ⚠️ Playback stuck > 12s → ' + (isOffline ? 'network offline' : 'emitting error for auto-skip'));
          stuckSeconds = 0;
          emit('error', {
            channel: activeChannel,
            error: new Error(isOffline ? 'Network disconnected (playback stalled)' : 'Playback stalled timeout (12s)'),
            track: activeTrack,
            isNetworkError: isOffline,
          });
          return;
        }
      } else {
        stuckSeconds = 0;
      }
      lastCurrentTime = cur;
    }, 1000);
  }

  function _createEqualPowerCurves(numSteps = 64) {
    const fadeIn = new Float32Array(numSteps);
    const fadeOut = new Float32Array(numSteps);
    for (let i = 0; i < numSteps; i++) {
      const t = i / (numSteps - 1);
      fadeIn[i] = Math.sin(t * (Math.PI / 2));
      fadeOut[i] = Math.cos(t * (Math.PI / 2));
    }
    return { fadeIn, fadeOut };
  }

  function getEffectiveCrossfade(dur) {
    if (crossfadeDuration <= 0 || !dur || !isFinite(dur) || dur < 3.0) return 0;
    return Math.min(crossfadeDuration, Math.min(dur * 0.15, 5.0));
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

      if (!isLoopEnabled && !preloadTriggered && dur > 3.0 && isFinite(dur)) {
        const remaining = dur - cur;
        if (pct >= 50 && (pct >= 70 || remaining <= 10.0)) {
          preloadTriggered = true;
          emit('preloadNeeded', { currentTrack: activeTrack });
        }
      }

      if (!isLoopEnabled && !isCrossfading && !crossfadeInitiated && preloadedUrl && dur > 3.0 && isFinite(dur) && crossfadeDuration > 0) {
        const effectiveCrossfade = getEffectiveCrossfade(dur);
        const remaining = dur - cur;
        if (pct >= 65 && effectiveCrossfade > 0 && remaining <= effectiveCrossfade) {
          crossfadeInitiated = true;
          performCrossfade(effectiveCrossfade);
        }
      }
    });

    player.addEventListener('ended', () => {
      if (channelName === activeChannel && !isCrossfading) {
        if (isLoopEnabled) {
          replay();
          return;
        }
        if (preloadedUrl && !crossfadeInitiated && crossfadeDuration > 0) {
          crossfadeInitiated = true;
          performCrossfade(Math.min(crossfadeDuration, 1.2));
        } else if (!crossfadeInitiated) {
          emit('ended', { channel: channelName, track: activeTrack });
        }
      }
    });

    player.addEventListener('error', async () => {
      const err = player.error;
      const fullSrc = player.currentSrc || player.src || '';
      if (!fullSrc || (err && err.code === 1)) {
        return;
      }

      const errorCodeNames = {
        1: 'MEDIA_ERR_ABORTED',
        2: 'MEDIA_ERR_NETWORK',
        3: 'MEDIA_ERR_DECODE',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
      };

      const errorPayload = {
        code: err ? err.code : 'UNKNOWN',
        codeName: err ? (errorCodeNames[err.code] || 'UNKNOWN') : 'UNKNOWN',
        message: err ? err.message : '',
        channel: channelName,
        fullSrc: fullSrc,
        track: activeTrack ? activeTrack.username : null,
        httpStatus: null,
      };

      let isNetworkErr = false;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isNetworkErr = true;
      } else if (err && err.code === 2) {
        isNetworkErr = true;
      } else if (fullSrc.startsWith('http://') || fullSrc.startsWith('https://')) {
        try {
          const probe = await fetch(fullSrc, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
          if (probe) {
            errorPayload.httpStatus = probe.status;
            errorPayload.httpStatusText = probe.statusText;
            if (probe.status >= 500) {
              isNetworkErr = true;
            }
          } else {
            isNetworkErr = true;
          }
        } catch (_) {
          isNetworkErr = true;
        }
      } else {
        isNetworkErr = typeof navigator !== 'undefined' && !navigator.onLine;
      }

      console.error('[AUDIO] ❌ Media Playback Error:', errorPayload);

      if (channelName !== activeChannel) {
        preloadedUrl = null;
        preloadedTrack = null;
      } else {
        if (!player.paused && player.currentTime > 0.5) {
          console.warn('[AUDIO] Ignored transient error during active playback');
          return;
        }
        emit('error', {
          channel: channelName,
          error: player.error,
          track: activeTrack,
          fullSrc,
          errorPayload,
          isNetworkError: isNetworkErr,
        });
      }
    });

    player.addEventListener('play', () => {
      if (channelName === activeChannel) emit('play', { track: activeTrack });
    });

    player.addEventListener('pause', () => {
      if (channelName === activeChannel && !isCrossfading) emit('pause', { track: activeTrack });
    });
  }

  function stopAll() {
    if (crossfadeTimer) {
      clearTimeout(crossfadeTimer);
      crossfadeTimer = null;
    }
    isCrossfading = false;
    crossfadeInitiated = false;
    for (const [player, gain] of [[playerA, gainA], [playerB, gainB]]) {
      if (!player) continue;
      try {
        gain.gain.cancelScheduledValues(audioCtx.currentTime);
        gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
        player.pause();
        player.currentTime = 0;
      } catch (_) {}
    }
  }

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

    if (preloadedTrack && preloadedTrack.id === track.id && preloadedUrl) {
      crossfadeInitiated = true;
      const ok = await performCrossfade();
      if (ok) return true;
    }

    const isCurrentlyPlaying = isPlaying();
    const targetChannel = isCurrentlyPlaying ? (activeChannel === 'A' ? 'B' : 'A') : activeChannel;
    const targetPlayer = targetChannel === 'A' ? playerA : playerB;
    const targetGain = targetChannel === 'A' ? gainA : gainB;
    const fadeOutPlayer = targetChannel === 'A' ? playerB : playerA;
    const fadeOutGain = targetChannel === 'A' ? gainB : gainA;

    isUserPaused = false;
    lastCurrentTime = -1;
    stuckSeconds = 0;
    preloadTriggered = false;
    crossfadeInitiated = false;
    preloadedTrack = null;
    preloadedUrl = null;
    pendingPreload = null;

    targetPlayer.src = cdnUrl;
    targetPlayer.loop = isLoopEnabled;

    if (isCurrentlyPlaying && crossfadeDuration > 0) {
      const quickFadeDur = 0.35;
      targetGain.gain.cancelScheduledValues(audioCtx.currentTime);
      targetGain.gain.setValueAtTime(0.0, audioCtx.currentTime);

      try {
        await targetPlayer.play();
        const now = audioCtx.currentTime;
        const { fadeIn, fadeOut } = _createEqualPowerCurves(32);

        targetGain.gain.cancelScheduledValues(now);
        targetGain.gain.setValueCurveAtTime(fadeIn, now, quickFadeDur);

        fadeOutGain.gain.cancelScheduledValues(now);
        fadeOutGain.gain.setValueCurveAtTime(fadeOut, now, quickFadeDur);

        activeChannel = targetChannel;
        activeTrack = track;
        emit('trackChanged', { track, channel: activeChannel });

        setTimeout(() => {
          try {
            fadeOutPlayer.pause();
            fadeOutPlayer.currentTime = 0;
            fadeOutGain.gain.cancelScheduledValues(audioCtx.currentTime);
            fadeOutGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
          } catch (_) {}
          targetGain.gain.cancelScheduledValues(audioCtx.currentTime);
          targetGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        }, Math.round(quickFadeDur * 1000) + 40);

        return true;
      } catch (err) {
        const isNetErr = typeof navigator !== 'undefined' && !navigator.onLine;
        console.error('[AUDIO] play() call rejected:', err);
        emit('error', { channel: targetChannel, error: err, track, isNetworkError: isNetErr });
        return false;
      }
    } else {
      for (const [p, g] of [[playerA, gainA], [playerB, gainB]]) {
        if (!p) continue;
        try {
          g.gain.cancelScheduledValues(audioCtx.currentTime);
          g.gain.setValueAtTime(0.0, audioCtx.currentTime);
          p.pause();
          p.currentTime = 0;
        } catch (_) {}
      }

      targetGain.gain.cancelScheduledValues(audioCtx.currentTime);
      targetGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      activeChannel = targetChannel;
      activeTrack = track;

      try {
        console.log('[AUDIO] Attempting play on channel', activeChannel, 'URL:', cdnUrl.substring(0, 100));
        await targetPlayer.play();
        console.log('[AUDIO] Play successful on channel', activeChannel);
        emit('trackChanged', { track, channel: activeChannel });
        return true;
      } catch (err) {
        const isNetErr = typeof navigator !== 'undefined' && !navigator.onLine;
        console.error('[AUDIO] play() call rejected:', err);
        emit('error', { channel: activeChannel, error: err, track, isNetworkError: isNetErr });
        return false;
      }
    }
  }

  function _applyPreload(cdnUrl, track) {
    const idlePlayer = activeChannel === 'A' ? playerB : playerA;
    const idleGain = activeChannel === 'A' ? gainB : gainA;

    preloadedUrl = cdnUrl;
    preloadedTrack = track;

    idlePlayer.src = cdnUrl;
    idlePlayer.load();
    idleGain.gain.cancelScheduledValues(audioCtx.currentTime);
    idleGain.gain.setValueAtTime(0, audioCtx.currentTime);
  }

  function preloadTrack(cdnUrl, track) {
    if (isLoopEnabled) return;
    initAudioContext();
    if (!cdnUrl || !track) return;

    if (isCrossfading) {
      pendingPreload = { cdnUrl, track };
      return;
    }

    _applyPreload(cdnUrl, track);
  }

  async function performCrossfade(customDuration = null) {
    if (isCrossfading || !preloadedUrl) return false;
    isCrossfading = true;

    initAudioContext();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const fadeOutPlayer = activeChannel === 'A' ? playerA : playerB;
    const fadeOutGain = activeChannel === 'A' ? gainA : gainB;
    const fadeInPlayer = activeChannel === 'A' ? playerB : playerA;
    const fadeInGain = activeChannel === 'A' ? gainB : gainA;
    const newChannel = activeChannel === 'A' ? 'B' : 'A';
    const newTrack = preloadedTrack;

    const duration = customDuration != null ? Math.max(0.1, customDuration) : Math.max(0.1, crossfadeDuration);

    fadeInGain.gain.cancelScheduledValues(audioCtx.currentTime);
    fadeInGain.gain.setValueAtTime(0.0, audioCtx.currentTime);

    try {
      await fadeInPlayer.play();
    } catch (err) {
      console.warn('[AUDIO] fadeInPlayer play error:', err);
      isCrossfading = false;
      crossfadeInitiated = false;
      preloadedUrl = null;
      preloadedTrack = null;
      emit('error', { channel: newChannel, error: err, track: newTrack });
      return false;
    }

    const now = audioCtx.currentTime;
    const { fadeIn, fadeOut } = _createEqualPowerCurves(64);

    fadeInGain.gain.cancelScheduledValues(now);
    fadeInGain.gain.setValueCurveAtTime(fadeIn, now, duration);

    fadeOutGain.gain.cancelScheduledValues(now);
    fadeOutGain.gain.setValueCurveAtTime(fadeOut, now, duration);

    activeChannel = newChannel;
    activeTrack = newTrack;
    preloadTriggered = false;
    crossfadeInitiated = false;
    preloadedTrack = null;
    preloadedUrl = null;
    lastCurrentTime = -1;
    stuckSeconds = 0;

    emit('trackChanged', { track: newTrack, channel: newChannel });

    if (crossfadeTimer) clearTimeout(crossfadeTimer);
    crossfadeTimer = setTimeout(() => {
      try {
        fadeOutPlayer.pause();
        fadeOutPlayer.currentTime = 0;
        fadeOutGain.gain.cancelScheduledValues(audioCtx.currentTime);
        fadeOutGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
      } catch (_) {}
      fadeInGain.gain.cancelScheduledValues(audioCtx.currentTime);
      fadeInGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      isCrossfading = false;
      crossfadeTimer = null;

      if (pendingPreload) {
        const p = pendingPreload;
        pendingPreload = null;
        _applyPreload(p.cdnUrl, p.track);
      }
    }, Math.round(duration * 1000) + 60);

    return true;
  }

  function pause() {
    isUserPaused = true;
    const player = activeChannel === 'A' ? playerA : playerB;
    if (player) player.pause();
  }

  function replay() {
    if (!isInitialized || !activeTrack) return false;
    const player = activeChannel === 'A' ? playerA : playerB;
    const gain = activeChannel === 'A' ? gainA : gainB;
    if (!player || !player.src) return false;
    try {
      player.currentTime = 0;
      preloadTriggered = false;
      crossfadeInitiated = false;
      lastCurrentTime = -1;
      stuckSeconds = 0;
      gain.gain.cancelScheduledValues(audioCtx.currentTime);
      gain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      player.play().catch(() => {});
      emit('trackChanged', { track: activeTrack, channel: activeChannel });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function resume() {
    isUserPaused = false;
    lastCurrentTime = -1;
    stuckSeconds = 0;
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

  function setLoop(enabled) {
    isLoopEnabled = Boolean(enabled);
    if (playerA) playerA.loop = isLoopEnabled;
    if (playerB) playerB.loop = isLoopEnabled;
    if (isLoopEnabled) {
      preloadedUrl = null;
      preloadedTrack = null;
      pendingPreload = null;
      preloadTriggered = false;
      crossfadeInitiated = false;
    }
  }

  function isLoop() {
    return isLoopEnabled;
  }

  function setCrossfadeDuration(sec) {
    crossfadeDuration = Math.max(0, Math.min(5.0, Number(sec)));
  }

  function getAudioContext() {
    initAudioContext();
    return audioCtx;
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

  function getAudioMetrics() {
    initAudioContext();
    if (window.PlayerAudioDSP) {
      return window.PlayerAudioDSP.getAudioMetrics(
        activeChannel,
        activeTrack,
        isPlaying(),
        getCurrentTime(),
        getDuration()
      );
    }
    return {};
  }

  function logAudioDiagnostics() {
    if (window.PlayerAudioDSP) {
      return window.PlayerAudioDSP.logAudioDiagnostics(getAudioMetrics);
    }
  }

  window.getAudioDiagnostics = logAudioDiagnostics;

  window.PlayerAudio = {
    init: initAudioContext,
    playTrack,
    preloadTrack,
    performCrossfade,
    stopAll,
    replay,
    pause,
    resume,
    seek,
    seekPercent,
    setVolume: (pct) => window.PlayerAudioDSP && window.PlayerAudioDSP.setVolume(pct),
    setVolumeBooster: (m) => window.PlayerAudioDSP && window.PlayerAudioDSP.setVolumeBooster(m),
    getVolumeBooster: () => window.PlayerAudioDSP ? window.PlayerAudioDSP.getVolumeBooster() : 1.0,
    setPureDirect: (e) => window.PlayerAudioDSP && window.PlayerAudioDSP.setPureDirect(e),
    isPureDirect: () => window.PlayerAudioDSP ? window.PlayerAudioDSP.isPureDirect() : false,
    toggleMute: () => window.PlayerAudioDSP ? window.PlayerAudioDSP.toggleMute() : false,
    setBassBoost: (g) => window.PlayerAudioDSP && window.PlayerAudioDSP.setBassBoost(g),
    setNormalizer: (e) => window.PlayerAudioDSP && window.PlayerAudioDSP.setNormalizer(e),
    setLoop,
    isLoop,
    setCrossfadeDuration,
    setEqBand: (i, g) => window.PlayerAudioDSP && window.PlayerAudioDSP.setEqBand(i, g),
    setEqPreset: (n) => window.PlayerAudioDSP && window.PlayerAudioDSP.setEqPreset(n),
    getAudioMetrics,
    logAudioDiagnostics,
    getAudioContext,
    getAnalyserNode: () => window.PlayerAudioDSP ? window.PlayerAudioDSP.getAnalyserNode() : null,
    getCurrentTime,
    getDuration,
    isPlaying,
    getActiveChannel,
    getActiveTrack,
    on: (event, fn) => { if (listeners[event]) listeners[event].push(fn); },
    off: (event, fn) => {
      if (listeners[event]) listeners[event] = listeners[event].filter(cb => cb !== fn);
    },
    get EQ_PRESETS() {
      return window.PlayerAudioDSP ? window.PlayerAudioDSP.EQ_PRESETS : {};
    },
    get EQ_FREQUENCIES() {
      return window.PlayerAudioDSP ? window.PlayerAudioDSP.EQ_FREQUENCIES : [];
    },
  };
})();
