/* ============================================================
   ChankArts Metronome — Web (PWA)
   Port of the Flutter app:
     - lib/metronome_controller.dart  (state, timing, click playback)
     - lib/metronome_page.dart        (UI wiring)
     - lib/powered_by_splash_page.dart (splash flow)
   Timing uses the Web Audio clock with a lookahead scheduler,
   which is sample-accurate and drift-free in browsers.
   ============================================================ */

(() => {
  'use strict';

  /* ---------- Constants (MetronomeController) ---------- */

  const MIN_BPM = 30;
  const MAX_BPM = 300;

  const SIGNATURES = [
    { numerator: 3, denominator: 4, carnaticName: 'Rupaka / Tisra Eka',  hindustaniName: 'Dadra' },
    { numerator: 4, denominator: 4, carnaticName: 'Adi (4/4 feel)',      hindustaniName: 'Teentaal' },
    { numerator: 5, denominator: 8, carnaticName: 'Khanda Chapu',         hindustaniName: 'Jhaptal' },
    { numerator: 6, denominator: 8, carnaticName: 'Rupaka (alt)',         hindustaniName: 'Dadra (6-beat feel)' },
    { numerator: 7, denominator: 8, carnaticName: 'Misra Chapu',          hindustaniName: 'Rupak' },
    { numerator: 8, denominator: 8, carnaticName: 'Adi (8-beat cycle)',   hindustaniName: 'Teentaal' },
  ];
  SIGNATURES.forEach((s) => {
    s.label = `${s.numerator}/${s.denominator}`;
    s.beatsPerBar = s.numerator;            // TimeSignatureData.beatsPerBar => numerator
  });

  const STRONG_VOLUME = 1.0;
  const REGULAR_VOLUME = 0.92;
  const MIN_SPLASH_MS = 1400;               // PoweredBySplashPage minimum splash
  const SCHEDULE_AHEAD_S = 0.12;            // lookahead window
  const SCHEDULER_TICK_MS = 25;

  /* ---------- State ---------- */

  let bpm = 120;
  let selectedSignature = SIGNATURES[1];    // default 4/4 (signatures[1])
  let isPlaying = false;
  let currentBeat = 0;
  let beatCursor = 0;

  /* ---------- Audio engine ---------- */

  let audioCtx = null;
  let clickBuffers = { strong: null, regular: null };
  let audioReady = false;

  function createAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    return new Ctx();
  }

  async function fetchClick(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load click: ${url}`);
    const data = await response.arrayBuffer();
    return audioCtx.decodeAudioData(data);
  }

  async function loadClicks() {
    audioCtx = createAudioContext();
    try {
      const [strong, regular] = await Promise.all([
        fetchClick('assets/sounds/click_strong.wav'),
        fetchClick('assets/sounds/click_regular.wav'),
      ]);
      clickBuffers.strong = strong;
      clickBuffers.regular = regular;
      audioReady = true;
    } catch (err) {
      console.error('Audio asset loading failed:', err);
    }
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playClick(buffer, when, volume) {
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(audioCtx.destination);
    source.start(when);
  }

  /* ---------- Scheduler (drift-free, Web Audio clock) ---------- */

  let nextNoteTime = 0;
  let schedulerId = null;
  const visualQueue = [];                   // { cursor, time }
  let debugTicks = 0;

  function intervalSeconds() {
    return 60 / bpm;
  }

  function schedulerTick() {
    debugTicks += 1;
    if (!isPlaying || !audioCtx) return;
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_S) {
      const beat = beatCursor % selectedSignature.beatsPerBar;
      const accent = beat === 0;
      playClick(
        accent ? clickBuffers.strong : clickBuffers.regular,
        nextNoteTime,
        accent ? STRONG_VOLUME : REGULAR_VOLUME
      );
      visualQueue.push({ cursor: beatCursor, time: nextNoteTime });
      beatCursor += 1;
      nextNoteTime += intervalSeconds();
    }
  }

  function visualLoop() {
    if (isPlaying && audioCtx) {
      while (visualQueue.length && visualQueue[0].time <= audioCtx.currentTime) {
        currentBeat = visualQueue.shift().cursor % selectedSignature.beatsPerBar;
        renderBeats();
      }
    }
    requestAnimationFrame(visualLoop);
  }

  /* ---------- Transport (start / stop / toggle) ---------- */

  function start() {
    if (isPlaying) return;
    isPlaying = true;
    beatCursor = 0;
    currentBeat = 0;
    visualQueue.length = 0;
    resumeAudio();
    nextNoteTime = audioCtx.currentTime + 0.03;
    schedulerId = setInterval(schedulerTick, SCHEDULER_TICK_MS);
    schedulerTick();
    renderTransport();
    renderBeats();
  }

  function stop() {
    if (!isPlaying && !schedulerId) return;
    isPlaying = false;
    if (schedulerId !== null) {
      clearInterval(schedulerId);
      schedulerId = null;
    }
    visualQueue.length = 0;
    currentBeat = 0;
    renderTransport();
    renderBeats();
  }

  function toggle() {
    isPlaying ? stop() : start();
  }

  /* ---------- BPM (setBpmFromSlider / clamp behavior) ---------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setBpm(next) {
    const clamped = clamp(Math.round(next), MIN_BPM, MAX_BPM);
    if (bpm === clamped) return;
    bpm = clamped;                          // tempo applies from the next unscheduled beat
    renderBpm();
  }

  function adjustBpm(delta) {
    setBpm(bpm + delta);
  }

  /* ---------- Time signature ---------- */

  function setSignature(signature) {
    if (
      selectedSignature.numerator === signature.numerator &&
      selectedSignature.denominator === signature.denominator
    ) return;
    selectedSignature = signature;
    beatCursor = beatCursor % selectedSignature.beatsPerBar;
    currentBeat = currentBeat % selectedSignature.beatsPerBar;
    renderSignature();
    renderBeats();
    renderMenus();
  }

  /* ---------- DOM references ---------- */

  const $ = (id) => document.getElementById(id);
  const splashEl = $('splash');
  const appEl = $('app');
  const beatRowEl = $('beatRow');
  const bpmValueEl = $('bpmValue');
  const bpmSliderEl = $('bpmSlider');
  const sigFieldEl = $('sigField');
  const sigButtonEl = $('sigButton');
  const sigValueEl = $('sigValue');
  const sigMenuEl = $('sigMenu');
  const rhythmFieldEl = $('rhythmField');
  const rhythmButtonEl = $('rhythmButton');
  const rhythmCarnaticEl = $('rhythmCarnatic');
  const rhythmHindustaniEl = $('rhythmHindustani');
  const rhythmMenuEl = $('rhythmMenu');
  const startStopEl = $('startStop');

  /* ---------- Rendering ---------- */

  let lastBeatCount = 0;

  function renderBeats() {
    const beatCount = selectedSignature.beatsPerBar;
    if (beatCount !== lastBeatCount) {
      beatRowEl.innerHTML = '';
      for (let i = 0; i < beatCount; i += 1) {
        const beat = document.createElement('span');
        beat.className = 'beat' + (i === 0 ? ' is-downbeat' : '');
        beat.innerHTML = '<span class="dot"></span>';
        beatRowEl.appendChild(beat);
      }
      lastBeatCount = beatCount;
    }
    const dots = beatRowEl.children;
    for (let i = 0; i < dots.length; i += 1) {
      dots[i].classList.toggle('is-active', isPlaying && i === currentBeat);
    }
  }

  function renderBpm() {
    bpmValueEl.textContent = String(bpm);
    if (Number(bpmSliderEl.value) !== bpm) bpmSliderEl.value = String(bpm);
    const pct = ((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100;
    bpmSliderEl.style.setProperty('--pct', `${pct}%`);
  }

  function renderTransport() {
    startStopEl.textContent = isPlaying ? 'Stop' : 'Start';
    startStopEl.classList.toggle('is-playing', isPlaying);
  }

  function renderSignature() {
    sigValueEl.textContent = selectedSignature.label;
    rhythmCarnaticEl.textContent = `Carnatic: ${selectedSignature.carnaticName}`;
    rhythmHindustaniEl.textContent = `Hindustani: ${selectedSignature.hindustaniName}`;
  }

  function renderMenus() {
    sigMenuEl.innerHTML = '';
    rhythmMenuEl.innerHTML = '';
    SIGNATURES.forEach((signature) => {
      const liSig = document.createElement('li');
      liSig.textContent = signature.label;
      liSig.setAttribute('role', 'option');
      liSig.setAttribute('aria-selected', String(signature === selectedSignature));
      if (signature === selectedSignature) liSig.classList.add('is-selected');
      liSig.addEventListener('click', () => { setSignature(signature); closeMenus(); });
      sigMenuEl.appendChild(liSig);

      const liRhythm = document.createElement('li');
      liRhythm.textContent = `${signature.label} • ${signature.hindustaniName} / ${signature.carnaticName}`;
      liRhythm.setAttribute('role', 'option');
      liRhythm.setAttribute('aria-selected', String(signature === selectedSignature));
      if (signature === selectedSignature) liRhythm.classList.add('is-selected');
      liRhythm.addEventListener('click', () => { setSignature(signature); closeMenus(); });
      rhythmMenuEl.appendChild(liRhythm);
    });
  }

  /* ---------- Menus (Flutter dropdown + popup) ---------- */

  function closeMenus() {
    sigMenuEl.hidden = true;
    rhythmMenuEl.hidden = true;
    sigFieldEl.classList.remove('is-open');
    rhythmFieldEl.classList.remove('is-open');
    sigButtonEl.setAttribute('aria-expanded', 'false');
    rhythmButtonEl.setAttribute('aria-expanded', 'false');
  }

  function bindMenu(button, menu, field) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const wasOpen = !menu.hidden;
      closeMenus();
      if (!wasOpen) {
        menu.hidden = false;
        field.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
      }
    });
    menu.addEventListener('click', (event) => event.stopPropagation());
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    $('bpmMinus1').addEventListener('click', () => adjustBpm(-1));
    $('bpmMinus5').addEventListener('click', () => adjustBpm(-5));
    $('bpmPlus1').addEventListener('click', () => adjustBpm(1));
    $('bpmPlus5').addEventListener('click', () => adjustBpm(5));

    bpmSliderEl.addEventListener('input', () => setBpm(Number(bpmSliderEl.value)));

    startStopEl.addEventListener('click', () => {
      resumeAudio();                        // user gesture: unlock audio first
      toggle();
    });

    bindMenu(sigButtonEl, sigMenuEl, sigFieldEl);
    bindMenu(rhythmButtonEl, rhythmMenuEl, rhythmFieldEl);
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });

    // Flutter WidgetsBindingObserver: stop when app is inactive/paused.
    // Browser analog: the tab/document is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
    });

    // Any gesture can unlock the audio context (autoplay policy).
    window.addEventListener('pointerdown', resumeAudio, { once: true });
  }

  /* ---------- Splash flow ---------- */

  async function openApp() {
    const minimumSplash = new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS));
    const imagePreload = Promise.all([
      preloadImage('assets/images/labs_512.png'),
      preloadImage('assets/images/logo_256.png'),
    ]);

    await Promise.all([minimumSplash, imagePreload, loadClicks()]);

    splashEl.classList.add('is-leaving');
    appEl.hidden = false;
    void appEl.offsetHeight;                // flush initial styles (opacity: 0)
    appEl.classList.add('is-visible');      // fade in without waiting for rAF
    setTimeout(() => { splashEl.remove(); }, 300);
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });
  }

  /* ---------- PWA ---------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext && location.hostname !== 'localhost') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  /* ---------- Boot ---------- */

  // Read-only state hook for debugging and automated tests.
  window.__metronomeDebug = () => ({
    isPlaying,
    bpm,
    currentBeat,
    beatCursor,
    beatsPerBar: selectedSignature.beatsPerBar,
    audioState: audioCtx ? audioCtx.state : null,
    audioTime: audioCtx ? Number(audioCtx.currentTime.toFixed(3)) : null,
    audioReady,
    queueLen: visualQueue.length,
    activeIndex: [...beatRowEl.children].findIndex((el) =>
      el.classList.contains('is-active')
    ),
    beatCount: beatRowEl.children.length,
    appVisible: appEl.classList.contains('is-visible'),
    ticks: debugTicks,
    timerOn: schedulerId !== null,
    nextNote: Number.isFinite(nextNoteTime) ? Number(nextNoteTime.toFixed(3)) : String(nextNoteTime),
    vis: document.visibilityState,
    hidden: document.hidden,
  });

  renderBpm();
  renderTransport();
  renderSignature();
  renderMenus();
  renderBeats();
  bindEvents();
  registerServiceWorker();
  openApp();

  requestAnimationFrame(visualLoop);
})();
