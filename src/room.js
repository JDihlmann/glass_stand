import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Entry niche rebuilt from the walkthrough video. Units: metres.
// One wall (z=0, facing +z) carries, left to right: artwork, key stand, radiator + bench, PAX, office door.
// It ends at x=0 in a free outer corner; left of it a passage runs back (-z), and the
// entrance double door sits on the left wall (x=x0).

export const ROOM = { x0: -1.35, x1: 2.3, z0: -2.3, z1: 3.05, h: 2.75 };

const std = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  wall: std({ color: 0xf8f5ef, roughness: .93 }),
  ceil: std({ color: 0xf7f5f1, roughness: .95, envMapIntensity: .12, emissive: 0xf3ece0, emissiveIntensity: .4 }),
  trim: std({ color: 0xf9f7f2, roughness: .42 }),
  furn: std({ color: 0xe9e9e6, roughness: .32 }),
  gap: std({ color: 0x8d8b86, roughness: .9 }),
  dark: std({ color: 0x1b1c1e, roughness: .6 }),
  chrome: std({ color: 0xd8d8d8, roughness: .18, metalness: 1 }),
};

function box(parent, w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
// box given by min corner + size
const boxAt = (p, x, y, z, w, h, d, mat, s = true) => box(p, w, h, d, mat, x + w / 2, y + h / 2, z + d / 2, s);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---- herringbone oak floor ---------------------------------------------
function floorMaterial() {
  const L = new THREE.TextureLoader();
  const map = L.load('tex/oak-Diffuse.jpg'); map.colorSpace = THREE.SRGBColorSpace;
  const rough = L.load('tex/oak-Rough.jpg');
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; }
  const m = std({ map, roughnessMap: rough, roughness: .3, color: 0xfff0cc, envMapIntensity: 1.0 });
  m.userData.floor = true;
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWp; vec2 hUv; float hTint, hEdge, hRnd; vec2 hTilt;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void herring(vec2 p){
  const float W = 0.068, n = 5.;
  vec2 q = mat2(.70711,-.70711,.70711,.70711) * p / W;
  float row = floor(q.y), cu = floor(q.x), k = mod(cu-row, 2.*n);
  vec2 id, l;
  if(k < n){ id = vec2(floor((cu-row)/(2.*n)), row); l = vec2(k + fract(q.x), fract(q.y)); }
  else { id = vec2(cu, floor((cu-row)/(2.*n)) + 977.); l = vec2(2.*n-1.-k + fract(q.y), fract(q.x)); }
  hRnd = h21(id); float r2 = h21(id+7.7);
  hUv = vec2(l.y*W*1.6 + hRnd*13.7, l.x*W*.8 + r2*9.1);
  float e = min(min(l.x, n-l.x), min(l.y, 1.-l.y));
  hEdge = smoothstep(0., .022, e);
  hTint = mix(.74, 1.12, r2*r2*(3.-2.*r2)) * mix(.93, 1.05, h21(id+3.1));
  hTilt = vec2(hRnd-.5, r2-.5);
}`)
      .replace('#include <map_fragment>', `herring(vWp.xz);
  vec3 wood = texture2D(map, hUv).rgb;
  wood = mix(wood, wood*vec3(1.04,.99,.9), hRnd);
  diffuseColor.rgb *= min(wood * 1.75 + vec3(.06,.045,.01), vec3(1.)) * hTint * mix(.5, 1., hEdge);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(.8, 1.3, texture2D(roughnessMap, hUv).g) * mix(1.8, 1., hEdge);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize(normal + (viewMatrix*vec4(hTilt.x,0.,hTilt.y,0.)).xyz*.012 + (viewMatrix*vec4(texture2D(roughnessMap,hUv*2.).rg-.5,0.,0.).xzyw).xyz*.03);');
  };
  return m;
}

// soft dark strip that fakes ambient occlusion where surfaces meet
const aoTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.35, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
const blobTex = canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, w * .1, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, false);
function ao(parent, from, to, width, normal, strength = .5, tex = aoTex) {
  // quad from segment (from→to) extruded along `normal` direction by width; dark at the segment
  const a = from, b = to, n = normal.clone().multiplyScalar(width);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, b.x + n.x, b.y + n.y, b.z + n.z, a.x + n.x, a.y + n.y, a.z + n.z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: strength * .45, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 1; parent.add(m); return m;
}
export function blob(parent, x, z, w, d, strength = .5, y = .0015) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, color: 0, transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 1; parent.add(m); return m;
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function skirting(p, x0, z0, x1, z1, nx, nz) {
  // runs from (x0,z0) to (x1,z1); (nx,nz) is the wall's outward normal
  const len = Math.hypot(x1 - x0, z1 - z0), along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mk = (t, h, y) => box(p, along ? len : t, h, along ? t : len, M.trim, cx + nx * t / 2, y + h / 2, cz + nz * t / 2, false);
  mk(.016, .075, 0); mk(.022, .016, .075); mk(.012, .012, .091);
  ao(p, v(x0 + nx * .022, .001, z0 + nz * .022), v(x1 + nx * .022, .001, z1 + nz * .022), .16, v(nx, 0, nz), .42);
}

function cushion(p, x, y, z, w, d) {
  const tex = canvasTex(512, 512, (g, s) => {
    g.fillStyle = '#394a86'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .6 ? '142,152,196' : '34,44,100'},${.18 + Math.random() * .25})`; const h = Math.random() < .5; g.fillRect(Math.floor(Math.random() * 128) * 4, Math.floor(Math.random() * 128) * 4, h ? 6 + Math.random() * 14 : 2, h ? 2 : 6 + Math.random() * 14); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2);
  const mat = std({ map: tex, bumpMap: tex, bumpScale: .5, roughness: .97 });
  const th = .065, geo = new THREE.BoxGeometry(w, th, d, 96, 8, 56), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const X = P.getX(i), Y = P.getY(i), Z = P.getZ(i), px = X / (w / 2), py = Y / (th / 2), pz = Z / (d / 2);
    const e = Math.pow(Math.max(Math.abs(px), Math.abs(pz)), 7);                                   // soft rolled edge
    const quilt = Math.pow(Math.abs(Math.sin(X * Math.PI / .15 + .4)) * Math.abs(Math.sin(Z * Math.PI / .165)), .32);   // stitched pockets
    const wr = Math.sin(X * 31 + Z * 17) * .0016 + Math.sin(Z * 43 - X * 11) * .0012;
    let ny = (th / 2) * py * (1 - .6 * e) + (py > 0 ? (.006 * quilt + wr * 1.6 + .004 * Math.sin(X * 9 + Z * 6)) * (1 - e) : 0);
    if (pz > .8) ny -= (pz - .8) * .035;                                                            // sags over the front edge
    P.setXYZ(i, X * (1 + .012 * (1 - py * py)), ny, Z * (1 + .03 * (1 - py * py)) + (pz > 0 ? .012 : 0));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.position.set(x + w / 2, y + th / 2, z + d / 2); m.castShadow = m.receiveShadow = true; p.add(m);

  // rolled blue-and-white batik cloth: a soft "noodle" lying along the back edge against the radiator
  const pat = canvasTex(256, 256, (c, s) => {
    c.fillStyle = '#e4e6ee'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { c.fillStyle = ['#16237a', '#1c2f9a', '#0e1650'][i % 3]; c.globalAlpha = .7 + Math.random() * .3; const h = i % 3 !== 0; c.fillRect(Math.floor(Math.random() * 32) * 8, Math.floor(Math.random() * 64) * 4, h ? 6 + Math.random() * 16 : 3, h ? 3 : 8 + Math.random() * 14); }
  });
  pat.wrapS = pat.wrapT = THREE.RepeatWrapping; pat.repeat.set(3, 1.4);
  const tm = std({ map: pat, bumpMap: pat, bumpScale: 1.0, roughness: 1 });
  const L = w - .02, tg = new THREE.PlaneGeometry(1, 1, 80, 20), T = tg.attributes.position, yc = y + th + .042, zc = z + .085;
  const sm = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < T.count; i++) {
    const u = T.getX(i) + .5, a = (T.getY(i) + .5) * Math.PI * 2;
    const ends = sm(0, .05, u) * sm(0, .04, 1 - u);                                   // closes softly at both ends
    const r = .064 * (1 + .06 * Math.sin(u * 13 + 1) + .03 * Math.sin(u * 37)) * (.3 + .7 * ends) + .004 * Math.sin(a * 5 + u * 31) + .003 * Math.sin(a * 9 - u * 57);
    const droop = .05 * Math.pow(Math.max(0, (.14 - u) / .14), 2);                    // left end slumps over the pad edge
    T.setXYZ(i, x + .01 + u * L, yc - droop + Math.sin(a) * r * .78, zc + .012 * Math.sin(u * 8) + Math.cos(a) * r);
  }
  tg.computeVertexNormals(); const roll = new THREE.Mesh(tg, tm); roll.material.side = THREE.DoubleSide; roll.castShadow = roll.receiveShadow = true; p.add(roll);
}

function artwork(p) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uLight; varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+1.),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+7.; a*=.5; } return s; }
void main(){
  vec2 p = vUv*vec2(1.6,4.4);
  vec2 w = vec2(fbm(p+3.), fbm(p+11.)); float m = fbm(p*1.3 + w*3.2);
  float bands = smoothstep(.02,.0, abs(fract(m*5.)-.5)-.2);
  vec3 cream = vec3(.93,.86,.74), peach = vec3(.95,.62,.45), pink = vec3(.93,.55,.6);
  vec3 col = mix(cream, mix(peach, pink, w.x), bands*.8);
  col = mix(col, vec3(.92,.72,.25), smoothstep(.1,.0,vUv.y)*.8);
  vec3 V = normalize(cameraPosition - vW); float ang = V.x*2.2 + V.y*1.4;
  vec3 iri = .5 + .5*cos(6.2831*(ang + m*1.4 + vec3(0.,.33,.67)));
  float mask = smoothstep(.45,.6, fbm(p*.8+20.)) * bands;
  col = mix(col, mix(col, mix(iri, vec3(.5,.9,.95), .5), .5), mask*.6);
  gl_FragColor = vec4(col*col*uLight*.8, 1.);
}` });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.35, 1.15), mat); m.position.set(.465, 1.695, .012); p.add(m);
  boxAt(p, .29, 1.12, 0, .35, 1.15, .01, std({ color: 0xe8dcc8, roughness: .6 }));
  ao(p, v(.29, 1.12, .002), v(.64, 1.12, .002), .05, v(0, -1, 0), .3); ao(p, v(.64, 1.12, .002), v(.64, 2.27, .002), .03, v(1, 0, 0), .25);
  return mat;
}

