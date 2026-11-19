/* generated from app/shell/src by tools/build.mjs — edit the sources, then npm run build:shell */
(() => {
  // app/shell/src/tiers.js
  var TIERS = {
    // 基準機：2020 iPad Pro 12.9" Safari。DPR 1.0 固定・MSAA なし。
    mobile: { name: "mobile", mobile: true, pixelRatio: 1, antialias: false, msaaSamples: 0, detail: 1, maxPixels: 22e5, maxTextureSize: 1024, envSize: 128 },
    desktop: { name: "desktop", mobile: false, pixelRatio: 1.5, antialias: false, msaaSamples: 0, detail: 1, maxPixels: 32e5, maxTextureSize: 1024, envSize: 128 },
    low: { name: "low", mobile: true, pixelRatio: 1, antialias: false, msaaSamples: 0, detail: 0.6, maxPixels: 12e5, maxTextureSize: 1024, envSize: 64 }
  };
  function detectTier(params2) {
    const touch = (navigator.maxTouchPoints || 0) > 1;
    const dpr = window.devicePixelRatio || 1;
    let t;
    const forced = params2.get("tier");
    if (forced && TIERS[forced]) t = { ...TIERS[forced] };
    else if (touch) t = { ...TIERS.mobile };
    else {
      t = { ...TIERS.desktop, pixelRatio: Math.min(dpr, 1.5) };
      if (t.pixelRatio <= 1) {
        t.antialias = true;
        t.msaaSamples = 4;
      }
    }
    t.touch = touch;
    t.renderScale = t.name === "low" ? 0.75 : 1;
    t.downgraded = false;
    return t;
  }
  function effectivePixelRatio(tier, cssW, cssH) {
    const want = tier.pixelRatio * tier.renderScale;
    const cap = Math.sqrt(tier.maxPixels / Math.max(1, cssW * cssH));
    return Math.max(0.5, Math.min(want, cap));
  }
  var PerfGovernor = class {
    constructor(tier, onDowngrade) {
      this.tier = tier;
      this.onDowngrade = onDowngrade;
      this.slowTime = 0;
      this.warmup = 3;
    }
    sample(dt) {
      if (this.tier.downgraded || this.tier.name === "low") return;
      if (this.warmup > 0) {
        this.warmup -= dt;
        return;
      }
      if (dt > 1 / 40) this.slowTime += dt;
      else this.slowTime = Math.max(0, this.slowTime - dt * 0.5);
      if (this.slowTime > 4) {
        this.tier.downgraded = true;
        this.tier.renderScale = 0.75;
        this.onDowngrade && this.onDowngrade();
      }
    }
  };

  // app/shell/src/textures.js
  function loadTextures(THREE2, renderer, { timeoutMs = 2500, defer = [] } = {}) {
    const src = window.__TEXTURES__ || {};
    const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const out = {};
    const waits = [];
    const later = [];
    for (const [key, url] of Object.entries(src)) {
      const tex = new THREE2.Texture();
      tex.name = key;
      tex.colorSpace = THREE2.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE2.RepeatWrapping;
      tex.anisotropy = aniso;
      out[key] = tex;
      const start = () => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          tex.image = img;
          tex.needsUpdate = true;
          resolve();
        };
        img.onerror = () => {
          console.error("texture failed: " + key);
          resolve();
        };
        img.src = url;
      });
      if (defer.includes(key)) later.push(start);
      else waits.push(start());
    }
    const all = Promise.all(waits);
    const timeout = new Promise((r) => setTimeout(r, timeoutMs));
    return Promise.race([all, timeout]).then(() => {
      Object.defineProperty(out, "loadDeferred", { enumerable: false, value: () => Promise.all(later.splice(0).map((f) => f())) });
      return out;
    });
  }
  function canvasTexture(THREE2, w, h, draw, { srgb = true, repeat = false } = {}) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE2.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE2.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE2.RepeatWrapping;
    return t;
  }
  function blobShadowTexture(THREE2) {
    return canvasTexture(THREE2, 128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, "rgba(60,35,25,0.55)");
      grd.addColorStop(0.55, "rgba(60,35,25,0.28)");
      grd.addColorStop(1, "rgba(60,35,25,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    }, { srgb: false });
  }
  function skyTexture(THREE2) {
    return canvasTexture(THREE2, 256, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#a9d8f2");
      grd.addColorStop(0.7, "#e4f3f8");
      grd.addColorStop(1, "#fff6e6");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.92)";
      const cloud = (x, y, s) => {
        for (const [dx, dy, r] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.85, 0.2, 0.7], [0.3, -0.45, 0.7]]) {
          g.beginPath();
          g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
          g.fill();
        }
      };
      cloud(70, 70, 18);
      cloud(185, 105, 14);
      cloud(130, 40, 10);
      g.fillStyle = "#b9dfa0";
      g.beginPath();
      g.moveTo(0, h);
      g.quadraticCurveTo(70, 165, 140, 200);
      g.quadraticCurveTo(200, 170, 256, 185);
      g.lineTo(256, 256);
      g.fill();
      g.fillStyle = "#9fd18a";
      g.beginPath();
      g.moveTo(0, 215);
      g.quadraticCurveTo(110, 190, 256, 230);
      g.lineTo(256, 256);
      g.lineTo(0, 256);
      g.fill();
    });
  }

  // app/shell/src/scene.js
  function buildBackground(THREE2, scene, tex, tier) {
    const group = new THREE2.Group();
    group.name = "background";
    scene.add(group);
    const owned = { geos: [], mats: [], texs: [] };
    const G = (g) => (owned.geos.push(g), g);
    const M = (m) => (owned.mats.push(m), m);
    const T = (t) => (owned.texs.push(t), t);
    const seg = (n) => Math.max(6, Math.round(n * tier.detail));
    const rep = (t, x, y) => {
      if (!t) return null;
      const c = T(t.clone());
      c.repeat.set(x, y);
      c.needsUpdate = true;
      return c;
    };
    const tableMat = M(new THREE2.MeshLambertMaterial({ color: 16777215, map: rep(tex.wood_table_512, 2, 1.3) }));
    const table = new THREE2.Mesh(G(new THREE2.BoxGeometry(1.6, 0.04, 1.03)), tableMat);
    table.position.set(0, -0.02, 0.035);
    group.add(table);
    const floor = new THREE2.Mesh(G(new THREE2.PlaneGeometry(6, 6)), M(new THREE2.MeshLambertMaterial({ color: 15258308 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.75;
    group.add(floor);
    const wallMat = M(new THREE2.MeshLambertMaterial({ color: 16777215, map: rep(tex.wallpaper_pastel_512, 6, 4.5) }));
    const wall = new THREE2.Mesh(G(new THREE2.PlaneGeometry(3.2, 2.4)), wallMat);
    wall.position.set(0, 0.6, -0.5);
    group.add(wall);
    const skirt = new THREE2.Mesh(G(new THREE2.BoxGeometry(3.2, 0.06, 0.02)), M(new THREE2.MeshLambertMaterial({ color: 16775151 })));
    skirt.position.set(0, 0.03, -0.49);
    group.add(skirt);
    const win = new THREE2.Group();
    win.position.set(-0.5, 0.66, -0.495);
    group.add(win);
    const sky = new THREE2.Mesh(G(new THREE2.PlaneGeometry(0.46, 0.4)), M(new THREE2.MeshBasicMaterial({ map: T(skyTexture(THREE2)) })));
    win.add(sky);
    const frameMat = M(new THREE2.MeshLambertMaterial({ color: 16775923 }));
    const bars = [
      [0.52, 0.035, 0, 0.2175],
      [0.52, 0.035, 0, -0.2175],
      [0.035, 0.47, -0.2425, 0],
      [0.035, 0.47, 0.2425, 0],
      [0.02, 0.4, 0, 0],
      [0.46, 0.02, 0, 0]
    ];
    const barGeo = G(new THREE2.BoxGeometry(1, 1, 0.025));
    const frame = new THREE2.InstancedMesh(barGeo, frameMat, bars.length);
    const m4 = new THREE2.Matrix4();
    bars.forEach(([w, h, x, y], i) => {
      m4.compose(new THREE2.Vector3(x, y, 0.012), new THREE2.Quaternion(), new THREE2.Vector3(w, h, 1));
      frame.setMatrixAt(i, m4);
    });
    win.add(frame);
    const sill = new THREE2.Mesh(G(new THREE2.BoxGeometry(0.58, 0.022, 0.07)), frameMat);
    sill.position.set(0, -0.235, 0.035);
    win.add(sill);
    const curtainGeo = G(new THREE2.PlaneGeometry(0.17, 0.54, seg(14), 1));
    {
      const p = curtainGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, 0.012 * Math.sin(p.getX(i) / 0.17 * Math.PI * 6));
      curtainGeo.computeVertexNormals();
    }
    const floralTex = rep(tex.floral_cotton_512, 1, 2.5);
    const curtainMat = M(new THREE2.MeshLambertMaterial({ color: 16777215, map: floralTex, side: THREE2.DoubleSide }));
    for (const sx of [-1, 1]) {
      const c = new THREE2.Mesh(curtainGeo, curtainMat);
      c.position.set(sx * 0.31, 0, 0.05);
      win.add(c);
    }
    const rail = new THREE2.Mesh(G(new THREE2.CylinderGeometry(8e-3, 8e-3, 0.8, seg(10))), M(new THREE2.MeshLambertMaterial({ color: 14267530 })));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.29, 0.06);
    win.add(rail);
    const lineY = 0.745, lineZ = -0.468;
    const rope = new THREE2.Mesh(G(new THREE2.CylinderGeometry(25e-4, 25e-4, 0.68, 6)), M(new THREE2.MeshLambertMaterial({ color: 16033464 })));
    rope.rotation.z = Math.PI / 2;
    rope.position.set(0.465, lineY, lineZ);
    group.add(rope);
    const hookGeo = G(new THREE2.SphereGeometry(0.012, 10, 8));
    const hookMat = M(new THREE2.MeshLambertMaterial({ color: 16773590 }));
    for (const x of [0.125, 0.805]) {
      const h = new THREE2.Mesh(hookGeo, hookMat);
      h.position.set(x, lineY, lineZ - 0.01);
      group.add(h);
    }
    const slotXs = [0.27, 0.465, 0.66];
    const pinGeo = G(new THREE2.BoxGeometry(9e-3, 0.036, 0.01));
    const pins = new THREE2.InstancedMesh(pinGeo, M(new THREE2.MeshLambertMaterial({ color: 16777215 })), slotXs.length * 2);
    const pinColors = [10148294, 16234440, 16767370];
    slotXs.forEach((x, i) => {
      for (const side of [0, 1]) {
        m4.makeTranslation(x + (side ? 0.058 : -0.058), lineY - 6e-3, lineZ + 0.012);
        pins.setMatrixAt(i * 2 + side, m4);
        pins.setColorAt(i * 2 + side, new THREE2.Color(pinColors[i]));
      }
    });
    group.add(pins);
    const displaySlots = slotXs.map((x) => ({
      position: new THREE2.Vector3(x, lineY - 0.012, lineZ + 6e-3),
      quaternion: new THREE2.Quaternion(),
      width: 0.15,
      height: 0.22
    }));
    const spools = [[0.44, -0.31, 16230584], [0.535, -0.22, 9425857], [0.63, -0.33, 16765567]];
    const threadGeo = G(new THREE2.CylinderGeometry(0.021, 0.021, 0.046, seg(16)));
    const thread = new THREE2.InstancedMesh(threadGeo, M(new THREE2.MeshLambertMaterial({ color: 16777215 })), spools.length);
    const flangeGeo = G(new THREE2.CylinderGeometry(0.028, 0.028, 7e-3, seg(18)));
    const flange = new THREE2.InstancedMesh(flangeGeo, M(new THREE2.MeshLambertMaterial({ color: 15318922 })), spools.length * 2);
    spools.forEach(([x, z, col], i) => {
      m4.makeTranslation(x, 0.0305, z);
      thread.setMatrixAt(i, m4);
      thread.setColorAt(i, new THREE2.Color(col));
      m4.makeTranslation(x, 35e-4, z);
      flange.setMatrixAt(i * 2, m4);
      m4.makeTranslation(x, 0.0575, z);
      flange.setMatrixAt(i * 2 + 1, m4);
    });
    group.add(thread, flange);
    const PC = [-0.62, -0.3];
    const cushion = new THREE2.Mesh(G(new THREE2.SphereGeometry(0.05, seg(18), seg(12))), M(new THREE2.MeshLambertMaterial({ color: 16770026, map: floralTex })));
    cushion.scale.set(1, 0.72, 1);
    cushion.position.set(PC[0], 0.034, PC[1]);
    group.add(cushion);
    const headGeo = G(new THREE2.SphereGeometry(65e-4, 8, 6));
    const heads = new THREE2.InstancedMesh(headGeo, M(new THREE2.MeshLambertMaterial({ color: 16777215 })), 6);
    const headCols = [16748456, 8376288, 16765286, 11902192, 9426580, 16752506];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, r = 0.03 + i % 2 * 8e-3;
      m4.makeTranslation(PC[0] + Math.cos(a) * r, 0.072 + i % 2 * 6e-3, PC[1] + Math.sin(a) * r);
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, new THREE2.Color(headCols[i]));
    }
    group.add(heads);
    const blob = T(blobShadowTexture(THREE2));
    const shadowMat = M(new THREE2.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, toneMapped: false }));
    const shadowGeo = G(new THREE2.PlaneGeometry(1, 1));
    const shadows = [
      [0, 0, 0.7, 0.4],
      // ミシン本体の下
      [0.535, -0.29, 0.3, 0.22],
      [PC[0], PC[1], 0.16, 0.16]
    ];
    const shadowMesh = new THREE2.InstancedMesh(shadowGeo, shadowMat, shadows.length);
    const q = new THREE2.Quaternion().setFromEuler(new THREE2.Euler(-Math.PI / 2, 0, 0));
    shadows.forEach(([x, z, w, d], i) => {
      m4.compose(new THREE2.Vector3(x, 12e-4, z), q, new THREE2.Vector3(w, d, 1));
      shadowMesh.setMatrixAt(i, m4);
    });
    shadowMesh.renderOrder = -1;
    group.add(shadowMesh);
    const hemi = new THREE2.HemisphereLight(16775408, 14203030, 1.25);
    const key = new THREE2.DirectionalLight(16773600, 1.7);
    key.position.set(-0.6, 1.4, 1.2);
    const rim = new THREE2.DirectionalLight(14676223, 0.7);
    rim.position.set(-0.8, 0.9, -0.6);
    group.add(hemi, key, key.target, rim, rim.target);
    return {
      group,
      displaySlots,
      dispose() {
        scene.remove(group);
        owned.geos.forEach((g) => g.dispose());
        owned.mats.forEach((m) => m.dispose());
        owned.texs.forEach((t) => t.dispose());
        group.traverse((o) => {
          if (o.isInstancedMesh) o.dispose();
        });
      }
    };
  }

  // app/shell/src/env.js
  function createEnvironment(THREE2, renderer, scene, size = 128) {
    let rt = null;
    function makeEnvScene() {
      const s = new THREE2.Scene();
      const geo = new THREE2.SphereGeometry(5, 24, 12);
      const col = new Float32Array(geo.attributes.position.count * 3);
      const top = new THREE2.Color(16775922), mid = new THREE2.Color(16179172), low = new THREE2.Color(13146732), c = new THREE2.Color();
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const y = geo.attributes.position.getY(i) / 5;
        if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.4));
        else c.copy(mid).lerp(low, Math.min(1, -y * 2));
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new THREE2.BufferAttribute(col, 3));
      const mat = new THREE2.MeshBasicMaterial({ vertexColors: true, side: THREE2.BackSide });
      s.add(new THREE2.Mesh(geo, mat));
      const pg = new THREE2.PlaneGeometry(1, 1);
      const pm = new THREE2.MeshBasicMaterial({ color: new THREE2.Color(2.2, 2.2, 2.1) });
      const win = new THREE2.Mesh(pg, pm);
      win.scale.set(2.2, 1.6, 1);
      win.position.set(-1.5, 1.4, -3.5);
      win.lookAt(0, 0, 0);
      s.add(win);
      const lamp = new THREE2.Mesh(pg, pm);
      lamp.scale.set(2.5, 2.5, 1);
      lamp.position.set(0.5, 4.5, 1.5);
      lamp.lookAt(0, 0, 0);
      s.add(lamp);
      return { s, dispose() {
        geo.dispose();
        mat.dispose();
        pg.dispose();
        pm.dispose();
      } };
    }
    function build() {
      if (rt) {
        rt.dispose();
        rt = null;
      }
      const pm = new THREE2.PMREMGenerator(renderer);
      const e = makeEnvScene();
      rt = pm.fromScene(e.s, 0.02, 0.1, 20, { size });
      pm.dispose();
      e.dispose();
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.85;
    }
    build();
    return {
      rebuild: build,
      get renderTarget() {
        return rt;
      },
      dispose() {
        if (rt) rt.dispose();
        rt = null;
        scene.environment = null;
      }
    };
  }

  // app/shell/src/input.js
  var TAP_MAX_TIME = 0.35;
  var TAP_MAX_MOVE = 14;
  var NEAR_PX = 90;
  function createInput(THREE2, canvas, getCamera, now2) {
    const raycaster = new THREE2.Raycaster();
    const ndc = new THREE2.Vector2();
    const tmpV = new THREE2.Vector3();
    const st = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startT: 0,
      moved: 0,
      lastX: 0,
      lastY: 0,
      accDx: 0,
      accDy: 0,
      pressed: false,
      released: false,
      tapped: false,
      down: false,
      part: null,
      grabPoint: null,
      lastTouch: -1e9,
      pendingDown: null
    };
    const listeners = { down: [] };
    const input = {
      time: 0,
      down: false,
      pressed: false,
      released: false,
      tapped: false,
      part: null,
      grabPoint: null,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      ray: raycaster.ray,
      camera: null,
      viewport: { width: 1, height: 1 },
      idle: 0,
      project(v, out) {
        const cam = getCamera();
        tmpV.copy(v).project(cam);
        const o = out || {};
        o.x = (tmpV.x * 0.5 + 0.5) * input.viewport.width;
        o.y = (-tmpV.y * 0.5 + 0.5) * input.viewport.height;
        o.behind = tmpV.z > 1;
        return o;
      }
    };
    function local(e) {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    function onDown(e) {
      if (st.pointerId !== null) return;
      st.pointerId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
      }
      const [x, y] = local(e);
      st.startX = st.lastX = x;
      st.startY = st.lastY = y;
      st.startT = now2();
      st.moved = 0;
      st.down = true;
      st.pressed = true;
      st.pendingDown = { x, y };
      st.lastTouch = now2();
      e.preventDefault();
    }
    function onMove(e) {
      if (e.pointerId !== st.pointerId) return;
      const [x, y] = local(e);
      st.accDx += x - st.lastX;
      st.accDy += y - st.lastY;
      st.moved = Math.max(st.moved, Math.hypot(x - st.startX, y - st.startY));
      st.lastX = x;
      st.lastY = y;
      st.lastTouch = now2();
      e.preventDefault();
    }
    function onUp(e) {
      if (e.pointerId !== st.pointerId) return;
      const [x, y] = local(e);
      st.accDx += x - st.lastX;
      st.accDy += y - st.lastY;
      st.lastX = x;
      st.lastY = y;
      st.released = true;
      st.down = false;
      st.tapped = e.type === "pointerup" && now2() - st.startT < TAP_MAX_TIME && st.moved < TAP_MAX_MOVE;
      st.pointerId = null;
      st.lastTouch = now2();
      e.preventDefault();
    }
    canvas.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });
    const stop = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchstart", stop, { passive: false });
    document.addEventListener("touchmove", stop, { passive: false });
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("dblclick", stop, { passive: false });
    document.addEventListener("contextmenu", stop, { passive: false });
    function setRay(x, y) {
      ndc.set(x / input.viewport.width * 2 - 1, -(y / input.viewport.height) * 2 + 1);
      raycaster.setFromCamera(ndc, getCamera());
    }
    function frame(hero, hint, viewport) {
      input.viewport.width = viewport.width;
      input.viewport.height = viewport.height;
      input.camera = getCamera();
      input.time = now2();
      if (st.pendingDown) {
        const { x, y } = st.pendingDown;
        st.pendingDown = null;
        setRay(x, y);
        let part = null, point = null;
        const targets = hero && hero.hitTargets ? hero.hitTargets : [];
        if (targets.length) {
          const hits = raycaster.intersectObjects(targets, true);
          for (const h of hits) {
            let o = h.object;
            while (o && !(o.userData && typeof o.userData.part === "string")) o = o.parent;
            if (o) {
              part = o.userData.part;
              point = h.point.clone();
              break;
            }
          }
        }
        if (!part && hint && hint.position) {
          const s = input.project(hint.position);
          if (!s.behind && Math.hypot(s.x - x, s.y - y) < NEAR_PX + hintRadiusPx(hint)) {
            part = hint.part;
            point = hint.position.clone();
          }
        }
        st.part = part;
        st.grabPoint = point;
        listeners.down.forEach((f) => f(x, y, part));
      }
      input.down = st.down;
      input.pressed = st.pressed;
      input.released = st.released;
      input.tapped = st.tapped;
      input.x = st.lastX;
      input.y = st.lastY;
      input.dx = st.accDx;
      input.dy = st.accDy;
      input.part = st.part;
      input.grabPoint = st.grabPoint;
      input.idle = st.down ? 0 : Math.max(0, now2() - st.lastTouch);
      setRay(st.lastX, st.lastY);
      return input;
    }
    function endFrame() {
      st.pressed = false;
      st.tapped = false;
      st.accDx = 0;
      st.accDy = 0;
      if (st.released) {
        st.released = false;
        st.part = null;
        st.grabPoint = null;
      }
    }
    function hintRadiusPx(hint) {
      const cam = getCamera();
      const a = input.project(hint.position, {});
      tmpV.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(hint.radius || 0.03).add(hint.position);
      const b = input.project(tmpV, {});
      return Math.hypot(b.x - a.x, b.y - a.y);
    }
    return {
      input,
      frame,
      endFrame,
      hintRadiusPx,
      onDown(f) {
        listeners.down.push(f);
      },
      /** 触った扱いにする（nudge 等で idle を進めたいときに使わない。idle は実際の指だけで決まる） */
      get lastTouch() {
        return st.lastTouch;
      }
    };
  }

  // app/shell/src/audio.js
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function createAudio() {
    let ctx = null, master = null, noiseBuf = null;
    let hum = null;
    const lastAt = /* @__PURE__ */ new Map();
    const log = [];
    let unknownWarned = /* @__PURE__ */ new Set();
    function ensure() {
      if (ctx) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {
        });
        return ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 70;
      const og = ctx.createGain();
      og.gain.value = 0.25;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp);
      bp.connect(g);
      osc.connect(og);
      og.connect(g);
      g.connect(master);
      src.start();
      osc.start();
      hum = { g, bp, osc };
      if (ctx.state === "suspended") ctx.resume().catch(() => {
      });
      return ctx;
    }
    function env(gainNode, t, a, peak, d) {
      gainNode.gain.setValueAtTime(1e-4, t);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(2e-4, peak), t + a);
      gainNode.gain.exponentialRampToValueAtTime(1e-4, t + a + d);
    }
    function tone(type, f0, f1, dur, peak, delay = 0) {
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      env(g, t, 6e-3, peak, dur);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    function noise(type, freq, q, dur, peak, delay = 0, f1) {
      const t = ctx.currentTime + delay;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      f.Q.value = q;
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      env(g, t, 4e-3, peak, dur);
      s.connect(f);
      f.connect(g);
      g.connect(master);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.05);
    }
    const note = (semi) => 523.25 * Math.pow(2, semi / 12);
    const SOUNDS = {
      tap: () => tone("sine", 880, 990, 0.12, 0.25),
      slide: () => noise("bandpass", 600, 1.5, 0.45, 0.35, 0, 2400),
      clunk: (p) => {
        const gn = p && p.gain != null ? p.gain : 1;
        tone("sine", 150, 70, 0.18, 0.6 * gn);
        noise("lowpass", 900, 0.7, 0.05, 0.4 * gn);
      },
      tick: (p) => noise("highpass", 2500 + 2500 * (p && p.pitch || 0), 2, 0.025, 0.22),
      needle: (p) => {
        const i = Math.max(0, Math.min(PENTA.length - 1, Math.round((p && p.pitch || 0) * (PENTA.length - 1))));
        tone("triangle", note(PENTA[i] - 12), null, 0.16, 0.45);
        tone("sine", note(PENTA[i]), null, 0.22, 0.18);
        noise("bandpass", 1800, 3, 0.03, 0.25);
      },
      hook: () => noise("bandpass", 3200, 4, 0.08, 0.12, 0, 1600),
      feed: () => noise("bandpass", 1200, 2, 0.05, 0.1),
      pop: () => {
        tone("sine", 320, 760, 0.18, 0.5);
        noise("bandpass", 1500, 1, 0.08, 0.3);
      },
      nudge: () => {
        tone("sine", 220, 180, 0.12, 0.35);
      },
      whoosh: () => noise("bandpass", 400, 0.8, 0.7, 0.4, 0, 2600),
      sparkle: () => {
        [0, 4, 7, 12, 16].forEach((s, k) => tone("sine", note(s + 12), null, 0.5, 0.22, k * 0.09));
      },
      ripple: () => tone("sine", 660, 700, 0.08, 0.12)
    };
    return {
      unlock: ensure,
      get state() {
        return ctx ? ctx.state : "none";
      },
      log,
      cue(name, params2) {
        log.push(name);
        if (log.length > 64) log.shift();
        if (!ctx || ctx.state !== "running") return;
        const t = performance.now();
        if ((lastAt.get(name) || 0) > t - 40) return;
        lastAt.set(name, t);
        const f = SOUNDS[name];
        if (!f) {
          if (!unknownWarned.has(name)) {
            unknownWarned.add(name);
            console.warn("unknown cue: " + name);
          }
          SOUNDS.tap();
          return;
        }
        try {
          f(params2);
        } catch (e) {
        }
      },
      /** 回転の連続音（crankSpeed rad/s） */
      setSpin(speed) {
        if (!hum || !ctx || ctx.state !== "running") return;
        const k = Math.min(1, Math.max(0, speed / (4 * Math.PI)));
        const t = ctx.currentTime;
        hum.g.gain.setTargetAtTime(k * 0.22, t, 0.06);
        hum.bp.frequency.setTargetAtTime(600 + 1400 * k, t, 0.08);
        hum.osc.frequency.setTargetAtTime(55 + 60 * k, t, 0.08);
      },
      suspend() {
        if (ctx && ctx.state === "running") ctx.suspend().catch(() => {
        });
      },
      resume() {
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {
        });
      }
    };
  }

  // app/shell/src/camera.js
  var box = (x0, x1, y0, y1, z0, z1) => {
    const out = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push([x, y, z]);
    return out;
  };
  var RING = [[0.39, 0.24, 0], [0.285, 0.345, 0], [0.285, 0.135, 0], [0.285, 0.24, 0.1], [0.285, 0.24, -0.1]];
  var VIEWS = {
    // 機械全体＋手前の布（いちばん大きな操作部）＋押さえレバー＋手回し車
    front: {
      target: [0, 0.12, 0.1],
      dir: [0.34, 0.62, 1],
      minDist: 0.95,
      fit: [...box(-0.29, 0.3, 0, 0.36, -0.13, 0.14), [-0.23, 0, 0.42], [-0.05, 0, 0.42], ...RING]
    },
    // カバーを外した中：頭の中のクランク・針の後ろの縫い目・軸と歯車、そして回す手回し車（輪ごと）
    inside: {
      target: [0, 0.12, 0.02],
      dir: [0.2, 0.33, 1],
      minDist: 0.8,
      fit: [...box(-0.25, 0.22, 0, 0.33, -0.07, 0.13), [-0.14, 0.05, 0.16], ...RING]
    },
    // 壁のひもの飾り 3 枚
    display: {
      target: [0.465, 0.62, -0.47],
      dir: [-0.1, 0.02, 1],
      minDist: 0.8,
      fit: [...box(0.17, 0.76, 0.5, 0.79, -0.47, -0.46)]
    }
  };
  var FOV = 36;
  var TWEEN = 1.6;
  var MARGIN_X = 0.92;
  var MARGIN_Y = 0.9;
  function createCameraRig(THREE2) {
    const camera = new THREE2.PerspectiveCamera(FOV, 1, 0.03, 12);
    const cur = { pos: new THREE2.Vector3(), tgt: new THREE2.Vector3() };
    const from = { pos: new THREE2.Vector3(), tgt: new THREE2.Vector3() };
    const to = { pos: new THREE2.Vector3(), tgt: new THREE2.Vector3() };
    const probe = new THREE2.PerspectiveCamera(FOV, 1, 0.03, 12);
    const dir = new THREE2.Vector3(), p = new THREE2.Vector3(), right = new THREE2.Vector3(), up = new THREE2.Vector3();
    const fitPts = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.fit.map((a) => new THREE2.Vector3().fromArray(a))]));
    let view = "front", t = 1;
    function bounds(pts, tgt, d) {
      probe.position.copy(dir).multiplyScalar(d).add(tgt);
      probe.lookAt(tgt);
      probe.updateMatrixWorld();
      probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
      const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, behind: false };
      for (const q of pts) {
        p.copy(q).applyMatrix4(probe.matrixWorldInverse);
        if (p.z > -0.05) {
          b.behind = true;
          continue;
        }
        p.applyMatrix4(probe.projectionMatrix);
        b.x0 = Math.min(b.x0, p.x);
        b.x1 = Math.max(b.x1, p.x);
        b.y0 = Math.min(b.y0, p.y);
        b.y1 = Math.max(b.y1, p.y);
      }
      return b;
    }
    const fits = (b) => !b.behind && b.x0 >= -MARGIN_X && b.x1 <= MARGIN_X && b.y0 >= -MARGIN_Y && b.y1 <= MARGIN_Y;
    function solve(name, aspect, outPos, outTgt) {
      const v = VIEWS[name] || VIEWS.front, pts = fitPts[name] || fitPts.front;
      probe.aspect = aspect;
      probe.updateProjectionMatrix();
      dir.fromArray(v.dir).normalize();
      outTgt.fromArray(v.target);
      let d = v.minDist;
      for (let pass = 0; pass < 3; pass++) {
        let lo = v.minDist, hi = 6;
        if (fits(bounds(pts, outTgt, lo))) hi = lo;
        else for (let i = 0; i < 26; i++) {
          const m = (lo + hi) / 2;
          if (fits(bounds(pts, outTgt, m))) hi = m;
          else lo = m;
        }
        d = hi;
        if (pass === 2) break;
        const b = bounds(pts, outTgt, d);
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const halfH = Math.tan(FOV * Math.PI / 180 / 2) * d, halfW = halfH * aspect;
        right.setFromMatrixColumn(probe.matrixWorld, 0);
        up.setFromMatrixColumn(probe.matrixWorld, 1);
        outTgt.addScaledVector(right, cx * halfW * 0.9).addScaledVector(up, cy * halfH * 0.9);
      }
      outPos.copy(dir).multiplyScalar(d).add(outTgt);
    }
    const ease = (x) => x * x * (3 - 2 * x);
    return {
      camera,
      get view() {
        return view;
      },
      get moving() {
        return t < 1;
      },
      setAspect(aspect, snap) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        solve(view, aspect, to.pos, to.tgt);
        if (snap || t >= 1) {
          cur.pos.copy(to.pos);
          cur.tgt.copy(to.tgt);
          t = 1;
          this.apply();
        }
      },
      go(name) {
        if (!VIEWS[name] || name === view) return;
        view = name;
        from.pos.copy(cur.pos);
        from.tgt.copy(cur.tgt);
        solve(view, camera.aspect, to.pos, to.tgt);
        t = 0;
      },
      update(dt) {
        if (t < 1) {
          t = Math.min(1, t + dt / TWEEN);
          const k = ease(ease(t));
          cur.pos.lerpVectors(from.pos, to.pos, k);
          cur.tgt.lerpVectors(from.tgt, to.tgt, k);
        }
        this.apply();
      },
      apply() {
        camera.position.copy(cur.pos);
        camera.lookAt(cur.tgt);
        camera.updateMatrixWorld();
      }
    };
  }

  // app/shell/src/hint.js
  var SHOW_AFTER = 3;
  function createHintLayer(fxEl) {
    const ring = document.createElement("div");
    ring.className = "ring";
    ring.style.display = "none";
    fxEl.appendChild(ring);
    const dots = [0, 1, 2].map((i) => {
      const d = document.createElement("div");
      d.className = "dot";
      d.style.display = "none";
      d.style.opacity = String(1 - i * 0.3);
      fxEl.appendChild(d);
      return d;
    });
    let forced = 0, phase = 0;
    const pts = [];
    let lastScreen = null;
    function hide() {
      ring.style.display = "none";
      dots.forEach((d) => d.style.display = "none");
    }
    return {
      /** nudge：すぐに 2.5 秒出す */
      force(sec = 2.5) {
        forced = Math.max(forced, sec);
      },
      get screen() {
        return lastScreen;
      },
      /**
       * @param hint hero.getHint() の結果
       * @param idle 秒
       * @param project 世界→画面
       * @param radiusPx 輪の半径（px）
       */
      update(dt, hint, idle, down, project, radiusPx) {
        forced = Math.max(0, forced - dt);
        lastScreen = null;
        if (!hint || !hint.position) {
          hide();
          return;
        }
        const c = project(hint.position, {});
        const path = (hint.path || []).map((p) => project(p, {}));
        lastScreen = { part: hint.part, gesture: hint.gesture, x: c.x, y: c.y, r: radiusPx, path: path.map((p) => ({ x: p.x, y: p.y })) };
        const show = !down && (idle > SHOW_AFTER || forced > 0) && !c.behind;
        if (!show) {
          hide();
          phase = 0;
          return;
        }
        phase += dt;
        const r = Math.max(46, Math.min(200, radiusPx * 1.15));
        ring.style.display = "block";
        ring.style.left = c.x + "px";
        ring.style.top = c.y + "px";
        ring.style.width = ring.style.height = r * 2 + "px";
        if ((hint.gesture === "drag" || hint.gesture === "circle") && path.length >= 2) {
          pts.length = 0;
          pts.push(...path);
          if (hint.gesture === "circle") widenCircle(pts, Math.max(40, radiusPx * 0.55));
          const closed = hint.gesture === "circle";
          const period = closed ? 1.8 : 1.3;
          dots.forEach((d, i) => {
            let u = (phase - i * 0.09) / period % 1;
            if (u < 0) u += 1;
            const p = along(pts, u, closed);
            d.style.display = "block";
            d.style.transform = "";
            d.style.left = p.x + "px";
            d.style.top = p.y + "px";
          });
        } else {
          const s = 0.7 + 0.5 * Math.abs(Math.sin(phase * Math.PI * 1.2));
          dots.forEach((d, i) => {
            if (i) {
              d.style.display = "none";
              return;
            }
            d.style.display = "block";
            d.style.left = c.x + "px";
            d.style.top = c.y + "px";
            d.style.transform = "scale(" + s.toFixed(2) + ")";
          });
        }
      },
      ripple(x, y) {
        const d = document.createElement("div");
        d.className = "ripple";
        d.style.left = x + "px";
        d.style.top = y + "px";
        fxEl.appendChild(d);
        setTimeout(() => d.remove(), 650);
      }
    };
  }
  function along(pts, u, closed) {
    const n = closed ? pts.length : pts.length - 1;
    const f = u * n, i = Math.floor(f) % pts.length, k = f - Math.floor(f);
    const a = pts[i], b = pts[(i + 1) % pts.length];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  function widenCircle(pts, minR) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= n;
    cy /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of pts) {
      const dx = p.x - cx, dy = p.y - cy;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    let ux = sxy, uy = l1 - sxx;
    if (Math.abs(ux) + Math.abs(uy) < 1e-9) {
      ux = sxx >= syy ? 1 : 0;
      uy = sxx >= syy ? 0 : 1;
    }
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const vx = -uy, vy = ux;
    const rMajor = Math.sqrt(2 * l1 / n), rMinor = Math.sqrt(2 * l2 / n);
    const wantMinor = Math.max(rMajor * 0.6, minR * 0.6);
    const wantMajor = Math.max(rMajor, minR);
    const kv = rMinor > 1e-3 ? Math.max(1, wantMinor / rMinor) : 1;
    const ku = rMajor > 1e-3 ? wantMajor / rMajor : 1;
    if (rMinor <= 1e-3) return;
    for (const p of pts) {
      const dx = p.x - cx, dy = p.y - cy;
      const a = (dx * ux + dy * uy) * ku, b = (dx * vx + dy * vy) * kv;
      p.x = cx + a * ux + b * vx;
      p.y = cy + a * uy + b * vy;
    }
  }

  // app/shell/src/debug.js
  function createStats(THREE2, renderer, scene, getHeroRoot, tier, envRef) {
    const dts = new Float32Array(240);
    let n = 0, k = 0;
    let last = { calls: 0, triangles: 0 };
    let staticCache = null;
    function frame(dt) {
      dts[k] = dt;
      k = (k + 1) % dts.length;
      n = Math.min(n + 1, dts.length);
    }
    function afterRender() {
      last = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    }
    function fps() {
      if (!n) return { avg: 0, p95: 0, p95ms: 0 };
      const a = Array.from(dts.slice(0, n)).sort((x, y) => x - y);
      const mean = a.reduce((s, v) => s + v, 0) / n;
      const p95 = a[Math.min(n - 1, Math.floor(n * 0.95))];
      return { avg: 1 / Math.max(1e-6, mean), p95: 1 / Math.max(1e-6, p95), p95ms: p95 * 1e3 };
    }
    function texBytes(t) {
      if (t.isRenderTargetTexture) return 0;
      const img = t.image;
      const w = img && (img.width || img.videoWidth) || 0, h = img && (img.height || img.videoHeight) || 0;
      const mips = t.generateMipmaps && t.minFilter !== THREE2.LinearFilter && t.minFilter !== THREE2.NearestFilter ? 4 / 3 : 1;
      const bpp = t.type === THREE2.FloatType ? 16 : t.type === THREE2.HalfFloatType ? 8 : 4;
      return w * h * bpp * mips;
    }
    function geoBytes(g) {
      let b = 0;
      for (const a of Object.values(g.attributes)) b += a.array.byteLength;
      if (g.index) b += g.index.array.byteLength;
      return b;
    }
    function isVisible(o) {
      for (let p = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    }
    function scan() {
      const heroRoot = getHeroRoot();
      const texs = /* @__PURE__ */ new Map(), geos = /* @__PURE__ */ new Map();
      let triHero = 0, triBg = 0, meshesHero = 0, meshesBg = 0, instBytes = 0;
      const heroSet = /* @__PURE__ */ new Set();
      if (heroRoot) heroRoot.traverse((o) => heroSet.add(o));
      scene.traverse((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints)) return;
        const inHero = heroSet.has(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const v of Object.values(m)) if (v && v.isTexture && !v.isRenderTargetTexture) {
            const e = texs.get(v) || { hero: false, bg: false };
            if (inHero) e.hero = true;
            else e.bg = true;
            texs.set(v, e);
          }
        }
        if (o.geometry) geos.set(o.geometry, true);
        if (o.isInstancedMesh) instBytes += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
        if (!o.isMesh || !isVisible(o) || mats.every((m) => !m || !m.visible)) return;
        const g = o.geometry;
        let cnt = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
        cnt = Math.min(cnt, g.drawRange.count);
        let tri = cnt / 3;
        if (o.isInstancedMesh) tri *= o.count;
        if (inHero) {
          triHero += tri;
          meshesHero++;
        } else {
          triBg += tri;
          meshesBg++;
        }
      });
      let texHeroB = 0, texBgB = 0, texHeroN = 0, texBgN = 0;
      for (const [t, e] of texs) {
        const b = texBytes(t);
        if (e.hero) {
          texHeroB += b;
          texHeroN++;
        } else {
          texBgB += b;
          texBgN++;
        }
      }
      let geoB = 0;
      for (const g of geos.keys()) geoB += geoBytes(g);
      const rt = envRef.renderTarget;
      const envB = rt ? rt.width * rt.height * 8 : 0;
      const w = renderer.domElement.width, h = renderer.domElement.height;
      const samples = tier.msaaSamples || 0;
      const fbB = w * h * ((4 + 4) * Math.max(1, samples) + (samples ? 4 : 0) + 4);
      const total = texHeroB + texBgB + geoB + instBytes + envB + fbB;
      staticCache = { triHero, triBg, meshesHero, meshesBg, texHeroN, texBgN, texHeroB, texBgB, geoB: geoB + instBytes, envB, fbB, total };
    }
    const MiB = (b) => (b / 1048576).toFixed(1);
    return {
      frame,
      afterRender,
      snapshot() {
        scan();
        const f = fps();
        return {
          tier: tier.name + (tier.downgraded ? "(\u21930.75)" : ""),
          canvasCss: [renderer.domElement.clientWidth, renderer.domElement.clientHeight],
          canvasPx: [renderer.domElement.width, renderer.domElement.height],
          pixelRatio: renderer.getPixelRatio(),
          fpsAvg: f.avg,
          fpsP95: f.p95,
          p95ms: f.p95ms,
          calls: last.calls,
          triangles: last.triangles,
          gpuTextures: renderer.info.memory.textures,
          gpuGeometries: renderer.info.memory.geometries,
          ...staticCache,
          mib: { texHero: +MiB(staticCache.texHeroB), texBg: +MiB(staticCache.texBgB), geo: +MiB(staticCache.geoB), env: +MiB(staticCache.envB), fb: +MiB(staticCache.fbB), total: +MiB(staticCache.total) }
        };
      },
      format(s, errors2, extra) {
        const k2 = (v) => (v / 1e3).toFixed(1) + "k";
        return [
          `tier ${s.tier}  canvas ${s.canvasCss[0]}x${s.canvasCss[1]} css / ${s.canvasPx[0]}x${s.canvasPx[1]} px (pr ${s.pixelRatio.toFixed(2)})`,
          `fps avg ${s.fpsAvg.toFixed(0)}  p95 ${s.fpsP95.toFixed(0)} (${s.p95ms.toFixed(1)}ms)`,
          `draw ${s.calls}  tri(frame) ${k2(s.triangles)}  tri hero ${k2(s.triHero)} / bg ${k2(s.triBg)}`,
          `tex gpu ${s.gpuTextures} (hero ${s.texHeroN} ${s.mib.texHero}MiB / bg ${s.texBgN} ${s.mib.texBg}MiB)  geo ${s.gpuGeometries}`,
          `GPU est ${s.mib.total}MiB = tex ${(s.mib.texHero + s.mib.texBg).toFixed(1)} + geo ${s.mib.geo} + env ${s.mib.env} + fb ${s.mib.fb}`,
          extra,
          `errors ${errors2.length}` + (errors2.length ? "\n" + errors2.slice(-3).map((e) => "  " + String(e).slice(0, 110)).join("\n") : "")
        ].join("\n");
      }
    };
  }

  // app/shell/src/main.js
  var THREE = window.THREE;
  var ADDONS = window.THREE_ADDONS || {};
  var params = new URLSearchParams(location.search);
  var DEBUG = params.get("debug") === "1";
  var VIEW_OF = { fabric: "front", foot: "front", sew1: "front", cover: "front", sew2: "inside", finish: "display" };
  var errors = [];
  function recordError(e) {
    const msg = e && e.message ? e.message : String(e);
    errors.push(msg);
    if (errors.length > 50) errors.shift();
  }
  window.addEventListener("error", (e) => recordError(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => recordError(e.reason));
  var origConsoleError = console.error.bind(console);
  console.error = (...a) => {
    recordError(a.map(String).join(" "));
    origConsoleError(...a);
  };
  var clock = { t0: performance.now() };
  var now = () => (performance.now() - clock.t0) / 1e3;
  async function boot() {
    const T_START = now();
    if (!THREE) throw new Error("three \u304C\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F");
    const tier = detectTier(params);
    const stageEl = document.getElementById("stage");
    const fxEl = document.getElementById("fx");
    const renderer = new THREE.WebGLRenderer({ antialias: tier.antialias, alpha: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = false;
    stageEl.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(16181732);
    const rig = createCameraRig(THREE);
    const camera = rig.camera;
    const tex = await loadTextures(THREE, renderer, { defer: ["floral_cotton_1024"] });
    const bg = buildBackground(THREE, scene, tex, tier);
    const env = createEnvironment(THREE, renderer, scene, tier.envSize);
    const audio = createAudio();
    const inp = createInput(THREE, canvas, () => camera, now);
    const hintLayer = createHintLayer(fxEl);
    const state = { stage: "fabric", stageLog: [], contextLost: false, lostCount: 0, restoredCount: 0, heroFailed: 0, frames: 0, firstFrameAt: 0 };
    let hero = null;
    const heroOpts = {
      addons: ADDONS,
      textures: { metal: tex.brushed_metal_1024, linen: tex.linen_fabric_1024, floral: tex.floral_cotton_1024 },
      tier: { name: tier.name, detail: tier.detail, maxTextureSize: tier.maxTextureSize },
      displaySlots: bg.displaySlots,
      debug: DEBUG,
      onStage(stage, info) {
        state.stageLog.push({ stage, t: +now().toFixed(2), round: info && info.round });
        state.stage = stage;
        rig.go(VIEW_OF[stage] || "front");
      },
      onCue(name, p) {
        if (name === "nudge") hintLayer.force(2.5);
        audio.cue(name, p);
      }
    };
    try {
      const mod = window.__HERO_MODULE__;
      if (!mod || typeof mod.createHero !== "function") throw new Error("hero.bundle.js \u306B createHero \u304C\u3042\u308A\u307E\u305B\u3093");
      hero = mod.createHero(THREE, heroOpts);
      if (!hero || !hero.root) throw new Error("createHero \u306E\u623B\u308A\u5024\u306B root \u304C\u3042\u308A\u307E\u305B\u3093");
      scene.add(hero.root);
      state.stage = hero.status && hero.status.stage || "fabric";
      state.stageLog.push({ stage: state.stage, t: +now().toFixed(2), round: 0 });
    } catch (e) {
      console.error("hero: " + (e && e.message ? e.message : e));
      hero = null;
    }
    rig.go(VIEW_OF[state.stage] || "front");
    function resize() {
      const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
      renderer.setPixelRatio(effectivePixelRatio(tier, w, h));
      renderer.setSize(w, h, false);
      rig.setAspect(w / h, state.frames === 0);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => setTimeout(resize, 200));
    resize();
    const governor = new PerfGovernor(tier, resize);
    inp.onDown((x, y, part) => {
      audio.unlock();
      hintLayer.ripple(x, y);
      if (!part) audio.cue("ripple");
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      state.contextLost = true;
      state.lostCount++;
      try {
        hero && hero.onContextLost && hero.onContextLost();
      } catch (err) {
        recordError(err);
      }
    }, false);
    canvas.addEventListener("webglcontextrestored", () => {
      state.contextLost = false;
      state.restoredCount++;
      try {
        env.rebuild();
        scene.traverse((o) => {
          const mats = o.material ? Array.isArray(o.material) ? o.material : [o.material] : [];
          for (const m of mats) {
            m.needsUpdate = true;
            for (const v of Object.values(m)) if (v && v.isTexture && !v.isRenderTargetTexture && v.image) v.needsUpdate = true;
          }
          if (o.isInstancedMesh) {
            o.instanceMatrix.needsUpdate = true;
            if (o.instanceColor) o.instanceColor.needsUpdate = true;
          }
        });
        hero && hero.onContextRestored && hero.onContextRestored();
      } catch (err) {
        recordError(err);
      }
    }, false);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) audio.suspend();
      else {
        audio.resume();
        lastT = now();
      }
    });
    const stats = createStats(THREE, renderer, scene, () => hero && hero.root, tier, env);
    let dbgEl = null, dbgAge = 1;
    if (DEBUG) {
      dbgEl = document.createElement("div");
      dbgEl.id = "debug";
      document.body.appendChild(dbgEl);
    }
    function afterFirstFrame() {
      tex.loadDeferred().catch(recordError);
      if (renderer.compileAsync && !state.contextLost) renderer.compileAsync(scene, camera).catch(recordError);
    }
    let lastT = now();
    let hint = null;
    function frame() {
      const t = now();
      let dt = t - lastT;
      lastT = t;
      if (document.hidden) return;
      const rawDt = dt;
      dt = Math.min(0.05, Math.max(0, dt));
      const vp = { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 };
      rig.update(dt);
      const input = inp.frame(hero, hint, vp);
      if (hero && state.heroFailed < 30) {
        try {
          hero.update(dt, input);
        } catch (e) {
          state.heroFailed++;
          recordError(e);
        }
        try {
          hint = hero.getHint ? hero.getHint() : null;
        } catch (e) {
          hint = null;
          recordError(e);
        }
      } else hint = null;
      inp.endFrame();
      audio.setSpin(hero && hero.status ? hero.status.crankSpeed || 0 : 0);
      hintLayer.update(dt, hint && !(hero.status && hero.status.busy) ? hint : null, input.idle, input.down, input.project, hint ? inp.hintRadiusPx(hint) : 0);
      if (!state.contextLost) {
        renderer.render(scene, camera);
        stats.afterRender();
        if (state.frames === 0) {
          state.firstFrameAt = now() - T_START;
          const bootEl = document.getElementById("boot");
          if (bootEl) {
            bootEl.classList.add("gone");
            setTimeout(() => bootEl.remove(), 600);
          }
          setTimeout(afterFirstFrame, 300);
        }
        state.frames++;
        stats.frame(rawDt);
        governor.sample(rawDt);
      }
      if (dbgEl && (dbgAge += dt) > 0.25) {
        dbgAge = 0;
        const s = stats.snapshot();
        const hs = hero && hero.status ? hero.status : {};
        dbgEl.textContent = stats.format(s, errors, `stage ${hs.stage || state.stage} r${hs.round ?? "-"} ${hs.pattern || ""} st ${hs.stitches ?? "-"}  view ${rig.view}  audio ${audio.state}  boot ${(state.firstFrameAt * 1e3).toFixed(0)}ms  lost ${state.lostCount}/${state.restoredCount}`);
      }
    }
    renderer.setAnimationLoop(frame);
    window.__game = {
      get ready() {
        return state.frames > 2;
      },
      get stage() {
        return hero && hero.status ? hero.status.stage : state.stage;
      },
      get status() {
        return hero && hero.status ? { ...hero.status } : null;
      },
      get view() {
        return rig.view;
      },
      get cameraMoving() {
        return rig.moving;
      },
      get stageLog() {
        return state.stageLog.slice();
      },
      get errors() {
        return errors.slice();
      },
      get firstFrameAt() {
        return state.firstFrameAt;
      },
      get contextState() {
        return { lost: state.contextLost, lostCount: state.lostCount, restoredCount: state.restoredCount, frames: state.frames };
      },
      hint() {
        return hintLayer.screen;
      },
      stats() {
        return stats.snapshot();
      },
      audioLog() {
        return audio.log.slice();
      },
      _ext: null,
      loseContext() {
        this._ext = renderer.getContext().getExtension("WEBGL_lose_context");
        if (this._ext) this._ext.loseContext();
        return !!this._ext;
      },
      restoreContext() {
        if (this._ext) this._ext.restoreContext();
      },
      /** 測定用：自動で下げた解像度を戻す（1 = tier の DPR どおり） */
      setRenderScale(k) {
        tier.renderScale = k;
        tier.downgraded = true;
        resize();
      }
    };
  }
  boot().catch((e) => {
    recordError(e);
    console.error(e);
    const bootEl = document.getElementById("boot");
    if (bootEl) bootEl.classList.add("gone");
  });
})();
