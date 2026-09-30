// Generated sound (carried over from the prototype): wind that follows the gusts, water, birdsong,
// and a quiet score of warm pad and sparse soft piano that thins out while the person speaks.
import { U, gustAt } from './common.js';

let AC = null, master = null, windG = null, windF = null, rustleG = null, waterG = null, birdBus = null, musicBus = null, padLP = null;
const LEVEL = 3.2;   // ≈ +11 dB over the prototype, which played too quietly to hear on laptop and phone speakers
let muted = false, birdTimer = 0, padVoices = [], chordI = 0;
const CHORDS = [[146.83, 220, 277.18, 329.63, 369.99], [123.47, 185, 220, 277.18, 293.66], [98, 196, 246.94, 277.18, 369.99], [110, 164.81, 220, 246.94, 369.99]];
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880];

// Seamless noise loops: generate a little extra and cross-fade the tail into the head, so the loop point never clicks.
function noiseBuf(brown) {
  const sr = AC.sampleRate, len = sr * 8, F = Math.floor(sr * 0.5), b = AC.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const g = new Float32Array(len + F); let last = 0, mean = 0;
    for (let i = 0; i < len + F; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; g[i] = last * 3.5; } else g[i] = w; mean += g[i]; }
    mean /= len + F;
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = g[i] - mean;                 // no DC offset
    for (let i = 0; i < F; i++) { const t = i / F, a = Math.sin(t * Math.PI / 2), c = Math.cos(t * Math.PI / 2); d[i] = (g[i] - mean) * a + (g[len + i] - mean) * c; }
  }
  return b;
}
function loop(buf) { const s = AC.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }

