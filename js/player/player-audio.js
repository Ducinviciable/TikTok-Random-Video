'use strict';

(function () {
  const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const EQ_PRESETS = {
    'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Bass Boost': [3, 4, 5, 4, 2, 1, 0, 0, 0, 0],
    'Vocal': [-2, -1, 0, 2, 4, 5, 4, 3, 1, 0],
    'Electronic': [4, 3, 2, 0, -1, 2, 4, 5, 3, 2],
    'Lofi': [2, 2, 1, 0, -1, -1, -2, -2, -1, 0],
  };

  let audioCtx = null;
  let isInitialized = false;

  let playerA = null;
  let playerB = null;
  let sourceA = null;
  let sourceB = null;
  let gainA = null;
  let gainB = null;

  let preMixGain = null;
  let dspBranchGain = null;
  let directBranchGain = null;
  let eqFilters = [];
  let bassBoostNode = null;
  let compressorNode = null;
  let makeupGainNode = null;
  let compressorGain = null;
  let bypassGain = null;
  let postDSPCrossover = null;
  let masterGainNode = null;
  let analyserNode = null;

  let activeChannel = 'A';
  let activeTrack = null;
  let preloadedTrack = null;
  let preloadedUrl = null;

  let crossfadeDuration = 2.5;
  let bassBoostGain = 0;
  let normalizerEnabled = true;
  let pureDirectEnabled = false;
  let masterVolume = 1.0;
  let volumeBooster = 1.0;
  let isMuted = false;
  let isLoopEnabled = false;

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

      dspBranchGain = audioCtx.createGain();
      directBranchGain = audioCtx.createGain();
      dspBranchGain.gain.value = pureDirectEnabled ? 0.0 : 1.0;
      directBranchGain.gain.value = pureDirectEnabled ? 1.0 : 0.0;

      preMixGain.connect(dspBranchGain);
      preMixGain.connect(directBranchGain);

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
        filter.gain.value = EQ_PRESETS['Flat'][idx] || 0;
        return filter;
      });

      let lastNode = dspBranchGain;
      eqFilters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });

      bassBoostNode = audioCtx.createBiquadFilter();
      bassBoostNode.type = 'lowshelf';
      bassBoostNode.frequency.value = 100;
      bassBoostNode.gain.value = bassBoostGain;
      lastNode.connect(bassBoostNode);

      compressorNode = audioCtx.createDynamicsCompressor();
      compressorNode.threshold.value = -12;
      compressorNode.knee.value = 15;
      compressorNode.ratio.value = 2;
      compressorNode.attack.value = 0.010;
      compressorNode.release.value = 0.200;

      makeupGainNode = audioCtx.createGain();
      makeupGainNode.gain.value = 1.496; // +3.5 dB makeup gain

      compressorGain = audioCtx.createGain();
      bypassGain = audioCtx.createGain();
      postDSPCrossover = audioCtx.createGain();

      compressorGain.gain.value = normalizerEnabled ? 1.0 : 0.0;
      bypassGain.gain.value = normalizerEnabled ? 0.0 : 1.0;

      bassBoostNode.connect(compressorNode);
      compressorNode.connect(makeupGainNode);
      makeupGainNode.connect(compressorGain);
      compressorGain.connect(postDSPCrossover);

      bassBoostNode.connect(bypassGain);
      bypassGain.connect(postDSPCrossover);

      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.value = masterVolume * volumeBooster;

      postDSPCrossover.connect(masterGainNode);
      directBranchGain.connect(masterGainNode);

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
      _startWatchdog();
      emit('ready');
    } catch (err) {
      console.error('[AUDIO] Init failed:', err);
    }
  }

  let isUserPaused = false;
  let watchdogInterval = null;
  let lastCurrentTime = -1;
  let stuckSeconds = 0;

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
            console.warn('[AUDIO] ⚠️ Track metadata load timeout > 12s → skipping');
            stuckSeconds = 0;
            emit('error', {
              channel: activeChannel,
              error: new Error('Track metadata load timeout (12s)'),
              track: activeTrack,
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
          console.warn('[AUDIO] ⚠️ Playback stuck > 12s → emitting error for auto-skip');
          stuckSeconds = 0;
          emit('error', {
            channel: activeChannel,
            error: new Error('Playback stalled timeout (12s)'),
            track: activeTrack,
          });
          return;
        }
      } else {
        stuckSeconds = 0;
      }
      lastCurrentTime = cur;
    }, 1000);
  }

  let crossfadeInitiated = false;
  let pendingPreload = null;

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

      if (fullSrc.startsWith('http://') || fullSrc.startsWith('https://')) {
        try {
          const probe = await fetch(fullSrc, { method: 'HEAD' }).catch(() => null);
          if (probe) {
            errorPayload.httpStatus = probe.status;
            errorPayload.httpStatusText = probe.statusText;
          }
        } catch (_) {}
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
        emit('error', { channel: channelName, error: player.error, track: activeTrack, fullSrc, errorPayload });
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
        console.error('[AUDIO] play() call rejected:', err);
        emit('error', { channel: targetChannel, error: err, track });
        return false;
      }
    } else {
      // Stop both players to prevent overlap from any in-flight crossfade or preload.
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
        console.error('[AUDIO] play() call rejected:', err);
        emit('error', { channel: activeChannel, error: err, track });
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

  function setPureDirect(enabled) {
    pureDirectEnabled = Boolean(enabled);
    if (dspBranchGain && directBranchGain && audioCtx) {
      dspBranchGain.gain.cancelScheduledValues(audioCtx.currentTime);
      directBranchGain.gain.cancelScheduledValues(audioCtx.currentTime);
      dspBranchGain.gain.setValueAtTime(pureDirectEnabled ? 0.0 : 1.0, audioCtx.currentTime);
      directBranchGain.gain.setValueAtTime(pureDirectEnabled ? 1.0 : 0.0, audioCtx.currentTime);
    }
    return pureDirectEnabled;
  }

  function isPureDirect() {
    return pureDirectEnabled;
  }

  function getVolumeBooster() {
    return volumeBooster;
  }

  function getAudioMetrics() {
    initAudioContext();
    const metrics = {
      timestamp: new Date().toISOString(),
      activeChannel,
      track: activeTrack ? { username: activeTrack.username, id: activeTrack.id, canonicalUrl: activeTrack.canonicalUrl } : null,
      currentTime: getCurrentTime().toFixed(2) + 's',
      duration: getDuration().toFixed(2) + 's',
      isPlaying: isPlaying(),
      dspState: {
        pureDirect: pureDirectEnabled,
        normalizerEnabled,
        bassBoostGain: bassBoostGain + ' dB',
        masterVolume: Math.round(masterVolume * 100) + '%',
        volumeBooster: volumeBooster.toFixed(2) + 'x',
        compressorReductionDb: compressorNode ? Number(compressorNode.reduction).toFixed(2) + ' dB' : '0 dB',
      },
      signalLevels: {
        peakDbfs: -99,
        rmsDbfs: -99,
      },
    };

    if (analyserNode && isPlaying()) {
      const bufferLength = analyserNode.frequencyBinCount;
      const timeData = new Float32Array(bufferLength);
      analyserNode.getFloatTimeDomainData(timeData);

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = Math.abs(timeData[i]);
        if (val > peak) peak = val;
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -99;
      const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -99;

      metrics.signalLevels.peakDbfs = Number(peakDb.toFixed(1));
      metrics.signalLevels.rmsDbfs = Number(rmsDb.toFixed(1));
    }

    return metrics;
  }

  function logAudioDiagnostics() {
    const m = getAudioMetrics();
    console.group('%c🎵 [TIKTOK HI-FI STUDIO] Audio Metrics & DSP Diagnostics', 'color: #8b9cf6; font-weight: bold; font-size: 13px;');
    console.log('%c📍 Video:', 'font-weight: bold;', m.track ? `${m.track.username} (${m.track.id})` : 'None');
    console.log('%c⏱️ Position:', 'font-weight: bold;', `${m.currentTime} / ${m.duration} (Playing: ${m.isPlaying})`);
    console.table({
      'Master Volume': m.dspState.masterVolume,
      'Volume Booster': m.dspState.volumeBooster,
      'Pure Direct (Bypass)': m.dspState.pureDirect ? 'ON (1:1 Bit-perfect)' : 'OFF',
      'Volume Normalizer': m.dspState.normalizerEnabled ? 'ON' : 'OFF',
      'Compressor Reduction': m.dspState.compressorReductionDb,
      'Bass Boost': m.dspState.bassBoostGain,
      'RMS Level': m.signalLevels.rmsDbfs + ' dBFS',
      'Peak Level': m.signalLevels.peakDbfs + ' dBFS',
    });
    console.log('%c💡 Tip: Chạy getAudioDiagnostics() bất kỳ lúc nào để đo lường RMS và độ lợi dải âm.', 'color: #7fe0f5;');
    console.groupEnd();
    return m;
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
    setVolume,
    setVolumeBooster,
    getVolumeBooster,
    setPureDirect,
    isPureDirect,
    toggleMute,
    setBassBoost,
    setNormalizer,
    setLoop,
    isLoop,
    setCrossfadeDuration,
    setEqBand,
    setEqPreset,
    getAudioMetrics,
    logAudioDiagnostics,
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
