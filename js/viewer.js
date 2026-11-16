/* Machinist Hands — 3D viewer for a project page.
 * The model to show is in the page: <div id="viewer" data-model="projects/2019-1/model.glb">.
 * Needs js/vendor/three-bundle.min.js (three.js + loaders) loaded before this file.
 */
function initViewer() {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const box = $('viewer');
  const status = $('viewer-status');
  const msg = $('viewer-msg');
  const bar = $('viewer-bar');
  const btnRotate = $('btn-rotate');

  if (!window.THREE || !window.THREEX) {
    showError('3D viewer could not start (three.js did not load).');
    return;
  }
  const T = window.THREE;
  const X = window.THREEX;
  const STEEL = new T.Color('#C4C9CE'); // stainless steel — change to recolour every 3D model

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    showError('Your browser or device does not support WebGL, so the 3D model cannot be shown. The drawing and downloads below still work.');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the shadow only changes when the part moves (load, flip), not when the camera turns
  box.prepend(renderer.domElement);

  const scene = new T.Scene();
  // Reflections: a neutral studio first, then the real workshop photo (HDRI).
  // The photo is fetched after the model, so on slow connections the part appears sooner.
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
  let workshopReady = null;

  const camera = new T.PerspectiveCamera(35, 1, 0.1, 5000);
  const VIEW_DIR = new T.Vector3(1, 0.75, 1.15).normalize(); // starting view: from front-right, above

  // Overhead workshop light: gives the highlights and the shadow on the table.
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);

  // The "machine table": an invisible floor that only shows the part's shadow.
  const floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // The part sits on a turntable group so it can be flipped over to show the bottom side.
  const turn = new T.Group();
  scene.add(turn);
  const btnFlip = $('btn-flip');
  let flipped = false;
  function setFlip(on, instant) {
    flipped = on;
    btnFlip.setAttribute('aria-pressed', on);
    $('flip-label').textContent = on ? 'Show top' : 'Show bottom';
    if (instant) turn.rotation.x = on ? Math.PI : 0;
  }
  btnFlip.addEventListener('click', () => setFlip(!flipped));

  function loadWorkshop() {
    const s = document.createElement('script');
    s.src = 'js/vendor/hdri/workshop.js';
    s.onload = () => {
      if (!window.MH_HDRI) return;
      try {
        // Decode the photo in the page (no fetch), so it also works where fetching data: URLs is blocked.
        const b64 = window.MH_HDRI.slice(window.MH_HDRI.indexOf(',') + 1);
        window.MH_HDRI = null;
        const bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const d = new X.EXRLoader().parse(bytes.buffer);
        const tex = new T.DataTexture(d.data, d.width, d.height, d.format, d.type);
        if (d.colorSpace) tex.colorSpace = d.colorSpace;
        if (d.flipY !== undefined) tex.flipY = d.flipY;
        tex.minFilter = tex.magFilter = T.LinearFilter;
        tex.generateMipmaps = false;
        tex.mapping = T.EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        scene.environment = tex;
        scene.background = tex;            // the workshop behind the part…
        scene.backgroundBlurriness = 0.45; // …out of focus, like a photo
        scene.backgroundIntensity = 0.55;  // and darker, so the part stands out
        requestRender();
      } catch (err) {
        console.warn('Workshop reflections unavailable, using studio light.', err);
      }
    };
    workshopReady = new Promise((done) => { s.addEventListener('load', done); s.onerror = done; });
    document.head.appendChild(s);
  }

  // Thin dark lines on sharp edges (like a CAD view) so edges stay readable on shiny metal.
  const EDGE_ANGLE = 35; // degrees: faces meeting at a sharper angle than this get a line
  const MIN_EDGE_CHAIN = 0.03; // hide edge chains shorter than 3% of the part size (noise)
  const edgeMaterial = new T.LineBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.55 });
  // The edge search runs in a Web Worker (js/edges-worker.js) so the page stays responsive.
  // If workers are not allowed, the same file is loaded as a normal script and run here.
  let worker = null, workerFailed = false, jobId = 0;
  const jobs = new Map();
  function findEdges(geo) {
    const pos = geo.attributes.position.array, index = geo.index ? geo.index.array : null;
    const msg = { pos: pos.slice(), index: index ? index.slice() : null, angle: EDGE_ANGLE, minChain: MIN_EDGE_CHAIN };
    if (!workerFailed) {
      try {
        if (!worker) {
          worker = new Worker('js/edges-worker.js');
          worker.onmessage = (e) => { const job = jobs.get(e.data.id); jobs.delete(e.data.id); if (job) job.resolve(e.data.lines); };
          worker.onerror = () => { workerFailed = true; jobs.forEach((job) => job.retry()); jobs.clear(); };
        }
        return new Promise((resolve) => {
          const id = ++jobId;
          jobs.set(id, { resolve, retry: () => findEdgesHere(msg).then(resolve) });
          worker.postMessage({ id, ...msg });
        });
      } catch { workerFailed = true; }
    }
    return findEdgesHere(msg);
  }
  let edgeScript = null;
  function findEdgesHere(msg) {
    edgeScript = edgeScript || new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'js/edges-worker.js';
      s.onload = resolve;
      document.head.appendChild(s);
    });
    return edgeScript.then(() => self.MH_sharpEdges(msg.pos, msg.index, msg.angle, msg.minChain));
  }
  function addEdges(mesh) {
    return findEdges(mesh.geometry).then((lines) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(lines, 3));
      mesh.add(new T.LineSegments(g, edgeMaterial));
      requestRender();
    });
  }

  const controls = new X.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.addEventListener('start', () => setRotate(false)); // user takes over

  const draco = new X.DRACOLoader().setDecoderPath('js/vendor/draco/');
  const loader = new X.GLTFLoader().setDRACOLoader(draco);

  let model = null;
  let home = null; // saved camera position for "Reset"
  let running = false;
  let token = 0;
  let usedJsFallback = false;
  let edgesReady = Promise.resolve();

  function setRotate(on) {
    controls.autoRotate = on;
    btnRotate.setAttribute('aria-pressed', on);
  }
  btnRotate.addEventListener('click', () => setRotate(!controls.autoRotate));
  $('btn-reset').addEventListener('click', () => {
    if (!home) return;
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();
    requestRender();
  });
  function showError(text) {
    status.hidden = false;
    status.classList.add('error');
    msg.textContent = text;
  }

  function resize() {
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    requestRender();
    const changed = Math.abs(camera.aspect - w / h) > 0.01;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // keep the whole part in view when the shape changes (e.g. rotating a phone)
    if (changed && fitSize && home && !pairTwin) {
      const dist = fitDistance(fitSize);
      const v = camera.position.clone().sub(controls.target);
      camera.position.copy(controls.target).addScaledVector(v.normalize(), dist);
      home.pos.copy(home.target).addScaledVector(home.pos.clone().sub(home.target).normalize(), dist);
      controls.maxDistance = dist * 4;
    }
  }
  new ResizeObserver(resize).observe(box);

  // Draw a new frame only when something moved, and only while the viewer is on screen.
  let dirty = true, onScreen = true;
  function requestRender(shadow) { dirty = true; if (shadow) renderer.shadowMap.needsUpdate = true; }
  new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }).observe(box);
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!onScreen) return;
    const goal = flipped ? Math.PI : 0; // smooth flip, like turning the part over by hand
    let moved = controls.update();
    if (turn.rotation.x !== goal) {
      turn.rotation.x = Math.abs(goal - turn.rotation.x) > 0.001 ? turn.rotation.x + (goal - turn.rotation.x) * 0.12 : goal;
      moved = true;
      renderer.shadowMap.needsUpdate = true;
    }
    if (moved || dirty) { renderer.render(scene, camera); dirty = false; }
  }
  function start() { if (!running) { running = true; loop(); } }

  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== edgeMaterial) [].concat(o.material).forEach((m) => m.dispose());
    });
  }

  // Camera distance that keeps the part's box in view from every turn of the auto-rotation,
  // both right way up and flipped (tighter than fitting a sphere).
  let fitSize = null;
  function fitDistance(size) {
    const tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const dir = VIEW_DIR;
    const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
    let dist = 0;
    const fwd = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3(), c = new T.Vector3();
    for (let k = 0; k < 16; k++) {
      const d = dir.clone().applyAxisAngle(new T.Vector3(0, 1, 0), (k / 16) * Math.PI * 2);
      fwd.copy(d).negate();
      right.crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, fwd);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        c.set(sx * hx, sy * hy, sz * hz);
        dist = Math.max(dist, -c.dot(fwd) + Math.max(Math.abs(c.dot(right)) / tanH, Math.abs(c.dot(up)) / tanV));
      }
    }
    return dist * 1.08; // small margin
  }

  // Center the part and move the camera so the whole part fits the view.
  function frame(obj) {
    obj.rotation.x = -Math.PI / 2; // CAD models are Z-up; three.js is Y-up
    obj.updateMatrixWorld(true);
    const b = new T.Box3().setFromObject(obj);
    const center = b.getCenter(new T.Vector3());
    const size = b.getSize(new T.Vector3());
    obj.position.sub(center);
    const radius = size.length() / 2;
    fitSize = size.clone();
    const dist = fitDistance(fitSize);
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    camera.position.copy(VIEW_DIR).multiplyScalar(dist);
    // put the table under the part and aim the overhead light at it
    floor.position.y = -size.y / 2;
    floor.scale.setScalar(radius * 12);
    key.position.set(radius * 1.2, radius * 3, radius * 0.8);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -radius * 1.6;
    sc.right = sc.top = radius * 1.6;
    sc.near = radius * 0.5;
    sc.far = radius * 8;
    sc.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = radius * 0.3;
    controls.maxDistance = dist * 4;
    controls.update();
    home = { pos: camera.position.clone(), target: controls.target.clone() };
  }

  function load(url) {
    const my = ++token;
    if (model) { turn.remove(model); dispose(model); model = null; }
    if (pairTwin) { scene.remove(pairTwin); pairTwin = null; }
    turn.position.set(0, 0, 0);
    setFlip(false, true);
    status.hidden = false;
    status.classList.remove('error');
    msg.textContent = 'Loading 3D model…';
    bar.style.width = '5%';
    setRotate(true);
    resize();
    start();

    if (location.protocol === 'file:') {
      showError('3D models need a web server. Open this folder with VS Code "Live Server", or run:  python -m http.server  — then open http://localhost:8000. (See README.md)');
      return;
    }

    draco.preload(); // fetch the Draco decoder while the model downloads, not after
    loader.load(url, (gltf) => {
      if (my !== token) { dispose(gltf.scene); return; }
      model = gltf.scene;
      // Show the part as machined stainless steel, with edge lines and a shadow
      const meshes = [];
      model.traverse((o) => { if (o.isMesh) meshes.push(o); });
      meshes.forEach((o) => {
        o.castShadow = true;
        [].concat(o.material).forEach((m) => {
          m.color.copy(STEEL); m.metalness = 1.0; m.roughness = 0.28;
          m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; // keeps edge lines on top
          m.needsUpdate = true;
        });
      });
      edgesReady = Promise.all(meshes.map(addEdges));
      frame(model);
      turn.add(model);
      status.hidden = true;
      requestRender(true);
      if (!workshopReady) loadWorkshop();
    }, (e) => {
      if (my === token && e.total) bar.style.width = Math.max(5, (e.loaded / e.total) * 100) + '%';
    }, (err) => {
      if (my !== token) return;
      // Some hosts block WebAssembly — retry once with the pure-JavaScript Draco decoder.
      if (!usedJsFallback) {
        usedJsFallback = true;
        draco.dispose();
        draco.setDecoderConfig({ type: 'js' });
        load(url);
        return;
      }
      console.error(err);
      showError('Sorry — the 3D model could not be loaded. Please check your connection and try again.');
    });
  }

  // Used only when making the home-page card images (scripts/render_cards.py):
  // shows the part right way up and flipped, side by side on the same table, in one picture.
  let pairTwin = null;
  window.MH_pairView = async function () {
    if (!model) return false;
    await edgesReady;
    await workshopReady;
    setRotate(false);
    controls.enableDamping = false; controls.update(); controls.enableDamping = true; // drop leftover spin
    setFlip(false, true);
    const size = new T.Box3().setFromObject(model).getSize(new T.Vector3());
    const dir = VIEW_DIR;
    const right = new T.Vector3().crossVectors(dir.clone().negate(), new T.Vector3(0, 1, 0)).normalize();
    const off = Math.hypot(size.x, size.z) * 0.5;
    if (pairTwin) { scene.remove(pairTwin); pairTwin = null; }
    const twin = pairTwin = new T.Group();
    twin.add(model.clone());
    twin.rotation.x = Math.PI;
    twin.position.copy(right).multiplyScalar(off);
    turn.position.copy(right).multiplyScalar(-off);
    scene.add(twin);
    // fit the camera to the corners of each part's own box (both parts together)
    const boxes = [new T.Box3().setFromObject(turn), new T.Box3().setFromObject(twin)];
    const center = boxes[0].clone().union(boxes[1]).getCenter(new T.Vector3());
    const tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
    const fwd = dir.clone().negate(), up = new T.Vector3().crossVectors(right, fwd);
    let dist = 0; const c = new T.Vector3();
    boxes.forEach((bx) => {
      for (const x of [bx.min.x, bx.max.x]) for (const y of [bx.min.y, bx.max.y]) for (const z of [bx.min.z, bx.max.z]) {
        c.set(x, y, z).sub(center);
        dist = Math.max(dist, -c.dot(fwd) + Math.max(Math.abs(c.dot(right)) / tanH, Math.abs(c.dot(up)) / tanV));
      }
    });
    const half = boxes[0].clone().union(boxes[1]).getSize(new T.Vector3()).multiplyScalar(0.5);
    dist *= 1.12;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.far = dist * 20; camera.updateProjectionMatrix();
    const r = Math.hypot(half.x, half.z) * 1.4, sc = key.shadow.camera;
    sc.left = sc.bottom = -r; sc.right = sc.top = r; sc.far = r * 10; sc.updateProjectionMatrix();
    floor.scale.setScalar(r * 12);
    controls.update();
    requestRender(true);
    return true;
  };

  load(box.dataset.model);
}

// Start the 3D viewer only after the page's text has been painted, so the page appears at once
// and the heavier 3D setup follows.
(function () {
  const go = () => requestAnimationFrame(() => setTimeout(initViewer, 0));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
})();
