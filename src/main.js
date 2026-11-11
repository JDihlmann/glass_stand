import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { buildRoom, buildBowl, buildStool, blob, ROOM } from './room.js';
import { Stand, L } from './stand.js';
import { makeCopier } from './glass.js';
import { ARRANGEMENTS } from './flowers.js';
import { buildUI } from './ui.js';
import { unwrap, applyLightmap, exportForBake, setBaked } from './bake.js';

const canvas = document.getElementById('c');
// loading state: textures still on their way, and how many frames have been drawn
let texturesReady = false, framesDrawn = 0; const tStart = performance.now();
THREE.DefaultLoadingManager.onLoad = () => { texturesReady = true; };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
const NEAR = 0.05, FAR = 30;

// ---- room, props, stand --------------------------------------------------
const room = buildRoom(scene);
const SPOS = new THREE.Vector3(.5, 0, .262);
const stand = new Stand(scene); stand.group.position.copy(SPOS);
const standShadow = blob(scene, SPOS.x, SPOS.z, .62, .62, .5);
const bowl = buildBowl(); scene.add(bowl);
const stool = buildStool(); stool.position.set(.64, 0, .27); stool.visible = false; scene.add(stool);

// the wall mirror also shows what is inside the stand (flowers, lamp, green edges), without the glass optics
{ const orig = room.mirror.onBeforeRender; room.mirror.onBeforeRender = function (...a) { const objs = []; stand.parts.traverse((o) => { if (o.layers.mask === 2) objs.push(o); }); objs.forEach((o) => o.layers.set(0)); orig.apply(this, a); objs.forEach((o) => o.layers.set(1)); }; }

// ---- baked lighting ----
const LM_GAIN = 1.0; const lmInfo = unwrap(room.group); const LM = { scale: new THREE.Vector3(1, 1, 1), on: false, ready: false, k: 1, strips: [] };
const QS = new URLSearchParams(location.search);
// Baked lighting is switched off: the room uses the live lights only. To try a bake again, load the
// lightmap here with applyLightmap(room.group, texture, LM.scale) after running bake/bake.py.
if (QS.has('export')) exportForBake(room.group, { lamps: room.lamps, h: ROOM.h, lm: lmInfo }).then((n) => { console.log('exported for bake', n, JSON.stringify(lmInfo)); document.title = 'exported ' + n; });

// ---- lights ---------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0xe6d8c4, .5); scene.add(hemi);
const spots = room.lamps.slice(0, 5).map(([x, z], i) => {
  const s = new THREE.SpotLight(0xffd9ae, 14, 9, 1.05, .9, 1.7); s.position.set(x, ROOM.h - .03, z); s.target.position.set(x, 0, z); scene.add(s, s.target);
  if (i < 2) { s.castShadow = true; s.shadow.mapSize.set(i ? 1024 : 2048, i ? 1024 : 2048); s.shadow.bias = -.0004; s.shadow.normalBias = .012; s.shadow.radius = 9; s.shadow.blurSamples = 16; s.shadow.camera.near = .3; s.shadow.camera.far = 6; }
  else { s.angle = 1.35; s.penumbra = 1; }     // wide, soft cones so no light edge shows on distant doors
  return s;
});
// daylight falling through the dining-room doorway onto the niche
const fill = new THREE.DirectionalLight(0xdfe9ff, .5); fill.position.set(.35, 1.9, 6.9); fill.target.position.set(.55, .2, .6); scene.add(fill, fill.target);
fill.castShadow = true; fill.shadow.mapSize.set(2048, 2048); fill.shadow.camera.left = -6; fill.shadow.camera.right = 6; fill.shadow.camera.top = 3.6; fill.shadow.camera.bottom = -3.6; fill.shadow.camera.near = .2; fill.shadow.camera.far = 12.5; fill.shadow.bias = -.0005; fill.shadow.normalBias = .015; fill.shadow.radius = 12; fill.shadow.blurSamples = 20;
scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

