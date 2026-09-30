// Quality tiers. 'high' = desktop, 'mid' = recent phones (iPhone 13, 2022 mid-range Android), 'low' = older devices.
// ?q=low|mid|high overrides. main.js also steps down at runtime if frames run long.
export function pickQuality(gl) {
  const q = new URLSearchParams(location.search).get('q');
  const coarse = matchMedia('(pointer:coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  let tier = coarse || small ? 'mid' : 'high';
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { /* not available */ }
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const oldGPU = /Adreno \(TM\) [3-5]\d\d|Mali-[GT][0-7]\d\b|PowerVR|Apple A(9|10|11)\b|SwiftShader/i.test(gpu);
  if (tier === 'mid' && (oldGPU || cores <= 4 || mem <= 3)) tier = 'low';
  if (q === 'low' || q === 'mid' || q === 'high') tier = q;
  const dprCap = { high: 1.75, mid: 1.5, low: 1.0 }[tier];
  const base = {
    high: { grass: 70000, reeds: 1600, leafMul: 1.0, farTrees: 120, flankTrees: 40, shrubs: 34, grassFar: 30000, canopyTrees: 170, motes: 420, msaa: 4, reflScale: 0.5, shadow: 2048, bloom: true },
    mid: { grass: 42000, reeds: 900, leafMul: 0.8, farTrees: 85, flankTrees: 28, shrubs: 26, grassFar: 15000, canopyTrees: 110, motes: 240, msaa: 4, reflScale: 0.4, shadow: 1536, bloom: true },
    low: { grass: 18000, reeds: 500, leafMul: 0.55, farTrees: 45, flankTrees: 16, shrubs: 14, grassFar: 6000, canopyTrees: 50, motes: 120, msaa: 0, reflScale: 0.3, shadow: 1024, bloom: false },
  }[tier];
  return { tier, gpu, dpr: Math.min(window.devicePixelRatio || 1, dprCap), ...base };
}
