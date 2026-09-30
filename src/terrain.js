// Terrain: a heightfield dense near the pool, textured by blending Poly Haven meadow, woodland floor and mud,
// with anti-tiling so no repeat pattern shows.
import * as THREE from 'three';
import { H, fbm, patch } from './common.js';

export function makeTerrain(scene, tex, quality) {
  const SX = quality.tier === 'high' ? 260 : 170, SZ = quality.tier === 'high' ? 360 : 230;
  const pos = [], idx = [];
  for (let j = 0; j <= SZ; j++) {
    const v = j / SZ, z = 60 - 250 * Math.pow(v, 1.6);   // ends at z = -190, behind the nearest ridge
    for (let i = 0; i <= SX; i++) {
      const u = (i / SX) * 2 - 1, x = Math.sign(u) * 150 * Math.pow(Math.abs(u), 1.7);
      pos.push(x, H(x, z), z);
    }
  }
  const W = SX + 1;
  // counter-clockwise seen from above (rows run toward -z), so the ground faces up
  for (let j = 0; j < SZ; j++) for (let i = 0; i < SX; i++) { const a = j * W + i; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const hi = quality.tier === 'high' ? 1 : 0;
  patch(mat, {
    key: 'terrain' + hi,
    uniforms: {
      tMeadowD: { value: tex.meadow_diff }, tMeadowN: { value: tex.meadow_nor }, tMeadowA: { value: tex.meadow_arm },
      tForestD: { value: tex.forest_diff }, tForestN: { value: tex.forest_nor }, tForestA: { value: tex.forest_arm },
      tMudD: { value: tex.mud_diff }, tMudN: { value: tex.mud_nor }, tMudA: { value: tex.mud_arm },
    },
    // large-scale noise is smooth enough to evaluate per vertex; only the fine shoreline breakup stays per pixel
    vertexPars: 'varying vec3 vW; varying vec3 vWN; varying vec4 vNz;',
    vertex: [['#include <worldpos_vertex>', `#include <worldpos_vertex>
      vW = (modelMatrix*vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);
      vNz = vec4(smoothstep(0.3, 0.7, fbm3(vW.xz*0.09)), fbm3(vW.xz*0.035 + 11.0), fbm3(vW.xz*0.05 + 3.0), fbm3(vW.xz*0.22)*0.6 + fbm3(vW.xz*0.07 + 3.0)*0.4);`]],
    fragmentPars: /* glsl */`
      #define HI ${hi}
      varying vec3 vW; varying vec3 vWN; varying vec4 vNz;
      uniform sampler2D tMeadowD, tMeadowN, tMeadowA, tForestD, tForestN, tForestA, tMudD, tMudN, tMudA;
      // two differently scaled + rotated samples, blended by noise, to hide tiling
      vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
      void tri(sampler2D d, sampler2D n, sampler2D a, vec2 p, float k, float w, inout vec3 D, inout vec3 N, inout vec3 A){
        vec2 u1 = p;
        vec3 d1 = texture2D(d,u1).rgb, n1 = texture2D(n,u1).xyz, a1 = texture2D(a,u1).rgb;
        #if HI
        vec2 u2 = rot(p*0.43 + 7.3, 1.1);
        vec3 d2 = texture2D(d,u2).rgb, n2 = texture2D(n,u2).xyz, a2 = texture2D(a,u2).rgb;
        d1 = mix(d1,d2,k); n1 = mix(n1,n2,k); a1 = mix(a1,a2,k);
        #endif
        D += d1*w; N += n1*w; A += a1*w;
      }`,
    fragment: [
      ['#include <map_fragment>', /* glsl */`
        vec2 wp = vW.xz;
        float nk = vNz.x, big = vNz.y;
        float dist = length(vW - cameraPosition);
        float far = smoothstep(60.0, 140.0, dist)*smoothstep(-95.0, -120.0, vW.z);
        float hN = vW.y + (fbm3(wp*0.8)-0.5)*0.22;
        float wMud = 1.0 - smoothstep(0.04, 0.36, hN);
        float wFor = smoothstep(-9.0, -20.0, vW.z + (big-0.5)*14.0) + smoothstep(0.62, 0.8, vNz.z)*0.6;
        wFor = clamp(wFor, 0.0, 1.0)*(1.0 - wMud);
        float wMea = max(1.0 - wMud - wFor, 0.0);
        // sample only the layers that contribute here (regions are coherent, so the branches are cheap)
        vec3 alb = vec3(0.0), nrm = vec3(0.0), arm = vec3(0.0);
        if (far < 0.99) {
          if (wMea > 0.004) tri(tMeadowD,tMeadowN,tMeadowA, wp/2.6, nk, wMea, alb,nrm,arm);
          if (wFor > 0.004) tri(tForestD,tForestN,tForestA, wp/2.2, nk, wFor, alb,nrm,arm);
          if (wMud > 0.004) tri(tMudD,tMudN,tMudA, wp/1.8, nk, wMud, alb,nrm,arm);
        } else { alb = vec3(0.2,0.2,0.12); nrm = vec3(0.5,0.5,1.0); arm = vec3(1.0,0.95,0.0); }
        vec3 mD = alb;
        // meadow sits under grass: a little greener and darker; large-scale colour drift so it never looks uniform
        alb *= mix(vec3(0.46,0.56,0.34), vec3(0.8), wMud + wFor);
        alb *= 0.8 + 0.4*big;
        // wet band at the waterline
        float wet = 1.0 - smoothstep(0.0, 0.22, vW.y);
        alb *= mix(1.0, 0.55, wet);
        // beyond the instanced grass, the meadow reads as a fine sward: settle toward grass green, keep a little texture
        float sward = smoothstep(18.0, 40.0, dist)*wMea;
        alb = mix(alb, mix(vec3(0.075,0.1,0.035), vec3(0.14,0.15,0.06), big)*(0.85 + 0.3*dot(mD, vec3(0.33))), sward*0.75);
        vec3 canopy = mix(vec3(0.035,0.05,0.025), vec3(0.11,0.13,0.05), smoothstep(0.3, 0.75, vNz.w));
        alb = mix(alb, canopy, far*0.85);
        diffuseColor.rgb *= alb;
        float splatAO = mix(arm.r, 1.0, far);
        // matte ground: no grazing sheen from the bright sky; only the very edge of the water glistens
        float splatRough = mix(max(arm.g, 0.9), 0.55, (1.0 - smoothstep(0.0, 0.08, vW.y))*0.8);`],
      ['#include <roughnessmap_fragment>', 'float roughnessFactor = splatRough;'],
      ['#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;'],
      ['#include <normal_fragment_maps>', /* glsl */`
        {
          vec3 tn = nrm*2.0 - 1.0; tn.xy *= 1.2;
          vec3 Nw = normalize(vWN);
          vec3 T = normalize(vec3(1.0,0.0,0.0) - Nw*Nw.x);
          vec3 B = normalize(cross(Nw, T));
          vec3 nw = normalize(T*tn.x - B*tn.y + Nw*tn.z);
          normal = normalize(mat3(viewMatrix)*nw);
        }`],
      ['#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= splatAO; reflectedLight.directDiffuse *= mix(1.0, splatAO, 0.5);\n// soil and leaf litter scatter; they must not mirror the sky at grazing angles\nfloat wetK = 1.0 - smoothstep(0.0, 0.08, vW.y);\nreflectedLight.indirectSpecular *= splatAO*mix(0.06, 0.6, wetK); reflectedLight.directSpecular *= mix(0.25, 1.0, wetK);'],
    ],
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh);
  void fbm;
  return mesh;
}