// =====================================================================
// Architecture helpers
// =====================================================================
const T = .16, DH = 2.03, CW = .1;
const HH = () => ROOM.h;

function skirtL(g, a, b) {
  if (b - a < .02) return;
  boxAt(g, a, 0, 0, b - a, .1, .018, M.trim, false); boxAt(g, a, .1, 0, b - a, .022, .024, M.trim, false); boxAt(g, a, .122, 0, b - a, .014, .013, M.trim, false);
  ao(g, v(a, .001, .024), v(b, .001, .024), .17, v(0, 0, 1), .4);
}
const sill = std({ color: 0xd9b074, roughness: .45 });
function casing(g, a, b, h, ped) {
  for (const x of [a - CW, b]) {
    boxAt(g, x, .17, 0, CW, h + CW - .17, .018, M.trim, false);
    for (const k of [.016, .041, .066]) boxAt(g, x + k, .17, .018, .016, h - .19, .007, M.trim, false);          // reeding
    boxAt(g, x - .004, 0, 0, CW + .008, .17, .03, M.trim, false); boxAt(g, x - .004, .17, 0, CW + .008, .012, .034, M.trim, false);   // plinth block
  }
  boxAt(g, a - CW - .014, .17, 0, .014, h + CW - .15, .03, M.trim, false); boxAt(g, b + CW, .17, 0, .014, h + CW - .15, .03, M.trim, false);
  boxAt(g, a, h, 0, b - a, CW, .018, M.trim, false); boxAt(g, a - CW - .02, h + CW, 0, b - a + 2 * CW + .04, .022, .04, M.trim, false); boxAt(g, a - CW - .012, h + CW - .016, 0, b - a + 2 * CW + .024, .016, .03, M.trim, false);
  // jamb linings inside the reveal, door stop, threshold board
  boxAt(g, a, 0, -T - .001, .014, h, T + .002, M.trim, false); boxAt(g, b - .014, 0, -T - .001, .014, h, T + .002, M.trim, false); boxAt(g, a, h - .014, -T - .001, b - a, .014, T + .002, M.trim, false);
  boxAt(g, a - .02, 0, -T - .03, b - a + .04, .004, T + .06, sill, false);
  if (ped) {  // shaped pediment board over the old doors
    const w = b - a + 2 * CW + .06, s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, .05); s.quadraticCurveTo(w * .42, .05, w * .36, .1); s.quadraticCurveTo(0, .17, -w * .36, .1); s.quadraticCurveTo(-w * .42, .05, -w / 2, .05); s.lineTo(-w / 2, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .022, bevelEnabled: false, curveSegments: 14 }), M.trim); m.position.set((a + b) / 2, h + CW + .022, 0); g.add(m);
  }
}
// A wall whose visible face lies at `at` on the given axis, with outward normal n (±1).
// Openings are cut as gaps with lintels, casings and skirting returns.
function wall(g, axis, at, n, from, to, ops = [], o = {}) {
  const grp = new THREE.Group(); g.add(grp); let s;
  if (axis === 'x') { grp.position.z = at; if (n < 0) grp.rotation.y = Math.PI; s = n; } else { grp.position.x = at; grp.rotation.y = n * Math.PI / 2; s = -n; }
  let u0 = s * from, u1 = s * to; if (u0 > u1) [u0, u1] = [u1, u0];
  const O = ops.map((p) => { let a = s * p.a, b = s * p.b; if (a > b) [a, b] = [b, a]; return { ...p, a, b, h: p.h || DH }; }).sort((p, q) => p.a - q.a);
  let cur = u0; const H = HH(), mat = o.mat || M.wall;
  for (const p of [...O, { a: u1, b: u1, end: true }]) {
    if (p.a > cur + 1e-4) { boxAt(grp, cur, 0, -T, p.a - cur, H, T, mat); if (!o.plain) skirtL(grp, cur + (cur > u0 + 1e-3 ? CW + .016 : 0), p.a - (p.end ? 0 : CW + .016)); }
    if (!p.end) { boxAt(grp, p.a, p.h, -T, p.b - p.a, H - p.h, T, mat); if (!o.plain && p.casing !== false) casing(grp, p.a, p.b, p.h, p.ped); cur = p.b; }
  }
  grp.userData.u = (w) => s * w; return grp;
}

