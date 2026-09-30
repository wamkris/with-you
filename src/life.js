// Rocks, the squirrel, birds, a butterfly, light motes and the ring of light that marks where to touch.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { H, R, U, L, patch, GLSL_COMMON, vn } from './common.js';

export const SQ_SPOT = new THREE.Vector2(-2.35, -4.95);   // far shore, reflected in the pool
export const RING_SPOT = new THREE.Vector3(0.15, 0.03, 5.2);

/* ---------- rocks (Poly Haven rock_moss_set_01) ---------- */
export async function makeRocks(scene) {
  const gltf = await new GLTFLoader().loadAsync('assets/models/rock_moss_set_01/rock_moss_set_01.gltf');
  const src = [];
  gltf.scene.traverse(o => { if (o.isMesh) src.push(o); });
  src.forEach(m => {
    m.geometry.center();
    const mt = m.material;
    mt.metalness = 0; mt.metalnessMap = null; mt.side = THREE.FrontSide;
    mt.color = new THREE.Color(0.85, 0.85, 0.8);
    patch(mt, { key: 'rock' });
  });
  const place = (i, x, z, s, sy, ry, sink = 0.35) => {
    const m = src[i % src.length].clone();
    m.scale.set(s, s * sy, s); m.rotation.y = ry;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    const y = H(x, z) - bb.min.y * s * sy - (bb.max.y - bb.min.y) * s * sy * sink;
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return y + bb.max.y * s * sy;
  };
  // the squirrel's rock by the water, then a few others along the shore and meadow
  const sqTop = place(2, SQ_SPOT.x, SQ_SPOT.y, 0.3, 0.75, 0.6, 0.3);
  place(0, 2.9, 7.4, 0.2, 0.8, 1.2, 0.45);
  place(3, -4.6, 5.4, 0.36, 0.65, 2.1, 0.45);
  place(4, 5.6, 3.9, 0.28, 0.7, 0.3, 0.45);
  place(1, -3.4, -4.8, 0.45, 0.7, 1.7, 0.4);
  place(5, 1.0, -5.2, 0.3, 0.6, 2.8, 0.45);
  place(2, 8.5, 9.5, 0.4, 0.7, 0.9, 0.45);
  place(0, -8.2, 11.5, 0.5, 0.6, 2.4, 0.5);
  const avoid = [[SQ_SPOT.x, SQ_SPOT.y, 0.9], [2.9, 7.4, 0.5], [-4.6, 5.4, 0.8], [5.6, 3.9, 0.6], [8.5, 9.5, 0.9], [-8.2, 11.5, 1.1]];
  return { sqTop, avoid };
}

/* ---------- fur: a soft silhouette and a warm backlit rim ---------- */
function furMat(hex) {
  const m = new THREE.MeshStandardMaterial({ color: L(hex), roughness: 0.9, metalness: 0, transparent: false });
  m.alphaToCoverage = true;
  return patch(m, {
    key: 'fur',
    fragment: [
      ['#include <opaque_fragment>', /* glsl */`
        {
          vec3 Vv = normalize(vViewPosition);
          float ndv = abs(dot(normal, -Vv));
          vec3 vd = normalize(vFogW - cameraPosition);
          float back = pow(max(dot(vd, uSunDir), 0.0), 2.0);
          outgoingLight += uSunCol*diffuseColor.rgb*pow(1.0 - ndv, 2.5)*(0.6 + back*3.5);
          diffuseColor.a = smoothstep(0.02, 0.28, ndv + (hash12(gl_FragCoord.xy)-0.5)*0.12);
        }
        #include <opaque_fragment>`],
    ],
  });
}

