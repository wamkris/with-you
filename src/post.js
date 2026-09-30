// Post: MSAA scene target → subtle bloom → a filmic grade (ACES, gentle warm split-tone, vignette, fine grain).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function makePost(renderer, scene, camera, quality) {
  const W = innerWidth, Hh = innerHeight;
  const rt = new THREE.WebGLRenderTarget(W * quality.dpr, Hh * quality.dpr, {
    type: THREE.HalfFloatType, samples: quality.msaa, depthBuffer: true,
  });
  rt.depthTexture = null;
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(quality.dpr);
  composer.setSize(W, Hh);
  composer.renderTarget1.samples = 0;       // post passes don't need multisampling; the scene renders into renderTarget2
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W * 0.5, Hh * 0.5), 0.22, 0.35, 3.5);
  if (quality.bloom) composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W * quality.dpr, Hh * quality.dpr) },
      uExp: { value: 1.0 }, uWarm: { value: 0 }, uSunUV: { value: new THREE.Vector2(0.6, 0.6) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uExp; uniform float uWarm; uniform vec2 uSunUV;
      varying vec2 vUv;
      // ACES fitted (Stephen Hill), as in three's ACESFilmicToneMapping
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v + 0.0245786) - 0.000090537; vec3 b = v*(0.983729*v + 0.4329510) + 0.238081; return a/b; }
      vec3 aces(vec3 color){
        const mat3 IN = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 OUT = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        color *= 1.0/0.6; color = IN*color; color = RRTAndODTFit(color); color = OUT*color; return clamp(color, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb*uExp;
        c = aces(c);
        // split tone: warm highlights, faintly cool-green shadows; understanding runs warmer
        float l = dot(c, vec3(0.2126,0.7152,0.0722));
        vec3 warm = mix(vec3(1.03,1.0,0.95), vec3(1.07,1.0,0.89), uWarm);
        c *= mix(vec3(0.93,0.99,1.05), warm, smoothstep(0.08, 0.7, l));
        c = mix(vec3(dot(c, vec3(0.2126,0.7152,0.0722))), c, 1.12);            // a touch more colour
        c = toSRGB(c);
        // vignette, weighted away from the sun so the light stays open
        vec2 q = (vUv - 0.5)*vec2(uRes.x/uRes.y, 1.0);
        c *= mix(0.8, 1.0, smoothstep(1.1, 0.35, length(q)));
        c += (hh(vUv*uRes + fract(uTime)*91.0) - 0.5)*0.014;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
  return {
    composer, bloom, grade,
    resize(w, h) { composer.setSize(w, h); grade.uniforms.uRes.value.set(w * quality.dpr, h * quality.dpr); },
  };
}