const nickel = std({ color: 0xc9c6bf, metalness: 1, roughness: .28 });
function lever(g, x, y, dir) {
  for (const sz of [-1, 1]) {
    boxAt(g, x - .018, y - .11, sz > 0 ? .02 : -.026, .036, .22, .006, nickel, false);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .05, 12), nickel); n.rotation.x = Math.PI / 2; n.position.set(x, y + .04, sz * .045); g.add(n);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .1, 4, 10), nickel); l.rotation.z = Math.PI / 2; l.position.set(x + dir * .055, y + .04, sz * .066); g.add(l);
    const k = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .01, 10), M.dark); k.rotation.x = Math.PI / 2; k.position.set(x, y - .06, sz * .027); g.add(k);
  }
}
const recessMat = std({ color: 0xe2dfd8, roughness: .6 });
function panel(g, x, y, w, h, mat = M.trim, zf = .02, both = true) {
  // recessed field with a moulded bead (both faces of a leaf unless told otherwise)
  for (const sz of both ? [-1, 1] : [1]) {
    const at = (d, t) => (sz > 0 ? zf + d : -zf - d - t);
    boxAt(g, x, y, at(0, .0012), w, h, .0012, recessMat, false);
    for (const [bx, by, bw, bh] of [[x, y, w, .024], [x, y + h - .024, w, .024], [x, y, .024, h], [x + w - .024, y, .024, h]]) boxAt(g, bx, by, at(0, .013), bw, bh, .013, mat, false);
    boxAt(g, x + .05, y + .05, at(0, .009), w - .1, h - .1, .009, mat, false);
  }
}
const frosted = new THREE.MeshPhysicalMaterial({ color: 0x9fb6c6, roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .1, emissive: 0x7fa0bb, emissiveIntensity: .35 });
// Old four-panel door leaf. Local origin at the hinge edge, leaf extends along +x.
function leaf(w, h = DH - .02, glass = false) {
  // old panelled door: three tall fields above the lock rail, two below (or one glazed light above)
  const g = new THREE.Group(); boxAt(g, 0, .006, -.02, w, h, .04, M.trim);
  const st = .1, mid = .065, lw = (w - 2 * st - mid) / 2, uw = (w - 2 * st - 2 * mid) / 3;
  for (const k of [0, 1]) panel(g, st + k * (lw + mid), .17, lw, .72);
  if (!glass) for (let k = 0; k < 3; k++) panel(g, st + k * (uw + mid), 1.08, uw, h - 1.08 - .1);
  else { for (const z of [.0202, -.0222]) boxAt(g, st, 1.08, z, w - 2 * st, h - 1.18, .002, frosted, false); for (const [bx, by, bw, bh] of [[st, 1.08, w - 2 * st, .02], [st, h - .12, w - 2 * st, .02], [st, 1.08, .02, h - 1.18], [w - st - .02, 1.08, .02, h - 1.18]]) for (const z of [.02, -.032]) boxAt(g, bx, by, z, bw, bh, .012, M.trim, false); }
  boxAt(g, .0, .95, -.027, w, .05, .054, M.trim, false);
  lever(g, w - .06, 1.0, -1);
  for (const y of [.25, 1.72]) boxAt(g, -.006, y, -.012, .012, .1, .024, nickel, false);
  return g;
}
function hang(grp, hingeU, dir, angle, w, glass) { const l = leaf(w, DH - .02, glass); l.position.set(hingeU, 0, -.035); l.scale.x = dir; l.rotation.y = angle * dir; grp.add(l); return l; }

const hammered = canvasTex(256, 256, (c, s) => { c.fillStyle = '#8080ff'; c.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { const x = Math.random() * s, y = Math.random() * s, r = 5 + Math.random() * 9, gr = c.createRadialGradient(x - r * .3, y - r * .3, 0, x, y, r); const a = Math.random() * 360; gr.addColorStop(0, `hsla(${a},60%,62%,.9)`); gr.addColorStop(1, 'rgba(128,128,255,0)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } }, false);
hammered.wrapS = hammered.wrapT = THREE.RepeatWrapping; hammered.repeat.set(3, 5);
const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, roughness: .08, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, normalMap: hammered, normalScale: new THREE.Vector2(.06, .06), clearcoatNormalMap: hammered, clearcoatNormalScale: new THREE.Vector2(.035, .035), envMapIntensity: 1.1 });
const paleGlass = darkGlass.clone(); paleGlass.color.set(0x7d8a90); paleGlass.emissive.set(0x4a5458); paleGlass.emissiveIntensity = .5;

// Entrance double door: two leaves with arched hammered glass, a row of four small lights behind a
// hand rail, panelled lower halves, roller-blind cassettes and a transom light over each leaf.
function portal() {
  const g = new THREE.Group(); const LW = .78, post = .08, mul = .06, W = 2 * LW + mul + 2 * post, LH = 2.06, TH = 2.62;
  for (const x of [-W / 2, W / 2 - post]) boxAt(g, x, 0, 0, post, TH, .06, M.trim);
  boxAt(g, -mul / 2, 0, 0, mul, TH, .05, M.trim); boxAt(g, -W / 2, TH - .06, 0, W, .06, .06, M.trim); boxAt(g, -W / 2, LH, 0, W, .07, .065, M.trim);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -LW - mul / 2 : mul / 2;
    // transom casement
    boxAt(g, x0 + .02, LH + .09, .015, LW - .04, TH - LH - .17, .035, M.trim, false); boxAt(g, x0 + .075, LH + .145, .04, LW - .15, TH - LH - .28, .012, paleGlass, false);
    boxAt(g, x0 + LW / 2 - .012, TH - .09, .05, .024, .03, .02, nickel, false);
    const L = new THREE.Group(); L.position.set(x0, 0, .012); g.add(L);
    boxAt(L, 0, .012, 0, LW, LH - .02, .045, M.trim);
    const st = .105, iw = (LW - 2 * st - .07) / 2;
    for (const k of [0, 1]) { const x = st + k * (iw + .07); for (const [y, h] of [[.17, .4], [.62, .25]]) panel(L, x, y, iw, h, M.trim, .045, false); }
    const pw = (LW - 2 * st - 3 * .024) / 4; for (let k = 0; k < 4; k++) boxAt(L, st + k * (pw + .024), .945, .036, pw, .135, .012, paleGlass, false);
    for (let k = 0; k < 5; k++) boxAt(L, st - .024 + k * (pw + .024), .935, .04, .024, .155, .012, M.trim, false);
    boxAt(L, st - .022, .925, .04, LW - 2 * st + .044, .018, .014, M.trim, false); boxAt(L, st - .022, 1.078, .04, LW - 2 * st + .044, .018, .014, M.trim, false);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, LW - .14, 10), M.trim); rail.rotation.z = Math.PI / 2; rail.position.set(LW / 2, 1.115, .085); L.add(rail);
    for (const x of [.085, LW - .085]) boxAt(L, x - .012, 1.095, .045, .024, .04, .05, M.trim, false);
    const gw = LW - 2 * st, gh = .74, s = new THREE.Shape(); s.moveTo(-gw / 2, 0); s.lineTo(gw / 2, 0); s.lineTo(gw / 2, gh - gw / 2); s.absarc(0, gh - gw / 2, gw / 2, 0, Math.PI); s.lineTo(-gw / 2, 0);
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(s, 28), darkGlass); gl.position.set(LW / 2, 1.15, .047); L.add(gl);
    const rim = new THREE.Shape(); const o = .022; rim.moveTo(-gw / 2 - o, -o); rim.lineTo(gw / 2 + o, -o); rim.lineTo(gw / 2 + o, gh - gw / 2); rim.absarc(0, gh - gw / 2, gw / 2 + o, 0, Math.PI); rim.lineTo(-gw / 2 - o, -o); rim.holes.push(new THREE.Path(s.getPoints(28)));
    const rm = new THREE.Mesh(new THREE.ExtrudeGeometry(rim, { depth: .014, bevelEnabled: false, curveSegments: 28 }), M.trim); rm.position.set(LW / 2, 1.15, .045); L.add(rm);
    // roller blind cassette
    boxAt(L, st - .04, 1.925, .045, LW - 2 * st + .08, .06, .05, M.trim, false); boxAt(L, st - .03, 1.905, .05, LW - 2 * st + .06, .02, .035, std({ color: 0xe6e3da, roughness: .8 }), false);
    if (sx < 0) { boxAt(L, .03, .9, .045, .04, .26, .007, nickel, false); const l = new THREE.Mesh(new THREE.CapsuleGeometry(.009, .11, 4, 10), nickel); l.rotation.z = Math.PI / 2; l.position.set(.11, 1.05, .09); L.add(l); const n = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .05, 10), nickel); n.rotation.x = Math.PI / 2; n.position.set(.05, 1.05, .07); L.add(n); }
    for (const y of [.22, 1.75]) boxAt(L, sx < 0 ? LW - .004 : -.012, y, .03, .016, .12, .03, nickel, false);
  }
  return g;
}

