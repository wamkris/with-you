// Broadleaf trees: a trunk that forks into limbs and twigs (oak bark from Poly Haven), crowned with
// alpha-tested cards cut from real leaf photos. Everything merges into two draw calls.
import * as THREE from 'three';
import { H, R, reseed, patch, FOLIAGE_DIRECT } from './common.js';

const UP = new THREE.Vector3(0, 1, 0);

// One tree's skeleton → bark geometry (tapered tubes) + leaf cards.
function grow(tree, out, detail) {
  const { x, z, height, spread, species } = tree;
  const y0 = H(x, z) - 0.2;
  const base = new THREE.Vector3(x, y0, z);
  const radial = detail.radial, segLen = detail.segLen;
  const crownC = new THREE.Vector3(x, y0 + height * 0.68, z);

  function tube(points, radii, wind) {
    // parallel-transport frames along the polyline
    const n = points.length, rings = [];
    let normal = new THREE.Vector3(1, 0, 0), vlen = 0;
    for (let i = 0; i < n; i++) {
      const tng = (i < n - 1 ? points[i + 1].clone().sub(points[i]) : points[i].clone().sub(points[i - 1])).normalize();
      normal = normal.clone().sub(tng.clone().multiplyScalar(normal.dot(tng)));
      if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3(0, 0, 1).cross(tng);
      normal.normalize();
      const bin = tng.clone().cross(normal);
      if (i > 0) vlen += points[i].distanceTo(points[i - 1]);
      rings.push({ p: points[i], n: normal.clone(), b: bin, r: radii[i], v: vlen });
    }
    const start = out.bark.pos.length / 3;
    const circ = 2 * Math.PI * radii[0];
    const uRep = Math.max(1, Math.round(circ / 0.9));
    for (const ring of rings) {
      for (let k = 0; k <= radial; k++) {
        const a = k / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nx = ring.n.x * c + ring.b.x * s, ny = ring.n.y * c + ring.b.y * s, nz = ring.n.z * c + ring.b.z * s;
        // flare at the root
        out.bark.pos.push(ring.p.x + nx * ring.r, ring.p.y + ny * ring.r, ring.p.z + nz * ring.r);
        out.bark.nrm.push(nx, ny, nz);
        out.bark.uv.push(k / radial * uRep, ring.v / 0.9);
        out.bark.wind.push(x, y0, z, height);
        out.bark.flex.push(wind);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) {
      const a = start + i * (radial + 1) + k, b = a + radial + 1;
      out.bark.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  function leafCard(p, dirHint, size) {
    // orient the card: face roughly outward from the crown, twig axis pointing out/up
    const out_ = p.clone().sub(crownC); out_.y *= 0.6; out_.normalize();
    const nrm = out_.clone().add(new THREE.Vector3((R() - 0.5) * 1.4, (R() - 0.3) * 0.9, (R() - 0.5) * 1.4)).normalize();
    let up = dirHint.clone().add(new THREE.Vector3(0, 0.4, 0)).normalize();
    up.sub(nrm.clone().multiplyScalar(up.dot(nrm))).normalize();
    if (up.lengthSq() < 1e-4) up = new THREE.Vector3(0, 1, 0);
    const right = up.clone().cross(nrm).normalize();
    const w = size * (0.85 + R() * 0.3), h = size;
    const cell = Math.floor(R() * 4), cu = (cell % 2) * 0.5, cv = Math.floor(cell / 2) * 0.5;
    const start = out.leaf.pos.length / 3;
    // shading normal: mostly the crown's sphere normal, so the canopy lights as a volume
    const sn = p.clone().sub(crownC).normalize().multiplyScalar(0.75).add(nrm.clone().multiplyScalar(0.25)).normalize();
    const corners = [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]];
    const flex = Math.min(Math.max((p.y - y0) / height, 0), 1.3);
    for (const [cx, cy] of corners) {
      const q = p.clone().addScaledVector(right, cx * w).addScaledVector(up, (cy - 0.15) * h);
      out.leaf.pos.push(q.x, q.y, q.z);
      out.leaf.nrm.push(sn.x, sn.y, sn.z);
      out.leaf.uv.push(cu + (cx + 0.5) * 0.5, cv + cy * 0.5);
      out.leaf.wind.push(x, y0, z, height);
      out.leaf.flex.push(flex, R());
    }
    out.leaf.idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }

  // recursive branching
  function branch(start, dir, len, r0, depth, maxDepth) {
    const nSeg = Math.max(2, Math.ceil(len / segLen));
    const pts = [start.clone()], radii = [r0];
    const d = dir.clone();
    const p = start.clone();
    const r1 = r0 * (depth === 0 ? 0.32 : 0.28);
    for (let i = 1; i <= nSeg; i++) {
      const t = i / nSeg;
      // wander + reach for light (up) + a little droop for long outer limbs
      d.add(new THREE.Vector3((R() - 0.5) * 0.28, (R() - 0.5) * 0.12, (R() - 0.5) * 0.28));
      d.y += (species.phototropism - (depth >= 2 ? species.droop * t : 0)) * 0.12;
      d.normalize();
      p.addScaledVector(d, len / nSeg);
      pts.push(p.clone());
      radii.push(r0 + (r1 - r0) * Math.pow(t, 0.8));
    }
    if (depth === 0) { // root flare
      for (let i = 0; i < 2 && i < radii.length; i++) radii[i] *= i === 0 ? 1.55 : 1.15;
    }
    if (depth <= (detail.barkDepth ?? 9)) tube(pts, radii, depth);   // distant twigs are hidden in the leaves: skip their bark

    if (depth >= maxDepth) {
      // leaves along the twig tip
      const nL = Math.round(species.leavesPerTwig * detail.leafMul);
      for (let k = 0; k < nL; k++) {
        const t = 0.35 + 0.65 * R();
        const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const q = pts[i].clone().add(new THREE.Vector3((R() - 0.5) * 0.9, (R() - 0.4) * 0.7, (R() - 0.5) * 0.9));
        leafCard(q, d, species.leafSize * detail.leafSize * (0.8 + R() * 0.45));
      }
      return;
    }
    const kids = depth === 0 ? species.limbs + Math.floor(R() * 2) : species.twigs + Math.floor(R() * 2);
    for (let k = 0; k < kids; k++) {
      const t = depth === 0 ? species.forkAt + (1 - species.forkAt) * (k / kids) * 0.85 + R() * 0.05 : 0.3 + 0.65 * (k + R()) / kids;
      const i = Math.min(pts.length - 1, Math.max(1, Math.round(t * (pts.length - 1))));
      const az = k * 2.39996 + R() * 0.8;
      const tilt = (depth === 0 ? species.limbAngle : species.twigAngle) * (0.75 + R() * 0.5);
      // child direction: rotate the parent axis by tilt around a random perpendicular
      const perp = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      perp.sub(d.clone().multiplyScalar(perp.dot(d))).normalize();
      const cd = d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(perp, Math.sin(tilt)).normalize();
      const cl = len * (depth === 0 ? species.limbLen : species.twigLen) * (0.75 + R() * 0.45) * (1 - t * 0.35);
      const cr = radii[i] * (depth === 0 ? 0.62 : 0.55);
      branch(pts[i], cd, cl, cr, depth + 1, maxDepth);
    }
    // the leader keeps going a little past the last fork, with a tuft of leaves
    if (depth >= maxDepth - 1) {
      for (let k = 0; k < Math.round(species.leavesPerTwig * 0.6 * detail.leafMul); k++) {
        const q = pts[pts.length - 1].clone().add(new THREE.Vector3((R() - 0.5) * 1.1, (R() - 0.3) * 0.8, (R() - 0.5) * 1.1));
        leafCard(q, d, species.leafSize * detail.leafSize * (0.8 + R() * 0.4));
      }
    }
  }

  const lean = new THREE.Vector3((R() - 0.5) * 0.18, 1, (R() - 0.5) * 0.18).normalize();
  const trunkLen = height * species.trunk;
  const r0 = height * species.girth * spread / 4;
  branch(base, lean, trunkLen, r0, 0, detail.depth);
  void UP;
}

export const SPECIES = {
  oak: { trunk: 0.46, girth: 0.042, limbs: 4, twigs: 3, forkAt: 0.55, limbAngle: 0.78, twigAngle: 0.7, limbLen: 0.95, twigLen: 0.55, phototropism: 0.35, droop: 0.45, leavesPerTwig: 7, leafSize: 1.0 },
  alder: { trunk: 0.62, girth: 0.03, limbs: 5, twigs: 3, forkAt: 0.35, limbAngle: 0.6, twigAngle: 0.65, limbLen: 0.6, twigLen: 0.5, phototropism: 0.55, droop: 0.2, leavesPerTwig: 6, leafSize: 0.85 },
  // woodland trees grow crowns that reach lower, shoulder to shoulder
  wood: { trunk: 0.3, girth: 0.036, limbs: 5, twigs: 3, forkAt: 0.3, limbAngle: 0.85, twigAngle: 0.75, limbLen: 0.8, twigLen: 0.55, phototropism: 0.4, droop: 0.35, leavesPerTwig: 8, leafSize: 1.0 },
  // hazel/hawthorn-like shrubs: many stems from low down, dense leaves
  shrub: { trunk: 0.12, girth: 0.05, limbs: 5, twigs: 3, forkAt: 0.1, limbAngle: 0.95, twigAngle: 0.8, limbLen: 1.6, twigLen: 0.6, phototropism: 0.3, droop: 0.25, leavesPerTwig: 7, leafSize: 0.55 },
};

function windMaterial(base, key, extra, isLeaf) {
  return patch(base, {
    key,
    uniforms: extra.uniforms,
    vertexPars: /* glsl */`
      attribute vec4 aWind; attribute ${isLeaf ? 'vec2' : 'float'} aFlex;
      ${isLeaf ? 'varying float vRnd; varying float vOut;' : ''}
      vec3 treeSway(vec3 wp){
        float h = aWind.w; vec3 base = aWind.xyz;
        float r = clamp((wp.y - base.y)/h, 0.0, 1.3);
        float ph = hash12(base.xz)*6.2832;
        float g = gustAt(base.xz);
        float slow = sin(uTime*0.5 + ph)*0.6 + sin(uTime*0.21 + ph*1.7)*0.4;
        float disp = (0.05 + slow*0.05 + g*0.26) * r*r * h * 0.1 * windK();
        vec3 o = vec3(uWind.x, 0.0, uWind.y)*disp;
        o.y -= disp*disp*0.08;
        return o;
      }`,
    vertex: [
      ['#include <begin_vertex>', /* glsl */`
        vec3 transformed = vec3(position);
        transformed += treeSway(transformed);
        ${isLeaf ? `
        float fl = sin(uTime*(3.5 + aFlex.y*3.0) + aFlex.y*40.0);
        float gg = gustAt(aWind.xz);
        transformed += normal*fl*0.05*(0.3 + gg)*windK()*aFlex.x;
        vRnd = aFlex.y; vOut = clamp(dot(normal, normalize(position - vec3(aWind.x, aWind.y + aWind.w*0.68, aWind.z))), 0.0, 1.0);` : ''}`],
    ],
    fragmentPars: (isLeaf ? 'varying float vRnd; varying float vOut;\n' : '') + (extra.fragmentPars || ''),
    fragment: extra.fragment || [],
  });
}

export function makeTrees(scene, tex, quality) {
  // Composition: the sky above the words stays open. Near trees frame the right edge (desktop) and stand
  // off to the sides, casting long dawn shadows across the meadow; the woodland keeps a gap toward the sun.
  const near = [
    // x, z, height, spread, species
    [9.8, -7.0, 11, 1.05, 'oak'], [13.5, -15, 12.5, 1.1, 'oak'], [16.5, -2.0, 10.5, 1.0, 'alder'], [12.5, 7.5, 9.5, 1.0, 'oak'],
    [-32, 2, 11, 1.05, 'oak'], [-34, -10, 10, 1.0, 'alder'], [-28, 12, 9, 0.95, 'alder'], [-38, -20, 11.5, 1.0, 'oak'],
  ];
  const newOut = () => ({ bark: { pos: [], nrm: [], uv: [], wind: [], flex: [], idx: [] }, leaf: { pos: [], nrm: [], uv: [], wind: [], flex: [], idx: [] } });
  // three groups so each can be treated differently: near trees, woodland (casts shadows), far canopy (no shadows)
  const outs = { near: newOut(), wood: newOut(), canopy: newOut() };
  const nearDetail = { radial: quality.tier === 'high' ? 10 : 7, segLen: 0.6, depth: 3, leafMul: quality.leafMul * 1.9, leafSize: 0.7, barkDepth: 3 };
  const farDetail = { radial: 5, segLen: 1.2, depth: 3, leafMul: quality.leafMul * 0.9, leafSize: 1.45, barkDepth: 1 };
  const shrubDetail = { radial: 4, segLen: 0.5, depth: 2, leafMul: quality.leafMul, leafSize: 1.0, barkDepth: 1 };
  const canopyDetail = { radial: 4, segLen: 2.0, depth: 2, leafMul: quality.leafMul * 0.9, leafSize: 2.8, barkDepth: 0 };
  // tallest a tree at (x, z) may be and still sit below ~9° from the speaking spot (eye ≈ 1.6 m at z = 11.2)
  const capHeight = (x, z) => 1.6 + Math.tan(9 * Math.PI / 180) * Math.hypot(x, z - 11.2) - H(x, z);
  const avoid = [];
  for (const [i, t] of near.entries()) {
    reseed(1000 + i);                       // each tree has its own stream, so tuning one never reshuffles the rest
    grow({ x: t[0], z: t[1], height: t[2], spread: t[3], species: SPECIES[t[4]] }, outs.near, nearDetail);
    avoid.push([t[0], t[1], 1.0]);
  }
  // the woodland beyond: many trees, less detail, never on a grid
  const placed = near.map(t => [t[0], t[1]]);
  reseed(2001);
  let n = 0, tries = 0;
  while (n < quality.farTrees && tries < 12000) {
    tries++;
    const x = (R() * 2 - 1) * 95, z = -34 - Math.pow(R(), 0.8) * 80;
    // a notch toward the sun so its light comes through the treeline
    if (x > -3 && x < 9 && z > -75) continue;
    const minD = 2.6 + (-z - 34) * 0.03;
    if (placed.some(q => Math.hypot(q[0] - x, q[1] - z) < minD)) continue;
    // keep every crown below ~9° as seen from where the person stands, so the words always sit on sky
    const cap = capHeight(x, z);
    if (cap < 5) continue;
    placed.push([x, z]); n++;
    grow({ x, z, height: Math.min(8.5 + R() * 4.5, cap), spread: 1.15, species: R() < 0.75 ? SPECIES.wood : SPECIES.alder }, outs.wood, farDetail);
    // understory, so the woodland edge is a wall of leaves rather than a row of trunks
    for (let u = 0; u < 2; u++) {
      const ux = x + (R() - 0.5) * 6, uz = z + 2 + R() * 3;
      grow({ x: ux, z: uz, height: 2.5 + R() * 2.2, spread: 1, species: SPECIES.shrub }, outs.wood, shrubDetail);
    }
  }
  // forest on the far slopes: many simple crowns, read as canopy texture through the haze
  reseed(3001);
  let cN = 0; tries = 0;
  while (cN < quality.canopyTrees && tries < quality.canopyTrees * 20) {
    tries++;
    const x = (R() * 2 - 1) * 160, z = -112 - R() * 70;
    if (placed.some(q => Math.hypot(q[0] - x, q[1] - z) < 5.5)) continue;
    const cap = capHeight(x, z);
    if (cap < 6) continue;
    placed.push([x, z]); cN++;
    grow({ x, z, height: Math.min(9 + R() * 5, cap), spread: 1.3, species: SPECIES.wood }, outs.canopy, canopyDetail);
  }
  // shrubs scattered across the meadow beyond the pool: low, so the sky above the words stays open
  reseed(4001);
  let sN = 0; tries = 0;
  while (sN < quality.shrubs && tries < 3000) {
    tries++;
    const x = (R() * 2 - 1) * 42, z = -8 - R() * 34;
    if (H(x, z) < 0.3) continue;
    if (placed.some(q => Math.hypot(q[0] - x, q[1] - z) < 3.5)) continue;
    placed.push([x, z]); sN++;
    grow({ x, z, height: 1.6 + R() * 2.2, spread: 1, species: SPECIES.shrub }, outs.wood, shrubDetail);
    avoid.push([x, z, 1.2]);
  }
  // woodland edge on the flanks, framing the meadow
  reseed(5001);
  for (let k = 0; k < quality.flankTrees; k++) {
    const side = k % 2 ? 1 : -1;
    const x = side * (19 + R() * 22), z = 16 - R() * 38;
    if (side < 0 && (z < 0 || x > -26)) continue;
    if (placed.some(q => Math.hypot(q[0] - x, q[1] - z) < 4)) continue;
    placed.push([x, z]);
    grow({ x, z, height: 9 + R() * 6, spread: 1, species: R() < 0.5 ? SPECIES.oak : SPECIES.alder }, outs.wood, farDetail);
  }

  const barkGeo = out => {
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(out.bark.pos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(out.bark.nrm, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(out.bark.uv, 2));
  bg.setAttribute('aWind', new THREE.Float32BufferAttribute(out.bark.wind, 4));
  bg.setAttribute('aFlex', new THREE.Float32BufferAttribute(out.bark.flex, 1));
  bg.setIndex(out.bark.idx);
  return bg;
  };
  const barkMat = windMaterial(new THREE.MeshStandardMaterial({
    map: tex.bark_diff, normalMap: tex.bark_nor, roughnessMap: tex.bark_arm, aoMap: tex.bark_arm,
    roughness: 1, metalness: 0, color: new THREE.Color(0.95, 0.9, 0.85), normalScale: new THREE.Vector2(1.3, 1.3),
  }), 'bark', {}, false);

  const leafGeo = out => {
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(out.leaf.pos, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(out.leaf.nrm, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(out.leaf.uv, 2));
  lg.setAttribute('aWind', new THREE.Float32BufferAttribute(out.leaf.wind, 4));
  lg.setAttribute('aFlex', new THREE.Float32BufferAttribute(out.leaf.flex, 2));
  lg.setIndex(out.leaf.idx);
  return lg;
  };
  const leafBase = new THREE.MeshStandardMaterial({
    map: tex.leaf_atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78, metalness: 0,
    color: new THREE.Color(1.0, 1.0, 0.78),
  });
  leafBase.alphaToCoverage = true;
  const leafMat = windMaterial(leafBase, 'leaf', {
    uniforms: { uTrans: { value: new THREE.Color(0.95, 0.9, 0.35) } },
    fragment: [
      ['#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        // warm the photo leaves toward a dawn woodland green, varied per card; inner crown is darker
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.15,1.05,0.55), 0.55);
        diffuseColor.rgb *= mix(vec3(0.8,0.95,0.7), vec3(1.1,1.02,0.8), vRnd);
        diffuseColor.rgb *= mix(0.45, 1.0, vOut);
        // far away the mips average alpha across the whole card; an irregular rounded mask inside each atlas
        // cell keeps any card from ever rendering as a rectangle
        {
          vec2 cu = fract(vMapUv*2.0) - 0.5;
          float r = length(cu*vec2(1.0, 0.9)) + (vnoise(cu*7.0 + vRnd*31.0) - 0.5)*0.16;
          diffuseColor.a *= 1.0 - smoothstep(0.3, 0.47, r);
        }
        diffuseColor.a =clamp((diffuseColor.a - 0.45)/max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);`],
      ['#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + FOLIAGE_DIRECT],
      ['#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectSpecular *= 0.3; reflectedLight.directSpecular *= 0.3;'],
    ],
  }, true);
  // shadows from the leaf cards follow their cut-out shape
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex.leaf_atlas, alphaTest: 0.45 });
  const group = new THREE.Group(); group.name = 'trees';
  const stats = { barkVerts: 0, leafCards: 0 };
  for (const [name, out] of Object.entries(outs)) {
    const cast = name !== 'canopy';
    const bark = new THREE.Mesh(barkGeo(out), barkMat);
    const leaves = new THREE.Mesh(leafGeo(out), leafMat);
    bark.castShadow = leaves.castShadow = cast;
    bark.receiveShadow = leaves.receiveShadow = true;
    bark.frustumCulled = leaves.frustumCulled = false;
    leaves.customDepthMaterial = leafDepth;
    bark.name = name + '-bark'; leaves.name = name + '-leaves';
    group.add(bark, leaves);
    stats.barkVerts += out.bark.pos.length / 3; stats.leafCards += out.leaf.pos.length / 12;
  }
  scene.add(group);

  return { group, avoid, stats };
}
