import * as THREE from 'three';

// Procedural flower arrangements, merged into one vertex-coloured mesh each.

const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const C = (h) => new THREE.Color(h);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

class Builder {
  constructor() { this.p = []; this.c = []; this.i = []; }
  grid(nu, nv, fn) {
    const base = this.p.length / 3; const P = V3(), col = new THREE.Color();
    for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) { fn(u / nu, v / nv, P, col); this.p.push(P.x, P.y, P.z); this.c.push(col.r, col.g, col.b); }
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) { const a = base + v * (nu + 1) + u, b = a + 1, c = a + nu + 1, d = c + 1; this.i.push(a, b, c, b, d, c); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeVertexNormals(); return g;
  }
}

function frame(pos, dir, roll = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  return new THREE.Matrix4().compose(pos, q, V3(1, 1, 1));
}
const mRY = (a) => new THREE.Matrix4().makeRotationY(a), mRX = (a) => new THREE.Matrix4().makeRotationX(a), mT = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function petal(B, M, L, W, o = {}) {
  const { cup = .4, curl = .2, c0, c1, nu = 4, nv = 5, pinch = .75, ruffle = 0, sat = 1 } = o;
  const ph = Math.random() * 6;
  B.grid(nu, nv, (u, v, P, col) => {
    const s = u * 2 - 1; const w = W * .5 * Math.pow(Math.sin(Math.PI * Math.min(1, v * .9 + .08)), pinch);
    const x = s * w;
    P.set(x, L * v, -cup * x * x / W * 4 + curl * L * v * v + ruffle * L * v * Math.sin(s * 5 + ph)).applyMatrix4(M);
    col.copy(c0).lerp(c1, Math.pow(v, 1.3)).multiplyScalar((.82 + .18 * (1 - s * s)) * sat);
  });
}
function ringFlower(B, pos, dir, R, rings, r) {
  const F = frame(pos, dir, r() * 6);
  rings.forEach((g) => {
    const off = r() * 6;
    for (let k = 0; k < g.n; k++) {
      const M = F.clone().multiply(mRY(off + k / g.n * Math.PI * 2 + (r() - .5) * .25)).multiply(mT(0, g.y || 0, g.r0 || 0)).multiply(mRX(g.tilt + (r() - .5) * .15));
      petal(B, M, g.L * R * (.9 + r() * .2), g.W * R, { ...g, sat: .85 + r() * .3 });
    }
  });
}
function ball(B, pos, R, c0, c1, bump = 0, sy = 1, nu = 10, nv = 7) {
  B.grid(nu, nv, (u, v, P, col) => {
    const th = u * Math.PI * 2, ph = v * Math.PI; const k = 1 + bump * Math.sin(th * 7) * Math.sin(ph * 9);
    P.set(Math.sin(ph) * Math.cos(th) * R * k, Math.cos(ph) * R * sy * k, Math.sin(ph) * Math.sin(th) * R * k).add(pos);
    col.copy(c0).lerp(c1, 1 - v);
  });
}
function stem(B, a, b, ctrl, rad, col0, col1 = col0, n = 7) {
  const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b); const T = V3(), N = V3(), Bn = V3(), Q = V3();
  B.grid(4, n, (u, v, P, col) => {
    curve.getPoint(v, Q); curve.getTangent(v, T); N.crossVectors(T, Math.abs(T.y) > .95 ? V3(1, 0, 0) : UP).normalize(); Bn.crossVectors(T, N);
    const th = u * Math.PI * 2; P.copy(Q).addScaledVector(N, Math.cos(th) * rad).addScaledVector(Bn, Math.sin(th) * rad); col.copy(col0).lerp(col1, v);
  });
  return curve;
}
function leaf(B, pos, dir, L, c0, c1, r, W = .38) {
  petal(B, frame(pos, dir, r() * 6).multiply(mRX(.5 + r() * .7)), L, L * W, { cup: .35, curl: .35, c0, c1, nu: 4, nv: 6, pinch: .6, sat: .8 + r() * .4 });
}