function switches(g, x, y, z, n, socket = false) {
  const plate = std({ color: 0xf6f5f1, roughness: .35 });
  for (let k = 0; k < n; k++) { const yy = y + k * .081; boxAt(g, x - .0405, yy, z, .081, .081, .008, plate, false); boxAt(g, x - .028, yy + .0125, z + .008, .056, .056, .004, plate, false);
    if (socket && k === 0) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.019, .019, .004, 20), std({ color: 0xdcdad4, roughness: .5 })); c.rotation.x = Math.PI / 2; c.position.set(x, yy + .0405, z + .011); g.add(c); } }
}

function framedArt(w, h) {
  const g = new THREE.Group(); boxAt(g, -w / 2, 0, 0, w, h, .03, std({ color: 0x0b0b0c, roughness: .5 }));
  const tex = canvasTex(256, 384, (c, W, Hh) => { c.fillStyle = '#0c0c10'; c.fillRect(0, 0, W, Hh); c.filter = 'blur(14px)'; c.fillStyle = '#d83a55'; c.fillRect(W * .32, Hh * .34, W * .36, Hh * .26); c.fillStyle = '#ff8fa0'; c.fillRect(W * .4, Hh * .4, W * .2, Hh * .14); c.filter = 'none'; });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w - .05, h - .05), new THREE.MeshPhysicalMaterial({ map: tex, roughness: .5, clearcoat: 1, clearcoatRoughness: .03 })); m.position.set(0, h / 2, .031); g.add(m); return g;
}

// ---- furniture for the rooms seen through the doorways -----------------
function palm(g, x, z) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.2, .16, .36, 24), std({ color: 0xe9e6df, roughness: .6 })); pot.position.set(x, .18, z); g.add(pot);
  const P = [], I = []; const rnd = (() => { let s = 5; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let f = 0; f < 16; f++) {
    const th = rnd() * 6.28, lean = .25 + rnd() * .9, len = 1.0 + rnd() * .7, base = new THREE.Vector3(x, .36 + rnd() * .5, z);
    const dir = new THREE.Vector3(Math.cos(th) * Math.sin(lean), Math.cos(lean), Math.sin(th) * Math.sin(lean));
    for (let i = 0; i < 26; i++) {
      const t = .25 + .75 * i / 26, p = base.clone().addScaledVector(dir, len * t); p.y -= t * t * len * .28;
      const side = new THREE.Vector3(-dir.z, .1, dir.x).normalize();
      for (const sgn of [-1, 1]) { const tip = p.clone().addScaledVector(side, sgn * .26 * (1.15 - t)).addScaledVector(dir, .12); tip.y -= .09; const n = P.length / 3; const w = dir.clone().multiplyScalar(.022); P.push(p.x - w.x, p.y, p.z - w.z, p.x + w.x, p.y, p.z + w.z, tip.x, tip.y, tip.z); I.push(n, n + 1, n + 2); }
    }
    const tip = base.clone().addScaledVector(dir, len); tip.y -= len * .28; const n = P.length / 3; P.push(base.x - .008, base.y, base.z, base.x + .008, base.y, base.z, tip.x, tip.y, tip.z); I.push(n, n + 1, n + 2);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, std({ color: 0x2f5d2b, roughness: .6, side: THREE.DoubleSide })));
}
function slingChair(g, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  const geo = new THREE.PlaneGeometry(.78, 1.25, 10, 14), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const u = P.getX(i), t = P.getY(i) / 1.25 + .5; const yy = .28 + Math.pow(t, 1.7) * .62 - .12 * Math.sin(Math.PI * Math.min(1, t * 1.6)) + .16 * (u / .39) ** 2; P.setXYZ(i, u * (1 - .25 * (1 - t)), yy, -.35 + t * .75 - Math.pow(t, 3) * .2); }
  geo.computeVertexNormals(); const sl = new THREE.Mesh(geo, std({ color: 0xf2f0ea, roughness: .8, side: THREE.DoubleSide })); c.add(sl);
  for (const [a, b] of [[[-.36, 0, -.45], [.36, .9, .4]], [[.36, 0, -.45], [-.36, .9, .4]], [[-.36, 0, .3], [.3, .36, -.38]], [[.36, 0, .3], [-.3, .36, -.38]]]) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, A.distanceTo(B), 6), M.chrome); m.position.copy(A).lerp(B, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); c.add(m); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.11, 24, 16), std({ color: 0xffffff, metalness: 1, roughness: .12, flatShading: true })); ball.position.set(0, .42, -.02); c.add(ball);
}
function cantilever(g, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c); const lea = std({ color: 0x141414, roughness: .45 });
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(.3, .27, .34, 28, 1, true, Math.PI * .25, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .45, side: THREE.DoubleSide })); tub.position.y = .62; c.add(tub);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .09, 28), lea); seat.position.y = .45; c.add(seat);
  for (const sx of [-1, 1]) { boxAt(c, sx * .25 - .009, 0, -.25, .018, .018, .5, M.chrome, false); boxAt(c, sx * .25 - .009, 0, .23, .018, .42, .018, M.chrome, false); }
  boxAt(c, -.25, 0, -.26, .5, .018, .018, M.chrome, false);
}
function officeChair(g, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c); const bl = std({ color: 0x141518, roughness: .6 });
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; const leg = new THREE.Mesh(new THREE.BoxGeometry(.3, .025, .04), bl); leg.position.set(Math.cos(a) * .15, .06, Math.sin(a) * .15); leg.rotation.y = -a; c.add(leg); const w = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 6), bl); w.position.set(Math.cos(a) * .3, .03, Math.sin(a) * .3); c.add(w); }
  const col = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .4, 10), M.chrome); col.position.y = .27; c.add(col);
  boxAt(c, -.24, .46, -.23, .48, .07, .46, bl, false); boxAt(c, -.22, .6, .2, .44, .55, .05, bl, false); boxAt(c, -.02, .5, .2, .04, .15, .03, bl, false);
  for (const sx of [-1, 1]) boxAt(c, sx * .27 - .02, .66, -.1, .04, .025, .26, bl, false);
}
const GLOW = [];
function stub(g, x0, z0, x1, z1, color, skip, day = .55, eve = .06) {
  const m = std({ color, roughness: .95, emissive: color, emissiveIntensity: day }); GLOW.push([m, day, eve]); const H = HH();
  if (skip !== 'z0') boxAt(g, x0 - .05, 0, z0 - .05, x1 - x0 + .1, H, .05, m, false); if (skip !== 'z1') boxAt(g, x0 - .05, 0, z1, x1 - x0 + .1, H, .05, m, false);
  if (skip !== 'x0') boxAt(g, x0 - .05, 0, z0, .05, H, z1 - z0, m, false); if (skip !== 'x1') boxAt(g, x1, 0, z0, .05, H, z1 - z0, m, false); return m;
}
// soft pool of daylight on a floor (additive), so adjoining rooms read as lit without real lights
const poolTex = canvasTex(128, 128, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); }, false);
function pool(g, x, z, w, d, color, day = .5, eve = .0) {
  const m = new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: day, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); GLOW.push([m, day, eve]);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = -Math.PI / 2; p.position.set(x, .006, z); p.renderOrder = 2; g.add(p);
}
const rbox = (p, x, y, z, w, h, d, mat, r = .003) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat); m.position.set(x + w / 2, y + h / 2, z + d / 2); m.castShadow = m.receiveShadow = true; p.add(m); return m; };
// old-style kitchen floor: white octagons with small blue squares
const tileTex = canvasTex(256, 256, (c, s) => {
  c.fillStyle = '#5f8fd0'; c.fillRect(0, 0, s, s); const n = 2, u = s / n, k = u * .27;
  c.fillStyle = '#efeee9'; c.strokeStyle = '#8f9499'; c.lineWidth = 2;
  for (let i = -1; i <= n; i++) for (let j = -1; j <= n; j++) { const x = i * u, y = j * u; c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + u - k, y); c.lineTo(x + u, y + k); c.lineTo(x + u, y + u - k); c.lineTo(x + u - k, y + u); c.lineTo(x + k, y + u); c.lineTo(x, y + u - k); c.lineTo(x, y + k); c.closePath(); c.fill(); c.stroke(); }
});
tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
function windowLight(g, dayMat, x, y, z, w, h, ry, bars = 2) {
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; g.add(grp);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dayMat); p.position.set(0, h / 2, 0); grp.add(p);
  boxAt(grp, -w / 2 - .06, -.06, 0, w + .12, .06, .05, M.trim, false); boxAt(grp, -w / 2 - .06, h, 0, w + .12, .06, .05, M.trim, false);
  for (const sx of [-1, 1]) boxAt(grp, sx * (w / 2 + .03) - .03, 0, 0, .06, h, .05, M.trim, false);
  for (let k = 1; k < bars; k++) boxAt(grp, -w / 2 + k * w / bars - .025, 0, 0, .05, h, .04, M.trim, false);
  boxAt(grp, -w / 2, h * .68, 0, w, .045, .04, M.trim, false);
}

