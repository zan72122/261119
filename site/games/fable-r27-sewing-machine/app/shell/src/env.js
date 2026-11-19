// 小さな環境マップ（PMREM）。金属の映り込み用。コンテキスト復帰時に作り直す。
export function createEnvironment(THREE, renderer, scene, size = 128) {
  let rt = null;
  function makeEnvScene() {
    const s = new THREE.Scene();
    // 内側を向いた球に上下のグラデーション（上：暖かい白、横：パステル、下：木の色）
    const geo = new THREE.SphereGeometry(5, 24, 12);
    const col = new Float32Array(geo.attributes.position.count * 3);
    const top = new THREE.Color(0xfffaf2), mid = new THREE.Color(0xf6dfe4), low = new THREE.Color(0xc89a6c), c = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const y = geo.attributes.position.getY(i) / 5; // -1..1
      if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.4)); else c.copy(mid).lerp(low, Math.min(1, -y * 2));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    s.add(new THREE.Mesh(geo, mat));
    // 窓と天井の明るい板
    const pg = new THREE.PlaneGeometry(1, 1);
    const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.1) });
    const win = new THREE.Mesh(pg, pm); win.scale.set(2.2, 1.6, 1); win.position.set(-1.5, 1.4, -3.5); win.lookAt(0, 0, 0); s.add(win);
    const lamp = new THREE.Mesh(pg, pm); lamp.scale.set(2.5, 2.5, 1); lamp.position.set(0.5, 4.5, 1.5); lamp.lookAt(0, 0, 0); s.add(lamp);
    return { s, dispose() { geo.dispose(); mat.dispose(); pg.dispose(); pm.dispose(); } };
  }
  function build() {
    if (rt) { rt.dispose(); rt = null; }
    const pm = new THREE.PMREMGenerator(renderer);
    const e = makeEnvScene();
    rt = pm.fromScene(e.s, 0.02, 0.1, 20, { size });
    pm.dispose(); e.dispose();
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.85;
  }
  build();
  return {
    rebuild: build,
    get renderTarget() { return rt; },
    dispose() { if (rt) rt.dispose(); rt = null; scene.environment = null; },
  };
}