// ---- flower heads -------------------------------------------------------
const heads = {
  rose(B, p, d, R, r, pal) {
    const [c0, c1] = pal; const rings = [];
    for (let i = 0; i < 5; i++) rings.push({ n: 3 + i * 2, tilt: .08 + i * .27, L: .62 + .1 * i, W: .7 + .08 * i, r0: R * .04 * i, cup: .55, curl: .08 + .09 * i, c0: c0.clone().multiplyScalar(.75 + .06 * i), c1, ruffle: .03 });
    ringFlower(B, p, d, R, rings, r);
  },
  peony(B, p, d, R, r, pal) {
    const [c0, c1] = pal; const rings = [];
    for (let i = 0; i < 6; i++) rings.push({ n: 5 + i * 2, tilt: .15 + i * .26, L: .55 + .09 * i, W: .6, r0: R * .05 * i, cup: .7, curl: -.05 + .06 * i, c0, c1, ruffle: .09 });
    ringFlower(B, p, d, R, rings, r);
  },
  dahlia(B, p, d, R, r, pal) {
    const [c0, c1] = pal; const rings = [];
    for (let i = 0; i < 7; i++) rings.push({ n: 9 + i * 3, tilt: .12 + i * .27, L: .5 + .07 * i, W: .2, r0: R * .03 * i, cup: .9, curl: .1, c0, c1, nu: 2, nv: 3 });
    ringFlower(B, p, d, R, rings, r);
  },
  anemone(B, p, d, R, r, pal) {
    const [c0, c1, cc = C('#1b1420')] = pal;
    ringFlower(B, p, d, R, [{ n: 7, tilt: 1.15, L: 1, W: .75, cup: .25, curl: -.12, c0, c1, r0: R * .1 }, { n: 6, tilt: .95, L: .85, W: .7, cup: .3, curl: -.1, c0, c1, r0: R * .08 }], r);
    ball(B, p.clone().addScaledVector(d, R * .1), R * .26, cc, cc.clone().multiplyScalar(1.6), .12, .6);
  },
  daisy(B, p, d, R, r, pal) {
    const [c0, c1, cc = C('#e2b21c')] = pal;
    ringFlower(B, p, d, R, [{ n: 16, tilt: 1.35, L: 1, W: .26, cup: .2, curl: .1, c0, c1, r0: R * .18, nu: 2, nv: 3 }], r);
    ball(B, p.clone().addScaledVector(d, R * .05), R * .27, cc.clone().multiplyScalar(.7), cc, .1, .55);
  },
  tulip(B, p, d, R, r, pal) {
    const [c0, c1] = pal;
    ringFlower(B, p, d, R, [{ n: 3, tilt: .2, L: 1.9, W: 1.25, cup: .85, curl: -.1, c0, c1, r0: R * .12, pinch: .55 }, { n: 3, tilt: .3, L: 1.8, W: 1.25, cup: .8, curl: -.06, c0, c1, r0: R * .2, pinch: .55 }], r);
  },
  poppy(B, p, d, R, r, pal) {
    const [c0, c1] = pal;
    ringFlower(B, p, d, R, [{ n: 4, tilt: .95, L: 1.1, W: 1.3, cup: .35, curl: -.1, c0, c1, r0: R * .08, ruffle: .12, pinch: .45 }], r);
    ball(B, p.clone().addScaledVector(d, R * .12), R * .2, C('#20301a'), C('#93a34e'), .2, .9);
  },
  allium(B, p, d, R, r, pal) { ball(B, p, R * .8, pal[0], pal[1], .16, 1, 16, 12); },
  thistle(B, p, d, R, r, pal) {
    ball(B, p, R * .45, pal[0], pal[1], .2, 1.2);
    ringFlower(B, p, d, R, [{ n: 12, tilt: 1.3, L: .9, W: .12, cup: .3, curl: -.2, c0: pal[0], c1: pal[1], nu: 1, nv: 2 }], r);
  },
};