// ---- small hallway objects ----------------------------------------------
function clog(left) {
  const g = new THREE.Group(); const Ln = .265, wAt = (t) => .047 * (.8 + .32 * t) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 3.4)), .5);
  const side = left ? 1 : -1, off = (t) => side * .012 * Math.sin(t * Math.PI) ;
  const sh = new THREE.Shape(); const N = 40; for (let i = 0; i <= N; i++) { const t = i / N; const x = t * Ln, z = wAt(t) + off(t); i ? sh.lineTo(x, z) : sh.moveTo(x, z); } for (let i = N; i >= 0; i--) { const t = i / N; sh.lineTo(t * Ln, -wAt(t) + off(t)); }
  const cork = std({ color: 0x9a744a, roughness: .95 }), bed = std({ color: 0xb79a78, roughness: 1 }), out = std({ color: 0x2a2520, roughness: .9 }), suede = std({ color: 0x8c7b69, roughness: 1, side: THREE.DoubleSide });
  const mk = (depth, y, mat, bevel) => { const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 }), mat); m.rotation.x = Math.PI / 2; m.position.y = y + depth; m.castShadow = true; g.add(m); return m; };
  mk(.006, 0, out); mk(.024, .006, cork, .003); mk(.003, .031, bed);
  // upper: arch swept from the instep opening to the toe
  const geo = new THREE.PlaneGeometry(1, 1, 14, 12), P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) { const a = P.getX(i) + .5, b = P.getY(i) + .5; const t = .36 + .64 * a, w = wAt(t) * 1.04; const hgt = .07 * (1 - .45 * Math.pow(a, 1.6)) * Math.pow(Math.max(0, 1 - Math.pow(a, 6)), .5);
    P.setXYZ(i, t * Ln, .03 + hgt * Math.pow(Math.sin(Math.PI * b), .75), -Math.cos(Math.PI * b) * w + off(t)); }
  geo.computeVertexNormals(); const up = new THREE.Mesh(geo, suede); up.castShadow = true; g.add(up);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(.052, .0035, 6, 20, Math.PI), std({ color: 0x8a7a68, roughness: 1 })); strap.scale.set(1, 1.25, 3.2); strap.rotation.y = Math.PI / 2; strap.position.set(Ln * .5, .031, off(.5)); g.add(strap);
  boxAt(g, Ln * .5 - .012, .07, off(.5) + side * .03, .024, .018, .004, std({ color: 0x8d7b55, metalness: 1, roughness: .4 }), false);
  return g;
}
function sunglasses() {
  const g = new THREE.Group(), bl = std({ color: 0x0c0c0d, roughness: .2 });
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .004, 20), bl); l.rotation.x = Math.PI / 2; l.scale.set(1.15, 1, 1); l.position.set(sx * .034, .024, 0); g.add(l); boxAt(g, sx * .064 - .002, .026, -.13, .004, .006, .13, bl, false); }
  boxAt(g, -.01, .034, -.002, .02, .005, .004, bl, false); return g;
}
function glove(col) {
  const g = new THREE.Group(), m = std({ color: col, roughness: .9 }), bk = std({ color: 0x18181a, roughness: .9 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(.09, .022, .1), bk); palm.position.y = .011; g.add(palm);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(.085, .024, .05), m); cuff.position.set(0, .012, -.075); g.add(cuff);
  for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(.0095, .06 - Math.abs(k - 1.5) * .008, 4, 8), k % 2 ? m : bk); f.rotation.x = Math.PI / 2 + .25; f.position.set(-.033 + k * .022, .004, .085); g.add(f); }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(.01, .04, 4, 8), m); th.rotation.set(Math.PI / 2, 0, -.8); th.position.set(.06, .01, .02); g.add(th); return g;
}

