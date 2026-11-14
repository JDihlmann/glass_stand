import * as THREE from 'three';

// A small smart-home display modelled from Apple's HomeView press photos: a domed aluminium speaker base with a
// perforated band, a short steel hinge, and a tilted, nearly square 7" display. Dimensions are estimated from the photos.
export const HV_COLORS = { silver: 0xd6d8db, starlight: 0xe2d9c8, pink: 0xdcbdbb, gray: 0x55565b };

const roundedRect = (w, h, r) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
};

function grilleTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 56; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 56); g.fillStyle = '#17181a';
  for (const [x, y] of [[0, 0], [32, 0], [16, 28], [0, 56], [32, 56]]) { g.beginPath(); g.arc(x, y, 9.5, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(104, 6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// a generic home screen (own drawing): temperature, clock and three tiles
function screenTexture() {
  const W = 640, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#5a6fe0'); bg.addColorStop(.55, '#3f49b8'); bg.addColorStop(1, '#6a3fa8'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * .7, H * .15, 10, W * .7, H * .15, W * .7); glow.addColorStop(0, 'rgba(160,190,255,.55)'); glow.addColorStop(1, 'rgba(160,190,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const tile = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.roundRect(x, y, w, h, 34); g.fill(); };
  g.textAlign = 'center'; g.textBaseline = 'middle'; const font = (px, wt = 600) => { g.font = `${wt} ${px}px -apple-system, "Helvetica Neue", Arial, sans-serif`; };
  tile(30, 30, 350, 330); g.fillStyle = '#fff'; font(170); g.fillText('21°', 205, 170); font(30, 500); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('Flur', 205, 300);
  tile(400, 30, 210, 210); g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(505, 135, 78, 0, 7); g.stroke();
  g.lineCap = 'round'; g.lineWidth = 7; g.beginPath(); g.moveTo(505, 135); g.lineTo(505 + 38, 135 - 26); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(505, 135); g.lineTo(505 - 30, 135 - 58); g.stroke();
  tile(400, 260, 210, 100); g.fillStyle = '#fff'; font(30); g.fillText('Musik', 505, 310);
  const labels = ['Zuhause', 'Haustür', 'Licht'];
  for (let i = 0; i < 3; i++) { const x = 30 + i * 197; tile(x, 385, 185, 185); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 92, 455, 30, 0, 7); g.fill(); font(27, 500); g.fillText(labels[i], x + 92, 530); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildHomeView() {
  const g = new THREE.Group();
  const alu = new THREE.MeshStandardMaterial({ color: HV_COLORS.silver, metalness: .9, roughness: .42, envMapIntensity: 1.1 });
  const grille = new THREE.MeshStandardMaterial({ color: HV_COLORS.silver, metalness: .7, roughness: .55, map: grilleTexture() });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: .14, envMapIntensity: 1.4 });
  const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; return m; };

  // base: straight sides, hemispherical top
  const R = .048, side = .05, pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R - .003, 0), new THREE.Vector2(R - .0008, .001), new THREE.Vector2(R, .0035), new THREE.Vector2(R, side)];
  for (let i = 1; i <= 20; i++) { const a = i / 20 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * R, side + Math.sin(a) * R)); }
  g.add(mesh(new THREE.LatheGeometry(pts, 72), alu));
  const band = mesh(new THREE.CylinderGeometry(R + .0004, R + .0004, .03, 72, 1, true), grille, false); band.position.y = .0045 + .015; g.add(band);

  // hinge and display, tilted back a little
  const head = new THREE.Group(); head.position.set(0, .068, .034); head.rotation.x = -.2; g.add(head);
  const arm = mesh(new THREE.CylinderGeometry(.0085, .0085, .03, 28), steel); arm.rotation.x = Math.PI / 2; arm.position.z = .008; head.add(arm);
  const w = .142, h = .134, t = .0078, cy = .024;
  const body = mesh(new THREE.ExtrudeGeometry(roundedRect(w, h, .024), { depth: t - .002, bevelEnabled: true, bevelThickness: .001, bevelSize: .001, bevelSegments: 3, curveSegments: 20 }), alu);
  body.position.set(0, cy, .023); head.add(body);
  const glass = mesh(new THREE.ShapeGeometry(roundedRect(w - .003, h - .003, .0228), 20), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: .08, metalness: 0, envMapIntensity: 1.2 }), false);
  glass.position.set(0, cy, .023 + t - .001 + .0002); head.add(glass);
  const sg = new THREE.ShapeGeometry(roundedRect(w - .015, h - .015, .018), 20), p = sg.attributes.position, uv = sg.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (w - .015) + .5, p.getY(i) / (h - .015) + .5);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), color: 0xd8d8d8 });
  const screen = mesh(sg, screenMat, false); screen.position.set(0, cy, .023 + t - .001 + .0005); head.add(screen);

  g.userData.setColor = (name) => { const c = HV_COLORS[name] ?? HV_COLORS.silver; alu.color.setHex(c); grille.color.setHex(c); };
  g.userData.setScreen = (k) => screenMat.color.setScalar(k);
  return g;
}