// ---- arrangement helpers ------------------------------------------------
function spots(n, a, y0, y1, r, bias = .5) {
  const out = [];
  for (let k = 0; k < n * 30 && out.length < n; k++) {
    const th = r() * Math.PI * 2, rho = (bias + (1 - bias) * Math.sqrt(r())) * a * 1.25;
    const p = V3(THREE.MathUtils.clamp(Math.cos(th) * rho, -a, a), y0 + (y1 - y0) * Math.pow(r(), .8), THREE.MathUtils.clamp(Math.sin(th) * rho, -a, a));
    if (out.every((q) => q.distanceTo(p) > a * .3)) out.push(p);
  }
  return out;
}
const outDir = (p, up = .5) => V3(p.x, 0, p.z).normalize().multiplyScalar(1).add(V3(0, up, 0)).normalize();

function vase(kind, h, rad) {
  const pts = [];
  if (kind === 'glass') { for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(rad * (.82 + .18 * Math.sin(t * 2.2 + .4)), t * h)); } }
  else { for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(rad * (.45 + .75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * .95 + .08)), .7) - .12 * t), t * h)); } }
  const g = new THREE.LatheGeometry(pts, 40);
  const m = kind === 'glass'
    ? new THREE.MeshPhysicalMaterial({ color: 0xa9d6c0, roughness: .04, metalness: 0, transparent: true, opacity: .42, side: THREE.DoubleSide, envMapIntensity: 2.2, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: kind === 'terracotta' ? 0xb7694a : 0xe9e2d4, roughness: .82, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
  const group = new THREE.Group(); group.add(mesh);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(pts[0].x, 40), m); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .002; group.add(bottom);
  return group;
}

const G1 = C('#2f5a25'), G2 = C('#6f9a3c'), G3 = C('#1f3d22');

function lush(B, a, H, r, picks, nHeads, hv, leafN = 70) {
  const mouth = V3(0, hv, 0);
  const pts = [...spots(nHeads, a, hv * .85, H - .075, r, .62), ...spots(Math.round(nHeads * .22), a, hv * .3, hv * .85, r, .92)];
  pts.forEach((p) => {
    const pk = picks[Math.floor(r() * picks.length)]; const R = pk.R * (.85 + r() * .35);
    const d = outDir(p, p.y < hv ? -.15 : .35 + r() * .5);
    const neck = p.clone().addScaledVector(d, -R * .25);
    stem(B, V3((r() - .5) * .03, hv * .1, (r() - .5) * .03), neck, V3(neck.x * .25, Math.max(neck.y, hv) + .03, neck.z * .25), .0034, G3, G2);
    heads[pk.t](B, p, d, R, r, pk.pal[Math.floor(r() * pk.pal.length)]);
  });
  spots(leafN, a, hv * .7, H - .07, r, .35).forEach((p) => leaf(B, p, outDir(p, r() - .2), .06 + r() * .07, r() < .5 ? G1 : G3, G2, r));
  return mouth;
}

const P = (a, b, c) => [C(a), C(b), c && C(c)].filter(Boolean);