// =====================================================================
// The flat
// =====================================================================
export function buildRoom(scene) {
  const g = new THREE.Group(); scene.add(g);
  const R = ROOM, H = R.h;
  const outside = canvasTex(256, 256, (c, s) => { const gr = c.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#f4f7fb'); gr.addColorStop(.55, '#e6e9ea'); gr.addColorStop(1, '#cfd0c8'); c.fillStyle = gr; c.fillRect(0, 0, s, s); c.filter = 'blur(6px)'; c.fillStyle = '#d9d5c6'; c.fillRect(s * .1, s * .25, s * .35, s * .75); for (let i = 0; i < 40; i++) { c.fillStyle = ['#d9a070', '#cf9060', '#e2b88a', '#b89a80'][i % 4]; c.globalAlpha = .28; c.beginPath(); c.arc(s * (.45 + Math.random() * .5), s * (.2 + Math.random() * .6), 6 + Math.random() * 10, 0, 7); c.fill(); } c.filter = 'none'; });
  const dayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: outside }); dayMat.name = 'day';

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 13.5), floorMaterial()); floor.rotation.x = -Math.PI / 2; floor.position.set(.5, 0, 2.2); floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(15, 13.5), M.ceil); ceil.rotation.x = Math.PI / 2; ceil.position.set(.5, H, 2.2); g.add(ceil);

  // ---- hall walls (positions read from the photos) ------------------------
  const wN = wall(g, 'x', 0, 1, 0, R.x1, []);                                                   // niche wall: art, stand, bench, PAX
  const wR = wall(g, 'z', 0, -1, R.z0, -T, [{ a: -2.1, b: -1.3, ped: true }]);                             // passage side, bathroom door
  const wE = wall(g, 'x', R.z0, 1, R.x0, 0, [{ a: -1.2, b: -.32, ped: true }]);                 // WC at the end of the passage
  const wL = wall(g, 'z', R.x0, 1, R.z0, R.z1, [{ a: -1.95, b: -1.15, ped: true }, { a: 1.95, b: 2.8 }]); // kitchen door ... entrance ... living-room door
  const wF = wall(g, 'x', R.z1, -1, R.x0, R.x1, [{ a: -.1, b: .75 }]);                          // club-room wall: print, door, mirror
  const wB = wall(g, 'z', R.x1, -1, 0, R.z1, [{ a: .95, b: 1.8 }, { a: 2.1, b: 2.9 }]);         // end wall: office door, bedroom door
  boxAt(g, -.024, 0, 0, .024, .1, .018, M.trim, false);
  const corner = (x, z, nx, nz) => { ao(g, v(x, 0, z), v(x, H, z), .28, v(nx, 0, 0), .3); ao(g, v(x, 0, z), v(x, H, z), .28, v(0, 0, nz), .3); };
  corner(R.x0 + .001, R.z1 - .001, 1, -1); corner(R.x1 - .001, R.z1 - .001, -1, -1); corner(R.x1 - .001, .001, -1, 1); corner(R.x0 + .001, R.z0 + .001, 1, 1); corner(-.001, R.z0 + .001, -1, 1);
  for (const [a, b, n] of [[v(0, H - .001, .001), v(R.x1, H - .001, .001), v(0, 0, 1)], [v(R.x0, H - .001, R.z1 - .001), v(R.x1, H - .001, R.z1 - .001), v(0, 0, -1)], [v(R.x0 + .001, H - .001, R.z0), v(R.x0 + .001, H - .001, R.z1), v(1, 0, 0)], [v(R.x1 - .001, H - .001, 0), v(R.x1 - .001, H - .001, R.z1), v(-1, 0, 0)], [v(-.001, H - .001, R.z0), v(-.001, H - .001, 0), v(-1, 0, 0)]]) { ao(g, a, b, .4, n, .2); const a2 = a.clone(), b2 = b.clone(); a2.y = b2.y = H; a2.addScaledVector(n, .001); b2.addScaledVector(n, .001); ao(g, a2, b2, .3, v(0, -1, 0), .2); }
  // white rails just under the ceiling on the niche and club-room walls
  boxAt(g, .08, H - .17, 0, 1.6, .028, .022, M.trim, false); boxAt(g, .9, H - .17, R.z1 - .022, 1.1, .028, .022, M.trim, false);

  // ---- doors ------------------------------------------------------------
  hang(wE, wE.userData.u(-1.2), 1, 0, .88);                    // WC, closed
  hang(wR, wR.userData.u(-1.3), -1, 1.5, .8);                  // bathroom
  hang(wL, wL.userData.u(1.95), -1, 1.5, .85);                 // living room, open into the room
  hang(wF, wF.userData.u(-.1), -1, 1.4, .85, true);            // club room (glazed)
  hang(wB, wB.userData.u(1.8), -1, 1.5, .85);                  // office
  hang(wB, wB.userData.u(2.9), -1, 1.6, .8, true);             // bedroom (glazed)
  const ent = portal(); ent.rotation.y = Math.PI / 2; ent.position.set(R.x0, 0, .38); g.add(ent);
  ao(g, v(R.x0 + .07, .001, -.5), v(R.x0 + .07, .001, 1.27), .2, v(1, 0, 0), .45);
  // projecting pier between entrance door and living-room door, with the fuse cabinet, intercom and switch
  const px0 = R.x0, pz0 = 1.27, pw_ = .3, pd_ = .45;
  boxAt(g, px0, 0, pz0, pw_, H, pd_, M.wall); boxAt(g, px0, 0, pz0 - .018, pw_ + .018, .1, pd_ + .036, M.trim, false); boxAt(g, px0, .1, pz0 - .024, pw_ + .024, .022, pd_ + .048, M.trim, false);
  boxAt(g, px0 + .02, 2.02, pz0 - .03, pw_ + .02, .52, .36, M.furn); ao(g, v(px0 + pw_ + .02, .001, pz0), v(px0 + pw_ + .02, .001, pz0 + pd_), .16, v(1, 0, 0), .4);
  const swP = new THREE.Group(); swP.rotation.y = Math.PI / 2; swP.position.x = px0 + pw_; g.add(swP);
  switches(swP, -1.5, .96, 0, 2, true); boxAt(swP, -1.547, 1.27, 0, .095, .17, .024, std({ color: 0xeeede8, roughness: .4 }), false); boxAt(swP, -1.535, 1.285, .024, .07, .05, .004, std({ color: 0x9aa3a6, roughness: .4 }), false);

  // switches, mirror, framed print
  const swL = new THREE.Group(); swL.rotation.y = Math.PI / 2; swL.position.x = R.x0; g.add(swL); switches(swL, .82, .98, 0, 2, true);      // passage, between entrance and kitchen
  const swR = new THREE.Group(); swR.rotation.y = -Math.PI / 2; swR.position.x = R.x1; g.add(swR); switches(swR, .73, .98, 0, 2, true);     // between PAX and office door
  const swF = new THREE.Group(); swF.rotation.y = Math.PI; swF.position.z = R.z1; g.add(swF); switches(swF, -1.0, .98, 0, 2, true);
  const mir = new THREE.Group(); mir.position.set(-1.57, .55, 0); swF.add(mir);
  boxAt(mir, -.29, 0, 0, .58, 1.48, .032, std({ color: 0x0b0b0c, roughness: .45 }));
  const mg = new Reflector(new THREE.PlaneGeometry(.52, 1.42), { textureWidth: 640, textureHeight: 1600, color: 0xb9bdbd, clipBias: .002 }); mg.position.set(0, .74, .0335); mir.add(mg); g.userData.mirror = mg;
  ao(swF, v(-1.86, .55, .002), v(-1.28, .55, .002), .07, v(0, -1, 0), .3);
  const print = framedArt(.52, .76); print.position.set(.78, 1.07, 0); swF.add(print);
  ao(swF, v(.52, 1.07, .002), v(1.04, 1.07, .002), .06, v(0, -1, 0), .3);

  // ---- rooms beyond the doorways (kept tidy: architecture and large furniture only) ----
  // club room (dining)
  stub(g, -1.3, R.z1 + T, R.x1, 7.4, 0xf1ede6, 'z0', .5, .1);
  for (const x of [.0, .95]) windowLight(g, dayMat, x, .85, 7.39, .8, 1.75, Math.PI, 1);
  const tbl = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .03, 48), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, roughness: .1, clearcoat: 1 })); tbl.scale.set(1.5, 1, 1); tbl.position.set(.75, .74, 5.7); g.add(tbl);
  for (const x of [.3, 1.2]) boxAt(g, x - .03, 0, 5.4, .06, .73, .6, std({ color: 0x101011, roughness: .3 }), false);
  cantilever(g, .15, 5.05, 2.6); cantilever(g, 1.0, 4.95, 3.2); cantilever(g, .3, 6.45, .2); cantilever(g, 1.3, 6.4, -.3);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.5, 8), M.chrome); pole.position.set(1.7, .75, 6.8); g.add(pole);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); shadeMat.name = 'shade'; shadeMat.color.setRGB(2.6, .62, .1);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .17, 32, 1, true), shadeMat); shade.material.side = THREE.DoubleSide; shade.position.set(1.7, 1.52, 6.8); g.add(shade);
  pool(g, .5, 5.9, 3.2, 3.6, 0xdfe8ff, .5); pool(g, .33, 3.3, 1.3, 1.6, 0xe8eeff, .22);
  // living room: palm, sling chair, navy sofa, rug
  stub(g, -5.3, 1.5, R.x0 - T, 5.4, 0xdde6f0, 'x1', .5, .05);
  windowLight(g, dayMat, -3.4, .9, 5.39, 1.5, 1.7, Math.PI, 3);
  palm(g, -3.3, 1.95); slingChair(g, -2.75, 2.75, 1.25);
  boxAt(g, -4.6, 0, 2.0, 1.7, .42, .85, std({ color: 0x1a2140, roughness: .9 }), false); boxAt(g, -4.6, .42, 2.0, 1.7, .3, .25, std({ color: 0x1a2140, roughness: .9 }), false);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), std({ color: 0x8a7f72, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-3.3, .004, 3.1); g.add(rug);
  pool(g, -3.2, 3.6, 3.2, 3.2, 0xd8e4ff, .45);

  // ---- kitchen: octagon tiles, cream fronts with grey worktops, window and balcony door ----
  const KX0 = -4.45, KX1 = R.x0 - T, KZ0 = -3.45, KZ1 = -.9;
  stub(g, KX0, KZ0, KX1, KZ1, 0xf3f3f0, 'x1', .6, .05);
  tileTex.repeat.set((R.x0 - KX0) / .3, (KZ1 - KZ0) / .3);
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(R.x0 - KX0, KZ1 - KZ0), std({ map: tileTex, roughness: .55 })); tile.rotation.x = -Math.PI / 2; tile.position.set((R.x0 + KX0) / 2, .0045, (KZ0 + KZ1) / 2); g.add(tile);
  boxAt(g, R.x0 - .012, 0, -1.97, .024, .006, .84, std({ color: 0x4a2f22, roughness: .6 }), false);
  const cream = std({ color: 0xf2eedb, roughness: .45 }), top = std({ color: 0x8b9096, roughness: .5 }), edge = std({ color: 0xc79a5e, roughness: .5 }), grey = std({ color: 0x8d9298, roughness: .7 }), alu = std({ color: 0xbfc3c8, metalness: 1, roughness: .35 });
  const worktop = (x, z, w, d) => { boxAt(g, x, .87, z, w, .012, d, edge, false); boxAt(g, x, .882, z, w, .026, d, top, false); boxAt(g, x, 0, z, w, .1, d, grey, false); };
  // drawer unit on the far wall: two stacks of three, backsplash, shelf
  { const z0 = -2.25, w = 1.35, dp = .6; worktop(KX0, z0, dp + .02, w); boxAt(g, KX0, .1, z0 + .01, dp - .02, .77, w - .02, cream, false);
    for (let c2 = 0; c2 < 2; c2++) for (const [yy, hh] of [[.11, .25], [.37, .25], [.63, .23]]) { rbox(g, KX0 + dp - .02, yy, z0 + .012 + c2 * (w / 2 - .004), .02, hh, w / 2 - .016, cream, .002); boxAt(g, KX0 + dp, yy + hh - .07, z0 + .2 + c2 * w / 2, .022, .02, w / 2 - .4, alu, false); }
    boxAt(g, KX0, .9, z0 - .05, .012, .55, w + .1, grey, false); boxAt(g, KX0, 1.42, z0 + .1, .2, .02, .75, cream, false); }
  // tall cupboard left of the door, sink run to the right of the door with a wall cupboard above
  rbox(g, -2.85, .1, KZ1 - .6, .6, 1.95, .6, cream); boxAt(g, -2.83, 0, KZ1 - .58, .56, .1, .56, grey, false);
  { const x = KX1 - .6, z0 = KZ0, w = 1.35; worktop(x - .02, z0, .62, w); boxAt(g, x, .1, z0, .6, .77, w - .01, cream, false);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(.4, .012, .55), alu); sink.position.set(x + .3, .912, z0 + w - .42); g.add(sink); boxAt(g, x + .12, .82, z0 + w - .66, .36, .09, .34, std({ color: 0x70757a, metalness: 1, roughness: .4 }), false);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(.09, .011, 8, 16, Math.PI), M.chrome); tap.position.set(x + .5, 1.0, z0 + w - .5); tap.rotation.y = Math.PI / 2; g.add(tap);
    rbox(g, x + .25, 1.45, z0, .35, .72, w - .1, cream); }
  // window with radiator below, balcony door, pantry opening
  windowLight(g, dayMat, -3.55, .95, KZ0 + .01, .85, 1.5, 0, 1); boxAt(g, -4.05, .9, KZ0, 1.0, .03, .2, M.trim, false); boxAt(g, -4.0, .2, KZ0 + .02, .9, .6, .09, M.trim, false);
  windowLight(g, dayMat, -2.62, .06, KZ0 + .01, .8, 2.3, 0, 1);
  boxAt(g, KX0 + .001, 0, -3.3, .012, 2.05, .8, std({ color: 0xc9ced2, roughness: .9, emissive: 0xc9ced2, emissiveIntensity: .35 }), false); for (const z of [-3.38, -2.5]) boxAt(g, KX0, 0, z, .03, 2.1, .08, M.trim, false); boxAt(g, KX0, 2.05, -3.38, .03, .08, .96, M.trim, false);
  pool(g, -3.0, -2.6, 2.8, 2.2, 0xe4ecff, .55); pool(g, R.x0 + .25, -1.55, 1.3, 1.4, 0xdfe8ff, .28);

  // ---- office: white room, trestle desk with screens, task chair, rug ----
  stub(g, R.x1 + T, -1.4, 5.95, 1.95, 0xf4f2ef, 'x0', .5, .06);
  { const dx = 4.0, dz = .1, dw = 1.6, dd = .8, tube = std({ color: 0xc9ccd0, metalness: 1, roughness: .3 });
    rbox(g, dx, .72, dz, dw, .025, dd, std({ color: 0xf6f6f4, roughness: .35 }), .004);
    for (const [x, z] of [[dx + .08, dz + .08], [dx + dw - .1, dz + .08], [dx + .08, dz + dd - .1], [dx + dw - .1, dz + dd - .1]]) boxAt(g, x, 0, z, .02, .72, .02, tube, false);
    for (const z of [dz + .08, dz + dd - .1]) boxAt(g, dx + .08, .68, z, dw - .18, .02, .02, tube, false); boxAt(g, dx + .08, .25, dz + .08, .02, .02, dd - .18, tube, false); boxAt(g, dx + dw - .1, .25, dz + .08, .02, .02, dd - .18, tube, false);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.5, .015, .015), tube); brace.position.set(dx + dw / 2, .46, dz + dd - .09); brace.rotation.z = .28; g.add(brace);
    const mon = new THREE.Group(); mon.position.set(dx + .75, .745, dz + .26); mon.rotation.y = -.5; g.add(mon);
    for (const [x, w, h, lit] of [[-.38, .62, .38, true], [.3, .34, .58, false]]) { boxAt(mon, x, .1, 0, w, h, .022, M.dark, false); if (lit) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(w - .03, h - .03), new THREE.MeshBasicMaterial({ color: 0xe9edf2 })); sc.position.set(x + w / 2, .1 + h / 2, .0235); mon.add(sc); } boxAt(mon, x + w / 2 - .02, 0, -.03, .04, .14, .03, M.dark, false); boxAt(mon, x + w / 2 - .1, 0, -.08, .2, .012, .16, M.dark, false); }
    officeChair(g, dx + 1.1, dz + 1.35, .5); }
  for (const z of [.45, 1.35]) { const sc = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 10), std({ color: 0xf2f0ec, roughness: .5, emissive: 0xf2f0ec, emissiveIntensity: .3 })); sc.scale.set(.6, 1.5, 1); sc.position.set(5.93, 1.8, z); g.add(sc); }
  windowLight(g, dayMat, 4.3, .9, -1.39, 1.4, 1.7, 0, 2);
  pool(g, 4.4, .6, 3.2, 3, 0xe9eeff, .4);
  // bedroom
  stub(g, R.x1 + T, 1.95 + .02, 5.9, 5.2, 0xdde5ee, 'x0', .5, .05);
  boxAt(g, 3.5, 0, 3.0, 2.05, .28, 1.7, std({ color: 0xa8763f, roughness: .6 }), false); boxAt(g, 3.52, .28, 3.02, 2.0, .2, 1.66, std({ color: 0x1f4a32, roughness: 1 }), false); boxAt(g, 5.0, .48, 3.1, .45, .12, 1.5, std({ color: 0xbcd3ee, roughness: 1 }), false);
  windowLight(g, dayMat, 5.89, .9, 2.8, 1.2, 1.6, -Math.PI / 2, 2); pool(g, 4.2, 3.2, 3, 3, 0xd8e4ff, .4);
  // bathroom
  stub(g, T, R.z0 - .2, 2.6, -.2, 0x6a6b6f, 'x0', .1, .02);

  // parquet border boards along the walls and across the passage mouth
  const brd = (x, z, w, d) => boxAt(g, x, 0, z, w, .0018, d, sill, false);
  brd(.02, .02, .86, .09); brd(R.x0 + .02, R.z1 - .11, R.x1 - R.x0 - .04, .09); brd(R.x1 - .11, .62, .09, R.z1 - .64); brd(R.x0 + .02, 1.74, .09, 1.2); brd(R.x0 + .09, -1.1, .09, 1.45); brd(-.11, R.z0 + .02, .09, -R.z0 - .02); brd(R.x0 + .02, R.z0 + .02, -R.x0 - .13, .09);

  // ---- radiator: flat panel with horizontal slats, behind the bench, running up to the PAX
  const rx = .845, rw = .93, ry = .14, rh = .87;
  const rad = std({ color: 0xf2f1ed, roughness: .36 });
  boxAt(g, rx + .004, ry + .004, .03, rw - .008, rh - .008, .062, std({ color: 0xa9a7a1, roughness: .6 }));
  for (const x of [rx - .006, rx + rw - .006]) rbox(g, x, ry, .028, .012, rh, .076, rad, .003);
  for (let i = 0; i < 40; i++) boxAt(g, rx + .02 + i * .0225, ry + rh + .0005, .04, .012, .001, .04, M.gap, false);
  const sl = (rh - 8 * .005) / 9; for (let k = 0; k < 9; k++) rbox(g, rx, ry + k * (sl + .005), .088, rw, sl, .014, rad, .003);
  boxAt(g, rx, ry + rh - .012, .03, rw, .012, .07, rad);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(.019, .019, .05, 20), M.trim); valve.rotation.z = Math.PI / 2; valve.position.set(rx + rw + .028, ry + rh - .05, .075); g.add(valve);
  const vk = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .02, 10), M.dark); vk.rotation.z = Math.PI / 2; vk.position.set(rx + rw + .005, ry + rh - .05, .075); g.add(vk);
  ao(g, v(rx, ry + rh, .001), v(rx + rw, ry + rh, .001), .12, v(0, 1, 0), .3); ao(g, v(rx - .002, ry, .001), v(rx - .002, ry + rh, .001), .08, v(-1, 0, 0), .3);

  // ---- SMÅSTAD bench 90 x 49 x 48, front flush with the PAX
  const bx = .9, bz = .11, bw = .9, bd = .49, bh = .48;
  rbox(g, bx, .0, bz, bw, bh - .021, bd - .018, M.furn);
  rbox(g, bx, bh - .018, bz, bw, .018, bd, M.furn);
  boxAt(g, bx + .002, bh - .0215, bz + .002, bw - .004, .004, bd - .004, M.gap, false);
  rbox(g, bx, .0, bz + bd - .018, bw, bh - .0215, .018, M.furn);
  ao(g, v(bx, .001, bz + bd), v(bx + bw, .001, bz + bd), .22, v(0, 0, 1), .5); ao(g, v(bx, .001, bz), v(bx, .001, bz + bd), .14, v(-1, 0, 0), .5);
  cushion(g, bx - .004, bh, bz + .004, bw + .008, bd + .004);

  // ---- PAX 50 x 60 x 236 with two narrow doors and a top unit, standing in the corner
  const px = 1.8, pw = .5, pd = .60, ph = 2.36, dt = .018;
  boxAt(g, px, 0, 0, pw, ph, pd - dt - .002, M.furn);
  for (const [y0, y1] of [[.012, 2.008], [2.012, ph]]) for (let k = 0; k < 2; k++) rbox(g, px + k * pw / 2 + .0015, y0, pd - dt, pw / 2 - .003, y1 - y0 - .003, dt, M.furn, .002);
  boxAt(g, px + .001, .0, pd - dt - .001, pw - .002, ph - .001, .002, M.gap, false); boxAt(g, px - .0005, 2.008, 0, .001, .004, pd - dt, M.gap, false);
  for (const sx of [-1, 1]) boxAt(g, px + pw / 2 + sx * .012 - .005, 1.0, pd, .01, .06, .02, M.furn);
  ao(g, v(px, .001, pd), v(px + pw, .001, pd), .28, v(0, 0, 1), .55); ao(g, v(px - .001, bh + .07, .11), v(px - .001, bh + .07, pd), .0, v(-1, 0, 0), 0);

  const art = artwork(g);

  // ceiling: downlights and a smoke detector
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); spotMat.name = 'spot'; spotMat.color.setRGB(40, 30, 19);
  const lamps = [[.9, 1.45], [1.75, 2.2], [-.6, .9], [-.65, -1.35], [.15, 2.45], [-.65, 2.35]];
  for (const [x, z] of lamps) { const s = new THREE.Mesh(new THREE.CircleGeometry(.036, 20), spotMat); s.rotation.x = Math.PI / 2; s.position.set(x, H - .002, z); g.add(s); const ring = new THREE.Mesh(new THREE.RingGeometry(.036, .052, 28), M.chrome); ring.rotation.x = Math.PI / 2; ring.position.set(x, H - .0015, z); g.add(ring); }
  const sd = new THREE.Mesh(new THREE.CylinderGeometry(.055, .05, .035, 28), std({ color: 0xf5f4f0, roughness: .5 })); sd.position.set(.45, H - .017, 1.7); g.add(sd);

  return { group: g, art, spotMat, dayMat, lamps, shadeMat, mirror: g.userData.mirror, glow: GLOW };
}

