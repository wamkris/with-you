// With You — the living valley. Entry: builds the scene, runs the flow (arrival → the place where you speak →
// listening → understanding), and exposes a small hook for the native shells and the screenshot harness.
import * as THREE from 'three';
import { U, H, R, sunDir, poolD } from './common.js';
import { pickQuality } from './quality.js';
import { makeSky } from './sky.js';
import { makeTerrain } from './terrain.js';
import { makeGrass } from './grass.js';
import { makeTrees } from './trees.js';
import { makeWater } from './water.js';
import { makeRocks, makeSquirrel, makeBirds, makeButterfly, makeMotes, makeRing, RING_SPOT } from './life.js';
import { makePost } from './post.js';
import { startAudio, toggleMute, updateAudio, scheduleBird, onAudioState } from './audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');                     // arrival | speak | listen | understand (screenshot harness)
// look-dev knobs, e.g. ?exp=1.1&sky=0.5&bloom=0.2
const knob = (k, d) => (params.has(k) ? +params.get(k) : d);
const LOOK = { exp: knob('exp', 1.0), sky: knob('sky', 0.5), bloom: knob('bloom', 0.22), env: knob('env', 0.6), sun: knob('sun', 3.4) };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function fail(e) { console.error(e); $('fallback').style.display = 'flex'; $('veil').classList.add('gone'); }

const cv = $('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance', depth: true, stencil: false });
} catch (e) { fail(e); throw e; }
const quality = pickQuality(renderer.getContext());
renderer.setPixelRatio(quality.dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // r186: PCF is soft (PCFSoft was removed)
renderer.toneMapping = THREE.NoToneMapping;          // tone mapping happens in the grade pass
const status = { ready: false, quality: quality.tier, gpu: quality.gpu, frames: 0, avgMs: 0 };
window.__valley = status;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 1, 2);          // enables the fog chunk; our own aerial perspective replaces it
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2400);

/* ---------- textures ---------- */
async function loadTextures() {
  const loader = new THREE.TextureLoader();
  const names = ['meadow', 'forest', 'mud', 'rock', 'bark'];
  const jobs = [];
  const tex = {};
  const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), quality.tier === 'high' ? 8 : 4);
  for (const n of names) for (const m of ['diff', 'nor', 'arm']) {
    jobs.push(loader.loadAsync(`assets/tex/${n}_${m}.webp`).then(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
      t.colorSpace = m === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex[`${n}_${m}`] = t;
    }));
  }
  for (const n of ['grass_atlas', 'leaf_atlas']) {
    jobs.push(loader.loadAsync(`assets/tex/${n}.webp`).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; tex[n] = t; }));
  }
  const rects = fetch('assets/tex/grass_atlas.json').then(r => r.json());
  await Promise.all(jobs);
  return { tex, rects: await rects };
}

/* ---------- light ---------- */
const sun = new THREE.DirectionalLight(0xffffff, LOOK.sun);
sun.color.copy(U.uSunCol.value);
sun.position.copy(sunDir).multiplyScalar(120);
sun.target.position.set(0, 0, -6);
sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadow, quality.shadow);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 18, bottom: -14, near: 20, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
scene.add(sun, sun.target);

/* ---------- build ---------- */
let world;
async function build() {
  const [{ tex, rects }, skyObj] = await Promise.all([loadTextures(), makeSky(scene, quality, LOOK.sky)]);
  // image-based light from our own sky, so ambient and reflections match what you see
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(skyObj.sky.clone());
  const env = pm.fromScene(envScene, 0.02, 0.1, 3000).texture;
  scene.environment = env; scene.environmentIntensity = LOOK.env;

  const terrain = makeTerrain(scene, tex, quality);
  const rocks = await makeRocks(scene);
  const trees = makeTrees(scene, tex, quality);
  const grass = makeGrass(scene, tex, rects, quality, [...rocks.avoid, ...trees.avoid]);
  const water = makeWater(scene, quality, camera);
  water.hideInMirror.push(grass);
  const squirrel = makeSquirrel(scene, rocks.sqTop);
  const birds = makeBirds(scene);
  const bfly = makeButterfly(scene);
  const motes = makeMotes(scene, quality);
  water.hideInMirror.push(motes.pts);
  const ring = makeRing(scene);
  const post = makePost(renderer, scene, camera, quality);
  status.trees = trees.stats; status.grass = grass.userData.count;
  world = { terrain, trees, grass, water, squirrel, birds, bfly, motes, ring, post };
  for (const h of (params.get('hide') || '').split(',')) {
    if (h === 'trees') trees.group.visible = false;
    else if (h === 'water') water.water.visible = false;
    else if (h === 'ridges' || h === 'sky') scene.traverse(o => { if (o.name === (h === 'sky' ? 'sky' : 'ridge')) o.visible = false; });
    else if (world[h]?.isObject3D) world[h].visible = false;
  }
}

