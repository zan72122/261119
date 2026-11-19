// 周辺の場面（部屋）。遠くからしか見えないので、低ポリ＋写真風テクスチャ（512²）か板ポリゴンの絵で済ませる。
// buildCore: 最初の1フレームに要る物だけ（床・ラグ・壁・光）。buildExtras: 最初の描画の後に作る遠景（窓・家具・疑似影）。
(function () {
  'use strict';
  const S = (window.Shell = window.Shell || {});
  const THREE = window.THREE;
  const A = window.THREE_ADDONS;

  const ROOM = Object.freeze({ x0: -3.0, x1: 3.2, z0: -1.8, z1: 2.6, h: 2.6 });

  function scaleUV(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }

  // 頂点色つきの非インデックス形状にして結合できるようにする
  function colored(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  function box(w, h, d, x, y, z, hex, ry) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return colored(g, hex);
  }

  function roundBox(w, h, d, r, x, y, z, hex) {
    const g = new A.RoundedBoxGeometry(w, h, d, 2, r);
    g.translate(x, y, z);
    return colored(g, hex);
  }

  function mergeAll(list) {
    const m = A.mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    return m;
  }

  // ---- 最初の場面 ----
  function buildCore(scene, ctx) {
    const group = new THREE.Group();
    group.name = 'shell-room';
    const tex = ctx.textures;
    const settings = ctx.settings;

    // 床
    const floorW = ROOM.x1 - ROOM.x0, floorD = ROOM.z1 - ROOM.z0;
    const floorGeo = scaleUV(new THREE.PlaneGeometry(floorW, floorD), floorW / 1.35, floorD / 1.35);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tex.get('wood_floor_512') }));
    floor.name = 'floor';
    floor.receiveShadow = true;
    floor.matrixAutoUpdate = false;
    group.add(floor);

    // ラグ（角丸の長方形、1.4m 周期）
    const rw = 3.2, rd = 2.2, rr = 0.35;
    const shape = new THREE.Shape();
    shape.moveTo(-rw / 2 + rr, -rd / 2);
    shape.lineTo(rw / 2 - rr, -rd / 2);
    shape.quadraticCurveTo(rw / 2, -rd / 2, rw / 2, -rd / 2 + rr);
    shape.lineTo(rw / 2, rd / 2 - rr);
    shape.quadraticCurveTo(rw / 2, rd / 2, rw / 2 - rr, rd / 2);
    shape.lineTo(-rw / 2 + rr, rd / 2);
    shape.quadraticCurveTo(-rw / 2, rd / 2, -rw / 2, rd / 2 - rr);
    shape.lineTo(-rw / 2, -rd / 2 + rr);
    shape.quadraticCurveTo(-rw / 2, -rd / 2, -rw / 2 + rr, -rd / 2);
    const rugGeo = scaleUV(new THREE.ShapeGeometry(shape, 6), 1 / 1.4, 1 / 1.4);
    rugGeo.rotateX(-Math.PI / 2);
    rugGeo.translate(0.05, 0.003, 0.08);
    const rugMat = new THREE.MeshLambertMaterial({ map: tex.get('rug_wool_512'), color: '#fff8f2', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.name = 'rug';
    rug.receiveShadow = true;
    rug.matrixAutoUpdate = false;
    group.add(rug);

    // 壁（奥・左・右を1つに）
    const H = ROOM.h, P = 1.2;
    const back = scaleUV(new THREE.PlaneGeometry(floorW, H), floorW / P, H / P);
    back.translate((ROOM.x0 + ROOM.x1) / 2, H / 2, ROOM.z0);
    const left = scaleUV(new THREE.PlaneGeometry(floorD, H), floorD / P, H / P);
    left.rotateY(Math.PI / 2);
    left.translate(ROOM.x0, H / 2, (ROOM.z0 + ROOM.z1) / 2);
    const right = scaleUV(new THREE.PlaneGeometry(floorD, H), floorD / P, H / P);
    right.rotateY(-Math.PI / 2);
    right.translate(ROOM.x1, H / 2, (ROOM.z0 + ROOM.z1) / 2);
    const walls = new THREE.Mesh(mergeAll([back, left, right]), new THREE.MeshLambertMaterial({ map: tex.get('wallpaper_pastel_512'), color: '#fff4ee' }));
    walls.name = 'walls';
    walls.matrixAutoUpdate = false;
    group.add(walls);

    // 幅木
    const trim = new THREE.Mesh(mergeAll([
      box(floorW, 0.1, 0.03, (ROOM.x0 + ROOM.x1) / 2, 0.05, ROOM.z0 + 0.015, '#fffaf4'),
      box(0.03, 0.1, floorD, ROOM.x0 + 0.015, 0.05, (ROOM.z0 + ROOM.z1) / 2, '#fffaf4'),
      box(0.03, 0.1, floorD, ROOM.x1 - 0.015, 0.05, (ROOM.z0 + ROOM.z1) / 2, '#fffaf4'),
    ]), new THREE.MeshLambertMaterial({ vertexColors: true }));
    trim.name = 'trim';
    trim.matrixAutoUpdate = false;
    group.add(trim);

    // 光：空の半球光＋1灯の平行光（影は hero の周りだけ 512²）
    const hemi = new THREE.HemisphereLight('#fff7ef', '#caa47c', 1.25);
    group.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3e2', 2.1);
    sun.name = 'sun';
    sun.position.set(-1.1, 3.4, 2.1);
    sun.target.position.set(0.1, 0, -0.1);
    group.add(sun.target);
    if (settings.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
      const c = sun.shadow.camera;
      c.left = -1.6; c.right = 1.7; c.top = 1.45; c.bottom = -1.25; c.near = 1.0; c.far = 7.5;
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.012;
      sun.shadow.radius = 2;
    }
    group.add(sun);

    scene.add(group);
    return { group, sun, hemi };
  }

  // ---- 遠景（最初の描画の後） ----
  function drawWindowView(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fd0ff');
    sky.addColorStop(0.65, '#d7f0ff');
    sky.addColorStop(1, '#fff3d6');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    [[90, 60, 46], [130, 52, 34], [60, 66, 30], [360, 90, 40], [400, 80, 30], [330, 96, 26]].forEach(([x, y, r]) => {
      g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.75, 0, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#9fd78a';
    g.beginPath(); g.moveTo(0, h * 0.72);
    g.bezierCurveTo(w * 0.25, h * 0.55, w * 0.45, h * 0.8, w * 0.7, h * 0.64);
    g.bezierCurveTo(w * 0.85, h * 0.56, w * 0.95, h * 0.62, w, h * 0.6);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    g.fillStyle = '#7cc56e';
    g.beginPath(); g.moveTo(0, h * 0.86);
    g.bezierCurveTo(w * 0.3, h * 0.74, w * 0.6, h * 0.95, w, h * 0.8);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
    // 木
    g.fillStyle = '#a77650'; g.fillRect(w * 0.78, h * 0.5, 10, 50);
    g.fillStyle = '#5fae5a';
    g.beginPath(); g.arc(w * 0.78 + 5, h * 0.45, 34, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.78 - 18, h * 0.52, 24, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(w * 0.78 + 28, h * 0.53, 24, 0, Math.PI * 2); g.fill();
  }

  function drawPicture(g, w, h) {
    g.fillStyle = '#fffdf6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(w * 0.78, h * 0.25, h * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9fdc8a'; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#ff9fbf'; g.fillRect(w * 0.2, h * 0.48, w * 0.32, h * 0.3);
    g.fillStyle = '#ff6f8f'; g.beginPath(); g.moveTo(w * 0.15, h * 0.5); g.lineTo(w * 0.36, h * 0.3); g.lineTo(w * 0.57, h * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#7ec8ff'; g.fillRect(w * 0.3, h * 0.58, w * 0.1, h * 0.2);
    ['#ff7aa8', '#ffb347', '#a98bff'].forEach((c, i) => {
      const x = w * (0.66 + i * 0.1), y = h * 0.74;
      g.fillStyle = '#4caf50'; g.fillRect(x - 1, y, 3, h * 0.12);
      g.fillStyle = c; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    });
  }

  function drawBlob(g, w, h) {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(60,40,30,0.55)');
    r.addColorStop(0.55, 'rgba(60,40,30,0.25)');
    r.addColorStop(1, 'rgba(60,40,30,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }

  function buildExtras(scene, core, ctx) {
    const tex = ctx.textures;
    const group = new THREE.Group();
    group.name = 'shell-far';
    const parts = [];

    // 窓（奥の壁）：枠＋外の景色の板
    const wx = -0.45, wy = 1.45, ww = 1.3, wh = 0.95, wz = ROOM.z0;
    const fc = '#fffdf8';
    parts.push(
      box(ww + 0.12, 0.07, 0.08, wx, wy + wh / 2 + 0.035, wz + 0.04, fc),
      box(ww + 0.2, 0.06, 0.16, wx, wy - wh / 2 - 0.03, wz + 0.08, fc),
      box(0.07, wh, 0.08, wx - ww / 2 - 0.025, wy, wz + 0.04, fc),
      box(0.07, wh, 0.08, wx + ww / 2 + 0.025, wy, wz + 0.04, fc),
      box(0.04, wh, 0.05, wx, wy, wz + 0.03, fc),
      box(ww, 0.04, 0.05, wx, wy, wz + 0.03, fc),
    );
    // カーテン（ゆるい波の板）
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.42, 1.55, 8, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 30) * 0.025);
      g.computeVertexNormals();
      g.translate(wx + side * (ww / 2 + 0.24), wy - 0.12, wz + 0.1);
      parts.push(colored(g, '#ffe7a8'));
    }
    // ソファ（右奥）
    const sx = 2.2, sz = -1.3;
    parts.push(
      roundBox(1.5, 0.36, 0.8, 0.06, sx, 0.26, sz, '#8fd3c8'),
      roundBox(1.5, 0.55, 0.2, 0.06, sx, 0.62, sz - 0.32, '#86cbbf'),
      roundBox(0.2, 0.5, 0.8, 0.06, sx - 0.75, 0.38, sz, '#7fc4b8'),
      roundBox(0.2, 0.5, 0.8, 0.06, sx + 0.75, 0.38, sz, '#7fc4b8'),
      roundBox(0.38, 0.32, 0.12, 0.05, sx - 0.35, 0.58, sz - 0.18, '#ffc1d6'),
      box(0.06, 0.08, 0.06, sx - 0.65, 0.04, sz + 0.3, '#b98a62'),
      box(0.06, 0.08, 0.06, sx + 0.65, 0.04, sz + 0.3, '#b98a62'),
    );
    // 本棚（左奥）と本（色の帯だけ）
    const bx = -2.15, bz = -1.6, bw = 0.95, bh = 1.45, bd = 0.32;
    const wood = '#e9c79d';
    parts.push(
      box(bw, 0.03, bd, bx, bh, bz, wood),
      box(0.03, bh, bd, bx - bw / 2, bh / 2, bz, wood),
      box(0.03, bh, bd, bx + bw / 2, bh / 2, bz, wood),
      box(bw, bh, 0.02, bx, bh / 2, bz - bd / 2 + 0.01, '#f3dcbc'),
    );
    const bookColors = ['#ff8fab', '#ffd166', '#8ecae6', '#b8e0a0', '#cdb4db', '#ffb4a2', '#90dbf4'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let s = 0; s < 4; s++) {
      const y0 = 0.03 + s * 0.35;
      parts.push(box(bw, 0.025, bd, bx, y0, bz, wood));
      let x = bx - bw / 2 + 0.04;
      while (x < bx + bw / 2 - 0.08) {
        const tw = 0.035 + rnd() * 0.04, th = 0.2 + rnd() * 0.08;
        parts.push(box(tw, th, 0.22, x + tw / 2, y0 + 0.0125 + th / 2, bz + 0.02, bookColors[Math.floor(rnd() * bookColors.length)], (rnd() - 0.5) * 0.06));
        x += tw + 0.006;
      }
    }
    // 植木鉢（左手前）
    const px = -1.75, pz = -0.85;
    const pot = new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10);
    pot.translate(px, 0.15, pz);
    parts.push(colored(pot, '#f4a582'));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.IcosahedronGeometry(0.13, 0);
      leaf.scale(1, 1.4, 0.6);
      leaf.rotateY(a);
      leaf.translate(px + Math.cos(a) * 0.1, 0.48 + (i % 2) * 0.12, pz + Math.sin(a) * 0.1);
      parts.push(colored(leaf, i % 2 ? '#6cc070' : '#5bb065'));
    }
    const furniture = new THREE.Mesh(mergeAll(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    furniture.name = 'furniture';
    furniture.matrixAutoUpdate = false;
    group.add(furniture);

    // 窓の外（板ポリゴンの絵、512×256）
    const viewTex = tex.canvas('window-view', 512, 256, drawWindowView);
    const view = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: viewTex, toneMapped: false }));
    view.position.set(wx, wy, wz + 0.005);
    view.name = 'window-view';
    view.matrixAutoUpdate = false;
    view.updateMatrix();
    group.add(view);

    // 壁の絵（256×192、文字なし）
    const picTex = tex.canvas('wall-picture', 256, 192, drawPicture);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshLambertMaterial({ map: picTex }));
    pic.position.set(1.15, 1.45, ROOM.z0 + 0.012);
    pic.name = 'wall-picture';
    pic.matrixAutoUpdate = false;
    pic.updateMatrix();
    group.add(pic);
    const picFrame = new THREE.Mesh(mergeAll([
      box(0.64, 0.04, 0.025, 1.15, 1.68, ROOM.z0 + 0.012, '#f6b8c8'),
      box(0.64, 0.04, 0.025, 1.15, 1.22, ROOM.z0 + 0.012, '#f6b8c8'),
      box(0.04, 0.5, 0.025, 0.85, 1.45, ROOM.z0 + 0.012, '#f6b8c8'),
      box(0.04, 0.5, 0.025, 1.45, 1.45, ROOM.z0 + 0.012, '#f6b8c8'),
    ]), furniture.material);
    picFrame.matrixAutoUpdate = false;
    group.add(picFrame);

    // おもちゃ箱（右手前、写真風プラスチック 512²）
    const toyGeo = new A.RoundedBoxGeometry(0.55, 0.34, 0.38, 2, 0.03);
    const toy = new THREE.Mesh(toyGeo, new THREE.MeshLambertMaterial({ map: tex.get('plastic_pastel_512'), color: '#ffffff' }));
    toy.position.set(1.95, 0.17, 0.05);
    toy.rotation.y = -0.35;
    toy.name = 'toy-box';
    toy.matrixAutoUpdate = false;
    toy.updateMatrix();
    group.add(toy);
    const blocks = new THREE.Mesh(mergeAll([
      box(0.1, 0.1, 0.1, 1.72, 0.39, 0.12, '#ffd166', 0.3),
      box(0.1, 0.1, 0.1, 2.05, 0.39, 0.0, '#8ecae6', -0.2),
      box(0.1, 0.1, 0.1, 1.6, 0.05, 0.42, '#b8e0a0', 0.6),
    ]), furniture.material);
    blocks.matrixAutoUpdate = false;
    group.add(blocks);

    // 丸い疑似影（家具の下）
    const blobTex = tex.canvas('blob', 128, 128, drawBlob);
    const blobs = [[sx, sz, 1.8, 1.0], [bx, bz + 0.1, 1.15, 0.5], [px, pz, 0.55, 0.55], [1.95, 0.05, 0.75, 0.6]].map(([x, z, w, d]) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.006, z);
      return g;
    });
    const blobMesh = new THREE.Mesh(mergeAll(blobs), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    blobMesh.name = 'blob-shadows';
    blobMesh.renderOrder = 1;
    blobMesh.matrixAutoUpdate = false;
    group.add(blobMesh);

    group.traverse((o) => { if (o.isMesh) o.updateMatrix(); });
    scene.add(group);
    return group;
  }

  S.scene = { buildCore, buildExtras, ROOM };
})();