export function makeSquirrel(scene, sqTop) {
  const g = new THREE.Group();
  const fur = furMat(0x7b4526), pale = furMat(0xcfae88), dark = new THREE.MeshStandardMaterial({ color: 0x0b0907, roughness: 0.3 });
  patch(dark, { key: 'eye' });
  const sph = new THREE.SphereGeometry(1, 28, 20);
  const add = (geo, m, px, py, pz, sx, sy, sz, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.scale.set(sx, sy, sz); (parent || g).add(o); o.castShadow = true; return o; };
  // haunches, body leaning up, pale chest, forepaws held to the mouth
  add(sph, fur, 0, 0.045, -0.01, 0.062, 0.052, 0.07);
  const body = add(sph, fur, 0, 0.1, 0.012, 0.047, 0.07, 0.045); body.rotation.x = -0.35;
  add(sph, pale, 0, 0.098, 0.04, 0.026, 0.05, 0.016).rotation.x = -0.35;
  add(sph, fur, 0.028, 0.008, 0.028, 0.02, 0.009, 0.038); add(sph, fur, -0.028, 0.008, 0.028, 0.02, 0.009, 0.038);
  add(sph, fur, 0.013, 0.132, 0.055, 0.008, 0.015, 0.008); add(sph, fur, -0.013, 0.132, 0.055, 0.008, 0.015, 0.008);
  add(sph, new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.8 }), 0, 0.14, 0.066, 0.011, 0.013, 0.011);
  const head = new THREE.Group(); head.position.set(0, 0.172, 0.036); g.add(head);
  add(sph, fur, 0, 0, 0, 0.032, 0.03, 0.037, head);
  add(sph, fur, 0, -0.008, 0.032, 0.018, 0.016, 0.02, head);
  add(sph, dark, 0, -0.004, 0.051, 0.0045, 0.0035, 0.0035, head);
  const ear = new THREE.ConeGeometry(0.008, 0.03, 10);
  add(ear, fur, 0.015, 0.033, -0.008, 1, 1, 1, head).rotation.z = -0.2;
  add(ear, fur, -0.015, 0.033, -0.008, 1, 1, 1, head).rotation.z = 0.2;
  add(sph, dark, 0.022, 0.007, 0.018, 0.0062, 0.007, 0.0062, head);
  add(sph, dark, -0.022, 0.007, 0.018, 0.0062, 0.007, 0.0062, head);
  // bushy tail curling up the back
  const tail = new THREE.Group(); tail.position.set(0, 0.03, -0.058); g.add(tail);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, -0.07), new THREE.Vector3(0, 0.15, -0.1), new THREE.Vector3(0, 0.25, -0.075), new THREE.Vector3(0, 0.31, -0.015), new THREE.Vector3(0, 0.3, 0.04)]);
  const TS = 56, RS = 18, tg = new THREE.TubeGeometry(curve, TS, 1, RS, false);
  const pa = tg.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const t = i / TS; curve.getPointAt(t, c);
    const r = 0.013 + 0.038 * Math.pow(Math.sin(Math.PI * Math.min(t * 1.06, 1)), 0.6);
    for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; v.fromBufferAttribute(pa, k).sub(c).multiplyScalar(r * (1 + 0.12 * (vn(i * 0.9, j * 1.3) - 0.5))).add(c); pa.setXYZ(k, v.x, v.y, v.z); }
  }
  tg.computeVertexNormals();
  const tm = new THREE.Mesh(tg, fur); tm.castShadow = true; tail.add(tm);
  g.scale.setScalar(1.2);
  g.position.set(SQ_SPOT.x, sqTop - 0.02, SQ_SPOT.y);
  g.rotation.y = 1.25;                 // in profile, facing along the shore
  scene.add(g);
  return {
    g, head, tail,
    update(t, calm) {
      const cyc = t % 5.2, nib = cyc < 1.6 ? Math.max(0, Math.sin(t * 10)) * 0.22 : 0;
      head.rotation.x = (nib + 0.05) * (1 - calm);
      head.rotation.y = cyc >= 1.6 ? Math.sin((cyc - 1.6) * 1.2) * 0.45 * (1 - calm) : 0;
      tail.rotation.x = Math.sin(t * 0.9) * 0.05 * (1 - calm) + (cyc > 4.6 && cyc < 4.9 ? Math.sin((cyc - 4.6) * 20) * 0.15 : 0) * (1 - calm);
    },
  };
}

