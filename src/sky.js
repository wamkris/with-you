// Sky from the Poly Haven HDRI plate, with an analytic sun and glow; layered ridges fading into blue distance.
import * as THREE from 'three';
import { U, GLSL_COMMON, L, R, vn } from './common.js';

export async function makeSky(scene, quality, skyExp = 0.5) {
  const meta = await (await fetch('assets/sky/sky_plate.json')).json();
  const tex = await new THREE.TextureLoader().loadAsync(quality.tier === 'high' ? 'assets/sky/sky_plate.webp' : 'assets/sky/sky_plate_low.webp');
  tex.colorSpace = THREE.NoColorSpace;          // the plate stores an invertible curve, decoded in the shader
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const uniforms = Object.assign({}, U, {
    tPlate: { value: tex },
    uPlate: { value: new THREE.Vector4(meta.azSpan, meta.el0, meta.el1, meta.sunEl) },
    uRef: { value: 1.0 },
    uSkyExp: { value: 1.0 },
    uZenith: { value: L(0x5f8fc4, 0.9) },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: GLSL_COMMON + /* glsl */`
      varying vec3 vDir;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix*viewMatrix*wp; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform sampler2D tPlate; uniform vec4 uPlate; uniform float uRef; uniform float uSkyExp; uniform vec3 uZenith;
      varying vec3 vDir;
      vec3 decode(vec3 v){ vec3 l = pow(v, vec3(2.2)); return l/max(1.0-l, 0.004); }
      vec3 skyColor(vec3 dir){
        float yaw = atan(dir.x, -dir.z), el = degrees(asin(clamp(dir.y,-1.0,1.0)));
        float sunYaw = atan(uSunDir.x, -uSunDir.z), sunEl = degrees(asin(uSunDir.y));
        float dYaw = degrees(yaw - sunYaw); dYaw = mod(dYaw + 180.0, 360.0) - 180.0;
        float elP = el - (sunEl - uPlate.w);                 // shift the plate so its sun sits where ours is
        vec2 uv = vec2(0.5 + dYaw/uPlate.x, (elP - uPlate.y)/(uPlate.z - uPlate.y));
        vec3 plate = decode(texture2D(tPlate, clamp(uv, vec2(0.001), vec2(0.999))).rgb);
        // outside the plate: a plain dawn gradient
        float h = max(dir.y, 0.0);
        vec3 grad = mix(uFogCol*0.9, uZenith*uSkyExp, smoothstep(0.0, 0.5, h));
        float inU = smoothstep(0.0, 0.12, uv.x)*smoothstep(1.0, 0.88, uv.x);
        float inV = smoothstep(1.0, 0.9, uv.y);
        plate = plate/(1.0 + max(plate - 2.5, 0.0)*0.12);                        // tame the glow around the sun
        vec3 col = mix(grad, plate*uSkyExp, inU*inV);
        float lum = dot(col, vec3(0.2126,0.7152,0.0722));
        col = mix(vec3(lum), col, 1.35);                                            // the plate is pale; bring back its colour
        col *= mix(vec3(1.06,0.98,0.86), vec3(0.86,0.96,1.12), smoothstep(0.02, 0.5, dir.y)); // warm low, cooler high
        // melt into the atmosphere at the horizon so ridges and sky share one air
        float s = max(dot(dir, uSunDir), 0.0);
        vec3 haze = mix(uFogCol, uSunFog, pow(s, 6.0));
        col = mix(col, haze, 1.0 - smoothstep(-0.01, 0.07, dir.y));
        // the sun itself, and a soft glow around it
        col += uSunCol*vec3(1.0,0.85,0.62)*(pow(s, 60.0)*0.25 + pow(s, 900.0)*1.6)*uSkyExp;
        col += uSunCol*vec3(1.0,0.97,0.9)*smoothstep(0.99962, 0.99978, s)*18.0;
        // understanding: warmer, a touch clearer
        col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.9), uWarm);
        return col;
      }
      void main(){ vec3 dir = normalize(vDir); gl_FragColor = vec4(skyColor(dir), 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), mat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
  scene.add(sky);

  // Pull the fog colours from the plate itself, so the air near the ground matches the sky it sits under.
  const img = tex.image;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = Math.round(256 * img.height / img.width);
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, cv.width, cv.height);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const sample = (u, v) => {
    const x = Math.min(cv.width - 1, Math.max(0, Math.round(u * cv.width))), y = Math.min(cv.height - 1, Math.max(0, Math.round((1 - v) * cv.height)));
    const i = (y * cv.width + x) * 4, out = [];
    for (let k = 0; k < 3; k++) { const l = Math.pow(px[i + k] / 255, 2.2); out.push(l / Math.max(1 - l, 0.004)); }
    return new THREE.Color(out[0], out[1], out[2]);
  };
  const horizonV = (meta.sunEl - (meta.sunEl) + 1.5 - meta.el0) / (meta.el1 - meta.el0); // ~1.5° above the plate horizon
  const avg = (us, v) => { const c = new THREE.Color(0, 0, 0); us.forEach(u => c.add(sample(u, v))); return c.multiplyScalar(1 / us.length); };
  const vH = (meta.sunEl - 4 - meta.el0) / (meta.el1 - meta.el0);   // a few degrees under the sun's height
  const away = avg([0.08, 0.14, 0.2, 0.8, 0.86, 0.92], vH);
  const near = avg([0.47, 0.5, 0.53], vH);
  const exp = skyExp;
  U.uFogCol.value.copy(away).multiplyScalar(exp * 0.95);
  U.uSunFog.value.copy(near).multiplyScalar(exp * 0.9);
  // keep the sun-side haze warm but not blown out
  const m = Math.max(U.uSunFog.value.r, U.uSunFog.value.g, U.uSunFog.value.b);
  if (m > 3.0) U.uSunFog.value.multiplyScalar(3.0 / m);
  uniforms.uSkyExp.value = exp;
  void horizonV;

  makeRidges(scene);
  return { sky, uniforms };
}

/* ---------- ridges: forested silhouettes, each paler and bluer with distance, hazy at their feet ---------- */
function ridgedN(x) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * (1 - Math.abs(vn(x * f, 3.1 + i) * 2 - 1)); f *= 2.1; a *= 0.5; } return s; }
function makeRidges(scene) {
  const layers = [
    { z: -420, base: 20, amp: 44, sd: 11.0, col: 0x6d86a3, haze: 0.62, mist: 0.5 },
    { z: -300, base: 12, amp: 34, sd: 4.3, col: 0x566f86, haze: 0.48, mist: 0.55 },
    { z: -205, base: 6, amp: 24, sd: 7.7, col: 0x3d5566, haze: 0.34, mist: 0.6 },
  ];
  const mat = (c, haze, mist) => new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uColor: { value: L(c, 0.55) }, uHaze: { value: haze }, uMist: { value: mist } }),
    vertexShader: GLSL_COMMON + /* glsl */`
      attribute float aTop; varying vec3 vW; varying float vTop;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vTop = aTop; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform vec3 uColor; uniform float uHaze; uniform float uMist; varying vec3 vW; varying float vTop;
      void main(){
        vec3 dir = normalize(vW - cameraPosition);
        float s = max(dot(dir, uSunDir), 0.0);
        vec3 air = mix(uFogCol, uSunFog, pow(s, 5.0));
        // canopy texture: soft vertical streaks of crowns and shadow
        float tex = 0.75 + 0.35*fbm3(vec2(vW.x*0.09, vW.y*0.35)) + 0.12*vnoise(vec2(vW.x*0.6, vW.y*0.8));
        vec3 col = uColor*tex;
        // backlit ridge: the sun-side slope is a little lighter near the crest
        col += uSunCol*uColor*0.25*pow(s, 8.0)*smoothstep(0.6, 1.0, vTop);
        float h = mix(uHaze, 1.0, (1.0 - smoothstep(0.0, 0.85, vTop))*uMist);   // valley haze pools at the feet
        h = mix(h, min(h + 0.15, 1.0), uWarm*0.0);
        gl_FragColor = vec4(mix(col, air, clamp(h, 0.0, 1.0)), 1.0);
      }`,
  });
  for (const ly of layers) {
    const N = 480, pos = [], top = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const x = -1500 + 3000 * i / N;
      let y = ly.base + ly.amp * ridgedN(x * 0.0036 + ly.sd);
      y += 1.1 * (vn(x * 0.35, ly.sd) - 0.5) + 0.6 * (vn(x * 1.1, ly.sd + 3) - 0.5); // tree-line crown bumps
      const zz = ly.z + 30 * Math.sin(x * 0.006 + ly.sd);
      pos.push(x, y, zz, x, -30, zz); top.push(1, 0);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat(ly.col, ly.haze, ly.mist)); m.frustumCulled = false; m.renderOrder = -5;
    m.name = 'ridge'; scene.add(m);
  }
  void R;
}