export const ARRANGEMENTS = {
  violet: {
    label: 'Violet Pixel', vase: 'glass',
    build(B, a, H, r) {
      lush(B, a, H, r, [
        { t: 'rose', R: .062, pal: [P('#b02a00', '#ff7a1a'), P('#7d0a1c', '#e8203a'), P('#8f1560', '#f0529c')] },
        { t: 'peony', R: .07, pal: [P('#b0164c', '#ff7fa8'), P('#c44100', '#ff9d3c'), P('#8a1020', '#ff5a4a')] },
        { t: 'anemone', R: .06, pal: [P('#2e0f66', '#6d3fe0'), P('#4d0f5c', '#a53cc4')] },
        { t: 'dahlia', R: .058, pal: [P('#5c0628', '#c81e62'), P('#3b1280', '#7c4fe0'), P('#8f1010', '#e23b3b')] },
        { t: 'allium', R: .04, pal: [P('#35186a', '#7a52cc'), P('#b88a00', '#f2c81f')] },
        { t: 'tulip', R: .03, pal: [P('#a8123a', '#ff7d96')] },
      ], 40, H * .34, 110);
    },
  },
  dried: {
    label: 'Dried Italian', vase: 'ceramic',
    build(B, a, H, r) {
      const hv = H * .36; const cream = C('#cdb78c'), tan = C('#8a6238'), straw = C('#b08a4e'), blush = C('#c47a62'), rust = C('#8f3f1e');
      // pampas plumes
      for (let k = 0; k < 14; k++) {
        const th = r() * 6.28, top = V3(Math.cos(th) * a * (.3 + r() * .65), H - .06 - r() * .12, Math.sin(th) * a * (.3 + r() * .65));
        const cv = stem(B, V3(0, hv * .2, 0), top, V3(top.x * .2, top.y * .8, top.z * .2), .0018, tan, straw, 10);
        const tint = r() < .3 ? blush : cream;
        for (let i = 0; i < 130; i++) {
          const t = .45 + .55 * r(), q = cv.getPoint(t), tg = cv.getTangent(t);
          const dir = V3(r() - .5, -.25 + r() * .9, r() - .5).normalize().lerp(tg, .45).normalize();
          petal(B, frame(q, dir, r() * 6), .05 + .07 * r() * (1.1 - t), .007, { cup: 0, curl: .5, c0: straw, c1: tint, nu: 1, nv: 3, pinch: .3, sat: .85 + r() * .3 });
        }
      }
      // bunny tails, craspedia, thistles, dried palm, lunaria
      spots(34, a, hv * .9, H - .08, r, .6).forEach((p, k) => {
        const d = outDir(p, .8); stem(B, V3(0, hv * .2, 0), p, V3(p.x * .3, p.y * .85, p.z * .3), .0012, tan, straw);
        if (k % 4 === 0) ball(B, p, .02, C('#a87c00'), C('#e0b010'), .12);
        else if (k % 4 === 1) ball(B, p, .017, straw, cream, .25, 2.4);
        else if (k % 4 === 2) heads.thistle(B, p, d, .04, r, [rust, blush]);
        else heads.dahlia(B, p, d, .04, r, [rust, C('#d98a5f')]);
      });
      for (let k = 0; k < 7; k++) {
        const th = r() * 6.28, p = V3(Math.cos(th) * a * .8, hv + .1 + r() * .3, Math.sin(th) * a * .7), d = outDir(p, .7), F = frame(p, d, r() * 6);
        stem(B, V3(0, hv * .2, 0), p, V3(p.x * .3, p.y * .8, p.z * .3), .002, tan);
        for (let i = -6; i <= 6; i++) petal(B, F.clone().multiply(new THREE.Matrix4().makeRotationZ(i * .17)).multiply(mRX(.25 * Math.abs(i % 2))), .15 - Math.abs(i) * .006, .02, { cup: .6, curl: .08, c0: tan, c1: straw, nu: 2, nv: 3, pinch: .25 });
      }
      spots(40, a, hv, H - .12, r, .3).forEach((p) => leaf(B, p, outDir(p, r()), .035 + r() * .03, C('#9c8a5e'), C('#d6c59a'), r, .8));
    },
  },
  tulips: {
    label: 'Tulips', vase: 'glass',
    build(B, a, H, r) {
      const hv = H * .34; const pals = [P('#c2255c', '#ffa8c5'), P('#e8590c', '#ffd08a'), P('#f1ece2', '#ffffff'), P('#5f3dc4', '#b197fc'), P('#d6336c', '#ffe3ec')];
      spots(28, a * .95, hv * 1.1, H - .09, r, .5).forEach((p) => {
        const d = outDir(p, 1.2 - r() * 1.1);
        const neck = p.clone().addScaledVector(d, -.012);
        stem(B, V3((r() - .5) * .04, .02, (r() - .5) * .04), neck, V3(neck.x * .35, neck.y + .05, neck.z * .35).addScaledVector(d, -.08), .0032, G1, C('#8cc152'), 12);
        heads.tulip(B, p, d, .033 + r() * .007, r, pals[Math.floor(r() * pals.length)]);
      });
      for (let k = 0; k < 14; k++) { const th = r() * 6.28; leaf(B, V3(Math.cos(th) * .02, hv * (.7 + r() * .5), Math.sin(th) * .02), V3(Math.cos(th), .9 + r(), Math.sin(th)).normalize(), .2 + r() * .1, G1, C('#7fb84a'), r, .2); }
    },
  },
  meadow: {
    label: 'Wild meadow', vase: 'terracotta',
    build(B, a, H, r) {
      const hv = lush(B, a, H, r, [
        { t: 'daisy', R: .034, pal: [P('#f3f0e8', '#ffffff'), P('#f6e58d', '#fff7c2', '#8a5a12')] },
        { t: 'poppy', R: .042, pal: [P('#b91c1c', '#ff5a3c'), P('#e8590c', '#ffb057')] },
        { t: 'dahlia', R: .03, pal: [P('#1e3a8a', '#5b8dff')] },
        { t: 'allium', R: .032, pal: [P('#5b2a86', '#b58be8')] },
        { t: 'thistle', R: .03, pal: [P('#3b5b92', '#a9c4ef')] },
      ], 30, H * .33, 40).y;
      for (let k = 0; k < 60; k++) { const th = r() * 6.28, rr = a * (.2 + r() * .8), top = V3(Math.cos(th) * rr, hv + .1 + r() * (H - hv - .18), Math.sin(th) * rr); stem(B, V3(0, hv * .3, 0), top, V3(top.x * .2, top.y * .7, top.z * .2), .0009, G1, C('#b7c96a'), 6); }
    },
  },
  white: {
    label: 'White & eucalyptus', vase: 'ceramic',
    build(B, a, H, r) {
      const hv = H * .38; const euc0 = C('#4d6b5c'), euc1 = C('#9db8a6');
      lush(B, a, H, r, [
        { t: 'peony', R: .062, pal: [P('#e9e2cf', '#ffffff'), P('#f3d9d2', '#fff6f2')] },
        { t: 'rose', R: .048, pal: [P('#ded6bd', '#fffdf5')] },
        { t: 'anemone', R: .046, pal: [P('#efeae0', '#ffffff', '#111318')] },
      ], 20, hv, 0);
      for (let k = 0; k < 12; k++) {
        const th = r() * 6.28, rr = a * (.5 + r() * .5), top = V3(Math.cos(th) * rr, hv + .1 + r() * (H - hv - .17), Math.sin(th) * rr);
        const cv = stem(B, V3(0, hv * .3, 0), top, V3(top.x * .2, top.y * .8, top.z * .2), .0014, euc0, euc1, 9);
        for (let i = 0; i < 14; i++) { const t = .35 + .65 * i / 14, q = cv.getPoint(t); leaf(B, q, V3(r() - .5, r() * .6, r() - .5).normalize(), .028 + r() * .014, euc0, euc1, r, 1); }
      }
    },
  },
};

