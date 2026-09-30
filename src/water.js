// The pool: planar reflection, normal-mapped ripples, Fresnel, sun glints, gust patches, touch rings.
// Clipped to the real shoreline via a baked height texture, so no rectangle ever shows.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { H, U, GLSL_COMMON, L } from './common.js';

// A tileable ripple normal map, baked once from a few layers of waves.
function rippleNormals(size = 256) {
  const hgt = new Float32Array(size * size);
  const waves = [];
  let s = 17;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 28; i++) {
    const kx = Math.round((rnd() * 2 - 1) * (2 + i * 0.7)), ky = Math.round((rnd() * 2 - 1) * (2 + i * 0.7));
    waves.push([kx, ky, rnd() * 6.283, 1 / (1 + Math.hypot(kx, ky) * 0.6)]);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0;
    for (const [kx, ky, ph, a] of waves) h += a * Math.sin(2 * Math.PI * (kx * x + ky * y) / size + ph);
    hgt[y * size + x] = h;
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = hgt[y * size + (x + 1) % size] - hgt[y * size + (x - 1 + size) % size];
    const hy = hgt[((y + 1) % size) * size + x] - hgt[((y - 1 + size) % size) * size + x];
    const n = new THREE.Vector3(-hx * 0.35, -hy * 0.35, 1).normalize();
    const i = (y * size + x) * 4;
    data[i] = (n.x * 0.5 + 0.5) * 255; data[i + 1] = (n.y * 0.5 + 0.5) * 255; data[i + 2] = (n.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// water extent (world): x ∈ [-13, 13], z ∈ [-9, 12]
const X0 = -13, X1 = 13, Z0 = -9, Z1 = 12;
function heightTexture(n = 192) {
  // half float: linearly filterable on every WebGL2 phone (full float is not on iOS)
  const data = new Uint16Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = X0 + (X1 - X0) * (i + 0.5) / n, z = Z0 + (Z1 - Z0) * (j + 0.5) / n;
    data[j * n + i] = THREE.DataUtils.toHalfFloat(H(x, z));
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function makeWater(scene, quality, camera) {
  const drops = { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) };
  let dropI = 0;
  const shader = {
    name: 'Pool',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
    vertexShader: GLSL_COMMON + /* glsl */`
      uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vW;
      void main(){ vUvR = textureMatrix*vec4(position,1.0); vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform sampler2D tDiffuse; uniform vec3 color; uniform sampler2D tNormal; uniform sampler2D tHeight; uniform vec4 uBounds;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec4 uDrops[6]; uniform vec3 uSkyTint;
      varying vec4 vUvR; varying vec3 vW;
      vec2 drops(vec2 p){
        vec2 g = vec2(0.0);
        for(int i=0;i<6;i++){ vec4 d = uDrops[i]; float age = uTime - d.z;
          if(age > 0.0 && age < 8.0){ vec2 dv = p - d.xy; float r = length(dv); float x = r - age*0.5;
            float a = cos(x*24.0)*exp(-x*x*10.0)*exp(-age*0.5)*0.12*d.w/(1.0 + r*1.2);
            g += a*dv/max(r, 1e-3); } }
        return g;
      }
      void main(){
        vec2 hu = (vW.xz - uBounds.xy)/uBounds.zw;
        float ground = texture2D(tHeight, hu).r;
        float depth = -ground;                        // water surface is y = 0
        if(depth < -0.02) discard;
        vec2 p = vW.xz;
        float k = windK();
        float gust = gustAt(p*1.25)*(1.0 - uCalm);
        // two scrolling ripple layers + fine gust chop; glassy when calm
        vec3 n1 = texture2D(tNormal, p*0.11 + uWind*uTime*0.012).xyz*2.0 - 1.0;
        vec3 n2 = texture2D(tNormal, p*0.23 - vec2(uWind.y, -uWind.x)*uTime*0.017 + 0.37).xyz*2.0 - 1.0;
        vec3 n3 = texture2D(tNormal, p*0.9 + uWind*uTime*0.09).xyz*2.0 - 1.0;
        vec2 slope = (n1.xy*0.5 + n2.xy*0.35)*0.22*mix(1.0, 0.18, uCalm) + n3.xy*0.55*gust;
        slope += drops(p);
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 V = normalize(cameraPosition - vW);
        // reflection, distorted by the ripples; gusts scatter it (darker, rougher patches)
        vec2 ruv = vUvR.xy/vUvR.w + n.xz*vec2(0.9, 0.5)*0.12;
        vec3 refl = texture2D(tDiffuse, ruv).rgb;
        vec3 reflB = texture2D(tDiffuse, ruv + n.xz*0.06).rgb*0.5 + texture2D(tDiffuse, ruv - n.xz*0.05).rgb*0.5;
        refl = mix(refl, reflB*0.72, clamp(gust*1.2, 0.0, 0.85));
        float cosT = max(dot(V, n), 0.0);
        float F = 0.02 + 0.98*pow(1.0 - cosT, 5.0);
        F = mix(F, 1.0, 0.35);                          // a still pool reads as a mirror from a low eye
        F *= 1.0 - gust*0.25;
        // the body of the water: peaty, with the mud bottom showing at the edge
        float T = exp(-max(depth, 0.0)*3.2);
        vec3 body = mix(uDeep, uShallow, T)*(uSunCol*0.12 + vec3(0.08));
        // sun glints
        vec3 Hh = normalize(uSunDir + V);
        float spec = pow(max(dot(n, Hh), 0.0), 1400.0)*30.0 + pow(max(dot(n, Hh), 0.0), 160.0)*0.25;
        vec3 col = refl*F + body*(1.0 - F)*(1.0 - T);
        col += uSunCol*spec*(1.0 - uCalm*0.4);
        // blend so the bottom shows through in the shallows, and the edge fades to nothing
        float edge = smoothstep(-0.02, 0.05, depth);
        float alpha = (1.0 - (1.0 - F)*T)*edge;
        col = col/max(alpha, 1e-3)*edge;
        gl_FragColor = vec4(applyFog(col, vW), alpha);
      }`,
  };
  const w = Math.floor(innerWidth * quality.dpr * quality.reflScale), h = Math.floor(innerHeight * quality.dpr * quality.reflScale);
  const water = new Reflector(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), {
    clipBias: 0.002, textureWidth: w, textureHeight: h, color: 0xffffff, shader, multisample: quality.tier === 'low' ? 0 : 4,
  });
  const rt = water.getRenderTarget();
  rt.texture.minFilter = THREE.LinearFilter;
  water.rotation.x = -Math.PI / 2;
  water.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const mu = water.material.uniforms;
  Object.keys(U).forEach(k => { mu[k] = U[k]; });
  mu.tNormal = { value: rippleNormals() };
  mu.tHeight = { value: heightTexture() };
  mu.uBounds = { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) };
  mu.uDeep = { value: L(0x16211c, 1) };
  mu.uShallow = { value: L(0x4a4130, 1) };
  mu.uSkyTint = { value: new THREE.Color(1, 1, 1) };
  mu.uDrops = drops;
  // the height texture's v runs with +z; flip because PlaneGeometry was rotated
  water.material.transparent = true;
  water.material.depthWrite = false;
  water.renderOrder = 2;
  scene.add(water);

  // skip the costliest things in the mirror: near grass and motes barely show in a low reflection
  const hideInMirror = [];
  const orig = water.onBeforeRender;
  water.onBeforeRender = function (renderer, sc, cam) {
    const vis = hideInMirror.map(o => o.visible);
    hideInMirror.forEach(o => { o.visible = false; });
    orig.call(this, renderer, sc, cam);
    hideInMirror.forEach((o, i) => { o.visible = vis[i]; });
  };
  function addDrop(x, z, s) { drops.value[dropI].set(x, z, U.uTime.value, s); dropI = (dropI + 1) % 6; }
  function resize(W, Hh) { rt.setSize(Math.floor(W * quality.dpr * quality.reflScale), Math.floor(Hh * quality.dpr * quality.reflScale)); }
  void camera;
  return { water, addDrop, hideInMirror, resize, inPool: (x, z) => H(x, z) < -0.05 };
}