// Browsers only let sound play after the person interacts with the page. We create the audio graph at load
// (some browsers allow that straight away, and native WebViews always do), and resume it on the first touch.
const listeners = [];
const running = () => !!AC && AC.state === 'running';
export function audioRunning() { return running(); }
export function onAudioState(cb) { listeners.push(cb); if (AC) cb(running()); }
export function startAudio(onStart) {
  if (AC) { if (AC.state !== 'running') AC.resume().catch(() => {}); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  AC.onstatechange = () => listeners.forEach(cb => cb(running()));
  if (AC.state !== 'running') AC.resume().catch(() => {});
  // iOS: let Web Audio play even with the ringer switch on silent (Safari 16.4+)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  // master → gentle compressor → limiter, so the mix can sit at a normal listening level without clipping
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
  const limit = AC.createDynamicsCompressor();
  limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;
  master = AC.createGain(); master.gain.value = 0; master.connect(comp); comp.connect(limit); limit.connect(AC.destination);
  const verb = AC.createConvolver(); const il = AC.sampleRate * 2.6, ib = AC.createBuffer(2, il, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < il; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 3.2); }
  verb.buffer = ib; const vg = AC.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
  const brown = noiseBuf(true), white = noiseBuf(false);
  windF = AC.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 420; windF.Q.value = 0.6;
  windG = AC.createGain(); windG.gain.value = 0.2; loop(brown).connect(windF); windF.connect(windG); windG.connect(master);
  const rf = AC.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3400; rf.Q.value = 0.5;
  rustleG = AC.createGain(); rustleG.gain.value = 0.01; loop(white).connect(rf); rf.connect(rustleG); rustleG.connect(master);
  const wf = AC.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1100; wf.Q.value = 3;
  waterG = AC.createGain(); waterG.gain.value = 0.015; loop(white).connect(wf); wf.connect(waterG); waterG.connect(master);
  birdBus = AC.createGain(); birdBus.gain.value = 1; birdBus.connect(master); birdBus.connect(verb);
  master.gain.setTargetAtTime(muted ? 0 : LEVEL, AC.currentTime, 1.6);   // sound fades in
  scheduleBird();
  startMusic(verb);
  onStart?.();
  listeners.forEach(cb => cb(running()));
}
function startMusic(verb) {
  musicBus = AC.createGain(); musicBus.gain.value = 0.0001; musicBus.connect(master);
  const send = AC.createGain(); send.gain.value = 0.75; musicBus.connect(send); send.connect(verb);
  musicBus.gain.setTargetAtTime(0.6, AC.currentTime + 0.2, 2.2);
  padLP = AC.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 950; padLP.Q.value = 0.3; padLP.connect(musicBus);
  nextChord(); setTimeout(piano, 1800);
}
function nextChord() {
  if (!running()) { setTimeout(nextChord, 500); return; }
  const now = AC.currentTime;
  padVoices.forEach(v => { v.g.gain.setTargetAtTime(0.0001, now, 2.4); v.o.forEach(o => o.stop(now + 12)); });
  padVoices = [];
  CHORDS[chordI % 4].forEach((f, i) => {
    const g = AC.createGain(); g.gain.value = 0.0001; g.connect(padLP);
    const o1 = AC.createOscillator(), o2 = AC.createOscillator(); o1.type = 'triangle'; o2.type = 'sine';
    o1.frequency.value = f; o2.frequency.value = f * 1.0035; o1.connect(g); o2.connect(g); o1.start(); o2.start();
    g.gain.setTargetAtTime(0.02 / (1 + i * 0.3), now, 2.6);
    padVoices.push({ g, o: [o1, o2] });
  });
  chordI++;
  setTimeout(nextChord, 11500);
}
function pianoNote(f, when, vel) {
  const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300;
  g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vel, when + 0.008);
  g.gain.exponentialRampToValueAtTime(vel * 0.3, when + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, when + 4.4);
  [[1, 1], [2, 0.32], [3, 0.1], [4.02, 0.04]].forEach(pa => {
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f * pa[0];
    const og = AC.createGain(); og.gain.value = pa[1]; o.connect(og); og.connect(g); o.start(when); o.stop(when + 4.6);
  });
  g.connect(lp); lp.connect(musicBus);
}
function piano() {
  if (!running()) { setTimeout(piano, 700); return; }
  const calm = U.uCalm.value, now = AC.currentTime + 0.05;
  const chord = CHORDS[(chordI + 3) % 4];
  const pick = () => { if (Math.random() < 0.55) { let f = chord[1 + Math.floor(Math.random() * (chord.length - 1))]; while (f < 290) f *= 2; return f; } return SCALE[Math.floor(Math.random() * SCALE.length)]; };
  const v = 0.055 * (1 - calm * 0.45);
  pianoNote(pick(), now, v);
  if (Math.random() < 0.25) pianoNote(pick(), now + 0.2 + Math.random() * 0.25, v * 0.65);
  setTimeout(piano, (calm > 0.5 ? 3400 : 1500) + Math.random() * (calm > 0.5 ? 3800 : 2300));
}
function phrase() {
  if (!running()) return;
  const pan = AC.createStereoPanner ? AC.createStereoPanner() : AC.createGain();
  if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(birdBus);
  let t = AC.currentTime + 0.05; const base = 2300 + Math.random() * 1900, n = 3 + Math.floor(Math.random() * 5);
  const lvl = 0.035 * (1 - U.uCalm.value * 0.6) + 0.004;
  for (let i = 0; i < n; i++) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
    const f0 = base * (0.85 + Math.random() * 0.35), f1 = f0 * (Math.random() < 0.5 ? 1.25 + Math.random() * 0.5 : 0.7 + Math.random() * 0.15), dur = 0.05 + Math.random() * 0.1;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(pan); o.start(t); o.stop(t + dur + 0.03);
    t += dur + 0.025 + Math.random() * 0.09;
  }
}
export function scheduleBird() { if (!AC) return; clearTimeout(birdTimer); birdTimer = setTimeout(() => { phrase(); scheduleBird(); }, (U.uCalm.value > 0.5 ? 7000 : 2600) + Math.random() * 6000); }
export function toggleMute() {
  if (!running()) { muted = false; if (master) master.gain.setTargetAtTime(LEVEL, AC.currentTime, 0.3); startAudio(); return false; }
  muted = !muted; master.gain.setTargetAtTime(muted ? 0 : LEVEL, AC.currentTime, 0.3);
  return muted;
}
// sound follows the wind that moves the grass
export function updateAudio(camPos) {
  if (!AC || !windG) return;
  const calm = U.uCalm.value;
  const gust = gustAt(camPos.x, camPos.z - 6);   // the air just in front of you
  windG.gain.setTargetAtTime((0.07 + gust * 0.24) * (1 - calm * 0.8), AC.currentTime, 0.4);
  windF.frequency.setTargetAtTime(500 + gust * 1100, AC.currentTime, 0.4);
  rustleG.gain.setTargetAtTime((0.006 + gust * 0.02) * (1 - calm * 0.85), AC.currentTime, 0.4);
  waterG.gain.setTargetAtTime(0.012 + calm * 0.004, AC.currentTime, 0.8);
}