/* ---------- birds: a loose flock crossing the valley; one line, one direction when understanding ---------- */
export function makeBirds(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: L(0x1a1c19), roughness: 0.8, side: THREE.DoubleSide });
  patch(mat, { key: 'bird' });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.05, 0, 0, 0.05, 0.36, 0.01, -0.03, 0.36, 0.01, -0.03, 0, 0, 0.05, 0.22, 0, 0.06, 0.36, 0.01, -0.03, 0.22, 0, 0.06, 0.42, 0.0, 0.0], 3));
  wingGeo.computeVertexNormals();
  const bodyGeo = new THREE.ConeGeometry(0.04, 0.24, 6); bodyGeo.rotateX(Math.PI / 2);
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, mat));
    const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat); wr.scale.x = -1;
    g.add(wl); g.add(wr);
    g.scale.setScalar(1.1 + R() * 0.35);
    scene.add(g);
    birds.push({ g, wl, wr, o: new THREE.Vector3((R() - 0.5) * 7, (R() - 0.5) * 2.2, (R() - 0.5) * 5), line: new THREE.Vector3(-i * 1.5, -i * 0.28, i * 0.35), ph: R() * 6.28, prev: new THREE.Vector3(), cur: new THREE.Vector3() });
  }
  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), lead = new THREE.Vector3();
  return {
    birds,
    update(t, calm, lineK) {
      const lx = -52 + ((t * 4.2 + 20) % 124);
      lead.set(lx, 21 - lineK * 9.5 + Math.sin(t * 0.3) * 1.2 * (1 - lineK), -34 + Math.sin(t * 0.17) * 4);   // above the words; below the insight when in line
      birds.forEach(b => {
        tmp.copy(lead).add(b.o.clone().lerp(b.line, lineK));
        tmp.y += Math.sin(t * 0.8 + b.ph) * 0.35 * (1 - lineK) + calm * 22;
        tmp.x += Math.sin(t * 0.5 + b.ph) * 0.6 * (1 - lineK);
        if (tmp.distanceTo(b.prev) > 5) b.prev.copy(tmp).x -= 0.1;
        b.g.position.copy(tmp);
        tmp.sub(b.prev);
        if (tmp.lengthSq() > 1e-6) { look.copy(b.g.position).add(tmp); b.g.lookAt(look); }
        b.prev.copy(b.g.position);
        const flapping = Math.sin(t * 0.55 + b.ph) > -0.2;
        const f = flapping ? Math.sin(t * 10 + b.ph) * 0.8 : 0.1;
        b.wl.rotation.z = f; b.wr.rotation.z = -f;
        b.g.visible = calm < 0.97;
      });
    },
  };
}

/* ---------- butterfly ---------- */
export function makeButterfly(scene) {
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, alphaTest: 0.5 });
  patch(wm, {
    key: 'bfly',
    fragmentPars: 'varying vec2 vUv2;',
    vertexPars: 'varying vec2 vUv2;',
    vertex: [['#include <uv_vertex>', '#include <uv_vertex>\nvUv2 = uv;']],
    fragment: [['#include <map_fragment>', /* glsl */`
      vec2 p = vUv2;
      float fore = length((p - vec2(0.55,0.64))*vec2(1.0,1.55));
      float hind = length((p - vec2(0.38,0.27))*vec2(1.25,1.35));
      float d = min(fore-0.44, hind-0.3); if(d > 0.0) discard;
      vec3 c = mix(vec3(0.78,0.3,0.05), vec3(0.9,0.48,0.12), p.y);
      float vein = smoothstep(0.012, 0.0, abs(fract(atan(p.y - 0.1, p.x)*5.0) - 0.5)*0.08);
      c *= 1.0 - 0.45*vein;
      c = mix(vec3(0.05,0.035,0.025), c, smoothstep(-0.02,-0.1,d));
      float spot = step(length(p-vec2(0.8,0.78)),0.05)+step(length(p-vec2(0.68,0.86)),0.04);
      c = mix(c, vec3(0.98,0.95,0.88), clamp(spot,0.0,1.0));
      diffuseColor.rgb = pow(c, vec3(2.2));`],
      ['#include <opaque_fragment>', /* glsl */`
      { vec3 vd = normalize(vFogW - cameraPosition); float back = pow(max(dot(vd, uSunDir), 0.0), 3.0);
        outgoingLight += diffuseColor.rgb*diffuseColor.rgb*uSunCol*back*2.0; }   // light through the wing: deeper, not paler
      #include <opaque_fragment>`]],
  });
  const geo = new THREE.PlaneGeometry(0.046, 0.04); geo.translate(0.023, 0, 0);   // ~9 cm wingspan geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  const wl = new THREE.Mesh(geo, wm), wr = new THREE.Mesh(geo, wm); wr.scale.x = -1;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0x15120e }));
  body.rotation.x = Math.PI / 2;
  g.add(wl, wr, body); scene.add(g);
  const pos = new THREE.Vector3(0.4, 1.1, 12.8), prev = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3();
  // a grass stem to settle on
  const land = new THREE.Vector3(1.9, 0, 8.6); land.y = H(land.x, land.z) + 0.58;
  const stemCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(land.x - 0.12, land.y - 0.6, land.z + 0.04), new THREE.Vector3(land.x - 0.08, land.y - 0.25, land.z), new THREE.Vector3(land.x, land.y - 0.02, land.z));
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x5b5a2a, roughness: 0.85 });
  patch(stemMat, { key: 'stem' });
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 12, 0.0018, 4), stemMat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), stemMat); head.scale.set(0.006, 0.03, 0.006); head.position.set(land.x, land.y + 0.012, land.z);
  scene.add(stem, head);
  return {
    update(t, dt, calm, center, rest) {
      const wander = new THREE.Vector3(center.x + 1.4 * Math.sin(t * 0.37) + 0.5 * Math.sin(t * 1.3), center.y + 0.3 * Math.sin(t * 0.9) + 0.13 * Math.sin(t * 3.1), center.z + 1.4 * Math.sin(t * 0.23 + 1));
      const settle = Math.max(calm, rest);
      const target = wander.lerp(land, settle);
      pos.lerp(target, Math.min(dt * 2.5, 1));
      tmp.subVectors(pos, prev);
      g.position.copy(pos);
      if (tmp.lengthSq() > 1e-7 && settle < 0.9) { look.copy(pos).add(tmp); look.y = pos.y; g.lookAt(look); }
      prev.copy(pos);
      const wa = settle > 0.9 ? 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.2)) : 0.2 + 1.15 * (0.5 + 0.5 * Math.sin(t * 19));
      wl.rotation.z = wa; wr.rotation.z = -wa;
    },
  };
}

