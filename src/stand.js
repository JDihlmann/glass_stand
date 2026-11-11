import * as THREE from 'three';
import { makeGlassMaterial } from './glass.js';
import { buildArrangement } from './flowers.js';

export const L = { ROOM: 0, IN: 1, FAR: 2, NEAR: 3, MIRROR: 4 };
const setLayer = (o, l) => o.traverse((c) => c.layers.set(l));

export class Stand {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.matFar = makeGlassMaterial(THREE.BackSide); this.matNear = makeGlassMaterial(THREE.FrontSide);
    this.edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x1c8f6d, emissive: 0x0b5c44, emissiveIntensity: .55, roughness: .12, metalness: 0, envMapIntensity: 1.6 });
    this.mirrorMat = new THREE.ShaderMaterial({
      uniforms: { tMirror: { value: null }, tEnv: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uEnvI: { value: 1 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D tMirror; uniform samplerCube tEnv; uniform vec2 uRes; uniform float uEnvI; varying vec3 vW;
void main(){ vec4 r = texture2D(tMirror, gl_FragCoord.xy/uRes); vec3 V = normalize(vW-cameraPosition);
  vec3 env = textureLod(tEnv, reflect(V, vec3(0.,1.,0.)), 3.).rgb*uEnvI; gl_FragColor = vec4(mix(env, r.rgb, clamp(r.a,0.,1.))*.92, 1.); }`,
    });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.light = new THREE.PointLight(0xffc98a, 0, 3.2, 1.6); this.light.layers.enableAll(); this.group.add(this.light);
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.state = { W: .4, H: .9, flowers: 'violet', mirror: true, lamp: 'off', seed: 7 };
    this.parts = new THREE.Group(); this.group.add(this.parts);
    this.rebuild();
  }

  rebuild() {
    const { W, H, flowers, mirror, lamp, seed } = this.state;
    this.parts.traverse((o) => { if (o.geometry && o.name !== 'keep') o.geometry.dispose(); });
    this.parts.clear();
    const lid = .006, wallH = H - lid, t = .004;
    const pane = (w, h, top) => { const g = new THREE.PlaneGeometry(w, h); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + w / 2, p.getY(i) - h / 2 + (top ? h : 0)); return g; };
    const add = (g, pos, rx, ry) => { for (const [mat, layer] of [[this.matFar, L.FAR], [this.matNear, L.NEAR]]) { const m = new THREE.Mesh(g, mat); m.position.copy(pos); m.rotation.set(rx, ry, 0, 'YXZ'); m.layers.set(layer); this.parts.add(m); } };
    const wg = pane(W, wallH, false);
    add(wg, new THREE.Vector3(0, wallH / 2, W / 2), 0, 0); add(wg, new THREE.Vector3(0, wallH / 2, -W / 2), 0, Math.PI);
    add(wg, new THREE.Vector3(W / 2, wallH / 2, 0), 0, Math.PI / 2); add(wg, new THREE.Vector3(-W / 2, wallH / 2, 0), 0, -Math.PI / 2);
    add(pane(W, W, true), new THREE.Vector3(0, H, 0), -Math.PI / 2, 0);

    // green cut edges: corner posts, lid rim, foot rim
    const e = .0007, edge = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.edgeMat); m.position.set(x, y, z); m.layers.set(L.IN); this.parts.add(m); };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) edge(t, wallH, t, sx * (W / 2 - t / 2 + e), wallH / 2, sz * (W / 2 - t / 2 + e));
    for (const s of [-1, 1]) { edge(W + 2 * e, lid, t, 0, H - lid / 2 + e, s * (W / 2 - t / 2 + e)); edge(t, lid, W + 2 * e, s * (W / 2 - t / 2 + e), H - lid / 2 + e, 0); edge(W + 2 * e, .005, t, 0, .0025, s * (W / 2 - t / 2 + e)); edge(t, .005, W + 2 * e, s * (W / 2 - t / 2 + e), .0025, 0); }

    // contents
    const inner = new THREE.Group(); this.parts.add(inner);
    if (flowers !== 'none') { const a = buildArrangement(flowers, W, H - .02, seed); a.position.y = .01; inner.add(a);
      const fm = a.getObjectByName('flowers'); const sh = new THREE.Mesh(fm.geometry, this.shadowMat); sh.name = 'keep'; sh.position.y = .01; sh.castShadow = true; sh.layers.set(L.ROOM); this.shadowProxy = sh; }
    if (lamp === 'top') { const s = new THREE.Mesh(new THREE.RingGeometry(W * .30, W * .33, 4, 1, Math.PI / 4), this.lampMat); s.rotation.x = Math.PI / 2; s.position.y = H - lid - .004; inner.add(s); this.light.position.set(0, H - .09, 0); }
    if (lamp === 'globe') { const s = new THREE.Mesh(new THREE.SphereGeometry(.055, 32, 20), this.lampMat); s.position.set(W * .24, .065, W * .22); inner.add(s); const b = new THREE.Mesh(new THREE.CylinderGeometry(.03, .034, .012, 24), new THREE.MeshStandardMaterial({ color: 0x9a7a45, metalness: 1, roughness: .3 })); b.position.set(W * .24, .014, W * .22); inner.add(b); this.light.position.set(W * .24, .09, W * .22); }
    if (lamp === 'off') this.light.position.set(0, H * .5, 0);
    setLayer(inner, L.IN);
    if (this.shadowProxy && flowers !== 'none') this.parts.add(this.shadowProxy);
    // faint shadow of the glass body itself
    const fr = new THREE.Mesh(new THREE.BoxGeometry(W, .012, W), this.shadowMat); fr.position.y = H - .006; fr.castShadow = true; fr.layers.set(L.ROOM); this.parts.add(fr);

    this.mirror = new THREE.Mesh(new THREE.PlaneGeometry(W - .012, W - .012), this.mirrorMat); this.mirror.rotation.x = -Math.PI / 2; this.mirror.position.y = .008; this.mirror.layers.set(L.MIRROR); this.mirror.visible = mirror; this.parts.add(this.mirror);
    this.mirrorY = .008;
  }

  setLamp(intensity, color) { this.lampMat.color.copy(color).multiplyScalar(this.state.lamp === 'off' ? 0 : 1.2 + intensity * 4); this.light.color.copy(color); this.light.intensity = this.state.lamp === 'off' ? 0 : intensity * .9; }
}
