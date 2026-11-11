import * as THREE from 'three';

// Real-time model of double-sided fluted glass ("Edelit doppelt"):
// one face carries horizontal flutes, the other vertical ones, so every
// ~12.5 mm cell behaves like a small crossed cylindrical lens. A view ray that
// enters a cell at offset o from its centre is bent by -o/f. We then find what
// that bent ray hits using the depth buffer of the scene behind the pane.
// Objects at about one focal length fill a whole cell with one colour (the
// "pixel" look); nearer objects stay readable, farther ones break into
// repeated, mirrored fragments.

const vert = /* glsl */ `
varying vec2 vUv; varying vec3 vWorld, vT, vB, vN;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  mat3 m = mat3(modelMatrix);
  vT = normalize(m * vec3(1.,0.,0.)); vB = normalize(m * vec3(0.,1.,0.)); vN = normalize(m * vec3(0.,0.,1.));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D tScene, tDepth; uniform samplerCube tEnv;
uniform vec2 uRes, uAxis; uniform float uNear, uFar, uPitch, uFocal, uStrength, uEnvI, uSparkle;
uniform vec3 uTint; uniform mat4 uProj;
varying vec2 vUv; varying vec3 vWorld, vT, vB, vN;

float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear*uFar/((uFar-uNear)*d - uFar); }
vec2 hash2(vec2 p){ vec3 a = fract(p.xyx*vec3(.1031,.1030,.0973)); a += dot(a, a.yzx+33.33); return fract((a.xx+a.yz)*a.zy); }

void main(){
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 V = normalize(vWorld - cameraPosition);
  vec3 N = normalize(vN); if(dot(N, V) > 0.) N = -N;         // face the viewer
  float cosV = clamp(dot(-V, N), 0.02, 1.);

  vec2 c = vUv / uPitch; vec2 id = floor(c); vec2 f = fract(c) - .5;
  vec2 af = abs(f) * 2.;
  // flute profile: mostly cylindrical, steeper towards the valleys
  vec2 g = f * uPitch * (1. + 1.4*af*af*af);
  vec2 jit = hash2(id) - .5;
  vec2 defl = (-g / uFocal + jit*0.012) * uStrength * uAxis;
  // slow waviness of rolled glass
  defl += uStrength * 0.004 * vec2(sin(vUv.y*23.+vUv.x*5.), sin(vUv.x*19.-vUv.y*7.));

  vec3 R = normalize(V + vT*defl.x + vB*defl.y);
  float zP = (viewMatrix * vec4(vWorld, 1.)).z;
  float Rz = min((viewMatrix * vec4(R, 0.)).z, -0.05);
  float Vz = min((viewMatrix * vec4(V, 0.)).z, -0.05);
  float d = clamp((viewZ(suv) - zP) / Vz, 0., 6.);
  vec2 uvq = suv;
  for(int i=0;i<3;i++){
    vec4 clip = uProj * viewMatrix * vec4(vWorld + R*d, 1.);
    uvq = clamp(clip.xy/clip.w*.5+.5, vec2(.002), vec2(.998));
    d = clamp((viewZ(uvq) - zP) / Rz, 0., 6.);
  }
  if(viewZ(uvq) > zP + 0.002) uvq = suv;                      // hit something in front of the pane
  vec2 mag = abs(1. - d*uStrength*uAxis/uFocal);
  float lod = clamp(log2(max(max(mag.x, mag.y), 1.)), 0., 4.5) * .8 + .12*uStrength;
  vec2 dv = uvq - suv;
  vec3 col;
  col.r = textureLod(tScene, suv + dv*1.035, lod).r;
  col.g = textureLod(tScene, uvq, lod).g;
  col.b = textureLod(tScene, suv + dv*0.965, lod).b;

  // body colour: longer path at grazing angles = greener
  col *= pow(uTint, vec3(1./cosV));
  // valleys between flutes scatter light away
  vec2 edge = smoothstep(.80, 1., af) * uAxis;
  float valley = max(edge.x, edge.y) * uStrength;
  col *= 1. - .34*valley;

  // surface reflection from the room, broken up by the flute normals
  vec3 nm = normalize(N + (vT*f.x*uAxis.x + vB*f.y*uAxis.y) * 1.1 * uStrength + (vT*jit.x+vB*jit.y)*.05*uStrength);
  vec3 Rr = reflect(V, nm);
  vec3 env = textureLod(tEnv, Rr, 1.5).rgb * uEnvI;
  float fr = .04 + .96*pow(1. - clamp(dot(-V, nm), 0., 1.), 5.);
  fr = min(fr*1.05, 1.);
  col = mix(col, env, fr);
  // tiny glints on the flute crests
  col += env * uSparkle * pow(max(1.-length(f*2.-.25), 0.), 6.) * .12;
  gl_FragColor = vec4(col, 1.);
}`;

export function makeGlassMaterial(side) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side,
    uniforms: {
      tScene: { value: null }, tDepth: { value: null }, tEnv: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uAxis: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.05 }, uFar: { value: 30 }, uPitch: { value: 0.0125 }, uFocal: { value: 0.06 },
      uStrength: { value: 1 }, uEnvI: { value: 1 }, uSparkle: { value: 1 },
      uTint: { value: new THREE.Color(0.93, 0.985, 0.955) }, uProj: { value: new THREE.Matrix4() },
    },
  });
}

// Copies colour + depth of one render target into the bound one.
export function makeCopier() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tC: { value: null }, tD: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform sampler2D tC,tD; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tC,vUv); gl_FragDepth=texture2D(tD,vUv).x; }`,
    depthFunc: THREE.AlwaysDepth, depthTest: true, depthWrite: true,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
  const cam = new THREE.Camera();
  return (renderer, src) => { mat.uniforms.tC.value = src.texture; mat.uniforms.tD.value = src.depthTexture; renderer.render(scene, cam); };
}