/* ---------- light motes in the sunbeams ---------- */
export function makeMotes(scene, quality) {
  const n = quality.motes, pos = [], dat = [];
  for (let i = 0; i < n; i++) { pos.push((R() * 2 - 1) * 8, 0.3 + R() * 4.5, 1 + R() * 16); dat.push(R(), 1.0 + R() * 2.0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(dat, 2));
  const uPx = { value: innerHeight * quality.dpr };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uPx }),
    vertexShader: GLSL_COMMON + /* glsl */`
      attribute vec2 aD; uniform float uPx; varying float vB;
      void main(){ vec3 p = position; float ph = aD.x*6.2832;
        p.x += sin(uTime*0.23+ph)*0.45 + uWind.x*sin(uTime*0.11+ph)*0.6; p.y += sin(uTime*0.31+ph*1.3)*0.3; p.z += cos(uTime*0.19+ph*0.7)*0.45;
        vec3 V = normalize(p-cameraPosition); vB = pow(max(dot(V,uSunDir),0.0),6.0);
        vec4 mv = viewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aD.y*0.011*uPx/-mv.z; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      varying float vB; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d);
        gl_FragColor = vec4(uSunCol*vec3(1.0,0.9,0.72)*(0.08 + vB*3.0)*a*(1.0 - uCalm*0.4), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false; scene.add(pts);
  return { pts, uPx };
}

/* ---------- where to touch: a ring of light on the water ---------- */
export function makeRing(scene) {
  const show = { value: 0 };
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uShow: show },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uShow; varying vec2 vUv;
      void main(){ float d = length(vUv-0.5)*2.0;
        float r = 0.5 + 0.035*sin(uTime*1.6);
        float band = exp(-pow((d-r)/0.028,2.0));
        float halo = exp(-pow((d-r)/0.13,2.0))*0.28;
        float f = fract(uTime*0.3);
        float outer = exp(-pow((d-(0.55+f*0.4))/0.022,2.0))*(1.0-f)*0.55;
        float a = (band + halo + outer)*uShow;
        gl_FragColor = vec4(vec3(1.0,0.88,0.68)*a*1.6, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(RING_SPOT); ring.renderOrder = 3;
  scene.add(ring);
  return { ring, show };
}
