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

  let audioCtxRef = null;
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

  let bassBoostGain = 0;
  let normalizerEnabled = true;
  let pureDirectEnabled = false;
  let masterVolume = 1.0;
  let volumeBooster = 1.0;
  let isMuted = false;

  function buildDspChain(audioCtx, preMixGain) {
    audioCtxRef = audioCtx;

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

    return { masterGainNode, analyserNode };
  }

  function setVolume(pct) {
    masterVolume = Math.max(0, Math.min(100, Number(pct))) / 100;
    if (masterGainNode && audioCtxRef) {
      const finalGain = isMuted ? 0 : masterVolume * volumeBooster;
      masterGainNode.gain.cancelScheduledValues(audioCtxRef.currentTime);
      masterGainNode.gain.setValueAtTime(finalGain, audioCtxRef.currentTime);
    }
  }

  function setVolumeBooster(multiplier) {
    volumeBooster = Math.max(1.0, Math.min(3.0, Number(multiplier)));
    setVolume(masterVolume * 100);
  }

  function getVolumeBooster() {
    return volumeBooster;
  }

  function toggleMute() {
    isMuted = !isMuted;
    setVolume(masterVolume * 100);
    return isMuted;
  }

  function setBassBoost(gainDb) {
    bassBoostGain = Number(gainDb);
    if (bassBoostNode && audioCtxRef) {
      bassBoostNode.gain.cancelScheduledValues(audioCtxRef.currentTime);
      bassBoostNode.gain.setValueAtTime(bassBoostGain, audioCtxRef.currentTime);
    }
  }

  function setNormalizer(enabled) {
    normalizerEnabled = Boolean(enabled);
    if (compressorGain && bypassGain && audioCtxRef) {
      compressorGain.gain.setValueAtTime(normalizerEnabled ? 1.0 : 0.0, audioCtxRef.currentTime);
      bypassGain.gain.setValueAtTime(normalizerEnabled ? 0.0 : 1.0, audioCtxRef.currentTime);
    }
  }

  function setPureDirect(enabled) {
    pureDirectEnabled = Boolean(enabled);
    if (dspBranchGain && directBranchGain && audioCtxRef) {
      dspBranchGain.gain.cancelScheduledValues(audioCtxRef.currentTime);
      directBranchGain.gain.cancelScheduledValues(audioCtxRef.currentTime);
      dspBranchGain.gain.setValueAtTime(pureDirectEnabled ? 0.0 : 1.0, audioCtxRef.currentTime);
      directBranchGain.gain.setValueAtTime(pureDirectEnabled ? 1.0 : 0.0, audioCtxRef.currentTime);
    }
    return pureDirectEnabled;
  }

  function isPureDirect() {
    return pureDirectEnabled;
  }

  function setEqBand(bandIdx, gainDb) {
    if (eqFilters[bandIdx] && audioCtxRef) {
      eqFilters[bandIdx].gain.cancelScheduledValues(audioCtxRef.currentTime);
      eqFilters[bandIdx].gain.setValueAtTime(Number(gainDb), audioCtxRef.currentTime);
    }
  }

  function setEqPreset(presetName) {
    const values = EQ_PRESETS[presetName];
    if (!values) return;
    values.forEach((gain, idx) => setEqBand(idx, gain));
  }

  function getAnalyserNode() {
    return analyserNode;
  }

  function getAudioMetrics(activeChannel, activeTrack, isPlaying, currentTime, duration) {
    const metrics = {
      timestamp: new Date().toISOString(),
      activeChannel,
      track: activeTrack ? { username: activeTrack.username, id: activeTrack.id, canonicalUrl: activeTrack.canonicalUrl } : null,
      currentTime: (typeof currentTime === 'number' ? currentTime.toFixed(2) : currentTime) + 's',
      duration: (typeof duration === 'number' ? duration.toFixed(2) : duration) + 's',
      isPlaying: isPlaying,
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

    if (analyserNode && isPlaying) {
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

  function logAudioDiagnostics(getMetricsFn) {
    const m = typeof getMetricsFn === 'function' ? getMetricsFn() : null;
    if (!m) return;
    console.group('%c🎵 [TIKTOK HI-FI STUDIO] Audio Metrics & DSP Diagnostics', 'color: #8b9cf6; font-weight: bold; font-size: 13px;');
    console.log('%c📍 Video:', 'font-weight: bold;', m.track ? `${m.track.username} (${m.track.id})` : 'None');
    console.log('%c⏱️ Position:', 'font-weight: bold;', `${m.currentTime} / ${m.duration} (Playing: ${m.isPlaying})`);
    console.log('%c🎛️ DSP State:', 'font-weight: bold;', m.dspState);
    console.log('%c📊 Signal Level:', 'font-weight: bold;', `Peak: ${m.signalLevels.peakDbfs} dBFS | RMS: ${m.signalLevels.rmsDbfs} dBFS`);
    console.groupEnd();
  }

  window.PlayerAudioDSP = {
    EQ_FREQUENCIES,
    EQ_PRESETS,
    buildDspChain,
    setVolume,
    setVolumeBooster,
    getVolumeBooster,
    toggleMute,
    setBassBoost,
    setNormalizer,
    setPureDirect,
    isPureDirect,
    setEqBand,
    setEqPreset,
    getAnalyserNode,
    getAudioMetrics,
    logAudioDiagnostics,
  };
})();
