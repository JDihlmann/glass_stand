import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Lightmap support. Every plain box and plane of the room gets its own rectangle in one atlas
// (second UV set). The same layout is used when exporting the room to Blender for the bake and when
// showing the baked result, so only the image has to come back.
const SIZE = 2048, DENSITY = 48;

export function unwrap(root) {
  const charts = []; let id = 0; root.updateMatrixWorld(true); const s = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return; const m = o.material, g = o.geometry;
    if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent || m.colorWrite === false) return;
    const n = g.attributes.position.count, box = g.type === 'BoxGeometry' && n === 24, plane = g.type === 'PlaneGeometry' && n === 4;
    if (!box && !plane) return;
    s.setFromMatrixScale(o.matrixWorld); const p = g.parameters, W = Math.abs(p.width * s.x), H = Math.abs(p.height * s.y), D = box ? Math.abs(p.depth * s.z) : 0;
    const dims = box ? [[D, H], [D, H], [W, D], [W, D], [W, H], [W, H]] : [[W, H]];
    g.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); o.userData.lm = true; o.name = 'LM_' + (id++);
    dims.forEach((d, f) => charts.push({ o, f, w: Math.min(1024, Math.max(3, Math.ceil(d[0] * DENSITY) + 2)), h: Math.min(1024, Math.max(3, Math.ceil(d[1] * DENSITY) + 2)), k: charts.length }));
  });
  charts.sort((a, b) => b.h - a.h || a.k - b.k);
  let x = 0, y = 0, row = 0, overflow = false;
  for (const c of charts) {
    if (x + c.w > SIZE) { x = 0; y += row; row = 0; }
    if (y + c.h > SIZE) overflow = true;
    const uv = c.o.geometry.attributes.uv, uv1 = c.o.geometry.attributes.uv1;
    for (let k = 0; k < 4; k++) { const i = c.f * 4 + k; uv1.setXY(i, (x + 1 + uv.getX(i) * (c.w - 2)) / SIZE, (y + 1 + uv.getY(i) * (c.h - 2)) / SIZE); }
    x += c.w; row = Math.max(row, c.h);
  }
  return { charts: charts.length, usedRows: y + row, overflow };
}

// Swap the lit meshes over to materials whose diffuse light comes only from the baked map.
export function applyLightmap(root, tex, scale) {
  tex.channel = 1; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;   // glTF/Blender UVs run top-down
  tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const cache = new Map();
  root.traverse((o) => {
    if (!o.userData.lm) return; const m = o.material;
    if (!cache.has(m)) {
      const c = m.clone(), prev = m.onBeforeCompile; c.lightMap = tex; c.emissiveIntensity = 0;
      c.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r); sh.uniforms.uLM = { value: scale };
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLM;')
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse = vec3(0.); reflectedLight.indirectDiffuse = texture2D(lightMap, vLightMapUv).rgb * uLM * diffuseColor.rgb;');
      };
      c.customProgramCacheKey = () => 'lm' + (prev ? prev.toString().length : 0);
      cache.set(m, c);
    }
    o.userData.live = m; o.userData.baked = cache.get(m); o.material = o.userData.baked;
  });
}

// Switch the room between baked light and the live lights.
export function setBaked(root, on) { root.traverse((o) => { if (o.userData.baked) o.material = on ? o.userData.baked : o.userData.live; }); }

export async function exportForBake(root, extra) {
  await new Promise((r) => setTimeout(r, 2000));              // let image textures finish loading
  const hidden = [], dimmed = [], stripped = [], seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return; const m = o.material;
    if (m.isMeshStandardMaterial && !seen.has(m)) { seen.add(m); for (const k of ['roughnessMap', 'metalnessMap', 'bumpMap', 'normalMap', 'clearcoatNormalMap']) if (m[k]) { stripped.push([m, k, m[k]]); m[k] = null; }
      if (m.userData.floor) { stripped.push([m, 'map', m.map]); m.map = null; const c = m.color.getHex(); stripped.push([m, 'color', new THREE.Color(c)]); m.color.set(0xd6b07a); } }
    if (m.isShaderMaterial || (m.isMeshBasicMaterial && m.transparent)) { if (o.visible) { o.visible = false; hidden.push(o); } }
    else if (m.isMeshStandardMaterial && m.emissiveIntensity > 0 && !dimmed.some((d) => d[0] === m)) { dimmed.push([m, m.emissiveIntensity]); m.emissiveIntensity = 0; }
  });
  const glb = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true, onlyVisible: true }));
  hidden.forEach((o) => (o.visible = true)); dimmed.forEach(([m, v]) => (m.emissiveIntensity = v)); stripped.forEach(([m, k, t]) => { if (k === 'color') m.color.copy(t); else m[k] = t; m.needsUpdate = true; });
  await fetch('__save?name=room.glb', { method: 'POST', body: glb });
  await fetch('__save?name=scene.json', { method: 'POST', body: JSON.stringify(extra) });
  return glb.byteLength;
}
