// All sounds are synthesized with the Web Audio API, so the game ships without any audio files.

const MUTE_STORAGE_KEY = 'qiaolezi-runner-muted';
const MASTER_VOLUME = 0.85;
const MUSIC_VOLUME = 0.3;
const MINIMUM_GAIN = 0.0001;
const NOISE_BUFFER_SECONDS = 1;
const MUTE_FADE_TIME_CONSTANT = 0.03;

const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.12;
const STEPS_PER_BAR = 16;
const BASE_TEMPO_BPM = 148;
const SPEED_TEMPO_BONUS_BPM = 20;
const SUPER_DASH_TEMPO_BONUS_BPM = 10;
const CLOSED_HAT_SPEED_THRESHOLD = 0.35;
const OPEN_MUSIC_FILTER_HZ = 16000;
const CRASH_MUSIC_FILTER_HZ = 180;

const WIND_BASE_VOLUME = 0.025;
const WIND_SPEED_VOLUME = 0.05;
const WIND_DASH_VOLUME = 0.09;
const WIND_SUPER_DASH_VOLUME = 0.14;
const WIND_VOLUME_CHANGE_THRESHOLD = 0.004;
const WIND_TIME_CONSTANT = 0.12;

// Combo pickups climb the C major pentatonic, so long streaks audibly build up instead of repeating one ding.
const EAT_BASE_FREQUENCY_HZ = 523.25;
const EAT_PENTATONIC_SEMITONES = [0, 2, 4, 7, 9];
const EAT_MAX_COMBO_STEP = 12;
const EAT_CASCADE_SPACING_SECONDS = 0.05;

const C5_FREQUENCY_HZ = 523.25;
const C4_FREQUENCY_HZ = 261.63;

// I-vi-IV-V in C, one chord per bar.
const CHORD_PROGRESSION = [
  { bassFrequency: 65.41, arpeggioFrequencies: [261.63, 329.63, 392.0, 523.25] },
  { bassFrequency: 55.0, arpeggioFrequencies: [220.0, 261.63, 329.63, 440.0] },
  { bassFrequency: 87.31, arpeggioFrequencies: [174.61, 220.0, 261.63, 349.23] },
  { bassFrequency: 98.0, arpeggioFrequencies: [196.0, 246.94, 293.66, 392.0] },
];
const ARPEGGIO_STEPS = new Set([0, 3, 6, 8, 10, 11, 14]);
const LOOP_STEP_COUNT = STEPS_PER_BAR * CHORD_PROGRESSION.length;

export const RUN_AUDIO_MODE = Object.freeze({
  idle: 'idle',
  running: 'running',
  dash: 'dash',
  superDash: 'superDash',
});

function loadMutedPreference() {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMutedPreference(isMuted) {
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, isMuted ? '1' : '0');
  } catch {
    // The mute choice then only lasts for this session.
  }
}

function semitonesToRatio(semitones) {
  return 2 ** (semitones / 12);
}