/* ---------- camera choreography ---------- */
const ground = (x, z) => Math.max(H(x, z), 0);
const shots = {
  a0: { p: new THREE.Vector3(-4, 13, 42), t: new THREE.Vector3(0, 11.0, -30) },
  rest: { p: new THREE.Vector3(0, ground(0, 22) + 2.5, 22), t: new THREE.Vector3(0.3, 1.2, -30) },
  home: { p: new THREE.Vector3(0, ground(0, 11.2) + 1.2, 11.2), t: new THREE.Vector3(0.2, 0.2, -20) },
  under: { p: new THREE.Vector3(0.6, ground(0.6, 8.4) + 0.95, 8.4), t: new THREE.Vector3(1.2, 9.4, -30) },
};
let from = shots.a0, to = shots.rest, moveStart = 0, moveDur = reduced ? 0.01 : 13;
const camP = new THREE.Vector3(), camT = new THREE.Vector3(), look = new THREE.Vector3();
const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
function setFov() {
  const a = innerWidth / innerHeight;
  camera.fov = Math.min(Math.max(2 * Math.atan(Math.tan(21 * Math.PI / 180) / a) * 180 / Math.PI, 38), 60);
  camera.aspect = a; camera.updateProjectionMatrix();
}
setFov();
let px = 0, py = 0, tpx = 0, tpy = 0, drift = 0;
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { tpx = e.clientX / innerWidth * 2 - 1; tpy = e.clientY / innerHeight * 2 - 1; } });
addEventListener('deviceorientation', e => { if (e.gamma != null) { tpx = Math.max(-1, Math.min(1, e.gamma / 25)); tpy = Math.max(-1, Math.min(1, (e.beta - 45) / 25)); } });
function moveTo(shot, dur) { from = { p: camP.clone(), t: camT.clone() }; to = shot; moveStart = U.uTime.value; moveDur = reduced ? 0.01 : dur; }