export const flowerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .7, metalness: 0, envMapIntensity: .6 });
flowerMaterial.onBeforeCompile = (s) => {
  // a little light bleeding through thin petals
  s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.03;');
};

export function buildArrangement(key, W, H, seed = 7) {
  const group = new THREE.Group(); const A = ARRANGEMENTS[key];
  if (!A) return group;
  const a = W / 2 - .035, r = rng(seed + key.length * 31);
  const B = new Builder(); A.build(B, a, H, r);
  // keep everything inside the panes: petals press flat against the glass like in the original piece
  const lim = W / 2 - .009; for (let i = 0; i < B.p.length; i += 3) { B.p[i] = THREE.MathUtils.clamp(B.p[i], -lim, lim); B.p[i + 2] = THREE.MathUtils.clamp(B.p[i + 2], -lim, lim); B.p[i + 1] = THREE.MathUtils.clamp(B.p[i + 1], .004, H - .022); }
  const mesh = new THREE.Mesh(B.geometry(), flowerMaterial); mesh.name = 'flowers'; group.add(mesh);
  const hv = H * (key === 'tulips' ? .34 : key === 'meadow' ? .33 : key === 'dried' ? .36 : .4);
  group.add(vase(A.vase, hv, key === 'tulips' ? .06 : .072));
  return group;
}