export function createAudioEngine() {
  let audioContext = null;
  let masterGain = null;
  let effectsBus = null;
  let musicGain = null;
  let musicFilter = null;
  let noiseBuffer = null;
  let windFilter = null;
  let windGain = null;

  let isMuted = loadMutedPreference();
  let isMusicPlaying = false;
  let schedulerIntervalId = 0;
  let nextStepTime = 0;
  let currentStepIndex = 0;
  let runMode = RUN_AUDIO_MODE.idle;
  let speedRatio = 0;
  let appliedWindVolume = 0;
  let isPausedByGame = false;

  function createNoiseBuffer() {
    const sampleCount = Math.floor(audioContext.sampleRate * NOISE_BUFFER_SECONDS);
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples[sampleIndex] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function createWindLoop() {
    const windSource = audioContext.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    windFilter = audioContext.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.8;
    windGain = audioContext.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter).connect(windGain).connect(masterGain);
    windSource.start();
  }

  function createAudioGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }
    audioContext = new AudioContextClass();

    // The compressor glues stacked hits together and stops combo cascades from clipping.
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(audioContext.destination);

    masterGain = audioContext.createGain();
    masterGain.gain.value = isMuted ? 0 : MASTER_VOLUME;
    masterGain.connect(compressor);

    effectsBus = audioContext.createGain();
    effectsBus.connect(masterGain);

    musicFilter = audioContext.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = OPEN_MUSIC_FILTER_HZ;
    musicGain = audioContext.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(musicFilter).connect(masterGain);

    noiseBuffer = createNoiseBuffer();
    createWindLoop();
    return true;
  }

  // Browsers only allow audio after a user gesture, so every input handler calls this first.
  function unlock() {
    if (!audioContext && !createAudioGraph()) {
      return;
    }
    if (audioContext.state === 'suspended' && !isPausedByGame) {
      audioContext.resume();
    }
  }

  // A freshly created context may still be resuming during the first gesture; scheduling on it is safe,
  // the sounds simply start once it is running.
  function isReady() {
    return audioContext !== null && audioContext.state !== 'closed';
  }

  function playTone({
    frequency,
    endFrequency = frequency,
    waveType = 'sine',
    startTime = audioContext.currentTime,
    duration,
    volume,
    attackSeconds = 0.005,
    destination = effectsBus,
  }) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
    }
    envelope.gain.setValueAtTime(MINIMUM_GAIN, startTime);
    envelope.gain.exponentialRampToValueAtTime(volume, startTime + attackSeconds);
    envelope.gain.exponentialRampToValueAtTime(MINIMUM_GAIN, startTime + duration);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  function playNoise({
    filterType = 'bandpass',
    filterFrequency,
    endFilterFrequency = filterFrequency,
    filterQuality = 1,
    startTime = audioContext.currentTime,
    duration,
    volume,
    attackSeconds = 0.003,
    destination = effectsBus,
  }) {
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = filterQuality;
    filter.frequency.setValueAtTime(filterFrequency, startTime);
    if (endFilterFrequency !== filterFrequency) {
      filter.frequency.exponentialRampToValueAtTime(endFilterFrequency, startTime + duration);
    }
    const envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(MINIMUM_GAIN, startTime);
    envelope.gain.exponentialRampToValueAtTime(volume, startTime + attackSeconds);
    envelope.gain.exponentialRampToValueAtTime(MINIMUM_GAIN, startTime + duration);
    // Looping plus a random offset keeps repeated noise hits from sounding identical at any duration.
    noiseSource.loop = true;
    const bufferOffsetSeconds = Math.random() * NOISE_BUFFER_SECONDS;
    noiseSource.connect(filter).connect(envelope).connect(destination);
    noiseSource.start(startTime, bufferOffsetSeconds);
    noiseSource.stop(startTime + duration + 0.02);
  }

  function playJump() {
    if (!isReady()) return;
    playTone({ frequency: 260, endFrequency: 720, waveType: 'square', duration: 0.16, volume: 0.12 });
    playTone({ frequency: 520, endFrequency: 1200, waveType: 'triangle', duration: 0.14, volume: 0.1 });
    playNoise({ filterFrequency: 900, endFilterFrequency: 3200, duration: 0.14, volume: 0.08 });
  }

  function playLand() {
    if (!isReady()) return;
    playTone({ frequency: 150, endFrequency: 55, duration: 0.12, volume: 0.35 });
    playNoise({ filterType: 'lowpass', filterFrequency: 700, duration: 0.08, volume: 0.12 });
  }

  function playSlide() {
    if (!isReady()) return;
    playNoise({ filterFrequency: 3000, endFilterFrequency: 400, filterQuality: 2, duration: 0.32, volume: 0.2, attackSeconds: 0.02 });
    playTone({ frequency: 400, endFrequency: 140, waveType: 'sawtooth', duration: 0.2, volume: 0.05 });
  }

  function playLaneSwitch(direction) {
    if (!isReady()) return;
    const startFrequency = direction < 0 ? 2400 : 1200;
    const endFrequency = direction < 0 ? 1200 : 2400;
    playNoise({ filterFrequency: startFrequency, endFilterFrequency: endFrequency, filterQuality: 3, duration: 0.1, volume: 0.13 });
  }

  function playEat(comboCount, isMultiplierUp) {
    if (!isReady()) return;
    const startTime = audioContext.currentTime;
    const comboStep = Math.min(EAT_MAX_COMBO_STEP, Math.max(0, comboCount - 1));
    const octave = Math.floor(comboStep / EAT_PENTATONIC_SEMITONES.length);
    const scaleDegree = comboStep % EAT_PENTATONIC_SEMITONES.length;
    const noteFrequency = EAT_BASE_FREQUENCY_HZ * semitonesToRatio(EAT_PENTATONIC_SEMITONES[scaleDegree] + octave * 12);

    // Crunch of biting the chocolate shell, then a bright ding at the combo pitch.
    playNoise({ filterType: 'highpass', filterFrequency: 2500, duration: 0.05, volume: 0.22, startTime });
    playTone({ frequency: noteFrequency, waveType: 'square', duration: 0.12, volume: 0.09, startTime });
    playTone({ frequency: noteFrequency * 2, duration: 0.25, volume: 0.14, startTime });
    playTone({ frequency: noteFrequency * 3, duration: 0.18, volume: 0.05, startTime: startTime + 0.03 });

    if (isMultiplierUp) {
      [1, 1.25, 1.5, 2].forEach((ratio, noteIndex) => {
        playTone({
          frequency: noteFrequency * ratio,
          waveType: 'triangle',
          duration: 0.18,
          volume: 0.12,
          startTime: startTime + 0.08 + noteIndex * EAT_CASCADE_SPACING_SECONDS,
        });
      });
    }
  }

  function playSmash(isBus) {
    if (!isReady()) return;
    const impactVolume = isBus ? 0.9 : 0.6;
    playTone({ frequency: isBus ? 120 : 180, endFrequency: 35, duration: isBus ? 0.45 : 0.25, volume: impactVolume });
    playNoise({ filterType: 'lowpass', filterFrequency: 5000, endFilterFrequency: 300, duration: isBus ? 0.6 : 0.3, volume: 0.45 });
    // Metallic clang: a few inharmonic square partials that ring out briefly.
    const clangBaseFrequency = isBus ? 210 : 340;
    [1, 1.47, 2.13].forEach((ratio) => {
      playTone({ frequency: clangBaseFrequency * ratio, waveType: 'square', duration: isBus ? 0.4 : 0.22, volume: 0.05 });
    });
    if (isBus) {
      playNoise({ filterType: 'highpass', filterFrequency: 4000, duration: 0.5, volume: 0.15, startTime: audioContext.currentTime + 0.05 });
    }
  }

  function playSideBump() {
    if (!isReady()) return;
    playTone({ frequency: 220, endFrequency: 110, waveType: 'square', duration: 0.12, volume: 0.12 });
    playNoise({ filterFrequency: 1200, duration: 0.08, volume: 0.15 });
  }

  function playCrash() {
    if (!isReady()) return;
    const now = audioContext.currentTime;
    playTone({ frequency: 140, endFrequency: 30, duration: 0.6, volume: 1 });
    playNoise({ filterType: 'lowpass', filterFrequency: 3000, endFilterFrequency: 150, duration: 0.7, volume: 0.6 });
    playTone({ frequency: 660, endFrequency: 110, waveType: 'sawtooth', duration: 0.7, volume: 0.08, startTime: now + 0.05 });
    // The music "records scratch" down to a muffled rumble.
    musicFilter.frequency.cancelScheduledValues(now);
    musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, now);
    musicFilter.frequency.exponentialRampToValueAtTime(CRASH_MUSIC_FILTER_HZ, now + 0.6);
  }

  function playSuperDash() {
    if (!isReady()) return;
    const now = audioContext.currentTime;
    playNoise({ filterFrequency: 300, endFilterFrequency: 6000, filterQuality: 1.5, duration: 0.6, volume: 0.35, attackSeconds: 0.05 });
    playTone({ frequency: 110, endFrequency: 880, waveType: 'sawtooth', duration: 0.55, volume: 0.12 });
    playTone({ frequency: 60, endFrequency: 40, duration: 0.5, volume: 0.8, startTime: now + 0.45 });
    [C4_FREQUENCY_HZ, C4_FREQUENCY_HZ * 1.26, C4_FREQUENCY_HZ * 1.5, C5_FREQUENCY_HZ].forEach((chordFrequency) => {
      playTone({ frequency: chordFrequency, waveType: 'sawtooth', duration: 0.6, volume: 0.05, startTime: now + 0.45, attackSeconds: 0.01 });
    });
  }

  function playEnergyFull() {
    if (!isReady()) return;
    const now = audioContext.currentTime;
    [0, 4, 7, 12, 16].forEach((semitones, noteIndex) => {
      playTone({
        frequency: C5_FREQUENCY_HZ * semitonesToRatio(semitones),
        waveType: 'triangle',
        duration: 0.2,
        volume: 0.13,
        startTime: now + noteIndex * 0.06,
      });
    });
  }

  function playStart() {
    if (!isReady()) return;
    const now = audioContext.currentTime;
    playTone({ frequency: C4_FREQUENCY_HZ, waveType: 'square', duration: 0.1, volume: 0.1, startTime: now });
    playTone({ frequency: C4_FREQUENCY_HZ * 1.5, waveType: 'square', duration: 0.1, volume: 0.1, startTime: now + 0.09 });
    playTone({ frequency: C5_FREQUENCY_HZ, waveType: 'square', duration: 0.3, volume: 0.12, startTime: now + 0.18 });
    playNoise({ filterFrequency: 400, endFilterFrequency: 4000, duration: 0.35, volume: 0.15, startTime: now + 0.1 });
  }

  function playGameOver(isNewBestScore) {
    if (!isReady()) return;
    const now = audioContext.currentTime;
    const melodySemitones = isNewBestScore ? [0, 4, 7, 12, 16, 19, 24] : [7, 4, 0, -5];
    const noteSpacingSeconds = isNewBestScore ? 0.08 : 0.16;
    melodySemitones.forEach((semitones, noteIndex) => {
      playTone({
        frequency: C5_FREQUENCY_HZ * semitonesToRatio(semitones),
        waveType: isNewBestScore ? 'triangle' : 'square',
        duration: isNewBestScore ? 0.25 : 0.22,
        volume: isNewBestScore ? 0.13 : 0.07,
        startTime: now + noteIndex * noteSpacingSeconds,
      });
    });
  }

  function playButton() {
    if (!isReady()) return;
    playTone({ frequency: 880, endFrequency: 1320, waveType: 'triangle', duration: 0.08, volume: 0.1 });
  }

  function computeTempoBpm() {
    const superDashBonus = runMode === RUN_AUDIO_MODE.superDash ? SUPER_DASH_TEMPO_BONUS_BPM : 0;
    return BASE_TEMPO_BPM + SPEED_TEMPO_BONUS_BPM * speedRatio + superDashBonus;
  }

  function scheduleDrums(stepInBar, stepTime) {
    if (stepInBar % 4 === 0) {
      playTone({ frequency: 150, endFrequency: 45, duration: 0.18, volume: 0.9, startTime: stepTime, destination: musicGain });
    }
    if (stepInBar === 4 || stepInBar === 12) {
      playNoise({ filterFrequency: 1800, filterQuality: 0.7, duration: 0.14, volume: 0.45, startTime: stepTime, destination: musicGain });
      playTone({ frequency: 220, endFrequency: 160, waveType: 'triangle', duration: 0.08, volume: 0.25, startTime: stepTime, destination: musicGain });
    }
    const isSuperDash = runMode === RUN_AUDIO_MODE.superDash;
    const isOffbeatEighth = stepInBar % 4 === 2;
    const isSixteenth = stepInBar % 2 === 1;
    const shouldPlayHat =
      (isOffbeatEighth && speedRatio >= CLOSED_HAT_SPEED_THRESHOLD) || isSuperDash && (isOffbeatEighth || isSixteenth);
    if (shouldPlayHat || (runMode === RUN_AUDIO_MODE.dash && isOffbeatEighth)) {
      playNoise({ filterType: 'highpass', filterFrequency: 7000, duration: 0.04, volume: 0.18, startTime: stepTime, destination: musicGain });
    }
  }

  function scheduleMelody(stepInBar, stepTime, chord) {
    if (stepInBar % 2 === 0) {
      const bassOctaveRatio = stepInBar % 4 === 2 ? 2 : 1;
      playTone({
        frequency: chord.bassFrequency * bassOctaveRatio,
        waveType: 'sawtooth',
        duration: 0.14,
        volume: 0.16,
        startTime: stepTime,
        destination: musicGain,
      });
    }
    if (ARPEGGIO_STEPS.has(stepInBar)) {
      const noteIndex = [...ARPEGGIO_STEPS].indexOf(stepInBar) % chord.arpeggioFrequencies.length;
      const octaveRatio = runMode === RUN_AUDIO_MODE.superDash ? 2 : 1;
      playTone({
        frequency: chord.arpeggioFrequencies[noteIndex] * octaveRatio,
        waveType: 'square',
        duration: 0.12,
        volume: 0.06,
        startTime: stepTime,
        destination: musicGain,
      });
    }
  }

  function scheduleStep(stepIndex, stepTime) {
    const stepInBar = stepIndex % STEPS_PER_BAR;
    const chord = CHORD_PROGRESSION[Math.floor(stepIndex / STEPS_PER_BAR)];
    scheduleDrums(stepInBar, stepTime);
    scheduleMelody(stepInBar, stepTime, chord);
  }

  function runScheduler() {
    if (!isReady()) {
      return;
    }
    const scheduleHorizon = audioContext.currentTime + SCHEDULE_AHEAD_SECONDS;
    // After a long stall (tab throttled), skip ahead instead of firing a burst of stale notes.
    if (nextStepTime < audioContext.currentTime) {
      nextStepTime = audioContext.currentTime + 0.02;
    }
    while (nextStepTime < scheduleHorizon) {
      scheduleStep(currentStepIndex, nextStepTime);
      const sixteenthSeconds = 60 / computeTempoBpm() / 4;
      nextStepTime += sixteenthSeconds;
      currentStepIndex = (currentStepIndex + 1) % LOOP_STEP_COUNT;
    }
  }

  function startMusic() {
    if (!isReady()) {
      return;
    }
    // A restart after a crash reuses the running loop but lifts the muffled crash filter again.
    const now = audioContext.currentTime;
    musicFilter.frequency.cancelScheduledValues(now);
    musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, now);
    musicFilter.frequency.exponentialRampToValueAtTime(OPEN_MUSIC_FILTER_HZ, now + 0.25);
    if (isMusicPlaying) {
      return;
    }
    isMusicPlaying = true;
    currentStepIndex = 0;
    nextStepTime = now + 0.05;
    schedulerIntervalId = window.setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
    runScheduler();
  }

  function stopMusic() {
    if (!isMusicPlaying) {
      return;
    }
    isMusicPlaying = false;
    window.clearInterval(schedulerIntervalId);
  }

  // Called every frame; only touches audio params when the target volume actually moves.
  function updateRunState(nextRunMode, nextSpeedRatio) {
    runMode = nextRunMode;
    speedRatio = Math.min(1, Math.max(0, nextSpeedRatio));
    if (!isReady()) {
      return;
    }
    let targetWindVolume = 0;
    if (runMode === RUN_AUDIO_MODE.superDash) {
      targetWindVolume = WIND_SUPER_DASH_VOLUME;
    } else if (runMode === RUN_AUDIO_MODE.dash) {
      targetWindVolume = WIND_DASH_VOLUME;
    } else if (runMode === RUN_AUDIO_MODE.running) {
      targetWindVolume = WIND_BASE_VOLUME + WIND_SPEED_VOLUME * speedRatio;
    }
    if (Math.abs(targetWindVolume - appliedWindVolume) < WIND_VOLUME_CHANGE_THRESHOLD) {
      return;
    }
    appliedWindVolume = targetWindVolume;
    const now = audioContext.currentTime;
    windGain.gain.setTargetAtTime(targetWindVolume, now, WIND_TIME_CONSTANT);
    const windCenterFrequency = runMode === RUN_AUDIO_MODE.superDash ? 1600 : 600 + 700 * speedRatio;
    windFilter.frequency.setTargetAtTime(windCenterFrequency, now, WIND_TIME_CONSTANT);
  }

  function setPaused(isPaused) {
    isPausedByGame = isPaused;
    if (!audioContext) {
      return;
    }
    if (isPaused) {
      audioContext.suspend();
    } else {
      audioContext.resume();
    }
  }

  function toggleMuted() {
    isMuted = !isMuted;
    saveMutedPreference(isMuted);
    if (masterGain) {
      masterGain.gain.setTargetAtTime(isMuted ? 0 : MASTER_VOLUME, audioContext.currentTime, MUTE_FADE_TIME_CONSTANT);
    }
    return isMuted;
  }

  return {
    unlock,
    startMusic,
    stopMusic,
    updateRunState,
    setPaused,
    toggleMuted,
    isMuted: () => isMuted,
    playJump,
    playLand,
    playSlide,
    playLaneSwitch,
    playEat,
    playSmash,
    playSideBump,
    playCrash,
    playSuperDash,
    playEnergyFull,
    playStart,
    playGameOver,
    playButton,
  };
}