/* ---------- flow ---------- */
let phase = 'arrive', listening = false, calmTarget = 0, warmTarget = 0, lineTarget = 0, restTarget = 0;
let lastPulse = 0; const pulseAt = new THREE.Vector2(RING_SPOT.x, RING_SPOT.z);
const show = (id, on = true) => $(id).classList.toggle('show', on);
function setAsk(isListening) {
  $('askH').textContent = isListening ? 'I’m listening.' : 'What’s going on?';
  $('askP').textContent = isListening ? 'Take your time.' : 'Say it however it comes out.';
  $('cue').textContent = isListening ? 'Listening. Tap anywhere when you’re done' : 'Touch the water to speak';
}
function startListening(pt) {
  listening = true; calmTarget = 1;
  if (pt) pulseAt.set(pt.x, pt.z);
  setAsk(true); scheduleBird();
}
function arriveHome(instant) {
  phase = 'home'; $('begin').hidden = true; cv.style.cursor = 'pointer';
  show('askH'); show('askP');
  const c = $('cue'); c.hidden = false;
  requestAnimationFrame(() => { c.style.opacity = 1; });
  if (instant) c.style.transition = 'none';
}
function toUnderstanding(instant) {
  listening = false; phase = 'toUnder'; calmTarget = 0.55; warmTarget = 1; lineTarget = 1; restTarget = 1;
  $('ask').classList.add('away'); $('cue').style.opacity = 0; world.ring.show.value = 0;
  setTimeout(() => { $('cue').hidden = true; }, 1200);
  moveTo(shots.under, instant ? 0.01 : 6);
  setTimeout(() => {
    phase = 'under'; cv.style.cursor = 'default';
    $('insight').hidden = false; $('support').hidden = false;
    requestAnimationFrame(() => { show('kicker'); show('insightH'); setTimeout(() => show('support'), instant ? 0 : 1600); });
  }, instant ? 0 : 4200);
}
function backToWater(listen) {
  show('kicker', false); show('insightH', false); show('support', false);
  setTimeout(() => { $('insight').hidden = true; $('support').hidden = true; }, 1500);
  warmTarget = 0; lineTarget = 0; restTarget = 0; calmTarget = 0;
  moveTo(shots.home, 5.5); phase = 'toHome';
  setTimeout(() => {
    $('ask').classList.remove('away'); setAsk(false); arriveHome();
    if (listen) startListening(RING_SPOT);
  }, 4600);
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
cv.addEventListener('pointerdown', e => {
  startAudio(() => $('sound').classList.add('on'));    // browsers: sound starts on the first touch
  if (!world) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(world.water.water, false)[0];
  const onPool = hit && world.water.inPool(hit.point.x, hit.point.z);
  if (phase === 'home') {
    if (listening) { world.water.addDrop(pulseAt.x, pulseAt.y, 1.0); toUnderstanding(); return; }
    const pt = onPool ? hit.point : RING_SPOT;
    world.water.addDrop(pt.x, pt.z, 1.4); startListening(pt);
  } else if (onPool) world.water.addDrop(hit.point.x, hit.point.z, 1.2);
});
$('cue').addEventListener('click', () => {
  startAudio(() => $('sound').classList.add('on'));
  if (listening) { toUnderstanding(); return; }
  world.water.addDrop(RING_SPOT.x, RING_SPOT.z, 1.4); startListening(RING_SPOT);
});
$('begin').addEventListener('click', () => {
  if (phase !== 'arrive' && phase !== 'rest') return;
  startAudio(() => $('sound').classList.add('on'));
  phase = 'toHome';
  $('intro').classList.add('away'); $('begin').classList.add('away');
  moveTo(shots.home, 6.5);
  setTimeout(() => arriveHome(), reduced ? 50 : 5600);
});
$('back').addEventListener('click', () => backToWater(false));
$('keep').addEventListener('click', () => backToWater(true));
$('sound').addEventListener('click', () => {
  const m = toggleMute();
  $('sound').classList.add('on');
  $('sound').setAttribute('aria-pressed', String(!m)); $('waves').style.opacity = m ? 0 : 1;
});
// Sound: try at load; if the browser holds it until the person interacts, the first touch, click or key anywhere
// starts it (touchend matters on iPhone). Until then the speaker shows a quiet "Tap for sound" cue.
startAudio();
const unlock = () => startAudio();
['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
onAudioState(on => {
  status.audio = on ? 'running' : 'waiting for a touch';
  $('sound').classList.add('on');
  $('sound').classList.toggle('waiting', !on);
  $('waves').style.opacity = on ? 1 : 0;
  $('sound').setAttribute('aria-label', on ? 'Sound' : 'Tap for sound');
  if (on) ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => removeEventListener(ev, unlock, { capture: true }));
});
// native shells can start the sound themselves (WebView allows autoplay there)
window.WithYou = { startAudio: () => startAudio(() => $('sound').classList.add('on')) };

/* ---------- resize ---------- */
const baseDpr = quality.dpr;
let dprScale = 1, lastAdapt = 0;
function onResize() {
  renderer.setPixelRatio(quality.dpr);
  if (world) world.post.composer.setPixelRatio(quality.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  setFov();
  if (world) { world.post.resize(innerWidth, innerHeight); world.water.resize(innerWidth, innerHeight); world.motes.uPx.value = innerHeight * quality.dpr; }
}
addEventListener('resize', onResize);

/* ---------- life loop ---------- */
const clock = new THREE.Clock();
let nextDrop = 3, first = true, lineK = 0, restK = 0;
const bflyHome = new THREE.Vector3(-0.5, 1.25, 7.9), bflyArrive = new THREE.Vector3(0.4, 1.7, 15);
const frameTimes = [];
function frame() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05);
  const t = U.uTime.value += dt;
  U.uCalm.value += (calmTarget - U.uCalm.value) * Math.min(dt * 0.9, 1);
  U.uWarm.value += (warmTarget - U.uWarm.value) * Math.min(dt * 0.6, 1);
  lineK += (lineTarget - lineK) * Math.min(dt * 0.5, 1);
  restK += (restTarget - restK) * Math.min(dt * 0.8, 1);
  const calm = U.uCalm.value;

  // camera
  const k = smooth(Math.min(Math.max((t - moveStart) / moveDur, 0), 1));
  camP.lerpVectors(from.p, to.p, k); camT.lerpVectors(from.t, to.t, k);
  if (phase === 'arrive' && k >= 1) phase = 'rest';
  px += (tpx - px) * Math.min(dt * 1.5, 1); py += (tpy - py) * Math.min(dt * 1.5, 1);
  const hand = reduced ? 0 : 1;
  drift += ((phase === 'rest' ? 1 : phase === 'home' ? 0.35 : phase === 'under' ? 0.25 : 0.6) - drift) * Math.min(dt * 0.25, 1);
  const dx = Math.sin(t * 0.045) * 1.2 * drift * hand, dz = Math.sin(t * 0.031) * 0.6 * drift * hand;
  camera.position.set(camP.x + dx + px * 0.25 + Math.sin(t * 0.21) * 0.035 * hand, camP.y - py * 0.1 + Math.sin(t * 0.17 + 1) * 0.025 * hand, camP.z + dz);
  look.set(camT.x + dx * 0.25 + px * 0.5, camT.y, camT.z);
  camera.lookAt(look);

  if (world) {
    // insects touching the pool; listening pulse
    if (t > nextDrop) {
      if (calm < 0.5) { const a = R() * 6.28, r = Math.sqrt(R()) * 4.4; world.water.addDrop(Math.cos(a) * r * 1.35, 1.5 + Math.sin(a) * r, 0.35 + R() * 0.5); }
      nextDrop = t + 2.2 + R() * 4.5;
    }
    if (listening && t - lastPulse > 2.4) { world.water.addDrop(pulseAt.x, pulseAt.y, 0.7); lastPulse = t; }
    world.birds.update(t, listening ? calm : 0, lineK);
    const center = (phase === 'arrive' || phase === 'rest') ? bflyArrive : bflyHome;
    world.bfly.update(t, dt, listening ? calm : 0, center, restK);
    world.squirrel.update(t, calm);
    world.ring.show.value += (((phase === 'home' && !listening) ? 1 : 0) - world.ring.show.value) * Math.min(dt * 1.5, 1);
    if (phase === 'home') {
      const v = RING_SPOT.clone().project(camera);
      const cx = (v.x * 0.5 + 0.5) * innerWidth, cy = (1 - (v.y * 0.5 + 0.5)) * innerHeight;
      const c = $('cue'); c.style.left = Math.min(Math.max(cx, 150), innerWidth - 150) + 'px'; c.style.top = Math.min(cy + 44, innerHeight - 96) + 'px';
    }
    // light: a touch dimmer while listening (≈8%), warmer and clearer when understanding
    const g = world.post.grade.uniforms;
    g.uTime.value = t; g.uWarm.value = U.uWarm.value;
    g.uExp.value = LOOK.exp * (1.0 - (listening ? calm : 0) * 0.08) * (1 + U.uWarm.value * 0.05);
    world.post.bloom.strength = LOOK.bloom * (1 - calm * 0.2 + U.uWarm.value * 0.15);
    updateAudio(camera.position);
    if (quality.tier !== 'high') { renderer.shadowMap.autoUpdate = false; if (status.frames % 2 === 0) renderer.shadowMap.needsUpdate = true; }
    world.post.composer.render(dt);
    if (first) {
      first = false;
      setTimeout(() => $('veil').classList.add('gone'), 120);
      status.ready = true;
    }
    // frame timing (for the harness and the runtime step-down)
    status.frames++;
    if (status.frames > 30) { frameTimes.push(rawDt * 1000); if (frameTimes.length > 180) frameTimes.shift(); status.avgMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length; }
    // hold the frame rate: step render resolution down when frames run long, back up when there's headroom
    if (!SHOT && frameTimes.length >= 120 && t - lastAdapt > 2.5) {
      lastAdapt = t;
      const next = status.avgMs > 18.5 ? Math.max(dprScale * 0.85, 0.6) : status.avgMs < 12 ? Math.min(dprScale / 0.85, 1) : dprScale;
      if (next !== dprScale && Math.abs(baseDpr * next - quality.dpr) > 0.01) {
        dprScale = next; quality.dpr = Math.max(baseDpr * dprScale, 0.75); status.dpr = quality.dpr;
        frameTimes.length = 0; onResize();
      }
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- start: no gate — the valley opens straight away ---------- */
function reveal(instant) {
  const d = instant || reduced ? [0, 0, 0] : [800, 3800, 7600];
  setTimeout(() => show('mark'), d[0]);
  setTimeout(() => show('line'), d[1]);
  setTimeout(() => { show('begin'); $('sound').classList.add('on'); }, d[2]);
}
build().then(() => {
  requestAnimationFrame(frame);
  if (!SHOT) { moveStart = 0.4; reveal(false); return; }
  // screenshot harness: jump to a moment
  document.body.classList.add('shot');
  if (SHOT === 'arrival') { U.uTime.value = 1.0; moveStart = 0; reveal(true); }
  else {
    $('intro').classList.add('away'); $('begin').hidden = true;
    from = to = shots.home; camP.copy(shots.home.p); camT.copy(shots.home.t); moveStart = -99;
    arriveHome(true);
    if (SHOT === 'listen') { startListening(RING_SPOT); U.uCalm.value = 1; }
    if (SHOT === 'understand') { from = to = shots.under; U.uWarm.value = 1; lineK = 1; restK = 1; U.uCalm.value = 0.55; toUnderstanding(true); }
  }
}).catch(fail);
void poolD;
