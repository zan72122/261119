// Surrounding scenery (low-poly + 512² photo textures). Budget: ≤50k tris, target ≤10k.
// Everything far away is cheap: Lambert/Basic materials, instancing, no real shadows.
(function (C) {
  'use strict';

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grassCanvas() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); const r = rng(7);
    g.fillStyle = '#7dbb55'; g.fillRect(0, 0, 256, 256);
    const cols = ['#6aa846', '#8cc764', '#5f9b3f', '#9bd070', '#74b04e'];
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = cols[(r() * cols.length) | 0];
      const x = r() * 256, y = r() * 256;
      g.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
    }
    return c;
  }

  function blobCanvas() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 63);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return c;
  }

  function scaleUV(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }

  // Thick wall arc (inner face, top, outer face) with world-scaled UVs. Angles: three's convention (0 = +Z).
  function wallArc(THREE, rIn, rOut, h, a0, a1, segs, tile) {
    const pos = [], nrm = [], uv = [];
    function quad(p0, p1, p2, p3, n, uvs) { // p0..p3 CCW seen from the normal side
      const idx = [0, 1, 2, 0, 2, 3]; const P = [p0, p1, p2, p3];
      for (const k of idx) { pos.push(P[k][0], P[k][1], P[k][2]); nrm.push(n[0], n[1], n[2]); uv.push(uvs[k][0], uvs[k][1]); }
    }
    const rMid = (rIn + rOut) / 2;
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs, tm = (t0 + t1) / 2;
      const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
      const u0 = t0 * rMid / tile, u1 = t1 * rMid / tile, v1 = h / tile;
      const nx = Math.sin(tm), nz = Math.cos(tm);
      // outer (normal outward)
      quad([rOut * s0, 0, rOut * c0], [rOut * s1, 0, rOut * c1], [rOut * s1, h, rOut * c1], [rOut * s0, h, rOut * c0],
        [nx, 0, nz], [[u0, 0], [u1, 0], [u1, v1], [u0, v1]]);
      // inner (normal inward)
      quad([rIn * s1, 0, rIn * c1], [rIn * s0, 0, rIn * c0], [rIn * s0, h, rIn * c0], [rIn * s1, h, rIn * c1],
        [-nx, 0, -nz], [[u1, 0], [u0, 0], [u0, v1], [u1, v1]]);
      // top
      const w = (rOut - rIn) / tile;
      quad([rIn * s0, h, rIn * c0], [rOut * s0, h, rOut * c0], [rOut * s1, h, rOut * c1], [rIn * s1, h, rIn * c1],
        [0, 1, 0], [[u0, 0], [u0, w], [u1, w], [u1, 0]]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  }

  // Ring of low-poly hills, flat shaded, vertex coloured.
  function hillRing(THREE, rIn, rOut, segA, segR, hMax, seed, colLow, colHigh) {
    const r = rng(seed);
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    const pos = [];
    const H = (a, t) => { // t: 0 inner .. 1 outer
      const bump = Math.sin(Math.PI * t);
      const n = 0.55 + 0.25 * Math.sin(3 * a + ph[0]) + 0.15 * Math.sin(7 * a + ph[1]) + 0.1 * Math.sin(13 * a + ph[2]);
      return Math.max(0, hMax * bump * n * (0.85 + 0.3 * r()));
    };
    const grid = [];
    for (let j = 0; j <= segR; j++) {
      const row = [];
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * Math.PI * 2, t = j / segR;
        const rr = rIn + (rOut - rIn) * t + (j > 0 && j < segR ? (r() - 0.5) * 4 : 0);
        const y = (i === segA) ? null : H(a, t);
        row.push([rr * Math.sin(a), y, rr * Math.cos(a)]);
      }
      row[segA][1] = row[0][1]; row[segA][0] = row[0][0]; row[segA][2] = row[0][2];
      grid.push(row);
    }
    for (let j = 0; j < segR; j++) for (let i = 0; i < segA; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      pos.push(...a, ...d, ...c, ...a, ...c, ...b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals(); // non-indexed -> flat faces
    const col = new Float32Array(pos.length); const uvs = new Float32Array((pos.length / 3) * 2);
    const lo = new THREE.Color(colLow), hi = new THREE.Color(colHigh), tmp = new THREE.Color();
    for (let k = 0; k < pos.length / 3; k++) {
      const y = pos[k * 3 + 1];
      tmp.copy(lo).lerp(hi, Math.min(1, y / Math.max(hMax, 1e-3)));
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      uvs[k * 2] = pos[k * 3] / 6; uvs[k * 2 + 1] = pos[k * 3 + 2] / 6;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return geo;
  }

  C.buildEnvironment = function (THREE, scene, store, settings) {
    const group = new THREE.Group(); group.name = 'environment';
    const owned = []; // geometries/materials to dispose
    const own = (x) => { owned.push(x); return x; };
    const R = rng(1234);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    // --- light & air
    const SKY_TOP = new THREE.Color('#4b8ee0'), HORIZON = new THREE.Color('#cfe4f6');
    scene.background = SKY_TOP;
    scene.fog = new THREE.Fog(HORIZON, 45, 190);
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x6f9a52, 1.5);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
    sun.position.set(-6, 12, 9);
    group.add(hemi, sun);

    // --- sky: open cylinder with the cloud photo (mirrored repeat hides the seam)
    const skyTex = store.get('sky_clouds_512');
    skyTex.wrapS = THREE.MirroredRepeatWrapping; skyTex.wrapT = THREE.ClampToEdgeWrapping;
    const skyGeo = own(scaleUV(new THREE.CylinderGeometry(170, 170, 140, 24, 1, true), 4, 1));
    const skyMat = own(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    // drawn after the other opaque meshes: wherever the castle, wall or hills already wrote depth the sky's
    // pixels are rejected by the depth test instead of being shaded first and then overdrawn
    const sky = new THREE.Mesh(skyGeo, skyMat); sky.position.y = 62; sky.renderOrder = 10; sky.name = 'sky';
    group.add(sky);

    // --- meadow & hills
    const grassTex = store.addCanvas('grass_256', grassCanvas());
    const meadowGeo = own(new THREE.CircleGeometry(165, settings.ground));
    meadowGeo.rotateX(-Math.PI / 2); scaleUV(meadowGeo, 60, 60);
    const meadowMat = own(new THREE.MeshLambertMaterial({ map: grassTex }));
    const meadow = new THREE.Mesh(meadowGeo, meadowMat); meadow.position.y = -0.03; meadow.name = 'meadow';
    group.add(meadow);
    const hillMat = own(new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true, flatShading: true }));
    const hills1 = new THREE.Mesh(own(hillRing(THREE, 46, 100, 64, 4, 7, 11, '#8fd06a', '#62a84a')), hillMat);
    const farHillMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const hills2 = new THREE.Mesh(own(hillRing(THREE, 104, 155, 48, 3, 15, 23, '#8cbf86', '#86a9c4')), farHillMat);
    hills1.name = 'hills-near'; hills2.name = 'hills-far';
    group.add(hills1, hills2);

    // --- courtyard (cobblestone disc) + pseudo shadow under the castle
    const cobGeo = own(new THREE.CircleGeometry(8.5, 48)); cobGeo.rotateX(-Math.PI / 2); scaleUV(cobGeo, 6, 6);
    const cob = new THREE.Mesh(cobGeo, own(new THREE.MeshLambertMaterial({ map: store.get('cobblestone_512') })));
    cob.position.y = 0; cob.name = 'courtyard';
    const rimGeo = own(new THREE.RingGeometry(8.5, 8.9, 48)); rimGeo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, own(new THREE.MeshLambertMaterial({ color: 0xbfae8c })));
    rim.position.y = 0.005; rim.name = 'courtyard-rim';
    group.add(cob, rim);
    const blobTex = store.addCanvas('blob_128', blobCanvas(), { repeat: false, linear: true });
    const blobMat = own(new THREE.MeshBasicMaterial({ color: 0x1d2a1a, alphaMap: blobTex, transparent: true, opacity: 0.38,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const blobGeo = own(new THREE.PlaneGeometry(1, 1)); blobGeo.rotateX(-Math.PI / 2);
    const castleBlob = new THREE.Mesh(blobGeo, blobMat); castleBlob.scale.set(7.4, 1, 7.4); castleBlob.position.y = 0.012;
    castleBlob.renderOrder = 1; castleBlob.name = 'castle-blob';
    group.add(castleBlob);

    // --- curtain wall behind the castle (front arc left open toward the camera)
    const stone512 = store.get('stone_wall_512');
    const stoneMat = own(new THREE.MeshLambertMaterial({ map: stone512 }));
    const A0 = THREE.MathUtils.degToRad(68), A1 = THREE.MathUtils.degToRad(292);
    const wall = new THREE.Mesh(own(wallArc(THREE, 9.7, 10.3, 2.3, A0, A1, 40, 2.2)), stoneMat); wall.name = 'curtain-wall';
    group.add(wall);
    const merlonGeo = own(new THREE.BoxGeometry(0.62, 0.5, 0.7)); scaleUV(merlonGeo, 0.3, 0.25);
    const nMer = 34;
    const merlons = new THREE.InstancedMesh(merlonGeo, stoneMat, nMer); merlons.name = 'merlons';
    for (let i = 0; i < nMer; i++) {
      const a = A0 + (A1 - A0) * (i + 0.5) / nMer;
      v.set(10 * Math.sin(a), 2.3 + 0.25, 10 * Math.cos(a)); q.setFromAxisAngle(up, a);
      merlons.setMatrixAt(i, m4.compose(v, q, s));
    }
    group.add(merlons);

    // watch towers (instanced body / roof / pennant)
    const towerAngles = [68, 140, 220, 292].map((d) => THREE.MathUtils.degToRad(d));
    const bodyGeo = own(scaleUV(new THREE.CylinderGeometry(1.15, 1.25, 3.8, 14, 1, true), 3, 1.6)); bodyGeo.translate(0, 1.9, 0);
    const roofGeo = own(scaleUV(new THREE.ConeGeometry(1.55, 2.0, 14, 1, true), 2, 1)); roofGeo.translate(0, 3.8 + 1.0, 0);
    const roofMat = own(new THREE.MeshLambertMaterial({ map: store.get('roof_tiles_512'), color: 0xd98ca0 }));
    const penGeo = own(new THREE.BufferGeometry());
    penGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.9, -0.2, 0, 0, -0.4, 0], 3));
    penGeo.computeVertexNormals(); penGeo.translate(0, 6.15, 0);
    const poleGeo = own(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4)); poleGeo.translate(0, 5.8 + 0.0, 0);
    const penMat = own(new THREE.MeshLambertMaterial({ color: 0xff7eb6, side: THREE.DoubleSide }));
    const poleMat = own(new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    const bodies = new THREE.InstancedMesh(bodyGeo, stoneMat, 4);
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, 4);
    const pennants = new THREE.InstancedMesh(penGeo, penMat, 4);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, 4);
    bodies.name = 'watch-towers'; roofs.name = 'watch-roofs'; pennants.name = 'pennants'; poles.name = 'poles';
    const towerPos = towerAngles.map((a) => new THREE.Vector3(10 * Math.sin(a), 0, 10 * Math.cos(a)));
    towerPos.forEach((p, i) => {
      m4.compose(p, q.identity(), s);
      bodies.setMatrixAt(i, m4); roofs.setMatrixAt(i, m4); poles.setMatrixAt(i, m4); pennants.setMatrixAt(i, m4);
    });
    group.add(bodies, roofs, pennants, poles);

    // --- greenery: trees outside the wall, bushes & flowers inside (instanced)
    const decor = settings.decor;
    const foliageGeo = own(new THREE.IcosahedronGeometry(1, 1));
    const coneGeo = own(new THREE.ConeGeometry(1, 2.2, 8)); coneGeo.translate(0, 1.1, 0);
    const trunkGeo = own(new THREE.CylinderGeometry(0.16, 0.22, 1, 6)); trunkGeo.translate(0, 0.5, 0);
    const leafMat = own(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    const trunkMat = own(new THREE.MeshLambertMaterial({ color: 0x8b5a33 }));
    const nRound = Math.round(26 * decor), nCone = Math.round(22 * decor);
    const rounds = new THREE.InstancedMesh(foliageGeo, leafMat, nRound);
    const cones = new THREE.InstancedMesh(coneGeo, leafMat, nCone);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nRound + nCone);
    const treeBlobs = new THREE.InstancedMesh(blobGeo, blobMat, nRound + nCone);
    rounds.name = 'trees-round'; cones.name = 'trees-cone'; trunks.name = 'trunks'; treeBlobs.name = 'tree-blobs';
    const col = new THREE.Color();
    const leafCols = ['#5fae4a', '#4f9d43', '#76bd56', '#3f8a3c'];
    function treeSpot() { // outside the wall, mostly behind / at the sides, not in front of the camera
      const a = THREE.MathUtils.degToRad(45 + R() * 270), rr = 12.5 + R() * 24;
      return [rr * Math.sin(a), rr * Math.cos(a)];
    }
    let ti = 0;
    for (let i = 0; i < nRound + nCone; i++) {
      const [x, z] = treeSpot(); const sc = 0.8 + R() * 0.7; const isCone = i >= nRound;
      const trunkH = isCone ? 0.6 * sc : 1.2 * sc;
      v.set(x, 0, z); s.set(sc, trunkH, sc); trunks.setMatrixAt(ti, m4.compose(v, q.identity(), s));
      s.set(2.6 * sc, 1, 2.6 * sc); v.y = 0.02; treeBlobs.setMatrixAt(ti, m4.compose(v, q, s));
      col.set(leafCols[(R() * leafCols.length) | 0]);
      if (isCone) {
        v.set(x, trunkH, z); s.set(sc * 1.1, sc * 1.25, sc * 1.1);
        cones.setMatrixAt(i - nRound, m4.compose(v, q, s)); cones.setColorAt(i - nRound, col);
      } else {
        v.set(x, trunkH + sc * 0.9, z); s.set(sc * 1.3, sc * 1.15, sc * 1.3);
        rounds.setMatrixAt(i, m4.compose(v, q.setFromAxisAngle(up, R() * 6), s)); rounds.setColorAt(i, col);
      }
      ti++;
    }
    group.add(rounds, cones, trunks, treeBlobs);

    // low hedge + flowers in the open front arc and bushes around the courtyard edge (never inside r<4.5)
    const nBush = Math.round(30 * decor);
    const bushes = new THREE.InstancedMesh(foliageGeo, leafMat, nBush); bushes.name = 'bushes';
    for (let i = 0; i < nBush; i++) {
      const a = THREE.MathUtils.degToRad(-62 + 124 * (i + R() * 0.5) / nBush), rr = 9.35 + R() * 0.3;
      v.set(rr * Math.sin(a), 0.32, rr * Math.cos(a)); const sc = 0.5 + R() * 0.2; s.set(sc * 1.2, sc, sc * 1.2);
      bushes.setMatrixAt(i, m4.compose(v, q.setFromAxisAngle(up, R() * 6), s)); bushes.setColorAt(i, col.set(leafCols[i % 4]));
    }
    const flowerGeo = own(new THREE.OctahedronGeometry(0.11, 0));
    const flowerMat = own(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x332222 }));
    const nFlower = Math.round(140 * decor);
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, nFlower); flowers.name = 'flowers';
    const flowerCols = ['#ff86b8', '#ffd84d', '#ffffff', '#c58cff', '#ff9e5e'];
    for (let i = 0; i < nFlower; i++) {
      let x, z;
      if (i < nFlower * 0.55) { // along the hedge
        const a = THREE.MathUtils.degToRad(-64 + 128 * R()), rr = 8.95 + R() * 0.8; x = rr * Math.sin(a); z = rr * Math.cos(a);
      } else { // patches in the meadow
        const a = THREE.MathUtils.degToRad(-80 + 160 * R()), rr = 11 + R() * 9; x = rr * Math.sin(a); z = rr * Math.cos(a);
      }
      v.set(x, 0.62 * (i < nFlower * 0.55 ? 1 : 0.25) + R() * 0.08, z); s.setScalar(0.8 + R() * 0.6);
      flowers.setMatrixAt(i, m4.compose(v, q.identity(), s)); flowers.setColorAt(i, col.set(flowerCols[i % flowerCols.length]));
    }
    group.add(bushes, flowers);

    // static scenery: matrices never change
    group.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
    group.updateMatrixWorld(true);
    scene.add(group);

    let t = 0;
    return {
      group,
      sun, hemi,
      update(dt) {
        t += dt;
        skyTex.offset.x = (t * 0.0025) % 2; // very slow cloud drift
        // pennants sway gently (rotation only, cheap)
        for (let i = 0; i < 4; i++) {
          q.setFromAxisAngle(up, 0.5 * Math.sin(t * 1.3 + i * 1.7));
          pennants.setMatrixAt(i, m4.compose(towerPos[i], q, s.set(1, 1, 1)));
        }
        pennants.instanceMatrix.needsUpdate = true;
      },
      dispose() {
        scene.remove(group);
        owned.forEach((x) => x.dispose());
        [merlons, bodies, roofs, pennants, poles, rounds, cones, trunks, treeBlobs, bushes, flowers].forEach((m) => m.dispose());
      },
    };
  };
})(window.Castle = window.Castle || {});
