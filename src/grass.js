// Instanced grass and reeds from real Poly Haven blades and tufts, bent by a travelling gust field.
import * as THREE from 'three';
import { H, R, reseed, fbm, poolD, patch, FOLIAGE_DIRECT, sst } from './common.js';

function cardGeometry(SEG = 4) {
  // two crossed vertical cards, SEG segments tall, so blades can bend smoothly
  const pos = [], uv = [], nrm = [], idx = [];
  for (let q = 0; q < 2; q++) {
    const base = pos.length / 3;
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG;
      for (const s of [-0.5, 0.5]) {
        if (q === 0) { pos.push(s, t, 0); nrm.push(0, 0, 1); } else { pos.push(0, t, s); nrm.push(1, 0, 0); }
        uv.push(s + 0.5, t);
      }
    }
    for (let j = 0; j < SEG; j++) { const a = base + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function grassMaterial(atlas, key, tint, trans) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0,
    color: tint,
  });
  m.alphaToCoverage = true;
  return patch(m, {
    key,
    uniforms: { uTrans: { value: trans } },
    vertexPars: /* glsl */`
      attribute vec3 aOff; attribute vec4 aP; attribute vec4 aRect;
      varying float vT; varying float vVar;`,
    vertex: [
      ['#include <beginnormal_vertex>', /* glsl */`
        float cr = cos(aP.x), sr = sin(aP.x);
        vec3 objectNormal = normalize(vec3(cr*normal.x + sr*normal.z, 0.0, -sr*normal.x + cr*normal.z)*0.35 + vec3(0.0,1.0,0.0));
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
        #endif`],
      ['#include <begin_vertex>', /* glsl */`
        float t = position.y;
        vec3 lp = vec3(position.x*aP.y, t*aP.z, position.z*aP.y);
        lp = vec3(cr*lp.x + sr*lp.z, lp.y, -sr*lp.x + cr*lp.z);
        float g = gustAt(aOff.xz);
        // a slow travelling swell and gusts that lean the grass over; no fast per-blade jitter
        float sway = sin(uTime*1.1 + aOff.x*0.35 + aOff.z*0.25)*0.07 + sin(uTime*1.7 + aP.w*20.0)*0.012 + g*0.32;
        sway *= windK();
        float b = sway*t*t*aP.z;
        lp.xz += uWind*b;
        lp.y -= 0.3*b*b/max(aP.z, 0.1);
        vec3 transformed = aOff + lp;
        vT = t; vVar = aP.w;`],
      ['#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aRect.xy + uv*aRect.zw;\n#endif'],
    ],
    fragmentPars: 'varying float vT; varying float vVar;',
    fragment: [
      ['#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        {
          float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float dry = smoothstep(0.25, 0.55, lum)*(1.0 - smoothstep(0.08, 0.25, sat));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1,0.11,0.035)*(0.7 + lum), dry*0.9);   // linear: a golden-olive, not cream
        }
        diffuseColor.rgb *= mix(vec3(0.78,0.92,0.62), vec3(1.12,1.04,0.86), vVar);
        diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(0.0, 0.55, vT));   // shade deep in the sward
        // no blade is paler than real grass: cap the albedo so nothing flashes white as it moves
        diffuseColor.rgb *= min(1.0, 0.16/max(dot(diffuseColor.rgb, vec3(0.3,0.59,0.11)), 1e-3));
        diffuseColor.a = clamp((diffuseColor.a - 0.45)/max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);`],
      ['#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + FOLIAGE_DIRECT],
      ['#include <aomap_fragment>', '#include <aomap_fragment>\n// blades scatter light; a low sun must not glint off them like wet plastic\nreflectedLight.indirectSpecular *= 0.25; reflectedLight.directSpecular *= 0.12;'],
    ],
  });
}

export function makeGrass(scene, tex, atlasRects, quality, avoid) {
  const tufts = atlasRects.filter(r => r.kind === 'tuft');
  const allBlades = atlasRects.filter(r => r.kind === 'blade');
  // mostly green blades; the pale, dry ones are a seasoning, not the meal
  const green = allBlades.filter(r => r.green === undefined || r.green > 0.02);
  const blades = green.length >= 3 ? [...green, ...green, ...green, ...allBlades.filter(r => !green.includes(r))] : allBlades;
  // prefer the green blades for the meadow; the pale/dry ones read as reeds and seed-heads
  const home = new THREE.Vector2(0, 11.2);
  reseed(6001);
  const N = quality.grass;
  const off = [], p = [], rect = [];
  let tries = 0;
  while (off.length / 3 < N && tries < N * 8) {
    tries++;
    // density falls off with distance from where the person stands
    const r = Math.pow(R(), 1.5) * 34, a = Math.PI * (0.5 + (R() - 0.5) * 1.9);
    let x = home.x + Math.cos(a) * r * 1.3, z = home.y - Math.sin(a) * r;
    if (R() < 0.12) { x = (R() * 2 - 1) * 30; z = 24 - R() * 40; }
    const y = H(x, z);
    if (y < 0.1) continue;
    if (avoid.some(o => Math.hypot(x - o[0], z - o[1]) < o[2])) continue;
    const clump = fbm(x * 0.3 + 2, z * 0.3, 3);
    if (R() > 0.3 + clump * 0.95) continue;
    const d = Math.hypot(x - home.x, z - home.y);
    if (d < 0.9) continue;
    // where the person stands the grass is short and trodden, with an open view down to the water
    let open = sst(1.2, 5.0, d);
    if (Math.abs(x - 0.3) < 3.2 && z < 11.6 && z > 5.5) open = Math.min(open, 0.25 + 0.3 * sst(2.0, 3.2, Math.abs(x - 0.3)));
    if (Math.hypot(x - 0.6, z - 8.4) < 2.2) open = Math.min(open, 0.3);
    const tuft = d > 9 ? R() < 0.85 : R() < 0.45;
    const src = tuft ? tufts[Math.floor(R() * tufts.length)] : blades[Math.floor(R() * blades.length)];
    const far = Math.max(d - 8, 0);
    let ht = tuft ? (0.32 + R() * 0.3) : (0.35 + R() * 0.4);
    ht *= (0.75 + 0.6 * clump) * (1 + far * 0.005) * (0.3 + 0.7 * open);
    const aspect = src.w / src.h * 2;                      // atlas is 2:1
    let wd = ht * aspect * (tuft ? 1.0 : 1.0);
    if (!tuft) wd = Math.max(wd, 0.03);
    off.push(x, y - (tuft ? 0.04 : 0.02), z);
    p.push(R() * 6.283, wd, ht, R());
    rect.push(src.u, src.v, src.w, src.h);
  }
  // the meadow beyond the pool: tufts only, sparser with distance, so the mid-ground reads as grass
  let fN = 0; tries = 0;
  while (fN < quality.grassFar && tries < quality.grassFar * 10) {
    tries++;
    const x = (R() * 2 - 1) * 48, z = -3 - Math.pow(R(), 1.2) * 48;
    const y = H(x, z);
    if (y < 0.12) continue;
    if (avoid.some(o => Math.hypot(x - o[0], z - o[1]) < o[2])) continue;
    const clump = fbm(x * 0.2 + 5, z * 0.2, 3);
    if (R() > 0.25 + clump * 0.9) continue;
    const src = tufts[Math.floor(R() * tufts.length)];
    const ht = (0.38 + R() * 0.3) * (0.8 + 0.5 * clump);
    off.push(x, y - 0.05, z);
    p.push(R() * 6.283, ht * src.w / src.h * 2, ht, R());
    rect.push(src.u, src.v, src.w, src.h);
    fN++;
  }
  // reeds along the shore
  const reedsN = quality.reeds;
  let n = 0; tries = 0;
  while (n < reedsN && tries < reedsN * 40) {
    tries++;
    const x = (R() * 2 - 1) * 12, z = 1.5 + (R() * 2 - 1) * 9.5;
    const y = H(x, z);
    if (y < -0.2 || y > 0.25) continue;
    if (fbm(x * 0.45 + 9, z * 0.45, 3) < 0.47) continue;
    if (Math.hypot(x - 0.15, z - 5.2) < 2.4) continue;       // keep the touch spot open
    if (x > -3.0 && x < 3.6 && z > 5.0) continue;             // and the view from where the person stands
    const reedSet = green.length >= 3 ? green : blades;   // green reeds only: pale blades flash white against the dark bank
    const src = reedSet[Math.floor(R() * reedSet.length)];
    const ht = 0.9 + R() * 0.9;
    off.push(x, y - 0.05, z);
    p.push(R() * 6.283, Math.max(ht * src.w / src.h * 2, 0.035), ht, R());
    rect.push(src.u, src.v, src.w, src.h);
    n++;
  }
  // level of detail: bending 4-segment cards near the person, single-segment cards beyond 14 m
  const lod = { near: { off: [], p: [], rect: [] }, far: { off: [], p: [], rect: [] } };
  for (let i = 0; i < off.length / 3; i++) {
    const d = Math.hypot(off[i * 3] - home.x, off[i * 3 + 2] - home.y);
    const L = d < 14 ? lod.near : lod.far;
    L.off.push(off[i * 3], off[i * 3 + 1], off[i * 3 + 2]);
    L.p.push(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]);
    L.rect.push(rect[i * 4], rect[i * 4 + 1], rect[i * 4 + 2], rect[i * 4 + 3]);
  }
  const mat = grassMaterial(tex.grass_atlas, 'grass', new THREE.Color(0.72, 0.9, 0.52), new THREE.Color(0.42, 0.55, 0.14));
  const group = new THREE.Group(); group.name = 'grass';
  let count = 0;
  for (const [name, L] of Object.entries(lod)) {
    const g = cardGeometry(name === 'near' ? 4 : 1);
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(L.off), 3));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(L.p), 4));
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(new Float32Array(L.rect), 4));
    g.instanceCount = L.off.length / 3; count += g.instanceCount;
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.name = 'grass-' + name;
    group.add(mesh);
  }
  group.userData.count = count;
  scene.add(group);
  void poolD;
  return group;
}