// caustic grid thrown by the lit stand onto floor and walls
const gobo = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  uniforms: { uLamp: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, uI: { value: 0 }, uC: { value: SPOS }, uW: { value: .4 }, uH: { value: .9 }, uPitch: { value: .0125 }, uK: { value: 1 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 uLamp,uCol,uC; uniform float uI,uW,uH,uPitch,uK; varying vec3 vW;
void main(){ vec3 l=uLamp-uC, d=vW-uLamp; float r=length(d); vec3 h=vec3(uW*.5,uH,uW*.5);
  float tx=(sign(d.x)*h.x-l.x)/d.x, tz=(sign(d.z)*h.z-l.z)/d.z, ty = d.y>0. ? (h.y-l.y)/d.y : 1e3; float t=min(tx,min(tz,ty));
  if(t>=1.) discard; vec3 hit=l+d*t; vec2 q = t==tx ? hit.zy : (t==tz ? hit.xy : hit.xz);
  vec2 c = abs(cos(3.14159*q/uPitch)); float sharp = mix(7., 1.2, clamp((1.-t)*r*1.6,0.,1.));
  float g = mix(pow(c.x, sharp)*pow(c.y, sharp), .3, smoothstep(.1, .8, r - uW*.5)); g = g*uK + (1.-uK)*.3;
  float fall = 1./(1.+pow(r*3.6,2.)) * smoothstep(1.5, .6, r); gl_FragColor = vec4(uCol*uI*fall*g*.8, 1.); }`,
});
const mkGobo = (w, h, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gobo); m.position.copy(pos); m.rotation.copy(rot); m.renderOrder = 3; scene.add(m); };
mkGobo(3, 2.6, new THREE.Vector3(.6, .002, 1.3), new THREE.Euler(-Math.PI / 2, 0, 0));
mkGobo(.86, 2, new THREE.Vector3(.43, 1, .002), new THREE.Euler(0, 0, 0));

// ---- render targets & passes ---------------------------------------------
const mkRT = () => { const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true }); rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType; return rt; };
const rtA = mkRT(), rtB = mkRT(), rtC = mkRT(); rtC.texture.generateMipmaps = false; rtC.texture.minFilter = THREE.LinearFilter;
const rtM = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const copy = makeCopier();
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(.05, 20, cubeRT); cubeCam.layers.set(L.ROOM); scene.add(cubeCam);
const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null;
const mirrorCam = new THREE.PerspectiveCamera(); mirrorCam.matrixAutoUpdate = false; mirrorCam.matrixWorldAutoUpdate = false;

// ---- screen-space ambient occlusion (darkens creases, corners and contact lines) ----
const aoA = new THREE.WebGLRenderTarget(4, 4), aoB = new THREE.WebGLRenderTarget(4, 4);
const fsVert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const fsMat = (uniforms, fragmentShader) => new THREE.ShaderMaterial({ uniforms, vertexShader: fsVert, fragmentShader, depthTest: false, depthWrite: false });
const aoMat = fsMat({ tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uRadius: { value: .32 } }, `
uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform float uRadius; varying vec2 vUv;
vec3 vpos(vec2 uv){ float d=texture2D(tDepth,uv).x; vec4 v=uProjInv*vec4(uv*2.-1., d*2.-1., 1.); return v.xyz/v.w; }
void main(){
  float d0=texture2D(tDepth,vUv).x; if(d0>=.9999){ gl_FragColor=vec4(1.); return; }
  vec3 p=vpos(vUv); vec3 n=normalize(cross(dFdx(p),dFdy(p))); if(n.z<0.) n=-n;
  vec3 t=normalize(cross(n, abs(n.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))), b=cross(n,t);
  float ign=fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715))));
  float occ=0.; const int N=14;
  for(int i=0;i<N;i++){ float fi=(float(i)+.5)/float(N); float a=(float(i)+ign)*2.399963; float r=sqrt(fi)*.9; float h=sqrt(1.-r*r)+.12;
    vec3 s=p+(t*cos(a)*r+b*sin(a)*r+n*h)*uRadius*mix(.15,1.,fi*fi);
    vec4 c=uProj*vec4(s,1.); vec2 uv=c.xy/c.w*.5+.5; float sz=vpos(uv).z;
    occ += step(s.z + .015 + .012*abs(p.z), sz) * smoothstep(0.,1., uRadius/max(abs(p.z-sz),1e-4)); }
  float graze=smoothstep(.06,.35, dot(n, normalize(-p))); float fade=1.-smoothstep(5.,9.,-p.z); gl_FragColor=vec4(vec3(1.-occ/float(N)*graze*fade),1.); }`);
const blurMat = fsMat({ tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNear: { value: .05 }, uFar: { value: 30 } }, `
uniform sampler2D tAO,tDepth; uniform vec2 uDir; uniform float uNear,uFar; varying vec2 vUv;
float lin(vec2 uv){ float d=texture2D(tDepth,uv).x; return uNear*uFar/((uFar-uNear)*d-uFar); }
void main(){ float c=lin(vUv), s=0., w=0.; for(int i=-4;i<=4;i++){ vec2 o=uDir*float(i)*1.4; float z=lin(vUv+o); float wt=exp(-float(i*i)/9.)*step(abs(z-c), .06*max(1.,abs(c)*.4)); s+=texture2D(tAO,vUv+o).r*wt; w+=wt; } gl_FragColor=vec4(vec3(s/max(w,1e-4)),1.); }`);
const compMat = fsMat({ tC: { value: null }, tAO: { value: null }, uStr: { value: .8 } }, `
uniform sampler2D tC,tAO; uniform float uStr; varying vec2 vUv;
void main(){ vec3 c=texture2D(tC,vUv).rgb; float a=texture2D(tAO,vUv).r; a=smoothstep(.0,.92,a); float l=max(c.r,max(c.g,c.b)); a=mix(a,1.,smoothstep(1.2,3.,l)); gl_FragColor=vec4(c*mix(1.,a,uStr),1.); }`);
const fsScene = new THREE.Scene(), fsCam = new THREE.Camera(), fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), aoMat); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const fs = (mat, target) => { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

const composer = new EffectComposer(renderer);
composer.addPass(new TexturePass(rtB.texture));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), .13, .5, 1.5); composer.addPass(bloom);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);

for (const m of [stand.matFar, stand.matNear]) { m.uniforms.uProj.value = camera.projectionMatrix; m.uniforms.tEnv.value = cubeRT.texture; m.uniforms.uNear.value = NEAR; m.uniforms.uFar.value = FAR; }
stand.mirrorMat.uniforms.tEnv.value = cubeRT.texture; stand.mirrorMat.uniforms.tMirror.value = rtM.texture;

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  for (const rt of [rtA, rtB, rtC, rtM]) rt.setSize(s.x, s.y); for (const rt of [aoA, aoB]) rt.setSize(Math.ceil(s.x / 2), Math.ceil(s.y / 2));
  for (const m of [stand.matFar, stand.matNear, stand.mirrorMat]) m.uniforms.uRes.value.copy(s);
  fxaa.material.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  // keep the scene centred in the area the panel leaves free: beside it on desktop, above the open sheet on phones
  const panel = document.getElementById('panel'), hidden = document.body.classList.contains('collapsed'), phone = w < 700;
  const pad = hidden || phone ? 0 : 318, padY = !hidden && phone && !panel.classList.contains('closed') ? Math.min(panel.offsetHeight, h * .5) : 0;
  camera.aspect = (w + pad) / (h + padY); camera.fov = w / h < 1 ? 62 : 47; camera.setViewOffset(w + pad, h + padY, pad, padY, w, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---- state ----------------------------------------------------------------
const S = { object: 'stand', flowers: 'violet', glass: 'edelit', strength: 1, mirror: true, lamp: 'off', lampI: .7, warmth: .7, time: 'day', H: .9, W: .4, bowl: true, spin: false };
let envDirty = true;
const kelvin = (t) => new THREE.Color().setRGB(1, THREE.MathUtils.lerp(.93, .62, t), THREE.MathUtils.lerp(.86, .28, t));

function apply(rebuild = false) {
  const isStand = S.object === 'stand';
  Object.assign(stand.state, { W: S.W, H: S.H, flowers: S.flowers, mirror: S.mirror, lamp: S.lamp });
  if (rebuild) stand.rebuild();
  stand.group.visible = isStand; standShadow.visible = isStand; stool.visible = !isStand;
  standShadow.scale.setScalar(S.W / .4);
  stand.mirror.visible = S.mirror;
  bowl.visible = S.bowl; bowl.position.set(isStand ? SPOS.x : stool.position.x, isStand ? S.H : .437, isStand ? SPOS.z : stool.position.z);
  const axis = S.glass === 'flutes' ? [1, 0] : [1, 1], k = S.glass === 'clear' ? 0 : S.strength;
  for (const m of [stand.matFar, stand.matNear]) { m.uniforms.uAxis.value.set(...axis); m.uniforms.uStrength.value = k; m.uniforms.uSparkle.value = k > 0 ? 1 : 0; }
  // lighting
  const day = S.time === 'day';
  room.dayMat.color.setRGB(...(day ? [1.7, 1.95, 2.3] : [.02, .025, .04])); room.shadeMat.color.setRGB(...(day ? [1.6, .4, .07] : [3.2, .8, .14]));
  room.spotMat.color.setRGB(40, 30, 19);
  spots.forEach((s) => (s.intensity = day ? 6.5 : 5.2));
  hemi.intensity = day ? .5 : .14; fill.intensity = day ? .7 : 0; for (const [m, d, e] of room.glow) { if (m.isMeshStandardMaterial) m.emissiveIntensity = day ? d : e; else m.opacity = LM.on ? 0 : (day ? d : e); }
  if (day) LM.scale.setScalar(LM.k); else LM.scale.set(.62, .5, .36).multiplyScalar(LM.k);
  room.art.uniforms.uLight.value = day ? .95 : .5;
  renderer.toneMappingExposure = day ? .88 : .8;
  const lc = kelvin(S.warmth); stand.setLamp(isStand ? S.lampI : 0, lc);
  gobo.uniforms.uI.value = isStand && S.lamp !== 'off' ? S.lampI * (day ? .3 : .5) : 0; gobo.uniforms.uCol.value.copy(lc);
  gobo.uniforms.uLamp.value.copy(stand.light.position).add(SPOS); gobo.uniforms.uW.value = S.W; gobo.uniforms.uH.value = S.H; gobo.uniforms.uK.value = Math.min(k, 1) * (S.glass === 'clear' ? 0 : 1);
  renderer.shadowMap.needsUpdate = true; envDirty = true;
}

function captureEnv() {
  const vis = [bowl.visible, stool.visible]; bowl.visible = stool.visible = false;
  cubeCam.position.set(SPOS.x, .6, SPOS.z + .1);
  for (let i = 0; i < 2; i++) {
    cubeCam.update(renderer, scene);
    const next = pmrem.fromCubemap(cubeRT.texture); if (envRT) envRT.dispose(); envRT = next; scene.environment = envRT.texture;
  }
  scene.environmentIntensity = .7;
  [bowl.visible, stool.visible] = vis; envDirty = false;
}

// ---- camera ---------------------------------------------------------------
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = .45; controls.maxDistance = 6.5; controls.maxPolarAngle = Math.PI * .56; controls.minPolarAngle = .15; controls.zoomSpeed = .7; controls.rotateSpeed = .6; controls.panSpeed = .5;
const VIEWS = {
  hero: [[1.15, 1.42, 2.6], [.85, .72, .2]],
  front: [[.5, .8, 2.3], [.5, .5, .26]],
  close: [[1.1, 1.0, 1.2], [.5, .6, .26]],
  top: [[.85, 1.72, .95], [.5, .86, .26]],
  hall: [[-.85, 1.55, .5], [.9, .9, .2]],
  wide: [[2.05, 1.55, 2.8], [.1, .95, .3]],
  bed: [[2.1, 1.5, 1.38], [-1.3, 1.1, 1.05]],
  passage: [[-.65, 1.5, -1.95], [-.35, 1.1, 2.9]],
};
let tween = null;
function goView(name, instant) {
  const [p, t] = VIEWS[name]; const P = new THREE.Vector3(...p), T = new THREE.Vector3(...t); T.y *= S.H / .9;
  wantDist = 0;
  if (instant) { camera.position.copy(P); controls.target.copy(T); return; }
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), P, T, k: 0 };
}
// where the camera may stand: the hall and the passage, minus a margin to the walls, the bench and the wardrobe
const inHall = (p) => p.x > ROOM.x0 + .46 && p.x < ROOM.x1 - .18 && p.z > .18 && p.z < ROOM.z1 - .18;
const inPassage = (p) => p.x > ROOM.x0 + .22 && p.x < -.22 && p.z > ROOM.z0 + .22 && p.z <= .3;
const inY = (p) => p.y >= .12 && p.y <= ROOM.h - .12;
const insideRoom = (p) => inY(p) && ((inHall(p) && !(p.x > .74 && p.z < .82 && (p.y < .9 || p.x > 1.7))) || inPassage(p));
// what the camera may look across: the same space including the low bench (the target itself may sit inside it), but not the wardrobe or any wall
const seeThrough = (p) => inY(p) && ((inHall(p) && !(p.x > 1.7 && p.z < .82)) || inPassage(p));
const camTry = new THREE.Vector3(), camDir = new THREE.Vector3();
// the farthest spot along dir, up to max, where the camera can stand with a clear line back to the target (continuous, so orbiting along a wall glides)
function freeDist(t, dir, max) {
  const n = 48; let last = -1;
  for (let i = 0; i <= n; i++) { camTry.copy(t).addScaledVector(dir, max * i / n); if (!seeThrough(camTry)) break; if (insideRoom(camTry)) last = i; }
  if (last < 0) return 0; if (last === n) return max;
  let lo = max * last / n, hi = max * (last + 1) / n;
  for (let j = 0; j < 12; j++) { const m = (lo + hi) / 2; camTry.copy(t).addScaledVector(dir, m); if (insideRoom(camTry)) lo = m; else hi = m; }
  return lo;
}
// how far the camera can back out from distance h along dir without leaving free space
function roomAhead(t, dir, h, max) {
  if (max <= h) return h; const n = 32; let lo = h;
  for (let i = 1; i <= n; i++) { const d = h + (max - h) * i / n; camTry.copy(t).addScaledVector(dir, d);
    if (insideRoom(camTry)) { lo = d; continue; }
    let hi = d; for (let j = 0; j < 10; j++) { const m = (lo + hi) / 2; camTry.copy(t).addScaledVector(dir, m); if (insideRoom(camTry)) lo = m; else hi = m; } return lo; }
  return max;
}
// Orbit collision without jumps. wantDist is the distance the user chose, haveDist the one shown, lastDir the direction shown.
// The shown distance never shrinks faster than IN_SPEED and grows back no faster than OUT_SPEED. Where a turn would need more than that
// (a corner, the wardrobe, the wall behind the stand) the turn itself is held back while the camera moves in, so nothing ever snaps.
const IN_SPEED = 2.2, OUT_SPEED = 1.8, MIN_FREE = .42;
let wantDist = 0, haveDist = 0; const lastDir = new THREE.Vector3(), camDir2 = new THREE.Vector3();
function preCam() { if (wantDist && !tween) { camDir.subVectors(camera.position, controls.target).normalize(); camera.position.copy(controls.target).addScaledVector(camDir, wantDist); } }
function clampCam(dt) {
  const t = controls.target; t.x = THREE.MathUtils.clamp(t.x, -.8, 2.0); t.z = THREE.MathUtils.clamp(t.z, .2, 2.6); t.y = THREE.MathUtils.clamp(t.y, .15, 2);
  camDir.subVectors(camera.position, t); const r = camDir.length(); camDir.divideScalar(r || 1);
  if (!wantDist || tween) { wantDist = r; haveDist = freeDist(t, camDir, r); lastDir.copy(camDir); camera.position.copy(t).addScaledVector(camDir, haveDist); return; }
  const zoom = r / wantDist, zooming = Math.abs(zoom - 1) > 1e-5;
  // 1. turning: accept as much of the turn as the shown distance can follow at IN_SPEED
  const step = IN_SPEED * dt, floor = Math.max(MIN_FREE, Math.min(wantDist * .5, 1));
  const need = Math.max(haveDist - step, Math.min(haveDist, floor));
  let fit = freeDist(t, camDir, haveDist), held = false;
  if (fit < need - 1e-6 && lastDir.lengthSq() > 0) {
    const fit0 = freeDist(t, lastDir, haveDist);
    if (fit0 >= need - 1e-6) {   // search the part of the turn that still fits
      let lo = 0, hi = 1; for (let j = 0; j < 7; j++) { const m = (lo + hi) / 2; camDir2.copy(lastDir).lerp(camDir, m).normalize(); if (freeDist(t, camDir2, haveDist) >= need - 1e-6) lo = m; else hi = m; }
      camDir.copy(lastDir).lerp(camDir, lo).normalize(); held = true;
      fit = freeDist(t, camDir, haveDist > floor ? haveDist - step : haveDist);   // keep moving in while the user pushes against the obstacle
      if (fit < need - 1e-6) fit = freeDist(t, camDir, haveDist);
    }
  }
  haveDist = fit; lastDir.copy(camDir);
  // 2. zooming acts on what is on screen and stops at the wall; otherwise ease back out towards the chosen distance when there is room
  if (zooming) {
    const z = haveDist * zoom;
    if (zoom > 1) haveDist = roomAhead(t, camDir, haveDist, z); else { const f = freeDist(t, camDir, z); if (f > z - .06) haveDist = f; }
    wantDist = haveDist;
  } else if (!held && wantDist > haveDist) {
    const goal = roomAhead(t, camDir, haveDist, wantDist);
    haveDist += Math.min((goal - haveDist) * (1 - Math.exp(-dt * 3.5)), OUT_SPEED * dt);
  }
  camera.position.copy(t).addScaledVector(camDir, haveDist);
}

// ---- frame ----------------------------------------------------------------
const reflM = new THREE.Matrix4();
function render() {
  if (envDirty) captureEnv();
  renderer.autoClear = true; renderer.setClearColor(0x000000, 1);
  camera.layers.set(L.ROOM); renderer.setRenderTarget(rtA); renderer.render(scene, camera);
  const glassOn = stand.group.visible;
  if (glassOn && S.mirror) {
    const y = stand.mirrorY; reflM.set(1, 0, 0, 0, 0, -1, 0, 2 * y, 0, 0, 1, 0, 0, 0, 0, 1);
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix); mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    mirrorCam.matrixWorld.multiplyMatrices(reflM, camera.matrixWorld); mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
    mirrorCam.layers.set(L.IN); renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(rtM); renderer.render(scene, mirrorCam);
  }
  renderer.autoClear = false;
  renderer.setRenderTarget(rtB); copy(renderer, rtA);
  if (glassOn) {
    stand.matFar.uniforms.tScene.value = rtA.texture; stand.matFar.uniforms.tDepth.value = rtA.depthTexture;
    camera.layers.set(L.IN); camera.layers.enable(L.FAR); camera.layers.enable(L.MIRROR); renderer.render(scene, camera);
  }
  renderer.setRenderTarget(rtC); copy(renderer, rtB);
  if (glassOn) {
    stand.matNear.uniforms.tScene.value = rtB.texture; stand.matNear.uniforms.tDepth.value = rtB.depthTexture;
    camera.layers.set(L.NEAR); renderer.render(scene, camera);
  }
  // ambient occlusion from the final depth, blurred, then multiplied in
  aoMat.uniforms.tDepth.value = rtC.depthTexture; aoMat.uniforms.uProj.value.copy(camera.projectionMatrix); aoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse); fs(aoMat, aoA);
  blurMat.uniforms.tDepth.value = rtC.depthTexture; blurMat.uniforms.tAO.value = aoA.texture; blurMat.uniforms.uDir.value.set(1 / aoA.width, 0); fs(blurMat, aoB);
  blurMat.uniforms.tAO.value = aoB.texture; blurMat.uniforms.uDir.value.set(0, 1 / aoA.height); fs(blurMat, aoA);
  compMat.uniforms.tC.value = rtC.texture; compMat.uniforms.tAO.value = aoA.texture; fs(compMat, rtB);
  renderer.setRenderTarget(null); renderer.autoClear = true;
  composer.render();
}

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), .05);
  if (tween) {
    tween.k = Math.min(1, tween.k + dt / 1.3); const e = tween.k < .5 ? 4 * tween.k ** 3 : 1 - Math.pow(-2 * tween.k + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.P, e); controls.target.lerpVectors(tween.t0, tween.T, e); if (tween.k >= 1) tween = null;
  }
  controls.autoRotate = S.spin && !tween; controls.autoRotateSpeed = .55;
  preCam(); controls.update(); clampCam(dt); camera.lookAt(controls.target); camera.updateMatrixWorld();
  render();
  if (framesDrawn < 1e6 && ++framesDrawn) {
    if (framesDrawn === 2) { document.body.classList.add('first'); document.getElementById('loader-text').textContent = 'Placing the flowers…'; }
    if (framesDrawn > 8 && (texturesReady || performance.now() - tStart > 9000)) { document.body.classList.add('ready'); framesDrawn = 1e6; }
  }
  requestAnimationFrame(frame);
}
canvas.addEventListener('pointerdown', () => { tween = null; });

buildUI(S, { apply, goView, flowers: Object.fromEntries(Object.entries(ARRANGEMENTS).map(([k, v]) => [k, v.label])), reseed() { stand.state.seed = Math.floor(Math.random() * 1e4); apply(true); } });
resize(); apply(true); goView('hero', true);
window.__app = { S, apply, goView, camera, controls, renderer, stand, scene, preCam, clampCam, insideRoom };
requestAnimationFrame(frame);
