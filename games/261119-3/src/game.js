// PLACEHOLDER game: verifies the engine pipeline. Will be replaced by the real game.
import * as THREE from 'three';

export function startGame(engine) {
  const wood = new THREE.MeshStandardMaterial({ color: 0xc89a66, roughness: 0.55 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.35), wood);
  counter.position.set(0, -0.03, 0.075);
  counter.receiveShadow = true;
  engine.add(counter);

  const steel = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.18 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 48, 32), steel);
  ball.position.set(-0.2, 0.08, 0);
  ball.castShadow = ball.receiveShadow = true;
  engine.add(ball);

  const cream = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.6 });
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.075, 64), cream);
  box.position.set(0.18, 0.0375, -0.05);
  box.castShadow = box.receiveShadow = true;
  engine.add(box);

  const small = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd8222a, roughness: 0.4 }));
  small.position.set(0.02, 0.016, 0.22);
  small.castShadow = true;
  engine.add(small);

  // background (layer 1)
  const bg = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ color: 0xe8dccb, roughness: 0.9 }));
  wall.position.set(0, 1.2, -3.3);
  bg.add(wall);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.4), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.7 }));
  shelf.position.set(-1.2, 0.3, -3.0);
  bg.add(shelf);
  const papa = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 8, 24), new THREE.MeshStandardMaterial({ color: 0x3b5d8a, roughness: 0.8 }));
  papa.position.set(0, 0.2, -0.95);
  bg.add(papa);
  const colors = [0xffc070, 0xffe0a0, 0xff9a60];
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: colors[i % 3], emissiveIntensity: 6 }));
    lamp.position.set(-1.6 + i * 0.8, 0.45 + (i % 2) * 0.2, -3.1);
    bg.add(lamp);
  }
  const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 24), new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.5 }));
  ball2.position.set(1.0, 0.4, -2.2);
  bg.add(ball2);
  engine.addBg(bg);

  engine.setRoomLight(1, 0);
  window.__engine = engine; window.__THREE = THREE;
  engine.cam.goTo({ target: [0, 0.05, 0.05], pitch: 34, fitWidth: 1.2, fitHeight: 0.7 }, 0);

  engine.input.on('down', (p) => {
    const hit = p.onPlaneY(0);
    if (hit) small.position.set(hit.x, 0.016, hit.z);
  });
  engine.input.on('move', (p) => {
    const hit = p.onPlaneY(0);
    if (hit) small.position.set(hit.x, 0.016, hit.z);
  });
}