// ---- small props --------------------------------------------------------
export function buildBowl() {
  const g = new THREE.Group();
  const pts = [[0, .004], [.085, .004], [.112, .012], [.122, .028], [.125, .046], [.1235, .046], [.119, .03], [.108, .016], [.085, .0095], [0, .0095]].map(([x, y]) => new THREE.Vector2(x, y));
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, metalness: 1, roughness: .16, side: THREE.DoubleSide, envMapIntensity: 1.3 });
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(pts.slice(0, 5)).getPoints(24).concat(new THREE.SplineCurve(pts.slice(5)).getPoints(24)), 72), steel); bowl.castShadow = true; g.add(bowl);
  const item = (w, h, d, c, x, y, z, ry = 0, rough = .5, metal = 0, r = .003) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, h / 2.01)), std({ color: c, roughness: rough, metalness: metal })); m.position.set(x, y + h / 2, z); m.rotation.y = ry; g.add(m); return m; };
  item(.068, .016, .1, 0x0e5a4a, -.035, .012, .01, .25, .5, 0, .006);     // green leather wallet
  item(.058, .003, .1, 0xc9c9c6, -.036, .0105, .011, .25, .3, 1, .001);
  item(.085, .0012, .054, 0xb3121f, .04, .0115, .034, -.5, .3);           // red cards
  item(.085, .0012, .054, 0x9d0f1a, .05, .013, .03, -.2, .3);
  item(.09, .005, .058, 0x15161a, .046, .0145, .016, -.35, .3, 0, .002);  // black card sleeve
  const dev = item(.05, .018, .036, 0x2456d8, -.002, .012, -.062, .1, .35, 0, .006);  // little blue game device
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(.024, .018), new THREE.MeshStandardMaterial({ color: 0x9fb0a0, roughness: .2 })); sc.rotation.x = -Math.PI / 2; sc.position.set(.004, .0092, 0); dev.add(sc);
  item(.034, .014, .062, 0x111214, -.002, .012, .072, 1.3, .4, 0, .006);  // car key fob
  const ks = new THREE.Shape(); ks.absarc(0, 0, .011, .5, Math.PI * 2 - .5); ks.lineTo(.05, -.0035); ks.lineTo(.054, 0); ks.lineTo(.05, .0035); ks.holes.push(new THREE.Path().absarc(-.003, 0, .004, 0, Math.PI * 2));
  const kg = new THREE.ExtrudeGeometry(ks, { depth: .002, bevelEnabled: false, curveSegments: 10 }), km = std({ color: 0xb9bcc2, metalness: 1, roughness: .3 });
  for (const [x, y, z, a] of [[.03, .02, -.04, .9], [.04, .022, -.05, .35], [.02, .024, -.035, 1.5]]) { const k = new THREE.Mesh(kg, km); k.rotation.set(-Math.PI / 2, 0, a); k.position.set(x, y, z); g.add(k); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.014, .0011, 8, 28), M.chrome); ring.rotation.x = Math.PI / 2 - .2; ring.position.set(.022, .024, -.052); g.add(ring);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(.022, .003, 8, 28), std({ color: 0x1f8fd0, roughness: .6 })); loop.rotation.x = Math.PI / 2 - .1; loop.scale.set(1.6, 1, 1); loop.position.set(-.005, .016, .035); g.add(loop);
  return g;
}

export function buildStool() {
  const g = new THREE.Group();
  const pts = [[0, 0], [.135, 0], [.15, .012], [.148, .03], [.11, .06], [.07, .09], [.052, .13], [.05, .2], [.062, .255], [.12, .285], [.168, .3], [.185, .33], [.186, .385], [.17, .42], [.13, .435], [0, .437]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(60), 56), new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: .22, clearcoat: .6, clearcoatRoughness: .2 }));
  m.castShadow = m.receiveShadow = true; g.add(m); blob(g, 0, 0, .5, .5, .6);
  return g;
}
