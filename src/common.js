// Shared state for the valley: uniforms every shader reads, noise, the land's height, and a material patcher
// that swaps three's fog for aerial perspective and hooks up wind.
import * as THREE from 'three';

/* ---------- seeded random + value noise (JS side, matches the GLSL) ---------- */
let seed = 20260930;
export function R() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
export function reseed(s) { seed = s; }
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vn(x, y); x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s / (1 - Math.pow(0.5, o)); }
export const sst = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- the land ----------
   A still pool at (0, 1.5) in a meadow; the ground rises gently behind it into woodland and on both sides
   into low banks. Water sits at y = 0. */
export const POOL = { x: 0, z: 1.5, sx: 1.35 };
export function poolD(x, z) { const dx = (x - POOL.x) / POOL.sx, dz = z - POOL.z; return Math.sqrt(dx * dx + dz * dz); }
export function H(x, z) {
  // wobbly shoreline so the pool never reads as an ellipse
  const ang = Math.atan2(z - POOL.z, (x - POOL.x) / POOL.sx);
  const wob = 1 + 0.12 * Math.sin(ang * 3 + 1.3) + 0.07 * Math.sin(ang * 5 + 0.4) + 0.05 * (fbm(x * 0.2 + 4, z * 0.2, 3) - 0.5);
  const pd = poolD(x, z) / wob;
  const pool = sst(3.2, 7.8, pd);
  let h = -1.15 * (1 - pool) + pool * (0.22 + 0.5 * fbm(x * 0.07 + 3, z * 0.07));
  h += 0.08 * (fbm(x * 0.6, z * 0.6, 3) - 0.5) * pool;                      // small hummocks
  // low banks either side of the meadow; they open out behind the pool so the meadow runs level into the
  // woodland (otherwise, from a low eye, their rim closes the view like the lip of a bowl)
  const side = Math.max(Math.abs(x) - 11 - 6 * Math.sin(z * 0.03) * sst(-10, 5, z) - 14 * sst(-8, -40, z), 0);
  h += (6.5 * sst(0, 30, side) + side * 0.02) * (0.7 + 0.6 * fbm(x * 0.03, z * 0.03)) * (0.35 + 0.65 * sst(-45, -10, z));
  const back = Math.max(-z - 14, 0);                                          // woodland rises behind
  h += back * 0.03 + fbm(x * 0.015 + 7, z * 0.015) * back * 0.05;
  h += Math.max(z - 14, 0) * 0.05;
  // beyond the woodland the land falls away, so its far edge hides behind the nearest ridge (z ≈ -140)
  h -= 16 * sst(-112, -165, z);
  return h;
}

/* ---------- lighting & atmosphere (linear) ---------- */
export const L = (hex, m = 1) => new THREE.Color(hex).multiplyScalar(m); // THREE.Color hex input is sRGB → linear
// the sun: low, just above the far ridge, slightly right of centre (looking down -z)
export const sunDir = new THREE.Vector3(0.09, 0.124, -1).normalize();

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir },
  uSunCol: { value: L(0xffd3a1, 1) },
  uFogCol: { value: L(0xbfc9cf) },
  uSunFog: { value: L(0xf3c89a) },
  uFogDen: { value: 0.0045 },
  uFogStart: { value: 55.0 },
  uWind: { value: new THREE.Vector2(0.85, -0.4).normalize() },
  uCalm: { value: 0 },
  uWarm: { value: 0 },          // understanding moment: warmer, clearer
};

export const GLSL_COMMON = /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uFogCol; uniform vec3 uSunFog;
uniform float uFogDen; uniform float uFogStart; uniform vec2 uWind; uniform float uCalm; uniform float uWarm;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),f.x), mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),f.x), f.y); }
float fbm3(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s/0.875; }
// a gust field that travels downwind across the valley: 0 = lull, 1 = gust
float gustAt(vec2 p){ vec2 q = p*0.06 - uWind*uTime*0.32; float g = vnoise(q)*0.65 + vnoise(q*2.3+4.1)*0.35; return smoothstep(0.4,0.8,g); }
float windK(){ return mix(1.0, 0.08, uCalm); }
vec3 fogWorld(vec3 mv){ return transpose(mat3(viewMatrix)) * (mv - viewMatrix[3].xyz); }
vec3 applyFog(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition; float d = length(v); vec3 dir = v/max(d,1e-3);
  float dd = max(d - uFogStart, 0.0);
  float f = 1.0 - exp(-dd*uFogDen*(1.0 - 0.35*uWarm));
  float hf = exp(-max(wp.y + 1.0, 0.0)*0.03);
  f = clamp(f*(0.5 + 0.6*hf), 0.0, 1.0);
  float s = pow(max(dot(dir,uSunDir),0.0), 6.0);
  return mix(col, mix(uFogCol, uSunFog, s), f);
}
`;

/* ---------- material patching ----------
   Every lit material gets: the shared uniforms, aerial-perspective fog in world space, and (optionally)
   custom vertex/fragment edits. */
export function patch(material, edit = {}) {
  if (material.userData.patched) return material;    // shared materials (e.g. glTF) must only be patched once
  material.userData.patched = true;
  material.fog = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, U, edit.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vFogW;\n' + (edit.vertexPars || ''))
      .replace('#include <fog_vertex>', 'vFogW = fogWorld(mvPosition.xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + '\nvarying vec3 vFogW;\n' + (edit.fragmentPars || ''))
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vFogW);');
    if (edit.vertex) for (const [a, b] of edit.vertex) shader.vertexShader = shader.vertexShader.replace(a, b);
    if (edit.fragment) for (const [a, b] of edit.fragment) shader.fragmentShader = shader.fragmentShader.replace(a, b);
    if (prev) prev(shader, renderer);
  };
  material.customProgramCacheKey = () => (edit.key || material.uuid);
  return material;
}

/* Foliage light: soft wrap diffuse plus light transmitted through thin leaves/blades when backlit.
   Hooks RE_Direct so it uses the already-shadowed sun colour. */
export const FOLIAGE_DIRECT = /* glsl */`
uniform vec3 uTrans;
void RE_Direct_Foliage( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float back = pow( saturate( -dot( geometryViewDir, directLight.direction ) ), 3.0 );
  float thru = saturate( -dot( geometryNormal, directLight.direction ) ) * 0.25 + back * 0.7;
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uTrans * thru;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Foliage
`;

/* JS twin of the GLSL gust field, so the wind you hear follows the wind you see. */
const fract = x => x - Math.floor(x);
function hash12(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vnoiseG(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
export function gustAt(x, z) {
  const w = U.uWind.value, t = U.uTime.value;
  const qx = x * 0.06 - w.x * t * 0.32, qz = z * 0.06 - w.y * t * 0.32;
  return sst(0.4, 0.8, vnoiseG(qx, qz) * 0.65 + vnoiseG(qx * 2.3 + 4.1, qz * 2.3 + 4.1) * 0.35);
}
