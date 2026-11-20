// Solmar: drawing only. The Three.js scene, the instanced city (buildings,
// palms, lights, containers), the mesh factories for cars, pedestrians and
// the helicopter, the third-person camera, and a small particle pool.
// Game rules live elsewhere; this file turns state into pixels.

import * as THREE from 'three';
import { WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function facadeTexture(floors, cols, base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const wh = 256 / floors;
  const ww = 256 / cols;
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = Math.random() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : '#1d2f42';
      ctx.fillRect(c * ww + ww * 0.22, f * wh + wh * 0.25, ww * 0.56, wh * 0.5);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 256 - wh * 0.9, 256, wh * 0.9);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function billboardTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12283a';
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = '#ffd21f';
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 96);
  ctx.fillStyle = '#ff5a3c';
  ctx.fillRect(0, 168, 512, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, software ? 1 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc3e0);
  scene.fog = new THREE.Fog(0xa9c8da, 220, 640);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  camera.position.set(0, 60, 160);

  // Sun: warm afternoon light, shadows following the player.
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(software ? 1024 : 2048, software ? 1024 : 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x8a7a5a, 1.0));

  // Ground: the painted city texture, one big plane.
  const groundTex = new THREE.CanvasTexture(world.groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2, WORLD.half * 2),
    new THREE.MeshLambertMaterial({ map: groundTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sea: a glossy plane east of the beach, slightly below the sand lip.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(60, WORLD.half * 2),
    new THREE.MeshPhongMaterial({ color: 0x2b7ea6, shininess: 120, specular: 0x99ccdd }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.waterX + 18, -0.15, 0);
  scene.add(sea);

  // Buildings: three instanced meshes by height class, one facade each.
  // Ground plus buildings are the static raycast targets for shooting.
  const shootables = [ground];
  const classes = {
    low: { tex: facadeTexture(2, 4, '#f4ede0', 0.2), list: [] },
    mid: { tex: facadeTexture(4, 5, '#efe9dc', 0.22), list: [] },
    tall: { tex: facadeTexture(9, 6, '#e8e4da', 0.26), list: [] },
  };
  for (const b of world.buildings) classes[b.style].list.push(b);
  for (const key of Object.keys(classes)) {
    const { tex, list } = classes[key];
    if (list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ map: tex }),
      list.length,
    );
    list.forEach((b, i) => {
      _q.identity();
      _m4.compose(_v.set(b.x, b.h / 2, b.z), _q, _s.set(b.w, b.h, b.d));
      mesh.setMatrixAt(i, _m4);
      mesh.setColorAt(i, _c.set(b.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
  }

  // Palms: instanced trunks and instanced fronds (7 per palm, one mesh).
  const palmCount = world.palms.length;
  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.3, 5.4, 5),
    new THREE.MeshLambertMaterial({ color: 0x8a6a48 }),
    palmCount,
  );
  const frondGeo = new THREE.ConeGeometry(0.42, 3.6, 4);
  frondGeo.scale(1, 1, 0.28);
  frondGeo.translate(0, 1.8, 0);
  const frondMesh = new THREE.InstancedMesh(
    frondGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    palmCount * 7,
  );
  const frondGreens = [0x2e8b4a, 0x35a055, 0x27803f];
  world.palms.forEach((p, i) => {
    const lean = (i % 5) * 0.03;
    _e.set(lean, i * 1.7, 0.04);
    _q.setFromEuler(_e);
    _m4.compose(_v.set(p.x, 2.7 * p.s, p.z), _q, _s.set(p.s, p.s, p.s));
    trunkMesh.setMatrixAt(i, _m4);
    for (let f = 0; f < 7; f += 1) {
      const yaw = (f / 7) * Math.PI * 2 + i;
      _e.set(Math.PI / 2 + 0.5 + (f % 3) * 0.14, yaw, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m4.compose(_v.set(p.x, 5.2 * p.s, p.z), _q, _s.set(p.s, p.s, p.s));
      frondMesh.setMatrixAt(i * 7 + f, _m4);
      frondMesh.setColorAt(i * 7 + f, _c.set(frondGreens[(i + f) % 3]));
    }
  });
  trunkMesh.castShadow = true;
  frondMesh.castShadow = true;
  scene.add(trunkMesh);
  scene.add(frondMesh);

  // Street lights, containers, yachts, billboards.
  const lights = world.props.filter((p) => p.kind === 'light');
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
    lights.length,
  );
  const lampMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.42, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x776611 }),
    lights.length,
  );
  lights.forEach((p, i) => {
    _q.identity();
    _m4.compose(_v.set(p.x, 3.5, p.z), _q, _s.set(1, 1, 1));
    poleMesh.setMatrixAt(i, _m4);
    _m4.compose(_v.set(p.x, 7.1, p.z), _q, _s.set(1, 1, 1));
    lampMesh.setMatrixAt(i, _m4);
  });
  scene.add(poleMesh);
  scene.add(lampMesh);

  const containers = world.props.filter((p) => p.kind === 'container');
  const boxMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(6, 2.6, 2.6),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    containers.length,
  );
  containers.forEach((p, i) => {
    _e.set(0, p.rot, 0);
    _q.setFromEuler(_e);
    _m4.compose(_v.set(p.x, 1.3, p.z), _q, _s.set(1, 1, 1));
    boxMesh.setMatrixAt(i, _m4);
    boxMesh.setColorAt(i, _c.set(p.color));
  });
  boxMesh.castShadow = true;
  scene.add(boxMesh);

  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0xd8e4ea });
  for (const p of world.props.filter((y) => y.kind === 'yacht')) {
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 9), hullMat);
    hull.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 4), cabinMat);
    cabin.position.set(0, 1.8, -0.5);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    mast.position.set(0, 4.5, 1);
    yacht.add(hull, cabin, mast);
    yacht.position.set(p.x, 0, p.z);
    yacht.scale.setScalar(p.s);
    yacht.rotation.y = (p.z % 7) * 0.1;
    scene.add(yacht);
  }
  for (const p of world.props.filter((b) => b.kind === 'billboard')) {
    const board = new THREE.Group();
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 5.2),
      new THREE.MeshLambertMaterial({ map: billboardTexture(p.text) }),
    );
    face.position.y = 7;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), new THREE.MeshLambertMaterial({ color: 0x555555 }));
    post.position.y = 2.3;
    board.add(face, post);
    board.position.set(p.x, 0, p.z);
    board.rotation.y = p.rot;
    scene.add(board);
  }

  // Clouds: instanced puffs drifting slowly east.
  const cloudMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    26,
  );
  const cloudBase = [];
  for (let i = 0; i < 26; i += 1) {
    cloudBase.push({
      x: -280 + (i * 47) % 560, y: 120 + (i % 4) * 12, z: -260 + (i * 89) % 520,
      s: 14 + (i % 5) * 6,
    });
  }
  cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(cloudMesh);

  // Particles: one Points cloud, slots recycled.
  const PMAX = 320;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 3);
  const pVel = new Float32Array(PMAX * 3);
  const pLife = new Float32Array(PMAX);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95 }));
  points.frustumCulled = false;
  for (let i = 0; i < PMAX; i += 1) pPos[i * 3 + 1] = -50;
  scene.add(points);
  let pNext = 0;

  function burst(x, y, z, hex, count, speed) {
    _c.set(hex);
    for (let n = 0; n < count; n += 1) {
      const i = pNext;
      pNext = (pNext + 1) % PMAX;
      pPos[i * 3] = x;
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = z;
      pCol[i * 3] = _c.r;
      pCol[i * 3 + 1] = _c.g;
      pCol[i * 3 + 2] = _c.b;
      pVel[i * 3] = (Math.random() - 0.5) * speed;
      pVel[i * 3 + 1] = Math.random() * speed * 0.8;
      pVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      pLife[i] = 0.4 + Math.random() * 0.5;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // Muzzle flash: one reusable point light, pulsed by the shooter.
  const flashLight = new THREE.PointLight(0xffc860, 0, 18, 1.8);
  scene.add(flashLight);
  let flashT = 0;

  function flash(x, y, z) {
    flashLight.position.set(x, y, z);
    flashLight.intensity = 60;
    flashT = 0.06;
  }

  // --- Mesh factories -------------------------------------------------------
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 90, specular: 0x88aabb });
  const chromeMat = new THREE.MeshPhongMaterial({ color: 0xd8dde2, shininess: 120, specular: 0xffffff });

  function makeCarMesh(type, colorHex, isPolice) {
    const group = new THREE.Group();
    const low = type === 'sports' || type === 'coupe';
    const bodyH = low ? 0.75 : 1.0;
    const bodyL = type === 'van' ? 5.4 : type === 'pickup' ? 5.0 : 4.4;
    const bodyW = type === 'van' ? 2.3 : 2.0;
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyL), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.86, low ? 0.55 : 0.75, type === 'van' ? 3.4 : 2.2),
      type === 'van' ? bodyMat : glassMat,
    );
    cabin.position.set(0, bodyH + (low ? 0.75 : 0.85), type === 'van' ? 0.3 : -0.2);
    cabin.castShadow = true;
    group.add(cabin);
    if (type === 'pickup') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.9, 0.5, 1.8), bodyMat);
      bed.position.set(0, 1.05, 1.5);
      group.add(bed);
    }
    const wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-bodyW / 2, bodyL / 2 - 0.8], [bodyW / 2, bodyL / 2 - 0.8], [-bodyW / 2, -bodyL / 2 + 0.8], [bodyW / 2, -bodyL / 2 + 0.8]]) {
      const wheel = new THREE.Mesh(wheelGeo, tyreMat);
      wheel.position.set(wx, 0.38, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.8, 0.18, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x665522 }),
    );
    head.position.set(0, 0.7, bodyL / 2 + 0.03);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(bodyW * 0.8, 0.18, 0.1),
      new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x551111 }),
    );
    tail.position.set(0, 0.7, -bodyL / 2 - 0.03);
    group.add(tail);
    let lightBar = null;
    let lightL = null;
    let lightR = null;
    if (isPolice) {
      lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      lightBar.position.set(0, bodyH + (low ? 1.05 : 1.25), -0.2);
      group.add(lightBar);
      lightL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.4 }));
      lightL.position.set(-0.38, bodyH + (low ? 1.08 : 1.28), -0.2);
      lightR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 1.4 }));
      lightR.position.set(0.38, bodyH + (low ? 1.08 : 1.28), -0.2);
      group.add(lightL, lightR);
    }
    scene.add(group);
    return { group, wheels, bodyMat, lightL, lightR, length: bodyL };
  }

  function makePedMesh(shirt, pants, skin) {
    const group = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), shirtMat);
    torso.position.y = 1.22;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
    head.position.y = 1.86;
    head.castShadow = true;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), pantsMat);
    legL.position.set(-0.17, 0.41, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), pantsMat);
    legR.position.set(0.17, 0.41, 0);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), shirtMat);
    armL.position.set(-0.42, 1.25, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), shirtMat);
    armR.position.set(0.42, 1.25, 0);
    group.add(torso, head, legL, legR, armL, armR);
    scene.add(group);
    return { group, legL, legR, armL, armR };
  }

  function makeHeliMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 4.4), bodyMat);
    body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), glassMat);
    nose.position.set(0, 0.1, 2.1);
    nose.scale.set(1, 0.8, 0.9);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.2);
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(11, 0.08, 0.34);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
    const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
    blade2.rotation.y = Math.PI / 2;
    rotor.add(blade1, blade2);
    rotor.position.y = 1.1;
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.24), bladeMat);
    tailRotor.position.set(0.3, 0.4, -6.4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 3.6), new THREE.MeshLambertMaterial({ color: 0x1a4a8a }));
    stripe.position.y = -0.2;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(5, 24, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.position.y = -12;
    group.add(body, nose, tail, rotor, tailRotor, stripe, cone);
    scene.add(group);
    return { group, rotor, tailRotor, cone };
  }

  function makeBeacon(colorHex) {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 20, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 10;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.18, 8, 24),
      new THREE.MeshBasicMaterial({ color: colorHex }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.9),
      new THREE.MeshBasicMaterial({ color: colorHex }),
    );
    gem.position.y = 5.5;
    group.add(beam, ring, gem);
    scene.add(group);
    return { group, ring, gem };
  }

  function makeMedallion() {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.28, 10, 20),
      new THREE.MeshPhongMaterial({ color: 0xffd21f, emissive: 0x886611, emissiveIntensity: 0.7, shininess: 140 }),
    );
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0 }),
    );
    group.add(disc, core);
    group.position.y = 1.4;
    scene.add(group);
    return group;
  }

  // --- Camera ---------------------------------------------------------------
  let mode = 'orbit';
  let orbitA = 0.6;
  let shakeT = 0;
  const followPos = new THREE.Vector3(0, 60, 160);
  const lookAt = new THREE.Vector3();

  function setMode(next) {
    mode = next;
  }

  function addShake(amount) {
    shakeT = Math.min(0.5, shakeT + amount);
  }

  function updateCamera(dt, focus, elapsed) {
    if (mode === 'orbit') {
      orbitA += dt * 0.03;
      const r = 190;
      camera.position.set(Math.sin(orbitA) * r, 78, Math.cos(orbitA) * r);
      camera.lookAt(0, 0, 40);
      camera.fov = 58;
      camera.updateProjectionMatrix();
      return;
    }
    const fx = Math.sin(focus.heading);
    const fz = Math.cos(focus.heading);
    const dist = focus.inCar ? 11.5 : 7.5;
    const height = focus.inCar ? 4.6 : 3.4;
    _v.set(focus.x - fx * dist, height, focus.z - fz * dist);
    const k = 1 - Math.exp(-dt * 4.2);
    followPos.lerp(_v, k);
    let sx = 0; let sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      sx = (Math.random() - 0.5) * shakeT * 2.4;
      sy = (Math.random() - 0.5) * shakeT * 1.6;
    }
    camera.position.set(followPos.x + sx, followPos.y + sy, followPos.z);
    lookAt.set(focus.x + fx * 7, 1.6, focus.z + fz * 7);
    camera.lookAt(lookAt);
    const targetFov = 62 + Math.min(16, Math.abs(focus.speed || 0) * 0.35);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    // Sun shadow box follows the player.
    sun.position.set(focus.x + 120, 180, focus.z + 60);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();
  }

  function update(dt, elapsed, focus) {
    // Clouds drift east and wrap.
    for (let i = 0; i < cloudBase.length; i += 1) {
      const c = cloudBase[i];
      const x = ((c.x + elapsed * 1.2 + 300) % 640) - 300;
      _q.identity();
      _m4.compose(_v.set(x, c.y, c.z), _q, _s.set(c.s, c.s * 0.36, c.s * 0.7));
      cloudMesh.setMatrixAt(i, _m4);
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
    // Particles.
    let anyAlive = false;
    for (let i = 0; i < PMAX; i += 1) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -50;
        continue;
      }
      anyAlive = true;
      pVel[i * 3 + 1] -= 9 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.05) pPos[i * 3 + 1] = 0.05;
    }
    if (anyAlive) pGeo.attributes.position.needsUpdate = true;
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) flashLight.intensity = 0;
    }
    if (focus) updateCamera(dt, focus, elapsed);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    scene, camera, renderer, software, shootables,
    setMode, addShake, update, resize,
    makeCarMesh, makePedMesh, makeHeliMesh, makeBeacon, makeMedallion,
    burst, flash,
    render() { renderer.render(scene, camera); },
    remove(obj) { scene.remove(obj); },
  };
}
